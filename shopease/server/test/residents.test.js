const {credentialTag}=require('../src/services/sessionCredentials');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const session = require('express-session');
const { createHmac, randomBytes } = require('node:crypto');
const { createApp } = require('../src/server');
const roles = ['resident','staff','secretary','captain','super_admin'];
const config = { clientOrigin:'http://localhost:5173', sessionSecret:'synthetic-resident-test-secret-over-32-bytes', production:false };
const details = { first_name:'Test', last_name:'Resident', address:'Fictional address' };
async function fixture(t) {
  const state = {
    residents:[{id:1,...details,is_verified:0,verified_by:null,verified_at:null},{id:2,...details,is_verified:0,verified_by:null,verified_at:null}],
    linked:[1], calls:[], active:true, failDelete:false, failVerification:false, rollbacks:0, releases:0, transactions:0
  };
  async function execute(sql,args) {
    state.calls.push({sql,args});
    if (sql.startsWith('SELECT id, email')) return [state.active ? [{id:args[0],password_hash:'synthetic-resource-hash',email:'synthetic@example.com',role:roles[args[0]-1],is_active:1,resident_id:null}] : []];
    if (sql.startsWith('SELECT id FROM users')) return [state.linked.includes(args[0]) ? [{id:1}] : []];
    if (sql.startsWith('SELECT COUNT')) return [[{total:state.residents.length}]];
    if (sql.startsWith('SELECT')) {
      if (sql.includes('WHERE id = ?')) return [state.residents.filter(row=>row.id===args[0])];
      return [state.residents.slice(args[3],args[3]+args[2])];
    }
    if (sql.startsWith('INSERT')) {
      const id=Math.max(0,...state.residents.map(row=>row.id))+1;
      const [first_name,middle_name,last_name,birth_date,contact_no,address,created_by]=args;
      state.residents.push({id,first_name,middle_name,last_name,birth_date,contact_no,address,created_by,is_verified:0});
      return [{insertId:id}];
    }
    if (sql.startsWith('UPDATE residents SET first_name')) {
      const row=state.residents.find(item=>item.id===args[6]);
      if (!row) return [{affectedRows:0}];
      [row.first_name,row.middle_name,row.last_name,row.birth_date,row.contact_no,row.address]=args;
      return [{affectedRows:1}];
    }
    if (sql.startsWith('UPDATE residents SET is_verified')) {
      if (state.failVerification) throw new Error('PRIVATE_VERIFICATION_ERROR');
      const row=state.residents.find(item=>item.id===args.at(-1));
      row.is_verified=args[0]; row.verified_by=args[0] ? args[1] : null; row.verified_at=args[0] ? 'synthetic timestamp' : null;
      return [{affectedRows:1}];
    }
    if (sql.startsWith('DELETE')) {
      if (state.failDelete) throw Object.assign(new Error('private foreign key detail'),{code:'ER_ROW_IS_REFERENCED_2'});
      state.residents=state.residents.filter(row=>row.id!==args[0]);
      return [{affectedRows:1}];
    }
    throw new Error('Unexpected test SQL');
  }
  const db={query:async()=>[[{result:1}]],execute,getConnection:async()=>{
    let snapshot;
    return {execute,beginTransaction:async()=>{state.transactions++;snapshot=structuredClone(state.residents);},commit:async()=>{},rollback:async()=>{state.rollbacks++;state.residents=snapshot;},release:()=>{state.releases++;}};
  }};
  const store=new session.MemoryStore();
  const app=createApp({config,db,sessionStore:store});
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.clear();});
  const token=randomBytes(32).toString('hex');
  const cookies={};
  for (let i=0;i<roles.length;i++) {
    const sid=randomBytes(24).toString('hex');
    await new Promise(resolve=>store.set(sid,{cookie:{originalMaxAge:60000,expires:new Date(Date.now()+60000),httpOnly:true,path:'/'},userId:i+1,credentialTag:credentialTag('synthetic-resource-hash'),csrfToken:token},resolve));
    const signature=createHmac('sha256',config.sessionSecret).update(sid).digest('base64').replace(/=+$/,'');
    cookies[roles[i]]='bantaylog.sid='+encodeURIComponent('s:'+sid+'.'+signature);
  }
  async function request(role,path='',method='GET',body,headers={}) {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/residents${path}`,{method,headers:{Origin:config.clientOrigin,Cookie:cookies[role]||'','Content-Type':'application/json','X-CSRF-Token':token,...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  }
  return {state,request};
}

test('anonymous/resident/inactive users cannot access administrative resident information',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request(null)).status,401);
  assert.equal((await f.request('resident')).status,403);
  assert.equal((await f.request('resident','/1')).status,403);
  for (const role of roles.slice(1)) {
    assert.equal((await f.request(role)).status,200);
    assert.equal((await f.request(role,'/1')).status,200);
  }
  f.state.active=false;
  assert.equal((await f.request('staff')).status,401);
});

test('create/edit/verification enforce roles and server-assigned audit fields',async t=>{
  const f=await fixture(t);
  for (const role of ['resident','staff','captain']) {
    assert.equal((await f.request(role,'','POST',details)).status,403);
    assert.equal((await f.request(role,'/2','PUT',details)).status,403);
    assert.equal((await f.request(role,'/2/verification','PATCH',{is_verified:true})).status,403);
  }
  for (const role of ['secretary','super_admin']) {
    const created=await f.request(role,'','POST',{...details,first_name:'  Test  '});
    assert.equal(created.status,201);
    assert.equal(created.data.resident.first_name,'Test');
    assert.equal(created.data.resident.is_verified,0);
    assert.equal(created.data.resident.created_by,roles.indexOf(role)+1);
    assert.equal((await f.request(role,'/'+created.data.resident.id,'PUT',details)).status,200);
    assert.equal((await f.request(role,'/'+created.data.resident.id+'/verification','PATCH',{is_verified:true})).status,200);
    const row=f.state.residents.find(item=>item.id===created.data.resident.id);
    assert.equal(row.verified_by,roles.indexOf(role)+1);
  }
  for (const field of ['created_by','verified_by','verified_at','is_verified','id','role']) {
    assert.equal((await f.request('super_admin','','POST',{...details,[field]:1})).status,400);
    assert.equal((await f.request('super_admin','/2','PUT',{...details,[field]:1})).status,400);
  }
});

test('required fields, optional types, dates, IDs, and pagination are validated',async t=>{
  const f=await fixture(t);
  for (const body of [{},{...details,first_name:' '},{...details,last_name:'x'.repeat(81)},{...details,address:'x'.repeat(256)},{...details,contact_no:123},{...details,birth_date:'2025-02-29'},{...details,birth_date:'2999-01-01'},{...details,birth_date:0}]) {
    assert.equal((await f.request('secretary','','POST',body)).status,400);
  }
  for (const id of ['0','-1','1abc','4294967296']) assert.equal((await f.request('staff','/'+id)).status,400);
  for (const query of ['?page=0','?page_size=101','?search=a&search=b','?page=1.5']) assert.equal((await f.request('staff',query)).status,400);
  assert.equal((await f.request('secretary','/999','PUT',details)).status,404);
  assert.equal((await f.request('staff','/999')).status,404);
  const sqlBefore=f.state.calls.length;
  const result=await f.request('staff','?search='+encodeURIComponent("%' OR 1=1 --")+'&page_size=1');
  assert.equal(result.status,200);
  assert.equal(result.data.residents.length,1);
  const query=f.state.calls.slice(sqlBefore).find(item=>item.sql.startsWith('SELECT COUNT'));
  assert(!query.sql.includes('OR 1=1'));
  assert(query.args[0].includes('!%'));
});

test('verification is idempotent and clearing it clears actor/time; failures roll back',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('secretary','/2/verification','PATCH',{is_verified:true})).status,200);
  const row=f.state.residents.find(item=>item.id===2);
  assert.equal(row.verified_by,3);
  assert.equal((await f.request('super_admin','/2/verification','PATCH',{is_verified:true})).status,200);
  assert.equal(row.verified_by,3);
  assert.equal((await f.request('secretary','/2/verification','PATCH',{is_verified:false})).status,200);
  assert.equal(row.verified_by,null); assert.equal(row.verified_at,null);
  assert.equal((await f.request('secretary','/2/verification','PATCH',{is_verified:'true'})).status,400);
  assert.equal((await f.request('secretary','/2/verification','PATCH',{is_verified:true,verified_by:99})).status,400);
  assert.equal((await f.request('secretary','/999/verification','PATCH',{is_verified:true})).status,404);
  f.state.failVerification=true;
  const failed=await f.request('secretary','/2/verification','PATCH',{is_verified:true});
  assert.equal(failed.status,500);assert.equal(failed.data.message,'Internal server error');
  assert.equal(f.state.residents.find(item=>item.id===2).is_verified,0);
  assert.equal(f.state.rollbacks,1);assert.equal(f.state.releases,f.state.transactions);
});

test('only super admin may delete, explicit confirmation and CSRF are required',async t=>{
  const f=await fixture(t);
  for (const role of ['resident','staff','secretary','captain']) assert.equal((await f.request(role,'/2','DELETE',{confirm:true})).status,403);
  assert.equal((await f.request('super_admin','/2','DELETE',{})).status,400);
  assert.equal((await f.request('super_admin','/2','DELETE',{confirm:true},{'X-CSRF-Token':''})).status,403);
  assert.equal((await f.request('super_admin','','POST',details,{Origin:'https://untrusted.example'})).status,403);
  assert.equal(f.state.residents.length,2);
  assert.equal((await f.request('super_admin','/2','DELETE',{confirm:true})).status,200);
  assert.equal(f.state.residents.length,1);
});

test('linked accounts block deletion; row locks and foreign-key errors protect the transaction',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('super_admin','/1','DELETE',{confirm:true})).status,409);
  assert.equal(f.state.residents.length,2);
  assert(!f.state.calls.some(item=>item.sql.startsWith('DELETE')));
  assert(f.state.calls.some(item=>item.sql.endsWith('FOR UPDATE')));
  f.state.failDelete=true;
  const failure=await f.request('super_admin','/2','DELETE',{confirm:true});
  assert.equal(failure.status,409);
  assert.equal(f.state.rollbacks,1);
  assert.equal(f.state.residents.length,2);
  assert.equal(f.state.releases,f.state.transactions);
  assert.equal((await f.request('super_admin','/999','DELETE',{confirm:true})).status,404);
});
