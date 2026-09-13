/* ==========================================================================
   LIFE RPG // REAL-LIFE HABIT ENGINE & CLIENT-SERVER SYNC CONTROLLER
   Integrates with SQLite Backend implementing the 8-Step Anti-Cheat Pipeline:
     1. Is the user authenticated?
     2. Does Quest #ID belong to this user?
     3. Has today's quest already been completed?
     4. Is completion allowed?
     5. Calculate XP on SERVER
     6. Update user stats in Database
     7. Create immutable completion history
     8. Update inventory/rewards
   ========================================================================== */

// --- 1. SOUND SYNTHESIZER (WEB AUDIO API) ---
class SoundEffects {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  playTone(freq, type = "sine", duration = 0.15, gainVal = 0.12) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("AudioContext error", e);
    }
  }

  playClick() { 
    this.playTone(850, "sine", 0.05, 0.08); 
  }

  playStatBoost() {
    if (!this.enabled) return;
    this.init();
    this.playTone(523.25, "triangle", 0.1, 0.14);
    setTimeout(() => this.playTone(659.25, "triangle", 0.12, 0.14), 60);
    setTimeout(() => this.playTone(783.99, "sine", 0.18, 0.16), 120);
  }

  playQuestComplete() {
    if (!this.enabled) return;
    this.init();
    setTimeout(() => this.playTone(587.33, "triangle", 0.16, 0.16), 0);
    setTimeout(() => this.playTone(783.99, "sine", 0.18, 0.18), 100);
    setTimeout(() => this.playTone(1046.50, "sine", 0.32, 0.2), 200);
  }

  playLevelUp() {
    if (!this.enabled) return;
    this.init();
    const chord = [440, 554.37, 659.25, 880, 1108.73];
    chord.forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, "sawtooth", 0.45, 0.12), idx * 80);
    });
  }

  playPurchase() {
    if (!this.enabled) return;
    this.init();
    this.playTone(987.77, "sine", 0.1, 0.16);
    setTimeout(() => this.playTone(1318.51, "sine", 0.25, 0.18), 70);
  }

  playUseItem() {
    if (!this.enabled) return;
    this.init();
    this.playTone(440, "sine", 0.1, 0.15);
    setTimeout(() => this.playTone(880, "triangle", 0.25, 0.18), 80);
  }

  playError() {
    if (!this.enabled) return;
    this.init();
    this.playTone(220, "sawtooth", 0.15, 0.14);
    setTimeout(() => this.playTone(185, "sawtooth", 0.2, 0.14), 100);
  }
}

const sfx = new SoundEffects();

