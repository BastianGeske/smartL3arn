'use strict';

// ===== STORAGE =====
function loadData() {
  if (window.db) return window.db.load();
  try {
    const raw = localStorage.getItem('ankiweb_v1');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { decks: [] };
}

function saveData(data) {
  if (window.db) { window.db.save(data); return; }
  localStorage.setItem('ankiweb_v1', JSON.stringify(data));
}

function genId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayStr() {
  return localDateStr();
}

function isoDateToDayNumber(isoDate) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function addDaysToIsoDate(isoDate, days) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return localDateStr(date);
}

function daysBetweenIsoDates(startIsoDate, endIsoDate) {
  return isoDateToDayNumber(endIsoDate) - isoDateToDayNumber(startIsoDate);
}

function isDue(card) {
  return !card.dueDate || card.dueDate <= todayStr();
}

// ===== FSRS-5 ALGORITHM =====
// Default weights trained on ~700M Anki reviews
const FSRS_W = [0.40255, 1.18385, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.06164, 1.4654, 0.1649, 1.0310, 1.9395, 0.11505, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const FSRS_DECAY = -0.5;
const FSRS_FACTOR = Math.pow(0.9, 1 / FSRS_DECAY) - 1; // ≈ 0.2346, equals 19/81
const DESIRED_RETENTION = 0.9;

function fsrsInterval(stability) {
  // For 90% desired retention this simplifies to round(stability)
  return Math.max(1, Math.round(stability / FSRS_FACTOR * (Math.pow(DESIRED_RETENTION, 1 / FSRS_DECAY) - 1)));
}

function fsrsRetrievability(daysSince, stability) {
  if (!stability || daysSince <= 0) return 1;
  return Math.pow(1 + FSRS_FACTOR * daysSince / stability, FSRS_DECAY);
}

function fsrsInitDifficulty(grade) { // grade 1–4
  return Math.min(10, Math.max(1, FSRS_W[4] - Math.exp(FSRS_W[5] * (grade - 1)) + 1));
}

function fsrsNextDifficulty(d, grade) { // grade 1–4
  const nextD = d - FSRS_W[6] * (grade - 3);
  const d0Easy = fsrsInitDifficulty(4);
  return Math.min(10, Math.max(1, FSRS_W[7] * d0Easy + (1 - FSRS_W[7]) * nextD));
}

function fsrsNextStabilityRecall(d, s, r, grade) { // grade 2–4
  const hardPenalty = grade === 2 ? FSRS_W[15] : 1;
  const easyBonus  = grade === 4 ? FSRS_W[16] : 1;
  return s * Math.exp(FSRS_W[8]) * (11 - d) * Math.pow(s, -FSRS_W[9]) *
    (Math.exp((1 - r) * FSRS_W[10]) - 1) * hardPenalty * easyBonus + s;
}

function fsrsNextStabilityForget(d, s, r) {
  return FSRS_W[11] * Math.pow(d, -FSRS_W[12]) *
    (Math.pow(s + 1, FSRS_W[13]) - 1) *
    Math.exp((1 - r) * FSRS_W[14]);
}

function fsrs(card, grade) {
  const g = grade + 1; // UI 0–3 → FSRS 1–4
  const today = todayStr();
  const { stability, difficulty, lastReview } = card;

  const daysSince = lastReview
    ? Math.max(0, daysBetweenIsoDates(lastReview, today))
    : 0;
  const r = stability ? fsrsRetrievability(daysSince, stability) : 1;

  let newS, newD;
  if (!stability) {
    newS = FSRS_W[g - 1];
    newD = fsrsInitDifficulty(g);
  } else {
    newD = fsrsNextDifficulty(difficulty, g);
    newS = g === 1
      ? fsrsNextStabilityForget(difficulty, stability, r)
      : fsrsNextStabilityRecall(difficulty, stability, r, g);
  }
  newS = Math.max(0.1, newS);

  const interval = g === 1 ? 1 : fsrsInterval(newS);

  return {
    ...card,
    stability: +newS.toFixed(4),
    difficulty: +newD.toFixed(4),
    interval,
    dueDate: addDaysToIsoDate(today, interval),
    lastReview: today,
    repetitions: g === 1 ? 0 : (card.repetitions || 0) + 1,
    easeFactor: card.easeFactor || 2.5
  };
}

function fsrsPreviewIntervals(card) {
  const { stability, difficulty, lastReview } = card;
  const today = todayStr();
  const daysSince = lastReview
    ? Math.max(0, daysBetweenIsoDates(lastReview, today))
    : 0;
  const r = stability ? fsrsRetrievability(daysSince, stability) : 1;

  if (!stability) return ['1d', '1d', '1d', '4d'];

  return [1, 2, 3, 4].map(g => {
    if (g === 1) return '1d';
    const s = Math.max(0.1, fsrsNextStabilityRecall(difficulty, stability, r, g));
    return fmtDays(fsrsInterval(s));
  });
}

function fmtDays(d) {
  if (d < 30) return d + 'd';
  const mo = Math.round(d / 30);
  return mo + 'mo';
}

// ===== STATE =====
function loadSmartConfig() {
  try {
    const raw = localStorage.getItem('ankiweb_smart_config');
    if (raw) {
      const cfg = JSON.parse(raw);
      return {
        deckIds: Array.isArray(cfg.deckIds) ? cfg.deckIds : [],
        techniques: {
          typeRecall:      cfg.techniques?.typeRecall      ?? true,
          confidenceCheck: cfg.techniques?.confidenceCheck ?? true,
          whyPrompt:       cfg.techniques?.whyPrompt       ?? false,
          interleaving:    cfg.techniques?.interleaving    ?? true
        },
        duration: typeof cfg.duration === 'number' ? cfg.duration : 25
      };
    }
  } catch (_) {}
  return {
    deckIds: [],
    techniques: { typeRecall: true, confidenceCheck: true, whyPrompt: false, interleaving: true },
    duration: 25
  };
}

function saveSmartConfig() {
  try { localStorage.setItem('ankiweb_smart_config', JSON.stringify(state.smartConfig)); } catch (_) {}
}

function getSmartPomodoroBreakUntil() {
  try { return parseInt(localStorage.getItem(SMART_POMODORO_BREAK_UNTIL_KEY), 10) || 0; } catch (_) { return 0; }
}

function setSmartPomodoroBreakUntil(ts) {
  try {
    if (ts > Date.now()) localStorage.setItem(SMART_POMODORO_BREAK_UNTIL_KEY, String(ts));
    else localStorage.removeItem(SMART_POMODORO_BREAK_UNTIL_KEY);
  } catch (_) {}
}

const state = {
  view: 'home',
  deckId: null,
  studyQueue: [],
  learningQueue: [],
  studyPhase: 'main', // 'main' | 'learning'
  studyIndex: 0,
  flipped: false,
  filter: '',
  sortCol: 'dueDate',
  sortDir: 'asc',
  editCardId: null,
  editDeckId: null,
  lastFocus: null,
  sessionStats: { reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 },
  smartConfig: loadSmartConfig(),
  smart: null,
  smartTimerId: null
};

const SMART_REQUEUE_LIMITS = {
  again: 2,
  hard: 1,
  good: 0,
  easy: 0
};

const SMART_NEEDS_PRACTICE_GRADES = new Set(['again', 'hard']);
const SMART_POMODORO_DURATION_MINUTES = 25;
const SMART_POMODORO_BREAK_MINUTES = 7;
const SMART_POMODORO_BREAK_UNTIL_KEY = 'ankiweb_smart_pomodoro_break_until';

// ===== HTML ESCAPE =====
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function icon(name, size = 18) {
  return `<i class="icon" data-lucide="${esc(name)}" style="--icon-size:${size}px" aria-hidden="true"></i>`;
}

function hydrateIcons() {
  if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;
  window.lucide.createIcons({
    attrs: {
      'stroke-width': 1.8
    }
  });
}

function renderAppBar(active = 'library') {
  return `
    <header class="app-bar">
      <div class="app-bar-inner">
        <button class="brand-button" type="button" data-action="go-home" aria-label="Open library">
          <img src="build/icon.png" alt="" class="brand-mark">
          <span class="brand-name">smart<span>L3arn</span></span>
        </button>
        <nav class="app-nav" aria-label="Primary navigation">
          <button class="app-nav-item ${active === 'library' ? 'is-active' : ''}" type="button" data-action="go-home" ${active === 'library' ? 'aria-current="page"' : ''}>
            ${icon('library', 17)}<span>Library</span>
          </button>
          <button class="app-nav-item ${active === 'smart' ? 'is-active' : ''}" type="button" data-action="smart-open-setup" ${active === 'smart' ? 'aria-current="page"' : ''}>
            ${icon('sparkles', 17)}<span>Smart Study</span>
          </button>
        </nav>
        <div class="app-bar-actions">${themeBtn(true)}</div>
      </div>
    </header>`;
}

function formatDateLabel(isoDate, options = { month: 'short', day: 'numeric' }) {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(document.documentElement.lang || 'en', options).format(date);
}

function nextDueDate(deck) {
  return deck.cards
    .map(card => card.dueDate)
    .filter(date => date && date > todayStr())
    .sort()[0] || null;
}

function showToast(message) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  region.textContent = message;
  region.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    region.classList.remove('is-visible');
    region.textContent = '';
  }, 2600);
}

function announceStatus(message) {
  const region = document.getElementById('status-region');
  if (!region) return;
  clearTimeout(announceStatus.timer);
  region.textContent = '';
  announceStatus.timer = setTimeout(() => {
    region.textContent = message;
  }, 0);
}

// ===== ROUTING =====
function nav(view, deckId, focusSelector = '', announcement = '') {
  if (state.view === 'smart-study' && view !== 'smart-study') stopSmartTimer();
  state.view = view;
  if (deckId !== undefined) state.deckId = deckId;
  state.filter = '';
  state.flipped = false;
  const routeFocus = focusSelector || {
    home: '.page-heading h1',
    browse: '.page-heading h1',
    'smart-setup': '.page-heading h1'
  }[view] || '';
  render(routeFocus);
  if (announcement) announceStatus(announcement);
}

// ===== RENDER DISPATCHER =====
function render(focusSelector = '', fallbackSelector = '.brand-button') {
  const app = document.getElementById('app');
  if (state.view === 'home') app.innerHTML = renderHome();
  else if (state.view === 'browse') app.innerHTML = renderBrowse();
  else if (state.view === 'study') app.innerHTML = renderStudy();
  else if (state.view === 'smart-setup') app.innerHTML = renderSmartSetup();
  else if (state.view === 'smart-study') app.innerHTML = renderSmartStudy();
  bindEvents();
  hydrateIcons();
  if (state.view === 'study') {
    adjustFlashcardHeight();
    if (document.fonts?.status !== 'loaded') {
      document.fonts.ready.then(() => {
        if (state.view === 'study') adjustFlashcardHeight();
      });
    }
  }
  if (state.view === 'smart-study') focusSmartInputs();
  if (focusSelector) {
    const target = document.querySelector(focusSelector) || document.querySelector(fallbackSelector);
    if (!target) return;
    if (!target.matches('a[href], button, input, select, textarea, summary, [tabindex]')) {
      target.setAttribute('tabindex', '-1');
    }
    target.classList.add('has-programmatic-focus');
    target.addEventListener('blur', () => {
      target.classList.remove('has-programmatic-focus');
    }, { once: true });
    target.focus();
  }
}

function focusSmartInputs() {
  const inp = document.getElementById('smart-answer-input');
  if (inp) {
    inp.focus();
    const len = inp.value.length;
    try { inp.setSelectionRange(len, len); } catch (_) {}
  }
}

