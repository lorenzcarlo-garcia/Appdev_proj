const {createHmac,randomInt,randomUUID,timingSafeEqual}=require('node:crypto');
const {hashPassword,validPassword,verifyPassword}=require('./password');
const {credentialTag}=require('./sessionCredentials');
class PasswordResetError extends Error{constructor(status,message){super(message);this.status=status;}}
const genericMessage='If an active account uses that email, a reset code will be sent. Check your inbox and spam folder. You can request another code after 60 seconds.';
const invalidMessage='This code is invalid, expired, or no longer available. Request a new code and try again.';
function passwordResetService(db,{secret,mailer,schedule=task=>setImmediate(task),onDeliveryFailure=()=>console.error('Password reset email delivery failed; no code or account details logged.')}={}){
  const digest=(purpose,value)=>createHmac('sha256',secret).update(`bantaylog-reset-${purpose}\0${value}`).digest('hex');
  async function transaction(work){
    const c=await db.getConnection();let begun=false;
    try{await c.beginTransaction();begun=true;const result=await work(c);await c.commit();begun=false;return result;}
    catch(error){if(begun)await c.rollback();throw error;}finally{c.release();}
  }
  async function request(body){
    if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>key!=='email') || typeof body.email!=='string' || body.email.length>150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))throw new PasswordResetError(400,'Enter a valid email address.');
    if(!mailer?.configured)throw new PasswordResetError(503,'Email recovery is not configured yet. Contact your barangay administrator for account recovery.');
    const email=body.email.trim().toLowerCase(),emailKey=digest('email',email);
    const requestId=randomUUID(),code=String(randomInt(0,100000000)).padStart(8,'0');
    const codeHash=digest('code',requestId+':'+code);
    const result=await transaction(async c=>{
      await c.execute('INSERT INTO password_reset_requests (email_key) VALUES (?) ON DUPLICATE KEY UPDATE email_key = email_key',[emailKey]);
      const [slots]=await c.execute('SELECT *, requested_at > UTC_TIMESTAMP() - INTERVAL 60 SECOND AS cooling_down, window_started_at > UTC_TIMESTAMP() - INTERVAL 15 MINUTE AS current_window FROM password_reset_requests WHERE email_key = ? FOR UPDATE',[emailKey]);
      const slot=slots[0];
      if(slot.cooling_down || (slot.current_window && slot.request_count>=5))return {requestId:slot.request_id||requestId};
      const [users]=await c.execute('SELECT id, password_hash, is_active FROM users WHERE email = ?',[email]);
      const user=users[0]?.is_active?users[0]:null;
      await c.execute('UPDATE password_reset_requests SET request_id = ?, user_id = ?, code_hash = ?, credential_tag = ?, requested_at = UTC_TIMESTAMP(), expires_at = UTC_TIMESTAMP() + INTERVAL 15 MINUTE, used_at = NULL, attempts = 0, request_count = ?, window_started_at = IF(?, window_started_at, UTC_TIMESTAMP()) WHERE email_key = ?',
        [requestId,user?.id||null,codeHash,user?credentialTag(user.password_hash):null,slot.current_window?slot.request_count+1:1,Boolean(slot.current_window),emailKey]);
      return {requestId,deliver:Boolean(user)};
    });
    // Delivery is outside the response path, so account existence is not exposed by SMTP timing.
    if(result.deliver)schedule(async()=>{
      try{await mailer.send({to:email,code});}
      catch{
        try{await db.execute('UPDATE password_reset_requests SET used_at = UTC_TIMESTAMP(), code_hash = NULL WHERE request_id = ?',[requestId]);}catch{ /* no secret-bearing errors are logged */ }
        onDeliveryFailure();
      }
    });
    return {request_id:result.requestId,message:genericMessage};
  }
  async function reset(body){
    if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!['request_id','code','new_password','confirm_password'].includes(key)) || typeof body.request_id!=='string' || !/^[a-f0-9-]{36}$/.test(body.request_id) || typeof body.code!=='string' || !/^\d{8}$/.test(body.code))throw new PasswordResetError(400,'Enter the eight-digit code from your reset email.');
    if(!validPassword(body.new_password))throw new PasswordResetError(400,'New password must contain 12-128 characters.');
    if(body.new_password!==body.confirm_password)throw new PasswordResetError(400,'New password and confirmation must match.');
    const result=await transaction(async c=>{
      const [slots]=await c.execute('SELECT *, expires_at <= UTC_TIMESTAMP() AS expired FROM password_reset_requests WHERE request_id = ? FOR UPDATE',[body.request_id]);
      const slot=slots[0];
      if(!slot || slot.used_at || slot.expired || slot.attempts>=5 || !slot.code_hash)return false;
      const candidate=digest('code',body.request_id+':'+body.code);
      if(!timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(slot.code_hash,'hex'))){
        await c.execute('UPDATE password_reset_requests SET attempts = attempts + 1 WHERE email_key = ?',[slot.email_key]);
        return false;
      }
      const [users]=await c.execute('SELECT id, password_hash, is_active FROM users WHERE id = ? FOR UPDATE',[slot.user_id]);
      const user=users[0];
      if(!user || !user.is_active || credentialTag(user.password_hash)!==slot.credential_tag){
        await c.execute('UPDATE password_reset_requests SET used_at = UTC_TIMESTAMP(), code_hash = NULL WHERE email_key = ?',[slot.email_key]);
        return false;
      }
      if(await verifyPassword(body.new_password,user.password_hash))throw new PasswordResetError(400,'Choose a password different from your current password.');
      const replacement=await hashPassword(body.new_password);
      await c.execute('UPDATE users SET password_hash = ? WHERE id = ?',[replacement,user.id]);
      await c.execute("DELETE FROM sessions WHERE JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(data), data, '{}'), '$.userId')) = ?",[String(user.id)]);
      await c.execute('UPDATE password_reset_requests SET used_at = UTC_TIMESTAMP(), code_hash = NULL WHERE email_key = ?',[slot.email_key]);
      return true;
    });
    if(!result)throw new PasswordResetError(400,invalidMessage);
    return {message:'Password reset. Log in with your new password. Your other devices have been signed out.'};
  }
  return {request,reset};
}
module.exports={passwordResetService,PasswordResetError};
