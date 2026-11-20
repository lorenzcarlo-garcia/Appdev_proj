const {editToken,guardEdit}=require('./editToken');
const {logActivity}=require('./activityLog');
const fields='id, name, description, is_active, created_at, updated_at';
const areaKeys=['name','description','is_active'];
const administrativeRoles=['staff','secretary','captain','super_admin'];
class AreaError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new AreaError(status,message);};
const validId=value=>/^[1-9]\d*$/.test(String(value)) && Number(value)<=4294967295;
function validate(body,update){
  const allowed=update?['name','description','is_active','expected_token']:['name','description'];
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!allowed.includes(key))) fail(400,'Unexpected area fields');
  if(typeof body.name!=='string' || !body.name.trim() || [...body.name.trim()].length>100) fail(400,'Enter an area or purok name (1-100 characters)');
  if(body.description!=null && (typeof body.description!=='string' || [...body.description.trim()].length>255)) fail(400,'Description must be 255 characters or fewer');
  if(update && body.is_active!==undefined && typeof body.is_active!=='boolean') fail(400,'is_active must be true or false');
  return {name:body.name.trim(),description:body.description?.trim()||null,is_active:body.is_active};
}
function areaService(db){
  async function transaction(work){
    const c=await db.getConnection();let begun=false;
    try{await c.beginTransaction();begun=true;const result=await work(c);await c.commit();begun=false;return result;}
    catch(error){if(begun)await c.rollback();if(error.code==='ER_DUP_ENTRY')fail(409,'An area with this name already exists');throw error;}
    finally{c.release();}
  }
  return {
    list:async(user,query={})=>{
      if(Object.keys(query).some(key=>key!=='include_inactive') || (query.include_inactive!==undefined && !['true','false'].includes(query.include_inactive))) fail(400,'include_inactive must be true or false');
      const all=query.include_inactive==='true';
      if(all && !administrativeRoles.includes(user.role)) fail(403,'Access denied');
      const [rows]=await db.execute(`SELECT ${fields} FROM report_areas WHERE (? = 1 OR is_active = 1) ORDER BY name, id`,[all?1:0]);
      return rows.map(row=>({...row,edit_token:editToken(row,areaKeys)}));
    },
    create:(user,body)=>{
      const data=validate(body,false);
      return transaction(async c=>{
        const [result]=await c.execute('INSERT INTO report_areas (name, description) VALUES (?, ?)',[data.name,data.description]);
        await logActivity(c,user,{action:'area.created',entityType:'area',entityId:result.insertId,entityRef:data.name});
        return {id:result.insertId,name:data.name,description:data.description,is_active:1};
      });
    },
    update:(id,user,body)=>{
      if(!validId(id)) fail(400,'Invalid area ID');
      const data=validate(body,true);
      return transaction(async c=>{
        const [rows]=await c.execute(`SELECT ${fields} FROM report_areas WHERE id = ? FOR UPDATE`,[Number(id)]);
        if(!rows.length) fail(404,'Area not found');
        guardEdit(rows[0],body.expected_token,areaKeys);
        await c.execute('UPDATE report_areas SET name = ?, description = ?, is_active = COALESCE(?, is_active) WHERE id = ?',[data.name,data.description,data.is_active===undefined?null:Number(data.is_active),Number(id)]);
        const activeChanged=data.is_active!==undefined && Boolean(rows[0].is_active)!==data.is_active;
        await logActivity(c,user,{action:'area.updated',entityType:'area',entityId:Number(id),entityRef:data.name,detail:activeChanged?(data.is_active?'Reactivated':'Deactivated'):'Details edited'});
        return {id:Number(id),message:'Area updated'};
      });
    }
  };
}
module.exports={areaService,AreaError,areaKeys};
