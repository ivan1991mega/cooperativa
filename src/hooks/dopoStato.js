import { pool } from '../config/db.js';
import {
  emailDestinatario,
  inviaMailConferma,
  inviaMailRifiuto,
  inviaMailPresaInCarico,
} from '../config/invioConferma.js';

export async function dopoCambioStato(pren, stato) {
  const loc = await pool.query('SELECT nome FROM locations WHERE id = $1', [pren.location_id]);
  const location = loc.rows[0]?.nome || '';
  let userEmail = null;
  if (pren.user_id) {
    const u = await pool.query('SELECT email, nome FROM users WHERE id = $1', [pren.user_id]);
    userEmail = u.rows[0]?.email;
  }
  const to = emailDestinatario(pren.referente_contatto, userEmail);
  const payload = {
    to,
    location,
    arrivo: pren.data_arrivo,
    partenza: pren.data_partenza,
    gruppo: pren.gruppo_scout,
    nome: pren.referente_nome,
  };
  if (stato === 'confermata') return inviaMailConferma(payload);
  if (stato === 'rifiutata') return inviaMailRifiuto(payload);
  if (stato === 'ricevuta' || stato === 'in_lavorazione') return inviaMailPresaInCarico(payload);
  return { saltata: true };
}
