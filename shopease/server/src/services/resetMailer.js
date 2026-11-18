const nodemailer=require('nodemailer');
function resetMailer(config){
  const {user,appPassword}=config.gmail||{};
  const configured=typeof user==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user) && typeof appPassword==='string' && /^[a-zA-Z0-9]{16}$/.test(appPassword);
  const transport=configured?nodemailer.createTransport({
    host:'smtp.gmail.com',port:465,secure:true,
    auth:{user,pass:appPassword},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,
    pool:true,maxConnections:2,maxMessages:50,
    logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,
  }):null;
  let pending=0;
  return {
    configured,
    async send({to,code}){
      if(!transport || pending>=20)throw new Error('Reset mail is unavailable');
      pending++;
      try{
        await transport.sendMail({from:{name:'BantayLog',address:user},to,
          subject:'Your BantayLog password reset code',
          text:`Your BantayLog password reset code is: ${code}\n\nEnter it in the BantayLog app to choose a new password. This code expires after 15 minutes and can be used once. Do not share it with anyone.\n\nIf you did not request this, ignore this email. Your password has not changed.\n\nBantayLog — Barangay Sta. Ana, Pateros`,
        });
      }finally{pending--;}
    },
    close:()=>transport?.close(),
  };
}
module.exports={resetMailer};
