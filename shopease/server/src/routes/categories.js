const express = require('express');
const { allowRoles } = require('../middleware/auth');
const categoryController = require('../controllers/categoryController');
module.exports = db => {
  const router = express.Router();
  const controller = categoryController(db);
  router.use(allowRoles('resident', 'staff', 'secretary', 'captain', 'super_admin'));
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/', controller.list);
  router.get('/:id', controller.detail);
  router.post('/', allowRoles('secretary', 'super_admin'), controller.create);
  router.put('/:id', allowRoles('secretary', 'super_admin'), controller.update);
  // No hard-delete endpoint: deactivate/reactivate through PUT with is_active.
  return router;
};
