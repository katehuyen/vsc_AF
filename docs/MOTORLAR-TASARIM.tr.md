# Motorlar — Claude dışı modellerin eklentide kullanımı (X-3)

> Tasarım belgesi. Faz 1 uygulandı (3.97.0); Faz 2–4 yol haritasıdır ve
> **yerleşim kararı kullanıcıya sorulmadan uygulanmayacaktır** (X-3 kaleminin
> kendi şartı: "nereye ve nasıl konacağı önce kullanıcı ile konuşulacak").

## 1. Sorunun kendisi — yanlış zihinsel model

Eklentinin Claude dışı bir motor hakkında bildiği tek şey şuydu: **kasada bir
anahtar var mı.** Kasa (Secrets) ise düz bir `ad → değer` tablosudur; hangi adın
hangi motora ait olduğunu bilmez. Dolayısıyla "bu makinede Codex neden
çalışmıyor" sorusunun bir yüzeyi yoktu — cevap `Ctrl+Shift+P → Set Secret` ve
hangi adı yazacağını tahmin etmekti.

Asıl mesele bir kutu eksikliği değil. **Üç motorun ikisi anahtarla değil,
abonelikle ödeniyor:**

| Motor | Normal ödeme yolu | Kimlik nerede durur | Ölçüm |
|---|---|---|---|
| Claude Code | Claude Pro / Max planı | `~/.claude/.credentials.json` → `claudeAiOauth` | bu makinede doğrulandı, 2026-08-09 |
| Codex | ChatGPT Plus / Pro / Team planı | `~/.codex/auth.json` → `auth_mode: "chatgpt"`, `OPENAI_API_KEY: null` | bu makinede doğrulandı, 2026-08-09 |
> **‼️ Düzeltme (3.98.0, ölçüm 2026-08-09).** Yukarıdaki Codex satırı kimliğin
> yerini doğru söylüyor ama **motorun kullanılabilir olduğu anlamına gelmiyordu.**
> `codex` bu makinede **PATH'te yok** — `npm ls -g` de göstermiyor. Yani durum
> "girişi yapılmış bir hesap, çalıştıracak CLI yok". Bu, ekranın adlandırması
> gereken kendi başına bir hâldir: `nextStep` artık "kurulu değil" der, kurulum
> komutunu satıra yazar ve "giriş zaten diskte, tek kalan adım bu" diye ekler.
> Faz 1 raporunun "zaten öyle kullanıyorsunuz" cümlesi bu yüzden yanlıştı.
| Gemini / Antigravity | **API anahtarı** | — | "Google ile giriş" yolu Haziran 2026'da kapatıldı |

Yani anahtar merkezli bir ekran, **istisnayı** merkeze alan bir ekrandır. Kullanıcı
"arayüz yok" derken haklıydı ama eksik olan şey anahtar kutusu değil, şu dört
sorunun tek yerde cevaplanmasıydı:

1. CLI bu makinede var mı?
2. Bu motor **nasıl** ödeniyor?
3. Şu an giriş yapılmış mı?
4. Yapılmamışsa **tek yapılacak şey** nedir?

## 2. İlke

- **Kimlik bilgisi eklentiden geçmez.** Abonelik girişi CLI'ın kendi komutudur;
  tarayıcı ile CLI arasında hallolur, grant CLI'ın kendi dosyasında kalır.
  Eklenti onu ne okur ne saklar.
- **Anahtar yolu kasanındır.** Değer yalnız OS anahtarlığında durur; panel
  metadata görür, değer görmez. Köprüye hiçbir koşulda değer çıkmaz
  (`core/secrets.ts` güvenlik istisnası).
- **Bir satır asla yalnızca durum söylemez.** "Yapılandırılmamış" bu kalemin
  varlık sebebidir: durumu adlandırıp çözümü kullanıcıya aratır. Her satır bir
  **eylemle** biter.
- **Tarihli gerçekler yazılır.** Gemini'nin giriş yolunun kapandığı satırda
  yazar; yoksa kullanıcı olmayan bir düğmeyi arar.

## 3. Faz 1 — uygulandı (3.97.0)

