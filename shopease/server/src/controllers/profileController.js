const {profileService,ProfileError}=require('../services/profileService');
module.exports=db=>{const service=profileService(db);const run=handler=>async(req,res,next)=>{try{await handler(req,res);}catch(error){if(error instanceof ProfileError)return res.status(error.status).json({success:false,message:error.message});next(error);}};
return {get:run(async(req,res)=>res.json({success:true,profile:await service.get(req.user)})),save:run(async(req,res)=>res.json({success:true,...await service.save(req.user,req.body)}))};};
