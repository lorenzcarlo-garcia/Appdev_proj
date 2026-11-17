const fs = require('node:fs/promises');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const sharp = require('sharp');
const uploads = require('../config/uploads');
class AttachmentError extends Error {
  constructor(status,message) {super(message);this.status=status;}
}
const publicFields = 'id, report_id, mime_type, byte_size, created_at';
function validId(value) {return /^[1-9]\d*$/.test(String(value)) && Number(value)<=4294967295;}
async function normalizePhoto(file) {
  if (!file?.buffer?.length || file.buffer.length > uploads.maxBytes) throw new AttachmentError(413,'Each photo must be no larger than 5 MB.');
  try {
    const image=sharp(file.buffer,{limitInputPixels:20000000,failOn:'warning'});
    const meta=await image.metadata();
    if (!['jpeg','png','webp'].includes(meta.format) || (meta.pages || 1)>1) throw new Error('Unsupported image');
    const buffer=await image.rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
    if (buffer.length>uploads.maxBytes) throw new Error('Image too large');
    return buffer;
  } catch {throw new AttachmentError(400,'Use a valid, non-animated JPEG, PNG or WebP photo of at most 20 megapixels.');}
}
function attachmentService(db, directory=uploads.root) {
  async function authorize(connection,reportId,user,write=false,lock=false) {
    if (!validId(reportId)) throw new AttachmentError(400,'Invalid report ID');
    const [rows]=await connection.execute('SELECT id, user_id, submission_stage, status, cancelled_at FROM incident_reports WHERE id = ?'+(lock?' FOR UPDATE':''),[Number(reportId)]);
    const report=rows[0];
    const roles=['staff','secretary','captain','super_admin'];
    const permitted=report && (user.role==='resident' ? report.user_id===user.id : roles.includes(user.role) && report.submission_stage==='Submitted');
    if (!permitted) throw new AttachmentError(404,'Report not found');
    if (write && (user.role!=='resident' || report.user_id!==user.id)) throw new AttachmentError(403,'Only the report owner can change photos');
    if (write && (report.cancelled_at || !(report.submission_stage==='Draft' || report.status==='Submitted'))) throw new AttachmentError(409,'Photos can no longer be changed for this report');
    return report;
  }
  async function list(reportId,user) {
    await authorize(db,reportId,user);
    const [rows]=await db.execute(`SELECT ${publicFields} FROM report_attachments WHERE report_id = ? ORDER BY id`,[Number(reportId)]);
    return rows;
  }
  async function add(reportId,user,files) {
    if (!files?.length || files.length>3) throw new AttachmentError(400,'Choose between 1 and 3 photos');
    // Check access before image processing, then again under the report row lock.
    await authorize(db,reportId,user,true);
    const buffers=[];
    for (const file of files) buffers.push(await normalizePhoto(file));
    const connection=await db.getConnection();const written=[];
    try {
      await connection.beginTransaction();
      await authorize(connection,reportId,user,true,true);
      const [counts]=await connection.execute('SELECT COUNT(*) AS total FROM report_attachments WHERE report_id = ?',[Number(reportId)]);
      if (Number(counts[0].total)+buffers.length>3) throw new AttachmentError(409,'A report can have at most 3 photos');
      await fs.mkdir(directory,{recursive:true});
      for (const buffer of buffers) {
        const name=randomBytes(16).toString('hex')+'.webp';const target=uploads.photoPath(directory,name);
        const handle=await fs.open(target,'wx',0o600);written.push(target);
        try {await handle.writeFile(buffer);} finally {await handle.close();}
        await connection.execute('INSERT INTO report_attachments (report_id, uploaded_by, stored_name, mime_type, byte_size) VALUES (?, ?, ?, ?, ?)',[Number(reportId),user.id,name,'image/webp',buffer.length]);
      }
      const [rows]=await connection.execute(`SELECT ${publicFields} FROM report_attachments WHERE report_id = ? ORDER BY id`,[Number(reportId)]);
      await connection.commit();return rows;
    } catch(error) {
      await connection.rollback();
      // A failed/uncertain commit may have persisted metadata. Never remove a
      // newly written file unless a fresh query confirms it is unreferenced.
      for (const target of written) {
        try {
          const name=path.basename(target);
          const [rows]=await db.execute('SELECT id FROM report_attachments WHERE stored_name = ?',[name]);
          if (!rows.length) await fs.unlink(target);
        } catch {console.error('Photo cleanup requires administrator review');}
      }
      throw error;
    } finally {connection.release();}
  }
  async function read(reportId,attachmentId,user) {
    await authorize(db,reportId,user);
    if (!validId(attachmentId)) throw new AttachmentError(400,'Invalid photo ID');
    const [rows]=await db.execute('SELECT stored_name FROM report_attachments WHERE report_id = ? AND id = ?',[Number(reportId),Number(attachmentId)]);
    if (!rows.length) throw new AttachmentError(404,'Photo not found');
    try {return await fs.readFile(uploads.photoPath(directory,rows[0].stored_name));}
    catch(error) {if (error.code==='ENOENT') throw new AttachmentError(404,'Photo file unavailable');throw error;}
  }
  async function remove(reportId,attachmentId,user) {
    if (!validId(attachmentId)) throw new AttachmentError(400,'Invalid photo ID');
    const connection=await db.getConnection();
    try {
      await connection.beginTransaction();await authorize(connection,reportId,user,true,true);
      const [rows]=await connection.execute('SELECT stored_name FROM report_attachments WHERE report_id = ? AND id = ?',[Number(reportId),Number(attachmentId)]);
      if (!rows.length) throw new AttachmentError(404,'Photo not found');
      await connection.execute('DELETE FROM report_attachments WHERE report_id = ? AND id = ?',[Number(reportId),Number(attachmentId)]);
      await connection.commit();
      // Remove metadata first: rollback can never leave a live record with a
      // missing file. A cleanup failure retains an inaccessible private orphan.
      try {await fs.unlink(uploads.photoPath(directory,rows[0].stored_name));}
      catch(error) {if(error.code!=='ENOENT') console.error('Removed photo file cleanup requires administrator review');}
    } catch(error) {await connection.rollback();throw error;}
    finally {connection.release();}
  }
  return {authorize,list,add,read,remove};
}
module.exports={attachmentService,AttachmentError,normalizePhoto};
