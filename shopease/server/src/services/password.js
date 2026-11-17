const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
function validPassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, options);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || password.length > 128 || typeof hash !== 'string') return false;
  const parts = hash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const key = await derive(password, parts[1], 64, options);
  return timingSafeEqual(key, Buffer.from(parts[2], 'hex'));
}
module.exports = { hashPassword, verifyPassword, validPassword };
