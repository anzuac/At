// normal_monster_skills.js
// ===========================
// 一般怪物技能（含：攻擊 / 補助 / 控場）
// 釋放邏輯：補助 > 控場 > 傷害
// ===========================

/* ========================
   工具：安全呼叫 BossCore
   ======================== */
function _hasBossCore() {
  return typeof BossCore === "object" && BossCore !== null;
}

function _applyBuff(mon, payload) {
  if (_hasBossCore()) {
    try { BossCore.applyFromSkill(mon, payload); } catch (_) {}
  }
}

function _addBuff(mon, key, opt) {
  if (_hasBossCore()) {
    try { BossCore.addBuff(mon, key, opt); } catch (_) {}
  }
}

// 控場方法（需要你主程式提供 applyPlayerStatus(type, sec)）
function _applyCC(type, sec) {
  if (typeof applyPlayerStatus === "function") {
    try { applyPlayerStatus(type, sec); } catch (_) {}
  }
}

/* ========================
   技能定義：NORMAL_SKILL_LIB
   ======================== */

const NORMAL_SKILL_LIB = {

  /* =========================================================
     ALL（初始區）
  ========================================================= */
  "all-smack": {
    key: "all-smack",
    role: "attack",
    name: "野蠻拍打",
    cooldownSec: 3,
    castChance: 75,
    use: (p, m) => {
      const dmg = Math.round(m.atk * 1.1);
      logPrepend?.(`💥 ${m.name} 使用「野蠻拍打」！`);
      return dmg;
    }
  },

  "all-hop-strike": {
    key: "all-hop-strike",
    role: "attack",
    name: "跳躍撞擊",
    cooldownSec: 5,
    castChance: 55,
    logic: { ignoreDefPct: 0.2 },
    use: (p, m) => {
      const dmg = Math.round(m.atk * 1.35);
      logPrepend?.(`💢 ${m.name} 使出「跳躍撞擊」！`);
      return dmg;
    }
  },

  // 補助
  "all-battle-spirit": {
    key: "all-battle-spirit",
    role: "buff",
    name: "戰意昂揚",
    cooldownSec: 10,
    castChance: 35,
    use: (p, m) => {
      _applyBuff(m, {
        atk: { mul: 1.25, durationSec: 6 },
        buffs: {
          key: "critRate", mode: "add", value: 10, durationSec: 6
        }
      });
      logPrepend?.(`🔥 ${m.name} 士氣高昂，攻擊與爆擊提升！`);
      return 0;
    }
  },

  // 控場（暈眩 10s）
  "all-stun": {
    key: "all-stun",
    role: "control",
    name: "戰吼震懾",
    cooldownSec: 28,
    castChance: 40,
    use: (p, m) => {
      const dmg = Math.round(m.atk * 0.8);
      _applyCC("stun", 2);
      logPrepend?.(`😵 ${m.name} 的「戰吼震懾」使你暈眩！`);
      return dmg;
    }
  },


  /* =========================================================
     FOREST（森林）
  ========================================================= */
  "forest-bite": {
    key: "forest-bite",
    role: "attack",
    name: "森咬",
    cooldownSec: 4,
    castChance: 70,
    logic: { ignoreDefPct: 0.1 },
    use: (p, m) => Math.round(m.atk * 1.3)
  },

  "forest-leaf-slash": {
    key: "forest-leaf-slash",
    role: "attack",
    name: "葉刃連斬",
    cooldownSec: 6,
    castChance: 45,
    logic: { ignoreDefPct: 0.25 },
    use: (p, m) => Math.round(m.atk * 1.6)
  },

  // 補助（反傷 + 防禦）
  "forest-thorn-guard": {
    key: "forest-thorn-guard",
    role: "buff",
    name: "荊棘護身",
    cooldownSec: 14,
    castChance: 40,
    use: (p, m) => {
      _applyBuff(m, {
        def: { mul: 1.4, durationSec: 8 },
        buffs: [
          { key: "reflectPct", mode: "add", value: 10, durationSec: 8 },
          { key: "dmgReductionPct", mode: "add", value: 10, durationSec: 8 }
        ]
      });
      logPrepend?.(`🛡️ ${m.name} 身披荊棘護身！`);
      return 0;
    }
  },

  // 控場：綁定（slow + weaken）
  "forest-bind": {
    key: "forest-bind",
    role: "control",
    name: "藤蔓纏繞",
    cooldownSec: 19,
    castChance: 55,
    use: (p, m) => {
      _applyCC("slow", 6);
      _applyCC("weaken", 4);
      logPrepend?.(`🌿 ${m.name} 的藤蔓將你拖住！`);
      return Math.round(m.atk * 0.8);
    }
  },


  /* =========================================================
     SWAMP（沼澤）
  ========================================================= */
  "swamp-corrosive-blow": {
    key: "swamp-corrosive-blow",
    role: "attack",
    name: "腐蝕重擊",
    cooldownSec: 5,
    castChance: 70,
    logic: { ignoreDefPct: 0.3 },
    use: (p, m) => Math.round(m.atk * 1.4)
  },

  "swamp-poison-breath": {
    key: "swamp-poison-breath",
    role: "attack",
    name: "毒液噴吐",
    cooldownSec: 7,
    castChance: 50,
    logic: { ignoreDefPct: 0.15 },
    use: (p, m) => Math.round(m.atk * 1.2)
  },

  // 補助
  "swamp-mud-armor": {
    key: "swamp-mud-armor",
    role: "buff",
    name: "泥沼護甲",
    cooldownSec: 16,
    castChance: 35,
    use: (p, m) => {
      _applyBuff(m, {
        def: { mul: 1.6, durationSec: 10 },
        buffs: { key: "dmgReductionPct", mode: "add", value: 15, durationSec: 10 }
      });
      logPrepend?.(`🪵 ${m.name} 以泥沼覆身！`);
      return 0;
    }
  },

  // 控場：中毒（DoT）
  "swamp-toxic-bind": {
    key: "swamp-toxic-bind",
    role: "control",
    name: "沼毒束縛",
    cooldownSec: 12,
    castChance: 50,
    use: (p, m) => {
      _applyCC("poison", 4); // 需要你主程序處理 DoT
      logPrepend?.(`☠️ ${m.name} 讓你中了沼毒！`);
      return Math.round(m.atk * 0.7);
    }
  },

  /* =========================================================
     LAVA（熔岩）
  ========================================================= */
  "lava-flame-claw": {
    key: "lava-flame-claw",
    role: "attack",
    name: "熾焰爪擊",
    cooldownSec: 4,
    castChance: 70,
    logic: { ignoreDefPct: 0.3 },
    use: (p, m) => Math.round(m.atk * 1.45)
  },

  "lava-core-burst": {
    key: "lava-core-burst",
    role: "attack",
    name: "熔核爆裂",
    cooldownSec: 7,
    castChance: 45,
    logic: { ignoreDefPct: 0.4 },
    use: (p, m) => Math.round(m.atk * 1.7)
  },

  // 補助
  "lava-enrage": {
    key: "lava-enrage",
    role: "buff",
    name: "熔岩狂怒",
    cooldownSec: 14,
    castChance: 35,
    use: (p, m) => {
      _applyBuff(m, {
        atk: { mul: 1.5, durationSec: 8 },
        buffs: [
          { key: "lifestealPct", mode: "add", value: 10, durationSec: 8 },
          { key: "critRate", mode: "add", value: 10, durationSec: 8 }
        ]
      });
      return 0;
    }
  },

  // 控場：灼傷 DoT
  "lava-burn": {
    key: "lava-burn",
    role: "control",
    name: "灼焰灼傷",
    cooldownSec: 11,
    castChance: 40,
    use: (p, m) => {
      _applyCC("burn", 4);
      logPrepend?.(`🔥 ${m.name} 使你陷入灼燒！`);
      return Math.round(m.atk * 0.9);
    }
  },

  /* =========================================================
     AQUA（水）
  ========================================================= */
  "aqua-wave": {
    key: "aqua-wave",
    role: "attack",
    name: "水壓衝擊",
    cooldownSec: 4,
    castChance: 70,
    logic: { ignoreDefPct: 0.2 },
    use: (p, m) => Math.round(m.atk * 1.35)
  },

  "aqua-whirlpool-crush": {
    key: "aqua-whirlpool-crush",
    role: "attack",
    name: "旋渦重壓",
    cooldownSec: 7,
    castChance: 45,
    logic: { ignoreDefPct: 0.3 },
    use: (p, m) => Math.round(m.atk * 1.6)
  },

  // 補助
  "aqua-shell": {
    key: "aqua-shell",
    role: "buff",
    name: "水幕護盾",
    cooldownSec: 15,
    castChance: 35,
    use: (p, m) => {
      _applyBuff(m, {
        def: { mul: 1.4, durationSec: 9 },
        buffs: [
          { key: "regenPct", mode: "add", value: 3, durationSec: 9 },
          { key: "dmgReductionPct", mode: "add", value: 10, durationSec: 9 }
        ]
      });
      return 0;
    }
  },

  // 控場：流體衝擊（slow）
  "aqua-slow": {
    key: "aqua-slow",
    role: "control",
    name: "水流衝擊",
    cooldownSec: 18,
    castChance: 40,
    use: (p, m) => {
      _applyCC("slow", 6);
      logPrepend?.(`💦 ${m.name} 讓你陷入水流干擾！`);
      return Math.round(m.atk * 0.8);
    }
  },

  /* ===== WIND（風） ===== */
  "wind-slash": {
    key: "wind-slash",
    role: "attack",
    name: "風刃斬",
    cooldownSec: 3,
    castChance: 75,
    logic: { ignoreDefPct: 0.2 },
    use: (p, m) => Math.round(m.atk * 1.3)
  },

  "wind-gust-assault": {
    key: "wind-gust-assault",
    role: "attack",
    name: "亂流突襲",
    cooldownSec: 6,
    castChance: 45,
    logic: { ignoreDefPct: 0.3 },
    use: (p, m) => Math.round(m.atk * 1.55)
  },

  // 補助
  "wind-evasion": {
    key: "wind-evasion",
    role: "buff",
    name: "亂流閃避",
    cooldownSec: 12,
    castChance: 35,
    use: (p, m) => {
      _applyBuff(m, {
        buffs: [
          { key: "speedMul", mode: "mul", value: 1.4, durationSec: 7 },
          { key: "evasion",  mode: "add", value: 20, durationSec: 7 }
        ]
      });
      return 0;
    }
  },

  // 控場：推飛（短暫 stun）
  "wind-knock": {
    key: "wind-knock",
    role: "control",
    name: "風壓擊退",
    cooldownSec: 19,
    castChance: 45,
    use: (p, m) => {
      _applyCC("stun", 5);
      logPrepend?.(`💨 ${m.name} 的風壓擊退使你動彈不得！`);
      return Math.round(m.atk * 0.9);
    }
  },

  /* ===== LIGHTNING（雷） ===== */
  "lightning-bolt": {
    key: "lightning-bolt",
    role: "attack",
    name: "雷霆一擊",
    cooldownSec: 4,
    castChance: 70,
    logic: { ignoreDefPct: 0.35 },
    use: (p, m) => Math.round(m.atk * 1.5)
  },

  "lightning-chain": {
    key: "lightning-chain",
    role: "attack",
    name: "連鎖雷擊",
    cooldownSec: 7,
    castChance: 45,
    logic: { ignoreDefPct: 0.4 },
    use: (p, m) => Math.round(m.atk * 1.7)
  },

  // 補助
  "lightning-crit-focus": {
    key: "lightning-crit-focus",
    role: "buff",
    name: "雷光蓄能",
    cooldownSec: 15,
    castChance: 30,
    use: (p, m) => {
      _applyBuff(m, {
        buffs: [
          { key: "critRate", mode: "add", value: 20, durationSec: 8 },
          { key: "critDmgMul", mode: "mul", value: 1.4, durationSec: 8 }
        ]
      });
      return 0;
    }
  },

  // 控場：麻痺（paralyze）
  "lightning-paralyze": {
    key: "lightning-paralyze",
    role: "control",
    name: "電擊麻痺",
    cooldownSec: 18,
    castChance: 35,
    use: (p, m) => {
      _applyCC("paralyze",3);
      logPrepend?.(`⚡ ${m.name} 使你麻痺無法動作！`);
      return Math.round(m.atk * 0.8);
    }
  },

  /* ===== ICE（冰） ===== */
  "ice-spike": {
    key: "ice-spike",
    role: "attack",
    name: "冰刺突襲",
    cooldownSec: 4,
    castChance: 70,
    logic: { ignoreDefPct: 0.2 },
    use: (p, m) => Math.round(m.atk * 1.35)
  },

  "ice-crash": {
    key: "ice-crash",
    role: "attack",
    name: "凍結重擊",
    cooldownSec: 7,
    castChance: 45,
    logic: { ignoreDefPct: 0.3 },
    use: (p, m) => Math.round(m.atk * 1.6)
  },

  // 補助
  "ice-armor": {
    key: "ice-armor",
    role: "buff",
    name: "寒霜護甲",
    cooldownSec: 15,
    castChance: 35,
    use: (p, m) => {
      _applyBuff(m, {
        def: { mul: 1.5, durationSec: 9 },
        buffs: { key: "dmgReductionPct", mode: "add", value: 15, durationSec: 9 }
      });
      return 0;
    }
  },

  // 控場：凍結
  "ice-freeze": {
    key: "ice-freeze",
    role: "control",
    name: "極寒凍結",
    cooldownSec: 35,
    castChance: 45,
    use: (p, m) => {
      _applyCC("freeze", 5);
      logPrepend?.(`❄️ ${m.name} 將你凍住無法行動！`);
      return Math.round(m.atk * 0.7);
    }
  },

  /* ===== SHADOW（影） ===== */
  "shadow-slash": {
    key: "shadow-slash",
    role: "attack",
    name: "暗影斬擊",
    cooldownSec: 4,
    castChance: 70,
    logic: { ignoreDefPct: 0.35 },
    use: (p, m) => Math.round(m.atk * 1.5)
  },

  "shadow-fang-rush": {
    key: "shadow-fang-rush",
    role: "attack",
    name: "闇蝕連牙",
    cooldownSec: 7,
    castChance: 45,
    logic: { ignoreDefPct: 0.4 },
    use: (p, m) => Math.round(m.atk * 1.7)
  },

  // 補助
  "shadow-fade": {
    key: "shadow-fade",
    role: "buff",
    name: "隱匿之影",
    cooldownSec: 14,
    castChance: 35,
    use: (p, m) => {
      _applyBuff(m, {
        buffs: [
          { key: "evasion", mode: "add", value: 30, durationSec: 8 },
          { key: "speedMul", mode: "mul", value: 1.4, durationSec: 8 }
        ]
      });
      return 0;
    }
  },

  // 控場：盲目（命中下降）
  "shadow-blind": {
    key: "shadow-blind",
    role: "control",
    name: "暗影致盲",
    cooldownSec: 11,
    castChance: 45,
    use: (p, m) => {
      _applyCC("blind", 3);
      logPrepend?.(`🌑 ${m.name} 使你視野受阻，命中急降！`);
      return Math.round(m.atk * 0.8);
    }
  },

  /* ===== HELL（煉獄） ===== */
  "hell-flame-burst": {
    key: "hell-flame-burst",
    role: "attack",
    name: "煉獄爆炎",
    cooldownSec: 5,
    castChance: 75,
    logic: { ignoreDefPct: 0.45 },
    use: (p, m) => Math.round(m.atk * 1.7)
  },

  "hell-smash": {
    key: "hell-smash",
    role: "attack",
    name: "焰獄重擊",
    cooldownSec: 8,
    castChance: 45,
    logic: { ignoreDefPct: 0.5 },
    use: (p, m) => Math.round(m.atk * 1.9)
  },

  // 補助
  "hell-blood-rage": {
    key: "hell-blood-rage",
    role: "buff",
    name: "血焰狂怒",
    cooldownSec: 18,
    castChance: 35,
    use: (p, m) => {
      _applyBuff(m, {
        atk: { mul: 1.7, durationSec: 10 },
        buffs: [
          { key: "lifestealPct", mode: "add", value: 15, durationSec: 10 },
          { key: "speedMul", mode: "mul", value: 1.3, durationSec: 10 }
        ]
      });
      return 0;
    }
  },

  // 控場：恐懼（fear）
  "hell-fear": {
    key: "hell-fear",
    role: "control",
    name: "恐懼侵蝕",
    cooldownSec: 60,
    castChance: 40,
    use: (p, m) => {
      _applyCC("fear", 20);
      logPrepend?.(`😱 ${m.name} 讓你陷入恐懼！`);
      return Math.round(m.atk * 0.9);
    }
  },


  /* ===== HOLY（聖） ===== */
  "holy-smite": {
    key: "holy-smite",
    role: "attack",
    name: "聖光制裁",
    cooldownSec: 5,
    castChance: 70,
    logic: { ignoreDefPct: 0.3 },
    use: (p, m) => Math.round(m.atk * 1.6)
  },

  "holy-lance": {
    key: "holy-lance",
    role: "attack",
    name: "裁決光矛",
    cooldownSec: 8,
    castChance: 45,
    logic: { ignoreDefPct: 0.4 },
    use: (p, m) => Math.round(m.atk * 1.8)
  },

  // 補助
  "holy-aegis-lite": {
    key: "holy-aegis-lite",
    role: "buff",
    name: "簡易聖盾",
    cooldownSec: 16,
    castChance: 35,
    use: (p, m) => {
      _applyBuff(m, {
        def: { mul: 1.5, durationSec: 9 },
        buffs: [
          { key: "regenPct", mode: "add", value: 4, durationSec: 9 },
          { key: "dmgReductionPct", mode: "add", value: 15, durationSec: 9 }
        ]
      });
      return 0;
    }
  },

  // 控場：沉默
  "holy-silence": {
    key: "holy-silence",
    role: "control",
    name: "神聖沉默",
    cooldownSec: 42,
    castChance: 40,
    use: (p, m) => {
      _applyCC("silence", 8);
      logPrepend?.(`🔇 ${m.name} 封鎖你的技能！`);
      return Math.round(m.atk * 0.8);
    }
  },

  /* ===== CORE（核心） ===== */
  "core-chaos-strike": {
    key: "core-chaos-strike",
    role: "attack",
    name: "混沌重擊",
    cooldownSec: 5,
    castChance: 75,
    logic: { ignoreDefPct: 0.5 },
    use: (p, m) => Math.round(m.atk * 1.9)
  },

  "core-data-rip": {
    key: "core-data-rip",
    role: "attack",
    name: "資料撕裂",
    cooldownSec: 8,
    castChance: 45,
    logic: { ignoreDefPct: 0.55 },
    use: (p, m) => Math.round(m.atk * 2.0)
  },

  // 補助
  "core-overclock": {
    key: "core-overclock",
    role: "buff",
    name: "核心超頻",
    cooldownSec: 20,
    castChance: 30,
    use: (p, m) => {
      _applyBuff(m, {
        atk: { mul: 1.6, durationSec: 10 },
        def: { mul: 1.4, durationSec: 10 },
        buffs: { key: "speedMul", mode: "mul", value: 1.4, durationSec: 10 }
      });
      return 0;
    }
  },

  // 控場：資料干擾（blind + slow）
  "core-interrupt": {
    key: "core-interrupt",
    role: "control",
    name: "資料干擾",
    cooldownSec: 45,
    castChance: 45,
    use: (p, m) => {
      _applyCC("blind", 30);
      _applyCC("slow", 30);
      logPrepend?.(`🌀 ${m.name} 扭曲你的資料流，視野與速度都下降！`);
      return Math.round(m.atk * 1.0);
    }
  }
};

