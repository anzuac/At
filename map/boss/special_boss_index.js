// special_boss_index.js
// 特殊 Boss 清單：搭配 SpecialBossGate + monster_utils + monster_skills + BossCore 使用
// 10 之王：Lv 30,50,100,130,170,200,300,400,600,900

window.SpecialBossList = {
  // ===== King 1：裂牙獸王．格魯（Lv.30 / 教學王）=====
  king_01_grawl: {
    name: "🐾 裂牙獸王．格魯",
    area: "special_boss",
    ticketItem: "Boss挑戰券",
    rewardItem: "Boss硬幣",
    rewardAmount: 1,

    stats: {
      name: "裂牙獸王．格魯",
      isMapBoss: true,
      level: 30,
      hp: 120000,
      atk: 320,
      def: 90,
      baseExp: 1800,
      baseGold: 900,
      encounterRate: 100,

      dropRates: {
        gold: { min: 80, max: 150 },
        "Boss硬幣": { chance: 0.25, min: 1, max: 1 }
      },

      extra: {
        defPercentOverride: 1.2,     // 120% 防禦%
        ignoreDefPctOverride: 0.0    // 無視防禦 0%
      },

      controller(monster) {
        const canSkill = BossCore.getSkillCooldown(monster, "rip_claw") <= 0;
        if (canSkill && Math.random() < 0.35) {
          monster.nextSkill = this.skills.find(s => s.key === "rip_claw");
          return;
        }
        monster.nextSkill = this.skills.find(s => s.key === "basic");
      },

      skills: [
        {
          key: "basic",
          name: "利牙撲咬",
          description: "造成 100% 攻擊力傷害（無冷卻）",
          castChance: 100,
          use: (p, m) => Math.max(0, Math.round((m.atk || 0) * 1.0))
        },
        {
          key: "rip_claw",
          name: "撕裂爪擊",
          description: "造成 140% 攻擊力（冷卻 6s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 1.4));
            BossCore.setSkillCooldown(m, "rip_claw", 6);
            return dmg;
          }
        }
      ],

      _tickEndTurn(mon) { BossCore.endTurn(mon); },

      init(mon) {
        BossCore.init(mon);
        if (mon.baseAtk == null) mon.baseAtk = mon.atk;
        if (mon.baseDef == null) mon.baseDef = mon.def;
        if (mon.naturalDef == null) mon.naturalDef = mon.def;
        mon.skills = this.skills;
      }
    }
  },

  // ===== King 2：狂怒鬥士．布羅克（Lv.50 / 初階爆發）=====
  king_02_brok: {
    name: "🪓 狂怒鬥士．布羅克",
    area: "special_boss",
    ticketItem: "Boss挑戰券",
    rewardItem: "Boss硬幣",
    rewardAmount: 1,

    stats: {
      name: "狂怒鬥士．布羅克",
      isMapBoss: true,
      level: 50,
      hp: 420000,
      atk: 900,
      def: 180,
      baseExp: 4500,
      baseGold: 2200,
      encounterRate: 100,

      dropRates: {
        gold: { min: 160, max: 280 },
        "Boss硬幣": { chance: 0.28, min: 1, max: 1 }
      },

      extra: {
        defPercentOverride: 1.35,
        ignoreDefPctOverride: 0.05
      },

      controller(monster) {
        const needRage =
          BossCore.getBuffTurns(monster, "atk") <= 0 &&
          BossCore.getSkillCooldown(monster, "rage_roar") <= 0;

        if (needRage && Math.random() < 0.35) {
          monster.nextSkill = this.skills.find(s => s.key === "rage_roar");
          return;
        }

        const canAxe = BossCore.getSkillCooldown(monster, "heavy_axe") <= 0;
        if (canAxe && Math.random() < 0.55) {
          monster.nextSkill = this.skills.find(s => s.key === "heavy_axe");
          return;
        }

        monster.nextSkill = this.skills.find(s => s.key === "basic");
      },

      skills: [
        {
          key: "basic",
          name: "鬥士猛擊",
          description: "造成 100% 攻擊力傷害（無冷卻）",
          castChance: 100,
          use: (p, m) => Math.max(0, Math.round((m.atk || 0) * 1.0))
        },
        {
          key: "heavy_axe",
          name: "重斧斬",
          description: "造成 180% 攻擊力（冷卻 8s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 1.8));
            BossCore.setSkillCooldown(m, "heavy_axe", 8);
            return dmg;
          }
        },
        {
          key: "rage_roar",
          name: "怒吼",
          description: "攻擊力×1.3，持續 6s（冷卻 16s）",
          castChance: 100,
          use: (p, m) => {
            BossCore.applyFromSkill(m, { atk: { mul: 1.3, durationSec: 6 } });
            BossCore.setSkillCooldown(m, "rage_roar", 16);
            return 0;
          }
        }
      ],

      _tickEndTurn(mon) { BossCore.endTurn(mon); },

      init(mon) {
        BossCore.init(mon);
        BossCore.addBuff(mon, "speedMul", { mode: "mul", value: 1.15, durationSec: 999999 });
        if (mon.baseAtk == null) mon.baseAtk = mon.atk;
        if (mon.baseDef == null) mon.baseDef = mon.def;
        if (mon.naturalDef == null) mon.naturalDef = mon.def;
        mon.skills = this.skills;
      }
    }
  },

  // ===== King 3：暗影咒術師．摩爾（Lv.100 / 控制入門）=====
  king_03_mohr: {
    name: "🕯️ 暗影咒術師．摩爾",
    area: "special_boss",
    ticketItem: "Boss挑戰券",
    rewardItem: "Boss硬幣",
    rewardAmount: 1,

    stats: {
      name: "暗影咒術師．摩爾",
      isMapBoss: true,
      level: 100,
      hp: 1200000,
      atk: 2400,
      def: 420,
      baseExp: 22000,
      baseGold: 8000,
      encounterRate: 100,

      dropRates: {
        gold: { min: 600, max: 900 },
        "Boss硬幣": { chance: 0.32, min: 1, max: 2 }
      },

      extra: {
        defPercentOverride: 1.6,
        ignoreDefPctOverride: 0.10
      },

      controller(monster) {
        const canFear = BossCore.getSkillCooldown(monster, "fear_seal") <= 0;
        if (canFear && Math.random() < 0.25) {
          monster.nextSkill = this.skills.find(s => s.key === "fear_seal");
          return;
        }

        const canBolt = BossCore.getSkillCooldown(monster, "shadow_bolt") <= 0;
        if (canBolt && Math.random() < 0.55) {
          monster.nextSkill = this.skills.find(s => s.key === "shadow_bolt");
          return;
        }

        monster.nextSkill = this.skills.find(s => s.key === "basic");
      },

      skills: [
        {
          key: "basic",
          name: "黑焰觸碰",
          description: "造成 100% 攻擊力（無冷卻）",
          castChance: 100,
          use: (p, m) => Math.max(0, Math.round((m.atk || 0) * 1.0))
        },
        {
          key: "shadow_bolt",
          name: "暗影彈",
          description: "造成 150% 攻擊力（冷卻 7s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 1.5));
            BossCore.setSkillCooldown(m, "shadow_bolt", 7);
            return dmg;
          }
        },
        {
          key: "fear_seal",
          name: "恐懼咒印",
          description: "使你暈眩 1.5s（冷卻 18s）",
          castChance: 100,
          use: (p, m) => {
            if (typeof window.applyPlayerStatus === "function") applyPlayerStatus("stun", 1.5);
            BossCore.setSkillCooldown(m, "fear_seal", 18);
            return 0;
          }
        }
      ],

      _tickEndTurn(mon) { BossCore.endTurn(mon); },

      init(mon) {
        BossCore.init(mon);
        BossCore.addBuff(mon, "speedMul", { mode: "mul", value: 0.95, durationSec: 999999 });
        if (mon.baseAtk == null) mon.baseAtk = mon.atk;
        if (mon.baseDef == null) mon.baseDef = mon.def;
        if (mon.naturalDef == null) mon.naturalDef = mon.def;
        mon.skills = this.skills;
      }
    }
  },

  // ===== King 4：鋼鐵守衛．赫爾（Lv.130 / Buff 防禦王）=====
  king_04_hel: {
    name: "🛡️ 鋼鐵守衛．赫爾",
    area: "special_boss",
    ticketItem: "Boss挑戰券",
    rewardItem: "Boss硬幣",
    rewardAmount: 1,

    stats: {
      name: "鋼鐵守衛．赫爾",
      isMapBoss: true,
      level: 130,
      hp: 2800000,
      atk: 3600,
      def: 1200,
      baseExp: 42000,
      baseGold: 14000,
      encounterRate: 100,

      dropRates: {
        gold: { min: 900, max: 1400 },
        "Boss硬幣": { chance: 0.36, min: 1, max: 2 }
      },

      extra: {
        defPercentOverride: 1.85,
        ignoreDefPctOverride: 0.15
      },

      controller(monster) {
        const needMatrix =
          BossCore.getBuffTurns(monster, "def") <= 0 &&
          BossCore.getSkillCooldown(monster, "def_matrix") <= 0;

        if (needMatrix && Math.random() < 0.35) {
          monster.nextSkill = this.skills.find(s => s.key === "def_matrix");
          return;
        }

        const canCharge = BossCore.getSkillCooldown(monster, "iron_charge") <= 0;
        if (canCharge && Math.random() < 0.55) {
          monster.nextSkill = this.skills.find(s => s.key === "iron_charge");
          return;
        }

        monster.nextSkill = this.skills.find(s => s.key === "basic");
      },

      skills: [
        {
          key: "basic",
          name: "鋼拳重擊",
          description: "造成 100% 攻擊力（無冷卻）",
          castChance: 100,
          use: (p, m) => Math.max(0, Math.round((m.atk || 0) * 1.0))
        },
        {
          key: "iron_charge",
          name: "鋼鐵衝撞",
          description: "造成 170% 攻擊力（冷卻 9s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 1.7));
            BossCore.setSkillCooldown(m, "iron_charge", 9);
            return dmg;
          }
        },
        {
          key: "def_matrix",
          name: "防禦矩陣",
          description: "防禦力×1.6，持續 10s（冷卻 20s）",
          castChance: 100,
          use: (p, m) => {
            BossCore.applyFromSkill(m, { def: { mul: 1.6, durationSec: 10 } });
            BossCore.setSkillCooldown(m, "def_matrix", 20);
            return 0;
          }
        }
      ],

      _tickEndTurn(mon) { BossCore.endTurn(mon); },

      init(mon) {
        BossCore.init(mon);
        BossCore.addBuff(mon, "speedMul", { mode: "mul", value: 0.95, durationSec: 999999 });
        if (mon.baseAtk == null) mon.baseAtk = mon.atk;
        if (mon.baseDef == null) mon.baseDef = mon.def;
        if (mon.naturalDef == null) mon.naturalDef = mon.def;
        mon.skills = this.skills;
      }
    }
  },

  // ===== King 5：疾風劍聖．嵐（Lv.170 / 節奏王）=====
  king_05_ran: {
    name: "🌪️ 疾風劍聖．嵐",
    area: "special_boss",
    ticketItem: "Boss挑戰券",
    rewardItem: "Boss硬幣",
    rewardAmount: 1,

    stats: {
      name: "疾風劍聖．嵐",
      isMapBoss: true,
      level: 170,
      hp: 5500000,
      atk: 7000,
      def: 1600,
      baseExp: 78000,
      baseGold: 24000,
      encounterRate: 100,

      dropRates: {
        gold: { min: 1400, max: 2100 },
        "Boss硬幣": { chance: 0.40, min: 1, max: 2 }
      },

      extra: {
        defPercentOverride: 2.2,
        ignoreDefPctOverride: 0.20
      },

      controller(monster) {
        const needSpeed =
          BossCore.getBuffTurns(monster, "speedMul") <= 0 &&
          BossCore.getSkillCooldown(monster, "wind_step") <= 0;

        if (needSpeed && Math.random() < 0.30) {
          monster.nextSkill = this.skills.find(s => s.key === "wind_step");
          return;
        }

        const canCombo = BossCore.getSkillCooldown(monster, "flash_combo") <= 0;
        if (canCombo && Math.random() < 0.60) {
          monster.nextSkill = this.skills.find(s => s.key === "flash_combo");
          return;
        }

        const canCut = BossCore.getSkillCooldown(monster, "sky_cut") <= 0;
        if (canCut && Math.random() < 0.35) {
          monster.nextSkill = this.skills.find(s => s.key === "sky_cut");
          return;
        }

        monster.nextSkill = this.skills.find(s => s.key === "basic");
      },

      skills: [
        {
          key: "basic",
          name: "風刃斬",
          description: "造成 100% 攻擊力（無冷卻）",
          castChance: 100,
          use: (p, m) => Math.max(0, Math.round((m.atk || 0) * 1.0))
        },
        {
          key: "flash_combo",
          name: "瞬斬連擊",
          description: "連擊 3 次：每次 120%（冷卻 10s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 1.2 * 3));
            BossCore.setSkillCooldown(m, "flash_combo", 10);
            return dmg;
          }
        },
        {
          key: "sky_cut",
          name: "斷空斬",
          description: "造成 250% 攻擊力（冷卻 14s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 2.5));
            BossCore.setSkillCooldown(m, "sky_cut", 14);
            return dmg;
          }
        },
        {
          key: "wind_step",
          name: "疾風步",
          description: "攻擊速度×1.5，持續 10s（冷卻 22s）",
          castChance: 100,
          use: (p, m) => {
            BossCore.addBuff(m, "speedMul", { mode: "mul", value: 1.5, durationSec: 10 });
            BossCore.setSkillCooldown(m, "wind_step", 22);
            return 0;
          }
        }
      ],

      _tickEndTurn(mon) { BossCore.endTurn(mon); },

      init(mon) {
        BossCore.init(mon);
        BossCore.addBuff(mon, "speedMul", { mode: "mul", value: 1.6, durationSec: 999999 });
        if (mon.baseAtk == null) mon.baseAtk = mon.atk;
        if (mon.baseDef == null) mon.baseDef = mon.def;
        if (mon.naturalDef == null) mon.naturalDef = mon.def;
        mon.skills = this.skills;
      }
    }
  },

  // ===== King 6：血契魔像．索爾（Lv.200 / 生存檢查）=====
  king_06_thol: {
    name: "🩸 血契魔像．索爾",
    area: "special_boss",
    ticketItem: "Boss挑戰券",
    rewardItem: "Boss硬幣",
    rewardAmount: 1,

    stats: {
      name: "血契魔像．索爾",
      isMapBoss: true,
      level: 200,
      hp: 12000000,
      atk: 9500,
      def: 2200,
      baseExp: 120000,
      baseGold: 36000,
      encounterRate: 100,

      dropRates: {
        gold: { min: 1800, max: 2600 },
        "Boss硬幣": { chance: 0.44, min: 1, max: 2 }
      },

      extra: {
        defPercentOverride: 2.5,
        ignoreDefPctOverride: 0.25
      },

      controller(monster) {
        const canShield = BossCore.getSkillCooldown(monster, "blood_shield") <= 0;
        if (canShield && Math.random() < 0.22) {
          monster.nextSkill = this.skills.find(s => s.key === "blood_shield");
          return;
        }

        const canDrain = BossCore.getSkillCooldown(monster, "blood_drain") <= 0;
        if (canDrain && Math.random() < 0.30) {
          monster.nextSkill = this.skills.find(s => s.key === "blood_drain");
          return;
        }

        const canBurst = BossCore.getSkillCooldown(monster, "blood_burst") <= 0;
        if (canBurst && Math.random() < 0.55) {
          monster.nextSkill = this.skills.find(s => s.key === "blood_burst");
          return;
        }

        monster.nextSkill = this.skills.find(s => s.key === "basic");
      },

      skills: [
        {
          key: "basic",
          name: "血石重擊",
          description: "造成 100% 攻擊力（無冷卻）",
          castChance: 100,
          use: (p, m) => Math.max(0, Math.round((m.atk || 0) * 1.0))
        },
        {
          key: "blood_burst",
          name: "血爆",
          description: "造成 200% 攻擊力（冷卻 10s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 2.0));
            BossCore.setSkillCooldown(m, "blood_burst", 10);
            return dmg;
          }
        },
        {
          key: "blood_shield",
          name: "血之護盾",
          description: "獲得自身最大 HP 10% 護盾（冷卻 20s）",
          castChance: 100,
          use: (p, m) => {
            const maxHp = Number(m.maxHp || m.hp || 0);
            const shieldGain = Math.floor(maxHp * 0.10);
            m.shield = (m.shield || 0) + shieldGain;
            BossCore.setSkillCooldown(m, "blood_shield", 20);
            return 0;
          }
        },
        {
          key: "blood_drain",
          name: "汲取",
          description: "造成 140% 並回復造成傷害的 15%（冷卻 14s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 1.4));
            const heal = Math.floor(dmg * 0.15);
            m.hp = Math.min((m.maxHp || m.hp), (m.hp || 0) + heal);
            BossCore.setSkillCooldown(m, "blood_drain", 14);
            return dmg;
          }
        }
      ],

      _tickEndTurn(mon) { BossCore.endTurn(mon); },

      init(mon) {
        BossCore.init(mon);
        if (mon.baseAtk == null) mon.baseAtk = mon.atk;
        if (mon.baseDef == null) mon.baseDef = mon.def;
        if (mon.naturalDef == null) mon.naturalDef = mon.def;
        mon.skills = this.skills;
      }
    }
  },

  // ===== King 7：深淵支配者．奈克（Lv.300 / 多段王）=====
  king_07_nyke: {
    name: "🕳️ 深淵支配者．奈克",
    area: "special_boss",
    ticketItem: "Boss挑戰券",
    rewardItem: "Boss硬幣",
    rewardAmount: 1,

    stats: {
      name: "深淵支配者．奈克",
      isMapBoss: true,
      level: 300,
      hp: 38000000,
      atk: 16000,
      def: 3200,
      baseExp: 520000,
      baseGold: 130000,
      encounterRate: 100,

      dropRates: {
        gold: { min: 12000, max: 18000 },
        "Boss硬幣": { chance: 0.50, min: 1, max: 2 },
        "鑽石抽獎券": { chance: 0.15, min: 1, max: 1 }
      },

      extra: {
        defPercentOverride: 3.2,
        ignoreDefPctOverride: 0.32
      },

      controller(monster) {
        const canField = BossCore.getSkillCooldown(monster, "dark_field") <= 0;
        if (canField && Math.random() < 0.22) {
          monster.nextSkill = this.skills.find(s => s.key === "dark_field");
          return;
        }

        const canCombo = BossCore.getSkillCooldown(monster, "abyss_combo") <= 0;
        if (canCombo && Math.random() < 0.60) {
          monster.nextSkill = this.skills.find(s => s.key === "abyss_combo");
          return;
        }

        const canBurst = BossCore.getSkillCooldown(monster, "void_blast") <= 0;
        if (canBurst && Math.random() < 0.35) {
          monster.nextSkill = this.skills.find(s => s.key === "void_blast");
          return;
        }

        monster.nextSkill = this.skills.find(s => s.key === "basic");
      },

      skills: [
        {
          key: "basic",
          name: "深淵撕咬",
          description: "造成 100% 攻擊力（無冷卻）",
          castChance: 100,
          use: (p, m) => Math.max(0, Math.round((m.atk || 0) * 1.0))
        },
        {
          key: "abyss_combo",
          name: "深淵連擊",
          description: "3 段攻擊：每段 120%（冷卻 10s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 1.2 * 3));
            BossCore.setSkillCooldown(m, "abyss_combo", 10);
            return dmg;
          }
        },
        {
          key: "void_blast",
          name: "虛空爆裂",
          description: "造成 280% 攻擊力（冷卻 14s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 2.8));
            BossCore.setSkillCooldown(m, "void_blast", 14);
            return dmg;
          }
        },
        {
          key: "dark_field",
          name: "黑域",
          description: "使你虛弱 6s（冷卻 20s）",
          castChance: 100,
          use: (p, m) => {
            if (typeof window.applyPlayerStatus === "function") applyPlayerStatus("weaken", 6);
            BossCore.setSkillCooldown(m, "dark_field", 20);
            return 0;
          }
        }
      ],

      _tickEndTurn(mon) { BossCore.endTurn(mon); },

      init(mon) {
        BossCore.init(mon);
        if (mon.baseAtk == null) mon.baseAtk = mon.atk;
        if (mon.baseDef == null) mon.baseDef = mon.def;
        if (mon.naturalDef == null) mon.naturalDef = mon.def;
        mon.skills = this.skills;
      }
    }
  },

  // ===== King 8：狂亂君王．巴爾（Lv.400 / 狂暴王）=====
  king_08_baal: {
    name: "😈 狂亂君王．巴爾",
    area: "special_boss",
    ticketItem: "Boss挑戰券",
    rewardItem: "Boss硬幣",
    rewardAmount: 1,

    stats: {
      name: "狂亂君王．巴爾",
      isMapBoss: true,
      level: 400,
      hp: 85000000,
      atk: 26000,
      def: 4500,
      baseExp: 1100000,
      baseGold: 230000,
      encounterRate: 100,

      dropRates: {
        gold: { min: 18000, max: 26000 },
        "Boss硬幣": { chance: 0.55, min: 1, max: 2 },
        "鑽石抽獎券": { chance: 0.20, min: 1, max: 1 }
      },

      extra: {
        defPercentOverride: 3.8,
        ignoreDefPctOverride: 0.38
      },

      controller(monster) {
        // 簡易狂暴：血量低於 40% 進入狂暴（只加一次）
        const maxHp = Number(monster.maxHp || monster.hp || 0);
        const nowHp = Number(monster.hp || 0);
        if (!monster._enraged && maxHp > 0 && nowHp / maxHp <= 0.40) {
          monster._enraged = true;
          BossCore.applyFromSkill(monster, {
            atk: { mul: 1.8, durationSec: 999999 },
            buffs: [{ key: "speedMul", mode: "mul", value: 1.4, durationSec: 999999 }]
          });
        }

        const canSmash = BossCore.getSkillCooldown(monster, "mad_smash") <= 0;
        if (canSmash && Math.random() < 0.60) {
          monster.nextSkill = this.skills.find(s => s.key === "mad_smash");
          return;
        }

        const canRage = BossCore.getSkillCooldown(monster, "mad_roar") <= 0;
        if (canRage && Math.random() < 0.25) {
          monster.nextSkill = this.skills.find(s => s.key === "mad_roar");
          return;
        }

        monster.nextSkill = this.skills.find(s => s.key === "basic");
      },

      skills: [
        {
          key: "basic",
          name: "狂王重擊",
          description: "造成 100% 攻擊力（無冷卻）",
          castChance: 100,
          use: (p, m) => Math.max(0, Math.round((m.atk || 0) * 1.0))
        },
        {
          key: "mad_smash",
          name: "狂亂粉碎",
          description: "造成 240% 攻擊力（冷卻 10s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 2.4));
            BossCore.setSkillCooldown(m, "mad_smash", 10);
            return dmg;
          }
        },
        {
          key: "mad_roar",
          name: "瘋狂咆哮",
          description: "使你恐慌 2s（冷卻 20s）",
          castChance: 100,
          use: (p, m) => {
            if (typeof window.applyPlayerStatus === "function") applyPlayerStatus("fear", 2);
            BossCore.setSkillCooldown(m, "mad_roar", 20);
            return 0;
          }
        }
      ],

      _tickEndTurn(mon) { BossCore.endTurn(mon); },

      init(mon) {
        BossCore.init(mon);
        if (mon.baseAtk == null) mon.baseAtk = mon.atk;
        if (mon.baseDef == null) mon.baseDef = mon.def;
        if (mon.naturalDef == null) mon.naturalDef = mon.def;
        mon.skills = this.skills;
        mon._enraged = false;
      }
    }
  },

  // ===== King 9：時序裁決者．克洛諾（Lv.600 / 機制王）=====
  king_09_krono: {
    name: "⏳ 時序裁決者．克洛諾",
    area: "special_boss",
    ticketItem: "Boss挑戰券",
    rewardItem: "Boss硬幣",
    rewardAmount: 1,

    stats: {
      name: "時序裁決者．克洛諾",
      isMapBoss: true,
      level: 600,
      hp: 180000000,
      atk: 42000,
      def: 6800,
      baseExp: 2600000,
      baseGold: 420000,
      encounterRate: 100,

      dropRates: {
        gold: { min: 26000, max: 38000 },
        "Boss硬幣": { chance: 0.60, min: 1, max: 3 },
        "鑽石抽獎券": { chance: 0.25, min: 1, max: 2 }
      },

      extra: {
        defPercentOverride: 4.6,
        ignoreDefPctOverride: 0.45
      },

      controller(monster) {
        const canStop = BossCore.getSkillCooldown(monster, "time_stop") <= 0;
        if (canStop && Math.random() < 0.18) {
          monster.nextSkill = this.skills.find(s => s.key === "time_stop");
          return;
        }

        const canRewind = BossCore.getSkillCooldown(monster, "time_rewind") <= 0;
        if (canRewind && Math.random() < 0.18) {
          monster.nextSkill = this.skills.find(s => s.key === "time_rewind");
          return;
        }

        const canBlade = BossCore.getSkillCooldown(monster, "time_blade") <= 0;
        if (canBlade && Math.random() < 0.55) {
          monster.nextSkill = this.skills.find(s => s.key === "time_blade");
          return;
        }

        monster.nextSkill = this.skills.find(s => s.key === "basic");
      },

      skills: [
        {
          key: "basic",
          name: "時針敲擊",
          description: "造成 100% 攻擊力（無冷卻）",
          castChance: 100,
          use: (p, m) => Math.max(0, Math.round((m.atk || 0) * 1.0))
        },
        {
          key: "time_blade",
          name: "時刃",
          description: "造成 300% 攻擊力（冷卻 12s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 3.0));
            BossCore.setSkillCooldown(m, "time_blade", 12);
            return dmg;
          }
        },
        {
          key: "time_stop",
          name: "時間靜止",
          description: "使你停滯 2s（冷卻 24s）",
          castChance: 100,
          use: (p, m) => {
            if (typeof window.applyPlayerStatus === "function") applyPlayerStatus("stun", 2);
            BossCore.setSkillCooldown(m, "time_stop", 24);
            return 0;
          }
        },
        {
          key: "time_rewind",
          name: "回溯",
          description: "回復自身最大 HP 8%（冷卻 26s）",
          castChance: 100,
          use: (p, m) => {
            const maxHp = Number(m.maxHp || m.hp || 0);
            const heal = Math.floor(maxHp * 0.08);
            m.hp = Math.min(maxHp, (m.hp || 0) + heal);
            BossCore.setSkillCooldown(m, "time_rewind", 26);
            return 0;
          }
        }
      ],

      _tickEndTurn(mon) { BossCore.endTurn(mon); },

      init(mon) {
        BossCore.init(mon);
        BossCore.addBuff(mon, "speedMul", { mode: "mul", value: 1.05, durationSec: 999999 });
        if (mon.baseAtk == null) mon.baseAtk = mon.atk;
        if (mon.baseDef == null) mon.baseDef = mon.def;
        if (mon.naturalDef == null) mon.naturalDef = mon.def;
        mon.skills = this.skills;
      }
    }
  },

  // ===== King 10：終焉之王．Ω（Lv.900 / 終極王）=====
  king_10_omega: {
    name: "👑 終焉之王．Ω",
    area: "special_boss",
    ticketItem: "Boss挑戰券",
    rewardItem: "Boss硬幣",
    rewardAmount: 1,

    stats: {
      name: "終焉之王．Ω",
      isMapBoss: true,
      level: 900,
      hp: 420000000,
      atk: 78000,
      def: 12000,
      baseExp: 6200000,
      baseGold: 900000,
      encounterRate: 100,

      dropRates: {
        gold: { min: 52000, max: 78000 },
        "Boss硬幣": { chance: 0.70, min: 2, max: 4 },
        "鑽石抽獎券": { chance: 0.35, min: 1, max: 3 }
      },

      extra: {
        defPercentOverride: 5.8,
        ignoreDefPctOverride: 0.55
      },

      controller(monster) {
        const maxHp = Number(monster.maxHp || monster.hp || 0);
        const nowHp = Number(monster.hp || 0);
        const hpRate = (maxHp > 0) ? (nowHp / maxHp) : 1;

        // 多階段（只切一次）
        if (!monster._phase && hpRate <= 0.50) {
          monster._phase = 2;
          BossCore.applyFromSkill(monster, {
            atk: { mul: 1.25, durationSec: 999999 },
            def: { mul: 1.20, durationSec: 999999 },
            buffs: [{ key: "speedMul", mode: "mul", value: 1.15, durationSec: 999999 }]
          });
        }
        if (monster._phase !== 3 && hpRate <= 0.20) {
          monster._phase = 3;
          BossCore.applyFromSkill(monster, {
            atk: { mul: 1.35, durationSec: 999999 },
            buffs: [{ key: "speedMul", mode: "mul", value: 1.25, durationSec: 999999 }]
          });
        }

        const canSeal = BossCore.getSkillCooldown(monster, "omega_seal") <= 0;
        if (canSeal && Math.random() < 0.18) {
          monster.nextSkill = this.skills.find(s => s.key === "omega_seal");
          return;
        }

        const canShield = BossCore.getSkillCooldown(monster, "omega_barrier") <= 0;
        if (canShield && Math.random() < 0.18) {
          monster.nextSkill = this.skills.find(s => s.key === "omega_barrier");
          return;
        }

        const canBurst = BossCore.getSkillCooldown(monster, "omega_burst") <= 0;
        if (canBurst && Math.random() < 0.55) {
          monster.nextSkill = this.skills.find(s => s.key === "omega_burst");
          return;
        }

        const canSlash = BossCore.getSkillCooldown(monster, "omega_slash") <= 0;
        if (canSlash && Math.random() < 0.35) {
          monster.nextSkill = this.skills.find(s => s.key === "omega_slash");
          return;
        }

        monster.nextSkill = this.skills.find(s => s.key === "basic");
      },

      skills: [
        {
          key: "basic",
          name: "終焉斬擊",
          description: "造成 100% 攻擊力（無冷卻）",
          castChance: 100,
          use: (p, m) => Math.max(0, Math.round((m.atk || 0) * 1.0))
        },
        {
          key: "omega_slash",
          name: "Ω 斷界斬",
          description: "造成 260% 攻擊力（冷卻 10s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 2.6));
            BossCore.setSkillCooldown(m, "omega_slash", 10);
            return dmg;
          }
        },
        {
          key: "omega_burst",
          name: "Ω 終焉爆裂",
          description: "造成 340% 攻擊力（冷卻 14s）",
          castChance: 100,
          use: (p, m) => {
            const dmg = Math.max(0, Math.round((m.atk || 0) * 3.4));
            BossCore.setSkillCooldown(m, "omega_burst", 14);
            return dmg;
          }
        },
        {
          key: "omega_barrier",
          name: "Ω 絕對障壁",
          description: "獲得最大 HP 12% 護盾（冷卻 22s）",
          castChance: 100,
          use: (p, m) => {
            const maxHp = Number(m.maxHp || m.hp || 0);
            const shieldGain = Math.floor(maxHp * 0.12);
            m.shield = (m.shield || 0) + shieldGain;
            BossCore.setSkillCooldown(m, "omega_barrier", 22);
            return 0;
          }
        },
        {
          key: "omega_seal",
          name: "Ω 終末封印",
          description: "暈眩 2.5s，並造成 140%（冷卻 24s）",
          castChance: 100,
          use: (p, m) => {
            if (typeof window.applyPlayerStatus === "function") applyPlayerStatus("stun", 2.5);
            const dmg = Math.max(0, Math.round((m.atk || 0) * 1.4));
            BossCore.setSkillCooldown(m, "omega_seal", 24);
            return dmg;
          }
        }
      ],

      _tickEndTurn(mon) { BossCore.endTurn(mon); },

      init(mon) {
        BossCore.init(mon);
        BossCore.addBuff(mon, "speedMul", { mode: "mul", value: 1.1, durationSec: 999999 });
        if (mon.baseAtk == null) mon.baseAtk = mon.atk;
        if (mon.baseDef == null) mon.baseDef = mon.def;
        if (mon.naturalDef == null) mon.naturalDef = mon.def;
        mon.skills = this.skills;
        mon._phase = 1;
      }
    }
  }
};