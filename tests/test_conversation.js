const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../web/conversation.js');
const stagePaste = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures/discord-stage-transcript.txt'), 'utf8');

test('Discord stage notices do not become speakers or leak into neighboring messages', () => {
  for (const format of ['auto','discord']) {
    const parsed = C.parseTranscript(stagePaste, format);
    assert.equal(parsed.ignoredStageNotices, 2);
    assert.deepEqual(parsed.messages, [
      {speaker:'Aster [LAB]',timestamp:'13:41',content:'How do I select a helper?'},
      {speaker:'Mira',timestamp:'13:42',content:'Choose an allowed action.'},
      {speaker:'Aster [LAB]',timestamp:'13:44',content:'PCA: finds patterns in sample data.\n\nWill that preserve line breaks?'},
      {speaker:'Mira',timestamp:'13:46',content:'Yes. Keep source wording intact.'},
    ]);
    const input = {transcript:stagePaste,format,policy:'Help with questions.',model:'jev-latest'};
    const candidates = C.buildCandidates(input);
    assert.deepEqual(candidates.map(c=>c.speaker), ['Aster [LAB]','Mira']);
    assert.equal(candidates[0].payload.state.messages.length,3);
    assert.deepEqual(C.buildRequest(input,false).state.messages,[parsed.messages.at(-1)]);
  }
});

test('leading and trailing stage notices leave the actual final message as the target', () => {
  const transcript = 'Rowan\r\n is now a speaker. — Today at 1:40 PM\r\n\r\nMira — 13:41\r\nCan you help?\r\n\r\nKai is now a speaker. — 13:42';
  const parsed = C.parseTranscript(transcript);
  assert.equal(parsed.ignoredStageNotices,2);
  assert.deepEqual(parsed.messages,[{speaker:'Mira',timestamp:'13:41',content:'Can you help?'}]);
  assert.equal(C.buildRequest({transcript,policy:'Help.',model:'jev-latest'},false).state.messages[0].content,'Can you help?');
  assert.throws(()=>C.parseTranscript('Rowan\nis now a speaker. — 13:43'), /no.*message/i);
});

test('stage notice handling retains real empty-message errors and ordinary message text', () => {
  assert.throws(()=>C.parseTranscript('Mira — 13:41\nRowan\nis now a speaker. — 13:43\nAster — 13:44\nHello'), /no message: Mira/i);
  assert.throws(()=>C.parseTranscript('Mira — 13:41\nHello\nRowan — 13:42'), /no message: Rowan/i);
  const ordinary = 'Mira — 13:41\nRowan is now a speaker.\n[LAB],\nAster — 13:42\nHello';
  assert.equal(C.parseTranscript(ordinary).messages[0].content,'Rowan is now a speaker.\n[LAB],');
  const nickname = 'Rowan is now a speaker. — 13:43\nThat is my display name.';
  assert.equal(C.parseTranscript(nickname).messages[0].speaker,'Rowan is now a speaker.');
  assert.equal(C.parseTranscript(stagePaste,'plain').messages[0].content,stagePaste.trim());
  assert.equal(C.parseTranscript('Mira: Rowan\nis now a speaker. — 13:43','labeled').messages[0].content,'Rowan\nis now a speaker. — 13:43');
});

test('context comparison changes only messages and retains the latest message', () => {
  const input = {transcript:'Ada: Can you help?\nKit: With what?\nAda: My login.', policy:'Help with support.', model:'jev-latest'};
  const a = C.buildRequest(input, true), b = C.buildRequest(input, false);
  assert.equal(a.state.messages.length, 3);
  assert.deepEqual(b.state.messages, [{speaker:'Ada',timestamp:null,content:'My login.'}]);
  assert.deepEqual(a.questions, b.questions);
  assert.equal(a.state.policy, b.state.policy);
  assert.equal(a.model, b.model);
  assert.throws(() => C.buildRequest({...input, transcript:'  '}), /transcript/i);
  assert.throws(() => C.buildRequest({...input, policy:''}), /policy/i);
});

test('gate uses inclusive threshold and rejects malformed provider answers', () => {
  assert.equal(C.gate({type:'noul', noul:0.7}, 0.7), 'Respond');
  assert.equal(C.gate({type:'noul', noul:0.69}, 0.7), 'Skip');
  for (const value of [null, {}, {type:'noul',noul:null}, {type:'noul',noul:1.1}, {type:'choice',noul:0.9}]) {
    assert.equal(C.gate(value, 0.7), 'Unavailable');
  }
});

test('accuracy counts only labeled valid predictions and separates variants', () => {
  const rows = [
    {expected:'question', predicted:'question', variant:'context'},
    {expected:'question', predicted:'chatter', variant:'latest'},
    {expected:'chatter', predicted:'question', variant:'context'},
    {expected:'', predicted:'question', variant:'context'},
    {expected:'question', predicted:'invalid', variant:'context'}
  ];
  const summary = C.summarize(rows, 'context');
  assert.equal(summary.total, 2);
  assert.equal(summary.correct, 1);
  assert.equal(summary.matrix.chatter.question, 1);
  assert.equal(C.summarize(rows, 'latest').correct, 0);
});

const discordPaste = `ΑΛΕΞ [DEV],  — 11:31
Does the sample project have a desktop app?
What should we prototype?
A tiny experiment 👀
Morgan [LAB],  — 11:34
Please prototype a search tool for this sample repository.
Compare exact matching and semantic search with a small synthetic dataset.
ΑΛΕΞ [DEV],  — 11:34
Repository search: rank likely files for a query.

Routing: choose the relevant helper for each task.

Reply gate: decide when a bot should join a conversation.

Frame classifier: label the function of a message.`;