// --- 2. FLOATING TOAST NOTIFICATION SYSTEM ---
function showToast(title, subtitle, type = "cyan") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `rpg-toast toast-${type}`;

  let iconClass = "fa-circle-info";
  if (type === "success") iconClass = "fa-circle-check";
  if (type === "gold") iconClass = "fa-award";
  if (type === "warning") iconClass = "fa-triangle-exclamation";
  if (type === "cyan") iconClass = "fa-bolt";

  toast.innerHTML = `
    <i class="fa-solid ${iconClass}"></i>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-sub">${subtitle}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3200);
}

// --- 3. CLIENT-SERVER STATE & API CLIENT ---
let authToken = localStorage.getItem("LIFE_RPG_AUTH_TOKEN") || null;

let rpgState = {
  user: {
    id: 1,
    name: "ALEX JOHNSON",
    email: "alex@productivity.life",
    job: "FITNESS & STUDY MASTERY",
    title: "CONSISTENT HABIT BUILDER",
  },
  player: {
    level: 1,
    xp: 65,
    xpNeeded: 100,
    gold: 250,
    streak: 7,
    fatigue: 18,
    unassignedPoints: 3,
    questsCompleted: 14,
  },
  attributes: {
    strength: 28,
    agility: 24,
    intelligence: 35,
    vitality: 20,
    sense: 22,
  },
  quests: [],
  inventory: [],
  history: [],
};

async function apiRequest(endpoint, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(endpoint, options);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error(`API Error on ${method} ${endpoint}:`, err);
    return { ok: false, status: 0, data: { error: "Network/Server Connection Error" } };
  }
}

async function syncWithServer() {
  const dbStatusPill = document.getElementById("db-status-pill");

  if (!authToken) {
    // Attempt demo quick-login to establish initial session
    const res = await apiRequest("/api/auth/login", "POST", { demo: true });
    if (res.ok && res.data.token) {
      authToken = res.data.token;
      localStorage.setItem("LIFE_RPG_AUTH_TOKEN", authToken);
      rpgState = res.data.data;
      if (dbStatusPill) {
        dbStatusPill.innerHTML = '<i class="fa-solid fa-circle-check text-green"></i> <span class="pill-val">SYSTEM // ONLINE</span>';
      }
    }
  } else {
    const res = await apiRequest("/api/user/me");
    if (res.ok) {
      rpgState = res.data;
      if (dbStatusPill) {
        dbStatusPill.innerHTML = '<i class="fa-solid fa-circle-check text-green"></i> <span class="pill-val">SYSTEM // ONLINE</span>';
      }
    } else {
      // Re-login with demo if token expired
      const loginRes = await apiRequest("/api/auth/login", "POST", { demo: true });
      if (loginRes.ok) {
        authToken = loginRes.data.token;
        localStorage.setItem("LIFE_RPG_AUTH_TOKEN", authToken);
        rpgState = loginRes.data.data;
      }
    }
  }

  updateHUD();
  renderQuests();
  renderShop();
  renderInventory();
  renderHistory();
}

function calculateTierRank(lvl) {
  if (lvl >= 50) return "MASTER TIER";
  if (lvl >= 35) return "DIAMOND TIER";
  if (lvl >= 20) return "PLATINUM TIER";
  if (lvl >= 10) return "GOLD TIER";
  if (lvl >= 5) return "SILVER TIER";
  return "BRONZE TIER";
}

// --- 4. 240-FRAME CHARACTER SCROLL-ANIMATION ENGINE (DUAL THEME: DARK & LIGHT) ---
const canvas = document.getElementById("rpg-canvas");
const context = canvas ? canvas.getContext("2d") : null;
const frameCount = 240;

// Dual image caches for Dark (Stealth Armor) & Light (Luminous Techwear) modes
const darkImages = new Array(frameCount);
const lightImages = new Array(frameCount);
const imageSeq = { frame: 0 };
let lastRenderedDarkImg = null;
let lastRenderedLightImg = null;

function isLightTheme() {
  return document.body ? document.body.classList.contains("light-theme") : (localStorage.getItem("LIFE_RPG_THEME") === "light");
}

function setCanvasSize() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
setCanvasSize();

function files(index, theme) {
  const frameNumber = String(index + 1).padStart(4, "0");
  if (theme === "light") {
    // Light-themed character frames with luminous pearl-white gear
    return `./frame_${frameNumber}%20copy.png`;
  }
  // Dark stealth assassin armor frames
  return `./frame_${frameNumber}.png`;
}

function render() {
  if (!context || !canvas) return;
  const isLight = isLightTheme();
  const currentArray = isLight ? lightImages : darkImages;
  let img = currentArray[imageSeq.frame];

  if (!img || !img.complete || img.naturalWidth === 0) {
    img = (isLight ? lastRenderedLightImg : lastRenderedDarkImg) || currentArray[0];
  }

  // Fallback to opposite theme frame if active theme frame hasn't loaded yet
  if (!img || !img.complete || img.naturalWidth === 0) {
    const fallbackArray = isLight ? darkImages : lightImages;
    img = fallbackArray[imageSeq.frame] || fallbackArray[0];
  }

  if (img && img.complete && img.naturalWidth > 0) {
    scaleImage(img, context);
    if (isLight) {
      lastRenderedLightImg = img;
    } else {
      lastRenderedDarkImg = img;
    }
  }
}

// --- HIGH-PERFORMANCE DUAL-THEME FRAME STREAMER ---
function loadSingleFrame(index, theme, callback) {
  if (index < 0 || index >= frameCount) return;
  const currentTheme = theme || (isLightTheme() ? "light" : "dark");
  const targetArray = currentTheme === "light" ? lightImages : darkImages;

  if (!targetArray[index]) {
    const frameImg = new Image();
    frameImg.onload = () => {
      targetArray[index] = frameImg;
      if (callback) callback(frameImg);
      // If user is currently looking at this frame and theme, re-render immediately
      if (index === imageSeq.frame && ((currentTheme === "light") === isLightTheme())) {
        render();
      }
    };
    frameImg.src = files(index, currentTheme);
    targetArray[index] = frameImg;
  } else if (targetArray[index].complete && callback) {
    callback(targetArray[index]);
  }
}

// Ensure the current target frame and immediate surrounding frames are available
function ensureFramesAround(targetIndex) {
  const currentTheme = isLightTheme() ? "light" : "dark";
  const altTheme = currentTheme === "light" ? "dark" : "light";
  const windowRadius = 4;
  const minIdx = Math.max(0, targetIndex - windowRadius);
  const maxIdx = Math.min(frameCount - 1, targetIndex + windowRadius);

  for (let i = minIdx; i <= maxIdx; i++) {
    loadSingleFrame(i, currentTheme);
  }
  // Preload target index in opposite theme for instant zero-lag switching
  loadSingleFrame(targetIndex, altTheme);
}

// 1. Immediately load frame 0 for both themes as top priority so initial character appears instantly
const initialTheme = isLightTheme() ? "light" : "dark";
loadSingleFrame(0, initialTheme, () => render());
loadSingleFrame(0, initialTheme === "light" ? "dark" : "light");

// 2. Preload first 8 startup frames for both themes
for (let i = 1; i < 8; i++) {
  loadSingleFrame(i, "dark");
  loadSingleFrame(i, "light");
}

// 3. Progressive idle preloader: streams remaining frames when browser is idle
function preloadRemainingFramesIdle() {
  let currentIndex = 8;
  const batchSize = 3;

  function loadNextIdleBatch() {
    if (currentIndex >= frameCount) return;

    const activeTheme = isLightTheme() ? "light" : "dark";
    const altTheme = activeTheme === "light" ? "dark" : "light";

    for (let i = currentIndex; i < Math.min(currentIndex + batchSize, frameCount); i++) {
      loadSingleFrame(i, activeTheme);
      loadSingleFrame(i, altTheme);
    }
    currentIndex += batchSize;

    if (currentIndex < frameCount) {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(loadNextIdleBatch, { timeout: 350 });
      } else {
        setTimeout(loadNextIdleBatch, 180);
      }
    }
  }

  // Delay idle preloading by 400ms so initial rendering & animations have 100% of CPU
  setTimeout(loadNextIdleBatch, 400);
}
preloadRemainingFramesIdle();

function scaleImage(img, ctx) {
  var cvs = ctx.canvas;
  var hRatio = cvs.width / img.width;
  var vRatio = cvs.height / img.height;
  var ratio = Math.max(hRatio, vRatio);
  var centerShift_x = (cvs.width - img.width * ratio) / 2;
  var centerShift_y = (cvs.height - img.height * ratio) / 2;
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  ctx.drawImage(
    img,
    0,
    0,
    img.width,
    img.height,
    centerShift_x,
    centerShift_y,
    img.width * ratio,
    img.height * ratio
  );
}

window.addEventListener("resize", () => {
  setCanvasSize();
  render();
});

let scrollTicking = false;
function updateScrollScrub() {
  const docElem = document.documentElement;
  const docBody = document.body;
  const scrollTop = window.pageYOffset || docElem.scrollTop || docBody.scrollTop || 0;
  const scrollHeight = Math.max(
    docBody.scrollHeight,
    docElem.scrollHeight,
    docBody.offsetHeight,
    docElem.offsetHeight
  );
  const maxScroll = scrollHeight - window.innerHeight;

  if (maxScroll > 0) {
    const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
    const targetFrame = Math.min(frameCount - 1, Math.floor(progress * frameCount));
    if (targetFrame !== imageSeq.frame) {
      imageSeq.frame = targetFrame;
      ensureFramesAround(targetFrame);
      render();
    }
  }
}

window.addEventListener("scroll", () => {
  if (!scrollTicking) {
    requestAnimationFrame(() => {
      updateScrollScrub();
      scrollTicking = false;
    });
    scrollTicking = true;
  }
}, { passive: true });

// --- 5. HUD UPDATES ---
function updateHUD() {
  const p = rpgState.player;
  const u = rpgState.user;
  const currentTier = calculateTierRank(p.level);
  const xpNeeded = p.xpNeeded || intXpNeeded(p.level);

  const profBtnText = document.getElementById("profile-btn-text");
  const sessionBox = document.getElementById("auth-logged-in-box");
  const sessionDivider = document.getElementById("auth-switch-divider");
  const sessionName = document.getElementById("session-username");
  const sessionEmail = document.getElementById("session-email");
  const sessionLvl = document.getElementById("session-lvl");
  const sessionXp = document.getElementById("session-xp");

  if (u && u.name) {
    if (sessionBox) sessionBox.style.display = "block";
    if (sessionDivider) sessionDivider.style.display = "block";
    if (sessionName) sessionName.textContent = u.name;
    if (sessionEmail) sessionEmail.textContent = u.email || "active@productivity.life";
    if (sessionLvl) sessionLvl.textContent = `LEVEL ${p.level}`;
    if (sessionXp) sessionXp.textContent = `${p.xp} XP`;
    if (profBtnText) profBtnText.textContent = u.name;
  } else {
    if (sessionBox) sessionBox.style.display = "none";
    if (sessionDivider) sessionDivider.style.display = "none";
    if (profBtnText) profBtnText.textContent = "LOG IN / SIGN UP";
  }

  const navRank = document.getElementById("nav-rank");
  if (navRank) navRank.textContent = currentTier;

  const navLevel = document.getElementById("nav-level");
  if (navLevel) navLevel.textContent = p.level;

  const navGold = document.getElementById("nav-gold");
  if (navGold) navGold.textContent = `${p.gold} G`;

  const navStreak = document.getElementById("nav-streak");
  if (navStreak) navStreak.textContent = `${p.streak} DAYS`;

  const heroJob = document.getElementById("hero-player-job");
  if (heroJob) heroJob.textContent = u.job;

  const heroFatigue = document.getElementById("hero-fatigue-val");
  if (heroFatigue) heroFatigue.textContent = `${p.fatigue} / 100`;

  const profName = document.getElementById("profile-name");
  if (profName) profName.textContent = `PLAYER: ${u.name}`;

  const profTitle = document.getElementById("profile-title");
  if (profTitle) profTitle.textContent = `TITLE: ${u.title}`;

  const profRankDisplay = document.getElementById("profile-rank-display");
  if (profRankDisplay) profRankDisplay.textContent = currentTier;

  const hpVal = Math.max(0, 100 - Math.floor(p.fatigue * 0.8));
  const hpText = document.getElementById("hp-text");
  if (hpText) hpText.textContent = `${hpVal} / 100`;

  const mpVal = 80 + Math.min(20, p.level * 2);
  const mpText = document.getElementById("mp-text");
  if (mpText) mpText.textContent = `${mpVal} / 100`;

  const fatigueText = document.getElementById("fatigue-text");
  if (fatigueText) fatigueText.textContent = `${p.fatigue} / 100`;

  // Update Attributes & Bars
  for (const [key, val] of Object.entries(rpgState.attributes)) {
    const valEl = document.getElementById(`attr-${key}`);
    if (valEl) valEl.textContent = val;

    const fillEl = document.getElementById(`fill-${key}`);
    if (fillEl) {
      const pct = Math.min(100, Math.round((val / (p.level * 25 + 30)) * 100));
      fillEl.style.width = `${pct}%`;
    }
  }

  const unassigned = document.getElementById("unassigned-pts");
  if (unassigned) unassigned.textContent = p.unassignedPoints;

  const hudLvl = document.getElementById("hud-level-num");
  if (hudLvl) hudLvl.textContent = p.level;

  const xpCounter = document.getElementById("xp-counter");
  if (xpCounter) xpCounter.textContent = `${p.xp} / ${xpNeeded} XP`;

  const xpFill = document.getElementById("xp-progress-bar");
  if (xpFill) {
    const xpPct = Math.min(100, Math.round((p.xp / xpNeeded) * 100));
    xpFill.style.width = `${xpPct}%`;
  }

  const streakVal = document.getElementById("prog-streak-val");
  if (streakVal) streakVal.textContent = `${p.streak} Days Streak (1.2x XP Buff)`;

  const questComp = document.getElementById("prog-quests-completed");
  if (questComp) questComp.textContent = `${p.questsCompleted} Real-World Habits Done`;

  const marketGold = document.getElementById("market-gold-display");
  if (marketGold) marketGold.textContent = `${p.gold} G`;

  const dailyQuests = rpgState.quests.filter((q) => q.daily);
  if (dailyQuests.length > 0) {
    const done = dailyQuests.filter((q) => q.completed).length;
    const pct = Math.round((done / dailyQuests.length) * 100);
    const heroDailyProg = document.getElementById("hero-daily-progress");
    if (heroDailyProg) heroDailyProg.textContent = `${pct}%`;
  }
}

function intXpNeeded(lvl) {
  return Math.floor(100 * Math.pow(1.28, lvl - 1));
}

// --- 6. HABIT DIRECTORY & 8-STEP SERVER PIPELINE ---
let currentFilter = "all";

function renderQuests() {
  const container = document.getElementById("quest-list");
  if (!container) return;

  container.innerHTML = "";

  const filtered = rpgState.quests.filter((q) => {
    if (currentFilter === "all") return true;
    if (currentFilter === "Fitness") return q.attr === "Strength" || q.attr === "Agility";
    if (currentFilter === "Study") return q.attr === "Intelligence" || q.attr === "Sense";
    if (currentFilter === "Health") return q.attr === "Vitality" || q.attr === "Sense";
    return q.attr.toLowerCase() === currentFilter.toLowerCase();
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 28px 14px; color: var(--text-muted); font-family: var(--font-orbitron); font-size: 11px;">
        <i class="fa-solid fa-clipboard-check text-cyan" style="font-size: 28px; margin-bottom: 10px; display: block;"></i>
        NO ACTIVE HABITS IN THIS CATEGORY.
        <div style="font-family: var(--font-outfit); font-size: 12px; margin-top: 6px; color: #94a3b8;">
          Add a new habit using the form on the right!
        </div>
      </div>
    `;
    return;
  }

  filtered.forEach((quest) => {
    const card = document.createElement("div");
    card.className = `quest-card ${quest.completed ? "completed" : ""}`;
    card.dataset.id = quest.id;

    card.innerHTML = `
      <div class="quest-card-top">
        <input type="checkbox" class="quest-checkbox" ${quest.completed ? "checked" : ""} title="Verify & Complete on Server">
        <div class="quest-body">
          <div class="quest-badges">
            <span class="rank-tag rank-${quest.rank}">${quest.rank.toUpperCase()}</span>
            <span class="attr-tag">+${quest.attr}</span>
            ${quest.daily ? '<span class="attr-tag text-flame"><i class="fa-solid fa-repeat"></i> Daily</span>' : ""}
          </div>
          <div class="quest-title">${escapeHtml(quest.title)}</div>
        </div>
      </div>
      <div class="quest-footer">
        <div class="quest-rewards">
          <span class="text-cyan">+${quest.xp} XP</span>
          <span class="text-gold">+${quest.gold} G</span>
        </div>
        <button class="del-quest-btn" title="Delete Habit from Database"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    `;

    const checkbox = card.querySelector(".quest-checkbox");
    checkbox.addEventListener("change", () => handleQuestCheckbox(quest, checkbox));

    const delBtn = card.querySelector(".del-quest-btn");
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteQuest(quest.id, quest.title);
    });

    container.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- EXECUTE 8-STEP SERVER-SIDE PIPELINE ---
