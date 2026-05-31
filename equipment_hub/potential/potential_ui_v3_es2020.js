// =======================================================
// potential_ui_v2_es2020.js — 潛能 UI（直立版：收合 + 機率表彈窗 + 保底移到洗方塊區）
// 依賴：window.PotentialCoreV2（可能晚於 UI 載入）
//      window.player
//      window.getItemQuantity / window.openInventoryModal（可選）
// =======================================================
(function (w, d) {
  "use strict";
  if (!w || !d) return;
  if (w.PotentialUIV2) return;

  // -----------------------------
  // DOM utils
  // -----------------------------
  function el(tag, props, children) {
    const node = d.createElement(tag);
    if (props) {
      for (const k in props) if (Object.prototype.hasOwnProperty.call(props, k)) {
        if (k === "style") {
          const s = props.style;
          if (typeof s === "string") {
            node.setAttribute("style", s);
          } else {
            for (const sk in s) if (Object.prototype.hasOwnProperty.call(s, sk)) node.style[sk] = s[sk];
          }
        } else if (k === "className") node.className = props[k];
        else if (k === "text") node.textContent = props[k];
        else node.setAttribute(k, props[k]);
      }
    }
    if (children && children.length) {
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (c == null) continue;
        node.appendChild(typeof c === "string" ? d.createTextNode(c) : c);
      }
    }
    return node;
  }
  function n(x) { return Number(x || 0); }
  function clamp(v, a, b) { v = n(v); return Math.max(a, Math.min(b, v)); }
  function safe(fn, fb) { try { return fn(); } catch (_) { return fb; } }

  function fmtSignedInt(x) {
    x = Math.floor(Number(x || 0));
    const sign = x >= 0 ? "+" : "";
    return sign + x.toLocaleString();
  }
  function fmtPct(x, digits) {
    digits = (digits == null ? 2 : digits);
    return (Number(x || 0) * 100).toFixed(digits) + "%";
  }


  // -----------------------------
  // Combine Cube Modal entry (global-safe)
  // -----------------------------
  w.potui2_openCombineModal = function (which) {
    // which: "main" or "add"
    which = (which === "add") ? "add" : "main";
    const core = w.PotentialCoreV2 || w.PotentialCoreV1;
    if (!core) { alert("潛能核心未載入"); return; }
    if (!core.getState || !core.drawMainCombine || !core.confirmMainCombine) { alert("潛能核心版本不支援結合方塊"); return; }

    const slot = getSelectedSlot();

    function getQty(itemName) {
      try {
        if (typeof w.getItemQuantity === "function") return n(w.getItemQuantity(itemName));
      } catch (e) {}
      const p = w.player || {};
      // common: player.items[itemName] or inventory map/array
      if (p.items && p.items[itemName] != null) return n(p.items[itemName]);
      if (p.inventory && p.inventory[itemName] != null) return n(p.inventory[itemName]);
      if (Array.isArray(p.inventory)) {
        for (let i = 0; i < p.inventory.length; i++) {
          const it = p.inventory[i];
          if (!it) continue;
          if ((it.id && it.id === itemName) || (it.key && it.key === itemName) || (it.name && it.name === itemName)) return n(it.qty || it.count || it.amount || 0);
        }
      }
      if (Array.isArray(p.items)) {
        for (let j = 0; j < p.items.length; j++) {
          const it2 = p.items[j];
          if (!it2) continue;
          if ((it2.id && it2.id === itemName) || (it2.key && it2.key === itemName) || (it2.name && it2.name === itemName)) return n(it2.qty || it2.count || it2.amount || 0);
        }
      }
      return 0;
    }

    const itemName = (which === "add") ? core.ITEM_ADD_COMBINE : core.ITEM_MAIN_COMBINE;

    // build modal (inline styles to avoid CSS id mismatch)
    const backdrop = d.createElement("div");
    backdrop.style.position = "fixed";
    backdrop.style.left = "0";
    backdrop.style.top = "0";
    backdrop.style.right = "0";
    backdrop.style.bottom = "0";
    backdrop.style.background = "rgba(0,0,0,.55)";
    backdrop.style.zIndex = "99998";

    const modal = d.createElement("div");
    modal.style.position = "fixed";
    modal.style.left = "50%";
    modal.style.top = "50%";
    modal.style.transform = "translate(-50%, -50%)";
    modal.style.width = "min(92vw, 520px)";
    modal.style.maxHeight = "min(86vh, 720px)";
    modal.style.overflow = "auto";
    modal.style.background = "rgba(10,16,26,.96)";
    modal.style.border = "1px solid rgba(255,255,255,.08)";
    modal.style.borderRadius = "16px";
    modal.style.zIndex = "99999";
    modal.style.padding = "14px";

    let selectedLineIndex = null;

    function close() {
      if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    }

    function renderHeader() {
      const qty = getQty(itemName);
      return el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;" }, [
        el("div", { style: "font-weight:800;font-size:16px;" , text: (which === "add") ? "附加結合方塊" : "結合方塊" }),
        el("div", { style: "display:flex;align-items:center;gap:10px;" }, [
          el("div", { id: "potui2_combine_qty", style: "font-size:13px;opacity:.9;", text: "剩餘：" + qty }),
          el("button", { id: "potui2_combine_close_btn", style: "border:0;background:rgba(255,255,255,.08);color:#fff;border-radius:10px;padding:6px 10px;cursor:pointer;", text: "✕" })
        ])
      ]);
    }

    function rerenderQty() {
      const q = modal.querySelector("#potui2_combine_qty");
      if (q) q.textContent = "剩餘：" + getQty(itemName);
    }

    function renderBody() {
      const box = el("div", { }, []);

      // chosen line display
      const chosen = el("div", {
        id: "potui2_combine_chosen",
        style: "margin:10px 0;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);",
        text: "尚未抽選，請按「使用」"
      }, []);

      // 三排能力顯示（抽選後會高亮）
      const linesBox = el("div", { id: "potui2_combine_lines", style: "margin:10px 0;" }, []);
      try {
        const st0 = core.getState && core.getState();
        const node0 = st0 && st0.pots && st0.pots[slot] ? st0.pots[slot][(which === "add") ? "add" : "main"] : null;
        renderLines3(linesBox, node0, false, 0);
      } catch (e) {}

      box.appendChild(chosen);
      box.appendChild(linesBox);

      const btnUse = el("button", { id: "potui2_combine_use", style: "width:100%;border:0;border-radius:12px;padding:10px 12px;background:rgba(80,140,255,.22);color:#fff;font-weight:800;cursor:pointer;", text: "使用結合方塊" });

      const btnRow = el("div", { style: "display:flex;gap:10px;margin-top:10px;" }, [
        el("button", { id: "potui2_combine_reroll", style: "flex:1;border:0;border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.08);color:#fff;font-weight:700;cursor:pointer;", text: "重新抽選" }),
        el("button", { id: "potui2_combine_confirm", style: "flex:1;border:0;border-radius:12px;padding:10px 12px;background:rgba(90,255,170,.18);color:#fff;font-weight:800;cursor:pointer;", text: "確定使用" })
      ]);

      const ruleText = (which === "add")
        ? "規則：附加結合方塊，抽 1~3 排（各 33.33%）。確定使用後，只重洗該排附加潛能；0.5% 機率同外框等級。使用/重抽各扣 1 顆，確定不扣。"
        : "規則：結合方塊，抽 1~3 排（各 33.33%）。確定使用後，只重洗該排主潛能；15% 機率同外框等級。使用/重抽各扣 1 顆，確定不扣。";

      const rules = el("div", { style: "margin-top:10px;font-size:12.5px;opacity:.85;line-height:1.35;", text: ruleText });

      box.appendChild(btnUse);
      box.appendChild(chosen);
      box.appendChild(linesBox);
      box.appendChild(btnRow);
      box.appendChild(rules);

      // handlers
      function doDraw() {
        const r = (which === "add") ? core.drawAddCombine(slot) : core.drawMainCombine(slot);
        if (!r || !r.ok) {
          alert("使用失敗：" + (r && r.reason ? r.reason : "未知"));
          rerenderQty();
          return;
        }
        selectedLineIndex = r.lineIndex || 0;
        chosen.textContent = "抽選結果：第 " + selectedLineIndex + " 排（33.33%）";
        try {
          const st2 = core.getState && core.getState();
          const node2 = st2 && st2.pots && st2.pots[slot] ? st2.pots[slot][(which === "add") ? "add" : "main"] : null;
          renderLines3(linesBox, node2, false, selectedLineIndex);
        } catch (e) {}

        rerenderQty();
      }

      function doConfirm() {
        if (selectedLineIndex === null || selectedLineIndex === undefined) { alert("請先使用/抽選一排"); return; }
        const rr = (which === "add") ? core.confirmAddCombine(slot, selectedLineIndex) : core.confirmMainCombine(slot, selectedLineIndex);
        if (!rr || !rr.ok) { alert("確定使用失敗"); return; }
        // ✅ 不關閉視窗：更新顯示、清除本次抽選（需再次使用/重抽才可再確定）
        selectedLineIndex = null;
        chosen.textContent = "已確定使用完成。可再次按「使用」重新抽選一排。";
        try {
          const st3 = core.getState && core.getState();
          const node3 = st3 && st3.pots && st3.pots[slot] ? st3.pots[slot][(which === "add") ? "add" : "main"] : null;
          renderLines3(linesBox, node3, false, -1);
        } catch (e) {}
        rerenderQty();
        if (typeof refresh === "function") refresh();
      }

      btnUse.onclick = doDraw;
      box.querySelector("#potui2_combine_reroll").onclick = doDraw;
      box.querySelector("#potui2_combine_confirm").onclick = doConfirm;

      return box;
    }

    // mount
    modal.innerHTML = "";
    const header = renderHeader();
    modal.appendChild(header);
    modal.appendChild(renderBody());

    backdrop.onclick = function (e) { if (e.target === backdrop) close(); };
    const cbtn = modal.querySelector("#potui2_combine_close_btn");
    if (cbtn) cbtn.onclick = close;

    d.body.appendChild(backdrop);
    d.body.appendChild(modal);
  };


  // -----------------------------
  // Slots / Labels / Tabs
  // -----------------------------
const SLOT_LABEL = {
  // 武器類
  weapon: "龍魂武器",
  subWeapon: "古代副兵",
  subWeapon2: "核心能源",

  // 防具類
  hat: "王者頭冠",
  top: "龍鱗戰甲",
  bottom: "戰士護腿",
  shoes: "疾風戰靴",
  glove: "巨力護手",
  cape: "賢者披風",
  badge: "榮耀徽印",

  // 飾品類
  eye: "命運之眼",
  face: "古神面飾",
  earring: "龍牙耳環",
  necklace1: "龍之項鍊",
  necklace2: "賢者項鍊",
  ring1: "龍之戒指",
  ring2: "王者戒指",
  ring3: "深淵戒指",
  ring4: "守護戒指"
};
const TABS = [
  {
    key: "weapon",
    title: "武器類",
    slots: ["weapon", "subWeapon", "subWeapon2"]
  },
  {
    key: "equip",
    title: "裝備類",
    slots: ["hat", "top", "bottom", "shoes", "glove", "cape", "badge"]
  },
  {
    key: "acc",
    title: "飾品類",
    slots: ["eye", "face", "earring", "necklace1", "necklace2"]
  },
  {
    key: "ring",
    title: "戒指類",
    slots: ["ring1", "ring2", "ring3", "ring4"]
  }
];
  function tierClass(t) { return "t_" + String(t || "特殊"); }


  function tierAbbr(t) {
    t = String(t || "");
    // 顯示用縮寫：特殊/稀有/罕見/傳說/唯一/永恆 -> S/R/E/L/U/∞
    if (t === "特殊") return "S";
    if (t === "稀有") return "R";
    if (t === "罕見") return "E";
    if (t === "傳說") return "L";
    if (t === "唯一") return "U";
    if (t === "永恆") return "∞";
    return t || "—";
  }


// Tier ordering helpers (for coloring)
const _TIER_ORDER = ["特殊", "稀有", "罕見", "傳說", "唯一", "永恆"];
function tierIndex(t) {
  t = String(t || "特殊");
  for (let i = 0; i < _TIER_ORDER.length; i++) if (_TIER_ORDER[i] === t) return i;
  return 0;
}
function maxTier(a, b) { return (tierIndex(a) >= tierIndex(b)) ? a : b; }
function isEternal(t) { return String(t || "") === "永恆"; }

function getSlotTierInfo(st, slot) {
  let mt = "特殊", at = "特殊";
  if (st && st.pots && st.pots[slot]) {
    const node = st.pots[slot];
    mt = node.main ? String(node.main.tier || "特殊") : "特殊";
    at = node.add  ? String(node.add.tier  || "特殊") : "特殊";
  }
  const hi = maxTier(mt, at);
  const neon = isEternal(mt) && isEternal(at);
  return { mt, at, hi, neon };
}




  // 渲染三排潛能（結合方塊用：可高亮指定排）
  function renderLines3(container, node, glow, selectedIndex) {
    if (!container) return;
    container.innerHTML = "";
    const lines = (node && node.lines) ? node.lines : [];
    selectedIndex = Number(selectedIndex || 0); // 1~3
    for (let i = 0; i < 3; i++) {
      const L = lines[i] || null;
      const t = lineToText(L);
      const isSel = (selectedIndex === (i + 1));
      container.appendChild(el("div", { className: "line " + tierClass(t.tier) + (glow ? " upgradedGlow" : "") + (isSel ? " selectedPick" : "") }, [
        el("div", { className: "l" }, [
          el("div", { className: "lineTop" }, [
            el("span", { className: "tierPill " + tierClass(t.tier) }, [
              el("span", { className: "dot" }),
              el("span", { text: tierAbbr(t.tier) })
            ]),
            (isSel ? el("span", { className: "pickBadge", text: "已抽中" }) : null),
            el("span", { className: "desc", text: t.desc })
          ])
        ]),
        el("div", { className: "v", text: t.val })
      ]));
    }
  }

