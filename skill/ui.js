// =======================
// ui_skills_full.js — 技能彈窗 + SkillsHub 分頁（最終卡片版, ES2020+, SaveHub 版 Only）
// - 修正：MP (base + grow*Lv)、CD(扣精通/支援CD=0)、升級上限用 maxLevel
// - 相容：tier.logic / skill.logic
// - 相容：applyFirstJobMastery() 或 JobSkillPassivesV6.applyAll()
// =======================

(function(w, d){
  "use strict";

  // ========== 0) 一次性樣式注入 ==========
  (function injectSkillsUIStyle(){
    if (d.getElementById('skills-ui-style')) return;
    const css = ''
      + ':root{--sk-bg:#0f172a;--sk-panel:#0b1220;--sk-card:#111827;--sk-border:#233047;--sk-text:#e5e7eb;--sk-muted:#9ca3af;--sk-accent:#3b82f6;--sk-accent-2:#2563eb;--sk-success:#22c55e;}'
      + '.sk-list{display:flex;flex-direction:column;gap:10px;}'
      + '.sk-card{background:var(--sk-card);border:1px solid var(--sk-border);border-radius:12px;padding:12px;box-shadow:0 10px 24px rgba(0,0,0,.25)}'
      + '.sk-head{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-bottom:6px}'
      + '.sk-title{font-weight:700;font-size:15px;color:var(--sk-text)}'
      + '.sk-badges{display:flex;gap:6px;flex-wrap:wrap}'
      + '.sk-pill{font-size:12px;border:1px solid var(--sk-border);border-radius:9999px;padding:2px 8px;color:#cbd5e1;background:#0b1220}'
      + '.sk-pill.info{color:#bfdbfe;border-color:#1d4ed8;background:#0b1530}'
      + '.sk-desc{color:var(--sk-text);opacity:.95;font-size:13px;line-height:1.45;margin:6px 0}'
      + '.sk-meta{color:var(--sk-muted);font-size:12px}'
      + '.sk-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}'
      + '.sk-actions .left{display:flex;gap:8px;flex-wrap:wrap}'
      + '.btn{background:#1f2937;border:1px solid var(--sk-border);color:#f8fafc;padding:6px 10px;border-radius:8px;cursor:pointer}'
      + '.btn.primary{background:var(--sk-accent);border-color:var(--sk-accent-2)}'
      + '.btn.primary:disabled{opacity:.5;cursor:not-allowed}'
      + '.sk-switch{position:relative;display:inline-block;width:42px;height:24px;vertical-align:middle}'
      + '.sk-switch input{opacity:0;width:0;height:0}'
      + '.sk-slider{position:absolute;cursor:pointer;inset:0;background:#334155;border-radius:9999px;transition:.2s}'
      + '.sk-slider:before{content:"";position:absolute;height:18px;width:18px;left:3px;top:3px;background:white;border-radius:50%;transition:.2s}'
      + '.sk-switch input:checked + .sk-slider{background:var(--sk-accent)}'
      + '.sk-switch input:checked + .sk-slider:before{transform:translateX(18px)}';

    const el = d.createElement('style');
    el.id = 'skills-ui-style';
    el.textContent = css;
    d.head.appendChild(el);
  })();

  // ========== 0.5) SaveHub 技能狀態工具 ==========
  function getSkillsStateFromHub(){
    if (!w.SaveHub || typeof w.SaveHub.get !== "function") return null;
    const ns = w.SaveHub.get("skills", { _ver: 1, levels: {}, tiers: {}, auto: {} }) || {};
    ns.levels = ns.levels || {};
    ns.tiers  = ns.tiers  || {};
    ns.auto   = ns.auto   || {};
    return ns;
  }

  function applySkillsStateFromHub(){
    if (!Array.isArray(w.skills)) return;
    const ns = getSkillsStateFromHub();
    if (!ns) return;

    const lv = ns.levels;
    const tr = ns.tiers;
    const au = ns.auto;

    for (let i = 0; i < w.skills.length; i++){
      const s = w.skills[i];
      if (!s || s.id == null) continue;

      if (lv.hasOwnProperty(s.id)) s.level = Number(lv[s.id]) || 1;
      if (tr.hasOwnProperty(s.id)) s.currentTier = Number(tr[s.id]) || 0;
      if (au.hasOwnProperty(s.id)) s.autoEnabled = !!au[s.id];
    }
  }

  function saveOneSkillToHub(skill){
    if (!skill || !skill.id) return;
    if (!w.SaveHub || typeof w.SaveHub.getOrInit !== "function" || typeof w.SaveHub.set !== "function") return;

    const ns = w.SaveHub.getOrInit("skills", { _ver: 1, levels: {}, tiers: {}, auto: {} }) || {};
    ns.levels = ns.levels || {};
    ns.tiers  = ns.tiers  || {};
    ns.auto   = ns.auto   || {};

    ns.levels[skill.id] = Number(skill.level || 1);
    ns.tiers[skill.id]  = Number(skill.currentTier || 0);
    if (typeof skill.autoEnabled !== "undefined") ns.auto[skill.id] = skill.autoEnabled ? 1 : 0;

    w.SaveHub.set("skills", ns, { replace: true });
  }

  // ========== 工具：取 tier / logic ==========
  function getTier(skill){
    if (!skill) return null;
    if (typeof w.getActiveTier === "function" && skill.tiers) return w.getActiveTier(skill);
    return (skill.tiers && skill.tiers[0]) ? skill.tiers[0] : null;
  }
  function getLogic(skill, tier){
    if (tier && tier.logic && typeof tier.logic === "object") return tier.logic;
    if (skill && skill.logic && typeof skill.logic === "object") return skill.logic;
    return {};
  }

  // ========== 1) 技能彈窗骨架 ==========
  w.initSkillModal = function () {
    if (d.getElementById("skillModal")) return;

    const backdrop = d.createElement("div");
    backdrop.id = "skillBackdrop";
    backdrop.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:998;";

    const modal = d.createElement("div");
    modal.id = "skillModal";
    modal.style.cssText = "display:none;position:fixed;top:10vh;left:50%;transform:translateX(-50%);width:90vw;max-height:80vh;overflow-y:auto;background:#111827;padding:16px;border:1px solid #334155;border-radius:12px;z-index:999;color:#e5e7eb;-webkit-overflow-scrolling:touch;box-shadow:0 20px 40px rgba(0,0,0,.45)";

    const head = d.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";
    const title = d.createElement("h3");
    title.textContent = "🧠 技能清單";
    title.style.cssText = "margin:0;font-size:15px;";
    const closeBtn = d.createElement("button");
    closeBtn.textContent = "✖";
    closeBtn.className = "btn";
    closeBtn.onclick = function(){ w.closeSkillModal(); };
    head.appendChild(title);
    head.appendChild(closeBtn);
    modal.appendChild(head);

    const list = d.createElement("div");
    list.id = "skillList";
    list.style.width = "100%";
    modal.appendChild(list);

    d.body.appendChild(modal);
    d.body.appendChild(backdrop);
  };

  // ========== 2) 技能券成本（依轉數 1~4） ==========
  w.getTicketCostForSkill = function (skill) {
    let rank = Number((skill && (skill.requiredJobRank || skill.jobRank || skill.rank)) || 1);
    if (!(rank > 0)) rank = 1;
    if (rank > 4) rank = 4;
    return Math.max(1, Math.min(4, rank));
  };

  // ========== 3) 共用渲染器（卡片版） ==========
  // type: "all" | "active" | "passive" | "aura"
  w.renderSkillListInto = function(container, type) {
    if (!container) return;
    container.innerHTML = "";
    container.className = 'sk-list';

    // ⭐ 先把 SaveHub 裡的技能等級 / 進化 / 自動施放狀態套回來
    applySkillsStateFromHub();

    // ⭐ 套用一轉精通（相容舊/新）
    try {
      if (typeof w.applyFirstJobMastery === "function") w.applyFirstJobMastery();
      else if (w.JobSkillPassivesV6 && typeof w.JobSkillPassivesV6.applyAll === "function") w.JobSkillPassivesV6.applyAll();
      else if (w.JobSkillPassivesV5 && typeof w.JobSkillPassivesV5.applyAll === "function") w.JobSkillPassivesV5.applyAll();
    } catch(e){}

    const src = Array.isArray(w.skills) ? w.skills : [];

    // 去重
    const map = {}, uniqueSkills = [];
    for (let i=0;i<src.length;i++){
      const s = src[i]; if (!s || s.id == null) continue;
      map[s.id] = s;
    }
    for (const k in map) if (map.hasOwnProperty(k)) uniqueSkills.push(map[k]);

    // 智能分類（相容 skillPool/tiers）
    function classifySkill(s){
      if (!s) return { isActive:false, isPassive:false, isAura:false };
      const t = String(s.type || s.kind || s.category || "").toLowerCase();
      const byTypeActive  = (t === "active");
      const byTypePassive = (t === "passive");
      const byTypeAura    = (t === "aura");
      const hasTierAct = !!(s.tiers && s.tiers.some((tt) =>{
        return tt && (tt.cooldown != null || tt.mpCost != null || (tt.logic && typeof tt.logic === 'object'));
      }));
      const hasActHints = byTypeActive || hasTierAct ||
        (s.cooldown != null) || (s.mpCost != null) ||
        (typeof s.logic === 'object') || (typeof s.cast === 'function') ||
        (typeof s.onUse === 'function') || (typeof s.use === 'function');
      const hasPassiveHints = byTypePassive || s.isPassive === true || /passive/i.test(s.name||'');
      const hasAuraHints    = byTypeAura    || s.isAura === true    || /aura|光環/i.test(s.name||'');
      return { isActive:!!hasActHints, isPassive:!!hasPassiveHints, isAura:!!hasAuraHints };
    }

    const filtered = (function(){
      if (type === "all") return uniqueSkills;
      if (type === "active")  return uniqueSkills.filter((s) =>{ return classifySkill(s).isActive;  });
      if (type === "passive") return uniqueSkills.filter((s) =>{ return classifySkill(s).isPassive; });
      if (type === "aura")    return uniqueSkills.filter((s) =>{ return classifySkill(s).isAura;    });
      return [];
    })();

    if (!filtered.length){
      const empty = d.createElement('div');
      empty.className = 'sk-card';
      empty.style.textAlign = 'center';
      empty.style.color = 'var(--sk-muted)';
      empty.textContent = '沒有可顯示的技能';
      container.appendChild(empty);
      return;
    }

    // 建卡
    for (let j=0;j<filtered.length;j++){
      (function(skill){
        const tier = getTier(skill);
        const lg = getLogic(skill, tier);

        // --- MP 顯示（base + grow*Lv；你要的「等級×1」） ---
        const baseMp = Number(tier && tier.mpCost != null ? tier.mpCost : (skill.mpCost || 0));
        let mpGrow = Number(lg.mpCostLevelGrowth || 0);
        if (!isFinite(mpGrow)) mpGrow = 0;
        const viewMP = baseMp + mpGrow * Math.max(1, (skill.level || 1));

        // --- CD 顯示（扣精通 / 支援 CD=0） ---
        let rawCD = Number(tier && tier.cooldown != null ? tier.cooldown : (skill.cooldown || 0));
        if (!isFinite(rawCD)) rawCD = 0;

        const cdZero = !!lg.masteryCdToZero;
        let cdRed = Number(lg.masteryCdReduceSec || 0);
        if (!isFinite(cdRed)) cdRed = 0;

        const viewCD = cdZero ? 0 : Math.max(0, rawCD - cdRed);
        const viewCDStr = (Math.round(viewCD * 10) / 10).toFixed(1);

        const card = d.createElement('div');
        card.className = 'sk-card';

        // 標題列
        const head = d.createElement('div');
        head.className = 'sk-head';

        const title = d.createElement('div');
        title.className = 'sk-title';
        title.textContent = (skill.name || "(未命名技能)") + "  Lv." + (skill.level || 1);
        head.appendChild(title);

        const badges = d.createElement('div'); badges.className = 'sk-badges';
        const pillMP = d.createElement('span'); pillMP.className = 'sk-pill info'; pillMP.textContent = "MP " + viewMP;
        const pillCD = d.createElement('span'); pillCD.className = 'sk-pill info'; pillCD.textContent = "CD " + viewCDStr + "s";
        const rank = Math.max(1, Math.min(4, Number(skill.requiredJobRank || skill.rank || 0)));
        const pillLv = d.createElement('span'); pillLv.className = 'sk-pill'; pillLv.textContent = rank ? (rank + "轉") : "一般";
        badges.appendChild(pillMP); badges.appendChild(pillCD); badges.appendChild(pillLv);
        head.appendChild(badges);
        card.appendChild(head);

        // 說明（把 \n 轉成 <br>）
        const desc = d.createElement('div');
        desc.className = 'sk-desc';
        const rawDesc = (typeof skill.getDescription === 'function') ? skill.getDescription() : (skill.description || "");
        desc.innerHTML = String(rawDesc).replace(/\n/g, "<br>");
        card.appendChild(desc);

        // 底部操作列
        const actions = d.createElement('div'); actions.className = 'sk-actions';
        const leftAct = d.createElement('div'); leftAct.className = 'left';

        // 升級鈕（上限用 maxLevel，不再寫死20）
        const tkCost = (typeof w.getTicketCostForSkill === "function") ? w.getTicketCostForSkill(skill) : 1;
        const own = (typeof w.getItemQuantity === "function") ? w.getItemQuantity("技能強化券") : 0;
        const maxLv = Number(skill.maxLevel || 20);
        const canUpgrade = (skill.level || 1) < maxLv && own >= tkCost;

        const upBtn = d.createElement('button');
        upBtn.className = 'btn primary';
        upBtn.textContent = "🔼 升級（" + tkCost + " 張）";
        upBtn.disabled = !canUpgrade;
        upBtn.onclick = function(){
          if (typeof w.upgradeSkill === "function") w.upgradeSkill(skill.id);
          w.renderSkillListInto(container, type);
        };
        leftAct.appendChild(upBtn);
        actions.appendChild(leftAct);

        // 右側：自動施放開關
        const rightAct = d.createElement('div');
        const target = Array.isArray(w.skills) ? w.skills.find((x) =>{ return x.id === skill.id; }) : skill;

        if (typeof target.autoEnabled === "undefined") {
          if (w.SaveHub && typeof w.SaveHub.get === "function") {
            const ns = w.SaveHub.get("skills", { _ver: 1, levels: {}, tiers: {}, auto: {} }) || {};
            const autoMap = ns.auto || {};
            if (autoMap.hasOwnProperty(skill.id)) target.autoEnabled = !!autoMap[skill.id];
            else target.autoEnabled = false;
          } else {
            target.autoEnabled = false;
          }
        }

        const switchWrap = d.createElement('label'); switchWrap.className = 'sk-switch';
        const chk = d.createElement('input'); chk.type = 'checkbox'; chk.checked = !!target.autoEnabled;
        const slider = d.createElement('span'); slider.className = 'sk-slider';
        chk.addEventListener('change', () =>{
          const on = !!chk.checked;
          if (!target) return;
          target.autoEnabled = on;
          if (typeof saveOneSkillToHub === "function") saveOneSkillToHub(target);
        });
        switchWrap.appendChild(chk); switchWrap.appendChild(slider);

        const autoText = d.createElement('span');
        autoText.textContent = ' 自動施放';
        autoText.style.cssText = 'margin-left:8px;color:var(--sk-muted);font-size:12px;vertical-align:middle';

        const autoWrap = d.createElement('div');
        autoWrap.appendChild(switchWrap); autoWrap.appendChild(autoText);

        rightAct.appendChild(autoWrap);
        actions.appendChild(rightAct);

        card.appendChild(actions);
        container.appendChild(card);
      })(filtered[j]);
    }
  };

  // ========== 4) 彈窗 API ==========
  w.openSkillModal = function(type){
    if (!type) type = "all";
    const modal = d.getElementById("skillModal");
    const backdrop = d.getElementById("skillBackdrop");
    const list = d.getElementById("skillList");
    if (!modal || !backdrop || !list) return;
    w.renderSkillListInto(list, type);
    modal.style.display = "block";
    backdrop.style.display = "block";
  };
  w.closeSkillModal = function(){
    const m = d.getElementById("skillModal");
    const b = d.getElementById("skillBackdrop");
    if (m) m.style.display = "none";
    if (b) b.style.display = "none";
  };

  // ========== 5) 技能升級（依轉數 1~4 張）==========
  w.upgradeSkill = function upgradeSkill(skillId) {
    const skill = Array.isArray(w.skills) ? w.skills.find((s) =>{ return s.id === skillId; }) : null;
    if (!skill) return;

    const tkCost = (typeof w.getTicketCostForSkill === "function") ? w.getTicketCostForSkill(skill) : 1;
    const itemName = "技能強化券";
    const owned = (typeof w.getItemQuantity === "function") ? w.getItemQuantity(itemName) : 0;

    const maxLv = Number(skill.maxLevel || 20);
    if ((skill.level || 1) >= maxLv) {
      if (typeof w.logPrepend === "function") w.logPrepend("⚠️ 技能已達最高等級");
      return;
    }
    if (owned < tkCost) {
      if (typeof w.logPrepend === "function") w.logPrepend("❌ " + itemName + " 不足，無法升級技能");
      return;
    }

    if (typeof w.removeItem === "function") w.removeItem(itemName, tkCost);
    skill.level = (skill.level || 1) + 1;

    if (typeof saveOneSkillToHub === "function") saveOneSkillToHub(skill);

    if (typeof w.logPrepend === "function") w.logPrepend("🔼 " + (skill.name||"技能") + " 升級至 Lv." + skill.level);
    if (typeof w.saveGame === "function") w.saveGame();
  };

  // ========== 6) 掛到 SkillsHub：主動技能分頁（無 Hub 時 fallback）==========
  (function attachToSkillsHub(){
    const hub =
      (w.SkillsHub && typeof w.SkillsHub.registerTab === "function" && w.SkillsHub) ||
      (w.skills_hub && typeof w.skills_hub.registerTab === "function" && w.skills_hub) ||
      null;

    function renderActiveTab(container){
      container.style.color = "#e5e7eb";
      container.style.backgroundColor = "transparent";
      container.style.padding = "4px 0";
      if (typeof w.renderSkillListInto === "function") {
        w.renderSkillListInto(container, "active");
      } else {
        container.innerHTML = "<div style='opacity:.8'>找不到 renderSkillListInto</div>";
      }
    }

    if (hub) {
      hub.registerTab({
        id: "skills-active",
        title: "主動技能",
        render: renderActiveTab,
        tick(){},
        onOpen(){},
        onClose(){}
      });
    } else {
      function mountFallback(){
        let host = d.getElementById("skills-active-fallback");
        if (!host) {
          host = d.createElement("div");
          host.id = "skills-active-fallback";
          host.style.cssText = "margin:12px;padding:12px;border:1px dashed #334155;border-radius:8px;color:#fff;background:#111827;";
          host.innerHTML = "<div style='margin-bottom:8px;font-weight:700'>主動技能（Fallback）</div>";
          d.body.appendChild(host);
        }
        renderActiveTab(host);
      }
      if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", mountFallback);
      else mountFallback();
    }
  })();

  // ========== 7) 自動建立彈窗骨架 ==========
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", () =>{ w.initSkillModal(); });
  else w.initSkillModal();

})(window, document);