import express from 'express';
import { pool } from '../config/db.js';
import { richiediAuth, richiediAdmin } from '../middleware/auth.js';
import { parseRichiestaEmail } from '../config/parseRichiestaEmail.js';
import { imapConfigurato, scaricaEmailRecenti } from '../config/gmailInbox.js';
import { isMailRichiestaCampo } from '../config/filtroMail.js';
import { isRichiestaPassata, oggiISO } from '../config/dateInbox.js';

const router = express.Router();
router.use(richiediAuth, richiediAdmin);

router.get('/stato', async (_req, res) => {
  res.json({ imap: imapConfigurato(), oggi: oggiISO() });
});

router.get('/', async (req, res) => {
  const periodo = req.query.periodo || 'future';
  let where = "WHERE r.stato = 'bozza'";
  if (periodo === 'passate') {
    where += ' AND r.data_partenza IS NOT NULL AND r.data_partenza < CURRENT_DATE';
  } else if (periodo === 'tutte') {
    where = "WHERE r.stato NOT IN ('scartata')";
  } else {
    where += ' AND (r.data_partenza IS NULL OR r.data_partenza >= CURRENT_DATE)';
  }
  const result = await pool.query(
    `SELECT r.*, l.nome AS location_nome
     FROM richieste_email r
     LEFT JOIN locations l ON l.id = r.location_id
     ${where}
     ORDER BY COALESCE(r.data_arrivo, r.ricevuta_il::date) ASC, r.id ASC`
  );
  res.json({ richieste: result.rows, imap: imapConfigurato(), oggi: oggiISO(), periodo });
});

router.get('/:id', async (req, res) => {
  if (req.params.id === 'stato') return res.json({ imap: imapConfigurato() });
  const result = await pool.query(
    `SELECT r.*, l.nome AS location_nome FROM richieste_email r
     LEFT JOIN locations l ON l.id = r.location_id WHERE r.id = $1`,
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ errore: 'Richiesta non trovata' });
  res.json({ richiesta: result.rows[0] });
});

async function locations() {
  const r = await pool.query('SELECT id, nome FROM locations ORDER BY ordine');
  return r.rows;
}

async function upsertEmail(msg, locs) {
  if (!isMailRichiestaCampo(msg)) {
    return { id: null, nuova: false, saltata: true };
  }
  const parsed = parseRichiestaEmail(msg, locs);
  if (isRichiestaPassata(parsed)) {
    return { id: null, nuova: false, saltata: true, motivo: 'passata' };
  }
  const exists = await pool.query('SELECT id FROM richieste_email WHERE message_id = $1', [msg.message_id]);
  if (exists.rows[0]) return { id: exists.rows[0].id, nuova: false };
  const ins = await pool.query(
    `INSERT INTO richieste_email
      (message_id, oggetto, mittente, corpo, titolo,
       data_arrivo, data_partenza, location_id, gruppo_scout,
       referente_nome, referente_contatto, numero_persone, tipologia_unita,
       stato, ricevuta_il)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'bozza',$14)
     RETURNING id`,
    [msg.message_id, msg.subject, msg.from_addr, msg.text, parsed.titolo,
     parsed.data_arrivo, parsed.data_partenza, parsed.location_id, parsed.gruppo_scout,
     parsed.referente_nome, parsed.referente_contatto, parsed.numero_persone,
     parsed.tipologia_unita, msg.date || new Date()]
  );
  return { id: ins.rows[0].id, nuova: true, parsed };
}

router.post('/sync', async (req, res) => {
  try {
    const locs = await locations();
    const mail = await scaricaEmailRecenti({ giorni: Number(req.body?.giorni || 45), limite: Number(req.body?.limite || 80) });
    let nuove = 0, saltate = 0;
    for (const m of mail) {
      const r = await upsertEmail(m, locs);
      if (r.saltata) saltate += 1;
      else if (r.nuova) nuove += 1;
    }
    res.json({ ok: true, esaminate: mail.length, nuove, saltate });
  } catch (err) {
    console.error('Sync inbox:', err);
    res.status(500).json({ errore: err.message || 'Sync fallita' });
  }
});

