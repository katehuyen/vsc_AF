---
id: costs-and-usage
title: Answer cost, spend and quota questions
area: insights
summary: Today's spend and why, per project or agent, plan quota windows per account and engine, and how to read the figures honestly.
intents:
  - how much did we spend today
  - why was today expensive
  - how much quota is left
  - cost of this project
  - which agent costs the most
keywords: [cost, spend, money, price, quota, usage, limit, budget, expensive, tokens]
ops: [now.get, reports.cost, projects.cost, usage.plan, usage.engines, accounts.list, pricing.rules, reports.fleet]
---
## Steps
- Today and the quota at a glance: `now.get`.
- Why today was expensive: `reports.cost`.
- One project: `projects.cost project=<p>`. The fleet over a week: `reports.fleet days=7`.
- Quota: `usage.plan` (Claude 5-hour and weekly), `usage.engines` (every engine), `accounts.list` (per account).
- Models billed at $0 because nobody priced them: `pricing.rules` → `unpriced`.

## Reading figures
Claude and OpenCode state their own price; other engines report tokens, so their dollars are derived from price rules or absent. On subscriptions the dollar figure is the API-equivalent value, not a bill. Quote quota figures exactly, with the account and window they belong to.
