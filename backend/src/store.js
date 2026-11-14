// Data access. Uses Supabase when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// set; otherwise an in-memory store so the API can run locally with no setup.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const CALL_LIST_COLUMNS =
  'id, prospect_name, prospect_role, company, company_kind, call_type, caller_name, status, started_at, ended_at, duration_seconds, stage_reached, outcome, next_step_channel, next_step_when, need_words, summary';

export class NotFoundError extends Error {
  constructor(what = 'Not found') {
    super(what);
    this.status = 404;
  }
}

function supabaseStore(url, key) {
  const db = createClient(url, key, { auth: { persistSession: false } });

  const must = ({ data, error }) => {
    if (error) {
      const e = new Error(error.message);
      e.status = error.code === 'PGRST116' ? 404 : 500;
      throw e;
    }
    return data;
  };

  return {
    kind: 'supabase',

    async ping() {
      must(await db.from('calls').select('id', { head: true, count: 'exact' }).limit(1));
      return true;
    },

    async createCall(fields) {
      return must(await db.from('calls').insert(fields).select().single());
    },

    async getCall(id) {
      const call = must(await db.from('calls').select('*').eq('id', id).maybeSingle());
      if (!call) throw new NotFoundError('Call not found');
      const stages = must(
        await db.from('stage_results').select('stage, tap, words, updated_at').eq('call_id', id).order('stage'),
      );
      return { ...call, stages };
    },

    async saveStage(callId, stage, { tap, words }) {
      const call = must(await db.from('calls').select('id, status, stage_reached').eq('id', callId).maybeSingle());
      if (!call) throw new NotFoundError('Call not found');
      const row = must(
        await db
          .from('stage_results')
          .upsert(
            { call_id: callId, stage, tap: tap ?? null, words: words ?? null, updated_at: new Date().toISOString() },
            { onConflict: 'call_id,stage' },
          )
          .select('stage, tap, words, updated_at')
          .single(),
      );
      if (stage > call.stage_reached) {
        must(await db.from('calls').update({ stage_reached: stage }).eq('id', callId));
      }
      return row;
    },

    async clearStage(callId, stage) {
      const call = must(await db.from('calls').select('id').eq('id', callId).maybeSingle());
      if (!call) throw new NotFoundError('Call not found');
      must(await db.from('stage_results').delete().eq('call_id', callId).eq('stage', stage));
      const left = must(await db.from('stage_results').select('stage').eq('call_id', callId).order('stage', { ascending: false }).limit(1));
      const reached = left[0]?.stage ?? 1;
      must(await db.from('calls').update({ stage_reached: reached }).eq('id', callId));
      return { stage, cleared: true, stage_reached: reached };
    },

    async closeCall(id, fields) {
      const call = must(await db.from('calls').select('id, started_at').eq('id', id).maybeSingle());
      if (!call) throw new NotFoundError('Call not found');
      const ended = new Date();
      const duration = Math.max(0, Math.round((ended - new Date(call.started_at)) / 1000));
      return must(
        await db
          .from('calls')
          .update({ ...fields, status: 'closed', ended_at: ended.toISOString(), duration_seconds: duration })
          .eq('id', id)
          .select()
          .single(),
      );
    },

    async saveTranscript(id, transcript) {
      must(await db.from('calls').update({ transcript }).eq('id', id));
    },

    async listCalls({ limit, outcome, stage }) {
      let q = db.from('calls').select(CALL_LIST_COLUMNS).order('started_at', { ascending: false }).limit(limit);
      if (outcome) q = q.eq('outcome', outcome);
      if (stage) q = q.eq('stage_reached', stage);
      return must(await q);
    },
  };
}

function memoryStore() {
  const calls = new Map();
  const stages = new Map(); // callId -> Map(stage -> row)

  return {
    kind: 'memory',
    async ping() {
      return true;
    },
    async createCall(fields) {
      const call = {
        id: randomUUID(),
        call_type: 'first',
        status: 'in_progress',
        started_at: new Date().toISOString(),
        ended_at: null,
        duration_seconds: null,
        stage_reached: 1,
        outcome: null,
        next_step_channel: null,
        next_step_when: null,
        need_words: null,
        summary: null,
        ai_check: null,
        ...fields,
      };
      calls.set(call.id, call);
      stages.set(call.id, new Map());
      return call;
    },
    async getCall(id) {
      const call = calls.get(id);
      if (!call) throw new NotFoundError('Call not found');
      return { ...call, stages: [...stages.get(id).values()].sort((a, b) => a.stage - b.stage) };
    },
    async saveStage(callId, stage, { tap, words }) {
      const call = calls.get(callId);
      if (!call) throw new NotFoundError('Call not found');
      const row = { stage, tap: tap ?? null, words: words ?? null, updated_at: new Date().toISOString() };
      stages.get(callId).set(stage, row);
      if (stage > call.stage_reached) call.stage_reached = stage;
      return row;
    },
    async clearStage(callId, stage) {
      const call = calls.get(callId);
      if (!call) throw new NotFoundError('Call not found');
      const rows = stages.get(callId);
      rows.delete(stage);
      call.stage_reached = Math.max(1, ...rows.keys());
      return { stage, cleared: true, stage_reached: call.stage_reached };
    },
    async closeCall(id, fields) {
      const call = calls.get(id);
      if (!call) throw new NotFoundError('Call not found');
      const ended = new Date();
      Object.assign(call, fields, {
        status: 'closed',
        ended_at: ended.toISOString(),
        duration_seconds: Math.max(0, Math.round((ended - new Date(call.started_at)) / 1000)),
      });
      return call;
    },
    async saveTranscript(id, transcript) {
      const call = calls.get(id);
      if (!call) throw new NotFoundError('Call not found');
      call.transcript = transcript;
    },
    async listCalls({ limit, outcome, stage }) {
      return [...calls.values()]
        .filter((c) => (!outcome || c.outcome === outcome) && (!stage || c.stage_reached === stage))
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .slice(0, limit)
        .map(({ ai_check, transcript, ...rest }) => rest);
    },
  };
}

export function createStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return supabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  console.warn('[store] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: using in-memory store (data is lost on restart).');
  return memoryStore();
}
