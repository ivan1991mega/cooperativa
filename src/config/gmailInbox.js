import { ImapFlow } from 'imapflow';

function credenziali() {
  const user = process.env.IMAP_USER || process.env.SMTP_USER;
  const pass = process.env.IMAP_PASSWORD || process.env.SMTP_PASSWORD;
  const host = process.env.IMAP_HOST || 'imap.gmail.com';
  const port = Number(process.env.IMAP_PORT || 993);
  return { user, pass, host, port };
}

export function imapConfigurato() {
  const c = credenziali();
  return !!(c.user && c.pass);
}

function testoDaSource(raw) {
  const s = raw.toString('utf8');
  const plain = s.match(/Content-Type:\s*text\/plain[\s\S]*?\r?\n\r?\n([\s\S]*?)(?:\r?\n--|\r?\nContent-Type:)/i);
  if (plain) return pulisciQuotedPrintable(plain[1]);
  const html = s.match(/Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?:\r?\n--)/i);
  if (html) {
    return pulisciQuotedPrintable(html[1])
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  }
  return s.replace(/^[\s\S]*?\r?\n\r?\n/, '').slice(0, 20000);
}

function pulisciQuotedPrintable(t) {
  return String(t)
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\r/g, '')
    .trim();
}

function header(s, name) {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im');
  const m = s.match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

export async function scaricaEmailRecenti({ giorni = 45, limite = 80 } = {}) {
  if (!imapConfigurato()) {
    throw new Error(
      'IMAP non configurato. Imposta SMTP_USER e SMTP_PASSWORD (password per le app Gmail) oppure IMAP_USER / IMAP_PASSWORD.'
    );
  }
  const { user, pass, host, port } = credenziali();
  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const out = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date();
      since.setDate(since.getDate() - giorni);
      const uids = await client.search({ since }, { uid: true });
      const ultimi = (uids || []).slice(-limite);
      for (const uid of ultimi) {
        const msg = await client.fetchOne(uid, { envelope: true, source: true }, { uid: true });
        if (!msg) continue;
        const raw = msg.source ? msg.source.toString('utf8') : '';
        const env = msg.envelope || {};
        const fromAddr = (env.from || [])
          .map((f) => (f.address ? `${f.name || ''} <${f.address}>`.trim() : f.name || ''))
          .join(', ');
        out.push({
          message_id: env.messageId || header(raw, 'Message-ID') || `uid-${uid}`,
          uid,
          subject: env.subject || header(raw, 'Subject') || '(senza oggetto)',
          from_addr: fromAddr || header(raw, 'From'),
          date: env.date || null,
          text: testoDaSource(msg.source || Buffer.from(raw)),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
  return out;
}
