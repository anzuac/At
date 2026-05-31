// hub/collection_book.js v6.0 - UI 提升可讀性 + 新增硬幣交換
(function (global) {
  "use strict";

  // [CSS 樣式]
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slr-shine { 0% { background-position: -200%; } 100% { background-position: 200%; } }
    .slr-card { background: linear-gradient(110deg, #0f172a 30%, #4c1d95 45%, #0f172a 60%) !important; background-size: 200% 100% !important; animation: slr-shine 3s linear infinite; }
    /* 鎖定卡片：保留辨識度，避免太暗看不清 */
    .locked-card { filter: grayscale(0.9) brightness(0.65); opacity: 0.78; }
    @keyframes pot-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    .pot-rolling { animation: pot-blink 0.1s infinite; color: #fbbf24 !important; }
    .cb-container { display: flex; flex-direction: row; }
    #stats-scroll-area { max-height: 165px; overflow-y: auto; padding-right: 4px; }
    .grid-base { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; margin-bottom: 8px; }
    .grid-pot { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 5px !important; }
    .stat-row-center { background: rgba(255,255,255,0.03); border-radius: 8px; padding: 6px 2px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 45px; }
    .stat-label { font-size: 10px; color: #cbd5e1; opacity: 0.85; text-align: center; letter-spacing: 0.2px; }
    .stat-value { font-size: 12px; font-weight: 900; color: #ffffff; text-align: center; }
    .pot-value { color: #fbbf24; }
    .pot-line { height: 28px; line-height: 28px; font-size: 14px; font-weight: 900; }
    .tier-badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 900; margin-bottom: 4px; }
    .prob-info { font-size: 10px; color: #64748b; margin-bottom: 8px; }

    .cb-section-title { font-size: 14px; font-weight: 900; letter-spacing: 0.3px; }
    .cb-muted { color: #94a3b8; font-size: 12px; }
    .ex-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px; border-radius:16px; background: rgba(255,255,255,0.04); border:1px solid rgba(148,163,184,0.18); }
    .ex-left { display:flex; flex-direction:column; gap:4px; }
    .ex-actions { display:flex; gap:8px; flex-shrink:0; }
    .ex-btn { padding:10px 12px; border-radius:12px; border:1px solid #334155; background:#0b1220; color:#e2e8f0; cursor:pointer; font-weight:900; font-size:12px; }
    .ex-btn-primary { border-color:#e2e8f0; background:#ffffff; color:#000; }
    .ex-btn:disabled { opacity:0.45; cursor:not-allowed; }

    @media (max-width: 600px) { .cb-container { flex-direction: column !important; } .cb-sidebar { width: 100% !important; max-height: 220px !important; padding: 10px !important; border-bottom: 2px solid #1e293b; } }

    /* 簡易彈窗 */
    .cb-popup-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:999999; }
    .cb-popup{ width:min(320px, calc(100vw - 40px)); background:#0b1220; border:1px solid rgba(255,255,255,.12); border-radius:14px; box-shadow:0 18px 50px rgba(0,0,0,.45); padding:14px; }
    .cb-popup-title{ font-weight:900; font-size:14px; margin-bottom:8px; }
    .cb-popup-msg{ color:rgba(255,255,255,.85); line-height:1.5; font-size:13px; }
    .cb-popup-actions{ display:flex; justify-content:flex-end; gap:10px; margin-top:12px; }
    .cb-popup-btn{ border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.06); color:#fff; padding:8px 12px; border-radius:10px; font-weight:800; }
    .cb-popup-btn-primary{ background:rgba(59,130,246,.25); border-color:rgba(59,130,246,.45); }

  `;
  document.head.appendChild(style);

  // [基礎設定]
  const RARITIES = ["N", "R", "SR", "SSR", "UR", "LR", "SLR"];
  const EXCHANGE_TAB = "EXCHANGE";
  const NEXT_RARITY = { N:"R", R:"SR", SR:"SSR", SSR:"UR", UR:"LR", LR:"SLR", SLR:null };

  // 潛能機率池 (w 以 10000 為總數方便計算百分比)
  const POT_POOL = [
    { key: "allStatRate", label: "全屬性", suffix: "%", val: 1, w: 183 },
    { key: "strRate", label: "力量", suffix: "%", val: 1, w: 350 },
    { key: "agiRate", label: "敏捷", suffix: "%", val: 1, w: 350 },
    { key: "intRate", label: "智力", suffix: "%", val: 1, w: 350 },
    { key: "lukRate", label: "幸運", suffix: "%", val: 1, w: 350 },
    { key: "hpRate", label: "HP", suffix: "%", val: 3, w: 400 },
    { key: "mpRate", label: "MP", suffix: "%", val: 3, w: 400 },
    { key: "atkRate", label: "攻擊力", suffix: "%", val: 2, w: 199 },
    { key: "defRate", label: "防禦力", suffix: "%", val: 4, w: 188 },
    { key: "totalDamage", label: "總傷害", suffix: "%", val: 2, w: 150 },
    { key: "hpRegen", label: "HP恢復", suffix: "%", val: 0.2, w: 155 },
    { key: "mpRegen", label: "MP恢復", suffix: "%", val: 0.2, w: 122 }
  ];

  // 固定數值類 (平攤機率)
  const FIXED_STATS = [
    { key: "str", label: "力量", suffix: "", val: 5 },
    { key: "agi", label: "敏捷", suffix: "", val: 5 },
    { key: "int", label: "智力", suffix: "", val: 5 },
    { key: "luk", label: "幸運", suffix: "", val: 5 },
    { key: "atk", label: "攻擊力", suffix: "", val: 5 },
    { key: "def", label: "防禦力", suffix: "", val: 12 },
    { key: "hp", label: "生命值", suffix: "", val: 400 },
    { key: "mp", label: "魔力值", suffix: "", val: 40 }
  ];

  const TIER_UP_CHANCE = { R: 0.1, SR: 0.05, SSR: 0.02, UR: 0.01, LR: 0.002 };

  const RARITY_CONFIG = {
    N: { maxLevel: 5, perLevel: { allStat: 1, atk: 1, def: 1, hp: 20 } },
    R: { maxLevel: 15, perLevel: { allStat: 1.5, atk: 3, def: 2, hp: 50 } },
    SR: { maxLevel: 15, perLevel: { allStat: 2, atk: 3, def: 3, hp: 75 } },
    SSR: { maxLevel: 15, perLevel: { allStat: 4, atk: 4, def: 4, hp: 100 } },
    UR: { maxLevel: 20, perLevel: { allStat: 5, atk: 5, def: 4, hp: 100 } },
    LR: { maxLevel: 25, perLevel: { allStat: 6, atk: 6, def: 5, hp: 130 } },
    SLR: { maxLevel: 30, perLevel: { allStat: 8, atk: 10, def: 8, hp: 200 } }
  };

  const NS_KEY = "collectionBookV4_";
  let state = null, isRolling = false, modalEl = null, activeRarity = "N";

  // [核心邏輯]
  function getRandomPot(tier) {
    const totalRateW = POT_POOL.reduce((s, x) => s + x.w, 0);
    const roll = Math.random() * 10000; // 以萬分比計

    let selected = null;
    if (roll < totalRateW) {
      // 命中百分比類
      let curW = 0;
      for (const p of POT_POOL) {
        curW += p.w;
        if (roll <= curW) { selected = {...p}; break; }
      }
    } else {
      // 命中固定數值類 (平攤剩餘機率)
      selected = {...FIXED_STATS[Math.floor(Math.random() * FIXED_STATS.length)]};
    }

    // 數值翻倍邏輯：R為1倍, SR為2倍... 剛好對應 index
    selected.value = parseFloat((selected.val * tier).toFixed(2));
    return selected;
  }

  function computeTotalStats() {
    const base = { atk:0, hp:0, allStat:0, def:0 };
    const potList = [];
    RARITIES.forEach(r => {
      const d = state.rarities[r], cfg = RARITY_CONFIG[r];
      d.cards.forEach(c => {
        if (!c.unlocked) return;
        base.atk += cfg.perLevel.atk * c.level;
        base.hp += cfg.perLevel.hp * c.level;
        base.allStat += cfg.perLevel.allStat * c.level;
        base.def += (cfg.perLevel.def || 0) * c.level;
      });
      [d.potential.line1, d.potential.line2].forEach(l => {
        if (!l) return;
        const existing = potList.find(x => x.label === l.label && x.suffix === l.suffix);
        if (existing) { existing.value += l.value; }
        else { potList.push({ label: l.label, value: l.value, suffix: l.suffix }); }
      });
    });
    return { base, potList };
  }

  function applyToPlayer() {
    if (!global.player) return;
    const player = global.player;
    const s = computeTotalStats();

    // 1) 圖鑑「永久平坦能力」：一律寫入 coreBonus（不走潛能通道）
    if (player.coreBonus && player.coreBonus.bonusData) {
      player.coreBonus.bonusData.collectionBook = {
        atk: s.base.atk,
        hp: s.base.hp,
        mp: 0,
        def: s.base.def,
        str: s.base.allStat,
        agi: s.base.allStat,
        int: s.base.allStat,
        luk: s.base.allStat
      };
    }

    // 2) 圖鑑「潛能詞條」：走潛能專用通道（% 轉平坦 / 其他倍率原樣）
    if (!player.PotentialBonus || !player.PotentialBonus.bonusData) {
      if (global.recalcAllStats) global.recalcAllStats();
      return;
    }

    // 避免舊版 collectionBook 直接寫入造成重複加成
    delete player.PotentialBonus.bonusData.collectionBook;

    // 走「潛能專用」payload：只放潛能線（不包含圖鑑永久平坦能力）
    const payload = {};

    // %→平坦：用整數百分比（10 = 10%）
    const pct = {
      allStatPct: 0,
      strPct: 0,
      agiPct: 0,
      intPct: 0,
      lukPct: 0,
      hpPct: 0,
      mpPct: 0,
      atkPct: 0,
      defPct: 0
    };

    // 直接倍率（小數，0.1 = 10%）
    let totalDamageMul = 0;

    RARITIES.forEach(r => {
      [state.rarities[r].potential.line1, state.rarities[r].potential.line2, state.rarities[r].potential.line3].forEach(l => {
        if (!l) return;

        if (l.suffix === "%") {
          const v = (l.value || 0);
          if (l.key === "allStatRate") pct.allStatPct += v;
          else if (l.key === "strRate") pct.strPct += v;
          else if (l.key === "agiRate") pct.agiPct += v;
          else if (l.key === "intRate") pct.intPct += v;
          else if (l.key === "lukRate") pct.lukPct += v;
          else if (l.key === "hpRate") pct.hpPct += v;
          else if (l.key === "mpRate") pct.mpPct += v;
          else if (l.key === "atkRate") pct.atkPct += v;
          else if (l.key === "defRate") pct.defPct += v;
          else if (l.key === "totalDamage") totalDamageMul += v / 100;
          else payload[l.key] = (payload[l.key] || 0) + v; // 其他百分比（非提升基礎值）原樣保留
          return;
        }

        // 固定數值：直接加到對應欄位（走潛能通道）
        payload[l.key] = (payload[l.key] || 0) + (l.value || 0);
      });
    });

    // 合併 %→平坦鍵
    for (const k in pct) {
      if (!pct.hasOwnProperty(k)) continue;
      if (pct[k]) payload[k] = pct[k];
    }
    if (totalDamageMul) payload.totalDamage = (payload.totalDamage || 0) + totalDamageMul;

    // 使用 potential_engine（若存在）以 core-final 換算 %→平坦後寫入 PotentialBonus
    if (typeof global.registerPotentialBonus === "function" && typeof global.applyPotentialEngine === "function") {
      // 清除舊來源，避免 key 殘留
      if (!player._potentialSources) player._potentialSources = {};
      player._potentialSources.collectionBook = {};

      global.registerPotentialBonus(player, "collectionBook", payload);
      global.applyPotentialEngine(player);
    } else {
      // 後備：若未載入 potential_engine，至少不崩潰（注意：此情況下 xxxPct 不會轉成平坦）
      player.PotentialBonus.bonusData.collectionBook = payload;
    }

    if (global.recalcAllStats) global.recalcAllStats();
  }

  // [UI 相關]


  // 簡易彈窗（不足提示等）
  let popupEl = null;
  function showPopup(title, msg) {
    try {
      if (!modalEl) { global.alert ? global.alert(msg) : console.log(msg); return; }
      if (!popupEl) {
        popupEl = document.createElement("div");
        popupEl.className = "cb-popup-backdrop";
        popupEl.style.display = "none";
        popupEl.innerHTML = `
          <div class="cb-popup">
            <div class="cb-popup-title" id="cb-pop-title"></div>
            <div class="cb-popup-msg" id="cb-pop-msg"></div>
            <div class="cb-popup-actions">
              <button class="cb-popup-btn cb-popup-btn-primary" id="cb-pop-ok">OK</button>
            </div>
          </div>
        `;
        document.body.appendChild(popupEl);
        popupEl.addEventListener("click", (e) => { if (e.target === popupEl) hidePopup(); });
        popupEl.querySelector("#cb-pop-ok").onclick = hidePopup;
      }
      popupEl.querySelector("#cb-pop-title").textContent = title || "提示";
      popupEl.querySelector("#cb-pop-msg").textContent = msg || "";
      popupEl.style.display = "flex";
    } catch (e) {
      global.alert ? global.alert(msg) : console.log(msg);
    }
  }
  function hidePopup() { if (popupEl) popupEl.style.display = "none"; }

  function renderExchangeMain() {
    const container = modalEl.querySelector("#main-scroll");
    container.innerHTML = "";

    const title = document.createElement("div");
    title.style.cssText = "display:flex; flex-direction:column; gap:6px; align-items:flex-start; margin-bottom:14px;";
    title.innerHTML = `<div class="cb-section-title">硬幣交換</div>
      <div class="cb-muted">規則：低階硬幣 <b>×20</b> 可換高一階硬幣 <b>×1</b>（最高到 SLR）。</div>`;
    container.appendChild(title);

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex; flex-direction:column; gap:10px;";
    container.appendChild(wrap);

    RARITIES.forEach(r => {
      const next = NEXT_RARITY[r];
      if (!next) return;

      const have = getCoin(r);
      const times = Math.floor(have / 20);

      const row = document.createElement("div");
      row.className = "ex-row";

      row.innerHTML = `
        <div class="ex-left">
          <div style="font-weight:900; font-size:13px;">${r} → ${next}</div>
          <div class="cb-muted">持有：<b style="color:#fff;">${have}</b>　可交換：<b style="color:#fff;">${times}</b> 次</div>
        </div>
        <div class="ex-actions">
          <button class="ex-btn ex-btn-primary" data-act="one">交換 1 次</button>
          <button class="ex-btn" data-act="all">全部交換</button>
        </div>
      `;

      const oneBtn = row.querySelector('[data-act="one"]');
      const allBtn = row.querySelector('[data-act="all"]');

      function updateDisabled() {
        const h = getCoin(r);
        const t = Math.floor(h / 20);
        oneBtn.disabled = t < 1;
        allBtn.disabled = t < 1;
        row.querySelector('.ex-left .cb-muted').innerHTML =
          `持有：<b style="color:#fff;">${h}</b>　可交換：<b style="color:#fff;">${t}</b> 次`;
      }

      oneBtn.onclick = () => {
        if (!spendCoin(r, 20)) return;
        addCoin(next, 1);
        saveState(); // 讓存檔流程一致（雖然硬幣不在 state 內）
        refreshUI(); // 左側顯示也會更新
      };

      allBtn.onclick = () => {
        const h = getCoin(r);
        const t = Math.floor(h / 20);
        if (t <= 0) return;
        if (!spendCoin(r, t * 20)) return;
        addCoin(next, t);
        saveState();
        refreshUI();
      };

      // 初始狀態
      updateDisabled();
      wrap.appendChild(row);
    });

    const tip = document.createElement("div");
    tip.className = "cb-muted";
    tip.style.cssText = "margin-top:10px; line-height:1.5;";
    tip.innerHTML = "提示：交換只改變硬幣數量，不會影響你已解鎖或已升級的圖鑑進度。";
    container.appendChild(tip);
  }

function renderMain() {
    const container = modalEl.querySelector("#main-scroll");
    container.innerHTML = "";

    if (activeRarity === EXCHANGE_TAB) {
      renderExchangeMain();
      return;
    }

    const rarity = activeRarity, data = state.rarities[rarity], theme = THEME[rarity];

    const header = document.createElement("div"); header.style.cssText = "display:flex; flex-direction:column; align-items:center; margin-bottom:15px;";
    header.innerHTML = `<div style="font-size:18px; font-weight:900;">${rarity} CLASS</div><div style="font-size:11px; color:${theme.color};">持有硬幣: ${getCoin(rarity)}</div>`;

    const batchBtn = document.createElement("button"); batchBtn.textContent = "⚡ 一鍵升級本階";
    Object.assign(batchBtn.style, { marginTop:"8px", padding: "8px 20px", borderRadius: "10px", background: theme.color, border: "none", color: "#000", cursor: "pointer", fontSize: "12px", fontWeight: "900" });
    batchBtn.onclick = () => { data.cards.forEach(c => { if(c.unlocked) { while(c.level < RARITY_CONFIG[rarity].maxLevel && spendCoin(rarity, (c.level+1)*5)) { c.level++; } } }); saveState(); refreshUI(); applyToPlayer(); };
    header.appendChild(batchBtn); container.appendChild(header);

    if(rarity !== "N") {
      const lv15Count = data.cards.filter(c => c.unlocked && c.level >= 15).length;
      const isUnlocked = lv15Count >= 2;

      const potBox = document.createElement("div"); potBox.style.cssText = `background:${theme.bg}; border:1px solid ${theme.border}66; border-radius:20px; padding:15px; margin-bottom:20px; text-align:center; position:relative;`;

      if(!isUnlocked) {
        potBox.innerHTML = `<div style="opacity:0.4; font-size:12px; height:80px; display:flex; flex-direction:column; align-items:center; justify-content:center;"><div>🔒 需 2 隻 Lv.15 開放洗鍊</div><div style="font-size:10px; margin-top:5px;">進度: ${lv15Count} / 2</div></div>`;
      } else {
        const currentTierName = RARITIES[data.potential.tier];
        const tierColor = THEME[currentTierName]?.color || "#fff";
        const maxTierIdx = RARITIES.indexOf(rarity);
        const isMaxTier = data.potential.tier >= maxTierIdx;
        const nextProb = TIER_UP_CHANCE[currentTierName] ? (TIER_UP_CHANCE[currentTierName] * 100).toFixed(2) + "%" : "0%";

        potBox.innerHTML = `
          <div class="tier-badge" style="background:${tierColor}22; color:${tierColor}; border:1px solid ${tierColor}44;">POTENTIAL ${currentTierName}</div>
          <div class="prob-info">${isMaxTier ? "⭐ 已達階段上限" : "下一階機率: " + nextProb}</div>
          <div id="pot-disp" style="margin-bottom:12px; min-height:60px; display:flex; flex-direction:column; justify-content:center;">
            <div class="pot-line">1️⃣ ${data.potential.line1 ? data.potential.line1.label+"+"+data.potential.line1.value+data.potential.line1.suffix : "---"}</div>
            <div class="pot-line" style="opacity:0.7;">2️⃣ ${data.potential.line2 ? data.potential.line2.label+"+"+data.potential.line2.value+data.potential.line2.suffix : "---"}</div>
            <div class="pot-line" style="opacity:0.7;">3️⃣ ${data.potential.line3 ? data.potential.line3.label+"+"+data.potential.line3.value+data.potential.line3.suffix : "---"}</div>
          </div>
          <button id="roll-pot" style="background:#fff; color:#000; border:none; padding:10px 35px; border-radius:12px; font-weight:900; cursor:pointer;">洗 鍊 (20)</button>
        `;

        potBox.querySelector("#roll-pot").onclick = () => {
          if(isRolling || !spendCoin(rarity, 20)) return;
          isRolling = true;
          const disp = potBox.querySelector("#pot-disp");
          disp.classList.add("pot-rolling");

          setTimeout(() => {
            // 判定升階
            const upChance = TIER_UP_CHANCE[currentTierName] || 0;
            if(!isMaxTier && Math.random() < upChance) {
              data.potential.tier++;
            }
            // 重新抽取潛能：第一條當前 Tier，第二條 Tier-1
            data.potential.line1 = getRandomPot(data.potential.tier);
            data.potential.line2 = getRandomPot(Math.max(1, data.potential.tier - 1));
            data.potential.line3 = getRandomPot(Math.max(1, data.potential.tier - 1));

            isRolling = false; saveState(); refreshUI(); applyToPlayer();
          }, 500);
        };
      }
      container.appendChild(potBox);
    }

    const grid = document.createElement("div"); grid.style.cssText = "display:grid; grid-template-columns:1fr; gap:12px;";
    if (window.innerWidth > 600) grid.style.gridTemplateColumns = "1fr 1fr";
    data.cards.forEach(c => {
      const isMax = c.unlocked && c.level >= RARITY_CONFIG[rarity].maxLevel;
      const el = document.createElement("div"); el.className = "card-item " + (c.unlocked ? "" : "locked-card") + (rarity === "SLR" ? " slr-card" : "");
      el.style.cssText = `background:#0f172a; border-radius:20px; padding:15px; border:1px solid ${isMax?theme.color:'#1e293b'}; text-align:center;`;
      el.innerHTML = `<div style="margin-bottom:8px; position:relative;">${!c.unlocked ? `<div style="position:absolute; top:-6px; left:50%; transform:translateX(-50%); padding:3px 10px; border-radius:999px; background:rgba(0,0,0,0.35); border:1px solid rgba(148,163,184,0.25); font-size:10px; font-weight:900; color:#e2e8f0;">未解鎖</div>` : ``}<b style="font-size:15px; display:block;">${c.name}</b><div style="color:${theme.color}; font-size:11px; font-weight:900;">Lv.${c.level}</div></div><div style="width:100%; height:5px; background:#020617; border-radius:3px; overflow:hidden; margin-bottom:12px;"><div style="width:${(c.level/RARITY_CONFIG[rarity].maxLevel)*100}%; height:100%; background:linear-gradient(90deg, ${theme.color}, #fff); transition: width 0.3s;"></div></div>`;
      let btn = document.createElement("button");
      if(!c.unlocked){ btn.textContent = "解 鎖 (1)"; Object.assign(btn.style, btnStyle(theme.color, true)); btn.onclick = () => { if(spendCoin(rarity,1)){ c.unlocked=true; saveState(); refreshUI(); applyToPlayer(); } }; }
      else if(!isMax){ btn.textContent = `升 級 (${(c.level+1)*5})`; Object.assign(btn.style, btnStyle("#1e293b", false)); btn.onclick = () => { if(spendCoin(rarity, (c.level+1)*5)){ c.level++; saveState(); refreshUI(); applyToPlayer(); } }; }
      else { btn = document.createElement("div"); btn.innerHTML = "<div style='font-size:11px; color:"+theme.color+"; font-weight:900; border:1px solid "+theme.color+"44; border-radius:8px; padding:4px;'>MAX</div>"; }
      el.appendChild(btn); grid.appendChild(el);
    });
    container.appendChild(grid);
  }

  // 其他輔助函數維持原樣
  const COIN_NAME = { N: "怪物硬幣N", R: "怪物硬幣R", SR: "怪物硬幣SR", SSR: "怪物硬幣SSR", UR: "怪物硬幣UR", LR: "怪物硬幣LR", SLR: "怪物硬幣SLR" };
  const THEME = { N: { color: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "#475569" }, R: { color: "#3b82f6", bg: "rgba(59,130,246,0.1)", border: "#2563eb" }, SR: { color: "#a855f7", bg: "rgba(168,85,247,0.1)", border: "#7e22ce" }, SSR: { color: "#eab308", bg: "rgba(234,179,8,0.1)", border: "#ca8a04" }, UR: { color: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "#dc2626" }, LR: { color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "#059669" }, SLR: { color: "#f472b6", bg: "rgba(244,114,182,0.1)", border: "#db2777" } };
  function getCoin(r) { return Number(global.getItemQuantity ? global.getItemQuantity(COIN_NAME[r]) : 0); }
  function spendCoin(r, a) { if (getCoin(r) < a) { showPopup("數量不夠", "你的「"+r+"」硬幣不足以進行交換。"); return false; } if (global.removeItem) global.removeItem(COIN_NAME[r], a); return true; }
  function addCoin(r, a) {
    if (!a) return;
    const name = COIN_NAME[r];
    if (global.addItem) global.addItem(name, a);
    else if (global.gainItem) global.gainItem(name, a);
    else if (global.addItemQuantity) global.addItemQuantity(name, a);
    else if (global.addToInventory) global.addToInventory(name, a);
    else console.warn("[CollectionBook] 找不到 addItem/gainItem 之類的方法，無法發放：", name, a);
  }
  function refreshUI() { if(!modalEl) return; const sc = modalEl.querySelector("#main-scroll"); const cp = sc.scrollTop; renderStats(); renderMain(); requestAnimationFrame(() => { sc.scrollTop = cp; }); }
  function btnStyle(c, o) { return { width:"100%", padding:"10px", borderRadius:"12px", border:"1px solid "+c, background:o?"transparent":c, color:o?c:"#fff", cursor:"pointer", fontWeight:"900", fontSize:"13px" }; }

  function loadState() {
    const NAMES = {
      N: ["綠水靈","藍水靈","小螃蟹","蘑菇寶寶","小蝸蝸","水靈"],
      R: ["黃水靈","火焰螃蟹","岩石史萊姆","黑色史萊姆","青菇寶寶"],
      SR: ["烈焰精靈","冰霜精靈","暴走螃蟹","暗影蝸牛","黃金菇菇"],
      SSR: ["赤紅龍幼體","冰晶龍幼體","深淵史萊姆王","詛咒騎士","暴風魔眼"],
      UR: ["深淵領主","墮落天使","雷霆巨龍","虛空螃蟹王","時空魔導"],
      LR: ["黑曜龍王","天焰主宰","混沌魔神","古代守護者","審判之眼"],
      SLR: ["終焉之龍","創世天使","永劫魔神","命運織者","虛無之王"]
    };
    const def = { rarities: {} };
    RARITIES.forEach(r => { def.rarities[r] = { cards: NAMES[r].map(n => ({ name: n, unlocked: false, level: 0 })), potential: { tier: 1, line1: null, line2: null, line3: null } }; });
    state = global.SaveHub ? global.SaveHub.getOrInit(NS_KEY, def) : def;
    RARITIES.forEach(r => {
      const currentCards = state.rarities[r].cards;
      const currentNames = currentCards.map(c => c.name);
      NAMES[r].forEach(name => { if (!currentNames.includes(name)) currentCards.push({ name, unlocked: false, level: 0 }); });
    });
  }

  function saveState() { if (global.SaveHub) global.SaveHub.set(NS_KEY, state, { replace: true }); }

  function openModal(r) {
    loadState(); if (r) activeRarity = r;
    const bd = document.createElement("div"); bd.id = "cb-backdrop";
    Object.assign(bd.style, { position: "fixed", inset: "0", background: "rgba(0,0,0,0.85)", zIndex: "9997", backdropFilter: "blur(8px)" });
    modalEl = document.createElement("div"); modalEl.className = "cb-container";
    Object.assign(modalEl.style, { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "#020617", color: "#f8fafc", borderRadius: "28px", border: "1px solid #1e293b", width: "95%", maxWidth: "850px", height: "85vh", zIndex: "9998", overflow: "hidden" });
    modalEl.innerHTML = `<div class="cb-sidebar" style="width:220px; background:#0b1220; border-right:2px solid #1e293b; padding:15px; display:flex; flex-direction:column; gap:10px; flex-shrink:0;"><div style="font-size:12px; font-weight:900; color:#e2e8f0; text-align:center; letter-spacing:0.6px;">TOTAL STATS</div><div style="font-size:10px; color:#94a3b8; text-align:center; margin-top:-6px;">（右側可切換階級／交換）</div><div id="stats-scroll-area"><div id="stats-panel"></div></div><button id="close-cb" style="margin-top:auto; width:100%; padding:8px; border-radius:10px; background:#1e293b; border:none; color:#94a3b8; cursor:pointer; font-size:12px; font-weight:bold;">關 閉</button></div><div style="flex:1; display:flex; flex-direction:column; overflow:hidden;"><div id="tab-row" style="display:flex; padding:12px 12px 10px; gap:8px; background:#020617; border-bottom:1px solid #1e293b; overflow-x:auto; -webkit-overflow-scrolling:touch;"></div><div id="main-scroll" style="flex:1; overflow-y:auto; padding:15px; -webkit-overflow-scrolling:touch;"></div></div>`;
    document.body.append(bd, modalEl);
    bd.onclick = () => { bd.remove(); modalEl.remove(); modalEl = null; };
    modalEl.querySelector("#close-cb").onclick = () => bd.onclick();
    renderTabs(); renderStats(); renderMain();
  }

  function renderStats() {
    const s = computeTotalStats(); const panel = modalEl.querySelector("#stats-panel");
    panel.innerHTML = "";
    const bG = document.createElement("div"); bG.className = "grid-base";
    bG.innerHTML = `<div class="stat-row-center"><span class="stat-label">攻擊</span><span class="stat-value">+${s.base.atk}</span></div><div class="stat-row-center"><span class="stat-label">生命</span><span class="stat-value">+${s.base.hp}</span></div><div class="stat-row-center"><span class="stat-label">全能</span><span class="stat-value">+${s.base.allStat}</span></div>`;
    const pG = document.createElement("div"); pG.className = "grid-pot";
    s.potList.sort((a,b) => b.value - a.value).forEach(p => {
      pG.innerHTML += `<div class="stat-row-center"><span class="stat-label">${p.label}</span><span class="stat-value pot-value">+${p.value.toFixed(1)}${p.suffix}</span></div>`;
    });
    panel.append(bG, pG);
  }

  function renderTabs() {
    const row = modalEl.querySelector("#tab-row"); row.innerHTML = "";

    function makeBtn(label, isActive, borderColor, bgColor, textColor, onClick) {
      const btn = document.createElement("button");
      btn.textContent = label;
      Object.assign(btn.style, {
        padding: "7px 16px",
        borderRadius: "14px",
        border: "1px solid " + borderColor,
        background: bgColor,
        color: textColor,
        cursor: "pointer",
        fontWeight: "900",
        flexShrink: "0"
      });
      btn.onclick = onClick;
      return btn;
    }

    // 稀有度頁籤
    RARITIES.forEach(r => {
      const active = activeRarity === r;
      const btn = makeBtn(
        r,
        active,
        active ? THEME[r].border : "#1e293b",
        active ? THEME[r].border : "#0f172a",
        active ? "#fff" : "#94a3b8",
        () => { activeRarity = r; renderTabs(); renderMain(); }
      );
      row.appendChild(btn);
    });

    // 交換頁籤
    const exActive = activeRarity === EXCHANGE_TAB;
    const exBtn = makeBtn(
      "交換",
      exActive,
      exActive ? "#e2e8f0" : "#1e293b",
      exActive ? "#ffffff" : "#0f172a",
      exActive ? "#000" : "#e2e8f0",
      () => { activeRarity = EXCHANGE_TAB; renderTabs(); renderMain(); }
    );
    row.appendChild(exBtn);
  }

  loadState(); applyToPlayer();
  global.CollectionBook = { open: openModal };
})(window);
