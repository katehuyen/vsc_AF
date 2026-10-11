# Research Hunt — Exhaust Every Route Before Reporting a Miss

"I looked, it wasn't there" is **not a deliverable.** The user can do that themselves in ten seconds; an agent that returns it has produced negative value. A miss may be reported **only** after Phase A and Phase B below are genuinely exhausted, and the report must **name the routes tried**.

## Phase A — Exhaust the page you are already on

**The rendered DOM is not what WebFetch saw.** WebFetch reads server HTML through a small model; on any marketplace, forum, or JS app the reviews, Q&A, spec table, and package contents load later or sit behind a tab. **If the answer could plausibly be on that page, open it in Playwright before concluding anything.**

Mine every zone — a page is not "read" until these are checked:

| Zone | Why it pays |
|---|---|
| **Reviews — paginated** | The highest-yield zone. Buyers state what physically arrived, what confused them, what it actually does. |
| Review filters | Sort **newest** and **lowest-rating**; filter **with photo/video**. Complaints and confusion answer "what did I actually get" questions. |
| Q&A / buyer questions | Direct answers to exactly the question the user is asking. |
| Spec table / attributes | Package contents, model code, dimensions. |
| Description **images** | On Asian listings the real spec sheet and packing list live *inside* the images, not in text. Read them. |
| Variant selector | The variant the user bought may differ from the default shown. |
| Seller / shop info | Model codes and sibling listings to pivot on. |

Mechanics: tabs and lazy blocks need a **click, then read the container's `innerText` via `browser_evaluate`** — the accessibility snapshot alone routinely misses lazily mounted content. Paginate; page 1 is not the review section.

**When the user's own confusion is the question, the strongest possible evidence is another buyer with the identical confusion.** Go find them in the reviews.

## Phase B — Pivot outward; the page is a starting point, not a boundary

First **harvest identifiers** from the page: brand + model code, exact title, SKU/item id, EAN/UPC, seller name, listing photos. Every one of them is a search key.

Then hunt the same thing elsewhere, in this order of yield:

1. **Manufacturer's own site + the product manual** (`manuals.plus` and similar). For "what's in the box" the manual is definitive.
2. **The origin-country listing.** Chinese-origin goods: Taobao / 1688 / JD carry the fullest spec and an explicit packing list (`包装清单`). Search **in the source language** — Vietnamese listing → also search Vietnamese and Chinese, not just English.
3. **Sibling platforms:** Amazon, AliExpress, Shopee/Lazada in other countries, local resellers. The same SKU is described five different ways; one of them is clear.
4. **Community layer:** Reddit, specialist forums, YouTube review **descriptions and comments**, Instagram/TikTok reel comments.
5. **Reverse-image search** the listing photo when the product name is generic and unsearchable.

## Phase C — Reporting

- Found it: state the answer, quote the decisive evidence, cite where it came from + date.
- Genuinely not found: say what the question needs, **list the routes you exhausted**, and name the one remaining route the user could take (ask the seller, a login you lack, a paywalled source).
- Never fill a gap with a guess (constitution: no invention). But never reach for that sentence early either — it is the last exit, not the first.
