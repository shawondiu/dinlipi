/* Dinlipi — where data is persisted.
   On the phone: window.NativeRepo (SQLite), defined in js/native.bundle.js which is built from
   src/native.js during the GitHub build. In a desktop browser (development, screenshots):
   LocalRepo keeps the same data in localStorage. Both implement the same methods:
     init() → saved data object or null · saveActivity(a) · deleteActivity(id)
     setCheck(dateKey, id, done) · saveKV(key, value) · replaceAll(data)            */

function LocalRepo(persist) {
  const KEY = 'dinlipi.data';
  const flush = () => { if (persist) localStorage.setItem(KEY, JSON.stringify(Store.data)); };
  return {
    kind: persist ? 'browser' : 'demo',
    async init() {
      if (!persist) return null;
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    },
    async saveActivity() { flush(); },
    async deleteActivity() { flush(); },
    async setCheck() { flush(); },
    async saveKV() { flush(); },
    async replaceAll(data) { if (persist) localStorage.setItem(KEY, JSON.stringify(data)); },
  };
}

const IS_DEMO = new URLSearchParams(location.search).has('demo');

function pickRepo() {
  if (IS_DEMO) return LocalRepo(false);
  if (window.NativeRepo) return window.NativeRepo;
  return LocalRepo(true);
}

// Sample history for ?demo (screenshots and trying the app in a browser). Never saved.
function demoData() {
  const d = defaultData();
  const t = todayKey();
  d.createdAt = shiftKey(t, -120);
  const odds = [0.92, 0.72, 0.6, 0.85, 0.55, 0.38, 0.66];
  d.activities.forEach((a, i) => { a.createdAt = d.createdAt; a.p = odds[i]; });
  d.activities[6].days = [0, 1, 2, 3, 4, 6];           // exercise: not on Friday
  d.activities[5].reminderTime = '21:00';
  let s = 20261011;
  const rnd = () => { s = s + 0x6D2B79F5 | 0; let x = Math.imul(s ^ s >>> 15, 1 | s); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  for (let i = 120; i >= 1; i--) {
    const k = shiftKey(t, -i), lift = (120 - i) / 120 * 0.18 - 0.09;
    const ids = d.activities.filter(a => isScheduled(a, k) && rnd() < a.p + lift).map(a => a.id);
    if (ids.length) d.logs[k] = ids;
  }
  d.logs[t] = [d.activities[0].id, d.activities[3].id, d.activities[1].id];
  d.activities.forEach(a => delete a.p);
  d.settings.backup.lastBackupDate = shiftKey(t, -3);
  return d;
}
