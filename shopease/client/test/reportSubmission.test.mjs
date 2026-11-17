import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let vite,createReportWithPhotos,Picker;
const previousAdapter=axios.defaults.adapter;
let calls=[],failure;
before(async()=>{
  axios.defaults.adapter=async config=>{
    calls.push(config);
    const response={config,status:200,statusText:'OK',headers:{},data:{}};
    if(config.url==='/auth/csrf') response.data={csrfToken:'a'.repeat(64)};
    else {
      assert.equal(config.headers.get('X-CSRF-Token'),'a'.repeat(64));
      if(config.url===failure) {
        response.status=500;response.data={message:'Synthetic failure'};
        throw new axios.AxiosError('Synthetic failure','ERR_BAD_RESPONSE',config,null,response);
      }
      if(config.url==='/reports/drafts') response.data={report:{id:42,submission_stage:'Draft'}};
      else if(config.url==='/reports/42/attachments') {
        assert.ok(config.data instanceof FormData);assert.equal(config.data.getAll('photos').length,1);
        response.data={attachments:[{id:7}]};
      } else if(config.url==='/reports/42/submit') response.data={report:{id:42,submission_stage:'Submitted'}};
      else throw new Error('Unexpected endpoint');
    }
    return response;
  };
  vite=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});
  ({createReportWithPhotos}=await vite.ssrLoadModule('/src/services/reportSubmission.js'));
  Picker=(await vite.ssrLoadModule('/src/components/reports/PendingPhotoPicker.jsx')).default;
});
after(async()=>{axios.defaults.adapter=previousAdapter;await vite?.close();});
const files=()=>[new File(['synthetic image'],'photo.jpg',{type:'image/jpeg'})];
const writes=()=>calls.filter(call=>call.method==='post').map(call=>call.url);
test('new-report photo controls are visible before saving',()=>{
  const html=renderToStaticMarkup(createElement(Picker,{files:[],onChange:()=>{}}));
  assert.ok(html.includes('Take a photo'));assert.ok(html.includes('Choose photos'));
  assert.equal((html.match(/type="file"/g)||[]).length,2);assert.ok(html.includes('capture="environment"'));assert.ok(html.includes('multiple=""'));
  assert.ok(html.includes('No photos selected'));assert.match(html,/<button type="button" class="[^"]*border-dashed/);assert.ok(html.includes('Add photos'));
});
test('selected photos have previews, a count and removal controls',()=>{
  const html=renderToStaticMarkup(createElement(Picker,{files:files(),onChange:()=>{}}));
  assert.ok(html.includes('1 of 3 photos selected'));assert.ok(html.includes('Selected photo: photo.jpg'));assert.ok(html.includes('Remove photo'));
});
test('submit uploads photos to a private draft before submission',async()=>{
  calls=[];failure=undefined;
  const report=await createReportWithPhotos({title:'Test'},files(),{submit:true});
  assert.equal(report.submission_stage,'Submitted');
  assert.deepEqual(writes(),['/reports/drafts','/reports/42/attachments','/reports/42/submit']);
});
test('save draft uploads photos without submitting',async()=>{
  calls=[];failure=undefined;
  const report=await createReportWithPhotos({},files());assert.equal(report.submission_stage,'Draft');
  assert.deepEqual(writes(),['/reports/drafts','/reports/42/attachments']);
});
test('upload failure preserves the draft ID and prevents submission or retry',async()=>{
  calls=[];failure='/reports/42/attachments';
  await assert.rejects(createReportWithPhotos({},files(),{submit:true}),error=>error.savedReportId===42);
  assert.deepEqual(writes(),['/reports/drafts','/reports/42/attachments']);
});
test('unconfirmed submission preserves report ID without another create',async()=>{
  calls=[];failure='/reports/42/submit';
  await assert.rejects(createReportWithPhotos({},files(),{submit:true}),error=>error.savedReportId===42);
  assert.equal(writes().filter(url=>url==='/reports/drafts').length,1);
});
test('creation failure cannot upload or submit a report',async()=>{
  calls=[];failure='/reports/drafts';
  await assert.rejects(createReportWithPhotos({},files(),{submit:true}),error=>error.savedReportId===undefined);
  assert.deepEqual(writes(),['/reports/drafts']);
});
