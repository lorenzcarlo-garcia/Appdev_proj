const dateOptions = {timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'};
const dateFormatter = new Intl.DateTimeFormat('en-PH', dateOptions);
const dateTimeFormatter = new Intl.DateTimeFormat('en-PH', {...dateOptions,hour:'numeric',minute:'2-digit'});
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== 'string') return null;
  let text = value.trim();
  // MySQL incident DATETIME values are local barangay time, not browser time.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += 'T00:00:00+08:00';
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(text)) text = text.replace(' ','T') + '+08:00';
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}
export function formatDate(value, fallback = 'Not provided') {
  const date = parseDate(value);
  return date ? dateFormatter.format(date) : fallback;
}
export function formatDateTime(value, fallback = 'Not provided') {
  const date = parseDate(value);
  return date ? dateTimeFormatter.format(date) : fallback;
}
