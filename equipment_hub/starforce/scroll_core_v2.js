/*!
 * scroll_core_v2.js — 卷軸強化（ES5/UMD）
 * - 純規則/純函式：不碰存檔、不接背包、不做 UI
 *
 * 本版重點（重新規劃）：
 *  • 除「手套 / 武器」外：統一卷軸
 *      - 屬性強化卷 60% / 10%
 *      - 屬性攻擊強化卷 45% / 7%
 *  • 手套專用：手套強化卷 60% / 30% / 7%
 *  • 武器專用：武器強化卷 70% / 30% / 10% / 1%
 *  • 混沌卷軸60%（允許負數）：主屬/ATK 使用自訂分佈（-5..+15，+3 固定 8%，從 +0..+12 等比挪出）
 *  • 高級混沌卷軸60%（無負數）：主屬/ATK 使用自訂分佈（0..+12）
 *  • chaosPreview/chaosCommit：支援「混沌選擇券」的二段式操作
 *  • ★卷軸上限提升（最多 +10 格），成功率階梯（0~1）：
 *        [1.00,0.70,0.40,0.25,0.10,0.05,0.04,0.02,0.01,0.005]
 *
 * 對外 API：
 *   ScrollForgeV2.def
 *   ScrollForgeV2.canUse(node, name)
 *   ScrollForgeV2.apply(node, name, opt)
 *   ScrollForgeV2.chaosPreview(node, name)
 *   ScrollForgeV2.chaosCommit(node, name, effPreview, applyIt)
 *   ScrollForgeV2.recoverFailedOnce(node)
 *   ScrollForgeV2.perfectReset(node)
 *   ScrollForgeV2.chaosMainProb(allowNeg)
 *   // 卷軸上限提升
 *   ScrollForgeV2.canAugmentSlots(node)
 *   ScrollForgeV2.augmentSlots(node, opt)
 *   // 機率查詢／覆寫
 *   ScrollForgeV2.getAugmentChances()     -> [100,70,...,0.5]  (百分比)
 *   ScrollForgeV2.augmentSteps            -> [1.00,0.70,...]   (0~1)
 *   ScrollForgeV2.setAugmentChances(arr)  // 覆寫 0~1 陣列
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.ScrollForgeV2 = factory(); }
})(this, function () {
  'use strict';

  function clone(o){ try{return JSON.parse(JSON.stringify(o||{}));}catch(_){return {}; } }
  function nz(n){ return (typeof n==='number' && isFinite(n)) ? n : 0; }


  // ===== 裝備類型判定（自動化）=====
  // 原則：
  //  - 是否「可衝卷」由裝備本身的 slotsMax 決定（>0 即可）
  //  - 「統一卷」適用：可衝卷且非手套、非武器類（weapon/subweapon/energy）
  //  - 「武器卷」適用：weapon/subweapon/energy（且 slotsMax>0）
  function isWeaponLikeType(t){ return (t === 'weapon' || t === 'subweapon' || t === 'energy'); }
  function hasScrollSlots(node){ return !!node && ((node.slotsMax|0) > 0); }

  function equipIsUnified(node){
    if (!hasScrollSlots(node)) return false;
    var t = node.type;
    if (t === 'glove') return false;
    if (isWeaponLikeType(t)) return false;
    return true;
  }
  function equipIsGlove(node){
    return hasScrollSlots(node) && node.type === 'glove';
  }
  function equipIsWeaponLike(node){
    return hasScrollSlots(node) && isWeaponLikeType(node.type);
  }
  function equipIsAnyScrollable(node){
    return hasScrollSlots(node);
  }


  // ===== 卷軸定義 =====
  // 注意：使用者規格未提供「屬性攻擊強化卷 45%/7%」的數值。
  // 這裡先採用「比屬性強化卷更偏攻擊」的預設值：
  //   - 45%：全屬+3、攻擊力+6
  //   -  7%：全屬+5、攻擊力+12
  // 若你要改數值，只需改下面兩行 eff。
  var DEF = {
    // 統一卷軸（除手套/武器外）
    '屬性強化卷60%': { equip:equipIsUnified, rate:60, eff:{ str:3, dex:3, int:3, luk:3, atk:2, def:5,  hp:75  } },
    '屬性強化卷10%': { equip:equipIsUnified, rate:10, eff:{ str:5, dex:5, int:5, luk:5, atk:4, def:15, hp:175 } },
    '屬性攻擊強化卷45%': { equip:equipIsUnified, rate:45, eff:{ str:3, dex:3, int:3, luk:3, atk:6 } },
    '屬性攻擊強化卷7%':  { equip:equipIsUnified, rate:7,  eff:{ str:5, dex:5, int:5, luk:5, atk:12 } },

    // 手套專用
    '手套強化卷60%': { equip:equipIsGlove, rate:60, eff:{ str:1, dex:1, int:1, luk:1, atk:3 } },
    '手套強化卷30%': { equip:equipIsGlove, rate:30, eff:{ str:2, dex:2, int:2, luk:2, atk:5 } },
    '手套強化卷7%':  { equip:equipIsGlove, rate:7,  eff:{ str:5, dex:5, int:5, luk:5, atk:12 } },

    // 武器專用
    '武器強化卷70%': { equip:equipIsWeaponLike, rate:70, eff:{ str:7,  dex:7,  int:7,  luk:7,  atk:5  } },
    '武器強化卷30%': { equip:equipIsWeaponLike, rate:30, eff:{ str:10, dex:10, int:10, luk:10, atk:8  } },
    '武器強化卷10%': { equip:equipIsWeaponLike, rate:10, eff:{ str:13, dex:13, int:13, luk:13, atk:11 } },
    '武器強化卷1%':  { equip:equipIsWeaponLike, rate:1,  eff:{ str:25, dex:25, int:25, luk:25, atk:28 } },

    // 混沌卷（成功率皆為 60% / 超級混沌為 5%）
    '混沌卷軸60%': {
      equip: equipIsAnyScrollable,
      rate: 60,
      effGen: function (node, rng) { return chaosRollBundle('std', rng); },
      // UI：機率總覽可自動抓取
      chaosView: {
        title: '標準混沌',
        type: 'single',
        source: 'chaosMainProb',
        args: [true],
        header: ['數值','主屬/ATK 機率%'],
        notes: [
          ['HP (-50~100)','分段遞減分佈（含負值機率）'],
          ['DEF (-30~30)','分段遞減分佈（含負值機率）']
        ]
      }
    },

    '高級混沌卷軸60%': {
      equip: equipIsAnyScrollable,
      rate: 60,
      effGen: function (node, rng) { return chaosRollBundle('adv', rng); },
      chaosView: {
        title: '高級混沌',
        type: 'single',
        source: 'chaosMainProb',
        args: [false],
        header: ['數值','主屬/ATK 機率%'],
        notes: [
          ['HP (0~100)','遞減分佈（無負值）'],
          ['DEF (0~30)','遞減分佈（無負值）']
        ]
      }
    },

    '超級混沌卷5%': {
      equip: equipIsAnyScrollable,
      rate: 5,
      // 依需求：主屬/ATK 走「越靠近 0 機率越高」的分佈抽取
      // 主屬：-5 ~ +20（toward zero）
      // ATK： -8 ~ +25（toward zero）
      // DEF/HP/MP：維持均勻（可再改成 toward zero）
      effGen: function (node, rng) { return superChaosRollBundle(rng); },
      chaosView: {
        title: '超級混沌',
        type: 'dual',
        mainSource: 'chaosSuperMainProb',
        atkSource: 'chaosSuperAtkProb',
        header: ['數值','主屬 機率%','ATK 機率%'],
        footer: ['說明','越靠近 0 機率越高（toward zero）','主屬範圍 -5~20 / ATK 範圍 -8~25']
      }
    }
  };

  // ===== 機率工具 =====
  function pickWeighted(weights, rng){
    var i, total=0; for(i=0;i<weights.length;i++) total += (weights[i].w||0);
    if (total<=0) return weights[0] ? weights[0].v : 0;
    var r=(rng() * total), acc=0;
    for(i=0;i<weights.length;i++){ acc += (weights[i].w||0); if (r <= acc) return weights[i].v; }
    return weights[weights.length-1].v;
  }
  function rollFromPctTable(objPct, rng){
    // objPct: { value -> percent(0..100 任意總和) }
    var arr=[], k; for(k in objPct) if (objPct.hasOwnProperty(k)){
      arr.push({ v: parseInt(k,10), w: Number(objPct[k])||0 });
    }
    arr.sort(function(a,b){ return a.v - b.v; });
    return pickWeighted(arr, rng);
  }

  // ===== 主屬/ATK 每點機率表 =====
  // 1) 標準混沌（允許負數，-5..+15）— +3 固定 8%，其餘 0..12(不含3) 等比縮
  var CHAOS_STD_MAIN_PCT = (function(){
    var base = {
      "-5":1.5, "-4":2, "-3":2.5, "-2":3, "-1":5,
       "0":7, "1":8, "2":8, /*"3":—*/ "4":9, "5":8, "6":8, "7":7,
       "8":6.5, "9":5.5, "10":5, "11":4, "12":3.5, "13":3, "14":2, "15":1
    };
    var poolKeys = ["0","1","2","4","5","6","7","8","9","10","11","12"];
    var i, poolSum = 0;
    for(i=0;i<poolKeys.length;i++) poolSum += (Number(base[poolKeys[i]])||0); // 79.5
    var need = 8.0;
    var f = (poolSum - need) / (poolSum || 1);
    for(i=0;i<poolKeys.length;i++){ var k = poolKeys[i]; base[k] = +(Number(base[k]) * f); }
    base["3"] = 8.0;
    return base; // 總和 ~99.5%
  })();

  // 2) 高級混沌（0..12）
  var CHAOS_ADV_MAIN_PCT = {
    "0":10,"1":12.5,"2":13,"3":12,"4":10,"5":9,"6":8.5,"7":7.5,"8":6.5,"9":5,"10":3,"11":2,"12":1
  };

  // 3) 超級混沌（toward zero）
  //    主屬：-5..+20 ；ATK：-8..+25
  //    權重：w(v)=1/(|v|+1)^alpha ，再正規化成百分比
  function buildTowardZeroPct(minV, maxV, alpha){
    alpha = (alpha==null) ? 1.25 : Number(alpha);
    if (!(alpha>0)) alpha = 1.25;
    var v, sum=0, weights=[];
    for(v=minV; v<=maxV; v++){
      var w = 1 / Math.pow(Math.abs(v)+1, alpha);
      weights.push({ v:v, w:w });
      sum += w;
    }
    var pct = {};
    for (var i=0;i<weights.length;i++){
      var p = (sum>0) ? (weights[i].w / sum * 100) : 0;
      pct[String(weights[i].v)] = p;
    }
    return pct;
  }

  var SUPER_CHAOS_ALPHA = 1;
  var SUPER_CHAOS_MAIN_PCT = buildTowardZeroPct(-5, 20, SUPER_CHAOS_ALPHA);
  var SUPER_CHAOS_ATK_PCT  = buildTowardZeroPct(-8, 25, SUPER_CHAOS_ALPHA);

  // HP/DEF：分段遞減分配
  var CHAOS_HP_RANGE = { negMin:-50, posMidMax:40, posHighMax:99, posTop:100 };
  var CHAOS_DEF_RANGE= { negMin:-30, posMidMax:15, posHighMax:29, posTop:30 };
  function decreasingWeights(from, to){
    var arr=[], i; for(i=from;i<=to;i++){ arr.push({ v:i, w:(to - i + 1) }); } return arr;
  }
  function towardZeroWeights(min, max){
    var arr=[], i; for(i=min;i<=max;i++){ var d=Math.abs(i); arr.push({ v:i, w:(d===0)? (max-min+2) : (1/(d+0.5)) }); } return arr;
  }
  function chaosHP(allowNegative, rng){
    var buckets=[], P_NEG=allowNegative?0.15:0, P_TOP=0.01, P_HIGH=allowNegative?0.14:0.19, P_MID=1-(P_NEG+P_HIGH+P_TOP);
    if (P_NEG>0) buckets.push({p:P_NEG, gen:function(){ return pickWeighted(towardZeroWeights(CHAOS_HP_RANGE.negMin,-1), rng); }});
    buckets.push({p:P_MID, gen:function(){ return pickWeighted(decreasingWeights(0, CHAOS_HP_RANGE.posMidMax), rng); }});
    buckets.push({p:P_HIGH,gen:function(){ return pickWeighted(decreasingWeights(CHAOS_HP_RANGE.posMidMax+1, CHAOS_HP_RANGE.posHighMax), rng); }});
    buckets.push({p:P_TOP, gen:function(){ return CHAOS_HP_RANGE.posTop; }});
    var ws=[], i; for(i=0;i<buckets.length;i++) ws.push({ v:i, w:buckets[i].p });
    return buckets[pickWeighted(ws, rng)].gen();
  }
  function chaosDEF(allowNegative, rng){
    var buckets=[], P_NEG=allowNegative?0.15:0, P_TOP=0.01, P_HIGH=allowNegative?0.14:0.19, P_MID=1-(P_NEG+P_HIGH+P_TOP);
    if (P_NEG>0) buckets.push({p:P_NEG, gen:function(){ return pickWeighted(towardZeroWeights(CHAOS_DEF_RANGE.negMin,-1), rng); }});
    buckets.push({p:P_MID, gen:function(){ return pickWeighted(decreasingWeights(0, CHAOS_DEF_RANGE.posMidMax), rng); }});
    buckets.push({p:P_HIGH,gen:function(){ return pickWeighted(decreasingWeights(CHAOS_DEF_RANGE.posMidMax+1, CHAOS_DEF_RANGE.posHighMax), rng); }});
    buckets.push({p:P_TOP, gen:function(){ return CHAOS_DEF_RANGE.posTop; }});
    var ws=[], i; for(i=0;i<buckets.length;i++) ws.push({ v:i, w:buckets[i].p });
    return buckets[pickWeighted(ws, rng)].gen();
  }

  // 分流：主屬/ATK 用表；HP/DEF 用階梯
  function chaosRollBundle(mode, rng){
    rng = rng || Math.random;
    var eff = {};
    var table = (mode==='std') ? CHAOS_STD_MAIN_PCT : CHAOS_ADV_MAIN_PCT;
    eff.str = rollFromPctTable(table, rng);
    eff.dex = rollFromPctTable(table, rng);
    eff.int = rollFromPctTable(table, rng);
    eff.luk = rollFromPctTable(table, rng);
    eff.atk = rollFromPctTable(table, rng);
    var allowNeg = (mode==='std');
    eff.hp  = chaosHP(allowNeg, rng);
    eff.def = chaosDEF(allowNeg, rng);
    return eff;
  }

  function superChaosRollBundle(rng){
    rng = rng || Math.random;
    var eff = {};
    eff.str = rollFromPctTable(SUPER_CHAOS_MAIN_PCT, rng);
    eff.dex = rollFromPctTable(SUPER_CHAOS_MAIN_PCT, rng);
    eff.int = rollFromPctTable(SUPER_CHAOS_MAIN_PCT, rng);
    eff.luk = rollFromPctTable(SUPER_CHAOS_MAIN_PCT, rng);
    eff.atk = rollFromPctTable(SUPER_CHAOS_ATK_PCT, rng);

    // 其餘維持均勻（可再改為 toward zero）
    function ri(min, max){ return Math.floor(rng() * (max - min + 1)) + min; }
    eff.def = ri(-150, 400);
    eff.hp  = ri(-1000, 2000);
    eff.mp  = ri(-60, 300);
    return eff;
  }


  // 導出：主屬/ATK 每點機率表（供 UI 顯示；轉成 0..1）
  function chaosMainProb(allowNegative){
    var src = allowNegative ? CHAOS_STD_MAIN_PCT : CHAOS_ADV_MAIN_PCT;
    var keys = Object.keys(src).map(function(k){return parseInt(k,10);}).sort(function(a,b){return a-b;});
    var arr=[], i; for(i=0;i<keys.length;i++){ var v=keys[i]; arr.push({ v:v, p: (Number(src[String(v)])||0)/100 }); }
    return arr;
  }

  // 導出：超級混沌 主屬/ATK 每點機率表（供 UI 顯示；轉成 0..1）
  function chaosSuperMainProb(){
    var src = SUPER_CHAOS_MAIN_PCT;
    var keys = Object.keys(src).map(function(k){return parseInt(k,10);}).sort(function(a,b){return a-b;});
    var arr=[], i; for(i=0;i<keys.length;i++){ var v=keys[i]; arr.push({ v:v, p: (Number(src[String(v)])||0)/100 }); }
    return arr;
  }
  function chaosSuperAtkProb(){
    var src = SUPER_CHAOS_ATK_PCT;
    var keys = Object.keys(src).map(function(k){return parseInt(k,10);}).sort(function(a,b){return a-b;});
    var arr=[], i; for(i=0;i<keys.length;i++){ var v=keys[i]; arr.push({ v:v, p: (Number(src[String(v)])||0)/100 }); }
    return arr;
  }

  // ===== 判定/應用（一段式） =====
  function equipMatch(required, node){
    if (!required) return false;
    if (typeof required === 'function') return !!required(node);
    var type = node ? node.type : undefined;
    if (typeof required === 'string') return required === type;
    if (required && required.length){
      for (var i=0;i<required.length;i++) if (required[i]===type) return true;
    }
    return false;
  }
  function canUse(node, name){
    var sd = DEF[name];
    if (!node || !sd) return { ok:false, reason:'not_found' };
    if (node.locked) return { ok:false, reason:'locked' };
    if (!equipMatch(sd.equip, node)) return { ok:false, reason:'wrong_type' };
    if ((node.slotsUsed|0) >= (node.slotsMax|0)) return { ok:false, reason:'no_slot' };
    return { ok:true, rate:sd.rate|0, eff:clone(sd.eff), isDynamic: !!sd.effGen };
  }

  // options: { rng:fn()->0~1 }
  function apply(node, name, options){
    var chk = canUse(node, name);
    if (!chk.ok) return { ok:false, usedSlot:false, success:false, reason:chk.reason };
    options = options||{};
    var rng = (typeof options.rng === 'function') ? options.rng : Math.random;

    var success = rng() < ((chk.rate|0)/100);
    var next = clone(node||{});
    next.slotsUsed = (next.slotsUsed|0) + 1; // 失敗也扣次
    var effApplied = null;

    if (success){
      var eff = chk.isDynamic ? (DEF[name].effGen(next, rng)||{}) : (chk.eff||{});
      effApplied = clone(eff);
      var k; next.enhance = next.enhance||{};
      for (k in eff) if (eff.hasOwnProperty(k)) next.enhance[k] = (nz(next.enhance[k]) + (eff[k]|0));
      next.enhanceSuccess = (next.enhanceSuccess|0) + 1;
    }
    return { ok:true, usedSlot:true, success:success, nextNode:next, rate:chk.rate, effApplied:effApplied };
  }

  // ===== 二段式（混沌選擇券用） =====
  function chaosPreview(node, name, options){
    var chk = canUse(node, name);
    if (!chk.ok) return { ok:false, can:false, reason:chk.reason, rate:0, success:false };
    if (!DEF[name] || !DEF[name].effGen) return { ok:false, can:false, reason:'not_chaos', rate:chk.rate, success:false };
    options = options||{};
    var rng = (typeof options.rng === 'function') ? options.rng : Math.random;
    var success = (rng() < ((chk.rate|0)/100));
    var effPreview = success ? (DEF[name].effGen(node, rng)||{}) : null;
    return { ok:true, can:true, rate:chk.rate, success:success, effPreview:effPreview };
  }
  function chaosCommit(node, name, effPreview, applyIt){
    var next = clone(node||{});
    if (applyIt){
      next.slotsUsed = (next.slotsUsed|0) + 1;
      var k; next.enhance = next.enhance||{};
      for (k in effPreview) if (effPreview.hasOwnProperty(k)) next.enhance[k] = (nz(next.enhance[k]) + (effPreview[k]|0));
      next.enhanceSuccess = (next.enhanceSuccess|0) + 1;
    }
    return { ok:true, nextNode:next };
  }

  // ===== 其他工具 =====
  function recoverFailedOnce(node, options){
    var n=clone(node||{}), slotsUsed=n.slotsUsed|0, succ=n.enhanceSuccess|0, failed=Math.max(0, slotsUsed - succ);
    if (n.locked) return { ok:false, success:false, reason:'locked' };
    if (failed<=0) return { ok:false, success:false, reason:'no_failed_slots' };
    options=options||{};
    var rng=(typeof options.rng==='function')?options.rng:Math.random;
    var success=(rng()<0.5);
    if (success){ n.slotsUsed=Math.max(succ, slotsUsed-1); return { ok:true, success:true, nextNode:n }; }
    return { ok:true, success:false, nextNode:n };
  }
  // 完美重置：重置「卷軸/混沌加成」與使用次數。
  // options:
  //   - keepStar (default: true)        : 是否保留 n.star
  //   - keepPendingStar (default: true) : 是否保留 n._pendingStar
  function perfectReset(node, options){
    options = options || {};
    var keepStar = (options.keepStar !== false);
    var keepPendingStar = (options.keepPendingStar !== false);

    var n = clone(node||{});
    n.enhance = {str:0,dex:0,int:0,luk:0,atk:0,def:0,hp:0,mp:0};
    n.slotsUsed = 0;
    n.enhanceSuccess = 0;

    if (!keepStar) n.star = 0;
    if (!keepPendingStar && n._pendingStar!=null) delete n._pendingStar;

    return { ok:true, success:true, nextNode:n };
  }

  // ===== ★卷軸上限提升（最多 +10 格）=====
  var SLOT_AUGMENT_MAX   = 10;
  // 0~1 機率：100%, 70%, 40%, 25%, 10%, 5%, 4%, 2%, 1%, 0.5%
  var SLOT_AUGMENT_STEPS = [1.00,0.70,0.40,0.25,0.10,0.05,0.04,0.02,0.01,0.005];

  function isScrollableTypeNode(node){
    // 自動化：只要該裝備本來就有卷軸格（slotsMax>0）就允許做「上限提升」
    return hasScrollSlots(node);
  }

  function canAugmentSlots(node){
    if (!node) return { ok:false, reason:'no_node' };
    if (node.locked) return { ok:false, reason:'locked' };
    if (!isScrollableTypeNode(node)) return { ok:false, reason:'not_scrollable' };
    var succ = (node._slotAugSuccess|0);
    if (succ >= SLOT_AUGMENT_MAX) return { ok:false, reason:'cap' };
    var step = succ; // 0-based
    var chance = SLOT_AUGMENT_STEPS[step]||0;
    return { ok:true, chance: chance, step: step+1, left: (SLOT_AUGMENT_MAX - succ) };
  }

  // options: { rng:fn()->0~1 }
  function augmentSlots(node, options){
    var chk = canAugmentSlots(node);
    if (!chk.ok) return { ok:false, success:false, reason:chk.reason };
    options = options||{};
    var rng = (typeof options.rng === 'function') ? options.rng : Math.random;

    var pass = rng() < (chk.chance);
    var next = clone(node||{});
    if (pass){
      next.slotsMax = (next.slotsMax|0) + 1;                 // 上限 +1
      next._slotAugSuccess = (next._slotAugSuccess|0) + 1;   // 成功次數 +1
    }
    return { ok:true, success:pass, chance:chk.chance, step:chk.step, nextNode:next };
  }

  // ===== 對外 =====
  
  // =========================
  // ★資料驅動 UI Actions（由卷軸檔案決定顯示哪些按鈕）
  //  - equip_system 只要呼叫 getUIActions(ctx) 並把按鈕畫出來即可
  //  - 新增/修改卷軸 → 只改本檔案 DEF 與本區邏輯
  // ctx: { node, slotKey, invCount(name)->int, invUse(name,n)->bool }
  // 回傳: [{ id, label, itemName, itemCount, style, disabledReason, run(ctx)->{ok,msg,nextNode} }]
  function getUIActions(ctx){
    ctx = ctx||{};
    var node = ctx.node;
    var G = (typeof window!=='undefined')?window:((typeof globalThis!=='undefined')?globalThis:this);
    var invCount = (typeof ctx.invCount==='function') ? ctx.invCount : function(){return 0;};
    var invUse   = (typeof ctx.invUse==='function')   ? ctx.invUse   : function(){return false;};
    var out = [];
    if (!node) return out;

    var type = node.type;
    var isWeapon = equipIsWeaponLike(node);
    var isGlove  = (type==='glove');

    // 顯示順序：統一 / 手套 / 武器（依裝備類型）
    var ORDER_UNIFIED = ['屬性強化卷60%','屬性強化卷10%','屬性攻擊強化卷45%','屬性攻擊強化卷7%'];
    var ORDER_GLOVE   = ['手套強化卷60%','手套強化卷30%','手套強化卷7%'];
    var ORDER_WEAPON  = ['武器強化卷70%','武器強化卷30%','武器強化卷10%','武器強化卷1%'];
    var ORDER_CHAOS   = ['混沌卷軸60%','高級混沌卷軸60%','超級混沌卷5%'];

    var baseOrder = (!isWeapon && !isGlove) ? ORDER_UNIFIED : (isGlove ? ORDER_GLOVE : ORDER_WEAPON);

    function pushScroll(name){
      var chk = canUse(node, name);
      var d = DEF[name];
      var need = 1;
      var cnt = invCount(name)|0;

      var label = name.replace('強化','');

      out.push({
        id: 'scroll:' + name,
        label: label,
        itemName: name,
        itemCount: need,
        style: 'secondary',
        disabledReason: (!chk.ok ? chk.reason : (cnt<need ? 'no_item' : '')),
        run: function(runCtx){
          runCtx = runCtx||{};
          var n = runCtx.node || node;
          if (!n) return { ok:false, msg:'裝備不存在' };
          if (!invUse(name, need)) return { ok:false, msg:'缺少：' + name + ' ×' + need };

          // 混沌卷：成功時支援混沌選擇券（若有）
          if (DEF[name] && DEF[name].effGen){
            var pv = chaosPreview(n, name);
            if (!pv.ok) return { ok:false, msg:'混沌檢定失敗（狀態不符）' };

            // 失敗：照原本邏輯扣 1 次
            if (!pv.success){
              var nf = clone(n);
              nf.slotsUsed = (nf.slotsUsed|0) + 1;
              return { ok:true, msg: name + ' 失敗（卷軸次數 +1）｜已用 ' + nf.slotsUsed + '/' + (nf.slotsMax|0), nextNode: nf };
            }

            // 成功：若有混沌選擇券，改用彈窗內選擇（避免 confirm 在手機不彈）
            var ticketName = '混沌選擇券';
            var hasTicket = (invCount(ticketName)|0) > 0;

            if (hasTicket){
              // 先讓 UI 顯示選擇面板；選擇後才決定是否套用與是否扣次
              return { ok:true, msg:'混沌成功：請選擇是否套用', pending:{ kind:'chaos_choice', scrollName:name, ticketName:ticketName, effPreview:(pv.effPreview||{}), nodeSnapshot: clone(n) } };
            }

            var cm = chaosCommit(n, name, pv.effPreview, true);
            var next = cm.nextNode;

            next._lastChaosEff = pv.effPreview || null;
            next._lastChaosName = name;
            next._bestChaosEff = null; // 由外部若需要可再計算最佳
            next._scrollSuccessCount = (next._scrollSuccessCount|0) + 1;
            return { ok:true, msg: '混沌成功並套用（+1 次）', nextNode: next };
          }

          // 一般卷
          var res = apply(n, name);
          if (!res.ok){
            return { ok:false, msg:'不可使用：' + name + '（' + res.reason + '）' };
          }
          var nextNode = res.nextNode;
          // 統計成功/失敗次數（用於 UI 顯示）
          nextNode._scrollSuccessCount = (nextNode._scrollSuccessCount|0) + (res.success?1:0);
          nextNode._scrollFailCount = (nextNode._scrollFailCount|0) + (res.success?0:1);
          var tip = (res.success ? '卷軸強化成功' : '卷軸強化失敗');
          tip += '（成功率 ' + (res.rate|0) + '%｜已用 ' + (nextNode.slotsUsed|0) + '/' + (nextNode.slotsMax|0) + '）';
          return { ok:true, msg: tip, nextNode: nextNode };
        }
      });
    }

    // 主卷軸（依類型）
    for (var i=0;i<baseOrder.length;i++){
      if (DEF[baseOrder[i]]) pushScroll(baseOrder[i]);
    }

    // 混沌卷（兩顆）
    for (i=0;i<ORDER_CHAOS.length;i++){
      if (DEF[ORDER_CHAOS[i]]){
        // 混沌卷也要 slot 可用才顯示（可用則 push）
        var chk2 = canUse(node, ORDER_CHAOS[i]);
        if (chk2.ok || (node && (node.slotsMax|0)>0)) pushScroll(ORDER_CHAOS[i]);
      }
    }

    // 恢復卷（50% 恢復失敗次數 -1）
    out.push({
      id:'scroll:recover_failed_once',
      label:'恢復卷（-1 失敗次數｜50%）',
      itemName:'恢復卷軸',
      itemCount:1,
      style:'danger',
      disabledReason: ((invCount('恢復卷軸')|0)<=0 ? 'no_item' : ''),
      run:function(runCtx){
        runCtx=runCtx||{};
        var n=runCtx.node||node;
        if(!n) return {ok:false,msg:'裝備不存在'};
        if(!invUse('恢復卷軸',1)) return {ok:false,msg:'缺少：恢復卷軸 ×1'};
        var r=recoverFailedOnce(n);
        if(!r.ok) return {ok:false,msg:(r.reason==='locked'?'裝備未解鎖':'沒有可恢復的失敗次數')};
        return {ok:true,msg:(r.success?'恢復成功（-1 失敗次數）':'恢復失敗（機率 50%）'),nextNode:r.nextNode, countSucc: 0};
      }
    });

    // 完美重置卷
    out.push({
      id:'scroll:perfect_reset',
      label:'重置卷（重置卷軸狀態）',
      itemName:'完美重置卷軸',
      itemCount:1,
      style:'ghost',
      disabledReason: ((invCount('完美重置卷軸')|0)<=0 ? 'no_item' : ''),
      run:function(runCtx){
        runCtx=runCtx||{};
        var n=runCtx.node||node;
        if(!n) return {ok:false,msg:'裝備不存在'};
        if(!invUse('完美重置卷軸',1)) return {ok:false,msg:'缺少：完美重置卷軸 ×1'};
        var r=perfectReset(n);
        if(!r.ok) return {ok:false,msg:'重置失敗（狀態不符）'};
        return {ok:true,msg:'重置完成',nextNode:r.nextNode, resetSucc: true};
      }
    });

    // 卷軸上限提升
    out.push({
      id:'scroll:augment_slots',
      label:'卷軸上限提升（+1）',
      itemName:'卷軸上限提升',
      itemCount:1,
      style:'secondary',
      disabledReason: (!canAugmentSlots(node).ok ? 'cant' : ((invCount('卷軸上限提升')|0)<=0 ? 'no_item' : '')),
      run:function(runCtx){
        runCtx=runCtx||{};
        var n=runCtx.node||node;
        var chk=canAugmentSlots(n);
        if(!chk.ok) return {ok:false,msg:'不可提升（已達上限或狀態不符）'};
        if(!invUse('卷軸上限提升',1)) return {ok:false,msg:'缺少：卷軸上限提升 ×1'};
        var r=augmentSlots(n);
        if(!r.ok) return {ok:false,msg:'提升失敗'};
        // 注意：提升失敗也是 ok:true（表示已消耗道具並完成一次嘗試）
        if(!r.success){
          return {ok:true,msg:'卷軸上限提升失敗（機率 ' + Math.round((r.chance||0)*100) + '%）',nextNode:r.nextNode, countSucc: 0};
        }
        return {ok:true,msg:'卷軸上限提升成功（+1）',nextNode:r.nextNode, countSucc: 0};
      }
    });

    // 只保留「可顯示」的：若 disabledReason 是 wrong_type/not_found 可過濾
    // 這裡不過濾，交給 UI 層自己決定要不要顯示 disabled。
    return out;
  }


  // =========================
  // UI: 卷軸彈窗（僅 UI，不改原邏輯）
  // 由外部傳入 ctx：{ type, node?, getNode?, saveNode(nextNode), invCount(name), invUse(name,n), onMsg?, onRerender? }
  // =========================
  function openScrollModal(ctx){
    ctx = ctx || {};
    var getNode = (typeof ctx.getNode === 'function') ? ctx.getNode : function(){ return ctx.node || null; };
    var saveNode = (typeof ctx.saveNode === 'function') ? ctx.saveNode : function(){};
    var G = (typeof window!=='undefined')?window:((typeof globalThis!=='undefined')?globalThis:this);
    var invCount = (typeof ctx.invCount === 'function') ? ctx.invCount : function(name){
      try{
        if (G && typeof G.getItemQuantity==='function') return (G.getItemQuantity(name)|0);
        if (G && G.Inventory && typeof G.Inventory.get==='function') return (G.Inventory.get(name)|0);
      }catch(_){ }
      return 0;
    };
    var invUse = (typeof ctx.invUse === 'function') ? ctx.invUse : function(name, qty){
      qty = qty|0; if(qty<=0) qty=1;
      var have = invCount(name)|0;
      if (have < qty) return false;
      try{
        if (G && typeof G.removeItem==='function'){ G.removeItem(name, qty); return true; }
        if (G && G.Inventory && typeof G.Inventory.remove==='function'){ G.Inventory.remove(name, qty); return true; }
      }catch(_){ }
      return false;
    };
    // 不再依賴 alert/confirm（手機 WebView 常被擋），改用「混沌紀錄」上方的 log 顯示。
    // 若外部仍提供 onMsg，會一併呼叫（例如你想顯示 toast）。
    var onMsg = function(_t){}; // UI 以 modal 內的操作紀錄為主，不再使用外部 alert/toast
    var onRerender = (typeof ctx.onRerender === 'function') ? ctx.onRerender : function(){};

    var node = getNode();
    if(!node){ onMsg('裝備不存在'); return; }

    // ===== 本地持久化索引（以裝備 id/key/uid 當索引）=====
var equipKey = String((node && (node.id || node.key || node.uid || node.uuid || node.name)) || 'equip');
var LOG_KEY  = '__SF_SCROLL_UI_LOG__:' + equipKey;
var SUCC_KEY = '__SF_SCROLL_UI_SUCC__:' + equipKey;

// 載入本地持久化的操作紀錄（最多 20 筆）
try{
  var raw0 = localStorage.getItem(LOG_KEY);
  if(raw0){
    var arr0 = JSON.parse(raw0);
    if(Array.isArray(arr0)){
      // 舊版可能是 string[]，這裡統一轉成 {msg,type,ts}
      uiLogs = arr0.map(function(x){
        if(x && typeof x === 'object' && x.msg) return x;
        return { msg: String(x||''), type: 'info', ts: Date.now() };
      }).filter(function(x){ return x && x.msg; }).slice(0,20);
    }
  }
}catch(_){}

// 載入成功次數（避免外部 saveNode 丟棄自訂欄位）
try{
  uiSucc = parseInt(localStorage.getItem(SUCC_KEY)||'0',10) || 0;
}catch(_){ uiSucc = 0; }

// 若裝備本身有記錄，優先使用；否則用操作紀錄推回（排除恢復卷 / 上限提升）
try{
  if(node && node._scrollSuccApplied!=null){
    uiSucc = node._scrollSuccApplied|0;
  }else if(Array.isArray(uiLogs) && uiLogs.length){
    var c=0;
    for(var i=0;i<uiLogs.length;i++){
      var mm=String(uiLogs[i] && uiLogs[i].msg || '');
      if(mm.indexOf('卷軸強化成功')===0) c++;
      else if(mm.indexOf('混沌成功並套用')===0) c++;
    }
    uiSucc = c|0;
  }
}catch(_){}


// ===== UI 狀態 =====

    var pendingChaosChoice = null; // { panel, payload }
    var uiLogs = []; // modal-local logs (persist via localStorage)
    var uiSucc = 0; // 成功次數（持久化）

    function addLog(msg, type){
  try{
    msg = String(msg||'');
    if(!msg) return;
    type = String(type||'info');
    var item = { msg: msg, type: type, ts: Date.now() };

    uiLogs.unshift(item);
    if(uiLogs.length > 20) uiLogs.length = 20;

    // 持久化（以裝備 key）
    try{
      localStorage.setItem(LOG_KEY, JSON.stringify(uiLogs));
    }catch(_){}

    // 同步回 node（若外部保存不會丟欄位則也能保留）
    try{
      var n = getNode() || node;
      if(n){
        n._scrollLog = uiLogs.slice(0);
        saveNode(n);
        node = n;
      }
    }catch(_){}
  }catch(_){}
}

    // overlay
    var ov = document.createElement('div');
    ov.className = 'sfv2-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px;';
    var md = document.createElement('div');
    md.className = 'sfv2-md';
    md.style.cssText = 'width:min(520px,96vw);max-height:86vh;overflow:auto;background:rgba(10,16,30,.96);border:1px solid rgba(255,255,255,.10);border-radius:16px;box-shadow:0 20px 80px rgba(0,0,0,.45);padding:12px 12px 14px;color:rgba(235,245,255,.92);';
    ov.appendChild(md);

    // inject modal css (responsive + unified)
    (function(){
      try{
        if(document.getElementById('sfv2-scroll-style')) return;
        var st = document.createElement('style');
        st.id = 'sfv2-scroll-style';
        st.textContent =
          '.sfv2-md{font-size:13px;}' +
          '.sfv2-pill{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);border-radius:999px;padding:5px 9px;font:900 11px ui-monospace,monospace;letter-spacing:.2px;white-space:nowrap;}' +
          '.sfv2-pill.rich{font:700 13px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji";padding:10px 12px;border-radius:14px;white-space:normal;}' +
          '.sfv2-hint{margin-top:8px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);color:rgba(235,245,255,.72);font-size:12px;line-height:1.35;}' +
          '.sfv2-log-ok{border-color:rgba(60,255,160,.25);background:rgba(60,255,160,.10);}' +
          '.sfv2-log-bad{border-color:rgba(255,90,90,.25);background:rgba(255,90,90,.10);}' +
          '.sfv2-log-warn{border-color:rgba(255,210,90,.22);background:rgba(255,210,90,.08);}' +
          '@media (max-width:420px){' +
            '.sfv2-md{padding:10px 10px 12px;}' +
            '.sfv2-pill{padding:4px 8px;font-size:10.5px;}' +
            '.sfv2-pill.rich{padding:9px 10px;font-size:12.5px;}' +
          '}';
        document.head.appendChild(st);
      }catch(_){}
    })();


    function h(tag, txt, css){
      var el = document.createElement(tag);
      if (txt!=null) el.textContent = txt;
      if (css) el.style.cssText = css;
      return el;
    }
    function pill(txt){
      var el=h('div', txt, '');
      el.className='sfv2-pill';
      return el;
    }
    function btn(txt, fn, disabled){
      var b = document.createElement('button');
      b.type='button';
      b.textContent = txt;
      b.disabled = !!disabled;
      b.style.cssText = 'width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg, rgba(70,150,255,.25), rgba(40,90,190,.18));color:#eaf2ff;font-weight:900;padding:12px 10px;cursor:pointer;opacity:'+(disabled?'.45':'1')+';';
      b.onclick = function(e){ e.preventDefault(); if(disabled) return; fn && fn(); };
      return b;
    }

    // header
    var top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;';
    top.appendChild(h('div','卷軸','font-weight:900;font-size:16px;letter-spacing:.5px;'));
    var x = document.createElement('button');
    x.type='button';
    x.textContent='✕';
    x.style.cssText='width:36px;height:36px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#eaf2ff;font-weight:900;cursor:pointer;';
    function closeModal(){
      try{
        // 若還在等混沌套用選擇 → 視為取消
        if(pendingChaosChoice && pendingChaosChoice.panel && pendingChaosChoice.panel.parentNode){
          pendingChaosChoice.panel.parentNode.removeChild(pendingChaosChoice.panel);
        }
        if(pendingChaosChoice){
          addLog('已取消混沌套用（關閉視窗）');
          pendingChaosChoice = null;
        }
      }catch(_){ }
      try{ document.body.removeChild(ov);}catch(_){ }
    }
    x.onclick=function(){ closeModal(); };
    top.appendChild(x);
    md.appendChild(top);

    // info lines
    var info = document.createElement('div');
    info.style.cssText='margin-top:10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:14px;padding:10px;';
    md.appendChild(info);

    // log box (卷軸使用記錄)
    var logBox = document.createElement('div');
    logBox.style.cssText='margin-top:10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:14px;padding:10px;';
    md.appendChild(logBox);

    function fmtSigned(n){
      n = n|0;
      if (n>0) return '+'+n;
      return String(n);
    }
    function fmtLine(label, baseVal, scrollVal){
      baseVal = baseVal|0; scrollVal = scrollVal|0;
      // text fallback
      return label+' '+baseVal+' '+fmtSigned(scrollVal);
    }
    function pillRich(html){
      var el = document.createElement('div');
      el.style.cssText='border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);border-radius:999px;padding:6px 10px;font:900 12px ui-monospace,monospace;letter-spacing:.2px;';
      el.innerHTML = html;
      return el;
    }
    function statHtml(label, baseVal, scrollVal){
      baseVal = baseVal|0; scrollVal = scrollVal|0;
      var total = (baseVal + scrollVal)|0;

      // 括號內顯示「卷軸提升」：正數金色、負數紅色、0 灰色
      var deltaTxt = (scrollVal>0?('+'+scrollVal):String(scrollVal));
      var deltaColor = (scrollVal>0)?'#FFD36A':(scrollVal<0?'#FF6B6B':'rgba(229,231,235,.55)');

      return '<span style="opacity:.85;margin-right:6px;">'+label+'</span>' +
             '<span style="font-weight:900;color:rgba(234,242,255,.95);">'+total+'</span>' +
             '<span style="margin-left:6px;font-weight:900;color:'+deltaColor+';">(' + deltaTxt + ')</span>';
    }

    
    function safeJson(o){
      try{ return JSON.stringify(o); }catch(_){ return String(o); }
    }

    // 混沌選擇券：用自訂小視窗取代 confirm（避免手機 WebView 不彈）
    function showChaosChoice(p){
      // p: { kind:'chaos_choice', scrollName, ticketName, effPreview, nodeSnapshot }
      try{
        if(!p) return;
        // 防呆：一次只允許一個 pending
        if(pendingChaosChoice){
          addLog('尚未選擇混沌套用，請先套用或取消');
          return;
        }
        var panel = document.createElement('div');
        panel.style.cssText='margin-top:10px;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);';
        var title = document.createElement('div');
        title.style.cssText='font-weight:900;font-size:14px;letter-spacing:.5px;margin-bottom:8px;';
        title.textContent='混沌成功！是否套用結果？';
        panel.appendChild(title);

        var pre = document.createElement('div');
        pre.style.cssText='margin-bottom:10px;';
        var preTitle = document.createElement('div');
        preTitle.style.cssText='font-weight:900;font-size:12px;opacity:.9;margin-bottom:6px;';
        preTitle.textContent='結果預覽';
        pre.appendChild(preTitle);

        function chaosMaxMap(scrollName){
          // 用於「最高值」金色提示（依卷軸類型）
          if(scrollName==='高級混沌卷軸60%') return { main:12, atk:12, hp:100, def:30 };
          if(scrollName==='超級混沌卷5%')    return { main:20, atk:25, hp:100, def:30 };
          return { main:15, atk:15, hp:100, def:30 }; // 標準混沌
        }
        var maxMap = chaosMaxMap(p.scrollName);
        function chip(label, v){
          v = Number(v||0);
          var max = null;
          if(label==='ATK') max = maxMap.atk;
          else if(label==='HP') max = maxMap.hp;
          else if(label==='DEF') max = maxMap.def;
          else max = maxMap.main; // STR/DEX/INT/LUK
          var col = (v>0)?'#7CFFB2':(v<0?'#FF6B6B':'rgba(229,231,235,.75)');
          if(max!=null && v===max) col = '#FFD36A';
          var d = document.createElement('div');
          d.style.cssText='border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);border-radius:10px;padding:6px 10px;font:900 12px ui-monospace,monospace;color:'+col+';display:flex;gap:8px;align-items:center;';
          var k = document.createElement('span'); k.textContent = label;
          k.style.opacity='.9';
          var vv = document.createElement('span');
          vv.textContent = (v>=0?'+':'') + v;
          vv.style.marginLeft='auto';
          d.appendChild(k); d.appendChild(vv);
          return d;
        }

        var gridPrev = document.createElement('div');
        gridPrev.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;';
        var effp = p.effPreview||{};
        gridPrev.appendChild(chip('STR', effp.str));
        gridPrev.appendChild(chip('DEX', effp.dex));
        gridPrev.appendChild(chip('INT', effp.int));
        gridPrev.appendChild(chip('LUK', effp.luk));
        gridPrev.appendChild(chip('ATK', effp.atk));
        gridPrev.appendChild(chip('HP',  effp.hp));
        gridPrev.appendChild(chip('DEF', effp.def));
        // 如果有其它欄位，補到最後
        pre.appendChild(gridPrev);
        panel.appendChild(pre);

        var tn2 = p.ticketName||'混沌選擇券';
        var note = document.createElement('div');
        note.style.cssText='font-size:12px;opacity:.8;margin-bottom:10px;';
        note.textContent='（選擇後會消耗 ' + tn2 + ' ×1） 目前持有：' + (invCount(tn2)|0);
        panel.appendChild(note);

        var row = document.createElement('div');
        row.style.cssText='display:flex;gap:10px;';
        var bApply = btn('套用（+1 次）', function(){
          if((invCount(tn2)|0) > 0) invUse(tn2, 1);
          var base = getNode() || p.nodeSnapshot;
          var cm = chaosCommit(base, p.scrollName, p.effPreview, true);
          var next = cm.nextNode;
          next._lastChaosEff = p.effPreview || null;
          next._lastChaosName = p.scrollName;
          saveNode(next);
          addLog('混沌成功並套用（+1 次）');
          try{ uiSucc=(uiSucc|0)+1; localStorage.setItem(SUCC_KEY, String(uiSucc)); }catch(_){ }
          
          if(panel && panel.parentNode) panel.parentNode.removeChild(panel);
          pendingChaosChoice = null;
          node = getNode() || node;
          renderInfo(); renderLog(); renderChaos(); renderActions();
          onRerender();
        }, false);

        var bSkip = btn('不套用（不扣次）', function(){
          if((invCount(tn2)|0) > 0) invUse(tn2, 1);
          addLog('混沌成功但未套用（不扣次）');
          
          if(panel && panel.parentNode) panel.parentNode.removeChild(panel);
          pendingChaosChoice = null;
          node = getNode() || node;
          renderInfo(); renderLog(); renderChaos(); renderActions();
          onRerender();
        }, false);

        bApply.style.flex='1';
        bSkip.style.flex='1';
        row.appendChild(bApply);
        row.appendChild(bSkip);
        panel.appendChild(row);

        // 插到 actions 區塊最上方
        act.insertBefore(panel, act.firstChild ? act.firstChild.nextSibling : null);
        pendingChaosChoice = { panel: panel, payload: p };
        // 有 pending 時，立即把現有卷軸按鈕鎖住（避免使用者繼續衝卷）
        try{
          var btns = act.querySelectorAll('button');
          for(var bi=0; bi<btns.length; bi++){
            // 保留 panel 內的兩顆選擇按鈕可按
            if(panel.contains(btns[bi])) continue;
            btns[bi].disabled = true;
            btns[bi].style.opacity = '.45';
            btns[bi].style.cursor = 'default';
          }
        }catch(_){ }
      }catch(e){
        try{ addLog('混沌選擇介面建立失敗'); }catch(_){}
        
        console.error(e);
      }
    }
function renderInfo(){
  info.innerHTML='';
  node = getNode() || node;

  var base = node.base || {};
  var enh  = node.enhance || {};

  // ===== 頂端摘要 =====
  var row1 = document.createElement('div');
  row1.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;';
  var row1L = document.createElement('div');
  row1L.style.cssText='display:flex;flex-wrap:wrap;gap:8px;';
  row1L.appendChild(pill('卷軸 ' + (node.slotsUsed|0) + '/' + (node.slotsMax|0)));
  row1L.appendChild(pill('擴充 ' + (node._slotAugSuccess|0) + '/' + (SLOT_AUGMENT_MAX|0)));
  row1.appendChild(row1L);

  var succCnt = (node && node._scrollSuccApplied!=null) ? (node._scrollSuccApplied|0) : (uiSucc|0);
  // 同步到 uiSucc，避免顯示不一致
  uiSucc = succCnt|0;
  row1.appendChild(pill('成功 ' + succCnt));
  info.appendChild(row1);

  var hint = document.createElement('div');
  hint.className='sfv2-hint';
  hint.textContent='提示：此視窗僅顯示「裝備基礎（不含星力 / 星火 / 潛能）＋卷軸」的變化。若你在裝備總覽看到的數值不同，通常是因為星力、星火或其他系統加成。';
  info.appendChild(hint);

  // ===== 能力：固定格子（兩行各 4 格）=====
  var grid = document.createElement('div');
  grid.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;';
  info.appendChild(grid);

  function addStat(label, b, e){
    var el = pillRich(statHtml(label, b||0, e||0));
    el.style.minHeight = '34px';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.textAlign = 'center';
    grid.appendChild(el);
  }

  // 第一行：四大主屬性
  addStat('STR', base.str, enh.str);
  addStat('DEX', base.dex, enh.dex);
  addStat('INT', base.int, enh.int);
  addStat('LUK', base.luk, enh.luk);

  // 第二行：ATK / DEF / HP / MP
  addStat('ATK', base.atk, enh.atk);
  addStat('DEF', base.def, enh.def);
  addStat('HP',  base.hp,  enh.hp);
  addStat('MP',  base.mp,  enh.mp);
}
function renderLog(){
      logBox.innerHTML='';
      node = getNode() || node;

      logBox.appendChild(h('div','卷軸使用記錄','font-weight:900;font-size:13px;opacity:.9;'));

      var logTitleRow = document.createElement('div');
      logTitleRow.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;';
      var lt = document.createElement('div');
      lt.style.cssText='font-size:12px;opacity:.8;';
      lt.textContent='操作紀錄';
      logTitleRow.appendChild(lt);

      var logToggle = document.createElement('button');
      logToggle.type='button';
      logToggle.style.cssText='border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#eaf2ff;font-weight:900;border-radius:10px;padding:6px 10px;cursor:pointer;font-size:12px;';
      logToggle.textContent='展開';
      logTitleRow.appendChild(logToggle);
      logBox.appendChild(logTitleRow);

      var logList = document.createElement('div');
      // 預設只顯示約 4 行
      logList.style.cssText='display:flex;flex-direction:column;gap:6px;max-height:92px;overflow:hidden;margin-top:8px;';
      var isOpen = false;
      logToggle.onclick=function(e){
        e.preventDefault();
        isOpen = !isOpen;
        logToggle.textContent = isOpen ? '收合' : '展開';
        logList.style.maxHeight = isOpen ? '260px' : '92px';
        logList.style.overflow = isOpen ? 'auto' : 'hidden';
      };

      var logs = Array.isArray(uiLogs) ? uiLogs : [];
if(!logs.length){
  logList.appendChild(h('div','尚無操作紀錄','opacity:.75;font-size:12px;'));
  logToggle.disabled = true;
  logToggle.style.opacity = '.45';
  logToggle.style.cursor = 'default';
} else {
  for(var li=0; li<logs.length && li<20; li++){
    var it = logs[li];
    var msg = (it && typeof it === 'object') ? String(it.msg||'') : String(it||'');
    var tp  = (it && typeof it === 'object') ? String(it.type||'info') : 'info';
    if(!msg) continue;

    var bg = 'rgba(255,255,255,.04)';
    var bd = 'rgba(255,255,255,.10)';
    var col = 'rgba(235,245,255,.90)';
    if(tp==='ok'){ bg='rgba(70,255,170,.10)'; bd='rgba(120,255,200,.22)'; col='#DFFFEF'; }
    else if(tp==='bad'){ bg='rgba(255,80,80,.10)'; bd='rgba(255,120,120,.22)'; col='#FFE5E5'; }

    var row = document.createElement('div');
    if(tp==='ok') row.className='sfv2-log-ok';
    else if(tp==='bad') row.className='sfv2-log-bad';
    else if(tp==='warn') row.className='sfv2-log-warn';
    row.style.cssText='font-size:12px;line-height:1.35;border:1px solid '+bd+';background:'+bg+';border-radius:12px;padding:8px 10px;color:'+col+';';
    row.textContent = msg;
    logList.appendChild(row);
  }
}
logBox.appendChild(logList);

    }

    // chaos record (only show when chaos used)
    var chaosBox = document.createElement('div');
    chaosBox.style.cssText='margin-top:10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:14px;padding:10px;';
    md.appendChild(chaosBox);

    function chaosMaxMapByName(scrollName){
      if(scrollName==='高級混沌卷軸60%') return { main:12, atk:12, hp:100, def:30 };
      if(scrollName==='超級混沌卷5%')    return { main:20, atk:25, hp:100, def:30 };
      return { main:15, atk:15, hp:100, def:30 };
    }

    function renderChaos(){
      chaosBox.innerHTML='';
      node = getNode() || node;

      chaosBox.appendChild(h('div','混沌卷當次紀錄','font-weight:900;font-size:13px;opacity:.9;'));

      var eff = node._lastChaosEff || null;
      if(!eff){
        chaosBox.appendChild(h('div','尚無混沌卷紀錄','margin-top:8px;opacity:.75;font-size:12px;'));
        return;
      }

      var sub = document.createElement('div');
      sub.style.cssText='margin-top:8px;font-size:12px;opacity:.8;';
      sub.textContent = '最近一次：' + (node._lastChaosName || '混沌卷');
      chaosBox.appendChild(sub);

      var maxMap = chaosMaxMapByName(node._lastChaosName);
      function chip(label, v){
        v = Number(v||0);
        var max = null;
        if(label==='ATK') max = maxMap.atk;
        else if(label==='HP') max = maxMap.hp;
        else if(label==='DEF') max = maxMap.def;
        else max = maxMap.main;
        var col = (v>0)?'#7CFFB2':(v<0?'#FF6B6B':'rgba(229,231,235,.75)');
        if(max!=null && v===max) col = '#FFD36A';
        var d = document.createElement('div');
        d.style.cssText='border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);border-radius:10px;padding:6px 10px;font:900 12px ui-monospace,monospace;color:'+col+';display:flex;gap:8px;align-items:center;';
        var k = document.createElement('span'); k.textContent = label; k.style.opacity='.9';
        var vv = document.createElement('span'); vv.textContent = (v>=0?'+':'')+v; vv.style.marginLeft='auto';
        d.appendChild(k); d.appendChild(vv);
        return d;
      }

      var grid = document.createElement('div');
      grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;';
      grid.appendChild(chip('STR', eff.str));
      grid.appendChild(chip('DEX', eff.dex));
      grid.appendChild(chip('INT', eff.int));
      grid.appendChild(chip('LUK', eff.luk));
      grid.appendChild(chip('ATK', eff.atk));
      grid.appendChild(chip('HP',  eff.hp));
      grid.appendChild(chip('DEF', eff.def));
      chaosBox.appendChild(grid);
    }


    // actions
    var act = document.createElement('div');
    act.style.cssText='margin-top:10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:14px;padding:10px;';
    md.appendChild(act);

    function inferLogType(msg, ok){
  msg = String(msg||'');
  if(ok===false) return 'bad';
  if(msg.indexOf('失敗')>=0 || msg.indexOf('不可使用')>=0) return 'bad';
  if(msg.indexOf('成功')>=0) return 'ok';
  return 'info';
}

function tidyMsg(msg){
  msg = String(msg||'');
  // 移除內部 reason code，例如（no_slot）
  msg = msg.replace(/\s*\((no_slot|wrong_type|locked|not_found|not_scrollable|no_item|cap|no_failed_slots)\)\s*$/,'');
  // 將「不可使用：XXX（reason）」轉成玩家可讀
  msg = msg.replace(/不可使用：(.+?)\s*\(([^\)]+)\)\s*$/ , function(_, name, reason){
    var r = String(reason||'');
    var map = {
      'no_slot':'沒有卷軸格數（已用完）',
      'wrong_type':'此裝備無法使用該卷軸',
      'locked':'裝備未解鎖',
      'no_item':'背包數量不足',
      'not_scrollable':'此裝備不可衝卷'
    };
    return '不可使用：' + String(name||'') + '（' + (map[r]||'條件不足') + '）';
  });
  return msg;
}

