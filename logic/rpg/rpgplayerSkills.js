// === playerSkills.js ===
// 玩家技能自動施放中控（已改為「秒制」）

function _nowSec() {
  return Math.floor((typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000);
}

// 取得目前啟用的等級段 / tier
function _tier(s) {
  if (!s) return s;
  if (typeof getActiveTier === "function" && s.tiers) {
    return getActiveTier(s) || s;
  }
  return s;
}

// MP 消耗：支援等級成長
function _mpCost(s) {
  const t = _tier(s);
  const base = Number(t.mpCost ?? s.mpCost ?? 0);
  const grow = Number(t.logic?.mpCostLevelGrowth ?? 0) * Math.max(0, (s.level ?? 1) - 1);
  return base + grow;
}

// 是否為「普攻」（0 CD 的攻擊技能）
function _isBasic(s) {
  if (typeof s.isBasic === "boolean") return s.isBasic;
  const t = _tier(s);
  const cd = Number(t.cooldown ?? s.cooldown ?? 0);
  const role = s.role ?? "attack";
  return role === "attack" && cd === 0;
}

// 以「秒」判斷最小間隔：minIntervalSec（優先）或 minInterval（視為秒）
function _minIntervalOk(s, nowSec) {
  const rawGap =
    (typeof s.minIntervalSec !== "undefined" ? s.minIntervalSec : s.minInterval);
  const gap = Number(_isBasic(s) ? (rawGap ?? 1) : (rawGap ?? 0));
  if (!gap || gap <= 0) return true;
  const last = Number(s.lastUsedAtSec ?? -1e9);
  return (nowSec - last) >= gap;
}

// 是否需要補助技能（BUFF 類）
function _needSupport(s) {
  if ((s.role ?? "attack") !== "support") return false;
  const key = s.effectKey;
  if (!key) return false;
  const remain = player?.buffs?.[key]?.remaining ?? 0;
  const refreshAt = s.refreshAt ?? 2; // 秒
  return remain <= refreshAt;
}

// 全域技能傷害加成（skillDamage）
function _getGlobalSkillDamageMul() {
  const bonus = (player?.totalStats?.skillDamage || 0);
  return 1 + Math.max(0, bonus);
}

// === 勾選偏好 ===
function ensureSkillAutoFlag(skill) {
  if (!skill || !skill.id) return;
  if (typeof skill.autoEnabled === "undefined") {
    const saved = localStorage.getItem(`skillAuto_${skill.id}`);
    const def = (typeof skill.autoDefault === "boolean") ? skill.autoDefault : false; // 預設不自動
    skill.autoEnabled = (saved === null) ? def : (saved === "1");
  }
  if (skill.allowAuto === false) skill.autoEnabled = false;
}

// ====== 施放入口（最終保險：沒勾選就不放） ======
function _cast(s, monster) {
  if (s.autoEnabled !== true) {
    return { used: false, name: s?.name || "技能", damage: 0 };
  }

  const t = _tier(s);

  // 套用 tier 設定
  s.name     = t.name   ?? s.name;
  s.logic    = t.logic  ?? s.logic;
  s.cooldown = (typeof t.cooldown === "number") ? t.cooldown : (s.cooldown ?? 0); // 秒
  s.mpCost   = _mpCost(s);

  // 要給 Rpg_玩家 用的群體資訊（沒設就 1）
  const maxTargets =
    Number(t.maxTargets ?? s.maxTargets ?? 1);
  s.maxTargets = isFinite(maxTargets) && maxTargets > 0
    ? Math.floor(maxTargets)
    : 1;

  // IgnoreDef 用的額外參數：直接從 skill/tier 帶出
  const mul          = (typeof t.mul          === "number") ? t.mul          : s.mul;
  const flat         = (typeof t.flat         === "number") ? t.flat         : s.flat;
  const ignoreDefPct = (typeof t.ignoreDefPct === "number") ? t.ignoreDefPct : s.ignoreDefPct;
  const abnormalEffect = t.abnormalEffect ?? s.abnormalEffect;

  // ⭐ 每次施放之前，先清空這個技能的標籤（給戰鬥 Log 用）
  if (typeof s.lastCastTag !== "string") {
    s.lastCastTag = "";
  } else {
    s.lastCastTag = "";
  }
  // 若 tier 物件本身也有 lastCastTag，就順便清一下（保險）
  if (t && t !== s && typeof t.lastCastTag === "string") {
    t.lastCastTag = "";
  }

  // 若技能內自己去改 monsterHP，這裡用差值抓實際傷害（相容舊寫法）
  const hpBefore = (typeof monsterHP === "number") ? monsterHP : (monster?.hp ?? 0);

  let ret = 0;
  if (typeof t.use === "function") {
    // 推薦：所有主動技能在 t.use 裡面自己設定 this.lastCastTag
    ret = t.use(monster, s);   // 回傳數值傷害
  } else if (typeof s.use === "function") {
    ret = s.use(monster);
  } else {
    return { used: false, name: s.name || "技能", damage: 0 };
  }

  // 記錄最近施放秒數
  s.lastUsedAtSec = _nowSec();

  // 技能傷害總乘數（只決定數值，不碰 HP）
  const skillMul = _getGlobalSkillDamageMul();
  let dealt = 0;
  let hitDamages = null;
  let hits = 1;

  if (typeof ret === "number") {
    // 推薦做法：所有主動攻擊技能都回傳數值傷害（單一目標總傷害）
    dealt = Math.max(0, Math.floor(ret * skillMul));
  } else if (ret && typeof ret === "object") {
    // ✅ 新增：真多段支援（未來技能可回傳 { hitDamages:[...] } 或 { damage:number }）
    if (Array.isArray(ret.hitDamages) && ret.hitDamages.length) {
      hitDamages = ret.hitDamages
        .map(v => Math.max(0, Math.floor(Number(v || 0) * skillMul)));
      hits = hitDamages.length;
      dealt = hitDamages.reduce((a, b) => a + b, 0);
    } else if (typeof ret.damage === "number") {
      dealt = Math.max(0, Math.floor(ret.damage * skillMul));
      hits = Math.max(1, Math.floor(Number(ret.hits || 1)));
    } else {
      // 相容舊寫法：若技能內直接改 monsterHP，就用差值算實際傷害
      const hpAfter = (typeof monsterHP === "number") ? monsterHP : (monster?.hp ?? hpBefore);
      dealt = Math.max(0, hpBefore - hpAfter);
    }
  } else {
    // 相容舊寫法：若技能內直接改 monsterHP，就用差值算實際傷害
    const hpAfter = (typeof monsterHP === "number") ? monsterHP : (monster?.hp ?? hpBefore);
    dealt = Math.max(0, hpBefore - hpAfter);
  }

  // ❌ 不要在這裡改 monsterHP，讓 Rpg_玩家.actOnce() 統一處理
  // if (monster === currentMonster && typeof monsterHP === "number") {
  //   monsterHP = Math.max(0, monsterHP - dealt);
  // }

  // 扣 MP
  if (s.mpCost > 0 && typeof player?.currentMP === "number") {
    player.currentMP = Math.max(0, player.currentMP - s.mpCost);
  }

  // 設冷卻（秒）；reduceSkillCooldowns() 會每秒 -1
  if ((s.cooldown ?? 0) > 0 && (s.currentCooldown ?? 0) <= 0) {
    s.currentCooldown = s.cooldown;
  }

  // ⭐ 給戰鬥主程式用的標籤：優先從 skill 自己拿
  const tag =
    typeof s.lastCastTag === "string" && s.lastCastTag
      ? s.lastCastTag
      : (t && typeof t.lastCastTag === "string" ? t.lastCastTag : "");

  // 回傳給 Rpg_玩家 的資訊：
  //  - damage: 單體基礎傷害（之後再套防禦 / 護盾）
  //  - maxTargets: 這招最多打幾隻（沒設就是 1）
  //  - mul/flat/ignoreDefPct: 給 ignore_defense.js 用
  //  - abnormalEffect: 給 Rpg_玩家 掛異常狀態用
  //  - tag: ⭐ 給戰鬥摘要文字用，例如（連擊!）、（強化!）
  return {
    used: true,
    name: t.name || s.name || "技能",
    damage: dealt,
    // ✅ 真多段：若 hitDamages 有值，Rpg_玩家.actOnce() 會走逐段完整計算
    hitDamages,
    hits,
    maxTargets: s.maxTargets,
    mul,
    flat,
    ignoreDefPct,
    abnormalEffect,
    tag: tag || "",
    // 讓 rpg_1.js 可判斷技能自身設定（例如 ignoreDef）
    logic: s.logic || t.logic
  };
}

// ====== 自動施放（只挑 autoEnabled === true） ======
function autoUseSkills(monster) {
  if (typeof ensureSkillEvolution === "function") ensureSkillEvolution();

  const list = Array.isArray(skills) ? skills : [];

  // 補旗標（新學會的技能也會被初始化）
  for (const s of list) ensureSkillAutoFlag(s);

  const nowSec = _nowSec();

  const available = list.filter(s => {
    if (!s) return false;
    if (s.autoEnabled !== true) return false;              // ★ 只有打勾的才會自動施放
    if ((s.currentCooldown ?? 0) > 0) return false;        // 冷卻中
    if (!_minIntervalOk(s, nowSec)) return false;          // 最小間隔（秒）
    return (player.currentMP ?? 0) >= _mpCost(s);          // MP 足夠
  });

  if (available.length === 0) return { used: false };

  // 先補助類（維持 BUFF）
  const support = available.find(_needSupport);
  if (support) return _cast(support, monster);

  // 攻擊類（有冷卻者優先）
  const atkNonBasic = available.filter(s => (s.role ?? "attack") === "attack" && !_isBasic(s));
  if (atkNonBasic.length) return _cast(atkNonBasic[0], monster);

  // 最後普攻
  const basic = available.find(_isBasic);
  if (basic) return _cast(basic, monster);

  return { used: false };
}

// 每秒遞減玩家技能冷卻（請在你的每秒 Tick 呼叫一次）
function reduceSkillCooldowns() {
  const list = Array.isArray(skills) ? skills : [];
  for (const s of list) {
    if (!s) continue;
    if (Number.isFinite(s.currentCooldown) && s.currentCooldown > 0) {
      s.currentCooldown -= 1;
      if (s.currentCooldown < 0) s.currentCooldown = 0;
    }
  }
}