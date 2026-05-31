// ignore_defense.js
// 外掛：技能用無視防禦、小改動即可勾進 rpg.js。
// 用法：autoUseSkills / executeMonsterSkill 回傳物件可加：
//   mul: 倍率(數字)   flat: 平加(數字)   ignoreDefPct: 無視防(0~1 小數，如 0.18 = 18%)

(function () {
  if (window.IgnoreDef) return;

  function clamp01(x){ x = Number(x)||0; return Math.max(0, Math.min(1, x)); }

  function calcPlayerHitDamage(target, opt = {}) {
    const mul = Number(opt.mul || 1);
    const flat = Number(opt.flat || 0);
    const ig   = clamp01(opt.ignoreDefPct || 0);

    const atk = Math.max(1, (window.player?.totalStats?.atk || 1));
    const defEff = Math.max(0, Math.floor((target?.def || 0) * (1 - ig)));
    const base = Math.max(atk - defEff, 1);
    return Math.max(1, Math.floor(base * mul + flat));
  }

  function calcMonsterHitDamage(attacker, opt = {}) {
    const mul = Number(opt.mul || 1);
    const flat = Number(opt.flat || 0);
    const ig   = clamp01(opt.ignoreDefPct || 0);

    const atk = Math.max(1, (attacker?.atk || 1));
    const plyDef = Math.max(0, Math.floor((window.player?.totalStats?.def || 0) * (1 - ig)));
    const base = Math.max(atk - plyDef, 1);
    return Math.max(1, Math.floor(base * mul + flat));
  }

  // 供 rpg.js 呼叫：玩家技能
  function calcSkillDamageForPlayer(sr, target) {
    const wants = (typeof sr?.mul === "number") || (typeof sr?.flat === "number") || (typeof sr?.ignoreDefPct === "number");
    if (!wants) return { usedFormula:false };

    const perHit = calcPlayerHitDamage(target, {
      mul: Number(sr.mul || 1),
      flat: Number(sr.flat || 0),
      ignoreDefPct: Number(sr.ignoreDefPct || 0)
    });

    // ✅ 真多段支援：若 sr 有 hitDamages / hits，回傳每段的「基礎傷害」
    // 注意：此公式已把防禦影響算進去了，因此 includesDefense = true
    const hits = Math.max(1, Math.floor(
      (Array.isArray(sr?.hitDamages) && sr.hitDamages.length)
        ? sr.hitDamages.length
        : Number(sr?.hits || 1)
    ));

    const hitDamages = Array.from({ length: hits }, () => perHit);
    const damage = hitDamages.reduce((a, b) => a + b, 0);

    const suffix = sr.ignoreDefPct ? `（無視防禦 ${(sr.ignoreDefPct * 100).toFixed(0)}%）` : "";
    return { usedFormula:true, includesDefense:true, hitDamages, damage, suffix };
  }

  // 供 rpg.js 呼叫：怪物技能
  function calcSkillDamageForMonster(r, attacker) {
    const wants = (typeof r?.mul === "number") || (typeof r?.flat === "number") || (typeof r?.ignoreDefPct === "number");
    if (!wants) return { usedFormula:false };

    const perHit = calcMonsterHitDamage(attacker, {
      mul: Number(r.mul || 1),
      flat: Number(r.flat || 0),
      ignoreDefPct: Number(r.ignoreDefPct || 0)
    });

    const hits = Math.max(1, Math.floor(
      (Array.isArray(r?.hitDamages) && r.hitDamages.length)
        ? r.hitDamages.length
        : Number(r?.hits || 1)
    ));

    const hitDamages = Array.from({ length: hits }, () => perHit);
    const damage = hitDamages.reduce((a, b) => a + b, 0);

    const suffix = r.ignoreDefPct ? `（無視防禦 ${(r.ignoreDefPct * 100).toFixed(0)}%）` : "";
    return { usedFormula:true, includesDefense:true, hitDamages, damage, suffix };
  }

  window.IgnoreDef = {
    calcSkillDamageForPlayer,
    calcSkillDamageForMonster
  };
})();