function applyResultMeta(r){
  try{
    if(!r) return;
    // 重置：清空此裝備的成功次數
    if(r.resetSucc){
      uiSucc = 0;
      try{ if(node) node._scrollSuccApplied = 0; }catch(_){}
      try{ localStorage.setItem(SUCC_KEY, String(uiSucc)); }catch(_){}
      return;
    }
    // 只計入「真正套用卷軸成功」（含混沌套用成功），不含恢復卷、不含上限提升
    if(r.countSucc){
      uiSucc = (uiSucc|0) + 1;
      try{ if(node) node._scrollSuccApplied = uiSucc; }catch(_){}
      try{ localStorage.setItem(SUCC_KEY, String(uiSucc)); }catch(_){}
    }
  }catch(_){}
}

function renderActions(){
      act.innerHTML='';
      node = getNode() || node;

      act.appendChild(h('div','可用卷軸','font-weight:900;font-size:13px;opacity:.9;'));

      if(pendingChaosChoice){
        var lockHint = document.createElement('div');
        lockHint.style.cssText='margin-top:8px;margin-bottom:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);border-radius:12px;padding:8px;font-size:12px;opacity:.9;';
        lockHint.textContent='⚠️ 尚未選擇「混沌是否套用」，請先在上方選擇「套用 / 不套用」，否則無法繼續衝卷。';
        act.appendChild(lockHint);
      }
      var grid = document.createElement('div');
      grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;';
      act.appendChild(grid);

      // 使用核心的 UI actions（若有）
      var actions = (typeof getUIActions==='function') ? getUIActions({ node: node, invCount: invCount, invUse: invUse }) : [];
      // 只顯示「卷軸 / 混沌 / 恢復 / 重置 / 上限」等 action
      for(var i=0;i<actions.length;i++){
        (function(a){
          if(!a || !a.label) return;
          var countTxt = '';
          if(a.itemName) countTxt = '（'+invCount(a.itemName)+'）';
          var isLocked = !!pendingChaosChoice;
          var b = btn(a.label + countTxt, function(){
            if(pendingChaosChoice){
              addLog('尚未選擇混沌套用，請先套用或取消');
              renderChaos();
              return;
            }
            // 混沌：需要 preview+選擇券處理（由 core 的 action.run 已包好）
            var r = a.run({ node: node });
            if(r && r.pending && r.pending.kind==='chaos_choice'){
              showChaosChoice(r.pending);
              return;
            }
            if(!r || !r.ok){
              addLog(tidyMsg((r&&r.msg)||'操作失敗'), inferLogType((r&&r.msg)||'操作失敗', false));
              
              renderChaos();
              return;
            }
            if(r.nextNode){
              saveNode(r.nextNode);
            }
            var _m = tidyMsg(r.msg||'完成');
            addLog(_m, inferLogType(_m, true));
            applyResultMeta(r);
            
            // 重抓 node
            node = getNode() || node;
            renderInfo(); renderLog(); renderChaos(); renderActions();
            onRerender();
          }, (a.disabled || isLocked));
          grid.appendChild(b);
        })(actions[i]);
      }
    }

    renderInfo();
    renderLog();
    renderChaos();
    renderActions();

    document.body.appendChild(ov);
  }


