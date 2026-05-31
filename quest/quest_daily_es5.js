// quest_online_time_es5.js — 在線時間任務（每日/每週）V1（SaveHub 中央存檔）
(function () {
  "use strict";
  if (!window.QuestCore) return;

  // ====== SaveHub（中央存檔）======
  var SH = window.SaveHub;
  var NS = "quest:online:v1";

  var DAILY_THRESHOLDS = [
    { key: "m5",  minutes: 5,  reward: { star: 1, gem: 5  } },
    { key: "m10", minutes: 10, reward: { star: 1, gem: 5  } },
    { key: "m20", minutes: 20, reward: { star: 2, gem: 10 } },
    { key: "m30", minutes: 30, reward: { star: 2, gem: 15 } },
    { key: "m60", minutes: 60, reward: { star: 3, gem: 50 } }
  ];
  var WEEKLY_MINUTES = 360; // 6 hr
  var WEEKLY_REWARD = { star: 50 };

  function pad2(n){ return (n<10?"0":"")+n; }
  function dayKey(){
    var d=new Date(); return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
  }
  // ISO 週（簡化版：以週一為第一天）
  function weekKey(){
    var d = new Date(); var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(t.getUTCFullYear(),0,1));
    var weekNo = Math.ceil((((t - yearStart) / 86400000) + 1)/7);
    return t.getUTCFullYear() + "-W" + (weekNo<10?"0":"")+weekNo;
  }
  function defState(){
    return {
      _ver: 1,
      dayKey: dayKey(),
      daySecs: 0,
      dailyClaimed: { m5:false, m10:false, m20:false, m30:false, m60:false },
      weekKey: weekKey(),
      weekSecs: 0,
      weeklyClaimed: false
    };
  }
  function normalize(s){
    s = s && typeof s==="object" ? s : defState();
    s._ver = 1;
    if (s.dayKey !== dayKey()){ s.dayKey = dayKey(); s.daySecs = 0; s.dailyClaimed = { m5:false, m10:false, m20:false, m30:false, m60:false }; }
    if (s.weekKey !== weekKey()){ s.weekKey = weekKey(); s.weekSecs = 0; s.weeklyClaimed = false; }
    s.daySecs = Math.max(0, Number(s.daySecs||0)|0);
    s.weekSecs = Math.max(0, Number(s.weekSecs||0)|0);
    s.dailyClaimed = s.dailyClaimed || { m5:false, m10:false, m20:false, m30:false, m60:false };
    ["m5","m10","m20","m30","m60"].forEach(function(k){ s.dailyClaimed[k] = !!s.dailyClaimed[k]; });
    s.weeklyClaimed = !!s.weeklyClaimed;
    return s;
  }
  if (SH && typeof SH.registerNamespaces==="function"){
    SH.registerNamespaces({ [NS]: { version: 1, migrate: function(o){ return normalize(o); } } });
  }
  function load(){ try{ return normalize(SH ? SH.get(NS, defState()) : defState()); } catch(e){ return defState(); } }
  function save(s){ try{ if (SH) SH.set(NS, normalize(s), { replace:true }); } catch(e){} }

  // ====== 工具 ======
  function fmtHMS(sec){
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec/3600); sec -= h*3600;
    var m = Math.floor(sec/60);   sec -= m*60;
    return pad2(h)+":"+pad2(m)+":"+pad2(sec);
  }
  function log(msg){ if (typeof window.logPrepend==="function") window.logPrepend(msg); }
  function grant(rew){
    var st = Math.max(0, Number(rew.star||0)|0);
    var gm = Math.max(0, Number(rew.gem||0)|0);
    if (st>0){
      if (typeof window.addItem==="function") window.addItem("星痕代幣", st);
      else window.starToken = (window.starToken||0)+st;
    }
    if (gm>0 && window.player){ player.gem = (player.gem||0)+gm; }
    if (typeof window.updateResourceUI==="function") window.updateResourceUI();
    if (typeof window.saveGame==="function") window.saveGame();
  }

  // ====== 計時器（只在頁面可見時計時）======
  var state = load();
  var tickTimer = null;
  var lastTickAt = Date.now();
  function tickLoop(){
    var now = Date.now();
    var delta = Math.max(0, Math.floor((now - lastTickAt)/1000));
    lastTickAt = now;
    if (document.visibilityState === "visible" && delta>0){
      state = load(); // 拉新（以防外部同步）
      // 跨日/跨週自動歸零
      state = normalize(state);
      state.daySecs  += delta;
      state.weekSecs += delta;
      save(state);
      scheduleRender();
    }
  }
  function startTick(){ if (!tickTimer){ lastTickAt = Date.now(); tickTimer = setInterval(tickLoop, 1000); } }
  function stopTick(){ if (tickTimer){ clearInterval(tickTimer); tickTimer = null; } }
  document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "visible") startTick(); else stopTick(); });
  if (document.visibilityState === "visible") startTick();

  // ====== UI 繪製 ======
  var __renderTimer = null;
  function scheduleRender(){
    if (__renderTimer) return;
    __renderTimer = setTimeout(function(){ __renderTimer=null; try { renderActiveTab(); } catch(e){} }, 80);
  }

  function renderDaily(){
    var box = document.getElementById("questContent"); if (!box) return;
    var s = state; // 使用記憶體中狀態
    var html = "";
    html += '<div style="margin-bottom:8px;color:#9aa">今日在線：<b>'+fmtHMS(s.daySecs)+'</b></div>';
    DAILY_THRESHOLDS.forEach(function(t){
      var need = t.minutes*60;
      var done = s.daySecs >= need;
      var claimed = !!s.dailyClaimed[t.key];
      html += '<div style="border:1px solid #334155;background:#0b1220;border-radius:10px;padding:10px;margin-bottom:8px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                  '<div style="font-weight:800;">在線滿 '+t.minutes+' 分鐘</div>' +
                  '<div style="font-size:12px;color:#9aa">獎勵：星痕代幣 ×'+t.reward.star+'、鑽石 ×'+t.reward.gem+'</div>' +
                '</div>';
      var cur = Math.min(need, s.daySecs);
      var pct = need>0 ? Math.floor(cur/need*100) : 100;
      html += '<div style="height:8px;background:#111827;border:1px solid #233042;border-radius:999px;overflow:hidden;margin-bottom:6px;">' +
                '<div style="height:8px;width:'+pct+'%;background:#2d7;"></div>' +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div style="font-size:12px;color:#aaa;">'+Math.floor(cur/60)+' / '+t.minutes+' 分</div>';
      if (claimed){
        html += '<div style="color:#0a0;font-size:12px;">已領取</div>';
      }else if (done){
        html += '<button data-claim-d="'+t.key+'" style="padding:6px 10px;border:0;border-radius:8px;background:#2d7;color:#fff;font-weight:700;">領取</button>';
      }else{
        html += '<div style="color:#ccc;font-size:12px;">'+pct+'%</div>';
      }
      html += '</div></div>';
    });
    box.innerHTML = html;

    // 綁定每日領取
    var btns = box.querySelectorAll ? box.querySelectorAll("[data-claim-d]") : [];
    for (var i=0;i<btns.length;i++){
      (function(b){
        b.onclick = function(){
          var k = b.getAttribute("data-claim-d");
          state = load(); state = normalize(state);
          var def = DAILY_THRESHOLDS.find(function(x){ return x.key===k; });
          if (!def) return;
          if (state.dailyClaimed[k]) return;
          if (state.daySecs < def.minutes*60) return;
          state.dailyClaimed[k] = true; save(state);
          grant(def.reward);
          log("🎁 每日在線獎勵（"+def.minutes+" 分）→ 星痕代幣 ×"+def.reward.star+"、鑽石 ×"+def.reward.gem);
          scheduleRender();
        };
      })(btns[i]);
    }
  }

  function renderWeekly(){
    var box = document.getElementById("questContent"); if (!box) return;
    var s = state;
    var need = WEEKLY_MINUTES*60;
    var cur = Math.min(need, s.weekSecs);
    var pct = need>0 ? Math.floor(cur/need*100) : 100;
    var html = '';
    html += '<div style="margin-bottom:8px;color:#9aa">本週鍵：'+s.weekKey+'</div>';
    html += '<div style="border:1px solid #334155;background:#0b1220;border-radius:10px;padding:10px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                '<div style="font-weight:800;">每週任務：累積在線 '+WEEKLY_MINUTES+' 分鐘</div>' +
                '<div style="font-size:12px;color:#9aa">獎勵：星痕代幣 ×'+WEEKLY_REWARD.star+'</div>' +
              '</div>' +
              '<div style="height:8px;background:#111827;border:1px solid #233042;border-radius:999px;overflow:hidden;margin-bottom:6px;">' +
                '<div style="height:8px;width:'+pct+'%;background:#3b82f6;"></div>' +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div style="font-size:12px;color:#aaa;">'+Math.floor(cur/60)+' / '+WEEKLY_MINUTES+' 分</div>';
    if (s.weeklyClaimed){
      html += '<div style="color:#0a0;font-size:12px;">已領取</div>';
    } else if (s.weekSecs >= need){
      html += '<button id="btnWeeklyClaim" style="padding:6px 10px;border:0;border-radius:8px;background:#3b82f6;color:#fff;font-weight:700;">領取</button>';
    } else {
      html += '<div style="color:#ccc;font-size:12px;">'+pct+'%</div>';
    }
    html += '</div></div>';
    box.innerHTML = html;

    var btn = document.getElementById("btnWeeklyClaim");
    if (btn){
      btn.onclick = function(){
        state = load(); state = normalize(state);
        if (state.weeklyClaimed) return;
        if (state.weekSecs < WEEKLY_MINUTES*60) return;
        state.weeklyClaimed = true; save(state);
        grant(WEEKLY_REWARD);
        log("🎁 每週在線獎勵 → 星痕代幣 ×"+WEEKLY_REWARD.star);
        scheduleRender();
      };
    }
  }

  function renderActiveTab(){
    try{
      var tab = (QuestCore.getActiveTab && QuestCore.getActiveTab()) || "";
      if (tab === "daily") renderDaily();
      else if (tab === "weekly") renderWeekly();
    }catch(_){}
  }

  // ====== QuestCore 事件綁定（只在當前分頁渲染，不影響其他頁）======
  function onTabChange(){
    try{ renderActiveTab(); }catch(_){}
  }
  function init(){
    document.addEventListener("quest:tabchange", onTabChange);
    // 綁定分頁切換按鈕（若存在）
    var btnD = document.getElementById("tabDaily");   if (btnD) btnD.onclick = function(){ QuestCore.setTab("daily"); };
    var btnW = document.getElementById("tabWeekly");  if (btnW) btnW.onclick = function(){ QuestCore.setTab("weekly"); };

    // 初次顯示（若正位於其中一頁）
    try{ renderActiveTab(); }catch(_){}

    // SaveHub 外部變更同步
    if (SH && typeof SH.on==="function"){
      SH.on("change", function(ev){
        if (!ev || (ev.type!=="set" && ev.type!=="flush")) return;
        if (ev.ns && ev.ns !== NS) return;
        try{ state = load(); scheduleRender(); }catch(_){}
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  // Export/Import（給整包存檔工具）
  window.Online_exportState = function(){ return JSON.parse(JSON.stringify(state)); };
  window.Online_applyState = function(s){ if (!s || typeof s!=="object") return; state = normalize(s); save(state); scheduleRender(); };
})();