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
  router.use(csrfProtection(config.clientOrigins || config.clientOrigin));
  router.post('/register', limiter(5), controller.register);
  router.post('/login', limiter(10), controller.login);
  const passwordReset=require('../controllers/passwordResetController')(db,config);
  router.post('/forgot-password',limiter(5),passwordReset.request);
  router.post('/reset-password',limiter(10),passwordReset.reset);
  const profile=require('../controllers/profileController')(db);
  router.get('/profile',authentication(db),profile.get);
  router.put('/profile',authentication(db),profile.save);
  const staffProfile=require('../controllers/staffProfileController')(db);
  const personnel=require('../middleware/auth').allowRoles('staff','secretary','captain','super_admin');
  router.get('/staff-profile',authentication(db),personnel,staffProfile.get);
  router.put('/staff-profile',authentication(db),personnel,staffProfile.save);
  router.get('/me', authentication(db), controller.me);
  router.post('/change-password', authentication(db), rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>String(req.user.id),message:{success:false,message:'Too many password change attempts. Please wait 15 minutes.'}}), require('../controllers/changePasswordController')(db,config));
  router.post('/logout', controller.logout);
  return router;
}
module.exports = authRoutes;
