// =======================
// shop_material.js — 素材兌換（獨立檔）
// - 可獨立彈窗：openShopMaterialModal()
// - 若有 ShopHub 會自動註冊分頁：id=shop_exchange, title=素材兌換
// - 風格沿用你的深色卡片
// =======================
(function (w) {
  "use strict";

  // ------- 小工具（背包 API 備援）-------
  function getQty(name) {
    if (typeof w.getItemQuantity === "function") return w.getItemQuantity(name) || 0;
    w.player = w.player || {};
    w.player._bag = w.player._bag || {};
    return w.player._bag[name] || 0;
  }
  function addIt(name, n) {
    n = Math.max(0, Math.floor(n || 0));
    if (!n) return;
    if (typeof w.addItem === "function") return w.addItem(name, n);
    w.player = w.player || {};
    w.player._bag = w.player._bag || {};
    w.player._bag[name] = (w.player._bag[name] || 0) + n;
  }
  function rmIt(name, n) {
    n = Math.max(0, Math.floor(n || 0));
    if (!n) return;
    if (typeof w.removeItem === "function") return w.removeItem(name, n);
    w.player = w.player || {};
    w.player._bag = w.player._bag || {};
    var cur = w.player._bag[name] || 0;
    w.player._bag[name] = Math.max(0, cur - n);
  }

  // ------- 楓幣小工具（有全域 API 就用，沒有就用 player.gold）-------
  function getGold() {
    if (typeof w.getGold === "function") return w.getGold() || 0;
    if (typeof w.getMoney === "function") return w.getMoney() || 0;
    w.player = w.player || {};
    return Number(w.player.gold || 0);
  }
  function addGold(n) {
    n = Math.max(0, Math.floor(n || 0));
    if (!n) return;
    if (typeof w.addGold === "function") return w.addGold(n);
    if (typeof w.addMoney === "function") return w.addMoney(n);
    w.player = w.player || {};
    w.player.gold = Number(w.player.gold || 0) + n;
    w.updateResourceUI?.();
  }
  function spendGold(n) {
    n = Math.max(0, Math.floor(n || 0));
    if (!n) return true;
    if (typeof w.spendGold === "function") return w.spendGold(n);
    if (typeof w.spendMoney === "function") return w.spendMoney(n);
    var cur = getGold();
    if (cur < n) return false;
    w.player = w.player || {};
    w.player.gold = cur - n;
    w.updateResourceUI?.();
    return true;
  }

  // ------- UI 小組件 -------
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

  // ------- 核心渲染：把內容塞進 container -------
  function renderMaterialExchange(container) {
    if (!container) return;
    container.innerHTML = "";

    // ==== 元素碎片／進階石／元素精華 兌換 ====
    (function renderExchanges(){
      const wrap = document.createElement("div");

      // 1 元素碎片 → 3 進階石
      const a = document.createElement("div");
      a.style.cssText = "border:1px solid #2f3555;border-radius:8px;padding:10px;background:#161a24;margin:6px 0;";
      a.appendChild(p("1 元素碎片 → 3 進階石"));
      const btnA = niceBtn("兌換", "#6ab06a");
      btnA.onclick = () => {
        if (getQty("元素碎片") >= 1) {
          rmIt("元素碎片", 1);
          addIt("進階石", 3);
          w.logPrepend?.("💎 成功兌換 3 顆進階石！");
          w.updateResourceUI?.();
        } else {
          alert("元素碎片不足！");
        }
      };
      a.appendChild(btnA);
      wrap.appendChild(a);

      // 3 進階石 → 1 元素碎片
      const b = document.createElement("div");
      b.style.cssText = "border:1px solid #2f3555;border-radius:8px;padding:10px;background:#161a24;margin:6px 0;";
      b.appendChild(p("3 進階石 → 1 元素碎片"));
      const btnB = niceBtn("兌換", "#6ab06a");
      btnB.onclick = () => {
        if (getQty("進階石") >= 3) {
          rmIt("進階石", 3);
          addIt("元素碎片", 1);
          w.logPrepend?.("✨ 成功兌換 1 個元素碎片！");
          w.updateResourceUI?.();
        } else {
          alert("進階石不足！");
        }
      };
      b.appendChild(btnB);
      wrap.appendChild(b);

      // 10 元素碎片 → 1 元素精華
      const c = document.createElement("div");
      c.style.cssText = "border:1px solid #2f3555;border-radius:8px;padding:10px;background:#161a24;margin:6px 0;";
      c.appendChild(p("10 元素碎片 → 1 元素精華"));
      const btnC = niceBtn("兌換", "#6ab06a");
      btnC.onclick = () => {
        if (getQty("元素碎片") >= 10) {
          rmIt("元素碎片", 10);
          addIt("元素精華", 1);
          w.logPrepend?.("🔷 成功兌換 1 個元素精華！");
          w.updateResourceUI?.();
        } else {
          alert("元素碎片不足！");
        }
      };
      c.appendChild(btnC);
      wrap.appendChild(c);

      container.appendChild(sectionCard("✨ 元素兌換", wrap));
    })();

    // ==== 潛能解放鑰匙互換 ====
    (function renderKeys(){
      const wrap = document.createElement("div");

      // 3 低階 → 1 中階
      const k1 = document.createElement("div");
      k1.style.cssText = "border:1px solid #2f3555;border-radius:8px;padding:10px;background:#161a24;margin:6px 0;";
      k1.appendChild(p("3 低階潛能解放鑰匙 → 1 中階潛能解放鑰匙"));
      const k1b = niceBtn("兌換", "#9b7bff");
      k1b.onclick = () => {
        const src = "低階潛能解放鑰匙";
        const dst = "中階潛能解放鑰匙";
        if (getQty(src) >= 3) {
          rmIt(src, 3);
          addIt(dst, 1);
          w.logPrepend?.("🗝 成功兌換 1 把「中階潛能解放鑰匙」！");
          w.updateResourceUI?.();
        } else {
          alert("低階潛能解放鑰匙不足！");
        }
      };
      k1.appendChild(k1b);
      wrap.appendChild(k1);

      // 1 中階 → 2 低階
      const k2 = document.createElement("div");
      k2.style.cssText = "border:1px solid #2f3555;border-radius:8px;padding:10px;background:#161a24;margin:6px 0;";
      k2.appendChild(p("1 中階潛能解放鑰匙 → 2 低階潛能解放鑰匙"));
      const k2b = niceBtn("兌換", "#9b7bff");
      k2b.onclick = () => {
        const src = "中階潛能解放鑰匙";
        const dst = "低階潛能解放鑰匙";
        if (getQty(src) >= 1) {
          rmIt(src, 1);
          addIt(dst, 2);
          w.logPrepend?.("🗝 成功兌換 2 把「低階潛能解放鑰匙」！");
          w.updateResourceUI?.();
        } else {
          alert("中階潛能解放鑰匙不足！");
        }
      };
      k2.appendChild(k2b);
      wrap.appendChild(k2);

      // 2 中階 → 1 高階
      const k3 = document.createElement("div");
      k3.style.cssText = "border:1px solid #2f3555;border-radius:8px;padding:10px;background:#161a24;margin:6px 0;";
      k3.appendChild(p("2 中階潛能解放鑰匙 → 1 高階潛能解放鑰匙"));
      const k3b = niceBtn("兌換", "#9b7bff");
      k3b.onclick = () => {
        const src = "中階潛能解放鑰匙";
        const dst = "高階潛能解放鑰匙";
        if (getQty(src) >= 2) {
          rmIt(src, 2);
          addIt(dst, 1);
          w.logPrepend?.("🗝 成功兌換 1 把「高階潛能解放鑰匙」！");
          w.updateResourceUI?.();
        } else {
          alert("中階潛能解放鑰匙不足！");
        }
      };
      k3.appendChild(k3b);
      wrap.appendChild(k3);

      // 1 高階 → 1 中階
      const k4 = document.createElement("div");
      k4.style.cssText = "border:1px solid #2f3555;border-radius:8px;padding:10px;background:#161a24;margin:6px 0;";
      k4.appendChild(p("1 高階潛能解放鑰匙 → 1 中階潛能解放鑰匙"));
      const k4b = niceBtn("兌換", "#9b7bff");
      k4b.onclick = () => {
        const src = "高階潛能解放鑰匙";
        const dst = "中階潛能解放鑰匙";
        if (getQty(src) >= 1) {
          rmIt(src, 1);
          addIt(dst, 1);
          w.logPrepend?.("🗝 成功兌 1 把「中階潛能解放鑰匙」！");
          w.updateResourceUI?.();
        } else {
          alert("高階潛能解放鑰匙不足！");
        }
      };
      k4.appendChild(k4b);
      wrap.appendChild(k4);

      container.appendChild(sectionCard("🗝 潛能解放鑰匙 互換", wrap));
    })();

    // ==== 被動能力券 / 技能強化券 兌換（1:1 + 10萬楓幣）====
    (function renderTickets() {
      const COST = 100000;
      const wrap = document.createElement("div");

      // 被動能力券 → 技能強化券
      const t1 = document.createElement("div");
      t1.style.cssText = "border:1px solid #2f3555;border-radius:8px;padding:10px;background:#161a24;margin:6px 0;";
      t1.appendChild(p("1 被動能力券 → 1 技能強化券（消耗 100,000 楓幣）"));
      const t1b = niceBtn("兌換", "#e3b341");
      t1b.onclick = () => {
        const src = "被動能力券";
        const dst = "技能強化券";
        if (getQty(src) < 1) {
          alert("被動能力券不足！");
          return;
        }
        if (getGold() < COST) {
          alert("楓幣不足！需要 100,000 楓幣。");
          return;
        }
        rmIt(src, 1);
        addIt(dst, 1);
        spendGold(COST);
        w.logPrepend?.("🎫 成功將 1 張「被動能力券」兌換為「技能強化券」，消耗 100,000 楓幣。");
        w.updateResourceUI?.();
      };
      t1.appendChild(t1b);
      wrap.appendChild(t1);

      // 技能強化券 → 被動能力券
      const t2 = document.createElement("div");
      t2.style.cssText = "border:1px solid #2f3555;border-radius:8px;padding:10px;background:#161a24;margin:6px 0;";
      t2.appendChild(p("1 技能強化券 → 1 被動能力券（消耗 100,000 楓幣）"));
      const t2b = niceBtn("兌換", "#e3b341");
      t2b.onclick = () => {
        const src = "技能強化券";
        const dst = "被動能力券";
        if (getQty(src) < 1) {
          alert("技能強化券不足！");
          return;
        }
        if (getGold() < COST) {
          alert("楓幣不足！需要 100,000 楓幣。");
          return;
        }
        rmIt(src, 1);
        addIt(dst, 1);
        spendGold(COST);
        w.logPrepend?.("🎫 成功將 1 張「技能強化券」兌換為「被動能力券」，消耗 100,000 楓幣。");
        w.updateResourceUI?.();
      };
      t2.appendChild(t2b);
      wrap.appendChild(t2);

      container.appendChild(sectionCard("🎫 能力券互換", wrap));
    })();

    // 底部灰按鈕（保留）
    const disabledBtn = document.createElement("button");
    disabledBtn.textContent = "尚未開放更多兌換";
    disabledBtn.disabled = true;
    disabledBtn.style.cssText = "margin: 4px auto 8px auto; display:block; opacity:.6;";
    container.appendChild(disabledBtn);
  }

  // ------- 獨立彈窗（可不依賴 ShopHub）-------
  function openShopMaterialModal() {
    const id = "shopMaterialModal";
    const idBackdrop = "shopMaterialBackdrop";
    document.getElementById(id)?.remove();
    document.getElementById(idBackdrop)?.remove();

    const backdrop = document.createElement("div");
    backdrop.id = idBackdrop;
    backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:998;";
    backdrop.onclick = (e)=>{ if (e.target === backdrop) close(); };

    const modal = document.createElement("div");
    modal.id = id;
    modal.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:999;";
    const wrap = document.createElement("div");
    wrap.style.cssText = `
      width:min(680px,96vw);max-height:92vh;overflow:auto;
      background:#121319;color:#eaf0ff;border:1px solid #3b3f5c;border-radius:12px;
      box-shadow:0 12px 36px rgba(0,0,0,.5);font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;
    `;
    const head = document.createElement("div");
    head.style.cssText = `
      position:sticky;top:0;background:#0f1016;padding:10px 12px;
      border-bottom:1px solid #2b2f4a;border-radius:12px 12px 0 0;
      display:flex;align-items:center;justify-content:space-between;
    `;
    head.innerHTML = `
      <div style="font-weight:800;letter-spacing:.5px">🔁 素材兌換</div>
      <button id="shopMaterialCloseBtn" style="background:#333;border:0;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer">✖</button>
    `;
    const body = document.createElement("div");
    body.id = "shopMaterialBody";
    body.style.cssText = "padding:12px;display:grid;grid-template-columns:1fr;gap:12px;";

    wrap.appendChild(head);
    wrap.appendChild(body);
    modal.appendChild(wrap);
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    document.getElementById("shopMaterialCloseBtn").onclick = close;
    renderMaterialExchange(body);

    function close(){
      document.getElementById(id)?.remove();
      document.getElementById(idBackdrop)?.remove();
    }
  }

  // ------- 若存在 ShopHub，註冊成分頁 -------
  function registerToShopHub() {
    if (!w.ShopHub || typeof w.ShopHub.registerTab !== "function") return;
    w.ShopHub.registerTab({
      id: "shop_exchange",
      title: "素材兌換",
      render: function(container){ renderMaterialExchange(container); },
      tick: function(){}
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", registerToShopHub);
  } else {
    registerToShopHub();
  }

  // 對外
  w.openShopMaterialModal = openShopMaterialModal;
  w.ShopMaterial = { render: renderMaterialExchange };

})(window);