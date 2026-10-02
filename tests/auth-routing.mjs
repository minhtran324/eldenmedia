import assert from 'node:assert/strict';
import { accountDestination, isUuid, validatedAppOrigin } from '../src/lib/auth/routing.ts';
for(const role of ['admin','operator','idol']){
 assert.equal(accountDestination({role,status:'pending'}),'/pending');
 assert.equal(accountDestination({role,status:'suspended'}),'/suspended');
 assert.equal(accountDestination({role,status:'active',full_name:'Test Member',phone:'0901234567',birth_date:'2000-01-01',nickname:'testmember'}),`/${role}`);
}
assert.equal(accountDestination(null),'/account-unavailable');
assert.equal(validatedAppOrigin(undefined,false),'http://localhost:3000');
assert.equal(validatedAppOrigin('https://elden.example/',true),'https://elden.example');
assert.equal(validatedAppOrigin('http://localhost:3100',true),'http://localhost:3100');
for(const url of [undefined,'http://evil.example','https://example.com/path','https://user:pass@example.com','https://example.com?next=evil','javascript:alert(1)']) assert.throws(()=>validatedAppOrigin(url,true));
assert.equal(isUuid('20000000-0000-4000-8000-000000000001'),true);
assert.equal(isUuid('anything'),false);
console.log('Auth routing and trusted-origin checks passed.');
