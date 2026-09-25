export function oggiISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${g}`;
}

function ymd(v) {
  if (!v) return null;
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  return null;
}

/** Passata = ha una data di partenza (o arrivo) strettamente prima di oggi. */
export function isRichiestaPassata(r) {
  const fine = ymd(r.data_partenza) || ymd(r.data_arrivo);
  if (!fine) return false; // senza date resta da valutare
  return fine < oggiISO();
}
