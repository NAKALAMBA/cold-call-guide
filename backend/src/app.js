import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import {
  uuidParam,
  startCallSchema,
  stageParam,
  stageResultSchema,
  checkSchema,
  closeCallSchema,
  listQuerySchema,
} from './schemas.js';
import { checkOutcome, llmConfigured } from './llm.js';
import { AUDIO_TYPES, transcribeCall, transcriptText, transcriptionAvailable } from './transcribe.js';

const MAX_AUDIO_MB = 12;

// Wrap async handlers so thrown errors reach the error middleware.
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp({ store, env = process.env }) {
  const app = express();

  const origins = (env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(cors({ origin: origins.length ? origins : true }));
  app.use(express.json({ limit: '32kb' }));

  // Tiny request log: method, path, status, ms.
  app.use((req, res, next) => {
    const t = Date.now();
    res.on('finish', () => console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`));
    next();
  });

  // Health: answers as soon as the server is up. ?deep=1 also checks the database.
  app.get('/health', route(async (req, res) => {
    const body = { status: 'ok', service: 'meridian-call-guide', store: store.kind, llm: llmConfigured(env), transcription: transcriptionAvailable(env), time: new Date().toISOString() };
    if (req.query.deep) {
      try {
        await store.ping();
        body.db = 'ok';
      } catch (e) {
        return res.status(503).json({ ...body, status: 'degraded', db: e.message });
      }
    }
    res.json(body);
  }));

  // Start a call.
  app.post('/api/calls', route(async (req, res) => {
    const fields = startCallSchema.parse(req.body);
    res.status(201).json(await store.createCall(fields));
  }));

  // List calls, newest first, with the stage each one reached.
  app.get('/api/calls', route(async (req, res) => {
    res.json(await store.listCalls(listQuerySchema.parse(req.query)));
  }));

  // One call with what happened at each stage.
  app.get('/api/calls/:id', route(async (req, res) => {
    res.json(await store.getCall(uuidParam.parse(req.params.id)));
  }));

  // Save what happened at one stage (idempotent: saving again overwrites; empty clears it).
  app.put('/api/calls/:id/stages/:stage', route(async (req, res) => {
    const id = uuidParam.parse(req.params.id);
    const stage = stageParam.parse(req.params.stage);
    const body = stageResultSchema(stage).parse(req.body);
    // No tap and no words means the caller cleared this stage: remove it.
    if (!body.tap && !body.words) return res.json(await store.clearStage(id, stage));
    res.json(await store.saveStage(id, stage, body));
  }));

  // Ask the LLM whether the outcome the caller picked matches the call. Saves nothing.
  app.post('/api/calls/:id/check', route(async (req, res) => {
    const id = uuidParam.parse(req.params.id);
    const chosen = checkSchema.parse(req.body);
    const call = await store.getCall(id);
    res.json(await checkOutcome(call, chosen, env));
  }));

  // Upload a call recording (raw audio body). Gemini transcribes it and maps it
  // onto the stages. The transcript is stored; the stage suggestions are only
  // returned, for the caller to accept or ignore on the close screen.
  app.post(
    '/api/calls/:id/recording',
    express.raw({ type: () => true, limit: `${MAX_AUDIO_MB}mb` }),
    route(async (req, res) => {
      const id = uuidParam.parse(req.params.id);
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const mime = AUDIO_TYPES[type];
      if (!mime) return res.status(415).json({ error: `Send an audio file (mp3, m4a, wav, ogg, webm). Got "${type || 'nothing'}".` });
      if (!req.body?.length) return res.status(400).json({ error: 'The recording is empty.' });
      await store.getCall(id); // 404 if the call does not exist
      const result = await transcribeCall(req.body, mime, env);
      await store.saveTranscript(id, transcriptText(result));
      res.json(result);
    }),
  );

  // Close a call: outcome, next step, the stage-5 words, the list summary.
  app.post('/api/calls/:id/close', route(async (req, res) => {
    const id = uuidParam.parse(req.params.id);
    const body = closeCallSchema.parse(req.body);
    const call = await store.getCall(id);
    const need = call.stages.find((s) => s.stage === 5)?.words ?? null;
    const summary = body.summary ?? body.ai_check?.summary ?? null;
    res.json(await store.closeCall(id, { ...body, summary, need_words: need }));
  }));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // Error middleware: validation errors are 400 with the field messages.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body is not valid JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: `The file is too large. Keep recordings under ${MAX_AUDIO_MB} MB (an mp3 of a 10-minute call is about 5 MB).` });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
  });

  return app;
}
