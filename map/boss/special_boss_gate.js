// special_boss_gate.js
// v2：不再強制 stopAutoBattle，直接切換到 Boss 戰並確保戰鬥在跑

(function (w) {
  "use strict";

const Gate = {
  _current: null, // { key, ticketItem, rewardItem, rewardAmount }

  tryEnter(bossKey) {
    const list = window.SpecialBossList || {};
    const boss = list[bossKey];
    if (!boss) return { ok:false, msg:"找不到指定的 Boss：" + bossKey };

    // ⭐ 1) 防呆：禁止在「自動戰鬥 / 重生倒數 / 死亡倒數」期間啟動
    if (window.autoEnabled) {
      return {
        ok: false,
        msg: "目前正在自動戰鬥中，請先停止戰鬥再挑戰 Boss。"
      };
    }

    // rpg.js 有宣告 respawnTimer / deathTimer，這裡用來判斷倒數狀態
    if (window.respawnTimer) {
      return {
        ok: false,
        msg: "怪物重生倒數中，請等倒數結束或手動生怪後再挑戰 Boss。"
      };
    }

    if (window.deathTimer) {
      return {
        ok: false,
        msg: "你目前處於死亡倒數中，請復活後再挑戰 Boss。"
      };
    }

    // ⭐ 2) 入場券檢查
    const ticketItem = boss.ticketItem || "Boss挑戰券";
    if (typeof getItemQuantity === "function") {
      if (getItemQuantity(ticketItem) <= 0) {
        return { ok:false, msg:"沒有「" + ticketItem + "」，無法挑戰。" };
      }
    }

    // ⭐ 3) 先扣 1 張入場券（暫扣）
    if (typeof removeItem === "function") {
      removeItem(ticketItem, 1);
    }

    // ⭐ 4) 把現在場上的怪物清掉（如果有殘留）
    if (window.currentMonster) {
      window.currentMonster = null;
      window.monsterHP = 0;
      if (typeof clearMonsterInfo === "function") clearMonsterInfo();
    }

    // ⭐ 5) 設定區域 & Boss 覆蓋
    window.currentArea = boss.area || "special_boss";
    window.SpecialBossOverride = boss.stats;

    // 記錄挑戰資訊
    this._current = {
      key: bossKey,
      ticketItem,
      rewardItem: boss.rewardItem || "Boss硬幣",
      rewardAmount: Number(boss.rewardAmount) || 1
    };

    // ⭐ 6) 立即生出 Boss（不動 autoEnabled，交給你自己去按開始戰鬥）
    if (typeof window.rerollMonster === "function") {
      window.rerollMonster();
    } else if (typeof window.spawnNewMonster === "function") {
      window.spawnNewMonster();
    }

    // 這裡不再強制開啟 autoEnabled，交給你手動按「開始戰鬥」
    return { ok:true, msg:"已準備好與「" + boss.name + "」的戰鬥，請按開始戰鬥！" };
  },

  onBattleEnd(success) {
    const cur = this._current;
    if (!cur) return;

    if (success) {
      // 成功：不退券，給獎勵
      if (typeof addItem === "function") {
        addItem(cur.rewardItem, cur.rewardAmount);
      }
    } else {
      // 失敗：退還入場券
      if (typeof addItem === "function") {
        addItem(cur.ticketItem, 1);
      }
    }

    this._current = null;
    window.SpecialBossOverride = null;
  }
};

window.SpecialBossGate = Gate;

  w.SpecialBossGate = Gate;
})(window);