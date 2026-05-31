// shop_token_store_tab.js — 代幣商店（高級/星痕）＋ 兌換商品（兌換券）
// 依賴：shop_hub.js（ShopHub）、背包 API（getItemQuantity/addItem/removeItem）
// 不使用存檔；即時扣除/發放道具

(function (w) {
  "use strict";

  if (!w.ShopHub) { console.error("[shop] ShopHub not found"); return; }

  // ===== 共用：背包/工具 =====
  const HAS_INV = (typeof w.getItemQuantity==="function" && typeof w.addItem==="function" && typeof w.removeItem==="function");
  function inv(name){ if(!HAS_INV) return 0; try { return Math.max(0, Number(w.getItemQuantity(name)||0)); }catch(_){ return 0; } }
  function add(name,n){ if(HAS_INV) w.addItem(name, Math.max(0,Math.floor(n||0))); }
  function remove(name,n){ if(HAS_INV) w.removeItem(name, Math.max(0,Math.floor(n||0))); }
  function logMsg(msg){ if (typeof w.logPrepend==="function") w.logPrepend(msg); else try{ console.log(msg); }catch(e){} }

  // ===== 共用：UI 元件 =====
  function el(tag, css){ const x=document.createElement(tag); if(css) x.style.cssText=css; return x; }
  function pill(txt, color){
    const span=el("span","display:inline-block;padding:3px 8px;border-radius:999px;font-weight:800;font-size:12px;border:1px solid transparent;"+
      (color==="price" ? "background:#0b1220;color:#e5e7eb;border-color:#374151" :
       color==="muted" ? "background:#1f2937;color:#9ca3af;border-color:#374151" :
                         "background:#0b1220;color:#e5e7eb;border-color:#374151"));
    span.textContent = txt; return span;
  }
  function btn(label, on, enabled){
    const b = el("button","padding:6px 10px;border:0;border-radius:10px;font-weight:800;cursor:pointer;background:"+ (enabled?"#1d4ed8":"#374151")+";color:#fff");
    b.textContent = label; b.disabled = !enabled; if (enabled) b.onclick = on; return b;
  }

  // ===== 共用：商店渲染（統一 Tabs / List）=====
  function catName(cat){
    return (cat && (cat.name || cat.title || cat.label)) ? String(cat.name || cat.title || cat.label) : String((cat && cat.id) || "");
  }

  function pickActiveCat(cats, activeId){
    if (!cats || !cats.length) return null;
    for (let i=0;i<cats.length;i++){ if (cats[i].id === activeId) return cats[i]; }
    return cats[0];
  }

  function renderTabsBar(root, cats, getActiveId, setActiveId, rerender){
    if (!cats || !cats.length) return;
    const bar = el("div","display:flex;gap:8px;margin:6px 0 10px 0;flex-wrap:wrap;");
    cats.forEach((cat) =>{
      const active = (getActiveId() === cat.id);
      const b = el("button","border:0;padding:6px 10px;border-radius:8px;font-weight:700;cursor:pointer;background:"+(active?"#1d4ed8":"#1f2937")+";color:#fff;");
      b.textContent = catName(cat);
      b.onclick = function(){
        if (getActiveId() !== cat.id){
          setActiveId(cat.id);
          rerender(root);
        }
      };
      bar.appendChild(b);
    });
    root.appendChild(bar);
  }

  function renderEmpty(root, emptyText){
    const empty = el("div","padding:10px;opacity:.75;");
    empty.textContent = emptyText || "（沒有商品）";
    root.appendChild(empty);
  }

  function renderList(root, list, rowFn, emptyText){
    if (!list || !list.length){ renderEmpty(root, emptyText); return; }
    list.forEach((def) =>{ rowFn(root, def); });
  }

  function rerenderCategorizedShop(root, cats, getActiveId, headerFn, tabsFn, rowFn, emptyText){
    root.innerHTML = "";
    headerFn(root);
    tabsFn(root);
    const cat = pickActiveCat(cats, getActiveId());
    renderList(root, (cat && cat.list) ? cat.list : [], (r, def) =>{ rowFn(r, cat, def); }, emptyText);
  }

  // ============================================================
  // ================ 分頁 A：代幣商店（一般商店） ================
  // ============================================================

  const TOKEN_ADV  = { key: "高級代幣" };
  const TOKEN_STAR = { key: "星痕代幣" };

  // 代幣商店商品格式（刻意做成與「兌換商品」同一風格）
  // { name, outItem, outQty, cost }
  const ADV_LIST = [
    { name:"星痕代幣",       outItem:"星痕代幣",       outQty:5,  cost:1 },

    { name:"銀行代幣",       outItem:"銀行代幣",       outQty:1,  cost:1 }
  ];
  const STAR_LIST = [
    { name:"強化道具兌換券",           outItem:"強化道具兌換券",           outQty:30,  cost:1 },
    { name:"擴充護盾上限石",     outItem:"擴充護盾上限石",     outQty:1,  cost:10 },
    { name:"護盾補充器",         outItem:"護盾補充器",         outQty:1,  cost:5 },
    { name:"生命藥水",           outItem:"生命藥水",           outQty:10, cost:1 },
    { name:"法力藥水",           outItem:"法力藥水",           outQty:10, cost:1 },
    { name:"高級生命藥水",       outItem:"高級生命藥水",       outQty:5,  cost:2 },
    { name:"高級法力藥水",       outItem:"高級法力藥水",       outQty:5,  cost:2 },
    { name:"超級生命藥水",       outItem:"超級生命藥水",       outQty:1,  cost:2 },
    { name:"超級法力藥水",       outItem:"超級法力藥水",       outQty:1,  cost:2 },
    { name:"SP點數券",           outItem:"SP點數券",           outQty:1,  cost:2 },

    { name:"Boss挑戰券",         outItem:"Boss挑戰券",         outQty:1,  cost:12 }
  ];

  const TOKEN_CATS = [
    { id: "adv",  title: "高級代幣", tokenKey: TOKEN_ADV.key,  list: ADV_LIST },
    { id: "star", title: "星痕代幣", tokenKey: TOKEN_STAR.key, list: STAR_LIST }
  ];
  let _activeTokenCatId = "adv";
  const TOKEN_QTYS = [1, 10, 50];

  function getTokenQty(tokenKey){ return inv(tokenKey); }

  function tokenExchangeOnce(tokenKey, def, units, root){
    if (!HAS_INV) { alert("❌ 缺少背包 API（getItemQuantity/removeItem/addItem）。"); return; }
    units = Math.max(1, Math.floor(units||1));
    const need = units * def.cost;
    const have = getTokenQty(tokenKey);
    if (have < need) { alert("❌ 代幣不足，需要："+need+"，持有："+have); return; }
    const before = have;
    const ok = remove(tokenKey, need);
    const after = getTokenQty(tokenKey);
    if (ok === false || after > before - need) { alert("❌ 扣除代幣失敗，請稍後再試。"); return; }
    add(def.outItem, def.outQty * units);
    logMsg("🛒 兌換成功：獲得「"+def.name+"」 ×"+(def.outQty*units)+"（花費「"+tokenKey+"」 "+need+"）");
    alert("✅ 兌換成功！「"+def.name+"」 ×"+(def.outQty*units));
    rerenderTokenStore(root);
  }

  function renderTokenHeader(root){
    const cat = TOKEN_CATS.find((c) =>{ return c.id===_activeTokenCatId; }) || TOKEN_CATS[0];
    const head = el("div","display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;");
    const title = el("div","font-weight:800;font-size:16px;letter-spacing:.5px;");
    title.innerHTML = "🪙 代幣商店（"+catName(cat)+"）";
    const bal = el("div","background:#0b1220;border:1px solid #334155;padding:6px 10px;border-radius:8px;");
    bal.textContent = "持有「"+cat.tokenKey+"」： " + getTokenQty(cat.tokenKey).toLocaleString();
    head.appendChild(title);
    head.appendChild(bal);
    root.appendChild(head);
  }

  function renderTokenTabs(root){
    renderTabsBar(
      root,
      TOKEN_CATS,
      () =>{ return _activeTokenCatId; },
      (id) =>{ _activeTokenCatId = id; },
      rerenderTokenStore
    );
  }


  function renderTokenRow(root, tokenKey, def){
    const row = el("div","display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid #334155;border-radius:10px;background:#0b1220;margin-bottom:8px;gap:8px;");
    const left = el("div","display:flex;flex-direction:column;");
    const title = el("div","font-weight:700;font-size:14px;letter-spacing:.3px;");
    title.textContent = def.name + (def.outQty>1 ? (" ×"+def.outQty) : "");
    const sub = el("div","opacity:.85;font-size:12px;margin-top:2px;");
    sub.textContent = "每 1 次需「"+tokenKey+"」 × "+def.cost + (def.outQty>1 ? ("（每次獲得 ×"+def.outQty+"）") : "");
    left.appendChild(title); left.appendChild(sub);

    const right = el("div","display:flex;gap:6px;");
    const have = getTokenQty(tokenKey);
    function make(units){
      const need = units * def.cost;
      const can = have >= need;
      return btn("×"+units+"（需 "+need+"）", () =>{ tokenExchangeOnce(tokenKey, def, units, root); }, can);
    }
    TOKEN_QTYS.forEach((u) =>{ right.appendChild(make(u)); });

    row.appendChild(left); row.appendChild(right);
    root.appendChild(row);
  }

  function rerenderTokenStore(root){
    rerenderCategorizedShop(
      root,
      TOKEN_CATS,
      () =>{ return _activeTokenCatId; },
      renderTokenHeader,
      renderTokenTabs,
      (r, cat, def) =>{ renderTokenRow(r, cat.tokenKey, def); },
      "（沒有商品）"
    );
  }


  function renderTokenStore(root){
    if (!HAS_INV){
      const warn = el("div","padding:10px;color:#fecaca;background:#7f1d1d;border:1px solid #b91c1c;border-radius:8px;");
      warn.textContent = "❌ 缺少背包 API（getItemQuantity/removeItem/addItem）。無法使用代幣商店。";
      root.appendChild(warn);
      return;
    }
    rerenderTokenStore(root);
  }

  // 註冊分頁：代幣商店
  w.ShopHub.registerTab({
    id: "tokenStore",
    title: "代幣商店",
    render: renderTokenStore
  });

  // ============================================================
  // =============== 分頁 B：兌換商品（兌換券） ==================
  // ============================================================

  const COUPON_KEY = "強化道具兌換券";
  const EQUIP_LIST = [
    { name: "裝備解放石",       cost: 30 },
    { name: "裝備階級石",       cost: 30 },

    { name: "混沌選擇券",       cost: 200 },
    { name: "星火",       cost: 50 },
    { name: "高級星火",       cost: 130 },
    { name: "永恆星火",       cost: 450 },

    { name: "能力方塊",     cost: 90 },
    { name: "卷軸上限提升",     cost: 120 },
    { name: "恢復卷軸",         cost: 120 },
    { name: "完美重置卷軸",     cost: 800 }
  ];
  const GENERAL_LIST = [
    { name: "元素碎片",     cost: 1 },
    { name: "衝星石",       cost: 2 },
    { name: "進階石",       cost: 10 },
    { name: "元素精華",     cost: 25 },
    { name: "飾品進化石",   cost: 3 },
    { name: "飾品星力石",   cost: 3 },
    { name: "飾品突破石",   cost: 12 },
    { name: "生命強化石",   cost: 5 },
    { name: "生命突破石",   cost: 7 },
    { name: "核心強化石",   cost: 10 },
    { name: "核心覺醒石",   cost: 12 },
    { name: "核心星力石",   cost: 7 }
  ];
  const GENERAL2_LIST = [

    { name: "潛能方塊",         cost: 40 },
    { name: "高級潛能方塊",     cost: 90 },
    { name: "閃炫方塊",     cost: 180 },
    { name: "結合方塊",     cost: 350 },
    { name: "附加方塊",         cost: 80 },
    { name: "高級附加方塊",     cost: 180 },
    { name: "附加閃炫方塊",     cost: 350 },
    { name: "附加結合方塊",     cost: 550 },

    { name: "能力方塊",     cost: 90 },
  ];
  const CATS = [
    { id: "general", title: "素材/核心", list: GENERAL_LIST },
    { id: "equip",   title: "裝備相關",   list: EQUIP_LIST },
        { id: "general2", title: "方塊", list: GENERAL2_LIST },
  ];
  let _activeCatId = "general";

  function getCouponQty(){ return inv(COUPON_KEY); }

  function exchangeOnce(itemName, units, costPerUnit, root){
    if (!HAS_INV) { alert("❌ 缺少背包 API（getItemQuantity/removeItem/addItem）。"); return; }
    units = Math.max(1, Math.floor(units||1));
    const need = units * costPerUnit;
    const have = getCouponQty();
    if (have < need) { alert("❌ 兌換券不足，需要："+need+"，持有："+have); return; }
    const before = have;
    const ok = remove(COUPON_KEY, need);
    const after = getCouponQty();
    if (ok === false || after > before - need) { alert("❌ 扣除兌換券失敗，請稍後再試。"); return; }
    add(itemName, units);
    logMsg("🎁 兌換成功：獲得「"+itemName+"」 ×"+units+"（花費兌換券 "+need+"）");
    alert("✅ 兌換成功！「"+itemName+"」 ×"+units);
    rerenderCoupon(root);
  }

  function mkQtyBtn(label, can, onClick){
    return btn(label, onClick, can);
  }

  function renderCouponRow(root, def){
    const row = el("div","display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid #334155;border-radius:10px;background:#0b1220;margin-bottom:8px;gap:8px;");
    const left = el("div","display:flex;flex-direction:column;");
    const title = el("div","font-weight:700;font-size:14px;letter-spacing:.3px;"); title.textContent = def.name;
    const sub = el("div","opacity:.85;font-size:12px;margin-top:2px;"); sub.textContent = "每 1 個需「"+COUPON_KEY+"」 × "+def.cost;
    left.appendChild(title); left.appendChild(sub);

    const right = el("div","display:flex;gap:6px;");
    const have = getCouponQty();
    function make(label, units){
      const need = units * def.cost;
      const can = have >= need;
      return mkQtyBtn(label+"（需 "+need+"）", can, () =>{ exchangeOnce(def.name, units, def.cost, root); });
    }
    right.appendChild(make("×1", 1));
    right.appendChild(make("×10", 10));
    right.appendChild(make("×50", 50));
right.appendChild(make("×5000", 5000));
    row.appendChild(left); row.appendChild(right);
    root.appendChild(row);
  }

  function renderCouponHeader(root){
    const head = el("div","display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;");
    const title = el("div","font-weight:800;font-size:16px;letter-spacing:.5px;"); title.innerHTML = "🎟️ 兌換商品（使用「"+COUPON_KEY+"」）";
    const bal = el("div","background:#0b1220;border:1px solid #334155;padding:6px 10px;border-radius:8px;");
    bal.textContent = "持有「"+COUPON_KEY+"」： " + getCouponQty().toLocaleString();
    head.appendChild(title); head.appendChild(bal); root.appendChild(head);
  }

  function renderCouponTabs(root){
    renderTabsBar(
      root,
      CATS,
      () =>{ return _activeCatId; },
      (id) =>{ _activeCatId = id; },
      rerenderCoupon
    );
  }


  function rerenderCoupon(root){
    rerenderCategorizedShop(
      root,
      CATS,
      () =>{ return _activeCatId; },
      renderCouponHeader,
      renderCouponTabs,
      (r, cat, def) =>{ renderCouponRow(r, def); },
      "（沒有商品）"
    );
  }


  function renderCouponTab(root){
    if (!HAS_INV){
      const warn = el("div","padding:10px;color:#fecaca;background:#7f1d1d;border:1px solid #b91c1c;border-radius:8px;");
      warn.textContent = "❌ 缺少背包 API（getItemQuantity/removeItem/addItem）。無法使用兌換功能。";
      root.appendChild(warn); return;
    }
    rerenderCoupon(root);
  }

  // 註冊分頁：兌換商品
  w.ShopHub.registerTab({
    id: "couponExchange",
    title: "兌換商品",
    render: renderCouponTab
  });
// ============================================================
  // =============== 分頁 C：咒文痕跡兌換（強化卷） ===============
  // ============================================================

  // 咒文痕跡（卷軸兌換 / 消耗來源）
const TRACE_KEY = "咒文痕跡";

const TRACE_LIST = [

  // ───────────────
  // 通用裝備（非手套 / 非武器）
  // ───────────────
  { key: "attr_scroll_60", name: "屬性強化卷60%", cost: 300 },
  { key: "attr_scroll_10", name: "屬性強化卷10%", cost: 500 },
  { key: "attr_atk_scroll_45", name: "屬性攻擊強化卷45%", cost: 400 },
  { key: "attr_atk_scroll_7",  name: "屬性攻擊強化卷7%",  cost: 700 },

  // ───────────────
  // 手套專用
  // ───────────────
  { key: "glove_scroll_60", name: "手套強化卷60%", cost: 300 },
  { key: "glove_scroll_30", name: "手套強化卷30%", cost: 450 },
  { key: "glove_scroll_7",  name: "手套強化卷7%",  cost: 700 },

  // ───────────────
  // 武器專用
  // ───────────────
  { key: "weapon_scroll_70", name: "武器強化卷70%", cost: 400 },
  { key: "weapon_scroll_30", name: "武器強化卷30%", cost: 600 },
  { key: "weapon_scroll_10", name: "武器強化卷10%", cost: 800 },
  { key: "weapon_scroll_1",  name: "武器強化卷1%",  cost: 1500 },

  // ───────────────
  // 混沌（不修改規則）
  // ───────────────
  { key: "chaos_scroll_60",      name: "混沌卷軸60%",     cost: 700 },
  { key: "chaos_scroll_plus_60", name: "高級混沌卷軸60%", cost: 1000 }
];

  function getTraceQty(){ return inv(TRACE_KEY); }

  function exchangeTraceOnce(itemName, units, costPerUnit, root){
    if (!HAS_INV){
      alert("❌ 缺少背包 API，無法兌換。");
      return;
    }
    units = Math.max(1, Math.floor(units||1));
    const need = units * costPerUnit;
    const have = getTraceQty();
    if (have < need){
      alert("❌ 咒文痕跡不足，需要："+need+"，持有："+have);
      return;
    }
    const before = have;
    const ok = remove(TRACE_KEY, need);
    const after = getTraceQty();
    if (ok === false || after > before - need){
      alert("❌ 扣除咒文痕跡失敗。");
      return;
    }
    add(itemName, units);
    logMsg("🔮 兌換成功：「"+itemName+"」 ×"+units+"（花費："+need+" 咒文痕跡）");
    alert("✅ 兌換成功！獲得「"+itemName+"」 ×"+units);
    rerenderTrace(root);
  }

  function renderTraceRow(root, def){
    const row = el("div","display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid #334155;border-radius:10px;background:#0b1220;margin-bottom:8px;gap:8px;");
    const left = el("div","display:flex;flex-direction:column;");
    const title = el("div","font-weight:700;font-size:14px;letter-spacing:.3px;");
    title.textContent = def.name;
    const sub = el("div","opacity:.85;font-size:12px;margin-top:2px;");
    sub.textContent = "每 1 個需「"+TRACE_KEY+"」 × "+def.cost;
    left.appendChild(title);
    left.appendChild(sub);

    const right = el("div","display:flex;gap:6px;");
    const have = getTraceQty();
    function make(label, units){
      const need = units * def.cost;
      const can = have >= need;
      return mkQtyBtn(label+"（需 "+need+"）", can, () =>{
        exchangeTraceOnce(def.name, units, def.cost, root);
      });
    }

    // ×1 / ×10 / ×50 → 都是正常兌換：數量 × cost
    right.appendChild(make("×1", 1));
    right.appendChild(make("×10", 10));
    right.appendChild(make("×50", 50));

    row.appendChild(left);
    row.appendChild(right);
    root.appendChild(row);
  }

  function renderTraceHeader(root){
    const head = el("div","display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;");
    const title = el("div","font-weight:800;font-size:16px;letter-spacing:.5px;");
    title.innerHTML = "🔮 咒文痕跡兌換（強化卷軸）";
    const bal = el("div","background:#0b1220;border:1px solid #334155;padding:6px 10px;border-radius:8px;");
    bal.textContent = "持有「"+TRACE_KEY+"」： " + getTraceQty().toLocaleString();
    head.appendChild(title);
    head.appendChild(bal);
    root.appendChild(head);
  }

  function rerenderTrace(root){
    root.innerHTML = "";
    renderTraceHeader(root);
    renderList(root, TRACE_LIST, (r, def) =>{ renderTraceRow(r, def); }, "（沒有商品）");
  }


  function renderTraceTab(root){
    if (!HAS_INV){
      const warn = el("div","padding:10px;color:#fecaca;background:#7f1d1d;border:1px solid #b91c1c;border-radius:8px;");
      warn.textContent = "❌ 缺少背包 API，無法使用咒文痕跡兌換。";
      root.appendChild(warn);
      return;
    }
    rerenderTrace(root);
  }

  // 註冊分頁：咒文痕跡兌換
  w.ShopHub.registerTab({
    id: "traceExchange",
    title: "咒文痕跡兌換",
    render: renderTraceTab
  });
})(window);