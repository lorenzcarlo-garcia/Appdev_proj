const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function todayInManila() {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part = type => parts.find(value => value.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
// Philippine local time (UTC+8, no daylight saving) as YYYY-MM-DDTHH:mm:ss.
export function nowInManila(extraMs = 0, now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1000 + extraMs).toISOString().slice(0, 19);
}
// Matches the server's five-minute allowance for clocks that run slightly ahead.
export const futureToleranceMs = 5 * 60 * 1000;
export function validateLogin(form) {
  const errors = {};
  const email = form.email.trim();
  if (!email || email.length > 150 || !emailPattern.test(email)) errors.email = 'Enter a valid email address.';
  if (form.password.length < 12 || form.password.length > 128) errors.password = 'Use a password with 12-128 characters.';
  return errors;
}
export function validateRegistration(form) {
  const errors = validateLogin(form);
  for (const [key,label,max,required] of [['first_name','First name',80,true],['middle_name','Middle name',80,false],['last_name','Last name',80,true],['contact_no','Contact number',20,false],['address','Address',255,true]]) {
    const value = form[key].trim();
    if (required && !value) errors[key] = `${label} is required.`;
    else if (form[key].length > max) errors[key] = `${label} must be ${max} characters or fewer.`;
  }
  if (form.confirm_password !== form.password || !form.confirm_password) errors.confirm_password = 'Passwords must match.';
  if (form.birth_date) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(form.birth_date) ? new Date(form.birth_date + 'T00:00:00Z') : new Date(NaN);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== form.birth_date || form.birth_date < '1000-01-01' || form.birth_date > todayInManila()) errors.birth_date = 'Enter a valid birth date that is not in the future.';
  }
  return errors;
}
export function registrationPayload(form) {
  return {
    email: form.email.trim().toLowerCase(), password: form.password,
    first_name: form.first_name.trim(), middle_name: form.middle_name.trim() || null,
    last_name: form.last_name.trim(), birth_date: form.birth_date || null,
    contact_no: form.contact_no.trim() || null, address: form.address.trim(),
  };
}
export function authErrorMessage(error, fallback) {
  if (error.response?.status === 429) return 'Too many attempts. Please wait 15 minutes before trying again.';
  if (error.response?.status === 403) return 'Your security check expired or the connection address is not allowed. Refresh this page and try again.';
  return typeof error.response?.data?.message === 'string' ? error.response.data.message : fallback;
}

// areaRequired: active areas exist (new submissions) or the report already has an area.
export function validateReport(form, {submit = false, activeCategoryIds = [], activeAreaIds = [], areaRequired = false} = {}) {
  const errors = {};
  for (const [key,label,max] of [['title','Title',150],['location','Location',255],['description','Description',null]]) {
    const value = form[key].trim();
    if (submit && !value) errors[key] = `${label} is required to submit.`;
    else if (max && [...value].length > max) errors[key] = `${label} must be ${max} characters or fewer.`;
    else if (key === 'description' && new TextEncoder().encode(value).length > 65535) errors[key] = 'Description is too long. Please shorten it.';
  }
  const category = form.category_id;
  if (category !== '' && (!/^[1-9]\d*$/.test(category) || Number(category) > 4294967295)) errors.category_id = 'Choose a valid category.';
  else if (submit && (category === '' || !activeCategoryIds.includes(Number(category)))) errors.category_id = 'Choose an active category before submitting.';
  const area = form.area_id ?? '';
  if (area !== '' && (!/^[1-9]\d*$/.test(area) || Number(area) > 4294967295)) errors.area_id = 'Choose a valid area.';
  else if (area === '' && submit && areaRequired) errors.area_id = 'Choose the area or purok of the concern.';
  else if (area !== '' && !activeAreaIds.includes(Number(area))) errors.area_id = 'This area is no longer available. Choose an active area.';
  const dateText = form.incident_date;
  if (!dateText) {
    if (submit) errors.incident_date = 'Incident date and time are required to submit.';
  } else {
    const normalized = dateText.length === 16 ? dateText + ':00' : dateText;
    const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized) ? new Date(normalized + 'Z') : new Date(NaN);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,19) !== normalized || normalized.slice(0,4) < '1000') errors.incident_date = 'Enter a valid incident date and time in Philippine time.';
    else if (normalized > nowInManila(futureToleranceMs)) errors.incident_date = 'The date and time of the concern cannot be in the future.';
  }
  return errors;
}
export function reportPayload(form) {
  return {
    category_id:form.category_id === '' ? null : Number(form.category_id),
    title:form.title.trim() || null,
    description:form.description.trim() || null,
    location:form.location.trim() || null,
    area_id:(form.area_id ?? '') === '' ? null : Number(form.area_id),
    incident_date:form.incident_date ? (form.incident_date.length === 16 ? form.incident_date + ':00' : form.incident_date) : null,
  };
}

export function validatePasswordChange(form) {
  const errors={};
  if(!form.current_password || form.current_password.length>128) errors.current_password='Enter your current password.';
  if(form.new_password.length<12 || form.new_password.length>128) errors.new_password='Use 12-128 characters for the new password.';
  else if(form.new_password===form.current_password) errors.new_password='Choose a password different from your current password.';
  if(!form.confirm_password || form.confirm_password!==form.new_password) errors.confirm_password='New passwords must match.';
  return errors;
}