// -----------------------------
  // 升階/保底規則：以核心為準（UI 只讀取顯示）
  // -----------------------------
  function getRuleUI(which, tier) {
    tier = String(tier || "特殊");
    which = (which === "add") ? "add" : "main";
    try {
      const core = w.PotentialCoreV2;
      if (core && typeof core.getTierRuleTable === "function") {
        const tbl = core.getTierRuleTable(which);
        const r = (tbl && tbl[tier]) ? tbl[tier] : (tbl && tbl["特殊"]);
        if (r) return { pity: n(r.pity), upChance: n(r.upChance) };
      }
    } catch (e) {}
    // fallback（理論上不會用到）
    const fb = { "特殊": { pity: 50, upChance: 0.05 } };
    const rf = fb[tier] || fb["特殊"];
    return { pity: n(rf.pity), upChance: n(rf.upChance) };
  }

  // -----------------------------
  // Collapsible defaults（你要的：單件預設收起）
  // -----------------------------
  const UI_DEFAULT = {
    allOpen: true,          // 全部裝備綜合：預設展開（你也可以改成 false）
    singleOpen: false       // 單件能力：預設收起
  };

  // -----------------------------
  // Style
  // -----------------------------
  function injectStyle() {
  if (d.getElementById("potui-v2-style")) return;

  const style = d.createElement("style");
  style.id = "potui-v2-style";
  style.textContent = `
:root{
  --p2-bg: #0b1220;
  --p2-panel: rgba(15,23,42,.92);
  --p2-panel2: rgba(2,6,23,.55);
  --p2-bd: rgba(148,163,184,.18);
  --p2-bd2: rgba(148,163,184,.26);
  --p2-txt: #e5e7eb;
  --p2-sub: rgba(229,231,235,.72);
  --p2-primary: #2563eb;
  --p2-danger: #dc2626;
  --p2-ok: #10b981;
  --p2-radius: 16px;
  --p2-radius2: 12px;
  --p2-shadow: 0 18px 60px rgba(0,0,0,.55);
  --p2-font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
}

#potui2_backdrop{
  position:fixed; inset:0;
  background:rgba(0,0,0,.62);
  z-index:2100;
}

#potui2_modal{
  position:fixed; left:50%; top:50%;
  transform:translate(-50%,-50%);
  width:min(1100px, calc(100vw - 24px));
  height:min(92vh, 900px);
  background:linear-gradient(180deg, rgba(15,23,42,.96), rgba(2,6,23,.88));
  border:1px solid var(--p2-bd);
  border-radius:20px;
  box-shadow:var(--p2-shadow);
  color:var(--p2-txt);
  overflow:hidden;
  font-family:var(--p2-font);
  z-index:2101;
}

#potui2_header{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px;
  border-bottom:1px solid var(--p2-bd);
  background:rgba(2,6,23,.55);
  backdrop-filter: blur(10px);
}

#potui2_header .title{
  display:flex; flex-direction:column; gap:2px;
  font-weight:950; letter-spacing:.6px;
  font-size:14px;
}
#potui2_header .title small{
  font-size:11px;
  color:var(--p2-sub);
  font-weight:800;
  letter-spacing:.2px;
}

#potui2_header .right{display:flex; gap:8px; align-items:center; flex-wrap:wrap;}

.p2btn{
  border:1px solid var(--p2-bd);
  background:rgba(148,163,184,.10);
  color:var(--p2-txt);
  border-radius:12px;
  padding:8px 10px;
  cursor:pointer;
  font-weight:900;
  font-size:12px;
  transition:transform .05s ease, background .12s ease, border-color .12s ease;
}
.p2btn:hover{background:rgba(148,163,184,.16); border-color:var(--p2-bd2);}
.p2btn:active{transform:translateY(1px);}
.p2btn.primary{background:rgba(37,99,235,.22); border-color:rgba(37,99,235,.55);}
.p2btn.primary:hover{background:rgba(37,99,235,.28);}
.p2btn.danger{background:rgba(220,38,38,.18); border-color:rgba(220,38,38,.55);}
.p2btn.danger:hover{background:rgba(220,38,38,.24);}
.p2btn.ghost{background:transparent;}
.p2btn:disabled{opacity:.55; cursor:not-allowed;}

#potui2_body{
  height:calc(100% - 54px);
  display:grid;
  grid-template-columns: 340px 1fr;
  gap:12px;
  padding:12px;
  overflow:hidden;
}

.p2sidebar{
  overflow:auto;
  padding-right:4px;
}
.p2main{
  overflow:auto;
  padding-right:4px;
}

.card{
  background:var(--p2-panel);
  border:1px solid var(--p2-bd);
  border-radius:var(--p2-radius);
  padding:12px;
  margin-bottom:12px;
}
.card h3{
  margin:0 0 10px 0;
  display:flex; justify-content:space-between; align-items:flex-end;
  gap:10px;
  font-size:13px;
  font-weight:950;
  letter-spacing:.45px;
}
.sub{
  font-size:11px;
  color:var(--p2-sub);
  font-weight:900;
}

.note{margin-top:8px; font-size:11px; color:var(--p2-sub); line-height:1.4;}

.warnBox{
  border:1px solid rgba(245,158,11,.35);
  background:rgba(245,158,11,.10);
  color:#fef3c7;
  border-radius:var(--p2-radius);
  padding:10px 12px;
  font-size:12px;
  font-weight:900;
  white-space:pre-line;
}

.tabsRow{display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;}
.tabBtn{
  border:1px solid var(--p2-bd);
  background:rgba(148,163,184,.08);
  color:var(--p2-txt);
  border-radius:999px;
  padding:7px 10px;
  cursor:pointer;
  font-weight:950;
  font-size:12px;
}
.tabBtn.active{
  background:rgba(37,99,235,.24);
  border-color:rgba(37,99,235,.55);
}

.tabBtn.t_特殊,.tabBtn.t_稀有,.tabBtn.t_罕見,.tabBtn.t_傳說,.tabBtn.t_唯一,.tabBtn.t_永恆{
  border-color: color-mix(in srgb, var(--tier) 65%, rgba(148,163,184,.25));
  box-shadow: 0 0 0 1px rgba(255,255,255,.03) inset;
}
.tabBtn.active.t_特殊,.tabBtn.active.t_稀有,.tabBtn.active.t_罕見,.tabBtn.active.t_傳說,.tabBtn.active.t_唯一,.tabBtn.active.t_永恆{
  background: color-mix(in srgb, var(--tier) 22%, rgba(148,163,184,.08));
  border-color: var(--tier);
  box-shadow: 0 0 0 1px var(--tier) inset, 0 0 14px color-mix(in srgb, var(--tier) 35%, transparent);
}

.slotBtn.t_特殊,.slotBtn.t_稀有,.slotBtn.t_罕見,.slotBtn.t_傳說,.slotBtn.t_唯一,.slotBtn.t_永恆{
  border-color: color-mix(in srgb, var(--tier) 55%, rgba(148,163,184,.25));
}
.slotBtn.active.t_特殊,.slotBtn.active.t_稀有,.slotBtn.active.t_罕見,.slotBtn.active.t_傳說,.slotBtn.active.t_唯一,.slotBtn.active.t_永恆{
  border-color: var(--tier);
  box-shadow: 0 0 0 2px rgba(255,255,255,.03) inset, 0 0 0 3px color-mix(in srgb, var(--tier) 20%, transparent) inset;
}

.slotDots{display:flex; gap:6px; align-items:center;}
.slotDot{
  width:10px; height:10px; border-radius:999px;
  background: var(--tier);
  box-shadow: 0 0 0 2px rgba(255,255,255,.06) inset;
}
.slotMiniTier{display:flex; gap:8px; align-items:center; margin-left:auto;}
.miniTag{
  font-size:11px;
  font-weight:950;
  color:var(--p2-sub);
  display:flex; gap:4px; align-items:center;
}
.miniTag .chip{
  padding:2px 6px;
  border-radius:999px;
  border:1px solid rgba(148,163,184,.25);
  background:rgba(2,6,23,.35);
  color:var(--tier);
  font-weight:950;
}

/* 永恆+永恆特效
   - Slot：方案二（燈泡跑馬燈）
   - Tab：方案一（Aurora Flow 極光流動）
*/
@keyframes p2hueSpin{
  0%{ filter:hue-rotate(0deg); }
  100%{ filter:hue-rotate(360deg); }
}
@keyframes p2bulbRun{
  0%{ transform:rotate(0deg); }
  100%{ transform:rotate(360deg); }
}
@keyframes p2auroraRotate{
  0%{ transform:rotate(0deg); }
  100%{ transform:rotate(360deg); }
}
@keyframes p2auroraDrift{
  0%{ background-position:0% 50%; opacity:.65; }
  50%{ background-position:100% 50%; opacity:.9; }
  100%{ background-position:0% 50%; opacity:.65; }
}

/* ---------- Slot：燈泡跑馬燈 ---------- */
.slotNeon{
  position:relative;
  border:2px solid transparent !important;
  background:
    linear-gradient(rgba(2,6,23,.45), rgba(2,6,23,.45)) padding-box,
    /* 彩虹底 */
    conic-gradient(from 0deg,
      #ff004c, #ffb000, #fff000, #00ff85, #00d9ff, #6a5cff, #c800ff, #ff004c
    ) border-box,
    /* 燈泡段落（分段亮點），用 steps 旋轉製造跑馬燈感 */
    conic-gradient(from 0deg,
      rgba(255,255,255,.95) 0 2.5deg,
      rgba(255,255,255,0) 2.5deg 7.5deg,
      rgba(255,255,255,.55) 7.5deg 9deg,
      rgba(255,255,255,0) 9deg 12deg
    ) border-box !important;
  background-size:auto, auto, auto;
  box-shadow:
    0 0 0 1px rgba(255,255,255,.07) inset,
    0 0 18px rgba(255,255,255,.07),
    0 0 44px rgba(255,255,255,.05);
}
.slotNeon::after{
  content:"";
  position:absolute;
  inset:-2px;
  border-radius:inherit;
  pointer-events:none;
  /* 讓燈泡層在上面跑 */
  background:
    conic-gradient(from 0deg,
      rgba(255,255,255,.95) 0 2.5deg,
      rgba(255,255,255,0) 2.5deg 7.5deg,
      rgba(255,255,255,.55) 7.5deg 9deg,
      rgba(255,255,255,0) 9deg 12deg
    );
  filter:blur(.2px);
  opacity:.9;
  animation:p2bulbRun 1.35s steps(18) infinite, p2hueSpin 2.6s linear infinite;
  mix-blend-mode:screen;
}
.slotNeon .slotDot{ box-shadow:0 0 14px rgba(255,255,255,.18), 0 0 0 2px rgba(255,255,255,.07) inset; }

/* ---------- Tab：Aurora Flow ---------- */
.tabAurora{
  position:relative;
  border:1px solid transparent !important;
}
.tabAurora::before{
  content:"";
  position:absolute;
  inset:-3px;
  border-radius:inherit;
  pointer-events:none;
  background:
    conic-gradient(from 0deg,
      rgba(255,110,196,.95),
      rgba(120,115,245,.95),
      rgba(34,211,238,.95),
      rgba(74,222,128,.95),
      rgba(250,204,21,.95),
      rgba(255,110,196,.95)
    );
  filter:blur(8px);
  opacity:.75;
  animation:p2auroraRotate 7.8s linear infinite;
}
.tabAurora::after{
  content:"";
  position:absolute;
  inset:-3px;
  border-radius:inherit;
  pointer-events:none;
  background:
    linear-gradient(90deg,
      rgba(255,255,255,0) 0%,
      rgba(255,255,255,.35) 20%,
      rgba(255,255,255,0) 45%,
      rgba(255,255,255,.22) 60%,
      rgba(255,255,255,0) 100%
    );
  background-size:220% 100%;
  filter:blur(6px);
  mix-blend-mode:screen;
  animation:p2auroraDrift 2.8s ease-in-out infinite;
}


.slotRow{display:grid; gap:8px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); align-items:stretch;}
.slotBtn{
  border:1px solid var(--p2-bd);
  background:rgba(2,6,23,.40);
  color:var(--p2-txt);
  border-radius:12px;
  padding:9px 10px;
  cursor:pointer;
  font-weight:950;
  font-size:12px;
  display:flex; align-items:center; gap:8px;
  width:100%;
}
.slotBtn.active{border-color:rgba(37,99,235,.65); box-shadow:0 0 0 3px rgba(37,99,235,.12) inset;}
.slotInfo{display:flex; flex-direction:column; gap:2px; min-width:0; flex:1;}
.slotName{font-size:12px; font-weight:950; color:var(--p2-txt); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.slotSubline{display:flex; gap:10px; align-items:center; font-size:11px; color:var(--p2-sub); font-weight:900;}
.slotSubline .lbl{opacity:.9;}
.slotSubline .val{font-weight:950; color:var(--tier);}
.slotBtn .mini{font-size:11px; color:var(--p2-sub); font-weight:900;}
.slotBtn .stat{font-size:11px; font-weight:950;}

.foldBtn{
  width:100%;
  display:flex; justify-content:space-between; align-items:center;
  border:1px solid var(--p2-bd);
  background:rgba(148,163,184,.08);
  color:var(--p2-txt);
  border-radius:12px;
  padding:9px 10px;
  cursor:pointer;
  font-weight:950;
  font-size:12px;
  margin:8px 0 10px;
}
.foldBtn .hint{color:var(--p2-sub); font-weight:900; font-size:11px;}

.foldBody{display:block;}

.sumGrid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
}
.sumSection{ margin-top:10px; }
.sumTitle{ font-size:12px; font-weight:950; color:var(--p2-sub); margin:4px 0 8px; letter-spacing:.2px; }
.allFilter{ margin-bottom:8px; }

.summaryGrid{ /* alias for old className */
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
}
.sumItem{
  border:1px solid var(--p2-bd);
  background:rgba(2,6,23,.40);
  border-radius:12px;
  padding:10px;
  display:flex; justify-content:space-between; align-items:center;
}
.sumItem .k{font-size:12px; font-weight:950; color:var(--p2-sub);}
.sumItem .v{font-size:13px; font-weight:950;}

.sectionGrid2{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
}
@media (max-width: 1020px){
  .sectionGrid2{grid-template-columns:1fr;}
}

.frameRow{display:flex; gap:10px; align-items:center; justify-content:space-between; margin:8px 0 10px;}
.frameBadge{
  display:flex; align-items:center; gap:8px;
  border:1px solid var(--p2-bd);
  background:rgba(2,6,23,.40);
  border-radius:999px;
  padding:7px 10px;
  font-weight:950;
  font-size:12px;
}
.frameBadge .dot{
  width:8px; height:8px; border-radius:999px;
  background:rgba(16,185,129,.85);
}

.pityBox{
  border:1px solid var(--p2-bd);
  background:rgba(148,163,184,.06);
  border-radius:12px;
  padding:10px;
  margin-bottom:10px;
}
.pityTop{display:flex; justify-content:space-between; align-items:center; gap:10px; font-weight:950; font-size:12px;}
.pitySub{font-size:11px; color:var(--p2-sub); font-weight:900; margin-top:6px;}
.pityBar{
  height:10px; border-radius:999px; overflow:hidden;
  background:rgba(2,6,23,.55);
  border:1px solid var(--p2-bd);
  margin-top:8px;
}
.pityFill{height:100%; width:0%; background:rgba(37,99,235,.75);}

.lines{display:flex; flex-direction:column; gap:8px; margin-top:10px;}

.line{
  border:1px solid var(--p2-bd);
  background:rgba(2,6,23,.45);
  border-radius:12px;
  padding:10px;
  margin-bottom:0;
  display:flex; justify-content:space-between; align-items:center;
  gap:10px;
}
.line .l{font-size:12px; font-weight:950;}
.line .r{font-size:12px; font-weight:950; color:var(--p2-sub);}

@media (max-width: 860px){
  #potui2_body{grid-template-columns: 1fr;}
  .p2sidebar{order:2;}
  .p2main{order:1;}
}

#potui2_prob_backdrop{
  position:fixed; inset:0;
  background:rgba(0,0,0,.62);
  z-index:2200;
}
#potui2_prob_modal{
  position:fixed; left:50%; top:50%;
  transform:translate(-50%,-50%);
  width:min(860px, calc(100vw - 24px));
  height:min(86vh, 720px);
  border-radius:20px;
  overflow:hidden;
  border:1px solid var(--p2-bd);
  background:linear-gradient(180deg, rgba(15,23,42,.96), rgba(2,6,23,.88));
  box-shadow:var(--p2-shadow);
  color:var(--p2-txt);
  font-family:var(--p2-font);
  z-index:2201;
}
#potui2_prob_header{
  display:flex; justify-content:space-between; align-items:center;
  padding:12px 14px;
  border-bottom:1px solid var(--p2-bd);
  background:rgba(2,6,23,.55);
}
#potui2_prob_body{padding:12px; height:calc(100% - 54px); overflow:auto;}

.tbl{width:100%; border-collapse:separate; border-spacing:0 8px; font-size:12px;}
.tbl th{opacity:.85; text-align:left; padding:6px 8px;}
.tbl td{
  background:rgba(2,6,23,.45);
  border:1px solid var(--p2-bd);
  padding:10px 8px;
  font-weight:900;
  border-radius:12px;
}
.rowTag{
  padding:4px 8px;
  border-radius:999px;
  border:1px solid rgba(51,211,153,.35);
  background:rgba(2,6,23,.35);
  font-weight:950;
  font-size:11px;
}

/* Tier colors (outer/inner frame)
   特殊/稀有/罕見/傳說/唯一：僅用於顯示外框/內框，不影響機率與計算
*/
.t_特殊{ --tier: #9ca3af; }  /* gray */
.t_稀有{ --tier: #3b82f6; }  /* blue */
.t_罕見{ --tier: #22c55e; }  /* green */
.t_傳說{ --tier: #a855f7; }  /* purple */
.t_唯一{ --tier: #f59e0b; }  /* orange */
.t_永恆{ --tier: #ef4444; }  /* red */

.frameBadge{ box-shadow: 0 0 0 3px rgba(255,255,255,.04) inset; }
.frameBadge.t_特殊,
.frameBadge.t_稀有,
.frameBadge.t_罕見,
.frameBadge.t_傳說,
.frameBadge.t_唯一,
.frameBadge.t_永恆{
  border-color: var(--tier);
  box-shadow:
    0 0 0 1px var(--tier) inset,
    0 0 0 6px rgba(255,255,255,.03) inset;
}
.frameBadge .dot{ background: var(--tier); }

.line{
  border-color: rgba(148,163,184,.20);
  box-shadow: 0 0 0 2px rgba(255,255,255,.02) inset;
}
.line.t_特殊,
.line.t_稀有,
.line.t_罕見,
.line.t_傳說,
.line.t_唯一,
.line.t_永恆{
  border-color: var(--tier);
  box-shadow:
    0 0 0 1px var(--tier) inset,
    0 0 0 6px rgba(255,255,255,.02) inset;
}

.tierPill{
  display:inline-flex; align-items:center; gap:8px;
  border-radius:999px;
  padding:4px 8px;
  border:1px solid rgba(148,163,184,.22);
  background:rgba(2,6,23,.35);
  font-weight:950;
  font-size:11px;
}
.tierPill .dot{ width:8px; height:8px; border-radius:999px; background: var(--tier, #9ca3af); }

/* -------- Roll Modal (cube wash) -------- */
#potui2_roll_backdrop{
  position:fixed; inset:0; background:rgba(0,0,0,.55);
  z-index:1000006;
}
#potui2_roll_modal{
  position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(860px, calc(100vw - 32px));
  max-height:calc(100vh - 32px);
  overflow:hidden;
  background:var(--p2-panel);
  border:1px solid var(--p2-bd2);
  border-radius:16px;
  box-shadow:0 24px 80px rgba(0,0,0,.55);
  z-index:1000007;
}
/* --- Flashy modal (independent UI) --- */
#potui2_flashy_backdrop{
  position:fixed; inset:0; background:rgba(0,0,0,.55);
  z-index:1000010;
}
#potui2_flashy_modal{
  position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(720px, calc(100vw - 32px));
  max-height:calc(100vh - 32px);
  overflow:hidden;
  background:var(--p2-panel);
  border:1px solid var(--p2-bd2);
  border-radius:16px;
  box-shadow:0 24px 80px rgba(0,0,0,.55);
  z-index:1000011;
}
.potui2_flashy_header{
  display:flex; align-items:center; justify-content:space-between;
  padding:14px 14px 10px 14px;
  border-bottom:1px solid var(--p2-bd);
}
.potui2_flashy_title{
  font-size:16px; font-weight:700;
}
.potui2_flashy_close{
  border:1px solid var(--p2-bd2);
  background:rgba(2,6,23,.35);
  color:var(--p2-txt);
  border-radius:12px;
  padding:8px 12px;
}
.potui2_flashy_body{
  padding:14px;
  overflow:auto;
  max-height:calc(100vh - 32px - 56px);
}
.potui2_flashy_grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
}
.potui2_flashy_box{
  border:1px solid var(--p2-bd);
  background:rgba(2,6,23,.35);
  border-radius:14px;
  padding:12px;
}
.potui2_flashy_box h4{
  margin:0 0 10px 0;
  font-size:14px;
  color:var(--p2-sub);
}
.potui2_flashy_line{
  display:flex; align-items:center; justify-content:space-between;
  border:1px solid var(--p2-bd);
  background:rgba(2,6,23,.25);
  border-radius:14px;
  padding:10px 12px;
  margin:10px 0;
  cursor:pointer;
}

.potui2_flashy_left{display:flex; align-items:center; gap:10px; min-width:0;}
.potui2_flashy_badge{
  display:inline-flex; align-items:center; justify-content:center;
  width:28px; height:28px; border-radius:10px;
  border:1px solid var(--p2-bd2);
  background:rgba(2,6,23,.35);
  font-weight:800; font-size:12px;
  flex:0 0 auto;
}
.potui2_flashy_idx{opacity:.7; font-size:12px; width:18px; text-align:right; flex:0 0 auto;}
.potui2_flashy_txt{flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.potui2_flashy_check{font-weight:900; font-size:16px; opacity:.95; padding-left:8px;}
.potui2_flashy_line.sel{
  border-color:rgba(34,197,94,.75);
  background:rgba(34,197,94,.10);
  box-shadow:0 0 0 2px rgba(34,197,94,.20) inset, 0 10px 30px rgba(0,0,0,.25);
}
.potui2_flashy_line.applied{
  cursor:default;
  border-color:rgba(37,99,235,.55);
  background:rgba(37,99,235,.08);
}

.potui2_flashy_line.sel{
  border-color:rgba(37,99,235,.75);
  box-shadow:0 0 0 2px rgba(37,99,235,.25) inset;
}
.potui2_flashy_actions{
  display:flex; gap:10px; justify-content:flex-end;
  padding-top:10px;
}
.potui2_flashy_btn{
  border:1px solid var(--p2-bd2);
  background:rgba(2,6,23,.35);
  color:var(--p2-txt);
  border-radius:14px;
  padding:10px 12px;
}
.potui2_flashy_btn.pri{
  border-color:rgba(37,99,235,.55);
  background:rgba(37,99,235,.25);
}
.potui2_flashy_btn:disabled{ opacity:.5; }

#potui2_roll_header{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px;
  border-bottom:1px solid var(--p2-bd);
}
#potui2_roll_body{ padding:14px; overflow:auto; max-height:calc(100vh - 140px); }
.rollTop{
  display:flex; gap:10px; flex-wrap:wrap; align-items:center;
  padding:10px; border:1px solid var(--p2-bd); border-radius:12px;
  background:var(--p2-panel2);
  margin-bottom:12px;
}
.rollTop .pill{ display:inline-flex; gap:8px; align-items:center; padding:6px 10px; border-radius:999px; border:1px solid var(--p2-bd); }
.rollGrid{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.rollBox{ border:1px solid var(--p2-bd); border-radius:14px; background:rgba(2,6,23,.35); overflow:hidden; }
.rollBox h4{ margin:0; padding:10px 12px; border-bottom:1px solid var(--p2-bd); display:flex; justify-content:space-between; align-items:center; font-size:14px; }
.rollBox .lines{ padding:10px 10px 12px; }
.rollBox .badgeUp{
  padding:3px 8px; border-radius:999px; font-size:12px;
  border:1px solid rgba(250,204,21,.35);
  background:rgba(250,204,21,.12);
}
.rollBox.upgraded{ border-color:rgba(250,204,21,.45); box-shadow:0 0 0 1px rgba(250,204,21,.18) inset; }
.rollActions{ display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
.rollActions .grow{ flex:1; }
.rollHint{ margin-top:10px; color:var(--p2-sub); font-size:12px; line-height:1.5; }
/* Emphasize upgraded tier pill */
.line.upgradedGlow{ box-shadow:0 0 0 1px rgba(250,204,21,.28) inset; }
.pickBadge{ margin-left:8px; padding:2px 8px; border-radius:999px; font-size:12px; font-weight:800; color:#052010; background:rgba(34,197,94,.9); box-shadow:0 0 0 1px rgba(255,255,255,.18) inset; }
.line.selectedPick{ position:relative; box-shadow:0 0 0 2px rgba(34,197,94,.85) inset, 0 0 18px rgba(34,197,94,.35); background:rgba(34,197,94,.06); animation:p2_pickPulse 1.2s ease-in-out infinite; }
/* Flashy picker */
.flashyPicker{ margin-top: 10px; padding: 10px; border: 1px solid var(--p2-bd); border-radius: 14px; background: rgba(2,6,23,.35); }
.flashyTitle{ font-size: 12px; color: rgba(226,232,240,.85); margin: 8px 0; }
.flashyChoices{ display: grid; grid-template-columns: 1fr; gap: 8px; }
.flashyOpt{ display:flex; gap:10px; align-items:flex-start; padding:10px; border:1px solid var(--p2-bd); border-radius:12px; background: rgba(15,23,42,.55); }
.flashyOpt input{ margin-top: 4px; }
.flashyOptBody{ flex:1; }
.flashyCur{ margin: 6px 0 10px 0; }
.flashyNote{ margin-top:10px; font-size:11px; color: rgba(148,163,184,.9); line-height:1.4; }



/* combine modal helpers */
.p2pill{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:12px 14px;
  border:1px solid var(--p2-bd);
  border-radius:14px;
  background:rgba(15,23,42,.55);
}
.btnRow{
  display:flex;
  gap:10px;
}
.btnRow .p2btn{
  flex:1;
}
`;
  d.head.appendChild(style);
}

  // -----------------------------
  // Labels
  // -----------------------------
  function statLabel(stat) {
    switch (stat) {
      case "str": return "STR";
      case "agi": return "AGI";
      case "int": return "INT";
      case "luk": return "LUK";
      case "atk": return "ATK";
      case "def": return "DEF";
      case "hp":  return "HP";
      case "mp":  return "MP";
      default: return String(stat || "").toUpperCase();
    }
  }
