const {credentialTag}=require('../src/services/sessionCredentials');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const session=require('express-session');
const {randomBytes,createHmac}=require('node:crypto');
const {createApp}=require('../src/server');
const roles=['resident','resident','staff','secretary','captain','super_admin'];
const config={clientOrigin:'http://localhost:5173',sessionSecret:'synthetic-blotter-session-secret-over-32-bytes',production:false};
const form={category_id:1,complainant_name:'TEST Person',respondent_name:'TEST Respondent',narrative:'Fictional narrative',incident_date:'2026-01-01T12:00:00',location:'Fictional location'};
function seedReport(state,overrides={}) {
 const row={id:state.reports.length+1,user_id:1,submission_stage:'Submitted',status:'Submitted',cancelled_at:null,...overrides};state.reports.push(row);return row;
}
async function fixture(t) {
 const state={blotters:[],reports:[],history:[],calls:[],categories:[{id:1,is_active:1},{id:2,is_active:0}],failNumber:false,failHistory:false,rollbacks:0};
 let queue=Promise.resolve();
 function blotters(sql,args) {
  let rows=state.blotters;
  if(sql.includes('WHERE id = ?'))return rows.filter(row=>row.id===args[0]);
  if(sql.includes('WHERE report_id = ?'))return rows.filter(row=>row.report_id===args[0]);
  if(sql.includes('archived_at IS NOT NULL'))rows=rows.filter(row=>row.archived_at);
  else if(sql.includes('archived_at IS NULL'))rows=rows.filter(row=>!row.archived_at);
  return rows;
 }
 async function execute(sql,args) {
  state.calls.push({sql,args});
  if(sql.startsWith('UPDATE community_updates'))return [{affectedRows:0}];
  if(sql.startsWith('SELECT id, email'))return [[{id:args[0],role:roles[args[0]-1],is_active:1,password_hash:'synthetic-resource-hash',email:'test@example.invalid',resident_id:args[0]<3?args[0]:null}]];
  if(sql.includes('FROM incident_categories'))return [state.categories.filter(row=>row.id===args[0])];
  if(sql.startsWith('SELECT')&&sql.includes('FROM incident_reports'))return [structuredClone(state.reports.filter(row=>row.id===args[0]&&(!sql.includes('user_id = ?')||row.user_id===args[1])))];
  if(sql.startsWith('SELECT')&&sql.includes('FROM report_status_history'))return [state.history.filter(row=>row.report_id===args[0])];
  if(sql.startsWith('SELECT')&&sql.includes('FROM blotter_records')) {
   const rows=blotters(sql,args);if(sql.startsWith('SELECT COUNT'))return [[{total:rows.length}]];
   return [structuredClone(sql.includes('LIMIT ?')?rows.slice(args.at(-1),args.at(-1)+args.at(-2)):rows)];
  }
  if(sql.startsWith('INSERT INTO blotter_records')) {
   if(args[0]!==null&&state.blotters.some(row=>row.report_id===args[0]))throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
   const [report_id,category_id,complainant_name,respondent_name,narrative,incident_date,location,recorded_by,approved_by]=args;
   const id=state.blotters.length+1;
   state.blotters.push({id,report_id,category_id,complainant_name,respondent_name,narrative,incident_date,location,recorded_by,approved_by,approved_at:approved_by?'synthetic approval time':null,blotter_no:null,archived_at:null,archived_by:null});return [{insertId:id}];
  }
  if(sql.startsWith('UPDATE blotter_records')) {
   const row=state.blotters.find(item=>item.id===args.at(-1));
   if(sql.includes('SET blotter_no')) {if(state.failNumber)throw new Error('PRIVATE_NUMBER_ERROR');row.blotter_no=args[0];}
   else if(sql.includes('SET category_id'))[row.category_id,row.complainant_name,row.respondent_name,row.narrative,row.incident_date,row.location]=args;
   else if(sql.includes('SET archived_at')){row.archived_at='synthetic archive time';row.archived_by=args[0];}
   return [{affectedRows:1}];
  }
  if(sql.startsWith('UPDATE incident_reports SET status')){state.reports.find(row=>row.id===args[1]).status=args[0];return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE incident_reports SET cancelled_at')){state.reports.find(row=>row.id===args[1]).cancelled_at='synthetic cancel time';return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO report_status_history')) {
   if(state.failHistory)throw new Error('PRIVATE_HISTORY_ERROR');
   state.history.push({report_id:args[0],old_status:args[1],new_status:args[2],changed_by:args[3],remarks:args[4]});return [{insertId:state.history.length}];
  }
  throw new Error('Unexpected blotter/workflow SQL');
 }
 const db={query:async()=>[[{result:1}]],execute,getConnection:async()=>{
  let unlock,snapshot;return {execute,beginTransaction:async()=>{const previous=queue;queue=new Promise(resolve=>{unlock=resolve;});await previous;snapshot=structuredClone({blotters:state.blotters,reports:state.reports,history:state.history});},commit:async()=>unlock(),rollback:async()=>{state.rollbacks++;Object.assign(state,snapshot);unlock();},release:()=>{}};
 }};
 const store=new session.MemoryStore();const app=createApp({config,db,sessionStore:store});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.clear();});
 const token=randomBytes(32).toString('hex'),cookies={};
 for(let userId=1;userId<=roles.length;userId++) {
  const sid=randomBytes(24).toString('hex');await new Promise(resolve=>store.set(sid,{cookie:{originalMaxAge:60000,expires:new Date(Date.now()+60000),httpOnly:true,path:'/'},userId,credentialTag:credentialTag('synthetic-resource-hash'),csrfToken:token},resolve));
  const signature=createHmac('sha256',config.sessionSecret).update(sid).digest('base64').replace(/=+$/,'');cookies[userId]='bantaylog.sid='+encodeURIComponent('s:'+sid+'.'+signature);
 }
 async function request(user,path='/blotters',method='GET',body,headers={}) {
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{Origin:config.clientOrigin,Cookie:cookies[user]||'','Content-Type':'application/json','X-CSRF-Token':token,...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json()};
 }
 return {state,request};
}

