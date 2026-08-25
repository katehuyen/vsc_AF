# X-46 — Adaptif Misyonlar Uçtan Uca Kabul Matrisi

X-46, X-32'nin (Adaptive Missions) kapanış kapısıdır. Kalemin kendisi uzun bir
**otomatik matris** sayar: "şu davranış da kanıtlansın" diyen yirmi dört madde.
Bu belge o matrisin **eşleme tablosudur** — her maddenin karşısında onu gerçekten
ölçen testin dosyası ve iddiası yazılıdır.

Belgenin varlık sebebi tek cümlede: **eşleme tablosu yoksa kapıyı geçtiğimizi
kimse kanıtlayamaz.** 14000'i aşkın test yeşil olabilir ve matrisin bir maddesi
yine de ölçülmemiş olabilir; "hepsi test edilmiştir" bir iddiadır, tablo ise
adres verir.

## ‼️ Tablo kendi kendini denetler

Bu belge prose değil, **veridir**. `test/test_x46_matrix.js` aşağıdaki tabloyu
okur ve her satır için şunu sorar: bu dosya duruyor mu, bu iddia hâlâ o dosyanın
içinde mi, her matris maddesinin en az bir kanıtı var mı. Bir test silinir,
yeniden adlandırılır ya da iddiası değişirse **`npm test` kırılır** ve tablo
yeniden işaretlenmek zorunda kalır. Yani tablo bayatlayamaz.

Denetim kasıtlı olarak testleri **yeniden koşturmaz** — yeşil oldukları zaten
`npm test`'in kendi toplamıdır; burada ölçülen şey **işaretin doğru yeri
gösterdiğidir.** İki ayrı sorunun iki ayrı kapısı vardır.

Kanıt metni, testin kaynağındaki `ok(...)` etiketinin ya da bölüm başlığının
(`-- ...`) birebir kendisidir.

## Matris

