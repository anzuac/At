// =======================
// player.js (整合修正版 — 拆出顯示 UI)
// - 總傷害 totalDamage 與 skillDamage/spellDamage 並列
// - 穿防 ignoreDefPct（百分比，遞減疊加：1 - Π(1 - p)）
// - 匯出 deriveFromPrimariesTotals / getIgnoreDefBreakdown（供 UI 使用）
// - ✅ 減傷 now 包含 coreBonus.damageReduce
// - ✅ 魔力護盾 now 具集合器（core/skill/potential）+ INT 轉換 + 職業上限
// - ✅ 先手再動 preemptive：聚合/上限/預設（弓箭手專屬；非弓箭手隱藏且不觸發）
// - ✅ init 時自動套用 JobPassiveAggregate.apply()
// - ✅ 一般 / 菁英 / Boss 傷害：Base + Core + Skill + Potential 三段
// - ✅ 新增內在潛能聚合器 PotentialBonus，與 coreBonus / skillBonus 同層
// =======================

// 等級上限與升級給點數邏輯已拆到 exp.js
// 這裡不再宣告 MAX_LEVEL / PASSIVE_POINTS_PER_LEVEL

// ===== 全域上限與職業特性參數（集中可調）=====

// 全域上限（統一在此調整）
const GLOBAL_CAPS = {
  damageReduce: 0.70,      // 最終減傷上限
  ignoreDefPct: 0.9999,    // 穿防最大 99.99%
  preemptiveChance: 0.60,  // 先手再動機率上限（60%）
  preemptivePerAttackMax: 3 // 單次攻擊內最多觸發上限 cap（建議別太大）
};

// 全域預設值（來源為 0 時採用；僅弓箭手適用）
const GLOBAL_DEFAULTS = {
  preemptivePerAttackMax: 1 // ✅ 預設單次可再動 1 次（可透過技能/被動提高）
};

// 敏捷 → 爆擊率換算（0 = 關閉；例如 0.001 代表 1 AGI = +0.1% 爆率）
const CRIT_FROM_AGI = 0.0;

// 職業被動（保留架構，係數預設為 0 = 關閉）
const JOB_TRAIT_BASE = {
  warrior: {
    strDR: 0.0,
    maxDR: 0.30
  },
  thief: {
    lukDouble: 0.0,
    maxDouble: 0.40
  },
  archer: {
    maxAgiCrit: 1.50
  },
  mage: {
    shieldCap: 0.90,
    intToShield: 0.0
  }
};

// 能力點數重置券的道具名稱（需與道具系統一致）
const RESET_STAT_ITEM_KEY = "能力點數重置券";

function normalizeJob(job) { return (job ?? "").toLowerCase(); }

// 安全取得父系職業（utils_jobs.js 尚未載入時，退回去尾數字）
function getBaseJobSafe(job) {
  const j = String(job || "").toLowerCase();
  if (typeof window.getBaseJob === "function") return window.getBaseJob(j);
  return j.replace(/\d+$/, ""); // mage2/3/4/5 -> mage
}

function roundToTwoDecimals(value) {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  return parseFloat(value.toFixed(2));
}

// =====（唯一來源）主屬→衍生係數 =====
const STAT_COEFF = {
  atk:  { str: 1,   agi: 1,   int: 1,   luck: 1},
  def:  { str: 0.02,   agi: 0.02, int: 0.02,   luck: 0.02 },
  hp:   { str: 0,  agi: 0,  int: 0,   luck: 0  },
  mp:   { str: 0,   agi: 0,   int: 0,  luck: 0   },
};

// 依主屬總量與職業倍率，推導四維（細到每一主屬的貢獻值）
function deriveFromPrimariesTotals(primaryTotals, jobMult) {
  const out = {
    atk: { str:0, agi:0, int:0, luck:0 },
    def: { str:0, agi:0, int:0, luck:0 },
    hp:  { str:0, agi:0, int:0, luck:0 },
    mp:  { str:0, agi:0, int:0, luck:0 },
  };
  const prims = ["str","agi","int","luck"];
  const slots = ["atk","def","hp","mp"];
  for (const s of slots) {
    for (const p of prims) {
      const coef = (STAT_COEFF[s][p] || 0) * (jobMult[p] ?? 1);
      out[s][p] = (primaryTotals[p] || 0) * coef;
    }
  }
  return out;
}

