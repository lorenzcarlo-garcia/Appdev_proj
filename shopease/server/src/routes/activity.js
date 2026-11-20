const express=require('express');const {allowRoles}=require('../middleware/auth');
const {activityService,ActivityNotFound}=require('../services/activityService');const {FilterError}=require('../services/dashboardFilters');
module.exports=db=>{
  const router=express.Router();const service=activityService(db);
  const run=handler=>async(req,res,next)=>{
    try{res.set('Cache-Control','private, no-store').json({success:true,...await handler(req)});}
    catch(error){if(error instanceof FilterError || error instanceof ActivityNotFound)return res.status(error.status).json({success:false,message:error.message});next(error);}
  };
  router.use(allowRoles('staff','secretary','captain','super_admin'));
  router.get('/',run(req=>service.list(req.user,req.query)));
  // Person details behind an entry: Captain and Super Admin only.
  router.get('/actors/:id',allowRoles('captain','super_admin'),run(async req=>({person:await service.actor(req.user,req.params.id)})));
  // Read-only: the log is append-only and has no write, edit or delete endpoints.
  return router;
};