async function handleQuestCheckbox(quest, checkboxEl) {
  if (quest.completed) {
    showToast("ALREADY COMPLETED", "Daily habits can only be verified once per day.", "warning");
    checkboxEl.checked = true;
    return;
  }

  showToast("VERIFYING ROUTINE...", "Processing progression & rewards.", "cyan");

  const res = await apiRequest("/api/quests/complete", "POST", { questId: quest.id });

  if (!res.ok) {
    checkboxEl.checked = false;
    sfx.playError();

    // Show failed pipeline terminal
    if (res.data && res.data.audit) {
      displayPipelineTerminal(res.data.audit, false);
    }
    showToast("PIPELINE GUARD REJECTED", res.data.error || "Completion rejected by server.", "warning");
    return;
  }

  // SUCCESS: Server returned updated state and 8-stage audit logs
  sfx.playQuestComplete();
  rpgState = res.data.data;
  updateHUD();
  renderQuests();
  renderInventory();
  renderHistory();

  // Display the 8-Step Pipeline Terminal with checkmarks
  displayPipelineTerminal(res.data.audit, true);

  const awarded = res.data.awarded;
  showToast(
    "HABIT COMPLETED!",
    `+${awarded.xp} XP  +${awarded.gold} Coins  +1 ${awarded.attr}`,
    "gold"
  );

  if (awarded.leveledUp) {
    sfx.playLevelUp();
    showLevelUpModal(awarded.newLevel);
  }
}

