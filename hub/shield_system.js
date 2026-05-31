// =======================
// shield_system.js — 護盾系統 V4（SaveHub 版；集中設定＋護盾值也存檔）
// - 存檔：等級 / 自動設定 / 上限擴充步數 / 「目前護盾值」
// - 升級：金幣、護盾免費升級券（金幣≤40等、券≤50等）
// - 上限：基礎 1.5×；每顆「擴充護盾上限石」+5%，最多到 5.0×
// - 補充：一次補「補充量」，超出上限自動丟棄；可自動補（門檻％＋最小間隔）
// - 可選：防禦被動（平坦 DEF 或 減傷%）寫進 coreBonus.bonusData.shieldSys
// 依賴：player、GrowthHub、updateResourceUI/saveGame、getItemQuantity/removeItem、(可選)SaveHub
// =======================
(function(w){
  "use strict";

  // ======== 可調參數 ========
  // SaveHub 命名空間（若無 SaveHub 則回退 localStorage）
  var SAVE_NS = "shield_system_v4";
  var LS_KEY  = "護盾系統";

  // 道具名稱
  var ITEM_REFILL    = "護盾補充器";
  var ITEM_TICKET    = "護盾免費升級券";
  var ITEM_CAPSTONE  = "擴充護盾上限石";

  // 解鎖與等級上限
  var UNLOCK_COST_GOLD = 50000;
  var LV_CAP_GENERAL   = 40; // 金幣上限
  var LV_CAP_TICKET    = 50; // 券上限

  // 補充量曲線（Lv1=500；2~10 +400；11~20 +300；21~30 +200；31+ +300）
  function SHIELD_GAIN_FOR_LEVEL(L){
    if (L <= 0) return 0;
    var gain = 500;
    for (var i=2;i<=L;i++){
      if (i<=10) gain += 400;
      else if (i<=20) gain += 300;
      else if (i<=30) gain += 200;
      else gain += 300;
    }
    return gain;
  }

  // HP 加成曲線（1~10 +200；11~30 +300；31~50 +700）
  function HP_BONUS_FOR_LEVEL(L){
    var sum = 0;
    for (var i=1;i<=L;i++){
      if (i<=10) sum += 200;
      else if (i<=30) sum += 300;
      else sum += 700;
    }
    return sum;
  }

  // 上限倍率（基礎＋擴充）：基礎 1.5×，每步 +0.05×，最多 5.0×
  var CAP_BASE_MULT   = 1.5;
  var CAP_STEP_MULT   = 0.05;
  var CAP_MULT_MAX    = 5.0;  // 500%
  var CAP_STEPS_MAX   = Math.floor((CAP_MULT_MAX - CAP_BASE_MULT) / CAP_STEP_MULT); // 70

  // 升級費用（僅金幣；券免費）: 10000 * L^2（L=0/1 以 10000 計）
  var GOLD_BASE_COST = 10000;
  var GOLD_COST_EXP  = 2.0;
  function GOLD_COST_FOR_NEXT(L){
    var cur = Math.max(0, L|0);
    if (cur <= 1) return GOLD_BASE_COST;
    return Math.floor(GOLD_BASE_COST * Math.pow(cur, GOLD_COST_EXP));
  }

  // 自動補：門檻範圍與最小間隔上限（UI 輸入會被夾斷）
  var AUTO_THRESHOLD_MIN = 0;     // 0%
  var AUTO_THRESHOLD_MAX = 1;     // 100%
  var AUTO_INTERVAL_MIN  = 0;     // ms
  var AUTO_INTERVAL_MAX  = 60000; // 60s

  // 防禦被動（可選）
  var DEF_PASSIVE_ENABLED    = false;       // ← 想開就改 true
  var DEF_PASSIVE_MODE       = "flatDef";   // "flatDef" 或 "damageReduce"
  var DEF_PER_LEVEL          = 3;           // 當 MODE=flatDef：每等 +DEF
  var DR_PER_LEVEL           = 0.002;       // 當 MODE=damageReduce：每等 +0.2%
  var DR_TOTAL_CAP           = 0.15;        // 減傷上限（僅本模組貢獻）

  // ======== 工具 ========
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function now(){ return Date.now(); }
  function fmt(n){ return Number(n||0).toLocaleString(); }
  function invQty(name){
    try{
      if (typeof w.getItemQuantity === "function") return Math.max(0, Number(w.getItemQuantity(name))||0);
      if (w.inventory) return Math.max(0, Number(w.inventory[name]||0));
    }catch(_){}
    return 0;
  }
  function invRemove(name, n){
    n = Math.max(0, n|0);
    if (!n) return true;
    try{
      if (typeof w.removeItem === "function"){ w.removeItem(name, n); return true; }
      w.inventory = w.inventory || {};
      if ((w.inventory[name]||0) < n) return false;
      w.inventory[name] = Math.max(0, (w.inventory[name]||0)-n);
      if (typeof w.saveGame === 'function') w.saveGame();
      return true;
    }catch(_){ return false; }
  }
  function toast(msg, err){
    if (typeof w.showToast === 'function'){ try{ w.showToast(msg, !!err); return; }catch(_){ } }
    try{ alert(msg); }catch(_){}
  }

  // ======== Save 層（SaveHub 優先）========
  var useSaveHub = !!w.SaveHub;
  if (useSaveHub){
    try{
      var spec={}; spec[SAVE_NS] = { version:1, migrate:function(old){ return normalizeState(old||freshState()); } };
      w.SaveHub.registerNamespaces(spec);
    }catch(_){}
  }
  function saveObj(obj){
    try{
      if (useSaveHub) w.SaveHub.set(SAVE_NS, obj);
      else localStorage.setItem(LS_KEY, JSON.stringify(obj));
    }catch(_){}
  }
  function loadObj(){
    try{
      if (useSaveHub) return w.SaveHub.get(SAVE_NS, freshState());
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : freshState();
    }catch(_){ return freshState(); }
  }

  function freshState(){
    return {
      unlocked: false,
      level: 0,
      capBoostSteps: 0,   // 0~CAP_STEPS_MAX
      lastAutoTs: 0,
      auto: { enabled:false, threshold01:0.5, minIntervalMs:2000 },
      shieldValue: 0
    };
  }
  function normalizeState(o){
    o = o || freshState();
    o.unlocked = !!o.unlocked;
    o.level = Math.max(0, o.level|0);
    o.capBoostSteps = clamp(o.capBoostSteps|0, 0, CAP_STEPS_MAX);
    o.lastAutoTs = Math.max(0, o.lastAutoTs|0);
    o.auto = o.auto || { enabled:false, threshold01:0.5, minIntervalMs:2000 };
    o.auto.enabled = !!o.auto.enabled;
    o.auto.threshold01 = clamp(Number(o.auto.threshold01)||0.5, AUTO_THRESHOLD_MIN, AUTO_THRESHOLD_MAX);
    o.auto.minIntervalMs = clamp(Math.floor(Number(o.auto.minIntervalMs)||2000), AUTO_INTERVAL_MIN, AUTO_INTERVAL_MAX);
    o.shieldValue = Math.max(0, Number(o.shieldValue)||0);
    return o;
  }

  var S = normalizeState(loadObj());
  function save(){ saveObj(S); }

  // ======== 推導數值 ========
  function capMultiplier(){ return clamp(CAP_BASE_MULT + S.capBoostSteps*CAP_STEP_MULT, CAP_BASE_MULT, CAP_MULT_MAX); }
  function currentRefill(){ return SHIELD_GAIN_FOR_LEVEL(S.level|0); }
  function maxShield(){ return Math.floor(currentRefill() * capMultiplier()); }
  function hpBonus(){ return HP_BONUS_FOR_LEVEL(S.level|0); }

  // ======== 寫入 player（含防禦被動）========
  function applyToPlayer(){
    if (!w.player || !w.player.coreBonus) return;

    var cap  = maxShield();
    var hpPl = hpBonus();

    w.player.coreBonus.bonusData = w.player.coreBonus.bonusData || {};
    var bag = w.player.coreBonus.bonusData.shieldSys = {};

    // HP 被動
    bag.hp = hpPl;

    // 防禦被動（選用）
    if (DEF_PASSIVE_ENABLED){
      if (DEF_PASSIVE_MODE === "flatDef"){
        bag.def = (S.level|0) * (DEF_PER_LEVEL||0);
      }else{
        bag.damageReduce = clamp((S.level|0) * (DR_PER_LEVEL||0), 0, DR_TOTAL_CAP);
      }
    }

    // 上限與護盾值（用存檔為準）
    w.player.maxShield = cap;
    var fromSave = Math.max(0, Number(S.shieldValue)||0);
    w.player.shield = Math.min(fromSave, cap);

    try{ w.updateResourceUI && w.updateResourceUI(); w.saveGame && w.saveGame(); }catch(_){}
  }

  // 週期同步（若外部戰鬥改了 player.shield，也會被存）
  var _lastSnap = S.shieldValue|0;
  setInterval(function(){
    if (!w.player) return;
    var cap = maxShield();
    var cur = Math.max(0, Math.min(Number(w.player.shield||0), cap));
    if (cur !== _lastSnap){
      _lastSnap = cur;
      S.shieldValue = cur;
      save();
    }
  }, 1000);

  // ======== 操作 ========
  function canRaiseTo(method){
    if (method === "ticket") return (S.level + 1) <= LV_CAP_TICKET;
    return (S.level + 1) <= LV_CAP_GENERAL;
  }

  function unlock(){
    if (!w.player) return;
    if (S.unlocked) return;
    if ((w.player.gold||0) < UNLOCK_COST_GOLD){
      toast("金幣不足，需要 " + fmt(UNLOCK_COST_GOLD), true); return;
    }
    w.player.gold -= UNLOCK_COST_GOLD;
    S.unlocked = true;
    save(); applyToPlayer();
    toast("已解鎖護盾系統！");
  }

  function upgradeGold(){
    if (!S.unlocked){ toast("尚未解鎖", true); return; }
    if (!canRaiseTo("gold")){ toast("金幣升級已達上限（"+LV_CAP_GENERAL+"）", true); return; }
    var cost = GOLD_COST_FOR_NEXT(S.level);
    if ((w.player.gold||0) < cost){ toast("金幣不足，需要 " + fmt(cost), true); return; }
    w.player.gold -= cost;
    S.level += 1; save(); applyToPlayer();
    toast("護盾等級提升至 Lv." + S.level);
  }

  function upgradeTicket(){
    if (!S.unlocked){ toast("尚未解鎖", true); return; }
    if (!canRaiseTo("ticket")){ toast("等級已達上限（"+LV_CAP_TICKET+"）", true); return; }
    if (invQty(ITEM_TICKET) < 1){ toast("缺少道具：" + ITEM_TICKET, true); return; }
    if (!invRemove(ITEM_TICKET,1)){ toast("道具扣除失敗", true); return; }
    S.level += 1; save(); applyToPlayer();
    toast("護盾等級提升至 Lv." + S.level);
  }

  function extendCap(){
    if (!S.unlocked){ toast("尚未解鎖", true); return; }
    if ((S.capBoostSteps|0) >= CAP_STEPS_MAX){ toast("上限倍率已達 "+CAP_MULT_MAX.toFixed(2)+"×", true); return; }
    if (invQty(ITEM_CAPSTONE) < 1){ toast("缺少道具：" + ITEM_CAPSTONE, true); return; }
    if (!invRemove(ITEM_CAPSTONE,1)){ toast("道具扣除失敗", true); return; }
    S.capBoostSteps = clamp((S.capBoostSteps|0)+1, 0, CAP_STEPS_MAX);
    // 上限變大不自動補，只夾斷現有護盾到新上限
    S.shieldValue = Math.min(S.shieldValue|0, maxShield());
    save(); applyToPlayer();
    toast("護盾上限倍率提升至 " + capMultiplier().toFixed(2) + "×");
  }

  function canRefill(){
    if (!S.unlocked) return { ok:false, reason:"locked" };
    if (invQty(ITEM_REFILL) <= 0) return { ok:false, reason:"no_item" };

    var cap = maxShield();
    if (cap <= 0) return { ok:false, reason:"cap0" };

    var cur = Math.max(0, Math.min(Number(w.player.shield||0), cap));
    var thr01 = clamp(Number(S.auto.threshold01)||0, AUTO_THRESHOLD_MIN, AUTO_THRESHOLD_MAX);
    var minInt = clamp(Number(S.auto.minIntervalMs)||0, AUTO_INTERVAL_MIN, AUTO_INTERVAL_MAX);

    if ((now() - (S.lastAutoTs||0)) < minInt) return { ok:false, reason:"interval" };
    if (cur / cap > thr01) return { ok:false, reason:"over_threshold" };
    return { ok:true };
  }

  function refill(isManual){
    var chk = canRefill();
    if (!chk.ok){
      if (isManual){
        if (chk.reason==="over_threshold") toast("護盾尚未低於門檻", true);
        else if (chk.reason==="no_item")    toast("缺少道具：" + ITEM_REFILL, true);
        else if (chk.reason==="interval")   toast("補充過快，請稍後再試", true);
        else if (chk.reason==="locked")     toast("尚未解鎖護盾系統", true);
        else                                toast("目前無法補充", true);
      }
      return false;
    }
    if (!invRemove(ITEM_REFILL,1)){ if(isManual) toast("道具扣除失敗", true); return false; }

    var cap    = maxShield();
    var add    = currentRefill();
    var cur    = Math.max(0, Math.min(Number(w.player.shield||0), cap));
    var after  = Math.min(cur + add, cap); // 超出丟棄

    w.player.shield = after;
    S.shieldValue   = after;
    S.lastAutoTs    = now();
    save();
    try{ w.updateResourceUI && w.updateResourceUI(); w.saveGame && w.saveGame(); }catch(_){}
    if (isManual) toast("已補充護盾：" + fmt(after - cur));
    return true;
  }

  // 自動補 loop
  setInterval(function(){
    if (!S.unlocked || !S.auto.enabled) return;
    refill(false);
  }, 500);

  // ======== UI（GrowthHub 分頁）========
  function render(container){
    applyToPlayer();

    var lv = S.level|0;
    var refillAmt = currentRefill();
    var cMul = capMultiplier();
    var cap  = maxShield();
    var cur  = Math.max(0, Math.min(Number(w.player.shield||0), cap));
    var hpPl = hpBonus();
    var goldCost = GOLD_COST_FOR_NEXT(lv);

    var qRefill = invQty(ITEM_REFILL);
    var qTicket = invQty(ITEM_TICKET);
    var qCap    = invQty(ITEM_CAPSTONE);

    var thr = Math.round(clamp(Number(S.auto.threshold01)||0,0,1)*100);

    container.innerHTML =
      '<div style="background:#0b1220;border:1px solid #1f2937;border-radius:12px;padding:12px;display:grid;gap:12px">'+
        header()+
        summary()+
        (S.unlocked ? bodyWhenUnlocked() : bodyWhenLocked())+
      '</div>';

    function header(){
      return '<div style="display:flex;gap:10px;align-items:center">'+
               '<div style="font-weight:800">🛡️ 護盾系統</div>'+
               '<div style="margin-left:auto;opacity:.85">道具：<b>'+ITEM_REFILL+'</b>／<b>'+ITEM_TICKET+'</b>／<b>'+ITEM_CAPSTONE+'</b></div>'+
             '</div>';
    }
    function summary(){
      var defPassiveText = DEF_PASSIVE_ENABLED
        ? (DEF_PASSIVE_MODE==="flatDef"
            ? ('防禦被動：每等 +'+DEF_PER_LEVEL+' DEF')
            : ('防禦被動：每等 +'+(DR_PER_LEVEL*100).toFixed(2)+'% 減傷（上限 '+(DR_TOTAL_CAP*100).toFixed(0)+'%）'))
        : '防禦被動：關閉';
      return ''+
      '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">'+
        card("等級", lv+" / "+LV_CAP_TICKET, "金幣≤"+LV_CAP_GENERAL+"；券≤"+LV_CAP_TICKET)+
        card("每次補充量", fmt(refillAmt), "一次補充的護盾值")+
        card("上限倍率", cMul.toFixed(2)+"倍", "基礎 "+CAP_BASE_MULT.toFixed(2)+"倍，擴充次數 "+(S.capBoostSteps|0)+"/"+CAP_STEPS_MAX)+
        card("護盾上限", fmt(cap), "超出上限自動丟棄")+
      '</div>'+
      '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">'+
        card("目前護盾", fmt(cur)+" / "+fmt(cap), "")+
        card("HP 加成", fmt(hpPl), "")+
        card("狀態", (S.unlocked?'<b style="color:#10b981">已解鎖</b>':'<b style="color:#f59e0b">未解鎖</b>'), defPassiveText)+
      '</div>';
    }
    function bodyWhenLocked(){
      return '<div style="display:flex;gap:8px;align-items:center">'+
               '<button id="btnUnlock" class="btn" style="background:#f59e0b;border:0;color:#111827;border-radius:8px;padding:8px 12px;cursor:pointer">支付 '+fmt(UNLOCK_COST_GOLD)+' 金幣解鎖</button>'+
             '</div>';
    }
    function bodyWhenUnlocked(){
      return ''+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
        panel('升級',
          line("金幣升級（→"+(lv+1)+"）", fmt(goldCost),
               '<button id="btnGoldUp" class="btn" style="background:#334155;color:#fff;border:0;padding:6px 10px;border-radius:8px;cursor:pointer">升級</button>')+
          line('使用「'+ITEM_TICKET+'」升級', '持有 '+fmt(qTicket),
               '<button id="btnTicketUp" class="btn" style="background:#10b981;color:#0b1220;border:0;padding:6px 10px;border-radius:8px;cursor:pointer">升級</button>')
        )+
        panel('補充',
          '<div>背包「'+ITEM_REFILL+'」：<b>'+fmt(qRefill)+'</b>　每次補：<b>'+fmt(refillAmt)+'</b>（上限 '+fmt(cap)+'）</div>'+
          '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:6px">'+
            '<label style="display:flex;gap:6px;align-items:center"><input id="autoOn" type="checkbox" '+(S.auto.enabled?'checked':'')+'> 自動補充</label>'+
            '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">'+
              '<span style="opacity:.85">門檻</span>'+
              '<input id="thr" type="range" min="0" max="100" value="'+thr+'" style="width:160px">'+
              '<span id="thrText" style="width:44px;text-align:right">'+thr+'%</span>'+
            '</div>'+
          '</div>'+
          '<div style="display:flex;gap:8px;align-items:center;margin-top:6px">'+
            '<span style="opacity:.85">最小間隔(ms)</span>'+
            '<input id="minInt" type="number" min="'+AUTO_INTERVAL_MIN+'" max="'+AUTO_INTERVAL_MAX+'" step="100" value="'+(S.auto.minIntervalMs|0)+'" style="width:120px;padding:4px 6px;border-radius:8px;border:1px solid #334155;background:#0b1220;color:#e5e7eb">'+
            '<span style="margin-left:auto"></span>'+
            '<button id="btnRefill" class="btn" style="background:#10b981;color:#0b1220;border:0;padding:6px 10px;border-radius:8px;cursor:pointer">立即補充</button>'+
          '</div>'
        )+
        panel('上限擴充',
          '<div>目前提高：<b>'+cMul.toFixed(2)+'倍</b>（次數 '+(S.capBoostSteps|0)+'/'+CAP_STEPS_MAX+'）</div>'+
          line('使用「'+ITEM_CAPSTONE+'」+5% 上限', '持有 '+fmt(qCap),
               '<button id="btnCapUp" class="btn" style="background:#60a5fa;color:#0b1220;border:0;padding:6px 10px;border-radius:8px;cursor:pointer">擴充</button>')
        )+
      '</div>';
    }

    function card(title, value, sub){
      return '<div style="border:1px solid #1f2937;border-radius:12px;padding:10px;background:#0e172a">'+
               '<div style="opacity:.8;font-size:12px">'+title+'</div>'+
               '<div style="font-weight:800;font-size:18px;margin-top:2px">'+value+'</div>'+
               (sub?'<div style="opacity:.75;margin-top:4px;font-size:12px">'+sub+'</div>':'')+
             '</div>';
    }
    function panel(title, inner){
      return '<div style="border:1px solid #253041;border-radius:12px;padding:10px;background:#0e172a">'+
               '<div style="font-weight:700;margin-bottom:6px">'+title+'</div>'+inner+
             '</div>';
    }
    function line(label, right, btnHtml){
      return '<div style="display:flex;gap:8px;align-items:center;margin-top:6px">'+
               '<div>'+label+'：<b>'+right+'</b></div>'+
               '<div style="margin-left:auto">'+btnHtml+'</div>'+
             '</div>';
    }

    // 綁定
    if (!S.unlocked){
      var u = container.querySelector('#btnUnlock'); if (u) u.onclick = function(){ unlock(); w.GrowthHub && w.GrowthHub.requestRerender && w.GrowthHub.requestRerender(); };
      return;
    }
    var g = container.querySelector('#btnGoldUp');   if (g) g.onclick = function(){ upgradeGold();   w.GrowthHub && w.GrowthHub.requestRerender && w.GrowthHub.requestRerender(); };
    var t = container.querySelector('#btnTicketUp'); if (t) t.onclick = function(){ upgradeTicket(); w.GrowthHub && w.GrowthHub.requestRerender && w.GrowthHub.requestRerender(); };
    var cap = container.querySelector('#btnCapUp');  if (cap) cap.onclick = function(){ extendCap(); w.GrowthHub && w.GrowthHub.requestRerender && w.GrowthHub.requestRerender(); };

    var chk = container.querySelector('#autoOn'); if (chk) chk.onchange = function(){ S.auto.enabled = !!this.checked; save(); };

    var thrEl = container.querySelector('#thr'); if (thrEl){
      thrEl.oninput  = function(){ var v = clamp(Number(this.value)||0,0,100); container.querySelector('#thrText').textContent = v+'%'; };
      thrEl.onchange = function(){ var v = clamp(Number(this.value)||0,0,100); S.auto.threshold01 = clamp(v/100, AUTO_THRESHOLD_MIN, AUTO_THRESHOLD_MAX); save(); };
    }
    var minInt = container.querySelector('#minInt'); if (minInt){
      minInt.onchange = function(){
        var v = clamp(Math.floor(Number(this.value)||0), AUTO_INTERVAL_MIN, AUTO_INTERVAL_MAX);
        S.auto.minIntervalMs = v; this.value = v; save();
      };
    }
    var rf = container.querySelector('#btnRefill'); if (rf) rf.onclick = function(){ refill(true); w.GrowthHub && w.GrowthHub.requestRerender && w.GrowthHub.requestRerender(); };
  }

  // 註冊 GrowthHub
  if (w.GrowthHub && typeof w.GrowthHub.registerTab === "function"){
    w.GrowthHub.registerTab({
      id: "shield",
      title: "護盾",
      render: render,
      tick: function(){},
      onOpen: function(){ applyToPlayer(); }
    });
  }

  // 啟動時套用
  (function boot(){
    var tries = 0, t = setInterval(function(){
      if (w.player && w.player.coreBonus){
        clearInterval(t); applyToPlayer();
      } else if (++tries > 200){ clearInterval(t); }
    }, 50);
  })();

  // 對外
  w.ShieldSystem = {
    getState: function(){ return JSON.parse(JSON.stringify(S)); },
    apply: applyToPlayer,
    unlock: unlock,
    refill: function(){ return refill(true); },
    upgradeGold: upgradeGold,
    upgradeTicket: upgradeTicket,
    extendCap: extendCap,
    // 讓外部在承受傷害後主動同步（可選）
    syncShieldFromPlayer: function(){
      var cap = maxShield();
      var cur = Math.max(0, Math.min(Number(w.player && w.player.shield || 0), cap));
      if (cur !== S.shieldValue){ S.shieldValue = cur; save(); }
    }
  };

})(window);