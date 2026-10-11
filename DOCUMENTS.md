# Dinlipi Mobile — Project Documentation

> **For an AI assistant reading this file:** this is the single source of truth for the Android version of
> Dinlipi. It records what the owner asked for, the decisions made, how the code is organised, and the rules
> that keep the owner's data safe. Read sections 3, 6, 7 and 9 before changing anything. After every change,
> update the status line, the affected sections and the changelog (section 12), and bump the version (section 8).

- **Status:** version **1.0.0** released on 2026-10-11 — signed APK on
  https://github.com/shawondiu/dinlipi/releases/tag/v1.0.0 (GitHub Actions build succeeded). Tested in a desktop browser
  (UI, stats, add/edit, delete, backup/restore, desktop-backup import). **Native parts (SQLite, notifications, file
  sharing) not yet confirmed on the owner's phone** — next step is the owner's first install and feedback.
- **Repository:** https://github.com/shawondiu/dinlipi (public, MIT License)
- **App id:** `com.dinlipi.tracker` — **never change it** (a different id is a different app; data would not carry over).
- **Owner:** GitHub user `shawondiu`; single user, personal use, **Android phone only**.
- **Owner's language:** talks in Bangla; app UI and this document are in **English** (owner's explicit choice).
- **Last updated:** 2026-10-11

---

## 1. Background

A desktop version (Dinlipi 1.0.0: plain HTML/CSS/JS in a browser, localStorage, automatic JSON backups to a folder,
own `DOCUMENTS.md`) was built first. The owner then decided to use the app **only on Android**. The mobile app reuses
the desktop app's logic and data format, so a desktop backup can be imported once on the phone.

## 2. Requirements from the owner

Carried over from the desktop version:

| # | Requirement | Mobile status |
|---|-------------|---------------|
| R1 | Daily checklist: mark each activity done / not done | Done |
| R2 | Add and remove activities | Done (+ edit) |
| R4/R5 | Stats with charts: weekly, monthly, per activity and overall | Done |
| R8 | UI in English | Done |
| R10 | Delete asks for confirmation 2–3 times | Done (3 steps, archive offered) |
| R12 | Later changes must never lose old data | Done (schema versions + migrations, section 7) |
| R13 | One evening reminder (~20:00) for unfinished activities, never hourly | Done (Android notifications) |
| R14 | Choose per activity whether it gets a reminder, offered on creation | Done |
| R15 | Show missed activities from the previous day | Done (banner) |
| — | No login (removed on purpose earlier: single user, own device) | Kept |

New for mobile:

