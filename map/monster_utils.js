// 📦 monster_utils.js（重構版 + 防禦百分比系統）
// 功能：
// 1. 依地圖與等級區間生成怪物（Boss / 一般 / 菁英）
// 2. 掛載一般怪技能（若有 normal_monster_skills.js）
// 3. 計算怪物掉落（含難度倍率 / 玩家加成 / 全域掉落）
// 4. 依「地圖基準 + 難度 + Boss + 怪物覆蓋」計算防禦百分比 defPercent

// ---------- 小工具 ----------
function getRandomInt(min, max) {
  min = Number(min);
  max = Number(max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const toInt = (n) => {
  n = Number(n);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n + Number.EPSILON));
};

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// 將難度表正規化成數值，避免 NaN
function normalizeDifficulty(raw) {
  const d = isObj(raw) ? raw : {};
  const num = (x, def = 1) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : def;
  };
  return {
    hp:          num(d.hp, 1),
    atk:         num(d.atk, 1),
    def:         num(d.def, 1),
    gold:        num(d.gold, 1),
    stone:       num(d.stone, 1),
    item:        num(d.item, 1),
    exp:         num(d.exp, 1),
    eliteChance: num(d.eliteChance, 0.05),
    // 其他鍵保留不處理
  };
}

// 若 hp/atk/def 未提供，就用通用 stats/stat 當後備倍率（主要給 Boss 用）
function resolveStatDifficulty(raw) {
  const d = normalizeDifficulty(raw);
  const generic = Number((raw && (raw.stats ?? raw.stat))) || 1;
  return {
    ...d,
    hp:  Number.isFinite(d.hp)  && d.hp  !== 1 ? d.hp  : generic,
    atk: Number.isFinite(d.atk) && d.atk !== 1 ? d.atk : generic,
    def: Number.isFinite(d.def) && d.def !== 1 ? d.def : generic,
  };
}

// 確保 dropRates 至少具有可用結構
function normalizeDropRates(dr) {
  const out = isObj(dr) ? { ...dr } : {};

  // gold: 物件 {min,max}
  if (!isObj(out.gold)) out.gold = { min: 1, max: 1 };
  const gmin = Number(out.gold.min);
  const gmax = Number(out.gold.max);
  out.gold.min = Number.isFinite(gmin) ? gmin : 1;
  out.gold.max = Number.isFinite(gmax) ? gmax : out.gold.min;

  // stone: 物件 {chance,min,max}（可省略）
  if (out.stone !== undefined && !isObj(out.stone)) {
    // 如果有設定但不是物件，直接移除避免出錯
    delete out.stone;
  } else if (isObj(out.stone)) {
    const c = Number(out.stone.chance);
    const smin = Number(out.stone.min);
    const smax = Number(out.stone.max);
    out.stone.chance = Number.isFinite(c) ? c : 0;
    out.stone.min = Number.isFinite(smin) ? smin : 1;
    out.stone.max = Number.isFinite(smax) ? smax : out.stone.min;
  }

  return out;
}

// ---------- 將地圖設定展開為具數值範圍的怪物模板 ----------
function applyMonsterStatRanges(monsterAreaPool) {
  if (!isObj(monsterAreaPool)) return;
  for (const area in monsterAreaPool) {
    const config = monsterAreaPool[area];
    if (!isObj(config)) continue;
    if (!Array.isArray(config.monsters) || config.monsters.length === 0) continue;
    if (!isObj(config.baseStats) || !isObj(config.hpRange) || !isObj(config.atkRange) || !isObj(config.defRange)) continue;

    const base = config.baseStats;

    config.monsters = config.monsters.map(mon => {
      const name = typeof mon === "string" ? mon : mon.name;
      const hp = toInt((Number(base.hp) || 0) + getRandomInt(Number(config.hpRange.min), Number(config.hpRange.max)));
      const atk = toInt((Number(base.atk) || 0) + getRandomInt(Number(config.atkRange.min), Number(config.atkRange.max)));
      const def = toInt((Number(base.def) || 0) + getRandomInt(Number(config.defRange.min), Number(config.defRange.max)));

      const extra = {};
      if (typeof mon !== "string" && Array.isArray(mon.statusEffects)) {
        mon.statusEffects.forEach(e => {
          extra[e] = true;
          extra[`${e}Chance`] = 20;
        });
      }
      if (typeof mon !== "string" && Array.isArray(mon.buffs)) {
        if (!extra.buff) extra.buff = {};
        mon.buffs.forEach(b => extra.buff[b] = true);
      }

      return {
        name,
        baseStats: { hp, atk, def },
        exp: Number(config.exp) || 0,
        dropRates: normalizeDropRates(config.dropRates),
        extra
      };
    });
  }
}

