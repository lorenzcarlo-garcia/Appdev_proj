const {communityUpdateService,CommunityUpdateError}=require('../services/communityUpdateService');
module.exports=db=>{
  const service=communityUpdateService(db);
  const run=handler=>async(req,res,next)=>{try{await handler(req,res);}catch(error){
    if(error instanceof CommunityUpdateError) return res.status(error.status).json({success:false,message:error.message});
    if(error.code==='ER_NO_SUCH_TABLE') return res.status(503).json({success:false,message:'Community updates are not available yet. Please try again later.'});
    next(error);
  }};
  return {
    list:run(async(req,res)=>res.json({success:true,...await service.list(req.user,req.query)})),
    detail:run(async(req,res)=>res.json({success:true,update:await service.detail(req.params.id,req.user)})),
    create:run(async(req,res)=>res.status(201).json({success:true,update:await service.create(req.user,req.body)})),
    save:run(async(req,res)=>res.json({success:true,update:await service.save(req.params.id,req.user,req.body)})),
    publish:run(async(req,res)=>res.json({success:true,update:await service.transition(req.params.id,req.user,req.body,'publish')})),
    archive:run(async(req,res)=>res.json({success:true,update:await service.transition(req.params.id,req.user,req.body,'archive')}))
  };
};
