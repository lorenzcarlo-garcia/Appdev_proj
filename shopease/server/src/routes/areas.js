const express=require('express');
const {allowRoles}=require('../middleware/auth');
const {areaService,AreaError}=require('../services/areaService');
module.exports=db=>{
  const router=express.Router();const service=areaService(db);
  const run=handler=>async(req,res,next)=>{try{await handler(req,res);}catch(error){if(error instanceof AreaError)return res.status(error.status).json({success:false,message:error.message});next(error);}};
  router.use(allowRoles('resident','staff','secretary','captain','super_admin'));
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/',run(async(req,res)=>res.json({success:true,areas:await service.list(req.user,req.query)})));
  router.post('/',allowRoles('secretary','super_admin'),run(async(req,res)=>res.status(201).json({success:true,area:await service.create(req.user,req.body)})));
  router.put('/:id',allowRoles('secretary','super_admin'),run(async(req,res)=>res.json({success:true,...await service.update(req.params.id,req.user,req.body)})));
  // No hard-delete endpoint: deactivate/reactivate through PUT with is_active.
  return router;
};
