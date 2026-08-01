import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Configurazione SMTP per Google Workspace.
 *
 * IMPORTANTE: per usare Gmail/Google Workspace via SMTP devi generare
 * una "Password per le app" (App Password) dall'account Google, NON usare
 * la password normale. Richiede la verifica in due passaggi attiva.
 *   → https://myaccount.google.com/apppasswords
 *
 * Variabili d'ambiente richieste:
 *   SMTP_USER      = info@cooperativascout.org
 *   SMTP_PASSWORD  = la App Password a 16 cifre (senza spazi)
 */
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn('⚠️  SMTP non configurato: le email non verranno inviate (solo log).');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: true, // true per porta 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  return transporter;
}

/**
 * Invia una email. Se SMTP non è configurato, logga soltanto (utile in sviluppo).
 */
export async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  const from = `"Cooperativa Scout" <${process.env.SMTP_USER || 'info@cooperativascout.org'}>`;

  if (!t) {
    console.log('📧 [EMAIL SIMULATA]');
    console.log('   A:', to);
    console.log('   Oggetto:', subject);
    return { simulated: true };
  }

  try {
    const info = await t.sendMail({ from, to, subject, html, text });
    console.log('📧 Email inviata:', info.messageId, '→', to);
    return info;
  } catch (err) {
    console.error('❌ Errore invio email:', err.message);
    return { error: err.message };
  }
}

/**
 * Template: conferma ricezione richiesta all'utente.
 */
export function templateRicezione(prenotazione, location) {
  const subject = `Richiesta ricevuta — ${location} (${prenotazione.data_arrivo} → ${prenotazione.data_partenza})`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2d3436;">
      <div style="background: #1e6f5c; color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">Richiesta ricevuta ✅</h2>
      </div>
      <div style="padding: 24px; background: #f8f9fa; border-radius: 0 0 8px 8px;">
        <p>Ciao ${prenotazione.referente_nome || ''},</p>
        <p>abbiamo ricevuto la tua richiesta di prenotazione ed è stata <strong>messa in lavorazione</strong>.
        Ti risponderemo al più presto.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 0;"><strong>Location:</strong></td><td>${location}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Arrivo:</strong></td><td>${prenotazione.data_arrivo} ${prenotazione.ora_arrivo || ''}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Partenza:</strong></td><td>${prenotazione.data_partenza} ${prenotazione.ora_partenza || ''}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Persone:</strong></td><td>${prenotazione.numero_persone}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Unità:</strong></td><td>${prenotazione.tipologia_unita}</td></tr>
        </table>
        <p style="color: #636e72; font-size: 14px;">Puoi seguire lo stato della richiesta e chattare con l'amministrazione direttamente nell'app.</p>
        <hr style="border: none; border-top: 1px solid #dfe6e9; margin: 20px 0;">
        <p style="color: #b2bec3; font-size: 12px;">Cooperativa Scout — questo messaggio è stato generato automaticamente.</p>
      </div>
    </div>
  `;
  const text = `Richiesta ricevuta per ${location} dal ${prenotazione.data_arrivo} al ${prenotazione.data_partenza}. È stata messa in lavorazione.`;
  return { subject, html, text };
}

/**
 * Template: notifica di nuova richiesta all'amministrazione.
 */
export function templateNuovaRichiestaAdmin(prenotazione, location, utenteEmail) {
  const subject = `🔔 Nuova richiesta — ${location} (${prenotazione.data_arrivo})`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e6f5c;">Nuova richiesta di prenotazione</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td><strong>Da:</strong></td><td>${utenteEmail}</td></tr>
        <tr><td><strong>Location:</strong></td><td>${location}</td></tr>
        <tr><td><strong>Periodo:</strong></td><td>${prenotazione.data_arrivo} → ${prenotazione.data_partenza}</td></tr>
        <tr><td><strong>Persone:</strong></td><td>${prenotazione.numero_persone}</td></tr>
        <tr><td><strong>Unità:</strong></td><td>${prenotazione.tipologia_unita}</td></tr>
        <tr><td><strong>Referente:</strong></td><td>${prenotazione.referente_nome || '-'} (${prenotazione.referente_contatto || '-'})</td></tr>
        <tr><td><strong>Provenienza:</strong></td><td>${prenotazione.provenienza_paese || '-'} ${prenotazione.provenienza_cap || ''}</td></tr>
        <tr><td><strong>Trasbordo:</strong></td><td>${prenotazione.trasbordo ? 'Sì (' + prenotazione.trasbordo_giorni + ' gg × 50€)' : 'No'}</td></tr>
        <tr><td><strong>Nota:</strong></td><td>${prenotazione.nota}</td></tr>
      </table>
      <p>Accedi al pannello admin per gestirla.</p>
    </div>
  `;
  const text = `Nuova richiesta da ${utenteEmail} per ${location} (${prenotazione.data_arrivo} → ${prenotazione.data_partenza}).`;
  return { subject, html, text };
}
