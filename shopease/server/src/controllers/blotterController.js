const {editToken,blotterKeys}=require('../services/editToken');
const {blotterService, BlotterError, fields} = require('../services/blotterService');
const {validId} = require('../services/reportService');
module.exports = db => {
  const service = blotterService(db);
  const run = handler => async (req,res) => {
    try { await handler(req,res); }
    catch (error) { if (error instanceof BlotterError) return res.status(error.status).json({success:false,message:error.message}); throw error; }
  };
  const id = req => { if (!validId(req.params.id)) throw new BlotterError(400,'Invalid blotter ID'); return Number(req.params.id); };
  return {
    list: run(async (req,res) => {
      const {view='active',search='',page='1',page_size='20',category_id,report_id} = req.query;
      if (!['active','archived','all'].includes(view) || typeof search !== 'string' || [...search].length > 255 || typeof page !== 'string' || !/^[1-9]\d*$/.test(page) || Number(page) > 1000000 || typeof page_size !== 'string' || !/^[1-9]\d*$/.test(page_size) || Number(page_size) > 100 || (category_id !== undefined && (typeof category_id !== 'string' || !validId(category_id)))) throw new BlotterError(400,'Invalid search, filter, or pagination');
      if(report_id!==undefined && (typeof report_id!=='string' || !validId(report_id))) throw new BlotterError(400,'Invalid report filter');
      const clauses = [], params = [];
      if(report_id!==undefined){clauses.push('report_id = ?');params.push(Number(report_id));}
      if (view === 'active') clauses.push('archived_at IS NULL');
      if (view === 'archived') clauses.push('archived_at IS NOT NULL');
      if (category_id !== undefined) { clauses.push('category_id = ?'); params.push(Number(category_id)); }
      if (search.trim()) {
        clauses.push("CONCAT_WS(' ', blotter_no, complainant_name, respondent_name, narrative, location) LIKE ? ESCAPE '!'");
        params.push('%' + search.trim().replace(/[!%_]/g, value => '!' + value) + '%');
      }
      const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
      const [counts] = await db.execute('SELECT COUNT(*) AS total FROM blotter_records' + where, params);
      const [blotters] = await db.execute(`SELECT ${fields} FROM blotter_records${where} ORDER BY incident_date DESC, id DESC LIMIT ? OFFSET ?`, [...params,Number(page_size),(Number(page)-1)*Number(page_size)]);
      res.json({success:true,blotters:blotters.map(row=>({...row,edit_token:editToken(row,blotterKeys)})),total:Number(counts[0].total),page:Number(page),page_size:Number(page_size)});
    }),
    detail: run(async (req,res) => {
      const [rows] = await db.execute(`SELECT ${fields} FROM blotter_records WHERE id = ?`, [id(req)]);
      if (!rows.length) throw new BlotterError(404,'Blotter record not found');
      res.json({success:true,blotter:{...rows[0],edit_token:editToken(rows[0],blotterKeys)}});
    }),
    create: run(async (req,res) => res.status(201).json({success:true,blotter:await service.create(req.user,req.body)})),
    update: run(async (req,res) => res.json({success:true,...await service.update(id(req),req.user,req.body)})),
    archive: run(async (req,res) => res.json({success:true,...await service.archive(id(req),req.user,req.body)}))
  };
};
