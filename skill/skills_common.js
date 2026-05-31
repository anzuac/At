// skills_common.js
// ---- SkillMath (shared helpers) ----
(function initSkillMathGlobal() {
  const root = (typeof globalThis !== "undefined") ? globalThis
            : (typeof window !== "undefined") ? window
            : (typeof global !== "undefined") ? global
            : {};
  if (root.SkillMath) return;

  // 遞減曲線：bonus = cap * S^p / (S^p + K^p)
  // bonus 上限 cap=2.0 代表 +200%（總倍率最高 3 倍）
  function diminishingBonus(S, cap = 2.0, K = 9373, p = 3) {
    S = Math.max(0, Number(S) || 0);
    cap = Math.max(0, Number(cap) || 0);
    K = Math.max(1, Number(K) || 1);
    p = Math.max(1, Number(p) || 1);

    const Sp = Math.pow(S, p);
    const Kp = Math.pow(K, p);
    return cap * (Sp / (Sp + Kp)); // 0 ~ cap
  }

  function getMainStatKeyByJob(job) {
    const j = String(job || "").toLowerCase();
    if (j === "warrior" || j === "戰士") return "str";
    if (j === "mage" || j === "法師") return "int";
    if (j === "archer" || j === "弓手") return "agi";
    if (j === "thief" || j === "盜賊") return "luk";
    return "str";
  }

  function mainStatBonus(player, { capBonus = 2.0, K = 9373, p = 3, statKey } = {}) {
    const key = statKey || getMainStatKeyByJob(player?.job);
    const base = Number(player?.baseStats?.[key] || 0);
    const core = Number(player?.coreBonus?.[key] || 0);
    const total = base + core;
    return diminishingBonus(total, capBonus, K, p);
  }

  function formatMainStatBonusLine(player, { capBonus = 2.0, K = 9373, p = 3, statKey } = {}) {
    const b = mainStatBonus(player, { capBonus, K, p, statKey });
    const capPct = Math.round(capBonus * 100);
    const totalCap = 1 + capBonus;
    return `・主屬加成：目前 +${Math.round(b * 100)}%（上限 +${capPct}%，總倍率最高 ${totalCap} 倍）`;
  }

  root.SkillMath = {
    CONFIG: {
      // 6500 主屬左右約 +50%
      MAIN_STAT: { capBonus: 2.0, K: 9373, p: 3 }
    },
    diminishingBonus,
    getMainStatKeyByJob,
    mainStatBonus,
    formatMainStatBonusLine,
  };
})();

