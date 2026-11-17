const {AttachmentError}=require('../services/attachmentService');
module.exports=service=>{
  const run=handler=>async(req,res,next)=>{try {await handler(req,res);} catch(error) {if(error instanceof AttachmentError) return res.status(error.status).json({success:false,message:error.message});next(error);}};
  return {
    list:run(async(req,res)=>res.json({success:true,attachments:await service.list(req.params.reportId,req.user)})),
    add:run(async(req,res)=>res.status(201).json({success:true,attachments:await service.add(req.params.reportId,req.user,req.files)})),
    read:run(async(req,res)=>{const buffer=await service.read(req.params.reportId,req.params.attachmentId,req.user);res.set({'Content-Type':'image/webp','Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}).send(buffer);}),
    remove:run(async(req,res)=>{await service.remove(req.params.reportId,req.params.attachmentId,req.user);res.json({success:true});})
  };
};
