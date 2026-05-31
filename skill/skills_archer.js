// =========================
// skills_archer.js
// 弓箭手技能（1~4轉）
// 規則：
// 1) 技能內不直接扣血，只回傳數值傷害
// 2) 不自行扣防禦，基礎攻擊用 player.totalStats.atk
// 3) ignoreDef 當作額外傷害倍率（1 + ignoreDef）
// 4) 爆擊 / 敏捷加成仍在技能內運算（再交給戰鬥核心做第二層處理）
// =========================

// 小工具：拿現在怪物血量（優先用 global.monsterHP）
function _archerCurrentHp(monster) {
  const maxHp = monster?.maxHp || monster?.baseStats?.hp || 1;
  if (typeof monsterHP === "number") return Math.max(0, Math.min(monsterHP, maxHp));
  return Math.max(0, Math.min(monster?.hp || maxHp, maxHp));
}
// 小工具：AGI 加成（上限 cap，小數例如 2.5 = +250%）
function _getAgiBonus(cap) {
  const RATE = 0.002; // 每點 AGI +0.2%
  const totalAgi =
    (player?.baseStats?.agi || 0) +
    (player?.coreBonus?.agi || 0);
  const raw = totalAgi * RATE;       // 轉成小數
  const max = Math.max(0, cap || 0); // 上限
  return Math.min(max, Math.max(0, raw));
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



/* ==== 神射手線三轉：天隼連射（狙擊型） ==== */
registerJobSkill('archer3', {
  job: "archer3",
  id: "marksman3_falcon_burst",
  name: "天隼連射(三轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  // 三轉以上
  requiredJobTier: 3,

  // ⭐ 限定：神射手職業線（archer_marksman3 之後）
  requireJobLineFrom: "archer_marksman3",

  level: 1,

  currentTier: 0,
  evolveLevels: [0, 200],   // 200 等進化

  maxLevel: 20,

  currentCooldown: 0,

  tiers: [
    {
      name: "天隼連射",
      mpCost: 30,
      cooldown: 18,
      maxTargets: 4,   // 比原本少一點目標，專注爆發
      hits: 4,
      dmgBase: 115,    // 單段倍率略高
      dmgPerLv: 3,
      maxLv: 10,
      extraChance: 0,
      extraBonus: 0
    },
    {
      name: "天隼亂舞・極",
      mpCost: 30,
      cooldown: 18,
      maxTargets: 4,
      hits: 5,
      dmgBase: 135,
      dmgPerLv: 5,
      maxLv: 20,
      extraChance: 0.25, // 25% 機率
      extraBonus: 0.30   // 最終傷害 +30%（偏爆發）
    }
  ],

  use(monster) {
    const t    = getActiveTier(this);
    const evo  = getEvoLabel(this);
    const name = t.name + evo;

    this.name     = name;
    this.cooldown = t.cooldown;
    this.mpCost   = t.mpCost;
    // ❌ 不動 this.maxTargets，交給 playerSkills._cast()（用 tier.maxTargets）

    const baseAtk = Math.max(player.totalStats.atk || 1, 1);

    const perPct = t.dmgBase + t.dmgPerLv * this.level; // 單段%
    const perHit = perPct / 100;

    const dmgPerHit   = Math.floor(baseAtk * perHit);
    let dmgPerTarget  = dmgPerHit * t.hits;
    const totalPct    = perPct * t.hits;

    let proc = false;
    if (t.extraChance > 0 && Math.random() < t.extraChance) {
      dmgPerTarget = Math.floor(dmgPerTarget * (1 + t.extraBonus));
      proc = true;
    }

    logPrepend?.(
      `🏹 ${name} 每隻造成約 ${dmgPerTarget} 傷害 ` +
      `（單段約 ${perPct}% × ${t.hits} Hit，理論總倍率約 ${totalPct}%）` +
      (proc ? "《天隼特性觸發：最終傷害 +30%》" : "")
    );

    spendAndCooldown(this, this.mpCost);
    return dmgPerTarget;
  },

  getUpgradeCost() { return 50 + (this.level - 1) * 15; },

  getDescription() {
    const t   = getActiveTier(this);
    const evo = getEvoLabel(this);

    const perPct   = t.dmgBase + t.dmgPerLv * this.level;
    const totalPct = perPct * t.hits;
    const lvCap    = t.maxLv;

    let desc =
      `${t.name}${evo}（三轉技能｜神射手線）\n` +
      `・攻擊最多 ${t.maxTargets} 名敵人\n` +
      `・單段傷害：約 ${perPct}%\n` +
      `・總傷害：約 ${totalPct}%（${t.hits} Hit）\n` +
      `・冷卻：${t.cooldown}s｜MP：${t.mpCost}\n` +
      `・等級上限：${lvCap}`;

    if (t.extraChance) {
      desc += `\n・特性：${t.extraChance * 100}% 機率 最終傷害 +${t.extraBonus * 100}%`;
    }

    if (this.currentTier === 0) desc += `\n・200 等進化`;

    return desc;
  }
});
/* ==== 精靈射手線三轉：精靈箭雨（清場型） ==== */
registerJobSkill('archer3', {
  job: "archer3",
  id: "elf3_spirit_arrow_rain",
  name: "精靈箭雨(三轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  requiredJobTier: 3,

  // ⭐ 限定：精靈射手職業線（archer_elf3 之後）
  requireJobLineFrom: "archer_elf3",

  level: 1,

  currentTier: 0,
  evolveLevels: [0, 200],   // 200 等進化

  maxLevel: 20,

  currentCooldown: 0,

  tiers: [
    {
      name: "精靈箭雨",
      mpCost: 32,
      cooldown: 18,
      maxTargets: 6,   // 比神射手多打一隻，清場向
      hits: 4,
      dmgBase: 95,     // 略低一點
      dmgPerLv: 2.5,
      maxLv: 10,
      extraChance: 0,
      extraBonus: 0
    },
    {
      name: "精靈亂雨・極",
      mpCost: 32,
      cooldown: 18,
      maxTargets: 7,
      hits: 5,
      dmgBase: 110,
      dmgPerLv: 4,
      maxLv: 20,
      extraChance: 0.25, // 25% 機率
      extraBonus: 0.20   // 最終傷害 +20%（偏平均輸出）
    }
  ],

  currentCooldown: 0,

  use(monster) {
    const t    = getActiveTier(this);
    const evo  = getEvoLabel(this);
    const name = t.name + evo;

    this.name     = name;
    this.cooldown = t.cooldown;
    this.mpCost   = t.mpCost;
    // ❌ 同樣不動 this.maxTargets

    const baseAtk = Math.max(player.totalStats.atk || 1, 1);

    const perPct = t.dmgBase + t.dmgPerLv * this.level;
    const perHit = perPct / 100;

    const dmgPerHit   = Math.floor(baseAtk * perHit);
    let dmgPerTarget  = dmgPerHit * t.hits;
    const totalPct    = perPct * t.hits;

    let proc = false;
    if (t.extraChance > 0 && Math.random() < t.extraChance) {
      dmgPerTarget = Math.floor(dmgPerTarget * (1 + t.extraBonus));
      proc = true;
    }

    logPrepend?.(
      `🌿 ${name} 造成每隻約 ${dmgPerTarget} 傷害 ` +
      `（單段約 ${dmgPerHit} 傷害 × ${t.hits} Hit，理論總倍率約 ${totalPct}%）` +
      (proc ? "《精靈特性觸發：箭雨強化》" : "")
    );

    spendAndCooldown(this, this.mpCost);
    return dmgPerTarget;
  },

  getUpgradeCost() { return 50 + (this.level - 1) * 15; },

  getDescription() {
    const t   = getActiveTier(this);
    const evo = getEvoLabel(this);

    const perPct   = t.dmgBase + t.dmgPerLv * this.level;
    const totalPct = perPct * t.hits;
    const lvCap    = t.maxLv;

    let desc =
      `${t.name}${evo}（三轉技能｜精靈射手線）\n` +
      `・攻擊最多 ${t.maxTargets} 名敵人\n` +
      `・單段傷害：約 ${perPct}%\n` +
      `・總傷害：約 ${totalPct}%（${t.hits} Hit）\n` +
      `・冷卻：${t.cooldown}s｜MP：${t.mpCost}\n` +
      `・等級上限：${lvCap}`;

    if (t.extraChance) {
      desc += `\n・特性：${t.extraChance * 100}% 機率 最終傷害 +${t.extraBonus * 100}%`;
    }

    if (this.currentTier === 0) desc += `\n・200 等進化`;

    return desc;
  }
});
/* ==== 精靈射手線三轉：精靈箭雨（清場型） ==== */
registerJobSkill('archer3', {
  job: "archer3",
  id: "elf3_spirit_arrow_rain",
  name: "精靈箭雨(三轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  requiredJobTier: 3,

  // ⭐ 限定：精靈射手職業線（archer_elf3 之後）
  requireJobLineFrom: "archer_elf3",

  level: 1,

  currentTier: 0,
  evolveLevels: [0, 200],   // 200 等進化

  maxLevel: 20,

  currentCooldown: 0,

  tiers: [
    {
      name: "精靈箭雨",
      mpCost: 32,
      cooldown: 18,
      maxTargets: 6,   // 比神射手多打一隻，清場向
      hits: 4,
      dmgBase: 95,     // 略低一點
      dmgPerLv: 2.5,
      maxLv: 10,
      extraChance: 0,
      extraBonus: 0
    },
    {
      name: "精靈亂雨・極",
      mpCost: 32,
      cooldown: 18,
      maxTargets: 7,
      hits: 5,
      dmgBase: 110,
      dmgPerLv: 4,
      maxLv: 20,
      extraChance: 0.25, // 25% 機率
      extraBonus: 0.20   // 最終傷害 +20%（偏平均輸出）
    }
  ],

  currentCooldown: 0,

  use(monster) {
    const t    = getActiveTier(this);
    const evo  = getEvoLabel(this);
    const name = t.name + evo;

    this.name     = name;
    this.cooldown = t.cooldown;
    this.mpCost   = t.mpCost;
    // ❌ 同樣不動 this.maxTargets

    const baseAtk = Math.max(player.totalStats.atk || 1, 1);

    const perPct = t.dmgBase + t.dmgPerLv * this.level;
    const perHit = perPct / 100;

    const dmgPerHit   = Math.floor(baseAtk * perHit);
    let dmgPerTarget  = dmgPerHit * t.hits;
    const totalPct    = perPct * t.hits;

    let proc = false;
    if (t.extraChance > 0 && Math.random() < t.extraChance) {
      dmgPerTarget = Math.floor(dmgPerTarget * (1 + t.extraBonus));
      proc = true;
    }

    logPrepend?.(
      `🌿 ${name} 造成每隻約 ${dmgPerTarget} 傷害 ` +
      `（單段約 ${dmgPerHit} 傷害 × ${t.hits} Hit，理論總倍率約 ${totalPct}%）` +
      (proc ? "《精靈特性觸發：箭雨強化》" : "")
    );

    spendAndCooldown(this, this.mpCost);
    return dmgPerTarget;
  },

  getUpgradeCost() { return 50 + (this.level - 1) * 15; },

  getDescription() {
    const t   = getActiveTier(this);
    const evo = getEvoLabel(this);

    const perPct   = t.dmgBase + t.dmgPerLv * this.level;
    const totalPct = perPct * t.hits;
    const lvCap    = t.maxLv;

    let desc =
      `${t.name}${evo}（三轉技能｜精靈射手線）\n` +
      `・攻擊最多 ${t.maxTargets} 名敵人\n` +
      `・單段傷害：約 ${perPct}%\n` +
      `・總傷害：約 ${totalPct}%（${t.hits} Hit）\n` +
      `・冷卻：${t.cooldown}s｜MP：${t.mpCost}\n` +
      `・等級上限：${lvCap}`;

    if (t.extraChance) {
      desc += `\n・特性：${t.extraChance * 100}% 機率 最終傷害 +${t.extraBonus * 100}%`;
    }

    if (this.currentTier === 0) desc += `\n・200 等進化`;

    return desc;
  }
});
/* ==== 神射手線三轉：天隼連射（狙擊型） ==== */
registerJobSkill('archer3', {
  job: "archer3",
  id: "marksman3_falcon_burst",
  name: "天隼連射(三轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  // 三轉以上
  requiredJobTier: 3,

  // ⭐ 限定：神射手職業線（archer_marksman3 之後）
  requireJobLineFrom: "archer_marksman3",

  level: 1,

  currentTier: 0,
  evolveLevels: [0, 200],   // 200 等進化

  maxLevel: 20,

  currentCooldown: 0,

  tiers: [
    {
      name: "天隼連射",
      mpCost: 30,
      cooldown: 18,
      maxTargets: 4,   // 比原本少一點目標，專注爆發
      hits: 4,
      dmgBase: 115,    // 單段倍率略高
      dmgPerLv: 3,
      maxLv: 10,
      extraChance: 0,
      extraBonus: 0
    },
    {
      name: "天隼亂舞・極",
      mpCost: 30,
      cooldown: 18,
      maxTargets: 4,
      hits: 5,
      dmgBase: 135,
      dmgPerLv: 5,
      maxLv: 20,
      extraChance: 0.25, // 25% 機率
      extraBonus: 0.30   // 最終傷害 +30%（偏爆發）
    }
  ],

  use(monster) {
    const t    = getActiveTier(this);
    const evo  = getEvoLabel(this);
    const name = t.name + evo;

    this.name     = name;
    this.cooldown = t.cooldown;
    this.mpCost   = t.mpCost;
    // ❌ 不動 this.maxTargets，交給 playerSkills._cast()（用 tier.maxTargets）

    const baseAtk = Math.max(player.totalStats.atk || 1, 1);

    const perPct = t.dmgBase + t.dmgPerLv * this.level; // 單段%
    const perHit = perPct / 100;

    const dmgPerHit   = Math.floor(baseAtk * perHit);
    let dmgPerTarget  = dmgPerHit * t.hits;
    const totalPct    = perPct * t.hits;

    let proc = false;
    if (t.extraChance > 0 && Math.random() < t.extraChance) {
      dmgPerTarget = Math.floor(dmgPerTarget * (1 + t.extraBonus));
      proc = true;
    }

    logPrepend?.(
      `🏹 ${name} 每隻造成約 ${dmgPerTarget} 傷害 ` +
      `（單段約 ${perPct}% × ${t.hits} Hit，理論總倍率約 ${totalPct}%）` +
      (proc ? "《天隼特性觸發：最終傷害 +30%》" : "")
    );

    spendAndCooldown(this, this.mpCost);
    return dmgPerTarget;
  },

  getUpgradeCost() { return 50 + (this.level - 1) * 15; },

  getDescription() {
    const t   = getActiveTier(this);
    const evo = getEvoLabel(this);

    const perPct   = t.dmgBase + t.dmgPerLv * this.level;
    const totalPct = perPct * t.hits;
    const lvCap    = t.maxLv;

    let desc =
      `${t.name}${evo}（三轉技能｜神射手線）\n` +
      `・攻擊最多 ${t.maxTargets} 名敵人\n` +
      `・單段傷害：約 ${perPct}%\n` +
      `・總傷害：約 ${totalPct}%（${t.hits} Hit）\n` +
      `・冷卻：${t.cooldown}s｜MP：${t.mpCost}\n` +
      `・等級上限：${lvCap}`;

    if (t.extraChance) {
      desc += `\n・特性：${t.extraChance * 100}% 機率 最終傷害 +${t.extraBonus * 100}%`;
    }

    if (this.currentTier === 0) desc += `\n・200 等進化`;

    return desc;
  }
});
/* ==== 精靈射手線三轉：精靈箭雨（清場型） ==== */
registerJobSkill('archer3', {
  job: "archer3",
  id: "elf3_spirit_arrow_rain",
  name: "精靈箭雨(三轉)",
  type: "attack",
  role: "attack",
  isBasic: false,

  requiredJobTier: 3,

  // ⭐ 限定：精靈射手職業線（archer_elf3 之後）
  requireJobLineFrom: "archer_elf3",

  level: 1,

  currentTier: 0,
  evolveLevels: [0, 200],   // 200 等進化

  maxLevel: 20,

  currentCooldown: 0,

  tiers: [
    {
      name: "精靈箭雨",
      mpCost: 32,
      cooldown: 18,
      maxTargets: 6,   // 比神射手多打一隻，清場向
      hits: 4,
      dmgBase: 95,     // 略低一點
      dmgPerLv: 2.5,
      maxLv: 10,
      extraChance: 0,
      extraBonus: 0
    },
    {
      name: "精靈亂雨・極",
      mpCost: 32,
      cooldown: 18,
      maxTargets: 7,
      hits: 5,
      dmgBase: 110,
      dmgPerLv: 4,
      maxLv: 20,
      extraChance: 0.25, // 25% 機率
      extraBonus: 0.20   // 最終傷害 +20%（偏平均輸出）
    }
  ],

  currentCooldown: 0,

  use(monster) {
    const t    = getActiveTier(this);
    const evo  = getEvoLabel(this);
    const name = t.name + evo;

    this.name     = name;
    this.cooldown = t.cooldown;
    this.mpCost   = t.mpCost;
    // ❌ 同樣不動 this.maxTargets

    const baseAtk = Math.max(player.totalStats.atk || 1, 1);

    const perPct = t.dmgBase + t.dmgPerLv * this.level;
    const perHit = perPct / 100;

    const dmgPerHit   = Math.floor(baseAtk * perHit);
    let dmgPerTarget  = dmgPerHit * t.hits;
    const totalPct    = perPct * t.hits;

    let proc = false;
    if (t.extraChance > 0 && Math.random() < t.extraChance) {
      dmgPerTarget = Math.floor(dmgPerTarget * (1 + t.extraBonus));
      proc = true;
    }

    logPrepend?.(
      `🌿 ${name} 造成每隻約 ${dmgPerTarget} 傷害 ` +
      `（單段約 ${dmgPerHit} 傷害 × ${t.hits} Hit，理論總倍率約 ${totalPct}%）` +
      (proc ? "《精靈特性觸發：箭雨強化》" : "")
    );

    spendAndCooldown(this, this.mpCost);
    return dmgPerTarget;
  },

  getUpgradeCost() { return 50 + (this.level - 1) * 15; },

  getDescription() {
    const t   = getActiveTier(this);
    const evo = getEvoLabel(this);

    const perPct   = t.dmgBase + t.dmgPerLv * this.level;
    const totalPct = perPct * t.hits;
    const lvCap    = t.maxLv;

    let desc =
      `${t.name}${evo}（三轉技能｜精靈射手線）\n` +
      `・攻擊最多 ${t.maxTargets} 名敵人\n` +
      `・單段傷害：約 ${perPct}%\n` +
      `・總傷害：約 ${totalPct}%（${t.hits} Hit）\n` +
      `・冷卻：${t.cooldown}s｜MP：${t.mpCost}\n` +
      `・等級上限：${lvCap}`;

    if (t.extraChance) {
      desc += `\n・特性：${t.extraChance * 100}% 機率 最終傷害 +${t.extraBonus * 100}%`;
    }

    if (this.currentTier === 0) desc += `\n・200 等進化`;

    return desc;
  }
});

/* ==== 精靈射手線五轉小招：精靈貫穿箭（穿透特性，AGI 加成） ==== */
registerJobSkill('archer5', {
  job: "archer5",
  id: "elf5_spirit_pierce",
  name: "精靈貫穿箭(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,
  requiredJobTier: 5,

  // ⭐ 精靈射手職業線（archer_elf5 之後皆可用）
  requireJobLineFrom: "archer_elf5",

  level: 1,
  maxLevel: 20,
  maxTargets: 5,

  currentTier: 0,
  tiers: [
    {
      name: "精靈貫穿箭",
      mpCost: 26,
      cooldown: 8,
      maxTargets: 5,
      // ignoreDefPct 會被 playerSkills._cast() 帶進 sr.ignoreDefPct
      ignoreDefPct: 0.20,   // 技能內建 20% 無視防禦（穿透）
      logic: {
        basePct: 170,
        perLvPct: 7,
        hits: 5,
        agiCap: 2.4,        // ✅ 改成 AGI 上限 +240%
        pierceChance: 0.20, // 20% 機率穿透強化
        pierceBonus: 0.25   // 最終傷害 +25%
      }
    }
  ],

  currentCooldown: 0,

  use(monster) {
    const t     = _getActiveTier(this);
    const logic = t.logic || {};

    this.name     = t.name;
    this.cooldown = t.cooldown;
    this.mpCost   = t.mpCost;
    // ❌ 不動 this.maxTargets，maxTargets 交給 playerSkills._cast()

    const L    = Math.max(1, this.level | 0);
    const hits = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const perHitMul = perHitPct / 100;

    const baseAtk   = Math.max(player.totalStats?.atk || 1, 1);
    const agiBonus  = _getAgiBonus(logic.agiCap || 0);   // ✅ 改用 AGI
    const baseTotal = Math.floor(baseAtk * perHitMul * (1 + agiBonus)) * hits;

    this.lastCastTag = "";
    let finalDmg  = baseTotal;
    let extraNote = "";

    const CHANCE = logic.pierceChance || 0;
    const BONUS  = logic.pierceBonus  || 0;
    if (CHANCE > 0 && Math.random() < CHANCE) {
      finalDmg  = Math.floor(baseTotal * (1 + BONUS));
      extraNote = "《穿透強化觸發：箭矢貫穿護甲》";
      this.lastCastTag = "穿透強化";
    }

    logPrepend?.(
      `🌿 ${t.name} 造成總計約 ${finalDmg} 傷害` +
      `（${hits} 連射｜單 Hit 約 ${Math.round(perHitPct)}%｜AGI 加成約 ${Math.round(agiBonus * 100)}%）` +
      `，自帶約 20% 無視防禦` +
      (extraNote ? " " + extraNote : "")
    );

    spendAndCooldown(this, this.mpCost);
    return finalDmg;
  },

  getUpgradeCost() { return 1; },

  getDescription() {
    const t     = _getActiveTier(this);
    const L     = Math.max(1, this.level | 0);
    const logic = t.logic || {};
    const hits  = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const totalPct  = perHitPct * hits;
    const agiCapPct = Math.round((logic.agiCap || 0) * 100);
    const chChance  = Math.round((logic.pierceChance || 0) * 100);
    const chBonus   = Math.round((logic.pierceBonus  || 0) * 100);

    return (
      `${t.name}（精靈射手線五轉主力技能）\n` +
      `・對前方最多 ${this.maxTargets} 名敵人進行 ${hits} 發貫穿射擊\n` +
      `・目前每擊約 ${perHitPct}% ，合計約 ${totalPct}% 傷害（會隨技能等級提升）\n` +
      `・可從 AGI 獲得額外加成，上限約 +${agiCapPct}%\n` +
      `・技能自帶約 20% 無視防禦（穿透護甲效果）\n` +
      `・有 ${chChance}% 機率觸發「穿透強化」，使本次最終傷害再提高約 ${chBonus}%\n` +
      `・冷卻時間：約 ${t.cooldown} 秒｜消耗 MP：${t.mpCost}\n` +
      `・職業限制：精靈射手職業線（五轉「精靈遊俠王」起，往後進階皆可使用）`
    );
  }
});
/* ==== 精靈射手線五轉大招：精靈星墜箭雨（AGI + 穿透） ==== */
registerJobSkill('archer5', {
  job: "archer5",
  id: "elf5_starfall_arrow_rain",
  name: "精靈星墜箭雨(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,
  requiredJobTier: 5,

  requireJobLineFrom: "archer_elf5",

  level: 1,
  maxLevel: 20,
  maxTargets: 9,

  mpCost: 72,
  cooldown: 260,

  // ignoreDefPct 會被 _cast() 傳進 sr.ignoreDefPct
  ignoreDefPct: 0.35,   // 大招版：35% 無視防禦

  logic: {
    basePct: 190,
    perLvPct: 8,
    hits: 5,
    agiCap: 3.8,        // ✅ AGI 上限 +380%
    pierceChance: 0.25, // 25% 穿透強化
    pierceBonus: 0.30   // 最終傷害 +30%
  },

  currentCooldown: 0,

  use(monster) {
    const lg   = this.logic || {};
    const L    = Math.max(1, this.level | 0);
    const hits = Number(lg.hits || 1);

    const perHitPct = (lg.basePct || 0) + (lg.perLvPct || 0) * (L - 1);
    const perHitMul = perHitPct / 100;

    const baseAtk   = Math.max(player.totalStats?.atk || 1, 1);
    const agiBonus  = _getAgiBonus(lg.agiCap || 0);   // ✅ AGI
    const baseTotal = Math.floor(baseAtk * perHitMul * (1 + agiBonus)) * hits;

    this.lastCastTag = "";
    let finalDmg  = baseTotal;
    let extraNote = "";

    const CHANCE = lg.pierceChance || 0;
    const BONUS  = lg.pierceBonus  || 0;
    if (CHANCE > 0 && Math.random() < CHANCE) {
      finalDmg  = Math.floor(baseTotal * (1 + BONUS));
      extraNote = "《星墜穿透觸發：箭雨完全貫穿護甲》";
      this.lastCastTag = "星墜穿透";
    }

    logPrepend?.(
      `✨ ${this.name} 對最多 ${this.maxTargets} 名敵人降下 ${hits} 重星墜箭雨，總傷害約 ${finalDmg}` +
      `（單 Hit 約 ${Math.round(perHitPct)}%｜AGI 加成約 ${Math.round(agiBonus * 100)}%｜自帶約 35% 無視防禦）` +
      (extraNote ? " " + extraNote : "")
    );

    spendAndCooldown(this, this.mpCost);
    return finalDmg;
  },

  getUpgradeCost() { return 1; },

  getDescription() {
    const lg   = this.logic || {};
    const L    = Math.max(1, this.level | 0);
    const hits = Number(lg.hits || 1);

    const perHitPct = (lg.basePct || 0) + (lg.perLvPct || 0) * (L - 1);
    const totalPct  = perHitPct * hits;
    const agiCapPct = Math.round((lg.agiCap || 0) * 100);
    const chChance  = Math.round((lg.pierceChance || 0) * 100);
    const chBonus   = Math.round((lg.pierceBonus  || 0) * 100);

    return (
      `${this.name}（精靈射手線五轉最終級大招）\n` +
      `・對最多 ${this.maxTargets} 名敵人降下 ${hits} 重星墜箭雨\n` +
      `・目前每段約 ${perHitPct}% ，合計約 ${totalPct}% 傷害（會隨技能等級提升）\n` +
      `・可從 AGI 獲得大幅度額外加成（最高約 +${agiCapPct}%）\n` +
      `・技能自帶約 35% 無視防禦（大幅穿透護甲）\n` +
      `・有 ${chChance}% 機率觸發「星墜穿透」，使本次最終傷害再提高約 ${chBonus}%\n` +
      `・冷卻時間：約 ${this.cooldown} 秒｜消耗 MP：${this.mpCost}\n` +
      `・職業限制：精靈射手職業線（五轉「精靈遊俠王」起，往後進階皆可使用）`
    );
  }
});
/* ==== 神射手線五轉小招：神隼速射（連續射擊，AGI 加成） ==== */
registerJobSkill('archer5', {
  job: "archer5",
  id: "marksman5_falcon_rapid",
  name: "神隼速射(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,
  requiredJobTier: 5,

  // ⭐ 神射手職業線（archer_marksman5 之後皆可用）
  requireJobLineFrom: "archer_marksman5",

  level: 1,
  maxLevel: 20,
  maxTargets: 4,     // UI 預設

  currentTier: 0,
  tiers: [
    {
      name: "神隼速射",
      mpCost: 26,
      cooldown: 7,
      maxTargets: 4,   // 給 _cast() 用
      logic: {
        basePct: 160,       // 單 Hit 基礎 160%
        perLvPct: 8,        // 每級 +8%
        hits: 5,            // 5 連射
        agiCap: 2.7,        // ✅ AGI 上限 +270%
        chainChance: 0.25,  // 25% 機率觸發連續射擊
        chainBonus: 0.60    // 再打一輪 60% 總傷害 → 總計 160%
      }
    }
  ],

  currentCooldown: 0,

  use(monster) {
    const t     = _getActiveTier(this);
    const logic = t.logic || {};
    this.name     = t.name;
    this.cooldown = t.cooldown;
    this.mpCost   = t.mpCost;

    const L    = Math.max(1, this.level | 0);
    const hits = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const perHitMul = perHitPct / 100;

    const baseAtk   = Math.max(player.totalStats?.atk || 1, 1);
    const agiBonus  = _getAgiBonus(logic.agiCap || 0);    // ✅ AGI
    const baseTotal = Math.floor(baseAtk * perHitMul * (1 + agiBonus)) * hits;

    this.lastCastTag = "";
    let finalDmg  = baseTotal;
    let extraNote = "";

    const CHANCE = logic.chainChance || 0;
    const BONUS  = logic.chainBonus  || 0;
    if (CHANCE > 0 && Math.random() < CHANCE) {
      finalDmg  = Math.floor(baseTotal * (1 + BONUS));
      extraNote = "《連續射擊觸發：追加一輪速射》";
      this.lastCastTag = "連續射擊";
    }

    logPrepend?.(
      `🏹 ${t.name} 造成總計約 ${finalDmg} 傷害` +
      `（每輪 ${hits} 連射｜單 Hit 約 ${Math.round(perHitPct)}%｜AGI 加成約 ${Math.round(agiBonus * 100)}%）` +
      (extraNote ? " " + extraNote : "")
    );

    spendAndCooldown(this, this.mpCost);
    return finalDmg;   // 對「單一目標」的總傷害，AoE 交給 Rpg_玩家
  },

  getUpgradeCost() { return 1; },

  getDescription() {
    const t     = _getActiveTier(this);
    const L     = Math.max(1, this.level | 0);
    const logic = t.logic || {};
    const hits  = Number(logic.hits || 1);

    const perHitPct = (logic.basePct || 0) + (logic.perLvPct || 0) * (L - 1);
    const totalPct  = perHitPct * hits;
    const agiCapPct = Math.round((logic.agiCap || 0) * 100);
    const chChance  = Math.round((logic.chainChance || 0) * 100);
    const chBonus   = Math.round((logic.chainBonus  || 0) * 100);

    return (
      `${t.name}（神射手線五轉主力技能）\n` +
      `・對前方最多 ${this.maxTargets} 名敵人進行 ${hits} 連續射擊\n` +
      `・目前每擊約 ${perHitPct}% ，合計約 ${totalPct}% 傷害（會隨技能等級提升）\n` +
      `・可從 AGI 獲得額外加成，上限約 +${agiCapPct}%\n` +
      `・有 ${chChance}% 機率觸發「連續射擊」，再追加約 +${chBonus}% 的總傷害\n` +
      `・冷卻時間：約 ${t.cooldown} 秒｜消耗 MP：${t.mpCost}\n` +
      `・職業限制：神射手職業線（五轉「天穹狙神」起，往後進階皆可使用）`
    );
  }
});
/* ==== 神射手線五轉大招：神隼殲滅射擊（AGI + 連續射擊） ==== */
registerJobSkill('archer5', {
  job: "archer5",
  id: "marksman5_falcon_extermination",
  name: "神隼殲滅射擊(五轉)",
  type: "attack",
  role: "attack",
  isBasic: false,
  requiredJobTier: 5,

  requireJobLineFrom: "archer_marksman5",

  level: 1,
  maxLevel: 20,
  maxTargets: 8,

  mpCost: 70,
  cooldown: 260,

  logic: {
    basePct: 210,       // 單 Hit 基礎 210%
    perLvPct: 10,       // 每等 +10%
    hits: 7,            // 7 重殲滅射擊
    agiCap: 3.0,        // ✅ AGI 上限 +300%
    chainChance: 0.30,  // 30% 連續射擊
    chainBonus: 0.80    // 追加 80% 總傷害
  },

  currentCooldown: 0,

  use(monster) {
    const lg   = this.logic || {};
    const L    = Math.max(1, this.level | 0);
    const hits = Number(lg.hits || 1);

    const perHitPct = (lg.basePct || 0) + (lg.perLvPct || 0) * (L - 1);
    const perHitMul = perHitPct / 100;

    const baseAtk   = Math.max(player.totalStats?.atk || 1, 1);
    const agiBonus  = _getAgiBonus(lg.agiCap || 0);   // ✅ AGI
    const baseTotal = Math.floor(baseAtk * perHitMul * (1 + agiBonus)) * hits;

    this.lastCastTag = "";
    let finalDmg  = baseTotal;
    let extraNote = "";

    const CHANCE = lg.chainChance || 0;
    const BONUS  = lg.chainBonus  || 0;
    if (CHANCE > 0 && Math.random() < CHANCE) {
      finalDmg  = Math.floor(baseTotal * (1 + BONUS));
      extraNote = "《殲滅連射觸發：再追加一輪殲滅射擊》";
      this.lastCastTag = "殲滅連射";
    }

    logPrepend?.(
      `💥 ${this.name} 對最多 ${this.maxTargets} 名敵人引爆 ${hits} 重殲滅射擊，總傷害約 ${finalDmg}` +
      `（單 Hit 約 ${Math.round(perHitPct)}%｜AGI 加成約 ${Math.round(agiBonus * 100)}%）` +
      (extraNote ? " " + extraNote : "")
    );

    spendAndCooldown(this, this.mpCost);
    return finalDmg;
  },

  getUpgradeCost() { return 1; },

  getDescription() {
    const lg   = this.logic || {};
    const L    = Math.max(1, this.level | 0);
    const hits = Number(lg.hits || 1);

    const perHitPct = (lg.basePct || 0) + (lg.perLvPct || 0) * (L - 1);
    const totalPct  = perHitPct * hits;
    const agiCapPct = Math.round((lg.agiCap || 0) * 100);
    const chChance  = Math.round((lg.chainChance || 0) * 100);
    const chBonus   = Math.round((lg.chainBonus  || 0) * 100);

    return (
      `${this.name}（神射手線五轉最終級大招）\n` +
      `・對最多 ${this.maxTargets} 名敵人施放 ${hits} 重殲滅射擊\n` +
      `・目前每段約 ${perHitPct}% ，合計約 ${totalPct}% 傷害（會隨技能等級提升）\n` +
      `・可從 AGI 獲得大幅度額外加成（最高約 +${agiCapPct}%）\n` +
      `・有 ${chChance}% 機率觸發「殲滅連射」，再追加約 +${chBonus}% 的總傷害\n` +
      `・冷卻時間：約 ${this.cooldown} 秒｜消耗 MP：${this.mpCost}\n` +
      `・職業限制：神射手職業線（五轉「天穹狙神」起，往後進階皆可使用）`
    );
  }
});