/*registerCommonSkill({
  job: "all",
  id: "unisonBurst",
  name: "共鳴爆發",
  type: "attack",
  role: "attack",
  isBasic: false,
  
  level: 1,
  maxLevel: 20,
  
  currentTier: 0,
  evolveLevels: [10, 30, 50, 70, 100],
  
  // 固定冷卻 90 秒（各階同CD）
  tiers: [
    { name: "共鳴爆發", mpCost: 40, cooldown: 90, logic: { damageMultiplier: 1.4, hits: 3, levelMultiplier: 0.06 } },
    { name: "共鳴連擊", mpCost: 46, cooldown: 90, logic: { damageMultiplier: 1.7, minHits: 3, maxHits: 5, levelMultiplier: 0.07, mpCostLevelGrowth: 2 } },
    { name: "共鳴震盪", mpCost: 52, cooldown: 90, logic: { damageMultiplier: 2.0, hits: 4, levelMultiplier: 0.08 } },
    { name: "共鳴狂潮", mpCost: 58, cooldown: 90, logic: { damageMultiplier: 2.4, minHits: 4, maxHits: 6, levelMultiplier: 0.09 } },
    { name: "萬象共鳴", mpCost: 64, cooldown: 90, logic: { damageMultiplier: 2.8, hits: 5, levelMultiplier: 0.10 } },
  ],
  
  currentCooldown: 0,
  
  // 依職業吃主屬性：STR/INT/AGI/LUK → 每點 +0.2% 傷害，上限 +200%
  _getMainStatBonus() {
    const cfg = (typeof SkillMath !== "undefined" && SkillMath.CONFIG && SkillMath.CONFIG.MAIN_STAT)
      ? SkillMath.CONFIG.MAIN_STAT
      : { capBonus: 2.0, K: 9373, p: 3 };
    return (typeof SkillMath !== "undefined")
      ? SkillMath.mainStatBonus(player, cfg)
      : 0;
  },
  
  use(monster) {
    const t = getActiveTier(this);
    
    // 同步顯示資料
    this.name = t.name;
    this.cooldown = typeof t.cooldown === "number" ? t.cooldown : (this.cooldown ?? 0);
    const mpGrow = (t.logic?.mpCostLevelGrowth || 0) * Math.max(0, this.level - 1);
    const cost = (t.mpCost || 0) + mpGrow;
    this.mpCost = cost;
    
    // 主屬性加成
    const mainStatBonus = this._getMainStatBonus(); // 0 ~ 2.0
    
    // 傷害計算
    const perHitBase = t.logic.damageMultiplier + t.logic.levelMultiplier * (this.level - 1);
    const perHit = perHitBase * (1 + mainStatBonus);
    const base = Math.max(player.totalStats.atk - monster.def, 1);
    
    const hasRange = (typeof t.logic.minHits === "number" && typeof t.logic.maxHits === "number");
    const hits = hasRange ? getRandomInt(t.logic.minHits, t.logic.maxHits) : (t.logic.hits || 1);
    
    const dmg = Math.floor(base * perHit) * hits;
    
    monster.hp -= dmg;
    const hitText = hasRange ? `${hits} 次` : `${t.logic.hits} 次`;
    logPrepend?.(`✨ ${t.name} 連擊 ${hitText}，共 ${dmg} 傷害！（主屬加成 ${Math.round(mainStatBonus*100)}%）`);
    
    spendAndCooldown(this, cost);
    return dmg;
  },
  
  getUpgradeCost() {
    return 20 + (this.level - 1) * 10;
  },
  
  getDescription() {
    const t = getActiveTier(this);
    const per = (t.logic.damageMultiplier + t.logic.levelMultiplier * (this.level - 1)) * 100;
    const hitText = (typeof t.logic.minHits === "number" && typeof t.logic.maxHits === "number") ?
      `${t.logic.minHits}-${t.logic.maxHits} 段` :
      `${t.logic.hits} 段`;
    return `【${t.name}】${hitText}，每段約 ${Math.round(per)}%（MP ${t.mpCost}｜CD ${t.cooldown}s｜主屬性加成上限+200%）｜進化等級：${this.evolveLevels.join("/")}`;
  }
});
// skills_common.js —— 全職業通用：輪迴異常術（依序輪迴施加異常）
// 依賴：applyStatusToMonster(monster, type, durationSec, multiplier, currentTimeSec)、logPrepend、getActiveTier、spendAndCooldown、getRandomInt、window.round

/**registerCommonSkill({
  job: "all",
  id: "abnormalCycle",
  name: "輪迴異常術",
  type: "attack",
  role: "attack",
  isBasic: false,

  level: 1,
  maxLevel: 20,

  currentTier: 0,
  evolveLevels: [10, 30, 50, 70, 100],

  // 固定冷卻（各階同 CD），依等級略增 MP
  tiers: [
    // T1：基礎倍率與持續
    { name: "輪迴異常術", mpCost: 0, cooldown: 8,  logic: { levelMpGrowth: 1, levelDurGrowth: 0.2, levelMulGrowth: 0.002 } },
    // T2：縮短 CD、提升持續
    { name: "輪迴異常陣", mpCost: 22, cooldown: 7,  logic: { levelMpGrowth: 1, levelDurGrowth: 0.25, levelMulGrowth: 0.0025 } },
    // T3：再縮 CD
    { name: "輪迴徵兆",   mpCost: 26, cooldown: 6,  logic: { levelMpGrowth: 2, levelDurGrowth: 0.3, levelMulGrowth: 0.003 } },
    // T4：強化持續與倍率
    { name: "輪迴刻印",   mpCost: 30, cooldown: 6,  logic: { levelMpGrowth: 2, levelDurGrowth: 0.35, levelMulGrowth: 0.0035 } },
    // T5：終階
    { name: "萬象輪迴",   mpCost: 34, cooldown: 5,  logic: { levelMpGrowth: 3, levelDurGrowth: 0.4, levelMulGrowth: 0.004 } },
  ],

  currentCooldown: 0,

  // 狀態輪替順序
  _order: ["burn", "poison", "bleed", "frostbite", "weaken", "paralyze", "chaos", "deadly_poison"],
  _idx: 0, // 輪替索引（在物件上保存，不用全域）

  // 各狀態的「基礎持續秒」與「基礎倍率」
  _baseDur: {
    burn: 10, poison: 10, bleed: 10, frostbite: 10,
    weaken: 10, paralyze: 10, chaos: 10, deadly_poison: 10,
  },
  _baseMul: {
    burn: 0.10,          // 10% ATK/秒
    poison: 0.08,        // 8%  ATK/秒
    bleed: 0.12,         // 12% ATK/秒
    frostbite: 0.06,     // 6%  ATK/秒
    weaken: 0,           // debuff（降攻防），倍率無用
    paralyze: 0,         // 控制
    chaos: 0,            // 亂打
    deadly_poison: 0.02, // 2% MaxHP/秒
  },

  use(monster) {
    if (!monster) return 0;

    // 讀取階與同步顯示
    const t = getActiveTier(this);
    this.name = t.name;
    this.cooldown = typeof t.cooldown === "number" ? t.cooldown : (this.cooldown ?? 0);

    // 依等級增加 MP 消耗、持續秒、倍率微增（每階邏輯略不同）
    const mpCost = (t.mpCost || 0) + (t.logic?.levelMpGrowth || 0) * Math.max(0, this.level - 1);
    this.mpCost = mpCost;

    // 決定這次要施加的狀態
    const type = this._order[this._idx % this._order.length];
    this._idx++;

    // 等級成長帶來的額外持續與倍率
    const addDur = (t.logic?.levelDurGrowth || 0) * Math.max(0, this.level - 1);
    const addMul = (t.logic?.levelMulGrowth || 0) * Math.max(0, this.level - 1);

    // 計算最終參數
    const durationSec = Math.max(1, Math.floor((this._baseDur[type] || 5) + addDur));
    const multiplier  = Math.max(0, (this._baseMul[type] || 0) + addMul);

    // 施加狀態（以秒為單位；第五個參數是「目前秒」，你的 rpg.js 用 window.round 作為當前秒）
    if (typeof window.applyStatusToMonster === "function") {
      window.applyStatusToMonster(monster, type, durationSec, multiplier, window.round);
    }

    // 紀錄
    logPrepend?.(`🧪 施放【${t.name}】：套用 ${type}（${durationSec}s${multiplier ? `，倍率 ${multiplier}` : ""}）`);

    // 消耗與冷卻
    spendAndCooldown(this, mpCost);
    // 本技能不直接造成立即傷害，由狀態每秒處理 → 回傳 0
    return 0;
  },

  getUpgradeCost() {
    return 20 + (this.level - 1) * 10;
  },

  getDescription() {
    const t = getActiveTier(this);
    const durNote = `基礎持續(秒)會隨等級 +${t.logic?.levelDurGrowth || 0}/Lv`;
    const mulNote = `倍率每等 +${(t.logic?.levelMulGrowth || 0)}`;
    return `【${t.name}】依序輪替施加 ${this._order.join("→")}；${durNote}，${mulNote}（MP ${t.mpCost}｜CD ${t.cooldown}s）｜進化等級：${this.evolveLevels.join("/")}`;
  }
});*/
// =======================
// 一轉主力技能（四職）- 真多段回傳 hitDamages
// =======================

