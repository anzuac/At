// statusEffects.js
// 怪物「持續性異常」：純計算 / 秒數遞減 / 抗性判定（不寫日誌、不動 UI）

const STATUS_ZH = {
  burn: "燃燒",
  poison: "中毒",
  bleed: "流血",
  deadly_poison: "劇毒",
  weaken: "虛弱",
  chaos: "混亂",
  paralyze: "麻痺",
  frostbite: "凍傷",
};

const RESISTANCE_DURATION = 20; // 抗性持續秒數（秒）
// 給 UI 用的小圖示（不影響邏輯）
const ICON = {
  poison:"☠️", burn:"🔥", deadly_poison:"☠️",
  weaken:"🌀", chaos:"🤪", paralyze:"⚡",
  frostbite:"❄️", bleed:"🩸"
};

// —————————— 內部 handler（只計算，DoT 不扣血；weaken 需要改攻防） ——————————
const handlers = {
  burn: (monster, player, s) => {
    const dmg = Math.floor((player?.totalStats?.atk || 0) * (s.multiplier || 0));
    return dmg > 0 ? { type:"burn", damage:dmg, text:`${ICON.burn} ${monster.name} 因燃燒受到 ${dmg} 傷害` } : null;
  },
  poison: (monster, player, s) => {
    const dmg = Math.floor((player?.totalStats?.atk || 0) * (s.multiplier || 0));
    return dmg > 0 ? { type:"poison", damage:dmg, text:`${ICON.poison} ${monster.name} 因中毒受到 ${dmg} 傷害` } : null;
  },
  bleed: (monster, player, s) => {
    const dmg = Math.floor((player?.totalStats?.atk || 0) * (s.multiplier || 0));
    return dmg > 0 ? { type:"bleed", damage:dmg, text:`${ICON.bleed} ${monster.name} 因流血受到 ${dmg} 傷害` } : null;
  },
  deadly_poison: (monster, player, s) => {
    const maxHp = Number(monster?.maxHp || 0);
    const dmg = Math.floor(maxHp * (s.multiplier || 0));
    return dmg > 0 ? { type:"deadly_poison", damage:dmg, text:`${ICON.poison} ${monster.name} 因劇毒受到 ${dmg} 傷害` } : null;
  },
  frostbite: (monster, player, s) => {
    const dmg = Math.floor((player?.totalStats?.atk || 0) * (s.multiplier || 0));
    return dmg > 0 ? { type:"frostbite", damage:dmg, text:`${ICON.frostbite} ${monster.name} 因凍傷受到 ${dmg} 傷害` } : null;
  },
  weaken: (monster, player, s) => {
    // 第一次進場時套用 -40% 攻防；只在這裡改屬性
    if (!s.applied) {
      const rate = 0.40;
      monster.atk_base ??= monster.atk;
      monster.def_base ??= monster.def;
      monster.atk = Math.floor(monster.atk * (1 - rate));
      monster.def = Math.floor(monster.def * (1 - rate));
      s.applied = true;
      return { type:"weaken", damage:0, text:`${ICON.weaken} ${monster.name} 陷入虛弱，攻防下降` };
    }
    return null;
  },
  chaos:      () => null, // 在 rpg.js 行為內處理
  paralyze:   () => null, // 在 rpg.js 行為內處理
};

// —————————— 對外：每秒處理，回傳「事件陣列」，由 rpg.js 寫日誌與扣血 ——————————
function processMonsterStatusEffects(monster, player, nowSec) {
  if (!monster) return null;
  monster.statusEffects ??= {};
  const events = [];
  const expired = [];

  for (const k in monster.statusEffects) {
    const s = monster.statusEffects[k];
    if (!s || s.duration <= 0) continue;

    // 呼叫 handler（DoT 只算數字，不扣血；weaken 會改攻防）
    const ev = handlers[k]?.(monster, player, s);
    if (ev) events.push(ev);

    // 遞減 1 秒
    s.duration = Math.max(0, s.duration - 1);
    if (s.duration === 0) expired.push(k);
  }

  // 到期清理（weaken 還原攻防）
  for (const k of expired) {
    if (k === "weaken" && monster.statusEffects.weaken?.applied) {
      monster.atk = monster.atk_base ?? monster.atk;
      monster.def = monster.def_base ?? monster.def;
    }
    delete monster.statusEffects[k];
  }
  return { events, expired };
}

// —————————— 對外：施加狀態（含 20 秒抗性）。只建檔，不寫日誌 ——————————
function applyStatusToMonster(monster, type, duration, multiplier, nowSec) {
  if (!monster || !type || !Number.isFinite(duration)) return { applied:false };
  monster.statusEffects ??= {};
  monster.statusResistance ??= {};

  const last = Number(monster.statusResistance[type] ?? -Infinity);
  const remain = RESISTANCE_DURATION - (nowSec - last);
  if (remain > 0) return { applied:false, resisted:true, remain: Math.ceil(remain) };

  if (monster.statusEffects[type]) {
    // 已有同狀態 → 本次忽略
    return { applied:false, already:true };
  }

  monster.statusResistance[type] = nowSec;
  monster.statusEffects[type] = {
    duration: Math.max(1, Math.floor(duration)),
    multiplier: Math.max(0, Number(multiplier || 0)),
    applied: false
  };
  return { applied:true, type, duration: monster.statusEffects[type].duration, multiplier };
}

// —————————— UI 顯示用（不寫日誌） ——————————
function getMonsterAbnormalEffects(monster) {
  const se = monster?.statusEffects || {};
  const parts = [];
  for (const k in se) {
    const s = se[k];
    if (!s || s.duration <= 0) continue;
    const zh = STATUS_ZH[k] || k;
    parts.push(`${ICON[k] || "✨"} ${zh}（${s.duration}秒）`);
  }
  return parts.length ? parts.join("、") : "無";
}

function getMonsterAbnormalResistances(monster, nowSec) {
  if (!monster?.statusResistance) return "無";
  const parts = [];
  for (const k in monster.statusResistance) {
    const last = Number(monster.statusResistance[k] || 0);
    const remain = RESISTANCE_DURATION - (nowSec - last);
    if (remain > 0) {
      const zh = STATUS_ZH[k] || k;
      parts.push(`${ICON[k] || "🛡️"} ${zh}（${Math.ceil(remain)}秒）`);
    }
  }
  return parts.length ? parts.join("、") : "無";
}

window.processMonsterStatusEffects = processMonsterStatusEffects;
window.applyStatusToMonster = applyStatusToMonster;
window.getMonsterAbnormalEffects = getMonsterAbnormalEffects;
window.getMonsterAbnormalResistances = getMonsterAbnormalResistances;