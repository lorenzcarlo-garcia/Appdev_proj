import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
let vite,Card,Panel,Home,Layout,AuthContext;
before(async()=>{
 vite=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});
 Card=(await vite.ssrLoadModule('/src/components/community/CommunityUpdateCard.jsx')).default;
 Panel=(await vite.ssrLoadModule('/src/components/community/CommunityUpdatesPanel.jsx')).default;
 Home=(await vite.ssrLoadModule('/src/pages/resident/ResidentHomePage.jsx')).default;
 Layout=(await vite.ssrLoadModule('/src/layouts/AppLayout.jsx')).default;
 ({AuthContext}=await vite.ssrLoadModule('/src/context/authContext.js'));
});
after(async()=>{await vite?.close();});
function render(Component,role,props={}){
 return renderToStaticMarkup(createElement(MemoryRouter,null,createElement(AuthContext.Provider,{value:{user:{id:1,role},logout:async()=>{}}},createElement(Component,props))));
}
test('community summaries render as plain text without executable markup or private metadata',()=>{
 const html=renderToStaticMarkup(createElement(Card,{update:{id:1,title:'Road work <script>alert(1)</script>',summary:'<img src=x onerror=alert(1)>',location:'Public hall',maintenance_status:'Ongoing',publication_state:'Published',created_by:999,report_id:123,photo_url:'https://private.invalid/photo',published_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'}}));
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<script'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('private.invalid'));assert.ok(!html.includes('created_by'));assert.ok(!html.includes('report_id'));assert.ok(!html.includes('999'));assert.ok(html.includes('Ongoing'));
});
test('resident home includes maintenance feed and report links with no publishing controls',()=>{
 const html=render(Home,'resident');assert.ok(html.includes('Community issues and maintenance'));assert.ok(html.includes('href="/resident/reports/new"'));assert.ok(html.includes('href="/resident/reports"'));assert.ok(!html.includes('New update'));assert.ok(!html.includes('Visibility'));
});
test('reported issue cards show resolved progress without exposing source report identifiers or private metadata',()=>{
 const html=renderToStaticMarkup(createElement(Card,{update:{id:4,title:'Public road concern',summary:'Work completed along the shared road.',location:'Public road',update_type:'Reported issue',maintenance_status:'Completed',source_report_id:98765,user_id:76543,reference_no:'PRIVATE-REF'}}));
 assert.ok(html.includes('Resident-reported issue'));assert.ok(html.includes('Resolved'));
 for(const value of ['98765','76543','PRIVATE-REF','source_report_id'])assert.ok(!html.includes(value));
});
test('only Secretary Captain and Super Admin see management controls',()=>{
 for(const role of ['resident','staff','secretary','captain','super_admin']){
  const html=render(Panel,role,{management:true});const allowed=['secretary','captain','super_admin'].includes(role);
  assert.equal(html.includes('New update'),allowed);assert.equal(html.includes('Visibility'),allowed);
 }
});
test('administrative navigation includes Community Updates; resident navigation stays separate',()=>{
 for(const role of ['staff','secretary','captain','super_admin'])assert.ok(render(Layout,role,{children:'Content'}).includes('href="/admin/community-updates"'));
 assert.ok(!render(Layout,'resident',{variant:'resident',children:'Content'}).includes('href="/admin/community-updates"'));
});
