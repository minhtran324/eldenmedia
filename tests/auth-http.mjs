import assert from 'node:assert/strict';
const origin=process.argv[2]??'http://localhost:3100';
for(const path of ['/idol/schedule/register','/admin/schedule/board','/operator/schedule/board','/admin/imports','/reports','/api/imports','/notifications','/api/notifications/counts','/home','/admin/content','/api/homepage/media/00000000-0000-4000-8000-000000000001','/','/admin','/operator','/idol','/pending','/profile','/modules/people','/admin/operations','/operator/operations','/idol/operations','/api/attendance/photos/00000000-0000-4000-8000-000000000001','/admin/schedule','/operator/schedule','/idol/schedule','/admin/schedule/requests/00000000-0000-4000-8000-000000000001','/operator/schedule/requests/00000000-0000-4000-8000-000000000001','/admin/resources','/operator/resources','/admin/resources/qr?kind=device&id=00000000-0000-4000-8000-000000000001']){
 const response=await fetch(origin+path,{redirect:'manual'});
 assert.equal(response.status,307,path);
 assert.equal(new URL(response.headers.get('location'),origin).pathname,'/login',path);
 assert.match(response.headers.get('cache-control'),/no-store/,path);
 console.log('PASS unauthenticated redirect',path);
}
const login=await fetch(origin+'/login');
assert.equal(login.status,200);
assert.match(await login.text(),/Đăng nhập Workspace/);
console.log('PASS login rendered');
const callback=await fetch(origin+'/auth/callback?next=https://evil.example',{redirect:'manual'});
assert.equal(callback.status,307);
assert.equal(new URL(callback.headers.get('location')).origin,new URL(origin).origin);
assert.equal(new URL(callback.headers.get('location')).pathname,'/login');
console.log('PASS callback cannot redirect to supplied external destination');


const cleanup=await fetch(origin+'/api/internal/attendance-cleanup',{method:'POST'});
assert.equal(cleanup.status,401);
console.log('PASS cleanup requires secret, not browser session');

