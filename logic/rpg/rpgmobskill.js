// monsterSkills.js — 毫秒制技能冷卻（Phase 2）

function _getCdMs(monster, key) {
  monster._cdMs = monster._cdMs || {};
  return Math.max(0, Number(monster._cdMs[key] || 0));
}
function _setCdMs(monster, key, ms) {
  monster._cdMs = monster._cdMs || {};
  monster._cdMs[key] = Math.max(0, Math.floor(ms || 0));
}

// === 新增：毫秒遞減（用 deltaMs，無需回合概念） ===
function tickMonsterCooldowns(monster, nowMs) {
  if (!monster) return;
  monster._cdMs = monster._cdMs || {};
  const now = Number(nowMs ?? (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const last = Number(monster._lastCdUpdateMs || now);
  const delta = Math.max(0, Math.floor(now - last));
  monster._lastCdUpdateMs = now;
  if (delta === 0) return;

  for (const k in monster._cdMs) {
    if (!Object.prototype.hasOwnProperty.call(monster._cdMs, k)) continue;
    const cur = Number(monster._cdMs[k] || 0);
    if (cur > 0) {
      const next = cur - delta;
      monster._cdMs[k] = next > 0 ? next : 0;
    }
  }
}

// 冷卻完畢 + 機率通過
function chooseMonsterSkill(monster) {
  const list = Array.isArray(monster?.skills) ? monster.skills : [];

  // 先把 CD 用最新時間遞減（保底）
  tickMonsterCooldowns(monster);

  const ready = list.filter(s => _getCdMs(monster, s.key) <= 0);
  if (ready.length === 0) return null;

  const candidates = ready.filter(s => {
    const chance = Number.isFinite(s?.castChance) ? s.castChance : 100;
    return Math.random() * 100 < Math.max(0, Math.min(100, chance));
  });
  if (candidates.length === 0) return null;

  return candidates[Math.floor(Math.random() * candidates.length)];
}

function executeMonsterSkill(monster, skill) {
  let rawDamage = 0;
  const name = skill?.name || "技能";

  try {
    if (typeof skill?.use === "function") {
      const ret = skill.use(null, monster);
      if (typeof ret === "number") {
        const ig = window.IgnoreDef?.calcSkillDamageForMonster?.({ damage: ret, ...skill.logic }, monster);
        rawDamage = ig?.usedFormula ? ig.damage : Math.max(0, Math.floor(ret));
      }
    }
  } finally {
    // 設定技能冷卻（毫秒）
    const cdSec = Number(skill?.cooldown ?? skill?.cooldownSec ?? 0);
    if (cdSec > 0 && skill?.key) _setCdMs(monster, skill.key, cdSec * 1000);
    // 針對剛放完的技能，立刻寫入 lastTick，避免第一次 tick 過度扣減
    monster._lastCdUpdateMs = (typeof performance !== "undefined" ? performance.now() : Date.now());
  }
  return { name, rawDamage };
}

// Phase 2：不再使用回合收尾遞減（保留符號給舊呼叫者）
function reduceMonsterSkillCooldowns() { /* no-op */ }

window.chooseMonsterSkill = chooseMonsterSkill;
window.executeMonsterSkill = executeMonsterSkill;
window.reduceMonsterSkillCooldowns = reduceMonsterSkillCooldowns;
// 對外導出新的毫秒遞減器（給 rpg.js 的每秒 tick 也可順便扣）
window.tickMonsterCooldowns = tickMonsterCooldowns;