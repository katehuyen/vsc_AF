# `_REF/` — On-Demand Reference Files

The **procedure** layer of the constitution. The constitution core (`ajanlar/CLAUDE.md`) loads automatically on every turn and is expensive; the files here are read **only when that job comes up**.

**Mechanism:**
1. The core carries a **one-line trigger** for each procedure ("If you are about to do X → `_REF/x.md`").
2. The trigger is a **rule** — it is in context every turn, not probabilistic (Principle 1).
3. The body sits here and burns tokens only when actually read.

**Rule:** When applying a procedure, **read its file first.** Never work from memory.

**What belongs here:** conditional procedures (recipes consulted while doing a job).
**What does NOT:** unconditional behavior rules — those stay in the core.

| File | When to read |
|---|---|
| `notices.md` | Sending the user news / a report / a question |
| `queue.md` | Working with the work queue (`queue.*`) |
| `bridge.md` | Calling Agent Farm |
| `project-bootstrap.md` | Starting a new project or repo |
| `engineering.md` | Writing or changing code in any repo |
| `test-discipline.md` | Tests and the commit gate in any repo |
| `ui-conventions.md` + `ui-patterns.md` | Touching UI in any project (visual gate, five names, patterns) |
| `agentfarm-dev.md` | Developing in the `vsc_AgentFarm` codebase |
| `agentfarm-android-dev.md` | Developing in the `and_AgentFarm` codebase (Android companion) |
| `vault-write.md` | Writing or moving a file in the vault |
| `agent-area.md` | Working inside `00_AGENT_AREA` |
| `git.md` | Making a commit |
| `web.md` | Going to the web when Layer 1 was not enough |
| `research-hunt.md` | Researching/finding anything on the web (trigger: explorer `CLAUDE.md`, Prime Directive) |
| `missions.md` | Delegating work to another agent |
| `model-economy.md` | Choosing a model for a job |
| `automation-gate.md` | Creating/editing a schedule or trigger |
| `lang.md` | Hesitating at a language boundary |
| `icons.md` | Using a status icon or symbol |
| `duties.md` | Writing or editing a `DUTIES.md` |
| `cross-engine.md` | Changing the constitution or an agent `CLAUDE.md` (other engines carry copies) |

**Maintenance:** When adding a new file, add its trigger line to the core too — a `_REF` file without a trigger is dead. File ceiling ≤2,000 tokens; split by topic if it grows. The full decision tree for where things go is in the constitution's Optimization Principles.
