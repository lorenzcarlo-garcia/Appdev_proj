const express = require('express');
const {allowRoles} = require('../middleware/auth');
module.exports = db => {
  const router = express.Router();
  const controller = require('../controllers/userController')(db);
  router.use(allowRoles('super_admin'));
  router.use((req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  router.get('/',controller.list);
  router.post('/',controller.create);
  router.patch('/:id',controller.update);
  // Account deletion and public role assignment are not provided.
  return router;
};
