import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Su Railway la variabile DATABASE_URL viene fornita automaticamente
// quando colleghi un database PostgreSQL al servizio.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    '⚠️  DATABASE_URL non impostata. Su Railway collega un database PostgreSQL al servizio.'
  );
}

export const pool = new Pool({
  connectionString,
  // Railway richiede SSL in produzione; in locale lo disattiviamo.
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('Errore imprevisto sul client PostgreSQL', err);
});

export async function query(text, params) {
  return pool.query(text, params);
}
