// ============================
// skills_thief.js（盜賊/影舞者/刺客/暗影領主）
// 規則：全為攻擊技能，無補助。升級成本 getUpgradeCost() 一律回傳 1。
// 主屬加成：LUK -> 每點 +0.2% 傷害，上限 +200%（特殊註明的技能為 +300%）。
// ============================

/** 共同：取當前 tier、LUK 加成工具 */
function _getActiveTier(s) {
  return (typeof getActiveTier === "function" && s.tiers) ? getActiveTier(s) : s;
}
function _getLukBonus(cap = 2.0) {
  const per   = 0.002; // 0.2% / LUK
  const total = (player?.baseStats?.luck || 0) + (player?.coreBonus?.luck || 0);
  return Math.min(cap, Math.max(0, total * per)); // 0 ~ cap（2.0=200% / 3.0=300%）
}
function _nowSec() {
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



// =========================
// 刺客線三轉：暗殺連鎖（10% 機率 +50% 技能最終傷害）
// =========================
registerJobSkill('thief3', {
  job: "thief3",
  id: "thief_assassin3_crit_chain",
  name: "暗殺連鎖",
  type: "attack",
  role: "attack",
  isBasic: false,

  requiredJobTier: 3,
  requireJobLineFrom: "thief_assassin3",

  level: 1,
  currentTier: 0,
  evolveLevels: [0, 100, 150],   // 三階進化

  maxLevel: 20,
  currentCooldown: 0,

  tiers: [
    {
      name: "暗殺連鎖",
      mpCost: 26,
      cooldown: 14,
      maxTargets: 4,
      hits: 4,
      dmgBase: 95,
      dmgPerLv: 3,
      maxLv: 10,
      bonusChance: 0.10,  // 10%
      bonusMultiplier: 0.50 // +50%
    },
    {
      name: "暗殺連鎖・極",
      mpCost: 26,
      cooldown: 14,
      maxTargets: 5,
      hits: 5,
      dmgBase: 105,
      dmgPerLv: 4,
      maxLv: 15,
      bonusChance: 0.10,
      bonusMultiplier: 0.50
    },
    {
      name: "暗殺連鎖・絕",
      mpCost: 26,
      cooldown: 14,
      maxTargets: 6,
      hits: 5,
      dmgBase: 115,
      dmgPerLv: 5,
      maxLv: 20,
      bonusChance: 0.10,
      bonusMultiplier: 0.50
    }
  ],

  use(monster) {
    if (typeof Skills_isUnlocked === "function" && !Skills_isUnlocked(this)) {
      alert("當前職業無法使用「暗殺連鎖」。");
      return 0;
    }

    const t = getActiveTier(this);
    const evo = getEvoLabel?.(this) || "";
    const skillName = t.name + evo;

    this.name       = skillName;
    this.mpCost     = t.mpCost;
    this.cooldown   = t.cooldown;
    this.maxTargets = t.maxTargets;

    const baseAtk = Math.max(player.totalStats.atk || 1, 1);
    const perPct  = t.dmgBase + t.dmgPerLv * this.level;
    const dmgPerHit = Math.floor(baseAtk * (perPct / 100));
    const baseDamage = dmgPerHit * t.hits;
    const totalPct   = perPct * t.hits;

    let finalDamage = baseDamage;
    let note = "";

    // === 10% 機率：本次技能最終傷害 +50% ===
    if (Math.random() < t.bonusChance) {
      finalDamage = Math.floor(baseDamage * (1 + t.bonusMultiplier));
      note = `《暗殺強化觸發：本次傷害 +${t.bonusMultiplier * 100}%》`;
    }

    logPrepend?.(
      `🗡️ ${skillName} 造成 ${finalDamage} 傷害 ` +
      `（單段 ${perPct}% × ${t.hits} Hit，合計 ${totalPct}%）${note}`
    );

    spendAndCooldown(this, this.mpCost);
    return finalDamage;
  },

  getUpgradeCost() {
    return 45 + (this.level - 1) * 15;
  },

  getDescription() {
    const t    = getActiveTier(this);
    const evo  = getEvoLabel?.(this) || "";
    const perPct   = t.dmgBase + t.dmgPerLv * this.level;
    const totalPct = perPct * t.hits;
    const lvCap    = t.maxLv;

    return (
      `${t.name}${evo}（刺客線三轉進化技能）\n` +
      `・攻擊目標：最多 ${t.maxTargets} 名敵人\n` +
      `・連擊次數：每名敵人 ${t.hits} Hit\n` +
      `・單段傷害：約 ${perPct}%｜總傷害：約 ${totalPct}%\n` +
      `・冷卻：${t.cooldown}s｜MP：${t.mpCost}\n` +
      `・等級上限：${lvCap}\n` +
      `・職業限制：刺客職業線（三轉「暗影刺客」起）\n` +
      `・特性：有 **10% 機率** 讓本次技能的**最終傷害 +50%**\n` +
      `・進化：100 等、150 等`
    );
  }
});
// =========================
// 影武者線三轉：幻影連擊（連擊再施放型 / A版）
// =========================
registerJobSkill('thief3', {
  job: "thief3",
  id: "thief_shadow3_chain_assault",
  name: "幻影連擊",
  type: "attack",
  role: "attack",
  isBasic: false,

  // 🔒 三轉 + 影武者職業線
  requiredJobTier: 3,
  requireJobLineFrom: "thief_shadow3",

  level: 1,
  currentTier: 0,
  evolveLevels: [0, 100, 150],

  maxLevel: 20,
  currentCooldown: 0,

  tiers: [
    // === Tier 0：幻影連擊 ===
    {
      name: "幻影連擊",
      mpCost: 24,
      cooldown: 13,
      maxTargets: 4,
      hits: 3,
      dmgBase: 90,
      dmgPerLv: 3,
      maxLv: 10,
      extraCastChance: 0.20   // 20% 機率觸發「第二段」
    },
    // === Tier 1：幻影連擊・極 ===
    {
      name: "幻影連擊・極",
      mpCost: 24,
      cooldown: 13,
      maxTargets: 5,
      hits: 4,
      dmgBase: 100,
      dmgPerLv: 4,
      maxLv: 20,
      extraCastChance: 0.25
    },
    // === Tier 2：幻影連擊・絕 ===
    {
      name: "幻影連擊・絕",
      mpCost: 24,
      cooldown: 10,
      maxTargets: 6,
      hits: 5,
      dmgBase: 110,
      dmgPerLv: 5,
      maxLv: 20,
      extraCastChance: 0.30
    }
  ],

use: function (monster) {
  // 安全：職業線 / 轉數檢查
  if (typeof Skills_isUnlocked === "function" &&
      !Skills_isUnlocked(this)) {
    alert("當前職業無法使用「幻影連擊」。");
    return 0;
  }

  var t   = getActiveTier(this);
  var evo = (typeof getEvoLabel === "function") ? getEvoLabel(this) : "";
  var skillName = t.name + evo;

  this.name       = skillName;
  this.mpCost     = t.mpCost;
  this.cooldown   = t.cooldown;
  this.maxTargets = t.maxTargets;

  var baseAtk = Math.max(player.totalStats.atk || 1, 1);

  var perPct     = t.dmgBase + t.dmgPerLv * this.level;
  var perHit     = perPct / 100;
  var dmgPerHit  = Math.floor(baseAtk * perHit);
  var baseDmgOne = dmgPerHit * t.hits;   // 對單一目標基礎傷害
  var totalPct   = perPct * t.hits;

  var totalDamagePerTarget = 0;

  // ⭐ 每次施放先重置標籤
  this.lastCastTag = "";

  // ===== 第一段：必定施放 =====
  totalDamagePerTarget += baseDmgOne;

  if (typeof logPrepend === "function") {
    logPrepend(
      "🌙 " + skillName + " 造成約 " + baseDmgOne + " 傷害 " +
      "（單段約 " + perPct + "% × " + t.hits + " Hit，合計約 " + totalPct + "%）"
    );
  }

  // ===== 嘗試觸發連擊 =====
  var chance = t.extraCastChance || 0;
  var mpCost = this.mpCost || t.mpCost;

  if (chance > 0 && Math.random() < chance) {
    if (typeof logPrepend === "function") {
      logPrepend("《幻影連擊觸發！嘗試追加一次攻擊》");
    }

    var curMpBeforeExtra = (typeof player.currentMP === "number")
      ? player.currentMP
      : 0;

    if (curMpBeforeExtra >= mpCost * 2) {
      // MP 夠：再施放一次技能
      var secondDmg = baseDmgOne;
      totalDamagePerTarget += secondDmg;

      // 額外扣第二次 MP（第一次由 spendAndCooldown 扣）
      player.currentMP = Math.max(0, curMpBeforeExtra - mpCost);

      // ⭐ 顯示在戰鬥 log 的標籤
      this.lastCastTag = "連擊!";

      if (typeof logPrepend === "function") {
        logPrepend(
          "🌙 " + skillName + "(連擊) 再造成約 " + secondDmg + " 傷害（第二段技能連擊）"
        );
      }
    } else {
      // MP 不足：追加普通攻擊
      var normalDmg = baseAtk;
      totalDamagePerTarget += normalDmg;

      this.lastCastTag = "普攻追擊";

      if (typeof logPrepend === "function") {
        logPrepend(
          "🌙 " + skillName +
          " MP 不足以再次施放，改以普通攻擊追加約 " + normalDmg + " 傷害"
        );
      }
    }
  }

  // 真正扣第一次技能 MP ＋ 設定冷卻
  spendAndCooldown(this, this.mpCost);

  return totalDamagePerTarget;
},

  getUpgradeCost() {
    return 45 + (this.level - 1) * 15;
  },

  getDescription() {
    const t   = getActiveTier(this);
    const evo = typeof getEvoLabel === "function" ? getEvoLabel(this) : "";

    const perPct   = t.dmgBase + t.dmgPerLv * this.level;
    const totalPct = perPct * t.hits;
    const lvCap    = t.maxLv;
    const chance   = Math.round((t.extraCastChance || 0) * 100);

    let desc =
      `${t.name}${evo}（影武者線三轉進化技能：連擊型）\n` +
      `・攻擊目標：最多 ${t.maxTargets} 名敵人\n` +
      `・連擊次數：每名敵人 ${t.hits} Hit\n` +
      `・單段傷害：約 ${perPct}%｜總傷害：約 ${totalPct}%\n` +
      `・冷卻：${t.cooldown} 秒｜MP：${t.mpCost}\n` +
      `・等級上限：${lvCap}\n` +
      `・職業限制：影武者職業線（三轉「幻影影武者」起，往後進階皆可使用）\n` +
      `・特性：有約 ${chance}% 機率觸發「幻影連擊」——\n` +
      `　MP 足夠時：再施放一次本技能（第二段傷害會另顯示一行）\n` +
      `　MP 不足時：改為追加一次普通攻擊`;

    if (this.currentTier === 0) {
      desc += `\n・進化條件：角色等級 100 / 150 會進化為更強型態`;
    }

    return desc;
  }
});

/* ==== 刺客線小招：血影連斬（爆傷強化） ==== */
registerJobSkill('thief5', {
  job: "thief5",
  id: "assassin5_blood_shadow_rush",
  name: "血影連斬(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,
  requiredJobTier: 5,

  // ⭐ 限定職業線：刺客線（thief_assassin5 往後）
  requireJobLineFrom: "thief_assassin5",

  level: 1,
  maxLevel: 20,
  maxTargets: 5,

  currentTier: 0,
  tiers: [
    {
      name: "血影連斬",
      mpCost: 24,
      cooldown: 7,
      logic: {
        basePct: 150,      // 單 Hit 基礎 150%
        perLvPct: 7,       // 每等 +7%
        hits: 5,           // 4 連擊
        lukCap: 2.2,       // LUK 上限 +220%
        bonusChance: 0.15, // 15% 機率爆傷強化
        bonusFinal: 0.50   // 爆傷強化：最終傷害 +50%
      }
    }
  ],

  currentCooldown: 0,

  use: function (monster) {
    const t = _getActiveTier(this);
    this.name     = t.name;
    this.cooldown = t.cooldown;
    this.mpCost   = t.mpCost;
    this.maxTargets = t.maxTargets;

    const L     = Math.max(1, this.level | 0);
    const logic = t.logic || {};
    const hits  = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const perHitMul = perHitPct / 100;

    const baseAtk  = Math.max(player.totalStats?.atk || 1, 1);
    const lukBonus = _getLukBonus(logic.lukCap || 0);

    const totalBase = Math.floor(baseAtk * perHitMul * (1 + lukBonus)) * hits;

    // 每次施放先清空標籤
    this.lastCastTag = "";

    // 爆傷強化
    const CHANCE = logic.bonusChance || 0;
    const BONUS  = logic.bonusFinal  || 0;
    let finalDmg = totalBase;
    let extraNote = "";

    if (CHANCE > 0 && Math.random() < CHANCE) {
      finalDmg = Math.floor(totalBase * (1 + BONUS));
      extraNote = "《爆傷強化觸發：本次技能傷害 +50%》";
      this.lastCastTag = "爆傷+50%";
    }

    if (typeof logPrepend === "function") {
      logPrepend(
        `🩸 ${t.name} 造成總計約 ${finalDmg} 傷害` +
        `（${hits} 連擊｜單 Hit 約 ${Math.round(perHitPct)}%｜LUK 加成約 ${Math.round(lukBonus * 100)}%）` +
        (extraNote ? " " + extraNote : "")
      );
    }

    spendAndCooldown(this, this.mpCost);
    return finalDmg;
  },

  getUpgradeCost: function () { return 1; },

  getDescription: function () {
    const t = _getActiveTier(this);
    const L = Math.max(1, this.level | 0);
    const logic = t.logic || {};
    const hits  = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const totalPct  = perHitPct * hits;

    const lukCapPct   = Math.round((logic.lukCap || 0) * 100);
    const extraChance = Math.round((logic.bonusChance || 0) * 100);
    const extraBonus  = Math.round((logic.bonusFinal  || 0) * 100);

    return (
      `${t.name}（刺客線五轉主力技能）\n` +
      `・對前方最多 ${this.maxTargets} 名敵人進行 ${hits} 連擊\n` +
      `・目前每擊約 ${perHitPct}% ，合計約 ${totalPct}% 傷害（會隨技能等級提升）\n` +
      `・可從 LUK 獲得額外加成，上限約 +${lukCapPct}%\n` +
      `・有 ${extraChance}% 機率觸發「爆傷強化」，使本次最終傷害再提高約 ${extraBonus}%\n` +
      `・冷卻時間：約 ${t.cooldown} 秒｜消耗 MP：${t.mpCost}\n` +
      `・職業限制：刺客職業線（五轉「幻影刺皇」起，往後進階皆可使用）`
    );
  }
});
/* ==== 刺客線小招：血影連斬（爆傷強化） ==== */
registerJobSkill('thief5', {
  job: "thief5",
  id: "assassin5_blood_shadow_rush",
  name: "血影連斬(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,
  requiredJobTier: 5,

  // ⭐ 限定職業線：刺客線（thief_assassin5 往後）
  requireJobLineFrom: "thief_assassin5",

  level: 1,
  maxLevel: 20,
  maxTargets: 5,   // 外層先給一個預設（給 UI 看）

  currentTier: 0,
  tiers: [
    {
      name: "血影連斬",
      mpCost: 20,
      cooldown: 7,
      maxTargets: 5,   // ⭐ 重點：tier 裡也寫死為 5
      logic: {
        basePct: 150,      // 單 Hit 基礎 150%
        perLvPct: 8,       // 每等 +8%
        hits: 5,           // 5 連擊
        lukCap: 2.2,       // LUK 上限 +220%
        bonusChance: 0.15, // 15% 機率爆傷強化
        bonusFinal: 0.50   // 爆傷強化：最終傷害 +50%
      }
    }
  ],

  currentCooldown: 0,

  use: function (monster) {
    const t = _getActiveTier(this);
    this.name     = t.name;
    this.cooldown = t.cooldown;
    this.mpCost   = t.mpCost;
    // ❌ 不要動 this.maxTargets，交給 playerSkills.js 的 _cast() 處理

    const L     = Math.max(1, this.level | 0);
    const logic = t.logic || {};
    const hits  = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const perHitMul = perHitPct / 100;

    const baseAtk  = Math.max(player.totalStats?.atk || 1, 1);
    const lukBonus = _getLukBonus(logic.lukCap || 0);

    const totalBase = Math.floor(baseAtk * perHitMul * (1 + lukBonus)) * hits;

    // 每次施放先清空標籤
    this.lastCastTag = "";

    // 爆傷強化
    const CHANCE = logic.bonusChance || 0;
    const BONUS  = logic.bonusFinal  || 0;
    let finalDmg = totalBase;
    let extraNote = "";

    if (CHANCE > 0 && Math.random() < CHANCE) {
      finalDmg = Math.floor(totalBase * (1 + BONUS));
      extraNote = "《爆傷強化觸發：本次技能傷害 +50%》";
      this.lastCastTag = "爆傷+50%";
    }

    if (typeof logPrepend === "function") {
      logPrepend(
        `🩸 ${t.name} 造成總計約 ${finalDmg} 傷害` +
        `（${hits} 連擊｜單 Hit 約 ${Math.round(perHitPct)}%｜LUK 加成約 ${Math.round(lukBonus * 100)}%）` +
        (extraNote ? " " + extraNote : "")
      );
    }

    spendAndCooldown(this, this.mpCost);
    return finalDmg;
  },

  getUpgradeCost: function () { return 1; },

  getDescription: function () {
    const t = _getActiveTier(this);
    const L = Math.max(1, this.level | 0);
    const logic = t.logic || {};
    const hits  = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const totalPct  = perHitPct * hits;

    const lukCapPct   = Math.round((logic.lukCap || 0) * 100);
    const extraChance = Math.round((logic.bonusChance || 0) * 100);
    const extraBonus  = Math.round((logic.bonusFinal  || 0) * 100);

    return (
      `${t.name}（刺客線五轉主力技能）\n` +
      `・對前方最多 ${this.maxTargets} 名敵人進行 ${hits} 連擊\n` +
      `・目前每擊約 ${perHitPct}% ，合計約 ${totalPct}% 傷害（會隨技能等級提升）\n` +
      `・可從 LUK 獲得額外加成，上限約 +${lukCapPct}%\n` +
      `・有 ${extraChance}% 機率觸發「爆傷強化」，使本次最終傷害再提高約 ${extraBonus}%\n` +
      `・冷卻時間：約 ${t.cooldown} 秒｜消耗 MP：${t.mpCost}\n` +
      `・職業限制：刺客職業線（五轉「幻影刺皇」起，往後進階皆可使用）`
    );
  }
});
/* ==== 刺客線大招：血影處決（高爆發） ==== */
registerJobSkill('thief5', {
  job: "thief5",
  id: "assassin5_blood_execution",
  name: "血影處決(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,
  requiredJobTier: 5,

  requireJobLineFrom: "thief_assassin5",

  level: 1,
  maxLevel: 20,
  maxTargets: 8,

  mpCost: 65,
  cooldown: 280,  // 比 300 秒略短一點

  logic: {
    basePct: 300,     // 單 Hit 基礎 300%
    perLvPct: 12,     // 每等 +12%
    hits: 5,          // 5 段處決斬
    lukCap: 3.0,      // LUK 上限 +300%
    bonusChance: 0.25,// 25% 暗殺強化
    bonusFinal: 0.80  // 暗殺強化：最終傷害 +80%
  },

  currentCooldown: 0,

  use: function (monster) {
    const L     = Math.max(1, this.level | 0);
    const logic = this.logic || {};
    const hits  = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const perHitMul = perHitPct / 100;

    const baseAtk  = Math.max(player.totalStats?.atk || 1, 1);
    const lukBonus = _getLukBonus(logic.lukCap || 0);

    const totalBase = Math.floor(baseAtk * perHitMul * (1 + lukBonus)) * hits;

    this.lastCastTag = "";

    const CHANCE = logic.bonusChance || 0;
    const BONUS  = logic.bonusFinal  || 0;
    let finalDmg = totalBase;
    let extraNote = "";

    if (CHANCE > 0 && Math.random() < CHANCE) {
      finalDmg = Math.floor(totalBase * (1 + BONUS));
      extraNote = "《暗殺強化觸發：處決傷害暴增》";
      this.lastCastTag = "暗殺強化";
    }

    if (typeof logPrepend === "function") {
      logPrepend(
        `🩸 ${this.name} 引爆 ${hits} 段處決斬擊，總傷害約 ${finalDmg}` +
        `（單段約 ${Math.round(perHitPct)}%｜LUK 加成約 ${Math.round(lukBonus * 100)}%）` +
        (extraNote ? " " + extraNote : "")
      );
    }

    spendAndCooldown(this, this.mpCost);
    return finalDmg;
  },

  getUpgradeCost: function () { return 1; },

  getDescription: function () {
    const L     = Math.max(1, this.level | 0);
    const logic = this.logic || {};
    const hits  = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const totalPct  = perHitPct * hits;

    const lukCapPct   = Math.round((logic.lukCap || 0) * 100);
    const extraChance = Math.round((logic.bonusChance || 0) * 100);
    const extraBonus  = Math.round((logic.bonusFinal  || 0) * 100);

    return (
      `${this.name}（刺客線五轉最終大招）\n` +
      `・對最多 ${this.maxTargets} 名敵人降下 ${hits} 重處決斬擊\n` +
      `・目前每段約 ${perHitPct}% ，合計約 ${totalPct}% 傷害（會隨技能等級提升）\n` +
      `・可從 LUK 獲得大幅度額外加成（最高約 +${lukCapPct}%）\n` +
      `・有 ${extraChance}% 機率觸發「暗殺強化」，使本次最終傷害再提高約 ${extraBonus}%\n` +
      `・冷卻時間：約 ${this.cooldown} 秒｜消耗 MP：${this.mpCost}\n` +
      `・職業限制：刺客職業線（五轉「幻影刺皇」起，往後進階皆可使用）`
    );
  }
});
/* ==== 影武者線小招：幻影連牙（短 CD 連擊技） ==== */
registerJobSkill('thief5', {
  job: "thief5",
  id: "shadow5_phantom_fang",
  name: "幻影連牙(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,
  requiredJobTier: 5,

  // ⭐ 限定職業線：影武者線（thief_shadow5 往後）
  requireJobLineFrom: "thief_shadow5",

  level: 1,
  maxLevel: 20,
  maxTargets: 6,   // UI 預設

  currentTier: 0,
  tiers: [
    {
      name: "幻影連牙",
      mpCost: 22,
      cooldown: 8,
      maxTargets: 6,   // ✅ 寫在 tier 裡，給 _cast() 用
      logic: {
        basePct: 140,       // 單 Hit 基礎 140%
        perLvPct: 7,        // 每等 +7%
        hits: 5,            // 5 連擊
        lukCap: 2.5,        // LUK 上限 +250%
        chainChance: 0.25   // 25% 機率「再打一次同等傷害」
      }
    }
  ],

  currentCooldown: 0,

  use: function (monster) {
    const t = _getActiveTier(this);
    this.name     = t.name;
    this.cooldown = t.cooldown;
    this.mpCost   = t.mpCost;
    // ❌ 不要動 this.maxTargets，交給 playerSkills._cast() 處理

    const L     = Math.max(1, this.level | 0);
    const logic = t.logic || {};
    const hits  = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const perHitMul = perHitPct / 100;

    const baseAtk  = Math.max(player.totalStats?.atk || 1, 1);
    const lukBonus = _getLukBonus(logic.lukCap || 0);

    // 一輪攻擊的總傷害（還沒連擊加成）
    const baseTotal = Math.floor(baseAtk * perHitMul * (1 + lukBonus)) * hits;

    // 每次施放重設標籤
    this.lastCastTag = "";

    let finalDmg  = baseTotal;
    let extraNote = "";

    // ⭐ 連擊特性：25% 機率再打一輪同樣的傷害（等同 total ×2）
    const CHAIN = logic.chainChance || 0;
    if (CHAIN > 0 && Math.random() < CHAIN) {
      finalDmg  = baseTotal * 2;
      extraNote = "《連擊觸發：再追加一輪攻擊》";
      this.lastCastTag = "連擊";
    }

    logPrepend?.(
      `🌙 ${t.name} 造成總計約 ${finalDmg} 傷害` +
      `（每輪 ${hits} 連擊｜單 Hit 約 ${Math.round(perHitPct)}%｜LUK 加成約 ${Math.round(lukBonus * 100)}%）` +
      (extraNote ? " " + extraNote : "")
    );

    spendAndCooldown(this, this.mpCost);
    return finalDmg;
  },

  getUpgradeCost: function () { return 1; },

  getDescription: function () {
    const t     = _getActiveTier(this);
    const L     = Math.max(1, this.level | 0);
    const logic = t.logic || {};
    const hits  = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const totalPct  = perHitPct * hits;

    const lukCapPct   = Math.round((logic.lukCap || 0) * 100);
    const extraChance = Math.round((logic.chainChance || 0) * 100);

    return (
      `${t.name}（影武者線五轉主力技能）\n` +
      `・對前方最多 ${this.maxTargets} 名敵人進行 ${hits} 連擊\n` +
      `・目前每擊約 ${perHitPct}% ，合計約 ${totalPct}% 傷害（會隨技能等級提升）\n` +
      `・可從 LUK 獲得額外加成，上限約 +${lukCapPct}%\n` +
      `・有 ${extraChance}% 機率觸發「連擊」，再追加一輪同等傷害（等於本次總傷害 ×2）\n` +
      `・冷卻時間：約 ${t.cooldown} 秒｜消耗 MP：${t.mpCost}\n` +
      `・職業限制：影武者職業線（五轉「暗影之王」起，往後進階皆可使用）`
    );
  }
});
/* ==== 影武者線大招：絕影終獄（劇毒 + 流血） ==== */
registerJobSkill('thief5', {
  job: "thief5",
  id: "shadow5_abyss_execution",
  name: "絕影終獄(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,
  requiredJobTier: 5,

  requireJobLineFrom: "thief_shadow5",

  level: 1,
  maxLevel: 20,
  maxTargets: 10,

  mpCost: 60,
  cooldown: 300,

  logic: {
    basePct: 260,       // 單 Hit 約 260%
    perLvPct: 10,       // 每等 +10%
    hits: 6,            // 6 段爆發
    lukCap: 3.0,        // LUK 上限 +300%

    dotPercent: 0.30,   // 將最終傷害的 30% 轉為劇毒 DoT
    bleedMul: 0.12,     // 流血：依玩家 ATK 比例
    bleedTurns: 3,      // 流血回合數

    bonusChance: 0.25,  // 25% 暗影暴走機率
    bonusFinal: 0.40    // 暗影暴走：最終傷害 +40%
  },

  currentCooldown: 0,

  use: function (monster) {
    const L     = Math.max(1, this.level | 0);
    const logic = this.logic || {};
    const hits  = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const perHitMul = perHitPct / 100;

    const baseAtk  = Math.max(player.totalStats?.atk || 1, 1);
    const lukBonus = _getLukBonus(logic.lukCap || 0);

    const totalBase = Math.floor(baseAtk * perHitMul * (1 + lukBonus)) * hits;

    this.lastCastTag = "";

    const CHANCE = logic.bonusChance || 0;
    const BONUS  = logic.bonusFinal  || 0;
    let finalDmg = totalBase;
    let extraNote = "";

    if (CHANCE > 0 && Math.random() < CHANCE) {
      finalDmg = Math.floor(totalBase * (1 + BONUS));
      extraNote = "《暗影暴走觸發：最終傷害暴漲》";
      this.lastCastTag = "暗影暴走";
    } else {
      this.lastCastTag = "劇毒&流血";
    }

    const nowSec = _nowSec();

    // 劇毒：依照「本次最終傷害」的一定比例轉成 DoT
    const dotDmg = Math.floor(finalDmg * (logic.dotPercent || 0));
    if (dotDmg > 0 && typeof global.applyStatusToMonster === "function") {
      global.applyStatusToMonster(monster, "deadly_poison", 3, dotDmg, nowSec);
    }

    // 流血：依玩家 ATK 比例
    if (typeof global.applyStatusToMonster === "function") {
      global.applyStatusToMonster(
        monster,
        "bleed",
        logic.bleedTurns || 0,
        logic.bleedMul   || 0,
        nowSec
      );
    }

    logPrepend?.(
      `🌑 ${this.name} 引爆 ${hits} 段終獄斬擊，總傷害約 ${finalDmg}` +
      `（單段約 ${Math.round(perHitPct)}%｜LUK 加成約 ${Math.round(lukBonus * 100)}%）` +
      `，並施加劇毒與流血！` +
      (extraNote ? " " + extraNote : "")
    );

    spendAndCooldown(this, this.mpCost);
    return finalDmg;
  },

  getUpgradeCost: function () { return 1; },

  getDescription: function () {
    const L     = Math.max(1, this.level | 0);
    const logic = this.logic || {};
    const hits  = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const totalPct  = perHitPct * hits;

    const lukCapPct   = Math.round((logic.lukCap || 0) * 100);
    const dotPct      = Math.round((logic.dotPercent || 0) * 100);
    const bleedTurns  = logic.bleedTurns || 0;
    const extraChance = Math.round((logic.bonusChance || 0) * 100);
    const extraBonus  = Math.round((logic.bonusFinal  || 0) * 100);

    return (
      `${this.name}（影武者線五轉最終大招）\n` +
      `・對最多 ${this.maxTargets} 名敵人降下 ${hits} 重暗影審判\n` +
      `・目前每段約 ${perHitPct}% ，合計約 ${totalPct}% 傷害（會隨技能等級提升）\n` +
      `・可從 LUK 獲得大幅度額外加成（最高約 +${lukCapPct}%）\n` +
      `・有 ${extraChance}% 機率觸發「暗影暴走」，使本次最終傷害再提高約 ${extraBonus}%\n` +
      `・額外效果：將本次傷害約 ${dotPct}% 轉化為劇毒持續傷害，並附加流血 ${bleedTurns} 回合\n` +
      `・冷卻時間：約 ${this.cooldown} 秒｜消耗 MP：${this.mpCost}\n` +
      `・職業限制：影武者職業線（五轉「暗影之王」起，往後進階皆可使用）`
    );
  }
});