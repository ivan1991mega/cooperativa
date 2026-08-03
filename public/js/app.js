// ==========================================================================
//  APP PRINCIPALE — Gestione Prenotazioni Cooperativa Scout
// ==========================================================================

const TIPOLOGIE = ['lupetti/coccinelle', 'esploratori/guide', 'clan/fuoco', 'ALTRO'];
const STATI_LABEL = {
  ricevuta: 'Ricevuta',
  in_lavorazione: 'In lavorazione',
  confermata: 'Confermata',
  rifiutata: 'Rifiutata',
};

const stato = {
  user: null,
  socket: null,
  locations: [],
  vista: 'auth',
  calAnno: new Date().getFullYear(),
  calMese: new Date().getMonth(),
  filtroLocation: null,
  prenotazioni: [],
  notifiche: [],
  nonLette: 0,
  authMode: 'login',
  chatPrenId: null,
};

const app = document.getElementById('app');

// -------------------------------------------------------------------------
//  UTILITY
// -------------------------------------------------------------------------
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatData(d) {
  if (!d) return '';
  const data = new Date(d);
  return data.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatOra(iso) {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function toast(testo) {
  const cont = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = testo;
  cont.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

// -------------------------------------------------------------------------
//  SOCKET.IO
// -------------------------------------------------------------------------
function initSocket() {
  if (stato.socket) return;
  stato.socket = io({ withCredentials: true });

  stato.socket.on('notifica', (n) => {
    toast(n.testo);
    caricaNotifiche();
  });

  stato.socket.on('messaggio', (msg) => {
    // Se la chat aperta corrisponde, aggiungi il messaggio
    if (stato.chatPrenId && msg.prenotazione_id === stato.chatPrenId) {
      aggiungiMessaggioChat(msg);
    }
  });
}

// -------------------------------------------------------------------------
//  NOTIFICHE
// -------------------------------------------------------------------------
async function caricaNotifiche() {
  try {
    const d = await API.notifiche();
    stato.notifiche = d.notifiche;
    stato.nonLette = d.nonLette;
    aggiornaBadgeNotifiche();
  } catch {}
}

function aggiornaBadgeNotifiche() {
  const badge = document.getElementById('notif-badge');
  if (badge) {
    if (stato.nonLette > 0) {
      badge.textContent = stato.nonLette;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

async function toggleNotifiche() {
  let dd = document.getElementById('notif-dropdown');
  if (dd) { dd.remove(); return; }

  dd = document.createElement('div');
  dd.className = 'notif-dropdown';
  dd.id = 'notif-dropdown';

  if (stato.notifiche.length === 0) {
    dd.innerHTML = '<div class="notif-item mut">Nessuna notifica</div>';
  } else {
    dd.innerHTML = stato.notifiche.map((n) => `
      <div class="notif-item ${n.letta ? '' : 'non-letta'}">
        ${esc(n.testo)}
        <div class="quando">${formatData(n.creata_il)} ${formatOra(n.creata_il)}</div>
      </div>
    `).join('');
  }
  document.querySelector('.notif-wrap').appendChild(dd);

  // Segna lette
  if (stato.nonLette > 0) {
    await API.segnaLette();
    stato.nonLette = 0;
    aggiornaBadgeNotifiche();
  }
}

// -------------------------------------------------------------------------
//  AVVIO
// -------------------------------------------------------------------------
async function avvia() {
  try {
    const d = await API.me();
    stato.user = d.user;
    await dopoLogin();
  } catch {
    stato.vista = 'auth';
    renderAuth();
  }
}

async function dopoLogin() {
  initSocket();
  try {
    const loc = await API.locations();
    stato.locations = loc.locations;
  } catch {}
  await caricaNotifiche();
  if (stato.user.ruolo === 'admin') {
    stato.vista = 'admin';
    renderAdmin();
  } else {
    stato.vista = 'utente';
    renderUtente();
  }
}

// Chiudi dropdown notifiche cliccando fuori
document.addEventListener('click', (e) => {
  const dd = document.getElementById('notif-dropdown');
  if (dd && !e.target.closest('.notif-wrap')) dd.remove();
});

avvia();

// -------------------------------------------------------------------------
//  VISTA AUTH (login / registrazione)
// -------------------------------------------------------------------------
function renderAuth() {
  const isLogin = stato.authMode === 'login';
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-box">
        <h1>🏕️ Cooperativa Scout</h1>
        <p class="sub">Gestione prenotazioni case e terreni</p>
        <div id="auth-errore"></div>
        <form id="auth-form">
          ${!isLogin ? `
          <div class="form-group">
            <label>Nome e cognome <span class="obbligatorio">*</span></label>
            <input type="text" name="nome" required placeholder="Mario Rossi">
          </div>` : ''}
          <div class="form-group">
            <label>Email <span class="obbligatorio">*</span></label>
            <input type="email" name="email" required placeholder="tua@email.it">
          </div>
          <div class="form-group">
            <label>Password <span class="obbligatorio">*</span></label>
            <input type="password" name="password" required minlength="6" placeholder="••••••••">
          </div>
          <button type="submit" class="btn" style="width:100%">
            ${isLogin ? 'Accedi' : 'Registrati'}
          </button>
        </form>
        <div class="auth-switch">
          ${isLogin
            ? `Non hai un account? <a id="switch-auth">Registrati</a>`
            : `Hai già un account? <a id="switch-auth">Accedi</a>`}
        </div>
      </div>
    </div>
  `;

  document.getElementById('switch-auth').addEventListener('click', () => {
    stato.authMode = isLogin ? 'registrazione' : 'login';
    renderAuth();
  });

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dati = Object.fromEntries(fd);
    const errBox = document.getElementById('auth-errore');
    errBox.innerHTML = '';
    try {
      const d = isLogin
        ? await API.login(dati)
        : await API.registrazione(dati);
      stato.user = d.user;
      await dopoLogin();
    } catch (err) {
      errBox.innerHTML = `<div class="errore-msg">${esc(err.message)}</div>`;
    }
  });
}

// -------------------------------------------------------------------------
//  TOPBAR (comune a utente e admin)
// -------------------------------------------------------------------------
function topbar() {
  return `
    <div class="topbar">
      <div class="brand">🏕️ Cooperativa Scout ${stato.user.ruolo === 'admin' ? '· Admin' : ''}</div>
      <div class="actions">
        <div class="notif-wrap">
          <button class="btn-ghost" onclick="toggleNotifiche()" style="position:relative">
            🔔
            <span class="notif-badge" id="notif-badge" style="display:none">0</span>
          </button>
        </div>
        <span style="font-size:14px">${esc(stato.user.nome)}</span>
        <button class="btn-ghost" onclick="esci()">Esci</button>
      </div>
    </div>
  `;
}

async function esci() {
  await API.logout();
  stato.user = null;
  if (stato.socket) { stato.socket.disconnect(); stato.socket = null; }
  stato.authMode = 'login';
  renderAuth();
}

// -------------------------------------------------------------------------
//  VISTA UTENTE
// -------------------------------------------------------------------------
function renderUtente() {
  app.innerHTML = topbar() + `
    <div class="container">
      <div class="tabs">
        <div class="tab attivo" data-tab="nuova">➕ Nuova richiesta</div>
        <div class="tab" data-tab="mie">📋 Le mie prenotazioni</div>
      </div>
      <div id="tab-content"></div>
    </div>
  `;
  aggiornaBadgeNotifiche();

  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('attivo'));
      t.classList.add('attivo');
      if (t.dataset.tab === 'nuova') renderFormPrenotazione();
      else renderMiePrenotazioni();
    });
  });
  renderFormPrenotazione();
}

function renderFormPrenotazione() {
  const cont = document.getElementById('tab-content');
  const opzioniLoc = stato.locations
    .map((l) => `<option value="${l.id}">${esc(l.nome)}</option>`).join('');
  const opzioniTipo = TIPOLOGIE
    .map((t) => `<option value="${t}">${t}</option>`).join('');

  cont.innerHTML = `
    <div class="card">
      <h2>Nuova richiesta di prenotazione</h2>
      <div id="form-esito"></div>
      <form id="form-pren">
        <div class="form-group">
          <label>Location <span class="obbligatorio">*</span></label>
          <select name="location_id" required>
            <option value="">— seleziona —</option>
            ${opzioniLoc}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Data arrivo <span class="obbligatorio">*</span></label>
            <input type="date" name="data_arrivo" required>
          </div>
          <div class="form-group">
            <label>Orario arrivo</label>
            <input type="text" name="ora_arrivo" placeholder="es. mattina / 15:00">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Data partenza <span class="obbligatorio">*</span></label>
            <input type="date" name="data_partenza" required>
          </div>
          <div class="form-group">
            <label>Orario partenza</label>
            <input type="text" name="ora_partenza" placeholder="es. pomeriggio / 11:00">
          </div>
        </div>
        <div class="form-group">
          <label>Nota — quando arrivate e quando partite <span class="obbligatorio">*</span></label>
          <textarea name="nota" required placeholder="Es. Arrivo domenica in tarda mattinata, partenza sabato dopo pranzo..."></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Numero persone</label>
            <input type="number" name="numero_persone" min="0" value="0">
          </div>
          <div class="form-group">
            <label>Tipologia unità <span class="obbligatorio">*</span></label>
            <select name="tipologia_unita" required>${opzioniTipo}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Referente</label>
            <input type="text" name="referente_nome" placeholder="Nome referente">
          </div>
          <div class="form-group">
            <label>Contatto referente</label>
            <input type="text" name="referente_contatto" placeholder="Telefono / email">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Provenienza — Paese</label>
            <input type="text" name="provenienza_paese" placeholder="Città / Comune">
          </div>
          <div class="form-group">
            <label>Provenienza — CAP</label>
            <input type="text" name="provenienza_cap" placeholder="00000">
          </div>
        </div>
        <div class="form-group">
          <div class="checkbox-row">
            <input type="checkbox" name="trasbordo" id="trasbordo">
            <label for="trasbordo" style="margin:0">Servizio trasbordo materiale (50€ a servizio / giorno)</label>
          </div>
        </div>
        <div class="form-group" id="trasbordo-giorni-wrap" style="display:none">
          <label>Numero giorni di trasbordo</label>
          <input type="number" name="trasbordo_giorni" min="0" value="1">
          <p class="mut" id="trasbordo-costo"></p>
        </div>
        <button type="submit" class="btn">Invia richiesta</button>
      </form>
    </div>
  `;

  const chkTrasbordo = document.getElementById('trasbordo');
  const wrapGiorni = document.getElementById('trasbordo-giorni-wrap');
  const inputGiorni = document.querySelector('[name="trasbordo_giorni"]');
  const costoEl = document.getElementById('trasbordo-costo');

  function aggiornaCosto() {
    const g = parseInt(inputGiorni.value || '0', 10);
    costoEl.textContent = `Costo stimato: ${g * 50}€`;
  }
  chkTrasbordo.addEventListener('change', () => {
    wrapGiorni.style.display = chkTrasbordo.checked ? 'block' : 'none';
    aggiornaCosto();
  });
  inputGiorni.addEventListener('input', aggiornaCosto);

  document.getElementById('form-pren').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dati = Object.fromEntries(fd);
    dati.trasbordo = chkTrasbordo.checked;
    dati.numero_persone = parseInt(dati.numero_persone || '0', 10);
    dati.trasbordo_giorni = parseInt(dati.trasbordo_giorni || '0', 10);
    dati.location_id = parseInt(dati.location_id, 10);

    const esito = document.getElementById('form-esito');
    esito.innerHTML = '';
    try {
      const r = await API.creaPrenotazione(dati);
      let msg = '<div class="successo-msg">✅ Richiesta inviata! Riceverai una email di conferma e ti risponderemo a breve.</div>';
      if (r.conflitti) {
        msg += `<div class="avviso-conflitto">⚠️ Nota: esistono già ${r.conflitti.length} prenotazione/i sovrapposte per questa location. L'amministrazione valuterà.</div>`;
      }
      esito.innerHTML = msg;
      e.target.reset();
      wrapGiorni.style.display = 'none';
      window.scrollTo(0, 0);
    } catch (err) {
      esito.innerHTML = `<div class="errore-msg">${esc(err.message)}</div>`;
    }
  });
}

async function renderMiePrenotazioni() {
  const cont = document.getElementById('tab-content');
  cont.innerHTML = '<div class="card"><div class="spinner"></div></div>';
  try {
    const d = await API.miePrenotazioni();
    stato.prenotazioni = d.prenotazioni;
    if (d.prenotazioni.length === 0) {
      cont.innerHTML = '<div class="card"><div class="vuoto">Non hai ancora prenotazioni.</div></div>';
      return;
    }
    cont.innerHTML = `
      <div class="card">
        <table class="tabella">
          <thead><tr>
            <th>Location</th><th>Arrivo</th><th>Partenza</th><th>Persone</th><th>Stato</th>
          </tr></thead>
          <tbody>
            ${d.prenotazioni.map((p) => `
              <tr onclick="apriDettaglio(${p.id})">
                <td>${esc(p.location_nome)}</td>
                <td>${formatData(p.data_arrivo)}</td>
                <td>${formatData(p.data_partenza)}</td>
                <td>${p.numero_persone}</td>
                <td><span class="badge badge-${p.stato}">${STATI_LABEL[p.stato]}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    cont.innerHTML = `<div class="card"><div class="errore-msg">${esc(err.message)}</div></div>`;
  }
}

// -------------------------------------------------------------------------
//  VISTA ADMIN
// -------------------------------------------------------------------------
function renderAdmin() {
  app.innerHTML = topbar() + `
    <div class="container">
      <div class="tabs">
        <div class="tab attivo" data-tab="calendario">📅 Calendario</div>
        <div class="tab" data-tab="richieste">📋 Richieste</div>
        <div class="tab" data-tab="blocco">🔒 Crea periodo</div>
      </div>
      <div id="tab-content"></div>
    </div>
  `;
  aggiornaBadgeNotifiche();

  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('attivo'));
      t.classList.add('attivo');
      if (t.dataset.tab === 'calendario') renderCalendarioAdmin();
      else if (t.dataset.tab === 'richieste') renderRichiesteAdmin();
      else renderFormBlocco();
    });
  });
  renderCalendarioAdmin();
}

