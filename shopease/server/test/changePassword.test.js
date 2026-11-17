const {test}=require('node:test');const assert=require('node:assert/strict');
const session=require('express-session');const {randomBytes,createHmac}=require('node:crypto');
const {hashPassword,verifyPassword}=require('../src/services/password');const {credentialTag}=require('../src/services/sessionCredentials');const {createApp}=require('../src/server');
const current='synthetic-current-password',replacement='synthetic-replacement-password';
const roles=['resident','staff','secretary','captain','super_admin'];
const config={clientOrigin:'http://localhost:5173',clientOrigins:['http://localhost:5173','http://192.168.1.7:5173'],sessionSecret:'synthetic-password-change-secret-more-than-32-bytes',production:false};
let seedHash;
async function fixture(t){
 const hash=await(seedHash ||= hashPassword(current));const store=new session.MemoryStore();
 const state={users:roles.map((role,index)=>({id:index+1,email:`password${index+1}@example.invalid`,role,resident_id:null,is_active:1,password_hash:hash})),rollbacks:0,failDelete:false,failCommit:false,changeBeforeLock:false};
 let queue=Promise.resolve();
 async function execute(sql,args){
  if(sql.startsWith('SELECT')){
   if(sql.includes('FOR UPDATE') && state.changeBeforeLock){state.users.find(user=>user.id===args[0]).password_hash='concurrently-changed-hash';state.changeBeforeLock=false;}
   const users=state.users.filter(user=>sql.includes('WHERE email = ?')?user.email===args[0]:user.id===args[0]);return [structuredClone(users)];
  }
  if(sql.startsWith('UPDATE users SET last_login_at'))return [{affectedRows:1}];
  if(sql.startsWith('UPDATE users SET password_hash')){state.users.find(user=>user.id===args[1]).password_hash=args[0];return [{affectedRows:1}];}
  if(sql.startsWith('DELETE FROM sessions')){
   if(state.failDelete)throw new Error('PRIVATE_SESSION_DELETE_FAILURE');
   for(const sid of Object.keys(store.sessions))if(JSON.parse(store.sessions[sid]).userId===Number(args[0]))delete store.sessions[sid];return [{affectedRows:1}];
  }
  throw new Error('Unexpected password test SQL');
 }
 const db={execute,query:async()=>[[{result:1}]],getConnection:async()=>{
  let snapshot,unlock;return {execute,beginTransaction:async()=>{const before=queue;queue=new Promise(resolve=>{unlock=resolve;});await before;snapshot={users:structuredClone(state.users),sessions:{...store.sessions}};},commit:async()=>{if(state.failCommit)throw new Error('PRIVATE_COMMIT_FAILURE');unlock();},rollback:async()=>{state.rollbacks++;state.users=snapshot.users;store.sessions=snapshot.sessions;unlock();},release:()=>{}};
 }};
 const app=createApp({config,db,sessionStore:store});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.clear();});
 async function client(userId,options={}){
  const sid=randomBytes(24).toString('hex');let token=randomBytes(32).toString('hex'),cookie='';
  if(userId){
   await new Promise(resolve=>store.set(sid,{cookie:{expires:new Date(Date.now()+60000),originalMaxAge:60000,path:'/'},userId,csrfToken:token,...(options.legacy?{}:{credentialTag:credentialTag(state.users.find(user=>user.id===userId).password_hash)})},resolve));
   const sign=createHmac('sha256',config.sessionSecret).update(sid).digest('base64').replace(/=+$/,'');cookie='bantaylog.sid='+encodeURIComponent('s:'+sid+'.'+sign);
  }
  async function request(path='/change-password',method='POST',body={current_password:current,new_password:replacement,confirm_password:replacement},headers={}){
   const response=await fetch(`http://127.0.0.1:${server.address().port}/api/auth${path}`,{method,headers:{Origin:config.clientOrigin,Cookie:cookie,'X-CSRF-Token':token,'Content-Type':'application/json',...headers},body:method==='GET'?undefined:JSON.stringify(body)});
   const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];const data=await response.json();if(data.csrfToken)token=data.csrfToken;
   return {status:response.status,data,setCookie};
  }
  return {request,sid,get cookie(){return cookie;},get token(){return token;}};
 }
 return {state,store,client};
}
test('all five roles can change only their own password and must sign in again',async t=>{
 const {state,client}=await fixture(t);
 for(let id=1;id<=5;id++){
  const c=await client(id);const before=state.users[id-1].password_hash;const result=await c.request();assert.equal(result.status,200);assert.ok(result.setCookie.includes('Expires='));assert.ok(!JSON.stringify(result.data).includes('scrypt'));assert.notEqual(state.users[id-1].password_hash,before);assert.equal(state.users[id-1].role,roles[id-1]);assert.equal((await c.request('/me','GET')).status,401);
 }
 assert.equal(await verifyPassword(replacement,state.users[0].password_hash),true);
});
test('changing password revokes this account on both devices, rejects old login and preserves other users',async t=>{
 const {state,store,client}=await fixture(t);const laptop=await client(1),phone=await client(1),other=await client(2);const oldSession=store.sessions[phone.sid],oldCookie=phone.cookie;
 assert.equal((await laptop.request()).status,200);assert.equal((await phone.request('/me','GET')).status,401);assert.equal((await other.request('/me','GET')).status,200);
 // Simulate a pre-change request saving stale session data after the SQL delete.
 store.sessions[phone.sid]=oldSession;assert.equal((await phone.request('/me','GET',undefined,{Cookie:oldCookie})).status,401);
 const login=await client();await login.request('/csrf','GET');
 assert.equal((await login.request('/login','POST',{email:state.users[0].email,password:current})).status,401);
 assert.equal((await login.request('/login','POST',{email:state.users[0].email,password:replacement})).status,200);
 const me=await login.request('/me','GET');assert.equal(me.status,200);assert.equal(me.data.user.password_hash,undefined);assert.equal(me.data.user.credentialTag,undefined);
});
test('change requires active login, current password, CSRF and a permitted origin',async t=>{
 const {state,client}=await fixture(t);const c=await client(1),anonymous=await client();await anonymous.request('/csrf','GET');
 assert.equal((await anonymous.request()).status,401);
 for(const headers of [{'X-CSRF-Token':''},{Origin:'http://untrusted.invalid'}])assert.equal((await c.request('/change-password','POST',undefined,headers)).status,403);
 assert.equal((await c.request('/change-password','POST',{current_password:'wrong',new_password:replacement,confirm_password:replacement})).status,400);
 assert.equal((await c.request('/me','GET')).status,200);
 state.users[0].is_active=0;assert.equal((await c.request()).status,401);
});
test('validation rejects forged targets, missing confirmation, reuse and invalid new passwords',async t=>{
 const {client}=await fixture(t);const body={current_password:current,new_password:replacement,confirm_password:replacement};
 const cases=[{...body,user_id:2},{...body,email:'other@example.invalid'},{...body,role:'super_admin'},{...body,password_hash:'forged'},{...body,confirm_password:''},{...body,confirm_password:'different'},{...body,new_password:current,confirm_password:current},{...body,new_password:'short',confirm_password:'short'},{...body,new_password:'a'.repeat(129),confirm_password:'a'.repeat(129)},{...body,current_password:'a'.repeat(129)},[],null];
 const clients=await Promise.all(roles.map((_,index)=>client(index+1)));
 for(let index=0;index<cases.length;index++)assert.equal((await clients[index%5].request('/change-password','POST',cases[index])).status,400);
});
test('failure to revoke sessions rolls back the hash and preserves existing logins',async t=>{
 const {state,client}=await fixture(t);const c=await client(1),phone=await client(1),before=state.users[0].password_hash;state.failDelete=true;
 const result=await c.request();assert.equal(result.status,500);assert.ok(!JSON.stringify(result.data).includes('PRIVATE'));assert.equal(state.users[0].password_hash,before);assert.equal(state.rollbacks,1);assert.equal((await c.request('/me','GET')).status,200);assert.equal((await phone.request('/me','GET')).status,200);
});
test('failed commit cannot leave a partial password change',async t=>{
 const {state,client}=await fixture(t);const c=await client(1),before=state.users[0].password_hash;state.failCommit=true;
 assert.equal((await c.request()).status,500);assert.equal(state.users[0].password_hash,before);assert.equal((await c.request('/me','GET')).status,200);
});
test('concurrent changes with the same old password have exactly one winner',async t=>{
 const {client}=await fixture(t);const a=await client(1),b=await client(1);
 const results=await Promise.all([a.request(),b.request('/change-password','POST',{current_password:current,new_password:'another-new-test-password',confirm_password:'another-new-test-password'})]);
 assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);assert.equal((await a.request('/me','GET')).status,401);assert.equal((await b.request('/me','GET')).status,401);
});
test('password verification is rechecked against the locked account state',async t=>{
 const {state,client}=await fixture(t);const c=await client(1);state.changeBeforeLock=true;assert.equal((await c.request()).status,409);assert.equal(state.rollbacks,1);
});
test('legacy sessions require a fresh login after the credential-binding update',async t=>{
 const {client}=await fixture(t);const c=await client(1,{legacy:true});assert.equal((await c.request('/me','GET')).status,401);
});
test('incorrect current-password attempts are limited per account',async t=>{
 const {client}=await fixture(t);const c=await client(1);const body={current_password:'incorrect-password',new_password:replacement,confirm_password:replacement};
 for(let i=0;i<5;i++)assert.equal((await c.request('/change-password','POST',body)).status,400);
 assert.equal((await c.request('/change-password','POST',body)).status,429);
 const other=await client(2);assert.equal((await other.request('/change-password','POST',body)).status,400);
});