| # | Matris maddesi | Kanıt dosyası | Kanıt |
|---|---|---|---|
| 1 | `mode` alanı olmayan eski missions.json / spec / run | test_mission_adaptive.js | -- the old record |
| 1 | `mode` alanı olmayan eski missions.json / spec / run | test_mission_adaptive.js | -- two protocols, one lifecycle |
| 1 | `mode` alanı olmayan eski missions.json / spec / run | test_mission_trace.js | -- an old store loads, round-trips and grows no fields |
| 2 | Classic delegate | test_missions.js | mission finishes done with the planner verdict |
| 2 | Classic approval | test_missions.js | rejected round is recorded and its steps cancelled |
| 2 | Classic question | test_missions.js | question asked and answer fed back |
| 2 | Classic pause | test_missions.js | pause shows pausePending immediately and parks before the next round |
| 2 | Classic resume | test_missions.js | resume message carries interruption context + results |
| 2 | Classic cancel | test_missions.js | cancel during delegation ends the run as cancelled |
| 2 | Classic rerun — Bridge sözleşmesi | test_bridge.js | missions.rerun starts the same spec as a NEW run |
| 2 | Classic delete — Bridge sözleşmesi | test_bridge.js | missions.run.delete drops a finished run |
| 2 | Classic yolu adaptif katmandan etkilenmiyor | test_mission_primitives.js | -- classic is where it was, to the character |
| 3 | Adaptive minimal goal → tek Task → evaluation → success | test_mission_graph.js | -- a small objective is one delegation and a finish |
| 3 | Adaptive minimal goal → tek Task → evaluation → success | test_mission_evaluation.js | -- all required pass → success |
| 3 | Adaptive minimal goal → tek Task → evaluation → success | smoke_mission_adaptive.mjs | the run reached a success verdict |
| 4 | Başarısız Task → hedefli revise | test_mission_primitives.js | -- a revise carries the real output of what it revises |
| 4 | Başarısız Task → hedefli revise | test_mission_primitives.js | -- ‼️ a revise expires the pass that was about the old version |
| 4 | Başarısız Task → hedefli revise | test_mission_failure.js | -- the lead is handed a shape, not a sentence |
| 5 | Çıkmaz yaklaşım → Strategy v2 / replan | test_mission_graph.js | -- a failure is evidence, and the approach may change because of it |
| 5 | Çıkmaz yaklaşım → Strategy v2 / replan | smoke_mission_adaptive.mjs | ‼️ the approach was REVISED rather than repeated — strategy reached v2 |
| 6 | Paralel readonly + serileştirilmiş writer'lar | test_missions.js | workdir: two writers never share a wave |
| 6 | Paralel readonly + serileştirilmiş writer'lar | test_missions.js | workdir: one writer + readonly fill one wave |
| 6 | Paralel readonly + serileştirilmiş writer'lar | test_mission_graph.js | -- parallel work branches from one parent and converges on the next decision |
| 6 | Paralel readonly + serileştirilmiş writer'lar | test_mission_primitives.js | -- parallel is a claim the engine may refuse, out loud |
| 7 | Mevcut Workflow primitive'i ve final handoff | test_mission_primitives.js | -- a workflow is a unit of work, run on the ordinary wave |
| 7 | Mevcut Workflow primitive'i ve final handoff | test_workflow_runstate.js | -- a chain that stopped short says so, and says where |
| 7 | Mevcut Workflow primitive'i ve final handoff | test_parallel.js | fan-in: merged handoff carries both branch outputs |
| 8 | İç içe Mission success/fail ve verdict roll-up | test_mission_primitives.js | -- a child objective is a real run, and its verdict is what comes back |
| 8 | İç içe Mission cycle/depth koruması | test_mission_primitives.js | -- ‼️ the two things that stop nesting being a fork bomb |
| 8 | İç içe Mission budget roll-up | test_mission_reload.js | -- ‼️ an interrupted child still carries its ledger upward |
| 8 | İç içe Mission ebeveyn bağı | test_mission_cascade.js | -- the parent link is written when the child is created, and read back up |
| 9 | project brief + projectId bütün çocuklara | test_mission_project.js | -- the lead is told which project, and what its part in it is |
| 9 | project brief + projectId bütün çocuklara | test_mission_project.js | -- the brief rides the same flag every other Claude surface uses |
| 9 | project brief + projectId bütün çocuklara | test_workflow_runstate.js | -- ‼️ a chain started FOR a project is that project's work, from step 1 |
| 10 | Bağımsız reviewer | test_mission_evaluation.js | -- an independent review is an ordinary delegation, judged by the same parser |
| 10 | Bayat evaluation | test_mission_evaluation.js | -- staleness is the work moving, not the clock |
| 10 | Bayat evaluation | test_mission_evaluation.js | -- ‼️ X-67 a verdict names the version it judged, and dies with it |
| 11 | Human guide bir kez enjekte edilir | test_mission_graph.js | -- a steer is injected once, at a planner boundary, and never twice |
| 11 | Human guide kaydı journal ile snapshot arasında tutarlı | test_mission_graph.js | -- ‼️ X-89: a steer the journal holds and the snapshot does not |
| 12 | Gerçek A→B→A konuşma | test_mission_conversation.js | -- B sees A's real words, and the lane is labelled honestly |
| 12 | Katılımcı resume / fallback | test_mission_conversation.js | -- an engine that cannot resume gets a handoff, and is not called a resume |
| 12 | Katılımcı resume / fallback | test_mission_conversation.js | -- ‼️ X-80 the resumed lead is told where the talking had got to |
| 13 | Council açılmayan basit koşum | test_mission_outcomes.js | -- a lead cannot claim a council it did not hold |
| 13 | Council açılmayan basit koşum | smoke_mission_adaptive.mjs | ‼️ no council was opened — the machinery stays out of a job this small |
| 13 | Council challenge / synthesis koşumu | test_mission_council.js | -- opening a council opens a conversation and orders its first turns |
| 13 | Council vote koşumu | test_mission_council.js | -- ‼️ X-79 a vote is read exactly, or it is unclear |
| 14 | Sert cost/token/round/task/minute tavanları | test_mission_guard.js | -- and every ceiling the guard names does it, not only cost |
| 14 | Planner çağrısının kendi tavanı | test_mission_guard.js | -- ‼️ the ceiling the PLANNER CALL itself spent |
| 14 | Sert planner-call tavanı | test_missions.js | run can never spin past the hard planner-call cap |
| 14 | Token tavanı dolar harcanmadan da biter | test_missions.js | ‼️ tokens spent with no dollars spent still exhausts the budget |
| 15 | Bozuk planner çıktısı | test_mission_graph.js | -- an invalid reply gets one correction, then fails in the open |
| 15 | Bozuk planner çıktısı | test_missions.js | two invalid replies fail the mission honestly |
| 15 | Bozuk evaluator çıktısı | test_mission_evaluation.js | -- the parser has one definition of a verdict, whoever wrote it |
| 15 | Bozuk message çıktısı | test_mission_conversation.js | -- a turn that said nothing did not answer anything |
| 16 | Olmayan agent | test_missions.js | unknown agent rejected with the team list in the error |
| 16 | Olmayan workflow | test_mission_primitives.js | -- naming a chain that does not exist is a rejection with the real list |
| 16 | Olmayan hedef id | test_mission_primitives.js | -- an id that never existed is a rejection, not an empty quotation |
| 16 | Olmayan session | test_mission_conversation.js | with no canResumeLane at all, no lane is ever claimed as continued |
| 17 | Planner timeout — oturum ölür, tazesiyle toparlanır | test_missions.js | failed resume falls back to a fresh briefing + ledger |
| 17 | Planner'a hiç ulaşılamaz — koşum dürüstçe biter | test_missions.js | an unreachable lead ends the run failed, never cancelled and never done |
| 17 | Bitiş, motorun kendi hatasını alıntılar | test_missions.js | …and the ending quotes the engine's own error, so it is not read as a verdict on the work |
| 18 | Pencere reload'u — her iş türü kendi deposundan sorulur | test_mission_reload.js | -- each kind is asked of the store that actually ran it |
| 18 | Pencere reload'u — uzlaştıran iki yüzey de sorar | test_mission_reload.js | -- the host asks all three, on BOTH surfaces that reconcile |
| 18 | Pencere reload'u — RESUME yolu da her türü kapatır | test_mission_reload.js | -- the RESUME path settles every kind too, not only a delegate round |
| 18 | Reload planı değiştirmez | test_mission_graph.js | -- a reload is not a change of mind |
| 19 | Bozuk trace — boşluk, geri giden ve kullanılamaz seq | test_mission_trace.js | -- ‼️ X-63 a gap, a backwards seq and an unusable seq are damage |
| 19 | Eksik trace bozuk trace değildir | test_mission_trace.js | -- ‼️ X-62 missing is not corrupt, and a failed swap never writes over the target |
| 19 | Journal'ı yok olan koşum yine açılır | test_mission_trace.js | -- a run whose journal is gone still opens |
| 19 | Başı eksik journal ile graph çizilir | test_mission_graph.js | -- the graph survives a journal that is missing its beginning |
| 20 | Cancel bütün torunlara iner | test_mission_cascade.js | -- ‼️ M-18 a cancel reaches every descendant, before the parent tears down |
| 20 | Pause ve un-pause simetrik iner | test_mission_cascade.js | -- ‼️ X-46 a pause that only descends is a deadlock with a green status |
| 20 | Tavan çocuğun süreçlerine erişir | test_mission_cascade.js | -- ‼️ X-46b the ceiling reaches the processes, and stops narrower than a cancel |
| 20 | Cancel bir bitiştir, kaza değil | test_mission_adaptive.js | -- ‼️ X-91 a cancel is an ending like any other |
| 21 | Çift olay yok | test_mission_trace.js | -- a repeated seq is idempotent: the first copy wins |
| 21 | Çift iş üretimi yok | test_mission_graph.js | ‼️ and a replayed settle does not duplicate what it produced |
| 21 | Çift harcama yok | test_mission_conversation.js | ‼️ nothing was bought twice — the refused turn never reached a wave |
| 21 | Çift delegasyon yok | test_missions.js | repeated identical delegation is dropped and reported |
| 22 | Üye kendi motorunu adlandırabilir | test_missions.js | a team member can name its own engine |
| 22 | Bu makinenin koşamayacağı motor CREATION'da reddedilir | test_missions.js | …and a mission on an engine this machine cannot run is refused at CREATION |
| 22 | Delegasyon indiği motorun capability'sini okur | test_mission_dimensions.js | ‼️ and the store is asked for the engine the delegate actually landed on |
| 22 | Capability fixture'ı dört motorda da uygulanır | test_four_engine_acceptance.js | ‼️ a permission mode this build does not have is refused on every engine |
| 22 | Lane sorusu motor bazında, ölçülenden cevaplanır | test_mission_conversation.js | -- the lane question is answered per ENGINE, from what was measured |
| 23 | Planner Claude-only — UI dürüstçe yazıyor | test_missions_webview.js | ‼️ …and the planner ENGINE is drawn as a fixed value, not offered as a picker that cannot work |
| 23 | Planner Claude-only — çekirdek sebebiyle birlikte yazıyor | test_missions.js | ‼️ …and the PLANNER deliberately cannot, with the reason written down |
| 23 | Planner Claude-only — Bridge aynı kapıdan geçiriyor | test_bridge.js | ‼️ X-122 — and the PLANNER's model+effort pair goes through the same gate |
| 23 | Planner Claude-only — Bridge onu işçi gibi tarif etmiyor | test_bridge.js | ‼️ …and the PLANNER is not described as a worker: no engine choice, no permission mode, the LEAD's folder |
| 24 | Başarı ölçütü activity sayısı değildir | test_mission_evaluation.js | -- the gate, and what it refuses to call a pass |
| 24 | Desteklenmeyen başarı iddiası kayda geçer, kabul edilmez | test_mission_evaluation.js | -- a lead that insists on success it cannot back is recorded, not fought |
| 24 | Sayma ve saymayı reddetme | test_mission_outcomes.js | -- counting, and refusing to count |
| 24 | Eksik kalan her ölçüt terminalde adıyla durur | test_mission_evaluation.js | -- ‼️ X-68 stopReason is required, and unmet is on every terminal that fell short |

