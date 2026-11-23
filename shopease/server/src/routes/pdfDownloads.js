// PDF downloads (Secretary, Captain and Super Admin only).
const {reportPdfService,PdfNotFound}=require('../services/pdf/reportPdfService');
const {FilterError}=require('../services/dashboardFilters');
const {validId}=require('../services/reportService');
function send(res,{buffer,filename}){
  res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename.replace(/[^\w.-]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(buffer);
}
module.exports=db=>{
  const service=reportPdfService(db);
  const run=handler=>async(req,res,next)=>{
    try{send(res,await handler(req));}
    catch(error){if(error instanceof FilterError || error instanceof PdfNotFound)return res.status(error.status).json({success:false,message:error.message});next(error);}
  };
  return {
    blotter:run(req=>{if(!validId(req.params.id))throw new FilterError('Invalid blotter ID');return service.blotter(Number(req.params.id),req.user);}),
    summary:run(req=>service.summary(req.query,req.user))
  };
};
