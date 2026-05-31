// boss_buffs_core.js  (秒制版；相容舊 turns 介面)
// - 內部全改用秒：Buff 用 remainSec、技能冷卻用 cdSec
// - 導出的 API：
//   Core.addBuff(mon, key, { value, mode, durationSec?, durationTurns?, stacking?, maxStacks? })
//   Core.applyFromSkill(mon, payload) // payload 可用 {atk/def: {mul, add, durationSec? or durationTurns?}, buffs:[...]} 
//   Core.setSkillCooldown(mon, skillKey, sec) / Core.getSkillCooldown(mon, skillKey) -> 回傳「剩餘秒(ceil)」
//   Core.tick(mon, dtSec=1)  // 每秒呼叫一次（或用 endTurn() 相容舊流程，每次當 1 秒）
//   其餘 getBuffTurns() 仍可用，回傳「剩餘秒數(ceil)」方便 UI 顯示

(function (global) {
  const MULT_KEYS = new Set(["atkMul", "defMul", "shieldMul", "speedMul", "critDmgMul"]);
  const ADD_KEYS  = new Set(["atkAdd", "defAdd", "critRate", "lifestealPct", "regenPct", "dmgReductionPct", "reflectPct", "accuracy", "evasion"]);
  const FLAG_KEYS = new Set(["stanceFortify"]);

  function ensureStores(mon) {
    mon.buffState = mon.buffState || {};
    mon.buffState.buffs = mon.buffState.buffs || {}; // { key: {mode, value, remainSec, stacks, stacking} }
    mon.skillCooldownsSec = mon.skillCooldownsSec || {}; // { key: sec }
  }

  // 將各種 buff 彙總成「最終倍率/加成/旗標」
  function aggregateBuffs(mon) {
    ensureStores(mon);
    const buffs = mon.buffState.buffs;
    const acc = {
      atkMul: 1, defMul: 1, shieldMul: 1,
      atkAdd: 0, defAdd: 0,
      critRate: 0, critDmgMul: 1,
      lifestealPct: 0, regenPct: 0,
      dmgReductionPct: 0, reflectPct: 0,
      speedMul: 1, accuracy: 0, evasion: 0,
      stanceFortify: false
    };

    for (const key in buffs) {
      const b = buffs[key];
      if (!b || (b.remainSec || 0) <= 0) continue;
      const v = Number(b.value || 0);
      if (MULT_KEYS.has(key)) {
        acc[key] *= (v || 1);
      } else if (ADD_KEYS.has(key)) {
        acc[key] += (v || 0);
      } else if (FLAG_KEYS.has(key)) {
        acc[key] = true;
      } else {
        if (b.mode === "mul") acc[key] = (acc[key] ?? 1) * (v || 1);
        else if (b.mode === "add") acc[key] = (acc[key] ?? 0) + (v || 0);
        else if (b.mode === "flag") acc[key] = true;
      }
    }
    return acc;
  }

  // 小工具：把 options 中的 duration 取成「秒」
  function getDurationSec(opt) {
    // 新介面：durationSec 優先；相容舊介面：duration/turns 都視為秒
    if (Number.isFinite(opt.durationSec)) return Math.max(0, Number(opt.durationSec));
    if (Number.isFinite(opt.duration))    return Math.max(0, Number(opt.duration));
    if (Number.isFinite(opt.durationTurns)) return Math.max(0, Number(opt.durationTurns));
    return 0;
  }

  const Core = {
    init(mon) {
      if (!mon) return;
      if (mon.baseAtk == null)    mon.baseAtk = mon.atk;
      if (mon.naturalDef == null) mon.naturalDef = mon.def;
      ensureStores(mon);

      // UI 兼容欄位
      mon._enragedTurns     = mon._enragedTurns || 0;
      mon._enrageMul        = mon._enrageMul || 1;
      mon._rootShieldTurns  = mon._rootShieldTurns || 0;
      mon._shieldMul        = mon._shieldMul || 1;
      mon._defBuffTurns     = mon._defBuffTurns || 0;
      mon._defMulForUi      = mon._defMulForUi || 1;

      Core._applyPanel(mon);
    },

    addBuff(mon, key, opt = {}) {
      if (!mon || !key) return;
      ensureStores(mon);

      const bmap = mon.buffState.buffs;
      const mode =
        opt.mode ||
        (MULT_KEYS.has(key) ? "mul"
         : ADD_KEYS.has(key) ? "add"
         : FLAG_KEYS.has(key) ? "flag" : "add");

      const value = (mode === "flag") ? true : Number(opt.value ?? 0);
      const durationSec = Math.max(0, Math.floor(getDurationSec(opt)));
      const stacking = opt.stacking || "refresh";
      const maxStacks = Math.max(1, Math.floor(opt.maxStacks || 99));

      const cur = bmap[key];
      if (!cur) {
        bmap[key] = { mode, value, remainSec: durationSec, stacks: 1, stacking };
      } else {
        if (stacking === "stack") {
          cur.stacks = Math.min(maxStacks, (cur.stacks || 1) + 1);
          if (mode === "mul") cur.value = Number(cur.value || 1) * Number(value || 1);
          else if (mode === "add") cur.value = Number(cur.value || 0) + Number(value || 0);
          else if (mode === "flag") cur.value = true;
          cur.remainSec = Math.max(cur.remainSec || 0, durationSec);
        } else {
          cur.mode = mode;
          cur.value = value;
          cur.remainSec = durationSec;
          cur.stacks = 1;
          cur.stacking = "refresh";
        }
      }
      Core._applyPanel(mon);
    },

    removeBuff(mon, key) {
      if (!mon || !key) return;
      ensureStores(mon);
      delete mon.buffState.buffs[key];
      Core._applyPanel(mon);
    },

    // 仍提供 getBuffTurns：回傳「剩餘秒數(ceil)」方便舊 UI 使用
    getBuffTurns(mon, key) {
      if (!mon) return 0;
      ensureStores(mon);
      const m = mon.buffState?.buffs;
      if (!m) return 0;
      if (key === "atk")    return Math.ceil(m.atkMul?.remainSec || 0);
      if (key === "def")    return Math.ceil(m.defMul?.remainSec || 0);
      if (key === "shield") return Math.ceil(m.shieldMul?.remainSec || 0);
      return Math.ceil(m[key]?.remainSec || 0);
    },

    getBuffValue(mon, key) {
      if (!mon) return 0;
      ensureStores(mon);
      return mon.buffState?.buffs?.[key]?.value ?? 0;
    },

    getStat(mon, key) {
      if (!mon) return 0;
      const acc = aggregateBuffs(mon);
      return acc[key] ?? 0;
    },

    // 讓每隻王的定義能繼續用原本 payload（durationTurns/ duration）
    applyFromSkill(mon, payload) {
      if (!mon || !payload) return { ok: false, reason: "no-data" };
      const durSecAtk = getDurationSec(payload.atk || {});
      const durSecDef = getDurationSec(payload.def || {});

      if (payload.atk) {
        const { mul, add } = payload.atk;
        if (mul && durSecAtk > 0 && this.getBuffTurns(mon, "atk") <= 0) {
          this.addBuff(mon, "atkMul", { mode: "mul", value: Number(mul), durationSec: durSecAtk });
        }
        if (add) this.addBuff(mon, "atkAdd", { mode: "add", value: Number(add), durationSec: durSecAtk || 0 });
      }
      if (payload.def) {
        const { mul, add } = payload.def;
        if (mul && durSecDef > 0 && this.getBuffTurns(mon, "def") <= 0) {
          this.addBuff(mon, "defMul", { mode: "mul", value: Number(mul), durationSec: durSecDef });
        }
        if (add) this.addBuff(mon, "defAdd", { mode: "add", value: Number(add), durationSec: durSecDef || 0 });
      }

      const list = Array.isArray(payload.buffs) ? payload.buffs : (payload.buffs ? [payload.buffs] : []);
      for (const b of list) {
        if (!b || !b.key) continue;
        this.addBuff(mon, b.key, b); // b 可帶 durationSec 或 durationTurns
      }

      this._applyPanel(mon);
      return { ok: true };
    },

    // === 技能冷卻改成秒 ===
    setSkillCooldown(mon, skillKey, sec) {
      if (!mon || !skillKey) return;
      ensureStores(mon);
      mon.skillCooldownsSec[skillKey] = Math.max(0, Math.floor(Number(sec) || 0));
    },
    // 仍保留 turns 名稱（相容舊程式），但實際回傳剩餘秒
    getSkillCooldown(mon, skillKey) {
      if (!mon) return 0;
      const s = mon.skillCooldownsSec ? mon.skillCooldownsSec[skillKey] || 0 : 0;
      return Math.ceil(s);
    },

    // === 每幀/每秒遞減 ===
    tick(mon, dtSec = 1) {
      if (!mon) return;
      ensureStores(mon);

      // Buff 倒數
      for (const key in mon.buffState.buffs) {
        const b = mon.buffState.buffs[key];
        if (!b) continue;
        if ((b.remainSec || 0) > 0) {
          b.remainSec -= dtSec;
        }
        if ((b.remainSec || 0) <= 0) {
          delete mon.buffState.buffs[key];
        }
      }

      // 技能冷卻
      for (const k in mon.skillCooldownsSec) {
        if (mon.skillCooldownsSec[k] > 0) {
          mon.skillCooldownsSec[k] -= dtSec;
          if (mon.skillCooldownsSec[k] < 0) mon.skillCooldownsSec[k] = 0;
        }
      }

      Core._applyPanel(mon);
    },

    // 舊流程相容：一回合視為 1 秒
    endTurn(mon) { this.tick(mon, 1); },

  _applyPanel(mon) {
  const acc = aggregateBuffs(mon);

  const atkBase = mon.baseAtk ?? mon.atk;
  const defBase = mon.naturalDef ?? mon.def;

  const atkMul = acc.atkMul || 1;
  const defMul = acc.defMul || 1;
  const shieldMul = acc.shieldMul || 1;
  const speedMul = acc.speedMul || 1; // 🔑 新增：讀取 Buff 彙總後的 speedMul

  mon.atk = Math.round(atkBase * atkMul + (acc.atkAdd || 0));
  mon.def = Math.round(defBase * defMul * shieldMul + (acc.defAdd || 0));

  // 🔑 新增：將 speedMul 寫入 Boss 物件
  mon.speedPct = speedMul;

  // 兼容原本 UI 欄位（但值都是「秒」）
  mon._enrageMul = atkMul;
  mon._enragedTurns = this.getBuffTurns(mon, "atk");
  mon._defMulForUi = defMul;
  mon._defBuffTurns = this.getBuffTurns(mon, "def");
  mon._shieldMul = shieldMul;
  mon._rootShieldTurns = this.getBuffTurns(mon, "shield");
}

  };

  global.BossCore = Core;
})(window);