| # | Requirement | Status |
|---|-------------|--------|
| M1 | Android phone only, for now | Done |
| M2 | Real on-device database: SQLite | Done |
| M3 | Manual backup (export) and manual restore (import), so after any future change the owner can restore and continue with all old data | Done |
| M4 | No automatic backup (owner: not needed on mobile) | Respected (Android's own Google Drive backup remains on, see 3.7) |
| M5 | A proper installable app | Done (Capacitor APK) |
| M6 | Every direction and change recorded in this file | This file |
| M7 | One-time import of the desktop JSON backup | Done |
| M8 | Hosted on GitHub; APK built there; installable from GitHub; public so others can copy/use it, with images | Done (GitHub Actions, README with icon/screenshots) |

Owner-approved suggestions (all built in 1.0.0): weekday schedule per activity, reminder time per activity,
"time to back up" banner, undo after restore, haptic feedback, app icon + splash, Android back button handling,
battery-optimization hint, edit/rename activities.

## 3. Decisions (and why)

1. **Capacitor Android app** (not a PWA): gives SQLite, notifications while the app is closed (no server), and file sharing.
2. **SQLite** via `@capacitor-community/sqlite`.
3. **Backup format = JSON**, same structure as the desktop backup with a higher `schemaVersion`. Readable, engine-independent,
   lets old backups be upgraded by code. The SQLite file itself is never exported.
4. **Manual backups only** — Share sheet (Drive/Files/email) or save to `Documents/Dinlipi`.
5. **No backend, no login, no sync.**
6. **Classic scripts, no framework.** The web code in `www/` runs directly in a browser for testing. Only `src/native.js`
   is bundled (esbuild) during the build, because the Capacitor plugins are npm packages.
7. **Android Auto Backup stays enabled** (Capacitor default `allowBackup="true"`): Android may copy the app database to the
   owner's Google account and restore it on reinstall/new phone. The owner did not want app-managed automatic backups;
   this OS feature needs no action and was accepted as a suggestion.
8. **The `android/` folder is not committed.** It is generated on every build by `cap add android` and adjusted by
   `scripts/patch-android.mjs`. Native changes therefore go into that patch script.
9. **System fonts** (Roboto on Android) so the app works fully offline. Chart.js is bundled into the APK.
10. **Week starts on Saturday** (`settings.weekStartsOn = 6`), success day = 70% done (`settings.successThreshold`).

## 4. Features

- **Bottom tab bar:** Today · Stats · Activities · Settings. Floating **+** on Today and Activities.
- **Today:** title + progress ring, 7-day strip (dot colour = that day's result; tap to select), swipe left/right to change day,
  big tap rows to tick, per-activity streak (`12d`), note with progress. Banners: load error, demo mode, notifications blocked,
  missed yesterday (Fix yesterday / Dismiss), backup nudge (Back up now / Later).
- **Add / edit sheet:** name (unique, max 80), category chips, **Repeat on** weekday toggles (all = every day; at least one),
  **Remind me if not done** switch, reminder time **Default** or **Own time**. Edit mode adds Move up/down, Archive/Restore, Delete.
- **Activities:** list showing category, schedule ("Every day", "Every day except Fri", "Mon, Wed") and reminder time/off; Archived section.
- **Delete:** 3-step dialog — (1) facts + "Archive instead", (2) "Are you sure?", (3) type the name.
- **Stats:** Week/Month; efficiency with change vs the previous period; streak/best; daily completion bars; by-activity bars
  (tap to compare); 12-week trend (overall + selected activity); 16-week consistency calendar.
- **Reminders:** Android notifications at the global time (default 20:00) and/or each activity's own time, listing that day's
  unfinished reminder activities; optional second reminder (default 22:00, off); action **Remind me in 1 hour**; tapping opens Today.
- **Settings:** reminder switches/times, notification permission, exact-alarm permission (shown only if missing), battery hint;
  Last backup, Share backup, Save backup on phone, Restore from backup, Undo last restore, backup-nudge interval (7/14/30/never);
  About (tracking since, days logged, activity counts, storage, data version, app version).
- **Demo mode:** `index.html?demo` (optionally `&tab=stats|acts|settings`) shows sample data, saves nothing. Used for screenshots.

## 5. Project structure

```
dinlipi/                         (GitHub repository root)
├── www/                         Web app = what runs inside the Android app
│   ├── index.html               All screens, sheet, dialog; loads scripts in order
│   ├── css/app.css              All styles; colour tokens at the top (light + dark)
│   └── js/
│       ├── store.js             Data shape, defaults, migrate(), in-memory Store + persistence calls, date helpers
│       ├── stats.js             Read-only calculations (day %, averages, streaks)
│       ├── repo.js              Picks storage: NativeRepo (SQLite) on phone, LocalRepo (localStorage) in browser; demo data
│       ├── reminders.js         Plans the next 14 days of notifications
│       ├── backup.js            Share/save backup, backup nudge, undo snapshot
│       └── app.js               UI rendering, sheet, dialogs, events, start-up, APP_VERSION
├── src/native.js                Native bridge: SQLite repo, notifications, files, share, haptics, back button (bundled at build)
├── scripts/build-web.mjs        Bundles src/native.js → www/js/native.bundle.js; copies Chart.js → www/vendor/
├── scripts/patch-android.mjs    Version code/name, notification icon, DayNight theme in the generated android/ project
├── assets/                      icon-only.png (1024²), splash.png, splash-dark.png → app icons/splash via @capacitor/assets
├── docs/screenshots/            Images used in README
├── .github/workflows/build-android.yml   Cloud build + signing + GitHub Release
├── capacitor.config.json        App id/name, plugin config
├── package.json                 Dependencies (Capacitor 7), scripts, version
├── README.md                    Public page: features, install, fork instructions
├── LICENSE                      MIT
└── DOCUMENTS.md                 This file
```

Script order in `index.html` (do not change): `native.bundle.js` → Chart.js → `store.js` → `stats.js` → `repo.js` →
`reminders.js` → `backup.js` → `app.js`.

## 6. Data model

### 6.1 In memory and in backup files (data schema version 2)

```jsonc
{
  "app": "Dinlipi", "exportedAt": "2026-10-11T20:15:00.000Z",   // backup files only
  "schemaVersion": 2,
  "createdAt": "2026-10-11",                 // first tracking day (local YYYY-MM-DD)
  "activities": [{
    "id": "amv3my6tp3u5o11",                 // stable, never reused
    "name": "Daily exercise",
    "category": "health",                    // spirit | study | skill | work | health | other
    "reminder": true,
    "reminderTime": null,                    // "HH:MM" own time, or null = global time
    "days": [0,1,2,3,4,6],                   // weekdays (0=Sun…6=Sat); [] = every day
    "archived": false,
    "createdAt": "2026-10-11",
    "order": 6
  }],
  "logs": { "2026-10-11": ["amv3my6tp3u5o11"] },   // done activity ids per day
  "settings": {
    "successThreshold": 0.7, "weekStartsOn": 6,
    "reminders": { "enabled": true, "time": "20:00", "secondEnabled": false, "secondTime": "22:00" },
    "backup": { "lastBackupDate": null, "remindAfterDays": 30 }
  },
  "meta": { "dismissedMissedFor": null, "dismissedBackupNudge": null }
}
```
Schema history: **0** = UI preview (`cat` field) · **1** = desktop app 1.0.0 · **2** = mobile 1.0.0 (adds `days`, `reminderTime`).

### 6.2 SQLite (database `dinlipi`, structure version 1 — tracked in table `schema_info`)

```sql
activities (id TEXT PK, name, category, reminder INTEGER, reminder_time TEXT NULL, days TEXT -- "0,1,2", archived INTEGER,
            created_at TEXT, sort_order INTEGER, extra TEXT NULL -- JSON of unknown future fields)
checkins   (date TEXT, activity_id TEXT, PRIMARY KEY (date, activity_id))   -- index on activity_id
kv         (key TEXT PK, value TEXT JSON)   -- keys: schemaVersion, createdAt, settings, meta, extra
schema_info(id = 1, version INTEGER)       -- our own DB structure version (not PRAGMA user_version)
```

Other storage: `localStorage['dinlipi.preRestore']` = snapshot for "Undo last restore". In a desktop browser the whole
data object lives in `localStorage['dinlipi.data']`.

## 7. Keeping data safe (rules the code follows)

- `migrate()` (store.js) upgrades **any** older data or backup (v0, v1, v2) to the current schema, keeps unknown fields,
  and rejects data from a newer app instead of damaging it. It runs on start-up and on every import.
- If stored data is older than the app, it is rewritten in the new format right after migrating.
- SQLite structure changes go through `DB_MIGRATIONS` in `src/native.js` (append-only list).
- Restore: validate → preview dialog → snapshot current data → replace everything in **one transaction**
  (all or nothing) → "Undo last restore" available in Settings.
- If the database cannot be opened, the app shows an error and **does not write** anything (read-only), so nothing is overwritten.
- Updating the APK keeps the database (same app id + same signing key).

## 8. Build, sign, release

- **Build:** GitHub Actions (`.github/workflows/build-android.yml`) on Ubuntu with Node 22 + Java 21:
  `npm install` → `npm run build` → `cap add android` → `@capacitor/assets` (icons/splash) → `patch-android.mjs` → `cap sync` → Gradle.
- **Signing:** repository secrets `KEYSTORE_BASE64` (base64 of a PKCS#12 `.p12` file) and `KEYSTORE_PASSWORD`. The APK is
  zipaligned and signed with `apksigner`. Without secrets (forks) a debug APK is built.
- **The signing key must never change and never be committed.** The owner keeps the `.p12` file and password privately.
  Losing it means future updates cannot install over the old app (uninstall → restore from backup).
- **Releasing a new version:**
  1. Change `version` in `package.json` and `APP_VERSION` in `www/js/app.js` (e.g. 1.0.1).
  2. Add a changelog entry below.
  3. Commit, then create and push a tag `v1.0.1` → the workflow publishes `Dinlipi-1.0.1.apk` on the Releases page.
  `versionCode` = major·10000 + minor·100 + patch, so versions must always increase.
- **Manual test build:** Actions → "Build Android APK" → Run workflow → download from Artifacts.

## 9. Rules for future changes (for the AI assistant)

1. Never lose user data: data-shape change → bump `SCHEMA_VERSION` + add a step in `migrate()`; table change → append to
   `DB_MIGRATIONS`. All older backups (desktop v1 included) must keep importing.
2. Never change `appId`, activity ids, or the local `YYYY-MM-DD` date format.
3. Keep backups manual, UI in English, reminders limited (no hourly), delete at 3 steps, no login/backend — unless the owner asks.
4. Keep the web code framework-free and runnable in a desktop browser (`?demo`) for testing.
5. Native Android changes go into `scripts/patch-android.mjs` (the `android/` folder is regenerated each build).
6. The owner also has Bitbucket projects on the same computer: configure git **only inside this repository**
   (no `--global` settings, no `gh auth setup-git`).
7. After every change: update this file (status, sections, changelog) and release a new version (section 8).

## 10. Ideas not built yet

- Track time or quantity (minutes, pages) instead of only done / not done
- Daily note / journal line
- Undo after ticking or archiving
- Home-screen widget showing today's progress
- Play Store publishing (would need a developer account and policy work)
- Sync between devices (would need a backend)

## 11. Known limits

- Notifications can be delayed by aggressive battery savers (some Xiaomi, Samsung, Oppo phones). Fix: turn off battery
  optimization for Dinlipi.
- Exact-time delivery needs the "Alarms & reminders" permission on Android 12+; without it reminders may arrive a few minutes late.
- The app is not on the Play Store, so Play Protect may warn when installing.

## 12. Changelog

- **1.0.0 (2026-10-11)** — First Android version: Today/Stats/Activities/Settings, SQLite storage, evening notifications with
  per-activity times and weekday schedules, 3-step delete, archive, manual backup (share/save) and restore with undo,
  desktop backup import, backup nudge, icon and splash, GitHub Actions build and signed releases.
- **2026-10-11 (planning)** — Direction decided: Android-only Capacitor app, SQLite, manual JSON backup/restore, no login.
