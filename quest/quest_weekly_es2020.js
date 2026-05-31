// weekly_es2020.js — V2（動態讀取 missionRewards.weekly + 顯示獎勵）
(function(){
  if (!window.QuestCore) return;

  // ===== 設定 =====
  const STORAGE_KEY = 'WEEKLY_STATE_V2';

  // ===== 狀態 =====
  let weeklyState = {
    weekKey: '',
    doneCount: 0,
    claimed: {}
  };

  // ===== 小工具 =====
  function pad2(n){ return (n<10?'0':'')+n; }
  function weekKey(){ // 以該週「週一」為 key
    const d=new Date(), day=d.getDay(), diff=(day===0?-6:(1-day)), m=new Date(d.getFullYear(),d.getMonth(),d.getDate()+diff);
    return m.getFullYear()+'-'+pad2(m.getMonth()+1)+'-'+pad2(m.getDate());
  }
  function save(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(weeklyState)); }catch(e){} }
  function load(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw){ const o=JSON.parse(raw); if(o) weeklyState=o; }
    }catch(e){}
    const k=weekKey();
    if(weeklyState.weekKey!==k){
      weeklyState.weekKey = k;
      weeklyState.doneCount = 0;
      weeklyState.claimed = {};
    }
    ensureClaimedTargets();
    save();
  }

  function getWeeklyPacks(){
    let packs = (window.missionRewards && Array.isArray(window.missionRewards.weekly))
      ? window.missionRewards.weekly
      : [
          { target: 5,  rewards:[{type:"diamond",amount:5}] },
          { target: 10, rewards:[{type:"item",key:"高級探索券",amount:5}] },
          { target: 15, rewards:[{type:"diamond",amount:10}] },
          { target: 20, rewards:[{type:"item",key:"高級探索券",amount:10}] }
        ];
    packs = packs.slice().sort((a,b) =>{ return (a.target||0)-(b.target||0); });
    return packs;
  }

  function ensureClaimedTargets(){
    const packs = getWeeklyPacks();
    if (!weeklyState.claimed || typeof weeklyState.claimed!=='object') weeklyState.claimed = {};
    for (let i=0;i<packs.length;i++){
      const key = String(packs[i].target);
      if (typeof weeklyState.claimed[key] !== 'boolean') weeklyState.claimed[key] = false;
    }
    for (const k in weeklyState.claimed){
      if (!weeklyState.claimed.hasOwnProperty(k)) continue;
      let exists = false;
      for (let j=0;j<packs.length;j++){ if (String(packs[j].target)===k){ exists=true; break; } }
      if (!exists) delete weeklyState.claimed[k];
    }
  }

  // ===== 顯示用：獎勵轉字串 =====
  function rewardToText(rew){
    if(!rew || typeof rew!=='object') return '';
    const t=rew.type;
    if (t==='gold')    return '🪙 金幣 ×'+(rew.amount||0);
    if (t==='stone')   return '🪨 強化石 ×'+(rew.amount||0);
    if (t==='diamond') return '💎 鑽石 ×'+(rew.amount||0);
    if (t==='diamond_box'){
      const a=(rew.min||0), b=(rew.max||0);
      return '🎁 鑽石寶箱（'+a+'～'+b+'）';
    }
    if (t==='medal')   return '🏅 任務獎牌 ×'+(rew.amount||0);
    if (t==='item')    return '📦 '+(rew.key||'物品')+' ×'+(rew.amount||0);
    return '';
  }
  function weeklyRewardsText(target){
    const packs = getWeeklyPacks();
    for (let i=0;i<packs.length;i++){
      if (packs[i].target===target){
        const arr = packs[i].rewards || [];
        const out = [];
        for (let j=0;j<arr.length;j++){
          const s = rewardToText(arr[j]);
          if (s) out.push(s);
        }
        return out.join('、');
      }
    }
    return '';
  }

  // ===== 每日完成鉤子（由每日任務呼叫）=====
  window.Weekly_onDailyCompleted = function(){
    load();
    weeklyState.doneCount += 1;
    save();
    if (typeof QuestCore.getActiveTab === 'function' && QuestCore.getActiveTab()==='weekly') render();
  };

  // ===== 發獎 =====
  function grantReward(rew){
    const t=rew.type;
    if (t==='gold' && rew.amount>0){
      if (typeof player!=='undefined') player.gold=(player.gold||0)+rew.amount;
    } else if (t==='stone' && rew.amount>0){
      if (typeof player!=='undefined') player.stone=(player.stone||0)+rew.amount;
    } else if (t==='diamond' && rew.amount>0){
      if (typeof player!=='undefined') player.gem=(player.gem||0)+rew.amount;
    } else if (t==='diamond_box'){
      const v=(rew.min||0)+Math.floor(Math.random()*((rew.max||0)-(rew.min||0)+1));
      if (typeof player!=='undefined') player.gem=(player.gem||0)+v;
      if (typeof logPrepend === 'function') logPrepend('🎁 週寶箱開出 '+v+' 鑽石！');
    } else if (t==='medal' && rew.amount>0){
      if (typeof addItem === 'function') { addItem('任務獎牌', rew.amount); }
      else { window.missionMedal = (window.missionMedal || 0) + rew.amount; }
      if (typeof logPrepend === 'function') logPrepend('🏅 獲得任務獎牌 ×' + rew.amount);
    } else if (t==='item' && rew.key && rew.amount>0){
      if (typeof addItem === 'function') {
        addItem(rew.key, rew.amount);
        if (typeof logPrepend === 'function') logPrepend('🎟️ 獲得 ' + rew.key + ' ×' + rew.amount);
      }
    }
  }

  function claim(target){
    load();
    if (weeklyState.doneCount < target) return false;
    const k = String(target);
    if (weeklyState.claimed[k]) return false;

    const packs = getWeeklyPacks();
    let pack = null;
    for (let i=0;i<packs.length;i++){ if (packs[i].target===target){ pack=packs[i]; break; } }
    if (!pack) return false;

    for (let r=0;r<(pack.rewards||[]).length;r++) grantReward(pack.rewards[r]);
    weeklyState.claimed[k] = true;
    save();

    if (typeof updateResourceUI==='function') updateResourceUI();
    if (typeof logPrepend==='function') logPrepend('✅ 已領取每週里程碑獎勵（'+target+' 次）');
    if (typeof window.saveGame === 'function') saveGame();
    return true;
  }

  // ===== UI =====
  function nodeHTML(target){
    const done=weeklyState.doneCount, can=(done>=target), took=!!weeklyState.claimed[String(target)];
    const stateText = took ? '已領' : (can ? '可領' : '未達');
    const btnStyle='padding:6px 10px;border:none;border-radius:6px;'
               + (took ? 'background:#555;color:#aaa'
                       : 'background:'+(can?'#2d7':'#444')+';color:#fff');

    const rew = weeklyRewardsText(target);
    const rewHTML = rew ? '<div style="font-size:12px;color:#aaa;margin-top:4px">獎勵：'+rew+'</div>' : '';

    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin:8px 0;gap:12px;">'
         +   '<div><div>'+target+' 次</div>'+ rewHTML + '</div>'
         +   '<button data-week-claim="'+target+'" style="'+btnStyle+'">'+stateText+'</button>'
         + '</div>';
  }

  function render(){
    const box = document.getElementById('questContent'); if(!box) return;
    load();

    const packs = getWeeklyPacks();
    const maxTarget = packs.length ? packs[packs.length-1].target : 30;
    const done = weeklyState.doneCount;
    const pct = Math.floor(Math.min(100, (done / Math.max(1,maxTarget)) * 100));

    let html='';
    html += '<div style="margin-bottom:8px;color:#ddd;">本週完成每日任務：<b>'+done+'</b> / '+maxTarget+'</div>';
    html += '<div style="height:10px;background:#333;border-radius:8px;overflow:hidden;margin-bottom:10px;">'
         +   '<div style="height:10px;width:'+pct+'%;background:#48c;"></div>'
         + '</div>';

    for (let i=0;i<packs.length;i++){
      html += nodeHTML(packs[i].target);
    }
    box.innerHTML = html;

    const btns = box.querySelectorAll ? box.querySelectorAll('[data-week-claim]') : [];
    for (let j=0;j<btns.length;j++){
      (function(b){
        b.onclick=function(){
          const t = parseInt(b.getAttribute('data-week-claim'),10)||0;
          if (claim(t)) render();
        };
      })(btns[j]);
    }
  }

  // ===== 與 QuestCore 整合 =====
  function onTabChange(){ if (QuestCore.getActiveTab && QuestCore.getActiveTab()==='weekly') render(); }
  function init(){
    const btn=document.getElementById('tabWeekly');
    if(btn) btn.onclick=function(){ QuestCore.setTab('weekly'); };
    document.addEventListener('quest:tabchange', onTabChange);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();

  // ===== 匯出／匯入 =====
  window.Weekly_exportState = function () {
    return JSON.parse(JSON.stringify(weeklyState));
  };
  window.Weekly_applyState = function (s) {
    if (!s || typeof s !== 'object') return;
    weeklyState = Object.assign({}, weeklyState, s);
    load();
    save();
  };
})();