function adjustFlashcardHeight() {
  const card = document.querySelector('.flashcard');
  if (!card) return;
  const cardWidth = card.offsetWidth;
  let contentHeight = 0;
  card.querySelectorAll('.flashcard-face').forEach(face => {
    const clone = face.cloneNode(true);
    clone.style.cssText = `position:fixed;inset:auto auto auto -9999px;width:${cardWidth}px;height:auto;min-height:0;overflow:visible;opacity:1;transform:none;visibility:hidden;backface-visibility:visible;-webkit-backface-visibility:visible;`;
    const cloneContent = clone.querySelector('.card-content');
    if (cloneContent) {
      cloneContent.style.flex = '0 0 auto';
      cloneContent.style.minHeight = '0';
      cloneContent.style.display = 'block';
    }
    document.body.appendChild(clone);
    contentHeight = Math.max(contentHeight, clone.scrollHeight + 18);
    document.body.removeChild(clone);
  });
  if (!contentHeight) return;

  const mobile = window.matchMedia('(max-width: 719px)').matches;
  const minimum = mobile ? 290 : 310;
  const viewportLimit = Math.max(minimum, Math.round(window.innerHeight * (mobile ? 0.5 : 0.62)));
  const height = Math.min(Math.max(contentHeight, minimum), viewportLimit);
  card.style.height = `${height}px`;
  card.style.minHeight = `${height}px`;
  card.classList.toggle('is-scrollable', contentHeight > viewportLimit);
}

