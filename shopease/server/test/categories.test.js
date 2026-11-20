const {credentialTag}=require('../src/services/sessionCredentials');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const session = require('express-session');
const { createHmac, randomBytes } = require('node:crypto');
const { createApp } = require('../src/server');
const config = { clientOrigin: 'http://localhost:5173', sessionSecret: 'category-tests-use-only-synthetic-session-secret', production: false };
const roles = ['resident', 'staff', 'secretary', 'captain', 'super_admin'];
async function fixture(t) {
  const state = { categories: [{ id: 1, name: 'Active', description: null, is_active: 1 }, { id: 2, name: 'Inactive', description: null, is_active: 0 }], writes: 0, fail: false, calls: [] };
  const db = {
    query: async () => [[{ result: 1 }]],
    execute: async (sql, args) => {
      state.calls.push({ sql, args });
  if(sql.startsWith('INSERT INTO activity_log')){(state.activity||=[]).push(args);return [{insertId:state.activity.length}];}if(sql.includes('FROM report_areas'))return [[]];
      if (sql.includes('FROM users')) return [[{ id: args[0], password_hash:'synthetic-resource-hash',email: 'synthetic@example.com', role: roles[args[0]-1], resident_id: null, is_active: 1 }]];
      if (state.fail) throw new Error('PRIVATE_DATABASE_DETAIL');
      if (sql.startsWith('SELECT')) {
        if (sql.includes('WHERE id = ?')) return [state.categories.filter(row => row.id === args[0])];
        return [state.categories.filter(row => args[0] === 1 || row.is_active === 1)];
      }
      if (sql.startsWith('INSERT')) {
        if (state.categories.some(row => row.name.toLowerCase() === args[0].toLowerCase())) throw Object.assign(new Error('duplicate'), { code:'ER_DUP_ENTRY' });
        const id = Math.max(...state.categories.map(row => row.id)) + 1;
        state.categories.push({ id, name: args[0], description: args[1], is_active: 1 }); state.writes++;
        return [{ insertId: id }];
      }
      if (sql.startsWith('UPDATE')) {
        const row = state.categories.find(item => item.id === args[3]);
        if (!row) return [{ affectedRows: 0 }];
        if (state.categories.some(item => item.id !== row.id && item.name.toLowerCase() === args[0].toLowerCase())) throw Object.assign(new Error('duplicate'), { code:'ER_DUP_ENTRY' });
        const changed = row.name !== args[0] || row.description !== args[1] || (args[2] !== null && row.is_active !== args[2]);
        row.name = args[0]; row.description = args[1]; if (args[2] !== null) row.is_active = args[2]; state.writes++;
        return [{ affectedRows: Number(changed) }];
      }
      throw new Error('Unexpected SQL');
    }
  };
  // Writes run in a transaction so the activity entry commits with the change.
  db.getConnection = async () => { let snapshot; return { execute: db.execute,
    beginTransaction: async () => { snapshot = structuredClone({ categories: state.categories, activity: state.activity }); },
    commit: async () => {}, rollback: async () => { state.categories = snapshot.categories; state.activity = snapshot.activity; }, release: () => {} }; };
  const store = new session.MemoryStore();
  const app = createApp({ config, db, sessionStore: store });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.clear(); });
  const token = randomBytes(32).toString('hex');
  const cookies = {};
  for (let i=0;i<roles.length;i++) {
    const sid = randomBytes(24).toString('hex');
    await new Promise(resolve => store.set(sid, { cookie:{ originalMaxAge:60000, expires:new Date(Date.now()+60000), httpOnly:true, path:'/' }, userId:i+1, credentialTag:credentialTag('synthetic-resource-hash'),csrfToken:token }, resolve));
    const signature = createHmac('sha256', config.sessionSecret).update(sid).digest('base64').replace(/=+$/, '');
    cookies[roles[i]] = 'bantaylog.sid=' + encodeURIComponent('s:' + sid + '.' + signature);
  }
  async function request(role, path = '', method = 'GET', body, headers = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/categories${path}`, {
      method, headers:{ Origin:config.clientOrigin, Cookie:cookies[role] || '', 'Content-Type':'application/json', 'X-CSRF-Token':token, ...headers },
      body:body === undefined ? undefined : JSON.stringify(body)
    });
    return { status:response.status, data:await response.json() };
  }
  return { state, request };
}

test('categories require authentication; all five roles can view active categories', async t => {
  const f=await fixture(t);
  assert.equal((await f.request(null)).status, 401);
  for (const role of roles) {
    const result=await f.request(role);
    assert.equal(result.status,200);
    assert.deepEqual(result.data.categories.map(row=>row.id),[1]);
  }
});

test('inactive category visibility follows role restrictions', async t => {
  const f=await fixture(t);
  assert.equal((await f.request('resident','?include_inactive=true')).status,403);
  assert.equal((await f.request('resident','/2')).status,404);
  for (const role of roles.slice(1)) {
    assert.equal((await f.request(role,'?include_inactive=true')).data.categories.length,2);
    assert.equal((await f.request(role,'/2')).status,200);
  }
  assert.equal((await f.request('super_admin','?include_inactive=maybe')).status,400);
});

test('only secretary and super admin may create/edit, with CSRF required', async t => {
  const f=await fixture(t);
  for (const role of ['resident','staff','captain']) {
    assert.equal((await f.request(role,'','POST',{name:'Denied'})).status,403);
    assert.equal((await f.request(role,'/1','PUT',{name:'Denied'})).status,403);
  }
  assert.equal(f.state.writes,0);
  assert.equal((await f.request('secretary','','POST',{name:'Denied'},{'X-CSRF-Token':''})).status,403);
  assert.equal((await f.request('super_admin','','POST',{name:'Denied'},{Origin:'https://untrusted.example'})).status,403);
  for (const role of ['secretary','super_admin']) {
    assert.equal((await f.request(role,'','POST',{name:role})).status,201);
    assert.equal((await f.request(role,'/1','PUT',{name:'Active',is_active:false})).status,200);
  }
});

test('invalid fields and IDs are rejected before category writes', async t => {
  const f=await fixture(t);
  for (const body of [{},{name:' '},{name:'x'.repeat(101)},{name:'valid',description:'x'.repeat(256)},{name:'valid',is_active:true},{name:'valid',id:8},[],{name:2},{name:'valid',description:4}]) {
    assert.equal((await f.request('super_admin','','POST',body)).status,400);
  }
  for (const id of ['0','-1','1abc','4294967296','1%20OR%201=1']) {
    assert.equal((await f.request('super_admin','/'+id)).status,400);
    assert.equal((await f.request('super_admin','/'+id,'PUT',{name:'valid'})).status,400);
  }
  assert.equal((await f.request('super_admin','/1','PUT',{name:'valid',is_active:'false'})).status,400);
  assert.equal(f.state.writes,0);
});

test('parameterized creation trims text, handles duplicates and supports deactivation/reactivation', async t => {
  const f=await fixture(t);
  const name="Test ' OR 1=1 --";
  const created=await f.request('secretary','','POST',{name:'  '+name+'  ',description:'  Details  '});
  assert.equal(created.status,201);
  assert.equal(created.data.category.name,name);
  const insert=f.state.calls.find(call=>call.sql.startsWith('INSERT'));
  assert(!insert.sql.includes(name));
  assert.deepEqual(insert.args,[name,'Details']);
  assert.equal((await f.request('secretary','','POST',{name})).status,409);
  const id=created.data.category.id;
  assert.equal((await f.request('secretary','/'+id,'PUT',{name,is_active:false})).status,200);
  assert.equal((await f.request('resident','/'+id)).status,404);
  assert.equal((await f.request('secretary','/'+id,'PUT',{name,is_active:true})).status,200);
  assert.equal((await f.request('resident','/'+id)).status,200);
  assert.equal((await f.request('secretary','/'+id,'PUT',{name:'Active'})).status,409);
  assert.equal((await f.request('secretary','/1','PUT',{name:'Active'})).status,200); // no-op update
  assert.equal((await f.request('super_admin','/999','PUT',{name:'Missing'})).status,404);
  assert.equal((await f.request('super_admin','/999')).status,404);
});

test('no hard-delete endpoint exists and database errors stay private', async t => {
  const f=await fixture(t);
  assert.equal((await f.request('super_admin','/1','DELETE')).status,404);
  assert.equal(f.state.categories.length,2);
  f.state.fail=true;
  const failure=await f.request('super_admin');
  assert.equal(failure.status,500);
  assert.equal(failure.data.message,'Internal server error');
  assert(!JSON.stringify(failure.data).includes('PRIVATE_DATABASE_DETAIL'));
});