// 若全域有 monsterAreaPool 就初始化一次
if (typeof monsterAreaPool !== "undefined") {
  applyMonsterStatRanges(monsterAreaPool);
}

// ========================================================
// 防禦百分比系統：地圖基準 + 難度 + Boss + 怪物覆蓋
// ========================================================

// 從 mapOptions（map_data.js）取得地圖基準防禦百分比 defBasePct
function getMapDefBasePct(area) {
  if (!Array.isArray(mapOptions)) return 1.0;
  const info = mapOptions.find(m => m.value === area);
  const v = Number(info && info.defBasePct);
  return (Number.isFinite(v) && v > 0) ? v : 1.0; // 預設 100%
}

// Boss 額外 +50%（是「加 0.5」，不是乘 1.5）
const BOSS_DEF_FLAT_BONUS = 0.5;

// 從怪物模板取得自己的防禦基準（可覆蓋地圖）
function getMonsterDefBaseFromTemplate(template, area) {
  if (template) {
    // 1. 直接在模板上寫 defBasePct（百分比倍率，例如 1.3 = 130%）
    if (Number.isFinite(+template.defBasePct) && +template.defBasePct > 0) {
      return +template.defBasePct;
    }
    // 2. 或寫在 extra.defBasePct
    if (template.extra && Number.isFinite(+template.extra.defBasePct) && +template.extra.defBasePct > 0) {
      return +template.extra.defBasePct;
    }
  }
  // 3. 否則吃地圖基準
  return getMapDefBasePct(area);
}

// 計算最終怪物防禦百分比：
// - 先看模板有沒有 extra.defPercentOverride（直接用它）
// - 否則 base(地圖或怪物覆蓋) × 難度def
// - 若是 Boss 再「+0.5」
// 回傳為倍率：1.0 = 100%，1.5 = 150% ...
function computeMonsterDefPercent(area, difficultyLike, template, opts) {
  opts = opts || {};
  const isBoss = !!opts.isBoss;

  // 0. 完全覆蓋：defPercentOverride
  if (template && template.extra && Number.isFinite(+template.extra.defPercentOverride)) {
    const ov = +template.extra.defPercentOverride;
    if (ov > 0) return ov;
  }

  // 1. 取得基準
  const base = getMonsterDefBaseFromTemplate(template, area);

  // 2. 難度倍率：沿用 difficulty.def
  let diffMul = 1.0;
  if (difficultyLike && typeof difficultyLike.def === "number") {
    const d = Number(difficultyLike.def);
    if (Number.isFinite(d) && d > 0) diffMul = d;
  }

  let defPercent = base * diffMul;

  // 3. Boss 額外 +50%（加 0.5）
  if (isBoss) {
    defPercent += BOSS_DEF_FLAT_BONUS;
  }

  if (!(defPercent > 0)) defPercent = 1.0;
  return defPercent;
}

// ---------- 一般怪掛技能（若有 normal_monster_skills.js） ----------

function attachNormalMonsterSkillsFromPreset(monster, templateName) {
  // 沒有技能庫就不處理
  if (typeof NORMAL_SKILL_LIB === "undefined" ||
      typeof NORMAL_MONSTER_SKILL_PRESET === "undefined") return;

  const keys = NORMAL_MONSTER_SKILL_PRESET[templateName];
  if (!Array.isArray(keys) || !keys.length) return;

  const skills = keys
    .map(k => NORMAL_SKILL_LIB[k])
    .filter(s => s && typeof s.use === "function");

  if (!skills.length) return;

  monster.skills = skills;

  // 一般怪如果會用 Buff／技能，也可以用 BossCore 的 buff/冷卻系統
  if (typeof BossCore !== "undefined" && typeof BossCore.init === "function") {
    BossCore.init(monster);
  }
}

