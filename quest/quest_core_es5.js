// quest_core_es5.js －－ 任務主控（彈窗殼＋分頁事件＋可滑動內容）
(function(){
  var active = 'daily';
  function byId(id){ return document.getElementById(id); }
  function setActiveTabStyle(tab){
    var tabs = document.getElementsByClassName('quest-tab'), i;
    for(i=0;i<tabs.length;i++){
      var t = tabs[i], on = (t.getAttribute('data-tab') === tab);
      t.style.boxShadow = on ? 'inset 0 0 0 2px rgba(255,255,255,.45)' : 'none';
    }
  }
  function dispatchTabChange(){
    var ev; try{ ev=document.createEvent('Event'); ev.initEvent('quest:tabchange',true,true);}catch(e){}
    if(ev) document.dispatchEvent(ev);
  }

// 動態建立彈窗殼（內容區可下滑，分頁列固定）
function ensureModalShell(){
  if (byId('questModal')) return;

  var wrap = document.createElement('div');
  wrap.id='questModal';
  wrap.style.cssText='position:fixed;left:0;top:0;right:0;bottom:0;display:none;background:rgba(0,0,0,.6);z-index:9999;';
  wrap.innerHTML =
    '<div style="position:relative;margin:40px auto;background:#222;color:#fff;border:1px solid #888;border-radius:8px;width:90vw;max-width:350px;max-height:80vh;box-sizing:border-box;display:flex;flex-direction:column;">' +
      '<div style="position:sticky;top:0;background:#111;color:#fff;padding:8px;border-radius:8px 8px 0 0;z-index:2;">' +
        '<button id="tabDaily"        class="quest-tab" data-tab="daily"        style="background:#2d7;border:none;border-radius:6px;color:#fff;padding:6px 8px;margin-right:6px">📅 每日任務</button>' +
        '<button id="tabWeekly"       class="quest-tab" data-tab="weekly"       style="background:#3aa;border:none;border-radius:6px;color:#fff;padding:6px 8px;margin-right:6px">🗓️ 每週任務</button>' +
        '<button id="tabAchievements" class="quest-tab" data-tab="achievements" style="background:#48c;border:none;border-radius:6px;color:#fff;padding:6px 8px;margin-right:6px">🏆 成就任務</button>' +
        '<button id="tabRepeatables"  class="quest-tab" data-tab="repeatables"  style="background:#c85;border:none;border-radius:6px;color:#fff;padding:6px 8px;margin-right:6px">🔁 重複任務</button>' +
        '<button id="questClose" style="position:absolute;right:8px;top:6px;border:none;background:transparent;color:#fff;font-size:16px;cursor:pointer">✖</button>' +
      '</div>' +
      '<div id="questContent" ' +
           'style="padding:10px;color:#ccc;flex:1;min-height:160px;overflow-y:auto;'+
                  '-webkit-overflow-scrolling:touch;overscroll-behavior:contain;">（此處由分頁 JS 插入內容）</div>' +
    '</div>';

  document.body.appendChild(wrap);

  // ✅ 綁定各分頁按鈕：切換分頁 → 更新樣式 → 發出事件，讓分頁模組去渲染內容
  var tabs = wrap.querySelectorAll('.quest-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () {
      active = this.getAttribute('data-tab');
      setActiveTabStyle(active);
      dispatchTabChange();
    });
  }

  // 關閉按鈕
  var closeBtn = wrap.querySelector('#questClose');
  if (closeBtn) closeBtn.addEventListener('click', function(){ window.QuestCore.close(); });

  // 點遮罩關閉
  if (wrap.addEventListener){
    wrap.addEventListener('click', function(e){ if (e.target===wrap) window.QuestCore.close(); });
  }
}

  // 對外 API
  window.QuestCore = {
    open: function(tab){ if(tab) active=tab; ensureModalShell(); byId('questModal').style.display='block'; setActiveTabStyle(active); dispatchTabChange(); },
    close: function(){ var m=byId('questModal'); if(m) m.style.display='none'; },
    setTab: function(tab){ active=tab; setActiveTabStyle(active); dispatchTabChange(); },
    getActiveTab: function(){ return active; }
  };

  function init(){
    ensureModalShell();
    var openBtn=byId('questBtn'), closeBtn=byId('questClose');
    if(openBtn){ openBtn.onclick=function(){ window.QuestCore.open('daily'); }; }
    else {/**
      // 沒主頁按鈕就自動塞一顆測試用
      var testBtn=document.createElement('button');
      testBtn.id='questBtn';
      testBtn.innerHTML='🗒️ 任務／成就';
      testBtn.style.cssText='position:fixed;right:12px;bottom:12px;z-index:10001;border:none;border-radius:10px;background:#2d7;color:#fff;padding:8px 12px;font-weight:700;';
      testBtn.onclick=function(){ window.QuestCore.open('daily'); };
      document.body.appendChild(testBtn);*/
    }
    if(closeBtn) closeBtn.onclick=function(){ window.QuestCore.close(); };
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();