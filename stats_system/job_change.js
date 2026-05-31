// ==========================
// job_change.js（分支版 + 小方塊 UI）
// ==========================

// 轉職等級與寶珠需求（從二轉開始）
const JOB_CHANGE_REQUIREMENTS = [
  { level: 30,  cost: 25 },   // 二轉
  { level: 70,  cost: 200 },  // 三轉
  { level: 120, cost: 400 },  // 四轉
  { level: 400, cost: 800 },  // 五轉
  { level: 900, cost: 1600 }, // 六轉
];

// ===== 幾轉判斷（從 jobs 結構推） =====
function getJobTierFromJobs(jobKey) {
  const map = window.jobs || {};
  let tier = 1;
  const cur = String(jobKey || "").trim();
  if (!cur) return tier;

  // 如果 jobKey 沒在 jobs 裡，就用名稱尾巴的數字推（例：archer5 -> 5）
  if (!map[cur]) {
    const m = cur.match(/(\d+)$/);
    return m ? Math.max(1, Number(m[1])) : 1;
  }

  tier = 1;
  let walk = cur;
  while (map[walk]?.parent) { tier++; walk = map[walk].parent; }
  return tier;
}

// 依照「目前幾轉」決定「下一次轉職需求」
function getNextJobChangeRequirementForPlayer() {
  const job  = player?.job || "warrior";
  const tier = getJobTierFromJobs(job);  // 1~6

  // 1轉 -> 用 index 0（二轉需求）、2轉 -> index 1（三轉需求）...依此類推
  const idx = tier - 1;
  if (idx < 0 || idx >= JOB_CHANGE_REQUIREMENTS.length) return null;
  return JOB_CHANGE_REQUIREMENTS[idx];
}

// ===== 尋找子職業（下一轉候選） =====
function getChildJobsOf(jobKey) {
  const map = window.jobs || {};
  const result = [];
  for (const key in map) {
    if (map[key]?.parent === jobKey) {
      result.push(key);
    }
  }
  return result;
}

// ===== 轉職按鈕點擊 =====
function handleJobChangeClick() {
  const lv  = Number.isFinite(player?.level) ? player.level : 0;
  const req = getNextJobChangeRequirementForPlayer();

  if (!req) {
    alert("所有轉職階段都已完成！");
    return;
  }

  const ITEM_NAME = "轉職寶珠";
  const owned = getItemQuantity?.(ITEM_NAME) || 0;

  // 等級不夠：顯示需要等級 + 目前等級 + 需要寶珠 + 目前寶珠
  if (lv < req.level) {
    alert(
      `等級不足，無法進行下一次轉職。\n` +
      `需要等級：${req.level}（目前等級：${lv}）\n` +
      `轉職同時需要「${ITEM_NAME}」×${req.cost}（目前擁有：${owned} 顆）`
    );
    return;
  }

  // 等級已達，但寶珠不夠
  if (owned < req.cost) {
    alert(
      `轉職需要「${ITEM_NAME}」×${req.cost}，目前只有 ${owned} 顆。\n` +
      `等級條件已達成（需要等級：${req.level}，目前等級：${lv}）。`
    );
    return;
  }

  if (!confirm(`將消耗 ${req.cost} 顆「${ITEM_NAME}」進行轉職，是否確定？`)) return;

  removeItem(ITEM_NAME, req.cost);

  openJobChangePanel({ levelNode: req.level });
}

// ===== 轉職選擇 UI（小方塊面板） =====
let __jobChangePendingLevel = null;

// 動態建立 modal（只建立一次）
function ensureJobChangeModal() {
  if (document.getElementById("jobChangeChoiceModal")) return;

  const modal = document.createElement("div");
  modal.id = "jobChangeChoiceModal";
  modal.className = "job-change-modal hidden";

  const content = document.createElement("div");
  content.className = "job-change-modal-content";

  const title = document.createElement("h2");
  title.textContent = "選擇轉職職業";

  const subtitle = document.createElement("p");
  subtitle.className = "job-change-modal-subtitle";
  subtitle.textContent = "請選擇一條你想前進的職業路線。";

  const grid = document.createElement("div");
  grid.className = "job-change-grid";
  grid.id = "jobChangeChoiceGrid";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.id = "jobChangeCancelBtn";
  cancel.className = "job-change-cancel-btn";
  cancel.textContent = "取消";

  content.appendChild(title);
  content.appendChild(subtitle);
  content.appendChild(grid);
  content.appendChild(cancel);
  modal.appendChild(content);
  document.body.appendChild(modal);

  // 點背景也關閉
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) {
      closeJobChangeModal();
      alert("已取消轉職。");
    }
  });

  cancel.addEventListener("click", () => {
    closeJobChangeModal();
    alert("已取消轉職。");
  });
}