function _skillComputeCd(t, lg) {
  var base = Number(t.cooldown || 0);
  var cdRed = Number(lg.masteryCdReduceSec || 0);
  var cdZero = !!lg.masteryCdToZero;
  return cdZero ? 0 : Math.max(0, base - cdRed);
}

function _skillComputeMp(t, lg, skillLv) {
  var base = Number(t.mpCost || 0);
  var grow = Number(lg.mpCostLevelGrowth || 0); // 由精通檔寫入（1 或 3）
  return base + grow * Math.max(1, (skillLv || 1)); // 「等級×1」概念
}

function _buildHitArray(hits, dmgNormal, dmgLast) {
  var arr = new Array(hits);
  for (var i=0;i<hits;i++) arr[i] = dmgNormal;
  if (hits > 0) arr[hits-1] = dmgLast;
  return arr;
}

// ------------------------------------------------------
// 戰士：低段數、高單段
// ------------------------------------------------------
registerJobSkill('warrior', {
  job: "warrior",
  id: "warrior_rend_slash",
  name: "崩裂斬",
  type: "attack",
  role: "attack",
  isBasic: false,
  level: 1,
  maxLevel: 10,
  maxTargets: 3,
  tiers: [{
    name: "崩裂斬",
    mpCost: 5,
    cooldown: 8,
    maxTargets: 3,
    logic: {} // 由精通寫入：masteryAddPctPerHit / masteryLastHitAddPct / masteryHitsBonus / masteryCdReduceSec / mpCostLevelGrowth / masteryCdToZero
  }],
  currentCooldown: 0,

  use(monster){
    var t = getActiveTier(this);
    var lg = (t && t.logic) ? t.logic : {};
    var skillName = t.name + (getEvoLabel ? getEvoLabel(this) : "");

    this.name = skillName;
    var baseTargets = t.maxTargets || this.maxTargets || 1;
var bonusTargets = Math.max(0, Math.floor(Number(lg.masteryMaxTargetsBonus || 0)));
this.maxTargets = baseTargets + bonusTargets;

    // CD / MP
    this.cooldown = _skillComputeCd(t, lg);
    this.mpCost = _skillComputeMp(t, lg, this.level);

    var baseAtk  = Math.max(player.totalStats.atk || 1, 1);
    var strBonus = (typeof SkillMath !== "undefined") ? SkillMath.mainStatBonus(player, { ...(SkillMath.CONFIG?.MAIN_STAT||{capBonus:2.0,K:9373,p:3}), statKey: "str" }) : 0;

    // basePct：戰士單段較高（Lv1 110%，每級+6% → Lv10=164%）
    var basePct = 110 + 6 * Math.max(0, (this.level||1) - 1);

    // 精通加法%
    var addPct = Number(lg.masteryAddPctPerHit || 0);
    var perPct = basePct + addPct;

    var baseHits = 2;
    var hits = baseHits + Math.max(0, Math.floor(Number(lg.masteryHitsBonus || 0)));

    // 尾段額外%
    var lastAdd = Number(lg.masteryLastHitAddPct || 0);

    var dmgNormal = Math.floor(baseAtk * (perPct/100) * (1 + strBonus));
    var dmgLast   = Math.floor(baseAtk * ((perPct + lastAdd)/100) * (1 + strBonus));

    logPrepend?.(
      `⚔️ ${skillName}：${hits} Hit｜單段 ${Math.round(perPct)}%｜尾段 +${Math.round(lastAdd)}%｜MP ${this.mpCost}｜CD ${this.cooldown}s`
    );

    spendAndCooldown(this, this.mpCost);
    return { hitDamages: _buildHitArray(hits, dmgNormal, dmgLast) };
  },

  getUpgradeCost(){ return 15 + (this.level - 1) * 10; },

getDescription(){
  var t = getActiveTier(this);
  var lg = (t && t.logic) ? t.logic : {};

  var basePct = 110 + 6 * Math.max(0,(this.level||1)-1);
  var perPct = basePct + Number(lg.masteryAddPctPerHit||0);
  var lastAdd = Number(lg.masteryLastHitAddPct||0);

  var baseHits = 2;
  var hits = baseHits + Math.max(0, Math.floor(Number(lg.masteryHitsBonus||0)));

  // ✅ 目標顯示：吃精通加成 + 硬上限6
  var baseTargets = t.maxTargets || this.maxTargets || 1;
  var bonusTargets = Math.max(0, Math.floor(Number(lg.masteryMaxTargetsBonus || 0)));
  var targets = Math.min(6, baseTargets + bonusTargets);

  var totalPct = perPct * (hits - 1) + (perPct + lastAdd);
  var cd = _skillComputeCd(t, lg);
  var mp = _skillComputeMp(t, lg, this.level);

  return (
    `${t.name}｜戰士主力技\n` +
    `・目標：最多 ${targets} 名（精通已套用）\n` +
    `・段數：${hits} Hit\n` +
    `・單段：${Math.round(perPct)}%\n` +
    `・尾段： ${Math.round(perPct)}% +${Math.round(lastAdd)}%\n` +
    `・總倍率：約 ${Math.round(totalPct)}% / 目標\n` +
    `・冷卻：${cd.toFixed(1)} 秒｜MP：${mp}\n` +
    `${(typeof SkillMath!=="undefined") ? SkillMath.formatMainStatBonusLine(player, { ...(SkillMath.CONFIG?.MAIN_STAT||{capBonus:2.0,K:9373,p:3}), statKey:"str" }) : "・主屬加成：上限 +200%（總倍率最高 3 倍）"}\n` +
    `・等級上限：${this.maxLevel}`
  );
}
});

