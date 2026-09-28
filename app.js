import { initDb } from './db.js';

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
// Dates are stored as local 'YYYY-MM-DD' strings so "today" follows your own timezone.
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

let db;
let today = ymd(new Date());
const data = {};      // collection name -> array of items
const sections = {};  // collection name -> { render, newItem?, toggle? }
let unsubs = [];

/* ---------- Header: day-progress ring + date ---------- */
const RING_C = 2 * Math.PI * 30;
$('ring-fill').style.strokeDasharray = RING_C;

function renderHeader() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1); // handles 23/25-hour daylight-saving days
  const frac = (now - start) / (end - start);
  const pct = Math.floor(frac * 100);
  $('ring-fill').style.strokeDashoffset = RING_C * (1 - frac);
  $('ring-pct').textContent = pct + '%';
  $('ring').setAttribute('aria-label', `${pct}% of the day is over`);
  $('date-weekday').textContent = now.toLocaleDateString(undefined, { weekday: 'long' });
  $('date-full').textContent = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function renderAll() {
  Object.values(sections).forEach((s) => s.render());
}

// Runs every 30s and whenever the app returns to the foreground; re-renders everything at midnight.
function tick() {
  renderHeader();
  const t = ymd(new Date());
  if (t !== today) {
    today = t;
    renderAll();
  }
}

/* ---------- Auth ---------- */
const AUTH_ERRORS = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/email-already-in-use': 'An account with that email already exists — try signing in.',
  'auth/weak-password': 'Password needs at least 6 characters.',
  'auth/popup-blocked': 'The sign-in popup was blocked. Allow popups or use email instead.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/unauthorized-domain': 'This site isn’t in Firebase’s authorized domains yet (see README).',
};

function showAuthError(err) {
  if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
  $('auth-error').textContent = AUTH_ERRORS[err?.code] || err?.message || 'Sign-in failed.';
  $('auth-error').hidden = false;
}

function setupAuth() {
  const email = () => $('email').value.trim();
  const pw = () => $('password').value;
  $('google-btn').onclick = () => db.signInGoogle().catch(showAuthError);
  $('email-form').onsubmit = (e) => {
    e.preventDefault();
    db.signInEmail(email(), pw()).catch(showAuthError);
  };
  $('create-btn').onclick = () => {
    if ($('email-form').reportValidity()) db.createAccount(email(), pw()).catch(showAuthError);
  };
  $('signout-btn').onclick = () => db.signOut();
}

/* ---------- Data ---------- */
function stopWatching() {
  unsubs.forEach((u) => u());
  unsubs = [];
}

function watchAll() {
  stopWatching();
  unsubs = Object.keys(sections).map((name) =>
    db.watch(name, (items) => {
      data[name] = items;
      sections[name].render();
    })
  );
}

/* ---------- Shared list helpers ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86_400_000);
const byCreated = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);
const byDue = (a, b) => a.due.localeCompare(b.due) || byCreated(a, b);
const isOverdue = (x) => !x.done && x.due < today;

const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function itemHTML({ id, text, meta, done, overdue }) {
  return `<li class="item${done ? ' done' : ''}${overdue ? ' overdue' : ''}" data-id="${esc(id)}">
    <button type="button" class="check" role="checkbox" aria-checked="${!!done}" aria-label="Done">${CHECK_SVG}</button>
    <div class="item-body">
      <div class="item-text">${esc(text)}</div>
      ${meta ? `<div class="item-meta">${esc(meta)}</div>` : ''}
    </div>
    <button type="button" class="del" aria-label="Delete">×</button>
  </li>`;
}

function renderList(ul, items, emptyText) {
  ul.innerHTML = items.length
    ? items.map(itemHTML).join('')
    : `<li class="empty">${esc(emptyText)}</li>`;
}

// Overdue first (oldest first), then open items by due date, then completed ones.
function orderDated(items) {
  return [
    ...items.filter(isOverdue).sort(byDue),
    ...items.filter((x) => !x.done && !isOverdue(x)).sort(byDue),
    ...items.filter((x) => x.done).sort(byDue),
  ];
}

function friendlyDate(s) {
  const d = daysBetween(today, s);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  const date = parseYmd(s);
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if (date.getFullYear() !== parseYmd(today).getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString(undefined, opts);
}

function overdueText(s) {
  const n = daysBetween(s, today);
  return `${n} day${n === 1 ? '' : 's'} overdue`;
}

/* Undo toast for deletes */
let toastTimer;
let undoFn = null;

