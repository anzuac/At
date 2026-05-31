/***** 掉落開關 *****/
let isDropsVisible = true;

function setDropsVisible(show) {
  isDropsVisible = !!show;
  const btn = document.getElementById('btnToggleDrops');
  if (btn) {
    btn.setAttribute('aria-pressed', String(isDropsVisible));
    btn.textContent = isDropsVisible ? '隱藏掉落' : '顯示掉落';
  }
  if (window.currentMonster) updateMonsterInfo(window.currentMonster, window.monsterHP);
}
function toggleDropsDisplay() { setDropsVisible(!isDropsVisible); }

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnToggleDrops');
  if (btn) {
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = '隱藏掉落';
    btn.addEventListener('click', toggleDropsDisplay);
  }
});

/***** Boss / 一般怪 狀態 & 冷卻 工具 *****/
(function () {
  const hasCore = () => typeof window.BossCore === "object" && window.BossCore;

  // UI 用：幫「一般怪」扣技能冷卻與 Buff 持續秒數
  function _tickForUi(mon) {
    if (!mon) return;
    // Boss 不在這裡扣，由戰鬥流程自己用 BossCore.endTurn/tick 處理
    if (mon.isBoss) return;

    // 一般怪技能冷卻（monster_skills.js）
    if (typeof tickMonsterCooldowns === "function") {
      try { tickMonsterCooldowns(mon); } catch (_) {}
    }

    // 一般怪 Buff 持續時間（BossCore 的 remainSec）
    if (hasCore() && typeof BossCore.tick === "function") {
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const last = Number(mon._lastUiBuffTickMs || now);
      const dtSec = Math.max(0, (now - last) / 1000);
      mon._lastUiBuffTickMs = now;
      if (dtSec > 0) {
        try { BossCore.tick(mon, dtSec); } catch (_) {}
      }
    }
  }

  function getBuffTurns(mon, kind) {
    if (!mon) return 0;
    if (hasCore() && typeof BossCore.getBuffTurns === "function") {
      return Number(BossCore.getBuffTurns(mon, kind) || 0);
    }
    const map = mon?.buffState?.buffs || {};
    const keyByKind = { atk: "atkMul", def: "defMul", shield: "shieldMul", speedMul: "speedMul" };
    const b = map[keyByKind[kind]];
    return Number(b?.remainSec || 0);
  }

  // 只負責讀取現有冷卻秒數，不在這裡扣，避免重複
  function getSkillCd(mon, key) {
    if (!mon || !key) return 0;

    // 1) BossCore 內建冷卻（多半給 Boss 用）
    if (hasCore() &&
        typeof BossCore.getSkillCooldown === "function" &&
        mon.skillCooldownsSec &&
        Object.prototype.hasOwnProperty.call(mon.skillCooldownsSec, key)) {
      return Number(BossCore.getSkillCooldown(mon, key) || 0);
    }

    // 2) 一般怪的 _cdMs（毫秒），由 monster_skills.js 維護
    if (mon._cdMs && Object.prototype.hasOwnProperty.call(mon._cdMs, key)) {
      const ms = Number(mon._cdMs[key] || 0);
      if (!Number.isFinite(ms) || ms <= 0) return 0;
      return Math.ceil(ms / 1000);
    }

    // 3) 舊欄位相容（如果有自訂 skillCooldowns）
    if (mon.skillCooldowns && Object.prototype.hasOwnProperty.call(mon.skillCooldowns, key)) {
      return Math.max(0, Math.ceil(Number(mon.skillCooldowns[key]) || 0));
    }

    return 0;
  }

  // Buff 狀態：讀 BossCore / buffState 的 remainSec
  function getBossSelfBuffStatus(mon) {
    if (!mon) return "無";

    const rawAtk = Number(mon._enragedTurns || 0);
    const rawDef = Number(mon._defBuffTurns || 0);
    const rawShield = Number(mon._rootShieldTurns || 0);
    const atkS = rawAtk || getBuffTurns(mon, "atk");
    const defS = rawDef || getBuffTurns(mon, "def");
    const shieldS = rawShield || getBuffTurns(mon, "shield");
    const speedS = getBuffTurns(mon, "speedMul");

    const parts = [];
    if (atkS > 0) parts.push(`💪 攻擊↑（${atkS}s）`);
    if (defS > 0) parts.push(`🛡️ 防禦↑（${defS}s）`);
    if (shieldS > 0) parts.push(`🔰 護盾↑（${shieldS}s）`);
    if (speedS > 0) parts.push(`⚡ 攻速↑（${speedS}s）`);
    return parts.length ? parts.join("、") : "無";
  }

  // 技能冷卻狀態：這裡會先幫「一般怪」跑一次 _tickForUi
  function getBossCooldownStatus(mon) {
    if (!mon || !Array.isArray(mon.skills)) return { all: "無" };

    _tickForUi(mon); // 一般怪在這裡扣 CD/Buff，Boss 則直接略過

    const parts = [];
    for (const s of mon.skills) {
      if (!s || !s.key) continue;
      const cd = getSkillCd(mon, s.key);
      const label = s.name || s.key;
      parts.push(`${label}：${cd > 0 ? cd + "s" : "就緒"}`);
    }
    return { all: parts.length ? parts.join("、") : "無" };
  }

  window.getBossSelfBuffStatus = getBossSelfBuffStatus;
  window.getBossCooldownStatus = getBossCooldownStatus;
})();

