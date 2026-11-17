const {credentialTag}=require('../services/sessionCredentials');
const { hashPassword, verifyPassword, validPassword } = require('../services/password');
const { newToken } = require('../middleware/csrf');
const { COOKIE_NAME } = require('../config/session');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = value => value.length <= 150 && emailPattern.test(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
const save = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
function controllers(db, config) {
  // Use an equivalent hash calculation when no account matches, reducing timing differences.
  let dummyHash;
  const getDummyHash = () => dummyHash || (dummyHash = hashPassword('not-a-real-account-password'));
  return {
    csrf: async (req, res) => {
      req.session.csrfToken ||= newToken();
      await save(req);
      res.json({ success: true, csrfToken: req.session.csrfToken });
    },
    register: async (req, res) => {
      const body = req.body || {};
      const allowed = ['email','password','first_name','middle_name','last_name','birth_date','contact_no','address'];
      const email = normalizeEmail(body.email);
      if (Object.keys(body).some(key => !allowed.includes(key))) {
        return res.status(400).json({ success: false, message: 'Unexpected registration field' });
      }
      if (!validEmail(email) || !validPassword(body.password) || !text(body.first_name,80) ||
          !text(body.last_name,80) || !text(body.address,255) ||
          (body.middle_name != null && (typeof body.middle_name !== 'string' || body.middle_name.length > 80)) ||
          (body.contact_no != null && (typeof body.contact_no !== 'string' || body.contact_no.length > 20))) {
        return res.status(400).json({ success: false, message: 'Valid email, password (12-128 characters), first name, last name, and address are required' });
      }
      let birthDate = body.birth_date || null;
      if (birthDate) {
        const date = typeof birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? new Date(birthDate + 'T00:00:00Z') : new Date(NaN);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== birthDate || birthDate < '1000-01-01' || date > new Date()) {
          return res.status(400).json({ success: false, message: 'Invalid birth date' });
        }
      }
      const hash = await hashPassword(body.password);
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const [resident] = await connection.execute(
          'INSERT INTO residents (first_name, middle_name, last_name, birth_date, contact_no, address, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [body.first_name.trim(), body.middle_name?.trim() || null, body.last_name.trim(), birthDate, body.contact_no?.trim() || null, body.address.trim(), 0]
        );
        const [user] = await connection.execute(
          'INSERT INTO users (resident_id, email, password_hash, role) VALUES (?, ?, ?, ?)',
          [resident.insertId, email, hash, 'resident']
        );
        await connection.execute('UPDATE residents SET created_by = ? WHERE id = ?', [user.insertId, resident.insertId]);
        await connection.commit();
        res.status(201).json({ success: true, message: 'Registration successful. Please log in.' });
      } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Unable to register with these details' });
        throw error;
      } finally { connection.release(); }
    },
    login: async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      const password = req.body?.password;
      if (!validEmail(email) || typeof password !== 'string' || password.length > 128) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
      const [rows] = await db.execute('SELECT id, password_hash, is_active FROM users WHERE email = ?', [email]);
      const user = rows[0];
      const matches = await verifyPassword(password, user?.password_hash || await getDummyHash());
      if (!user || !user.is_active || !matches) return res.status(401).json({ success: false, message: 'Invalid email or password' });
      await regenerate(req);
      req.session.userId = user.id;
      req.session.credentialTag = credentialTag(user.password_hash);
      req.session.csrfToken = newToken();
      await db.execute('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
      await save(req);
      res.json({ success: true, message: 'Login successful', csrfToken: req.session.csrfToken });
    },
    me: (req, res) => res.json({ success: true, user: req.user }),
    logout: async (req, res) => {
      await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
      res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.production, path: '/' });
      res.json({ success: true, message: 'Logged out' });
    }
  };
}
module.exports = { controllers, validEmail, normalizeEmail };
