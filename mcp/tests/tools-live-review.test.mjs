import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerLiveReviewTools } from '../tools-live-review.js';

function tools(callApi=async()=>({})) { const registered=new Map(); registerLiveReviewTools({tool:(name,description,schema,fn)=>registered.set(name,fn)},{callApi,run:fn=>fn(),API_KEY:'rk-fixture',BASE_URL:'http://fixture.invalid'});return registered; }
test('review and personal dictionary calls preserve the signed result and user fields', async()=>{
 const calls=[],t=tools(async(...args)=>{calls.push(args);return {ok:true};});
 const fields=[{id:'title',label:'标题',text:'测试文案'}],review={signature:'server-signature',findings:[]};
 await t.get('review_content')({fields});await t.get('replace_review_findings')({fields,review,finding_ids:['f'],action:'delete'});
 await t.get('save_sensitive_words')({words:[{word:'词语',replacement:'新词'}]});await t.get('delete_sensitive_words')({ids:[2]});
 assert.equal(calls[0][1],'/openapi/v1/content-review');assert.deepEqual(calls[1][2].review,review);assert.deepEqual(calls[1][2].fields,fields);assert.equal(calls[2][0],'PUT');assert.deepEqual(calls[3][2],{ids:[2]});
});
test('live upload sends a stable request ID and a file without putting credentials in URLs',async ctx=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'redya-mcp-test-'));const file=path.join(folder,'photo.jpg');await writeFile(file,Buffer.from([0xff,0xd8,0xff,0xd9]));
 ctx.mock.method(globalThis,'fetch',async(url,init)=>{assert.ok(!url.includes('rk-fixture'));assert.equal(init.headers.Authorization,'Bearer rk-fixture');assert.equal(init.body.get('request_id'),'8c143638-c545-4083-bd46-5bb8879361df');assert.equal(init.body.get('image').size,4);return new Response('{"status":"queued"}',{status:202,headers:{'Content-Type':'application/json'}});});
 try { const value=await tools().get('create_live_photo')({request_id:'8c143638-c545-4083-bd46-5bb8879361df',image_path:file,mode:'live'});assert.equal(value.status,'queued'); }finally{await rm(folder,{recursive:true,force:true});}
});
test('download writes only the requested output and refuses to overwrite existing files',async ctx=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'redya-mcp-download-')),output=path.join(folder,'live.pvt.zip');
 ctx.mock.method(globalThis,'fetch',async()=>new Response(new Uint8Array([0x50,0x4b,3,4]),{status:200}));
 const run=tools().get('download_live_photo'),args={request_id:'8c143638-c545-4083-bd46-5bb8879361df',format:'pvt',output_path:output};
 try {const result=await run(args);assert.equal(result.bytes,4);assert.deepEqual([...await readFile(output)],[0x50,0x4b,3,4]);await assert.rejects(()=>run(args),/EEXIST/);}finally{await rm(folder,{recursive:true,force:true});}
});
