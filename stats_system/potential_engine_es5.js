// potential_engine_es5.js
// Purpose:
// 1) Collect potential lines from multiple sources (flat + percent + other additive stats)
// 2) Convert % lines that should become flat bonuses (STR/AGI/INT/LUK/HP/MP/ATK/DEF) using CORE-final values
// 3) Write the resulting bonuses into player.PotentialBonus.bonusData.potentialEngine
//
// Notes:
// - Does NOT modify PotentialBonus aggregator.
// - Exposes two globals:
//   registerPotentialBonus(player, sourceKey, obj)
//   applyPotentialEngine(player)
//
// Conventions:
// - Percent fields use integer percent: 10 means 10%.
// - Percent-to-flat fields supported:
//   strPct, agiPct, intPct, lukPct, allStatPct, hpPct, mpPct, atkPct, defPct
// - Flat fields supported:
//   str, agi, int, luk, hp, mp, atk, def
// - Any other numeric keys are treated as additive (kept as-is) and written back to PotentialBonus.

(function (global) {
  "use strict";

  function toNum(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  // Customize this if your project stores "core-final" values elsewhere.
  // Priority: player.core -> player.coreFinal -> player.coreBonus -> player
  function getCore(player) {
    return (player && (player.core || player.coreFinal || player.coreBonus || player)) || {};
  }

  function ensureSources(player) {
    if (!player._potentialSources) player._potentialSources = {};
    return player._potentialSources;
  }

  // Public API: register a source payload (flat/%/other additive stats).
  function registerPotentialBonus(player, sourceKey, obj) {
    if (!player || !sourceKey) return;
    var bucket = ensureSources(player);
    if (!bucket[sourceKey] || typeof bucket[sourceKey] !== "object") bucket[sourceKey] = {};

    var dst = bucket[sourceKey];
    if (!obj || typeof obj !== "object") return;

    for (var k in obj) {
      if (!obj.hasOwnProperty(k)) continue;
      // Store as number when possible; keep non-numeric as-is (ignored later)
      var v = obj[k];
      var n = Number(v);
      dst[k] = isFinite(n) ? n : v;
    }
  }

  // Internal: sum numeric keys across all sources.
  function sumAllSources(bucket) {
    var total = {};
    for (var srcKey in bucket) {
      if (!bucket.hasOwnProperty(srcKey)) continue;
      var src = bucket[srcKey];
      if (!src || typeof src !== "object") continue;
      for (var k in src) {
        if (!src.hasOwnProperty(k)) continue;
        var v = src[k];
        if (typeof v !== "number" || !isFinite(v)) continue;
        if (total[k] === undefined) total[k] = 0;
        total[k] += v;
      }
    }
    return total;
  }

  function floor(n) { return Math.floor(n); }

  // Public API: compute final bonuses and write to PotentialBonus.bonusData.potentialEngine
  function applyPotentialEngine(player) {
    if (!player || !player.PotentialBonus || !player.PotentialBonus.bonusData) return;

    var bucket = ensureSources(player);
    var total = sumAllSources(bucket);
    var core = getCore(player);

    // Base values from CORE-final
    var baseStr = toNum(core.str);
    var baseAgi = toNum(core.agi);
    var baseInt = toNum(core.int);
    var baseLuk = toNum(core.luk);
    var baseHp  = toNum(core.hp);
    var baseMp  = toNum(core.mp);
    var baseAtk = toNum(core.atk);
    var baseDef = toNum(core.def);

    // Percent-to-flat totals
    var strPct = toNum(total.strPct);
    var agiPct = toNum(total.agiPct);
    var intPct = toNum(total.intPct);
    var lukPct = toNum(total.lukPct);
    var allStatPct = toNum(total.allStatPct);
    var hpPct  = toNum(total.hpPct);
    var mpPct  = toNum(total.mpPct);
    var atkPct = toNum(total.atkPct);
    var defPct = toNum(total.defPct);

    // Start output with all additive (non pct->flat) numeric totals.
    // Then overwrite/accumulate the flat stats we control.
    var out = {};
    for (var k in total) {
      if (!total.hasOwnProperty(k)) continue;
      // Exclude pct->flat keys from being written directly
      if (k === "strPct" || k === "agiPct" || k === "intPct" || k === "lukPct" || k === "allStatPct" ||
          k === "hpPct" || k === "mpPct" || k === "atkPct" || k === "defPct") {
        continue;
      }
      out[k] = total[k];
    }

    // Flat stats (direct flat lines) may exist in total; include them and then add pct->flat conversion.
    var flatStr = toNum(total.str);
    var flatAgi = toNum(total.agi);
    var flatInt = toNum(total.int);
    var flatLuk = toNum(total.luk);
    var flatHp  = toNum(total.hp);
    var flatMp  = toNum(total.mp);
    var flatAtk = toNum(total.atk);
    var flatDef = toNum(total.def);

    out.str = flatStr + floor(baseStr * (strPct + allStatPct) / 100);
    out.agi = flatAgi + floor(baseAgi * (agiPct + allStatPct) / 100);
    out.int = flatInt + floor(baseInt * (intPct + allStatPct) / 100);
    out.luk = flatLuk + floor(baseLuk * (lukPct + allStatPct) / 100);

    out.hp  = flatHp  + floor(baseHp  * hpPct  / 100);
    out.mp  = flatMp  + floor(baseMp  * mpPct  / 100);
    out.atk = flatAtk + floor(baseAtk * atkPct / 100);
    out.def = flatDef + floor(baseDef * defPct / 100);

    // Write back (single source key to avoid collisions)
    player.PotentialBonus.bonusData.potentialEngine = out;

    // Return debug info if caller wants it
    return {
      total: total,
      core: {
        str: baseStr, agi: baseAgi, int: baseInt, luk: baseLuk,
        hp: baseHp, mp: baseMp, atk: baseAtk, def: baseDef
      },
      out: out
    };
  }

  // Backward/forward compatible aliases (some modules may call different names)
  global.registerPotentialBonus = registerPotentialBonus;
  global.registerPotentialEngine = registerPotentialBonus;

  global.applyPotentialEngine = applyPotentialEngine;

})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));



