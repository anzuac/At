// bosses.js (整合了冷卻機制的最終版)

const mapBossPool = {
  all: [
   {
  name: "測試",
  isMapBoss: true,
  level: 1,
  hp: 100000000,
  atk: 0,
  def: 0,
  baseExp: 0,
  baseGold: 20,
  encounterRate: 0,

  dropRates: {
    gold: { min: 10, max: 20 },
    stone: { chance: 1, min: 0, max: 0 },
  },
  extra: {
    burn: true,
    burnChance: 100,
  },
  // 內部狀態（面板/顯示相容欄位）
  baseAtk: null,
  baseDef: null,
  naturalDef: null,
  _enragedTurns: 0,
  _enrageMul: 1,
  _rootShieldTurns: 0,
  _shieldMul: 1,
  _defBuffTurns: 0,
  _defMulForUi: 1,

  // 單階段王：優先序 → 攻擊速度 Buff → 防禦 Buff → 攻擊 Buff → 普攻
  controller(monster /*, currentHP */) {
    // 攻擊速度 Buff ready?
    const needSpeed =
      BossCore.getBuffTurns(monster, "speedMul") <= 0 &&
      BossCore.getSkillCooldown(monster, "speed-buff") <= 0;

    if (needSpeed) {
      monster.nextSkill = this.skills.find(s => s.key === "speed-buff");
      return;
    }

    // 防禦 Buff ready?
    const needDef =
      BossCore.getBuffTurns(monster, "def") <= 0 &&
      BossCore.getSkillCooldown(monster, "def-buff") <= 0;

    if (needDef) {
      monster.nextSkill = this.skills.find(s => s.key === "def-buff");
      return;
    }

    // 攻擊 Buff ready?
    const needAtk =
      BossCore.getBuffTurns(monster, "atk") <= 0 &&
      BossCore.getSkillCooldown(monster, "atk-buff") <= 0;

    if (needAtk) {
      monster.nextSkill = this.skills.find(s => s.key === "atk-buff");
      return;
    }

    // 其餘時間普攻
    monster.nextSkill = this.skills.find(s => s.key === "basic");
  },

  // 技能（秒制）：兩個 Buff（各 40s 持續、80s 冷卻） + 普攻
  skills: [
    // 普攻
    {
      key: "basic",
      name: "衝撞",
      description: "造成 100% 傷害（無冷卻）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.max(0, Math.round(m.atk * 1.0));
        logPrepend?.(`🗡️ ${m.name} 使用「衝撞」！造成 ${dmg} 點傷害`);
        return dmg;
      }
    },

    // 防禦 Buff：×10，持續 40 秒，冷卻 80 秒
    {
      key: "def-buff",
      name: "防禦硬化",
      description: "防禦力×10，持續 40s（冷卻 80s）",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, { def: { mul: 10, durationSec: 40 } });
        BossCore.setSkillCooldown(m, "def-buff", 80);
        logPrepend?.(`🛡️ ${m.name} 施放「防禦硬化」！DEF 強化中（40s）`);
        return 0; // 強化技不直接造成傷害
      }
    },

    // 攻擊 Buff：×10，持續 40 秒，冷卻 80 秒
    {
      key: "atk-buff",
      name: "狂怒咆哮",
      description: "攻擊力×10，持續 40s（冷卻 80s）",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, { atk: { mul: 10, durationSec: 40 } });
        BossCore.setSkillCooldown(m, "atk-buff", 80);
        logPrepend?.(`💢 ${m.name} 施放「狂怒咆哮」！ATK 強化中（40s）`);
        return 0;
      }
    },

    // --- 新增：攻擊速度 Buff 技能 ---
    {
      key: "speed-buff",
      name: "疾風步伐",
      description: "攻擊速度提升 50%，持續 15s（冷卻 25s）",
      castChance: 100,
      use: (p, m) => {
        // 使用 BossCore.addBuff 來套用 speedMul Buff
        BossCore.addBuff(m, "speedMul", {
          mode: "mul",
          value: 0.5, // 1.5 倍攻擊速度
          durationSec: 15
        });
        // 設定冷卻時間
        BossCore.setSkillCooldown(m, "speed-buff", 25);
        logPrepend(`💨 ${m.name} 疾風步伐！攻擊速度提升！`);
        return 0;
      }
    },
    // --- 新增結束 ---
  ],

  // 回合結束：如果你仍用回合滴答，每回合當 1 秒
  _tickEndTurn(mon) {
    BossCore.endTurn(mon);
  },

  // 初始化
  init(monster) {
    BossCore.init(monster);
    if (monster.baseAtk == null) monster.baseAtk = monster.atk;
    if (monster.baseDef == null) monster.baseDef = monster.def;
    if (monster.naturalDef == null) monster.naturalDef = monster.def;
    monster._enragedTurns = 0;
    monster._rootShieldTurns = 0;
    monster.skills = this.skills;
  }
}


],
  
  
  forest: [
  // 森林王.js
// 簡潔版 Boss 物件，所有核心狀態由 boss_core.js 管理。

{
  name: "森林王",
  isMapBoss: true,
  level: 8,
  hp: 8000,
  atk: 120,
  def: 80,
  baseExp: 350,
  baseGold: 500,
  baseGed: 500,
  encounterRate: 5,
  dropRates: {
    gold: { min: 150, max: 280 },
    
    stone: { chance: 1, min: 20, max: 45 },
    "鑽石抽獎券": { chance: 1 ,min: 1, max: 1 },
    "低階潛能解放鑰匙": { chance: 0.20 , min: 1, max: 5 },
    "森林精華": { chance: 0.30, min: 1, max: 2 },
    "粗糙樹皮": { chance: 0.20 },
    "藤蔓": { chance: 0.20 }
  },





  extra: {
    poison: true,
    poisonChance: 5
    
  },

  baseAtk: null,
  naturalDef: null,
  _enragedTurns: 0,
  _rootShieldTurns: 0,

  _tickEndTurn(m) { BossCore.endTurn(m); },

controller(monster, currentHP) {
  const atkActive = BossCore.getBuffTurns(monster, 'atk') > 0;
  const defActive = BossCore.getBuffTurns(monster, 'def') > 0;

  if (!atkActive && BossCore.getSkillCooldown(monster, 'atk-buff') <= 0) {
    monster.nextSkill = this.skills.find(s => s.key === "atk-buff");
    return;
  }
  if (!defActive && BossCore.getSkillCooldown(monster, 'def-buff') <= 0) {
    monster.nextSkill = this.skills.find(s => s.key === "def-buff");
    return;
  }

  if (BossCore.getSkillCooldown(monster, 'heavy') <= 0) {
    monster.nextSkill = this.skills.find(s => s.key === "heavy");
  } else if (BossCore.getSkillCooldown(monster, 'quick') <= 0) {
    monster.nextSkill = this.skills.find(s => s.key === "quick");
  } else {
    // 🆕 全部攻擊技在冷卻 → 用普通攻擊
    monster.nextSkill = this.skills.find(s => s.key === "basic");
  }
},

  skills: [
  {
    key: "basic",
    name: "普通攻擊",
    description: "造成 100% 傷害（無冷卻）",
    use: (p, m) => {
      const dmg = Math.round(m.atk * 1.0);
      logPrepend(`🪵 ${m.name} 發動普通攻擊！`);
      return dmg;
    }
  },
  {
    key: "atk-buff",
    name: "樹心狂怒",
    description: "提升攻擊力",
    use: (p, m) => {
      BossCore.applyFromSkill(m, { atk: { mul: 2.0, duration: 30 } });
      BossCore.setSkillCooldown(m, "atk-buff", 60);
      logPrepend(`💚 ${m.name} 進入樹心狂怒！攻擊力提升至 ${m.atk}！`);
      return 0;
    }
  },
  {
    key: "def-buff",
    name: "樹皮鐵壁",
    description: "提升防禦力",
    use: (p, m) => {
      BossCore.applyFromSkill(m, { def: { mul: 2.0, duration: 25 } });
      BossCore.setSkillCooldown(m, "def-buff", 55);
      logPrepend(`🛡️ ${m.name} 的樹皮硬化！防禦力提升至 ${m.def}！`);
      return 0;
    }
  },
  {
    key: "quick",
    name: "藤鞭抽打",
    description: "造成 230% 傷害",
    use: (p, m) => {
      const dmg = Math.round(m.atk * 2.3);
      BossCore.setSkillCooldown(m, "quick", 4);
      logPrepend(`🌿 ${m.name} 揮出藤鞭猛擊！`);
      return dmg;
    }
  },
  {
    key: "heavy",
    name: "森王崩擊",
    description: "造成 400% 傷害",
    use: (p, m) => {
      const dmg = Math.round(m.atk * 4.0);
      BossCore.setSkillCooldown(m, "heavy", 10);
      logPrepend(`🌳 ${m.name} 集力猛撞！`);
      return dmg;
    }
  }
],

  init(monster) {
    BossCore.init(monster);
    monster.skills = this.skills;
  }
}

],



