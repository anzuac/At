// ===============================
// register.js — 多補助技能中心（SaveHub持久化 + 自動施放 + 升級 + 頂部面板 + 精通 + 前置限制）
// 依賴：save_hub_es2020.js、player.js、skills_hub.js
// ===============================
(function (w) {
  "use strict";

  // 依賴檢查
  if (!w.SkillsHub) { console.error("❌ register.js: SkillsHub 未載入"); return; }
  if (!w.SaveHub)   { console.error("❌ register.js: SaveHub 未載入");   return; }

  // 讓技能能安全寫入（避免載入順序問題）
  w.skillBonus = w.skillBonus || (w.player && w.player.skillBonus);

  // ===== 通用設定 =====
  const TAB_ID    = "assistSkills";
  const TAB_TITLE = "補助技能";
  const TICKET_ITEM_KEY = "被動能力券";
  const TICKET_PER_LV   = 1;
  const RESET_GEM_COST  = 1000; // 一鍵重置全部技能花費（鑽石）

  // ===== 小工具 =====
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function fmt(sec){
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec/60), s = sec%60;
    return (m<10?"0":"")+m+":"+(s<10?"0":"")+s;
  }
  function pct(x, digits){ return ((Number(x)||0) * 100).toFixed(digits ?? 0) + "%"; }

  function getPlayerJobTier() {
    try {
      const job = (w.player && w.player.job) ? String(w.player.job) : "";
      const m = job.match(/(\d+)$/); // 抓結尾數字
      return m ? Math.max(1, parseInt(m[1], 10)) : 1; // 沒寫數字當一轉
    } catch(_) {
      return 1;
    }
  }

  // --- 額外：顯示 buff 用的小工具（新增加） ---

  function signFlat(v){
    v = Number(v) || 0;
    return (v > 0 ? "+" : "") + v;
  }

  function pctSigned(x, d){
    x = Number(x) || 0;
    const s = x * 100;
    const str = s.toFixed(d == null ? 1 : d);
    return (x > 0 ? "+" : "") + str + "%";
  }

  function describeBuffShort(buff){
    if (!buff) return "無額外能力加成";
    const parts = [];

    if (buff.atkFlat != null && buff.atkFlat !== 0)
      parts.push("攻擊 " + signFlat(buff.atkFlat));
    if (buff.atk != null && buff.atk !== 0)
      parts.push("攻擊 " + pctSigned(buff.atk, 1));

    if (buff.defFlat != null && buff.defFlat !== 0)
      parts.push("防禦 " + signFlat(buff.defFlat));
    if (buff.def != null && buff.def !== 0)
      parts.push("防禦 " + pctSigned(buff.def, 1));

    if (buff.hpFlat != null && buff.hpFlat !== 0)
      parts.push("HP " + signFlat(buff.hpFlat));
    if (buff.hp != null && buff.hp !== 0)
      parts.push("HP " + pctSigned(buff.hp, 1));

    if (buff.dodgePercent != null && buff.dodgePercent !== 0)
      parts.push("迴避率 " + pctSigned(buff.dodgePercent, 1));

    if (buff.ignoreDefPct != null && buff.ignoreDefPct !== 0)
      parts.push("穿透 " + pctSigned(buff.ignoreDefPct, 1));

    if (buff.totalDamage != null && buff.totalDamage !== 0)
      parts.push("總傷害 " + pctSigned(buff.totalDamage, 1));

    if (buff.attackSpeedPct != null && buff.attackSpeedPct !== 0)
      parts.push("攻速 " + pctSigned(buff.attackSpeedPct, 1));

    if (buff.normalDamage != null && buff.normalDamage !== 0)
      parts.push("一般怪傷害 " + pctSigned(buff.normalDamage, 1));
    if (buff.eliteDamage != null && buff.eliteDamage !== 0)
      parts.push("菁英怪傷害 " + pctSigned(buff.eliteDamage, 1));
    if (buff.bossDamage != null && buff.bossDamage !== 0)
      parts.push("Boss 傷害 " + pctSigned(buff.bossDamage, 1));

    if (buff.expBonus != null && buff.expBonus !== 0)
      parts.push("經驗 " + pctSigned(buff.expBonus, 1));
    if (buff.dropBonus != null && buff.dropBonus !== 0)
      parts.push("掉寶 " + pctSigned(buff.dropBonus, 1));
    if (buff.goldBonus != null && buff.goldBonus !== 0)
      parts.push("金幣 " + pctSigned(buff.goldBonus, 1));

    return parts.length ? parts.join("，") : "無額外能力加成";
  }

  // ===== Skill 定義 helper =====
  function defineActiveSkill(cfg){
    if (!cfg) cfg = {};
    cfg.kind = "active";
    cfg.tab  = cfg.tab  || "basic";
    cfg.tier = cfg.tier || 1;
    return cfg;
  }

  function defineMasterySkill(cfg){
    if (!cfg) cfg = {};
    cfg.kind = "mastery";
    cfg.tab  = cfg.tab  || "mastery";
    cfg.tier = cfg.tier || 1;
    cfg.lvCap = cfg.lvCap || 30;
    return cfg;
  }

  // ===== 技能定義（主動 + 精通） =====
  const SKILLS = [
    // ---------- 一轉：主動技能 ----------

    // 怒氣上升 — 上限 20 等
    defineActiveSkill({
      id: "rage",
      name: "怒氣上升",
      ns: "skill:rageRise",
      buffKey: "buff:RageRise",
      tier: 1,
      lvCap: 20,
      cooldown: 300,
      cost: { mp: 20 },
      calcBuff(lv){
        return {
          atkFlat: 10 + 2 * (lv - 1),
          defFlat: -15
        };
      },
      calcDuration(lv){ return 30 + 1 * (lv - 1); },
      describeNow(lv){
        const atk = 10 + 2 * (lv - 1);
        const dur = 30 + 1 * (lv - 1);
        return "攻擊 +" + atk + "，防禦 -15；持續 " + dur + " 秒；冷卻 300 秒；消耗 MP 20";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv = lv + 1;
        const atk = 10 + 2 * (nlv - 1);
        const dur = 30 + 1 * (nlv - 1);
        return "下一級 → 攻擊 +" + atk + "，持續 " + dur +
               " 秒；需要『" + TICKET_ITEM_KEY + "』x" + TICKET_PER_LV;
      }
    }),

    // 堅韌護體 — 一轉可施放，上限 20 等
    defineActiveSkill({
      id: "iron_body",
      name: "堅韌護體",
      ns: "skill:ironBody",
      buffKey: "buff:IronBody",
      tier: 1,
      lvCap: 20,
      cooldown: 120,
      cost: { mp: 10 },
      calcBuff(lv){
        return {
          defFlat: 5 * lv
        };
      },
      calcDuration(_lv){ return 60; },
      describeNow(lv){
        const def = 5 * lv;
        return "防禦 +" + def + "；持續 60 秒；冷卻 120 秒；消耗 MP 10";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv = lv + 1;
        const def = 5 * nlv;
        return "下一級 → 防禦 +" + def +
               "；需要『" + TICKET_ITEM_KEY + "』x" + TICKET_PER_LV;
      }
    }),

    // ---------- 二轉：主動技能 ----------

    // 迴避躲閃（二轉）
    defineActiveSkill({
      id: "dodge",
      name: "迴避躲閃",
      ns: "skill:dodgeBoost",
      buffKey: "buff:DodgeBoost",
      tier: 2,
      lvCap: 30,
      cooldown: 360,
      cost: { mp: 25 },
      calcBuff(lv){
        return {
          dodgePercent: 0.20 + 0.01 * (lv - 1)
        };
      },
      calcDuration(lv){ return 30 + 2 * (lv - 1); },
      describeNow(lv){
        const rate = 0.20 + 0.01 * (lv - 1);
        const dur  = 30 + 2 * (lv - 1);
        return "迴避率 +" + pct(rate) + "；持續 " + dur +
               " 秒；冷卻 180 秒；消耗 MP 25";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv  = lv + 1;
        const rate = 0.20 + 0.02 * (nlv - 1);
        const dur  = 30 + 2 * (nlv - 1);
        return "下一級 → 迴避率 +" + pct(rate) +
               "、持續 " + dur + " 秒；需要『" + TICKET_ITEM_KEY + "』x" + TICKET_PER_LV;
      }
    }),

    // 穿透 — 二轉主動，lvCap 10
    defineActiveSkill({
      id: "pierce",
      name: "穿透",
      ns: "skill:pierce",
      buffKey: "buff:Pierce",
      tier: 2,
      lvCap: 10,
      cooldown: 300,
      cost: { mp: 30 },
      calcBuff(lv){
        return {
          ignoreDefPct: 0.10 + 0.015 * (lv - 1)
        };
      },
      calcDuration(_lv){ return 60; },
      describeNow(lv){
        const v = 0.10 + 0.015 * (lv - 1);
        return "穿透 +" + pct(v, 1) +
               "；持續 60 秒；冷卻 300 秒；消耗 MP 30";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv = lv + 1;
        const v   = 0.10 + 0.015 * (nlv - 1);
        return "下一級 → 穿透 +" + pct(v, 1) +
               "；需要『" + TICKET_ITEM_KEY + "』x" + TICKET_PER_LV;
      }
    }),

    // 幸運財寶 — 二轉主動，上限 20
    defineActiveSkill({
      id: "lucky",
      name: "幸運財寶",
      ns: "skill:luckyTreasure",
      buffKey: "buff:LuckyTreasure",
      tier: 2,
      lvCap: 20,
      cooldown: 300,
      cost: { hpPct: 0.20 },
      calcBuff(lv){
        const b = 0.10 + 0.01 * (lv - 1);
        return {
          expBonus:  b,
          dropBonus: b,
          goldBonus: b
        };
      },
      calcDuration(_lv){ return 60; },
      describeNow(lv){
        const b = 0.10 + 0.01 * (lv - 1);
        return "消耗 HP 20%，經驗/掉寶/金幣 +" + pct(b) +
               "；持續 60 秒；冷卻 300 秒";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv = lv + 1;
        const b   = 0.10 + 0.01 * (nlv - 1);
        return "下一級 → 經驗/掉寶/金幣 +" + pct(b) +
               "；需要『" + TICKET_ITEM_KEY + "』x" + TICKET_PER_LV;
      }
    }),

    // 武器精通 — 二轉主動，上限 30
    defineActiveSkill({
      id: "weapon_mastery",
      name: "武器精通",
      ns: "skill:weaponMastery",
      buffKey: "buff:WeaponMastery",
      tier: 2,
      lvCap: 30,
      cooldown: 180,
      cost: { mp: 50 },
      calcBuff(lv){
        return {
          totalDamage: 0.01 * lv
        };
      },
      calcDuration(_lv){ return 60; },
      describeNow(lv){
        const dmg = 0.01 * lv;
        return "總傷害 +" + pct(dmg) +
               "；持續 60 秒；冷卻 180 秒；消耗 MP 50";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv = lv + 1;
        const dmg = 0.01 * nlv;
        return "下一級 → 總傷害 +" + pct(dmg) +
               "；需要『" + TICKET_ITEM_KEY + "』x" + TICKET_PER_LV;
      }
    }),

    // ---------- 三轉：主動技能 ----------

    // 怪物殺手 — 三轉主動，上限 30
    defineActiveSkill({
      id: "monster_slayer",
      name: "怪物殺手",
      ns: "skill:monsterSlayer",
      buffKey: "buff:MonsterSlayer",
      tier: 3,
      lvCap: 30,
      cooldown: 120,
      cost: { mp: 60 },
      calcBuff(lv){
        return {
          normalDamage: 0.02  * lv,   // 滿等 60%
          eliteDamage:  0.015 * lv,   // 滿等 45%
          bossDamage:   0.01  * lv    // 滿等 30%
        };
      },
      calcDuration(_lv){ return 60; },
      describeNow(lv){
        const n = 0.02  * lv;
        const e = 0.015 * lv;
        const b = 0.01  * lv;
        return "一般怪 +" + pct(n) +
               "，菁英怪 +" + pct(e) +
               "，Boss +" + pct(b) +
               "；持續 60 秒；冷卻 120 秒；消耗 MP 60";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv = lv + 1;
        const n = 0.02  * nlv;
        const e = 0.015 * nlv;
        const b = 0.01  * nlv;
        return "下一級 → 一般怪 +" + pct(n) +
               "，菁英怪 +" + pct(e) +
               "，Boss +" + pct(b) +
               "；需要『" + TICKET_ITEM_KEY + "』x" + TICKET_PER_LV;
      }
    }),

    // ===========================
    // 精通技能（mastery） — 這邊加好前置條件
    // ===========================

    // 二轉精通：怒氣上升精通 I
    defineMasterySkill({
      id: "rage_mastery",
      name: "怒氣上升精通 I",
      ns: "mastery:rage1",
      tier: 2,
      lvCap: 30,
      // 必須先把 怒氣上升 本體點滿 (20)
      prereq: { skillId: "rage", skillMinLv: 20 },
      describeNow(lv){
        if (!lv) return "尚未獲得加成。滿等：怒氣上升額外 MP +30、攻擊力 +60、攻擊力 +10%。";
        const mp   = (30/30) * lv;
        const atkF = (60/30) * lv;
        const atkP = (0.10/30) * lv;
        return "目前 → 怒氣上升：MP 消耗 +" + mp +
               "，攻擊力 +" + atkF +
               "，攻擊力 +" + pct(atkP,1);
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv = lv + 1;
        const mp   = (30/30) * nlv;
        const atkF = (60/30) * nlv;
        const atkP = (0.10/30) * nlv;
        return "下一級 → 怒氣上升：MP 消耗 +" + mp +
               "，攻擊力 +" + atkF +
               "，攻擊力 +" + pct(atkP,1) +
               "；需要「" + TICKET_ITEM_KEY + "」x" + TICKET_PER_LV;
      }
    }),

    // 二轉精通：堅韌護體精通 I
    defineMasterySkill({
      id: "iron_body_mastery",
      name: "堅韌護體精通 I",
      ns: "mastery:ironBody1",
      tier: 2,
      lvCap: 30,
      // 必須先把 堅韌護體 基礎技能點滿 (20)
      prereq: { skillId: "iron_body", skillMinLv: 20 },
      describeNow(lv){
        if (!lv) return "尚未獲得加成。滿等：堅韌護體額外防禦 +60、防禦 +15%、HP +10%。";
        const defF = (60/30) * lv;
        const defP = (0.15/30) * lv;
        const hpP  = (0.10/30) * lv;
        return "目前 → 堅韌護體：防禦 +" + defF +
               "，防禦 +" + pct(defP,1) +
               "，HP +" + pct(hpP,1);
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv  = lv + 1;
        const defF = (60/30) * nlv;
        const defP = (0.15/30) * nlv;
        const hpP  = (0.10/30) * nlv;
        return "下一級 → 堅韌護體：防禦 +" + defF +
               "，防禦 +" + pct(defP,1) +
               "，HP +" + pct(hpP,1) +
               "；需要「" + TICKET_ITEM_KEY + "」x" + TICKET_PER_LV;
      }
    }),

    // 三轉精通：怒氣上升精通 II（必須怒氣精通 I 滿等）
    defineMasterySkill({
      id: "rage_mastery2",
      name: "怒氣上升精通 II",
      ns: "mastery:rage2",
      tier: 3,
      lvCap: 30,
      prereq: { masteryId: "rage_mastery", masteryMinLv: 30 },
      describeNow(lv){
        if (!lv) return "尚未獲得加成。滿等：攻擊力再 +10%、攻擊速度 +60%、持續時間額外 +60 秒。";
        const atkP = (0.10/30) * lv;
        const aspd = (0.60/30) * lv;
        const dur  = (60/30) * lv;
        return "目前 → 怒氣上升：攻擊力 +" + pct(atkP,1) +
               "，攻擊速度 +" + pct(aspd,1) +
               "，持續時間 +" + dur.toFixed(0) + " 秒";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv = lv + 1;
        const atkP = (0.10/30) * nlv;
        const aspd = (0.60/30) * nlv;
        const dur  = (120/30) * nlv;
        return "下一級 → 怒氣上升：攻擊力 +" + pct(atkP,1) +
               "，攻擊速度 +" + pct(aspd,1) +
               "，持續時間 +" + dur.toFixed(0) + " 秒；需要券 x" + TICKET_PER_LV;
      }
    }),

    // 三轉精通：堅韌護體精通 II（需堅韌精通 I 滿等）
    defineMasterySkill({
      id: "iron_body_mastery2",
      name: "堅韌護體精通 II",
      ns: "mastery:ironBody2",
      tier: 3,
      lvCap: 30,
      prereq: { masteryId: "iron_body_mastery", masteryMinLv: 30 },
      describeNow(lv){
        if (!lv) return "尚未獲得加成。滿等：防禦再 +10%、HP 再 +15%。";
        const defP = (0.10/30) * lv;
        const hpP  = (0.15/30) * lv;
        return "目前 → 堅韌護體：防禦 +" + pct(defP,1) +
               "，HP +" + pct(hpP,1);
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv  = lv + 1;
        const defP = (0.10/30) * nlv;
        const hpP  = (0.15/30) * nlv;
        return "下一級 → 堅韌護體：防禦 +" + pct(defP,1) +
               "，HP +" + pct(hpP,1) +
               "；需要券 x" + TICKET_PER_LV;
      }
    }),

    // 三轉精通：穿透精通（需穿透點滿）
    defineMasterySkill({
      id: "pierce_mastery",
      name: "穿透精通",
      ns: "mastery:pierce",
      tier: 3,
      lvCap: 30,
      prereq: { skillId: "pierce", skillMinLv: 10 },
      describeNow(lv){
        if (!lv) return "尚未獲得加成。滿等：穿透再 +15%。";
        const pierce = (0.15/30) * lv;
        return "目前 → 穿透額外 +" + pct(pierce,1);
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv   = lv + 1;
        const pierce = (0.15/30) * nlv;
        return "下一級 → 穿透額外 +" + pct(pierce,1) +
               "；需要券 x" + TICKET_PER_LV;
      }
    }),

    // 三轉精通：幸運財寶精通 I（需幸運財寶點滿）
    defineMasterySkill({
      id: "lucky_mastery",
      name: "幸運財寶精通 I",
      ns: "mastery:lucky1",
      tier: 3,
      lvCap: 30,
      prereq: { skillId: "lucky", skillMinLv: 20 },
      describeNow(lv){
        if (!lv) return "尚未獲得加成。滿等：經驗 / 掉寶 / 金幣再 +60%，持續時間額外 +120 秒。";
        const bonus = (0.60/30) * lv;
        const dur   = (120/30) * lv;
        return "目前 → 幸運財寶：三項 +" + pct(bonus,1) +
               "，持續時間 +" + dur.toFixed(0) + " 秒";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv   = lv + 1;
        const bonus = (0.60/30) * nlv;
        const dur   = (120/30) * nlv;
        return "下一級 → 幸運財寶：三項 +" + pct(bonus,1) +
               "，持續時間 +" + dur.toFixed(0) + " 秒；需要券 x" + TICKET_PER_LV;
      }
    }),

    // 四轉精通：怒氣上升精通 III（需怒氣精通 II 滿）
    defineMasterySkill({
      id: "rage_mastery3",
      name: "怒氣上升精通 III",
      ns: "mastery:rage3",
      tier: 4,
      lvCap: 30,
      prereq: { masteryId: "rage_mastery2", masteryMinLv: 30 },
      describeNow(lv){
        if (!lv) return "尚未獲得加成。滿等：攻擊力再 +10%、持續 +60 秒、冷卻 -100 秒。";
        const atkP = (0.10/30) * lv;
        const dur  = (60/30) * lv;
        const cdR  = (100/30) * lv;
        return "目前 → 怒氣上升：攻擊力 +" + pct(atkP,1) +
               "，持續 +" + dur.toFixed(0) +
               " 秒，冷卻縮短約 " + cdR.toFixed(0) + " 秒";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv = lv + 1;
        const atkP = (0.10/30) * nlv;
        const dur  = (60/30) * nlv;
        const cdR  = (100/30) * nlv;
        return "下一級 → 怒氣上升：攻擊力 +" + pct(atkP,1) +
               "，持續 +" + dur.toFixed(0) +
               " 秒，冷卻縮短約 " + cdR.toFixed(0) + " 秒；需要券 x" + TICKET_PER_LV;
      }
    }),

    // 四轉精通：堅韌護體精通 III（需堅韌精通 II 滿）
    defineMasterySkill({
      id: "iron_body_mastery3",
      name: "堅韌護體精通 III",
      ns: "mastery:ironBody3",
      tier: 4,
      lvCap: 30,
      prereq: { masteryId: "iron_body_mastery2", masteryMinLv: 30 },
      describeNow(lv){
        if (!lv) return "尚未獲得加成。滿等：持續 +60 秒、防禦再 +5%、HP +3000。";
        const defP = (0.05/30) * lv;
        const hpF  = (3000/30) * lv;
        const dur  = (60/30) * lv;
        return "目前 → 堅韌護體：防禦 +" + pct(defP,1) +
               "，HP +" + hpF.toFixed(0) +
               "，持續 +" + dur.toFixed(0) + " 秒";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv  = lv + 1;
        const defP = (0.05/30) * nlv;
        const hpF  = (3000/30) * nlv;
        const dur  = (120/30) * nlv;
        return "下一級 → 堅韌護體：防禦 +" + pct(defP,1) +
               "，HP +" + hpF.toFixed(0) +
               "，持續 +" + dur.toFixed(0) + " 秒；需要券 x" + TICKET_PER_LV;
      }
    }),

    // 四轉精通：武器精通・精通（需武器精通本體滿等）
    defineMasterySkill({
      id: "weapon_mastery_mastery",
      name: "武器精通・精通",
      ns: "mastery:weaponMastery",
      tier: 4,
      lvCap: 30,
      prereq: { skillId: "weapon_mastery", skillMinLv: 30 },
      describeNow(lv){
        if (!lv) return "尚未獲得加成。滿等：總傷害再 +30%，持續 +120 秒。";
        const dmg = (0.30/30) * lv;
        const dur = (120/30) * lv;
        return "目前 → 武器精通：總傷害 +" + pct(dmg,1) +
               "，持續 +" + dur.toFixed(0) + " 秒";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv = lv + 1;
        const dmg = (0.30/30) * nlv;
        const dur = (120/30) * nlv;
        return "下一級 → 武器精通：總傷害 +" + pct(dmg,1) +
               "，持續 +" + dur.toFixed(0) + " 秒；需要券 x" + TICKET_PER_LV;
      }
    }),

    // 四轉精通：怪物殺手・精（需怪物殺手本體滿等）
    defineMasterySkill({
      id: "monster_slayer_mastery",
      name: "怪物殺手・精",
      ns: "mastery:monsterSlayer",
      tier: 4,
      lvCap: 30,
      prereq: { skillId: "monster_slayer", skillMinLv: 30 },
      describeNow(lv){
        if (!lv) return "尚未獲得加成。滿等：持續 +100 秒，三種傷害再 +60%。";
        const dmg = (0.60/30) * lv;
        const dur = (100/30) * lv;
        return "目前 → 怪物殺手：一般 / 菁英 / Boss +" + pct(dmg,1) +
               "，持續 +" + dur.toFixed(0) + " 秒";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv = lv + 1;
        const dmg = (0.60/30) * nlv;
        const dur = (100/30) * nlv;
        return "下一級 → 怪物殺手：一般 / 菁英 / Boss +" + pct(dmg,1) +
               "，持續 +" + dur.toFixed(0) + " 秒；需要券 x" + TICKET_PER_LV;
      }
    }),

    // 五轉精通：幸運財寶精通 II（需幸運精通 I 滿等）
    defineMasterySkill({
      id: "lucky_mastery2",
      name: "幸運財寶精通 II",
      ns: "mastery:lucky2",
      tier: 5,
      lvCap: 50,
      prereq: { masteryId: "lucky_mastery", masteryMinLv: 30 },
      describeNow(lv){
        if (!lv) return "尚未獲得加成。滿等：三項再 +100%，冷卻 -100 秒（200 秒）。";
        const bonus = (1.00/50) * lv;
        const cdR   = (100/50) * lv;
        return "目前 → 幸運財寶：三項 +" + pct(bonus,1) +
               "，冷卻縮短約 " + cdR.toFixed(0) + " 秒";
      },
      describeNext(lv){
        if (lv >= this.lvCap) return "已達等級上限";
        const nlv   = lv + 1;
        const bonus = (1.00/50) * nlv;
        const cdR   = (100/50) * nlv;
        return "下一級 → 幸運財寶：三項 +" + pct(bonus,1) +
               "，冷卻縮短約 " + cdR.toFixed(0) + " 秒；需要券 x" + TICKET_PER_LV;
      }
    })
  ];

  // ===== 狀態 & 查詢工具 =====
  const states = {}; // ns -> { level, auto, remain, cool }

  function findSkillById(id){
    for (let i=0;i<SKILLS.length;i++){
      if (SKILLS[i].id === id) return SKILLS[i];
    }
    return null;
  }

  function getLevelById(id){
    const skill = findSkillById(id);
    if (!skill) return 0;
    const st = states[skill.ns];
    if (!st) return 0;
    const minLv = (skill.kind === "mastery") ? 0 : 1;
    const rawLv = (st.level == null ? minLv : Number(st.level));
    return clamp(rawLv, minLv, skill.lvCap);
  }

  function getMasteryLevel(id){
    return getLevelById(id) || 0;
  }

  // ===== 狀態（SaveHub）=====
  function loadState(skill){
    const defaultLevel = (skill.kind === "mastery") ? 0 : 1;
    const s = w.SaveHub.get(skill.ns, { _ver:1, level:defaultLevel, auto:false, remain:0, cool:0 }) || {};
    const minLv = defaultLevel;
    s.level  = clamp(Number(s.level == null ? defaultLevel : s.level), minLv, skill.lvCap);
    s.auto   = !!s.auto;
    s.remain = Math.max(0, Number(s.remain || 0));
    s.cool   = Math.max(0, Number(s.cool   || 0));
    return s;
  }

  function saveState(skill){
    const st = states[skill.ns];
    const minLv = (skill.kind === "mastery") ? 0 : 1;
    w.SaveHub.set(skill.ns, {
      _ver: 1,
      level: clamp(Number(st.level == null ? minLv : st.level), minLv, skill.lvCap),
      auto: !!st.auto,
      remain: Math.max(0, Math.floor(st.remain || 0)),
      cool:   Math.max(0, Math.floor(st.cool   || 0))
    });
  }

  function getLv(skill){
    const minLv = (skill.kind === "mastery") ? 0 : 1;
    const st = states[skill.ns] || {};
    const raw = (st.level == null ? minLv : Number(st.level));
    return clamp(raw, minLv, skill.lvCap);
  }

  function canCast(skill){
    if (skill.kind !== "active") return false;
    const st = states[skill.ns];
    return (st.cool <= 0) && (st.remain <= 0) && getLv(skill) > 0;
  }

  // ===== 升級前置條件檢查 =====
  function checkPrereq(skill) {
    const p = skill.prereq;
    if (!p) return { ok: true };

    // 需要某個主動技能達到一定等級
    if (p.skillId) {
      const needSkillLv = Number(p.skillMinLv || 1);
      const curSkillLv  = getLevelById(p.skillId) || 0;
      if (curSkillLv < needSkillLv) {
        const s = findSkillById(p.skillId);
        const name = s ? s.name : p.skillId;
        return {
          ok: false,
          msg: "需要「" + name + "」達到 Lv." + needSkillLv + " 才能升級此技能 / 精通"
        };
      }
    }

    // 需要前一個精通達到一定等級
    if (p.masteryId) {
      const needMlv = Number(p.masteryMinLv || 1);
      const curMlv  = getLevelById(p.masteryId) || 0;
      if (curMlv < needMlv) {
        const m = findSkillById(p.masteryId);
        const mname = m ? m.name : p.masteryId;
        return {
          ok: false,
          msg: "需要「" + mname + "」達到 Lv." + needMlv + " 才能升級此技能 / 精通"
        };
      }
    }

    return { ok: true };
  }

  // ===== 主動技能：計算「套用精通後」的實際參數 =====
  function computeEffectiveParams(skill, lv){
    const base = {
      costMp:   (skill.cost && skill.cost.mp)    ? Number(skill.cost.mp)    : 0,
      costHpPct:(skill.cost && skill.cost.hpPct) ? Number(skill.cost.hpPct) : 0,
      cooldown: Number(skill.cooldown || 0),
      duration: (typeof skill.calcDuration === "function") ? Number(skill.calcDuration(lv)) : 0,
      buff:     (typeof skill.calcBuff === "function") ? (skill.calcBuff(lv) || {}) : {}
    };

    // ===== 套用怒氣精通 1/2/3 =====
    if (skill.id === "rage") {
      const m1 = getMasteryLevel("rage_mastery");
      const m2 = getMasteryLevel("rage_mastery2");
      const m3 = getMasteryLevel("rage_mastery3");
      const r1 = m1 / 30;
      const r2 = m2 / 30;
      const r3 = m3 / 30;

      // 精通 I：MP +30、攻擊力 +60、攻擊力 +10%
      base.costMp += 30 * r1;
      base.buff.atkFlat = (base.buff.atkFlat || 0) + 60 * r1;
      let atkPct = 0.10 * r1;

      // 精通 II：再 +10% 攻擊力、攻速 +60%、持續 +120 秒
      atkPct += 0.10 * r2;
      const aspd = 0.60 * r2;
      if (aspd) base.buff.attackSpeedPct = (base.buff.attackSpeedPct || 0) + aspd;
      base.duration += 60 * r2;

      // 精通 III：再 +10% 攻擊力、持續 +180 秒、CD -100 秒
      atkPct += 0.10 * r3;
      base.duration += 60 * r3;
      const cdRed = 100 * r3;
      base.cooldown = Math.max(10, base.cooldown - cdRed);

      if (atkPct) base.buff.atk = (base.buff.atk || 0) + atkPct;
    }

    // ===== 套用堅韌護體精通 1/2/3 =====
    if (skill.id === "iron_body") {
      const f1 = getMasteryLevel("iron_body_mastery");
      const f2 = getMasteryLevel("iron_body_mastery2");
      const f3 = getMasteryLevel("iron_body_mastery3");
      const rf1 = f1 / 30;
      const rf2 = f2 / 30;
      const rf3 = f3 / 30;

      // 精通 I：+60 防禦、+15% 防禦、+10% HP
      base.buff.defFlat = (base.buff.defFlat || 0) + 60 * rf1;
      let defPct = 0.15 * rf1;
      let hpPct  = 0.10 * rf1;

      // 精通 II：再 +10% 防禦、+15% HP
      defPct += 0.10 * rf2;
      hpPct  += 0.15 * rf2;

      // 精通 III：再 +5% 防禦、HP +3000、持續 +120 秒
      defPct += 0.05 * rf3;
      const hpFlat = 3000 * rf3;
      base.duration += 60 * rf3;

      if (defPct) base.buff.def = (base.buff.def || 0) + defPct;
      if (hpPct)  base.buff.hp  = (base.buff.hp  || 0) + hpPct;
      if (hpFlat) base.buff.hpFlat = (base.buff.hpFlat || 0) + hpFlat;
    }

    // ===== 穿透精通 =====
    if (skill.id === "pierce") {
      const pm = getMasteryLevel("pierce_mastery");
      const rp = pm / 30;
      const extraIgnore = 0.15 * rp;
      if (extraIgnore) base.buff.ignoreDefPct = (base.buff.ignoreDefPct || 0) + extraIgnore;
    }

    // ===== 幸運財寶精通 1 / 2 =====
    if (skill.id === "lucky") {
      const lm1 = getMasteryLevel("lucky_mastery");
      const lm2 = getMasteryLevel("lucky_mastery2");
      const rl1 = lm1 / 30;
      const rl2 = lm2 / 50;

      // 精通 I：+60% 三項 + 持續 +120 秒
      const bonus1 = 0.60 * rl1;
      base.duration += 120 * rl1;

      // 精通 II：再 +100% 三項、CD -100 秒
      const bonus2 = 1.00 * rl2;
      const cdRed2 = 100 * rl2;
      base.cooldown = Math.max(10, base.cooldown - cdRed2);

      const addAll = bonus1 + bonus2;
      if (addAll) {
        base.buff.expBonus  = (base.buff.expBonus  || 0) + addAll;
        base.buff.dropBonus = (base.buff.dropBonus || 0) + addAll;
        base.buff.goldBonus = (base.buff.goldBonus || 0) + addAll;
      }
    }

    // ===== 武器精通・精通 =====
    if (skill.id === "weapon_mastery") {
      const wm = getMasteryLevel("weapon_mastery_mastery");
      const rw = wm / 30;
      const extraDmg = 0.30 * rw;
      const extraDur = 120 * rw;
      if (extraDmg) base.buff.totalDamage = (base.buff.totalDamage || 0) + extraDmg;
      base.duration += extraDur;
    }

    // ===== 怪物殺手・精 =====
    if (skill.id === "monster_slayer") {
      const mm = getMasteryLevel("monster_slayer_mastery");
      const rm = mm / 30;
      const extraDur = 100 * rm;
      const extraDmg = 0.60 * rm;
      base.duration += extraDur;
      if (extraDmg) {
        base.buff.normalDamage = (base.buff.normalDamage || 0) + extraDmg;
        base.buff.eliteDamage  = (base.buff.eliteDamage  || 0) + extraDmg;
        base.buff.bossDamage   = (base.buff.bossDamage   || 0) + extraDmg;
      }
    }

    return base;
  }

  // ===== Buff 寫入 / 移除 =====
  function applyBuff(skill, on, buffOverride){
    const SB = w.skillBonus || (w.player && w.player.skillBonus);
    if (!SB || !SB.bonusData) return;
    if (skill.kind !== "active") return;
    if (on) {
      const buff = buffOverride || (typeof skill.calcBuff === "function"
        ? skill.calcBuff(getLv(skill)) || {}
        : {});
      SB.bonusData[skill.buffKey] = buff;
    } else {
      delete SB.bonusData[skill.buffKey];
    }
  }

  // ===== 資源檢查 & 扣資源 =====
  function hasResources(skill, eff){
    const p = w.player; if (!p) return false;
    const mpNeed = eff.costMp || 0;
    const hpPct  = eff.costHpPct || 0;

    if (mpNeed){
      if ((p.currentMP||0) < mpNeed) return false;
    }
    if (hpPct){
      const maxHP = Number(p.totalStats && p.totalStats.hp || 0);
      const need = Math.ceil(maxHP * hpPct);
      if ((p.currentHP||0) <= need) return false;
    }
    return true;
  }

  function payCost(skill, eff){
    const p = w.player;
    if (!p) return;
    const mpNeed = eff.costMp || 0;
    const hpPct  = eff.costHpPct || 0;

    if (mpNeed){
      p.currentMP = Math.max(0, (p.currentMP||0) - mpNeed);
    }
    if (hpPct){
      const maxHP = Number(p.totalStats && p.totalStats.hp || 0);
      const need = Math.ceil(maxHP * hpPct);
      p.currentHP = Math.max(1, (p.currentHP||0) - need);
    }
    if (typeof w.updateResourceUI === "function") w.updateResourceUI();
  }

  // ===== 升級（active + mastery 共用）=====
  function tryUpgrade(skill){
    const st = states[skill.ns];
    const lv = getLv(skill);
    if (lv >= skill.lvCap) {
      alert("等級已達上限 (" + skill.lvCap + ")");
      return;
    }

    const tierNeed = skill.tier || 1;
    const curTier  = getPlayerJobTier();
    if (curTier < tierNeed) {
      alert("需要「" + tierNeed + "轉」才能升級此技能 / 精通");
      return;
    }

    // ✅ 檢查前置技能 / 精通是否點滿
    const pre = checkPrereq(skill);
    if (!pre.ok) {
      alert(pre.msg || "前置條件未滿足，無法升級");
      return;
    }

    if (typeof w.getItemQuantity !== "function" || typeof w.removeItem !== "function") {
      alert("❌ 找不到道具介面（getItemQuantity/removeItem）");
      return;
    }
    const owned = Number(w.getItemQuantity(TICKET_ITEM_KEY) || 0);
    if (owned < TICKET_PER_LV) {
      alert("需要『" + TICKET_ITEM_KEY + "』x" + TICKET_PER_LV + "，持有：" + owned);
      return;
    }

    w.removeItem(TICKET_ITEM_KEY, TICKET_PER_LV);

    const minLv = (skill.kind === "mastery") ? 0 : 1;
    st.level = clamp(lv + 1, minLv, skill.lvCap);

    // ⚠ 正在生效中的 buff 不重算，維持「這一發鎖定」，下一次施放才會吃新等級
    saveState(skill);
    if (w.logPrepend) w.logPrepend("⬆️ " + skill.name + " 等級提升至 Lv." + getLv(skill));
    w.SkillsHub.requestRerender();
    if (typeof w.updateResourceUI === "function") w.updateResourceUI();
  }

  function toggleAuto(skill, on){
    states[skill.ns].auto = !!on;
    saveState(skill);
    w.SkillsHub.requestRerender();
  }

  // ===== 施放 =====
  function cast(skill, isAuto){
    if (skill.kind !== "active") return;
    const st = states[skill.ns];
    if (!canCast(skill)) return;

    const lv  = getLv(skill);
    const eff = computeEffectiveParams(skill, lv);

    if (!hasResources(skill, eff)) {
      if (isAuto) return;
      const needTxt = [];
      if (eff.costMp)    needTxt.push("MP " + eff.costMp);
      if (eff.costHpPct) needTxt.push("HP " + pct(eff.costHpPct));
      alert("資源不足，需：" + needTxt.join("、"));
      return;
    }

    payCost(skill, eff);

    st.remain = eff.duration || 0;
    st.cool   = eff.cooldown || 0;
    applyBuff(skill, true, eff.buff);

    if (w.logPrepend) w.logPrepend("🔥 " + skill.name + " 發動！");
    saveState(skill);
    w.SkillsHub.requestRerender();
  }

  // ===== 頂部面板 =====
  function getTicketCount(){
    try {
      return (typeof w.getItemQuantity === "function")
        ? Number(w.getItemQuantity(TICKET_ITEM_KEY) || 0)
        : 0;
    } catch(_) { return 0; }
  }

  function aggregateActiveBuffs(){
    const SB = w.skillBonus || (w.player && w.player.skillBonus);
    const sum = {
      atkFlat:0, defFlat:0, dodgePercent:0, ignoreDefPct:0,
      expBonus:0, dropBonus:0, goldBonus:0, totalDamage:0
    };
    if (!SB || !SB.bonusData) return sum;

    for (let i=0;i<SKILLS.length;i++){
      const skill = SKILLS[i];
      if (skill.kind !== "active") continue;
      const key = skill.buffKey;
      if (!key) continue;
      const b = SB.bonusData[key];
      if (!b) continue;
      if (typeof b.atkFlat        === "number") sum.atkFlat        += b.atkFlat;
      if (typeof b.defFlat        === "number") sum.defFlat        += b.defFlat;
      if (typeof b.dodgePercent   === "number") sum.dodgePercent   += b.dodgePercent;
      if (typeof b.ignoreDefPct   === "number") sum.ignoreDefPct   += b.ignoreDefPct;
      if (typeof b.expBonus       === "number") sum.expBonus       += b.expBonus;
      if (typeof b.dropBonus      === "number") sum.dropBonus      += b.dropBonus;
      if (typeof b.goldBonus      === "number") sum.goldBonus      += b.goldBonus;
      if (typeof b.totalDamage    === "number") sum.totalDamage    += b.totalDamage;
    }
    return sum;
  }

  function resetAllSkills(){
    const p = w.player;
    if (!p) { alert("玩家尚未初始化"); return; }
    if ((p.gem||0) < RESET_GEM_COST) {
      alert("鑽石不足，需要 " + RESET_GEM_COST);
      return;
    }

    const ok = confirm("確定花費 " + RESET_GEM_COST + " 鑽石重置全部技能？（主動回 Lv.1、精通回 Lv.0、生效與冷卻清空）");
    if (!ok) return;

    p.gem = Math.max(0, (p.gem||0) - RESET_GEM_COST);

    for (let i=0;i<SKILLS.length;i++){
      const s = SKILLS[i];
      const st = states[s.ns];
      st.level  = (s.kind === "mastery") ? 0 : 1;
      st.remain = 0;
      st.cool   = 0;
      applyBuff(s, false);
      saveState(s);
    }

    if (typeof w.updateResourceUI === "function") w.updateResourceUI();
    if (w.logPrepend) w.logPrepend("🔁 已重置所有補助技能（主動 Lv.1／精通 Lv.0）");
    w.SkillsHub.requestRerender();
  }

  function renderTopPanel(container){
    const card = document.createElement("div");
    card.style.cssText = "background:#0b1220;border:1px solid #1f2937;border-radius:12px;padding:12px;margin-bottom:12px";

    const tickets = getTicketCount();
    const canReset = (w.player && w.player.gem || 0) >= RESET_GEM_COST;

    const agg = aggregateActiveBuffs();
    const lines = [];
    if (agg.atkFlat)      lines.push("攻擊 +" + agg.atkFlat);
    if (agg.defFlat)      lines.push("防禦 " + agg.defFlat);
    if (agg.dodgePercent) lines.push("迴避率 +" + pct(agg.dodgePercent));
    if (agg.ignoreDefPct) lines.push("穿透 +" + pct(agg.ignoreDefPct,1));
    if (agg.totalDamage)  lines.push("總傷害 +" + pct(agg.totalDamage,1));
    if (agg.expBonus)     lines.push("經驗 +" + pct(agg.expBonus));
    if (agg.dropBonus)    lines.push("掉寶 +" + pct(agg.dropBonus));
    if (agg.goldBonus)    lines.push("金幣 +" + pct(agg.goldBonus));
    const aggText = lines.length ? lines.join("，") : "（目前無生效中的技能加成）";

    card.innerHTML =
      "<div style='display:flex;flex-wrap:wrap;row-gap:10px;column-gap:12px;align-items:center;justify-content:space-between'>" +
        "<div style='font-weight:700'>🧾 被動能力券：<span style='color:#fde68a'>"+ tickets +"</span></div>" +
        "<div style='opacity:.9'>目前生效總能力：<span style='color:#93c5fd'>" + aggText + "</span></div>" +
        "<div>" +
          "<button id='btnResetSkills' style='background:"+ (canReset?"#f59e0b":"#374151") +";color:#0b1220;border:0;padding:8px 12px;border-radius:10px;cursor:"+ (canReset?"pointer":"not-allowed") +";font-weight:800'>重置全部技能（💎"+ RESET_GEM_COST +"）</button>" +
        "</div>" +
      "</div>";

    const btn = card.querySelector("#btnResetSkills");
    btn.disabled = !canReset;
    btn.onclick = function(){ if (canReset) resetAllSkills(); };

    container.appendChild(card);
  }

  // ===== 轉職階段 TAB =====
  let currentTierTab = 0; // 0 = 全部, 1~5 = 對應轉職階段

  function renderTierTabs(container){
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap";

    const tiers = [
      { label: "全部", value: 0 },
      { label: "1轉", value: 1 },
      { label: "2轉", value: 2 },
      { label: "3轉", value: 3 },
      { label: "4轉", value: 4 },
      { label: "5轉", value: 5 }
    ];

    tiers.forEach((t) =>{
      const btn = document.createElement("button");
      const active = (currentTierTab === t.value);
      btn.textContent = t.label;
      btn.style.cssText =
        "padding:4px 10px;border-radius:999px;border:1px solid " +
        (active ? "#38bdf8" : "#1f2937") +
        ";background:" + (active ? "#0ea5e9" : "#020617") +
        ";color:" + (active ? "#0b1120" : "#e5e7eb") +
        ";cursor:pointer;font-size:12px";
      btn.onclick = function(){
        currentTierTab = t.value;
        w.SkillsHub.requestRerender();
      };
      wrap.appendChild(btn);
    });

    container.appendChild(wrap);
  }

  // ===== 單張技能卡 UI =====
  function renderSkillCard(skill, container){
    const st = states[skill.ns];
    const lv = getLv(skill);
    const eff = (skill.kind === "active") ? computeEffectiveParams(skill, lv) : null; // ⭐ 新增：先算出精通後的最終參數

    const wrap = document.createElement("div");
    wrap.style.cssText =
      "background:#0b1220;border:1px solid #1f2937;border-radius:12px;padding:12px;margin-bottom:12px";

    const title = "<div style='font-size:16px;font-weight:700;margin-bottom:6px'>" +
      (skill.kind === "mastery" ? "📘 " : "✨ ") + skill.name +
      "</div>";

    // ⭐ 重寫描述：主動技能用 eff（已套用精通），精通技能仍用原本 describeNow
    let descText;
    if (skill.kind === "active") {
      const parts = [];
      const buffTxt = describeBuffShort(eff.buff || {});
      parts.push(buffTxt);
      parts.push("持續 " + (eff.duration || 0) + " 秒");
      parts.push("冷卻 " + (eff.cooldown || 0) + " 秒");
      if (eff.costMp) parts.push("消耗 MP " + eff.costMp);
      if (eff.costHpPct) parts.push("消耗 HP " + pct(eff.costHpPct));
      descText = parts.join("；");
    } else {
      descText = skill.describeNow(lv);
    }
    const desc  = "<div style='opacity:.9;margin-bottom:8px'>" + descText + "</div>";

    let statusHtml =
      "<div style='display:flex;gap:14px;flex-wrap:wrap;margin:8px 0'>" +
        "<div>等級：<b>Lv." + lv + "</b> / " + skill.lvCap +
        (skill.kind==="mastery" ? "（精通）" : "") + "</div>" +
        "<div>需要轉職階段：" + (skill.tier || 1) + "轉</div>";

    if (skill.kind === "active") {
      statusHtml +=
        "<div>狀態：" + (st.remain>0 ? "<span style='color:#22c55e'>生效中 " + fmt(st.remain) + "</span>"
                                      : "<span style='color:#9ca3af'>未生效</span>") + "</div>" +
        "<div>冷卻：" + (st.cool>0 ? "<span style='color:#f59e0b'>" + fmt(st.cool) + "</span>"
                                   : "<span style='color:#22c55e'>可使用</span>") + "</div>";
    } else {
      statusHtml += "<div>狀態：<span style='color:#a5b4fc'>被動精通</span></div>";
    }
    statusHtml += "</div>";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap";

    if (skill.kind === "active") {
      const btn = document.createElement("button");
      btn.textContent = canCast(skill) ? "發動技能" : (lv <= 0 ? "尚未習得" : "冷卻中");
      btn.disabled = !canCast(skill);
      btn.style.cssText =
        "background:"+(btn.disabled?"#374151":"#2563eb")+";color:#fff;border:0;padding:8px 12px;" +
        "border-radius:10px;cursor:"+(btn.disabled?"not-allowed":"pointer")+";font-weight:700";
      btn.onclick = function(){ cast(skill, /*isAuto=*/false); };
      row.appendChild(btn);

      const autoWrap = document.createElement("label");
      autoWrap.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none";
      const auto = document.createElement("input");
      auto.type = "checkbox";
      auto.checked = !!st.auto;
      auto.onchange = function(){ toggleAuto(skill, auto.checked); };
      const autoTxt = document.createElement("span");
      autoTxt.textContent = "自動施放（可用時自動觸發）";
      autoWrap.appendChild(auto); autoWrap.appendChild(autoTxt);
      row.appendChild(autoWrap);
    } else {
      const note = document.createElement("div");
      note.style.cssText = "font-size:12px;opacity:.8";
      note.textContent = "精通類技能：已實際影響對應主動技能的能力值 / 持續 / 冷卻。";
      row.appendChild(note);
    }

    const upRow = document.createElement("div");
    upRow.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px";

    const nextInfo = document.createElement("div");
    nextInfo.style.cssText = "opacity:.9;font-size:12px";
    nextInfo.innerHTML = skill.describeNext(lv);
    upRow.appendChild(nextInfo);

    const btnUp = document.createElement("button");
    btnUp.textContent = "升級";
    btnUp.disabled = (lv >= skill.lvCap);
    btnUp.style.cssText =
      "background:"+(btnUp.disabled?"#374151":"#16a34a")+";color:#fff;border:0;padding:6px 10px;" +
      "border-radius:10px;cursor:"+(btnUp.disabled?"not-allowed":"pointer")+";font-weight:600";
    btnUp.onclick = function(){ tryUpgrade(skill); };
    upRow.appendChild(btnUp);

    const preview = document.createElement("div");
    preview.style.cssText = "opacity:.85;font-size:12px;margin-top:8px";
    if (skill.kind === "active") {
      const SB = w.skillBonus || (w.player && w.player.skillBonus);
      const curBuff = SB && SB.bonusData ? SB.bonusData[skill.buffKey] : null;
      let label, buffText;
      if (curBuff) {
        label = "目前提供：";
        buffText = describeBuffShort(curBuff);
      } else if (eff) {
        label = "若施放會提供：";
        buffText = describeBuffShort(eff.buff || {});
      } else {
        label = "目前提供：";
        buffText = "無";
      }
      preview.textContent = label + buffText;
    } else {
      preview.textContent = "目前提供：已影響對應主動技能的數值（施放時套用）。";
    }

    wrap.innerHTML = title + desc + statusHtml;
    wrap.appendChild(row);
    wrap.appendChild(upRow);
    wrap.appendChild(preview);
    container.appendChild(wrap);
  }

  // ===== 整頁 render =====
  function render(container){
    w.skillBonus = w.skillBonus || (w.player && w.player.skillBonus);
    container.innerHTML = "";

    renderTopPanel(container);
    renderTierTabs(container);

    // 依轉職階段 & 類型排序
    const sorted = SKILLS.slice().sort((a,b) =>{
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.kind !== b.kind) return (a.kind === "active" ? -1 : 1);
      return 0;
    });

    // 先畫主動，再畫精通
    let activeTitleAdded = false;
    let masteryTitleAdded = false;
    for (let i=0;i<sorted.length;i++){
      const skill = sorted[i];

      // 轉職 Tab 過濾
      if (currentTierTab && skill.tier !== currentTierTab) continue;

      if (skill.kind === "active") {
        if (!activeTitleAdded) {
          const t1 = document.createElement("div");
          t1.style.cssText = "font-weight:800;margin:6px 0 4px;font-size:14px;color:#e5e7eb";
          t1.textContent = "📘 可施放技能";
          container.appendChild(t1);
          activeTitleAdded = true;
        }
      } else {
        if (!masteryTitleAdded) {
          const t2 = document.createElement("div");
          t2.style.cssText = "font-weight:800;margin:8px 0 4px;font-size:14px;color:#e5e7eb";
          t2.textContent = "💠 精通技能";
          container.appendChild(t2);
          masteryTitleAdded = true;
        }
      }

      renderSkillCard(skill, container);
    }
  }

  // ===== Tick =====
  function tick(steps){
    for (let i=0;i<SKILLS.length;i++){
      const skill = SKILLS[i];
      const st = states[skill.ns];

      if (skill.kind === "active") {
        if (st.cool > 0)   st.cool   = Math.max(0, st.cool - steps);
        if (st.remain > 0) {
          st.remain = Math.max(0, st.remain - steps);
          if (st.remain === 0) {
            applyBuff(skill, false);
            if (w.logPrepend) w.logPrepend("⏹️ " + skill.name + " 結束");
          }
        }
        if (st.auto && canCast(skill)) {
          cast(skill, /*isAuto=*/true);
        }
      }

      saveState(skill);
    }
  }

  // ===== 初始化 =====
  for (let i=0;i<SKILLS.length;i++){
    const s = SKILLS[i];
    states[s.ns] = loadState(s);
    if (s.kind === "active" && states[s.ns].remain > 0) {
      const lv  = getLv(s);
      const eff = computeEffectiveParams(s, lv);
      applyBuff(s, true, eff.buff);
    }
  }

  w.SkillsHub.registerTab({
    id: TAB_ID,
    title: TAB_TITLE,
    render,
    tick
  });

  // 自動施放初始化
  for (let j=0;j<SKILLS.length;j++){
    const s2 = SKILLS[j];
    if (s2.kind === "active" && states[s2.ns].auto && canCast(s2)) {
      cast(s2, /*isAuto=*/true);
    }
  }

  // ===== 小面板 API =====
  w.AssistSkillPanelAPI = {
    getSnapshot () {
      return SKILLS.map((skill) => {
        const st = states[skill.ns];
        const lv = getLv(skill);
        const eff = (skill.kind === "active") ? computeEffectiveParams(skill, lv) : { cooldown:0, duration:0 };
        return {
          id: skill.id,
          ns: skill.ns,
          name: skill.name,
          type: (skill.kind === "active" ? "support" : "mastery"),
          cooldown: eff.cooldown || 0,
          cdRemain: Math.max(0, Math.floor(st.cool || 0)),
          buffRemain: Math.max(0, Math.floor(st.remain || 0)),
          auto: !!st.auto,
          autoEnabled: (skill.kind === "active") && !!st.auto
        };
      });
    },
    castById (id) {
      const skill = SKILLS.find((s) => { return s.id === id; });
      if (!skill) return;
      cast(skill, /* isAuto = */ false);
    }
  };
})(window);