const {credentialTag}=require('../src/services/sessionCredentials');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const session=require('express-session');const {randomBytes,createHmac}=require('node:crypto');
const {createApp}=require('../src/server');
const {editToken,reportKeys}=require('../src/services/editToken');
const roles=['resident','staff','secretary','captain','super_admin'];
const config={clientOrigin:'http://localhost:5173',sessionSecret:'synthetic-community-update-secret-over-32-bytes',production:false};
const form={title:'Drainage maintenance',summary:'Work along the public road.',location:'Public road near barangay hall',maintenance_status:'Planned'};
async function fixture(t){
 const state={reports:[{id:101,user_id:999,title:'PRIVATE source title',description:'PRIVATE resident narrative',location:'PRIVATE residential address',category_id:1,incident_date:'2026-01-01T10:00:00',submission_stage:'Submitted',status:'Submitted',cancelled_at:null}],updates:[
  {id:1,...form,title:'PRIVATE DRAFT SUMMARY',publication_state:'Draft',version:1,created_by:3,updated_by:3,published_by:null,published_at:null,archived_at:null,archived_by:null,created_at:'2026-01-01',updated_at:'2026-01-01'},
  {id:2,...form,publication_state:'Published',version:1,created_by:3,updated_by:3,published_by:4,published_at:'2026-01-02',archived_at:null,archived_by:null,created_at:'2026-01-01',updated_at:'2026-01-02'},
  {id:3,...form,title:'ARCHIVED SUMMARY',publication_state:'Archived',version:1,created_by:3,updated_by:3,published_by:4,published_at:'2026-01-02',archived_at:'2026-01-03',archived_by:5,created_at:'2026-01-01',updated_at:'2026-01-03'}],calls:[],rollbacks:0,fail:false,missing:false};
 let queue=Promise.resolve();
 function rows(sql,args){
  let result=state.updates;
  if(sql.includes('WHERE id = ?'))result=result.filter(row=>row.id===args[0]);
  if(sql.includes("publication_state = 'Published'"))result=result.filter(row=>row.publication_state==='Published');
  let index=0;
  if(sql.includes('update_type = ?')){const kind=args[index++];result=result.filter(row=>(row.update_type||'Maintenance')===kind);}
  if(sql.includes('source_report_id = ?')){const reportId=args[index++];result=result.filter(row=>row.source_report_id===reportId);}
  if(sql.includes('publication_state = ?')){result=result.filter(row=>row.publication_state===args[index]);index++;}
  if(sql.includes('maintenance_status = ?')){result=result.filter(row=>row.maintenance_status===args[index]);index++;}
  if(sql.includes('title LIKE ?')){
    const q=args[index].slice(1,-1).replace(/=([=%_])/g,'$1').toLowerCase();result=result.filter(row=>[row.title,row.summary,row.location].some(value=>value.toLowerCase().includes(q)));
  }
  if(sql.includes('COUNT(*)'))return [{total:result.length}];
  if(sql.includes('LIMIT ?'))result=result.slice(args.at(-1),args.at(-1)+args.at(-2));
  if(sql.startsWith('SELECT source_report_id'))return result.map(row=>({source_report_id:row.source_report_id||null}));
  if(!sql.includes('created_by'))result=result.map(({id,title,summary,location,maintenance_status,update_type,published_at,updated_at})=>({id,title,summary,location,maintenance_status,update_type:update_type||'Maintenance',published_at,updated_at}));
  return structuredClone(result);
 }
 async function execute(sql,args=[]){
  state.calls.push({sql,args});
  if(sql.startsWith('SELECT') && sql.includes('FROM incident_reports'))return [structuredClone(state.reports.filter(row=>row.id===args[0]))];
  if(sql.startsWith('SELECT id, email'))return [[{id:args[0],password_hash:'synthetic-resource-hash',email:'test@example.invalid',role:roles[args[0]-1],resident_id:null,is_active:1}]];
  if(state.missing)throw Object.assign(new Error('synthetic missing table'),{code:'ER_NO_SUCH_TABLE'});
  if(state.fail && !sql.startsWith('SELECT'))throw new Error('PRIVATE_DATABASE_DETAIL');
  if(state.failNextRead && sql.startsWith('SELECT')){state.failNextRead=false;throw new Error('PRIVATE_READ_AFTER_WRITE_FAILURE');}
  if(sql.startsWith('SELECT'))return [rows(sql,args)];
  if(sql.startsWith('INSERT')){
   if(args[6] && state.updates.some(row=>row.source_report_id===args[6]))throw Object.assign(new Error('duplicate source'),{code:'ER_DUP_ENTRY'});
   const id=Math.max(...state.updates.map(row=>row.id))+1;
   const [title,summary,location,maintenance_status,created_by,updated_by]=args;
   state.updates.push({id,title,summary,location,maintenance_status,created_by,updated_by,source_report_id:args[6]||null,update_type:args[6]?'Reported issue':'Maintenance',publication_state:'Draft',version:1,published_by:null,published_at:null,archived_by:null,archived_at:null,created_at:'2026-01-04',updated_at:'2026-01-04'});return [{insertId:id}];
  }
  const row=state.updates.find(row=>row.id===args.at(-1));
  if(sql.startsWith('UPDATE community_updates SET title'))[row.title,row.summary,row.location,row.maintenance_status,row.updated_by]=args;
  else if(sql.includes("publication_state = 'Published'")){row.publication_state='Published';row.published_by=args[0];row.published_at='2026-01-04';row.updated_by=args[1];}
  else if(sql.includes("publication_state = 'Archived'")){row.publication_state='Archived';row.archived_by=args[0];row.archived_at='2026-01-04';row.updated_by=args[1];}
  else throw new Error('Unexpected update SQL');
  row.version++;if(state.failAfterWrite)state.failNextRead=true;return [{affectedRows:1}];
 }
 const db={execute,query:async()=>[[{result:1}]],getConnection:async()=>{
  let snapshot,unlock;return {execute,beginTransaction:async()=>{const previous=queue;queue=new Promise(resolve=>{unlock=resolve;});await previous;snapshot=structuredClone(state.updates);},commit:async()=>unlock(),rollback:async()=>{state.rollbacks++;state.updates=snapshot;unlock();},release:()=>{}};
 }};
 const store=new session.MemoryStore();const app=createApp({config,db,sessionStore:store});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.clear();});
 const token=randomBytes(32).toString('hex'),cookies={};
 for(let index=0;index<roles.length;index++){
  const sid=randomBytes(24).toString('hex');await new Promise(resolve=>store.set(sid,{cookie:{expires:new Date(Date.now()+60000),originalMaxAge:60000,path:'/'},userId:index+1,credentialTag:credentialTag('synthetic-resource-hash'),csrfToken:token},resolve));
  const sign=createHmac('sha256',config.sessionSecret).update(sid).digest('base64').replace(/=+$/,'');cookies[roles[index]]='bantaylog.sid='+encodeURIComponent('s:'+sid+'.'+sign);
 }
 async function request(role,path='',method='GET',body,headers={}){
  const apiPath=path.startsWith('/reports/')?path:'/community-updates'+path;
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api${apiPath}`,{method,headers:{Cookie:cookies[role]||'',Origin:config.clientOrigin,'X-CSRF-Token':token,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,headers:response.headers,data:await response.json()};
 }
 return {state,request};
}
test('published summaries require login and exclude drafts, archives and internal audit data',async t=>{
 const {request,state}=await fixture(t);assert.equal((await request(null)).status,401);
 for(const role of ['resident','staff']){
  const result=await request(role);assert.equal(result.status,200);assert.deepEqual(result.data.updates.map(row=>row.id),[2]);
  assert.equal(result.headers.get('cache-control'),'private, no-store');assert.equal(result.data.updates[0].created_by,undefined);assert.equal(result.data.updates[0].version,undefined);
  assert.ok(!JSON.stringify(result.data).includes('PRIVATE DRAFT'));assert.equal((await request(role,'/2')).status,200);
  for(const id of [1,3])assert.equal((await request(role,'/'+id)).status,404);
  for(const view of ['drafts','archived','all'])assert.equal((await request(role,'?view='+view)).status,403);
 }
 assert.ok(!state.calls.some(call=>/FROM (incident_reports|residents|blotter_records|report_attachments)/.test(call.sql)));
});
test('report-based summaries require an authorized manager, separate public text, and explicit publication',async t=>{
 const {request,state}=await fixture(t);
 const body={title:'Public drainage concern',summary:'Barangay personnel are reviewing drainage along the shared road.',location:'Public road',expected_report_token:editToken(state.reports[0],reportKeys)};
 for(const role of ['resident','staff'])assert.equal((await request(role,'/reports/101/community-update','POST',body)).status,403);
 assert.equal((await request('secretary','/reports/101/community-update','POST',body,{'X-CSRF-Token':''})).status,403);
 const created=await request('secretary','/reports/101/community-update','POST',body);
 assert.equal(created.status,201);const update=created.data.update;
 assert.equal(update.publication_state,'Draft');assert.equal(update.update_type,'Reported issue');assert.equal(update.source_report_id,101);assert.equal(update.maintenance_status,'Planned');
 assert.ok(!(await request('resident')).data.updates.some(row=>row.id===update.id));
 assert.equal((await request('secretary',`/${update.id}/publish`,'POST',{expected_version:1,confirm:true})).status,200);
 const visible=(await request('resident','?type=Reported%20issue')).data.updates;
 assert.equal(visible.length,1);assert.equal(visible[0].title,body.title);
 for(const key of ['source_report_id','user_id','reference_no','resident_report_no','description','version','created_by'])assert.equal(visible[0][key],undefined);
 for(const value of ['PRIVATE source title','PRIVATE resident narrative','PRIVATE residential address'])assert.ok(!JSON.stringify(visible).includes(value));
 assert.equal((await request('secretary','/reports/101/community-update','POST',body)).status,409);
 assert.equal((await request('resident','?source_report_id=101')).status,403);
 assert.equal((await request('secretary','?source_report_id=101&view=all')).data.updates.length,1);
});

test('drafts, cancelled reports, stale review tokens and forged source fields cannot be published as report summaries',async t=>{
 const {request,state}=await fixture(t),report=state.reports[0];
 const body={title:'Public issue',summary:'A safe separate summary.',location:'Shared road',expected_report_token:editToken(report,reportKeys)};
 report.submission_stage='Draft';assert.equal((await request('secretary','/reports/101/community-update','POST',body)).status,404);
 report.submission_stage='Submitted';report.cancelled_at='2026-01-01';assert.equal((await request('captain','/reports/101/community-update','POST',body)).status,409);
 report.cancelled_at=null;report.status='Under Investigation';assert.equal((await request('super_admin','/reports/101/community-update','POST',body)).status,409);
 const fresh={...body,expected_report_token:editToken(report,reportKeys)};
 assert.equal((await request('secretary','/reports/101/community-update','POST',{...fresh,publication_state:'Published'})).status,400);
 assert.equal((await request('secretary','','POST',{...form,source_report_id:101})).status,400);
 const created=await request('secretary','/reports/101/community-update','POST',fresh);
 assert.equal(created.status,201);assert.equal(created.data.update.maintenance_status,'Ongoing');
 assert.equal((await request('secretary',`/${created.data.update.id}`,'PUT',{...form,maintenance_status:'Completed',expected_version:1})).status,400);
});

test('Secretary Captain and Super Admin can review drafts and archives',async t=>{
 const {request}=await fixture(t);
 for(const role of roles.slice(2)){
  assert.deepEqual((await request(role,'?view=all')).data.updates.map(row=>row.id),[1,2,3]);
  assert.equal((await request(role,'/1')).data.update.publication_state,'Draft');
  assert.equal((await request(role,'/3')).data.update.publication_state,'Archived');
 }
});
test('resident and Staff cannot create, edit, publish or archive updates',async t=>{
 const {request,state}=await fixture(t);const before=structuredClone(state.updates);
 for(const role of ['resident','staff'])for(const [path,method,body]of [['','POST',form],['/1','PUT',{...form,expected_version:1}],['/1/publish','POST',{expected_version:1,confirm:true}],['/2/archive','POST',{expected_version:1,confirm:true}]])assert.equal((await request(role,path,method,body)).status,403);
 assert.deepEqual(state.updates,before);
});
test('writes require CSRF and the configured origin',async t=>{
 const {request,state}=await fixture(t);
 for(const headers of [{'X-CSRF-Token':''},{Origin:'http://untrusted.invalid'}])assert.equal((await request('secretary','','POST',form,headers)).status,403);
 assert.equal(state.updates.length,3);
});
test('creation validates content, trims text, and assigns draft and audit fields on the server',async t=>{
 const {request}=await fixture(t);
 for(const role of roles.slice(2)){
  const result=await request(role,'','POST',{...form,title:'  Public works  '});assert.equal(result.status,201);
  assert.equal(result.data.update.title,'Public works');assert.equal(result.data.update.publication_state,'Draft');assert.equal(result.data.update.version,1);assert.equal(result.data.update.created_by,roles.indexOf(role)+1);assert.equal(result.data.update.published_at,null);
 }
 for(const body of [{},{...form,title:' '},{...form,title:'x'.repeat(151)},{...form,summary:'x'.repeat(2001)},{...form,location:'x'.repeat(256)},{...form,maintenance_status:'Resolved'},...['report_id','resident_id','publication_state','created_by','published_by','version','attachments'].map(key=>({...form,[key]:1}))])assert.equal((await request('super_admin','','POST',body)).status,400);
});
test('publishing requires explicit confirmation and reviewed version; actor cannot be forged',async t=>{
 const {request}=await fixture(t);
 for(const body of [{expected_version:1},{expected_version:1,confirm:'true'},{confirm:true},{expected_version:0,confirm:true},{expected_version:1,confirm:true,published_by:5}])assert.equal((await request('secretary','/1/publish','POST',body)).status,400);
 assert.equal((await request('captain','/1/publish','POST',{expected_version:99,confirm:true})).status,409);
 const result=await request('captain','/1/publish','POST',{expected_version:1,confirm:true});assert.equal(result.status,200);assert.equal(result.data.update.published_by,4);assert.equal(result.data.update.version,2);
 assert.equal((await request('resident','/1')).status,200);
 assert.equal((await request('captain','/1/publish','POST',{expected_version:2,confirm:true})).status,409);
});
test('draft edits stay private; published edits require confirmation and increment version',async t=>{
 const {request}=await fixture(t);
 const draft=await request('secretary','/1','PUT',{...form,title:'Changed draft',expected_version:1});assert.equal(draft.status,200);assert.equal(draft.data.update.version,2);assert.equal((await request('resident','/1')).status,404);
 assert.equal((await request('secretary','/2','PUT',{...form,expected_version:1})).status,400);
 const changed=await request('super_admin','/2','PUT',{...form,maintenance_status:'Completed',expected_version:1,confirm:true});assert.equal(changed.status,200);assert.equal(changed.data.update.version,2);assert.equal(changed.data.update.updated_by,5);
 assert.equal((await request('resident','/2')).data.update.maintenance_status,'Completed');
 assert.equal((await request('secretary','/2','PUT',{...form,expected_version:1,confirm:true})).status,409);
});
test('archival retains records, hides them from residents, and is final',async t=>{
 const {request,state}=await fixture(t);
 assert.equal((await request('secretary','/2/archive','POST',{expected_version:1})).status,400);
 const result=await request('secretary','/2/archive','POST',{expected_version:1,confirm:true});assert.equal(result.status,200);assert.equal(result.data.update.archived_by,3);assert.equal(state.updates.length,3);
 assert.equal((await request('resident','/2')).status,404);assert.equal((await request('staff','/2')).status,404);
 for(const [suffix,method,body]of [['','PUT',{...form,expected_version:2}],['/publish','POST',{expected_version:2,confirm:true}],['/archive','POST',{expected_version:2,confirm:true}]])assert.equal((await request('captain','/2'+suffix,method,body)).status,409);
 assert.equal((await request('super_admin','/2','DELETE')).status,404);
});
test('concurrent publish/edit requests cannot publish an unreviewed changed version',async t=>{
 const {request}=await fixture(t);
 const results=await Promise.all([request('captain','/1/publish','POST',{expected_version:1,confirm:true}),request('secretary','/1','PUT',{...form,title:'Concurrent change',expected_version:1})]);
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
});
test('database failures roll back publishing and keep error details private',async t=>{
 const {request,state}=await fixture(t);state.fail=true;
 const result=await request('captain','/1/publish','POST',{expected_version:1,confirm:true});assert.equal(result.status,500);assert.ok(!JSON.stringify(result.data).includes('PRIVATE_DATABASE_DETAIL'));assert.equal(state.updates[0].publication_state,'Draft');assert.equal(state.rollbacks,1);
 state.fail=false;state.missing=true;const missing=await request('resident');assert.equal(missing.status,503);assert.ok(!JSON.stringify(missing.data).includes('synthetic'));
});
test('search, status filtering and pagination remain parameterized and reject bypasses',async t=>{
 const {request,state}=await fixture(t);
 assert.equal((await request('resident','?maintenance_status=Completed')).data.total,0);
 assert.equal((await request('secretary','?view=all&page_size=1&page=2')).data.updates.length,1);
 await request('resident','?q='+encodeURIComponent("%' OR 1=1 --_"));
 const call=state.calls.find(call=>call.sql.includes('title LIKE'));assert.ok(call);assert.ok(!call.sql.includes('OR 1=1 --'));assert.equal(call.args[1],"%=%' OR 1==1 --=_%");
 for(const query of ['view=Draft','view=all&view=published','page=0','page=1.5','page_size=51','maintenance_status=Resolved','include_drafts=true','q='+ 'x'.repeat(101)])assert.equal((await request('resident','?'+query)).status,400);
 for(const id of ['0','4294967296','abc'])assert.equal((await request('secretary','/'+id)).status,400);
 assert.equal((await request('secretary','/999')).status,404);
});

test('a failure after a publication write rolls back visibility and audit fields together',async t=>{
 const {request,state}=await fixture(t);const before=structuredClone(state.updates[0]);state.failAfterWrite=true;
 const result=await request('captain','/1/publish','POST',{expected_version:1,confirm:true});
 assert.equal(result.status,500);assert.deepEqual(state.updates[0],before);assert.equal(state.rollbacks,1);
 assert.equal((await request('resident','/1')).status,404);
});
