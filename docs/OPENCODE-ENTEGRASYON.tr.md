# OpenCode entegrasyon dosyası (A-16)

`docs/YENI-MOTOR-EKLEME-SOP.tr.md` → “Hazırlık: taban çizgisi ve entegrasyon
dosyası” bu belgeyi ister. SOP’yi tekrar etmez; **yalnız OpenCode’a özgü ölçülmüş
gerçekleri, kararları ve kabul sınırlarını** taşır. X-38 ailesindeki her çocuk
(K-25, S-33, M-14, U-59, B-12, X-39, X-40) buradaki satırları veri kabul eder.

Kodda karşılığı `src/core/opencode.ts`, testi `test/test_opencode.js`,
ölçüm aracı `tools/opencode_acp_probe.js`, ham tel kayıtları `dist/measure/`.

> **Kural:** bu dosyadaki her satırın kanıtı `CLI sürümü + komut/olay + gözlenen
> sonuç` biçimindedir. Kanıtı olmayan satır buraya yazılmaz; belgeden alınan
> bilgi “belgeye göre” diye işaretlenir.

## Taban çizgisi

| Alan | Değer |
|---|---|
| Ölçüm tarihi | 2026-08-15 |
| Makine / OS | Windows 10 Pro 19045 |
| CLI sürümü | `opencode --version` → **1.18.18** |
| Komut | `opencode` — `%APPDATA%\npm\opencode.cmd` (npm shim; gerçek exe değil) |
| npm paketi | `opencode-ai` |
| Agent Farm sürümü | 3.144.0 · commit `feb99d2` |
| Kimlik bilgisi | `opencode providers list` → **0 credentials** (`~/.local/share/opencode/auth.json`) |
| Erişilebilir model | **7** — `opencode/big-pickle` + altı `*-free` |

## 1. Kimlik, kurulum ve giriş

| Soru | Ölçülen cevap |
|---|---|
| Ürün adı | OpenCode |
| Motor id | `opencode` |
| Executable | `opencode` — Windows’ta `.cmd` shim, gerçek `.exe` değil → **shell gerekir** |
| Kurulum | `npm install -g opencode-ai` |
| Giriş yolları | `opencode auth login` (ACP `authMethods` → `opencode-login`). API key’i kendi config/provider katmanında tutar; Agent Farm’ın kasasında ayrı bir env değişkeni yoktur. |
| Giriş kanıtı | `~/.local/share/opencode/auth.json` — yalnız **varlık** okunur, içerik asla loglanmaz veya Bridge’e çıkmaz |
| CLI ayrı, auth ayrı mı | Evet, ama sonucu diğer motorlardan farklı — aşağıya bak |
| Faturalama | Kendi `opencode` sağlayıcısı bağlı; ücretsiz modellerde CLI’ın yayımladığı fiyat **gerçek 0**’dır |

> ### ‼️ Karar 1 — kimlik bilgisi yokluğu “hazır değil” demek DEĞİLDİR
> Ölçüm: `auth.json` boşken `opencode models` yedi model döndürdü ve
> `opencode run` bu modellerle gerçek tur çalıştırdı. Bu motorda
> `AuthMode: 'none'` → `ready: false` eşlemesi **yanlış cevaptır**; kullanıcıyı
> bozuk olmayan bir şeyi düzeltmeye gönderir. Kodda `OPENCODE_READY_WITHOUT_CREDENTIAL`.
> Karşılığı U-59’da EngineStatus satırıdır: “bağlı sağlayıcı üzerinden kimlik
> bilgisi gerekmeden hazır” ayrı ve dürüst bir durumdur.

## 2. Süreç ve komut sözlüğü

| Soru | Ölçüm |
|---|---|
| Süreç şekli | **Üçüncü bir şekil.** Ne `persistent` ne `perTurn`: Console için tek `opencode acp` süreci bütün kartları `sessionId` ile çoklar |
| Hosted komut | `opencode acp` — stdin/stdout satır ayrılmış JSON-RPC 2.0 (nd-JSON) |
| Headless komut | `opencode run --format json` — prompt **stdin**’den |
| TUI komut | `opencode [proje-yolu]` — klasör **pozisyonel**, `--dir` değil |
| İlk prompt kanalı | ACP’de `session/prompt` çerçevesi; headless’ta stdin. Hiçbir yolda kullanıcı metni komut satırına çıkmaz → shim’in istediği shell güvenlidir |
| Sonraki prompt | Aynı ACP süreci, aynı `sessionId`; headless’ta yeni süreç + `-s <id>` |
| stdin kapanışı | `run` boru ile beslenip kapatıldığında asılmadı (ölçüldü) |
| cwd anlamı | ACP: `session/new { cwd }`. Headless: `--dir`. TUI: pozisyonel |
| Sistem bağlamı | **Yok** — `--append-system-prompt` karşılığı yok; brief ilk prompt’un içine girer (`OPENCODE_HAS_NO_SYSTEM_PROMPT_FLAG`) |
| Ölçülen süreler | `initialize` ≈ 2.9 sn · basit tur ≈ 3–6 sn · iki araç çağıran tur ≈ 23 sn |
| Bitiş anı | `session/prompt` cevabı (`stopReason`); süreç yaşamaya devam eder |
| Kapatma | Süreç **ağacı** kapatılır. ‼️ Yalnız Agent Farm’ın başlattığı ACP süreci; kullanıcının kendi TUI’si veya rastgele porttaki sunucusu **ele geçirilmez** |

> ### ‼️ Karar 2 — kart başına süreç yasak
> Boş bir ACP süreci ≈ **383 MB working set / 596 MB private**. Dört kart açan
> kullanıcı 1.5 GB öder. Uzantı başına **tek** paylaşılan runtime; kartlar
> `sessionId` ile ayrılır (K-25).