// ------------------------------------------------------
// 法師：中段數，尾段偏高（尾段額外%會比較容易堆）
// ------------------------------------------------------
registerJobSkill('mage', {
  job: "mage",
  id: "mage_arcane_burst",
  name: "奧能爆裂",
  type: "attack",
  role: "attack",
  isBasic: false,
  level: 1,
  maxLevel: 10,
  maxTargets: 3,
  tiers: [{
    name: "奧能爆裂",
    mpCost: 6,
    cooldown: 8,
    maxTargets: 3,
    logic: {}
  }],
  currentCooldown: 0,

  use(monster){
    var t = getActiveTier(this);
    var lg = (t && t.logic) ? t.logic : {};
    var skillName = t.name + (getEvoLabel ? getEvoLabel(this) : "");

    this.name = skillName;
    var baseTargets = t.maxTargets || this.maxTargets || 1;
var bonusTargets = Math.max(0, Math.floor(Number(lg.masteryMaxTargetsBonus || 0)));
this.maxTargets = baseTargets + bonusTargets;

    this.cooldown = _skillComputeCd(t, lg);
    this.mpCost = _skillComputeMp(t, lg, this.level);

    var baseAtk  = Math.max(player.totalStats.atk || 1, 1);
    var intBonus = (typeof SkillMath !== "undefined") ? SkillMath.mainStatBonus(player, { ...(SkillMath.CONFIG?.MAIN_STAT||{capBonus:2.0,K:9373,p:3}), statKey: "int" }) : 0; // 你若沒有就當0

    // basePct：法師單段中等（Lv1 78%，每級+4% → Lv10=114%）
    var basePct = 78 + 4 * Math.max(0,(this.level||1)-1);
    var perPct = basePct + Number(lg.masteryAddPctPerHit||0);

    var baseHits = 3;
    var hits = baseHits + Math.max(0, Math.floor(Number(lg.masteryHitsBonus||0)));

    var lastAdd = Number(lg.masteryLastHitAddPct||0);

    var dmgNormal = Math.floor(baseAtk * (perPct/100) * (1 + intBonus));
    var dmgLast   = Math.floor(baseAtk * ((perPct + lastAdd)/100) * (1 + intBonus));

    logPrepend?.(
      `✨ ${skillName}：${hits} Hit｜單段 ${Math.round(perPct)}%｜尾段 +${Math.round(lastAdd)}%｜MP ${this.mpCost}｜CD ${this.cooldown}s`
    );

    spendAndCooldown(this, this.mpCost);
    return { hitDamages: _buildHitArray(hits, dmgNormal, dmgLast) };
  },

  getUpgradeCost(){ return 15 + (this.level - 1) * 10; },

getDescription(){
  var t = getActiveTier(this);
  var lg = (t && t.logic) ? t.logic : {};

  var basePct = 78 + 4 * Math.max(0,(this.level||1)-1);
  var perPct = basePct + Number(lg.masteryAddPctPerHit||0);
  var lastAdd = Number(lg.masteryLastHitAddPct||0);

  var baseHits = 3;
  var hits = baseHits + Math.max(0, Math.floor(Number(lg.masteryHitsBonus||0)));

  // ✅ 目標顯示：吃精通加成 + 硬上限6
  var baseTargets = t.maxTargets || this.maxTargets || 1;
  var bonusTargets = Math.max(0, Math.floor(Number(lg.masteryMaxTargetsBonus || 0)));
  var targets = Math.min(6, baseTargets + bonusTargets);

  var totalPct = perPct * (hits - 1) + (perPct + lastAdd);
  var cd = _skillComputeCd(t, lg);
  var mp = _skillComputeMp(t, lg, this.level);

  return (
    `${t.name}｜法師主力技\n` +
    `・目標：最多 ${targets} 名（精通已套用）\n` +
    `・段數：${hits} Hit\n` +
    `・單段：${Math.round(perPct)}%\n` +
    `・尾段：${Math.round(perPct)}% +${Math.round(lastAdd)}%\n` +
    `・總倍率：約 ${Math.round(totalPct)}% / 目標\n` +
    `・冷卻：${cd.toFixed(1)} 秒｜MP：${mp}\n` +
    `${(typeof SkillMath!=="undefined") ? SkillMath.formatMainStatBonusLine(player, { ...(SkillMath.CONFIG?.MAIN_STAT||{capBonus:2.0,K:9373,p:3}), statKey:"int" }) : "・主屬加成：上限 +200%（總倍率最高 3 倍）"}\n` +
    `・等級上限：${this.maxLevel}`
  );
}
});

