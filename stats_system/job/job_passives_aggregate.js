// =======================================================
// job_passives_core.js — 核心（Store + Aggregate 合併版，ES5）
//
// - 存檔層 + 券檢查 + 等級→加成計算 + 寫入 coreBonus / PotentialBonus
// - 新被動：
//   劍士【生命祝福】(10級)
//   法師【魔力祝福】(10級)
//   盜賊/弓手【生命續航】(10級)
// - 共通【女神祈禱】(25級，每級+3%，最多75%，10等起額外攻防平坦)
// - 自動偵測玩家等級/職業變更，關閉面板也會即時 apply
// - 提供技能與設計給 UI（getSkillDefs / getAllSkillDefs / registerSkill）
// - 保留舊 API 名稱相容層（JobPassiveStore/Aggregate）
// =======================================================
(function (w, d) {
  "use strict";
  if (w.JobPassivesCore) return; // 避免重複掛載

  // ===== 常數與工具 =====
  var SAVE_NS  = "job_passives";    // SaveHub 命名空間
  var SAVE_KEY = "被動券";           // localStorage 後援鍵
  var COST_PER_LEVEL = 1;           // 每級消耗 1 張券

  // 舊四職上限
  var MAX_LV_OLD = 10;
  // 新被動（生命祝福/魔力祝福/生命續航）上限
  var MAX_LV_NEW = 10;
  // 女神上限
  var MAX_LV_GODDESS = 25;

  // 舊程式相容用
  var MAX_LV = MAX_LV_OLD;

  // === 設計常數（唯一真實數值來源） ===
  // 舊四職每級係數
  var WARRIOR_DMGRED_PER_LV   = 0.03; // 3%
  var MAGE_SHIELD_PER_LV      = 0.09; // 9%（已修改）
  var THIEF_DOUBLEHIT_PER_LV  = 0.04; // 4%
  var ARCHER_PREEMPT_PER_LV   = 0.04; // 4%

  // 生命祝福：HP = 等級 × (60 + (lv-1)*10)，MP = 等級 × 3
  var LIFE_BLESS_HP_BASE      = 60;
  var LIFE_BLESS_HP_INC       = 10;
  var LIFE_BLESS_MP_PER_LV    = 3;

  // 魔力祝福：MP = 等級 × (70 + (lv-1)*13)，HP = 等級 × 15
  var MANA_BLESS_MP_BASE      = 70;
  var MANA_BLESS_MP_INC       = 13;
  var MANA_BLESS_HP_PER_LV    = 15;

  // 生命續航：HP = 等級 × (30 + (lv-1)*10)，MP = 等級 × 5
  var VITAL_HP_BASE           = 30;
  var VITAL_HP_INC            = 10;
  var VITAL_MP_PER_LV         = 5;

  // 女神祈禱：每級 +3%，最多 75%（25級），10級起額外攻防
  var GODDESS_PER_LV_PERCENT          = 0.03; // 3% (小數)
  var GODDESS_LV_CAP                  = MAX_LV_GODDESS; // 25
  var GODDESS_MAX_TOTAL_PERCENT       = GODDESS_PER_LV_PERCENT * GODDESS_LV_CAP; // 0.75 (75%)
  var GODDESS_EXTRA_UNLOCK_LV         = 10;
  var GODDESS_EXTRA_DEF_PER_PLAYER_LV = 3;  // 防禦力上升 5 × 等級
  var GODDESS_EXTRA_ATK_PER_PLAYER_LV = 5;  // 攻擊力上升 8 × 等級

  function clampLv(x) {
    x = Number(x) || 0;
    return Math.max(0, Math.min(100, x));
  }

  function getBaseJobSafe(job) {
    var j = String(job || "").toLowerCase();
    if (typeof w.getBaseJob === "function") return w.getBaseJob(j);
    return j.replace(/\d+$/, "");
  }

  // 券：讀/扣（透過背包 API）
  function getTickets() {
    try {
      if (typeof w.getItemQuantity === "function") {
        return (w.getItemQuantity("被動能力券") | 0);
      }
    } catch (_) {}
    return 0;
  }

  function consumeTickets(n) {
    n = (n | 0) || 1;
    try {
      if (typeof w.getItemQuantity === "function" && typeof w.removeItem === "function") {
        if ((w.getItemQuantity("被動能力券") | 0) >= n) {
          w.removeItem("被動能力券", n);
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  // ===== 技能定義（邏輯用） =====
  var SKILLS = {
    // 舊系統（仍可用）
    warrior:    { key: "fortitude",    cap: MAX_LV_OLD,     name: "堅韌護體" },
    mage:       { key: "manaGuard",    cap: MAX_LV_OLD,     name: "魔力護體" },
    thief:      { key: "flurry",       cap: MAX_LV_OLD,     name: "連續攻擊" },
    archer:     { key: "quickdraw",    cap: MAX_LV_OLD,     name: "先手再動" },

    // 新系統（各 10 級）
    warriorLife:{ key: "lifeBlessing", cap: MAX_LV_NEW,     name: "生命祝福" },
    mageMana:   { key: "manaBlessing", cap: MAX_LV_NEW,     name: "魔力祝福" },
    thiefLife:  { key: "vitalSustain", cap: MAX_LV_NEW,     name: "生命續航" },
    archerLife: { key: "vitalSustain", cap: MAX_LV_NEW,     name: "生命續航" },

    // 共通（女神祈禱）
    goddess:    { key: "goddessGrace", cap: MAX_LV_GODDESS, name: "女神祈禱" }
  };

  // 舊系統每級係數
  var PER_LV = {
    warrior: { damageReduce:        WARRIOR_DMGRED_PER_LV },
    mage:    { magicShieldPercent:  MAGE_SHIELD_PER_LV },
    thief:   { doubleHitChance:     THIEF_DOUBLEHIT_PER_LV },
    archer:  { preemptiveChance:    ARCHER_PREEMPT_PER_LV }
  };
  var ARCHER_CAP_BONUS = 1; // 10等 +1

  // ===== 技能定義（給 UI，用設計數值組文字） =====
  var _baseSkillDefs = (function () {
    function pctStr(x) { return Math.round(x * 1000) / 10; } // 小數→百分比一位小數

    var arr = [];

    // ---- 舊四職 ----
    arr.push({
      id: "warrior",
      jobKey: "warrior",
      job: "warrior",
      group: "old",
      isPrimary: false,
      stateRoot: "warrior",
      stateKey: "fortitude",
      cap: SKILLS.warrior.cap,
      name: "堅韌護體",
      shortDesc: "每級 +" + pctStr(WARRIOR_DMGRED_PER_LV) + "% 減傷",
      detailDesc: "每級 +" + pctStr(WARRIOR_DMGRED_PER_LV) + "% 減傷（上限 " + SKILLS.warrior.cap + "）",
      sort: 10
    });

    arr.push({
      id: "mage",
      jobKey: "mage",
      job: "mage",
      group: "old",
      isPrimary: false,
      stateRoot: "mage",
      stateKey: "manaGuard",
      cap: SKILLS.mage.cap,
      name: "魔力護體",
      shortDesc: "每級 +" + pctStr(MAGE_SHIELD_PER_LV) + "% 魔力護盾",
      detailDesc: "每級 +" + pctStr(MAGE_SHIELD_PER_LV) + "% 魔力護盾（上限 " + SKILLS.mage.cap + "）",
      sort: 20
    });

    arr.push({
      id: "thief",
      jobKey: "thief",
      job: "thief",
      group: "old",
      isPrimary: false,
      stateRoot: "thief",
      stateKey: "flurry",
      cap: SKILLS.thief.cap,
      name: "連續攻擊",
      shortDesc: "每級 +" + pctStr(THIEF_DOUBLEHIT_PER_LV) + "% 連擊率",
      detailDesc: "每級 +" + pctStr(THIEF_DOUBLEHIT_PER_LV) + "% 連擊率（上限 " + SKILLS.thief.cap + "）",
      sort: 30
    });

    arr.push({
      id: "archer",
      jobKey: "archer",
      job: "archer",
      group: "old",
      isPrimary: false,
      stateRoot: "archer",
      stateKey: "quickdraw",
      cap: SKILLS.archer.cap,
      name: "先手再動",
      shortDesc: "每級 +" + pctStr(ARCHER_PREEMPT_PER_LV) + "% 先手再發動機率",
      detailDesc: "每級 +" + pctStr(ARCHER_PREEMPT_PER_LV) + "% 先手再發動機率；在 10 等時，每次攻擊再動次數上限 +1（上限 " + SKILLS.archer.cap + "）",
      sort: 40
    });

    // ---- 新被動（各職） ----
    arr.push({
      id: "warriorLife",
      jobKey: "warriorLife",
      job: "warrior",
      group: "new",
      isPrimary: true,
      stateRoot: "warrior",
      stateKey: "lifeBlessing",
      cap: SKILLS.warriorLife.cap,
      name: "生命祝福",
      shortDesc: "HP = 玩家等級 × ( " + LIFE_BLESS_HP_BASE + " → " + (LIFE_BLESS_HP_BASE + (SKILLS.warriorLife.cap - 1) * LIFE_BLESS_HP_INC) + " )，MP = 玩家等級 × " + LIFE_BLESS_MP_PER_LV + "（固定）",
      detailDesc: "HP = 玩家等級 × " + LIFE_BLESS_HP_BASE + " 起，每級 +" + LIFE_BLESS_HP_INC + "，最高 " + (LIFE_BLESS_HP_BASE + (SKILLS.warriorLife.cap - 1) * LIFE_BLESS_HP_INC) + "；另給 MP = 玩家等級 × " + LIFE_BLESS_MP_PER_LV + "（固定，不吃加成）",
      sort: 110
    });

    arr.push({
      id: "mageMana",
      jobKey: "mageMana",
      job: "mage",
      group: "new",
      isPrimary: true,
      stateRoot: "mage",
      stateKey: "manaBlessing",
      cap: SKILLS.mageMana.cap,
      name: "魔力祝福",
      shortDesc: "MP = 玩家等級 × ( " + MANA_BLESS_MP_BASE + " → " + (MANA_BLESS_MP_BASE + (SKILLS.mageMana.cap - 1) * MANA_BLESS_MP_INC) + " )，HP = 玩家等級 × " + MANA_BLESS_HP_PER_LV + "（固定）",
      detailDesc: "MP = 玩家等級 × " + MANA_BLESS_MP_BASE + " 起，每級 +" + MANA_BLESS_MP_INC + "；另給 HP = 玩家等級 × " + MANA_BLESS_HP_PER_LV + "（固定，不吃加成）",
      sort: 120
    });

    arr.push({
      id: "thiefLife",
      jobKey: "thiefLife",
      job: "thief",
      group: "new",
      isPrimary: true,
      stateRoot: "thief",
      stateKey: "vitalSustain",
      cap: SKILLS.thiefLife.cap,
      name: "生命續航",
      shortDesc: "HP = 玩家等級 × ( " + VITAL_HP_BASE + " → " + (VITAL_HP_BASE + (SKILLS.thiefLife.cap - 1) * VITAL_HP_INC) + " )，MP = 玩家等級 × " + VITAL_MP_PER_LV + "（固定）",
      detailDesc: "HP = 玩家等級 × " + VITAL_HP_BASE + " 起，每級 +" + VITAL_HP_INC + "，最高 " + (VITAL_HP_BASE + (SKILLS.thiefLife.cap - 1) * VITAL_HP_INC) + "；另給 MP = 玩家等級 × " + VITAL_MP_PER_LV + "（固定，不吃加成）",
      sort: 130
    });

    arr.push({
      id: "archerLife",
      jobKey: "archerLife",
      job: "archer",
      group: "new",
      isPrimary: true,
      stateRoot: "archer",
      stateKey: "vitalSustain",
      cap: SKILLS.archerLife.cap,
      name: "生命續航",
      shortDesc: "HP = 玩家等級 × ( " + VITAL_HP_BASE + " → " + (VITAL_HP_BASE + (SKILLS.archerLife.cap - 1) * VITAL_HP_INC) + " )，MP = 玩家等級 × " + VITAL_MP_PER_LV + "（固定）",
      detailDesc: "HP = 玩家等級 × " + VITAL_HP_BASE + " 起，每級 +" + VITAL_HP_INC + "，最高 " + (VITAL_HP_BASE + (SKILLS.archerLife.cap - 1) * VITAL_HP_INC) + "；另給 MP = 玩家等級 × " + VITAL_MP_PER_LV + "（固定，不吃加成）",
      sort: 140
    });

    // ---- 女神祈禱 ----
    arr.push({
      id: "goddess",
      jobKey: "goddess",
      job: "global",
      group: "goddess",
      isPrimary: false,
      stateRoot: "global",
      stateKey: "goddessGrace",
      cap: SKILLS.goddess.cap,
      name: "女神祈禱",
      shortDesc: "每級 +" + pctStr(GODDESS_PER_LV_PERCENT) + "% 主增量（最多 " + (GODDESS_MAX_TOTAL_PERCENT * 100) + "%）",
      detailDesc:
        "提高「生命祝福 / 魔力祝福 / 生命續航」主增量 +" + pctStr(GODDESS_PER_LV_PERCENT) + "%/級，最多 " + (GODDESS_MAX_TOTAL_PERCENT * 100) +
        "%；當女神祈禱達 10 等時，額外獲得：防禦力 +" + GODDESS_EXTRA_DEF_PER_PLAYER_LV +
        "×玩家等級、攻擊力 +" + GODDESS_EXTRA_ATK_PER_PLAYER_LV + "×玩家等級（固定，不吃加成）",
      sort: 200
    });

    return arr;
  })();

  // 讓外部額外技能檔可以註冊 UI 使用的技能定義
  var _extraSkillDefs = [];

  function registerSkill(def) {
    if (!def || !def.id) return;
    _extraSkillDefs.push(def);
  }

  function cloneSkillDefs(arr) {
    return JSON.parse(JSON.stringify(arr || []));
  }

  function getSkillDefs() {
    return cloneSkillDefs(_baseSkillDefs);
  }

  function getAllSkillDefs() {
    return cloneSkillDefs(_baseSkillDefs.concat(_extraSkillDefs));
  }

  // ===== 存檔層（SaveHub 優先 / localStorage 後援）=====
  function freshState() {
    return {
      warrior: { fortitude: 0, lifeBlessing: 0 },
      mage:    { manaGuard: 0, manaBlessing: 0 },
      thief:   { flurry: 0, vitalSustain: 0 },
      archer:  { quickdraw: 0, vitalSustain: 0 },
      global:  { goddessGrace: 0 }
    };
  }

  function normalizeState(o) {
    o = o || {};
    o.warrior = o.warrior || { fortitude: 0, lifeBlessing: 0 };
    o.mage    = o.mage    || { manaGuard: 0, manaBlessing: 0 };
    o.thief   = o.thief   || { flurry: 0, vitalSustain: 0 };
    o.archer  = o.archer  || { quickdraw: 0, vitalSustain: 0 };
    o.global  = o.global  || { goddessGrace: 0 };

    o.warrior.fortitude    = clampLv(o.warrior.fortitude);
    o.warrior.lifeBlessing = clampLv(o.warrior.lifeBlessing);
    o.mage.manaGuard       = clampLv(o.mage.manaGuard);
    o.mage.manaBlessing    = clampLv(o.mage.manaBlessing);
    o.thief.flurry         = clampLv(o.thief.flurry);
    o.thief.vitalSustain   = clampLv(o.thief.vitalSustain);
    o.archer.quickdraw     = clampLv(o.archer.quickdraw);
    o.archer.vitalSustain  = clampLv(o.archer.vitalSustain);
    o.global.goddessGrace  = clampLv(o.global.goddessGrace);
    return o;
  }

  var useSaveHub = !!w.SaveHub;
  if (useSaveHub) {
    try {
      var spec = {};
      spec[SAVE_NS] = {
        version: 2,
        migrate: function (old) {
          return normalizeState(old || freshState());
        }
      };
      w.SaveHub.registerNamespaces(spec);
    } catch (_) {}
  }

  function loadState() {
    try {
      if (useSaveHub) {
        var s = w.SaveHub.get(SAVE_NS, freshState());
        return normalizeState(s);
      } else {
        var raw = localStorage.getItem(SAVE_KEY);
        return normalizeState(raw ? JSON.parse(raw) || freshState() : freshState());
      }
    } catch (_) {}
    return freshState();
  }

  function saveState(s) {
    try {
      if (useSaveHub) w.SaveHub.set(SAVE_NS, s);
      else localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch (_) {}
  }

  var state = loadState();

  // ===== 訂閱與快照 =====
  var subs = [];

  function snapshotLevels() {
    return {
      warrior: { fortitude: state.warrior.fortitude | 0, lifeBlessing: state.warrior.lifeBlessing | 0 },
      mage:    { manaGuard: state.mage.manaGuard | 0,    manaBlessing: state.mage.manaBlessing | 0 },
      thief:   { flurry: state.thief.flurry | 0,          vitalSustain: state.thief.vitalSustain | 0 },
      archer:  { quickdraw: state.archer.quickdraw | 0,  vitalSustain: state.archer.vitalSustain | 0 },
      global:  { goddessGrace: state.global.goddessGrace | 0 }
    };
  }

  function notify() {
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](snapshotLevels()); } catch (_) {}
    }
  }

  // ===== 能否/嘗試升級 =====
  function _jobHasMaxedPrimary(base) {
    var lv = snapshotLevels();
    if (base === "warrior") return (lv.warrior.lifeBlessing >= SKILLS.warriorLife.cap);
    if (base === "mage")    return (lv.mage.manaBlessing   >= SKILLS.mageMana.cap);
    if (base === "thief")   return (lv.thief.vitalSustain  >= SKILLS.thiefLife.cap);
    if (base === "archer")  return (lv.archer.vitalSustain >= SKILLS.archerLife.cap);
    return false;
  }

  function canLevelUp(jobKey) {
    var base = getBaseJobSafe(w.player && w.player.job);

    // 女神祈禱：本職的新被動滿等才可升
    if (jobKey === "goddess") {
      if (!_jobHasMaxedPrimary(base)) return false;
      return (getTickets() >= COST_PER_LEVEL && state.global.goddessGrace < SKILLS.goddess.cap);
    }

    // 其餘需符合職業身分
    var isSelf =
      (jobKey === "warrior"     && base === "warrior") ||
      (jobKey === "mage"        && base === "mage")    ||
      (jobKey === "thief"       && base === "thief")   ||
      (jobKey === "archer"      && base === "archer")  ||
      (jobKey === "warriorLife" && base === "warrior") ||
      (jobKey === "mageMana"    && base === "mage")    ||
      (jobKey === "thiefLife"   && base === "thief")   ||
      (jobKey === "archerLife"  && base === "archer");

    if (!isSelf) return false;
    if (getTickets() < COST_PER_LEVEL) return false;

    if (jobKey === "warrior") return (state.warrior.fortitude   < SKILLS.warrior.cap);
    if (jobKey === "mage")    return (state.mage.manaGuard      < SKILLS.mage.cap);
    if (jobKey === "thief")   return (state.thief.flurry        < SKILLS.thief.cap);
    if (jobKey === "archer")  return (state.archer.quickdraw    < SKILLS.archer.cap);

    if (jobKey === "warriorLife") return (state.warrior.lifeBlessing < SKILLS.warriorLife.cap);
    if (jobKey === "mageMana")    return (state.mage.manaBlessing    < SKILLS.mageMana.cap);
    if (jobKey === "thiefLife")   return (state.thief.vitalSustain   < SKILLS.thiefLife.cap);
    if (jobKey === "archerLife")  return (state.archer.vitalSustain  < SKILLS.archerLife.cap);

    return false;
  }

  function tryLevelUp(jobKey) {
    if (!canLevelUp(jobKey)) return false;
    if (!consumeTickets(COST_PER_LEVEL)) return false;

    if (jobKey === "warrior")      state.warrior.fortitude++;
    else if (jobKey === "mage")    state.mage.manaGuard++;
    else if (jobKey === "thief")   state.thief.flurry++;
    else if (jobKey === "archer")  state.archer.quickdraw++;

    else if (jobKey === "warriorLife") state.warrior.lifeBlessing++;
    else if (jobKey === "mageMana")    state.mage.manaBlessing++;
    else if (jobKey === "thiefLife")   state.thief.vitalSustain++;
    else if (jobKey === "archerLife")  state.archer.vitalSustain++;
    else if (jobKey === "goddess")     state.global.goddessGrace++;
    else return false;

    saveState(state);
    apply();
    notify();
    return true;
  }

  function setLevel(jobKey, key, lv) {
    lv = clampLv(lv | 0);

    if (jobKey === "warrior" && key === "fortitude")        state.warrior.fortitude    = lv;
    if (jobKey === "mage"    && key === "manaGuard")        state.mage.manaGuard       = lv;
    if (jobKey === "thief"   && key === "flurry")           state.thief.flurry         = lv;
    if (jobKey === "archer"  && key === "quickdraw")        state.archer.quickdraw     = lv;

    if (jobKey === "warriorLife" && key === "lifeBlessing") state.warrior.lifeBlessing = lv;
    if (jobKey === "mageMana"    && key === "manaBlessing") state.mage.manaBlessing    = lv;
    if (jobKey === "thiefLife"   && key === "vitalSustain") state.thief.vitalSustain   = lv;
    if (jobKey === "archerLife"  && key === "vitalSustain") state.archer.vitalSustain  = lv;
    if (jobKey === "goddess"     && key === "goddessGrace") state.global.goddessGrace  = lv;

    saveState(state);
    apply();
    notify();
  }

  // ===== 玩家等級 =====
  function _playerLevel() {
    var lv = 1;
    try { lv = (w.player && (w.player.level | 0)) || 1; } catch (_) {}
    return Math.max(1, lv | 0);
  }

  // ===== 等級 → 加成計算（平坦 + 女神放大） =====
  function getComputed() {
    var lv = snapshotLevels();
    var wLv = (lv && lv.warrior) ? (lv.warrior.fortitude | 0) : 0;
    var mLv = (lv && lv.mage)    ? (lv.mage.manaGuard   | 0) : 0;
    var tLv = (lv && lv.thief)   ? (lv.thief.flurry     | 0) : 0;
    var aLv = (lv && lv.archer)  ? (lv.archer.quickdraw | 0) : 0;

    var wLife = lv.warrior.lifeBlessing | 0;
    var mMana = lv.mage.manaBlessing    | 0;
    var tLife = lv.thief.vitalSustain   | 0;
    var aLife = lv.archer.vitalSustain  | 0;
    var gLv   = lv.global.goddessGrace  | 0;

    var pLv = _playerLevel();

    // 舊四職：百分比
    var oldOut = {
      warrior: { damageReduce:       wLv * PER_LV.warrior.damageReduce },
      mage:    { magicShieldPercent: mLv * PER_LV.mage.magicShieldPercent },
      thief:   { doubleHitChance:    tLv * PER_LV.thief.doubleHitChance },
      archer:  {
        preemptiveChance:        aLv * PER_LV.archer.preemptiveChance,
        preemptivePerAttackMax: (aLv >= 10 ? ARCHER_CAP_BONUS : 0)
      }
    };

    // 新被動基礎平坦（不含女神%）
    var wBaseHp = (wLife > 0) ? pLv * (LIFE_BLESS_HP_BASE + (wLife - 1) * LIFE_BLESS_HP_INC) : 0;
    var wBaseMp = (wLife > 0) ? pLv * LIFE_BLESS_MP_PER_LV : 0;

    var mBaseMp = (mMana > 0) ? pLv * (MANA_BLESS_MP_BASE + (mMana - 1) * MANA_BLESS_MP_INC) : 0;
    var mBaseHp = (mMana > 0) ? pLv * MANA_BLESS_HP_PER_LV : 0;

    var tBaseHp = (tLife > 0) ? pLv * (VITAL_HP_BASE + (tLife - 1) * VITAL_HP_INC) : 0;
    var tBaseMp = (tLife > 0) ? pLv * VITAL_MP_PER_LV : 0;

    var aBaseHp = (aLife > 0) ? pLv * (VITAL_HP_BASE + (aLife - 1) * VITAL_HP_INC) : 0;
    var aBaseMp = (aLife > 0) ? pLv * VITAL_MP_PER_LV : 0;

    var baseJob = getBaseJobSafe(w.player && w.player.job);
    var baseHp = 0;
    var baseMp = 0;

    if (baseJob === "warrior") {
      baseHp = wBaseHp;
      baseMp = wBaseMp;
    } else if (baseJob === "mage") {
      baseHp = mBaseHp;
      baseMp = mBaseMp;
    } else if (baseJob === "thief") {
      baseHp = tBaseHp;
      baseMp = tBaseMp;
    } else if (baseJob === "archer") {
      baseHp = aBaseHp;
      baseMp = aBaseMp;
    }

    // 女神祈禱：計算百分比（0~0.75）
    var goddessPercent = Math.min(GODDESS_MAX_TOTAL_PERCENT, gLv * GODDESS_PER_LV_PERCENT);

    // ★ 方案 A：
    //   - 所有職業 HP 都吃女神 %
    //   - 法師 MP 也吃女神 %
    var goddessHpFlat = Math.floor(baseHp * goddessPercent);
    var goddessMpFlat = 0;
    if (baseJob === "mage") {
      goddessMpFlat = Math.floor(baseMp * goddessPercent);
    }

    // 女神祈禱 10 等起攻防平坦（coreBonus）
    var goddessDefFlat = 0;
    var goddessAtkFlat = 0;
    if (gLv >= GODDESS_EXTRA_UNLOCK_LV) {
      goddessDefFlat = pLv * GODDESS_EXTRA_DEF_PER_PLAYER_LV;
      goddessAtkFlat = pLv * GODDESS_EXTRA_ATK_PER_PLAYER_LV;
    }

    return {
      warrior: oldOut.warrior,
      mage:    oldOut.mage,
      thief:   oldOut.thief,
      archer:  oldOut.archer,

      // 新系統平坦（coreBonus）
      newFlat: {
        hpBase: baseHp,
        mpBase: baseMp,
        goddessDefFlat: goddessDefFlat,
        goddessAtkFlat: goddessAtkFlat,
        goddessHpFlat: goddessHpFlat, // 給 PotentialBonus 使用
        goddessMpFlat: goddessMpFlat  // 給 PotentialBonus 使用
      }
    };
  }

  function ensurePlayerReady(cb) {
    var tries = 0;
    (function wait() {
      var ok = !!(w.player &&
                  w.player.coreBonus && w.player.coreBonus.bonusData &&
                  w.player.PotentialBonus && w.player.PotentialBonus.bonusData);
      if (ok) return cb();
      if (tries++ > 100) return;
      setTimeout(wait, 50);
    })();
  }

  // ===== 套用到 coreBonus / PotentialBonus =====
  function apply() {
    ensurePlayerReady(function () {
      var comp = getComputed();

      // coreBonus：基礎平坦能力＋舊百分比
      var core = w.player.coreBonus;
      if (core && core.bonusData) {
        var cBucket = core.bonusData.jobPassives || {};

        // 舊系統百分比
        cBucket.damageReduce           = Number(comp.warrior.damageReduce || 0);
        cBucket.magicShieldPercent     = Number(comp.mage.magicShieldPercent || 0);
        cBucket.doubleHitChance        = Number(comp.thief.doubleHitChance || 0);
        cBucket.preemptiveChance       = Number(comp.archer.preemptiveChance || 0);
        cBucket.preemptivePerAttackMax = Number(comp.archer.preemptivePerAttackMax || 0);

        // 新被動：基礎平坦 HP / MP（生命祝福 / 魔力祝福 / 生命續航）
        cBucket.hp  = Number(comp.newFlat.hpBase || 0);
        cBucket.mp  = Number(comp.newFlat.mpBase || 0);

        // 女神祈禱 10 等起攻防平坦
        cBucket.atk = Number(comp.newFlat.goddessAtkFlat || 0);
        cBucket.def = Number(comp.newFlat.goddessDefFlat || 0);

        if (cBucket.comboRate !== undefined) delete cBucket.comboRate;

        core.bonusData.jobPassives = cBucket;
      }

      // PotentialBonus：女神祈禱放大的 HP/MP（已換算成平坦）
      var pot = w.player.PotentialBonus;
      if (pot && pot.bonusData) {
        var pBucket = pot.bonusData.jobPassives || {};

        pBucket.hp = Number(comp.newFlat.goddessHpFlat || 0);
        pBucket.mp = Number(comp.newFlat.goddessMpFlat || 0);

        pot.bonusData.jobPassives = pBucket;
      }

      try { w.updateResourceUI && w.updateResourceUI(); } catch (_) {}
      try { w.refreshMageOnlyUI && w.refreshMageOnlyUI(); } catch (_) {}
    });
  }

  // ===== 自動偵測：等級/職業改變 =====
  var _lastWatch = { level: -1, base: "" };

  function watchPlayerTick() {
    try {
      var lvl = (w.player && (w.player.level | 0)) || -1;
      var base = getBaseJobSafe(w.player && w.player.job) || "";
      if (lvl !== _lastWatch.level || base !== _lastWatch.base) {
        _lastWatch.level = lvl;
        _lastWatch.base = base;
        apply();
        notify();
      }
    } catch (_) {}
  }

  function autoWire() {
    try { setInterval(watchPlayerTick, 1000); } catch (_) {}
    subs.push(function () { apply(); });
  }

  // ===== 對外 API =====
  var api = {
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    getLevels: snapshotLevels,
    tryLevelUp: tryLevelUp,
    setLevel: setLevel,
    canLevelUp: canLevelUp,
    getConfig: function () {
      return {
        COST_PER_LEVEL: COST_PER_LEVEL,
        MAX_LV_OLD: MAX_LV_OLD,
        MAX_LV_NEW: MAX_LV_NEW,
        MAX_LV_GODDESS: MAX_LV_GODDESS,
        SKILLS: JSON.parse(JSON.stringify(SKILLS)),
        DESIGN: {
          PER_LV: JSON.parse(JSON.stringify(PER_LV)),
          LIFE_BLESS: {
            HP_BASE: LIFE_BLESS_HP_BASE,
            HP_INC: LIFE_BLESS_HP_INC,
            MP_PER_LV: LIFE_BLESS_MP_PER_LV
          },
          MANA_BLESS: {
            MP_BASE: MANA_BLESS_MP_BASE,
            MP_INC: MANA_BLESS_MP_INC,
            HP_PER_LV: MANA_BLESS_HP_PER_LV
          },
          VITAL: {
            HP_BASE: VITAL_HP_BASE,
            HP_INC: VITAL_HP_INC,
            MP_PER_LV: VITAL_MP_PER_LV
          },
          GODDESS: {
            PER_LV_PERCENT: GODDESS_PER_LV_PERCENT,
            MAX_TOTAL_PERCENT: GODDESS_MAX_TOTAL_PERCENT,
            LV_CAP: GODDESS_LV_CAP,
            EXTRA_UNLOCK_LV: GODDESS_EXTRA_UNLOCK_LV,
            EXTRA_DEF_PER_PLAYER_LV: GODDESS_EXTRA_DEF_PER_PLAYER_LV,
            EXTRA_ATK_PER_PLAYER_LV: GODDESS_EXTRA_ATK_PER_PLAYER_LV
          }
        }
      };
    },
    subscribe: function (fn) { if (typeof fn === "function") subs.push(fn); },
    unsubscribe: function (fn) {
      subs = subs.filter(function (f) { return f !== fn; });
    },
    getComputed: getComputed,
    apply: apply,
    getSkillDefs: getSkillDefs,
    getAllSkillDefs: getAllSkillDefs,
    registerSkill: registerSkill
  };

  w.JobPassivesCore = api;

  // 舊 API 相容層
  w.JobPassiveStore = w.JobPassiveStore || {
    getState: api.getState,
    getLevels: api.getLevels,
    tryLevelUp: api.tryLevelUp,
    setLevel: api.setLevel,
    canLevelUp: api.canLevelUp,
    getConfig: api.getConfig,
    subscribe: api.subscribe,
    unsubscribe: api.unsubscribe
  };
  w.JobPassivesAggregate = w.JobPassivesAggregate || {
    apply: api.apply,
    getComputed: api.getComputed
  };

  // ===== 啟動 =====
  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", function () {
      apply();
      autoWire();
    });
  } else {
    apply();
    autoWire();
  }
})(window, document);