// ===== HOME VIEW =====
function renderHome() {
  const data = loadData();
  const totalCards = data.decks.reduce((sum, deck) => sum + deck.cards.length, 0);
  const totalDue = data.decks.reduce((sum, deck) => sum + deck.cards.filter(isDue).length, 0);
  const activeDecks = data.decks.filter(deck => deck.cards.length > 0).length;
  const bestStreak = Math.max(0, ...data.decks.map(deck => calcBestStreak(deck.sessions || [])));
  const futureDates = data.decks.flatMap(deck => deck.cards.map(card => card.dueDate))
    .filter(date => date && date > todayStr())
    .sort();
  const nextReview = futureDates[0] || null;
  const todayLabel = new Intl.DateTimeFormat(document.documentElement.lang || 'en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(new Date());

  const sortedDecks = data.decks.slice().sort((a, b) => {
    const dueDiff = b.cards.filter(isDue).length - a.cards.filter(isDue).length;
    return dueDiff || a.name.localeCompare(b.name);
  });

  const deckItems = sortedDecks.map(deck => {
    const due = deck.cards.filter(c => isDue(c)).length;
    const total = deck.cards.length;
    const sessions = deck.sessions || [];
    const lastSession = sessions[sessions.length - 1];
    const streakDays = calcStreak(sessions);
    const nextDate = nextDueDate(deck);
    const lastHtml = lastSession
      ? `<span>${icon('history', 14)} Last reviewed ${formatDateLabel(lastSession.date)}</span>`
      : '<span>Not studied yet</span>';
    const streakHtml = streakDays > 0
      ? `<span>${icon('flame', 14)} ${streakDays} day streak</span>`
      : '';
    const status = due > 0
      ? `<span class="deck-due is-due">${due} due</span><span class="deck-status-label">Ready now</span>`
      : `<span class="deck-due is-clear">${icon('check', 14)} Caught up</span><span class="deck-status-label">${nextDate ? `Next ${formatDateLabel(nextDate)}` : 'No reviews scheduled'}</span>`;
    const primaryLabel = total === 0 ? 'Add cards' : (due > 0 ? `Study ${due}` : 'Practice');
    const primaryAction = total === 0 ? 'browse' : 'study';
    const primaryClass = due > 0 ? 'btn-primary' : (total === 0 ? 'btn-secondary' : 'btn-quiet');
    return `
      <article class="deck-row">
        <div class="deck-row-icon">${icon('book-open', 20)}</div>
        <div class="deck-row-main">
          <h3 class="deck-name" title="${esc(deck.name)}">${esc(deck.name)}</h3>
          <div class="deck-meta">
            <span>${total} card${total !== 1 ? 's' : ''}</span>
            ${lastHtml}
            ${streakHtml}
          </div>
        </div>
        <div class="deck-row-status">${status}</div>
        <div class="deck-row-actions">
          <button class="btn ${primaryClass} btn-sm" type="button" data-action="${primaryAction}" data-deck="${deck.id}">
            ${due > 0 ? icon('play', 15) : icon('book-open', 15)}<span>${primaryLabel}</span>
          </button>
          <button class="btn btn-quiet btn-sm" type="button" data-action="browse" data-deck="${deck.id}">
            ${icon('rows-3', 15)}<span>Browse</span>
          </button>
          <details class="menu deck-menu">
            <summary class="btn-icon" data-deck="${deck.id}" aria-label="More actions for ${esc(deck.name)}" title="More actions">${icon('more-horizontal', 18)}</summary>
            <div class="menu-popover menu-popover-right">
              <button class="menu-item" type="button" data-action="rename-deck" data-deck="${deck.id}">${icon('pencil', 16)}<span>Rename</span></button>
              <button class="menu-item is-danger" type="button" data-action="delete-deck" data-deck="${deck.id}">${icon('trash-2', 16)}<span>Delete deck</span></button>
            </div>
          </details>
        </div>
      </article>`;
  }).join('');

  const body = data.decks.length === 0
    ? `<div class="empty-state">
        <img src="build/icon.png" alt="" class="empty-state-mark">
        <h2>Build your first deck</h2>
        <p>Add cards one by one or import an existing collection.</p>
        <button class="btn btn-primary" type="button" data-action="new-deck">${icon('plus', 17)}<span>Create deck</span></button>
      </div>`
    : `<div class="deck-list">${deckItems}</div>`;

  return `
    <div class="app-shell">
      ${renderAppBar('library')}
      <main class="workspace">
        <header class="page-heading">
          <div>
            <p class="page-kicker">${esc(todayLabel)}</p>
            <h1>Library</h1>
            <p class="page-subtitle">${totalDue > 0 ? `${totalDue} card${totalDue !== 1 ? 's' : ''} ready for review.` : 'Your scheduled reviews are complete.'}</p>
          </div>
          <div class="page-heading-actions">
            <button class="btn btn-primary" type="button" data-action="new-deck">${icon('plus', 17)}<span>New deck</span></button>
          </div>
        </header>

        <section class="summary-strip" aria-label="Collection summary">
          <div class="summary-item">
            <span class="summary-icon">${icon('calendar-days', 18)}</span>
            <div><strong>${totalDue}</strong><span>Due now</span></div>
          </div>
          <div class="summary-item">
            <span class="summary-icon">${icon('layers-3', 18)}</span>
            <div><strong>${totalCards}</strong><span>Total cards</span></div>
          </div>
          <div class="summary-item">
            <span class="summary-icon">${icon('book-open', 18)}</span>
            <div><strong>${activeDecks}</strong><span>Active decks</span></div>
          </div>
          <div class="summary-item">
            <span class="summary-icon">${icon(bestStreak > 0 ? 'flame' : 'clock-3', 18)}</span>
            <div><strong>${bestStreak > 0 ? `${bestStreak}d` : (nextReview ? formatDateLabel(nextReview) : 'Clear')}</strong><span>${bestStreak > 0 ? 'Best streak' : 'Next review'}</span></div>
          </div>
        </section>

        <section class="library-section" aria-labelledby="deck-list-title">
          <div class="section-heading">
            <div>
              <h2 id="deck-list-title">Your decks</h2>
              <span class="section-count">${data.decks.length}</span>
            </div>
            <details class="menu">
              <summary class="btn btn-secondary btn-sm">${icon('folder-open', 15)}<span>Import / export</span>${icon('chevron-down', 14)}</summary>
              <div class="menu-popover menu-popover-right menu-popover-wide">
                <button class="menu-item" type="button" data-action="trigger-file" data-target="home-import-json">${icon('file-json', 16)}<span>Import JSON</span></button>
                <button class="menu-item" type="button" data-action="trigger-file" data-target="home-import-text">${icon('file-text', 16)}<span>Import TXT / CSV</span></button>
                ${data.decks.length ? `<div class="menu-divider"></div><button class="menu-item" type="button" data-action="export-all">${icon('archive', 16)}<span>Export full backup</span></button>` : ''}
              </div>
            </details>
            <input id="home-import-json" class="file-input" type="file" accept=".json" data-action="import-deck">
            <input id="home-import-text" class="file-input" type="file" accept=".txt,.csv,.tsv" data-action="import-txt">
          </div>
          ${body}
        </section>
      </main>
    </div>`;
}

function calcStreak(sessions) {
  if (!sessions || sessions.length === 0) return 0;
  const sessionDates = new Set(sessions.map(session => session.date).filter(Boolean));
  let streak = 0;
  let expected = todayStr();
  while (sessionDates.has(expected)) {
    streak++;
    expected = addDaysToIsoDate(expected, -1);
  }
  return streak;
}

function calcBestStreak(sessions) {
  const dates = [...new Set((sessions || []).map(session => session.date).filter(Boolean))].sort();
  if (!dates.length) return 0;
  let best = 1;
  let current = 1;
  for (let index = 1; index < dates.length; index++) {
    if (daysBetweenIsoDates(dates[index - 1], dates[index]) === 1) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

// ===== BROWSE VIEW =====
function renderBrowse() {
  const data = loadData();
  const deck = data.decks.find(d => d.id === state.deckId);
  if (!deck) { nav('home'); return ''; }

  const today = todayStr();
  const filter = state.filter.toLowerCase();

  let cards = deck.cards.filter(c =>
    !filter ||
    c.front.toLowerCase().includes(filter) ||
    c.back.toLowerCase().includes(filter)
  );

  const col = state.sortCol;
  const dir = state.sortDir === 'asc' ? 1 : -1;
  cards = cards.slice().sort((a, b) => {
    let av = a[col] ?? '', bv = b[col] ?? '';
    if (typeof av === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  function thSort(label, col) {
    const active = state.sortCol === col;
    const ariaSort = active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    const arrow = active ? icon(state.sortDir === 'asc' ? 'chevron-up' : 'chevron-down', 13) : '';
    return `<th data-sort="${col}" class="${active ? 'sorted' : ''}" tabindex="0" aria-sort="${ariaSort}" aria-label="Sort by ${label}">${label}<span class="sort-arrow">${arrow}</span></th>`;
  }

  const cardStats = deck.cardStats || {};

  const rows = cards.map(c => {
    const due = c.dueDate || 'New';
    const overdue = c.dueDate && c.dueDate < today;
    const isNew = !c.lastReview && !c.stability && !c.repetitions;
    const dueLabel = isNew
      ? `<span class="tag-new">New</span>`
      : `<span class="${overdue ? 'overdue' : ''}">${c.dueDate}</span>`;
    const cs = cardStats[c.id];
    const diffLabel = c.difficulty
      ? `<span class="diff-pill diff-${diffLevel(c.difficulty)}" title="FSRS difficulty ${c.difficulty.toFixed(1)}">${c.difficulty.toFixed(1)}</span>`
      : '<span class="muted">-</span>';
    const hardRate = cs && cs.reviews > 0
      ? Math.round((cs.again / cs.reviews) * 100) + '%'
      : '-';
    return `
      <tr>
        <td class="td-front" data-label="Front">
          <span class="cell-edit" contenteditable="true" role="textbox" aria-label="Edit front of card" data-field="front" data-card="${c.id}" title="${esc(c.front)}">${esc(c.front)}</span>
        </td>
        <td class="td-back" data-label="Back">
          <span class="cell-edit" contenteditable="true" role="textbox" aria-label="Edit back of card" data-field="back" data-card="${c.id}" title="${esc(c.back)}">${esc(c.back)}</span>
        </td>
        <td class="td-meta" data-label="Due">${dueLabel}</td>
        <td class="td-meta" data-label="Interval">${c.interval > 0 ? c.interval + 'd' : '-'}</td>
        <td class="td-meta" data-label="Difficulty">${diffLabel}</td>
        <td class="td-meta" data-label="Fail rate">${hardRate}</td>
        <td class="td-actions" data-label="Actions">
          <details class="menu card-actions-menu">
            <summary class="btn-icon" data-card="${c.id}" aria-label="Actions for ${esc(c.front)}" title="Card actions">${icon('more-horizontal', 17)}</summary>
            <div class="menu-popover menu-popover-right card-actions-popover">
              <button class="menu-item" type="button" data-action="edit-card" data-card="${c.id}" aria-label="Edit ${esc(c.front)}">${icon('pencil', 16)}<span>Edit card</span></button>
              <button class="menu-item is-danger" type="button" data-action="delete-card" data-card="${c.id}" aria-label="Delete ${esc(c.front)}">${icon('trash-2', 16)}<span>Delete card</span></button>
            </div>
          </details>
        </td>
      </tr>`;
  }).join('');

  const emptyRow = cards.length === 0
    ? `<tr class="table-empty-row"><td colspan="7">${filter ? 'No cards match your search.' : 'No cards yet. Add your first card.'}</td></tr>`
    : '';

  const dueCount = deck.cards.filter(isDue).length;
  const newCount = deck.cards.filter(card => !card.lastReview && !card.stability && !card.repetitions).length;
  const sortFields = [
    ['dueDate', 'Due date'],
    ['front', 'Front'],
    ['back', 'Back'],
    ['interval', 'Interval'],
    ['difficulty', 'Difficulty']
  ];
  const sortOptions = sortFields.flatMap(([value, label]) => [
    `<option value="${value}|asc" ${state.sortCol === value && state.sortDir === 'asc' ? 'selected' : ''}>${label}: ascending</option>`,
    `<option value="${value}|desc" ${state.sortCol === value && state.sortDir === 'desc' ? 'selected' : ''}>${label}: descending</option>`
  ]).join('');

  return `
    <div class="app-shell">
      ${renderAppBar('library')}
      <main class="workspace">
        <button class="back-link" type="button" data-action="go-home">${icon('arrow-left', 16)}<span>Library</span></button>
        <header class="page-heading browse-heading">
          <div>
            <p class="page-kicker">Deck</p>
            <h1 title="${esc(deck.name)}">${esc(deck.name)}</h1>
            <p class="page-subtitle">${deck.cards.length} card${deck.cards.length !== 1 ? 's' : ''} in this deck.</p>
          </div>
          <div class="page-heading-actions">
            ${deck.cards.length ? `<button class="btn btn-secondary" type="button" data-action="study" data-deck="${deck.id}">${icon('play', 17)}<span>${dueCount > 0 ? `Study ${dueCount}` : 'Practice'}</span></button>` : ''}
            <button class="btn btn-primary" type="button" data-action="add-card">${icon('plus', 17)}<span>Add card</span></button>
          </div>
        </header>

        <section class="deck-summary" aria-label="Deck summary">
          <div><strong>${deck.cards.length}</strong><span>Total</span></div>
          <div><strong>${dueCount}</strong><span>Due now</span></div>
          <div><strong>${newCount}</strong><span>New</span></div>
          <div><strong>${calcStreak(deck.sessions || [])}d</strong><span>Streak</span></div>
        </section>

      <div class="browse-toolbar">
        <label class="search-field">
          ${icon('search', 17)}
          <span class="visually-hidden">Search cards</span>
          <input class="search-input" type="search" placeholder="Search cards" value="${esc(state.filter)}" data-action="filter-cards" autocomplete="off">
        </label>
        <span class="browse-count" aria-live="polite">${cards.length} of ${deck.cards.length}</span>
        <div class="mobile-sort">
          <label class="visually-hidden" for="mobile-sort-select">Sort cards</label>
          <select id="mobile-sort-select" class="select-input" data-action="sort-cards">${sortOptions}</select>
        </div>
        <details class="menu">
          <summary class="btn btn-secondary btn-sm" aria-label="Deck actions" title="Deck actions">${icon('more-horizontal', 16)}<span class="deck-actions-label">Deck actions</span>${icon('chevron-down', 14)}</summary>
          <div class="menu-popover menu-popover-right menu-popover-wide">
            <button class="menu-item" type="button" data-action="trigger-file" data-target="deck-import-text">${icon('upload', 16)}<span>Import TXT / CSV</span></button>
            <div class="menu-divider"></div>
            <button class="menu-item" type="button" data-action="export-json">${icon('file-json', 16)}<span>Export JSON</span></button>
            <button class="menu-item" type="button" data-action="export-csv">${icon('sheet', 16)}<span>Export CSV</span></button>
            <button class="menu-item" type="button" data-action="export-txt">${icon('file-text', 16)}<span>Export TXT</span></button>
            <div class="menu-divider"></div>
            <button class="menu-item" type="button" data-action="rename-deck" data-deck="${deck.id}">${icon('pencil', 16)}<span>Rename deck</span></button>
          </div>
        </details>
        <input id="deck-import-text" class="file-input" type="file" accept=".txt,.csv,.tsv" data-action="import-csv">
      </div>
      <div class="table-wrapper">
        <table aria-label="Cards in ${esc(deck.name)}">
          <thead>
            <tr>
              ${thSort('Front', 'front')}
              ${thSort('Back', 'back')}
              ${thSort('Due', 'dueDate')}
              ${thSort('Interval', 'interval')}
              ${thSort('Difficulty', 'difficulty')}
              <th>Fail %</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}${emptyRow}</tbody>
        </table>
      </div>
      </main>
    </div>`;
}

function diffLevel(d) {
  if (d <= 3) return 'easy';
  if (d <= 6) return 'medium';
  return 'hard';
}

// ===== STUDY VIEW =====
function renderSessionStats(stats, extraClass = '') {
  const items = [
    ['again', 'Again'],
    ['hard', 'Hard'],
    ['good', 'Good'],
    ['easy', 'Easy']
  ];
  return `
    <div class="session-stats ${extraClass}" aria-label="Session ratings">
      <span class="session-stats-label">Session ratings</span>
      ${items.map(([key, label]) => `
        <div class="sstat sstat-${key}">
          <strong>${stats[key] || 0}</strong>
          <span>${label}</span>
        </div>`).join('')}
    </div>`;
}

function renderStudyHeader(deckName, progress, label, timerHtml = '') {
  return `
    <header class="study-header">
      <div class="study-header-top">
        <button class="btn btn-quiet btn-sm" type="button" data-action="go-home">${icon('x', 16)}<span>Exit</span></button>
        <div class="study-context">
          <span class="study-context-label">Study session</span>
          <strong title="${esc(deckName)}">${esc(deckName)}</strong>
        </div>
        ${themeBtn(true)}
      </div>
      <div class="study-progress-row">
        <div class="progress-bar-wrap" role="progressbar" aria-label="Session progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}">
          <div class="progress-bar-fill" style="width:${Math.max(0, Math.min(100, progress))}%"></div>
        </div>
        <span class="progress-label">${label}${timerHtml}</span>
      </div>
    </header>`;
}

function renderStudy() {
  const data = loadData();
  const deck = data.decks.find(d => d.id === state.deckId);
  if (!deck) { nav('home'); return ''; }

  const isMain = state.studyPhase === 'main';
  const queue = isMain ? state.studyQueue : state.learningQueue;
  const idx = state.studyIndex;
  const ss = state.sessionStats;

  // Done when current queue exhausted and (in learning phase OR no learning cards)
  const mainDone = state.studyIndex >= state.studyQueue.length && state.studyPhase === 'main' && state.learningQueue.length === 0;
  const learningDone = state.studyPhase === 'learning' && state.studyIndex >= state.learningQueue.length;

  if (mainDone || learningDone) {
    const total = ss.reviewed;
    const hasDue = deck.cards.some(isDue);
    const upcomingDate = !hasDue
      ? deck.cards.filter(c => c.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate
      : null;
    const restartBtn = deck.cards.length > 0
      ? `<button class="btn btn-primary" type="button" data-action="restart-study">${icon('rotate-ccw', 17)}<span>${hasDue ? 'Study again' : 'Practice again'}</span></button>`
      : '';

    return `
      <div class="study-shell">
        ${renderStudyHeader(deck.name, 100, `${total} reviewed`)}
        <main class="study-done" tabindex="-1">
          <div class="completion-mark">${icon('check', 24)}</div>
          <p class="completion-kicker">Session complete</p>
          <h1 class="completion-title" tabindex="-1">${total} card${total !== 1 ? 's' : ''} reviewed</h1>
          ${upcomingDate ? `<p class="completion-note">${icon('calendar-days', 16)} Next review ${formatDateLabel(upcomingDate, { weekday: 'short', month: 'short', day: 'numeric' })}</p>` : ''}
          ${renderSessionStats(ss, 'session-stats-done')}
          <div class="study-done-actions">
            ${restartBtn}
            <button class="btn btn-secondary" type="button" data-action="go-home">${icon('library', 17)}<span>Back to library</span></button>
          </div>
        </main>
      </div>`;
  }

  const cardId = queue[idx];
  const card = deck.cards.find(c => c.id === cardId);
  if (!card) { state.studyIndex++; return renderStudy(); }

  // Progress
  const totalMain = state.studyQueue.length;
  const mainDoneCount = isMain ? idx : state.studyQueue.length;
  const pct = totalMain > 0 ? Math.round((mainDoneCount / totalMain) * 100) : 100;
  const learningCount = state.learningQueue.length;

  const progressLabel = isMain
    ? `${idx} / ${totalMain}${learningCount > 0 ? ` <span class="learning-badge">+${learningCount}</span>` : ''}`
    : `<span class="learning-badge">Re-learning ${idx + 1} / ${state.learningQueue.length}</span>`;

  // Predicted intervals for rating buttons
  const intervals = fsrsPreviewIntervals(card);

  const ratingSection = state.flipped ? `
    <div class="rating-buttons" role="group" aria-label="Rate this answer">
      ${['Again', 'Hard', 'Good', 'Easy'].map((label, grade) => `
        <button class="rating-button rating-${label.toLowerCase()}" type="button" data-action="rate" data-grade="${grade}">
          <span>${label}</span>
          <strong>${intervals[grade]}</strong>
        </button>`).join('')}
    </div>` : `
    <div class="show-answer-wrap">
      <button class="btn btn-primary btn-lg" type="button" data-action="flip">${icon('eye', 18)}<span>Reveal answer</span></button>
    </div>`;

  return `
    <div class="study-shell">
      ${renderStudyHeader(deck.name, pct, progressLabel)}
      <main class="study-main">
        <div class="flashcard-area">
        <div class="flashcard-scene">
          <div class="flashcard${state.flipped ? ' flipped' : ''}">
            <section class="flashcard-face flashcard-front" tabindex="${state.flipped ? '-1' : '0'}" aria-hidden="${state.flipped}" aria-labelledby="study-front-label" aria-describedby="study-front-content" ${state.flipped ? 'inert' : ''}>
              <span class="card-side-label" id="study-front-label">Question</span>
              <span class="card-content" id="study-front-content">${esc(card.front)}</span>
            </section>
            <section class="flashcard-face flashcard-back" tabindex="${state.flipped ? '0' : '-1'}" aria-hidden="${!state.flipped}" aria-labelledby="study-back-label" aria-describedby="study-back-content" ${state.flipped ? '' : 'inert'}>
              <span class="card-side-row">
                <span class="card-side-label" id="study-back-label">Answer</span>
                <button class="btn-icon card-return-button" type="button" data-action="flip" aria-label="Show question" title="Show question">${icon('rotate-ccw', 16)}</button>
              </span>
              <span class="card-content" id="study-back-content">${esc(card.back)}</span>
            </section>
          </div>
        </div>
      </div>
      ${renderSessionStats(ss)}
      </main>
      <div class="study-actions">${ratingSection}</div>
    </div>`;
}

// ===== MODAL =====
function openModal(cardId, deckId) {
  const data = loadData();
  const deck = data.decks.find(d => d.id === deckId);
  const card = cardId ? deck?.cards.find(c => c.id === cardId) : null;

  state.lastFocus = document.activeElement;
  state.editCardId = cardId || null;
  document.getElementById('modal-title').textContent = card ? 'Edit Card' : 'Add Card';
  document.getElementById('modal-save').textContent = card ? 'Save changes' : 'Add card';
  document.getElementById('modal-front').value = card ? card.front : '';
  document.getElementById('modal-back').value = card ? card.back : '';
  const error = document.getElementById('modal-error');
  error.hidden = true;
  const frontInput = document.getElementById('modal-front');
  const backInput = document.getElementById('modal-back');
  [frontInput, backInput].forEach(input => {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  });
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setTimeout(() => document.getElementById('modal-front').focus(), 20);
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  state.editCardId = null;
  if (state.lastFocus && document.contains(state.lastFocus)) state.lastFocus.focus();
  state.lastFocus = null;
}

function saveModal() {
  const front = document.getElementById('modal-front').value.trim();
  const back = document.getElementById('modal-back').value.trim();
  if (!front || !back) {
    const error = document.getElementById('modal-error');
    error.textContent = 'Add text to both sides of the card.';
    error.hidden = false;
    const frontInput = document.getElementById('modal-front');
    const backInput = document.getElementById('modal-back');
    if (!front) {
      frontInput.setAttribute('aria-invalid', 'true');
      frontInput.setAttribute('aria-describedby', 'modal-error');
    } else {
      frontInput.removeAttribute('aria-invalid');
      frontInput.removeAttribute('aria-describedby');
    }
    if (!back) {
      backInput.setAttribute('aria-invalid', 'true');
      backInput.setAttribute('aria-describedby', 'modal-error');
    } else {
      backInput.removeAttribute('aria-invalid');
      backInput.removeAttribute('aria-describedby');
    }
    (!front ? document.getElementById('modal-front') : document.getElementById('modal-back')).focus();
    return;
  }

  const data = loadData();
  const deck = data.decks.find(d => d.id === state.deckId);
  if (!deck) return;

  const editedCardId = state.editCardId;
  const wasEditing = Boolean(editedCardId);
  if (state.editCardId) {
    const card = deck.cards.find(c => c.id === state.editCardId);
    if (card) { card.front = front; card.back = back; }
  } else {
    deck.cards.push({
      id: genId(),
      front,
      back,
      interval: 0,
      repetitions: 0,
      easeFactor: 2.5,
      dueDate: todayStr()
    });
  }

  saveData(data);
  closeModal();
  render(wasEditing
    ? `.card-actions-menu summary[data-card="${editedCardId}"]`
    : '[data-action="add-card"]',
  '[data-action="filter-cards"]');
  showToast(wasEditing ? 'Card updated.' : 'Card added.');
}

// ===== IMPORT / EXPORT =====
function deckFilename(name) {
  return (name || 'deck').replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, '_');
}

function exportJson(deckId) {
  const deck = loadData().decks.find(d => d.id === deckId);
  if (!deck) return;
  saveExport(deckFilename(deck.name) + '.json', JSON.stringify(deck, null, 2), 'application/json');
}

function exportCsv(deckId) {
  const deck = loadData().decks.find(d => d.id === deckId);
  if (!deck) return;
  const rows = [['front', 'back'], ...deck.cards.map(c => [csvEsc(c.front), csvEsc(c.back)])];
  saveExport(deckFilename(deck.name) + '.csv', rows.map(r => r.join(',')).join('\n'), 'text/csv');
}

// Anki-compatible: tab-delimited front<TAB>back, one note per line. Newlines
// become <br> (Anki renders HTML) and literal tabs become spaces so columns hold.
function exportTxt(deckId) {
  const deck = loadData().decks.find(d => d.id === deckId);
  if (!deck) return;
  const ankiField = v => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
  const txt = deck.cards.map(c => ankiField(c.front) + '\t' + ankiField(c.back)).join('\n');
  saveExport(deckFilename(deck.name) + '.txt', txt, 'text/plain');
}

// Full backup of every deck (matches the on-disk shape; re-importable via Import JSON).
function exportAll() {
  const data = loadData();
  if (!data.decks.length) { alert('No decks to export yet.'); return; }
  saveExport('smartL3arn_backup_' + todayStr() + '.json', JSON.stringify(data, null, 2), 'application/json');
}

function csvEsc(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Browser/Electron: trigger a file download. Native (iOS/Android): write the file
// to the app cache and open the share sheet so the user can save it (Files, Drive, ...).
async function saveExport(filename, content, mime) {
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    const fs = cap.Plugins && cap.Plugins.Filesystem;
    const share = cap.Plugins && cap.Plugins.Share;
    if (!fs || !share) { alert('Export is not available on this device.'); return; }
    try {
      await fs.writeFile({ path: filename, data: content, directory: 'CACHE', encoding: 'utf8' });
      const { uri } = await fs.getUri({ path: filename, directory: 'CACHE' });
      await share.share({ title: filename, files: [uri], dialogTitle: 'Export ' + filename });
    } catch (err) {
      const msg = (err && err.message) || String(err);
      if (/cancel/i.test(msg)) return; // user dismissed the share sheet
      alert('Export failed: ' + msg);
    }
    return;
  }
  downloadBlob(new Blob([content], { type: mime }), filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function importDeckJson(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      const data = loadData();

      // Full backup (from Export All): restore every deck with its cards/stats/sessions.
      if (parsed && Array.isArray(parsed.decks)) {
        const restored = parsed.decks.filter(d => d && Array.isArray(d.cards));
        if (!restored.length) throw new Error('Backup contains no decks.');
        restored.forEach(d => data.decks.push({ ...d, id: genId(), name: d.name || 'Imported Deck' }));
        saveData(data);
        render();
        showToast(`Imported ${restored.length} deck${restored.length !== 1 ? 's' : ''} from backup.`);
        return;
      }

      let deckName, rawCards;

      if (Array.isArray(parsed)) {
        deckName = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ') || 'Imported Deck';
        rawCards = parsed;
      } else if (parsed && Array.isArray(parsed.cards)) {
        deckName = parsed.name || file.name.replace(/\.[^.]+$/, '');
        rawCards = parsed.cards;
      } else {
        throw new Error('Expected a JSON array or an object with a "cards" array.');
      }

      const cards = rawCards
        .filter(c => c.front && c.back)
        .map(c => ({
          id: genId(),
          front: String(c.front),
          back: String(c.back),
          interval: c.interval || 0,
          repetitions: c.repetitions || 0,
          easeFactor: c.easeFactor || 2.5,
          dueDate: c.dueDate || todayStr()
        }));

      if (!cards.length) throw new Error('No cards with both "front" and "back" fields found.');

      data.decks.push({ id: genId(), name: deckName, cards });
      saveData(data);
      render();
      showToast(`Created "${deckName}" with ${cards.length} card${cards.length !== 1 ? 's' : ''}.`);
    } catch (err) {
      alert('Failed to import: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function parseCards(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (!lines.length) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const cards = [];
  for (const line of lines) {
    const parts = delim === '\t' ? line.split('\t') : parseCsvLine(line);
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      cards.push({ front: parts[0].trim(), back: parts[1].trim() });
    }
  }
  return cards;
}

function parseCsvLine(line) {
  const result = [];
  let inQuote = false, cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map(s => s.trim());
}

function importCsv(file, deckId) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = parseCards(e.target.result);
      if (!parsed.length) { alert('No valid cards found. Expected two columns (front and back) separated by a tab or comma.'); return; }
      const data = loadData();
      const deck = data.decks.find(d => d.id === deckId);
      if (!deck) return;
      for (const c of parsed) {
        deck.cards.push({ id: genId(), front: c.front, back: c.back, interval: 0, repetitions: 0, easeFactor: 2.5, dueDate: todayStr() });
      }
      saveData(data);
      render();
      showToast(`Imported ${parsed.length} card${parsed.length !== 1 ? 's' : ''}.`);
    } catch (err) {
      alert('Failed to import: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function importTxtAsDeck(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = parseCards(e.target.result);
      if (!parsed.length) { alert('No valid cards found. Expected two columns (front and back) separated by a tab or comma.'); return; }
      const deckName = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ') || 'Imported Deck';
      const data = loadData();
      data.decks.push({
        id: genId(),
        name: deckName,
        cards: parsed.map(c => ({ id: genId(), front: c.front, back: c.back, interval: 0, repetitions: 0, easeFactor: 2.5, dueDate: todayStr() }))
      });
      saveData(data);
      render();
      showToast(`Created "${deckName}" with ${parsed.length} card${parsed.length !== 1 ? 's' : ''}.`);
    } catch (err) {
      alert('Failed to import: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ===== INLINE CELL EDIT =====
function saveInlineEdit(cardId, field, value) {
  const val = value.trim();
  if (!val) return;
  const data = loadData();
  const deck = data.decks.find(d => d.id === state.deckId);
  if (!deck) return;
  const card = deck.cards.find(c => c.id === cardId);
  if (card) { card[field] = val; saveData(data); }
}

// ===== EVENT BINDING =====
function bindEvents() {
  const app = document.getElementById('app');

  app.addEventListener('click', handleClick);
  app.addEventListener('change', handleChange);
  app.addEventListener('input', handleInput);

  app.querySelectorAll('.cell-edit').forEach(el => {
    el.addEventListener('blur', e => {
      const cardId = e.target.dataset.card;
      const field = e.target.dataset.field;
      saveInlineEdit(cardId, field, e.target.textContent);
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
  });

  app.querySelectorAll('th[data-sort]').forEach(th => {
    const activate = () => setSortColumn(th.dataset.sort);
    th.addEventListener('click', activate);
    th.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });

  app.querySelectorAll('.flashcard-face').forEach(face => {
    face.addEventListener('keydown', scrollFlashcardWithKeyboard);
  });

  app.querySelectorAll('.card-actions-menu').forEach(menu => {
    menu.addEventListener('toggle', () => {
      if (!menu.open) {
        resetCardActionMenu(menu);
        return;
      }
      closeCardActionMenus(menu);
      positionCardActionMenu(menu);
    });
  });

  document.removeEventListener('keydown', studyKeydown);
  document.removeEventListener('keydown', smartKeydown);
  if (state.view === 'study') {
    document.addEventListener('keydown', studyKeydown);
  }

  if (state.view === 'smart-study') {
    const inp = document.getElementById('smart-answer-input');
    if (inp) {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          smartCheckAnswer();
        }
      });
    }
    document.addEventListener('keydown', smartKeydown);
  }
}

function resetCardActionMenu(menu) {
  const popover = menu.querySelector('.card-actions-popover');
  if (!popover) return;
  popover.classList.remove('is-viewport-positioned');
  popover.style.removeProperty('top');
  popover.style.removeProperty('left');
  popover.style.removeProperty('visibility');
}

function closeCardActionMenus(except = null) {
  document.querySelectorAll('.card-actions-menu[open]').forEach(menu => {
    if (menu === except) return;
    menu.open = false;
    resetCardActionMenu(menu);
  });
}

function positionCardActionMenu(menu) {
  if (!menu.open) return;
  const trigger = menu.querySelector('summary');
  const popover = menu.querySelector('.card-actions-popover');
  if (!trigger || !popover) return;

  popover.classList.add('is-viewport-positioned');
  popover.style.visibility = 'hidden';
  const triggerRect = trigger.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const edge = 8;
  const gap = 6;
  const left = Math.min(
    viewportWidth - popoverRect.width - edge,
    Math.max(edge, triggerRect.right - popoverRect.width)
  );
  const spaceBelow = viewportHeight - triggerRect.bottom - edge;
  const spaceAbove = triggerRect.top - edge;
  const openAbove = spaceBelow < popoverRect.height + gap && spaceAbove > spaceBelow;
  const preferredTop = openAbove
    ? triggerRect.top - popoverRect.height - gap
    : triggerRect.bottom + gap;
  const top = Math.min(
    viewportHeight - popoverRect.height - edge,
    Math.max(edge, preferredTop)
  );

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.visibility = 'visible';
}

function smartKeydown(e) {
  const s = state.smart;
  if (!s || state.view !== 'smart-study') return;
  if (s.timeUp) return;
  // Reviewing phase: 1-4 to rate
  if (s.phase === 'reviewing') {
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
      return;
    }
    if (e.key === '1') { e.preventDefault(); smartRateCard(0); return; }
    if (e.key === '2') { e.preventDefault(); smartRateCard(1); return; }
    if (e.key === '3') { e.preventDefault(); smartRateCard(2); return; }
    if (e.key === '4') { e.preventDefault(); smartRateCard(3); return; }
  }
}

function setSortColumn(col) {
  if (state.sortCol === col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  else { state.sortCol = col; state.sortDir = 'asc'; }
  render();
}

function handleClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const deckId = btn.dataset.deck;
  const cardId = btn.dataset.card;

  if (action === 'toggle-dark') toggleDark();
  else if (action === 'go-home') nav('home');
  else if (action === 'new-deck') createDeck();
  else if (action === 'rename-deck') renameDeck(deckId);
  else if (action === 'trigger-file') document.getElementById(btn.dataset.target)?.click();
  else if (action === 'study') startStudy(deckId);
  else if (action === 'browse') nav('browse', deckId);
  else if (action === 'delete-deck') deleteDeck(deckId);
  else if (action === 'add-card') openModal(null, state.deckId);
  else if (action === 'edit-card') openModal(cardId, state.deckId);
  else if (action === 'delete-card') deleteCard(cardId);
  else if (action === 'export-json') exportJson(state.deckId);
  else if (action === 'export-csv') exportCsv(state.deckId);
  else if (action === 'export-txt') exportTxt(state.deckId);
  else if (action === 'export-all') exportAll();
  else if (action === 'flip') flipStudyCard();
  else if (action === 'rate') rateCard(+btn.dataset.grade);
  else if (action === 'restart-study') startStudy(state.deckId);
  else if (action === 'smart-open-setup') nav('smart-setup');
  else if (action === 'smart-set-duration') { state.smartConfig.duration = parseInt(btn.dataset.val, 10) || 0; saveSmartConfig(); render(); }
  else if (action === 'smart-start') startSmartStudy();
  else if (action === 'smart-confidence') smartSetConfidence(btn.dataset.val);
  else if (action === 'smart-check') smartCheckAnswer();
  else if (action === 'smart-skip') smartSkip();
  else if (action === 'smart-reveal') smartReveal();
  else if (action === 'smart-rate') smartRateCard(+btn.dataset.grade);
  else if (action === 'smart-break-start-next') startSmartStudy();
  else if (action === 'smart-restart') startSmartStudy();
  else if (action === 'smart-tweak') nav('smart-setup');
}

function handleChange(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'import-deck' && el.files[0]) importDeckJson(el.files[0]);
  else if (action === 'import-txt' && el.files[0]) importTxtAsDeck(el.files[0]);
  else if (action === 'import-csv' && el.files[0]) importCsv(el.files[0], state.deckId);
  else if (action === 'sort-cards') {
    const [column, direction] = el.value.split('|');
    state.sortCol = column;
    state.sortDir = direction === 'desc' ? 'desc' : 'asc';
    render();
  }
  else if (action === 'smart-toggle-deck') {
    const id = el.dataset.deck;
    if (el.checked) { if (!state.smartConfig.deckIds.includes(id)) state.smartConfig.deckIds.push(id); }
    else { state.smartConfig.deckIds = state.smartConfig.deckIds.filter(d => d !== id); }
    saveSmartConfig();
    render();
  }
  else if (action === 'smart-toggle-technique') {
    state.smartConfig.techniques[el.dataset.key] = el.checked;
    saveSmartConfig();
  }
}

function handleInput(e) {
  if (e.target.dataset.action === 'filter-cards') {
    state.filter = e.target.value;
    const cursor = e.target.selectionStart;
    render();
    const nextInput = document.querySelector('[data-action="filter-cards"]');
    if (nextInput) {
      nextInput.focus();
      if (cursor !== null) nextInput.setSelectionRange(cursor, cursor);
    }
  } else if (e.target.id === 'smart-answer-input' && state.smart) {
    state.smart.typedAnswer = e.target.value;
  } else if (e.target.id === 'smart-why-input' && state.smart) {
    state.smart.elaboration = e.target.value;
  }
}

function studyKeydown(e) {
  if (state.view !== 'study') return;
  if (e.target.closest('button, input, textarea, select, [contenteditable="true"]')) return;
  if (!state.flipped && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    flipStudyCard();
  } else if (state.flipped) {
    if (e.key === '1') rateCard(0);
    else if (e.key === '2') rateCard(1);
    else if (e.key === '3') rateCard(2);
    else if (e.key === '4') rateCard(3);
  }
}

function scrollFlashcardWithKeyboard(e) {
  const face = e.currentTarget;
  if (face.scrollHeight <= face.clientHeight) return;
  const line = 44;
  const page = Math.max(line, face.clientHeight - 48);
  let next = null;
  if (e.key === 'ArrowDown') next = face.scrollTop + line;
  else if (e.key === 'ArrowUp') next = face.scrollTop - line;
  else if (e.key === 'PageDown') next = face.scrollTop + page;
  else if (e.key === 'PageUp') next = face.scrollTop - page;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = face.scrollHeight;
  if (next === null) return;
  e.preventDefault();
  face.scrollTop = next;
}

// ===== ACTIONS =====
function flipStudyCard() {
  state.flipped = !state.flipped;
  render(state.flipped ? '.flashcard-back' : '.flashcard-front');
  announceStatus(state.flipped
    ? 'Answer revealed. Choose Again, Hard, Good, or Easy.'
    : 'Question shown.');
}

function createDeck() {
  openDeckModal(null);
}

function renameDeck(deckId) {
  openDeckModal(deckId);
}

function openDeckModal(deckId) {
  const deck = deckId ? loadData().decks.find(item => item.id === deckId) : null;
  state.lastFocus = document.activeElement;
  state.editDeckId = deck?.id || null;
  document.getElementById('deck-modal-title').textContent = deck ? 'Rename deck' : 'New deck';
  document.getElementById('deck-modal-save').textContent = deck ? 'Save changes' : 'Create deck';
  document.getElementById('deck-modal-name').value = deck?.name || '';
  document.getElementById('deck-modal-error').hidden = true;
  document.getElementById('deck-modal-name').removeAttribute('aria-invalid');
  document.getElementById('deck-modal-name').removeAttribute('aria-describedby');
  const overlay = document.getElementById('deck-modal-overlay');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setTimeout(() => {
    const input = document.getElementById('deck-modal-name');
    input.focus();
    input.select();
  }, 20);
}

function saveDeckModal() {
  const name = document.getElementById('deck-modal-name').value.trim();
  if (!name) {
    const error = document.getElementById('deck-modal-error');
    error.textContent = 'Enter a deck name.';
    error.hidden = false;
    const input = document.getElementById('deck-modal-name');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'deck-modal-error');
    input.focus();
    return;
  }
  const data = loadData();
  const editedDeckId = state.editDeckId;
  const wasEditing = Boolean(editedDeckId);
  if (editedDeckId) {
    const deck = data.decks.find(item => item.id === editedDeckId);
    if (deck) deck.name = name;
  } else {
    data.decks.push({ id: genId(), name, cards: [] });
  }
  saveData(data);
  closeDeckModal();
  const focusSelector = state.view === 'browse'
    ? '.browse-toolbar > .menu > summary'
    : (wasEditing
      ? `.deck-menu summary[data-deck="${editedDeckId}"]`
      : '[data-action="new-deck"]');
  render(focusSelector, state.view === 'smart-setup' ? '.page-heading h1' : '.brand-button');
  showToast(wasEditing ? 'Deck renamed.' : 'Deck created.');
}

function closeDeckModal() {
  const overlay = document.getElementById('deck-modal-overlay');
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  state.editDeckId = null;
  if (state.lastFocus && document.contains(state.lastFocus)) state.lastFocus.focus();
  state.lastFocus = null;
}

function deleteDeck(deckId) {
  const data = loadData();
  const deck = data.decks.find(d => d.id === deckId);
  if (!deck) return;
  if (!confirm(`Delete deck "${deck.name}" and all its cards?`)) return;
  data.decks = data.decks.filter(d => d.id !== deckId);
  saveData(data);
  render();
}

function deleteCard(cardId) {
  if (!confirm('Delete this card?')) return;
  const data = loadData();
  const deck = data.decks.find(d => d.id === state.deckId);
  if (!deck) return;
  deck.cards = deck.cards.filter(c => c.id !== cardId);
  saveData(data);
  render();
}

function startStudy(deckId) {
  const data = loadData();
  const deck = data.decks.find(d => d.id === deckId);
  if (!deck) return;

  const today = todayStr();

  // Build two priority groups: overdue cards come before today's due cards.
  // Within each group sort by difficulty (hardest first) then shuffle to avoid memorizing order.
  const overdueIds = deck.cards
    .filter(c => isDue(c) && c.dueDate && c.dueDate < today)
    .sort((a, b) => (b.difficulty || 5) - (a.difficulty || 5))
    .map(c => c.id);
  shuffleInPlace(overdueIds);

  const todayIds = deck.cards
    .filter(c => isDue(c) && (!c.dueDate || c.dueDate === today))
    .sort((a, b) => (b.difficulty || 5) - (a.difficulty || 5))
    .map(c => c.id);
  shuffleInPlace(todayIds);

  let mainQueue = [...overdueIds, ...todayIds];
  if (mainQueue.length === 0) {
    mainQueue = deck.cards.map(c => c.id);
    shuffleInPlace(mainQueue);
  }
  state.studyQueue = mainQueue;
  state.learningQueue = [];
  state.studyPhase = 'main';
  state.studyIndex = 0;
  state.flipped = false;
  state.sessionStats = { reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 };
  nav('study', deckId, '.flashcard-front', `Study session started. ${mainQueue.length} card${mainQueue.length !== 1 ? 's' : ''} in this session.`);
}

function rateCard(grade) {
  const isMain = state.studyPhase === 'main';
  const queue = isMain ? state.studyQueue : state.learningQueue;
  const cardId = queue[state.studyIndex];

  // Update session stats
  const statKeys = ['again', 'hard', 'good', 'easy'];
  state.sessionStats.reviewed++;
  state.sessionStats[statKeys[grade]]++;

  // Apply FSRS and save per-card stats
  const data = loadData();
  const deck = data.decks.find(d => d.id === state.deckId);
  if (deck) {
    const cardIdx = deck.cards.findIndex(c => c.id === cardId);
    if (cardIdx !== -1) {
      deck.cards[cardIdx] = fsrs(deck.cards[cardIdx], grade);
    }
    if (!deck.cardStats) deck.cardStats = {};
    const cs = deck.cardStats[cardId] || { reviews: 0, again: 0, hard: 0 };
    cs.reviews++;
    if (grade === 0) cs.again++;
    if (grade === 1) cs.hard++;
    deck.cardStats[cardId] = cs;

  }

  // If Again, re-queue for end of session (both main and learning phase)
  if (grade === 0) {
    state.learningQueue.push(cardId);
  }

  state.studyIndex++;

  // Switch to learning phase when main queue is exhausted
  if (isMain && state.studyIndex >= state.studyQueue.length && state.learningQueue.length > 0) {
    state.studyPhase = 'learning';
    state.studyIndex = 0;
  }

  const sessionComplete =
    (state.studyPhase === 'main' && state.studyIndex >= state.studyQueue.length) ||
    (state.studyPhase === 'learning' && state.studyIndex >= state.learningQueue.length);

  if (deck && sessionComplete) {
    if (!deck.sessions) deck.sessions = [];
    const ss = state.sessionStats;
    deck.sessions.push({
      date: todayStr(),
      reviewed: ss.reviewed,
      again: ss.again,
      hard: ss.hard,
      good: ss.good,
      easy: ss.easy
    });
    if (deck.sessions.length > 90) deck.sessions = deck.sessions.slice(-90);
  }

  saveData(data);
  state.flipped = false;
  render(sessionComplete ? '.completion-title' : '.flashcard-front');
  announceStatus(sessionComplete ? 'Study session complete.' : 'Next question.');
}

// ===== MODAL EVENTS =====
function trapDialogFocus(e, overlay, closeFn) {
  if (overlay.classList.contains('hidden')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeFn();
    return;
  }
  if (e.key !== 'Tab') return;
  const focusable = [...overlay.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function bindModalEvents() {
  const cardOverlay = document.getElementById('modal-overlay');
  const deckOverlay = document.getElementById('deck-modal-overlay');

  document.getElementById('modal-save').onclick = saveModal;
  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-close').onclick = closeModal;
  cardOverlay.onclick = e => {
    if (e.target === cardOverlay) closeModal();
  };
  cardOverlay.addEventListener('keydown', e => trapDialogFocus(e, cardOverlay, closeModal));
  ['modal-front', 'modal-back'].forEach(id => {
    document.getElementById(id).addEventListener('input', e => {
      if (!e.target.value.trim()) return;
      e.target.removeAttribute('aria-invalid');
      e.target.removeAttribute('aria-describedby');
      const fields = ['modal-front', 'modal-back'].map(fieldId => document.getElementById(fieldId));
      if (fields.every(field => field.value.trim())) {
        document.getElementById('modal-error').hidden = true;
      }
    });
  });

  document.getElementById('deck-modal-save').onclick = saveDeckModal;
  document.getElementById('deck-modal-cancel').onclick = closeDeckModal;
  document.getElementById('deck-modal-close').onclick = closeDeckModal;
  deckOverlay.onclick = e => {
    if (e.target === deckOverlay) closeDeckModal();
  };
  deckOverlay.addEventListener('keydown', e => trapDialogFocus(e, deckOverlay, closeDeckModal));
  document.getElementById('deck-modal-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveDeckModal();
  });
  document.getElementById('deck-modal-name').addEventListener('input', e => {
    if (!e.target.value.trim()) return;
    e.target.removeAttribute('aria-invalid');
    e.target.removeAttribute('aria-describedby');
    document.getElementById('deck-modal-error').hidden = true;
  });
}

// ===== DARK MODE =====
function isDark() {
  return localStorage.getItem('ankiweb_dark') === '1';
}

function applyTheme() {
  document.body.classList.toggle('dark', isDark());
  syncStatusBarStyle();
}

function toggleDark() {
  localStorage.setItem('ankiweb_dark', isDark() ? '0' : '1');
  applyTheme();
  render();
}

function themeBtn(iconOnly = false) {
  const nextTheme = isDark() ? 'light' : 'dark';
  return `
    <button class="${iconOnly ? 'btn-icon' : 'btn btn-secondary btn-sm'} theme-button" type="button" id="btn-theme" data-action="toggle-dark" aria-label="Switch to ${nextTheme} theme" title="${nextTheme[0].toUpperCase() + nextTheme.slice(1)} theme">
      ${icon(isDark() ? 'sun' : 'moon', 17)}
      ${iconOnly ? '' : `<span>${isDark() ? 'Light' : 'Dark'}</span>`}
    </button>`;
}

// ===== SMART STUDY: TEXT SIMILARITY =====
function normalizeAnswer(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[.,;:!?'"()\[\]{}\-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : Math.min(prev[j - 1], prev[j], curr[j - 1]) + 1;
    }
    prev = curr;
  }
  return prev[b.length];
}

function answerSimilarity(typed, correct) {
  const a = normalizeAnswer(typed);
  const b = normalizeAnswer(correct);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - levenshtein(a, b) / maxLen);
}

function similarityBand(score) {
  if (score >= 0.97) return { band: 'perfect',  label: 'Perfect',          suggested: 3 };
  if (score >= 0.82) return { band: 'close',    label: 'Very close',       suggested: 2 };
  if (score >= 0.5)  return { band: 'partial',  label: 'Partial match',    suggested: 1 };
  return                    { band: 'wrong',    label: 'Not quite',        suggested: 0 };
}

function calibrationMatch(level, score) {
  if (score === null) return null;
  if (level === 'high')   return score >= 0.82;
  if (level === 'medium') return score >= 0.5 && score < 0.97;
  if (level === 'low')    return score < 0.82;
  return null;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isSmartNeedsPracticeCard(deck, cardId) {
  return deck.cardStats?.[cardId]?.smartNeedsPractice === true;
}

function smartWeaknessScore(deck, card) {
  const cs = deck.cardStats?.[card.id] || {};
  const reviews = cs.reviews || 0;
  const againRate = reviews ? (cs.again || 0) / reviews : 0;
  const hardRate = reviews ? (cs.hard || 0) / reviews : 0;
  const difficulty = (card.difficulty || 5) / 10;
  const focusBonus = isSmartNeedsPracticeCard(deck, card.id) ? 2 : 0;
  return focusBonus + againRate + hardRate * 0.5 + difficulty * 0.25;
}

function sortSmartCards(deck, cards) {
  return cards
    .map(card => ({ card, score: smartWeaknessScore(deck, card), tie: Math.random() }))
    .sort((a, b) => (b.score - a.score) || (a.tie - b.tie))
    .map(item => item.card);
}

function smartCoreCardsForDeck(deck) {
  const today = todayStr();
  const overdue = [];
  const focus = [];
  const todayDue = [];

  deck.cards.forEach(card => {
    const due = !card.dueDate || card.dueDate <= today;
    if (due && card.dueDate && card.dueDate < today) overdue.push(card);
    else if (due) todayDue.push(card);
    else if (isSmartNeedsPracticeCard(deck, card.id)) focus.push(card);
  });

  return [
    ...sortSmartCards(deck, overdue),
    ...sortSmartCards(deck, focus),
    ...sortSmartCards(deck, todayDue)
  ];
}

function smartPracticeCardsForDeck(deck) {
  return sortSmartCards(deck, deck.cards.slice());
}

function buildSmartBuckets(selectedDecks) {
  const coreBuckets = selectedDecks
    .map(deck => ({ deckId: deck.id, cards: smartCoreCardsForDeck(deck) }))
    .filter(bucket => bucket.cards.length > 0);

  if (coreBuckets.length > 0) {
    return { buckets: coreBuckets, mode: 'core', hasCore: true };
  }

  return {
    buckets: selectedDecks
      .map(deck => ({ deckId: deck.id, cards: smartPracticeCardsForDeck(deck) }))
      .filter(bucket => bucket.cards.length > 0),
    mode: 'practice',
    hasCore: false
  };
}

function buildSmartQueueFromBuckets(buckets, interleaving) {
  if (!interleaving) {
    return buckets.flatMap(bucket => bucket.cards.map(card => ({ deckId: bucket.deckId, cardId: card.id })));
  }

  const queue = [];
  let added = true;
  while (added) {
    added = false;
    for (const bucket of buckets) {
      if (bucket.cards.length) {
        const card = bucket.cards.shift();
        queue.push({ deckId: bucket.deckId, cardId: card.id });
        added = true;
      }
    }
  }
  return queue;
}

function buildSmartStudyQueue(selectedDecks, cfg) {
  const result = buildSmartBuckets(selectedDecks);
  const queueBuckets = result.buckets.map(bucket => ({ ...bucket, cards: bucket.cards.slice() }));
  return {
    ...result,
    queue: buildSmartQueueFromBuckets(queueBuckets, cfg.techniques.interleaving)
  };
}

function clearLegacySmartBlocks(deck) {
  let changed = false;
  Object.values(deck.cardStats || {}).forEach(cs => {
    if ('smartBlockedUntil' in cs) { delete cs.smartBlockedUntil; changed = true; }
    if ('smartSkipUntilSession' in cs) { delete cs.smartSkipUntilSession; changed = true; }
  });
  return changed;
}

// ===== SMART STUDY: SETUP VIEW =====
function renderSmartSetup() {
  const data = loadData();
  const cfg = state.smartConfig;

  // Prune deckIds that no longer exist
  cfg.deckIds = cfg.deckIds.filter(id => data.decks.some(d => d.id === id));

  const deckRows = data.decks.length === 0
    ? `<div class="smart-empty">
        ${icon('layers-3', 24)}
        <strong>No decks available</strong>
        <button class="btn btn-secondary btn-sm" type="button" data-action="new-deck">${icon('plus', 15)}<span>Create deck</span></button>
      </div>`
    : data.decks.map(d => {
        const due = d.cards.filter(isDue).length;
        const practice = d.cards.filter(c => !isDue(c) && isSmartNeedsPracticeCard(d, c.id)).length;
        const checked = cfg.deckIds.includes(d.id);
        const disabled = d.cards.length === 0;
        return `
          <label class="smart-deck-row ${checked ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}">
            <input class="check-input" type="checkbox" data-action="smart-toggle-deck" data-deck="${d.id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
            <span class="check-control">${icon('check', 13)}</span>
            <div class="smart-row-body">
              <div class="smart-row-title">${esc(d.name)}</div>
              <div class="smart-row-meta">
                <span>${d.cards.length} total</span>
                ${due > 0 ? `<span class="is-emphasis">${due} due</span>` : '<span>Caught up</span>'}
                ${practice > 0 ? `<span>${practice} practice</span>` : ''}
              </div>
            </div>
          </label>`;
      }).join('');

  const techniques = [
    { key: 'typeRecall',      title: 'Typed recall', icon: 'keyboard' },
    { key: 'confidenceCheck', title: 'Confidence check', icon: 'gauge' },
    { key: 'whyPrompt',       title: 'Elaboration prompt', icon: 'message-square-text' },
    { key: 'interleaving',    title: 'Interleaving', icon: 'shuffle' }
  ];

  const techRows = techniques.map(t => `
    <label class="technique-row">
      <span class="technique-icon">${icon(t.icon, 17)}</span>
      <span class="smart-row-title">${t.title}</span>
      <input class="switch-input" type="checkbox" data-action="smart-toggle-technique" data-key="${t.key}" ${cfg.techniques[t.key] ? 'checked' : ''}>
      <span class="switch-control" aria-hidden="true"></span>
    </label>`).join('');

  const durations = [
    { val: 10, label: '10 min' },
    { val: 25, label: '25 min (Pomodoro)' },
    { val: 0,  label: 'No limit' }
  ];
  const durButtons = durations.map(d => `
    <button class="segment-button ${cfg.duration === d.val ? 'is-selected' : ''}" type="button" data-action="smart-set-duration" data-val="${d.val}" aria-pressed="${cfg.duration === d.val}">${d.label}</button>
  `).join('');

  const canStart = cfg.deckIds.length > 0 && data.decks.some(d => cfg.deckIds.includes(d.id) && d.cards.length > 0);
  const selectedDecks = cfg.deckIds.map(id => data.decks.find(deck => deck.id === id)).filter(Boolean);
  const available = canStart ? buildSmartStudyQueue(selectedDecks, cfg) : { queue: [], hasCore: false };
  const selectedDue = selectedDecks.reduce((sum, deck) => sum + deck.cards.filter(isDue).length, 0);
  const durationLabel = cfg.duration === 0 ? 'No limit' : `${cfg.duration} min`;

  return `
    <div class="app-shell">
      ${renderAppBar('smart')}
      <main class="workspace smart-workspace">
        <header class="page-heading">
          <div>
            <p class="page-kicker">Session planner</p>
            <h1>Smart Study</h1>
            <p class="page-subtitle">${cfg.deckIds.length > 0 ? `${cfg.deckIds.length} deck${cfg.deckIds.length !== 1 ? 's' : ''} selected.` : 'Select the decks for this session.'}</p>
          </div>
        </header>

        <div class="smart-config-grid">
          <section class="config-section" aria-labelledby="smart-decks-title">
            <div class="config-heading">
              <div>
                <span class="config-step">1</span>
                <h2 id="smart-decks-title">Choose decks</h2>
              </div>
              <span>${cfg.deckIds.length} selected</span>
            </div>
            <div class="smart-deck-list">${deckRows}</div>
          </section>

          <div class="smart-options">
            <aside class="session-plan" aria-label="Session plan">
              <div class="session-plan-heading">
                <span>${icon('sparkles', 18)}</span>
                <div><strong>${canStart ? 'Session ready' : 'Session plan'}</strong><span>${canStart ? (available.hasCore ? 'Scheduled review' : 'Practice round') : 'Choose decks to begin'}</span></div>
              </div>
              <dl class="session-plan-stats">
                <div><dt>Decks</dt><dd>${selectedDecks.length}</dd></div>
                <div><dt>Cards</dt><dd>${available.queue.length}</dd></div>
                <div><dt>Due</dt><dd>${selectedDue}</dd></div>
                <div><dt>Length</dt><dd>${durationLabel}</dd></div>
              </dl>
              <button class="btn btn-smart btn-lg" type="button" data-action="smart-start" ${canStart ? '' : 'disabled'}>${icon('play', 18)}<span>Start session</span></button>
              ${!canStart ? `<p class="smart-hint">Select at least one deck with cards.</p>` : ''}
            </aside>

            <section class="config-section" aria-labelledby="smart-techniques-title">
              <div class="config-heading">
                <div>
                  <span class="config-step">2</span>
                  <h2 id="smart-techniques-title">Techniques</h2>
                </div>
              </div>
              <div class="technique-list">${techRows}</div>
            </section>

            <section class="config-section" aria-labelledby="smart-duration-title">
              <div class="config-heading">
                <div>
                  <span class="config-step">3</span>
                  <h2 id="smart-duration-title">Session length</h2>
                </div>
              </div>
              <div class="segmented-control" aria-label="Session length">${durButtons}</div>
            </section>
          </div>
        </div>
      </main>
    </div>`;
}

// ===== SMART STUDY: SESSION START =====
function startSmartStudy() {
  const cfg = state.smartConfig;
  saveSmartConfig();
  const breakUntil = getSmartPomodoroBreakUntil();
  if (cfg.duration === SMART_POMODORO_DURATION_MINUTES && breakUntil > Date.now()) {
    state.smart = {
      queue: [],
      index: 0,
      phase: 'break',
      startTime: Date.now(),
      durationMs: 0,
      timeUp: true,
      breakStartTime: breakUntil - SMART_POMODORO_BREAK_MINUTES * 60 * 1000,
      breakDurationMs: SMART_POMODORO_BREAK_MINUTES * 60 * 1000,
      breakDone: false,
      sessionStats: { reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 },
      perDeck: {},
      requeues: {},
      sessionSaved: true
    };
    startSmartBreakTimer();
    nav('smart-study', undefined, '.completion-title', 'Pomodoro break resumed.');
    return;
  }

  const data = loadData();
  const selectedDecks = cfg.deckIds
    .map(id => data.decks.find(d => d.id === id))
    .filter(Boolean);

  let legacyBlocksCleared = false;
  selectedDecks.forEach(d => { legacyBlocksCleared = clearLegacySmartBlocks(d) || legacyBlocksCleared; });
  const { queue, mode } = buildSmartStudyQueue(selectedDecks, cfg);

  if (!queue.length) {
    if (legacyBlocksCleared) saveData(data);
    alert('No cards in the selected decks.');
    return;
  }

  selectedDecks.forEach(d => { d.smartSessionSeq = (d.smartSessionSeq || 0) + 1; });
  saveData(data);

  state.smart = {
    queue,
    mode,
    index: 0,
    phase: 'asking', // 'asking' | 'reviewing'
    typedAnswer: '',
    similarity: null,
    confidenceLevel: null,
    elaboration: '',
    startTime: Date.now(),
    durationMs: cfg.duration > 0 ? cfg.duration * 60 * 1000 : 0,
    timeUp: false,
    sessionStats: { reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 },
    perDeck: {},
    requeues: {},
    sessionSaved: false
  };

  startSmartTimer();
  const firstFocus = cfg.techniques.typeRecall ? '#smart-answer-input' : '.smart-card-front';
  nav('smart-study', undefined, firstFocus, `Smart Study started. ${queue.length} card${queue.length !== 1 ? 's' : ''} in this session.`);
}

function stopSmartTimer() {
  if (state.smartTimerId) { clearInterval(state.smartTimerId); state.smartTimerId = null; }
}

function startSmartTimer() {
  stopSmartTimer();
  const s = state.smart;
  if (!s || !s.durationMs) return;
  state.smartTimerId = setInterval(() => {
    const sm = state.smart;
    if (!sm || state.view !== 'smart-study') { stopSmartTimer(); return; }
    const remaining = sm.durationMs - (Date.now() - sm.startTime);
    if (remaining <= 0) {
      stopSmartTimer();
      saveSmartSessionsIfNeeded();
      if (state.smartConfig.duration === SMART_POMODORO_DURATION_MINUTES) startSmartBreak();
      else sm.timeUp = true;
      render('.completion-title');
      announceStatus(state.smartConfig.duration === SMART_POMODORO_DURATION_MINUTES
        ? 'Focus block complete. Pomodoro break started.'
        : 'Smart Study session complete.');
      return;
    }
    const el = document.getElementById('smart-timer-value');
    if (el) {
      const min = Math.floor(remaining / 60000);
      const sec = Math.floor((remaining % 60000) / 1000);
      el.textContent = `${min}:${String(sec).padStart(2, '0')}`;
    }
  }, 500);
}

function startSmartBreak() {
  const s = state.smart;
  if (!s) return;
  s.timeUp = true;
  s.breakStartTime = Date.now();
  s.breakDurationMs = SMART_POMODORO_BREAK_MINUTES * 60 * 1000;
  s.breakDone = false;
  setSmartPomodoroBreakUntil(s.breakStartTime + s.breakDurationMs);
  startSmartBreakTimer();
}

function startSmartBreakTimer() {
  stopSmartTimer();
  const s = state.smart;
  if (!s || !s.breakDurationMs || s.breakDone) return;
  state.smartTimerId = setInterval(() => {
    const sm = state.smart;
    if (!sm || state.view !== 'smart-study') { stopSmartTimer(); return; }
    const remaining = smartBreakRemainingMs(sm);
    if (remaining <= 0) {
      sm.breakDone = true;
      setSmartPomodoroBreakUntil(0);
      stopSmartTimer();
      render('.completion-title');
      announceStatus('Break complete. You can start the next session.');
      return;
    }
    const el = document.getElementById('smart-break-timer');
    if (el) el.textContent = fmtMs(remaining);
    const progressValue = smartBreakProgress(sm);
    const ring = document.querySelector('.smart-break-ring-fill');
    if (ring) ring.style.setProperty('--break-progress', progressValue);
    const progressBar = document.querySelector('.smart-break-ring');
    if (progressBar) progressBar.setAttribute('aria-valuenow', String(Math.round(progressValue * 100)));
  }, 500);
}

function smartBreakRemainingMs(s) {
  return Math.max(0, (s.breakDurationMs || 0) - (Date.now() - (s.breakStartTime || Date.now())));
}

function smartBreakProgress(s) {
  if (!s.breakDurationMs) return 1;
  return Math.min(1, Math.max(0, 1 - smartBreakRemainingMs(s) / s.breakDurationMs));
}

function fmtMs(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function fmtSmartTimer(startTime, durationMs) {
  const remaining = Math.max(0, durationMs - (Date.now() - startTime));
  return fmtMs(remaining);
}

function updateSmartPracticeState(deck, cardId, gradeKey) {
  if (!deck.cardStats) deck.cardStats = {};
  const cs = deck.cardStats[cardId] || { reviews: 0, again: 0, hard: 0 };

  delete cs.smartBlockedUntil;
  delete cs.smartSkipUntilSession;
  cs.smartLastGrade = gradeKey;
  cs.smartLastReviewedSession = deck.smartSessionSeq || 0;

  if (SMART_NEEDS_PRACTICE_GRADES.has(gradeKey)) cs.smartNeedsPractice = true;
  else delete cs.smartNeedsPractice;

  deck.cardStats[cardId] = cs;
  return cs;
}

// ===== SMART STUDY: VIEW =====
function renderSmartStudy() {
  const s = state.smart;
  if (!s) { state.view = 'smart-setup'; return renderSmartSetup(); }

  if (s.timeUp && s.breakStartTime) return renderSmartBreak();

  const data = loadData();

  // Skip missing cards (e.g. deleted between sessions) without recursion
  while (s.index < s.queue.length) {
    const it = s.queue[s.index];
    const dk = data.decks.find(d => d.id === it.deckId);
    if (dk && dk.cards.find(c => c.id === it.cardId)) break;
    s.index++;
  }

  const total = s.queue.length;
  if (s.index >= total || s.timeUp) return renderSmartDone();

  const item = s.queue[s.index];
  const deck = data.decks.find(d => d.id === item.deckId);
  const card = deck.cards.find(c => c.id === item.cardId);

  const cfg = state.smartConfig;
  const ss = s.sessionStats;
  const pct = Math.round((s.index / total) * 100);

  const timerHtml = s.durationMs > 0
    ? `<span class="smart-timer" aria-live="off">${icon('timer', 13)}<span id="smart-timer-value">${fmtSmartTimer(s.startTime, s.durationMs)}</span></span>`
    : '';

  let body = '';

  if (s.phase === 'asking') {
    let confidenceUI = '';
    if (cfg.techniques.confidenceCheck) {
      const lvl = s.confidenceLevel;
      confidenceUI = `
        <div class="smart-confidence" role="group" aria-labelledby="smart-confidence-label">
          <p class="smart-prompt" id="smart-confidence-label">Confidence</p>
          <div class="smart-conf-buttons">
            <button class="segment-button ${lvl === 'low' ? 'is-selected' : ''}" type="button" data-action="smart-confidence" data-val="low" aria-pressed="${lvl === 'low'}">Not sure</button>
            <button class="segment-button ${lvl === 'medium' ? 'is-selected' : ''}" type="button" data-action="smart-confidence" data-val="medium" aria-pressed="${lvl === 'medium'}">Maybe</button>
            <button class="segment-button ${lvl === 'high' ? 'is-selected' : ''}" type="button" data-action="smart-confidence" data-val="high" aria-pressed="${lvl === 'high'}">Confident</button>
          </div>
        </div>`;
    }

    let answerUI;
    if (cfg.techniques.typeRecall) {
      answerUI = `
        <div class="smart-answer-area">
          <label class="field-label" for="smart-answer-input">Your answer</label>
          <textarea id="smart-answer-input" class="textarea smart-answer-input" rows="3" placeholder="Type your answer" aria-describedby="smart-question-content">${esc(s.typedAnswer)}</textarea>
          <div class="smart-answer-actions">
            <button class="btn btn-primary" type="button" data-action="smart-check">${icon('check', 17)}<span>Check answer</span></button>
            <button class="btn btn-quiet btn-sm" type="button" data-action="smart-skip">I don't know</button>
          </div>
        </div>`;
    } else {
      answerUI = `<div class="show-answer-wrap"><button class="btn btn-primary btn-lg" type="button" data-action="smart-reveal">${icon('eye', 18)}<span>Reveal answer</span></button></div>`;
    }

    body = `
      <div class="smart-session-meta">
        <span class="smart-deck-tag">${icon('book-open', 13)}${esc(deck.name)}</span>
        <span>${s.mode === 'practice' ? 'Practice' : 'Scheduled review'}</span>
      </div>
      <section class="smart-card-block smart-card-front" tabindex="-1" aria-labelledby="smart-question-label" aria-describedby="smart-question-content">
        <div class="card-side-label" id="smart-question-label">Question</div>
        <div class="card-content" id="smart-question-content">${esc(card.front)}</div>
      </section>
      ${confidenceUI}
      ${answerUI}
    `;
  } else {
    // Reviewing phase
    let feedback = '';
    if (cfg.techniques.typeRecall && s.similarity !== null) {
      const band = similarityBand(s.similarity);
      const pct2 = Math.round(s.similarity * 100);
      feedback = `
        <div class="smart-feedback smart-feedback-${band.band}">
          <div class="smart-feedback-score"><span>${band.label}</span><strong>${pct2}% match</strong></div>
          <div class="smart-feedback-row"><span class="smart-feedback-label">You wrote:</span><span class="smart-feedback-text">${s.typedAnswer ? esc(s.typedAnswer) : '<em class="muted">(skipped)</em>'}</span></div>
          <div class="smart-feedback-row"><span class="smart-feedback-label">Correct:</span><span class="smart-feedback-text smart-feedback-correct">${esc(card.back)}</span></div>
        </div>`;
    }

    let confFeedback = '';
    if (cfg.techniques.confidenceCheck && s.confidenceLevel) {
      const calibrated = s.similarity !== null ? calibrationMatch(s.confidenceLevel, s.similarity) : null;
      const calLabel = calibrated === null ? '' : (calibrated ? 'well calibrated' : 'mismatch &mdash; recalibrate next time');
      confFeedback = `
        <div class="smart-calibration ${calibrated === null ? '' : (calibrated ? 'is-good' : 'is-off')}">
          ${icon(calibrated ? 'check-circle-2' : 'gauge', 16)}
          <span>Confidence: <strong>${s.confidenceLevel}</strong>${calLabel ? ' &middot; ' + calLabel : ''}</span>
        </div>`;
    }

    let whyPrompt = '';
    if (cfg.techniques.whyPrompt) {
      whyPrompt = `
        <div class="smart-why">
          <label class="field-label" for="smart-why-input">Why is this correct? <span class="muted">(optional)</span></label>
          <textarea id="smart-why-input" class="textarea" rows="2" placeholder="Add a short explanation">${esc(s.elaboration)}</textarea>
        </div>`;
    }

    const suggested = s.similarity !== null ? similarityBand(s.similarity).suggested : null;
    const labels = ['Again', 'Hard', 'Good', 'Easy'];
    const rateBtns = [0, 1, 2, 3].map(g => `
      <button class="rating-button rating-${labels[g].toLowerCase()} ${suggested === g ? 'is-suggested' : ''}" type="button" data-action="smart-rate" data-grade="${g}">
        <span>${labels[g]}</span>
        ${suggested === g ? '<strong class="suggested-label">Suggested</strong>' : '<strong>Rate</strong>'}
      </button>`).join('');

    body = `
      <div class="smart-session-meta">
        <span class="smart-deck-tag">${icon('book-open', 13)}${esc(deck.name)}</span>
        <span>Review answer</span>
      </div>
      <div class="smart-card-pair">
        <section class="smart-card-block smart-card-front compact" tabindex="-1" aria-label="Question">
          <div class="card-side-label">Question</div>
          <div class="card-content">${esc(card.front)}</div>
        </section>
        <section class="smart-card-block smart-card-back" tabindex="-1" aria-label="Answer">
          <div class="card-side-label">Answer</div>
          <div class="card-content">${esc(card.back)}</div>
        </section>
      </div>
      ${feedback}
      ${confFeedback}
      ${whyPrompt}
      <div class="rating-buttons smart-rating-buttons" role="group" aria-label="Rate this answer">${rateBtns}</div>
    `;
  }

  return `
    <div class="study-shell smart-study-shell">
      ${renderStudyHeader('Smart Study', pct, `${s.index + 1} of ${total}`, timerHtml)}
      <main class="smart-study-main">
        <div class="smart-body">${body}</div>
        ${renderSessionStats(ss)}
      </main>
    </div>`;
}

function renderSmartBreak() {
  const s = state.smart;
  const remaining = smartBreakRemainingMs(s);
  const done = s.breakDone || remaining <= 0;
  if (done) {
    s.breakDone = true;
    setSmartPomodoroBreakUntil(0);
  }
  else startSmartBreakTimer();

  const reviewed = s.sessionStats.reviewed;
  const progress = smartBreakProgress(s);
  const nextDisabled = done ? '' : 'disabled';
  const nextLabel = done ? 'Start next session' : 'Break in progress';

  return `
    <div class="study-shell">
      ${renderStudyHeader('Smart Study', 100, 'Focus block complete')}
      <main class="smart-break-screen">
        <div class="break-icon">${icon(done ? 'check' : 'coffee', 22)}</div>
        <p class="completion-kicker">${done ? 'Ready' : 'Pomodoro break'}</p>
        <h1 class="completion-title" tabindex="-1">${done ? 'Break complete' : 'Pause and reset'}</h1>
        <div class="smart-break-timer-wrap">
          <span id="smart-break-timer" class="smart-break-timer">${fmtMs(remaining)}</span>
          <span class="smart-break-label">${done ? 'Ready for the next round' : 'Remaining'}</span>
          <div class="smart-break-ring" role="progressbar" aria-label="Break progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress * 100)}">
            <div class="smart-break-ring-fill" style="--break-progress:${progress}"></div>
          </div>
        </div>
        <div class="smart-break-meta">${reviewed} card${reviewed !== 1 ? 's' : ''} reviewed in this focus block.</div>
        <div class="smart-done-actions">
          <button class="btn btn-smart" type="button" data-action="smart-break-start-next" ${nextDisabled}>${icon('play', 17)}<span>${nextLabel}</span></button>
          <button class="btn btn-secondary" type="button" data-action="go-home">${icon('library', 17)}<span>Back to library</span></button>
        </div>
      </main>
    </div>`;
}

function renderSmartDone() {
  const s = state.smart;
  const ss = s.sessionStats;
  const total = ss.reviewed;
  const reason = s.timeUp
    ? `Time's up after ${state.smartConfig.duration} minute${state.smartConfig.duration !== 1 ? 's' : ''}.`
    : `You went through all ${s.queue.length} card${s.queue.length !== 1 ? 's' : ''}.`;

  const data = loadData();
  const selectedDecks = state.smartConfig.deckIds
    .map(id => data.decks.find(d => d.id === id))
    .filter(Boolean);
  const nextAvailability = buildSmartStudyQueue(selectedDecks, state.smartConfig);
  const canStartNext = nextAvailability.queue.length > 0;
  const nextLabel = nextAvailability.hasCore ? 'New Smart Session' : 'Practice Anyway';

  return `
    <div class="study-shell">
      ${renderStudyHeader('Smart Study', 100, `${total} reviewed`)}
      <main class="study-done" tabindex="-1">
        <div class="completion-mark">${icon('sparkles', 23)}</div>
        <p class="completion-kicker">Smart Study complete</p>
        <h1 class="completion-title" tabindex="-1">${total} card${total !== 1 ? 's' : ''} reviewed</h1>
        <p class="completion-note">${reason}</p>
        ${renderSessionStats(ss, 'session-stats-done')}
        <div class="smart-done-actions">
          ${canStartNext ? `<button class="btn btn-smart" type="button" data-action="smart-restart">${icon('rotate-ccw', 17)}<span>${nextLabel}</span></button>` : ''}
          <button class="btn btn-secondary" type="button" data-action="smart-tweak">${icon('settings-2', 17)}<span>Adjust setup</span></button>
          <button class="btn btn-quiet" type="button" data-action="go-home">Back to library</button>
        </div>
      </main>
    </div>`;
}

// ===== SMART STUDY: ACTIONS =====
function smartSetConfidence(level) {
  if (!state.smart) return;
  // Capture current textarea value before re-render
  const inp = document.getElementById('smart-answer-input');
  if (inp) state.smart.typedAnswer = inp.value;
  state.smart.confidenceLevel = level;
  render();
}

function smartCheckAnswer() {
  const s = state.smart;
  if (!s || s.phase !== 'asking') return;
  const inp = document.getElementById('smart-answer-input');
  if (inp) s.typedAnswer = inp.value;
  const data = loadData();
  const item = s.queue[s.index];
  const deck = data.decks.find(d => d.id === item.deckId);
  const card = deck && deck.cards.find(c => c.id === item.cardId);
  if (!card) return;
  s.similarity = answerSimilarity(s.typedAnswer, card.back);
  s.phase = 'reviewing';
  render('.smart-card-back');
  announceStatus('Answer checked. Review the feedback, then choose a rating.');
}

function smartSkip() {
  const s = state.smart;
  if (!s || s.phase !== 'asking') return;
  s.typedAnswer = '';
  s.similarity = 0;
  s.phase = 'reviewing';
  render('.smart-card-back');
  announceStatus('Answer revealed. Review the feedback, then choose a rating.');
}

function smartReveal() {
  const s = state.smart;
  if (!s || s.phase !== 'asking') return;
  s.similarity = null;
  s.phase = 'reviewing';
  render('.smart-card-back');
  announceStatus('Answer revealed. Choose a rating.');
}

function smartQueueKey(item) {
  return `${item.deckId}:${item.cardId}`;
}

function shouldRequeueSmartCard(grade, requeueCount) {
  const statKeys = ['again', 'hard', 'good', 'easy'];
  const key = statKeys[grade];
  return requeueCount < (SMART_REQUEUE_LIMITS[key] || 0);
}

function smartRateCard(grade) {
  const s = state.smart;
  if (!s || s.timeUp || s.phase !== 'reviewing') return;
  const item = s.queue[s.index];

  const statKeys = ['again', 'hard', 'good', 'easy'];
  const gradeKey = statKeys[grade];
  const queueKey = smartQueueKey(item);
  const requeueCount = s.requeues[queueKey] || 0;
  const willRequeue = shouldRequeueSmartCard(grade, requeueCount);

  s.sessionStats.reviewed++;
  s.sessionStats[gradeKey]++;

  // Per-deck tally for session log
  const dt = s.perDeck[item.deckId] || { reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 };
  dt.reviewed++;
  dt[gradeKey]++;
  s.perDeck[item.deckId] = dt;

  // Apply FSRS + stats
  const data = loadData();
  const deck = data.decks.find(d => d.id === item.deckId);
  if (deck) {
    const cardIdx = deck.cards.findIndex(c => c.id === item.cardId);
    if (cardIdx !== -1) deck.cards[cardIdx] = fsrs(deck.cards[cardIdx], grade);
    if (!deck.cardStats) deck.cardStats = {};
    const cs = deck.cardStats[item.cardId] || { reviews: 0, again: 0, hard: 0 };
    cs.reviews++;
    if (grade === 0) cs.again++;
    if (grade === 1) cs.hard++;

    // Save elaboration if present
    const whyInp = document.getElementById('smart-why-input');
    if (whyInp && whyInp.value.trim() && state.smartConfig.techniques.whyPrompt) {
      cs.elaborations = cs.elaborations || [];
      cs.elaborations.push({ date: todayStr(), text: whyInp.value.trim().slice(0, 500) });
      if (cs.elaborations.length > 3) cs.elaborations = cs.elaborations.slice(-3);
    }
    deck.cardStats[item.cardId] = cs;
    updateSmartPracticeState(deck, item.cardId, gradeKey);
    saveData(data);
  }

  // The four rating buttons decide whether a card remains in this Smart Study session.
  // Similarity only suggests a rating; it never removes or repeats a card by itself.
  if (willRequeue) {
    s.requeues[queueKey] = requeueCount + 1;
    s.queue.push({ ...item });
  }

  s.index++;

  // Save sessions if this was the last card
  if (s.index >= s.queue.length) saveSmartSessionsIfNeeded();

  // Reset per-card state
  s.typedAnswer = '';
  s.similarity = null;
  s.confidenceLevel = null;
  s.elaboration = '';
  s.phase = 'asking';
  const complete = s.index >= s.queue.length || s.timeUp;
  const nextFocus = complete
    ? '.completion-title'
    : (state.smartConfig.techniques.typeRecall ? '#smart-answer-input' : '.smart-card-front');
  render(nextFocus);
  announceStatus(complete ? 'Smart Study session complete.' : 'Next Smart Study question.');
}

function saveSmartSessionsIfNeeded() {
  const s = state.smart;
  if (!s || s.sessionSaved) return;
  const data = loadData();
  Object.entries(s.perDeck).forEach(([deckId, stats]) => {
    const d = data.decks.find(dd => dd.id === deckId);
    if (!d) return;
    if (!d.sessions) d.sessions = [];
    d.sessions.push({ date: todayStr(), ...stats, smart: true });
    if (d.sessions.length > 90) d.sessions = d.sessions.slice(-90);
  });
  saveData(data);
  s.sessionSaved = true;
}

// ===== NATIVE STATUS BAR =====
function setupStatusBar() {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  const sb = cap.Plugins && cap.Plugins.StatusBar;
  if (!sb) return;
  // env(safe-area-inset-*) is always 0 in Capacitor's iOS web view, so CSS can't
  // clear the Dynamic Island. Instead, take the status bar out of overlay mode so
  // the native layer insets the web view below the island.
  sb.setOverlaysWebView({ overlay: false });
  syncStatusBarStyle();
}

function syncStatusBarStyle() {
  const cap = window.Capacitor;
  const sb = cap && cap.Plugins && cap.Plugins.StatusBar;
  if (!sb) return;
  const dark = document.body.classList.contains('dark');
  // 'LIGHT' = dark text (for our light theme); 'DARK' = light text (for dark theme).
  sb.setStyle({ style: dark ? 'DARK' : 'LIGHT' });
  // Match the reserved status-bar strip to the theme's base background.
  sb.setBackgroundColor({ color: dark ? '#101416' : '#f6f7f8' });
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  setupStatusBar();
  render();
  bindModalEvents();
  window.addEventListener('resize', () => {
    closeCardActionMenus();
    if (state.view === 'study') adjustFlashcardHeight();
  });
  document.addEventListener('scroll', () => closeCardActionMenus(), true);
});
