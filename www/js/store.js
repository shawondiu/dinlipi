/* Dinlipi — in-memory data + persistence calls.
   Store.data always holds the full current data (same shape as a backup file).
   Every change updates Store.data first, then asks the repository (SQLite on the phone,
   localStorage in a desktop browser) to persist it. See DOCUMENTS.md → "Data model".
   Any change to the data shape MUST bump SCHEMA_VERSION and add a step in migrate(). */

const SCHEMA_VERSION = 2;   // 1 = desktop app 1.0.0, 2 = mobile (adds days + reminderTime)

const CATEGORIES = {
  spirit: 'Spiritual',
  study: 'Study',
  skill: 'Skill',
  work: 'Work',
  health: 'Health',
  other: 'Other',
};

// Created only on the very first run. The user can edit, archive or delete any of them.
const DEFAULT_ACTIVITIES = [
  { name: 'Quran recitation', category: 'spirit' },
  { name: 'Course reading', category: 'study' },
  { name: 'English speaking', category: 'skill' },
  { name: 'Software engineering', category: 'work' },
  { name: 'Personal project', category: 'work' },
  { name: 'Public speaking practice', category: 'skill' },
  { name: 'Daily exercise', category: 'health' },
];

/* ---------- date helpers (all dates are local "YYYY-MM-DD" keys) ---------- */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function pad2(n) { return String(n).padStart(2, '0'); }
function keyOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function todayKey() { return keyOf(new Date()); }
function shiftKey(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
function daysBetween(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 864e5); }
function nowHM() { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function atTime(k, hm) { const d = parseKey(k); const [h, m] = hm.split(':').map(Number); d.setHours(h, m, 0, 0); return d; }
function uid() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
const isDateKey = k => /^\d{4}-\d{2}-\d{2}$/.test(k);
const isHM = t => /^\d{2}:\d{2}$/.test(t || '');

function defaultSettings() {
  return {
    successThreshold: 0.7,       // a day is "successful" when this share of activities is done
    weekStartsOn: 6,             // 0 = Sunday … 6 = Saturday
    reminders: { enabled: true, time: '20:00', secondEnabled: false, secondTime: '22:00' },
    backup: { lastBackupDate: null, remindAfterDays: 30 },
  };
}
function defaultMeta() {
  return { dismissedMissedFor: null, dismissedBackupNudge: null };
}
function newActivity(fields, order) {
  return {
    id: uid(),
    name: fields.name.trim(),
    category: fields.category || 'other',
    reminder: fields.reminder !== false,
    reminderTime: isHM(fields.reminderTime) ? fields.reminderTime : null,   // null = use the global time
    days: Array.isArray(fields.days) ? fields.days : [],                    // [] = every day; 0 = Sunday … 6 = Saturday
    archived: false,
    createdAt: todayKey(),
    order,
  };
}
function defaultData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: todayKey(),
    activities: DEFAULT_ACTIVITIES.map((a, i) => ({ ...newActivity(a, i), id: uid() + i })),
    logs: {},
    settings: defaultSettings(),
    meta: defaultMeta(),
  };
}

// Fills missing keys from defaults, keeps every extra key found in `given`.
function deepMerge(defaults, given) {
  if (!given || typeof given !== 'object' || Array.isArray(given)) return JSON.parse(JSON.stringify(defaults));
  const out = { ...given };
  for (const [k, v] of Object.entries(defaults)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = deepMerge(v, given[k]);
    else if (given[k] === undefined) out[k] = v;
  }
  return out;
}

/* Turns saved data or any backup file (desktop v1, preview v0, mobile v2) into the current schema.
   Unknown fields are kept. Throws on unusable input or data from a newer app. */
function migrate(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.activities) ||
      !input.logs || typeof input.logs !== 'object') {
    throw new Error('This is not a Dinlipi backup.');
  }
  const v = Number(input.schemaVersion) || 0;
  if (v > SCHEMA_VERSION) throw new Error(`This backup comes from a newer Dinlipi (data version ${v}). Update the app first.`);

  const today = todayKey();
  const firstLog = Object.keys(input.logs).filter(isDateKey).sort()[0];
  const start = isDateKey(input.createdAt || '') ? input.createdAt : (firstLog || today);

  const activities = input.activities.map((a, i) => {
    const out = {
      ...a,
      id: String(a.id || uid() + i),
      name: String(a.name || 'Untitled').trim() || 'Untitled',
      // v0 → v1: preview data used `cat`
      category: CATEGORIES[a.category] ? a.category : (CATEGORIES[a.cat] ? a.cat : 'other'),
      reminder: a.reminder !== false,
      archived: !!a.archived,
      createdAt: isDateKey(a.createdAt || '') ? a.createdAt : start,
      order: Number.isFinite(a.order) ? a.order : i,
      // v1 → v2: weekday schedule and per-activity reminder time
      days: Array.isArray(a.days) ? [...new Set(a.days.map(Number).filter(d => d >= 0 && d <= 6))].sort() : [],
      reminderTime: isHM(a.reminderTime) ? a.reminderTime : null,
    };
    delete out.cat;
    return out;
  });

  const logs = {};
  for (const [k, ids] of Object.entries(input.logs)) {
    if (!isDateKey(k)) continue;
    const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))];
    if (list.length) logs[k] = list;
  }

  const out = {
    ...input,
    schemaVersion: SCHEMA_VERSION,
    createdAt: start,
    activities,
    logs,
    settings: deepMerge(defaultSettings(), input.settings),
    meta: deepMerge(defaultMeta(), input.meta),
  };
  delete out.exportedAt;
  delete out.app;
  // Future migrations go here, e.g.:  if (v < 3) { ...change out... }
  return out;
}

