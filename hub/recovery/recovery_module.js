// ===============================
// recovery_system.js (Bug Fixed & Integrated Version)
// ✅ 解決 upgradeCostForLevel 未定義問題
// ✅ 整合圖鑑潛能：將 5s 0.2% 轉換為 10s 0.4% 併入計算
// ✅ 新增 UI 預覽標籤與閃爍視覺回饋
// ===============================

let recoverySystem;

const TICK_MS = 10000;          
const BASE_HP_PER_TICK = 30;    
const BASE_MP_PER_TICK = 3;     
const HP_INC_PER_LEVEL   = 30;  
const MP_INC_PER_LEVEL   = 2;   
const RECOVERY_EAT_RATIO = 30;  
let   RECOVERY_MAX_LEVEL = 200;  

const SAVEHUB_NS = "recovery_system_simple_v1";     
const RECOVERY_STORE_KEY = "恢復"; 
const SH = window.SaveHub || null;

// === 1. 核心計算函數 (先定義，防止 ReferenceError) ===

function costIncrementForLevel(prevLevel) {
  if (prevLevel <= 10) return 1000;
  if (prevLevel <= 20) return 3000;
  return 7000;
}

function upgradeCostForLevel(level) {
  let cost = 1000; 
  for (let L = 1; L < level; L++) {
    cost += costIncrementForLevel(L);
  }
  return cost;
}

function toFraction(x) {
  const v = Number(x) || 0;
  if (v <= 0) return 0;
  if (v > 1 && v <= 100) return v / 100;
  return Math.min(v, 1);
}

function getEffectiveRecoverBonus() {
  const totalPct = toFraction(player?.totalStats?.recoverPercent || 0);
  return Math.max(0, totalPct * RECOVERY_EAT_RATIO);
}

function getFlatPerTick(level) {
  const L = Math.max(1, level|0);
  const upgrades = Math.max(0, L - 1);
  return { 
    hp: BASE_HP_PER_TICK + HP_INC_PER_LEVEL * upgrades,
    mp: BASE_MP_PER_TICK + MP_INC_PER_LEVEL * upgrades
  };
}

// === 2. 存檔與系統初始化 ===

function freshStore(){ return { level: 1, uiOpen: false }; }
function normalizeStore(obj){
  const out = freshStore();
  const lv = Math.max(1, Number(obj && obj.level || 1));
  out.level = Math.min(RECOVERY_MAX_LEVEL, lv);
  out.uiOpen = !!(obj && obj.uiOpen);
  return out;
}

function shGet(defVal){
  if (!SH) return defVal;
  try{
    if (typeof SH.get === "function") return SH.get(SAVEHUB_NS, defVal);
    if (typeof SH.read === "function") return SH.read(SAVEHUB_NS, defVal);
  }catch(e){ return defVal; }
}
function shSet(val){
  if (!SH) return;
  try{
    if (typeof SH.set === "function") SH.set(SAVEHUB_NS, val);
    else if (typeof SH.write === "function") SH.write(SAVEHUB_NS, val);
  }catch(e){}
}

function loadRecoveryStore() {
  if (SH){
    let data = shGet(null);
    if (!data){
      const raw = localStorage.getItem(RECOVERY_STORE_KEY);
      if (raw){
        try {
          const legacy = JSON.parse(raw);
          data = normalizeStore(legacy);
          shSet(data);
          localStorage.removeItem(RECOVERY_STORE_KEY);
        } catch(_){ data = null; }
      }
    }
    return normalizeStore(data || freshStore());
  }
  const raw = localStorage.getItem(RECOVERY_STORE_KEY);
  return normalizeStore(raw ? JSON.parse(raw) : freshStore());
}

function saveRecoveryStore(obj) {
  const safe = normalizeStore(obj || freshStore());
  if (SH) shSet(safe);
  else localStorage.setItem(RECOVERY_STORE_KEY, JSON.stringify(safe));
}

function persistRecoveryToStore() {
  const store = loadRecoveryStore();
  store.level = Math.min(RECOVERY_MAX_LEVEL, Math.max(1, recoverySystem?.level || 1));
  store.uiOpen = !!recoverySystem?.uiOpen;
  saveRecoveryStore(store);
}