async function caricaTutte() {
  const d = await API.tuttePrenotazioni();
  stato.prenotazioni = d.prenotazioni;
  return d.prenotazioni;
}

async function renderCalendarioAdmin() {
  const cont = document.getElementById('tab-content');
  cont.innerHTML = '<div class="card"><div class="spinner"></div></div>';
  try {
    await caricaTutte();
  } catch (err) {
    cont.innerHTML = `<div class="card"><div class="errore-msg">${esc(err.message)}</div></div>`;
    return;
  }

  const filtriHtml = `
    <div class="filtro-loc">
      <button class="${!stato.filtroLocation ? 'attivo' : ''}" data-loc="">Tutte</button>
      ${stato.locations.map((l) =>
        `<button class="${stato.filtroLocation === l.nome ? 'attivo' : ''}" data-loc="${esc(l.nome)}">${esc(l.nome)}</button>`
      ).join('')}
    </div>
  `;

  const legenda = `
    <div class="cal-legenda">
      ${stato.locations.map((l) => `
        <span><span class="cal-dot" style="background:${coloreLocation(l.nome)}"></span>${esc(etichettaCorta(l.nome))}</span>
      `).join('')}
    </div>
  `;

  cont.innerHTML = `
    <div class="card">
      ${filtriHtml}
      <div class="cal-header">
        <div class="cal-nav">
          <button class="btn btn-secondario btn-piccolo" id="cal-prev">‹</button>
          <h3 id="cal-titolo"></h3>
          <button class="btn btn-secondario btn-piccolo" id="cal-next">›</button>
        </div>
        ${legenda}
      </div>
      <div id="cal-container"></div>
      <p class="mut" style="margin-top:10px">🔒 = periodo bloccato dall'amministrazione · opacità ridotta = non ancora confermata</p>
    </div>
  `;

  disegnaCalendario();

  document.getElementById('cal-prev').addEventListener('click', () => {
    stato.calMese--;
    if (stato.calMese < 0) { stato.calMese = 11; stato.calAnno--; }
    disegnaCalendario();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    stato.calMese++;
    if (stato.calMese > 11) { stato.calMese = 0; stato.calAnno++; }
    disegnaCalendario();
  });
  cont.querySelectorAll('.filtro-loc button').forEach((b) => {
    b.addEventListener('click', () => {
      stato.filtroLocation = b.dataset.loc || null;
      cont.querySelectorAll('.filtro-loc button').forEach((x) => x.classList.remove('attivo'));
      b.classList.add('attivo');
      disegnaCalendario();
    });
  });
}

