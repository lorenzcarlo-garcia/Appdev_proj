const {hashPassword,validPassword}=require('./password');
async function recoverPassword(db,email,password){
 if(typeof email!=='string' || email.length>150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validPassword(password))throw new Error('Enter a valid email and a password with 12-128 characters');
 const hash=await hashPassword(password);const c=await db.getConnection();let begun=false;
 try{await c.beginTransaction();begun=true;const [rows]=await c.execute('SELECT id FROM users WHERE email = ? FOR UPDATE',[email.trim().toLowerCase()]);if(!rows.length)throw new Error('Account not found');
 await c.execute('UPDATE users SET password_hash = ? WHERE id = ?',[hash,rows[0].id]);
 await c.execute("DELETE FROM sessions WHERE JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(data), data, '{}'), '$.userId')) = ?",[String(rows[0].id)]);
 await c.commit();begun=false;
 }catch(error){if(begun)await c.rollback();if(error.code)throw new Error('Recovery failed; no partial change should be assumed. Check database availability.');throw error;}finally{c.release();}
}
module.exports={recoverPassword};
