const MESI_IT = {
  gennaio: 1, feb: 2, febbraio: 2, marzo: 3, aprile: 4, mag: 5, maggio: 5,
  giugno: 6, luglio: 7, ago: 8, agosto: 8, settembre: 9, set: 9,
  ottobre: 10, ott: 10, novembre: 11, nov: 11, dicembre: 12, dic: 12,
};

const LOCATION_ALIAS = [
  { re: /avinal\s*tutto|tutto\s*avinal/i, nome: 'Avinal Tutto' },
  { re: /avinal\s*casa|casa\s*avinal/i, nome: 'Avinal Casa' },
  { re: /campo\s*1|bagni in muratura/i, nome: 'Avinal Campo 1 - Bagni in muratura' },
  { re: /campo\s*2|entrata/i, nome: 'Avinal Campo 2 - entrata' },
  { re: /campo\s*3|prato non attrezzato/i, nome: 'Avinal Campo 3 - prato non attrezzato' },
  { re: /avinal/i, nome: 'Avinal Casa' },
  { re: /ospitale/i, nome: 'Ospitale di Cadore' },
  { re: /col\s*pigner|pigner/i, nome: 'Col Pigner' },
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function ymd(y, m, d) {
  if (!y || !m || !d) return null;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(m) - 1 || dt.getDate() !== Number(d)) {
    return null;
  }
  return `${y}-${pad(m)}-${pad(d)}`;
}

function annoDa(testo, fallback) {
  const m = String(testo).match(/\b(20\d{2})\b/);
  if (m) return Number(m[1]);
  return fallback || new Date().getFullYear();
}

function parseDataToken(token, annoDefault) {
  if (!token) return null;
  const t = token.trim().toLowerCase();

  let m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return ymd(y, Number(m[2]), Number(m[1]));
  }

  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));

  m = t.match(/^(\d{1,2})\s+([a-zà]+)\s*(\d{4})?$/i);
  if (m) {
    const mese = MESI_IT[m[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
    if (mese) return ymd(Number(m[3] || annoDefault), mese, Number(m[1]));
  }
  return null;
}

function estraiDate(testo) {
  const anno = annoDa(testo);
  const raw = testo.replace(/\s+/g, ' ');

  const patterni = [
    /dal\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[a-zà]+(?:\s+20\d{2})?)\s+(?:al|fino al|fino)\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[a-zà]+(?:\s+20\d{2})?)/i,
    /dal\s+(\d{1,2})\s+al\s+(\d{1,2})\s+([a-zà]+)(?:\s+(20\d{2}))?/i,
    /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s*[-\u2013\u2014]\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/,
    /arrivo[:\s]+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[a-zà]+(?:\s+20\d{2})?).{0,40}partenza[:\s]+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[a-zà]+(?:\s+20\d{2})?)/i,
  ];

  for (const re of patterni) {
    const m = raw.match(re);
    if (!m) continue;
    if (m[3] && MESI_IT[m[3].toLowerCase()]) {
      const mese = MESI_IT[m[3].toLowerCase()];
      const y = Number(m[4] || anno);
      return { data_arrivo: ymd(y, mese, Number(m[1])), data_partenza: ymd(y, mese, Number(m[2])) };
    }
    const a = parseDataToken(m[1], anno);
    const p = parseDataToken(m[2], anno);
    if (a && p) return { data_arrivo: a, data_partenza: p };
  }

  const tutte = [];
  const reNum = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g;
  let mm;
  while ((mm = reNum.exec(raw))) {
    const d = parseDataToken(mm[1], anno);
    if (d) tutte.push(d);
  }
  if (tutte.length >= 2) return { data_arrivo: tutte[0], data_partenza: tutte[1] };
  if (tutte.length === 1) return { data_arrivo: tutte[0], data_partenza: tutte[0] };
  return { data_arrivo: null, data_partenza: null };
}

function matchLocation(testo, locations) {
  const lista = locations || [];
  for (const loc of lista) {
    if (testo.toLowerCase().includes(String(loc.nome).toLowerCase())) return loc;
  }
  for (const alias of LOCATION_ALIAS) {
    if (alias.re.test(testo)) {
      const found = lista.find((l) => l.nome === alias.nome);
      if (found) return found;
      return { id: null, nome: alias.nome };
    }
  }
  return null;
}

function primo(re, testo) {
  const m = testo.match(re);
  return m ? m[1].trim() : null;
}

export function parseRichiestaEmail({ subject = '', from = '', text = '' }, locations = []) {
  const corpo = `${subject}\n${from}\n${text || ''}`;
  const date = estraiDate(corpo);
  const loc = matchLocation(corpo, locations);

  const gruppo =
    primo(/gruppo(?:\s+scout)?[:\s]+([^\n,]{2,80})/i, corpo) ||
    primo(/(?:unit[a\u00e0]|reparto)[:\s]+([^\n,]{2,80})/i, corpo);

  const referente =
    primo(/referente[:\s]+([^\n,]{2,80})/i, corpo) ||
    primo(/(?:capo|cape)[:\s]+([^\n,]{2,80})/i, corpo);

  const contatto =
    primo(/(?:tel(?:efono)?|cell(?:ulare)?|contatto)[:\s]+([+\d][\d\s./-]{6,20})/i, corpo) ||
    primo(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i, from);

  const personeRaw = primo(/(?:persone|pax|partecipanti|ragazz[ie])[:\s]+(\d{1,3})/i, corpo);
  const numero_persone = personeRaw ? Number(personeRaw) : 0;

  let tipologia_unita = 'ALTRO';
  if (/lupett|coccinell/i.test(corpo)) tipologia_unita = 'lupetti/coccinelle';
  else if (/esplorator|guide/i.test(corpo)) tipologia_unita = 'esploratori/guide';
  else if (/clan|fuoco/i.test(corpo)) tipologia_unita = 'clan/fuoco';

  const titolo =
    gruppo ||
    subject.replace(/^(re|fwd|i|r):\s*/i, '').trim() ||
    from.split('<')[0].trim() ||
    'Richiesta email';

  return {
    titolo: titolo.slice(0, 160),
    data_arrivo: date.data_arrivo,
    data_partenza: date.data_partenza,
    location_nome: loc?.nome || null,
    location_id: loc?.id || null,
    gruppo_scout: gruppo,
    referente_nome: referente,
    referente_contatto: contatto,
    numero_persone,
    tipologia_unita,
    confidenza: {
      date: !!(date.data_arrivo && date.data_partenza),
      location: !!loc,
    },
  };
}