## Kapılar — testle değil, komutla geçilenler

Matrisin geri kalanı bir iddia değil bir **koşumdur**; kanıtı testin kaynağında
değil, komutun çıktısındadır. `test_x46_matrix.js` bu tabloda da adı geçen
komutun `package.json`'da gerçekten tanımlı olduğunu doğrular — komut silinirse
kapı sessizce kaybolamaz.

| Kapı | Komut | Ne kanıtlar |
|---|---|---|
| Derleme | `npm run compile` | Kaynak bu sürümde derleniyor |
| Bütün testler | `npm test` | Önce derler, sonra matrisin işaret ettiği bütün iddiaları koşar |
| Kodlama + parity + paketleme | `npm run package` | Encoding, sağ tık kataloğu ve parity kapılarını sırayla geçer, sonra `dist/vsix/` altına VSIX yazar |
| Paket içeriği | `npm run verify` | Panel, media ve core modülleri VSIX'in içinde gerçekten var |

Encoding ve parity'nin ayrı bir npm script'i yoktur — ikisi de `npm run package`
zincirinin içindedir (`test/test_encoding.js`, `test/test_parity.js`) ve `npm
test` bunları ayrıca run-all içinde de koşar. Kapı bilerek paketlemenin
önündedir: encoding ya da parity kırıkken VSIX üretilemez.

