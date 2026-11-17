const {credentialTag}=require('../src/services/sessionCredentials');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const session = require('express-session');
const {randomBytes,createHmac} = require('node:crypto');
const {createApp} = require('../src/server');
const {verifyPassword} = require('../src/services/password');
const config = {clientOrigin:'http://localhost:5173',sessionSecret:'synthetic-user-management-secret-over-32-bytes',production:false};
const password = 'synthetic-test-password';
async function fixture(t) {
  const store = new session.MemoryStore();
  const initialRoles = ['resident','staff','secretary','captain','super_admin','super_admin','staff','staff'];
  const state = {users:initialRoles.map((role,index)=>({id:index+1,email:`person${index+1}@example.invalid`,password_hash:'private-stored-test-hash',role,is_active:index===7?0:1,resident_id:index===0?1:index===6?2:null,created_at:'2026-01-01',updated_at:'2026-01-01',last_login_at:null})),calls:[],rollbacks:0,failSessions:false,failUpdate:false};
  function list(sql,args) {
    let rows=state.users.filter(row=>['staff','secretary','captain'].includes(row.role)&&row.resident_id===null);
    let cursor=3;
    if(sql.includes('AND role = ?')){const role=args[cursor++];rows=rows.filter(row=>row.role===role);}
    if(sql.includes('AND is_active = ?')){const active=args[cursor++];rows=rows.filter(row=>row.is_active===active);}
    if(sql.includes('email LIKE ?')){const term=args[cursor].slice(1,-1).replace(/!([!%_])/g,'$1').toLowerCase();rows=rows.filter(row=>row.email.includes(term));}
    return rows;
  }
  const publicUser = row => {const {password_hash,resident_id,...safe}=row;void password_hash;void resident_id;return safe;};
  async function execute(sql,args) {
    state.calls.push({sql,args});
    if(sql.startsWith('SELECT id, email, role, resident_id'))return [state.users.filter(row=>row.id===args[0]).map(row=>({...row}))];
    if(sql.endsWith('FOR UPDATE'))return [state.users.filter(row=>row.id===args[0]).map(row=>({...row}))];
    if(sql.startsWith('SELECT COUNT'))return [[{total:list(sql,args).length}]];
    if(sql.startsWith('SELECT')&&sql.includes('role IN'))return [list(sql,args).slice(args.at(-1),args.at(-1)+args.at(-2)).map(publicUser)];
    if(sql.startsWith('INSERT INTO users')){
      if(state.users.some(row=>row.email.toLowerCase()===args[0].toLowerCase()))throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
      const id=Math.max(...state.users.map(row=>row.id))+1;
      state.users.push({id,email:args[0],password_hash:args[1],role:args[2],is_active:1,resident_id:null});return [{insertId:id}];
    }
    if(sql.startsWith('UPDATE users SET role')){
      if(state.failUpdate)throw new Error('PRIVATE_UPDATE_ERROR');
      const row=state.users.find(row=>row.id===args[2]);row.role=args[0];row.is_active=args[1];return [{affectedRows:1}];
    }
    if(sql.startsWith('DELETE FROM sessions')){
      if(state.failSessions)throw new Error('PRIVATE_SESSION_ERROR');
      for(const sid of Object.keys(store.sessions))if(JSON.parse(store.sessions[sid]).userId===Number(args[0]))delete store.sessions[sid];
      return [{affectedRows:1}];
    }
    throw new Error('Unexpected user test SQL');
  }
  const db={query:async()=>[[{result:1}]],execute,getConnection:async()=>{
    let snapshot;
    return {execute,beginTransaction:async()=>{snapshot=structuredClone({users:state.users,sessions:store.sessions});},commit:async()=>{},rollback:async()=>{state.rollbacks++;state.users=snapshot.users;store.sessions=snapshot.sessions;},release:()=>{}};
  }};
  const app=createApp({config,db,sessionStore:store});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.clear();});
  const token=randomBytes(32).toString('hex'),cookies={};
  for(let id=1;id<=8;id++){
    const sid=randomBytes(24).toString('hex');await new Promise(resolve=>store.set(sid,{cookie:{originalMaxAge:60000,expires:new Date(Date.now()+60000),httpOnly:true,path:'/'},userId:id,credentialTag:credentialTag(state.users.find(row=>row.id===id).password_hash),csrfToken:token},resolve));
    const signature=createHmac('sha256',config.sessionSecret).update(sid).digest('base64').replace(/=+$/,'');cookies[id]='bantaylog.sid='+encodeURIComponent('s:'+sid+'.'+signature);
  }
  async function request(actor,path='/users',method='GET',body,headers={}){
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{Cookie:cookies[actor]||'',Origin:config.clientOrigin,'Content-Type':'application/json','X-CSRF-Token':token,...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  }
  return {state,request};
}

test('staff account endpoints require active Super Admin access for every operation',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request(null)).status,401);assert.equal((await f.request(8)).status,401);
  for(const id of [1,2,3,4]){
    assert.equal((await f.request(id)).status,403);
    assert.equal((await f.request(id,'/users','POST',{email:'new@example.invalid',password,role:'captain'})).status,403);
    assert.equal((await f.request(id,'/users/2','PATCH',{role:'captain'})).status,403);
  }
  assert.equal((await f.request(5)).status,200);assert.equal((await f.request(6)).status,200);
});