// ========================================================
// 生怪流程拆分：Boss → 一般/菁英
// ========================================================

// ---------- Boss 相關（地圖王） ----------

function trySpawnBoss(area, rawDifficulty) {
  if (typeof mapBossPool === "undefined") return null;

  const mapSpecificBosses = Array.isArray(mapBossPool[area]) ? mapBossPool[area] : [];
  // 只保留有 encounterRate 的
  const candidates = mapSpecificBosses.filter(b =>
    Number.isFinite(Number(b?.encounterRate)) && Number(b.encounterRate) > 0
  );

  if (!candidates.length) return null;

  // 維持「獨立機率」語意：先算本次是否觸發任何 Boss
  // P(any) = 1 - Π(1 - p_i)
  const chanceAny = 1 - candidates.reduce((acc, b) => {
    const p = Math.min(1, Math.max(0, Number(b.encounterRate) / 100));
    return acc * (1 - p);
  }, 1);

  if (!(Math.random() < chanceAny)) {
    // 這次沒遇到 Boss
    return null;
  }

  // 觸發後，用 encounterRate 當權重抽一隻（等權就都給 100）
  const weights = candidates.map(b => Math.max(0, Number(b.encounterRate)));
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  let roll = Math.random() * totalW;
  let pick = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll < 0) { pick = candidates[i]; break; }
  }

  const bossConfig = pick;

  // UI 提示（若有）
  if (typeof showBossEncounterUI === "function") {
    try { showBossEncounterUI(bossConfig.name); } catch (_) {}
  }
  if (typeof logPrepend === "function") {
    try { logPrepend(`❗❗ 一股強大的氣息出現了...`); } catch (_) {}
  }
  console.log(`[系統] 觸發特殊怪物生成：${bossConfig.name}`);

  const lvl = Number(bossConfig.level) || 1;
  const dr = normalizeDropRates(bossConfig.dropRates);

  const rawExpFromCfg =
    Number.isFinite(Number(bossConfig.baseExp)) ? Number(bossConfig.baseExp) :
    Number.isFinite(Number(bossConfig.exp)) ? Number(bossConfig.exp) :
    Number.isFinite(Number(dr?.exp)) ? Number(dr.exp) :
    (10 + lvl * 2);
  const bossBaseExp = toInt(rawExpFromCfg);

  const rawGoldFromCfg =
    Number.isFinite(Number(bossConfig.baseGold)) ? Number(bossConfig.baseGold) :
    Number.isFinite(Number(dr?.gold?.max)) ? Number(dr.gold.max) :
    Number.isFinite(Number(dr?.gold?.min)) ? Number(dr.gold.min) :
    0;
  const bossBaseGold = toInt(rawGoldFromCfg);

  // Boss 屬性吃 resolveStatDifficulty（與原本語意一致）
  const diff = resolveStatDifficulty(rawDifficulty || {});

  const bossMonster = {
    ...bossConfig,
    type: "boss",                       // 明確標記 Boss 類型
    name: `👑 ${bossConfig.name}`,
    isBoss: true,
    isElite: false,
    level: lvl,
    hp: toInt((Number(bossConfig.hp) || 1) + 0) * toInt(diff.hp),
    atk: toInt(((Number(bossConfig.atk) || 1) + lvl * 12) * diff.atk),
    def: toInt(((Number(bossConfig.def) || 1) + lvl * 8) * diff.def),
    maxHp: undefined,
    dropRates: dr,
    baseExp: bossBaseExp,
    baseGold: bossBaseGold,
    extra: isObj(bossConfig.extra) ? { ...bossConfig.extra } : {}
  };

  // ⭐ Boss 的防禦百分比（地圖基準 or 覆蓋 × 難度 + 0.5）
  bossMonster.defPercent = computeMonsterDefPercent(area, diff, bossConfig, { isBoss:true });

  bossMonster.maxHp = bossMonster.hp;

  if (typeof bossMonster.init === "function") {
    try { bossMonster.init(bossMonster); } catch (_) {}
  }

  return bossMonster;
}

