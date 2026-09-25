function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function ymdFromAny(d) {
  if (!d) return '';
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const data = new Date(d);
  if (Number.isNaN(data.getTime())) return '';
  return data.toISOString().slice(0, 10);
}
function formatData(d) {
  const s = ymdFromAny(d);
  if (!s) return '';
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}
function toast(testo) {
  const cont = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = testo;
  cont.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

const stato = { calAnno: new Date().getFullYear(), calMese: new Date().getMonth(), locations: [], user: null, pulito: false };

async function main() {
  try {
    const me = await API.me();
    stato.user = me.user;
    if (me.user.ruolo !== 'admin') {
      document.getElementById('root').innerHTML = '<div class="card"><div class="errore-msg">Solo amministrazione.</div></div>';
      return;
    }
    const loc = await API.locations();
    stato.locations = loc.locations;
    try {
      const p = await API.inboxPulisci();
      if (p.scartate) toast('Tolte dalla coda ' + p.scartate + ' mail non pertinenti');
    } catch (e) { /* ok */ }
    await render();
  } catch {
    document.getElementById('root').innerHTML = '<div class="card">Devi <a href="/">accedere</a> come admin.</div>';
  }
}

async function render() {
  const root = document.getElementById('root');
  const d = await API.inboxElenco();
  const bozze = d.richieste.filter((r) => r.stato === 'bozza');
  const eventi = bozze.filter((r) => r.data_arrivo).map((r) => ({
    id: r.id,
    data_arrivo: ymdFromAny(r.data_arrivo),
    data_partenza: ymdFromAny(r.data_partenza || r.data_arrivo),
    location_nome: r.location_nome || 'Da assegnare',
    titolo: r.titolo || r.oggetto,
    etichetta: r.titolo || r.gruppo_scout || r.oggetto,
    gruppo_scout: r.gruppo_scout,
    stato: 'ricevuta',
  }));

  root.innerHTML = `
    <div class="card">
      <h2>Calendario bozze (email)</h2>
      <p class="mut">Separato dal calendario ufficiale. Newsletter, PEC e fatture vengono scartate.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
        <button class="btn" id="sync">Sincronizza Gmail</button>
        <button class="btn btn-secondario" id="pulisci">Pulisci coda</button>
        <button class="btn btn-secondario" id="toggle">Incolla una mail</button>
      </div>
      <p class="mut">${d.imap ? 'IMAP pronto.' : 'IMAP non configurato.'}</p>
      <div id="incolla" style="display:none">
        <div class="form-group"><label>Oggetto</label><input id="og"></div>
        <div class="form-group"><label>Mittente</label><input id="mi"></div>
        <div class="form-group"><label>Testo mail</label><textarea id="co" rows="8"></textarea></div>
        <button class="btn" id="salva-inc">Analizza</button>
      </div>
      <div class="cal-header">
        <div class="cal-nav">
          <button class="btn btn-secondario btn-piccolo" id="prev">‹</button>
          <h3 id="tit"></h3>
          <button class="btn btn-secondario btn-piccolo" id="next">›</button>
        </div>
      </div>
      <div class="cal-scroll"><div id="cal"></div></div>
    </div>
    <div class="card">
      <h3>In coda (${bozze.length})</h3>
      ${bozze.length === 0 ? '<div class="vuoto">Nessuna bozza futura.</div>' : `
      <div class="tabella-scroll"><table class="tabella">
        <thead><tr><th>Nome</th><th>Date</th><th>Location</th><th></th></tr></thead>
        <tbody>
          ${bozze.map((r) => `
            <tr>
              <td>${esc(r.titolo || r.oggetto || '—')}</td>
              <td>${r.data_arrivo ? `${formatData(r.data_arrivo)} → ${formatData(r.data_partenza)}` : 'date mancanti'}</td>
              <td>${esc(r.location_nome || '—')}</td>
              <td><button class="btn btn-piccolo" data-open="${r.id}">Apri</button></td>
            </tr>`).join('')}
        </tbody>
      </table></div>`}
      <div id="dettaglio"></div>
    </div>
  `;

  function draw() {
    document.getElementById('tit').textContent = `${MESI[stato.calMese]} ${stato.calAnno}`;
    document.getElementById('cal').innerHTML = renderCalendario(stato.calAnno, stato.calMese, eventi);
    agganciaEventiCalendario(document.getElementById('cal'), (id) => apri(id));
  }
  draw();
  document.getElementById('prev').onclick = () => { stato.calMese--; if (stato.calMese < 0) { stato.calMese = 11; stato.calAnno--; } draw(); };
  document.getElementById('next').onclick = () => { stato.calMese++; if (stato.calMese > 11) { stato.calMese = 0; stato.calAnno++; } draw(); };
  document.getElementById('toggle').onclick = () => {
    const b = document.getElementById('incolla');
    b.style.display = b.style.display === 'none' ? 'block' : 'none';
  };
  document.getElementById('salva-inc').onclick = async () => {
    try {
      await API.inboxIncolla({ oggetto: document.getElementById('og').value, mittente: document.getElementById('mi').value, corpo: document.getElementById('co').value });
      toast('In coda');
      render();
    } catch (e) { toast(e.message); }
  };
  document.getElementById('pulisci').onclick = async () => {
    try {
      const p = await API.inboxPulisci();
      toast('Scartate ' + (p.scartate || 0));
      render();
    } catch (e) { toast(e.message); }
  };
  document.getElementById('sync').onclick = async () => {
    const b = document.getElementById('sync');
    b.disabled = true;
    try {
      const r = await API.inboxSync();
      const p = await API.inboxPulisci();
      toast(`Letti ${r.esaminate}, nuovi ${r.nuove}, pulite ${p.scartate || 0}`);
      render();
    } catch (e) { toast(e.message); b.disabled = false; }
  };
  root.querySelectorAll('[data-open]').forEach((btn) => {
    btn.onclick = () => apri(Number(btn.dataset.open));
  });
}

async function caricaBozza(id, tipo) {
  const b = await API.mailBozzaInbox(id, tipo);
  document.getElementById('mail-to').value = b.to || '';
  document.getElementById('mail-og').value = b.oggetto || '';
  document.getElementById('mail-tx').value = b.testo || '';
}

async function apri(id) {
  const box = document.getElementById('dettaglio');
  const d = await API.inboxDettaglio(id);
  const r = d.richiesta;
  const opts = stato.locations.map((l) =>
    `<option value="${l.id}" ${String(l.id) === String(r.location_id) ? 'selected' : ''}>${esc(l.nome)}</option>`).join('');
  box.innerHTML = `
    <h3 style="margin-top:16px">${esc(r.titolo || r.oggetto)}</h3>
    <p class="mut">${esc(r.mittente || '')}</p>
    <div class="form-group"><label>Titolo</label><input id="t" value="${esc(r.titolo || '')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Arrivo</label><input type="date" id="a" value="${ymdFromAny(r.data_arrivo)}"></div>
      <div class="form-group"><label>Partenza</label><input type="date" id="p" value="${ymdFromAny(r.data_partenza)}"></div>
    </div>
    <div class="form-group"><label>Location</label><select id="l"><option value="">—</option>${opts}</select></div>
    <div class="form-group"><label>Gruppo</label><input id="g" value="${esc(r.gruppo_scout || '')}"></div>
    <div class="form-group"><label>Mail originale</label><textarea readonly rows="6">${esc(r.corpo || '')}</textarea></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <button class="btn" id="save">Salva</button>
      <button class="btn" id="proc">Processa nel calendario ufficiale</button>
      <button class="btn btn-secondario" id="del">Scarta</button>
    </div>
    <h3>Rispondi via email</h3>
    <p class="mut">Non parte da sola. Modifica il testo e premi Invia solo quando sei pronto.</p>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <button class="btn btn-secondario btn-piccolo" id="tpl-ok">Bozza conferma</button>
      <button class="btn btn-secondario btn-piccolo" id="tpl-no">Bozza rifiuto</button>
    </div>
    <div class="form-group"><label>A</label><input id="mail-to" placeholder="email del capo"></div>
    <div class="form-group"><label>Oggetto</label><input id="mail-og"></div>
    <div class="form-group"><label>Testo</label><textarea id="mail-tx" rows="10"></textarea></div>
    <button class="btn" id="mail-send">Invia email</button>
  `;
  try { await caricaBozza(id, 'conferma'); } catch (e) { /* niente indirizzo */ }
  const payload = () => ({
    titolo: document.getElementById('t').value,
    data_arrivo: document.getElementById('a').value || null,
    data_partenza: document.getElementById('p').value || null,
    location_id: document.getElementById('l').value ? Number(document.getElementById('l').value) : null,
    gruppo_scout: document.getElementById('g').value,
  });
  document.getElementById('save').onclick = async () => {
    try { await API.inboxAggiorna(id, payload()); toast('Salvata'); render(); } catch (e) { toast(e.message); }
  };
  document.getElementById('proc').onclick = async () => {
    try {
      await API.inboxAggiorna(id, payload());
      const x = await API.inboxProcessa(id);
      toast('Nel calendario ufficiale #' + x.prenotazione.id);
      render();
    } catch (e) { toast(e.message); }
  };
  document.getElementById('del').onclick = async () => {
    if (!confirm('Scartare?')) return;
    try { await API.inboxScarta(id); toast('Scartata'); render(); } catch (e) { toast(e.message); }
  };
  document.getElementById('tpl-ok').onclick = () => caricaBozza(id, 'conferma');
  document.getElementById('tpl-no').onclick = () => caricaBozza(id, 'rifiuto');
  document.getElementById('mail-send').onclick = async () => {
    const to = document.getElementById('mail-to').value.trim();
    const oggetto = document.getElementById('mail-og').value.trim();
    const testo = document.getElementById('mail-tx').value.trim();
    if (!confirm('Inviare ora a ' + to + '?')) return;
    try {
      const r = await API.mailInvia({ to, oggetto, testo });
      toast(r.simulated ? 'SMTP non configurato: mail solo in log' : 'Email inviata a ' + to);
    } catch (e) { toast(e.message); }
  };
}

main();
