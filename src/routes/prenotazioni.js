import express from 'express';
import { pool } from '../config/db.js';
import { richiediAuth, richiediAdmin } from '../middleware/auth.js';
import { nomiInConflitto } from '../config/locationLogic.js';
import {
  sendMail,
  templateRicezione,
  templateNuovaRichiestaAdmin,
} from '../config/mailer.js';

const router = express.Router();

const TIPOLOGIE = ['lupetti/coccinelle', 'esploratori/guide', 'clan/fuoco', 'ALTRO'];

/**
 * Restituisce l'oggetto io di Socket.io, se disponibile sull'app.
 */
function getIo(req) {
  return req.app.get('io');
}

/**
 * Calcola le prenotazioni CONFERMATE che si sovrappongono a una richiesta,
 * tenendo conto della logica di conflitto Avinal.
 */
async function trovaConflitti({ locationNome, dataArrivo, dataPartenza, escludiId }) {
  const nomi = nomiInConflitto(locationNome);
  const params = [nomi, dataArrivo, dataPartenza];
  let sql = `
    SELECT p.id, p.data_arrivo, p.data_partenza, p.stato, p.referente_nome,
           l.nome AS location_nome
    FROM prenotazioni p
    JOIN locations l ON l.id = p.location_id
    WHERE l.nome = ANY($1)
      AND p.stato IN ('confermata', 'in_lavorazione')
      AND p.data_arrivo <= $3
      AND p.data_partenza >= $2
  `;
  if (escludiId) {
    params.push(escludiId);
    sql += ` AND p.id <> $${params.length}`;
  }
  const result = await pool.query(sql, params);
  return result.rows;
}

// --- ELENCO LOCATION (pubblico per utenti loggati) ---
router.get('/locations', richiediAuth, async (req, res) => {
  const result = await pool.query('SELECT id, nome FROM locations ORDER BY ordine');
  res.json({ locations: result.rows });
});

// --- CREAZIONE PRENOTAZIONE (utente) ---
router.post('/', richiediAuth, async (req, res) => {
  const {
    location_id,
    data_arrivo,
    ora_arrivo,
    data_partenza,
    ora_partenza,
    nota,
    numero_persone,
    tipologia_unita,
    referente_nome,
    referente_contatto,
    provenienza_paese,
    provenienza_cap,
    trasbordo,
    trasbordo_giorni,
  } = req.body;

  // Validazioni
  if (!location_id || !data_arrivo || !data_partenza || !nota || !tipologia_unita) {
    return res.status(400).json({
      errore: 'Location, date, nota e tipologia unità sono obbligatorie',
    });
  }
  if (!nota.trim()) {
    return res.status(400).json({ errore: 'La nota è obbligatoria' });
  }
  if (data_partenza < data_arrivo) {
    return res.status(400).json({ errore: 'La data di partenza precede l\'arrivo' });
  }
  if (!TIPOLOGIE.includes(tipologia_unita)) {
    return res.status(400).json({ errore: 'Tipologia unità non valida' });
  }

  try {
    const loc = await pool.query('SELECT nome FROM locations WHERE id = $1', [location_id]);
    if (loc.rows.length === 0) {
      return res.status(400).json({ errore: 'Location inesistente' });
    }
    const locationNome = loc.rows[0].nome;

    const result = await pool.query(
      `INSERT INTO prenotazioni
        (user_id, location_id, data_arrivo, ora_arrivo, data_partenza, ora_partenza,
         nota, numero_persone, tipologia_unita, referente_nome, referente_contatto,
         provenienza_paese, provenienza_cap, trasbordo, trasbordo_giorni, stato)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'ricevuta')
       RETURNING *`,
      [
        req.user.id, location_id, data_arrivo, ora_arrivo || null, data_partenza,
        ora_partenza || null, nota.trim(), numero_persone || 0, tipologia_unita,
        referente_nome || null, referente_contatto || null, provenienza_paese || null,
        provenienza_cap || null, !!trasbordo, trasbordo ? (trasbordo_giorni || 0) : 0,
      ]
    );
    const pren = result.rows[0];

    // Segnala eventuali conflitti (non blocca, solo informa)
    const conflitti = await trovaConflitti({
      locationNome,
      dataArrivo: data_arrivo,
      dataPartenza: data_partenza,
      escludiId: pren.id,
    });

    // Notifica live agli admin + notifica salvata
    const io = getIo(req);
    const admins = await pool.query("SELECT id, email FROM users WHERE ruolo = 'admin'");
    for (const admin of admins.rows) {
      await pool.query(
        `INSERT INTO notifiche (user_id, testo, link)
         VALUES ($1, $2, $3)`,
        [admin.id, `Nuova richiesta: ${locationNome} (${data_arrivo})`, `/admin`]
      );
      if (io) io.to(`user:${admin.id}`).emit('notifica', {
        testo: `Nuova richiesta: ${locationNome}`,
      });
    }

    // Email: ricezione all'utente + avviso all'admin
    const datiEmail = { ...pren, referente_nome: referente_nome || req.user.nome };
    const tpl = templateRicezione(datiEmail, locationNome);
    sendMail({ to: req.user.email, ...tpl });

    if (admins.rows[0]) {
      const tplAdmin = templateNuovaRichiestaAdmin(datiEmail, locationNome, req.user.email);
      sendMail({ to: admins.rows[0].email, ...tplAdmin });
    }

    res.status(201).json({
      prenotazione: pren,
      conflitti: conflitti.length > 0 ? conflitti : null,
    });
  } catch (err) {
    console.error('Errore creazione prenotazione:', err);
    res.status(500).json({ errore: 'Errore del server' });
  }
});

