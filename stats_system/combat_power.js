// ==========================
// combat_power.js — 戰鬥力（CP）+ 段位（F- → SSS+）整合
// 依賴：window.player, player.totalStats
// 可選依賴：window.getBaseJob, window.getMagicShieldPercent
// 已整合：
//   - totalDamage（總傷）
//   - ignoreDefPct（穿防）
//   - normalDamage / eliteDamage / bossDamage（對象傷害加權）  🔴 新增說明
// ==========================
(function(){
  if (typeof window === "undefined") return;

  // ---------- 小工具 ----------
  function nz(x, d){ return (typeof x === "number" && !isNaN(x)) ? x : (d || 0); }
  function clamp(x, a, b){ return x < a ? a : (x > b ? b : x); }
  function fmt(n){ return (Number(n)||0).toLocaleString(); }

  function getBaseJobSafeLocal(job){
    const j = String(job || "").toLowerCase();
    if (typeof window.getBaseJob === "function") return window.getBaseJob(j);
    return j.replace(/\d+$/, "");
  }

  // ==========================
  // 可調參數（平衡旋鈕）
  // ==========================

  // —— 輸出向：基準怪物防禦（估算用，讓CP更貼近實戰）
  const DEF_BENCH_BASE    = 20;   // 起始基準 DEF
  const DEF_BENCH_PER_LVL = 1.5;  // 每級增加多少 DEF

  // —— EHP 估算參數
  const DEF_TO_HP           = 4;     // DEF 換算等效 HP 的係數
  const ASPD_MIN            = 0.60;
  const ASPD_MAX            = 3.00;
  const DODGE_CAP           = 0.50;  // 關於 [0,50%] 的閃避
  const DODGE_MIN_REMAIN    = 0.25;  // 1-閃避 的最小剩餘承傷
  const MS_MAX              = 0.70;  // 魔力護盾最大 70%
  const MS_MIN_REMAIN       = 0.30;  // 1-魔盾 的最小剩餘承傷
  const SUSTAIN_MAX_BONUS   = 0.35;  // 回復/吸血最多 +35% EHP 增益

  // —— CP 權重（輸出：生存＝6：4）
  const JOB_WEIGHTS = {
    warrior:{ wDps:0.60, wEhp:0.40, dpsAdj:1.00, ehpAdj:1.00, mpToCp:0.00 },
    mage:   { wDps:0.60, wEhp:0.40, dpsAdj:1.00, ehpAdj:1.00, mpToCp:0.010 },
    archer: { wDps:0.60, wEhp:0.40, dpsAdj:1.00, ehpAdj:1.00, mpToCp:0.00 },
    thief:  { wDps:0.60, wEhp:0.40, dpsAdj:1.00, ehpAdj:1.00, mpToCp:0.00 },
    "":     { wDps:0.60, wEhp:0.40, dpsAdj:1.00, ehpAdj:1.00, mpToCp:0.00 }
  };

  // —— 只中和「生存向」，不動輸出向（抵銷各職 HP/DEF/MP 先天差）
  const JOB_EHP_NORMALIZER = {
    warrior: 1.00,
    mage:    1.00,
    archer:  1.00,
    thief:   1.00,
    "":      1.00
  };

  // 🔴 對象傷害加權（Boss > 一般 > 菁英）
  // normalDamage / eliteDamage / bossDamage 是「+%」，例如 0.10 = +10%
  // 這裡變成一個額外 DPS 乘區：1 + (n*wN + e*wE + b*wB)，並且封頂避免爆炸。
  const TYPE_DAMAGE_WEIGHTS = {
    normal: 0.23,   // 一般怪中間
    elite:  0.15,   // 菁英最低
    boss:   0.37    // Boss 最高
  };
  const TYPE_DAMAGE_MAX_EXTRA = 2.0; // 額外乘區上限：+200%（= typeMul 最大 3 倍）

  // ==========================
  // CP 計算（DPS/EHP）
  // ==========================

  // 期望爆擊倍率：1 + (爆率 * 爆傷)
  function expectedCritMultiplier(r, m){
    r = clamp(nz(r, 0), 0, 1);
    m = Math.max(0, nz(m, 0));
    return 1 + r * m;
  }

  // 輸出向（DPS-like）：
  // 每擊基礎 = max( floor( ATK × (1+總傷) × (1+技能+法術) ) − 有效怪防, 1 )
  // 有效怪防 = 基準DEF × (1 − 穿防)
  // 期望輸出 = 每擊基礎 × 爆擊期望 × 攻速 × 多段（雙擊/連擊）× 對象傷害乘區  🔴
  function computeDPSLike(total, playerRef){
    const atk         = Math.max(0, nz(total.atk, 0));
    const tdMul       = 1 + Math.max(0, nz(total.totalDamage, 0));
    const skillSpell  = 1 + Math.max(0, nz(total.skillDamage,0)) + Math.max(0, nz(total.spellDamage,0));
    const critMul     = expectedCritMultiplier(nz(total.critRate,0), nz(total.critMultiplier,0));

    const atkSpd = clamp(nz(total.attackSpeedPct, 1), ASPD_MIN, ASPD_MAX);

    let multiHit = 1 + clamp(nz(total.doubleHitChance,0), 0, 1) + clamp(nz(total.comboRate,0), 0, 1);
    multiHit = clamp(multiHit, 1, 2); // 上限+100%

    // 🔴 對象傷害：normal / elite / boss 轉成一個額外乘區
    const nD = Math.max(0, nz(total.normalDamage, 0)); // ex: 0.10 = +10%
    const eD = Math.max(0, nz(total.eliteDamage, 0));
    const bD = Math.max(0, nz(total.bossDamage, 0));

    const typeScore =
      nD * TYPE_DAMAGE_WEIGHTS.normal +
      eD * TYPE_DAMAGE_WEIGHTS.elite  +
      bD * TYPE_DAMAGE_WEIGHTS.boss;

    // 額外乘區：1 + typeScore，並封頂
    const typeMul = 1 + clamp(typeScore, 0, TYPE_DAMAGE_MAX_EXTRA);

    const lvl      = Math.max(1, nz(playerRef.level, 1));
    const defBench = Math.max(0, Math.round(DEF_BENCH_BASE + DEF_BENCH_PER_LVL * lvl));

    const pen   = clamp(nz(total.ignoreDefPct, 0), 0, 0.9999); // 已在 player.js 封頂 0.9999
    const effDef = Math.floor(defBench * (1 - pen));

    const basePerHit = Math.max(Math.floor(atk * tdMul * skillSpell) - effDef, 1);

    // 🔴 對象傷害在這裡一併進去
    const dps = basePerHit * critMul * atkSpd * multiHit * typeMul;
    return dps;
  }

  // 生存向（EHP-like）：
  // (HP + DEF×係數 + 盾) × (1+減傷) ÷ (1-有效閃避) ÷ (1-魔盾) × 續戰放大
  function computeEHPLike(total, playerRef){
    const hp      = Math.max(1, nz(total.hp, 1));
    const def     = Math.max(0, nz(total.def, 0));
    const shield  = Math.max(0, nz(total.shield, 0));
    const dr      = clamp(nz(total.damageReduce, 0), 0, 0.70);
    const dodge   = clamp(nz(total.dodgePercent, 0), 0, DODGE_CAP);
    let ms      = 0;
    if (typeof window.getMagicShieldPercent === "function") {
      ms = clamp(nz(window.getMagicShieldPercent(), 0), 0, MS_MAX);
    }

    const recover    = Math.max(0, nz(total.recoverPercent, 0));
    const lifesteal  = Math.max(0, nz(playerRef.lifestealPercent, 0));
    const sustainAmp = 1 + Math.min(SUSTAIN_MAX_BONUS, recover*1.5 + lifesteal*1.0);

    let dmgTakenMul = 1 - dr;
    dmgTakenMul = clamp(dmgTakenMul, 0.1, 1);

    const dodgeRemain = Math.max(DODGE_MIN_REMAIN, (1 - dodge));
    const msRemain    = Math.max(MS_MIN_REMAIN,   (1 - ms));

    let ehpRaw = (hp + DEF_TO_HP * def + shield) * (1 + dr);
    ehpRaw = ehpRaw / dodgeRemain / msRemain * sustainAmp;

    const baseJob = getBaseJobSafeLocal(playerRef && playerRef.job);
    const ehpAdj  = JOB_EHP_NORMALIZER.hasOwnProperty(baseJob) ? JOB_EHP_NORMALIZER[baseJob] : JOB_EHP_NORMALIZER[""];
    const ehp     = ehpRaw * nz(ehpAdj, 1);

    return ehp;
  }

  // 綜合戰鬥力 CP（6:4）
  function computeCombatPower(playerRef){
    try {
      const total   = playerRef.totalStats || {};
      const baseJob = getBaseJobSafeLocal(playerRef.job);
      const jw      = JOB_WEIGHTS[baseJob] || JOB_WEIGHTS[""];

      const dps = computeDPSLike(total, playerRef);
      const ehp = computeEHPLike(total, playerRef);

      const mp    = Math.max(0, nz(total.mp, 0));
      const extra = mp * nz(jw.mpToCp, 0);

      const cp = jw.wDps * dps * nz(jw.dpsAdj,1) + jw.wEhp * ehp * nz(jw.ehpAdj,1) + extra;
      return Math.round(Math.max(0, cp));
    } catch (e){
      console.error("[CP] compute error:", e);
      return 0;
    }
  }

  // 明細（除錯 / UI）
  function getCombatPowerSummary(){
    const p = window.player || {};
    const t = (p.totalStats || {});
    const dps = computeDPSLike(t, p);
    const ehp = computeEHPLike(t, p);
    const cp  = computeCombatPower(p);
    const baseJob = getBaseJobSafeLocal(p.job);

    const lvl      = Math.max(1, nz(p.level, 1));
    const defBench = Math.max(0, Math.round(DEF_BENCH_BASE + DEF_BENCH_PER_LVL * lvl));
    const pen      = clamp(nz(t.ignoreDefPct, 0), 0, 0.9999);
    const effDef   = Math.floor(defBench * (1 - pen));
    const tdMul    = 1 + Math.max(0, nz(t.totalDamage, 0));
    const skillSpell = 1 + Math.max(0, nz(t.skillDamage,0)) + Math.max(0, nz(t.spellDamage,0));
    const basePerHit = Math.max(Math.floor(nz(t.atk,0) * tdMul * skillSpell) - effDef, 1);

    return {
      cp,
      dpsLike: dps,
      ehpLike: ehp,
      job: baseJob,
      defBenchmarkUsed: defBench,
      effectiveDefUsed: effDef,
      basePerHitNoCrit: basePerHit,
      parts: {
        atk: nz(t.atk,0),
        def: nz(t.def,0),
        hp: nz(t.hp,0),
        mp: nz(t.mp,0),
        shield: nz(t.shield,0),
        attackSpeedPct: nz(t.attackSpeedPct,1),
        critRate: clamp(nz(t.critRate,0),0,1),
        critMultiplier: Math.max(0, nz(t.critMultiplier,0)),
        skillDamage: Math.max(0, nz(t.skillDamage,0)),
        spellDamage: Math.max(0, nz(t.spellDamage,0)),
        totalDamage: Math.max(0, nz(t.totalDamage,0)),
        ignoreDefPct: clamp(nz(t.ignoreDefPct,0), 0, 0.9999),
        doubleHitChance: clamp(nz(t.doubleHitChance,0),0,1),
        comboRate: clamp(nz(t.comboRate,0),0,1),
        damageReduce: clamp(nz(t.damageReduce,0),0,0.70),
        dodgePercent: clamp(nz(t.dodgePercent,0),0, DODGE_CAP),
        recoverPercent: Math.max(0, nz(t.recoverPercent,0)),
        lifestealPercent: Math.max(0, nz(p.lifestealPercent,0)),
        magicShieldPercent: (typeof window.getMagicShieldPercent==="function") ? clamp(nz(window.getMagicShieldPercent(),0),0,MS_MAX) : 0,

        // 🔴 新增：對象傷害明細（方便你除錯）
        normalDamage: Math.max(0, nz(t.normalDamage,0)),
        eliteDamage:  Math.max(0, nz(t.eliteDamage,0)),
        bossDamage:   Math.max(0, nz(t.bossDamage,0))
      }
    };
  }

  // 導出（供外部呼叫）
  window.computeCombatPower = function(){ return computeCombatPower(window.player); };
  window.getCombatPowerSummary = getCombatPowerSummary;

  // ==========================
  // 段位系統（F- → SSS+）從 F- 起算，高階加速放大
  // ==========================

  const RANKS = [
    "F-", "F", "F+",
    "E-", "E", "E+",
    "D-", "D", "D+",
    "C-", "C", "C+",
    "B-", "B", "B+",
    "A-", "A", "A+",
    "S-", "S", "S+",
    "SS-", "SS", "SS+",
    "SSS-", "SSS", "SSS+"
  ];

  const RANK_COLOR = {
    "F":   "#ef4444", // red
    "E":   "#f97316", // orange
    "D":   "#f59e0b", // amber
    "C":   "#84cc16", // lime
    "B":   "#14b8a6", // teal
    "A":   "#3b82f6", // blue
    "S":   "#8b5cf6", // violet
    "SS":  "#a855f7", // purple
    "SSS": "#eab308"  // gold
  };
  function colorForRankLabel(label){
    const key = label.replace(/[+\-]/g, "");
    return RANK_COLOR[key] || "#9ca3af";
  }

  // 從 F- 起算
  const START_LABEL = "F-";
  const START_CP    = 800;  // 你可調：新手起始 CP

  // 主群步進（半級倍率）：越高越陡，SSS+ 會到數百萬
  function stepFor(label){
    const base = label.replace(/[+\-]/g, "");
    if (base === "SSS") return 17.00;
    if (base === "SS")  return 12.86;
    if (base === "S")   return 8.48;
    if (base === "A")   return 6.36;
    if (base === "B")   return 5.95;
    if (base === "C")   return 4.58;
    if (base === "D")   return 3.27;
    if (base === "E")   return 2.20;
    return 1.62; // F
  }

  // 建門檻：從 F- 開始一路往上乘
  const _thresholds = (function buildThresholdsFromF(){
    const th = [];
    let startIdx = RANKS.indexOf(START_LABEL);
    if (startIdx < 0) startIdx = 0;
    let cp = Math.max(1, Math.round(START_CP));
    th[startIdx] = cp;

    // 往上
    for (let i = startIdx + 1; i < RANKS.length; i++){
      const s = stepFor(RANKS[i]);
      cp = Math.max(1, Math.round(cp * s));
      th[i] = cp;
    }

    // 往下（通常不會觸發，保險）
    for (let j = startIdx - 1; j >= 0; j--){
      const sDown = stepFor(RANKS[j+1]);
      cp = Math.max(1, Math.round(cp / sDown));
      th[j] = cp;
    }

    // 遞增保底
    for (let k = 1; k < th.length; k++){
      if (th[k] <= th[k-1]) th[k] = th[k-1] + 1;
    }
    return th;
  })();

  function getRankByCP(cp){
    cp = Math.max(0, Math.floor(Number(cp) || 0));
    let i, rankIdx = 0;
    for (i = 0; i < RANKS.length; i++){
      if (cp >= _thresholds[i]) rankIdx = i;
      else break;
    }

    const label = RANKS[rankIdx];
    const lower = _thresholds[rankIdx] || 1;
    let next  = _thresholds[Math.min(rankIdx+1, _thresholds.length-1)] || lower;
    if (next <= lower) next = lower + 1;

    const progress = Math.max(0, Math.min(1, (cp - lower) / (next - lower)));
    const color = colorForRankLabel(label);

    return {
      label,
      index: rankIdx,
      lower,
      next,
      progress01: progress,
      color,
      thresholds: _thresholds.slice(),
      config: { start: START_LABEL, startCP: START_CP }
    };
  }

  // 導出段位 API
  window.getRankByCP = getRankByCP;


  // ==========================
  // 玩家即時面板（插在「怪物資訊」上方）
  // 只顯示：HP / MP / 護盾 + 傷害預估區間（不顯示計算細節）
  // ==========================
    function ensurePlayerHudStyle(){
    if (document.getElementById("playerHudPanelStyle")) return;
    const s = document.createElement("style");
    s.id = "playerHudPanelStyle";
    s.textContent = "\
      #playerHudPanel{\
        margin: 10px 0 12px;\
        background:#0b1220;\
        color:#e5e7eb;\
        border:1px solid #1f2937;\
        border-radius:12px;\
        padding:10px 12px;\
        box-shadow:0 8px 24px rgba(0,0,0,.20);\
        font:13px/1.35 system-ui,Segoe UI,Roboto,Arial,sans-serif;\
      }\
      #playerHudPanel .ph-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;}\
      #playerHudPanel .ph-title .t{font-weight:800;letter-spacing:.2px;opacity:.95}\
      #playerHudPanel .ph-grid{display:grid;grid-template-columns:1.2fr 0.8fr;gap:10px;align-items:stretch;}\
      #playerHudPanel .ph-left{display:flex;flex-direction:column;gap:8px;}\
      #playerHudPanel .ph-line{display:flex;align-items:center;justify-content:space-between;gap:10px;}\
      #playerHudPanel .ph-k{opacity:.85;white-space:nowrap}\
      #playerHudPanel .ph-v{font-weight:800}\
      #playerHudPanel .ph-bar{height:7px;border-radius:999px;background:#111827;border:1px solid #1f2937;overflow:hidden;margin-top:4px;}\
      #playerHudPanel .ph-fill{height:100%;width:0%;background:#334155;transition:width .18s ease;}\
      #playerHudPanel .ph-fill.hp{background:#22c55e;}\
      #playerHudPanel .ph-fill.mp{background:#3b82f6;}\
      #playerHudPanel .ph-fill.sh{background:#a855f7;}\
      #playerHudPanel .ph-right{display:flex;flex-direction:column;gap:8px;justify-content:center;}\
      #playerHudPanel .ph-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}\
      #playerHudPanel .ph-dmg{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1;}\
      #playerHudPanel .ph-dmg .d1{font-weight:900;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\
      #playerHudPanel .ph-dmg .d2{font-size:12px;opacity:.75;}\
      #playerHudPanel .ph-cp{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:0 0 auto;}\
      #playerHudPanel .ph-cp .c1{font-weight:900;font-size:14px;white-space:nowrap;}\
      #playerHudPanel .ph-cp .c2{font-size:12px;opacity:.75;white-space:nowrap;}\
      #playerHudPanel .ph-badge{display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:999px;border:1px solid #374151;background:#111827;font-weight:800;}\
      #playerHudPanel .ph-status{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;}\
      #playerHudPanel .ph-status .sb{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;border:1px solid #374151;background:#0f172a;font-size:12px;opacity:.95;}\
      #playerHudPanel .ph-status .sb .n{font-weight:800;}\
      #playerHudPanel .ph-rec{font-size:11px;opacity:.75;margin-top:2px;}\
      #playerHudPanel .ph-rec.hp{color:#86efac;}\
      #playerHudPanel .ph-rec.mp{color:#93c5fd;}\
      #playerHudPanel .ph-rec.sh{color:#d8b4fe;}\
      #playerHudPanel.ph-low-hp .ph-fill.hp{background:#ef4444;animation:phPulse .8s ease-in-out infinite;}\
      #playerHudPanel.ph-low-hp #phHp{color:#ef4444;}\
      #playerHudPanel.ph-low-hp .ph-rec.hp{color:#fecaca;}\
      #playerHudPanel.ph-low-mp .ph-fill.mp{background:#f59e0b;animation:phPulse .8s ease-in-out infinite;}\
      #playerHudPanel.ph-low-mp #phMp{color:#f59e0b;}\
      #playerHudPanel.ph-low-mp .ph-rec.mp{color:#fde68a;}\
      @keyframes phPulse {\
        0%{opacity:1;}\
        50%{opacity:.25;}\
        100%{opacity:1;}\
      }\
@media (max-width: 720px){\
        #playerHudPanel .ph-grid{grid-template-columns:1fr;}\
        #playerHudPanel .ph-cp{align-items:flex-start;}\
        #playerHudPanel .ph-row{align-items:flex-start;}\
      }\
    ";
    document.head.appendChild(s);
  }

  function ensurePlayerHudPanel(){
    if (typeof document === "undefined") return null;
    const monsterInfo = document.getElementById("monsterInfo");
    if (!monsterInfo || !monsterInfo.parentNode) return null;

    const existing = document.getElementById("playerHudPanel");
    if (existing) return existing;

    ensurePlayerHudStyle();

    const panel = document.createElement("div");
    panel.id = "playerHudPanel";
    panel.innerHTML = "\
      <div class='ph-title'>\
        <div class='t'>玩家狀態</div>\
      </div>\
      <div class='ph-grid'>\
        <div class='ph-left'>\
          <div>\
            <div class='ph-line'><span class='ph-k'>HP</span><span id='phHp' class='ph-v'>—</span></div>\
            <div class='ph-bar'><div id='phHpFill' class='ph-fill hp'></div></div>\
            <div id='phHpRec' class='ph-rec hp'>—</div>\
          </div>\
          <div>\
            <div class='ph-line'><span class='ph-k'>MP</span><span id='phMp' class='ph-v'>—</span></div>\
            <div class='ph-bar'><div id='phMpFill' class='ph-fill mp'></div></div>\
            <div id='phMpRec' class='ph-rec mp'>—</div>\
          </div>\
          <div id='phShieldWrap'>\
            <div class='ph-line'><span class='ph-k'>護盾</span><span id='phShield' class='ph-v'>—</span></div>\
            <div class='ph-bar'><div id='phShieldFill' class='ph-fill sh'></div></div>\
          </div>\
          <div id='phStatus' class='ph-status' style='display:none;'></div>\
        </div>\
        <div class='ph-right'>\
          <div class='ph-row'>\
            <div class='ph-dmg'>\
              <div class='d1' id='phDmg'>⚔️ 傷害 —</div>\
              <div class='d2' id='phDmgSub'>—</div>\
              <div class='d2' id='phDmgVs' style='display:none;'>—</div>\
            </div>\
            <div class='ph-cp'>\
              <div class='c1'><span class='ph-badge' id='phRank'>—</span></div>\
              <div class='c2' id='phCp'>CP —</div>\
            </div>\
          </div>\
        </div>\
      </div>\
    ";

    // 插在怪物資訊內容前面（同一個 section 內）
    monsterInfo.parentNode.insertBefore(panel, monsterInfo);

    return panel;
  }

  function readJitterPct(){
    try{
      if (typeof window.DAMAGE_JITTER_PCT === "number" && window.DAMAGE_JITTER_PCT >= 0) return window.DAMAGE_JITTER_PCT;
    }catch(_){}
    return 0.10;
  }

  function getCurrentMonsterType(){
    const m = window.currentMonster || null;
    if (!m) return "normal";
    if (m.isBoss) return "boss";
    if (m.isElite) return "elite";
    return "normal";
  }

  function computeDamageRange(){
    const p = window.player || {};
    const t = p.totalStats || {};
    const atk = Math.max(0, Math.floor(Number(t.atk) || 0));
    if (atk <= 0) return { atk, min: 0, max: 0, type: "normal", jitter: readJitterPct() };

    const td = Math.max(0, Number(t.totalDamage) || 0);

    // 對象加傷：依目前怪物類型套用；若沒有怪物以一般怪視角
    let type = getCurrentMonsterType();
    if (!window.currentMonster) type = "normal";

    let vs = 0;
    if (type === "boss") vs = Math.max(0, Number(t.bossDamage) || 0);
    else if (type === "elite") vs = Math.max(0, Number(t.eliteDamage) || 0);
    else vs = Math.max(0, Number(t.normalDamage) || 0);

    const mul = (1 + td) * (1 + vs);
    const base = Math.floor(atk * mul);

    const jitter = readJitterPct();
    const min = Math.floor(base * (1 - jitter));
    const max = Math.floor(base * (1 + jitter));

    return {
      atk,
      min: Math.max(1, min),
      max: Math.max(1, max),
      type,
      jitter
    };
  }

  function computeDamageRangeVsMonster(dmgRange){
    const m = window.currentMonster || null;
    if (!m || !dmgRange || dmgRange.atk <= 0) return null;

    const p = window.player || {};
    const t = p.totalStats || {};
    const pen = clamp(nz(t.ignoreDefPct, 0), 0, 1);

    const def = Math.max(0, Math.floor(Number(m.def) || 0));
    const shield = Math.max(0, Math.floor(Number(m.shield) || 0));
    let defPercent = Number(m.defPercent);
    if (!Number.isFinite(defPercent) || defPercent <= 0) defPercent = 0;

    // 百分比防禦：remaining = defPercent * (1-pen)；damageMul = 1-remaining（夾 0~1）
    let damageMul = 1;
    if (defPercent > 0){
      let remaining = defPercent * (1 - pen);
      if (remaining < 0) remaining = 0;
      damageMul = 1 - remaining;
      if (damageMul < 0) damageMul = 0;
      if (damageMul > 1) damageMul = 1;
    }

    const minAfterPct = Math.floor(dmgRange.min * damageMul);
    const maxAfterPct = Math.floor(dmgRange.max * damageMul);

    // 再扣平面 DEF
    const minWithDef = Math.max(minAfterPct - def, 1);
    const maxWithDef = Math.max(maxAfterPct - def, 1);

    return {
      min: minWithDef,
      max: maxWithDef,
      name: (typeof m.name === "string" ? m.name : "") || "",
      def,
      shield
    };
  }

    function tickPlayerHud(){
    try{
      const panel = ensurePlayerHudPanel();
      if (!panel) return;

      const p = window.player || {};
      const t = p.totalStats || {};

      // ===== HP / MP / Shield =====
      const curHp = Math.max(0, Number(p.currentHP) || 0);
      const maxHp = Math.max(1, Number(t.hp) || 1);

      const curMp = Math.max(0, Number(p.currentMP) || 0);
      const maxMp = Math.max(1, Number(t.mp) || 1);

      // 護盾：優先用 player.shield / player.maxShield；沒有就退回 totalStats.shield
      const curSh = Math.max(0, Number(p.shield) || Number(t.shield) || 0);
      const maxSh = Math.max(0, Number(p.maxShield) || 0);

      const hp01 = clamp(curHp / maxHp, 0, 1);
      const mp01 = clamp(curMp / maxMp, 0, 1);

      const hpPct = (hp01 * 100);
      const mpPct = (mp01 * 100);

      // 低血/低魔門檻（可自行調整）
      const HP_LOW_PCT = 0.25;
      const MP_LOW_PCT = 0.25;

      if (hp01 <= HP_LOW_PCT) panel.classList.add("ph-low-hp");
      else panel.classList.remove("ph-low-hp");

      if (mp01 <= MP_LOW_PCT) panel.classList.add("ph-low-mp");
      else panel.classList.remove("ph-low-mp");

      const hpEl = panel.querySelector("#phHp");
      const mpEl = panel.querySelector("#phMp");
      const shEl = panel.querySelector("#phShield");

      const hpFill = panel.querySelector("#phHpFill");
      const mpFill = panel.querySelector("#phMpFill");
      const shFill = panel.querySelector("#phShieldFill");
      const shWrap = panel.querySelector("#phShieldWrap");

      if (hpEl) hpEl.textContent = fmt(curHp) + " / " + fmt(maxHp) + " (" + hpPct.toFixed(1) + "%)";
      if (mpEl) mpEl.textContent = fmt(curMp) + " / " + fmt(maxMp) + " (" + mpPct.toFixed(1) + "%)";

      // ===== 恢復（讀取 recoverySystem；顯示「X秒 +N」）=====
      const hpRecEl = panel.querySelector("#phHpRec");
      const mpRecEl = panel.querySelector("#phMpRec");
      const rcv = window.recoverySystem || null;
      let tickSec = 10;
      try {
        if (typeof window.TICK_MS === "number" && window.TICK_MS > 0) tickSec = Math.max(1, Math.round(window.TICK_MS / 1000));
      } catch(_){}
      if (rcv && (typeof rcv.hpPerTickActual === "number" || typeof rcv.mpPerTickActual === "number")) {
        const hpGain = Math.max(0, Math.floor(Number(rcv.hpPerTickActual) || 0));
        const mpGain = Math.max(0, Math.floor(Number(rcv.mpPerTickActual) || 0));
        if (hpRecEl) hpRecEl.textContent = tickSec + "秒 +" + fmt(hpGain);
        if (mpRecEl) mpRecEl.textContent = tickSec + "秒 +" + fmt(mpGain);
      } else {
        if (hpRecEl) hpRecEl.textContent = "—";
        if (mpRecEl) mpRecEl.textContent = "—";
      }

      if (hpFill) hpFill.style.width = hpPct.toFixed(1) + "%";
      if (mpFill) mpFill.style.width = mpPct.toFixed(1) + "%";

      const showShield = (maxSh > 0) || (curSh > 0);
      if (shWrap) shWrap.style.display = showShield ? "" : "none";
      if (showShield){
        const denom = (maxSh > 0) ? maxSh : Math.max(1, curSh);
        const sh01 = clamp(curSh / denom, 0, 1);
        const shPct = sh01 * 100;

        if (shEl){
          const shText = (maxSh > 0)
            ? (fmt(curSh) + " / " + fmt(maxSh) + " (" + shPct.toFixed(1) + "%)")
            : (fmt(curSh) + " (" + shPct.toFixed(1) + "%)");
          shEl.textContent = shText;
        }
        if (shFill) shFill.style.width = shPct.toFixed(1) + "%";
      }

      // ===== 傷害區間 =====
      const dmg = computeDamageRange();
      const dmgEl = panel.querySelector("#phDmg");
      const subEl = panel.querySelector("#phDmgSub");

      if (dmgEl){
        if (dmg.atk <= 0) dmgEl.textContent = "⚔️ 傷害 —";
        else dmgEl.textContent = "⚔️ 傷害 " + fmt(dmg.min) + " ~ " + fmt(dmg.max);
      }

      if (subEl){
        if (dmg.atk <= 0) subEl.textContent = "—";
        else {
          const typeLabel = (dmg.type === "boss") ? "Boss" : (dmg.type === "elite" ? "菁英怪" : "一般怪");
          subEl.textContent = "視角：" + typeLabel + " · 浮動 ±" + (dmg.jitter*100).toFixed(1) + "%";
        }
      }


      // ===== 對該怪物預估傷害（含怪防/平面DEF；維持浮動區間）=====
      const vsEl = panel.querySelector("#phDmgVs");
      const vs = computeDamageRangeVsMonster(dmg);
      if (vsEl){
        if (vs){
          const namePart = vs.name ? "（" + vs.name + "）" : "";
          const shieldPart = (vs.shield > 0) ? (" · 護盾 " + fmt(vs.shield)) : "";
          vsEl.textContent = "對怪預估：" + fmt(vs.min) + " ~ " + fmt(vs.max) + shieldPart + " " + namePart;
          vsEl.style.display = "";
        } else {
          vsEl.textContent = "";
          vsEl.style.display = "none";
        }
      }

      // ===== CP（不再用彈窗，改放面板內）=====
      let cpVal = 0;
      try { cpVal = (typeof window.computeCombatPower === "function") ? window.computeCombatPower() : computeCombatPower(p); } catch(_){ cpVal = 0; }
      const rank = (typeof window.getRankByCP === "function") ? window.getRankByCP(cpVal) : getRankByCP(cpVal);

      const rankEl = panel.querySelector("#phRank");
      const cpEl = panel.querySelector("#phCp");
      if (rankEl){
        rankEl.textContent = rank.label;
        rankEl.style.borderColor = rank.color;
        rankEl.style.color = rank.color;
      }
      if (cpEl){
        cpEl.textContent = "CP " + fmt(cpVal);
      }

      // ===== 異常狀態（讀取 player.statusEffects）=====
      const stWrap = panel.querySelector("#phStatus");
      if (stWrap){
        const se = p.statusEffects || {};
        const emojiMap = {
          poison:  "☠️",
          burn:    "🔥",
          paralyze:"⚡",
          weaken:  "🌀",
          bleed:   "🩸",
          blind:   "🌫️",
          freeze:  "❄️",
          curse:   "🧿",
          stun:    "💫",
          slow:    "🐌",
          fear:    "😱",
          silence: "🔇",
          atkBoost:"🗡️",
          defBoost:"🛡️"
        };

        const parts = [];
        for (const k in se){
          if (!Object.prototype.hasOwnProperty.call(se, k)) continue;
          const v = se[k];
          const isOn = (typeof v === "number") ? (v > 0) : !!v;
          if (!isOn) continue;

          const icon = emojiMap[k] || "✨";
          const num = (typeof v === "number") ? String(v) : "";
          parts.push("<span class='sb'>" + icon + (num ? "<span class='n'>" + num + "</span>" : "") + "</span>");
        }

        if (parts.length){
          stWrap.innerHTML = parts.join("");
          stWrap.style.display = "";
        } else {
          stWrap.innerHTML = "";
          stWrap.style.display = "none";
        }
      }

    }catch(_){}
  }

// ==========================

// ==========================
  // 更新迴圈（每秒刷新玩家即時面板）
  // ==========================
  function startHud(){
    tickPlayerHud();
    setInterval(() =>{
      tickPlayerHud();
    }, 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startHud);
  else startHud();

})();
