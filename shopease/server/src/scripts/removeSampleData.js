// Removes ONLY the sample data added by seedSampleData.js (accounts residentN@example.com
// and sample-staff@example.com, their resident records and their reports).
//   npm.cmd run sample:remove            -> dry run: shows what would be removed
//   npm.cmd run sample:remove -- --apply -> removes it in one transaction
// It stops without changing anything if official records (blotters, community updates)
// or photos were created from sample reports; review those by hand first.
const db=require('../config/database');
const APPLY=process.argv.includes('--apply');
(async()=>{
  const c=await db.getConnection();
  try{
    await c.beginTransaction();
    const [users]=await c.query("SELECT id, resident_id FROM users WHERE email REGEXP '^resident[0-9]+@example\\\\.com$' OR email = 'sample-staff@example.com' FOR UPDATE");
    if(!users.length){console.log('No sample data found.');await c.rollback();return;}
    const ids=users.map(u=>u.id),residentIds=users.map(u=>u.resident_id).filter(Boolean);
    const [reports]=await c.query('SELECT id FROM incident_reports WHERE user_id IN (?) FOR UPDATE',[ids]);
    const reportIds=reports.map(r=>r.id).concat(0); // 0 keeps IN () valid when empty
    const [[blockers]]=await c.query('SELECT (SELECT COUNT(*) FROM blotter_records WHERE report_id IN (?)) AS blotters, (SELECT COUNT(*) FROM community_updates WHERE source_report_id IN (?)) AS updates, (SELECT COUNT(*) FROM report_attachments WHERE report_id IN (?)) AS photos',[reportIds,reportIds,reportIds]);
    if(blockers.blotters || blockers.updates || blockers.photos) throw new Error(`Sample reports are linked to ${blockers.blotters} blotter(s), ${blockers.updates} community update(s) and ${blockers.photos} photo(s). Remove or review those first.`);
    const run=async(label,sql,args)=>{const [r]=await c.query(sql,args);console.log(`${label}: ${r.affectedRows}`);};
    await run('activity entries',"DELETE FROM activity_log WHERE actor_id IN (?) OR (entity_type = 'report' AND entity_id IN (?)) OR (entity_type = 'resident' AND entity_id IN (?))",[ids,reportIds,residentIds.concat(0)]);
    await run('status history rows','DELETE FROM report_status_history WHERE report_id IN (?) OR changed_by IN (?)',[reportIds,ids]);
    await run('reports','DELETE FROM incident_reports WHERE id IN (?)',[reportIds]);
    await run('report counters','DELETE FROM resident_report_counters WHERE user_id IN (?)',[ids]);
    await run('sessions',"DELETE FROM sessions WHERE JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(data), data, '{}'), '$.userId')) IN (?)",[ids.map(String)]);
    await run('staff profiles','DELETE FROM staff_profiles WHERE user_id IN (?)',[ids]);
    await run('accounts','DELETE FROM users WHERE id IN (?)',[ids]);
    await run('resident records','DELETE FROM residents WHERE id IN (?)',[residentIds.concat(0)]);
    if(APPLY){await c.commit();console.log('\nSample data removed.');}
    else {await c.rollback();console.log('\nDry run only: nothing was removed. Add -- --apply to remove.');}
  }catch(error){await c.rollback();console.error('Nothing removed:',error.message);process.exitCode=1;}
  finally{c.release();await db.end();}
})();
