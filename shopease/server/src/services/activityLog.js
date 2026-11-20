// Append-only record of barangay actions. Callers pass the transaction connection so the
// entry commits or rolls back together with the action it describes.
// Only generated, non-personal text is stored: never remarks, resident names, contact
// details, passwords, reset codes, tokens or request bodies.
const entityTypes = ['report','blotter','community_update','resident','category','area','staff_account'];
const clip = (value, max) => value == null ? null : [...String(value)].slice(0, max).join('');

async function logActivity(connection, actor, {action, entityType, entityId = null, entityRef = null, detail = null, visibility = 'administrative'}) {
  if (!actor?.id || !actor.role) throw new Error('Activity actor is required');
  if (!entityTypes.includes(entityType)) throw new Error('Unknown activity entity type');
  await connection.execute(
    'INSERT INTO activity_log (actor_id, actor_role, action, entity_type, entity_id, entity_ref, detail, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [actor.id, actor.role, action, entityType, entityId, clip(entityRef, 160), clip(detail, 255), visibility]
  );
}

const reportRef = row => row.reference_no || `Report #${row.id}`;
module.exports = {logActivity, entityTypes, reportRef};
