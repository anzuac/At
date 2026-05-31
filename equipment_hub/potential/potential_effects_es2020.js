// potential_effects_es2020.js —— 潛能「效果型」處理（ES2020+；被攻擊/攻擊/擊殺等事件）
// 規則：觸發機率採用「加法」；效果量採用「取最高」；不設上限（由你在各條目機率自行平衡）
((globalRef) => {
  'use strict';

  const readNum = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0) || 0;

  const getBonusData = (player) => player?.PotentialBonus?.bonusData ?? null;

  const normChance = (value) => {
    let chance = readNum(value);
    // 相容：如果資料用 10 表示 10%，自動轉成 0.10
    if (chance > 1) chance /= 100;
    return Math.min(1, Math.max(0, chance));
  };

  const maxAmount = (current, value) => {
    let amount = readNum(value);
    // 相容：如果資料用 1 表示 1%，自動轉成 0.01；用 5 表示 5% 亦同
    if (amount > 1) amount /= 100;
    return Math.max(current, amount);
  };

  // 從 PotentialBonus.bonusData 匯總出「效果型」數值
  // - chance 類：加總
  // - amount 類：取最大
  const collectEffectStats = (player) => {
    const bonusData = getBonusData(player);
    if (!bonusData) return null;

    const out = {
      // onDamaged
      onHitHealChance: 0,
      onHitHealHpPctMax: 0,
      onHitHealMpPctMax: 0,

      // onAttack
      onAttackHealChance: 0,
      onAttackHealHpPctMax: 0,
      onAttackHealMpPctMax: 0,
    };

    Object.values(bonusData).forEach((obj) => {
      if (!obj || typeof obj !== 'object') return;

      // 被擊回血
      if (obj.onHitHealChance != null) out.onHitHealChance += normChance(obj.onHitHealChance);
      if (obj.onHitHealHpPct != null) out.onHitHealHpPctMax = maxAmount(out.onHitHealHpPctMax, obj.onHitHealHpPct);
      if (obj.onHitHealMpPct != null) out.onHitHealMpPctMax = maxAmount(out.onHitHealMpPctMax, obj.onHitHealMpPct);

      // 攻擊回血/回魔
      if (obj.onAttackHealChance != null) out.onAttackHealChance += normChance(obj.onAttackHealChance);
      if (obj.onAttackHealHpPct != null) out.onAttackHealHpPctMax = maxAmount(out.onAttackHealHpPctMax, obj.onAttackHealHpPct);
      if (obj.onAttackHealMpPct != null) out.onAttackHealMpPctMax = maxAmount(out.onAttackHealMpPctMax, obj.onAttackHealMpPct);
    });

    out.onHitHealChance = Math.max(0, out.onHitHealChance);
    out.onAttackHealChance = Math.max(0, out.onAttackHealChance);
    return out;
  };

  const pickFirstPositive = (...values) => values.map(readNum).find((value) => value > 0) ?? 0;

  const maxHP = (player, ctx) => {
    if (!player) return 0;

    const totalStats = player.totalStats ?? player.TotalStats ?? null;
    const baseStats = player.baseStats ?? player.BaseStats ?? null;
    const fromStats = pickFirstPositive(
      totalStats?.maxHP, totalStats?.maxHp, totalStats?.hpMax, totalStats?.HPMax, totalStats?.hp, totalStats?.HP,
      baseStats?.maxHP, baseStats?.maxHp, baseStats?.hpMax, baseStats?.hp, baseStats?.HP,
      player.maxHP, player.maxHp, player.hpMax, player.HPMax, player.hp, player.HP,
      player._potMaxHP,
    );
    if (fromStats > 0) return fromStats;

    // estimate from damage context: previous HP = currentHP + dmg
    const estimated = readNum(player.currentHP) + readNum(ctx?.dmg);
    if (estimated > 0) {
      player._potMaxHP = estimated;
      return estimated;
    }

    return readNum(player.currentHP);
  };

  const maxMP = (player, ctx) => {
    if (!player) return 0;

    const totalStats = player.totalStats ?? player.TotalStats ?? null;
    const baseStats = player.baseStats ?? player.BaseStats ?? null;
    const fromStats = pickFirstPositive(
      totalStats?.maxMP, totalStats?.maxMp, totalStats?.mpMax, totalStats?.MPMax, totalStats?.mp, totalStats?.MP,
      baseStats?.maxMP, baseStats?.maxMp, baseStats?.mpMax, baseStats?.mp, baseStats?.MP,
      player.maxMP, player.maxMp, player.mpMax, player.MPMax, player.mp, player.MP,
      player._potMaxMP,
    );
    if (fromStats > 0) return fromStats;

    const estimated = readNum(player.currentMP) + readNum(ctx?.mpDmg);
    if (estimated > 0) {
      player._potMaxMP = estimated;
      return estimated;
    }

    return readNum(player.currentMP);
  };

  const healHP = (player, hpPct, ctx) => {
    const pct = readNum(hpPct);
    if (pct <= 0) return;

    const max = maxHP(player, ctx);
    const add = Math.floor(max * pct);
    if (max <= 0 || add <= 0) return;

    player.currentHP = Math.min(max, readNum(player.currentHP) + add);
  };

  const healMP = (player, mpPct, ctx) => {
    const pct = readNum(mpPct);
    if (pct <= 0) return;

    const max = maxMP(player, ctx);
    const add = Math.floor(max * pct);
    if (max <= 0 || add <= 0) return;

    player.currentMP = Math.min(max, readNum(player.currentMP) + add);
  };

  // 被攻擊後：被擊回血/回魔（機率加法；效果取最高）
  const onDamaged = (player, ctx) => {
    const stats = collectEffectStats(player);
    if (!stats || stats.onHitHealChance <= 0 || Math.random() >= stats.onHitHealChance) return;

    // 一次觸發：HP/MP 各取最高
    if (stats.onHitHealHpPctMax > 0) healHP(player, stats.onHitHealHpPctMax, ctx);
    if (stats.onHitHealMpPctMax > 0) healMP(player, stats.onHitHealMpPctMax, ctx);
  };

  // 攻擊後：攻擊回血/回魔（機率加法；效果取最高）
  const onAttack = (player, ctx) => {
    const stats = collectEffectStats(player);
    if (!stats || stats.onAttackHealChance <= 0 || Math.random() >= stats.onAttackHealChance) return;

    if (stats.onAttackHealHpPctMax > 0) healHP(player, stats.onAttackHealHpPctMax, ctx);
    if (stats.onAttackHealMpPctMax > 0) healMP(player, stats.onAttackHealMpPctMax, ctx);
  };

  globalRef.PotentialEffects = { onDamaged, onAttack };
})(window);