// 玩家物件
const player = {
  nickname: "",
  job: "",
  level: 1,
  exp: 0,
  expToNext: 0,
  baseStats: { hp: 500, atk: 10, def: 10, mp: 100, str: 0, agi: 0, int: 0, luk: 0 },
  statPoints: 10,

  magicShieldEnabled: false,

  // —— 被動點數 ——
  passivePoints: 0,

  // 強化向 Base（預設值）
  // ※ Base = 「角色自己的基礎加成」，不含裝備(coreBonus)、技能(skillBonus)，方便之後職業/等級直接寫死一點底數
  baseSkillDamage: 0.,      // 基礎技能傷害%
  baseTotalDamage: 0.05,    // 基礎總傷害%
  baseIgnoreDefPct: 0.05,   // 基礎穿防%

  // ⭐ 新增：三種目標類型的 Base 傷害
  //    - baseNormalDamage：對一般怪的固定基礎加成
  //    - baseEliteDamage：對菁英怪的固定基礎加成
  //    - baseBossDamage：對 Boss 的固定基礎加成
  //    之後如果你有「職業天生對 Boss +20%」就可以直接寫在這裡
  baseNormalDamage: 0,
  baseEliteDamage:  0,
  baseBossDamage:   0,

  // —— 手動加成（改為「加成來源」，不再覆蓋）——
  preemptiveChance: 0,           // 再動機率（手動加成，小數 0.10 = +10%）
  preemptivePerAttackMax: 0,     // 單次再動上限（手動加成，整數 +1、+2）
  preemptiveEnabled: false,      // 是否顯示（僅供 UI；正式由職業限定）

  // 由各系統寫入的「核心/裝備/寵物…」加成池：coreBonus = 裝備/核心/寵物等
  coreBonus: (() => {
    const bonusData = {};
    const calc = (key) =>
      Object.values(bonusData)
        .filter(v => typeof v === 'object' && v[key] !== undefined)
        .reduce((sum, b) => sum + b[key], 0);
    return {
      bonusData,
      get hp() { return calc("hp"); },
      get atk() { return calc("atk"); },
      get def() { return calc("def"); },
      get mp() { return calc("mp"); },
      get str() { return calc("str"); },
      get agi() { return calc("agi"); },
      get int() { return calc("int"); },
      get luk() { return calc("luk"); },
      get skillDamage() { return calc("skillDamage"); },
      get attackSpeedPct() { return calc("attackSpeedPct"); },
      get doubleHitChance() { return calc("doubleHitChance"); },
      get comboRate() { return calc("comboRate"); },
      get expBonus() { return calc("expBonus"); },
      get dropBonus() { return calc("dropBonus"); },
      get goldBonus() { return calc("goldBonus"); },
      get critRate() { return calc("critRate"); },
      get critMultiplier() { return calc("critMultiplier"); },
      get dodgePercent() { return calc("dodgePercent"); },
      get recoverPercent() { return calc("recoverPercent"); },
      get damageReduce() { return calc("damageReduce"); },
      get spellDamage() { return calc("spellDamage"); },
      get totalDamage() { return calc("totalDamage"); },

      // ⭐ 新增：一般 / 菁英 / Boss 對象加傷（裝備、核心來源）
      get normalDamage() { return calc("normalDamage"); },
      get eliteDamage()  { return calc("eliteDamage"); },
      get bossDamage()   { return calc("bossDamage"); },

      get ignoreDefPct() { return calc("ignoreDefPct"); },
      get magicShieldPercent() { return calc("magicShieldPercent"); },

      // ✅ 先手再動（裝備/被動 寫這裡）
      get preemptiveChance() { return calc("preemptiveChance"); },             // 小數 ex: 0.10
      get preemptivePerAttackMax() { return calc("preemptivePerAttackMax"); }  // 整數 ex: +1, +2
    };
  })(),

  // 由技能群（光環/被動/主動暫態）寫入的加成池：skillBonus = 技能/光環來源
  skillBonus: (() => {
    const bonusData = {};
    const calc = (key) =>
      Object.values(bonusData)
        .filter(v => typeof v === 'object' && v[key] !== undefined)
        .reduce((sum, b) => sum + b[key], 0);
    return {
      bonusData,
      get atkFlat() { return calc("atkFlat"); },
      get defFlat() { return calc("defFlat"); },
      get atkPercent()     { return calc("atk"); },
      get defPercent()     { return calc("def"); },
      get hpPercent()      { return calc("hp"); },
      get mpPercent()      { return calc("mp"); },
      get shield()         { return calc("shield"); },
      get recoverPercent() { return calc("recoverPercent"); },
      get dodgePercent()   { return calc("dodgePercent"); },
      get critRate()       { return calc("critRate"); },
      get critMultiplier() { return calc("critMultiplier"); },
      get damageReduce()   { return calc("damageReduce"); },
      get spellDamage()    { return calc("spellDamage"); },
      get skillDamage()    { return calc("skillDamage"); },
      get attackSpeedPct() { return calc("attackSpeedPct"); },
      get doubleHitChance(){ return calc("doubleHitChance"); },
      get comboRate()      { return calc("comboRate"); },
      get expBonus()       { return calc("expBonus"); },
      get dropBonus()      { return calc("dropBonus"); },
      get goldBonus()      { return calc("goldBonus"); },
      get totalDamage()    { return calc("totalDamage"); },

      // ⭐ 新增：一般 / 菁英 / Boss 對象加傷（技能來源）
      get normalDamage()   { return calc("normalDamage"); },
      get eliteDamage()    { return calc("eliteDamage"); },
      get bossDamage()     { return calc("bossDamage"); },

      get ignoreDefPct()   { return calc("ignoreDefPct"); },
      get magicShieldPercent() { return calc("magicShieldPercent"); },

      // ✅ 先手再動（技能/光環 寫這裡）
      get preemptiveChance() { return calc("preemptiveChance"); },
      get preemptivePerAttackMax() { return calc("preemptivePerAttackMax"); }
    };
  })(),

  // ⭐⭐ 內在潛能專用聚合器：PotentialBonus
  PotentialBonus: (() => {
    const bonusData = {};
    const calc = (key) =>
      Object.values(bonusData)
        .filter(v => typeof v === "object" && v[key] !== undefined)
        .reduce((sum, b) => sum + b[key], 0);

    return {
      bonusData,

      // 四維 & 主屬（平坦）
      get hp()  { return calc("hp"); },
      get mp()  { return calc("mp"); },
      get atk() { return calc("atk"); },
      get def() { return calc("def"); },
      get str() { return calc("str"); },
      get agi() { return calc("agi"); },
      get int() { return calc("int"); },
      get luk() { return calc("luk"); },

      // 一般傷害系
      get totalDamage()   { return calc("totalDamage"); },
      get skillDamage()   { return calc("skillDamage"); },
      get spellDamage()   { return calc("spellDamage"); },

      // 對象加傷
      get normalDamage() { return calc("normalDamage"); },
      get eliteDamage()  { return calc("eliteDamage"); },
      get bossDamage()   { return calc("bossDamage"); },

      // 生存 / 功能性
      get damageReduce()       { return calc("damageReduce"); },
      get recoverPercent()     { return calc("recoverPercent"); },
      get dodgePercent()       { return calc("dodgePercent"); },
      get magicShieldPercent() { return calc("magicShieldPercent"); },

      // 速攻 / 連擊 / 暴擊
      get attackSpeedPct()   { return calc("attackSpeedPct"); },
      get doubleHitChance()  { return calc("doubleHitChance"); },
      get comboRate()        { return calc("comboRate"); },
      get critRate()         { return calc("critRate"); },
      get critMultiplier()   { return calc("critMultiplier"); },

      // 穿防
      get ignoreDefPct()     { return calc("ignoreDefPct"); },

      // 先手再動
      get preemptiveChance()       { return calc("preemptiveChance"); },
      get preemptivePerAttackMax() { return calc("preemptivePerAttackMax"); },

// 其他 Bonus（經驗 / 掉落 / 金幣）
get expBonus() { return calc("expBonus") + calc("expRate"); },
  get dropBonus() { return calc("dropBonus") + calc("dropRate"); },
  get goldBonus() { return calc("goldBonus") + calc("mesoRate"); },
    };
  })(),

  // —— 進階數值（基礎值） ——
  recoverPercent: 0.05,
  dodgePercent: 0,
  critRate: 0.1,
  critMultiplier: 0.1,
  comboRate: 0,
  shield: 0,
  maxShield: 0,
  damageReduce: 0,
  lifestealPercent: 0,
  doubleHitChance: 0,
  abnormalInflict: { poison: 0, burn: 0, paralyze: 0, weaken: 0 },
  statusEffects: {},

  // —— 即時資源 ——
  currentHP: 0,
  currentMP: 0,

  // —— 貨幣 ——
  gold: 3000,
  gem: 1000,
  stone: 3000,

  // —— 衍生計算暫存 ——
  spellDamageBonus: 0,
  attackSpeedPctBase: 1,

  // 修正：總加成來自核心(clover) + 技能(aura) + 內在潛能(potential) 的總和
  get expRateBonus() {
    return (
      (this.coreBonus.expBonus || 0) +
      (this.skillBonus.expBonus || 0) +
      (this.PotentialBonus.expBonus || 0)
    );
  },
  get dropRateBonus() {
    return (
      (this.coreBonus.dropBonus || 0) +
      (this.skillBonus.dropBonus || 0) +
      (this.PotentialBonus.dropBonus || 0)
    );
  },
  get goldRateBonus() {
    return (
      (this.coreBonus.goldBonus || 0) +
      (this.skillBonus.goldBonus || 0) +
      (this.PotentialBonus.goldBonus || 0)
    );
  },

  get totalStats() {
    const pot = this.PotentialBonus || {};

    // 1) 累計主屬（含核心 + 內在潛能）與元素裝備
    const eqStr = (this.coreBonus.str || 0) + (pot.str || 0);
    const eqAgi = (this.coreBonus.agi || 0) + (pot.agi || 0);
    const eqInt = (this.coreBonus.int || 0) + (pot.int || 0);
    const eqLuk = (this.coreBonus.luk || 0) + (pot.luk || 0);

    const totalStr = this.baseStats.str + eqStr;
    const totalAgi = this.baseStats.agi + eqAgi;
    const totalInt = this.baseStats.int + eqInt;
    const totalLuk = this.baseStats.luk + eqLuk;

    // 2) 職業倍率
    const jobKey  = (this.job ?? "").toLowerCase();
    const baseJob = getBaseJobSafe(jobKey);
    const jm = (typeof jobs !== "undefined" && jobs[jobKey]?.statMultipliers)
      ? jobs[jobKey].statMultipliers
      : { str: 1, agi: 1, int: 1, luck: 1 };

    // 3) 共用推導
    const derived = deriveFromPrimariesTotals(
      { str: totalStr, agi: totalAgi, int: totalInt, luck: totalLuk },
      { str:(jm.str??1), agi:(jm.agi??1), int:(jm.int??1), luck:(jm.luck??1) }
    );

    // 爆擊率
    const agiCritRateFromStat = totalAgi * (CRIT_FROM_AGI * (jm.agi ?? 1));
    const baseRateNoAgi =
      (this.critRate || 0) +
      (this.skillBonus.critRate || 0) +
      (this.coreBonus.critRate || 0) +
      (pot.critRate || 0);

    const finalCritRateRaw = baseRateNoAgi + agiCritRateFromStat;
    let finalCritRate = Math.min(1, finalCritRateRaw);

    // INT 轉法傷
    this.spellDamageBonus = Math.floor(totalInt / 10) * 0.0;

    // 四維 Base（尚未套技能固定值/百分比）
    const atkBase =
      this.baseStats.atk + (this.coreBonus.atk || 0) + (pot.atk || 0) +
      derived.atk.str + derived.atk.agi + derived.atk.int + derived.atk.luck;

    const defBase =
      this.baseStats.def + (this.coreBonus.def || 0) + (pot.def || 0) +
      derived.def.str + derived.def.agi + derived.def.int + derived.def.luck;

    const hpBase =
      this.baseStats.hp + (this.coreBonus.hp || 0) + (pot.hp || 0) +
      derived.hp.str + derived.hp.agi + derived.hp.int + derived.hp.luck;

    const mpBase =
      this.baseStats.mp + (this.coreBonus.mp || 0) + (pot.mp || 0) +
      derived.mp.int;

    // 技能傷害（Base + Core + Skill + Potential）
    const totalSkillDamage =
      // (this.baseSkillDamage || 0) +
      // (this.coreBonus.skillDamage || 0) +
      (this.skillBonus.skillDamage || 0) +
      (pot.skillDamage || 0);

    // 盜賊/戰士被動（預設關）
    const thiefDoubleHit = (baseJob === "thief")
      ? Math.min(JOB_TRAIT_BASE.thief.maxDouble, totalLuk * JOB_TRAIT_BASE.thief.lukDouble)
      : 0;

    let warriorDR = 0;
    if (baseJob === "warrior") {
      warriorDR = Math.min(JOB_TRAIT_BASE.warrior.maxDR, totalStr * JOB_TRAIT_BASE.warrior.strDR);
    }

    // 最終減傷（含 coreBonus / skillBonus / Potential）
    let finalDamageReduce =
      (Number(this.damageReduce) || 0) +
      (Number(this.coreBonus.damageReduce) || 0) +
      (Number(this.skillBonus.damageReduce) || 0) +
      (Number(pot.damageReduce) || 0) +
      warriorDR;
    finalDamageReduce = Math.min(finalDamageReduce, GLOBAL_CAPS.damageReduce);

    // 穿防（遞減疊加）
    const gatherPctFrom = (bonusData) =>
      Object.values(bonusData || {})
        .map(v => Number(v?.ignoreDefPct) || 0)
        .filter(x => x > 0);

    const pctSources = [
      Number(this.baseIgnoreDefPct) || 0,
      ...gatherPctFrom(this.coreBonus.bonusData),
      ...gatherPctFrom(this.skillBonus.bonusData),
      ...gatherPctFrom(this.PotentialBonus?.bonusData || {}),
    ].filter(x => x > 0);

    let combinedIgnoreDefPct = 0;
    if (pctSources.length > 0) {
      const product = pctSources.reduce((acc, p) => acc * (1 - Math.max(0, Math.min(p, 1))), 1);
      combinedIgnoreDefPct = 1 - product;
      combinedIgnoreDefPct = Math.min(Math.max(combinedIgnoreDefPct, 0), GLOBAL_CAPS.ignoreDefPct);
    }

    // 盜賊連擊（相容舊 UI：讓 comboRate 顯示 doubleHit）
    const comboRateEff =
      (Number(this.comboRate) || 0) +
      (Number(this.coreBonus.comboRate) || 0) +
      (Number(this.skillBonus.comboRate) || 0) +
      (Number(pot.comboRate) || 0) +
      thiefDoubleHit;

    const doubleHitChanceEff = Math.min(1,
      (Number(this.doubleHitChance) || 0) +
      (Number(this.coreBonus.doubleHitChance) || 0) +
      (Number(this.skillBonus.doubleHitChance) || 0) +
      (Number(pot.doubleHitChance) || 0) +
      thiefDoubleHit
    );

    // === 先手再動 Preemptive（聚合 + 上限 + 預設值 + 職業限定）===
    const isArcher = (baseJob === "archer");

    // ✅ 改為「所有來源加總」：core + skill + potential + manual
    let rawPreemptChance =
      (Number(this.coreBonus.preemptiveChance) || 0) +
      (Number(this.skillBonus.preemptiveChance) || 0) +
      (Number(pot.preemptiveChance) || 0) +
      (Number(this.preemptiveChance) || 0);

    let rawPreemptMax =
      (Number(this.coreBonus.preemptivePerAttackMax) || 0) +
      (Number(this.skillBonus.preemptivePerAttackMax) || 0) +
      (Number(pot.preemptivePerAttackMax) || 0) +
      (Number(this.preemptivePerAttackMax) || 0);

    // 非弓箭手：關閉
    let preemptiveEnabled = !!isArcher;

    // 機率（先套 cap）
    let preemptiveChance = preemptiveEnabled
      ? Math.max(0, Math.min(rawPreemptChance, GLOBAL_CAPS.preemptiveChance))
      : 0;

    // 上限：預設 + 全來源加成（不覆蓋），再套 cap
    const basePreemptMax = Number(GLOBAL_DEFAULTS.preemptivePerAttackMax) || 0;
    let preemptivePerAttackMax = preemptiveEnabled
      ? Math.max(0, Math.min(basePreemptMax + rawPreemptMax, GLOBAL_CAPS.preemptivePerAttackMax))
      : 0;

    // ===== 技能固定值 / 百分比（⚠️ 百分比需 /100）=====
    const atkFlatFromSkill = Number(this.skillBonus.atkFlat || 0);
    const defFlatFromSkill = Number(this.skillBonus.defFlat || 0);

    const atkPctFromSkill = (Number(this.skillBonus.atkPercent) || 0) / 100;
    const defPctFromSkill = (Number(this.skillBonus.defPercent) || 0) / 100;
    const hpPctFromSkill  = (Number(this.skillBonus.hpPercent)  || 0) / 100;
    const mpPctFromSkill  = (Number(this.skillBonus.mpPercent)  || 0) / 100;

    // 最終四維（順序：Base → +固定值 → *百分比）
    const finalAtk = Math.floor((atkBase + atkFlatFromSkill) * (1 + atkPctFromSkill));
    const finalDef = Math.floor((defBase + defFlatFromSkill) * (1 + defPctFromSkill));
    const finalHP  = Math.floor(hpBase  * (1 + hpPctFromSkill));
    const finalMP  = Math.floor(mpBase  * (1 + mpPctFromSkill));

    return {
      atk: finalAtk,
      def: finalDef,
      hp:  finalHP,
      mp:  finalMP,
      shield: this.skillBonus.shield,

      recoverPercent:
        (Number(this.recoverPercentBaseDecimal ?? this.recoverPercent) || 0) +
        (Number(this.skillBonus.recoverPercent) || 0) +
        (Number(this.coreBonus.recoverPercent) || 0) +
        (Number(pot.recoverPercent) || 0),

      dodgePercent:
        (Number(this.dodgePercent) || 0) +
        (Number(this.skillBonus.dodgePercent) || 0) +
        (Number(this.coreBonus.dodgePercent) || 0) +
        (Number(pot.dodgePercent) || 0),

      critRate:       Math.max(0, Math.min(1, finalCritRate)),
      // 不再添加爆率溢出轉爆傷
      critMultiplier:
        (Number(this.critMultiplier) || 0) +
        (Number(this.skillBonus.critMultiplier) || 0) +
        (Number(this.coreBonus.critMultiplier) || 0) +
        (Number(pot.critMultiplier) || 0),

      attackSpeedPct: (
        (Number(this.attackSpeedPctBase) || 0) +
        (Number(this.coreBonus.attackSpeedPct) || 0) +
        (Number(this.skillBonus.attackSpeedPct) || 0) +
        (Number(pot.attackSpeedPct) || 0)
      ),

      damageReduce: finalDamageReduce,

      spellDamage:
        (Number(this.spellDamageBonus)||0) +
        (Number(this.skillBonus.spellDamage) || 0) +
        (Number(pot.spellDamage) || 0),

      skillDamage: totalSkillDamage,

      // 總傷害（Base + Core + Skill + Potential）
      totalDamage: (
        (Number(this.baseTotalDamage) || 0) +
        (Number(this.coreBonus.totalDamage) || 0) +
        (Number(this.skillBonus.totalDamage) || 0) +
        (Number(pot.totalDamage) || 0)
      ),

      // ⭐ 一般 / 菁英 / Boss 傷害（Base + Core + Skill + Potential）
      normalDamage:
        (Number(this.baseNormalDamage) || 0) +
        (Number(this.coreBonus.normalDamage) || 0) +
        (Number(this.skillBonus.normalDamage) || 0) +
        (Number(pot.normalDamage) || 0),

      eliteDamage:
        (Number(this.baseEliteDamage) || 0) +
        (Number(this.coreBonus.eliteDamage) || 0) +
        (Number(this.skillBonus.eliteDamage) || 0) +
        (Number(pot.eliteDamage) || 0),

      bossDamage:
        (Number(this.baseBossDamage) || 0) +
        (Number(this.coreBonus.bossDamage) || 0) +
        (Number(this.skillBonus.bossDamage) || 0) +
        (Number(pot.bossDamage) || 0),

      // 穿防（遞減合成後百分比）
      ignoreDefPct:  combinedIgnoreDefPct,

      // 連擊顯示/戰鬥（相容：主頁讀 comboRate 也會看到雙擊）
      comboRate: doubleHitChanceEff,
      doubleHitChance: doubleHitChanceEff,

      // ✅ 先手再動（主頁/戰鬥可讀）
      preemptiveEnabled: preemptiveEnabled,
      preemptiveChance: preemptiveChance,
      preemptivePerAttackMax: preemptivePerAttackMax
    };
  }
};

