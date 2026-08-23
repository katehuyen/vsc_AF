# Agent Farm — Adaptif Misyon Mimarisi ve Kullanım Rehberi

**Kapsamlı Mühendislik ve Kullanıcı Kılavuzu:** Hedef Odaklı Orkestrasyon, Planner–Worker Oturumları, 14 Primitive, Strateji Sürümleri, Değerlendirme Kapısı, Gerçek Ajan Konuşmaları, Konseyler, Bütçe ve İzlenebilirlik

**Ana Modüller:** `src/core/missions.ts` · `missionMode.ts` · `missionPrimitives.ts` · `missionEvaluation.ts` · `missionConversation.ts` · `missionCouncil.ts` · `missionFailure.ts` · `missionTrace.ts` · `media/missions.js` · **Doküman Versiyonu:** 1.0

---

## 1. Bu Rehberin Kapsamı ve Sürüm Durumu

Bu rehber Agent Farm’ın **Classic Mission** ve özellikle **Adaptive Objective** çalışma biçimini uçtan uca açıklar. Yalnız form alanlarını anlatmaz; bir misyonun başlatıldığı anda fiziksel olarak hangi process ve oturumların doğduğunu, liderin sonuçları nasıl aldığını, kararların nasıl doğrulandığını, delegasyonların hangi motor/model/eforla çalıştığını, gerçek ajan konuşmalarının nasıl kanıtlandığını, başarı hükmünün nasıl verildiğini, çökme ve yeniden yükleme sonrasında kayıtların nasıl toparlandığını ve bütün bunların kullanıcı arayüzünde nereden izlendiğini birlikte ele alır.

Rehberde iki ayrı durum bilinçli olarak birbirinden ayrılmıştır:

| Durum | Bu rehberde nasıl işaretlenir? | Anlamı |
| :--- | :--- | :--- |
| **Mevcut motor gerçeği** | “Bugün / mevcut davranış” | Kaynak kodda çalışan ve misyon koşumlarının gerçekten uyguladığı sözleşme. |
| **Mevcut arayüz** | “Bugünkü UI” | Motor doğru çalışsa bile bazı değerleri gizleyen, parçalı veya yanıltıcı gösterebilen mevcut Missions formu ve detay yüzeyi. |
| **Hedef arayüz** | “U-99 sonrası hedef” | `U-99`–`U-104`, `U-97`, `X-95` ve `X-96` tamamlandığında oluşması kararlaştırılan tutarlı arayüz. Henüz varmış gibi anlatılmaz. |

> ⚠️ **En önemli ayrım:** Motorun bugün bir değeri doğru çözmesi, formun o değeri doğru gösterdiği anlamına gelmez. Mevcut koşum sözleşmesi ile U-99 arayüz hedefi aynı şey değildir.

> ⚠️ **Oturumdaki eski “12 primitive” ifadesinin düzeltmesi:** Kod kayıt defterinde 12 değil, **14 ayrı primitive** vardır. `finish`, `ask_user` ve `abort` tek madde altında sayılamaz; üçü ayrı eylem ve ayrı parser dalıdır.

---

## 2. Sistemin En Kısa ve Doğru Zihinsel Modeli

Bir adaptif misyonda üçüncü, görünmez bir “delegasyon ajanı” yoktur. Sistemde üç tür aktör vardır:

1. **Kullanıcı:** Hedefi, başarı ölçülerini, kısıtları, kullanılabilecek ajanları ve güvenlik sınırlarını verir; gerektiğinde onaylar, cevaplar, yönlendirir, duraklatır veya iptal eder.
2. **Lider ajan / planner kimliği:** Kullanıcının seçtiği ya da sistemin deterministik olarak çözdüğü gerçek Agent Farm ajanıdır. Bu ajanın talimatları ve çalışma klasörü altında ayrı bir başsız Claude Code planner konuşması çalışır.
3. **İşçi ajanlar / delegates:** Liderin kararına göre gerçek işi yapan yine gerçek Agent Farm ajanlarıdır. Her iş bir **FarmTask** olarak, kendi başsız oturumunda ve kendi koşum profiliyle çalışır.

Agent Farm motoru bunların arasında bir ajan gibi düşünmez. Motor:

- planner’a durum zarfını verir;
- planner’ın yalnızca izin verilen JSON kararını kabul eder;
- kararı doğrular;
- görevleri dalgalara ayırır;
- gerçek Task, Workflow veya alt misyon çalıştırır;
- sonuçları, maliyeti ve kanıt referanslarını toplar;
- bir sonraki planner kararına taşır;
- kayıt ve güvenlik kurallarını uygular.

### Şema 1: Direksiyonda Kim Var?

```text
                         KULLANICI
            hedef · kriter · kısıt · sınır · yönlendirme
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ AGENT FARM MISSION ENGINE                                            │
│ Durum makinesi, doğrulama, dalga planı, bütçe, kayıt, onay ve guard  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ planner çağrısı
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ LİDER AJANIN PLANNER OTURUMU                                        │
│ Gerçek ajan kimliği + headless Claude Code konuşması                 │
│ Hedefi okur, karar verir; teslimatı kendisi üretmez                  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ JSON kararı:
                                │ delegate / evaluate / message / ...
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ GERÇEK İŞ YOLU                                                       │
│ FarmTask oturumları · mevcut Workflow motoru · child Mission motoru  │
└───────────────┬──────────────────────┬───────────────────────────────┘
                │                      │
                ▼                      ▼
      developer / Codex       reviewer / Claude       ... diğer işçiler
        ayrı oturum             ayrı oturum
                └──────────────────────┬───────────────────────────────┘
                                       │ gerçek sonuçlar + referanslar
                                       ▼
                         AYNI PLANNER KONUŞMASININ
                              SONRAKİ KARARI
```

### Kavramların Sahibi

| Kavram | Ajan mı? | Sahibi / direksiyonundaki kim? | Ne yapar? |
| :--- | :---: | :--- | :--- |
| **Lead agent** | Evet | Kullanıcının seçtiği veya auto-resolve edilen ajan | Planner konuşmasının kimliğini, talimatlarını ve CWD’sini verir. |
| **Planner session** | Hayır; ajanın bir koşumudur | Lead agent | Hedef hakkında karar üretir; `plannerSessionId` ile turlar arasında sürer. |
| **Delegation** | Hayır; bir eylemdir | Kararı lead verir, kararı motor uygular | Bir işçi ajana gerçek iş sipariş eder. |
| **Delegate / worker** | Evet | Pool/team içindeki ajan | Kendine verilen işi ayrı Task oturumunda yapar. |
| **Delegation engine** | Hayır; koşum ayarıdır | Yeni spec’te kullanıcı/ayar resolver’ı | İşçi Task process’inin hangi CLI ile açılacağını belirleyen motor fallback’idir. |
| **MissionEngine** | Hayır; program kodudur | Agent Farm | Döngüyü, doğrulamayı, bütçeyi, kaydı ve başlatmaları işletir. |

> **Hayati cevap:** Lider “delegasyonu” yapar; yani kime ne iş verileceğine karar verir. “Delegation engine” ise bu kararı veren başka bir akıl değildir. Karar verilen işçi oturumunu Claude, Codex, Gemini, Antigravity veya OpenCode CLI’dan hangisinin çalıştıracağını söyleyen bir koşum boyutudur.

---

## 3. Classic Mission ve Adaptive Objective Gerçekte Nasıl Ayrılır?

İki mod iki ayrı motor değildir. Aynı yaşam döngüsünü paylaşırlar:

- aynı planner çağrı yolu;
- aynı görev dalgaları;
- aynı TaskManager;
- aynı approval, pause ve cancel davranışı;
- aynı bütçe hesabı;
- aynı kayıt deposu ve yeniden yükleme mantığı.

Fark yalnızca iki protokol noktasındadır:

1. **Lidere ilk olarak ne anlatıldığı**
2. **Liderin yanıtının hangi sözleşmeyle doğrulandığı**

### Karşılaştırma

| Boyut | Classic Mission | Adaptive Objective |
| :--- | :--- | :--- |
| Kullanıcı ne verir? | Hedef + açıkça seçilmiş lead + açıkça seçilmiş team | Sonuç/hedef + başarı kriterleri + kısıtlar + ajan pool’u + özerklik |
| Cast | Başlangıçta kullanıcı tarafından atanmış team | Lead, pool’dan ihtiyaç oldukça ajan seçer; runtime role binding oluşur |
| Eylem kataloğu | `delegate`, `finish`, `ask_user`, `abort` | 14 primitive’in tamamı |
| Başarı kapısı | Kriter tabanlı zorunlu kapı yok | Her required criterion için güncel `pass` olmadan `success` reddedilir |
| Strateji ve faz | Özel adaptif reflection sözleşmesi yok | Her kararda görünür rationale, currentPhase, strategy ve basedOn |
| Konuşma / konsey | Yok | Gerçek `message` ve `council` kayıtları |
| Trace journal | Yok; snapshot/round kayıtları var | Ayrı append-only JSONL trace vardır |
| Pool boşluğu | Classic’te team en az bir üye ister | Bugün boş pool “whole fleet” demektir; U-102 bunu açık scope’a çevirecek |

> ⚠️ **Classic, önceden çizilmiş bir Workflow değildir.** Kullanıcı cast’i ve daha reçeteli başlangıç koşullarını verir; lead yine round round karar alır. Workflow ise adımları çalışmadan önce tanımlı sabit bir zincirdir. `run_workflow`, adaptif lead’in var olan böyle bir zinciri tek iş birimi olarak çağırmasını sağlar.

### Hangi Mod Ne Zaman?

| İhtiyaç | Uygun mod |
| :--- | :--- |
| “Şu iki ajanla şu işi yap; cast belli.” | Classic Mission |
| “Bu sonuca ulaş; yolu, ajan sayısını ve sıra değişimlerini çalışma sırasında sen belirle.” | Adaptive Objective |
| “Adım 1’den sonra adım 2, hata olursa adım 4; yol önceden belli.” | Workflow |
| “Tek ajan tek ve bağımsız işi yapsın.” | Task |

---

## 4. Adaptive Objective Girdi Sözleşmesi

Adaptif misyon bir yapılacaklar listesi değil, **başarı tanımı olan bir sonuç sözleşmesi** alır.

### 4.1 Objective / Goal

Ulaşılması istenen sonuçtur. Lead’in “ne üretmeliyim?” sorusunun cevabıdır. Yol tarifi olmak zorunda değildir.

İyi:

> “Misyon oluşturucudaki koşum profili çelişkilerini gideren, geriye uyumlu ve test edilmiş bir arayüz üret.”

Zayıf:

> “Bir şeylere bak, gerekirse düzelt.”

### 4.2 Success Criteria

Başarının gözlenebilir maddeleridir. Her kriter:

- yaşamı boyunca sabit bir kimlik taşır: `c1`, `c2` veya kullanıcı tarafından verilen id;
- `required` ya da optional olur;
- `evaluate` tarafından `pass | fail | unknown` hükmü alır;
- hükmün baktığı work target’ları değişirse stale olabilir.

Required kriter, güncel `pass` olmadan başarı kapısını açmaz. Optional kriter değerlendirilir ve raporlanır ama başarıyı bloke etmez.

Adaptive objective en az bir dolu success criterion ister. Normalization en çok 20 kriteri tutar; her criterion metni 500 karakterle sınırlıdır. Kriter id’leri aynı run içinde tekrarlanamaz ve değerlendirmeler bu id’lere bağlandığı için sonradan başka anlam için yeniden kullanılmaz.

### 4.3 Constraints

Misyonun yapmaması gerekenleri söyler. “Şunu yap” listesi değil, çalışma alanının korkuluklarıdır.

Örnekler:

- “Classic payload sözleşmesini değiştirme.”
- “`media/` dışındaki dosyalara yazma.”
- “Kullanıcının var olan ayar değerlerini silme.”
- “Dış servise veri gönderme.”

En çok 20 constraint tutulur ve her biri 500 karakterle sınırlıdır. Constraint listesi çalışma adımı değildir; lead bu korkulukların içinde kendi stratejisini kurar.

### 4.4 Pool

Lead’in iş verebileceği aday ajanların kümesidir. Team’den farkı, pool’un başlangıç cast’i olmamasıdır. Bir ajan ancak lead onu ilk kez işe koyduğunda run üzerinde role-bound olur.

Bugünkü sözleşme:

- `pool` verilmezse veya UI boş liste gönderirse whole fleet’e genişleyebilir;
- her pool üyesi `role`, `engine`, `model`, `effort`, `permissionMode` override’ı taşıyabilir;
- lead pool içinde olmak zorunda değildir;
- aynı ajan hem lead hem worker olabilir; fakat planner profiliyle worker profili iki ayrı koşumdur.

U-102 sonrası hedef:

- **Whole fleet** açıkça seçilir;
- **Selected agents** açıkça seçilir;
- Selected agents + sıfır seçim hata olur;
- boş checkbox görünümü artık iki farklı anlama gelmez.

### 4.5 Lead

Adaptive modda lead opsiyoneldir. Verilmezse deterministik çözüm:

1. pool’un ilk ajanı;
2. pool yoksa filonun ilk ajanı.

Bu seçim rastgele değildir, fakat bugünkü form Start öncesinde sonucu yeterince görünür göstermez. U-100/U-102 sonrası `Automatic → <ajan>` olarak önizlenecektir.

### 4.6 Autonomy

| Değer | Davranış |
| :--- | :--- |
| `ask-when-unsure` | Hedefin çözmediği yargısal bir ayrımda lead tahmin etmek yerine `ask_user` kullanır. Varsayılandır. |
| `decide-alone` | Lead belirsizliği kendi kararıyla çözer ve nedenini kaydeder; gerçekten bloke olmadıkça sırf emin olmadığı için sormaz. |

Autonomy:

- hard limitleri kaldırmaz;
- approval gate’i geçersiz yapmaz;
- kullanıcı iptalini engellemez;
- izin/sandbox politikasını değiştirmez.

### 4.7 Workdir ve Project

- `workdir`, delegelerin çalışacağı hedef klasördür.
- Workdir varsa aynı dalgada en fazla bir writer çalışır.
- `projectId`, planner’ın ilk çağrısındaki proje bağlamına ve misyonun ürettiği bütün Task/Workflow/child mission kayıtlarına taşınır.
- Child mission aynı proje ve aynı çalışma klasörünü miras alır.

