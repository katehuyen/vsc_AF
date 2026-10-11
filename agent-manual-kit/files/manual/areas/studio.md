---
id: studio
title: Studio and media — productions, generated assets, media library, publishing
order: 20
summary: Media productions with scenes and brand kits, generated assets and triage, the local media library (Airtable engine), content calendar, ffmpeg recipes, browser recipes, editing exports.
ui: "Agent Farm: Open Studio", "Open Media Gallery", "Open Airtable Engine"
keywords: [studio, media, image, video, audio, generate, production, scene, brand kit, asset, gallery, triage, keep, reject, export timeline, premiere, fcpxml, edl, airtable, media library, calendar, publish, ffmpeg, recipe, browser]
related: [workflows, automation]
---
# Studio and media

## Model
Media work runs through **workflows** whose steps generate (media steps on providers such as fal.ai), process (tool steps running local ffmpeg recipes), browse (browser steps on signed-in recipe profiles), select (asset pickers) and publish (webhooks). The Studio organises the results:
- A **production** (`production.json` in an agent folder) has scenes (`draft → generating → review → approved`) and a **brand kit** that steps read as `{brand.style}`, `{brand.character.<key>.ref}`.
- **Assets** are generations in the outputs folder; triage keeps or rejects them; approved assets export as an editing timeline.
- The **media library** files every produced file into `media_<base>/<image|video|audio>/<stage>/` (stages source, raw, semi, final, asset) with a record in the local Airtable engine.
- The **content calendar** holds one note per planned publish.

## Common intents
- Productions: `studio.productions`, `studio.production.new`, `studio.scene.status`, `studio.brand.get`, `studio.brand.set`.
- Assets: `studio.assets state=undecided`, `studio.triage taskId=<id> keep=true`, `studio.assign`, `studio.rerun` (again, vary, reseed), `studio.export project=<production> format=fcpxml`.
- Library: `media.find query="..."`, `media.library`, `media.record`, `media.restage`, `media.allin` (process the drop folder; `apply=true` acts).
- Calendar: `calendar.list`, `calendar.add`, `calendar.set`.
- Local processing without a model: `tools.recipes`, `tools.run`.
- Browser recipes: `browser.recipes`; first sign-in: `browser.login` (the user signs in).
- Airtable engine: `airtable.status`, `airtable.instances`, `airtable.start`.

## Rules
Generation, enrichment and model looks cost money: run them only as asked. Media workflows are built with `workflows.add` (area workflows).
