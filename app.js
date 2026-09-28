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

/* ---------- Boot ---------- */
async function boot() {
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
