const GLOBAL_DROP_RATES = {
  cube: { name: "轉職寶珠", rate: 0.08 },
  s4: { name: "怪物獎牌", rate: 0.03 },
  s6: { name: "咒文痕跡", rate: 0.11 },
  s2: { name: "強化道具兌換券", rate: 0.09 },
  s3: { name: "能力方塊", rate: 0.0002 },
  star: { name: "生命藥水", rate: 0.0093 },
  shard: { name: "法力藥水", rate: 0.0095 },
  S4: { name: "高級生命藥水", rate: 0.014 },
  s5: { name: "高級法力藥水", rate: 0.012 }
};
// ✅ 完整 monster_config.js 整合後版本

const monsterAreaPool = {
  
  all: {
    includeAll: false,
    baseStats: { hp: 30, atk: 5, def: 5 },
    hpRange: { min: -0, max: 0 },
    atkRange: { min: -15, max: 1 },
    defRange: { min: -15, max: 0 },
    exp: 5,
    dropRates: {
      gold: { min: 5, max: 8 },
      stone: { chance: 0.1, min: 8, max: 12 },
     "低階潛能解放鑰匙": { chance: 0.01  },
    },
    mapEffects: {
      statusEffects: ["poison", "paralyze", "burn", "dodge"],
      buffs: ["atkBuff", "defBuff", "healBuff"]
    },
    monsters: ["藍寶", "嫩寶", "紅寶"]
  },
  // 1. 森林地區（已存在）
  forest: {
    includeAll: false,
    baseStats: { hp: 400, atk: 30, def: 20 },
    hpRange: { min: -100, max: 100 },
    atkRange: { min: -10, max: 10 },
    defRange: { min: -5, max: 5 },
    exp: 15,
    dropRates: {
      gold: { min: 20, max: 25 },
      stone: { chance: 0.4, min: 8, max: 16 },
      "低階潛能解放鑰匙": { chance: 0.02  },
      "森林精華": { chance: 0.05, min: 1, max: 1 }
    },
    mapEffects: {
      statusEffects: ["poison", "paralyze"],
      buffs: ["atkBuff", "defBuff", "healBuff"]
    },
    monsters: ["嫩葉小獸", "森林刺蝟", "花粉蜂群"]
  },

  // 2. 沼澤地區
  swamp: {
    includeAll: false,
    baseStats: { hp: 500, atk: 40, def: 25 },
    hpRange: { min: -80, max: 120 },
    atkRange: { min: -5, max: 10 },
    defRange: { min: -5, max: 5 },
    exp: 25,
    dropRates: {
      gold: { min: 25, max: 40 },
      stone: { chance: 0.5, min: 8, max: 14 },
      "低階潛能解放鑰匙": { chance: 0.03  },
      "沼澤精華": { chance: 0.05, min: 1, max: 1 }
    },
    mapEffects: {
      statusEffects: ["poison", "weaken"],
      buffs: ["healBuff"]
    },
    monsters: ["毒泥蛙", "爛泥人", "酸牙蛇"]
  },

  // 3. 熔岩地區
  lava: {
    includeAll: false,
    baseStats: { hp: 750, atk: 60, def: 30 },
    hpRange: { min: -100, max: 150 },
    atkRange: { min: -10, max: 15 },
    defRange: { min: -5, max: 5 },
    exp: 40,
    dropRates: {
      gold: { min: 35, max: 55 },
      stone: { chance: 0.6, min: 10, max: 18 },
      "低階潛能解放鑰匙": { chance: 0.04  },
      "熔岩精華": { chance: 0.05, min: 1, max: 1 }
    },
    mapEffects: {
      statusEffects: ["burn", "paralyze"],
      buffs: ["atkBuff"]
    },
    monsters: ["炎岩犬", "熔火飛龍", "熾焰蟲王"]
  },

  // 4. 天水之境
  aqua: {
    includeAll: false,
    baseStats: { hp: 900, atk: 65, def: 35 },
    hpRange: { min: -80, max: 130 },
    atkRange: { min: -10, max: 10 },
    defRange: { min: -5, max: 5 },
    exp: 55,
    dropRates: {
      gold: { min: 45, max: 60 },
      stone: { chance: 0.4, min: 10, max: 18 },
      "低階潛能解放鑰匙": { chance: 0.05  },
      "天水精華": { chance: 0.05, min: 1, max: 1 }
    },
    mapEffects: {
      statusEffects: ["freeze"],
      buffs: ["healBuff", "defBuff"]
    },
    monsters: ["水珠精靈", "潮汐蟹將", "泡泡魚魔"]
  },

  // 5. 風靈山巔
  wind: {
    includeAll: false,
    baseStats: { hp: 1000, atk: 80, def: 40 },
    hpRange: { min: -100, max: 120 },
    atkRange: { min: -10, max: 15 },
    defRange: { min: -5, max: 5 },
    exp: 70,
    dropRates: {
      gold: { min: 55, max: 75 },
      stone: { chance: 0.5, min: 12, max: 20 },
      "中階潛能解放鑰匙": { chance: 0.06 },
      "風靈精華": { chance: 0.05, min: 1, max: 1 }
    },
    mapEffects: {
      statusEffects: ["weaken", "paralyze"],
      buffs: ["atkBuff", "evasionBuff"]
    },
    monsters: ["風翔鷹", "亂流精靈", "旋風狸"]
  },

  // 6. 雷光之域
  lightning: {
    includeAll: false,
    baseStats: { hp: 1200, atk: 100, def: 50 },
    hpRange: { min: -100, max: 150 },
    atkRange: { min: -10, max: 20 },
    defRange: { min: -5, max: 10 },
    exp: 90,
    dropRates: {
      gold: { min: 65, max: 90 },
      stone: { chance: 0.55, min: 14, max: 24 },
      "中階潛能解放鑰匙": { chance: 0.07 },
      "雷光精華": { chance: 0.05, min: 1, max: 1 }
    },
    mapEffects: {
      statusEffects: ["paralyze"],
      buffs: ["atkBuff", "critBuff"]
    },
    monsters: ["電鰻獸", "雷翼飛蛇", "電擊魔球"]
  },

  // 7. 冰霜谷地
  ice: {
    includeAll: false,
    baseStats: { hp: 1300, atk: 110, def: 60 },
    hpRange: { min: -80, max: 120 },
    atkRange: { min: -10, max: 15 },
    defRange: { min: -5, max: 5 },
    exp: 105,
    dropRates: {
      gold: { min: 70, max: 95 },
      stone: { chance: 0.5, min: 14, max: 24 },
      "中階潛能解放鑰匙": { chance: 0.08 },
      "冰霜精華": { chance: 0.05, min: 1, max: 1 }
    },
    mapEffects: {
      statusEffects: ["freeze"],
      buffs: ["defBuff"]
    },
    monsters: ["冰晶熊", "霜翼飛鳥", "凍霧鬼靈"]
  },

  // 8. 黯影森林
  shadow: {
    includeAll: false,
    baseStats: { hp: 1400, atk: 120, def: 65 },
    hpRange: { min: -100, max: 130 },
    atkRange: { min: -10, max: 15 },
    defRange: { min: -5, max: 5 },
    exp: 120,
    dropRates: {
      gold: { min: 75, max: 100 },
      stone: { chance: 0.5, min: 15, max: 26 },
      "高階潛能解放鑰匙": { chance: 0.08 },
      "黯影精華": { chance: 0.05, min: 1, max: 1 }
    },
    mapEffects: {
      statusEffects: ["curse", "blind"],
      buffs: ["evasionBuff"]
    },
    monsters: ["影牙狼", "幻影妖狐", "夜目貓鬼"]
  },

  // 9. 煉獄深淵
  hell: {
    includeAll: false,
    baseStats: { hp: 1600, atk: 135, def: 75 },
    hpRange: { min: -100, max: 150 },
    atkRange: { min: -10, max: 20 },
    defRange: { min: -5, max: 10 },
    exp: 140,
    dropRates: {
      gold: { min: 85, max: 110 },
      stone: { chance: 0.55, min: 16, max: 28 },
      "高階潛能解放鑰匙": { chance: 0.10 },
      "煉獄精華": { chance: 0.05, min: 1, max: 1 }
    },
    mapEffects: {
      statusEffects: ["burn", "weaken"],
      buffs: ["atkBuff", "critBuff"]
    },
    monsters: ["焰獄魔犬", "深紅惡魔", "灼魂使者"]
  },

  // 10. 聖光神殿
  holy: {
    includeAll: false,
    baseStats: { hp: 1800, atk: 150, def: 80 },
    hpRange: { min: -100, max: 130 },
    atkRange: { min: -10, max: 20 },
    defRange: { min: -5, max: 10 },
    exp: 160,
    dropRates: {
      gold: { min: 90, max: 120 },
      stone: { chance: 0.6, min: 18, max: 30 },
      "高階潛能解放鑰匙": { chance: 0.10 , min: 1, max: 2},
      "聖光精華": { chance: 0.05, min: 1, max: 1 }
    },
    mapEffects: {
      statusEffects: ["bleed"],
      buffs: ["healBuff", "defBuff"]
    },
    monsters: ["聖羽靈獸", "光焰天使", "審判巨像"]
  },

  // 11. 核心地區
  core: {
    includeAll: false,
    baseStats: { hp: 3000, atk: 200, def: 100 },
    hpRange: { min: -150, max: 200 },
    atkRange: { min: -20, max: 30 },
    defRange: { min: -10, max: 20 },
    exp: 300,
    dropRates: {
      gold: { min: 120, max: 160 },
      stone: { chance: 0.6, min: 20, max: 40 },
      "高階潛能解放鑰匙": { chance: 0.10 , min: 1, max: 3},
      "核心精華": { chance: 0.05, min: 1, max: 1 }
    },
    mapEffects: {
      statusEffects: ["curse", "freeze", "burn"],
      buffs: ["atkBuff", "defBuff", "healBuff"]
    },
    monsters: ["核心暴君", "資料巨獸", "時空觀察者"]
  },
  
    max: {
    includeAll: false,
    baseStats: { hp: 300000000, atk: 0, def: 0 },
    hpRange: { min: -150, max: 200 },
    atkRange: { min: -2000000, max: 0 },
    defRange: { min: -1000000, max: 0 },
    exp: 0,
    dropRates: {
      gold: { min: 0, max: 0 },
      stone: { chance: 0, min: 20, max: 40 },
      "核心精華": { chance: 0, min: 1, max: 1 }
    },
    mapEffects: {
      statusEffects: ["curse", "freeze", "burn"],
      buffs: ["atkBuff", "defBuff", "healBuff"]
    },
    monsters: ["???", "???", "???"]
  }
  
};