function statLabelZH(stat) {
  stat = String(stat || "");
  if (!stat) return "";

  // 先統一格式（處理 BOSSDAMAGE / TOTALDAMAGE 這種）
  const raw = stat;
  stat = stat.trim();

  // 別名表：UI彙總可能用的 key（大寫/無底線）
  if (stat === "BOSSDAMAGE") return "Boss傷害";
  if (stat === "TOTALDAMAGE") return "總傷害";

  // 也順手支援一些常見變形
  const lower = stat.toLowerCase();
  if (lower === "bossdamage") return "Boss傷害";
  if (lower === "totaldamage") return "總傷害";

  // =============================
  // 主屬性（單一）
  // =============================
  if (lower === "str") return "力量";
  if (lower === "dex" || lower === "agi") return "敏捷";
  if (lower === "int") return "智力";
  if (lower === "luk") return "幸運";

  // =============================
  // 基礎數值（固定值）
  // =============================
  if (lower === "atk") return "攻擊力";
  if (lower === "def") return "防禦力";
  if (lower === "hp")  return "HP";
  if (lower === "mp")  return "MP";

  // =============================
  // 百分比／戰鬥相關（核心 stat 代號）
  // =============================
  if (stat === "atkPct")         return "攻擊力";
  if (stat === "allStat")        return "全屬性";
  if (stat === "totalDmgPct")    return "總傷害";
  if (stat === "bossDmgPct")     return "Boss傷害";
  if (stat === "ignoreDefPct")   return "無視防禦力";
  if (stat === "critRate")       return "爆擊率";
  if (stat === "critMultiplier") return "爆擊傷害";
  if (stat === "attackSpeedPct") return "攻擊速度";
  if (stat === "dodgePercent" || stat === "evadePct") return "迴避率";

  // =============================
  // 飾品三抽一（bundle 用）
  // =============================
  if (stat === "expRate")  return "經驗值";
  if (stat === "mesoRate") return "金幣";
  if (stat === "dropRate") return "掉落";

  return "";
}


  // line display（對齊 PotentialCoreV2 的 id/meta 結構）

  // line display（對齊 PotentialCoreV2 的 id/meta 結構）
  // ✅ 顯示優化：以「屬性名稱 + 數值」為主（例如：力量 +9.00%）
  function lineToText(line) {
    if (!line) return { tier: "—", desc: "（空）", val: "" };

    const id = String(line.id || "");
    const tier = String(line.tier || "");
    const v = n(line.value);
    const meta = line.meta || {};
    const stat = meta.stat || "";

    function pctVal(x){ return "+" + fmtPct(x, 2); }
    function flatVal(x){ return fmtSignedInt(x); }

    // bundle（帽子被擊回血、飾品三抽一）
    if (meta && meta.stats) {
      const s = meta.stats || {};
      // 帽子：被擊回血
      if (id === "HAT_ONHIT_HEAL" && (s.onHitHealChance != null) && (s.onHitHealHpPct != null)) {
        return {
          tier,
          desc: "被擊後恢復HP",
          val: (fmtPct(n(s.onHitHealChance), 1) + " 機率 / " + fmtPct(n(s.onHitHealHpPct), 1) + " HP")
        };
      }
      // 披風：被擊回 MP（CAPE_ONHIT_MP）
      if (id === "CAPE_ONHIT_MP" && (s.onHitHealChance != null) && (s.onHitHealMpPct != null)) {
        return {
          tier,
          desc: "被擊後恢復MP",
          val: (fmtPct(n(s.onHitHealChance), 1) + " 機率 / " + fmtPct(n(s.onHitHealMpPct), 1) + " MP")
        };
      }

      // 徽章：攻擊回 HP（BADGE_ONATTACK_HP）
      if (id === "BADGE_ONATTACK_HP" && (s.onAttackHealChance != null) && (s.onAttackHealHpPct != null)) {
        return {
          tier,
          desc: "攻擊時恢復HP",
          val: (fmtPct(n(s.onAttackHealChance), 1) + " 機率 / " + fmtPct(n(s.onAttackHealHpPct), 1) + " HP")
        };
      }

      // 下衣：攻擊回 MP（BOTTOM_ONATTACK_MP）
      if (id === "BOTTOM_ONATTACK_MP" && (s.onAttackHealChance != null) && (s.onAttackHealMpPct != null)) {
        return {
          tier,
          desc: "攻擊時恢復MP",
          val: (fmtPct(n(s.onAttackHealChance), 1) + " 機率 / " + fmtPct(n(s.onAttackHealMpPct), 1) + " MP")
        };
      }
      // 飾品：經驗/金幣/掉落
      if (id === "ACC_EXP_MESO_DROP") {
        const exp = (s.expRate != null) ? ("經驗值 " + pctVal(n(s.expRate))) : "";
        const meso = (s.mesoRate != null) ? ("金幣 " + pctVal(n(s.mesoRate))) : "";
        const drop = (s.dropRate != null) ? ("掉落 " + pctVal(n(s.dropRate))) : "";
        const parts = [];
        if (exp) parts.push(exp);
        if (meso) parts.push(meso);
        if (drop) parts.push(drop);
        return { tier, desc: "三抽一", val: parts.join(" / ") };
      }
      // fallback：把 bundle 直接 JSON 顯示（方便除錯）
      return { tier, desc: id || "特效", val: JSON.stringify(s) };
    }

    // 主屬性（會帶 meta.stat = str/dex/int/luk）
    if (id.indexOf("MAINSTAT_FLAT_") === 0) return { tier, desc: statLabelZH(stat) || "主屬性", val: flatVal(v) };
    if (id.indexOf("MAINSTAT_PCT_") === 0)  return { tier, desc: statLabelZH(stat) || "主屬性", val: pctVal(v) };

    // 全屬性
    if (id.indexOf("ALLSTAT_FLAT_") === 0) return { tier, desc: "全屬性", val: flatVal(v) };
    if (id.indexOf("ALLSTAT_PCT_") === 0)  return { tier, desc: "全屬性", val: pctVal(v) };

    // 其他：統一用 meta.stat 來顯示（核心新版多數都會帶）
    if (stat) {
      const label = statLabelZH(stat) || statLabel(stat) || stat;
      // value < 1 視為百分比（0.30 = 30%）；>=1 視為固定值
      const isPct = (Math.abs(v) > 0 && Math.abs(v) < 1);
      return { tier: tier || "—", desc: label, val: isPct ? pctVal(v) : flatVal(v) };
    }

    return { tier: tier || "—", desc: id || "未知詞條", val: String(line.value || "") };
  }

  // -----------------------------
  // Summary (只顯示你說會計算的 8 項)
  // -----------------------------
  const SUMMARY_KEYS = ["str", "agi", "int", "luk", "atk", "def", "hp", "mp"];

  function collectBonusForSlot(player, slot) {
    player = player || w.player;
    const out = {};
    for (let i = 0; i < SUMMARY_KEYS.length; i++) out[SUMMARY_KEYS[i]] = 0;
    if (!player || !player.PotentialBonus || !player.PotentialBonus.bonusData) return out;

    const bd = player.PotentialBonus.bonusData;
    const km = "potential_" + slot + "_main";
    const ka = "potential_" + slot + "_add";
    const m = bd[km] || {};
    const a = bd[ka] || {};

    function merge(obj) {
      for (const k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) {
        if (SUMMARY_KEYS.indexOf(k) >= 0) out[k] += n(obj[k]);
      }
    }
    merge(m); merge(a);
    return out;
  }


  function collectBonusAll(player) {
    player = player || w.player;
    const out = {};
    for (let i = 0; i < SUMMARY_KEYS.length; i++) out[SUMMARY_KEYS[i]] = 0;
    if (!player || !player.PotentialBonus) return out;

    // ✅ 優先：core 修正版會提供 uiTotal（不參與加成池，避免翻倍）
    if (player.PotentialBonus.uiTotal && typeof player.PotentialBonus.uiTotal === "object") {
      const ut = player.PotentialBonus.uiTotal;
      for (const k1 in ut) if (Object.prototype.hasOwnProperty.call(ut, k1)) {
        if (SUMMARY_KEYS.indexOf(k1) >= 0) out[k1] += n(ut[k1]);
      }
      return out;
    }

    const bd = player.PotentialBonus.bonusData || {};

    // 相容舊版：若還有 bd.potential_all 就讀它
    const all = bd.potential_all;
    if (all && typeof all === "object") {
      for (const k2 in all) if (Object.prototype.hasOwnProperty.call(all, k2)) {
        if (SUMMARY_KEYS.indexOf(k2) >= 0) out[k2] += n(all[k2]);
      }
      return out;
    }

    // 最後 fallback：現場把各來源加總（排除 potential_all）
    for (const key in bd) if (Object.prototype.hasOwnProperty.call(bd, key)) {
      if (key === "potential_all") continue;
      const obj = bd[key];
      if (!obj || typeof obj !== "object") continue;
      for (const kk in obj) if (Object.prototype.hasOwnProperty.call(obj, kk)) {
        if (SUMMARY_KEYS.indexOf(kk) >= 0) out[kk] += n(obj[kk]);
      }
    }
    return out;
  }

  // -----------------------------
  // Core ready helpers
  // -----------------------------
  function coreReady() {
    return !!(w.PotentialCoreV2 && typeof w.PotentialCoreV2.getState === "function");
  }
  function setRollButtonsEnabled(enabled) {
    const a = d.getElementById("potui2_main_roll");
    const b = d.getElementById("potui2_add_roll");
    const c = d.getElementById("potui2_main_combine");
    const d2 = d.getElementById("potui2_add_combine");
    if (a) a.disabled = !enabled;
    if (b) b.disabled = !enabled;
    if (c) c.disabled = !enabled;
    if (d2) d2.disabled = !enabled;
  }
  function showCoreWarning(show) {
    const box = d.getElementById("potui2_core_warn");
    if (!box) return;
    box.style.display = show ? "block" : "none";
  }

  // -----------------------------
  // Collapsible state (per modal life)
  // -----------------------------
  const _fold = {
    allOpen: UI_DEFAULT.allOpen,
    singleOpen: UI_DEFAULT.singleOpen
  };
  let allSummaryMode = "all"; // all | pct | flat


  function toggleFold(key) {
    _fold[key] = !_fold[key];
    applyFoldUI();
  }
  function applyFoldUI() {
    // all
    const allBody = d.getElementById("potui2_all_body");
    const allIcon = d.getElementById("potui2_all_icon");
    if (allBody) allBody.style.display = _fold.allOpen ? "block" : "none";
    if (allIcon) allIcon.textContent = _fold.allOpen ? "▴" : "▾";

    // single
    const sBody = d.getElementById("potui2_single_body");
    const sIcon = d.getElementById("potui2_single_icon");
    if (sBody) sBody.style.display = _fold.singleOpen ? "block" : "none";
    if (sIcon) sIcon.textContent = _fold.singleOpen ? "▴" : "▾";
  }

  // -----------------------------
  // Probability Modal
  // -----------------------------
  function openProbModal() {
    closeProbModal();
    const back = el("div", { id: "potui2_prob_backdrop" });
    const modal = el("div", { id: "potui2_prob_modal" });

    const header = el("div", { id: "potui2_prob_header" }, [
      el("div", { text: "機率表（升階 / 保底）" }),
      el("button", { className: "p2btn danger", id: "potui2_prob_close" }, ["關閉"])
    ]);

    const body = el("div", { id: "potui2_prob_body" });

    body.appendChild(el("div", { className: "note", style: { marginTop: "0" } }, [
      "升階規則：每次洗一次有機率提升外框，並有保底（傳說起無保底）。"
    ]));

    const tbl = el("table", { className: "tbl" });
    tbl.appendChild(el("thead", null, [
      el("tr", null, [
        el("th", null, ["階級"]),
        el("th", null, ["主潛能 升階率 / 保底"]),
        el("th", null, ["附加潛能 升階率 / 保底"])
      ])
    ]));

    const tbody = el("tbody");
    const tiers = ["特殊", "稀有", "罕見", "傳說", "唯一", "永恆"];
    for (let i = 0; i < tiers.length; i++) {
      (function (t) {
        const rMain = getRuleUI("main", t);
        const rAdd  = getRuleUI("add", t);
        const mainTxt = (t === "永恆") ? "—" : (fmtPct(rMain.upChance, 3) + " / " + (rMain.pity ? (rMain.pity + "顆") : "無保底"));
        const addTxt  = (t === "永恆") ? "—" : (fmtPct(rAdd.upChance, 3) + " / " + (rAdd.pity ? (rAdd.pity + "顆") : "無保底"));
        tbody.appendChild(el("tr", null, [
          el("td", null, [el("span", { className: "rowTag", text: t })]),
          el("td", null, [mainTxt]),
          el("td", null, [addTxt])
        ]));
      })(tiers[i]);
    }
    tbl.appendChild(tbody);
    body.appendChild(tbl);

    body.appendChild(el("div", { className: "note" }, [
      "※ 指定部位限定詞條（手套爆傷/攻速、武器Boss/無視/總傷、飾品掉寶/金幣/經驗等）目前仍以核心池設定為準；等你解開指定池後會反映在實際抽取。\n"
    ]));

    modal.appendChild(header);
    modal.appendChild(body);

    back.onclick = function (e) { if (e.target === back) closeProbModal(); };
    modal.querySelector("#potui2_prob_close").onclick = closeProbModal;

    d.body.appendChild(back);
    d.body.appendChild(modal);
  }

  function closeProbModal() {
    const b = d.getElementById("potui2_prob_backdrop");
    const m = d.getElementById("potui2_prob_modal");
    if (b) b.remove();
    if (m) m.remove();
  }

  // -----------------------------
  // Modal build
  // -----------------------------
  function build() {
  injectStyle();
  if (d.getElementById("potui2_modal")) return;

  const backdrop = el("div", { id: "potui2_backdrop" });
  const modal = el("div", { id: "potui2_modal" });

  const header = el("div", { id: "potui2_header" }, [
    el("div", { className: "title" }, [
      el("div", { text: "潛能面板" }),
      el("small", { text: "左側總覽｜右側操作（主/附潛能）" })
    ]),
    el("div", { className: "right" }, [
      el("button", { className: "p2btn ghost", id: "potui2_prob_btn" }, ["機率表"]),
      el("button", { className: "p2btn ghost", id: "potui2_inv" }, ["背包"]),
      el("button", { className: "p2btn danger", id: "potui2_close" }, ["關閉"])
    ])
  ]);

  const body = el("div", { id: "potui2_body" });

  const sidebar = el("div", { className: "p2sidebar" });
  const main = el("div", { className: "p2main" });

  // Core warning
  sidebar.appendChild(el("div", { className: "warnBox", id: "potui2_core_warn", style: { display: "none" } }, [
    "潛能核心 PotentialCoreV2 尚未載入（或載入順序在 UI 後面）。\n",
    "→ 目前只顯示 UI 外殼；等核心就緒後會自動補上詞條與功能。\n",
    "（請確認 script 順序：先 potential_core_v2_es2020.js，再 potential_ui...）"
  ]));

  // 1) All summary (collapsible)
  sidebar.appendChild(el("div", { className: "card" }, [
    el("h3", null, [
      el("span", { text: "全部裝備綜合（潛能）" }),
      el("span", { className: "sub", id: "potui2_all_hint", text: "" })
    ]),
    el("button", { className: "foldBtn", id: "potui2_all_fold" }, [
      el("span", { text: "收合 / 展開" }),
      el("span", { className: "hint", id: "potui2_all_brief", text: "" }),
      el("span", { id: "potui2_all_icon", text: "▴" })
    ]),
    el("div", { className: "foldBody", id: "potui2_all_body" }, [
      el("div", { className: "miniRow allFilter", id: "potui2_all_filter" }, [
        el("button", { className: "tabBtn active", id: "potui2_all_f_all" }, ["All"]),
        el("button", { className: "tabBtn", id: "potui2_all_f_pct" }, ["% Only"]),
        el("button", { className: "tabBtn", id: "potui2_all_f_flat" }, ["Flat Only"])
      ]),
      el("div", { className: "sumSection", id: "potui2_all_sec_pct" }, [
        el("div", { className: "sumTitle", text: "％ 加成" }),
        el("div", { className: "summaryGrid", id: "potui2_all_grid_pct" })
      ]),
      el("div", { className: "sumSection", id: "potui2_all_sec_flat" }, [
        el("div", { className: "sumTitle", text: "數值加成" }),
        el("div", { className: "summaryGrid", id: "potui2_all_grid_flat" })
      ])
    ]),
    el("div", { className: "note", text: "這裡顯示全身潛能加總（主+附），方便快速看整體收益。" })
  ]));

    // 4) Single summary removed (per latest UI)

// 2) Tabs + slot (main)
  main.appendChild(el("div", { className: "card" }, [
    el("h3", null, [
      el("span", { text: "選擇裝備槽" }),
      el("span", { className: "sub", id: "potui2_selected_name", text: "" })
    ]),
    el("div", { className: "tabsRow", id: "potui2_tabs" }),
    el("div", { className: "slotRow", id: "potui2_slots" }),
    el("div", { className: "note", text: "每個裝備槽的主/附潛能完全獨立。洗一次只影響目前選中的槽位。" })
  ]));

  // 3) Main/Add panels (main)
  main.appendChild(el("div", { className: "sectionGrid2" }, [
    potentialPanel("主潛能", "main"),
    potentialPanel("附加潛能", "add")
  ]));

  body.appendChild(sidebar);
  body.appendChild(main);

  modal.appendChild(header);
  modal.appendChild(body);

  // Events
  backdrop.onclick = function (e) { if (e.target === backdrop) close(); };

  const _btnClose = modal.querySelector("#potui2_close");
  if (_btnClose) _btnClose.onclick = close;

  const _btnInv = modal.querySelector("#potui2_inv");
  if (_btnInv) _btnInv.onclick = function () {
    if (typeof w.openInventoryModal === "function") w.openInventoryModal();
  };

  const _btnProb = modal.querySelector("#potui2_prob_btn");
  if (_btnProb) _btnProb.onclick = openProbModal;

  const _btnAllFold = modal.querySelector("#potui2_all_fold");
  if (_btnAllFold) _btnAllFold.onclick = function () { toggleFold("allOpen"); };

// All summary filter buttons
function setAllSummaryMode(mode){
  allSummaryMode = mode || "all";
  const bAll = modal.querySelector("#potui2_all_f_all");
  const bPct = modal.querySelector("#potui2_all_f_pct");
  const bFlat = modal.querySelector("#potui2_all_f_flat");
  function setActive(btn, on){
    if (!btn) return;
    btn.className = on ? "tabBtn active" : "tabBtn";
  }
  setActive(bAll, allSummaryMode === "all");
  setActive(bPct, allSummaryMode === "pct");
  setActive(bFlat, allSummaryMode === "flat");
  refreshAllSummary();
}
const _bAll = modal.querySelector("#potui2_all_f_all");
const _bPct = modal.querySelector("#potui2_all_f_pct");
const _bFlat = modal.querySelector("#potui2_all_f_flat");
if (_bAll) _bAll.onclick = function(){ setAllSummaryMode("all"); };
if (_bPct) _bPct.onclick = function(){ setAllSummaryMode("pct"); };
if (_bFlat) _bFlat.onclick = function(){ setAllSummaryMode("flat"); };


  const _btnSingleFold = modal.querySelector("#potui2_single_fold");
  if (_btnSingleFold) _btnSingleFold.onclick = function () { toggleFold("singleOpen"); };
d.body.appendChild(backdrop);
  d.body.appendChild(modal);

  buildTabs();
  applyFoldUI();
  refresh();
  waitCoreThenRefresh();
}

  function potentialPanel(title, which) {
    // which: main/add
    const card = el("div", { className: "card" }, [
      el("h3", null, [
        el("span", { text: title }),
        el("span", { className: "sub", id: "potui2_" + which + "_count", text: "" })
      ]),
      el("div", { className: "frameRow" }, [
        el("div", { className: "frameBadge", id: "potui2_" + which + "_frame" }, [
          el("span", { className: "dot" }),
          el("span", { id: "potui2_" + which + "_tier", text: "—" })
        ]),
        el("button", { className: "p2btn primary", id: "potui2_" + which + "_roll" }, ["洗一次"]),
        el("button", { className: "p2btn", id: "potui2_" + which + "_combine" }, [which==="add" ? "附加結合方塊" : "結合方塊"])
      ]),
      // pity moved HERE (你要的)
      el("div", { className: "pityBox" }, [
        el("div", { className: "pityTop" }, [
          el("span", { text: "保底進度" }),
          el("span", { id: "potui2_" + which + "_pity_text", text: "—" })
        ]),
        el("div", { className: "pityBar" }, [
          el("div", { className: "pityFill", id: "potui2_" + which + "_pity_fill", style: { width: "0%" } })
        ]),
        el("div", { className: "pitySub" }, [
          el("span", { id: "potui2_" + which + "_pity_sub", text: "—" }),
          el("span", { id: "potui2_" + which + "_chance", text: "—" })
        ])
      ]),
      el("div", { className: "lines", id: "potui2_" + which + "_lines" }),
      el("div", { className: "note", text: "規則：普通/高級方塊抽三排；主潛能第2排 20% 同階、第3排 5% 同階；附加潛能第2/3排 0.5% 同階。另有閃炫方塊模式。" })
    ]);

    card.querySelector("#potui2_" + which + "_roll").onclick = function () { doRoll(which); };
    const cbtn = card.querySelector("#potui2_" + which + "_combine");
    if (cbtn) cbtn.onclick = function () { if (w.potui2_openCombineModal) { w.potui2_openCombineModal(which); } else { alert("結合方塊UI未載入"); } };
    return card;
  }

  // -----------------------------
  // Tabs
  // -----------------------------
  let _activeTabKey = "weapon";


