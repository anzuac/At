/*!
 * PotentialCoreV21.js — 潛能 2.1（含 SLR 擴充）— 完整整理版（依你的需求）
 * UMD / ES5
 *
 * ✅ 保留原本所有功能：升階鏈 / 三條規則 / 倍率 / RNG
 * ✅ 調整重點（最小改動）：
 *   1) effectsR 改成你的詞條與固定機率
 *   2) 「剩餘機率」不寫死：自動把剩下的機率平均分給沒寫 prob 的詞條
 *   3) baseVal 不寫死：val 支援 number / array（抽到時從 array 隨機挑一個）
 *   4) 補齊 MP / DEF% 的加總（不影響其他）
 *
 * 升階鏈（一般 / 高級）：
 * R  → SR   10%   / 20%
 * SR → SSR   5%   / 10%
 * SSR→ UR    2%   /  4%
 * UR → LR   0.5%  / 1.0%
 * LR → SLR  0.05% / 0.10%
 *
 * 一次抽三條：
 *  - 第1條：固定 = 本次 Session 等級
 *  - 第2/3條：依「依此類推分配」
 *      session=R   → 100% R
 *      session=SR  → 第2條：80% R  | 20% SR；第3條：95% R  | 5% SR
 *      session=SSR → 第2條：80% SR | 20% SSR；第3條：95% SR | 5% SSR
 *      session=UR  → 第2條：80% SSR| 20% UR；第3條：95% SSR| 5% UR
 *      session=LR  → 第2條：80% UR | 20% LR；第3條：95% UR | 5% LR
 *  - 特例 session=SLR：
 *      第1條固定 SLR；第2條：80% LR | 20% SLR；第3條：95% LR | 5% SLR
 *
 * 詞條池以 R 為基準，依階級倍率套用：
 *   SR×2、SSR×3、UR×4、LR×6、SLR×9
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PotentialCoreV21 = factory(); }
})(this, function () {
  'use strict';

  // ===== 小工具 =====
  function clone(o){ try{return JSON.parse(JSON.stringify(o||{}));}catch(_){return {}; } }
  function pickWeighted(items, rng){
    rng = (typeof rng==='function') ? rng : Math.random;
    var i, sum=0; for(i=0;i<items.length;i++) sum += (items[i].w||0);
    if (sum<=0) return items[0].v;
    var r = rng()*sum, acc=0;
    for(i=0;i<items.length;i++){ acc += (items[i].w||0); if (r <= acc) return items[i].v; }
    return items[items.length-1].v;
  }
  function clamp01(x){ return x<0?0:(x>1?1:x); }

  // ✅ baseVal 不寫死：val 支援 number / array / function
  function resolveBaseVal(effect, rng){
    rng = (typeof rng==='function') ? rng : Math.random;
    try{
      var v = effect ? effect.val : 0;
      if (typeof v === 'number') return v;
      if (typeof v === 'function') return +v(rng) || 0;
      if (v && typeof v.length === 'number'){ // array
        if (v.length<=0) return 0;
        return +v[Math.floor(rng()*v.length)] || 0;
      }
      return +v || 0;
    }catch(_){
      return 0;
    }
  }

  // ✅ 剩餘機率不寫死：以 100 為目標，把剩餘平均分給沒寫 prob 的詞條
  function finalizeEffectsProbs(effects){
    effects = effects || [];
    var i, fixedSum = 0, openIdx = [];
    for(i=0;i<effects.length;i++){
      var p = effects[i].prob;
      if (typeof p === 'number' && isFinite(p)) fixedSum += p;
      else openIdx.push(i);
    }
    var leftover = 100 - fixedSum;
    if (openIdx.length > 0){
      var each = leftover / openIdx.length;
      for(i=0;i<openIdx.length;i++){
        effects[openIdx[i]].prob = each;
      }
    }
    return effects;
  }

  // ===== 組態 =====
  var config = {
    // 升階鏈（一般 / 高級）
    chain: {
      base: { r2sr:0.10, sr2ssr:0.05, ssr2ur:0.02,  ur2lr:0.005,  lr2slr:0.0005 },
      plus: { r2sr:clamp01(0.10*2), sr2ssr:clamp01(0.05*2), ssr2ur:clamp01(0.02*2),
              ur2lr:clamp01(0.005*2), lr2slr:clamp01(0.0005*2) }
    },
    // 階級倍率
    mult: { R:1, SR:2, SSR:3, UR:4, LR:5, SLR:6 },

    // R 階詞條池（以 R 為基準；高階只乘倍率）
    // type: 'flat'|'pct'|'allpct'
    effectsR: finalizeEffectsProbs([
      // ===== 固定機率：3% 組 =====
      { id:'str_pct_3',  label:'力量',   type:'pct',    unit:'pct', val:3,   prob:1.66 },
      { id:'dex_pct_3',  label:'敏捷',   type:'pct',    unit:'pct', val:3,   prob:1.66 },
      { id:'luk_pct_3',  label:'幸運',   type:'pct',    unit:'pct', val:3,   prob:1.66 },
      { id:'int_pct_3',  label:'智力',   type:'pct',    unit:'pct', val:3,   prob:1.66 },
      { id:'all_pct_3',  label:'全屬性', type:'allpct', unit:'pct', val:3,   prob:1.22 },
      { id:'atk_pct_3',  label:'攻擊力', type:'pct',    unit:'pct', val:3,   prob:0.92 },

      // ===== 固定機率：1.5% 組 =====
      { id:'str_pct_15', label:'力量',   type:'pct',    unit:'pct', val:1.5, prob:2.26 },
      { id:'dex_pct_15', label:'敏捷',   type:'pct',    unit:'pct', val:1.5, prob:2.26 },
      { id:'luk_pct_15', label:'幸運',   type:'pct',    unit:'pct', val:1.5, prob:2.26 },
      { id:'int_pct_15', label:'智力',   type:'pct',    unit:'pct', val:1.5, prob:2.26 },
      { id:'all_pct_15', label:'全屬性', type:'allpct', unit:'pct', val:1.5, prob:1.92 },
      { id:'atk_pct_15', label:'攻擊力', type:'pct',    unit:'pct', val:1.5, prob:1.42 },

      // ===== 剩餘機率：不寫死 prob（自動平均吃掉剩下的機率）=====
      // Hp+5%,3%
      { id:'hp_pct_var',   label:'HP',     type:'pct',  unit:'pct',  val:[5,3] },
      // Mp+5%,3%
      { id:'mp_pct_var',   label:'MP',     type:'pct',  unit:'pct',  val:[5,3] },
      // Hp+100,200,300
      { id:'hp_flat_var',  label:'HP',      type:'flat', unit:'flat', val:[100,200,300] },
      // Mp+10,20,30
      { id:'mp_flat_var',  label:'MP',      type:'flat', unit:'flat', val:[10,20,30] },
      // 攻擊力+3,5,7
      { id:'atk_flat_var', label:'攻擊力',  type:'flat', unit:'flat', val:[3,5,7] },
      // 防禦力+10,15,20
      { id:'def_flat_var', label:'防禦力',  type:'flat', unit:'flat', val:[10,15,20] },
      // 防禦力3%,1.5%
      { id:'def_pct_var',  label:'防禦力', type:'pct',  unit:'pct',  val:[3,1.5] }
    ])
  };

  // 第2/3條對應 session 的分配（依「依此類推」）
  function distForSessionTier(session, samePct){
    // samePct: 第二/第三條「同等級」機率（%）
    // 規則：R 只能是 R；其餘階級 = 低一階 (100-samePct)% + 同階 samePct%
    var sp = Number(samePct)||0;
    if (sp < 0) sp = 0;
    if (sp > 100) sp = 100;

    function prevTier(t){
      if (t==='SR') return 'R';
      if (t==='SSR') return 'SR';
      if (t==='UR') return 'SSR';
      if (t==='LR') return 'UR';
      if (t==='SLR') return 'LR';
      return 'R';
    }

    if (session==='R') return [{v:'R', w:100}];
    var low = prevTier(session);
    var lw = 100 - sp;
    // 若同階機率為 0，仍回傳單一 low，避免 pickWeighted 浮點誤差
    if (sp <= 0) return [{v:low, w:100}];
    if (lw <= 0) return [{v:session, w:100}];
    return [{v:low, w:lw}, {v:session, w:sp}];
  }

  // 單次升階檢定（只往上）
  function promoteOnce(currentTier, cubeType, rng){
    rng = (typeof rng==='function') ? rng : Math.random;
    var ch = (cubeType==='cube_plus') ? config.chain.plus : config.chain.base;
    if (currentTier==='R'    && rng()<ch.r2sr)   return 'SR';
    if (currentTier==='SR'   && rng()<ch.sr2ssr) return 'SSR';
    if (currentTier==='SSR'  && rng()<ch.ssr2ur) return 'UR';
    if (currentTier==='UR'   && rng()<ch.ur2lr)  return 'LR';
    if (currentTier==='LR'   && rng()<ch.lr2slr) return 'SLR';
    return currentTier;
  }

  // 從 R 池抽一條
  function pickEffectR(rng){
    rng = (typeof rng==='function') ? rng : Math.random;
    var arr=config.effectsR.map(function(e){ return {v:e, w:e.prob}; });
    return pickWeighted(arr, rng);
  }

  // 依固定的 sessionTier 一次產生三條
  function rollThreeFixedSession(sessionTier, rng){
    rng = (typeof rng==='function') ? rng : Math.random;

    // SLR 特例：1、2 保底 SLR；第 3 條 LR97% / SLR3%
    if (sessionTier === 'SLR'){
      var lines = [];
      for (var i=0; i<3; i++){
        var tier = (i<2) ? 'SLR' : pickWeighted([{v:'LR',w:97},{v:'SLR',w:3}], rng);
        var e = pickEffectR(rng);
        var m = config.mult[tier]||1;
        var base = resolveBaseVal(e, rng);
        lines.push({ tier:tier, id:e.id, label:e.label, type:e.type, unit:e.unit, baseVal:base, mult:m, value:base*m });
      }
      return lines;
    }

    // 其它階級：第1條固定 session 等級；第2/3 條依「依此類推」
    var out=[], i;
    for(i=0;i<3;i++){
      var tier2;
      if (i===0) tier2 = sessionTier;
      else if (i===1) tier2 = pickWeighted(distForSessionTier(sessionTier, 20), rng); // 第2條：同階 20%
      else tier2 = pickWeighted(distForSessionTier(sessionTier, 5), rng);            // 第3條：同階 5%
      var e2 = pickEffectR(rng);
      var m2 = config.mult[tier2]||1;
      var base2 = resolveBaseVal(e2, rng);
      out.push({ tier:tier2, id:e2.id, label:e2.label, type:e2.type, unit:e2.unit, baseVal:base2, mult:m2, value:base2*m2 });
    }
    return out;
  }

  // 從「目前等級」出發（只升不降），回傳本次等級+三條
  function rollThreeSessionFrom(currentTier, cubeType, rng){
    var next = promoteOnce(currentTier||'R', cubeType||'cube', rng);
    return { sessionTier: next, lines: rollThreeFixedSession(next, rng) };
  }

  // 合併三條到總加成
  function linesToBonus(lines){
    // ✅ 補齊 MP / DEF%（不影響原本）
    var sum = {
      str:0,dex:0,int:0,luk:0,atk:0,def:0,hp:0,mp:0,
      strPct:0,dexPct:0,intPct:0,lukPct:0, atkPct:0, hpPct:0, mpPct:0, defPct:0, allStatPct:0
    };
    var i, ln;
    for(i=0;i<(lines||[]).length;i++){
      ln = lines[i];
      if (ln.type==='flat'){
        if (ln.id.indexOf('str')===0) sum.str += ln.value;
        else if (ln.id.indexOf('dex')===0) sum.dex += ln.value;
        else if (ln.id.indexOf('int')===0) sum.int += ln.value;
        else if (ln.id.indexOf('luk')===0) sum.luk += ln.value;
        else if (ln.id.indexOf('atk')===0) sum.atk += ln.value;
        else if (ln.id.indexOf('def')===0) sum.def += ln.value;
        else if (ln.id.indexOf('hp')===0)  sum.hp  += ln.value;
        else if (ln.id.indexOf('mp')===0)  sum.mp  += ln.value;
      } else if (ln.type==='pct'){
        if (ln.id.indexOf('str')===0) sum.strPct += ln.value;
        else if (ln.id.indexOf('dex')===0) sum.dexPct += ln.value;
        else if (ln.id.indexOf('int')===0) sum.intPct += ln.value;
        else if (ln.id.indexOf('luk')===0) sum.lukPct += ln.value;
        else if (ln.id.indexOf('atk')===0) sum.atkPct += ln.value;
        else if (ln.id.indexOf('hp')===0)  sum.hpPct  += ln.value;
        else if (ln.id.indexOf('mp')===0)  sum.mpPct  += ln.value;
        else if (ln.id.indexOf('def')===0) sum.defPct += ln.value;
      } else if (ln.type==='allpct'){
        sum.allStatPct += ln.value;
      }
    }
    return sum;
  }

  // 行描述（UI用）
  function describeLine(ln){
    var unit = (ln.unit==='pct'||ln.unit==='allpct') ? '%' : '';
    return '['+ln.tier+'] '+ln.label+' +'+ln.value+unit;
  }

  // 參考（從 R 起算一次的 Session 機率）
  function sessionTierProbs(cubeType){
    var ch = (cubeType==='cube_plus') ? config.chain.plus : config.chain.base;
    return { SLR:0, LR:0, UR:0, SSR:0, SR:(ch.r2sr*100), R:((1-ch.r2sr)*100) };
  }

  // ===== UI 查詢工具 =====
  function upgradeChanceFrom(tier, cubeType){
    var ch = (cubeType==='cube_plus') ? config.chain.plus : config.chain.base;
    if (tier==='R')    return ch.r2sr;
    if (tier==='SR')   return ch.sr2ssr;
    if (tier==='SSR')  return ch.ssr2ur;
    if (tier==='UR')   return ch.ur2lr;
    if (tier==='LR')   return ch.lr2slr;
    // SLR 為天花板
    return 0;
  }

  // ✅ val 可能是 array：UI 表格用「a/b/c」顯示（不改你原本功能）
  function effectTableForSession(tier){
    var mult = config.mult[tier] || 1;
    return config.effectsR.map(function(e){
      var unit = (e.unit==='pct'||e.unit==='allpct') ? '%' : '';
      var v = e.val;
      var displayVal;
      if (typeof v === 'number'){
        displayVal = v * mult;
      } else if (v && typeof v.length === 'number'){
        // array：每個可能值都乘倍率後顯示
        var arr = [];
        for (var i=0;i<v.length;i++) arr.push((+v[i]||0) * mult);
        displayVal = arr.join('/');
      } else {
        // function 或其他：用一次 resolveBaseVal 做展示（避免 NaN）
        displayVal = resolveBaseVal(e, Math.random) * mult;
      }
      return {
        id: e.id,
        label: e.label,
        value: displayVal,
        unit: unit,
        prob: e.prob
      };
    });
  }


  // ===== 方塊定義（UI 以此為主導）=====
  // cubeType 對應 promoteOnce/rollThreeSessionFrom 的第二參數：'cube' | 'cube_plus'
  var cubeDefs = [
    // 一般：直接洗三條並套用
    { id:'cube', title:'一般潛能方塊', cubeType:'cube',
      ui:{
        flowId:'cube_basic'
      } },

    // 高級：洗出候選 → 允許保留/套用；也可繼續洗候選
    { id:'cube_plus', title:'高級潛能方塊', cubeType:'cube_plus',
      ui:{
        flowId:'cube_plus_keep_replace'
      } },

    // 結合方塊：抽選一排(等機率 1/3)並立刻消耗 → 閃爍選中排並詢問是否要洗該排；可重新抽選(再次消耗)
    // 洗該排：直接洗並套用「單條」；詞條等級：同階 15% / 低一階 85%
    { id:'cube_combine', title:'結合方塊', cubeType:'cube_combine',
      ui:{
        flowId:'cube_combine_select_then_wash',
        combineTierDist:{ same:0.15, down:0.85 }
      } }
  ];
  function getCubeDefs(){ return cubeDefs.slice(); }


  

  // =====================================================================
  // Flow-driven UI Engine（讓彈窗完全由潛能檔案主導）
  // - Equip/UI 只負責：顯示 panels + actions、扣道具、套用 patch
  // - 這裡負責：狀態機、抽選/洗出結果、候選/套用邏輯
  // =====================================================================

  function _cloneLines(lines){
    if(!Array.isArray(lines)) return [];
    var out=[], i;
    for(i=0;i<lines.length;i++){
      var a=lines[i]||{};
      // 保留完整欄位：tier/id/type/unit/label/value 等（避免 UI 徽章與加成計算變空白）
      out.push({
        tier: a.tier || a.sessionTier || a.rank || a.grade || a.t || a.T || a._tier || undefined,
        id: a.id || a.key, // 舊資料可能用 key
        type: a.type || ((a.unit==='pct'||a.unit==='allpct'||a.unit==='%') ? 'pct' : 'flat'),
        unit: (a.unit==='%') ? 'pct' : a.unit,
        label: a.label,
        value: a.value,
        baseVal: a.baseVal,
        mult: a.mult
      });
    }
    return out;
  }

  // 對外：初始化一個 flow ctx（UI 每次開彈窗/切換方塊都可呼叫）
  function flowInit(cubeId, curTier, curLines){
    return {
      cubeId: cubeId,
      state: 'idle',
      curTier: curTier || 'R',
      curLines: _cloneLines(curLines),
      // 共用暫存
      selectedLineIndex: null,   // 1..3
      candidateTier: null,
      candidateLines: null,
      message: ''
    };
  }

  function _pick(arr){ return arr[(Math.random()*arr.length)|0]; }

  function _randLineIndex(){ return (Math.random()*3|0)+1; } // 1..3

  // ---- flows 定義（純資料）----
  var uiFlows = {
    cube_basic: {
      states: {
        idle: {
          panels: function(ctx){
            return [ { title:'目前潛能', tier:ctx.curTier, lines:ctx.curLines } ];
          },
          actions: [
            { id:'roll_full_apply', label:'洗一次', cost:1, kind:'primary' }
          ]
        }
      }
    },

    cube_plus_keep_replace: {
      states: {
        idle: {
          panels: function(ctx){
            return [ { title:'目前潛能', tier:ctx.curTier, lines:ctx.curLines } ];
          },
          actions: [
            { id:'roll_full_candidate', label:'洗一次', cost:1, kind:'primary' }
          ]
        },
        confirm: {
          panels: function(ctx){
            return [
              { title:'目前', tier:ctx.curTier, lines:ctx.curLines },
              { title:'新結果', tier:(ctx.candidateTier||ctx.curTier), lines:(ctx.candidateLines||[]) }
            ];
          },
          actions: [
            { id:'apply_candidate', label:'套用新結果', cost:0, kind:'primary' },
            { id:'keep_current', label:'保留目前', cost:0, kind:'ghost' },
            { id:'roll_full_candidate', label:'繼續洗一次', cost:1, kind:'secondary' }
          ]
        }
      }
    },

    cube_combine_select_then_wash: {
      states: {
        idle: {
          panels: function(ctx){
            return [ { title:'目前潛能', tier:ctx.curTier, lines:ctx.curLines } ];
          },
          actions: [
            { id:'combine_draw', label:'抽選一排', cost:1, kind:'primary' }
          ]
        },
        selected: {
          panels: function(ctx){
            return [ { title:'已選中第 '+(ctx.selectedLineIndex||'?')+' 排', tier:ctx.curTier, lines:ctx.curLines, highlightLine:ctx.selectedLineIndex } ];
          },
          actions: [
            { id:'combine_wash_selected', label:'洗這一排', cost:0, kind:'primary' },
            { id:'combine_draw', label:'重新抽選一排', cost:1, kind:'secondary' }
          ]
        }
      }
    }
  };

  // ---- actions 實作（純邏輯）----
  function _action_roll_full(ctx, cubeType, asCandidate){
    var res = rollThreeSessionFrom(ctx.curTier, cubeType); // {sessionTier, lines}
    if (asCandidate){
      ctx.candidateTier = res.sessionTier;
      ctx.candidateLines = _cloneLines(res.lines);
      ctx.state = 'confirm';
      ctx.message = '已產生新結果，請選擇套用或保留。';
      return { ctx: ctx, patch: null };
    } else {
      ctx.curTier = res.sessionTier;
      ctx.curLines = _cloneLines(res.lines);
      ctx.state = 'idle';
      ctx.message = '已套用新潛能。';
      return { ctx: ctx, patch: { apply: { tier: ctx.curTier, lines: ctx.curLines } }, fx: ctx.fx };
    }
  }

  function _action_apply_candidate(ctx){
    if (ctx.candidateLines && ctx.candidateLines.length){
      ctx.curTier = ctx.candidateTier || ctx.curTier;
      ctx.curLines = _cloneLines(ctx.candidateLines);
    }
    ctx.candidateTier = null;
    ctx.candidateLines = null;
    ctx.state = 'idle';
    ctx.message = '已套用新結果。';
    return { ctx: ctx, patch: { apply: { tier: ctx.curTier, lines: ctx.curLines } } };
  }

  function _action_keep_current(ctx){
    ctx.candidateTier = null;
    ctx.candidateLines = null;
    ctx.state = 'idle';
    ctx.message = '已保留目前潛能。';
    return { ctx: ctx, patch: null };
  }

  function _action_combine_draw(ctx){
    ctx.selectedLineIndex = _randLineIndex();
    ctx.state = 'selected';
    ctx.message = '已抽選第 '+ctx.selectedLineIndex+' 排；是否要洗這一排？';
    return { ctx: ctx, patch: null };
  }

  function _action_combine_wash(ctx, cubeId){
    // 結合方塊：只洗「選中的那一排」；單條 tier 機率：同階 15% / 低一階 85%（可由 def.ui.combineTierDist 覆蓋）
    var def=null, i;
    for(i=0;i<cubeDefs.length;i++){ if(cubeDefs[i].id===cubeId){ def=cubeDefs[i]; break; } }
    var dist = (def && def.ui && def.ui.combineTierDist) ? def.ui.combineTierDist : { same:0.15, down:0.85 };

    var idx = (ctx.selectedLineIndex||1)-1; // 0..2
    var curTier = ctx.curTier || 'R';

    // 產生一條新詞條（同階/低一階）
    var line = rollOneLineSameOrDown(curTier, dist);

    var _sameTier = (line && line.tier === curTier);

    // 確保 lines 長度
    if (!Array.isArray(ctx.curLines)) ctx.curLines = [];
    ctx.curLines = _cloneLines(ctx.curLines);
    while(ctx.curLines.length<3) ctx.curLines.push({ tier:curTier, id:'', type:'flat', unit:'', label:'—', value:0 });

    ctx.curLines[idx] = {
      tier: line.tier,
      id: line.id,
      type: line.type,
      unit: line.unit,
      label: line.label,
      value: line.value,
      baseVal: line.baseVal,
      mult: line.mult
    };

    ctx.state = 'idle';
    ctx.message = '已洗並套用第 '+(idx+1)+' 排。';
    ctx.selectedLineIndex = null;

    // 特效旗標：若洗出同階級，讓 UI 播放特效
    ctx.fx = { kind:'combine', lineIndex: idx, sameTier: _sameTier };

    // 注意：結合方塊不改全域階級（curTier 不變），只改指定一行
    return { ctx: ctx, patch: { apply: { tier: ctx.curTier, lines: ctx.curLines } } };
  }

  // 對外：取得某顆方塊當前 state 的 view（panels/actions）
  function flowView(cubeId, ctx){
    ctx = ctx || flowInit(cubeId, 'R', []);
    var def=null, i;
    for(i=0;i<cubeDefs.length;i++){ if(cubeDefs[i].id===cubeId){ def=cubeDefs[i]; break; } }
    var flowId = def && def.ui && def.ui.flowId ? def.ui.flowId : 'cube_basic';
    var flow = uiFlows[flowId] || uiFlows.cube_basic;
    var st = flow.states[ctx.state] || flow.states.idle;

    var panels = [];
    if (st.panels) panels = st.panels(ctx) || [];
    var actions = st.actions ? st.actions.slice() : [];
    return { cubeId:cubeId, flowId:flowId, state:ctx.state, panels:panels, actions:actions, message:(ctx.message||'') };
  }

  // 對外：派發 action，回傳 {ctx, patch}
  function flowDispatch(cubeId, ctx, actionId){
    ctx = ctx || flowInit(cubeId, 'R', []);
    var def=null, i;
    for(i=0;i<cubeDefs.length;i++){ if(cubeDefs[i].id===cubeId){ def=cubeDefs[i]; break; } }
    var cubeType = def ? def.cubeType : 'cube';

    if (actionId === 'roll_full_apply')     return _action_roll_full(ctx, cubeType, false);
    if (actionId === 'roll_full_candidate') return _action_roll_full(ctx, cubeType, true);
    if (actionId === 'apply_candidate')     return _action_apply_candidate(ctx);
    if (actionId === 'keep_current')        return _action_keep_current(ctx);
    if (actionId === 'combine_draw')        return _action_combine_draw(ctx);
    if (actionId === 'combine_wash_selected') return _action_combine_wash(ctx, cubeId);

    // unknown
    ctx.message = '未知操作：'+actionId;
    return { ctx: ctx, patch: null };
  }


  // ===== 單條洗（供特殊方塊使用）=====
  var _TIERS_ORDER = ['R','SR','SSR','UR','LR','SLR'];
  function prevTier(t){
    var i=_TIERS_ORDER.indexOf(t);
    if(i<=0) return t||'R';
    return _TIERS_ORDER[i-1];
  }
  function rollOneLineAtTier(tier, rng){
    rng = (typeof rng==='function') ? rng : Math.random;
    tier = tier || 'R';
    var e = pickEffectR(rng);
    var m = config.mult[tier] || 1;
    var base = resolveBaseVal(e, rng);
    return { tier:tier, id:e.id, label:e.label, type:e.type, unit:e.unit, baseVal:base, mult:m, value:base*m };
  }
  // 依機率決定「同階/低一階」，洗出單條
  // dist: {same:0.15, down:0.85}
  function rollOneLineSameOrDown(currentTier, dist, rng){
    rng = (typeof rng==='function') ? rng : Math.random;
    dist = dist || { same:0.15, down:0.85 };
    var same = +dist.same || 0;
    var down = +dist.down || 0;
    var total = same + down;
    if(total<=0){ same=0.15; down=0.85; total=1; }
    var pSame = same/total;
    var t = (rng() < pSame) ? (currentTier||'R') : prevTier(currentTier||'R');
    return rollOneLineAtTier(t, rng);
  }
  return {
    config: config,
    cubeDefs: cubeDefs,
    getCubeDefs: getCubeDefs,
    promoteOnce: promoteOnce,
    rollThreeFixedSession: rollThreeFixedSession,
    rollThreeSessionFrom: rollThreeSessionFrom,
    rollOneLineAtTier: rollOneLineAtTier,
    rollOneLineSameOrDown: rollOneLineSameOrDown,
    linesToBonus: linesToBonus,
    describeLine: describeLine,
    sessionTierProbs: sessionTierProbs,
    upgradeChanceFrom: upgradeChanceFrom,
    effectTableForSession: effectTableForSession,
    prevTier: prevTier,
    rollOneLineAtTier: rollOneLineAtTier,
    rollOneLineSameOrDown: rollOneLineSameOrDown    ,
    // Flow-driven UI exports
    uiFlows: uiFlows,
    flowInit: flowInit,
    flowView: flowView,
    flowDispatch: flowDispatch

  };
});