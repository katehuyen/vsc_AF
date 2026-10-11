---
id: insights
title: Insights, reports and evals — health, cost, quality
order: 18
summary: Health findings, cost and fleet reports, task analytics, trigger reliability, regression evals, instruction suggestions, quality scoring, OTLP export.
ui: Insights view in the sidebar; "Agent Farm: Open Dashboard", "Open Task Analytics"
keywords: [insight, health, finding, report, cost report, why expensive, spend, fleet report, analytics, success rate, eval, regression, quality, score, suggestion, learned rule, otlp, telemetry export]
related: [accounts, tasks, agents]
---
# Insights, reports and evals

## Common intents
- What is wrong or could be better: `insights.list` (each finding has a stable `key`); hide one: `insights.dismiss key=<k> days=7`; hand findings to an agent as one run: `insights.delegate key=<k> agent=<a> confirm=true` (cost-bearing).
- Why was today expensive: `reports.cost`. Per project: `projects.cost`. Plan quota: `usage.plan`.
- How the fleet is doing: `reports.fleet days=7` (Markdown; `save=true` files it in the report folder).
- What headless runs produced today: `reports.outputs days=1`.
- Task throughput, success, durations, forecast: `reports.tasks` (JSON), `tasks.analytics.export` (Markdown).
- Are triggers reliable: `reports.triggers`.
- Did an instruction rewrite help: `reports.instructions agent=<a>`.
- Regression cases: `evals.add agent=<a> input="..." expectation="..."`, `evals.list`, `evals.runs agent=<a>`.
- Rules the user keeps repeating: `suggestions.list`, then `suggestions.apply id=<id>` (appends to the agent's CLAUDE.md in the section Agent Farm owns) or `suggestions.dismiss`.
- Cost-bearing on request only: `quality.sample confirm=true`, `reports.weekly confirm=true`, `suggestions.scan agent=<a> confirm=true`.
- Traces for observability tools: `export.otlp days=7`.

## Reading figures
Costs are computed from Claude and OpenCode transcripts where the engine states a price; other engines report tokens, priced only by `pricing.rules`. Say which figure you quote.
