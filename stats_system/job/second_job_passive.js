// job_passives_hub.js — 職業被動 2（2轉職業專屬 + 3/4/5 轉全職共通）
//
// 依賴：
//   - window.SaveHub（jobPassives namespace）
//   - window.jobs（職業表）
//   - window.player（含 job / coreBonus / PotentialBonus）
//   - window.SkillsHub（技能 Hub 分頁）
//   - window.getItemQuantity / window.removeItem（inventory.js）
//
// 說明：
//   1) 二轉：每條職業線一顆專屬被動，上限 20，吃 coreBonus → 轉成平坦加成
//   2) 三轉：全職共通 4 顆（怪物傷、經驗金幣、恢復力、減傷-盾騎加倍），上限 30
//   3) 四轉：女神祝福，上限 30（全屬 / 穿透 / 總傷）→ ignoreDefPct
//   4) 五轉：全職共通 3 顆（怪物傷、經驗金幣、女神祝福-終極），上限 30
//      └ 女神祝福-終極也提供一個 ignoreDefPct（最多 15%），和四轉那顆一樣走 ignoreDefPct，
//         只是存在不同 bonusData 節點，最終合併交給 player 端處理。
//   5) 升級全部消耗「被動能力券」
//   6) 所有加成都寫入 player.PotentialBonus.bonusData.*

