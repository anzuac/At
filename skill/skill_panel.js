// =======================
// skill_panel.js（融合＋格子＋補助中心連動 完整版）
//
// 小面板：
//   - 攻擊技能：顯示技能名稱 + CD 倒數 + 自動/手動
//   - 補助/增益技能（來自 register.js 的 AssistSkillPanelAPI）：
//       - 顯示 CD / Buff 倒數
//       - 顯示 自動/手動（從補助頁的勾勾同步）
//       - 「啟動」按鈕會呼叫 AssistSkillPanelAPI.castById(id)
//   - 被動技能：顯示「被動」標記
//
// 顯示分區：攻擊技能 / 補助・增益技能 / 被動技能，使用 CSS Grid 卡片排版
// =======================

(function () {
  const $ = (id) => document.getElementById(id);

  // 若外部未提供 togglePanel，這裡補一個最簡版（顯示/隱藏）
  if (typeof window.togglePanel !== "function") {
    window.togglePanel = function (bodyId) {
      const el = $(bodyId);
      if (!el) return;
      const hidden = getComputedStyle(el).display === "none";
      el.style.display = hidden ? "" : "none";
      const btn = document.querySelector(`[onclick*="${bodyId}"]`);
      if (btn) btn.textContent = hidden ? "▼" : "▲";
    };
  }

  function fmtSec(s) {
    s = Math.max(0, Math.ceil(Number(s) || 0));
    return s + "s";
  }

  // 取得冷卻剩餘秒數
  function getCdRemain(skill) {
    // 🔹 補助技能：直接吃 register.js 給的秒數
    if (skill.fromAssist && typeof skill.currentCooldown === "number") {
      return Math.max(0, Math.ceil(skill.currentCooldown));
    }

    // 🔹 攻擊技能的舊邏輯：優先 currentCooldown；其次用 cooldownStart 推算
    const cd = Number(skill.cooldown || 0);
    if (cd <= 0) return 0;

    if (Number(skill.currentCooldown) > 0) {
      return Math.max(0, Math.ceil(skill.currentCooldown));
    }

    if (skill.cooldownStart) {
      const past = (Date.now() - skill.cooldownStart) / 1000;
      return Math.max(0, Math.ceil(cd - past));
    }

    return 0;
  }

  // 取得 Buff 剩餘秒數
  function getBuffRemain(skill) {
    if (!skill) return 0;

    // 🔹 補助技能：直接吃 register.js 給的秒數
    if (skill.fromAssist && typeof skill.buffRemainFromAssist === "number") {
      return Math.max(0, Math.ceil(skill.buffRemainFromAssist));
    }

    // 🔹 其他（如果有 activeUntil）
    const end = Number(skill.activeUntil || 0);
    if (!end) return 0;
    const remainMs = end - Date.now();
    return Math.max(0, Math.ceil(remainMs / 1000));
  }
// 從 register.js 的 AssistSkillPanelAPI 把補助技能轉成通用格式
  function getAssistSkillsFromRegister() {
    const result = [];
    if (
      !window.AssistSkillPanelAPI ||
      typeof window.AssistSkillPanelAPI.getSnapshot !== "function"
    ) {
      return result;
    }

    const snaps = window.AssistSkillPanelAPI.getSnapshot() || [];

    snaps.forEach((snap) => {
      // 🔹 register.js 那邊有把精通標記成 type: "mastery"
      const t = String(snap.type || "").toLowerCase();

      // 👉 這裡直接排除精通 / 被動，只保留真的「可施放的補助技能」
      if (t === "mastery" || t === "passive") {
        return; // 不進小面板
      }

      result.push({
        id: snap.id,
        name: snap.name,
        // 繼承 register.js 給的 type，沒有就當 support
        type: t || "support",
        role: t || "support",

        cooldown: snap.cooldown,
        currentCooldown: snap.cdRemain,
        buffRemainFromAssist: snap.buffRemain,

        fromAssist: true,                 // 來自補助中心
        auto: !!snap.auto,               // 自動狀態
        autoEnabled: !!snap.autoEnabled  // 對齊攻擊技能欄位名
      });
    });

    return result;
  }

  // 取得技能列表：攻擊 + 補助（fromAssist）+ 其他（若未來有）
  function getSkillList() {
    const raw = [];

    // 攻擊 / 主動技能
    if (Array.isArray(window.skills))       raw.push.apply(raw, window.skills);
    if (Array.isArray(window.activeSkills)) raw.push.apply(raw, window.activeSkills);

    // 補助中心（register.js）
    const assist = getAssistSkillsFromRegister();
    raw.push.apply(raw, assist);

    // 若未來有另外的 supportSkills / buffSkills 也可加進來
    // if (Array.isArray(window.supportSkills)) raw.push.apply(raw, window.supportSkills);
    // if (Array.isArray(window.buffSkills))    raw.push.apply(raw, window.buffSkills);

    // 去重：優先用 id，其次 key，再其次 name
    const map = {};
    const ordered = [];
    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      if (!s) continue;
      const key =
        (s.id != null ? "id:" + s.id :
        (s.key != null ? "key:" + s.key :
        "name:" + (s.name || ("#" + i))));
      if (map[key]) continue;
      map[key] = 1;
      ordered.push(s);
    }
    return ordered;
  }

  // 傳統補助技能啟動 hook（如果之後還有別的補助來源）
  if (typeof window.onSupportSkillActivate !== "function") {
    window.onSupportSkillActivate = function (skill) {
      console.warn("[skill_panel] 尚未實作 onSupportSkillActivate(skill)", skill);
    };
  }

  // 按鈕入口：
  //   1) 優先呼叫 register.js 的 AssistSkillPanelAPI.castById(id)
  //   2) 沒有的話才走舊的 onSupportSkillActivate(skill)
  function activateSupportSkillByKey(key) {
    // 1) 補助中心的 castById
    if (
      window.AssistSkillPanelAPI &&
      typeof window.AssistSkillPanelAPI.castById === "function"
    ) {
      window.AssistSkillPanelAPI.castById(key);
      return;
    }

    // 2) Fallback：舊的方式（如果之後還有別的補助技能陣列）
    const list = getSkillList();
    const sk = list.find(
      (s) =>
        String(s.id) === key ||
        String(s.key) === key ||
        String(s.name) === key
    );
    if (!sk) return;
    if (typeof window.onSupportSkillActivate === "function") {
      window.onSupportSkillActivate(sk);
    }
  }
  window._activateSupportSkillByKey = activateSupportSkillByKey;

  function renderOne(skill) {
    if (!skill) return "";

    // 🔹 攻擊技能：用 ensureSkillAutoFlag 初始化 autoEnabled
    // 🔹 補助技能（fromAssist）：auto 狀態由補助中心提供，不要亂改
    if (!skill.fromAssist && typeof window.ensureSkillAutoFlag === "function") {
      window.ensureSkillAutoFlag(skill);
    }

    const type = (skill.type || skill.role || "attack").toLowerCase();
    const name = skill.name || skill.id || "技能";

    const cd = Number(skill.cooldown || 0);
    const cdRemain = getCdRemain(skill);

    const isSupportLike =
      type === "support" ||
      type === "buff" ||
      (skill.role || "").toLowerCase() === "support";

    const buffRemain = isSupportLike ? getBuffRemain(skill) : 0;
    const isPassive = type === "passive";

    const meta = [];

    if (cd > 0) {
      meta.push(cdRemain > 0 ? `CD ${fmtSec(cdRemain)}` : "CD 就緒");
    }

    if (isSupportLike && buffRemain > 0) {
      meta.push(`Buff ${fmtSec(buffRemain)}`);
    }

    if (isPassive) {
      meta.push("被動");
    }

    // 🔹 狀態文字：自動 / 手動
    //   - 補助技能：看 snapshot 的 auto / autoEnabled
    //   - 攻擊技能：看 ensureSkillAutoFlag 設的 autoEnabled
    const isAuto = skill.fromAssist
      ? (!!skill.auto || !!skill.autoEnabled)
      : !!skill.autoEnabled;

    if (isAuto) {
      meta.push("自動");
    } else if (!isPassive) {
      meta.push("手動");
    }

    // —— 攻擊技能：不顯示按鈕；補助技能：顯示啟動按鈕 —— //
    let btnHtml = "";
    if (isSupportLike && !isPassive) {
      let btnLabel = "啟動";
      let disabled = false;

      if (buffRemain > 0) {
        btnLabel = "啟動中";
        disabled = true;
      } else if (cd > 0 && cdRemain > 0) {
        btnLabel = "冷卻中";
        disabled = true;
      }

      const key = String(
        skill.id != null ? skill.id : skill.key != null ? skill.key : name
      );

      btnHtml = `
        <button
          class="skill-btn support-skill-btn"
          ${disabled ? "disabled" : ""}
          onclick="_activateSupportSkillByKey('${key.replace(/'/g, "\\'")}')"
        >
          ${btnLabel}
        </button>
      `;
    }

    return `
      <div class="skill-card">
        <div class="skill-card-header">
          <span class="skill-name">${name}</span>
        </div>
        <div class="skill-card-body">
          <div class="skill-meta">
            ${meta.join(" ｜ ")}
          </div>
        </div>
        ${btnHtml
          ? `<div class="skill-card-footer">${btnHtml}</div>`
          : ""
        }
      </div>
    `;
  }

  function renderGroup(title, list) {
    if (!list || !list.length) return "";
    return `
      <div class="skill-group">
        <div class="skill-group-title">${title}</div>
        <div class="skill-grid">
          ${list.map(renderOne).join("")}
        </div>
      </div>
    `;
  }

  window.renderSkillPanel = function () {
    const host = $("skillStatus");
    if (!host) return;

    const list = getSkillList();

    // 顯示順序：攻擊 → 補助/增益 → 被動
    const atk = list.filter(
      (s) => (s.type || s.role || "").toLowerCase() === "attack"
    );
    const sup = list.filter((s) =>
      ["support", "buff"].includes((s.type || s.role || "").toLowerCase())
    );
    const pas = list.filter(
      (s) => (s.type || s.role || "").toLowerCase() === "passive"
    );

    host.innerHTML =
      renderGroup("攻擊技能", atk) +
      renderGroup("補助 / 增益技能", sup) +
      renderGroup("被動技能", pas);
  };

  // 初始化：如果面板存在，就先渲染一次；之後每 500ms 自動更新倒數
  function boot() {
    if (document.getElementById("skillStatus")) {
      try {
        window.renderSkillPanel();
      } catch (e) {
        console.error("[skill_panel] 初次 render 失敗：", e);
      }
      setInterval(() => {
        try {
          window.renderSkillPanel();
        } catch (e) {
          console.error("[skill_panel] 週期 render 失敗：", e);
        }
      }, 500);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();