function disegnaCalendario() {
  const titolo = document.getElementById('cal-titolo');
  const container = document.getElementById('cal-container');
  if (!titolo || !container) return;

  titolo.textContent = `${MESI[stato.calMese]} ${stato.calAnno}`;

  let eventi = stato.prenotazioni.filter((p) => p.stato !== 'rifiutata');
  if (stato.filtroLocation) {
    eventi = eventi.filter((p) => p.location_nome === stato.filtroLocation);
  }

  container.innerHTML = renderCalendario(stato.calAnno, stato.calMese, eventi, apriDettaglio);
  agganciaEventiCalendario(container, apriDettaglio);
}

async function renderRichiesteAdmin() {
  const cont = document.getElementById('tab-content');
  cont.innerHTML = '<div class="card"><div class="spinner"></div></div>';
  try {
    await caricaTutte();
    const richieste = stato.prenotazioni.filter((p) => !p.creata_da_admin);
    if (richieste.length === 0) {
      cont.innerHTML = '<div class="card"><div class="vuoto">Nessuna richiesta ricevuta.</div></div>';
      return;
    }
    cont.innerHTML = `
      <div class="card">
        <table class="tabella">
          <thead><tr>
            <th>Location</th><th>Periodo</th><th>Referente</th><th>Persone</th><th>Unità</th><th>Stato</th>
          </tr></thead>
          <tbody>
            ${richieste.map((p) => `
              <tr onclick="apriDettaglio(${p.id})">
                <td>${esc(p.location_nome)}</td>
                <td>${formatData(p.data_arrivo)} → ${formatData(p.data_partenza)}</td>
                <td>${esc(p.referente_nome || p.utente_nome || '-')}</td>
                <td>${p.numero_persone}</td>
                <td style="font-size:12px">${esc(p.tipologia_unita)}</td>
                <td><span class="badge badge-${p.stato}">${STATI_LABEL[p.stato]}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    cont.innerHTML = `<div class="card"><div class="errore-msg">${esc(err.message)}</div></div>`;
  }
}

