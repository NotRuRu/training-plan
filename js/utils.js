// Small helpers used all over the app: finding page elements,
// formatting numbers and times, and a few text/number tools.

export const select = selector => document.querySelector(selector);
export const selectAll = selector => document.querySelectorAll(selector);

/** A short random id such as "k3j9x0a". */
export const createId = () => Math.random().toString(36).slice(2, 9);

/** Makes text safe to put inside HTML (stops "<" and quotes from breaking the page). */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => '&#' + character.charCodeAt(0) + ';');
}

/** "2026-10-01" in the phone's own time zone. Used to group workouts per day. */
export function toDateKey(dateLike) {
  const date = new Date(dateLike);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 4_080_000 ms -> "1h 8m" */
export function formatDuration(milliseconds) {
  const totalMinutes = Math.round(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  return (hours ? hours + 'h ' : '') + (totalMinutes % 60) + 'm';
}

/** 9951 -> "9.95K", 950422 -> "950K", 850 -> "850" */
export function formatVolume(kg) {
  return kg >= 1000 ? +(kg / 1000).toPrecision(3) + 'K' : Math.round(kg) + '';
}

/** 90 -> "1:30" (a timer display) */
export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

/** "1:30" -> 90, "90" -> 90, junk -> 0 */
export function parseClockTime(text) {
  const [first, second] = String(text).split(':');
  if (second === undefined) return Math.round(+first) || 0;
  return Math.round(+first * 60 + +second) || 0;
}

/** "8-10" -> [8, 10]. Falls back to [8] when there are no numbers. */
function repRangeNumbers(range) {
  return (String(range).match(/\d+/g) || [8]).map(Number);
}

/** Top of a rep range: "6-8" -> 8 */
export const repRangeTop = range => Math.max(...repRangeNumbers(range));

/** Bottom of a rep range: "6-8" -> 6 */
export const repRangeBottom = range => Math.min(...repRangeNumbers(range));

export const roundToHalf = number => Math.round(number * 2) / 2;

/** True when two texts match ignoring capitals and spaces around them. */
export function sameText(first, second) {
  return String(first).trim().toLowerCase() === String(second).trim().toLowerCase();
}

/** The most impressive working set (kg x reps). Warm-ups only count when there is nothing else. */
export function findBestSet(sets) {
  const workingSets = sets.filter(set => !set.warmup);
  return workingSets.sort((a, b) => b.kg * b.reps - a.kg * a.reps)[0] || sets[0];
}
