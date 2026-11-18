const {passwordResetService,PasswordResetError}=require('../services/passwordResetService');
const {resetMailer}=require('../services/resetMailer');
module.exports=(db,config)=>{
  const service=passwordResetService(db,{secret:config.sessionSecret,mailer:resetMailer(config)});
  const run=handler=>async(req,res,next)=>{
    try{res.json({success:true,...await handler(req.body)});}
    catch(error){if(error instanceof PasswordResetError)return res.status(error.status).json({success:false,message:error.message});next(error);}
  };
  return {request:run(service.request),reset:run(service.reset)};
};
