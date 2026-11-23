const {credentialTag}=require('../src/services/sessionCredentials');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const session=require('express-session');
const {createHmac,randomBytes}=require('node:crypto');
const {createApp}=require('../src/server');
const {summaryPeriod}=require('../src/services/pdf/reportPdfService');
const config={clientOrigin:'http://localhost:5173',sessionSecret:'synthetic-pdf-session-secret-over-32-bytes',production:false};
const roles=['resident','staff','secretary','captain','super_admin'];
const NOW=Date.UTC(2026,10,18,2,0,0); // Wed 18 Nov 2026, 10:00 Manila

test('summary periods are Monday weeks, calendar months and years in Manila time',()=>{
  assert.deepEqual(summaryPeriod({period:'week',date:'2026-11-22'},NOW),{period:'week',start:'2026-11-16',end:'2026-11-23',last:'2026-11-22',label:'Week of Nov 16, 2026 to Nov 22, 2026',granularity:'day',inProgress:true});
  const month=summaryPeriod({period:'month',date:'2026-10-15'},NOW);
  assert.deepEqual([month.start,month.end,month.label,month.granularity,month.inProgress],['2026-10-01','2026-11-01','October 2026','week',false]);
  const year=summaryPeriod({period:'year',date:'2025-06-01'},NOW);
  assert.deepEqual([year.start,year.end,year.label,year.granularity],['2025-01-01','2026-01-01','Year 2025','month']);
  for(const query of [{period:'day',date:'2026-11-01'},{period:'week',date:'2026-02-30'},{period:'month'},{period:'week',date:'2026-12-01'},{period:'year',date:'2026-01-01',extra:'1'}])
    assert.throws(()=>summaryPeriod(query,NOW),{status:400},JSON.stringify(query));
});

