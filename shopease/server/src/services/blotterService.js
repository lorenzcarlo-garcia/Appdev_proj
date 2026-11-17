const {fields:reportFields}=require('./reportService');
const {guardEdit,blotterKeys,reportKeys}=require('./editToken');
const fields = "id, blotter_no, report_id, category_id, complainant_name, respondent_name, narrative, DATE_FORMAT(incident_date, '%Y-%m-%dT%H:%i:%s') AS incident_date, location, recorded_by, approved_by, approved_at, archived_at, archived_by, created_at, updated_at";
class BlotterError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new BlotterError(status, message); }
function validate(body,update=false) {
  const allowed = ['category_id', 'complainant_name', 'respondent_name', 'narrative', 'incident_date', 'location'];
  if(update)allowed.push('expected_token');
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) fail(400, 'Unexpected blotter fields');
  const data = {};
  for (const [key, max, required] of [['complainant_name',150,true], ['respondent_name',150,false], ['narrative',null,true], ['location',255,true]]) {
    if (body[key] != null && typeof body[key] !== 'string') fail(400, `Invalid ${key}`);
    const value = body[key]?.trim() || null;
    if ((required && !value) || (max && value && [...value].length > max) || (key === 'narrative' && value && Buffer.byteLength(value, 'utf8') > 65535)) fail(400, `Invalid or missing ${key}`);
    data[key] = value;
  }
  if (!Number.isInteger(body.category_id) || body.category_id < 1 || body.category_id > 4294967295) fail(400, 'Invalid category_id');
  data.category_id = body.category_id;
  if(update)data.expected_token=body.expected_token;
  let date = body.incident_date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(date)) fail(400, 'Provide local incident_date as YYYY-MM-DDTHH:mm[:ss]');
  date = date.replace(' ', 'T');
  if (date.length === 16) date += ':00';
  const parsed = new Date(date + 'Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,19) !== date || date.slice(0,4) < '1000') fail(400, 'Invalid incident_date');
  data.incident_date = date;
  return data;
}
const values = data => [data.category_id, data.complainant_name, data.respondent_name, data.narrative, data.incident_date.replace('T', ' '), data.location];
function blotterService(db) {
  async function transaction(work) {
    const connection = await db.getConnection();
    let begun = false;
    try {
      await connection.beginTransaction(); begun = true;
      const result = await work(connection);
      await connection.commit(); begun = false;
      return result;
    } catch (error) {
      if (begun) await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') fail(409, 'An official record already exists for this report or number');
      throw error;
    } finally { connection.release(); }
  }
  async function category(connection, id, existingId) {
    const [rows] = await connection.execute('SELECT id, is_active FROM incident_categories WHERE id = ? FOR SHARE', [id]);
    if (!rows.length || (!rows[0].is_active && id !== existingId)) fail(400, 'Choose an existing active category');
  }
  async function locked(connection, id) {
    const [rows] = await connection.execute(`SELECT ${fields} FROM blotter_records WHERE id = ? FOR UPDATE`, [id]);
    if (!rows.length) fail(404, 'Blotter record not found');
    if (rows[0].archived_at) fail(409, 'Archived blotter records cannot be changed');
    return rows[0];
  }
  async function insert(connection, actor, data, reportId = null) {
    await category(connection, data.category_id);
    const approver = reportId === null ? null : actor;
    const [result] = await connection.execute('INSERT INTO blotter_records (report_id, category_id, complainant_name, respondent_name, narrative, incident_date, location, recorded_by, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? IS NULL, NULL, CURRENT_TIMESTAMP))', [reportId, ...values(data), actor, approver, approver]);
    const year = new Intl.DateTimeFormat('en-US', {year:'numeric',timeZone:'Asia/Manila'}).format(new Date());
    const number = 'BLT-' + year + '-' + String(result.insertId).padStart(6, '0');
    await connection.execute('UPDATE blotter_records SET blotter_no = ? WHERE id = ?', [number, result.insertId]);
    return {id:result.insertId, blotter_no:number, report_id:reportId};
  }
  function convert(reportId, actor, body) {
    if (!body || body.confirm !== true) fail(400,'Explicit approval is required: confirm must be true');
    const {confirm, expected_report_token, ...details} = body;
    const data = validate(details);
    return transaction(async connection => {
      // Sharing the report lock serializes approval with status changes/cancellation.
      const [reports] = await connection.execute(expected_report_token===undefined?'SELECT id, submission_stage, status, cancelled_at FROM incident_reports WHERE id = ? FOR UPDATE':`SELECT ${reportFields} FROM incident_reports WHERE id = ? FOR UPDATE`, [reportId]);
      const report = reports[0];
      if (!report || report.submission_stage !== 'Submitted') fail(404,'Report not found');
      if (report.cancelled_at) fail(409,'Cancelled reports cannot become blotter records');
      guardEdit(report,expected_report_token,reportKeys);
      const [existing] = await connection.execute('SELECT id FROM blotter_records WHERE report_id = ?', [reportId]);
      if (existing.length) fail(409,'This report already has a blotter record');
      // Conversion creates a linked official snapshot and preserves report status.
      return insert(connection, actor, data, reportId);
    });
  }
  return {
    convert,
    create: (actor, body) => {
      const data = validate(body);
      return transaction(connection => insert(connection, actor, data));
    },
    update: (id, body) => {
      const data = validate(body,true);
      return transaction(async connection => {
        const row = await locked(connection, id);
        guardEdit(row,data.expected_token,blotterKeys);
        // Existing inactive categories may be retained; new selections must be active.
        await category(connection, data.category_id, row.category_id);
        await connection.execute('UPDATE blotter_records SET category_id = ?, complainant_name = ?, respondent_name = ?, narrative = ?, incident_date = ?, location = ? WHERE id = ?', [...values(data), id]);
        return {id, message:'Blotter record updated'};
      });
    },
    archive: (id, actor, body) => {
      if (!body || body.confirm !== true || Object.keys(body).some(key => key !== 'confirm')) fail(400, 'Explicit confirmation is required: confirm must be true');
      return transaction(async connection => {
        await locked(connection, id);
        await connection.execute('UPDATE blotter_records SET archived_at = CURRENT_TIMESTAMP, archived_by = ? WHERE id = ?', [actor, id]);
        return {id, message:'Blotter record archived'};
      });
    }
  };
}
module.exports = {blotterService, BlotterError, fields};
