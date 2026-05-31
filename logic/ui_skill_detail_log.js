// ui_skill_detail_log.js
// 專門顯示「群體技能」每一隻怪物的詳細傷害。
// ✅ 不做任何戰鬥計算，只顯示 Rpg_玩家 傳進來的結果。
// 依賴 HTML：
// <div id="skillDetailLog" class="battle-log"></div>
// 以及清除按鈕：onclick="clearSkillDetailLog()"
//
// Rpg_玩家 端預期呼叫格式：
//
// if (SkillDetailLog && typeof SkillDetailLog.onMultiSkill === "function") {
//   SkillDetailLog.onMultiSkill({
//     skillName: "星界連鎖",
//     maxTargets: 6,
//     targets: [
//       {
//         name: "藍寶 Lv.8",
//         hpBefore: 135,
//         hpAfter: 0,
//         damage: 65164,    // 顯示用傷害：已含爆擊 / 易傷 / 溢傷等
//         isCrit: true,     // （可選）若有傳 true，UI 會加上「爆擊」標籤
//         isKill: true      // （可選）若沒傳，UI 會用 hpAfter<=0 自己判斷
//       },
//       ...
//     ]
//   });
// }

(function (global) {
  "use strict";

  // 取得容器
  function _getContainer() {
    if (typeof document === "undefined") return null;
    return document.getElementById("skillDetailLog");
  }

  // 安全轉字串
  function _str(x) {
    return (x === undefined || x === null) ? "" : String(x);
  }

  // 基礎 escape（避免把 < > & 直接插入 HTML）
  function _escape(text) {
    return _str(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // 數字格式化（3 位一撇）
  function _fmtNum(n) {
    var x = Number(n) || 0;
    try {
      return x.toLocaleString();
    } catch (e) {
      return String(x);
    }
  }

  // 建立一筆 block log（最新在最上面）
  function _appendBlock(html) {
    var box = _getContainer();
    if (!box) return;

    var wrap = document.createElement("div");
    wrap.className = "battle-log-block skill-detail-block";
    wrap.innerHTML = html;

    // 新的放最上面
    if (box.firstChild) {
      box.insertBefore(wrap, box.firstChild);
    } else {
      box.appendChild(wrap);
    }

    // 限制最多幾筆 block，避免無限膨脹
    var maxBlocks = 50;
    while (box.childElementCount > maxBlocks) {
      box.removeChild(box.lastChild);
    }
  }

  // 清除全部紀錄（給按鈕用）
  function clearSkillDetailLog() {
    var box = _getContainer();
    if (!box) return;
    box.innerHTML = "";
  }

  // === 主入口：顯示一次群體技能的詳細資訊 ===
  function onMultiSkill(payload) {
    var box = _getContainer();
    if (!box) return; // UI 沒載入就直接略過

    if (!payload || !Array.isArray(payload.targets) || !payload.targets.length) {
      return;
    }

    var skillName  = _escape(payload.skillName || "技能");
    var maxTargets = Number(payload.maxTargets || payload.targets.length || 1);
    var targets    = payload.targets;

    // ⭐ 完全信任 Rpg_玩家：damage 就是要顯示的最終傷害，不做任何再計算
    var totalDamage = 0;
    for (var i = 0; i < targets.length; i++) {
      totalDamage += Number(targets[i].damage || 0);
    }
    var hitCount   = targets.length;
    var avgDamage  = hitCount > 0 ? Math.round(totalDamage / hitCount) : 0;

    // ===== 頭一行：技能總覽 =====
    var headHtml =
      "<div class=\"skill-detail-head\">" +
        "【" + skillName + "】" +
        " 命中 " + hitCount + " / " + maxTargets + " 個目標" +
        "｜總傷害 " + _fmtNum(totalDamage) +
        "｜平均 " + _fmtNum(avgDamage) +
      "</div>";

    var detailHtml = [headHtml];

    // ===== 逐一目標 =====
    for (var j = 0; j < targets.length; j++) {
      var t = targets[j];

      var name      = _escape(t.name || ("目標" + (j + 1)));
      var dmg       = Number(t.damage || 0);      // 顯示用傷害（Rpg 已決定好）
      var hpBefore  = Number(t.hpBefore || 0);
      var hpAfter   = Number(t.hpAfter  || 0);

      // 是否秒殺：優先用 Rpg 傳來的 isKill；沒有就用 hpAfter 判斷
      var isKill = (t.isKill === true) || (t.isKill === undefined && hpAfter <= 0 && hpBefore > 0);

      // 是否爆擊：完全由 Rpg 決定要不要標
      var isCrit = (t.isCrit === true);

      // 標籤 HTML
      var tags = "";
      if (isKill) {
        tags += "<span class=\"skill-tag skill-tag-kill\">秒殺</span>";
      }
      if (isCrit) {
        tags += "<span class=\"skill-tag skill-tag-crit\">爆擊</span>";
      }

      var lineHtml =
        "<div class=\"skill-detail-item\">" +
          "<span class=\"skill-target-name\">• " + name + "：</span>" +
          "<span class=\"skill-detail-dmg\">" + _fmtNum(dmg) + "</span> 傷害" +
          " <span class=\"skill-hp-range\">(" + _fmtNum(hpBefore) + " → " + _fmtNum(hpAfter) + ")</span>" +
          (tags ? " " + tags : "") +
        "</div>";

      detailHtml.push(lineHtml);
    }

    _appendBlock(detailHtml.join(""));
  }

  // 綁到全域
  global.SkillDetailLog = {
    onMultiSkill: onMultiSkill,
    clear: clearSkillDetailLog
  };

  // 讓 HTML 按鈕可以直接呼叫 clearSkillDetailLog()
  global.clearSkillDetailLog = clearSkillDetailLog;

})(window);