async function fixture(t){
  const state={calls:[],activity:[]};
  const execute=async(sql,args=[])=>{
    state.calls.push({sql,args});
    if(sql.startsWith('SELECT id, email'))return [[{id:args[0],email:'synthetic@example.invalid',role:roles[args[0]-1],resident_id:null,is_active:1,password_hash:'synthetic-resource-hash'}]];
    if(sql.startsWith('INSERT INTO activity_log')){state.activity.push(args);return [{insertId:state.activity.length}];}
    if(sql.startsWith('SELECT u.role'))return [[{role:roles[args[0]-1],first_name:args[0]===3?'Ana':null,middle_name:null,last_name:args[0]===3?'Reyes':null}]];
    if(sql.includes('FROM blotter_records WHERE id = ?'))return [args[0]===1?[{id:1,blotter_no:'BLT-2026-000001',report_id:null,category_id:1,category_name:'Noise Complaint',complainant_name:'Synthetic Complainant',respondent_name:null,narrative:'Synthetic narrative',incident_date:'2026-11-01T20:00:00',location:'Synthetic place',recorded_by:3,approved_by:null,approved_at:null,archived_at:null,created_at:'2026-11-02 09:00:00'}]:[]];
    if(sql.startsWith('SELECT COUNT(*) AS received'))return [[{received:2,awaiting:1,ongoing:0,resolved:1}]];
    if(sql.includes('AS bucket'))return [[{bucket:'2026-11-17',total:2}]];
    if(sql.includes('LEFT JOIN incident_categories c ON c.id = r.category_id ') && sql.includes('GROUP BY'))return [[{id:1,name:'Noise Complaint',is_active:1,total:2}]];
    if(sql.includes('LEFT JOIN report_areas a ON a.id = r.area_id ') && sql.includes('GROUP BY'))return [[{id:3,name:'Purok 1',is_active:1,total:2}]];
    if(sql.includes('NOT EXISTS (SELECT 1 FROM report_status_history h WHERE h.report_id = r.id AND h.old_status'))return [[{total:0}]];
    if(sql.startsWith('SELECT COUNT(DISTINCT r.id)'))return [[{total:1}]];
    if(sql.startsWith('SELECT COUNT(*) AS total FROM incident_reports r WHERE'))return [[{total:4}]];
    if(sql.startsWith('SELECT * FROM (SELECT r.reference_no'))return [[{reference_no:'RPT-2026-000010',submitted_at:'2026-11-17 08:00:00',category:'Noise Complaint',area:'Purok 1',status:'Resolved'}]];
    if(sql.startsWith('SELECT b.blotter_no'))return [[{blotter_no:'BLT-2026-000001',created_at:'2026-11-17 09:00:00',incident_date:'2026-11-16 20:00:00',category:'Noise Complaint',report_id:null,archived_at:null}]];
    throw new Error('Unexpected PDF test SQL: '+sql.slice(0,60));
  };
  const store=new session.MemoryStore();const app=createApp({config,db:{execute,query:async()=>[[{}]]},sessionStore:store});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.clear();});
  const cookies={};
  for(let userId=1;userId<=roles.length;userId++){
    const sid=randomBytes(24).toString('hex');await new Promise(resolve=>store.set(sid,{cookie:{originalMaxAge:60000,expires:new Date(Date.now()+60000),httpOnly:true,path:'/'},userId,credentialTag:credentialTag('synthetic-resource-hash'),csrfToken:'a'.repeat(64)},resolve));
    cookies[userId]='bantaylog.sid='+encodeURIComponent('s:'+sid+'.'+createHmac('sha256',config.sessionSecret).update(sid).digest('base64').replace(/=+$/,''));
  }
  const request=async(userId,path)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{headers:{Cookie:cookies[userId]||''}});const body=Buffer.from(await response.arrayBuffer());return {status:response.status,type:response.headers.get('content-type'),disposition:response.headers.get('content-disposition'),body};};
  return {state,request};
}
test('only Secretary, Captain and Super Admin can download the blotter PDF; downloads are logged',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request(0,'/blotters/1/pdf')).status,401);
  for(const user of [1,2]) assert.equal((await f.request(user,'/blotters/1/pdf')).status,403,roles[user-1]);
  for(const user of [3,4,5]){
    const pdf=await f.request(user,'/blotters/1/pdf');
    assert.equal(pdf.status,200);assert.equal(pdf.type,'application/pdf');
    assert.equal(pdf.disposition,'attachment; filename="BLT-2026-000001.pdf"');
    assert.equal(pdf.body.subarray(0,5).toString(),'%PDF-');
  }
  assert.deepEqual(f.state.activity[0].slice(1,7),['secretary','blotter.printed','blotter',1,'BLT-2026-000001','PDF downloaded']);
  assert.equal((await f.request(3,'/blotters/99/pdf')).status,404);
  assert.equal((await f.request(3,'/blotters/abc/pdf')).status,400);
});
test('period summaries are restricted, valid PDFs, and never query party or resident names',async t=>{
  const f=await fixture(t);
  for(const user of [1,2]) assert.equal((await f.request(user,'/summaries/pdf?period=week&date=2026-11-18')).status,403);
  const pdf=await f.request(4,'/summaries/pdf?period=week&date=2026-11-18');
  assert.equal(pdf.status,200);assert.equal(pdf.type,'application/pdf');
  assert.equal(pdf.body.subarray(0,5).toString(),'%PDF-');
  assert.equal(pdf.disposition,'attachment; filename="BantayLog-Weekly-summary-2026-11-16.pdf"');
  const summarySql=f.state.calls.filter(call=>!call.sql.startsWith('SELECT id, email') && !call.sql.startsWith('SELECT u.role')).map(call=>call.sql).join('\n');
  for(const column of ['complainant_name','respondent_name','first_name','last_name','description','title','location','email'])
    assert.doesNotMatch(summarySql,new RegExp(column),`summary must not read ${column}`);
  assert.match(summarySql,/s\.submitted_at >= \? AND s\.submitted_at < \?/,'same half-open cohort as the dashboard');
  assert.deepEqual(f.state.activity.at(-1).slice(1,4),['captain','summary.generated','report']);
  assert.equal((await f.request(3,'/summaries/pdf?period=decade&date=2026-11-18')).status,400);
  assert.equal((await f.request(3,'/summaries/pdf?period=week&date=2099-01-01')).status,400);
});

test('charts never draw periods that have not happened yet as zero',async()=>{
  const {dashboardService}=require('../src/services/dashboardService');
  const db={execute:async sql=>sql.startsWith('SELECT COUNT(*) AS received')?[[{received:0,awaiting:0,ongoing:0,resolved:0}]]:sql.includes('NOT EXISTS')?[[{total:0}]]:[[]]};
  const year=await dashboardService(db).summary({period:'this_year'},NOW);
  assert.equal(year.series.length,11,'January to November only while November is current');
  assert.equal(year.series.at(-1).bucket,'2026-11-01');
  const week=await dashboardService(db).summary({period:'this_week'},NOW);
  assert.deepEqual(week.series.map(row=>row.bucket),['2026-11-16','2026-11-17','2026-11-18'],'Monday to today (Wednesday)');
});