// ==============================
// swampKing.js － 沼澤地區 Boss（第一階段）
// 介面相容：BossCore（buff/冷卻）、monster_skills（選技）、status_manager_player（異常）
// ==============================
 swamp : [
   {  name: "沼澤王",
  isMapBoss: true,
  level: 14,
  hp: 10800,
  atk: 105,
  def: 75,
  baseExp: 280,
  baseGold: 420,
  encounterRate: 5,

  dropRates: {
    gold: { min: 140, max: 260 },
    stone: { chance: 1, min: 18, max: 40 },
    "低階潛能解放鑰匙": { chance: 0.25 , min: 1, max: 5},
    "鑽石抽獎券": { chance: 1 ,min: 1, max: 2 },
    "沼澤精華": { chance: 0.28, min: 1, max: 2 },
    "腐泥塊": { chance: 0.2 },
    "黏稠苔蘚": { chance: 0.2 }
  },
  extra: {
    poison: true,
    poisonChance: 15, 
  },
  baseAtk: null,
  baseDef: null,
  naturalDef: null,
  _enragedTurns: 0,
  _enrageMul: 1,
  _rootShieldTurns: 0,
  _shieldMul: 1,

  // 單階段王：controller 只處理選技優先序
  controller(monster, currentHP) {
    const needAtk = BossCore.getBuffTurns(monster, "atk") <= 0
                 && BossCore.getSkillCooldown(monster, "atk-buff") <= 0;
    const needDef = BossCore.getBuffTurns(monster, "def") <= 0
                 && BossCore.getSkillCooldown(monster, "def-buff") <= 0;

    if (needAtk) {
      monster.nextSkill = this.skills.find(s => s.key === "atk-buff");
      return;
    }
    if (needDef) {
      monster.nextSkill = this.skills.find(s => s.key === "def-buff");
      return;
    }

    // 攻擊優先序：重擊 > 快打 > 普攻
    if (BossCore.getSkillCooldown(monster, "bog-crush") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "bog-crush");
    } else if (BossCore.getSkillCooldown(monster, "mud-shot") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "mud-shot");
    } else {
      monster.nextSkill = this.skills.find(s => s.key === "basic");
    }
  },
  skills: [
    {
      key: "basic",
      name: "泥拳",
      description: "造成 100% 傷害（無冷卻）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.0);
        logPrepend(`👊 ${m.name} 挥動泥濘的拳頭！`);
        return dmg;
      }
    },
    {
      key: "atk-buff",
      name: "腐沼狂怒",
      description: "攻擊力×2.0，持續5回合（冷卻6回合）",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, { atk: { mul: 2.0, durationSec: 25 } });
        BossCore.setSkillCooldown(m, "atk-buff", 45);
        logPrepend(`💢 ${m.name} 狂怒咆哮，力量暴增！ATK 提升至 ${m.atk}！`);
        return 0;
      }
    },
    {
      key: "def-buff",
      name: "泥殼加厚",
      description: "防禦力×1.8",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, { def: { mul: 1.8, durationSec: 35 } });
        BossCore.setSkillCooldown(m, "def-buff", 35);
        logPrepend(`🛡️ ${m.name} 的泥殼迅速硬化！DEF 提升至 ${m.def}！`);
        return 0;
      }
    },
    {
      key: "mud-shot",
      name: "泥沼彈射",
      description: "造成 180% 傷害）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.8);
        BossCore.setSkillCooldown(m, "mud-shot", 6);
        logPrepend(`🪨 ${m.name} 彈射厚重泥團砸向你！`);
        return dmg;
      }
    },
    {
      key: "bog-crush",
      name: "沼爆重擊",
      description: "造成 360%",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 3.6);
        BossCore.setSkillCooldown(m, "bog-crush", 9);
        logPrepend(`💥 ${m.name} 匯聚沼力，猛然轟擊！`);
        return dmg;
      }
    }
  ],

  // 回合結束：交給 BossCore 倒數（buff/技能冷卻）與面板套用
  _tickEndTurn(mon) { BossCore.endTurn(mon); },

  // 初始化：必須先 BossCore.init
  init(monster) {
    BossCore.init(monster);               // 🔑 必須
    if (monster.baseAtk == null) monster.baseAtk = monster.atk;
    if (monster.baseDef == null) monster.baseDef = monster.def;
    if (monster.naturalDef == null) monster.naturalDef = monster.def;
    monster._enragedTurns = 0;
    monster._rootShieldTurns = 0;
    monster.skills = this.skills;
  }
}

  ],
  
  lava: [
{
  name: "熔岩之王",
  isMapBoss: true,
  level: 20,            
  hp: 13000,
  atk: 140,
  def: 90,
  baseExp: 360,
  baseGold: 620,
  encounterRate: 5,

  dropRates: {
    gold: { min: 180, max: 320 },
    stone: { chance: 1, min: 24, max: 48 },
    "低階潛能解放鑰匙": { chance: 0.25 , min: 1, max: 5},
    "鑽石抽獎券": { chance: 1 ,min: 1, max: 3 },
    "熔岩精華": { chance: 0.30, min: 1, max: 2 },
    "火成岩碎片": { chance: 0.20 },
    "熔岩精華": { chance: 0.18 }
  },

  extra: {
    burn: true,
    burnChance: 10,
  },

  baseAtk: null,
  baseDef: null,
  naturalDef: null,
  _enragedTurns: 0,
  _enrageMul: 1,
  _rootShieldTurns: 0,
  _shieldMul: 1,

  controller(monster, currentHP) {
    const needAtk = BossCore.getBuffTurns(monster, "atk") <= 0
                 && BossCore.getSkillCooldown(monster, "atk-buff") <= 0;
    const needDef = BossCore.getBuffTurns(monster, "def") <= 0
                 && BossCore.getSkillCooldown(monster, "def-buff") <= 0;

    if (needAtk) {
      monster.nextSkill = this.skills.find(s => s.key === "atk-buff");
      return;
    }
    if (needDef) {
      monster.nextSkill = this.skills.find(s => s.key === "def-buff");
      return;
    }

    if (BossCore.getSkillCooldown(monster, "magma-hammer") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "magma-hammer");
    } else if (BossCore.getSkillCooldown(monster, "lava-splash") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "lava-splash");
    } else {
      monster.nextSkill = this.skills.find(s => s.key === "basic");
    }
  },

  skills: [
    {
      key: "basic",
      name: "炎拳",
      description: "造成 100% 傷害（無冷卻）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.0);
        logPrepend(`👊 ${m.name} 揮出炙熱炎拳！`);
        return dmg;
      }
    },

    {
      key: "atk-buff",
      name: "熔心狂怒",
      description: "攻擊力×2.0，",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, { atk: { mul: 2.0, durationSec: 15 } });
        BossCore.setSkillCooldown(m, "atk-buff", 15 + 16);
        logPrepend(`💢 ${m.name} 熔心沸騰！ATK 提升至 ${m.atk}！`);
        return 0;
      }
    },

    {
      key: "def-buff",
      name: "岩殼硬化",
      description: "防禦力×1.8）",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, { def: { mul: 1.8, durationSec: 15 } });
        BossCore.setSkillCooldown(m, "def-buff", 15 + 17);
        logPrepend(`🛡️ ${m.name} 岩殼硬化！DEF 提升至 ${m.def}！`);
        return 0;
      }
    },

    {
      key: "lava-splash",
      name: "熔岩噴濺",
      description: "造成 190% 傷害）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.9);
        BossCore.setSkillCooldown(m, "lava-splash", 3);
        logPrepend(`🌋 ${m.name} 噴濺滾燙岩漿！`);
        return dmg;
      }
    },

    {
      key: "magma-hammer",
      name: "熔鎚重擊",
      description: "造成 380% ）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 3.8);
        BossCore.setSkillCooldown(m, "magma-hammer", 9);
        logPrepend(`🔨 ${m.name} 揮下熔鎚，地面震顫！`);
        return dmg;
      }
    }
  ],

  _tickEndTurn(mon) { BossCore.endTurn(mon); },

  init(monster) {
    BossCore.init(monster);
    if (monster.baseAtk == null) monster.baseAtk = monster.atk;
    if (monster.baseDef == null) monster.baseDef = monster.def;
    if (monster.naturalDef == null) monster.naturalDef = monster.def;
    monster._enragedTurns = 0;
    monster._rootShieldTurns = 0;
    monster.skills = this.skills;
  }

}