**`src/core/engines.ts`** — enjekte edilen bir `EngineProbe` üzerinde saf.
Ev dizini, PATH, kasa **adları** ve süreç ortamı dışında hiçbir şeye dokunmaz;
her okuma best-effort, hata veren bir okuma tek satırı sessizleştirir, sayfayı
düşürmez. Çıktı motor başına: `cli` (var mı, nerede), `auth` (`subscription` /
`apikey` / `none`, hangi dosyadan, ne zaman tazelendi), `key` (`env` adı,
kasada var mı), `ready`, `next`, `loginCommand`, `billing`, `docs`.

**Farm Settings → Engines** — sayfanın en üstündeki bölüm ve gezinme
bağlantısı. Satır soldan sağa okunur: ad → rozet (*on a plan* / *on a key* /
*not signed in* / *not installed*) → üç düğme. Sol kenar çubuğu durumun
rengidir. Rozetin hover'ı figürleri taşır (komut, yol, okunduğu dosya, son
tazeleme, anahtar adı), açıklama satırı ne yapılacağını söyler.

Jestler, hepsini host yapar:

- **Install `<komut>`** — CLI yoksa satırın **birincil** düğmesi budur (3.98.0).
  Kurulmamış bir motora "giriş yap" demek, olmayan bir komuta giriş yapmaktır;
  satır bulunduğu adımı önerir. Terminale `npm install -g …` **yazar,
  çalıştırmaz.**
- **Sign in with a plan** — yalnız CLI varken görünür. Aynı jest: komutu
  terminale **yazar, çalıştırmaz** (`sendText(command, false)`). Tarayıcı
  girişini başlatmak kullanıcının işidir.
- **Add / Replace key** — kasanın kendi formunu tam o adla açar. Her iki
  durumda da durur: anahtar CLI'dan önce hazırlanabilir.
- **Docs** — yalnız `https://`.

İkisi tek bağlamadır (`data-engcmd` → `engineCommand`): yaptıkları iş aynı —
bir satırı terminale yazmak. `engineLogin` adı, bir kurulum komutunu da taşımaya
başladığı anda yalan söylüyordu.

**Köprü:** `engines.status` (`args: id?`). Aynı matrisi döndürür; **hiçbir
kimlik bilgisi geçmez** ve buradan bir kimlik bilgisi ayarlanamaz. Test
`test_bridge.js` içinde teli tarayıp `access_token`/`refresh_token` aramaktadır.

**Testler:** `test/test_engines.js` (31) + köprü sevk testi.

## 4. Faz 2 — sağlık: "hazır" ile "gerçekten çalışıyor" farkı

Faz 1 diskten okur. Diskteki grant süresi dolmuş olabilir, anahtar iptal
edilmiş olabilir. Eklenecek: satır başına **Test** düğmesi — motorun en ucuz
çağrısını yapıp (Codex/Claude için tek turluk bir `-p` çağrısı, Gemini için bir
model listeleme) sonucu satıra iliştirir. Sonuç önbelleğe alınır ve yaşı
gösterilir; kendiliğinden çalışmaz, çünkü para harcatan bir kontrolün sessizce
dönmesi bu sistemde kabul edilmez.

## 5. Faz 3 — motor seçimi oturum yüzeylerine iner (X-15)

Bugün Console yalnız `claude` başlatır (`extension.ts` → `new ConsoleHost(() => 'claude', …)`).
Faz 3, oturum başlatan her yüzeye (Console besteci, ▶ üçgeni, görevler,
misyonlar) bir **motor** ekseni ekler ve hazır olmayan motoru seçilebilir
kılmaz — seçilirse sebebini ve Faz 1'in `next` satırını gösterir.

### 5.1 Codex'in akış protokolü — ÖLÇÜLDÜ (2026-08-09, codex-cli 0.147.0)

Tahmin değil: CLI kuruldu, `codex exec --json` çalıştırıldı, ve olay etiketleri
ayrıca `codex.exe` ikilisinden çıkarıldı. Claude Code'un `stream-json`'ı ile
**hiçbir alan adı ortak değil**; adaptör gerçek bir çeviri katmanıdır.

**Komut:** `codex exec --json [-m MODEL] [-C DIR] [-s read-only|workspace-write|danger-full-access] [PROMPT]`
Prompt argüman olarak ya da stdin'den verilir. Devam: `codex exec resume <id>`
ya da `--last`. Çıktı **JSONL**, her satır bir olay.

**Olaylar (`type`):**