### 4.8 Approval Mode

| Değer | Davranış |
| :--- | :--- |
| `each-round` | Her delegasyon dalgası başlamadan kullanıcı onayı beklenir. Reddedilirse plan çalıştırılmaz; ret lead’e geri bildirim olur. |
| `auto` | Round planları insan kapısı olmadan çalışır; hard limitler ve diğer güvenlik kuralları yine geçerlidir. |

---

## 5. Fiziksel Yaşam Döngüsü: Bir Misyon Makinede Nasıl Çalışır?

### Şema 2: Baştan Sona Bir Round

```text
[1] CREATE
    raw alanları doğrula
    → mode/criteria/pool/lead normalize et
    → spec + run oluştur
    → adaptive ise trace dosyasını aç
                 │
                 ▼
[2] PLANNER BRIEFING
    lead ajan klasöründe headless Claude Code process
    → ilk tur: objective + criteria + constraints + pool + budget + project brief
    → sonraki tur: --resume <plannerSessionId>
                 │
                 ▼
[3] DECISION PARSE
    yalnız JSON nesnesi
    → primitive kayıt defterinde mi?
    → alanlar, refs, pool isimleri ve causal basedOn geçerli mi?
    → rationale/phase/strategy eksiksiz mi?
                 │
                 ▼
[4] PLAN / GUARD
    task ve round limiti
    → duplicate planning-loop kontrolü
    → approval gate
    → maxParallel + one-writer kuralıyla wave’lere böl
                 │
                 ▼
[5] EXECUTION
    task         → normal FarmTask + ayrı headless agent oturumu
    workflow     → mevcut Workflow motorunda bir run
    child mission→ yeni adaptive run
    conversation → yine normal FarmTask; dönüşü mesaj kaydı olur
                 │
                 ▼
[6] SETTLEMENT
    status + cost + tokens + output + session id
    → failure class
    → trace action.settled
    → run toplamlarına bir kez kaydet
                 │
                 ▼
[7] NEXT BOUNDARY
    sonuç excerpt’leri + remaining budget + bounded conversation digest
    + sıradaki user guidance
    → aynı planner konuşmasına sonraki karar
                 │
                 ├── evaluate / revise / replan / yeni iş
                 ├── ask_user → bekle
                 └── finish / abort → dürüst kapanış
```

### 5.1 Create Aşaması

Host, gelen isteği ham sınırda doğrular. Özellikle:

- mode yalnız `classic | adaptive`;
- autonomy yalnız kapalı kümedeki iki değer;
- kriter ve constraint şekilleri geçerli olmalı;
- tekrar eden kriter id’leri reddedilir;
- limitte yalnız **tam 0** unlimited demektir; `null`, boş string, `false` veya negatif sayı ceiling kaldırmaz;
- motor adı ve planner model id’si güvenli karakter sözleşmesine uymalıdır.

Adaptive run için spec ve snapshot kaydı oluşturulduktan sonra run’a ayrı JSONL trace dosyası bağlanır.

### 5.2 Planner’ın İlk Çağrısı

Planner process’i:

- seçilen lead ajanın klasöründe `cwd` ile açılır;
- her zaman Claude Code CLI kullanır;
- ilk çağrıda proje brief dosyası varsa system prompt’a eklenir;
- `-p --output-format json` ile headless çalışır;
- yazma ve iş spawn araçları mekanik olarak kapatılır;
- bir çağrıda en fazla 15 Claude tool turn’ü ve 10 dakikalık timeout vardır;
- planner model override yalnız planner çağrısına gider.

Bugünkü disallowed tool listesi:

```text
Bash, PowerShell, Edit, MultiEdit, Write, NotebookEdit, Task, Agent
```

Bu nedenle planner:

- işi kendisi teslim etmemeli;
- dosya değiştirmemeli;
- Task/Agent aracıyla motorun dışından işçi doğurmamalı;
- yalnız gösterilebilir karar JSON’unu üretmelidir.

> ⚠️ **“Planner yalnız tek model cevabı verir” ile “`--max-turns 1`” aynı şey değildir.** Mevcut kod çağrı başına `--max-turns 15` kullanır. Bunun amacı planner’ın sınırlı okuma/karar sürecine izin verirken işi yapmaya sapmasını mekanik olarak durdurmaktır. Turn tavanına çarparsa aynı oturumda bir defalık “şimdi yalnız JSON kararını ver” nudge’ı denenir.

### 5.3 Planner Devamlılığı

İlk başarılı planner zarfından `session_id` alınır ve run’da `plannerSessionId` olarak tutulur. Sonraki round:

```text
claude ... --resume <plannerSessionId> -p --output-format json
```

ile aynı konuşmayı sürdürür.

Resume başarısız olursa motor:

1. eski planner session id’sini bırakır;
2. yeni bir planner konuşması açar;
3. objective briefing’i;
4. compact ledger’ı;
5. daha önceki guidance geçmişini

yeniden vererek lead’i re-seed eder.

Bu, **aynı oturum devam etti** demek değildir. Gerçek resume ile rebrief edilmiş yeni session birbirine karıştırılmaz.

### 5.4 Delegelerin Başlatılması

Bir işçi adımı sıradan Task yoluyla açılır:

- Task başlığı `[Mission] <step title>` olur;
- `missionId` ile kaynak run’a bağlanır;
- misyonun `projectId` değeri Task’a taşınır;
- engine/model/effort/permission/workdir ortak resolver’dan çözülür;
- action başlangıcı process doğmadan önce trace’e yazılır;
- TaskManager gerçek headless CLI process’ini başlatır;
- Task’ın gerçek `runSessionId`, output file, cost ve token verileri adıma geri kopyalanır.

Lead, worker process’ine doğrudan bağlanıp konuşmaz. Agent Farm, tamamlanan Task’ın motoruna uygun biçimde arşivlenmiş cevabını okur ve bounded result olarak sonraki planner kararına koyar.

---

## 6. Planner Oturumu ile Worker Oturumu Neden Ayrıdır?

Bu ayrım yalnız maliyet optimizasyonu değildir; sorumluluk ayrımıdır.

| Planner oturumu | Worker oturumu |
| :--- | :--- |
| Objective’in bütününü ve ledger’ını taşır | Yalnız kendine verilen self-contained işi taşır |
| Lead ajan kimliğiyle çalışır | Görevlendirilen worker ajan kimliğiyle çalışır |
| Engine bugün sabit Claude Code’dur | Engine member/mission/settings resolver’ından gelir |
| Planner model override’ı olabilir | Worker model/effort/permission ayrı çözülür |
| Yazma ve spawn araçları kapalıdır | İzin profili elverdiği ölçüde gerçek işi yapar |
| Turlar arasında `plannerSessionId` ile resume edilir | Normal iş adımı çoğunlukla yeni Task session’dır |
| Karar ve gerekçe üretir | Kod, analiz, dosya veya konuşma çıktısı üretir |

### Aynı Ajan İki Tarafta Olursa

`developer` lead seçilmiş ve pool’da worker olarak da bulunuyorsa:

- planner koltuğundaki `developer`: Claude planner transport’u + planner model ayarı + disallowed tools;
- worker koltuğundaki `developer`: satırda çözülen engine/model/effort/permission + gerçek Task tools

ile çalışır.

İsim aynı olsa da:

- session farklıdır;
- prompt rolü farklıdır;
- araç yetkisi farklıdır;
- model ve effort farklı olabilir;
- maliyet kaydı farklı kanala yazılır.

Bu iki profilin birbirini ezmemesi U-100 hedefinin temel kabul koşullarındandır.

---

## 7. Agent, Engine, Model, Effort, Permission ve Workdir

Bu altı boyut aynı şey değildir.

| Boyut | Cevapladığı soru |
| :--- | :--- |
| **Agent** | Hangi kimlik, talimat, hafıza ve çalışma kültürü işi yapacak? |
| **Engine** | Hangi CLI/altyapı process’i çalıştıracak? |
| **Model** | O CLI hangi model id/alias’ını isteyecek? |
| **Effort** | Destekleyen motorda düşünme yoğunluğu hangi seviyede istenecek? |
| **Permission mode** | Headless koşum hangi araçları sormadan kullanabilecek / hangi sandbox’a tabi olacak? |
| **Workdir** | Process hangi hedef klasörde çalışacak? |

### 7.1 Mevcut Worker Resolution Sözleşmesi

Motor önce engine’i çözer, sonra model ve effort’u **o engine için** çözer.

#### Engine

```text
member.engine
    ↓ yoksa
MissionSpec.engine
    ↓ yoksa
agentFarm.launchDefaults.engine
    ↓ yoksa
claude  (CLI floor)
```

#### Model ve Effort

```text
member.model / member.effort
    ↓ yoksa
o agentın o engine için Agent Farm default’u
    ↓ yoksa
agentFarm.launchDefaults.model / effort
    ↓ yoksa
CLI chooses
```

#### Claude İçin Özel Kural

Claude worker model ve effort çözümünde per-agent Agent Farm katmanı atlanır. Çünkü Claude Code, ajanın `.claude/settings.local.json` dosyasını kendi CWD’sinden zaten okur. Aynı değeri Agent Farm’ın tekrar flag olarak geçmesi, elle düzenlenen ajan dosyasının üstüne ikinci bir truth source bindirirdi.

Bu nedenle Claude’da:

```text
member override → fleet launchDefaults → CLI / agentın kendi Claude ayarı
```

görünümü vardır. “CLI chooses” her zaman “bilinçsiz rastgele” demek değildir; Claude CLI kendi settings dosyasından seçim yapıyor olabilir. Host ancak engine’in raporladığı applied settings varsa bunu kesin olarak söyleyebilir.

#### Permission Mode

```text
member.permissionMode
    ↓ yoksa
agentFarm.launchDefaults.permissionMode
    ↓ yoksa
CLI chooses
```

Permission için per-agent/per-engine Agent Farm katmanı yoktur.

Headless worker’ın başında kullanıcı bulunmadığı için permission mode önceden çözülür. Boş bırakmak “her araca izin ver” demek değildir; CLI’ın kendi varsayılanı geçerlidir. Bazı engine’lerde reddedilen bir tool çağrısına rağmen agent process’i exit 0 ile bitebildiğinden yalnız process status’una bakmak yeterli değildir; output ve evaluation birlikte okunmalıdır.

#### Workdir

```text
MissionSpec.workdir
```

Workdir üye satırından çözülmez; misyon koşumunun ortak çalışma alanıdır.

### 7.2 Origin Değerleri

Her çözülen boyutun kaynağı şu kapalı kümeden gelir:

| Origin | Anlamı |
| :--- | :--- |
| `member` | Team/Pool üyesinin bu misyona özel satır override’ı |
| `mission` | Legacy/current `MissionSpec.engine` fallback’i |
| `agent` | O ajanın o engine için kalıcı Agent Farm default’u |
| `fleet` | `agentFarm.launchDefaults` |
| `cli` | Host override geçmedi; son kararı CLI verir |

Bugün step üzerindeki `runNote`, dolu alanları ve origin’i kısa metin olarak tutar. Ancak boş/CLI alanları görünmediğinden koşum sonrası provenance henüz eksiksiz değildir; U-104 bunu requested/resolved/applied üçlüsüne tamamlayacaktır.

---

## 8. Bugünkü “Delegation Engine” Alanı Hakkındaki Doğru Gerçek

Bugünkü formdaki `Delegation engine` alanı, görünüşünün aksine seçili worker satırlarını topluca değiştiren bir UI eylemi değildir.

Gerçekte:

- `MissionSpec.engine` yazar;
- yalnız **engine** boyutunda mission-level fallback olur;
- açık member engine override’larını değiştirmez;
- model, effort ve permission için eşdeğer bir mission fallback üretmez;
- satırlardaki görünen değerleri seçime göre yeniden yazmaz.

Bu nedenle örneğin:

```text
Delegation engine: Gemini

developer satırı: Engine = Codex
reviewer satırı:  Engine = (mission engine)
```

ise:

- developer Codex’te çalışır;
- reviewer Gemini’de çalışır.

Üst alanın Gemini olması bütün satırların Gemini’ye dönüştüğü anlamına gelmez.

> ⚠️ **Oturumdaki eski açıklamanın açık düzeltmesi:** “Takımdaki bütün işçilere tek şalterle motor atayan toplu kontrol” ifadesi mevcut kod için doğru değildir. Bu, arayüzün kullanıcıya doğal olarak düşündürdüğü anlamdır; fakat mevcut mekanizma gizli precedence/fallback’tir. U-101, tam da bu farkı ortadan kaldırmak için gerçek toplu profil eylemini satırları göz önünde değiştiren bir araç olarak tasarlar.

### U-101 Sonrası Doğru Toplu Profil Davranışı

`Apply profile to included workers`:

- ayrı bir runtime precedence katmanı yaratmayacak;
- hedeflenen worker satırlarını görünür biçimde değiştirecek;
- engine + model + effort + permission boyutlarını birlikte sunacak;
- her boyutta `don’t change`, `inherit/clear override` ve explicit değerleri ayıracak;
- yalnız engine uygularken model/effort’u yanlışlıkla silmeyecek;
- uyumsuz kalan explicit model/effort için kullanıcıya etkilenecek satırları gösterecek;
- unchecked / kapsam dışı satırlara dokunmayacak;
- yeni UI payload’ında aynı tercihi hem mission engine’e hem member satırına iki kez yazmayacak.

`MissionSpec.engine` silinmez. Bridge çağrıları, eski kayıtlar ve child mission inheritance için okunmaya devam eder; yalnız yeni composer ikinci bir truth source üretmez.

---

## 9. Planner Modeli ve Bugünkü Eksik Planner Effort Boyutu

Bugünkü `Planner model` alanı:

- lead ajanı değiştirmez;
- üçüncü bir ajan yaratmaz;
- yalnız bu misyonun planner Claude çağrılarına `--model <id>` override’ı ekler;
- worker Task’larının modelini etkilemez.

Boşsa host `--model` geçmez. Claude Code, lead ajan klasöründeki ayarları ve kendi CLI varsayılanını uygular.

Bugünkü kodda:

- `MissionSpec.plannerModel` vardır;
- `plannerEffort` yoktur;
- planner effort override’ı formdan, Bridge’den veya CLI komutundan taşınmaz.

U-100 sonrası hedef:

