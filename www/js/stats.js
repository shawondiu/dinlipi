/* Dinlipi — calculations. Pure reads from Store; never writes.
   An activity counts on a day only if it existed (createdAt) and is scheduled for that weekday.
   Archived activities are left out. Days with nothing to track return null ("no data") and are
   skipped in averages, so days before you started, or rest days, never lower your scores. */

const Stats = {
  applicable(k) { return Store.active().filter(a => a.createdAt <= k && isScheduled(a, k)); },

  dayPct(k) {
    const list = this.applicable(k);
    if (!list.length) return null;
    return list.filter(a => Store.isDone(k, a.id)).length / list.length;
  },

  // Average of fn(dayKey) over `n` days ending `offset` days before today, skipping nulls.
  avg(fn, n, offset = 0) {
    const t = todayKey();
    let sum = 0, count = 0;
    for (let i = 0; i < n; i++) {
      const v = fn(shiftKey(t, -i - offset));
      if (v != null) { sum += v; count++; }
    }
    return count ? sum / count : null;
  },
  rangePct(n, offset = 0) { return this.avg(k => this.dayPct(k), n, offset); },
  actPct(id, n, offset = 0) {
    const a = Store.find(id);
    return this.avg(k => (a && a.createdAt <= k && isScheduled(a, k) ? (Store.isDone(k, id) ? 1 : 0) : null), n, offset);
  },

  isSuccess(k) {
    const p = this.dayPct(k);
    return p != null && p >= Store.data.settings.successThreshold;
  },

  /* Streaks skip days with nothing scheduled (they neither break nor extend a streak).
     test(k) returns true (counts), false (breaks) or null (skip). Starts from today,
     or yesterday when today isn't complete yet. */
  streak(test) {
    let k = todayKey(), n = 0, first = true;
    for (let guard = 0; guard < 3660; guard++, k = shiftKey(k, -1)) {
      if (k < Store.data.createdAt) break;
      const r = test(k);
      if (r === null) { first = false; continue; }
      if (r) n++;
      else if (first) { first = false; continue; }   // today not done yet: don't break
      else break;
      first = false;
    }
    return n;
  },
  best(test) {
    const t = todayKey(), span = Math.min(3660, daysBetween(Store.data.createdAt, t));
    let best = 0, run = 0;
    for (let i = span; i >= 0; i--) {
      const r = test(shiftKey(t, -i));
      if (r === null) continue;
      if (r) { run++; best = Math.max(best, run); } else run = 0;
    }
    return best;
  },
  _dayTest(k) { return this.dayPct(k) == null ? null : this.isSuccess(k); },
  daySuccessStreak() { return this.streak(k => this._dayTest(k)); },
  daySuccessBest() { return this.best(k => this._dayTest(k)); },
  actStreak(id) {
    const a = Store.find(id);
    return this.streak(k => (a.createdAt <= k && isScheduled(a, k) ? Store.isDone(k, id) : null));
  },

  timesDone(id) { return Object.values(Store.data.logs).filter(ids => ids.includes(id)).length; },
  firstDone(id) { return Object.keys(Store.data.logs).filter(k => Store.data.logs[k].includes(id)).sort()[0] || null; },
};
