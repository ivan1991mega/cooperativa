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
import inboxRoutes from './routes/inbox.js';
import { dopoCambioStato } from './hooks/dopoStato.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
});

app.set('io', io);
app.set('trust proxy', 1);

app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errore: 'Troppi tentativi, riprova tra qualche minuto' },
});

app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/prenotazioni', (req, res, next) => {
  if (req.method === 'PATCH' && /\/\d+\/stato$/.test(req.path)) {
    const orig = res.json.bind(res);
    res.json = (body) => {
      if (body && body.prenotazione && req.body && req.body.stato) {
        dopoCambioStato(body.prenotazione, req.body.stato).catch((e) =>
          console.error('Email stato:', e.message)
        );
      }
      return orig(body);
    };
  }
  next();
});

app.use('/api/prenotazioni', prenotazioniRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifiche', notificheRoutes);
app.use('/api/inbox', inboxRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

io.use((socket, next) => {
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
    socket.join(`user:${socket.user.id}`);
  }

  socket.on('entra-chat', (prenotazioneId) => {
    socket.join(`pren:${prenotazioneId}`);
  });
  socket.on('esci-chat', (prenotazioneId) => {
    socket.leave(`pren:${prenotazioneId}`);
  });
});

const PORT = process.env.PORT || 3000;

async function initDbConRetry(tentativi = 5) {
  for (let i = 1; i <= tentativi; i++) {
    try {
      await initDb();
      return true;
    } catch (err) {
      console.error(`Init DB tentativo ${i}/${tentativi} fallito:`, err.message);
      if (i < tentativi) {
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
      console.error('Database non raggiungibile dopo vari tentativi. Verifica DATABASE_URL su Railway.');
    }
  } else {
    console.warn('Avvio senza DATABASE_URL: collega un database PostgreSQL su Railway.');
  }

  httpServer.listen(PORT, () => {
    console.log(`Server Cooperativa Scout attivo sulla porta ${PORT}`);
  });
}

start();