// ===== 魔盾（法師專屬）=====
// INT 轉換 + coreBonus.magicShieldPercent + skillBonus.magicShieldPercent + PotentialBonus.magicShieldPercent，最後套 cap
function getMagicShieldPercent() {
  const isMage = (getBaseJobSafe(player?.job) === "mage");
  if (!isMage || !player.magicShieldEnabled) return 0;

  const maxPct = Number(JOB_TRAIT_BASE.mage.shieldCap) || 0.70;
  const coef   = Number(JOB_TRAIT_BASE.mage.intToShield) || 0;

  const totalInt = (Number(player.baseStats.int) || 0) +
                   (Number(player.coreBonus.int) || 0) +
                   (Number(player.PotentialBonus?.int) || 0);

  const fromInt   = (coef > 0) ? Math.min(maxPct, Math.max(0, totalInt * coef)) : 0;
  const fromCore  = Math.max(0, Number(player.coreBonus.magicShieldPercent) || 0);
  const fromSkill = Math.max(0, Number(player.skillBonus.magicShieldPercent) || 0);
  const fromPot   = Math.max(0, Number(player.PotentialBonus?.magicShieldPercent) || 0);

  const total = Math.min(maxPct, fromInt + fromCore + fromSkill + fromPot);
  return total;
}
window.getMagicShieldPercent = getMagicShieldPercent;