function buildTabs() {
  const tabs = d.getElementById("potui2_tabs");
  if (!tabs) return;
  tabs.innerHTML = "";

  for (let i = 0; i < TABS.length; i++) {
    (function (tab) {
      const b = el("button", { className: "tabBtn", "data-tab": tab.key }, [tab.title]);
      b.onclick = function () {
        _activeTabKey = tab.key;
        renderSlotsRow();
        highlightTabs();
      };
      tabs.appendChild(b);
    })(TABS[i]);
  }
  highlightTabs();
  renderSlotsRow();
}

function highlightTabs() {
  const st = coreReady() ? (safe(() => { return w.PotentialCoreV2.getState(); }, null) || {}) : null;

  const btns = d.querySelectorAll("#potui2_tabs .tabBtn");
  for (let i = 0; i < btns.length; i++) {
    const k = btns[i].getAttribute("data-tab");
    let tab = null;
    for (let t = 0; t < TABS.length; t++) if (TABS[t].key === k) tab = TABS[t];
    if (!tab) continue;

    // compute tab highlight color by highest tier among its slots
    let hi = "特殊";
    // neon (rainbow) only when ALL slots in this tab are double-eternal
    let neonAll = tab.slots && tab.slots.length ? true : false;
    if (st && st.pots) {
      for (let s = 0; s < tab.slots.length; s++) {
        const info = getSlotTierInfo(st, tab.slots[s]);
        hi = maxTier(hi, info.hi);
        if (!info.neon) neonAll = false;
      }
    } else {
      neonAll = false;
    }
    const neon = neonAll;

    // reset tier classes
    btns[i].classList.remove("t_特殊","t_稀有","t_罕見","t_傳說","t_唯一","t_永恆","tabAurora");

    btns[i].classList.add(tierClass(hi));
    if (neon) btns[i].classList.add("tabAurora");

    if (k === _activeTabKey) btns[i].classList.add("active");
    else btns[i].classList.remove("active");
  }
}


  function getSelectedSlotFallback() { return "weapon"; }

  function getSelectedSlot() {
    if (!coreReady()) return getSelectedSlotFallback();
    const st = safe(() => { return w.PotentialCoreV2.getState(); }, null) || {};
    return (st.ui && st.ui.selectedSlot) ? st.ui.selectedSlot : "weapon";
  }

  function setSelectedSlot(slot) {
    if (!coreReady()) return;
    w.PotentialCoreV2.setSelectedSlot(slot);
    refresh();
  }


