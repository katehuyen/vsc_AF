# Changelog

All notable changes to Agent Farm. Detailed Turkish release notes live in the built-in guide (`Agent Farm: Open Guide` → Sürüm Notları).

## 2.0.0 — Natural-Language Command & Dispatcher (2026-07-09)

- **Natural Language Command…**: one sentence → cheap-model plan (task / schedule / multi-step workflow) → human-readable preview → installed only on approval. Agent names are validated; relative times ("tomorrow 9:00") resolve against the current date.
- **Dispatcher**: new trigger action "Dispatch — route to the best agent". Regex rules first (`agentFarm.dispatchRules`), cheap-model classifier fallback using CLAUDE.md role hints (`agentFarm.dispatchClassifier`). `Test Dispatcher…` dry-runs routing.
- Phase F status: F1/F2 shipped; browser automation (F3) achievable today via a browser MCP server; the voice loop (F4) is documented as a recipe (Whisper + watch/dispatch trigger); multi-CLI (F5) deferred.

## 1.3.0 — Antigravity Compatibility (2026-07-09)

- **Sync Agent with Antigravity…**: generates `AGENTS.md` from `CLAUDE.md`, turns active duties into `.agents/workflows/` slash-commands, and prepares an MCP merge suggestion; `memory/` is shared as-is (plain markdown).
- **Directional sync**: content fingerprints detect which side moved — refresh forward (Claude → Antigravity), carry hand-edits back (Antigravity → Claude, with backups), or resolve conflicts via diff; foreign files and hand-edited workflows are never overwritten silently.
- Insights: `antigravity` category reminds you when the two sides drift.

## 1.2.0 — Scale & Portability (2026-07-09)

- **Multi-machine**: `agentFarm.extraClaudeDirs` watches synced `.claude` folders from other machines; their sessions appear with a ⇄ machine badge and are matched to agents by working directory.
- **Daily digest**: compact phone-friendly fleet scorecard posted to your webhook (n8n → Telegram) at a configured time — no model call. `Send Daily Digest Now` for manual runs.
- **Agent packs**: `Export Agent Pack…` / `Import Agent Pack…` — identity, duties, tools and the agent's workflows/triggers/schedules in one `.agentpack` file. Memory and secrets are never included; imported triggers/schedules arrive disabled.
- Marketplace prep: LICENSE, CHANGELOG, README refresh, privacy statement.

## 1.1.0 — Smart Supervision (2026-07-09)

- **Quality scorecard**: a cheap-model judge samples recent sessions (1-5); Quality column on the dashboard and fleet report; decline-trend and low-average warnings in Insights.
- **Instruction suggestions**: repeated user corrections in transcripts become proposed CLAUDE.md rules — reviewed and applied only with explicit approval.
- **Weekly summary**: a three-sentence human-language fleet status note (budget/trend/errors/quality), as a notification, vault file and webhook event.
- **Transcript search**: text/regex search across all session transcripts with agent filter and highlighted context.
- All automatic loops ship disabled; internal helper calls always use a cheap model.

## 1.0.0 — Content Factory (2026-07-09)

- **Media steps**: image/video/audio generation via the fal.ai queue API inside workflows; assets download into the outputs archive.
- **Media gallery** with previews, Re-run/Vary; **media cost** estimation and dashboard card; ready-made **recipes** (Text→Image, Text→Image→Video, Speech→Text).

## 0.9.0 — Outside-World Bridge (2026-07-09)

- Secrets vault (OS keychain), MCP server panel with usage counts, webhook workflow steps, inbound `/trigger/<token>` endpoint, notification forwarding to any webhook.

## 0.8.0 — Automation Core (2026-07-09)

- Triggers (file watch / hook / webhook), cheap-model verify steps with retry, structured JSON handoffs (`{prev_json.field}`), concurrency limits + quota guard, monthly task history.

## 0.1.0 – 0.7.3 (2026-07-08)

- Fleet dashboard, cost analytics, session explorer, health insights, live hook-based monitoring and timeline, task queue and schedules, multi-agent workflows, standing duties (DUTIES.md), shared-memory sync, fleet reports, Turkish guide and examples, real-run test campaign.
