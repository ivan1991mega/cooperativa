// Client API centralizzato
const API = {
  async richiesta(metodo, url, corpo) {
    const opts = {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    };
    if (corpo) opts.body = JSON.stringify(corpo);

    const res = await fetch(url, opts);
    let dati = {};
    try { dati = await res.json(); } catch {}
    if (!res.ok) {
      throw new Error(dati.errore || 'Errore di rete');
    }
    return dati;
  },

  get(url) { return this.richiesta('GET', url); },
  post(url, corpo) { return this.richiesta('POST', url, corpo); },
  patch(url, corpo) { return this.richiesta('PATCH', url, corpo); },

  // --- Auth ---
  registrazione(d) { return this.post('/api/auth/registrazione', d); },
  login(d) { return this.post('/api/auth/login', d); },
  logout() { return this.post('/api/auth/logout'); },
  me() { return this.get('/api/auth/me'); },

  // --- Prenotazioni ---
  locations() { return this.get('/api/prenotazioni/locations'); },
  creaPrenotazione(d) { return this.post('/api/prenotazioni', d); },
  miePrenotazioni() { return this.get('/api/prenotazioni/mie'); },
  tuttePrenotazioni() { return this.get('/api/prenotazioni/tutte'); },
  dettaglio(id) { return this.get(`/api/prenotazioni/${id}`); },
  cambiaStato(id, stato) { return this.patch(`/api/prenotazioni/${id}/stato`, { stato }); },
  creaBloccoAdmin(d) { return this.post('/api/prenotazioni/admin', d); },

  // --- Chat ---
  messaggi(prenId) { return this.get(`/api/chat/${prenId}`); },
  inviaMessaggio(prenId, testo, allegato) { return this.post(`/api/chat/${prenId}`, { testo, allegato }); },

  // --- Notifiche ---
  notifiche() { return this.get('/api/notifiche'); },
  segnaLette() { return this.post('/api/notifiche/segna-lette'); },
};
