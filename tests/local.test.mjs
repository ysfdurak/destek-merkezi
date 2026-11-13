import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createApplication } from '../server/main.mjs';
import { openStore } from '../server/store.mjs';
import { graphClient, mailWorker } from '../server/mail.mjs';
import { seed, today } from '../lib/domain.mjs';

async function freePort() {
  const probe=createServer().listen(0,'127.0.0.1');
  await once(probe,'listening');
  const port=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  return port;
}
test('local application serves assets, sets up accounts and enforces approval role via HTTP',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'destek-http-'));
  const port=await freePort();
  const origin='http://127.0.0.1:'+port;
  const testMessages=[];
  const mail={mode:'test',testRecipient:'test@example.com',send:async message=>testMessages.push(message)};
  const config={port,database:join(dir,'app.sqlite'),yedek:{acik:false}};
  const app=createApplication(config,{send:mail});
  app.server.listen(port,'127.0.0.1');
  await once(app.server,'listening');
  t.after(async()=>{
    await new Promise(resolve=>app.server.close(resolve));
    app.store.db.close();
    rmSync(dir,{recursive:true,force:true});
  });
  const request=async(path,body,session,extra={})=>{
    const headers={...extra};
    if (session) headers.cookie=session;
    if (body) Object.assign(headers,{origin,'content-type':'application/json'});
    return fetch(origin+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});
  };
  assert.match(await (await request('/')).text(),/Destek Merkezi/);
  assert.equal((await request('/app.js')).status,200);
  assert.equal((await request('/api/state',undefined,undefined,{'oai-authenticated-user-id':'owner'})).status,401);
  assert.equal((await (await request('/api/startup')).json()).setup,true);
  const credentials={name:'Test Yönetici',email:'admin@example.com',password:'Test-Parola-123456',demo:true};
  const setup=await request('/api/setup',credentials);
  assert.equal(setup.status,201);
  const admin=setup.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/setup',credentials)).status,409);
  const state=async(session=admin,extra={})=>(await (await request('/api/state',undefined,session,extra)).json());
  let view=await state();
  assert.ok(view.state.supports.length>7); // örnek geçmiş dahil
  assert.equal(view.state.supports.filter(r=>/^r\d$/.test(r.id)).length,7);
  assert.equal(view.canTest,true);
  assert.equal(view.testUsers[0].name,'Test Yönetici');
  const user={id:'u-sev',name:'Sevkiyat Yetkilisi',email:'sevkiyat@example.com',role:'manager',deptIds:['SEV'],active:true,localPassword:'Baska-Test-Parola-123'};
  const action=(action,payload,revision,session=admin)=>request('/api/state',{action,payload,revision},session);
  const add=await action('definition',{kind:'users',value:user},view.revision);
  assert.equal(add.status,200);
  assert.ok(!(await add.text()).includes(user.localPassword));
  const login=await request('/api/login',{email:user.email,password:user.localPassword});
  assert.equal(login.status,200);
  const manager=login.headers.get('set-cookie').split(';')[0];
  view=await state(manager,{'x-demo-user':'u-read'});
  assert.equal(view.actor.id,'u-sev');
  assert.equal(view.canTest,false);
  assert.equal((await action('rules',{},view.revision,manager)).status,400);
  assert.equal((await action('decision',{id:'r2',status:'rejected',reason:'Test ret'},view.revision,manager)).status,200);
  assert.equal((await action('rules',{},view.revision)).status,409);
  assert.equal((await state()).state.supports.find(row=>row.id==='r2').status,'rejected');
  assert.equal((await request('/api/mail-test',{},manager)).status,403);
  assert.equal((await request('/api/mail-test',{},admin)).status,200);
  assert.deepEqual(testMessages.map(x=>x.recipients),[['test@example.com']]);
  await app.tick();
  assert.equal((await state()).state.supports.find(row=>row.id==='r6').status,'approved');
  assert.equal(testMessages.length,1);
  const nativeHeaders={'x-destek-access':'1'};
  const nativeLogin=await request('/api/login',{email:user.email,password:user.localPassword},undefined,nativeHeaders);
  assert.equal(nativeLogin.status,200);
  assert.equal(await nativeLogin.text(),'OK');
  const nativeCookie=nativeLogin.headers.get('set-cookie').split(';')[0];
  const nativeInbox=await request('/api/state?view=inbox&page=900',undefined,nativeCookie,nativeHeaders);
  const rows=(await nativeInbox.text()).split('\n').map(row=>row.split('\t'));
  assert.equal(nativeInbox.status,200);
  assert.match(nativeInbox.headers.get('content-type'),/text\/plain/);
  assert.equal(rows[0][3],'manager');
  assert.equal(rows[0][4],'1');
  assert.ok(rows.filter(row=>row[0]==='R').every(row=>row[7]==='pending'&&row[8]==='1'));
  assert.ok(rows.filter(row=>row[0]==='P').every(row=>row[2]==='SEV'));
  const badDecision=await request('/api/state',{action:'decision',payload:{id:'r3',status:'approved'},revision:Number(rows[0][1])},nativeCookie,nativeHeaders);
  assert.equal(badDecision.status,400);
  assert.match(await badDecision.text(),/^ERROR\t/);
  const tomorrow=today(new Date(Date.now()+86400000)) // İstanbul tarihi: gece yarısından sonra UTC ile karışmasın;
  const support=await request('/api/state',{action:'support',payload:{fromDept:'SEV',toDept:'MAL',personIds:['p3'],start:tomorrow+'T09:00',end:tomorrow+'T12:00',breakMinutes:15,realized:false,note:'Access istemcisi'},revision:Number(rows[0][1])},nativeCookie,nativeHeaders);
  assert.equal(support.status,200,await support.clone().text());
  const created=(await support.text()).split('\n').map(row=>row.split('\t')).find(row=>row[0]==='R'&&row[9]==='Access istemcisi');
  assert.ok(created);
  const ownerView=await state();
  const approved=await request('/api/state',{action:'decision',payload:{id:created[1],status:'approved'},revision:ownerView.revision},admin,nativeHeaders);
  assert.equal(approved.status,200);
  assert.equal((await state()).state.supports.find(row=>row.id===created[1]).status,'approved');
  const outsider=await fetch(origin+'/api/state',{method:'POST',headers:{origin:'https://example.com','content-type':'application/json'},body:'{}'});
  assert.equal(outsider.status,403);
  const logout=await request('/api/logout',{},manager);
  assert.equal(logout.status,200);
  assert.equal((await request('/api/state',undefined,manager)).status,401);
  const reopened=openStore(config.database);
  assert.equal(reopened.read().state.supports.find(row=>row.id==='r2').status,'rejected');
  reopened.db.close();
});