- Lead identity, sabit planner engine, model override ve effort override tek **Orchestrator** bloğunda görünür;
- engine “Claude Code” diye sabit ve okunur olur, sahte bir engine picker açılmaz;
- `plannerEffort` spec, create, child inheritance, list/status ve `missions.start` sözleşmesine eklenir;
- modelin effort desteği doğrulanır;
- gerçek planner komutuna `--effort` olarak gider;
- boş değer “default” diye sisli bırakılmaz; çözülebiliyorsa gerçek değer + origin, çözülemiyorsa `CLI chooses` gösterilir.

---

## 10. Round, Decision, Strategy, Phase ve Runtime Graph

### 10.1 Round Nedir?

Round, takvimsel bir zaman dilimi değil, **bir planner karar birimidir**:

1. planner mevcut kayıtları okur;
2. bir karar JSON’u üretir;
3. karar doğrulanır;
4. kararın gerektirdiği iş varsa çalıştırılır;
5. sonuçlar settled olur;
6. sonraki planner sınırına geçilir.

Bir round:

- tek bir `replan`;
- bir `ask_user`;
- birden çok parallel/delegate step’i;
- bir evaluate;
- bir conversation opening turn set’i;
- bir finish

olabilir.

### 10.2 Adaptive Reflection Sözleşmesi

Her adaptif planner yanıtında şunlar zorunludur:

```json
{
  "rationale": "Bu kararı şimdi neden verdiğimi kullanıcıya gösteren kısa cümle.",
  "currentPhase": "verifying",
  "strategy": "Geçerli yaklaşımın her turda tam yeniden ifadesi.",
  "changeReason": "Yalnız yaklaşım gerçekten değiştiyse neden değişti.",
  "basedOn": ["d2", "a2-1"],
  "thought": "Kısa karar cümlesi.",
  "action": "evaluate"
}
```

Bu alanlar **chain-of-thought değildir**:

- kullanıcıya gösterilmek üzere kısa ve sözleşmeli yazılır;
- modelin gizli iç muhakemesi kayda açılmaz;
- `rationale` “neden bu karar şimdi?” sorusunu;
- `currentPhase` lead’in gözlemsel faz etiketini;
- `strategy` geçerli çalışma yaklaşımını;
- `basedOn` kararın gerçek causal girdilerini yanıtlar.

### 10.3 Phase

Phase serbest ama kısa bir gözlem etiketidir:

- `triage`
- `researching`
- `building`
- `verifying`

Motor phase adına göre branch etmez. Yani “verifying” diye yazmak bir workflow stage’ini tetiklemez; yalnız run’ın nerede olduğunu insanın anlayabilmesini sağlar.

### 10.4 Strategy Version

Her round yeni strategy version değildir.

```text
Round 1  strategy: "önce mevcut davranışı ölç, sonra düzelt"   → v1
Round 2  aynı normalize edilmiş strateji                       → hâlâ v1
Round 3  aynı yaklaşımın uygulaması                            → hâlâ v1
Round 4  "UI kopyasını bırak, host preview resolver kur"       → v2
```

Motor strategy metnini normalize ederek öncekiyle karşılaştırır. Gerçek yaklaşım değiştiğinde:

- version artar;
- change reason;
- değişime yol açan decision;
- zaman;
- phase

trace’e yazılır.

`replan`, yaklaşımın yanlış olduğunu açıkça kaydeden primitive’dir. Sırf düşünmek veya cümleyi yeniden yazmak için kullanılmaz; bir planner call ve round harcar.

### 10.5 Causal Graph

Adaptive trace’te:

- her planner kararı bir decision node;
- her gerçek primitive işi bir action/evaluation/delegation node;
- `parentRefs` bu node’un hangi karardan doğduğunu;
- `inputRefs` hangi gerçek sonuçları tükettiğini;
- `outputRefs` ne ürettiğini

gösterir.

Birden çok işin sonucuna dayanan kararın fan-in’i, timestamp yakınlığından tahmin edilmez; `basedOn` / `inputRefs` üzerinden kaydedilir.

`basedOn` olmayan ilk hatalı causal id’de planner bir kez düzeltilmeye çağrılır. Aynı sorun sürerse doğrulanamayan provenance düşürülür ve ledger’a açıkça yazılır; hayali graph edge tutulmaz.

Planner yanıtı JSON değilse veya primitive sözleşmesini ihlal ediyorsa error metni aynı planner’a bir kez geri verilip düzeltme istenir. İkinci yanıt da parse edilemezse run protokol hatasıyla fail olur; motor serbest metni karar diye tahmin etmez.

---

## 11. Dalga Planı, Paralellik ve One-Writer Kuralı

Bir round birden çok step isteyebilir. Motor bunları `maxParallel` ve yazma güvenliğiyle **wave**’lere böler.

### Workdir Yoksa

Step’ler `maxParallel` büyüklüğünde düz parçalara ayrılır.

```text
5 step · maxParallel 2

Wave 1: step 1 + step 2
Wave 2: step 3 + step 4
Wave 3: step 5
```

### Workdir Varsa

Bir wave’de:

- en fazla `maxParallel` step;
- en fazla **bir writer**;
- boş yerleri readonly işler doldurabilir.

```text
writer A + readonly B + readonly C  → aynı wave olabilir
writer A + writer D                 → ayrı wave’lere bölünür
```

Bu kural:

- iki ajanın aynı repo/klasöre aynı anda yazıp değişiklikleri ezmesini önler;
- `parallel` primitive’iyle bile aşılamaz;
- correctness kuralıdır, pacing tercihi değildir.

`maxParallel: 0`, concurrency ceiling’i kaldırarak round’u mümkün olduğunca tek wave’e koyar; one-writer kuralı yine writer’ları ayırır.

### `delegate` ve `parallel` Arasındaki Gerçek Fark

`parallel`, ayrı bir executor değildir. `delegate` ile aynı çalışma yoluna gider; lead ayrıca görevlerin birbirinden bağımsız olduğunu beyan eder.

| Primitive | Lead’in söylediği | Motorun garantisi |
| :--- | :--- | :--- |
| `delegate` | “Bu işleri yap.” | Güvenli wave planı |
| `parallel` | “Bu işler birbirini beklemiyor; birlikte başlat.” | Kapasite ve writer kuralı izin verdiği ölçüde birlikte başlatma |

İki writer varsa motor `parallel` talebini güvenle serialize eder ve lead’e bunun yapıldığını söyler. “Parallel seçtim, mutlaka aynı anda yazdılar” sonucu çıkarılamaz.

---

## 12. 14 Primitive: Tam Katalog

Primitive kayıt defteri tek source of truth’tür. Planner menüsü, parser dispatch’i, alan sözleşmeleri ve bazı prompt kuralları aynı registry’den üretilir.

| # | Primitive | Scope | Shape | Gerçekte başlattığı şey |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `delegate` | Classic + Adaptive | work | Bir veya daha çok FarmTask |
| 2 | `parallel` | Adaptive | work | Bağımsızlık iddialı FarmTask’lar |
| 3 | `review` | Adaptive | typed work | Bir readonly FarmTask |
| 4 | `compare` | Adaptive | typed work | Bir readonly FarmTask |
| 5 | `revise` | Adaptive | typed work | Bir writer FarmTask |
| 6 | `evaluate` | Adaptive | work/verdict | Lead self-evaluation veya reviewer FarmTask |
| 7 | `run_workflow` | Adaptive | work | Var olan Workflow run |
| 8 | `run_mission` | Adaptive | work | Child adaptive Mission run |
| 9 | `message` | Adaptive | conversation work | Konuşma mesajına dönüşen FarmTask |
| 10 | `council` | Adaptive | conversation work | Council mandate + açılış speaking turn’leri |
| 11 | `replan` | Adaptive | plan | Strategy değişim kararı; worker başlatmaz |
| 12 | `finish` | Classic + Adaptive | terminal | Run’ı verdict ile kapatır |
| 13 | `ask_user` | Classic + Adaptive | human | Kullanıcı sorusu ve bekleme |
| 14 | `abort` | Classic + Adaptive | terminal | Ulaşılamayan objective’i dürüstçe kapatır |

### 12.1 `delegate`

**Amaç:** Pool/team içindeki bir veya daha çok ajana self-contained iş vermek.

Örnek:

```json
{
  "rationale": "Mevcut davranışı ve test açığını iki bağımsız okumayla çıkarmalıyım.",
  "currentPhase": "triage",
  "strategy": "Önce davranışı ölç, sonra tek değişiklik planı kur.",
  "basedOn": [],
  "thought": "Kod ve test sözleşmesini ayrı ajanlara okutuyorum.",
  "action": "delegate",
  "tasks": [
    {
      "agent": "developer",
      "title": "Current resolver flow",
      "prompt": "Read the relevant files and report the exact precedence...",
      "expect": "A source-linked precedence table",
      "criteria": ["c1"],
      "readonly": true
    },
    {
      "agent": "tester",
      "title": "Coverage map",
      "prompt": "Read mission dimension tests and list uncovered branches...",
      "expect": "A concrete missing-test list",
      "criteria": ["c2"],
      "readonly": true
    }
  ]
}
```

Kurallar:

- agent adı pool’da bulunmalıdır;
- prompt kendi başına anlaşılır olmalıdır; delegate planner’ın konuşmasını görmez;
- `readonly` açıkça belirtilmelidir;
- hangi kriter için yapıldığı biliniyorsa `criteria` id’leri yazılmalıdır;
- aynı agent + normalize edilmiş aynı prompt ikinci kez verilirse planning-loop guard devreye girer;
- round başına task sayısının parser tavanı 6’dır;
- tek task prompt’u 8.000 karakterle sınırlıdır.

### 12.2 `parallel`

**Amaç:** `delegate` ile aynı işleri isterken bunların birbirine bağımlı olmadığını beyan etmek.

Ne zaman kullanılır:

- iki farklı kaynak araştırması;
- birbirinin çıktısını gerektirmeyen iki readonly analiz;
- ayrı çalışma klasörlerinde bağımsız üretim;
- bir writer yanında bir veya daha çok readonly kontrol.

Ne zaman kullanılmaz:

- B, A’nın ürettiği dosyayı okuyacaksa;
- iki ajan aynı workdir’de yazacaksa “aynı anda yazsınlar” beklentisiyle;
- sıralı review → revise akışını tek round’a sıkıştırmak için.

Motor bağımsızlık beyanını kabul eder ama güvenlik ve concurrency ceiling’ini uygulamaya devam eder.

### 12.3 `review`

**Amaç:** Daha önce gerçekten üretilmiş bir veya daha çok sonucu eleştirel inceletmek.

Sözleşme:

- en az bir settled `target` gerekir;
- motor target id’lerinden gerçek archived output’u bulur;
- lead’in paraphrase ettiği sahte içerik kullanılmaz;
- reviewer readonly çalışır;
- çıktı, objective verdict’i değil lead için evidence’tır.

```json
{
  "action": "review",
  "agent": "reviewer",
  "targets": ["a2-1"],
  "ask": "Check the implementation against c1 and identify concrete gaps.",
  "criteria": ["c1"]
}
```

`review`:

- dosyayı düzeltmez;
- kriteri `pass` ilan etmez;
- yalnız kusurları, eksikleri ve sağlam tarafları raporlar.

Kriter hükmü gerekiyorsa sonraki eylem `evaluate` olmalıdır.

### 12.4 `compare`

**Amaç:** En az iki gerçek sonucu belirli bir amaç için kıyaslatmak.

Sözleşme:

- en az iki settled target;
- reviewer sonuçların gerçek metnini alır;
- nerede ayrıştıklarını ve hangisinin amaç için neden güçlü olduğunu söyler;
- sonuçları merge etmez;
- yeni artefact üretmez;
- readonly’dir.

```json
{
  "action": "compare",
  "agent": "architect",
  "targets": ["a1-1", "a1-2"],
  "ask": "Choose the safer migration path under the no-breaking-change constraint."
}
```

### 12.5 `revise`

**Amaç:** Aynı yaklaşım ve aynı artefact üzerinde, adı konmuş açığı kapatmak.

```json
{
  "action": "revise",
  "agent": "developer",
  "targets": ["a2-1", "a3-1"],
  "ask": "Keep the host resolver design; close the missing permission-origin and reload cases.",
  "criteria": ["c1", "c2"]
}
```

`revise` ile `replan` farkı:

| Durum | Doğru primitive |
| :--- | :--- |
| Çözüm yaklaşımı doğru; uygulamada eksik branch var | `revise` |
| Artefact doğru; açıklama/test eksik | `revise` |
| Temel mimari yanlış; başka yaklaşım gerekli | `replan` |

Bir revise, kaynak target’ların successor’ıdır. Eski target hakkında verilen evaluation, ilgili iş değiştiği için stale olabilir.

### 12.6 `evaluate`

**Amaç:** Başarı kriterlerini gerçek, settled work’e bağlayarak hüküm vermek.

İki yol vardır:

#### Lead Self-Evaluation

`reviewer` verilmez. Lead zaten elinde bulunan sonuçlara bakar ve **aynı JSON yanıtında** findings + advice verir. Ayrı Task açılmaz.

```json
{
  "action": "evaluate",
  "targets": ["a4-1", "a4-2"],
  "findings": [
    {
      "criterion": "c1",
      "verdict": "pass",
      "evidence": "a4-1 reports all precedence cases and a4-2 shows the tests passing.",
      "gap": ""
    },
    {
      "criterion": "c2",
      "verdict": "unknown",
      "evidence": "No visual render was supplied.",
      "gap": "Dark and light render verification is missing."
    }
  ],
  "advice": "revise",
  "confidence": 0.86
}
```

#### Independent Reviewer Evaluation

`reviewer` pool’dan bir ajan olarak verilir. Normal FarmTask açılır; Task aynı bütçe, wave ve cancel kurallarına tabidir. Çıktısı ortak evaluation parser’ından geçirilir.

```json
{
  "action": "evaluate",
  "targets": ["a4-1", "a4-2"],
  "reviewer": "reviewer"
}
```

İki yolun sonucu aynı `MissionEvaluation` yapısına iner. Gate, self-review ve independent review için iki ayrı başarı tanımı kullanmaz.

### 12.7 `run_workflow`

**Amaç:** Bu VS Code penceresinde zaten tanımlı bir Workflow zincirini tek mission action’ı olarak çalıştırmak.

Lead:

- yeni Workflow compose edemez;
- chain adımlarını tek tek sürmez;
- yalnız listede var olan workflow id’sini çağırır.

