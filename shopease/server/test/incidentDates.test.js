const {test}=require('node:test');
const assert=require('node:assert/strict');
const {manilaNow,isFutureIncident}=require('../src/services/manilaTime');
const {reportService}=require('../src/services/reportService');
const {blotterService}=require('../src/services/blotterService');
// Validation runs before any query, so no database is touched.
const noDb={getConnection:()=>{throw new Error('database must not be reached');}};
const report={category_id:1,title:'Fictional concern',description:'Details',location:'Test street'};
const blotter={category_id:1,complainant_name:'Fictional complainant',narrative:'Details',location:'Test street'};
const later=minutes=>manilaNow(minutes*60*1000).slice(0,16);

test('Manila time is UTC+8 and allows a five-minute clock allowance',()=>{
  const now=Date.UTC(2026,10,20,16,30,0); // 2026-11-21 00:30 in Manila
  assert.equal(manilaNow(0,now),'2026-11-21T00:30:00');
  assert.equal(isFutureIncident('2026-11-21T00:34:59',now),false);
  assert.equal(isFutureIncident('2026-11-21T00:35:00',now),false);
  assert.equal(isFutureIncident('2026-11-21T00:35:01',now),true);
});
test('reports reject future incident dates for drafts and submissions',()=>{
  const service=reportService(noDb);
  for(const submit of [false,true]) assert.throws(()=>service.create(1,{...report,incident_date:later(60)},submit),{status:400,message:/cannot be in the future/});
  assert.throws(()=>service.create(1,{...report,incident_date:'2999-01-01T00:00'},true),{status:400});
});
test('blotters reject future incident dates; past dates still pass validation',async()=>{
  const service=blotterService(noDb);
  assert.throws(()=>service.create(7,{...blotter,incident_date:later(60)}),{status:400,message:/cannot be in the future/});
  // A valid past date gets past validation and reaches the (absent) database.
  await assert.rejects(service.create(7,{...blotter,incident_date:'2026-01-15T12:30'}),/database must not be reached/);
});
