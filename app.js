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

function todayStr() {
  return new Date().toISOString().split('T')[0];
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
    ? Math.max(0, (Date.parse(today) - Date.parse(lastReview)) / 86400000)
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
  const due = new Date(today);
  due.setDate(due.getDate() + interval);

  return {
    ...card,
    stability: +newS.toFixed(4),
    difficulty: +newD.toFixed(4),
    interval,
    dueDate: due.toISOString().split('T')[0],
    lastReview: today,
    repetitions: g === 1 ? 0 : (card.repetitions || 0) + 1,
    easeFactor: card.easeFactor || 2.5
  };
}

function fsrsPreviewIntervals(card) {
  const { stability, difficulty, lastReview } = card;
  const today = todayStr();
  const daysSince = lastReview
    ? Math.max(0, (Date.parse(today) - Date.parse(lastReview)) / 86400000)
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

const SMART_SKIP_NEXT_SESSIONS = {
  again: 0,
  hard: 0,
  good: 1,
  easy: 2
};

const SMART_ALWAYS_ELIGIBLE_GRADES = new Set(['again', 'hard']);
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

// ===== ROUTING =====
function nav(view, deckId) {
  if (state.view === 'smart-study' && view !== 'smart-study') stopSmartTimer();
  state.view = view;
  if (deckId !== undefined) state.deckId = deckId;
  state.filter = '';
  state.flipped = false;
  render();
}

// ===== RENDER DISPATCHER =====
function render() {
  const app = document.getElementById('app');
  if (state.view === 'home') app.innerHTML = renderHome();
  else if (state.view === 'browse') app.innerHTML = renderBrowse();
  else if (state.view === 'study') app.innerHTML = renderStudy();
  else if (state.view === 'smart-setup') app.innerHTML = renderSmartSetup();
  else if (state.view === 'smart-study') app.innerHTML = renderSmartStudy();
  bindEvents();
  if (state.view === 'study') adjustFlashcardHeight();
  if (state.view === 'smart-study') focusSmartInputs();
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
  let maxH = 0;
  card.querySelectorAll('.flashcard-face').forEach(face => {
    const clone = face.cloneNode(true);
    clone.style.cssText = `position:fixed;top:-9999px;left:-9999px;right:auto;bottom:auto;width:${cardWidth}px;transform:none;visibility:hidden;backface-visibility:visible;-webkit-backface-visibility:visible;`;
    document.body.appendChild(clone);
    maxH = Math.max(maxH, clone.offsetHeight);
    document.body.removeChild(clone);
  });
  if (maxH > 0) card.style.minHeight = maxH + 'px';
}

// ===== HOME VIEW =====
function renderHome() {
  const data = loadData();

  const deckItems = data.decks.map((deck, i) => {
    const due = deck.cards.filter(c => isDue(c)).length;
    const total = deck.cards.length;
    const sessions = deck.sessions || [];
    const lastSession = sessions[sessions.length - 1];
    const streakDays = calcStreak(sessions);
    const streakHtml = streakDays > 1
      ? `<span style="color:var(--good);font-weight:600">${streakDays}d streak</span> &middot; `
      : '';
    const lastHtml = lastSession
      ? `${streakHtml}Last: ${lastSession.date} &middot; ${lastSession.reviewed} reviewed`
      : '';
    const badge = due > 0
      ? `<span class="due-badge" title="${due} due">${due}</span>`
      : `<span class="due-badge due-badge-zero" title="All caught up">&#10003;</span>`;
    return `
      <article class="deck-card" style="--i:${i}">
        <div class="deck-card-head">
          <h2 class="deck-name">${esc(deck.name)}</h2>
          ${badge}
        </div>
        <div class="deck-stats">${total} card${total !== 1 ? 's' : ''}${lastHtml ? ' &middot; ' + lastHtml : ''}</div>
        <div class="deck-actions">
          <button class="btn btn-primary btn-sm" data-action="study" data-deck="${deck.id}" ${total === 0 ? 'disabled' : ''}>${due > 0 ? `Study (${due})` : 'Review All'}</button>
          <button class="btn btn-secondary btn-sm" data-action="browse" data-deck="${deck.id}">Browse</button>
          <button class="btn btn-danger btn-sm" data-action="delete-deck" data-deck="${deck.id}">Delete</button>
        </div>
      </article>`;
  }).join('');

  const body = data.decks.length === 0
    ? `<div class="empty-state"><p>No decks yet &mdash; plant your first one.</p><button class="btn btn-primary" data-action="new-deck">Create Deck</button></div>`
    : `<div class="deck-grid">${deckItems}</div>`;

  return `
    <div class="page">
      <div class="home-hero">
        <div class="hero-text">
          <p class="hero-eyebrow">Evidence-based learning</p>
          <h1 class="hero-title">smart<em>L3arn</em></h1>
        </div>
        <div class="header-actions">
          <button class="btn btn-smart" data-action="smart-open-setup" title="Evidence-based learning techniques">Smart Study</button>
          <button class="btn btn-primary" data-action="new-deck">New Deck</button>
          <label class="btn btn-secondary" style="cursor:pointer">
            Import JSON
            <input type="file" accept=".json" data-action="import-deck" style="display:none">
          </label>
          <label class="btn btn-secondary" style="cursor:pointer">
            Import TXT / CSV
            <input type="file" accept=".txt,.csv,.tsv" data-action="import-txt" style="display:none">
          </label>
          ${data.decks.length ? '<button class="btn btn-secondary" data-action="export-all">Export All</button>' : ''}
          ${themeBtn()}
        </div>
      </div>
      ${body}
    </div>`;
}

function calcStreak(sessions) {
  if (!sessions || sessions.length === 0) return 0;
  const today = todayStr();
  let streak = 0;
  let expected = today;
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].date === expected) {
      streak++;
      const d = new Date(expected);
      d.setDate(d.getDate() - 1);
      expected = d.toISOString().split('T')[0];
    } else {
      break;
    }
  }
  return streak;
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
    const arrow = active ? (state.sortDir === 'asc' ? '&#9650;' : '&#9660;') : '&#9651;';
    return `<th data-sort="${col}" class="${active ? 'sorted' : ''}">${label} <span class="sort-arrow">${arrow}</span></th>`;
  }

  const cardStats = deck.cardStats || {};

  const rows = cards.map(c => {
    const due = c.dueDate || 'New';
    const overdue = c.dueDate && c.dueDate < today;
    const isNew = !c.dueDate || c.repetitions === 0;
    const dueLabel = isNew
      ? `<span class="tag-new">New</span>`
      : `<span class="${overdue ? 'overdue' : ''}">${c.dueDate}</span>`;
    const cs = cardStats[c.id];
    const diffLabel = c.difficulty
      ? `<span class="diff-pill diff-${diffLevel(c.difficulty)}" title="FSRS difficulty ${c.difficulty.toFixed(1)}">${c.difficulty.toFixed(1)}</span>`
      : '<span style="color:var(--text-muted)">-</span>';
    const hardRate = cs && cs.reviews > 0
      ? Math.round((cs.again / cs.reviews) * 100) + '%'
      : '-';
    return `
      <tr>
        <td class="td-front">
          <span class="cell-edit" contenteditable="true" data-field="front" data-card="${c.id}" title="${esc(c.front)}">${esc(c.front)}</span>
        </td>
        <td class="td-back">
          <span class="cell-edit" contenteditable="true" data-field="back" data-card="${c.id}" title="${esc(c.back)}">${esc(c.back)}</span>
        </td>
        <td class="td-meta">${dueLabel}</td>
        <td class="td-meta">${c.interval > 0 ? c.interval + 'd' : '-'}</td>
        <td class="td-meta">${diffLabel}</td>
        <td class="td-meta">${hardRate}</td>
        <td class="td-actions">
          <button class="btn btn-secondary btn-sm" data-action="edit-card" data-card="${c.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-action="delete-card" data-card="${c.id}">Del</button>
        </td>
      </tr>`;
  }).join('');

  const emptyRow = cards.length === 0
    ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">${filter ? 'No cards match your search.' : 'No cards yet. Add your first card!'}</td></tr>`
    : '';

  return `
    <div class="page">
      <div class="header">
        <div class="header-back">
          <button class="btn btn-ghost btn-sm" data-action="go-home">&larr; Home</button>
          <h1 title="${esc(deck.name)}">${esc(deck.name)}</h1>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary btn-sm" data-action="add-card">+ Add Card</button>
          <button class="btn btn-secondary btn-sm" data-action="export-json">Export JSON</button>
          <button class="btn btn-secondary btn-sm" data-action="export-csv">Export CSV</button>
          <button class="btn btn-secondary btn-sm" data-action="export-txt">Export TXT</button>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer">
            Import TXT / CSV
            <input type="file" accept=".txt,.csv,.tsv" data-action="import-csv" style="display:none">
          </label>
          ${themeBtn()}
        </div>
      </div>
      <div class="browse-toolbar">
        <input class="search-input" type="text" placeholder="Search cards..." value="${esc(state.filter)}" data-action="filter-cards">
        <span style="font-size:12px;color:var(--text-muted)">${cards.length} of ${deck.cards.length} cards</span>
      </div>
      <div class="table-wrapper">
        <table>
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
    </div>`;
}

