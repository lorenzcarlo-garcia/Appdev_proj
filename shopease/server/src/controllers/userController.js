const {userService, UserError, roles, fields} = require('../services/userService');
const {validId} = require('../services/reportService');
module.exports = db => {
  const service = userService(db);
  const run = handler => async (req,res) => {
    try { await handler(req,res); }
    catch (error) { if (error instanceof UserError) return res.status(error.status).json({success:false,message:error.message}); throw error; }
  };
  return {
    list: run(async (req,res) => {
      const {search='', role='all', state='all', page='1', page_size='20'} = req.query;
      if (typeof search !== 'string' || search.length > 150 || !['all',...roles].includes(role) || !['all','active','inactive'].includes(state) || typeof page !== 'string' || !/^[1-9]\d*$/.test(page) || Number(page) > 1000000 || typeof page_size !== 'string' || !/^[1-9]\d*$/.test(page_size) || Number(page_size) > 100) throw new UserError(400,'Invalid account filters or pagination');
      const clauses = ['role IN (?, ?, ?)', 'resident_id IS NULL'];
      const params = [...roles];
      if (role !== 'all') { clauses.push('role = ?'); params.push(role); }
      if (state !== 'all') { clauses.push('is_active = ?'); params.push(state === 'active' ? 1 : 0); }
      if (search.trim()) { clauses.push("email LIKE ? ESCAPE '!'"); params.push('%' + search.trim().replace(/[!%_]/g, value => '!' + value) + '%'); }
      const where = ' WHERE ' + clauses.join(' AND ');
      const [counts] = await db.execute('SELECT COUNT(*) AS total FROM users' + where, params);
      const [users] = await db.execute(`SELECT ${fields} FROM users${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...params,Number(page_size),(Number(page)-1)*Number(page_size)]);
      res.json({success:true,users,total:Number(counts[0].total),page:Number(page),page_size:Number(page_size)});
    }),
    create: run(async (req,res) => res.status(201).json({success:true,user:await service.create(req.user,req.body)})),
    update: run(async (req,res) => {
      if (!validId(req.params.id)) throw new UserError(400,'Invalid account ID');
      res.json({success:true,user:await service.update(Number(req.params.id),req.user,req.body)});
    })
  };
};
