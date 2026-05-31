// =======================
// shop_system.js (stable)
// 支援：1) 原本彈窗 openShopModal()  2) 掛到 ShopHub 分頁（自動偵測並註冊）
// 新增：轉職寶珠交易（買：50,000 楓幣；賣：40,000 楓幣）
// 修正：避免反覆重建導致輸入被清空；ShopHub 容器非 HTMLElement 時不會空白
// =======================

(function (w) {
  "use strict";

  // --- 簡易背包備援（若未接背包 API） ---
  function getQty(name) {
    if (typeof w.getItemQuantity === "function") return w.getItemQuantity(name) || 0;
    w.player._bag = w.player._bag || {};
    return w.player._bag[name] || 0;
  }
  function addIt(name, n) {
    if (typeof w.addItem === "function") return w.addItem(name, n);
    w.player._bag = w.player._bag || {};
    w.player._bag[name] = (w.player._bag[name] || 0) + n;
  }
  function rmIt(name, n) {
    if (typeof w.removeItem === "function") return w.removeItem(name, n);
    w.player._bag = w.player._bag || {};
    w.player._bag[name] = Math.max(0, (w.player._bag[name] || 0) - n);
  }

  // --- 原本彈窗 ---
  function openShopModal() {
    const backdrop = document.createElement("div");
    backdrop.id = "shopBackdrop";
    backdrop.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,.65);
      z-index: 998;
    `;
    backdrop.onclick = (e) => { if (e.target === backdrop) closeShop(); };

    const modal = document.createElement("div");
    modal.id = "shopModal";
    modal.style.cssText = `
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      z-index: 999;
    `;

    const wrap = document.createElement("div");
    wrap.style.cssText = `
      width: min(680px, 96vw);
      max-height: 92vh; overflow: auto;
      background: #121319; color: #eaf0ff;
      border: 1px solid #3b3f5c;
      border-radius: 12px;
      box-shadow: 0 12px 36px rgba(0,0,0,.5);
      font-family: system-ui, Segoe UI, Roboto, Arial, sans-serif;
    `;

    const head = document.createElement("div");
    head.style.cssText = `
      position: sticky; top: 0;
      background: #0f1016;
      padding: 10px 12px;
      border-bottom: 1px solid #2b2f4a;
      border-radius: 12px 12px 0 0;
      display: flex; align-items: center; justify-content: space-between;
    `;
    head.innerHTML = `
      <div style="font-weight:800;letter-spacing:.5px">🛒 商店</div>
      <button id="shopCloseBtn" style="
        background:#333;border:0;color:#fff;border-radius:8px;
        padding:6px 10px;cursor:pointer">✖</button>
    `;

    const body = document.createElement("div");
    body.id = "shopItems";
    body.style.cssText = `
      padding: 12px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    `;

    wrap.appendChild(head);
    wrap.appendChild(body);
    modal.appendChild(wrap);
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    const btn = document.getElementById("shopCloseBtn");
    if (btn) btn.onclick = closeShop;

    renderShopItems(body);             // 初始化一次
    body._shop?.refreshAll?.();        // 顯示時做一次輕量刷新（不會重建 DOM）
  }

  function closeShop() {
    const modal = document.getElementById("shopModal");
    const backdrop = document.getElementById("shopBackdrop");
    if (modal) document.body.removeChild(modal);
    if (backdrop) document.body.removeChild(backdrop);
  }

  // --- UI 小元件 ---
  function sectionCard(titleHTML, innerNode) {
    const card = document.createElement("div");
    card.style.cssText = "background:#191b25;border:1px solid #2f3555;border-radius:10px;padding:10px;";
    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:6px;";
    title.innerHTML = titleHTML;
    card.appendChild(title);
    card.appendChild(innerNode);
    return card;
  }
  function p(text, small) {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = small ? "opacity:.85;font-size:12px" : "";
    return el;
  }
  function niceBtn(text, color) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.style.cssText = `
      display:block;margin:8px 0 0 auto;
      padding:8px 12px;border:none;border-radius:8px;
      background:${color || "#5b8cff"};color:#fff;cursor:pointer;
    `;
    return btn;
  }

  // --- 主渲染（只初始化一次；之後僅 refresh，不整體重建） ---
  function renderShopItems(container) {
    if (!container) {
      container = document.getElementById("shopItems");
      if (!container) return;
    }

    // 避免使用 dataset（有些容器不是 HTMLElement 會報錯）
    if (container._shopInit) return;
    container._shopInit = true;

    container.innerHTML = "";

    // 統一收集各區塊的 refresh
    const refreshers = [];

    // ==== 強化石商店（數量輸入 + 折扣）====
    (function renderStoneShop(){
      const unitPrice = 5; // 5 楓幣/顆

      const wrap = document.createElement("div");
      const box = document.createElement("div");
      box.style.cssText = "border:1px solid #2f3555;border-radius:8px;padding:10px;background:#161a24;color:#eaf0ff;";

      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";

      const lbl = document.createElement("label");
      lbl.textContent = "購買數量：";
      const qtyInput = document.createElement("input");
      qtyInput.type = "number"; qtyInput.min = "1"; qtyInput.step = "1"; qtyInput.value = "1";
      qtyInput.style.cssText = "width:140px;padding:6px;border-radius:6px;border:1px solid #3b426b;background:#0f1320;color:#eaf0ff;";

      const priceText = document.createElement("span");
      priceText.style.cssText = "margin-left:6px;opacity:.9";

      row.appendChild(lbl);
      row.appendChild(qtyInput);
      row.appendChild(priceText);
      box.appendChild(row);

      const tip = p("定價：5 楓幣/顆；滿 1,000 顆 95 折，滿 10,000 顆 9 折。", true);
      tip.style.marginTop = "6px";
      box.appendChild(tip);

      const buyBtn = niceBtn("購買", "#5b8cff");
      box.appendChild(buyBtn);
      wrap.appendChild(box);

      function calcStonePrice(qty) {
        let price = qty * unitPrice;
        if (qty >= 10000) price = Math.floor(price * 0.9);
        else if (qty >= 1000) price = Math.floor(price * 0.95);
        else price = Math.floor(price);
        return price;
      }
      function safeQty() {
        let q = parseInt(qtyInput.value, 10);
        if (!Number.isFinite(q) || q < 1) q = 1;
        return q;
      }
      function refreshPrice() {
        const qty = safeQty();
        const price = calcStonePrice(qty);
        priceText.innerHTML = `應付：<b>${price.toLocaleString()}</b> 楓幣（${qty.toLocaleString()} 顆）`;
      }
      qtyInput.addEventListener("input", refreshPrice);
      refreshPrice();

      buyBtn.onclick = () => {
        const qty = safeQty();
        const price = calcStonePrice(qty);
        if ((w.player?.gold || 0) >= price) {
          w.player.gold -= price;
          w.player.stone = (w.player.stone || 0) + qty;
          w.logPrepend?.(`🪨 成功購買 ${qty.toLocaleString()} 顆強化石！花費 ${price.toLocaleString()} 楓幣`);
          w.updateResourceUI?.();
          refreshPrice(); // 價格區塊維持正確
        } else {
          alert("楓幣不足！");
        }
      };

      container.appendChild(sectionCard("💎 強化石商店", wrap));
      refreshers.push(refreshPrice); // 輕量刷新（不重建 DOM）
    })();

    // ==== 轉職寶珠 交易（買/賣）====
    (function renderJobOrb(){
      const ORB_NAME = "轉職寶珠";
      const BUY_PRICE = 50000;  // 楓幣 → 寶珠
      const SELL_PRICE = 3000; // 寶珠 → 楓幣

      const wrap = document.createElement("div");
      const box = document.createElement("div");
      box.style.cssText = "border:1px solid #2f3555;border-radius:8px;padding:10px;background:#161a24;color:#eaf0ff;display:grid;gap:10px;";
      wrap.appendChild(box);

      // 顯示目前持有
      const own = document.createElement("div");
      own.style.cssText = "opacity:.9;";
      function refreshOwn() {
        own.innerHTML = `持有「${ORB_NAME}」：<b>${getQty(ORB_NAME).toLocaleString()}</b>`;
      }
      refreshOwn();
      box.appendChild(own);

      // 買入
      const buyRow = document.createElement("div");
      buyRow.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";

      const buyLbl = document.createElement("span");
      buyLbl.textContent = "購買數量：";
      const buyInput = document.createElement("input");
      buyInput.type = "number"; buyInput.min = "1"; buyInput.step = "1"; buyInput.value = "1";
      buyInput.style.cssText = "width:120px;padding:6px;border-radius:6px;border:1px solid #3b426b;background:#0f1320;color:#eaf0ff;";
      const buyPriceText = document.createElement("span");

      buyRow.appendChild(buyLbl);
      buyRow.appendChild(buyInput);
      buyRow.appendChild(buyPriceText);

      const buyBtn = niceBtn(`購買（${BUY_PRICE.toLocaleString()}／顆）`, "#4a78ff");
      box.appendChild(buyRow);
      box.appendChild(buyBtn);

      function buyQty() {
        let q = parseInt(buyInput.value, 10);
        if (!Number.isFinite(q) || q < 1) q = 1;
        return q;
      }
      function refreshBuyPrice() {
        const q = buyQty();
        buyPriceText.innerHTML = `應付：<b>${(q*BUY_PRICE).toLocaleString()}</b> 楓幣`;
      }
      buyInput.addEventListener("input", refreshBuyPrice);
      refreshBuyPrice();

      buyBtn.onclick = () => {
        const q = buyQty();
        const cost = q * BUY_PRICE;
        if ((w.player?.gold || 0) < cost) { alert("楓幣不足！"); return; }
        w.player.gold -= cost;
        addIt(ORB_NAME, q);
        w.logPrepend?.(`🌀 購買 ${ORB_NAME} × ${q.toLocaleString()}，花費 ${cost.toLocaleString()} 楓幣`);
        refreshOwn(); refreshBuyPrice();
        w.updateResourceUI?.();
      };

      // 賣出
      const sellRow = document.createElement("div");
      sellRow.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";

      const sellLbl = document.createElement("span");
      sellLbl.textContent = "賣出數量：";
      const sellInput = document.createElement("input");
      sellInput.type = "number"; sellInput.min = "1"; sellInput.step = "1"; sellInput.value = "1";
      sellInput.style.cssText = "width:120px;padding:6px;border-radius:6px;border:1px solid #3b426b;background:#0f1320;color:#eaf0ff;";
      const sellPriceText = document.createElement("span");

      sellRow.appendChild(sellLbl);
      sellRow.appendChild(sellInput);
      sellRow.appendChild(sellPriceText);

      const sellBtn = niceBtn(`賣出（${SELL_PRICE.toLocaleString()}／顆）`, "#6b8f5b");
      box.appendChild(sellRow);
      box.appendChild(sellBtn);

      function sellQty() {
        let q = parseInt(sellInput.value, 10);
        if (!Number.isFinite(q) || q < 1) q = 1;
        return q;
      }
      function refreshSellPrice() {
        const q = sellQty();
        sellPriceText.innerHTML = `可得：<b>${(q*SELL_PRICE).toLocaleString()}</b> 楓幣`;
      }
      sellInput.addEventListener("input", refreshSellPrice);
      refreshSellPrice();

      sellBtn.onclick = () => {
        const q = sellQty();
        const have = getQty(ORB_NAME);
        if (have < q) { alert(`${ORB_NAME} 數量不足！`); return; }
        rmIt(ORB_NAME, q);
        w.player.gold = (w.player.gold || 0) + (q * SELL_PRICE);
        w.logPrepend?.(`💱 賣出 ${ORB_NAME} × ${q.toLocaleString()}，獲得 ${(q*SELL_PRICE).toLocaleString()} 楓幣`);
        refreshOwn(); refreshSellPrice();
        w.updateResourceUI?.();
      };

      container.appendChild(sectionCard("🌀 轉職寶珠 交易", wrap));
      refreshers.push(refreshOwn, refreshBuyPrice, refreshSellPrice); // 輕量刷新
    })();

    // 底部灰按鈕（保留）
    const disabledBtn = document.createElement("button");
    disabledBtn.textContent = "尚未開放購買其他道具";
    disabledBtn.disabled = true;
    disabledBtn.style.cssText = "margin: 4px auto 8px auto; display:block; opacity:.6;";
    container.appendChild(disabledBtn);

    // 對外提供只做「輕量刷新」的方法（不會重建，不會清空輸入框）
    container._shop = {
      refreshAll(){
        for (const fn of refreshers) try { fn(); } catch(e){}
      }
    };
  }

  // --- 如存在 ShopHub，自動註冊成分頁 ---
  function registerToShopHub() {
    if (!w.ShopHub || typeof w.ShopHub.registerTab !== "function") return;

    // 用閉包記住真實 DOM 根節點，tick 時可安全 refresh
    let hubRoot = null;

    w.ShopHub.registerTab({
      id: "shop_main",
      title: "主商店",
      render(container){
        // 建立穩定的真實 DOM 根節點，不直接依賴外部 container 內部結構
        if (container && container.querySelector) {
          hubRoot = container.querySelector(":scope > .shop-root");
        }
        if (!hubRoot) {
          hubRoot = document.createElement("div");
          hubRoot.className = "shop-root";
          if (container && container.appendChild) {
            container.appendChild(hubRoot);
          } else {
            // 極端保底：外部 container 非 DOM，可掛在 body（理論上很少用到）
            document.body.appendChild(hubRoot);
          }
        }

        renderShopItems(hubRoot);       // 初始化一次
        hubRoot._shop?.refreshAll?.();  // 每次顯示僅輕量刷新
      },
      // ShopHub 若會定時呼叫 tick，就只做輕量刷新，避免重建 DOM
      tick(){
        hubRoot?._shop?.refreshAll?.();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", registerToShopHub);
  } else {
    registerToShopHub();
  }

  // 導出
  w.openShopModal = openShopModal;
  w.closeShop = closeShop;
  w.renderShopItems = renderShopItems;

})(window);