router.post('/pulisci', async (_req, res) => {
  const rows = await pool.query(`SELECT * FROM richieste_email WHERE stato = 'bozza'`);
  let n = 0;
  for (const r of rows.rows) {
    const ok = isMailRichiestaCampo({ subject: r.oggetto, from_addr: r.mittente, text: r.corpo });
    const passata = isRichiestaPassata(r);
    if (!ok || passata) {
      await pool.query(`UPDATE richieste_email SET stato = 'scartata', aggiornata_il = NOW() WHERE id = $1`, [r.id]);
      n += 1;
    }
  }
  res.json({ ok: true, scartate: n });
});

router.post('/incolla', async (req, res) => {
  const { oggetto, mittente, corpo } = req.body || {};
  if (!corpo || !String(corpo).trim()) return res.status(400).json({ errore: 'Incolla il testo della mail' });
  const locs = await locations();
  const msg = {
    message_id: `incolla-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    subject: oggetto || 'Mail incollata',
    from_addr: mittente || '',
    text: corpo,
    date: new Date(),
  };
  const r = await upsertEmail(msg, locs);
  if (r.saltata) {
    return res.status(400).json({ errore: r.motivo === 'passata'
      ? 'Date già passate: non va in coda'
      : 'Questa mail non sembra una richiesta di campo' });
  }
  const row = await pool.query('SELECT * FROM richieste_email WHERE id = $1', [r.id]);
  res.status(201).json({ richiesta: row.rows[0], parsed: r.parsed });
});

router.patch('/:id', async (req, res) => {
  const campi = ['titolo','data_arrivo','data_partenza','location_id','gruppo_scout','referente_nome','referente_contatto','numero_persone','tipologia_unita','nota'];
  const sets = []; const vals = [];
  for (const c of campi) {
    if (req.body[c] !== undefined) {
      vals.push(req.body[c] === '' ? null : req.body[c]);
      sets.push(`${c} = $${vals.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ errore: 'Niente da aggiornare' });
  vals.push(req.params.id);
  const result = await pool.query(`UPDATE richieste_email SET ${sets.join(', ')}, aggiornata_il = NOW() WHERE id = $${vals.length} RETURNING *`, vals);
  if (!result.rows[0]) return res.status(404).json({ errore: 'Richiesta non trovata' });
  res.json({ richiesta: result.rows[0] });
});

router.post('/:id/processa', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT * FROM richieste_email WHERE id = $1 FOR UPDATE', [req.params.id]);
    const r = cur.rows[0];
    if (!r) { await client.query('ROLLBACK'); return res.status(404).json({ errore: 'Richiesta non trovata' }); }
    if (r.stato === 'processata') { await client.query('ROLLBACK'); return res.status(400).json({ errore: 'Già processata' }); }
    if (!r.data_arrivo || !r.data_partenza) { await client.query('ROLLBACK'); return res.status(400).json({ errore: 'Servono data arrivo e partenza prima di processare' }); }
    if (!r.location_id) { await client.query('ROLLBACK'); return res.status(400).json({ errore: 'Scegli una location prima di processare' }); }
    if (isRichiestaPassata(r)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ errore: 'Periodo già passato: non si processa nel calendario ufficiale. Scartala o cambiane le date.' });
    }
    const nota = r.nota || r.corpo || r.oggetto || 'Importata da email';
    const pren = await client.query(
      `INSERT INTO prenotazioni
        (user_id, location_id, data_arrivo, data_partenza, nota, numero_persone,
         tipologia_unita, gruppo_scout, referente_nome, referente_contatto,
         stato, creata_da_admin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ricevuta', TRUE) RETURNING *`,
      [req.user.id, r.location_id, r.data_arrivo, r.data_partenza, String(nota).slice(0,4000),
       r.numero_persone || 0, r.tipologia_unita || 'ALTRO', r.gruppo_scout,
       r.referente_nome || r.titolo, r.referente_contatto]
    );
    await client.query(`UPDATE richieste_email SET stato = 'processata', prenotazione_id = $1, aggiornata_il = NOW() WHERE id = $2`, [pren.rows[0].id, r.id]);
    await client.query('COMMIT');
    res.json({ ok: true, prenotazione: pren.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Processa inbox:', err);
    res.status(500).json({ errore: 'Errore del server' });
  } finally {
    client.release();
  }
});

router.post('/:id/scarta', async (req, res) => {
  const result = await pool.query(`UPDATE richieste_email SET stato = 'scartata', aggiornata_il = NOW() WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ errore: 'Richiesta non trovata' });
  res.json({ ok: true });
});

export default router;
