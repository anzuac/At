// quest_repeat_es5.js — 重複任務（V4：數值合理化、UI 強化、自動消失彈窗）
(function(){
  if (!window.QuestCore) return;
  var SH = window.SaveHub;

  // ====== SaveHub（中央存檔）======
  var NS = 'repeat:v3';
  function defState(){
    return {
      _ver: 1,
      goldGain:0, stoneGain:0, diamondSpend:0, kills:0,
      done:{ goldGain:0, stoneGain:0, diamondSpend:0, kills:0 }
    };
  }
  function normalize(s){
    if (!s || typeof s!=='object') s = defState();
    s._ver = 1;
    s.goldGain = Math.max(0, Number(s.goldGain||0));
    s.stoneGain = Math.max(0, Number(s.stoneGain||0));
    s.diamondSpend = Math.max(0, Number(s.diamondSpend||0));
    s.kills = Math.max(0, Number(s.kills||0));
    s.done = s.done || { goldGain:0, stoneGain:0, diamondSpend:0, kills:0 };
    ['goldGain','stoneGain','diamondSpend','kills'].forEach(function(k){
      s.done[k] = Math.max(0, Number(s.done[k]||0));
    });
    return s;
  }

  if (SH && typeof SH.registerNamespaces === 'function') {
    SH.registerNamespaces({
      [NS]: { version: 1, migrate: function(old){ return normalize(old||defState()); } }
    });
  }

  function load(){
    try{
      if (!SH) return defState();
      return normalize(SH.get(NS, defState()));
    }catch(e){ return defState(); }
  }
  function save(s){
    try{ if (SH) SH.set(NS, normalize(s), { replace:true }); }catch(e){}
  }

  // ====== 任務定義與合理化數值 ======
  var QUESTS = [
    {
      kind: 'goldGain', title: '💰 金幣達人',
      desc: '累積獲得金幣，兌換稀有星痕代幣。',
      baseThresh: 500000,
      baseReward: [{type:'star', amount:2}],
      color: 'linear-gradient(90deg, #22c55e, #4ade80)'
    },
    {
      kind: 'stoneGain', title: '💎 礦藏大師',
      desc: '累積強化石，提升戰備資源。',
      baseThresh: 200000,
      baseReward: [{type:'star', amount:4}],
      color: 'linear-gradient(90deg, #10b981, #34d399)'
    },
    {
      kind: 'diamondSpend', title: '✨ 豪擲千金',
      desc: '消費鑽石達標，獲得額外鑽石回饋。',
      baseThresh: 5000,
      baseReward: [{type:'diamond', amount:150}],
      color: 'linear-gradient(90deg, #f59e0b, #fbbf24)'
    },
    {
      kind: 'kills', title: '⚔️ 狩獵連環',
      desc: '勤奮狩獵，獲取強化石與代幣獎勵。',
      baseThresh: 50,
      baseReward: [{type:'stone', amount:50},{type:'star', amount:2}],
      color: 'linear-gradient(90deg, #3b82f6, #60a5fa)'
    }
  ];

  var THRESH_MUL = 1.25;   // 難度成長合理化
  var REWARD_MUL = 1.15;   // 獎勵成長合理化
  var state = load();

  // ====== 工具 ======
  function fmt(n){ return Math.floor(n||0).toLocaleString(); }
  function pct(cur,max){ return (max>0)? Math.max(0, Math.min(100, Math.floor((cur/max)*100))) : 0; }
  function round56(x){ var neg = x<0; x = Math.abs(x); var i = Math.floor(x), f = x - i; var r = (f>=0.6) ? (i+1) : i; return neg ? -r : r; }

  function currentThresh(q){
    return Math.max(1, Math.floor(q.baseThresh * Math.pow(THRESH_MUL, state.done[q.kind]||0)));
  }
  function rewardPackFor(q){
    var mul = Math.pow(REWARD_MUL, state.done[q.kind]||0);
    return q.baseReward.map(function(r){
      return {type:r.type, amount: Math.max(1, round56((r.amount||0)*mul))};
    });
  }

  // ====== 彈窗通知系統 ======
  function showToast(title, rewards) {
    var container = document.getElementById('quest-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'quest-toast-container';
      container.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;align-items:center;pointer-events:none;';
      document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    var rewardText = rewards.map(function(r){
      var name = (r.type==='diamond'?'鑽石':(r.type==='star'?'星痕代幣':(r.type==='gold'?'金幣':(r.type==='stone'?'強化石':r.type))));
      return name + ' ×' + fmt(r.amount);
    }).join('、');

    toast.style.cssText = 'background:rgba(15,23,42,0.95);color:#fff;padding:12px 24px;border-radius:12px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.2);box-shadow:0 10px 25px rgba(0,0,0,0.5);transform:translateY(-20px);opacity:0;transition:all 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);backdrop-filter:blur(8px);';
    toast.innerHTML = '<div style="font-weight:bold;color:#fbbf24;text-align:center;font-size:14px;margin-bottom:4px;">✅ 任務達成！</div>' +
                      '<div style="font-size:13px;text-align:center;">' + title + ' 完成</div>' +
                      '<div style="font-size:12px;color:#a78bfa;margin-top:4px;text-align:center;">獲得：' + rewardText + '</div>';

    container.appendChild(toast);
    setTimeout(function(){ toast.style.transform = 'translateY(0)'; toast.style.opacity = '1'; }, 10);
    
    setTimeout(function(){
      toast.style.transform = 'translateY(-20px)';
      toast.style.opacity = '0';
      setTimeout(function(){ if(toast.parentNode) container.removeChild(toast); }, 400);
    }, 3500);
  }

  function grant(rew){
    var t=rew.type, a=Math.max(0, Math.floor(rew.amount||0));
    if (a<=0) return;
    if (t==='gold'){ if (window.player) player.gold=(player.gold||0)+a; }
    else if (t==='stone'){ if (window.player) player.stone=(player.stone||0)+a; }
    else if (t==='diamond'){ if (window.player) player.gem=(player.gem||0)+a; }
    else if (t==='star'){
      if (typeof addItem === 'function') addItem('星痕代幣', a);
      else window.starToken = (window.starToken||0)+a;
    }
  }
  function grantPack(list){ for(var i=0;i<(list||[]).length;i++) grant(list[i]); if (window.updateResourceUI) updateResourceUI(); }

  // ====== 核心結算與 UI ======
  function isActiveTab(){ try{ return QuestCore.getActiveTab && QuestCore.getActiveTab()==='repeatables'; }catch(_){ return false; } }
  var __dirty = false;
  var __rerenderTimer = null;
  function scheduleRender(force){
    if (!force && !isActiveTab()) { __dirty = true; return; }
    if (__rerenderTimer) return;
    __rerenderTimer = setTimeout(function(){
      __rerenderTimer = null;
      if (!isActiveTab()) { __dirty = true; return; }
      try { render(); __dirty = false; } catch(e){}
    }, 0);
  }

  var __settling = false;
  function settleQuest(q, counterKey){
    if (__settling) return;
    __settling = true;
    try {
      var need = currentThresh(q);
      var cur  = Math.max(0, state[counterKey]||0);
      if (cur >= need){
        state[counterKey] = 0;
        state.done[q.kind] = (state.done[q.kind]||0) + 1;
        var rewards = rewardPackFor(q);
        grantPack(rewards);
        save(state);
        showToast(q.title, rewards); // 彈窗通知
        scheduleRender(true);
      } else {
        save(state);
        scheduleRender(false);
      }
    } finally { __settling = false; }
  }

  // 事件回調與全局掛載
  function onGoldGained(a){ if(a>0){ state.goldGain+=a; settleQuest(QUESTS[0],'goldGain'); } }
  function onStoneGained(a){ if(a>0){ state.stoneGain+=a; settleQuest(QUESTS[1],'stoneGain'); } }
  function onDiamondSpent(a){ if(a>0){ state.diamondSpend+=a; settleQuest(QUESTS[2],'diamondSpend'); } }
  function onKills(k){ if(k>0){ state.kills+=k; settleQuest(QUESTS[3],'kills'); } }

  function wrapGlobal(fnName, wrapper){
    var old=window[fnName];
    window[fnName]=function(){
      if(typeof old==='function'){ try{ old.apply(this, arguments); }catch(e){} }
      try{ wrapper.apply(this, arguments); }catch(e){}
    };
  }
  wrapGlobal('DM_onGoldGained', onGoldGained);
  wrapGlobal('DM_onStoneGained', onStoneGained);
  wrapGlobal('DM_onMonsterKilled', onKills);
  window.RM_onDiamondSpent = function(v){ onDiamondSpent(v||0); };

  function cardHTML(q, curVal, needVal, doneTimes){
    var rewards = rewardPackFor(q).map(function(r){
      var name = (r.type==='diamond'?'鑽石':(r.type==='star'?'星痕代幣':(r.type==='gold'?'金幣':(r.type==='stone'?'強化石':r.type))));
      return '<span style="color:#fff;font-weight:bold">'+name+' ×'+fmt(r.amount)+'</span>';
    }).join('、');
    var bar = pct(curVal, needVal);
    return ''+
      '<div style="border:1px solid rgba(255,255,255,0.1);border-radius:16px;background:linear-gradient(145deg, #111827, #0b1220);padding:16px;margin-bottom:12px;box-shadow: 0 4px 15px rgba(0,0,0,0.3);">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'+
          '<div style="font-size:15px;font-weight:900;letter-spacing:1px;color:#f3f4f6">'+q.title+'</div>'+
          '<div style="background:rgba(255,255,255,0.05);padding:2px 10px;border-radius:20px;font-size:11px;color:#9ca3af;border:1px solid rgba(255,255,255,0.1)">已完成：<b style="color:#fff">'+fmt(doneTimes)+'</b></div>'+
        '</div>'+
        '<div style="color:#9ca3af;font-size:12px;margin-bottom:12px;line-height:1.4">'+q.desc+'</div>'+
        '<div style="background:rgba(0,0,0,0.2);padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.03)">'+
          '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px;color:#d1d5db">'+
            '<span>進度: <b>'+fmt(curVal)+'</b> / '+fmt(needVal)+'</span>'+
            '<span>'+bar+'%</span>'+
          '</div>'+
          '<div style="height:8px;background:#1f2937;border-radius:10px;overflow:hidden;margin-bottom:10px">'+
            '<div style="height:100%;width:'+bar+'%;background:'+q.color+';box-shadow:0 0 8px rgba(255,255,255,0.1);transition:width 0.3s ease"></div>'+
          '</div>'+
          '<div style="font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:6px">'+
            '<span style="background:#374151;padding:1px 6px;border-radius:4px;color:#eee;font-size:10px">獎勵</span>'+
            '<span>'+rewards+'</span>'+
          '</div>'+
        '</div>'+
      '</div>';
  }

  function render(){
    var box=document.getElementById('questContent'); if(!box) return;
    var html='';
    QUESTS.forEach(function(q){
      html += cardHTML(q, state[q.kind]||0, currentThresh(q), state.done[q.kind]||0);
    });
    box.innerHTML=html;
  }

  function onTabChange(){
    if (QuestCore.getActiveTab && QuestCore.getActiveTab()==='repeatables'){
      if (__dirty) { render(); __dirty=false; } else { render(); }
    }
  }

  function init(){
    var btn=document.getElementById('tabRepeatables');
    if(btn) btn.onclick=function(){ QuestCore.setTab('repeatables'); };
    document.addEventListener('quest:tabchange', onTabChange);
    scheduleRender(true);
    if (SH && typeof SH.on === 'function') {
      SH.on('change', function(ev){
        if (!ev || (ev.type!=='set' && ev.type!=='flush')) return;
        if (ev.ns && ev.ns !== NS) return;
        state = normalize(SH.get(NS, defState()));
        scheduleRender(false);
      });
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.Repeat_exportState = function () { return JSON.parse(JSON.stringify(state)); };
  window.Repeat_applyState = function (s) { state = normalize(s); save(state); scheduleRender(true); };
})();
