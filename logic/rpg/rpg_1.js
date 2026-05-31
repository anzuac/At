// Rpg_玩家.js —— 玩家一次出手（含技能 / 普攻 / 連擊 / 弓手先手再動）
// 重點：
// 1) 技能邏輯全部在這裡算完，UI 只拿結果顯示，不再動傷害。
// 2) 支援單體 / 群體技能：每隻怪獨立跑「爆擊 + 防禦 + 護盾」，彼此不干涉。
// 3) SkillDetailLog.onMultiSkill() 只拿 perTargetInfo 顯示，不做任何數學。
// 4) 成就 / 吸血用「實際入傷總和」，log 可顯示「應受傷害」（含溢傷）。
// 5) ⭐ 如果技能內有呼叫 logPrepend() 寫自己的戰鬥文字，這裡就不再印預設總結行。

(function (global) {

  function _tryOnAttack(ctx) {
    try {
      if (global.PotentialEffects && typeof global.PotentialEffects.onAttack === "function") {
        global.PotentialEffects.onAttack(global.player, ctx || {});
      }
    } catch (e) {}
  }


  // ===== 小工具 =====
  function _evadePct(entity) {
    if (typeof getEvasionPercent === "function") return getEvasionPercent(entity);
    let eva = Number(entity && entity.dodgePercent) || 0;
    if (eva < 0) eva = 0;
    if (eva > 100) eva = 100;
    return eva;
  }

  function _ordinalCn(n){
    const map = ["零","一","二","三","四","五","六","七","八","九","十"];
    if (n >= 1 && n <= 10) return "第" + map[n] + "次";
    return "第" + n + "次";
  }

  // 末端傷害浮動
  function _applyDamageVariance(dmg) {
    let pct = Number(global.DAMAGE_JITTER_PCT);
    if (!(pct >= 0 && pct <= 1)) pct = 0.10;
    if (!(dmg > 0)) return 0;
    const minMul = 1 - pct, maxMul = 1 + pct;
    const mul = minMul + Math.random() * (maxMul - minMul);
    return Math.max(0, Math.floor(dmg * mul));
  }

  // 回報實際入傷
  function _recordDamage(dmg) {
    if (dmg > 0 && global.Achievements && typeof global.Achievements.onDamageDealt === "function") {
      global.Achievements.onDamageDealt(dmg);
    }
  }

  // 平面防禦（不吃 ignoreDefPct）
  function _effectiveDefense(rawDef) {
    const def = Math.max(0, Number(rawDef) || 0);
    return Math.floor(def);
  }

  // 總傷害乘區
  function _totalDamageMul() {
    const td = (global.player && player.totalStats && player.totalStats.totalDamage) || 0;
    return 1 + td;
  }

  // 怪物分類
  function _monsterType(target) {
    if (!target) return "normal";
    if (target.isBoss)  return "boss";
    if (target.isElite) return "elite";
    return "normal";
  }

  // 一般 / 精英 / Boss 額外傷害
  function _vsTypeMul(target) {
    const t  = _monsterType(target);
    const ts = (global.player && player.totalStats) || {};
    let mul = 1;

    if (t === "boss") {
      mul += Number(ts.bossDamage) || 0;
    } else if (t === "elite") {
      mul += Number(ts.eliteDamage) || 0;
    } else {
      mul += Number(ts.normalDamage) || 0;
    }
    return mul;
  }

  // 之後要加易傷 / 屬性 / 模式倍率可以改這三個
  function _vulnerabilityMul(target, ctx) { return 1; }
  function _elementMul(attacker, target, ctx) { return 1; }
  function _modeMul(ctx) { return 1; }

  // 最終乘區：總傷 + 對象類型 + 其他預留
  function _finalStageMul(target, ctx) {
    let mul = 1;
    mul *= _totalDamageMul();
    mul *= _vsTypeMul(target);
    mul *= _vulnerabilityMul(target, ctx);
    mul *= _elementMul(player, target, ctx);
    mul *= _modeMul(ctx);
    return mul;
  }

  function _applyLifesteal(actualDamage) {
    // TODO: 以實際入傷為基準回血
  }

  // 防禦百分比（defPercent）+ 無視防禦（ignoreDefPct）
  function _applyDefensePercent(dmg, target) {
    dmg = Math.max(0, Number(dmg) || 0);
    if (!(dmg > 0)) return 0;

    let pen = 0;
    if (global.player && player.totalStats && typeof player.totalStats.ignoreDefPct === "number") {
      pen = Number(player.totalStats.ignoreDefPct) || 0;
    }
    if (pen < 0) pen = 0;
    if (pen > 1) pen = 1;

    const defMul = Number(target && target.defPercent);
    if (!Number.isFinite(defMul) || defMul <= 0) {
      return dmg;
    }

    let remainingDef = defMul * (1 - pen);
    if (remainingDef < 0) remainingDef = 0;

    let mul = 1 - remainingDef;
    if (mul <= 0) return 0;
    if (mul > 1) mul = 1;

    return Math.max(0, Math.floor(dmg * mul));
  }

  // ===== 弓箭手：先手再動 =====
  function _isArcher(actor){
    const j = String(actor && actor.job || "").toLowerCase();
    if (typeof global.getBaseJob === "function") {
      return global.getBaseJob(j) === "archer";
    }
    return j.replace(/\d+$/,'') === "archer";
  }

  function _isMage(actor){
    const j = String(actor && actor.job || "").toLowerCase();
    if (typeof global.getBaseJob === "function") {
      return global.getBaseJob(j) === "mage";
    }
    // jobs.js 使用 mage / mage_* 作為法師系職業 key
    return j === "mage" || j.indexOf("mage_") === 0;
  }

  function _getPreemptiveParams(actor){
    const t = (actor && actor.totalStats) || {};
    return {
      enabled: _isArcher(actor),
      chance: Math.max(0, Math.min(1, Number(t.preemptiveChance) || 0)),
      perAttackMax: Math.max(0, (t.perAttackMax | 0) || (t.preemptivePerAttackMax | 0) || 0)
    };
  }

  function _rollPreemptiveHit(target, idx){
    const atk = (player.totalStats && player.totalStats.atk) || 1;
    let dmg = atk;

    const isC = Math.random() < ((player.totalStats && player.totalStats.critRate) || 0);
    if (isC) {
      dmg = Math.floor(dmg * (1 + ((player.totalStats && player.totalStats.critMultiplier) || 0)));
    }

    dmg = Math.floor(dmg * _finalStageMul(target, { type: 'preemptive' }));
    dmg = _applyDamageVariance(dmg);

    dmg = _applyDefensePercent(dmg, target);
    if (!(dmg > 0)) {
      return { dealt: 0, text: "（" + _ordinalCn(idx) + "先手：被防禦完全抵銷）" };
    }
    const defEff = _effectiveDefense(target && target.def);
    dmg = Math.max(Math.floor(dmg - defEff), 1);

    const tag = "（" + _ordinalCn(idx) + "先手：";
    const critTxt = isC ? "爆擊！" : "";

    if ((target.shield || 0) > 0 && dmg > 0) {
      const absorbed = Math.min(dmg, target.shield);
      target.shield -= absorbed;
      dmg -= absorbed;
      if (dmg <= 0) {
        return { dealt: 0, text: tag + "被護盾抵銷）" };
      }
      return {
        dealt: dmg,
        text: tag + "造成 " + dmg + " 傷害" + (critTxt ? "（" + critTxt + "）" : "") + "，部分被護盾吸收）"
      };
    }

    return {
      dealt: dmg,
      text: tag + "造成 " + dmg + " 傷害" + (critTxt ? "（" + critTxt + "）" : "") + "）"
    };
  }

  function _runArcherPreemptiveBurst(target, textCollector){
    const p = _getPreemptiveParams(player);
    if (!p.enabled || p.chance <= 0 || p.perAttackMax <= 0) return;

    let shots = 0;
    while (shots < p.perAttackMax) {
      if (!target || target.isDead) break;
      if (Math.random() >= p.chance) break;
      shots++;

      const r = _rollPreemptiveHit(target, shots);
      if (r.dealt > 0) {
        global.monsterHP -= r.dealt;
        _recordDamage(r.dealt);
        _applyLifesteal(r.dealt);
      }
      if (typeof textCollector.push === "function") textCollector.push(r.text);
    }

    if (shots > 0 && Array.isArray(textCollector)) {
      textCollector.unshift("【先手再動 x" + shots + "】");
    }
  }

  // ===== 主流程：玩家行動一次 (完整邏輯版本) =====
  function actOnce() {
    if (!global.player || !global.currentMonster) return { did: false };

    const se = player.statusEffects || {};

    // 💡 每次行動前，先把「技能自訂戰鬥文字」旗子清掉
    global._skillCustomLoggedThisTurn = false;

    // 控場不能行動
    if (se.freeze > 0 || se.paralyze > 0 || se.stun > 0 || se.fear > 0) {
      const msg = "你因狀態異常無法行動";
      if (global.CombatLog && typeof global.CombatLog.log === "function") {
        global.CombatLog.log(msg);
      }
      return { did: false, text: msg };
    }

    const silenced = se.silence > 0;
    const m = global.currentMonster;
    const hpBefore = global.monsterHP;
    let text = "";

    // === 技能優先 ===
    let sr = { used: false };
    if (!silenced && typeof global.autoUseSkills === "function") {
      sr = global.autoUseSkills(m) || { used: false };
    }

    const hpAfter   = global.monsterHP;
    const innerDelta = Math.max(0, hpBefore - hpAfter);
    const retDamage  = Math.max(0, Number(sr.damage || 0));
    const didSkill   = !!sr.used || innerDelta > 0 || retDamage > 0;

    if (didSkill) {
      const shownName = sr.name || "技能";

      // 閃避
      if (Math.random() < _evadePct(m)) {
        global.monsterHP = hpBefore;
        text = shownName + "被 " + m.name + " 閃避了";
        if (global.CombatLog && typeof global.CombatLog.log === "function") {
          global.CombatLog.log(text);
        }
        return { did: true, text };
      }

      const ig = (global.IgnoreDef && typeof global.IgnoreDef.calcSkillDamageForPlayer === "function"
        ? global.IgnoreDef.calcSkillDamageForPlayer(sr, m)
        : { usedFormula: false, includesDefense: false });

      let trueHitListRaw = null;
      if (ig && ig.usedFormula && Array.isArray(ig.hitDamages) && ig.hitDamages.length) {
        trueHitListRaw = ig.hitDamages;
      } else if (Array.isArray(sr.hitDamages) && sr.hitDamages.length) {
        trueHitListRaw = sr.hitDamages;
      }

      const isTrueMultiHit = !!(trueHitListRaw && trueHitListRaw.length > 0);

      // ==========================================
      // ✅ 真多段分支：補完 UI 記錄功能
      // ==========================================
      if (isTrueMultiHit) {
        const shownNameMH = shownName;
        const hasIgnoreDefInSkillMH = sr.logic && (sr.logic.ignoreDef || 0) > 0;
        const shouldSkipDefenseMH = (ig && ig.usedFormula && ig.includesDefense === true) || hasIgnoreDefInSkillMH;
        let maxTargetsMH = Number(sr.maxTargets || 1);
        if (!Number.isFinite(maxTargetsMH) || maxTargetsMH < 1) maxTargetsMH = 1;

        let totalAppliedDamageMH = 0;
        let totalShownDamageMH   = 0;
        const perTargetInfoMH      = [];

        function _applyHitSeqToTarget(target, isMainTarget) {
          if (!target || target.hp <= 0) return;
          let hpCurr = isMainTarget ? Math.max(0, Number(global.monsterHP || 0)) : Math.max(0, Number(target.hp || 0));
          const hpStart = hpCurr;
          let shownSum = 0;
          let critAny = false;
          const hitDetails = []; // ⭐ 新增：記錄每段詳細數據

          for (let hi = 0; hi < trueHitListRaw.length; hi++) {
            if (hpCurr <= 0) break;
            const hitRaw = Math.max(0, Number(trueHitListRaw[hi] || 0));
            const afterMul = Math.floor(hitRaw * _finalStageMul(target, { type: 'skill' }));
            let dmgT = _applyDamageVariance(afterMul);

            const critRate = (player.totalStats && player.totalStats.critRate) || 0;
            const critMul  = (player.totalStats && player.totalStats.critMultiplier) || 0;
            let isThisHitCrit = false;
            if (Math.random() < critRate) {
              critAny = true; isThisHitCrit = true;
              dmgT = Math.floor(dmgT * (1 + critMul));
            }

            if (!shouldSkipDefenseMH) {
              dmgT = _applyDefensePercent(dmgT, target);
              const defEff = _effectiveDefense(target && target.def);
              dmgT = Math.max(Math.floor(dmgT - defEff), 1);
            }

            const damageBeforeShield = Math.max(0, Math.floor(dmgT));
            shownSum += damageBeforeShield;

            let absorbed = 0;
            if ((target.shield || 0) > 0 && damageBeforeShield > 0) {
              absorbed = Math.min(damageBeforeShield, target.shield);
              target.shield -= absorbed;
            }
            const dmgAfterShield = Math.max(0, damageBeforeShield - absorbed);

            if (dmgAfterShield > 0) {
              hpCurr = Math.max(0, hpCurr - dmgAfterShield);
              if (isMainTarget) global.monsterHP = hpCurr;
              target.hp = hpCurr;
            }

            // ⭐ 存入每段數據
            hitDetails.push({ dmg: damageBeforeShield, crit: isThisHitCrit, shield: absorbed, kill: hpCurr <= 0 });
          }

          totalShownDamageMH += shownSum;
          totalAppliedDamageMH += (hpStart - hpCurr);
          perTargetInfoMH.push({ name: target.name || "目標", hits: hitDetails, damage: shownSum, isCrit: critAny, isKill: hpCurr <= 0 });
        }

        // 多目標處理
        const alive = (Array.isArray(global.monsters) ? global.monsters.filter(x => x && x.hp > 0) : [m]);
        if (alive.length > maxTargetsMH) alive.length = maxTargetsMH;
        alive.forEach(t => _applyHitSeqToTarget(t, t === m));

        // ⭐ 推送到新的 UI 面板
        if (global.MultiHitDetailPanel) {
          global.MultiHitDetailPanel.push({ skillName: shownNameMH, targets: perTargetInfoMH });
        }

        // 舊有的 SkillDetailLog 保持相容
        if (global.SkillDetailLog && typeof global.SkillDetailLog.onMultiSkill === "function") {
          global.SkillDetailLog.onMultiSkill({ skillName: shownNameMH, baseDamage: 0, maxTargets: maxTargetsMH, targets: perTargetInfoMH });
        }

        if (totalAppliedDamageMH > 0) {
          _recordDamage(totalAppliedDamageMH);
          _applyLifesteal(totalAppliedDamageMH);
        }
        if (totalShownDamageMH > 0) {
          _tryOnAttack({ type: 'skill', name: shownNameMH, applied: totalAppliedDamageMH, shown: totalShownDamageMH });
        }

        // 異常狀態
        if (sr.abnormalEffect && typeof global.applyStatusToMonster === "function") {
          const effectMH = sr.abnormalEffect;
          const nowSecMH = Math.floor((typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000);
          global.applyStatusToMonster(m, effectMH.type, effectMH.duration, effectMH.multiplier, nowSecMH);
        }

        const finalTextMH = shownNameMH + (sr.tag ? "（" + sr.tag + "）" : "") + " 造成 " + totalShownDamageMH + " 傷害" + (ig.suffix || "");
        if (!global._skillCustomLoggedThisTurn && global.CombatLog?.log) {
          global.CombatLog.log(finalTextMH);
        }
        return { did: true, text: finalTextMH };
      }

      // ==========================================
      // ✅ 這裡接你原本的單體技能、成就、吸血、普攻邏輯 (完全不省略)
      // ==========================================
      const baseRaw = (ig && ig.usedFormula) ? Number(ig.damage || 0) : Math.max(0, Number(sr.damage || 0), innerDelta);
      const baseAfterMul = Math.floor(baseRaw * _finalStageMul(m, { type: 'skill' }));
      const baseDmg = _applyDamageVariance(baseAfterMul);

      const maxTargets = Math.max(1, Number(sr.maxTargets || 1));
      const canMulti = maxTargets > 1 && Array.isArray(global.monsters) && global.monsters.length > 1;
      let totalAppliedDamage = 0; let totalShownDamage = 0; const perTargetInfo = [];

      if (canMulti) {
        const aliveOld = global.monsters.filter(x => x && x.hp > 0);
        if (aliveOld.length > maxTargets) aliveOld.length = maxTargets;
        aliveOld.forEach(t => {
          let dmgT = baseDmg;
          const isCritEach = Math.random() < ((player.totalStats && player.totalStats.critRate) || 0);
          if (isCritEach) dmgT = Math.floor(dmgT * (1 + (player.totalStats.critMultiplier || 0)));
          if (!((ig && ig.includesDefense) || (sr.logic && sr.logic.ignoreDef > 0))) {
            dmgT = _applyDefensePercent(dmgT, t);
            dmgT = Math.max(Math.floor(dmgT - _effectiveDefense(t.def)), 1);
          }
          const hpB = (t === m ? global.monsterHP : t.hp);
          let abs = 0; if (t.shield > 0) { abs = Math.min(dmgT, t.shield); t.shield -= abs; }
          const hpA = Math.max(0, hpB - (dmgT - abs));
          if (t === m) global.monsterHP = hpA; t.hp = hpA;
          totalAppliedDamage += (hpB - hpA); totalShownDamage += dmgT;
          perTargetInfo.push({ name: t.name, hpBefore: hpB, hpAfter: hpA, damage: dmgT, isCrit: isCritEach, isKill: hpA <= 0 });
        });
      } else {
        // 單體
        let dmgS = baseDmg;
        const isCritS = Math.random() < ((player.totalStats && player.totalStats.critRate) || 0);
        if (isCritS) dmgS = Math.floor(dmgS * (1 + (player.totalStats.critMultiplier || 0)));
        if (!((ig && ig.includesDefense) || (sr.logic && sr.logic.ignoreDef > 0))) {
          dmgS = _applyDefensePercent(dmgS, m);
          dmgS = Math.max(Math.floor(dmgS - _effectiveDefense(m.def)), 1);
        }
        const b1 = global.monsterHP;
        let absS = 0; if (m.shield > 0) { absS = Math.min(dmgS, m.shield); m.shield -= absS; }
        const a1 = Math.max(0, b1 - (dmgS - absS));
        global.monsterHP = a1; m.hp = a1;
        totalAppliedDamage = b1 - a1; totalShownDamage = dmgS;
        perTargetInfo.push({ name: m.name, hpBefore: b1, hpAfter: a1, damage: dmgS, isCrit: isCritS, isKill: a1 <= 0 });
      }

      if (totalAppliedDamage > 0) { _recordDamage(totalAppliedDamage); _applyLifesteal(totalAppliedDamage); }
      if (totalShownDamage > 0) {
        _tryOnAttack({ type: 'attack', name: shownName, applied: totalAppliedDamage, shown: totalShownDamage });
      }
      if (sr.abnormalEffect) global.applyStatusToMonster(m, sr.abnormalEffect.type, sr.abnormalEffect.duration, sr.abnormalEffect.multiplier, Math.floor(Date.now()/1000));

      const finalText = shownName + (sr.tag ? "（" + sr.tag + "）" : "") + " 造成 " + totalShownDamage + " 傷害" + (ig.suffix || "");
      if (!global._skillCustomLoggedThisTurn && global.CombatLog?.log) global.CombatLog.log(finalText);
      return { did: true, text: finalText };
    }

    // ===== 普攻、連擊、弓手先手 (原封不動保留) =====
    // ... 這裡請接回你原本 actOnce 結尾處的普攻 _roll、連擊、弓手先手邏輯 ...

    // ===== 普攻（單體 + 連擊 + 弓手先手）=====

    if (Math.random() < _evadePct(m)) {
      const evasive = "普通攻擊被 " + m.name + " 閃避了";
      if (global.CombatLog && typeof global.CombatLog.log === "function") {
        global.CombatLog.log(evasive);
      }
      return { did: true, text: evasive };
    }

    function _roll(baseCritOut) {
      const atk = (player.totalStats && player.totalStats.atk) || 1;
      let dmg = atk;

      const isC = Math.random() < ((player.totalStats && player.totalStats.critRate) || 0);
      baseCritOut.isCrit = isC;
      if (isC) {
        dmg = Math.floor(dmg * (1 + ((player.totalStats && player.totalStats.critMultiplier) || 0)));
      }

      dmg = Math.floor(dmg * _finalStageMul(m, { type: 'attack' }));
      dmg = _applyDamageVariance(dmg);

      // 法師系：普通攻擊傷害 -75%（僅普攻流程，技能不影響）
      if (_isMage(player)) dmg = Math.floor(dmg * 0.25);

      dmg = _applyDefensePercent(dmg, m);
      if (!(dmg > 0)) return 0;
      const defEff = _effectiveDefense(m && m.def);
      dmg = Math.max(Math.floor(dmg - defEff), 1);

      return Math.floor(dmg);
    }

    // 第一擊
    const critRef1 = { isCrit: false };
    const dmg1 = _roll(critRef1);
    const critText1 = critRef1.isCrit ? "（爆擊！）" : "";
    let actualDmg1 = dmg1;

    if ((m.shield || 0) > 0 && dmg1 > 0) {
      const absorbed1 = Math.min(dmg1, m.shield);
      m.shield -= absorbed1;
      actualDmg1 = dmg1 - absorbed1;
      text = (actualDmg1 <= 0)
        ? "普通攻擊被護盾完全抵銷"
        : "普通攻擊造成 " + dmg1 + " 傷害" + critText1 + "（部分被護盾吸收）";
    } else {
      text = "普通攻擊造成 " + dmg1 + " 傷害" + critText1;
    }

    if (actualDmg1 > 0) {
      global.monsterHP -= actualDmg1;
      _recordDamage(actualDmg1);
      _applyLifesteal(actualDmg1);
    }

    // 連擊
    const comboChance = Number((player.totalStats && player.totalStats.doubleHitChance) || 0);
    if (actualDmg1 > 0 && comboChance > 0 && Math.random() < comboChance) {
      const critRef2 = { isCrit: false };
      const dmg2 = (function(){
        const atk = (player.totalStats && player.totalStats.atk) || 1;
        let d = atk;
        const isC2 = Math.random() < ((player.totalStats && player.totalStats.critRate) || 0);
        critRef2.isCrit = isC2;
        if (isC2) {
          d = Math.floor(d * (1 + ((player.totalStats && player.totalStats.critMultiplier) || 0)));
        }
        d = Math.floor(d * _finalStageMul(m, { type: 'attack-combo' }));
        d = _applyDamageVariance(d);

        // 法師系：普通攻擊傷害 -75%（僅普攻流程，技能不影響）
        if (_isMage(player)) d = Math.floor(d * 0.25);

        d = _applyDefensePercent(d, m);
        if (!(d > 0)) return 0;
        const defEff2 = _effectiveDefense(m && m.def);
        d = Math.max(Math.floor(d - defEff2), 1);
        return Math.floor(d);
      })();

      const critText2 = critRef2.isCrit ? "（爆擊！）" : "";
      let actualDmg2 = dmg2;

      if ((m.shield || 0) > 0 && dmg2 > 0) {
        const absorbed2 = Math.min(dmg2, m.shield);
        m.shield -= absorbed2;
        actualDmg2 = dmg2 - absorbed2;
        text += (actualDmg2 <= 0)
          ? "（觸發連擊，但被護盾抵銷）"
          : "（觸發連擊，再造成 " + dmg2 + " 傷害" + critText2 + "，部分被護盾吸收）";
      } else {
        text += "（觸發連擊，再造成 " + dmg2 + " 傷害" + critText2 + "）";
      }
      if (actualDmg2 > 0) {
        global.monsterHP -= actualDmg2;
        _recordDamage(actualDmg2);
        _applyLifesteal(actualDmg2);
      }
    }

    // 弓手先手再動
    const _burstTexts = [];
    _runArcherPreemptiveBurst(m, _burstTexts);
    if (_burstTexts.length) {
      text += " " + _burstTexts.join(" ");
    }

    if (global.CombatLog && typeof global.CombatLog.log === "function") {
      global.CombatLog.log(text);
    }
    return { did: true, text };
  }

  global.Rpg_玩家 = { actOnce };

})(window);