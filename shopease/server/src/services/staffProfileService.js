const {validate}=require('./residentValidation');
const {guardEdit,editToken,residentKeys}=require('./editToken');
const roles=['staff','secretary','captain','super_admin'];
const keys=[...residentKeys,'version'];
const empty={first_name:null,middle_name:null,last_name:null,birth_date:null,contact_no:null,address:null,version:0};
const fields="first_name, middle_name, last_name, DATE_FORMAT(birth_date,'%Y-%m-%d') AS birth_date, contact_no, address, version";
class StaffProfileError extends Error{constructor(status,message){super(message);this.status=status;}}
function staffProfileService(db){
  function allowed(user){if(!roles.includes(user.role))throw new StaffProfileError(403,'Personal staff profiles are available to barangay personnel only.');}
  async function get(user){
    allowed(user);
    const [rows]=await db.execute(`SELECT ${fields} FROM staff_profiles WHERE user_id = ?`,[user.id]);
    const row=rows[0]||empty;
    return {...row,edit_token:editToken(row,keys)};
  }
  async function save(user,body){
    allowed(user);
    if(!body || typeof body!=='object' || Array.isArray(body))throw new StaffProfileError(400,'Enter valid personal details.');
    const {expected_token,...details}=body;
    const data=validate(details);
    if(!data)throw new StaffProfileError(400,'Enter a first name, last name and address, and valid optional contact number and birth date. Account fields cannot be changed here.');
    if(typeof expected_token!=='string')throw new StaffProfileError(400,'Reload your profile before saving.');
    const c=await db.getConnection();let begun=false;
    try{
      await c.beginTransaction();begun=true;
      // The account lock also serializes first-time profile creation across devices.
      const [accounts]=await c.execute('SELECT id, role, is_active FROM users WHERE id = ? FOR UPDATE',[user.id]);
      if(!accounts[0]?.is_active || !roles.includes(accounts[0].role))throw new StaffProfileError(403,'This account can no longer update a staff profile.');
      const [rows]=await c.execute(`SELECT ${fields} FROM staff_profiles WHERE user_id = ? FOR UPDATE`,[user.id]);
      const row=rows[0]||empty;
      guardEdit(row,expected_token,keys);
      const changed=!rows.length || residentKeys.some(key=>(row[key]||null)!==(data[key]||null));
      const values=[data.first_name,data.middle_name,data.last_name,data.birth_date,data.contact_no,data.address];
      if(!rows.length)await c.execute('INSERT INTO staff_profiles (user_id, first_name, middle_name, last_name, birth_date, contact_no, address) VALUES (?, ?, ?, ?, ?, ?, ?)',[user.id,...values]);
      else if(changed)await c.execute('UPDATE staff_profiles SET first_name = ?, middle_name = ?, last_name = ?, birth_date = ?, contact_no = ?, address = ?, version = version + 1 WHERE user_id = ?',[...values,user.id]);
      await c.commit();begun=false;
      return {changed};
    }catch(error){if(begun)await c.rollback();throw error;}finally{c.release();}
  }
  return {get,save};
}
module.exports={staffProfileService,StaffProfileError};