function openJobChangeModal(levelNode, jobKeys) {
  ensureJobChangeModal();
  __jobChangePendingLevel = levelNode;

  const modal = document.getElementById("jobChangeChoiceModal");
  const grid  = document.getElementById("jobChangeChoiceGrid");
  if (!modal || !grid) return;

  // 清空舊內容
  grid.innerHTML = "";

  const map = window.jobs || {};
  jobKeys.forEach(key => {
    const data = map[key] || {};
    const card = document.createElement("button");
    card.type = "button";
    card.className = "job-card";
    card.dataset.jobKey = key;

    const nameEl = document.createElement("div");
    nameEl.className = "job-card-name";
    nameEl.textContent = data.name || key;

    const descEl = document.createElement("div");
    descEl.className = "job-card-desc";
    descEl.textContent = ""; // 之後你想要可以在 jobs 裡加描述再拉進來

    card.appendChild(nameEl);
    card.appendChild(descEl);

    card.addEventListener("click", () => {
      const jobKey = card.dataset.jobKey;
      if (!jobKey || !map[jobKey]) return;

      if (!confirm(`確認轉職為「${map[jobKey].name}」？`)) return;

      applyJobChange(__jobChangePendingLevel, jobKey);
      closeJobChangeModal();
    });

    grid.appendChild(card);
  });

  modal.classList.remove("hidden");
}

function closeJobChangeModal() {
  const modal = document.getElementById("jobChangeChoiceModal");
  if (modal) modal.classList.add("hidden");
  __jobChangePendingLevel = null;
}

// ===== 開啟轉職面板（改為看 children） =====
function openJobChangePanel({ levelNode }) {
  const curJob = player.job;
  const map = window.jobs || {};

  if (!map[curJob]) {
    alert("找不到目前職業的資料，無法轉職。");
    return;
  }

  const children = getChildJobsOf(curJob);

  if (!children.length) {
    alert("此職業已無更高階的轉職路線。");
    return;
  }

  if (children.length === 1) {
    const targetJobKey = children[0];
    const name = map[targetJobKey]?.name || targetJobKey;
    if (!confirm(`確認轉職為「${name}」？`)) return;
    applyJobChange(levelNode, targetJobKey);
    return;
  }

  // 多條分支：用小方塊選單
  openJobChangeModal(levelNode, children);
}

// ===== 真正套用 =====
function applyJobChange(levelNode, jobKey) {
  const map = window.jobs || {};
  if (!map[jobKey]) {
    alert("職業資料錯誤，無法轉職。");
    return;
  }

  player.job = jobKey;

  // 🎁 每次轉職額外給 20 點屬性點數 + 10 張被動能力券
  player.statPoints = (player.statPoints || 0) + 20;

  if (typeof addItem === "function") {
    try {
      addItem("被動能力券", 10);
    } catch (_) {
      // 忽略錯誤，避免遊戲炸掉
    }
  }

  // ⭐ 轉職後重建技能列表，讓新職業技能立即生效
  if (typeof loadSkillsByJob === "function") {
    loadSkillsByJob();
  }

  if (typeof recomputeTotalStats === "function") recomputeTotalStats();
  if (typeof updateResourceUI === "function") updateResourceUI();

  const name = map[jobKey].name || jobKey;

  alert(
    `✅ 轉職完成！目前職業：${name}\n` +
    `🎁 獲得額外 20 屬性點數！\n` +
    `🎫 獲得 10 張「被動能力券」！`
  );

  // 🏆 在轉職成功後，立即呼叫存檔函式
  if (typeof saveGame === "function") {
    saveGame();
  }
}

// 綁定按鈕（確保 DOM 已經載入）
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("job-change-btn");
  if (btn) {
    btn.addEventListener("click", handleJobChangeClick);
  } else {
    console.warn("未找到 #job-change-btn，無法綁定轉職按鈕");
  }
});

// 如果其他檔案需要呼叫，可以掛到 window（選擇性）
window.getNextJobChangeRequirementForPlayer = getNextJobChangeRequirementForPlayer;
window.handleJobChangeClick = handleJobChangeClick;