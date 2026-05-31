/*!
 * starforce_core_table_v1.js — 星力規則（表格版 ES5/UMD）
 * - 機率：沿用既有 STAR_TABLE（不變）
 * - 武器：
 *   · 1~15 星：每星增加「攻擊平值」與「全屬平值」
 *   · 16~30 星：每星增加「攻擊%」（依下方 starAtkPctPerStar）
 * - 非武器（帽/套/手套）：依下表給「全屬平值」與「攻擊平值」
 *   · 全屬/攻擊 per-star 來自你提供的表（見下方兩個陣列），可直接改
 * - 僅計算，完全不碰存檔/背包/UI
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.StarforceTableV1 = factory(); }
})(this, function () {
  'use strict';

  /* ===== 成功率／爆率（原樣） ===== */
  var STAR_TABLE = {
    1:{succ:95,  boom:0},   2:{succ:90,  boom:0},   3:{succ:85,  boom:0},
    4:{succ:85,  boom:0},   5:{succ:80,  boom:0},   6:{succ:75,  boom:0},
    7:{succ:70,  boom:0},   8:{succ:65,  boom:0},   9:{succ:60,  boom:0},
    10:{succ:55, boom:0},   11:{succ:50, boom:0},   12:{succ:45, boom:0},
    13:{succ:40, boom:0},   14:{succ:35, boom:0},   15:{succ:30, boom:0},
    16:{succ:30, boom:2.1}, 17:{succ:30, boom:2.1}, 18:{succ:15, boom:6.8},
    19:{succ:12, boom:8.2}, 20:{succ:10, boom:9.0}, 21:{succ:30, boom:10.5},
    22:{succ:20, boom:11.5},23:{succ:17.5,boom:12.25},24:{succ:8.5, boom:18.0},
    25:{succ:8.5, boom:18.0},26:{succ:8.0, boom:18.0},27:{succ:7.0, boom:18.6},
    28:{succ:5.0, boom:19.0},29:{succ:3.0, boom:19.4},30:{succ:1.0, boom:19.8}
  };
  function successRate(nextStar){ var t=STAR_TABLE[nextStar]; return t ? t.succ : 0; }
  function boomRate(nextStar){ var t=STAR_TABLE[nextStar]; return t ? (t.boom||0) : 0; }

  // 武器類判定（武器/補助武器/能源 都視為武器星力）
  function isWeaponType(t){
    t = String(t||'');
    return (t === 'weapon' || t === 'subweapon' || t === 'energy');
  }


  /* ===== 武器：1~15 平值（依指定） =====
   * 索引 1..15；單位為「每顆新增值」
   * - 1~5  ：全屬+2 / ATK+4
   * - 6~10 ：全屬+4 / ATK+7
   * - 11~15：全屬+5 / ATK+8
   */
  var WPN_ALLSTAT_PER_STAR = [
    0,
    2,2,2,2,2,
    4,4,4,4,4,
    5,5,5,5,5
  ];
  var WPN_ATK_FLAT_PER_STAR = [
    0,
    4,4,4,4,4,
    7,7,7,7,7,
    8,8,8,8,8
  ];

  // 武器：16★開始「主屬/攻擊」平值（依指定）
  // 16★：+15；其後每顆星在「基礎上 +2」
  // 第 i 星（i>=16）貢獻：15 + 2*(i-16)
  function weapon16PlusFlatSum(star){
    star = star|0;
    if (star < 16) return 0;
    if (star > 30) star = 30;
    var n = (star - 16 + 1);
    var first = 15;
    var last  = 15 + 2*(n-1);
    return ((n * (first + last)) / 2) | 0;
  }

  /* ===== 武器：16~30 攻擊%（依指定；1~15 不給%） ===== */
  function starAtkPctPerStar(i){
    if (i <= 15) return 0;
    if (i === 16) return 2;
    if (i === 17) return 3;
    if (i === 18) return 4;
    if (i === 19) return 5;
    if (i === 20) return 6;
    if (i === 21) return 7;
    if (i === 22) return 8;
    if (i === 23) return 9;
    if (i === 24) return 10;
    if (i === 25) return 15;
    if (i === 26) return 20;
    if (i === 27) return 30;
    if (i === 28) return 45;
    if (i === 29) return 70;
    if (i === 30) return 100;
    return 0;
  }
  function starAtkPctSum(star){
    var i, s=0;
    if (star<=0) return 0;
    if (star>30) star=30;
    for(i=1;i<=star;i++) s += starAtkPctPerStar(i);
    return s;
  }

  /* ===== 非武器表格（依你的圖） =====
   * 索引 1..30；單位為「每顆新增值」
   * - ALLSTAT_PER_STAR：全屬（STR/DEX/INT/LUK）平值
   * - ATK_PER_STAR    ：攻擊平值
   */
  var ALLSTAT_PER_STAR = [
    0, // 0 unused
    2,2,2,2,2,  // 1~5
    3,3,3,3,3,3,3,3,3,3, // 6~15
    17,17,17,17,17,17,17, // 16~22
    0,0,0,0,0,0,0,0       // 23~30
  ];
  var ATK_PER_STAR = [
    0, // 0 unused
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, // 1~15
    14,15,16,17,18,19,21,23,25,27,28,29,30,31,32 // 16~30
  ];