// ... (mapBossPool 的結尾)

],



  aqua: [


{
  name: "海淵之皇",
  isMapBoss: true,
  level: 30,
  hp: 16000,
  atk: 260,
  def: 180,
  baseExp: 300,
  baseGold: 980,
  encounterRate: 5,

  dropRates: {
    gold:  { min: 300, max: 480 },
    stone: { chance: 1, min: 30, max: 60 },
    "低階潛能解放鑰匙": { chance: 0.25 , min: 1, max: 5},
    "鑽石抽獎券": { chance: 1 ,min: 1, max: 4 },
    "天水精華": { chance: 0.30, min: 1, max: 2 },
    "寒冰碎片": { chance: 0.22 },
    "潮汐之心": { chance: 0.18 }
  },

  extra: { freeze: true, freezeChance: 14 },

  baseAtk: null,
  baseDef: null,
  naturalDef: null,
  _enragedTurns: 0,
  _enrageMul: 1,
  _rootShieldTurns: 0,
  _shieldMul: 1,

  controller(monster, currentHP) {
    const hpNow = currentHP ?? monster.hp ?? monster.maxHp;
    const hpPct = (hpNow / (monster.maxHp || 1));

    const canHeal   = BossCore.getSkillCooldown(monster, "abyss-heal")   <= 0;
    const frenzyOn  = BossCore.getBuffTurns(monster, "atk") > 0 || BossCore.getBuffTurns(monster, "def") > 0;
    const canFrenzy = BossCore.getSkillCooldown(monster, "abyss-frenzy") <= 0;
    const canCleave = BossCore.getSkillCooldown(monster, "abyss-cleave") <= 0;

    if (hpPct <= 0.6 && canHeal) {
      monster.nextSkill = this.skills.find(s => s.key === "abyss-heal");
      return;
    }
    if (!frenzyOn && canFrenzy) {
      monster.nextSkill = this.skills.find(s => s.key === "abyss-frenzy");
      return;
    }
    if (canCleave) {
      monster.nextSkill = this.skills.find(s => s.key === "abyss-cleave");
      return;
    }
    monster.nextSkill = this.skills.find(s => s.key === "basic");
  },

  skills: [
    {
      key: "basic",
      name: "潮刃平斬",
      description: "造成 100% 傷害（無冷卻）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.0);
        logPrepend(`🌊 ${m.name} 揮出潮刃！`);
        return dmg;
      }
    },

    {
      key: "abyss-cleave",
      name: "渦淵斬潮",
      description: "造成 240% 傷害",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 2.4);
        BossCore.setSkillCooldown(m, "abyss-cleave", 4);
        logPrepend(`💦 ${m.name} 以渦潮重斬席捲！`);
        return dmg;
      }
    },

    {
      key: "abyss-frenzy",
      name: "狂潮覺醒",
      description: "",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, {
          atk: { mul: 3.0, durationSec: 40 },
          def: { mul: 0.3, durationSec: 40 }
        });
        BossCore.setSkillCooldown(m, "abyss-frenzy", 65);
        logPrepend(`🌊 ${m.name} 狂潮覺醒！ATK 提升至 ${m.atk}，DEF 降至 ${m.def}！`);
        return 0; 
      }
    },

    {
      key: "abyss-heal",
      name: "深淵回潮",
      description: "回復 20% 最大 HP（冷卻 15 回合）",
      castChance: 100,
      use: (p, m) => {
        const max = m.maxHp || m.hp || 1;
        const heal = Math.max(1, Math.floor(max * 0.20));

        m.hp = Math.min(max, (m.hp || max) + heal);

        try {
          if (typeof window !== "undefined" && "monsterHP" in window) {
            // @ts-ignore
            window.monsterHP = Math.min(max, (window.monsterHP || m.hp) + heal);
          }
        } catch(_) {}

        BossCore.setSkillCooldown(m, "abyss-heal", 15);
        logPrepend(`💧 ${m.name} 引動潮汐治癒，自身回復 ${heal} HP！`);
        return 0; // Return 0 as it's a heal skill
      }
    }
  ],

  _tickEndTurn(mon) { BossCore.endTurn(mon); },

  init(monster) {
    BossCore.init(monster);
    if (monster.baseAtk == null) monster.baseAtk = monster.atk;
    if (monster.baseDef == null) monster.baseDef = monster.def;
    if (monster.naturalDef == null) monster.naturalDef = monster.def;
    monster._enragedTurns = 0;
    monster._rootShieldTurns = 0;
    monster.skills = this.skills;
  }
}