const isScheduled = (a, k) => !a.days.length || a.days.includes(parseKey(k).getDay());

const Store = {
  data: null,
  repo: null,
  loadError: null,
  isFirstRun: false,
  onSaveError: null,     // set by app.js

  async load(repo) {
    this.repo = repo;
    let saved = null;
    try { saved = await repo.init(); }
    catch (e) {
      this.loadError = `Your saved data could not be opened (${e.message}). Nothing was changed. Restart the app; if this keeps happening, restore your latest backup in Settings.`;
      this.data = defaultData();
      this.readOnly = true;
      return;
    }
    if (!saved) {
      this.data = defaultData();
      this.isFirstRun = true;
      await repo.replaceAll(this.data);
      return;
    }
    const oldVersion = Number(saved.schemaVersion) || 0;
    this.data = migrate(saved);
    if (oldVersion < SCHEMA_VERSION) await repo.replaceAll(this.data);
  },

  _persist(promise) {
    if (this.readOnly) return;
    Promise.resolve(promise).catch(e => { if (this.onSaveError) this.onSaveError(e); });
  },

  async replace(newData) {
    const data = migrate(JSON.parse(JSON.stringify(newData)));
    await this.repo.replaceAll(data);   // throws before Store.data changes if the database refuses
    this.data = data;
    this.readOnly = false;
  },

  exportJSON() {
    return JSON.stringify({ app: 'Dinlipi', exportedAt: new Date().toISOString(), ...this.data }, null, 2);
  },

  saveSettings() { this._persist(this.repo.saveKV('settings', this.data.settings)); },
  saveMeta() { this._persist(this.repo.saveKV('meta', this.data.meta)); },

  /* ---- activities ---- */
  active() { return this.data.activities.filter(a => !a.archived).sort((a, b) => a.order - b.order); },
  archived() { return this.data.activities.filter(a => a.archived).sort((a, b) => a.order - b.order); },
  find(id) { return this.data.activities.find(a => a.id === id); },
  nameTaken(name, exceptId) {
    const n = name.trim().toLowerCase();
    return this.data.activities.some(a => a.id !== exceptId && a.name.toLowerCase() === n);
  },
  addActivity(fields) {
    const order = Math.max(-1, ...this.data.activities.map(a => a.order)) + 1;
    const a = newActivity(fields, order);
    this.data.activities.push(a);
    this._persist(this.repo.saveActivity(a));
    return a;
  },
  update(id, changes) {
    const a = this.find(id);
    Object.assign(a, changes);
    this._persist(this.repo.saveActivity(a));
  },
  move(id, dir) {
    const list = this.active(), i = list.findIndex(a => a.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i].order, list[j].order] = [list[j].order, list[i].order];
    this._persist(this.repo.saveActivity(list[i]));
    this._persist(this.repo.saveActivity(list[j]));
  },
  deleteActivity(id) {
    this.data.activities = this.data.activities.filter(a => a.id !== id);
    for (const k of Object.keys(this.data.logs)) {
      this.data.logs[k] = this.data.logs[k].filter(x => x !== id);
      if (!this.data.logs[k].length) delete this.data.logs[k];
    }
    this._persist(this.repo.deleteActivity(id));
  },

  /* ---- daily check-offs ---- */
  isDone(k, id) { return (this.data.logs[k] || []).includes(id); },
  setDone(k, id, done) {
    const list = new Set(this.data.logs[k] || []);
    done ? list.add(id) : list.delete(id);
    if (list.size) this.data.logs[k] = [...list]; else delete this.data.logs[k];
    this._persist(this.repo.setCheck(k, id, done));
  },
  toggle(k, id) { this.setDone(k, id, !this.isDone(k, id)); },
};
