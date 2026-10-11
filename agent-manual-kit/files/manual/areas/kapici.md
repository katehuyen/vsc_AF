---
id: kapici
title: Gatekeeper (kapici) — cheap typed decisions
order: 19
summary: Ask narrow yes/no, choice or score questions through rules (local checks first, then a small classifier, then an LLM judge); audit and rule checks.
ui: Farm Settings ▸ Gatekeeper
keywords: [gatekeeper, kapici, decide, decision, classify, yes no, judge, rule, is there work, should it continue, routing decision]
related: [automation, workflows, tasks]
---
# Gatekeeper

Ops keep the internal name `kapici`. The Gatekeeper answers typed questions (`noul` = yes/no, `choice`, `score`) from a **rule**, trying providers in order: `heuristic` (local checks, free), a small classifier (needs a key), then an LLM judge (slow, costs a call). It is an add-on: its consumers (dispatch, retry, trigger precondition, workflow step) are off by default and switched by the user (`off | shadow | on`).

- Status and key presence (never the value): `kapici.status`. Rules: `kapici.rules`. Recent decisions and shadow agreement: `kapici.audit`.
- Evaluate: `kapici.eval rule=<id> state="..."` (or `statePath=<abs path>`). One-off without a rule: `kapici.ask` with `questions={...}`.
- Check a rule's golden examples: `kapici.rule.check rule=<id>` (real calls).
- MCP tools for Claude Code: `kapici.mcp`, `kapici.mcp.register`.

Rules: do not send counting, numbers or dates to a model (use a rule `check`); never send secrets or whole transcripts; switching a consumer to `on` is the user's decision.
