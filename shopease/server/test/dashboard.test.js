const {credentialTag}=require('../src/services/sessionCredentials');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const session=require('express-session');
const {createHmac,randomBytes}=require('node:crypto');
const {createApp}=require('../src/server');
const {parseDashboardQuery,dateRange,buckets}=require('../src/services/dashboardFilters');
const {logActivity}=require('../src/services/activityLog');
const config={clientOrigin:'http://localhost:5173',sessionSecret:'synthetic-dashboard-session-secret-over-32-bytes',production:false};
const roles=['resident','staff','secretary','captain','super_admin'];
// 2026-11-18 (Wednesday) 10:00 in Manila.
const NOW=Date.UTC(2026,10,18,2,0,0);

test('periods are half-open Manila ranges with Monday weeks and zero-filled buckets',()=>{
  assert.deepEqual(dateRange('2026-11-01','2026-11-30'),{start:'2026-11-01',end:'2026-12-01'});
  const week=parseDashboardQuery({period:'this_week'},NOW);
  assert.equal(week.start,'2026-11-16');assert.equal(week.end,'2026-11-23');assert.equal(week.last,'2026-11-22');
  assert.equal(week.granularity,'day');assert.equal(week.keys.length,7);
  const month=parseDashboardQuery({period:'this_month'},NOW);
  assert.deepEqual([month.start,month.end,month.granularity],['2026-11-01','2026-12-01','week']);
  assert.equal(month.keys[0],'2026-10-26','first week bucket starts on the Monday before the 1st');
  const year=parseDashboardQuery({},NOW);
  assert.deepEqual([year.preset,year.start,year.end,year.keys.length],['last_12_months','2025-12-01','2026-12-01',12]);
  // Sunday and the following Monday fall in different weeks.
  assert.deepEqual(buckets('2026-11-22','2026-11-24','week'),['2026-11-16','2026-11-23']);
  // Manila midnight, not UTC: 2026-11-15 16:00 UTC is already Monday 16 Nov in Manila.
  assert.equal(parseDashboardQuery({period:'this_week'},Date.UTC(2026,10,15,16,0,0)).start,'2026-11-16');
  assert.equal(parseDashboardQuery({period:'this_week'},Date.UTC(2026,10,15,15,59,59)).start,'2026-11-09');
});
test('dashboard filters reject invalid, reversed, oversized and unexpected input',()=>{
  for(const query of [{period:'forever'},{period:'custom'},{period:'custom',from:'2026-02-30',to:'2026-03-01'},{period:'custom',from:'2026-03-02',to:'2026-03-01'},
    {period:'custom',from:'2010-01-01',to:'2026-01-01'},{period:'this_year',from:'2026-01-01',to:'2026-01-02'},{granularity:'hour'},{category_id:'0'},{area_id:'abc'},
    {period:'custom',from:'2021-01-01',to:'2025-12-31',granularity:'day'},{user_id:'1'},{category_id:['1','2']}])
    assert.throws(()=>parseDashboardQuery(query,NOW),{status:400},JSON.stringify(query));
  assert.equal(parseDashboardQuery({area_id:'unassigned'},NOW).area_id,'unassigned');
  assert.equal(parseDashboardQuery({period:'custom',from:'2026-01-01',to:'2026-01-10'},NOW).granularity,'day');
});
test('activity entries are bounded and refuse unknown types or missing actors',async()=>{
  const calls=[];const c={execute:async(sql,args)=>{calls.push(args);return [{}];}};
  await logActivity(c,{id:3,role:'secretary'},{action:'category.created',entityType:'category',entityId:1,entityRef:'x'.repeat(300)});
  assert.equal([...calls[0][5]].length,160);assert.equal(calls[0][7],'administrative');
  await assert.rejects(logActivity(c,{id:3,role:'secretary'},{action:'x',entityType:'password'}));
  await assert.rejects(logActivity(c,null,{action:'x',entityType:'report'}));
});

