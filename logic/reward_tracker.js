// reward_tracker.js — 掉落與獎勵追蹤（累積 / 每小時平均 / 近期紀錄 / 物品掉落率 / 全域掉落）
(function () {
  const state = {
    // 累積資源
    totals: { exp: 0, gold: 0, diamond: 0, stone: 0 },

    // 擊殺數
    kills: 0,

    // 掉落物品統計
    items: new Map(), // key: itemKey -> { name, icon?, countDrops, qtyTotal }

    // /hr 計算
    session: { running:false, sessionStartMs:0, activeElapsedMs:0, lastResumeMs:0 },
    historyLimit: 4,
    rateTimer: null,
    hookedLog: false,

    // 掉落物品排序
    itemSortKey: "rate",   // 'rate' | 'count' | 'name'
    itemSortDir: "desc",   // 'asc' | 'desc'

    // 全域掉落排序
    globalSortKey: "final", // 'base' | 'diff' | 'final'
    globalSortDir: "desc"   // 'asc' | 'desc'
  };

  const els = {
    exp:null, gold:null, diamond:null, stone:null,
    expHr:null, goldHr:null, diamondHr:null, stoneHr:null,
    kills:null, killsHr:null,
    history:null, body:null, toggleBtn:null,
    itemsGrid:null,

    // 全域掉落 UI
    globalBtn: null, globalModal:null, globalBody:null
  };

  const $   = id => document.getElementById(id);
  const fmt = n => (Number(n)||0).toLocaleString("zh-Hant");
  const now = () => Date.now();

  // ==================== 建立「戰利品 / 掉落紀錄」彈窗 ====================
  function ensureRewardPanel() {
    if (document.getElementById("reward-modal")) return;

    const css = `
      .rt-reward-backdrop{
        position:fixed; inset:0;
        background:rgba(15,23,42,.86);
        display:none; align-items:center; justify-content:center;
        z-index:9998; padding:12px;
      }
      .rt-reward-wrap{
        width:min(960px,100%);
        max-height:90vh;
        background:#020617;
        border-radius:14px;
        border:1px solid #1f2937;
        display:flex; flex-direction:column;
        box-shadow:0 18px 45px rgba(0,0,0,.75);
      }
      .rt-reward-head{
        padding:10px 14px;
        border-bottom:1px solid #111827;
        background:radial-gradient(circle at top left,#1d4ed8 0,#020617 40%);
        display:flex; align-items:center; justify-content:space-between;
        gap:8px; flex-wrap:wrap;
      }
      .rt-reward-title{ font-weight:800; font-size:15px; }
      .rt-reward-sub{ font-size:12px; color:#9ca3af; }
      .rt-reward-close{
        border:none; border-radius:999px;
        background:rgba(15,23,42,.9);
        color:#e5e7eb;
        width:28px; height:28px;
        cursor:pointer;
      }

      .rt-reward-body{
        padding:12px 14px 14px;
        overflow-y:auto;
        display:flex; flex-direction:column; gap:12px;
      }

      .rt-reward-summary{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
        gap:10px;
      }
      .rt-reward-card{
        background:#020617;
        border-radius:12px;
        border:1px solid #1f2937;
        padding:10px 12px;
        display:flex; flex-direction:column; gap:2px;
      }
      .rt-reward-card-label{ font-size:12px; color:#9ca3af; }
      .rt-reward-card-value{ font-size:18px; font-weight:700; color:#e5e7eb; }
      .rt-reward-card-sub{ font-size:12px; color:#9ca3af; }

      .rt-section-title{ font-size:13px; font-weight:600; margin-bottom:4px; }

      .reward-items-body{
        max-height:260px;
        overflow-y:auto;
        padding-right:4px;
        margin-top:4px;
      }
      .rt-sortbar{
        position:sticky;
        top:0;
        z-index:2;
        background:#020617;
      }

      .reward-items-grid{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
        gap:6px;
      }
      .reward-items-grid .empty,
      .reward-history-body .empty{
        font-size:12px; opacity:.7; padding:4px 0;
      }
      .reward-history-body{
        max-height:160px;
        overflow-y:auto;
        font-size:12px; line-height:1.5;
      }
      .reward-history-body > div{
        padding:2px 0;
        border-bottom:1px dashed rgba(55,65,81,.6);
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const modal = document.createElement("div");
    modal.id = "reward-modal";
    modal.className = "rt-reward-backdrop";
    modal.innerHTML = `
      <div class="rt-reward-wrap">
        <div class="rt-reward-head">
          <div>
            <div class="rt-reward-title">📦 戰利品 / 掉落紀錄</div>
            <div class="rt-reward-sub">累積、每小時平均、擊殺數與掉落率</div>
          </div>
          <button id="reward-modal-close" class="rt-reward-close" type="button">✕</button>
        </div>
        <div id="reward-body" class="rt-reward-body">
          <section class="rt-reward-summary">
            <div class="rt-reward-card">
              <div class="rt-reward-card-label">擊殺數</div>
              <div class="rt-reward-card-value" id="reward-kills">0</div>
              <div class="rt-reward-card-sub">
                每小時：約 <span id="reward-kills-hr">計算中…</span>
              </div>
            </div>
            <div class="rt-reward-card">
              <div class="rt-reward-card-label">經驗值</div>
              <div class="rt-reward-card-value" id="reward-exp">0</div>
              <div class="rt-reward-card-sub">
                每小時：約 <span id="reward-exp-hr">計算中…</span>
              </div>
            </div>
            <div class="rt-reward-card">
              <div class="rt-reward-card-label">金幣</div>
              <div class="rt-reward-card-value" id="reward-gold">0</div>
              <div class="rt-reward-card-sub">
                每小時：約 <span id="reward-gold-hr">計算中…</span>
              </div>
            </div>
            <div class="rt-reward-card">
              <div class="rt-reward-card-label">鑽石</div>
              <div class="rt-reward-card-value" id="reward-diamond">0</div>
              <div class="rt-reward-card-sub">
                每小時：約 <span id="reward-diamond-hr">計算中…</span>
              </div>
            </div>
            <div class="rt-reward-card">
              <div class="rt-reward-card-label">強化石</div>
              <div class="rt-reward-card-value" id="reward-stone">0</div>
              <div class="rt-reward-card-sub">
                每小時：約 <span id="reward-stone-hr">計算中…</span>
              </div>
            </div>
          </section>

          <section class="reward-items">
            <div class="rt-section-title">掉落物品統計（平均掉落率以目前總擊殺數為分母）</div>
            <div class="reward-items-body">
              <div id="reward-items-grid" class="reward-items-grid">
                <div class="empty">目前尚無物品掉落</div>
              </div>
            </div>
          </section>

          <section class="reward-history">
            <div class="rt-section-title">近期掉落紀錄</div>
            <div id="reward-history" class="reward-history-body">
              <div class="empty">目前尚無掉落紀錄</div>
            </div>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e)=>{
      if (e.target === modal) modal.style.display = "none";
    });
    const closeBtn = modal.querySelector("#reward-modal-close");
    if (closeBtn) closeBtn.addEventListener("click", ()=> modal.style.display = "none");
  }

  // ================= 綁定 DOM =================
  function bindDom() {
    ensureRewardPanel();

    els.exp      = $("reward-exp");
    els.gold     = $("reward-gold");
    els.diamond  = $("reward-diamond");
    els.stone    = $("reward-stone");

    els.expHr      = $("reward-exp-hr");
    els.goldHr     = $("reward-gold-hr");
    els.diamondHr  = $("reward-diamond-hr");
    els.stoneHr    = $("reward-stone-hr");

    els.kills    = $("reward-kills");
    els.killsHr  = $("reward-kills-hr");

    els.history   = $("reward-history");
    els.itemsGrid = $("reward-items-grid");
    els.body      = $("reward-modal");
    els.toggleBtn = $("toggleRewardBtn");

    if (els.toggleBtn) {
      els.toggleBtn.onclick = toggleVisibility;
    }

    ensureGlobalDropModal();
    mountGlobalDropButtonNearToggle();
  }

  function ensureBound() {
    if (els.history && els.exp && els.gold && els.stone && els.itemsGrid) return true;
    bindDom();
    return (els.history && els.exp && els.gold && els.stone && els.itemsGrid);
  }

  // ================= 每小時平均 =================
  function activeElapsedMs() {
    const s = state.session;
    return s.running ? s.activeElapsedMs + (now() - s.lastResumeMs) : s.activeElapsedMs;
  }
  function ratePerHour(total) {
    const ms = Math.max(activeElapsedMs(), 30*1000);
    return total * (3600000 / ms);
  }

  function updateTotalsUI() {
    if (!ensureBound()) return;
    els.exp.textContent      = fmt(state.totals.exp);
    els.gold.textContent     = fmt(state.totals.gold);
    els.stone.textContent    = fmt(state.totals.stone);
    if (els.diamond) els.diamond.textContent = fmt(state.totals.diamond);
    if (els.kills)   els.kills.textContent   = fmt(state.kills);
  }

  function updateRatesUI() {
    if (!ensureBound()) return;
    const ready   = activeElapsedMs() >= 60*1000;
    const expHr   = ratePerHour(state.totals.exp);
    const goldHr  = ratePerHour(state.totals.gold);
    const diaHr   = ratePerHour(state.totals.diamond);
    const stoneHr = ratePerHour(state.totals.stone);
    const killsHr = ratePerHour(state.kills);

    els.expHr      && (els.expHr.textContent      = ready ? fmt(Math.floor(expHr))   : "計算中…");
    els.goldHr     && (els.goldHr.textContent     = ready ? fmt(Math.floor(goldHr))  : "計算中…");
    els.diamondHr  && (els.diamondHr.textContent  = ready ? fmt(Math.floor(diaHr))   : "計算中…");
    els.stoneHr    && (els.stoneHr.textContent    = ready ? stoneHr.toFixed(2)       : "計算中…");
    els.killsHr    && (els.killsHr.textContent    = ready ? fmt(Math.floor(killsHr)) : "計算中…");
  }

  function ensureRateTimer() {
    if (!state.rateTimer) state.rateTimer = setInterval(updateRatesUI, 5000);
  }

  // ================= 近期紀錄 =================
  function addHistory(delta, meta) {
    if (!ensureBound()) return;
    if (els.history.firstElementChild?.classList?.contains("empty")) els.history.firstElementChild.remove();
    const p = [];
    if (delta.exp)     p.push(`EXP +${fmt(delta.exp)}`);
    if (delta.gold)    p.push(`金幣 +${fmt(delta.gold)}`);
    if (delta.diamond) p.push(`鑽石 +${fmt(delta.diamond)}`);
    if (delta.stone)   p.push(`強化石 +${fmt(delta.stone)}`);
    if (!p.length) return;
    const t = new Date();
    const hh = String(t.getHours()).padStart(2,"0");
    const mm = String(t.getMinutes()).padStart(2,"0");
    const ss = String(t.getSeconds()).padStart(2,"0");

    let monsterName = "";
    if (meta?.monster) {
      if (typeof meta.monster === "string") monsterName = meta.monster;
      else if (meta.monster.name) monsterName = meta.monster.name;
    } else if (meta?.monsterName) {
      monsterName = meta.monsterName;
    }

    const from = [
      monsterName ? ` ${monsterName}` : "",
      meta?.map   ? ` @ ${meta.map}`  : ""
    ].join("");

    const row = document.createElement("div");
    row.textContent = `[${hh}:${mm}:${ss}] ${p.join("、")}${from}`;
    els.history.prepend(row);
    while (els.history.children.length > state.historyLimit) els.history.lastElementChild?.remove();
  }

  // ================= 物品統計 & 掉落率 =================
  function itemKeyOf(x) {
    if (!x) return "";
    if (typeof x === "string") return x;
    return String(x.id ?? x.name ?? "");
  }
  function itemNameOf(x) {
    if (typeof x === "string") return x;
    return x?.name ?? String(x?.id ?? "物品");
  }
  function itemQtyOf(x) {
    if (!x) return 1;
    if (typeof x === "string") return 1;
    const q = Number(x.qty ?? x.quantity ?? 1);
    return Math.max(1, Math.floor(q));
  }
  function itemIconOf(x) {
    if (x && typeof x === "object" && x.icon) return String(x.icon);
    return null;
  }

  function recordItems(items) {
    if (!Array.isArray(items) || !items.length) return;
    for (const it of items) {
      const key  = itemKeyOf(it);
      if (!key) continue;
      const name = itemNameOf(it);
      const qty  = itemQtyOf(it);
      const icon = itemIconOf(it);
      const cur  = state.items.get(key) || { name, icon, countDrops:0, qtyTotal:0 };
      cur.name        = name;
      cur.icon        = icon || cur.icon;
      cur.countDrops += 1;
      cur.qtyTotal   += qty;
      state.items.set(key, cur);
    }
    updateItemsGridUI();
  }

  function getSortedItems() {
    const kills = Math.max(1, state.kills);
    const arr = [];
    for (const [key, it] of state.items.entries()) {
      const rate = (it.countDrops / kills) * 100; // %
      arr.push({ key, ...it, rate });
    }
    const dir = state.itemSortDir === "asc" ? 1 : -1;
    const key = state.itemSortKey;
    arr.sort((a,b) => {
      if (key === "name") {
        const cmp = String(a.name).localeCompare(String(b.name));
        return cmp * dir;
      }
      if (key === "count") {
        const diff = a.countDrops - b.countDrops;
        if (diff) return diff * dir;
        return String(a.name).localeCompare(String(b.name));
      }
      // key === 'rate'
      const diff = a.rate - b.rate;
      if (diff) return diff * dir;
      return String(a.name).localeCompare(String(b.name));
    });
    return arr;
  }

  function updateItemsGridUI() {
    if (!ensureBound()) return;
    const grid = els.itemsGrid;
    if (!grid) return;

    // 建立排序控制列（僅建立一次）
    if (!grid.previousElementSibling || !grid.previousElementSibling.classList?.contains("rt-sortbar")) {
      const bar = document.createElement("div");
      bar.className = "rt-sortbar";
      bar.style.cssText = "display:flex;gap:6px;align-items:center;margin:4px 0;";
      bar.innerHTML = `
        <span style="opacity:.8;font-size:12px;">排序：</span>
        <button id="rt-sort-rate"  class="rt-btn">掉落率</button>
        <button id="rt-sort-count" class="rt-btn">次數</button>
        <button id="rt-sort-name"  class="rt-btn">名稱</button>
        <span style="width:8px"></span>
        <button id="rt-sort-asc"  class="rt-btn">低→高</button>
        <button id="rt-sort-desc" class="rt-btn">高→低</button>
      `;
      grid.parentNode.insertBefore(bar, grid);
      const css = document.createElement("style");
      css.textContent = `
        .rt-btn{background:#2b2b2b;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;}
        .rt-btn:hover{background:#3a3a3a}
      `;
      document.head.appendChild(css);

      $("rt-sort-rate")  ?.addEventListener("click", ()=>{ state.itemSortKey="rate";  updateItemsGridUI(); });
      $("rt-sort-count") ?.addEventListener("click", ()=>{ state.itemSortKey="count"; updateItemsGridUI(); });
      $("rt-sort-name")  ?.addEventListener("click", ()=>{ state.itemSortKey="name";  updateItemsGridUI(); });
      $("rt-sort-asc")   ?.addEventListener("click", ()=>{ state.itemSortDir="asc";   updateItemsGridUI(); });
      $("rt-sort-desc")  ?.addEventListener("click", ()=>{ state.itemSortDir="desc";  updateItemsGridUI(); });
    }

    if (state.items.size === 0) {
      grid.innerHTML = '<div class="empty">目前尚無物品掉落</div>';
      return;
    }

    const items = getSortedItems();
    const frags = [];
    for (const it of items) {
      const iconHtml = it.icon
        ? `<img src="${it.icon}" alt="" style="width:20px;height:20px;object-fit:cover;border-radius:4px;margin-right:6px;">`
        : `<div style="width:20px;height:20px;border-radius:4px;background:#333;margin-right:6px;"></div>`;
      frags.push(`
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;">
            ${iconHtml}
            <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${it.name}">${it.name}</div>
          </div>
          <div style="font-size:12px;color:#cfd3e1;">
            次數：${fmt(it.countDrops)}　數量：${fmt(it.qtyTotal)}
          </div>
          <div style="font-size:12px;">掉落率：${it.rate.toFixed(2)}%</div>
        </div>
      `);
    }
    grid.innerHTML = frags.join("");
  }

  // ================= 顯示/隱藏 =================
  function toggleVisibility() {
    if (!ensureBound()) return;
    const modal = els.body || document.getElementById("reward-modal");
    if (!modal) return;
    const hidden = modal.style.display === "none" || !modal.style.display;
    modal.style.display = hidden ? "flex" : "none";
    if (els.toggleBtn) {
      els.toggleBtn.setAttribute("aria-expanded", hidden ? "true" : "false");
    }
  }

  // ================= 日誌攔截（備援：自動讀 log） =================
  function parseFromLog(text) {
    if (!text || text.indexOf("🎉") === -1) return null;
    const out = { exp:0, gold:0, diamond:0, stone:0, items:[] };
    const mGold  = text.match(/楓幣\s+(\d+)/);
    const mStone = text.match(/強化石\s+(\d+)/);
    const mExp   = text.match(/EXP\s+(\d+)/i);
    const mDia   = text.match(/鑽石\s+(\d+)/);
    if (mGold)  out.gold   = Number(mGold[1])  || 0;
    if (mStone) out.stone  = Number(mStone[1]) || 0;
    if (mExp)   out.exp    = Number(mExp[1])   || 0;
    if (mDia)   out.diamond= Number(mDia[1])   || 0;

    const part = text.split("，並獲得 ")[1];
    if (part) {
      const stripped = part
        .replace(/楓幣\s+\d+/g,"")
        .replace(/強化石\s+\d+\s*顆?/g,"")
        .replace(/EXP\s+\d+/ig,"")
        .replace(/鑽石\s+\d+/g,"")
        .trim();
      const list = stripped.split(/、|，/).map(s => s.trim()).filter(Boolean);
      for (const name of list) {
        if (!name) continue;
        const mQty = name.match(/(.+?)\s*[x×＊*]\s*(\d+)$/i);
        if (mQty) out.items.push({ name: mQty[1].trim(), qty: Number(mQty[2]) });
        else out.items.push({ name });
      }
    }
    return out;
  }

  let origLog = null;
  function hookLog() {
    if (state.hookedLog) return;
    if (typeof window.logPrepend !== "function") {
      const t = setInterval(() => {
        if (typeof window.logPrepend === "function") {
          clearInterval(t);
          hookLog();
        }
      }, 200);
      return;
    }
    origLog = window.logPrepend;
    window.logPrepend = function (text) {
      try {
        const parsed = parseFromLog(String(text||""));
        if (parsed) {
          API.record(
            { exp:parsed.exp, gold:parsed.gold, diamond:parsed.diamond, stone:parsed.stone },
            null,
            parsed.items
          );
        }
      } catch (e) {}
      return origLog.apply(this, arguments);
    };
    state.hookedLog = true;
  }

  // ================= 🌍 全域掉落（獨立彈窗） =================
  function ensureGlobalDropModal() {
    if (els.globalModal) return;

    const css = `
      .gdm-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.45);
                      display:none; align-items:center; justify-content:center; z-index:9998; }
      .gdm-wrap { width:min(92vw,880px); background:#111; color:#fff; border-radius:12px;
                  box-shadow:0 8px 25px rgba(0,0,0,.6); overflow:hidden; }
      .gdm-head { background:#222; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
      .gdm-body { padding:14px; max-height:70vh; overflow:auto; }
      .gdm-table { width:100%; border-collapse:collapse; }
      .gdm-table th, .gdm-table td { border-bottom:1px solid #333; padding:6px 8px; text-align:left; }
      .gdm-table th { color:#aaa; font-weight:600; }
      .gdm-btn { background:#444; color:#fff; border:none; padding:6px 10px; border-radius:8px; cursor:pointer; }
      .gdm-btn:hover { background:#666; }
      .gdm-group { display:flex; gap:6px; align-items:center; }
      .gdm-label { color:#bbb; font-size:12px; opacity:.9; }
      .rt-inline-btn { background:#2b2b2b; color:#fff; border:1px solid #444; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:12px; }
      .rt-inline-btn:hover { background:#3a3a3a; }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const modal = document.createElement("div");
    modal.id = "rt-global-drop-modal";
    modal.className = "gdm-backdrop";
    modal.innerHTML = `
      <div class="gdm-wrap">
        <div class="gdm-head">
          <strong>🌍 全域掉落一覽</strong>
          <div class="gdm-group">
            <span class="gdm-label">排序欄位：</span>
            <button id="gdmSortKeyBase"  class="gdm-btn">基準</button>
            <button id="gdmSortKeyDiff"  class="gdm-btn">含難度</button>
            <button id="gdmSortKeyFinal" class="gdm-btn">含難度＋玩家</button>
          </div>
          <div class="gdm-group">
            <span class="gdm-label">方向：</span>
            <button id="gdmSortDesc" class="gdm-btn">高→低</button>
            <button id="gdmSortAsc"  class="gdm-btn">低→高</button>
            <button id="gdmClose"    class="gdm-btn">關閉</button>
          </div>
        </div>
        <div class="gdm-body" id="gdmBody"></div>
      </div>
    `;
    document.body.appendChild(modal);
    els.globalModal = modal;
    els.globalBody  = document.getElementById("gdmBody");

    document.getElementById("gdmClose")?.addEventListener("click", ()=> modal.style.display="none");
    document.getElementById("gdmSortDesc")?.addEventListener("click", ()=> { state.globalSortDir="desc"; openGlobalDropModal(); });
    document.getElementById("gdmSortAsc") ?.addEventListener("click", ()=> { state.globalSortDir="asc";  openGlobalDropModal(); });
    document.getElementById("gdmSortKeyBase") ?.addEventListener("click", ()=> { state.globalSortKey="base";  openGlobalDropModal(); });
    document.getElementById("gdmSortKeyDiff") ?.addEventListener("click", ()=> { state.globalSortKey="diff";  openGlobalDropModal(); });
    document.getElementById("gdmSortKeyFinal")?.addEventListener("click", ()=> { state.globalSortKey="final"; openGlobalDropModal(); });
  }

  function mountGlobalDropButtonNearToggle() {
    if (els.globalBtn && document.body.contains(els.globalBtn)) return;

    const btn = document.createElement("button");
    btn.id = "rt-btn-global-drops";
    btn.className = "rt-inline-btn";
    btn.textContent = "🌍 全域掉落表";
    btn.addEventListener("click", openGlobalDropModal);

    if (els.toggleBtn && els.toggleBtn.parentNode) {
      btn.style.marginLeft = "6px";
      els.toggleBtn.insertAdjacentElement("afterend", btn);
      els.globalBtn = btn;
      return;
    }

    btn.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 9999;
      padding: 8px 14px; border-radius: 8px; background: #2b2b2b;
      color: #fff; border: 1px solid #666; cursor: pointer; font-size: 14px;
    `;
    document.body.appendChild(btn);
    els.globalBtn = btn;
  }

  function fmtPct(rate){
    const n = Number(rate);
    if (!Number.isFinite(n)) return "0%";
    return (n * 100).toFixed(n < 0.01 ? 2 : 1) + "%";
  }
  function getGlobalRateMultipliers() {
    const diff = (typeof getCurrentDifficulty === "function" ? getCurrentDifficulty() : {}) || {};
    const diffMul   = Number(diff.item ?? 1);
    const playerMul = 1 + Number(window.player?.dropRateBonus ?? 0);
    return { diffMul, playerMul };
  }
  function buildAndSortGlobalRates(sortKey="final", sortDir="desc") {
    if (typeof GLOBAL_DROP_RATES !== "object" || !GLOBAL_DROP_RATES) return [];
    const { diffMul, playerMul } = getGlobalRateMultipliers();
    const out = [];
    for (const key in GLOBAL_DROP_RATES) {
      const it = GLOBAL_DROP_RATES[key];
      if (!it || typeof it.rate !== "number") continue;
      const base  = it.rate;
      const diff  = base * diffMul;
      const final = diff * playerMul;
      out.push({ key, name: it.name || key, base, diff, final });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const k   = (sortKey === "base" || sortKey === "diff") ? sortKey : "final";
    out.sort((a,b)=>{
      const d = a[k] - b[k];
      if (d) return d * dir;
      return String(a.name).localeCompare(String(b.name));
    });
    return out;
  }

  function openGlobalDropModal(){
    ensureGlobalDropModal();
    const modal = els.globalModal;
    const body  = els.globalBody;
    if (!modal || !body) return;

    const data = buildAndSortGlobalRates(state.globalSortKey, state.globalSortDir);
    if (!data.length) {
      body.innerHTML = `<div style="opacity:.7;padding:8px;">（目前沒有全域掉落資料）</div>`;
    } else {
      const rows = data.map(x=>`
        <tr>
          <td>${x.name}</td>
          <td>${fmtPct(x.base)}</td>
          <td>${fmtPct(x.diff)}</td>
          <td>${fmtPct(x.final)}</td>
        </tr>`).join("");
      body.innerHTML = `
        <table class="gdm-table">
          <thead>
            <tr>
              <th>物品名稱</th>
              <th>基準</th>
              <th>含難度</th>
              <th>含難度＋玩家</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="opacity:.7; font-size:12px; margin-top:6px; line-height:1.6;">
          ※ 基準：不含任何加成。含難度：乘上 difficulty.item。<br>
          ※ 含難度＋玩家：再乘上 (1 + player.dropRateBonus)。
        </div>`;
    }
    modal.style.display = "flex";
  }

  // ================= Public API =================
  const API = {
    init(opts={}) {
      state.historyLimit = Math.max(1, Number(opts.historyLimit || 4));
      bindDom();
      updateTotalsUI();
      updateRatesUI();
      ensureRateTimer();
      updateItemsGridUI();
    },
    startSession() {
      if (state.session.running) return;
      state.session.running = true;
      state.session.sessionStartMs = state.session.sessionStartMs || now();
      state.session.lastResumeMs = now();
      ensureRateTimer();
      updateRatesUI();
    },
    pauseSession() {
      if (!state.session.running) return;
      state.session.running = false;
      state.session.activeElapsedMs += (now() - state.session.lastResumeMs);
      state.session.lastResumeMs = 0;
      updateRatesUI();
    },
    resumeSession() {
      if (state.session.running) return;
      state.session.running = true;
      state.session.lastResumeMs = now();
      ensureRateTimer();
    },
    endSession() {
      if (state.session.running) {
        state.session.running = false;
        state.session.activeElapsedMs += (now() - state.session.lastResumeMs);
        state.session.lastResumeMs = 0;
      }
      updateRatesUI();
    },

    // 每次擊殺後呼叫
    record(delta={}, meta, items=[]) {
      ensureBound();
      state.kills += 1;

      const addExp   = Math.max(0, Number(delta.exp   || 0));
      const addGold  = Math.max(0, Number(delta.gold  || 0));
      const addDia   = Math.max(0, Number(
        delta.diamond ?? delta.dia ?? delta.gem ?? 0
      ));
      const addStone = Math.max(0, Number(delta.stone || 0));

      state.totals.exp     += addExp;
      state.totals.gold    += addGold;
      state.totals.diamond += addDia;
      state.totals.stone   += addStone;

      updateTotalsUI();
      updateRatesUI();
      addHistory({ exp:addExp, gold:addGold, diamond:addDia, stone:addStone }, meta);
      recordItems(items);
    },

    reset() {
      state.totals = { exp:0, gold:0, diamond:0, stone:0 };
      state.kills  = 0;
      state.items.clear();
      if (ensureBound()) {
        els.history.innerHTML = '<div class="empty">目前尚無掉落紀錄</div>';
      }
      updateTotalsUI();
      updateRatesUI();
      updateItemsGridUI();
    },

    autoHookLog() { hookLog(); }
  };

  window.RewardTracker = API;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => API.init());
  } else {
    API.init();
  }
})();