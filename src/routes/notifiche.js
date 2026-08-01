import express from 'express';
import { pool } from '../config/db.js';
import { richiediAuth } from '../middleware/auth.js';

const router = express.Router();

// --- ELENCO NOTIFICHE DELL'UTENTE ---
router.get('/', richiediAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM notifiche WHERE user_id = $1
     ORDER BY creata_il DESC LIMIT 50`,
    [req.user.id]
  );
  const nonLette = result.rows.filter((n) => !n.letta).length;
  res.json({ notifiche: result.rows, nonLette });
});

// --- SEGNA TUTTE COME LETTE ---
router.post('/segna-lette', richiediAuth, async (req, res) => {
  await pool.query(
    'UPDATE notifiche SET letta = TRUE WHERE user_id = $1',
    [req.user.id]
  );
  res.json({ ok: true });
});

export default router;