// （升級 & 經驗邏輯已搬到 exp.js）
// 這裡原本的 getExpToNext / levelUp / gainExp 已刪除

// ===== 屬性分配 =====
// 支援一次加多點：amount 可為數字或 "all"
function allocateStat(attribute, amount = 1) {
  if (player.statPoints <= 0) { alert("沒有可用的屬性點數！"); return; }

  let toSpend = 1;
  if (amount === "all") toSpend = player.statPoints;
  else if (typeof amount === "number") toSpend = Math.max(1, Math.floor(amount));

  const jobKey = (player.job ?? "").toLowerCase();
  const currentJob = (typeof jobs !== "undefined") ? jobs[jobKey] : null;
  if (!currentJob) { console.error("找不到對應的職業！"); return; }

  const m = currentJob.statMultipliers || {};
  const multiplier =
    attribute === "luk" ? (m.luck ?? 0) :
    attribute === "str" ? (m.str ?? 0) :
    attribute === "agi" ? (m.agi ?? 0) :
    attribute === "int" ? (m.int ?? 0) : 0;

  if (!["str", "agi", "int", "luk"].includes(attribute)) return;

  if (multiplier === 0) {
    const ok = confirm(`這是 ${currentJob.name} 的非主要屬性，分配點數將不會有任何效果。你確定要分配 ${toSpend} 點嗎？`);
    if (!ok) return;
  }

  const spend = Math.min(player.statPoints, toSpend);
  if (spend <= 0) return;

  player.baseStats[attribute] += spend;
  player.statPoints -= spend;

  if (typeof updateResourceUI === "function") updateResourceUI?.();
  if (typeof logPrepend === "function") logPrepend?.(`✨ 成功分配 ${spend} 點到 ${attribute.toUpperCase()}！`);
  saveGame?.();
}

