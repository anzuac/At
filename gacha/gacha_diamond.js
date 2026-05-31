// gacha_diamond.js — 鑽石抽獎（分頁化，掛到 GachaHub）
// 依賴：GachaHub、getItemQuantity/removeItem、player.gem、logPrepend、updateResourceUI

(function (w) {
  "use strict";

  // ===== 基本設定 =====
  var TICKET_NAME = "鑽石抽獎券";
  var COST_PER_PULL = 1;

  // ===== 工具 =====
  function randint(a, b){ return Math.floor(Math.random()*(b-a+1))+a; }

  // ===== 機率規則 =====
  // 固定獎：
  // 500 鑽石 / 0.01%
  // 300 鑽石 / 0.1%
  // 150 鑽石 / 1%
  // 100 鑽石 / 2%
  //  50 鑽石 / 5%
  //  30 鑽石 / 10%
  // 其餘（81.89%）→ 隨機 1~20 鑽石
  var FIXED_PRIZES = [
    { qty: 500, p: 0.0001 },
    { qty: 300, p: 0.001  },
    { qty: 150, p: 0.01   },
    { qty: 100, p: 0.02   },
    { qty:  50, p: 0.05   },
    { qty:  30, p: 0.10   },
  ];
  var FIXED_SUM = FIXED_PRIZES.reduce(function(s, x){ return s + x.p; }, 0); // = 0.1811
  var RANDOM_P = Math.max(0, 1 - FIXED_SUM); // 0.8189

  // ===== 內部狀態（此分頁用）=====
  var state = { history: [], showTable: false };

  // ===== 核心：抽一次 =====
  function pullOnce() {
    var x = Math.random();
    var acc = 0;
    for (var i=0;i<FIXED_PRIZES.length;i++){
      acc += FIXED_PRIZES[i].p;
      if (x <= acc) return FIXED_PRIZES[i].qty;
    }
    // 進到隨機區間
    return randint(1, 20);
  }

  // ===== 發放獎勵 =====
  function grantGems(qty){
    w.player.gem = (w.player.gem || 0) + qty;
  }

  // ===== 消耗 / 判斷 =====
  function canSpend(times){
    times = Math.max(1, Math.floor(times||1));
    var need = COST_PER_PULL * times;
    var have = (typeof w.getItemQuantity === "function") ? w.getItemQuantity(TICKET_NAME) : 0;
    return have >= need;
  }
  function spend(times){
    times = Math.max(1, Math.floor(times||1));
    var need = COST_PER_PULL * times;
    if (typeof w.removeItem === "function") w.removeItem(TICKET_NAME, need);
  }

  // ===== UI：渲染 =====
  function fmtTime(sec){
    var d = new Date(sec*1000);
    var hh = String(d.getHours()).padStart(2,"0");
    var mm = String(d.getMinutes()).padStart(2,"0");
    var ss = String(d.getSeconds()).padStart(2,"0");
    return hh+":"+mm+":"+ss;
  }

  function render(container){
    var hasTicket = (typeof w.getItemQuantity === "function") ? (w.getItemQuantity(TICKET_NAME) || 0) : 0;

    var tableHtml =
      '<div id="diamondProbTable" style="display:'+(state.showTable?'block':'none')+';margin-top:8px;padding:8px;border:1px solid #1f2937;border-radius:8px;background:#0b1220;line-height:1.8;">'+
        '<div>‧ 500💎：<b>0.01%</b></div>'+
        '<div>‧ 300💎：<b>0.10%</b></div>'+
        '<div>‧ 150💎：<b>1.00%</b></div>'+
        '<div>‧ 100💎：<b>2.00%</b></div>'+
        '<div>‧  50💎：<b>5.00%</b></div>'+
        '<div>‧  30💎：<b>10.00%</b></div>'+
        '<div>‧  1~20💎：<b>剩餘機率 ('+(RANDOM_P*100).toFixed(2)+'%)</b></div>'+
      '</div>';

    container.innerHTML =
      '<div style="background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:12px">'+
        '<div style="font-weight:800;margin-bottom:6px">💎 鑽石抽獎</div>'+
        '<div style="opacity:.9;line-height:1.6">消耗：每抽 <b>'+COST_PER_PULL+'</b> 張「'+TICKET_NAME+'」。目前持有：<b>'+hasTicket+'</b></div>'+
        '<div style="display:flex;gap:8px;margin-top:10px">'+
          '<button id="diaOnceBtn" style="flex:1;background:#2d3463;border:1px solid #5765a0;color:#fff;border-radius:8px;padding:10px;cursor:pointer">單抽</button>'+
          '<button id="diaTenBtn"  style="flex:1;background:#2f4f2f;border:1px solid #6b8f5b;color:#fff;border-radius:8px;padding:10px;cursor:pointer">十連</button>'+
        '</div>'+
        '<div style="margin-top:8px">'+
          '<button id="toggleTableBtn" style="background:#3a3a3a;color:#fff;border:1px solid #444;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px">'+
            (state.showTable? '隱藏機率表' : '顯示機率表')+
          '</button>'+
          tableHtml+
        '</div>'+
      '</div>'+

      '<div style="background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:12px">'+
        '<div style="font-weight:700;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">'+
          '<span>抽獎結果</span>'+
          '<button id="diaClearBtn" style="background:#3a3a3a;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px">清空結果</button>'+
        '</div>'+
        '<div id="diaResultBox" style="max-height:240px;overflow:auto;border:1px solid #1f2937;border-radius:6px;padding:6px 8px;background:#0b1220">'+
          (state.history.length? '' : '<div style="opacity:.6">（結果會顯示在這裡）</div>')+
        '</div>'+
      '</div>';

    // 結果列表
    var box = container.querySelector('#diaResultBox');
    if (state.history.length){
      var html = '';
      for (var i=state.history.length-1;i>=0;i--){
        var h = state.history[i];
        html += '<div style="padding:4px 0;border-bottom:1px dashed #1f2937"><span style="color:#aab;margin-right:6px;font-size:12px">['+fmtTime(h.t)+']</span>'+h.text+'</div>';
      }
      box.innerHTML = html;
    }

    // 綁定事件
    var onceBtn = container.querySelector('#diaOnceBtn');
    var tenBtn  = container.querySelector('#diaTenBtn');
    var clrBtn  = container.querySelector('#diaClearBtn');
    var toggle  = container.querySelector('#toggleTableBtn');

    if (onceBtn){
      onceBtn.onclick = function(){
        if (!canSpend(1)){ alert('需要 '+COST_PER_PULL+' 張「'+TICKET_NAME+'」'); return; }
        spend(1);
        var qty = pullOnce();
        grantGems(qty);
        w.updateResourceUI && w.updateResourceUI();
        if (typeof w.logPrepend === 'function') w.logPrepend('💎 鑽石單抽：獲得『鑽石 × '+qty+'』');
        state.history.push({ t: Math.floor(Date.now()/1000), text: '單抽：<b>鑽石 × '+qty+'</b>' });
        if (state.history.length > 200) state.history.shift();
        w.GachaHub && w.GachaHub.requestRerender && w.GachaHub.requestRerender();
      };
    }

    if (tenBtn){
      tenBtn.onclick = function(){
        if (!canSpend(10)){ alert('需要 '+(COST_PER_PULL*10)+' 張「'+TICKET_NAME+'」'); return; }
        spend(10);
        var results = [];
        for (var i=0;i<10;i++){ results.push(pullOnce()); grantGems(results[i]); }
        w.updateResourceUI && w.updateResourceUI();
        if (typeof w.logPrepend === 'function') w.logPrepend('💎 鑽石十連：'+ results.map(function(q){ return '鑽石×'+q; }).join('、'));
        state.history.push({
          t: Math.floor(Date.now()/1000),
          text: '十連：'+ results.map(function(q){ return '<b>鑽石 × '+q+'</b>'; }).join('、')
        });
        if (state.history.length > 200) state.history.shift();
        w.GachaHub && w.GachaHub.requestRerender && w.GachaHub.requestRerender();
      };
    }

    if (clrBtn){
      clrBtn.onclick = function(){ state.history = []; w.GachaHub && w.GachaHub.requestRerender && w.GachaHub.requestRerender(); };
    }

    if (toggle){
      toggle.onclick = function(){
        state.showTable = !state.showTable;
        w.GachaHub && w.GachaHub.requestRerender && w.GachaHub.requestRerender();
      };
    }
  }

  function tick(){ /* 目前不需要；保留擴充 */ }

  // ===== 註冊到 GachaHub =====
  function registerIntoHub(){
    if (!w.GachaHub || typeof w.GachaHub.registerTab !== 'function') return;
    w.GachaHub.registerTab({
      id: 'gacha_diamond',
      title: '鑽石抽獎',
      render: render,
      tick: tick
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerIntoHub);
  else registerIntoHub();

  // （可選）保留舊 API：導到新分頁
  w.openDiamondGachaModal = function(){
    if (w.GachaHub){ w.GachaHub.open(); w.GachaHub.switchTo('gacha_diamond'); }
  };

})(window);