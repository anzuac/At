// 📦 ui_utils.js（整合版）
// 功能：顯示 Boss 遭遇的「動畫橫幅警示帶」
// 使用：showBossEncounterUI(bossName, durationMs = 4000)

(function initBossAlertStyles() {
  if (document.getElementById('boss-alert-styles')) return;
  const css = `
  @keyframes ba-slide-in { from { transform: translate(-50%, -80%) scale(0.98); opacity: 0 } to { transform: translate(-50%, 0) scale(1); opacity: 1 } }
  @keyframes ba-fade-out   { to { opacity: 0; transform: translate(-50%, -10px) } }
  @keyframes ba-dash-move  { from { background-position: 0 0 } to { background-position: 100px 0 } }
  @keyframes ba-grid-move  { from { background-position: 0 0, 0 0 } to { background-position: 200px 0, -200px 0 } }
  @keyframes ba-pulse      { 0%,100% { filter: drop-shadow(0 0 0 rgba(255,0,0,.6)); opacity:.95 } 50% { filter: drop-shadow(0 0 10px rgba(255,0,0,1)); opacity:1 } }
  @keyframes ba-glow       { 0%,100% { box-shadow: 0 0 16px rgba(255,0,0,.65), inset 0 0 12px rgba(255,0,0,.35) }
                             50%     { box-shadow: 0 0 28px rgba(255,0,0,.9),  inset 0 0 20px rgba(255,0,0,.6) } }

  .boss-alert-wrap {
    position: fixed; left: 50%; top: 12%;
    transform: translate(-50%, 0);
    z-index: 9999; pointer-events: none;
    animation: ba-slide-in .35s ease-out forwards;
  }
  .boss-alert {
    --ba-h: 68px;
    --ba-w: min(92vw, 980px);
    width: var(--ba-w); height: var(--ba-h);
    border-radius: 14px;
    background:
      repeating-linear-gradient(90deg, rgba(255,0,0,.0) 0 20px, rgba(255,0,0,.08) 20px 40px),
      linear-gradient(90deg, rgba(255,0,0,.12), rgba(255,0,0,.22) 20%, rgba(255,0,0,.12));
    position: relative;
    overflow: hidden;
    border: 4px solid rgba(255,0,0,.85);
    animation: ba-glow 1.6s ease-in-out infinite;
    backdrop-filter: blur(1px);
  }
  .boss-alert::before, .boss-alert::after {
    content: "";
    position: absolute; left: -10px; right: -10px; height: 10px;
    background:
      repeating-linear-gradient(90deg, rgba(255,60,60,1) 0 40px, rgba(255,60,60,0) 40px 80px);
    filter: drop-shadow(0 0 6px rgba(255,0,0,.8));
    animation: ba-dash-move 1.2s linear infinite;
  }
  .boss-alert::before { top: 6px; }
  .boss-alert::after  { bottom: 6px; animation-direction: reverse; }

  .boss-alert__inner {
    position: absolute; inset: 0; display: grid;
    grid-template-columns: auto 1fr auto; align-items: center; gap: 18px;
    padding: 0 22px;
    background:
      linear-gradient(90deg, rgba(255,255,255,.06), rgba(255,255,255,0) 30%, rgba(255,255,255,.06)),
      repeating-linear-gradient(45deg, rgba(0,0,0,.25) 0 14px, rgba(255,0,0,.12) 14px 28px);
    mix-blend-mode: screen;
    animation: ba-grid-move 8s linear infinite;
  }

  .ba-icon {
    width: 38px; height: 38px; display: grid; place-items: center;
    border: 2px solid rgba(255,130,130,1);
    border-radius: 8px;
    box-shadow: inset 0 0 6px rgba(255,0,0,.7);
    animation: ba-pulse 1.1s ease-in-out infinite;
  }
  .ba-icon svg { width: 22px; height: 22px; stroke: #fff; }

  .ba-texts { text-align: center; color: #fff; text-shadow: 0 0 8px rgba(255,0,0,.9); }
  .ba-title {
    letter-spacing: .15em; font-weight: 800;
    font-size: clamp(18px, 3.2vw, 28px);
  }
  .ba-sub {
    opacity: .85; margin-top: 2px;
    font-size: clamp(10px, 2vw, 13px);
    letter-spacing: .25em;
  }

  .boss-alert--full { width: 100vw; --ba-w: 100vw; border-radius: 0; }
  `;
  const style = document.createElement('style');
  style.id = 'boss-alert-styles';
  style.textContent = css;
  document.head.appendChild(style);
})();

function showBossAlert(title = '前方怪物來襲', subText = '危險預警  AUTHORIZED PERSONNEL ONLY', durationMs = 3000, fullWidth = true) {
  // 移除舊的（避免疊加）
  document.querySelectorAll('.boss-alert-wrap').forEach(el => el.remove());

  const wrap = document.createElement('div');
  wrap.className = 'boss-alert-wrap';

  const banner = document.createElement('div');
  banner.className = 'boss-alert' + (fullWidth ? ' boss-alert--full' : '');

  // 動態淡出延遲
  const fade = document.createElement('style');
  const id = 'ba-dyn-' + Math.random().toString(36).slice(2);
  fade.textContent = `#${id}{animation: ba-fade-out .4s ease-in forwards;animation-delay:${Math.max(0,durationMs-400)}ms}`;
  document.head.appendChild(fade);

  banner.innerHTML = `
    <div class="boss-alert__inner">
      <div class="ba-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
          <path d="M12 8v5M12 17h.01" stroke="currentColor" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor"/>
        </svg>
      </div>
      <div class="ba-texts">
        <div class="ba-title">${title}</div>
        <div class="ba-sub">${subText}</div>
      </div>
      <div class="ba-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
          <path d="M12 8v5M12 17h.01" stroke="currentColor" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor"/>
        </svg>
      </div>
    </div>
  `;

  wrap.appendChild(banner);
  document.body.appendChild(wrap);

  setTimeout(() => {
    banner.id = id;
    setTimeout(() => {
      wrap.remove();
      const dyn = document.getElementById(id);
      if (dyn) dyn.remove();
    }, 600);
  }, Math.max(0, durationMs - 400));
}

/**
 * 顯示 Boss 遭遇提示（提供給 monster_utils.js 呼叫）
 * @param {string} bossName
 * @param {number} durationMs
 */
function showBossEncounterUI(bossName, durationMs = 4000) {
  showBossAlert(
    `前方BOSS來襲：${bossName}`,
    '⚠️  危險預警  AUTHORIZED PERSONNEL ONLY  ⚠️',
    durationMs,
    true
  );
}

// 讓其他檔可呼叫（非模組環境）
window.showBossAlert = showBossAlert;
window.showBossEncounterUI = showBossEncounterUI;