// ---------- 一般怪 / 菁英怪 生成 ----------

function spawnNormalOrElite(area, levelRange, difficulty) {
  // 解析等級區間
  const [minL, maxL] = String(levelRange).split("-").map(v => Number(v));
  let level = getRandomInt(
    Number.isFinite(minL) ? minL : 1,
    Number.isFinite(maxL) ? maxL : (minL || 1)
  );

  // mapOptions 來自 map_data.js
  const mapInfo = Array.isArray(mapOptions) ? mapOptions.find(m => m.value === area) : null;
  const minLevel = Number(mapInfo?.minLevel) || 1;
  if (level < minLevel) level = minLevel;

  // 選池
  const areaData = isObj(monsterAreaPool) ? monsterAreaPool[area] : null;
  const pool = areaData?.includeAll
    ? [
        ...(Array.isArray(monsterBasePool) ? monsterBasePool : []),
        ...(Array.isArray(areaData?.monsters) ? areaData.monsters : [])
      ]
    : (
        Array.isArray(areaData?.monsters) && areaData.monsters.length
          ? areaData.monsters
          : (Array.isArray(monsterBasePool) ? monsterBasePool : [])
      );

  // 若該區沒有任何怪物設定：不再回傳預設怪，直接回 null
  if (!Array.isArray(pool) || pool.length === 0) {
    console.warn(`[monster_utils] 區域 ${area} 沒有任何怪物配置，請檢查 monsterAreaPool。`);
    return null;
  }

  const template = pool[Math.floor(Math.random() * pool.length)] || {};
  const dropRates = normalizeDropRates(template.dropRates);

  // 精英怪?
  const isElite = Math.random() < difficulty.eliteChance;

  // 基礎金幣：範圍 + 等級加成（基礎值；難度在 getDrop() 再乘）
  const baseGold = toInt(getRandomInt(dropRates.gold.min, dropRates.gold.max) + (level * 2));

  // 生成怪（先當作一般怪）
  const newMonster = {
    ...template,
    type: "normal",
    name: `${template.name} Lv.${level}`,
    level,
    hp:  toInt(((Number(template.baseStats?.hp)  || 0) + level * 40) * difficulty.hp),
    atk: toInt(((Number(template.baseStats?.atk) || 0) + level * 28) * difficulty.atk),
    def: toInt(((Number(template.baseStats?.def) || 0) + level * 20) * difficulty.def),
    dropRates,
    baseExp: toInt(Number(template.exp) || 0),  // 基礎值；難度於 getDrop() 再乘
    baseGold: toInt(baseGold),                  // 基礎值；難度於 getDrop() 再乘
    isElite,
    isBoss: false,
    extra: isObj(template.extra) ? { ...template.extra } : {},
    // ⭐ 一般 / 菁英怪防禦百分比（地圖基準 or 覆蓋 × 難度）
    defPercent: computeMonsterDefPercent(area, difficulty, template, { isBoss:false })
  };

  // 一般怪：依「模板名稱」掛上技能（若 normal_monster_skills.js 有定義）
  if (!isElite) {
    attachNormalMonsterSkillsFromPreset(newMonster, template.name);
  } else {
    // 如果你希望「菁英也用同一套技能」，可以把上面那行移到外面
    attachNormalMonsterSkillsFromPreset(newMonster, template.name);
  }

  // 精英強化（屬性與金幣基礎值調整；難度加成仍在 getDrop）
  if (isElite) {
    newMonster.type = "elite";
    newMonster.hp  = toInt(newMonster.hp  * 1.5);
    newMonster.atk = toInt(newMonster.atk * 1.5);
    newMonster.def = toInt(newMonster.def * 1.5);
    newMonster.baseGold = toInt(newMonster.baseGold * 2);
    newMonster.name = `⭐精英怪 ${newMonster.name}`;

    // 隨機 1~3 狀態 + 全部 buff
    const allStatusEffects = ["poison", "burn", "paralyze", "weaken", "freeze", "bleed", "curse", "blind"];
    const allBuffs = ["atkBuff", "defBuff", "healBuff", "shieldBuff"];

    const numberOfStatusEffects = getRandomInt(1, 3);
    const selected = new Set();
    while (selected.size < numberOfStatusEffects) {
      selected.add(allStatusEffects[Math.floor(Math.random() * allStatusEffects.length)]);
    }
    for (const eff of selected) {
      newMonster.extra[eff] = true;
      newMonster.extra[`${eff}Chance`] = 100;  // 異常機率 100%（照你原本設定）
    }
    if (!newMonster.extra.buff) newMonster.extra.buff = {};
    allBuffs.forEach(b => newMonster.extra.buff[b] = true);
  }

  // 不要把 extra 推平到頂層，避免污染結構
  return newMonster;
}

