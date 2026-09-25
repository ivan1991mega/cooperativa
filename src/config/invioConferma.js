import { sendMail } from './mailer.js';

export function emailDestinatario(...pezzi) {
  const blob = pezzi.filter(Boolean).join(' ');
  const m = String(blob).match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i);
  if (!m) return null;
  const addr = m[0].toLowerCase();
  if (/cooperativascout\.(it|org)$/i.test(addr)) return null;
  if (/wordpress/i.test(addr)) return null;
  return addr;
}

function fmt(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  const [y, m, g] = s.split('-');
  return `${g}/${m}/${y}`;
}

export async function inviaMailConferma({ to, location, arrivo, partenza, gruppo, nome }) {
  if (!to) return { saltata: true };
  const subject = `Prenotazione confermata — ${location} ${fmt(arrivo)} / ${fmt(partenza)}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#2d3436">
      <div style="background:#1f5f4a;color:#fff;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">Prenotazione confermata</h2>
      </div>
      <div style="padding:20px;background:#f7f6f2">
        <p>Ciao ${nome || ''},</p>
        <p>ti confermiamo la prenotazione presso la Cooperativa Scout San Giorgio.</p>
        <p><strong>${location}</strong><br>
        dal ${fmt(arrivo)} al ${fmt(partenza)}<br>
        ${gruppo ? 'Gruppo: ' + gruppo : ''}</p>
        <p>Per comunicazioni rispondi a questa mail o usa info@cooperativascout.org</p>
        <p style="font-size:12px;color:#888">Cooperativa Scout San Giorgio</p>
      </div>
    </div>`;
  const text = `Prenotazione confermata: ${location} dal ${fmt(arrivo)} al ${fmt(partenza)}.`;
  return sendMail({ to, subject, html, text });
}

export async function inviaMailRifiuto({ to, location, arrivo, partenza, nome }) {
  if (!to) return { saltata: true };
  const subject = `Riscontro richiesta — ${location || 'campo'}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <p>Ciao ${nome || ''},</p>
      <p>ti scriviamo riguardo la richiesta per <strong>${location || 'il campo'}</strong>
      (${fmt(arrivo)} – ${fmt(partenza)}).</p>
      <p>In questo momento non riusciamo a confermare il periodo. Se vuoi altre date, rispondi a questa mail.</p>
      <p>Cooperativa Scout San Giorgio</p>
    </div>`;
  return sendMail({ to, subject, html, text: 'Non riusciamo a confermare il periodo richiesto.' });
}

export async function inviaMailPresaInCarico({ to, location, arrivo, partenza, nome }) {
  if (!to) return { saltata: true };
  const subject = `Richiesta ricevuta — ${location || 'campo'}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <p>Ciao ${nome || ''},</p>
      <p>abbiamo ricevuto la richiesta per <strong>${location || 'il campo'}</strong>
      dal ${fmt(arrivo)} al ${fmt(partenza)} e la stiamo valutando.</p>
      <p>Ti risponderemo al più presto.</p>
      <p>Cooperativa Scout San Giorgio</p>
    </div>`;
  return sendMail({ to, subject, html, text: 'Richiesta ricevuta, la stiamo valutando.' });
}
