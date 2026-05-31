// cp_ui.js — 戰鬥力顯示 & 明細（整合版）
(function () {
  // --- 戰鬥力文字更新 ---
  function refreshCPUI() {
    if (typeof window.computeCombatPower !== "function") return;
    const cp = window.computeCombatPower();

    const el = document.getElementById("cp-display"); // 主畫面上的 CP
    const bd = document.getElementById("cp-badge");   // 如果你額外有一個 badge 文字

    // 取舊值，用來做「數值上升」小動畫
    let old = 0;
    if (el && el.textContent) {
      old = parseInt(String(el.textContent).replace(/[^\d]/g, ""), 10) || 0;
    } else if (bd && bd.textContent) {
      old = parseInt(String(bd.textContent).replace(/[^\d]/g, ""), 10) || 0;
    }

    const text = cp.toLocaleString();
    if (el) el.textContent = text;
    if (bd) bd.textContent = text;

    // CP 上升 → 做一下綠色閃動
    if (el && cp > old) {
      const originalColor = el.style.color || "#fff";
      el.style.color = "#4caf50";
      setTimeout(() => {
        el.style.color = originalColor;
      }, 600);
    }
  }

  // --- 戰鬥力明細（點按顯示 / 收合） ---
  function showCPSummary() {
    if (typeof window.getCombatPowerSummary !== "function") return;
    const box = document.getElementById("cp-detail");
    if (!box) return;

    const s = window.getCombatPowerSummary();
    const p = s.parts || {};

    const fmtPct = (v) => (Number(v || 0) * 100).toFixed(2) + "%";

    box.innerHTML = `
      <strong>戰鬥力：</strong>${s.cp.toLocaleString()}<br>
      攻擊潛力（DPS估算）：<span style="color:#7fc">${Math.round(s.dpsLike).toLocaleString()}</span><br>
      生存潛力（EHP估算）：<span style="color:#7cf">${Math.round(s.ehpLike).toLocaleString()}</span><br>
      <hr style="border-color:#1f2937; margin:6px 0;">
      爆擊率：${fmtPct(p.critRate)}　爆傷：${fmtPct(p.critMultiplier)}<br>
      攻速：${fmtPct(p.attackSpeedPct)}　減傷：${fmtPct(p.damageReduce)}<br>
      閃避：${fmtPct(p.dodgePercent)}　回血：${fmtPct(p.recoverPercent)}<br>
      <hr style="border-color:#1f2937; margin:6px 0;">
      一般怪物傷害：${fmtPct(p.normalDamage)}<br>
      菁英怪物傷害：${fmtPct(p.eliteDamage)}<br>
      Boss 傷害：${fmtPct(p.bossDamage)}<br>
    `;

    // 收合 / 展開切換
    if (!box.style.display || box.style.display === "none") {
      box.style.display = "block";
    } else {
      box.style.display = "none";
    }
  }

  // 掛到全域給 HTML onclick 用
  window.refreshCPUI = refreshCPUI;
  window.showCPSummary = showCPSummary;

  // 併到既有的資源 UI 更新流程
  const oldUpdate = window.updateResourceUI;
  window.updateResourceUI = function () {
    if (typeof oldUpdate === "function") oldUpdate();
    refreshCPUI();
  };

  // 首次頁面載入也更新一次
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshCPUI);
  } else {
    refreshCPUI();
  }
})();