// ---------- 產生怪物（統一入口） ----------
function getMonster(area, levelRange) {
  // 取得原始難度設定（可能是空物件）
  const rawDiff = (typeof getCurrentDifficulty === "function" ? getCurrentDifficulty() : {});

  // ⭐ 1) 特殊 Boss 覆蓋：如果有 SpecialBossOverride，就用它長出一隻 Boss
  if (window.SpecialBossOverride) {
    const bossCfg = window.SpecialBossOverride;
    window.SpecialBossOverride = null; // 用一次就清掉

    // 解析數值用的難度倍率（hp/atk/def/exp/gold/stone/item...）
    const diff = resolveStatDifficulty(rawDiff || {});
    const dr = normalizeDropRates(bossCfg.dropRates);
    const lvl = Number(bossCfg.level) || 1;

    const baseExp =
      Number.isFinite(Number(bossCfg.baseExp)) ? Number(bossCfg.baseExp) :
      (10 + lvl * 2);

    const baseGold =
      Number.isFinite(Number(bossCfg.baseGold)) ? Number(bossCfg.baseGold) :
      (1 + lvl * 10);

    const bossMonster = {
      ...bossCfg,
      type: "boss",
      isBoss: true,
      isElite: false,
      name: bossCfg.name || "特殊Boss",
      level: lvl,
      hp: toInt((Number(bossCfg.hp) || 1) * diff.hp),
      atk: toInt((Number(bossCfg.atk) || 1) * diff.atk),
      def: toInt((Number(bossCfg.def) || 1) * diff.def),
      maxHp: undefined,
      dropRates: dr,
      baseExp: toInt(baseExp),
      baseGold: toInt(baseGold),
      extra: isObj(bossCfg.extra) ? { ...bossCfg.extra } : {}
    };

    // ⭐ 使用同一套防禦百分比系統：
    //    地圖 defBasePct × 難度.def × Boss +0.5 × Boss.extra.defBasePct/defPercentOverride
    bossMonster.defPercent = computeMonsterDefPercent(
      area || "special_boss",
      diff,
      bossCfg,
      { isBoss: true }
    );

    bossMonster.maxHp = bossMonster.hp;

    if (typeof bossMonster.init === "function") {
      try { bossMonster.init(bossMonster); } catch (_) {}
    }

    return bossMonster;
  }

  // ⭐ 2) 原本流程：先嘗試一般地圖 Boss（mapBossPool）
  const boss = trySpawnBoss(area, rawDiff);
  if (boss) return boss;

  // 一般怪 / 菁英怪使用 normalizeDifficulty
  const difficulty = normalizeDifficulty(rawDiff);

  // 生成一般怪 / 菁英怪
  const m = spawnNormalOrElite(area, levelRange, difficulty);
  if (!m) {
    console.warn(`[monster_utils] getMonster(${area}, ${levelRange}) 產生失敗，請確認 monsterAreaPool 與 map 設定。`);
  }
  return m || null;
}


