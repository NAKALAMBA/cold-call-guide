import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanResult, transcriptText } from '../src/transcribe.js';

test('cleanResult keeps only known stages and taps', () => {
  const r = cleanResult({
    transcript: [{ speaker: 'CALLER', text: 'Hello' }, { speaker: 'PROSPECT', text: 'From where?' }, { speaker: 'X', text: '' }],
    stages: [
      { stage: 2, tap: 'asked_what', words: 'From where?' },
      { stage: 2, tap: 'let_go_on', words: 'dup' }, // duplicate stage: dropped
      { stage: 6, tap: 'report_email', words: 'wrong stage tap' }, // tap from stage 7: tap dropped, words kept
      { stage: 8, tap: null, words: 'close is not a suggestion' }, // stage 8: dropped
      { stage: 9, tap: 'x' }, // unknown stage
    ],
    need_in_their_words: '  skilled manpower  ',
  });
  assert.deepEqual(r.stages, [
    { stage: 2, tap: 'asked_what', words: 'From where?' },
    { stage: 6, tap: null, words: 'wrong stage tap' },
  ]);
  assert.equal(r.need_in_their_words, 'skilled manpower');
  assert.equal(r.transcript.length, 2);
  assert.equal(transcriptText(r), 'CALLER: Hello\nPROSPECT: From where?');
});
