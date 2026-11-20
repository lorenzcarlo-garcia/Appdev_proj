// Barangay times are stored as Philippine local time (UTC+8, no daylight saving).
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
// Small allowance for phone/laptop clocks that run slightly ahead.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
function manilaNow(extraMs = 0, now = Date.now()) {
  return new Date(now + MANILA_OFFSET_MS + extraMs).toISOString().slice(0, 19);
}
// date is a normalized local 'YYYY-MM-DDTHH:mm:ss' string.
function isFutureIncident(date, now = Date.now()) {
  return date > manilaNow(FUTURE_TOLERANCE_MS, now);
}
module.exports = {manilaNow, isFutureIncident};
