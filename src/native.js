/* Dinlipi — native Android bridge (SQLite, notifications, files, share, haptics, back button).
   Bundled by esbuild into www/js/native.bundle.js during the build (npm run build).
   It defines window.NativeRepo and window.NativeKit only when running inside the Android app;
   in a desktop browser the web code falls back to localStorage and downloads. */

import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { App } from '@capacitor/app';

/* ---------------- SQLite ----------------
   Database schema versions are tracked in our own table `schema_info` (not PRAGMA user_version,
   which the SQLite plugin manages itself). Add a new entry to DB_MIGRATIONS for every change;
   never edit an entry that has shipped. */
const DB_NAME = 'dinlipi';
const DB_MIGRATIONS = [
  // 1 — initial schema (app 1.0.0)
  `CREATE TABLE IF NOT EXISTS activities (
     id TEXT PRIMARY KEY NOT NULL,
     name TEXT NOT NULL,
     category TEXT NOT NULL,
     reminder INTEGER NOT NULL DEFAULT 1,
     reminder_time TEXT,
     days TEXT NOT NULL DEFAULT '',
     archived INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     sort_order INTEGER NOT NULL DEFAULT 0,
     extra TEXT
   );
   CREATE TABLE IF NOT EXISTS checkins (
     date TEXT NOT NULL,
     activity_id TEXT NOT NULL,
     PRIMARY KEY (date, activity_id)
   );
   CREATE INDEX IF NOT EXISTS idx_checkins_activity ON checkins (activity_id);
   CREATE TABLE IF NOT EXISTS kv (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL
   );`,
];

const sqlite = new SQLiteConnection(CapacitorSQLite);
let db = null;

async function openDb() {
  if (db) return db;
  try { await sqlite.checkConnectionsConsistency(); } catch (_) { /* first start */ }
  const exists = (await sqlite.isConnection(DB_NAME, false)).result;
  db = exists
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await db.open();
  await db.execute('CREATE TABLE IF NOT EXISTS schema_info (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL);', false);
  const res = await db.query('SELECT version FROM schema_info WHERE id = 1;');
  let v = res.values && res.values.length ? Number(res.values[0].version) : 0;
  while (v < DB_MIGRATIONS.length) {
    await db.execute(`${DB_MIGRATIONS[v]}
      INSERT OR REPLACE INTO schema_info (id, version) VALUES (1, ${v + 1});`, true);
    v++;
  }
  return db;
}