function renderSlotsRow() {
  const wrap = d.getElementById("potui2_slots");
  if (!wrap) return;
  wrap.innerHTML = "";

  let tab = null;
  for (let i = 0; i < TABS.length; i++) if (TABS[i].key === _activeTabKey) tab = TABS[i];
  if (!tab) tab = TABS[0];

  const selected = getSelectedSlot();
  const st = coreReady() ? (safe(() => { return w.PotentialCoreV2.getState(); }, null) || {}) : null;

  for (let s = 0; s < tab.slots.length; s++) {
    (function (slot) {
      const info = getSlotTierInfo(st, slot);

      // 主色 = 主/附最高階；若主+附皆永恆 => neon（彩虹外框）
      const b = el("button", { className: "slotBtn " + tierClass(info.hi) + (info.neon ? " slotNeon" : ""), "data-slot": slot }, [
        // 左側小圓點：主/附
        el("span", { className: "slotDots" }, [
          el("span", { className: "slotDot " + tierClass(info.mt) }),
          el("span", { className: "slotDot " + tierClass(info.at) })
        ]),
        // 右側資訊：名稱 + 主/附階級（橫向、縮小字體）
        el("span", { className: "slotInfo" }, [
          el("span", { className: "slotName", text: (SLOT_LABEL[slot] || slot) }),
          el("span", { className: "slotSubline" }, [
            el("span", { className: "lbl", text: "主：" }),
            el("span", { className: "val " + tierClass(info.mt), text: info.mt }),
            el("span", { className: "lbl", text: "副：" }),
            el("span", { className: "val " + tierClass(info.at), text: info.at })
          ])
        ])
      ]);

      b.onclick = function () { if (coreReady()) setSelectedSlot(slot); };

      if (slot === selected) b.classList.add("active");
      wrap.appendChild(b);
    })(tab.slots[s]);
  }
}


  // Roll Modal（洗方塊：前後選擇 / 再洗一次 / 跳框提示）
  // -----------------------------
  function openRollModal(which) {
    let attemptClose = function () {};

    if (!coreReady()) {
      alert("潛能核心 PotentialCoreV2 尚未載入，無法洗潛能。");
      return;
    }
    safe(() => { w.PotentialCoreV2.ensureLinesExist(); }, null);

    closeRollModal();

    const slot = getSelectedSlot();
    const slotName = SLOT_LABEL[slot] || slot;

    const back = el("div", { id: "potui2_roll_backdrop" });
    const modal = el("div", { id: "potui2_roll_modal" });

    const titleTxt = (which === "add") ? "洗附加潛能" : "洗主潛能";
    const header = el("div", { id: "potui2_roll_header" }, [
      el("div", { className: "title" }, [
        el("div", { text: titleTxt }),
        el("small", { text: "部位：" + slotName + "｜可選擇原潛能/新潛能結果" })
      ]),
      el("div", { className: "right" }, [
        el("div", { className: "mini", id: "potui2_roll_pity" }, ["保底進度：—"]),
        el("button", { className: "p2btn danger", id: "potui2_roll_close" }, ["關閉"])
      ])
    ]);

    const body = el("div", { id: "potui2_roll_body" });

    // state holders (in closure)
    let lastUpgraded = false;     // 上一次洗是否跳框
    let committedNode = null;    // 舊潛能（已套用在裝備上，整個彈窗期間不變）
    let previewNode = null;       // 新潛能（僅預覽，直到按「保留後」才會套用）
    let hasPreview = false;       // 是否已有預覽結果
    let hasRolledOnce = false;
    let flashyData = null;        // 閃炫候選資料
    let flashySel = null;         // 閃炫選擇狀態
    // 本次彈窗是否已經洗過（洗一次只出現第一次）

    function getCubeOptions() {
      const opt = { upChanceMult: 1, itemName: null, label: "", kind: "normal" };
      const PC = w.PotentialCoreV2 || w.PotentialCoreV1 || {};
      const sel = d.getElementById("potui2_roll_cubeSel");
      const v = sel ? String(sel.value || "normal") : "normal";

      if (which === "add") {
        if (v === "flashy") { opt.upChanceMult = 1; opt.itemName = (PC.ITEM_ADD_FLASHY || "附加潛能閃炫方塊"); opt.label = "附加潛能閃炫方塊"; opt.kind = "flashy"; }
        else if (v === "advanced") { opt.upChanceMult = 2; opt.itemName = (PC.ITEM_ADD_ADV || "高級附加方塊"); opt.label = "高級附加方塊（跳框×2）"; opt.kind = "advanced"; }
        else { opt.upChanceMult = 1; opt.itemName = (PC.ITEM_ADD || "附加方塊"); opt.label = "附加方塊"; opt.kind = "normal"; }
      } else {
        if (v === "flashy") { opt.upChanceMult = 1; opt.itemName = (PC.ITEM_MAIN_FLASHY || "主潛能閃炫方塊"); opt.label = "主潛能閃炫方塊"; opt.kind = "flashy"; }
        else if (v === "advanced") { opt.upChanceMult = 2; opt.itemName = (PC.ITEM_MAIN_ADV || "高級潛能方塊"); opt.label = "高級潛能方塊（跳框×2）"; opt.kind = "advanced"; }
        else { opt.upChanceMult = 1; opt.itemName = (PC.ITEM_MAIN || "潛能方塊"); opt.label = "潛能方塊"; opt.kind = "normal"; }
      }
      return opt;
    }

    // -----------------------------
    // Flashy UI (獨立彈窗，不共用一般方塊 UI)
    // - 主閃炫：6 選 3
    // - 附加閃炫：2選1 + 3選2
    // - 無原潛能/新潛能；必須選完並套用後才能再洗
    // - 強制關閉：採用預設（主：前三排；附：c1[0] + c23[0,1]）
    // -----------------------------


  // -----------------------------
  // Combine Cube Modal（結合方塊/附加結合方塊）
  // - 使用：扣1顆並隨機抽一排（33.33%）
  // - 重新抽選：再扣1顆並重抽
  // - 確定使用：不扣，僅重洗抽中的那一排（主：15%同框；附：0.5%同框）
  // -----------------------------
  function openCombineModal(which) {
    const core = w.PotentialCoreV2 || w.PotentialCoreV1;
    if (!core) { alert("潛能核心未載入"); return; }
    if (!core.getState) { alert("潛能核心版本不支援結合方塊"); return; }

    const slot = core.getSelectedSlot ? core.getSelectedSlot() : (core.getState().selectedSlot || "weapon");
    const st = core.getState ? core.getState() : null;
    const itemId = (which === "add") ? (core.ITEM_ADD_COMBINE || "ADD_COMBINE_CUBE") : (core.ITEM_MAIN_COMBINE || "MAIN_COMBINE_CUBE");

    function getQty() {
      try {
        if (typeof w.getItemQuantity === "function") return (w.getItemQuantity(itemId) || 0);
      } catch (e) {}
      const p = w.player || {};
      // common shapes: inventory{ id:qty }, items{ id:qty }, bag{ id:qty }
      if (p.inventory && typeof p.inventory[itemId] === "number") return p.inventory[itemId];
      if (p.items && typeof p.items[itemId] === "number") return p.items[itemId];
      if (p.bag && typeof p.bag[itemId] === "number") return p.bag[itemId];
      return 0;
    }

    const backdrop = d.createElement("div");
    backdrop.id = "potui2_backdrop";

    const modal = d.createElement("div");
    modal.id = "potui2_modal";
    modal.dataset.p2modal = "combine";

    const selectedLineIndex = null;
    let draw = null; // { ok, lineIndex, lineText, chanceSameFrame }
    let usedOnce = false;

    function close() {
      try { d.body.removeChild(backdrop); } catch (e) {}
      try { d.body.removeChild(modal); } catch (e2) {}
    }

    function render() {
      const qty = getQty();
      const title = (which === "add") ? "附加結合方塊" : "結合方塊";
      modal.innerHTML = "";

      // header
      const header = el("div", { className: "p2mHead" }, [
        el("div", { className: "p2mTitle" }, [
          el("span", { text: title }),
          el("span", { className: "sub", id: "potui2_combine_qty", text: "剩餘：" + qty })
        ]),
        el("button", { className: "p2mClose", id: "potui2_combine_close" }, ["✕"])
      ]);

      // body
      const body = el("div", { className: "p2mBody" }, []);

      const btnUse = el("button", { className: "p2btn primary", id: "potui2_combine_use", disabled: qty <= 0 }, [
        usedOnce ? "再次使用（扣 1）" : "使用（扣 1）"
      ]);

      const hint = el("div", { className: "note", style: { marginTop: "10px" } }, [
        "抽排機率：第1/2/3排各 33.33%（合計100%）。"
      ]);

      body.appendChild(el("div", { className: "frameRow", style: { justifyContent: "space-between" } }, [
        el("div", { className: "sub", text: "目前槽位：" + (SLOT_LABEL[slot] || slot) }),
        el("div", { className: "sub", text: "" })
      ]));
      body.appendChild(btnUse);
      body.appendChild(hint);

      // result area
      const resultBox = el("div", { className: "p2card", style: { marginTop: "12px" } }, []);
      if (!draw) {
        resultBox.appendChild(el("div", { className: "sub", text: "尚未抽選。" }));
      } else {
        resultBox.appendChild(el("div", { className: "sub", text: "抽中：第 " + draw.lineIndex + " 排" }));
        resultBox.appendChild(el("div", { className: "p2pill", style: { marginTop: "10px" } }, [
          el("span", { text: draw.lineText || ("第 " + draw.lineIndex + " 排") })
        ]));
        resultBox.appendChild(el("div", { className: "sub", style: { marginTop: "10px" }, text: "同外框等級機率：" + (draw.chanceSameFrame != null ? (draw.chanceSameFrame * 100).toFixed(2) + "%" : "—") }));
      }
      body.appendChild(resultBox);

      const btnRow = el("div", { className: "btnRow", style: { marginTop: "12px" } }, [
        el("button", { className: "p2btn", id: "potui2_combine_reroll", disabled: !draw || qty <= 0 }, ["重新抽選（扣 1）"]),
        el("button", { className: "p2btn primary", id: "potui2_combine_confirm", disabled: !draw }, ["確定使用（不扣）"])
      ]);
      body.appendChild(btnRow);

      // rules
      const rules = [];
      if (which === "add") {
        rules.push("附加結合方塊：確定使用後，抽中的那一排「附加潛能」會重新抽選。");
        rules.push("同外框等級機率：0.5%（其餘為次一階）。");
      } else {
        rules.push("結合方塊：確定使用後，抽中的那一排「主潛能」會重新抽選。");
        rules.push("同外框等級機率：15%（其餘為次一階）。");
      }
      rules.push("注意：外框等級與保底進度不會改變。");
      body.appendChild(el("div", { className: "note", style: { marginTop: "12px", whiteSpace: "pre-line" }, text: rules.join("\n") }));

      modal.appendChild(header);
      modal.appendChild(body);

      // handlers
      const cbtn = modal.querySelector("#potui2_combine_close");
      if (cbtn) cbtn.onclick = close;
      backdrop.onclick = function (e) { if (e.target === backdrop) close(); };

      const useBtn = modal.querySelector("#potui2_combine_use");
      const rerollBtn = modal.querySelector("#potui2_combine_reroll");
      const confirmBtn = modal.querySelector("#potui2_combine_confirm");

      function doDraw() {
        const res = (which === "add") ? core.drawAddCombine(slot) : core.drawMainCombine(slot);
        if (!res || !res.ok) { alert((res && res.message) || "使用結合方塊失敗"); return; }
        usedOnce = true;
        draw = res;
        render();
      }
      function doConfirm() {
        if (!draw) return;
        const res = (which === "add") ? core.confirmAddCombine(slot, draw.lineIndex) : core.confirmMainCombine(slot, draw.lineIndex);
        if (!res || !res.ok) { alert((res && res.message) || "確定使用失敗"); return; }
        close();
        refresh();
      }

      if (useBtn) useBtn.onclick = doDraw;
      if (rerollBtn) rerollBtn.onclick = doDraw;
      if (confirmBtn) confirmBtn.onclick = doConfirm;
    }

    d.body.appendChild(backdrop);
    d.body.appendChild(modal);
    render();
  }

function openFlashyModal(slot, which, opt) {
      const core = w.PotentialCoreV2 || w.PotentialCoreV1;
      if (!core) { alert("潛能核心未載入"); return; }

      const back = d.createElement("div");
      back.id = "potui2_flashy_backdrop";

      const modal = d.createElement("div");
      modal.id = "potui2_flashy_modal";
      // prevent bubbling to backdrop on mobile
      modal.onclick = function(e){ if (e && e.stopPropagation) e.stopPropagation(); };

      const header = d.createElement("div");
      header.className = "potui2_flashy_header";

      const hTitle = d.createElement("div");
      hTitle.className = "potui2_flashy_title";
      hTitle.textContent = (which === "add") ? "附加閃炫方塊" : "閃炫方塊";

      const btnX = d.createElement("button");
      btnX.className = "potui2_flashy_close";
      btnX.type = "button";
      btnX.textContent = "✕";

      header.appendChild(hTitle);
      header.appendChild(btnX);

      const body = d.createElement("div");
      body.className = "potui2_flashy_body";

      const hint = d.createElement("div");
      hint.className = "potui2_flashy_hint";
      hint.textContent = (which === "add")
        ? "第1排：2選1（同等級 100%）；第2/3排：3選2（次等級 100%）。"
        : "一次抽 6 排，請選擇 3 排保留。";

      const panel = d.createElement("div");
      panel.className = (which === "add") ? "potui2_flashy_grid" : "potui2_flashy_panel";

      const actions = d.createElement("div");
      actions.className = "potui2_flashy_actions";

      const btnRe = d.createElement("button");
      btnRe.className = "potui2_flashy_btn";
      btnRe.type = "button";
      btnRe.textContent = "再使用一次";
      btnRe.disabled = true; // 必須先確定套用後才能再洗

      const btnOk = d.createElement("button");
      btnOk.className = "potui2_flashy_btn pri";
      btnOk.type = "button";
      btnOk.textContent = "確定";
      btnOk.disabled = true;

      actions.appendChild(btnRe);
      actions.appendChild(btnOk);

      body.appendChild(hint);
      body.appendChild(panel);
      body.appendChild(actions);

      modal.appendChild(header);
      modal.appendChild(body);

      d.body.appendChild(back);
      d.body.appendChild(modal);

      // state
      let lastRoll = null;
      let chosenMain = [];     // idx list 0..5
      let chosenAdd1 = 0;      // 0..1
      let chosenAdd23 = [];    // idx list 0..2
      let appliedOnce = false;
      const openedAt = Date.now();

      let committedBefore = null;
      function dc(o){ try { return JSON.parse(JSON.stringify(o)); } catch(_){ return o; } }
      function snapBefore(){
        if (committedBefore) return committedBefore;
        try {
          const st0 = (typeof core.getState === "function") ? core.getState() : null;
          committedBefore = dc(st0 && st0.pots && st0.pots[slot] ? st0.pots[slot][which] : null);
        } catch(_){ committedBefore = null; }
        return committedBefore;
      }
      function tierAbbr(tier) {
        tier = String(tier || "");
        if (tier === "特殊") return "S";
        if (tier === "稀有") return "R";
        if (tier === "罕見") return "E";
        if (tier === "傳說") return "L";
        if (tier === "唯一") return "U";
        if (tier === "永恆") return "M";
        return tier ? tier.charAt(0) : "—";
      }

      function lineParts(line) {
        try {
          const o = lineToText(line);
          if (typeof o === "string") return { tier: String(line && line.tier || ""), text: o };
          if (o && typeof o === "object") {
            let txt = String(o.desc || "");
            if (o.val) txt += " " + String(o.val);
            return { tier: String(o.tier || (line && line.tier) || ""), text: txt };
          }
        } catch (_) {}
        return { tier: String(line && line.tier || ""), text: (line && line.text) ? String(line.text) : String(line) };
      }

      function makeLineRow(idx, line, isSelected) {
        const parts = lineParts(line);

        const row = d.createElement("div");
        row.className = "potui2_flashy_line" + (isSelected ? " sel" : "");

        const left = d.createElement("div");
        left.className = "potui2_flashy_left";

        const badge = d.createElement("span");
        badge.className = "potui2_flashy_badge " + (typeof tierColorClass === "function" ? tierColorClass(parts.tier) : "");
        badge.textContent = tierAbbr(parts.tier);

        const num = d.createElement("span");
        num.className = "potui2_flashy_idx";
        num.textContent = String(idx + 1);

        const txt = d.createElement("span");
        txt.className = "potui2_flashy_txt";
        txt.textContent = parts.text;

        left.appendChild(badge);
        left.appendChild(num);
        left.appendChild(txt);

        const check = d.createElement("span");
        check.className = "potui2_flashy_check";
        check.textContent = isSelected ? "✓" : "";

        row.appendChild(left);
        row.appendChild(check);
        return row;
      }

      function renderAppliedLines(lines) {
        panel.innerHTML = "";
        const box = d.createElement("div");
        box.className = "potui2_flashy_box";
        for (let i = 0; i < lines.length; i++) {
          const r = makeLineRow(i, lines[i], true);
          r.className = "potui2_flashy_line applied";
          box.appendChild(r);
        }
        panel.appendChild(box);
      }

      function renderMainCandidates(cands) {
        panel.innerHTML = "";
        // 預設不勾選（更好操作）；未選滿時按「確定」會自動以前面的選項補齊。
        chosenMain = [];
        btnOk.disabled = false;

        const box = d.createElement("div");
        box.className = "potui2_flashy_box";

        for (let i = 0; i < cands.length; i++) {
          (function (idx) {
            const row = makeLineRow(idx, cands[idx], (chosenMain.indexOf(idx) >= 0));

            row.onclick = function () {
              if (appliedOnce) return;
              const k = chosenMain.indexOf(idx);
              if (k >= 0) {
                chosenMain.splice(k, 1);
                row.classList.remove("sel");
                row.querySelector(".potui2_flashy_check").textContent = "";
              } else {
                if (chosenMain.length >= 3) return;
                chosenMain.push(idx);
                row.classList.add("sel");
                row.querySelector(".potui2_flashy_check").textContent = "✓";
              }
              btnOk.disabled = false;
            };

            box.appendChild(row);
          })(i);
        }
        panel.appendChild(box);
      }

      function renderAddCandidates(c1, c23) {
        panel.innerHTML = "";
        // 預設不勾選；未選滿時按「確定」會自動補齊（第1排補第1個；第2/3排補前面兩個）。
        chosenAdd1 = null;
        chosenAdd23 = [];
        btnOk.disabled = false;

        // box1: 2選1
        const box1 = d.createElement("div");
        box1.className = "potui2_flashy_box";
        const t1 = d.createElement("h4");
        t1.textContent = "第1排（2選1）";
        box1.appendChild(t1);

        for (let i = 0; i < c1.length; i++) {
          (function (idx) {
            const row = makeLineRow(idx, c1[idx], false);

            row.onclick = function () {
              if (appliedOnce) return;
              chosenAdd1 = idx;
              const rows = box1.querySelectorAll(".potui2_flashy_line");
              for (let j = 0; j < rows.length; j++) {
                rows[j].classList.remove("sel");
                const ck = rows[j].querySelector(".potui2_flashy_check"); if (ck) ck.textContent = "";
              }
              row.classList.add("sel");
              row.querySelector(".potui2_flashy_check").textContent = "✓";
              btnOk.disabled = false;
            };
            box1.appendChild(row);
          })(i);
        }

        // box2: 3選2
        const box2 = d.createElement("div");
        box2.className = "potui2_flashy_box";
        const t2 = d.createElement("h4");
        t2.textContent = "第2/3排（三選二）";
        box2.appendChild(t2);

        for (let k = 0; k < c23.length; k++) {
          (function (idx) {
            const row = makeLineRow(idx, c23[idx], (chosenAdd23.indexOf(idx) >= 0));

            row.onclick = function () {
              if (appliedOnce) return;
              const p = chosenAdd23.indexOf(idx);
              if (p >= 0) {
                chosenAdd23.splice(p, 1);
                row.classList.remove("sel");
                row.querySelector(".potui2_flashy_check").textContent = "";
              } else {
                if (chosenAdd23.length >= 2) return;
                chosenAdd23.push(idx);
                row.classList.add("sel");
                row.querySelector(".potui2_flashy_check").textContent = "✓";
              }
              btnOk.disabled = false;
            };
            box2.appendChild(row);
          })(k);
        }

        panel.appendChild(box1);
        panel.appendChild(box2);
      }

      function doRollFlashy() {
        // 重要：閃炫只在「確定」時才套用。
        // 這裡先快照目前已套用的潛能，避免 core.roll* 先把預設前三排寫進去造成 UI/結果不一致。
        const beforeNow = dc(snapBefore());
        appliedOnce = false;
        btnRe.disabled = true;
        btnOk.disabled = true;

        const r = (which === "add")
          ? core.rollAddFlashy(slot, opt)
          : core.rollMainFlashy(slot, opt);

        if (!r || !r.ok) {
          alert("無法使用方塊：" + ((r && r.item) ? r.item : ""));
          // 不自動關閉，避免使用者不知道發生什麼
          return;
        }

        lastRoll = r;

        // 立刻還原畫面/狀態為「洗之前」的版本，直到使用者按下確定
        try { core.setSlotPotential(slot, which, beforeNow || snapBefore()); } catch (_) {}
        try { refresh(); } catch (_) {}

        if (which === "add") {
          renderAddCandidates(r.candidates.c1, r.candidates.c23);
        } else {
          renderMainCandidates(r.candidates);
        }
      }

      function applySelection() {
        if (!lastRoll || !lastRoll.ok) return;

        const st = lastRoll.state;
        if (!st || !st.pots || !st.pots[slot]) return;

        const node = st.pots[slot][which];
        if (!node) return;

        if (which === "add") {
          // 自動補齊（沒選滿也可以確定）
          if (chosenAdd1 == null) chosenAdd1 = 0;
          while (chosenAdd23.length < 2) {
            const cand = chosenAdd23.length; // 0,1
            if (chosenAdd23.indexOf(cand) < 0) chosenAdd23.push(cand);
            else break;
          }
          // 若還是不足（候選不足），直接擋下
          if (chosenAdd23.length !== 2) return;
          chosenAdd23.sort((a, b) => { return a - b; });
          node.lines = [
            lastRoll.candidates.c1[chosenAdd1],
            lastRoll.candidates.c23[chosenAdd23[0]],
            lastRoll.candidates.c23[chosenAdd23[1]]
          ];
        } else {
          // 自動補齊（沒選滿也可以確定）
          while (chosenMain.length < 3) {
            const next = chosenMain.length;
            if (chosenMain.indexOf(next) < 0) chosenMain.push(next);
            else break;
          }
          if (chosenMain.length !== 3) return;
          chosenMain.sort((a, b) => { return a - b; });
          node.lines = [
            lastRoll.candidates[chosenMain[0]],
            lastRoll.candidates[chosenMain[1]],
            lastRoll.candidates[chosenMain[2]]
          ];
        }

        try { core.setSlotPotential(slot, which, node); } catch (_) {}
        committedBefore = dc(node);
        appliedOnce = true;

        // 顯示套用後的三排（更接近原廠效果）
        renderAppliedLines(node.lines);

        btnRe.disabled = false;
        btnOk.disabled = true;
        try { refresh(); } catch (_) {}
      }

      function close() {
        // 關閉視為取消：不套用本次結果（彈窗期間顯示已還原為洗之前）。
        if (back && back.parentNode) back.parentNode.removeChild(back);
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
      }

      btnX.onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); close(); };

      back.onclick = function (e) {
        // avoid closing immediately on the opening tap
        if (Date.now() - openedAt < 150) return;
        if (e && e.target === back) close();
      };

      btnOk.onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); applySelection(); };
      btnRe.onclick = function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        if (!appliedOnce) return;
        doRollFlashy();
      };
      // first show: roll immediately
      doRollFlashy();
    }



        function hidePicker() {
      const box = d.getElementById("potui2_roll_picker");
      if (box) { box.style.display = "none"; box.innerHTML = ""; }
      flashyData = null;
      flashySel = null;
    }

    function showPickerMain(candidates) {
      const box = d.getElementById("potui2_roll_picker");
      if (!box) return;
      box.style.display = "";
      box.innerHTML = "";
      box.appendChild(el("div", { className: "pickerTitle", text: "閃炫：一次抽 6 排，選擇要保留的 3 排" }));

      flashyData = candidates || [];
      flashySel = { picks: {0:true,1:true,2:true,3:false,4:false,5:false} };

      function applySelection() {
        if (!previewNode) return;
        const chosen = [];
        for (let i3 = 0; i3 < flashyData.length; i3++) if (flashySel.picks[i3]) chosen.push(flashyData[i3]);
        if (chosen.length === 3) {
          previewNode.lines = [ chosen[0], chosen[1], chosen[2] ];
          renderLines(d.getElementById("potui2_roll_after_lines"), previewNode, lastUpgraded);

        // flashy modes: show picker UI (no before/after compare)
        if (opt && opt.kind === "flashy") {
          flashyData = res.candidates || null;
          renderFlashyPicker();
        } else {
          flashyData = null;
          hidePicker();
        }


        if (opt && opt.kind === "flashy") {
          if (which === "add") showPickerAdd(res && res.candidates ? res.candidates : null);
          else showPickerMain(res && res.candidates ? res.candidates : null);
        } else {
          hidePicker();
        }
        }
      }

      function render() {
        box.innerHTML = "";
        box.appendChild(el("div", { className: "pickerTitle", text: "閃炫：一次抽 6 排，選擇要保留的 3 排" }));
        const list = el("div", { className: "pickerList" });
        for (let i = 0; i < flashyData.length; i++) {
          (function(ii){
            const chk = el("input", { type: "checkbox" });
            chk.checked = !!flashySel.picks[ii];
            chk.onchange = function(){
              let cur = 0;
              for (const k in flashySel.picks) if (flashySel.picks[k]) cur++;
              if (chk.checked) {
                if (cur >= 3) { chk.checked = false; return; }
                flashySel.picks[ii] = true;
              } else {
                flashySel.picks[ii] = false;
              }
              applySelection();
              render();
            };
            const lineTxt = (flashyData[ii] && flashyData[ii].text) ? flashyData[ii].text : String(flashyData[ii]||"");
            list.appendChild(el("label", { className: "pickerRow" }, [
              chk,
              el("span", { className: "pickerIdx", text: "第" + (ii+1) + "排：" }),
              el("span", { className: "pickerLine", text: lineTxt })
            ]));
          })(i);
        }
        box.appendChild(list);

        const picked = [];
        for (let i2 = 0; i2 < flashyData.length; i2++) if (flashySel.picks[i2]) picked.push(i2+1);
        box.appendChild(el("div", { className: "pickerHint", text: "已選：" + picked.join("、") + "（需 3 排）" }));
      }

      applySelection();
      render();
    }

    function showPickerAdd(cand) {
      const box = d.getElementById("potui2_roll_picker");
      if (!box) return;
      box.style.display = "";
      box.innerHTML = "";
      box.appendChild(el("div", { className: "pickerTitle", text: "閃炫：第1排 2選1（同等級100%）；第2/3排 三選二（次等級100%）" }));

      flashyData = cand || { c1: [], c23: [] };
      flashySel = { c1: 0, c23: {0:true,1:true,2:false} };

      function applySelection() {
        if (!previewNode) return;
        const l1 = flashyData.c1[flashySel.c1] || flashyData.c1[0];
        const chosen23 = [];
        for (let i = 0; i < 3; i++) if (flashySel.c23[i]) chosen23.push(flashyData.c23[i]);
        if (chosen23.length === 2) {
          previewNode.lines = [ l1, chosen23[0], chosen23[1] ];
          renderLines(d.getElementById("potui2_roll_after_lines"), previewNode, lastUpgraded);

        // flashy modes: show picker UI (no before/after compare)
        if (opt && opt.kind === "flashy") {
          flashyData = res.candidates || null;
          renderFlashyPicker();
        } else {
          flashyData = null;
          hidePicker();
        }

        }
      }

      function render() {
        box.innerHTML = "";
        box.appendChild(el("div", { className: "pickerTitle", text: "閃炫：第1排 2選1（同等級100%）；第2/3排 三選二（次等級100%）" }));

        const g1 = el("div", { className: "pickerGroup" }, [ el("div", { className: "pickerSub", text: "第1排（2選1）" }) ]);
        for (let i1=0;i1<flashyData.c1.length;i1++){
          (function(ii){
            const r = el("input", { type:"radio", name:"potui2_c1" });
            r.checked = (flashySel.c1 === ii);
            r.onchange = function(){ flashySel.c1 = ii; applySelection(); };
            const t = flashyData.c1[ii] && flashyData.c1[ii].text ? flashyData.c1[ii].text : String(flashyData.c1[ii]||"");
            g1.appendChild(el("label", { className: "pickerRow" }, [ r, el("span", { className:"pickerLine", text: t }) ]));
          })(i1);
        }
        box.appendChild(g1);

        const g2 = el("div", { className: "pickerGroup" }, [ el("div", { className: "pickerSub", text: "第2/3排（三選二）" }) ]);
        for (let i2=0;i2<flashyData.c23.length;i2++){
          (function(ii){
            const chk = el("input", { type:"checkbox" });
            chk.checked = !!flashySel.c23[ii];
            chk.onchange = function(){
              let cur=0; for (let k=0;k<3;k++) if (flashySel.c23[k]) cur++;
              if (chk.checked){
                if (cur >= 2) { chk.checked=false; return; }
                flashySel.c23[ii]=true;
              } else {
                flashySel.c23[ii]=false;
              }
              applySelection();
              render();
            };
            const t2 = flashyData.c23[ii] && flashyData.c23[ii].text ? flashyData.c23[ii].text : String(flashyData.c23[ii]||"");
            g2.appendChild(el("label", { className: "pickerRow" }, [ chk, el("span", { className:"pickerLine", text: t2 }) ]));
          })(i2);
        }
        box.appendChild(g2);

        const picked=[]; for (let j=0;j<3;j++) if (flashySel.c23[j]) picked.push(j+1);
        box.appendChild(el("div", { className: "pickerHint", text: "第2/3排已選：" + picked.join("、") + "（需 2 個）" }));
      }

      applySelection();
      render();
    }