// --- LE MIE PRENOTAZIONI (utente) ---
router.get('/mie', richiediAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, l.nome AS location_nome
     FROM prenotazioni p
     JOIN locations l ON l.id = p.location_id
     WHERE p.user_id = $1
     ORDER BY p.data_arrivo DESC`,
    [req.user.id]
  );
  res.json({ prenotazioni: result.rows });
});

// --- TUTTE LE PRENOTAZIONI (admin, per calendario) ---
router.get('/tutte', richiediAuth, richiediAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, l.nome AS location_nome, u.nome AS utente_nome, u.email AS utente_email
     FROM prenotazioni p
     JOIN locations l ON l.id = p.location_id
     LEFT JOIN users u ON u.id = p.user_id
     ORDER BY p.data_arrivo`
  );
  res.json({ prenotazioni: result.rows });
});

// --- DETTAGLIO PRENOTAZIONE ---
router.get('/:id', richiediAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, l.nome AS location_nome, u.nome AS utente_nome, u.email AS utente_email
     FROM prenotazioni p
     JOIN locations l ON l.id = p.location_id
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ errore: 'Prenotazione non trovata' });
  }
  const pren = result.rows[0];
  // Un utente può vedere solo le proprie; l'admin tutte.
  if (req.user.ruolo !== 'admin' && pren.user_id !== req.user.id) {
    return res.status(403).json({ errore: 'Non autorizzato' });
  }

  // Aggiungi conflitti per l'admin
  let conflitti = null;
  if (req.user.ruolo === 'admin') {
    conflitti = await trovaConflitti({
      locationNome: pren.location_nome,
      dataArrivo: pren.data_arrivo.toISOString().slice(0, 10),
      dataPartenza: pren.data_partenza.toISOString().slice(0, 10),
      escludiId: pren.id,
    });
  }
  res.json({ prenotazione: pren, conflitti });
});

// --- CAMBIO STATO (admin) ---
router.patch('/:id/stato', richiediAuth, richiediAdmin, async (req, res) => {
  const { stato } = req.body;
  const validi = ['ricevuta', 'in_lavorazione', 'confermata', 'rifiutata'];
  if (!validi.includes(stato)) {
    return res.status(400).json({ errore: 'Stato non valido' });
  }

  try {
    const result = await pool.query(
      `UPDATE prenotazioni SET stato = $1, aggiornata_il = NOW()
       WHERE id = $2 RETURNING *`,
      [stato, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ errore: 'Prenotazione non trovata' });
    }
    const pren = result.rows[0];

    // Notifica all'utente
    if (pren.user_id) {
      const etichette = {
        in_lavorazione: 'è in lavorazione',
        confermata: 'è stata CONFERMATA ✅',
        rifiutata: 'è stata rifiutata',
        ricevuta: 'è stata ricevuta',
      };
      const testo = `La tua prenotazione ${etichette[stato] || stato}`;
      await pool.query(
        `INSERT INTO notifiche (user_id, testo, link) VALUES ($1, $2, $3)`,
        [pren.user_id, testo, `/prenotazione/${pren.id}`]
      );
      const io = getIo(req);
      if (io) io.to(`user:${pren.user_id}`).emit('notifica', { testo });
    }

    res.json({ prenotazione: pren });
  } catch (err) {
    console.error('Errore cambio stato:', err);
    res.status(500).json({ errore: 'Errore del server' });
  }
});

// --- CREAZIONE PRENOTAZIONE DA ADMIN (blocco periodo) ---
router.post('/admin', richiediAuth, richiediAdmin, async (req, res) => {
  const {
    location_id, data_arrivo, data_partenza, nota, numero_persone,
    tipologia_unita, referente_nome, ora_arrivo, ora_partenza,
  } = req.body;

  if (!location_id || !data_arrivo || !data_partenza) {
    return res.status(400).json({ errore: 'Location e date obbligatorie' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO prenotazioni
        (user_id, location_id, data_arrivo, ora_arrivo, data_partenza, ora_partenza,
         nota, numero_persone, tipologia_unita, referente_nome, stato, creata_da_admin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confermata',TRUE)
       RETURNING *`,
      [
        req.user.id, location_id, data_arrivo, ora_arrivo || null, data_partenza,
        ora_partenza || null, nota || 'Periodo bloccato dall\'amministrazione',
        numero_persone || 0, tipologia_unita || 'ALTRO', referente_nome || 'Amministrazione',
      ]
    );
    res.status(201).json({ prenotazione: result.rows[0] });
  } catch (err) {
    console.error('Errore creazione admin:', err);
    res.status(500).json({ errore: 'Errore del server' });
  }
});

export default router;