Mission açısından Workflow:

- tek step’tir;
- done / failed / stopped olur;
- sonucu son tamamlanmış Workflow step’inin final handoff’udur;
- maliyet ve token toplamı mission’a bir kez yazılır;
- approval, budget, cancel ve reload reconciliation aynı mission wave yolundan geçer.

Bir iş tek delegasyonla yapılabiliyorsa `run_workflow` gerekmez. Önceden kurulmuş zincirin semantiğine ihtiyaç varsa kullanılır.

### 12.8 `run_mission`

**Amaç:** Tek bir Task’tan büyük, kendi planlama döngüsüne ihtiyaç duyan alt hedefi child adaptive mission’a vermek.

Lead yalnız şunları ister:

- child goal;
- child success criteria;
- ek child constraints;
- opsiyonel title.

Güvenlik alanlarını lead seçmez. Child:

- parent lead’i;
- parent pool’u;
- parent workdir’i;
- parent engine fallback’ini;
- parent planner modelini;
- parent project’ini;
- parent approval mode’unu;
- parent constraints + child constraints birleşimini

miras alır.

Limitler parent’ın **kalan** bütçesinden kesilir. Mevcut kod child’a rounds/tasks/cost/tokens/minutes için yaklaşık kalan payın yarısını, maxParallel için parent değerini verir. Unlimited parent ekseni child’da da 0/unlimited kalır.

Koruma:

- maksimum child mission derinliği 3’tür;
- ancestor goal ile aynı normalize objective yeniden child yapılırsa cycle reddedilir;
- child cost/tokens parent’a bir kez roll up edilir;
- child bir output file değil, `success | partial | failed` verdict ve unmet kriter özeti döndürür.

### 12.9 `message`

**Amaç:** Bir ajanı gerçek bir speaking turn çalıştırarak başka ajanlara konuşturmak.

Bir message:

- planner’ın yazdığı rol yapma metni değildir;
- normal headless FarmTask’tır;
- speaker agent’a `refs` ile işaretlenen gerçek message metinleri verilir;
- speaker’ın gerçek Task cevabı message excerpt/contentRef olarak kaydedilir;
- task id ve gerçek session id ile bağlanır.

Yeni conversation açmak için:

- objective;
- en az iki participant;
- `from` speaker veya bağımsız açılış için speaker listesi

verilir.

Mevcut conversation’a devam etmek için `conversation: "c1"` kullanılır.

Birden çok `from` aynı kararda verilirse konuşmacılar record’un aynı başlangıç halinden brief edilir; birbirlerinin o round’daki cevabını görmeden bağımsız konuşurlar. İki ayrı round bunu garanti edemez, çünkü ikinci round geldiğinde ilk message artık kayıttadır.

### 12.10 `council`

**Amaç:** Tek ve objective’den daha dar bir soru üzerinde chair, member, turn cap ve resmi çıkış nedeni olan tartışma açmak.

Council ikinci bir konuşma motoru değildir:

- sıradan MissionConversation kaydı üzerinde yaşar;
- açılış turn’leri normal message Task’larıdır;
- sonraki tur konuşmaları `message` ile devam eder;
- sabit “A konuşsun, B cevaplasın, üçüncü tur synthesis” senaryosu yoktur;
- sıradaki konuşmacıyı lead, gerçekten söylenenlere bakarak round anında seçer.

Council’in objective başarı kriterlerini hükme bağlama yetkisi yoktur. Oylama evidence’tır; criterion verdict yalnız `evaluate` ile oluşur.

### 12.11 `replan`

**Amaç:** Aynı artefact’ı düzeltmek değil, çalışma yaklaşımının değiştiğini görünür bir karar olarak kaydetmek.

`replan`:

- worker başlatmaz;
- bir round ve planner call harcar;
- yeni strategy metni ve `changeReason` ile version değişimini kayda geçirir;
- ardından gelen iş yeni strategy version altında doğar.

### 12.12 `finish`

**Amaç:** Objective’i `success | partial | failed` verdict’i ve özetle kapatmak.

Adaptive `success` yalnız:

- her required criterion’in güncel pass’i varsa;
- verdict ile stopReason tutarlıysa

kabul edilir.

Lead başarıda ısrar eder ama gate kapalıysa:

1. ilk ihlalde unmet kriterler verilerek düzeltmesi istenir;
2. ikinci ısrarda motor hayali başarıyı kabul etmez; sonucu unmet listesiyle partial’a düşürür.

### 12.13 `ask_user`

**Amaç:** Kullanıcıdan bir karar veya bilgi isteyip run’ı cevap gelene kadar bekletmek.

`ask_user`:

- journal’a `human.asked` yazar;
- run’ı `waiting-user` durumuna geçirir;
- Needs You ve Missions detail’de soruyu görünür kılar;
- cevap `human.answered` olarak kaydedilir;
- kullanıcı bekleme süresi mission wall-clock limitinden düşülür.

Autonomy `decide-alone` olsa bile gerçek bir blok varsa ask_user mümkündür; yalnız sırf belirsizlik hissetti diye sormaması beklenir.

### 12.14 `abort`

**Amaç:** Objective’e ulaşılamadığını dürüst verdict ve summary ile kapatmak.

`abort`:

- `success` olamaz;
- user-stop üretemez; `user-stop` motorun kullanıcı Cancel eylemine ayırdığı nedendir;
- eldeki sonuçları, ulaşılamayan kriterleri ve stopReason’i açıkça taşır.

---

## 13. Typed Work Neden Serbest Metin Delegasyonundan Farklıdır?

`review`, `compare` ve `revise` yeni execution engine’leri değildir. Üçü de normal Task açar. Fark, motorun prompt’u gerçek target output’larından üretmesidir.

### Şema 3: Target Bağlama

```text
Lead: "review a2-1"
          │
          ▼
Motor a2-1’in settled kaydını bulur
          │
          ├── task/output yoksa → target-missing / request-refused
          ▼
Archived output’u kendi engine reader’ıyla okur
          │
          ▼
Typed heading + charge + lead ask + gerçek material
          │
          ▼
Reviewer Task
```

Bu yapı iki sahteciliği engeller:

1. Lead, hiç üretilmemiş bir işi “A şunu yaptı” diye paraphrase edip reviewer’a veremez.
2. Bir verdict veya revision, hangi gerçek versiyon üzerinde çalıştığı belirsiz kalamaz.

Target:

- bu run’da var olmalı;
- settled olmalı;
- okunabilir gerçek output/result taşımalı;
- primitive’in minimum target sayısını karşılamalıdır.

---

## 14. Gerçek Ajan Konuşmaları

Sistemin savunduğu temel ilke şudur:

> Üç ajana aynı soruyu ayrı ayrı sormak, o ajanların tartıştığı anlamına gelmez.

Bir conversation bir rendering değil, **gerçek speaking turn kayıtlarının bütünü**dür.

### 14.1 Message Intent Kapalı Kümesi

| Intent | Ref gerekir mi? | Açık thread yaratır mı? | Ref’i settle eder mi? | İşlevi |
| :--- | :---: | :---: | :---: | :--- |
| `proposal` | Hayır | Hayır | Hayır | Kendi yaklaşımını/cevabını ortaya koyar. |
| `question` | Hayır | Evet | Hayır | Başka katılımcıya yanıtlanabilir bir soru sorar. |
| `challenge` | Evet | Evet | Hayır | Adı verilen message’daki belirli iddiaya karşı çıkar. |
| `response` | Evet | Hayır | Evet | Adı verilen question/challenge’a doğrudan cevap verir. |
| `evidence` | Hayır | Hayır | Hayır | Kontrol edilebilir çıktı, ölçüm veya dosya getirir. |
| `concede` | Evet | Hayır | Evet | Daha önce karşı çıkılan belirli noktayı kabul eder. |
| `synthesis` | Evet | Hayır | Evet | Adı verilen message’ları izlenebilir biçimde bir araya getirir. |
| `vote` | Evet | Hayır | Evet | Adı verilen seçenekler arasında gerekçeli ve güvenli seçim söyler. |

### 14.2 Ref Kuralları

- `challenge`, `response`, `concede`, `synthesis`, `vote` refs olmadan reddedilir.
- Ref aynı conversation içindeki gerçek message id’si olmalıdır.
- Yalnız id’nin var olması yetmez; message `delivered` olmalıdır. Pending, failed veya cancelled bir turn “söylenmiş” kabul edilmez.
- `response` ve `concede`, dar biçimde başka bir muhataba sorulan şeyi ilgisiz bir bystander adına settle edemez.
- `synthesis`, cevap değil room-level bir birleştirme olduğundan bu addressee kuralına tabi değildir.

### 14.3 Open Thread Nedir?

Delivered bir:

- `question`;
- `challenge`

message’ı, onu refs ile adlandıran settling intent gelene kadar açıktır.

“Conversation’da 8 turn var” anlamlı bir tamamlama ölçüsü değildir. “`m3` challenge’ı hâlâ cevapsız” anlamlıdır.

Conversations UI ve `missions.conversation` bu open id’leri gösterir.

### 14.4 Kim Kime Konuşur?

- `from`: konuşan gerçek agent; lead de kendi adına konuşabilir.
- `to: []`: conversation’daki herkese.
- dolu `to`: yalnız adı verilen muhataplara.
- participants: conversation açılırken sabitlenir.
- sonradan yeni ajan eklenmez; gerekiyorsa yeni conversation açılır.

Aynı participant aynı conversation’da aynı anda iki speaking turn çalıştıramaz. Bu bir paralellik değil race olurdu:

- ikinci turn, ilk turn’ün henüz yazmadığı record’dan brief edilirdi;
- resumable engine’de ikisi aynı session’ı sürdürmeye çalışırdı.

Farklı participant’lar aynı opening round’da bağımsız konuşabilir.

### 14.5 Session Lane Sürekliliği

Bir speaker tekrar konuştuğunda üç dürüst durum vardır:

| `carried` | Anlamı |
| :--- | :--- |
| `new` | İlk turn; yeni session açıldı. |
| `resumed` | Aynı speaker’ın gerçek önceki session’ı engine’in resume yolu ile sürdürüldü. |
| `handoff` | Yeni session açıldı; önceki exchange gerçek metin olarak yeni session’a verildi. |

Handoff bağlam aktarır ama oturum devamlılığı değildir. UI ve Bridge bunu “resumed” diye etiketlemez.

Resume kararı:

- member/mission/default resolver ile gerçek worker engine’i bulur;
- o engine’in ölçülmüş headless resume desteğine bakar;
- destek varsa Task’a `resumeSessionId` verir;
- gerçek çalışmanın açtığı session id’yi Task’tan geri okur.

### 14.6 Message Metni Nerede Yaşar?

Her delivered message:

- bounded `excerpt`;
- full Task output’una `contentRef`;
- `taskId`;
- `sessionId`

taşır.

Okuyucu önce speaker’ın engine’ine uygun reader ile full archive’ı açar. Archive retention nedeniyle yoksa excerpt’e düşer. Bridge `textSource: file | excerpt | none` ile hangisini verdiğini açıkça söyler.

Planner’a her round bütün transcript yeniden verilmez. Bu, uzun tartışmada erken turn’leri her sonraki round’da tekrar tekrar ödeterek bağlamı kuadratik büyütürdü. Planner:

- unanswered threads;
- son birkaç turn’ün kısa digest’i;
- gerektiğinde sorgulayacağı gerçek message id’leri

ile brief edilir. Tam transcript Missions room ve `missions.conversation` üzerinden okunur.

---

## 15. Council: Chair’li ve Çıkış Kurallı Tartışma

Council, conversation’a yalnız dört sözleşme ekler:

1. objective’den daha dar tek bir **question**;
2. bir **chair**;
3. sonsuz tartışmayı durduran **maxTurns**;
4. kapalı kümeden seçilen resmi **exit**.

### 15.1 Council Açma

Council:

- en az iki member ister;
- default chair olarak lead’i kullanır;
- başka chair seçilirse o ajan member/pool içinde olmalıdır;
- `maxTurns` default 8, geçerli aralık 2–40’tır;
- opsiyonel `options` listesi trim edilir, boşlar ve case-insensitive tekrarlar atılır, en çok 6 seçenek tutulur.

### 15.2 Lead Dışında Chair Varsa

Lead hâlâ engine’e JSON kararı veren aktördür. Bu nedenle “chair sıradaki kişiyi çağırdı” cümlesinin lead tarafından uydurulmasını önlemek gerekir.

İlk bağımsız opening turn’leri dışında:

- chair olmayan birinin yeni turn’ü;
- chair’in son delivered message id’sini refs içinde taşımak zorundadır.

Böylece speaker’a chair’in gerçekten yazdığı metin gösterilir.

### 15.3 Turn Cap

Ordered ve cancelled olmayan turn’ler harcanmış sayılır. Failed turn de delegasyon ve bütçe harcadığı için cap’ten düşer.

Cap dolduğunda:

- sıradan yeni turn reddedilir;
- council’i kapatan bir final turn cap’in bir adım ötesinde çalışabilir;
- bu istisna olmazsa `hard limit` çıkışını söyleyecek turn de cap yüzünden engellenirdi.

### 15.4 Yedi Resmi Exit

| Exit | Ne söyler? |
| :--- | :--- |
| `consensus` | Katılımcılar anlaştı ve anlaşma record’da. |
| `sufficient evidence` | Herkes anlaşmasa da soruyu yanıtlayacak kanıt yeterli. |
| `no new information` | Son turn’ler mevcut pozisyonları tekrarlıyor. |
| `decision clear` | Chair, söylenenlerden cevabı artık açıkça çıkarabiliyor. |
| `need execution` | Konuşma yetmez; gerçek iş yapılıp sonucuna bakılmalı. |
| `hard limit` | Council turn cap’i veya run budget’ı bitti. |
| `chair abort` | Soru yanlış veya tartışma mandatın dışına çıktı. |

Council sessizlikten “kapanmış” sayılmaz. `closedAt` ve exit açıkça yazılmalıdır.

### 15.5 Vote

Vote, speaker’ın gerçek message’ıdır. Lead, başka ajan adına ayrı vote field dolduramaz.

Motor seçim metnini şu sırada okur:

1. `vote: X`, `choice: X`, `I vote X` gibi structured ifade;
2. yoksa bütün metinde tam sözcük eşleşmesi.