async function fixture(t){
  const state={calls:[]};
  const execute=async(sql,args=[])=>{
    state.calls.push({sql,args});
    if(sql.startsWith('SELECT id, email'))return [[{id:args[0],email:'synthetic@example.invalid',role:roles[args[0]-1],resident_id:null,is_active:1,password_hash:'synthetic-resource-hash'}]];
    if(sql.startsWith('SELECT id FROM incident_categories'))return [args[0]===1?[{id:1}]:[]];
    if(sql.startsWith('SELECT id FROM report_areas'))return [args[0]===1?[{id:1}]:[]];
    if(sql.startsWith('SELECT COUNT(*) AS received'))return [[{received:3,awaiting:1,ongoing:1,resolved:1}]];
    if(sql.includes('AS bucket'))return [[{bucket:'2026-11-01',total:3}]];
    if(sql.includes('LEFT JOIN incident_categories'))return [[{id:1,name:'Drainage',is_active:0,total:3}]];
    if(sql.includes('LEFT JOIN report_areas'))return [[{id:null,name:null,is_active:null,total:2},{id:1,name:'Purok Uno',is_active:1,total:1}]];
    if(sql.includes('NOT EXISTS'))return [[{total:1}]];
    if(sql.startsWith('SELECT COUNT(*) AS actions'))return [[args[0]===7?{actions:3,first_action_at:'2026-11-01 08:00:00',last_action_at:'2026-11-18 10:00:00',roles_used:'secretary,staff'}:{actions:0,first_action_at:null,last_action_at:null,roles_used:null}]];
    if(sql.startsWith('SELECT u.id, u.email'))return [args[0]===7?[{id:7,email:'former.secretary@example.invalid',role:'staff',is_active:0,created_at:'2025-01-01 08:00:00',last_login_at:'2026-11-18 09:00:00',first_name:'Ana',middle_name:null,last_name:'Reyes'}]:[]];
    if(sql.startsWith('SELECT COUNT(*) AS total FROM activity_log'))return [[{total:1}]];
    if(sql.includes('FROM activity_log'))return [[{id:1,...(sql.includes('a.actor_id, ')?{actor_id:7}:{}),actor_role:'secretary',action:'report.status_changed',entity_type:'report',entity_id:9,entity_ref:'RPT-2026-000009',detail:'Submitted → Under Investigation',created_at:'2026-11-18 10:00:00'}]];
    throw new Error('Unexpected dashboard SQL');
  };
  const store=new session.MemoryStore();const app=createApp({config,db:{execute,query:async()=>[[{}]]},sessionStore:store});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.clear();});
  const cookies={};
  for(let userId=1;userId<=roles.length;userId++){
    const sid=randomBytes(24).toString('hex');await new Promise(resolve=>store.set(sid,{cookie:{originalMaxAge:60000,expires:new Date(Date.now()+60000),httpOnly:true,path:'/'},userId,credentialTag:credentialTag('synthetic-resource-hash'),csrfToken:'a'.repeat(64)},resolve));
    cookies[userId]='bantaylog.sid='+encodeURIComponent('s:'+sid+'.'+createHmac('sha256',config.sessionSecret).update(sid).digest('base64').replace(/=+$/,''));
  }
  const request=async(userId,path)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{headers:{Cookie:cookies[userId]||''}});return {status:response.status,data:await response.json()};};
  return {state,request};
}
test('dashboard is administrative only and returns counts without private report fields',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request(0,'/dashboard')).status,401);
  assert.equal((await f.request(1,'/dashboard')).status,403);
  const {status,data}=await f.request(2,'/dashboard?period=custom&from=2025-10-01&to=2025-10-31&granularity=week&category_id=1&area_id=unassigned');
  assert.equal(status,200);
  assert.deepEqual(data.cohort,{received:3,awaiting:1,ongoing:1,resolved:1});
  assert.equal(data.cohort.awaiting+data.cohort.ongoing+data.cohort.resolved,data.cohort.received);
  // Every week bucket of the period is present, including genuine zeros.
  assert.deepEqual(data.series.map(row=>row.bucket),['2025-09-29','2025-10-06','2025-10-13','2025-10-20','2025-10-27']);
  assert.deepEqual(data.series.map(row=>row.total),[0,0,0,0,0],'SQL bucket 2026-11-01 is not a week key and must not be invented');
  assert.deepEqual(data.areas[0],{id:null,name:'Unassigned',is_active:null,total:2});
  assert.equal(data.anomalies.missing_submission_record,1);
  // Filters are bound parameters and the range is half-open at the next midnight.
  const cohortCall=f.state.calls.find(call=>call.sql.startsWith('SELECT COUNT(*) AS received'));
  assert.deepEqual(cohortCall.args,[1,'2025-10-01 00:00:00','2025-11-01 00:00:00']);
  assert.match(cohortCall.sql,/submission_stage = 'Submitted' AND r\.cancelled_at IS NULL AND r\.category_id = \? AND r\.area_id IS NULL AND s\.submitted_at >= \? AND s\.submitted_at < \?/);
  assert.match(cohortCall.sql,/old_status IS NULL AND new_status = 'Submitted'/);
  assert.doesNotMatch(cohortCall.sql,/created_at >= \?/,'draft creation time is never used for periods');
  const text=JSON.stringify(data);
  for(const key of ['title','description','location','user_id','email','first_name','reference_no']) assert(!text.includes(`"${key}"`),key);
  assert.equal((await f.request(3,'/dashboard?category_id=99')).status,400);
  assert.equal((await f.request(3,'/dashboard?period=nope')).data.message,'Choose a valid period.');
});
test('everyone can filter activity by role; only Captain and Super Admin can identify the person',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request(1,'/activity')).status,403);
  const staff=await f.request(2,'/activity?entity_type=report&actor_role=secretary&from=2026-11-01&to=2026-11-30');
  assert.equal(staff.status,200);assert.equal(staff.data.entries[0].actor_id,undefined,'staff cannot tell people apart');
  const call=f.state.calls.find(item=>item.sql.startsWith('SELECT a.id'));
  assert.match(call.sql,/a\.visibility = 'administrative'/);assert.doesNotMatch(call.sql,/actor_id, |email/);
  assert.deepEqual(call.args.slice(0,4),['report','secretary','2026-11-01 00:00:00','2026-12-01 00:00:00']);
  for(const bad of ['actor_role=mayor','actor_id=7','entity_type=staff_account']) assert.equal((await f.request(2,'/activity?'+bad)).status,400,bad);
  assert.equal((await f.request(2,'/activity/actors/7')).status,403);
  assert.equal((await f.request(3,'/activity/actors/7')).status,403,'secretary cannot open person details');
  f.state.calls.length=0;
  const captain=await f.request(4,'/activity?actor_id=7');
  assert.equal(captain.status,200);assert.equal(captain.data.entries[0].actor_id,7);
  assert.match(f.state.calls.find(item=>item.sql.startsWith('SELECT a.id')).sql,/a\.actor_id = \?/);
  const person=await f.request(4,'/activity/actors/7');
  assert.equal(person.status,200);
  assert.deepEqual(Object.keys(person.data.person).sort(),['account_created_at','actions','current_role','email','first_action_at','first_name','id','is_active','last_action_at','last_login_at','last_name','middle_name','roles_used'].sort());
  assert.deepEqual([person.data.person.current_role,person.data.person.is_active,person.data.person.roles_used],['staff',false,['secretary','staff']],'a former Secretary now Staff, deactivated');
  assert.match(f.state.calls.find(item=>item.sql.startsWith('SELECT COUNT(*) AS actions')).sql,/visibility = 'administrative'/,'captain only counts administrative events');
  assert.equal((await f.request(5,'/activity/actors/8')).status,404,'people with no logged actions cannot be looked up');
  assert.equal((await f.request(5,'/activity/actors/abc')).status,400);
  assert.equal((await f.request(5,'/activity?page_size=500')).status,400);
});
