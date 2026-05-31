(function () {
  // ===== 技能池：父系四職 + 通用 =====
  window.skillPool = window.skillPool || {
    warrior: [], mage: [], archer: [], thief: [], common: []
  };

  // 註冊通用技能
  window.registerCommonSkill = function (skill) {
    skill.isCommon = true;
    skill.job = skill.job || "common";
    (skillPool.common ||= []).push(skill);
  };

  // 註冊職業技能（父系：warrior/mage/archer/thief 或延伸如 warrior2）
  window.registerJobSkill = function (jobKey, skill) {
    (skillPool[jobKey] ||= []).push(skill);
  };

  // ===== 由 jobs 表推導 baseJob 與 jobTier =====
  function getBaseJobFromJobs(jobKey) {
    const map = window.jobs || {};
    let cur = String(jobKey || "").trim();
    if (!cur) return "warrior"; // 安全預設

    // 不在 jobs 裡，但有尾數字（warrior4）→ 試著去掉數字
    if (!map[cur] && /\d+$/.test(cur)) {
      const base = cur.replace(/\d+$/, "");
      if (map[base]) return base;
    }

    // 沿 parent 往上爬，直到最頂層
    while (map[cur]?.parent) cur = map[cur].parent;
    return map[cur] ? cur : (cur.replace(/\d+$/, "") || "warrior");
  }

  function getJobTierFromJobs(jobKey) {
    const map = window.jobs || {};
    let tier = 1;
    const cur = String(jobKey || "").trim();
    if (!cur) return tier;

    if (!map[cur]) {
      const m = cur.match(/(\d+)$/);
      return m ? Math.max(1, Number(m[1])) : 1;
    }

    tier = 1;
    let walk = cur;
    while (map[walk]?.parent) { tier++; walk = map[walk].parent; }
    return tier;
  }

  // 🔁 判斷「目前職業是否在某條職業線上（從 fromJobKey 往後的所有進階）」
  // 例：isJobInLineFrom("warrior_berserker5", "warrior_berserker3") === true
  function isJobInLineFrom(curJobKey, fromJobKey) {
    const map = window.jobs || {};
    let cur = String(curJobKey || "").trim();
    const target = String(fromJobKey || "").trim();
    if (!cur || !target) return false;

    // 從目前職業往上沿 parent 找，看是否經過 fromJobKey
    while (map[cur]?.parent) {
      if (cur === target) return true;
      cur = map[cur].parent;
    }
    // 最頂層再比一次
    return cur === target;
  }

  // 對外暴露
  window.getBaseJob = getBaseJobFromJobs;
  window.getJobTier  = getJobTierFromJobs;
  window.isJobInLineFrom = isJobInLineFrom;

  // ===== 技能解鎖判定（職業 / 轉數限制） =====
  // 可以在 skill 上使用的欄位：
  // - requiredJobTier: 最低轉數（原本就有）
  // - requireBaseJob:  限定父系，例如 "warrior" / "mage"
  // - requireJobLineFrom: 從某個 jobKey 起整條職業線（包含之後升階）都能用
  // - allowedJobs:     白名單，只允許這幾個 job key 使用
  // - minTier / maxTier: 額外的轉數範圍（可選）
  window.Skills_isUnlocked = function (skill) {
    const curJob  = player?.job;
    const curTier = getJobTierFromJobs(curJob);
    const baseJob = getBaseJobFromJobs(curJob);

    // ① 轉數需求（原本邏輯）
    const needTier = Number(skill?.requiredJobTier ?? 1);
    if (curTier < needTier) return false;

    // ② 父系職業需求
    if (skill.requireBaseJob && skill.requireBaseJob !== baseJob) {
      return false;
    }

    // ③-1 從某一轉開始整條職業線都能用
    // 例如：requireJobLineFrom: "warrior_berserker3"
    if (skill.requireJobLineFrom) {
      if (!isJobInLineFrom(curJob, skill.requireJobLineFrom)) {
        return false;
      }
    }

    // ③ 指定 job 白名單（最嚴格的限制）
    if (Array.isArray(skill.allowedJobs) && skill.allowedJobs.length > 0) {
      return skill.allowedJobs.includes(curJob);
    }

    // ④ 額外的轉數範圍
    if (skill.minTier && curTier < skill.minTier) return false;
    if (skill.maxTier && curTier > skill.maxTier) return false;

    return true;
  };

  // ===== 目前可用技能（由父系 + 通用，且通過轉數/職業過濾）=====
  window.activeSkills = window.activeSkills || [];
  function exposeActiveToLegacy() { window.skills = activeSkills; }

  // ======= 不依賴戰鬥的冷卻核心（時間戳）=======
  function now() { return Date.now(); }

  // 設置冷卻（相容：仍會同步 currentCooldown 供舊 UI 用）
  window.spendAndCooldown = function (skill, mp) {
    const cost = Number(mp) || 0;
    if (cost > 0 && typeof player?.currentMP === "number") {
      player.currentMP = Math.max(0, player.currentMP - cost);
    }
    const cd = Math.max(0, Number(skill.cooldown) || 0);
    if (cd > 0) {
      const ts = now();
      skill.cooldownUntil = ts + cd * 1000; // 秒 → 毫秒
      skill.cooldownStart = ts;
    } else {
      skill.cooldownUntil = 0;
      skill.cooldownStart = 0;
    }
    // 鏡射一份到舊欄位
    skill.currentCooldown = getSkillCDRemain(skill);
  };

  // 判斷是否可用
  window.isSkillReady = function (skill) {
    return !skill?.cooldownUntil || now() >= skill.cooldownUntil;
  };

  // 取得剩餘冷卻秒數（四捨五入向上，給 UI）
  window.getSkillCDRemain = function (skill) {
    if (!skill?.cooldownUntil) return 0;
    const remainMs = skill.cooldownUntil - now();
    return Math.max(0, Math.ceil(remainMs / 1000));
  };

  // 定時 Buff（保留你的版本；如要改成時間戳也可另做）
  window.startTimedBuff = function (ms, onEnd) {
    return setTimeout(() => { try { onEnd?.(); } catch {} }, ms);
  };

  // 取得當前 tier 的技能資料
  function getActiveTierLocal(skill) {
    const idx = Math.max(
      0,
      Math.min(
        Number(skill.currentTier || 0),
        (skill.tiers?.length || 1) - 1
      )
    );
    return skill.tiers?.[idx] || skill;
  }
  window.getActiveTier = getActiveTierLocal;

  // 等級進化：重設冷卻（避免新招一開始就卡CD）
  window.ensureSkillEvolution = function () {
    const lv = player.level || 1;
    for (const s of activeSkills) {
      if (!Array.isArray(s.tiers) || s.tiers.length === 0) continue;

      let target = 0;
      if (Array.isArray(s.evolveLevels) && s.evolveLevels.length) {
        for (let i = 0; i < s.evolveLevels.length; i++) {
          if (lv >= s.evolveLevels[i]) target = i;
        }
        target = Math.min(target, s.tiers.length - 1);
      } else if (typeof s.evolveLevel === "number") {
        target = lv >= s.evolveLevel ? 1 : 0;
      }
      if ((s.currentTier || 0) === target) continue;

      s.currentTier = target;
      const t = getActiveTierLocal(s);
      s.name = t.name;
      s.mpCost = t.mpCost;
      s.cooldown = t.cooldown;
      s.logic = t.logic;

      // 清冷卻（時間戳＋相容欄位）
      s.cooldownUntil = 0;
      s.cooldownStart = 0;
      s.currentCooldown = 0;

      logPrepend?.(`✨ 技能進化：獲得【${t.name}】（MP:${t.mpCost}｜CD:${t.cooldown}）`);
    }
  };

  // 建立當前可用技能（父系 + 轉數）
  window.rebuildActiveSkills = function () {
    // 取得父系與轉職階層的小工具（保險：就算外部沒提供也能跑）
    function _getBaseJob(job) {
      const s = String(job || "");
      const base = s.replace(/\d+$/, ""); // warrior3 -> warrior
      return base || s || "warrior";
    }
    function _getJobTier(job) {
      const s = String(job || "");
      const m = s.match(/(\d+)$/);
      return m ? Math.max(1, Number(m[1])) : 1; // 無數字視為一轉
    }

    const curJob = player?.job || 'warrior';
    const baseJob = (typeof getBaseJob === "function") ? getBaseJob(curJob) : _getBaseJob(curJob);
    const tier    = (typeof getJobTier === "function") ? getJobTier(curJob)    : _getJobTier(curJob);

    console.log("【Skills】player.job =", curJob, "→ baseJob =", baseJob, "tier =", tier);

    // 收集 1 ~ 當前轉的所有技能池（warrior, warrior2, warrior3 ...）
    const pools = [];
    const basePool = Array.isArray(skillPool[baseJob]) ? skillPool[baseJob] : [];
    pools.push(basePool);
    for (let t = 2; t <= tier; t++) {
      const key = baseJob + t;                   // e.g. warrior2
      if (Array.isArray(skillPool[key])) pools.push(skillPool[key]);
    }

    const candidates = [
      ...pools.flat(),
      ...(skillPool.common || []),
    ];

    // 🔒 依照職業 / 轉數限制過濾
    window.activeSkills = candidates.filter(s => {
      return typeof window.Skills_isUnlocked === "function"
        ? window.Skills_isUnlocked(s)
        : true;
    });

    // 同步 tier / 名稱 / mp / cd
    ensureSkillEvolution?.();
    exposeActiveToLegacy();
  };

  // 切職業/轉職後重建
  window.loadSkillsByJob = function () {
    rebuildActiveSkills();
  };

  // ===== 相容函式：不再「扣 1」，改用時間戳推算，並同步 currentCooldown =====
  window.reduceSkillCooldowns = function () {
    if (!Array.isArray(window.skills)) return;
    for (const skill of window.skills) {
      skill.currentCooldown = getSkillCDRemain(skill);
    }
  };

  // ===== 存檔/載入 =====
  window.Skills_exportState = function() {
    const out = {};
    const allSkills = [
      ...skillPool.warrior, ...skillPool.mage,
      ...skillPool.archer, ...skillPool.thief, ...skillPool.common
    ];
    allSkills.forEach(s => {
      if (s.id && s.level !== undefined) {
        out[s.id] = s.level;
      }
    });
    return out;
  };

  window.Skills_applyState = function(levelsById) {
    if (!levelsById || typeof levelsById !== 'object') return;
    const allSkills = [
      ...skillPool.warrior, ...skillPool.mage,
      ...skillPool.archer, ...skillPool.thief, ...skillPool.common
    ];
    allSkills.forEach(s => {
      if (s.id && levelsById[s.id] !== undefined) {
        s.level = Math.max(1, Math.min(20, levelsById[s.id]));
        // 重置冷卻（時間戳＋相容）
        s.cooldownUntil = 0;
        s.cooldownStart = 0;
        s.currentCooldown = 0;
      }
    });
    if (typeof window.rebuildActiveSkills === 'function') {
      rebuildActiveSkills();
    }
  };

  // ===== 全域冷卻顯示 ticker（不依賴戰鬥；每秒更新 currentCooldown 供舊 UI 顯示）=====
  function startSkillGlobalTicker() {
    if (window.__skillClock) return;
    window.__skillClock = setInterval(() => {
      try {
        if (Array.isArray(window.skills)) {
          for (const s of window.skills) {
            s.currentCooldown = getSkillCDRemain(s);
          }
        }
      } catch {}
    }, 1000);
  }

  // 自動啟動（等資料齊全）
  (function waitReady() {
    const hasPlayer = typeof player !== 'undefined';
    const poolFilled =
      (skillPool.common.length +
       Object.values(skillPool).flatMap(a => a).length) > 0;

    if (hasPlayer && poolFilled) {
      rebuildActiveSkills();
      startSkillGlobalTicker(); // ✅ 啟動全域冷卻顯示
      return;
    }
    setTimeout(waitReady, 50);
  })();
})();