// ... (mapBossPool 的結尾)
],

 wind : [
   {
  name: "風之守衛者",
  isMapBoss: true,
  level: 35,
  hp: 4800,
  atk: 82,
  def: 220,
  baseExp: 400,
  baseGold: 900,
  encounterRate: 5,

  dropRates: {
    gold: { min: 200, max: 380 },
    stone: { chance: 1, min: 28, max: 55 },
    "中階潛能解放鑰匙": { chance: 0.25, min: 1, max: 3 },
    "鑽石抽獎券": { chance: 1 ,min: 2, max: 5 },
    "風之羽": { chance: 0.30, min: 1, max: 2 },
    "蒼翠碎片": { chance: 0.22 },
    "風靈精華": { chance: 0.18 }
  },

  extra: {
    weaken: true,
  
  },

  baseAtk: null,
  baseDef: null,
  naturalDef: null,
  _enragedTurns: 0,
  _enrageMul: 1,
  _rootShieldTurns: 0,
  _shieldMul: 1,

  controller(monster, currentHP) {
    const needDef = BossCore.getBuffTurns(monster, "def") <= 0
                 && BossCore.getSkillCooldown(monster, "def-buff") <= 0;
    if (needDef) {
      monster.nextSkill = this.skills.find(s => s.key === "def-buff");
      return;
    }

    if (BossCore.getSkillCooldown(monster, "wind-slash") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "wind-slash");
      return;
    }

    monster.nextSkill = this.skills.find(s => s.key === "basic");
  },

  skills: [
    {
      key: "basic",
      name: "風刃斬擊",
      description: "造成 100% 傷害（無冷卻）",
      castChance: 100,
      use: (p, m) => {
        // --- 修正處：使用 m.atk ---
        const dmg = Math.round(m.atk * 1.0);
        // --- 修正結束 ---
        logPrepend(`💨 ${m.name} 揮出疾風斬擊！`);
        return dmg;
      }
    },

    {
      key: "def-buff",
      name: "颶風壁障",
      description: "防禦力×15）",
      castChance: 100,
      use: (p, m) => {
        // --- 修正處：使用 durationSec ---
        BossCore.applyFromSkill(m, { def: { mul: 15.0, durationSec: 50 } });
        // --- 修正結束 ---
        BossCore.setSkillCooldown(m, "def-buff", 70);
        logPrepend(`🛡️ ${m.name} 聚攏風牆！DEF 突增至 ${m.def}！`);
        return 0;
      }
    },

    {
      key: "wind-slash",
      name: "颶風裂斬",
      description: "造成 120% 傷害，20% 機率附加【虛弱】",
      castChance: 100,
      use: (p, m) => {
        // --- 修正處：使用 m.atk，並修正傷害倍率 ---
        const dmg = Math.round(m.atk * 1.2);
        // --- 修正結束 ---
        BossCore.setSkillCooldown(m, "wind-slash", 25);
        logPrepend(`🌪️ ${m.name} 釋放颶風裂斬！`);
        if (Math.random() < 0.2) { // 20% 機率
          if (typeof applyPlayerStatus === "function") {
            applyPlayerStatus("weaken", 20);
            logPrepend("⚠️ 你被【虛弱】影響，攻擊力下降！");
          }
        }
        return dmg;
      }
    }
  ],

  _tickEndTurn(mon) { BossCore.endTurn(mon); },

  init(monster) {
    BossCore.init(monster);
    if (monster.baseAtk == null) monster.baseAtk = monster.atk;
    if (monster.baseDef == null) monster.baseDef = monster.def;
    if (monster.naturalDef == null) monster.naturalDef = monster.def;
    monster._enragedTurns = 0;
    monster._rootShieldTurns = 0;
    monster.skills = this.skills;
  }
}

  ],
 lightning : [
    {
  name: "雷霆之王",
  isMapBoss: true,
  level: 40,
  hp: 16000,
  atk: 180,
  def: 110,
  baseExp: 520,
  baseGold: 700,
  encounterRate: 5,

  dropRates: {
    gold:  { min: 260, max: 420 },
    stone: { chance: 1, min: 32, max: 64 },
    "中階潛能解放鑰匙": { chance: 0.25 , min: 1, max: 3 },
    "鑽石抽獎券": { chance: 1 ,min: 2, max: 6 },
    "雷光精華": { chance: 0.30, min: 1, max: 2 },
    "雷電碎片": { chance: 0.22 },
    "天雷之心": { chance: 0.18 }
  },

  extra: {
    paralyze: true,
    paralyzeChance: 20,
    buff: { atkBuff: true, defBuff: true }
  },

  baseAtk: null,
  baseDef: null,
  naturalDef: null,
  _enragedTurns: 0,
  _enrageMul: 1,
  _rootShieldTurns: 0,
  _shieldMul: 1,

  controller(monster, currentHP) {
    const needAtk = BossCore.getBuffTurns(monster, "atk") <= 0
                 && BossCore.getSkillCooldown(monster, "atk-buff") <= 0;
    const needDef = BossCore.getBuffTurns(monster, "def") <= 0
                 && BossCore.getSkillCooldown(monster, "def-buff") <= 0;

    if (needAtk) {
      monster.nextSkill = this.skills.find(s => s.key === "atk-buff"); return;
    }
    if (BossCore.getSkillCooldown(monster, "thunder-crash") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "thunder-crash"); return;
    }
    if (needDef) {
      monster.nextSkill = this.skills.find(s => s.key === "def-buff"); return;
    }
    monster.nextSkill = this.skills.find(s => s.key === "basic");
  },

  skills: [
    {
      key: "basic",
      name: "雷擊斬",
      description: "造成 100% 傷害（無冷卻）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.0);
        logPrepend(`⚡ ${m.name} 釋放雷擊斬！`);
        return dmg;
      }
    },

    {
      key: "atk-buff",
      name: "雷霆增幅",
      description: "攻擊力×2.2，持續4回合（冷卻6回合）",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, { atk: { mul: 2.2, durationSec: 40 } });
        BossCore.setSkillCooldown(m, "atk-buff", 86);
        logPrepend(`💥 ${m.name} 雷能暴漲！ATK 提升至 ${m.atk}！`);
        return 0;
      }
    },

    {
      key: "def-buff",
      name: "導電護盾",
      description: "防禦力×1.6，持續3回合（冷卻9回合）",
      castChance: 100,
      use: (p, m) => {
        // --- 修正處：使用 durationSec ---
        BossCore.applyFromSkill(m, { def: { mul: 1.6, durationSec: 3 } });
        // --- 修正結束 ---
        BossCore.setSkillCooldown(m, "def-buff", 3 + 9);
        logPrepend(`🛡️ ${m.name} 釋放導電護盾！DEF 提升至 ${m.def}！`);
        return 0;
      }
    },

    {
      key: "thunder-crash",
      name: "雷霆落擊",
      description: "造成 200% 傷害（冷卻4回合），有機率造成麻痺",
      castChance: 100,
      use: (p, m) => {
        // --- 修正處：使用 m.atk ---
        const dmg = Math.round(m.atk * 2.0);
        // --- 修正結束 ---
        BossCore.setSkillCooldown(m, "thunder-crash", 4);
        logPrepend(`🌩️ ${m.name} 召喚雷霆落擊！`);
        return dmg;
      }
    },
  ],

  _tickEndTurn(mon) { BossCore.endTurn(mon); },

  init(monster) {
    BossCore.init(monster);
    if (monster.baseAtk == null) monster.baseAtk = monster.atk;
    if (monster.baseDef == null) monster.baseDef = monster.def;
    if (monster.naturalDef == null) monster.naturalDef = monster.def;
    monster._enragedTurns = 0;
    monster._rootShieldTurns = 0;
    monster.skills = this.skills;
  }
}

  ],

 ice : [
   {
  name: "冰霜之王",
  isMapBoss: true,
  level: 60,
  hp: 20000,
  atk: 280,
  def: 350,
  baseExp: 800,
  baseGold: 2400,
  encounterRate: 5,

  dropRates: {
    gold: { min: 400, max: 600 },
    stone: { chance: 1, min: 40, max: 80 },
    "中階潛能解放鑰匙": { chance: 0.20 , min: 1, max: 3},
    "鑽石抽獎券": { chance: 1 ,min: 3, max: 7 },
    "冰霜精華": { chance: 0.35, min: 1, max: 3 },
    "寒鐵碎片": { chance: 0.25 },
    "永凍之心": { chance: 0.15 }
  },

  extra: {
    freeze: true,
    freezeChance: 18,
  },

  baseAtk: null,
  baseDef: null,
  naturalDef: null,
  _enragedTurns: 0,
  _enrageMul: 1,
  _rootShieldTurns: 0,
  _shieldMul: 1,

  controller(monster, currentHP) {
    const needDef = BossCore.getBuffTurns(monster, "def") <= 0
                 && BossCore.getSkillCooldown(monster, "def-buff") <= 0;

    if (needDef) {
      monster.nextSkill = this.skills.find(s => s.key === "def-buff");
      return;
    }

    if (BossCore.getSkillCooldown(monster, "ice-storm") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "ice-storm");
    } else {
      monster.nextSkill = this.skills.find(s => s.key === "basic");
    }
  },

  skills: [
    {
      key: "basic",
      name: "冰刃斬擊",
      description: "造成 100% 傷害（無冷卻）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.0);
        logPrepend(`🪓 ${m.name} 揮出覆冰的巨斧！`);
        return dmg;
      }
    },
    {
      key: "def-buff",
      name: "寒霜護甲",
      description: "防禦力 ×35）",
      castChance: 100,
      use: (p, m) => {

        BossCore.applyFromSkill(m, { def: { mul: 35, durationSec: 50 } });
        BossCore.setSkillCooldown(m, "def-buff", 90); 
        logPrepend(`🛡️ ${m.name} 被厚重冰霜包裹，防禦大幅提升！`);
        return 0;
      }
    },
    {
      key: "ice-storm",
      name: "冰霜風暴",
      description: "造成 240% 傷害，有25%機率冰凍目標2回合（冷卻6回合）",
      castChance: 100,
      use: (p, m) => {
        // --- 修正處：使用 m.atk 並修正傷害倍率 ---
        const dmg = Math.round(m.atk * 2.4);

        BossCore.setSkillCooldown(m, "ice-storm", 6);
        return dmg;
      }
    }
  ],

  _tickEndTurn(mon) { BossCore.endTurn(mon); },

  init(monster) {
    BossCore.init(monster);
    if (monster.baseAtk == null) monster.baseAtk = monster.atk;
    if (monster.baseDef == null) monster.baseDef = monster.def;
    if (monster.naturalDef == null) monster.naturalDef = monster.def;
    monster._enragedTurns = 0;
    monster._rootShieldTurns = 0;
    monster.skills = this.skills;
  }
}
],

 shadow : [
  {
  name: "黯影之王",
  isMapBoss: true,
  level: 80,
  hp: 25000,
  atk: 360,
  def: 320,
  baseExp: 2600,
  baseGold: 3200,
  encounterRate: 5,

  dropRates: {
    gold: { min: 600, max: 900 },
    stone: { chance: 1, min: 60, max: 100 },
    "高階潛能解放鑰匙": { chance: 0.20 , min: 1, max: 3},
    "鑽石抽獎券": { chance: 1 ,min: 4, max: 8 },
    "暗影精華": { chance: 0.30, min: 1, max: 3 },
    "虛空碎片": { chance: 0.25 },
    "暗黑之核": { chance: 0.12 }
  },

  extra: {
    blind: true,
    blindChance: 15,
  
  },

  baseAtk: null,
  baseDef: null,
  naturalDef: null,
  _enragedTurns: 0,
  _enrageMul: 1,
  _rootShieldTurns: 0,
  _shieldMul: 1,

  controller(monster, currentHP) {
    const needEvasion = BossCore.getBuffTurns(monster, "evasion") <= 0
                     && BossCore.getSkillCooldown(monster, "shadow-veil") <= 0;

    if (needEvasion) {
      monster.nextSkill = this.skills.find(s => s.key === "shadow-veil");
      return;
    }

    if (BossCore.getSkillCooldown(monster, "dark-slash") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "dark-slash");
    } else {
      monster.nextSkill = this.skills.find(s => s.key === "basic");
    }
  },

  skills: [
    {
      key: "basic",
      name: "暗影斬擊",
      description: "造成 100% 傷害（無冷卻）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.0);
        logPrepend(`⚔️ ${m.name} 揮出暗影斬擊！`);
        return dmg;
      }
    },
    {
      key: "shadow-veil",
      name: "影幕",
      description: "自身迴避率提升至 100%）",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, {
          buffs: { key: "evasion", mode: "add", value: 100, durationSec: 25 }
        });
        BossCore.setSkillCooldown(m, "shadow-veil", 55);
        logPrepend(`🌫️ ${m.name} 展開影幕，化為殘影！`);
        return 0;
      }
    },
    {
      key: "dark-slash",
      name: "黯影連斬",
      description: "造成 320% 傷害",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 3.2);
        BossCore.setSkillCooldown(m, "dark-slash", 5);
        return dmg;
      }
    }
  ],

  _tickEndTurn(mon) { BossCore.endTurn(mon); },

  init(monster) {
    BossCore.init(monster);
    if (monster.baseAtk == null) monster.baseAtk = monster.atk;
    if (monster.baseDef == null) monster.baseDef = monster.def;
    if (monster.naturalDef == null) monster.naturalDef = monster.def;
    monster._enragedTurns = 0;
    monster._rootShieldTurns = 0;
    monster.skills = this.skills;
  }
}

  ],