Şunlar tahmin edilmez:

- iki seçeneği birden anan metin;
- “X değil” diye reddedilen seçenek;
- başka kelimenin içinde geçen substring;
- hiçbir option’ı açıkça söylemeyen turn.

Bunlar `unclear` olur. Aynı member’ın ikinci ballot’u transcript’te kalır ama tally’de superseded olur; kişi başına bir oy sayılır. Tie bir sonuçtur ve tie olarak raporlanır, gizli tie-break yapılmaz.

> ⚠️ **Council oyu başarı kriteri değildir.** Üç reviewer “oldu” dese bile required criterion ancak `evaluate` kaydıyla pass olur.

---

## 16. Evaluation, Staleness ve Success Gate

### 16.1 Verdict Neden Task Status Değildir?

```text
Task status = İş process’i çalıştı mı?
Criterion verdict = Objective’in belirli ölçüsü gerçekten sağlandı mı?
```

Bir delegate:

- exit 0 ile bitebilir ama hiçbir gerekli aracı kullanmamış olabilir;
- iyi bir analiz üretmiş ama deliverable’ı değiştirmemiş olabilir;
- output üretmiş ama kriterin yalnız yarısını karşılamış olabilir.

Bu yüzden `done`, `pass` değildir.

### 16.2 Evaluation Kaydı

Her evaluation:

- immutable id;
- baktığı settled target id’leri;
- target’ların o andaki settled time/version bilgisi;
- evaluator: lead veya agent;
- criterion findings;
- evidence;
- gap;
- advice;
- opsiyonel confidence;
- zaman

taşır.

Confidence zorunlu değildir ve gate hiçbir confidence eşiğine bağlanmaz. Nitel bir ölçüye sahte sayısal kesinlik dayatılmaz.

### 16.3 Verdict’ler

| Verdict | Anlamı |
| :--- | :--- |
| `pass` | Gözlenen kanıt kriteri karşılıyor. |
| `fail` | Gözlenen kanıt belirli bir eksik/aykırılık gösteriyor. |
| `unknown` | Mevcut material ile hüküm verilemiyor. Ne pass ne fail uydurulur. |
| `unjudged` | O kriter hakkında henüz güncel evaluation yok; UI/Bridge’in türettiği durum. |

Reviewer çıktısı parse edilemez, timeout olur veya bozulursa kriterler “iş kötü” diye fail edilmez. Review işlemi hakkında `unknown` ve neden kaydedilir.

### 16.4 Evaluation Advice

`finish | revise | replan | explore | ask_user | partial | failed`

Advice motor komutu değildir:

- lead sonraki kararı verir;
- hard limit advice’ın üstündedir;
- success gate her ikisinin üstünde doğruluk kontrolüdür.

### 16.5 Staleness

Stale yaşla ilgili değildir. Bir saat önce verilmiş ama artefact’ı değişmemiş pass hâlâ geçerlidir.

Bir evaluation şu durumlarda stale olur:

1. daha sonra, hüküm verdiği criterion id’lerinden birine bağlı yeni iş settled olursa;
2. daha sonraki iş, evaluation’ın baktığı target’lardan birini `sources` içinde predecessor olarak adlandırırsa;
3. daha sonraki bir **writer**, hangi kriter/target için yazdığını hiç söylemezse.

Üçüncü kural muhafazakârdır: unlabeled writer herhangi bir şeyi değiştirmiş olabilir. Eski pass’i geçerli tutmak, güncel olmayan artefact üzerinde success açmaktan daha risklidir.

Stale etmeyen örnekler:

- salt readonly okuma;
- başka kriterlere açıkça bağlı writer;
- artefact’a dokunmayan ek evidence.

Stale flag diske ikinci gerçek olarak yazılmaz; settled work timeline’ından türetilir.

### 16.6 Success Gate

```text
Her REQUIRED kriter
        │
        ├── güncel pass var → açık
        ├── fail var         → kapalı
        ├── unknown var      → kapalı
        ├── yalnız stale pass→ kapalı
        └── unjudged         → kapalı

Bütün required satırlar açık mı?
        ├── EVET → finish + success kabul edilebilir
        └── HAYIR → success reddedilir / unmet listesi döner
```

Optional criterion fail veya unknown olabilir; result summary’de görünür ama başarı kapısını tutmaz.

---

## 17. Kapanış Verdict’i ve Stop Reason

Verdict:

- `success`
- `partial`
- `failed`

Stop reason:

| Stop reason | Kullanım |
| :--- | :--- |
| `criteria-satisfied` | Required criteria current pass ve objective başarıyla tamamlandı. |
| `sufficient-evidence` | Mevcut kanıt, daha fazla işin anlamlı olmadığını gösteriyor. |
| `no-new-information` | Yeni denemeler tekrar ediyor; ek bilgi gelmiyor. |
| `execution-over-discussion` | Konuşma değil gerçek execution gerekli; mevcut run burada dürüstçe kapanıyor. |
| `hard-limit` | Round/task/cost/token/time gibi mekanik ceiling bitti. |
| `user-stop` | Kullanıcı Cancel ile durdurdu; yalnız engine üretir. |

Tutarlılık kuralları:

- `criteria-satisfied` yalnız `success` ile;
- `hard-limit` hiçbir zaman `success` ile;
- `abort` hiçbir zaman `success` ile;
- lead `user-stop` seçemez;
- verdict, summary ve stopReason birbiriyle çelişirse yanıt reddedilir.

Adaptive run success dışı kapanışta:

- stopReason;
- unmet required criteria;
- her unmet kriterin son verdict’i

run result’ta tutulur. “Partial” sözcüğü tek başına başarıya yakınlık maskesi olarak kullanılamaz.

---

## 18. Kullanıcının Canlı Müdahale Yolları

### 18.1 Approval

`approvalMode: each-round` iken:

1. planner round planını kurar;
2. step’ler başlamadan approval kaydı açılır;
3. Missions detail ve Needs You bunu gösterir;
4. Approve ise wave çalışır;
5. Reject ise step’ler cancelled/rejected olarak işaretlenir ve ret lead’in sonraki kararına gider.

Approval:

- planner’ın düşünmesini değil gerçek delegasyonların başlamasını kapılar;
- reddedilen round’u sessizce yok etmez;
- audit kaydında kalır.

### 18.2 Ask User

Lead’in `ask_user` primitive’iyle sorduğu sorudur. Missions detail’de cevaplanabilir; Bridge’de:

- `missions.status` → `pendingQuestion`;
- `missions.answer { id, answer }`;
- cevap vermeyi reddetmek için `skip: true`

yolu vardır.

### 18.3 Guide Next Decision

Kullanıcı çalışan adaptive run’a tek seferlik steer bırakabilir.

```text
Kullanıcı "Queue steer"
        │
        ▼
guidance run’a ve journal’a pending yazılır
        │
        ├── şu anda çalışan delegate prompt’u DEĞİŞMEZ
        │
        ▼
bir sonraki planner boundary
        │
        ▼
lead’e TAM BİR KEZ enjekte edilir
        │
        ▼
appliedAt + ikinci journal olayı
```

Yanıt:

- canlı run’da `appliesAt: next-round`;
- paused run’da `appliesAt: on-resume`;
- pending guidance sayısı

taşır.

Classic run’da adaptif planner guidance boundary sözleşmesi yoktur; `missions.guide` bunu adıyla reddeder.

> ⚠️ **Guide bir Console steer değildir.** Console’da Claude engine’e mid-turn mesaj yollamak başka mekanizmadır. Mission Guide, çalışan worker’a girmez; lead’in sonraki kararına gider.

### 18.4 Pause

Pause isteği:

- yürüyen activity’yi yarıda kesmez;
- mevcut wave/işin bitmesini bekler;
- sonraki planner round’dan önce run’ı park eder;
- `pausePending` halinde UI “Pausing… (undo)” gösterebilir;
- gerçekleşmeden önce geri alınabilir.

### 18.5 Resume

İki durum:

- engine hâlâ memory’de canlı-paused ise `unpause`;
- reload sonrası parked/interrupted run ise context ile yeniden launch.

Trace reconciliation `resume: ok | rebrief | refuse` sonucu verir:

- `ok`: journal ve external records tutarlı;
- `rebrief`: record eksik/hasarlı ama bilinmeyen in-flight iş yok; objective’den yeniden brief edilebilir;
- `refuse`: bilinmeyen fate’e sahip iş veya daha yeni schema vardır; devam duplicate/damage riski taşır.

### 18.6 Cancel

Cancel:

- mission engine’i durdurur;
- in-flight Task’ları;
- child mission’ları;
- workflow step’lerini;
- pending approval’ı

iptal eder.

Sonuç `user-stop` ve unmet criteria ile dürüstçe kapanır. Cancel, delete değildir; run history okunmaya devam eder.

### 18.7 Rerun

`missions.rerun` finished run’ın:

- aynı spec’i;
- yeni run id;
- yeni round/ledger;
- yeniden harcanabilecek aynı limitler

ile baştan koşulmasıdır.

`resume` değildir. Eski run korunur ve yeniden maliyet doğurur.

---

## 19. Altı Mission Limiti ve Gerçek Bütçe Anlamı

### 19.1 Varsayılanlar

| Limit | Varsayılan | Neyi sınırlar? |
| :--- | ---: | :--- |
| `maxRounds` | 8 | Planner karar sayısı |
| `maxTasks` | 12 | Toplam mission work step/delegasyon sayısı |
| `maxCostUSD` | 5 | Fiyat raporlayan engine’lerden ve planner’dan gelen dolar |
| `maxTokens` | 2.000.000 | Bütün misyonun token tüketimi |
| `maxMinutes` | 120 | Kullanıcı beklemesi hariç wall clock |
| `maxParallel` | 2 | Wave başına eşzamanlı step kapasitesi |

Her eksende:

- üst clamp yoktur;
- pozitif değer kendi minimum uygulanabilir tabanına kaldırılabilir;
- **yalnız tam `0` unlimited** demektir.

### 19.2 Neden Hem Cost Hem Token?

Bazı engine’ler turn fiyatını raporlar, bazıları raporlamaz. Fiyat raporlamayan engine’de:

```text
costUSD = 0
```

“bedava çalıştı” anlamına gelmez; dolar verisi yoktur. Böyle bir mission `maxCostUSD` değerine hiçbir zaman ulaşamayabilir. `maxTokens`, bu koşumların gerçek sert bütçe frenidir.

UI ve Bridge’de cost okunurken engine’in `reportsCost/costSource` niteliğiyle birlikte okunmalıdır.

### 19.3 Bütçe Ne Zaman Kontrol Edilir?

- Planner boundary’de kalan rounds/tasks/cost/tokens/time hesaplanır.
- Planner çağrısının maliyeti ve token’ı, çağrı döner dönmez run’a eklenir.
- In-flight wave sırasında yaklaşık 15 saniyelik guard time ve settled spend’i izler.
- Ceiling mid-wave dolarsa yürüyen child/task/workflow’ları iptal yoluna götürür.
- Settled round’un harcaması `booked` işaretiyle run toplamına bir kez yazılır.
- Reload recovery, kapanmadan önce settled olup snapshot’a yazılamayan round maliyetini yeniden bulur ve iki kez saymaz.

Budget bir planner boundary’de tükenmişse yeni work başlatılmaz; lead’den dürüst `finish` veya `abort` istenir. Ek Task açmadığı için lead’in mevcut sonuçlar üzerinde self-evaluation yapmasına izin verilebilir; bağımsız reviewer evaluation ise yeni work olacağı için bütçe dışında başlatılamaz.

### 19.4 Allocation ile Spend Farkı

Round ve task sayıları planner boundary’de allocation olarak kontrol edilir. Cost/tokens ise gerçek settled kullanım geldikçe bilinir.

Bu nedenle:

- max task’i aşan tail step’ler drop edilebilir;
- time/cost/token wave içindeyken de bitebilir;
- hard planner-call cap, malformed/retry çağrılarının limitsiz karar çağrısı doğurmasını engeller.

Normalde planner call hard cap’i `maxRounds + 6`dır. `maxRounds: 0` ise bu ek cap de unlimited olur.

### 19.5 Waited Time

Kullanıcı:

- approval;
- question

bekletirken geçen süre `waitedMs` içinde tutulur ve `maxMinutes` wall-clock hesabından çıkarılır. Kullanıcının bir gece sonra cevap vermesi mission’ın iki saatlik execution limitini tüketmiş sayılmaz.

### 19.6 Fleet Daily Budgets ve M-28

Mission limitleriyle filo günlük budget gate’i ayrı katmanlardır.

| Mekanizma | Scope | Nerede tanımlı? | Ne yapar? |
| :--- | :--- | :--- | :--- |
| Mission `maxCostUSD/maxTokens/...` | Tek run | Mission spec/form | Bu run’ın kendi ceiling’leri |
| `agentFarm.budgets` | Ajan veya `*` filo | Settings | Günlük USD budget kapısı |
| `agentFarm.budgetsUnlimited` | Bütün bütçeler | Settings | Sayıları silmeden bütün daily budget’ları geçici askıya alır |

`budgetsUnlimited: true` olduğunda budget reader boş limit set’i döndürür; kayıtlı rakamlar silinmez ve ayar kapanınca geri gelir.

M-28’in mevcut durumu motor okuması bakımından çalışır; settings key yazımı bazı VS Code registry yaşam döngülerinde “not registered” reddi alabilir. Kod bunu sessiz başarı diye sunmaz, reload veya doğrudan settings.json yolunu bildirir.

Mission limitinde `0` vermek yalnız o run’ın bir eksenini kaldırır. `budgetsUnlimited` bütün filo günlük bütçe kapılarını askıya alır. Birini diğerinin yerine okumamak gerekir.

---

## 20. Failure Sınıfları ve Lead’in Kurtarma Kararı

“Step failed” tek başına karar verilebilir bir bilgi değildir. Motor failure’ı:

- kapalı bir class;
- neyin denendiği;
- raw detail;
- evidence refs;
- retry advice

olarak kaydeder.

### Dokuz Failure Class