/* ==============================
   哪隻一般怪用哪些技能（含控場）
   ============================== */

const NORMAL_MONSTER_SKILL_PRESET = {
  "藍寶": ["lava-burn", "all-stun", "all-battle-spirit",],
  "嫩寶": ["all-smack", "all-hop-strike", "all-stun"],
  "紅寶": ["all-smack", "all-hop-strike", "all-battle-spirit", "all-stun"],

  "嫩葉小獸": ["forest-bite", "forest-bind", "forest-thorn-guard"],
  "森林刺蝟": ["forest-bite", "forest-leaf-slash", "forest-bind", "forest-thorn-guard"],
  "花粉蜂群": ["forest-bite", "forest-leaf-slash", "forest-bind"],

  "毒泥蛙": ["swamp-corrosive-blow", "swamp-toxic-bind"],
  "爛泥人": ["swamp-corrosive-blow", "swamp-mud-armor", "swamp-toxic-bind"],
  "酸牙蛇": ["swamp-corrosive-blow", "swamp-poison-breath", "swamp-toxic-bind"],

  "炎岩犬": ["lava-flame-claw", "lava-burn"],
  "熔火飛龍": ["lava-flame-claw", "lava-core-burst", "lava-enrage", "lava-burn"],
  "熾焰蟲王": ["lava-flame-claw", "lava-core-burst", "lava-enrage", "lava-burn"],

  "水珠精靈": ["aqua-wave", "aqua-shell", "aqua-slow"],
  "潮汐蟹將": ["aqua-wave", "aqua-whirlpool-crush", "aqua-shell", "aqua-slow"],
  "泡泡魚魔": ["aqua-wave", "aqua-whirlpool-crush", "aqua-slow"],

  "風翔鷹": ["wind-slash", "wind-knock"],
  "亂流精靈": ["wind-slash", "wind-gust-assault", "wind-evasion", "wind-knock"],
  "旋風狸": ["wind-slash", "wind-gust-assault", "wind-knock"],

  "電鰻獸": ["lightning-bolt", "lightning-paralyze"],
  "雷翼飛蛇": ["lightning-bolt", "lightning-chain", "lightning-crit-focus", "lightning-paralyze"],
  "電擊魔球": ["lightning-bolt", "lightning-chain", "lightning-paralyze"],

  "冰晶熊": ["ice-spike", "ice-freeze", "ice-armor"],
  "霜翼飛鳥": ["ice-spike", "ice-crash", "ice-freeze"],
  "凍霧鬼靈": ["ice-spike", "ice-crash", "ice-freeze", "ice-armor"],

  "影牙狼": ["shadow-slash", "shadow-blind"],
  "幻影妖狐": ["shadow-slash", "shadow-fang-rush", "shadow-fade", "shadow-blind"],
  "夜目貓鬼": ["shadow-slash", "shadow-blind", "shadow-fade"],

  "焰獄魔犬": ["hell-flame-burst", "hell-fear"],
  "深紅惡魔": ["hell-flame-burst", "hell-smash", "hell-blood-rage", "hell-fear"],
  "灼魂使者": ["hell-flame-burst", "hell-smash", "hell-fear"],

  "聖羽靈獸": ["holy-smite", "holy-silence", "holy-aegis-lite"],
  "光焰天使": ["holy-smite", "holy-lance", "holy-aegis-lite", "holy-silence"],
  "審判巨像": ["holy-smite", "holy-lance", "holy-aegis-lite", "holy-silence"],

  "核心暴君": ["core-chaos-strike", "core-interrupt", "core-overclock"],
  "資料巨獸": ["core-chaos-strike", "core-overclock", "core-interrupt"],
  "時空觀察者": ["core-chaos-strike", "core-data-rip", "core-overclock", "core-interrupt"]
};

/* ==============================
   掛到全域
   ============================== */
try {
  if (typeof window !== "undefined") {
    window.NORMAL_SKILL_LIB = NORMAL_SKILL_LIB;
    window.NORMAL_MONSTER_SKILL_PRESET = NORMAL_MONSTER_SKILL_PRESET;
  }
} catch (_) {}