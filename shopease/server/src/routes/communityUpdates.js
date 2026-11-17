const express=require('express');
const {allowRoles}=require('../middleware/auth');
module.exports=db=>{
  const router=express.Router();const controller=require('../controllers/communityUpdateController')(db);
  router.use(allowRoles('resident','staff','secretary','captain','super_admin'));
  router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.get('/',controller.list);router.get('/:id',controller.detail);
  router.use(allowRoles('secretary','captain','super_admin'));
  router.post('/',controller.create);router.put('/:id',controller.save);
  router.post('/:id/publish',controller.publish);router.post('/:id/archive',controller.archive);
  return router;
};
