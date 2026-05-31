// gacha_medal.js — 怪物獎牌抽獎（分頁化，掛到 GachaHub；新版 UI + 新獎項機率）
// 依賴：GachaHub、getItemQuantity/removeItem/addItem、player.gold/stone/gem、logPrepend、updateResourceUI
(function (w) {
  "use strict";

  // ===== 基本設定 =====
  var MEDAL_NAME = "怪物獎牌";
  var COST_PER_PULL = 10;

  // ===== 工具 =====
  function randint(a, b){ return Math.floor(Math.random()*(b-a+1))+a; }
  function toPct(p){ return (Math.round(p*10000)/100).toFixed(2) + "%"; }
  function pad2(n){ return (n<10?"0":"")+n; }
  function nowHms(){
    var d = new Date();
    return pad2(d.getHours())+":"+pad2(d.getMinutes())+":"+pad2(d.getSeconds());
  }

// ===== 獎池 =====
  // 上半部：機率寫死（百分比改成小數）
  // 下半部：使用剩餘機率，依 weight 比例自動分配，未來新增不用東扣西扣
  var FIXED_POOL = [
    // === 機率寫死區 ===
    // 鑽石 1-50 機率 0.3%
    { name: "鑽石", type: "gem", min: 1, max: 50, prob: 0.003 },

    // 技能強化券 1-1 機率 0.02%
    { name: "技能強化券", type: "item", key: "技能強化券", min: 1, max: 1, prob: 0.002 },

    // SP點數券 1-3 機率 1%
    { name: "SP點數券", type: "item", key: "sp點數券", min: 1, max: 3, prob: 0.01 },

    // 生命藥水 2-5 機率 3%
    { name: "生命藥水", type: "item", key: "生命藥水", min: 2, max: 5, prob: 0.03 },

    // 高級生命藥水 1-3 機率 2%
    { name: "高級生命藥水", type: "item", key: "高級生命藥水", min: 1, max: 3, prob: 0.02 },

    // 超級生命藥水 1-1 機率 1%
    { name: "超級生命藥水", type: "item", key: "超級生命藥水", min: 1, max: 1, prob: 0.01 },

    // 法力藥水 2-5 機率 3%
    { name: "法力藥水", type: "item", key: "法力藥水", min: 2, max: 5, prob: 0.03 },

    // 高級法力藥水 1-3 機率 2%
    { name: "高級法力藥水", type: "item", key: "高級法力藥水", min: 1, max: 3, prob: 0.02 },

    // 頂級法力藥水 1-1 機率 1%
    { name: "超級法力藥水", type: "item", key: "超級法力藥水", min: 1, max: 1, prob: 0.01 },

    // 怪物硬幣N 3-5 機率 2%
    { name: "怪物硬幣N", type: "item", key: "怪物硬幣N", min: 3, max: 5, prob: 0.02 },

    // 怪物硬幣R 2-4 機率 1%
    { name: "怪物硬幣R", type: "item", key: "怪物硬幣R", min: 2, max: 4, prob: 0.01 },

    // 怪物硬幣SR 1-3 機率 0.7%
    { name: "怪物硬幣SR", type: "item", key: "怪物硬幣SR", min: 1, max: 3, prob: 0.007 }
  ];

  // 下半部：吃剩下的機率，不寫死機率，只給 weight（相對權重）
  // 目前三個：金幣 / 強化石 / 強化道具兌換券
  var FLEX_POOL = [
    {
      name: "楓幣",
      type: "gold",
      min: 1500,
      max: 5000,
      weight: 1
    },
    {
      name: "強化石",
      type: "stone",
      min: 300,
      max: 1500,
      weight: 1
    },
    {
      name: "強化道具兌換券",
      type: "item",
      key: "強化道具兌換券",
      min: 1,
      max: 5,
      weight: 1
    }
  ];

  // 最終獎池（normalize 時組合）
  var POOL = [];

  // 正規化（固定機率 + 剩餘機率按 weight 分給 FLEX_POOL）
  (function normalizePool(){
    // 1) 固定機率總和
    var fixedSum = 0;
    for (var i = 0; i < FIXED_POOL.length; i++) {
      fixedSum += Number(FIXED_POOL[i].prob || 0);
    }
    if (fixedSum > 1) fixedSum = 1; // 安全保險，避免手滑超過 100%

    // 2) 剩餘機率
    var leftover = 1 - fixedSum;
    if (leftover < 0) leftover = 0;

    // 3) FLEX 區：依 weight 分配剩餘機率
    var weightSum = 0;
    for (var j = 0; j < FLEX_POOL.length; j++) {
      var wgt = Number(FLEX_POOL[j].weight || 1);
      if (wgt < 0) wgt = 0;
      FLEX_POOL[j].weight = wgt;
      weightSum += wgt;
    }

    if (weightSum > 0 && leftover > 0) {
      for (var k = 0; k < FLEX_POOL.length; k++) {
        FLEX_POOL[k].prob = leftover * (FLEX_POOL[k].weight / weightSum);
      }
    } else {
      // 沒剩餘或沒 weight：FLEX_POOL 機率視為 0
      for (var k2 = 0; k2 < FLEX_POOL.length; k2++) {
        FLEX_POOL[k2].prob = 0;
      }
    }

    // 4) 組合最終 POOL
    POOL = FIXED_POOL.concat(FLEX_POOL);

    // 5) 再做一次 _prob 正規化，避免浮點誤差
    var sum = 0;
    for (var m = 0; m < POOL.length; m++) sum += Number(POOL[m].prob || 0);
    if (sum <= 0) {
      POOL[0].prob = 1;
      sum = 1;
    }
    for (var n = 0; n < POOL.length; n++) {
      POOL[n]._prob = (POOL[n].prob || 0) / sum;
    }
  })();

  // 正規化（安全保險；總和若為 0 或浮點偏差，仍會得到有效 _prob）
  (function normalizePool(){
    var sum = 0; for (var i=0;i<POOL.length;i++) sum += Number(POOL[i].prob||0);
    if (sum <= 0) { POOL[0].prob = 1; sum = 1; }
    for (var j=0;j<POOL.length;j++) POOL[j]._prob = (POOL[j].prob||0)/sum;
  })();

  // ===== 內部狀態（僅此分頁用）=====
  var state = {
    history: [] // { t: numberSec, text: "..." }
  };

  // ===== 核心：抽一次 =====
  function rollOne(){
    var x = Math.random(), acc = 0, pick = POOL[POOL.length-1];
    for (var i=0;i<POOL.length;i++){
      acc += POOL[i]._prob;
      if (x <= acc){ pick = POOL[i]; break; }
    }
    return {
      name: pick.name, type: pick.type, key: pick.key,
      qty: randint(pick.min, pick.max),
      min: pick.min, max: pick.max
    };
  }

  // ===== 發放獎勵 =====
  function grant(r){
    if (!r) return;
    switch (r.type){
      case "gold":  w.player.gold  = (w.player.gold  || 0) + r.qty; break;
      case "stone": w.player.stone = (w.player.stone || 0) + r.qty; break;
      case "gem":   w.player.gem   = (w.player.gem   || 0) + r.qty; break;
      case "item":
        if (typeof w.addItem === "function") w.addItem(r.key, r.qty);
        else {
          // 簡單備援背包
          w.player._bag = w.player._bag || {};
          w.player._bag[r.key] = (w.player._bag[r.key] || 0) + r.qty;
        }
        break;
    }
  }

  // ===== 消耗 / 判斷 =====
  function canSpend(times){
    times = Math.max(1, Math.floor(times||1));
    var need = COST_PER_PULL * times;
    var have = (typeof w.getItemQuantity === "function") ? w.getItemQuantity(MEDAL_NAME) : 0;
    return have >= need;
  }
  function spend(times){
    times = Math.max(1, Math.floor(times||1));
    var need = COST_PER_PULL * times;
    if (typeof w.removeItem === "function") w.removeItem(MEDAL_NAME, need);
  }

  // ===== UI: 渲染 =====
  function renderOddsTable(){
    var rows = POOL.map(function(p){
      var range = (p.min===p.max)? (""+p.min) : (p.min+"~"+p.max);
      return ''+
        '<div style="display:grid;grid-template-columns:1fr 90px 80px;gap:6px;padding:6px 8px;border-bottom:1px dashed #1f2937">'+
          '<div style="font-weight:600;color:#d3d7ff">'+p.name+'</div>'+
          '<div style="opacity:.9">數量：'+range+'</div>'+
          '<div style="text-align:right;font-variant-numeric:tabular-nums">'+toPct(p._prob)+'</div>'+
        '</div>';
    }).join("");
    return ''+
      '<div style="background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:10px;min-width:320px">'+
        '<div style="font-weight:800;margin-bottom:8px">📜 獎池與機率</div>'+
        '<div style="border:1px solid #1f2937;border-radius:8px;overflow:hidden">'+ rows +'</div>'+
      '</div>';
  }

  function renderHeader(hasQty){
    return ''+
      '<div style="background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:12px;flex:1">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">'+
          '<div>'+
            '<div style="font-weight:900;font-size:18px;margin-bottom:4px">🎰 怪物獎牌抽獎</div>'+
            '<div style="opacity:.9;line-height:1.5">每抽需 <b>'+COST_PER_PULL+'</b> × 「'+MEDAL_NAME+'」。目前持有：<b>'+hasQty+'</b></div>'+
          '</div>'+
          '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
            '<button id="medalOnceBtn" style="background:#4855d6;border:1px solid #6f79e8;color:#fff;border-radius:10px;padding:10px 14px;cursor:pointer;font-weight:700">單抽</button>'+
            '<button id="medalTenBtn"  style="background:#2f7d4f;border:1px solid #4faa78;color:#fff;border-radius:10px;padding:10px 14px;cursor:pointer;font-weight:700">十連</button>'+
            '<button id="medalClearBtn" style="background:#3a3a3a;color:#fff;border:1px solid #444;border-radius:10px;padding:10px 14px;cursor:pointer;font-weight:700">清空結果</button>'+
          '</div>'+
        '</div>'+
        '<div style="opacity:.8;margin-top:8px;font-size:12px">時間戳示例：'+nowHms()+'（本地時間）</div>'+
      '</div>';
  }

  function renderResultsList(){
    if (!state.history.length){
      return '<div style="opacity:.6">（結果會顯示在這裡）</div>';
    }
    var html = '';
    for (var i=state.history.length-1;i>=0;i--){
      var h = state.history[i];
      html += ''+
        '<div style="padding:8px 10px;border:1px solid #1f2937;border-radius:8px;margin-bottom:8px;background:rgba(30,41,59,.35)">'+
          '<div style="color:#aab;font-size:12px;margin-bottom:4px">['+h.tm+']</div>'+
          '<div>'+h.text+'</div>'+
        '</div>';
    }
    return html;
  }

  function render(container){
    var hasQty = (typeof w.getItemQuantity === "function") ? w.getItemQuantity(MEDAL_NAME) : 0;

    container.innerHTML =
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">'+
        renderHeader(hasQty) +
        renderOddsTable() +
      '</div>'+
      '<div style="margin-top:12px;background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:12px">'+
        '<div style="font-weight:800;margin-bottom:8px">🎯 抽獎結果</div>'+
        '<div id="medalResultBox" style="max-height:280px;overflow:auto">'+
          renderResultsList()+
        '</div>'+
      '</div>';

    // 綁定事件
    var onceBtn = container.querySelector('#medalOnceBtn');
    var tenBtn  = container.querySelector('#medalTenBtn');
    var clrBtn  = container.querySelector('#medalClearBtn');
    var resultBox = container.querySelector('#medalResultBox');

    function pushHistory(lineHtml){
      state.history.push({ tm: nowHms(), text: lineHtml });
      if (state.history.length > 200) state.history.shift();
      resultBox.innerHTML = renderResultsList();
    }

    if (onceBtn){
      onceBtn.onclick = function(){
        if (!canSpend(1)){ alert('需要 '+COST_PER_PULL+' 個「'+MEDAL_NAME+'」'); return; }
        spend(1);
        var r = rollOne();
        grant(r);
        w.updateResourceUI && w.updateResourceUI();
        var line = '單抽 → <b>'+r.name+' × '+r.qty+'</b>';
        pushHistory(line);
        if (typeof w.logPrepend === 'function') w.logPrepend('🎖️ 使用 '+MEDAL_NAME+' 抽獎：獲得「'+r.name+' × '+r.qty+'」');
        w.GachaHub && w.GachaHub.requestRerender && w.GachaHub.requestRerender();
      };
    }

    if (tenBtn){
      tenBtn.onclick = function(){
        if (!canSpend(10)){ alert('需要 '+(COST_PER_PULL*10)+' 個「'+MEDAL_NAME+'」'); return; }
        spend(10);
        var results = [];
        for (var i=0;i<10;i++){ var r = rollOne(); grant(r); results.push(r); }
        w.updateResourceUI && w.updateResourceUI();

        // 彙總（同名合併）
        var agg = {};
        for (var j=0;j<results.length;j++){
          var it = results[j];
          agg[it.name] = (agg[it.name] || 0) + it.qty;
        }
        var summary = Object.keys(agg).map(function(k){ return '<b>'+k+' × '+agg[k]+'</b>'; }).join('、');

        pushHistory('十連 → '+ summary);
        if (typeof w.logPrepend === 'function'){
          w.logPrepend('🌟 十連結果：'+ results.map(function(r){ return r.name+' × '+r.qty; }).join('、'));
        }
        w.GachaHub && w.GachaHub.requestRerender && w.GachaHub.requestRerender();
      };
    }

    if (clrBtn){
      clrBtn.onclick = function(){
        state.history = [];
        resultBox.innerHTML = renderResultsList();
        w.GachaHub && w.GachaHub.requestRerender && w.GachaHub.requestRerender();
      };
    }
  }

  function tick(){ /* 保留擴充 */ }

  // ===== 註冊到 GachaHub =====
  function registerIntoHub(){
    if (!w.GachaHub || typeof w.GachaHub.registerTab !== 'function') return;
    w.GachaHub.registerTab({
      id: 'gacha_medal',
      title: '怪物獎牌',
      render: render,
      tick: tick
    });
  }

  // 等 DOM Ready（或立即）註冊
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerIntoHub);
  else registerIntoHub();

  //（可選）保留舊 API 名稱
  w.openMedalGachaModal = function(){
    if (w.GachaHub){ w.GachaHub.open(); w.GachaHub.switchTo('gacha_medal'); }
  };
  w.medalGachaOnce = function(){
    if (!canSpend(1)) return null;
    spend(1);
    var r = rollOne();
    grant(r);
    w.updateResourceUI && w.updateResourceUI();
    state.history.push({ tm: nowHms(), text: '單抽 → <b>'+r.name+' × '+r.qty+'</b>' });
    if (typeof w.logPrepend === 'function') w.logPrepend('🎖️ 使用 '+MEDAL_NAME+' 抽獎：獲得「'+r.name+' × '+r.qty+'」');
    w.GachaHub && w.GachaHub.requestRerender && w.GachaHub.requestRerender();
    return r;
  };
  w.medalGachaTen = function(){
    if (!canSpend(10)) return null;
    spend(10);
    var results = [];
    for (var i=0;i<10;i++){ var r = rollOne(); grant(r); results.push(r); }
    w.updateResourceUI && w.updateResourceUI();

    // 彙總
    var agg = {};
    for (var j=0;j<results.length;j++){
      var it = results[j];
      agg[it.name] = (agg[it.name] || 0) + it.qty;
    }
    var line = '十連 → '+ Object.keys(agg).map(function(k){ return '<b>'+k+' × '+agg[k]+'</b>'; }).join('、');

    state.history.push({ tm: nowHms(), text: line });
    if (typeof w.logPrepend === 'function'){
      w.logPrepend('🌟 十連結果：'+ results.map(function(r){ return r.name+' × '+r.qty; }).join('、'));
    }
    w.GachaHub && w.GachaHub.requestRerender && w.GachaHub.requestRerender();
    return results;
  };

})(window);