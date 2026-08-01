import express from 'express';
import { pool } from '../config/db.js';
import { richiediAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * Verifica che l'utente possa accedere alla chat di una prenotazione:
 * o è l'admin, o è il proprietario della prenotazione.
 */
async function puoAccedere(prenotazioneId, user) {
  const result = await pool.query(
    'SELECT user_id FROM prenotazioni WHERE id = $1',
    [prenotazioneId]
  );
  if (result.rows.length === 0) return false;
  if (user.ruolo === 'admin') return true;
  return result.rows[0].user_id === user.id;
}

// --- ELENCO MESSAGGI DI UNA PRENOTAZIONE ---
router.get('/:prenotazioneId', richiediAuth, async (req, res) => {
  const { prenotazioneId } = req.params;
  if (!(await puoAccedere(prenotazioneId, req.user))) {
    return res.status(403).json({ errore: 'Non autorizzato' });
  }

  const result = await pool.query(
    `SELECT m.*, u.nome AS mittente_nome
     FROM messaggi m
     LEFT JOIN users u ON u.id = m.mittente_id
     WHERE m.prenotazione_id = $1
     ORDER BY m.creato_il ASC`,
    [prenotazioneId]
  );

  // Segna come letti i messaggi ricevuti dall'altro ruolo
  await pool.query(
    `UPDATE messaggi SET letto = TRUE
     WHERE prenotazione_id = $1 AND mittente_ruolo <> $2`,
    [prenotazioneId, req.user.ruolo]
  );

  res.json({ messaggi: result.rows });
});

// --- INVIO MESSAGGIO ---
router.post('/:prenotazioneId', richiediAuth, async (req, res) => {
  const { prenotazioneId } = req.params;
  const { testo } = req.body;

  if (!testo || !testo.trim()) {
    return res.status(400).json({ errore: 'Messaggio vuoto' });
  }
  if (!(await puoAccedere(prenotazioneId, req.user))) {
    return res.status(403).json({ errore: 'Non autorizzato' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO messaggi (prenotazione_id, mittente_id, mittente_ruolo, testo)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [prenotazioneId, req.user.id, req.user.ruolo, testo.trim()]
    );
    const msg = { ...result.rows[0], mittente_nome: req.user.nome };

    // Chi deve ricevere la notifica live?
    const pren = await pool.query(
      'SELECT user_id FROM prenotazioni WHERE id = $1',
      [prenotazioneId]
    );
    const io = req.app.get('io');

    // Emetti il messaggio nella "stanza" della prenotazione
    if (io) io.to(`pren:${prenotazioneId}`).emit('messaggio', msg);

    // Notifica al destinatario (l'altro ruolo)
    if (req.user.ruolo === 'admin') {
      // notifica all'utente proprietario
      const destId = pren.rows[0]?.user_id;
      if (destId) {
        await pool.query(
          `INSERT INTO notifiche (user_id, testo, link) VALUES ($1, $2, $3)`,
          [destId, 'Nuovo messaggio dall\'amministrazione', `/prenotazione/${prenotazioneId}`]
        );
        if (io) io.to(`user:${destId}`).emit('notifica', {
          testo: 'Nuovo messaggio dall\'amministrazione',
        });
      }
    } else {
      // notifica a tutti gli admin
      const admins = await pool.query("SELECT id FROM users WHERE ruolo = 'admin'");
      for (const admin of admins.rows) {
        await pool.query(
          `INSERT INTO notifiche (user_id, testo, link) VALUES ($1, $2, $3)`,
          [admin.id, `Nuovo messaggio (richiesta #${prenotazioneId})`, `/admin`]
        );
        if (io) io.to(`user:${admin.id}`).emit('notifica', {
          testo: `Nuovo messaggio da ${req.user.nome}`,
        });
      }
    }

    res.status(201).json({ messaggio: msg });
  } catch (err) {
    console.error('Errore invio messaggio:', err);
    res.status(500).json({ errore: 'Errore del server' });
  }
});

export default router;