function renderFormBlocco() {
  const cont = document.getElementById('tab-content');
  const opzioniLoc = stato.locations.map((l) => `<option value="${l.id}">${esc(l.nome)}</option>`).join('');
  const opzioniTipo = TIPOLOGIE.map((t) => `<option value="${t}">${t}</option>`).join('');

  cont.innerHTML = `
    <div class="card">
      <h2>Crea periodo di campeggio / blocco</h2>
      <p class="mut" style="margin-bottom:16px">Il periodo viene creato già come <strong>confermato</strong> e comparirà sul calendario.</p>
      <div id="blocco-esito"></div>
      <form id="form-blocco">
        <div class="form-group">
          <label>Location <span class="obbligatorio">*</span></label>
          <select name="location_id" required><option value="">— seleziona —</option>${opzioniLoc}</select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Data arrivo <span class="obbligatorio">*</span></label>
            <input type="date" name="data_arrivo" required>
          </div>
          <div class="form-group">
            <label>Data partenza <span class="obbligatorio">*</span></label>
            <input type="date" name="data_partenza" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Numero persone</label>
            <input type="number" name="numero_persone" min="0" value="0">
          </div>
          <div class="form-group">
            <label>Tipologia unità</label>
            <select name="tipologia_unita">${opzioniTipo}</select>
          </div>
        </div>
        <div class="form-group">
          <label>Referente / descrizione</label>
          <input type="text" name="referente_nome" placeholder="Es. Campo estivo reparto XY">
        </div>
        <div class="form-group">
          <label>Nota</label>
          <textarea name="nota" placeholder="Dettagli del periodo..."></textarea>
        </div>
        <button type="submit" class="btn">Crea periodo</button>
      </form>
    </div>
  `;

  document.getElementById('form-blocco').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target));
    dati.location_id = parseInt(dati.location_id, 10);
    dati.numero_persone = parseInt(dati.numero_persone || '0', 10);
    const esito = document.getElementById('blocco-esito');
    try {
      await API.creaBloccoAdmin(dati);
      esito.innerHTML = '<div class="successo-msg">✅ Periodo creato e aggiunto al calendario.</div>';
      e.target.reset();
    } catch (err) {
      esito.innerHTML = `<div class="errore-msg">${esc(err.message)}</div>`;
    }
  });
}

