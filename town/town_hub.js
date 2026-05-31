// ======================================================
// town_hub.js — 完整修正版（防止自動刷新跳頁、高效節流）
// ======================================================
(function (w) {
  "use strict";

  // --- 內部變數 ---
  const _tabs = [];
  let _activeId = null;
  let _modal = null;
  let _body = null;
  let _tabBar = null;

  let _lastTick = Date.now();
  let _renderAccum = 0;         // 控制每秒重繪計時
  let _loopTickAccum = 0;       // 控制每秒邏輯計時
  let _rerenderPending = false; // 立即重繪請求標記

  let _progSwitchEnabled = false; // 是否允許程式自動切頁

  // --- 基礎工具 ---
  function getTab(id) {
    for (let i = 0; i < _tabs.length; i++) {
      if (_tabs[i].id === id) return _tabs[i];
    }
    return null;
  }

  // --- 核心邏輯：渲染內容 ---
  function renderActive(force) {
    if (!_body) return;
    const cur = getTab(_activeId);
    if (!cur) return;

    // 🔒 關鍵修正：檢查目前 DOM 是否已經是該分頁的內容
    const currentOwner = _body.getAttribute('data-tab-owner');

    // 如果 ID 沒變且不是「強制重刷」(force)，則不重置 DOM，避免捲軸跳動或輸入消失
    if (!force && currentOwner === String(cur.id)) {
      // 若分頁有定義 update 函數，則只進行局部數值更新（不刷掉 HTML）
      if (typeof cur.update === 'function') {
        try { cur.update(_body); } catch(e) { console.error("Update error:", e); }
      }
      return;
    }

    // 只有在「切換分頁」或「明確要求重繪」時才清空 HTML
    _body.innerHTML = '';
    _body.setAttribute('data-tab-owner', String(cur.id || ''));
    try {
      cur.render(_body);
    } catch (e) {
      _body.innerHTML = '<div style="color:red;padding:20px;">渲染發生錯誤: ' + e.message + '</div>';
    }
  }

  // --- 核心邏輯：切換分頁 ---
  function switchTo(id, force) {
    // 如果不是強制（UI點擊）且不開放程式切換，則忽略
    if (!force && !_progSwitchEnabled) return;

    const cur = getTab(id);
    if (!cur) return; // 防止切換到不存在的分頁導致跳回首頁

    if (_activeId === id && !force) return;

    const old = getTab(_activeId);
    if (old && typeof old.onClose === 'function') {
      try { old.onClose(); } catch(_) {}
    }

    _activeId = id;
    renderActive(true); // 切換時強制重繪

    if (cur && typeof cur.onOpen === 'function') {
      try { cur.onOpen(); } catch(_) {}
    }
    rebuildTabBar();
  }

  // --- UI 組件建構 ---
  function ensureModal() {
    if (_modal) return;
    const m = document.createElement('div');
    m.id = 'townHubModal';
    m.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.7);z-index:9999;padding:12px;';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:min(860px,96vw);max-height:92vh;overflow:hidden;background:#111827;color:#e5e7eb;border:1px solid #334155;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.5);font-family:system-ui,sans-serif;display:flex;flex-direction:column;';

    const head = document.createElement('div');
    head.style.cssText = 'background:#0f172a;padding:10px 16px;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between';
    head.innerHTML = '<div style="font-weight:800;font-size:1.1rem">🏙 城鎮中心</div>'+
                     '<button id="townHubClose" style="background:#ef4444;color:#fff;border:0;padding:4px 12px;border-radius:6px;cursor:pointer;font-weight:bold;">✖</button>';

    const tabs = document.createElement('div');
    tabs.id = 'townHubTabs';
    tabs.style.cssText = 'display:flex;gap:8px;padding:10px 12px;background:#0b1220;border-bottom:1px solid #1f2937;flex-wrap:wrap;';

    const body = document.createElement('div');
    body.id = 'townHubBody';
    body.style.cssText = 'padding:16px;overflow-y:auto;flex:1;';

    wrap.appendChild(head);
    wrap.appendChild(tabs);
    wrap.appendChild(body);
    m.appendChild(wrap);
    document.body.appendChild(m);

    _modal = m; _body = body; _tabBar = tabs;

    document.getElementById('townHubClose').onclick = close;
    m.onclick = function(e){ if (e.target === m) close(); };
  }

  function rebuildTabBar() {
    if (!_modal) ensureModal();
    _tabBar.innerHTML = '';
    for (let i = 0; i < _tabs.length; i++) {
      (function(def) {
        const btn = document.createElement('button');
        btn.textContent = def.title;
        const isActive = (_activeId === def.id);
        btn.style.cssText = 'background:' + (isActive ? '#2563eb' : '#334155') +
                            ';color:#fff;border:0;padding:8px 16px;border-radius:8px;cursor:pointer;transition:background 0.2s;';
        btn.onclick = function() { switchTo(def.id, true); };
        _tabBar.appendChild(btn);
      })(_tabs[i]);
    }
  }

  function registerTab(def) {
    if (!def || !def.id || !def.title) return;
    for (let i = 0; i < _tabs.length; i++) {
      if (_tabs[i].id === def.id) { _tabs[i] = def; return; }
    }
    _tabs.push(def);
    if (!_activeId) _activeId = def.id;
  }

  function open() {
    ensureModal();
    _modal.style.display = 'flex';
    rebuildTabBar();
    renderActive(true);
  }

  function close() {
    if (_modal) _modal.style.display = 'none';
    const t = getTab(_activeId);
    if (t && t.onClose) try { t.onClose(); } catch(_) {}
  }

  // --- 主迴圈：每秒觸發一次邏輯與重繪 ---
  function tickLoop() {
    const now = Date.now();
    const dt = Math.max(0, (now - _lastTick) / 1000);
    _lastTick = now;

    // 邏輯計時：處理各分頁的 tick (例如資源產出)
    _loopTickAccum += dt;
    if (_loopTickAccum >= 1) {
      const steps = Math.floor(_loopTickAccum);
      _loopTickAccum -= steps;
      for (let i = 0; i < _tabs.length; i++) {
        if (_tabs[i].tick) try { _tabs[i].tick(steps); } catch(e) {}
      }
    }

    // 渲染計時：處理畫面刷新
    _renderAccum += dt;
    if ((_modal && _modal.style.display === 'flex' && _renderAccum >= 1) || _rerenderPending) {
      const cur = getTab(_activeId);
      // 除非分頁設定 noAutoRerender，或是手動觸發 rerenderPending，否則進入渲染檢查
      if (_rerenderPending || (cur && !cur.noAutoRerender)) {
        renderActive(_rerenderPending);
      }
      _renderAccum = 0;
      _rerenderPending = false;
    }

    requestAnimationFrame(tickLoop);
  }

  // --- 初始化 ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureModal();
      requestAnimationFrame(tickLoop);
    });
  } else {
    ensureModal();
    requestAnimationFrame(tickLoop);
  }

  // --- 公開 API ---
  w.TownHub = {
    open,
    close,
    registerTab,
    enableProgrammaticSwitch(on) { _progSwitchEnabled = !!on; },
    switchTo,
    requestRerender() { _rerenderPending = true; },
    getActiveId() { return _activeId; }
  };

})(window);