// ===== 能力點數重置（使用能力點數重置券）=====
function resetStatsWithTicket(options = {}) {
  const { skipConfirm = false } = options;

  const usedPoints =
    (Number(player.baseStats.str) || 0) +
    (Number(player.baseStats.agi) || 0) +
    (Number(player.baseStats.int) || 0) +
    (Number(player.baseStats.luk) || 0);

  if (usedPoints <= 0) {
    alert("目前沒有已分配的能力點數可以重置。");
    return;
  }

  // 檢查道具系統是否存在
  const hasItemFuncs =
    typeof getItemQuantity === "function" &&
    typeof removeItem === "function";

  if (!hasItemFuncs) {
    // 沒有道具系統就當一般重置（方便本機測試）
    if (!skipConfirm) {
      const ok = confirm(
        `（警告：未找到道具系統）\n確定要重置能力點數嗎？\n將返還 ${usedPoints} 點能力點數。`
      );
      if (!ok) return;
    }
  } else {
    const have = Number(getItemQuantity(RESET_STAT_ITEM_KEY)) || 0;
    if (have <= 0) {
      alert(`沒有「${RESET_STAT_ITEM_KEY}」，無法重置能力點數！`);
      return;
    }

    if (!skipConfirm) {
      const ok = confirm(
        `是否使用 1 張「${RESET_STAT_ITEM_KEY}」來重置能力點數？\n` +
        `將返還 ${usedPoints} 點能力點數。`
      );
      if (!ok) return;
    }

    // 消耗 1 張重置券
    removeItem(RESET_STAT_ITEM_KEY, 1);
  }

  // 把已投入的點數全退回
  player.statPoints += usedPoints;

  // 把主屬性清回 0（初始值）
  player.baseStats.str = 0;
  player.baseStats.agi = 0;
  player.baseStats.int = 0;
  player.baseStats.luk = 0;

  // 更新 UI / 存檔
  if (typeof updateResourceUI === "function") updateResourceUI?.();
  if (typeof logPrepend === "function") {
    logPrepend?.(
      `🔁 已使用「${RESET_STAT_ITEM_KEY}」重置能力點數，返還 ${usedPoints} 點！`
    );
  }
  saveGame?.();
}

// ===== 自動回復（每 30 秒）=====
function startAutoRecover() {
  setInterval(() => {
    const maxHP = player.totalStats.hp;
    const maxMP = player.totalStats.mp;
    const hpRecover = Math.ceil(maxHP * 0.00);
    const mpRecover = Math.ceil(maxMP * 0.00);
    player.currentHP = Math.min(player.currentHP + hpRecover, maxHP);
    player.currentMP = Math.min(player.currentMP + mpRecover, maxMP);
    if (typeof updateResourceUI === "function") updateResourceUI?.();
  }, 30000);
}

