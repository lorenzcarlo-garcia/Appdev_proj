function validate(body) {
  const allowed = ['first_name', 'middle_name', 'last_name', 'birth_date', 'contact_no', 'address'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) return null;
  const data = {};
  for (const [key, max, required] of [['first_name',80,true],['middle_name',80,false],['last_name',80,true],['contact_no',20,false],['address',255,true]]) {
    if (body[key] != null && typeof body[key] !== 'string') return null;
    const value = body[key]?.trim() || null;
    if ((required && !value) || (value && [...value].length > max)) return null;
    data[key] = value;
  }
  data.birth_date = body.birth_date === '' || body.birth_date == null ? null : body.birth_date;
  if (data.birth_date !== null) {
    if (typeof data.birth_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.birth_date)) return null;
    const date = new Date(data.birth_date + 'T00:00:00Z');
    const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== data.birth_date || data.birth_date < '1000-01-01' || data.birth_date > today) return null;
  }
  return data;
}

module.exports={validate};
