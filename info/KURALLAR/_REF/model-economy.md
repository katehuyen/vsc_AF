# Model Economy — Picking the Cheapest Sufficient Model

Agent Farm's price table ($ per 1M tokens, `src/core/pricing.ts`):

| Model | input | output | cache-write | cache-read | Rough ratio |
|-------|-------|--------|-------------|------------|-------------|
| **opus** | 15 | 75 | 18.75 | 1.5 | baseline (most expensive) |
| **fable/mythos** | 15 | 75 | 18.75 | 1.5 | opus tier (premium) |
| **sonnet** | 3 | 15 | 3.75 | 0.3 | ~opus/5 |
| **haiku** | 1 | 5 | 1.25 | 0.1 | ~opus/15 |

**Job → model mapping:**
- **Mechanical, well-defined, low-risk** (file/format work, scheduled maintenance, simple checks, data collection) → **haiku**. ~15× cheaper.
- **Analysis, multi-step, medium difficulty** (research, synthesis, medium code, writing) → **sonnet**. ~5× cheaper; the sweet spot for most work.
- **Hard reasoning, architecture, risky/live products, fine design judgment** → **opus** (the owning agent's strong model).

**Rule:** Give the hardest part of the job the model it needs, and downgrade everything else. If unsure, start one tier cheaper and escalate — a failed expensive attempt costs more than a cheap one.

**Run economy:** Cost is per **agent run**, not per agent. An idle agent is free; a running one pays a fixed startup toll (its prompt prefix being written into cache). So: do not split one job across more runs than it needs, and on routine scan/watch turns use the cheapest sufficient model at low effort.

**Claude session quota (5-hour vs 7-day):** `five_hour` is a handover trigger; `seven_day` is account-wide and never one. Triggers, the probe and the protocol: `_REF/handover.md`.

**Testing:** real Claude tests always use haiku (sonnet if unavailable) at the lowest effort.

If the price table changes, update this file — it is a fact, not a judgment call, so no need to ask first.