(function (w) {
  "use strict";
  if (!w.SaveHub) {
    console.warn("[JobPassives] SaveHub 不存在，本模組將不啟用。");
    return;
  }

  const SH   = w.SaveHub;
  const jobs = w.jobs || {};
  const NS   = "jobPassives";
  const TICKET_ITEM_KEY = "被動能力券";

  // =======================
  // 1. 被動設定
  // =======================
  const JOB_PASSIVE_CONFIG = {
    // === 二轉：職業專屬被動（上限 20） ===

    // 戰士 → 狂戰士線
    warrior_berserker2: {
      maxLevel: 20,
      effectsAtMax: {
        atkPct: 0.20,
        defPct: 0.10,
        hpPct: 0.10
      }
    },
    // 戰士 → 盾騎士線
    warrior_guardian2: {
      maxLevel: 20,
      effectsAtMax: {
        atkPct: 0.10,
        defPct: 0.20,
        hpPct: 0.20
      }
    },

    // 弓箭手 → 兩條二轉相同
    archer_marksman2: {
      maxLevel: 20,
      effectsAtMax: {
        atkPct: 0.15,
        defPct: 0.10,
        hpPct: 0.10,
        attackSpeedPct: 0.60
      }
    },
    archer_elf2: {
      maxLevel: 20,
      effectsAtMax: {
        atkPct: 0.15,
        defPct: 0.10,
        hpPct: 0.10,
        attackSpeedPct: 0.60
      }
    },

    // 盜賊 → 兩條二轉相同
    thief_assassin2: {
      maxLevel: 20,
      effectsAtMax: {
        atkPct: 0.15,
        defPct: 0.10,
        hpPct: 0.10,
        critMultiplierPct: 0.30
      }
    },
    thief_shadow2: {
      maxLevel: 20,
      effectsAtMax: {
        atkPct: 0.15,
        defPct: 0.10,
        hpPct: 0.10,
        critMultiplierPct: 0.30
      }
    },

    // 牧師線
    mage_priest2: {
      maxLevel: 20,
      effectsAtMax: {
        atkPct: 0.10,
        defPct: 0.10,
        hpPct: 0.20,
        mpPct: 0.20
      }
    },

    // 元素師線
    mage_elementalist2: {
      maxLevel: 20,
      effectsAtMax: {
        atkPct: 0.20,
        defPct: 0.10,
        hpPct: 0.10,
        mpPct: 0.15
      }
    },

    // === 四轉共通：女神祝福（上限 30） ===
    // 全屬性 1% × 等級
    // 穿透   1% × 等級（ignoreDefPct）
    // 總傷害 1% × 等級
    goddessBlessing: {
      maxLevel: 30,
      effectsAtMax: {
        allStatPct:     0.30,
        ignoreDefPct:   0.30,
        totalDamagePct: 0.30
      }
    },

    // === 三轉共通被動（上限 30，全職業） ===

    // 1) Boss / 菁英 / 一般怪物傷害 +1% × 等級
    third_monsterDamage: {
      maxLevel: 30,
      effectsAtMax: {
        normalDamage: 0.30,
        eliteDamage:  0.30,
        bossDamage:   0.30
      }
    },

    // 2) 經驗值 / 金幣掉落 +1.5% × 等級
    third_reward: {
      maxLevel: 30,
      effectsAtMax: {
        expBonus:  0.45,
        goldBonus: 0.45
      }
    },

    // 3) 恢復力 +1.5% × 等級
    third_recover: {
      maxLevel: 30,
      effectsAtMax: {
        recoverPercent: 0.45
      }
    },

    // 4) 特殊減傷：
    //   盾騎士路線：1% × 等級 → 30% = 0.30
    //   其他職業：  0.5% × 等級 → 15% = 0.15
    third_guardianShield: {
      maxLevel: 30,
      effectsAtMax: {
        damageReduceTankMax:  0.30, // 盾騎線
        damageReduceOtherMax: 0.15  // 非盾騎線
      }
    },

    // === 五轉共通被動（上限 30，全職業） ===

    // 1) Boss / 菁英 / 一般怪物傷害 +1% × 等級
    fifth_monsterDamage: {
      maxLevel: 30,
      effectsAtMax: {
        normalDamage: 0.30,
        eliteDamage:  0.30,
        bossDamage:   0.30
      }
    },

    // 2) 經驗值 / 金幣掉落 +1.5% × 等級
    fifth_reward: {
      maxLevel: 30,
      effectsAtMax: {
        expBonus:  0.45,
        goldBonus: 0.45
      }
    },

    // 3) 女神祝福 - 終極（上限 30）
    //    全屬性 0.5% × 等級
    //    攻擊力 0.5% × 等級
    //    HP    0.5% × 等級
    //    穿透  0.5% × 等級（ignoreDefPct；和四轉那顆分開一筆來源，最後由 player 合併）
    //    攻速  1%   × 等級
    //    爆傷  0.5% × 等級
    goddessBlessingUltimate: {
      maxLevel: 30,
      effectsAtMax: {
        allStatPct:     0.15,
        atkPct:         0.15,
        hpPct:          0.15,
        ignoreDefPct:   0.15,
        attackSpeedPct: 0.30,
        critMultiplierPct: 0.15
      }
    }
  };

  // 只有二轉職業被動需要對應 jobs 表
  const JOB_NAME_TO_KEY = {};
  (function buildNameIndex() {
    for (const key in JOB_PASSIVE_CONFIG) {
      if (!JOB_PASSIVE_CONFIG.hasOwnProperty(key)) continue;
      if (key === "goddessBlessing" ||
          key.indexOf("third_") === 0 ||
          key.indexOf("fifth_") === 0 ||
          key === "goddessBlessingUltimate") {
        continue;
      }
      const jobDef  = jobs[key];
      const jobName = jobDef && jobDef.name ? jobDef.name : key;
      JOB_PASSIVE_CONFIG[key].jobName     = jobName;
      JOB_PASSIVE_CONFIG[key].passiveName = jobName + "專屬被動";
      JOB_NAME_TO_KEY[jobName] = key;
    }

    if (JOB_PASSIVE_CONFIG.goddessBlessing) {
      JOB_PASSIVE_CONFIG.goddessBlessing.jobName     = "全職業";
      JOB_PASSIVE_CONFIG.goddessBlessing.passiveName = "女神祝福";
    }
    if (JOB_PASSIVE_CONFIG.goddessBlessingUltimate) {
      JOB_PASSIVE_CONFIG.goddessBlessingUltimate.jobName     = "全職業";
      JOB_PASSIVE_CONFIG.goddessBlessingUltimate.passiveName = "女神祝福 - 終極";
    }
  })();

  // =======================
  // 2. SaveHub：只存等級 points
  // =======================
  SH.registerNamespaces({
    jobPassives: {
      version: 1,
      migrate (old) {
        old = old || {};
        const pts = old.points || old;
        const out = { points: {} };
        if (pts && typeof pts === "object") {
          for (const k in pts) {
            if (!pts.hasOwnProperty(k)) continue;
            const n = pts[k] | 0;
            if (n > 0) out.points[k] = n;
          }
        }
        return out;
      }
    }
  });

  function getState() {
    return SH.getOrInit(NS, { _ver: 1, points: {} });
  }
  function saveState(st) {
    SH.set(NS, st, { replace: true });
  }

  // =======================
  // 3. 職業工具：jobKey / 職階 / 二轉被動 key
  // =======================
  function resolveJobKey(player) {
    if (!player) return null;
    const key = (player.jobKey || player.job || "").toString().toLowerCase();
    return key || null;
  }

  // 職階：往 parent 一路往上數
  function getJobRank(jobKey) {
    let key = (jobKey || "").toLowerCase();
    if (!key) return 0;
    let rank = 0;
    const seen = {};
    while (key && !seen[key]) {
      seen[key] = true;
      rank++;
      const def = jobs[key];
      if (!def || !def.parent) break;
      key = def.parent.toLowerCase();
    }
    return rank;
  }

  function isThirdAvailable(jobKey)  { return getJobRank(jobKey) >= 3; }
  function isFourthAvailable(jobKey) { return getJobRank(jobKey) >= 4; }
  function isFifthAvailable(jobKey)  { return getJobRank(jobKey) >= 5; }

  function getPassiveKeyForJob(jobKey) {
    let key = (jobKey || "").toLowerCase();
    if (!key) return null;
    const seen = {};
    while (key && !seen[key]) {
      seen[key] = true;
      if (JOB_PASSIVE_CONFIG[key] &&
          key !== "goddessBlessing" &&
          key.indexOf("third_") !== 0 &&
          key.indexOf("fifth_") !== 0 &&
          key !== "goddessBlessingUltimate") {
        return key; // 二轉職業被動
      }
      const def = jobs[key];
      if (!def || !def.parent) break;
      key = def.parent.toLowerCase();
    }
    return null;
  }

  // 盾騎士線判定：warrior_guardian2~6
  function isGuardianLine(jobKey) {
    let key = (jobKey || "").toLowerCase();
    const seen = {};
    while (key && !seen[key]) {
      seen[key] = true;
      if (key.indexOf("warrior_guardian") === 0) return true;
      const def = jobs[key];
      if (!def || !def.parent) break;
      key = def.parent.toLowerCase();
    }
    return false;
  }

  // =======================
  // 4. 等級 / 券 操作
  // =======================
  function getLevel(key) {
    const st = getState();
    return st.points[key] || 0;
  }

  function setLevel(key, level) {
    const cfg = JOB_PASSIVE_CONFIG[key];
    if (!cfg) return;
    const st  = getState();
    const max = cfg.maxLevel || 1;
    let lv  = level | 0;
    if (lv < 0) lv = 0;
    if (lv > max) lv = max;
    st.points[key] = lv;
    saveState(st);
  }

  function getTickets() {
    if (typeof w.getItemQuantity !== "function") return 0;
    return w.getItemQuantity(TICKET_ITEM_KEY) | 0;
  }

  function levelUpWithTicket(key, options) {
    options = options || {};
    const showMsg = options.showMessage !== false;

    const cfg = JOB_PASSIVE_CONFIG[key];
    if (!cfg) {
      if (showMsg) alert("被動技能設定錯誤，找不到：" + key);
      return false;
    }

    const cur = getLevel(key);
    const max = cfg.maxLevel || 1;
    if (cur >= max) {
      if (showMsg) alert("此被動技能已達最大等級。");
      return false;
    }

    if (typeof w.getItemQuantity !== "function" ||
        typeof w.removeItem !== "function") {
      if (showMsg) alert("背包系統尚未載入，無法消耗「" + TICKET_ITEM_KEY + "」。");
      return false;
    }

    const have = w.getItemQuantity(TICKET_ITEM_KEY) | 0;
    if (have <= 0) {
      if (showMsg) alert("沒有足夠的「" + TICKET_ITEM_KEY + "」。");
      return false;
    }

    w.removeItem(TICKET_ITEM_KEY, 1);
    setLevel(key, cur + 1);
    return true;
  }

  // =======================
  // 5. 加成計算：coreBonus → PotentialBonus
  // =======================
  function buildBonusForPassiveKey(key, coreBonus, jobKey) {
    const cfg = JOB_PASSIVE_CONFIG[key];
    if (!cfg) return null;

    const level = getLevel(key);
    if (!level) return null;

    const max   = cfg.maxLevel || 1;
    const ratio = level / max;
    const eff   = cfg.effectsAtMax || {};
    const src   = {};
    coreBonus = coreBonus || {};

    // 百分比吃 coreBonus → 平坦（atk/def/hp/mp）
    if (eff.atkPct) src.atk = (coreBonus.atk || 0) * eff.atkPct * ratio;
    if (eff.defPct) src.def = (coreBonus.def || 0) * eff.defPct * ratio;
    if (eff.hpPct)  src.hp  = (coreBonus.hp  || 0) * eff.hpPct  * ratio;
    if (eff.mpPct)  src.mp  = (coreBonus.mp  || 0) * eff.mpPct  * ratio;

    // 全屬性 → 四維
    if (eff.allStatPct) {
      const p = eff.allStatPct * ratio;
      src.str = (coreBonus.str || 0) * p;
      src.agi = (coreBonus.agi || 0) * p;
      src.int = (coreBonus.int || 0) * p;
      src.luk = (coreBonus.luk || 0) * p;
    }

    // 百分比型，不乘 coreBonus
    if (eff.attackSpeedPct)    src.attackSpeedPct  = eff.attackSpeedPct * ratio;
    if (eff.critMultiplierPct) src.critMultiplier  = eff.critMultiplierPct * ratio;
    if (eff.totalDamagePct)    src.totalDamage     = eff.totalDamagePct * ratio;
    if (eff.ignoreDefPct)      src.ignoreDefPct    = eff.ignoreDefPct * ratio;

    // 怪物傷害
    if (eff.normalDamage) src.normalDamage = eff.normalDamage * ratio;
    if (eff.eliteDamage)  src.eliteDamage  = eff.eliteDamage  * ratio;
    if (eff.bossDamage)   src.bossDamage   = eff.bossDamage   * ratio;

    // 經驗 / 金幣
    if (eff.expBonus)  src.expBonus  = eff.expBonus  * ratio;
    if (eff.goldBonus) src.goldBonus = eff.goldBonus * ratio;

    // 恢復
    if (eff.recoverPercent) src.recoverPercent = eff.recoverPercent * ratio;

    // 特殊減傷：三轉 guardianShield
    if (key === "third_guardianShield") {
      const isTank = isGuardianLine(jobKey);
      const maxTank  = eff.damageReduceTankMax  || 0;
      const maxOther = eff.damageReduceOtherMax || 0;
      const maxVal   = isTank ? maxTank : maxOther;
      if (maxVal > 0) src.damageReduce = maxVal * ratio;
    }

    return src;
  }

  function applyToPotentialByJobKey(jobKey, coreBonus, PotentialBonus) {
    if (!PotentialBonus || !PotentialBonus.bonusData) return;

    const rank = getJobRank(jobKey);
    const bd   = PotentialBonus.bonusData;

    // 清舊資料
    bd.jobPassive              = {};
    bd.goddessBlessing         = {};
    bd.third_monsterDamage     = {};
    bd.third_reward            = {};
    bd.third_recover           = {};
    bd.third_guardianShield    = {};
    bd.fifth_monsterDamage     = {};
    bd.fifth_reward            = {};
    bd.goddessBlessingUltimate = {};

    // 二轉職業被動
    const passiveKey = getPassiveKeyForJob(jobKey);
    if (passiveKey) {
      bd.jobPassive = buildBonusForPassiveKey(passiveKey, coreBonus, jobKey) || {};
    }

    // 三轉共通
    if (rank >= 3) {
      bd.third_monsterDamage  = buildBonusForPassiveKey("third_monsterDamage",  coreBonus, jobKey) || {};
      bd.third_reward         = buildBonusForPassiveKey("third_reward",         coreBonus, jobKey) || {};
      bd.third_recover        = buildBonusForPassiveKey("third_recover",        coreBonus, jobKey) || {};
      bd.third_guardianShield = buildBonusForPassiveKey("third_guardianShield", coreBonus, jobKey) || {};
    }

    // 四轉 女神祝福
    if (rank >= 4) {
      bd.goddessBlessing = buildBonusForPassiveKey("goddessBlessing", coreBonus, jobKey) || {};
    }

    // 五轉共通 + 女神祝福-終極
    if (rank >= 5) {
      bd.fifth_monsterDamage      = buildBonusForPassiveKey("fifth_monsterDamage",     coreBonus, jobKey) || {};
      bd.fifth_reward             = buildBonusForPassiveKey("fifth_reward",           coreBonus, jobKey)  || {};
      bd.goddessBlessingUltimate  = buildBonusForPassiveKey("goddessBlessingUltimate",coreBonus, jobKey)  || {};
    }
  }

  function applyForCurrentPlayer() {
    const player = w.player || w.Player;
    if (!player) return;
    const jobKey = resolveJobKey(player) || "";
    applyToPotentialByJobKey(jobKey, player.coreBonus, player.PotentialBonus);
  }

  // =======================
  // 6. 對外 API
  // =======================
  const JobPassives = {
    CONFIG: JOB_PASSIVE_CONFIG,
    NAME_TO_KEY: JOB_NAME_TO_KEY,

    resolveJobKey,
    getPassiveKeyForJob,
    getJobRank,
    isThirdAvailable,
    isFourthAvailable,
    isFifthAvailable,

    getLevel,
    setLevel,
    getTickets,
    levelUpWithTicket,

    buildBonusForPassiveKey,
    applyToPotentialByJobKey,
    applyForCurrentPlayer
  };

  w.JobPassives = JobPassives;

  // =======================
  // 7. UI：把加成變成「目前提升」
  // =======================
  function describeBonus(bonus) {
    if (!bonus) return "<li>尚未產生任何效果。</li>";

    function has(x){ return typeof x === "number" && Math.abs(x) > 1e-8; }
    function fp(x){ return Math.round(x); }
    function pp(x){ return (x * 100).toFixed(1) + "%"; }

    let html = "";

    if (has(bonus.atk)) html += "<li>攻擊力 +" + fp(bonus.atk) + "</li>";
    if (has(bonus.def)) html += "<li>防禦力 +" + fp(bonus.def) + "</li>";
    if (has(bonus.hp))  html += "<li>HP +"    + fp(bonus.hp)  + "</li>";
    if (has(bonus.mp))  html += "<li>MP +"    + fp(bonus.mp)  + "</li>";

    if (has(bonus.str)) html += "<li>力量 +"   + fp(bonus.str) + "</li>";
    if (has(bonus.agi)) html += "<li>敏捷 +"   + fp(bonus.agi) + "</li>";
    if (has(bonus.int)) html += "<li>智力 +"   + fp(bonus.int) + "</li>";
    if (has(bonus.luk)) html += "<li>幸運 +"   + fp(bonus.luk) + "</li>";

    if (has(bonus.normalDamage)) html += "<li>一般怪物傷害 +" + pp(bonus.normalDamage) + "</li>";
    if (has(bonus.eliteDamage))  html += "<li>菁英怪物傷害 +" + pp(bonus.eliteDamage)  + "</li>";
    if (has(bonus.bossDamage))   html += "<li>Boss 傷害 +"    + pp(bonus.bossDamage)   + "</li>";

    if (has(bonus.expBonus))  html += "<li>經驗值 +" + pp(bonus.expBonus) + "</li>";
    if (has(bonus.goldBonus)) html += "<li>金幣掉落 +" + pp(bonus.goldBonus) + "</li>";

    if (has(bonus.recoverPercent)) html += "<li>恢復效果 +" + pp(bonus.recoverPercent) + "</li>";
    if (has(bonus.damageReduce))   html += "<li>傷害減免 +" + pp(bonus.damageReduce)   + "</li>";

    if (has(bonus.attackSpeedPct)) html += "<li>攻擊速度 +"   + pp(bonus.attackSpeedPct) + "</li>";
    if (has(bonus.critMultiplier)) html += "<li>爆擊傷害 +"   + pp(bonus.critMultiplier) + "</li>";
    if (has(bonus.totalDamage))    html += "<li>總傷害 +"     + pp(bonus.totalDamage)    + "</li>";
    if (has(bonus.ignoreDefPct))   html += "<li>穿透 +"       + pp(bonus.ignoreDefPct)   + "</li>";

    if (!html) html = "<li>目前等級尚未帶來可見效果。</li>";
    return html;
  }

  // =======================
  // 8. SkillsHub 分頁：「2」
  // =======================
  function registerSkillsHubTab() {
    if (!w.SkillsHub) return;

    w.SkillsHub.registerTab({
      id: "jobPassive2",
      title: "職業被動2",
      onOpen () {
        JobPassives.applyForCurrentPlayer();
      },
      render (container) {
        const player  = w.player || w.Player || {};
        const jobKey  = resolveJobKey(player) || "";
        const coreBon = player.coreBonus || {};
        const tickets = JobPassives.getTickets();
        const rank    = getJobRank(jobKey);

        container.innerHTML = "";

        function makeCard(btnId, title, lv, max, bonus, extraDesc) {
          const disabled = (lv >= max) || (tickets <= 0);

          let html = '<div style="margin-bottom:8px;padding:8px;border-radius:8px;background:#020617;border:1px solid #1f2937;">';
          html += '<div style="font-size:15px;font-weight:700;margin-bottom:4px;">' + title + '</div>';
          html += '<div style="margin-bottom:2px;">等級：' + lv + ' / ' + max + '</div>';
          html += '<div style="margin-bottom:4px;">持有「' + TICKET_ITEM_KEY + '」：' + tickets + ' 張</div>';
          if (extraDesc) {
            html += '<div style="margin-bottom:4px;font-size:11px;color:#9ca3af;">' + extraDesc + '</div>';
          }
          html += '<div style="margin-bottom:4px;font-weight:600;">⭐ 目前提升：</div>';
          html += '<ul style="margin-left:18px;margin-bottom:8px;">' + describeBonus(bonus) + '</ul>';

          const btnStyle =
            "padding:4px 8px;border-radius:6px;border:0;" +
            "cursor:" + (disabled ? "not-allowed" : "pointer") + ";" +
            "background:" + (disabled ? "#4b5563" : "#1d4ed8") + ";" +
            "color:#fff;width:100%;text-align:center;";

          html += '<button id="' + btnId + '" style="' + btnStyle + '">消耗 1 張「' +
                  TICKET_ITEM_KEY + '」升級</button>';

          if (lv >= max) {
            html += '<div style="margin-top:4px;color:#22c55e;">已達最大等級。</div>';
          } else if (tickets <= 0) {
            html += '<div style="margin-top:4px;color:#f97316;">沒有足夠的「' +
                    TICKET_ITEM_KEY + '」。</div>';
          }

          html += '</div>';
          return { html, disabled };
        }

        function append(html) {
          container.insertAdjacentHTML("beforeend", html); // 不用 innerHTML +=，避免洗掉事件
        }

        // === 2轉職業被動 ===
        const passiveKey = getPassiveKeyForJob(jobKey);
        if (!passiveKey) {
          append('<div style="padding:4px 0;margin-bottom:8px;">目前職業沒有二轉職業被動。</div>');
        } else {
          const cfgJob   = JOB_PASSIVE_CONFIG[passiveKey];
          const lvJob    = getLevel(passiveKey);
          const maxJob   = cfgJob.maxLevel || 20;
          const bonusJob = buildBonusForPassiveKey(passiveKey, coreBon, jobKey) || {};
          const jobName  = cfgJob.jobName || passiveKey;
          const nameJob  = cfgJob.passiveName || (jobName + "專屬被動");

          const cardJob  = makeCard("jobPassive2Btn", nameJob, lvJob, maxJob, bonusJob);
          append(cardJob.html);

          const btnJob = document.getElementById("jobPassive2Btn");
          if (btnJob) {
            btnJob.disabled = cardJob.disabled;
            btnJob.onclick = function () {
              if (!levelUpWithTicket(passiveKey, { showMessage: true })) return;
              applyForCurrentPlayer();
              w.SkillsHub && w.SkillsHub.requestRerender();
            };
          }
        }

        // === 三轉共通 ===
        if (rank >= 3) {
          (function () {
            const key   = "third_monsterDamage";
            const cfg   = JOB_PASSIVE_CONFIG[key];
            const lv    = getLevel(key);
            const max   = cfg.maxLevel || 30;
            const bonus = buildBonusForPassiveKey(key, coreBon, jobKey) || {};
            const card  = makeCard("thirdMonsterBtn", "三轉：怪物傷害強化", lv, max, bonus);
            append(card.html);
            const btn = document.getElementById("thirdMonsterBtn");
            if (btn) {
              btn.disabled = card.disabled;
              btn.onclick = function () {
                if (!levelUpWithTicket(key, { showMessage: true })) return;
                applyForCurrentPlayer();
                w.SkillsHub && w.SkillsHub.requestRerender();
              };
            }
          })();

          (function () {
            const key   = "third_reward";
            const cfg   = JOB_PASSIVE_CONFIG[key];
            const lv    = getLevel(key);
            const max   = cfg.maxLevel || 30;
            const bonus = buildBonusForPassiveKey(key, coreBon, jobKey) || {};
            const card  = makeCard("thirdRewardBtn", "三轉：經驗與金幣加成", lv, max, bonus);
            append(card.html);
            const btn = document.getElementById("thirdRewardBtn");
            if (btn) {
              btn.disabled = card.disabled;
              btn.onclick = function () {
                if (!levelUpWithTicket(key, { showMessage: true })) return;
                applyForCurrentPlayer();
                w.SkillsHub && w.SkillsHub.requestRerender();
              };
            }
          })();

          (function () {
            const key   = "third_recover";
            const cfg   = JOB_PASSIVE_CONFIG[key];
            const lv    = getLevel(key);
            const max   = cfg.maxLevel || 30;
            const bonus = buildBonusForPassiveKey(key, coreBon, jobKey) || {};
            const card  = makeCard("thirdRecoverBtn", "三轉：恢復力強化", lv, max, bonus);
            append(card.html);
            const btn = document.getElementById("thirdRecoverBtn");
            if (btn) {
              btn.disabled = card.disabled;
              btn.onclick = function () {
                if (!levelUpWithTicket(key, { showMessage: true })) return;
                applyForCurrentPlayer();
                w.SkillsHub && w.SkillsHub.requestRerender();
              };
            }
          })();

          (function () {
            const key   = "third_guardianShield";
            const cfg   = JOB_PASSIVE_CONFIG[key];
            const lv    = getLevel(key);
            const max   = cfg.maxLevel || 30;
            const bonus = buildBonusForPassiveKey(key, coreBon, jobKey) || {};
            const extra = isGuardianLine(jobKey)
              ? "盾騎士路線：每級 1% 減傷，最多 30%。<br>其他職業：每級 0.5% 減傷，最多 15%。"
              : "（盾騎士路線可獲得雙倍減傷效果）";
            const card  = makeCard("thirdGuardianBtn", "三轉：防禦專精", lv, max, bonus, extra);
            append(card.html);
            const btn = document.getElementById("thirdGuardianBtn");
            if (btn) {
              btn.disabled = card.disabled;
              btn.onclick = function () {
                if (!levelUpWithTicket(key, { showMessage: true })) return;
                applyForCurrentPlayer();
                w.SkillsHub && w.SkillsHub.requestRerender();
              };
            }
          })();
        }

        // === 四轉：女神祝福 ===
        if (rank >= 4) {
          (function () {
            const key   = "goddessBlessing";
            const cfg   = JOB_PASSIVE_CONFIG[key];
            const lv    = getLevel(key);
            const max   = cfg.maxLevel || 30;
            const bonus = buildBonusForPassiveKey(key, coreBon, jobKey) || {};
            const card  = makeCard("goddessBlessingBtn", "四轉：女神祝福", lv, max, bonus);
            append(card.html);
            const btn = document.getElementById("goddessBlessingBtn");
            if (btn) {
              btn.disabled = card.disabled;
              btn.onclick = function () {
                if (!levelUpWithTicket(key, { showMessage: true })) return;
                applyForCurrentPlayer();
                w.SkillsHub && w.SkillsHub.requestRerender();
              };
            }
          })();
        }

        // === 五轉共通 ===
        if (rank >= 5) {
          (function () {
            const key   = "fifth_monsterDamage";
            const cfg   = JOB_PASSIVE_CONFIG[key];
            const lv    = getLevel(key);
            const max   = cfg.maxLevel || 30;
            const bonus = buildBonusForPassiveKey(key, coreBon, jobKey) || {};
            const card  = makeCard("fifthMonsterBtn", "五轉：怪物傷害強化", lv, max, bonus);
            append(card.html);
            const btn = document.getElementById("fifthMonsterBtn");
            if (btn) {
              btn.disabled = card.disabled;
              btn.onclick = function () {
                if (!levelUpWithTicket(key, { showMessage: true })) return;
                applyForCurrentPlayer();
                w.SkillsHub && w.SkillsHub.requestRerender();
              };
            }
          })();

          (function () {
            const key   = "fifth_reward";
            const cfg   = JOB_PASSIVE_CONFIG[key];
            const lv    = getLevel(key);
            const max   = cfg.maxLevel || 30;
            const bonus = buildBonusForPassiveKey(key, coreBon, jobKey) || {};
            const card  = makeCard("fifthRewardBtn", "五轉：經驗與金幣加成", lv, max, bonus);
            append(card.html);
            const btn = document.getElementById("fifthRewardBtn");
            if (btn) {
              btn.disabled = card.disabled;
              btn.onclick = function () {
                if (!levelUpWithTicket(key, { showMessage: true })) return;
                applyForCurrentPlayer();
                w.SkillsHub && w.SkillsHub.requestRerender();
              };
            }
          })();

          (function () {
            const key   = "goddessBlessingUltimate";
            const cfg   = JOB_PASSIVE_CONFIG[key];
            const lv    = getLevel(key);
            const max   = cfg.maxLevel || 30;
            const bonus = buildBonusForPassiveKey(key, coreBon, jobKey) || {};
            const extra = "全屬性 / 攻擊 / HP / 穿透 / 攻速 / 爆傷 皆依等級提升。";
            const card  = makeCard("goddessUltimateBtn", "五轉：女神祝福 - 終極", lv, max, bonus, extra);
            append(card.html);
            const btn = document.getElementById("goddessUltimateBtn");
            if (btn) {
              btn.disabled = card.disabled;
              btn.onclick = function () {
                if (!levelUpWithTicket(key, { showMessage: true })) return;
                applyForCurrentPlayer();
                w.SkillsHub && w.SkillsHub.requestRerender();
              };
            }
          })();
        }
      }
    });
  }

  if (w.SkillsHub) registerSkillsHubTab();

})(window);