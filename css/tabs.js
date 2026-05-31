// ui/tabs.js
(function () {
  const STORAGE_KEY = 'mainSysTabs.active';

  function initTabs(root) {
    const tablist = root.querySelector('.tablist');
    const tabs = Array.from(root.querySelectorAll('.tablist .tab'));
    const panels = Array.from(root.querySelectorAll('.tabpanel'));

    function setActiveById(tabId) {
      tabs.forEach(t => {
        const active = t.id === tabId;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
        t.tabIndex = active ? 0 : -1;
      });
      panels.forEach(p => {
        const active = p.id === (document.getElementById(tabId)?.getAttribute('aria-controls'));
        p.classList.toggle('is-active', !!active);
      });
      try { localStorage.setItem(STORAGE_KEY, tabId); } catch (e) {}
      const activeTab = document.getElementById(tabId);
      if (activeTab) activeTab.focus({ preventScroll: true });
    }

    // 點擊
    tablist.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      setActiveById(btn.id);
    });

    // 鍵盤：左右 / Home / End
    tablist.addEventListener('keydown', (e) => {
      const currentIndex = tabs.findIndex(t => t.classList.contains('is-active'));
      let nextIndex = currentIndex;
      if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
      if (e.key === 'ArrowLeft')  nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') nextIndex = 0;
      if (e.key === 'End')  nextIndex = tabs.length - 1;

      if (nextIndex !== currentIndex) {
        e.preventDefault();
        setActiveById(tabs[nextIndex].id);
      }
    });

    // 還原上次狀態
    let initial = 'tab-res';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && root.querySelector('#' + saved)) initial = saved;
    } catch (e) {}
    setActiveById(initial);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('main-sys-tabs');
    if (root) initTabs(root);
  });
})();