function diffLevel(d) {
  if (d <= 3) return 'easy';
  if (d <= 6) return 'medium';
  return 'hard';
}

// ===== STUDY VIEW =====
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
    const statBar = total > 0 ? `
      <div class="session-stats-done">
        ${ss.again > 0 ? `<span class="sstat sstat-again">${ss.again} Again</span>` : ''}
        ${ss.hard > 0  ? `<span class="sstat sstat-hard">${ss.hard} Hard</span>` : ''}
        ${ss.good > 0  ? `<span class="sstat sstat-good">${ss.good} Good</span>` : ''}
        ${ss.easy > 0  ? `<span class="sstat sstat-easy">${ss.easy} Easy</span>` : ''}
      </div>` : '';

    const hasDue = deck.cards.some(isDue);
    const nextDueDate = !hasDue
      ? deck.cards.filter(c => c.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate
      : null;
    const restartBtn = deck.cards.length > 0
      ? `<button class="btn btn-primary" data-action="restart-study">${hasDue ? 'Study Again' : 'Review All'}</button>`
      + (nextDueDate ? ` <span style="font-size:13px;color:var(--text-muted)">Next due: ${nextDueDate}</span>` : '')
      : '';

    return `
      <div class="study-page">
        <div class="study-header">
          <button class="btn btn-ghost btn-sm" data-action="go-home">&larr; Home</button>
          <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:100%"></div></div>
          <span class="progress-label">${total} reviewed</span>
          ${themeBtn()}
        </div>
        <div class="study-done">
          <h2>Session complete!</h2>
          <p>You reviewed ${total} card${total !== 1 ? 's' : ''}.</p>
          ${statBar}
          <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;align-items:center">
            ${restartBtn}
            <button class="btn btn-secondary" data-action="go-home">Back to Home</button>
          </div>
        </div>
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

  // Session stats bar (only after at least 1 card)
  const statsBar = ss.reviewed > 0 ? `
    <div class="session-stats">
      ${ss.again > 0 ? `<span class="sstat sstat-again">&#8635; ${ss.again}</span>` : ''}
      ${ss.hard > 0  ? `<span class="sstat sstat-hard">&#9650; ${ss.hard}</span>` : ''}
      ${ss.good > 0  ? `<span class="sstat sstat-good">&#10003; ${ss.good}</span>` : ''}
      ${ss.easy > 0  ? `<span class="sstat sstat-easy">&#9733; ${ss.easy}</span>` : ''}
    </div>` : '<div class="session-stats"></div>';

  // Predicted intervals for rating buttons
  const intervals = fsrsPreviewIntervals(card);

  const ratingSection = state.flipped ? `
    <div class="rating-buttons">
      <div class="rating-btn-wrap">
        <button class="btn btn-again btn-lg" data-action="rate" data-grade="0">Again</button>
        <span class="rating-label">${intervals[0]}</span>
      </div>
      <div class="rating-btn-wrap">
        <button class="btn btn-hard btn-lg" data-action="rate" data-grade="1">Hard</button>
        <span class="rating-label">${intervals[1]}</span>
      </div>
      <div class="rating-btn-wrap">
        <button class="btn btn-good btn-lg" data-action="rate" data-grade="2">Good</button>
        <span class="rating-label">${intervals[2]}</span>
      </div>
      <div class="rating-btn-wrap">
        <button class="btn btn-easy btn-lg" data-action="rate" data-grade="3">Easy</button>
        <span class="rating-label">${intervals[3]}</span>
      </div>
    </div>` : `
    <div class="show-answer-wrap">
      <button class="btn btn-primary btn-lg" data-action="flip">Show Answer</button>
    </div>`;

  return `
    <div class="study-page">
      <div class="study-header">
        <button class="btn btn-ghost btn-sm" data-action="go-home">&larr; Home</button>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="progress-label">${progressLabel}</span>
        ${themeBtn()}
      </div>
      <div class="flashcard-area">
        <div class="flashcard-scene">
          <div class="flashcard${state.flipped ? ' flipped' : ''}" data-action="flip">
            <div class="flashcard-face flashcard-front">
              <div class="card-side-label">Front</div>
              <div class="card-content">${esc(card.front)}</div>
            </div>
            <div class="flashcard-face flashcard-back">
              <div class="card-side-label">Back</div>
              <div class="card-content">${esc(card.back)}</div>
            </div>
          </div>
          ${!state.flipped ? `<p class="flip-hint">Click card or press Space to reveal</p>` : ''}
        </div>
      </div>
      ${statsBar}
      <div class="study-actions">${ratingSection}</div>
    </div>`;
}

// ===== MODAL =====
function openModal(cardId, deckId) {
  const data = loadData();
  const deck = data.decks.find(d => d.id === deckId);
  const card = cardId ? deck?.cards.find(c => c.id === cardId) : null;

  document.getElementById('modal-title').textContent = card ? 'Edit Card' : 'Add Card';
  document.getElementById('modal-front').value = card ? card.front : '';
  document.getElementById('modal-back').value = card ? card.back : '';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-front').focus();
  state.editCardId = cardId || null;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  state.editCardId = null;
}

function saveModal() {
  const front = document.getElementById('modal-front').value.trim();
  const back = document.getElementById('modal-back').value.trim();
  if (!front || !back) { alert('Both front and back are required.'); return; }

  const data = loadData();
  const deck = data.decks.find(d => d.id === state.deckId);
  if (!deck) return;

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
  render();
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
        alert(`Imported ${restored.length} deck${restored.length !== 1 ? 's' : ''} from backup.`);
        render();
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
      alert(`Created deck "${deckName}" with ${cards.length} card${cards.length !== 1 ? 's' : ''}.`);
      render();
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
      alert(`Imported ${parsed.length} card${parsed.length !== 1 ? 's' : ''}.`);
      render();
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
      alert(`Created deck "${deckName}" with ${parsed.length} card${parsed.length !== 1 ? 's' : ''}.`);
      render();
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
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (state.sortCol === col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortCol = col; state.sortDir = 'asc'; }
      render();
    });
  });

  if (state.view === 'study') {
    document.addEventListener('keydown', studyKeydown, { once: true });
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
    document.addEventListener('keydown', smartKeydown, { once: true });
  }
}

function smartKeydown(e) {
  const s = state.smart;
  if (!s || state.view !== 'smart-study') return;
  if (s.timeUp) {
    document.addEventListener('keydown', smartKeydown, { once: true });
    return;
  }
  // Reviewing phase: 1-4 to rate
  if (s.phase === 'reviewing') {
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
      // Allow typing in elaboration; rebind for next event
      document.addEventListener('keydown', smartKeydown, { once: true });
      return;
    }
    if (e.key === '1') { e.preventDefault(); smartRateCard(0); return; }
    if (e.key === '2') { e.preventDefault(); smartRateCard(1); return; }
    if (e.key === '3') { e.preventDefault(); smartRateCard(2); return; }
    if (e.key === '4') { e.preventDefault(); smartRateCard(3); return; }
  }
  document.addEventListener('keydown', smartKeydown, { once: true });
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
  else if (action === 'flip') { state.flipped = !state.flipped; render(); }
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
    render();
  } else if (e.target.id === 'smart-answer-input' && state.smart) {
    state.smart.typedAnswer = e.target.value;
  } else if (e.target.id === 'smart-why-input' && state.smart) {
    state.smart.elaboration = e.target.value;
  }
}

function studyKeydown(e) {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (!state.flipped) { state.flipped = true; render(); }
  } else if (state.flipped) {
    if (e.key === '1') rateCard(0);
    else if (e.key === '2') rateCard(1);
    else if (e.key === '3') rateCard(2);
    else if (e.key === '4') rateCard(3);
    else document.addEventListener('keydown', studyKeydown, { once: true });
  } else {
    document.addEventListener('keydown', studyKeydown, { once: true });
  }
}

// ===== ACTIONS =====
function createDeck() {
  document.getElementById('deck-modal-name').value = '';
  document.getElementById('deck-modal-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('deck-modal-name').focus(), 50);
}

function saveDeckModal() {
  const name = document.getElementById('deck-modal-name').value.trim();
  if (!name) return;
  closeDeckModal();
  const data = loadData();
  data.decks.push({ id: genId(), name, cards: [] });
  saveData(data);
  render();
}

function closeDeckModal() {
  document.getElementById('deck-modal-overlay').classList.add('hidden');
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

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // Build two priority groups: overdue cards come before today's due cards.
  // Within each group sort by difficulty (hardest first) then shuffle to avoid memorizing order.
  const overdueIds = deck.cards
    .filter(c => isDue(c) && c.dueDate && c.dueDate < today)
    .sort((a, b) => (b.difficulty || 5) - (a.difficulty || 5))
    .map(c => c.id);
  shuffle(overdueIds);

  const todayIds = deck.cards
    .filter(c => isDue(c) && (!c.dueDate || c.dueDate === today))
    .sort((a, b) => (b.difficulty || 5) - (a.difficulty || 5))
    .map(c => c.id);
  shuffle(todayIds);

  let mainQueue = [...overdueIds, ...todayIds];
  if (mainQueue.length === 0) {
    mainQueue = deck.cards.map(c => c.id);
    shuffle(mainQueue);
  }
  state.studyQueue = mainQueue;
  state.learningQueue = [];
  state.studyPhase = 'main';
  state.studyIndex = 0;
  state.flipped = false;
  state.sessionStats = { reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 };
  nav('study', deckId);
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

    // Save session summary when session ends
    const nextIndex = state.studyIndex + 1;
    const isLastMain    = isMain && nextIndex >= state.studyQueue.length && (grade !== 0 || state.learningQueue.length === 0);
    const isLastLearning = !isMain && nextIndex >= state.learningQueue.length;
    if (isLastMain || isLastLearning) {
      if (!deck.sessions) deck.sessions = [];
      const ss = state.sessionStats;
      deck.sessions.push({
        date: todayStr(),
        reviewed: ss.reviewed + 1, // +1 for this card not yet incremented
        again: ss.again,
        hard: ss.hard,
        good: ss.good,
        easy: ss.easy
      });
      // Keep last 90 sessions
      if (deck.sessions.length > 90) deck.sessions = deck.sessions.slice(-90);
    }

    saveData(data);
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

  state.flipped = false;
  render();
}

// ===== MODAL EVENTS =====
function bindModalEvents() {
  document.getElementById('modal-save').onclick = saveModal;
  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-overlay').onclick = e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  };
  document.getElementById('modal-front').addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); document.getElementById('modal-back').focus(); }
  });

  document.getElementById('deck-modal-save').onclick = saveDeckModal;
  document.getElementById('deck-modal-cancel').onclick = closeDeckModal;
  document.getElementById('deck-modal-close').onclick = closeDeckModal;
  document.getElementById('deck-modal-overlay').onclick = e => {
    if (e.target === document.getElementById('deck-modal-overlay')) closeDeckModal();
  };
  document.getElementById('deck-modal-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveDeckModal();
    if (e.key === 'Escape') closeDeckModal();
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
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = isDark() ? 'Light' : 'Dark';
}

function themeBtn() {
  return `<button class="btn btn-secondary btn-sm" id="btn-theme" data-action="toggle-dark">${isDark() ? 'Light' : 'Dark'}</button>`;
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

// ===== SMART STUDY: SETUP VIEW =====
function renderSmartSetup() {
  const data = loadData();
  const cfg = state.smartConfig;

  // Prune deckIds that no longer exist
  cfg.deckIds = cfg.deckIds.filter(id => data.decks.some(d => d.id === id));

  const deckRows = data.decks.length === 0
    ? `<div class="smart-empty">No decks yet. Go back and create one first.</div>`
    : data.decks.map(d => {
        const due = d.cards.filter(isDue).length;
        const checked = cfg.deckIds.includes(d.id);
        const disabled = d.cards.length === 0;
        return `
          <label class="smart-row ${disabled ? 'is-disabled' : ''}">
            <input type="checkbox" data-action="smart-toggle-deck" data-deck="${d.id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
            <div class="smart-row-body">
              <div class="smart-row-title">${esc(d.name)}</div>
              <div class="smart-row-meta">${due > 0 ? `<span class="due-badge">${due}</span> due &middot; ` : ''}${d.cards.length} total</div>
            </div>
          </label>`;
      }).join('');

  const techniques = [
    { key: 'typeRecall',      title: 'Active Recall (Typing)',  desc: 'Type the answer instead of just thinking it. Forces real retrieval &mdash; strongest single learning boost (Roediger & Karpicke).' },
    { key: 'confidenceCheck', title: 'Confidence Calibration',  desc: 'Predict certainty before revealing. Trains metacognition; reveals overconfidence early.' },
    { key: 'whyPrompt',       title: 'Elaborative Why-Prompt',  desc: 'After review, briefly state WHY it is correct. Self-explanation deepens encoding (Chi et al.).' },
    { key: 'interleaving',    title: 'Interleaving',            desc: 'Round-robin cards from selected decks. Improves discrimination, builds flexible recall (Rohrer & Pashler).' }
  ];

  const techRows = techniques.map(t => `
    <label class="smart-row">
      <input type="checkbox" data-action="smart-toggle-technique" data-key="${t.key}" ${cfg.techniques[t.key] ? 'checked' : ''}>
      <div class="smart-row-body">
        <div class="smart-row-title">${t.title}</div>
        <div class="smart-row-desc">${t.desc}</div>
      </div>
    </label>`).join('');

  const durations = [
    { val: 10, label: '10 min' },
    { val: 25, label: '25 min (Pomodoro)' },
    { val: 0,  label: 'No limit' }
  ];
  const durButtons = durations.map(d => `
    <button class="btn ${cfg.duration === d.val ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="smart-set-duration" data-val="${d.val}">${d.label}</button>
  `).join('');

  const canStart = cfg.deckIds.length > 0 && data.decks.some(d => cfg.deckIds.includes(d.id) && d.cards.length > 0);

  return `
    <div class="page">
      <div class="header">
        <div class="header-back">
          <button class="btn btn-ghost btn-sm" data-action="go-home">&larr; Home</button>
          <h1>Smart Study</h1>
        </div>
        <div class="header-actions">${themeBtn()}</div>
      </div>
      <p class="smart-intro">
        Combine evidence-based techniques: active recall, spacing (FSRS), interleaving, and metacognition for faster long-term retention.
      </p>

      <div class="smart-section">
        <div class="smart-section-title">Decks</div>
        <div class="smart-list">${deckRows}</div>
      </div>

      <div class="smart-section">
        <div class="smart-section-title">Techniques</div>
        <div class="smart-list">${techRows}</div>
      </div>

      <div class="smart-section">
        <div class="smart-section-title">Session length</div>
        <div class="smart-duration">${durButtons}</div>
      </div>

      <div class="smart-start-wrap">
        <button class="btn btn-smart btn-lg" data-action="smart-start" ${canStart ? '' : 'disabled'}>Start Smart Study</button>
        ${!canStart ? `<div class="smart-hint">Pick at least one deck with due cards.</div>` : ''}
      </div>
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
    nav('smart-study');
    return;
  }

  const data = loadData();
  const selectedDecks = cfg.deckIds
    .map(id => data.decks.find(d => d.id === id))
    .filter(Boolean);

  selectedDecks.forEach(d => { d.smartSessionSeq = (d.smartSessionSeq || 0) + 1; });
  saveData(data);

  const buckets = selectedDecks
    .map(d => {
      const today = todayStr();
      const eligibleCards = d.cards.filter(c => !isSmartCardBlocked(d, c.id));
      const overdue = eligibleCards.filter(c => isDue(c) && c.dueDate && c.dueDate < today)
        .sort((a, b) => (b.difficulty || 5) - (a.difficulty || 5));
      const todayDue = eligibleCards.filter(c => isDue(c) && (!c.dueDate || c.dueDate === today))
        .sort((a, b) => (b.difficulty || 5) - (a.difficulty || 5));
      const shuf = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
      let cards = [...shuf(overdue), ...shuf(todayDue)];
      if (cards.length === 0) cards = shuf(eligibleCards.slice());
      return { deckId: d.id, cards };
    });

  let queue;
  if (cfg.techniques.interleaving) {
    queue = [];
    let added = true;
    while (added) {
      added = false;
      for (const b of buckets) {
        if (b.cards.length) {
          const c = b.cards.shift();
          queue.push({ deckId: b.deckId, cardId: c.id });
          added = true;
        }
      }
    }
  } else {
    queue = buckets.flatMap(b => b.cards.map(c => ({ deckId: b.deckId, cardId: c.id })));
  }

  if (!queue.length) { alert('No eligible cards in the selected decks. Good/Easy-rated cards may be skipped for upcoming Smart Study sessions.'); return; }

  state.smart = {
    queue,
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
  nav('smart-study');
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
      render();
      return;
    }
    const el = document.getElementById('smart-timer');
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
      render();
      return;
    }
    const el = document.getElementById('smart-break-timer');
    if (el) el.textContent = fmtMs(remaining);
    const ring = document.querySelector('.smart-break-ring-fill');
    if (ring) ring.style.setProperty('--break-progress', smartBreakProgress(sm));
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