function displayPipelineTerminal(auditSteps, success = true) {
  const modal = document.getElementById("pipeline-modal");
  const container = document.getElementById("pipeline-steps-list");
  if (!modal || !container) return;

  container.innerHTML = "";

  auditSteps.forEach((step, idx) => {
    const card = document.createElement("div");
    card.className = "pipeline-step-card";
    card.style.animationDelay = `${idx * 0.08}s`;

    const isPass = step.status === "PASS";
    const statusClass = isPass ? "status-PASS" : "status-FAIL";
    const icon = isPass ? "fa-circle-check" : "fa-circle-xmark";

    card.innerHTML = `
      <div class="pipeline-step-header">
        <div class="step-num-title">
          <span class="step-num-badge">STAGE ${step.step}</span>
          <span>${step.name}</span>
        </div>
        <span class="step-status-tag ${statusClass}">
          <i class="fa-solid ${icon}"></i> ${step.status}
        </span>
      </div>
      <div class="step-details-msg">${escapeHtml(step.msg)}</div>
    `;

    container.appendChild(card);
  });

  modal.style.display = "flex";
}

async function handleDeleteQuest(questId, title) {
  sfx.playClick();
  const prevQuests = [...rpgState.quests];
  // 1. Instant optimistic removal from UI (0ms delay)
  rpgState.quests = rpgState.quests.filter((q) => q.id !== questId && q.quest_id !== questId);
  renderQuests();
  showToast("HABIT DELETED", `Removed "${title.slice(0, 24)}" from daily habits.`, "warning");

  // 2. Background database sync
  apiRequest(`/api/quests/${questId}`, "DELETE").then(res => {
    if (res.ok) {
      if (res.data && res.data.data) rpgState = res.data.data;
      else if (res.data) rpgState = res.data;
      updateHUD();
      renderQuests();
    } else {
      rpgState.quests = prevQuests;
      renderQuests();
      showToast("ERROR", res.data.error || "Failed to delete habit from server", "warning");
    }
  }).catch(err => {
    console.error("Delete sync error:", err);
  });
}

