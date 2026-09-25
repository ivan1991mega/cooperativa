import express from 'express';
import { pool } from '../config/db.js';
import { richiediAuth, richiediAdmin } from '../middleware/auth.js';
import { sendMail } from '../config/mailer.js';
import { emailDestinatario } from '../config/invioConferma.js';

const router = express.Router();
router.use(richiediAuth, richiediAdmin);

function fmt(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  const [y, m, g] = s.split('-');
  if (!g) return s;
  return `${g}/${m}/${y}`;
}

export function bozzaTesto({ nome, location, arrivo, partenza, gruppo, tipo }) {
  const chi = nome || 'ciao';
  const loc = location || 'il campo';
  const date = arrivo ? `dal ${fmt(arrivo)} al ${fmt(partenza)}` : '';
  if (tipo === 'rifiuto') {
    return {
      oggetto: `Riscontro richiesta — ${loc}`,
      testo: `Ciao ${chi},\n\nTi scriviamo riguardo la richiesta per ${loc} ${date}.\nIn questo momento non riusciamo a confermare il periodo. Se vuoi altre date, rispondi a questa mail.\n\nBuona strada\nCooperativa Scout San Giorgio`,
    };
  }
  return {
    oggetto: `Prenotazione confermata — ${loc} ${date}`.trim(),
    testo: `Ciao ${chi},\n\nTi confermiamo la prenotazione presso la Cooperativa Scout San Giorgio.\n\nLuogo: ${loc}\nPeriodo: ${date}\n${gruppo ? 'Gruppo: ' + gruppo : ''}\n\nPer comunicazioni rispondi a questa mail.\n\nBuona strada\nCooperativa Scout San Giorgio`,
  };
}

router.get('/bozza/inbox/:id', async (req, res) => {
  const r = await pool.query(
    `SELECT r.*, l.nome AS location_nome FROM richieste_email r
     LEFT JOIN locations l ON l.id = r.location_id WHERE r.id = $1`,
    [req.params.id]
  );
  if (!r.rows[0]) return res.status(404).json({ errore: 'Non trovata' });
  const row = r.rows[0];
  const to = emailDestinatario(row.referente_contatto, row.mittente, row.corpo);
  res.json({ to, ...bozzaTesto({ nome: row.referente_nome || row.titolo, location: row.location_nome, arrivo: row.data_arrivo, partenza: row.data_partenza, gruppo: row.gruppo_scout, tipo: req.query.tipo }) });
});

router.get('/bozza/prenotazione/:id', async (req, res) => {
  const r = await pool.query(
    `SELECT p.*, l.nome AS location_nome, u.email AS utente_email
     FROM prenotazioni p JOIN locations l ON l.id = p.location_id
     LEFT JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
    [req.params.id]
  );
  if (!r.rows[0]) return res.status(404).json({ errore: 'Non trovata' });
  const row = r.rows[0];
  const to = emailDestinatario(row.referente_contatto, row.utente_email);
  res.json({ to, ...bozzaTesto({ nome: row.referente_nome, location: row.location_nome, arrivo: row.data_arrivo, partenza: row.data_partenza, gruppo: row.gruppo_scout, tipo: req.query.tipo }) });
});

router.post('/invia', async (req, res) => {
  const { to, oggetto, testo } = req.body || {};
  if (!to || !/^[\w.+\-]+@[\w.\-]+\.[a-z]{2,}$/i.test(String(to).trim())) {
    return res.status(400).json({ errore: 'Indirizzo email mancante o non valido' });
  }
  if (!oggetto || !testo) return res.status(400).json({ errore: 'Oggetto e testo sono obbligatori' });
  const html = `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${String(testo)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`;
  const info = await sendMail({ to: String(to).trim(), subject: oggetto, text: testo, html });
  if (info && info.error) return res.status(500).json({ errore: info.error });
  res.json({ ok: true, to, simulated: !!(info && info.simulated) });
});

export default router;
