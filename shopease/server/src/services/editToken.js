const {createHash}=require('node:crypto');
const residentKeys=['first_name','middle_name','last_name','birth_date','contact_no','address'];
const categoryKeys=['name','description','is_active'];
const blotterKeys=['category_id','complainant_name','respondent_name','narrative','incident_date','location','archived_at'];
const reportKeys=['category_id','title','description','location','incident_date','submission_stage','status','cancelled_at'];
class EditConflictError extends Error{constructor(status,message){super(message);this.status=status;}}
function editToken(row,keys){return createHash('sha256').update(JSON.stringify(keys.map(key=>row[key] instanceof Date?row[key].toISOString():row[key]??null))).digest('hex');}
function guardEdit(row,expected,keys){
 if(expected===undefined)return; // Compatibility for existing API clients.
 if(typeof expected!=='string' || !/^[a-f0-9]{64}$/.test(expected))throw new EditConflictError(400,'Invalid edit confirmation');
 if(expected!==editToken(row,keys))throw new EditConflictError(409,'This record changed after you opened it. Reload the latest record before saving.');
}
module.exports={editToken,guardEdit,EditConflictError,residentKeys,categoryKeys,blotterKeys,reportKeys};