> ### ‼️ Karar 2b — **bir headless koşu bir eşzamanlılık yuvası değil, İKİ yuva** (M-14)
> Ölçüm **2026-08-16, iki kez**, `tools/measure_opencode_run.js` ile: tek bir
> `opencode run --format json` kendi süreç ağacında (`opencode.exe` + npm shim'inin
> `cmd.exe`/`conhost.exe` + çağırdığı `git.exe`) **615 MB ve 596 MB** working set
> zirvesi yapıyor. Yani paylaşılan ACP sunucusundan (383 MB) **daha ağır** — üstelik o
> uzun ömürlü ve bütün kartlara birden hizmet ediyor, bu ise tek bir görev.
>
> Governor koşu sayıyordu; saymak her koşunun aynı makineye mal olduğunu varsayar.
> Artık **ağırlık** sayıyor (`engineConcurrencyWeight`, `EngineSpec.concurrencyWeight`):
> yalnızca **tartılmış** motor bir sayı taşır, geri kalan her motor 1'dir ve davranışı
> zerre değişmez. `opencode` = 2, yani varsayılan `maxConcurrentTasks: 2` altında bir
> OpenCode koşusu filoyu tek başına doldurur. Kullanıcı ayarı yükseltirse ağırlık onunla
> ölçeklenir; kuralı ezmez.
>
> **‼️ Ölçüm aracının kendi tuzağı, tekrar düşmemek için:** ilk sürümü "az önce olmayan
> her pid" toplamını alıyordu ve gerçek bir masaüstünde bu, o sırada başlayan başka her
> şey demek — ölçtü, **175 MB** dedi, zirvedeki süreçler `chrome.exe`,
> `SearchFilterHost.exe`, `esif_assist_64.exe` çıktı ve listede `opencode` **hiç yoktu**.
> Cevaba benzeyen ama başkasının tarayıcısı olan bir rakam. Artık ağaç
> `ParentProcessId` ile yürünüyor. (Ondan önceki sürüm de `powershell -Command "…"`
> çağırıyordu; `execSync` cmd.exe üzerinden gittiği için iç tırnaklar yeniyor ve her
> örnek **boş** dönüyordu — sorgu artık bir dosyada.)

## 3. Model, mod, izin ve ekler

| Soru | Ölçüm |
|---|---|
| Model kataloğu | **Bedava ve el sıkışmayla gelir**: `session/new` cevabı `configOptions` içinde model listesi + görünen adlar + seçili değer. Panel çizimi için ayrı `opencode models` spawn’ı gereksizdir |
| Katalog şekli | `provider/model` — `opencode/nemotron-3.5-lightning-free` |
| Varsayılan model | CLI’ın kendi seçimi: `opencode/big-pickle` |
| Effort | ACP 1.18.18 **yalnız `model` ve `mode`** ilan eder. Effort karşılığı `--variant` yalnız `run`/TUI’de vardır → hosted kartta effort kontrolü **gösterilmez**; uydurma genel liste yoktur |
| İzin modu | İki düğme: session **mode** (`build` / `plan`) ve `--auto` (“açıkça reddedilmeyen her izni otomatik onayla — tehlikeli”) |
| Plan/read-only | `plan` gerçek: “Disallows all edit tools” |
| Canlı değişiklik | `session/set_config_option` tur dışında güvenli; ACP steer ilan etmiyor → tur içi mesaj **kuyruğa alınır**, steer diye gösterilmez |
| Görsel ek | ACP `promptCapabilities.image = true` → resim içerik bloğu olarak gider. Headless’ta `-f` |
| Output contract | `--format json` var; `default` insan için biçimlenmiş metindir |

> ### ‼️ Karar 3 — `acceptEdits` ile `bypassPermissions` aynı iki bayrağa düşer
> CLI’da workspace ile sınırlı bir orta ayar **yoktur**. Bu bir kayıp değil,
> ölçülmüş gerçektir ve `opencodeModeNote()` bunu açıkça söyler; “sandbox” gibi
> tutulamayacak bir söz veren etiket kullanılmaz. Daraltma yeri `opencode.json`
> içindeki `permission` bloğudur (bu makinede `external_directory` kuralları zaten yazılı).

> ### ‼️ Karar 4 — bu motor gerçekten SORABİLİR
> Codex’in aksine `default` modu burada anlamını korur: ACP üzerinde
> `session/request_permission` gelir ve kart **once / always / reject**
> seçeneklerini kullanıcıya sunar. Aynı istek gözetimsiz (headless) koşuda
> cevaplayacak kimse olmadığı için reddedilir; ölçülen headless oturumun
> `info.permission` bloğu `question`, `plan_enter`, `plan_exit` için `deny` yazar.

