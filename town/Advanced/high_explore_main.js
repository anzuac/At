// ==========================================
// high_explore_main.js — 高級探索 V4 (Auto-Diff) — 段位版（SaveHub 版）
// 多槽 / 自動難度 / 段位門檻 / 免費次數 / 內建獎勵一覽
// ✨ 掉落表更新提示（偵測 HighExploreData 變更，吐司 + 自動展開獎勵一覽）
// 依賴：TownHub；可選：HighExploreData、HighExploreDrops、HighExploreEvents、combat_power.js（computeCombatPower + getRankByCP）
// 另依賴：SaveHub（save_hub_es2020.js）— 用於統一存檔
// ==========================================
(function (w) {
  "use strict";
  if (!w.TownHub || typeof w.TownHub.registerTab !== "function") return;

  // ===== 工具 =====
  function nowSec(){ return Math.floor(Date.now()/1000); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function toInt(n){ n=Number(n); return (isFinite(n) ? Math.floor(n) : 0); }
  function byId(id){ return document.getElementById(id); }
  function fmt(n){ return Number(n||0).toLocaleString(); }
  function upd(){ try{ w.updateResourceUI && w.updateResourceUI(); }catch(_){} }
  function saveGame(){ try{ w.saveGame && w.saveGame(); }catch(_){} }
  function addItem(name, qty){ qty=toInt(qty||1); if(qty<=0) return; try{ w.addItem && w.addItem(name, qty); }catch(_){} }
  function getItemQuantity(name){ try{ return toInt(w.getItemQuantity? w.getItemQuantity(name):0);}catch(_){return 0;} }
  function removeItem(name, qty){ try{ w.removeItem && w.removeItem(name, toInt(qty||1)); }catch(_){} }
  function nznum(x, d){ x=Number(x); return (isFinite(x)? x : (d||0)); }
  function randInt(min, max){ min=Math.floor(min); max=Math.floor(max); return Math.floor(Math.random()*(max-min+1))+min; }

  // --- 小吐司（與其他模組共存）---
  function showToast(msg, isError){
    let id='toast-mini', el=document.getElementById(id);
    if(!el){
      el=document.createElement('div');
      el.id=id;
      Object.assign(el.style,{
        position:'fixed',top:'16px',right:'16px',zIndex:'9999',
        background:'#10b981',color:'#0b1220',padding:'8px 12px',
        borderRadius:'10px',boxShadow:'0 8px 24px rgba(0,0,0,.35)',
        fontWeight:'700',transition:'transform .2s ease, opacity .2s ease',
        opacity:'0',transform:'translateY(-6px)'
      });
      document.body.appendChild(el);
      requestAnimationFrame(() =>{ el.style.opacity='1'; el.style.transform='translateY(0)'; });
    }
    el.textContent=msg;
    el.style.background=isError?'#ef4444':'#10b981';
    clearTimeout(el._timer);
    el._timer=setTimeout(() =>{
      el.style.opacity='0'; el.style.transform='translateY(-6px)';
      setTimeout(() =>{ if (el && el.parentNode) el.parentNode.removeChild(el); },220);
    },1600);
  }

  // ----- 段位工具（F- → SSS+）-----
  const RANK_ORDER = ["F-","F","F+","E-","E","E+","D-","D","D+","C-","C","C+","B-","B","B+","A-","A","A+","S-","S","S+","SS-","SS","SS+","SSS-","SSS","SSS+"];
  function rankIndex(label){
    const i = RANK_ORDER.indexOf(String(label||""));
    return i < 0 ? 0 : i;
  }
  function getPlayerRankLabel(){
    try{
      if (typeof w.computeCombatPower === "function" && typeof w.getRankByCP === "function"){
        const cp = w.computeCombatPower(w.player || {});
        const rk = w.getRankByCP(cp);
        return rk && rk.label ? rk.label : "F-";
      }
    }catch(_){}
    return "F-"; // 沒載 combat_power.js 時保底
  }
  function meetsRankRequirement(reqRank){
    if (reqRank == null) return true;
    const cur = getPlayerRankLabel();
    return rankIndex(cur) >= rankIndex(reqRank);
  }

  // --- 掉落表簽章（偵測 HighExploreData 是否變更）---
  function _fnv1a(str){
    let h=0x811c9dc5|0;
    for(let i=0;i<str.length;i++){
      h^=str.charCodeAt(i);
      h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0;
    }
    return (h>>>0).toString(16);
  }
  function getData(){ return w.HighExploreData || {}; }
  function _dropsSignature(){
    const D=getData();
    const pack={
      difficulties:(Array.isArray(D.difficulties)? D.difficulties.map((d) =>{return{
        id:d.id,name:d.name,
        // 兼容：舊資料用 reqCP，新資料用 reqRank
        reqCP:+(d.reqCP||0),
        reqRank:(d.reqRank||null),
        chanceMult:+(d.chanceMult!=null?d.chanceMult:d.dropMult||1),
        qtyMult:+(d.qtyMult||1),
        expMult:+(d.expMult||1)
      };}):[]),
      rewards:(Array.isArray(D.rewards)? D.rewards.map((r) =>{return{
        type:r.type,key:r.key,name:r.name,rate:+(r.rate||0),qty:r.qty
      };}):[]),
      guaranteed:(Array.isArray(D.guaranteed||D.fixedRewards)? (D.guaranteed||D.fixedRewards).map((g) =>{return{
        type:g.type,key:g.key,name:g.name,baseQty:g.baseQty,qty:g.qty
      };}):[])
    };
    pack.rewards.sort((a,b) =>{return String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-Hant');});
    pack.guaranteed.sort((a,b) =>{return String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-Hant');});
    return _fnv1a(JSON.stringify(pack));
  }

  // ===== 常數 =====
  const NS = "high_explore";          // SaveHub 命名空間
  const DROPS_SIG_KEY = "HIGH_EXPLORE_DROPS_SIG";
  const SLOT_MAX = 4;
  const SLOT_BASE = 1;
  const SLOT_UNLOCK_COST = 5000; // 💎
  const RUN_SEC = 800;
  const TICKET_NAME = "高級探索券";

  // 免費次數規則
  const FREE_INIT = 5;
  const FREE_MAX = 5;
  const FREE_REFILL_SEC = 36000; // 每小時 +1

  // ===== 讀取難度/獎勵（兼容欄位）=====
  function getDiffs(){
    const D = getData();
    return Array.isArray(D.difficulties) ? D.difficulties : [];
  }
  function getDiffById(id){
    const L = getDiffs(); if (!L.length) return null;
    for (let i=0;i<L.length;i++){
      const did = L[i].id || ("D"+i);
      if (did === id) return L[i];
    }
    return L[0];
  }
  function getRewards(){
    const D = getData();
    return Array.isArray(D.rewards) ? D.rewards : [];
  }
  function getFixedRewards(){
    const D = getData();
    if (Array.isArray(D.fixedRewards)) return D.fixedRewards;
    if (Array.isArray(D.guaranteed))   return D.guaranteed;
    return [];
  }

  // ===== 自動選難度（優先用 reqRank；無段位 API 時回退 reqCP）=====
  function canEnterDiff(d){
    try {
      if (w.HighExploreData && typeof w.HighExploreData.canEnterTier === "function") {
        return w.HighExploreData.canEnterTier(d.id || "");
      }
    } catch(_){}
    if (d && d.reqRank != null) return meetsRankRequirement(d.reqRank);
    const cpReq = nznum(d && d.reqCP, 0);
    if (cpReq <= 0) return true;
    let cp = 0;
    try { cp = (typeof w.computeCombatPower==="function") ? w.computeCombatPower(w.player) : 0; } catch(_){}
    return cp >= cpReq;
  }
  function getAutoDiffIdByRank() {
    const diffs = getDiffs();
    if (!diffs.length) return "R01";
    let best = diffs[0].id || "R01";
    for (let i=0;i<diffs.length;i++){
      const d = diffs[i], id = d.id || ("R"+(i+1));
      if (canEnterDiff(d)) best = id;
    }
    return best;
  }
  function getNextDiffInfo() {
    const diffs = getDiffs();
    for (let i=0;i<diffs.length;i++){
      if (!canEnterDiff(diffs[i])) return diffs[i];
    }
    return null; // 已達最高
  }

  // ===== SaveHub 初始化 =====
  if (w.SaveHub){
    const spec = {}; spec[NS] = { version: 1, migrate(old){ return old || {}; } };
    w.SaveHub.registerNamespaces(spec);
  }
  function persist(){ if (w.SaveHub) w.SaveHub.set(NS, state); }

  // ===== 狀態 =====
  function newSlot(idx){
    return {
      id: idx,
      enabled: true,
      running: false,
      finishing: false,
      startAt: 0,
      duration: RUN_SEC,
      lastResult: null,
      currentDiffId: null // ★ 每次開始探索時鎖定的段位難度
    };
  }
  function normalizeSlots(slots){
    const out = [];
    if (!Array.isArray(slots)) slots = [];
    for (let i=0;i<slots.length;i++){
      const s=slots[i]||{};
      out.push({
        id: toInt(s.id||i),
        enabled: (s.enabled!==false),
        running: !!s.running,
        finishing: !!s.finishing,
        startAt: toInt(s.startAt||0),
        duration: toInt(s.duration||RUN_SEC),
        lastResult: s.lastResult || null,
        currentDiffId: s.currentDiffId || null
      });
    }
    if (out.length < SLOT_BASE){
      for (let k=out.length; k<SLOT_BASE; k++) out.push(newSlot(k));
    }
    return out;
  }

  const DEFAULT_STATE = (function fresh(){
    const s = {
      slots: [],
      log: [],
      freeCharges: FREE_INIT,
      lastRefillAt: nowSec(),
      globalDiffId: getAutoDiffIdByRank(),
      showRewards: false,
      _dropsSigChecked: false
    };
    for (let i=0; i<SLOT_BASE; i++) s.slots.push(newSlot(i));
    return s;
  })();

  const state = (w.SaveHub ? w.SaveHub.get(NS, DEFAULT_STATE) : DEFAULT_STATE);
  // 啟動時補欄位
  (function migrateFill(){
    state.slots = normalizeSlots(state.slots);
    state.log   = state.log || [];
    state.freeCharges = clamp(toInt(state.freeCharges!=null?state.freeCharges:FREE_INIT), 0, FREE_MAX);
    state.lastRefillAt = toInt(state.lastRefillAt || nowSec());
    state.globalDiffId = String(state.globalDiffId || getAutoDiffIdByRank());
    state.showRewards = !!state.showRewards;
    state._dropsSigChecked = !!state._dropsSigChecked;
    persist();
  })();

  // ===== 免費次數回補 =====
  function ensureRefill(){
    const now = nowSec();
    if (state.freeCharges >= FREE_MAX) { state.lastRefillAt = now; return; }
    const elapsed = Math.max(0, now - toInt(state.lastRefillAt||now));
    if (elapsed < FREE_REFILL_SEC) return;
    const add = Math.floor(elapsed / FREE_REFILL_SEC);
    if (add > 0){
      state.freeCharges = clamp(state.freeCharges + add, 0, FREE_MAX);
      state.lastRefillAt += add * FREE_REFILL_SEC;
      persist();
    }
  }

  // ===== 掉落計算 =====
  function computeDropsForDiff(diffId){
    // 1) 官方引擎（HighExploreDrops）
    try{
      if (w.HighExploreDrops && typeof w.HighExploreDrops.rollOnceByTier==="function"){
        return w.HighExploreDrops.rollOnceByTier(diffId) || [];
      }
    }catch(_){}
    // 2) 視圖函式（HighExploreData）
    try{
      if (w.HighExploreData && typeof w.HighExploreData.getViewForTier==="function"){
        const view = w.HighExploreData.getViewForTier(diffId);
        let bag = [], i, j;
        for (i=0;i<view.guaranteed.length;i++){
          const g = view.guaranteed[i];
          const q = (g.min===g.max)? g.min : randInt(g.min, g.max);
          if (q>0) bag.push({ type:g.type, key:(g.name||g.key), qty:q });
        }
        for (j=0;j<view.random.length;j++){
          const r = view.random[j];
          if (Math.random() < r.effRate){
            const rq = (r.min===r.max)? r.min : randInt(r.min, r.max);
            if (rq>0) bag.push({ type:r.type, key:(r.name||r.key), qty:rq });
          }
        }
        return bag;
      }
    }catch(_){}
    // 3) 備援（兼容舊 dropMult/qtyMult）
    const diff = getDiffById(diffId) || {};
    const chanceMult = nznum(diff.chanceMult!=null? diff.chanceMult : diff.dropMult, 1);
    const qtyMult    = nznum(diff.qtyMult, 1);

    let bag2 = [], fixed = getFixedRewards(), rewards = getRewards(), i2;
    for (i2=0;i2<fixed.length;i2++){
      const f = fixed[i2];
      let fq;
      if (Array.isArray(f.baseQty)) {
        const fmin = Math.max(1, toInt(f.baseQty[0]*qtyMult));
        const fmax = Math.max(fmin, toInt(f.baseQty[1]*qtyMult));
        fq = randInt(fmin, fmax);
      } else {
        const base = toInt(f.baseQty!=null ? f.baseQty : f.qty);
        fq = Math.max(1, toInt(base * qtyMult));
      }
      if (fq>0) bag2.push({ type:f.type||"item", key:(f.key||f.name||"?"), qty:fq });
    }
    for (i2=0;i2<rewards.length;i2++){
      const r2 = rewards[i2];
      const rate = clamp(nznum(r2.rate,0) * chanceMult, 0, 1);
      if (Math.random() < rate){
        let q2 = 1;
        if (Array.isArray(r2.qty)){
          const min = Math.max(1, toInt(r2.qty[0] * qtyMult));
          const max = Math.max(min, toInt(r2.qty[1] * qtyMult));
          q2 = randInt(min, max);
        } else if (r2.qty != null){
          q2 = Math.max(1, toInt(nznum(r2.qty,1) * qtyMult));
        }
        if (q2>0) bag2.push({ type:r2.type||"item", key:(r2.key||r2.name||"?"), qty:q2 });
      }
    }
    return bag2;
  }

  // ===== 隨機事件掛鉤 =====
  function tryRandomEvent(slot){
    try{
      if (w.HighExploreEvents && typeof w.HighExploreEvents.checkAndMaybeTrigger === "function"){
        w.HighExploreEvents.checkAndMaybeTrigger(slot);
      }
    }catch(_){}
  }

  // ===== 可否開始：用「目前段位對應的自動難度」判定 =====
  function hasChargeOrTicket(){
    return (state.freeCharges > 0 || getItemQuantity(TICKET_NAME) > 0);
  }
  function canStartAny(){
    const autoId = getAutoDiffIdByRank();
    const diff = getDiffById(autoId);
    const ok = diff ? canEnterDiff(diff) : true;
    return ok && hasChargeOrTicket();
  }

  // ===== 開始 / 結束 =====
  function getSlot(id){ for (let i=0;i<state.slots.length;i++) if (state.slots[i].id===id) return state.slots[i]; return null; }

  function startRun(slotId){
    ensureRefill();
    const slot = getSlot(slotId);
    if (!slot){ showToast('找不到探索槽', true); return false; }
    if (slot.running){ showToast('此槽位正在探索中', true); return false; }

    // 段位/門檻檢查
    const autoId = getAutoDiffIdByRank();
    const diff = getDiffById(autoId);
    if (diff && !canEnterDiff(diff)){
      if (diff.reqRank){
        showToast('⚠️ 段位不足，需求：'+diff.reqRank, true);
      }else{
        showToast('⚠️ 戰力不足，需求CP：'+fmt(diff.reqCP||0), true);
      }
      return false;
    }

    // 次數/票券
    if (!hasChargeOrTicket()){
      showToast('⚠️ 您的資源不足：沒有免費次數或 '+TICKET_NAME, true);
      return false;
    }

    // 優先用免費次數
    if (state.freeCharges > 0){
      state.freeCharges = Math.max(0, state.freeCharges - 1);
      persist();
    } else {
      const ok = getItemQuantity(TICKET_NAME) > 0;
      if (!ok){ showToast('⚠️ 您的資源不足：沒有 '+TICKET_NAME, true); return false; }
      removeItem(TICKET_NAME, 1);
    }

    // ★ 鎖定當前自動段位難度（這一趟固定用它）
    slot.currentDiffId = autoId || getAutoDiffIdByRank();

    slot.running = true;
    slot.startAt = nowSec();
    slot.duration = RUN_SEC;
    persist(); upd(); saveGame();
    return true;
  }

  function finishRun(slot){
    if (!slot) return;
    if (slot.finishing) return;

    // 防重入：避免時間到後因例外導致無限重複發獎
    slot.finishing = true;

    // 先停止狀態，確保就算後續出錯也不會被 tick 一直重複觸發
    slot.running = false;

    const diffId = slot.currentDiffId || getAutoDiffIdByRank();
    const diff = getDiffById(diffId);

    let drops = [];
    try {
      drops = computeDropsForDiff(diffId) || [];
    } catch (e) {
      console.error("[HighExplore] drop error:", e);
      drops = [];
    }

    try {
      // 發獎
      for (let k=0;k<drops.length;k++){
        const d = drops[k], q = Math.max(1, (d.qty|0)), key = d.key;
        if (d.type === "gem" && w.player) {
          w.player.gem  = (w.player.gem  || 0) + q;
        } else if (d.type === "gold" && w.player) {
          w.player.gold = (w.player.gold || 0) + q;
        } else if (d.type === "stone" && w.player) {
          w.player.stone = (w.player.stone || 0) + q;
        } else if (d.type === "exp" && w.player) {
          if (typeof w.addExp === "function") w.addExp(q);
          else if (typeof w.gainExp === "function") w.gainExp(q);
          else if (w.player && w.player.exp != null) w.player.exp = (w.player.exp || 0) + q;
        } else {
          addItem(key, q);
        }
      }
    } catch (e2) {
      console.error("[HighExplore] award error:", e2);
    }

    try { upd(); saveGame(); } catch(_){}

    // 紀錄：儲存物件而非字串（渲染時再格式化）
    try{
      const line = {
        at: nowSec(),
        diffId,
        diffName: (diff && diff.name) ? diff.name : diffId,
        drops: drops || []
      };
      slot.lastResult = line;

      state.log.unshift(line);
      if (state.log.length > 50) state.log.length = 50;
    } catch (e3) {
      console.error("[HighExplore] log error:", e3);
    }

    // 收尾（再次保底）
    slot.startAt = 0;
    slot.currentDiffId = null;

    try { persist(); } catch(_){}
    try { tryRandomEvent(slot); } catch(_){}

    slot.finishing = false;
  }

  // ===== tick =====
  function tick(sec){
    ensureRefill();
    let hasRunning=false;
    let changed=false;
    for (let i=0;i<state.slots.length;i++){
      const s=state.slots[i];
      if(!s.running)continue;
      hasRunning=true;
      const t=nowSec();
      if(t>=s.startAt+s.duration){
        finishRun(s);
        changed=true;
      }
    }
    if(changed){persist();upd();saveGame();}
    if(hasRunning){ updateCountdownDOM(); }
  }


// 更新倒數顯示（不需要 rerender，避免每秒重繪整個頁面）
  function updateCountdownDOM(){
    for (let i=0;i<state.slots.length;i++){
      const s=state.slots[i];
      if(!s.running) continue;
      const rem = remainSec(s);
      const el = byId('hexpRem_' + i);
      if(el) el.textContent = rem + 's';
      const pct = remainPct(s);
      const barEl = byId('hexpBar_' + i);
      if(barEl) barEl.style.width = clamp(pct,0,100) + '%';
    }
  }

// ===== UI =====
  function injectStyles() {
    if (document.getElementById('hexp-styles')) return;
    const style = document.createElement('style');
    style.id = 'hexp-styles';
    style.innerHTML = `
      .hexp-container { font-family: sans-serif; color: #f3f4f6; line-height: 1.5; }
      .hexp-card { background: #0b1220; border: 1px solid #1f2937; border-radius: 12px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3); }
      .hexp-title { font-weight: 700; margin-bottom: 8px; color: #60a5fa; display: flex; align-items: center; gap: 6px; }

      /* 探索槽 Grid 佈局 */
      .hexp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
      .hexp-slot-card { background: #111827; border: 1px solid #374151; border-radius: 10px; padding: 12px; transition: transform 0.2s, border-color 0.2s; }
      .hexp-slot-card.running { border-color: #3b82f6; box-shadow: 0 0 10px rgba(59, 130, 246, 0.2); }
      .hexp-slot-card:hover { transform: translateY(-2px); border-color: #4b5563; }

      /* 進度條 */
      .hexp-bar-bg { height: 8px; background: #060a12; border-radius: 999px; overflow: hidden; margin-top: 8px; }
      .hexp-bar-fill { height: 100%; background: linear-gradient(90deg, #60a5fa, #34d399); transition: width 0.4s ease; }

      /* 按鈕美化 */
      .hexp-btn { border: none; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-weight: 600; transition: all 0.2s; font-size: 13px; }
      .hexp-btn:active { transform: scale(0.96); }
      .hexp-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }
      .hexp-btn-start { background: #10b981; color: #0b1220; width: 100%; margin-top: 10px; }
      .hexp-btn-toggle { background: #4f46e5; color: white; }
      .hexp-btn-unlock { background: #fbbf24; color: #0b1220; }

      /* 表格 */
      .hexp-table { width: 100%; border-collapse: collapse; font-size: 13px; border-radius: 8px; overflow: hidden; }
      .hexp-table thead { background: #1f2937; }
      .hexp-table th { text-align: left; padding: 10px; font-weight: 600; }
      .hexp-table td { padding: 8px 10px; border-bottom: 1px dashed #1f2937; }

      .hexp-log-box { max-height: 200px; overflow-y: auto; font-size: 12px; padding: 8px; background: #060a12; border-radius: 6px; color: #9ca3af; }
      .mini-info { font-size: 12px; opacity: 0.8; margin-bottom: 4px; }
    `;
    document.head.appendChild(style);
  }

  function bar(pct, idx) {
    pct = clamp(pct, 0, 100);
    return '<div class="hexp-bar-bg"><div class="hexp-bar-fill" id="hexpBar_' + idx + '" style="width:' + pct + '%"></div></div>';
  }

  function card(title, inner) {
    return '<div class="hexp-card"><div class="hexp-title">' + title + '</div>' + inner + '</div>';
  }

  function remainPct(slot) {
    if (!slot.running) return 0;
    const t = nowSec();
    const used = clamp(t - slot.startAt, 0, slot.duration);
    return Math.floor(used / slot.duration * 100);
  }

  function remainSec(slot) {
    if (!slot.running) return 0;
    const t = nowSec();
    return Math.max(0, (slot.startAt + slot.duration) - t);
  }

  function renderRewardsTable() {
    const autoId = getAutoDiffIdByRank();
    const diff = getDiffById(autoId) || {};
    const dropMult = nznum((diff.dropMult != null ? diff.dropMult : diff.chanceMult), 1);
    const qtyMult = nznum(diff.qtyMult, 1);

    const fixed = getFixedRewards();
    const rewards = getRewards();
    let rows = '', i, r;

    for (i = 0; i < fixed.length; i++) {
      const f = fixed[i];
      const q = Array.isArray(f.baseQty)
        ? Math.max(1, toInt(f.baseQty[0] * qtyMult)) + '–' + Math.max(1, toInt(f.baseQty[1] * qtyMult))
        : fmt(Math.max(1, toInt((f.baseQty != null ? f.baseQty : f.qty) * qtyMult)));
      rows += '<tr><td>' + (f.name || f.key) + '</td><td>固定</td><td style="text-align:right"><b>' + q + '</b></td><td style="text-align:right;opacity:0.5">—</td></tr>';
    }

    for (i = 0; i < rewards.length; i++) {
      r = rewards[i];
      const effRate = Math.min(1, nznum(r.rate, 0) * dropMult);
      const qtyStr = Array.isArray(r.qty)
        ? 'x' + fmt(Math.max(1, toInt(r.qty[0] * qtyMult))) + '–' + fmt(Math.max(1, toInt(r.qty[1] * qtyMult)))
        : 'x' + fmt(Math.max(1, toInt(r.qty * qtyMult)));
      rows += '<tr><td>' + (r.name || r.key) + '</td><td>機率</td><td style="text-align:right">' + qtyStr + '</td><td style="text-align:right"><b>' + (effRate * 100).toFixed(2) + '%</b></td></tr>';
    }

    return '<div style="border:1px solid #1f2937;border-radius:8px;overflow:hidden;"><table class="hexp-table"><thead><tr><th>獎勵項目</th><th>類型</th><th style="text-align:right">數量</th><th style="text-align:right">總機率</th></tr></thead><tbody>' + (rows || '<tr><td colspan="4">暫無資料</td></tr>') + '</tbody></table></div>';
  }

  function renderSlot(slot, idx) {
    const pct = remainPct(slot);
    const remS = remainSec(slot);
    const ticket = getItemQuantity(TICKET_NAME);
    const last = slot.lastResult;
    const canStartNow = (!!slot && !slot.running && canStartAny());

    const autoId = getAutoDiffIdByRank();
    const diff = getDiffById(autoId);
    const meetRank = diff ? canEnterDiff(diff) : true;

    const lastHtml = last ? '<div style="font-size:11px;opacity:0.7;margin-top:8px;padding-top:8px;border-top:1px dashed #374151;">上次：' + (last.drops && last.drops.length ? last.drops.map((d) =>{ return d.key + 'x' + d.qty; }).join('、') : '無') + '</div>' : '';

    const statusInfo = slot.running
      ? '<div class="mini-info">倒數：<b id="hexpRem_' + idx + '">' + remS + 's</b></div>' + bar(pct, idx)
      : '<div class="mini-info" style="color:#9ca3af">狀態：閒置</div>';

    return '<div class="hexp-slot-card ' + (slot.running ? 'running' : '') + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '<b style="font-size:14px;">探索槽 #' + (slot.id + 1) + '</b>' +
        '<span style="font-size:11px;color:' + (meetRank ? '#34d399' : '#fca5a5') + '">' + (meetRank ? '條件達成' : '條件不足') + '</span>' +
      '</div>' +
      statusInfo +
      '<button data-sid="' + slot.id + '" class="hexp-btn hexp-btn-start btn-start" ' + (canStartNow && meetRank ? '' : 'disabled') + '>' + (slot.running ? '正在執行' : '開始探索') + '</button>' +
      lastHtml +
    '</div>';
  }

  function render(container) {
    injectStyles();
    ensureRefill();

    if (!state._dropsSigChecked) {
      const curSig = _dropsSignature();
      let prevSig = "";
      try { prevSig = (w.SaveHub ? w.SaveHub.get('_hexp_drops_sig', '') : (localStorage.getItem(DROPS_SIG_KEY) || "")); } catch (_) {}
      if (curSig && curSig !== prevSig) {
        if (w.SaveHub) w.SaveHub.set('_hexp_drops_sig', curSig);
        else localStorage.setItem(DROPS_SIG_KEY, curSig);
        state.showRewards = true;
        persist();
        showToast("🧩 掉落表已更新並套用");
      }
      state._dropsSigChecked = true;
    }

    const autoId = getAutoDiffIdByRank();
    const curDiff = getDiffById(autoId);
    const nextDiff = getNextDiffInfo();
    const nextText = nextDiff ? ('下一檔：' + nextDiff.name + ' (' + (nextDiff.reqRank || fmt(nextDiff.reqCP)) + ')') : '已達最高難度';

    const headerHtml = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">' +
        '<div><div style="font-size:16px;font-weight:700;">目前難度：' + (curDiff ? curDiff.name : autoId) + '</div>' +
        '<div style="font-size:12px;opacity:0.7;">' + nextText + '</div></div>' +
        '<button id="hexpToggleRewards" class="hexp-btn hexp-btn-toggle">' + (state.showRewards ? '隱藏獎勵' : '獎勵一覽') + '</button>' +
      '</div>' +
      '<div class="mini-info">免費次數：<b>' + state.freeCharges + ' / ' + FREE_MAX + '</b>｜' + TICKET_NAME + '：<b>' + getItemQuantity(TICKET_NAME) + '</b></div>' +
      (state.showRewards ? '<div style="margin-top:10px;">' + renderRewardsTable() + '</div>' : '');

    let slotsHtml = '<div class="hexp-grid">';
    for (let i = 0; i < state.slots.length; i++) slotsHtml += renderSlot(state.slots[i], i);
    slotsHtml += '</div>';

    const canUnlock = state.slots.length < SLOT_MAX;
    const unlockHtml = '<div style="margin-top:12px;">' +
      (canUnlock ? '<button id="hexpUnlock" class="hexp-btn hexp-btn-unlock">🔓 解鎖新槽位（' + fmt(SLOT_UNLOCK_COST) + ' 💎）</button>' : '<div style="opacity:0.5;font-size:12px;">已達槽位上限</div>') +
      '</div>';

	    // --- 📝 探索紀錄優化版 ---
	    // 兼容：舊版 log 可能是字串；新版 log 可能是物件 {at,diffName,drops:[{name,qty}]}
	    function _fmtTimeFromSec(sec){
	      const d = new Date((toInt(sec)||0)*1000);
	      const hh = String(d.getHours()).padStart(2,'0');
	      const mm = String(d.getMinutes()).padStart(2,'0');
	      const ss = String(d.getSeconds()).padStart(2,'0');
	      return hh + ':' + mm + ':' + ss;
	    }
	    function _coerceLogLine(line){
	      // returns { timePart, contentPart, diffPart }
	      if (line && typeof line === 'object') {
	        const timePart = line.at ? _fmtTimeFromSec(line.at) : '';
	        const diffPart = String(line.diffName || line.diffId || '');
	        const drops = Array.isArray(line.drops) ? line.drops : [];
	        let contentPart = '';
	        if (!drops.length) {
	          contentPart = '未獲得任何獎勵';
	        } else {
	          const parts = [];
	          for (let i=0;i<drops.length;i++) {
	            const it = drops[i] || {};
	            const nm = String(it.name || it.key || '');
	            const q = toInt(it.qty || it.amount || 1);
	            parts.push(nm + ' x' + q);
	          }
	          contentPart = parts.join('、');
	        }
	        return { timePart, contentPart, diffPart };
	      }

	      const s = String(line == null ? '' : line);
	      // 1) 嘗試解析出時間與內容 (格式："HH:mm:ss 取得：內容（難度）")
	      const match = s.match(/^(\d{1,2}:\d{2}:\d{2})\s取得：(.*)（(.*)）$/);
	      if (match) return { timePart: match[1], contentPart: match[2], diffPart: match[3] };
	      // 2) fallback：整行當內容
	      return { timePart: '', contentPart: s, diffPart: '' };
	    }

	    const logEntries = state.log.map((line) => {
	      const p = _coerceLogLine(line);
	      const timePart = p.timePart;
	      const contentPart = p.contentPart;
	      const diffPart = p.diffPart;

      // 2. 為不同類型的獎勵加上顏色與圖示 (針對常見關鍵字)
	      const styledContent = String(contentPart || '')
        .replace(/鑽石/g, '💎<span style="color:#60a5fa">鑽石</span>')
        .replace(/金幣/g, '🪙<span style="color:#fbbf24">金幣</span>')
        .replace(/探索挑戰券/g, '🎫<span style="color:#a855f7">票券</span>')
        .replace(/、/g, '<span style="opacity:0.3;padding:0 4px;">|</span>');

      // 3. 建立每一行的 HTML 結構
      return '<div style="padding:8px 4px; border-bottom:1px solid #1f2937; display:flex; flex-direction:column; gap:2px;">' +
	               '<div style="display:flex; justify-content:space-between; align-items:center;">' +
	                 '<span style="font-family:monospace; opacity:0.4; font-size:10px;">' + (timePart||'') + '</span>' +
	                 (diffPart ? '<span style="background:rgba(96,165,250,0.1); color:#60a5fa; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:bold;">' + diffPart + '</span>' : '<span></span>') +
	               '</div>' +
               '<div style="font-size:13px; color:#e5e7eb; padding-left:2px;">' +
	                 (String(contentPart||'').indexOf('未獲得') > -1 ? '<span style="opacity:0.5;font-style:italic">💨 空手而回</span>' : styledContent) +
               '</div>' +
             '</div>';
    });

    const logHtml = '<div class="hexp-log-box" style="padding:0 8px;">' +
                  (logEntries.length ? logEntries.join('') : '<div style="padding:20px;text-align:center;opacity:0.5;">尚無紀錄</div>') +
                  '</div>';


    container.innerHTML = '<div class="hexp-container">' +
      card('🏔 高級探索（免費 / 票券模式）', headerHtml) +
      card('🎛 探索管理', slotsHtml + unlockHtml) +
      card('📝 探索紀錄', logHtml) +
      '</div>';

    // 綁定事件
    container.querySelectorAll('.btn-start').forEach((btn) => {
      btn.onclick = function() {
        const sid = toInt(this.getAttribute('data-sid'));
        if (startRun(sid)) { showToast('已開始探索'); }
        else if (!hasChargeOrTicket()) { showToast('⚠️ 資源不足', true); }
        w.TownHub.requestRerender();
      };
    });

    const tg = byId('hexpToggleRewards');
    if (tg) tg.onclick = function() { state.showRewards = !state.showRewards; persist(); w.TownHub.requestRerender(); };

    const bu = byId('hexpUnlock');
    if (bu) bu.onclick = function() {
      if (state.slots.length >= SLOT_MAX) return;
      const gem = toInt(w.player && w.player.gem);
      if (gem < SLOT_UNLOCK_COST) { showToast('⚠️ 鑽石不足', true); return; }
      w.player.gem -= SLOT_UNLOCK_COST;
      state.slots.push(newSlot(state.slots.length));
      persist(); upd(); saveGame(); showToast('解鎖成功');
      w.TownHub.requestRerender();
    };
  }

  // ===== 註冊分頁 =====
  w.TownHub.registerTab({
    id: 'high_explore',
    title: '高級探索',
    render,
    tick
  });
})(window);
