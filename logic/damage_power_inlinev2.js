// damage_power_inline.js — 主頁顯示「傷害力區間」+ 可縮到右邊的最小化
// ✅ 與戰鬥同源：浮動使用 window.DAMAGE_JITTER_PCT（fallback ±10%）
// ✅ 顯示「總傷害 %」，並先乘總傷後再做浮動（符合新戰鬥流程）
// ✅ ⭐ 含怪防估：使用怪物防禦百分比（defPercent）+ 玩家穿透（ignoreDefPct）
//      公式：remainingDef = defPercent * (1 - pen)，damageMul = 1 - remainingDef（夾在 0~1）
// ✅ ⭐ 對一般 / 菁英 / Boss 傷害加成，與戰鬥邏輯一致（依目前怪物類型套用）
(function(w) {
  "use strict";

  const LS_KEY = "DMG_CARD_COLLAPSED_V1";

  function fmt(n) { return (Number(n) || 0).toLocaleString(); }

  // 與 Rpg_玩家.js 的 _applyDamageVariance 一致：讀取全域浮動百分比
  function readJitter() {
    try {
      if (typeof w.DAMAGE_JITTER_PCT === "number" && w.DAMAGE_JITTER_PCT >= 0) {
        return w.DAMAGE_JITTER_PCT; // 0~1（例：0.10 = ±10%）
      }
    } catch (_) {}
    return 0.10; // 預設 ±10%
  }

  // 讀取最終攻擊力（不含怪防）
  function readAtk() {
    try { return Math.max(0, Math.floor(w.player?.totalStats?.atk || 0)); }
    catch (_) { return 0; }
  }

  // 讀取總傷害（小數）
  function readTotalDamage() {
    try { return Number(w.player?.totalStats?.totalDamage) || 0; }
    catch (_) { return 0; }
  }

  // ⭐ 讀取對一般 / 菁英 / Boss 傷害（小數）
  function readVsTypeDamage() {
    try {
      const ts = w.player?.totalStats || {};
      return {
        normal: Number(ts.normalDamage) || 0,
        elite:  Number(ts.eliteDamage)  || 0,
        boss:   Number(ts.bossDamage)   || 0
      };
    } catch (_) {
      return { normal:0, elite:0, boss:0 };
    }
  }

  // 讀取穿防％（小數）
  function readIgnoreDefPct() {
    try { return Math.max(0, Math.min(1, Number(w.player?.totalStats?.ignoreDefPct) || 0)); }
    catch (_) { return 0; }
  }

  // 讀取目前戰鬥怪物資訊（若有）
  function readMonsterInfo() {
    const m = w.currentMonster || null;
    if (!m) return { name: "", def: 0, shield: 0, type:"normal", defPercent: 0 };
    const name = (typeof m.name === 'string' ? m.name : '') || '';
    const def = Math.max(0, Math.floor(Number(m.def) || 0));
    const shield = Math.max(0, Math.floor(Number(m.shield) || 0));

    // 判定怪物類型：normal / elite / boss（跟戰鬥端一致）
    let type = "normal";
    if (m.isBoss) type = "boss";
    else if (m.isElite) type = "elite";

    // 防禦百分比倍率（1.0 = 100%）
    let defPercent = Number(m.defPercent);
    if (!Number.isFinite(defPercent) || defPercent <= 0) defPercent = 0;

    return { name, def, shield, type, defPercent };
  }

  // 注入樣式（含縮小樣式）
  function ensureStyle() {
    if (document.getElementById("dmgPowerCardStyle")) return;
    const s = document.createElement("style");
    s.id = "dmgPowerCardStyle";
    s.textContent = `
      #dmgPowerCard{
        position:fixed;right:14px;bottom:80px;z-index:9998;
        background:#0b1220;color:#e5e7eb;border:1px solid #1f2937;
        border-radius:12px;padding:10px 12px;min-width:240px;
        font:13px/1.5 system-ui,Segoe UI,Roboto,Arial,sans-serif;
        box-shadow:0 8px 24px rgba(0,0,0,.35);
        transition: transform .18s ease, opacity .18s ease, right .18s ease, bottom .18s ease, width .18s ease, padding .18s ease;
      }
      #dmgPowerCard .dmg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;}
      #dmgPowerCard .dmg-title{display:flex;align-items:center;gap:6px;font-weight:800;letter-spacing:.2px}
      #dmgPowerCard .dmg-toggle{
        background:#111827;border:1px solid #374151;color:#9ca3af;border-radius:8px;
        padding:2px 6px;cursor:pointer;font-size:12px;line-height:1;
      }
      #dmgPowerCard.collapsed{ right:-2px; padding:6px 8px; min-width:auto; width:auto; }
      #dmgPowerCard.collapsed .dmg-body{ display:none; }
      #dmgPowerCard.collapsed .dmg-title b{ display:none; }
      #dmgPowerCard.collapsed .dmg-toggle{ opacity:.85; }
      #dmgPowerCard .dmg-pill{
        display:inline-flex;align-items:center;justify-content:center;
        width:22px;height:22px;border-radius:999px;background:#111827;border:1px solid #374151;
        font-size:13px;
      }
      #dmgPowerSub{ font-size:12px;opacity:.85; }
      #dmgPowerHint{ font-size:11px;opacity:.6;margin-top:4px; }
      #dmgPowerDef{ font-size:12px;opacity:.9;margin-top:4px; }
    `;
    document.head.appendChild(s);
  }

  // 建立 UI 卡片
  function ensureCard() {
    ensureStyle();
    let card = document.getElementById("dmgPowerCard");
    if (card) return card;

    card = document.createElement("div");
    card.id = "dmgPowerCard";
    card.innerHTML = `
      <div class="dmg-head">
        <div class="dmg-title">
          <span class="dmg-pill">⚔️</span>
          <b>傷害力（不含怪物防禦）</b>
        </div>
        <button class="dmg-toggle" title="縮小/展開">⟷</button>
      </div>
      <div class="dmg-body">
        <div id="dmgPowerMain" style="font-weight:700;">—</div>
        <div id="dmgPowerSub">—</div>
        <div id="dmgPowerDef"></div>
        <div id="dmgPowerHint">（總傷害、對象加傷與末端浮動已套用；上列不含怪防/護盾）</div>
      </div>
    `;
    document.body.appendChild(card);

    // 綁定縮小/展開
    const btn = card.querySelector(".dmg-toggle");
    btn.addEventListener("click", toggleCollapse);
    card.querySelector(".dmg-title").addEventListener("click", toggleCollapse);

    // 恢復上次狀態
    const saved = localStorage.getItem(LS_KEY);
    if (saved === "1") card.classList.add("collapsed");

    return card;
  }

  function isCollapsed() {
    const card = document.getElementById("dmgPowerCard");
    return !!(card && card.classList.contains("collapsed"));
  }

  function toggleCollapse() {
    const card = ensureCard();
    card.classList.toggle("collapsed");
    localStorage.setItem(LS_KEY, card.classList.contains("collapsed") ? "1" : "0");
  }

  function render() {
    const atk = readAtk();
    const td  = readTotalDamage();
    const pct = readJitter();
    const pen = readIgnoreDefPct();            // 穿防（小數 0~1）
    const mon = readMonsterInfo();
    const vs  = readVsTypeDamage();           // 對象類型傷害

    // ⭐ 決定目前生效的「對象加傷倍率」
    let vsMul = 1;
    let vsPctForLabel = 0;
    let targetLabel = "一般怪";

    if (mon.type === "boss") {
      vsMul += vs.boss;
      vsPctForLabel = vs.boss;
      targetLabel = "Boss";
    } else if (mon.type === "elite") {
      vsMul += vs.elite;
      vsPctForLabel = vs.elite;
      targetLabel = "菁英怪";
    } else {
      vsMul += vs.normal;
      vsPctForLabel = vs.normal;
      targetLabel = "一般怪";
    }

    // 若目前沒有戰鬥中的怪物，就用「一般怪」視角
    if (!w.currentMonster) {
      targetLabel = "一般怪";
      vsPctForLabel = vs.normal;
      vsMul = 1 + vs.normal;
    }

    // 依照新戰鬥流程：
    // ATK × (1 + 總傷) × (1 + 對象加傷) → 浮動
    const tdMul = 1 + td;
    const totalMul = tdMul * vsMul;

    const atkAfterMul = Math.floor(atk * totalMul);

    const minNoDef = Math.floor(atkAfterMul * (1 - pct));
    const maxNoDef = Math.floor(atkAfterMul * (1 + pct));

    const card = ensureCard();
    const main = card.querySelector("#dmgPowerMain");
    const sub  = card.querySelector("#dmgPowerSub");
    const defL = card.querySelector("#dmgPowerDef");

    if (atk <= 0) {
      if (main) main.textContent = "ATK — → — ~ —";
      if (sub)  sub.textContent  = "總傷 +0.0% · 對一般怪 +0.0% · 穿防 0.0% · 浮動 ±" + (pct * 100).toFixed(1) + "%";
      if (defL) defL.textContent = "";
      return;
    }

    if (main) main.innerHTML = `ATK ${fmt(atk)} → <b>${fmt(minNoDef)} ~ ${fmt(maxNoDef)}</b>`;

    // 一些百分比文字先算好，下面會重用
    const tdStr   = (td * 100).toFixed(1);
    const vsStr   = (vsPctForLabel * 100).toFixed(1);
    const penStr  = (pen * 100).toFixed(1);
    const jitterS = (pct * 100).toFixed(1);

    if (sub) {
      sub.textContent = `總傷 +${tdStr}% · 對${targetLabel} +${vsStr}% · 穿防 ${penStr}% · 浮動 ±${jitterS}%`;
    }

    // ===== 含怪防估：套用防禦百分比（你的新公式） + 平面 DEF =====
    if (defL) {
      if (mon.def > 0 || mon.defPercent > 0 || mon.shield > 0) {
        // 防禦百分比：1.0 = 100%
        const defPctFactor = mon.defPercent > 0 ? mon.defPercent : 0;

        const hasDefPct = defPctFactor > 0;
        let remainingDefMul = 0;
        let damageMul = 1;

        if (hasDefPct) {
          // 剩餘防禦 = 防禦倍數 * (1 - 穿透％)
          remainingDefMul = defPctFactor * (1 - pen);
          if (remainingDefMul < 0) remainingDefMul = 0;

          // 實際輸出倍率 = 1 - 剩餘防禦
          damageMul = 1 - remainingDefMul;
          if (damageMul < 0) damageMul = 0;
          if (damageMul > 1) damageMul = 1;
        } else {
          remainingDefMul = 0;
          damageMul = 1;
        }

        const minAfterPct = Math.floor(minNoDef * damageMul);
        const maxAfterPct = Math.floor(maxNoDef * damageMul);

        // 再減平面防禦
        const minWithDef = Math.max(minAfterPct - mon.def, 1);
        const maxWithDef = Math.max(maxAfterPct - mon.def, 1);

        const defPctLabel   = hasDefPct ? (defPctFactor * 100).toFixed(1) : "—";
        const remainDefLabel = hasDefPct ? (remainingDefMul * 100).toFixed(1) : "0.0";
        const dmgMulLabel   = (damageMul * 100).toFixed(1);

        const namePart   = mon.name ? `（${mon.name}）` : "";
        const shieldPart = mon.shield > 0 ? ` · 護盾 ${fmt(mon.shield)}` : "";

        defL.innerHTML =
          `含怪防估：<b>${fmt(minWithDef)} ~ ${fmt(maxWithDef)}</b>` +
          ` · 防禦％ ${defPctLabel}%` +
          ` · 剩餘防禦 ${remainDefLabel}%` +
          ` · 實際輸出倍率 ${dmgMulLabel}%` +
          ` · DEF ${fmt(mon.def)}${shieldPart} ${namePart}`;
      } else {
        defL.textContent = "";
      }
    }
  }

  // 每秒更新一次
  let _timer = null;
  function start() {
    render();
    if (_timer) clearInterval(_timer);
    _timer = setInterval(render, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  // 對外
  w.refreshDamagePowerCard = render;
  w.toggleDamagePowerCard  = toggleCollapse;

})(window);