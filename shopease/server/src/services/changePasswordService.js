const {hashPassword,verifyPassword,validPassword}=require('./password');
class PasswordChangeError extends Error {constructor(status,message){super(message);this.status=status;}}
function fail(status,message){throw new PasswordChangeError(status,message);}
function changePasswordService(db){
  return async(userId,body)=>{
    if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!['current_password','new_password','confirm_password'].includes(key))) fail(400,'Unexpected password change fields');
    if(typeof body.current_password!=='string' || !body.current_password.length || body.current_password.length>128) fail(400,'Enter your current password');
    if(!validPassword(body.new_password)) fail(400,'New password must contain 12-128 characters');
    if(body.confirm_password!==body.new_password) fail(400,'New password and confirmation must match');
    if(body.new_password===body.current_password) fail(400,'Choose a password different from your current password');
    const [rows]=await db.execute('SELECT id, password_hash, is_active FROM users WHERE id = ?',[userId]);
    const before=rows[0];
    if(!before || !before.is_active) fail(401,'Please log in again');
    if(!await verifyPassword(body.current_password,before.password_hash)) fail(400,'Current password is incorrect');
    const replacement=await hashPassword(body.new_password);
    const connection=await db.getConnection();let begun=false;
    try {
      await connection.beginTransaction();begun=true;
      const [locked]=await connection.execute('SELECT id, password_hash, is_active FROM users WHERE id = ? FOR UPDATE',[userId]);
      if(!locked[0] || !locked[0].is_active || locked[0].password_hash!==before.password_hash) fail(409,'Your account changed. Log in again before changing your password.');
      await connection.execute('UPDATE users SET password_hash = ? WHERE id = ?',[replacement,userId]);
      await connection.execute("DELETE FROM sessions WHERE JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(data), data, '{}'), '$.userId')) = ?",[String(userId)]);
      await connection.commit();begun=false;
    }catch(error){if(begun)await connection.rollback();throw error;}finally{connection.release();}
  };
}
module.exports={changePasswordService,PasswordChangeError};
