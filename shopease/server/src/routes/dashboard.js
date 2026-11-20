const express=require('express');const {allowRoles}=require('../middleware/auth');
const {dashboardService}=require('../services/dashboardService');const {FilterError}=require('../services/dashboardFilters');
module.exports=db=>{
  const router=express.Router();const service=dashboardService(db);
  router.use(allowRoles('staff','secretary','captain','super_admin'));
  router.get('/',async(req,res,next)=>{
    try{res.set('Cache-Control','no-store').json({success:true,...await service.summary(req.query)});}
    catch(error){if(error instanceof FilterError)return res.status(400).json({success:false,message:error.message});next(error);}
  });
  return router;
};
