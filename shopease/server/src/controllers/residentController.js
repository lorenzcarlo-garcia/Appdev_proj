const {editToken,guardEdit,residentKeys}=require('../services/editToken');
const fields = "id, first_name, middle_name, last_name, DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth_date, contact_no, address, is_verified, verified_by, verified_at, created_by, created_at, updated_at";
const validId = value => /^[1-9]\d*$/.test(value) && Number(value) <= 4294967295;
const invalid = message => ({ status: 400, body: { success: false, message } });
const missing = () => ({ status: 404, body: { success: false, message: 'Resident not found' } });
const linked = () => ({ status: 409, body: { success: false, message: 'Resident is linked to an account and cannot be deleted' } });
const send = (res, result) => res.status(result.status).json(result.body);
const {validate}=require('../services/residentValidation');
function residentController(db) {
  async function transaction(work) {
    const connection = await db.getConnection();
    let begun = false;
    try {
      await connection.beginTransaction(); begun = true;
      const result = await work(connection);
      await connection.commit(); begun = false;
      return result;
    } catch (error) {
      if (begun) await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }
  return {
    list: async (req, res) => {
      const { search = '', page = '1', page_size = '20' } = req.query;
      if (typeof search !== 'string' || [...search].length > 255 || typeof page !== 'string' || !/^[1-9]\d*$/.test(page) || Number(page) > 1000000 || typeof page_size !== 'string' || !/^[1-9]\d*$/.test(page_size) || Number(page_size) > 100) {
        return send(res, invalid('Invalid search or pagination; page_size must be 1-100'));
      }
      const pattern = '%' + search.trim().replace(/[!%_]/g, value => '!' + value) + '%';
      const where = "WHERE CONCAT_WS(' ', first_name, middle_name, last_name) LIKE ? ESCAPE '!' OR address LIKE ? ESCAPE '!'";
      const [counts] = await db.execute(`SELECT COUNT(*) AS total FROM residents ${where}`, [pattern, pattern]);
      const [residents] = await db.execute(`SELECT ${fields} FROM residents ${where} ORDER BY last_name, first_name, id LIMIT ? OFFSET ?`, [pattern, pattern, Number(page_size), (Number(page)-1)*Number(page_size)]);
      res.json({ success:true, residents:residents.map(row=>({...row,edit_token:editToken(row,residentKeys)})), page:Number(page), page_size:Number(page_size), total:Number(counts[0].total) });
    },
    detail: async (req, res) => {
      if (!validId(req.params.id)) return send(res, invalid('Invalid resident ID'));
      const [rows] = await db.execute(`SELECT ${fields} FROM residents WHERE id = ?`, [Number(req.params.id)]);
      if (!rows.length) return send(res, missing());
      res.json({ success:true, resident:{...rows[0],edit_token:editToken(rows[0],residentKeys)} });
    },
    create: async (req, res) => {
      const data = validate(req.body);
      if (!data) return send(res, invalid('Provide valid first name, last name, address, and optional middle name, birth date, and contact number; audit and verification fields cannot be supplied'));
      const [result] = await db.execute('INSERT INTO residents (first_name, middle_name, last_name, birth_date, contact_no, address, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', [data.first_name,data.middle_name,data.last_name,data.birth_date,data.contact_no,data.address,req.user.id]);
      res.status(201).json({ success:true, resident:{id:result.insertId,...data,is_verified:0,created_by:req.user.id} });
    },
    update: async (req, res) => {
      if (!validId(req.params.id)) return send(res, invalid('Invalid resident ID'));
      const {expected_token,...details}=req.body && typeof req.body==='object' && !Array.isArray(req.body)?req.body:{};
      const data = validate(details);
      if (!data) return send(res, invalid('Provide valid resident details; audit and verification fields cannot be supplied'));
      const id = Number(req.params.id);
      if(expected_token!==undefined){
        await transaction(async c=>{const [rows]=await c.execute(`SELECT ${fields} FROM residents WHERE id = ? FOR UPDATE`,[id]);if(!rows.length){throw new (require('../services/editToken').EditConflictError)(404,'Resident not found');}guardEdit(rows[0],expected_token,residentKeys);await c.execute('UPDATE residents SET first_name = ?, middle_name = ?, last_name = ?, birth_date = ?, contact_no = ?, address = ? WHERE id = ?',[data.first_name,data.middle_name,data.last_name,data.birth_date,data.contact_no,data.address,id]);});
        return res.json({success:true,message:'Resident updated'});
      }
      const [result] = await db.execute('UPDATE residents SET first_name = ?, middle_name = ?, last_name = ?, birth_date = ?, contact_no = ?, address = ? WHERE id = ?', [data.first_name,data.middle_name,data.last_name,data.birth_date,data.contact_no,data.address,id]);
      if (!result.affectedRows) {
        const [rows] = await db.execute('SELECT id FROM residents WHERE id = ?', [id]);
        if (!rows.length) return send(res, missing());
      }
      res.json({ success:true, message:'Resident updated' });
    },
    verification: async (req, res) => {
      if (!validId(req.params.id)) return send(res, invalid('Invalid resident ID'));
      const body = req.body;
      if (!body || typeof body.is_verified !== 'boolean' || Object.keys(body).some(key => !['is_verified','expected_token'].includes(key))) return send(res, invalid('Provide only boolean is_verified'));
      const result = await transaction(async connection => {
        const id = Number(req.params.id);
        const [rows] = await connection.execute(body.expected_token===undefined?'SELECT id, is_verified FROM residents WHERE id = ? FOR UPDATE':`SELECT ${fields} FROM residents WHERE id = ? FOR UPDATE`, [id]);
        if (!rows.length) return missing();
        guardEdit(rows[0],body.expected_token,residentKeys);
        if (Boolean(rows[0].is_verified) !== body.is_verified) {
          if (body.is_verified) await connection.execute('UPDATE residents SET is_verified = ?, verified_by = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ?', [1,req.user.id,id]);
          else await connection.execute('UPDATE residents SET is_verified = ?, verified_by = NULL, verified_at = NULL WHERE id = ?', [0,id]);
        }
        return {status:200,body:{success:true,message:body.is_verified ? 'Resident verified' : 'Resident verification cleared'}};
      });
      send(res,result);
    },
    remove: async (req, res) => {
      if (!validId(req.params.id)) return send(res, invalid('Invalid resident ID'));
      if (!req.body || req.body.confirm !== true || Object.keys(req.body).some(key => key !== 'confirm')) return send(res, invalid('Explicit confirmation is required: confirm must be true'));
      try {
        const result = await transaction(async connection => {
          const id = Number(req.params.id);
          // Lock the parent row: new account links must wait for this transaction.
          // The users.resident_id foreign key is the final database-level protection.
          const [residents] = await connection.execute('SELECT id FROM residents WHERE id = ? FOR UPDATE', [id]);
          if (!residents.length) return missing();
          const [users] = await connection.execute('SELECT id FROM users WHERE resident_id = ? LIMIT 1', [id]);
          if (users.length) return linked();
          await connection.execute('DELETE FROM residents WHERE id = ?', [id]);
          return {status:200,body:{success:true,message:'Resident deleted'}};
        });
        send(res,result);
      } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') return send(res,linked());
        throw error;
      }
    }
  };
}
module.exports = residentController;
