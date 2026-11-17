const { randomBytes, timingSafeEqual } = require('node:crypto');
function newToken() { return randomBytes(32).toString('hex'); }
function csrfProtection(origin) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('Origin') && req.get('Origin') !== origin) {
      return res.status(403).json({ success: false, message: 'Request origin is not allowed' });
    }
    const supplied = req.get('X-CSRF-Token');
    const expected = req.session.csrfToken;
    if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
    }
    next();
  };
}
module.exports = { newToken, csrfProtection };
