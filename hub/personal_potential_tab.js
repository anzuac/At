// personal_potential_tab.js — 個人潛能（上潛能 6 條；N 起；能力方塊=直套；選擇方塊=彈窗）
// ✅ 仿「裝備系統」的獨立存檔版：只使用 localStorage 'equip:pp:v1'；載入不寫檔；修改才嘗試寫檔
// 依賴：growth_hub.js（GrowthHub）
// 可選：player.js（coreBonus / PotentialBonus，用於即時計算加成；寫入失敗會靜默略過）、背包 API（getItemQuantity/addItem/removeItem）

(function (w) {
  "use strict";

  if (!w.GrowthHub) { console.error("❌ personal_potential_tab: GrowthHub 未載入"); return; }

  const TAB_ID = "personalPotential";
  const TAB_TITLE = "個人潛能";

  // ====== 存檔（仿裝備系統：單一 LS key，載入不寫檔，修改才嘗試寫檔）======
  const LS_KEY = "equip:pp:v1";
  function defaultState(){ return { _ver:1, sessionTier:"N", appliedLines:[], used:{ cube:0, select:0 } }; }

  let memState = defaultState(); // 寫檔失敗時的記憶體快取
  function safeLoad(){
    try{
      const raw = w.localStorage.getItem(LS_KEY);
      if (!raw) return defaultState();
      const o = JSON.parse(raw);
      if (!o || typeof o!=="object" || (o._ver|0)!==1) return defaultState();
      // normalize
      o.sessionTier = String(o.sessionTier||"N").toUpperCase();
      o.appliedLines = Array.isArray(o.appliedLines) ? o.appliedLines : [];
      o.used = (o.used && typeof o.used==="object") ? { cube:o.used.cube|0, select:o.used.select|0 } : { cube:0, select:0 };
      return o;
    }catch(_){ return defaultState(); }
  }
  function safePersist(s){
    memState = JSON.parse(JSON.stringify(s)); // 先記憶體安全快照
    try { w.localStorage.setItem(LS_KEY, JSON.stringify(s)); }
    catch(_) { /* 靜默：保留 memState，不影響其他任何存檔系統 */ }
  }
  let state = safeLoad();

  // ====== 物品名稱 / 背包 ======
  const ITEM_CUBE_APPLY  = "能力方塊";       // 點就消耗並直接套用
  const ITEM_CUBE_SELECT = "選擇能力方塊";   // 點就消耗並彈窗（可確認或放棄）
  const HAS_INV = (typeof w.getItemQuantity==="function" && typeof w.addItem==="function" && typeof w.removeItem==="function");
  function invQty(name){ if(!HAS_INV) return 0; try{ return Math.max(0, Number(w.getItemQuantity(name)||0)); }catch(_){ return 0; } }
  function removeItem(name,n){ if(HAS_INV) try{ w.removeItem(name, Math.max(0,Math.floor(n||0))); }catch(_){ } }
  function addItem(name,n){ if(HAS_INV) try{ w.addItem(name, Math.max(0,Math.floor(n||0))); }catch(_){ } }

  // ====== 階級/機率 ======
  const TIER_MULT = { N:1, R:1.5, SR:2, SSR:2.8, UR:3.8, LR:4.6, SLR:6 };

  // 用來判斷「UR 以上才能洗到」的順序
  const TIER_ORDER = { N:0, R:0, SR:0, SSR:2, UR:2.8, LR:3.6, SLR:5 };

  // Session 升階機率：維持舊版（你原本的升階鏈）
  function tryPromote(t){
    t = String(t||"N").toUpperCase();
    if (t==="N"   && Math.random()<0.10)   return "R";
    if (t==="R"   && Math.random()<0.05)   return "SR";
    if (t==="SR"  && Math.random()<0.03)   return "SSR";
    if (t==="SSR" && Math.random()<0.01)   return "UR";
    if (t==="UR"  && Math.random()<0.005)  return "LR";
    if (t==="LR"  && Math.random()<0.0008) return "SLR";
    return t;
  }
  function nextTierChance(from){
    const t = String(from||"N").toUpperCase();
    if (t==="N")  return {to:"R",   p:0.10};
    if (t==="R")  return {to:"SR",  p:0.05};
    if (t==="SR") return {to:"SSR", p:0.03};
    if (t==="SSR")return {to:"UR",  p:0.01};
    if (t==="UR") return {to:"LR",  p:0.005};
    if (t==="LR") return {to:"SLR", p:0.0008};
    return {to:"—", p:0};
  }

  function pickWeighted(arr){
    let sum=0; for (let i=0;i<arr.length;i++) sum += (arr[i].w||0);
    if (sum<=0) return arr[0].v;
    let r=Math.random()*sum, acc=0;
    for (let j=0;j<arr.length;j++){ acc+=(arr[j].w||0); if(r<=acc) return arr[j].v; }
    return arr[arr.length-1].v;
  }

  // 舊版「一般 Session」行階級分布（98/2 那套）——保留給 N/R/SR/SSR/UR 用
  function distFor(sessionTier){
    const T = String(sessionTier||"N").toUpperCase();
    if (T==="N")   return [{v:"N",w:100}];
    if (T==="R")   return [{v:"R",w:100}];
    if (T==="SR")  return [{v:"R",w:98},{v:"SR",w:2}];
    if (T==="SSR") return [{v:"SR",w:98},{v:"SSR",w:2}];
    if (T==="UR")  return [{v:"SSR",w:98},{v:"UR",w:2}];
    if (T==="LR")  return [{v:"UR",w:98},{v:"LR",w:2}];
    if (T==="SLR") return [{v:"LR",w:97},{v:"SLR",w:3}]; // SLR 特例（舊系統用）
    return [{v:"R",w:100}];
  }

  // === 新：6 行行階級機率設定（Session = SLR 時） ===
  // 機率單位用「百分比 %」，方便在 UI 顯示。權重使用同一組數字即可。
  const LINE_DIST_SLR = {
    1: [ {tier:"SLR", p:100} ],
    2: [ {tier:"SLR", p:1},    {tier:"LR",  p:99} ],
    3: [ {tier:"SLR", p:0.5},  {tier:"LR",  p:99.5} ],
    4: [ {tier:"SLR", p:0.25}, {tier:"LR",  p:1.75}, {tier:"UR",  p:98} ],
    5: [ {tier:"SLR", p:0.1},  {tier:"LR",  p:0.4},  {tier:"UR",  p:1},  {tier:"SSR", p:98.5} ],
    6: [ {tier:"SLR", p:0.1},  {tier:"LR",  p:0.4},  {tier:"UR",  p:1},  {tier:"SSR", p:98.5} ]
  };

  // 「往下降一階」對應（用在 Session = LR 時）
  const DOWN_TIER = {
    SLR:"LR",
    LR:"UR",
    UR:"SSR",
    SSR:"SR",
    SR:"R",
    R:"N",
    N:"N"
  };

  // 從 SLR 的配置產生 LR 的行階級分布（全部降一階）
  function getLineDistForSession(sessionTier, lineIndex){
    const T = String(sessionTier||"N").toUpperCase();
    let idx = lineIndex|0;
    if (idx < 1) idx = 1;
    if (idx > 6) idx = 6;

    if (T === "SLR") {
      return LINE_DIST_SLR[idx] || [{tier:"SLR", p:100}];
    }

    if (T === "LR") {
      const base = LINE_DIST_SLR[idx] || [{tier:"SLR", p:100}];
      const merged = {};
      base.forEach((e) =>{
        const toTier = DOWN_TIER[e.tier] || "N";
        merged[toTier] = (merged[toTier] || 0) + (e.p || 0);
      });
      const out = [];
      Object.keys(merged).forEach((k) =>{
        out.push({tier:k, p:merged[k]});
      });
      // 按照階級順序排序（高到低）
      out.sort((a,b) =>{
        const oa = TIER_ORDER[a.tier]||0;
        const ob = TIER_ORDER[b.tier]||0;
        return ob - oa;
      });
      return out;
    }

    // 其他 Session：維持原本邏輯（第一行 = Session，其餘行用 distFor 98/2）
    // 在 decideLineTiers 裡會用 distFor ；這裡只給 info UI 用
    const dist = distFor(T);
    const sum = dist.reduce((s, d) =>{ return s + (d.w||0); }, 0) || 1;
    return dist.map((d) =>{
      return { tier: d.v, p: (d.w || 0) * 100 / sum };
    });
  }

  // === 決定每一行的階級（實際 roll 用） ===
  function decideLineTiers(sessionTier, count){
    const out = [];
    const T = String(sessionTier||"N").toUpperCase();
    let lines = count|0;
    if (lines <= 0) lines = 6;

    for (let i=0; i<lines; i++){
      const lineIndex = i+1;
      // SLR / LR：使用新 6 行配置
      if (T === "SLR" || T === "LR") {
        const distArr = getLineDistForSession(T, lineIndex);
        if (lineIndex === 1) {
          // 第一行如果有「唯一 100%」，直接採用（避免浮點誤差）
          if (distArr.length === 1) {
            out.push(distArr[0].tier);
            continue;
          }
        }
        const pickArr = distArr.map((e) =>{ return {v:e.tier, w:e.p}; });
        out.push(pickWeighted(pickArr));
        continue;
      }

      // 其他 Session：第一行固定 Session，其餘用原本 distFor 分布（98/2）
      if (lineIndex === 1) {
        out.push(T);
      } else {
        const d = distFor(T);
        const tier = pickWeighted(d);
        out.push(tier);
      }
    }
    return out;
  }

  // ====== 詞條池 ======
  // UR以上才能洗到的潛能（type: "pctCore"、minTier:"UR"）：
  // 攻擊力+1~4% 機率0.36%
  // 防禦力+3~7% 機率2.2%
  // HP+7~15%   機率2.9%
  // MP+3~6%    機率2.9%
  // 力量/敏捷/智力/幸運 +1~4% 機率1.11%
  // 全屬性 +1~3% 機率0.88%

  const UPPER_DEFINED = [
    // 一般（舊系統）詞條
    { key:"str",   label:"力量",      type:"flat", min:5,  max:45,  prob:4 },
    { key:"agi",   label:"敏捷",      type:"flat", min:5,  max:45,  prob:4 },
    { key:"int",   label:"智力",      type:"flat", min:5,  max:45,  prob:4 },
    { key:"luk",   label:"幸運",      type:"flat", min:15,  max:45,  prob:4 },
    { key:"allStatFlat", label:"全屬性", type:"flat", min:20, max:50, prob:2 },
    { key:"atk",   label:"攻擊力",    type:"flat", min:17,  max:80, prob:1.5 },
    { key:"attackSpeedPct", label:"攻擊速度", type:"pct", min:2, max:5, prob:3 },
    { key:"totalDamage", label:"總傷害",      type:"pct", min:2, max:4, prob:2 },
    { key:"ignoreDefPct", label:"穿透",       type:"pct", min:0.2, max:1.8, prob:2.3 },
    // { key:"skillDamage",  label:"技能攻擊力", type:"pct", min:1, max:3, prob:3 },
    { key:"critRate",     label:"爆擊率",     type:"pct", min:2, max:4, prob:4 },
    { key:"critMultiplier", label:"爆擊傷害", type:"pct", min:1, max:3, prob:2.1 },

    // ========= UR 以上才能洗到的潛能（走 PotentialBonus，讀 coreBonus）=========
    { key:"coreAtkPct",      label:"攻擊力", type:"pctCore", min:1, max:4,  prob:0.36, minTier:"UR" },
    { key:"coreDefPct",      label:"防禦力", type:"pctCore", min:3, max:7,  prob:2.2,  minTier:"UR" },
    { key:"coreHpPct",       label:"HP",     type:"pctCore", min:7, max:15, prob:2.9,  minTier:"UR" },
    { key:"coreMpPct",       label:"MP",     type:"pctCore", min:3, max:6,  prob:2.9,  minTier:"UR" },
    { key:"coreMainStatPct", label:"主屬性", type:"pctCore", min:1, max:4,  prob:1.11, minTier:"UR" }, // STR/AGI/INT/LUK
    { key:"coreAllStatPct",  label:"全屬性", type:"pctCore", min:1, max:3,  prob:0.88, minTier:"UR" },

    // ========= UR 以上才能洗到的傷害潛能（對象加傷）=========
    { key:"bossDamage",   label:"Boss傷害",     type:"pct", min:1, max:3, prob:0.8, minTier:"UR" },
    { key:"normalDamage", label:"一般怪物傷害", type:"pct", min:5, max:8, prob:1.7, minTier:"UR" },
    { key:"eliteDamage",  label:"菁英怪傷害",   type:"pct", min:3, max:7, prob:1.1, minTier:"UR" },

    // ========= 未標機率者 → 剩餘機率自動均分 =========
    { key:"def",   label:"防禦力",    type:"flat", min:5,  max:20, prob:null },
    { key:"hp",    label:"HP",        type:"flat", min:100,max:400, prob:null },
    { key:"mp",    label:"MP",        type:"flat", min:10, max:30,  prob:null },
    { key:"goldBonus", label:"金幣率", type:"pct",  min:1,  max:4,  prob:null },
    { key:"dropBonus", label:"掉寶率", type:"pct",  min:2,  max:4,  prob:null },
    { key:"expBonus",  label:"經驗率", type:"pct",  min:3,  max:6,  prob:null },
    { key:"dodgePercent", label:"閃避率", type:"pct", min:0.2, max:1, prob:null }
  ];

  (function fillRemainder(defs){
    const fixed = defs.filter((d) =>{return typeof d.prob==="number";})
                    .reduce((s,d) =>{return s+d.prob;},0);
    const rest  = defs.filter((d) =>{return d.prob==null;});
    const rem   = Math.max(0, 100 - fixed);
    const each  = rest.length ? (rem / rest.length) : 0;
    for (let i=0;i<rest.length;i++) rest[i].prob = each;
  })(UPPER_DEFINED);

  function rollOne(defList, tier){
    // UR 以上限定詞條：只有當行階級 >= minTier 才會被當成候選
    let arrDefs = defList.filter((d) =>{
      if (!d.minTier) return true;
      const need = TIER_ORDER[d.minTier] || 0;
      const cur  = TIER_ORDER[tier] || 0;
      return cur >= need;
    });
    if (!arrDefs.length) arrDefs = defList;

    const arr = arrDefs.map((d) =>{ return { v:d, w:d.prob }; });
    const def = pickWeighted(arr);
    const m = TIER_MULT[tier] || 1;
    const isPctType = (def.type === "pct" || def.type === "pctCore");

    if (isPctType) {
      // ⭐ 百分比：用浮點數，保留到小數點第二位
      const vminRaw = def.min * m;
      let vmaxRaw = def.max * m;
      if (vmaxRaw < vminRaw) vmaxRaw = vminRaw;

      const rolled = vminRaw + Math.random() * (vmaxRaw - vminRaw);
      const val = Number(rolled.toFixed(2));     // 實際抽到的％數（例如 0.37）
      const maxAt = Number(vmaxRaw.toFixed(2));  // 該階級理論上限（判斷 MAX 用）

      return {
        tier,
        key:   def.key,
        label: def.label,
        type:  def.type,
        value: val,      // ⚠ 這裡不再是整數，是「百分點」，例如 0.37（=0.37%）
        maxAt
      };
    } else {
      // ⭐ 平坦：維持原本整數邏輯
      const vmin = Math.floor(def.min * m);
      let vmax = Math.floor(def.max * m);
      if (vmax < vmin) vmax = vmin;
      const valInt = vmin + Math.floor(Math.random() * (vmax - vmin + 1));

      return {
        tier,
        key:   def.key,
        label: def.label,
        type:  def.type,
        value: valInt,
        maxAt: vmax
      };
    }
  }

  // ⭐ 現在改成 6 條
  function rollPack(sessionTier){
    const tiers = decideLineTiers(sessionTier, 6), lines=[];
    for (let i=0;i<6;i++) lines.push(rollOne(UPPER_DEFINED, tiers[i]));
    return lines;
  }

  // ====== 計算給 coreBonus 的加總（舊系統部分）======
  function linesToBonus(lines){
    const out = {
      str:0, agi:0, int:0, luk:0, allStatFlat:0,
      atk:0, def:0, hp:0, mp:0,
      attackSpeedPct:0, totalDamage:0, ignoreDefPct:0,
      skillDamage:0,
      critRate:0, critMultiplier:0, dodgePercent:0,
      expBonus:0, dropBonus:0, goldBonus:0,
      // ⭐ 新增對象傷害三條，讓它們有地方累積
      normalDamage:0,
      eliteDamage:0,
      bossDamage:0
    };

    for (let i=0;i<lines.length;i++){
      const L = lines[i];
      const v = Number(L.value)||0;

      if (L.type === "flat") {
        if (L.key === "allStatFlat") {
          out.allStatFlat += v;
        } else if (out.hasOwnProperty(L.key)) {
          out[L.key] += v;
        }
      } else if (L.type === "pct") {
        // ❗ 穿透不在這裡加總，改由 applyToCoreBonus 逐條丟給 player 計算
        if (L.key === "ignoreDefPct") continue;
        out[L.key] = (out[L.key] || 0) + v / 100;
      } else if (L.type === "pctCore") {
        // ❗ UR 以上讀核心 % 潛能在這裡不處理
        //    之後由 recalcPotentialFromCore 根據 coreBonus 動態算 PotentialBonus
        continue;
      }
    }

    // allStatFlat 攤回四維
    if (out.allStatFlat){
      out.str += out.allStatFlat;
      out.agi += out.allStatFlat;
      out.int += out.allStatFlat;
      out.luk += out.allStatFlat;
      out.allStatFlat = 0;
    }

    return out;
  }

  // ====== 動態：依目前 coreBonus + 已套用的 pctCore 行，重算 PotentialBonus 的平坦加成 ======
  function recalcPotentialFromCore(){
    try{
      const p = w.player;
      if (!p || !p.PotentialBonus || !p.PotentialBonus.bonusData) return;

      // pctCore 指定百分比改走「潛能引擎通道」：寫入 _potentialSources -> applyPotentialEngine
      const lines = Array.isArray(state.appliedLines) ? state.appliedLines : [];
      const pctObj = {
        atkPct:0, defPct:0, hpPct:0, mpPct:0,
        strPct:0, agiPct:0, intPct:0, lukPct:0
      };

      lines.forEach((L) =>{
        if (!L || L.type !== "pctCore") return;
        const pct = Number(L.value) || 0; // 百分比（百分點），可為小數
        if (pct <= 0) return;

        switch (L.key) {
          case "coreAtkPct": pctObj.atkPct += pct; break;
          case "coreDefPct": pctObj.defPct += pct; break;
          case "coreHpPct":  pctObj.hpPct  += pct; break;
          case "coreMpPct":  pctObj.mpPct  += pct; break;
          case "coreMainStatPct":
            pctObj.strPct += pct;
            pctObj.agiPct += pct;
            pctObj.intPct += pct;
            pctObj.lukPct += pct;
            break;
          case "coreAllStatPct":
            // 全屬性：沿用舊行為（四維 + ATK/DEF/HP/MP 都吃到）
            pctObj.strPct += pct;
            pctObj.agiPct += pct;
            pctObj.intPct += pct;
            pctObj.lukPct += pct;
            pctObj.atkPct += pct;
            pctObj.defPct += pct;
            pctObj.hpPct  += pct;
            pctObj.mpPct  += pct;
            break;
        }
      });

      // Clear legacy derived-flat bucket to avoid double counting
      if (p.PotentialBonus && p.PotentialBonus.bonusData && p.PotentialBonus.bonusData.PersonalPotentialCoreFlat) {
        delete p.PotentialBonus.bonusData.PersonalPotentialCoreFlat;
      }

      // Write pct source for potential_engine
      p._potentialSources = p._potentialSources || {};
      p._potentialSources.PersonalPotentialPct = pctObj;

      if (typeof w.applyPotentialEngine === "function") {
        w.applyPotentialEngine(p);
      } else {
        // Fallback: if engine not loaded, do nothing (UI仍可顯示 pct，但不會換算平坦)
      }

      if (typeof w.updateResourceUI === "function") w.updateResourceUI();
    }catch(_){
      // silent
    }
  }

  // ====== 寫回 coreBonus（舊邏輯 + 新增穿透/潛能平坦）======
  function applyToCoreBonus(bonus, lines){
    try{
      const CB = w.player && w.player.coreBonus;
      if (!CB || !CB.bonusData) return;

      // 1) 舊邏輯：非 pctCore / 非穿透 的潛能 → 進 coreBonus
      CB.bonusData.PersonalPotential = bonus;

      // 2) 清掉舊的穿透來源（本模組用的 namespace）
      Object.keys(CB.bonusData).forEach((k) =>{
        if (k.indexOf("PersonalPotential_ign") === 0) {
          delete CB.bonusData[k];
        }
      });

      // 3) 每一條 ignoreDefPct → 獨立一筆來源，讓 player 自己做遞減合成
      if (Array.isArray(lines)){
        let idx = 0;
        lines.forEach((L) =>{
          if (L.key === "ignoreDefPct"){
            const v = Number(L.value)||0;
            if (v <= 0) return;
            const key = "PersonalPotential_ign" + (idx++);
            CB.bonusData[key] = { ignoreDefPct: v / 100 };
          }
        });
      }

      // 4) 依目前 coreBonus + 已套用的 pctCore 行，動態重算 PotentialBonus
      recalcPotentialFromCore();

    }catch(_){
      // 靜默
    }
  }

  // ====== 主流程 ======
  function rollWithPromotion(){
    state.sessionTier = tryPromote(state.sessionTier);
    return rollPack(state.sessionTier);
  }
  function applyLines(lines){
    state.appliedLines = lines.slice();
    applyToCoreBonus(linesToBonus(lines), lines);
    safePersist(state); // 仿裝備系統：只有「動作完成」才嘗試寫檔
  }

  // ====== UI 元件 ======
  const TIER_STYLE = {
    N:{bg:"#1f2937", fg:"#e5e7eb", br:"#374151"},
    R:{bg:"#334155", fg:"#e5e7eb", br:"#475569"},
    SR:{bg:"#1d4ed8", fg:"#fff", br:"#1e40af"},
    SSR:{bg:"#7c3aed", fg:"#fff", br:"#5b21b6"},
    UR:{bg:"#0ea5e9", fg:"#0b1220", br:"#0369a1"},
    LR:{bg:"#f59e0b", fg:"#0b1220", br:"#b45309"},
    SLR:{bg:"#f43f5e", fg:"#fff", br:"#9f1239"}
  };
  function badgeTier(t, large){
    const s=TIER_STYLE[t]||TIER_STYLE.N, pad=large?"3px 8px":"2px 6px", fs=large?"12px":"11px";
    const span=document.createElement("span");
    span.textContent=t;
    span.style.cssText="display:inline-block;padding:"+pad+";border:1px solid "+s.br+";background:"+s.bg+";color:"+s.fg+";border-radius:"+(large?"999px":"10px")+";font-weight:800;font-size:"+fs+";letter-spacing:.5px";
    return span;
  }
  function tagMax(){
    const x=document.createElement("span");
    x.textContent="MAX";
    x.style.cssText="display:inline-block;padding:2px 6px;border:1px solid #065f46;background:#22c55e;color:#0b1220;border-radius:999px;font-weight:900;font-size:10px;letter-spacing:.5px;margin-left:6px";
    return x;
  }
  function smallIcon(key){
    const map={ str:"💪",agi:"🏃",int:"🧠",luk:"🍀",allStatFlat:"✨",
              atk:"⚔️",def:"🛡️",hp:"❤️",mp:"🔷",
              attackSpeedPct:"⏩", totalDamage:"📈", ignoreDefPct:"🗡️", skillDamage:"💥",
              critRate:"🎯", critMultiplier:"💣", dodgePercent:"🌀",
              expBonus:"📚", dropBonus:"🎁", goldBonus:"💰",
              coreAtkPct:"⚔️", coreDefPct:"🛡️", coreHpPct:"❤️", coreMpPct:"🔷",
              coreMainStatPct:"✨", coreAllStatPct:"🌟",
              normalDamage:"👾", eliteDamage:"💀", bossDamage:"👹" };
    return map[key]||"•";
  }
  function fmtLineNode(L){
    const unit=(L.type==="pct" || L.type==="pctCore")?"%":""; // pctCore 也顯示 %
    const row=document.createElement("div");
    row.style.cssText="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border:1px solid #1f2937;border-radius:10px;background:#0b1220";
    const left=document.createElement("div"); left.style.cssText="display:flex;align-items:center;gap:8px;min-width:0";
    const icon=document.createElement("span"); icon.textContent=smallIcon(L.key);
    const name=document.createElement("span"); name.textContent=L.label; name.style.cssText="font-weight:700";
    const tierB=badgeTier(L.tier,false);
    left.appendChild(tierB); left.appendChild(icon); left.appendChild(name);
    const right=document.createElement("div"); right.style.cssText="white-space:nowrap;font-weight:800";
    right.textContent="+"+L.value+unit;
    if (L.maxAt!=null && L.value>=L.maxAt){ right.appendChild(tagMax()); row.style.borderColor="#22c55e"; row.style.boxShadow="0 0 0 1px rgba(34,197,94,.25) inset"; }
    row.appendChild(left); row.appendChild(right); return row;
  }
  function listBlock(titleText, lines){
    const card=document.createElement("div"); card.style.cssText="background:#0b1220;border:1px solid #1f2937;border-radius:12px;padding:10px";
    const title=document.createElement("div"); title.textContent=titleText; title.style.cssText="font-weight:800;margin-bottom:6px";
    card.appendChild(title);
    if (!lines||!lines.length){ const empty=document.createElement("div"); empty.textContent="（無）"; empty.style.cssText="opacity:.75"; card.appendChild(empty); return card; }
    const stack=document.createElement("div"); stack.style.cssText="display:flex;flex-direction:column;gap:6px";
    for (let i=0;i<lines.length;i++) stack.appendChild(fmtLineNode(lines[i]));
    card.appendChild(stack); return card;
  }
  function sectionHeader(title, rightNode){
    const head=document.createElement("div"); head.style.cssText="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px";
    const t=document.createElement("div"); t.textContent=title; t.style.cssText="font-weight:900;color:#93c5fd"; head.appendChild(t);
    if (rightNode) head.appendChild(rightNode); return head;
  }

  // ====== 詳細資訊彈窗 ======
  function openInfoModal(){
    const bd=document.createElement("div");
    bd.style.cssText="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);z-index:10000;padding:12px;";
    const wbox=document.createElement("div");
    wbox.style.cssText="width:min(900px,96vw);max-height:92vh;overflow:auto;background:#111827;color:#e5e7eb;border:1px solid #334155;border-radius:12px;padding:12px;box-shadow:0 12px 36px rgba(0,0,0,.5)";

    const head=document.createElement("div");
    head.style.cssText="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:900";
    head.innerHTML="<div>📊 潛能規則 / 機率（上）</div>";
    const close=document.createElement("button");
    close.textContent="關閉";
    close.style.cssText="background:#334155;color:#fff;border:0;padding:6px 10px;border-radius:8px;cursor:pointer";
    close.onclick=function(){ document.body.removeChild(bd); };
    head.appendChild(close);
    wbox.appendChild(head);

    // 頂部資訊
    const row1=document.createElement("div");
    row1.style.cssText="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px;opacity:.95";
    row1.appendChild(document.createTextNode("本次 Session 階級："));
    row1.appendChild(badgeTier(state.sessionTier, true));
    const nxt=nextTierChance(state.sessionTier);
    const tip=document.createElement("span");
    tip.textContent=(nxt.p>0)?("下一階 "+nxt.to+" 機率 "+(nxt.p*100).toFixed(2)+"%（每次洗）"):"已達最高階";
    row1.appendChild(tip);
    wbox.appendChild(row1);

    const rule=document.createElement("div");
    rule.style.cssText="opacity:.9;line-height:1.6;margin:6px 0";
    rule.innerHTML="下表「行階級機率」與「詞條機率」皆直接讀取系統目前設定，不再寫死。<br>「當前階級可能值」已套用 Session 階級的倍數（如 UR = ×5、SLR = ×10），基準 N 值不另行顯示。";
    wbox.appendChild(rule);

    // === 行階級機率表 ===
    const lineTable=document.createElement("table");
    lineTable.style.cssText="width:100%;border-collapse:collapse;font-size:12px;color:#e5e7eb;margin-bottom:10px";
    const lh=document.createElement("tr");
    ["行數","階級機率（依目前 Session）"].forEach((h) =>{
      const th=document.createElement("th");
      th.textContent=h;
      th.style.cssText="border:1px solid #263247;padding:5px;text-align:center;background:#0f172a";
      lh.appendChild(th);
    });
    lineTable.appendChild(lh);

    for (let lineIdx=1; lineIdx<=6; lineIdx++){
      const distArr = getLineDistForSession(state.sessionTier, lineIdx);
      // 正規化成 100%
      const sumP = distArr.reduce((s,e) =>{return s+(e.p||0);},0) || 1;
      const desc = distArr.map((e) =>{
        const pct = (e.p * 100 / sumP);
        return e.tier + " " + pct.toFixed(2) + "%";
      }).join(" / ");

      const tr=document.createElement("tr");
      const tdLine=document.createElement("td");
      tdLine.textContent="第 "+lineIdx+" 行";
      tdLine.style.cssText="border:1px solid #263247;padding:5px;text-align:center";
      const tdDesc=document.createElement("td");
      tdDesc.textContent=desc;
      tdDesc.style.cssText="border:1px solid #263247;padding:5px;text-align:left";
      tr.appendChild(tdLine);
      tr.appendChild(tdDesc);
      lineTable.appendChild(tr);
    }
    wbox.appendChild(lineTable);

    // === 詞條規則表（只顯示「當前階級可能值 + 詞條機率」） ===
    const tbl=document.createElement("table");
    tbl.style.cssText="width:100%;border-collapse:collapse;font-size:12px;color:#e5e7eb";
    const headRow=document.createElement("tr");
    ["詞條","當前階級可能值","詞條機率%"].forEach((h) =>{
      const th=document.createElement("th");
      th.textContent=h;
      th.style.cssText="border:1px solid #263247;padding:5px;text-align:center;background:#0f172a";
      headRow.appendChild(th);
    });
    tbl.appendChild(headRow);

    const mult = TIER_MULT[state.sessionTier] || 1;
    for (let i = 0; i < UPPER_DEFINED.length; i++) {
      const d  = UPPER_DEFINED[i], tr=document.createElement("tr");
      const isPct = (d.type === "pct" || d.type === "pctCore");

      // 先算「原始」範圍；pct 不砍小數，flat 才 floor
      const minRaw = d.min * mult;
      let maxRaw = d.max * mult;
      if (maxRaw < minRaw) maxRaw = minRaw;

      const label = d.label;
      const rangeStr = isPct
        ? (minRaw.toFixed(2) + "% ~ " + maxRaw.toFixed(2) + "%")
        : (Math.floor(minRaw) + " ~ " + Math.floor(maxRaw));

      const probStr = Number(d.prob).toFixed(2);

      [ label, rangeStr, probStr ].forEach((txt, idx) =>{
        const td=document.createElement("td");
        td.textContent=txt;
        td.style.cssText="border:1px solid #263247;padding:5px;text-align:"+(idx===0?"left":"center");
        tr.appendChild(td);
      });
      tbl.appendChild(tr);
    }
    wbox.appendChild(tbl);

    bd.appendChild(wbox);
    bd.addEventListener("click", (e) =>{ if(e.target===bd) document.body.removeChild(bd); });
    document.body.appendChild(bd);
  }

  // ====== 選擇方塊彈窗 ======
  function openSelectModal(rolled){
    const bd=document.createElement("div");
    bd.style.cssText="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);z-index:10000;padding:12px;";
    const wbox=document.createElement("div");
    wbox.style.cssText="width:min(560px,96vw);max-height:92vh;overflow:auto;background:#111827;color:#e5e7eb;border:1px solid #334155;border-radius:12px;padding:12px;box-shadow:0 12px 36px rgba(0,0,0,.5)";

    const head=document.createElement("div");
    head.style.cssText="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:900";
    head.innerHTML="<div>✨ 本次洗出結果（已消耗「選擇能力方塊」×1）</div>";
    const close=document.createElement("button");
    close.textContent="關閉";
    close.style.cssText="background:#334155;color:#fff;border:0;padding:6px 10px;border-radius:8px;cursor:pointer";
    close.onclick=function(){ document.body.removeChild(bd); };
    head.appendChild(close);
    wbox.appendChild(head);

    const tip=document.createElement("div");
    tip.style.cssText="opacity:.85;margin-bottom:6px";
    tip.textContent="你可以選擇「確認套用」或「放棄本次」。不論是否套用，道具都已消耗。";
    wbox.appendChild(tip);

    const list=document.createElement("div");
    list.style.cssText="display:flex;flex-direction:column;gap:6px;margin-bottom:10px";
    for (let i=0;i<rolled.length;i++) list.appendChild(fmtLineNode(rolled[i]));
    wbox.appendChild(list);

    const ops=document.createElement("div");
    ops.style.cssText="display:flex;gap:8px;justify-content:flex-end";
    const confirm=document.createElement("button");
    confirm.textContent="確認套用";
    confirm.style.cssText="background:#2563eb;color:#fff;border:0;padding:8px 12px;border-radius:10px;cursor:pointer;font-weight:800";
    confirm.onclick=function(){
      applyLines(rolled);
      document.body.removeChild(bd);
      if (w.GrowthHub) w.GrowthHub.requestRerender();
      if (w.logPrepend) w.logPrepend("✨ 已套用選擇方塊結果");
    };
    const giveup=document.createElement("button");
    giveup.textContent="放棄本次";
    giveup.style.cssText="background:#374151;color:#fff;border:0;padding:8px 12px;border-radius:10px;cursor:pointer;font-weight:800";
    giveup.onclick=function(){
      document.body.removeChild(bd);
      if (w.GrowthHub) w.GrowthHub.requestRerender();
      if (w.logPrepend) w.logPrepend("🗑️ 放棄本次結果（道具已消耗）");
    };
    ops.appendChild(giveup); ops.appendChild(confirm);
    wbox.appendChild(ops);

    bd.appendChild(wbox);
    bd.addEventListener("click", (e) =>{ if(e.target===bd) document.body.removeChild(bd); });
    document.body.appendChild(bd);
  }

  // ====== 主 UI（上半部） ======
  function renderHeader(container){
    const card=document.createElement("div");
    card.style.cssText="background:#0b1220;border:1px solid #263247;border-radius:12px;padding:10px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap";
    const left=document.createElement("div");
    left.style.cssText="display:flex;align-items:center;gap:8px";
    left.appendChild(document.createTextNode("Session 階級："));
    left.appendChild(badgeTier(state.sessionTier, true));
    card.appendChild(left);

    const right=document.createElement("div");
    const info=document.createElement("button");
    info.textContent="查看詳細資訊（機率與規則）";
    info.style.cssText="background:#1f2937;color:#e5e7eb;border:1px solid #334155;padding:8px 12px;border-radius:10px;cursor:pointer;font-weight:800";
    info.onclick=openInfoModal;
    right.appendChild(info);
    card.appendChild(right);

    container.appendChild(card);
  }

  function renderApplyPanel(container){
    const wrapper=document.createElement("div");
    wrapper.style.cssText="background:#0b1220;border:1px solid #334155;border-radius:12px;padding:10px";
    const right=document.createElement("div"); right.appendChild(badgeTier(state.sessionTier, true));
    wrapper.appendChild(sectionHeader("上潛能（6條；N 起；只升不降）", right));

    const grid=document.createElement("div");
    grid.style.cssText="display:grid;grid-template-columns:1fr;gap:10px;align-items:start";
    grid.appendChild(listBlock("已套用", state.appliedLines));
    wrapper.appendChild(grid);

    const ops=document.createElement("div");
    ops.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px";
    function mkBtn(txt,bg,fg,on){
      const btn=document.createElement("button");
      btn.textContent=txt;
      btn.onclick=on;
      btn.style.cssText="background:"+bg+";color:"+fg+";border:1px solid #1f2937;padding:8px 12px;border-radius:10px;font-weight:800;cursor:pointer;box-shadow:0 2px 0 rgba(0,0,0,.25)";
      return btn;
    }

    const btnApply=mkBtn("能力方塊（立即套用）","linear-gradient(180deg,#16a34a,#15803d)","#fff", () =>{
      if (invQty(ITEM_CUBE_APPLY) < 1){ alert("缺少「"+ITEM_CUBE_APPLY+"」"); return; }
      removeItem(ITEM_CUBE_APPLY, 1);
      const rolled=rollWithPromotion();
      applyLines(rolled);
      state.used.cube=(state.used.cube|0)+1; safePersist(state);
      if (w.GrowthHub) w.GrowthHub.requestRerender();
      if (w.logPrepend) w.logPrepend("✨ 能力方塊：已消耗並立即套用");
    });

    const btnSelect=mkBtn("選擇能力方塊（彈窗）","linear-gradient(180deg,#f59e0b,#d97706)","#0b1220", () =>{
      if (invQty(ITEM_CUBE_SELECT) < 1){ alert("缺少「"+ITEM_CUBE_SELECT+"」"); return; }
      removeItem(ITEM_CUBE_SELECT, 1);
      const rolled=rollWithPromotion();
      state.used.select=(state.used.select|0)+1; safePersist(state);
      openSelectModal(rolled);
    });

    const note=document.createElement("div");
    note.style.cssText="opacity:.85;font-size:12px;margin-top:6px;line-height:1.6";
    note.innerHTML="說明：<b>能力方塊</b>會在點擊後立即消耗並套用；<b>選擇能力方塊</b>會在點擊後立即消耗並彈出結果，你可選擇套用或放棄。";

    ops.appendChild(btnApply);
    ops.appendChild(btnSelect);
    wrapper.appendChild(ops);
    wrapper.appendChild(note);

    container.appendChild(wrapper);
  }

  // ====== 最下面顯示層：左 coreBonus / 右 PotentialBonus（方格＋顏色靠 CSS） ======
  function renderSummaryPanel(container){
    const card = document.createElement("div");
    card.className = "pp-summary-card";

    const title = document.createElement("div");
    title.className = "pp-summary-title";
    title.textContent = "加成總覽";
    card.appendChild(title);

    const row = document.createElement("div");
    row.className = "pp-summary-row";

    function buildGridCol(titleText, source, extraClass){
      const col = document.createElement("div");
      col.className = "pp-summary-col " + (extraClass || "");

      const head = document.createElement("div");
      head.className = "pp-summary-col-title";
      head.textContent = titleText;
      col.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "pp-summary-grid";

      if (!source){
        const cell = document.createElement("div");
        cell.className = "pp-summary-cell";
        cell.textContent = "（無資料或尚未載入 player）";
        grid.appendChild(cell);
      } else {
        function addCell(label, value){
          const cell = document.createElement("div");
          const vnum = Number(value) || 0;
          cell.className = "pp-summary-cell " + (vnum === 0 ? "zero" : "nonzero");

          const lab = document.createElement("div");
          lab.className = "pp-summary-cell-label";
          lab.textContent = label;

          const val = document.createElement("div");
          val.className = "pp-summary-cell-value";
          val.textContent = value;

          cell.appendChild(lab);
          cell.appendChild(val);
          grid.appendChild(cell);
        }

        addCell("STR", source.str|0);
        addCell("AGI", source.agi|0);
        addCell("INT", source.int|0);
        addCell("LUK", source.luk|0);
        addCell("ATK", source.atk|0);
        addCell("DEF", source.def|0);
        addCell("HP",  source.hp|0);
        addCell("MP",  source.mp|0);
        addCell("總傷害%", ((source.totalDamage||0)*100).toFixed(1));
        addCell("穿透%",   ((source.ignoreDefPct||0)*100).toFixed(2));
      }

      col.appendChild(grid);
      return col;
    }

    let coreSrc = null, potSrc = null;
    try {
      if (w.player && w.player.coreBonus){
        coreSrc = {
          str: w.player.coreBonus.str || 0,
          agi: w.player.coreBonus.agi || 0,
          int: w.player.coreBonus.int || 0,
          luk: w.player.coreBonus.luk || 0,
          atk: w.player.coreBonus.atk || 0,
          def: w.player.coreBonus.def || 0,
          hp:  w.player.coreBonus.hp  || 0,
          mp:  w.player.coreBonus.mp  || 0,
          totalDamage: w.player.coreBonus.totalDamage || 0,
          ignoreDefPct: 0 // 真實穿透可改用 getIgnoreDefBreakdown
        };
      }
      if (w.player && w.player.PotentialBonus){
        const PB = w.player.PotentialBonus;

        potSrc = {
          str: (PB.str || 0),
          agi: (PB.agi || 0),
          int: (PB.int || 0),
          luk: (PB.luk || 0),
          atk: (PB.atk || 0),
          def: (PB.def || 0),
          hp:  (PB.hp  || 0),
          mp:  (PB.mp  || 0),
          totalDamage: PB.totalDamage || 0,
          ignoreDefPct: PB.ignoreDefPct || 0
        };
      }
    } catch(_) {}

    row.appendChild(buildGridCol("基礎能力", coreSrc, "pp-summary-core"));
    row.appendChild(buildGridCol("潛能加成", potSrc, "pp-summary-pot"));
    card.appendChild(row);
    container.appendChild(card);
  }

  function render(container){
    container.innerHTML="";
    renderHeader(container);
    renderApplyPanel(container);
    renderSummaryPanel(container); // 下方左右顯示 core / potential
  }

  // ====== 註冊到 GrowthHub ======
  w.GrowthHub.registerTab({ id:TAB_ID, title:TAB_TITLE, render });

  // ====== 匯出 / 套用（供中央系統使用）======
  w.PP_exportState = function(){
    return JSON.parse(JSON.stringify(state));
  };
  w.PP_applyState = function(s){
    if (!s || typeof s!=="object") return;
    const n = defaultState();
    n.sessionTier = String(s.sessionTier||n.sessionTier).toUpperCase();
    n.appliedLines = Array.isArray(s.appliedLines) ? s.appliedLines : n.appliedLines;
    if (s.used && typeof s.used==="object"){
      n.used.cube = s.used.cube|0; n.used.select = s.used.select|0;
    }
    state = n; safePersist(state);
    recalcPotentialFromCore(); // 套用外部狀態時也重算一次潛能平坦
    if (w.GrowthHub) w.GrowthHub.requestRerender();
  };

  // ====== 讓潛能跟著 coreBonus 動（每 2 秒檢查一次）======
  setInterval(() =>{
    recalcPotentialFromCore();
  }, 2000);

})(window);