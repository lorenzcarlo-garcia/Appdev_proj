const {hashPassword, validPassword} = require('./password');
const {logActivity} = require('./activityLog');
const roleNames = {staff:'Staff', secretary:'Secretary', captain:'Captain'};
// Staff-account events are visible to Super Admin only; references use account numbers.
const logAccount = (c, actor, action, id, detail) => logActivity(c, actor, {action, entityType:'staff_account', entityId:id, entityRef:`Staff account #${id}`, detail, visibility:'super_admin'});
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
    create: async (actor, body) => {
      object(body, ['email', 'password', 'role']);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address');
      if (!roles.includes(body.role)) fail(400, 'Choose Staff, Secretary, or Captain');
      if (!validPassword(body.password)) fail(400, 'Password must contain 12-128 characters');
      const hash = await hashPassword(body.password);
      const connection = await db.getConnection();
      let begun = false;
      try {
        await connection.beginTransaction(); begun = true;
        const [result] = await connection.execute('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [email, hash, body.role]);
        await logAccount(connection, actor, 'staff_account.created', result.insertId, `Role: ${roleNames[body.role]}`);
        await connection.commit(); begun = false;
        return {id:result.insertId, email, role:body.role, is_active:1};
      } catch (error) {
        if (begun) await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') fail(409, 'An account with this email already exists');
        throw error;
      } finally { connection.release(); }
    },
    update: async (id, actor, body) => {
      object(body, ['role', 'is_active']);
      if (!Object.keys(body).length || (body.role !== undefined && !roles.includes(body.role)) || (body.is_active !== undefined && typeof body.is_active !== 'boolean')) fail(400, 'Provide an allowed role and/or boolean is_active');
      if (id === actor.id) fail(409, 'Your own Super Admin account cannot be changed here');
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
        const changes = [];
        if (role !== user.role) changes.push(`Role: ${roleNames[user.role]} → ${roleNames[role]}`);
        if (active !== Number(user.is_active)) changes.push(active ? 'Reactivated' : 'Deactivated; sessions revoked');
        if (changes.length) await logAccount(connection, actor, 'staff_account.updated', id, changes.join('; '));
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
