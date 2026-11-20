import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nowInManila,validateReport} from '../src/utils/validation.js';
const form={category_id:'1',title:'Concern',description:'Details',location:'Street',incident_date:''};
const options={submit:true,activeCategoryIds:[1]};
test('report form rejects a concern dated in the future, including in drafts',()=>{
  const future=nowInManila(60*60*1000).slice(0,16);
  assert.match(validateReport({...form,incident_date:future},options).incident_date,/cannot be in the future/);
  assert.match(validateReport({...form,incident_date:future},{submit:false}).incident_date,/cannot be in the future/);
});
test('report form accepts the current and past Philippine time',()=>{
  assert.equal(validateReport({...form,incident_date:nowInManila().slice(0,16)},options).incident_date,undefined);
  assert.deepEqual(validateReport({...form,incident_date:'2026-01-15T12:30'},options),{});
});