test('account lists exclude residents/Super Admin/linked accounts and never expose password hashes',async t=>{
  const f=await fixture(t);const result=await f.request(5);
  assert.deepEqual(result.data.users.map(row=>row.id),[2,3,4,8]);assert(!JSON.stringify(result.data).includes('password'));
  assert.equal((await f.request(5,'/users?role=secretary')).data.total,1);
  assert.equal((await f.request(5,'/users?state=inactive')).data.total,1);
  assert.equal((await f.request(5,'/users?search=person2')).data.users[0].id,2);
  for(const query of ['?role=super_admin','?state=maybe','?page=0','?page_size=101'])assert.equal((await f.request(5,'/users'+query)).status,400);
});

test('create supports the three staff roles only, normalizes email, and hashes passwords',async t=>{
  const f=await fixture(t);
  for(const role of ['staff','secretary','captain']){
    const created=await f.request(5,'/users','POST',{email:` ${role.toUpperCase()}@example.invalid `,password,role});
    assert.equal(created.status,201);assert.equal(created.data.user.role,role);assert.equal(created.data.user.is_active,1);
    assert(!JSON.stringify(created.data).includes('password'));
    const stored=f.state.users.find(row=>row.id===created.data.user.id);assert.equal(stored.resident_id,null);assert.equal(stored.email,role+'@example.invalid');assert.equal(await verifyPassword(password,stored.password_hash),true);
  }
  assert.equal((await f.request(5,'/users','POST',{email:'STAFF@example.invalid',password,role:'staff'})).status,409);
});

test('invalid role escalation, short passwords, and forged fields are rejected',async t=>{
  const f=await fixture(t);const base={email:'new@example.invalid',password,role:'staff'};
  for(const body of [{...base,role:'super_admin'},{...base,role:'resident'},{...base,password:'short'},{...base,password:'x'.repeat(129)},{...base,email:'bad'},{...base,resident_id:1},{...base,password_hash:'forged'},{...base,is_active:true}])assert.equal((await f.request(5,'/users','POST',body)).status,400);
  for(const body of [{},{role:'super_admin'},{role:'resident'},{is_active:'false'},{password:'replacement'},{email:'changed@example.invalid'}])assert.equal((await f.request(5,'/users/2','PATCH',body)).status,400);
  assert.equal((await f.request(5,'/users/0','PATCH',{role:'captain'})).status,400);
});

test('resident, linked resident, own account, and other Super Admin accounts are protected',async t=>{
  const f=await fixture(t);const before=structuredClone(f.state.users);
  for(const id of [1,5,6,7])assert.equal((await f.request(5,'/users/'+id,'PATCH',{is_active:false})).status,409);
  assert.equal((await f.request(5,'/users/999','PATCH',{role:'staff'})).status,404);
  assert.deepEqual(f.state.users,before);
  assert.equal((await f.request(5,'/users/2','DELETE')).status,404);
});

test('role updates apply on the next request and partial updates preserve other fields',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request(2,'/auth/me')).data.user.role,'staff');
  assert.equal((await f.request(5,'/users/2','PATCH',{role:'captain'})).status,200);
  assert.equal((await f.request(2,'/auth/me')).data.user.role,'captain');assert.equal(f.state.users.find(row=>row.id===2).is_active,1);
  assert.equal((await f.request(5,'/users/2','PATCH',{is_active:false})).status,200);assert.equal(f.state.users.find(row=>row.id===2).role,'captain');
  assert(f.state.calls.some(call=>call.sql.endsWith('FOR UPDATE')));
});

test('deactivation revokes sessions and reactivation does not revive an old session',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request(2,'/auth/me')).status,200);
  assert.equal((await f.request(5,'/users/2','PATCH',{is_active:false})).status,200);
  assert.equal((await f.request(2,'/auth/me')).status,401);
  assert.equal((await f.request(5,'/users/2','PATCH',{is_active:true})).status,200);
  assert.equal((await f.request(2,'/auth/me')).status,401);
  assert.equal((await f.request(3,'/auth/me')).status,200);
  const deletion=f.state.calls.find(call=>call.sql.startsWith('DELETE FROM sessions'));assert.deepEqual(deletion.args,['2']);
});

test('session revocation failures roll back account changes; CSRF and origin checks reject writes',async t=>{
  const f=await fixture(t);f.state.failSessions=true;
  const failure=await f.request(5,'/users/2','PATCH',{is_active:false});assert.equal(failure.status,500);assert.equal(failure.data.message,'Internal server error');assert.equal(f.state.users.find(row=>row.id===2).is_active,1);assert.equal(f.state.rollbacks,1);
  assert.equal((await f.request(5,'/users/2','PATCH',{is_active:false},{'X-CSRF-Token':''})).status,403);
  assert.equal((await f.request(5,'/users/2','PATCH',{is_active:false},{Origin:'https://untrusted.example'})).status,403);
});
