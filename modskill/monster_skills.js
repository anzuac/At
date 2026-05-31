// monster_skills.js — 毫秒制技能冷卻（Phase 2）+ 先在這裡扣玩家防禦（Boss 專用）

// ===== 內部工具 =====
function _getCdMs(monster, key) {
  monster._cdMs = monster._cdMs || {};
  return Math.max(0, Number(monster._cdMs[key] || 0));
}
function _setCdMs(monster, key, ms) {
  monster._cdMs = monster._cdMs || {};
  monster._cdMs[key] = Math.max(0, Math.floor(ms || 0));
}

// 0~1 或 0~100 轉 0~1
function _pct01(x) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n <= 1 ? n : (n / 100);
}

// （保險）隨機整數
function _randInt(min, max) {
  min = Math.ceil(Number(min)); max = Math.floor(Number(max));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  if (max < min) [min, max] = [max, min];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ===== 毫秒遞減（不靠回合）=====
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
    const chance = Number.isFinite(s?.castChance) ? Number(s.castChance) : 100;
    const pct = Math.max(0, Math.min(100, chance)); // 統一為百分比
    return Math.random() * 100 < pct;
  });
  if (candidates.length === 0) return null;

  return candidates[Math.floor(Math.random() * candidates.length)];
}

// 執行技能：回傳 { name, rawDamage }
// 這裡會：1) 讓技能用到 m.atk（吃到 BossCore/buff 後的面板值）
//       2) 先扣玩家防禦（支援 ignoreDefPct 0~1 或 0~100）
//       3) 不在這裡扣護盾/減傷；交給 rpg 的 _applyMitigation()
function executeMonsterSkill(monster, skill) {
  let rawDamage = 0;
  const name = skill?.name || "技能";

  try {
    if (typeof skill?.use === "function") {
      // 把真正的 player 丟進去，技能內部若要查玩家資訊可用
      const p = (typeof player !== "undefined") ? player : null;

      // 技能自行計算原始輸出（建議用 m.atk，而非 m.baseAtk）
      const ret = skill.use(p, monster);

      // 允許配合外部 IgnoreDef 公式；否則當純數字處理
      if (typeof ret === "number") {
        const ig = window.IgnoreDef?.calcSkillDamageForMonster?.(
          { damage: ret, ...(skill.logic || {}) },
          monster
        );
        rawDamage = ig?.usedFormula ? ig.damage : Math.max(0, Math.floor(ret));
      }
    }

    // ★ 在這裡先扣「玩家防禦」（ignoreDefPct 支援 0~1 或 0~100）
    const pDefRaw = Math.max(0, Math.floor((player && player.totalStats && player.totalStats.def) || 0));
    const ignoreDefPct = _pct01(skill?.logic?.ignoreDefPct || 0);
    const effDef = Math.max(0, Math.floor(pDefRaw * (1 - ignoreDefPct)));
    const afterDef = Math.max(1, rawDamage - effDef);

    // 不處理護盾/減傷/魔盾；保留給 rpg 的 _applyMitigation(finalDamage)
    rawDamage = afterDef;

  } finally {
    // 設定技能冷卻（毫秒）
    const cdSec = Number(skill?.cooldown ?? skill?.cooldownSec ?? 0);
    if (cdSec > 0 && skill?.key) {
      _setCdMs(monster, skill.key, cdSec * 1000);

      // 同步給 BossCore（若你的控制器/面板會讀 BossCore 的秒制冷卻）
      if (typeof BossCore?.setSkillCooldown === "function") {
        BossCore.setSkillCooldown(monster, skill.key, cdSec);
      }
    }

    // 針對剛放完的技能，立刻寫入 lastTick，避免第一次 tick 過度扣減
    monster._lastCdUpdateMs = (typeof performance !== "undefined" ? performance.now() : Date.now());
  }

  return { name, rawDamage };
}

// Phase 2：不再使用回合收尾遞減（保留符號給舊呼叫者）
function reduceMonsterSkillCooldowns() { /* no-op */ }

// 導出（給其它模組）
window.chooseMonsterSkill = chooseMonsterSkill;
window.executeMonsterSkill = executeMonsterSkill;
window.reduceMonsterSkillCooldowns = reduceMonsterSkillCooldowns;
window.tickMonsterCooldowns = tickMonsterCooldowns;