// ✅ 新增：防禦 / 血量 每星加值表（索引 1..30）
  // 1-10星 每星 +2 DEF / +30 HP
  // 11-15星 每星 +3 DEF / +40 HP
  // 16-22星 每星 +6 DEF / +70 HP
  var DEF_PER_STAR = [
    0, // 0 unused
    2,2,2,2,2,2,2,2,2,2,   // 1~10
    3,3,3,3,3,              // 11~15
    6,6,6,6,6,6,6,          // 16~22
    0,0,0,0,0,0,0,0         // 23~30（目前不加）
  ];

  var HP_PER_STAR = [
    0, // 0 unused
    30,30,30,30,30,30,30,30,30,30,  // 1~10
    40,40,40,40,40,                 // 11~15
    70,70,70,70,70,70,70,           // 16~22
    0,0,0,0,0,0,0,0                 // 23~30
  ];
  function sumFrom(arr, star){
    var i, s=0; if (star<=0) return 0; if (star>30) star=30;
    for(i=1;i<=star && i<arr.length;i++) s += (arr[i]|0);
    return s;
  }

  /* ===== 計算星力加成 =====
   * equipType: 'weapon' | 'hat' | 'suit' | 'glove' ...
   * baseAtkPlusScroll: 以便武器%計算（非武器忽略）
   * 回傳：
   *  - 對武器：{ allStat:0, atkPctSum:x, atkFromStar: floor(base*(x/100)), atkFlat:0 }
   *  - 對非武器：{ allStat:sumAll, atkFlat:sumAtk, atkPctSum:0, atkFromStar:0 }
   */