function showLevelUpModal(newLevel) {
  const modal = document.getElementById("level-up-modal");
  const levelBadge = document.getElementById("popup-new-level");
  if (levelBadge) levelBadge.textContent = `LEVEL ${newLevel}`;
  if (modal) modal.style.display = "flex";
}

// --- 7. SERVER COMPLETION AUDIT LOG ---
function renderHistory() {
  const container = document.getElementById("history-log-list");
  if (!container) return;

  container.innerHTML = "";

  if (!rpgState.history || rpgState.history.length === 0) {
    container.innerHTML = `
      <div style="font-size: 11px; color: var(--text-dim); text-align: center; padding: 16px;">
        No completed habit records yet. Check off a daily habit above!
      </div>
    `;
    return;
  }

  rpgState.history.forEach((entry) => {
    const xpVal = entry.xpAwarded || entry.xpEarned || entry.xp_earned || entry.xp || 50;
    const goldVal = entry.goldAwarded || entry.goldEarned || entry.gold_earned || entry.gold || 30;
    const row = document.createElement("div");
    row.className = "history-log-row";
    row.innerHTML = `
      <div class="hist-quest-name" title="${escapeHtml(entry.questTitle || entry.title || 'Habit Routine')}">
        <i class="fa-solid fa-check text-green" style="margin-right: 6px;"></i>${escapeHtml(entry.questTitle || entry.title || 'Habit Routine')}
      </div>
      <div class="hist-meta">
        <span class="text-cyan">+${xpVal} XP</span>
        <span class="text-gold">+${goldVal} G</span>
        <span class="text-muted" style="font-size: 10px;">${entry.completedAt ? entry.completedAt.slice(11, 16) : ""}</span>
      </div>
    `;
    container.appendChild(row);
  });
}

// --- 8. REWARDS STORE & INVENTORY ---
const SHOP_ITEMS = [
  {
    id: "shop-1",
    name: "Artisan Coffee & Pastry",
    price: 50,
    icon: "fa-mug-hot",
    type: "Perk",
    desc: "Reward yourself with a specialty café drink after crushing deep work sessions.",
  },
  {
    id: "shop-2",
    name: "1-Hour Guilt-Free Gaming Pass",
    price: 90,
    icon: "fa-gamepad",
    type: "Perk",
    desc: "Guilt-free gaming relaxation hour, earned 100% through completed real-life habits.",
  },
  {
    id: "shop-3",
    name: "Streak Protection Freeze",
    price: 120,
    icon: "fa-shield-halved",
    type: "Buff",
    desc: "Safeguard your habit streak against unexpected emergencies or rest days.",
  },
  {
    id: "shop-4",
    name: "Book / Audible Credit Voucher",
    price: 160,
    icon: "fa-book-bookmark",
    type: "Perk",
    desc: "Fund your next high-impact non-fiction book to level up intellect and mindset.",
  },
  {
    id: "shop-5",
    name: "Weekend Cinema / Movie Night",
    price: 140,
    icon: "fa-film",
    type: "Perk",
    desc: "Enjoy an evening movie or streaming marathon after completing weekly goals.",
  },
  {
    id: "shop-6",
    name: "Energy Recharge & Electrolytes",
    price: 40,
    icon: "fa-bolt",
    type: "Elixir",
    desc: "Instant mental refresher: resets your daily fatigue gauge back down to 0 / 100.",
  },
];

function renderShop() {
  const container = document.getElementById("shop-items-container");
  if (!container) return;

  container.innerHTML = "";

  SHOP_ITEMS.forEach((item) => {
    const card = document.createElement("div");
    card.className = "shop-card";
    card.innerHTML = `
      <div>
        <div class="shop-card-header">
          <div class="shop-icon"><i class="fa-solid ${item.icon}"></i></div>
          <div class="shop-item-name">${escapeHtml(item.name)}</div>
        </div>
        <div class="shop-item-desc">${escapeHtml(item.desc)}</div>
      </div>
      <div class="shop-card-bottom">
        <span class="shop-price">${item.price} G</span>
        <button class="hud-btn small-btn buy-btn" data-id="${item.id}">ACQUIRE</button>
      </div>
    `;

    const buyBtn = card.querySelector(".buy-btn");
    buyBtn.addEventListener("click", () => handlePurchaseItem(item));

    container.appendChild(card);
  });
}

async function handlePurchaseItem(item) {
  if (rpgState.player.gold < item.price) {
    sfx.playError();
    const diff = item.price - rpgState.player.gold;
    showToast("INSUFFICIENT COINS!", `You need ${diff} more coins. Complete habits to earn coins!`, "warning");
    return;
  }

  const res = await apiRequest("/api/shop/purchase", "POST", {
    itemId: item.id,
    name: item.name,
    price: item.price,
    icon: item.icon,
    desc: item.desc,
    type: item.type,
  });

  if (res.ok) {
    sfx.playPurchase();
    rpgState = res.data;
    updateHUD();
    renderInventory();
    showToast("REWARD UNLOCKED!", `"${item.name}" purchased and added to inventory!`, "gold");
  } else {
    sfx.playError();
    showToast("PURCHASE FAILED", res.data.error || "Could not complete transaction.", "warning");
  }
}

