// Rpg_怪物.js —— 怪物一次出手（不含死亡/倒數/掉落）

(function (global) {

  function _tryOnDamaged(dmg, source, meta) {
    try {
      if (global.PotentialEffects && typeof global.PotentialEffects.onDamaged === "function") {
        global.PotentialEffects.onDamaged(global.player, { dmg, source, meta: meta || null });
      }
    } catch (e) {}
  }

  function _evadePct(entity) {
    if (typeof getEvasionPercent === "function") return getEvasionPercent(entity);
    let eva = Number(entity && entity.dodgePercent) || 0;
    if (eva < 0) eva = 0; if (eva > 100) eva = 100;
    return eva;
  }

  function _applyMitigation(finalDamage) {
    let absorb = 0, reduced = 0, msAbsorbByMP = 0;

    if ((player.shield || 0) > 0 && finalDamage > 0) {
      absorb = Math.min(player.shield, finalDamage);
      player.shield -= absorb; finalDamage -= absorb;
    }
    if (finalDamage > 0) {
      const msPct = (typeof getMagicShieldPercent === "function") ? getMagicShieldPercent() : 0;
      if (msPct > 0) {
        const want = Math.floor(finalDamage * msPct);
        msAbsorbByMP = Math.min(want, player.currentMP || 0);
        player.currentMP -= msAbsorbByMP; finalDamage -= msAbsorbByMP;
      }
    }
    const totalDR = (player.totalStats && player.totalStats.damageReduce) ? player.totalStats.damageReduce : 0;
    if (finalDamage > 0 && totalDR > 0) {
      const dr = Math.max(0, Math.min(1, totalDR));
      reduced = Math.floor(finalDamage * dr);
      finalDamage -= reduced;
    }
    finalDamage = Math.max(0, Math.round(finalDamage));

    const parts = [];
    if (absorb > 0) parts.push("護盾吸收 " + absorb);
    if (msAbsorbByMP > 0) parts.push("MP 吸收 " + msAbsorbByMP);
    if (reduced > 0) parts.push("減傷 " + reduced);
    const suffix = parts.length ? "（" + parts.join("，") + "，HP：" + player.currentHP + "）" : "（HP：" + player.currentHP + "）";

    return { final: finalDamage, suffix };
  }

  function actOnce() {
    const m = global.currentMonster;
    if (!m || !global.player) return { did: false };

    // 行動禁止 / 混亂
    if ((m.statusEffects && m.statusEffects.paralyze && m.statusEffects.paralyze.duration > 0) ||
        (m.statusEffects && m.statusEffects.frostbite && m.statusEffects.frostbite.duration > 0)) {
      return { did: true, text: m.name + " 因狀態異常無法行動" };
    }
    if (m.statusEffects && m.statusEffects.chaos && m.statusEffects.chaos.duration > 0 && Math.random() < 0.5) {
      const selfD = Math.max(1, Math.floor(Math.floor((m.atk || 1)) * 0.5));
      global.monsterHP = Math.max(0, global.monsterHP - selfD);
      return { did: true, text: m.name + " 陷入混亂，攻擊自己造成 " + selfD + " 傷害！" };
    }

    // 閃避
    if (Math.random() < _evadePct(player)) {
      return { did: true, text: "你成功閃避（HP：" + player.currentHP + "）" };
    }

    // 控制器選技或普攻
    if (typeof m.controller === 'function') m.controller(m, global.monsterHP);
    const skill = m.nextSkill || (typeof global.chooseMonsterSkill === "function" ? global.chooseMonsterSkill(m) : null);

    if (skill) {
      const r = (typeof global.executeMonsterSkill === "function") ? global.executeMonsterSkill(m, skill) : { name: "技能", rawDamage: 0 };
      const finalDamage = Math.floor(r.rawDamage);
      const mit = _applyMitigation(finalDamage);

      // 扣血（不判定死亡與倒數；交給 rpg.js 中控）
      player.currentHP = Math.max(0, player.currentHP - mit.final);
      _tryOnDamaged(mit.final, m, { kind: 'skill', name: r && r.name });
      if (typeof global.applyStatusFromMonster === "function") global.applyStatusFromMonster(m);

      return { did: true, text: "怪物施放【" + r.name + "】造成 " + mit.final + " 傷害 " + mit.suffix };
    }

    // 普攻
    const effAtk = Math.max((m.atk || 1) - (player.totalStats && player.totalStats.def || 0), 1);
    const mit2 = _applyMitigation(effAtk);
    player.currentHP = Math.max(0, player.currentHP - mit2.final);
    _tryOnDamaged(mit2.final, m, { kind: 'attack' });
    if (typeof global.applyStatusFromMonster === "function") global.applyStatusFromMonster(m);

    return { did: true, text: "怪物造成 " + mit2.final + " 傷害 " + mit2.suffix };
  }

  global.Rpg_怪物 = { actOnce };

})(window);