// bank_savings_tab.js — 特殊銀行（v4.1：即時更新、VIP 動態 + 彩虹閃爍、VIP 代幣加成門檻）
// 依賴：save_hub_es2020.js、town_hub.js、player.js（gold/gem）與背包 API（getItemQuantity/addItem/removeItem）
(function (w) {
  "use strict";

  if (!w.TownHub) { console.error("❌ bank_savings_tab.js: TownHub 未載入"); return; }
  if (!w.SaveHub) { console.error("❌ bank_savings_tab.js: SaveHub 未載入"); return; }

  // ====== 常數 / 設定 ======
  const NS = "bank:savings";
  const TAB_ID = "bankSaving";
  const TAB_TITLE = "特殊銀行";

  // 物品鍵值（背包）
  const KEY_STONE = "強化道具兌換券";
  const KEY_ADV_TOKEN = "高級代幣";
  const KEY_BANK_TOKEN = "銀行代幣";

  // 等級上限
  const MAX_LV = 20;

  // 容量（Lv1=100萬/100萬；每升級 ×2）
  const BASE_GOLD_CAP  = 1000000;
  const BASE_STONE_CAP = 1000000;

  // 代幣生產規則（每 18 小時一個「期」）
  // 基礎門檻顆數：10萬 / 200萬 / 300萬 / 400萬 / 500萬 / 600萬（最多 6 顆）
  // VIP 額外加成門檻：
  //  - 白金 VIP：金幣 ≥ 1,000 萬 → 額外 +2 顆/期
  //  - 彩虹 VIP：金幣 ≥ 1 億     → 再額外 +2 顆/期
  const TOKEN_THRESHOLDS = [100000, 2000000, 3000000, 4000000, 5000000, 6000000];
  const VIP_EXTRA_TOKEN_RULES = [
    { tierMin: 2, goldGte: 10_000_000, extra: 2 },   // 白金
    { tierMin: 4, goldGte:100_000_000, extra: 2 },   // 彩虹
  ];
  const TOKEN_PERIOD_SEC = 18 * 3600;

  // 利息（日利率）：金幣 0.0025%；強化道具兌換券 ×2
  const DAILY_INTEREST_GOLD  = 0.000025;
  const DAILY_INTEREST_STONE = 0.00001;
  const SEC_PER_DAY = 86400;

  // 升級消耗：成本 = 目前等級（以「銀行代幣」）
  function levelUpCost(curLv) { return Math.max(1, curLv); }

  // 背包 API 檢查
  const HAS_INV = (typeof w.getItemQuantity === "function" &&
                 typeof w.removeItem === "function" &&
                 typeof w.addItem === "function");

  // ===== VIP（Lv.20 解鎖；僅金幣/鑽石贊助；沒有代幣贊助）=====
  // bonus 為「對日利率」的額外加成
  const VIP_TIERS = [
    { id:0, name:'普通會員', needGold:0,            needGem:0,        bonus:0,        frame:'#334155', inner:'#111827' },
    { id:1, name:'黃金VIP', needGold:10_000_000,    needGem:10_000,   bonus:0.000005, frame:'#facc15', inner:'#1f2937' },
    { id:2, name:'白金VIP', needGold:100_000_000,   needGem:100_000,  bonus:0.000000, frame:'#e5e7eb', inner:'#1f2937' },
    { id:3, name:'柏金VIP', needGold:1_000_000_000, needGem:500_000,  bonus:0.000005, frame:'#c0a060', inner:'#0b1220' },
    { id:4, name:'彩虹VIP', needGold:10_000_000_000,needGem:3_000_000,bonus:0.000010, frame:'RAINBOW', inner:'#0b1220' },
  ];

  // ====== SaveHub 狀態（_ver=4）======
  function loadState() {
    const now = Date.now();
    let s = w.SaveHub.get(NS, null);
    if (!s || !s._ver) {
      s = {
        _ver: 4,
        lv: 1,
        gold: 0,
        stone: 0,
        tokenProg: 0,
        interestGoldBuf: 0,
        interestStoneBuf: 0,
        lastTs: now,
        autoReinvestGold: false,
        autoReinvestStone: false,
        stats: { totalGoldInterest:0, totalStoneInterest:0, totalTokens:0, maxGoldHeld:0, maxStoneHeld:0 },
        vip: { unlocked:false, tier:0, donatedGold:0, donatedGem:0 }
      };
      w.SaveHub.set(NS, s, { replace: true });
      return s;
    }
    if (!s.vip) {
      s.vip = { unlocked:false, tier:0, donatedGold:0, donatedGem:0 };
      s._ver = 4;
      w.SaveHub.set(NS, s, { replace: true });
    }
    // 正常化
    s.lv  = Math.max(1, Math.min(MAX_LV, Number(s.lv || 1)));
    s.gold  = Math.max(0, Number(s.gold || 0));
    s.stone = Math.max(0, Number(s.stone || 0));
    s.tokenProg = Math.max(0, Number(s.tokenProg || 0));
    s.interestGoldBuf  = Math.max(0, Number(s.interestGoldBuf || 0));
    s.interestStoneBuf = Math.max(0, Number(s.interestStoneBuf || 0));
    s.lastTs = Number(s.lastTs || now);
    s.autoReinvestGold  = !!s.autoReinvestGold;
    s.autoReinvestStone = !!s.autoReinvestStone;
    s.stats = s.stats || { totalGoldInterest:0, totalStoneInterest:0, totalTokens:0, maxGoldHeld:0, maxStoneHeld:0 };
    s.vip = s.vip || { unlocked:false, tier:0, donatedGold:0, donatedGem:0 };
    return s;
  }
  function saveState(next, replace) { w.SaveHub.set(NS, next, { replace: !!replace }); }
  const state = loadState();

  // ====== 衍生參數（由等級決定）======
  function deriveByLevel(lv) {
    const mul = Math.pow(2, Math.max(0, lv - 1)); // ×2 成長
    return {
      capGold:  Math.floor(BASE_GOLD_CAP  * mul),
      capStone: Math.floor(BASE_STONE_CAP * mul)
    };
  }

  // ====== 工具：玩家/背包 ======
  function playerGold() { return Math.max(0, Number(w.player?.gold || 0)); }
  function setPlayerGold(v){ if (w.player){ w.player.gold = Math.max(0, Math.floor(v)); if (typeof w.updateResourceUI === "function") w.updateResourceUI(); } }
  function playerGem(){ return Math.max(0, Number(w.player?.gem || 0)); }
  function setPlayerGem(v){ if (w.player){ w.player.gem = Math.max(0, Math.floor(v)); if (typeof w.updateResourceUI === "function") w.updateResourceUI(); } }
  function invQty(name){ if (!HAS_INV) return 0; try { return Math.max(0, Number(w.getItemQuantity(name) || 0)); } catch(_) { return 0; } }
  function addItem(name, n){ if (HAS_INV) w.addItem(name, Math.max(0, Math.floor(n))); }
  function removeItem(name, n){ if (HAS_INV) w.removeItem(name, Math.max(0, Math.floor(n))); }

  // ===== VIP 相關 =====
  function vipBonusRate(){
    const t = state.vip?.tier || 0;
    const def = VIP_TIERS[t] || VIP_TIERS[0];
    return Number(def.bonus||0);
  }
  function vipNextTier(){ const cur = state.vip?.tier || 0; return VIP_TIERS[cur+1] || null; }
  function canUpgradeVip(nxt){
    if (!nxt) return false;
    if (!state.vip.unlocked) return false;
    return (state.vip.donatedGold >= nxt.needGold) && (state.vip.donatedGem >= nxt.needGem);
  }
  function donateGoldVIP(amount){
    if (!state.vip.unlocked) return alert('需 Lv.20 才能贊助');
    amount = Math.max(1, Math.floor(Number(amount)||0));
    if (playerGold() < amount) return alert('金幣不足');
    setPlayerGold(playerGold() - amount);
    state.vip.donatedGold += amount;
    saveState(state, true);
    refreshActive(); // 即時更新 VIP 進度
  }
  function donateGemVIP(amount){
    if (!state.vip.unlocked) return alert('需 Lv.20 才能贊助');
    amount = Math.max(1, Math.floor(Number(amount)||0));
    if (playerGem() < amount) return alert('鑽石不足');
    setPlayerGem(playerGem() - amount);
    state.vip.donatedGem += amount;
    saveState(state, true);
    refreshActive();
  }
  function upgradeVip(){
    const nxt = vipNextTier();
    if (!canUpgradeVip(nxt)) return;
    state.vip.tier = nxt.id;
    saveState(state, true);
    if (w.logPrepend) w.logPrepend('✨ VIP 提升至【'+nxt.name+'】！');
    refreshActive();
  }

  // ====== 每期可生產顆數（基礎 + VIP 額外）======
  function tokensPerPeriodByGold(goldNow) {
    let cnt = 0;
    for (let i=0;i<TOKEN_THRESHOLDS.length;i++){
      if (goldNow >= TOKEN_THRESHOLDS[i]) cnt++;
    }
    // VIP 額外規則
    const tier = state.vip?.tier || 0;
    for (let j=0;j<VIP_EXTRA_TOKEN_RULES.length;j++){
      const r = VIP_EXTRA_TOKEN_RULES[j];
      if (tier >= r.tierMin && goldNow >= r.goldGte) cnt += r.extra;
    }
    return Math.max(0, cnt);
  }

  // ====== 結算（每秒）======
  function settle(elapsedSec) {
    if (!(elapsedSec > 0)) return;

    const d = deriveByLevel(state.lv);

    // 代幣進度（連續）
    const perPeriod = tokensPerPeriodByGold(state.gold); // 基礎 + VIP 額外
    const perSec = (perPeriod > 0) ? (perPeriod / TOKEN_PERIOD_SEC) : 0; // 每秒顆數
    state.tokenProg += perSec * elapsedSec;

    // 利息累積（含 VIP 加成）
    const goldRate = DAILY_INTEREST_GOLD + vipBonusRate();
    const stoneRate = DAILY_INTEREST_STONE + vipBonusRate();

    if (state.gold > 0) {
      const goldPerSec = state.gold * (goldRate / SEC_PER_DAY);
      state.interestGoldBuf += goldPerSec * elapsedSec;
    }
    if (state.stone > 0) {
      const stonePerSec = state.stone * (stoneRate / SEC_PER_DAY);
      state.interestStoneBuf += stonePerSec * elapsedSec;
    }

    // 自動再投資（整數部分）
    if (state.autoReinvestGold) {
      const gainG = Math.floor(Math.max(0, state.interestGoldBuf || 0));
      if (gainG > 0) {
        const capLeftG = Math.max(0, d.capGold - state.gold);
        const putG = Math.min(gainG, capLeftG);
        if (putG > 0) {
          state.interestGoldBuf -= putG;
          state.gold += putG;
          state.stats.totalGoldInterest += putG;
          if (state.gold > state.stats.maxGoldHeld) state.stats.maxGoldHeld = state.gold;
        }
      }
    }
    if (state.autoReinvestStone) {
      const gainS = Math.floor(Math.max(0, state.interestStoneBuf || 0));
      if (gainS > 0) {
        const capLeftS = Math.max(0, d.capStone - state.stone);
        const putS = Math.min(gainS, capLeftS);
        if (putS > 0) {
          state.interestStoneBuf -= putS;
          state.stone += putS;
          state.stats.totalStoneInterest += putS;
          if (state.stone > state.stats.maxStoneHeld) state.stats.maxStoneHeld = state.stone;
        }
      }
    }

    // Lv20 自動解鎖 VIP（只解鎖，不自動升級）
    if (state.lv >= 20 && !state.vip.unlocked) {
      state.vip.unlocked = true;
      if (w.logPrepend) w.logPrepend('🎉 已解鎖 VIP 系統（可於下方累積贊助升級）');
    }

    // 時間戳
    state.lastTs += elapsedSec * 1000;
    saveState(state, true);
  }

  function settleToNow() {
    const now = Date.now();
    const dtSec = Math.max(0, Math.floor((now - (state.lastTs || now)) / 1000));
    if (dtSec > 0) settle(dtSec);
  }

  // ====== 即時刷新（避免整頁重繪，輸入不跳；所有動作都調用）======
  function refreshActive(){
    const body = document.getElementById('townHubBody');
    if (!body) return;
    if (String(body.getAttribute('data-tab-owner')||'') !== TAB_ID) return;
    updateDynamic(body);
  }

  // ====== 存入 / 提領 ======
  function depositGold(amount){
    settleToNow();
    amount = Math.max(1, Math.floor(Number(amount)||0));
    const d = deriveByLevel(state.lv);
    const can = Math.min(amount, playerGold(), Math.max(0, d.capGold - state.gold));
    if (can <= 0) { alert("無法存入：可能超過上限或金幣不足"); return; }
    setPlayerGold(playerGold() - can);
    state.gold += can;
    if (state.gold > state.stats.maxGoldHeld) state.stats.maxGoldHeld = state.gold;
    saveState(state, true);
    if (w.logPrepend) w.logPrepend("🏦 存入金幣 " + can);
    refreshActive();
  }
  function withdrawGold(amount){
    settleToNow();
    amount = Math.max(1, Math.floor(Number(amount)||0));
    const can = Math.min(amount, state.gold);
    if (can <= 0) { alert("無法領取：銀行存金不足"); return; }
    state.gold -= can;
    setPlayerGold(playerGold() + can);
    saveState(state, true);
    if (w.logPrepend) w.logPrepend("🏦 提領金幣 " + can);
    refreshActive();
  }
  function depositStone(amount){
    if (!HAS_INV){ alert("缺少背包介面"); return; }
    settleToNow();
    amount = Math.max(1, Math.floor(Number(amount)||0));
    const d = deriveByLevel(state.lv);
    const have = invQty(KEY_STONE);
    const can = Math.min(amount, have, Math.max(0, d.capStone - state.stone));
    if (can <= 0) { alert("無法存入：可能超過上限或庫存不足"); return; }
    removeItem(KEY_STONE, can);
    state.stone += can;
    if (state.stone > state.stats.maxStoneHeld) state.stats.maxStoneHeld = state.stone;
    saveState(state, true);
    if (w.logPrepend) w.logPrepend("🏦 存入強化道具兌換券 " + can);
    refreshActive();
  }
  function withdrawStone(amount){
    if (!HAS_INV){ alert("缺少背包介面"); return; }
    settleToNow();
    amount = Math.max(1, Math.floor(Number(amount)||0));
    const can = Math.min(amount, state.stone);
    if (can <= 0) { alert("無法領取：銀行存石不足"); return; }
    state.stone -= can;
    addItem(KEY_STONE, can);
    saveState(state, true);
    if (w.logPrepend) w.logPrepend("🏦 提領強化道具兌換券 " + can);
    refreshActive();
  }

  // ====== 領取利息 / 領取代幣 ======
  function claimInterestGold(){
    settleToNow();
    const gain = Math.floor(Math.max(0, state.interestGoldBuf || 0));
    if (gain <= 0) { alert("目前沒有可領取的金幣利息"); return; }

    if (state.autoReinvestGold) {
      const d = deriveByLevel(state.lv);
      const capLeft = Math.max(0, d.capGold - state.gold);
      const put = Math.min(gain, capLeft);
      if (put > 0) {
        state.interestGoldBuf -= put;
        state.gold += put;
        state.stats.totalGoldInterest += put;
        if (state.gold > state.stats.maxGoldHeld) state.stats.maxGoldHeld = state.gold;
        saveState(state, true);
        if (w.logPrepend) w.logPrepend("🔁 金幣利息自動再投資 +" + put);
        refreshActive();
      } else {
        alert("容量已滿，無法再投資。請先提高等級或提領。");
      }
      return;
    }

    state.interestGoldBuf -= gain;
    setPlayerGold(playerGold() + gain);
    state.stats.totalGoldInterest += gain;
    saveState(state, true);
    if (w.logPrepend) w.logPrepend("💰 領取利息（金幣）+" + gain);
    refreshActive();
  }
  function claimInterestStone(){
    if (!HAS_INV){ alert("缺少背包介面"); return; }
    settleToNow();
    const gain = Math.floor(Math.max(0, state.interestStoneBuf || 0));
    if (gain <= 0) { alert("目前沒有可領取的強化道具兌換券利息"); return; }

    if (state.autoReinvestStone) {
      const d = deriveByLevel(state.lv);
      const capLeft = Math.max(0, d.capStone - state.stone);
      const put = Math.min(gain, capLeft);
      if (put > 0) {
        state.interestStoneBuf -= put;
        state.stone += put;
        state.stats.totalStoneInterest += put;
        if (state.stone > state.stats.maxStoneHeld) state.stats.maxStoneHeld = state.stone;
        saveState(state, true);
        if (w.logPrepend) w.logPrepend("🔁 強化道具兌換券利息自動再投資 +" + put);
        refreshActive();
      } else {
        alert("容量已滿，無法再投資。請先提高等級或提領。");
      }
      return;
    }

    state.interestStoneBuf -= gain;
    addItem(KEY_STONE, gain);
    state.stats.totalStoneInterest += gain;
    saveState(state, true);
    if (w.logPrepend) w.logPrepend("💎 領取利息（強化道具兌換券）+" + gain);
    refreshActive();
  }
  function claimTokens(){
    if (!HAS_INV){ alert("缺少背包介面"); return; }
    settleToNow();
    const whole = Math.floor(state.tokenProg);
    if (whole <= 0) { alert("尚未生成可領取的代幣"); return; }
    state.tokenProg -= whole;
    addItem(KEY_ADV_TOKEN, whole);
    state.stats.totalTokens += whole;
    saveState(state, true);
    if (w.logPrepend) w.logPrepend("🎟️ 領取高級代幣 ×" + whole);
    refreshActive();
  }

  // ====== 利息預估工具（含 VIP 加成）======
  function dailyInterestGoldFor(amount){
    amount = Math.max(0, Number(amount)||0);
    return Math.floor(amount * (DAILY_INTEREST_GOLD + vipBonusRate()));
  }
  function dailyInterestStoneFor(amount){
    amount = Math.max(0, Number(amount)||0);
    return Math.floor(amount * (DAILY_INTEREST_STONE + vipBonusRate()));
  }

  // ====== UI 工具 ======
  function fmtNum(n){ n = Math.floor(Number(n)||0); return n.toLocaleString(); }
  function fmtTime(sec){
    sec = Math.max(0, Math.floor(sec||0));
    const d = Math.floor(sec/86400); sec -= d*86400;
    const h = Math.floor(sec/3600);  sec -= h*3600;
    const m = Math.floor(sec/60);    const s = sec - m*60;
    const hh = (h<10?"0":"")+h, mm=(m<10?"0":"")+m, ss=(s<10?"0":"")+s;
    return (d>0? (d+"d "):"") + hh+":"+mm+":"+ss;
  }

  // —— Style（彩虹 VIP 閃爍外框）一次性注入 —— //
  let _styleInjected = false;
  function ensureVipStyle(){
    if (_styleInjected) return;
    _styleInjected = true;
    const css = document.createElement('style');
    css.textContent =
      "@keyframes vipPulse{0%{box-shadow:0 0 0px rgba(255,255,255,0.25)}50%{box-shadow:0 0 16px rgba(255,255,255,0.55)}100%{box-shadow:0 0 0px rgba(255,255,255,0.25)}}" +
      ".vip-rainbow{border-image: linear-gradient(90deg, red, orange, yellow, green, blue, indigo, violet) 1; animation: vipPulse 1.8s ease-in-out infinite;}";
    document.head.appendChild(css);
  }

  // —— 輸入穩定：重繪前快照焦點與值，重繪後還原 —— //
  function snapshotFocus(container){
    const a = document.activeElement;
    if (!a || !container.contains(a) || a.tagName!=="INPUT") return null;
    return { bind: a.getAttribute("data-bind") || null, value: a.value, selStart: a.selectionStart, selEnd: a.selectionEnd };
  }
  function restoreFocus(container, snap){
    if (!snap || !snap.bind) return;
    const input = container.querySelector('input[data-bind="'+snap.bind+'"]');
    if (!input) return;
    input.value = snap.value;
    input.focus();
    try{ input.setSelectionRange(snap.selStart, snap.selEnd); }catch(_){}
  }

  // ====== UI（渲染）======
  function renderRules(root) {
    const card = document.createElement('div');
    card.style.cssText = "background:#0b1220;border:1px solid #263247;border-radius:12px;padding:12px;margin-bottom:10px";

    // 動態計算數值
    const goldThresholdsText = TOKEN_THRESHOLDS.map((v) =>{ return (v/10000).toFixed(0) + '萬'; }).join('/'); // 將門檻轉為 "10萬/200萬..."
    const periodHours = (TOKEN_PERIOD_SEC / 3600).toFixed(0); // 轉為小時
    const goldRatePct = (DAILY_INTEREST_GOLD * 100).toFixed(4); // 轉為百分比
    const stoneRatePct = (DAILY_INTEREST_STONE * 100).toFixed(4); // 轉為百分比

    card.innerHTML =
      "<div style='font-weight:800;margin-bottom:8px;color:#93c5fd;font-size:15px'>📜 銀行營運規章</div>" +
      "<div style='opacity:.9;line-height:1.7;font-size:13px'>" +
      "• <b>儲蓄上限：</b>等級上限為 Lv." + MAX_LV + "。初始容量各 100萬，隨等級翻倍增長。<br>" +
      "• <b>代幣產能：</b>每 " + periodHours + " 小時為一計算週期，依據存金量發放「高級代幣」。<br>" +
      "　- 基礎產量：存金達 " + goldThresholdsText + " 門檻，最高可獲得 " + TOKEN_THRESHOLDS.length + " 顆。<br>" +
      "　- VIP 加成：白金等級且存金滿 1,000萬 (+2)；彩虹等級且存金滿 1億 (再+2)。<br>" +
      "• <b>利息回報：</b>金幣日利率 " + goldRatePct + "%；強化道具兌換券日利率 " + stoneRatePct + "% 。<br>" +
      "• <b>設施升級：</b>需消耗「" + KEY_BANK_TOKEN + "」，成本等同於當前等級。<br>" +
      "• <b>VIP 系統：</b>銀行達 Lv.20 後開放。透過累積贊助金幣與鑽石提升 VIP 階級。" +
      "</div>";

    root.appendChild(card);
  }


  function renderHeader(root) {
    const card = document.createElement('div');
    card.style.cssText = "background:#0b1220;border:1px solid #1f2937;border-radius:12px;padding:12px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap";

    // 左側資訊區
    const left = document.createElement('div');
    const isMax = (state.lv >= MAX_LV); // 判斷是否滿級

    left.innerHTML =
      "<div style='font-weight:800;font-size:16px'>🏦 " + TAB_TITLE + "</div>" +
      "<div style='opacity:.9;margin-top:4px'>" +
        "等級：<b id='bankLv' style='color:#f59e0b'>Lv." + state.lv + "</b> " +
        "<span style='font-size:12px;opacity:.7'>(上限 " + MAX_LV + ")</span>" +
      "</div>";

    // 右側動作區
    const right = document.createElement('div');
    right.style.cssText = "display:flex;gap:8px;align-items:center";

    const upBtn = document.createElement('button');
    upBtn.id = "btnLevelUp";

    // 獲取升級所需消耗
    const cost = levelUpCost(state.lv);
    const hasToken = invQty(KEY_BANK_TOKEN); // 取得當前擁有的代幣數量

    // 設置按鈕文字與狀態
    if (isMax) {
      upBtn.textContent = "已達最高等級";
      upBtn.disabled = true;
    } else {
      upBtn.textContent = "設施升級 (消耗 " + cost + " 枚" + KEY_BANK_TOKEN + ")";
      // 額外檢查：如果代幣不足，按鈕變灰（但不禁用，讓玩家點擊後能跳提示）
      upBtn.disabled = false;
    }

    // 動態按鈕樣式優化
    const btnBg = isMax ? "#374151" : (hasToken >= cost ? "#f59e0b" : "#4b5563");
    upBtn.style.cssText = "background:" + btnBg + ";color:#0b1220;border:0;padding:8px 16px;border-radius:10px;cursor:" + (isMax ? "not-allowed" : "pointer") + ";font-weight:800;transition:all 0.2s";

    upBtn.onclick = function() {
      if (!isMax) tryLevelUp();
    };

    right.appendChild(upBtn);
    card.appendChild(left);
    card.appendChild(right);
    root.appendChild(card);
  }

  function renderVIP(root) {
    ensureVipStyle();

    const vip = state.vip || { unlocked: false, tier: 0 };
    const cur = VIP_TIERS[vip.tier] || VIP_TIERS[0];
    const next = VIP_TIERS[vip.tier + 1];

    const card = document.createElement('div');
    card.id = 'vipCard';

    // 邊框邏輯優化
    const borderCss = (cur.frame === 'RAINBOW')
      ? 'border:3px solid; border-image-slice:1;'
      : 'border:3px solid ' + cur.frame + ';';
    const extraClass = (cur.frame === 'RAINBOW') ? 'vip-rainbow' : '';

    card.className = extraClass;
    card.style.cssText = 'margin-bottom:12px;border-radius:16px;padding:16px;' + borderCss + 'background:' + cur.inner + ';box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:all 0.3s';

    // 標題與加成顯示
    card.innerHTML =
      "<div style='display:flex;justify-content:space-between;align-items:center'>" +
        "<div style='font-weight:800;font-size:18px' id='vipName'>🏅 " + cur.name + "</div>" +
        "<div style='font-size:12px;background:rgba(0,0,0,0.3);padding:2px 8px;border-radius:20px;opacity:.8'>利息加成：<b id='vipBonus' style='color:#f59e0b'>+" + (cur.bonus * 100).toFixed(4) + "%</b></div>" +
      "</div>";

    // 未解鎖狀態
    if (!vip.unlocked) {
      const lockWrap = document.createElement('div');
      lockWrap.style.cssText = 'margin-top:10px;padding:10px;background:rgba(0,0,0,0.2);border-radius:8px;text-align:center;font-size:13px;color:#94a3b8';
      lockWrap.innerHTML = '🔒 銀行達 <b>Lv.20</b> 後解鎖贊助系統';
      card.appendChild(lockWrap);
      root.appendChild(card);
      return;
    }

    // 滿級狀態
    if (!next) {
      const maxMsg = document.createElement('div');
      maxMsg.style.cssText = 'margin-top:15px;text-align:center;color:#22c55e;font-weight:800;font-size:14px;letter-spacing:1px';
      maxMsg.innerHTML = '✨ 已達成最高榮譽：' + cur.name + ' ✨';
      card.appendChild(maxMsg);
      root.appendChild(card);
      return;
    }

    // 進度條生成器（優化數字顯示）
    function barRow(idPrefix, lbl, curVal, needVal, color) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin:10px 0';
      const lab = document.createElement('div');
      lab.style.cssText = 'font-size:12px;display:flex;justify-content:space-between;margin-bottom:4px';
      // 使用 fmtNum 讓數字變好讀
      lab.innerHTML = "<span>" + lbl + "贊助</span><span>" + fmtNum(curVal) + " / " + fmtNum(needVal) + "</span>";

      const outer = document.createElement('div');
      outer.style.cssText = 'height:8px;background:rgba(0,0,0,0.3);border-radius:4px;overflow:hidden';
      const inner = document.createElement('div');
      inner.style.cssText = 'height:100%;transition:width 0.5s ease-out;background:' + color + ';width:' + Math.min(100, (curVal / needVal) * 100) + '%';

      outer.appendChild(inner);
      wrap.appendChild(lab);
      wrap.appendChild(outer);
      return wrap;
    }

    card.appendChild(barRow('vipGold', '金幣', vip.donatedGold, next.needGold, 'linear-gradient(90deg, #0ea5e9, #38bdf8)'));
    card.appendChild(barRow('vipGem', '鑽石', vip.donatedGem, next.needGem, 'linear-gradient(90deg, #3b82f6, #60a5fa)'));

    // 贊助輸入區域優化
    const donateRow = document.createElement('div');
    donateRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:15px';

    const createInputBox = function(type, label, color, action) {
      const box = document.createElement('div');
      box.style.cssText = 'display:flex;flex-direction:column;gap:5px';

      const ip = document.createElement('input');
      ip.type = 'number';
      ip.placeholder = label;
      ip.style.cssText = 'width:100%;background:rgba(0,0,0,0.3);border:1px solid #334155;border-radius:8px;padding:6px 10px;color:#fff;font-size:13px';

      const btn = document.createElement('button');
      btn.textContent = '贊助' + label;
      btn.style.cssText = 'background:' + color + ';color:#0b1220;border:0;padding:6px;border-radius:8px;font-weight:800;cursor:pointer;font-size:12px';

      btn.onclick = function() {
        const val = Math.floor(Number(ip.value) || 0);
        if (val <= 0) return;
        // 額外檢查持有量（假設有 playerGold/playerGem API）
        const has = (type === 'gold') ? playerGold() : playerGem();
        if (val > has) { alert(label + '不足！'); return; }

        action(val);
        ip.value = '';
      };

      box.appendChild(ip);
      box.appendChild(btn);
      return box;
    };

    donateRow.appendChild(createInputBox('gold', '金幣', '#fbbf24', donateGoldVIP));
    donateRow.appendChild(createInputBox('gem', '鑽石', '#60a5fa', donateGemVIP));
    card.appendChild(donateRow);

    // 升級按鈕（視覺化強化）
    const ok = canUpgradeVip(next);
    const btnUp = document.createElement('button');
    btnUp.id = 'btnVipUpgrade';
    btnUp.innerHTML = ok ? '✨ 晉升至 ' + next.name + ' ✨' : '🚀 贊助達標即可升級';
    btnUp.disabled = !ok;

    const upBtnBg = ok ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#374151';
    btnUp.style.cssText = 'width:100%;background:' + upBtnBg + ';color:#fff;border:0;padding:10px;border-radius:10px;font-weight:800;margin-top:12px;cursor:' + (ok ? 'pointer' : 'not-allowed') + ';transition:transform 0.1s';

    btnUp.onclick = function() { if (ok) upgradeVip(); };
    card.appendChild(btnUp);

    root.appendChild(card);
  }


  function renderBalances(root, d) {
    const card = document.createElement('div');
    card.style.cssText = "background:#0b1220;border:1px solid #1f2937;border-radius:12px;padding:16px;margin-bottom:12px";

    // --- 1. 自動再投資區 ---
    const autoRow = document.createElement('div');
    autoRow.style.cssText = "display:flex;gap:12px;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #1f2937";
    autoRow.innerHTML = "<div style='font-size:13px;font-weight:700;color:#94a3b8'>🔁 自動利息再投資:</div>";

    function createToggle(label, key) {
      const lbl = document.createElement('label');
      lbl.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px";
      const chk = document.createElement('input');
      chk.type = "checkbox";
      chk.checked = !!state[key];
      chk.onchange = function() { state[key] = !!chk.checked; saveState(state, true); refreshActive(); };
      lbl.appendChild(chk);
      lbl.appendChild(document.createTextNode(label));
      return lbl;
    }
    autoRow.appendChild(createToggle("金幣", "autoReinvestGold"));
    autoRow.appendChild(createToggle("強化道具兌換券", "autoReinvestStone"));
    card.appendChild(autoRow);

    // --- 2. 貨幣列生成器 ---
    function renderCurrencySection(options) {
      const { title, current, cap, playerHas, inputKey, color, onIn, onOut, dailyFunc } = options;

      const section = document.createElement('div');
      section.style.cssText = "margin-bottom:16px";

      // 標題與餘額
      const head = document.createElement('div');
      head.style.cssText = "display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px;flex-wrap:wrap";
      head.innerHTML =
        "<div>" + title + "：<b id='bank" + inputKey + "' style='color:" + color + "'>" + fmtNum(current) + "</b> / <span style='opacity:.6'>" + fmtNum(cap) + "</span></div>" +
        "<div style='opacity:.8'>持有：" + fmtNum(playerHas) + "</div>";

      // 操作列
      const act = document.createElement('div');
      act.style.cssText = "display:flex;gap:6px;align-items:center";

      const ip = document.createElement('input');
      ip.type = "number"; ip.placeholder = "輸入數量"; ip.setAttribute("data-bind", "in" + inputKey);
      ip.style.cssText = "flex:1;min-width:80px;padding:8px;border-radius:8px;border:1px solid #334155;background:rgba(0,0,0,0.2);color:#fff";

      const btnIn = document.createElement('button');
      btnIn.textContent = "存入";
      btnIn.style.cssText = "background:#2563eb;color:#fff;border:0;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:700";
      btnIn.onclick = function() { onIn(ip.value); ip.value = ''; updateEst(); };

      const btnOut = document.createElement('button');
      btnOut.textContent = "提領";
      btnOut.style.cssText = "background:#334155;color:#fff;border:0;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:700";
      btnOut.onclick = function() { onOut(ip.value); ip.value = ''; updateEst(); };

      act.appendChild(ip);
      act.appendChild(btnIn);
      act.appendChild(btnOut);

      // 利息預估
      const info = document.createElement('div');
      info.style.cssText = "font-size:11px;margin-top:6px;display:flex;justify-content:space-between;color:#94a3b8";
      const curInt = dailyFunc(current);
      info.innerHTML = "<span>日收益: " + fmtNum(curInt) + "</span><span id='est" + inputKey + "'>預估: +0 /日</span>";

      function updateEst() {
        const val = Math.max(0, Math.floor(Number(ip.value) || 0));
        const canDeposit = Math.min(val, playerHas, Math.max(0, cap - current));
        const estDaily = dailyFunc(current + canDeposit);
        const diff = estDaily - curInt;
        const el = document.getElementById('est' + inputKey);
        if (el) {
          el.textContent = "預估: +" + fmtNum(diff) + " /日";
          el.style.color = diff > 0 ? "#22c55e" : "#94a3b8";
        }
      }

      ip.addEventListener('input', updateEst);
      section.appendChild(head);
      section.appendChild(act);
      section.appendChild(info);
      card.appendChild(section);
    }

    // --- 3. 執行生成 ---
    // 金幣區
    renderCurrencySection({
      title: "💰 銀行金幣",
      current: state.gold,
      cap: d.capGold,
      playerHas: playerGold(),
      inputKey: "Gold",
      color: "#fbbf24",
      onIn: depositGold,
      onOut: withdrawGold,
      dailyFunc: dailyInterestGoldFor
    });

    // 強化道具兌換券區
    renderCurrencySection({
      title: "💎 銀行強化道具兌換券",
      current: state.stone,
      cap: d.capStone,
      playerHas: invQty(KEY_STONE),
      inputKey: "Stone",
      color: "#60a5fa",
      onIn: depositStone,
      onOut: withdrawStone,
      dailyFunc: dailyInterestStoneFor
    });

    root.appendChild(card);
  }


  function renderInterestAndTokens(root) {
    const card = document.createElement('div');
    card.style.cssText = "background:#0b1220;border:1px solid #1f2937;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:inset 0 0 20px rgba(0,0,0,0.2)";

    const goldRate = DAILY_INTEREST_GOLD + vipBonusRate();
    const stoneRate = DAILY_INTEREST_STONE + vipBonusRate();

    // --- 利息領取區 ---
    const gReady = Math.floor(Math.max(0, state.interestGoldBuf || 0));
    const sReady = Math.floor(Math.max(0, state.interestStoneBuf || 0));

    const interestContainer = document.createElement('div');
    interestContainer.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #1f2937";

    function createInterestBox(label, amount, rate, color, action) {
      const box = document.createElement('div');
      box.style.cssText = "background:rgba(255,255,255,0.03);padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.05)";
      box.innerHTML =
        "<div style='font-size:12px;opacity:.7;margin-bottom:4px'>" + label + " (日利率 " + (rate * 100).toFixed(4) + "%)</div>" +
        "<div style='font-size:18px;font-weight:800;color:#fff;margin-bottom:8px' id='interest" + (label.includes("金幣") ? "Gold" : "Stone") + "'>" + fmtNum(amount) + "</div>";

      const btn = document.createElement('button');
      btn.textContent = "領取收益";
      btn.disabled = amount <= 0;
      btn.style.cssText = "width:100%;background:" + (amount > 0 ? color : "#374151") + ";color:" + (color==="#22c55e"?"#0b1220":"#fff") + ";border:0;padding:6px;border-radius:6px;cursor:pointer;font-weight:800;font-size:12px;transition:opacity 0.2s";
      btn.onclick = action;
      box.appendChild(btn);
      return box;
    }

    interestContainer.appendChild(createInterestBox("💰 金幣利息", gReady, goldRate, "#16a34a", claimInterestGold));
    interestContainer.appendChild(createInterestBox("💎 強化道具兌換券利息", sReady, stoneRate, "#22c55e", claimInterestStone));
    card.appendChild(interestContainer);

    // --- 代幣生產區 ---
    const perPeriod = tokensPerPeriodByGold(state.gold);
    const whole = Math.floor(state.tokenProg);

    const tokenHead = document.createElement('div');
    tokenHead.style.cssText = "display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px";
    tokenHead.innerHTML =
      "<div>" +
        "<div style='font-size:12px;color:#f59e0b;font-weight:700'>🎟️ 高級代幣生產中</div>" +
        "<div style='font-size:20px;font-weight:800'>可領取：<span id='tokenCan' style='color:#f59e0b'>" + whole + "</span> <span style='font-size:14px;opacity:.6'>/ " + perPeriod + " (每期)</span></div>" +
      "</div>";

    const btnT = document.createElement('button');
    btnT.textContent = "領取全部代幣";
    btnT.disabled = whole <= 0;
    btnT.style.cssText = "background:" + (whole > 0 ? "#f59e0b" : "#374151") + ";color:#0b1220;border:0;padding:8px 16px;border-radius:10px;cursor:pointer;font-weight:800;transition:transform 0.1s";
    btnT.onclick = claimTokens;
    tokenHead.appendChild(btnT);

    // 進度條
    const progWrap = document.createElement('div');
    progWrap.style.cssText = "margin-top:5px";
    const barOuter = document.createElement('div');
    barOuter.style.cssText = "width:100%;height:12px;background:#1f2937;border-radius:999px;overflow:hidden;box-shadow:inset 0 2px 4px rgba(0,0,0,0.5)";
    const barInner = document.createElement('div');
    barInner.id = "tokenBar";
    barInner.style.cssText = "height:100%;width:0%;background:linear-gradient(90deg, #d97706, #f59e0b);box-shadow:0 0 10px rgba(245,158,11,0.5);transition:width .5s ease-out";
    barOuter.appendChild(barInner);

    const etaText = document.createElement('div');
    etaText.id = "tokenEta";
    etaText.style.cssText = "opacity:.6;font-size:11px;text-align:right;margin-top:6px;font-family:monospace";

    progWrap.appendChild(barOuter);
    progWrap.appendChild(etaText);

    card.appendChild(tokenHead);
    card.appendChild(progWrap);
    root.appendChild(card);
  }
  function renderStats(root) {
    const s = state.stats || {};
    const card = document.createElement('div');
    card.style.cssText = "background:#0b1220;border:1px solid #1f2937;border-radius:12px;padding:16px;margin-bottom:12px";

    const title = document.createElement('div');
    title.style.cssText = "font-weight:800;margin-bottom:12px;color:#93c5fd;display:flex;align-items:center;gap:6px";
    title.innerHTML = "<span>📈</span> 銀行經營統計";
    card.appendChild(title);

    const grid = document.createElement('div');
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:10px";

    function createStatItem(label, val, id, unit = "") {
      const item = document.createElement('div');
      item.style.cssText = "background:rgba(255,255,255,0.02);padding:8px 12px;border-radius:8px;border-left:3px solid #3b82f6";
      item.innerHTML =
        "<div style='font-size:11px;opacity:.6;margin-bottom:2px'>" + label + "</div>" +
        "<div style='font-size:14px;font-weight:700;color:#e5e7eb'><span id='" + id + "'>" + fmtNum(val) + "</span>" +
        "<span style='font-size:11px;margin-left:2px;font-weight:400;opacity:.8'>" + unit + "</span></div>";
      return item;
    }

    grid.appendChild(createStatItem("累計金幣收益", s.totalGoldInterest || 0, "stTotalGold", "金幣"));
    grid.appendChild(createStatItem("累計強化道具兌換券收益", s.totalStoneInterest || 0, "stTotalStone", "顆"));
    grid.appendChild(createStatItem("累計高級代幣", s.totalTokens || 0, "stTokens", "顆"));
    grid.appendChild(createStatItem("歷史金幣峰值", s.maxGoldHeld || 0, "stMaxGold"));
    grid.appendChild(createStatItem("歷史強化道具兌換券峰值", s.maxStoneHeld || 0, "stMaxStone"));

    card.appendChild(grid);
    root.appendChild(card);
  }

  // —— 動態小更新（避免輸入跳掉；含 VIP 進度/樣式） —— //
  function updateDynamic(container){
    const d = deriveByLevel(state.lv);

    // 等級/容量/餘額
    const elLv = container.querySelector('#bankLv'); if (elLv) elLv.textContent = "Lv."+state.lv;
    const elCapGold  = container.querySelector('#capGold');
    const elCapStone = container.querySelector('#capStone');
    const elBankGold = container.querySelector('#bankGold');
    const elBankStone= container.querySelector('#bankStone');
    const elPlayerGold = container.querySelector('#playerGold');
    const elInvStone = container.querySelector('#invStone');
    if (elCapGold)   elCapGold.textContent = fmtNum(d.capGold);
    if (elCapStone)  elCapStone.textContent = fmtNum(d.capStone);
    if (elBankGold)  elBankGold.textContent = fmtNum(state.gold);
    if (elBankStone) elBankStone.textContent= fmtNum(state.stone);
    if (elPlayerGold)elPlayerGold.textContent= fmtNum(playerGold());
    if (elInvStone)  elInvStone.textContent = fmtNum(invQty(KEY_STONE));

    // 利息可領（顯示值）
    const elIG = container.querySelector('#interestGold');
    const elIS = container.querySelector('#interestStone');
    if (elIG) elIG.textContent = fmtNum(Math.floor(Math.max(0, state.interestGoldBuf||0)));
    if (elIS) elIS.textContent = fmtNum(Math.floor(Math.max(0, state.interestStoneBuf||0)));

    // 代幣產能 / 進度
    const perPeriod = tokensPerPeriodByGold(state.gold);
    const perSec = (perPeriod > 0) ? (perPeriod / TOKEN_PERIOD_SEC) : 0;
    const whole = Math.floor(state.tokenProg);
    const frac = state.tokenProg - whole;
    const elCan = container.querySelector('#tokenCan');
    const elRate = container.querySelector('#tokenRate');
    if (elCan)  elCan.textContent = whole;
    if (elRate) elRate.textContent = perPeriod;
    const bar = container.querySelector('#tokenBar');
    const eta = container.querySelector('#tokenEta');
    if (perSec <= 0){
      if (bar) bar.style.width = "0%";
      if (eta) eta.textContent = "（條件不足：需達 10萬 金幣以上）";
    } else {
      const pct = Math.max(0, Math.min(1, frac)) * 100;
      if (bar) bar.style.width = pct.toFixed(2) + "%";
      const secLeft = (1 - frac) / perSec;
      if (eta) eta.textContent = "下一顆倒數：" + fmtTime(secLeft);
    }

    // 每日利息（含 VIP 加成）
    const elGD = container.querySelector('#goldDaily');
    const elSD = container.querySelector('#stoneDaily');
    if (elGD) elGD.textContent = (Math.floor(state.gold * (DAILY_INTEREST_GOLD + vipBonusRate()))).toLocaleString();
    if (elSD) elSD.textContent = (Math.floor(state.stone * (DAILY_INTEREST_STONE + vipBonusRate()))).toLocaleString();

    // 「存入後預估」回刷
    const gIn = container.querySelector('input[data-bind="inGold"]');
    if (gIn && document.activeElement !== gIn) { gIn.dispatchEvent(new Event('input')); }
    const sIn = container.querySelector('input[data-bind="inStone"]');
    if (sIn && document.activeElement !== sIn) { sIn.dispatchEvent(new Event('input')); }

    // 累積統計
    const st = state.stats || {};
    const stG = container.querySelector('#stTotalGold');
    const stS = container.querySelector('#stTotalStone');
    const stT = container.querySelector('#stTokens');
    const stMG= container.querySelector('#stMaxGold');
    const stMS= container.querySelector('#stMaxStone');
    if (stG) stG.textContent = fmtNum(st.totalGoldInterest||0);
    if (stS) stS.textContent = fmtNum(st.totalStoneInterest||0);
    if (stT) stT.textContent = fmtNum(st.totalTokens||0);
    if (stMG) stMG.textContent = fmtNum(st.maxGoldHeld||0);
    if (stMS) stMS.textContent = fmtNum(st.maxStoneHeld||0);

    // —— VIP 區動態（名稱/加成/條/按鈕/彩虹樣式） —— //
    const vip = state.vip || {unlocked:false,tier:0};
    const cur = VIP_TIERS[vip.tier] || VIP_TIERS[0];
    const next = VIP_TIERS[vip.tier+1];

    const vipName = container.querySelector('#vipName');
    const vipBonus = container.querySelector('#vipBonus');
    const vipCard = container.querySelector('#vipCard');
    const vipLock = container.querySelector('#vipLock');
    const vipNextName = container.querySelector('#vipNextName');
    const btnVip = container.querySelector('#btnVipUpgrade');

    if (vipName) vipName.textContent = '🏅 ' + cur.name;
    if (vipBonus) vipBonus.textContent = '+' + ((cur.bonus*100).toFixed(4)) + '%';

    if (vipCard){
      // 外框顏色 / 彩虹閃爍
      if (cur.frame==='RAINBOW') {
        vipCard.classList.add('vip-rainbow');
        vipCard.style.border = '3px solid';
        vipCard.style.borderImage = 'linear-gradient(90deg, red, orange, yellow, green, blue, indigo, violet) 1';
      } else {
        vipCard.classList.remove('vip-rainbow');
        vipCard.style.border = '3px solid '+cur.frame;
        vipCard.style.borderImage = '';
      }
      vipCard.style.background = cur.inner;
    }

    if (!vip.unlocked) {
      if (vipLock) vipLock.style.display = '';
      if (vipNextName) vipNextName.style.display = 'none';
      if (btnVip) { btnVip.disabled = true; btnVip.textContent = '尚未解鎖'; btnVip.style.background = '#374151'; btnVip.style.cursor='not-allowed'; }
    } else {
      if (vipLock) vipLock.style.display = 'none';
      if (!next){
        // 已最高等級
        if (vipNextName) vipNextName.style.display = 'none';
        if (btnVip) { btnVip.disabled = true; btnVip.textContent = '已達最高等級'; btnVip.style.background = '#374151'; btnVip.style.cursor='not-allowed'; }
      } else {
        if (vipNextName) { vipNextName.style.display=''; vipNextName.textContent='➡️ 下一階：' + next.name; }
        // 條與文字
        const gLab = container.querySelector('#vipGoldLab');
        const gBar = container.querySelector('#vipGoldBar');
        const gNeed = next.needGold||0;
        if (gLab) gLab.textContent = '金幣：' + fmtNum(state.vip.donatedGold) + ' / ' + fmtNum(gNeed);
        if (gBar)  gBar.style.width = (gNeed>0?Math.min(100,(state.vip.donatedGold/gNeed)*100):100).toFixed(2)+'%';

        const mLab = container.querySelector('#vipGemLab');
        const mBar = container.querySelector('#vipGemBar');
        const mNeed = next.needGem||0;
        if (mLab) mLab.textContent = '鑽石：' + fmtNum(state.vip.donatedGem) + ' / ' + fmtNum(mNeed);
        if (mBar)  mBar.style.width = (mNeed>0?Math.min(100,(state.vip.donatedGem/mNeed)*100):100).toFixed(2)+'%';

        const ok = canUpgradeVip(next);
        if (btnVip){
          btnVip.disabled = !ok;
          btnVip.textContent = ok ? '升級 VIP' : '尚未達標';
          btnVip.style.background = ok ? '#22c55e' : '#374151';
          btnVip.style.cursor = ok ? 'pointer' : 'not-allowed';
        }
      }
    }
  }

  function render(container){
    const snap = snapshotFocus(container);
    settleToNow();

    const d = deriveByLevel(state.lv);
    container.innerHTML = "";

    renderRules(container);
    renderHeader(container);
    renderVIP(container);          // VIP 區（可動態）
    renderBalances(container, d);
    renderInterestAndTokens(container);
    renderStats(container);

    updateDynamic(container);
    restoreFocus(container, snap);
  }

  // ====== 升級（銀行等級）======
  function tryLevelUp(){
    settleToNow();
    if (!HAS_INV) { alert("缺少背包介面"); return; }
    if (state.lv >= MAX_LV) { alert("已達銀行等級上限 ("+MAX_LV+")"); return; }
    const cost = levelUpCost(state.lv);
    const have = invQty(KEY_BANK_TOKEN);
    if (have < cost) { alert("需要「"+KEY_BANK_TOKEN+"」×"+cost+"，持有："+have); return; }
    removeItem(KEY_BANK_TOKEN, cost);
    state.lv++;
    if (state.lv >= 20) state.vip.unlocked = true;
    saveState(state, true);
    if (w.logPrepend) w.logPrepend("🏦 銀行升級至 Lv."+state.lv+"（容量上限 ×2）");
    refreshActive();
  }

  // ====== 每秒 tick（由 TownHub 主循環呼叫）======
  function tick(steps){
    if (!(steps > 0)) return;
    settle(steps);
    const body = document.getElementById('townHubBody');
    if (!body) return;
    if (String(body.getAttribute('data-tab-owner')||'') === TAB_ID) {
      updateDynamic(body);
    }
  }

  // ====== 註冊到 TownHub（停止自動整頁重繪，只做局部刷新）======
  w.TownHub.registerTab({
    id: TAB_ID,
    title: TAB_TITLE,
    render,
    tick,
    noAutoRerender: true
  });

})(window);