// quest_achievements_es2020.js — 成就系統（進度條＋美化 ES2020+；主屬性/攻防幾何門檻 + 等級階段鑽石券）
(function(){
  // —— 獎勵道具 —— //
  const REWARD_ITEM = "sp點數券";          // 既有成就獎勵
  const LEVEL_TICKET_ITEM = "被動能力券";   // 等級成就相關，被動能力券
  const LEVEL_STAGE_BONUS_ITEM = "鑽石抽獎券"; // ★新增：每個等級階段 +1 張

  // —— 獎勵常數 —— //
  const REWARD_PER_STAGE_PRIMARY = 5;  // 主屬性（每階 +5）
  const REWARD_PER_STAGE_AD      = 5;  // 攻擊/防禦（每階 +5）
  const REWARD_PER_STAGE_DEFAULT = 2;  // 探索三率 / 擊殺
  const REWARD_PER_STAGE_COMBAT  = 5;  // 技能傷害 / 攻速 / 總傷害
  const REWARD_PER_STAGE_DAMAGE  = 20; // 累積傷害
  const REWARD_PER_STAGE_ELITE   = 10;
  const REWARD_PER_STAGE_BOSS    = 20;
  const LEVEL_STAGE_BONUS_PER_STAGE = 1; // ★每達成 1 個等級階段，+1 鑽石抽獎券

  // —— 門檻常數 —— //
  const LV_UNIT     = 10;        // 等級：每 10 等一階
  const KILL_UNIT   = 1000;
  const ELITE_UNIT  = 100;
  const BOSS_UNIT   = 10;
  const DAMAGE_UNIT = 5000000;
  const GEO_GROWTH  = 1.25;      // +25%
  const PRIMARY_UNIT = 100;      // 主屬性幾何門檻起點
  const AD_UNIT      = 100;      // ATK/DEF 幾何門檻起點
  const ATTR_GROWTH  = 1.25;     // 與 GEO_GROWTH 一致

  // —— 數學工具 —— //
  function floor(n){ return Math.floor(Number(n)||0); }
  function clamp01(x){ return Math.max(0, Math.min(1, x)); }

  // —— 幾何門檻 —— //
  function geoStage(total, unit, G){
    total = Number(total)||0; if (total <= 0) return 0;
    const x = (total * (G - 1) / unit) + 1;
    if (x <= 1) return 0;
    return Math.max(0, floor(Math.log(x) / Math.log(G)));
  }
  function geoCumForStage(s, unit, G){
    if (s <= 0) return 0;
    return unit * (Math.pow(G, s) - 1) / (G - 1);
  }

  // —— SaveHub 狀態 —— //
  // 需先於此檔案前載入 save_hub_es2020.js
  if (typeof window.SaveHub === "undefined"){
    console.warn("[Achievements] SaveHub not found; achievements will still work but won't be centrally managed.");
  }
  if (window.SaveHub){
    window.SaveHub.registerNamespaces({
      achievements: {
        version: 1,
        migrate(oldObj){ return oldObj || {}; } // 預留版控；目前無遷移
      }
    });
  }

  let state = (window.SaveHub
    ? window.SaveHub.get('achievements', {
        stages: {
          level:0,
          str:0, agi:0, int:0, luk:0,
          atk:0, def:0,
          skill:0, aspd:0, totalDmgBonus:0,
          exp:0, drop:0, gold:0,
          kill:0, elite:0, boss:0, dmg:0
        },
        counters: { kills:0, eliteKills:0, bossKills:0, totalDamage:0, lastLevel:null }
      })
    : {
        stages: {
          level:0,
          str:0, agi:0, int:0, luk:0,
          atk:0, def:0,
          skill:0, aspd:0, totalDmgBonus:0,
          exp:0, drop:0, gold:0,
          kill:0, elite:0, boss:0, dmg:0
        },
        counters: { kills:0, eliteKills:0, bossKills:0, totalDamage:0, lastLevel:null }
      }
  );
  function persist(){
    if (window.SaveHub){ window.SaveHub.set('achievements', state); }
    else { try{ localStorage.setItem("ACH_TMP_FALLBACK", JSON.stringify(state)); }catch(_){ } }
  }

  // —— UI 設定 —— //
  function popMessage(text){
    let box = document.getElementById('achievementMessageBox');
    if(!box){
      box = document.createElement('div');
      box.id = 'achievementMessageBox';
      box.style.position='fixed';
      box.style.top='10%';
      box.style.left='50%';
      box.style.transform='translateX(-50%)';
      box.style.zIndex='9999';
      box.style.padding='12px 20px';
      box.style.background='#111';
      box.style.color='#fff';
      box.style.border='1px solid #444';
      box.style.borderRadius='10px';
      box.style.boxShadow='0 8px 24px rgba(0,0,0,.35)';
      box.style.opacity='0';
      box.style.transition='opacity .35s ease, transform .35s ease';
      box.style.pointerEvents='none';
      document.body.appendChild(box);
    }
    box.innerHTML = '<span style="color:#ffe28a;font-weight:700;">'+ text +'</span>';
    box.style.opacity='1';
    clearTimeout(box._timer);
    box._timer = setTimeout(() =>{ box.style.opacity='0'; }, 2200);
  }
  function ensureAchieveStyle(){
    if (document.getElementById('achieve-style')) return;
    const css = ''+
      '.achv-tip{margin:2px 0 6px;font-size:14px;line-height:1.25;color:#eaf1ff;font-weight:800;letter-spacing:.3px;'+
      'background:linear-gradient(90deg,#ffe08a,#ffd24d);-webkit-background-clip:text;background-clip:text;color:transparent;'+
      'text-shadow:0 0 8px rgba(255,210,77,.25);}'+
      '.achv-tip .badge{padding:2px 6px;border-radius:9999px;border:1px solid rgba(255,210,77,.45);background:rgba(255,210,77,.08);}'+
      '.achv-subnote{margin:-2px 0 8px;font-size:12px;opacity:.85;color:#cfe2ff;}';
    const el = document.createElement('style'); el.id='achieve-style'; el.textContent = css; document.head.appendChild(el);
  }

  // —— 階段計算 —— //
  function levelStage(lv){ return floor((lv||0)/LV_UNIT); }           // 10 等一階
  function primaryStage(val){ return geoStage(val, PRIMARY_UNIT, ATTR_GROWTH); }
  function adStage(val){ return geoStage(val, AD_UNIT, ATTR_GROWTH); }
  function per20Stage(val){ return floor((Number(val)||0) / 0.20); }
  function per30Stage(val){ return floor((Number(val)||0) / 0.30); }
  function killStage(c){ return geoStage(c, KILL_UNIT, GEO_GROWTH); }
  function eliteStage(c){ return geoStage(c, ELITE_UNIT, GEO_GROWTH); }
  function bossStage(c){ return geoStage(c, BOSS_UNIT, GEO_GROWTH); }
  function dmgStage(d){ return geoStage(d, DAMAGE_UNIT, GEO_GROWTH); }

// —— 讀玩家（基礎 + 核心 + 潛能；攻防不吃技能乘算）—— //
  function readSnapshot(){
    const p    = window.player || {};
    const base = p.baseStats || {};
    const core = p.coreBonus || {};
    const skl  = p.skillBonus || {};
    const pot  = p.PotentialBonus || {};
    const jobs = window.jobs || {};

    const jobKey = (p.job || "").toLowerCase();
    const jm = (jobs[jobKey] && jobs[jobKey].statMultipliers) || {
      str: 1,
      agi: 1,
      int: 1,
      luck: 1
    };

    // ---- 主屬性：基礎 + core + 潛能 ----
    const totalStr = Number(base.str || 0) + Number(core.str || 0) + Number(pot.str || 0);
    const totalAgi = Number(base.agi || 0) + Number(core.agi || 0) + Number(pot.agi || 0);
    const totalInt = Number(base.int || 0) + Number(core.int || 0) + Number(pot.int || 0);
    const totalLuk = Number(base.luk || 0) + Number(core.luk || 0) + Number(pot.luk || 0);

    // ---- 攻擊 / 防禦（不吃技能乘算，只吃四維＋平坦 atk/def） ----
    const atkByStats =
      totalStr * (5 * jm.str) +
      totalAgi * (5 * jm.agi) +
      totalInt * (5 * jm.int) +
      totalLuk * (5 * jm.luck);

    const defByStats =
      totalStr * (3 * jm.str) +
      totalAgi * (1.5 * jm.agi) +
      totalInt * (1 * jm.int) +
      totalLuk * (1.5 * jm.luck);

    const finalAtk = Math.floor(
      Number(base.atk || 0) +
      Number(core.atk || 0) +
      Number(pot.atk  || 0) +
      atkByStats
    );

    const finalDef = Math.floor(
      Number(base.def || 0) +
      Number(core.def || 0) +
      Number(pot.def  || 0) +
      defByStats
    );

    // ---- 技能傷害：基礎 + core + 技能 + 潛能 ----
    const skillDmg =
      Number(p.baseSkillDamage || 0) +
      Number(core.skillDamage  || 0) +
      Number(skl.skillDamage   || 0) +
      Number(pot.skillDamage   || 0);

    // ---- 攻擊速度：base(倍率) + core + skill + 潛能 - 1 → 額外加成倍率 ----
    const aspdRaw =
      Number(p.attackSpeedPctBase || 1) +
      Number(core.attackSpeedPct   || 0) +
      Number(skl.attackSpeedPct    || 0) +
      Number(pot.attackSpeedPct    || 0);

    const aspdGain = Math.max(0, aspdRaw - 1);

    // ---- 總傷害加成：優先 totalStats，否則 core + skill + 潛能 + 其他 ----
    let totalDmgBonus;
    if (p.totalStats && typeof p.totalStats.totalDamage === "number"){
      totalDmgBonus = Number(p.totalStats.totalDamage || 0);
    } else {
      totalDmgBonus =
        Number(p.baseTotalDamage || 0) +
        Number(core.totalDamage  || 0) +
        Number(skl.totalDamage   || 0) +
        Number(pot.totalDamage   || 0) +
        Number(p.baseFinalDamage || 0) +
        Number(core.finalDamage  || 0) +
        Number(core.damageBonus  || 0) +
        Number(p.totalDamageBonus|| 0);
    }

    // ---- 探索三率：只吃 core + 潛能（不讀 skillBonus） ----
    const exp =
      Number(core.expBonus || 0) +
      Number(pot.expBonus  || 0);

    const drop =
      Number(core.dropBonus || 0) +
      Number(pot.dropBonus  || 0);

    const gold =
      Number(core.goldBonus || 0) +
      Number(pot.goldBonus  || 0);

    // ---- 擊殺 / 累傷計數維持原本 state ----
    const kills       = Number(state.counters.kills       || 0);
    const eliteKills  = Number(state.counters.eliteKills  || 0);
    const bossKills   = Number(state.counters.bossKills   || 0);
    const totalDamage = Number(state.counters.totalDamage || 0);

    return {
      level: Number(p.level || 1),

      prim: {
        str: totalStr,
        agi: totalAgi,
        int: totalInt,
        luk: totalLuk
      },

      atkEquip: finalAtk,
      defEquip: finalDef,

      skill:        skillDmg,
      aspdGain,
      totalDmgBonus,

      exp,
      drop,
      gold,

      kills,
      eliteKills,
      bossKills,
      totalDamage
    };
  }
  // —— 發獎 —— //
  function giveRewardFixed(perStage, stageDiff){
    if (stageDiff <= 0) return 0;
    const qty = perStage * stageDiff;
    if (typeof window.addItem === "function"){ window.addItem(REWARD_ITEM, qty); }
    return qty;
  }
  function giveRewardLevel(prevStage, nextStage){
    let sum = 0; // 每階 (s+1)*5
    for (let s = prevStage; s < nextStage; s++){
      sum += 5 * (s + 1);
    }
    if (sum > 0 && typeof window.addItem === "function"){ window.addItem(REWARD_ITEM, sum); }
    return sum;
  }

  // ★ 改版：被動能力券規則
  // Lv1–4：不給
  // Lv5：一次給 5 張
  // Lv6–200：每升 1 等 +1 張
  // Lv>200：不再給
  function giveLevelTickets(prevLv, newLv){
    prevLv = floor(prevLv||0);
    newLv  = floor(newLv||0);
    if (newLv <= prevLv) return 0;

    let tickets = 0;

    // 5 等時給 5 張（一次性）
    if (prevLv < 5 && newLv >= 5){
      tickets += 5;
    }

    // 6~200：每升 1 等 +1 張
    const a = Math.max(prevLv, 5);
    const b = Math.min(newLv, 200);
    if (b > a){
      tickets += (b - a);
    }

    if (tickets > 0 && typeof window.addItem === "function"){
      window.addItem(LEVEL_TICKET_ITEM, tickets);
    }
    return tickets;
  }

  // ★每個等級階段（每 10 等）鑽石抽獎券 ×1
  function giveLevelStageBonus(stageDiff){
    if (stageDiff <= 0) return 0;
    const qty = LEVEL_STAGE_BONUS_PER_STAGE * stageDiff;
    if (typeof window.addItem === "function"){ window.addItem(LEVEL_STAGE_BONUS_ITEM, qty); }
    return qty;
  }

  // —— 核心檢查 —— //
  function checkAllInternal(){
    const snap = readSnapshot();
    let awardSum = 0; // sp點數券
    let ticketSum = 0; // 被動能力券（等級提升）
    let diamondSum = 0; // 鑽石抽獎券（每階段）

    // 每升等：被動能力券（改版規則）
    const curLv = floor(snap.level);
    if (state.counters.lastLevel == null){
      state.counters.lastLevel = curLv;
    } else if (curLv > floor(state.counters.lastLevel)){
      const oldLv = floor(state.counters.lastLevel);
      ticketSum += giveLevelTickets(oldLv, curLv);
      state.counters.lastLevel = curLv;
    }

    // 等級（每 10 等）成就：sp點數券（遞增）＋ 鑽石抽獎券（固定每階 +1）
    const stLv = levelStage(snap.level);
    if (stLv > state.stages.level){
      const lvStageDiff = stLv - state.stages.level;
      awardSum += giveRewardLevel(state.stages.level, stLv); // sp券
      diamondSum += giveLevelStageBonus(lvStageDiff);         // 鑽石券
      state.stages.level = stLv;
    }

    // 主屬性（幾何；每階 +5）
    const sStr = primaryStage(snap.prim.str);
    const sAgi = primaryStage(snap.prim.agi);
    const sInt = primaryStage(snap.prim.int);
    const sLuk = primaryStage(snap.prim.luk);
    if (sStr > state.stages.str){ awardSum += giveRewardFixed(REWARD_PER_STAGE_PRIMARY, sStr - state.stages.str); state.stages.str = sStr; }
    if (sAgi > state.stages.agi){ awardSum += giveRewardFixed(REWARD_PER_STAGE_PRIMARY, sAgi - state.stages.agi); state.stages.agi = sAgi; }
    if (sInt > state.stages.int){ awardSum += giveRewardFixed(REWARD_PER_STAGE_PRIMARY, sInt - state.stages.int); state.stages.int = sInt; }
    if (sLuk > state.stages.luk){ awardSum += giveRewardFixed(REWARD_PER_STAGE_PRIMARY, sLuk - state.stages.luk); state.stages.luk = sLuk; }

    // 攻防（幾何；每階 +5）
    const sAtk = adStage(snap.atkEquip);
    const sDef = adStage(snap.defEquip);
    if (sAtk > state.stages.atk){ awardSum += giveRewardFixed(REWARD_PER_STAGE_AD, sAtk - state.stages.atk); state.stages.atk = sAtk; }
    if (sDef > state.stages.def){ awardSum += giveRewardFixed(REWARD_PER_STAGE_AD, sDef - state.stages.def); state.stages.def = sDef; }

    // 戰鬥加成（20% 一階；每階 +5）
    const sSkill = per20Stage(snap.skill);
    const sAspd  = per20Stage(snap.aspdGain);
    const sTDmg  = per20Stage(snap.totalDmgBonus);
    if (sSkill > state.stages.skill){ awardSum += giveRewardFixed(REWARD_PER_STAGE_COMBAT, sSkill - state.stages.skill); state.stages.skill = sSkill; }
    if (sAspd  > state.stages.aspd ){ awardSum += giveRewardFixed(REWARD_PER_STAGE_COMBAT, sAspd  - state.stages.aspd ); state.stages.aspd  = sAspd;  }
    if (sTDmg  > state.stages.totalDmgBonus){ awardSum += giveRewardFixed(REWARD_PER_STAGE_COMBAT, sTDmg - state.stages.totalDmgBonus); state.stages.totalDmgBonus = sTDmg; }

    // 探索三率（30% 一階；每階 +2）
    const sExp  = per30Stage(snap.exp);
    const sDrop = per30Stage(snap.drop);
    const sGold = per30Stage(snap.gold);
    if (sExp  > state.stages.exp ){ awardSum += giveRewardFixed(REWARD_PER_STAGE_DEFAULT, sExp  - state.stages.exp ); state.stages.exp  = sExp;  }
    if (sDrop > state.stages.drop){ awardSum += giveRewardFixed(REWARD_PER_STAGE_DEFAULT, sDrop - state.stages.drop); state.stages.drop = sDrop; }
    if (sGold > state.stages.gold){ awardSum += giveRewardFixed(REWARD_PER_STAGE_DEFAULT, sGold - state.stages.gold); state.stages.gold = sGold; }

    // 擊殺 / 精英 / Boss / 累傷（幾何門檻；獎勵沿用）
    const sKill  = killStage(snap.kills);
    const sElite = eliteStage(snap.eliteKills);
    const sBoss  = bossStage(snap.bossKills);
    const sDmg   = dmgStage(snap.totalDamage);
    if (sKill  > state.stages.kill ){ awardSum += giveRewardFixed(REWARD_PER_STAGE_DEFAULT, sKill  - state.stages.kill ); state.stages.kill  = sKill;  }
    if (sElite > state.stages.elite){ awardSum += giveRewardFixed(REWARD_PER_STAGE_ELITE,   sElite - state.stages.elite); state.stages.elite = sElite; }
    if (sBoss  > state.stages.boss ){ awardSum += giveRewardFixed(REWARD_PER_STAGE_BOSS,    sBoss  - state.stages.boss ); state.stages.boss  = sBoss;  }
    if (sDmg   > state.stages.dmg  ){ awardSum += giveRewardFixed(REWARD_PER_STAGE_DAMAGE,  sDmg   - state.stages.dmg  ); state.stages.dmg   = sDmg;   }

    // —— 存檔 & 訊息 —— //
    if (awardSum > 0 || ticketSum > 0 || diamondSum > 0){
      persist();
      if (ticketSum > 0) {
        popMessage('🎁 等級提升：獲得「'+LEVEL_TICKET_ITEM+'」×'+ticketSum);
        if (typeof window.logPrepend === "function"){ try{ window.logPrepend('🎁 等級提升：獲得「'+LEVEL_TICKET_ITEM+'」×'+ticketSum); }catch(_){ } }
      }
      if (diamondSum > 0) {
        popMessage('💎 等級階段達成：獲得「'+LEVEL_STAGE_BONUS_ITEM+'」×'+diamondSum);
        if (typeof window.logPrepend === "function"){ try{ window.logPrepend('💎 等級階段達成：獲得「'+LEVEL_STAGE_BONUS_ITEM+'」×'+diamondSum); }catch(_){ } }
      }
      if (awardSum > 0) {
        popMessage('🎉 成就完成：獲得「'+REWARD_ITEM+'」×'+awardSum);
        if (typeof window.logPrepend === "function"){ try{ window.logPrepend('🏆 成就完成：獲得「'+REWARD_ITEM+'」×'+awardSum); }catch(_){ } }
      }
      if (typeof window.saveGame === "function"){ try{ window.saveGame(); }catch(_){ } }
    }
    return awardSum;
  }

  // —— UI：進度條渲染 —— //
  function geometricBounds(val, unit, G){
    const s = geoStage(val, unit, G);
    return { base: geoCumForStage(s, unit, G), next: geoCumForStage(s+1, unit, G), stage: s };
  }
  function linearBoundsByUnit(val, unit, stageFn){
    const s = stageFn(val);
    return { base: s*unit, next: (s+1)*unit, stage: s };
  }
  function fmtPct(v){ return Math.round((Number(v)||0)*100)+'%'; }
  function fmtInt(v){ return String(Math.floor(Number(v)||0)); }
  function fmtNum(v){ return String(Number(v)||0); }
  function fmtDmg(v){ return Number(v||0).toLocaleString(); }

  // ★ 根據等級計算「理論上已解鎖的被動能力券總數」
  // Lv1–4：0
  // Lv5：5
  // Lv6–200：等級數即為總張數（6 等 = 6 張 ... 200 等 = 200 張）
  function ticketsUnlockedByLevel(level){
    level = floor(level||0);
    if (level < 5) return 0;
    if (level >= 200) return 200;
    return level;
  }

  function bar(pct, note){
    const w = Math.floor(clamp01(pct)*100);
    return ''+
    '<div style="background:#2a2a2a;border-radius:8px;overflow:hidden;height:10px;margin-top:6px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)">' +
      '<div style="height:100%;width:'+w+'%;background:linear-gradient(90deg,#41d1ff,#6f86ff);box-shadow:0 0 10px rgba(111,134,255,.35) inset;"></div>'+
    '</div>'+
    (note ? '<div style="font-size:12px;opacity:.75;margin-top:4px;text-align:right">'+note+'</div>' : '');
  }

  function rowProgress(label, current, bounds, formatter){
    const base = bounds.base, next = bounds.next, stg = bounds.stage;
    const progress = (next>base) ? (current - base) / (next - base) : 1;
    const pctText = Math.round(clamp01(progress)*100)+'%';
    const curText = formatter ? formatter(current) : String(current);
    const nextText = formatter ? formatter(next) : String(next);
    return ''+
    '<div style="padding:10px 0;border-bottom:1px dashed #3a3a3a;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'+
        '<div style="font-weight:600;color:#e9f0ff">'+label+' <span style="opacity:.6;font-size:12px;">（第 '+stg+' 階）</span></div>'+
        '<div style="font-weight:700;text-align:right;color:#fff">'+curText+'</div>'+
      '</div>'+
      bar(progress, '下一階：'+ nextText +'　|　進度：'+pctText)+'\n'+
    '</div>';
  }


  // 對外 API
  window.Achievements = {
    onKill(n){
      n = floor(n||1); if (n<=0) return;
      state.counters.kills = floor(state.counters.kills) + n;
      persist(); checkAllInternal(); this.renderIfActive();
    },
    onEliteKill(n){
      n = floor(n||1); if (n<=0) return;
      state.counters.eliteKills = floor(state.counters.eliteKills) + n;
      persist(); checkAllInternal(); this.renderIfActive();
    },
    onBossKill(n){
      n = floor(n||1); if (n<=0) return;
      state.counters.bossKills = floor(state.counters.bossKills) + n;
      persist(); checkAllInternal(); this.renderIfActive();
    },
    onDamageDealt(amount){
      amount = Math.max(0, Number(amount)||0); if (!amount) return;
      state.counters.totalDamage = (Number(state.counters.totalDamage)||0) + amount;
      persist(); checkAllInternal(); this.renderIfActive();
    },
    onLevelChange(newLv){
      const p = window.player || {}; p.level = Number(newLv||p.level||1);
      persist(); checkAllInternal(); this.renderIfActive();
    },
    checkAll(){
      const got = checkAllInternal();
      this.renderIfActive();
      return got;
    },
    getCounters(){ return JSON.parse(JSON.stringify(state.counters)); },
    setCounters(partial){
      state.counters = Object.assign(state.counters, partial||{});
      persist(); this.checkAll();
    },
    _resetAll(){
      state = {
        stages: {
          level:0,
          str:0, agi:0, int:0, luk:0,
          atk:0, def:0, skill:0, aspd:0, totalDmgBonus:0,
          exp:0, drop:0, gold:0,
          kill:0, elite:0, boss:0, dmg:0
        },
        counters: { kills:0, eliteKills:0, bossKills:0, totalDamage:0, lastLevel:null }
      };
      persist(); this.renderIfActive();
    },

    renderIfActive(){
      if (typeof window.QuestCore !== "object") return;
      if (window.QuestCore.getActiveTab && window.QuestCore.getActiveTab()==='achievements'){
        this.renderInto(document.getElementById('questContent'));
      }
    },

    renderInto(container){
      if (!container) return;
      ensureAchieveStyle();
      const snap = readSnapshot();

      function levelRow(){
        const s = levelStage(snap.level);
        const b = { base: s*LV_UNIT, next: (s+1)*LV_UNIT, stage: s };
        const progress = (snap.level - b.base) / (b.next - b.base);
        const nextReward = 5 * (s+1);
        return ''+
        '<div style="padding:10px 0;border-bottom:1px dashed #3a3a3a;">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'+
            '<div style="font-weight:700;color:#ffd78a">等級 <span style="opacity:.6;font-size:12px;">（第 '+s+' 階）</span></div>'+
            '<div style="font-weight:800;color:#fff">Lv.'+snap.level+'</div>'+
          '</div>'+
          bar(
            progress,
            '下一階：Lv.'+(b.next)+
            '　|　獎勵：sp點數券 '+nextReward+' 張 + 鑽石抽獎券 ×1'+
            '　|　進度：'+Math.round(clamp01(progress)*100)+'%'
          )+
        '</div>';
      }

      let html = '';
      html += '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,\'Noto Sans TC\',sans-serif;color:#dfe7ff;">';

      html += '<h3 style="margin:6px 0 6px;color:#9fc5ff;">等級（每 10 等；獎勵逐階提高）</h3>';
      html += '<div class="achv-tip">🎁 Lv5 一次獲得 <span class="badge"><b>被動能力券 ×5</b></span>，之後每升 1 等 +1，最高可累積 200 張</div>';
      html += '<div class="achv-subnote">💎 每達成 1 個等級階段（每 10 等）另得：<b>鑽石抽獎券 ×1</b></div>';
      html += '<div class="achv-subnote">🏆 成就獎勵皆會自動發送，無需手動領取</div>';
      html += levelRow();

      // ★ 被動能力券累積進度條（以等級解鎖數量為準）
      const ticketUnlocked = ticketsUnlockedByLevel(snap.level);
      const ticketMax = 200;
      const ticketPct = (ticketMax > 0) ? (ticketUnlocked / ticketMax) : 0;
      html += '<h3 style="margin:12px 0 8px;color:#ffd78a;">被動能力券累積</h3>';
      html += '<div class="achv-subnote">依等級解鎖總數計算：Lv5 一次 +5，之後每等 +1，最多 200 張（實際持有量會依使用而變動）</div>';
      html += bar(ticketPct, '已解鎖總數：'+ticketUnlocked+' / '+ticketMax+'　|　進度：'+Math.round(clamp01(ticketPct)*100)+'%');

      html += '<h3 style="margin:12px 0 8px;color:#9fc5ff;">主屬性（每階 +5 張）</h3>';
      html += rowProgress('力量 STR', snap.prim.str, geometricBounds(snap.prim.str, PRIMARY_UNIT, ATTR_GROWTH), fmtInt);
      html += rowProgress('敏捷 AGI', snap.prim.agi, geometricBounds(snap.prim.agi, PRIMARY_UNIT, ATTR_GROWTH), fmtInt);
      html += rowProgress('智力 INT', snap.prim.int, geometricBounds(snap.prim.int, PRIMARY_UNIT, ATTR_GROWTH), fmtInt);
      html += rowProgress('幸運 LUK', snap.prim.luk, geometricBounds(snap.prim.luk, PRIMARY_UNIT, ATTR_GROWTH), fmtInt);

      html += '<h3 style="margin:12px 0 8px;color:#9fc5ff;">攻防（每階 +5 張）</h3>';
      html += rowProgress('攻擊力 ATK', snap.atkEquip, geometricBounds(snap.atkEquip, AD_UNIT, ATTR_GROWTH), fmtInt);
      html += rowProgress('防禦力 DEF', snap.defEquip, geometricBounds(snap.defEquip, AD_UNIT, ATTR_GROWTH), fmtInt);

      html += '<h3 style="margin:12px 0 8px;color:#9fc5ff;">戰鬥加成（每階 +5 張）</h3>';
      html += rowProgress('技能傷害', Math.round(snap.skill*100)/100,  linearBoundsByUnit(snap.skill, 0.20, per20Stage), fmtPct);
      html += rowProgress('攻擊速度(+%)', Math.round(snap.aspdGain*100)/100, linearBoundsByUnit(snap.aspdGain, 0.20, per20Stage), fmtPct);
      html += rowProgress('總傷害(+%)',  Math.round(snap.totalDmgBonus*100)/100, linearBoundsByUnit(snap.totalDmgBonus, 0.20, per20Stage), fmtPct);

      html += '<h3 style="margin:12px 0 8px;color:#9fc5ff;">探索加成（每階 +2 張）</h3>';
      html += rowProgress('經驗值率', Math.round(snap.exp*100)/100,  linearBoundsByUnit(snap.exp, 0.30, per30Stage), fmtPct);
      html += rowProgress('掉寶率',   Math.round(snap.drop*100)/100, linearBoundsByUnit(snap.drop, 0.30, per30Stage), fmtPct);
      html += rowProgress('金幣率',   Math.round(snap.gold*100)/100, linearBoundsByUnit(snap.gold, 0.30, per30Stage), fmtPct);

      html += '<h3 style="margin:12px 0 8px;color:#9fc5ff;">累積（擊殺/傷害）</h3>';
      html += rowProgress('擊殺數（/ +2 張）',  snap.kills,       geometricBounds(snap.kills,       KILL_UNIT,   GEO_GROWTH), fmtInt);
      html += rowProgress('精英擊殺（/ +10 張）', snap.eliteKills, geometricBounds(snap.eliteKills,   ELITE_UNIT,  GEO_GROWTH), fmtInt);
      html += rowProgress('Boss 擊殺（/ +20 張）', snap.bossKills,  geometricBounds(snap.bossKills,    BOSS_UNIT,   GEO_GROWTH), fmtInt);
      html += rowProgress('累積傷害（/ +20 張）',  snap.totalDamage, geometricBounds(snap.totalDamage, DAMAGE_UNIT, GEO_GROWTH), fmtDmg);

      html += '</div>';
      container.innerHTML = html;
    }
  };

  // —— 與 QuestCore 整合：切分頁時渲染 —— //
  document.addEventListener('quest:tabchange', () =>{
    if (typeof window.QuestCore !== "object") return;
    if (window.QuestCore.getActiveTab && window.QuestCore.getActiveTab()==='achievements'){
      window.Achievements.renderInto(document.getElementById('questContent'));
    }
  });

  // 首次載入即做一次檢查與（可能的）渲染刷新
  setTimeout(() =>{ try{ window.Achievements.checkAll(); }catch(_){ } }, 0);
})();