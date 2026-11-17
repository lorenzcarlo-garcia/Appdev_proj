function authentication(db) {
  return async (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: 'Login required' });
    const [rows] = await db.execute(
      'SELECT id, email, role, resident_id, is_active FROM users WHERE id = ?', [req.session.userId]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return req.session.destroy(error => {
        if (error) return next(error);
        res.status(401).json({ success: false, message: 'Login required' });
      });
    }
    // Read role from the database on every protected request, not from client input.
    req.user = { id: user.id, email: user.email, role: user.role, resident_id: user.resident_id };
    next();
  };
}
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Login required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, message: 'Access denied' });
    next();
  };
}
module.exports = { authentication, allowRoles };