// -------------------------------------------------------------------------
//  MODAL DETTAGLIO + CHAT
// -------------------------------------------------------------------------
async function apriDettaglio(id) {
  let overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal"><div class="spinner"></div></div>';
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) chiudiModal();
  });

  try {
    const d = await API.dettaglio(id);
    const p = d.prenotazione;
    const isAdmin = stato.user.ruolo === 'admin';

    let conflittiHtml = '';
    if (isAdmin && d.conflitti && d.conflitti.length > 0) {
      conflittiHtml = `<div class="avviso-conflitto">⚠️ <strong>Sovrapposizione:</strong> ${d.conflitti.length} prenotazione/i su location in conflitto nello stesso periodo.</div>`;
    }

    let costoTrasbordo = '';
    if (p.trasbordo) {
      costoTrasbordo = ` — ${p.trasbordo_giorni} gg × 50€ = <strong>${p.trasbordo_giorni * 50}€</strong>`;
    }

    let azioniStato = '';
    if (isAdmin) {
      azioniStato = `
        <div style="margin:16px 0">
          <label style="font-weight:600;display:block;margin-bottom:8px">Cambia stato:</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-piccolo btn-secondario" onclick="cambiaStato(${p.id},'in_lavorazione')">In lavorazione</button>
            <button class="btn btn-piccolo" onclick="cambiaStato(${p.id},'confermata')">Conferma</button>
            <button class="btn btn-piccolo btn-rosso" onclick="cambiaStato(${p.id},'rifiutata')">Rifiuta</button>
          </div>
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--bordo)">
            <label style="font-weight:600;display:block;margin-bottom:8px">Elimina definitivamente:</label>
            <p class="mut" style="margin-bottom:8px">Rimuove la richiesta e la sua chat dallo storico e dal database. Azione irreversibile — utile per pulire test o richieste disdette.</p>
            <button class="btn btn-piccolo btn-rosso" onclick="eliminaPrenotazione(${p.id})">🗑️ Elimina richiesta</button>
          </div>
        </div>
      `;
    }

    stato.chatPrenId = p.id;

    overlay.querySelector('.modal').innerHTML = `
      <div class="modal-header">
        <h2>${esc(p.location_nome)}</h2>
        <button class="modal-close" onclick="chiudiModal()">×</button>
      </div>
      <span class="badge badge-${p.stato}">${STATI_LABEL[p.stato]}</span>
      ${p.creata_da_admin ? '<span class="badge badge-confermata" style="margin-left:6px">🔒 Blocco admin</span>' : ''}
      ${conflittiHtml}
      <div style="margin-top:16px">
        <div class="riga-info"><strong>Arrivo</strong><span>${formatData(p.data_arrivo)} ${esc(p.ora_arrivo || '')}</span></div>
        <div class="riga-info"><strong>Partenza</strong><span>${formatData(p.data_partenza)} ${esc(p.ora_partenza || '')}</span></div>
        <div class="riga-info"><strong>Persone</strong><span>${p.numero_persone}</span></div>
        <div class="riga-info"><strong>Unità</strong><span>${esc(p.tipologia_unita)}</span></div>
        ${p.referente_nome ? `<div class="riga-info"><strong>Referente</strong><span>${esc(p.referente_nome)}</span></div>` : ''}
        ${p.referente_contatto ? `<div class="riga-info"><strong>Contatto</strong><span>${esc(p.referente_contatto)}</span></div>` : ''}
        ${p.provenienza_paese ? `<div class="riga-info"><strong>Provenienza</strong><span>${esc(p.provenienza_paese)} ${esc(p.provenienza_cap || '')}</span></div>` : ''}
        ${isAdmin && p.utente_email ? `<div class="riga-info"><strong>Utente</strong><span>${esc(p.utente_email)}</span></div>` : ''}
        <div class="riga-info"><strong>Trasbordo</strong><span>${p.trasbordo ? 'Sì' + costoTrasbordo : 'No'}</span></div>
        <div style="padding:8px 0">
          <strong style="color:var(--grigio)">Nota:</strong>
          <p style="margin-top:4px">${esc(p.nota)}</p>
        </div>
      </div>
      ${azioniStato}
      <h3 style="margin-top:20px">💬 Chat con ${isAdmin ? 'l\'utente' : 'l\'amministrazione'}</h3>
      <div class="chat-box">
        <div class="chat-messaggi" id="chat-messaggi"><div class="spinner"></div></div>
        <div id="chat-anteprima" style="display:none"></div>
        <div class="chat-input">
          <input type="file" id="chat-file" accept="image/*,application/pdf" style="display:none">
          <button class="btn btn-secondario btn-piccolo" title="Allega foto o PDF" onclick="document.getElementById('chat-file').click()">📎</button>
          <input type="text" id="chat-input" placeholder="Scrivi un messaggio o un link..." maxlength="1000">
          <button class="btn" onclick="inviaChat(${p.id})">Invia</button>
        </div>
      </div>
    `;

    // Entra nella stanza socket e carica i messaggi
    if (stato.socket) stato.socket.emit('entra-chat', p.id);
    await caricaChat(p.id);

    const input = document.getElementById('chat-input');
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') inviaChat(p.id);
    });
    // Gestione selezione file
    const fileInput = document.getElementById('chat-file');
    fileInput.addEventListener('change', gestisciSelezioneFile);
    input.focus();

  } catch (err) {
    overlay.querySelector('.modal').innerHTML = `
      <div class="modal-header">
        <h2>Errore</h2>
        <button class="modal-close" onclick="chiudiModal()">×</button>
      </div>
      <div class="errore-msg">${esc(err.message)}</div>
    `;
  }
}