| `type` | taşıdığı |
|---|---|
| `thread.started` | `thread_id` — Claude'un `session_id`'sinin karşılığı |
| `turn.started` | — |
| `turn.completed` | `usage`: `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens` |
| `turn.failed` | `error.message` |
| `item.started` / `item.updated` / `item.completed` | `item: { id, type, … }` |
| `error` | `message` (yeniden bağlanma denemeleri de buradan akar) |

> **‼️ Düzeltme (3.101.0, ölçüm 2026-08-10).** Yukarıdaki `usage` satırı 3.99.0'da
> **yanlış** yazılmıştı (`cached_input`, `cache_write_input`, `output`,
> `reasoning_output`) ve `input_tokens` hiç yoktu. Gerçek alan adları
> yukarıdakilerdir; ikilinin etiketlerinden değil, canlı turların çıktısından
> alındı. Adaptörün okuyacağı alanlar bunlar olduğu için bu bir yazım hatası
> değil, çalışmayacak bir eşlemeydi.
>
> **‼️ `input_tokens` ÖNBELLEKTEN GELENİ DE İÇERİR.** Ölçüldü: dört kelimelik bir
> prompt için `input_tokens: 14310`, `cached_input_tokens: 11008`. Claude'un
> `input_tokens`'ı yalnız TAZE girdidir ve önbellek ayrı bir alandır; Codex'in
> sayısını olduğu gibi geçirmek bağlamı iki kez saymak olur. `codexUsage`
> önbellek payını çıkarır. `reasoning_output_tokens` da `output_tokens`'ın
> **içindedir**, yanında değil — toplamak düşünmeyi iki kez faturalandırır.
>
> **‼️ `item` kimlikleri her turda `item_0`'dan başlar.** Bir tur içinde tekil,
> ötesinde değil; bu yüzden bir araç çağrısının kimliği turla birlikte
> adlandırılır, yoksa ikinci turun ilk çağrısı birincininkinin üzerine yazar.

**`item.type` değerleri:** `agent_message` · `reasoning` · `command_execution` ·
`file_change` · `mcp_tool_call` · `web_search` · `todo_list` · `error`.
Akış deltaları ayrıca `agent_message_content_delta` ve
`reasoning_content_delta` olarak gelir.

**Eşleme tablosu (Claude → Codex), adaptörün yazacağı şey:**

| Agent Farm'ın beklediği | Claude Code | Codex |
|---|---|---|
| oturum kimliği | `session_id` | `thread_id` (`thread.started`) |
| turun başı | `type: "system", subtype: "init"` | `turn.started` |
| asistan metni | `assistant` içeriğinde `text` blokları | `item.completed` + `item.type: "agent_message"` |
| düşünme | `thinking` bloğu | `item.type: "reasoning"` |
| araç çağrısı | `tool_use` | `command_execution` / `file_change` / `mcp_tool_call` |
| turun sonu + maliyet | `result` (`usage`, `total_cost_usd`) | `turn.completed` (`usage`; **ücret yok**) |
| hata | `result` + `is_error` | `turn.failed` / `error` |

**‼️ İki gerçek fark, tasarımı etkiler.** (1) Codex turun **ücretini
söylemez** — yalnız token sayar; abonelikle çalıştığı için de zaten bir
dolar rakamı yoktur. Konsolun maliyet şeridi bu motorda token göstermeli,
uydurulmuş bir ücret değil. (2) İzin akışı ayrıdır: Claude'un
`can_use_tool` sorusunun karşılığı Codex'te `exec_approval_request` /
`apply_patch_approval_request`'tir ve `-s` bayrağıyla önden kısıtlanır.

### 5.1.1 Uygulandı (3.101.0) — adaptör ve tur başına taşıma

Faz 3'ün alt yapısı yazıldı ve **gerçek turlarla** doğrulandı
(`test/smoke_codex_console.mjs`): iki turluk bir Console oturumu, aynı thread,
taşınan bağlam, sayılan token, uydurulmamış ücret.

- **`src/core/codexproto.ts`** — saf çeviri. Codex'in JSONL'ini `reduceEvent`'in
  zaten anladığı olaylara çevirir; panel, maliyet şeridi, adım ikonları ve
  transkript tek kod yolu olarak kalır.
- **`src/core/consoleEngine.ts`** — motorun makine tarafı: hangi motorun kaç
  sürece ihtiyacı var, canlı kontrolü var mı, ücret bildiriyor mu; ve bir turun
  komut satırı.
