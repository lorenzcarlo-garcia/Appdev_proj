import {before,after,test} from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'vite';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router-dom';
let vite,Routes,AuthContext,Residents,Blotters;
before(async()=>{vite=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});({AppRoutes:Routes}=await vite.ssrLoadModule('/src/App.jsx'));({AuthContext}=await vite.ssrLoadModule('/src/context/authContext.js'));Residents=(await vite.ssrLoadModule('/src/pages/admin/ResidentsPage.jsx')).default;Blotters=(await vite.ssrLoadModule('/src/pages/admin/BlottersPage.jsx')).default;});after(async()=>{await vite?.close();});
function render(path,role,Component=Routes){return renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:[path]},createElement(AuthContext.Provider,{value:{user:role?{id:1,email:'route-test@example.invalid',role}:null,loading:false,error:'',refresh:async()=>{},logout:async()=>{},changePassword:async()=>{}}},createElement(Component))));}
test('every administrative core page resolves to implemented content, not a placeholder',()=>{
 for(const role of ['staff','secretary','captain','super_admin'])for(const path of ['/admin','/admin/reports','/admin/reports/1','/admin/blotters','/admin/blotters/1','/admin/residents','/admin/community-updates','/admin/account']){
  const html=render(path,role);assert.ok(html.length>0,role+':'+path);assert.ok(!html.includes('This page is being prepared'));assert.ok(!html.includes('Page not found'));assert.ok(!html.includes('You do not have access'));
 }
 for(const path of ['/admin/categories','/admin/staff','/admin/blotters/new','/admin/blotters/1/edit','/admin/reports/1/convert']){const html=render(path,'super_admin');assert.ok(!html.includes('Page not found'));assert.ok(!html.includes('You do not have access'));}
});
test('restricted routes cannot be opened by a different role even with a typed URL',()=>{
 for(const [path,role]of [['/admin','resident'],['/admin/categories','captain'],['/admin/categories','staff'],['/admin/staff','secretary'],['/admin/blotters/new','staff'],['/admin/blotters/1/edit','staff'],['/admin/reports/1/convert','secretary'],['/resident/reports','staff']])assert.ok(render(path,role).includes('You do not have access'),role+':'+path);
});
test('all resident core routes resolve without placeholder content',()=>{
 for(const path of ['/resident','/resident/reports','/resident/reports/new','/resident/reports/1','/resident/reports/1/edit','/resident/profile']){const html=render(path,'resident');assert.ok(!html.includes('This page is being prepared'));assert.ok(!html.includes('Page not found'));assert.ok(!html.includes('You do not have access'));}
});
test('walk-in and resident-creation actions follow the approved roles',()=>{
 for(const role of ['staff','secretary','captain','super_admin']){
  assert.equal(render('/admin/residents',role,Residents).includes('Add resident'),['secretary','super_admin'].includes(role));
  assert.equal(render('/admin/blotters',role,Blotters).includes('Record walk-in incident'),['secretary','captain','super_admin'].includes(role));
 }
});
test('unknown routes show a real not-found screen',()=>{assert.ok(render('/not-a-real-page','resident').includes('Page not found'));});
