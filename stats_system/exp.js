// =======================
// exp.js — 等級 & 經驗模組
// - 控制：等級上限、每等獲得的屬性點/被動點
// - 提供：getExpToNext / gainExp / levelUp（沿用舊 API）
// =======================
(function (w) {
  "use strict";

  // 等級上限
  const MAX_LEVEL = 1000;

  // 每升級獲得的點數設定
  const STAT_POINTS_PER_LEVEL = 5;       // 原本 levelUp 裡的 +5
  const PASSIVE_POINTS_PER_LEVEL = 0;    // 原本 player.js 頂部那個常數

  // ===== 經驗需求公式 =====
// ===== 經驗需求公式 =====
function getExpToNext(level) {
  if (level >= MAX_LEVEL) return 1;

  const TARGET_SUM_1_TO_200 = 200000000; // 2億

  // 你只需要調這個 p 來改曲線形狀（建議 2.0 ~ 3.0）
  const P = 2.4;

  // 這裡假設「1練到200」= sum(level 1..199)
  const SUM_END = 199;

  // ---- 1) Lv1~200：冪次曲線 + 總和正規化 ----
  if (level <= 200) {
    // 計算 scale（可以接受：每次呼叫會算一次；若你在意效能可改成模組內快取）
    let rawSum = 0;
    for (let i = 1; i <= SUM_END; i++) rawSum += Math.pow(i, P);
    const scale = TARGET_SUM_1_TO_200 / rawSum;

    const exp = Math.round(scale * Math.pow(level, P));
    return Math.max(1, exp);
  }

  // ---- 2) Lv201+：每級 +1%，每5級額外 +5%（遞推）----
  // 先取得 Lv200 的需求作為基準
  let e = getExpToNext(200);

  for (let lv = 201; lv <= level; lv++) {
    e = e * 1.01;
    if (lv % 5 === 0) e = e * 1.05;
    e = Math.round(e);
  }
  return Math.max(1, e);
}
  // ===== 升級時給點數 =====
  function applyLevelGains(player) {
    if (!player) return;
    player.statPoints += STAT_POINTS_PER_LEVEL;
    player.passivePoints += PASSIVE_POINTS_PER_LEVEL;
  }

  // ===== 升級處理 =====
  function levelUpPlayer(player) {
    if (!player) return;
    if (player.level >= MAX_LEVEL) return;

    player.level++;
    player.expToNext = getExpToNext(player.level);

    // 給屬性點 & 被動點
    applyLevelGains(player);

    // 回滿資源
    player.currentHP = player.totalStats.hp;
    player.currentMP = player.totalStats.mp;

    // Log / UI / 技能進化
    if (typeof logPrepend === "function") {
      logPrepend?.(
        `📈 等級提升！目前等級：${player.level}（被動點數 +${PASSIVE_POINTS_PER_LEVEL}）`
      );
    }
    if (typeof updateResourceUI === "function") updateResourceUI?.();
    if (typeof ensureSkillEvolution === "function") ensureSkillEvolution?.();
  }

  // ===== 增加經驗（含多倍加成 & 連續升級）=====
  function gainExpForPlayer(player, amount) {
    if (!player || !Number.isFinite(amount)) return;

    const mult = 1 + (player.expRateBonus || 0);
    const delta = Math.round((amount * mult) + Number.EPSILON);
    player.exp = Math.round((player.exp + delta) + Number.EPSILON);

    while (player.exp >= player.expToNext && player.level < MAX_LEVEL) {
      player.exp -= player.expToNext;
      player.exp = Math.max(0, Math.round(player.exp + Number.EPSILON));
      levelUpPlayer(player);
    }

    if (typeof updateResourceUI === "function") updateResourceUI?.();
  }

  // ===== 導出到全域（跟舊版相容）=====

  // 常數
  w.MAX_LEVEL = MAX_LEVEL;
  w.STAT_POINTS_PER_LEVEL = STAT_POINTS_PER_LEVEL;
  w.PASSIVE_POINTS_PER_LEVEL = PASSIVE_POINTS_PER_LEVEL;

  // 公式
  w.getExpToNext = getExpToNext;

  // 保留原本不帶 player 參數的呼叫方式
  w.levelUp = function () {
    levelUpPlayer(w.player);
  };

  w.gainExp = function (amount) {
    gainExpForPlayer(w.player, amount);
  };

})(window);