/***** 內部：記錄上一幀數值（用於動畫從舊值到新值） *****/
const _monsterPrevMap = Object.create(null); // key: "name|level|maxHp" -> { hp, shield, max }

/***** 建構兩條條形（HP + Shield），初始寬度以「上一幀」為基準 *****/
function buildTwoBarsHTML(curHp, maxHp, shieldVal, prev) {
  const cur    = Math.max(0, Number(curHp) || 0);
  const max    = Math.max(1, Number(maxHp) || 1);
  const shield = Math.max(0, Number(shieldVal) || 0);

  const prevHp = Math.max(0, Math.min(max, Number(prev?.hp ?? cur)));
  const prevSh = Math.max(0, Number(prev?.shield ?? shield));

  const pctHP_prev = Math.round((prevHp / max) * 100);
  const pctSH_prev = Math.round((prevSh / max) * 100);

  const pctHP_now  = Math.round((cur / max) * 100);
  const pctSH_now  = Math.round((shield / max) * 100);

  const hpCls = pctHP_now <= 30 ? 'low' : (pctHP_now <= 70 ? 'mid' : 'high');

  const shieldText = shield > 0 ? `　<span class="muted">護盾 ${shield.toLocaleString()}</span>` : '';

  return `
    <!-- HP -->
    <div class="hp-wrap">
      <div class="hp-label">
        <span>HP</span>
        <span class="num">${cur.toLocaleString()} / ${max.toLocaleString()}（${pctHP_now}%）${shieldText}</span>
      </div>
      <div class="bar hp-bar" id="hpBar">
        <div class="bar-fill ${hpCls}" id="hpFill" style="width:${pctHP_prev}%;"></div>
        <div class="bar-chip" id="hpChip" style="width:${pctHP_prev}%;"></div>
      </div>
    </div>

    <!-- Shield -->
    <div class="sh-wrap">
      <div class="sh-label">
        <span>護盾</span>
        <span class="num">${shield.toLocaleString()}（${pctSH_now}%）</span>
      </div>
      <div class="bar sh-bar" id="shBar">
        <div class="bar-fill" id="shFill" style="width:${pctSH_prev}%;"></div>
        <div class="bar-chip" id="shChip" style="width:${pctSH_prev}%;"></div>
      </div>
    </div>
  `;
}

/***** 套用動畫：把寬度從上一幀推進到這一幀 *****/
function animateTwoBars(from, to, max) {
  const hpBar  = document.getElementById('hpBar');
  const hpFill = document.getElementById('hpFill');
  const hpChip = document.getElementById('hpChip');
  const shBar  = document.getElementById('shBar');
  const shFill = document.getElementById('shFill');
  const shChip = document.getElementById('shChip');
  if (!hpBar || !hpFill || !hpChip || !shBar || !shFill || !shChip) return;

  const pctHP_from = Math.round((from.hp / max) * 100);
  const pctHP_to   = Math.round((to.hp   / max) * 100);

  const pctSH_from = Math.round((from.shield / max) * 100);
  const pctSH_to   = Math.round((to.shield   / max) * 100);

  // 更新顏色段位
  hpFill.classList.remove('high', 'mid', 'low');
  hpFill.classList.add(pctHP_to <= 30 ? 'low' : (pctHP_to <= 70 ? 'mid' : 'high'));

  // 立即推 HP 主條到新值
  hpFill.style.width = pctHP_to + '%';

  // 扣血才有白條延遲
  if (to.hp < from.hp) {
    hpBar.classList.remove('hp-hit'); void hpBar.offsetWidth; hpBar.classList.add('hp-hit');
    hpChip.style.transition = 'none';
    hpChip.style.width = pctHP_from + '%';
    setTimeout(() => {
      hpChip.style.transition = 'width .28s ease';
      hpChip.style.width = pctHP_to + '%';
    }, 120);
  } else {
    hpChip.style.transition = 'none';
    hpChip.style.width = pctHP_to + '%';
  }

  // 護盾主條
  shFill.style.width = pctSH_to + '%';

  // 護盾被扣才有白條延遲 & 閃爍
  if (to.shield < from.shield) {
    shBar.classList.remove('sh-hit'); void shBar.offsetWidth; shBar.classList.add('sh-hit');
    shChip.style.transition = 'none';
    shChip.style.width = pctSH_from + '%';
    setTimeout(() => {
      shChip.style.transition = 'width .32s ease';
      shChip.style.width = pctSH_to + '%';
    }, 120);
  } else {
    shChip.style.transition = 'none';
    shChip.style.width = pctSH_to + '%';
  }
}

