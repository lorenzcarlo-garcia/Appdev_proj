const {guardEdit,editToken,reportKeys}=require('./editToken');
const {isFutureIncident}=require('./manilaTime');
const {logActivity,reportRef}=require('./activityLog');
const fields = "id, reference_no, resident_report_no, user_id, category_id, title, description, location, area_id, DATE_FORMAT(incident_date, '%Y-%m-%dT%H:%i:%s') AS incident_date, submission_stage, status, cancelled_at, cancelled_by, created_at, updated_at";
const contentKeys = ['category_id','title','description','location','incident_date','area_id'];
const validId = value => /^[1-9]\d*$/.test(value) && Number(value) <= 4294967295;
const validNumber = value => Number.isInteger(value) && value>=1 && value<=4294967295;
class ReportError extends Error {
  constructor(status,message) { super(message); this.status=status; }
}
function fail(status,message) { throw new ReportError(status,message); }
function content(body, required) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key=>!contentKeys.includes(key))) fail(400,'Unexpected report fields');
  const result = {};
  for (const [key,max] of [['title',150],['description',null],['location',255]]) {
    if (body[key] != null && typeof body[key] !== 'string') fail(400,`Invalid ${key}`);
    const value=body[key]?.trim() || null;
    if ((required && !value) || (value && max && [...value].length>max) || (key==='description' && value && Buffer.byteLength(value,'utf8')>65535)) fail(400,`Invalid or missing ${key}`);
    result[key]=value;
  }
  const category=body.category_id == null ? null : body.category_id;
  if ((required && category===null) || (category!==null && !validNumber(category))) fail(400,'Invalid or missing category_id');
  result.category_id=category;
  // Whether an area is required depends on the configured areas; checked in the transaction.
  const areaId=body.area_id == null ? null : body.area_id;
  if (areaId!==null && !validNumber(areaId)) fail(400,'Invalid area_id');
  result.area_id=areaId;
  let date=body.incident_date === '' || body.incident_date == null ? null : body.incident_date;
  if (required && !date) fail(400,'incident_date is required');
  if (date!==null) {
    if (typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(date)) fail(400,'incident_date must be local YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss');
    date=date.replace(' ','T'); if(date.length===16) date+=':00';
    const parsed=new Date(date+'Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,19)!==date || date.slice(0,4)<'1000') fail(400,'Invalid incident_date');
    if (isFutureIncident(date)) fail(400,'The date and time of the concern cannot be in the future');
  }
  result.incident_date=date;
  return result;
}
function storedContent(row) { return Object.fromEntries(contentKeys.map(key=>[key,row[key]])); }
// area_id is last so earlier positional columns keep their order.
const values = data => [data.category_id,data.title,data.description,data.location,data.incident_date?.replace('T',' ') || null,data.area_id ?? null];
function reportService(db) {
  async function transaction(work) {
    const connection=await db.getConnection(); let begun=false;
    try { await connection.beginTransaction(); begun=true; const result=await work(connection); await connection.commit(); begun=false; return result; }
    catch(error) { if(begun) await connection.rollback(); throw error; }
    finally {connection.release();}
  }
  async function category(connection,id,active) {
    if(id===null) return;
    const [rows]=await connection.execute('SELECT id, is_active FROM incident_categories WHERE id = ? FOR SHARE',[id]);
    if(!rows.length || (active && !rows[0].is_active)) fail(400,'Choose an existing active category before submitting');
  }
  // Areas are optional until the barangay has configured at least one active area.
  // A report may keep an area that was later deactivated (existing); new picks must be active.
  async function area(connection,id,required,existing=null) {
    if(id===null) {
      if(required) {
        const [active]=await connection.execute('SELECT id FROM report_areas WHERE is_active = 1 LIMIT 1');
        if(active.length) fail(400,'Choose the area or purok of the concern before submitting');
      }
      return null;
    }
    const [rows]=await connection.execute('SELECT id, name, is_active FROM report_areas WHERE id = ? FOR SHARE',[id]);
    if(!rows.length || (!rows[0].is_active && id!==existing)) fail(400,'Choose an existing active area');
    return rows[0];
  }
  async function owned(connection,id,userId) {
    const [rows]=await connection.execute(`SELECT ${fields} FROM incident_reports WHERE id = ? AND user_id = ? FOR UPDATE`,[id,userId]);
    if(!rows.length) fail(404,'Report not found');
    return rows[0];
  }
  function editable(row) {
    if(row.cancelled_at || (row.submission_stage!=='Draft' && row.status!=='Submitted')) fail(409,'This report can no longer be edited');
  }
  async function finalize(connection,id,userId,data) {
    await category(connection,data.category_id,true);
    await area(connection,data.area_id,true);
    // Serializes submissions by the same resident; allocation rolls back on failure.
    await connection.execute('INSERT INTO resident_report_counters (user_id, last_report_no) VALUES (?, 1) ON DUPLICATE KEY UPDATE last_report_no = last_report_no + 1',[userId]);
    const [counters]=await connection.execute('SELECT last_report_no FROM resident_report_counters WHERE user_id = ? FOR UPDATE',[userId]);
    const residentNumber=Number(counters[0].last_report_no);
    const year=new Intl.DateTimeFormat('en-US',{year:'numeric',timeZone:'Asia/Manila'}).format(new Date());
    const reference='RPT-'+year+'-'+String(id).padStart(6,'0');
    await connection.execute('UPDATE incident_reports SET submission_stage = ?, status = ?, reference_no = ?, resident_report_no = ? WHERE id = ?', ['Submitted','Submitted',reference,residentNumber,id]);
    await connection.execute('INSERT INTO report_status_history (report_id, old_status, new_status, changed_by, remarks) VALUES (?, ?, ?, ?, ?)',[id,null,'Submitted',userId,null]);
    // Drafts are private, so only the submission itself becomes visible activity.
    await logActivity(connection,{id:userId,role:'resident'},{action:'report.submitted',entityType:'report',entityId:id,entityRef:reference});
    return {id,reference_no:reference,resident_report_no:residentNumber,submission_stage:'Submitted',status:'Submitted'};
  }
  async function changeStatus(id, actor, body) {
    const nextStatus = {'Submitted':'Under Investigation','Under Investigation':'Scheduled for Action','Scheduled for Action':'Resolved'};
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['status','remarks','expected_token'].includes(key)) || !['Submitted','Under Investigation','Scheduled for Action','Resolved'].includes(body.status) || (body.remarks != null && typeof body.remarks !== 'string') || (typeof body.remarks === 'string' && [...body.remarks.trim()].length > 500)) fail(400,'Provide a valid status and optional remarks up to 500 characters');
    const remarks = body.remarks?.trim() || null;
    return transaction(async connection => {
      const [rows] = await connection.execute(body.expected_token===undefined?'SELECT id, reference_no, submission_stage, status, cancelled_at FROM incident_reports WHERE id = ? FOR UPDATE':`SELECT ${fields} FROM incident_reports WHERE id = ? FOR UPDATE`, [id]);
      const row = rows[0];
      if (!row || row.submission_stage !== 'Submitted') fail(404,'Report not found');
      if (row.cancelled_at) fail(409,'Cancelled reports cannot be processed');
      guardEdit(row,body.expected_token,reportKeys);
      if (nextStatus[row.status] !== body.status) fail(409,'Follow Submitted -> Under Investigation -> Scheduled for Action -> Resolved; resolved reports cannot be reopened');
      await connection.execute('UPDATE incident_reports SET status = ? WHERE id = ?', [body.status,id]);
      await connection.execute('INSERT INTO report_status_history (report_id, old_status, new_status, changed_by, remarks) VALUES (?, ?, ?, ?, ?)', [id,row.status,body.status,actor.id,remarks]);
      const publicProgress={'Under Investigation':'Ongoing','Scheduled for Action':'Planned',Resolved:'Completed'}[body.status];
      await connection.execute("UPDATE community_updates SET maintenance_status = ?, updated_by = ?, version = version + 1 WHERE source_report_id = ? AND publication_state <> 'Archived'",[publicProgress,actor.id,id]);
      // Remarks are resident-facing case notes and are deliberately not copied here.
      await logActivity(connection,actor,{action:'report.status_changed',entityType:'report',entityId:id,entityRef:reportRef(row),detail:`${row.status} → ${body.status}`});
      return {id,status:body.status,message:'Report status updated'};
    });
  }
  async function assignArea(id, actor, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key=>!['area_id','expected_token'].includes(key)) || (body.area_id!==null && !validNumber(body.area_id))) fail(400,'Provide an area_id, or null for Unassigned');
    return transaction(async connection => {
      const [rows]=await connection.execute(`SELECT ${fields} FROM incident_reports WHERE id = ? FOR UPDATE`,[id]);
      const row=rows[0];
      if (!row || row.submission_stage !== 'Submitted') fail(404,'Report not found');
      if (row.cancelled_at) fail(409,'Cancelled reports are read-only');
      guardEdit(row,body.expected_token,reportKeys);
      const chosen=await area(connection,body.area_id,false,row.area_id);
      if ((row.area_id ?? null) === body.area_id) return {id,area_id:body.area_id,message:'Area unchanged',edit_token:editToken(row,reportKeys)};
      await connection.execute('UPDATE incident_reports SET area_id = ? WHERE id = ?',[body.area_id,id]);
      await logActivity(connection,actor,{action:'report.area_assigned',entityType:'report',entityId:id,entityRef:reportRef(row),detail:`Area: ${chosen ? chosen.name : 'Unassigned'}`});
      return {id,area_id:body.area_id,message:'Report area updated',edit_token:editToken({...row,area_id:body.area_id},reportKeys)};
    });
  }
  return {
    changeStatus,
    assignArea,
    create: (userId,body,submit) => {
      const data=content(body,submit);
      return transaction(async connection=>{
        await category(connection,data.category_id,submit);
        await area(connection,data.area_id,submit);
        const [result]=await connection.execute('INSERT INTO incident_reports (user_id, category_id, title, description, location, incident_date, area_id) VALUES (?, ?, ?, ?, ?, ?, ?)',[userId,...values(data)]);
        if(submit) return finalize(connection,result.insertId,userId,data);
        return {id:result.insertId,reference_no:null,resident_report_no:null,submission_stage:'Draft',status:null};
      });
    },
    save: (id,userId,body) => transaction(async connection=>{
      const row=await owned(connection,id,userId); editable(row);
      // PUT replaces the full form; draft fields may be empty, submitted fields may not.
      if(!body || typeof body!=='object' || Array.isArray(body))fail(400,'Unexpected report fields');
      const {expected_token,...details}=body;
      guardEdit(row,expected_token,reportKeys);
      const submitted=row.submission_stage==='Submitted';
      const data=content(details,submitted);
      await category(connection,data.category_id,submitted);
      // Older submitted reports may stay Unassigned; an assigned area cannot be cleared.
      await area(connection,data.area_id,submitted && row.area_id!=null,row.area_id ?? null);
      await connection.execute('UPDATE incident_reports SET category_id = ?, title = ?, description = ?, location = ?, incident_date = ?, area_id = ? WHERE id = ?', [...values(data),id]);
      return {id,message:'Report saved',edit_token:editToken({...row,...data},reportKeys)};
    }),
    submit: (id,userId) => transaction(async connection=>{
      const row=await owned(connection,id,userId);
      if(row.submission_stage!=='Draft' || row.cancelled_at) fail(409,'Only a private draft can be submitted');
      const data=content(storedContent(row),true);
      return finalize(connection,id,userId,data);
    }),
    cancel: (id,userId) => transaction(async connection=>{
      const row=await owned(connection,id,userId);
      if(row.cancelled_at || !(row.submission_stage==='Draft' || (row.submission_stage==='Submitted' && row.status==='Submitted'))) fail(409,'Only an active draft or Submitted report can be cancelled');
      await connection.execute('UPDATE incident_reports SET cancelled_at = CURRENT_TIMESTAMP, cancelled_by = ? WHERE id = ?', [userId,id]);
      await connection.execute("UPDATE community_updates SET publication_state = 'Archived', archived_by = ?, archived_at = CURRENT_TIMESTAMP, updated_by = ?, version = version + 1 WHERE source_report_id = ? AND publication_state <> 'Archived'",[userId,userId,id]);
      if(row.submission_stage==='Submitted') await logActivity(connection,{id:userId,role:'resident'},{action:'report.cancelled',entityType:'report',entityId:id,entityRef:reportRef(row)});
      return {id,message:row.submission_stage==='Draft'?'Draft cancelled':'Report cancelled'};
    })
  };
}
module.exports={reportService,ReportError,fields,validId};
