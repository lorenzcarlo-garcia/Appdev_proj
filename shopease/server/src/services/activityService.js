const {entityTypes}=require('./activityLog');
const {dateRange,sqlStart,FilterError}=require('./dashboardFilters');
// Administrative roles see administrative events; staff-account events are Super Admin only.
// Entries show the actor's role, not their email, except to Super Admin, who already
// manages staff accounts.
function activityService(db){
  return {
    async list(user,query={}){
      if(Object.keys(query).some(key=>!['entity_type','from','to','page','page_size'].includes(key))) throw new FilterError('Unexpected activity filter.');
      const {entity_type='',page='1',page_size='25'}=query;
      if(typeof entity_type!=='string' || (entity_type && !entityTypes.includes(entity_type)) || typeof page!=='string' || !/^[1-9]\d*$/.test(page) || Number(page)>1000000 || typeof page_size!=='string' || !/^[1-9]\d*$/.test(page_size) || Number(page_size)>50) throw new FilterError('Invalid activity filters or pagination.');
      const superAdmin=user.role==='super_admin';
      if(entity_type==='staff_account' && !superAdmin) throw new FilterError('Choose a valid activity type.');
      const clauses=[],params=[];
      if(!superAdmin) clauses.push("a.visibility = 'administrative'");
      if(entity_type){clauses.push('a.entity_type = ?');params.push(entity_type);}
      const range=dateRange(query.from,query.to);
      if(range){clauses.push('a.created_at >= ? AND a.created_at < ?');params.push(sqlStart(range.start),sqlStart(range.end));}
      const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
      const [[count]]=await db.execute(`SELECT COUNT(*) AS total FROM activity_log a${where}`,params);
      const actor=superAdmin?', u.email AS actor_email':'';
      const join=superAdmin?' LEFT JOIN users u ON u.id = a.actor_id':'';
      const [entries]=await db.execute(`SELECT a.id, a.actor_role${actor}, a.action, a.entity_type, a.entity_id, a.entity_ref, a.detail, a.created_at FROM activity_log a${join}${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,[...params,Number(page_size),(Number(page)-1)*Number(page_size)]);
      return {entries,total:Number(count.total),page:Number(page),page_size:Number(page_size)};
    }
  };
}
module.exports={activityService};