| Class | Retry advice | Anlamı ve doğru hareket |
| :--- | :--- | :--- |
| `agent-missing` | `different` | Ajan filoda yok. Aynı ismi tekrar istemek aynı şekilde fail olur; pool’dan başka ajan seç. |
| `target-missing` | `different` | İstenen workflow/result/record yok. Mevcut listeyi yeniden oku veya işi delegation olarak yap. |
| `request-refused` | `fix-request` | Hiçbir şey başlamadan istek sözleşmesi reddedildi. Alan/ref/shape’i düzelt. |
| `record-lost` | readonly ise `same`; yazabilirse `inspect` | İş çalışmış olabilir ama Task/child/workflow kaydı bulunamıyor. Writer’ı körlemesine tekrar etme. |
| `interrupted` | readonly ise `same`; yazabilirse `inspect` | Reload sırasında in-flight kaldı; fate bilinmiyor. Side effect ihtimali varsa evidence’i incele. |
| `cancelled` | `stop` | Bir kişi durdurdu. Aynı işi kendiliğinden yeniden sipariş etme. |
| `engine-refused` | `different` | Process başlamadan engine/makine/refusal oldu; başka engine/ajan/profile dene. |
| `budget-stopped` | `stop` | Ceiling bitirdi; eldekiyle dürüstçe kapan. |
| `delegate-failed` | `different` | Delegate gerçekten koştu ve failed döndü; output’u okuyup prompt/agent/approach değiştir. |

### “Unknown Fate” Neden Özel?

Readonly iş:

- tekrar çalışsa side effect yaratmaz;
- yalnız ek maliyet harcar.

Writer, Workflow veya child mission:

- ilk koşum dosyayı değiştirmiş olabilir;
- commit atmış olabilir;
- dış etki üretmiş olabilir;
- ikinci kez koşmak duplicate veya overwrite yaratabilir.

Bu nedenle `record-lost/interrupted`:

```text
readonly → same güvenli olabilir
writer   → inspect; çözülemezse ask_user
```

olarak ayrılır.

### Failure Objective Verdict Değildir

Bir delegation fail olduğunda adaptive lead’in seçenekleri:

- transient görünüyorsa bir kez retry;
- daha iyi bağlam/başka agent ile revise/different delegation;
- approach yanlışsa replan;
- artık gerekli değilse gerekçeli skip;
- objective’in çözmediği ayrım varsa ask_user;
- bütçe/evidence sınırına gelindiyse partial.

Motor, “bir step failed → bütün mission failed” sonucunu otomatik üretmez.

---

## 21. Persistence: Snapshot, Trace, Ledger ve Reload

Adaptive run’ın dayanıklılığı tek dosyaya dayanmaz.

### 21.1 İki Kayıt

| Kayıt | İşlevi | Yazım şekli |
| :--- | :--- | :--- |
| `missions.json` | UI’nın hızlı açtığı güncel state snapshot’ı | Temp + rename ile atomic whole-file save |
| `mission-trace/<runId>.jsonl` | Karar/audit/observation geçmişi | Sequence-numbered append-only events |

Snapshot:

- spec’ler;
- run’lar;
- round’lar;
- current state;
- totals;
- compact ledger

taşır.

Trace:

- decision;
- strategy change;
- action create/start/settle;
- evaluation;
- conversation/message;
- council open/close;
- human ask/answer/guidance;
- run finish

olaylarını taşır.

Classic run trace oluşturmaz. `missions.trace`, Classic için boş array döndürmek yerine bunun Classic olduğunu ve trace bulunmadığını açıkça söyler.

### 21.2 Neden Append Önce, Snapshot Sonra?

```text
Önce trace append
Sonra snapshot save
```

Crash yalnız şu recoverable hali bırakabilir:

> Trace snapshot’tan ileride.

Tersi olsaydı snapshot gerçek bir action başlatıldığını iddia eder ama audit record’u hiç bulunmazdı.

### 21.3 Compact Ledger

Ledger her round’u tek satırda özetler:

- action türü;
- agent/step;
- status/cost;
- typed target’lar;
- conversation id ve message id;
- independent opening bilgisi;
- evaluate id;
- ask/answer;
- finish stopReason.

Planner resume bozulup yeni session’a rebrief gerektiğinde bütün raw transcript’i taşımak yerine bu compact history kullanılır.

### 21.4 Reload Reconciliation

VS Code açıldığında her trace’te:

1. schema ve seq bütünlüğü okunur;
2. snapshot’ın geride kaldığı event sayısı bulunur;
3. trace’te started ama settled görünmeyen action, gerçek sahibinin store’una sorulur:
   - task → TaskManager;
   - workflow → Workflow run state;
   - mission → child run;
   - conversation → onu üreten Task;
4. store done/failed/cancelled diyorsa sonuç, cost, tokens, output ve session recover edilir;
5. fate hâlâ bilinmiyorsa `interrupted` denir; sessiz retry yapılmaz;
6. guidance ve human answer iki aşamalı journal kaydından geri yüklenir;
7. booked olmayan settled round spend’i run totals’a bir kez eklenir.

### 21.5 Trace Health

| Health | Anlamı |
| :--- | :--- |
| `ok` | Okunabilir, sıralı, desteklenen journal |
| `missing` | Adaptive run’ın trace dosyası yok |
| `truncated` | Crash son event’in kuyruğunu kesmiş; güvenli prefix kullanılabilir |
| `damaged` | Gap/out-of-order/unreadable çizgi gibi hasar |
| `future` | Daha yeni Agent Farm schema’sı yazmış; eski build devam edemez |

Run audit trail yazılamasa bile objective doğrudan fail edilmez; run snapshot-only sürebilir. Ancak UI/Bridge journal degradation’ı görünür söylemelidir.

### 21.6 Retention

- Snapshot en fazla 40 run saklar.
- Run silinirse trace journal ve quarantine tail’i silinir.
- Snapshot retention’dan düşen run’ın orphan trace’i startup sweep’inde temizlenir.
- Task output archive ayrı Task retention sistemidir.
- Finished mission run silindiğinde archived Task output’ları kalır; run round/ledger kaydı gider.
- Bir spec’in son run’ı silinirse erişilemeyen spec de kaldırılır ve Bridge `specDeleted` ile bunu söyler.

---

## 22. Bugünkü Missions Arayüzünde Ne Nerede?

Bu bölüm **mevcut UI**’ı anlatır; U-99 hedefi bir sonraki bölümdedir.

### 22.1 Composer

Üst düzey:

- Classic Mission / Adaptive Objective segmented seçim;
- Title;
- Goal;
- Adaptive’de Constraints;
- Adaptive’de Success criteria;
- Adaptive’de Autonomy.

Advanced/common bölümde:

- Lead agent;
- Team/Pool satırları;
- Workdir;
- altı limit;
- Delegation engine;
- Planner model;
- Approval mode.

Worker satırlarında bugün:

```text
Agent checkbox → Role → Engine → Permissions → Effort → Model
```

sırası bulunur. Bu sıra bağımlılığı görünür anlatmaz; doğru hedef sıra:

```text
Agent / Role → Engine → Model → Effort → Permissions
```

### 22.2 Bugünkü Composer’ın Bilinen Çelişkileri

| Sorun | Neden kafa karıştırır? | Hedef kalem |
| :--- | :--- | :--- |
| Lead ve Planner model uzakta | Aynı orchestrator profilinin parçaları ayrı görünür | U-100 |
| Planner engine yalnız açıklama metninde | Planner’ın ayrı Claude session olduğu ilk bakışta görülmez | U-100 |
| Planner effort yok | Lead’in düşünme yoğunluğu mission override’ı yapılamaz | U-100 |
| Delegation engine sahipsiz ve yalnız engine fallback | Toplu atama gibi okunur ama member satırlarını değiştirmez | U-101 |
| Genel engine’in model/effort/permission eşleri yok | “Worker’lar hangi profile koşacak?” sorusu eksik kalır | U-101 |
| Boş pool whole fleet | Boş checkbox “kimse yok” da “herkes var” da gibi görünür | U-102 |
| Webview effective engine’i kendi kısa resolver’ıyla tahmin eder | Per-agent ve fleet defaults hesaba katılmayabilir | U-103 |
| Model datalist / yerleşim / reactivity sorunları | Engine’e uyumsuz veya açılır menüsü bozulan seçimler | U-97 |
| Start öncesi effective + origin yok | Kullanıcı hangi değerin kazanacağını görmeden başlatır | U-103 |

### 22.3 Run Detail Başlığı

Bugün:

- title;
- status;
- Pause/Resume/Cancel;
- lead adı;
- explicit planner model varsa badge;
- Classic team veya Adaptive “cast bound at runtime” notu;
- workdir;
- approval mode;
- planner transcript linki

gösterilir.

Planner transcript linki, lead’in briefing/decision konuşmasını Session Viewer’da açar.

### 22.4 Objective Bölümü

Adaptive run’da:

- objective;
- constraints;
- required/optional criteria;
- current verdict;
- evidence/gap

görünür.

### 22.5 Strategy ve Runtime Graph

Strategy bölümünde:

- current strategy;
- version;
- phase;
- geçmiş strategy revisions;
- change reason/source

okunur.

Runtime graph:

- decision ve primitive node’larını;
- actor/status;
- strategy version;
- parent;
- fan-in;
- outputs

gösterir. Önceden çizilmiş workflow değildir; yalnız gerçekten olan olayların graph’ıdır.

### 22.6 Live Activity

Run’ın o anda:

- planning;
- waiting;
- running task;
- held/deferred;
- approval/question

gibi durumu üst şeritte görünür. Ajan live hook bilgisi varsa step yanında kısa status chip’i bulunabilir.

### 22.7 Round Cards ve Step Rows

Her round:

- action;
- planner thought/rationale;
- phase/strategy badge;
- step listesi;
- tokens/cost;
- status

taşır.

Bugün step row’da açıkta:

- agent;
- title;
- readonly;
- status/failure chip;
- tokens;
- cost;
- `output` linki

vardır.

Satıra tıklanınca:

- full prompt;
- live/last output tail;
- full output file linki

açılır.

> ⚠️ **X-96 açığı:** Step row’da veya açılan step detail’de doğrudan session linki bugün yoktur. Eski yanıttaki “detayı açınca session’a ulaşılıyor” ifadesi doğru değildir. Session id host verisinde bulunabilir ama bu yüzeyde tek tık deep-link tamamlanmamıştır.

### 22.8 Cast

Adaptive run başlangıçta team değil pool aldığı için gerçek cast runtime’da oluşur.

Cast bölümü:

- ilk kez işe konan agent;
- bound role/brief;
- bound time;
- busy state;
- görünen engine/model/effort/permission;
- pool’da hâlâ kullanılmayan ajanlar

bilgisini gösterir.

Bir agent’ın role binding’i aynı run boyunca sabitlenir. Lead sonraki görevlerde brief’i geliştirebilir ama “bu run’da ilk ne zaman cast’e girdi?” kaybolmaz.

### 22.9 Conversations Room

Tek Missions detail içinde:

- conversation ve council’ler;
- chronological messages;
- from → to;
- intent;
- refs;
- open thread sayısı;
- unanswered-only filter;
- full message text;
- `session` ve `output` deep-linkleri;
- vote/tally/exit bilgisi

okunabilir.

Canlı repaint sırasında:

- conversation başına scroll state korunur;
- kullanıcı eski bir yeri okuyorsa yeni message onu aşağı zorlamaz;
- “new below” sayacı gösterilir;
- filter ve show-all state run/conversation scope’unda kalır.

Bu yüzey, ajanların ne dediğini görmek için ham transcriptten transcripte atlamayı normal kullanımda gereksiz kılar. Ham session linki, mikroskobik tool-call/CLI incelemesi içindir.

### 22.10 Evaluations

Evaluation bölümü:

- bütün evaluation geçmişini;
- hangilerinin stale olduğunu;
- evaluator;
- target refs;
- findings/evidence/gap;
- advice/confidence

gösterir.

Stale kayıt silinmez. “Bu run hiç değerlendirilmedi” ile “değerlendirildi ama sonra artefact değişti” ayrımı korunur.

### 22.11 Maliyet ve Token

Detail:

- cost bar;
- cost ceiling;
- tokens + token ceiling;
- rounds;
- tasks;
- minutes;
- agent bazında token share

gösterir.

Bir engine cost raporlamıyorsa `$0` tek başına okunmamalıdır; token satırı gerçek tüketim göstergesidir.

---

## 23. U-99 Sonrası Hedef Arayüz Mimarisi

