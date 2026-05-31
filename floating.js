// ==========================================
// 戰鬥真多段記錄面板 (RPG 終極分頁版)
// ==========================================
(function(w, d) {
  "use strict";
  if (w.MultiHitDetailPanel) return;

  const style = d.createElement("style");
  style.textContent = `
    #mh-panel {
      position: fixed; right: 10px; top: 110px; width: 310px;
      background: rgba(15, 15, 25, 0.95);
      border: 2px solid #5a5a7a; border-radius: 4px;
      box-shadow: 0 0 20px rgba(0,0,0,0.8), inset 0 0 10px rgba(100,100,150,0.2);
      z-index: 9999; font-family: 'Segoe UI', 'Microsoft JhengHei', sans-serif;
      color: #e2e8f0; transition: transform 0.3s ease;
    }
    #mh-panel.collapsed { transform: translateX(290px); }
    
    #mh-header {
      background: linear-gradient(to right, #2d3748, #1a202c);
      padding: 8px 12px; display: flex; justify-content: space-between;
      cursor: pointer; border-bottom: 1px solid #4a5568; font-weight: bold; font-size: 13px;
    }

    #mh-skill-info {
      padding: 12px; background: rgba(66, 153, 225, 0.15);
      font-size: 16px; color: #63b3ed; text-align: center; font-weight: bold;
      letter-spacing: 1px; text-shadow: 0 0 8px rgba(99, 179, 237, 0.5);
    }

    /* Tab 切換區 */
    #mh-tabs {
      display: flex; overflow-x: auto; background: #1a202c; border-bottom: 1px solid #4a5568;
    }
    .mh-tab {
      padding: 10px 16px; font-size: 12px; cursor: pointer; color: #718096;
      border-right: 1px solid #2d3748; transition: all 0.2s; white-space: nowrap;
    }
    .mh-tab.active { background: #2d3748; color: #63b3ed; box-shadow: inset 0 -2px 0 #63b3ed; }

    #mh-content { padding: 15px; max-height: 280px; overflow-y: auto; background: #0f172a; }

    /* 總結資訊 */
    .mh-summary { 
      font-size: 11px; color: #a0aec0; margin-bottom: 10px; 
      padding-bottom: 8px; border-bottom: 1px dashed #4a5568;
      display: flex; justify-content: space-between;
    }

    /* 傷害列表 */
    .mh-hit-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.03);
    }
    .dmg-box { display: flex; flex-direction: column; }
    .hit-num { font-size: 9px; color: #4a5568; text-transform: uppercase; }
    .dmg-val { font-size: 15px; font-weight: bold; font-family: 'Consolas', monospace; }
    .dmg-normal { color: #edf2f7; }
    .dmg-crit { color: #f6ad55; text-shadow: 0 0 10px rgba(246, 173, 85, 0.4); }

    /* 標籤樣式 */
    .badge {
      padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: bold; margin-left: 5px;
    }
    .bg-crit { background: #f6ad55; color: #1a202c; }
    .bg-shield { background: #4299e1; color: #fff; }
    .bg-ko { background: #f56565; color: #fff; box-shadow: 0 0 5px #f56565; }
  `;
  d.head.appendChild(style);

  const panel = d.createElement("div");
  panel.id = "mh-panel";
  panel.innerHTML = `
    <div id="mh-header"><span>BATTLE ANALYZER</span><span id="mh-toggle">▶</span></div>
    <div id="mh-skill-info">- WAITING -</div>
    <div id="mh-tabs"></div>
    <div id="mh-content"></div>
  `;
  d.body.appendChild(panel);

  const toggle = panel.querySelector("#mh-header");
  toggle.onclick = () => panel.classList.toggle("collapsed");

  w.MultiHitDetailPanel = {
    push(data) {
      const skillInfo = d.getElementById("mh-skill-info");
      const tabContainer = d.getElementById("mh-tabs");
      const content = d.getElementById("mh-content");

      skillInfo.textContent = data.skillName.toUpperCase();
      tabContainer.innerHTML = "";
      
      if (!data.targets || data.targets.length === 0) {
        content.innerHTML = "<div style='text-align:center;padding:20px;color:#4a5568;'>TARGET MISSED</div>";
        return;
      }

      data.targets.forEach((target, index) => {
        const tab = d.createElement("div");
        tab.className = `mh-tab ${index === 0 ? 'active' : ''}`;
        tab.textContent = target.name || `TARGET ${index + 1}`;
        tab.onclick = () => {
          d.querySelectorAll(".mh-tab").forEach(el => el.classList.remove("active"));
          tab.classList.add("active");
          this.renderTarget(target);
        };
        tabContainer.appendChild(tab);
      });

      this.renderTarget(data.targets[0]);
    },

    renderTarget(target) {
      const content = d.getElementById("mh-content");
      
      // 計算總傷與評價
      const totalDmg = target.hits.reduce((sum, h) => sum + h.dmg, 0);
      const critCount = target.hits.filter(h => h.crit).length;
      const isKO = target.hits.some(h => h.kill);

      let html = `
        <div class="mh-summary">
          <span>TOTAL: ${totalDmg.toLocaleString()}</span>
          <span style="color: #f6ad55">${critCount > 0 ? 'CRIT x' + critCount : ''}</span>
          <span style="color: #f56565">${isKO ? 'ELIMINATED' : ''}</span>
        </div>
      `;

      target.hits.forEach((h, i) => {
        html += `
          <div class="mh-hit-row">
            <div class="dmg-box">
              <span class="hit-num">Phase ${i+1}</span>
              <span class="dmg-val ${h.crit ? 'dmg-crit' : 'dmg-normal'}">${h.dmg.toLocaleString()}</span>
            </div>
            <div>
              ${h.crit ? '<span class="badge bg-crit">CRIT</span>' : ''}
              ${h.shield > 0 ? `<span class="badge bg-shield">🛡️ ${h.shield}</span>` : ''}
              ${h.kill ? '<span class="badge bg-ko">K.O.</span>' : ''}
            </div>
          </div>
        `;
      });
      content.innerHTML = html;
    }
  };
})(window, document);
