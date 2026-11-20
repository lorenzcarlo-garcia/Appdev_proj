const {entityTypes}=require('./activityLog');
const {dateRange,sqlStart,FilterError}=require('./dashboardFilters');
// All personnel can read administrative events and filter them by the role that acted.
// Only Captain and Super Admin can identify the individual person behind an entry
// (decided by the owner on 2026-11-20). Staff-account events stay Super Admin only.
const roles=['resident','staff','secretary','captain','super_admin'];
const inspectors=['captain','super_admin'];
const validId=value=>typeof value==='string' && /^[1-9]\d*$/.test(value) && Number(value)<=4294967295;
class ActivityNotFound extends Error{constructor(){super('Person not found in the activity log');this.status=404;}}
function activityService(db){
  const visibility=user=>user.role==='super_admin'?{sql:'',args:[]}:{sql:" AND a.visibility = 'administrative'",args:[]};
  return {
    canInspect:user=>inspectors.includes(user.role),
    async list(user,query={}){
      if(Object.keys(query).some(key=>!['entity_type','actor_role','actor_id','from','to','page','page_size'].includes(key))) throw new FilterError('Unexpected activity filter.');
      const {entity_type='',actor_role='',actor_id,page='1',page_size='25'}=query;
      if(typeof entity_type!=='string' || (entity_type && !entityTypes.includes(entity_type)) || typeof actor_role!=='string' || (actor_role && !roles.includes(actor_role)) || typeof page!=='string' || !/^[1-9]\d*$/.test(page) || Number(page)>1000000 || typeof page_size!=='string' || !/^[1-9]\d*$/.test(page_size) || Number(page_size)>50) throw new FilterError('Invalid activity filters or pagination.');
      const superAdmin=user.role==='super_admin',inspect=inspectors.includes(user.role);
      if(entity_type==='staff_account' && !superAdmin) throw new FilterError('Choose a valid activity type.');
      if(actor_id!==undefined && (!inspect || !validId(actor_id))) throw new FilterError('Choose a valid person.');
      const clauses=[],params=[];
      if(!superAdmin) clauses.push("a.visibility = 'administrative'");
      if(entity_type){clauses.push('a.entity_type = ?');params.push(entity_type);}
      // The role recorded at the time of the action, so a former Secretary stays "Secretary".
      if(actor_role){clauses.push('a.actor_role = ?');params.push(actor_role);}
      if(actor_id!==undefined){clauses.push('a.actor_id = ?');params.push(Number(actor_id));}
      const range=dateRange(query.from,query.to);
      if(range){clauses.push('a.created_at >= ? AND a.created_at < ?');params.push(sqlStart(range.start),sqlStart(range.end));}
      const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
      const [[count]]=await db.execute(`SELECT COUNT(*) AS total FROM activity_log a${where}`,params);
      const [entries]=await db.execute(`SELECT a.id, ${inspect?'a.actor_id, ':''}a.actor_role, a.action, a.entity_type, a.entity_id, a.entity_ref, a.detail, a.created_at FROM activity_log a${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,[...params,Number(page_size),(Number(page)-1)*Number(page_size)]);
      return {entries,total:Number(count.total),page:Number(page),page_size:Number(page_size)};
    },
    // Who performed actions: name, email, roles then/now, status and sign-in dates.
    // Birth date, address and contact number are deliberately not included.
    async actor(user,id){
      if(!inspectors.includes(user.role)) throw new FilterError('Access denied.');
      if(!validId(id)) throw new FilterError('Choose a valid person.');
      const v=visibility(user);
      const [[summary]]=await db.execute(`SELECT COUNT(*) AS actions, MIN(a.created_at) AS first_action_at, MAX(a.created_at) AS last_action_at, GROUP_CONCAT(DISTINCT a.actor_role ORDER BY a.actor_role) AS roles_used FROM activity_log a WHERE a.actor_id = ?${v.sql}`,[Number(id),...v.args]);
      // Only people who appear in the visible log can be looked up (no account enumeration).
      if(!Number(summary.actions)) throw new ActivityNotFound();
      const [rows]=await db.execute('SELECT u.id, u.email, u.role, u.is_active, u.created_at, u.last_login_at, COALESCE(sp.first_name, res.first_name) AS first_name, COALESCE(sp.middle_name, res.middle_name) AS middle_name, COALESCE(sp.last_name, res.last_name) AS last_name FROM users u LEFT JOIN staff_profiles sp ON sp.user_id = u.id LEFT JOIN residents res ON res.id = u.resident_id WHERE u.id = ?',[Number(id)]);
      if(!rows.length) throw new ActivityNotFound();
      const person=rows[0];
      return {id:person.id,email:person.email,current_role:person.role,is_active:Boolean(person.is_active),first_name:person.first_name||null,middle_name:person.middle_name||null,last_name:person.last_name||null,
        account_created_at:person.created_at,last_login_at:person.last_login_at,
        actions:Number(summary.actions),first_action_at:summary.first_action_at,last_action_at:summary.last_action_at,roles_used:summary.roles_used?String(summary.roles_used).split(','):[]};
    }
  };
}
module.exports={activityService,ActivityNotFound};
