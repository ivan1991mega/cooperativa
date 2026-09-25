export function emailDestinatario(...pezzi) {
  const blob = pezzi.filter(Boolean).join(' ');
  const m = String(blob).match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i);
  if (!m) return null;
  const addr = m[0].toLowerCase();
  if (/cooperativascout\.(it|org)$/i.test(addr)) return null;
  if (/wordpress/i.test(addr)) return null;
  return addr;
}

export async function inviaMailConferma() { return { saltata: true }; }
export async function inviaMailRifiuto() { return { saltata: true }; }
export async function inviaMailPresaInCarico() { return { saltata: true }; }