function isSmartCardBlocked(deck, cardId) {
  const skipUntilSession = deck.cardStats?.[cardId]?.smartSkipUntilSession || 0;
  return skipUntilSession >= (deck.smartSessionSeq || 0);
}

function markSmartCardExited(deck, cardId, gradeKey) {
  if (!deck.cardStats) deck.cardStats = {};
  const cs = deck.cardStats[cardId] || { reviews: 0, again: 0, hard: 0 };
  if (SMART_ALWAYS_ELIGIBLE_GRADES.has(gradeKey)) {
    delete cs.smartBlockedUntil;
    delete cs.smartSkipUntilSession;
  } else {
    const skippedSessions = SMART_SKIP_NEXT_SESSIONS[gradeKey] || 0;
    if (skippedSessions > 0) cs.smartSkipUntilSession = (deck.smartSessionSeq || 0) + skippedSessions;
    else delete cs.smartSkipUntilSession;
    delete cs.smartBlockedUntil;
  }
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
    ? ` &middot; <span id="smart-timer" class="smart-timer">${fmtSmartTimer(s.startTime, s.durationMs)}</span>`
    : '';

  const statsBar = ss.reviewed > 0 ? `
    <div class="session-stats">
      ${ss.again > 0 ? `<span class="sstat sstat-again">&#8635; ${ss.again}</span>` : ''}
      ${ss.hard > 0  ? `<span class="sstat sstat-hard">&#9650; ${ss.hard}</span>` : ''}
      ${ss.good > 0  ? `<span class="sstat sstat-good">&#10003; ${ss.good}</span>` : ''}
      ${ss.easy > 0  ? `<span class="sstat sstat-easy">&#9733; ${ss.easy}</span>` : ''}
    </div>` : '<div class="session-stats"></div>';

  let body = '';

  if (s.phase === 'asking') {
    let confidenceUI = '';
    if (cfg.techniques.confidenceCheck) {
      const lvl = s.confidenceLevel;
      confidenceUI = `
        <div class="smart-confidence">
          <div class="smart-prompt">How confident are you?</div>
          <div class="smart-conf-buttons">
            <button class="btn ${lvl === 'low'    ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="smart-confidence" data-val="low">Not sure</button>
            <button class="btn ${lvl === 'medium' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="smart-confidence" data-val="medium">Maybe</button>
            <button class="btn ${lvl === 'high'   ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="smart-confidence" data-val="high">Confident</button>
          </div>
        </div>`;
    }

    let answerUI;
    if (cfg.techniques.typeRecall) {
      answerUI = `
        <div class="smart-answer-area">
          <label class="field-label">Your answer</label>
          <textarea id="smart-answer-input" class="textarea smart-answer-input" rows="2" placeholder="Type your answer, then press Enter">${esc(s.typedAnswer)}</textarea>
          <div class="smart-answer-actions">
            <button class="btn btn-primary" data-action="smart-check">Check answer</button>
            <button class="btn btn-ghost btn-sm" data-action="smart-skip">Skip / don't know</button>
            <span class="smart-hint-inline">Enter to check &middot; Shift+Enter for newline</span>
          </div>
        </div>`;
    } else {
      answerUI = `<div class="show-answer-wrap"><button class="btn btn-primary btn-lg" data-action="smart-reveal">Show Answer</button></div>`;
    }

    body = `
      <div class="smart-deck-tag">${esc(deck.name)}</div>
      <div class="smart-card-block smart-card-front">
        <div class="card-side-label">Question</div>
        <div class="card-content">${esc(card.front)}</div>
      </div>
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
          <div class="smart-feedback-score">${band.label} &middot; ${pct2}% match</div>
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
          Confidence: <strong>${s.confidenceLevel}</strong>${calLabel ? ' &middot; ' + calLabel : ''}
        </div>`;
    }

    let whyPrompt = '';
    if (cfg.techniques.whyPrompt) {
      whyPrompt = `
        <div class="smart-why">
          <label class="field-label">Why is this correct? <span class="muted">(optional)</span></label>
          <textarea id="smart-why-input" class="textarea" rows="2" placeholder="Briefly explain why...">${esc(s.elaboration)}</textarea>
          <div class="smart-hint-inline">Self-explanation strengthens memory traces.</div>
        </div>`;
    }

    const suggested = s.similarity !== null ? similarityBand(s.similarity).suggested : null;
    const labels = ['Again', 'Hard', 'Good', 'Easy'];
    const classes = ['btn-again', 'btn-hard', 'btn-good', 'btn-easy'];
    const rateBtns = [0, 1, 2, 3].map(g => `
      <div class="rating-btn-wrap">
        <button class="btn ${classes[g]} btn-lg ${suggested === g ? 'is-suggested' : ''}" data-action="smart-rate" data-grade="${g}">${labels[g]}${suggested === g ? ' &#9678;' : ''}</button>
      </div>`).join('');

    body = `
      <div class="smart-deck-tag">${esc(deck.name)}</div>
      <div class="smart-card-pair">
        <div class="smart-card-block smart-card-front compact">
          <div class="card-side-label">Question</div>
          <div class="card-content">${esc(card.front)}</div>
        </div>
        <div class="smart-card-block smart-card-back">
          <div class="card-side-label">Answer</div>
          <div class="card-content">${esc(card.back)}</div>
        </div>
      </div>
      ${feedback}
      ${confFeedback}
      ${whyPrompt}
      <div class="rating-buttons">${rateBtns}</div>
    `;
  }

  return `
    <div class="study-page">
      <div class="study-header">
        <button class="btn btn-ghost btn-sm" data-action="go-home">&larr; Home</button>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <span class="progress-label">${s.index} / ${total}${timerHtml}</span>
        ${themeBtn()}
      </div>
      <div class="smart-body">${body}</div>
      ${statsBar}
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
  const nextLabel = done ? 'Start next Smart Session' : 'Break in progress';

  return `
    <div class="study-page">
      <div class="study-header">
        <button class="btn btn-ghost btn-sm" data-action="go-home">&larr; Home</button>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:100%"></div></div>
        <span class="progress-label">Pomodoro break</span>
        ${themeBtn()}
      </div>
      <div class="smart-break-screen">
        <div class="smart-break-kicker">25 minutes complete</div>
        <div class="smart-break-timer-wrap">
          <div class="smart-break-ring">
            <div class="smart-break-ring-fill" style="--break-progress:${progress}"></div>
            <div class="smart-break-ring-center">
              <span id="smart-break-timer" class="smart-break-timer">${fmtMs(remaining)}</span>
              <span class="smart-break-label">${done ? 'ready' : 'rest'}</span>
            </div>
          </div>
        </div>
        <h2>Take the break seriously.</h2>
        <p>
          Pomodoro pairs deep focus with a real pause. Use these 7 minutes away from active recall so your attention can recover before the next round.
        </p>
        <div class="smart-break-tips">
          <span>Stand up</span>
          <span>Drink water</span>
          <span>Look away from the screen</span>
        </div>
        <div class="smart-break-meta">${reviewed} card${reviewed !== 1 ? 's' : ''} reviewed in this focus block.</div>
        <div class="smart-done-actions">
          <button class="btn btn-smart" data-action="smart-break-start-next" ${nextDisabled}>${nextLabel}</button>
          <button class="btn btn-secondary" data-action="go-home">Back to Home</button>
        </div>
      </div>
    </div>`;
}