function renderInventory() {
  const container = document.getElementById("inventory-container");
  const countEl = document.getElementById("inventory-count");
  if (!container) return;

  container.innerHTML = "";
  const totalSlots = 12;

  if (countEl) {
    countEl.textContent = `${rpgState.inventory.length} / ${totalSlots} SLOTS`;
  }

  for (let i = 0; i < totalSlots; i++) {
    const slot = document.createElement("div");
    const item = rpgState.inventory[i];

    if (item) {
      slot.className = "inv-slot occupied";
      slot.title = `${item.name}: ${item.desc || ""} (Click to redeem)`;
      slot.innerHTML = `
        <i class="fa-solid ${item.icon}"></i>
        <span class="slot-name">${escapeHtml(item.name)}</span>
      `;
      slot.addEventListener("click", () => handleUseInventory(item));
    } else {
      slot.className = "inv-slot";
      slot.innerHTML = '<span style="color: var(--text-dim); font-size: 11px;">+</span>';
    }

    container.appendChild(slot);
  }
}

async function handleUseInventory(item) {
  sfx.playUseItem();
  const res = await apiRequest("/api/inventory/use", "POST", { inventoryId: item.id });
  if (res.ok) {
    rpgState = res.data.data;
    updateHUD();
    renderInventory();
    showToast("PERK REDEEMED!", res.data.message || `Redeemed ${item.name}!`, "success");
  } else {
    showToast("ERROR", res.data.error || "Failed to redeem item", "warning");
  }
}

// --- 9. STAT POINT ALLOCATION (0ms INSTANT OPTIMISTIC BOOST) ---
async function allocateStatPoint(stat) {
  if (!rpgState.player || rpgState.player.unassignedPoints <= 0) {
    sfx.playError();
    showToast(
      "NO UNASSIGNED POINTS",
      "Complete more daily habits or level up to earn stat points!",
      "warning"
    );
    return;
  }

  // 1. INSTANT OPTIMISTIC BOOST (0ms delay!)
  rpgState.player.unassignedPoints--;
  if (rpgState.attributes[stat] === undefined) rpgState.attributes[stat] = 20;
  rpgState.attributes[stat]++;

  sfx.playStatBoost();
  updateHUD();

  const statLabels = {
    strength: "Strength (Gym & Physical)",
    intelligence: "Intellect (Coding & Study)",
    vitality: "Vitality (Sleep & Health)",
    discipline: "Discipline (Habits & Routine)",
    agility: "Agility (Cardio & Steps)",
  };

  showToast(
    "STAT BOOSTED!",
    `+1 Point Allocated to ${statLabels[stat] || stat.toUpperCase()}`,
    "cyan"
  );

  // 2. Background async sync with server
  apiRequest("/api/attributes/allocate", "POST", { stat }).then((res) => {
    if (res.ok) {
      if (res.data && res.data.data) rpgState = res.data.data;
      else if (res.data) rpgState = res.data;
      updateHUD();
    } else {
      // Revert if rejected
      rpgState.player.unassignedPoints++;
      rpgState.attributes[stat]--;
      updateHUD();
      sfx.playError();
      showToast("ALLOCATION FAILED", res.data.error || "Could not allocate point", "warning");
    }
  }).catch((err) => {
    console.error("Stat allocate sync error:", err);
  });
}