function chiudiModal() {
  if (stato.socket && stato.chatPrenId) stato.socket.emit('esci-chat', stato.chatPrenId);
  stato.chatPrenId = null;
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.remove();
}

async function caricaChat(prenId) {
  try {
    const d = await API.messaggi(prenId);
    const box = document.getElementById('chat-messaggi');
    if (!box) return;
    if (d.messaggi.length === 0) {
      box.innerHTML = '<div class="mut" style="text-align:center;margin:auto">Nessun messaggio. Inizia la conversazione.</div>';
    } else {
      box.innerHTML = '';
      d.messaggi.forEach(aggiungiMessaggioChat);
    }
  } catch {}
}

// Trasforma gli URL nel testo in link cliccabili (in modo sicuro, dopo l'escape)
function linkificaTesto(testo) {
  const escaped = esc(testo);
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">${url}</a>`
  );
}

// Costruisce l'HTML dell'allegato (immagine mostrata, PDF/altro come link scaricabile)
function renderAllegato(msg) {
  if (!msg.allegato_dati) return '';
  const nome = esc(msg.allegato_nome || 'allegato');
  if ((msg.allegato_tipo || '').startsWith('image/')) {
    return `<div style="margin-top:6px">
      <a href="${msg.allegato_dati}" target="_blank" rel="noopener">
        <img src="${msg.allegato_dati}" alt="${nome}" style="max-width:200px;max-height:200px;border-radius:8px;display:block">
      </a>
    </div>`;
  }
  // PDF o altro: link per aprire/scaricare
  return `<div style="margin-top:6px">
    <a href="${msg.allegato_dati}" download="${nome}" target="_blank" rel="noopener"
       style="color:inherit;text-decoration:underline">📄 ${nome}</a>
  </div>`;
}