test('blotter read/create/edit/archive permissions match the approved roles',async t=>{
 const f=await fixture(t);
 assert.equal((await f.request(null)).status,401);assert.equal((await f.request(1)).status,403);
 for(const user of [3,4,5,6])assert.equal((await f.request(user)).status,200);
 for(const user of [1,3])assert.equal((await f.request(user,'/blotters','POST',form)).status,403);
 for(const user of [4,5,6])assert.equal((await f.request(user,'/blotters','POST',form)).status,201);
 for(const user of [1,3])assert.equal((await f.request(user,'/blotters/1','PUT',form)).status,403);
 assert.equal((await f.request(4,'/blotters/1','PUT',form)).status,200);
 for(const user of [1,3,4])assert.equal((await f.request(user,'/blotters/1/archive','POST',{confirm:true})).status,403);
 assert.equal((await f.request(5,'/blotters/1/archive','POST',{confirm:true})).status,200);
 assert.equal((await f.request(6,'/blotters/2/archive','POST',{confirm:true})).status,200);
});

test('walk-ins receive atomic numbers without approval or report links; protected fields are rejected',async t=>{
 const f=await fixture(t);
 const result=await f.request(4,'/blotters','POST',form);assert.match(result.data.blotter.blotter_no,/^BLT-\d{4}-\d{6,}$/);
 assert.equal(f.state.blotters[0].recorded_by,4);assert.equal(f.state.blotters[0].report_id,null);assert.equal(f.state.blotters[0].approved_by,null);assert.equal(f.state.blotters[0].approved_at,null);
 for(const field of ['report_id','approved_by','approved_at','recorded_by','archived_by','blotter_no'])assert.equal((await f.request(4,'/blotters','POST',{...form,[field]:1})).status,400);
 f.state.failNumber=true;
 assert.equal((await f.request(4,'/blotters','POST',form)).status,500);assert.equal(f.state.blotters.length,1);assert.equal(f.state.rollbacks,1);
});

test('blotter validation, inactive categories, IDs, and CSRF are enforced',async t=>{
 const f=await fixture(t);
 for(const body of [{},{...form,narrative:' '},{...form,category_id:2},{...form,category_id:999},{...form,complainant_name:'x'.repeat(151)},{...form,narrative:'x'.repeat(65536)},{...form,incident_date:'2026-02-30T12:00'},{...form,respondent_name:4}])assert.equal((await f.request(4,'/blotters','POST',body)).status,400);
 assert.equal((await f.request(4,'/blotters','POST',form,{'X-CSRF-Token':''})).status,403);
 assert.equal((await f.request(4,'/blotters','POST',form,{Origin:'https://untrusted.example'})).status,403);
 assert.equal((await f.request(3,'/blotters/0')).status,400);assert.equal((await f.request(3,'/blotters/999')).status,404);
 assert.equal((await f.request(3,'/blotters?view=wrong')).status,400);assert.equal((await f.request(3,'/blotters?page_size=101')).status,400);
});

test('archiving requires confirmation, preserves records, and prevents editing or repeated archive',async t=>{
 const f=await fixture(t);await f.request(4,'/blotters','POST',form);
 assert.equal((await f.request(5,'/blotters/1/archive','POST',{})).status,400);
 assert.equal((await f.request(5,'/blotters/1/archive','POST',{confirm:true})).status,200);
 assert.equal(f.state.blotters[0].archived_by,5);assert.equal(f.state.blotters.length,1);
 assert.equal((await f.request(3)).data.blotters.length,0);assert.equal((await f.request(3,'/blotters?view=archived')).data.blotters.length,1);
 assert.equal((await f.request(3,'/blotters/1')).status,200);
 assert.equal((await f.request(4,'/blotters/1','PUT',form)).status,409);
 assert.equal((await f.request(6,'/blotters/1/archive','POST',{confirm:true})).status,409);
 assert.equal((await f.request(6,'/blotters/1','DELETE')).status,404);
});

