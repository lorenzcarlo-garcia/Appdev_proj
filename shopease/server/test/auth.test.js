const { test } = require('node:test');
const assert = require('node:assert/strict');
const session = require('express-session');
const { createApp } = require('../src/server');
const { hashPassword, verifyPassword, validPassword } = require('../src/services/password');
const { allowRoles } = require('../src/middleware/auth');
const { spawnSync } = require('node:child_process');

const config = { clientOrigin: 'http://localhost:5173', sessionSecret: 'synthetic-test-secret-with-more-than-32-bytes', production: false };
const password = 'test-only-long-password';
function fakeDatabase() {
  const db = { users: [], residents: [], rollbackCount: 0, failInsert: false };
  db.query = async () => [[{ result: 1 }]];
  db.execute = async (sql, args) => {
    if (sql.includes('WHERE email = ?')) return [db.users.filter(user => user.email === args[0])];
    if (sql.startsWith('SELECT id, email')) return [db.users.filter(user => user.id === args[0])];
    if (sql.startsWith('UPDATE users SET last_login_at')) return [{ affectedRows: 1 }];
    throw new Error('Unexpected pool SQL: ' + sql);
  };
  db.getConnection = async () => {
    let before;
    return {
      beginTransaction: async () => { before = structuredClone({ users: db.users, residents: db.residents }); },
      commit: async () => {},
      rollback: async () => { db.rollbackCount++; db.users = before.users; db.residents = before.residents; },
      release: () => {},
      execute: async (sql, args) => {
        if (sql.startsWith('INSERT INTO residents')) {
          const id = db.residents.length + 1;
          db.residents.push({ id, is_verified: args[6] });
          return [{ insertId: id }];
        }
        if (sql.startsWith('INSERT INTO users')) {
          if (db.failInsert) throw new Error('synthetic database failure');
          if (db.users.some(user => user.email === args[1])) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
          const id = db.users.length + 1;
          db.users.push({ id, resident_id: args[0], email: args[1], password_hash: args[2], role: args[3], is_active: 1 });
          return [{ insertId: id }];
        }
        if (sql.startsWith('UPDATE residents SET created_by')) return [{ affectedRows: 1 }];
        throw new Error('Unexpected transaction SQL: ' + sql);
      }
    };
  };
  return db;
}
async function fixture(t, overrides = {}) {
  const db = fakeDatabase();
  const store = new session.MemoryStore(); // Tests only; production uses MySQL.
  const app = createApp({ config: { ...config, ...overrides }, db, sessionStore: store });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.clear(); });
  let cookie = '';
  let token;
  async function request(path, method = 'GET', body, overrides = {}) {
    const headers = { Cookie: cookie, Origin: config.clientOrigin, ...overrides };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token && !('X-CSRF-Token' in headers)) headers['X-CSRF-Token'] = token;
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const data = await response.json();
    if (data.csrfToken) token = data.csrfToken;
    return { status: response.status, data, setCookie, headers: response.headers };
  }
  return { db, store, request, get cookie() { return cookie; } };
}
const registration = { email: 'Resident@Example.com', password, first_name: 'Test', last_name: 'Resident', address: 'Test address' };

test('password hashes use different salts and reject incorrect or malformed credentials', async () => {
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('incorrect-password', first), false);
  assert.equal(await verifyPassword(password, 'bad-hash'), false);
});

test('registration validates input, rejects role injection, and rolls back duplicate/incomplete writes', async t => {
  const f = await fixture(t);
  await f.request('/api/auth/csrf');
  assert.equal((await f.request('/api/auth/register', 'POST', { ...registration, role: 'super_admin' })).status, 400);
  assert.equal((await f.request('/api/auth/register', 'POST', { ...registration, address: ' ' })).status, 400);
  assert.equal((await f.request('/api/auth/register', 'POST', { ...registration, birth_date: '2026-02-30' })).status, 400);
  assert.equal((await f.request('/api/auth/register', 'POST', registration)).status, 201);
  assert.equal(f.db.users[0].role, 'resident');
  assert.equal(f.db.users[0].email, 'resident@example.com');
  assert.equal(f.db.residents[0].is_verified, 0);
  assert.equal(await verifyPassword(password, f.db.users[0].password_hash), true);
  assert.equal((await f.request('/api/auth/register', 'POST', registration)).status, 409);
  assert.equal(f.db.users.length, 1);
  assert.equal(f.db.residents.length, 1);
  assert.equal(f.db.rollbackCount, 1);
  const broken = await fixture(t);
  await broken.request('/api/auth/csrf');
  broken.db.failInsert = true;
  const failure = await broken.request('/api/auth/register', 'POST', { ...registration, email: 'another@example.com' });
  assert.equal(failure.status, 500);
  assert.equal(failure.data.message, 'Internal server error');
  assert.equal(broken.db.residents.length, 0);
  assert.equal(broken.db.rollbackCount, 1);
});

