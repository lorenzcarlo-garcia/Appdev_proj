const {credentialTag}=require('../src/services/sessionCredentials');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const sharp=require('sharp');
const express=require('express');
const {attachmentService,normalizePhoto}=require('../src/services/attachmentService');
const {photoPath,maxBytes}=require('../src/config/uploads');
const owner={id:1,role:'resident'};
async function image() {return {buffer:await sharp({create:{width:20,height:10,channels:3,background:'red'}}).jpeg().withMetadata().toBuffer()};}
async function fixture(t) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'bantaylog-photos-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const state={report:{id:1,user_id:1,submission_stage:'Draft',status:null,cancelled_at:null},photos:[],nextId:1,failInsert:false,rollbacks:0};
  let queue=Promise.resolve();
  async function execute(sql,args) {
    if(sql.includes('FROM incident_reports')) return [[{...state.report}].filter(row=>row.id===args[0])];
    if(sql.startsWith('INSERT')) {
      if(state.failInsert) throw new Error('Synthetic database failure');
      const [report_id,uploaded_by,stored_name,mime_type,byte_size]=args;
      state.photos.push({id:state.nextId++,report_id,uploaded_by,stored_name,mime_type,byte_size,created_at:'2026-01-01'});return [{insertId:state.nextId-1}];
    }
    if(sql.startsWith('DELETE')) {state.photos=state.photos.filter(row=>!(row.report_id===args[0]&&row.id===args[1]));return [{affectedRows:1}];}
    if(sql.includes('COUNT(*)')) return [[{total:state.photos.filter(row=>row.report_id===args[0]).length}]];
    if(sql==='SELECT id FROM report_attachments WHERE stored_name = ?') return [state.photos.filter(row=>row.stored_name===args[0]).map(row=>({id:row.id}))];
    let rows=state.photos.filter(row=>row.report_id===args[0] && (args.length===1 || row.id===args[1]));
    if(sql.startsWith('SELECT stored_name')) return [rows.map(row=>({stored_name:row.stored_name}))];
    return [rows.map(({stored_name,uploaded_by,...row})=>({...row}))];
  }
  const db={execute,getConnection:async()=>{
    let unlock,snapshot;
    return {execute,beginTransaction:async()=>{const previous=queue;queue=new Promise(resolve=>{unlock=resolve;});await previous;snapshot=structuredClone(state.photos);},commit:async()=>unlock(),rollback:async()=>{state.rollbacks++;state.photos=snapshot;unlock();},release:()=>{}};
  }};
  return {state,directory,service:attachmentService(db,directory),db};
}
test('normalizes JPEG to bounded WebP and strips source metadata',async()=>{
  const buffer=await normalizePhoto(await image());const meta=await sharp(buffer).metadata();
  assert.equal(meta.format,'webp');assert.equal(meta.width,20);assert.equal(meta.exif,undefined);assert.equal(meta.icc,undefined);
});
test('rejects disguised, animated, oversized and over-pixel-limit images',async()=>{
  await assert.rejects(normalizePhoto({buffer:Buffer.from('<svg/>')}),{status:400});
  await assert.rejects(normalizePhoto({buffer:Buffer.alloc(maxBytes+1)}),{status:413});
  const large=await sharp({create:{width:5000,height:5000,channels:3,background:'red'}}).png().toBuffer();
  await assert.rejects(normalizePhoto({buffer:large}),{status:400});
  const animated=await sharp(Buffer.concat([Buffer.alloc(12,0),Buffer.alloc(12,255)]),{raw:{width:2,height:4,channels:3,pageHeight:2}}).webp({loop:0,delay:[100,100]}).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages,2);
  await assert.rejects(normalizePhoto({buffer:animated}),{status:400});
});
test('private drafts are hidden from other residents and all administrative roles',async t=>{
  const {service}=await fixture(t);
  for(const user of [{id:2,role:'resident'},...['staff','secretary','captain','super_admin'].map(role=>({id:3,role}))]) {
    await assert.rejects(service.list(1,user),{status:404});
    await assert.rejects(service.read(1,1,user),{status:404});
  }
});
test('owner uploads, lists, reads and removes a private photo without exposing paths',async t=>{
  const {service,directory}=await fixture(t);const photos=await service.add(1,owner,[await image()]);
  assert.equal(photos.length,1);assert.equal(photos[0].stored_name,undefined);assert.equal(photos[0].uploaded_by,undefined);
  assert.equal((await sharp(await service.read(1,photos[0].id,owner)).metadata()).format,'webp');
  await service.remove(1,photos[0].id,owner);assert.deepEqual(await service.list(1,owner),[]);assert.deepEqual(await fs.readdir(directory),[]);
});
test('serializes concurrent uploads and caps total photos at three',async t=>{
  const {service,state}=await fixture(t);const photo=await image();
  const results=await Promise.allSettled([service.add(1,owner,[photo,photo]),service.add(1,owner,[photo,photo])]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.status,409);assert.equal(state.photos.length,2);
});
test('invalid batch creates no files or metadata',async t=>{
  const {service,state,directory}=await fixture(t);
  await assert.rejects(service.add(1,owner,[await image(),{buffer:Buffer.from('bad')}]),{status:400});
  assert.equal(state.photos.length,0);assert.deepEqual(await fs.readdir(directory),[]);
});
test('database insert failure rolls back and removes only the newly written file',async t=>{
  const {service,state,directory}=await fixture(t);await service.add(1,owner,[await image()]);
  const before=await fs.readdir(directory);state.failInsert=true;
  await assert.rejects(service.add(1,owner,[await image()]));
  assert.equal(state.photos.length,1);assert.deepEqual(await fs.readdir(directory),before);assert.equal(state.rollbacks,1);
});
test('storage failure leaves metadata unchanged',async t=>{
  const {db,directory,state}=await fixture(t);const target=path.join(directory,'occupied');await fs.writeFile(target,'test');
  await assert.rejects(attachmentService(db,target).add(1,owner,[await image()]));assert.equal(state.photos.length,0);
});
test('submitted photos readable by staff; processing, cancellation and resolution block writes',async t=>{
  const {service,state}=await fixture(t);await service.add(1,owner,[await image()]);state.report.submission_stage='Submitted';state.report.status='Submitted';
  for(const role of ['staff','secretary','captain','super_admin']) {
    const user={id:3,role};assert.equal((await service.list(1,user)).length,1);assert.ok((await service.read(1,1,user)).length);
    await assert.rejects(service.remove(1,1,user),{status:403});
  }
  for(const status of ['Under Investigation','Scheduled for Action','Resolved']) {
    state.report.status=status;
    await assert.rejects(service.add(1,owner,[await image()]),{status:409});await assert.rejects(service.remove(1,1,owner),{status:409});
    assert.equal((await service.list(1,owner)).length,1);
  }
  state.report.status='Submitted';state.report.cancelled_at='2026-01-01';
  await assert.rejects(service.add(1,owner,[await image()]),{status:409});await assert.rejects(service.remove(1,1,owner),{status:409});
});
test('report state is rechecked inside the upload transaction',async t=>{
  const {service,state,db}=await fixture(t);const original=db.getConnection;
  db.getConnection=async()=>{state.report.status='Resolved';state.report.submission_stage='Submitted';return original();};
  await assert.rejects(service.add(1,owner,[await image()]),{status:409});assert.equal(state.photos.length,0);
});
test('invalid identifiers and stored names cannot select arbitrary files',async t=>{
  const {service}=await fixture(t);
  for(const id of ['../1','0','4294967296']) await assert.rejects(service.list(id,owner),{status:400});
  assert.throws(()=>photoPath(os.tmpdir(),'../secret.env'));await assert.rejects(service.read(1,123,owner),{status:404});
});
test('multipart middleware enforces size, count and field allowlist',async t=>{
  const app=express();app.post('/',require('../src/middleware/photoUpload'),(req,res)=>res.json({count:req.files.length}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;
  const photo=await image();
  for(const [field,files,status] of [['photos',[photo.buffer],200],['photos',Array(3).fill(photo.buffer),200],['photos',Array(4).fill(photo.buffer),400],['other',[photo.buffer],400],['photos',[Buffer.alloc(maxBytes+1)],413]]) {
    const form=new FormData();for(const buffer of files) form.append(field,new Blob([buffer],{type:'image/jpeg'}),'image.jpg');
    assert.equal((await fetch(url,{method:'POST',body:form})).status,status);
  }
});

test('protected HTTP routes require sessions and CSRF, serve private images, and hide drafts',async t=>{
  const {db,directory,state}=await fixture(t);
  const {createApp}=require('../src/server');const session=require('express-session');const {createHmac}=require('node:crypto');
  const original=db.execute;
  db.execute=async(sql,args)=>sql.startsWith('SELECT id, email') ? [[{id:args[0],password_hash:'synthetic-resource-hash',email:'test@example.invalid',role:args[0]===1?'resident':args[0]===2?'resident':'staff',is_active:1}]] : original(sql,args);
  const config={clientOrigin:'http://localhost:5173',sessionSecret:'synthetic-attachment-secret-longer-than-32-bytes',production:false};
  const store=new session.MemoryStore();const app=createApp({db,config,sessionStore:store,uploadDirectory:directory});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.clear();});
  const base=`http://127.0.0.1:${server.address().port}`;const route='/api/reports/1/attachments';const csrf='a'.repeat(64);const cookies={};
  for(const id of [1,2,3]) {
    const sid=`photo-test-${id}`;
    await new Promise(resolve=>store.set(sid,{cookie:{expires:new Date(Date.now()+60000),originalMaxAge:60000,path:'/'},userId:id,credentialTag:credentialTag('synthetic-resource-hash'),csrfToken:csrf},resolve));
    const signature=createHmac('sha256',config.sessionSecret).update(sid).digest('base64').replace(/=+$/,'');
    cookies[id]='bantaylog.sid='+encodeURIComponent('s:'+sid+'.'+signature);
  }
  async function request(user,url=route,options={}) {return fetch(base+url,{...options,headers:{Cookie:cookies[user]||'',...options.headers}});}
  assert.equal((await request(0)).status,401);
  for(const id of [2,3]) assert.equal((await request(id)).status,404);
  assert.equal((await request(1,route,{method:'POST'})).status,403);
  assert.equal((await request(1,route,{method:'POST',headers:{'X-CSRF-Token':csrf,Origin:'http://untrusted.invalid'}})).status,403);
  const data=new FormData();data.append('photos',new Blob([(await image()).buffer],{type:'image/jpeg'}),'../../private.env');
  const added=await request(1,route,{method:'POST',headers:{'X-CSRF-Token':csrf,Origin:config.clientOrigin},body:data});
  assert.equal(added.status,201);const body=await added.json();assert.equal(body.attachments[0].stored_name,undefined);
  const response=await request(1,route+'/'+body.attachments[0].id);
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal((await request(0,route+'/1')).status,401);assert.equal((await request(2,route+'/1')).status,404);
  assert.equal((await request(1,'/storage/report-photos/'+state.photos[0].stored_name)).status,404);
  state.report.submission_stage='Submitted';state.report.status='Submitted';
  assert.equal((await request(3,route+'/1')).status,200);
  assert.equal((await request(3,route+'/1',{method:'DELETE',headers:{'X-CSRF-Token':csrf}})).status,403);
});
