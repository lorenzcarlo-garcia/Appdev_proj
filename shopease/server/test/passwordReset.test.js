const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {passwordResetService}=require('../src/services/passwordResetService');
const {hashPassword,verifyPassword}=require('../src/services/password');
const express=require('express');
const session=require('express-session');
const authRoutes=require('../src/routes/auth');
let originalHash;
before(async()=>{originalHash=await hashPassword('synthetic-original-password');});
function fixture(){
  const state={now:Date.now(),slots:{},users:[{id:1,email:'owner@example.invalid',password_hash:originalHash,is_active:1,role:'resident'},{id:2,email:'other@example.invalid',password_hash:originalHash,is_active:1,role:'super_admin'},{id:3,email:'inactive@example.invalid',password_hash:originalHash,is_active:0}],sessions:[{userId:1},{userId:1},{userId:2}],failSessions:false,failMail:false};
  const mail=[],tasks=[];let tail=Promise.resolve();
  async function execute(sql,args){
    if(sql.startsWith('INSERT INTO password_reset_requests')){
      state.slots[args[0]]||={email_key:args[0],request_id:null,requested_at:null,window_started_at:null,request_count:0,attempts:0};return [{affectedRows:1}];
    }
    if(sql.startsWith('SELECT') && sql.includes('FROM password_reset_requests')){
      const row=sql.includes('WHERE email_key')?state.slots[args[0]]:Object.values(state.slots).find(item=>item.request_id===args[0]);
      return [row?[{...row,cooling_down:row.requested_at!==null && row.requested_at>state.now-60000,current_window:row.window_started_at!==null && row.window_started_at>state.now-900000,expired:row.expires_at<=state.now}]:[]];
    }
    if(sql.startsWith('SELECT') && sql.includes('FROM users'))return [state.users.filter(user=>sql.includes('WHERE email')?user.email===args[0]:user.id===args[0]).map(user=>({...user}))];
    if(sql.startsWith('UPDATE password_reset_requests SET request_id')){
      const [request_id,user_id,code_hash,credential_tag,request_count,keepWindow,email_key]=args;
      Object.assign(state.slots[email_key],{request_id,user_id,code_hash,credential_tag,request_count,requested_at:state.now,expires_at:state.now+900000,attempts:0,used_at:null,...(!keepWindow?{window_started_at:state.now}:{})});return [{affectedRows:1}];
    }
    if(sql.startsWith('UPDATE password_reset_requests SET attempts')){state.slots[args[0]].attempts++;return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE password_reset_requests SET used_at')){
      const row=sql.includes('WHERE request_id')?Object.values(state.slots).find(item=>item.request_id===args[0]):state.slots[args[0]];
      if(row){row.used_at=state.now;row.code_hash=null;}return [{affectedRows:row?1:0}];
    }
    if(sql.startsWith('UPDATE users SET password_hash')){state.users.find(user=>user.id===args[1]).password_hash=args[0];return [{affectedRows:1}];}
    if(sql.startsWith('DELETE FROM sessions')){if(state.failSessions)throw new Error('synthetic session failure');state.sessions=state.sessions.filter(session=>String(session.userId)!==args[0]);return [{affectedRows:1}];}
    throw new Error('Unexpected test SQL: '+sql);
  }
  const db={execute,getConnection:async()=>{
    let beforeState,unlock;
    return {execute,beginTransaction:async()=>{const previous=tail;tail=new Promise(resolve=>{unlock=resolve;});await previous;beforeState=structuredClone({slots:state.slots,users:state.users,sessions:state.sessions});},commit:async()=>unlock(),rollback:async()=>{Object.assign(state,beforeState);unlock();},release:()=>{}};
  }};
  const service=passwordResetService(db,{secret:'synthetic-reset-pepper-at-least-32-bytes',mailer:{configured:true,send:async payload=>{if(state.failMail)throw new Error('private mail error');mail.push(payload);}},schedule:task=>tasks.push(task),onDeliveryFailure:()=>{}});
  const drain=async()=>{while(tasks.length)await tasks.shift()();};
  const request=async(email='owner@example.invalid')=>{const result=await service.request({email});await drain();return result;};
  const body=(requestId,code=mail.at(-1)?.code)=>({request_id:requestId,code,new_password:'synthetic-replacement-password',confirm_password:'synthetic-replacement-password'});
  return {state,mail,service,request,body,db};
}
test('known, unknown and inactive emails have the same response shape; only active accounts receive codes',async()=>{
  const f=fixture();const known=await f.request(),unknown=await f.request('missing@example.invalid'),inactive=await f.request('inactive@example.invalid');
  assert.equal(known.message,unknown.message);assert.equal(known.message,inactive.message);
  assert.deepEqual(Object.keys(known),Object.keys(unknown));assert.equal(f.mail.length,1);
  assert.match(f.mail[0].code,/^\d{8}$/);assert.ok(!JSON.stringify(known).includes(f.mail[0].code));
  for(const row of Object.values(f.state.slots)){assert.match(row.code_hash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(row).includes('owner@example.invalid'));assert.notEqual(row.code_hash,f.mail[0].code);}
});
test('reset replaces only the target credential, revokes its sessions, consumes the code and never changes roles',async()=>{
  const f=fixture(),request=await f.request(),body=f.body(request.request_id);
  await f.service.reset(body);
  assert.ok(await verifyPassword(body.new_password,f.state.users[0].password_hash));
  assert.ok(!await verifyPassword('synthetic-original-password',f.state.users[0].password_hash));
  assert.equal(f.state.users[0].role,'resident');assert.equal(f.state.users[1].password_hash,originalHash);
  assert.deepEqual(f.state.sessions,[{userId:2}]);
  await assert.rejects(f.service.reset(body),error=>error.status===400);
});
test('five wrong guesses block even the correct code; expired codes and changed credentials cannot reset',async()=>{
  const f=fixture(),request=await f.request(),correct=f.body(request.request_id);
  const wrong=correct.code==='00000000'?'11111111':'00000000';
  for(let attempt=0;attempt<5;attempt++)await assert.rejects(f.service.reset({...correct,code:wrong}),error=>error.status===400);
  await assert.rejects(f.service.reset(correct),error=>error.status===400);
  f.state.now+=61000;const fresh=await f.request();f.state.now+=900001;
  await assert.rejects(f.service.reset(f.body(fresh.request_id)),error=>error.status===400);
  const newest=await f.request();f.state.users[0].password_hash='synthetic changed credential';
  await assert.rejects(f.service.reset(f.body(newest.request_id)),error=>error.status===400);
});
test('resends have a cooldown and a persisted per-email limit; a new request invalidates the old code',async()=>{
  const f=fixture(),first=await f.request(),old=f.body(first.request_id);
  assert.equal((await f.request()).request_id,first.request_id);assert.equal(f.mail.length,1);
  f.state.now+=61000;const second=await f.request();assert.notEqual(second.request_id,first.request_id);
  await assert.rejects(f.service.reset(old),error=>error.status===400);
  for(let count=0;count<3;count++){f.state.now+=61000;await f.request();}
  f.state.now+=61000;await f.request();assert.equal(f.mail.length,5);
});
test('database failure rolls back both the new credential and consumption, allowing a safe retry',async()=>{
  const f=fixture(),request=await f.request(),body=f.body(request.request_id);
  f.state.failSessions=true;await assert.rejects(f.service.reset(body),/synthetic session failure/);
  assert.equal(f.state.users[0].password_hash,originalHash);assert.equal(f.state.sessions.length,3);
  assert.equal(Object.values(f.state.slots)[0].used_at,null);
  f.state.failSessions=false;await f.service.reset(body);
});
test('competing reset attempts have one winner and SMTP failure invalidates the unsent code',async()=>{
  const f=fixture(),request=await f.request(),body=f.body(request.request_id);
  const results=await Promise.allSettled([f.service.reset(body),f.service.reset(body)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const other=fixture();other.state.failMail=true;const failed=await other.request();
  const slot=Object.values(other.state.slots)[0];assert.equal(slot.code_hash,null);assert.ok(slot.used_at);
  await assert.rejects(other.service.reset(other.body(failed.request_id,'00000000')),error=>error.status===400);
});
test('invalid fields and confirmation cannot mutate credentials; email setup is required',async()=>{
  const f=fixture(),request=await f.request(),body=f.body(request.request_id);
  for(const changed of [{...body,user_id:2},{...body,confirm_password:'different'},{...body,new_password:'short'},{...body,code:'123'}])await assert.rejects(f.service.reset(changed),error=>error.status===400);
  assert.equal(f.state.users[0].password_hash,originalHash);
  await assert.rejects(f.service.request({email:'bad\naddress'}),error=>error.status===400);
  const disabled=passwordResetService(f.db,{secret:'synthetic-secret',mailer:{configured:false}});
  await assert.rejects(disabled.request({email:'owner@example.invalid'}),error=>error.status===503);
});
test('public recovery endpoints require CSRF and an allowed origin, do not disclose accounts, and limit requests',async t=>{
  const f=fixture(),app=express();app.use(express.json());
  app.use(session({secret:'synthetic-reset-http-session-secret',resave:false,saveUninitialized:false}));
  app.use('/api/auth',authRoutes(f.db,{sessionSecret:'synthetic-reset-http-session-secret',clientOrigin:'http://localhost:5173'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/api/auth`;
  const csrf=await fetch(base+'/csrf'),cookie=csrf.headers.get('set-cookie').split(';')[0],token=(await csrf.json()).csrfToken;
  const send=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:'http://localhost:5173','X-CSRF-Token':token,...headers},body:JSON.stringify(body)});
  assert.equal((await send('/forgot-password',{email:'owner@example.invalid'},{'X-CSRF-Token':''})).status,403);
  assert.equal((await send('/reset-password',{}, {Origin:'https://wrong.invalid'})).status,403);
  const known=await send('/forgot-password',{email:'owner@example.invalid'}),unknown=await send('/forgot-password',{email:'missing@example.invalid'});
  assert.equal(known.status,503);assert.equal(unknown.status,503);assert.deepEqual(await known.json(),await unknown.json());
  for(let n=0;n<3;n++)await send('/forgot-password',{email:'owner@example.invalid'});
  assert.equal((await send('/forgot-password',{email:'owner@example.invalid'})).status,429);
});
