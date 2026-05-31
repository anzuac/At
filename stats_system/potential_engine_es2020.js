// potential_engine_es2020.js
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

((globalRef) => {
  'use strict';

  const pctToFlatKeys = new Set([
    'strPct', 'agiPct', 'intPct', 'lukPct', 'allStatPct',
    'hpPct', 'mpPct', 'atkPct', 'defPct',
  ]);

  const toNum = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  // Customize this if your project stores "core-final" values elsewhere.
  // Priority: player.core -> player.coreFinal -> player.coreBonus -> player
  const getCore = (player) => player?.core ?? player?.coreFinal ?? player?.coreBonus ?? player ?? {};

  const ensureSources = (player) => {
    player._potentialSources ??= {};
    return player._potentialSources;
  };

  // Public API: register a source payload (flat/%/other additive stats).
  const registerPotentialBonus = (player, sourceKey, obj) => {
    if (!player || !sourceKey) return;

    const bucket = ensureSources(player);
    if (!bucket[sourceKey] || typeof bucket[sourceKey] !== 'object') bucket[sourceKey] = {};
    if (!obj || typeof obj !== 'object') return;

    const dst = bucket[sourceKey];
    Object.entries(obj).forEach(([key, value]) => {
      // Store as number when possible; keep non-numeric as-is (ignored later)
      const numericValue = Number(value);
      dst[key] = Number.isFinite(numericValue) ? numericValue : value;
    });
  };

  // Internal: sum numeric keys across all sources.
  const sumAllSources = (bucket) => Object.values(bucket).reduce((total, src) => {
    if (!src || typeof src !== 'object') return total;

    Object.entries(src).forEach(([key, value]) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      total[key] = (total[key] ?? 0) + value;
    });

    return total;
  }, {});

  const floor = Math.floor;

  // Public API: compute final bonuses and write to PotentialBonus.bonusData.potentialEngine
  const applyPotentialEngine = (player) => {
    if (!player?.PotentialBonus?.bonusData) return undefined;

    const total = sumAllSources(ensureSources(player));
    const core = getCore(player);

    // Base values from CORE-final
    const base = {
      str: toNum(core.str),
      agi: toNum(core.agi),
      int: toNum(core.int),
      luk: toNum(core.luk),
      hp: toNum(core.hp),
      mp: toNum(core.mp),
      atk: toNum(core.atk),
      def: toNum(core.def),
    };

    // Start output with all additive (non pct->flat) numeric totals.
    // Then overwrite/accumulate the flat stats we control.
    const out = Object.fromEntries(
      Object.entries(total).filter(([key]) => !pctToFlatKeys.has(key)),
    );

    const allStatPct = toNum(total.allStatPct);
    out.str = toNum(total.str) + floor(base.str * (toNum(total.strPct) + allStatPct) / 100);
    out.agi = toNum(total.agi) + floor(base.agi * (toNum(total.agiPct) + allStatPct) / 100);
    out.int = toNum(total.int) + floor(base.int * (toNum(total.intPct) + allStatPct) / 100);
    out.luk = toNum(total.luk) + floor(base.luk * (toNum(total.lukPct) + allStatPct) / 100);

    out.hp = toNum(total.hp) + floor(base.hp * toNum(total.hpPct) / 100);
    out.mp = toNum(total.mp) + floor(base.mp * toNum(total.mpPct) / 100);
    out.atk = toNum(total.atk) + floor(base.atk * toNum(total.atkPct) / 100);
    out.def = toNum(total.def) + floor(base.def * toNum(total.defPct) / 100);

    // Write back (single source key to avoid collisions)
    player.PotentialBonus.bonusData.potentialEngine = out;

    // Return debug info if caller wants it
    return { total, core: base, out };
  };

  // Backward/forward compatible aliases (some modules may call different names)
  globalRef.registerPotentialBonus = registerPotentialBonus;
  globalRef.registerPotentialEngine = registerPotentialBonus;
  globalRef.applyPotentialEngine = applyPotentialEngine;
})(globalThis);