test('edits may retain an existing inactive category and concurrent archives have one winner',async t=>{
 const f=await fixture(t);await f.request(4,'/blotters','POST',form);
 f.state.categories[0].is_active=0;
 assert.equal((await f.request(4,'/blotters/1','PUT',{...form,narrative:'Updated fictional narrative'})).status,200);
 const results=await Promise.all([f.request(5,'/blotters/1/archive','POST',{confirm:true}),f.request(6,'/blotters/1/archive','POST',{confirm:true})]);
 assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);
 assert(f.state.calls.some(call=>call.sql.endsWith('FOR UPDATE')));
});

// Priority 7: exercise report workflow through the same authenticated HTTP app.
test('status updates enforce administrative roles and preserve resident-visible remarks/actor history',async t=>{
 const f=await fixture(t);seedReport(f.state);
 assert.equal((await f.request(null,'/reports/1/status','PATCH',{status:'Under Investigation'})).status,401);
 assert.equal((await f.request(1,'/reports/1/status','PATCH',{status:'Under Investigation'})).status,403);
 for(const user of [3,4,5,6]){
  const row=seedReport(f.state);
  const result=await f.request(user,'/reports/'+row.id+'/status','PATCH',{status:'Under Investigation',remarks:' Staff-visible and resident-visible remark '});
  assert.equal(result.status,200);
  const history=f.state.history.find(item=>item.report_id===row.id);
  assert.equal(history.old_status,'Submitted');assert.equal(history.new_status,'Under Investigation');assert.equal(history.changed_by,user);assert.equal(history.remarks,'Staff-visible and resident-visible remark');
  const detail=await f.request(1,'/reports/'+row.id);assert.equal(detail.status,200);assert.equal(detail.data.history[0].remarks,history.remarks);
 }
});

test('status changes follow the sequence and never reopen resolved, cancelled, or private draft reports',async t=>{
 const f=await fixture(t);seedReport(f.state);
 assert.equal((await f.request(3,'/reports/1/status','PATCH',{status:'Resolved'})).status,409);
 for(const status of ['Under Investigation','Scheduled for Action','Resolved']) assert.equal((await f.request(3,'/reports/1/status','PATCH',{status})).status,200);
 assert.equal((await f.request(3,'/reports/1/status','PATCH',{status:'Submitted'})).status,409);
 assert.equal((await f.request(3,'/reports/1/status','PATCH',{status:'Resolved'})).status,409);
 const draft=seedReport(f.state,{submission_stage:'Draft',status:null});const cancelled=seedReport(f.state,{cancelled_at:'synthetic cancellation'});
 assert.equal((await f.request(3,'/reports/'+draft.id+'/status','PATCH',{status:'Under Investigation'})).status,404);
 assert.equal((await f.request(3,'/reports/'+cancelled.id+'/status','PATCH',{status:'Under Investigation'})).status,409);
 assert.equal((await f.request(3,'/reports/999/status','PATCH',{status:'Under Investigation'})).status,404);
 assert.equal(f.state.history.length,3);
});

test('status validation rejects forged audit fields and missing CSRF; failures roll back status/history together',async t=>{
 const f=await fixture(t);seedReport(f.state);
 for(const body of [{status:'Unknown'},{status:'Under Investigation',changed_by:6},{status:'Under Investigation',remarks:3},{status:'Under Investigation',remarks:'x'.repeat(501)}]) assert.equal((await f.request(3,'/reports/1/status','PATCH',body)).status,400);
 assert.equal((await f.request(3,'/reports/1/status','PATCH',{status:'Under Investigation'},{'X-CSRF-Token':''})).status,403);
 f.state.failHistory=true;
 const failed=await f.request(3,'/reports/1/status','PATCH',{status:'Under Investigation'});
 assert.equal(failed.status,500);assert.equal(failed.data.message,'Internal server error');assert.equal(f.state.reports[0].status,'Submitted');assert.equal(f.state.history.length,0);assert.equal(f.state.rollbacks,1);
});

