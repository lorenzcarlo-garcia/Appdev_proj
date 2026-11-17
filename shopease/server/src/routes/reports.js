const express=require('express');
const {allowRoles}=require('../middleware/auth');
module.exports=db=>{
  const router=express.Router();const controller=require('../controllers/reportController')(db);
  router.use(allowRoles('resident','staff','secretary','captain','super_admin'));
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/',controller.list);
  router.get('/:id',controller.detail);
  router.post('/drafts',allowRoles('resident'),controller.draft);
  router.post('/',allowRoles('resident'),controller.create);
  router.put('/:id',allowRoles('resident'),controller.update);
  router.post('/:id/submit',allowRoles('resident'),controller.submit);
  router.post('/:id/cancel',allowRoles('resident'),controller.cancel);
  router.patch('/:id/status',allowRoles('staff','secretary','captain','super_admin'),controller.status);
  router.post('/:id/blotter',allowRoles('captain','super_admin'),controller.convert);
  // Reports are retained; no DELETE endpoint.
  return router;
};
