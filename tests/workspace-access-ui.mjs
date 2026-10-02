import assert from 'node:assert/strict';
import { accountDestination, needsProfileCompletion } from '../src/lib/auth/routing.ts';
import { filterDiamondRows, formatDiamonds } from '../src/lib/diamonds.ts';
const complete={role:'idol',status:'active',full_name:'Test Idol',phone:'0901234567',birth_date:'2000-01-01',nickname:'testidol'};
assert.equal(accountDestination(complete),'/idol');
for(const key of ['full_name','phone','birth_date','nickname'])assert.equal(accountDestination({...complete,[key]:''}),'/complete-profile');
assert.equal(accountDestination({...complete,status:'pending'}),'/pending');
assert.equal(accountDestination({...complete,status:'suspended'}),'/suspended');
assert.equal(accountDestination({role:'admin',status:'active'}),'/admin');
assert.equal(needsProfileCompletion({...complete,birth_date:'2200-01-01'}),true);
assert.equal(needsProfileCompletion({...complete,role:'operator',nickname:null}),false);
assert.equal(formatDiamonds('0'),'0');
assert.notEqual(formatDiamonds(null),'0');
assert.equal(formatDiamonds('9007199254740993'),'9.007.199.254.740.993');
const rows=[{idol_id:'a',display_name:'Alice',username:'alice',month_rank:1,day_rank:3,is_my_team:true,operator_id:'op1'},
  {idol_id:'b',display_name:'Bob',username:'bob',month_rank:1,day_rank:1,is_my_team:false,operator_id:'op2'},
  {idol_id:'c',display_name:'Charlie',username:'charlie',month_rank:2,day_rank:null,is_my_team:true,operator_id:'op1'}];
assert.deepEqual(filterDiamondRows(rows,'mine','','month').map(r=>r.idol_id),['a','c']);
assert.equal(filterDiamondRows(rows,'all','charlie','month')[0].month_rank,2);
assert.deepEqual(filterDiamondRows(rows,'op2','','month').map(r=>r.idol_id),['b']);
assert.deepEqual(filterDiamondRows(rows,'all','','day').map(r=>r.idol_id),['b','a','c']);
assert.deepEqual(filterDiamondRows(rows,'mine','bob','month'),[]);
console.log('Profile routing, numeric precision and rank/team filtering checks passed.');
