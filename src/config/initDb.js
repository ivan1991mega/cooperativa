import { pool } from './db.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Crea tutte le tabelle necessarie se non esistono già.
 * Idempotente: può essere eseguito più volte senza problemi.
 */
async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- UTENTI ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        nome          VARCHAR(120) NOT NULL,
        email         VARCHAR(180) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        ruolo         VARCHAR(20)  NOT NULL DEFAULT 'utente', -- 'utente' | 'admin'
        creato_il     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    // --- LOCATION ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id     SERIAL PRIMARY KEY,
        nome   VARCHAR(80) UNIQUE NOT NULL,
        ordine INT NOT NULL DEFAULT 0
      );
    `);

    // Popola le location fisse (solo se la tabella è vuota).
    const locCount = await client.query('SELECT COUNT(*) FROM locations');
    if (parseInt(locCount.rows[0].count, 10) === 0) {
      const locations = [
        'Avinal Casa',
        'Avinal Basso',
        'Avinal Alto',
        'Avinal Tutto',
        'Ospitale di Cadore',
        'Col Pigner',
      ];
      for (let i = 0; i < locations.length; i++) {
        await client.query(
          'INSERT INTO locations (nome, ordine) VALUES ($1, $2)',
          [locations[i], i]
        );
      }
    }

    // --- PRENOTAZIONI ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS prenotazioni (
        id                SERIAL PRIMARY KEY,
        user_id           INT REFERENCES users(id) ON DELETE SET NULL,
        location_id       INT NOT NULL REFERENCES locations(id),
        data_arrivo       DATE NOT NULL,
        ora_arrivo        VARCHAR(20),          -- es. "mattina", "15:00"
        data_partenza     DATE NOT NULL,
        ora_partenza      VARCHAR(20),
        nota              TEXT NOT NULL,        -- nota obbligatoria arrivo/partenza
        numero_persone    INT NOT NULL DEFAULT 0,
        tipologia_unita   VARCHAR(40) NOT NULL, -- lupetti/coccinelle | esploratori/guide | clan/fuoco | ALTRO
        referente_nome    VARCHAR(120),
        referente_contatto VARCHAR(120),
        provenienza_paese VARCHAR(120),
        provenienza_cap   VARCHAR(20),
        trasbordo         BOOLEAN NOT NULL DEFAULT FALSE,
        trasbordo_giorni  INT NOT NULL DEFAULT 0,
        stato             VARCHAR(30) NOT NULL DEFAULT 'ricevuta',
        -- stati: 'ricevuta' | 'in_lavorazione' | 'confermata' | 'rifiutata'
        creata_da_admin   BOOLEAN NOT NULL DEFAULT FALSE,
        creata_il         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        aggiornata_il     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // --- MESSAGGI CHAT ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS messaggi (
        id             SERIAL PRIMARY KEY,
        prenotazione_id INT REFERENCES prenotazioni(id) ON DELETE CASCADE,
        mittente_id    INT REFERENCES users(id) ON DELETE SET NULL,
        mittente_ruolo VARCHAR(20) NOT NULL,   -- 'utente' | 'admin'
        testo          TEXT NOT NULL,
        letto          BOOLEAN NOT NULL DEFAULT FALSE,
        creato_il      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // --- NOTIFICHE ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifiche (
        id          SERIAL PRIMARY KEY,
        user_id     INT REFERENCES users(id) ON DELETE CASCADE,
        testo       TEXT NOT NULL,
        link        VARCHAR(255),
        letta       BOOLEAN NOT NULL DEFAULT FALSE,
        creata_il   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Indici utili
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pren_location ON prenotazioni(location_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pren_date ON prenotazioni(data_arrivo, data_partenza);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_msg_pren ON messaggi(prenotazione_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notif_user ON notifiche(user_id);`);

    // --- ADMIN DI DEFAULT ---
    const adminEmail = process.env.ADMIN_EMAIL || 'info@cooperativascout.org';
    const adminExists = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );
    if (adminExists.rows.length === 0) {
      const adminPass = process.env.ADMIN_PASSWORD || 'CambiaMiSubito2024!';
      const hash = await bcrypt.hash(adminPass, 10);
      await client.query(
        `INSERT INTO users (nome, email, password_hash, ruolo)
         VALUES ($1, $2, $3, 'admin')`,
        ['Amministrazione', adminEmail, hash]
      );
      console.log(`✅ Admin creato: ${adminEmail}`);
      console.log(`   Password iniziale: ${adminPass}`);
      console.log('   ⚠️  Cambiala dopo il primo accesso!');
    }

    await client.query('COMMIT');
    console.log('✅ Database inizializzato con successo.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Errore inizializzazione database:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Se eseguito direttamente da riga di comando
if (import.meta.url === `file://${process.argv[1]}`) {
  initDb()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default initDb;