Hedef form üç okunur bloktur:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 1. RESULT                                                          │
│ Goal · Constraints · Success Criteria · Autonomy                   │
├─────────────────────────────────────────────────────────────────────┤
│ 2. ORCHESTRATOR                                                    │
│ Lead identity · Planner engine (Claude, fixed)                     │
│ Planner model override · Planner effort override                   │
│ Automatic lead preview · resolved/origin mirror                    │
├─────────────────────────────────────────────────────────────────────┤
│ 3. WORKERS                                                         │
│ Whole fleet / Selected agents                                      │
│ Agent/Role → Engine → Model → Effort → Permissions                │
│ Effective value + origin · Apply profile to included workers       │
├─────────────────────────────────────────────────────────────────────┤
│ Workdir · Approval · Limits · Resolved launch preview · Start      │
└─────────────────────────────────────────────────────────────────────┘
```

### 23.1 Result

Burada yalnız objective semantiği bulunur:

- ne sonuç isteniyor;
- ne yapılmamalı;
- başarı hangi stable kriterlerle ölçülecek;
- yargısal belirsizlikte lead soracak mı karar verecek mi.

Engine/model gibi execution ayrıntıları bu bloğa karışmaz.

### 23.2 Orchestrator

Tek profil:

- **Lead identity**
- **Planner engine: Claude Code — fixed**
- **Model override**
- **Effort override**
- planner tool restrictions AFTip’i
- auto lead’in gerçek adı

Lead pool dışındaysa `planner only`; pool içindeyse aynı ajanın worker profile’ı ayrı etiketlenir.

### 23.3 Workers

Tek source of truth worker matrix’tir.

Her dahil satır:

- membership;
- role;
- requested engine/model/effort/permission;
- resolved/effective kısa değer;
- origin;
- compatibility state

taşır.

Toplu profil bir **edit action**’dır; runtime fallback değildir.

### 23.4 Explicit Pool Scope

| Scope | Davranış |
| :--- | :--- |
| Whole fleet | Filodaki bütün ajanlar dahil görünür; bulk/override bütün görünür kapsam üzerinde çalışabilir. |
| Selected agents | Yalnız işaretli ajanlar pool’dur; sıfır seçim Start öncesi hatadır. |

Mode switch Classic team state’i ile Adaptive pool state’ini belirsiz tek checkbox nesnesinde birbirine sızdırmaz.

### 23.5 Host-Side Preview

`previewMission(input)`:

- create ile aynı raw validation;
- aynı pool/lead normalization;
- aynı engine readiness;
- aynı `resolveDelegateRun`;
- aynı Claude carve-out

kullanır.

Her orchestrator/worker için:

```json
{
  "requested": {
    "engine": "",
    "model": "",
    "effort": "",
    "permissionMode": ""
  },
  "effective": {
    "engine": "gemini",
    "model": "gemini-2.5-pro",
    "effort": null,
    "permissionMode": "plan",
    "workdir": "D:/repo"
  },
  "origin": {
    "engine": "fleet",
    "model": "agent",
    "effort": "cli",
    "permissionMode": "member"
  }
}
```

gibi doğrulanabilir veri döndürür.

Webview kendi resolver kopyasını taşımaz. Draft değişikliklerini debounce ederek host preview ister. Model listesi effective engine’den, effort listesi effective engine + model’den gelir. Hazır olmayan engine ve uyumsuz effort bütün hatalarla Start öncesinde gösterilir.

Bridge eşleniği `missions.preview` olur.

### 23.6 Start Sonrası Provenance

U-104 hedefi üç katmanı ayırır:

| Katman | Soru |
| :--- | :--- |
| Requested | Kullanıcı/spec ne istedi? |
| Resolved | Host resolver hangi değer ve origin’i seçti? |
| Applied | CLI gerçekten hangi model/effort/permission’ı uyguladığını raporladı? |

Engine applied settings raporlamıyorsa UI tahmin etmez; `not reported` der.

Run detail:

- Orchestrator: lead + planner engine/model/effort + transcript;
- Workers: final routing profile;
- Step: effective dimensions + origin + requested/applied farkı;
- Task/message/council turn: session deep-link;
- Workflow: workflow detail;
- Child mission: child mission detail;
- Output: ayrı file linki

taşır.

### 23.7 U-99 Ailesinin İş Dağılımı

| Kalem | Sorumluluk |
| :--- | :--- |
| `U-99` | Bütün formu Result / Orchestrator / Workers zihinsel modeline taşır |
| `U-100` | Planner profilini, auto lead’i ve planner effort sözleşmesini kurar |
| `U-101` | Worker matrix SSOT ve görünür bulk profile action |
| `U-102` | Whole fleet / Selected agents ve lead-pool semantiği |
| `U-103` | Host preview + shared resolver + `missions.preview` |
| `U-104` | Run sonrası requested/resolved/applied provenance ve detail aynası |
| `U-97` | Dynamic select, narrowing, reactivity, order ve responsive layout |
| `X-96` | Her mission Task/message step’i için doğrudan session linki |
| `X-95` | Mission-origin sessions’ı genel Sessions tablosundan ayırma ve mission-filtered Sessions yüzeyi |

---

## 24. Sessions Sayfası ve Misyon Oturumu Kirliliği

Bir mission:

- bir planner session;
- her normal delegation için Task session;
- her speaking turn için Task session;
- resumed/handoff conversation lanes;
- child mission’ın kendi planner ve worker session’ları

oluşturabilir.

Bugün bu session’ların genel Sessions tablosundaki origin sınıflandırması yeterince kesin değildir; mission kullanımı arttıkça user/auto session takibini kirletebilir.

X-95 hedefi:

- session’a `mission origin` damgası;
- ait olduğu `missionId`;
- You/Auto’dan ayrı Mission ikonu;
- genel Sessions tablosunda default olarak mission session’larını gizleme;
- filter ile bütün mission’ları veya belirli mission’ları ekleme;
- Mission detail’den yalnız o mission’ın session’larıyla açılan Sessions-tasarımı görünümü

kurmaktır.

X-96 tek step’ten session’a gitmeyi, X-95 ise bir mission’ın bütün session evrenini yönetmeyi çözer. Biri diğerinin yerine geçmez.

---

## 25. Bridge Üzerinden Misyon Yönetimi

Missions sayfasında kullanıcıya açılan önemli işlevlerin Bridge karşılığı vardır. Aşağıdaki tablo **bugünkü op seti**dir; `missions.preview` U-103 ile gelecektir.

| Op | Ne okur / ne yapar? | Kritik ayrım |
| :--- | :--- | :--- |
| `missions.store` | `missions.json` health, quarantine, spec/run sayısı | Boş list ile okunamayan store’u ayırır |
| `missions.list` | Run’ları newest-first listeler | Delegation engine ile `plannerEngine: claude` ayrı alanlardır |
| `missions.start` | Classic veya Adaptive mission başlatır | Maliyet doğurur; raw input doğrulanır |
| `missions.status` | Bir run’ın round/step/budget/wait/evaluation/failure özeti | Status transcript değildir; konuşmaları özetler |
| `missions.conversation` | Bir veya bütün conversation’ların tam message record’u | `textSource`, refs, task/session/output taşır |
| `missions.council` | Council mandate, turn, open thread, vote, tally, exit | Tam konuşma için conversation op’una gidilir |
| `missions.pause` | Live run’ı current activity sonrası park eder | Task’ı anında ortadan kesmez |
| `missions.resume` | Paused run’ı live engine’de veya re-launch ile sürdürür | Rerun değildir |
| `missions.cancel` | Run + in-flight children/work’i iptal eder | Delete değildir |
| `missions.answer` | Pending mission sorusunu cevaplar veya skip eder | Yalnız gerçekten bekleyen soru varsa |
| `missions.approve` | Pending round planını approve/reject eder | Approval mode each-round |
| `missions.rerun` | Finished spec’ten yeni run başlatır | Yeni maliyet ve yeni run id |
| `missions.run.delete` | Finished run history’sini siler | Undo yok; son run ise spec de silinir |
| `missions.trace` | Adaptive append-only audit projection veya raw events | Current state için status, “nasıl geldi?” için trace |
| `missions.guide` | Next planner boundary’ye tek seferlik guidance kuyruğu | In-flight worker’a ulaşmaz |

### 25.1 Adaptive Start Payload Örneği

```json
{
  "mode": "adaptive",
  "title": "Resolved launch arayüzü",
  "goal": "Misyon oluşturucuda bütün koşum profillerini görünür ve çelişkisiz yap.",
  "successCriteria": [
    {
      "id": "c1",
      "text": "Composer tek host resolver sonucu gösteriyor.",
      "required": true
    },
    {
      "id": "c2",
      "text": "Classic ve legacy MissionSpec.engine davranışı korunuyor.",
      "required": true
    },
    {
      "id": "c3",
      "text": "Dark ve light render okunaklı.",
      "required": false
    }
  ],
  "constraints": [
    "Do not create a second webview-side precedence implementation.",
    "Do not remove MissionSpec.engine compatibility."
  ],
  "lead": "manager",
  "pool": [
    {
      "agent": "developer",
      "role": "implementation",
      "engine": "codex",
      "model": "gpt-5.6",
      "effort": "high",
      "permissionMode": "acceptEdits"
    },
    {
      "agent": "reviewer",
      "role": "independent verification",
      "engine": "claude",
      "permissionMode": "plan"
    }
  ],
  "autonomy": "ask-when-unsure",
  "plannerModel": "opus",
  "approvalMode": "each-round",
  "workdir": "D:/zone/dev/git/miropharm/vsc_AgentFarm",
  "maxRounds": 8,
  "maxTasks": 12,
  "maxCostUSD": 5,
  "maxTokens": 2000000,
  "maxMinutes": 120,
  "maxParallel": 2,
  "project": "PRS.MuratVural_DEV_VSC.AgentFarm"
}
```

Bugünkü sözleşmede `plannerEffort` bulunmadığı için bu örneğe konmamıştır.

### 25.2 Status ve Trace Birbirinin Yerine Geçmez

| Soru | Doğru op |
| :--- | :--- |
| “Şu anda ne yapıyor, neyi bekliyor, bütçe ne kaldı?” | `missions.status` |
| “Bu karara hangi sonuçlardan gelindi?” | `missions.trace` |
| “Ajanların tam olarak ne dediği neydi?” | `missions.conversation` |
| “Konseyde kim oy verdi, tie mı?” | `missions.council` |
| “Snapshot okunabildi mi?” | `missions.store` |

### 25.3 Current Bridge Sınırlılığı

Bugünkü `missions.list/status` bazı explicit spec alanlarını okuyabilir, step’te `ran` kısa provenance’ını verir; fakat U-104’ün hedeflediği requested/resolved/applied tam profil henüz yoktur. Bridge’den null görmek her zaman “CLI kesinlikle şu default’u kullandı” diye yorumlanmamalıdır.

---

## 26. Durum Makineleri

### 26.1 Mission Run Status

```text
running
  ├── waiting-approval
  ├── waiting-user
  ├── paused
  ├── done
  ├── failed
  └── cancelled
```

| Status | Anlamı |
| :--- | :--- |
| `running` | Planner veya work lifecycle aktif |
| `waiting-approval` | Round planı insan kapısında |
| `waiting-user` | `ask_user` cevabı bekliyor |
| `paused` | Kullanıcı pause veya reload sonrası park |
| `done` | Engine bir result verdict ile normal kapandı |
| `failed` | Planner/engine/protocol hatası veya lead’in `abort` ile kapatması |
| `cancelled` | Kullanıcı tarafından durduruldu |

### 26.2 Step Status

```text
queued → running → done
                 ├→ failed
                 └→ cancelled
```

`queued` bir bütçe veya readiness gate’inde tutuluyorsa step `held` reason taşıyabilir. UI’nın yalnız “running” göstermesi doğru olmaz; process hiç başlamamış olabilir.

### 26.3 Message State

```text
pending → delivered
        ├→ failed
        └→ cancelled
```

Yalnız `delivered` bir message “söylenmiş” kabul edilir. Failed speaking Task:

- order olarak görünür;
- neden hiçbir message üretmediğini gösterir;
- transcript’e hayali cümle eklemez.

---

## 27. Uçtan Uca Örnek 1 — Küçük ve Net Objective

### İstek

> “Tek bir README linkini düzelt; link açılmalı ve test geçmeli.”

Kriterler:

- `c1`: link doğru target’a gidiyor;
- `c2`: docs link test’i geçiyor.

### İdeal Akış

```text
R1 delegate
  developer: linki düzelt + testi çalıştır
        │
        ▼
R2 evaluate (lead self-evaluation)
  c1 pass · c2 pass
        │
        ▼
R3 finish success [criteria-satisfied]
```

Adaptive olmak her zaman konsey, beş ajan veya sekiz round demek değildir. Briefing lead’e “küçük hedef küçük planı hak eder” der.

---

## 28. Uçtan Uca Örnek 2 — Araştır, Karşılaştır, Uygula, Denetle

### Objective

> “Mevcut mission UI precedence çelişkisini geriye uyumlu biçimde çöz.”

### Akış

```text
Strategy v1: Önce gerçek resolver ile UI varsayımının farkını ölç.

R1 parallel
  a1-1 developer (readonly): core precedence incele
  a1-2 ux reviewer (readonly): formdaki kullanıcı modelini incele
        │
        ▼
R2 compare
  a2-1 architect: a1-1 ile a1-2 arasındaki çatışmayı kıyasla
        │
        ▼
Strategy v2: Gizli fallback’i UI kopyasıyla açıklamak yerine host preview kur.

R3 replan
        │
        ▼
R4 delegate
  a4-1 developer (writer): shared preview uygula
  a4-2 tester (readonly): fixture ve parity planı hazırla
        │
        ▼
R5 review
  a5-1 reviewer: a4-1/a4-2’yi kriterlere göre eleştir
        │
        ▼
R6 revise
  a6-1 developer: a5-1’deki permission-origin açığını kapat
        │
        ▼
R7 evaluate
  independent reviewer: a6-1 + tests + renders
        │
        ▼
R8 finish success
```

Burada:

- parallel yalnız bağımsız okumalar için;
- compare merge değil seçim evidence’ı;
- replan yaklaşım değişikliğini görünür yapıyor;
- revise aynı artefact’ın açığını kapatıyor;
- son success yalnız current pass’lerle açılıyor.

---

## 29. Uçtan Uca Örnek 3 — Gerçek Tartışma ve Council

### Soru

> “Yeni composer’da bulk profile persistent fallback mi, yoksa satır edit action’ı mı olmalı?”

### Akış

```text
R1 council aç
  question: bulk profile’ın kullanıcı modeli ne olmalı?
  members: architect, ux, developer
  chair: ux
  options: persistent fallback | visible row mutation
  from: [architect, ux, developer]

  m1 architect proposal
  m2 ux proposal
  m3 developer evidence
        │
        ▼
R2 message
  ux chair challenge m1
        │
        ▼
R3 message
  architect response refs [chair latest, m2]
        │
        ▼
R4 message
  developer evidence refs [...]
        │
        ▼
R5 message vote
  her member gerçek turn ile option söyler
        │
        ▼
R6 message synthesis + close "decision clear"
        │
        ▼
R7 delegate
  seçilen kararın prototipi
        │
        ▼
R8 evaluate
  objective criteria
```

Council sonucu:

- bir design decision için evidence;
- objective success verdict’i değil.

UI’da conversation room tam mesajları, refs, unanswered thread’leri ve session linklerini gösterir.

---

## 30. Uçtan Uca Örnek 4 — Child Mission

### Parent Objective

> “Yeni mission composer’ı kodla, doğrula ve dokümante et.”

Parent lead, dokümantasyonun kendi planlama ihtiyacı olduğunu düşünür:

```text
R4 run_mission
  child goal:
    "Mevcut ve hedef composer davranışını kaynak doğrulamalı rehbere dönüştür."
  child criteria:
    - current vs target ayrımı
    - all bridge ops
    - source links
