import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router-dom';import {createServer} from 'vite';
let vite,AccountPage,LoginPage,Layout,AuthContext,validatePasswordChange;
before(async()=>{
 vite=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});
 AccountPage=(await vite.ssrLoadModule('/src/pages/AccountPage.jsx')).default;
 LoginPage=(await vite.ssrLoadModule('/src/pages/LoginPage.jsx')).default;
 Layout=(await vite.ssrLoadModule('/src/layouts/AppLayout.jsx')).default;
 ({AuthContext}=await vite.ssrLoadModule('/src/context/authContext.js'));
 ({validatePasswordChange}=await vite.ssrLoadModule('/src/utils/validation.js'));
});
after(async()=>{await vite?.close();});
function render(Component,role='resident',props={},state={}){return renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:[{pathname:'/login',state}]},createElement(AuthContext.Provider,{value:{user:{id:1,email:'synthetic@example.invalid',role},changePassword:async()=>{},logout:async()=>{},refresh:async()=>{}}},createElement(Component,props))));}
test('account form masks all three password fields and declares current/new autocomplete correctly',()=>{
 const html=render(AccountPage);assert.equal((html.match(/type="password"/g)||[]).length,3);
 assert.equal((html.match(/autoComplete="current-password"/g)||[]).length,1);assert.equal((html.match(/autoComplete="new-password"/g)||[]).length,2);
 assert.ok(html.includes('Change password and sign out'));assert.ok(html.includes('your other devices'));assert.ok(!html.includes('password_hash'));assert.ok(!html.includes('credentialTag'));
});
test('client validation checks confirmation, length and password reuse',()=>{
 const valid={current_password:'synthetic-current-password',new_password:'synthetic-new-password',confirm_password:'synthetic-new-password'};
 assert.deepEqual(validatePasswordChange(valid),{});
 assert.ok(validatePasswordChange({...valid,current_password:''}).current_password);
 assert.ok(validatePasswordChange({...valid,new_password:'short'}).new_password);
 assert.ok(validatePasswordChange({...valid,new_password:'x'.repeat(129)}).new_password);
 assert.ok(validatePasswordChange({...valid,new_password:valid.current_password}).new_password);
 assert.ok(validatePasswordChange({...valid,confirm_password:'different'}).confirm_password);
});
test('all account roles can find their account page from navigation',()=>{
 assert.ok(render(Layout,'resident',{variant:'resident',children:'Content'}).includes('href="/resident/profile"'));
 for(const role of ['staff','secretary','captain','super_admin'])assert.ok(render(Layout,role,{children:'Content'}).includes('href="/admin/account"'));
});
test('login displays a password-change success notice without exposing a password',()=>{
 const html=render(LoginPage,'resident',{}, {passwordChanged:true});
 assert.ok(html.includes('Log in with your new password'));assert.ok(html.includes('Your other devices have been signed out'));assert.ok(!html.includes('synthetic-new-password'));
});
