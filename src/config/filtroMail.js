const PAROLE_NO = [
  'bolletta', 'bollette', 'servizio idrico',
  'fattura', 'fatture', 'fatturazione', 'area clienti',
  'enostra', 'e nostra coop',
  'newsletter',
  'sibspa',
  'nuovo messaggio di pec', 'messaggio di pec',
  'posta certificata', 'posta elettronica certificata',
  'accademiaeuropea', 'formazione@pec',
  'contact page',
  'unsubscribe', 'disiscriv',
  'privacy policy',
  'conferma lettura pec',
];

const PAROLE_OK = [
  'informazioni', 'info campo', 'info disponibil',
  'campo', 'posto campo',
  'uscita',
  'prenotazione', 'prenotare',
  'scout', 'agesci', 'fse',
  'disponibilit',
  'avinal', 'ampezzo',
  'pigner', 'ponte nelle alpi', 'cugnan',
  'ronci', 'conci', 'ospitale',
  'branco', 'reparto', 'clan', 'lupett', 'coccinell',
  'terreno', 'casa scout',
  'gruppo o unit',
  'vacanze di branco', 'campo estivo', 'campo invernale',
];

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function isMailRichiestaCampo(msg) {
  const from = norm(msg.from_addr || msg.from || msg.mittente || '');
  const subject = norm(msg.subject || msg.oggetto || msg.titolo || '');
  const body = norm(msg.text || msg.corpo || '');
  const blob = `${from} ${subject} ${body}`;

  if (PAROLE_NO.some((w) => blob.includes(norm(w)))) return false;
  if (/^newsletter\b/.test(subject)) return false;
  if (subject === 'contact page' || subject.includes('contact page')) return false;

  const formWp = /prenotazioni@cooperativascout/.test(from) || /gruppo o unit/.test(blob);
  if (formWp) return true;

  const hit = PAROLE_OK.filter((w) => blob.includes(norm(w)));
  const luogo = /avinal|pigner|ronci|conci|ospitale|cugnan|ampezzo|ponte nelle alpi/.test(blob);
  const azione = /campo|prenot|disponibil|uscita|posto campo/.test(blob);
  if (luogo && (azione || hit.length >= 1)) return true;
  if (azione && /scout|agesci|fse|reparto|branco|clan/.test(blob)) return true;
  return false;
}