- **`ConsoleHost`** — Claude yolu satırı satırına aynı; `perTurn` motorlar kendi
  yolundan geçiyor.

**Ölçülen üç gerçek, tasarımı değiştirenler:**

1. **`codex exec resume`, `-s` ve `-C`'yi KABUL ETMEZ** (çıkış kodu 2). Kum
   havuzu `-c sandbox_mode=…` ile, çalışma dizini sürecin kendi cwd'siyle gider.
   İlk tur ile sonraki turlar aynı bayrak dağarcığını paylaşmaz.
2. **Prompt STDIN'den gider (`-`).** Argüman olarak verildiğinde CLI, stdin bir
   boru ise onu da okumaya çalışır ("Reading additional input from stdin…") ve
   gelmeyecek ikinci bir kopyayı bekler.
3. **‼️ TUR, SÜREÇ ÖLENE KADAR BİTMEZ.** `turn.completed` yazılıyor, cevap
   tamamlanıyor — ve `codex exec` **~5,4 saniye daha yaşıyor**, bu süre boyunca
   thread'in yazıcı kilidini tutuyor. O aralıkta başlatılan bir tur
   `thread-store conflict: … already has an active writer` ile reddediliyor. Bu
   yüzden durum, süreç ölene kadar `working` tutuluyor: `acceptUserText` bir
   mesajı yalnız durum `working` iken bekletir, dolayısıyla bu tek satır kuyruğu,
   serbest bırakmayı ve bütün tur-başına taşımayı doğru kılan şeydir.

**Kapsam dışı bırakılan, bilerek:** Codex'in izin akışı
(`exec_approval_request`) `exec` modunda yoktur — bu mod hiç sormaz. Bu yüzden
izin modu önden bir kum havuzuna çevrilir ve yüzeyler bunun aynı şey OLMADIĞINI
söyler (`codexModeNote`).

### 5.1.2 Uygulandı (3.102.0) — motor ekseni her yüzeye indi (X-18)

Faz 3'ün kalan yarısı: **oturum açan hiçbir yüzey artık sessizce `claude`
başlatmıyor.** Eksen tek bir kelime dağarcığından besleniyor —
`engineOptions()` satırı, `engineRefusal()` ise reddi **tek bir cümleyle**
yazıyor (`core/engines.ts`). Beş giriş noktasının her birinin kendi cümlesini
kurması, dördünün onu yanlış kurması demekti.

| Yüzey | Nerede sorulur | Hazır olmayan motor |
|---|---|---|
| Console bestecisi | Ajan kutusunun yanında bir `select` | `disabled`, satırda `next` |
| Sol paneldeki ▶ | `pickRunSurface` → **Runs on** satırı → `pickEngine` | seçilebilir ama başlatmaz; `next` + "Open Engines" |
| Tam başlatıcı (Start Session…) | `$(server-process) Engine` satırı | aynı `pickEngine` |
| Görevler / zamanlamalar / tetikleyiciler | Form'daki **Engine** kutusu | `disabled`; koşucu ayrıca spawn öncesi reddeder |
| Misyonlar | Misyonun `engine`'i + üye başına `engine` | misyon **yaratılırken** reddedilir |
| Köprü | `console.start` · `sessions.start` · `tasks.add` · `missions.start` | cevabın kendisinde reddedilir |

**‼️ Hazır olmayan motor listeden GİZLENMEZ.** Gizlemek "bu sürümde Codex yok"
ile "Codex'iniz giriş yapmamış"ı aynı görünüşe indirir; satır durur, seçilemez,
ve yanında yapılacak tek şey yazar.

**‼️ Codex'in sistem-prompt kanalı YOKTUR — ölçüldü.** `codex --help`: prompt,
`AGENTS.md`, config; başka bir giriş yok. Claude'un
`--append-system-prompt-file`'ı burada karşılıksız. Sonuç, bulunması gereken bir
yalandı: **proje altında açılan bir Codex oturumu o projeye FİŞLENİYOR, kartta
rozeti görünüyor ve brief'i hiç duymamış oluyordu.** Artık brief ilk turun
promptunun içine, `<project-context>` ile çitlenmiş olarak biniyor
(`codexContextPrefix`) ve **bir kez** tüketiliyor. Terminal yolunda bu yapılmaz —
orası kullanıcının kendi konuşmasıdır, onun adına yazmak olurdu — bunun yerine
bir bilgi kutusu "bu oturuma proje anlatılmadı, brief gerekiyorsa Console'da
başlat" der.

