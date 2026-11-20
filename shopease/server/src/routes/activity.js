const express=require('express');const {allowRoles}=require('../middleware/auth');
const {activityService}=require('../services/activityService');const {FilterError}=require('../services/dashboardFilters');
module.exports=db=>{
  const router=express.Router();const service=activityService(db);
  router.use(allowRoles('staff','secretary','captain','super_admin'));
  router.get('/',async(req,res,next)=>{
    try{res.set('Cache-Control','private, no-store').json({success:true,...await service.list(req.user,req.query)});}
    catch(error){if(error instanceof FilterError)return res.status(400).json({success:false,message:error.message});next(error);}
  });
  // Read-only: the log is append-only and has no write, edit or delete endpoints.
  return router;
};