function showToast(msg, onUndo) {
  $('toast-msg').textContent = msg;
  undoFn = onUndo;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 5000);
}

$('toast-undo').onclick = () => {
  $('toast').hidden = true;
  undoFn?.();
  undoFn = null;
};

function removeWithUndo(name, items, msg) {
  items.forEach((x) => db.remove(name, x.id));
  showToast(msg, () => items.forEach(({ id, ...rest }) => db.set(name, id, rest)));
}

/* Add forms, checkboxes, delete and clear buttons for every list */
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-add]');
  if (!form) return;
  e.preventDefault();
  const name = form.dataset.add;
  const input = form.elements.text;
  const text = input.value.trim();
  if (!text) return;
  db.add(name, { text, createdAt: Date.now(), ...sections[name].newItem(form) });
  input.value = '';
  input.focus();
});

document.addEventListener('click', (e) => {
  const clear = e.target.closest('[data-clear]');
  if (clear) {
    const name = clear.dataset.clear;
    const done = (data[name] || []).filter((x) => x.done);
    if (done.length) removeWithUndo(name, done, `Cleared ${done.length} completed`);
    return;
  }

  const btn = e.target.closest('.check, .del');
  const li = btn?.closest('.item');
  if (!li) return;
  const name = li.closest('.list').id.replace(/-list$/, '');
  const item = (data[name] || []).find((x) => x.id === li.dataset.id);
  if (!item) return;
  if (btn.classList.contains('check')) sections[name].toggle(item);
  else removeWithUndo(name, [item], 'Deleted');
});

/* ---------- Tasks ---------- */
let taskView = 'today';
try { taskView = localStorage.getItem('dashboard-task-view') || 'today'; } catch {}

document.querySelectorAll('[data-view]').forEach((b) => {
  b.onclick = () => {
    taskView = b.dataset.view;
    try { localStorage.setItem('dashboard-task-view', taskView); } catch {}
    sections.tasks.render();
  };
});

sections.tasks = {
  newItem: (form) => ({ due: form.elements.due.value || today, done: false, completedAt: null }),
  toggle: (x) => db.update('tasks', x.id, { done: !x.done, completedAt: x.done ? null : Date.now() }),
  render() {
    const items = data.tasks || [];
    // Overdue tasks show in both views; Today adds tasks due today, All adds everything.
    const shown = taskView === 'today' ? items.filter((x) => x.due === today || isOverdue(x)) : items;
    renderList(
      $('tasks-list'),
      orderDated(shown).map((x) => ({
        ...x,
        overdue: isOverdue(x),
        meta: isOverdue(x)
          ? `${friendlyDate(x.due)} · ${overdueText(x.due)}`
          : taskView === 'all' ? friendlyDate(x.due) : '',
      })),
      taskView === 'today' ? 'Nothing due today.' : 'No tasks yet.'
    );

    document.querySelectorAll('[data-view]').forEach((b) =>
      b.setAttribute('aria-selected', b.dataset.view === taskView));

    const open = items.filter((x) => !x.done).length;
    const overdue = items.filter(isOverdue).length;
    $('tasks-count').textContent = `${open} open` + (overdue ? ` · ${overdue} overdue` : '');

    // Keep the date picker on today (or later) after midnight or after adding a past-due task.
    const due = document.querySelector('[data-add="tasks"] [name="due"]');
    if (!due.value || due.value < today) due.value = today;
  },
};

