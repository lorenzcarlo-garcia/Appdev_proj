const {editToken,reportKeys}=require('../services/editToken');
const { reportService, ReportError, fields, validId } = require('../services/reportService');
const {blotterService, BlotterError} = require('../services/blotterService');
module.exports = db => {
  const blotters=blotterService(db);
  const service=reportService(db);
  const run=handler=>async(req,res)=>{try {await handler(req,res);} catch(error) {if(error instanceof ReportError || error instanceof BlotterError) return res.status(error.status).json({success:false,message:error.message});throw error;}};
  const id=req=>{if(!validId(req.params.id)) throw new ReportError(400,'Invalid report ID');return Number(req.params.id);};
  const empty=body=>{if(body!==undefined && (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length)) throw new ReportError(400,'This operation does not accept report fields');};
  return {
    status:run(async(req,res)=>res.json({success:true,...await service.changeStatus(id(req),req.user.id,req.body)})),
    convert:run(async(req,res)=>res.status(201).json({success:true,blotter:await blotters.convert(id(req),req.user.id,req.body)})),
    list:run(async(req,res)=>{
      const {view='active',page='1',page_size='20',search='',status='',status_group='all',category_id}=req.query;
      if(typeof search!=='string' || [...search].length>255 || !['','Submitted','Under Investigation','Scheduled for Action','Resolved'].includes(status) || !['all','open','ongoing','resolved'].includes(status_group) || (category_id!==undefined && (typeof category_id!=='string' || !validId(category_id)))) throw new ReportError(400,'Invalid search, category or status filter');
      if(!['active','drafts','cancelled','all'].includes(view) || typeof page!=='string' || !/^[1-9]\d*$/.test(page) || Number(page)>1000000 || typeof page_size!=='string' || !/^[1-9]\d*$/.test(page_size) || Number(page_size)>100) throw new ReportError(400,'Invalid view or pagination');
      const clauses=[];const params=[];
      if(req.user.role==='resident') {clauses.push('user_id = ?');params.push(req.user.id);}
      else {if(view==='drafts') throw new ReportError(403,'Private drafts are not accessible');clauses.push("submission_stage = 'Submitted'");}
      if(view==='drafts') clauses.push("submission_stage = 'Draft'");
      if(view==='active') clauses.push("submission_stage = 'Submitted' AND cancelled_at IS NULL");
      if(view==='cancelled') clauses.push("submission_stage = 'Submitted' AND cancelled_at IS NOT NULL");
      if(category_id!==undefined){clauses.push('category_id = ?');params.push(Number(category_id));}
      if(status){clauses.push('status = ?');params.push(status);}
      if(status_group!=='all'){
        clauses.push("submission_stage = 'Submitted' AND cancelled_at IS NULL");
        if(status_group==='open')clauses.push("status = 'Submitted'");
        if(status_group==='ongoing')clauses.push("status IN ('Under Investigation','Scheduled for Action')");
        if(status_group==='resolved')clauses.push("status = 'Resolved'");
      }
      if(search.trim()){
        const pattern='%'+search.trim().replace(/[!%_]/g,value=>'!'+value)+'%';
        clauses.push("(CONCAT_WS(' ', title, reference_no, location, description) LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM incident_categories WHERE incident_categories.id = incident_reports.category_id AND incident_categories.name LIKE ? ESCAPE '!'))");params.push(pattern,pattern);
      }
      const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
      const [counts]=await db.execute('SELECT COUNT(*) AS total FROM incident_reports'+where,params);
      const [reports]=await db.execute(`SELECT ${fields} FROM incident_reports${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,[...params,Number(page_size),(Number(page)-1)*Number(page_size)]);
      res.json({success:true,reports,total:Number(counts[0].total),page:Number(page),page_size:Number(page_size)});
    }),
    detail:run(async(req,res)=>{
      const reportId=id(req);
      const condition=req.user.role==='resident'?' AND user_id = ?':" AND submission_stage = 'Submitted'";
      const params=req.user.role==='resident'?[reportId,req.user.id]:[reportId];
      const [rows]=await db.execute(`SELECT ${fields} FROM incident_reports WHERE id = ?${condition}`,params);
      if(!rows.length) throw new ReportError(404,'Report not found');
      const [history]=rows[0].submission_stage==='Draft'?[[]]:await db.execute('SELECT old_status, new_status, changed_by, remarks, created_at FROM report_status_history WHERE report_id = ? ORDER BY created_at, id',[reportId]);
      res.json({success:true,report:{...rows[0],edit_token:editToken(rows[0],reportKeys)},history});
    }),
    draft:run(async(req,res)=>res.status(201).json({success:true,report:await service.create(req.user.id,req.body,false)})),
    create:run(async(req,res)=>res.status(201).json({success:true,report:await service.create(req.user.id,req.body,true)})),
    update:run(async(req,res)=>res.json({success:true,...await service.save(id(req),req.user.id,req.body)})),
    submit:run(async(req,res)=>{empty(req.body);res.json({success:true,report:await service.submit(id(req),req.user.id)});}),
    cancel:run(async(req,res)=>{empty(req.body);res.json({success:true,...await service.cancel(id(req),req.user.id)});})
  };
};
