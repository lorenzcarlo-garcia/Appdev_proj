const {changePasswordService,PasswordChangeError}=require('../services/changePasswordService');
const {COOKIE_NAME}=require('../config/session');
module.exports=(db,config)=>{
  const change=changePasswordService(db);
  return async(req,res,next)=>{
    try{
      await change(req.user.id,req.body);
      // SQL already revoked every session. Prevent this response from saving
      // its old in-memory session back into the store.
      req.session=null;
      res.clearCookie(COOKIE_NAME,{httpOnly:true,sameSite:'lax',secure:config.production,path:'/'});
      res.json({success:true,message:'Password changed. Please log in again on your devices.'});
    }catch(error){
      if(error instanceof PasswordChangeError)return res.status(error.status).json({success:false,message:error.message});
      next(error);
    }
  };
};