test('CSRF and origin checks reject writes without creating accounts', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/auth/register', 'POST', registration)).status, 403);
  const csrf = await f.request('/api/auth/csrf');
  assert.match(csrf.setCookie, /HttpOnly/i);
  assert.match(csrf.setCookie, /SameSite=Lax/i);
  assert.equal(csrf.headers.get('cache-control'), 'no-store');
  assert.equal((await f.request('/api/auth/register', 'POST', registration, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await f.request('/api/auth/register', 'POST', registration, { 'X-CSRF-Token': 'bad' })).status, 403);
  assert.equal(f.db.users.length, 0);
});

test('login rotates the session and CSRF token, /me excludes secrets, logout invalidates access', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/auth/me')).status, 401);
  const csrf = await f.request('/api/auth/csrf');
  const originalCookie = f.cookie;
  await f.request('/api/auth/register', 'POST', registration);
  assert.equal((await f.request('/api/auth/login', 'POST', { email: registration.email, password: 'incorrect' })).status, 401);
  assert.equal((await f.request('/api/auth/login', 'POST', { email: 'missing@example.com', password })).status, 401);
  const login = await f.request('/api/auth/login', 'POST', { email: registration.email, password });
  assert.equal(login.status, 200);
  assert.notEqual(f.cookie, originalCookie);
  assert.notEqual(login.data.csrfToken, csrf.data.csrfToken);
  assert.equal((await f.request('/api/auth/logout', 'POST', {}, { 'X-CSRF-Token': csrf.data.csrfToken })).status, 403);
  const me = await f.request('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.role, 'resident');
  assert(!JSON.stringify(me.data).includes('password'));
  assert.equal((await f.request('/api/auth/logout', 'POST', {})).status, 200);
  assert.equal((await f.request('/api/auth/me')).status, 401);
});

test('role changes and account deactivation take effect on subsequent protected requests', async t => {
  const f = await fixture(t);
  await f.request('/api/auth/csrf');
  await f.request('/api/auth/register', 'POST', registration);
  await f.request('/api/auth/login', 'POST', { email: registration.email, password });
  const guard = allowRoles('captain', 'super_admin');
  let deniedStatus;
  const response = { status(value) { deniedStatus = value; return this; }, json() {} };
  guard({ user: (await f.request('/api/auth/me')).data.user }, response, () => assert.fail('resident must be denied'));
  assert.equal(deniedStatus, 403);
  f.db.users[0].role = 'captain';
  const updated = await f.request('/api/auth/me');
  assert.equal(updated.data.user.role, 'captain');
  let allowed = false;
  guard({ user: updated.data.user }, response, () => { allowed = true; });
  assert.equal(allowed, true);
  f.db.users[0].is_active = 0;
  assert.equal((await f.request('/api/auth/me')).status, 401);
  await f.request('/api/auth/csrf');
  assert.equal((await f.request('/api/auth/login', 'POST', { email: registration.email, password })).status, 401);
});

test('expired server-side sessions cannot access /me', async t => {
  const f = await fixture(t);
  await f.request('/api/auth/csrf');
  await f.request('/api/auth/register', 'POST', registration);
  await f.request('/api/auth/login', 'POST', { email: registration.email, password });
  for (const sid of Object.keys(f.store.sessions)) {
    const stored = JSON.parse(f.store.sessions[sid]);
    stored.cookie.expires = new Date(Date.now() - 1000).toISOString();
    f.store.sessions[sid] = JSON.stringify(stored);
  }
  assert.equal((await f.request('/api/auth/me')).status, 401);
});

