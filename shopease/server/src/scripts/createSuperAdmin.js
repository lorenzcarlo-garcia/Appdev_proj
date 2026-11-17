const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { hashPassword, validPassword } = require('../services/password');
const { validEmail, normalizeEmail } = require('../controllers/authController');

const {hiddenPassword}=require('./privatePrompt');

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Run this setup in an interactive terminal');
  // Configuration and database errors never print credentials.
  const db = require('../config/database');
  let connection;
  let locked = false;
  let transaction = false;
  try {
    const prompt = readline.createInterface({ input: stdin, output: stdout });
    let email;
    try { email = normalizeEmail(await prompt.question('Super Admin email: ')); }
    finally { prompt.close(); }
    if (!validEmail(email)) throw new Error('Enter a valid email');
    const password = await hiddenPassword('Password (12-128 characters, hidden): ');
    if (!validPassword(password)) throw new Error('Password must contain 12-128 characters');
    if (password !== await hiddenPassword('Confirm password (hidden): ')) throw new Error('Passwords do not match');
    const hash = await hashPassword(password);
    connection = await db.getConnection();
    const [locks] = await connection.execute('SELECT GET_LOCK(?, ?) AS acquired', ['bantaylog_first_admin', 10]);
    if (locks[0].acquired !== 1) throw new Error('Another setup is running. Try later');
    locked = true;
    await connection.beginTransaction();
    transaction = true;
    const [admins] = await connection.execute('SELECT id FROM users WHERE role = ? LIMIT 1', ['super_admin']);
    if (admins.length) throw new Error('A Super Admin already exists; setup refused');
    await connection.execute('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [email, hash, 'super_admin']);
    await connection.commit();
    transaction = false;
    console.log('First Super Admin created. Setup cannot create another.');
  } catch (error) {
    if (transaction) await connection.rollback();
    if (error.code) throw new Error('Database operation failed; check configuration and whether the email is already used');
    throw error;
  } finally {
    if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', ['bantaylog_first_admin']);
    if (connection) connection.release();
    await db.end();
  }
}
if (require.main === module) {
  main().catch(error => { console.error(error.code ? 'Setup failed; check database configuration' : error.message); process.exitCode = 1; });
}
module.exports = { main };