// ---------- 掉落 ----------
function getDrop(monster) {
  // 難度倍率（含預設）
  const diffRaw = (typeof getCurrentDifficulty === "function" ? getCurrentDifficulty() : {});
  const difficulty = normalizeDifficulty(diffRaw);

  // 玩家加成（容錯）
  const p = (typeof player !== "undefined" && isObj(player)) ? player : {};
  const dropRateBonus = Number(p.dropRateBonus) || 0;
  const goldRateBonus = Number(p.goldRateBonus) || 0;
  const expRateBonus  = Number(p.expRateBonus)  || 0;

  const isElite = !!monster?.isElite;
  const dropRates = normalizeDropRates(monster?.dropRates);
  const level = Number(monster?.level) || 1;

  // 金幣（基礎值 × 玩家加成 × 難度）
  const baseGold = Number(monster?.baseGold);
  const gold = toInt(
    (Number.isFinite(baseGold)
      ? baseGold
      : getRandomInt(dropRates.gold.min, dropRates.gold.max) + level * 2
    ) * (1 + goldRateBonus) * difficulty.gold
  );

  // 石頭
  let stone = 0;
  if (isObj(dropRates.stone)) {
    const stoneChance = Number(dropRates.stone.chance) * (1 + dropRateBonus);
    if (Number.isFinite(stoneChance) && Math.random() < stoneChance) {
      const base = getRandomInt(dropRates.stone.min, dropRates.stone.max);
      const bonus = Math.floor(level / 5);
      stone = toInt((base + bonus) * difficulty.stone);
    }
  }

  // 物品
  const items = [];
  const dropRateMultiplier = isElite ? 2 : 1;

  // 區域性掉落：只處理 value 是物件且具有 chance 的鍵；跳過 gold/stone/exp
  for (const itemName in dropRates) {
    if (itemName === "gold" || itemName === "stone" || itemName === "exp") continue;
    const cfg = dropRates[itemName];
    if (!isObj(cfg) || !Number.isFinite(Number(cfg.chance))) continue;
    const finalItemChance = Number(cfg.chance) * dropRateMultiplier * (1 + dropRateBonus) * difficulty.item;
    if (finalItemChance > 0 && Math.random() < finalItemChance) {
      if (typeof window.addItem === "function") {
  try {
    window.addItem(itemName, 1);
  } catch (e) {
    if (window.DEBUG_LOG) console.error("[Inventory Error]", e);
  }
} else {
  if (window.DEBUG_LOG) console.warn("[Drop] addItem not available");
}
      items.push(itemName);
    }
  }

  // 全域掉落（若無定義則跳過）
  const globalDrops = (typeof GLOBAL_DROP_RATES !== "undefined" && isObj(GLOBAL_DROP_RATES)) ? GLOBAL_DROP_RATES : {};
  for (const key in globalDrops) {
    const rec = globalDrops[key];
    if (!isObj(rec)) continue;
    const name = rec.name ?? key;
    const rate = Number(rec.rate);
    if (!Number.isFinite(rate)) continue;
    const finalGlobalChance = rate * dropRateMultiplier * (1 + dropRateBonus) * difficulty.item;
    if (finalGlobalChance > 0 && Math.random() < finalGlobalChance) {
      try { addItem(name); } catch (_) {}
      items.push(name);
    }
  }

  // 經驗（基礎值 × 等級係數 × 精英 × 玩家加成 × 難度）
  const baseExpRaw = Number(monster?.baseExp);
  const baseExpSafe = Number.isFinite(baseExpRaw) ? baseExpRaw : toInt(10 + level * 2);
  let exp = toInt(baseExpSafe * (1 + Math.max(0, level - 1) * 0.2));
  if (isElite) exp = toInt(exp * 1.5);
  const finalExp = toInt(exp * (1 + expRateBonus) * difficulty.exp);

  return { gold, stone, exp: finalExp, items };
}



// 若要外部使用，可依你的環境導出：
// export { getMonster, getDrop, applyMonsterStatRanges, normalizeDifficulty, resolveStatDifficulty };