const {staffProfileService,StaffProfileError}=require('../services/staffProfileService');
module.exports=db=>{
  const service=staffProfileService(db);
  const run=handler=>async(req,res,next)=>{
    res.set('Cache-Control','private, no-store');
    try{await handler(req,res);}catch(error){if(error instanceof StaffProfileError)return res.status(error.status).json({success:false,message:error.message});next(error);}
  };
  return {
    get:run(async(req,res)=>res.json({success:true,profile:await service.get(req.user)})),
    save:run(async(req,res)=>res.json({success:true,...await service.save(req.user,req.body)})),
  };
};
