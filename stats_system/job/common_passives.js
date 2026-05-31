// =======================
// common_passives.js — 共同被動（以「被動能力券」取代被動點）— SaveHub 版（重製版）
// - 優先使用 SaveHub（save_hub_es2020.js）存檔，無則回退 localStorage
// - canLevelUp/levelUp 檢查/扣除道具「被動能力券」
// - UI 顯示「被動能力券：N」；按鈕「升級（消耗 1 張）」
// - 新版：全部技能重製（1~4轉），攻擊/防禦/HP 百分比在本檔讀 core 後換算為平坦寫入 PotentialBonus
// - 穿防(ignoreDefPct)：每個被動獨立回傳（cp_xxx），避免混成一坨
// =======================
(function (w, d) {
  "use strict";
  if (w.CommonPassives) return;

  // ---- 券工具 ----
  function getPassiveTicketCount(){
    try { if (typeof w.getItemQuantity === 'function') return (w.getItemQuantity('被動能力券')|0); } catch(_){}
    return 0;
  }
  function consumePassiveTicket(n){
    n = (n|0)||1;
    try{
      if (typeof w.getItemQuantity === 'function' && typeof w.removeItem === 'function'){
        if ((w.getItemQuantity('被動能力券')|0) >= n){ w.removeItem('被動能力券', n); return true; }
      }
    }catch(_){}
    return false;
  }
  function toast(msg, isError){
    if (typeof w.showToast === 'function') {
      try{ w.showToast(msg, !!isError); return; }catch(_){}
    }
    try{ alert(msg); }catch(_){}
  }

  // ---------- 一次性樣式 ----------
  (function injectStyle(){
    if (d.getElementById('cp-style')) return;
    const css =
      ':root{--cp-bg:#0f172a;--cp-card:#111827;--cp-border:#233047;--cp-text:#e5e7eb;--cp-muted:#9ca3af;--cp-accent:#3b82f6;--cp-accent2:#2563eb;--cp-badge:#0b1220}'+
      '.cp-wrap{display:flex;flex-direction:column;gap:12px}'+
      '.cp-header{display:flex;align-items:center;justify-content:space-between;background:#0b1220;border:1px solid var(--cp-border);border-radius:12px;padding:10px 12px;color:var(--cp-text)}'+
      '.cp-header .title{font-weight:800;letter-spacing:.3px}'+
      '.cp-header .points{font-size:13px;color:#bfdbfe;border:1px solid #1d4ed8;background:#0b1530;padding:4px 8px;border-radius:9999px}'+
      '.cp-card{background:var(--cp-card);border:1px solid var(--cp-border);border-radius:12px;padding:12px;color:var(--cp-text);box-shadow:0 10px 24px rgba(0,0,0,.25)}'+
      '.cp-row{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}'+
      '.cp-main{flex:1 1 auto}'+
      '.cp-name{font-weight:700;font-size:15px;margin-bottom:4px}'+
      '.cp-desc{font-size:13px;color:var(--cp-muted);line-height:1.45}'+
      '.cp-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}'+
      '.cp-pill{font-size:12px;border:1px solid var(--cp-border);border-radius:9999px;padding:2px 8px;color:#cbd5e1;background:var(--cp-badge)}'+
      '.cp-right{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0}'+
      '.cp-level{font-size:12px;color:var(--cp-muted)}'+
      '.btn{background:#1f2937;border:1px solid var(--cp-border);color:#f8fafc;padding:6px 10px;border-radius:8px;cursor:pointer}'+
      '.btn.primary{background:var(--cp-accent);border-color:var(--cp-accent2)}'+
      '.btn.primary:disabled{opacity:.5;cursor:not-allowed}';
    const el = d.createElement('style');
    el.id = 'cp-style'; el.textContent = css; d.head.appendChild(el);
  })();

  // ---------- 工具：判斷玩家目前轉職階段 ----------
  function getPlayerJobTier() {
    try {
      const job = (w.player && w.player.job) ? String(w.player.job) : "";
      const m = job.match(/(\d+)$/);
      return m ? Math.max(1, parseInt(m[1], 10)) : 1;
    } catch(_) {
      return 1;
    }
  }

  // ---------- 定義被動 ----------
  const DEF = [
    // === 一轉（上限 10） ===
    {
      id:"cp_t1_power",
      name:"武藝鍛鍊",
      maxLevel:10,
      minJobTier:1,
      perLevel(lv){
        return { atk: 5 * lv };
      },
      lines(){ return ["每等：攻擊力 +5"]; }
    },
    {
      id:"cp_t1_guard",
      name:"堅守體魄",
      maxLevel:10,
      minJobTier:1,
      perLevel(lv){
        return {
          def: 3 * lv,
          hp:  50 * lv
        };
      },
      lines(){ return ["每等：防禦力 +3，HP +50"]; }
    },
    {
      id:"cp_t1_swiftness",
      name:"迅捷步伐",
      maxLevel:10,
      minJobTier:1,
      perLevel(lv){
        return {
          attackSpeedPct: 0.01 * lv
        };
      },
      lines(){ return ["每等：攻擊速度 +1%"]; }
    },

    // === 二轉（上限 10） ===
    {
      id:"cp_t2_power_up",
      name:"攻擊專精",
      maxLevel:10,
      minJobTier:2,
      perLevel(lv){
        return {
          atkPercent: 0.01 * lv
        };
      },
      lines(){ return ["每等：攻擊力 +1%"]; }
    },
    {
      id:"cp_t2_guard_aura",
      name:"守護光環",
      maxLevel:10,
      minJobTier:2,
      perLevel(lv){
        return {
          defPercent: 0.01 * lv,
          hpPercent:  0.01 * lv
        };
      },
      lines(){ return ["每等：防禦力 +1%，HP +1%"]; }
    },
    {
      id:"cp_t2_hunter",
      name:"狩獵本能",
      maxLevel:10,
      minJobTier:2,
      perLevel(lv){
        return {
          normalDamage: 0.03 * lv
        };
      },
      lines(){ return ["每等：一般怪物傷害 +3%"]; }
    },

    // === 三轉（上限 10） ===
    {
      id:"cp_t3_fortune",
      name:"財運加持",
      maxLevel:10,
      minJobTier:3,
      perLevel(lv){
        return {
          dropBonus: 0.02 * lv,
          goldBonus: 0.02 * lv,
          expBonus:  0.02 * lv
        };
      },
      lines(){ return ["每等：掉寶 / 金幣 / 經驗值 各 +2%"]; }
    },
    {
      id:"cp_t3_armor_pierce",
      name:"穿透秘訣",
      maxLevel:10,
      minJobTier:3,
      perLevel(lv){
        return {
          ignoreDefPct: 0.02 * lv
        };
      },
      lines(){ return ["每等：穿透力 +2%（獨立來源）"]; }
    },
    {
      id:"cp_t3_battle_dance",
      name:"戰鬥之舞",
      maxLevel:10,
      minJobTier:3,
      perLevel(lv){
        return {
          totalDamage:    0.01 * lv,
          attackSpeedPct: 0.02 * lv
        };
      },
      lines(){ return ["每等：總傷害 +1%，攻擊速度 +2%"]; }
    },
    {
      id:"cp_t3_slayer_all",
      name:"制敵專家",
      maxLevel:10,
      minJobTier:3,
      perLevel(lv){
        return {
          normalDamage: 0.01 * lv,
          eliteDamage:  0.01 * lv,
          bossDamage:   0.01 * lv
        };
      },
      lines(){ return ["每等：一般 / 菁英 / Boss 傷害 各 +1%"]; }
    },

    // === 四轉（上限 30） ===
    {
      id:"cp_t4_crit_awaken",
      name:"致命覺醒",
      maxLevel:30,
      minJobTier:4,
      perLevel(lv){
        return {
          critRate:       0.015 * lv,
          critMultiplier: 0.01  * lv
        };
      },
      lines(){ return ["每等：爆擊率 +1.5%，爆擊傷害 +1%"]; }
    },
    {
      id:"cp_t4_boss_master",
      name:"王者制裁",
      maxLevel:30,
      minJobTier:4,
      perLevel(lv){
        return {
          atkPercent:   0.01 * lv,
          totalDamage:  0.01 * lv,
          bossDamage:   0.01 * lv
        };
      },
      lines(){ return ["每等：攻擊力 +1%，總傷害 +1%，Boss 傷害 +1%"]; }
    },
    {
      id:"cp_t4_iron_will",
      name:"不滅鬥志",
      maxLevel:30,
      minJobTier:4,
      perLevel(lv){
        return {
          attackSpeedPct: 0.01  * lv,
          hpPercent:      0.015 * lv,
          defPercent:     0.02  * lv
        };
      },
      lines(){ return ["每等：攻擊速度 +1%，HP +1.5%，防禦力 +2%"]; }
    },
    {
      id:"cp_t4_fortune_god",
      name:"富饒加護",
      maxLevel:30,
      minJobTier:4,
      perLevel(lv){
        return {
          dropBonus: 0.02 * lv,
          expBonus:  0.02 * lv,
          goldBonus: 0.02 * lv
        };
      },
      lines(){ return ["每等：掉寶 / 經驗值 / 金幣 各 +2%"]; }
    }
  ];

  // ---------- 存檔：SaveHub 優先 ----------
  const NS = "common_passives_v2";
  const LS_KEY = "common_passives_v2_fallback";
  const useSaveHub = !!w.SaveHub;

  function fresh(){
    const o={}; for (let i=0;i<DEF.length;i++) o[DEF[i].id]=0; return o;
  }
  function normalize(levels){
    const o = levels || {};
    let i, def, k;
    for (i=0;i<DEF.length;i++) if (!(DEF[i].id in o)) o[DEF[i].id]=0;
    for (k in o){
      if (!o.hasOwnProperty(k)) continue;
      def = null;
      for (i=0;i<DEF.length;i++){ if (DEF[i].id===k){ def=DEF[i]; break; } }
      if (def){
        o[k] = Math.max(0, Math.min(def.maxLevel, Number(o[k]||0)));
      } else {
        o[k] = 0;
      }
    }
    return o;
  }
  if (useSaveHub){
    try{
      const spec={};
      spec[NS] = {
        version:1,
        migrate(old){ return normalize(old||fresh()); }
      };
      w.SaveHub.registerNamespaces(spec);
    }catch(_){}
  }
  function load(){
    try{
      if (useSaveHub) return normalize(w.SaveHub.get(NS, fresh()));
      const raw = w.localStorage && w.localStorage.getItem(LS_KEY);
      return normalize(raw ? JSON.parse(raw)||fresh() : fresh());
    }catch(_){ return fresh(); }
  }
  function save(){
    try{
      if (useSaveHub) w.SaveHub.set(NS, levels);
      else w.localStorage && w.localStorage.setItem(LS_KEY, JSON.stringify(levels));
    }catch(_){}
  }

  const levels = load();

  // ---------- 聚合到 player.coreBonus / PotentialBonus ----------
  function sumBonuses(){
    const out = {
      atk:0, def:0, hp:0,
      str:0, agi:0, int:0, luk:0,

      atkPercent:0,
      defPercent:0,
      hpPercent:0,

      critRate:0,
      critMultiplier:0,
      attackSpeedPct:0,

      expBonus:0,
      dropBonus:0,
      goldBonus:0,

      normalDamage:0,
      eliteDamage:0,
      bossDamage:0,
      totalDamage:0,

      _ignoreDefBySkill:{}
    };

    DEF.forEach((p) =>{
      const lv  = Math.max(0, Math.min(p.maxLevel, Number(levels[p.id]||0)));
      if (!lv) return;
      const add = p.perLevel(lv);
      let k;
      for (k in add){
        if (!add.hasOwnProperty(k)) continue;
        const v = add[k] || 0;
        if (!v) continue;

        if (k === 'ignoreDefPct'){
          if (!out._ignoreDefBySkill[p.id]) out._ignoreDefBySkill[p.id] = 0;
          out._ignoreDefBySkill[p.id] += v;
        } else if (k === 'atkPercent') {
          out.atkPercent += v;
        } else if (k === 'defPercent') {
          out.defPercent += v;
        } else if (k === 'hpPercent') {
          out.hpPercent += v;
        } else {
          out[k] = (out[k] || 0) + v;
        }
      }
    });

    return out;
  }

  function applyToPlayer(){
    if(!w.player || !w.player.coreBonus || !w.player.coreBonus.bonusData) return;
    const bd = w.player.coreBonus.bonusData;
    const sum = sumBonuses();

    // 1) 把總和掛在 common_passives（包含 atkPercent/defPercent/hpPercent）
    bd.common_passives = sum;

    // 2) 清掉舊的 cp_ 開頭穿防節點
    let key;
    for (key in bd){
      if (!bd.hasOwnProperty(key)) continue;
      if (/^cp_/.test(key) && bd[key] && typeof bd[key].ignoreDefPct === 'number'){
        delete bd[key];
      }
    }

    // 3) 每個技能獨立穿透來源：cp_xxx = { ignoreDefPct: ... }
    if (sum._ignoreDefBySkill){
      for (key in sum._ignoreDefBySkill){
        if (!sum._ignoreDefBySkill.hasOwnProperty(key)) continue;
        const v = sum._ignoreDefBySkill[key];
        if (!v) continue;
        bd[key] = bd[key] || {};
        bd[key].ignoreDefPct = v;
      }
    }

    // 4) 攻擊/防禦/HP 百分比 → 讀 core 後換算平坦，寫入 PotentialBonus.common_passives
    try{
      if (w.player.PotentialBonus && w.player.PotentialBonus.bonusData){
        const pbd = w.player.PotentialBonus.bonusData;
        let baseAtk = 0, baseDef = 0, baseHp = 0;

        try { baseAtk = w.player.coreBonus.atk || 0; } catch(_){}
        try { baseDef = w.player.coreBonus.def || 0; } catch(_){}
        try { baseHp  = w.player.coreBonus.hp  || 0; } catch(_){}

        const extraAtk = Math.floor(baseAtk * (sum.atkPercent || 0));
        const extraDef = Math.floor(baseDef * (sum.defPercent || 0));
        const extraHp  = Math.floor(baseHp  * (sum.hpPercent  || 0));

        pbd.common_passives = pbd.common_passives || {};
        pbd.common_passives.atk = extraAtk;
        pbd.common_passives.def = extraDef;
        pbd.common_passives.hp  = extraHp;
      }
    }catch(_){}
  }

  // 將共同被動掛在職業被動 apply 之後
  (function hookAggregate(){
    function tryHook(){
      let ag = null;
      try {
        if (w.JobPassivesCore && w.JobPassivesCore.JobPassivesAggregate) {
          ag = w.JobPassivesCore.JobPassivesAggregate;
        } else if (w.JobPassivesAggregate) {
          ag = w.JobPassivesAggregate;
        } else if (w.JobPassiveAggregate) {
          ag = w.JobPassiveAggregate;
        }
      } catch(_) {}

      if (!ag || typeof ag.apply !== "function") {
        setTimeout(tryHook, 200);
        return;
      }

      if (ag._cpHooked) return;
      ag._cpHooked = true;

      const old = ag.apply.bind(ag);
      ag.apply = function(){
        const r = old();
        try { applyToPlayer(); } catch(_){}
        return r;
      };
    }

    tryHook();
  })();

  // ✅ 讀檔後再套用一次共同被動（利用 GameSave__notifyApplied 鉤子）
  (function hookSaveApplied(){
    const old = w.GameSave__notifyApplied;
    w.GameSave__notifyApplied = function(){
      if (typeof old === 'function') {
        try { old(); } catch(_){}
      }
      try { applyToPlayer(); } catch(_){}
    };
  })();

  // ---------- 升級（吃券 + 檢查轉職階段） ----------
  function canLevelUp(id){
    let def = null;
    let i;
    for (i=0;i<DEF.length;i++){ if(DEF[i].id===id){ def=DEF[i]; break; } }
    if(!def) return {ok:false, reason:'not_found'};
    const cur = levels[id]||0;

    const needTier = def.minJobTier || 1;
    const curTier  = getPlayerJobTier();
    if (curTier < needTier) {
      return { ok:false, reason:'job_tier', need:needTier };
    }

    if (cur >= def.maxLevel) return {ok:false, reason:'max'};
    if (getPassiveTicketCount() <= 0) return {ok:false, reason:'no_ticket'};
    return {ok:true};
  }
  function levelUp(id){
    const res = canLevelUp(id);
    if(!res.ok) return res;
    if (!consumePassiveTicket(1)) return {ok:false, reason:'no_ticket'};
    levels[id] = (levels[id]||0) + 1;
    save(); applyToPlayer();
    try{ if (typeof w.updateResourceUI === 'function') w.updateResourceUI(); }catch(_){}
    return {ok:true, level:levels[id]};
  }

  // ---------- 對外 API ----------
  w.CommonPassives = {
    list(){
      const out = [];
      for (let i=0;i<DEF.length;i++){
        const p = DEF[i];
        const lv = levels[p.id]||0;
        out.push({
          id:p.id,
          name:p.name,
          level:lv,
          maxLevel:p.maxLevel,
          minJobTier:p.minJobTier||1,
          lines:p.lines(),
          bonuses:p.perLevel(lv)
        });
      }
      return out;
    },
    getLevel(id){ return Number(levels[id]||0); },
    setLevel(id, lv){
      let def=null, i;
      for (i=0;i<DEF.length;i++){ if(DEF[i].id===id){ def=DEF[i]; break; } }
      if(!def) return;
      levels[id]=Math.max(0, Math.min(def.maxLevel, Number(lv)||0));
      save(); applyToPlayer();
    },
    levelUp,
    apply: applyToPlayer
  };

  // 初次套用：等 coreBonus + PotentialBonus 都準備好（不管有沒有存檔）
  (function waitPlayer(){
    const p = w.player;
    if (p &&
        p.coreBonus && p.coreBonus.bonusData &&
        p.PotentialBonus && p.PotentialBonus.bonusData) {

      applyToPlayer();
    } else {
      setTimeout(waitPlayer, 50);
    }
  })();

  // ---------- UI 渲染 ----------
  function renderSummaryCard(container){
    const sum = sumBonuses();
    const card = d.createElement('div'); card.className = 'cp-card';
    const title = d.createElement('div'); title.className = 'cp-name'; title.textContent = '📊 總加成概覽';

    const desc = d.createElement('div'); desc.className = 'cp-desc';
    const parts = [];

    if (sum.atk) parts.push('攻擊力 +' + sum.atk);
    if (sum.def) parts.push('防禦力 +' + sum.def);
    if (sum.hp)  parts.push('HP +' + sum.hp);

    if (sum.atkPercent) parts.push('攻擊力 +' + Math.round(sum.atkPercent*100) + '%');
    if (sum.defPercent) parts.push('防禦力 +' + Math.round(sum.defPercent*100) + '%');
    if (sum.hpPercent)  parts.push('HP +'      + Math.round(sum.hpPercent*100)  + '%');

    if (sum.critRate)       parts.push('爆擊率 +'   + Math.round(sum.critRate*1000)/10 + '%');
    if (sum.critMultiplier) parts.push('爆擊傷害 +' + Math.round(sum.critMultiplier*1000)/10 + '%');
    if (sum.attackSpeedPct) parts.push('攻擊速度 +' + Math.round(sum.attackSpeedPct*1000)/10 + '%');

    if (sum.expBonus)  parts.push('經驗值 +' + Math.round(sum.expBonus*1000)/10 + '%');
    if (sum.dropBonus) parts.push('掉寶率 +' + Math.round(sum.dropBonus*1000)/10 + '%');
    if (sum.goldBonus) parts.push('金幣 +'   + Math.round(sum.goldBonus*1000)/10 + '%');

    if (sum.normalDamage) parts.push('一般怪物傷害 +' + Math.round(sum.normalDamage*1000)/10 + '%');
    if (sum.eliteDamage)  parts.push('菁英怪物傷害 +' + Math.round(sum.eliteDamage*1000)/10 + '%');
    if (sum.bossDamage)   parts.push('Boss 傷害 +'     + Math.round(sum.bossDamage*1000)/10 + '%');
    if (sum.totalDamage)  parts.push('總傷害 +'         + Math.round(sum.totalDamage*1000)/10 + '%');

    if (!parts.length){
      desc.textContent = '目前尚未取得任何共同被動加成。';
    } else {
      desc.innerHTML = parts.join('｜');
    }

    card.appendChild(title);
    card.appendChild(desc);
    container.appendChild(card);
  }

  function renderInto(container){
    container.innerHTML = "";
    const wrap = d.createElement('div'); wrap.className = 'cp-wrap';

    const header = d.createElement('div'); header.className = 'cp-header';
    const title = d.createElement('div'); title.className = 'title'; title.textContent = '🧩 共同被動';
    const tickets = getPassiveTicketCount();
    const points = d.createElement('div'); points.className = 'points'; points.textContent = '被動能力券：' + tickets;
    header.appendChild(title); header.appendChild(points); wrap.appendChild(header);

    renderSummaryCard(wrap);

    const list = w.CommonPassives.list();
    list.forEach((p) =>{
      const card = d.createElement('div'); card.className = 'cp-card';
      const row = d.createElement('div'); row.className = 'cp-row';
      const main = d.createElement('div'); main.className = 'cp-main';
      const right = d.createElement('div'); right.className = 'cp-right';

      const name = d.createElement('div'); name.className = 'cp-name'; name.textContent = p.name;
      const desc = d.createElement('div'); desc.className = 'cp-desc';
      desc.innerHTML = p.lines.map((s) =>{return '• '+s;}).join('<br>');
      const badges = d.createElement('div'); badges.className = 'cp-badges';

      const preview = [];
      const b = p.bonuses;

      if (b.atk) preview.push('攻擊力 +' + b.atk);
      if (b.def) preview.push('防禦力 +' + b.def);
      if (b.hp)  preview.push('HP +' + b.hp);
      if (b.str) preview.push('STR +' + b.str);
      if (b.agi) preview.push('AGI +' + b.agi);
      if (b.int) preview.push('INT +' + b.int);
      if (b.luk) preview.push('LUK +' + b.luk);

      if (b.atkPercent) preview.push('攻擊力 +' + Math.round(b.atkPercent*100) + '%');
      if (b.defPercent) preview.push('防禦力 +' + Math.round(b.defPercent*100) + '%');
      if (b.hpPercent)  preview.push('HP +'      + Math.round(b.hpPercent*100)  + '%');

      if (b.critRate)       preview.push('爆擊率 +'   + Math.round(b.critRate*100) + '%');
      if (b.critMultiplier) preview.push('爆擊傷害 +' + Math.round(b.critMultiplier*100) + '%');
      if (b.attackSpeedPct) preview.push('攻擊速度 +' + Math.round(b.attackSpeedPct*100) + '%');
      if (b.ignoreDefPct)   preview.push('穿透 +'     + Math.round(b.ignoreDefPct*100) + '%');

      if (b.expBonus)  preview.push('經驗值 +' + Math.round(b.expBonus*100) + '%');
      if (b.dropBonus) preview.push('掉寶率 +' + Math.round(b.dropBonus*100) + '%');
      if (b.goldBonus) preview.push('金幣 +'   + Math.round(b.goldBonus*100) + '%');

      if (b.normalDamage) preview.push('一般怪物傷害 +' + Math.round(b.normalDamage*100) + '%');
      if (b.eliteDamage)  preview.push('菁英怪物傷害 +' + Math.round(b.eliteDamage*100) + '%');
      if (b.bossDamage)   preview.push('Boss 傷害 +'     + Math.round(b.bossDamage*100) + '%');
      if (b.totalDamage)  preview.push('總傷害 +'         + Math.round(b.totalDamage*100) + '%');

      if (!preview.length) preview.push('尚無加成');
      const pill = d.createElement('span'); pill.className='cp-pill'; pill.textContent = preview.join('｜');
      badges.appendChild(pill);
      main.appendChild(name); main.appendChild(desc); main.appendChild(badges);

      const lv = d.createElement('div'); lv.className = 'cp-level';
      let tierTxt = '';
      if (p.minJobTier && p.minJobTier > 1) {
        const tname = (p.minJobTier===2?'二轉':p.minJobTier===3?'三轉':p.minJobTier===4?'四轉':(p.minJobTier+'轉'));
        tierTxt = '（'+tname+'解鎖）';
      }
      lv.textContent = 'Lv. ' + p.level + ' / ' + p.maxLevel + ' ' + tierTxt;

      const btn = d.createElement('button'); btn.className='btn primary'; btn.textContent='升級（消耗 1 張）';
      const can = canLevelUp(p.id).ok; btn.disabled = !can;
      btn.onclick = function(){
        const res = w.CommonPassives.levelUp(p.id);
        if (!res.ok) {
          if (res.reason==='max') {
            toast('已達上限', true);
          } else if (res.reason==='no_ticket') {
            toast('需要「被動能力券」', true);
          } else if (res.reason==='job_tier') {
            const need = res.need || 1;
            const tierName = (need===2?'二轉':need===3?'三轉':need===4?'四轉':(need+'轉'));
            toast('需要 '+tierName+' 才能升級此被動', true);
          } else {
            toast('無法升級', true);
          }
          return;
        }
        toast('升級成功！');
        renderInto(container);
      };

      right.appendChild(lv); right.appendChild(btn);
      row.appendChild(main); row.appendChild(right); card.appendChild(row); wrap.appendChild(card);
    });

    container.appendChild(wrap);
  }

  // 掛到 SkillsHub
  const hub = (w.SkillsHub && typeof w.SkillsHub.registerTab === 'function' && w.SkillsHub) ||
            (w.skills_hub && typeof w.skills_hub.registerTab === 'function' && w.skills_hub) ||
            null;
  if (hub) {
    hub.registerTab({
      id:'common-passives',
      title:'共同被動',
      render:renderInto,
      onOpen(){ try{ applyToPlayer(); }catch(_){ } },
      onClose(){},
      tick(){}
    });
  }
})(window, document);