```

Child:

- parent pool/workdir/project/constraints’ı alır;
- kalan budget’ın bölünmüş tavanlarıyla çalışır;
- kendi planner session ve round’larını açar;
- parent’a yalnız verdict + summary + unmet listesi döndürür.

Parent child’in iç round’larını kendi output file’ı gibi okumaz. Ayrıntı için child mission detail/trace’e gider; parent kararında child result ref’i kullanır.

---

## 31. Uçtan Uca Örnek 5 — Reload ve Bilinmeyen Writer

### Olay

1. R3’te developer writer Task başlar.
2. Trace `action.started` yazılmıştır.
3. VS Code penceresi kapanır.
4. Task store’da Task kaydı bulunamaz.

### Reconciliation

```text
trace: started, settled yok
task store: record yok
step: interrupted / record-lost
couldHaveWritten: true
retry advice: inspect
resume: bilinmeyen fate varsa refuse
```

Doğru davranış:

- dosya/commit/output evidence’i incelenir;
- neyin landing yaptığı belirlenir;
- çözülemiyorsa kullanıcıya sorulur.

Yanlış davranış:

- “Task görünmüyor, demek ki çalışmadı” diyerek aynı writer’ı otomatik yeniden koşmak.

---

## 32. Hızlı Karar Matrisleri

### 32.1 Hangi Primitive?

| İhtiyaç | Primitive |
| :--- | :--- |
| Yeni bağımsız iş üret | `delegate` |
| Birbirinden bağımsız işleri birlikte başlat | `parallel` |
| Gerçek sonucu eleştir | `review` |
| İki gerçek sonucu tart | `compare` |
| Aynı artefact’taki adı konmuş açığı kapat | `revise` |
| Kriter hükmü ver | `evaluate` |
| Var olan sabit zinciri çağır | `run_workflow` |
| Kendi planner’ı gereken alt hedef aç | `run_mission` |
| Ajanı gerçek message turn’üyle konuştur | `message` |
| Chair/cap/exit olan dar tartışma aç | `council` |
| Yaklaşımı değiştir | `replan` |
| Kullanıcıdan bilgi/karar iste | `ask_user` |
| Objective’i verdict ile kapat | `finish` |
| Objective ulaşılamaz; dur | `abort` |

### 32.2 Review, Evaluate, Council

| Soru | Doğru araç |
| :--- | :--- |
| “Bu kodun kusurları ne?” | `review` |
| “A mı B mi bu amaç için daha güçlü?” | `compare` |
| “c1 gerçekten sağlandı mı?” | `evaluate` |
| “Uzmanlar bu design sorusunu tartışsın.” | `council` |
| “Çoğunluk c1 geçti dedi; başarı mı?” | Hayır; ayrıca `evaluate` gerekir |

### 32.3 Resume, Rerun, Revise, Replan

| Kavram | Ne devam eder/değişir? |
| :--- | :--- |
| `resume` mission | Aynı run ve mevcut history |
| `rerun` mission | Aynı spec’ten yeni run |
| `revise` | Aynı approach + artefact, gap kapanır |
| `replan` | Approach değişir, strategy version kesilir |
| conversation `resumed` | Aynı speaker session lane |
| conversation `handoff` | Yeni session, geçmiş metinle aktarılır |

---

## 33. Sık Sorulan Sorular

### “Lider zaten ajan; planner model neden ayrıca var?”

Lead, kimliği ve talimatları seçer. Planner model, bu mission’ın karar çağrıları için geçici model override’ıdır. Ajanın kalıcı Claude ayarını değiştirmeden bu run’a özel model seçer. Boşsa Claude CLI lead klasöründeki ayar/default ile karar verir.

### “Delegation engine’in direksiyonunda kim var?”

Kimse yok; ajan değildir. Lead hangi agent’ın ne yapacağına karar verir. Engine alanı yalnız worker Task process’inin CLI’ını belirler.

### “Planner terminal açıyor mu?”

Kullanıcıya görünen integrated terminal açmaz; fakat gerçek bir headless child process ve gerçek Claude session açar. Session id ile turlar arasında sürer ve transcript’i Session Viewer’dan açılabilir.

### “Lead worker’ların yaptığı işi nasıl görüyor?”

Agent Farm TaskManager:

1. worker output archive’ını engine-aware biçimde okur;
2. status/cost/tokens/session id’yi step’e bağlar;
3. bounded result excerpt ve gerçek id’leri sonraki planner prompt’una koyar.

Worker lead’in planner session’ına yazmaz.

### “Her Task yeni session mı?”

Normal delegation çoğunlukla yeni headless Task session’dır. Aynı conversation participant’ının sonraki speaking turn’ünde engine destekliyorsa önceki lane resume edilir; desteklemiyorsa yeni session + handoff olur.

### “Boş worker model ne demek?”

“Normal” diye sabit bir değer demek değildir. Resolver agent/fleet/CLI katmanlarına düşer. Bugünkü UI sonucu tam göstermez; U-103 preview bunu origin ile gösterecek.

### “Delegation engine’i Gemini seçtim, satırda Codex duruyor; hangisi?”

Bugünkü resolver’da explicit member Codex kazanır. Mission-level Gemini yalnız engine’i boş satırlara fallback olur.

### “Planner model worker modelini ezer mi?”

Hayır. Planner model yalnız lead’in Claude decision calls’ına gider. Worker model ayrı member/default resolver’ından gelir.

### “Planner effort nerede?”

Bugünkü kodda mission-level planner effort alanı yoktur. U-100 bunu eklemek için açık backlog’dur.

### “Pool boşsa kim çalışabilir?”

Bugünkü Adaptive davranışında whole fleet. Bu gizli semantik U-102 ile açık Whole fleet/Selected agents seçimine dönüşecektir.

### “Lead pool dışında olabilir mi?”

Evet. Lead planner-only olabilir. Pool yalnız worker olarak işe çağrılabilecek adayları sınırlar.

### “Parallel seçince gerçekten aynı anda mı?”

Yalnız maxParallel, readiness ve one-writer kuralı izin verirse. İki writer aynı workdir’de serialize edilir.

### “Review pass verirse mission bitebilir mi?”

Hayır. Review evidence üretir. Criterion pass’i `evaluate` kaydıdır.

### “Council çoğunlukla bir seçenek seçti; kriter geçti mi?”

Hayır. Vote katılımcı pozisyonudur; criterion verdict değildir.

### “Guide next decision çalışan kod görevini anında değiştirir mi?”

Hayır. In-flight Task prompt’u sabittir. Guidance bir sonraki planner boundary’ye bir kez gider.

### “Pause çalışan Task’ı keser mi?”

Hayır. Current activity biter, sonraki planner round’dan önce park eder. Anında durdurmak gerekiyorsa Cancel farklı eylemdir.

### “Cost $0 ise mission bedava mıydı?”

Engine cost raporlamıyorsa bilinemez; tokens’a bakılır. Fiyat raporlayan engine’de gerçek sıfır olabilir.

### “Misyon success dedi; buna güvenebilir miyim?”

Adaptive success, bütün required criteria için current pass olmadan kabul edilmez. Ancak evaluation’ın kalitesi yine baktığı evidence’ın kalitesine bağlıdır; target ve stale kayıtlarını okuyabilirsiniz.

### “Ham oturumlara tek tek girmem gerekiyor mu?”

Normal izleme için hayır:

- round/graph/evaluation/cast/conversation Missions detail’de birleşir;
- planner transcript linki vardır;
- message session/output linkleri vardır.

Mikroskobik CLI/tool-call incelemesi için Session Viewer’a inilir. Normal Task step’inin session deep-link’i X-96 tamamlanana kadar eksiktir.

---

## 34. Terimler Sözlüğü

| Terim | Kısa tanım |
| :--- | :--- |
| Objective | Adaptif run’ın ulaşacağı sonuç |
| Criterion | Sonucun nasıl hükme bağlanacağını söyleyen stable id’li ölçü |
| Constraint | Run’ın yapmaması gereken korkuluk |
| Lead | Planner kimliğini veren gerçek ajan |
| Planner | Headless Claude decision conversation |
| Pool | Lead’in runtime’da worker seçebileceği adaylar |
| Cast | Gerçekte işe konmuş ve role-bound worker’lar |
| Delegate | Bir work step’ini yapan gerçek ajan |
| Primitive | Planner’ın kapalı eylem kataloğundaki komut türü |
| Round | Bir planner kararı ve onun lifecycle birimi |
| Wave | Aynı anda başlatılabilecek güvenli step grubu |
| One-writer rule | Aynı workdir’de wave başına en fazla bir writer |
| Strategy version | Yaklaşım gerçekten değiştiğinde kesilen sürüm |
| Phase | Lead’in serbest, gözlemsel current-stage etiketi |
| basedOn | Kararın dayandığı gerçek node/result id’leri |
| Evaluation | Kriterlere bağlı evidence/verdict kaydı |
| Stale | Sonraki work yüzünden artık güncel artefact’a konuşmayan evaluation |
| Success gate | Required current pass’ler olmadan success’i reddeden kapı |
| Conversation | Gerçek speaking Task’larının message record’u |
| Open thread | Henüz settle edilmemiş question/challenge |
| Council | Chair, cap ve exit’i olan conversation mandate’ı |
| Lane | Aynı participant’ın conversation session sürekliliği |
| Handoff | Resume olmayan yeni session’a transcript aktarımı |
| Snapshot | Motorun hızlı current-state dosyası |
| Trace | Adaptive append-only audit journal |
| Ledger | Planner rebrief için compact round history |
| Origin | Bir koşum değerini hangi katmanın seçtiği |
| Requested / Resolved / Applied | İstenen / hostun seçtiği / CLI’ın gerçekten bildirdiği değer |

---

## 35. Teknik Kaynak Haritası

| Konu | Ana kaynak |
| :--- | :--- |
| Shared lifecycle, parser, rounds, waves, budgets | `src/core/missions.ts` |
| Classic/Adaptive mode, criteria/pool normalization, delegate resolver | `src/core/missionMode.ts` |
| 14 primitive registry ve typed prompt builder | `src/core/missionPrimitives.ts` |
| Verdict, advice, staleness, success gate, stop reasons | `src/core/missionEvaluation.ts` |
| Message intents, refs, open threads, lanes | `src/core/missionConversation.ts` |
| Council chair/cap/exits/vote/tally | `src/core/missionCouncil.ts` |
| Failure classes ve retry advice | `src/core/missionFailure.ts` |
| Append-only journal, graph projection, reload reconciliation | `src/core/missionTrace.ts` |
| Planner Claude process, Task/Workflow/child wiring, Bridge ops | `src/extension.ts` |
| Composer ve Missions detail surfaces | `media/missions.js` |
| Sidebar mission tree | `src/views/missionsTree.ts` |
| Adaptive engine tests | `test/test_mission_adaptive.js` |
| Primitive tests | `test/test_mission_primitives.js` |
| Evaluation tests | `test/test_mission_evaluation.js` |
| Conversation tests | `test/test_mission_conversation.js` |
| Council tests | `test/test_mission_council.js` |
| Limits ve in-flight guard tests | `test/test_mission_limits.js` · `test/test_mission_guard.js` |
| Trace ve graph tests | `test/test_mission_trace.js` · `test/test_mission_graph.js` |
| UI/browser fixture tests | `test/test_missions_webview.js` |

---

## 36. Sistemin Değişmez Doğruluk Kontrol Listesi

Bir değişiklikten sonra aşağıdaki cümlelerin hepsi doğru kalmalıdır:

1. Lead bir agent identity’dir; planner engine veya model değildir.
2. Planner gerçek headless Claude session açar; üçüncü bir ajan değildir.
3. Worker işi sıradan Task yolundan geçer; mission ikinci Task engine’i kurmaz.
4. Classic ve Adaptive aynı lifecycle’ı paylaşır.
5. Adaptive success yalnız current required pass’lerle açılır.
6. Delegate done, criterion pass sayılmaz.
7. `review/compare/revise` gerçek settled target’lara bağlıdır.
8. `parallel`, one-writer kuralını aşamaz.
9. Conversation message yalnız gerçek speaking Task döndüyse vardır.
10. Synthesis/vote gerçek refs olmadan kabul edilmez.
11. Council objective’i değil kendi sorusunu tartışır.
12. Vote criterion verdict değildir.
13. Unknown fate’e sahip writer körlemesine retry edilmez.
14. Guidance in-flight worker’a değil next planner boundary’ye gider.
15. Kullanıcı bekleme süresi mission execution time’ına yazılmaz.
16. Exact 0 dışında hiçbir malformed limit ceiling kaldırmaz.
17. Fiyat raporlamayan engine’de $0 “bedava” diye okunmaz.
18. Trace append snapshot save’den önce gelir.
19. Reload finished işi kaybetmez, unknown işi olmuş/olmamış diye uydurmaz.
20. UI’da görünen effective değer host resolver ile aynı olmalıdır.
21. Bulk worker profile ikinci precedence yaratmamalı, görünür satırları değiştirmelidir.
22. Requested, resolved ve applied değerler birbirine karıştırılmamalıdır.
23. Session ve output iki ayrı deep-link’tir.
24. Mission-origin session normal user session gibi etiketlenmemelidir.
25. UI, Bridge ve persisted spec aynı koşum gerçeğini anlatmalıdır.

---

## 37. Sonuç: Bu Sistem Ne Tür Bir Makinedir?

Agent Farm Adaptive Mission sistemi:

- önceden çizilmiş bir adım zinciri değil;
- modelin serbestçe her şeyi yaptığı kontrolsüz bir otonomi değil;
- birkaç bağımsız agent cevabını “tartışma” diye süsleyen bir simülasyon değil;
- Task sonuçlarını success sanan bir batch runner değil;

şu dört katmanın birlikte çalıştığı bir **kanıta bağlı hedef motorudur**:

```text
OUTCOME CONTRACT
goal + criteria + constraints
          │
          ▼
ADAPTIVE DECISION LOOP
strategy + round + primitive
          │
          ▼
REAL EXECUTION RECORDS
tasks + workflows + child missions + speaking turns
          │
          ▼
EVIDENCE-BOUND VERDICT
evaluation + staleness + success gate + trace
```

Motorun güçlü tarafı yalnız “ajanlara iş dağıtması” değildir. Esas değer:

- hangi kararın neden verildiğini;
- hangi gerçek sonuca dayandığını;
- hangi agent/session/engine/profile ile çalıştığını;
- kim kime gerçekten ne söylediğini;
- hangi kriterin hangi kanıtla geçtiğini;
- eski hükmün neden stale olduğunu;
- hangi limit veya insan kararının akışı değiştirdiğini;
- crash sonrasında neyin bilindiğini ve neyin bilinmediğini

tek run kimliği altında açıklayabilmesidir.

U-99 ailesinin görevi motoru yeniden icat etmek değil, bu zaten zengin olan gerçeği formdan run detayına kadar **tek, görünür ve çelişkisiz bir kullanıcı modeline** dönüştürmektir.