return {
    def: DEF,
    getUIActions: getUIActions,
    openScrollModal: openScrollModal,
    canUse: canUse,
    apply: apply,
    recoverFailedOnce: recoverFailedOnce,
    perfectReset: perfectReset,
    chaosMainProb: chaosMainProb,
    chaosSuperMainProb: chaosSuperMainProb,
    chaosSuperAtkProb: chaosSuperAtkProb,
    chaosPreview: chaosPreview,
    chaosCommit: chaosCommit,
 
    // ★卷軸上限提升
    canAugmentSlots: canAugmentSlots,
    augmentSlots: augmentSlots,

    // ★機率查詢／覆寫
    augmentMax: SLOT_AUGMENT_MAX,
    augmentSteps: SLOT_AUGMENT_STEPS.slice(), // 0~1
    getAugmentChances: function(){
      var out=[], i, x;
      for(i=0;i<SLOT_AUGMENT_STEPS.length;i++){
        x=SLOT_AUGMENT_STEPS[i];
        out.push(Math.round((x*100)*100)/100); // 轉百分比、保留兩位
      }
      return out;
    },
    setAugmentChances: function(arr){
      if (Array.isArray(arr) && arr.length){
        SLOT_AUGMENT_STEPS = arr.slice();
      }
    }
  };
});