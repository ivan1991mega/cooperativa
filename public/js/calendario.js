// Componente calendario mensile riutilizzabile

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const GIORNI = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];

// Colori ben distinti tra loro (non tonalità di verde) per riconoscere a colpo d'occhio
const COLORI_LOC = {
  'Avinal Campo 1 - Bagni in muratura': '#e63946', // rosso
  'Avinal Campo 2 - entrata': '#f4a261',           // arancio
  'Avinal Campo 3 - prato non attrezzato': '#2a9d8f', // verde acqua
  'Avinal Casa': '#457b9d',                         // blu
  'Avinal Tutto': '#6a4c93',                        // viola
  'Ospitale di Cadore': '#e76f51',                  // corallo
  'Col Pigner': '#118ab2',                          // azzurro
};

function coloreLocation(nome) {
  return COLORI_LOC[nome] || '#636e72';
}

// Etichette compatte per gli eventi nelle celle (i nomi completi sono lunghi)
const ETICHETTE_CORTE = {
  'Avinal Campo 1 - Bagni in muratura': 'A.Campo 1',
  'Avinal Campo 2 - entrata': 'A.Campo 2',
  'Avinal Campo 3 - prato non attrezzato': 'A.Campo 3',
  'Avinal Casa': 'A.Casa',
  'Avinal Tutto': 'A.Tutto',
  'Ospitale di Cadore': 'Ospitale',
  'Col Pigner': 'Col Pigner',
};
function etichettaCorta(nome) {
  return ETICHETTE_CORTE[nome] || nome;
}

function ymd(date) {
  // Usa l'ora LOCALE, non UTC: toISOString() convertirebbe al fuso di Greenwich
  // facendo "arretrare" la data di un giorno per chi è in Italia (UTC+1/+2).
  const anno = date.getFullYear();
  const mese = String(date.getMonth() + 1).padStart(2, '0');
  const giorno = String(date.getDate()).padStart(2, '0');
  return `${anno}-${mese}-${giorno}`;
}

/**
 * Crea l'HTML di un calendario mensile.
 * @param {number} anno
 * @param {number} mese (0-11)
 * @param {Array} eventi - lista prenotazioni con data_arrivo, data_partenza, location_nome, ecc.
 * @param {Function} onClickEvento - callback(id) al click su un evento
 */
function renderCalendario(anno, mese, eventi, onClickEvento) {
  const primoGiorno = new Date(anno, mese, 1);
  const ultimoGiorno = new Date(anno, mese + 1, 0);
  const oggiStr = ymd(new Date());

  // Giorno della settimana del primo (0=lun ... 6=dom)
  let startOffset = (primoGiorno.getDay() + 6) % 7;

  const celle = [];
  // Giorni del mese precedente per riempire
  for (let i = 0; i < startOffset; i++) {
    const d = new Date(anno, mese, 1 - (startOffset - i));
    celle.push({ data: d, fuori: true });
  }
  // Giorni del mese
  for (let g = 1; g <= ultimoGiorno.getDate(); g++) {
    celle.push({ data: new Date(anno, mese, g), fuori: false });
  }
  // Completa l'ultima settimana
  while (celle.length % 7 !== 0) {
    const ultima = celle[celle.length - 1].data;
    const d = new Date(ultima);
    d.setDate(d.getDate() + 1);
    celle.push({ data: d, fuori: true });
  }

  let html = `<table class="calendario"><thead><tr>`;
  html += GIORNI.map((g) => `<th>${g}</th>`).join('');
  html += `</tr></thead><tbody>`;

  for (let i = 0; i < celle.length; i += 7) {
    html += '<tr>';
    for (let j = 0; j < 7; j++) {
      const cella = celle[i + j];
      const dStr = ymd(cella.data);
      const classi = ['cal-cella'];
      if (cella.fuori) classi.push('cal-fuori');
      if (dStr === oggiStr) classi.push('cal-oggi');

      // Eventi che coprono questo giorno
      const eventiGiorno = eventi.filter(
        (e) => dStr >= e.data_arrivo?.slice(0, 10) && dStr <= e.data_partenza?.slice(0, 10)
      );

      html += `<td class="${classi.join(' ')}">`;
      html += `<div class="cal-giorno-num">${cella.data.getDate()}</div>`;
      for (const ev of eventiGiorno.slice(0, 3)) {
        const colore = coloreLocation(ev.location_nome);
        const opacita = ev.stato === 'confermata' ? '1' : '0.6';
        const label = ev.creata_da_admin ? '🔒 ' : '';
        html += `<div class="cal-evento" style="background:${colore};opacity:${opacita}"
                  data-id="${ev.id}" title="${ev.location_nome} — ${ev.referente_nome || ''}">
                  ${label}${etichettaCorta(ev.location_nome)}
                 </div>`;
      }
      if (eventiGiorno.length > 3) {
        html += `<div class="mut" style="font-size:10px">+${eventiGiorno.length - 3}</div>`;
      }
      html += `</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';

  return html;
}

// Aggancia i click sugli eventi dopo il render
function agganciaEventiCalendario(container, onClickEvento) {
  container.querySelectorAll('.cal-evento').forEach((el) => {
    el.addEventListener('click', () => onClickEvento(parseInt(el.dataset.id, 10)));
  });
}