// ------------------------------------------------------
// 弓手：中段數，尾段加強（你也可未來改成「尾段暴擊加成」）
// 目前用「尾段額外%」實作，最穩也最直覺
// ------------------------------------------------------
registerJobSkill('archer', {
  job: "archer",
  id: "archer_pierce_shot",
  name: "貫穿射擊",
  type: "attack",
  role: "attack",
  isBasic: false,
  level: 1,
  maxLevel: 10,
  maxTargets: 3,
  tiers: [{
    name: "貫穿射擊",
    mpCost: 5,
    cooldown: 8,
    maxTargets: 3,
    logic: {}
  }],
  currentCooldown: 0,

  use(monster){
    var t = getActiveTier(this);
    var lg = (t && t.logic) ? t.logic : {};
    var skillName = t.name + (getEvoLabel ? getEvoLabel(this) : "");

    this.name = skillName;
    var baseTargets = t.maxTargets || this.maxTargets || 1;
var bonusTargets = Math.max(0, Math.floor(Number(lg.masteryMaxTargetsBonus || 0)));
this.maxTargets = baseTargets + bonusTargets;

    this.cooldown = _skillComputeCd(t, lg);
    this.mpCost = _skillComputeMp(t, lg, this.level);

    var baseAtk  = Math.max(player.totalStats.atk || 1, 1);
    var agiBonus = (typeof SkillMath !== "undefined") ? SkillMath.mainStatBonus(player, { ...(SkillMath.CONFIG?.MAIN_STAT||{capBonus:2.0,K:9373,p:3}), statKey: "agi" }) : 0;

    // basePct：弓手中等（Lv1 85%，每級+4% → Lv10=121%）
    var basePct = 85 + 4 * Math.max(0,(this.level||1)-1);
    var perPct = basePct + Number(lg.masteryAddPctPerHit||0);

    var baseHits = 3;
    var hits = baseHits + Math.max(0, Math.floor(Number(lg.masteryHitsBonus||0)));

    var lastAdd = Number(lg.masteryLastHitAddPct||0);

    var dmgNormal = Math.floor(baseAtk * (perPct/100) * (1 + agiBonus));
    var dmgLast   = Math.floor(baseAtk * ((perPct + lastAdd)/100) * (1 + agiBonus));

    logPrepend?.(
      `🏹 ${skillName}：${hits} Hit｜單段 ${Math.round(perPct)}%｜尾段 +${Math.round(lastAdd)}%｜MP ${this.mpCost}｜CD ${this.cooldown}s`
    );

    spendAndCooldown(this, this.mpCost);
    return { hitDamages: _buildHitArray(hits, dmgNormal, dmgLast) };
  },

  getUpgradeCost(){ return 15 + (this.level - 1) * 10; },

getDescription(){
  var t = getActiveTier(this);
  var lg = (t && t.logic) ? t.logic : {};

  var basePct = 85 + 4 * Math.max(0,(this.level||1)-1);
  var perPct = basePct + Number(lg.masteryAddPctPerHit||0);
  var lastAdd = Number(lg.masteryLastHitAddPct||0);

  var baseHits = 3;
  var hits = baseHits + Math.max(0, Math.floor(Number(lg.masteryHitsBonus||0)));

  // ✅ 目標顯示：吃精通加成 + 硬上限6
  var baseTargets = t.maxTargets || this.maxTargets || 1;
  var bonusTargets = Math.max(0, Math.floor(Number(lg.masteryMaxTargetsBonus || 0)));
  var targets = Math.min(6, baseTargets + bonusTargets);

  var totalPct = perPct * (hits - 1) + (perPct + lastAdd);
  var cd = _skillComputeCd(t, lg);
  var mp = _skillComputeMp(t, lg, this.level);

  return (
    `${t.name}｜弓手主力技\n` +
    `・目標：最多 ${targets} 名（精通已套用）\n` +
    `・段數：${hits} Hit\n` +
    `・單段：${Math.round(perPct)}%\n` +
    `・尾段：${Math.round(perPct)}% +${Math.round(lastAdd)}%\n` +
    `・總倍率：約 ${Math.round(totalPct)}% / 目標\n` +
    `・冷卻：${cd.toFixed(1)} 秒｜MP：${mp}\n` +
    `${(typeof SkillMath!=="undefined") ? SkillMath.formatMainStatBonusLine(player, { ...(SkillMath.CONFIG?.MAIN_STAT||{capBonus:2.0,K:9373,p:3}), statKey:"agi" }) : "・主屬加成：上限 +200%（總倍率最高 3 倍）"}\n` +
    `・等級上限：${this.maxLevel}`
  );
}
});

