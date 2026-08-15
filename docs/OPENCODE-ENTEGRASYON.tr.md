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
| Okunabilir yüzey | `opencode session list` ve `opencode export <id>` (JSON) |
| Gerçek id | `info.id` — `ses_…` |
| Başlık | İlk gerçek kullanıcı prompt’undan türetiliyor (`NONCE değeri yazma`); henüz konuşulmamış oturum `New session - <ISO>` |
| Proje eşlemesi | `info.projectID` (hash) + `info.directory` (gerçek yol) |
| Zaman | `info.time.created` / `.updated` (ms). ACP `session/list` `updatedAt` (ISO). ‼️ CLI tablosu yalnız **yerel saat**, tarihsiz — ondan tarih türetilmez |
| Token | `info.tokens` **konuşma kümülatifi** (6196+36=6232 ile doğrulandı, `total` alanı yok); mesaj başına `message.info.tokens` `total` taşır |
| Live hook | Motor kendi hook’unu yayımlamıyor → host/launcher lifecycle’ı aynalanır; Timeline dosya yolunu `SessionIndex` satırından alır (SOP’nin X-41 notu) |

> ### ‼️ Tuzak 3 — `opencode export` JSON’unun ÜSTÜNE bir cümle basar
> stdout’un ilk satırı `Exporting session: ses_…`. `JSON.parse(stdout)` sağlam bir
> export’ta bile fırlatır; hata “geçmiş boş” diye aylar sonra keşfedilir.
> Okuyucu: `opencodeExportJson()`.

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
| `liveControls` | false — model/mod yalnız tur sınırında | ACP steer ilan etmiyor |
| `resumeInTerminal` | true (`-s`, `-c`) | ölçüldü |
| `readableTranscript` | false, ama `session list`/`export` var | Tuzak 3 |
| `reportsCost` / `costSource` | true / `cli` | Karar 6 |
| `usage_scope` | `turnAggregate`, **delta yok** | tur 2 ölçümü |
| ctx / pencere kaynağı | `usage_update.used` / `usage_update.size` | Karar 5 |
| Effort | Hosted’ta yok; headless/TUI’de `--variant` | ACP yalnız model+mode ilan ediyor |

## 9. Bilinen belirsizlikler

1. **`--variant` değer sözlüğü ölçülmedi.** Sağlayıcıya özgü; bu makinedeki yedi
   modelde varyant listesi yayımlanmıyor (`export` → `variant: "default"`).
   U-59 hosted kartta effort kontrolü **göstermeyerek** bunu sağlama alır.
2. **`session/request_permission` gerçek kartı canlı görülmedi** — ölçüm turlarında
   `read`/`glob` izin istemeden çalıştı. K-25 kabulü bunu yazma isteyen bir turla
   ayrıca kanıtlamalıdır.
3. **Runtime çökme/yeniden yükleme** ölçülmedi; K-25’in kabul maddesi.
4. **`available_commands_update` kaynağının tam kümesi** (hangi klasörler, hangi
   öncelik) X-39’a bırakıldı.

## 10. Gerileme taban çizgisi ve kabul

- **Gerileme tabanı:** `npm test` 3.144.0 / `feb99d2` üzerinde tam yeşil. Dört
  motorun (Claude, Codex, Gemini, Antigravity) davranışı bu aile boyunca
  değişmez; `test_four_engine_acceptance.js` ve `test_engine_parity.js` her
  çocukta yeniden koşar.
- **A-16 kabulü (tamam):** `src/core/opencode.ts` + `test/test_opencode.js` —
  sürüm/capability kapısı, `configId` tuzağı, kümülatif-değil ölçümü, harcama ≠
  bağlam ayrımı, `export` önsözü, Türkçe satırın **her byte bölünmesinde** aynı
  olaya çözülmesi.
- **Sonraki çocuklar bu sözleşmeyi veri kabul eder** ve değiştirmek isterlerse
  önce bu belgeyi yeni bir ölçümle günceller.