function calcStarBonus(equipType, star, baseAtkPlusScroll){
    star = star|0;
    if (isWeaponType(equipType)){
      // 武器：1~15 平值（全屬/攻擊）；16~30：全屬/攻擊平值（等差級數累加） + 攻擊%
      var wAll = sumFrom(WPN_ALLSTAT_PER_STAR, Math.min(star,15));
      var wAtk = sumFrom(WPN_ATK_FLAT_PER_STAR, Math.min(star,15));

      // 16★開始：全屬/攻擊平值（等差級數累加：15,17,19...）
      var all16Flat = weapon16PlusFlatSum(star);
      var atk16Flat = weapon16PlusFlatSum(star);
      wAll += all16Flat;
      wAtk += atk16Flat;

      var pct = starAtkPctSum(star); // 只會累加 16~30（1~15 回傳 0）
      var fromPct = Math.floor((baseAtkPlusScroll|0) * (pct/100));

      return { allStat:wAll, atkPctSum:pct, atkFromStar:fromPct, atkFlat:wAtk, defFlat:0, hpFlat:0 };
    } else {
      var allStat = sumFrom(ALLSTAT_PER_STAR, star);
      var atkFlat = sumFrom(ATK_PER_STAR,     star);
      var defFlat = sumFrom(DEF_PER_STAR,     star);  // ✅ 新增
      var hpFlat  = sumFrom(HP_PER_STAR,      star);  // ✅ 新增
      return { allStat:allStat, atkPctSum:0, atkFromStar:0, atkFlat:atkFlat, defFlat:defFlat, hpFlat:hpFlat };
    }
  }
  /* ===== 升星模擬（沿用） ===== */
  // options: { rng:fn()->0~1, maxStar:30, boomReset:{locked:true,pendingStar:12} }
  function attempt(currentStar, options){
    options = options || {};
    var rng = typeof options.rng==='function' ? options.rng : Math.random;
    var maxStar = options.maxStar || 30;

    if (currentStar >= maxStar) {
      return { ok:false, success:false, boom:false, keep:true, next:currentStar, reason:'cap' };
    }
    var next = currentStar + 1;
    var succ = rng() < (successRate(next)/100);
    if (succ) return { ok:true, success:true, boom:false, keep:false, next:next };

    var boomP = (options.boomRateOverride!=null ? (options.boomRateOverride) : boomRate(next));
    var boom = rng() < (boomP/100);
    if (boom){
      var br = options.boomReset || { locked:true, pendingStar:12 };
      return { ok:false, success:false, boom:true, keep:false, next:0, boomReset:br };
    }
    return { ok:true, success:false, boom:false, keep:true, next:currentStar };
  }

  
  /* ===== 成本 / 防爆規則（核心驅動） ===== */
  // 需求：每次強化素材 = 下一星數量（+1），防爆 ×3
  function stoneCost(currentStar, safeguard){
    var next = (currentStar|0) + 1;
    var cost = next; // 0→1:1, 1→2:2 ...
    if (safeguard) cost = cost * 3;
    return cost|0;
  }
  // 20★以前可防爆；且僅限「會爆」的星段才可啟用
  function canSafeguard(currentStar){
    var next = (currentStar|0) + 1;
    if (next > 20) return false;
    return boomRate(next) > 0;
  }


  /* ===== 新增：爆炸保護道具（核心驅動，可接背包） ===== */
  // 道具名稱
  var ITEM_BOOM_CHARM = '緩爆護符';
  var ITEM_PROTECT_TICKET = '保護券';

  // 緩爆護符：依你指定
  // - 16~23：爆炸率降低 70%（只剩 30%）
  // - 24~30：降低 50% -> 25%（星越高降越少；24=-50%, 29=-25%, 30=-25%）
  function charmBoomRate(nextStar, baseBoom){
    nextStar = nextStar|0;
    baseBoom = (baseBoom==null?0:+baseBoom)||0;
    if (baseBoom <= 0) return 0;
    if (nextStar < 16 || nextStar > 30) return baseBoom;

    if (nextStar <= 23){
      return baseBoom * 0.30; // -70%
    }
    // 24~30
    var cut;
    if (nextStar >= 29) cut = 0.25;
    else {
      // 24..29 : 0.50 -> 0.25 線性
      var t = (nextStar - 24) / 5; // 0..1
      cut = 0.50 + (0.25 - 0.50) * t;
    }
    return baseBoom * (1 - cut);
  }

  // 保護券：依你指定（僅 16~25 有效）
  // - 16~19：0%
  // - 20~22：1%
  // - 23~25：2% / 3% / 5%（23=2, 24=3, 25=5）
  function ticketBoomRate(nextStar, baseBoom){
    nextStar = nextStar|0;
    baseBoom = (baseBoom==null?0:+baseBoom)||0;
    if (baseBoom <= 0) return 0;
    if (nextStar < 16 || nextStar > 25) return baseBoom;

    if (nextStar <= 19) return 0;
    if (nextStar <= 22) return 1;
    if (nextStar === 23) return 2;
    if (nextStar === 24) return 3;
    return 5; // 25
  }

  // 取得背包數量 / 扣除（優先 hooks，其次用 inventory.js 的 global）
  function getItemCount(hooks, name){
    if (hooks && typeof hooks.getItemCount === 'function') return hooks.getItemCount(name)|0;
    if (typeof window !== 'undefined' && typeof window.getItemQuantity === 'function') return window.getItemQuantity(name)|0;
    return 0;
  }
  function spendItem(hooks, name, qty){
    qty = qty|0; if (qty<=0) return true;
    if (hooks && typeof hooks.spendItem === 'function') return !!hooks.spendItem(name, qty);

    // 兼容 inventory.js：removeItem 不回傳 boolean，所以要先檢查數量
    if (typeof window !== 'undefined'){
      if (typeof window.getItemQuantity === 'function' && typeof window.removeItem === 'function'){
        var have = window.getItemQuantity(name)|0;
        if (have < qty) return false;
        try{ window.removeItem(name, qty); }catch(e){ return false; }
        return true;
      }
      // 其他可能的實作（若 removeItem 有回傳值也能用）
      if (typeof window.removeItem === 'function'){
        try{ window.removeItem(name, qty); }catch(e){ return false; }
        return true;
      }
    }
    return false;
  }


  /* ===== 升星（含防爆） ===== */
  // options: { rng, maxStar, safeguard:boolean }
  // 回傳：{ ok, success, boom, safeguarded, nextStar }
  function attemptEquipStar(equipNode, options){
    options = options || {};
    var rng = typeof options.rng==='function' ? options.rng : Math.random;
    var maxStar = options.maxStar || 30;
    var cur = equipNode.star|0;
    if (cur >= maxStar) return { ok:false, success:false, boom:false, safeguarded:false, nextStar:cur, reason:'cap' };

    var next = cur + 1;
    var succ = rng() < (successRate(next)/100);
    if (succ){
      equipNode.star = next;
      // IMPORTANT: Starforce must NOT share counters with scroll/enhance.
      // enhanceSuccess is reserved for scroll success count.
      equipNode._sfSuccess = (equipNode._sfSuccess|0) + 1;
      return { ok:true, success:true, boom:false, safeguarded:false, nextStar:next };
    }

    var boomP = (options.boomRateOverride!=null ? (options.boomRateOverride) : boomRate(next));
    var boom = rng() < (boomP/100);
    if (boom){
      var sg = !!options.safeguard;
      if (sg){
        // 防爆：把爆炸視為一般失敗（星數不變、不鎖）
        return { ok:true, success:false, boom:true, safeguarded:true, nextStar:cur };
      }
      // 不防爆：沿用你原本的「鎖裝 + 待解鎖回到 12★」流程（星數維持）
      equipNode.locked = true;
      equipNode._pendingStar = 12;
      return { ok:false, success:false, boom:true, safeguarded:false, nextStar:cur };
    }
    return { ok:true, success:false, boom:false, safeguarded:false, nextStar:cur };
  }

  /* ===== UI：彈窗（核心內建） ===== */
  function el(tag, cls, txt){
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (txt != null) d.textContent = txt;
    return d;
  }
  function pct(x){ return (Math.round(x*100)/100).toFixed(2).replace(/\.00$/,'') + '%'; }
  function n(x){ x = x==null?0:x; return (x|0); }
  function fmtPlus(v){ v = n(v); return (v>=0?'+':'') + v; }

  function starColor(star){
    star = star|0;
    if (star>=20) return 'rgba(255, 215, 0, 0.95)';      // 金
    if (star>=15) return 'rgba(255, 140, 0, 0.95)';      // 橘
    if (star>=10) return 'rgba(180, 120, 255, 0.95)';    // 紫
    if (star>=5)  return 'rgba(90, 255, 180, 0.95)';     // 綠
    if (star>=1)  return 'rgba(120, 200, 255, 0.95)';    // 藍
    return 'rgba(200, 200, 200, 0.85)';                  // 灰
  }

  // 取得「本次升星增加的能力」（差值）
  function calcGainForNext(equipNode){
    var cur = equipNode.star|0;
    var type = equipNode.type || '';
    var baseAtkPlusScroll =
      n(equipNode.base && equipNode.base.atk) +
      n(equipNode.enhance && equipNode.enhance.atk) +
      n(equipNode.flameFlat && equipNode.flameFlat.atk);

    var a = calcStarBonus(type, cur, baseAtkPlusScroll) || {};
    var b = calcStarBonus(type, cur+1, baseAtkPlusScroll) || {};
    return {
      allStat: n(b.allStat) - n(a.allStat),
      atkFlat: n(b.atkFlat) - n(a.atkFlat),
      defFlat: n(b.defFlat) - n(a.defFlat),
      hpFlat:  n(b.hpFlat)  - n(a.hpFlat),
      atkFromStar: n(b.atkFromStar) - n(a.atkFromStar),
      atkPctSum: (b.atkPctSum||0) - (a.atkPctSum||0)
    };
  }

  // hooks:
  // { getStoneCount():number, spendStone(n):bool, onSave(equipNode), onRerender(), onMsg(text) }
  function openStarforceModal(equipNode, hooks){
    ensureStyle();
    hooks = hooks || {};
    if (!equipNode) return;
    if (equipNode.locked){
      (hooks.onMsg||alert)('裝備未解鎖，無法升星');
      return;
    }

    var bd = el('div','sf-mask');
    var card = el('div','sf-card');
    var header = el('div','sf-head');
    var title = el('div','sf-title','星力強化');
    var close = el('button','sf-close','×');
    close.onclick = function(){ bd.remove(); };
    header.appendChild(title); header.appendChild(close);

    var top = el('div','sf-top');
    var left = el('div','sf-starbox');
    var right = el('div','sf-starbox');
    top.appendChild(left); top.appendChild(right);

    var mid = el('div','sf-mid');

    // FX layer
    var fx = el('div','sf-fx');
    card.appendChild(fx);

    var lineSucc = el('div','sf-line');
    var lineFail = el('div','sf-line');
    var lineBoom = el('div','sf-line');
    var lineGain = el('div','sf-line sf-gain');
    var lineProt = el('div','sf-hint');

    mid.appendChild(lineSucc);
    mid.appendChild(lineFail);
    mid.appendChild(lineBoom);
    mid.appendChild(lineGain);
    mid.appendChild(lineProt);

    var foot = el('div','sf-foot');
    var sgWrap = el('label','sf-sg');
    var sg = document.createElement('input'); sg.type='checkbox';
    var sgTxt = el('span',null,'防爆（素材×3）');
    sgWrap.appendChild(sg); sgWrap.appendChild(sgTxt);

    // 追加：爆炸保護道具（互斥）
    var itemWrap = el('div','sf-items');

    var charmWrap = el('label','sf-item');
    var charm = document.createElement('input'); charm.type='checkbox';
    var charmTxt = el('span',null, ITEM_BOOM_CHARM + '（降低爆炸率）');
    var charmCnt = el('span','sf-cnt','');
    charmWrap.appendChild(charm); charmWrap.appendChild(charmTxt); charmWrap.appendChild(charmCnt);

    var ticketWrap = el('label','sf-item');
    var ticket = document.createElement('input'); ticket.type='checkbox';
    var ticketTxt = el('span',null, ITEM_PROTECT_TICKET + '（16~25★ 固定爆率）');
    var ticketCnt = el('span','sf-cnt','');
    ticketWrap.appendChild(ticket); ticketWrap.appendChild(ticketTxt); ticketWrap.appendChild(ticketCnt);

    // 互斥：保護券優先
    charm.onchange = function(){ if (charm.checked) ticket.checked = false; render(); };
    ticket.onchange = function(){ if (ticket.checked) charm.checked = false; render(); };

    itemWrap.appendChild(charmWrap);
    itemWrap.appendChild(ticketWrap);

    // 放到中下方（與成功率/失敗率/提升能力同區塊）
    var itemBox = el('div','sf-itembox');
    var itemTitle = el('div','sf-itembox-title','爆炸保護');
    itemBox.appendChild(itemTitle);
    itemBox.appendChild(itemWrap);
    mid.appendChild(itemBox);

    var btn = el('button','sf-go','衝星');
    foot.appendChild(sgWrap);
        foot.appendChild(btn);

    card.appendChild(header);
    card.appendChild(top);
    card.appendChild(mid);
    card.appendChild(foot);
    bd.appendChild(card);
    function onMaskClick(e){ if(e.target===bd) bd.remove(); }
    bd.addEventListener('click', onMaskClick);
    document.body.appendChild(bd);

    
    function playBoomSfx(){
      try{
        var AC = window.AudioContext || window.webkitAudioContext;
        if(!AC) return;
        var ctx = playBoomSfx._ctx || (playBoomSfx._ctx = new AC());
        // iOS/Chrome 需要在使用者互動後才可播放；按鈕點擊已算互動
        var t0 = ctx.currentTime;
        var o1 = ctx.createOscillator();
        var o2 = ctx.createOscillator();
        var g = ctx.createGain();
        // 低沉爆破 + 高頻破裂
        o1.type='sawtooth'; o2.type='square';
        o1.frequency.setValueAtTime(140, t0);
        o1.frequency.exponentialRampToValueAtTime(40, t0+0.35);
        o2.frequency.setValueAtTime(420, t0);
        o2.frequency.exponentialRampToValueAtTime(90, t0+0.18);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.55, t0+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0+0.55);
        o1.connect(g); o2.connect(g); g.connect(ctx.destination);
        o1.start(t0); o2.start(t0);
        o1.stop(t0+0.6); o2.stop(t0+0.25);
      }catch(e){}
    }

