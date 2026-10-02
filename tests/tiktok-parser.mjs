import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { parseTikTokImport } from '../src/lib/tiktok-import.ts';
const headers=['Tên người dùng của nhà sáng tạo','Kim cương'];
async function book(rows, titles=headers) { const w=new ExcelJS.Workbook();const s=w.addWorksheet('Data');s.addRow(titles);for(const row of rows)s.addRow(row);return Buffer.from(await w.xlsx.writeBuffer()); }
let passed=0;
async function ok(label, fn){await fn();passed++;console.log('PASS',label);}
await ok('Reads selected columns by name, ignores other fields',async()=>{
 const result=await parseTikTokImport(await book([['private','@User.Name',123,'other']],['ID',headers[0],headers[1],'Email']));
 assert.deepEqual(result.entries,[{row_number:2,username:'user.name',diamonds:123}]);assert.deepEqual(result.issues,[]);
});
await ok('Missing diamonds is invalid; zero is valid',async()=>{const r=await parseTikTokImport(await book([['a',null],['b',0]]));assert.equal(r.issues.length,1);assert.equal(r.entries[0].diamonds,0);});
await ok('Duplicate normalized username blocks import',async()=>{const r=await parseTikTokImport(await book([['@A',1],['a',2]]));assert.equal(r.issues.length,1);});
await ok('Rejects negative, fractional, formulas and unsafe integers',async()=>{const r=await parseTikTokImport(await book([['a',-1],['b',1.5],['c',{formula:'1+2',result:3}],['d',Number.MAX_SAFE_INTEGER+1]]));assert.equal(r.issues.length,4);});
await ok('Text integers and explicit thousand groups parse correctly',async()=>{const r=await parseTikTokImport(await book([['a','30,280'],['b','29.585'],['c','0']]));assert.deepEqual(r.entries.map(x=>x.diamonds),[30280,29585,0]);});
await ok('Rejects ambiguous decimal string',async()=>{const r=await parseTikTokImport(await book([['a','1,25']]));assert.equal(r.issues.length,1);});
await ok('Missing or repeated headers rejected',async()=>{
 await assert.rejects(()=>parseTikTokImport(Buffer.from("not an xlsx")),/./); // malformed bytes
 await assert.rejects(async()=>parseTikTokImport(await book([['a',1]],['User','Kim cương'])),/hai cột/);
 await assert.rejects(async()=>parseTikTokImport(await book([['a',1,2]],[headers[0],headers[1],headers[1]])),/trùng/);
});
await ok('Two matching worksheets are ambiguous',async()=>{const w=new ExcelJS.Workbook();for(const name of ['A','B']){const s=w.addWorksheet(name);s.addRow(headers);s.addRow(['a',1]);}const buf=Buffer.from(await w.xlsx.writeBuffer());await assert.rejects(()=>parseTikTokImport(buf),/đúng một bảng/);});
if(process.argv[2])await ok('Actual TikTok sample extracts only 10 username/diamond rows',async()=>{
 const r=await parseTikTokImport(readFileSync(process.argv[2]));assert.equal(r.entries.length,10);assert.equal(r.issues.length,0);assert.equal(r.entries[0].diamonds,30280);assert.deepEqual(Object.keys(r.entries[0]).sort(),['diamonds','row_number','username']);console.log('Sample rows',r.entries.length,'diamond total',r.entries.reduce((n,x)=>n+x.diamonds,0));
});
console.log(`${passed} parser checks passed`);
