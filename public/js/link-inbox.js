(function () {
  function isAdminVista() {
    const tabs = document.querySelector('.tabs');
    if (!tabs) return false;
    const t = tabs.textContent || '';
    return t.includes('Calendario') && t.includes('Richieste');
  }
  function inject() {
    if (!isAdminVista()) return;
    if (document.getElementById('link-inbox-bozze')) return;
    const tabs = document.querySelector('.tabs');
    const a = document.createElement('a');
    a.id = 'link-inbox-bozze';
    a.className = 'tab';
    a.href = '/inbox.html';
    a.textContent = 'Calendario bozze';
    a.title = 'Pagina separata: solo richieste da email';
    tabs.appendChild(a);
  }
  const root = document.getElementById('app') || document.body;
  new MutationObserver(inject).observe(root, { childList: true, subtree: true });
  setInterval(inject, 1500);
})();
