// special_boss_ui.js
// 超簡易 Boss 選單，之後你可以改成自己的 UI

(function (w) {
  "use strict";

  function openSpecialBossMenu() {
    const list = w.SpecialBossList || {};
    const containerId = "specialBossMenu";
    let box = document.getElementById(containerId);

    if (!box) {
      box = document.createElement("div");
      box.id = containerId;
      box.style.position = "fixed";
      box.style.left = "50%";
      box.style.top = "50%";
      box.style.transform = "translate(-50%, -50%)";
      box.style.zIndex = 9999;
      box.style.background = "#111827";
      box.style.color = "#e5e7eb";
      box.style.border = "1px solid #4b5563";
      box.style.borderRadius = "10px";
      box.style.padding = "12px 16px";
      box.style.minWidth = "260px";
      box.style.boxShadow = "0 12px 30px rgba(0,0,0,.55)";
      document.body.appendChild(box);
    }

    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div style="font-weight:700;">選擇要挑戰的 Boss</div>
      <button style="background:#374151;border:none;color:#e5e7eb;border-radius:6px;padding:2px 8px;cursor:pointer;"
        onclick="document.getElementById('${containerId}').style.display='none';">
        關閉
      </button>
    </div>`;

    for (const key in list) {
      const boss = list[key];
      html += `
        <div style="margin:6px 0;padding:6px 8px;border-radius:6px;background:#020617;">
          <div><b>${boss.name}</b>（等級 ${boss.stats.level}）</div>
          <div style="font-size:12px;opacity:.8;">HP 約 ${boss.stats.hp.toLocaleString()}｜ATK 約 ${boss.stats.atk.toLocaleString()}</div>
          <button style="margin-top:4px;background:#16a34a;border:none;color:white;border-radius:6px;padding:3px 10px;cursor:pointer;"
            onclick="SpecialBossUI._startBoss('${key}')">
            使用「${boss.ticketItem || "Boss挑戰券"}」挑戰
          </button>
        </div>
      `;
    }

    box.innerHTML = html;
    box.style.display = "block";
  }

  function _startBoss(key) {
    if (!w.SpecialBossGate) {
      alert("SpecialBossGate 尚未載入。");
      return;
    }
    const r = w.SpecialBossGate.tryEnter(key);
    alert(r.msg || (r.ok ? "進入挑戰" : "無法進入"));
    if (r.ok) {
      const box = document.getElementById("specialBossMenu");
      if (box) box.style.display = "none";
    }
  }

  w.SpecialBossUI = {
    open: openSpecialBossMenu,
    _startBoss
  };

})(window);