// =======================
// equipment_hub.js — 分頁容器（裝備系統專用）ES2020+（節流版）
// 與 town_hub.js 相同 API：EquipHub.registerTab / open / close / switchTo / requestRerender
// =======================
(function (w) {
  "use strict";

  function byId(id){ return document.getElementById(id); }

  const _tabs = []; // { id, title, render(containerEl), tick(dtSec), onOpen()?, onClose()? }
  let _activeId = null;
  let _modal = null;
  let _body = null;
  let _tabBar = null;

  let _lastTick = Date.now();
  let _renderAccum = 0;         // 每 ~1s 重繪
  let _loopTickAccum = 0;       // 每整秒才呼叫 tick
  let _rerenderPending = false; // 外部要求立即重繪

  function registerTab(def){
    if (!def || !def.id || !def.title || typeof def.render !== 'function') return;
    for (let i = 0; i < _tabs.length; i++) {
      if (_tabs[i].id === def.id) { _tabs[i] = def; rebuildTabBar(); return; }
    }
    _tabs.push(def);
    rebuildTabBar();
  }

  function ensureModal(){
    if (_modal) return;
    const m = document.createElement('div');
    m.id = 'equipHubModal';
    m.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.65);z-index:9999;padding:12px;';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:min(860px,96vw);max-height:92vh;overflow:hidden;background:#111827;color:#e5e7eb;border:1px solid #334155;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.5);font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;display:flex;flex-direction:column;';

    const head = document.createElement('div');
    head.style.cssText = 'background:#0f172a;padding:10px 12px;border-bottom:1px solid #334155;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between';
    head.innerHTML = '<div style="font-weight:800;letter-spacing:.5px">🛠 裝備系統</div>'+
                     '<button id="equipHubClose" style="background:#334155;color:#fff;border:0;padding:6px 10px;border-radius:8px;cursor:pointer">✖</button>';

    const tabs = document.createElement('div');
    tabs.id = 'equipHubTabs';
    tabs.style.cssText = 'display:flex;gap:8px;padding:8px 12px;background:#0b1220;border-bottom:1px solid #1f2937;flex-wrap:wrap;';

    const body = document.createElement('div');
    body.id = 'equipHubBody';
    body.style.cssText = 'padding:12px;overflow:auto;flex:1;';

    wrap.appendChild(head);
    wrap.appendChild(tabs);
    wrap.appendChild(body);
    m.appendChild(wrap);
    document.body.appendChild(m);

    _modal = m; _body = body; _tabBar = tabs;

    const btn = document.getElementById('equipHubClose');
    if (btn) btn.onclick = close;
    m.addEventListener('click', (e) =>{ if (e.target === m) close(); });

    // // 若需要飄浮開啟按鈕，取消下方註解即可
    // if (!byId('equipHubBtn')){
    //   var fb = document.createElement('button');
    //   fb.id = 'equipHubBtn';
    //   fb.innerHTML = '🛠 裝備系統';
    //   fb.style.cssText = 'position:fixed;right:12px;bottom:112px;z-index:10001;border:none;border-radius:10px;background:#4f46e5;color:#fff;padding:8px 12px;font-weight:700;';
    //   fb.onclick = open;
    //   document.body.appendChild(fb);
    // }
  }

  function rebuildTabBar(){
    if (!_modal) ensureModal();
    _tabBar.innerHTML = '';
    for (let i=0;i<_tabs.length;i++){
      (function(def){
        const btn = document.createElement('button');
        btn.textContent = def.title;
        btn.style.cssText = 'background:' + (_activeId===def.id?'#1d4ed8':'#1f2937') + ';color:#fff;border:0;padding:6px 10px;border-radius:8px;cursor:pointer';
        btn.onclick = function(){ switchTo(def.id); };
        _tabBar.appendChild(btn);
      })(_tabs[i]);
    }
    if (!_activeId && _tabs.length>0) switchTo(_tabs[0].id);
  }

  function switchTo(id){
    if (_activeId === id) return;
    const old = getTab(_activeId);
    const cur = getTab(id);
    if (!cur) return;
    if (old && typeof old.onClose === 'function') old.onClose();
    _activeId = id;
    renderActive();
    if (cur && typeof cur.onOpen === 'function') cur.onOpen();
    rebuildTabBar();
  }

  function getTab(id){
    for (let i=0;i<_tabs.length;i++) if (_tabs[i].id===id) return _tabs[i];
    return null;
  }

  function renderActive(){
    if (!_body) return;
    _body.innerHTML = '';
    const cur = getTab(_activeId);
    if (cur) cur.render(_body);
  }

  function open(){ ensureModal(); _modal.style.display='flex'; renderActive(); }
  function close(){ if(_modal) _modal.style.display='none'; const t=getTab(_activeId); if(t&&t.onClose) t.onClose(); }

  // 節流主迴圈：整秒 tick + 每秒重繪 or 立即重繪
  function tickLoop(){
    const now = Date.now();
    const dt = Math.max(0, (now - _lastTick) / 1000);
    _lastTick = now;

    _loopTickAccum += dt;
    if (_loopTickAccum >= 1) {
      const steps = Math.floor(_loopTickAccum);
      _loopTickAccum -= steps;
      for (let i=0;i<_tabs.length;i++){
        const def = _tabs[i];
        if (def && typeof def.tick === 'function') {
          try { def.tick(steps); } catch (e) { /* 忽略單一分頁錯誤 */ }
        }
      }
    }

    _renderAccum += dt;
    if ((_modal && _modal.style.display === 'flex' && _renderAccum >= 1) || _rerenderPending) {
      _renderAccum = 0;
      _rerenderPending = false;
      renderActive();
    }

    requestAnimationFrame(tickLoop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureModal);
  else ensureModal();
  requestAnimationFrame(tickLoop);

  w.EquipHub = {
    open,
    close,
    registerTab,
    switchTo,
    requestRerender(){ _rerenderPending = true; }
  };
})(window);