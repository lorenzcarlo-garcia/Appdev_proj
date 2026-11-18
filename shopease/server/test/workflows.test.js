const {test}=require('node:test');const assert=require('node:assert/strict');const session=require('express-session');const {randomBytes,createHmac}=require('node:crypto');const {createApp}=require('../src/server');const {credentialTag}=require('../src/services/sessionCredentials');const {recoverPassword}=require('../src/services/recoverPasswordService');const {verifyPassword}=require('../src/services/password');
const roles=['resident','staff','secretary','captain','super_admin','resident'];const config={clientOrigin:'http://localhost:5173',sessionSecret:'synthetic-remaining-workflows-session-secret-over-32-bytes',production:false};
const profile={first_name:'Fictional',middle_name:null,last_name:'Resident',birth_date:'2000-01-01',contact_no:null,address:'Fictional address'};
async function fixture(t){
 const store=new session.MemoryStore();const state={users:roles.map((role,index)=>({id:index+1,email:`workflow${index+1}@example.invalid`,role,resident_id:index===0?1:index===5?2:null,is_active:1,password_hash:'synthetic-workflow-hash'})),residents:[{id:1,...profile,is_verified:1,verified_by:3,verified_at:'2026-01-01'},{id:2,...profile,first_name:'Other',is_verified:1}],reports:[
 {id:1,user_id:1,category_id:1,title:'Private draft',submission_stage:'Draft',status:null,cancelled_at:null},
 {id:2,user_id:1,category_id:1,title:'Streetlight problem',submission_stage:'Submitted',status:'Submitted',cancelled_at:null},
 {id:3,user_id:6,category_id:1,title:'Another resident concern',submission_stage:'Submitted',status:'Under Investigation',cancelled_at:null},
 {id:4,user_id:1,category_id:2,title:'Drainage work',submission_stage:'Submitted',status:'Scheduled for Action',cancelled_at:null},
 {id:5,user_id:6,category_id:1,title:'Other resolved report',submission_stage:'Submitted',status:'Resolved',cancelled_at:null},
 {id:6,user_id:1,category_id:1,title:'Cancelled concern',submission_stage:'Submitted',status:'Submitted',cancelled_at:'2026-01-01'}],calls:[],staffProfiles:{},failProfile:false,failSessions:false};
 let queue=Promise.resolve();
 async function execute(sql,args=[]){state.calls.push({sql,args});
  if(sql.includes('FROM users'))return [structuredClone(state.users.filter(user=>sql.includes('WHERE email = ?')?user.email===args[0]:user.id===args[0]))];
  if(sql.includes('FROM staff_profiles'))return [state.staffProfiles[args[0]]?[structuredClone(state.staffProfiles[args[0]])]:[]];
  if(sql.startsWith('INSERT INTO staff_profiles')){const [id,first_name,middle_name,last_name,birth_date,contact_no,address]=args;state.staffProfiles[id]={first_name,middle_name,last_name,birth_date,contact_no,address,version:1};if(state.failProfile)throw new Error('PRIVATE_PROFILE_FAILURE');return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE staff_profiles')){const row=state.staffProfiles[args.at(-1)];[row.first_name,row.middle_name,row.last_name,row.birth_date,row.contact_no,row.address]=args;row.version++;if(state.failProfile)throw new Error('PRIVATE_PROFILE_FAILURE');return [{affectedRows:1}];}
  if(sql.includes('FROM residents')){let rows=state.residents.filter(row=>row.id===args[0]);if(sql.startsWith('SELECT first_name'))rows=rows.map(({first_name,middle_name,last_name,birth_date,contact_no,address,is_verified})=>({first_name,middle_name,last_name,birth_date,contact_no,address,is_verified}));return [structuredClone(rows)];}
  if(sql.startsWith('UPDATE residents')){const row=state.residents.find(row=>row.id===args.at(-1));[row.first_name,row.middle_name,row.last_name,row.birth_date,row.contact_no,row.address]=args;row.is_verified=0;row.verified_by=null;row.verified_at=null;if(state.failProfile)throw new Error('PRIVATE_PROFILE_FAILURE');return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE users SET password_hash')){state.users.find(row=>row.id===args[1]).password_hash=args[0];return [{affectedRows:1}];}
  if(sql.startsWith('DELETE FROM sessions')){if(state.failSessions)throw new Error('PRIVATE_SESSION_FAILURE');for(const id of Object.keys(store.sessions))if(JSON.parse(store.sessions[id]).userId===Number(args[0]))delete store.sessions[id];return [{affectedRows:1}];}
  if(sql.includes('FROM incident_reports')){
   let rows=state.reports,index=0;
   if(sql.includes('user_id = ?')){const value=args[index++];rows=rows.filter(row=>row.user_id===value);}
   if(sql.includes("submission_stage = 'Submitted'"))rows=rows.filter(row=>row.submission_stage==='Submitted');
   if(sql.includes("submission_stage = 'Draft'"))rows=rows.filter(row=>row.submission_stage==='Draft');
   if(sql.includes('cancelled_at IS NOT NULL'))rows=rows.filter(row=>row.cancelled_at);else if(sql.includes('cancelled_at IS NULL'))rows=rows.filter(row=>!row.cancelled_at);
   if(sql.includes('category_id = ?')){const value=args[index++];rows=rows.filter(row=>row.category_id===value);}
   if(sql.includes('status = ?')){const value=args[index++];rows=rows.filter(row=>row.status===value);}
   if(sql.includes('COALESCE(SUM'))return [[{total:rows.length,open:rows.filter(row=>row.status==='Submitted').length,ongoing:rows.filter(row=>['Under Investigation','Scheduled for Action'].includes(row.status)).length,resolved:rows.filter(row=>row.status==='Resolved').length}]];
   if(sql.includes("status = 'Submitted'"))rows=rows.filter(row=>row.status==='Submitted');if(sql.includes("status = 'Resolved'"))rows=rows.filter(row=>row.status==='Resolved');if(sql.includes('status IN'))rows=rows.filter(row=>['Under Investigation','Scheduled for Action'].includes(row.status));
   if(sql.includes('CONCAT_WS')){const q=args[index].slice(1,-1).replace(/!([!%_])/g,'$1').toLowerCase();rows=rows.filter(row=>[row.title,row.reference_no,row.location,row.description,row.category_id===2?'Drainage':'Streetlight'].some(value=>String(value||'').toLowerCase().includes(q)));}
   if(sql.startsWith('SELECT COUNT'))return [[{total:rows.length}]];return [structuredClone(rows.slice(args.at(-1),args.at(-1)+args.at(-2)))];
  }
  throw new Error('Unexpected workflow SQL');
 }
 const db={execute,query:async()=>[[{result:1}]],getConnection:async()=>{let snapshot,unlock;return {execute,beginTransaction:async()=>{const previous=queue;queue=new Promise(resolve=>{unlock=resolve;});await previous;snapshot={users:structuredClone(state.users),residents:structuredClone(state.residents),staffProfiles:structuredClone(state.staffProfiles),sessions:{...store.sessions}};},commit:async()=>unlock(),rollback:async()=>{state.users=snapshot.users;state.residents=snapshot.residents;state.staffProfiles=snapshot.staffProfiles;store.sessions=snapshot.sessions;unlock();},release:()=>{}};}};
 const app=createApp({config,db,sessionStore:store}),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.clear();});const cookies={},token=randomBytes(32).toString('hex');
 for(let id=1;id<=6;id++){const sid=randomBytes(24).toString('hex');await new Promise(resolve=>store.set(sid,{cookie:{expires:new Date(Date.now()+60000),originalMaxAge:60000,path:'/'},userId:id,csrfToken:token,credentialTag:credentialTag(state.users[id-1].password_hash)},resolve));const sign=createHmac('sha256',config.sessionSecret).update(sid).digest('base64').replace(/=+$/,'');cookies[id]='bantaylog.sid='+encodeURIComponent('s:'+sid+'.'+sign);}
 async function request(id,path,method='GET',body,headers={}){const r=await fetch(`http://127.0.0.1:${server.address().port}/api`+path,{method,headers:{Origin:config.clientOrigin,Cookie:cookies[id]||'','X-CSRF-Token':token,'Content-Type':'application/json',...headers},body:method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 return {db,state,request};
}
test('dashboard excludes drafts/cancellations and denies resident/anonymous access',async t=>{const f=await fixture(t);for(const id of [0,1,6])assert.equal((await f.request(id,'/dashboard')).status,id?403:401);for(const id of [2,3,4,5])assert.deepEqual((await f.request(id,'/dashboard')).data.counts,{total:4,open:1,ongoing:2,resolved:1});});
test('server report search and status filters run before pagination and preserve ownership',async t=>{const f=await fixture(t);assert.deepEqual((await f.request(1,'/reports?search=Drainage&page_size=1')).data.reports.map(row=>row.id),[4]);assert.equal((await f.request(1,'/reports?search=resolved')).data.total,0);assert.equal((await f.request(2,'/reports?search=resolved')).data.total,1);assert.deepEqual((await f.request(1,'/reports?status_group=ongoing')).data.reports.map(row=>row.id),[4]);assert.equal((await f.request(2,'/reports?category_id=2')).data.total,1);assert.equal((await f.request(2,'/reports?status=Resolved')).data.total,1);});
test('report filter injection remains bound and malformed filters fail',async t=>{const f=await fixture(t);await f.request(2,'/reports?search='+encodeURIComponent("%' OR 1=1 --"));const call=f.state.calls.find(call=>call.sql.includes('CONCAT_WS'));assert.ok(call);assert.ok(!call.sql.includes('OR 1=1 --'));for(const q of ['category_id=0','category_id=abc','status=Draft','status_group=unknown','search='+ 'x'.repeat(256)])assert.equal((await f.request(2,'/reports?'+q)).status,400);});
test('own profile exposes only safe resident fields and cannot target another resident',async t=>{const f=await fixture(t);const me=await f.request(1,'/auth/profile');assert.equal(me.status,200);assert.equal(me.data.profile.first_name,'Fictional');assert.equal(me.data.profile.id,undefined);assert.equal(me.data.profile.verified_by,undefined);assert.equal((await f.request(6,'/auth/profile')).data.profile.first_name,'Other');for(const id of [2,3,4,5])assert.equal((await f.request(id,'/auth/profile')).status,403);assert.equal((await f.request(1,'/auth/profile','PUT',{...profile,resident_id:2})).status,400);});
test('editing own profile clears verification atomically while a no-op preserves it',async t=>{const f=await fixture(t);const other=structuredClone(f.state.residents[1]);assert.equal((await f.request(1,'/auth/profile','PUT',profile)).data.changed,false);assert.equal(f.state.residents[0].is_verified,1);assert.equal((await f.request(1,'/auth/profile','PUT',{...profile,address:'Updated fictional address'})).data.changed,true);assert.equal(f.state.residents[0].is_verified,0);assert.equal(f.state.residents[0].verified_by,null);assert.deepEqual(f.state.residents[1],other);});

test('all four personnel roles can create only their own personal profile without changing accounts or resident verification',async t=>{
 const f=await fixture(t),accounts=structuredClone(f.state.users),residents=structuredClone(f.state.residents);
 for(const id of [2,3,4,5]){
  const initial=await f.request(id,'/auth/staff-profile');assert.equal(initial.status,200);assert.equal(initial.data.profile.version,0);
  assert.equal((await f.request(id,'/auth/staff-profile','PUT',{...profile,expected_token:initial.data.profile.edit_token})).status,200);
  const saved=(await f.request(id,'/auth/staff-profile')).data.profile;
  assert.equal(saved.first_name,'Fictional');assert.equal(saved.birth_date,'2000-01-01');assert.equal(saved.version,1);
  for(const key of ['user_id','password_hash','is_verified','role','email'])assert.equal(saved[key],undefined);
  assert.equal((await f.request(id,'/auth/staff-profile','PUT',{...profile,expected_token:saved.edit_token})).data.changed,false);
 }
 assert.deepEqual(f.state.users,accounts);assert.deepEqual(f.state.residents,residents);
});

test('staff personal details are private and cannot grant permissions or target another account',async t=>{
 const f=await fixture(t);
 for(const id of [0,1,6])assert.equal((await f.request(id,'/auth/staff-profile')).status,id?403:401);
 const token=(await f.request(2,'/auth/staff-profile')).data.profile.edit_token;
 for(const extra of [{user_id:3},{resident_id:1},{role:'super_admin'},{is_active:true},{email:'other@example.invalid'},{is_verified:true}])assert.equal((await f.request(2,'/auth/staff-profile','PUT',{...profile,...extra,expected_token:token})).status,400);
 assert.equal((await f.request(2,'/auth/staff-profile','PUT',{...profile,expected_token:token},{'X-CSRF-Token':''})).status,403);
 assert.equal((await f.request(2,'/auth/staff-profile','PUT',{...profile,expected_token:token})).status,200);
 assert.equal((await f.request(3,'/auth/staff-profile?user_id=2')).data.profile.first_name,null);
 assert.equal(f.state.users[1].role,'staff');
});

test('staff profile validates dates and required fields, rejects stale forms, and rolls back failed writes',async t=>{
 const f=await fixture(t),initial=(await f.request(2,'/auth/staff-profile')).data.profile;
 for(const changes of [{first_name:' '},{last_name:''},{address:''},{birth_date:'2026-02-30'},{birth_date:'2999-01-01'},{contact_no:'x'.repeat(21)}])assert.equal((await f.request(2,'/auth/staff-profile','PUT',{...profile,...changes,expected_token:initial.edit_token})).status,400);
 f.state.failProfile=true;assert.equal((await f.request(2,'/auth/staff-profile','PUT',{...profile,expected_token:initial.edit_token})).status,500);assert.deepEqual(f.state.staffProfiles,{});f.state.failProfile=false;
 assert.equal((await f.request(2,'/auth/staff-profile','PUT',{...profile,expected_token:initial.edit_token})).status,200);
 assert.equal((await f.request(2,'/auth/staff-profile','PUT',{...profile,address:'Stale address',expected_token:initial.edit_token})).status,409);
 assert.equal((await f.request(2,'/auth/staff-profile')).data.profile.address,profile.address);
 assert.equal((await f.request(2,'/auth/staff-profile','PUT',profile)).status,400);
});

test('concurrent first profile saves have one winner and deactivated or reclassified accounts cannot edit',async t=>{
 const f=await fixture(t),token=(await f.request(2,'/auth/staff-profile')).data.profile.edit_token;
 const results=await Promise.all([f.request(2,'/auth/staff-profile','PUT',{...profile,expected_token:token}),f.request(2,'/auth/staff-profile','PUT',{...profile,first_name:'Competing',expected_token:token})]);
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
 f.state.users[1].role='resident';assert.equal((await f.request(2,'/auth/staff-profile','PUT',{...profile,expected_token:token})).status,403);
 f.state.users[1].is_active=0;assert.equal((await f.request(2,'/auth/staff-profile')).status,401);
});
test('profile rejects protected/invalid fields and requires CSRF; write failures roll back',async t=>{const f=await fixture(t);for(const body of [{...profile,is_verified:true},{...profile,first_name:' '},{...profile,birth_date:'2026-02-30'},{...profile,birth_date:'2999-01-01'}])assert.equal((await f.request(1,'/auth/profile','PUT',body)).status,400);assert.equal((await f.request(1,'/auth/profile','PUT',profile,{'X-CSRF-Token':''})).status,403);const before=structuredClone(f.state.residents[0]);f.state.failProfile=true;assert.equal((await f.request(1,'/auth/profile','PUT',{...profile,address:'Rollback check'})).status,500);assert.deepEqual(f.state.residents[0],before);});
test('private operator recovery changes only the selected credential and revokes its sessions',async t=>{const f=await fixture(t),other=structuredClone(f.state.users[1]);await recoverPassword(f.db,f.state.users[0].email,'synthetic-recovery-password');assert.equal(await verifyPassword('synthetic-recovery-password',f.state.users[0].password_hash),true);assert.deepEqual(f.state.users[1],other);assert.equal((await f.request(1,'/auth/me')).status,401);assert.equal((await f.request(2,'/auth/me')).status,200);});
test('operator recovery rolls back on revocation failure and never changes roles or activation',async t=>{const f=await fixture(t),before=structuredClone(f.state.users);f.state.failSessions=true;await assert.rejects(recoverPassword(f.db,f.state.users[4].email,'synthetic-recovery-password'));assert.deepEqual(f.state.users,before);await assert.rejects(recoverPassword(f.db,'bad','short'));});

test('stale own-profile forms cannot undo a newer address change',async t=>{
 const f=await fixture(t);const initial=(await f.request(1,'/auth/profile')).data.profile;
 assert.equal((await f.request(1,'/auth/profile','PUT',{...profile,address:'New address',expected_token:initial.edit_token})).status,200);
 assert.equal((await f.request(1,'/auth/profile','PUT',{...profile,expected_token:initial.edit_token})).status,409);
 assert.equal((await f.request(1,'/auth/profile')).data.profile.address,'New address');
 assert.equal((await f.request(3,'/residents/1/verification','PATCH',{is_verified:true,expected_token:initial.edit_token})).status,409);
});