/***** 小卡用：防禦％ + 穿透後顯示 *****/
function getMonsterDefSummary(monster) {
  if (!monster) return "";
  try {
    const fmtPct = (v) => (Math.round(v * 100) / 100).toFixed(2);

    const defPercent = Number(monster.defPercent);
    const penRaw = Number(player?.totalStats?.ignoreDefPct || 0);
    const pen = Math.max(0, Math.min(1, penRaw || 0)); // 0~1

    const hasDefPct = Number.isFinite(defPercent) && defPercent > 0;
    if (!hasDefPct) {
      return "防禦％：—";
    }

    const defPctNum = defPercent * 100;
    const penPctNum = pen * 100;

    let remainingDefMul = defPercent * (1 - pen);
    remainingDefMul = Math.max(0, remainingDefMul);

    const remainingDefPctNum = remainingDefMul * 100;
    const damageMul = Math.max(0, Math.min(1, 1 - remainingDefMul));
    const damageMulPctNum = damageMul * 100;

    return `防禦％：${fmtPct(defPctNum)}%｜穿透後：${fmtPct(remainingDefPctNum)}%｜實際輸出：${fmtPct(damageMulPctNum)}%`;
  } catch (_) {
    return "";
  }
}

/***** 多體：右側怪物小卡列表（已移除 SPD 顯示） *****/
function renderMultiMonsterCards(infoBox) {
  const mons = Array.isArray(window.monsters) ? window.monsters : [];
  if (!mons.length) {
    infoBox.innerHTML = `<span class="muted">目前沒有怪物</span>`;
    return;
  }

  const safeIdx = Math.max(0, Math.min(Number(window.targetIndex || 0), mons.length - 1));

  let cardsHtml = "";
  for (let i = 0; i < mons.length; i++) {
    const m = mons[i];
    if (!m) continue;

    const hp = Math.max(0, Number(m.hp) || 0);
    const maxHp = Math.max(1, Number(m.maxHp) || 1);
    const hpPct = Math.round(hp / maxHp * 100);

    const shield = Number(
      m.shield ??
      m.statusEffects?.shield?.value ??
      0
    );

    const expBase = Math.floor((m.baseExp || 0) * (1 + (m.level - 1) * 0.2));
    const isSelected = (i === safeIdx);

    const defSummary = getMonsterDefSummary(m);

    cardsHtml += `
      <div class="monster-card ${isSelected ? "is-selected" : ""}" data-index="${i}">
        <div class="mc-header">
          <span class="mc-name">${m.name}${m.isElite ? " [精英]" : ""}${m.isBoss ? " [Boss]" : ""}</span>
          <span class="mc-level">Lv.${m.level}</span>
        </div>
        <div class="mc-hp">
          HP：${hp.toLocaleString()} / ${maxHp.toLocaleString()}（${hpPct}%）
        </div>
        <div class="mc-hp-bar">
          <div class="mc-hp-fill" style="width:${hpPct}%;"></div>
        </div>
        <div class="mc-line">護盾：${shield.toLocaleString()}</div>
        <div class="mc-line">ATK：${m.atk}｜DEF：${m.def}</div>
        <div class="mc-line">EXP：${expBase}</div>
        ${defSummary ? `<div class="mc-line mc-def">${defSummary}</div>` : ""}
      </div>
    `;
  }

  infoBox.innerHTML = `
    <div class="multi-monster-header">
      <strong>多體戰鬥</strong>｜共 ${mons.length} 隻
      <span class="muted">（點擊卡片切換目標）</span>
    </div>
    <div class="multi-monster-grid">
      ${cardsHtml}
    </div>
  `;

  // 點卡片切換 currentMonster / targetIndex
  if (!infoBox._multiBind) {
    infoBox._multiBind = true;
    infoBox.addEventListener("click", (e) => {
      const card = e.target.closest(".monster-card");
      if (!card) return;
      const idx = Number(card.dataset.index);
      if (!Number.isFinite(idx)) return;

      if (!Array.isArray(window.monsters) || !window.monsters[idx]) return;

      window.targetIndex = idx;
      window.currentMonster = window.monsters[idx];
      window.monsterHP = Math.max(0, Number(window.currentMonster.hp) || 0);

      updateMonsterInfo(window.currentMonster, window.monsterHP);
    });
  }
}