**Görevlerde tur başına motor.** Ölçüldü (2026-08-10): düz `codex exec`
(yani `--json` olmadan) kendi başlığını basıyor — `workdir · model · provider ·
approval · sandbox · reasoning effort · session id` — sonra konuşmayı ve
`tokens used` satırını. Bir görev arşivinin istediği başlık tam olarak budur ve
motorun kendisi yazıyor. Prompt yine **stdin**'den gidiyor (`-`), bu sefer ikinci
bir sebeple: görev promptu doğası gereği çok satırlıdır ve komut satırı bir
kabuğa veriliyor. `-o <dosya>` son mesajı ayrıca yazıyor.

Bu motorda **uygulanmayan** üç şey, arşivin başlığında yazılı: `agentFarm.taskArgs`
ve model-politikası kuralları (ikisi de Claude'un dağarcığı), ve
`outputContract: "json"` (`claude -p --output-format json` zarfı; `codex exec
--json` bambaşka bir şey — JSONL olay akışı).

**Misyonlarda:** delegasyonlar motor eksenine sahip (üye → misyon → claude),
**planlayıcı ise bilerek Claude Code'da kalıyor.** Misyonun bütün denetim akışı
`claude -p --output-format json` zarfını ayrıştırır (karar JSON'u, ücret, turdan
tura bağlamı taşıyan oturum kimliği) ve `--disallowedTools` ile `--max-turns`
harcar; ikisi de öteki motorda yok. Ölçülmemiş bir çeviri bu depoda sevk
edilmez.

### 5.2 Bu makinedeki engel — Kaspersky (2026-08-09)

CLI kuruldu (`0.147.0`), giriş **çalışıyor** (`codex login status` →
*Logged in using ChatGPT*), ama hiçbir tur tamamlanamıyor:

```
os error 10013 — An attempt was made to access a socket in a way
forbidden by its access permissions
wss://chatgpt.com/backend-api/codex/responses  → başarısız
https://chatgpt.com/backend-api/codex/responses → HTTPS fallback da başarısız
codex doctor → reachability: ChatGPT base URL connect failed (required)
```

Aynı adrese PowerShell'den HTTPS isteği **çalışıyor** (405 döner, yani
bağlantı kuruluyor) ve `Test-NetConnection chatgpt.com:443` başarılı. Yani
ağ değil, **`codex.exe`'ye özgü** bir engel: makinede Windows Defender'ın
yanında **Kaspersky** var ve 10013 tipik olarak güvenlik yazılımının yeni /
imzasız bir ikiliye giden bağlantıyı kısıtlamasıdır.

**Adaptör bu çözülmeden yazılmamalıdır** — gerçek bir tur görülmeden yazılan
çeviri katmanı, bu belgenin baştan reddettiği şeydir. Kullanıcının kararı:
Kaspersky'de `codex.exe` için izin (Uygulama Kontrolü → güvenilir grup, ve
gerekiyorsa Şifreli Bağlantı Taraması istisnası).

> **Çözüldü (2026-08-10).** Engel kaldırıldı; turlar bu makinede tamamlanıyor ve
> adaptör körlemesine değil, ölçülerek yazıldı (5.1.1). Bu bölüm **bir yöntem
> kaydı olarak duruyor**: "hazır" diyen bir ekranın neden hâlâ yalan
> söyleyebildiğinin ve bunu yalnız gerçek bir çağrının ortaya çıkardığının
> kanıtı — Engines sayfasındaki ⚡ Test düğmesinin varlık sebebi.

### 5.3 Abonelikle koşan motorda ücret yoktur, token vardır (X-19)

**Sorun bir eksik sayı değil, YANLIŞ bir sayıydı.** Codex bir planla koşar ve tur
için fiyat söylemez; adaptör de bilerek `total_cost_usd` yazmaz (sıfır yazmak
"bu tur bedavaydı" diye okunurdu). Ama eklentinin her yüzeyi dolar basıyordu, ve
`$0.00` küçük bir rakam değildir — **yanlış** bir rakamdır.

