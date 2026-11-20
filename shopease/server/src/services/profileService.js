const {guardEdit,editToken,residentKeys}=require('./editToken');
const {validate}=require('./residentValidation');
const {logActivity}=require('./activityLog');
class ProfileError extends Error{constructor(status,message){super(message);this.status=status;}}
const fields="first_name, middle_name, last_name, DATE_FORMAT(birth_date,'%Y-%m-%d') AS birth_date, contact_no, address, is_verified";
function profileService(db){
 async function get(user){if(user.role!=='resident' || !user.resident_id)throw new ProfileError(403,'Resident profile is not available for this account');const [rows]=await db.execute(`SELECT ${fields} FROM residents WHERE id = ?`,[user.resident_id]);if(!rows.length)throw new ProfileError(404,'Resident profile not found');return {...rows[0],edit_token:editToken(rows[0],residentKeys)};}
 async function save(user,body){
  if(user.role!=='resident' || !user.resident_id)throw new ProfileError(403,'Resident profile is not available for this account');
  const {expected_token,...details}=body && typeof body==='object' && !Array.isArray(body)?body:{};
  const data=validate(details);if(!data)throw new ProfileError(400,'Enter valid resident details. Verification and account fields cannot be changed here.');
  const c=await db.getConnection();let begun=false;
  try{await c.beginTransaction();begun=true;
   const [rows]=await c.execute(`SELECT ${fields} FROM residents WHERE id = ? FOR UPDATE`,[user.resident_id]);if(!rows.length)throw new ProfileError(404,'Resident profile not found');
   guardEdit(rows[0],expected_token,residentKeys);
   const changed=Object.keys(data).some(key=>(rows[0][key]||null)!==(data[key]||null));
   if(changed){
    await c.execute('UPDATE residents SET first_name = ?, middle_name = ?, last_name = ?, birth_date = ?, contact_no = ?, address = ?, is_verified = 0, verified_by = NULL, verified_at = NULL WHERE id = ?',[data.first_name,data.middle_name,data.last_name,data.birth_date,data.contact_no,data.address,user.resident_id]);
    await logActivity(c,user,{action:'resident.self_updated',entityType:'resident',entityId:user.resident_id,entityRef:`Resident #${user.resident_id}`,detail:rows[0].is_verified?'Verification cleared after the resident edited their details':'Resident edited their details'});
   }
   await c.commit();begun=false;return {changed};
  }catch(error){if(begun)await c.rollback();throw error;}finally{c.release();}
 }
 return {get,save};
}
module.exports={profileService,ProfileError};
