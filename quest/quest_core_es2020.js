// quest_core_es2020.js －－ 任務主控（ES2020+ 彈窗殼＋分頁事件＋可滑動內容）
(() => {
  'use strict';

  let active = 'daily';
  const byId = (id) => document.getElementById(id);

  const setActiveTabStyle = (tab) => {
    [...document.getElementsByClassName('quest-tab')].forEach((questTab) => {
      const isActive = questTab.dataset.tab === tab;
      questTab.style.boxShadow = isActive ? 'inset 0 0 0 2px rgba(255,255,255,.45)' : 'none';
    });
  };

  const dispatchTabChange = () => {
    document.dispatchEvent(new Event('quest:tabchange', { bubbles: true, cancelable: true }));
  };

  // 動態建立彈窗殼（內容區可下滑，分頁列固定）
  const ensureModalShell = () => {
    if (byId('questModal')) return;

    const wrap = document.createElement('div');
    wrap.id = 'questModal';
    wrap.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;display:none;background:rgba(0,0,0,.6);z-index:9999;';
    wrap.innerHTML = `
      <div style="position:relative;margin:40px auto;background:#222;color:#fff;border:1px solid #888;border-radius:8px;width:90vw;max-width:350px;max-height:80vh;box-sizing:border-box;display:flex;flex-direction:column;">
        <div style="position:sticky;top:0;background:#111;color:#fff;padding:8px;border-radius:8px 8px 0 0;z-index:2;">
          <button id="tabDaily" class="quest-tab" data-tab="daily" style="background:#2d7;border:none;border-radius:6px;color:#fff;padding:6px 8px;margin-right:6px">📅 每日任務</button>
          <button id="tabWeekly" class="quest-tab" data-tab="weekly" style="background:#3aa;border:none;border-radius:6px;color:#fff;padding:6px 8px;margin-right:6px">🗓️ 每週任務</button>
          <button id="tabAchievements" class="quest-tab" data-tab="achievements" style="background:#48c;border:none;border-radius:6px;color:#fff;padding:6px 8px;margin-right:6px">🏆 成就任務</button>
          <button id="tabRepeatables" class="quest-tab" data-tab="repeatables" style="background:#c85;border:none;border-radius:6px;color:#fff;padding:6px 8px;margin-right:6px">🔁 重複任務</button>
          <button id="questClose" style="position:absolute;right:8px;top:6px;border:none;background:transparent;color:#fff;font-size:16px;cursor:pointer">✖</button>
        </div>
        <div id="questContent" style="padding:10px;color:#ccc;flex:1;min-height:160px;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;">（此處由分頁 JS 插入內容）</div>
      </div>`;

    document.body.appendChild(wrap);

    // ✅ 綁定各分頁按鈕：切換分頁 → 更新樣式 → 發出事件，讓分頁模組去渲染內容
    wrap.querySelectorAll('.quest-tab').forEach((questTab) => {
      questTab.addEventListener('click', () => {
        active = questTab.dataset.tab;
        setActiveTabStyle(active);
        dispatchTabChange();
      });
    });

    wrap.querySelector('#questClose')?.addEventListener('click', () => window.QuestCore.close());
    wrap.addEventListener('click', (event) => {
      if (event.target === wrap) window.QuestCore.close();
    });
  };

  // 對外 API
  window.QuestCore = {
    open(tab) {
      if (tab) active = tab;
      ensureModalShell();
      byId('questModal').style.display = 'block';
      setActiveTabStyle(active);
      dispatchTabChange();
    },
    close() {
      const modal = byId('questModal');
      if (modal) modal.style.display = 'none';
    },
    setTab(tab) {
      active = tab;
      setActiveTabStyle(active);
      dispatchTabChange();
    },
    getActiveTab() {
      return active;
    },
  };

  const init = () => {
    ensureModalShell();
    const openBtn = byId('questBtn');
    const closeBtn = byId('questClose');

    if (openBtn) openBtn.onclick = () => window.QuestCore.open('daily');
    if (closeBtn) closeBtn.onclick = () => window.QuestCore.close();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
