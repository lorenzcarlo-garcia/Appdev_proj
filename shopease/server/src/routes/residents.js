const express = require('express');
const { allowRoles } = require('../middleware/auth');
const residentController = require('../controllers/residentController');
module.exports = db => {
  const router = express.Router();
  const controller = residentController(db);
  router.use(allowRoles('staff','secretary','captain','super_admin'));
  router.use((req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  router.get('/',controller.list);
  router.get('/:id',controller.detail);
  router.post('/',allowRoles('secretary','super_admin'),controller.create);
  router.put('/:id',allowRoles('secretary','super_admin'),controller.update);
  router.patch('/:id/verification',allowRoles('secretary','super_admin'),controller.verification);
  router.delete('/:id',allowRoles('super_admin'),controller.remove);
  return router;
};
