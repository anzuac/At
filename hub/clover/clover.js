// ==========================================
// clover.js — 幸運草系統（分頁模式版）
// ==========================================
(function (w) {
  "use strict";

  const EXP_INC = 0.02;
  const DROP_INC = 0.005;
  const GOLD_INC = 0.01;

  function nz(x, d) { return isFinite(x) ? Number(x) : d || 0; }
  function fmt(n) { return Number(n || 0).toLocaleString(); }

  function init() {
    if (!w.player?.coreBonus) return setTimeout(init, 400);
    const b = w.player.coreBonus;
    b.bonusData ||= {};
    b.bonusData.clover ||= { level: 0, expBonus: 0, dropBonus: 0, goldBonus: 0 };
  }
  init();

  function baseGoldCost(nextLevel) { return nextLevel * 9000; }
  function diamondCost(nextLevel) { return Math.ceil(baseGoldCost(nextLevel) / 300); }
  function stoneCost(nextLevel) { return Math.ceil(baseGoldCost(nextLevel) / 5); }

  function getGold() { return Number(w.player?.gold ?? 0); }
  function getDiamond() { return Number(w.player?.gem ?? 0); }
  function getStone() { return Number(w.player?.stone ?? 0); }

  function spendGold(n) { w.player.gold -= n; w.updateResourceUI?.(); w.saveGame?.(); }
  function spendDiamond(n) { w.player.gem -= n; w.updateResourceUI?.(); w.saveGame?.(); }
  function spendStone(n) { w.player.stone -= n; w.updateResourceUI?.(); w.saveGame?.(); }

  // === 主介面渲染 ===
  function renderClover(container) {
    if (!container) return;
    const c = w.player?.coreBonus?.bonusData?.clover || { level: 0, expBonus: 0, dropBonus: 0, goldBonus: 0 };
    const lv = c.level;

    const nextLv = lv + 1;
    const gCost = baseGoldCost(nextLv);
    const dCost = diamondCost(nextLv);
    const sCost = stoneCost(nextLv);

    const g = getGold(), d = getDiamond(), s = getStone();
    const diamondUnlocked = lv >= 30;

    container.innerHTML = `
      <div style="background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:12px;color:#e5e7eb;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;">
        <div style="font-weight:800;font-size:16px;margin-bottom:8px;">🍀 幸運草</div>
        <div style="margin-bottom:6px;">等級：<b>Lv.${lv}</b></div>
        <div style="margin-bottom:6px;">
          經驗加成：${(c.expBonus * 100).toFixed(2)}%　|
          掉落加成：${(c.dropBonus * 100).toFixed(2)}%　|
          楓幣加成：${(c.goldBonus * 100).toFixed(2)}%
        </div>
        <div style="margin-bottom:6px;font-size:12px;opacity:.85;">
          下一級增幅：經驗 +${(EXP_INC * 100).toFixed(1)}%、掉落 +${(DROP_INC * 100).toFixed(1)}%、楓幣 +${(GOLD_INC * 100).toFixed(1)}%
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:10px;">
          <div style="background:#111827;border:1px solid #334155;border-radius:8px;padding:8px;">
            <div>楓幣路線：${fmt(gCost)}</div>
            <button id="clover-gold" style="margin-top:6px;width:100%;background:#4a4a8a;border:none;border-radius:6px;color:#fff;padding:6px;cursor:pointer;" ${(g < gCost || lv >= 100) ? "disabled" : ""}>用楓幣升級</button>
          </div>
          <div style="background:#111827;border:1px solid #334155;border-radius:8px;padding:8px;">
            <div>鑽石路線：${fmt(dCost)} <span style="font-size:11px;opacity:.6;">${diamondUnlocked ? "" : "(Lv.30解鎖)"}</span></div>
            <button id="clover-diamond" style="margin-top:6px;width:100%;background:#4a4a8a;border:none;border-radius:6px;color:#fff;padding:6px;cursor:pointer;" ${(d < dCost || !diamondUnlocked || lv >= 100) ? "disabled" : ""}>用鑽石升級</button>
          </div>
          <div style="background:#111827;border:1px solid #334155;border-radius:8px;padding:8px;">
            <div>強化石路線：${fmt(sCost)}</div>
            <button id="clover-stone" style="margin-top:6px;width:100%;background:#4a4a8a;border:none;border-radius:6px;color:#fff;padding:6px;cursor:pointer;" ${(s < sCost || lv >= 100) ? "disabled" : ""}>用強化石升級</button>
          </div>
        </div>
        ${(lv >= 100) ? '<div style="color:#ffd700;text-align:center;margin-top:8px;">已達 Lv.100 上限</div>' : ''}
      </div>
    `;

    const bg = container.querySelector("#clover-gold");
    const bd = container.querySelector("#clover-diamond");
    const bs = container.querySelector("#clover-stone");

    if (bg) bg.onclick = () => { upgradeViaGold(); renderClover(container); };
    if (bd) bd.onclick = () => { upgradeViaDiamond(); renderClover(container); };
    if (bs) bs.onclick = () => { upgradeViaStone(); renderClover(container); };
  }

  // === 原升級函式保持不變 ===
  function applyGain(route) {
    const c = w.player.coreBonus.bonusData.clover;
    c.level++;
    c.expBonus += EXP_INC;
    c.dropBonus += DROP_INC;
    c.goldBonus += GOLD_INC;
    w.updateResourceUI?.();
    w.saveGame?.();
  }

  function upgradeViaGold() {
    const lv = w.player.coreBonus.bonusData.clover.level;
    if (lv >= 100) return;
    const need = baseGoldCost(lv + 1);
    if (getGold() >= need) { spendGold(need); applyGain("Gold"); }
  }

  function upgradeViaDiamond() {
    const c = w.player.coreBonus.bonusData.clover;
    const lv = c.level;
    if (lv < 30 || lv >= 100) return;
    const need = diamondCost(lv + 1);
    if (getDiamond() >= need) { spendDiamond(need); applyGain("Diamond"); }
  }

  function upgradeViaStone() {
    const c = w.player.coreBonus.bonusData.clover;
    const lv = c.level;
    if (lv >= 100) return;
    const need = stoneCost(lv + 1);
    if (getStone() >= need) { spendStone(need); applyGain("Stone"); }
  }

  // === 分頁註冊 ===
  if (w.GrowthHub && typeof w.GrowthHub.registerTab === "function") {
    w.GrowthHub.registerTab({
      id: "clover",
      title: "幸運草",
      render: renderClover,
      tick() {}
    });
  }

  // === 對外接口（保留給舊按鈕用）===
  w.renderClover = renderClover;
  w.upgradeViaGold = upgradeViaGold;
  w.upgradeViaDiamond = upgradeViaDiamond;
  w.upgradeViaStone = upgradeViaStone;
})(window);