function playFx(kind){
      // 取消閃光/搖晃，改為文字閃爍提示
      // kind: 'success' | 'fail' | 'safeguard'
      try{
        // 清掉舊動畫狀態（保留相容）
        card.classList.remove('sf-anim-success','sf-anim-fail','sf-anim-sg');
        fx.innerHTML = '';
      }catch(e){}

      var text = '';
      var cls = '';
      if (kind === 'success') { text = '強化成功'; cls = 'sf-result-ok'; }
      else if (kind === 'fail') { text = '強化失敗'; cls = 'sf-result-bad'; }
      else if (kind === 'safeguard') { text = '防爆啟動'; cls = 'sf-result-sg'; }
      else { return; }

      // 建立/更新文字層
      var wrap = card.querySelector('.sf-result-wrap');
      if (!wrap){
        wrap = document.createElement('div');
        wrap.className = 'sf-result-wrap';
        card.appendChild(wrap);
      }
      var elx = card._sfResultEl;
      if (!elx){
        elx = document.createElement('div');
        elx.className = 'sf-result-text';
        wrap.appendChild(elx);
        card._sfResultEl = elx;
      }

      // 重播動畫：先移除再加回
      elx.className = 'sf-result-text ' + cls;
      elx.textContent = text;
      void elx.offsetWidth;
      elx.className = 'sf-result-text ' + cls + ' sf-result-anim';

      // 動畫結束後自動移除（保留一點時間給人看到）
      clearTimeout(card._sfResultTimer);
      card._sfResultTimer = setTimeout(function(){
        try{
          if (card && card._sfResultEl){
            // 只清掉動畫 class，保留節點以便重用
            card._sfResultEl.className = 'sf-result-text ' + cls;
            card._sfResultEl.textContent = '';
          }
        }catch(e){}
      }, 1200);
    }

    
    function setStarBox(box, label, star){
      box.classList.remove('sf-star20','sf-star25');
      box.style.color = starColor(star);
      if ((star|0) >= 25) box.classList.add('sf-star25');
      else if ((star|0) >= 20) box.classList.add('sf-star20');

      while (box.firstChild) box.removeChild(box.firstChild);
      box.appendChild(el('div','sf-starlabel', label + '：'));
      box.appendChild(el('div','sf-starval', (star|0) + '★'));
    }

