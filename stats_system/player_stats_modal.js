// =======================
// player_stats_modal.js — 詳細資訊面板（卡片網格版, ES5）
// 依賴：window.player、window.getIgnoreDefBreakdown（可選）
// 提供：createStatModal() / openStatModal()
// 修正：來源拆解不再用「殘差=技能」，改用：基礎 / 裝備核心 / 潛能 / 技能(平坦/%) + 其他(誤差)
// 注意：不顯示任何 bonusData / 內部 key，僅顯示分類加總結果
// =======================
(function (w) {
  "use strict";
  if (!w || !w.player) return;

  // ---- 小工具 ----
  function n(x){ return Number(x || 0); }
  function fmt(v){ return Number(v || 0).toLocaleString(); }
  function pct(x, d){ d = (d == null ? 2 : d); return (Number(x || 0) * 100).toFixed(d) + "%"; }
  // 整數百分比（10 = 10%）的顯示
  function pctInt(p){
    p = Number(p || 0);
    if (!isFinite(p) || p === 0) return "0%";
    var s = p.toFixed(2);
    if (s.indexOf(".") >= 0) s = s.replace(/\.00$/, "");
    return s + "%";
  }
  function abs(x){ return Math.abs(Number(x || 0)); }

  // 四維數值 → 顏色等級（數值越高顏色越亮）
  function getStatTierClass(v){
    v = Number(v || 0);
    if (v >= 1000) return "stat-tier-3"; // 很高：金色
    if (v >= 500)  return "stat-tier-2"; // 中高：藍紫
    if (v > 0)     return "stat-tier-1"; // 有點數：一般亮度
    return "";
  }

  // 取得安全的技能平坦/百分比（不同專案命名容錯）
  function getSkillFlat(skillBonus, statKey){
    if (!skillBonus) return 0;
    // atkFlat / defFlat 常見
    if (statKey === "atk") return n(skillBonus.atkFlat);
    if (statKey === "def") return n(skillBonus.defFlat);
    // hp/mp 若你未定義 flat，預設 0（需要可自行擴充 hpFlat/mpFlat）
    if (statKey === "hp")  return n(skillBonus.hpFlat);
    if (statKey === "mp")  return n(skillBonus.mpFlat);
    return 0;
  }
  function getSkillPct(skillBonus, statKey){
    if (!skillBonus) return 0;
    // 你聚合器的 getter 命名：atkPercent/defPercent/hpPercent/mpPercent
    if (statKey === "atk") return n(skillBonus.atkPercent);
    if (statKey === "def") return n(skillBonus.defPercent);
    if (statKey === "hp")  return n(skillBonus.hpPercent);
    if (statKey === "mp")  return n(skillBonus.mpPercent);
    return 0;
  }

  // 取得潛能%（由 potential_engine 的來源池 _potentialSources 匯總）
  // 規格：xxxPct 以「整數百分比」存放（10 = 10%）
  function getPotentialPct(player, pctKey){
    var bucket = player && player._potentialSources;
    if (!bucket || typeof bucket !== "object") return 0;
    var sum = 0;
    for (var srcKey in bucket){
      if (!bucket.hasOwnProperty(srcKey)) continue;
      var src = bucket[srcKey];
      if (!src || typeof src !== "object") continue;
      var v = src[pctKey];
      if (typeof v !== "number" || !isFinite(v)) continue;
      sum += v;
    }
    return sum;
  }

  function getPotentialPctByStat(player, statKey){
    if (statKey === "atk") return getPotentialPct(player, "atkPct");
    if (statKey === "def") return getPotentialPct(player, "defPct");
    if (statKey === "hp")  return getPotentialPct(player, "hpPct");
    if (statKey === "mp")  return getPotentialPct(player, "mpPct");
    // 四維：自身% + 全屬%
    if (statKey === "str") return getPotentialPct(player, "strPct") + getPotentialPct(player, "allStatPct");
    if (statKey === "agi") return getPotentialPct(player, "agiPct") + getPotentialPct(player, "allStatPct");
    if (statKey === "int") return getPotentialPct(player, "intPct") + getPotentialPct(player, "allStatPct");
    if (statKey === "luk") return getPotentialPct(player, "lukPct") + getPotentialPct(player, "allStatPct");
    return 0;
  }

  // 從 coreBonus.bonusData 中取特定來源（例如 collectionBook）的平坦貢獻
  function getCoreSourceFlat(coreBonus, sourceKey, statKey){
    if (!coreBonus || !coreBonus.bonusData) return 0;
    var src = coreBonus.bonusData[sourceKey];
    if (!src || typeof src !== "object") return 0;
    return n(src[statKey]);
  }

  // 來源拆解：基礎/核心/潛能/技能(flat/%)
  // 預設假設：total ≈ (base + core + pot + skillFlat) * (1 + skillPct)
  // 若你的引擎有其他乘區或加區，會落在 other（誤差）顯示，避免被錯歸類為技能
  function breakFlatPlusPercent(totalVal, baseFlat, coreFlat, potFlat, skillFlat, skillPct){
    var base = n(baseFlat);
    var core = n(coreFlat);
    var pot  = n(potFlat);
    var sF   = n(skillFlat);
    var sP   = n(skillPct);

    var flatSum = base + core + pot + sF;
    var expected = flatSum * (1 + sP);

    var total = n(totalVal);
    var other = total - expected;

    // 避免顯示 -0
    if (abs(other) < 1e-6) other = 0;

    return {
      base: base,
      core: core,
      pot: pot,
      skillFlat: sF,
      skillPct: sP,
      other: other
    };
  }

  // ---- Ignore DEF breakdown ----
  function buildIgnoreDefBreakdown(totalIgnoreDef){
    var base = (typeof w.getIgnoreDefBreakdown === "function")
      ? (w.getIgnoreDefBreakdown() || { sources:[], product:1, combined:0 })
      : { sources:[], product:1, combined: (totalIgnoreDef || 0) };

    var seen = {};
    var out = { sources:[], product:1, combined:0 };

    function add(label, p){
      p = Number(p || 0);
      if (!p) return;
      if (seen[label]) return;
      seen[label] = true;
      out.sources.push({ label: String(label || "來源"), p: p });
    }

    if (base.sources && base.sources.length){
      for (var i=0; i<base.sources.length; i++){
        var s = base.sources[i];
        if (!s || typeof s.p !== "number") continue;
        add(s.label || ("來源" + (i+1)), s.p);
      }
    }

    var product = 1;
    for (var j=0; j<out.sources.length; j++){
      var pz = Number(out.sources[j].p || 0);
      if (pz < 0) pz = 0;
      if (pz > 0.999999) pz = 0.999999;
      product *= (1 - pz);
    }
    out.product = product;
    out.combined = 1 - product;

    if (typeof base.combined === "number" && base.combined > out.combined){
      out.combined = base.combined;
    }
    return out;
  }

  // ---- 樣式（卡片 + 網格） ----
  function ensureStyle() {
    if (document.getElementById("statModalStyle")) return;
    var s = document.createElement("style");
    s.id = "statModalStyle";
    s.textContent =
      "\n#statModal{position:fixed;inset:0;display:none;z-index:9999;justify-content:center;align-items:center;background:rgba(0,0,0,.65)}"+
      "\n#statModalContent{background:#0b1220;color:#e5e7eb;border:1px solid #1f2937;border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.5);width:min(980px,94vw);max-height:90vh;overflow:auto;padding:14px;font:14px/1.6 system-ui,Segoe UI,Roboto,Arial,sans-serif;position:relative}"+
      "\n.close-btn{position:absolute;top:10px;right:14px;background:#334155;color:#fff;border:0;border-radius:8px;padding:6px 10px;cursor:pointer}"+
      "\n.section{margin-bottom:14px}"+
      "\n.section-title{font-weight:800;letter-spacing:.3px;margin-bottom:8px;display:flex;align-items:center;gap:8px}"+
      "\n.chip{padding:2px 8px;border-radius:999px;font-size:12px;border:1px solid transparent}"+
      "\n.chip-blue{background:#1e3a8a;color:#dbeafe;border-color:#1d4ed8}"+
      "\n.chip-green{background:#064e3b;color:#d1fae5;border-color:#10b981}"+
      "\n.chip-amber{background:#78350f;color:#ffedd5;border-color:#f59e0b}"+
      "\n.chip-purple{background:#3b0764;color:#ede9fe;border-color:#8b5cf6}"+
      "\n.chip-teal{background:#134e4a;color:#ccfbf1;border-color:#14b8a6}"+
      "\n.muted{opacity:.75}"+
      "\n.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,\"Courier New\",monospace}"+
      "\n.card{background:#0f172a;border:1px solid #1f2937;border-radius:12px;padding:12px}"+
      "\n.card+.card{margin-top:8px}"+
      "\n.card-head{font-weight:700;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:8px}"+
      "\n.sep{height:1px;background:#1f2937;margin:6px 0}"+
      "\n.grid-tiles{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}"+
      "\n.grid-2{display:grid;gap:8px 12px;grid-template-columns:repeat(2,minmax(0,1fr))}"+
      "\n.grid-3{display:grid;gap:8px 12px;grid-template-columns:repeat(3,minmax(0,1fr))}"+
      "\n.grid-4{display:grid;gap:8px 12px;grid-template-columns:repeat(4,minmax(0,1fr))}"+
      "\n@media (min-width:720px){.grid-tiles{grid-template-columns:repeat(4,minmax(0,1fr))}}"+
      "\n.tile{background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px;min-height:68px}"+
      "\n.tile-label{font-size:12px;opacity:.85}"+
      "\n.tile-value{font-size:18px;font-weight:800}"+
      "\n.tile-sub{font-size:12px;opacity:.8;margin-top:-2px}"+

      "\n.source-cards{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}"+
      "\n@media (min-width:960px){.source-cards{grid-template-columns:repeat(4,minmax(0,1fr))}}"+
      "\n.source-card{background:#0b1220;border:1px solid #1f2937;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:4px;min-height:96px}"+
      "\n.source-card-title{font-size:14px;font-weight:700;margin-bottom:2px}"+
      "\n.src-line{font-size:13px;opacity:.9}"+
      "\n.src-base{color:#e5e7eb}"+
      "\n.src-core{color:#93c5fd}"+
      "\n.src-book{color:#34d399}"+
      "\n.src-skill{color:#a5b4fc}"+
      "\n.src-skillpct{color:#c4b5fd}"+
      "\n.src-pot{color:#fbbf24}"+
      "\n.src-potpct{color:#f59e0b}"+
      "\n.src-other{color:#9ca3af}"+

      "\n.source-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:4px}"+
      "\n.source-table th,.source-table td{padding:3px 4px;border-bottom:1px dashed #1f2937;text-align:right}"+
      "\n.source-table th:first-child,.source-table td:first-child{text-align:left}"+
      "\n.source-table tr:last-child td{border-bottom:0}"+
      "\n.source-table td.header-row{color:#e5e7eb;font-weight:700;border-bottom:1px solid #1f2937;background:#020617}"+

      // 來源顏色
      "\n.src-base b{color:#e5e7eb}"+
      "\n.src-core b{color:#93c5fd}"+
      "\n.src-book b{color:#34d399}"+
      "\n.src-skill b{color:#c4b5fd}"+
      "\n.src-skillpct b{color:#c4b5fd}"+
      "\n.src-other b{color:#94a3b8}"+
      "\n.src-pot b{color:#fbbf24}"+
      "\n.src-potpct b{color:#fbbf24}"+

      "\n.stat-tier-1{color:#e5e7eb}"+
      "\n.stat-tier-2{color:#a5b4fc}"+
      "\n.stat-tier-3{color:#facc15}";

    document.head.appendChild(s);
  }

  function createStatModal() {
    ensureStyle();
    if (document.getElementById("statModal")) return;

    var modal = document.createElement("div");
    modal.id = "statModal";

    var content = document.createElement("div");
    content.id = "statModalContent";

    var close = document.createElement("button");
    close.className = "close-btn";
    close.textContent = "✖";
    close.onclick = function(){ modal.style.display = "none"; };

    modal.appendChild(content);
    modal.appendChild(close);
    document.body.appendChild(modal);
  }

  function openStatModal() {
    var p = w.player;
    if (!p) return;

    var total      = p.totalStats || {};
    var baseStats  = p.baseStats  || {};
    var coreBonus  = p.coreBonus  || {};
    var potAgg     = p.PotentialBonus || {};
    var skillBonus = p.skillBonus || {};

    // 圖鑑（coreBonus.bonusData.collectionBook）平坦貢獻（用於拆解顯示）
    var bookAtk = getCoreSourceFlat(coreBonus, "collectionBook", "atk");
    var bookDef = getCoreSourceFlat(coreBonus, "collectionBook", "def");
    var bookHp  = getCoreSourceFlat(coreBonus, "collectionBook", "hp");
    var bookMp  = getCoreSourceFlat(coreBonus, "collectionBook", "mp");

    // 潛能%（整數百分比）— 只做顯示，不參與公式（公式以 potAgg 平坦結果為準）
    var potAtkPct = getPotentialPctByStat(p, "atk");
    var potDefPct = getPotentialPctByStat(p, "def");
    var potHpPct  = getPotentialPctByStat(p, "hp");
    var potMpPct  = getPotentialPctByStat(p, "mp");

    // 四維潛能%（自身% + 全屬%）— 僅顯示
    var potStrPct = getPotentialPctByStat(p, "str");
    var potAgiPct = getPotentialPctByStat(p, "agi");
    var potIntPct = getPotentialPctByStat(p, "int");
    var potLukPct = getPotentialPctByStat(p, "luk");

    var content = document.getElementById("statModalContent");
    if (!content) return;

    // ---- 四大能力拆解：基礎 / 裝備核心 / 潛能 / 技能(flat/%) + 其他(誤差) ----
    var atkBreak = breakFlatPlusPercent(
      total.atk,
      baseStats.atk,
      coreBonus.atk,
      potAgg.atk,
      getSkillFlat(skillBonus, "atk"),
      getSkillPct(skillBonus, "atk")
    );
    atkBreak.coreBook = bookAtk;
    atkBreak.coreOther = n(atkBreak.core) - n(bookAtk);
    atkBreak.potPct = potAtkPct;
    var defBreak = breakFlatPlusPercent(
      total.def,
      baseStats.def,
      coreBonus.def,
      potAgg.def,
      getSkillFlat(skillBonus, "def"),
      getSkillPct(skillBonus, "def")
    );
    defBreak.coreBook = bookDef;
    defBreak.coreOther = n(defBreak.core) - n(bookDef);
    defBreak.potPct = potDefPct;
    var hpBreak = breakFlatPlusPercent(
      total.hp,
      baseStats.hp,
      coreBonus.hp,
      potAgg.hp,
      getSkillFlat(skillBonus, "hp"),
      getSkillPct(skillBonus, "hp")
    );
    hpBreak.coreBook = bookHp;
    hpBreak.coreOther = n(hpBreak.core) - n(bookHp);
    hpBreak.potPct = potHpPct;
    var mpBreak = breakFlatPlusPercent(
      total.mp,
      baseStats.mp,
      coreBonus.mp,
      potAgg.mp,
      getSkillFlat(skillBonus, "mp"),
      getSkillPct(skillBonus, "mp")
    );
    mpBreak.coreBook = bookMp;
    mpBreak.coreOther = n(mpBreak.core) - n(bookMp);
    mpBreak.potPct = potMpPct;

    // 四維總值：優先用 totalStats（避免漏算），沒有才 fallback
    var totalStr = (total.str != null) ? n(total.str) : (n(baseStats.str) + n(coreBonus.str) + n(potAgg.str));
    var totalAgi = (total.agi != null) ? n(total.agi) : (n(baseStats.agi) + n(coreBonus.agi) + n(potAgg.agi));
    var totalInt = (total.int != null) ? n(total.int) : (n(baseStats.int) + n(coreBonus.int) + n(potAgg.int));
    var totalLuk = (total.luk != null) ? n(total.luk) : (n(baseStats.luk) + n(coreBonus.luk) + n(potAgg.luk));

    // Ignore DEF 統整
    var ignoreTotal = n(total.ignoreDefPct);
    var igMerged = buildIgnoreDefBreakdown(ignoreTotal);
    var igRows = (igMerged.sources && igMerged.sources.length)
      ? igMerged.sources.map(function(s){
          return '<tr><td>'+String(s.label || "來源")+'</td><td>'+pct(s.p, 2)+'</td></tr>';
        }).join("")
      : '<tr><td class="muted">（目前沒有穿透來源）</td><td></td></tr>';
    var igFormula = (igMerged.sources && igMerged.sources.length)
      ? '1 - 連乘(1 - p) = 1 - ' + igMerged.product.toFixed(6) +
        ' = <b>' + pct(igMerged.combined, 2) + '</b>'
      : '<span class="muted">沒有可顯示的穿透來源</span>';

    // 傷害類
    var totalSkillDmg  = n(total.skillDamage);
    var totalSpellDmg  = n(total.spellDamage);
    var totalAllDmg    = n(total.totalDamage);
    var totalNormalDmg = n(total.normalDamage);
    var totalEliteDmg  = n(total.eliteDamage);
    var totalBossDmg   = n(total.bossDamage);

    // 加成類（機率 & 獎勵）
    var critRate       = n(total.critRate);
    var critMul        = n(total.critMultiplier);
    var atkSpeed       = n(total.attackSpeedPct);
    var dodge          = n(total.dodgePercent);
    var recover        = n(total.recoverPercent);
    var doubleHit      = n(total.doubleHitChance);
    var comboRate      = n(total.comboRate);
    var damageReduce   = n(total.damageReduce);
    var magicShieldPct = n(total.magicShieldPercent);
    var expBonus       = n(total.expBonus);
    var dropBonus      = n(total.dropBonus);
    var goldBonus      = n(total.goldBonus);
    var preemptive     = n(total.preemptiveChance);
    var preemptiveMax  = n(total.preemptivePerAttackMax);

    // ---- 組裝 HTML ----
    var html = "";

    // 0. 標題區
    html += '<div class="section">';
    html += '  <div class="section-title">';
    html += '    <span class="chip chip-blue">角色狀態</span>';
    html += '    <span class="muted">'+(p.nickname || "無名冒險者")+' · '+(p.job || "未轉職")+' · Lv.'+fmt(p.level || 1)+'</span>';
    html += '  </div>';
    html += '</div>';

    // 1. 四大能力總覽
    html += '<div class="section">';
    html += '  <div class="section-title"><span class="chip chip-green">能力總覽</span></div>';
    html += '  <div class="grid-tiles">';
    html += '    <div class="tile">'
          + '      <div class="tile-label">攻擊力</div>'
          + '      <div class="tile-value">'+fmt(total.atk)+'</div>'
          + '      <div class="tile-sub muted">潛能(%)：'+pctInt(potAtkPct)+'</div>'
          + '    </div>';
    html += '    <div class="tile">'
          + '      <div class="tile-label">防禦力</div>'
          + '      <div class="tile-value">'+fmt(total.def)+'</div>'
          + '      <div class="tile-sub muted">潛能(%)：'+pctInt(potDefPct)+'</div>'
          + '    </div>';
    html += '    <div class="tile">'
          + '      <div class="tile-label">HP</div>'
          + '      <div class="tile-value">'+fmt(total.hp)+'</div>'
          + '      <div class="tile-sub muted">潛能(%)：'+pctInt(potHpPct)+'</div>'
          + '    </div>';
    html += '    <div class="tile">'
          + '      <div class="tile-label">MP</div>'
          + '      <div class="tile-value">'+fmt(total.mp)+'</div>'
          + '      <div class="tile-sub muted">潛能(%)：'+pctInt(potMpPct)+'</div>'
          + '    </div>';
    html += '  </div>';
    html += '</div>';

    // 2. 四維（力敏智幸）
    var strTierClass = getStatTierClass(totalStr);
    var agiTierClass = getStatTierClass(totalAgi);
    var intTierClass = getStatTierClass(totalInt);
    var lukTierClass = getStatTierClass(totalLuk);

    html += '<div class="section">';
    html += '  <div class="section-title"><span class="chip chip-teal">基礎屬性</span><span class="muted">（力量 / 敏捷 / 智力 / 幸運）</span></div>';
    html += '  <div class="grid-4">';
    html += '    <div class="tile">'
          + '      <div class="tile-label">💪 力量 STR</div>'
          + '      <div class="tile-value '+strTierClass+'">'+fmt(totalStr)+'</div>'
          + '      <div class="tile-sub muted">潛能(%)：'+pctInt(potStrPct)+'</div>'
          + '    </div>';
    html += '    <div class="tile">'
          + '      <div class="tile-label">⚡ 敏捷 AGI</div>'
          + '      <div class="tile-value '+agiTierClass+'">'+fmt(totalAgi)+'</div>'
          + '      <div class="tile-sub muted">潛能(%)：'+pctInt(potAgiPct)+'</div>'
          + '    </div>';
    html += '    <div class="tile">'
          + '      <div class="tile-label">🧠 智力 INT</div>'
          + '      <div class="tile-value '+intTierClass+'">'+fmt(totalInt)+'</div>'
          + '      <div class="tile-sub muted">潛能(%)：'+pctInt(potIntPct)+'</div>'
          + '    </div>';
    html += '    <div class="tile">'
          + '      <div class="tile-label">🍀 幸運 LUK</div>'
          + '      <div class="tile-value '+lukTierClass+'">'+fmt(totalLuk)+'</div>'
          + '      <div class="tile-sub muted">潛能(%)：'+pctInt(potLukPct)+'</div>'
          + '    </div>';
    html += '  </div>';
    html += '</div>';

    // 3. 來源明細（四大能力）
    function renderSourceCard(label, b){
      var out = '';
      out += '<div class="source-card">';
      out += '  <div class="source-card-title">'+label+'</div>';
      out += '  <div class="src-line src-base">基礎：<b>'+fmt(b.base)+'</b></div>';
      // 核心拆解：圖鑑單列顯示，其餘歸類為「其他核心」
      if (n(b.coreBook) !== 0){
        out += '  <div class="src-line src-book">圖鑑：<b>'+fmt(b.coreBook)+'</b></div>';
        out += '  <div class="src-line src-core">其他核心：<b>'+fmt(b.coreOther)+'</b></div>';
      } else {
        out += '  <div class="src-line src-core">裝備/核心：<b>'+fmt(b.core)+'</b></div>';
      }

      // 技能先顯示，潛能放最下面（依需求）
      if (n(b.skillFlat) !== 0) out += '  <div class="src-line src-skill">技能：<b>'+fmt(b.skillFlat)+'</b></div>';
      if (n(b.skillPct)  !== 0) out += '  <div class="src-line src-skillpct">技能(%)：<b>'+pct(b.skillPct,2)+'</b></div>';
      if (abs(b.other) > 0.0001) out += '  <div class="src-line src-other muted">其他：<b>'+fmt(b.other)+'</b></div>';

      // 潛能（平坦 / %）
      out += '  <div class="src-line src-pot">潛能：<b>'+fmt(b.pot)+'</b></div>';
      // 潛能(%)：顯示原始百分比（10=10%），方便核對
      if (n(b.potPct) !== 0) out += '  <div class="src-line src-potpct">潛能(%)：<b>'+pctInt(b.potPct)+'</b></div>';
      out += '</div>';
      return out;
    }

    html += '<div class="section">';
    html += '  <div class="section-title"><span class="chip chip-green">來源明細</span><span class="muted">（四大能力）</span></div>';
    html += '  <div class="source-cards">';
    html +=      renderSourceCard("攻擊力", atkBreak);
    html +=      renderSourceCard("防禦力", defBreak);
    html +=      renderSourceCard("HP",     hpBreak);
    html +=      renderSourceCard("MP",     mpBreak);
    html += '  </div>';
    html += '  <div class="muted mono" style="margin-top:6px;">顯示為「基礎 / 裝備核心 / 技能(flat/%) / 其他(誤差) / 潛能(平坦/%）」；潛能固定放在最下方方便核對。</div>';
    html += '</div>';

    // 4. 防禦穿透
    html += '<div class="section">';
    html += '  <div class="section-title"><span class="chip chip-purple">防禦穿透</span></div>';
    html += '  <div class="card">';
    html += '    <div class="grid-2">';
    html += '      <div class="tile"><div class="tile-label">目前穿透</div><div class="tile-value">'+pct(igMerged.combined,2)+'</div></div>';
    html += '      <div class="tile"><div class="tile-label">來源數量</div><div class="tile-value">'+((igMerged.sources || []).length)+'</div></div>';
    html += '    </div>';
    html += '    <div class="sep"></div>';
    html += '    <table class="source-table">';
    html += '      <tr><td class="header-row">來源</td><td class="header-row">百分比</td></tr>';
    html +=        igRows;
    html += '    </table>';
    html += '    <div class="sep"></div>';
    html += '    <div class="mono muted">合成：'+igFormula+'</div>';
    html += '  </div>';
    html += '</div>';

    // 5. 傷害類
    html += '<div class="section">';
    html += '  <div class="section-title"><span class="chip chip-amber">傷害類加成</span></div>';
    html += '  <div class="grid-3">';
    html += '    <div class="tile"><div class="tile-label">技能傷害</div><div class="tile-value">'+pct(totalSkillDmg,1)+'</div></div>';
    html += '    <div class="tile"><div class="tile-label">法術傷害</div><div class="tile-value">'+pct(totalSpellDmg,1)+'</div></div>';
    html += '    <div class="tile"><div class="tile-label">總傷害</div><div class="tile-value">'+pct(totalAllDmg,1)+'</div></div>';
    html += '  </div>';
    html += '  <div class="grid-3" style="margin-top:8px;">';
    html += '    <div class="tile"><div class="tile-label">對一般怪物傷害</div><div class="tile-value">'+pct(totalNormalDmg,2)+'</div></div>';
    html += '    <div class="tile"><div class="tile-label">對菁英怪物傷害</div><div class="tile-value">'+pct(totalEliteDmg,2)+'</div></div>';
    html += '    <div class="tile"><div class="tile-label">對 Boss 傷害</div><div class="tile-value">'+pct(totalBossDmg,2)+'</div></div>';
    html += '  </div>';
    html += '</div>';

    // 6. 加成類（機率、減傷、獎勵）
    html += '<div class="section">';
    html += '  <div class="section-title"><span class="chip chip-teal">各種加成</span></div>';

    html += '  <div class="grid-3">';
    html += '    <div class="tile"><div class="tile-label">爆擊率</div><div class="tile-value">'+pct(critRate,2)+'</div></div>';
    html += '    <div class="tile"><div class="tile-label">爆擊傷害</div><div class="tile-value">'+pct(critMul,2)+'</div></div>';
    html += '    <div class="tile"><div class="tile-label">攻擊速度</div><div class="tile-value">'+pct(atkSpeed,2)+'</div></div>';
    html += '  </div>';

    html += '  <div class="grid-3" style="margin-top:8px;">';
    html += '    <div class="tile"><div class="tile-label">雙擊機率</div><div class="tile-value">'+pct(doubleHit,2)+'</div></div>';
    html += '    <div class="tile"><div class="tile-label">連擊機率</div><div class="tile-value">'+pct(comboRate,2)+'</div></div>';
    html += '    <div class="tile"><div class="tile-label">閃避機率</div><div class="tile-value">'+pct(dodge,2)+'</div></div>';
    html += '  </div>';

    html += '  <div class="grid-3" style="margin-top:8px;">';
    html += '    <div class="tile"><div class="tile-label">回復效果</div><div class="tile-value">'+pct(recover,2)+'</div></div>';
    html += '    <div class="tile"><div class="tile-label">傷害減免</div><div class="tile-value">'+pct(damageReduce,2)+'</div></div>';
    html += '    <div class="tile"><div class="tile-label">魔力護盾</div><div class="tile-value">'+pct(magicShieldPct,2)+'</div></div>';
    html += '  </div>';

    html += '  <div class="grid-3" style="margin-top:8px;">';
    html += '    <div class="tile"><div class="tile-label">經驗值獲得</div><div class="tile-value">'+pct(expBonus,2)+'</div></div>';
    html += '    <div class="tile"><div class="tile-label">掉落率</div><div class="tile-value">'+pct(dropBonus,2)+'</div></div>';
    html += '    <div class="tile"><div class="tile-label">金幣獲得</div><div class="tile-value">'+pct(goldBonus,2)+'</div></div>';
    html += '  </div>';

    if (preemptive > 0 || preemptiveMax > 0){
      html += '  <div class="grid-2" style="margin-top:8px;">';
      html += '    <div class="tile"><div class="tile-label">先手再動機率</div><div class="tile-value">'+pct(preemptive,2)+'</div></div>';
      html += '    <div class="tile"><div class="tile-label">每次攻擊再動上限</div><div class="tile-value">'+fmt(preemptiveMax)+'</div></div>';
      html += '  </div>';
    }

    html += '</div>';

    content.innerHTML = html;
    document.getElementById("statModal").style.display = "flex";
  }

  // 導出 API
  w.createStatModal = createStatModal;
  w.openStatModal = openStatModal;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function(){
      if (w.player) createStatModal();
    });
  } else {
    if (w.player) createStatModal();
  }

})(window);