// --- 10. EVENT LISTENERS & AUTH ---
function setupEventListeners() {
  // Stat '+' buttons
  const statPlusBtns = document.querySelectorAll(".stat-plus-btn");
  statPlusBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const stat = btn.dataset.stat;
      if (stat) allocateStatPoint(stat);
    });
  });

  // Auto Allocate button (0ms Instant Feedback)
  const allocBtn = document.getElementById("allocate-pts-btn");
  if (allocBtn) {
    allocBtn.addEventListener("click", () => {
      const pts = rpgState.player ? rpgState.player.unassignedPoints : 0;
      if (!pts || pts <= 0) {
        sfx.playError();
        showToast("NO UNASSIGNED POINTS", "Level up or clear habits to earn attribute points!", "warning");
        return;
      }

      // 1. Instant optimistic distribution
      const statKeys = ["strength", "intelligence", "vitality", "discipline", "agility"];
      for (let i = 0; i < pts; i++) {
        const s = statKeys[i % statKeys.length];
        rpgState.attributes[s] = (rpgState.attributes[s] || 20) + 1;
      }
      rpgState.player.unassignedPoints = 0;
      sfx.playLevelUp();
      updateHUD();
      showToast("AUTO-ALLOCATED!", `Distributed ${pts} points across all life attributes.`, "gold");

      // 2. Background server persistence
      apiRequest("/api/attributes/auto-allocate", "POST").then((res) => {
        if (res.ok) {
          if (res.data && res.data.data) rpgState = res.data.data;
          else if (res.data) rpgState = res.data;
          updateHUD();
        }
      }).catch((err) => {
        console.error("Auto allocate sync error:", err);
      });
    });
  }

  // Quick Habit Add Form (0ms INSTANT OPTIMISTIC ADDITION)
  const inlineForm = document.getElementById("inline-quest-form");
  if (inlineForm) {
    inlineForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const titleInput = document.getElementById("inline-quest-title");
      const attrInput = document.getElementById("inline-quest-attr");
      const rankInput = document.getElementById("inline-quest-rank");
      const dailyInput = document.getElementById("inline-quest-daily");

      const title = titleInput.value.trim();
      if (!title) return;

      const attrVal = attrInput.value;
      const rankVal = rankInput.value;
      const isDaily = dailyInput.checked;

      // 1. INSTANT OPTIMISTIC CREATION (0ms delay!)
      const tempId = "QST-" + Math.floor(100 + Math.random() * 900);
      const xpReward = rankVal === "Hard" ? 80 : rankVal === "Medium" ? 50 : 30;
      const goldReward = rankVal === "Hard" ? 50 : rankVal === "Medium" ? 30 : 15;

      const optimisticQuest = {
        id: tempId,
        quest_id: tempId,
        title: title,
        description: "Daily routine habit objective.",
        attr: attrVal.charAt(0).toUpperCase() + attrVal.slice(1),
        difficulty: rankVal,
        rank: rankVal,
        xp: xpReward,
        gold: goldReward,
        daily: isDaily,
        completed: false,
      };

      if (!rpgState.quests) rpgState.quests = [];
      rpgState.quests.unshift(optimisticQuest);
      titleInput.value = "";
      sfx.playTone(660, "sine", 0.15, 0.2);
      renderQuests();
      showToast("HABIT ADDED!", `"${title.slice(0, 30)}" active in daily protocol.`, "success");

      // 2. Background database persistence
      apiRequest("/api/quests", "POST", {
        title,
        attr: attrVal,
        rank: rankVal,
        daily: isDaily,
      }).then((res) => {
        if (res.ok) {
          if (res.data && res.data.data) rpgState = res.data.data;
          else if (res.data) rpgState = res.data;
          updateHUD();
          renderQuests();
        } else {
          rpgState.quests = rpgState.quests.filter((q) => q.id !== tempId);
          renderQuests();
          sfx.playError();
          showToast("ERROR", res.data.error || "Failed to save habit", "warning");
        }
      }).catch((err) => {
        console.error("Habit save sync error:", err);
      });
    });
  }

  // Filter Chips
  const chips = document.querySelectorAll(".chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      sfx.playClick();
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter;
      renderQuests();
    });
  });

  // Pipeline Modal Controls
  const closePipelineModalBtn = document.getElementById("close-pipeline-modal");
  const pipelineContinueBtn = document.getElementById("pipeline-continue-btn");
  const pipelineModal = document.getElementById("pipeline-modal");

  const closePipeline = () => {
    sfx.playClick();
    if (pipelineModal) pipelineModal.style.display = "none";
  };
  if (closePipelineModalBtn) closePipelineModalBtn.addEventListener("click", closePipeline);
  if (pipelineContinueBtn) pipelineContinueBtn.addEventListener("click", closePipeline);

  // Level Up Modal Close
  const closeLvlModalBtn = document.getElementById("close-level-modal-btn");
  const lvlModal = document.getElementById("level-up-modal");
  if (closeLvlModalBtn) {
    closeLvlModalBtn.addEventListener("click", () => {
      sfx.playClick();
      if (lvlModal) lvlModal.style.display = "none";
    });
  }

  // Audio Toggle
  const audioBtn = document.getElementById("audio-toggle-btn");
  if (audioBtn) {
    audioBtn.addEventListener("click", () => {
      sfx.enabled = !sfx.enabled;
      audioBtn.innerHTML = sfx.enabled
        ? '<i class="fa-solid fa-volume-high"></i>'
        : '<i class="fa-solid fa-volume-xmark text-crimson"></i>';
      sfx.playClick();
      showToast(
        "AUDIO FEEDBACK",
        sfx.enabled ? "Sound effects enabled." : "Sound effects muted.",
        sfx.enabled ? "cyan" : "warning"
      );
    });
  }

  // Profile Auth Modal
  const authModal = document.getElementById("auth-modal");
  const profileAuthBtn = document.getElementById("profile-auth-btn");
  const closeAuthModalBtn = document.getElementById("close-auth-modal");
  const tabLoginBtn = document.getElementById("tab-login-btn");
  const tabSignupBtn = document.getElementById("tab-signup-btn");
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const demoLoginBtn = document.getElementById("demo-login-btn");

  if (profileAuthBtn) {
    profileAuthBtn.addEventListener("click", () => {
      sfx.playClick();
      if (authModal) authModal.style.display = "flex";
    });
  }

  if (closeAuthModalBtn) {
    closeAuthModalBtn.addEventListener("click", () => {
      sfx.playClick();
      if (authModal) authModal.style.display = "none";
    });
  }

  if (tabLoginBtn && tabSignupBtn) {
    tabLoginBtn.addEventListener("click", () => {
      sfx.playClick();
      tabLoginBtn.classList.add("active");
      tabSignupBtn.classList.remove("active");
      if (loginForm) loginForm.style.display = "block";
      if (signupForm) signupForm.style.display = "none";
    });

    tabSignupBtn.addEventListener("click", () => {
      sfx.playClick();
      tabSignupBtn.classList.add("active");
      tabLoginBtn.classList.remove("active");
      if (loginForm) loginForm.style.display = "none";
      if (signupForm) signupForm.style.display = "block";
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-id").value.trim();
      const password = document.getElementById("login-password").value;

      const res = await apiRequest("/api/auth/login", "POST", { email, password });
      if (res.ok) {
        authToken = res.data.token;
        localStorage.setItem("LIFE_RPG_AUTH_TOKEN", authToken);
        rpgState = res.data.data;
        sfx.playLevelUp();
        updateHUD();
        renderQuests();
        renderShop();
        renderInventory();
        renderHistory();
        if (authModal) authModal.style.display = "none";
        showToast("LOGIN VERIFIED", `Welcome back, ${rpgState.user.name}! Character progression synced.`, "success");
      } else {
        sfx.playError();
        showToast("LOGIN FAILED", res.data.error || "Invalid credentials", "warning");
      }
    });
  }

  if (demoLoginBtn) {
    demoLoginBtn.addEventListener("click", async () => {
      const res = await apiRequest("/api/auth/login", "POST", { demo: true });
      if (res.ok) {
        authToken = res.data.token;
        localStorage.setItem("LIFE_RPG_AUTH_TOKEN", authToken);
        rpgState = res.data.data;
        sfx.playLevelUp();
        updateHUD();
        renderQuests();
        renderShop();
        renderInventory();
        renderHistory();
        if (authModal) authModal.style.display = "none";
        showToast("DEMO PROFILE LOADED", `Welcome Alex Johnson! Start tracking your daily habits.`, "success");
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("signup-name").value.trim();
      const job = document.getElementById("signup-job").value;
      const email = document.getElementById("signup-email").value.trim();
      const password = document.getElementById("signup-password").value;

      const res = await apiRequest("/api/auth/register", "POST", { name, email, password, job });
      if (res.ok) {
        authToken = res.data.token;
        localStorage.setItem("LIFE_RPG_AUTH_TOKEN", authToken);
        rpgState = res.data.data;
        sfx.playLevelUp();
        updateHUD();
        renderQuests();
        renderShop();
        renderInventory();
        renderHistory();
        if (authModal) authModal.style.display = "none";
        showToast("ACCOUNT CREATED!", `Welcome, ${name}! Your profile is ready.`, "success");
      } else {
        sfx.playError();
        showToast("SIGNUP FAILED", res.data.error || "Could not register account", "warning");
      }
    });
  }

  // Logout Button Handler
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      sfx.playTone(240, "sawtooth", 0.15, 0.15);
      authToken = null;
      localStorage.removeItem("LIFE_RPG_AUTH_TOKEN");
      rpgState.user = {
        id: null,
        name: "",
        email: "",
        job: "",
        title: "UNAUTHENTICATED",
      };
      updateHUD();
      showToast("LOGGED OUT", "Successfully signed out of your account.", "warning");

      // Switch auth modal view to Login
      if (tabLoginBtn && tabSignupBtn) {
        tabLoginBtn.classList.add("active");
        tabSignupBtn.classList.remove("active");
        if (loginForm) loginForm.style.display = "block";
        if (signupForm) signupForm.style.display = "none";
      }
    });
  }

  // Hero Quick Nav Buttons
  const heroHabitBtn = document.querySelector("#hero-today-habits-btn");
  if (heroHabitBtn) {
    heroHabitBtn.addEventListener("click", () => {
      sfx.playClick();
      const page2 = document.querySelector("#page2");
      if (page2) {
        page2.scrollIntoView({ behavior: "smooth" });
        const questBox = page2.querySelector(".quest-directory-card");
        if (questBox) {
          questBox.classList.remove("flash-highlight");
          void questBox.offsetWidth;
          questBox.classList.add("flash-highlight");
        }
      }
      showToast("HABIT DIRECTORY", "Review & check off today's habits.", "cyan");
    });
  }

  const heroAttrBtn = document.querySelector("#hero-view-attr-btn");
  if (heroAttrBtn) {
    heroAttrBtn.addEventListener("click", () => {
      sfx.playClick();
      const page1 = document.querySelector("#page1");
      if (page1) {
        page1.scrollIntoView({ behavior: "smooth" });
        const statBox = page1.querySelector(".status-window");
        if (statBox) {
          statBox.classList.remove("flash-highlight");
          void statBox.offsetWidth;
          statBox.classList.add("flash-highlight");
        }
      }
      showToast("ATTRIBUTES WINDOW", "Review stats & allocate unassigned points.", "cyan");
    });
  }

}