test('Discord paste preserves Unicode speakers, timestamps and multiline content', () => {
  const parsed = C.parseTranscript(discordPaste);
  assert.equal(parsed.format, 'discord');
  assert.equal(parsed.messages.length, 3);
  assert.equal(parsed.messages[0].speaker, 'ΑΛΕΞ [DEV]');
  assert.equal(parsed.messages[0].timestamp, '11:31');
  assert.match(parsed.messages[0].content, /A tiny experiment 👀/);
  assert.equal(parsed.messages[1].speaker, 'Morgan [LAB]');
  assert.match(parsed.messages[2].content, /\n\nRouting:/);
  assert.match(parsed.messages[2].content, /function of a message\.$/);
  const input = {transcript:discordPaste,policy:'Respond to requests.',model:'jev-latest'};
  assert.deepEqual(C.buildRequest(input, false).state.messages, [parsed.messages[2]]);
});

test('labeled chat keeps continuation lines while plain text never invents speakers', () => {
  const parsed = C.parseTranscript('Ada: Hello\nmore detail\n\nSam: Hi');
  assert.equal(parsed.format,'labeled');
  assert.deepEqual(parsed.messages.map(m=>m.content), ['Hello\nmore detail','Hi']);
  const prose = 'This is a paragraph.\nhttps://example.org\nDetails: another paragraph';
  assert.deepEqual(C.parseTranscript(prose).messages,[{speaker:null,timestamp:null,content:prose}]);
  assert.equal(C.parseTranscript('Note: text\nMore: text','plain').messages.length,1);
});

test('Discord parsing handles CRLF, dates, AM/PM and unassigned leading text', () => {
  const parsed=C.parseTranscript('Unassigned context\r\nAda — Yesterday at 9:31 PM\r\nHello\r\nSam — Today at 10:02 AM\r\nHi');
  assert.equal(parsed.messages[0].speaker,null);
  assert.equal(parsed.messages[1].timestamp,'Yesterday at 9:31 PM');
  assert.equal(parsed.messages[2].content,'Hi');
  assert.throws(()=>C.parseTranscript('Ada — 11:31'),/no message/i);
  assert.throws(()=>C.parseTranscript('unformatted text','discord'),/header/i);
  assert.throws(()=>C.parseTranscript('   '),/transcript/i);
});

test('reply candidates target each speakers latest message without future context', () => {
  const requests=C.buildCandidates({transcript:discordPaste,policy:'Help.',model:'jev-latest'});
  assert.equal(requests.length,2);
  assert.equal(requests[0].speaker,'Morgan [LAB]');
  assert.equal(requests[0].payload.state.messages.length,2);
  assert.equal(requests[1].payload.state.messages.length,3);
  assert.equal(C.buildCandidates({transcript:Array.from({length:12},(_,i)=>`Person ${i}: Hi`).join('\n'),policy:'Help.',model:'jev-latest'}).length,12);
});

test('winner selection handles threshold, ties and missing scores honestly', () => {
  const result=(speaker,noul)=>({speaker,response:{answers:{should_respond:{type:'noul',noul}}}});
  assert.deepEqual(C.pickWinners([result('Ada',0.9),result('Sam',0.5)],0.7).winners.map(r=>r.speaker),['Ada']);
  assert.equal(C.pickWinners([result('Ada',0.6)],0.7).status,'none');
  assert.equal(C.pickWinners([result('Ada',0.9),result('Sam',0.9)],0.7).status,'tie');
  assert.equal(C.pickWinners([result('Ada',0.9),result('Sam',null)],0.7).status,'incomplete');
});

test('batch runner bounds parallelism, preserves order and continues after failures', async () => {
  let active=0, peak=0;
  const progress=[];
  const result=await C.runBatches(Array.from({length:11},(_,i)=>i),async value=>{
    active++; peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,2));
    active--;
    if(value===4) throw new Error('rate limited');
    return value*2;
  },{onProgress:state=>progress.push(state.completed)});
  assert.equal(peak,3);
  assert.equal(active,0);
  assert.equal(result.length,11);
  assert.equal(result[4].status,'rejected');
  assert.equal(result[10].value,20);
  assert.deepEqual(progress,[3,6,9,11]);
});

test('cancelling a batch stops queued requests without losing completed results', async () => {
  const controller=new AbortController(); let calls=0;
  const result=await C.runBatches([0,1,2,3,4],async value=>{
    calls++; if(value===0) controller.abort(); return value;
  },{signal:controller.signal});
  assert.equal(calls,3);
  assert.equal(result[0].status,'fulfilled');
  assert.equal(result[3].status,'rejected');
  assert.equal(result[3].reason.name,'AbortError');
});

test('unassigned Discord preamble is context, not a reply candidate', () => {
  const requests=C.buildCandidates({transcript:'Channel: support\nCopied conversation\nAda — 11:31\nHelp me',policy:'Help.',model:'jev-latest'});
  assert.equal(requests.length,1);
  assert.equal(requests[0].speaker,'Ada');
  assert.equal(requests[0].payload.state.messages.length,2);
  assert.equal(C.buildCandidates({transcript:'Unlabeled question?',policy:'Help.',model:'jev-latest'})[0].speaker,'Unknown speaker');
});
