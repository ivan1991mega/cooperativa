import express from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { generaToken, richiediAuth } from '../middleware/auth.js';

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 giorni
};

// --- REGISTRAZIONE ---
router.post('/registrazione', async (req, res) => {
  const { nome, email, password } = req.body;

  if (!nome || !email || !password) {
    return res.status(400).json({ errore: 'Nome, email e password sono obbligatori' });
  }
  if (password.length < 6) {
    return res.status(400).json({ errore: 'La password deve avere almeno 6 caratteri' });
  }

  try {
    const esiste = await pool.query('SELECT id FROM users WHERE email = $1', [
      email.toLowerCase().trim(),
    ]);
    if (esiste.rows.length > 0) {
      return res.status(409).json({ errore: 'Email già registrata' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (nome, email, password_hash, ruolo)
       VALUES ($1, $2, $3, 'utente')
       RETURNING id, nome, email, ruolo`,
      [nome.trim(), email.toLowerCase().trim(), hash]
    );

    const user = result.rows[0];
    const token = generaToken(user);
    res.cookie('token', token, COOKIE_OPTS);
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Errore registrazione:', err);
    res.status(500).json({ errore: 'Errore del server' });
  }
});

// --- LOGIN ---
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ errore: 'Email e password obbligatorie' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [
      email.toLowerCase().trim(),
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({ errore: 'Credenziali non valide' });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ errore: 'Credenziali non valide' });
    }

    const token = generaToken(user);
    res.cookie('token', token, COOKIE_OPTS);
    res.json({
      user: { id: user.id, nome: user.nome, email: user.email, ruolo: user.ruolo },
      token,
    });
  } catch (err) {
    console.error('Errore login:', err);
    res.status(500).json({ errore: 'Errore del server' });
  }
});

// --- LOGOUT ---
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// --- PROFILO CORRENTE ---
router.get('/me', richiediAuth, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
