// =======================
// skills_hub.js — 分頁容器（技能 Hub，ES5 空殼）
// =======================
(function (w) {
  "use strict";

  function byId(id){ return document.getElementById(id); }

  var _tabs = [];
  var _activeId = null;
  var _modal = null;
  var _body = null;
  var _tabBar = null;
  var _lastTick = Date.now();
  var _renderAccum = 0;
  var _loopTickAccum = 0;
  var _rerenderPending = false;

  function registerTab(def){
    // def: { id, title, render(container), onOpen?, onClose?, tick?(steps:number) }
    if (!def || !def.id || !def.title || typeof def.render !== 'function') return;
    for (var i = 0; i < _tabs.length; i++) {
      if (_tabs[i].id === def.id) { _tabs[i] = def; rebuildTabBar(); return; }
    }
    _tabs.push(def);
    rebuildTabBar();
  }

  function ensureModal(){
    if (_modal) return;
    var m = document.createElement('div');
    m.id = 'skillsHubModal';
    m.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.65);z-index:9999;padding:12px;';

    var wrap = document.createElement('div');
    wrap.style.cssText = 'width:min(860px,96vw);max-height:92vh;overflow:hidden;background:#111827;color:#e5e7eb;border:1px solid #334155;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.5);font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;display:flex;flex-direction:column;';

    var head = document.createElement('div');
    head.style.cssText = 'background:#0f172a;padding:10px 12px;border-bottom:1px solid #334155;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between';
    head.innerHTML = '<div style="font-weight:800;letter-spacing:.5px">🧠 技能 Hub</div>'+
                     '<button id="skillsHubClose" style="background:#334155;color:#fff;border:0;padding:6px 10px;border-radius:8px;cursor:pointer">✖</button>';

    var tabs = document.createElement('div');
    tabs.id = 'skillsHubTabs';
    tabs.style.cssText = 'display:flex;gap:8px;padding:8px 12px;background:#0b1220;border-bottom:1px solid #1f2937;flex-wrap:wrap;';

    var body = document.createElement('div');
    body.id = 'skillsHubBody';
    body.style.cssText = 'padding:12px;overflow:auto;flex:1;';

    wrap.appendChild(head);
    wrap.appendChild(tabs);
    wrap.appendChild(body);
    m.appendChild(wrap);
    document.body.appendChild(m);

    _modal = m; _body = body; _tabBar = tabs;

    var btn = byId('skillsHubClose');
    if (btn) btn.onclick = close;
    m.addEventListener('click', function(e){ if (e.target === m) close(); });
  }

  function rebuildTabBar(){
    if (!_modal) ensureModal();
    _tabBar.innerHTML = '';
    for (var i=0;i<_tabs.length;i++){
      (function(def){
        var btn = document.createElement('button');
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
    var old = getTab(_activeId);
    var cur = getTab(id);
    if (!cur) return;
    if (old && typeof old.onClose === 'function') old.onClose();
    _activeId = id;
    renderActive();
    if (cur && typeof cur.onOpen === 'function') cur.onOpen();
    rebuildTabBar();
  }

  function getTab(id){ for (var i=0;i<_tabs.length;i++) if (_tabs[i].id===id) return _tabs[i]; return null; }

  function renderActive(){
    if (!_body) return;
    _body.innerHTML = '';
    var cur = getTab(_activeId);
    if (cur) try { cur.render(_body); } catch(e) { /* 靜默失敗 */ }
  }

  function open(){ ensureModal(); _modal.style.display='flex'; renderActive(); }
  function close(){ if(_modal) _modal.style.display='none'; var t=getTab(_activeId); if(t&&t.onClose) t.onClose(); }

  // 與 townHub 節流節拍一致：tick 每秒呼叫、render 每秒或請求時重繪
  function tickLoop(){
    var now = Date.now();
    var dt = Math.max(0, (now - _lastTick) / 1000);
    _lastTick = now;
    _loopTickAccum += dt;
    if (_loopTickAccum >= 1) {
      var steps = Math.floor(_loopTickAccum);
      _loopTickAccum -= steps;
      for (var i=0;i<_tabs.length;i++){
        var def = _tabs[i];
        if (def && typeof def.tick === 'function') try{ def.tick(steps); }catch(e){}
      }
    }
    _renderAccum += dt;
    if ((_modal && _modal.style.display === 'flex' && _renderAccum >= 1) || _rerenderPending) {
      _renderAccum = 0; _rerenderPending = false; renderActive();
    }
    requestAnimationFrame(tickLoop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureModal);
  else ensureModal();
  requestAnimationFrame(tickLoop);

  w.SkillsHub = {
    open: open,
    close: close,
    registerTab: registerTab,
    switchTo: switchTo,
    requestRerender: function(){ _rerenderPending = true; }
  };
})(window);