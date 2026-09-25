/* Aggiunge in admin un link alla PAGINA SEPARATA delle bozze.
   Non mette eventi email nel calendario ufficiale. */
(function () {
  function inject() {
    const tabs = document.querySelector('.tabs');
    const user = window.stato && window.stato.user;
    const isAdmin = user && user.ruolo === 'admin';
    if (!tabs || !isAdmin) return;
    if (document.getElementById('link-inbox-bozze')) return;
    const a = document.createElement('a');
    a.id = 'link-inbox-bozze';
    a.className = 'tab';
    a.href = '/inbox.html';
    a.textContent = '\u2709\ufe0f Calendario bozze';
    a.title = 'Pagina separata: richieste da email, non mescolate al calendario ufficiale';
    tabs.appendChild(a);
  }
  const obs = new MutationObserver(inject);
  obs.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', inject);
  setTimeout(inject, 800);
})();
