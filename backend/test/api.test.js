import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';

let server;
let base;

before(async () => {
  const env = {}; // no Supabase, no LLM key: memory store + rules
  const app = createApp({ store: createStore(env), env });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const req = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

test('health answers', async () => {
  const { status, body } = await req('GET', '/health?deep=1');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.db, 'ok');
});

test('validation rejects a call with no prospect', async () => {
  const { status, body } = await req('POST', '/api/calls', { company: 'X' });
  assert.equal(status, 400);
  assert.equal(body.details[0].path, 'prospect_name');
});

test('rejects a tap that does not belong to the stage', async () => {
  const { body: call } = await req('POST', '/api/calls', { prospect_name: 'A', company: 'B' });
  const { status } = await req('PUT', `/api/calls/${call.id}/stages/2`, { tap: 'report_email' });
  assert.equal(status, 400);
});

// T084: the prospect agreed to a report on WhatsApp and a call next Thursday,
// and the caller logged do_not_call. The check should catch it.
test('T084 replay: check flags a do_not_call log on a call with a next step', async () => {
  const { status, body: call } = await req('POST', '/api/calls', {
    prospect_name: 'Ayesha',
    company: 'Vijay Writing Instruments',
    company_kind: 'mid-size private manufacturer',
  });
  assert.equal(status, 201);

  await req('PUT', `/api/calls/${call.id}/stages/1`, { tap: 'right_person' });
  await req('PUT', `/api/calls/${call.id}/stages/2`, { tap: 'asked_number', words: 'where did you get my number from' });
  await req('PUT', `/api/calls/${call.id}/stages/5`, { tap: 'turned_around', words: 'business constant for three years; how are you going to help me grow' });
  await req('PUT', `/api/calls/${call.id}/stages/7`, { tap: 'call_time', words: 'report on WhatsApp, call next Thursday. "Done."' });

  const { body: check } = await req('POST', `/api/calls/${call.id}/check`, {
    outcome: 'do_not_call',
    next_step_channel: 'Call',
    next_step_when: 'next Thursday',
  });
  assert.equal(check.agrees, false);
  assert.equal(check.suggested_outcome, 'next_step_agreed');

  const { body: closed } = await req('POST', `/api/calls/${call.id}/close`, {
    outcome: check.suggested_outcome,
    next_step_channel: 'Call',
    next_step_when: 'next Thursday',
    ai_check: check,
  });
  assert.equal(closed.status, 'closed');
  assert.equal(closed.stage_reached, 7);
  assert.match(closed.need_words, /constant for three years/);

  const { body: list } = await req('GET', '/api/calls?stage=7');
  assert.ok(list.some((c) => c.id === call.id));
});