test('login attempts are limited and basic API responses remain available', async t => {
  const f = await fixture(t);
  await f.request('/api/auth/csrf');
  for (let i = 0; i < 10; i++) assert.equal((await f.request('/api/auth/login', 'POST', {})).status, 401);
  assert.equal((await f.request('/api/auth/login', 'POST', {})).status, 429);
  const health = await f.request('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('access-control-allow-credentials'), 'true');
  assert.equal((await f.request('/api/products')).status, 404);
});

test('configuration rejects missing/short session secrets without reading .env in the test', () => {
  const source = `const dotenvPath = require.resolve('dotenv');
    require.cache[dotenvPath] = { id: dotenvPath, filename: dotenvPath, loaded: true, exports: { config() {} } };
    require('./src/config/env');`;
  const env = { ...process.env, DB_HOST:'localhost', DB_USER:'test', DB_PASSWORD:'', DB_NAME:'test', CLIENT_ORIGIN:config.clientOrigin, PORT:'5000' };
  delete env.SESSION_SECRET;
  let result = spawnSync(process.execPath, ['-e', source], { cwd: require('node:path').resolve(__dirname, '..'), env, encoding:'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SESSION_SECRET/);
  env.SESSION_SECRET = 'too-short';
  result = spawnSync(process.execPath, ['-e', source], { cwd: require('node:path').resolve(__dirname, '..'), env, encoding:'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SESSION_SECRET/);
  env.SESSION_SECRET = config.sessionSecret;
  result = spawnSync(process.execPath, ['-e', source], { cwd: require('node:path').resolve(__dirname, '..'), env, encoding:'utf8' });
  assert.equal(result.status, 0);
});

test('password policy accepts 12 through 128 characters only', () => {
  assert.equal(validPassword('a'.repeat(11)), false);
  assert.equal(validPassword('a'.repeat(12)), true);
  assert.equal(validPassword('a'.repeat(128)), true);
  assert.equal(validPassword('a'.repeat(129)), false);
  assert.equal(validPassword(null), false);
});


test('same resident can log in on laptop and phone and log out independently at both allowed origins', async t => {
  const phoneOrigin='http://192.168.1.7:5173';
  const f=await fixture(t,{clientOrigins:[config.clientOrigin,phoneOrigin]});
  f.db.users.push({id:1,resident_id:1,email:'devices@example.invalid',password_hash:await hashPassword(password),role:'resident',is_active:1});
  await f.request('/api/auth/csrf');
  const desktopLogin=await f.request('/api/auth/login','POST',{email:'devices@example.invalid',password});
  assert.equal(desktopLogin.status,200);const desktopCookie=f.cookie, desktopToken=desktopLogin.data.csrfToken;
  assert.equal(desktopLogin.headers.get('access-control-allow-origin'),config.clientOrigin);
  await f.request('/api/auth/csrf','GET',undefined,{Cookie:'',Origin:phoneOrigin});
  const phoneLogin=await f.request('/api/auth/login','POST',{email:'devices@example.invalid',password},{Origin:phoneOrigin});
  assert.equal(phoneLogin.status,200);const phoneCookie=f.cookie, phoneToken=phoneLogin.data.csrfToken;
  assert.notEqual(phoneCookie,desktopCookie);assert.equal(phoneLogin.headers.get('access-control-allow-origin'),phoneOrigin);
  const desktopHeaders={Cookie:desktopCookie,Origin:config.clientOrigin,'X-CSRF-Token':desktopToken};
  const phoneHeaders={Cookie:phoneCookie,Origin:phoneOrigin,'X-CSRF-Token':phoneToken};
  assert.equal((await f.request('/api/auth/logout','POST',{},desktopHeaders)).status,200);
  assert.equal((await f.request('/api/auth/me','GET',undefined,desktopHeaders)).status,401);
  assert.equal((await f.request('/api/auth/me','GET',undefined,phoneHeaders)).status,200);
  const attacker=await f.request('/api/auth/logout','POST',{}, {...phoneHeaders,Origin:'http://untrusted.invalid'});
  assert.equal(attacker.status,403);assert.equal(attacker.headers.get('access-control-allow-origin'),null);
  assert.equal((await f.request('/api/auth/me','GET',undefined,phoneHeaders)).status,200);
  assert.equal((await f.request('/api/auth/logout','POST',{},phoneHeaders)).status,200);
  assert.equal((await f.request('/api/auth/me','GET',undefined,phoneHeaders)).status,401);
});

test('extra client origins are explicit and validated without wildcard, path or credential acceptance', () => {
  const source=`const dotenvPath=require.resolve('dotenv');require.cache[dotenvPath]={exports:{config(){}}};console.log(JSON.stringify(require('./src/config/env').clientOrigins));`;
  const env={...process.env,DB_HOST:'localhost',DB_USER:'test',DB_PASSWORD:'',DB_NAME:'test',CLIENT_ORIGIN:config.clientOrigin,PORT:'5000',SESSION_SECRET:config.sessionSecret,ADDITIONAL_CLIENT_ORIGINS:'http://192.168.1.7:5173, http://localhost:5173'};
  const cwd=require('node:path').resolve(__dirname,'..');
  const result=spawnSync(process.execPath,['-e',source],{cwd,env,encoding:'utf8'});
  assert.equal(result.status,0);assert.deepEqual(JSON.parse(result.stdout),[config.clientOrigin,'http://192.168.1.7:5173']);
  for(const invalid of ['*','http://*.example.com','http://192.168.1.7:5173/path','http://user:pass@192.168.1.7:5173','null']) {
    const failed=spawnSync(process.execPath,['-e',source],{cwd,env:{...env,ADDITIONAL_CLIENT_ORIGINS:invalid},encoding:'utf8'});
    assert.notEqual(failed.status,0);assert.match(failed.stderr,/ADDITIONAL_CLIENT_ORIGINS/);
  }
});

test('successful sign-ins do not use up the limit; ten failed ones still lock it', async t => {
  const f = await fixture(t);
  await f.request('/api/auth/csrf');
  await f.request('/api/auth/register', 'POST', registration);
  for (let i = 0; i < 12; i++) assert.equal((await f.request('/api/auth/login', 'POST', { email: registration.email, password })).status, 200, `successful sign-in ${i + 1}`);
  for (let i = 0; i < 10; i++) assert.equal((await f.request('/api/auth/login', 'POST', { email: registration.email, password: 'incorrect' })).status, 401);
  assert.equal((await f.request('/api/auth/login', 'POST', { email: registration.email, password })).status, 429, 'locked after ten failures, even with the right password');
});