function showDestroyed(){
      // 鎖住整個視窗：只能按「確定」關閉
      try{ close.style.display='none'; }catch(e){}
      try{ bd.removeEventListener('click', onMaskClick); }catch(e){}
      btn.disabled = true;
      sg.disabled = true;
      sg.checked = false;

      // 內容改成損毀提示
      title.textContent = '裝備已損壞';
      left.textContent = '目前：—';
      right.textContent = '目標：—';
      left.style.color = '#ffd37a';
      right.style.color = '#ffd37a';

      mid.style.display = 'none';
      foot.style.display = 'none';

      var msgWrap = card.querySelector('.sf-destroyed');
      if(!msgWrap){
        msgWrap = el('div','sf-destroyed');
        var h = el('div','sf-destroyed-title','裝備已損毀請重新解放');
        var p = el('div','sf-destroyed-desc','裝備已經變成痕跡請重新解放');
        var ok = el('button','sf-btn-ok','確定');
        ok.onclick = function(){
          // 關閉前才觸發外層重繪（避免外層把彈窗清掉）
          if (typeof hooks.onRerender==='function') hooks.onRerender();
          bd.remove();
        };
        msgWrap.appendChild(h);
        msgWrap.appendChild(p);
        msgWrap.appendChild(ok);
        card.appendChild(msgWrap);
      }else{
        msgWrap.style.display='';
      }
    }

    function render(){
      var cur = equipNode.star|0;
      var next = cur+1;
      setStarBox(left, '目前', cur);
      setStarBox(right, '目標', next);

      var s = successRate(next);
      var b0 = boomRate(next);

      // 道具數量顯示 + 可用性
      var charmHave = getItemCount(hooks, ITEM_BOOM_CHARM);
      var ticketHave = getItemCount(hooks, ITEM_PROTECT_TICKET);
      charmCnt.textContent = '×' + charmHave;
      ticketCnt.textContent = '×' + ticketHave;

      // 僅在「原本會爆」且 16★以上才有意義；不會爆就禁用避免浪費
      var charmEffective = (b0 > 0) && (next >= 16) && (next <= 30);
      var ticketEffective = (b0 > 0) && (next >= 16) && (next <= 25);

      charm.disabled = !(charmHave > 0 && charmEffective);
      ticket.disabled = !(ticketHave > 0 && ticketEffective);

      charmWrap.style.opacity = charm.disabled ? '0.45' : '1';
      ticketWrap.style.opacity = ticket.disabled ? '0.45' : '1';

      if (charm.disabled) charm.checked = false;
      if (ticket.disabled) ticket.checked = false;

      var b = b0;
      if (ticket.checked) b = ticketBoomRate(next, b0);
      else if (charm.checked) b = charmBoomRate(next, b0);

      var f = Math.max(0, 100 - s - b);

      lineSucc.textContent = '本次成功率：' + pct(s);
      lineFail.textContent = '失敗率：' + pct(f);
      lineBoom.textContent = '爆炸機率：' + pct(b) + (b !== b0 ? ('（原 ' + pct(b0) + '）') : '');

      // 小提示：目前套用的保護效果
      var tag = '';
      if (!ticket.disabled && ticket.checked) tag = ITEM_PROTECT_TICKET;
      else if (!charm.disabled && charm.checked) tag = ITEM_BOOM_CHARM;

      lineProt.innerHTML = tag
        ? ('已套用：<span class="sf-tag ' + (tag===ITEM_PROTECT_TICKET ? 'protect' : 'charm') + '">' + tag + '</span>')
        : ('<span class="sf-tag none">未使用保護</span>');

      // 規則提示（簡短）
      if (tag===ITEM_BOOM_CHARM) lineProt.innerHTML += '　';
      if (tag===ITEM_PROTECT_TICKET) lineProt.innerHTML += '　16–19★0%；20–22★1%；23★2% / 24★3% / 25★5%';

      // 爆炸機率顏色：降低→偏綠/金；提高→偏紅；不變→白
      lineBoom.classList.remove('sf-boom-ok','sf-boom-warn','sf-boom-bad');
      if (b0 > 0 && b === 0){
        lineBoom.classList.add('sf-boom-ok');
      } else if (b < b0){
        lineBoom.classList.add('sf-boom-warn');
      } else if (b > b0){
        lineBoom.classList.add('sf-boom-bad');
      }

      var g = calcGainForNext(equipNode);
      // 讓顯示簡潔：全屬/攻擊/防/HP/武器%攻換算
      var parts = [];
      if (g.allStat) parts.push('全屬 ' + fmtPlus(g.allStat));
      if (g.atkFlat) parts.push('ATK ' + fmtPlus(g.atkFlat));
      if (g.atkFromStar) parts.push('ATK(%) ' + fmtPlus(g.atkFromStar));
      if (g.defFlat) parts.push('DEF ' + fmtPlus(g.defFlat));
      if (g.hpFlat) parts.push('HP ' + fmtPlus(g.hpFlat));
      lineGain.textContent = '增加能力：' + (parts.length?parts.join('、'):'（無）');

      var allowSg = canSafeguard(cur);
      sg.disabled = !allowSg;
      sgWrap.style.opacity = allowSg ? '1' : '0.45';

      // 成本顯示在按鈕上（簡潔）
      var useSg = allowSg && sg.checked;
      var cost = stoneCost(cur, useSg);
      var have = (typeof hooks.getStoneCount==='function') ? (hooks.getStoneCount()|0) : 0;
      btn.textContent = '衝星（' + cost + '）  現有：' + have;
      btn.disabled = have < cost;
      btn.style.opacity = btn.disabled ? '0.55' : '1';
    }

    function doAttempt(){
      var cur = equipNode.star|0;
      var allowSg = canSafeguard(cur);
      var useSg = allowSg && sg.checked;
      var cost = stoneCost(cur, useSg);

      // 道具：保護券 / 緩爆護符（互斥；保護券優先）
      var next = cur + 1;
      var b0 = boomRate(next);
      var boomOverride = null;
      var useItemName = null;

      if (ticket.checked){
        boomOverride = ticketBoomRate(next, b0);
        useItemName = ITEM_PROTECT_TICKET;
      } else if (charm.checked){
        boomOverride = charmBoomRate(next, b0);
        useItemName = ITEM_BOOM_CHARM;
      }

      // 先扣道具（若後續材料不足則退回）
      if (useItemName){
        if (!spendItem(hooks, useItemName, 1)){
          (hooks.onMsg||alert)('道具不足：' + useItemName);
          render();
          return;
        }
      }

      // 再扣材料
      if (typeof hooks.spendStone==='function'){
        if (!hooks.spendStone(cost)){
          // 退回道具
          if (useItemName && typeof window !== 'undefined' && typeof window.addItem === 'function'){
            try{ window.addItem(useItemName, 1); }catch(e){}
          }
          (hooks.onMsg||alert)('材料不足：衝星石 ×' + cost);
          render();
          return;
        }
      }

      var r = attemptEquipStar(equipNode, { safeguard: useSg, maxStar: 30, boomRateOverride: boomOverride });
      if (typeof hooks.onSave==='function') hooks.onSave(equipNode, r);

      if (r.success){
        if (typeof hooks.onRerender==='function') hooks.onRerender();
        playFx('success');
        (hooks.onMsg||function(){})('星力成功 → ' + equipNode.star + '★');
        render();
        return;
      }

      if (r.boom && r.safeguarded){
        if (typeof hooks.onRerender==='function') hooks.onRerender();
        playFx('safeguard');
        (hooks.onMsg||function(){})('防爆觸發：未爆炸（星數不變）');
        render();
        return;
      }

      if (r.boom){
        // 爆炸：播放音效，瞬間切換成「損壞」畫面，讓玩家按確定關閉
        playBoomSfx();
        (hooks.onMsg||function(){})('裝備已損毀請重新解放');
        showDestroyed();
        return;
      }

      // 一般失敗
      if (typeof hooks.onRerender==='function') hooks.onRerender();
      playFx('fail');
      (hooks.onMsg||function(){})('星力失敗');
      render();
    }

    btn.onclick = doAttempt;
    sg.onchange = render;
    render();
  }

  /* ===== UI Style（只注入一次） ===== */
  function ensureStyle(){
    if (ensureStyle._done) return;
    ensureStyle._done = true;
    var css = ''
      + '.sf-mask{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:99999;}'
      + '.sf-card{width:min(520px,92vw);background:rgba(15,20,30,.98);border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:14px;color:#eaf2ff;font-family:system-ui,-apple-system,Segoe UI,Roboto;position:relative;overflow:hidden;}'
      + '.sf-card{position:relative;overflow:hidden;}'      + '.sf-fx{position:absolute;inset:0;pointer-events:none;}'
      + '.sf-result-wrap{position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;}'      + '.sf-result-text{font-size:20px;font-weight:900;letter-spacing:1px;padding:8px 14px;border-radius:12px;background:rgba(0,0,0,.45);color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.55);opacity:0;}'      + '.sf-result-ok{color:#7CFFB2;background:rgba(20,40,20,.60);}'      + '.sf-result-bad{color:#FF6B6B;background:rgba(40,20,20,.60);}'      + '.sf-result-sg{color:#FFD36A;background:rgba(40,30,10,.60);}'      + '.sf-result-anim{animation:sfResultFlash 1.2s ease-in-out 0s 1;}'      + '@keyframes sfResultFlash{0%{opacity:0;transform:translateY(6px) scale(.98);}15%{opacity:1;transform:translateY(0) scale(1);}70%{opacity:1;}100%{opacity:0;transform:translateY(-2px) scale(1.02);}}'      + '.sf-anim-success{animation:sfPulse .55s ease-out;}'      + '.sf-anim-fail{animation:sfShake .45s ease-in-out;}'      + '.sf-anim-boom{animation:sfShake .6s ease-in-out;}'      + '.sf-anim-sg{animation:sfPulse .45s ease-out;}'      + '.sf-spark{position:absolute;inset:-40px;background:radial-gradient(circle at 30% 30%, rgba(255,255,255,.9), rgba(255,255,255,0) 55%),radial-gradient(circle at 70% 60%, rgba(120,220,255,.85), rgba(120,220,255,0) 55%);filter:blur(2px);opacity:.0;animation:sfSpark .7s ease-out;}'      + '.sf-shield{position:absolute;left:12px;bottom:12px;padding:6px 10px;border-radius:999px;border:1px solid rgba(120,220,255,.45);background:rgba(60,120,200,.22);color:#eaf2ff;font-weight:900;letter-spacing:.5px;box-shadow:0 0 18px rgba(120,220,255,.25);opacity:0;animation:sfPop .8s ease-out;}'      + '.sf-explode{position:absolute;inset:-80px;background:radial-gradient(circle at 50% 55%, rgba(255,200,60,.95), rgba(255,120,0,.75) 25%, rgba(255,0,0,.0) 60%);mix-blend-mode:screen;filter:blur(0px);opacity:0;animation:sfBoom .85s ease-out;}'      + '@keyframes sfPulse{0%{transform:scale(1);box-shadow:0 18px 60px rgba(0,0,0,.55);}60%{transform:scale(1.02);box-shadow:0 18px 70px rgba(120,220,255,.22);}100%{transform:scale(1);}}'      + '@keyframes sfShake{0%,100%{transform:translateX(0);}20%{transform:translateX(-8px);}40%{transform:translateX(7px);}60%{transform:translateX(-5px);}80%{transform:translateX(4px);}}'      + '@keyframes sfSpark{0%{opacity:0;transform:scale(.9);}25%{opacity:.9;}100%{opacity:0;transform:scale(1.08);}}'      + '@keyframes sfBoom{0%{opacity:0;transform:scale(.7);}18%{opacity:1;}100%{opacity:0;transform:scale(1.15);}}'      + '@keyframes sfPop{0%{opacity:0;transform:translateY(10px);}25%{opacity:1;transform:translateY(0);}100%{opacity:0;transform:translateY(-6px);}}'      + '.sf-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}'
      + '.sf-title{font-weight:800;letter-spacing:.5px;}'
      + '.sf-close{width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;font-size:18px;cursor:pointer;}'
      + '.sf-top{display:flex;gap:10px;margin:8px 0 10px;}'
      + '.sf-starbox{flex:1;text-align:center;padding:10px 8px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);}'
      + '.sf-starlabel{font-size:12px;opacity:.85;margin-bottom:4px;}'
      + '.sf-starval{font-size:22px;font-weight:900;letter-spacing:.3px;}'
      + '@keyframes sfShimmer{0%{filter:brightness(1)}50%{filter:brightness(1.6)}100%{filter:brightness(1)}}'
      + '.sf-star20 .sf-starval{animation:sfShimmer 1.2s ease-in-out infinite;text-shadow:0 0 10px rgba(255,255,255,.28);}'
      + '@keyframes sfRainbow{0%{background-position:0% 50%}100%{background-position:100% 50%}}'
      + '.sf-star25 .sf-starval{color:transparent;background-image:linear-gradient(90deg,#ff3b3b,#ffbf00,#3bff6a,#3bb6ff,#8a3bff,#ff3bb6,#ff3b3b);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;animation:sfRainbow 1.6s linear infinite;text-shadow:0 0 12px rgba(255,255,255,.18);}'
      + '.sf-mid{padding:10px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);} '
      + '.sf-line{padding:6px 2px;font-size:14px;color:rgba(235,245,255,.92);} '
      + '.sf-gain{margin-top:6px;font-weight:700;color:rgba(170,220,255,.95);} '
      + '.sf-foot{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:12px;}'
      + '.sf-sg{display:flex;align-items:center;gap:8px;font-size:14px;color:rgba(235,245,255,.9);} '
      + '.sf-itembox{margin-top:10px;padding:10px 10px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);} ' 
      + '.sf-itembox-title{font-size:13px;opacity:.85;margin-bottom:8px;letter-spacing:.5px;} ' 
      + '.sf-items{display:grid;grid-template-columns:1fr 1fr;gap:8px;} '
      + '.sf-item{display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(235,245,255,.88);padding:6px 8px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);} '
      + '.sf-item input{transform:translateY(0.5px);} '
      + '.sf-cnt{margin-left:auto;opacity:.75;font-weight:800;} '
+ '.sf-go{flex:1;border-radius:14px;border:1px solid rgba(120,190,255,.35);background:linear-gradient(180deg, rgba(70,150,255,.35), rgba(40,90,190,.25));color:#eaf2ff;font-weight:900;padding:12px 10px;cursor:pointer;}'
      + '.sf-destroyed{margin-top:10px;padding:14px;border-radius:14px;border:1px solid rgba(255,80,80,.35);background:rgba(255,30,30,.08);text-align:center;}'
      + '.sf-destroyed-title{font-size:18px;font-weight:900;color:rgba(255,120,120,.95);margin-bottom:6px;text-shadow:0 0 14px rgba(255,40,40,.25);}'
      + '.sf-destroyed-desc{font-size:14px;color:rgba(240,245,255,.92);margin-bottom:12px;}'
      + '.sf-btn-ok{width:100%;border-radius:14px;border:1px solid rgba(255,120,120,.45);background:linear-gradient(180deg, rgba(255,70,70,.35), rgba(160,20,20,.25));color:#ffecec;font-weight:900;padding:12px 10px;cursor:pointer;}'
      + '.sf-anim-boom .sf-mid,.sf-anim-boom .sf-foot{opacity:0;filter:blur(1px);transition:opacity .2s ease;}'      + '.sf-split-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:16px;}'      + '.sf-split-half{position:absolute;top:0;height:100%;width:50%;background:rgba(15,20,30,.98);border:1px solid rgba(255,255,255,.10);}'      + '.sf-split-left{left:0;border-right:none;}'      + '.sf-split-right{right:0;border-left:none;}'      + '.sf-crack{position:absolute;top:0;bottom:0;left:50%;width:2px;transform:translateX(-1px);background:linear-gradient(180deg, rgba(255,255,255,0), rgba(255,220,120,.85), rgba(255,255,255,0));opacity:.0;}'      + '.sf-boom-text{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-weight:900;font-size:22px;letter-spacing:1px;color:#ffd37a;text-shadow:0 6px 18px rgba(0,0,0,.75);opacity:0;}'      + '.sf-anim-boom .sf-split-left{animation:sfSplitL 3s ease-in-out forwards;}'      + '.sf-anim-boom .sf-split-right{animation:sfSplitR 3s ease-in-out forwards;}'      + '.sf-anim-boom .sf-crack{animation:sfCrack 3s ease-in-out forwards;}'      + '.sf-anim-boom .sf-boom-text{animation:sfBoomTxt 3s ease-in-out forwards;}'      + '@keyframes sfSplitL{0%{transform:translateX(0) rotate(0);}12%{transform:translateX(-6px) rotate(-1deg);}100%{transform:translateX(-58%) rotate(-4deg);}}'      + '@keyframes sfSplitR{0%{transform:translateX(0) rotate(0);}12%{transform:translateX(6px) rotate(1deg);}100%{transform:translateX(58%) rotate(4deg);}}'      + '@keyframes sfCrack{0%{opacity:0;}10%{opacity:1;}100%{opacity:.65;}}'      + '@keyframes sfBoomTxt{0%{opacity:0;transform:translate(-50%,-50%) scale(.98);}12%{opacity:1;transform:translate(-50%,-50%) scale(1);}85%{opacity:1;}100%{opacity:0;}}'      + '.sf-anim-boom{box-shadow:0 18px 90px rgba(255,140,0,.12);}'
      + '.sf-boom-ok{color:#7CFFB2;}'
      + '.sf-boom-warn{color:#FFD36A;}'
      + '.sf-boom-bad{color:#FF6B6B;}'
      + '.sf-hint{margin-top:8px;font-size:12px;color:rgba(220,230,255,.78);line-height:1.25;}'
      + '.sf-tag{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid rgba(120,190,255,.25);background:rgba(60,120,220,.12);margin-left:6px;font-size:12px;}'
      + '.sf-tag.protect{border-color:rgba(255,160,80,.35);background:rgba(255,120,40,.12);}'
      + '.sf-tag.charm{border-color:rgba(120,255,200,.30);background:rgba(40,170,120,.12);}'
      + '.sf-tag.none{border-color:rgba(200,200,200,.18);background:rgba(200,200,200,.06);}';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  return {
    table: STAR_TABLE,
    successRate: successRate,
    boomRate: boomRate,
    starAtkPctSum: starAtkPctSum,       // 方便查
    calcStarBonus: calcStarBonus,       // ★ 新規則出口
    attempt: attempt,
    stoneCost: stoneCost,
    canSafeguard: canSafeguard,
    attemptEquipStar: attemptEquipStar,
    openStarforceModal: openStarforceModal,
    ITEM_BOOM_CHARM: ITEM_BOOM_CHARM,
    ITEM_PROTECT_TICKET: ITEM_PROTECT_TICKET,
    // 也把表輸出，方便你之後改
    __ALLSTAT_PER_STAR: ALLSTAT_PER_STAR,
    __ATK_PER_STAR: ATK_PER_STAR,
    __DEF_PER_STAR: DEF_PER_STAR,
    __HP_PER_STAR: HP_PER_STAR,
    __WPN_ALLSTAT_PER_STAR: WPN_ALLSTAT_PER_STAR,
    __WPN_ATK_FLAT_PER_STAR: WPN_ATK_FLAT_PER_STAR
  };
});
