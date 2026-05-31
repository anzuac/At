// 📦 monster_buffs.js (統一數值設定 + 面板套用)

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ⚙️ Buff 的持續/冷卻範圍
const buffRanges = {
  healBuff:   { 
    duration: [1, 1],
  cooldown: [80, 120] },
  atkBuff:    { 
    duration: [30, 60],
    cooldown: [80, 120] },
  defBuff:    { 
    duration:  [30, 60], 
    cooldown: [80, 120] },
  shieldBuff: {      cooldown: [80, 160]  }
};

// 內部：確保容器 + 設定基準面板(只在第一次)
function _ensureBuffStores(monster) {
  monster.extra ||= {};
  monster.extra.buff ||= {};
  monster.buffState ||= {};     // { atkTurns, defTurns, healTurns }
  monster.buffCooldown ||= {};  // { healBuff, atkBuff, defBuff, shieldBuff }

  // snapshot 當前(已吃難度/地圖倍率後)的基準 atk/def，避免一直疊加
  if (monster.originalAtk == null) monster.originalAtk = Number(monster.atk) || 0;
  if (monster.originalDef == null) monster.originalDef = Number(monster.def) || 0;
  if (monster.maxHp == null)       monster.maxHp       = Number(monster.hp)  || 1;

  // 初始 hp 欄位保險
  if (monster.hp == null) monster.hp = monster.maxHp;
}

// ★重點：把 buff 統計後「寫回面板」(不會重複疊加)
//   - 每次都從 originalAtk/Def 當基底重新計
function _applyBuffPanel(monster) {
  const baseAtk = Number(monster.originalAtk) || Number(monster.atk) || 0;
  const baseDef = Number(monster.originalDef) || Number(monster.def) || 0;

  let atk = baseAtk;
  let def = baseDef;

  if ((monster.buffState?.atkTurns || 0) > 0) atk = Math.floor(atk * 1.3);
  if ((monster.buffState?.defTurns || 0) > 0) def = Math.floor(def * 1.4);

  monster.atk = atk;
  monster.def = def;
}

// 每秒處理(或你每回合=1秒)：倒數→可能啟動→面板套用
function processMonsterBuffs(monster) {
  if (!monster) return;
  _ensureBuffStores(monster);

  const buffs = monster.extra.buff;
  const st = monster.buffState;
  const cd = monster.buffCooldown;

  // 倒數（以「秒」為單位）
  if ((st.atkTurns  || 0) > 0) st.atkTurns--;
  if ((st.defTurns  || 0) > 0) st.defTurns--;
  if ((st.healTurns || 0) > 0) st.healTurns--;

  if ((cd.healBuff   || 0) > 0) cd.healBuff--;
  if ((cd.atkBuff    || 0) > 0) cd.atkBuff--;
  if ((cd.defBuff    || 0) > 0) cd.defBuff--;
  if ((!monster.shield || monster.shield <= 0) && (cd.shieldBuff || 0) > 0) cd.shieldBuff--;

  // 🩹 回復 Buff（就緒就觸發一次）
  if (buffs.healBuff && (cd.healBuff || 0) <= 0) {
    const healAmount = Math.floor((monster.maxHp || 1) * 0.1);
    monster.hp = Math.min((monster.hp || 0) + healAmount, monster.maxHp || (monster.hp || 0));
    st.healTurns = buffRanges.healBuff.duration[0];
    cd.healBuff  = buffRanges.healBuff.cooldown[0];
    logPrepend?.(`🩹 ${monster.name} 回復了 ${healAmount} HP！`);
  }

  // 💪 攻擊提升 Buff（就緒且未在持續中 → 開啟）
  if (buffs.atkBuff && (cd.atkBuff || 0) <= 0 && (st.atkTurns || 0) <= 0) {
    st.atkTurns = buffRanges.atkBuff.duration[0];
    cd.atkBuff  = buffRanges.atkBuff.cooldown[0];
    logPrepend?.(`💪 ${monster.name} 攻擊力提升！`);
  }

  // 🛡️ 防禦提升 Buff
  if (buffs.defBuff && (cd.defBuff || 0) <= 0 && (st.defTurns || 0) <= 0) {
    st.defTurns = buffRanges.defBuff.duration[0];
    cd.defBuff  = buffRanges.defBuff.cooldown[0];
    logPrepend?.(`🛡️ ${monster.name} 防禦力提升！`);
  }

  // 🔰 護盾 Buff（只有在沒有護盾時才再給）
  if (buffs.shieldBuff && (cd.shieldBuff || 0) <= 0 && (!monster.shield || monster.shield <= 0)) {
    monster.shield  = Math.floor((monster.maxHp || 1) * 0.3);
    cd.shieldBuff   = buffRanges.shieldBuff.cooldown[0];
    logPrepend?.(`🔰 ${monster.name} 產生護盾 ${monster.shield}！`);
  }

  // ★ 套面板（把 1.3 / 1.4 的結果寫回 monster.atk/def）
  _applyBuffPanel(monster);
}