Görsel kapı komut değil bakıştır: `node test/render_page.js <fixture>` +
`node test/shoot_page.js <fixture>`, koyu ve açık. Missions fixture'ları, 200
mesajlı council ve adaptif form bu turda çizilip okundu.

## Gerçek disposable smoke'lar

`test/smoke_mission_adaptive.mjs` — haiku, en düşük effort, sert tavanlar, her
şey geçici klasörde; kullanıcının oturum/görev/proje/misyon deposuna
dokunulmuyor. **İkisi de tam yeşil (7/7).**

- **Koşum 1** — küçük Objective, gereksiz council açılmadan `criteria-satisfied`
  ile bitti; `total.txt` diskte gerçekten `100` yazıyor. ~$0,10.
- **Koşum 2** — lider gerçekten çıkmaza girdi, stratejisini v2'ye taşıdı ve
  bağımsız okuyucuyla bitirdi; `total.txt` diskte gerçekten `37`, journal
  `strategy.changed` yazdı. ~$0,11.

Tekrar koşturmak: `node test/smoke_mission_adaptive.mjs` (~$0,21, ~15 dk).
Bunlar **kayıtlı koşumlardır** — matris denetimi para harcamamak için onları
yeniden çalıştırmaz, yalnızca iddialarının smoke'un kaynağında durduğunu
doğrular.

## Bu tur matrisin bulduğu iki gerçek eksik

Tablo doldurulurken iki madde kanıtsız çıktı; ikisi de kapatıldı.

1. **Lidere hiç ulaşılamadığında koşumun nasıl bittiği ölçülmemişti** (17.
   madde). Resume-fallback'in başarılı hâli testliydi, tazenin de ölmesi hâli
   değildi. `test_missions.js` artık koşumun `failed` bittiğini, `cancelled`
   demediğini ve motorun kendi hatasını alıntıladığını ölçüyor.

2. **‼️ `unpause` çocuklara inmiyordu** (20. madde) — ve bu bir kusurdu, eksik
   test değil. `pause` üç yüzeyde de aşağı iniyordu; `unpause` yalnız ağaç
   komutunda iniyordu. Bridge'in `missions.resume`'u ya da sayfanın Resume
   düğmesi kullanıldığında ebeveyn canlanıyor, çocukları sonsuza kadar duraklı
   kalıyordu — ve ebeveynin dalgası tam o çocuğu bekliyordu. Yeşil statülü bir
   kilitlenme. İki yüzey de düzeltildi; `test_mission_cascade.js` bunu **çağrı
   yeri bazında** ölçüyor: yeni bir Pause/Resume yüzeyi kaskad çağrısı olmadan
   eklenirse test kırılır.
