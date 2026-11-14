# Meridian Call Guide

The screen a caller keeps open on a cold call. It keeps them on the eight stages of the call, shows what prospects tend to say at each one, records what happened with one tap and the prospect's own words, and checks the logged outcome against the call before saving it.

Built for the DeepThought Forward Deployed Engineer task, from a reading of 100 cold-call transcripts. The caller's company, Meridian Growth Partners, is fictional.

| | |
|---|---|
| **Live app (Vercel)** | `https://REPLACE-ME.vercel.app` |
| **Backend health (Render)** | `https://REPLACE-ME.onrender.com/health` |
| **LLM** | Google Gemini `gemini-3.8-flash` (free tier), through its OpenAI-compatible endpoint. Used for one thing: checking the outcome at the close of a call. See [The LLM](#the-llm). |
| **Database** | Supabase Postgres, schema in [supabase/schema.sql](supabase/schema.sql) |

> The Render free tier sleeps when idle. The first request after a while takes up to a minute; the app shows a "waking the server" banner while it does.

## What the screen does

1. **New call**: prospect, role, company, kind of company, first call or follow-up.
2. **The guide, stage 1 to 7.** Each stage shows:
   - the stage, its number, what it is for, and one instruction the caller can read at a glance;
   - **how many of the 100 transcribed calls ended at this stage**, and what ended them;
   - three things prospects actually said at this point, from the transcripts;
   - up to six taps for what happened (number keys 1–6 work too);
   - one box for the prospect's words (at stage 5 it is highlighted: this is the line the next call is built on);
   - the next stage by name, and **End call** from any stage. A tap that ends the call ("Wrong number", "Has left the company") turns the main button into "End call: Wrong person".
   - Stage pills are tappable, because real calls skip stages: most go 1 → 2 → 6 or 7.
3. **Close (stage 8)**: everything recorded, the stage-5 words (or a warning that the need was never heard), the outcome (pre-selected from the taps), the next step and when. **Check and save** runs the LLM check first; if the log and the call disagree, the caller sees why and picks one.
4. **Past calls**: every call with the stage it reached, a one-line summary, and a small chart of where your calls end, next to where the 100 transcripts ended. Tap a stage to filter. A call that was started and never closed shows as "Not logged", which is what happened to 13 of the 100 transcripts.

## What the transcripts said, and what that changed on the screen

I read all 100 and labelled each one with the stage it ended at and whether the logged outcome matched the call. The labels are in [analysis/where-calls-end.csv](analysis/where-calls-end.csv). The transcripts themselves are not in this repo; they are not for publishing.

**Where calls end**

| Stage | Calls that ended here |
|---|---|
| 1 Opening | 15 |
| 2 Purpose | 7 |
| 3 Permission | 6 |
| 4 Their business | 1 |
| 5 Their need | 1 |
| 6 Objection | 24 |
| 7 Next step | 46 |

What I took from that:

- **Stages 4 and 5 are nearly empty, and not because they go well.** Callers skip them: after the purpose they pitch the report and go straight to "can I send it". The few calls where a caller asked about the prospect's business are the ones where the prospect corrected the picture ("we are only manufacturing", "job work", "we are the market leader") or named a need ("skilled manpower", "new products with our facility", "sustainability for EU buyers"). So stage 5's words box is the one the screen makes loudest, and the close screen warns when it is empty.
- **15 calls ended at the opening**: a number reassigned 10 or 14 years ago, someone who left, a company since acquired, a Kannada speaker. Several only came out after a full pitch. Stage 1's instruction is "confirm the name and the company before anything else", and those taps end the call in one press.
- **"From where?" came up in 33 of 100 calls.** The company name is not heard the first time. Stage 2 says: name, company, city, slowly.
- **Objection is where most calls stop (24).** The reasons, in order: not the right person (about 15), "what does it cost / why is it free / how do you benefit" (about 10), already have consultants, the big four, or an internal team (7), "you are a third party, I can't share data". Those are the taps.
- **"Send it on WhatsApp" is most of stage 7**, and it is often politeness. A time the prospect names ("Tuesday, after 2 PM") is worth more, so "call at a time they named" is its own tap and stage 7 asks for the time and channel.
- **26 of 100 logged outcomes did not match the call, and 21 more only partly did.** 13 logged nothing, including a call with a report on WhatsApp and a Tuesday 10:30 call agreed (T046). One call with a report and a Thursday call agreed was logged `do_not_call` (T084). That is why the LLM sits at the close.

## The LLM

**What it does:** at the close, it reads what the caller tapped at each stage, the prospect's words, the next step, and the outcome the caller picked, and says whether the outcome matches the call. It returns the outcome it would log, a reason (quoting the prospect where it can), a one-line summary for the past-calls list, and the stage-5 need in the prospect's words.

**Why there and nowhere else:** during the call the caller should be listening, not reading generated text. After the call, the record is what the next call is built on, and in the transcripts a quarter of the records were wrong. A check costs the caller one second and catches the expensive mistake.

**Model:** Gemini `gemini-3.8-flash` on the free tier, called through the OpenAI-compatible endpoint, so any compatible provider (Groq, OpenRouter) works by changing three env vars. The prompt is in [backend/src/llm.js](backend/src/llm.js); it carries the outcome definitions the callers used and the rules from the transcripts ("send it on WhatsApp is still agreed_to_receive_report", "a warm goodbye after a no is still not_interested").

**If the LLM is down or no key is set,** the check falls back to deterministic rules from the taps ([shared/stages.js](shared/stages.js), `suggestOutcome`), and the screen says which one checked it. The app never blocks on the LLM.

## Architecture

```
frontend/   React + Vite, deployed on Vercel
backend/    Node + Express, deployed on Render
shared/     stages.js: the eight stages, taps, quotes, outcome words. Imported by both.
supabase/   schema.sql
analysis/   where-calls-end.csv: my stage label for each of the 100 calls
```

### API

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Answers when the server is up. `?deep=1` also checks the database. |
| POST | `/api/calls` | Start a call. Body: `prospect_name`, `company`, optional `prospect_role`, `company_kind`, `call_type`, `caller_name`. |
| PUT | `/api/calls/:id/stages/:stage` | Save what happened at a stage: `tap` and/or `words`. Upserts, so saving again is safe. Raises `stage_reached`. |
| POST | `/api/calls/:id/check` | LLM check of an outcome against the call. Saves nothing. |
| POST | `/api/calls/:id/close` | Close a call: `outcome`, `next_step_channel`, `next_step_when`, `summary`, `ai_check`. |
| GET | `/api/calls` | List calls, newest first. Filters: `outcome`, `stage`, `limit`. |
| GET | `/api/calls/:id` | One call with every stage result. |

Every body is validated with zod (a tap must belong to its stage; outcomes must be one of the nine words). Validation errors come back as 400 with the field and message. Middleware: CORS restricted to the Vercel origin, JSON body limit, request log, error handler.

### Data

Two tables: `calls` (one row per call, with `stage_reached`, `outcome`, next step, `need_words`, `summary`, `ai_check`) and `stage_results` (one row per call per stage, unique on `(call_id, stage)`). RLS is on with no policies; only the backend, with the service-role key, can read or write.

## Run it locally

```bash
# backend: runs with an in-memory store if no Supabase env is set
cd backend
cp .env.example .env      # fill in Supabase + LLM key, or leave blank
npm install
npm run dev               # http://localhost:8080/health
npm test                  # API tests, including a replay of T084

# frontend
cd frontend
cp .env.example .env      # VITE_API_URL=http://localhost:8080
npm install
npm run dev               # http://localhost:5173
```

## Deploy

1. **Supabase**: new project → SQL Editor → run `supabase/schema.sql`. Copy the project URL and the service-role key (Project Settings → API).
2. **Render**: New → Blueprint → this repo (uses `render.yaml`), or New → Web Service with root directory `backend`, build `npm install`, start `npm start`, health check `/health`. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, and `CORS_ORIGINS` (your Vercel URL).
3. **Vercel**: New Project → this repo, root directory `frontend`, framework Vite. Set `VITE_API_URL` to the Render URL. Then add the Vercel URL to `CORS_ORIGINS` on Render.