const KNOWN_FIELDS = ['id', 'name', 'category', 'reminder', 'reminderTime', 'days', 'archived', 'createdAt', 'order'];
const UPSERT_ACTIVITY = `INSERT OR REPLACE INTO activities
  (id, name, category, reminder, reminder_time, days, archived, created_at, sort_order, extra)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const ADD_CHECK = 'INSERT OR IGNORE INTO checkins (date, activity_id) VALUES (?, ?)';
const PUT_KV = 'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)';

function safeParse(s) { try { return JSON.parse(s); } catch (_) { return {}; } }

// Unknown activity fields (from future versions) are kept in the `extra` column.
function activityParams(a) {
  const extra = {};
  for (const k of Object.keys(a)) if (!KNOWN_FIELDS.includes(k)) extra[k] = a[k];
  return [a.id, a.name, a.category, a.reminder ? 1 : 0, a.reminderTime || null, (a.days || []).join(','),
    a.archived ? 1 : 0, a.createdAt, a.order, Object.keys(extra).length ? JSON.stringify(extra) : null];
}
function rowToActivity(r) {
  return {
    ...(r.extra ? safeParse(r.extra) : {}),
    id: r.id,
    name: r.name,
    category: r.category,
    reminder: !!r.reminder,
    reminderTime: r.reminder_time || null,
    days: r.days ? String(r.days).split(',').filter(Boolean).map(Number) : [],
    archived: !!r.archived,
    createdAt: r.created_at,
    order: Number(r.sort_order),
  };
}

const NativeRepo = {
  kind: 'sqlite',

  async init() {
    await openDb();
    const kv = {};
    ((await db.query('SELECT key, value FROM kv;')).values || []).forEach(r => { kv[r.key] = safeParse(r.value); });
    if (!kv.createdAt) return null;   // brand-new database
    const acts = (await db.query('SELECT * FROM activities;')).values || [];
    const checks = (await db.query('SELECT date, activity_id FROM checkins;')).values || [];
    const logs = {};
    checks.forEach(r => { (logs[r.date] = logs[r.date] || []).push(r.activity_id); });
    return {
      ...(kv.extra && typeof kv.extra === 'object' ? kv.extra : {}),
      schemaVersion: kv.schemaVersion || 2,
      createdAt: kv.createdAt,
      activities: acts.map(rowToActivity),
      logs,
      settings: kv.settings || {},
      meta: kv.meta || {},
    };
  },
  async saveActivity(a) { await openDb(); await db.run(UPSERT_ACTIVITY, activityParams(a)); },
  async deleteActivity(id) {
    await openDb();
    await db.executeSet([
      { statement: 'DELETE FROM checkins WHERE activity_id = ?', values: [id] },
      { statement: 'DELETE FROM activities WHERE id = ?', values: [id] },
    ], true);
  },
  async setCheck(k, id, done) {
    await openDb();
    if (done) await db.run(ADD_CHECK, [k, id]);
    else await db.run('DELETE FROM checkins WHERE date = ? AND activity_id = ?', [k, id]);
  },
  async saveKV(key, value) { await openDb(); await db.run(PUT_KV, [key, JSON.stringify(value)]); },

  // Replaces everything in one transaction: either all of it is written or nothing changes.
  async replaceAll(data) {
    await openDb();
    const set = [
      { statement: 'DELETE FROM checkins', values: [] },
      { statement: 'DELETE FROM activities', values: [] },
      { statement: 'DELETE FROM kv', values: [] },
    ];
    data.activities.forEach(a => set.push({ statement: UPSERT_ACTIVITY, values: activityParams(a) }));
    for (const [k, ids] of Object.entries(data.logs)) ids.forEach(id => set.push({ statement: ADD_CHECK, values: [k, id] }));
    const { schemaVersion, createdAt, settings, meta, activities, logs, ...extra } = data;
    [['schemaVersion', schemaVersion], ['createdAt', createdAt], ['settings', settings], ['meta', meta], ['extra', extra]]
      .forEach(([k, v]) => set.push({ statement: PUT_KV, values: [k, JSON.stringify(v)] }));
    await db.executeSet(set, true);
  },
};

/* ---------------- Notifications, files, share ---------------- */
const REMINDER_ID_MIN = 1000, REMINDER_ID_MAX = 1299, SNOOZE_ID = 2001;

async function setupNotifications() {
  try {
    await LocalNotifications.createChannel({
      id: 'reminders', name: 'Evening reminders', description: 'Activities not done yet today',
      importance: 4, visibility: 1, vibration: true,
    });
    await LocalNotifications.registerActionTypes({
      types: [{ id: 'DINLIPI_REMIND', actions: [{ id: 'snooze', title: 'Remind me in 1 hour' }] }],
    });
    await LocalNotifications.addListener('localNotificationActionPerformed', async ev => {
      if (ev.actionId === 'snooze') {
        const n = ev.notification;
        await LocalNotifications.schedule({ notifications: [{
          id: SNOOZE_ID, title: n.title, body: n.body, largeBody: n.body, channelId: 'reminders',
          schedule: { at: new Date(Date.now() + 3600e3), allowWhileIdle: true },
        }] });
      } else if (window.onReminderTap) window.onReminderTap();
    });
  } catch (e) { console.warn('Notification setup failed', e); }
}

const NativeKit = {
  platform: Capacitor.getPlatform(),

  async notificationPermission() { return (await LocalNotifications.checkPermissions()).display; },
  async requestNotificationPermission() { return (await LocalNotifications.requestPermissions()).display; },
  async exactAlarmState() {
    try { return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm; } catch (_) { return 'granted'; }
  },
  async openExactAlarmSettings() {
    try { return (await LocalNotifications.changeExactNotificationSetting()).exact_alarm; } catch (_) { return 'granted'; }
  },

  async scheduleReminders(items) {
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return 'no-permission';
    const pending = await LocalNotifications.getPending();
    const old = pending.notifications.filter(n => n.id >= REMINDER_ID_MIN && n.id <= REMINDER_ID_MAX).map(n => ({ id: n.id }));
    if (old.length) await LocalNotifications.cancel({ notifications: old });
    if (items.length) {
      await LocalNotifications.schedule({ notifications: items.map(i => ({
        id: i.id, title: i.title, body: i.body, largeBody: i.body, channelId: 'reminders',
        actionTypeId: 'DINLIPI_REMIND', schedule: { at: i.at, allowWhileIdle: true }, extra: { date: i.date },
      })) });
    }
    return 'ok';
  },

  async shareFile(name, json) {
    const r = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Dinlipi backup', text: name, files: [r.uri], dialogTitle: 'Keep your Dinlipi backup' });
  },
  async saveToDocuments(name, json) {
    await Filesystem.writeFile({ path: `Dinlipi/${name}`, data: json, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    return `Documents/Dinlipi/${name}`;
  },

  tap() { Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); },
};

if (Capacitor.isNativePlatform()) {
  window.NativeRepo = NativeRepo;
  window.NativeKit = NativeKit;
  setupNotifications();
  App.addListener('backButton', () => {
    if (!(window.onAndroidBack && window.onAndroidBack())) App.exitApp();
  });
  App.addListener('appStateChange', s => { if (s.isActive && window.onAppResume) window.onAppResume(); });
}