hell : [
  {
  name: "煉獄之主",
  isMapBoss: true,
  level: 85,
  hp: 27000,
  atk: 420,
  def: 160,
  baseExp: 1200,
  baseGold: 980,
  encounterRate: 5,

  dropRates: {
    gold: { min: 480, max: 820 },
    stone: { chance: 1, min: 60, max: 96 },
    "高階潛能解放鑰匙": { chance: 0.18, min: 1, max: 2 },
    "鑽石抽獎券": { chance: 1, min: 5, max: 10 },
    "煉獄精華": { chance: 0.36, min: 1, max: 2 },
    "焦灼碎片": { chance: 0.24 },
    "暗黑之核": { chance: 0.20 }
  },

  extra: {
    burn: true,
    burnChance: 18,
  },

  baseAtk: null,
  baseDef: null,
  naturalDef: null,
  _enragedTurns: 0,
  _enrageMul: 1,
  _rootShieldTurns: 0,
  _shieldMul: 1,

  controller(monster, currentHP) {
    const needAtkStance = BossCore.getBuffTurns(monster, "atk") <= 0 &&
                       BossCore.getSkillCooldown(monster, "purgatory-stance") <= 0;

    const canHeal = (currentHP <= (monster.maxHp || monster.hp) * 0.6) &&
                 BossCore.getSkillCooldown(monster, "hell-rebirth") <= 0;

    if (needAtkStance) {
      monster.nextSkill = this.skills.find(s => s.key === "purgatory-stance");
      return;
    }
    if (canHeal) {
      monster.nextSkill = this.skills.find(s => s.key === "hell-rebirth");
      return;
    }
    if (BossCore.getSkillCooldown(monster, "meteor-of-hell") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "meteor-of-hell");
      return;
    }
    monster.nextSkill = this.skills.find(s => s.key === "basic");
  },

  skills: [
    {
      key: "basic",
      name: "獄炎斬",
      description: "造成 100% 傷害（無冷卻）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.0)
        logPrepend(`🔥 ${m.name} 揮出獄炎斬！`);
        return dmg;
      }
    },
    {
      key: "purgatory-stance",
      name: "煉獄狂焰",
      description: "攻擊×5、降低 70% 防",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, {
          atk: { mul: 5.0, durationSec: 40 },
          def: { mul: 0.30, durationSec: 40 }
        });
        BossCore.setSkillCooldown(m, "purgatory-stance", 80);
        logPrepend(`💥 ${m.name} 進入煉獄狂焰！ATK 提升至 ${m.atk}，DEF 降至 ${m.def}！`);
        return 0;
      }
    },
    {
      key: "hell-rebirth",
      name: "獄炎新生",
      description: "恢復 20% 最大 HP；",
      castChance: 100,
      use: (p, m) => {
        const maxHp = m.maxHp || m.hp;
        const heal = Math.max(1, Math.floor(maxHp * 0.20));
        m.hp = Math.min(maxHp, (m.hp || 0) + heal);
        BossCore.setSkillCooldown(m, "hell-rebirth", 25);
        logPrepend(`🩸 ${m.name} 借獄炎重生，回復 ${heal} HP！`);
        return 0;
      }
    },
    {
      key: "meteor-of-hell",
      name: "炎獄隕石",
      description: "造成 320% 傷害（冷卻 6 回合）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 3.2);
        BossCore.setSkillCooldown(m, "meteor-of-hell", 6);
        logPrepend(`☄️ ${m.name} 召喚炎獄隕石轟擊！`);
        return dmg;
      }
    }
  ],

  _tickEndTurn(mon) { BossCore.endTurn(mon); },

  init(monster) {
    BossCore.init(monster);
    if (monster.baseAtk == null) monster.baseAtk = monster.atk;
    if (monster.baseDef == null) monster.baseDef = monster.def;
    if (monster.naturalDef == null) monster.naturalDef = monster.def;
    monster._enragedTurns = 0;
    monster._rootShieldTurns = 0;
    monster.skills = this.skills;
  }
}
],
holy:[
  {
  name: "聖輝大天使",
  isMapBoss: true,
  level: 95,
  hp: 30000,
  atk: 460,
  def: 220,
  baseExp: 1400,
  baseGold: 1100,
  encounterRate: 8,

  dropRates: {
    gold: { min: 620, max: 980 },
    stone: { chance: 1, min: 68, max: 108 },
    "高階潛能解放鑰匙": { chance: 0.18, min: 1, max: 2 },
    "鑽石抽獎券": { chance: 1, min: 6, max: 11 },
    "聖光精華": { chance: 0.36, min: 1, max: 2 },
    "聖徽碎片": { chance: 0.24 },
    "純白之核": { chance: 0.20 }
  },

  extra: {
    burn: true,
    burnChance: 10,
    buff: { atkBuff: true, defBuff: true }
  },

  baseAtk: null,
  baseDef: null,
  naturalDef: null,
  _enragedTurns: 0,
  _enrageMul: 1,
  _rootShieldTurns: 0,
  _shieldMul: 1,

  controller(monster, currentHP) {
    const needDef = BossCore.getBuffTurns(monster, "def") <= 0 &&
                 BossCore.getSkillCooldown(monster, "holy-aegis") <= 0;

    const needAtk = BossCore.getBuffTurns(monster, "atk") <= 0 &&
                 BossCore.getSkillCooldown(monster, "divine-might") <= 0;

    const canHeal = (currentHP <= (monster.maxHp || monster.hp) * 0.55) &&
                 BossCore.getSkillCooldown(monster, "sanctuary-heal") <= 0;

    if (needDef) { monster.nextSkill = this.skills.find(s => s.key === "holy-aegis"); return; }
    if (needAtk) { monster.nextSkill = this.skills.find(s => s.key === "divine-might"); return; }
    if (canHeal) { monster.nextSkill = this.skills.find(s => s.key === "sanctuary-heal"); return; }

    if (BossCore.getSkillCooldown(monster, "judgement-spear") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "judgement-spear"); return;
    }
    monster.nextSkill = this.skills.find(s => s.key === "basic");
  },

  skills: [
    {
      key: "basic",
      name: "聖刃斬",
      description: "造成 100% 傷害（無冷卻）",
      castChance: 100,
      use: (p, m) => {
        // --- 修正處：使用 m.atk ---
        const dmg = Math.round(m.atk * 1.0);
        // --- 修正結束 ---
        logPrepend(`⚔️ ${m.name} 揮出聖刃斬！`);
        return dmg;
      }
    },
    {
      key: "holy-aegis",
      name: "聖域壁",
      description: "防禦×2.5",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, { def: { mul: 2.5, durationSec: 25 } });
        BossCore.setSkillCooldown(m, "holy-aegis",45);
        logPrepend(`🛡️ ${m.name} 展開聖域壁！DEF 提升至 ${m.def}！`);
        return 0;
      }
    },
    {
      key: "divine-might",
      name: "神威降臨",
      description: "攻擊×2",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, { atk: { mul: 2.0, durationSec: 40 } });
        BossCore.setSkillCooldown(m, "divine-might", 60);
        logPrepend(`✨ ${m.name} 神威加身！ATK 提升至 ${m.atk}！`);
        return 0;
      }
    },
    {
      key: "judgement-spear",
      name: "審判之槍",
      description: "造成 360% 傷害）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 3.6);
        BossCore.setSkillCooldown(m, "judgement-spear", 7);
        logPrepend(`🔱 ${m.name} 投擲審判之槍！`);
        return dmg;
      }
    },
    {
      key: "sanctuary-heal",
      name: "聖所恩澤",
      description: "恢復 30% 最大 HP",
      castChance: 100,
      use: (p, m) => {
        const maxHp = m.maxHp || m.hp;
        const heal = Math.max(1, Math.floor(maxHp * 0.30));
        m.hp = Math.min(maxHp, (m.hp || 0) + heal);
        BossCore.setSkillCooldown(m, "sanctuary-heal", 16);
        logPrepend(`💖 ${m.name} 受聖所恩澤回復 ${heal} HP！`);
        return 0;
      }
    }
  ],

  _tickEndTurn(mon) { BossCore.endTurn(mon); },

  init(monster) {
    BossCore.init(monster);
    if (monster.baseAtk == null) monster.baseAtk = monster.atk;
    if (monster.baseDef == null) monster.baseDef = monster.def;
    if (monster.naturalDef == null) monster.naturalDef = monster.def;
    monster._enragedTurns = 0;
    monster._rootShieldTurns = 0;
    monster.skills = this.skills;
  }
}

],

