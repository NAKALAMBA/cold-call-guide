// After the call: turn a call recording into stage suggestions.
//
// The caller uploads the recording at the close. Gemini transcribes it with
// speaker labels and maps the call onto the eight stages, using only the taps
// the screen offers, and quotes the prospect's own words. Nothing is applied
// automatically: the close screen shows the suggestions and the caller picks.
//
// Uses Gemini's native generateContent endpoint (audio needs inline data,
// which the OpenAI-compatible endpoint does not take for every format).
import { STAGES } from '../../shared/stages.js';
import { modelList } from './llm.js';

export const AUDIO_TYPES = {
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/mpeg': 'audio/mp3',
  'audio/mp3': 'audio/mp3',
  'audio/mp4': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/aac': 'audio/aac',
  'audio/ogg': 'audio/ogg',
  'audio/webm': 'audio/webm',
  'audio/flac': 'audio/flac',
};

const STAGE_LIST = STAGES.filter((s) => s.n < 8)
  .map((s) => `Stage ${s.n} ${s.name} (${s.goal}) taps: ${s.taps.map((t) => `${t.key} = "${t.label}"`).join('; ')}`)
  .join('\n');

// Step 1, audio -> transcript. Kept to one job: listening.
const TRANSCRIBE_PROMPT = `This is a recording of a cold call from Meridian Growth Partners (Hyderabad), which sells growth analysis and growth work to Indian businesses. A receptionist may answer first. The call may switch between English, Hindi, Hinglish, Marathi or Kannada.

Transcribe the call. Label every turn CALLER, PROSPECT or RECEPTION. The CALLER is the person who says they are calling from Meridian and asks the questions; the PROSPECT is the person called. Keep the words as spoken, in the language spoken; do not translate, summarise or tidy them.

Reply with JSON only:
{"transcript":[{"speaker":"CALLER|PROSPECT|RECEPTION","text":"..."}],"language":"<main language of the call>"}`;

// Step 2, transcript -> stages. A text task, so it reasons over the whole call.
const MAP_PROMPT = `You map a cold-call transcript onto the stages of a call, for a caller at Meridian Growth Partners to confirm. A real call skips stages: include a stage only if it actually happened.

Stages and the only taps allowed for each:
${STAGE_LIST}

For each stage that happened: pick at most one tap from that stage's list (null if none fits), and quote the PROSPECT's own words at that stage, verbatim, at most 40 words.

Rules:
- Stage 3 Permission only if the prospect answered whether they can talk now. "Tell me" or "go ahead" after "is this the right time" is a yes.
- Stage 5: what the prospect is trying to do or struggling with, in their exact words. This matters most.
- Stage 7: if the prospect agreed to a call or meeting at a time ("next Thursday", "Done", "call me Monday"), use call_time or meeting even when a document was also agreed, and include the time in the words.
- If the prospect said they are not the right person, or the person has left, or a language is needed, use the matching stage 1 or stage 6 tap.

Reply with JSON only:
{"stages":[{"stage":1,"tap":"<tap key or null>","words":"<prospect's words or null>"}],"need_in_their_words":"<stage 5 quote or null>"}`;

function nativeBase(env) {
  const base = env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
  if (!base.includes('generativelanguage.googleapis.com')) return null;
  return 'https://generativelanguage.googleapis.com/v1beta';
}

export function transcriptionAvailable(env = process.env) {
  return Boolean(env.LLM_API_KEY && nativeBase(env));
}

// Keep only what the screen can show: known stages, known taps, short quotes.
export function cleanResult(raw) {
  const transcript = (Array.isArray(raw.transcript) ? raw.transcript : [])
    .filter((t) => t && typeof t.text === 'string' && t.text.trim())
    .map((t) => ({
      speaker: ['CALLER', 'PROSPECT', 'RECEPTION'].includes(t.speaker) ? t.speaker : 'UNKNOWN',
      text: t.text.trim().slice(0, 2000),
    }))
    .slice(0, 400);

  const stages = [];
  for (const s of Array.isArray(raw.stages) ? raw.stages : []) {
    const def = STAGES.find((d) => d.n === Number(s?.stage) && d.n < 8);
    if (!def || stages.some((x) => x.stage === def.n)) continue;
    const tap = def.taps.some((t) => t.key === s.tap) ? s.tap : null;
    const words = typeof s.words === 'string' && s.words.trim() ? s.words.trim().slice(0, 600) : null;
    if (tap || words) stages.push({ stage: def.n, tap, words });
  }
  stages.sort((a, b) => a.stage - b.stage);

  const need = typeof raw.need_in_their_words === 'string' && raw.need_in_their_words.trim() ? raw.need_in_their_words.trim().slice(0, 600) : null;
  return { transcript, stages, need_in_their_words: need, language: typeof raw.language === 'string' ? raw.language.slice(0, 40) : null };
}

export function transcriptText(result) {
  return result.transcript.map((t) => `${t.speaker}: ${t.text}`).join('\n');
}

async function geminiJson(base, key, model, parts) {
  const res = await fetch(`${base}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
    signal: AbortSignal.timeout(40000),
  });
  if (!res.ok) throw new Error(`${model} HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

// Try each model in order; return the first good answer.
async function firstThatWorks(env, fn) {
  for (const model of modelList(env)) {
    try {
      return { model, value: await fn(model) };
    } catch (err) {
      console.error('[transcribe]', err.message);
    }
  }
  return null;
}

export async function transcribeCall(audio, mimeType, env = process.env) {
  const base = nativeBase(env);
  if (!env.LLM_API_KEY || !base) {
    const e = new Error('Recording upload needs a Gemini key on the server.');
    e.status = 501;
    throw e;
  }
  const key = env.LLM_API_KEY;

  const heard = await firstThatWorks(env, async (model) => {
    const raw = await geminiJson(base, key, model, [{ inline_data: { mime_type: mimeType, data: audio.toString('base64') } }, { text: TRANSCRIBE_PROMPT }]);
    const { transcript } = cleanResult(raw);
    if (!transcript.length) throw new Error(`${model} returned an empty transcript`);
    return { transcript, language: typeof raw.language === 'string' ? raw.language.slice(0, 40) : null };
  });
  if (!heard) {
    const e = new Error('Could not transcribe the recording. Try again in a minute, or fill the stages by hand.');
    e.status = 502;
    throw e;
  }

  const text = transcriptText({ transcript: heard.value.transcript });
  const mapped = await firstThatWorks(env, async (model) => cleanResult(await geminiJson(base, key, model, [{ text: `${MAP_PROMPT}

Transcript:
${text}` }])));

  return {
    transcript: heard.value.transcript,
    language: heard.value.language,
    stages: mapped?.value.stages ?? [],
    need_in_their_words: mapped?.value.need_in_their_words ?? null,
    model: heard.model,
    mapping_model: mapped?.model ?? null,
  };
}