Kural: **`reportsCost: false` olan bir motorda dolar yazılmaz; token yazılır ve
neden dolar olmadığı söylenir.** Nerede uygulandı:

- **Konsolun maliyet şeridi** — çalışan tur `14.3k tokens this turn` der, "~"
  yoktur (token kesindir, tahmin değil).
- **Oturum satırı ve kart hover'ı** — `46.2k tokens · on a plan, no price`.
- **Turu kapatan satır** ve transkriptteki `result` satırı — aynı biçim.
- **Canlı tahmin hiç yapılmaz.** `estimateCost` Anthropic'in fiyat kartıdır; onu
  bir ChatGPT planının tokenlerine uygulamak iki kez yanlış olurdu (yanlış
  tarifeler, ve fatura modelinin hiç içermediği bir fiyat).
- **Köprü** — `tasks.list` ve `tasks.add` satır başına `reportsCost` döndürür ve
  sözleşmesinde "plan tabanlı bir motorda `costUSD: 0` ucuz bir koşu DEĞİLDİR"
  yazar; `missions.status` doları yanında tokeni de verir.

**‼️ Ve maliyet tavanının bu motorda ne anlama geldiğinin cevabı: hiçbir şey —
ikinci bir para birimi eklenene kadar.** Bir misyonda dişi olan tek sınır
`maxCostUSD`'dir (tur ve görev sayıları kaba, dakikalar yalnız yavaş işi keser).
Abonelikli bir delege hiç dolar bildirmediği için `totalCostUSD` onun için hiç
kıpırdamaz: Codex delegelerinden kurulu bir misyon, **asla ulaşılamayacak** bir
5 dolarlık tavana karşı bütün plan penceresini yakabilirdi. Bu bir tavan değil,
tavan görüntüsüdür.

Bu yüzden `MissionLimits.maxTokens` eklendi (varsayılan 2 000 000, `0` = tavan
yok, eski misyonlar birebir eskisi gibi davranır). `remainingBudget` ikisini de
sayar, `guardReason` hangisi biterse orada durur, ve **planlayıcıya söylenir** —
brief'teki bütçe satırı token kalanını da yazar, yoksa bir lead bütün tur boyunca
"$5.00 left" görüp hiç harcama yapılmamış gibi plan yapardı.

### 5.4 Model ve efor listeleri motorun kendisinden okunur (S-20) — ÖLÇÜLDÜ (2026-08-10)

Motor ekseni (5.1.2) her yüzeye indi, **yanındaki kutu inmedi.** Hangi motor
seçilirse seçilsin model listesi `agentFarm.modelAliases` idi. Kullanıcının
bildirdiği hâl: *"Codex seçildiği halde modeller hâlâ Claude modelleri seçme
kutusunda… halbuki terminalde `/model` yazınca gpt-5.6-sol … çıkıyor."*

Ve kullanıcının teşhisi yalnız Codex'i işaret etmiyordu: **sabit liste bir son
kullanma tarihidir** — yeni bir Claude modeli çıktığında da eklenti körleşir.

**Nerede ölçüldü.**

| Motor | Katalog | İçindekiler |
|---|---|---|
| Codex | `~/.codex/models_cache.json` (197 KB, CLI tazeler) | `models[]`: `slug`, `display_name`, `description`, `visibility`, `priority`, `default_reasoning_level`, `supported_reasoning_levels[]`, `context_window`, `fetched_at` |
| Claude Code | tam katalog **yok**; `~/.claude/.claude.json` → `additionalModelOptionsCache` | `{value,label,description}` — bu hesaba ayrıca verilenler (ölçümde: Fable) |
| Gemini | yok | — |

`visibility: "list"` süzülüp `priority`'ye göre dizildiğinde çıkan liste,
kullanıcının terminalde saydığı altı satırla **birebir** aynıdır:
`gpt-5.6-sol` (1) · `gpt-5.6-terra` (2) · `gpt-5.6-luna` (3) · `gpt-5.5` (7) ·
`gpt-5.4` (16) · `gpt-5.4-mini` (23). Gizlenen ikisi (`gpt-5.6-sol-wm` yönlendirme
takma adı, `codex-auto-review`) bir insana sunulmaz — onları listelemek "daha
eksiksiz" değil, makinenin kendi tesisatını kullanıcıya açmaktır.

