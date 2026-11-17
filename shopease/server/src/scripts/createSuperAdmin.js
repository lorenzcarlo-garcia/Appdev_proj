const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { hashPassword, validPassword } = require('../services/password');
const { validEmail, normalizeEmail } = require('../controllers/authController');

function hiddenPassword(label) {
  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(label);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    function cleanup() {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    }
    function onData(chunk) {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') { cleanup(); return reject(new Error('Cancelled')); }
        if (character === '\r' || character === '\n') { cleanup(); return resolve(value); }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    }
    stdin.on('data', onData);
  });
}

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
