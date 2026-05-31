// ============================
// skills_mage.js（法師分支）
// 規則：
// 1) 技能內不直接扣血，只回傳數值傷害
// 2) 基礎攻擊只取 player.totalStats.atk，不扣防禦；防禦/護盾交給 Rpg_玩家.js
// 3) INT 每點 +0.2% 傷害，上限由 intBonusCap 控制
// 4) 升級成本一律 getUpgradeCost() { return 1; }
// ============================

// 時間工具（狀態用秒）
function _mageNowSec() {
  return Math.floor((typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000);
}
// 取得顯示用的「（進化n次）」字串
function getEvoLabel(skill) {
  const n = skill.currentTier || 0;
  if (!n) return "";
  if (n === 1) return "（進化1次）";
  return `（進化${n}次）`;
}

// 依目前階段算「這階段的技能等級上限」
function getCurrentMaxLevel(skill) {
  const tier = skill.currentTier || 0;
  const lvCapByTier = 5 + 5 * tier;        // 每進化 +5 等
  return Math.min(lvCapByTier, skill.maxLevel || lvCapByTier);
}

// 取得「下一次進化需要的等級」
// 已經最高階就回傳 null → UI 顯示「已達最終進化階段」
function getNextEvoLevel(skill) {
  const arr = skill.evolveLevels || [];
  if (!arr.length) return null;

  const tier    = skill.currentTier || 0;
  const maxTier = (skill.tiers?.length || 1) - 1;

  if (tier >= maxTier) return null; // 已是最高階

  const hasZeroBase = arr[0] === 0;
  const idx = hasZeroBase ? tier + 1 : tier;
  return arr[idx] ?? null;
}



// ===============================
// 三轉：元素攻擊（可進化 100/200/350/500/750）
// 新版特性：
//  ✔ 每次施放會「隨機段數 2~6 Hit」
//  ✔ 每次施放會「隨機攻擊 2~6 名敵人」
//  ✔ 顯示：單段％、本次總％、INT加成、元素效果
//  ✔ 不外洩內部程式碼，只描述結果
// ===============================

// 回合換算秒（毒、異常持續秒數用）
const MAGE3_TURN_SEC = 3;

// 每次施放隨機段數與隨機目標數
const MAGE3_RANDOM_MIN_HITS    = 2;
const MAGE3_RANDOM_MAX_HITS    = 6;
const MAGE3_RANDOM_MIN_TARGETS = 2;
const MAGE3_RANDOM_MAX_TARGETS = 6;

// 元素設定
const MAGE3_ELEMENT_CONFIG = {
  fire: {     // 即時額外傷害
    key: "fire",
    label: "火",
    chance: 0.15,
    type: "instantDamage",
    extraDamageRatio: 0.25
  },
  poison: {   // DOT
    key: "poison",
    label: "毒",
    chance: 0.15,
    type: "dot",
    dotRatio: 0.40,
    durationSec: 3 * MAGE3_TURN_SEC
  },
  ice: {      // 即時額外傷害
    key: "ice",
    label: "冰",
    chance: 0.10,
    type: "instantDamage",
    extraDamageRatio: 0.20
  },
  lightning: { // 麻痺
    key: "lightning",
    label: "雷",
    chance: 0.15,
    type: "status",
    statusKey: "paralyze",
    durationSec: 1 * MAGE3_TURN_SEC
  },
  earth: {     // 混亂
    key: "earth",
    label: "土",
    chance: 0.15,
    type: "status",
    statusKey: "chaos",
    durationSec: 1 * MAGE3_TURN_SEC
  }
};

// === 三轉：元素攻擊（元素師專用版）===
// 掛在 mage3 池子，但限定「元素師職業線」才能用
registerJobSkill('mage3', {
  job: "mage3",
  id: "mage3_elemental_strike",
  name: "元素攻擊(三轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  requiredJobTier: 3,

  // 🔒 元素師線專用：從 mage_elementalist3 往後的職業都可以用
  requireJobLineFrom: "mage_elementalist3",

  level: 1,
  maxLevel: 20,

  currentTier: 0,
  // 會一路進化到 750
  evolveLevels: [0, 100, 200, 350, 500, 750],

  tiers: [
    { name: "元素攻擊(三轉)", mpCost: 18, cooldown: 20, logic: { damageMultiplier: 0.76, levelMultiplier: 0.04, hits: 1, intBonusCap: 0.50 } },
    { name: "高等元素攻擊(三轉)", mpCost: 20, cooldown: 20, logic: { damageMultiplier: 0.88, levelMultiplier: 0.05, hits: 1, intBonusCap: 1.00 } },
    { name: "極效元素攻擊(三轉)", mpCost: 22, cooldown: 20, logic: { damageMultiplier: 1.02, levelMultiplier: 0.06, hits: 1, intBonusCap: 2.00 } },
    { name: "深淵元素攻擊(三轉)", mpCost: 24, cooldown: 20, logic: { damageMultiplier: 1.07, levelMultiplier: 0.07, hits: 1, intBonusCap: 3.00 } },
    { name: "神域元素攻擊(三轉)", mpCost: 26, cooldown: 20, logic: { damageMultiplier: 1.19, levelMultiplier: 0.09, hits: 1, intBonusCap: 3.00 } },
  ],

  currentCooldown: 0,

  _getIntBonus() {
    const RATE = 0.002; // INT × 0.2%
    const t = getActiveTier(this);
    const cap = Number(t?.logic?.intBonusCap ?? 0.5);

    const totalInt = (player?.baseStats?.int || 0) + (player?.coreBonus?.int || 0);
    return Math.min(cap, totalInt * RATE);
  },

  use(monster) {
    const t = getActiveTier(this);

    this.name = t.name;
    this.logic = t.logic;
    this.cooldown = t.cooldown;
    this.mpCost = t.mpCost;

    const L = Math.max(1, this.level | 0);

    const perMul = (t.logic.damageMultiplier || 0) +
      (t.logic.levelMultiplier || 0) * (L - 1);

    const perHitPct = Math.round(perMul * 100);

    const intBonus = this._getIntBonus();
    const baseAtk = Math.max(Number(player.totalStats?.atk || 1), 1);

    const hitsThisCast = MAGE3_RANDOM_MIN_HITS +
      Math.floor(Math.random() * (MAGE3_RANDOM_MAX_HITS - MAGE3_RANDOM_MIN_HITS + 1));

    const totalPctThisCast = perHitPct * hitsThisCast;

    const targetsThisCast = MAGE3_RANDOM_MIN_TARGETS +
      Math.floor(Math.random() * (MAGE3_RANDOM_MAX_TARGETS - MAGE3_RANDOM_MIN_TARGETS + 1));

    this.maxTargets = targetsThisCast;

    const perHitBase = Math.floor(baseAtk * perMul * (1 + intBonus));
    let total = perHitBase * hitsThisCast;

    const elementKeys = Object.keys(MAGE3_ELEMENT_CONFIG || {});
    const pickKey = elementKeys[Math.floor(Math.random() * elementKeys.length)];
    const cfg = MAGE3_ELEMENT_CONFIG[pickKey];
    let extraLog = "";

    const nowSec = Math.floor(Date.now() / 1000);
    const chanceOK = Math.random() < (cfg.chance || 0);

    if (cfg.type === "instantDamage" && chanceOK) {
      const extra = Math.floor(total * (cfg.extraDamageRatio || 0));
      total += extra;
      extraLog += `｜${cfg.label}追加 +${extra}`;
    }
    if (cfg.type === "dot" && chanceOK) {
      const wantPerTick = Math.floor(total * (cfg.dotRatio || 0));
      const mul = wantPerTick / Math.max(1, baseAtk);
      window.applyStatusToMonster?.(monster, "poison", cfg.durationSec, mul, nowSec);
      extraLog += `｜${cfg.label}中毒：持續 ${cfg.durationSec}s，每跳約 ${wantPerTick}`;
    }
    if (cfg.type === "status" && chanceOK) {
      window.applyStatusToMonster?.(monster, cfg.statusKey, cfg.durationSec, 0, nowSec);
      extraLog += `｜${cfg.label}：附帶 ${cfg.statusKey} ${cfg.durationSec}s`;
    }

    const elemLabel = cfg.label;

    logPrepend?.(
      `✨ ${t.name} 隨機對最多 ${targetsThisCast} 名敵人造成約 ${total} 傷害` +
      `（單段約 ${perHitPct}% × ${hitsThisCast} Hit＝約 ${totalPctThisCast}%｜` +
      `元素：${elemLabel}｜INT加成約 ${Math.round(intBonus * 100)}%）` +
      extraLog
    );

    spendAndCooldown(this, this.mpCost);
    return total;
  },

  getUpgradeCost() { return 1; },

  getDescription() {
    const t = getActiveTier(this);
    const L = Math.max(1, this.level | 0);

    const perPct = Math.round(
      (t.logic.damageMultiplier + t.logic.levelMultiplier * (L - 1)) * 100
    );

    const capPct = Math.round((t.logic.intBonusCap || 0) * 100);

    const minHits = MAGE3_RANDOM_MIN_HITS;
    const maxHits = MAGE3_RANDOM_MAX_HITS;
    const minTotal = perPct * minHits;
    const maxTotal = perPct * maxHits;

    const parts = Object.values(MAGE3_ELEMENT_CONFIG).map(cfg => {
      const chance = Math.round((cfg.chance || 0) * 100);

      if (cfg.type === "instantDamage")
        return `${cfg.label}：${chance}% → 額外傷害 +${Math.round(cfg.extraDamageRatio * 100)}%`;

      if (cfg.type === "dot")
        return `${cfg.label}：${chance}% → 造成本次 ${Math.round(cfg.dotRatio * 100)}% 的持續傷害`;

      if (cfg.type === "status") {
        const name =
          cfg.statusKey === "paralyze" ? "麻痺" :
          cfg.statusKey === "chaos" ? "混亂" : cfg.statusKey;
        return `${cfg.label}：${chance}% → 附帶 ${name} ${cfg.durationSec}s`;
      }

      return `${cfg.label}：${chance}%`;
    });

    return (
      `元素攻擊（第三轉核心技能｜元素師專用）\n` +
      `・每次施放會隨機攻擊 ${MAGE3_RANDOM_MIN_TARGETS}~${MAGE3_RANDOM_MAX_TARGETS} 名敵人\n` +
      `・多段傷害：${minHits}~${maxHits} Hit（本次隨機）\n` +
      `・單段威力：約 ${perPct}%｜整體威力約 ${minTotal}% ~ ${maxTotal}%\n` +
      `・可獲得 INT 加成（上限約 +${capPct}%）\n` +
      `・施放時會隨機附帶 1 種元素效果：\n` +
      `  ${parts.join("｜")}\n` +
      `・進化階段：${this.evolveLevels.join(" / ")}\n` +
      `・職業限制：元素師職業線（三轉「高等元素師」起，往後進階皆可使用）`
    );
  }
});


/* ===================== 四轉牧師：進階天使之劍 ===================== */
registerJobSkill('mage4', {
  job: "mage4",
  id: "priest4_advanced_angel_sword",
  name: "進階天使之劍(四轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  requiredJobTier: 4,
  // ⭐ 限定職業線：牧師線（四轉「神聖主教」起，往後進階都可用）
  requireJobLineFrom: "mage_priest4",

  level: 1,
  maxLevel: 20,

  // 一次擊中最多 5 名敵人（交給 playerSkills._cast() 帶進 sr.maxTargets）
  maxTargets: 5,

  // 只用單一 tier，方便維護
  currentTier: 0,
  tiers: [
    {
      name: "進階天使之劍",
      mpCost: 30,
      cooldown: 18,
      maxTargets: 5,
      logic: {
        basePct: 150,     // 單段基礎 150%
        perLvPct: 3,      // 每等 +3%
        hits: 8,          // 8 Hit
        intCap: 2.5,      // INT 加成上限 +250%（可依感覺微調）
        supportEvery: 5,  // 每 5 次施放觸發一次天使支援
        supportPct: 100,  // 天使支援：每 Hit 100%
        supportHits: 12   // 天使支援：12 Hit
      }
    }
  ],

  currentCooldown: 0,

  // 小工具：INT 加成（上限 cap，小數 2.5 = +250%）
  _getIntBonus(cap) {
    const RATE = 0.002; // 每點 INT +0.2%
    const totalInt =
      (player?.baseStats?.int || 0) +
      (player?.coreBonus?.int || 0);
    const raw = totalInt * RATE;
    const max = Math.max(0, Number(cap) || 0);
    return Math.min(max, Math.max(0, raw));
  },

  use(monster) {
    const tierIndex = this.currentTier || 0;
    const t = (this.tiers && this.tiers[tierIndex]) || this.tiers[0];

    this.name     = t.name;
    this.cooldown = t.cooldown;
    this.mpCost   = t.mpCost;

    // maxTargets 交給 playerSkills._cast() 用，不在這裡覆寫
    // this.maxTargets = t.maxTargets; // 可以保留 / 不寫都沒關係

    const logic = t.logic || {};
    const L     = Math.max(1, this.level | 0);

    const hits        = Number(logic.hits || 1);
    const basePct     = Number(logic.basePct || 0);
    const perLvPct    = Number(logic.perLvPct || 0);
    const intCap      = Number(logic.intCap || 0);

    // === 主體 8 Hit 傷害 ===
    const perHitPct = basePct + perLvPct * (L - 1); // 每 Hit 百分比
    const perHitMul = perHitPct / 100;

    const atk      = Math.max(player.totalStats?.atk || 1, 1);
    const intBonus = this._getIntBonus(intCap);      // 小數，比如 1.5 = +150%

    // 對「單一目標」的主體總傷害
    const mainDamage = Math.floor(atk * perHitMul * (1 + intBonus)) * hits;

    // ===== 天使支援觸發判定：每 5 次施放一次 =====
    this._castCount = (this._castCount || 0) + 1;

    let supportDamage = 0;
    let supportText   = "";
    const supportEvery  = Number(logic.supportEvery || 5);
    const supportPct    = Number(logic.supportPct   || 100); // 每 Hit 百分比
    const supportHits   = Number(logic.supportHits  || 12);

    // 每第 N 次施放觸發支援
    if (supportEvery > 0 && (this._castCount % supportEvery) === 0) {
      const supportMul = supportPct / 100;
      supportDamage = Math.floor(atk * supportMul * (1 + intBonus)) * supportHits;

      // ⭐ 提供給 Rpg_玩家 的標記（會顯示在「技能造成 X 傷害」旁邊）
      this.lastCastTag = `天使支援 x${supportHits}`;
      supportText = `｜天使支援再次斬擊 ${supportHits} 次`;
    } else {
      this.lastCastTag = "";
    }

    const totalDamagePerTarget = mainDamage + supportDamage;

    // 額外詳細 log（顯示在你原本 logPrepend 區塊，不影響主戰鬥文字）
    if (typeof logPrepend === "function") {
      logPrepend(
        `✝️ ${t.name} 對每名目標約造成 ${totalDamagePerTarget} 傷害` +
        `（主體 ${hits} Hit，單 Hit 約 ${Math.round(perHitPct)}%｜INT 加成約 ${Math.round(intBonus * 100)}%）` +
        (supportDamage > 0
          ? `《第 ${this._castCount} 次施放：觸發天使支援，額外造成約 ${supportDamage} 傷害》`
          : `（第 ${this._castCount} 次施放）`
        ) +
        supportText
      );
    }

    spendAndCooldown(this, this.mpCost);
    // ❗ 回傳的是「對單一目標」的總傷害，群體分配由 Rpg_玩家.js 負責
    return totalDamagePerTarget;
  },

  getUpgradeCost() {
    // 你可隨意調整，這裡先給一個中後期用的數值
    return 60 + (this.level - 1) * 20;
  },

  getDescription() {
    const tierIndex = this.currentTier || 0;
    const t = (this.tiers && this.tiers[tierIndex]) || this.tiers[0];
    const logic = t.logic || {};
    const L     = Math.max(1, this.level | 0);

    const hits     = Number(logic.hits || 1);
    const basePct  = Number(logic.basePct || 0);
    const perLvPct = Number(logic.perLvPct || 0);

    const perHitPct = basePct + perLvPct * (L - 1);
    const totalPct  = perHitPct * hits;
    const intCapPct = Math.round((logic.intCap || 0) * 100);

    const supportEvery = Number(logic.supportEvery || 5);
    const supportPct   = Number(logic.supportPct   || 100);
    const supportHits  = Number(logic.supportHits  || 12);

    return (
      `${t.name}（牧師線四轉核心攻擊技能）\n` +
      `・對最多 ${this.maxTargets} 名敵人進行 ${hits} 次聖劍斬擊\n` +
      `・目前每擊約 ${perHitPct}% ，合計約 ${totalPct}% 傷害（會隨技能等級提升，每級 +${perLvPct}%）\n` +
      `・可從 INT 獲得額外加成，上限約 +${intCapPct}%\n` +
      `・特殊效果：每施放 ${supportEvery} 次，會追加「天使支援」\n` +
      `  → 再對同樣的目標數量施放 ${supportHits} 次斬擊，每擊約 ${supportPct}% 傷害\n` +
      `・冷卻時間：約 ${t.cooldown} 秒｜消耗 MP：約 ${t.mpCost}\n` +
      `・職業限制：牧師職業線（四轉「神聖主教」起，往後進階皆可使用）`
    );
  }
});// ===============================================
// 神諭滅世元素轟炸（元素師五轉專用大招）
// mage_elementalist5 之後才能使用
// 每次施放隨機抽一種「元素型態」：火 / 水 / 雷 / 元素爆發
// 並在戰鬥主 log 顯示：神諭滅世元素轟炸（🔥火元素）
// ===============================================

// 本技能的 4 種元素型態設定
const ORACLE_ELE_PATTERNS = [
  {
    key: "fire",
    icon: "🔥",
    label: "火元素",
    targets: 4,
    hits: 3,
    basePct: 213,      // 單段傷害 213%
    perLvPct: 12,      // 每等 +12%
    bonusChance: 0.20, // 20% 火元素上身
    bonusFinal: 0.70,  // 本次最終傷害 +70%
    applyExtra (ctx) {
      if (Math.random() < this.bonusChance) {
        ctx.finalPerTarget = Math.floor(ctx.finalPerTarget * (1 + this.bonusFinal));
        ctx.extraLogs.push("火元素上身：本次最終傷害 +70%");
      }
    }
  },
  {
    key: "water",
    icon: "💧",
    label: "水元素",
    targets: 2,
    hits: 6,
    basePct: 110,
    perLvPct: 12,
    bonusChance: 0.15, // 15% 水元素上身
    bonusFinal: 0.50,  // 本次傷害 +50%
    applyExtra (ctx) {
      const nowSec = ctx.nowSec;
      const m      = ctx.monster;

      if (Math.random() < this.bonusChance) {
        ctx.finalPerTarget = Math.floor(ctx.finalPerTarget * (1 + this.bonusFinal));
        ctx.extraLogs.push("水元素上身：本次傷害 +50%");
        // 觸發虛弱（weaken），持續 10 秒
        if (typeof window.applyStatusToMonster === "function" && m) {
          window.applyStatusToMonster(m, "weaken", 10, 0, nowSec);
          ctx.extraLogs.push("同時施加【虛弱】10 秒");
        }
      }
    }
  },
  {
    key: "thunder",
    icon: "⚡",
    label: "雷元素",
    targets: 4,
    hits: 2,
    basePct: 637,
    perLvPct: 12,
    bonusChance: 0.20, // 20% 雷元素上身
    bonusFinal: 0,     // 只控場不加傷
    applyExtra (ctx) {
      const nowSec = ctx.nowSec;
      const m      = ctx.monster;

      if (Math.random() < this.bonusChance) {
        if (typeof window.applyStatusToMonster === "function" && m) {
          window.applyStatusToMonster(m, "paralyze", 10, 0, nowSec);
          ctx.extraLogs.push("雷元素上身：施加【麻痺】10 秒");
        }
      }
    }
  },
  {
    key: "burst",
    icon: "🌈",
    label: "元素爆發",
    targets: 6,
    hits: 6,
    basePct: 227,
    perLvPct: 12,
    bonusChance: 0.15, // 15% 機率 爆發強化
    bonusFinal: 0.15,  // 本次傷害 +15%
    applyExtra (ctx) {
      // 元素爆發：15% 機率，本次傷害 +15%，並追加施放一次 火 / 水 / 雷 其中一種
      if (Math.random() >= this.bonusChance) return;

      const baseAtk    = ctx.baseAtk;
      const L          = ctx.level;
      const patterns   = ORACLE_ELE_PATTERNS.filter((p) =>{ return p.key !== "burst"; });
      const extraPick  = patterns[Math.floor(Math.random() * patterns.length)];
      const extraPer   = (extraPick.basePct + extraPick.perLvPct * (L - 1)) / 100;
      const extraDmgPT = Math.floor(baseAtk * extraPer) * extraPick.hits;

      ctx.finalPerTarget = Math.floor(ctx.finalPerTarget * (1 + this.bonusFinal));
      ctx.finalPerTarget += extraDmgPT;

      ctx.extraLogs.push(
        "元素爆發：本次傷害 +15% 並追加施放 " +
        extraPick.icon + extraPick.label + "（額外約 " + extraDmgPT + " 傷害/目標）"
      );
    }
  }
];

// ===============================================
// 神諭滅世元素轟炸 —— 元素師五轉專用大招
// ===============================================
registerJobSkill('mage5', {
  job: "mage5",
  id: "elementalist5_oracle_element_bombard",
  name: "神諭滅世元素轟炸(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  requiredJobTier: 5,
  // ⭐ 只給「元素師線」使用（星界元素王 & 萬象法神）
  requireJobLineFrom: "mage_elementalist5",

  level: 1,
  maxLevel: 20,

  // UI 預設最多 6 目標，實際會依元素型態改寫
  maxTargets: 6,

  currentTier: 0,
  tiers: [
    {
      name: "神諭滅世元素轟炸",
      mpCost: 80,
      cooldown: 20,
      maxTargets: 6,
      logic: {
        // 每等 +12% 的計算放在 ORACLE_ELE_PATTERNS 裡
      },

      // ===== 真正施放邏輯（tier 層級）=====
      use(monster, skill) {
        const s = skill || {};
        const L = Math.max(1, s.level | 0);

        // 隨機決定這次的元素型態
        const mainPattern = ORACLE_ELE_PATTERNS[
          Math.floor(Math.random() * ORACLE_ELE_PATTERNS.length)
        ];

        // === 讓戰鬥主 Log 顯示本次元素 ===
        const displayName = "神諭滅世元素轟炸（" + mainPattern.icon + mainPattern.label + "）";
        this.name = displayName;
        s.name    = displayName;

        // 更新 MP / CD
        s.cooldown = this.cooldown;
        s.mpCost   = this.mpCost;

        // 這次最多打幾隻怪
        s.maxTargets = mainPattern.targets;

        const baseAtk    = Math.max(player.totalStats && player.totalStats.atk || 1, 1);
        const perHitPct  = mainPattern.basePct + mainPattern.perLvPct * (L - 1);
        const perHitMul  = perHitPct / 100;

        // 以「單一目標」為基準的總傷害
        const perTargetBase = Math.floor(baseAtk * perHitMul) * mainPattern.hits;

        // 各元素的額外效果
        const nowSec = Math.floor(Date.now() / 1000);
        const ctx = {
          level: L,
          monster,
          nowSec,
          baseAtk,
          finalPerTarget: perTargetBase,
          extraLogs: []
        };

        if (typeof mainPattern.applyExtra === "function") {
          mainPattern.applyExtra(ctx);
        }

        const finalPerTarget = ctx.finalPerTarget;

        // ===== 戰鬥細節 log（額外說明）=====
        const detailText =
          "✨ " + displayName + " 對每個目標造成約 " + finalPerTarget + " 傷害" +
          "（" + mainPattern.targets + " 目標｜每目標 " + mainPattern.hits + " Hit｜單 Hit 約 " +
          Math.round(perHitPct) + "%）" +
          (ctx.extraLogs.length ? "｜" + ctx.extraLogs.join(" / ") : "");

        if (typeof logPrepend === "function") {
          logPrepend(detailText);
        }

        // 設定冷卻 / 扣 MP（實際 MP 已在 _cast 裡扣一次，這裡是保險）
        spendAndCooldown(s, s.mpCost || this.mpCost);

        // 回傳「單一目標」預估總傷害，AoE / 爆擊 / 防禦 交給 Rpg_玩家.actOnce
        return finalPerTarget;
      }
    }
  ],

  currentCooldown: 0,

  getUpgradeCost() {
    return 50 + (this.level - 1) * 20;
  },

  // ===== 這裡改成用 <br> 排版，避免一整條密密麻麻 =====
  getDescription() {
    const L = Math.max(1, this.level | 0);

    const parts = ORACLE_ELE_PATTERNS.map((p) =>{
      const perHit = p.basePct + p.perLvPct * (L - 1);
      const total  = perHit * p.hits;
      let extra  = "";

      if (p.key === "fire") {
        extra = "；" + Math.round(p.bonusChance * 100) +
                "%【火元素上身】，本次傷害 +" + Math.round(p.bonusFinal * 100) + "%";
      } else if (p.key === "water") {
        extra = "；" + Math.round(p.bonusChance * 100) +
                "%【水元素上身】，本次傷害 +" + Math.round(p.bonusFinal * 100) +
                "%，並施加虛弱 10 秒";
      } else if (p.key === "thunder") {
        extra = "；" + Math.round(p.bonusChance * 100) +
                "%【雷元素上身】，施加麻痺 10 秒";
      } else if (p.key === "burst") {
        extra = "；" + Math.round(p.bonusChance * 100) +
                "% 本次傷害 +" + Math.round(p.bonusFinal * 100) +
                "%，並追加施放一次火 / 水 / 雷";
      }

      return p.icon + p.label +
             "：最多 " + p.targets + " 名敵人 × " + p.hits +
             " Hit，單 Hit 約 " + perHit + "%（總約 " + total + "%）" + extra;
    });

    const t0 = this.tiers && this.tiers[0] || { mpCost: 80, cooldown: 20 };

    let html = "";
    html += "神諭滅世元素轟炸（元素師五轉專屬大招）<br>";
    html += "・每次施放隨機啟動 1 種元素型態：🔥火 / 💧水 / ⚡雷 / 🌈元素爆發<br>";
    html += "・等級已套用目前 Lv." + L + " 的倍率<br>";
    html += "・各元素效果：<br>";
    html += "　" + parts.join("<br>　") + "<br>";
    html += "・冷卻時間：" + t0.cooldown + " 秒｜消耗 MP：" + t0.mpCost + "<br>";
    html += "・職業限制：元素師職業線（五轉「星界元素王」、六轉「萬象法神」可使用）";

    return html;
  }
});
/* ============================================================
   元素師六轉大招：滅世轟炸（600 秒）
   ・攻擊 10 名敵人 × 12 Hit
   ・每 Hit 傷害 = 117% + (等級 × 10%)
   ・20% 機率：最終傷害 +20%
   ・15% 機率：本次技能冷卻 -200 秒
   ・會顯示「滅世轟炸（🔥/💧/⚡/🌪️ 隨機元素）」於戰鬥主 Log
   ============================================================ */

const ORACLE_APOCALYPSE_ELEMENTS = [
  { key: "fire",    icon: "🔥", label: "火元素"    },
  { key: "water",   icon: "💧", label: "水元素"    },
  { key: "thunder", icon: "⚡", label: "雷元素"    },
  { key: "wind",    icon: "🌪️", label: "風元素"    },
];

registerJobSkill('mage5', {
  job: "mage5",
  id: "elementalist5_apocalypse_bombard",
  name: "滅世轟炸(六轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  requiredJobTier: 6,
  requireJobLineFrom: "mage_elementalist6", // ⭐ 六轉元素師專用

  level: 1,
  maxLevel: 20,
  maxTargets: 10,  // 固定最多 10 隻

  mpCost: 100,
  cooldown: 600,   // 600 秒

  logic: {
    basePct: 117,      // 單段 117%
    perLvPct: 10,      // 每等 +10%
    hits: 12,          // 12 Hit
    bonusChance: 0.20, // 20% 最終傷害 +20%
    bonusFinal: 0.20,
    cdCutChance: 0.15, // 15% 冷卻 -200s
    cdCutValue: 200
  },

  currentCooldown: 0,

  use(monster) {
    const L  = Math.max(1, this.level | 0);

    // === 隨機抽一個元素（只為顯示效果）===
    const pick = ORACLE_APOCALYPSE_ELEMENTS[
      Math.floor(Math.random() * ORACLE_APOCALYPSE_ELEMENTS.length)
    ];

    const displayName = `滅世轟炸（${pick.icon}${pick.label}）`;
    this.name = displayName;

    // 基礎資訊
    const lg   = this.logic;
    const hits = lg.hits || 12;

    // === 計算傷害 ===
    const perHitPct = (lg.basePct + lg.perLvPct * (L - 1));
    const perHitMul = perHitPct / 100;

    const baseAtk = Math.max(player.totalStats?.atk || 1, 1);
    let dmgPerTarget = Math.floor(baseAtk * perHitMul) * hits;

    // 狀態資訊用
    this.lastCastTag = "";
    const extraNotes = [];

    // === 20% → 最終傷害 +20% ===
    if (Math.random() < lg.bonusChance) {
      dmgPerTarget = Math.floor(dmgPerTarget * (1 + lg.bonusFinal));
      this.lastCastTag = "最終傷害+20%";
      extraNotes.push("《元素共鳴觸發：最終傷害 +20%》");
    }

    // === 15% → 本次技能冷卻減少 200 秒 ===
    let cdCutApplied = false;
    if (Math.random() < lg.cdCutChance) {
      this.currentCooldown = Math.max(0, this.cooldown - lg.cdCutValue);
      cdCutApplied = true;
      extraNotes.push(`《時間扭曲：本次冷卻 -${lg.cdCutValue} 秒》`);
    } else {
      this.currentCooldown = this.cooldown; // 正常進入全冷卻
    }

    // === 顯示戰鬥 Log ===
    logPrepend?.(
      `💥 ${displayName} 對最多 10 名敵人造成約 ${dmgPerTarget} 傷害 ` +
      `（12 Hit｜單 Hit 約 ${Math.round(perHitPct)}%）` +
      (extraNotes.length ? "｜" + extraNotes.join(" / ") : "")
    );

    // MP 扣除 + 設定冷卻（如果有冷卻縮短已在上方處理）
    spendAndCooldown(this, this.mpCost);

    return dmgPerTarget; // 回傳「單一目標」傷害，AoE 由 actOnce 處理
  },

  getUpgradeCost() { return 100 + (this.level - 1) * 40; },

  getDescription() {
    const L  = Math.max(1, this.level | 0);
    const lg = this.logic;

    const perHitPct = lg.basePct + lg.perLvPct * (L - 1);
    const totalPct  = perHitPct * lg.hits;

    return (
      `滅世轟炸（六轉元素師究極大招）\n` +
      `・攻擊最多 10 名敵人，12 Hit\n` +
      `・等級計算：每 Hit = ${lg.basePct}% + ${lg.perLvPct}%×Lv（目前約 ${perHitPct}%）\n` +
      `・總傷害：約 ${totalPct}%\n` +
      `・${Math.round(lg.bonusChance * 100)}% 機率最終傷害 +${Math.round(lg.bonusFinal * 100)}%\n` +
      `・${Math.round(lg.cdCutChance * 100)}% 機率本次冷卻減少 ${lg.cdCutValue} 秒\n` +
      `・施放時會顯示使用之元素（🔥/💧/⚡/🌪️）\n` +
      `・冷卻：${this.cooldown} 秒｜MP：${this.mpCost}\n` +
      `・職業限制：元素師線 六轉（萬象法神）`
    );
  }
});

/* ===================== 五轉牧師主力技：神聖審判 ===================== */
registerJobSkill('mage5', {
  job: "mage5",
  id: "priest5_holy_judgment",
  name: "神聖審判(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  requiredJobTier: 5,
  // ⭐ 限定牧師職業線（五轉「聖潔大主教」起，往後進階皆可使用）
  requireJobLineFrom: "mage_priest5",

  level: 1,
  maxLevel: 20,

  // 攻擊 10 個敵人
  maxTargets: 10,

  // 固定消耗 / 冷卻
  mpCost: 4000,
  cooldown: 8,

  currentCooldown: 0,

  // INT 加成（給牧師用）：每點 INT +0.2%，上限 +300%
  _getIntBonus() {
    const RATE = 0.002;   // 0.2% / INT
    const CAP  = 3.0;     // 上限 +300%
    const baseInt =
      (player?.baseStats?.int  || 0) +
      (player?.coreBonus?.int  || 0);
    const raw = Math.max(0, baseInt * RATE);
    return Math.min(CAP, raw);
  },

  use(monster) {
    // 保險：不符條件就不讓用
    if (typeof Skills_isUnlocked === "function" &&
        !Skills_isUnlocked(this)) {
      alert("當前職業無法使用「神聖審判」。");
      return 0;
    }

    const L = Math.max(1, this.level | 0);

    // ① 本體：攻擊 10 個敵人 × 6 Hit
    const MAIN_HITS = 6;
    const mainPerHitPct = 130 + 7 * (L - 1);   // 130% + 7% * (Lv-1)
    const mainPerHitMul = mainPerHitPct / 100;

    const baseAtk  = Math.max(player.totalStats?.atk || 1, 1);
    const intBonus = this._getIntBonus ? this._getIntBonus() : 0;

    const mainPerTarget =
      Math.floor(baseAtk * mainPerHitMul * (1 + intBonus)) * MAIN_HITS;

    // ② 審判追擊：25% 機率，再攻擊 10 個敵人 × 3 Hit
    const JUDGE_HITS = 3;
    const judgePerHitPct = 197 + 12 * (L - 1); // 197% + 12% * (Lv-1)
    const judgePerHitMul = judgePerHitPct / 100;
    const judgePerTarget =
      Math.floor(baseAtk * judgePerHitMul * (1 + intBonus)) * JUDGE_HITS;

    let dmgPerTarget = mainPerTarget;
    const tags = [];

    // 25% 審判追擊
    const JUDGE_CHANCE = 0.25;
    if (Math.random() < JUDGE_CHANCE) {
      dmgPerTarget += judgePerTarget;
      tags.push("審判追擊");
    }

    // ③ 30% 本次最終傷害 +20%
    const BONUS_CHANCE = 0.30;
    const BONUS_FINAL  = 0.20;
    if (Math.random() < BONUS_CHANCE) {
      dmgPerTarget = Math.floor(dmgPerTarget * (1 + BONUS_FINAL));
      tags.push("最終傷害+20%");
    }

    // ==== Log 顯示 ====
    if (typeof logPrepend === "function") {
      const tagText = tags.length ? `《${tags.join("．")}》` : "";
      logPrepend(
        `✨ 神聖審判 對每隻敵人造成約 ${dmgPerTarget} 傷害 ` +
        `（主體：10體×${MAIN_HITS} Hit，單Hit約 ${mainPerHitPct}%｜` +
        `INT加成約 ${Math.round(intBonus * 100)}%）` +
        (tags.length
          ? `｜觸發效果：${tags.join("、")}`
          : "")
      );
    }

    // 扣 MP + 設冷卻（真正的傷害計算交給 Rpg_玩家.js）
    spendAndCooldown(this, this.mpCost);
    return dmgPerTarget; // ⚠️ 傳回「單一目標」的傷害，群體由 Rpg_玩家.js 處理
  },

  getUpgradeCost() {
    // 你可以之後再調整花費公式
    return 50 + (this.level - 1) * 20;
  },

  getDescription() {
    const L = Math.max(1, this.level | 0);

    const mainPerHitPct   = 130 + 7 * (L - 1);
    const mainTotalPct    = mainPerHitPct * 6;

    const judgePerHitPct  = 197 + 12 * (L - 1);
    const judgeTotalPct   = judgePerHitPct * 3;

    return (
      `神聖審判（牧師線五轉主力技能）\n` +
      `・攻擊最多 10 名敵人，進行 6 Hit 聖光斬擊\n` +
      `・目前每 Hit 約 ${mainPerHitPct}% ，主體合計約 ${mainTotalPct}% 傷害\n` +
      `・可從 INT 獲得額外加成（上限約 +300%）\n` +
      `・25% 機率追加「審判追擊」，再對同樣 10 名敵人進行 3 Hit\n` +
      `　每 Hit 約 ${judgePerHitPct}% ，合計約 ${judgeTotalPct}% 額外傷害\n` +
      `・30% 機率讓本次「最終傷害」再提高約 20%\n` +
      `・冷卻時間：8 秒｜消耗 MP：4000\n` +
      `・職業限制：牧師職業線（五轉「聖潔大主教」起，往後進階皆可使用）`
    );
  }
});


/* ===================== 五轉（牧師系）主動技：神聖祝福 ===================== */
registerJobSkill('mage5', {
  job: "mage5",
  id: "priest5_holy_blessing",
  name: "神聖祝福(五轉)",
  type: "attack",      // 走攻擊管線，但含補助效果
  role: "attack",
  isBasic: false,

  requiredJobTier: 5,
  requireJobLineFrom: "mage_priest5",  // ⭐ 五轉牧師線專屬

  level: 1,
  maxLevel: 20,
  maxTargets: 6,       // 攻擊 6 名敵人

  currentTier: 0,
  tiers: [
    {
      name: "神聖祝福",
      mpCost: 500,     // 固定 MP 消耗
      cooldown: 12,    // 你沒指定 CD，我給你 *短 CD 12 秒*（可調）
      logic: {
        basePct: 55,           // 單段基礎倍率 55%
        perLvPct: 6,           // 每級 +6%
        hits: 5,               // 5 段
        healBase: 0.20,        // 回復 20%
        healPerLv: 0.02        // 每級 +2%
      }
    }
  ],

  currentCooldown: 0,

  use(monster) {
    const t     = getActiveTier(this);
    const logic = t.logic;

    this.name     = t.name;
    this.cooldown = t.cooldown;
    this.mpCost   = t.mpCost;
    // ❗不覆蓋 maxTargets，會被 _cast() 自動處理

    const L     = Math.max(1, this.level | 0);
    const hits  = logic.hits;

    // ====== 傷害計算 ======
    const perHitPct = logic.basePct + logic.perLvPct * (L - 1);
    const perHitMul = perHitPct / 100;

    const baseAtk = Math.max(player.totalStats.atk || 1, 1);

    const totalBase = Math.floor(baseAtk * perHitMul) * hits;

    // ====== 回復效果（偽裝補助） ======
    const maxHp      = player.totalStats.hp || 1;
    const healRate   = logic.healBase + logic.healPerLv * (L - 1);
    const healAmount = Math.floor(maxHp * healRate);

    let healed = 0;

    // ⭐ 只有 HP < 70% 才會觸發
    if (player.currentHP < maxHp * 0.70) {
      player.currentHP = Math.min(player.currentHP + healAmount, maxHp);
      healed = healAmount;
    }

    // ====== 戰鬥文字 ======
    logPrepend?.(
      `✨ ${t.name} 對最多 ${this.maxTargets} 名敵人造成約 ${totalBase} 傷害` +
      `（${hits} Hit｜單 Hit 約 ${Math.round(perHitPct)}%）` +
      (healed > 0
        ? `｜發動治療效果：恢復 ${healed} HP（約 ${Math.round(healRate*100)}%）`
        : `｜HP 達 70% 以上，未觸發治療效果`)
    );

    spendAndCooldown(this, this.mpCost);
    return totalBase;   // 回傳基礎傷害，AoE 交由 Rpg_玩家
  },

  getUpgradeCost() { return 1; },

  getDescription() {
    const t     = getActiveTier(this);
    const logic = t.logic || {};
    const L     = Math.max(1, this.level | 0);

    const perHitPct = logic.basePct + logic.perLvPct * (L - 1);
    const totalPct  = perHitPct * logic.hits;

    const healRate = logic.healBase + logic.healPerLv * (L - 1);

    return (
      `${t.name}（牧師線五轉攻擊補助技能）\n` +
      `・攻擊最多 ${this.maxTargets} 名敵人，共 ${logic.hits} Hit\n` +
      `・每段約 ${perHitPct}%｜總倍率約 ${totalPct}%\n` +
      `・HP 回復：最大 HP 的 ${Math.round(healRate * 100)}%\n` +
      `・但 HP ≥ 70% 時不會觸發治療\n` +
      `・消耗 MP：${t.mpCost}｜冷卻時間：${t.cooldown} 秒\n` +
      `・職業限制：五轉「聖潔大主教」起可使用`
    );
  }
});