// 維持舊的 API：但注意這只是「告訴你目前效果」，真正套用已在 _applyBuffPanel 做了
function applyMonsterBuffEffects(monster) {
  // 回傳目前面板值，方便別處想查
  return { atk: monster.atk, def: monster.def };
}

function getMonsterBuffEffects(monster) {
  if (!monster?.buffState) return "無";
  const effects = [];
  const baseAtk = monster.originalAtk ?? monster.atk;
  const baseDef = monster.originalDef ?? monster.def;

  if ((monster.buffState.atkTurns || 0) > 0) {
    const atkNow = Math.floor((baseAtk || 0) * 1.3);
    effects.push(`💪 攻擊力↑ (+${atkNow - (baseAtk || 0)}) [${monster.buffState.atkTurns}s]`);
  }
  if ((monster.buffState.defTurns || 0) > 0) {
    const defNow = Math.floor((baseDef || 0) * 1.4);
    effects.push(`🛡️ 防禦力↑ (+${defNow - (baseDef || 0)}) [${monster.buffState.defTurns}s]`);
  }
  if (monster.shield && monster.shield > 0) {
    effects.push(`🔰 護盾 (${monster.shield})`);
  }
  if ((monster.buffState.healTurns || 0) > 0) {
    effects.push("🩹 回復");
  }
  return effects.length > 0 ? effects.join(" ") : "無";
}

function getMonsterBuiltInBuffSkills(monster) {
  const buff = monster?.extra?.buff || {};
  const cd = monster.buffCooldown || {};
  const skills = [];
  const healCooldownText   = (cd.healBuff   || 0) > 0 ? `${cd.healBuff}s`   : '就緒';
  const atkCooldownText    = (cd.atkBuff    || 0) > 0 ? `${cd.atkBuff}s`    : '就緒';
  const defCooldownText    = (cd.defBuff    || 0) > 0 ? `${cd.defBuff}s`    : '就緒';
  const shieldCooldownText = (cd.shieldBuff || 0) > 0 ? `${cd.shieldBuff}s` : '就緒';

  if (buff.healBuff)   skills.push(`🩹 回復（冷卻${healCooldownText}）`);
  if (buff.atkBuff)    skills.push(`💪 攻擊↑（冷卻${atkCooldownText}）`);
  if (buff.defBuff)    skills.push(`🛡️ 防禦↑（冷卻${defCooldownText}）`);
  if (buff.shieldBuff) skills.push(`🔰 護盾（冷卻${shieldCooldownText}）`);
  return skills.length > 0 ? skills.join("、") : "無";
}

// 暴露（如果外部要手動套面板也可用）
window.processMonsterBuffs = processMonsterBuffs;
window.applyMonsterBuffEffects = applyMonsterBuffEffects;
window.getMonsterBuffEffects = getMonsterBuffEffects;
window.getMonsterBuiltInBuffSkills = getMonsterBuiltInBuffSkills;