// potential_effects_es5.js —— 潛能「效果型」處理（被攻擊/攻擊/擊殺等事件）
// 規則：觸發機率採用「加法」；效果量採用「取最高」；不設上限（由你在各條目機率自行平衡）
(function (global) {
  function _now() { return Date.now ? Date.now() : (+new Date()); }

  function _getBD(player) {
    return (player && player.PotentialBonus && player.PotentialBonus.bonusData) ? player.PotentialBonus.bonusData : null;
  }

  // 從 PotentialBonus.bonusData 匯總出「效果型」數值
  // - chance 類：加總
  // - amount 類：取最大
  function _collectEffectStats(player) {
    var bd = _getBD(player);
    if (!bd) return null;

    var out = {
      // onDamaged
      onHitHealChance: 0,
      onHitHealHpPctMax: 0,
      onHitHealMpPctMax: 0,

      // onAttack
      onAttackHealChance: 0,
      onAttackHealHpPctMax: 0,
      onAttackHealMpPctMax: 0
    };

    function _normChance(v) {
      v = (isFinite(v) ? Number(v) : 0) || 0;
      // 相容：如果資料用 10 表示 10%，自動轉成 0.10
      if (v > 1) v = v / 100;
      // 最終保護：不讓機率大於 1
      if (v > 1) v = 1;
      if (v < 0) v = 0;
      return v;
    }
    function addChance(v) { return _normChance(v); }
    function maxAmt(cur, v) {
      v = (isFinite(v) ? Number(v) : 0) || 0;
      // 相容：如果資料用 1 表示 1%，自動轉成 0.01；用 5 表示 5% 亦同
      if (v > 1) v = v / 100;
      return v > cur ? v : cur;
    }

    for (var k in bd) {
      if (!Object.prototype.hasOwnProperty.call(bd, k)) continue;
      var obj = bd[k];
      if (!obj || typeof obj !== "object") continue;

      // 被擊回血
      if (obj.onHitHealChance != null) out.onHitHealChance += addChance(obj.onHitHealChance);
      if (obj.onHitHealHpPct != null) out.onHitHealHpPctMax = maxAmt(out.onHitHealHpPctMax, obj.onHitHealHpPct);
      if (obj.onHitHealMpPct != null) out.onHitHealMpPctMax = maxAmt(out.onHitHealMpPctMax, obj.onHitHealMpPct);

      // 攻擊回血/回魔
      if (obj.onAttackHealChance != null) out.onAttackHealChance += addChance(obj.onAttackHealChance);
      if (obj.onAttackHealHpPct != null) out.onAttackHealHpPctMax = maxAmt(out.onAttackHealHpPctMax, obj.onAttackHealHpPct);
      if (obj.onAttackHealMpPct != null) out.onAttackHealMpPctMax = maxAmt(out.onAttackHealMpPctMax, obj.onAttackHealMpPct);
    }

    // 0 -> null（省計算）
    if (out.onHitHealChance <= 0) out.onHitHealChance = 0;
    if (out.onAttackHealChance <= 0) out.onAttackHealChance = 0;

    return out;
  }

  
  function _readNum(x) { x = (isFinite(x) ? Number(x) : 0) || 0; return x; }

  function _maxHP(player, ctx) {
    if (!player) return 0;

    // 1) common places
    var ts = player.totalStats || player.TotalStats || null;
    var v = 0;

    // try a bunch of keys
    if (ts) {
      v = _readNum(ts.maxHP || ts.maxHp || ts.hpMax || ts.HPMax || ts.hp || ts.HP);
      if (v > 0) return v;
    }

    var bs = player.baseStats || player.BaseStats || null;
    if (bs) {
      v = _readNum(bs.maxHP || bs.maxHp || bs.hpMax || bs.hp || bs.HP);
      if (v > 0) return v;
    }

    v = _readNum(player.maxHP || player.maxHp || player.hpMax || player.HPMax || player.hp || player.HP);
    if (v > 0) return v;

    // 2) cached max
    if (player._potMaxHP && _readNum(player._potMaxHP) > 0) return _readNum(player._potMaxHP);

    // 3) estimate from damage context: previous HP = currentHP + dmg
    var cur = _readNum(player.currentHP);
    var dmg = _readNum(ctx && ctx.dmg);
    v = cur + dmg;
    if (v > 0) {
      player._potMaxHP = v;
      return v;
    }

    return cur;
  }

  function _maxMP(player, ctx) {
    if (!player) return 0;

    var ts = player.totalStats || player.TotalStats || null;
    var v = 0;
    if (ts) {
      v = _readNum(ts.maxMP || ts.maxMp || ts.mpMax || ts.MPMax || ts.mp || ts.MP);
      if (v > 0) return v;
    }

    var bs = player.baseStats || player.BaseStats || null;
    if (bs) {
      v = _readNum(bs.maxMP || bs.maxMp || bs.mpMax || bs.mp || bs.MP);
      if (v > 0) return v;
    }

    v = _readNum(player.maxMP || player.maxMp || player.mpMax || player.MPMax || player.mp || player.MP);
    if (v > 0) return v;

    if (player._potMaxMP && _readNum(player._potMaxMP) > 0) return _readNum(player._potMaxMP);

    var cur = _readNum(player.currentMP);
    var dmg = _readNum(ctx && ctx.mpDmg); // if you ever pass MP damage
    v = cur + dmg;
    if (v > 0) {
      player._potMaxMP = v;
      return v;
    }
    return cur;
  }


  function _healHP(player, hpPct, ctx) {
    hpPct = (isFinite(hpPct) ? Number(hpPct) : 0) || 0;
    if (hpPct <= 0) return;
    var maxHP = _maxHP(player, ctx);
    if (maxHP <= 0) return;
    var add = Math.floor(maxHP * hpPct);
    if (add <= 0) return;
    var cur = (isFinite(player.currentHP) ? Number(player.currentHP) : 0) || 0;
    player.currentHP = Math.min(maxHP, cur + add);
  }

  function _healMP(player, mpPct, ctx) {
    mpPct = (isFinite(mpPct) ? Number(mpPct) : 0) || 0;
    if (mpPct <= 0) return;
    var maxMP = _maxMP(player, ctx);
    if (maxMP <= 0) return;
    var add = Math.floor(maxMP * mpPct);
    if (add <= 0) return;
    var cur = (isFinite(player.currentMP) ? Number(player.currentMP) : 0) || 0;
    player.currentMP = Math.min(maxMP, cur + add);
  }

  // ====== 對外 API ======

  // 被攻擊後：被擊回血/回魔（機率加法；效果取最高）
  function onDamaged(player, ctx) {
    var es = _collectEffectStats(player);
    if (!es) return;

    var chance = es.onHitHealChance;
    if (chance > 0 && Math.random() < chance) {
      // 一次觸發：HP/MP 各取最高
      if (es.onHitHealHpPctMax > 0) _healHP(player, es.onHitHealHpPctMax, ctx);
      if (es.onHitHealMpPctMax > 0) _healMP(player, es.onHitHealMpPctMax, ctx);
    }
  }

  // 攻擊後：攻擊回血/回魔（機率加法；效果取最高）
  function onAttack(player, ctx) {
    var es = _collectEffectStats(player);
    if (!es) return;

    var chance = es.onAttackHealChance;
    if (chance > 0 && Math.random() < chance) {
      if (es.onAttackHealHpPctMax > 0) _healHP(player, es.onAttackHealHpPctMax, ctx);
      if (es.onAttackHealMpPctMax > 0) _healMP(player, es.onAttackHealMpPctMax, ctx);
    }
  }

  global.PotentialEffects = {
    onDamaged: onDamaged,
    onAttack: onAttack
  };
})(window);