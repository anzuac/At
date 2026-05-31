// =======================
// explore.js — 探索（多隊 / 每日上限 / 升級 / 重置券）ES2020+
// 依賴：TownHub（來自 town_hub.js）、SaveHub（save_hub_es2020.js）
// =======================
(function (w) {
  "use strict";
  if (!w.TownHub || typeof w.TownHub.registerTab !== 'function') return;

  // ===== 小工具 =====
  function nowSec(){ return Math.floor(Date.now()/1000); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function toInt(n){ n=Number(n); return (isFinite(n)? Math.floor(n) : 0); }
  function byId(id){ return document.getElementById(id); }
  function fmt(n){ return Number(n||0).toLocaleString(); }
  function upd(){ try{ w.updateResourceUI && w.updateResourceUI(); }catch(_){} }
  function saveGame(){ try{ w.saveGame && w.saveGame(); }catch(_){} }
  function addItem(name, qty){ qty=toInt(qty||1); if(qty<=0) return; try{ w.addItem && w.addItem(name, qty); }catch(_){} }
  function getItemQuantity(name){ try{ return toInt(w.getItemQuantity? w.getItemQuantity(name):0);}catch(_){return 0;} }
  function removeItem(name, qty){ qty=toInt(qty||1); if(qty<=0) return; try{ w.removeItem && w.removeItem(name, qty); }catch(_){} }
  function dailyKey(){ const d=new Date(); return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate(); }

  // ===== 吐司提示 =====
  function showToast(msg, isError){
    const id = 'toast-mini';
    let el = document.getElementById(id);
    if (!el){
      el = document.createElement('div');
      el.id = id;
      Object.assign(el.style, {
        position: 'fixed', top: '16px', right: '16px', zIndex: '9999',
        background: '#10b981', color: '#0b1220', padding: '8px 12px',
        borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.35)',
        fontWeight: '700', transition: 'transform .2s ease, opacity .2s ease',
        opacity: '0', transform: 'translateY(-6px)'
      });
      document.body.appendChild(el);
      requestAnimationFrame(() =>{ el.style.opacity='1'; el.style.transform='translateY(0)'; });
    }
    el.textContent = msg;
    el.style.background = isError ? '#ef4444' : '#10b981';
    clearTimeout(el._timer);
    el._timer = setTimeout(() =>{
      el.style.opacity='0'; el.style.transform='translateY(-6px)';
      setTimeout(() =>{ if (el && el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, 1600);
  }

  function fmtHMS(sec){
    sec = Math.max(0, toInt(sec));
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    function p(v){return(v<10?'0':'')+v;}
    return p(h)+':'+p(m)+':'+p(s);
  }
  function secUntilReset(){
    const now=new Date(); const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,0,0);
    return Math.max(0, Math.floor((next-now)/1000));
  }

  // ===== 排序鍵與方向 =====
  const SORT_KEYS = ['name','rate','qty','cap']; // 名稱 / 機率 / 獲得數量 / 最大數量
  const SORT_LABEL = { name:'名稱', rate:'機率', qty:'獲得數量', cap:'最大數量' };

  // ===== 命名空間（SaveHub）與版本 =====
  const NS = 'explore';
  const SCHEMA_VER = 2; // v2: 加入排序狀態與票券欄位的保底修補

  // ===== 參數 =====
  const EXPLORE_TICK_SEC=60;          // 每隊每分鐘檢查一次
  const EXPLORE_CAP_PER_LV=0.10;      // 每級 +10% 每日上限
  const EXPLORE_MAX=20;               // 探索等級上限
  const EXPLORE_UP_COST_BASE=500;     // 升級費用：500 × (lv+1)
  const EXPLORE_UP_HOURS=2*3600;      // 升級耗時：2 小時（秒）
  const SQUADS_BASE=1;
  const SQUADS_MAX=3;
  const SQUAD_UNLOCK_COST=3000;

  // === 重置券機制 ===
  const RESET_TICKET_NAME='探索重置券';   // 背包中的票券道具名
  const RESET_TICKET_DAILY_FREE=1;        // 每天免費補發 1 張
  const RESET_TICKET_BASE_CAP=2;          // 免費票券基礎上限（與背包分離）
  const RESET_TICKET_UPGRADE_COST=10000;  // 擴充免費券上限費用
  const ALLOW_EXPAND_RESET_CAP=false;     // 預設不開放（改 true 即可）

  // ===== 探索掉落表 =====
const EXPLORE_TABLE=[
  {name:'鑽石', type:'gem', cap:20, rate:0.01},
  {name:'SP點數券', type:'item', key:'sp點數券', cap:5, rate:0.002},
  {name:'精華', type:'ess_any', cap:30, rate:0.05},
  {name:'技能強化券', type:'item', key:'技能強化券', cap:3, rate:0.001},
  {name:'強化道具兌換券', type:'item', key:'強化道具兌換券', cap:450, rate:0.08},

  {name:'怪物獎牌', type:'item', key:'怪物獎牌', cap:200, rate:0.05},
  {name:'boss挑戰券', type:'item', key:'boss挑戰券', cap:2, rate:0.009},

  {name:'高級探索券', type:'item', key:'高級探索券', cap:3, rate:0.009},
  {name:'生命藥水', type:'item', key:'生命藥水', cap:20, rate:0.019},
  {name:'法力藥水', type:'item', key:'法力藥水', cap:20, rate:0.019},
  {name:'高級生命藥水', type:'item', key:'高級生命藥水', cap:10, rate:0.01},
  {name:'高級法力藥水', type:'item', key:'高級法力藥水', cap:10, rate:0.01},

  // ★★★★★ 新增怪物硬幣 ★★★★★
  {name:'怪物硬幣N',  type:'item', key:'怪物硬幣N',  cap:25, rate:0.0223},
  {name:'怪物硬幣R',  type:'item', key:'怪物硬幣R',  cap:15, rate:0.0185},
  {name:'怪物硬幣SR', type:'item', key:'怪物硬幣SR', cap:10, rate:0.0123},
  {name:'怪物硬幣SSR',type:'item', key:'怪物硬幣SSR',cap:8,  rate:0.0078}
];

  // ===== SaveHub 初始化 =====
  if (w.SaveHub){
    const spec = {}; spec[NS] = {
      version: SCHEMA_VER,
      migrate(old){ return old || {}; }
    };
    w.SaveHub.registerNamespaces(spec);
  }

  // ===== 狀態（SaveHub） =====
  function newSquad(i){return{id:i,name:'隊伍 '+(i+1),enabled:true,lastTick:nowSec(),_carry:0};}

  const DEFAULT_STATE = (function fresh(){
    const s={
      _ver: SCHEMA_VER,
      exploreLv:0,
      exploreUpStart:0,
      exploreLog:[],
      dropsCount:{},
      squads:[],
      // 重置券
      resetTicketCapBonus:0,
      ticketDay:dailyKey(),
      freeTickets:0,
      // 排序預設（數量，降冪）
      dropSortKey:'qty',
      dropSortAsc:false
    };
    for(let i=0;i<SQUADS_BASE;i++) s.squads.push(newSquad(i));
    return s;
  })();

  const state = (w.SaveHub ? w.SaveHub.get(NS, DEFAULT_STATE) : DEFAULT_STATE);
  function persist(){ if (w.SaveHub) w.SaveHub.set(NS, state); }

  // —— 啟動時補欄位（避免舊資料缺欄位）——
  (function migrateFill(){
    state._ver = toInt(state._ver || SCHEMA_VER);
    state.exploreLv = toInt(state.exploreLv || 0);
    state.exploreUpStart = toInt(state.exploreUpStart || 0);
    state.exploreLog = state.exploreLog || [];
    state.dropsCount = state.dropsCount || {};
    state.resetTicketCapBonus = toInt(state.resetTicketCapBonus || 0);
    state.ticketDay = state.ticketDay || dailyKey();
    state.freeTickets = toInt(state.freeTickets || 0);
    if (!state.squads || !state.squads.length){
      state.squads = [];
      for (let i=0;i<SQUADS_BASE;i++) state.squads.push(newSquad(i));
    }
    for (let j=0;j<state.squads.length;j++){
      const q = state.squads[j];
      q.id = toInt(q.id || j);
      q.name = q.name || ('隊伍 '+(q.id+1));
      q.enabled = (q.enabled !== false);
      q.lastTick = toInt(q.lastTick || nowSec());
      q._carry = toInt(q._carry || 0);
    }
    if (!state.dropSortKey) state.dropSortKey = 'qty';
    if (typeof state.dropSortAsc !== 'boolean') state.dropSortAsc = false;
    persist();
  })();

  // ===== 探索等級 & 掉落上限 =====
  function todayCapBase(){
    const out=[];const lv=clamp(state.exploreLv,0,EXPLORE_MAX);
    for(let i=0;i<EXPLORE_TABLE.length;i++){
      const base=EXPLORE_TABLE[i].cap;
      out.push(Math.floor(base*(1+lv*EXPLORE_CAP_PER_LV)));
    }return out;
  }

  function nextExploreCost(){ if(state.exploreLv>=EXPLORE_MAX) return 0; return EXPLORE_UP_COST_BASE*(state.exploreLv+1); }
  function remainUpgradeSec(){
    if(!state.exploreUpStart) return 0;
    const end=state.exploreUpStart+EXPLORE_UP_HOURS;
    return Math.max(0, end-nowSec());
  }
  function tryUpgrade(){
    if(state.exploreLv>=EXPLORE_MAX){ showToast('已達探索等級上限'); return; }
    if(remainUpgradeSec()>0){ showToast('探索等級升級進行中…'); return; }
    const cost=nextExploreCost();
    const gem=toInt(w.player && (w.player.gem||0));
    if(gem<cost){ showToast('⚠️ 您的資源不足：鑽石不足，需要 '+fmt(cost), true); return; }
    w.player.gem=gem-cost;
    state.exploreUpStart=nowSec();
    persist(); upd(); saveGame();
    showToast('探索等級升級開始（約 2 小時）');
  }
  function finishUpgrade(){
    const r=remainUpgradeSec();
    if(r>0 || !state.exploreUpStart) return;
    state.exploreUpStart=0;
    state.exploreLv=clamp(state.exploreLv+1,0,EXPLORE_MAX);
    persist();
    showToast('探索等級升級完成！');
  }

  // ===== 掉落 =====
  function pickOwnedEssence(){
    const prob=['森林精華','沼澤精華','熔岩精華','天水精華','風靈精華','雷光精華','冰霜精華','黯影精華','煉獄精華','聖光精華','核心精華','精華'];
    let c=[],i,key,qty; for(i=0;i<prob.length;i++){ key=prob[i]; qty=getItemQuantity(key); if(qty>0) c.push(key); }
    return c.length? c[(Math.random()*c.length)|0] : null;
  }

  function doExploreOnce(){
    const caps=todayCapBase();
    let gotAny=false;const drops=[];
    for(let i=0;i<EXPLORE_TABLE.length;i++){
      const rec=EXPLORE_TABLE[i];const used=toInt(state.dropsCount[i]||0);const cap=caps[i]; if(used>=cap) continue;
      const rate=Number(rec.rate)||0;
      if(Math.random()<rate){
        if(rec.type==='gem'){
          w.player && (w.player.gem=toInt(w.player.gem||0)+1); drops.push('💎 '+rec.name+' ×1'); gotAny=true;
        }else if(rec.type==='item'){
          addItem(rec.key||rec.name,1); drops.push('📦 '+rec.name+' ×1'); gotAny=true;
        }else if(rec.type==='ess_any'){
          const chosen=pickOwnedEssence() || '精華';
          addItem(chosen,1); drops.push('✨ '+chosen+' ×1'); gotAny=true;
        }
        state.dropsCount[i]=used+1;
      }
    }
    const d=new Date();const hh=d.getHours().toString().padStart(2,'0');const mm=d.getMinutes().toString().padStart(2,'0');
    const line=gotAny?(hh+':'+mm+' 取得：'+drops.join('、')):(hh+':'+mm+' 未獲得任何物品');
    state.exploreLog.unshift(line); if(state.exploreLog.length>30) state.exploreLog.length=30;
    return gotAny;
  }

  // ===== 重置券處理 =====
  function resetTicketCap(){ return RESET_TICKET_BASE_CAP + toInt(state.resetTicketCapBonus||0); }

  function grantDailyTicketIfNeeded(){
    const k=dailyKey();
    if(state.ticketDay!==k){
      state.ticketDay=k;
      const cap=resetTicketCap();
      const before=toInt(state.freeTickets||0);
      const add=Math.min(RESET_TICKET_DAILY_FREE, Math.max(0, cap-before));
      if(add>0){
        state.freeTickets=before+add;
        state.exploreLog.unshift('00:00 補發：🎫 免費重置券 ×'+add);
        if(state.exploreLog.length>30) state.exploreLog.length=30;
      }
      persist(); saveGame();
    }
  }

  function useResetTicket(){
    let usedType=null; // 'free' | 'inv'
    if(toInt(state.freeTickets||0)>0){ state.freeTickets--; usedType='free'; }
    else if(getItemQuantity(RESET_TICKET_NAME)>0){ removeItem(RESET_TICKET_NAME,1); usedType='inv'; }
    if(!usedType) return false;

    // 清空當日進度
    state.dropsCount={};

    // 紀錄
    const d=new Date(); const hh=d.getHours().toString().padStart(2,'0'); const mm=d.getMinutes().toString().padStart(2,'0');
    const label=(usedType==='free'?'免費重置券':RESET_TICKET_NAME);
    state.exploreLog.unshift(hh+':'+mm+' 使用：🎫 '+label+' ×1（已重置掉落上限）');
    if(state.exploreLog.length>30) state.exploreLog.length=30;

    persist(); saveGame();
    return true;
  }

  function tryExpandResetCap(){
    if(!ALLOW_EXPAND_RESET_CAP) return false;
    const gem=toInt(w.player && (w.player.gem||0));
    if(gem<RESET_TICKET_UPGRADE_COST) { showToast('⚠️ 您的資源不足：鑽石不足，需要 '+fmt(RESET_TICKET_UPGRADE_COST), true); return false; }
    w.player.gem=gem-RESET_TICKET_UPGRADE_COST;
    state.resetTicketCapBonus=toInt(state.resetTicketCapBonus||0)+1;
    persist(); upd(); saveGame();
    showToast('免費重置券上限 +1');
    return true;
  }

  // ===== Tick =====
  function tickSquad(q){
    const t=nowSec(); const last=toInt(q.lastTick||t); const realDt=Math.max(0,t-last); q.lastTick=t;
    q._carry=toInt(q._carry||0)+realDt;
    let changed=false;
    while(q.enabled && q._carry>=EXPLORE_TICK_SEC){
      q._carry-=EXPLORE_TICK_SEC;
      doExploreOnce(); changed=true;
    }
    return changed;
  }

  // === 可見性守門（避免覆蓋其他分頁的畫面）===
  let _mounted = false, _container=null;
  function isActiveTab(){
    // TownHub 多半用同一個 container，改頁時會再次呼叫別的 tab 的 render()。
    // 我們在 render() 會標記 data-tab-owner='explore'，不符合時就不重繪。
    return !!(_container && _container.getAttribute && _container.getAttribute('data-tab-owner') === 'explore' && document.body.contains(_container));
  }
  function _rerender(){ if(!_mounted||!_container) return; if(!isActiveTab()) return; render(_container); }

  let _gate=0;
  function tick(sec){
    _gate+=Number(sec)||0; if(_gate<1) return; _gate=0;

    let changed=false;

    // 升級完成檢查
    const beforeLv=state.exploreLv;
    finishUpgrade();
    if(state.exploreLv!==beforeLv) changed=true;

    // 每日免費券
    const beforeDay=state.ticketDay;
    grantDailyTicketIfNeeded();
    if(state.ticketDay!==beforeDay) changed=true;

    // 小隊探索
    if(state.squads && state.squads.length){
      for(let i=0;i<state.squads.length;i++){
        if(tickSquad(state.squads[i])) changed=true;
      }
    }

    if(changed){ persist(); upd(); saveGame(); }

    // ✅ 僅在本分頁為活動頁時才局部重繪
    _rerender();
  }

  // ===== 排序 =====
  function sortDrops(view){
    const key = state.dropSortKey || 'qty';
    const asc = !!state.dropSortAsc;
    view.sort((a,b) =>{
      if(key==='name'){
        const r = String(a.rec.name).localeCompare(String(b.rec.name),'zh-Hant');
        return asc? r : -r;
      }
      if(key==='rate'){
        const ra = Number(a.rec.rate)||0, rb = Number(b.rec.rate)||0;
        if(ra===rb) return String(a.rec.name).localeCompare(String(b.rec.name),'zh-Hant');
        return asc? (ra-rb) : (rb-ra);
      }
      if(key==='cap'){
        const ca = Number(a.cap)||0, cb = Number(b.cap)||0;
        if(ca===cb) return String(a.rec.name).localeCompare(String(b.rec.name),'zh-Hant');
        return asc? (ca-cb) : (cb-ca);
      }
      // qty
      const qa = Number(a.used)||0, qb = Number(b.used)||0;
      if(qa===qb) return String(a.rec.name).localeCompare(String(b.rec.name),'zh-Hant');
      return asc? (qa-qb) : (qb-qa);
    });
  }

  // ===== UI =====
  function bar(p){ p=clamp(p,0,100); return '<div style="height:8px;background:#0b1220;border-radius:999px;overflow:hidden;margin-top:6px"><span style="display:block;height:100%;width:'+p+'%;background:linear-gradient(90deg,#60a5fa,#34d399)"></span></div>'; }
  function card(title,inner){ return '<div style="background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:12px"><div style="font-weight:700;margin-bottom:6px">'+title+'</div>'+inner+'</div>'; }
  function remainPct(){ const rem=remainUpgradeSec(); if(rem<=0) return 0; return Math.floor(((EXPLORE_UP_HOURS-rem)/EXPLORE_UP_HOURS)*100); }
  function squadTickPct(q){ return Math.floor(((toInt(q._carry||0)%EXPLORE_TICK_SEC)/EXPLORE_TICK_SEC)*100); }

  function render(container){
    _mounted = true; _container = container;
    // 🔖 標記這個 container 現在屬於探索分頁，避免其他分頁被覆蓋
    try{ container.setAttribute('data-tab-owner','explore'); }catch(_){}

    const caps=todayCapBase();

    // 建立 view（含已獲得與上限）
    const view=[];
    for(let i=0;i<EXPLORE_TABLE.length;i++){
      const rec=EXPLORE_TABLE[i];
      const used=toInt(state.dropsCount[i]||0);
      const cap=caps[i];
      view.push({rec, idx:i, used, cap});
    }
    sortDrops(view);

    // 掉落行
    let rows='';
    for(let j=0;j<view.length;j++){
      const it=view[j]; const rec=it.rec;
      rows+='\n<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px dashed #1f2937">'+
        '<div>'+rec.name+' <span style="opacity:.7">（機率 '+(((Number(rec.rate)||0)*100).toFixed(2))+'%）</span></div>'+
        '<div><b>'+it.used+'</b> / '+it.cap+'</div></div>';
    }

    // 排序控制
    const sortKey = state.dropSortKey || 'qty';
    const sortAsc = !!state.dropSortAsc;
    const sortCtrl =
      '<div style="display:flex;align-items:center;gap:8px;margin:2px 0 8px 0;opacity:.95;flex-wrap:wrap">'+
        '<div style="opacity:.85">排序：</div>'+
        '<button id="dropSortKeyBtn" style="border:1px solid #1f2937;background:#0b1220;color:#fff;border-radius:999px;padding:6px 12px;cursor:pointer;font-weight:700">'+
          SORT_LABEL[sortKey] +
        '</button>'+
        '<button id="dropSortOrderBtn" style="border:1px solid #1f2937;background:#0b1220;color:#fff;border-radius:999px;padding:6px 12px;cursor:pointer;font-weight:700">'+
          (sortAsc?'低到高':'高到低') +
        '</button>'+
        '<div style="opacity:.6;margin-left:4px">（每秒重繪，按鈕點擊立即生效）</div>'+
      '</div>';

    // 等級升級區
    const rem=remainUpgradeSec();
    const upHtml=(rem>0
      ? '<div style="color:#93c5fd;margin-top:8px">升級中（剩 '+fmt(Math.ceil(rem/60))+' 分）</div>'+bar(remainPct())
      : '<div style="margin-top:8px"><button id="exploreUp" style="background:#4f46e5;border:none;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer" '+(state.exploreLv>=EXPLORE_MAX?'disabled':'')+'>提升探索等級（花費 '+fmt(nextExploreCost())+' 鑽石｜需 2 小時）</button></div>'
    );

    // 小隊卡
    let squadsHtml='';
    for(let i=0;i<state.squads.length;i++){
      const q=state.squads[i];
      const remainS=Math.ceil(EXPLORE_TICK_SEC-(toInt(q._carry||0)%EXPLORE_TICK_SEC));
      squadsHtml += card('👥 '+q.name+(q.enabled?'（運作中）':'（已暫停）'),
        '<div class="mini" style="opacity:.85">下次探索倒數：<b>'+remainS+'s</b></div>'+
        bar(squadTickPct(q))+
        '<div style="margin-top:8px"><button data-sid="'+q.id+'" class="btn-toggle" style="background:#10b981;border:none;color:#0b1220;border-radius:8px;padding:6px 10px;cursor:pointer">'+(q.enabled?'暫停':'啟動')+'</button></div>'
      );
    }

    // 解鎖隊伍
    const canUnlock=state.squads.length<SQUADS_MAX;
    const unlockHtml=canUnlock
      ? '<button id="unlockSquad" style="background:#fbbf24;border:none;color:#0b1220;border-radius:8px;padding:6px 10px;cursor:pointer">解鎖新隊伍（花費 '+fmt(SQUAD_UNLOCK_COST)+' 鑽石）</button>'
      : '<div style="opacity:.7">已達隊伍上限（'+SQUADS_MAX+'）</div>';

    // 紀錄
    const logHtml=(state.exploreLog && state.exploreLog.length
      ? state.exploreLog.map((s) =>{ return '<div style="padding:2px 0;border-bottom:1px dashed #1f2937">'+s+'</div>'; }).join('')
      : '<div style="opacity:.6">（目前沒有紀錄）</div>'
    );

    // 重置券資訊
    const freeCur=toInt(state.freeTickets||0);
    const freeCap=resetTicketCap();
    const invCur=getItemQuantity(RESET_TICKET_NAME);

    const ticketHtml =
      '<div style="display:grid;gap:6px">'+
        '<div>免費重置券：<b>'+fmt(freeCur)+'</b> / '+fmt(freeCap)+'</div>'+
        '<div>背包持有　：<b>'+fmt(invCur)+'</b>（道具：'+RESET_TICKET_NAME+'）</div>'+
        '<div><button id="useResetTicket" '+
          'style="background:#1d4ed8;border:none;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer">'+
        '使用重置券（立即重置掉落上限）</button></div>'+
        '<div style="opacity:.9">免費重置券補發倒數：<b>'+ fmtHMS(secUntilReset()) +'</b></div>'+
      '</div>';

    const expandHtml =
      '<div style="margin-top:8px">'+
      '<button id="expandResetCap" style="background:'+(ALLOW_EXPAND_RESET_CAP?'#22c55e':'#374151')+';border:none;color:#0b1220;border-radius:8px;padding:6px 10px;cursor:'+(ALLOW_EXPAND_RESET_CAP?'pointer':'not-allowed')+'" '+(ALLOW_EXPAND_RESET_CAP?'':'disabled')+'>'+
      '擴充免費重置券上限（花費 '+fmt(RESET_TICKET_UPGRADE_COST)+' 鑽石，上限 +1）</button>'+
      (ALLOW_EXPAND_RESET_CAP?'':'<div style="opacity:.65;margin-top:4px">（目前未開放）</div>')+
      '</div>';

    // 版面
    container.innerHTML =
      card('🎫 探索重置', ticketHtml + expandHtml) +
      card('🔍 探索（多隊）',
        '<div>探索等級：<b>Lv.'+state.exploreLv+' / '+EXPLORE_MAX+'</b>（每級每日上限 +10%）</div>'+
        upHtml+
        '<div style="margin-top:10px;padding-top:6px;border-top:1px solid #1f2937"><b>掉落進度（全隊共享）</b>'+
        sortCtrl + rows + '</div>'
      )+
      card('👥 隊伍管理',
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">'+squadsHtml+'</div>'+
        '<div style="margin-top:10px">'+unlockHtml+'</div>'
      )+
      card('📝 探索紀錄',
        '<div style="max-height:180px;overflow:auto;border:1px solid #1f2937;border-radius:6px;padding:6px 8px;background:#0b1220">'+logHtml+'</div>'
      );

    // === 事件 ===
    const be = byId('exploreUp');
    if (be){
      be.onclick = function(){
        const before = remainUpgradeSec();
        tryUpgrade();
        if (remainUpgradeSec() > 0 && before === 0) showToast('開始升級探索等級');
        _rerender();
      };
    }

    // 小隊啟停
    const buttons = container.querySelectorAll('.btn-toggle');
    for (let i=0;i<buttons.length;i++){
      buttons[i].onclick = function(){
        const sid = toInt(this.getAttribute('data-sid'));
        for (let j=0;j<state.squads.length;j++){
          if (state.squads[j].id===sid){
            state.squads[j].enabled = !state.squads[j].enabled;
            break;
          }
        }
        persist(); _rerender();
      };
    }

    // 解鎖隊伍（補上實作 + 修正訊息）
    const bu = byId('unlockSquad');
    if (bu){
      bu.onclick = function(){
        if (state.squads.length>=SQUADS_MAX) return;
        const gem = toInt(w.player && (w.player.gem||0));
        if (gem < SQUAD_UNLOCK_COST) { showToast('⚠️ 您的資源不足：鑽石不足，需要 '+fmt(SQUAD_UNLOCK_COST), true); return; }
        w.player.gem = gem - SQUAD_UNLOCK_COST;
        const nid = state.squads.length;
        state.squads.push(newSquad(nid));
        persist(); upd(); saveGame();
        showToast('已解鎖新隊伍！');
        _rerender();
      };
    }

    // 擴充免費上限
    const bx = byId('expandResetCap');
    if (bx){
      bx.onclick = function(){
        const ok = tryExpandResetCap();
        if (ok) _rerender();
      };
    }

    // 排序：鍵/方向
    const bk = byId('dropSortKeyBtn');
    const bo = byId('dropSortOrderBtn');
    if (bk){
      bk.onclick = function(){
        let idx = SORT_KEYS.indexOf(state.dropSortKey||'qty');
        if (idx < 0) idx = 0; idx = (idx+1) % SORT_KEYS.length;
        state.dropSortKey = SORT_KEYS[idx];
        persist(); _rerender();
      };
    }
    if (bo){
      bo.onclick = function(){
        state.dropSortAsc = !state.dropSortAsc;
        persist(); _rerender();
      };
    }

    // 重置券使用
    const br = byId('useResetTicket');
    if (br){
      br.onclick = function(){
        const ok = useResetTicket();
        if (!ok) { showToast('⚠️ 沒有可用的重置券', true); return; }
        showToast('已重置今日掉落上限');
        _rerender();
      };
    }
  }

  w.TownHub.registerTab({ id:'explore', title:'探索', render, tick });
})(window);