**Efor de modelin kendisinindir.** `supported_reasoning_levels` model başına
değişir (terra'da altı seviye — `ultra` dahil —, 5.5'te dört) ve her seviye kendi
açıklamasını taşır. Tek ortak `EFFORT_CHOICES` listesi ikisi için de yanlıştı.

**Uygulama** — `core/models.ts`, `engines.ts` ile aynı biçimde saf ve enjekte
edilen `EngineProbe` üzerinden:

- `readCodexCatalog` / `readClaudeExtras` — diskteki iki biçim.
- `readEngineModels(probe, aliases)` → motor başına
  `{ models, efforts (model id'siyle anahtarlanmış, `''` = ortak liste),
  defaultEffort, source: 'catalog' | 'settings', fetchedAt, note }`.
- **Hiç önbelleklenmez**, her çağrıda okunur: Codex kataloğu CLI servise her
  konuştuğunda değişir, aktivasyonda yakalanan bir liste tam da burada
  değiştirilmek istenen bayat listedir. Maliyeti motor başına küçük bir JSON.
- **Düşüş sessiz değildir.** Katalog okunamazsa (Codex kurulu ama hiç koşmamış)
  takma ad listesine düşülür, ama `source: 'settings'` olur ve `note` gösterilenin
  motorun kendi cevabı olmadığını yazar — çünkü Codex altında sessizce sunulan bir
  Claude takma adı, bu modülün var olma sebebidir.

**Yüzeyler.** Console bestecisi ve çalışan oturumun canlı kutuları
(`modelsFor`/`effortsForModel`), New-task formu (`ntModels`/`ntEfforts` — motor ve
model kutuları artık formu **yeniden çizer**, çünkü hangi seçeneklerin var olduğunu
onlar belirler), `Start Session…` alt seçicisi, ve köprüde `engines.models`.

**Motor değişince model düşer.** `sonnet` Codex'e taşınsaydı kutuda o CLI'ın
reddedeceği bir değer kalırdı; yeni motorun listesinde olmayan model, seçilen
eforla birlikte bırakılır.

## 6. Faz 4 — adanmış panel (X-14) · KARAR ALINDI

X-3 "Ayarlar sayfasından açılan, bu işe adanmış bir yönetim paneli" diyor ve
yerleşimin önce konuşulmasını şart koşuyordu. Soruldu ve **2026-08-09'da
cevaplandı: ayrı bir Engines paneli.**

Yani Faz 1'in Farm Settings içindeki bölümü geçici bir yerleşimdi; kalıcı yer
kendi panelidir. Yapılacaklar:

1. **`src/panels/enginesPanel.ts`** — Faz 1'in satırı, artık dar bir bölüme
   değil bir sayfaya sığmak zorunda olmadan: motor başına kart.
2. **Sağlık testi (Faz 2 buraya taşınır)** — satır başına **Test** düğmesi,
   motorun en ucuz çağrısı, sonuç yaşıyla önbellekte, **asla kendiliğinden
   çalışmaz** (para harcatan bir kontrolün sessizce dönmesi bu sistemde kabul
   edilmez).
3. **Kota / kullanım** — Claude için mevcut plan kotası ucu, Codex için
   ChatGPT planının kendi sayacı (varsa).
4. **Model listeleri ve motor başına varsayılanlar** — hangi motorla oturum
   açılırsa hangi model ve efor gelsin.
5. **Girişler:** Farm Settings'teki bölüm bir başlık + "Open Engines" düğmesine
   iner (bilgi görünür kalır, derinlik panelde); sol paneldeki gezinmeye de bir
   ikon.
6. **Köprü:** `engines.status` durur; panelin yeni eylemleri (`engines.test`)
   aynı commit'te köprüye eklenir — `_REF/agentfarm-dev.md` kuralı.

## 7. Kapsam dışı bırakılanlar ve nedeni

- **Abonelik grant'ını eklentinin kendisinin tutması.** Teknik olarak mümkün
  (Codex'in `auth.json`'ı düz metindir) ama yanlış: token'ın tazelenmesi CLI'ın
  işidir ve bir kopya, iptal edildiğinde sessizce eskir. Eklenti kimlik
  bilgisini görmemeye devam eder.
- **Anahtarların köprüden yönetilmesi.** Köprü düz metin dosya kanalıdır; bu,
  kullanıcının 2026-07-19'da kabul ettiği güvenlik istisnasıdır.
