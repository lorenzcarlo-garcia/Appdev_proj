// Manual real-MySQL check (not part of npm test): node test/mysql/dashboard.mysql.js
// Inserts synthetic rows inside ONE transaction, verifies the SQL, then ROLLS BACK.
// Nothing is committed. Auto-increment counters may advance (MySQL never reuses
// rolled-back IDs); that only leaves harmless gaps, never changes existing records.
const assert=require('node:assert/strict');
const db=require('../../src/config/database');
const {dashboardService}=require('../../src/services/dashboardService');
const {logActivity}=require('../../src/services/activityLog');
const {submittedAtSql,sqlStart}=require('../../src/services/dashboardFilters');
(async()=>{
  const c=await db.getConnection();let passed=0;
  const check=(label,fn)=>{fn();passed++;console.log('ok -',label);};
  try{
    await c.beginTransaction();
    const [[tz]]=await c.query('SELECT @@session.time_zone AS tz');
    check('session time zone is +08:00',()=>assert.equal(tz.tz,'+08:00'));
    const [user]=await c.execute("INSERT INTO users (email, password_hash, role) VALUES (?, 'synthetic-not-a-hash', 'resident')",[`synthetic-${Date.now()}@example.invalid`]);
    const [cat]=await c.execute('INSERT INTO incident_categories (name) VALUES (?)',[`Synthetic ${Date.now()}`]);
    const [area]=await c.execute('INSERT INTO report_areas (name) VALUES (?)',[`Synthetic area ${Date.now()}`]);
    const uid=user.insertId,cid=cat.insertId,aid=area.insertId;
    async function report({stage='Submitted',status='Submitted',created='2026-11-01 08:00:00',cancelled=null,areaId=null,submitted=null}){
      const [r]=await c.execute('INSERT INTO incident_reports (user_id, category_id, title, area_id, submission_stage, status, cancelled_at, cancelled_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',[uid,cid,'Synthetic',areaId,stage,stage==='Draft'?null:status,cancelled,cancelled?uid:null,created]);
      if(submitted) await c.execute("INSERT INTO report_status_history (report_id, old_status, new_status, changed_by, created_at) VALUES (?, NULL, 'Submitted', ?, ?)",[r.insertId,uid,submitted]);
      return r.insertId;
    }
    await report({areaId:aid,submitted:'2026-11-16 00:00:00'});                                  // Monday start: counted
    await report({status:'Resolved',created:'2026-10-01 09:00:00',submitted:'2026-11-22 23:59:59'}); // drafted in Oct, submitted Sunday
    await report({status:'Under Investigation',submitted:'2026-11-23 00:00:00'});                  // next Monday: outside the week
    await report({submitted:'2026-11-17 10:00:00',cancelled:'2026-11-18 10:00:00'});               // cancelled: excluded
    await report({stage:'Draft',created:'2026-11-18 10:00:00'});                                   // draft: excluded
    await report({created:'2026-11-18 10:00:00'});                                                 // no submission record: anomaly
    const service=dashboardService({execute:(sql,args)=>c.execute(sql,args)});
    const week=await service.summary({period:'custom',from:'2026-11-16',to:'2026-11-22',granularity:'day',category_id:String(cid)});
    check('cohort uses submission time, half-open range, excludes drafts/cancelled',()=>assert.deepEqual(week.cohort,{received:2,awaiting:1,ongoing:0,resolved:1}));
    check('day buckets are zero-filled and placed by Manila date',()=>assert.deepEqual(week.series.map(row=>row.total),[1,0,0,0,0,0,1]));
    check('areas include Unassigned',()=>assert.deepEqual(week.areas.map(row=>[row.name===null?null:row.id===null?'Unassigned':'area',row.total]).sort(),[['Unassigned',1],['area',1]]));
    check('missing submission records are reported, not guessed',()=>assert.equal(week.anomalies.missing_submission_record,1));
    const weeks=await service.summary({period:'custom',from:'2026-11-16',to:'2026-11-23',granularity:'week',category_id:String(cid)});
    check('Sunday 23:59:59 and Monday 00:00 fall in different Monday weeks',()=>assert.deepEqual(weeks.series,[{bucket:'2026-11-16',total:2},{bucket:'2026-11-23',total:1}]));
    const unassigned=await service.summary({period:'custom',from:'2026-11-16',to:'2026-11-22',category_id:String(cid),area_id:'unassigned'});
    check('area filter applies before aggregation',()=>assert.equal(unassigned.cohort.received,1));
    const [[list]]=await c.execute(`SELECT COUNT(*) AS total FROM incident_reports WHERE submission_stage = 'Submitted' AND cancelled_at IS NULL AND category_id = ? AND ${submittedAtSql('incident_reports')} >= ? AND ${submittedAtSql('incident_reports')} < ?`,[cid,sqlStart('2026-11-16'),sqlStart('2026-11-23')]);
    check('report-list date filter matches the dashboard cohort',()=>assert.equal(Number(list.total),week.cohort.received));
    await logActivity(c,{id:uid,role:'resident'},{action:'report.submitted',entityType:'report',entityId:1,entityRef:'Synthetic'});
    const [[entry]]=await c.query('SELECT TIMESTAMPDIFF(MINUTE, created_at, UTC_TIMESTAMP() + INTERVAL 8 HOUR) AS drift FROM activity_log WHERE actor_id = ?',[uid]);
    check('activity insert satisfies constraints and stores Manila time',()=>assert(Math.abs(Number(entry.drift))<=1));
    console.log(`\n${passed} real-MySQL checks passed`);
  }catch(error){console.error('FAILED:',error.message);process.exitCode=1;}
  finally{await c.rollback();c.release();
    const [[left]]=await db.query("SELECT COUNT(*) AS n FROM users WHERE email LIKE 'synthetic-%@example.invalid'");
    console.log('rolled back; synthetic users remaining:',left.n);await db.end();}
})();
