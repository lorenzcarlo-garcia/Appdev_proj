const {editToken,guardEdit,categoryKeys}=require('../services/editToken');
const {logActivity}=require('../services/activityLog');
const fields = 'id, name, description, is_active, created_at, updated_at';
const administrativeRoles = ['staff', 'secretary', 'captain', 'super_admin'];
const validId = value => /^[1-9]\d*$/.test(value) && Number(value) <= 4294967295;
function validate(body, update) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const allowed = update ? ['name', 'description', 'is_active'] : ['name', 'description'];
  if (Object.keys(body).some(key => !allowed.includes(key))) return null;
  if (typeof body.name !== 'string') return null;
  const name = body.name.trim();
  if (!name || [...name].length > 100) return null;
  if (body.description != null && typeof body.description !== 'string') return null;
  const description = body.description?.trim() || null;
  if (description && [...description].length > 255) return null;
  if (update && body.is_active !== undefined && typeof body.is_active !== 'boolean') return null;
  return { name, description, is_active: body.is_active };
}
function categoryController(db) {
  async function transaction(work) {
    const c = await db.getConnection(); let begun = false;
    try { await c.beginTransaction(); begun = true; const result = await work(c); await c.commit(); begun = false; return result; }
    catch (error) { if (begun) await c.rollback(); throw error; }
    finally { c.release(); }
  }
  return {
    list: async (req, res) => {
      if (req.query.include_inactive !== undefined && !['true', 'false'].includes(req.query.include_inactive)) {
        return res.status(400).json({ success: false, message: 'include_inactive must be true or false' });
      }
      const includeInactive = req.query.include_inactive === 'true';
      if (includeInactive && !administrativeRoles.includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      const [categories] = await db.execute(
        `SELECT ${fields} FROM incident_categories WHERE (? = 1 OR is_active = 1) ORDER BY name, id`,
        [includeInactive ? 1 : 0]
      );
      res.json({ success: true, categories:categories.map(row=>({...row,edit_token:editToken(row,categoryKeys)})) });
    },
    detail: async (req, res) => {
      if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid category ID' });
      const [rows] = await db.execute(`SELECT ${fields} FROM incident_categories WHERE id = ?`, [Number(req.params.id)]);
      const category = rows[0];
      if (!category || (!category.is_active && !administrativeRoles.includes(req.user.role))) {
        return res.status(404).json({ success: false, message: 'Category not found' });
      }
      res.json({ success: true, category:{...category,edit_token:editToken(category,categoryKeys)} });
    },
    create: async (req, res) => {
      const data = validate(req.body, false);
      if (!data) return res.status(400).json({ success: false, message: 'Name (1-100 characters) and optional description (up to 255 characters) are required; unexpected fields are not allowed' });
      try {
        const id = await transaction(async c => {
          const [result] = await c.execute('INSERT INTO incident_categories (name, description) VALUES (?, ?)', [data.name, data.description]);
          await logActivity(c, req.user, {action:'category.created', entityType:'category', entityId:result.insertId, entityRef:data.name});
          return result.insertId;
        });
        res.status(201).json({ success: true, category: { id, name: data.name, description: data.description, is_active: 1 } });
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Category name already exists' });
        throw error;
      }
    },
    update: async (req, res) => {
      if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid category ID' });
      const {expected_token,...details}=req.body && typeof req.body==='object' && !Array.isArray(req.body)?req.body:{};
      const data = validate(details, true);
      if (!data) return res.status(400).json({ success: false, message: 'Provide a valid name, optional description, and optional boolean is_active; unexpected fields are not allowed' });
      const id = Number(req.params.id);
      try {
        const found = await transaction(async c => {
          const [rows] = await c.execute(`SELECT ${fields} FROM incident_categories WHERE id = ? FOR UPDATE`, [id]);
          if (!rows.length) return false;
          guardEdit(rows[0], expected_token, categoryKeys);
          await c.execute('UPDATE incident_categories SET name = ?, description = ?, is_active = COALESCE(?, is_active) WHERE id = ?', [data.name, data.description, data.is_active === undefined ? null : Number(data.is_active), id]);
          const activeChanged = data.is_active !== undefined && Boolean(rows[0].is_active) !== data.is_active;
          await logActivity(c, req.user, {action:'category.updated', entityType:'category', entityId:id, entityRef:data.name, detail:activeChanged ? (data.is_active ? 'Reactivated' : 'Deactivated') : 'Details edited'});
          return true;
        });
        if (!found) return res.status(404).json({ success: false, message: 'Category not found' });
        res.json({ success: true, message: 'Category updated' });
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Category name already exists' });
        throw error;
      }
    }
  };
}
module.exports = categoryController;
