import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

import { verificaToken } from './middleware/auth.js';
import initDb from './config/initDb.js';
import authRoutes from './routes/auth.js';
import prenotazioniRoutes from './routes/prenotazioni.js';
import chatRoutes from './routes/chat.js';
import notificheRoutes from './routes/notifiche.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
});

// Rende io accessibile alle route
app.set('io', io);

// Railway (e in generale gli hosting) mettono l'app dietro un reverse proxy.
// Questo dice a Express di fidarsi dell'header X-Forwarded-For, così il
// rate-limiter identifica correttamente gli utenti e non va in errore.
app.set('trust proxy', 1);

// --- MIDDLEWARE ---
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

// Rate limiter sulle API di autenticazione (anti brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errore: 'Troppi tentativi, riprova tra qualche minuto' },
});

// --- API ROUTES ---
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/prenotazioni', prenotazioniRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifiche', notificheRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// --- FILE STATICI (frontend) ---
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback: qualsiasi rotta non-API restituisce index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// --- SOCKET.IO: autenticazione e stanze ---
io.use((socket, next) => {
  // Legge il token dal cookie o dall'auth handshake
  const cookieHeader = socket.handshake.headers.cookie || '';
  const cookieToken = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('token='))
    ?.slice(6);
  const token = socket.handshake.auth?.token || cookieToken;

  const payload = token ? verificaToken(token) : null;
  if (payload) {
    socket.user = payload;
  }
  next();
});

io.on('connection', (socket) => {
  if (socket.user) {
    // Stanza personale per notifiche dirette
    socket.join(`user:${socket.user.id}`);
  }

  // L'utente entra nella stanza chat di una prenotazione
  socket.on('entra-chat', (prenotazioneId) => {
    socket.join(`pren:${prenotazioneId}`);
  });
  socket.on('esci-chat', (prenotazioneId) => {
    socket.leave(`pren:${prenotazioneId}`);
  });
});

// --- AVVIO ---
const PORT = process.env.PORT || 3000;

async function initDbConRetry(tentativi = 5) {
  for (let i = 1; i <= tentativi; i++) {
    try {
      await initDb();
      return true;
    } catch (err) {
      console.error(`Init DB tentativo ${i}/${tentativi} fallito:`, err.message);
      if (i < tentativi) {
        // Attesa crescente: il database su Railway a volte impiega
        // qualche secondo in più dell'app a diventare raggiungibile.
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  return false;
}

async function start() {
  if (process.env.DATABASE_URL) {
    const ok = await initDbConRetry();
    if (!ok) {
      console.error('❌ Database non raggiungibile dopo vari tentativi. ' +
        'Verifica che DATABASE_URL sia collegata al servizio su Railway.');
    }
  } else {
    console.warn('⚠️  Avvio senza DATABASE_URL: collega un database PostgreSQL ' +
      'e aggiungi la variabile DATABASE_URL (Add Reference) al servizio su Railway.');
  }

  httpServer.listen(PORT, () => {
    console.log(`🏕️  Server Cooperativa Scout attivo sulla porta ${PORT}`);
  });
}

start();
