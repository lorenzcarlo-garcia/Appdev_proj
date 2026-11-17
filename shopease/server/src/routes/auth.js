const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { controllers } = require('../controllers/authController');
const { authentication } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
function authRoutes(db, config) {
  const router = express.Router();
  const controller = controllers(db, config);
  const limiter = (limit) => rateLimit({ windowMs: 15 * 60 * 1000, limit,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, message: 'Too many attempts. Try again later.' } });
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/csrf', limiter(100), controller.csrf);
  router.use(csrfProtection(config.clientOrigin));
  router.post('/register', limiter(5), controller.register);
  router.post('/login', limiter(10), controller.login);
  router.get('/me', authentication(db), controller.me);
  router.post('/logout', controller.logout);
  return router;
}
module.exports = authRoutes;
