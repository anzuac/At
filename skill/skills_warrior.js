// === skills_warrior.js ===
// 劍士 / 進階職業 主動攻擊技能
// 重點：
// 1) 技能內「不直接扣血」，只回傳數值傷害
// 2) 基礎攻擊力用 player.totalStats.atk，不先扣防
// 3) 防禦 / 護盾 / 爆擊 / 傷害乘區都交給 Rpg_玩家.js 處理

// 這些工具方法假設已在其他檔案定義：
// - getActiveTier(skill)
// - _getStrBonusWithCap(cap)
// - logPrepend
// - spendAndCooldown(skill, mpCost)

// ==========================
// 斬擊（一轉）：雙段斬擊
// ==========================
// 小工具：依照 cap 計算 STR 加成（每點 STR +0.2%）
function _getStrBonusWithCap(cap) {
  const RATE = 0.002; // 0.2%/點
  const totalSTR = (player?.baseStats?.str || 0) + (player?.coreBonus?.str || 0);
  return Math.min(Math.max(0, cap || 0), Math.max(0, totalSTR * RATE)); // 回傳小數 0 ~ cap
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
// 狂戰線三轉技能：無雙劍舞
// =========================
registerJobSkill('warrior3', {
  job: "warrior3",
  id: "warrior_berserker_unrivaled_dance",
  name: "無雙劍舞",
  type: "attack",
  role: "attack",
  isBasic: false,

  // 🔒 限制：從狂戰將軍這一轉開始，整條狂戰士線（3~6轉）都能用
  // 需要在 jobs 裡有 warrior_berserker3 這個職業（你已經有）
  requireJobLineFrom: "warrior_berserker3",
  requiredJobTier: 3, // 三轉以上解鎖

  // === 初始等級設定 ===
  level: 1,

  // 進化：0 → 1 → 2（100 等 / 150 等）
  currentTier: 0,
  evolveLevels: [0, 100, 150], // Tier0 / Tier1 / Tier2

  // 全局等級上限（實際上看各 tier 的 maxLv）
  maxLevel: 20,

  currentCooldown: 0,

  // ===== 三階形態 =====
  tiers: [
    // === Tier 0：無雙劍舞（未進化） ===
    {
      name: "無雙劍舞",
      mpCost: 35,
      cooldown: 18,
      maxTargets: 5,
      hits: 3,
      dmgBase: 80, // 單段基礎％
      dmgPerLv: 2.5, // 每級增加％
      maxLv: 10,
      extraChance: 0, // 無特性
      extraBonus: 0
    },

    // === Tier 1：無雙亂斬‧極（第一次進化，100 等） ===
    {
      name: "無雙亂斬‧極",
      mpCost: 35,
      cooldown: 18,
      maxTargets: 6,
      hits: 4,
      dmgBase: 100,
      dmgPerLv: 3,
      maxLv: 15,
      extraChance: 0.25, // 25% 機率
      extraBonus: 0.25 // 最終傷害 +25%
    },

    // === Tier 2：無雙亂斬‧絕（第二次進化，150 等） ===
    {
      name: "無雙亂斬‧絕",
      mpCost: 35,
      cooldown: 18,
      maxTargets: 7,
      hits: 5,
      dmgBase: 115,
      dmgPerLv: 4.5,
      maxLv: 20,
      extraChance: 0.35, // 35% 機率
      extraBonus: 0.35 // 最終傷害 +35%
    }
  ],

  // ===== 使用邏輯 =====
  use(monster) {
    // 再保險：施放前確認職業線＆轉數條件
    if (typeof Skills_isUnlocked === "function" &&
      !Skills_isUnlocked(this)) {
      alert("當前職業無法使用「無雙劍舞」。");
      return 0;
    }

    const t = getActiveTier(this);

    // 更新技能顯示
    const evoLabel = typeof getEvoLabel === "function" ? getEvoLabel(this) : "";
    const skillName = t.name + evoLabel;

    this.name = skillName;
    this.mpCost = t.mpCost;
    this.cooldown = t.cooldown;
    this.maxTargets = t.maxTargets;

    // 基礎攻擊力 + 力量加成
    const baseAtk = Math.max(player.totalStats.atk || 1, 1);
    const strBonus = typeof _getStrBonusWithCap === "function" ?
      (_getStrBonusWithCap(1.0) || 0) :
      0;

    // === 計算傷害倍率 ===
    const perPct = t.dmgBase + t.dmgPerLv * this.level; // 單段％
    const perHit = perPct / 100;

    const dmgPerHit = Math.floor(baseAtk * perHit * (1 + strBonus));
    let dmgPerTarget = dmgPerHit * t.hits;

    // === 特性：進化後才會有的最終傷害加成 ===
    const bonusChance = t.extraChance || 0;
    const bonusDmg = t.extraBonus || 0;
    let proc = false;

    if (bonusChance > 0 && Math.random() < bonusChance) {
      dmgPerTarget = Math.floor(dmgPerTarget * (1 + bonusDmg));
      proc = true;
    }

    // 戰鬥Log
    if (typeof logPrepend === "function") {
      logPrepend(
        `⚔️ ${skillName} 造成每隻約 ${dmgPerTarget} 傷害 ` +
        `（單段約 ${perPct}% × ${t.hits} Hit，合計約 ${perPct * t.hits}%｜STR加成 ${Math.round(strBonus * 100)}%）` +
        (proc ? `《無雙亂斬特性觸發：傷害 +${Math.round(bonusDmg * 100)}%》` : "")
      );
    }

    spendAndCooldown(this, this.mpCost);
    return dmgPerTarget;
  },

  // 升級花費
  getUpgradeCost() {
    return 50 + (this.level - 1) * 15;
  },

  // 描述
  getDescription() {
    const t = getActiveTier(this);
    const evoLabel = typeof getEvoLabel === "function" ? getEvoLabel(this) : "";
    const lvCap = t.maxLv || 10;
    const nextEvoLv = typeof getNextEvoLevel === "function" ?
      getNextEvoLevel(this) :
      null;

    const perPct = t.dmgBase + t.dmgPerLv * this.level; // 單段％
    const totalPct = perPct * t.hits; // 總％

    let desc =
      `${t.name}${evoLabel}（狂戰線三轉技能）\n` +
      `・攻擊目標：${t.maxTargets} 名敵人\n` +
      `・連擊次數：每名敵人 ${t.hits} Hit\n` +
      `・單段傷害：約 ${perPct}%｜總傷害：約 ${totalPct}%\n` +
      `・消耗 MP：${t.mpCost}｜冷卻：${t.cooldown} 秒\n` +
      `・目前等級上限：${lvCap} 級\n` +
      `・職業限制：狂戰士職業線（三轉「狂戰將軍」起，往後進階皆可使用）`;

    if (t.extraChance > 0) {
      desc += `\n・特性：${Math.round(t.extraChance * 100)}% 機率讓最終傷害額外提高 ${Math.round(t.extraBonus * 100)}%`;
    }

    if (nextEvoLv) {
      desc += `\n・下一次進化：達到等級 ${nextEvoLv}`;
    } else {
      desc += `\n・已達最終進化階段`;
    }

    return desc;
  }
});
// =========================
// 盾騎線三轉技能：聖盾審判（吸血版）
// =========================
registerJobSkill('warrior3', {
  job: "warrior3",
  id: "warrior_guardian_holy_judgment",
  name: "聖盾審判",
  type: "attack",
  role: "attack",
  isBasic: false,

  // 🔒 限制：從聖盾騎士開始，整條盾騎線（三轉～六轉）都能用
  requireJobLineFrom: "warrior_guardian3",
  requiredJobTier: 3,   // 三轉以上

  // === 初始等級設定 ===
  level: 1,

  // 進化：0 → 1 → 2（100 等 / 150 等）
  currentTier: 0,
  evolveLevels: [0, 100, 150],

  maxLevel: 20,
  currentCooldown: 0,

  tiers: [
    // === Tier 0：聖盾審判（未進化） ===
    {
      name: "聖盾審判",
      mpCost: 30,
      cooldown: 20,
      maxTargets: 4,
      hits: 4,
      dmgBase: 80,
      dmgPerLv: 3,
      maxLv: 10,
      // 🔹 回復「本次傷害的 3%」，但不超過最大 HP 的 0.3%
      healRatio: 0.02,    // 3% of damage
      healMaxPct: 0.002   // 0.3% of max HP
    },

    // === Tier 1：聖盾裁決‧煌（第一次進化，100 等） ===
    {
      name: "聖盾裁決‧煌",
      mpCost: 30,
      cooldown: 20,
      maxTargets: 5,
      hits: 5,
      dmgBase: 100,
      dmgPerLv: 4,
      maxLv: 15,
      // 🔹 回復「本次傷害的 6%」，上限 0.7% 最大 HP
      healRatio: 0.035,
      healMaxPct: 0.004
    },

    // === Tier 2：聖盾裁決‧絕（第二次進化，150 等） ===
    {
      name: "聖盾裁決‧絕",
      mpCost: 30,
      cooldown: 20,
      maxTargets: 6,
      hits: 5,
      dmgBase: 110,
      dmgPerLv: 5,
      maxLv: 20,
      // 🔹 回復「本次傷害的 10%」，上限 1.5% 最大 HP
      healRatio: 0.06,
      healMaxPct: 0.006
    }
  ],

use(monster) {
  // 再保險：確認職業線 / 轉數條件
  if (typeof Skills_isUnlocked === "function" &&
    !Skills_isUnlocked(this)) {
    alert("當前職業無法使用「聖盾審判」。");
    return 0;
  }

  const t = getActiveTier(this);

  const evoLabel = (typeof getEvoLabel === "function") ? getEvoLabel(this) : "";
  const skillName = t.name + evoLabel;

  this.name = skillName;
  this.mpCost = t.mpCost;
  this.cooldown = t.cooldown;
  this.maxTargets = t.maxTargets;

  const baseAtk = Math.max(player.totalStats.atk || 1, 1);
  const strBonus = (typeof _getStrBonusWithCap === "function") ?
    (_getStrBonusWithCap(1.0) || 0) :
    0;

  const perPct = t.dmgBase + t.dmgPerLv * this.level;
  const perHit = perPct / 100;

  const dmgPerHit = Math.floor(baseAtk * perHit * (1 + strBonus));
  const dmgPerTarget = dmgPerHit * t.hits; // 預估對「單一目標」的總傷害

  // ===== 攻擊後回復自身：傷害 X 比例，但上限定在最大 HP * healMaxPct =====
  const maxHp = player.totalStats.hp || 1;
  const healRatio = t.healRatio || 0; // 對「這次傷害」的比例
  const healCap = t.healMaxPct || 0; // 對「最大 HP」的上限

  // 用「對 1 隻敵人的傷害」作為計算基準，避免 AoE 太誇張
  const rawHeal = dmgPerTarget * healRatio;
  const maxHeal = maxHp * healCap;
  const healAmt = Math.floor(Math.min(rawHeal, maxHeal));

  if (typeof player.currentHP === "number" && healAmt > 0) {
    player.currentHP = Math.min(player.currentHP + healAmt, maxHp);
  }

  // ⭐ 給戰鬥摘要用的標籤：顯示本次回復
  if (healAmt > 0) {
    // 會變成：聖盾審判（+532 HP）造成 XXXX 傷害
    this.lastCastTag = "+" + healAmt + " HP";
  } else {
    this.lastCastTag = ""; // 沒有回就不顯示
  }

  // 🔍 log 中清楚顯示本次恢復量（詳細戰鬥 log）
  if (typeof logPrepend === "function") {
    logPrepend(
      `🛡️ ${skillName} 對每隻造成約 ${dmgPerTarget} 傷害 ` +
      `（單段約 ${perPct}% × ${t.hits} Hit，合計約 ${perPct * t.hits}%｜STR加成 ${Math.round(strBonus * 100)}%）` +
      `；本次實際回復 ${healAmt} HP ` +
      `（理論為傷害的 ${Math.round(healRatio * 100)}%，但上限為最大HP的 ${Math.round(healCap * 1000) / 10}%）`
    );
  }

  spendAndCooldown(this, this.mpCost);
  return dmgPerTarget;
},

  // 升級花費
  getUpgradeCost() {
    return 50 + (this.level - 1) * 15;
  },

  // 描述
  getDescription() {
    const t         = getActiveTier(this);
    const evoLabel  = typeof getEvoLabel === "function" ? getEvoLabel(this) : "";
    const lvCap     = t.maxLv || 10;
    const nextEvoLv = typeof getNextEvoLevel === "function"
      ? getNextEvoLevel(this)
      : null;

    const perPct   = t.dmgBase + t.dmgPerLv * this.level;
    const totalPct = perPct * t.hits;

    const healRatio = t.healRatio || 0;
    const healCap   = t.healMaxPct || 0;

    let desc =
      `${t.name}${evoLabel}（盾騎士線三轉技能）\n` +
      `・攻擊目標：${t.maxTargets} 名敵人\n` +
      `・連擊次數：每名敵人 ${t.hits} Hit\n` +
      `・單段傷害：約 ${perPct}%｜總傷害：約 ${totalPct}%\n` +
      `・消耗 MP：${t.mpCost}｜冷卻：${t.cooldown} 秒\n` +
      `・目前等級上限：${lvCap} 級\n` +
      `・職業限制：盾騎士職業線（三轉「聖盾騎士」起，往後進階皆可使用)\n` +
      `・效果：每次發動後回復「本次對單一目標的總傷害」約 ${Math.round(healRatio * 100)}%，` +
      `但回復量最多不超過最大 HP 的 ${Math.round(healCap * 1000) / 10}%\n` +
      `　（實際數值會在戰鬥記錄中顯示）`;

    if (nextEvoLv) {
      desc += `\n・下一次進化：達到等級 ${nextEvoLv}`;
    } else {
      desc += `\n・已達最終進化階段`;
    }

    return desc;
  }
});


/* ===================== 狂戰線五轉技能：神域連斬・狂 ===================== */
registerJobSkill('warrior5', {
  job: "warrior5",
  id: "berserker5_divine_combo",
  name: "神域連斬・狂(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  // 五轉 + 狂戰職業線（從 warroir_berserker5 往後）
  requiredJobTier: 5,
  requireJobLineFrom: "warrior_berserker5",

  level: 1,
  maxLevel: 20,
  maxTargets: 6,

  currentTier: 0,
  tiers: [
    {
      name: "神域連斬・狂",
      mpCost: 30,
      cooldown: 8,
      logic: {
        // 偏高但穩定成長
        damageMultiplier: 2.30,  // 基礎約 230%
        levelMultiplier: 0.10,   // 每級略微成長
        hits: 3,                 // 3 連斬
        strCap: 3.5              // STR 加成上限 +350%
      }
    }
  ],

  currentCooldown: 0,

  use(monster) {
    const t = getActiveTier(this);
    this.name     = t.name;
    this.logic    = t.logic;
    this.cooldown = Number(t.cooldown || 0);

    const mpGrow = Number(t.logic && t.logic.mpCostLevelGrowth || 0) *
                   Math.max(0, (this.level || 1) - 1);
    this.mpCost  = (t.mpCost || 0) + mpGrow;

    const L         = Math.max(1, this.level | 0);
    const dmgMul    = Number(t.logic.damageMultiplier || 0);
    const lvMul     = Number(t.logic.levelMultiplier || 0);
    const perHitMul = dmgMul + lvMul * (L - 1);
    const hits      = Number(t.logic.hits || 1);
    const baseAtk   = Math.max(player.totalStats.atk || 1, 1);

    const cap      = Number(t.logic.strCap || 3.5);
    const strBonus = _getStrBonusWithCap(cap); // 最高 +350% STR 加成

    const total = Math.floor(baseAtk * perHitMul * (1 + strBonus)) * hits;

    // ★ 20% 機率，最終傷害再提高 30%
    let finalDmg = total;
    let extraNote = "";
    const CHANCE = 0.20;
    const BONUS  = 0.30;

    if (Math.random() < CHANCE) {
      finalDmg = Math.floor(total * (1 + BONUS));
      extraNote = "（神域加護觸發：最終傷害提升）";
    }

    logPrepend?.(
      `⚔️ ${this.name} 造成 ${finalDmg} 傷害（${hits} 連斬）` +
      `｜STR 加成約 ${Math.round(strBonus * 100)}%｜` +
      `有 20% 機率額外 +30% 最終傷害 ${extraNote}`
    );

    spendAndCooldown(this, this.mpCost);
    return finalDmg;
  },

  getUpgradeCost() { return 1; },

  getDescription() {
    const t    = getActiveTier(this);
    const L    = Math.max(1, this.level | 0);
    const hits = Number(t.logic.hits || 1);

    const perHitMul = (Number(t.logic.damageMultiplier || 0)) +
                      (Number(t.logic.levelMultiplier || 0) * (L - 1));

    const per   = Math.round(perHitMul * 100);
    const total = Math.round(perHitMul * hits * 100);
    const cap   = Math.round((t.logic.strCap || 0) * 100);

    return (
      "狂戰士線五轉高速近戰主力技能。\n" +
      "・對前方最多 " + this.maxTargets + " 名敵人進行 " + hits + " 連斬\n" +
      "・目前每段約 " + per + "%，合計約 " + total + "% 傷害\n" +
      "・可從力量獲得額外加成，上限約 +" + cap + "%\n" +
      "・有 20% 機率讓本次最終傷害再提升約 30%\n" +
      "・冷卻時間：" + t.cooldown + " 秒｜消耗 MP：" + t.mpCost + "\n" +
      "・職業限制：狂戰士職業線（五轉「狂戰戰皇」起，往後進階皆可使用）"
    );
  }
});

/* ===================== 狂戰線五轉大招：血獄狂嵐(五轉) ===================== */
registerJobSkill('warrior5', {
  job: "warrior5",
  id: "berserker5_blood_storm",
  name: "血獄狂嵐(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  // 五轉 + 狂戰職業線（從 warrior_berserker5 往後都能用）
  requiredJobTier: 5,
  requireJobLineFrom: "warrior_berserker5",

  level: 1,
  maxLevel: 20,
  maxTargets: 12,

  mpCost: 85,
  cooldown: 240,      // 大招，4 分鐘 CD

  logic: {
    // 狂戰大招：比一般大招更高爆發
    damageMultiplier: 3.60,  // 基礎約 360%
    levelMultiplier: 0.13,   // 隨等級提升威力
    hits: 6,                 // 6 段爆發
    strCap: 4.2              // STR 加成上限 +420%
  },

  currentCooldown: 0,

  use (monster) {
    // 安全：職業線 / 轉數檢查
    if (typeof Skills_isUnlocked === "function" &&
        !Skills_isUnlocked(this)) {
      alert("當前職業無法使用「血獄狂嵐」。");
      return 0;
    }

    const L         = Math.max(1, this.level | 0);
    const baseMul   = Number(this.logic && this.logic.damageMultiplier || 0);
    const lm        = Number(this.logic && this.logic.levelMultiplier || 0);
    const hits      = Number(this.logic && this.logic.hits || 1);
    const perHitMul = baseMul + lm * (L - 1);
    const baseAtk   = Math.max(player.totalStats.atk || 1, 1);

    const cap      = Number(this.logic && this.logic.strCap || 4.2);
    const strBonus = typeof _getStrBonusWithCap === "function"
      ? _getStrBonusWithCap(cap)
      : 0;

    const total = Math.floor(baseAtk * perHitMul * (1 + strBonus)) * hits;

    // ★ 25% 機率，最終傷害再提高 40%（比五轉主力技更瘋）
    let finalDmg  = total;
    let extraNote = "";
    const CHANCE  = 0.25;
    const BONUS   = 0.40;

    if (Math.random() < CHANCE) {
      finalDmg  = Math.floor(total * (1 + BONUS));
      extraNote = "《血獄狂焰爆發：最終傷害 +40%》";
    }

    logPrepend?.(
      `💢 ${this.name} 對最多 ${this.maxTargets} 名敵人引爆 ${hits} 重狂嵐，總傷害約 ${finalDmg} ` +
      `（單段約 ${Math.round(perHitMul * 100)}%｜STR 加成約 ${Math.round(strBonus * 100)}%）` +
      (extraNote ? " " + extraNote : "")
    );

    spendAndCooldown(this, this.mpCost);
    return finalDmg;
  },

  getUpgradeCost () { return 1; },

  getDescription () {
    const L    = Math.max(1, this.level | 0);
    const hits = Number(this.logic && this.logic.hits || 1);

    const perHitMul = Number(this.logic && this.logic.damageMultiplier || 0) +
                      Number(this.logic && this.logic.levelMultiplier || 0) * (L - 1);

    const per   = Math.round(perHitMul * 100);
    const total = Math.round(perHitMul * hits * 100);

    return (
      "狂戰士線五轉最終級大招，追求極限爆發。\n" +
      "・對最多 " + this.maxTargets + " 名敵人引發 " + hits + " 段血獄狂嵐\n" +
      "・目前每段約 " + per + "%，合計約 " + total + "% 傷害\n" +
      "・可從力量獲得超高額外加成（最高約 +420%）\n" +
      "・有 25% 機率讓本次最終傷害再提升約 40%\n" +
      "・冷卻時間：" + this.cooldown + " 秒｜消耗 MP：" + this.mpCost + "\n" +
      "・職業限制：狂戰士職業線（五轉「狂戰戰皇」起，往後進階皆可使用）"
    );
  }
});

/* ===================== 盾騎線五轉小招：聖盾突擊(五轉) ===================== */
registerJobSkill('warrior5', {
  job: "warrior5",
  id: "guardian5_shield_rush",
  name: "聖盾突擊(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  requiredJobTier: 5,
  requireJobLineFrom: "warrior_guardian5",

  level: 1,
  maxLevel: 20,
  maxTargets: 4,

  currentTier: 0,
  tiers: [
    {
      name: "聖盾突擊",
      mpCost: 22,
      cooldown: 7,      // 小招：短 CD
      logic: {
        damageMultiplier: 1.20,  // 單段約 160%
        levelMultiplier: 0.08,   // 隨等級成長
        hits: 4,                 // 2 段衝鋒斬
        strCap: 2.8,             // STR 加成上限 +280%
        shieldPct: 0.004,        // 最大 HP 上限：0.4%（0.004）
        shieldFromDamagePct: 0.05// 以本次傷害的 5% 為基底
      }
    }
  ],

  currentCooldown: 0,

  use (monster) {
    // 安全：職業線 / 轉數檢查
    if (typeof Skills_isUnlocked === "function" &&
        !Skills_isUnlocked(this)) {
      alert("當前職業無法使用「聖盾突擊」。");
      return 0;
    }

    const t = getActiveTier(this);
    this.name     = t.name;
    this.logic    = t.logic;
    this.cooldown = Number(t.cooldown || 0);
    this.mpCost   = t.mpCost || 0;

    const L         = Math.max(1, this.level | 0);
    const dmgMul    = Number(t.logic.damageMultiplier || 0);
    const lvMul     = Number(t.logic.levelMultiplier || 0);
    const perHitMul = dmgMul + lvMul * (L - 1);
    const hits      = Number(t.logic.hits || 1);
    const baseAtk   = Math.max(player.totalStats.atk || 1, 1);

    const cap      = Number(t.logic.strCap || 2.8);
    const strBonus = typeof _getStrBonusWithCap === "function"
      ? _getStrBonusWithCap(cap)
      : 0;

    const totalDmg = Math.floor(baseAtk * perHitMul * (1 + strBonus)) * hits;

    // ===== 護盾計算：以「傷害 5%」為基底，同時限縮「最大HP 0.4%」＆單次上限 5000＆總護盾不超過 20000 =====
    const maxHp   = player.totalStats.hp || 1;
    const curSh   = player.shield || 0;

    const fromDamagePct = Number(t.logic.shieldFromDamagePct || 0.05); // 5%
    const shieldPct     = Number(t.logic.shieldPct || 0.004);          // 0.4%

    let shieldGain = 0;
    let shieldNote = "";

    if (curSh < 10000) {
      const rawFromDamage = totalDmg * fromDamagePct;  // 傷害的 5%
      const rawFromMaxHp  = maxHp * shieldPct;        // 最大HP 的 0.4%
      const rawBase       = Math.min(rawFromDamage, rawFromMaxHp);

      // 單次護盾不得超過 5000，且總護盾不得超過 20000
      const room   = 10000 - curSh;
      shieldGain   = Math.floor(Math.min(rawBase, 1000, room));

      if (shieldGain > 0) {
        player.shield = curSh + shieldGain;
      }
    } else {
      shieldNote = "（護盾已達上限，無法再獲得）";
    }

    logPrepend?.(
      `🛡️ ${this.name} 對最多 ${this.maxTargets} 名敵人造成約 ${totalDmg} 傷害 ` +
      `（單段約 ${Math.round(perHitMul * 100)}% × ${hits} Hit｜STR 加成約 ${Math.round(strBonus * 100)}%）` +
      (shieldGain > 0
        ? `，並獲得 ${shieldGain} 護盾（以本次傷害 5% 與最大HP 0.4% 取較小值，單次上限 1000，總護盾上限 10000）`
        : `，本次未獲得護盾${shieldNote}`)
    );

    spendAndCooldown(this, this.mpCost);
    return totalDmg;
  },

  getUpgradeCost () {
    return 1;
  },

  getDescription () {
    const t    = getActiveTier(this);
    const L    = Math.max(1, this.level | 0);
    const hits = Number(t.logic.hits || 1);

    const perHitMul = (Number(t.logic.damageMultiplier || 0)) +
                      (Number(t.logic.levelMultiplier || 0) * (L - 1));

    const per   = Math.round(perHitMul * 100);
    const total = Math.round(perHitMul * hits * 100);
    const cap   = Math.round((t.logic.strCap || 0) * 100);

    const dmgPct   = Math.round((t.logic.shieldFromDamagePct || 0.05) * 100);   // 5
    const hpPct    = Math.round((t.logic.shieldPct || 0.004) * 1000) / 10;      // 0.4

    return (
      "盾騎士線五轉的短 CD 衝鋒小招，兼具輸出與防護。\n" +
      "・對前方最多 " + this.maxTargets + " 名敵人進行 " + hits + " 段突擊\n" +
      "・目前每段約 " + per + "%，合計約 " + total + "% 傷害\n" +
      "・可從力量獲得額外加成，上限約 +" + cap + "%\n" +
      "・護盾效果：每次施放後可獲得護盾，其量為「本次技能傷害的 " + dmgPct + "%」與「最大 HP 的 " + hpPct + "%」之較小值\n" +
      "　且單次獲得護盾量不超過 1000，總護盾值超過 10000 時將無法再獲得新護盾\n" +
      "・冷卻時間：" + t.cooldown + " 秒｜消耗 MP：" + t.mpCost + "\n" +
      "・職業限制：盾騎士職業線（五轉「堅壁聖衛」起，往後進階皆可使用）"
    );
  }
});
/* ===================== 盾騎線五轉技能：聖盾終焉神裁 ===================== */
registerJobSkill('warrior5', {
  job: "warrior5",
  id: "guardian5_final_judgment",
  name: "聖盾終焉神裁(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  requiredJobTier: 5,
  requireJobLineFrom: "warrior_guardian5",

  level: 1,
  maxLevel: 20,
  maxTargets: 10,

  mpCost: 70,
  cooldown: 600, // 比原本 300 秒稍微短一點

  logic: {
    // 盾騎大招：高爆發 + 護盾
    damageMultiplier: 2.20, // 基礎約 320%
    levelMultiplier: 0.10, // 隨等級提升威力
    hits: 5 // 5 段爆發
  },

  currentCooldown: 0,

  use(monster) {
    const L = Math.max(1, this.level | 0);
    const baseMul = Number(this.logic && this.logic.damageMultiplier || 0);
    const lm = Number(this.logic && this.logic.levelMultiplier || 0);
    const hits = Number(this.logic && this.logic.hits || 1);

    const perHitMul = baseMul + lm * (L - 1);
    const baseAtk = Math.max(player.totalStats.atk || 1, 1);

    // 盾騎大招：STR 上限 +350%（比狂戰稍低）
    const strBonus = _getStrBonusWithCap(3.5);

    const totalDmg = Math.floor(baseAtk * perHitMul * (1 + strBonus)) * hits;

    // ===== 附帶護盾效果：給予自身最大 HP 一定比例的護盾 =====
    const maxHp = player.totalStats.hp || 1;
    const curSh = player.shield || 0;

    // 基礎護盾量：最大 HP 的 10%
    const shieldPct = 0.10; // 10%
    const rawShield = Math.floor(maxHp * shieldPct);

    // 上限：單次最多 7500，總護盾最多 40000
    const SINGLE_CAP = 7500;
    const TOTAL_CAP = 20000;
    let shieldGain = 0;
    let shieldNote = "";

    if (curSh < TOTAL_CAP) {
      const room = TOTAL_CAP - curSh;
      shieldGain = Math.floor(Math.min(rawShield, SINGLE_CAP, room));
      if (shieldGain > 0) {
        player.shield = curSh + shieldGain;
      } else {
        shieldNote = "（已接近護盾上限，本次獲得量為 0）";
      }
    } else {
      shieldNote = "（護盾已達上限，無法再獲得）";
    }

    logPrepend?.(
      "✨ " + this.name +
      " 對最多 " + this.maxTargets + " 名敵人降下 " + hits + " 重神裁，總傷害 " + totalDmg +
      "｜STR 加成約 " + Math.round(strBonus * 100) + "%｜" +
      (shieldGain > 0 ?
        "本次獲得約 " + shieldGain + " 點護盾（基於最大HP 10%，單次上限 7500，總護盾上限 20000）" :
        "本次未獲得護盾" + shieldNote)
    );

    spendAndCooldown(this, this.mpCost);
    return totalDmg;
  },

  getUpgradeCost() { return 1; },

  getDescription() {
    const L = Math.max(1, this.level | 0);
    const hits = Number(this.logic && this.logic.hits || 1);

    const perHitMul = Number(this.logic && this.logic.damageMultiplier || 0) +
      Number(this.logic && this.logic.levelMultiplier || 0) * (L - 1);

    const per = Math.round(perHitMul * 100);
    const total = Math.round(perHitMul * hits * 100);

    return (
      "盾騎士線五轉最終級大招，兼具輸出與防禦。\n" +
      "・對最多 " + this.maxTargets + " 名敵人降下 " + hits + " 重神裁\n" +
      "・目前每段約 " + per + "%，合計約 " + total + "% 傷害\n" +
      "・可從力量獲得大幅度額外加成（最高約 +350%）\n" +
      "・施放後獲得一層護盾，基礎為自身最大 HP 的 10%，" +
      "但單次獲得量不超過 7500，且總護盾值上限為 ，20000\n" +
      "・冷卻時間：" + this.cooldown + " 秒｜消耗 MP：" + this.mpCost + "\n" +
      "・職業限制：盾騎士職業線（五轉「堅壁聖衛」起，往後進階皆可使用）"
    );
  }
});

