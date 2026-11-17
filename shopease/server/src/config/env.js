const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required environment setting: ${name}`);
  }
  return value;
}

const portText = process.env.PORT === undefined ? '5000' : process.env.PORT;
if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const clientOrigin = process.env.CLIENT_ORIGIN === undefined
  ? 'http://localhost:5173' : process.env.CLIENT_ORIGIN;
let originUrl;
try {
  originUrl = new URL(clientOrigin);
} catch {
  throw new Error('CLIENT_ORIGIN must be an HTTP or HTTPS origin');
}
if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.origin !== clientOrigin) {
  throw new Error('CLIENT_ORIGIN must be an HTTP or HTTPS origin without a path');
}

// An empty password is permitted for local MySQL setups; the variable must exist.
if (process.env.DB_PASSWORD === undefined) {
  throw new Error('Missing required environment setting: DB_PASSWORD');
}

const sessionSecret = required('SESSION_SECRET');
if (Buffer.byteLength(sessionSecret, 'utf8') < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 bytes of random data');
}

module.exports = {
  sessionSecret,
  production: process.env.NODE_ENV === 'production',
  port: Number(portText),
  clientOrigin,
  database: {
    host: required('DB_HOST'),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD,
    database: required('DB_NAME')
  }
};
