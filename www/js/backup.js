/* Dinlipi — manual backup and restore (no automatic backups, by the owner's choice).
   Backup file = JSON in the same format as the desktop app, named dinlipi-backup-YYYY-MM-DD.json.
   On the phone the file is shared through the Android share sheet or saved to Documents/Dinlipi.
   In a desktop browser it is downloaded. Before a restore, the current data is kept as a snapshot
   in local storage so the restore can be undone. */

const SNAPSHOT_KEY = 'dinlipi.preRestore';

const Backup = {
  fileName(prefix = 'backup') { return `dinlipi-${prefix}-${todayKey()}.json`; },

  _download(name, json) {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  markDone() { Store.data.settings.backup.lastBackupDate = todayKey(); Store.saveSettings(); },

  // Returns a short message for the user.
  async share() {
    const name = this.fileName(), json = Store.exportJSON();
    if (window.NativeKit) await window.NativeKit.shareFile(name, json);
    else this._download(name, json);
    this.markDone();
    return window.NativeKit ? 'Backup ready. Choose where to keep it.' : `Downloaded ${name}`;
  },
  async saveToPhone() {
    const name = this.fileName(), json = Store.exportJSON();
    if (!window.NativeKit) { this._download(name, json); this.markDone(); return `Downloaded ${name}`; }
    const where = await window.NativeKit.saveToDocuments(name, json);
    this.markDone();
    return `Saved to ${where}`;
  },

  daysSinceBackup() {
    const b = Store.data.settings.backup;
    return b.lastBackupDate ? daysBetween(b.lastBackupDate, todayKey()) : null;
  },
  // Show a gentle "back up" banner when it has been too long (or never, after a week of use).
  needsNudge() {
    const limit = Store.data.settings.backup.remindAfterDays;
    if (!limit || Store.data.meta.dismissedBackupNudge === todayKey()) return false;
    const since = this.daysSinceBackup();
    if (since == null) return daysBetween(Store.data.createdAt, todayKey()) >= 7 && Object.keys(Store.data.logs).length > 0;
    return since >= limit;
  },

  /* ---- undo for restores ---- */
  saveSnapshot() {
    try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), json: Store.exportJSON() })); return true; }
    catch (_) { return false; }
  },
  snapshot() {
    try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null'); } catch (_) { return null; }
  },
  clearSnapshot() { try { localStorage.removeItem(SNAPSHOT_KEY); } catch (_) { /* ignore */ } },
};
