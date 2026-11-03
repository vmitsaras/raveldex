import assert from 'node:assert/strict';
import test from 'node:test';
import { linkN9Subissues } from '../../scripts/link-native-subissues.mjs';

const body = id => '<!-- raveldex:' + id + ':start -->\ncontent\n<!-- raveldex:' + id + ':end -->';
const roadmap = { repository: 'vmitsaras/raveldex', milestones: [{ id:'N9' }],
  tasks: [{ id:'RX-8001',milestone:'N9' },{ id:'RX-8002',milestone:'N9' }] };
function mock({ ignorePost = false, parentAssigned = false } = {}) {
 const issues = [
  {number:130,id:5000,body:body('N9'),milestone:parentAssigned?{number:10}:null},
  {number:131,id:5001,body:body('RX-8001'),milestone:{number:10}},
  {number:132,id:5002,body:body('RX-8002'),milestone:{number:10}},
  {number:129,id:4999,body:'Unmanaged',milestone:null}
 ];
 const subissues=[],writes=[];
 async function request(method,path,payload) {
  if(method==='GET'&&path.includes('/issues?'))return issues;
  if(method==='GET'&&path.includes('/sub_issues?'))return subissues;
  if(method==='POST'&&path.endsWith('/sub_issues')) {
   writes.push(payload.sub_issue_id);
   if(!ignorePost)subissues.push(issues.find(issue=>issue.id===payload.sub_issue_id));
   return {ok:true};
  }
  throw new Error('Unexpected request '+method+' '+path);
 }
 return {issues,subissues,writes,request};
}
test('creates native hierarchy and second run is zero-write',async()=>{
 const ctx=mock();
 assert.deepEqual(await linkN9Subissues(roadmap,ctx.request),{parentNumber:130,subIssueCount:2,added:2});
 assert.deepEqual(ctx.writes,[5001,5002]);
 assert.deepEqual(await linkN9Subissues(roadmap,ctx.request),{parentNumber:130,subIssueCount:2,added:0});
 assert.deepEqual(ctx.writes,[5001,5002]);
 assert.equal(ctx.issues[3].milestone,null);
});
test('refuses success responses without final native readback',async()=>{
 await assert.rejects(linkN9Subissues(roadmap,mock({ignorePost:true}).request),/read-back missing/);
});
test('refuses overview milestone membership and mismatched child milestones',async()=>{
 await assert.rejects(linkN9Subissues(roadmap,mock({parentAssigned:true}).request),/inflate/);
 const ctx=mock();ctx.issues[2].milestone={number:11};
 await assert.rejects(linkN9Subissues(roadmap,ctx.request),/assignments disagree/);
});
test('refuses unmanaged parent and unrelated repository',async()=>{
 const ctx=mock();ctx.issues[0].body='Unmanaged';
 await assert.rejects(linkN9Subissues(roadmap,ctx.request),/exactly one managed/);
 await assert.rejects(linkN9Subissues({...roadmap,repository:'other/repo'},mock().request),/Unexpected repository/);
});
test('preserves an existing sub-issue and creates only missing children',async()=>{
 const ctx=mock();ctx.subissues.push(ctx.issues[1]);
 assert.deepEqual(await linkN9Subissues(roadmap,ctx.request),{parentNumber:130,subIssueCount:2,added:1});
 assert.deepEqual(ctx.writes,[5002]);
});
