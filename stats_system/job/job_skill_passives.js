// =======================================================
// job_skill_passives.js（V7.2 MP 固定加值修正版）
// =======================================================
(function (w, d) {
  "use strict";
  if (w.JobSkillPassivesV7) return;

  var TICKET_ITEM_NAME = "被動能力券";
  var SAVE_NS = "job_skill_passives_v7.2";
  var LS_KEY = "JOB_SKILL_PASSIVES_V7.2";

  var FIRST_JOB_MAIN = {
    warrior: "warrior_rend_slash",
    mage: "mage_arcane_burst",
    archer: "archer_pierce_shot",
    thief: "thief_shadow_flurry"
  };

  var RULE = {
    stage: {
      2: { max: 10, dmg: 1, last: 2.5,   cd: 0.1, mp: 1.0, hit: 0, tgt: 0 },
      3: { max: 10, dmg: 1.2, last: 2.9,   cd: 0, mp: 1.0, hit: 1, tgt: 1 },
      4: { max: 20, dmg: 1.4, last: 2.5, cd: 0.1, mp: 1.0, hit: 1, tgt: 1 },
      5: { max: 30, dmg: 1.8, last: 2.5, cd: 0.1, mp: 1.0, hit: 1, tgt: 1 },
      6: { max: 30, dmg: 2, last: 3,   cd: 0.0, mp: 1.5, hit: 1, tgt: 0 }
    }
  };

  var PASSIVES = (function () {
    var roots = ["warrior", "mage", "archer", "thief"];
    var out = [];
    roots.forEach(function (r) {
      for (var s = 2; s <= 6; s++) {
        out.push({
          id: "jm1_" + r + "_" + s,
          rootJob: r,
          stage: s,
          maxLevel: RULE.stage[s].max,
          minJobTier: s,
          name: s + " 轉職業精通"
        });
      }
    });
    return out;
  })();

  // -----------------------------
  // 核心邏輯
  // -----------------------------
  function loadState() {
    var st = (w.SaveHub && typeof w.SaveHub.get === "function") ? w.SaveHub.get(SAVE_NS, null) : null;
    if (!st) {
      try { st = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { st = null; }
    }
    if (!st) st = { _ver: 7.2, levels: {} };
    st.levels = st.levels || {};
    return st;
  }
  
  function saveState(st) {
    if (w.SaveHub && typeof w.SaveHub.set === "function") w.SaveHub.set(SAVE_NS, st, { replace: true });
    try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch (e) {}
  }

  var _state = loadState();
  function getLevel(id) { return Number(_state.levels[id] || 0); }
  function setLevel(id, lv) { _state.levels[id] = lv; saveState(_state); }

  function getTicketCount() {
    return typeof w.getItemQuantity === "function" ? Number(w.getItemQuantity(TICKET_ITEM_NAME) || 0) : 0;
  }

  function getPlayerJobId() {
    var p = w.player || {};
    return p.jobId || p.currentJobId || p.job || "";
  }

  function getRootJob() {
    var jobs = w.jobs || {};
    var cur = getPlayerJobId();
    var guard = 0;
    while (jobs[cur] && jobs[cur].parent && guard++ < 20) { cur = jobs[cur].parent; }
    return ["warrior", "mage", "archer", "thief"].includes(cur) ? cur : null;
  }

  function getPlayerJobTier() {
    var m = String(getPlayerJobId()).match(/(\d+)$/);
    return m ? Number(m[1]) : 1;
  }

  function findSkillById(id) {
    return (Array.isArray(w.skills) && w.skills.find(s => s && s.id === id)) || null;
  }

  function getDef(id) { return PASSIVES.find(p => p.id === id) || null; }

  // -----------------------------
  // 邏輯套用 (動態補償換算版)
  // -----------------------------
  function applyAll() {
    var root = getRootJob();
    if (!root) return;
    var skill = findSkillById(FIRST_JOB_MAIN[root]);
    if (!skill) return;
    var tier = (typeof w.getActiveTier === "function") ? w.getActiveTier(skill) : (skill.tiers ? skill.tiers[0] : null);
    if (!tier) return;

    tier.logic = tier.logic || {};
    var lg = tier.logic;

    // Reset 戰鬥數值
    lg.masteryAddPctPerHit = 0;
    lg.masteryLastHitAddPct = 0;
    lg.masteryCdReduceSec = 0;
    lg.masteryHitsBonus = 0;
    lg.masteryMaxTargetsBonus = 0;
    
    // 初始化 MP 成長率
    lg.mpCostLevelGrowth = 0; 

    var add = 0, last = 0, cd = 0, hit = 0, tgt = 0, mpTotalAdd = 0;

    for (var s = 2; s <= 6; s++) {
      var def = getDef("jm1_" + root + "_" + s);
      if (!def) continue;
      var lv = getLevel(def.id);
      if (lv <= 0) continue;

      var r = RULE.stage[s];
      add   += r.dmg * lv;
      last  += r.last * lv;
      cd    += r.cd * lv;
      
      // 這裡計算你想要的「總固定加值」 (例如 10 級精通 = +10 MP)
      mpTotalAdd += r.mp * lv; 

      if (lv >= r.max) {
        hit += r.hit;
        tgt += r.tgt;
      }
    }

    lg.masteryAddPctPerHit = Math.round(add * 10) / 10;
    lg.masteryLastHitAddPct = Math.round(last * 10) / 10;
    lg.masteryCdReduceSec = Math.round(cd * 100) / 100;
    lg.masteryHitsBonus = hit;
    lg.masteryMaxTargetsBonus = tgt;

    // --- MP 邏輯修正核心 ---
    // 取得目前的技能等級 (skill.level)，如果沒有則預設為 1
    var skillLv = skill.level || 1;
    
    // 換算公式：目標增加量 / 技能等級 = 成長率
    // 這樣系統計算 (skillLv * mpCostLevelGrowth) 時，結果就會剛好是 mpTotalAdd
    if (mpTotalAdd > 0) {
        lg.mpCostLevelGrowth = mpTotalAdd / skillLv;
    } else {
        lg.mpCostLevelGrowth = 0;
    }
  }


  // -----------------------------
  // UI 渲染 (文字同步修正)
  // -----------------------------
  function render(container) {
    applyAll();
    container.innerHTML = "";
    container.style.backgroundColor = "#1a1a1a";
    container.style.color = "#eee";
    container.style.padding = "15px";
    container.style.fontFamily = "sans-serif";

    var root = getRootJob();
    if (!root) {
      container.innerHTML = "<div style='text-align:center;padding:20px;'>無法辨識職業類別</div>";
      return;
    }

    var header = d.createElement("div");
    header.style.marginBottom = "20px";
    header.style.padding = "10px";
    header.style.background = "#333";
    header.style.borderRadius = "8px";
    header.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:bold; color:#4ea6ff;">當前精通點數：</span>
        <span style="font-size:1.2em; color:#ffcc00;">${getTicketCount()} <small style="font-size:0.7em;">${TICKET_ITEM_NAME}</small></span>
      </div>
    `;
    container.appendChild(header);

    PASSIVES.filter(p => p.rootJob === root).forEach(function (def) {
      var lv = getLevel(def.id);
      var r = RULE.stage[def.stage];
      var canUp = (getLevel(def.id) < def.maxLevel) && getTicketCount() > 0 && 
                  (getPlayerJobTier() >= def.minJobTier);
      
      var prevDef = getDef("jm1_" + def.rootJob + "_" + (def.stage - 1));
      var isLocked = (getPlayerJobTier() < def.minJobTier) || (prevDef && getLevel(prevDef.id) < prevDef.maxLevel);

      var card = d.createElement("div");
      card.style.cssText = "background:#262626; border-radius:8px; padding:12px; margin-bottom:12px; border-left:4px solid " + (isLocked ? "#555" : "#4ea6ff");
      if (isLocked) card.style.opacity = "0.6";

      var progressPct = (lv / def.maxLevel) * 100;

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-weight:bold; font-size:1.1em; margin-bottom:4px;">${def.name} ${isLocked ? "🔒" : ""}</div>
            <div style="font-size:0.9em; color:#bbb; margin-bottom:8px;">等級: ${lv} / ${def.maxLevel}</div>
          </div>
          <button id="btn_${def.id}" style="padding:6px 16px; border-radius:4px; border:none; cursor:pointer; font-weight:bold; background:${canUp && !isLocked ? "#4ea6ff" : "#444"}; color:${canUp && !isLocked ? "white" : "#888"}">
            ${lv >= def.maxLevel ? "已滿等" : "升級"}
          </button>
        </div>
        
        <div style="background:#444; height:6px; border-radius:3px; margin-bottom:10px;">
          <div style="background:#4ea6ff; width:${progressPct}%; height:100%; border-radius:3px; transition:width 0.3s;"></div>
        </div>

        <div style="font-size:0.85em; line-height:1.6; color:#ccc;">
          <div>⚔️ 單段傷害：<span style="color:#fff">+${(r.dmg * lv).toFixed(1)}%</span></div>
          <div>💥 終結傷害：<span style="color:#fff">+${(r.last * lv).toFixed(1)}%</span></div>
          ${r.cd > 0 ? `<div>⏱️ 冷卻縮減：<span style="color:#fff">-${(r.cd * lv).toFixed(2)}s</span></div>` : ""}
          <div>💧 消耗增加：<span style="color:#ff8888">+${(r.mp * lv).toFixed(1)}</span></div>
          ${lv >= def.maxLevel ? `
            <div style="margin-top:5px; padding-top:5px; border-top:1px solid #444; color:#ffcc00;">
              ${r.hit ? "✨ 滿等獎勵：攻擊段數 +1" : ""}
              ${r.tgt ? (r.hit ? " | " : "") + "🎯 滿等獎勵：攻擊目標 +1" : ""}
            </div>
          ` : ""}
        </div>
      `;

      var btn = card.querySelector("#btn_" + def.id);
      btn.onclick = function () {
        if (isLocked) return alert("前置精通未完成或職業轉職等級不足！");
        if (!canUp) return;
        
        if (typeof w.removeItem === "function") w.removeItem(TICKET_ITEM_NAME, 1);
        setLevel(def.id, lv + 1);
        render(container);
      };

      container.appendChild(card);
    });
  }

  // -----------------------------
  // 掛載與初始化
  // -----------------------------
  if (w.SkillsHub && typeof w.SkillsHub.registerTab === "function") {
    w.SkillsHub.registerTab({
      id: "skills-masteries-v7",
      title: "技能精通",
      render: render,
      onOpen: applyAll
    });
  }

  function tryApply() {
    if (w.player && Array.isArray(w.skills)) applyAll();
  }

  ["rebuildActiveSkills", "loadSkillsByJob"].forEach(function (fn) {
    if (typeof w[fn] === "function" && !w["__v7_" + fn]) {
      w["__v7_" + fn] = true;
      var orig = w[fn];
      w[fn] = function () {
        var r = orig.apply(this, arguments);
        tryApply();
        return r;
      };
    }
  });

  w.JobSkillPassivesV7 = { applyAll: applyAll, getLevel: getLevel, RULE: RULE };
  tryApply();

})(window, document);
