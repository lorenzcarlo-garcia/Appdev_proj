const managers=['secretary','captain','super_admin'];
const progress=['Planned','Ongoing','Completed'];
const publicFields='id, title, summary, location, maintenance_status, published_at, updated_at';
const managementFields=publicFields+', publication_state, version, created_by, updated_by, published_by, archived_by, archived_at, created_at';
class CommunityUpdateError extends Error {constructor(status,message){super(message);this.status=status;}}
function fail(status,message){throw new CommunityUpdateError(status,message);}
function validId(value){return /^[1-9]\d*$/.test(String(value)) && Number(value)<=4294967295;}
function object(body,allowed){if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!allowed.includes(key))) fail(400,'Unexpected update fields');}
function content(body){
  const data={};
  for(const [key,max] of [['title',150],['summary',2000],['location',255]]) {
    if(typeof body[key]!=='string' || !body[key].trim() || [...body[key].trim()].length>max) fail(400,`Provide ${key} (1-${max} characters)`);
    data[key]=body[key].trim();
  }
  if(!progress.includes(body.maintenance_status)) fail(400,'Choose Planned, Ongoing or Completed');
  data.maintenance_status=body.maintenance_status;return data;
}
function version(body){if(!Number.isInteger(body.expected_version) || body.expected_version<1 || body.expected_version>4294967295) fail(400,'Provide the version you reviewed');return body.expected_version;}
function manager(user){if(!managers.includes(user.role)) fail(403,'Only Secretary, Captain or Super Admin can manage community updates');}
function communityUpdateService(db){
  async function transaction(work){
    const c=await db.getConnection();let begun=false;
    try {await c.beginTransaction();begun=true;const result=await work(c);await c.commit();begun=false;return result;}
    catch(error){if(begun) await c.rollback();throw error;}finally{c.release();}
  }
  async function locked(c,id,expected){
    if(!validId(id)) fail(400,'Invalid update ID');
    const [rows]=await c.execute(`SELECT ${managementFields} FROM community_updates WHERE id = ? FOR UPDATE`,[Number(id)]);
    if(!rows.length) fail(404,'Update not found');const row=rows[0];
    if(row.version!==expected) fail(409,'This update changed. Reload it and review the latest version before saving.');
    if(row.publication_state==='Archived') fail(409,'Archived updates are read-only');return row;
  }
  async function detail(id,user,c=db){
    if(!validId(id)) fail(400,'Invalid update ID');
    const manage=managers.includes(user.role);
    const [rows]=await c.execute(`SELECT ${manage?managementFields:publicFields} FROM community_updates WHERE id = ?${manage?'':" AND publication_state = 'Published'"}`,[Number(id)]);
    if(!rows.length) fail(404,'Update not found');return rows[0];
  }
  return {
    detail,
    list:async(user,query={})=>{
      if(Object.keys(query).some(key=>!['view','maintenance_status','q','page','page_size'].includes(key))) fail(400,'Unexpected update filter');
      const {view='published',maintenance_status='',q='',page='1',page_size='10'}=query;
      if(!['published','drafts','archived','all'].includes(view) || typeof q!=='string' || [...q].length>100 || (maintenance_status!=='' && !progress.includes(maintenance_status)) || typeof page!=='string' || !/^[1-9]\d*$/.test(page) || Number(page)>1000000 || typeof page_size!=='string' || !/^[1-9]\d*$/.test(page_size) || Number(page_size)>50) fail(400,'Invalid update filters or pagination');
      if(view!=='published') manager(user);
      const clauses=[],params=[];
      if(view!=='all'){clauses.push('publication_state = ?');params.push({published:'Published',drafts:'Draft',archived:'Archived'}[view]);}
      if(maintenance_status){clauses.push('maintenance_status = ?');params.push(maintenance_status);}
      if(q.trim()){clauses.push("(title LIKE ? ESCAPE '=' OR summary LIKE ? ESCAPE '=' OR location LIKE ? ESCAPE '=')");const pattern='%'+q.trim().replace(/[=%_]/g,'=$&')+'%';params.push(pattern,pattern,pattern);}
      const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
      const [counts]=await db.execute('SELECT COUNT(*) AS total FROM community_updates'+where,params);
      const [updates]=await db.execute(`SELECT ${managers.includes(user.role)?managementFields:publicFields} FROM community_updates${where} ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT ? OFFSET ?`,[...params,Number(page_size),(Number(page)-1)*Number(page_size)]);
      return {updates,total:Number(counts[0].total),page:Number(page),page_size:Number(page_size)};
    },
    create:async(user,body)=>{
      manager(user);object(body,['title','summary','location','maintenance_status']);const data=content(body);
      return transaction(async c=>{
        const [result]=await c.execute('INSERT INTO community_updates (title, summary, location, maintenance_status, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',[data.title,data.summary,data.location,data.maintenance_status,user.id,user.id]);
        return detail(result.insertId,user,c);
      });
    },
    save:async(id,user,body)=>{
      manager(user);object(body,['title','summary','location','maintenance_status','expected_version','confirm']);const data=content(body),expected=version(body);
      if(body.confirm!==undefined && typeof body.confirm!=='boolean') fail(400,'Confirmation must be a boolean');
      return transaction(async c=>{
        const row=await locked(c,id,expected);
        if(row.publication_state==='Published' && body.confirm!==true) fail(400,'Review the public summary and confirm before changing a published update');
        await c.execute('UPDATE community_updates SET title = ?, summary = ?, location = ?, maintenance_status = ?, updated_by = ?, version = version + 1 WHERE id = ?',[data.title,data.summary,data.location,data.maintenance_status,user.id,Number(id)]);
        return detail(id,user,c);
      });
    },
    transition:async(id,user,body,action)=>{
      manager(user);object(body,['expected_version','confirm']);const expected=version(body);
      if(body.confirm!==true) fail(400,'Explicit review confirmation is required');
      return transaction(async c=>{
        const row=await locked(c,id,expected);
        if(action==='publish'){
          if(row.publication_state!=='Draft') fail(409,'Only a draft can be published');
          content(row);
          await c.execute("UPDATE community_updates SET publication_state = 'Published', published_by = ?, published_at = CURRENT_TIMESTAMP, updated_by = ?, version = version + 1 WHERE id = ?",[user.id,user.id,Number(id)]);
        }else if(action==='archive'){
          await c.execute("UPDATE community_updates SET publication_state = 'Archived', archived_by = ?, archived_at = CURRENT_TIMESTAMP, updated_by = ?, version = version + 1 WHERE id = ?",[user.id,user.id,Number(id)]);
        }else fail(400,'Unknown update action');
        return detail(id,user,c);
      });
    }
  };
}
module.exports={communityUpdateService,CommunityUpdateError,managers,progress};