// ===== 導出共用推導 / 穿防拆解（給 UI 用）=====
window.player = player;
window.allocateStat = allocateStat;
window.resetStatsWithTicket = resetStatsWithTicket;

window.deriveFromPrimariesTotals = deriveFromPrimariesTotals;
window.getIgnoreDefBreakdown = function getIgnoreDefBreakdown() {
  const src = [];
  const pushIf = (label, p) => { p = Number(p)||0; if (p>0) src.push({label, p}); };
  // 基礎
  pushIf("基礎", player.baseIgnoreDefPct);
  // coreBonus
  Object.entries(player.coreBonus.bonusData || {}).forEach(([k, v]) => {
    if (v && typeof v.ignoreDefPct === "number" && v.ignoreDefPct > 0) {
      pushIf("核心："+k, v.ignoreDefPct);
    }
  });
  // skillBonus
  Object.entries(player.skillBonus.bonusData || {}).forEach(([k, v]) => {
    if (v && typeof v.ignoreDefPct === "number" && v.ignoreDefPct > 0) {
      pushIf("技能："+k, v.ignoreDefPct);
    }
  });
  // PotentialBonus
  Object.entries(player.PotentialBonus?.bonusData || {}).forEach(([k, v]) => {
    if (v && typeof v.ignoreDefPct === "number" && v.ignoreDefPct > 0) {
      pushIf("潛能："+k, v.ignoreDefPct);
    }
  });
  const product = src.reduce((acc, s) => acc * (1 - Math.max(0, Math.min(s.p, 1))), 1);
  const combined = Math.min(Math.max(1 - product, 0), GLOBAL_CAPS.ignoreDefPct);
  return { sources: src, product, combined };
};


function initPlayer() {
  if (typeof player === "undefined") return setTimeout(initPlayer, 50);
  if (typeof applyElementEquipmentBonusToPlayer === 'function') applyElementEquipmentBonusToPlayer();

  // ✅ 開局即聚合一次職業被動（寫入 coreBonus）
  try { 
    if (window.JobPassiveAggregate && typeof JobPassiveAggregate.apply === "function") {
      JobPassiveAggregate.apply();
      // ★ 告訴其他系統：職業被動已經套用完成
      if (window.player) window.player._jobPassiveApplied = true;
    }
  } catch(_) {}

  player.expToNext = getExpToNext(player.level);
  player.currentHP = player.totalStats.hp;
  player.currentMP = player.totalStats.mp;
  startAutoRecover();
  if (typeof createStatModal === "function") createStatModal();
  if (typeof updateResourceUI === "function") updateResourceUI?.();
  if (typeof refreshMageOnlyUI === "function") refreshMageOnlyUI?.();
  if (typeof ensureSkillEvolution === "function") ensureSkillEvolution?.();
  window.skillBonus = player.skillBonus;
}

// 啟動
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlayer);
} else {
  initPlayer();
}

// --- 綁定資源閃爍效果（player 初始化完成後） ---
function onPlayerReady() {
  if (window.player && window.ResourceBinder) {
    ResourceBinder.bindPlayerResources(window.player);
    console.log("[ResourceBinder] 已綁定資源動畫");
  }
}

// 等 initPlayer 完成後執行（不改 initPlayer 原始內容）
const _oldInitPlayer = typeof initPlayer === "function" ? initPlayer : null;
window.initPlayer = function(...args) {
  const result = _oldInitPlayer?.apply(this, args);
  try { onPlayerReady(); } catch(e){ console.warn(e); }
  return result;
};

// =======================
// main.js (整合修正版 - 無職業回退/轉換 / 暱稱限制版)
// 新增：在 UI 顯示 totalDamage（總傷害）
// =======================

// === 暱稱限制與工具 ===
const NICKNAME_MIN_LEN = 2;     // 最短 2
const NICKNAME_MAX_LEN = 12;    // 最長 12
function sanitizeNickname(input) {
  const s = String(input || "").trim();
  const noTags = s.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001F\u007F]/g, "");
  // 允許：字母/數字/空白/底線/連字號/一般 CJK
  const safe = noTags.replace(/[^\p{L}\p{N}\s_\-]/gu, "");
  return safe.replace(/\s+/g, " ").trim();
}

// --- 小工具：安全取得 baseJob（utils_jobs.js 未載入就退回原 job） ---
function getBaseJobSafe(job) {
  const j = (job || "").toLowerCase();
  return (typeof window.getBaseJob === "function") ? window.getBaseJob(j) : j;
}

function isMage() {
  return getBaseJobSafe(player.job) === "mage";
}

function toggleMagicShield() {
  if (!isMage()) { alert("只有法師可以使用魔力護盾"); return; }
  player.magicShieldEnabled = !player.magicShieldEnabled;
  player.manaShieldEnabled  = player.magicShieldEnabled; // 兼容舊欄位
  const btn = document.getElementById("manaShieldBtn");
  if (btn) btn.textContent = "🛡️ 魔力護盾：" + (player.magicShieldEnabled ? "開" : "關");
  updateResourceUI();
}

function refreshMageOnlyUI() {
  const row = document.getElementById("manaShieldRow");
  const btn = document.getElementById("manaShieldBtn");
  const mage = isMage();

  if (row) row.style.display = mage ? "" : "none";
  if (btn) {
    btn.style.display = mage ? "" : "none";
    btn.textContent = "🛡️ 魔力護盾：" + (player.magicShieldEnabled ? "開" : "關");
  }

  if (!mage) {
    player.magicShieldEnabled = false;
    player.manaShieldEnabled  = false; // 舊欄位同步
  }
}

// 統一顯示：保留兩位小數（含 .00）
function fmt2(x) {
  const n = Number(x);
  return isNaN(n) ? "0.00" : n.toFixed(2);
}

