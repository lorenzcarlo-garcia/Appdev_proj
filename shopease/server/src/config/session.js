const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const COOKIE_NAME = 'bantaylog.sid';
const MAX_AGE = 8 * 60 * 60 * 1000;
function createSession(config, db, suppliedStore) {
  const store = suppliedStore || new MySQLStore({
    createDatabaseTable: false,
    endConnectionOnClose: false,
    expiration: MAX_AGE,
    // Expired sessions are rejected by the store; cleanup uses its standard timer.
    clearExpired: true
  }, db);
  store.on('error', () => console.error('Session storage error'));
  const middleware = session({
    name: COOKIE_NAME, secret: config.sessionSecret, store,
    resave: false, saveUninitialized: false,
    // Fixed lifetime, rather than extending the session on every request.
    rolling: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.production, maxAge: MAX_AGE, path: '/' }
  });
  return { middleware, store };
}
module.exports = { createSession, COOKIE_NAME, MAX_AGE };