function readNodeFromState(st) {
      st = st || safe(() => { return w.PotentialCoreV2.getState(); }, null) || {};
      const pots = (st && st.pots) ? st.pots : {};
      const node = (pots && pots[slot] && pots[slot][which]) ? pots[slot][which] : null;
      return safe(() =>{ return JSON.parse(JSON.stringify(node || {})); }, {});
    }

    function renderLines(container, node, glow) {
      if (!container) return;
      container.innerHTML = "";
      const lines = (node && node.lines) ? node.lines : [];
      for (let i = 0; i < 3; i++) {
        const L = lines[i] || null;
        const t = lineToText(L);
        container.appendChild(el("div", { className: "line " + tierClass(t.tier) + (glow ? " upgradedGlow" : "") }, [
          el("div", { className: "l" }, [
            el("div", { className: "lineTop" }, [
              el("span", { className: "tierPill " + tierClass(t.tier) }, [
                el("span", { className: "dot" }),
                el("span", { text: tierAbbr(t.tier) })
              ]),
              el("span", { className: "desc", text: t.desc })
            ])
          ]),
          el("div", { className: "v", text: t.val })
        ]));
      }
    }

    function updateCounts() {
      const opt = getCubeOptions();
      const q = safe(() => { return (typeof w.getItemQuantity === "function") ? n(w.getItemQuantity(opt.itemName)) : 0; }, 0);
      const c = d.getElementById("potui2_roll_count");
      if (c) c.textContent = opt.itemName + "：× " + q.toLocaleString();
    }

    // ---- Pity helpers (UI side; read from core) ----