// ------------------------------------------------------
// 盜賊：高段數、低單段
// ------------------------------------------------------
registerJobSkill('thief', {
  job: "thief",
  id: "thief_shadow_flurry",
  name: "影刃亂舞",
  type: "attack",
  role: "attack",
  isBasic: false,
  level: 1,
  maxLevel: 10,
  maxTargets: 3,
  tiers: [{
    name: "影刃亂舞",
    mpCost: 5,
    cooldown: 8,
    maxTargets: 3,
    logic: {}
  }],
  currentCooldown: 0,

  use(monster){
    var t = getActiveTier(this);
    var lg = (t && t.logic) ? t.logic : {};
    var skillName = t.name + (getEvoLabel ? getEvoLabel(this) : "");

    this.name = skillName;
    var baseTargets = t.maxTargets || this.maxTargets || 1;
var bonusTargets = Math.max(0, Math.floor(Number(lg.masteryMaxTargetsBonus || 0)));
this.maxTargets = baseTargets + bonusTargets;

    this.cooldown = _skillComputeCd(t, lg);
    this.mpCost = _skillComputeMp(t, lg, this.level);

    var baseAtk  = Math.max(player.totalStats.atk || 1, 1);
    var lukBonus = (typeof _getLuckBonusWithCap === "function") ? _getLuckBonusWithCap(1.0) : 0;

    // basePct：盜賊單段低（Lv1 45%，每級+2% → Lv10=63%）
    var basePct = 45 + 2 * Math.max(0,(this.level||1)-1);
    var perPct = basePct + Number(lg.masteryAddPctPerHit||0);

    var baseHits = 5;
    var hits = baseHits + Math.max(0, Math.floor(Number(lg.masteryHitsBonus||0)));

    var lastAdd = Number(lg.masteryLastHitAddPct||0);

    var dmgNormal = Math.floor(baseAtk * (perPct/100) * (1 + lukBonus));
    var dmgLast   = Math.floor(baseAtk * ((perPct + lastAdd)/100) * (1 + lukBonus));

    logPrepend?.(
      `🗡️ ${skillName}：${hits} Hit｜單段 ${Math.round(perPct)}%｜尾段 +${Math.round(lastAdd)}%｜MP ${this.mpCost}｜CD ${this.cooldown}s`
    );

    spendAndCooldown(this, this.mpCost);
    return { hitDamages: _buildHitArray(hits, dmgNormal, dmgLast) };
  },

  getUpgradeCost(){ return 15 + (this.level - 1) * 10; },

getDescription(){
  var t = getActiveTier(this);
  var lg = (t && t.logic) ? t.logic : {};

  var basePct = 45 + 2 * Math.max(0,(this.level||1)-1);
  var perPct = basePct + Number(lg.masteryAddPctPerHit||0);
  var lastAdd = Number(lg.masteryLastHitAddPct||0);

  var baseHits = 5;
  var hits = baseHits + Math.max(0, Math.floor(Number(lg.masteryHitsBonus||0)));

  // ✅ 目標顯示：吃精通加成 + 硬上限6
  var baseTargets = t.maxTargets || this.maxTargets || 1;
  var bonusTargets = Math.max(0, Math.floor(Number(lg.masteryMaxTargetsBonus || 0)));
  var targets = Math.min(6, baseTargets + bonusTargets);

  var totalPct = perPct * (hits - 1) + (perPct + lastAdd);
  var cd = _skillComputeCd(t, lg);
  var mp = _skillComputeMp(t, lg, this.level);

  return (
    `${t.name}｜盜賊主力技\n` +
    `・目標：最多 ${targets} 名（精通已套用）\n` +
    `・段數：${hits} Hit\n` +
    `・單段：${Math.round(perPct)}%\n` +
    `・尾段：${Math.round(perPct)}% +${Math.round(lastAdd)}%\n` +
    `・總倍率：約 ${Math.round(totalPct)}% / 目標\n` +
    `・冷卻：${cd.toFixed(1)} 秒｜MP：${mp}\n` +
    `${(typeof SkillMath!=="undefined") ? SkillMath.formatMainStatBonusLine(player, { ...(SkillMath.CONFIG?.MAIN_STAT||{capBonus:2.0,K:9373,p:3}), statKey:"luk" }) : "・主屬加成：上限 +200%（總倍率最高 3 倍）"}\n` +
    `・等級上限：${this.maxLevel}`
  );
}
});