# LeadFlow AI — AI Sales & Appointment Agent

An agentic AI that talks to inbound website leads, checks the CRM, qualifies and scores them,
asks follow-up questions, books meetings into the calendar, sends confirmations and updates the
CRM, **logging every tool call** to a live dashboard.

```
Website lead → AI agent → understand → check CRM → create lead → qualify / follow-ups
            → score → check calendar → book meeting → send confirmation → update CRM
```

| Layer    | Stack |
|----------|-------|
| Agent    | **LangGraph** state machine (`agent ⇄ tools`) · **Claude** via `langchain-anthropic` · deterministic built-in policy when no API key |
| Tools    | `search_customer()` `create_lead()` `update_lead()` `check_calendar()` `book_meeting()` `send_email()` |
| Backend  | FastAPI · SQLAlchemy 2 (async) · SQLite by default / Postgres in prod · Server-Sent Events streaming · structlog |
| Frontend | React 19 · Vite · Tailwind v4 · Motion (scroll & layout animations) · custom SVG charts |

---

## Run it (local)

**Prerequisites:** [uv](https://docs.astral.sh/uv/) (Python 3.11+) and Node 20+.

```bash
npm install          # root helper (concurrently)
npm run setup        # uv sync (API) + npm install (web)
npm run dev          # API on :8000 + web on :5173
```

Open **http://localhost:5173** for the website and chat, and **http://localhost:5173/dashboard** for the dashboard.

On first start the API creates `apps/api/leadflow.db` and seeds 16 demo leads. Each one is run through the
real agent, so the dashboard starts with realistic conversations, scores, meetings and actions.
To start empty, set `LEADFLOW_SEED_DEMO_DATA=false` or delete the `.db` file.

### Single process (production-style)

```bash
npm start            # builds the dashboard, then serves UI + API on http://localhost:8000
```

### Docker (with Postgres)

```bash
docker compose up --build      # http://localhost:8000
```

### Tests & lint

```bash
npm test             # pytest (agent flows, API, SSE, LLM path) + TypeScript typecheck
npm run lint
```

---

## Turn on Claude

Without an API key the agent runs a **built-in deterministic policy**. It uses the same LangGraph
graph, the same tools and the same audit log, so the whole product works offline. To let Claude
drive:

```bash
cp apps/api/.env.example apps/api/.env
# then set ANTHROPIC_API_KEY=sk-ant-...   (model: LEADFLOW_ANTHROPIC_MODEL, default claude-opus-5)
```

If a Claude call fails (network, rate limit), that step falls back to the built-in policy so the lead
is never dropped. The dashboard sidebar shows which brain is active.

All settings are listed in [`apps/api/.env.example`](apps/api/.env.example): database, timezone, business
hours, meeting length, qualification threshold, SMTP and more.

---

## Project layout

```
apps/
  api/                       FastAPI + LangGraph backend (uv project)
    src/leadflow/
      agent/
        graph.py             LangGraph: agent node (Claude | built-in) ⇄ audited tools node
        tools.py             the 6 tools (CRM, calendar, email)
        policy.py            deterministic policy used when no LLM key is set
        prompts.py           system prompt for Claude
        runner.py            runs a turn, streams events, persists history
      services/              scoring (BANT 0-100), extraction, calendar, email
      api/routes.py          REST + SSE endpoints
      models.py              leads, conversations, messages, appointments, agent_actions, emails
      seed.py                demo data (produced by the real agent)
      main.py                app factory; serves the built dashboard at /
    tests/                   pytest suite
  web/                       React dashboard + marketing site with the live chat widget
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/inbound` | Website form → runs the agent, returns JSON (webhook-friendly) |
| POST | `/api/inbound/stream` | Same, streaming agent events over SSE |
| POST | `/api/conversations` | Start an empty chat |
| POST | `/api/conversations/{id}/messages[/stream]` | Send a message to the agent |
| GET  | `/api/dashboard` | KPIs, time series, pipeline, score distribution, tool usage |
| GET  | `/api/leads`, `/api/leads/{id}` | CRM |
| GET  | `/api/conversations`, `/api/conversations/{id}` | Transcripts with tool calls |
| GET  | `/api/appointments` · POST `/api/appointments/{id}/cancel` | Calendar |
| GET  | `/api/actions` | Agent audit log |
| POST | `/api/demo/simulate` | Push a random sample lead through the agent |
| GET  | `/api/health` | Status, active brain, DB |

Interactive docs: **http://localhost:8000/docs**

SSE events: `conversation`, `action_start`, `action_end`, `lead`, `message`, `notice`, `error`, `done`.

## Lead scoring

| Signal | Points |
|--------|--------|
| Need / fit with services | 0–30 |
| Budget | 0–25 |
| Timeline | 0–20 |
| Authority (decision maker / influencer) | 0–15 |
| Team size | 0–10 |

Score ≥ 60 (configurable) with all facts known → offered calendar slots. Below that, the lead moves to
**nurture** and gets a resources email. Each score is stored with a line-by-line breakdown.