/* ---------- Daily ---------- */
// A daily task counts as done only if it was checked today, so every task resets at midnight
// without anything having to be written.
sections.daily = {
  newItem: () => ({ lastDoneDate: '' }),
  toggle: (x) => db.update('daily', x.id, { lastDoneDate: x.lastDoneDate === today ? '' : today }),
  render() {
    const items = [...(data.daily || [])].sort(byCreated);
    const done = items.filter((x) => x.lastDoneDate === today).length;
    renderList(
      $('daily-list'),
      items.map((x) => ({ ...x, done: x.lastDoneDate === today })),
      'Add things you do every day.'
    );
    $('daily-count').textContent = items.length ? `${done}/${items.length} done` : '';
    $('daily-bar').style.width = items.length ? `${(done / items.length) * 100}%` : '0';
  },
};

/* ---------- Weekly goals + notes ---------- */
function mondayOf(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

sections.weekly = {
  newItem: () => ({ done: false }),
  toggle: (x) => db.update('weekly', x.id, { done: !x.done }),
  render() {
    const items = [...(data.weekly || [])].sort((a, b) => a.done - b.done || byCreated(a, b));
    renderList($('weekly-list'), items, 'What do you want to get done this week?');
    const monday = mondayOf(parseYmd(today));
    $('week-label').textContent = 'Week of ' + monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const done = items.filter((x) => x.done).length;
    $('weekly-count').textContent = items.length ? `${done}/${items.length} done` : '';
  },
};

const notesEl = $('weekly-notes');
let notesTimer = null;
let statusTimer;

function setNotesStatus(text) {
  $('notes-status').textContent = text;
  clearTimeout(statusTimer);
  if (text === 'Saved') statusTimer = setTimeout(() => ($('notes-status').textContent = ''), 2000);
}

function saveNotes() {
  clearTimeout(notesTimer);
  notesTimer = null;
  // Firestore writes to its local cache right away and syncs later, so don't wait on the server.
  db.set('meta', 'weeklyNotes', { text: notesEl.value, updatedAt: Date.now() })
    .catch(() => setNotesStatus('Couldn’t save'));
  setNotesStatus('Saved');
}

notesEl.addEventListener('input', () => {
  setNotesStatus('Saving…');
  clearTimeout(notesTimer);
  notesTimer = setTimeout(saveNotes, 600);
});
notesEl.addEventListener('blur', () => { if (notesTimer) saveNotes(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && notesTimer) saveNotes(); });

sections.meta = {
  render() {
    // Don't overwrite what you're typing with a synced copy.
    if (document.activeElement === notesEl || notesTimer) return;
    const doc = (data.meta || []).find((x) => x.id === 'weeklyNotes');
    notesEl.value = doc?.text || '';
  },
};

/* ---------- Long-term goals ---------- */
function countdown(due) {
  const d = daysBetween(today, due);
  if (d < 0) return overdueText(due);
  if (d === 0) return 'due today';
  if (d < 60) return `in ${d} day${d === 1 ? '' : 's'}`;
  if (d < 730) return `in ${Math.round(d / 30.44)} months`;
  return `in ${Math.round(d / 365.25)} years`;
}

sections.longterm = {
  newItem: (form) => ({ due: form.elements.due.value, done: false }),
  toggle: (x) => db.update('longterm', x.id, { done: !x.done }),
  render() {
    renderList(
      $('longterm-list'),
      orderDated(data.longterm || []).map((x) => ({
        ...x,
        overdue: isOverdue(x),
        meta: parseYmd(x.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          + ' · ' + (x.done ? 'done' : countdown(x.due)),
      })),
      'Big things you’re working toward.'
    );
  },
};

/* ---------- Boot ---------- */
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.warn);
  renderHeader();
  setInterval(tick, 30_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  db = await initDb();
  setupAuth();
  $('local-pill').hidden = !db.local;
  $('signout-btn').hidden = db.local;

  db.onUser((user) => {
    $('auth').hidden = !!user;
    $('app').hidden = !user;
    $('auth-error').hidden = true;
    if (user) watchAll(); else stopWatching();
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = '<p style="padding:24px">Couldn’t start the dashboard. Check your connection and reload.</p>';
});
