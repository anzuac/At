;(function(w){
'use strict';

// === FlameCore (ES5) — 星火核心（抽池 + 機率 + 不重複 + 1~4條）===
// 提供：FlameCore.generate(itemName, equip) / FlameCore.toText(flame) / FlameCore.linesToFlat(flame)
//       FlameCore.isWeapon(equip) / FlameCore.rebuildAll(equipsObj)
//
// 設定：
// - 條數：1=40% 2=40% 3=15% 4=5%
// - 一般星火(T1~T4)：T4=3% T3=20% T2/T1 均分剩下
// - 高級星火(T1~T7)：T7=1% T6=5% T5=10% T4=15% T3=20% T2/T1 均分剩下
// - 永恆星火(T1~T7)：T7=3% T6=5% T5=10% T1~T4 平均剩下
//
// 抽池：依你提供的表格分「武器 / 其他裝備」；每個詞條不重複。
// - 武器：STR/DEX/INT/LUK、雙屬(任兩種)、最大HP、最大MP、攻擊力
// - 其他裝備：STR/DEX/INT/LUK、雙屬(任兩種)、最大HP、最大MP、防禦力、攻擊力
//
// 數值（維持你現行版本常見對應）：
// - 單屬：+ (10 * T)
// - 雙屬：每個屬性 + (5 * T)（同一條同時加兩項）
// - HP：+ (1000 * T)
// - MP：+ (50 * T)
// - 防禦：+ (5 * T)
// - 攻擊：武器 + (33 * T)；其他裝備 + (1 * T)

var FlameConfig = {
  lineCountProb: [ [1,0.40],[2,0.40],[3,0.15],[4,0.05] ],
  tierDist: {
    normal:  { maxTier:4,  dist:[ [4,0.03],[3,0.20],[2,0.385],[1,0.385] ] },
    advanced:{ maxTier:7,  dist:[ [7,0.01],[6,0.05],[5,0.10],[4,0.15],[3,0.20],[2,0.245],[1,0.245] ] },
    eternal: { maxTier:7,  dist:[ [7,0.03],[6,0.05],[5,0.10],[4,0.205],[3,0.205],[2,0.205],[1,0.205] ] }
  }
  ,tierOrder: ['R','SR','SSR','UR','LR','SLR']
  ,tierStrengthMult: { R:1, SR:1, SSR:1, UR:1, LR:1, SLR:1 }
};

function rand(){ return Math.random(); }

function pickWeightedPairs(pairs){
  var r = rand(), acc=0;
  for (var i=0;i<pairs.length;i++){
    acc += pairs[i][1];
    if (r <= acc) return pairs[i][0];
  }
  return pairs.length ? pairs[pairs.length-1][0] : null;
}

function clamp(n, lo, hi){ return n<lo?lo:(n>hi?hi:n); }

function getMode(itemName){
  itemName = String(itemName||'');
  if (itemName.indexOf('永恆')>=0) return 'eternal';
  if (itemName.indexOf('高級')>=0) return 'advanced';
  return 'normal';
}

function rollTierByMode(itemName){
  var mode = getMode(itemName);
  var info = FlameConfig.tierDist[mode] || FlameConfig.tierDist.normal;
  var t = pickWeightedPairs(info.dist);
  t = clamp(Number(t||1)||1, 1, info.maxTier||7);
  return t;
}

function rollLineCount(){
  return pickWeightedPairs(FlameConfig.lineCountProb) || 1;
}

// 你專案的武器判斷可能不同；先提供多種相容
function isWeapon(equip){
  if (!equip) return false;
  var t = equip.type ? String(equip.type).toLowerCase() : "";
  if (t === "weapon" || t === "subweapon") return true;
  var s = equip.slot ? String(equip.slot).toLowerCase() : "";
  if (s === "weapon" || s === "subweapon") return true;
  if (equip.isWeapon === true || equip.isSubweapon === true) return true;
  return false;
}

function pushLine(out, key, label, value, tier){
  out.push({ key:key, label:label, value:value, tier:tier, channel:'flame' });
}

function makeSingleStatEntry(statKey, label){
  return {
    id: statKey,
    label: label,
    apply: function(tier, out, mult){
      mult = (mult==null)?1:Number(mult)||1;
      pushLine(out, statKey, label, Math.round(10*tier*mult), tier);
    }
  };
}

function makeDualStatEntry(a, b, label){
  var key = a + '+' + b;
  return {
    id: key,
    label: label,
    apply: function(tier, out, mult){
      mult = (mult==null)?1:Number(mult)||1;
      // 這一條同時加兩項，linesToFlat 會拆 key
      pushLine(out, key, label, Math.round(5*tier*mult), tier);
    }
  };
}

var STAT_NAME = { STR:'力量', DEX:'敏捷', INT:'智力', LUK:'幸運' };

var ENTRY_STR = makeSingleStatEntry('STR', STAT_NAME.STR);
var ENTRY_DEX = makeSingleStatEntry('DEX', STAT_NAME.DEX);
var ENTRY_INT = makeSingleStatEntry('INT', STAT_NAME.INT);
var ENTRY_LUK = makeSingleStatEntry('LUK', STAT_NAME.LUK);

var ENTRY_STR_DEX = makeDualStatEntry('STR','DEX','STR+DEX');
var ENTRY_STR_INT = makeDualStatEntry('STR','INT','STR+INT');
var ENTRY_STR_LUK = makeDualStatEntry('STR','LUK','STR+LUK');
var ENTRY_DEX_INT = makeDualStatEntry('DEX','INT','DEX+INT');
var ENTRY_DEX_LUK = makeDualStatEntry('DEX','LUK','DEX+LUK');
var ENTRY_INT_LUK = makeDualStatEntry('INT','LUK','INT+LUK');

var ENTRY_HP = { id:'HP', label:'最大 HP', apply:function(t,out,m){ m=(m==null)?1:Number(m)||1; pushLine(out,'HP','最大 HP',Math.round(1000*t*m),t); } };
var ENTRY_MP = { id:'MP', label:'最大 MP', apply:function(t,out,m){ m=(m==null)?1:Number(m)||1; pushLine(out,'MP','最大 MP',Math.round(50*t*m),t); } };

var ENTRY_DEF = { id:'DEF', label:'防禦力', apply:function(t,out,m){ m=(m==null)?1:Number(m)||1; pushLine(out,'DEF','防禦力',Math.round(5*t*m),t); } };

var ENTRY_ATK_OTHER = { id:'ATK', label:'攻擊力', apply:function(t,out,m){ m=(m==null)?1:Number(m)||1; pushLine(out,'ATK','攻擊力',Math.round(1*t*m),t); } };
var ENTRY_ATK_WEAPON = { id:'W_ATK', label:'攻擊力', apply:function(t,out,m){ m=(m==null)?1:Number(m)||1; pushLine(out,'W_ATK','攻擊力',Math.round(33*t*m),t); } };

function getPool(equip){
  var weapon = isWeapon(equip);
  var pool = [
    ENTRY_STR,ENTRY_DEX,ENTRY_INT,ENTRY_LUK,
    ENTRY_STR_DEX,ENTRY_STR_INT,ENTRY_STR_LUK,ENTRY_DEX_INT,ENTRY_DEX_LUK,ENTRY_INT_LUK,
    ENTRY_HP,ENTRY_MP
  ];
  if (weapon) pool.push(ENTRY_ATK_WEAPON);
  else { pool.push(ENTRY_DEF); pool.push(ENTRY_ATK_OTHER); }
  return pool;
}

function generate(itemName, equip, strengthMult){
  var pool = getPool(equip);
  var count = rollLineCount();
  var used = {};
  var lines = [];
  // 洗牌抽 count 個不重複
  var idxs = [];
  for (var i=0;i<pool.length;i++) idxs.push(i);
  for (var j=idxs.length-1;j>0;j--){
    var k = Math.floor(rand()*(j+1));
    var tmp = idxs[j]; idxs[j]=idxs[k]; idxs[k]=tmp;
  }

  var tier = rollTierByMode(itemName);
  for (var p=0;p<idxs.length && lines.length<count;p++){
    var e = pool[idxs[p]];
    if (!e || used[e.id]) continue;
    used[e.id] = true;
    e.apply(tier, lines, strengthMult||1);
  }

  return {
    item: String(itemName||''),
    tier: tier,
    lines: lines
  };
}

function lineToText(line){
  if (!line) return '';
  var v = Number(line.value||0)||0;
  var tier = (line.tier!=null) ? ('T'+line.tier) : '';
  return (line.label || line.key) + ' +' + v + (tier?(' ('+tier+')'):'');
}

function toText(flame){
  if (!flame || !flame.lines || !flame.lines.length) return '(無)';
  var s = [];
  for (var i=0;i<flame.lines.length;i++){
    s.push('• ' + lineToText(flame.lines[i]));
  }
  return s.join('\n');
}

function addFlat(out, key, val){
  if (!val) return;
  out[key] = (out[key]||0) + val;
}

function linesToFlat(flame){
  var out = { str:0,dex:0,int:0,luk:0,atk:0,def:0,hp:0,mp:0 };
  if (!flame || !flame.lines) return out;

  for (var i=0;i<flame.lines.length;i++){
    var L = flame.lines[i] || {};
    var v = Number(L.value||0)||0;
    var key = String(L.key||'').toUpperCase();

    if (!key) continue;

    // 雙屬：STR+DEX 等
    if (key.indexOf('+')>=0){
      var parts = key.split('+');
      for (var j=0;j<parts.length;j++){
        var p = parts[j];
        if (p==='STR') addFlat(out,'str',v);
        else if (p==='DEX') addFlat(out,'dex',v);
        else if (p==='INT') addFlat(out,'int',v);
        else if (p==='LUK') addFlat(out,'luk',v);
      }
      continue;
    }

    if (key==='STR') addFlat(out,'str',v);
    else if (key==='DEX') addFlat(out,'dex',v);
    else if (key==='INT') addFlat(out,'int',v);
    else if (key==='LUK') addFlat(out,'luk',v);
    else if (key==='HP') addFlat(out,'hp',v);
    else if (key==='MP') addFlat(out,'mp',v);
    else if (key==='DEF') addFlat(out,'def',v);
    else if (key==='ATK' || key==='W_ATK') addFlat(out,'atk',v);
  }

  return out;
}

// 可選：重建所有裝備的 flameFlat（不碰 player/coreBonus）
function rebuildAll(equipsObj){
  if (!equipsObj) return;
  for (var k in equipsObj){
    if (!equipsObj.hasOwnProperty(k)) continue;
    var e = equipsObj[k];
    if (!e) continue;
    if (e.flame) e.flameFlat = linesToFlat(e.flame);
  }
}




// === 小工具：深拷貝（避免引用污染）===
function clone(obj){
  if (obj==null) return obj;
  try{ return JSON.parse(JSON.stringify(obj)); }catch(_){ return obj; }
}
// === 裝備階級倍率（預留；目前全部=1，不影響能力）===
function getTierStrengthMult(equip){
  try{
    var t = (equip && equip.tier) ? String(equip.tier) : 'R';
    if (FlameConfig.tierStrengthMult && FlameConfig.tierStrengthMult.hasOwnProperty(t)) return Number(FlameConfig.tierStrengthMult[t]) || 1;
  }catch(_){}
  return 1;
}

// === UI：左右對照選擇框（內建，不依賴 equip_system）===
function showChoiceModal(beforeText, afterText, handlers){
  // handlers: function(choice) OR { onPick(choice), onAgain(updateAfterText), againLabel }
  var onPick = null, onAgain = null, againLabel = '再次使用';
  if (typeof handlers === 'function'){ onPick = handlers; }
  else if (handlers && typeof handlers === 'object'){
    onPick = (typeof handlers.onPick === 'function') ? handlers.onPick : null;
    onAgain = (typeof handlers.onAgain === 'function') ? handlers.onAgain : null;
    if (handlers.againLabel) againLabel = String(handlers.againLabel);
  }

  var id = 'flame-choice-modal';
  var old = document.getElementById(id);
  if (old && old.parentNode) old.parentNode.removeChild(old);

  var overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.position = 'fixed';
  overlay.style.left = '0';
  overlay.style.top = '0';
  overlay.style.right = '0';
  overlay.style.bottom = '0';
  overlay.style.background = 'rgba(0,0,0,0.55)';
  overlay.style.zIndex = '99999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '12px';

  var card = document.createElement('div');
  card.style.background = '#111';
  card.style.border = '1px solid rgba(255,255,255,0.15)';
  card.style.borderRadius = '12px';
  card.style.maxWidth = '920px';
  card.style.width = 'min(920px, 96vw)';
  card.style.color = '#e5e7eb';
  card.style.fontSize = '14px';
  card.style.overflow = 'hidden';

  var head = document.createElement('div');
  head.style.padding = '10px 12px';
  head.style.borderBottom = '1px solid rgba(255,255,255,0.10)';
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  head.style.justifyContent = 'space-between';

  var ttl = document.createElement('div');
  ttl.textContent = '選擇要套用哪個星火';
  ttl.style.fontWeight = '700';

  var x = document.createElement('button');
  x.textContent = '×';
  x.style.width = '34px';
  x.style.height = '34px';
  x.style.borderRadius = '10px';
  x.style.border = '1px solid rgba(255,255,255,0.16)';
  x.style.background = 'rgba(255,255,255,0.06)';
  x.style.color = '#e5e7eb';

  head.appendChild(ttl);
  head.appendChild(x);

  var body = document.createElement('div');
  body.style.display = 'grid';
  body.style.gridTemplateColumns = '1fr 1fr';
  body.style.gap = '10px';
  body.style.padding = '12px';

  function panel(title, text){
    var p = document.createElement('div');
    p.style.border = '1px solid rgba(255,255,255,0.15)';
    p.style.borderRadius = '10px';
    p.style.padding = '10px';
    p.style.background = 'rgba(255,255,255,0.04)';

    var h = document.createElement('div');
    h.textContent = title;
    h.style.fontWeight = '700';
    h.style.marginBottom = '8px';

    var pre = document.createElement('pre');
    pre.textContent = text || '(無)';
    pre.style.margin = '0';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-word';
    pre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    pre.style.fontSize = '13px';

    p.appendChild(h);
    p.appendChild(pre);
    return { box:p, pre:pre };
  }

  var p1 = panel('原本', beforeText);
  var p2 = panel('新的', afterText);
  body.appendChild(p1.box);
  body.appendChild(p2.box);

  var foot = document.createElement('div');
  foot.style.padding = '10px 12px';
  foot.style.borderTop = '1px solid rgba(255,255,255,0.10)';
  foot.style.display = 'flex';
  foot.style.gap = '8px';
  foot.style.justifyContent = 'flex-end';
  foot.style.flexWrap = 'wrap';

  function mkBtn(label, primary){
    var b = document.createElement('button');
    b.textContent = label;
    b.style.padding = '8px 14px';
    b.style.borderRadius = '10px';
    b.style.border = '1px solid rgba(255,255,255,0.16)';
    b.style.background = primary ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)';
    b.style.color = '#e5e7eb';
    b.style.cursor = 'pointer';
    b.style.fontWeight = '800';
    return b;
  }

  var btnCancel = mkBtn('取消', false);
  var btnAgain  = onAgain ? mkBtn(againLabel, false) : null;
  var btnKeep   = mkBtn('保留原本', false);
  var btnApply  = mkBtn('套用新的', true);

  foot.appendChild(btnCancel);
  if (btnAgain) foot.appendChild(btnAgain);
  foot.appendChild(btnKeep);
  foot.appendChild(btnApply);

  card.appendChild(head);
  card.appendChild(body);
  card.appendChild(foot);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  function updateAfterText(nextText){
    p2.pre.textContent = nextText || '(無)';
  }

  function close(choice){
    var el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    if (onPick) onPick(choice);
  }

  x.onclick = function(){ close('cancel'); };
  btnCancel.onclick = function(){ close('cancel'); };
  btnKeep.onclick = function(){ close('before'); };
  btnApply.onclick = function(){ close('after'); };
  if (btnAgain){
    btnAgain.onclick = function(){
      try{ onAgain(updateAfterText); }catch(_){}
    };
  }
  overlay.onclick = function(e){ if (e.target === overlay) close('cancel'); };
}


// === 進階 API：完全由星火檔案負責流程/UI/選擇 ===
//：完全由星火檔案負責流程/UI/選擇 ===
// ctx: { itemName, equipType, getNode(), saveNode(node), invCount(name), invUse(name,n) }
function applyToEquip(ctx){
  if (!ctx) return;
  var itemName = ctx.itemName;
  if (!itemName) return;

  var invCountFn = ctx.invCount || function(){ return 0; };
  var invUseFn   = ctx.invUse   || function(){ return false; };

  var node = (typeof ctx.getNode === 'function') ? ctx.getNode() : null;
  if (!node || node.locked){
    alert('裝備未解鎖');
    return;
  }

  // 依階級倍率（目前全部=1；預留）
  var strengthMult = getTierStrengthMult(node);

  var isAdv = /高級星火/.test(itemName);
  var isEt  = /永恆星火/.test(itemName);

  // === 一般星火：直接消耗 1 次並套用 ===
  if (!isAdv && !isEt){
    if (invCountFn(itemName) <= 0){
      alert('缺少 ' + itemName + ' ×1');
      return;
    }
    if (!invUseFn(itemName, 1)){
      alert('扣除道具失敗');
      return;
    }
    var after0 = generate(itemName, node, strengthMult);
    node.flame = after0;
    node.flameFlat = linesToFlat(node.flame);
    if (typeof ctx.saveNode === 'function') ctx.saveNode(node);
    return;
  }

  // === 高級/永恆：開啟左右對照彈窗 ===
  // 規則：打開彈窗就先消耗 1 個；點「再次使用」再消耗 1 個並重洗右側；最後選擇套用哪邊（不再額外消耗）
  if (invCountFn(itemName) <= 0){
    alert('缺少 ' + itemName + ' ×1');
    return;
  }
  if (!invUseFn(itemName, 1)){
    alert('扣除道具失敗');
    return;
  }

  var before = node.flame ? clone(node.flame) : null;
  var after  = generate(itemName, node, strengthMult);

  function saveChosen(chosenFlame){
    node.flame = chosenFlame;
    node.flameFlat = linesToFlat(node.flame);
    if (typeof ctx.saveNode === 'function') ctx.saveNode(node);
  }

  function reroll(updateAfterText){
    if (invCountFn(itemName) <= 0){
      alert('缺少 ' + itemName + ' ×1');
      return;
    }
    if (!invUseFn(itemName, 1)){
      alert('扣除道具失敗');
      return;
    }
    after = generate(itemName, node, strengthMult);
    if (typeof updateAfterText === 'function') updateAfterText(toText(after) || '(無)');
  }

  var beforeText = toText(before) || '(無)';
  var afterText  = toText(after)  || '(無)';

  showChoiceModal(beforeText, afterText, {
    againLabel: '再次使用',
    onAgain: function(updateAfterText){ reroll(updateAfterText); },
    onPick: function(pick){
      if (pick === 'before') saveChosen(before);
      else if (pick === 'after') saveChosen(after);
      else { /* cancel: 不套用，已消耗視為放棄 */ }
    }
  });
}


w.FlameCore = {
  config: FlameConfig,
  isWeapon: isWeapon,
  generate: generate,
  toText: toText,
  linesToFlat: linesToFlat,
  rebuildAll: rebuildAll,
  applyToEquip: applyToEquip
};

})(window);