function updateResourceUI() {
  const maxHp = player.totalStats.hp;
  const maxMp = player.totalStats.mp;
  
  // ⭐ 把內在潛能也加進來
  const pot = player.PotentialBonus || {};
  
  const eqStr = (player.coreBonus.str || 0) + (pot.str || 0);
  const eqAgi = (player.coreBonus.agi || 0) + (pot.agi || 0);
  const eqInt = (player.coreBonus.int || 0) + (pot.int || 0);
  const eqLuk = (player.coreBonus.luk || 0) + (pot.luk || 0);
  
  const totalStr = player.baseStats.str + eqStr;
  const totalAgi = player.baseStats.agi + eqAgi;
  const totalInt = player.baseStats.int + eqInt;
  const totalLuk = player.baseStats.luk + eqLuk;
  
  player.currentHP = Math.min(player.currentHP, maxHp);
  player.currentMP = Math.min(player.currentMP, maxMp);
  
  // 暱稱 / 職業
  const nickEl = document.getElementById("player-nickname");
  if (nickEl) nickEl.textContent = player.nickname;
  
  const jobEl = document.getElementById("player-job");
  if (jobEl) {
    const jk = (player.job ?? "").toLowerCase();
    const displayName =
      (typeof jobs !== "undefined" && jobs[jk]?.name) ? jobs[jk].name : player.job;
    jobEl.textContent = displayName;
  }
  
  const G = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  
  // 資源
  G("gold", player.gold);
  G("gem", player.gem);
  G("stone", player.stone);
  G("stat-points-display", player.statPoints);
  
  // 四圍
  const strEl = document.getElementById("str-display");
  const agiEl = document.getElementById("agi-display");
  const intEl = document.getElementById("int-display");
  const lukEl = document.getElementById("luk-display");
  
  if (strEl) strEl.textContent = `${fmt2(totalStr)} (${fmt2(player.baseStats.str)} + ${fmt2(eqStr)})`;
  if (agiEl) agiEl.textContent = `${fmt2(totalAgi)} (${fmt2(player.baseStats.agi)} + ${fmt2(eqAgi)})`;
  if (intEl) intEl.textContent = `${fmt2(totalInt)} (${fmt2(player.baseStats.int)} + ${fmt2(eqInt)})`;
  if (lukEl) lukEl.textContent = `${fmt2(totalLuk)} (${fmt2(player.baseStats.luk)} + ${fmt2(eqLuk)})`;
  
  

// 狀態圖示（玩家身上）
let statusText = "";
if (player.statusEffects) {
  for (const key in player.statusEffects) {
    if (player.statusEffects[key] > 0) {

      // 狀態 → icon 對照
      const emojiMap = {
        poison:  "☠️",
        burn:    "🔥",
        paralyze:"⚡",
        weaken:  "🌀",
        bleed:   "🩸",
        blind:   "🌫️",
        freeze:  "❄️",
        curse:   "🧿",

        // 🔹 新增控場狀態
        stun:    "💫",
        slow:    "🐌",
        fear:    "😱",
        silence: "🔇"
      };

      const emoji = emojiMap[key] || "✨";
      statusText += `${emoji}${player.statusEffects[key]} `;
    }
  }
}

  // HP/MP + 顏色
  const hpEl = document.getElementById("hp");
  const mpEl = document.getElementById("mp");
  const lowHp = player.currentHP / maxHp <= 0.25;
  const lowMp = player.currentMP / maxMp <= 0.25;

  if (hpEl) {
    hpEl.textContent = `${player.currentHP} / ${maxHp} ${statusText}`;
    hpEl.style.color = lowHp ? "#f44336" : "#fff";
    if (lowHp) hpEl.classList.add("danger-blink"); else hpEl.classList.remove("danger-blink");
  }
  if (mpEl) {
    mpEl.textContent = `${player.currentMP} / ${maxMp}`;
    mpEl.style.color = lowMp ? "#03a9f4" : "#fff";
  }

  // Atk/Def（受虛弱/BUFF 顏色）
  let atk = player.totalStats.atk;
  let def = player.totalStats.def;
  let atkColor = "", defColor = "";
  if (player.statusEffects?.weaken > 0) {
    atk = Math.floor(atk * 0.6);
    def = Math.floor(def * 0.6);
    atkColor = "#f44336";
    defColor = "#f44336";
  }
  if (player.statusEffects?.atkBoost) atkColor = "#4caf50";
  if (player.statusEffects?.defBoost) defColor = "#4caf50";

  const atkEl = document.getElementById("atk");
  const defEl = document.getElementById("def");
  if (atkEl) { atkEl.textContent = atk; atkEl.style.color = atkColor; }
  if (defEl) { defEl.textContent = def; defEl.style.color = defColor; }

  // 額外顯示
  const intValueEl = document.getElementById("int-value");
  if (intValueEl) intValueEl.textContent = totalInt;

  const sdEl = document.getElementById("skillDamage");
  if (sdEl) sdEl.textContent = ((player.totalStats.skillDamage || 0) * 100).toFixed(1) + "%";

  // 掉落加成
  G("expRate", ((player.expRateBonus || 0) * 100).toFixed(1) + "%");
  G("dropRate", ((player.dropRateBonus || 0) * 100).toFixed(1) + "%");
  G("goldRate", ((player.goldRateBonus || 0) * 100).toFixed(1) + "%");

  // 連擊率（僅盜賊顯示）
  const comboRow = document.getElementById("comboRateRow");
  const comboVal = document.getElementById("comboRate");
  if (comboRow && comboVal) {
    const baseJob = getBaseJobSafe(player.job);
    if (baseJob === "thief") {
      comboRow.style.display = "";
      comboVal.textContent = `${(player.totalStats.comboRate * 100).toFixed(1)}%`;
    } else {
      comboRow.style.display = "none";
    }
  }
// 弓箭手專用：先手再動（分兩行）
const preRow1 = document.getElementById("preemptiveChanceRow");
const preRow2 = document.getElementById("preemptiveMaxRow");
const preChanceEl = document.getElementById("preemptiveChance");
const preMaxEl = document.getElementById("preemptiveMax");

if (preRow1 && preRow2 && preChanceEl && preMaxEl) {
  const baseJob = getBaseJobSafe(player.job);
  const ts = player.totalStats || {};
  const enabled = baseJob === "archer" && !!ts.preemptiveEnabled;
  
  if (enabled) {
    preRow1.style.display = "";
    preRow2.style.display = "";
    preChanceEl.textContent = ((ts.preemptiveChance || 0) * 100).toFixed(1) + "%";
    preMaxEl.textContent = Math.max(1, ts.preemptivePerAttackMax || 1);
  } else {
    preRow1.style.display = "none";
    preRow2.style.display = "none";
  }
}
  // 魔力護盾 UI
  const msRow = document.getElementById("manaShieldRow");
  const msBtn = document.getElementById("manaShieldBtn");
  const msPctEl = document.getElementById("manaShieldPct");

  const mage = isMage();
  if (msRow) msRow.style.display = mage ? "" : "none";
  if (msBtn) msBtn.style.display = mage ? "" : "none";

  if (typeof player.manaShieldEnabled === "boolean" && player.manaShieldEnabled !== player.magicShieldEnabled) {
    player.magicShieldEnabled = player.manaShieldEnabled;
  }

  const msPct = (typeof getMagicShieldPercent === "function") ? getMagicShieldPercent() : 0;
  if (msPctEl) msPctEl.textContent = (msPct * 100).toFixed(1) + "%";
  if (msBtn)   msBtn.textContent = "🛡️ 魔力護盾：" + (player.magicShieldEnabled ? "開" : "關");

  // 其他欄位
  G("recover", `${(player.totalStats.recoverPercent * 100).toFixed(1)}%`);
  G("attackSpeed", (player.totalStats.attackSpeedPct * 100).toFixed(2) + "%");
  G("dodge",   `${(player.totalStats.dodgePercent   * 100).toFixed(1)}%`);
  G("player-level", player.level);
  G("player-exp", `${player.exp} / ${player.expToNext}`);
  const expBar = document.getElementById("exp-bar");
  if (expBar) { expBar.value = player.exp; expBar.max = player.expToNext; }
  G("shield", player.shield || 0);
  G("critRate", (player.totalStats.critRate * 100).toFixed(1) + '%');
  G("critMultiplier", (player.totalStats.critMultiplier * 100).toFixed(1) + '%');
  G("damageReduce", (player.totalStats.damageReduce * 100).toFixed(1) + '%');

  // 🔰 新增：總傷害（百分比顯示）
// 🔰 總傷害 / 穿防
  G("totalDamage", ((player.totalStats.totalDamage || 0) * 100).toFixed(2) + "%");
  G("ignoreDefPct", ((player.totalStats.ignoreDefPct || 0) * 100).toFixed(2
  ) + "%");
  G("ignoreDefFlat", Math.floor(player.totalStats.ignoreDefFlat || 0));

  // ⭐ 新增：對一般 / 菁英 / Boss 傷害（主頁三個顯示）
  G("vsNormalDamage", ((player.totalStats.normalDamage || 0) * 100).toFixed(1) + "%");
  G("vsEliteDamage",  ((player.totalStats.eliteDamage  || 0) * 100).toFixed(1) + "%");
  G("vsBossDamage",   ((player.totalStats.bossDamage   || 0) * 100).toFixed(1) + "%");
}