core:[
  {
  name: "虛空支配者",
  isMapBoss: true,
  level: 100,
  hp: 35000,
  atk: 520,
  def: 250,
  baseExp: 2000,
  baseGold: 1500,
  encounterRate: 8,

  dropRates: {
    gold: { min: 800, max: 1200 },
    stone: { chance: 1, min: 80, max: 120 },
    "高潛能解放鑰匙": { chance: 0.30, min: 1, max: 3 },
    "鑽石抽獎券": { chance: 1, min: 7, max: 12 },
    "核心精華": { chance: 0.30, min: 1, max: 2 },
    "暗黑之核": { chance: 0.25 },
    "元素碎片": { chance: 0.20 }
  },

  extra: {
    buff: { atkBuff: true, defBuff: true },
    special: "虛空共鳴"
  },

  baseAtk: null,
  baseDef: null,
  naturalDef: null,
  _enragedTurns: 0,
  _enrageMul: 1,
  _rootShieldTurns: 0,
  _shieldMul: 1,

  controller(monster, currentHP) {
    const needDef = BossCore.getBuffTurns(monster, "def") <= 0 &&
                 BossCore.getSkillCooldown(monster, "void-barrier") <= 0;

    const needAtk = BossCore.getBuffTurns(monster, "atk") <= 0 &&
                 BossCore.getSkillCooldown(monster, "chaos-power") <= 0;

    const canHeal = (currentHP <= (monster.maxHp || monster.hp) * 0.50) &&
                 BossCore.getSkillCooldown(monster, "void-heal") <= 0;

    if (needDef) { monster.nextSkill = this.skills.find(s => s.key === "void-barrier"); return; }
    if (needAtk) { monster.nextSkill = this.skills.find(s => s.key === "chaos-power"); return; }
    if (canHeal) { monster.nextSkill = this.skills.find(s => s.key === "void-heal"); return; }

    if (BossCore.getSkillCooldown(monster, "annihilation") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "annihilation"); return;
    }
    monster.nextSkill = this.skills.find(s => s.key === "basic");
  },

  skills: [
    {
      key: "basic",
      name: "虛空斬擊",
      description: "造成 100% 傷害（無冷卻）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.0);
        logPrepend(`⚔️ ${m.name} 釋放虛空斬擊！`);
        return dmg;
      }
    },
    {
      key: "void-barrier",
      name: "虛空壁壘",
      description: "防禦×3",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, { def: { mul: 3.0, durationSec: 50 } });
        BossCore.setSkillCooldown(m, "void-barrier", 26);
        logPrepend(`🛡️ ${m.name} 展開虛空壁壘！DEF 提升至 ${m.def}！`);
        return 0;
      }
    },
    {
      key: "chaos-power",
      name: "混沌增幅",
      description: "攻擊×2.5",
      castChance: 100,
      use: (p, m) => {
        BossCore.applyFromSkill(m, { atk: { mul: 2.5, durationSec: 40 } });
        BossCore.setSkillCooldown(m, "chaos-power", 100);
        logPrepend(`💥 ${m.name} 力量爆發！ATK 提升至 ${m.atk}！`);
        return 0;
      }
    },
    {
      key: "annihilation",
      name: "湮滅一擊",
      description: "造成 450% 傷害（冷卻 8 回合）",
      castChance: 100,
      use: (p, m) => {
        const dmg = Math.round(m.atk * 4.5);
        // --- 修正結束 ---
        BossCore.setSkillCooldown(m, "annihilation", 8);
        logPrepend(`☄️ ${m.name} 釋放湮滅一擊！`);
        return dmg;
      }
    },
    {
      key: "void-heal",
      name: "虛空回溯",
      description: "恢復 25% 最大 HP（冷卻 15 回合）",
      castChance: 100,
      use: (p, m) => {
        const maxHp = m.maxHp || m.hp;
        const heal = Math.max(1, Math.floor(maxHp * 0.25));
        m.hp = Math.min(maxHp, (m.hp || 0) + heal);
        BossCore.setSkillCooldown(m, "void-heal", 15);
        logPrepend(`💖 ${m.name} 回溯虛空能量，恢復 ${heal} HP！`);
        return 0;
      }
    }
  ],

  _tickEndTurn(mon) { BossCore.endTurn(mon); },

  init(monster) {
    BossCore.init(monster);
    if (monster.baseAtk == null) monster.baseAtk = monster.atk;
    if (monster.baseDef == null) monster.baseDef = monster.def;
    if (monster.naturalDef == null) monster.naturalDef = monster.def;
    monster._enragedTurns = 0;
    monster._rootShieldTurns = 0;
    monster.skills = this.skills;
  }
}
],
  
  akm: [


{
  name: "天空-護衛",
  isMapBoss: true,
  level: 260,
  hp: 42000000,
  atk: 6300,
  def: 4500,
  baseExp: 360,
  baseGold: 520,
  baseGed: 520,
  encounterRate: 0,
  dropRates: {
    gold: { min: 160, max: 300 },
    stone: { chance: 1, min: 18, max: 40 },

    "星痕代幣": { chance: 0.18 }
  },

  extra: {},

  baseAtk: null,
  naturalDef: null,
  _enragedTurns: 0,
  _rootShieldTurns: 0,

  _tickEndTurn(m) { BossCore.endTurn(m); },

  controller(monster, currentHP) {
    if (BossCore.getSkillCooldown(monster, "heavy") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "heavy"); return;
    }
    if (BossCore.getSkillCooldown(monster, "quick") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "quick"); return;
    }
    if (BossCore.getSkillCooldown(monster, "rend") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "rend"); return;
    }
    monster.nextSkill = this.skills.find(s => s.key === "basic");
  },

  skills: [
    {
      key: "basic",
      name: "普通攻擊",
      description: "造成 100% 傷害（無冷卻）",
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.0);
        logPrepend(`🪵 ${m.name} 發動普通攻擊！`);
        return dmg;
      }
    },
    {
      key: "quick",
      name: "藤鞭連抽",
      description: "造成 260% 傷害",
      use: (p, m) => {
        const dmg = Math.round(m.atk * 2.6);
        BossCore.setSkillCooldown(m, "quick", 4);
        logPrepend(`🌿 ${m.name} 以藤鞭猛擊！`);
        return dmg;
      }
    },
    {
      key: "heavy",
      name: "森王崩擊",
      description: "造成 450% 傷害",
      use: (p, m) => {
        const dmg = Math.round(m.atk * 4.5);
        BossCore.setSkillCooldown(m, "heavy", 9);
        logPrepend(`🌳 ${m.name} 集力猛撞！`);
        return dmg;
      }
    },
    {
      key: "rend",
      name: "裂藤重斬",
      description: "造成 320% 傷害",
      use: (p, m) => {
        const dmg = Math.round(m.atk * 3.2);
        BossCore.setSkillCooldown(m, "rend", 12);
        logPrepend(`🌪️ ${m.name} 以裂藤重斬撕裂！`);
        return dmg;
      }
    }
  ],

  init(monster) { BossCore.init(monster); monster.skills = this.skills; }
},
{
  name: "森林・鋼樹",
  isMapBoss: true,
  level: 8,
  hp: 200,
  atk: 1,
  def: 180,
  baseExp: 360,
  baseGold: 520,
  baseGed: 520,
  encounterRate: 0,
  dropRates: {
    gold: { min: 160, max: 300 },
    stone: { chance: 1, min: 18, max: 40 },
    "鑽石抽獎券": { chance: 1, min: 1, max: 1 },
    "低階潛能解放鑰匙": { chance: 0.20, min: 1, max: 5 },
    "森林精華": { chance: 0.30, min: 1, max: 2 },
    "粗糙樹皮": { chance: 0.22 },
    "藤蔓": { chance: 0.22 }
  },

  extra: {},

  baseAtk: null,
  naturalDef: null,
  _enragedTurns: 0,
  _rootShieldTurns: 0,

  _tickEndTurn(m) { BossCore.endTurn(m); },

  controller(monster, currentHP) {
    const atkUp = BossCore.getBuffTurns(monster, "atk") > 0;
    const defUp = BossCore.getBuffTurns(monster, "def") > 0;

    if (!defUp && BossCore.getSkillCooldown(monster, "ironbark") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "ironbark"); return;
    }
    if (!defUp && BossCore.getSkillCooldown(monster, "barkskin") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "barkskin"); return;
    }
    if (!atkUp && BossCore.getSkillCooldown(monster, "sap-rage") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "sap-rage"); return;
    }
    if (BossCore.getSkillCooldown(monster, "guardian-stance") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "guardian-stance"); return;
    }

    if (BossCore.getSkillCooldown(monster, "shield-bash") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "shield-bash"); return;
    }
    if (BossCore.getSkillCooldown(monster, "poke") <= 0) {
      monster.nextSkill = this.skills.find(s => s.key === "poke"); return;
    }

    monster.nextSkill = this.skills.find(s => s.key === "basic");
  },

  skills: [
    {
      key: "basic",
      name: "遲緩揮擊",
      description: "造成 90% 傷害（無冷卻）",
      use: (p, m) => {
        const dmg = Math.round(m.atk * 0.9);
        logPrepend(`🪵 ${m.name} 遲緩地揮出樹臂。`);
        return dmg;
      }
    },
    {
      key: "poke",
      name: "枝刺探擊",
      description: "造成 120% 傷害",
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.2);
        BossCore.setSkillCooldown(m, "poke", 3);
        logPrepend(`🌱 ${m.name} 以枝刺試探！`);
        return dmg;
      }
    },
    {
      key: "shield-bash",
      name: "樹盾衝撞",
      description: "造成 150% 傷害",
      use: (p, m) => {
        const dmg = Math.round(m.atk * 1.5);
        BossCore.setSkillCooldown(m, "shield-bash", 6);
        logPrepend(`🛡️ ${m.name} 以厚重樹盾撞擊！`);
        return dmg;
      }
    },
    {
      key: "ironbark",
      name: "鐵樹樹皮",
      description: "大幅提升防禦力",
      use: (p, m) => {
        BossCore.applyFromSkill(m, { def: { mul: 2.5, duration: 40 } });
        BossCore.setSkillCooldown(m, "ironbark", 60);
        logPrepend(`🛡️ ${m.name} 樹皮如鐵！防禦力大幅上升至 ${m.def}！`);
        return 0;
      }
    },
    {
      key: "barkskin",
      name: "強化樹皮",
      description: "提升防禦力",
      use: (p, m) => {
        BossCore.applyFromSkill(m, { def: { mul: 1.8, duration: 28 } });
        BossCore.setSkillCooldown(m, "barkskin", 45);
        logPrepend(`🧱 ${m.name} 樹皮加厚！防禦力上升至 ${m.def}！`);
        return 0;
      }
    },
    {
      key: "guardian-stance",
      name: "守護姿態",
      description: "提升防禦並稍微提高攻擊",
      use: (p, m) => {
        BossCore.applyFromSkill(m, {
          def: { mul: 1.5, duration: 18 },
          atk: { mul: 1.2, duration: 18 }
        });
        BossCore.setSkillCooldown(m, "guardian-stance", 35);
        logPrepend(`🛡️ ${m.name} 進入守護姿態！`);
        return 0;
      }
    },
    {
      key: "sap-rage",
      name: "樹液鼓動",
      description: "小幅提升攻擊",
      use: (p, m) => {
        BossCore.applyFromSkill(m, { atk: { mul: 1.3, duration: 20 } });
        BossCore.setSkillCooldown(m, "sap-rage", 30);
        logPrepend(`💚 ${m.name} 樹液沸騰！攻擊力提升至 ${m.atk}！`);
        return 0;
      }
    }
  ],

  init(monster) { BossCore.init(monster); monster.skills = this.skills; }
}

],
};