function renderSmartDone() {
  const s = state.smart;
  const ss = s.sessionStats;
  const total = ss.reviewed;
  const reason = s.timeUp
    ? `Time's up after ${state.smartConfig.duration} minute${state.smartConfig.duration !== 1 ? 's' : ''}.`
    : `You went through all ${s.queue.length} card${s.queue.length !== 1 ? 's' : ''}.`;

  const statBar = total > 0 ? `
    <div class="session-stats-done">
      ${ss.again > 0 ? `<span class="sstat sstat-again">${ss.again} Again</span>` : ''}
      ${ss.hard > 0  ? `<span class="sstat sstat-hard">${ss.hard} Hard</span>` : ''}
      ${ss.good > 0  ? `<span class="sstat sstat-good">${ss.good} Good</span>` : ''}
      ${ss.easy > 0  ? `<span class="sstat sstat-easy">${ss.easy} Easy</span>` : ''}
    </div>` : '';

  // Show "New Smart Session" only if at least one selected deck still has due cards
  const data = loadData();
  const hasMoreDue = state.smartConfig.deckIds.some(id => {
    const d = data.decks.find(dd => dd.id === id);
    return d && d.cards.length > 0;
  });

  return `
    <div class="study-page">
      <div class="study-header">
        <button class="btn btn-ghost btn-sm" data-action="go-home">&larr; Home</button>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:100%"></div></div>
        <span class="progress-label">${total} reviewed</span>
        ${themeBtn()}
      </div>
      <div class="study-done">
        <h2>Smart session complete!</h2>
        <p>${reason}</p>
        ${statBar}
        <div class="smart-done-actions">
          ${hasMoreDue ? `<button class="btn btn-smart" data-action="smart-restart">New Smart Session</button>` : ''}
          <button class="btn btn-secondary" data-action="smart-tweak">Adjust Setup</button>
          <button class="btn btn-secondary" data-action="go-home">Back to Home</button>
        </div>
      </div>
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
  render();
}

function smartSkip() {
  const s = state.smart;
  if (!s || s.phase !== 'asking') return;
  s.typedAnswer = '';
  s.similarity = 0;
  s.phase = 'reviewing';
  render();
}

function smartReveal() {
  const s = state.smart;
  if (!s || s.phase !== 'asking') return;
  s.similarity = null;
  s.phase = 'reviewing';
  render();
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
    if (!willRequeue) markSmartCardExited(deck, item.cardId, gradeKey);
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
  render();
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
  sb.setBackgroundColor({ color: dark ? '#1b201a' : '#eef0e8' });
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  setupStatusBar();
  render();
  bindModalEvents();
});
