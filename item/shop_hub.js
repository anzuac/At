// shop_hub.js — 分頁容器（商店專用）
(function (w) {
  "use strict";

  var _tabs=[], _active=null, _m=null, _body=null, _bar=null;
  var _last=Date.now(), _accR=0, _accT=0, _req=false;

  function reg(def){
    if(!def||!def.id||!def.title||typeof def.render!=="function") return;
    for(var i=0;i<_tabs.length;i++){ if(_tabs[i].id===def.id){ _tabs[i]=def; rebuild(); return; } }
    _tabs.push(def); rebuild();
  }
  function ensure(){
    if(_m) return;
    var m=document.createElement("div");
    m.id="shopHubModal";
    m.style.cssText="position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.65);z-index:9999;padding:12px;";
    var wrap=document.createElement("div");
    wrap.style.cssText="width:min(860px,96vw);max-height:92vh;overflow:hidden;background:#111827;color:#e5e7eb;border:1px solid #334155;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.5);display:flex;flex-direction:column;";
    var head=document.createElement("div");
    head.style.cssText="background:#0f172a;padding:10px 12px;border-bottom:1px solid #334155;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between";
    head.innerHTML='<div style="font-weight:800;letter-spacing:.5px">🛒 商店</div><button id="shopHubClose" style="background:#334155;color:#fff;border:0;padding:6px 10px;border-radius:8px;cursor:pointer">✖</button>';
    var tabs=document.createElement("div");
    tabs.id="shopHubTabs";
    tabs.style.cssText="display:flex;gap:8px;padding:8px 12px;background:#0b1220;border-bottom:1px solid #1f2937;flex-wrap:wrap;";
    var body=document.createElement("div");
    body.id="shopHubBody";
    body.style.cssText="padding:12px;overflow:auto;flex:1;";
    wrap.appendChild(head); wrap.appendChild(tabs); wrap.appendChild(body); m.appendChild(wrap); document.body.appendChild(m);
    _m=m; _body=body; _bar=tabs;
    document.getElementById("shopHubClose").onclick=close;
    m.addEventListener("click", function(e){ if(e.target===m) close(); });
  }
  function rebuild(){
    ensure(); _bar.innerHTML="";
    for(var i=0;i<_tabs.length;i++){
      (function(def){
        var b=document.createElement("button");
        b.textContent=def.title;
        b.style.cssText='background:'+((_active&&_active===def.id)?'#1d4ed8':'#1f2937')+';color:#fff;border:0;padding:6px 10px;border-radius:8px;cursor:pointer';
        b.onclick=function(){ switchTo(def.id); };
        _bar.appendChild(b);
      })(_tabs[i]);
    }
    if(!_active && _tabs.length>0) switchTo(_tabs[0].id);
  }
  function get(id){ for(var i=0;i<_tabs.length;i++) if(_tabs[i].id===id) return _tabs[i]; return null; }
  function renderAct(){ if(!_body) return; _body.innerHTML=""; var t=get(_active); if(t) t.render(_body); }
  function switchTo(id){
    if(_active===id) return;
    var old=get(_active), cur=get(id); if(!cur) return;
    if(old && typeof old.onClose==="function") old.onClose();
    _active=id; renderAct();
    if(cur && typeof cur.onOpen==="function") cur.onOpen();
    rebuild();
  }
  function open(){ ensure(); _m.style.display="flex"; renderAct(); }
  function close(){ if(_m) _m.style.display="none"; var t=get(_active); if(t&&t.onClose) t.onClose(); }
  function loop(){}
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", ensure); else ensure();
  requestAnimationFrame(loop);

  w.ShopHub={ open:open, close:close, registerTab:reg, switchTo:switchTo, requestRerender:function(){ _req=true; } };
})(window);