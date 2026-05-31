// sp_system.js — SP點數加成（寫入 coreBonus.bonusData.sp）
// UI：這支檔案只建立彈窗，不新增入口按鈕。請在你的 UI 上自己綁 openSpModal()。

(function (w) {
  "use strict";

  // ===== 設定 =====
  const STORAGE_KEY = "sp.v2";      // 舊 localStorage key（僅用於遷移）
  const SAVEHUB_NS  = "sp.11";      // SaveHub 命名空間
  const RESET_COST_GEMS = 300;
  const AUTO_SAVE_AFTER_CHANGE = true;

  const REDEEM_ITEM_ID = "sp點數券";
  const REDEEM_POINTS_PER_ITEM = 1;

  // 數值點數上限
  const STAT_LIMITS = {
    // 四圍（新增）：每點 +2，上限 50
    str: 50, agi: 50, int: 50, luk: 50,
    // 直加四大數值
    hp: 800, mp: 80, atk: 800, def: 800,
    // 其他％型（每點固定%）
    crit: 50,       //
    critDmg: 50,    // 
    aspd: 100,       // 
    exp: 200, drop: 200, gold: 200,
  //  skillDamage: 250,   // 
    totalDamage: 300,   //
    recover: 20,       // recoverPercent
    ignoreDef: 100      //  ignoreDefPct
  };

  // 顯示名稱
  const NAMES = {
    // 新增四圍
    str:"STR", agi:"AGI", int:"INT", luk:"LUK",
    // 直加
    hp:"HP", mp:"MP", atk:"攻擊力", def:"防禦力",
    // 百分比類
    crit:"爆擊率", critDmg:"爆擊傷害", aspd:"攻擊速度",
    exp:"經驗值", drop:"掉落率", gold:"金幣掉落率",
    skillDamage:"技能傷害", totalDamage:"總傷害",
    recover:"回復提升", ignoreDef:"穿透防禦力"
  };

  // 固定每點效益（平坦 / ％）
  // ⚠️ HP/MP 改為固定：HP+40、MP+2，不再依職業
  const PER_POINT_FLAT = {
    str:2, agi:2, int:2, luk:2,
    hp:60, mp:2, atk:8, def:6
  };
  const PER_POINT_PERCENT = {
    crit:0.002,      // 
    critDmg:0.003,   // 
    aspd:0.005,     // +0.05 / 點
    exp:0.005, drop:0.005, gold:0.005,
  //  skillDamage:0.001,   // +0.1%
    totalDamage:0.001,   // +0.1%
    recover:0.01,       // +0.1%
    ignoreDef:0.003      // +0.3%
  };

  // ===== SaveHub 封裝 =====
  var SH = w.SaveHub || null;

  function normalizeSP(obj){
    const base = {
      total: 0, unspent: 0,
      stats: {
        // 新增四圍
        str:0, agi:0, int:0, luk:0,
        // 直加
        hp:0, mp:0, atk:0, def:0,
        // ％類
        crit:0, critDmg:0, aspd:0, exp:0, drop:0, gold:0,
        skillDamage:0, totalDamage:0, recover:0, ignoreDef:0
      }
      // ❌ 移除四大屬性的百分比面板：不再有 percents 區
    };
    if (!obj || typeof obj!=="object") return base;
    try{
      base.total   = Number(obj.total)||0;
      base.unspent = Number(obj.unspent)||0;
      base.stats   = Object.assign({}, base.stats, obj.stats||{});
    }catch(_){}
    return base;
  }

  (function registerSaveHub(){
    if (!SH) return;
    try{
      var schema = { version: 2, migrate: function(old){ return normalizeSP(old||{}); } };
      if (typeof SH.registerNamespaces === "function"){
        var pack = {}; pack[SAVEHUB_NS]=schema; SH.registerNamespaces(pack);
      } else if (typeof SH.registerNamespace === "function"){
        SH.registerNamespace(SAVEHUB_NS, schema);
      }
    }catch(e){ console && console.warn && console.warn("[sp] SaveHub register failed:", e); }
  })();

  function shRead(defVal){
    if (!SH) return defVal;
    try{
      if (typeof SH.get === "function") return SH.get(SAVEHUB_NS, defVal);
      if (typeof SH.read === "function") return SH.read(SAVEHUB_NS, defVal);
    }catch(e){ console && console.warn && console.warn("[sp] SaveHub read failed:", e); }
    return defVal;
  }
  function shWrite(val){
    if (!SH) return;
    try{
      if (typeof SH.set === "function"){ SH.set(SAVEHUB_NS, val); return; }
      if (typeof SH.write === "function"){ SH.write(SAVEHUB_NS, val); return; }
    }catch(e){ console && console.warn && console.warn("[sp] SaveHub write failed:", e); }
  }

  // ===== 內部狀態 =====
  const SP = {
    total: 0,
    unspent: 0,
    stats: {
      str:0, agi:0, int:0, luk:0,
      hp:0, mp:0, atk:0, def:0,
      crit:0, critDmg:0, aspd:0, exp:0, drop:0, gold:0,
      skillDamage:0, totalDamage:0, recover:0, ignoreDef:0
    }
  };

  // ===== 計算：回傳「平坦與％」的最終加值（給 applyToPlayer 用）=====
  function computeCoreBonusFromPoints(points) {
    // 平坦
    const flat = {
      str: (points.str||0) * PER_POINT_FLAT.str,
      agi: (points.agi||0) * PER_POINT_FLAT.agi,
      int: (points.int||0) * PER_POINT_FLAT.int,
      luk: (points.luk||0) * PER_POINT_FLAT.luk,
      hp:  (points.hp ||0) * PER_POINT_FLAT.hp,
      mp:  (points.mp ||0) * PER_POINT_FLAT.mp,
      atk: (points.atk||0) * PER_POINT_FLAT.atk,
      def: (points.def||0) * PER_POINT_FLAT.def
    };

    // ％（直接加進 player.totalStats 的比例欄）
    const pct = {
      critRate:       (points.crit     ||0)*PER_POINT_PERCENT.crit,
      critMultiplier: (points.critDmg  ||0)*PER_POINT_PERCENT.critDmg,
      attackSpeedPct: (points.aspd     ||0)*PER_POINT_PERCENT.aspd,
      expBonus:       (points.exp      ||0)*PER_POINT_PERCENT.exp,
      dropBonus:      (points.drop     ||0)*PER_POINT_PERCENT.drop,
      goldBonus:      (points.gold     ||0)*PER_POINT_PERCENT.gold,
//      skillDamage:    (points.skillDamage ||0)*PER_POINT_PERCENT.skillDamage,
      totalDamage:    (points.totalDamage ||0)*PER_POINT_PERCENT.totalDamage,
      recoverPercent: (points.recover     ||0)*PER_POINT_PERCENT.recover,
      ignoreDefPct:   (points.ignoreDef   ||0)*PER_POINT_PERCENT.ignoreDef
    };

    return { flat, pct };
  }

  // ===== 顯示用：總能力（簡化：不再顯示四圍百分比）=====
  function computeTotalStats() {
    const total = w.player?.totalStats || {};
    const { flat, pct } = computeCoreBonusFromPoints(SP.stats);

    return {
      // 直加四大數值（顯示 base 與 SP flat）
      hp:   { base: Number(total.hp || 0),  flat: flat.hp },
      mp:   { base: Number(total.mp || 0),  flat: flat.mp },
      atk:  { base: Number(total.atk || 0), flat: flat.atk },
      def:  { base: Number(total.def || 0), flat: flat.def },
      // 新增四圍（顯示 base 與 SP flat）
      str:  { base: Number((w.player?.baseStats?.str||0) + (w.player?.coreBonus?.str||0)), flat: flat.str },
      agi:  { base: Number((w.player?.baseStats?.agi||0) + (w.player?.coreBonus?.agi||0)), flat: flat.agi },
      int:  { base: Number((w.player?.baseStats?.int||0) + (w.player?.coreBonus?.int||0)), flat: flat.int },
      luk:  { base: Number((w.player?.baseStats?.luk||0) + (w.player?.coreBonus?.luk||0)), flat: flat.luk },

      // 其他百分比屬性（base 已含 SP；只做顯示增量）
      crit:       { base: Number(total.critRate || 0),          bonus: pct.critRate },
      critDmg:    { base: Number(total.critMultiplier || 0),    bonus: pct.critMultiplier },
      aspd:       { base: Number(total.attackSpeedPct || 0),    bonus: pct.attackSpeedPct },
      exp:        { base: Number((w.player?.expRateBonus)  || 0), bonus: pct.expBonus  },
      drop:       { base: Number((w.player?.dropRateBonus) || 0), bonus: pct.dropBonus },
      gold:       { base: Number((w.player?.goldRateBonus) || 0), bonus: pct.goldBonus },
  //    skillDamage:{ base: Number(total.skillDamage || 0),       bonus: pct.skillDamage },
      totalDamage:{ base: Number(total.totalDamage || 0),       bonus: pct.totalDamage },
      recover:    { base: Number(total.recoverPercent || 0),    bonus: pct.recoverPercent },
      ignoreDef:  { base: Number(total.ignoreDefPct || 0),      bonus: pct.ignoreDefPct }
    };
  }

  // ===== 存檔 / 載入 =====
  function saveLocal() {
    const safe = normalizeSP(SP);
    try{
      if (SH){ shWrite(safe); }
      else { localStorage.setItem(STORAGE_KEY, JSON.stringify(safe)); }
    }catch(_){}
  }
  function loadLocal() {
    try {
      if (SH){
        let data = shRead(null);
        if (!data){
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw){
            try{
              const legacy = JSON.parse(raw);
              data = normalizeSP(legacy);
              shWrite(data);
              localStorage.removeItem(STORAGE_KEY);
            }catch(_){ data = null; }
          }
        }
        const obj = normalizeSP(data||{});
        Object.assign(SP, obj);
      } else {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const obj = normalizeSP(JSON.parse(raw));
        Object.assign(SP, obj);
      }
    } catch(_) {}
  }

  // ===== 套用到 player（寫入 coreBonus.bonusData.sp）=====
  function applyToPlayer() {
    if (!w.player || !player.coreBonus) return;
    const { flat, pct } = computeCoreBonusFromPoints(SP.stats);
    player.coreBonus.bonusData = player.coreBonus.bonusData || {};
    player.coreBonus.bonusData.sp = {
      // 平坦四圍（新增）
      str: flat.str, agi: flat.agi, int: flat.int, luk: flat.luk,
      // 平坦四大數值
      hp: flat.hp, mp: flat.mp, atk: flat.atk, def: flat.def,
      // 百分比類
      critRate: pct.critRate, critMultiplier: pct.critMultiplier,
      attackSpeedPct: pct.attackSpeedPct, expBonus: pct.expBonus,
      dropBonus: pct.dropBonus, goldBonus: pct.goldBonus,
    //  skillDamage: pct.skillDamage, totalDamage: pct.totalDamage,
      recoverPercent: pct.recoverPercent, ignoreDefPct: pct.ignoreDefPct
    };
    w.updateResourceUI?.();
  }

  // ===== UI =====
  let $modal, $statContent, $remain, $resetBtn, $totalStats, $redeemBtn, $redeem10Btn, $redeemAllBtn, $redeemInfo;

  function ensureModal() {
    if ($modal) return;

    $modal = document.createElement("div");
    $modal.id = "spModal";
    $modal.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,.6);
      display: none; z-index: 99999; align-items: center; justify-content: center; padding: 16px;
    `;

    const wrap = document.createElement("div");
    wrap.style.cssText = `
      background:#1f1f1f; color:#fff; width: min(980px, 96vw); max-height: 90vh; overflow:auto;
      border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,.4); padding: 16px 16px 8px;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
    `;

    const header = document.createElement("div");
    header.style.cssText = `display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px;`;
    header.innerHTML = `
      <div style="font-size:18px; font-weight:700;">🌟 SP 加點</div>
      <div><button id="spCloseBtn" style="background:#333; color:#fff; border:0; padding:6px 10px; border-radius:8px; cursor:pointer;">✖</button></div>
    `;

    const topBar = document.createElement("div");
    topBar.style.cssText = `display:flex; gap:16px; align-items:center; flex-wrap: wrap; margin-bottom: 10px;`;
    $remain = document.createElement("div");
    $remain.style.cssText = `font-weight:600;`;
    const tips = document.createElement("div");
    tips.style.cssText = `opacity:.8; font-size:12px;`;
    tips.textContent = "每項有上限；重置會退回全部點數，需花費 300 鑽石";
    $resetBtn = document.createElement("button");
    $resetBtn.textContent = `🔄 重置 (300💎)`;
    $resetBtn.style.cssText = `background:#a82; color:#fff; border:0; padding:6px 10px; border-radius:8px; cursor:pointer;`;
    topBar.appendChild($remain);
    topBar.appendChild(tips);
    topBar.appendChild($resetBtn);

    // 兌換 SP
    const redeemContainer = document.createElement("div");
    redeemContainer.style.cssText = `display:flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-bottom: 10px; border-top: 1px solid #333; padding-top: 10px;`;
    const redeemRow = document.createElement("div");
    redeemRow.style.cssText = `display:flex; align-items:center; gap:8px;`;
    $redeemBtn = document.createElement("button");
    $redeemBtn.textContent = `兌換 1 張`;
    $redeemBtn.style.cssText = `background:#2a8; color:#fff; border:0; padding:6px 10px; border-radius:8px; cursor:pointer;`;

    $redeem10Btn = document.createElement("button");
    $redeem10Btn.textContent = `兌換 10 張`;
    $redeem10Btn.style.cssText = $redeemBtn.style.cssText;

    $redeemAllBtn = document.createElement("button");
    $redeemAllBtn.textContent = `全部兌換`;
    $redeemAllBtn.style.cssText = $redeemBtn.style.cssText;

    $redeemInfo = document.createElement("div");
    $redeemInfo.style.cssText = `font-size:12px; opacity:.8;`;

    redeemRow.appendChild($redeemBtn);
    redeemRow.appendChild($redeem10Btn);
    redeemRow.appendChild($redeemAllBtn);
    redeemRow.appendChild($redeemInfo);
    redeemContainer.appendChild(redeemRow);

    const statHeader = document.createElement("h4");
    statHeader.textContent = "可分配點數";
    statHeader.style.cssText = "margin: 0 0 10px;";

    // 數值點數表格（❗已移除『四大屬性百分比』面板）
    $statContent = document.createElement("div");
    $statContent.style.cssText = `
      display:grid; grid-template-columns: auto 1fr auto auto; gap: 8px 12px; align-items:center;
      border-top: 1px solid #333; padding-top: 8px;
    `;

    // 表頭
    ["項目", "已分配", "＋1", "＋10"].forEach(n => {
      const el = document.createElement("div");
      el.style.cssText = `opacity:.7; font-size:12px;`;
      el.textContent = n;
      $statContent.appendChild(el);
    });

    function addStatRow(key) {
      const name = document.createElement("div");
      name.id = `sp-stat-name-${key}`;
      name.style.cssText = `white-space: nowrap;`;

      const val = document.createElement("div");
      val.id = `sp-stat-val-${key}`;
      val.style.cssText = `font-weight:700;`;

      const btn1 = document.createElement("button");
      btn1.textContent = "+1";
      btn1.style.cssText = `background:#333; color:#fff; border:0; padding:6px 8px; border-radius:8px; cursor:pointer;`;
      btn1.addEventListener("click", () => adjustStat(key, +1));

      const btn10 = document.createElement("button");
      btn10.textContent = "+10";
      btn10.style.cssText = `background:#333; color:#fff; border:0; padding:6px 8px; border-radius:8px; cursor:pointer;`;
      btn10.addEventListener("click", () => adjustStat(key, +10));

      $statContent.appendChild(name);
      $statContent.appendChild(val);
      $statContent.appendChild(btn1);
      $statContent.appendChild(btn10);
    }

    // 🔁 建列：四圍 → 四大數值 → 其他％
    ["str","agi","int","luk","hp","mp","atk","def","crit","critDmg","aspd","exp","drop","gold","","totalDamage","recover","ignoreDef"].forEach(addStatRow);

    // 總能力
    $totalStats = document.createElement("div");
    $totalStats.style.cssText = `margin-top: 10px; padding-top: 8px; border-top: 1px solid #333;`;
    $totalStats.innerHTML = `<h4 style="margin:0 0 10px;">總能力（顯示當前值與 SP 平坦增量）</h4>`;

    // 精簡戰力
    const $cpInline = document.createElement("div");
    $cpInline.id = "sp-cp-inline";
    $cpInline.style.cssText = "margin-top:6px;opacity:.9;";
    $cpInline.innerHTML = `戰鬥力：<strong id="sp-cp-inline-val">—</strong>`;

    // footer
    const footer = document.createElement("div");
    footer.style.cssText = `display:flex; justify-content:flex-end; gap: 8px; margin-top: 10px;`;
    const btnClose = document.createElement("button");
    btnClose.textContent = "關閉";
    btnClose.style.cssText = `background:#444; color:#fff; border:0; padding:8px 14px; border-radius:10px; cursor:pointer;`;
    btnClose.addEventListener("click", closeSpModal);
    footer.appendChild(btnClose);

    // 組裝
    const wrapTop = document.createElement("div");
    wrapTop.appendChild(header);
    wrapTop.appendChild(topBar);
    wrapTop.appendChild(redeemContainer);
    wrapTop.appendChild(statHeader);
    wrapTop.appendChild($statContent);
    wrapTop.appendChild($cpInline);
    wrapTop.appendChild($totalStats);
    wrapTop.appendChild(footer);

    wrap.appendChild(wrapTop);
    $modal.appendChild(wrap);
    document.body.appendChild($modal);

    // 綁定
    document.getElementById("spCloseBtn").addEventListener("click", closeSpModal);
    $resetBtn.addEventListener("click", resetAll);
    $redeemBtn.addEventListener("click", redeemSpPoints);
    $redeem10Btn.addEventListener("click", redeemSpPoints10);
    $redeemAllBtn.addEventListener("click", redeemSpPointsAll);
  }

  function openSpModal() { ensureModal(); render(); refreshInlineCP(); $modal.style.display = "flex"; }
  function closeSpModal() { if ($modal) $modal.style.display = "none"; }

  // ===== 操作 =====
  function spentOfStat(key){ return Number(SP.stats[key]||0); }

  function adjustStat(key, delta) {
    delta = Math.trunc(Number(delta) || 0);
    if (!delta || delta < 0) return;
    const cur = spentOfStat(key);
    const can = Math.min(delta, SP.unspent, Math.max(0, (STAT_LIMITS[key] || 0) - cur));
    if (can <= 0) return;

    SP.stats[key] = cur + can;
    SP.unspent -= can;
    saveLocal();
    applyToPlayer();
    renderRow(key);
    renderName(key);
    renderRemain();
    renderTotalStats();
    refreshInlineCP();
    if (AUTO_SAVE_AFTER_CHANGE) w.saveGame?.();
  }

  function resetAll() {
    if (!w.player) return;
    const need = RESET_COST_GEMS;
    const curGems = Number(w.player.gem || w.player.gems || 0);
    if (curGems < need) { alert(`重置需要 ${need} 鑽石，你目前只有 ${curGems}`); return; }
    if (!confirm(`確定要重置 SP 加點並退回所有點數嗎？（花費 ${need} 鑽石）`)) return;

    w.player.gem = Math.max(0, curGems - need);

    let refund = 0;
    for (const k in SP.stats) { refund += Number(SP.stats[k] || 0); SP.stats[k] = 0; }
    SP.unspent += refund;

    saveLocal();
    applyToPlayer();
    w.updateResourceUI?.();
    w.logPrepend?.(`🔄 已重置 SP 加點，退回 ${refund} 點（花費 ${need} 鑽石）`);
    render();
    if (AUTO_SAVE_AFTER_CHANGE) w.saveGame?.();
  }

  function addSpPoints(n) {
    const v = Math.max(0, Math.trunc(Number(n) || 0));
    if (!v) return;
    SP.total += v;
    SP.unspent += v;
    saveLocal();
    render();
    if (AUTO_SAVE_AFTER_CHANGE) w.saveGame?.();
  }

  function redeemSpPoints() {
    const curItems = w.getItemQuantity?.(REDEEM_ITEM_ID) || 0;
    if (curItems < 1) { $redeemInfo.textContent = "❌ 道具數量不足！"; return; }
    w.removeItem?.(REDEEM_ITEM_ID, 1);
    addSpPoints(REDEEM_POINTS_PER_ITEM);
    w.updateResourceUI?.();
    w.logPrepend?.(`🎉 使用一張 ${REDEEM_ITEM_ID}，獲得 ${REDEEM_POINTS_PER_ITEM} 點 SP！`);
    $redeemInfo.textContent = `✅ 成功兌換！${REDEEM_ITEM_ID} 剩餘：${w.getItemQuantity?.(REDEEM_ITEM_ID)}`;
    render();
    if (AUTO_SAVE_AFTER_CHANGE) w.saveGame?.();
  }

  // === 新增：兌換 10 張與全部兌換 ===
  function redeemSpPoints10() {
    const curItems = w.getItemQuantity?.(REDEEM_ITEM_ID) || 0;
    const count = Math.min(10, curItems);
    if (count < 1) { $redeemInfo.textContent = "❌ 道具數量不足！"; return; }
    w.removeItem?.(REDEEM_ITEM_ID, count);
    addSpPoints(count * REDEEM_POINTS_PER_ITEM);
    w.updateResourceUI?.();
    w.logPrepend?.(`🎉 使用 ${count} 張 ${REDEEM_ITEM_ID}，獲得 ${count} 點 SP！`);
    $redeemInfo.textContent = `✅ 成功兌換 ${count} 張！剩餘：${w.getItemQuantity?.(REDEEM_ITEM_ID)}`;
    render();
    if (AUTO_SAVE_AFTER_CHANGE) w.saveGame?.();
  }

  function redeemSpPointsAll() {
    const curItems = w.getItemQuantity?.(REDEEM_ITEM_ID) || 0;
    if (curItems < 1) { $redeemInfo.textContent = "❌ 道具數量不足！"; return; }
    w.removeItem?.(REDEEM_ITEM_ID, curItems);
    addSpPoints(curItems * REDEEM_POINTS_PER_ITEM);
    w.updateResourceUI?.();
    w.logPrepend?.(`🎉 全部兌換 ${curItems} 張 ${REDEEM_ITEM_ID}，共獲得 ${curItems} 點 SP！`);
    $redeemInfo.textContent = `✅ 全部兌換完成！剩餘：0`;
    render();
    if (AUTO_SAVE_AFTER_CHANGE) w.saveGame?.();
  }

  // ===== 繪製 =====
  function renderName(key) {
    const el = document.getElementById(`sp-stat-name-${key}`);
    if (!el) return;

    // 顯示每點效益
    let perStr = "";
    if (key in PER_POINT_FLAT) {
      perStr = `（<strong>+${PER_POINT_FLAT[key]}</strong> / 點）`;
    } else if (key in PER_POINT_PERCENT) {
      perStr = `（<strong>+${(PER_POINT_PERCENT[key]*100).toFixed(2)}%</strong> / 點）`;
    }
    el.innerHTML = `${NAMES[key]} ${perStr}（上限：${STAT_LIMITS[key]}）`;
  }

  function renderRow(key) {
    const el = document.getElementById(`sp-stat-val-${key}`);
    if (el) el.textContent = `${Number(SP.stats[key]||0)} / ${STAT_LIMITS[key]}`;
  }

  function renderRemain() {
    if ($remain) $remain.innerHTML = `剩餘可分配：<strong>${SP.unspent}</strong> / 總點數：${SP.total}`;
  }

  function renderTotalStats() {
    if (!$totalStats) return;
    const t = computeTotalStats();

    function lineFlat(label, row){
      const base = Math.floor(row.base||0);
      const plus = Math.floor(row.flat||0);
      return `<div style="margin-bottom:4px;">${label}：<strong>${base}</strong>${plus? ` <span style=\"color:#5af;\">(+${plus} SP)</span>`:""}</div>`;
    }
    function linePct(label, row){
      const basePct = (Number(row.base||0)*100).toFixed(2)+"%";
      const incPct  = (Number(row.bonus||0)*100).toFixed(2);
      return `<div style="margin-bottom:4px;">${label}：<strong>${basePct}</strong>${row.bonus? ` <span style=\"color:#5f9;\">(+${incPct}%)</span>`:""}</div>`;
    }

    let html = `<h4 style="margin:0 0 10px;">總能力</h4>`;
    // 四圍
    html += lineFlat("STR", t.str);
    html += lineFlat("AGI", t.agi);
    html += lineFlat("INT", t.int);
    html += lineFlat("LUK", t.luk);
    // 四大數值
    html += lineFlat("HP", t.hp);
    html += lineFlat("MP", t.mp);
    html += lineFlat("攻擊力", t.atk);
    html += lineFlat("防禦力", t.def);
    // ％類
    html += linePct("爆擊率", t.crit);
    html += linePct("爆擊傷害", t.critDmg);
    html += linePct("攻擊速度", t.aspd);
    html += linePct("經驗值", t.exp);
    html += linePct("掉落率", t.drop);
    html += linePct("金幣掉落率", t.gold);
  //  html += linePct("技能傷害", t.skillDamage);
    html += linePct("總傷害", t.totalDamage);
    html += linePct("回復提升", t.recover);
    html += linePct("穿透防禦力", t.ignoreDef);

    $totalStats.innerHTML = html;
  }

  function refreshInlineCP() {
    const el = document.getElementById("sp-cp-inline-val");
    if (!el) return;

    let cp = null;
    if (typeof w.getDisplayedCombatPower === "function") { try { cp = w.getDisplayedCombatPower(); } catch(_) {} }
    if (cp == null && typeof w.computeCombatPower === "function") { try { cp = w.computeCombatPower(); } catch(_) {} }
    if (cp == null) {
      const node =
        document.getElementById("cp-value") ||
        document.getElementById("combat-power") ||
        document.querySelector("[data-cp]") ||
        document.querySelector(".cp-value");
      if (node) {
        const num = String(node.textContent || "").replace(/[^\d]/g, "");
        if (num) cp = parseInt(num, 10);
      }
    }
    if (cp == null || isNaN(cp)) cp = 0;
    el.textContent = cp;
  }

  function render() {
    ["str","agi","int","luk","hp","mp","atk","def","crit","critDmg","aspd","exp","drop","gold","skillDamage","totalDamage","recover","ignoreDef"].forEach(key => {
      renderName(key);
      renderRow(key);
    });
    renderRemain();
    renderTotalStats();
    refreshInlineCP();
  }

  // 等 player 準備好再套用
  function applyWhenReady() {
    if (w.player && w.player.coreBonus) {
      applyToPlayer();
      renderTotalStats();
      refreshInlineCP();
    } else {
      setTimeout(applyWhenReady, 50);
    }
  }

  // ===== 初始化 =====
  function init() {
    loadLocal();
    ensureModal();
    applyWhenReady();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // 對外
  w.openSpModal = openSpModal;
  w.addSpPoints = addSpPoints;
  w.redeemSpPoints = redeemSpPoints;
  w.redeemSpPoints10 = redeemSpPoints10;     // ← 新增對外方法
  w.redeemSpPointsAll = redeemSpPointsAll;   // ← 新增對外方法

// 在 sp_system.js 內加入（若已加入可忽略）
window.getSpBaseAndFlat = function () {
  try { return computeTotalStats(); } catch (_) { return null; }
};
})(window);