> ### ‼️ Karar 4b — misyon delegesi izin modunu **üye bazında** taşır (M-14)
> Delegasyon **sıradan bir görevdir** (`missionDelegateWave` →
> `addTask(..., 'headless')`), ama `MissionTeamMember`'da `permissionMode` **diye
> bir alan yoktu** — model ve motor taşınıyordu, izin taşınmıyordu. Görev,
> schedule, template ve workflow adımı bu alanı gözetimsiz koşuda peşin harcarken
> misyon delegesi harcamayan **tek** yüzeydi; yani bir delege ancak motorun
> varsayılanını alabiliyordu.
>
> **‼️ Bunun bedeli motora VE kullanıcının config'ine bağlıdır; bu cümlenin derli
> toplu hâli yanlıştır.** 2026-08-16'da OpenCode 1.18.18'e karşı ölçüldü
> (`tools/probe_opencode_contract.js`, dört koşu): `opencode.json` hiçbir şeye
> "ask" demiyorsa `build` delegesi kendi cwd'sinde **rahatça yazıyor** — yani
> "gözetimsiz OpenCode koşusu araç çağıramaz" genel bir iddia olarak **doğru
> değil**. Her koşuda sabit olan şu: reddedilen bir araç çağrısı da **exit 0**
> veriyor, yani çıkış koduna bakan bir çağıran için hiçbir şey yapmamış koşu ile
> başarılı koşu aynı görünüyor.
>
> Hiçbir config'in veremeyeceği şey, üyenin kendisinin isteyeceği iki ayardır ve
> delege bunları **hiçbir şekilde** isteyemiyordu: `plan` (ölçüldü — OpenCode'un
> plan ajanı hiç araç çağırmıyor; salt-okur bir inceleyicinin istediği tam da bu)
> ve `--auto`.
>
> Alan **üye bazında**, `model` ve `engine` ile aynı eksende: okuyan üyeyle yazan
> üyenin ihtiyacı aynı değildir, misyon seviyesinde tek ayar ikisine de geniş
> olanı verirdi. Boş kalırsa motorun kendi varsayılanı geçerlidir — bu alan
> varsayılanı değiştirmiyor, **tek seçenek olmaktan çıkarıyor.**
>
> Kabul kuralları: yazım hatası motorun aksine **düşürülmez, reddedilir**
> (`validateLaunch`, her başlatma yüzeyinin okuduğu tek sözlük — bilinmeyen bir
> motor koşabilecek bir şeye düşer, bilinmeyen bir izin modu ise tam da bu alanın
> bitirdiği sessizliğe düşerdi) · `missions.list` ve `missions.status` değeri
> **geri okutur** (X-35 kuralı: yazıp okuyamamak, kasıtlı varsayılanla hiç
> ulaşmamış değeri ayırt edilemez kılar) · form seçeneklerini `PERMISSION_CHOICES`
> sabitinden alır, kopyasından değil.
>
> **Ölçüm aracı — `tools/probe_opencode_contract.js` (KALICI, tekrar çalıştırılabilir).**
> Uzantının kendi kurucusuyla (`opencodeRunArgs`) gerçek `opencode run` koşuları
> yapar; CLI her kıpırdadığında çalıştırın. Ölçtükleri:
>
> | Satır | Ölçüm |
> |---|---|
> | Prompt kanalı | **argv da stdin de çalışıyor.** İkisi birden verilirse hangisinin kazandığı **tırnaklamaya göre değişti** — belirsiz, o yüzden asla ikisi birden verilmez. Üretim yolu (`spawnHeadless`) stdin, `scheduleExportFor`'un ürettiği `.cmd` argv; **ikisi de geçerli** |
> | Oturum kimliği | İlk olaydan gerçek `ses_…`; `step_start, text, step_finish` sözlüğü ayrıştırıcının beklediği gibi |
> | Resume | `-s <ses_…>` **aynı kimliği** döndürüyor **ve** konuşma gerçekten taşınıyor (ilk turda verilen sayı ikinci turda geri geldi) |
> | Bedava model | `cost=0` **gerçek bir 0**, token sayısı dolu (28). Yani "bedava" ile "ayrıştıramadım" adım görülüp görülmemesiyle ayrılıyor |
> | `plan` ajanı | **Hiç araç çağırmıyor** — motorun kendi özelliği, config'e bağlı değil |
> | Varsayılan `build` | Bu makinenin config'inde kendi cwd'sinde **yazabiliyor** (config hiçbir şeye "ask" demiyor) |
> | Reddedilen çağrı | **exit 0.** Dört vakanın dördü de 0 döndü |
> | Ek dosya | `--file` turu gerçekten taşıyor — modelin tahmin edemeyeceği bir kelime dosyaya konup cevapta geri alındı |
> | Cancel | `taskkill /pid <p> /T /F` (`TaskManager.killProcess`'in kendi satırı) **bütün ağacı** alıyor: `cmd.exe, conhost.exe, opencode.exe` → 0. 615 MB'lık motorda ağacı bırakan bir cancel sızıntının kendisi olurdu |
>
> **‼️ Kalem yanlış varsayıyordu, ilk iki ölçüm de öyle.** M-14 metni "`--auto`
> yalnız ask kararlarını once olarak geçirir ve **explicit deny'ı aşmaz**" diyor.
> Değişken `--auto` çıkmadı: her koşuda sabit olan, reddedilmiş bir dizine
> `write` aracının `error` dönmesi. Değişen şey modelin ardından **`bash`'e
> düşüp düşmediği** — ve çalışan bir `bash` o dizine rahatça yazıyor. `--auto`
> **ile** (koşu 1, 2) ve `--auto` **olmadan** (koşu 3) yazdığı görüldü. İlk iki
> koşu tek başına derli toplu ve **yanlış** bir sonucu destekliyordu ("`--auto`
> araç değiştirerek deny'ı aşıyor"); üçüncüsü onu öldürdü. Doğru ifade config
> hakkındadır, bayrak hakkında değil: **`external_directory` dosya araçlarını
> çitler, kabuğu çitlemez.**
>
> Dosyalar: `src/core/missions.ts` (alan + gerekçe) · `src/extension.ts`
> (`createMission` doğrulaması, `missionDelegateWave` aktarımı, `missions.start`
> sözleşmesi, iki liste ucu, panel yükü) · `media/missions.js` (satır seçicisi +
> geri okuma) · `test/test_missions.js` · `test/test_missions_webview.js` ·
> `test/test_bridge.js` · `test/fixtures/missions.js` (sayfanın ilk çizimi).

## 4. Konuşma kimliği ve resume

| Soru | Ölçüm |
|---|---|
| Gerçek id | `ses_ffae93e06ffe3OOx0X42HLDzT2` — her taşımanın her olayında var; **dosya adından türetilmez** (dosya yok) |
| Önceden id verme | Yok — id `session/new` cevabıyla gelir |
| Headless resume | `opencode run -s <id>` — ölçüldü: **aynı id döndü ve önceki turun nonce’ını hatırladı** |
| Terminal resume | `opencode -s <id>` ve `-c` — sıradan komutun sıradan bayrakları (Codex gibi ayrı subcommand değil) |
| ACP resume | `session/load { sessionId, cwd }` — geçmişi `user_message_chunk` / `agent_message_chunk` olarak **tekrar oynatır**, sonra `configOptions` döner |
| Fork | `--fork` (CLI) ve `sessionCapabilities.fork` (ACP) |
| Tek sahip | Aynı konuşmayı iki yazar açmak riskli kabul edilir; runtime çökerse yeniden `session/load` yapılır, ikinci yazar açılmaz |
| Sayaç baseline | Resume edilen konuşmanın geçmiş harcaması yeni tura yazılmaz — tur usage’ı zaten kümülatif değildir (aşağıda) |

## 5. Protokol ve kullanım

Akış: ACP v1, JSON-RPC 2.0, satır ayrılmış. `initialize` cevabı:

```json
{ "protocolVersion": 1,
  "agentCapabilities": {
    "loadSession": true,
    "mcpCapabilities": { "http": true, "sse": true },
    "promptCapabilities": { "embeddedContext": true, "image": true },
    "sessionCapabilities": { "close": {}, "fork": {}, "list": {}, "resume": {} } },
  "authMethods": [ { "id": "opencode-login", "name": "Login with opencode", "description": "Run `opencode auth login` in the terminal" } ],
  "agentInfo": { "name": "OpenCode", "version": "1.18.18" } }
```

> ### ‼️ Tuzak 1 — `sessionCapabilities` üyeleri **nesne**, boolean değil
> `{ "list": {} }`. `v === true` okuması bunları `false` görür ve entegrasyonun
> yarısını, hepsini destekleyen bir binary’ye karşı kapatır.

> ### ‼️ Tuzak 2 — `session/set_config_option` parametresi `configId`, `id` değil
> `id` gönderilince `-32602 Invalid params` + zod hatası: `configId: expected
> string, received undefined`. Hata **stderr’e** düşer; model seçici çalışıyor
> görünür ve hiçbir şeyi değiştirmez. Tek çağrı yeri `opencodeSetConfigParams()`.

Ölçülen `session/update` türleri: `agent_message_chunk`, `agent_thought_chunk`,
`user_message_chunk` (yalnız load replay’inde), `tool_call`, `tool_call_update`,
`usage_update`, `available_commands_update`.

`tool_call` → `{ toolCallId, title, kind, status: "pending", locations: [], rawInput: {} }`
`tool_call_update` → aynı `toolCallId` ile `in_progress` (artık `locations` +
`rawInput` dolu), sonra `completed` (`content[]`, `rawOutput`, bazen düzeltilmiş
`title`). Durum makinesi: `pending → in_progress → completed | failed`.

### Harcama ve bağlam — iki ayrı olay

`session/prompt` **cevabı** turun harcamasıdır:

```
tur 1: { inputTokens: 6196, outputTokens: 13, thoughtTokens: 63, cachedReadTokens: 1920, totalTokens: 8192 }
tur 2: { inputTokens:   36, outputTokens: 13,                    cachedReadTokens: 8192, totalTokens: 8241 }
```

- `total = input + output + reasoning + cache.read + cache.write` — üç gerçek turda doğrulandı.
- ‼️ **Kümülatif değildir.** Tur 2’nin input’u tur 1’den küçük; çalışan bir toplam
  küçülemez. Codex’in doğru olan delta çıkarması burada uygulanırsa her ikinci tur
  bedava görünür. Kapsam işareti: `usage_scope: 'turnAggregate'`, delta **yok**.
- Headless JSONL karşılığı `step_finish.part.tokens` → `{ total, input, output, reasoning, cache:{read,write} }` + `cost`.

`session/update → usage_update` **bağlamdır**:

```json
{ "sessionUpdate": "usage_update", "used": 29341, "size": 262144, "cost": { "amount": 0, "currency": "USD" } }
```

- `used` = son çağrıdan sonra pencerenin tuttuğu; `size` = **gerçekten uygulanan**
  pencere kapasitesi. Ölçüm: `big-pickle` → 200000, `nemotron-3.5-lightning-free`
  → 262144. Yani pencere model başına ve **runtime tarafından bildirilir**;
  yayımlanmış katalog değeri bunun üstüne yazılmaz.
- ‼️ Aynı turda harcama toplamı 29381, bağlam 29341 idi. Birbirine yeterince
  yakın oldukları için karıştırılmaya davetiye çıkarırlar; X-43’ün var olma
  nedeni tam olarak budur.

> ### ‼️ Karar 5 — OpenCode, **hem bağlamı hem pencereyi** yayımlayan ilk motordur
> `contextTokens` kaynağı `engine-reported` (`usage_update.used`), pencere kaynağı
> yine `engine-reported` (`usage_update.size`). Ne Codex’in rollout kuyruğu ne de
> Gemini’nin `unknown`’ı gerekir.

> ### ‼️ Karar 6 — ücretsiz modelde `cost: 0` **gerçek sıfırdır**
> Motor fiyatı kendisi yayımlıyor (`usage_update.cost.amount`, JSONL `cost`).
> `costSource: 'cli'` — türetilmiş `agentFarm.pricing` rakamı değil.

## 6. Transcript, index ve canlılık

| Soru | Ölçüm |
|---|---|
| Depo | `~/.local/share/opencode/opencode.db` (+ `-wal`, `-shm`) — **SQLite** |
| Dosya biçimi | Okunabilir transcript **yok**; `readableTranscript: false` |
| Okunabilir yüzey | `opencode session list --format json` (`-n <N>` ile sınırlanabilir) ve `opencode export <id>` (`--sanitize` ile redakteli) |
| ‼️ Listenin kapsamı | **cwd'ye bağlı.** Depoda 6 oturum döndü, bir klasör ötede (`ajanlar/developer`) **hiçbir şey**. Yani aktif klasörü taramak "geçmiş" değil, "bir projenin geçmişi" demektir |
| Gerçek id | `info.id` — `ses_…` |
| Başlık | İlk gerçek kullanıcı prompt’undan türetiliyor (`NONCE değeri yazma`); henüz konuşulmamış oturum `New session - <ISO>` |
| Proje eşlemesi | `info.projectID` (hash) + `info.directory` (gerçek yol) |
| Zaman | `info.time.created` / `.updated` (ms). ACP `session/list` `updatedAt` (ISO). ‼️ CLI tablosu yalnız **yerel saat**, tarihsiz — ondan tarih türetilmez |
| Token | `info.tokens` **konuşma kümülatifi** (6196+36=6232 ile doğrulandı, `total` alanı yok); mesaj başına `message.info.tokens` `total` taşır |
| Live hook | Motor kendi hook’unu yayımlamıyor → host/launcher lifecycle’ı aynalanır; Timeline dosya yolunu `SessionIndex` satırından alır (SOP’nin X-41 notu) |

> ### ‼️ Tuzak 3 — `opencode export` JSON’unun yanına bir cümle basar
> `Exporting session: ses_…` satırı **stderr’a** gidiyor (S-33 ölçümü; stdout’un
> ilk baytı `{`). Okuyucular yine de ilk `{` / `[` işaretine kadar atlıyor —
> satırı stdout’a taşıyan bir sürüm sessizce “geçmiş boş” demesin diye.
> Okuyucular: `opencodeExportJson()`, `opencodeExport()`, `opencodeListJson()`.

### Ölçülen parça sözlüğü (`export` → `messages[].parts[]`)

| Tip | Ne taşır |
|---|---|
| `text` | `text` + `time.start/end` — hem kullanıcı hem asistan |
| `reasoning` | ‼️ **metniyle birlikte.** Codex rollout’unda yalnız sayı vardır, burada modelin kendi cümleleri var → görüntüleyicide çizilir, sayıya indirgenmez |
| `tool` | `tool` (ad) + `callID` + `state { status, input, output \| error, metadata, time }`. ‼️ **Argüman ve sonuç bir kat aşağıda**; hata `status: 'error'` ile adlandırılır, metinde “error” aranmaz |
| `step-start` / `step-finish` | Model çağrısı sınırı; `step-finish` `tokens` + `cost` taşır |
| `file` | Ek. **Ölçülmedi** (ölçüm turlarında ek gönderilmedi) — alanlar protokolden, hepsi opsiyonel okunuyor |
| bilinmeyen | `kind: 'other'` + kendi `type`’ı ile geçer, düşürülmez |

Ayrıca ölçüldü: **parçası olmayan mesaj gerçek bir mesajdır** (iptal edilmiş bir
turda boş `parts` görüldü) ve altı oturumun üçü hiç konuşulmamış
(`New session - <ISO>` başlığı, sıfır mesaj) — bunlar silinmez, “boş” diye
işaretlenir.

## 7. Ajan çalışma alanı (ayrıntı X-39’a aittir)

Bu turda ölçülen ve X-39’un başlangıç verisi olan iki gerçek:

- OpenCode `available_commands_update` olayında **`~/.claude/skills` altındaki
  becerileri** listeledi (`account-signup` ölçümde göründü). Yani Claude’a özgü
  beceri klasörü bu motora kendiliğinden görünüyor; X-39 bunun kapsamını ve
  yönünü (talimat/anayasa/memory/duty/MCP) ayrıca ölçer.
- Global config `~/.config/opencode/opencode.jsonc`; bu makinede `permission.external_directory`
  kuralları yazılı. Proje katmanı `opencode.json` + `.env`.

## 8. Karar tablosu — motor sözleşmesi (donduruldu)

| Alan | Değer | Gerekçe |
|---|---|---|
| `id` / `label` / `exe` | `opencode` / `OpenCode` / `opencode` | — |
| Console taşıması | Paylaşılan tek ACP runtime | 383 MB/süreç ölçümü |
| Headless taşıması | `run --format json`, prompt stdin’den | tek JSON zarfı; `sessionID` yalnız orada |
| Terminal taşıması | Yerel TUI, klasör pozisyonel | — |
| Serve/SSE | Yalnız tanı/fallback; ikinci daemon yok, kullanıcının TUI’sine gizli attach yok | Karar 2 |
| `promptOn` | Hiçbiri argv değil (ACP çerçevesi / stdin) | shim shell’i güvenli kalsın |
| `spawnShell` | true (Windows `.cmd` shim) | kullanıcı metni komut satırına çıkmıyor |
| `liveControls` | false — model/mod yalnız tur sınırında | ACP steer ilan etmiyor. ‼️ Bu alan **tek** soru sorar: çalışan tur değiştirilebilir mi. `extension.ts` bunu `steerable` diye yayımlıyor; `true` yapmak tur içi mesajın tura ulaştığını söylemek olur |
| `resumeInTerminal` | true (`-s`, `-c`) | ölçüldü |
| `readableTranscript` | false, ama `session list`/`export` var | Tuzak 3 |
| `reportsCost` / `costSource` | true / `cli` | Karar 6 |
| `usage_scope` | `turnAggregate`, **delta yok** | tur 2 ölçümü |
| ctx / pencere kaynağı | `usage_update.used` / `usage_update.size` | Karar 5 |
| Effort | Hosted’ta yok; headless/TUI’de `--variant` | ACP yalnız model+mode ilan ediyor |

## 8b. K-25 — paylaşılan runtime ve Console (uygulandı)

Sözleşme değişmedi; aşağıdakiler onun **üstüne** kurulan kararlardır.

| Karar | Değer | Gerekçe |
|---|---|---|
| `EngineShape` üçüncü değeri | `sharedAcp` | Ne `persistent` (kart başına 383 MB) ne `perTurn` (canlı kanal, kooperatif iptal ve izin kartı kaybolurdu) |
| Süreç sahipliği | Uzantı başına **tek** runtime; ilk kartta doğar, **son kart gidince ölür** | Kimseye hizmet etmeyen 383 MB önbellek değil, mazereti olan sızıntıdır |
| Kart sonu | `detach` — ajana `session/close`, süreç yaşamaya devam eder | Bir kartı bitirmek başkasının turunu kesmemeli |
| Stop | Önce `session/cancel`; **8 sn** cevap yoksa yalnız o zaman runtime restart | `OPENCODE_CANCEL_GRACE_MS`; ölçülen iptal saniyenin altında |
| Çökme | Bekleyenler **reddedilir**, sonra yeni süreç, sonra canlı kartlar `session/load` | Sırayla: eski süreç gitmeden yükleme = ikinci yazar |
| `session/load` replay | Çevirici `replaying` iken **hiçbir şey çizmez** | Kart zaten o konuşmayı gösteriyor; S-30'un çift-konuşma kuralı |
| `user_message_chunk` (canlı) | Atılır | Composer'ın yazdığının yankısı; çizmek her mesajı ikiye katlar |
| Tur içi mesaj | `hold/queue` | ACP steer ilan etmiyor; "steer ettim" sessiz yalan olurdu |
| Model/mod | Tur çalışıyorsa **sınıra kadar tutulur**, sonra uygulanır ve söylenir | Çalışan turun modeli protokolde değiştirilemiyor |
| İzin | ACP isteği → reducer'ın Claude biçimli `can_use_tool` dalı; cevap **`optionId`** olarak döner | K-22 (bypass kendi cevabı + felaket şeklin reddi) tek yerde kalsın |
| `thoughtTokens` | `output_tokens`'a **eklenir** | 6196+13+63+1920 = motorun kendi 8192'si; Antigravity'nin tersi |
| `usage_update.cost` | Kümülatif kabul edilir; tura **fark** yazılır, negatif olmaz | Aşağıdaki belirsizlik 5 |
| Araç adı | **İlk** çerçevenin `title`'ı; `completed` yeniden adlandırması yok sayılır | `read` → `package.json` ölçüldü |
| Araç satırı | `pending`'de değil, `rawInput` dolduğunda çizilir | `pending`'in `rawInput`'u boş ölçüldü |
| Bilinmeyen ACP **isteği** | `-32601` ile reddedilir | Yok saymak turu asar; `null` yapılmamış bir işi yapıldı sanır |
| `fs/read_text_file` hatası | JSON-RPC **hatası**, boş içerik değil | "Dosya boş" diyen ajan onu yeniden yazar |

Dosyalar: `src/core/opencodeacp.ts` (runtime, enjekte edilen spawn üzerinde saf) ·
`src/core/opencodeproto.ts` (çeviri) · `consolehost.ts` üçüncü kol ·
`test/test_opencodeacp.js` · `test/test_opencodeproto.js` ·
`test/test_console_opencode.js` (kabul listesi).

## 8c. S-33 — geçmiş, resume ve transkript (uygulandı)

Temel gerilim: `SessionSource.scan()` **her panel çiziminde** çalışır, bu motorun
geçmişi ise **yalnız süreç açarak** okunabilir. İkisi bir arada olamaz.

| Karar | Değer | Gerekçe |
|---|---|---|
| İki yarım bir **dosyayla** ayrılır | Hasatçı kendi yavaş saatinde CLI'yi çalıştırır, her konuşmanın `export`'unu bir önbellek klasörüne yazar; kaynak o klasörü okur | Aksi hâlde her çizimde ajan klasörü başına bir spawn — i7-2600K'da kabul edilemez |
| Önbellekteki dosya | **Motorun kendi belgesi, değiştirilmeden** | Üç ay sonra biri onu CLI'ye karşı tutabilsin; bizim okumamız mı motorun çıktısı mı değişti, görülebilsin |
| Tazelik kuralı | `row.updated > dosyanın mtime'ı` ise yeniden export | Biz listelemenin hemen ardından yazıyoruz, yani damgamız her zaman motorunkinden sonradır; ikisi de aynı makinede epoch ms |
| Tarama kökleri | Açık workspace + kayıtlı ajan kökleri + **listelerin kendi adlandırdığı klasörler** | Liste cwd'ye bağlı; öğrenilen klasör olmadan kullanıcının kendi terminalindeki proje sonsuza dek görünmez |
| Ritim | İlk hasat aktivasyondan **20 sn** sonra, sonra 10 dk'da bir; hasatçının kendi tabanı **5 dk** | Açılışta beş spawn bu makinede fark edilir |
| Kullanıcı tetikli refresh | `agentfarm.opencodeRefreshHistory` — tabanı **yok sayar**, ne yaptığını sayıyla söyler | Belki hiçbir şey yapmayan bir düğme, düğme olmamasından kötüdür |
| Eşzamanlılık | 2 | Bu arka plan işi; kullanıcı aynı makinede çalışıyor |
| İlk koşu tavanı | Pas başına **12 export**, en yeniden başlayarak | Uzun geçmiş peş peşe paslarda yakalanır, aranan sıra da budur |
| `readableTranscript` | **`false` kalır** | Alan "motor transcript bırakıyor mu" diye sorar; bırakmıyor. Önbellekteki dosya **bizim** |
| `SessionInfo.file` | Önbelleklenen export | Böylece Sessions tabloları, görüntüleyici, Console resume scrollback'i ve K-23'ün "daha eskisini yükle" hattı **tek satır ek kod olmadan** çalışır |
| `reasoning` | Görüntüleyicide **çizilir** (`kind: 'think'`), sayıya indirgenmez | Codex rollout'unda metin yoktur, burada vardır |
| Maliyet | Motorun kendi `cost`'u (`costSource: 'cli'`); fiyat kuralı uygulanmaz | Ücretsiz modelde 0 **gerçek** sıfırdır, eksik kural değil |
| Ctx hücresi | Son asistan mesajının kendi `tokens.total`'ı | Konuşma kümülatifi değil — X-43'ün hatası |
| Export yüzeyi | **İki ayrı seçenek**, farkı yazılı: tam JSON · `--sanitize` ile redakteli | Tek düğme kullanıcıyı kör seçime zorlar; neyin redakte edildiğine **motor** karar verir, Agent Farm değil |
| Silme | Ayrı komut, modal onay, **köprüde YOK** (parity: `human-only`) | Kart End/Remove motorun kaydına dokunmaz; bir ajanın kullanıcının konuşmalarını silebilmesi bu uzantının sunduğu bir yetenek değildir |
| İkinci yazar | Console tarafında `ConsoleHost.seatFor` zaten canlı koltuğu geri veriyor; koltuğu olmayan yollar için `opencodeWriterRefusal()` | Dışarıdaki rastgele TUI'nin sahipliği **tahmin edilmez**; bilinmeyen sahip "boş" diye okunmaz |

Dosyalar: `src/core/opencodehistory.ts` (saf: okuyucular + planlayıcı) ·
`src/core/opencodeharvest.ts` (enjekte edilen CLI üzerinde hasatçı + `nodeOpencodeCli`) ·
`cliTranscripts.ts` → `opencodeSessionsSource` · `cliViewer.ts` → `parseOpencode` ·
`extension.ts` (üç komut, iki bridge op'u, ritim) ·
`test/test_opencodehistory.js` · `test/test_opencode_sessions.js` ·
`test/test_opencodeharvest.js`.

## 8d. M-22 — motor mu, CLI profili mi (uygulandı)

Bir CLI profili motorun komut satırına **bayrak eklemez, o satırın yerine
geçer** (`tasks.ts` → `const command = profile ? …`; headless yolda da terminal
yolunda da aynı). Yani ikisini birden taşıyan bir koşu onları harmanlamaz:
**profil çalışır, motor sessizce düşer.** M-14 bu çifti yalnız `tasks.add`'de
reddediyordu; onu bir koşuya çevirebilen dokuz yüzey daha kabul edip saklıyordu.
En pahalıya patlayanı schedule: OpenCode'a alınmış ama üzerinde geçen ayın
profili kalmış bir kayıt, gece 3'te o profili çalıştırır ve hiçbir yerde
söylemez.

| Karar | Değer | Gerekçe |
|---|---|---|
| Çelişki | **Reddedilir, sıralanmaz** | Sıralamayı zaten çalıştırıcı yapıyor; kaybedeni hiçbir yer bildirmiyor. Çağıranın iki ifadesinden biri no-op olacaksa, bunu söylemenin dürüst anı başlamadan öncesidir |
| Koşul ve cümle | `twoExecutors()` + `ONE_EXECUTOR`, `core/launch.ts`'te **tek nüsha** | Köprü arg'ları, sayfa kontrolleri adlandırıyordu; aynı kuralı farklı anlatan iki kapı, er geç birinin kuralı uygulamayı bırakması demektir |
| `claude` + profil | Çelişki **değil** | Motorun yokluğu zaten claude demek; profilin yanında claude demek, profilin ezmediği hiçbir şey söylemez |
| Nerede sorulur | Yazılana değil, **çözülmüş koşuya** | Bu op'ların yarısı var olan bir kaydın üstüne override koyuyor; çelişki genelde **tek** argümanla kuruluyor ("OpenCode'da tekrar dene" ⟶ üzerinde hâlâ profil olan bir görev). Hiçbir çağrı iki alanı da anmıyor; yalnız birleşen koşu anıyor |
| `cli` üç durumlu | `tasks.rerun` ve `templates.run`'da: yok = mirasın, `""` = temizle, ad = o profil | Aksi hâlde sessiz hata, **söylenemez istekle** takas edilirdi: profil taşıyan bir görev hiçbir zaman başka motora alınamazdı. `project`'in zaten kullandığı üç durum |
| Metinde backtick yok | Bilerek | Sayfa bu cümleyi olduğu gibi `.ntmsg` şeridine kaçırıyor; köprü okuyucusu için yazılmış imler orada düz noktalama olarak otururdu |
| Ret **yüksek sesle** çizilir | `composerLoud` | Tek şerit hem "Kuyruğa alındı" hem "bu koşunun iki çalıştırıcısı var" taşıyordu ve ikisini aynı gri ile çiziyordu. Okuyucunun o andaki sorusu bir şey yaratılıp yaratılmadığıdır; kopya uyarısı yalnızca kendi bayrağı o stili de taşıdığı için uyarıya benziyordu |

Kapıdan doğrudan geçen yüzeyler: `tasks.add` · `tasks.rerun` · `templates.run` ·
`triggers.add` (iç içe birleşme dâhil) · `schedules.edit` · `triggers.edit`.
`schedules.add` · `templates.add` · `workflows.add` · `workflows.step.add` ise
`bridgeRunDimensions` üzerinden geçiyor.

Dosyalar: `src/core/launch.ts` (`twoExecutors`, `ONE_EXECUTOR`,
`LaunchOptions.cli`, `validateLaunch`) · `src/core/bridge.ts`
(`needOneExecutor`) · `src/extension.ts` (altı yüzey) ·
`src/panels/tasksPanel.ts` · `media/tasksPage.js` (`composerLoud`) ·
`test/test_bridge.js` · `test/test_opencode_task.js` ·
`test/test_tasks_webview.js` · `test/fixtures/tasks.js` (`tasks-oneexecutor`
varyantı — ret şeridinin tek bakıldığı yer).

## 8e. M-14 — üretim yüzeylerinin kendi koşuları (ölçüldü)

Motor sözleşmesi iki sürümdür kanıtlı, ama **yalnız kabuktan**. Kalemin asıl
istediği bu değildi: *her* üretim yüzeyi, uzantının içinden, gerçek binary'ye
karşı, uçtan uca. Altı yüzey `opencode/nemotron-3.5-lightning-free` ile geçici
bir klasörde koşturuldu; her birine, modelin tahmin edemeyeceği bir kelime
içeren bir dosyayı okutup kelimeyi geri istedik — **cevabın kendisi kanıt**.

| Yüzey | Sonuç | Kanıt |
|---|---|---|
| Headless task | ✅ | `ses_fead485d8ffe…` ilk olaydan bağlandı · 2 araç çağrısı `completed` · üç `step_finish` **toplandı** (8594+8677+8796 = bildirilen 26.067; farkı alınmıyor) |
| Trigger (watch) | ✅ | Dosyaya dokununca ateşledi · `fromTrigger` kayıtlı · kendi `ses_…`'i · aynı cevap |
| Schedule firing | ✅ | Kendi dakikasında kendiliğinden ateşledi · `fromSchedule` kayıtlı · aynı cevap |
| Interactive task | ✅ | TUI doğru klasörde açıldı · motorun kendi `session list`'i konuşmayı gösteriyor, başlığı **modelin** koyduğu |
| **Retry** | ❌ → düzeltildi | Prompt'suz koştu: `optStr` yokluğu `''` yapıyor, `retryTask` `??` ile birleştiriyor, `''` kazanıyor. OpenCode reddediyor (`You must provide a message or a command`); boş prompt'u kabul eden bir motorda bu **sessizce koşu harcıyordu**. Workflow-adımı dalını da erişilemez kılıyordu (`newPrompt === undefined` köprüden asla doğru olamazdı) |
| **Workflow adımı** | ❌ → düzeltildi | `{prev_text}` bir sonraki adıma **transkripti** verdi. Claude'da arşiv gövdesi *cevabın kendisi*; OpenCode'da bilerek motorun kendi JSONL olay akışı. `computeHandoff` artık OpenCode arşivini `readOpencodeRun` ile okuyor — bu iş için zaten var olan ve tek olan okuyucu. Arşiv ham belge olarak kalıyor, saklamanın anlamı o |
| **Schedule modeli** | ❌ → düzeltildi | `schedules.add`, `opencode/…` modeline *"model must be a model id/alias (e.g. opus, sonnet, haiku)"* diyordu. Karakter kapısı doğru (model komut satırına **string** olarak giriyor), ama sınıfında `/` yoktu — oysa **Claude dışı her motor** modeli `saglayici/model` diye adlandırıyor |

**Model kapısı tek yere alındı:** iki dosyada altı nüsha vardı, hepsi
`core/launch.ts` → `modelIdOk()`. Ret metni artık iki biçimi de anıyor; eski
metin yalnız Claude takma adlarını sayıyordu ve okuyucuya modelinin
*desteklenmediğini* düşündüren tam olarak buydu. `/` üç kabuğun hiçbirinde
sözdizimi değil; sözdizimi olan her şey (`;` `&&` `|` backtick `$()` boşluk)
reddedilmeye devam ediyor ve test ediliyor.

> **Ders:** üçü de kabuktan görünmezdi ve üçü de her string testini geçiyordu.
> "Motor sözleşmesi kanıtlı" ile "yüzeyler çalışıyor" ayrı iddialardır.

**Bu turda ÖLÇÜLMEYEN:** Codex, Gemini ve Antigravity arşivlerinde de aynı
devir sorunu (3) var mı — arşivleri okunmadı, düzeltme bilerek yalnız koşturulan
motorla sınırlı tutuldu.

### 8e-2. Düzeltmelerin GERÇEK KOŞU doğrulaması (canlı derlemede)

Üç düzeltme paketlenip kurulduktan ve pencere yeniden yüklendikten sonra aynı
yollardan tekrar koşuldu — çünkü testin geçmesi, çalıştığı anlamına gelmez:

| Doğrulama | Sonuç |
|---|---|
| `tasks.rerun` prompt'suz çağrıldı | ✅ Orijinalin prompt'unu **miras aldı** (eskiden `""` koşuyordu) |
| `schedules.add` + `opencode/nemotron-3.5-lightning-free` | ✅ **Kabul edildi** (eskiden reddediyordu) |
| …aynı kapı `opencode/x; rm -rf /` ve `opencode/$(whoami)` ile | ✅ **Hâlâ reddediyor** — kapı gevşetilmedi, sınıfına eksik karakter eklendi |
| İki adımlı workflow, `{prev_text}` ile | ✅ 2. adımın prompt'u `… : ZARFIL-M14` — **cevap**, transkript değil |
| **Restart binding** (kabul matrisi satırı) | ✅ Yenileme ÖNCESİ üç koşu da motorunu, `ses_…`'ini, token ve maliyetini korudu |

### 8e-3. Doğrularken çıkan iki şey daha

**(a) Antigravity da devirde aynı hatayı taşıyor — düzeltildi.** Bu makinedeki
bütün arşivler tarandı (koşu gerektirmeyen, daha ucuz bir ölçüm): `agy
--output-format json` **tek bir zarf** basıyor ve cevap `response` alanında,
ama genel açıcı yalnız `result`'ı biliyor — Claude'un kelimesi. Yani bir
Antigravity adımı sonrakine zarfın tamamını (id, status, süreler) veriyordu.
Motora göre anahtarlandı: başkasının kendi JSON çıktı sözleşmesindeki `response`
alanı onun verisidir, bizim açacağımız bir sargı değil.
*(Codex ve Gemini bu makinede hiç arşiv bırakmamış, ölçülemedi.)*

**(b) ‼️ Agent Farm kendi yarattığı konuşmayı bulamıyordu — düzeltildi.**
`opencode session list` **cwd'ye bağlı**, hasat kökleri ise yalnız açık
workspace + ajan klasörleriydi; bir görevin kendi `workDir`'i ikisi de değil.
Sonuç: Agent Farm koşuyu KENDİ seçtiği klasöre gönderiyor, klasörü göreve
yazıyor, sonra orada yarattığı konuşmayı indeksleyemiyordu — ve
`tasks.add { resume: <ses_…> }` böyle bir id'yi **her zaman** reddediyordu.
Ret'in kendisi doğruydu (bulunamayan konuşmayı sürdürmek sessizce yenisini
açardı), ama başarılı olmasının hiçbir yolu yoktu. Kökler artık OpenCode'da
koşmuş görevlerin `workDir`'lerini de içeriyor.

> **Ders (yine):** üç düzeltmeyi doğrulamak, iki yeni hata daha buldurdu. Yüzey
> ölçümü tek seferlik bir kabul değil, tekrarlanabilir bir yordam olmalı.

### 8e-4. Son iki düzeltmenin doğrulaması — M-14 kabulü TAMAM

3.157.0 kurulup pencere yenilendikten sonra:

| Doğrulama | Sonuç |
|---|---|
| `sessions.opencodeSync` | ✅ Kökler **15 → 24**, listelenen **11 → 62**, `inTable` **0 → 2**. Farm artık kendi koştuğu klasörlerdeki konuşmaları görüyor |
| **Yüzeyden explicit resume** (kabul matrisinin son açık satırı) | ✅ `tasks.add { resume:"ses_feac8a864ffe…" }` kabul edildi, `runSession` **aynı kimliği** döndürdü ve cevap **`ZARFIL-M14`** geldi. Prompt "dosyaya tekrar bakma" diyordu — modelin bunu bilmesinin tek yolu **taşınan konuşma**. `resumeCostBefore: 0`, tur token'ı 8.572 (konuşmanın toplamı değil, **bu turun artışı**) |
| Antigravity devri, iki adımlı gerçek `agy` zinciri | ✅ 2. adımın prompt'u yalnız cevabı taşıyor; `conversation_id`, `status`, `duration_seconds` **yok** |

Böylece M-14'ün kabul matrisi kapandı: her yüzeyde fresh **ve** explicit resume ·
araç başarısı · token/cache/`cost=0` bedava model · cancel · retry ·
restart binding · ek dosya · yanlış model için başlamadan anlaşılır ret.

> **‼️ Kalan bir gözlem, M-14'ün değil S-33'ün alanı:** hasat `failed: 20`
> bildiriyor (62 listelenenin 20'sinin export'u başarısız). Kökler düzeldiği için
> artık **çok daha fazla** konuşma görülüyor ve bunların bir kısmı export
> edilemiyor. Kök nedeni ölçülmedi; ayrı bir kalem hak ediyor.

## 9. Bilinen belirsizlikler

1. **`--variant` değer sözlüğü ölçülmedi.** Sağlayıcıya özgü; bu makinedeki yedi
   modelde varyant listesi yayımlanmıyor (`export` → `variant: "default"`).
   U-59 hosted kartta effort kontrolü **göstermeyerek** bunu sağlama alır.
2. **`session/request_permission` gerçek kartı hâlâ canlı görülmedi.** K-25 onu
   ACP v1 alan adlarına göre uçtan uca uyguladı ve sahte çerçevelerle sınadı
   (`optionId` · `allow_once/allow_always/reject_once` · `outcome.selected` /
   `outcome.cancelled`), ama gerçek binary bunu henüz göndermedi. **X-40 kabulü
   yazma isteyen bir turla bunu kanıtlamalıdır.**
3. **Runtime çökme/yeniden yükleme** gerçek binary'de ölçülmedi; K-25 bunu enjekte
   edilen süreç üzerinde uçtan uca sınadı (bekleyenlerin reddi → yeni süreç →
   `session/load` → kart yeniden kullanılabilir). X-40 gerçek süreçte tekrarlar.
4. **`available_commands_update` kaynağının tam kümesi** (hangi klasörler, hangi
   öncelik) X-39’a bırakıldı.
5. **‼️ `usage_update.cost.amount` kümülatif mi tur başına mı — ölçülemedi.**
   Ölçümdeki her değer 0'dı (ücretsiz modeller). Aynı olayda taşındığı `used`
   tartışmasız kümülatif, ve `export` tüm oturum için tek `info.cost` + mesaj
   başına ayrı `cost` yayımlıyor; bu yüzden **kümülatif** okundu ve tura **fark**
   yazılıyor (`OpencodeState.cost`). Çift saymayan okuma budur. **Ücret alan bir
   modelde iki turluk bir koşu bunu kesin olarak çözer — X-40.**
6. **ACP `image` content block alan adları ölçülmedi.** `promptCapabilities.image:
   true` ölçüldü; `{ type, mimeType, data }` protokolün kendi tanımı. Reddedilirse
   motorun kendi sözleriyle satır olur, sessizce düşmez. X-40 gerçek bir görselle
   doğrular.
7. **OpenCode'un MCP araç adlandırması ölçülmedi** (ölçüm makinesinde MCP sunucusu
   yoktu). `mcp[_-]` ile başlayan ad `mcp__` biçimine normalleştiriliyor; başka
   türlü adlandırılan bir MCP aracı şimdilik ACP `kind`'ına göre sınıflanır.

## 10. Gerileme taban çizgisi ve kabul

- **Gerileme tabanı:** `npm test` 3.144.0 / `feb99d2` üzerinde tam yeşil. Dört
  motorun (Claude, Codex, Gemini, Antigravity) davranışı bu aile boyunca
  değişmez; `test_four_engine_acceptance.js` ve `test_engine_parity.js` her
  çocukta yeniden koşar.
- **A-16 kabulü (tamam):** `src/core/opencode.ts` + `test/test_opencode.js` —
  sürüm/capability kapısı, `configId` tuzağı, kümülatif-değil ölçümü, harcama ≠
  bağlam ayrımı, `export` önsözü, Türkçe satırın **her byte bölünmesinde** aynı
  olaya çözülmesi.
- **K-25 kabulü (tamam, sahte süreç üzerinde):** `test/test_console_opencode.js`
  kalemin kabul listesini satır satır karşılıyor — iki ajan klasöründe iki kart
  tek süreç altında · aynı `ses_…` üzerinde iki tur · canlı düşünme/araç/kullanım ·
  izin once/always/reject · görsel · iptalden sonra aynı oturumda yeni tur ·
  runtime restart + `session/load` · End/Remove ayrımı · hiçbir kartın sahip
  olmadığı süreci öldürmemesi. **Gerçek binary'ye karşı tekrarı X-40'a aittir**
  (belirsizlik 2, 3, 5, 6).
- **S-33 kabulü (tamam, **gerçek** belgeler üzerinde):** Bu turun fixture'ları
  sahte değil — bu makinenin altı gerçek oturumunun `session list --format json`
  ve `export` çıktıları. `test/test_opencodehistory.js` (56) · `test_opencode_sessions.js`
  (33) · `test_opencodeharvest.js` (16). Kalemin kabul listesi karşılığı:
  CLI'de oluşturulan oturum listede belirir (kaynak + hasatçı) · görüntüleyici iki
  turu ve `tool`/`reasoning` parçalarını gösterir · ACP `session/load` geçmişi
  replay eder ve nonce'ı hatırlar (K-25'te ölçüldü) · terminal ve Console aynı
  `ses_` id'sini sürdürür (`tuiArgs` → `-s`) · bozuk/yabancı/boş export fail-soft
  ve işaretli kalır. **Gerçek binary'de kalan tek boşluk:** 24 MB'ı aşan bir
  export'un `scanLimit` yolu (S-32 kuralı koddadır, o boyutta gerçek bir belge
  yoktu) — X-40'ta üretilebilir.
- **Sonraki çocuklar bu sözleşmeyi veri kabul eder** ve değiştirmek isterlerse
  önce bu belgeyi yeni bir ölçümle günceller.
