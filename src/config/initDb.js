import { pool } from './db.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        nome          VARCHAR(120) NOT NULL,
        email         VARCHAR(180) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        ruolo         VARCHAR(20)  NOT NULL DEFAULT 'utente',
        creato_il     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id     SERIAL PRIMARY KEY,
        nome   VARCHAR(80) UNIQUE NOT NULL,
        ordine INT NOT NULL DEFAULT 0
      );
    `);

    const locCount = await client.query('SELECT COUNT(*) FROM locations');
    if (parseInt(locCount.rows[0].count, 10) === 0) {
      const locations = [
        'Avinal Campo 1 - Bagni in muratura',
        'Avinal Campo 2 - entrata',
        'Avinal Campo 3 - prato non attrezzato',
        'Avinal Casa',
        'Avinal Tutto',
        'Ospitale di Cadore',
        'Col Pigner',
      ];
      for (let i = 0; i < locations.length; i++) {
        await client.query('INSERT INTO locations (nome, ordine) VALUES ($1, $2)', [locations[i], i]);
      }
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS prenotazioni (
        id                SERIAL PRIMARY KEY,
        user_id           INT REFERENCES users(id) ON DELETE SET NULL,
        location_id       INT NOT NULL REFERENCES locations(id),
        data_arrivo       DATE NOT NULL,
        ora_arrivo        VARCHAR(20),
        data_partenza     DATE NOT NULL,
        ora_partenza      VARCHAR(20),
        nota              TEXT NOT NULL,
        numero_persone    INT NOT NULL DEFAULT 0,
        tipologia_unita   VARCHAR(40) NOT NULL,
        numero_squadriglie INT,
        gruppo_scout      VARCHAR(120),
        referente_nome    VARCHAR(120),
        referente_contatto VARCHAR(120),
        provenienza_paese VARCHAR(120),
        provenienza_cap   VARCHAR(20),
        trasbordo         BOOLEAN NOT NULL DEFAULT FALSE,
        trasbordo_giorni  INT NOT NULL DEFAULT 0,
        stato             VARCHAR(30) NOT NULL DEFAULT 'ricevuta',
        creata_da_admin   BOOLEAN NOT NULL DEFAULT FALSE,
        creata_il         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        aggiornata_il     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messaggi (
        id             SERIAL PRIMARY KEY,
        prenotazione_id INT REFERENCES prenotazioni(id) ON DELETE CASCADE,
        mittente_id    INT REFERENCES users(id) ON DELETE SET NULL,
        mittente_ruolo VARCHAR(20) NOT NULL,
        testo          TEXT NOT NULL DEFAULT '',
        allegato_nome  VARCHAR(255),
        allegato_tipo  VARCHAR(120),
        allegato_dati  TEXT,
        letto          BOOLEAN NOT NULL DEFAULT FALSE,
        creato_il      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`ALTER TABLE messaggi ALTER COLUMN testo SET DEFAULT '';`);
    await client.query(`ALTER TABLE messaggi ADD COLUMN IF NOT EXISTS allegato_nome VARCHAR(255);`);
    await client.query(`ALTER TABLE messaggi ADD COLUMN IF NOT EXISTS allegato_tipo VARCHAR(120);`);
    await client.query(`ALTER TABLE messaggi ADD COLUMN IF NOT EXISTS allegato_dati TEXT;`);
    await client.query(`ALTER TABLE prenotazioni ADD COLUMN IF NOT EXISTS numero_squadriglie INT;`);
    await client.query(`ALTER TABLE prenotazioni ADD COLUMN IF NOT EXISTS gruppo_scout VARCHAR(120);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS richieste_email (
        id                 SERIAL PRIMARY KEY,
        message_id         VARCHAR(320) UNIQUE,
        oggetto            TEXT,
        mittente           VARCHAR(255),
        corpo              TEXT,
        titolo             VARCHAR(180),
        data_arrivo        DATE,
        data_partenza      DATE,
        location_id        INT REFERENCES locations(id) ON DELETE SET NULL,
        gruppo_scout       VARCHAR(120),
        referente_nome     VARCHAR(120),
        referente_contatto VARCHAR(120),
        numero_persone     INT NOT NULL DEFAULT 0,
        tipologia_unita    VARCHAR(40) DEFAULT 'ALTRO',
        nota               TEXT,
        stato              VARCHAR(20) NOT NULL DEFAULT 'bozza',
        prenotazione_id    INT REFERENCES prenotazioni(id) ON DELETE SET NULL,
        ricevuta_il        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        aggiornata_il      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rich_email_date ON richieste_email(data_arrivo, data_partenza);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rich_email_stato ON richieste_email(stato);`);

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

    await client.query(`CREATE INDEX IF NOT EXISTS idx_pren_location ON prenotazioni(location_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pren_date ON prenotazioni(data_arrivo, data_partenza);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_msg_pren ON messaggi(prenotazione_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notif_user ON notifiche(user_id);`);

    async function creaUtenteSeMancante(nome, email, password, ruolo) {
      const esiste = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (esiste.rows.length === 0) {
        const hash = await bcrypt.hash(password, 10);
        await client.query(
          `INSERT INTO users (nome, email, password_hash, ruolo) VALUES ($1, $2, $3, $4)`,
          [nome, email, hash, ruolo]
        );
        console.log(`Creato ${ruolo}: ${email}`);
      }
    }

    await creaUtenteSeMancante(
      'Amministrazione',
      process.env.ADMIN_EMAIL || 'admin@cooperativascout.org',
      process.env.ADMIN_PASSWORD || 'admin123',
      'admin'
    );
    await creaUtenteSeMancante(
      'Cooperativa Scout',
      process.env.USER_EMAIL || 'info@cooperativascout.org',
      process.env.USER_PASSWORD || 'info123',
      'utente'
    );

    await client.query('COMMIT');
    console.log('Database inizializzato con successo.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Errore inizializzazione database:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initDb().then(() => process.exit(0)).catch(() => process.exit(1));
}

export default initDb;