// Global Delegated Handler for Theme Toggle (Dark / Light Mode)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#theme-toggle-btn");
  if (btn) {
    const isCurrentlyLight = document.body.classList.contains("light-theme");
    applyTheme(isCurrentlyLight ? "dark" : "light", true);
  }
});
window.applyTheme = applyTheme;

// --- 11. THEME ENGINE ---
function applyTheme(theme, showToastNotification = false) {
  const themeIcon = document.getElementById("theme-icon");
  const themeText = document.getElementById("theme-text");

  if (theme === "light") {
    document.body.classList.add("light-theme");
    localStorage.setItem("LIFE_RPG_THEME", "light");
    if (themeIcon) themeIcon.className = "fa-solid fa-moon text-cyan";
    if (themeText) themeText.textContent = "DARK";
    if (showToastNotification) {
      sfx.playClick();
      showToast("LIGHT THEME ACTIVATED", "Character outfit updated to luminous cyber gear.", "cyan");
    }
  } else {
    document.body.classList.remove("light-theme");
    localStorage.setItem("LIFE_RPG_THEME", "dark");
    if (themeIcon) themeIcon.className = "fa-solid fa-sun text-gold";
    if (themeText) themeText.textContent = "LIGHT";
    if (showToastNotification) {
      sfx.playClick();
      showToast("DARK THEME ACTIVATED", "Character outfit reverted to stealth obsidian armor.", "cyan");
    }
  }

  // Preload and immediately render current frame in the newly selected theme
  loadSingleFrame(imageSeq.frame, theme, () => {
    render();
  });
  ensureFramesAround(imageSeq.frame);
  render();
}

// --- 12. INITIALIZE ---
document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("LIFE_RPG_THEME") || "dark";
  applyTheme(savedTheme, false);

  // 1. Instantly render HUD, Quests, Shop, and Inventory with ZERO delay
  updateHUD();
  renderQuests();
  renderShop();
  renderInventory();
  renderHistory();
  render();

  // 2. Setup tactile event listeners
  setupEventListeners();

  // 3. Asynchronously sync latest progression from server database in background
  syncWithServer();

  window.addEventListener("load", () => {
    updateScrollScrub();
  });
});