test('only captain/super admin can approve linked blotters and attribution is server controlled',async t=>{
 const f=await fixture(t);seedReport(f.state);seedReport(f.state);
 for(const user of [1,3,4]) assert.equal((await f.request(user,'/reports/1/blotter','POST',{...form,confirm:true})).status,403);
 assert.equal((await f.request(5,'/reports/1/blotter','POST',form)).status,400);
 assert.equal((await f.request(5,'/reports/1/blotter','POST',{...form,confirm:true,approved_by:6})).status,400);
 assert.equal((await f.request(5,'/reports/1/blotter','POST',{...form,confirm:true},{'X-CSRF-Token':''})).status,403);
 for(const [user,reportId]of[[5,1],[6,2]]){
  const result=await f.request(user,'/reports/'+reportId+'/blotter','POST',{...form,confirm:true});assert.equal(result.status,201);
  const row=f.state.blotters.find(item=>item.report_id===reportId);assert.equal(row.approved_by,user);assert.equal(row.recorded_by,user);assert(row.approved_at);assert(row.blotter_no);
 }
 assert.equal(f.state.reports[0].status,'Submitted');assert.equal(f.state.history.length,0);
});

test('conversion excludes private drafts/cancelled reports and remains unique even after archival',async t=>{
 const f=await fixture(t);seedReport(f.state,{submission_stage:'Draft',status:null});seedReport(f.state,{cancelled_at:'synthetic cancellation'});seedReport(f.state,{status:'Resolved'});
 assert.equal((await f.request(5,'/reports/1/blotter','POST',{...form,confirm:true})).status,404);
 assert.equal((await f.request(5,'/reports/2/blotter','POST',{...form,confirm:true})).status,409);
 assert.equal((await f.request(5,'/reports/3/blotter','POST',{...form,confirm:true})).status,201);
 assert.equal(f.state.reports[2].status,'Resolved');
 assert.equal((await f.request(5,'/blotters/1/archive','POST',{confirm:true})).status,200);
 assert.equal((await f.request(6,'/reports/3/blotter','POST',{...form,confirm:true})).status,409);
 assert.equal(f.state.blotters.length,1);
});

test('numbering failures roll back approval and leave no incomplete official record',async t=>{
 const f=await fixture(t);seedReport(f.state);f.state.failNumber=true;
 assert.equal((await f.request(5,'/reports/1/blotter','POST',{...form,confirm:true})).status,500);
 assert.equal(f.state.blotters.length,0);assert.equal(f.state.reports[0].status,'Submitted');assert.equal(f.state.rollbacks,1);
});

test('competing status updates and duplicate conversions each have exactly one winner',async t=>{
 const f=await fixture(t);seedReport(f.state);
 const statuses=await Promise.all([f.request(3,'/reports/1/status','PATCH',{status:'Under Investigation'}),f.request(4,'/reports/1/status','PATCH',{status:'Under Investigation'})]);
 assert.deepEqual(statuses.map(row=>row.status).sort(),[200,409]);assert.equal(f.state.history.length,1);
 const conversions=await Promise.all([f.request(5,'/reports/1/blotter','POST',{...form,confirm:true}),f.request(6,'/reports/1/blotter','POST',{...form,confirm:true})]);
 assert.deepEqual(conversions.map(row=>row.status).sort(),[201,409]);assert.equal(f.state.blotters.length,1);
});

test('cancellation and processing share a row lock so a cancelled report cannot advance',async t=>{
 const f=await fixture(t);seedReport(f.state);
 const results=await Promise.all([f.request(1,'/reports/1/cancel','POST',{}),f.request(3,'/reports/1/status','PATCH',{status:'Under Investigation'})]);
 assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);
 const row=f.state.reports[0];if(row.cancelled_at){assert.equal(row.status,'Submitted');assert.equal(f.state.history.length,0);}else{assert.equal(row.status,'Under Investigation');assert.equal(f.state.history.length,1);}
});

test('stale blotter forms cannot overwrite a newer narrative',async t=>{
 const f=await fixture(t);const created=await f.request(4,'/blotters','POST',form);const id=created.data.blotter.id;
 const initial=(await f.request(4,'/blotters/'+id)).data.blotter;
 assert.equal((await f.request(4,'/blotters/'+id,'PUT',{...form,narrative:'Updated narrative',expected_token:initial.edit_token})).status,200);
 assert.equal((await f.request(4,'/blotters/'+id,'PUT',{...form,expected_token:initial.edit_token})).status,409);
 assert.equal((await f.request(4,'/blotters/'+id)).data.blotter.narrative,'Updated narrative');
});

test('status and approval actions reject a report changed after staff reviewed it',async t=>{
 const f=await fixture(t);const row=seedReport(f.state);const {editToken,reportKeys}=require('../src/services/editToken');const token=editToken(row,reportKeys);row.title='New owner details';
 assert.equal((await f.request(3,'/reports/1/status','PATCH',{status:'Under Investigation',expected_token:token})).status,409);
 assert.equal((await f.request(5,'/reports/1/blotter','POST',{...form,confirm:true,expected_report_token:token})).status,409);
 assert.equal(f.state.blotters.length,0);assert.equal(f.state.history.length,0);
});