function aggiungiMessaggioChat(msg) {
  const box = document.getElementById('chat-messaggi');
  if (!box) return;
  // Rimuovi placeholder se presente
  const mut = box.querySelector('.mut');
  if (mut) mut.remove();

  const mio = msg.mittente_ruolo === stato.user.ruolo;
  const el = document.createElement('div');
  el.className = `chat-msg ${mio ? 'mio' : 'altro'}`;
  el.innerHTML = `
    ${!mio ? `<div class="autore">${esc(msg.mittente_nome || (msg.mittente_ruolo === 'admin' ? 'Amministrazione' : 'Utente'))}</div>` : ''}
    ${msg.testo ? `<div>${linkificaTesto(msg.testo)}</div>` : ''}
    ${renderAllegato(msg)}
    <div class="ora">${formatOra(msg.creato_il)}</div>
  `;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

// Allegato selezionato, in attesa di invio
let allegatoInSospeso = null;

function gestisciSelezioneFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const MAX = 5 * 1024 * 1024;
  if (file.size > MAX) {
    toast('File troppo grande (massimo 5 MB)');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    allegatoInSospeso = { nome: file.name, tipo: file.type, dati: reader.result };
    const prev = document.getElementById('chat-anteprima');
    if (prev) {
      prev.style.display = 'block';
      prev.style.padding = '8px 12px';
      prev.style.fontSize = '13px';
      prev.innerHTML = `📎 ${esc(file.name)} pronto per l'invio
        <a onclick="annullaAllegato()" style="cursor:pointer;color:var(--rosso);margin-left:8px">✕ rimuovi</a>`;
    }
  };
  reader.readAsDataURL(file);
}

