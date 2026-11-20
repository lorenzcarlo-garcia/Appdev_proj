const {editToken,reportKeys}=require('../services/editToken');
const { reportService, ReportError, fields, validId } = require('../services/reportService');
const {blotterService, BlotterError} = require('../services/blotterService');
const {dateRange,areaFilter,submittedAtSql,sqlStart,FilterError} = require('../services/dashboardFilters');
// First submission time; null for drafts. Never substituted with draft creation time.
const submittedAt = `${submittedAtSql('incident_reports')} AS submitted_at`;
module.exports = db => {
  const blotters=blotterService(db);
  const service=reportService(db);
  const run=handler=>async(req,res)=>{try {await handler(req,res);} catch(error) {if(error instanceof ReportError || error instanceof BlotterError || error instanceof FilterError) return res.status(error.status).json({success:false,message:error.message});throw error;}};
  const id=req=>{if(!validId(req.params.id)) throw new ReportError(400,'Invalid report ID');return Number(req.params.id);};
  const empty=body=>{if(body!==undefined && (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length)) throw new ReportError(400,'This operation does not accept report fields');};
  return {
    status:run(async(req,res)=>res.json({success:true,...await service.changeStatus(id(req),req.user,req.body)})),
    area:run(async(req,res)=>res.json({success:true,...await service.assignArea(id(req),req.user,req.body)})),
    convert:run(async(req,res)=>res.status(201).json({success:true,blotter:await blotters.convert(id(req),req.user,req.body)})),
    list:run(async(req,res)=>{
      const {view='active',page='1',page_size='20',search='',status='',status_group='all',category_id,from,to,area_id}=req.query;
      // Same validated date/area parsing as the dashboard, so the table matches its counts.
      const range=dateRange(from,to);const area=area_id===undefined?undefined:areaFilter(area_id);
      if(typeof search!=='string' || [...search].length>255 || !['','Submitted','Under Investigation','Scheduled for Action','Resolved'].includes(status) || !['all','open','ongoing','resolved'].includes(status_group) || (category_id!==undefined && (typeof category_id!=='string' || !validId(category_id)))) throw new ReportError(400,'Invalid search, category or status filter');
      if(!['active','drafts','cancelled','all'].includes(view) || typeof page!=='string' || !/^[1-9]\d*$/.test(page) || Number(page)>1000000 || typeof page_size!=='string' || !/^[1-9]\d*$/.test(page_size) || Number(page_size)>100) throw new ReportError(400,'Invalid view or pagination');
      const clauses=[];const params=[];
      if(req.user.role==='resident') {clauses.push('user_id = ?');params.push(req.user.id);}
      else {if(view==='drafts') throw new ReportError(403,'Private drafts are not accessible');clauses.push("submission_stage = 'Submitted'");}
      if(view==='drafts') clauses.push("submission_stage = 'Draft' AND cancelled_at IS NULL");
      if(view==='active') clauses.push("submission_stage = 'Submitted' AND cancelled_at IS NULL");
      if(view==='cancelled') clauses.push('cancelled_at IS NOT NULL');
      if(category_id!==undefined){clauses.push('category_id = ?');params.push(Number(category_id));}
      if(area==='unassigned')clauses.push('area_id IS NULL');
      else if(area!==undefined){clauses.push('area_id = ?');params.push(area);}
      if(range){clauses.push(`${submittedAtSql('incident_reports')} >= ? AND ${submittedAtSql('incident_reports')} < ?`);params.push(sqlStart(range.start),sqlStart(range.end));}
      if(status){clauses.push('status = ?');params.push(status);}
      if(status_group!=='all'){
        clauses.push("submission_stage = 'Submitted' AND cancelled_at IS NULL");
        if(status_group==='open')clauses.push("status = 'Submitted'");
        if(status_group==='ongoing')clauses.push("status IN ('Under Investigation','Scheduled for Action')");
        if(status_group==='resolved')clauses.push("status = 'Resolved'");
      }
      if(search.trim()){
        const pattern='%'+search.trim().replace(/[!%_]/g,value=>'!'+value)+'%';
        const searchableFields=req.user.role==='resident'?'title, CAST(resident_report_no AS CHAR), location, description':'title, reference_no, location, description';
        clauses.push(`(CONCAT_WS(' ', ${searchableFields}) LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM incident_categories WHERE incident_categories.id = incident_reports.category_id AND incident_categories.name LIKE ? ESCAPE '!'))`);params.push(pattern,pattern);
      }
      const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
      const [counts]=await db.execute('SELECT COUNT(*) AS total FROM incident_reports'+where,params);
      const [reports]=await db.execute(`SELECT ${fields}, ${submittedAt} FROM incident_reports${where} ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC LIMIT ? OFFSET ?`,[...params,Number(page_size),(Number(page)-1)*Number(page_size)]);
      res.json({success:true,reports,total:Number(counts[0].total),page:Number(page),page_size:Number(page_size)});
    }),
    detail:run(async(req,res)=>{
      const reportId=id(req);
      const condition=req.user.role==='resident'?' AND user_id = ?':" AND submission_stage = 'Submitted'";
      const params=req.user.role==='resident'?[reportId,req.user.id]:[reportId];
      const [rows]=await db.execute(`SELECT ${fields}, ${submittedAt} FROM incident_reports WHERE id = ?${condition}`,params);
      if(!rows.length) throw new ReportError(404,'Report not found');
      const [history]=rows[0].submission_stage==='Draft'?[[]]:await db.execute('SELECT old_status, new_status, changed_by, remarks, created_at FROM report_status_history WHERE report_id = ? ORDER BY created_at, id',[reportId]);
      const {submitted_at,...report}=rows[0];
      // Personnel see who filed a submitted report (they can already view resident records),
      // e.g. to name the complainant on a blotter. Residents' own responses are unchanged.
      let reporter;
      if(req.user.role!=='resident'){
        const [people]=await db.execute('SELECT res.id AS resident_id, res.first_name, res.middle_name, res.last_name, res.contact_no, res.address, res.is_verified FROM residents res JOIN users u ON u.resident_id = res.id WHERE u.id = ?',[report.user_id]);
        reporter=people[0]||null;
      }
      res.json({success:true,report:{...report,submitted_at,edit_token:editToken(report,reportKeys),...(reporter!==undefined?{reporter}:{})},history});
    }),
    draft:run(async(req,res)=>res.status(201).json({success:true,report:await service.create(req.user.id,req.body,false)})),
    create:run(async(req,res)=>res.status(201).json({success:true,report:await service.create(req.user.id,req.body,true)})),
    update:run(async(req,res)=>res.json({success:true,...await service.save(id(req),req.user.id,req.body)})),
    submit:run(async(req,res)=>{empty(req.body);res.json({success:true,report:await service.submit(id(req),req.user.id)});}),
    cancel:run(async(req,res)=>{empty(req.body);res.json({success:true,...await service.cancel(id(req),req.user.id)});})
  };
};
