const {credentialTag}=require('../src/services/sessionCredentials');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const session=require('express-session');
const {createHmac,randomBytes}=require('node:crypto');
const {createApp}=require('../src/server');
const config={clientOrigin:'http://localhost:5173',sessionSecret:'synthetic-report-session-secret-over-32-bytes',production:false};
const roles=['resident','resident','staff','secretary','captain','super_admin'];
const form={category_id:1,title:'Fictional concern',description:'Test details',location:'Test location',incident_date:'2026-01-15T12:30:00'};
function seed(state,overrides={}) {
  const row={id:state.reports.length+1,user_id:1,...form,reference_no:null,resident_report_no:null,submission_stage:'Draft',status:null,cancelled_at:null,cancelled_by:null,...overrides};state.reports.push(row);return row;
}
async function fixture(t) {
  const state={reports:[],history:[],counters:{},categories:[{id:1,is_active:1},{id:2,is_active:0}],calls:[],failHistory:false,rollbacks:0,releases:0};
  let queue=Promise.resolve();
  function filter(sql,args) {
    let rows=state.reports;
    if(sql.includes('WHERE id = ?')) rows=rows.filter(row=>row.id===args[0]);
    if(sql.includes('user_id = ?')) {const userId=sql.includes('WHERE id = ?')?args[1]:args[0];rows=rows.filter(row=>row.user_id===userId);}
    if(sql.includes("submission_stage = 'Submitted'")) rows=rows.filter(row=>row.submission_stage==='Submitted');
    if(sql.includes("submission_stage = 'Draft'")) rows=rows.filter(row=>row.submission_stage==='Draft');
    if(sql.includes('cancelled_at IS NOT NULL')) rows=rows.filter(row=>row.cancelled_at);
    else if(sql.includes('cancelled_at IS NULL')) rows=rows.filter(row=>!row.cancelled_at);
    return rows;
  }
  async function execute(sql,args) {
    state.calls.push({sql,args});
  if(sql.startsWith('INSERT INTO activity_log')){(state.activity||=[]).push(args);return [{insertId:state.activity.length}];}if(sql.includes('FROM report_areas'))return [(state.areas||[]).filter(row=>sql.includes('WHERE id = ?')?row.id===args[0]:row.is_active===1).slice(0,1)];
  if(sql.startsWith('UPDATE community_updates'))return [{affectedRows:0}];
    if(sql.startsWith('INSERT INTO resident_report_counters')){state.counters[args[0]]=(state.counters[args[0]]||0)+1;return [{affectedRows:1}];}
    if(sql.startsWith('SELECT last_report_no FROM resident_report_counters'))return [[{last_report_no:state.counters[args[0]]}]];
    if(sql.startsWith('SELECT id, email')) return [[{id:args[0],password_hash:'synthetic-resource-hash',email:'test@example.invalid',role:roles[args[0]-1],resident_id:args[0]<=2?args[0]:null,is_active:1}]];
    if(sql.includes('FROM incident_categories')) return [state.categories.filter(row=>row.id===args[0])];
    if(sql.startsWith('SELECT old_status')) return [state.history.filter(row=>row.report_id===args[0])];
    if(sql.startsWith('SELECT') && sql.includes('FROM incident_reports')) {
      const rows=filter(sql,args);
      if(sql.startsWith('SELECT COUNT')) return [[{total:rows.length}]];
      const result=sql.includes('LIMIT ?')?rows.slice(args.at(-1),args.at(-1)+args.at(-2)):rows;
      return [structuredClone(result).map(row=>({...row,incident_date:row.incident_date?.replace(' ','T')||null}))];
    }
    if(sql.startsWith('INSERT INTO incident_reports')) {
      const [user_id,category_id,title,description,location,incident_date,area_id]=args;
      const row=seed(state,{user_id,category_id,title,description,location,incident_date,area_id});return [{insertId:row.id}];
    }
    if(sql.startsWith('INSERT INTO report_status_history')) {
      if(state.failHistory) throw new Error('PRIVATE_HISTORY_ERROR');
      state.history.push({report_id:args[0],old_status:args[1],new_status:args[2],changed_by:args[3],remarks:args[4]});return [{insertId:state.history.length}];
    }
    const row=state.reports.find(item=>item.id===args.at(-1));
    if(sql.startsWith('UPDATE incident_reports SET submission_stage')) [row.submission_stage,row.status,row.reference_no,row.resident_report_no]=args;
    else if(sql.startsWith('UPDATE incident_reports SET category_id')) [row.category_id,row.title,row.description,row.location,row.incident_date,row.area_id]=args;
    else if(sql.startsWith('UPDATE incident_reports SET area_id')) row.area_id=args[0];
    else if(sql.startsWith('UPDATE incident_reports SET cancelled_at')) {row.cancelled_at='synthetic cancellation time';row.cancelled_by=args[0];}
    else throw new Error('Unexpected report SQL');
    return [{affectedRows:1}];
  }
  const db={query:async()=>[[{result:1}]],execute,getConnection:async()=>{
    let unlock,snapshot;
    return {execute,
      beginTransaction:async()=>{const previous=queue;queue=new Promise(resolve=>{unlock=resolve;});await previous;snapshot=structuredClone({reports:state.reports,history:state.history,counters:state.counters});},
      commit:async()=>{unlock();},rollback:async()=>{state.rollbacks++;state.reports=snapshot.reports;state.history=snapshot.history;state.counters=snapshot.counters;unlock();},release:()=>{state.releases++;}
    };
  }};
  const store=new session.MemoryStore();const app=createApp({config,db,sessionStore:store});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.clear();});
  const token=randomBytes(32).toString('hex');const cookies={};
  for(let userId=1;userId<=roles.length;userId++) {
    const sid=randomBytes(24).toString('hex');await new Promise(resolve=>store.set(sid,{cookie:{originalMaxAge:60000,expires:new Date(Date.now()+60000),httpOnly:true,path:'/'},userId,credentialTag:credentialTag('synthetic-resource-hash'),csrfToken:token},resolve));
    const signature=createHmac('sha256',config.sessionSecret).update(sid).digest('base64').replace(/=+$/,'');cookies[userId]='bantaylog.sid='+encodeURIComponent('s:'+sid+'.'+signature);
  }
  async function request(userId,path='',method='GET',body,headers={}) {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/reports${path}`,{method,headers:{Origin:config.clientOrigin,Cookie:cookies[userId]||'','Content-Type':'application/json','X-CSRF-Token':token,...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  }
  return {state,request};
}

test('drafts are incomplete, private, unnumbered, and invisible to other residents and administrators',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request(null)).status,401);
  const draft=await f.request(1,'/drafts','POST',{});assert.equal(draft.status,201);assert.equal(draft.data.report.reference_no,null);assert.equal(draft.data.report.status,null);
  assert.equal(f.state.history.length,0);
  assert.equal((await f.request(1,'?view=drafts')).data.reports.length,1);
  assert.equal((await f.request(2,'?view=all')).data.reports.length,0);
  assert.equal((await f.request(2,'/1')).status,404);
  for(const user of [3,4,5,6]) {
    assert.equal((await f.request(user,'/1')).status,404);
    assert.equal((await f.request(user,'?view=all')).data.reports.length,0);
    assert.equal((await f.request(user,'?view=drafts')).status,403);
  }
});

test('resident numbers start at one per owner, ignore drafts and retain cancelled numbers',async t=>{
  const f=await fixture(t);
  const draft=await f.request(1,'/drafts','POST',{});
  assert.equal(draft.data.report.resident_report_no,null);
  await f.request(1,`/${draft.data.report.id}/cancel`,'POST',{});
  const first=await f.request(1,'','POST',form),other=await f.request(2,'','POST',form);
  assert.equal(first.status,201);assert.equal(other.status,201);
  assert.equal(first.data.report.resident_report_no,1);assert.equal(other.data.report.resident_report_no,1);
  assert.notEqual(first.data.report.reference_no,other.data.report.reference_no);
  await f.request(1,`/${first.data.report.id}/cancel`,'POST',{});
  const next=await f.request(1,'','POST',form);
  assert.equal(next.data.report.resident_report_no,2);
  assert.equal((await f.request(1,`/${first.data.report.id}`)).data.report.resident_report_no,1);
});

test('simultaneous submissions receive separate resident numbers and failed submissions roll back allocation',async t=>{
  const f=await fixture(t);
  f.state.failHistory=true;
  assert.equal((await f.request(1,'','POST',form)).status,500);
  assert.equal(f.state.counters[1],undefined);
  f.state.failHistory=false;
  const results=await Promise.all([f.request(1,'','POST',form),f.request(1,'','POST',form)]);
  assert.deepEqual(results.map(result=>result.status),[201,201]);
  assert.deepEqual(results.map(result=>result.data.report.resident_report_no).sort(),[1,2]);
});

test('submitted list/detail enforce ownership, reveal history remarks, and exclude private drafts',async t=>{
  const f=await fixture(t);
  seed(f.state,{submission_stage:'Submitted',status:'Submitted'});seed(f.state,{user_id:2,submission_stage:'Submitted',status:'Resolved'});seed(f.state);
  f.state.history.push({report_id:1,old_status:null,new_status:'Submitted',remarks:'Resident-visible remark'});
  assert.equal((await f.request(1,'?view=all')).data.reports.length,2);
  assert.equal((await f.request(1,'/2')).status,404);
  assert.equal((await f.request(1,'/1')).data.history[0].remarks,'Resident-visible remark');
  for(const user of [3,4,5,6]) assert.equal((await f.request(user,'?view=all')).data.reports.length,2);
});

test('only residents may write reports and CSRF is required',async t=>{
  const f=await fixture(t);seed(f.state);
  for(const user of [3,4,5,6]) {
    for(const [path,method,body] of [['','POST',form],['/drafts','POST',{}],['/1','PUT',form],['/1/submit','POST',{}],['/1/cancel','POST',{}]]) assert.equal((await f.request(user,path,method,body)).status,403);
  }
  assert.equal((await f.request(1,'/drafts','POST',{}, {'X-CSRF-Token':''})).status,403);
  assert.equal((await f.request(1,'/drafts','POST',{}, {Origin:'https://untrusted.example'})).status,403);
});

test('submission requires valid fields and active categories; clients cannot set protected fields',async t=>{
  const f=await fixture(t);
  for(const body of [{},{...form,title:' '},{...form,category_id:2},{...form,category_id:999},{...form,category_id:'1'},{...form,title:'x'.repeat(151)},{...form,description:'x'.repeat(65536)},{...form,incident_date:'2026-02-30T12:30:00'},{...form,incident_date:'2026-01-01T25:30:00'},{...form,incident_date:'2026-01-01T12:30:00Z'}]) assert.equal((await f.request(1,'','POST',body)).status,400);
  for(const field of ['user_id','status','submission_stage','reference_no','cancelled_by','approved_by']) assert.equal((await f.request(1,'/drafts','POST',{[field]:1})).status,400);
  const draft=await f.request(1,'/drafts','POST',{category_id:2});assert.equal(draft.status,201);
  assert.equal((await f.request(1,'/'+draft.data.report.id+'/submit','POST',{})).status,400);
  assert.equal(f.state.history.length,0);
});

test('save and submit commit the reference/status/initial history together and cannot submit twice',async t=>{
  const f=await fixture(t);
  const draft=await f.request(1,'/drafts','POST',{});const id=draft.data.report.id;
  assert.equal((await f.request(1,'/'+id,'PUT',form)).status,200);
  const submitted=await f.request(1,'/'+id+'/submit','POST',{});assert.equal(submitted.status,200);assert.match(submitted.data.report.reference_no,/^RPT-\d{4}-\d{6,}$/);
  assert.equal(f.state.history.length,1);assert.equal(f.state.history[0].changed_by,1);assert.equal(f.state.history[0].old_status,null);
  assert.equal((await f.request(1,'/'+id+'/submit','POST',{})).status,409);
  assert.equal(f.state.history.length,1);
  const direct=await f.request(1,'','POST',form);assert.equal(direct.status,201);assert.notEqual(direct.data.report.reference_no,submitted.data.report.reference_no);
});

test('history-write failures roll back direct submission and draft conversion',async t=>{
  const f=await fixture(t);f.state.failHistory=true;
  const failed=await f.request(1,'','POST',form);assert.equal(failed.status,500);assert.equal(failed.data.message,'Internal server error');assert.equal(f.state.reports.length,0);
  const draft=await f.request(1,'/drafts','POST',form);
  assert.equal((await f.request(1,'/'+draft.data.report.id+'/submit','POST',{})).status,500);
  assert.equal(f.state.reports[0].submission_stage,'Draft');assert.equal(f.state.reports[0].reference_no,null);assert.equal(f.state.history.length,0);assert.equal(f.state.rollbacks,2);
});

test('other residents cannot edit, submit, or cancel a guessed report ID',async t=>{
  const f=await fixture(t);seed(f.state);
  for(const [path,method,body] of [['/1','PUT',form],['/1/submit','POST',{}],['/1/cancel','POST',{}]]) assert.equal((await f.request(2,path,method,body)).status,404);
  assert.equal(f.state.reports[0].submission_stage,'Draft');
});

test('cancelled drafts remain private, leave active drafts, and cannot be edited or submitted',async t=>{
  const f=await fixture(t);seed(f.state);
  assert.equal((await f.request(1,'/1/cancel','POST',{})).status,200);
  const row=f.state.reports[0];
  assert.equal(row.submission_stage,'Draft');assert.equal(row.reference_no,null);assert.equal(row.status,null);assert.equal(row.cancelled_by,1);assert.equal(f.state.history.length,0);
  assert.equal((await f.request(1,'?view=drafts')).data.reports.length,0);
  assert.equal((await f.request(1,'?view=cancelled')).data.reports.length,1);
  assert.equal((await f.request(1,'?view=all')).data.reports.length,1);
  for(const user of [2,3,4,5,6])assert.equal((await f.request(user,'/1')).status,404);
  for(const user of [3,4,5,6])assert.equal((await f.request(user,'?view=cancelled')).data.reports.length,0);
  assert.equal((await f.request(1,'/1','PUT',form)).status,409);
  assert.equal((await f.request(1,'/1/submit','POST',{})).status,409);
  assert.equal((await f.request(1,'/1/cancel','POST',{})).status,409);
});

test('cancellation is final, retained, attributable, and excluded from active lists',async t=>{
  const f=await fixture(t);seed(f.state,{submission_stage:'Submitted',status:'Submitted'});
  assert.equal((await f.request(1,'/1/cancel','POST',{})).status,200);
  assert.equal(f.state.reports.length,1);assert.equal(f.state.reports[0].cancelled_by,1);assert.equal(f.state.reports[0].status,'Submitted');
  assert.equal((await f.request(1)).data.reports.length,0);assert.equal((await f.request(3)).data.reports.length,0);
  assert.equal((await f.request(1,'?view=cancelled')).data.reports.length,1);assert.equal((await f.request(3,'?view=cancelled')).data.reports.length,1);
  assert.equal((await f.request(1,'/1','PUT',form)).status,409);assert.equal((await f.request(1,'/1/cancel','POST',{})).status,409);assert.equal((await f.request(1,'/1/submit','POST',{})).status,409);
  assert.equal((await f.request(1,'/1','DELETE')).status,404);
});

test('processing/resolved reports are immutable; invalid IDs, payloads, and filters are rejected',async t=>{
  const f=await fixture(t);
  for(const status of ['Under Investigation','Scheduled for Action','Resolved']) {
    const row=seed(f.state,{submission_stage:'Submitted',status});
    assert.equal((await f.request(1,'/'+row.id,'PUT',form)).status,409);
    assert.equal((await f.request(1,'/'+row.id+'/cancel','POST',{})).status,409);
  }
  assert.equal((await f.request(1,'/0')).status,400);assert.equal((await f.request(1,'/999')).status,404);
  assert.equal((await f.request(1,'?view=unknown')).status,400);assert.equal((await f.request(1,'?page_size=101')).status,400);
  assert.equal((await f.request(1,'/1/submit','POST',{user_id:2})).status,400);
});

test('competing submissions create exactly one reference and one history entry',async t=>{
  const f=await fixture(t);seed(f.state);
  assert.equal((await f.request(1,'/1','PUT',form)).status,200);
  const results=await Promise.all([f.request(1,'/1/submit','POST',{}),f.request(1,'/1/submit','POST',{})]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);assert.equal(f.state.history.length,1);
  assert(f.state.calls.some(call=>call.sql.endsWith('FOR UPDATE')));assert(f.state.calls.some(call=>call.sql.endsWith('FOR SHARE')));
});

test('an older resident form cannot overwrite a saved change and successful draft saves refresh its edit token',async t=>{
 const f=await fixture(t);seed(f.state);const first=(await f.request(1,'/1')).data.report;
 const changed=await f.request(1,'/1','PUT',{...form,title:'Updated title',expected_token:first.edit_token});assert.equal(changed.status,200);
 assert.equal((await f.request(1,'/1','PUT',{...form,expected_token:first.edit_token})).status,409);
 const latest=(await f.request(1,'/1')).data.report;assert.equal(changed.data.edit_token,latest.edit_token);
 assert.equal((await f.request(1,'/1','PUT',{...form,title:'Updated title',expected_token:latest.edit_token})).status,200);
 assert.equal((await f.request(1,'/1','PUT',[])).status,400);
});

test('areas are optional until configured, then required and active at submission; activity is recorded',async t=>{
  const f=await fixture(t);
  // No areas configured yet: submission works without one and drafts never create activity.
  assert.equal((await f.request(1,'','POST',form)).status,201);
  assert.equal((await f.request(1,'/drafts','POST',{title:'Private draft'})).status,201);
  assert.deepEqual(f.state.activity.map(row=>[row[1],row[2],row[3]]),[['resident','report.submitted','report']]);
  f.state.areas=[{id:1,name:'Purok Uno',is_active:1},{id:2,name:'Old Purok',is_active:0}];
  const missing=await f.request(1,'','POST',form);
  assert.equal(missing.status,400);assert.match(missing.data.message,/area or purok/);
  assert.equal((await f.request(1,'','POST',{...form,area_id:2})).status,400);
  assert.equal((await f.request(1,'','POST',{...form,area_id:'1'})).status,400);
  const created=await f.request(1,'','POST',{...form,area_id:1});
  assert.equal(created.status,201);assert.equal(f.state.reports.find(row=>row.id===created.data.report.id).area_id,1);
  // Drafts may still be saved without an area.
  assert.equal((await f.request(1,'/drafts','POST',{title:'Another draft'})).status,201);
  // An older submitted report stays Unassigned when its owner edits it.
  assert.equal((await f.request(1,'/1','PUT',{...form,title:'Edited'})).status,200);
  // Administrators may assign or clear an area; residents may not.
  assert.equal((await f.request(1,'/1/area','PATCH',{area_id:1})).status,403);
  const assigned=await f.request(3,'/1/area','PATCH',{area_id:1});
  assert.equal(assigned.status,200);assert.equal(f.state.reports[0].area_id,1);
  const entry=f.state.activity.at(-1);
  assert.deepEqual([entry[1],entry[2],entry[3],entry[6]],['staff','report.area_assigned','report','Area: Purok Uno']);
  assert.equal((await f.request(3,'/1/area','PATCH',{area_id:2})).status,400,'a new pick must be active');
  assert.equal((await f.request(3,'/2/area','PATCH',{area_id:1})).status,404,'drafts stay private');
  assert.equal((await f.request(1,`/${created.data.report.id}/cancel`,'POST',{})).status,200);
  assert.equal(f.state.activity.at(-1)[2],'report.cancelled');
  assert.equal((await f.request(3,`/${created.data.report.id}/area`,'PATCH',{area_id:null})).status,409);
  for(const row of f.state.activity) assert(!JSON.stringify(row).includes('Test details'),'report text is never copied into activity');
});