function startGame() {
  const rawNickname = document.getElementById('nicknameInput').value;
  const job = document.getElementById('jobSelect').value;

  const nickname = sanitizeNickname(rawNickname);
  if (!nickname) { alert("暱稱不能為空！"); return; }
  if (nickname.length < NICKNAME_MIN_LEN) { alert(`暱稱至少需要 ${NICKNAME_MIN_LEN} 個字`); return; }
  if (nickname.length > NICKNAME_MAX_LEN) { alert(`暱稱最多 ${NICKNAME_MAX_LEN} 個字`); return; }

  player.nickname = nickname;
  player.job = job;

  initRecoverySystem?.();
  const modal = document.getElementById('gameSetupModal');
  if (modal) modal.style.display = 'none';

  initPlayer();
  updateResourceUI();
  refreshMageOnlyUI();
  rebuildActiveSkills?.();
  ensureSkillEvolution?.();
  renderSkillPanel?.();
  saveGame?.();
}

function toggleStatAlloc() {
  const area = document.getElementById('stat-alloc-area');
  const btn  = document.getElementById('toggleStatAllocBtn');
  if (!area || !btn) return;
  const hidden = getComputedStyle(area).display === 'none';
  area.style.display = hidden ? '' : 'none';
  btn.textContent = hidden ? '隱藏' : '顯示';
}

function toggleExtraStats() {
  const area = document.getElementById('extra-stats');
  const btn  = document.getElementById('toggleExtraStatsBtn');
  if (!area || !btn) return;
  const hidden = getComputedStyle(area).display === 'none';
  area.style.display = hidden ? '' : 'none';
  btn.textContent = hidden ? '隱藏' : '顯示';
}

// 🔑 確保 HTML 的 onclick 可呼叫
window.toggleStatAlloc = toggleStatAlloc;
window.toggleExtraStats = toggleExtraStats;
window.toggleMagicShield = toggleMagicShield;
window.startGame = startGame;

// Boot
document.addEventListener('DOMContentLoaded', () => {
  if (window.__BOOT_DONE__) return;     // 防止重複啟動
  window.__BOOT_DONE__ = true;

  // 先 init，再嘗試載入
  initPlayer();
  const hasSave = loadGame?.() || false;
  const setupModal = document.getElementById('gameSetupModal');

if (hasSave) {
  if (setupModal) setupModal.style.display = 'none';

  // ★ 1. 載入裝備（其實你 main.js 已經處理，但放這比較安全）
  if (typeof recalcEquipmentBonus === "function") {
    recalcEquipmentBonus();
  }

  // ★ 2. 套用所有的動態加成（職業被動、女神祝福、潛能、其他）
  if (window.JobPassives && typeof window.JobPassives.applyForCurrentPlayer === "function") {
    window.JobPassives.applyForCurrentPlayer();
  }

  // ★ 3. 更新 UI（現在的 UI 才會讀到正確的 PotentialBonus）
  updateResourceUI();
  refreshMageOnlyUI();
  ensureSkillEvolution?.();
  renderSkillPanel?.();

  console.log("已載入存檔並套用所有能力。");
} else {
    if (setupModal) setupModal.style.display = 'flex';
    console.log("沒有找到存檔，顯示角色設定畫面。");
  }

  // 限制暱稱輸入長度 + 簡易提示
  const nickInput = document.getElementById('nicknameInput');
  if (nickInput) {
    nickInput.maxLength = NICKNAME_MAX_LEN;
    if (!nickInput.placeholder || /輸入你的暱稱/.test(nickInput.placeholder)) {
      nickInput.placeholder = `請輸入暱稱（${NICKNAME_MIN_LEN}-${NICKNAME_MAX_LEN} 字）`;
    }
  }

  // 每次載入都執行
  refreshMageOnlyUI();
});