// -----------------------------
// Utils: affordability (safe)
// -----------------------------
function canAffordSafe(cost) {
  try {
    if (typeof window !== 'undefined' && typeof window.canAfford === 'function') {
      return !!window.canAfford(cost);
    }
  } catch (e) {}

  const p = (typeof player !== 'undefined' ? player : (typeof window !== 'undefined' ? window.player : null)) || {};
  const gold = Number(p.gold ?? p.money ?? 0);

  if (typeof cost === 'number') return gold >= cost;

  if (cost && typeof cost === 'object') {
    // Common single-currency shapes
    if (Number.isFinite(cost.gold)) return gold >= Number(cost.gold);
    if (Number.isFinite(cost.money)) return gold >= Number(cost.money);
    if (Number.isFinite(cost.cost)) return gold >= Number(cost.cost);

    // Multi-currency: check any numeric fields against matching player fields
    for (const [k, v] of Object.entries(cost)) {
      if (!Number.isFinite(v)) continue;
      const have = Number(p[k] ?? 0);
      if (have < Number(v)) return false;
    }
    return true;
  }

  // Unknown shape: be conservative
  return false;
}

function initRecoverySystem() {
  const store = loadRecoveryStore();
  const lvl  = Math.min(RECOVERY_MAX_LEVEL, Math.max(1, Number(store.level || 1)));

  recoverySystem = {
    level: lvl,
    uiOpen: !!store.uiOpen,
    maxLevel: RECOVERY_MAX_LEVEL,
    get hpFlatPerTick() { return getFlatPerTick(this.level).hp; },
    get mpFlatPerTick() { return getFlatPerTick(this.level).mp; },
    get hpPotRegenPercent() {
      const pot = player?.PotentialBonus?.bonusData?.collectionBook;
      return (pot?.hpRegen || 0) * 2; 
    },
    get mpPotRegenPercent() {
      const pot = player?.PotentialBonus?.bonusData?.collectionBook;
      return (pot?.mpRegen || 0) * 2;
    },
    get effectiveBonus() { return getEffectiveRecoverBonus(); },
    get hpPerTickActual() {
      const base = Math.ceil(this.hpFlatPerTick * (1 + this.effectiveBonus));
      const pot  = Math.floor((player?.totalStats?.hp || 0) * (this.hpPotRegenPercent / 100));
      return base + pot;
    },
    get mpPerTickActual() {
      const base = Math.ceil(this.mpFlatPerTick * (1 + this.effectiveBonus));
      const pot  = Math.floor((player?.totalStats?.mp || 0) * (this.mpPotRegenPercent / 100));
      return base + pot;
    },
    get upgradeCost() { return upgradeCostForLevel(this.level); }
  };

  persistRecoveryToStore();
  window.recoverySystem = recoverySystem;
  initRecoveryUI();
}

// === 3. UI 預覽標籤 ===

function initRecoveryUI() {
  // 舊版左下角預覽彈窗已併入 GrowthHub「恢復系統」分頁顯示，避免重繪/排版干擾。
  // 如需恢復舊預覽，可在此處自行加回。
  return;
}

function updateLiveUI() {
  const hpEl = document.getElementById('hp-rec-ui');
  const mpEl = document.getElementById('mp-rec-ui');
  if (hpEl && recoverySystem) {
    hpEl.textContent = `HP REC: +${recoverySystem.hpPerTickActual.toLocaleString()}`;
    mpEl.textContent = `MP REC: +${recoverySystem.mpPerTickActual.toLocaleString()}`;
  }
}

function triggerRecoveryEffect() {
  const container = document.getElementById('recovery-ui-preview');
  if (!container) return;
  container.style.transform = "scale(1.1)";
  setTimeout(() => { container.style.transform = "scale(1)"; }, 300);
}

// === 4. 定時恢復計時器 ===

setInterval(() => {
  if (!player || !recoverySystem) return;
  if (player.currentHP <= 0) return;

  const hpGain = recoverySystem.hpPerTickActual;
  const mpGain = recoverySystem.mpPerTickActual;

  player.currentHP = Math.min(player.currentHP + hpGain, player.totalStats.hp);
  player.currentMP = Math.min(player.currentMP + mpGain, player.totalStats.mp);

  updateLiveUI();
  triggerRecoveryEffect();
  if (typeof updateResourceUI === "function") updateResourceUI();
}, TICK_MS);

// === 5. 升級與外部接口 ===

