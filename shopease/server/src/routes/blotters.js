const express = require('express');
const {allowRoles} = require('../middleware/auth');
module.exports = db => {
  const router = express.Router();
  const controller = require('../controllers/blotterController')(db);
  router.use(allowRoles('staff','secretary','captain','super_admin'));
  router.use((req,res,next) => {res.set('Cache-Control','no-store');next();});
  router.get('/',controller.list);
  router.get('/:id',controller.detail);
  // Official blotter PDF contains names, so it is limited to the record-managing roles.
  router.get('/:id/pdf',allowRoles('secretary','captain','super_admin'),require('./pdfDownloads')(db).blotter);
  router.post('/',allowRoles('secretary','captain','super_admin'),controller.create);
  router.put('/:id',allowRoles('secretary','captain','super_admin'),controller.update);
  router.post('/:id/archive',allowRoles('captain','super_admin'),controller.archive);
  // Official records are never hard-deleted or restored through this API.
  return router;
};
