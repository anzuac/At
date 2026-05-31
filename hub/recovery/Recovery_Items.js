// ==========================
// Recovery Items Tab — 藥水分頁（V5，SaveHub 統一存檔版）
// - 存檔：SaveHub 優先；localStorage 後備；含舊檔自動遷移
// - 功能：自動補貨、冷卻動畫條、聰明用藥、按鈕去抖、手動優先 1s、記憶百分比
// - 依賴：player.totalStats.{hp,mp}, player.currentHP/MP, inventory.js 的 addItem/getItemQuantity/removeItem
// - 可選：GrowthHub, saveGame（只影響金錢/背包更新，不影響本模組存檔）
// ===========================================================
// ✅ 此版僅更換存檔機制；其餘邏輯/數值/UI 完全不變
// ===========================================================
(function(){
  if (window.RecoveryItemsTab && window.RecoveryItemsTab.__v5__) return;

  // ===== 狀態存檔（SaveHub 優先；localStorage 後備；含自動遷移）=====
  var SAVEHUB_NS = "recovery_items_tab_v5";
  var SAVE_KEY   = "potions_tab_state_v1"; // 舊 localStorage key（遷移來源）
  var SH = window.SaveHub || null;

  // 預設狀態
  var STATE = {
    auto: {},        // 各藥水自動用藥設定 { [id]: { enabled, threshold01, autoBuy:{enabled,target} } }
    cooldowns: {},   // 各藥水冷卻截止時間（時間戳 ms）
    lastManualUse: 0 // 最近手動使用時間（ms）
  };

  function normalizeState(s){
    s = s || {};
    if (!s.auto || typeof s.auto !== 'object') s.auto = {};
    if (!s.cooldowns || typeof s.cooldowns !== 'object') s.cooldowns = {};
    if (!s.advOpen || typeof s.advOpen !== 'object') s.advOpen = {};
    if (!Number.isFinite(s.lastManualUse)) s.lastManualUse = 0;
    return s;
  }

  function loadState(){
    var st = null;
    try{
      if (SH){
        // 先試著從 SaveHub 讀
        if (typeof SH.get === 'function') st = SH.get(SAVEHUB_NS, null);
        else if (typeof SH.read === 'function') st = SH.read(SAVEHUB_NS, null);

        // 如果 SaveHub 沒有，就從舊 localStorage 遷移
        if (!st && window.localStorage){
          var raw = localStorage.getItem(SAVE_KEY);
          if (raw){
            try{
              st = JSON.parse(raw);
              // 寫回 SaveHub，然後刪除舊資料
              if (typeof SH.set === 'function') SH.set(SAVEHUB_NS, st);
              else if (typeof SH.write === 'function') SH.write(SAVEHUB_NS, st);
              localStorage.removeItem(SAVE_KEY);
            }catch(_){}
          }
        }
      } else if (window.localStorage){
        // 沒有 SaveHub，就用舊的 localStorage
        var raw2 = localStorage.getItem(SAVE_KEY);
        if (raw2) st = JSON.parse(raw2);
      }
    }catch(_){}
    return normalizeState(st || {});
  }

  function saveState(){
    STATE = normalizeState(STATE);
    try{
      if (SH){
        if (typeof SH.set === 'function') SH.set(SAVEHUB_NS, STATE);
        else if (typeof SH.write === 'function') SH.write(SAVEHUB_NS, STATE);
      } else if (window.localStorage){
        localStorage.setItem(SAVE_KEY, JSON.stringify(STATE));
      }
    }catch(_){}
  }

  STATE = loadState();

  // ---- UI loop（避免每次重繪都重複啟動計時器）----
  var UI_CONTAINER = null;
  var UI_LOOP_STARTED = false;

  // ---- Auto loop（自動用藥：不依賴 UI 是否開啟）----
  // 自動用藥應在戰鬥/掛機時持續運作，因此不能綁在 GrowthHub 的重繪節奏。
  var AUTO_LOOP_STARTED = false;

  // ---- 小工具 ----
  function now(){ return Date.now(); }
  function clamp(v,min,max){ return v<min?min:(v>max?max:v); }
  function fmt(n){ return (n||0).toLocaleString(); }
  function getMoney(){
    if (!window.player) return 0;
    var g = Number(player.gold || player.money || 0);
    return isFinite(g) ? g : 0;
  }
  function addMoney(delta){
    if (!window.player) return;
    var g = getMoney() + delta;
    if (g < 0) g = 0;
    player.gold = g;
    if (typeof window.updateResourceUI === 'function') {
      try{ window.updateResourceUI(); }catch(_){}
    }
  }

  // ---- 舊的存檔相容（HP/MP 使用百分比閾值）----
  // 舊機制可能會用 localStorage 存「HP/MP 多少% 以下自動用藥」
  // 這裡盡量讀出來並塞回 STATE.auto，避免玩家設定消失
  (function migrateOldPercent(){
    try{
      if (!window.localStorage) return;
      var hpThr = localStorage.getItem('auto_hp_threshold');
      var mpThr = localStorage.getItem('auto_mp_threshold');
      if (hpThr != null){
        var v = Math.max(1, Math.min(100, Number(hpThr)||50))/100;
        STATE.auto.hp_basic = STATE.auto.hp_basic || {};
        if (typeof STATE.auto.hp_basic.threshold01 !== 'number') STATE.auto.hp_basic.threshold01 = v;
      }
      if (mpThr != null){
        var v2 = Math.max(1, Math.min(100, Number(mpThr)||50))/100;
        STATE.auto.mp_basic = STATE.auto.mp_basic || {};
        if (typeof STATE.auto.mp_basic.threshold01 !== 'number') STATE.auto.mp_basic.threshold01 = v2;
      }
    }catch(_){}
  })();

  // ---- 恢復力（百分比）----
  // RecoveryPower = player.totalStats.recoverPercent（已含被動/技能）
  // 藥水實際吃進去的比例可用 POTION_EAT_RATIO 微調
  var POTION_EAT_RATIO = 1.0;

  // ==========================
  // ★ 藥水強化系統參數
  // ==========================
  // 強化等級上限
  var POTION_UPGRADE_MAX_LEVEL = 500;
  // 每等級提升 +5% 回復量
  var POTION_UPGRADE_STEP_PCT  = 0.05; // 5%
  // 升級成本：第 1 級 5 把，第 2 級 10 把... => cost = BASE * (level+1)
  var POTION_UPGRADE_COST_BASE = 5;

  // ★ 強化帶來的「基礎值成長」（每升 1 等，基礎值 +X）
  // 例：base=100 的生命藥水，Lv.1 → 110；Lv.500 → 100 + 10×500
  // 依需求調整：每升 1 等增加的「基礎回復值」
  // （升級素材與成本邏輯不變）
  var POTION_UPGRADE_BASE_INC_BY_ID = {
    hp_basic: 15,   // 生命藥水
    hp_adv:   120,  // 高級生命藥水
    hp_super: 450,  // 超級生命藥水
    mp_basic: 14,   // 法力藥水
    mp_adv:   24,   // 高級法力藥水
    mp_super: 49    // 超級法力藥水
  };

  // ★ 單次回復上限（不受「恢復力」影響，只看基礎值與強化）
  // - 基礎藥水：30% Max
  // - 高級/超級：70% Max
  // - 超級生命藥水：無上限（依需求調整）
  // - 超級法力：無上限
  var POTION_HEAL_CAP_PCT_BY_ID = {
    hp_basic: 0.30,
    mp_basic: 0.30,
    hp_adv:   0.70,
    mp_adv:   0.70,
    // 原本 70% 上限 → 改為無上限
    hp_super: null,
    mp_super: null
  };


  // 各藥水對應的「潛能解放鑰匙」名稱
  var POTION_UPGRADE_KEY_BY_ID = {
    hp_basic: '低階潛能解放鑰匙',  // 生命藥水
    mp_basic: '低階潛能解放鑰匙',  // 法力藥水

    hp_adv:   '中階潛能解放鑰匙',  // 高級生命藥水
    mp_adv:   '中階潛能解放鑰匙',  // 高級法力藥水

    hp_super: '高階潛能解放鑰匙',  // 超級生命藥水
    mp_super: '高階潛能解放鑰匙'   // 超級法力藥水
  };

  function getRecoveryPower(){
    var p = 0;

    // 1) 首選：統一總合（base+skill+core，已做上限）
    if (player && player.totalStats && typeof player.totalStats.recoverPercent === 'number') {
      p = player.totalStats.recoverPercent;
    }
    // 2) 相容回退：舊欄位（基礎）
    else if (player && typeof player.recoverPercentBaseDecimal === 'number') {
      p = player.recoverPercentBaseDecimal;
    }
    // 3) 最後回退：舊的 recoverPercent（可能是百分比或小數）
    else if (player && typeof player.recoverPercent === 'number') {
      p = player.recoverPercent;
      if (p > 1 && p <= 100) p /= 100; // 舊檔百分比
    }

    if (!isFinite(p) || p < 0) p = 0;
    // 夾斷 0~1，並套用藥水的吃入權重
    p = Math.max(0, p);
    return p * POTION_EAT_RATIO;
  }

  // ---- 藥水清單（新增藥水就加一條）----
  var ITEMS = {
    // 需求：等級上限 500；每等 +5% 回復倍率（已由 POTION_UPGRADE_STEP_PCT 控制）
    // 數值調整：base / cd / price
    hp_basic:  { id:'hp_basic',  name:'生命藥水',     invName:'生命藥水',     stat:'hp', base:100,   cdMs: 30*1000, price: 500,  order:1 },
    hp_adv:    { id:'hp_adv',    name:'高級生命藥水', invName:'高級生命藥水', stat:'hp', base:1000,  cdMs: 25*1000, price: 3800, order:2 },
    hp_super:  { id:'hp_super',  name:'超級生命藥水', invName:'超級生命藥水', stat:'hp', base:10000, cdMs: 23*1000, price: null, order:3 },
    mp_basic:  { id:'mp_basic',  name:'法力藥水',     invName:'法力藥水',     stat:'mp', base:50,    cdMs: 40*1000, price: 800,  order:1 },
    mp_adv:    { id:'mp_adv',    name:'高級法力藥水', invName:'高級法力藥水', stat:'mp', base:130,   cdMs: 30*1000, price: 5000, order:2 },
    mp_super:  { id:'mp_super',  name:'超級法力藥水', invName:'超級法力藥水', stat:'mp', base:300,   cdMs: 27*1000, price: null, order:3 }
  };
  var LIST = [ITEMS.hp_basic, ITEMS.hp_adv, ITEMS.hp_super, ITEMS.mp_basic, ITEMS.mp_adv, ITEMS.mp_super];

  // ==========================
  // ★ 藥水強化存檔（SaveHub / localStorage）
  // ==========================
  var POTION_UPGRADE_SH_NS   = "potion_upgrade_v1";
  var POTION_UPGRADE_LS_KEY  = "potion_upgrade_v1";
  var POTION_UPGRADE_LEVELS  = {};

  function normalizePotionLevels(o){
    var out = {};
    o = o && typeof o === 'object' ? o : {};
    ['hp_basic','hp_adv','hp_super','mp_basic','mp_adv','mp_super'].forEach(function(id){
      var lv = Number(o[id] || 0);
      if (!isFinite(lv) || lv < 0) lv = 0;
      if (lv > POTION_UPGRADE_MAX_LEVEL) lv = POTION_UPGRADE_MAX_LEVEL;
      out[id] = lv;
    });
    return out;
  }

  function loadPotionUpgradeLevels(){
    var SH2 = window.SaveHub || null;
    try{
      if (SH2){
        var raw = null;
        if (typeof SH2.get === 'function') raw = SH2.get(POTION_UPGRADE_SH_NS, null);
        else if (typeof SH2.read === 'function') raw = SH2.read(POTION_UPGRADE_SH_NS, null);

        if (!raw && window.localStorage){
          var s = localStorage.getItem(POTION_UPGRADE_LS_KEY);
          if (s){
            try{
              raw = JSON.parse(s);
              if (typeof SH2.set === 'function') SH2.set(POTION_UPGRADE_SH_NS, raw);
              else if (typeof SH2.write === 'function') SH2.write(POTION_UPGRADE_SH_NS, raw);
              localStorage.removeItem(POTION_UPGRADE_LS_KEY);
            }catch(_){}
          }
        }
        return normalizePotionLevels(raw || {});
      } else if (window.localStorage){
        var raw2 = localStorage.getItem(POTION_UPGRADE_LS_KEY);
        return normalizePotionLevels(raw2 ? JSON.parse(raw2) : {});
      }
    }catch(_){}
    return normalizePotionLevels({});
  }

  function savePotionUpgradeLevels(){
    var SH2 = window.SaveHub || null;
    var safe = normalizePotionLevels(POTION_UPGRADE_LEVELS);
    try{
      if (SH2){
        if (typeof SH2.set === 'function') SH2.set(POTION_UPGRADE_SH_NS, safe);
        else if (typeof SH2.write === 'function') SH2.write(POTION_UPGRADE_SH_NS, safe);
      } else if (window.localStorage){
        localStorage.setItem(POTION_UPGRADE_LS_KEY, JSON.stringify(safe));
      }
    }catch(_){}
  }

  POTION_UPGRADE_LEVELS = loadPotionUpgradeLevels();

  function getPotionUpgradeLevel(id){
    return Number(POTION_UPGRADE_LEVELS[id] || 0);
  }

  function getPotionUpgradeCost(id){
    var lv = getPotionUpgradeLevel(id);
    if (lv >= POTION_UPGRADE_MAX_LEVEL) return null;
    return POTION_UPGRADE_COST_BASE * (lv + 1);
  }

  function canUpgradePotion(id){
    var def = ITEMS[id];
    if (!def) return { ok:false, reason:'no_item' };

    var keyName = POTION_UPGRADE_KEY_BY_ID[id];
    if (!keyName) return { ok:false, reason:'no_key_config' };

    var lv = getPotionUpgradeLevel(id);
    if (lv >= POTION_UPGRADE_MAX_LEVEL) return { ok:false, reason:'max' };

    var cost = getPotionUpgradeCost(id);
    var owned = 0;
    if (typeof getItemQuantity === 'function') {
      try { owned = getItemQuantity(keyName) | 0; } catch(_){}
    }

    if (owned < cost) {
      return {
        ok:false,
        reason:'no_key',
        need:cost,
        have:owned,
        keyName:keyName
      };
    }

    return { ok:true, level:lv, cost:cost, keyName:keyName, have:owned };
  }

  function upgradePotion(id){
    var chk = canUpgradePotion(id);
    if (!chk.ok) return chk;

    if (typeof removeItem === 'function') {
      try { removeItem(chk.keyName, chk.cost); } catch(_){}
    }

    var lv = getPotionUpgradeLevel(id) + 1;
    if (lv > POTION_UPGRADE_MAX_LEVEL) lv = POTION_UPGRADE_MAX_LEVEL;
    POTION_UPGRADE_LEVELS[id] = lv;
    savePotionUpgradeLevels();

    try { if (typeof saveGame === 'function') saveGame(); } catch(_){}

    return { ok:true, level:lv, keyName:chk.keyName, cost:chk.cost };
  }

  // ---- 工具：讀/寫冷卻與庫存 ----
  function getStock(def){
    if (!window.getItemQuantity) return 0;
    try{
      return getItemQuantity(def.invName) | 0;
    }catch(_){ return 0; }
  }
  function addStock(def, n){
    if (!window.addItem) return;
    try{
      addItem(def.invName, n|0);
    }catch(_){}
  }
  function getMax(stat){
    if (!player || !player.totalStats) return 0;
    if (stat==='hp') return Number(player.totalStats.hp || 0);
    if (stat==='mp') return Number(player.totalStats.mp || 0);
    return 0;
  }
  function getCur(stat){
    if (!player) return 0;
    if (stat==='hp') return Number(player.currentHP||0);
    if (stat==='mp') return Number(player.currentMP||0);
    return 0;
  }
  function setCur(stat,v){
    if (!player) return;
    if (stat==='hp') player.currentHP = v;
    if (stat==='mp') player.currentMP = v;
  }

  // 冷卻（走獨立存檔 STATE.cooldowns）
  function getCdRemain(def){
    var t = Number(STATE.cooldowns[def.id] || 0);
    var ms = t - now();
    return ms>0?ms:0;
  }
  function setCd(def){
    if (!def.cdMs) return;
    STATE.cooldowns[def.id] = now() + def.cdMs;
    saveState();
  }

  // 自動設定（從 STATE.auto）
  function autoConf(def){
    var c = STATE.auto[def.id];
    if (!c) c = (STATE.auto[def.id] = {enabled:false, threshold01:0.5, autoBuy:{enabled:false, target:10}});
    if (typeof c.enabled !== 'boolean') c.enabled = false;
    if (typeof c.threshold01 !== 'number') c.threshold01 = 0.5;
    c.threshold01 = clamp(c.threshold01, 0.01, 1);
    if (!c.autoBuy) c.autoBuy = {enabled:false, target:10};
    if (typeof c.autoBuy.enabled !== 'boolean') c.autoBuy.enabled = false;
    var tg = Number(c.autoBuy.target); if (!isFinite(tg)) tg = 10;
    c.autoBuy.target = clamp(tg, 0, 999);
    return c;
  }

  function setAuto(id, on){
    var def = ITEMS[id]; if (!def) return;
    var c = autoConf(def);
    c.enabled = !!on;
    saveState();
  }
  function setThreshold(id, thr01){
    var def = ITEMS[id]; if (!def) return;
    var c = autoConf(def);
    c.threshold01 = clamp(Number(thr01)||0.5, 0.01, 1);
    saveState();
  }
  function setAutoBuy(id, on, target){
    var def = ITEMS[id]; if (!def) return;
    var c = autoConf(def);
    if (!c.autoBuy) c.autoBuy = {enabled:false, target:10};
    if (typeof on === 'boolean') c.autoBuy.enabled = on;
    if (target != null){
      var v = Number(target);
      if (!isFinite(v) || v < 0) v = 0;
      if (v > 999) v = 999;
      c.autoBuy.target = v;
    }
    saveState();
  }

  // 總回復量（v2）
  // - 基礎值會隨強化等級成長：baseNow = base0 + baseInc×Lv
  // - 額外回復倍率：+5%/Lv
  // - 上限不吃「恢復力」：cap 只看 baseNow 與強化倍率
  function getPotionHealInfo(def){
    var lv = getPotionUpgradeLevel(def.id);

    var baseInc = POTION_UPGRADE_BASE_INC_BY_ID[def.id] || 0;
    var baseNow = (Number(def.base) || 0) + baseInc * lv;

    var upMul = 1 + lv * POTION_UPGRADE_STEP_PCT;

    // 恢復力（0~?）只影響 raw，不影響 cap
    var recMul = 1 + getRecoveryPower();

    var capPct = (def && def.id) ? POTION_HEAL_CAP_PCT_BY_ID[def.id] : null;
    var maxVal = 0;
    try { maxVal = getMax(def.stat); } catch(_){ maxVal = 0; }

    // capBase：不含恢復力
    var capBase = Math.ceil(baseNow * upMul);

    // raw：含恢復力
    var rawHeal = Math.ceil(baseNow * upMul * recMul);

    var hardCap = null;
    if (capPct == null){
      hardCap = null; // 無上限
    } else {
      hardCap = Math.ceil(maxVal * capPct);
    }

    var finalHeal = rawHeal;
    if (hardCap != null){
      finalHeal = Math.min(rawHeal, Math.min(capBase, hardCap));
    }
    if (finalHeal < 0) finalHeal = 0;

    return {
      lv: lv,
      baseInc: baseInc,
      baseNow: baseNow,
      upMul: upMul,
      recMul: recMul,
      rawHeal: rawHeal,
      capPct: capPct,
      capBase: capBase,
      hardCap: hardCap,
      finalHeal: finalHeal
    };
  }

  function totalHeal(def){
    return getPotionHealInfo(def).finalHeal;
  }


  // 判斷可以使用？
  function canUse(id){
    var def = ITEMS[id]; if (!def) return {ok:false, reason:'no_item'};
    if (!player || !player.totalStats) return {ok:false, reason:'no_player'};

    if (player.isDead || player.currentHP<=0) return {ok:false, reason:'dead'};

    var cur = getCur(def.stat);
    var max = getMax(def.stat);
    if (cur >= max) return {ok:false, reason:'not_needed'};

    var cd = getCdRemain(def);
    if (cd > 0) return {ok:false, reason:'cooldown', remainingMs:cd};

    var stock = getStock(def);
    if (stock <= 0) return {ok:false, reason:'no_stock'};

    return {ok:true};
  }

  // 實際使用
  function use(id, isManual){
    var def = ITEMS[id]; if (!def) return {ok:false, reason:'no_item'};
    var can = canUse(id);
    if (!can.ok) return can;

    if (isManual) {
      STATE.lastManualUse = now();
      saveState();
    }

    var cur = getCur(def.stat);
    var max = getMax(def.stat);
    var heal = totalHeal(def);
    var after = cur + heal;
    if (after > max) after = max;

    setCur(def.stat, after);

    if (typeof removeItem === 'function'){
      try{ removeItem(def.invName, 1); }catch(_){}
    }
    setCd(def);
    if (typeof window.updateResourceUI === 'function') {
      try{ window.updateResourceUI(); }catch(_){}
    }
    return {ok:true, heal:heal};
  }

  // 購買（配合 autoBuy）
  function buy(id){
    var def = ITEMS[id]; if (!def) return {ok:false, reason:'no_item'};
    if (def.price == null) return {ok:false, reason:'no_shop'};

    var money = getMoney();
    if (money < def.price) return {ok:false, reason:'no_money'};

    addMoney(-def.price);
    addStock(def, 1);
    return {ok:true};
  }

  // 自動用藥核心：每秒輪詢（外部呼叫）
  function autoTick(){
    if (!player || !player.totalStats) return;

    // 手動使用後 1 秒內，暫停自動用藥，讓玩家有優先權
    var dtManual = now() - STATE.lastManualUse;
    var manualBlock = (dtManual < 1000);

    var curHP = getCur('hp');
    var maxHP = getMax('hp');
    var curMP = getCur('mp');
    var maxMP = getMax('mp');

    LIST.forEach(function(def){
      var conf = autoConf(def);
      if (!conf.enabled) return;

      // 冷卻中
      if (getCdRemain(def) > 0) return;

      var cur = (def.stat==='hp') ? curHP : curMP;
      var max = (def.stat==='hp') ? maxHP : maxMP;
      if (max <= 0) return;
      var ratio = cur / max;

      if (ratio <= conf.threshold01){
        if (manualBlock) return;
        var res = use(def.id, false);
        if (!res.ok){
          if (res.reason === 'no_stock' && conf.autoBuy && conf.autoBuy.enabled){
            var bought = buy(def.id);
            if (bought.ok) use(def.id, false);
          }
        }else{
          if (def.stat==='hp'){ curHP = getCur('hp'); }
          else if (def.stat==='mp'){ curMP = getCur('mp'); }
        }
      }
    });
  }

  // 自動用藥：全域 1 秒輪詢（只啟動一次）
  function ensureAutoLoop(){
    if (AUTO_LOOP_STARTED) return;
    AUTO_LOOP_STARTED = true;
    (function loop(){
      try{ autoTick(); }catch(_){ }
      setTimeout(loop, 1000);
    })();
  }

  // ---- 用於 UI 的去抖 ----
  function withDebounce(btn, fn){
    var locked = false;
    return function(){
      if (locked) return;
      locked = true;
      try{ fn.apply(this, arguments); }finally{
        setTimeout(function(){ locked = false; }, 200);
      }
    };
  }

  // ---- UI ----
  function ensurePlayerReady(){
    return !!(window.player && player.totalStats);
  }

  // 冷卻倒數文字
  function fmtCountdown(ms){
    if (ms <= 0) return '';
    var s = Math.ceil(ms/1000);
    if (s < 60) return s+'s';
    var m = Math.floor(s/60), r = s%60;
    return m+'m'+(r>0?(''+r+'s'):'');
  }

  // ==========================
  // UI：卡片 HTML 生成 + 局部刷新
  // - 避免點一下就整頁重繪造成「一直刷新重整」的體感
  // - 進度條（冷卻條）維持由 UI loop 每秒更新
  // ==========================
  var RI_CSS = null;

  function getRiCss(){
    if (RI_CSS) return RI_CSS;
    RI_CSS =
      '<style>'+
      '.ri-wrap{background:#0b1220;border:1px solid #1f2937;border-radius:14px;padding:14px;display:grid;gap:12px}'+
      '.ri-head{display:flex;align-items:center;gap:10px}'+
      '.ri-head .t{font-weight:800;font-size:15px;letter-spacing:.2px}'+
      '.ri-pill{margin-left:auto;display:flex;gap:8px;align-items:center}'+
      '.ri-badge{background:#0e172a;border:1px solid #253041;border-radius:999px;padding:6px 10px;font-size:12px;opacity:.9}'+
      '.ri-grid{display:grid;gap:12px}'+
      '@media (min-width: 920px){.ri-grid{grid-template-columns:1fr 1fr}}'+
      '.ri-card{border:1px solid #253041;border-radius:14px;padding:12px;background:#0e172a;display:grid;gap:10px;box-shadow:0 0 0 1px rgba(0,0,0,.08) inset}'+
      '.ri-top{display:flex;gap:10px;align-items:flex-start}'+
      '.ri-title{min-width:0}'+
      '.ri-name{font-weight:800;font-size:16px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}'+
      '.ri-sub{font-size:13px;opacity:.85;margin-top:4px;line-height:1.35}'+
      '.ri-meta{display:flex;gap:8px;align-items:center;flex-wrap:nowrap;overflow:hidden;margin-top:6px}'+
      '.ri-chip{background:#0e172a;border:1px solid #253041;border-radius:999px;padding:4px 8px;font-size:12px;opacity:.9;white-space:nowrap}'+
      '.ri-chip b{opacity:1}'+
      '.ri-right{margin-left:auto;display:flex;gap:10px;align-items:center}'+
      '.ri-kv{font-size:12px;opacity:.85}'+
      '.ri-kv b{opacity:1}'+
      '.ri-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}'+
      '.ri-btn{padding:8px 10px;border-radius:12px;border:1px solid #2a364a;background:#0b1220;color:#e5e7eb;cursor:pointer}'+
      '.ri-btn.primary{border:none;background:#10b981;color:#0b1220;font-weight:700}'+
      '.ri-btn.warn{border:none;background:#f97316;color:#0b1220;font-weight:800}'+
      '.ri-btn:disabled{opacity:.5;cursor:not-allowed}'+
      '.ri-bar{height:7px;border-radius:999px;background:#0b1220;border:1px solid #253041;overflow:hidden}'+
      '.ri-bar > i{display:block;height:100%;width:0%;background:linear-gradient(90deg,#22d3ee,#2563eb)}'+
      '.ri-details{border-top:1px dashed #253041;padding-top:10px}'+
      '.ri-details summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;font-weight:700;opacity:.9}'+
      '.ri-details summary::-webkit-details-marker{display:none}'+
      '.ri-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}'+
      '.ri-row .sp{margin-left:auto}'+
      '.ri-range{display:flex;gap:8px;align-items:center;margin-left:auto}'+
      '.ri-range input[type=range]{width:160px}'+
      '.ri-num{width:72px;padding:4px 6px;border-radius:10px;border:1px solid #374151;background:#0b1220;color:#e5e7eb}'+
      '</style>';
    return RI_CSS;
  }

  function buildCard(def, powPct){
    var cd  = getCdRemain(def);
    var st  = getStock(def);
    var conf= autoConf(def);
    var thr = Math.round(conf.threshold01*100);
    var info = getPotionHealInfo(def);
    var heal= info.finalHeal;
    var cdRatio = 0;
    if (cd > 0 && def.cdMs > 0) cdRatio = clamp((def.cdMs - cd) / def.cdMs, 0, 1);

    // 強化資訊
    var upLv    = info.lv;
    var upPct   = Math.round(upLv * POTION_UPGRADE_STEP_PCT * 100);
    var keyName = POTION_UPGRADE_KEY_BY_ID[def.id];
    var upCost  = getPotionUpgradeCost(def.id);
    var upInfo  = keyName ? canUpgradePotion(def.id) : { ok:false, reason:'no_key_config' };

    var upgradeHtml = '';
    if (keyName){
      var disabledAttr = upInfo.ok ? '' : 'disabled';
      var reasonTxt = '';
      if (!upInfo.ok){
        if (upInfo.reason === 'max') reasonTxt = '（已達強化上限）';
        else if (upInfo.reason === 'no_key') reasonTxt = '（'+keyName+'不足）';
      }
      upgradeHtml =
        '<div class="ri-row" style="margin-top:0">'+
          '<div style="opacity:.95">強化等級：<b>Lv.'+upLv+' / '+POTION_UPGRADE_MAX_LEVEL+
            '</b>（回復倍率 +'+upPct+'%'+((POTION_UPGRADE_BASE_INC_BY_ID[def.id]||0)>0?(' · 基礎 +'+fmt((POTION_UPGRADE_BASE_INC_BY_ID[def.id]||0)*upLv)):'')+'）</div>'+
          '<div class="sp" style="display:flex;gap:10px;align-items:center">'+
            (upCost ? '<span style="opacity:.85">需要「'+keyName+'」×'+upCost+'</span>' : '')+
            '<button id="up-'+def.id+'" class="ri-btn warn" '+disabledAttr+'>升級</button>'+
            (reasonTxt ? '<span style="font-size:12px;opacity:.7">'+reasonTxt+'</span>' : '')+
          '</div>'+
        '</div>';
    } else {
      upgradeHtml = '<div style="font-size:13px;opacity:.75">此道具無強化功能</div>';
    }

    var capTxt = (info.capPct==null ? '無上限' : ('上限 '+Math.round(info.capPct*100)+'%（'+fmt(info.hardCap)+'）'));

    var detailHtml = ''+
      '<div class="ri-row" style="margin-top:0">'+
        '<div class="ri-kv">基礎：<b>'+fmt(info.baseNow)+'</b></div>'+
        '<div class="ri-kv">強化倍率：<b>x'+info.upMul.toFixed(2)+'</b></div>'+
        '<div class="ri-kv">恢復力：<b>'+powPct+'%</b></div>'+
        '<div class="ri-kv">上限：<b>'+capTxt+'</b></div>'+
      '</div>'+
      '<div class="ri-row" style="margin-top:0">'+
        '<div class="ri-kv">未受上限：<b>'+fmt(info.rawHeal)+'</b></div>'+
        '<div class="ri-kv">基礎上限：<b>'+fmt(info.capBase)+'</b></div>'+
        '<div class="ri-kv">硬上限：<b>'+(info.hardCap==null?'無':fmt(info.hardCap))+'</b></div>'+
      '</div>';

    var advanced =
      '<details class="ri-details" id="adv-'+def.id+'" data-adv="'+def.id+'"'+(STATE.advOpen && STATE.advOpen[def.id] ? ' open' : '')+'>'+ 
        '<summary>進階設定 <span style="opacity:.6;font-weight:600">（升級 / 自動 / 補貨）</span></summary>'+
        '<div style="margin-top:10px">'+
          detailHtml+
          upgradeHtml+
          '<div class="ri-row">'+
            '<label style="display:flex;gap:6px;align-items:center;cursor:pointer">'+
              '<input id="auto-'+def.id+'" type="checkbox" '+(conf.enabled?'checked':'')+'> 自動使用'+
            '</label>'+
            '<div class="ri-range">'+
              '<span style="opacity:.85">條件：'+(def.stat==='hp'?'HP':'MP')+' ≤ </span>'+
              '<input id="thr-'+def.id+'" type="range" min="1" max="100" value="'+thr+'">'+
              '<b id="thrval-'+def.id+'" style="width:44px;text-align:right">'+thr+'%</b>'+
            '</div>'+
          '</div>'+
          (def.price!=null ? (
            '<div class="ri-row">'+
              '<label style="display:flex;gap:6px;align-items:center;cursor:pointer">'+
                '<input id="ab-on-'+def.id+'" type="checkbox" '+(conf.autoBuy.enabled?'checked':'')+'> 自動補貨'+
              '</label>'+
              '<div style="display:flex;gap:8px;align-items:center;opacity:.92">'+
                '<span>目標庫存</span>'+
                '<input id="ab-tg-'+def.id+'" class="ri-num" type="number" min="0" max="999" value="'+conf.autoBuy.target+'">'+
              '</div>'+
              '<div class="sp ri-kv">資金：<b id="gold-'+def.id+'">'+fmt(getMoney())+'</b></div>'+
            '</div>'
          ) : (
            '<div class="ri-row" style="opacity:.75">'+
              '<span>不可購買的道具（無自動補貨）</span>'+
              '<div class="sp ri-kv">資金：<b id="gold-'+def.id+'">'+fmt(getMoney())+'</b></div>'+
            '</div>'
          ))+
        '</div>'+
      '</details>';

    return ''+
      '<div class="ri-card" id="card-'+def.id+'">'+
        '<div class="ri-top">'+
          '<div>'+ 
            '<div class="ri-name">'+def.name+'</div>'+
            '<div class="ri-sub">效果：<b id="heal-'+def.id+'">回復 '+fmt(heal)+'</b></div>'+
          '</div>'+
          '<div class="ri-right">'+
            '<div class="ri-actions">'+
              '<button id="use-'+def.id+'" class="ri-btn primary">使用</button>'+
              (def.price!=null ? '<button id="buy-'+def.id+'" class="ri-btn" title="Shift=10 / Ctrl=50 / Alt=補到目標">購買（'+fmt(def.price)+'）</button>' : '')+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div class="ri-meta">'+
          '<span class="ri-chip">庫存 <b id="stock-'+def.id+'">'+fmt(st)+'</b></span>'+
          '<span class="ri-chip">冷卻 <b id="cdtxt-'+def.id+'">'+(cd>0?fmtCountdown(cd):'就緒')+'</b></span>'+
        '</div>'+
        '<div class="ri-bar"><i id="cdbar-'+def.id+'" style="width:'+Math.round(cdRatio*100)+'%"></i></div>'+
        advanced+
      '</div>';
  }

  function bindCard(container, def){
    if (!container || !def) return;
    var $ = function(sel){ return container.querySelector(sel); };

    var btnUse = $('#use-'+def.id);
    if (btnUse) btnUse.onclick = withDebounce(btnUse, function(){
      var r = use(def.id, true);
      if (!r.ok){
        if (r.reason === 'dead') alert('你已死亡，無法使用道具');
        else if (r.reason === 'cooldown') alert('冷卻中：'+fmtCountdown(r.remainingMs));
        else if (r.reason === 'no_stock') alert('庫存不足');
        else if (r.reason === 'not_needed') alert('目前已滿，無需使用');
        else alert('無法使用（'+r.reason+'）');
      }
      refreshCard(def);
    });

    var btnBuy = $('#buy-'+def.id);
    if (btnBuy) btnBuy.onclick = withDebounce(btnBuy, function(e){
      var qty = 1;
      if (e && e.shiftKey) qty = 10;
      else if (e && (e.ctrlKey || e.metaKey)) qty = 50;
      else if (e && e.altKey) qty = 999999;

      var conf = autoConf(def);
      var target = conf.autoBuy && conf.autoBuy.target || Infinity;
      var startStock = getStock(def);
      var maxNeed = (def.price!=null) ? Math.max(0, target - startStock) : 0;
      if (e && e.altKey) qty = Math.min(qty, maxNeed>0?maxNeed:qty);

      var bought = 0;
      for (var i=0;i<qty;i++){
        var r = buy(def.id);
        if (!r.ok) break;
        bought++;
        if (def.price!=null && (getStock(def) >= target)) break;
      }
      if (!bought) alert('購買失敗（資金或販售限制）');
      refreshCard(def);
    });

    var chk = $('#auto-'+def.id);
    if (chk) chk.onchange = function(){ setAuto(def.id, this.checked); };

    var thr = $('#thr-'+def.id), tv = $('#thrval-'+def.id);
    if (thr && tv){
      thr.oninput  = function(){ tv.textContent = this.value + '%'; };
      thr.onchange = function(){ setThreshold(def.id, Math.max(1,Math.min(100, Number(this.value)||50))/100); };
    }

    var abOn = $('#ab-on-'+def.id);
    if (abOn) abOn.onchange = function(){
      var tg = container.querySelector('#ab-tg-'+def.id);
      setAutoBuy(def.id, this.checked, tg ? tg.value : undefined);
    };

    var abTg = $('#ab-tg-'+def.id);
    if (abTg) abTg.onchange = function(){ setAutoBuy(def.id, undefined, this.value); };

    var adv = $('#adv-'+def.id);
    if (adv) adv.ontoggle = function(){
      try{ STATE.advOpen = STATE.advOpen || {}; STATE.advOpen[def.id] = !!this.open; saveState(); }catch(_){ }
    };

    var btnUp = $('#up-'+def.id);
    if (btnUp) btnUp.onclick = withDebounce(btnUp, function(){
      var r = upgradePotion(def.id);
      if (!r.ok){
        if (r.reason === 'max') alert('已達強化等級上限');
        else if (r.reason === 'no_key'){
          var need = (r.need != null ? r.need : '?');
          var have = (r.have != null ? r.have : 0);
          var keyName = r.keyName || POTION_UPGRADE_KEY_BY_ID[def.id] || '潛能解放鑰匙';
          alert('「'+keyName+'」不足，需 '+need+' 把，現有 '+have+' 把。');
        } else if (r.reason === 'no_item') alert('找不到此藥水，無法強化');
        else alert('無法升級（'+r.reason+'）');
        return;
      }
      alert(def.name + ' 強化成功！目前等級 Lv.'+r.level);
      refreshCard(def);
    });
  }

  function refreshCard(def){
    if (!UI_CONTAINER || !def) return;
    try{
      var powPct = Math.round(getRecoveryPower()*100);
      var card = UI_CONTAINER.querySelector('#card-'+def.id);
      if (!card) return;
      card.outerHTML = buildCard(def, powPct);
      bindCard(UI_CONTAINER, def);
    }catch(_){ }
  }

  function render(container){
    if (!ensurePlayerReady()){ container.innerHTML = '<div style="opacity:.7">（玩家尚未就緒）</div>'; return; }
    // 保留使用者 UI 狀態（避免重繪造成收合/縮小/跳動）
    var prevScrollTop = 0;
    try{ prevScrollTop = container && container.scrollTop ? container.scrollTop : 0; }catch(_){ prevScrollTop = 0; }
    var powPct = Math.round(getRecoveryPower()*100);

    // 重新設計 UI（V6）
    // - 卡片式版面 + 兩欄網格（寬螢幕）
    // - 進階設定收合（升級 / 自動使用 / 自動補貨）
    // - 保留既有 id，避免事件綁定與外部依賴失效
    var css =
      '<style>'+
      '.ri-wrap{background:#0b1220;border:1px solid #1f2937;border-radius:14px;padding:14px;display:grid;gap:12px}'+
      '.ri-head{display:flex;align-items:center;gap:10px}'+
      '.ri-head .t{font-weight:800;font-size:15px;letter-spacing:.2px}'+
      '.ri-pill{margin-left:auto;display:flex;gap:8px;align-items:center}'+
      '.ri-badge{background:#0e172a;border:1px solid #253041;border-radius:999px;padding:6px 10px;font-size:12px;opacity:.9}'+
      '.ri-grid{display:grid;gap:12px}'+
      '@media (min-width: 920px){.ri-grid{grid-template-columns:1fr 1fr}}'+
      '.ri-card{border:1px solid #253041;border-radius:14px;padding:12px;background:#0e172a;display:grid;gap:10px;box-shadow:0 0 0 1px rgba(0,0,0,.08) inset}'+
      '.ri-top{display:flex;gap:10px;align-items:flex-start}'+
      '.ri-title{min-width:0}'+
      '.ri-name{font-weight:800;font-size:16px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}'+
      '.ri-sub{font-size:13px;opacity:.85;margin-top:4px;line-height:1.35}'+
      '.ri-meta{display:flex;gap:8px;align-items:center;flex-wrap:nowrap;overflow:hidden;margin-top:6px}'+
      '.ri-chip{background:#0e172a;border:1px solid #253041;border-radius:999px;padding:4px 8px;font-size:12px;opacity:.9;white-space:nowrap}'+
      '.ri-chip b{opacity:1}'+
      '.ri-right{margin-left:auto;display:flex;gap:10px;align-items:center}'+
      '.ri-kv{font-size:12px;opacity:.85}'+
      '.ri-kv b{opacity:1}'+
      '.ri-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}'+
      '.ri-btn{padding:8px 10px;border-radius:12px;border:1px solid #2a364a;background:#0b1220;color:#e5e7eb;cursor:pointer}'+
      '.ri-btn.primary{border:none;background:#10b981;color:#0b1220;font-weight:700}'+
      '.ri-btn.warn{border:none;background:#f97316;color:#0b1220;font-weight:800}'+
      '.ri-btn:disabled{opacity:.5;cursor:not-allowed}'+
      '.ri-bar{height:7px;border-radius:999px;background:#0b1220;border:1px solid #253041;overflow:hidden}'+
      '.ri-bar > i{display:block;height:100%;width:0%;background:linear-gradient(90deg,#22d3ee,#2563eb)}'+
      '.ri-details{border-top:1px dashed #253041;padding-top:10px}'+
      '.ri-details summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;font-weight:700;opacity:.9}'+
      '.ri-details summary::-webkit-details-marker{display:none}'+
      '.ri-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}'+
      '.ri-row .sp{margin-left:auto}'+
      '.ri-range{display:flex;gap:8px;align-items:center;margin-left:auto}'+
      '.ri-range input[type=range]{width:160px}'+
      '.ri-num{width:72px;padding:4px 6px;border-radius:10px;border:1px solid #374151;background:#0b1220;color:#e5e7eb}'+
      '</style>';

    function row(def){
      var cd  = getCdRemain(def);
      var st  = getStock(def);
      var conf= autoConf(def);
      var thr = Math.round(conf.threshold01*100);
      var info = getPotionHealInfo(def);
      var heal= info.finalHeal;
      var cdRatio = 0;
      if (cd > 0 && def.cdMs > 0) cdRatio = clamp((def.cdMs - cd) / def.cdMs, 0, 1);
      var cdTxt = (cd > 0 ? fmtCountdown(cd) : '就緒');

      // 強化資訊
      var upLv    = info.lv;
      var upPct   = Math.round(upLv * POTION_UPGRADE_STEP_PCT * 100); // 額外回復 %
      var keyName = POTION_UPGRADE_KEY_BY_ID[def.id];
      var upCost  = getPotionUpgradeCost(def.id);
      var upInfo  = keyName ? canUpgradePotion(def.id) : { ok:false, reason:'no_key_config' };

      var upgradeHtml = '';
      if (keyName){
        var disabledAttr = upInfo.ok ? '' : 'disabled';
        var reasonTxt = '';
        if (!upInfo.ok){
          if (upInfo.reason === 'max') reasonTxt = '（已達強化上限）';
          else if (upInfo.reason === 'no_key') reasonTxt = '（'+keyName+'不足）';
        }
        upgradeHtml =
          '<div class="ri-row" style="margin-top:0">'+
            '<div style="opacity:.95">強化等級：<b>Lv.'+upLv+' / '+POTION_UPGRADE_MAX_LEVEL+
              '</b>（回復倍率 +'+upPct+'%'+((POTION_UPGRADE_BASE_INC_BY_ID[def.id]||0)>0?(' · 基礎 +'+fmt((POTION_UPGRADE_BASE_INC_BY_ID[def.id]||0)*upLv)):'')+'）</div>'+
            '<div class="sp" style="display:flex;gap:10px;align-items:center">'+
              (upCost ? '<span style="opacity:.85">需要「'+keyName+'」×'+upCost+'</span>' : '')+
              '<button id="up-'+def.id+'" class="ri-btn warn" '+disabledAttr+'>升級</button>'+
              (reasonTxt ? '<span style="font-size:12px;opacity:.7">'+reasonTxt+'</span>' : '')+
            '</div>'+
          '</div>';
      } else {
        upgradeHtml =
          '<div style="font-size:13px;opacity:.75">此道具無強化功能</div>';
      }

      var capTxt = (info.capPct==null ? '無上限' : ('上限 '+Math.round(info.capPct*100)+'%（'+fmt(info.hardCap)+'）'));

      var detailHtml = ''+
        '<div class="ri-row" style="margin-top:0">'+
          '<div class="ri-kv">基礎：<b>'+fmt(info.baseNow)+'</b></div>'+
          '<div class="ri-kv">強化倍率：<b>x'+info.upMul.toFixed(2)+'</b></div>'+
          '<div class="ri-kv">恢復力：<b>'+powPct+'%</b></div>'+
          '<div class="ri-kv">上限：<b>'+capTxt+'</b></div>'+
        '</div>'+
        '<div class="ri-row" style="margin-top:0">'+
          '<div class="ri-kv">未受上限：<b>'+fmt(info.rawHeal)+'</b></div>'+
          '<div class="ri-kv">基礎上限：<b>'+fmt(info.capBase)+'</b></div>'+
          '<div class="ri-kv">硬上限：<b>'+(info.hardCap==null?'無':fmt(info.hardCap))+'</b></div>'+
        '</div>';

      // 進階：把「升級 / 自動 / 補貨」放在同一個可收合區域，版面更乾淨
      var advanced =
        '<details class="ri-details" id="adv-'+def.id+'" data-adv="'+def.id+'"'+(STATE.advOpen && STATE.advOpen[def.id] ? ' open' : '')+'>'+
          '<summary>進階設定 <span style="opacity:.6;font-weight:600">（升級 / 自動 / 補貨）</span></summary>'+
          '<div style="margin-top:10px">'+
            detailHtml+
            upgradeHtml+
            '<div class="ri-row">'+
              '<label style="display:flex;gap:6px;align-items:center;cursor:pointer">'+
                '<input id="auto-'+def.id+'" type="checkbox" '+(conf.enabled?'checked':'')+'> 自動使用'+
              '</label>'+
              '<div class="ri-range">'+
                '<span style="opacity:.85">條件：'+(def.stat==='hp'?'HP':'MP')+' ≤ </span>'+
                '<input id="thr-'+def.id+'" type="range" min="1" max="100" value="'+thr+'">'+
                '<b id="thrval-'+def.id+'" style="width:44px;text-align:right">'+thr+'%</b>'+
              '</div>'+
            '</div>'+
            (def.price!=null ? (
              '<div class="ri-row">'+
                '<label style="display:flex;gap:6px;align-items:center;cursor:pointer">'+
                  '<input id="ab-on-'+def.id+'" type="checkbox" '+(conf.autoBuy.enabled?'checked':'')+'> 自動補貨'+
                '</label>'+
                '<div style="display:flex;gap:8px;align-items:center;opacity:.92">'+
                  '<span>目標庫存</span>'+
                  '<input id="ab-tg-'+def.id+'" class="ri-num" type="number" min="0" max="999" value="'+conf.autoBuy.target+'">'+
                '</div>'+
                '<div class="sp ri-kv">資金：<b id="gold-'+def.id+'">'+fmt(getMoney())+'</b></div>'+
              '</div>'
            ) : (
              '<div class="ri-row" style="opacity:.75">'+
                '<span>不可購買的道具（無自動補貨）</span>'+
                '<div class="sp ri-kv">資金：<b id="gold-'+def.id+'">'+fmt(getMoney())+'</b></div>'+
              '</div>'
            ))+
          '</div>'+
        '</details>';

      return ''+
        '<div class="ri-card">'+
          '<div class="ri-top">'+
            '<div>'+ 
              '<div class="ri-name">'+def.name+'</div>'+
              '<div class="ri-sub">效果：<b>回復 '+fmt(heal)+'</b></div>'+
            '</div>'+
            '<div class="ri-right">'+
                            '<div class="ri-actions">'+
                '<button id="use-'+def.id+'" class="ri-btn primary">使用</button>'+
                (def.price!=null ? '<button id="buy-'+def.id+'" class="ri-btn" title="Shift=10 / Ctrl=50 / Alt=補到目標">購買（'+fmt(def.price)+'）</button>' : '')+
              '</div>'+
            '</div>'+
          '</div>'+
          '<div class="ri-meta">'+
            '<span class="ri-chip">庫存 <b id="stock-'+def.id+'">'+fmt(st)+'</b></span>'+
            '<span class="ri-chip">冷卻 <b id="cdtxt-'+def.id+'">'+(cd>0?fmtCountdown(cd):'就緒')+'</b></span>'+
          '</div>'+
          '<div class="ri-bar"><i id="cdbar-'+def.id+'" style="width:'+Math.round(cdRatio*100)+'%"></i></div>'+
          advanced+
        '</div>';
    }

    container.innerHTML =
      getRiCss() +
      '<div class="ri-wrap">'+
        '<div class="ri-head">'+
          '<div class="t">🧪 </div>'+
          '<div class="ri-pill">'+
            '<div class="ri-badge">恢復力：<b>'+powPct+'%</b></div>'+
            '<div class="ri-badge" style="opacity:.75">提示：購買可用 Shift(×10) / Ctrl(×50) / Alt(補到目標)</div>'+
          '</div>'+
        '</div>'+
        '<div class="ri-grid">'+
          LIST.map(function(d){ return buildCard(d, powPct); }).join('')+
        '</div>'+
      '</div>';

    // 綁定事件（帶去抖）
    // 舊：整段會在每次 render 後重新綁定，並且使用 rerender() 造成整頁重繪。
    // 改：保留程式碼但停用，改用 bindCard + refreshCard 做局部刷新。
    if (false) { LIST.forEach(function(def){
      var $ = function(sel){ return container.querySelector(sel); };

      var btnUse = $('#use-'+def.id);
      if (btnUse) btnUse.onclick = withDebounce(btnUse, function(){
        var r = use(def.id, true);
        if (!r.ok){
          if (r.reason === 'dead') alert('你已死亡，無法使用道具');
          else if (r.reason === 'cooldown') alert('冷卻中：'+fmtCountdown(r.remainingMs));
          else if (r.reason === 'no_stock') alert('庫存不足');
          else if (r.reason === 'not_needed') alert('目前已滿，無需使用');
          else alert('無法使用（'+r.reason+'）');
        }
        rerender();
      });

      var btnBuy = $('#buy-'+def.id);
      if (btnBuy) btnBuy.onclick = withDebounce(btnBuy, function(e){
        var qty = 1;
        if (e && e.shiftKey) qty = 10;
        else if (e && (e.ctrlKey || e.metaKey)) qty = 50;
        else if (e && e.altKey) qty = 999999;

        var conf = autoConf(def);
        var target = conf.autoBuy && conf.autoBuy.target || Infinity;
        var startStock = getStock(def);
        var maxNeed = (def.price!=null) ? Math.max(0, target - startStock) : 0;
        if (e && e.altKey) qty = Math.min(qty, maxNeed>0?maxNeed:qty);

        var bought = 0;
        for (var i=0;i<qty;i++){
          var r = buy(def.id);
          if (!r.ok) break;
          bought++;
          if (def.price!=null && (getStock(def) >= target)) break;
        }
        if (!bought) alert('購買失敗（資金或販售限制）');
        rerender();
      });

      var chk = $('#auto-'+def.id);
      if (chk) chk.onchange = function(){ setAuto(def.id, this.checked); };

      var thr = $('#thr-'+def.id), tv = $('#thrval-'+def.id);
      if (thr && tv){
        thr.oninput  = function(){ tv.textContent = this.value + '%'; };
        thr.onchange = function(){ setThreshold(def.id, Math.max(1,Math.min(100, Number(this.value)||50))/100); };
      }

      var abOn = $('#ab-on-'+def.id);
      if (abOn) abOn.onchange = function(){
        var tg = container.querySelector('#ab-tg-'+def.id);
        setAutoBuy(def.id, this.checked, tg ? tg.value : undefined);
      };
      var abTg = $('#ab-tg-'+def.id);
      if (abTg) abTg.onchange = function(){
        setAutoBuy(def.id, undefined, this.value);
      };

      var adv = $('#adv-'+def.id);
      if (adv) adv.ontoggle = function(){
        try{ STATE.advOpen = STATE.advOpen || {}; STATE.advOpen[def.id] = !!this.open; saveState(); }catch(_){}
      };

      var btnUp = $('#up-'+def.id);
      if (btnUp) btnUp.onclick = withDebounce(btnUp, function(){
        var r = upgradePotion(def.id);
        if (!r.ok){
          if (r.reason === 'max') {
            alert('已達強化等級上限');
          } else if (r.reason === 'no_key') {
            var need = (r.need != null ? r.need : '?');
            var have = (r.have != null ? r.have : 0);
            var keyName = r.keyName || POTION_UPGRADE_KEY_BY_ID[def.id] || '潛能解放鑰匙';
            alert('「'+keyName+'」不足，需 '+need+' 把，現有 '+have+' 把。');
          } else if (r.reason === 'no_item') {
            alert('找不到此藥水，無法強化');
          } else {
            alert('無法升級（'+r.reason+'）');
          }
          return;
        }
        alert(def.name + ' 強化成功！目前等級 Lv.'+r.level);
        rerender();
      });
    });
    }

    // 新：只綁定一次卡片事件（局部刷新）
    LIST.forEach(function(def){ bindCard(container, def); });

    // 每秒刷新（冷卻/庫存/金錢/冷卻條）— 使用單一計時器，避免重繪後越跑越多
    UI_CONTAINER = container;
    if (!UI_LOOP_STARTED){
      UI_LOOP_STARTED = true;
      (function loop(){
        var c = UI_CONTAINER;
        try{
          if (c){
            LIST.forEach(function(def){
              var invEl = c.querySelector('#inv-'+def.id);
              if (invEl) invEl.textContent = fmt(getStock(def));

              var cdEl = c.querySelector('#cd-'+def.id);
              if (cdEl) {
                var cd = getCdRemain(def);
                cdEl.textContent = (cd > 0 ? fmtCountdown(cd) : '就緒');
              }

              var cdTxt = c.querySelector('#cdtxt-'+def.id);
              if (cdTxt) {
                var cd2 = getCdRemain(def);
                cdTxt.textContent = (cd2 > 0 ? fmtCountdown(cd2) : '就緒');
              }

              var stEl = c.querySelector('#stock-'+def.id);
              if (stEl) stEl.textContent = fmt(getStock(def));

              var goldEl = c.querySelector('#gold-'+def.id);
              if (goldEl) goldEl.textContent = fmt(getMoney());

              var bar = c.querySelector('#cdbar-'+def.id);
              if (bar){
                var cd = getCdRemain(def);
                var ratio = 0;
                if (cd > 0 && def.cdMs > 0) ratio = clamp((def.cdMs - cd) / def.cdMs, 0, 1);
                bar.style.width = Math.round(ratio*100)+'%';
              }
            });
          }
        }catch(_){}
        setTimeout(loop, 1000);
      })();
    }

    // 還原捲動位置（避免重繪造成畫面跳動/縮小錯覺）
    if (prevScrollTop){
      setTimeout(function(){ try{ container.scrollTop = prevScrollTop; }catch(_){} }, 0);
    }

  }

  function rerender(){
    var tab = document.getElementById('recovery-items-tab-body');
    if (tab) render(tab);
  }

  if (window.GrowthHub && typeof window.GrowthHub.registerTab === 'function'){
    window.GrowthHub.registerTab({
      id: 'potions',
      title: '藥水',
      render: render,
      // GrowthHub 的 tick 可能被其他模組用來驅動自動用藥；保留相容。
      tick: function(steps){
        try{
          steps = Math.max(1, Number(steps)||1);
          for (var i=0;i<steps;i++) autoTick();
        }catch(_){ }
      }
    });
  }

  // ✅ 確保自動用藥在 UI 未開啟時也會運作（只啟動一次）
  ensureAutoLoop();

  // 對外
  window.RecoveryItemsTab = {
    __v5__: true,
    use: function(id){ return use(id, true); },
    buy: buy,
    canUse: canUse,
    setAuto: setAuto,
    setThreshold: setThreshold,
    setAutoBuy: setAutoBuy,
    autoTick: autoTick,
    totalHeal: totalHeal
  };
})();