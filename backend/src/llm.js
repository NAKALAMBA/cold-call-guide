// The LLM's one job: at the close of a call, read what the caller recorded at
// each stage and check the outcome they are about to log against it.
//
// Why this job: in the 100 transcripts, 26 logged outcomes did not match the
// call (13 logged nothing; one call with a report and a Thursday call agreed
// was logged do_not_call). The record is what the next call is built on, so
// a wrong log is the most expensive mistake on the screen.
//
// Works with any OpenAI-compatible endpoint (Gemini, Groq, OpenRouter...).
// Without a key, or if the call fails, it falls back to deterministic rules.
import { STAGES, OUTCOMES, OUTCOME_KEYS, suggestOutcome, tapLabel } from '../../shared/stages.js';

const OUTCOME_LIST = OUTCOMES.map((o) => `- ${o.key}: ${o.meaning}`).join('\n');

const SYSTEM_PROMPT = `You check cold-call logs for Meridian Growth Partners, a Hyderabad company that sells growth analysis and growth work to Indian businesses. A caller has just finished a call and is about to log an outcome.

You get: what the caller tapped at each stage of the call, the prospect's own words where the caller typed them, the next step, and the outcome the caller chose.

The outcome words, as the callers use them:
${OUTCOME_LIST}

Rules that matter:
- A document agreed on WhatsApp or email, with no fixed time: agreed_to_receive_report.
- A meeting, or a call at a time the prospect named, or a report plus a follow-up call at a set time: next_step_agreed.
- "Send it on WhatsApp" can be politeness; it is still agreed_to_receive_report, not interested.
- But after a clear no ("we don't require anything", "we already have consultants"), agreeing only to receive your website, company profile or deck "for the future" is still not_interested. agreed_to_receive_report is for a report or document they agreed to look at.
- A warm goodbye after a no is still not_interested.
- Reached someone who is not the listed person or says they are not the right person: wrong_person. Left the company: moved_company.
- Busy, call back at a time: follow_up. Language or line problems: call_again.
- do_not_call only when the prospect asked not to be called again, or said not to send anything again.
- Judge from the prospect's words over the taps when they disagree.

Reply with JSON only, no prose, in exactly this shape:
{"suggested_outcome": "<one outcome key>", "agrees": <true if the caller's outcome is right>, "reason": "<at most 25 words; quote the prospect if you can>", "summary": "<at most 8 words for a list of past calls, like 'Call Thursday 4pm' or 'Has a consultant, not interested'>", "need_in_their_words": "<the prospect's need from stage 5 in their words, or null>"}`;

function describeCall(call, chosen) {
  const byStage = Object.fromEntries((call.stages ?? []).map((s) => [s.stage, s]));
  const lines = STAGES.filter((s) => s.n < 8).map((s) => {
    const r = byStage[s.n];
    if (!r || (!r.tap && !r.words)) return `Stage ${s.n} ${s.name}: (nothing recorded)`;
    const parts = [];
    if (r.tap) parts.push(`tapped "${tapLabel(s.n, r.tap)}"`);
    if (r.words) parts.push(`prospect said: "${r.words}"`);
    return `Stage ${s.n} ${s.name}: ${parts.join('; ')}`;
  });
  return [
    `Prospect: ${call.prospect_name}${call.prospect_role ? `, ${call.prospect_role}` : ''}, ${call.company}${call.company_kind ? ` (${call.company_kind})` : ''}. ${call.call_type === 'follow_up' ? 'Follow-up call.' : 'First call.'}`,
    `Furthest stage reached: ${call.stage_reached}.`,
    ...lines,
    `Next step: ${chosen.next_step_channel ?? 'none'}${chosen.next_step_when ? `, ${chosen.next_step_when}` : ''}.`,
    `Outcome the caller chose: ${chosen.outcome}.`,
  ].join('\n');
}

function rulesCheck(call, chosen) {
  const results = Object.fromEntries((call.stages ?? []).map((s) => [s.stage, s]));
  const suggested = suggestOutcome(results);
  const agrees = suggested === chosen.outcome;
  const need = results[5]?.words ?? null;
  const label = OUTCOMES.find((o) => o.key === suggested)?.label ?? suggested;
  return {
    suggested_outcome: suggested,
    agrees,
    reason: agrees
      ? 'Matches what was tapped during the call.'
      : `The taps during the call point to "${label}".`,
    summary: chosen.next_step_when
      ? `${chosen.next_step_channel ?? 'Next step'} ${chosen.next_step_when}`.slice(0, 60)
      : label,
    need_in_their_words: need,
    source: 'rules',
  };
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in LLM reply');
  return JSON.parse(text.slice(start, end + 1));
}

export function llmConfigured(env = process.env) {
  return Boolean(env.LLM_API_KEY);
}

// LLM_MODEL may be a comma-separated list: models are tried in order, so a
// "high demand" 503 on one falls through to the next, then to the rules.
export function modelList(env = process.env) {
  return (env.LLM_MODEL || 'gemini-3.5-flash-lite,gemini-3.8-flash')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

async function askModel(base, key, model, call, chosen) {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: describeCall(call, chosen) },
      ],
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`${model} HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  const out = extractJson(data.choices?.[0]?.message?.content ?? '');
  if (!OUTCOME_KEYS.includes(out.suggested_outcome)) throw new Error(`${model} gave a bad outcome: ${out.suggested_outcome}`);
  return {
    suggested_outcome: out.suggested_outcome,
    agrees: out.suggested_outcome === chosen.outcome,
    reason: String(out.reason ?? '').slice(0, 400),
    summary: String(out.summary ?? '').slice(0, 200),
    need_in_their_words: out.need_in_their_words ? String(out.need_in_their_words).slice(0, 400) : null,
    source: 'llm',
    model,
  };
}

export async function checkOutcome(call, chosen, env = process.env) {
  if (!llmConfigured(env)) return rulesCheck(call, chosen);
  const base = (env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '');
  for (const model of modelList(env)) {
    try {
      return await askModel(base, env.LLM_API_KEY, model, call, chosen);
    } catch (err) {
      console.error('[llm]', err.message);
    }
  }
  console.error('[llm] all models failed; falling back to rules');
  return rulesCheck(call, chosen);
}