function annullaAllegato() {
  allegatoInSospeso = null;
  const prev = document.getElementById('chat-anteprima');
  if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
  const fileInput = document.getElementById('chat-file');
  if (fileInput) fileInput.value = '';
}

async function inviaChat(prenId) {
  const input = document.getElementById('chat-input');
  const testo = input.value.trim();
  // Serve almeno testo o allegato
  if (!testo && !allegatoInSospeso) return;
  const allegato = allegatoInSospeso;
  input.value = '';
  annullaAllegato();
  try {
    await API.inviaMessaggio(prenId, testo, allegato);
    // Il messaggio arriverà via socket
  } catch (err) {
    toast('Errore invio: ' + err.message);
  }
}

async function cambiaStato(id, nuovoStato) {
  try {
    await API.cambiaStato(id, nuovoStato);
    toast('Stato aggiornato: ' + STATI_LABEL[nuovoStato]);
    chiudiModal();
    // Ricarica la vista corrente
    if (stato.user.ruolo === 'admin') {
      const tabAttivo = document.querySelector('.tab.attivo')?.dataset.tab;
      if (tabAttivo === 'calendario') renderCalendarioAdmin();
      else if (tabAttivo === 'richieste') renderRichiesteAdmin();
    }
  } catch (err) {
    toast('Errore: ' + err.message);
  }
}

async function eliminaPrenotazione(id) {
  // Conferma esplicita: azione irreversibile
  const conferma = window.confirm(
    'Eliminare definitivamente questa richiesta e la sua chat?\n\n' +
    'L\'operazione non può essere annullata.'
  );
  if (!conferma) return;

  try {
    await API.eliminaPrenotazione(id);
    toast('Richiesta eliminata');
    chiudiModal();
    // Ricarica la vista corrente per aggiornare calendario/elenco
    if (stato.user.ruolo === 'admin') {
      const tabAttivo = document.querySelector('.tab.attivo')?.dataset.tab;
      if (tabAttivo === 'calendario') renderCalendarioAdmin();
      else if (tabAttivo === 'richieste') renderRichiesteAdmin();
    }
  } catch (err) {
    toast('Errore eliminazione: ' + err.message);
  }
}
