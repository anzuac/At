// =======================================================
// job_passives_tab.js — GrowthHub 分頁（UI 層，ES5）
//
// - 僅依賴 JobPassivesCore
// - 技能卡片完全由 Core 的 skillDefs 渲染，不在 UI 寫死數字
// - 顯示本職技能 + 共通 女神祈禱 + 目前被動加成
// - 女神祈禱主增量說明讀 Core.DESIGN.GODDESS
// - 未來新增技能，只要在 Core 端 registerSkill 即可，UI 不用改
// =======================================================
(function (w, d) {
  "use strict";
  if (w.JobPassiveTab) return;

  function byId(id){ return d.getElementById(id); }
  function fmt(n){ return Number(n || 0).toLocaleString(); }

  function getBaseJobSafe(job){
    var j = String(job || "").toLowerCase();
    if (typeof w.getBaseJob === "function") return w.getBaseJob(j);
    return j.replace(/\d+$/, "");
  }

  function getTickets(){
    try{
      if (typeof w.getItemQuantity === "function") {
        return (w.getItemQuantity("被動能力券") | 0);
      }
    } catch (_){}
    return 0;
  }

  function card(title, inner){
    return '' +
      '<div style="background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px">' +
        '<div style="font-weight:700;margin-bottom:6px">' + title + '</div>' +
        inner +
      '</div>';
  }

  function jobIcon(job){
    if (job === "warrior") return "🛡";
    if (job === "mage")    return "🔮";
    if (job === "thief")   return "🗡";
    if (job === "archer")  return "🏹";
    if (job === "global")  return "🧝‍♀️";
    return "✨";
  }

  function groupLabel(group){
    if (group === "old")     return "舊被動";
    if (group === "new")     return "新被動";
    if (group === "goddess") return "共通・女神祈禱";
    return "其他";
  }

  function getLevelFromSnapshot(lv, def){
    if (!lv || !def) return 0;
    var root = lv[def.stateRoot] || {};
    var val = root[def.stateKey];
    return (val | 0) || 0;
  }

  function isGoddessUnlocked(lv, skillDefs, baseJob){
    var i, def, lvl;
    for (i = 0; i < skillDefs.length; i++) {
      def = skillDefs[i];
      if (!def || !def.isPrimary) continue;
      if (def.job !== baseJob) continue;
      lvl = getLevelFromSnapshot(lv, def);
      if (lvl >= (def.cap || 0)) return true;
    }
    return false;
  }

  function renderCurrentBonusHtml(Core, lv){
    try{
      var cfg = Core.getConfig ? Core.getConfig() : null;
      var goddessDesign = cfg && cfg.DESIGN && cfg.DESIGN.GODDESS;
      var perLvPct = goddessDesign ? (goddessDesign.PER_LV_PERCENT * 100) : 0;
      var maxPct   = goddessDesign ? (goddessDesign.MAX_TOTAL_PERCENT * 100) : 0;

      var c = (w.player && w.player.coreBonus && w.player.coreBonus.bonusData) || {};
      var b = c.jobPassives || {};
      var items = [];

      function pct(val){
        return (Math.round((Number(val || 0) * 100) * 10) / 10) + "%";
      }

      function add(label, val, fmtFn){
        if (val !== undefined && Number(val) !== 0){
          items.push(
            '<div style="display:flex;justify-content:space-between;gap:8px">' +
              "<span>" + label + "</span>" +
              "<b>" + (fmtFn ? fmtFn(val) : String(val)) + "</b>" +
            "</div>"
          );
        }
      }

      // 百分比 / 機率
      add("減傷", b.damageReduce, pct);
      add("魔力護盾", b.magicShieldPercent, pct);
      add("連擊機率", b.doubleHitChance, pct);
      add("先手再動機率", b.preemptiveChance, pct);
      add("每次攻擊再動上限", b.preemptivePerAttackMax, function (v){ return "+" + (v | 0); });

      // 平坦
      add("生命值(平坦)", b.hp, function (v){ return "+" + fmt(v | 0); });
      add("魔力值(平坦)", b.mp, function (v){ return "+" + fmt(v | 0); });

      // 女神祈禱 10等起攻防平坦
      add("女神祈禱・攻擊力(平坦)", b.goddessAtkFlat, function (v){ return "+" + fmt(v | 0); });
      add("女神祈禱・防禦力(平坦)", b.goddessDefFlat, function (v){ return "+" + fmt(v | 0); });
add("攻擊力(平坦)", b.atk, function (v){ return "+" + fmt(v | 0); });
add("防禦力(平坦)", b.def, function (v){ return "+" + fmt(v | 0); });
      // 女神祈禱主增量百分比：直接用設計 + 等級算（PotentialBonus那邊真正加成）
      var gLv = (lv && lv.global && (lv.global.goddessGrace | 0)) || 0;
      var gPct = 0;
      if (goddessDesign) {
        gPct = Math.min(maxPct, gLv * perLvPct);
      } else {
        gPct = gLv * 3; // fallback 每級3%
      }
      if (gPct !== 0) {
        items.push(
          '<div style="display:flex;justify-content:space-between;gap:8px">' +
            '<span>女神祈禱（主增量）</span>' +
            "<b>" + gPct.toFixed(1) + "%</b>" +
          "</div>"
        );
      }

      if (goddessDesign) {
        items.push(
          '<div style="margin-top:6px;font-size:11px;opacity:.65">' +
            "女神祈禱：每級 +" + perLvPct.toFixed(1) +
            "% 主增量，上限約 " + maxPct.toFixed(1) +
            "%；10 等起額外給攻防，屬於固定加成（顯示於上方攻/防平坦）" +
          "</div>"
        );
      }

      return items.length ? items.join("") : '<div style="opacity:.7">目前無加成</div>';
    } catch (_){}
    return '<div style="opacity:.7">目前無加成</div>';
  }

  function renderSkillCard(def, lv, Core, baseJob, goddessUnlocked){
    var levelVal = getLevelFromSnapshot(lv, def);
    var canLevel = false;
    var lockedMsg = "";

    if (Core && typeof Core.canLevelUp === "function") {
      canLevel = Core.canLevelUp(def.jobKey || def.id);
    }

    if (def.group === "goddess" && !goddessUnlocked) {
      lockedMsg = '<div style="opacity:.75;margin-bottom:4px">🔒 需先將本職的新被動點滿（' + baseJob + "）</div>";
    }

    var btnId = "btnJP_" + def.id;
    var disabledAttr = "";
    var btnStyle = 'background:#4b5563;border:0;border-radius:8px;padding:6px 10px;color:#e5e7eb;cursor:pointer';

    if (!canLevel) {
      disabledAttr = 'disabled style="opacity:.5;cursor:not-allowed"';
    } else {
      btnStyle = 'background:#16a34a;border:0;border-radius:8px;padding:6px 10px;color:#031318;cursor:pointer';
    }

    var title = jobIcon(def.job) + " " + def.name;

    var inner =
      '<div style="opacity:.85;margin-bottom:4px">' + (def.detailDesc || def.shortDesc || "") + "</div>" +
      lockedMsg +
      '<div>等級：<b>' + levelVal + "</b> / " + (def.cap || 0) + "</div>" +
      '<div style="margin-top:6px">' +
        '<button id="' + btnId + '" ' + disabledAttr + ' style="' + btnStyle + '">' +
          "升級（-1 張）" +
        "</button>" +
      "</div>";

    return card(title, inner);
  }

  function renderInto(container){
    var Core = w.JobPassivesCore || null;
    if (!Core) {
      container.innerHTML = card("⚠️ 職業被動", "缺少模組：job_passives_core");
      return;
    }

    var lv   = Core.getLevels();
    var base = getBaseJobSafe(w.player && w.player.job);
    var ticketStr = fmt(getTickets());
    var ONLY_SELF = true; // 只顯示本職 + global

    var skillDefs = [];
    if (typeof Core.getAllSkillDefs === "function") {
      skillDefs = Core.getAllSkillDefs() || [];
    } else if (typeof Core.getSkillDefs === "function") {
      skillDefs = Core.getSkillDefs() || [];
    }

    var filtered = [];
    var i, def;
    for (i = 0; i < skillDefs.length; i++) {
      def = skillDefs[i];
      if (!def || def.hidden) continue;
      if (ONLY_SELF) {
        if (def.job !== base && def.job !== "global") continue;
      }
      filtered.push(def);
    }

    var goddessUnlocked = isGoddessUnlocked(lv, skillDefs, base);

    var groups = { old: [], new: [], goddess: [], other: [] };
    for (i = 0; i < filtered.length; i++) {
      def = filtered[i];
      var g = def.group || "other";
      if (!groups[g]) groups[g] = [];
      groups[g].push(def);
    }

    function sortBySort(a, b){
      var as = (a.sort || 0);
      var bs = (b.sort || 0);
      return as - bs;
    }
    for (var gKey in groups) {
      if (groups.hasOwnProperty(gKey)) {
        groups[gKey].sort(sortBySort);
      }
    }

    var sections = [];

    sections.push(card("📈 目前被動加成", renderCurrentBonusHtml(Core, lv)));
    sections.push(card("🎟 可用憑證", "被動能力券：<b>" + ticketStr + "</b>"));

    var groupOrder = ["old", "new", "goddess", "other"];

    for (var gi = 0; gi < groupOrder.length; gi++) {
      var gName = groupOrder[gi];
      var list = groups[gName] || [];
      if (!list.length) continue;

      var groupTitle = groupLabel(gName);
      var htmlParts = [];
      for (i = 0; i < list.length; i++) {
        def = list[i];
        htmlParts.push(
          renderSkillCard(def, lv, Core, base, goddessUnlocked)
        );
      }

      sections.push(
        card(jobIcon(gName === "goddess" ? "global" : base) + " " + groupTitle,
          htmlParts.join("")
        )
      );
    }

    container.innerHTML = sections.join("");

    function bindSkillButtons(defs){
      var i, def, btn, jobKey;
      for (i = 0; i < defs.length; i++) {
        def = defs[i];
        var btnId = "btnJP_" + def.id;
        btn = byId(btnId);
        if (!btn) continue;
        jobKey = def.jobKey || def.id;
        btn.onclick = (function (jk){
          return function (){
            if (Core.tryLevelUp && Core.tryLevelUp(jk)) {
              Core.apply && Core.apply();
              requestRerender();
            } else {
              alert("需要被動能力券、未解鎖、職業不符或已達上限");
            }
          };
        })(jobKey);
      }
    }

    bindSkillButtons(filtered);
  }

  function requestRerender(){
    if (w.GrowthHub && typeof w.GrowthHub.requestRerender === "function") {
      w.GrowthHub.requestRerender();
    } else {
      var root = byId("job-passives-fallback");
      if (root) renderInto(root);
    }
  }

  function mountFallback(){
    var root = byId("job-passives-fallback");
    if (!root){
      root = d.createElement("div");
      root.id = "job-passives-fallback";
      root.style.cssText = "padding:10px;border:1px solid #334155;border-radius:10px;margin:8px 0;background:#0b1220;color:#cbd5e1";
      d.body.appendChild(root);
    }
    renderInto(root);
  }

  if (w.SkillsHub && typeof w.SkillsHub.registerTab === "function") {
    w.SkillsHub.registerTab({
      id: "job-passives",
      title: "職業被動",
      render: function (c){ renderInto(c); },
      tick: function(){},
      onOpen: function (){
        try { (w.JobPassivesCore || {}).apply && w.JobPassivesCore.apply(); } catch (_){}
      },
      onClose: function (){
        try { (w.JobPassivesCore || {}).apply && w.JobPassivesCore.apply(); } catch (_){}
      }
    });
  } else {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountFallback);
    } else {
      mountFallback();
    }
  }

  try {
    (w.JobPassivesCore || {}).subscribe && w.JobPassivesCore.subscribe(requestRerender);
  } catch (_){}

  w.JobPassiveTab = { rerender: requestRerender };
})(window, document);