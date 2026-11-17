const express=require('express');
const {allowRoles}=require('../middleware/auth');
const {attachmentService,AttachmentError}=require('../services/attachmentService');
module.exports=(db,directory)=>{
  const router=express.Router({mergeParams:true});
  const service=attachmentService(db,directory);
  const controller=require('../controllers/attachmentController')(service);
  router.use(allowRoles('resident','staff','secretary','captain','super_admin'));
  router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.get('/',controller.list);
  router.get('/:attachmentId',controller.read);
  router.post('/',allowRoles('resident'),async(req,res,next)=>{
    try {await service.authorize(db,req.params.reportId,req.user,true);next();}
    catch(error) {if(error instanceof AttachmentError) return res.status(error.status).json({success:false,message:error.message});next(error);}
  },require('../middleware/photoUpload'),controller.add);
  router.delete('/:attachmentId',allowRoles('resident'),controller.remove);
  return router;
};
