/**
 * Decide se una mail è una richiesta di campo/casa o spazzatura (bollette, newsletter).
 * Basato sulle mail vere di info@cooperativascout.org.
 */

const MITTENTI_OK = [
  /prenotazioni@cooperativascout\.(it|org)/i,
  /wordpress/i,
];

const PAROLE_OK = [
  'informazioni', 'informazione', 'info disponibil', 'info campo',
  'campo', 'campi', 'posto campo', 'posti campo',
  'uscita', 'uscite',
  'prenotazione', 'prenotazioni', 'prenotare', 'prenota',
  'scout', 'agesci', 'fse',
  'disponibilit', // copre disponibiltà / disponibilita
  'avinal', 'ampezzo',
  'pigner', 'ponte nelle alpi', 'cugnan',
  'ronci', 'conci', 'ospitale',
  'branco', 'reparto', 'clan', 'lupett', 'coccinell', 'esplorator',
  'terreno', 'casa scout', 'base avinal',
  'gruppo o unit', // form wordpress
  'vacanze di branco', 'vdb',
  'campo estivo', 'campo invernale',
];

const PAROLE_NO = [
  'bolletta', 'bollette', 'servizio idrico',
  'fattura', 'fatture', 'fatturazione',
  '\u00e8nostra', 'enostra',
  'newsletter',
  'sibspa', 'numero 2026/',
  'area clienti',
  'pagamento in attesa',
  'unsubscribe', 'disiscriv',
  'privacy policy',
  'conferma lettura pec',
];

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isMailRichiestaCampo(msg) {
  const from = norm(msg.from_addr || msg.from || '');
  const subject = norm(msg.subject || msg.oggetto || '');
  const body = norm(msg.text || msg.corpo || '');
  const blob = `${from}\n${subject}\n${body}`;

  if (MITTENTI_OK.some((re) => re.test(from) || re.test(blob))) {
    if (!PAROLE_NO.some((w) => subject.includes(norm(w)))) return true;
  }

  if (PAROLE_NO.some((w) => blob.includes(norm(w)))) {
    const forte =
      /campo|avinal|pigner|ronci|ospitale|prenot|scout|reparto|branco/.test(subject);
    if (!forte) return false;
  }

  const hit = PAROLE_OK.filter((w) => blob.includes(norm(w)));
  if (hit.length >= 1 && /campo|avinal|pigner|ronci|conci|ospitale|cugnan|prenot|uscita|scout|disponibil/.test(blob)) {
    return true;
  }
  return hit.length >= 2;
}

export function motivoFiltro(msg) {
  return isMailRichiestaCampo(msg) ? 'ok' : 'scartata_filtro';
}
