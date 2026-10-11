/* Dinlipi — evening reminders as Android notifications.
   The phone itself shows them at the right time, even when the app is closed (no server).
   Strategy: after every relevant change, all Dinlipi reminders are cancelled and rescheduled for
   the next 14 days. Each notification lists that day's unfinished reminder activities, grouped by
   reminder time (activity's own time, or the global time). Optional second reminder lists
   everything still open. Ticking an activity reschedules, so done activities drop out.
   Notification ids: 1000–1299 scheduled reminders, 2001 "remind me in 1 hour". */

const REMINDER_DAYS_AHEAD = 14;

const Reminders = {
  _timer: null,

  pendingOn(k) {
    return Stats.applicable(k).filter(a => a.reminder && !Store.isDone(k, a.id));
  },
  missedOn(k) {
    return Stats.applicable(k).filter(a => !Store.isDone(k, a.id));
  },

  plan() {
    const s = Store.data.settings.reminders;
    if (!s.enabled) return [];
    const now = new Date(), t = todayKey(), out = [];
    for (let d = 0; d < REMINDER_DAYS_AHEAD; d++) {
      const k = shiftKey(t, d), pending = this.pendingOn(k);
      if (!pending.length) continue;
      const groups = {};
      pending.forEach(a => { const tm = a.reminderTime || s.time; (groups[tm] = groups[tm] || []).push(a); });
      Object.keys(groups).sort().slice(0, 19).forEach((tm, i) => {
        const at = atTime(k, tm);
        if (at > now) out.push(this._note(1000 + d * 20 + i, at, groups[tm], k));
      });
      if (s.secondEnabled) {
        const at = atTime(k, s.secondTime);
        if (at > now) out.push(this._note(1000 + d * 20 + 19, at, pending, k));
      }
    }
    return out;
  },

  _note(id, at, list, date) {
    const n = list.length;
    return {
      id, at, date,
      title: `${n} ${n === 1 ? 'activity' : 'activities'} not done yet`,
      body: `${list.map(a => a.name).join(', ')}. The day ends at midnight.`,
    };
  },

  async sync() {
    if (!window.NativeKit) return;
    try { await window.NativeKit.scheduleReminders(this.plan()); }
    catch (e) { console.warn('Could not schedule reminders', e); }
  },
  syncSoon() { clearTimeout(this._timer); this._timer = setTimeout(() => this.sync(), 700); },
};
