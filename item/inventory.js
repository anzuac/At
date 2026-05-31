// === inventory.js — 分頁分類 + 自動分類版（SaveHub 版） ===
//
// 1) 分頁：藥水、票券、強化類、素材
// 2) 自動依名稱分類（掉落自動進背包就會顯示在對應分頁）
// 3) 兼容舊 API：addItem / removeItem / getItemQuantity / createInventoryDropdown
// 4) 可用 setItemCategory 覆寫分類
// 5) 使用 SaveHub 持久化（沒有 SaveHub 時就只存在記憶體 + saveGame）

(function (w) {
  "use strict";

  // ===== SaveHub 設定 =====
  const SH = w.SaveHub || null;
  const SAVEHUB_NS = "inventory_v1";

  // 初始背包（SaveHub 沒資料時當作預設）
  function freshInventory() {
    return {
      "裝備解放石": 8,
      "高級潛能方塊":5,
      "附加閃炫方塊":0,
      "高級附加方塊":0,
       "結合方塊":0,
       "怪物硬幣SLR":0,
       "保護券":0,
       "緩爆護符":0,
       "附加結合方塊":0,
 "王國銀幣":10,
       "王國金幣":1,
       "王國銅幣":50,
       "咒文痕跡":0
    };
  }

  // 將任意物件整理成「道具名：整數數量>=0」
function normalizeInventory(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;

  // 如果是 SaveHub 的 { _ver, data } 包裝，取裡面的 data
  if (raw.data && typeof raw.data === "object" && typeof raw._ver !== "undefined") {
    raw = raw.data;
  }

  for (const k in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
    // ⚠ 版本 / 內部欄位一律忽略
    if (String(k)[0] === "_") continue;

    const n = Math.floor(Number(raw[k]) || 0);
    if (n > 0) out[k] = n;
  }
  return out;
}

  // 在 SaveHub 註冊 namespace（若有提供 API）
  (function registerInventoryNamespace() {
    if (!SH) return;
    try {
      const schema = {
        version: 1,
        migrate: old => normalizeInventory(old || {}),
      };
      if (typeof SH.registerNamespaces === "function") {
        const pack = {};
        pack[SAVEHUB_NS] = schema;
        SH.registerNamespaces(pack);
      } else if (typeof SH.registerNamespace === "function") {
        SH.registerNamespace(SAVEHUB_NS, schema);
      }
    } catch (e) {
      console && console.warn && console.warn("[inventory] SaveHub register failed:", e);
    }
  })();

  function shReadInventory() {
    if (!SH) return null;
    try {
      if (typeof SH.get === "function") return SH.get(SAVEHUB_NS, null);
      if (typeof SH.read === "function") return SH.read(SAVEHUB_NS, null);
    } catch (e) {
      console && console.warn && console.warn("[inventory] SaveHub read failed:", e);
    }
    return null;
  }

  function shWriteInventory(data) {
    if (!SH) return;
    try {
      if (typeof SH.set === "function") {
        SH.set(SAVEHUB_NS, data);
      } else if (typeof SH.write === "function") {
        SH.write(SAVEHUB_NS, data);
      }
    } catch (e) {
      console && console.warn && console.warn("[inventory] SaveHub write failed:", e);
    }
  }

  // ===== 背包本體：先從 SaveHub 讀，沒有就用預設 =====
  let inventory = (() => {
    const base = freshInventory();
    const loaded = shReadInventory();
    if (!loaded) return { ...base };
    const normalized = normalizeInventory(loaded);
    // 預設道具 + SaveHub 覆蓋
    return { ...base, ...normalized };
  })();

  function saveInventory() {
    // 只有有 SaveHub 才會寫入；沒有就單純依賴 saveGame() / 其他機制
    if (!SH) return;
    const payload = normalizeInventory(inventory);
    shWriteInventory(payload);
  }

  // 類別定義（鍵：代號；值：顯示）
  const CATEGORIES = {
    potion:  "藥水",
    ticket:  "消耗券",
    enhance: "強化類",
    2:       "潛能類",
    material:"素材",
  };
  const CATEGORY_ORDER = ["potion", "ticket", "enhance", "2", "material"];

  // —— 自動分類規則（優先順序由上到下） ——
  const AUTO_RULES = [
    // 藥水 / 回復品
    { cat: "potion",  re: /(藥|藥水|藥劑|回復|恢復|治療|HP|MP|補血|補魔)/i },

    // 票券
    { cat: "ticket",  re: /(券|票|憑證|卷|ticket)/i },

    // 潛能 / 方塊
    { cat: "2",       re: /(方塊|潛能)/i },

    // 強化類
    { cat: "enhance", re: /(強化|突破|星力|衝星|升級|精鍊|精煉|鍛造|強化石|升級石|寶珠|符文|附魔)/i },

    // 素材
    { cat: "material", re: /(素材|材料|碎片|結晶|精華|礦|石|木|皮|骨|毛)/i },
  ];

  // 道具 → 類別對照表（手動覆寫／快取結果用）
  const ITEM_META = {
    // 先放已知（可省略，靠自動分類即可）
    "sp點數券": { cat: "ticket" },
    "技能強化券": { cat: "ticket" },
    "衝星石": { cat: "enhance" },
    "飾品突破石": { cat: "enhance" },
    "飾品星力強化石": { cat: "enhance" },
    "飾品強化石": { cat: "enhance" },
    "元素碎片": { cat: "material" },
    "精華":     { cat: "material" },
    "任務獎牌": { cat: "material" },
  };

  // 分頁中即使為 0 也強制顯示的項目
  const ALWAYS_SHOW = {
    potion:   [],
    ticket:   ["sp點數券", "技能強化券"],
    enhance:  ["飾品強化石", "飾品突破石", "飾品星力強化石", "衝星石"],
    material: ["任務獎牌", "元素碎片", "精華"],
  };

  // —— 工具：分類 —— //

  // 自動依名稱判斷類別；沒命中則 material
  function autoCategoryByName(name) {
    for (const rule of AUTO_RULES) {
      if (rule.re.test(String(name))) return rule.cat;
    }
    return "material";
  }

  // 取得道具類別：有手動→用手動；沒有→計算後快取
  function getItemCategory(name) {
    const cfg = ITEM_META[name];
    if (cfg && CATEGORIES[cfg.cat]) return cfg.cat;
    const cat = autoCategoryByName(name);
    ITEM_META[name] = { cat }; // 快取
    return cat;
  }

  // 手動覆寫類別
  function setItemCategory(name, cat) {
    if (!CATEGORIES[cat]) cat = "material";
    ITEM_META[name] = ITEM_META[name] || {};
    ITEM_META[name].cat = cat;
    refreshInventoryUI();
  }

  // —— UI：背包彈窗 —— //

  function openInventoryModal() {
    if (document.getElementById("inventoryModal")) return;

    const backdrop = document.createElement("div");
    backdrop.id = "inventoryBackdrop";
    Object.assign(backdrop.style, {
      position: "fixed", inset: "0",
      background: "rgba(0,0,0,0.5)", zIndex: "999"
    });

    const modal = document.createElement("div");
    modal.id = "inventoryModal";
    Object.assign(modal.style, {
      position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
      backgroundColor: "#111827", padding: "0", border: "1px solid #334155",
      borderRadius: "12px", zIndex: "1000", minWidth: "320px", color: "#e5e7eb",
      maxHeight: "75vh", overflow: "hidden", boxShadow: "0 12px 36px rgba(0,0,0,.5)"
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      position: "sticky", top: "0", background: "#0f172a", borderBottom: "1px solid #334155",
      padding: "10px 12px", display: "flex", alignItems: "center",
      justifyContent: "space-between", zIndex: "2"
    });
    const title = document.createElement("div");
    title.textContent = "背包";
    Object.assign(title.style, { fontSize: "14px", fontWeight: "800", letterSpacing: ".5px" });
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✖";
    Object.assign(closeBtn.style, {
      border: "none", background: "#334155", color: "#fff",
      padding: "6px 10px", borderRadius: "8px", cursor: "pointer"
    });
    closeBtn.onclick = () => { modal.remove(); backdrop.remove(); };
    header.appendChild(title); header.appendChild(closeBtn);
    modal.appendChild(header);

    const tabs = document.createElement("div");
    Object.assign(tabs.style, {
      display: "flex", gap: "8px", padding: "8px 12px",
      background: "#0b1220", borderBottom: "1px solid #1f2937", flexWrap: "wrap"
    });
    modal.appendChild(tabs);

    const listWrap = document.createElement("div");
    Object.assign(listWrap.style, {
      padding: "10px 12px 12px 12px",
      maxHeight: "58vh", overflow: "auto"
    });
    modal.appendChild(listWrap);

    const footer = document.createElement("div");
    Object.assign(footer.style, {
      background: "#0f172a", borderTop: "1px solid #334155",
      padding: "8px 12px", display: "flex", justifyContent: "flex-end", gap: "8px"
    });
    const okBtn = document.createElement("button");
    okBtn.textContent = "關閉";
    Object.assign(okBtn.style, {
      border: "none", borderRadius: "8px", padding: "6px 10px",
      background: "#475569", color: "#fff", cursor: "pointer"
    });
    okBtn.onclick = closeBtn.onclick;
    footer.appendChild(okBtn);
    modal.appendChild(footer);

    let activeCat = CATEGORY_ORDER[0];

    function renderTabs() {
      tabs.innerHTML = "";
      CATEGORY_ORDER.forEach(cat => {
        const b = document.createElement("button");
        b.textContent = CATEGORIES[cat];
        Object.assign(b.style, {
          background: (cat === activeCat ? "#1d4ed8" : "#1f2937"),
          color: "#fff", border: "0", padding: "6px 10px",
          borderRadius: "8px", cursor: "pointer", fontWeight: "600"
        });
        b.onclick = () => { activeCat = cat; renderTabs(); renderList(); };
        tabs.appendChild(b);
      });
    }

    function makeRow(name, count) {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "grid", gridTemplateColumns: "1fr auto", gap: "6px",
        padding: "8px 0", borderBottom: "1px dashed #263043", alignItems: "center"
      });
      const left = document.createElement("div"); left.textContent = name;
      const right = document.createElement("div"); right.textContent = "× " + Number(count||0).toLocaleString();
      Object.assign(right.style, { opacity: ".9" });
      row.appendChild(left); row.appendChild(right);
      return row;
    }

    function renderList() {
      listWrap.innerHTML = "";

      const mustSet = new Set(ALWAYS_SHOW[activeCat] || []);
      const items = [];
      for (const name in inventory) {
        if (!Object.prototype.hasOwnProperty.call(inventory, name)) continue;
        if (getItemCategory(name) !== activeCat) continue;
        const n = inventory[name] || 0;
        if (n > 0 || mustSet.has(name)) items.push([name, n]);
      }

      items.sort((a, b) => {
        const da = (b[1] > 0) - (a[1] > 0); // 有數量優先
        if (da !== 0) return da;
        return String(a[0]).localeCompare(String(b[0]), "zh-Hant");
      });

      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = "（此分頁尚無道具）";
        Object.assign(empty.style, { opacity: ".7", padding: "8px 2px" });
        listWrap.appendChild(empty);
        return;
      }

      for (const [name, n] of items) listWrap.appendChild(makeRow(name, n));
    }

    // 提供給外面 refresh 用
    modal._inv = { refresh: renderList };
    backdrop.onclick = (e) => { if (e.target === backdrop) closeBtn.onclick(); };

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    renderTabs(); renderList();
  }

  function refreshInventoryUI() {
    const modal = document.getElementById("inventoryModal");
    modal?._inv?.refresh?.();
  }

  // —— 公用 API —— //

  // 新增道具（自動分類）
  function addItem(name, amount = 1) {
    if (!inventory[name]) inventory[name] = 0;

    // 若未有手動設定則自動判斷分類並快取
    if (!ITEM_META[name]) {
      ITEM_META[name] = { cat: autoCategoryByName(name) };
    }

    inventory[name] += amount;
    refreshInventoryUI();
    saveInventory();
    if (typeof w.saveGame === "function") w.saveGame();
  }

  // 取得數量
  function getItemQuantity(name) {
    return inventory[name] || 0;
  }

  // 扣除道具
  function removeItem(name, amount = 1) {
    if (!inventory[name]) inventory[name] = 0;
    inventory[name] = Math.max(inventory[name] - amount, 0);
    refreshInventoryUI();
    saveInventory();
    if (typeof w.saveGame === "function") w.saveGame();
  }

  // 產生下拉選單（可指定分類）
  function createInventoryDropdown(selectId, includeZeroItems = false, categoryFilter) {
    const select = typeof selectId === "string" ? document.getElementById(selectId) : selectId;
    if (!select) return;

    // 允許用顯示文字 / 代號指定分類
    let catKey = null;
    if (categoryFilter) {
      if (CATEGORIES[categoryFilter]) catKey = categoryFilter;
      else {
        for (const k in CATEGORIES) {
          if (CATEGORIES[k] === categoryFilter) { catKey = k; break; }
        }
      }
    }

    // 強制包含（所有分類）
    const alwaysInclude = new Set();
    for (const c in ALWAYS_SHOW) {
      for (const n of ALWAYS_SHOW[c]) alwaysInclude.add(n);
    }

    select.innerHTML = "";
    const entries = [];
    for (const name in inventory) {
      if (!Object.prototype.hasOwnProperty.call(inventory, name)) continue;
      const cat = getItemCategory(name);
      if (catKey && cat !== catKey) continue;
      const count = inventory[name] || 0;
      if (count <= 0 && !includeZeroItems && !alwaysInclude.has(name)) continue;
      entries.push([name, count]);
    }

    entries.sort((a, b) => {
      const da = (b[1] > 0) - (a[1] > 0);
      if (da !== 0) return da;
      return String(a[0]).localeCompare(String(b[0]), "zh-Hant");
    });

    for (const [name, count] of entries) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = `${name} (${Number(count).toLocaleString()})`;
      select.appendChild(opt);
    }
  }

  // ===== 對外暴露 =====
  w.inventory = inventory;
  w.addItem = addItem;
  w.getItemQuantity = getItemQuantity;
  w.removeItem = removeItem;
  w.createInventoryDropdown = createInventoryDropdown;
  w.openInventoryModal = openInventoryModal;
  w.getItemCategory = getItemCategory;
  w.setItemCategory = setItemCategory;

})(window);