function getPityNeedUI(which, tier) {
  tier = String(tier || "特殊");
  which = (which === "add") ? "add" : "main";
  try {
    const core = w.PotentialCoreV2;
    if (core && typeof core.getTierRuleTable === "function") {
      const tbl = core.getTierRuleTable(which);
      const r = (tbl && tbl[tier]) ? tbl[tier] : (tbl && tbl["特殊"]);
      if (r) return n(r.pity);
    }
  } catch (e) {}
  return 0;
}
    function updateRollPityUI(node) {
      const elP = d.getElementById("potui2_roll_pity");
      if (!elP) return;
      if (!node) { elP.textContent = "保底進度：—"; return; }
      const tier = String(node.tier || "特殊");
      const pity = Math.max(0, Math.floor(n(node.pity)));
      const need = getPityNeedUI(which, tier);
      if (!need) { elP.textContent = "保底進度：無保底"; return; }
      const remain = Math.max(0, need - (pity + 1));
      elP.textContent = "保底進度：" + pity + "/" + need + "（剩 " + remain + "）";
    }


    function render() {
      body.innerHTML = "";

      // top bar
      const cubeSel = el("select", { id: "potui2_roll_cubeSel", className: "p2select" }, [
        el("option", { value: "normal", text: "普通方塊" }),
        el("option", { value: "advanced", text: "高級方塊（跳框×2）" }),
        el("option", { value: "flashy", text: "閃炫方塊" })
      ]);

      const top = el("div", { className: "rollTop" }, [
        el("span", { className: "pill" }, [
          el("span", { text: "模式：" }),
          cubeSel
        ]),
        el("span", { className: "pill", id: "potui2_roll_count" }, [""])
      ]);
      body.appendChild(top);

      // compare grid
      const grid = el("div", { className: "rollGrid" });

      const beforeBox = el("div", { className: "rollBox", id: "potui2_roll_before_box" }, [
        el("h4", null, [
          el("span", { text: "洗之前" }),
          el("span", { className: "mini", id: "potui2_roll_before_tier", text: "" })
        ]),
        el("div", { className: "lines", id: "potui2_roll_before_lines" })
      ]);

      const afterBox = el("div", { className: "rollBox", id: "potui2_roll_after_box" }, [
        el("h4", null, [
          el("span", { text: "洗之後" }),
          el("span", { className: "mini", id: "potui2_roll_after_tier", text: "" })
        ]),
        el("div", { className: "lines", id: "potui2_roll_after_lines" }),
        el("div", { id: "potui2_roll_picker", className: "flashyPicker", style: { display: "none" } })
      ]);

      grid.appendChild(beforeBox);
      grid.appendChild(afterBox);
      body.appendChild(grid);

      // actions
      const btnRoll = el("button", { className: "p2btn pri grow", id: "potui2_roll_do" }, ["洗一次"]);
      const btnKeepBefore = el("button", { className: "p2btn", id: "potui2_roll_keep_before" }, ["原潛能"]);
      const btnKeepAfter = el("button", { className: "p2btn", id: "potui2_roll_keep_after" }, ["新潛能"]);
      const btnReroll = el("button", { className: "p2btn ghost", id: "potui2_roll_reroll" }, ["再洗一次"]);
      // 先隱藏「再洗一次」，第一次洗完後才顯示
      btnReroll.style.display = "none";

      body.appendChild(el("div", { className: "rollActions" }, [
        btnRoll,
        btnKeepBefore,
        btnKeepAfter,
        btnReroll
      ]));

      body.appendChild(el("div", { className: "rollHint" }, [
        "提示：第一次請按「洗一次」取得預覽；之後請按「再洗一次」持續重洗。每按一次「洗一次 / 再洗一次」都會消耗一次方塊並累積保底；套用哪個結果不影響保底累積。跳框時會以金色框提示。"
      ]));

      // initial render nodes = current
      committedNode = readNodeFromState();
      previewNode = null;
      hasPreview = false;
      lastUpgraded = false;

      renderLines(d.getElementById("potui2_roll_before_lines"), committedNode, false);
      renderLines(d.getElementById("potui2_roll_after_lines"), committedNode, false); // 尚未洗：先顯示同一份
      hidePicker();
      setText("potui2_roll_before_tier", "外框：" + String(committedNode.tier || "特殊"));
        updateRollPityUI(committedNode);
      setText("potui2_roll_after_tier",  "外框：" + String(committedNode.tier || "特殊"));
      updateRollPityUI(committedNode);

      // enable/disable buttons
      function syncBtns() {
        btnKeepBefore.disabled = !hasPreview;
        btnKeepAfter.disabled = !hasPreview;
        btnReroll.disabled = !hasPreview; // 先洗出預覽結果後才允許再洗一次
        // 第一次才顯示「洗一次」，之後一律使用「再洗一次」
        if (!hasRolledOnce) {
          btnRoll.style.display = "";
          btnReroll.style.display = "none";
        } else {
          btnRoll.style.display = "none";
          btnReroll.style.display = "";
        }
      }

      // ---- Flashy picker helpers ----
      let flashyData = null; // stores latest candidates for flashy modes

      function hidePicker() {
        const picker = d.getElementById("potui2_roll_picker");
        const beforeBox = d.getElementById("potui2_roll_before_box");
        const afterBox = d.getElementById("potui2_roll_after_box");
        if (picker) { picker.innerHTML = ""; picker.style.display = "none"; }
        if (beforeBox) beforeBox.style.display = "";
        if (afterBox) afterBox.style.display = "";
      }

      function renderFlashyPicker() {
        const picker = d.getElementById("potui2_roll_picker");
        const beforeBox = d.getElementById("potui2_roll_before_box");
        const afterLinesEl = d.getElementById("potui2_roll_after_lines");
        if (!picker || !flashyData || !previewNode) return;

        // 閃炫模式：不顯示左右對照，改為「候選 -> 選擇 -> 預覽」
        picker.style.display = "";
        if (beforeBox) beforeBox.style.display = "none";

        // after box title
        const afterBoxEl = d.getElementById("potui2_roll_after_box");
        const h4 = afterBoxEl ? afterBoxEl.querySelector("h4") : null;
        if (h4) {
          h4.innerHTML = "";
          h4.appendChild(el("span", { text: (which === "add") ? "閃炫抽選（附加）" : "閃炫抽選（主潛能）" }));
          if (lastUpgraded) h4.appendChild(el("span", { className: "badgeUp" }, ["跳框！"]));
          h4.appendChild(el("span", { className: "mini", id: "potui2_roll_after_tier", text: "外框：" + String(previewNode.tier || "特殊") }));
        }

        picker.innerHTML = "";

        // 顯示目前裝備（舊潛能）
        picker.appendChild(el("div", { className: "flashySection" }, [
          el("div", { className: "flashyTitle", text: "目前裝備（不會變動，直到你按「保留後」）" })
        ]));
        const curBox = el("div", { className: "flashyCur" });
        renderLines(curBox, committedNode, false);
        picker.appendChild(curBox);

        // 候選
        if (which === "add") {
          const c1 = flashyData.c1 || [];
          const c23 = flashyData.c23 || [];
          let sel1 = 0;
          let sel23 = { 0: true, 1: true, 2: false }; // default 0,1

          // init selections based on previewNode.lines if possible
          try {
            if (previewNode.lines && previewNode.lines.length === 3) {
              // line1
              for (let i1 = 0; i1 < c1.length; i1++) if (sameLine(c1[i1], previewNode.lines[0])) sel1 = i1;
              // line2/3
              sel23 = { 0: false, 1: false, 2: false };
              for (let j = 0; j < c23.length; j++) {
                if (sameLine(c23[j], previewNode.lines[1]) || sameLine(c23[j], previewNode.lines[2])) sel23[j] = true;
              }
              // ensure exactly 2
              let cnt = 0; for (let k=0;k<3;k++) if (sel23[k]) cnt++;
              if (cnt !== 2) { sel23 = {0:true,1:true,2:false}; }
            }
          } catch(_){}

          picker.appendChild(el("div", { className: "flashyTitle", text: "第1排：2選1（同等級 100%）" }));
          const row1 = el("div", { className: "flashyChoices" });
          for (let a = 0; a < c1.length; a++) (function(ix){
            const opt = el("label", { className: "flashyOpt" }, [
              el("input", { type: "radio", name: "flashy_add_1", value: String(ix) }, []),
              el("span", { className: "flashyOptBody" }, [])
            ]);
            opt.querySelector("input").checked = (ix === sel1);
            const body = opt.querySelector(".flashyOptBody");
            renderSingleLine(body, c1[ix]);
            opt.querySelector("input").onchange = function(){
              sel1 = ix;
              previewNode.lines = [ c1[sel1], pickC23()[0], pickC23()[1] ];
              renderLines(afterLinesEl, previewNode, lastUpgraded);
            };
            row1.appendChild(opt);
          })(a);
          picker.appendChild(row1);

          picker.appendChild(el("div", { className: "flashyTitle", text: "第2/3排：三選二（次等級 100%）" }));
          const row23 = el("div", { className: "flashyChoices" });
          function pickC23(){
            let arr=[]; for (let z=0; z<3; z++) if (sel23[z]) arr.push(c23[z]);
            if (arr.length<2) { arr=[c23[0],c23[1]]; sel23={0:true,1:true,2:false}; }
            return arr.slice(0,2);
          }
          function enforceTwo(keepIx){
            let cnt=0; for (let z=0; z<3; z++) if (sel23[z]) cnt++;
            if (cnt>2) {
              // uncheck others except keepIx
              for (let z2=0; z2<3; z2++) if (z2!==keepIx && sel23[z2]) { sel23[z2]=false; break; }
            }
            if (cnt<2) {
              for (let z3=0; z3<3; z3++) if (!sel23[z3]) { sel23[z3]=true; cnt++; if (cnt===2) break; }
            }
          }
          for (let b = 0; b < c23.length; b++) (function(ix){
            const opt = el("label", { className: "flashyOpt" }, [
              el("input", { type: "checkbox", value: String(ix) }, []),
              el("span", { className: "flashyOptBody" }, [])
            ]);
            opt.querySelector("input").checked = !!sel23[ix];
            const body = opt.querySelector(".flashyOptBody");
            renderSingleLine(body, c23[ix]);
            opt.querySelector("input").onchange = function(){
              sel23[ix] = !!this.checked;
              enforceTwo(ix);
              // sync checkbox states
              const ins = row23.querySelectorAll("input[type=checkbox]");
              for (let q=0;q<ins.length;q++){
                const v = parseInt(ins[q].value,10);
                ins[q].checked = !!sel23[v];
              }
              const p = pickC23();
              previewNode.lines = [ c1[sel1], p[0], p[1] ];
              renderLines(afterLinesEl, previewNode, lastUpgraded);
            };
            row23.appendChild(opt);
          })(b);
          picker.appendChild(row23);

          // initial set
          const p0 = pickC23();
          previewNode.lines = [ c1[sel1], p0[0], p0[1] ];
          renderLines(afterLinesEl, previewNode, lastUpgraded);

        } else {
          // main flashy: 6 choose 3
          const cands = flashyData.candidates || flashyData || [];
          let picked = {0:true,1:true,2:true,3:false,4:false,5:false};

          // try infer from previewNode
          try {
            picked = {0:false,1:false,2:false,3:false,4:false,5:false};
            for (let i=0;i<cands.length;i++){
              if (previewNode.lines && (sameLine(cands[i], previewNode.lines[0]) || sameLine(cands[i], previewNode.lines[1]) || sameLine(cands[i], previewNode.lines[2]))) picked[i]=true;
            }
            let cc=0; for (let j=0;j<6;j++) if (picked[j]) cc++;
            if (cc!==3) picked={0:true,1:true,2:true,3:false,4:false,5:false};
          } catch(_){ picked={0:true,1:true,2:true,3:false,4:false,5:false}; }

          picker.appendChild(el("div", { className: "flashyTitle", text: "一次抽選 6 排，選擇 3 排套用（僅預覽）" }));
          const row = el("div", { className: "flashyChoices" });

          function pickedArr(){
            let arr=[]; for (let i=0;i<6;i++) if (picked[i]) arr.push(cands[i]);
            if (arr.length!==3) {
              // force exactly 3: keep first three checked
              picked={0:true,1:true,2:true,3:false,4:false,5:false};
              arr=[cands[0],cands[1],cands[2]];
            }
            return arr;
          }
          function enforceThree(keepIx){
            let cnt=0; for (let i=0;i<6;i++) if (picked[i]) cnt++;
            if (cnt>3) {
              for (let j=0;j<6;j++) if (j!==keepIx && picked[j]) { picked[j]=false; break; }
            }
            if (cnt<3) {
              for (let k=0;k<6;k++) if (!picked[k]) { picked[k]=true; cnt++; if (cnt===3) break; }
            }
          }

          for (let i=0;i<cands.length;i++) (function(ix){
            const opt = el("label", { className: "flashyOpt" }, [
              el("input", { type: "checkbox", value: String(ix) }, []),
              el("span", { className: "flashyOptBody" }, [])
            ]);
            opt.querySelector("input").checked = !!picked[ix];
            const body = opt.querySelector(".flashyOptBody");
            renderSingleLine(body, cands[ix]);
            opt.querySelector("input").onchange = function(){
              picked[ix] = !!this.checked;
              enforceThree(ix);
              // sync all
              const ins = row.querySelectorAll("input[type=checkbox]");
              for (let q=0;q<ins.length;q++){
                const v = parseInt(ins[q].value,10);
                ins[q].checked = !!picked[v];
              }
              const arr = pickedArr();
              previewNode.lines = [arr[0],arr[1],arr[2]];
              renderLines(afterLinesEl, previewNode, lastUpgraded);
            };
            row.appendChild(opt);
          })(i);

          picker.appendChild(row);

          const arr0 = pickedArr();
          previewNode.lines = [arr0[0],arr0[1],arr0[2]];
          renderLines(afterLinesEl, previewNode, lastUpgraded);
        }

        // footer note
        picker.appendChild(el("div", { className: "flashyNote", text: "套用「新潛能」才會改變裝備；保底會在每次洗方塊時累積。" }));
      }

      function sameLine(a,b){
        if (!a || !b) return false;
        return String(a.key||a.name||"")===String(b.key||b.name||"") && String(a.value||a.val||a.num||"")===String(b.value||b.val||b.num||"");
      }

      function renderSingleLine(container, line){
        if (!container) return;
        container.innerHTML = "";
        // reuse existing line renderer via renderLines by crafting a node
        const tmp = { tier: "", lines: [line] };
        renderLines(container, tmp, false, true);
      }
syncBtns();

      cubeSel.onchange = function(){ hidePicker(); updateCounts(); };

      btnRoll.onclick = function () {
        const opt = getCubeOptions();
        // 閃炫：使用獨立 UI（不共用前/後保留）
        if (opt && opt.kind === "flashy") {
          closeRollModal();
          openFlashyModal(slot, which, opt);
          return;
        }

        updateCounts();

        // snapshot committed (current) once
        if (!committedNode) committedNode = readNodeFromState();
        // do roll
        const baseNode = hasPreview ? previewNode : committedNode;
        // 讓「再洗一次」沿用上一次的預覽結果作為基底（但不改動已套用的舊潛能）
        try { w.PotentialCoreV2.setSlotPotential(slot, which, baseNode); } catch (_) {}

        let res;
        if (which === "add") {
          if (opt && opt.kind === "flashy") res = w.PotentialCoreV2.rollAddFlashy(slot, opt);
          else res = w.PotentialCoreV2.rollAdd(slot, opt);
        } else {
          if (opt && opt.kind === "flashy") res = w.PotentialCoreV2.rollMainFlashy(slot, opt);
          else res = w.PotentialCoreV2.rollMain(slot, opt);
        }
if (!res || !res.ok) {
          if (res && res.reason === "no_item") alert("道具不足：" + res.item);
          else alert("洗潛能失敗（請看 console）");
          // 確保回到舊潛能
          try { w.PotentialCoreV2.setSlotPotential(slot, which, committedNode); } catch (_) {}
          refresh();
          return;
        }

        previewNode = readNodeFromState(res.state);
        hasPreview = true;
        hasRolledOnce = true;
        lastUpgraded = !!res.upgraded;

        // 保底：每洗一次 +1（與套用哪個結果無關）
        try {
          const needP = getPityNeedUI(which, String(committedNode.tier || "特殊"));
          const curP = Math.max(0, Math.floor(n(committedNode.pity)));
          if (lastUpgraded) {
            // 若跳框，保底重置（維持核心邏輯直覺）
            committedNode.pity = 0;
          } else {
            let nextP = curP + 1;
            if (needP > 0) nextP = Math.min(nextP, needP - 1);
            committedNode.pity = nextP;
          }
        } catch (_) {}

        // 立刻還原成舊潛能：不強制套用新潛能（僅預覽）
        // 但保底進度會保留（已消耗方塊）
        try { w.PotentialCoreV2.setSlotPotential(slot, which, committedNode); } catch (_) {}
        try { updateRollPityUI(committedNode); } catch (_) {}

        // show upgraded style
        const afterBoxEl = d.getElementById("potui2_roll_after_box");
        if (afterBoxEl) afterBoxEl.className = "rollBox" + (lastUpgraded ? " upgraded" : "");
        const tierAfter = String(previewNode.tier || "特殊");
        setText("potui2_roll_after_tier", "外框：" + tierAfter);
        setText("potui2_roll_before_tier", "外框：" + String(committedNode.tier || "特殊"));

        const badge = lastUpgraded ? el("span", { className: "badgeUp" }, ["跳框！"]) : null;
        const h4 = afterBoxEl ? afterBoxEl.querySelector("h4") : null;
        if (h4) {
          const mini = h4.querySelector(".mini");
          h4.innerHTML = "";
          h4.appendChild(el("span", { text: "洗之後" }));
          if (badge) h4.appendChild(badge);
          h4.appendChild(el("span", { className: "mini", id: "potui2_roll_after_tier", text: "外框：" + tierAfter }));
        }

        renderLines(d.getElementById("potui2_roll_before_lines"), committedNode, false);
        renderLines(d.getElementById("potui2_roll_after_lines"), previewNode, lastUpgraded);

        // flashy modes: show picker UI (no before/after compare)
        if (opt && opt.kind === "flashy") {
          flashyData = res.candidates || null;
          renderFlashyPicker();
        } else {
          flashyData = null;
          hidePicker();
        }


        syncBtns();
        refresh(); // 同步主 UI
      };

      btnKeepBefore.onclick = function () {
        // 原潛能：套用目前已套用（committed）的潛能，但不關閉彈窗，可繼續洗
        try { w.PotentialCoreV2.setSlotPotential(slot, which, committedNode); } catch (_) {}
        // 清除預覽狀態
        previewNode = null;
        hasPreview = false;
        lastUpgraded = false;
        hasRolledOnce = false;
        render();
        refresh();
      };

      btnKeepAfter.onclick = function () {
        // 新潛能：套用預覽結果，但不關閉彈窗，可繼續洗
        if (!hasPreview || !previewNode) return;
        // 保底進度以「已消耗次數」為準，與保留哪個結果無關
        try { previewNode.pity = committedNode ? committedNode.pity : previewNode.pity; } catch (_) {}
        try { w.PotentialCoreV2.setSlotPotential(slot, which, previewNode); } catch (_) {}
        committedNode = previewNode;
        // 清除預覽狀態
        previewNode = null;
        hasPreview = false;
        lastUpgraded = false;
        hasRolledOnce = false;
        render();
        refresh();
      };

      btnReroll.onclick = function () {
        if (!hasPreview) return;
        // 若已跳框但尚未按「保留後」套用，依規則：再洗一次前先強制套用（避免遺失更高級外框）
        if (lastUpgraded && previewNode) {
          alert("⚠️ 本次已跳框且尚未套用。依規則將先強制套用目前的新潛能，再繼續重洗。");
          // 保底進度不因套用哪個結果而改變
          try { previewNode.pity = committedNode ? committedNode.pity : previewNode.pity; } catch (_) {}
          try { w.PotentialCoreV2.setSlotPotential(slot, which, previewNode); } catch (_) {}
          committedNode = previewNode;
          // 套用後，接著以「已套用」狀態繼續洗出新的預覽
        }
        // 直接再洗：沿用目前預覽或已套用結果為基底
        btnRoll.click();
      };
      attemptClose = function () {
        // 關閉：回到目前已套用（committed）的狀態（不強制套用預覽）
        try { w.PotentialCoreV2.setSlotPotential(slot, which, committedNode); } catch (_) {}
        closeRollModal();
        refresh();
      };

      updateCounts();
    }

    render();

    back.onclick = function (e) { if (e.target === back) attemptClose(); };
    modal.appendChild(header);
    modal.appendChild(body);

    d.body.appendChild(back);
    d.body.appendChild(modal);

    modal.querySelector("#potui2_roll_close").onclick = attemptClose;
  }

  function closeRollModal() {
    const b = d.getElementById("potui2_roll_backdrop");
    const m = d.getElementById("potui2_roll_modal");
    if (b) b.remove();
    if (m) m.remove();
  }