test('closed-window worker sends one eligible reminder and records provider acceptance',async()=>{
  const store=openStore(':memory:');
  const now=new Date();
  const data=seed('owner','admin@example.com',now);
  data.isDemo=false;
  store.initialize('owner',data,'test');
  const sent=[];
  const tick=mailWorker(store,{mode:'live',send:async message=>sent.push(message)},'https://destek.example.com');
  await tick(now);
  await tick(now);
  assert.equal(sent.length,1);
  assert.deepEqual(sent[0].recipients,['malkabul@example.com']);
  assert.match(sent[0].body,/https:\/\/destek.example.com\/\?sayfa=onay/);
  assert.equal(store.read().state.notifications[0].status,'accepted');
  assert.equal(store.read().state.supports.find(r=>r.id==='r6').status,'approved');
  store.db.close();
});

test('uncertain provider response does not result in a duplicate send',async()=>{
  const store=openStore(':memory:');
  const now=new Date();
  const data=seed('owner','admin@example.com',now);
  data.isDemo=false;
  store.initialize('owner',data,'test');
  let attempts=0;
  const tick=mailWorker(store,{mode:'live',send:async()=>{
    attempts++;
    throw Object.assign(new Error('Yanıt alınamadı.'),{kind:'uncertain'});
  }},'https://destek.example.com');
  await tick(now);
  await tick(now);
  assert.equal(attempts,1);
  assert.equal(store.read().state.notifications[0].status,'uncertain');
  store.db.close();
});

test('Graph uses client credentials and accepted response is distinguished from throttling',async()=>{
  const calls=[];
  let status=202;
  const tenantId='00000000-0000-0000-0000-000000000001';
  const config={mode:'test',tenantId,clientId:'00000000-0000-0000-0000-000000000002',sender:'destek@example.com',testRecipient:'test@example.com'};
  const graph=graphClient(config,{
    secret:'mock-secret',
    fetcher:async(url,options)=>{
      calls.push({url,options});
      if (url.includes('/token')) return Response.json({access_token:'mock-token',expires_in:3600});
      return new Response(null,{status,headers:{'retry-after':'90'}});
    }
  });
  const notice={id:'one',subject:'test',body:'test',recipients:['test@example.com']};
  await graph.send(notice);
  assert.match(calls[0].url,/login.microsoftonline.com/);
  assert.equal(calls[0].options.body.get('grant_type'),'client_credentials');
  assert.equal(calls[1].options.headers.Authorization,'Bearer mock-token');
  assert.equal(JSON.parse(calls[1].options.body).message.toRecipients[0].emailAddress.address,'test@example.com');
  await assert.rejects(graph.send({...notice,recipients:['other@example.com']}),/Test modunda/);
  status=429;
  await assert.rejects(graph.send(notice),error=>error.kind==='retry'&&error.retryAfter===90);
  assert.equal(calls.length,3);
});
