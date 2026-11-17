const {hashPassword, validPassword} = require('./password');
const roles = ['staff', 'secretary', 'captain'];
const fields = 'id, email, role, is_active, last_login_at, created_at, updated_at';
class UserError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new UserError(status, message); }
function object(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) fail(400, 'Unexpected account fields');
}
function userService(db) {
  return {
    create: async body => {
      object(body, ['email', 'password', 'role']);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address');
      if (!roles.includes(body.role)) fail(400, 'Choose Staff, Secretary, or Captain');
      if (!validPassword(body.password)) fail(400, 'Password must contain 12-128 characters');
      const hash = await hashPassword(body.password);
      try {
        const [result] = await db.execute('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [email, hash, body.role]);
        return {id:result.insertId, email, role:body.role, is_active:1};
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') fail(409, 'An account with this email already exists');
        throw error;
      }
    },
    update: async (id, actorId, body) => {
      object(body, ['role', 'is_active']);
      if (!Object.keys(body).length || (body.role !== undefined && !roles.includes(body.role)) || (body.is_active !== undefined && typeof body.is_active !== 'boolean')) fail(400, 'Provide an allowed role and/or boolean is_active');
      if (id === actorId) fail(409, 'Your own Super Admin account cannot be changed here');
      const connection = await db.getConnection();
      let begun = false;
      try {
        await connection.beginTransaction(); begun = true;
        const [rows] = await connection.execute('SELECT id, email, role, is_active, resident_id FROM users WHERE id = ? FOR UPDATE', [id]);
        const user = rows[0];
        if (!user) fail(404, 'Staff account not found');
        if (!roles.includes(user.role) || user.resident_id !== null) fail(409, 'Resident and Super Admin accounts cannot be changed through Staff Accounts');
        // Read omitted fields from the locked row, avoiding stale form values.
        const role = body.role === undefined ? user.role : body.role;
        const active = body.is_active === undefined ? Number(user.is_active) : Number(body.is_active);
        await connection.execute('UPDATE users SET role = ?, is_active = ? WHERE id = ?', [role, active, id]);
        if (!active) {
          // Re-activation must not revive an old login session. No account is deleted.
          await connection.execute("DELETE FROM sessions WHERE JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(data), data, '{}'), '$.userId')) = ?", [String(id)]);
        }
        await connection.commit(); begun = false;
        return {id, email:user.email, role, is_active:active};
      } catch (error) {
        if (begun) await connection.rollback();
        throw error;
      } finally { connection.release(); }
    }
  };
}
module.exports = {userService, UserError, roles, fields};