// -----------------------------
  // Roll
  // -----------------------------
  function doRoll(which) {
    // 以彈窗方式洗方塊（可前後選擇 / 再洗一次）
    openRollModal(which);
  }

  // -----------------------------
  // Refresh
  // -----------------------------
  function refresh() {
    const ready = coreReady();
    showCoreWarning(!ready);
    setRollButtonsEnabled(ready);

    const slot = getSelectedSlot();
    const slotName = SLOT_LABEL[slot] || slot;
    const selEl = d.getElementById("potui2_selected_name");
    if (selEl) selEl.textContent = "目前選中：" + slotName;

    // 核心未載入：仍渲染佔位
    if (!ready) {
      renderSlotsRow();
      renderAllSummaryPlaceholder();
      renderSingleSummaryPlaceholder(slot);
      renderPanelPlaceholder("main");
      renderPanelPlaceholder("add");
      applyFoldUI();
      return;
    }

    // 核心就緒
    const st = safe(() => { return w.PotentialCoreV2.ensureLinesExist(); }, null)
      || safe(() => { return w.PotentialCoreV2.getState(); }, null)
      || {};

    // 聚合
    safe(() => { w.PotentialCoreV2.applySelectedToPlayer(w.player, slot); }, null);
    safe(() => { w.PotentialCoreV2.applyAllToPlayer(w.player); }, null);

    // auto tab (依照 TABS 定義，不再硬編 slot 類別)
    (function(){
      let found = null;
      for (let i = 0; i < TABS.length; i++) {
        const arr = TABS[i].slots || [];
        for (let j = 0; j < arr.length; j++) {
          if (arr[j] === slot) { found = TABS[i].key; break; }
        }
        if (found) break;
      }
      // 若找不到（例如動態新增 slot 但尚未被放進任何 tab），就維持目前 tab 不跳
      if (found) _activeTabKey = found;
    })();

    highlightTabs();
    renderSlotsRow();

    refreshAllSummary();
    refreshPanel("main", st, slot);
    refreshPanel("add",  st, slot);

    applyFoldUI();
  }

  function renderAllSummaryPlaceholder() {
    setText("potui2_all_hint", "All slots（主+附）");
    setText("potui2_all_brief", "");
    const grid = d.getElementById("potui2_all_grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 0; i < SUMMARY_KEYS.length; i++) {
      grid.appendChild(el("div", { className: "sumItem" }, [
        el("span", { className: "k", text: statLabel(SUMMARY_KEYS[i]) }),
        el("span", { className: "v", text: "—" })
      ]));
    }
  }

  function renderSingleSummaryPlaceholder(slot) {
    setText("potui2_single_hint", (SLOT_LABEL[slot] || slot) + "（主+附）");
    setText("potui2_single_brief", "");
    const grid = d.getElementById("potui2_single_grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 0; i < SUMMARY_KEYS.length; i++) {
      grid.appendChild(el("div", { className: "sumItem" }, [
        el("span", { className: "k", text: statLabel(SUMMARY_KEYS[i]) }),
        el("span", { className: "v", text: "—" })
      ]));
    }
  }


function refreshAllSummary() {
    setText("potui2_all_hint", "All Slots (Main + Add)");

    const st = safe(() => { return w.PotentialCoreV2.getState(); }, null) || {};
    const pots = (st && st.pots) ? st.pots : {};

    const pctSum = {}, pctN = {};
    const flatSum = {}, flatN = {};

    function addPct(stat, v) {
      if (!stat) return;
      pctSum[stat] = (pctSum[stat] || 0) + n(v);
      pctN[stat] = (pctN[stat] || 0) + 1;
    }
    function addFlat(stat, v) {
      if (!stat) return;
      flatSum[stat] = (flatSum[stat] || 0) + Math.floor(n(v));
      flatN[stat] = (flatN[stat] || 0) + 1;
    }
    function isPctLine(id, v, meta){
      if (meta && meta.isPct === true) return true;
      if (id && id.indexOf("_PCT_") !== -1) return true;
      return Math.abs(n(v)) < 1;
    }
    function statFromLine(id, meta){
      if (meta && meta.stat) return String(meta.stat);
      id = String(id || "");
      if (id.indexOf("BOSSDAMAGE") === 0) return "bossDamage";
      if (id.indexOf("ELITEDAMAGE") === 0) return "eliteDamage";
      if (id.indexOf("NORMALDAMAGE") === 0) return "normalDamage";
      if (id.indexOf("TOTAL_DAMAGE") === 0 || id.indexOf("TOTALDAMAGE") === 0) return "totalDamage";
      if (id.indexOf("IGNORE_DEF") === 0 || id.indexOf("IGNOREDEF") === 0) return "ignoreDef";
      if (id.indexOf("CRIT_RATE") === 0 || id.indexOf("CRITRATE") === 0) return "critRate";
      if (id.indexOf("CRIT_DMG") === 0 || id.indexOf("CRITDMG") === 0) return "critDamage";
      return "";
    }
    function consumeLine(L){
      if (!L) return;
      const id = String(L.id || "");
      const v = n(L.value);
      const meta = L.meta || {};
      let stat = statFromLine(id, meta);

      if (!stat) {
        if (id.indexOf("ATK_") === 0) stat = "atk";
        else if (id.indexOf("DEF_") === 0) stat = "def";
        else if (id.indexOf("HP_") === 0) stat = "hp";
        else if (id.indexOf("MP_") === 0) stat = "mp";
        else if (id.indexOf("STR_") === 0) stat = "str";
        else if (id.indexOf("AGI_") === 0) stat = "agi";
        else if (id.indexOf("INT_") === 0) stat = "int";
        else if (id.indexOf("LUK_") === 0) stat = "luk";
      }
      if (!stat) return;

      if (isPctLine(id, v, meta)) addPct(stat, v);
      else addFlat(stat, v);
    }

    for (const slot in pots) {
      if (!pots.hasOwnProperty(slot)) continue;
      const p = pots[slot] || {};
      const mainLines = p.main && p.main.lines ? p.main.lines : [];
      const addLines  = p.add  && p.add.lines  ? p.add.lines  : [];
      for (let i = 0; i < mainLines.length; i++) consumeLine(mainLines[i]);
      for (let j = 0; j < addLines.length; j++) consumeLine(addLines[j]);
    }

    const pctOrder = ["bossDamage","eliteDamage","normalDamage","totalDamage","ignoreDef","critRate","critDamage","atk","str","agi","int","luk","hp","mp","def"];
    const flatOrder = ["atk","str","agi","int","luk","hp","mp","def"];

    function uniqKeys(map){
      const out = [];
      for (const k in map) if (map.hasOwnProperty(k)) out.push(k);
      return out;
    }
    function sortKeys(keys, order){
      keys.sort((a,b) =>{
        let ia = order.indexOf(a); if (ia < 0) ia = 999;
        let ib = order.indexOf(b); if (ib < 0) ib = 999;
        if (ia !== ib) return ia - ib;
        return a < b ? -1 : 1;
      });
      return keys;
    }

    const gridPct = d.getElementById("potui2_all_grid_pct");
    const gridFlat = d.getElementById("potui2_all_grid_flat");
    const secPct = d.getElementById("potui2_all_sec_pct");
    const secFlat = d.getElementById("potui2_all_sec_flat");
    const legacyGrid = d.getElementById("potui2_all_grid");

    if (legacyGrid && (!gridPct || !gridFlat)) {
      legacyGrid.innerHTML = "";
      const keys = sortKeys(uniqKeys(pctSum).concat(uniqKeys(flatSum)), pctOrder);
      const seen = {}, merged = [];
      for (let ii=0; ii<keys.length; ii++){ if(!seen[keys[ii]]){ seen[keys[ii]]=1; merged.push(keys[ii]); } }
      for (let kk=0; kk<merged.length; kk++){
        const key = merged[kk];
        const hasPct = (pctN[key] || 0) > 0;
        const vText = hasPct ? ("+" + fmtPct(pctSum[key], 2) + " (x" + pctN[key] + ")")
                           : fmtSignedInt(flatSum[key] || 0) + ((flatN[key]||0)>1 ? (" (x" + flatN[key] + ")") : "");
        legacyGrid.appendChild(el("div", { className: "sumItem" }, [
          el("span", { className: "k", text: statLabelZH(key) || statLabel(key) || key }),
          el("span", { className: "v", text: vText })
        ]));
      }
      return;
    }

    if (!gridPct || !gridFlat) return;

    const showPct = (allSummaryMode !== "flat");
    const showFlat = (allSummaryMode !== "pct");
    if (secPct) secPct.style.display = showPct ? "" : "none";
    if (secFlat) secFlat.style.display = showFlat ? "" : "none";

    gridPct.innerHTML = "";
    if (showPct) {
      const pctKeys = sortKeys(uniqKeys(pctSum), pctOrder);
      for (let ppi=0; ppi<pctKeys.length; ppi++){
        const s = pctKeys[ppi];
        if ((pctN[s]||0) <= 0) continue;
        const label = statLabelZH(s) || statLabel(s) || s;
        const vText = "+" + fmtPct(pctSum[s], 2) + " (x" + pctN[s] + ")";
        gridPct.appendChild(el("div", { className: "sumItem" }, [
          el("span", { className: "k", text: label }),
          el("span", { className: "v", text: vText })
        ]));
      }
      if (!gridPct.firstChild) {
        gridPct.appendChild(el("div", { className: "sumItem" }, [
          el("span", { className: "k", text: "—" }),
          el("span", { className: "v", text: "—" })
        ]));
      }
    }

    gridFlat.innerHTML = "";
    if (showFlat) {
      const flatKeys = sortKeys(uniqKeys(flatSum), flatOrder);
      for (let ffi=0; ffi<flatKeys.length; ffi++){
        const s2 = flatKeys[ffi];
        const vv = flatSum[s2] || 0;
        if (vv === 0) continue;
        const label2 = statLabelZH(s2) || statLabel(s2) || s2;
        const vText2 = fmtSignedInt(vv) + ((flatN[s2]||0)>1 ? (" (x" + flatN[s2] + ")") : "");
        gridFlat.appendChild(el("div", { className: "sumItem" }, [
          el("span", { className: "k", text: label2 }),
          el("span", { className: "v", text: vText2 })
        ]));
      }
      if (!gridFlat.firstChild) {
        gridFlat.appendChild(el("div", { className: "sumItem" }, [
          el("span", { className: "k", text: "—" }),
          el("span", { className: "v", text: "—" })
        ]));
      }
    }
  }

  function refreshSingleSummary(slot) {
    setText("potui2_single_hint", (SLOT_LABEL[slot] || slot) + "（主+附）");
    const sel = collectBonusForSlot(w.player, slot);
    setText("potui2_single_brief", "（ATK " + fmtSignedInt(sel.atk) + " / HP " + fmtSignedInt(sel.hp) + "）");

    const grid = d.getElementById("potui2_single_grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 0; i < SUMMARY_KEYS.length; i++) {
      const k = SUMMARY_KEYS[i];
      grid.appendChild(el("div", { className: "sumItem" }, [
        el("span", { className: "k", text: statLabel(k) }),
        el("span", { className: "v", text: fmtSignedInt(sel[k]) })
      ]));
    }
  }

  function refreshPanel(which, st, slot) {
    const node = (st && st.pots && st.pots[slot] && st.pots[slot][which]) ? st.pots[slot][which] : { tier: "特殊", pity: 0, lines: [] };
    const tier = String(node.tier || "特殊");

    // frame
    const frame = d.getElementById("potui2_" + which + "_frame");
    const tierEl = d.getElementById("potui2_" + which + "_tier");
    if (frame) frame.className = "frameBadge " + tierClass(tier);
    if (tierEl) tierEl.textContent = tierAbbr(tier);

    // pity in panel
    refreshPityInPanel(which, tier, node.pity);

    // lines
    const wrap = d.getElementById("potui2_" + which + "_lines");
    if (wrap) {
      wrap.innerHTML = "";
      const lines = Array.isArray(node.lines) ? node.lines : [];
      for (let i = 0; i < 3; i++) {
        const L = lines[i] || null;
        const t = lineToText(L);        wrap.appendChild(el("div", { className: "line " + tierClass(t.tier) }, [
          el("div", { className: "l" }, [
            el("div", { className: "lineTop" }, [
              el("span", { className: "tierPill " + tierClass(t.tier) }, [
                el("span", { className: "dot" }),
                el("span", { text: tierAbbr(t.tier) })
              ]),
              el("span", { className: "desc", text: t.desc })
            ])
          ]),
          el("div", { className: "v", text: t.val })
        ]));
      }
    }

    // cube count
    const cnt = d.getElementById("potui2_" + which + "_count");
    if (cnt) {
      const itemName = (which === "add") ? (w.PotentialCoreV2.ITEM_ADD || "附加方塊") : (w.PotentialCoreV2.ITEM_MAIN || "潛能方塊");
      const q = safe(() => { return (typeof w.getItemQuantity === "function") ? n(w.getItemQuantity(itemName)) : 0; }, 0);
      cnt.textContent = itemName + "：× " + q.toLocaleString();
    }
  }

  function refreshPityInPanel(which, tier, pityVal) {
    const pity = Math.max(0, Math.floor(n(pityVal)));
    const rule = getRuleUI(which, tier);
    const need = Math.max(0, Math.floor(n(rule.pity)));

    if (need <= 0) {
      setText("potui2_" + which + "_pity_text", "無保底");
      setWidth("potui2_" + which + "_pity_fill", "0%");
      setText("potui2_" + which + "_pity_sub", "目前：" + tier + " · 累積：" + pity);
      setText("potui2_" + which + "_chance", "升階率：" + fmtPct(n(rule.upChance), 3));
      return;
    }

    const remain = Math.max(0, need - (pity + 1)); // 核心判定是 pity+1>=need
    const pct = clamp((pity / need) * 100, 0, 100);

    setText("potui2_" + which + "_pity_text", pity + "/" + need + "（剩 " + remain + "）");
    setWidth("potui2_" + which + "_pity_fill", pct.toFixed(1) + "%");
    setText("potui2_" + which + "_pity_sub", "目前：" + tier + " · 連續未升：" + pity);
    setText("potui2_" + which + "_chance", "升階率：" + fmtPct(n(rule.upChance), 3));
  }

  function renderPanelPlaceholder(which) {
    const frame = d.getElementById("potui2_" + which + "_frame");
    const tierEl = d.getElementById("potui2_" + which + "_tier");
    if (frame) frame.className = "frameBadge " + tierClass("特殊");
    if (tierEl) tierEl.textContent = "—";

    setText("potui2_" + which + "_pity_text", "—");
    setWidth("potui2_" + which + "_pity_fill", "0%");
    setText("potui2_" + which + "_pity_sub", "—");
    setText("potui2_" + which + "_chance", "—");

    const wrap = d.getElementById("potui2_" + which + "_lines");
    if (wrap) {
      wrap.innerHTML = "";
      for (let i = 0; i < 3; i++) {        wrap.appendChild(el("div", { className: "line t_特殊" }, [
          el("div", { className: "l" }, [
            el("div", { className: "lineTop" }, [
              el("span", { className: "tierPill t_特殊" }, [
                el("span", { className: "dot" }),
                el("span", { text: "—" })
              ]),
              el("span", { className: "desc", text: "（核心未載入，無法顯示）" })
            ])
          ]),
          el("div", { className: "v", text: "" })
        ]));
      }
    }

    const cnt = d.getElementById("potui2_" + which + "_count");
    if (cnt) cnt.textContent = "—";
  }

  // -----------------------------
  // Wait for core
  // -----------------------------
  function waitCoreThenRefresh() {
    if (waitCoreThenRefresh._running) return;
    waitCoreThenRefresh._running = true;

    let tries = 0;
    const maxTries = 80;   // 12s
    const interval = 150;

    function tick() {
      tries++;
      if (coreReady()) {
        waitCoreThenRefresh._running = false;
        safe(() => { w.PotentialCoreV2.ensureLinesExist(); }, null);
        refresh();
        return;
      }
      if (tries >= maxTries) {
        waitCoreThenRefresh._running = false;
        refresh();
        return;
      }
      setTimeout(tick, interval);
    }
    setTimeout(tick, interval);
  }

  // -----------------------------
  // Small setters
  // -----------------------------
  function setText(id, text) { const x = d.getElementById(id); if (x) x.textContent = text; }
  function setWidth(id, wstr) { const x = d.getElementById(id); if (x) x.style.width = wstr; }

  // -----------------------------
  // Open / Close
  // -----------------------------
  function open() { build(); refresh(); waitCoreThenRefresh(); }
  function close() {
    closeProbModal();
    const m = d.getElementById("potui2_modal");
    const b = d.getElementById("potui2_backdrop");
    if (m) m.remove();
    if (b) b.remove();
  }

  w.PotentialUIV2 = { open, close, refresh, openProb: openProbModal };

  // Hotkey: P
  d.addEventListener("keydown", (e) => {
    if (e.key === "p" || e.key === "P") {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea") return;
      open();
    }
  });

})(window, document);