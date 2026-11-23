import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
import {validateReport,reportPayload} from '../src/utils/validation.js';
let vite,Routes,AuthContext,ResolutionBar,VolumeChart,ActivityList,format;
before(async()=>{
  vite=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});
  ({AppRoutes:Routes}=await vite.ssrLoadModule('/src/App.jsx'));
  ({AuthContext}=await vite.ssrLoadModule('/src/context/authContext.js'));
  ResolutionBar=(await vite.ssrLoadModule('/src/components/dashboard/ResolutionBar.jsx')).default;
  VolumeChart=(await vite.ssrLoadModule('/src/components/dashboard/VolumeChart.jsx')).default;
  ActivityList=(await vite.ssrLoadModule('/src/components/activity/ActivityList.jsx')).default;
  format=await vite.ssrLoadModule('/src/components/dashboard/chartFormat.js');
});
after(async()=>{await vite?.close();});
const route=(path,role)=>renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:[path]},createElement(AuthContext.Provider,{value:{user:role?{id:1,email:'route-test@example.invalid',role}:null,loading:false,error:'',refresh:async()=>{},logout:async()=>{},changePassword:async()=>{}}},createElement(Routes))));
const plain=element=>renderToStaticMarkup(createElement(MemoryRouter,null,element));

test('resolution bar shows an explicit X of Y for the same cohort and no percentage for an empty period',()=>{
  const html=plain(createElement(ResolutionBar,{cohort:{received:30,awaiting:8,ongoing:4,resolved:18}}));
  assert.match(html,/18 of 30/);assert.match(html,/\(60%\)/);assert.match(html,/aria-valuemax="30"/);
  const empty=plain(createElement(ResolutionBar,{cohort:{received:0,awaiting:0,ongoing:0,resolved:0}}));
  assert.doesNotMatch(empty,/%/);assert.match(empty,/No reports were received/);
});
test('volume chart shows a genuine empty state and a readable text table for every bucket',()=>{
  const series=[{bucket:'2026-11-16',total:2},{bucket:'2026-11-23',total:0}];
  const html=plain(createElement(VolumeChart,{series,granularity:'week'}));
  assert.match(html,/Week of Nov 16/);assert.match(html,/Week of Nov 23/);
  assert.equal((html.match(/<tr>/g)||[]).length,3,'header plus one row per bucket, including zero');
  assert.match(plain(createElement(VolumeChart,{series:[{bucket:'2026-11-16',total:0}],granularity:'day'})),/No reports were received in this period/);
});
test('bucket labels come from the Manila date key, not the browser time zone',()=>{
  assert.equal(format.bucketLabel('2026-11-01','month'),'Nov 2026');
  assert.equal(format.shortBucketLabel('2026-01-01','year'),'2026');
  assert.equal(format.bucketLabel('2026-11-16','day'),format.shortBucketLabel('2026-11-16','day'));
});
test('activity entries show the role; only Captain/Super Admin get a clickable "By ..." and no email is ever inline',()=>{
  const entry={id:1,actor_id:7,actor_role:'secretary',actor_email:'person@example.invalid',action:'report.status_changed',entity_type:'report',entity_id:9,entity_ref:'RPT-2026-000009',detail:'Submitted → Under Investigation',created_at:'2026-11-18T02:00:00.000Z'};
  const html=plain(createElement(ActivityList,{entries:[entry]}));
  assert.match(html,/Report status changed/);assert.match(html,/By Secretary/);assert.match(html,/href="\/admin\/reports\/9"/);
  assert.doesNotMatch(html,/person@example/);
  assert.doesNotMatch(html,/<button/,'staff see plain text');
  const inspect=plain(createElement(ActivityList,{entries:[entry],canInspect:true}));
  assert.match(inspect,/<button type="button" class="text-link" aria-haspopup="dialog">By Secretary<\/button>/);
  assert.doesNotMatch(inspect,/person@example/,'details load only in the panel');
  assert.doesNotMatch(plain(createElement(ActivityList,{entries:[{...entry,actor_id:undefined}],canInspect:true})),/<button/,'no person id, no link');
});
test('report form requires an active area only when areas exist, and sends area_id',()=>{
  const form={category_id:'1',title:'Concern',description:'Details',location:'Street',area_id:'',incident_date:'2026-01-15T12:30'};
  const base={submit:true,activeCategoryIds:[1],activeAreaIds:[3]};
  assert.equal(validateReport(form,{...base,areaRequired:false}).area_id,undefined);
  assert.match(validateReport(form,{...base,areaRequired:true}).area_id,/area or purok/);
  assert.match(validateReport({...form,area_id:'4'},{...base,areaRequired:true}).area_id,/no longer available/);
  assert.deepEqual(validateReport({...form,area_id:'3'},{...base,areaRequired:true}),{});
  assert.equal(reportPayload({...form,area_id:'3'}).area_id,3);assert.equal(reportPayload(form).area_id,null);
});
test('areas page is limited to Secretary/Super Admin; activity log is open to all personnel only',()=>{
  for(const role of ['secretary','super_admin']) assert.doesNotMatch(route('/admin/areas',role),/You do not have access/);
  for(const role of ['staff','captain']) assert.match(route('/admin/areas',role),/You do not have access/);
  for(const role of ['staff','secretary','captain','super_admin']) assert.match(route('/admin/activity',role),/Activity log/);
  assert.match(route('/admin/activity','resident'),/You do not have access/);
});
test('terms and privacy drafts are readable before sign-in and say they are drafts',()=>{
  for(const [path,title] of [['/terms','Terms and Conditions'],['/privacy','Privacy Notice']]){
    const html=route(path,null);
    assert.match(html,new RegExp(title));assert.match(html,/Draft for barangay review/);
    assert.doesNotMatch(html,/fully compliant|complies with/i);
  }
  assert.match(route('/privacy','resident'),/Back to BantayLog/);
});
test('line chart curve passes through every dot and never overshoots or drops below zero',async()=>{
  const {monotonePath,niceScale,labelEvery}=await vite.ssrLoadModule('/src/components/dashboard/lineChart.js');
  // SVG y grows downward: baseline (zero) is y=200; higher counts have smaller y.
  const values=[4,8,4,5,6,2,0,0,6,9],points=values.map((v,i)=>({x:i*50,y:200-v*20}));
  const path=monotonePath(points);
  const segments=path.split(' C').slice(1).map(part=>part.trim().split(' ').map(pair=>pair.split(',').map(Number)));
  assert.equal(segments.length,values.length-1);
  segments.forEach(([c1,c2,end],i)=>{
    const lo=Math.min(points[i].y,points[i+1].y),hi=Math.max(points[i].y,points[i+1].y);
    for(const [,cy] of [c1,c2]) assert.ok(cy>=lo-1e-9 && cy<=hi+1e-9,`segment ${i} control point stays between its two dots`);
    assert.deepEqual(end,[points[i+1].x,points[i+1].y]);
  });
  assert.ok(segments.flat().every(([,cy])=>cy<=200),'never below the zero line');
  assert.deepEqual(niceScale(9),{max:10,ticks:[0,2,4,6,8,10]});
  assert.deepEqual(niceScale(17).ticks,[0,5,10,15,20]);
  assert.deepEqual(niceScale(0),{max:1,ticks:[0,1]});
  assert.equal(labelEvery(12,600),1);assert.ok(labelEvery(31,280)>=5,'phones show fewer day labels');
});
test('clickable dashboard cards are real toggle buttons with valid content and a short name',async()=>{
  const StatCard=(await vite.ssrLoadModule('/src/components/ui/StatCard.jsx')).default;
  const html=renderToStaticMarkup(createElement(StatCard,{label:'Ongoing',value:15,tone:'ongoing',detail:'Under investigation',onSelect:()=>{},selected:true,actionHint:'View these reports'}));
  assert.match(html,/^<button type="button"/);assert.match(html,/aria-pressed="true"/);
  assert.match(html,/aria-label="Ongoing: 15\. View these reports"/);
  assert.doesNotMatch(html,/<h2|<p[ >]/,'no headings or paragraphs inside a button');
  assert.match(renderToStaticMarkup(createElement(StatCard,{label:'Total',value:3})),/^<article/,'cards without an action stay plain');
});
test('personnel see who reported, and the complainant name is built from it',async()=>{
  const ReporterDetails=(await vite.ssrLoadModule('/src/components/reports/ReporterDetails.jsx')).default;
  const {reporterName}=await vite.ssrLoadModule('/src/utils/reporter.js');
  const reporter={first_name:'Maria',middle_name:'Santos',last_name:'Cruz',contact_no:null,address:'Purok 1',is_verified:1};
  assert.equal(reporterName(reporter),'Maria Santos Cruz');assert.equal(reporterName({...reporter,middle_name:null}),'Maria Cruz');assert.equal(reporterName(null),'');
  const html=renderToStaticMarkup(createElement(ReporterDetails,{reporter}));
  assert.match(html,/Reported by/);assert.match(html,/Maria Santos Cruz/);assert.match(html,/Verified/);assert.match(html,/Not provided/);
  assert.match(renderToStaticMarkup(createElement(ReporterDetails,{reporter:null})),/not available/);
});
test('summary reports page is limited to Secretary, Captain and Super Admin',()=>{
  for(const role of ['secretary','captain','super_admin']){const html=route('/admin/summary-reports',role);assert.match(html,/Summary reports/);assert.match(html,/Download PDF/);assert.doesNotMatch(html,/You do not have access/);}
  for(const role of ['staff','resident']) assert.match(route('/admin/summary-reports',role),/You do not have access/);
});
test('PDF download errors show the server message, read from the blob body',async()=>{
  const {downloadErrorMessage}=await vite.ssrLoadModule('/src/utils/download.js');
  const blob=new Blob([JSON.stringify({success:false,message:'This period has not started yet.'})],{type:'application/json'});
  assert.equal(await downloadErrorMessage({response:{status:400,data:blob}}),'This period has not started yet.');
  assert.match(await downloadErrorMessage({response:{status:403,data:new Blob(['nope'])}}),/Secretary, Captain or Super Admin/);
  assert.match(await downloadErrorMessage({}),/could not be created/);
});