function upgradeRecovery() {
  if (!player || !recoverySystem) return;
  if (recoverySystem.level >= recoverySystem.maxLevel) return alert("已達上限");
  const cost = Math.floor(recoverySystem.upgradeCost);
  if ((player.stone || 0) < cost) return alert("強化石不足");
  
  player.stone -= cost;
  recoverySystem.level++;
  persistRecoveryToStore();
  updateLiveUI();
  if (typeof updateResourceUI === "function") updateResourceUI();
  if (typeof saveGame === "function") saveGame();
  try { window.GrowthHub && window.GrowthHub.requestRerender(); } catch (_) {}
}

// 在你的 recovery_system.js 中找到這個函數並加上 updateLiveUI()
window.syncRecoveryFromPlayer = function() {
  if (!player) return;
  const store = loadRecoveryStore();
  if (recoverySystem) {
    recoverySystem.level = store.level;
    // 強制 UI 在同步存檔後立刻重新整理數值，不要等 10 秒
    updateLiveUI(); 
  }
};


(function waitPlayer() {
  if (typeof player === "undefined") return setTimeout(waitPlayer, 50);
  initRecoverySystem();
})();

// === 6. GrowthHub 分頁註冊 ===

(function registerGrowthTab(){
  function fmt(n){ return Number(n||0).toLocaleString(); }
  function pct(n){ return (Number(n||0)*100).toFixed(2) + "%"; }

  function render(container){
    if (!recoverySystem) return;

    const lv  = recoverySystem.level | 0;
    const max = (recoverySystem.maxLevel || RECOVERY_MAX_LEVEL) | 0;
    const isMax = lv >= max;
    const nextLv = isMax ? lv : (lv + 1);

    // 目前/下一級（預估）回復量
    const effBonus = recoverySystem.effectiveBonus;
    const curFlat  = getFlatPerTick(lv);
    const nxtFlat  = getFlatPerTick(nextLv);

    const hpPot = Math.floor((player?.totalStats?.hp || 0) * (recoverySystem.hpPotRegenPercent / 100));
    const mpPot = Math.floor((player?.totalStats?.mp || 0) * (recoverySystem.mpPotRegenPercent / 100));

    const curHp = (Math.ceil(curFlat.hp * (1 + effBonus)) + hpPot) | 0;
    const curMp = (Math.ceil(curFlat.mp * (1 + effBonus)) + mpPot) | 0;
    const nxtHp = (Math.ceil(nxtFlat.hp * (1 + effBonus)) + hpPot) | 0;
    const nxtMp = (Math.ceil(nxtFlat.mp * (1 + effBonus)) + mpPot) | 0;

    const gainHp = Math.max(0, nxtHp - curHp);
    const gainMp = Math.max(0, nxtMp - curMp);

    const pctLv = max > 0 ? Math.max(0, Math.min(100, Math.round(lv / max * 100))) : 0;

    const upCost = recoverySystem.upgradeCost;
    const canUpgrade = !isMax && canAffordSafe(upCost);

    container.innerHTML = `
      <div style="background:#0b1220; border:1px solid #1f2937; border-radius:12px; padding:12px">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px">
          <div style="font-weight:800; color:#10b981; letter-spacing:0.2px">💖 恢復系統</div>
          <div style="margin-left:auto; font-size:12px; color:#cbd5e1; white-space:nowrap;">
            等級 <b style="color:#fff">${lv}</b> / <b style="color:#fff">${max}</b>
            ${isMax ? `<span style="margin-left:6px; padding:2px 8px; border-radius:999px; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.35); color:#34d399;">已滿級</span>` : ``}
          </div>
        </div>

        <div style="height:8px; border-radius:999px; background:#0f172a; border:1px solid #1f2937; overflow:hidden; margin-bottom:10px">
          <div style="height:100%; width:${pctLv}%; background:linear-gradient(90deg, rgba(16,185,129,0.25), rgba(59,130,246,0.25));"></div>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px">
          <div style="display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:999px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); font-size:12px; color:#e2e8f0;">
            <span style="color:#10b981; font-weight:700">HP</span> +${fmt(curHp)} / 10s
          </div>
          <div style="display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:999px; background:rgba(59,130,246,0.08); border:1px solid rgba(59,130,246,0.25); font-size:12px; color:#e2e8f0;">
            <span style="color:#3b82f6; font-weight:700">MP</span> +${fmt(curMp)} / 10s
          </div>
          <div style="display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:999px; background:rgba(148,163,184,0.08); border:1px solid rgba(148,163,184,0.22); font-size:12px; color:#e2e8f0;">
            權重 <b style="color:#fff">+${pct(effBonus)}</b>
          </div>
          <div style="display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:999px; background:rgba(148,163,184,0.08); border:1px solid rgba(148,163,184,0.22); font-size:12px; color:#e2e8f0;">
            圖鑑加成 <span style="color:#10b981">HP +${recoverySystem.hpPotRegenPercent.toFixed(1)}%</span> <span style="color:#3b82f6">MP +${recoverySystem.mpPotRegenPercent.toFixed(1)}%</span>
          </div>
        </div>

        <details ${recoverySystem?.uiOpen ? 'open' : ''} id="rcv-adv">
          <summary style="cursor:pointer; list-style:none; user-select:none; color:#cbd5e1; font-weight:700; padding:8px 0;">
            進階資訊
            <span style="color:#64748b; font-weight:600">（細節 / 下一級預覽）</span>
          </summary>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px; line-height:1.65; color:#e2e8f0; padding-top:6px">
            <div style="grid-column: span 2; height:1px; background:#1f2937; margin:2px 0 6px;"></div>

            <div>目前平坦回復：<b style="color:#10b981">HP +${fmt(curFlat.hp)}</b> / 10s</div>
            <div>目前平坦回復：<b style="color:#3b82f6">MP +${fmt(curFlat.mp)}</b> / 10s</div>

            <div>圖鑑追加（依最大HP）：<b style="color:#10b981">+${fmt(hpPot)}</b></div>
            <div>圖鑑追加（依最大MP）：<b style="color:#3b82f6">+${fmt(mpPot)}</b></div>

            <div style="grid-column: span 2; height:1px; background:#1f2937; margin:2px 0 6px;"></div>

            <div style="color:#fff">下一級預估 HP：<b style="color:#10b981">+${fmt(nxtHp)}</b> <span style="color:#64748b">${isMax ? '' : `( +${fmt(gainHp)} )`}</span></div>
            <div style="color:#fff">下一級預估 MP：<b style="color:#3b82f6">+${fmt(nxtMp)}</b> <span style="color:#64748b">${isMax ? '' : `( +${fmt(gainMp)} )`}</span></div>

            <div style="grid-column: span 2; color:#94a3b8">
              備註：下一級預估以「目前權重 / 圖鑑加成 / 最大HP/MP」計算（不含你之後可能再變動的屬性）。
            </div>
          </div>
        </details>

        <div style="margin-top:12px; display:flex; gap:10px; align-items:center">
          <div style="font-size:12px; color:#e2e8f0">
            升級花費：
            <b style="color:#fbbf24">${fmt(upCost)}</b>
            ${isMax ? `<span style="margin-left:8px; color:#34d399">已達等級上限</span>` : `<span style="margin-left:8px; color:#94a3b8">預估提升：HP +${fmt(gainHp)} / MP +${fmt(gainMp)}</span>`}
          </div>

          <button id="rcvUpgradeBtn"
            style="
              margin-left:auto;
              border:none;
              border-radius:12px;
              padding:8px 14px;
              cursor:${isMax ? 'not-allowed' : 'pointer'};
              font-weight:800;
              color:#0b1220;
              background:${isMax ? 'rgba(148,163,184,0.35)' : (canUpgrade ? '#fb923c' : 'rgba(251,146,60,0.35)')};
              box-shadow:0 8px 18px rgba(0,0,0,0.25);
              transition:transform 0.08s ease;
            "
            ${isMax ? 'disabled' : ''}
          >升級</button>
        </div>
      </div>`;

    const adv = container.querySelector('#rcv-adv');
    if (adv) {
      adv.addEventListener('toggle', () => {
        if (recoverySystem) {
          recoverySystem.uiOpen = adv.open;
          persistRecoveryToStore();
        }
      }, { passive: true });
    }

    const btn = container.querySelector('#rcvUpgradeBtn');
    if (btn) btn.onclick = () => upgradeRecovery();
  }

if (window.GrowthHub?.registerTab) {
    window.GrowthHub.registerTab({ id: 'recovery', title: '恢復系統', render: render });
  }
})();