/***** 更新怪物資訊：單體 / 多體兼容（攻速 UI 已移除） *****/
function updateMonsterInfo(monster, hp) {
  const difficulty = (typeof getCurrentDifficulty === "function" ? getCurrentDifficulty() : {}) || {};
  const infoBox = document.getElementById("monsterInfo");
  if (!infoBox) return;

  // 多體模式：改用小卡顯示
  if (window.battleMode === "multi" &&
      Array.isArray(window.monsters) &&
      window.monsters.length > 1) {
    renderMultiMonsterCards(infoBox);
    return;
  }

  if (!monster) {
    infoBox.innerHTML = "";
    return;
  }

  const fmtPct = (v) => {
    return (Math.round(v * 100) / 100).toFixed(2);
  };

  const playerDropBonus = Number(player?.dropRateBonus || 0);
  const playerGoldBonus = Number(player?.goldRateBonus || 0);

  const eliteRateForItems = monster.isElite ? 2 : 1;
  const eliteChancePct = (difficulty.eliteChance ?? 0) * 100;

  let expBase = Math.floor((monster.baseExp || 0) * (1 + (monster.level - 1) * 0.2));
  if (monster.isElite) expBase = Math.floor(expBase * 1.5);
  const baseExp = Math.floor(expBase * (difficulty.exp ?? 1));

  const baseGoldLeft = Math.floor((monster.baseGold || 0) * (difficulty.gold ?? 1));
  const finalGoldRight = Math.floor(baseGoldLeft * (1 + playerGoldBonus));

  // 強化石顯示
  let stoneRows = "";
  if (monster.dropRates?.stone) {
    const baseStonePct = (monster.dropRates.stone.chance || 0) * 100;
    const finalStonePct = baseStonePct * (1 + playerDropBonus);
    const bonusLv = Math.floor(monster.level / 5);
    const stoneMin = Math.floor(((monster.dropRates.stone.min || 0) + bonusLv) * (difficulty.stone ?? 1));
    const stoneMax = Math.floor(((monster.dropRates.stone.max || 0) + bonusLv) * (difficulty.stone ?? 1));
    stoneRows = `
      <div>強化石（機率）</div>
      <div>${fmtPct(baseStonePct)}%</div>
      <div>${fmtPct(finalStonePct)}%</div>
      <div style="grid-column: 1 / -1; opacity:.85">強化石數量：${stoneMin} ~ ${stoneMax} 顆</div>
    `;
  }

  // 狀態 / 冷卻（注意順序：先算冷卻，裡面會幫一般怪 tick，再算 Buff）
  const skillCdStatus = (typeof getBossCooldownStatus === "function")
    ? getBossCooldownStatus(monster)
    : { all: "無" };

  const selfBuffStatus = (typeof getBossSelfBuffStatus === "function")
    ? getBossSelfBuffStatus(monster)
    : "無";

  const currentRoundSafe = (typeof round === "number" && isFinite(round)) ? round : 0;
  const playerAppliedAbnormalText =
    (typeof getMonsterAbnormalEffects === "function")
      ? getMonsterAbnormalEffects(monster)
      : "無";
  const abnormalResistText =
    (typeof getMonsterAbnormalResistances === "function")
      ? getMonsterAbnormalResistances(monster, currentRoundSafe)
      : "無";

  const buffText = (typeof getMonsterBuffEffects === "function") ? getMonsterBuffEffects(monster) : "無";
  const buffSkillText = (typeof getMonsterBuiltInBuffSkills === "function") ? getMonsterBuiltInBuffSkills(monster) : "無";

  // 區域掉落
  let regionalRows = "";
  if (monster.dropRates) {
    for (const itemName in monster.dropRates) {
      if (itemName === "gold" || itemName === "stone" || itemName === "exp") continue;
      const cfg = monster.dropRates[itemName];
      if (!cfg || !(cfg.chance > 0)) continue;
      const basePct = cfg.chance * 100 * (difficulty.item ?? 1) * eliteRateForItems;
      const finalPct = basePct * (1 + playerDropBonus);
      regionalRows += `
        <div>${itemName}</div>
        <div>${fmtPct(basePct)}%</div>
        <div>${fmtPct(finalPct)}%</div>
      `;
    }
  }

  const gridStyle = `
    display: grid;
    grid-template-columns: 160px 1fr 1fr;
    gap: 6px 12px;
    align-items: center;
  `.trim();

  // 抓護盾值（依你實際欄位）
  const shieldVal = Number(
    monster.shield ??
    monster.statusEffects?.shield?.value ??
    0
  );

  // 上一幀狀態，用於血條動畫起始值
  const key = `${monster.name}|${monster.level}|${monster.maxHp}`;
  const prev = _monsterPrevMap[key] || {
    hp: Math.max(0, Number(hp) || 0),
    shield: Math.max(0, shieldVal),
    max: monster.maxHp
  };

  const dropsDisplay = isDropsVisible ? 'block' : 'none';

  const isBoss = !!monster.isBoss;
  const buffLabel = isBoss ? "Boss 狀態" : "怪物強化狀態";
  const cdLabel = isBoss ? "Boss 技能冷卻" : "技能冷卻（一般怪 / Boss）";

  // 防禦％ ＋ 穿透顯示
  let defLine = "";
  try {
    const defPercent = Number(monster.defPercent);
    const penRaw = Number(player?.totalStats?.ignoreDefPct || 0);
    const pen = Math.max(0, Math.min(1, penRaw || 0)); // 0~1

    const hasDefPct = Number.isFinite(defPercent) && defPercent > 0;
    const defPctNum = hasDefPct ? defPercent * 100 : 0;
    const penPctNum = pen * 100;

    let remainingDefMul = 0;
    let damageMul = 1;

    if (hasDefPct) {
      remainingDefMul = defPercent * (1 - pen);
      if (remainingDefMul < 0) remainingDefMul = 0;

      damageMul = 1 - remainingDefMul;
      if (damageMul < 0) damageMul = 0;
      if (damageMul > 1) damageMul = 1;
    }

    const remainingDefPctNum = remainingDefMul * 100;
    const damageMulPctNum    = damageMul * 100;

    const defPart = hasDefPct
      ? `怪物防禦％：${fmtPct(defPctNum)}%`
      : "怪物防禦％：—";

    const penPart  = `你的穿透：${fmtPct(penPctNum)}%`;
    const remPart  = hasDefPct ? `剩餘防禦：${fmtPct(remainingDefPctNum)}%` : "";
    const mulPart  = hasDefPct ? `實際輸出倍率：${fmtPct(damageMulPctNum)}%` : "";

    defLine = [defPart, penPart, remPart, mulPart].filter(Boolean).join("｜");
  } catch (_) {
    defLine = "";
  }

  infoBox.innerHTML = `
    <strong>${monster.name}${monster.isElite ? " [精英]" : ""}</strong><br>
    等級：${monster.level}<br>
    ${buildTwoBarsHTML(hp, monster.maxHp, shieldVal, prev)}
    ATK：${monster.atk}｜DEF：${monster.def}｜EXP：${baseExp}<br>
    ${defLine ? defLine + "<br>" : ""}
    精英怪出現機率：${fmtPct(eliteChancePct)}%<br><br>

    狀態效果：<br>
    🌟 ${buffLabel}：${selfBuffStatus}<br>
    ⏳ ${cdLabel}：${skillCdStatus.all}<br>
    🔸 玩家造成異常：${playerAppliedAbnormalText}<br>
    🔹 異常抗性：${abnormalResistText}<br>
    🔺 強化狀態：${buffText}<br>
    🔸 強化技能：${buffSkillText}<br>

    <div id="dropInfoSection" style="display:${dropsDisplay};">
      <br>
      📦 掉落預覽
      <div style="${gridStyle}; margin-top:6px;">
        <div></div><div class="muted">基準</div><div class="muted">含玩家</div>
        <div>楓幣</div>
        <div>${baseGoldLeft} 楓幣</div>
        <div>${finalGoldRight} 楓幣</div>
        ${stoneRows || ""}
        <div style="grid-column: 1 / -1; font-weight:600; margin-top:6px;">區域限定掉落</div>
        ${regionalRows || `<div>（無）</div><div></div><div></div>`}
      </div>
      <div style="margin-top:6px; opacity:.7; font-size:12px;">
        ※ 機率顯示到小數點一位；左欄為基準，右欄包含玩家加成。
      </div>
    </div>
  `;

  const now = {
    hp: Math.max(0, Number(hp) || 0),
    shield: Math.max(0, shieldVal),
    max: monster.maxHp
  };

  requestAnimationFrame(() => {
    animateTwoBars(prev, now, now.max);
  });

  _monsterPrevMap[key] = now;
}