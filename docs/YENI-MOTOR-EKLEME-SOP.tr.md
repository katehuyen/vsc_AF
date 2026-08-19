# Yeni motor ekleme SOP’si — uçtan uca, eksiksiz entegrasyon

Bu belge, Agent Farm’a yeni bir **birinci sınıf motor** eklemek için bağlayıcı
uygulama prosedürüdür. Buradaki “motor”, yalnızca bir model adı veya çalıştırılacak
bir CLI değildir. Motor; kurulum ve giriş durumu, komut satırı sözlüğü, süreç yaşam
döngüsü, konuşma kimliği, protokol, transcript, token/ücret semantiği, modeller,
izinler, resume davranışı, bütün çalıştırma kapıları, bütün okuma yüzeyleri ve Bridge
sözleşmesinin birlikte oluşturduğu bir ürün eksenidir.

Tasarımın mevcut durumunu ve bugünkü dört motorun ölçülmüş farklarını
[`MOTORLAR-TASARIM.tr.md`](MOTORLAR-TASARIM.tr.md) anlatır. Bu belge ise yeni bir
motor istenince **hangi sırayla ne yapılacağını, hangi kanıt olmadan ilerlenmeyeceğini
ve işin ne zaman gerçekten bitmiş sayılacağını** anlatır.

> **Sıfırıncı kural:** Bir motor `EngineId` listesine, model kutusuna veya bir
> seçiciye girdiğinde eklenmiş olmaz. Aşağıdaki kabul kapılarının tamamından
> geçmedikçe yalnızca “adı eklenmiş” olur.

---

## Bitmiş sayılmanın kısa tanımı

Yeni motor ancak aşağıdakilerin **hepsi** doğruysa tamamlanmıştır:

- Motorun kimliği doğru adlandırılmıştır: model sağlayıcısı, uygulama ve CLI
  birbirine karıştırılmamıştır.
- Kurulu olma, giriş yapılmış olma ve gerçek bir tur çalıştırabilme üç ayrı durum
  olarak ölçülmüş ve gösterilmiştir.
- CLI’ın interaktif, headless ve Agent Farm Console yolları tahmin edilmeden,
  kullanılan sürüm üzerinde ölçülmüştür.
- Yeni motor hiçbir koşulda başka bir motorun adapter’ına veya argümanlarına
  sessizce düşmez; eksik yönlendirme derleme hatası veya açık ret üretir.
- Gerçek iki turlu Console testi aynı konuşma kimliğiyle bağlamın taşındığını
  kanıtlar.
- Motor, ajanın kimlik/talimat dosyalarını ve ortak anayasayı gerçekten yükler;
  memory, duty, skill ve MCP yolları ölçülmüş bir uyumluluk sözleşmesine sahiptir.
- Terminal, Console, görev, zamanlama, tetikleyici, şablon, workflow, mission ve
  Bridge yolları motorun bütün çalışma boyutlarını kaybetmeden taşır.
- Sessions, Turns, Session Viewer, Search, Timeline/Live, proje ve ajan yüzeyleri
  motoru ya doğru verilerle gösterir ya da verinin neden hesaplanamadığını açıkça
  söyler.
- Oturum kimliği transcript dosya adından varsayılmaz; motorun gerçek kimlik
  kaynağından okunur ve resume aynı konuşmayı açar.
- Token, cache, reasoning, context ve ücret rakamlarının her biri motorun kendi
  semantiğine göre hesaplanır. Bilinmeyen değer `0` veya `$0.00` yapılmaz.
- Hazır olmayan ya da desteklenmeyen bir yetenek gizli varsayıma dönüşmez:
  görünür açıklama, devre dışı kontrol veya açık ret vardır.
- Host ve bütün webview’lar aynı motor adı, rozeti ve renk sözlüğünü kullanır;
  bilinmeyen dış motorlar da nötr rozetle görünür.
- UI değişiklikleri gerçek fixture ile koyu/açık ve dar/geniş ölçülerde çizilip
  gözle incelenmiştir.
- Testler yalnız kaynakta kelime aramaz; gerçek fonksiyonları ve Bridge registry’yi
  çalıştırır. Tam paket yeşildir.
- CHANGELOG, motor tasarım belgesi, kullanıcıya dönük gerekli metinler, sürüm,
  VSIX paketi, kurulum doğrulaması ve proje Worklog kaydı tamamdır.

Bu maddelerden biri “sonra” ise motor da “sonra”dır.

---

## Prosedürün giriş ve çıkışları

### Giriş

Yeni motor isteği geldiğinde önce şu beş bilgi gerekir:

1. Motorun ürün adı ve kalıcı küçük harf kimliği: örneğin `nova`.
2. Çalıştırılacak gerçek executable/CLI ve ölçülecek kesin sürüm.
3. Desteklenmesi beklenen yollar: terminal, headless, Console, transcript,
   resume, model kataloğu, kullanım/kota.
4. Bu makinede gerçek tur çalıştırmaya yeten hesap/giriş ve gerekiyorsa kullanıcının
   maliyet onayı.
5. Bu entegrasyonun bir **birinci sınıf motor** mu, yalnızca özel bir **CLI profili**
   mi olduğuna dair karar.

Yalnız “şu komutu şu prompt’la çalıştır” isteniyorsa ve Agent Farm’ın protokol,
oturum, kullanım, model, resume ve durum bilgisini anlaması beklenmiyorsa doğru
mekanizma özel CLI profilidir. Birinci sınıf motor, aşağıdaki SOP’nin tamamını
gerektirir. CLI profili ile başlayıp onu arayüzde motor gibi göstermek, en pahalı
yarım entegrasyon biçimidir.

### Aktörler ve sorumluluklar

| Aktör | Sorumluluk |
|---|---|
| Developer ajanı | Ölçüm planı, kök neden okuması, küçük uyumlu uygulama, otomatik/gerçek testler, görsel doğrulama, belgeler, paket, kurulum ve tek tutarlı commit |
| Kullanıcı | Davranışı veya mimariyi değiştiren belirsiz kararlarda seçim; gerçek hesabı etkileyen pahalı/tehlikeli denemelere izin |
| Motorun CLI’ı | Komut sözlüğü, olay akışı, kimlik, süreç, transcript ve kullanım semantiğinin birincil kanıtı |
| Resmî belge / kurulu kaynak | CLI’ın yardımında görünmeyen davranışın ikinci kanıtı; sürümle birlikte kaydedilir |
| Test paketi | Eski motorların gerilemediği ve yeni motorun yanlış adapter’a düşmediği makine kanıtı |

### Çıkış

Tek işin çıktısı şunlardır:

- ölçülmüş motor adapter’ı ve protokol çeviricisi;
- durum, model, kullanım ve transcript kaynakları;
- bütün yazma ve okuma yüzeylerinde motor ekseni;
- Bridge paritesi;
- otomatik testler ve ayrı tutulan gerçek motor smoke testi;
- güncel teknik/kullanıcı belgeleri ve CHANGELOG;
- paketlenmiş, kurulmuş, kurulu sürümü doğrulanmış VSIX;
- Worklog kaydı ve tek commit.

---

## Değişmez karar ilkeleri

### Motor, sağlayıcı veya model ailesi değildir

Motor kimliği executable + protokol + süreç yaşam döngüsü + konuşma deposu ile
tanımlanır. Aynı sağlayıcının iki ayrı CLI’ı iki ayrı motordur; bir CLI’ın birden
fazla sağlayıcının modellerini sunması onu o sağlayıcılardan biri yapmaz. `gemini`
ile `agy` ayrımı bunun canlı örneğidir.

Motor kimliği için:

- depoda saklanan id kısa, küçük harf ve kalıcıdır;
- kullanıcıya gösterilen etiket ürünün gerçek adıdır;
- executable ayrıca kaydedilir;
- model ailesi ve konuşmacı adı bundan ayrı çözümlenir;
- eski kayıtlarda boş `source`/`engine` değerinin Claude anlamına geldiği geriye
  uyumluluk bozulmaz.

### Benzer motor, ortak adapter demek değildir

İki motor “tur başına süreç”, “JSONL” veya “aynı sağlayıcı” olabilir ve yine de
şu alanların hiçbirini paylaşmayabilir: prompt kanalı, resume bayrağı, kullanım
toplamı, cache sayımı, izin modu, sonuç olayı, kapanış anı veya transcript kimliği.

Paylaşım yalnız ölçümden sonra, gerçekten ortak olan **kanonik davranışta** yapılır.
Bir motor için yazılan argüman veya parser, `else` dalıyla yeni motora verilmez.

### Eksik veri sıfır değildir

- “CLI fiyat yazmıyor” = `$0.00` değildir.
- “Transcript okunamıyor” = oturum yok değildir.
- “Token bulunamadı” = `tokens: 0` değildir.
- “Motor bu analitiğe giremiyor” = filoda yok değildir.
- “Resume yolu ölçülmedi” = yeni konuşma başlatılabilir değildir.

Doğru karşılık `null`, `unknown`, `not-published`, kapsam açıklaması veya açık
rettir. Bir sayının gösterilmesi, o sayının gerçekten hesaplandığı iddiasıdır.

### Kayıt sorusu ile ölçüm sorusu ayrıdır

`SessionIndex` içinde iki bilinçli havuz vardır:

- **Kayıt/log havuzu:** “hangi oturumlar var, hangisi en yeni, kime/projeye ait,
  hangisi canlı?” gibi sorular. Burada `allWithExternal()`,
  `forAgentWithExternal()`, `byId()` ve `byFile()` kullanılır.
- **Ölçüm havuzu:** Claude transcriptine özgü cost, cache, health, recall veya
  benzeri gerçekten yalnız o formatta hesaplanabilen sorular. Burada `all()` /
  `forAgent()` kalabilir; fakat dışlanan motorlar `claudeOnlyScopeNote()` ile
  kullanıcıya söylenir.

Yeni motor eklenirken her tüketiciye “bu kayıt mı, ölçüm mü?” sorusu tek tek
sorulur. Geniş havuzu her yere vermek analitiği bozar; dar havuzu her yere vermek
oturumları görünmez yapar.

### Örnekler kapsam değildir

Aşağıdaki yüzey ve dosya listeleri mevcut ürünün asgari haritasıdır. Gelecekte
eklenen yeni bir giriş noktası listede yazmıyor diye kapsam dışı kalmaz. İşin
başında ve sonunda kod tabanı çağrı zinciri ve aramalarla yeniden taranır.

---

## Kabul kapıları

İş bu sırayla ilerler. Bir kapı kapanmadan sonraki kapının kodu yazılmaz.

| Kapı | Kanıt | Kapı kapanmadan yapılmayacak şey |
|---|---|---|
| Kimlik ve kapsam | Motor/CLI ayrımı, kesin sürüm, birinci sınıf motor kararı, etkilenen yüzey envanteri | Enum, seçici veya ürün metni eklemek |
| Ham ölçüm | Yardım, gerçek headless tur, gerçek interaktif davranış, ham olay ve süreç ölçümleri | Adapter yazmak |
| Taşıma sözleşmesi | Komut, prompt, cwd, izin, model, effort, resume ve süreç matrisi | ConsoleHost’a bağlamak |
| Protokol sözleşmesi | Olay → kanonik olay tablosu, token/kimlik/sonuç semantiği | UI’da konuşma göstermek |
| Ajan çalışma alanı | Talimat keşfi, parent walk, anayasa, memory/duty/skill ve MCP yolları | Motoru ajan seçicilerinde birinci sınıf göstermek |
| İki turlu Console | Aynı id, bağlam taşınması, doğru süreç kapanışı ve kullanım farkı | “Console destekliyor” demek |
| Giriş noktası paritesi | Bütün çalışma kapılarında boyut round-trip’i | Varsayılan motor seçeneğini sevk etmek |
| Kayıt ve okuma paritesi | Oturum indexi, kimlik, viewer, resume, arama, proje/ajan listeleri | “Eklentinin her yerinde” demek |
| Muhasebe ve kapsam | Token/cost/kota semantiği, null/scope davranışı | Dolar veya filo toplamı göstermek |
| UI ve Bridge | Gerçek render, registry dispatch, `farm.ops` görünürlüğü | Paketlemek |
| Sürüm teslimi | Tam test, VSIX, zorla kurulum, `extensions.json`, belge/Worklog/commit | Tamamlandı demek |

---

## Hazırlık: taban çizgisi ve entegrasyon dosyası

Koddan önce küçük bir “entegrasyon dosyası” oluşturulur. Bunun için ayrı kalıcı
bir çalışma belgesi şart değildir; backlog kaleminin gövdesi veya görev notu şu
başlıkları taşımalıdır:

- motor id / etiket / executable / CLI sürümü;
- kurulum ve giriş yolları;
- ölçülecek yetenek matrisi;
- bilinen belirsizlikler ve kullanıcı kararları;
- gerçek deneme komutları ve sterilize edilmiş sonuç özetleri;
- eski motorlar için gerileme taban çizgisi;
- hedef testler ve manuel kabul adımları.

Başlamadan önce:

1. `git status --short` ile çalışma ağacını oku; kullanıcı değişikliklerini
   sahiplenme veya düzeltme.
2. `package.json` sürümünü, son commit’i ve mevcut tam test sonucunu kaydet.
3. `docs/MOTORLAR-TASARIM.tr.md`, `docs/CONVENTIONS.md`, bu SOP ve motorla
   ilişkili mevcut adapter/testleri oku.
4. Yeni motor id’sini depoda ara; eski deney, özel CLI profili veya aynı adlı
   model sağlayıcısı olup olmadığını ayır.
5. Aşağıdaki keşif taramasını çalıştır ve bulunan her motor-duyarlı yeri
   “yazma”, “okuma”, “ölçüm”, “metin/ayar” veya “test” olarak sınıflandır.

PowerShell için başlangıç taraması:

```powershell
$AfEngineId = 'yeni-motor-id'
git status --short
rg -n "EngineId|EngineTransport|EngineStatus|Record<EngineId|Partial<Record<EngineId" src media test package.json
rg -n "claude|codex|gemini|agy|engine|source" src media test package.json README.md docs
rg -n "=== 'claude'|!== 'claude'|=== 'codex'|!== 'codex'|else.*codex|engineOf\(|source \|\| 'claude'|engine \|\| 'claude'" src media test
rg -n "allWithExternal|forAgentWithExternal|externalForAgent|index\.all\(|index\.forAgent\(" src test
rg -n "op: '(engines|console|sessions|turns|tasks|schedules|triggers|templates|workflows|missions|agents|projects|usage)" src
rg -n $AfEngineId .
```

Bu arama bir yapılacaklar listesi üretir; çözüm değildir. Örneğin `index.all()`
bir cost analitiğinde doğru, Sessions tablosunda yanlıştır. Her isabet semantiğine
göre incelenir.

---

## Motoru ölçme çalışma kâğıdı

Bu tablo doldurulmadan adapter yazılmaz. “Diğer motor gibi” cevap değildir.
Her satırın kanıtı `CLI sürümü + komut/olay + gözlenen sonuç` biçiminde tutulur.

### Kimlik, kurulum ve giriş

| Soru | Kaydedilecek cevap |
|---|---|
| Ürün adı nedir? | Kullanıcının gördüğü doğru ad |
| Motor id’si nedir? | Küçük harf kalıcı depolama anahtarı |
| Executable nedir? | PATH’te aranacak gerçek komut; Windows’ta `.cmd` shim mi gerçek `.exe` mi |
| Kurulum yolu nedir? | Gerçek komut veya uygulama kurulumu; komut yoksa dürüst `installHint` |
| Kesin sürüm nedir? | `--version` çıktısı; ölçümün tarihi |
| Giriş yolları nelerdir? | Abonelik/OAuth, API key, kurumsal sağlayıcı; birden fazlaysa hepsi |
| Giriş kanıtı nerede? | Yalnız durum çıkaran dosya/ayar; token değeri asla loglanmaz veya Bridge’e çıkmaz |
| CLI ayrı, auth ayrı mı? | “Giriş diskte ama CLI yok” ve “CLI var ama giriş yok” ayrı durumlar |
| Hazır olma ne demek? | CLI + auth yalnız statik adaydır; gerçek test ayrı verdict’tir |
| Sonraki eylem nedir? | Her başarısız durumda tek, uygulanabilir adım; yalnız “not configured” yok |
| Faturalama düzeni nedir? | Plan, key veya bilinmiyor; motor birden fazla yolu destekliyorsa o anki gerçek durum |

Statik status kodu credential içeriğini dışarı sızdırmadan yalnız varlık ve tür
okur. Bir auth dosyasının bulunması motorun çalıştığını kanıtlamaz. `engines.test`
en küçük gerçek turla CLI + giriş + ağ + sağlayıcı zincirini ayrıca kanıtlar ve
kendiliğinden çalışmaz; gerçek bir tur harcadığı için yalnız kullanıcı eylemiyle
koşar.

### Süreç ve komut sözlüğü

| Soru | Ölçüm |
|---|---|
| Süreç şekli | Bir konuşma boyunca kalıcı süreç mi, her turda yeni süreç mi? |
| Hosted/headless komut | Prompt almadan önceki kesin argv; JSON/stream bayrağı |
| TUI komut | İnteraktif terminalin kesin argv’si; headless komutla aynı sanılmaz |
| İlk prompt kanalı | stdin, argv değeri, positional veya özel `-i` benzeri bayrak |
| Sonraki prompt kanalı | Kalıcı stdin mi, yeni süreç mi? |
| Shell gereksinimi | Windows shim için shell gerekiyor mu; çok satırlı argv shell’den sağ çıkıyor mu? |
| stdin kapanışı | Model listesi veya tek tur stdin EOF beklemeden asılı kalıyor mu? |
| Hazır olma el sıkışması | Süreç ilk prompt’tan önce olay yayınlıyor mu; prompt “ready” beklerse deadlock olur mu? |
| cwd anlamı | Süreç cwd’si yeterli mi; `--add-dir`, `-C` gibi ayrıca bildirim gerekiyor mu? |
| Sistem bağlamı | System prompt/file bayrağı var mı; yoksa ilk prompt’a güvenli prefix gerekir mi? |
| Timeout | Başlangıç, tek tur, model kataloğu ve kapanış için ölçülmüş üst sınırlar |
| Bitiş anı | Sonuç olayı mı, process exit mi; sonuçtan sonra süreç/lock ne kadar yaşıyor? |
| Çıkış kodları | Başarı, auth, izin, argüman, limit ve protokol hataları |
| Kapatma | Child yeterli mi, süreç ağacı mı; motor kaydı/lock ayrıca temizleniyor mu? |

Özellikle şu denemeler yapılır:

- Prompt içinde Türkçe çok baytlı karakter, satır sonu, çift tırnak, ters tırnak,
  `%`, `$`, `&` ve uzun metin.
- stdin açık ve kapalıyken aynı komut.
- Doğru ve yanlış cwd ile aynı dosyayı okuma isteği.
- Sonuç olayı geldikten hemen sonra aynı konuşmayı resume etme.
- Süreci panelden kapatma; child ve torunların gerçekten öldüğünü doğrulama.

### Model, effort, izin ve ekler

| Soru | Ölçüm |
|---|---|
| Model kataloğu | CLI’dan mı, dosyadan mı, servisten mi; çağrı token harcıyor mu? |
| Katalog şekli | id/etiket/alias; aynı ailede varyantlar ve effort sonekleri |
| Katalog yenileme | Süre, timeout, TTL, manuel refresh ve fallback’in kaynağı |
| Varsayılan model | CLI’ın kendi varsayılanı mı, filo ayarı mı, ajan+motor ayarı mı? |
| Effort desteği | Hangi değerler, model bazında mı, ayrı bayrak mı; hiç yoksa kontrol de yok |
| İzin modu | Gerçek CLI sözlüğü ve headless davranışı; “ask” soracak kimse yoksa ne olur? |
| Plan/read-only/yolo | Adı değil davranışı ölçülür: gerçekten yazabiliyor mu? |
| Canlı değişiklik | Tur sırasında model/effort/izin değişebilir mi, sonraki turda mı uygulanır? |
| Görsel ek | Dosya ve resim için ayrı kanal var mı; yoksa sessiz düşürmek yerine nasıl anlatılır? |
| Output contract | JSON zarfı destekleniyor mu; Claude’a ait bayrak başka motora taşınıyor mu? |

Bir motor effort almıyorsa değer sessizce atılmaz: formda sunulmaz ve Bridge’den
gelirse yazma anında reddedilir. Bir izin modu aynı adı taşısa bile aynı güvenceyi
vermeyebilir; UI motorun gerçek mekanizmasını adlandırır.

### Konuşma kimliği ve resume

| Soru | Ölçüm |
|---|---|
| Gerçek konuşma id’si | Hangi olay/metadata alanı; dosya adından farklı mı? |
| Önceden id verme | Yeni konuşmada id preset edilebilir mi? |
| Headless resume | Kesin bayrak ve konumu; aynı id gerçekten bağlamı taşıyor mu? |
| Terminal resume | TUI içinde destekli mi; ayrı subcommand mı; hiç yok mu? |
| Continue latest | Motorun “latest” tanımı yalnız kendi deposu mu; Agent Farm’ın dört motorlu latest’iyle karışıyor mu? |
| Tek sahip | Aynı konuşmayı iki süreç açınca ne olur; lock veya çift yazar riski |
| Yeniden yükleme | VS Code kapat/aç sonrası aynı konuşma nasıl bulunur ve devam eder? |
| Sayaç baseline’ı | Resume edilen eski konuşmanın geçmiş token/cost’u yeni tura yazılmıyor mu? |

Resume testi iki ayrı iddianın ikisini de kanıtlar: komut aynı kimliği açmalı ve
ikinci tur birinci turdaki benzersiz bilgiyi hatırlamalıdır. Yalnız aynı id’nin
çıktıda görünmesi bağlamın taşındığına tek başına yetmez.

### Protokol ve kullanım

| Soru | Ölçüm |
|---|---|
| Akış biçimi | JSON, JSONL, text, protobuf/SQLite metadata veya başka bir zarf |
| Başlangıç olayı | Konuşma/thread id, model, cwd ve sürüm nerede gelir? |
| Mesaj olayı | User/assistant/reasoning nasıl ayrılır; parça mı tam metin mi? |
| Araç olayları | Başlama/güncelleme/bitiş, tool adı, dosya, parametre, sonuç ve hata |
| Sonuç olayı | Başarılı turu ne kanıtlar; process 0 tek başına yeterli mi? |
| Hata olayı | Exit 0 içinde hata zarfı olabilir mi; en iyi kullanıcı cümlesi nerede? |
| Etkileşim olayları | Permission request, ask-user, plan/onay ve tur içi steering protokolde var mı? |
| UTF-8 | Chunk sınırında çok baytlı karakter bölünürse decoder koruyor mu? |
| Kullanım kapsamı | Olay tur toplamı mı, süreç toplamı mı, konuşma boyunca kümülatif mi? |
| Input/cache | Input cache’i içeriyor mu, ayrı mı; toplarken çıkarılmalı mı? |
| Output/reasoning | Reasoning output’a dahil mi, ayrık mı; iki kez sayılma riski |
| Context | Son pencere mi, konuşma ömrü toplamı mı; model context window nedir? |
| Cost | CLI dolar söylüyor mu; söylenen tur mu toplam mı; yoksa fiyat kuralı mı türetiyor? |
| Kota/plan | Yerel transcriptte veya sağlayıcı endpointinde var mı; yoksa `not-published` |

Ham stream byte olarak alınır ve `StringDecoder('utf8')` benzeri stateful decoder
ile çözülür. `String(chunk)` her chunk’ta ayrı çalıştırılmaz. Adapter testi örnek
Türkçe satırın **her olası byte bölünme noktasını** denemelidir.

Kümülatif kullanımda her tur `next - previous` ile hesaplanır; fakat reload/resume
başlangıç baseline’ı da transcript veya index’ten yüklenmelidir. Süreç toplamı veren
motora kümülatif fark uygulanmaz. Adım toplamı ile sonuç toplamı aynı rakamı tekrar
ediyorsa ikisi toplanmaz.

#### “Context now” ayrı bir ölçüm sözleşmesidir

Bir motor entegrasyonu aşağıdaki dört sayıyı birbirinin yerine kullanamaz:

| Alan | Kesin anlamı |
|---|---|
| `sessionSpentTokens` | Konuşmanın ömrü boyunca bütün model çağrılarının toplam harcaması; pencere kapasitesini defalarca aşabilir |
| `turnSpentTokens` | Bir kullanıcı turu boyunca yapılan bütün iç model çağrılarının toplamı; araç döngüsü varsa pencere kapasitesini aşabilir |
| `contextTokens` | **En son model çağrısının** sonunda pencerenin tuttuğu yaklaşık token; toplam değil anlık doluluk |
| `contextWindowTokens` | O oturumda gerçekten uygulanan operasyonel pencere kapasitesi; model kataloğundaki yayımlanmış üst sınırdan farklı olabilir |

`contextTokens` yalnız tek model/API çağrısının kendi usage’ından veya motorun açıkça
“son çağrı” diye yayımladığı alandan türetilir. Tur, süreç veya konuşma toplamını
taşıyan usage bloğuna `contextAfter()` uygulamak yasaktır. Bir kullanıcı turunda on
model çağrısı yapıldıysa bunların toplamı `turnSpentTokens`, yalnız sonuncusu
`contextTokens` olur.

Kanonik ölçüm en az `{ tokens, window?, measuredAt, source }` taşır. `source`, örneğin
`stream-last-call`, `rollout-last-token-usage`, `transcript-last-call` veya
`engine-reported` gibi doğrulanabilir bir köken söyler. Stream yalnız harcama toplamı
veriyorsa transcript/rollout kuyruğu mtime+size cache’li ve sınırlı tail okumasıyla
izlenebilir. Güvenilir son-çağrı kaynağı yoksa değer `unknown` kalır; session veya turn
toplamı “yaklaşık ctx” diye gösterilmez. Son iyi örnek korunacaksa yaşı da taşınır ve
stale olduğu UI/Bridge’de söylenir.

Pencere kapasitesinde açık kullanıcı override’ı varsa bu bilinçli seçim uygulanır;
yoksa öncelik oturum sırasında motorun raporladığı etkin değerde, sonra doğrulanmış
model kataloğundadır. Yayımlanmış model üst sınırı, CLI’nin autocompact/plan/runtime
nedeniyle raporladığı daha küçük operasyonel pencerenin üstüne yazılmaz. Compaction
sonrası `contextTokens` düşebilir;
bu normaldir ve kümülatif sayaç gibi monotonlaştırılmaz. `contextTokens >
contextWindowTokens` görülürse yüzde çizilmez: ölçüm tutarsız/stale işaretlenir,
toplama geri düşülmez.

Motor çalışma kâğıdı şu matrisi gerçek iki turlu, araç kullanan bir smoke ile doldurur:

| Motor | Harcama kaynağı ve kapsamı | Son-çağrı ctx kaynağı | Etkin pencere kaynağı | Yoksa davranış |
|---|---|---|---|---|
| Yeni motor | tur/süreç/konuşma/adım | kesin ham alan veya transcript olayı | runtime/model/unknown | `—`, asla toplam değil |

Ölçülmüş dört motorun bugünkü doldurulmuş hâli (X-43, 2026-08-15). Kapsam
işareti olayın üzerinde taşınır (`usage_scope`, `src/core/consoleproto.ts`);
ortak reducer yalnız `perCall` bloğundan ctx türetir, bütün kapsamlar harcamayı
besler.

| Motor | Harcama kaynağı ve kapsamı | Son-çağrı ctx kaynağı | Etkin pencere kaynağı | Yoksa davranış |
|---|---|---|---|---|
| Claude | assistant mesajının kendi usage'ı — `perCall` | aynı blok, `contextAfter()` | motor yayımlamaz → unknown | subagent ve `thinking_tokens` ctx'e dokunmaz |
| Codex | `turn.completed.usage`, konuşma kümülatifi; delta alınır — `turnAggregate` | ‼️ stream'de YOK. Rollout `event_msg/token_count.info.last_token_usage` (sınırlı tail + mtime cache, `src/core/codexctx.ts`) | aynı satırdaki `model_context_window` (ölçülen 258.400; yayımlanmış model tavanı 1,05M olsa bile bu ezilmez) | dosya yoksa/yarım satırsa `—`, asla tur veya oturum toplamı |
| Gemini | `result.stats`, süreç toplamı — `processAggregate` | yayımlanmış per-call alan yok → unknown | yok | `—` |
| Antigravity | `step.usage`, adım başına — `perCall` | son usage'lı step (adım = çağrı; `result` bloğu bunların toplamı olduğu için usage taşımaz) | CLI yayımlamıyor → unknown | `—`, yüzde çizilmez |

### Transcript, index ve canlılık

| Soru | Ölçüm |
|---|---|
| Depo yolu | Varsayılan kök, kullanıcı override ayarı, arşiv yolu |
| Dosya biçimi | JSON/JSONL/başka; okunabilir mi, büyüme biçimi nedir? |
| Gerçek id | İçeride hangi alan; filename neden güvenilir/güvenilmez? |
| Başlık | İlk gerçek kullanıcı prompt’u; sistem prefix’i ve durum mesajları ayıklanıyor mu? |
| cwd → ajan | Yol eşleme yöntemi; hash varsa nasıl doğrulanıyor? |
| Proje | Launch stamp’i ile index satırı nasıl uzlaşıyor? |
| Token/turn/tool | Transcript bunları dürüstçe sağlayabiliyor mu? |
| Live hook | Motor kendi hook’unu yayınlıyor mu; yoksa host/launcher lifecycle’ı mı aynalanacak; hook payload dosya yolu taşımıyorsa Live Timeline için dosya kayıttan nasıl çözümlenecek? |
| Dosya yok | Gerçekten henüz mi yok, yoksa motor okunabilir transcript hiç üretmiyor mu? |
| Tarama sınırı | Yaş, boyut, derinlik, cache ve parse hatası kullanıcıya nasıl yansır? |

Transcript okunamıyorsa motor yine bir oturum kaynağı olabilir: CLI’ın index’i,
metadata DB’si veya Agent Farm’ın hosted kopyası kullanılabilir. Ancak Session
Viewer “henüz yazılmadı” dememelidir; motorun neden okunabilir transcript
vermediğini `noTranscriptNote()` üzerinden açıklar. Canlı akışta (`LiveMonitor`)
Claude dışındaki motorların hook payload’unda `transcript_path` gelmediği için,
Timeline üzerindeki swim lane ve işaret tıklamalarının dosya yolunu `SessionIndex`
kaydından (`row?.file`) alacağı unutulmamalıdır.

### Ajan çalışma alanı: talimat, anayasa, memory, duty, skill ve MCP

Bir motorun prompt’a cevap vermesi, Agent Farm’daki **ajanı** çalıştırdığı anlamına
gelmez. Ajan; kendi kimliği, ortak anayasa, memory indexi, nöbet görevleri,
becerileri ve araçlarıyla aynı varlık olmalıdır. Yeni motor için şu matris ayrıca
ölçülür:

| Soru | Ölçüm |
|---|---|
| Talimat dosyası | Hangi adları okuyor (`CLAUDE.md`, `AGENTS.md` veya başka)? |
| Keşif kökü | Git kökü, workspace kökü, cwd, kullanıcı config’i veya birden fazlası |
| Parent walk | Üst klasörlere çıkıyor mu; nerede duruyor; merge sırası nedir? |
| Boyut sınırı | Talimat dosyası/toplamı için byte/token tavanı var mı? |
| Öncelik | Global, root, agent ve cwd talimatlarından hangisi hangisini ezer? |
| Ortak anayasa | Nest kökündeki ortak kurallar motora tek kopya olarak nasıl ulaşır? |
| Ajan kimliği | Agent-local talimat doğru dosyadan, doğru cwd ile gerçekten yükleniyor mu? |
| Memory | Düz markdown’ı okuyabiliyor mu; `memory/MEMORY.md` indexine hangi yönergeyle bakıyor? |
| Duties | `DUTIES.md` referansı yeterli mi; native workflow/command karşılığı gerekir mi? |
| Skills | Hangi klasörü/manifesti okuyor; Claude’a özgü `.claude/skills` kendiliğinden görünür mü? |
| MCP | JSON/TOML/başka format, project/global scope, stdio/http, env/header quoting |
| Settings/hooks | Agent-local model/izin/hook dosyası var mı; Claude ayarı yanlışlıkla taşınıyor mu? |
| Drift | Üretilen dosya elle değişince nasıl anlaşılır; hangi yön kazanır; yedek nasıl alınır? |

Gerçek kabul turu yalnız nonce hatırlatmaz; ajanın kimlik dosyasındaki benzersiz,
zararsız bir cümleyi ve ortak anayasadaki ayrı bir kuralı da doğru biçimde
yansıttığını kanıtlar. Böylece “aynı klasörde çalıştı” ile “aynı ajan olarak
çalıştı” ayrılır.

Project brief bu katmanın yerine geçmez. Brief o işin bağlamıdır; agent-local
talimat ajanın kimliği, nest anayasası ise bütün filonun yöntemidir.

---

## Güvenli gerçek ölçüm protokolü

Gerçek motor çağrıları otomatik test paketine gizlenmez. Maliyet, dosya yazma veya
hesap etkisi yaratabilecek denemeler kullanıcıya söylenir; en küçük yeterli model
ve salt-okunur/geçici klasör kullanılır.

Ölçüm sırası:

1. `--version` ve ilgili `--help` çıktıları.
2. Kurulu paketin resmî README/kaynağında CLI yardımının gizlediği davranış.
3. Boş geçici klasörde en küçük salt-okunur tek tur.
4. Ham stdout/stderr/exit code/process süresi kaydı.
5. Tool çağırmayan ve tool çağıran birer tur.
6. Aynı konuşmada iki tur ve benzersiz bağlam doğrulaması.
7. Doğru/yanlış cwd; desteklenen/desteklenmeyen izin ve effort.
8. Terminal resume ve headless resume ayrı ayrı.
9. Motor listesini/usage bilgisini okuma; stdin EOF ve timeout denemesi.
10. Üretilen transcript/index dosyasını kimlik ve kullanım açısından karşılaştırma.

Ham fixture’a geçmeden önce şunlar temizlenir:

- access/refresh token, API key, cookie ve authorization header;
- e-posta ve hesap kimliği;
- kullanıcıya özel mutlak yol gerekiyorsa fixture içinde nötr geçici yol;
- gerçek prompt içinde özel hayat veya proje sırrı.

Sanitize edilen fixture, hangi CLI sürümünden ve hangi komut biçiminden geldiğini
yorumunda taşır. Uydurma fixture tek başına protokol kanıtı değildir.

Bir çağrı ağ/antivirüs/hesap engeline çarparsa adapter yazılmaz. Statik status
tamamlanabilir ama motor “measured/working” sayılmaz; engel görünür bırakılır.

---

## Uygulama: tek kaynaklardan dışarı doğru ilerle

### Motor kimliği ve hazır olma — `src/core/engines.ts`

İlk kod kapısı burada açılır:

- `EngineId` union’ına id eklenir.
- `SPECS` satırına doğru etiket, executable, env/key yolu, billing cümlesi,
  resmî docs, kurulum ve giriş eylemi eklenir.
- Auth okuyucu credential **değerini** değil yalnız güvenli durumunu çıkarır.
- `CLI yok + auth var`, `CLI var + auth yok`, `ikisi var`, `ikisi de yok`
  fixture’ları ayrı ayrı test edilir.
- Key yolu olmayan motorda `env: ''` gerçek bir cevap olarak korunur; sahte “Add
  key” düğmesi çizilmez.
- `nextStep` her durumda yapılacak tek şeyi söyler.
- `ready`, yalnız statik olarak başlatılabilirliktir; gerçek sağlık sonucu
  `src/core/engineTest.ts` verdict’idir.

Host tarafındaki `ENGINE_LABELS` bu spec’ten türemeye devam etmelidir. Webview
sözlüğü ayrı runtime’da olduğu için aşağıdaki UI adımında ayrıca eşitlenir.

### Taşıma yetenekleri — `src/core/consoleEngine.ts`

`ENGINES: Record<EngineId, EngineTransport>` yeni satır olmadan derlenmemelidir.
Transport en az şu gerçekleri taşır:

- `exe`;
- `shape: persistent | perTurn`;
- `liveControls`;
- `reportsCost`;
- `costSource: cli | tokens | none`;
- `promptOn: stdin | argv`;
- `spawnShell`;
- `resumeInTerminal`;
- `readableTranscript`.

Mevcut alan yetmiyorsa yeni bir capability eklenir; mevcut bir boolean’a başka
bir anlam yüklenmez. Örneğin auth türü, fiyat raporlama yeteneği ve gösterilen
rakamın kaynağı üç ayrı gerçektir.

Motorun komut sözlüğü `src/core/<motor>.ts` içinde tutulur. Şunların her biri
tek kaynaktan üretilir:

- hosted turn argv;
- headless run argv;
- interaktif terminal argv;
- resume/continue argv;
- model/effort argv;
- izin modu ve kullanıcıya açıklaması;
- cwd/additional-dir;
- ilk prompt bayrağı;
- system context ve image yetenekleri;
- motorun özel exit/timeout sabitleri.

`turnArgs`, `runArgs`, `tuiArgs`, `engineModeNote` ve motor-duyarlı diğer
dispatch’ler **exhaustive `switch` + `never`** ile genişletilir. Şu biçimler
yasaktır:

```ts
// Yasak: beşinci motoru yanlış programa yollar.
return id === 'agy' ? agyArgs(o) : codexArgs(o);

// Yasak: bilinmeyeni sessizce Claude/Codex yapar.
const args = adapters[id] ?? adapters.codex;
```

Kullanıcıdan veya kayıtlı ayardan gelen bilinmeyen id, giriş sınırında açıkça
reddedilir. Geriye uyumluluk için yalnız gerçekten **eksik** eski değer Claude’a
çözülebilir; tanınmayan dolu değer çözülmez.

### Protokol adapter’ı — `src/core/<motor>proto.ts`

Motorun ham protokolü Agent Farm’ın kanonik Console olaylarına çevrilir. Adapter:

- state’i açık bir `<Motor>State` içinde tutar;
- session/thread id’yi ilk güvenilir olaydan alır;
- user/assistant/reasoning mesajlarını ayırır;
- tool start/update/result/error olaylarını kararlı bir step id ile eşler;
- dosya, komut, MCP, web, todo gibi step türlerini kanonik `StepKind`’a çevirir;
- tekrar gelen snapshot ile delta’yı iki kez eklemez;
- başarılı sonuç ve motorun kendi hata zarfını exit code’dan bağımsız okur;
- usage alanlarını motorun ölçülmüş semantiğine göre çevirir;
- harcama usage’ı ile son-çağrı context örneğini ayrı kanonik alanlar olarak üretir;
- usage’ın `perCall`, `turnAggregate`, `processAggregate` veya `conversationCumulative`
  kapsamını açıkça bildirir; yalnız `perCall` ctx türetmeye izin verir;
- eksik alanı uydurmaz.

Adapter testinde en az şunlar vardır:

- init ve konuşma id’si;
- parçalı assistant mesajı;
- reasoning;
- her bilinen tool sınıfından start/result;
- hata zarfı ve exit 0 içindeki hata;
- eksik/unknown olayın güvenli davranışı;
- iki turda state;
- token/cache/reasoning hesabı;
- çok çağrılı tek turda session/turn toplamı ile son-çağrı ctx ayrımı ve compaction;
- bütün UTF-8 byte bölünmeleri.

### Console süreci — `src/core/consolehost.ts`

`ConsoleHost` motorun process shape’ına göre davranır:

- **persistent:** bir process konuşmayı taşır; bir turun sonu protokol olayı
  olabilir, sonraki prompt aynı stdin’e gider.
- **perTurn:** her tur ayrı process; konuşma id’si resume argümanına gider;
  process arası `child` olmaması “oturum bitti” anlamına gelmez.

Yeni motor için şu bağlantılar açıkça yapılır:

- doğru state yaratma ve `threadOf()` çözümlemesi;
- doğru translator dispatch’i;
- `StringDecoder` ile chunk → satır ayrıştırma;
- prompt’un `promptOn` kanalına verilmesi ve gereken yerde stdin’in kapatılması;
- shell/no-shell spawn;
- cwd ve ek dizin;
- sonucu aldıktan sonra process exit’i bekleme;
- stderr’in ilk iyi hata cümlesini saklama;
- interrupt, close, retry ve process tree cleanup;
- tur kuyruğunun ancak motor gerçekten serbest kaldığında ilerlemesi;
- reload/resume baseline’ı;
- harcama sayaçlarını toplarken context’i yalnız adapter’ın açık `ContextSample`
  ölçümünden güncelleme; sentetik toplu usage’ı otomatik ctx saymama;
- stream son-çağrı usage’ı vermiyorsa motorun transcript/rollout tail probe’unu
  throttle+mtime/size cache ile çalıştırma, tur bitişi ve process close’da son okuma;
- hosted transcript kopyası.

Bir `turn.completed` olayı sürecin konuşma lock’unu bıraktığını kanıtlamaz. Aynı
thread’i bir sonraki process’e vermeden önce önceki child gerçekten kapanmış
olmalıdır. Aksi hâlde iki süreç aynı konuşmayı tutar veya sonraki tur yanlış
child’ın `close` olayınca bitmiş görünür.

### Terminal başlatma — `src/core/launch.ts` ve `src/extension.ts`

Terminal yolu Console yolundan ayrı doğrulanır:

- gerçek TUI komutu kullanılır; headless komut terminale yazılmaz;
- ilk prompt interaktif oturumu tek cevap verip kapatmamalıdır;
- resume desteği `resumeInTerminal` capability’sinden gelir;
- motor desteklemiyorsa yeni konuşma başlatmak yerine Console’a yönlendiren açık
  açıklama vardır;
- aynı cwd hem terminalin klasörü hem gerekiyorsa CLI argümanıdır;
- terminal başlığı ve `termBindings` motor id’sini taşır;
- yeni dış terminal için geçici live kimliği hemen açılır; gerçek transcript id’si
  gelince kayıt **yerinde** yeniden anahtarlanır;
- proje context’i motorun gerçek kanalından iletilir. Kanal yoksa terminalin
  brief almadığı açıkça söylenir; Console ilk prompt prefix’i kullanabiliyorsa
  bu fark ayrıca anlatılır.

Terminalde görünen komutla gerçekten çalıştırılan argv aynı olmalıdır.

### Gerçek sağlık testi — `src/core/engineTest.ts`

Yeni motor için kullanıcı tarafından tetiklenen en ucuz güvenli call eklenir:

- mümkün olan en küçük model;
- dosya yazamayan izin/sandbox;
- dört-beş kelimelik deterministik prompt;
- cwd’den bağımsızlık;
- motorun gerçek başarı zarfı;
- ölçülmüş timeout;
- shell gereksinimi;
- hata halinde motorun en iyi cümlesi.

`--version`, boş stdout veya yalnız exit 0 sağlık kanıtı değildir. Test başarılı
tur olayını/sonuç zarfını görmelidir. Sonuç panel oturumu boyunca yaş ve süreyle
cache’lenir; sayfa açılışında veya zamanlayıcıyla kendiliğinden çağrılmaz.

### Modeller ve ajan varsayılanları — `src/core/models.ts`, `src/core/agentDefaults.ts`

Model yolu şu sorulara cevap verir:

- Kaynak CLI mı, yerel dosya mı, servis mi?
- Çağrı stdin EOF bekliyor mu?
- Model satırında effort varyantı gömülü mü?
- Alias ve aile varyantları nasıl normalize edilir?
- Katalog gelmezse fallback hangi sürüm/kaynaktan gelir ve UI bunu söylüyor mu?
- Model bazında effort listesi nedir?
- Manuel refresh nasıl yapılır ve ne kadar cache’lenir?

`readEngineModels()` yeni motoru dönüş değerinde taşır. Composer, launcher,
task formu, mission formu ve Bridge aynı model matrisini okur; kendi bayat
listelerini tutmaz.

Varsayılan çözümleme sırası görünür ve testlidir:

1. Bu çalıştırmada açıkça seçilen değer.
2. Ajan + motor varsayılanı.
3. Filo `launchDefaults` değeri.
4. Motorun kendi varsayılanı.

Claude’ın kendi agent-local settings dosyası gibi motorun zaten okuduğu bir
kaynak varsa Agent Farm ikinci bir kaynakla onu ezmez. Diğer motorlar için
`agentFarm.agentEngineDefaults` per-engine tutulur; bir motordaki seçim diğerine
sızmaz.

Model id’si konuşmacı etiketine yeni bir aile getiriyorsa `src/core/speaker.ts`
ve ilgili testler de güncellenir. Motor etiketi ile model ailesi yine ayrı kalır.

Settings şeması da aynı anda genişletilir:

- `package.json` içindeki `agentFarm.launchDefaults.engine` ve
  `agentFarm.planUsageEngine` enum/enumDescription satırları;
- gerekiyorsa transcript/config home override ayarı;
- `agentFarm.agentEngineDefaults` örnek ve açıklaması;
- `src/panels/settingsPanel.ts` fallback/listesi ve `media/settings.js` arama
  sözcükleri;
- varsayılan model/effort/permission açıklamaları;
- eski settings JSON’unda alan yokken Claude davranışının değişmediği migration
  testi.

Motor listesi mümkün olan yerde status/model matrisinden türetilir. `['claude',
'codex', …]` gibi gerekli runtime kopyaları parity testiyle kilitlenir.

### Ajan uyumluluk hattı — `src/core/antigravity.ts`, `src/core/codex.ts`

Bugünkü uyumluluk hattı Claude kaynaklı ajanı üç motor ailesine taşır:

- Claude Code `CLAUDE.md` ve üst klasör talimatlarını kendi yoluyla okur.
- Codex her dizinden bir `AGENTS.md` dosyasını git kökünden cwd’ye doğru birleştirir;
  nest anayasası root `AGENTS.md` üzerinden **bir kez** gelir.
- Antigravity yalnız workspace içindeki `.agents/AGENTS.md` yolunu gördüğü için
  ortak anayasa agent-local üretilen dosyaya işaretli blokla gömülür.

Yeni motor için ölçümün sonucuna göre ya mevcut ortak `AGENTS.md` yeterlidir ya da
yeni bir **üretilen motor hattı** gerekir. Yeni hat gerekiyorsa:

- kanonik kullanıcı kaynağı (`CLAUDE.md` ve nest anayasası) değiştirilmez;
- motorun okuduğu hedef dosya/klasör ayrı ve açık adlandırılır;
- kaynak içindeki öz-referanslar hedef dosya adına çevrilir;
- ortak anayasa parent walk ile zaten geliyorsa kopyalanmaz; gelmiyorsa işaretli
  blokla tam bir kez eklenir;
- generated marker ve sidecar fingerprint’i yazılır;
- `none / foreign / in-sync / source-ahead / engine-ahead / conflict` durumları
  açıkça çözümlenir;
- yabancı veya elle değiştirilmiş dosya onaysız overwrite edilmez;
- reverse sync varsa ortak anayasa bloğu agent-local kaynağa sızmadan önce
  sökülür ve kaynak `.afbak` ile korunur;
- anayasa değişikliği bütün ilgili agent hatlarını stale yapar;
- health/Insights drift’i görünür kılar.

Agent health içindeki fixed-context hesabı da motor gerçekliğini izler: aynı
talimat iki dosyada dursa bile motor yalnız birini yüklüyorsa iki kez sayılmaz;
parent walk yüzünden iki kez yükleniyorsa bu da görünür hata olur. Boyut sınırı
ve Agent Farm’ın context budget’ı motor başına dürüst yükü göstermelidir.

Mevcut `Sync Agent with Antigravity + Codex…` adı, düğmesi, açıklamaları ve
`agents.sync` / `constitution.sync` sözleşmesi yeni motor geldiğinde eksik
kalabilir. Bunu sessizce yeniden adlandırmak mimari ve kullanıcı dili kararıdır:
önerilen motor-nötr ad ve göç yolu kullanıcıya sunulur, karar alındıktan sonra
command id korunarak görünen ad/Bridge açıklaması ve bütün yüzeyler birlikte
güncellenir.

#### Memory ve duties

`memory/` düz markdown olduğu için fiziksel kopya çoğu motorda gerekmez; fakat
motorun `MEMORY.md` indexini okuyacağını söyleyen talimatın gerçekten yüklendiği
kanıtlanır. “Dosyayı okuyabilir” ile “ne zaman bakacağını bilir” aynı şey değildir.

`DUTIES.md` için:

- agent talimatında zorunlu referans motora ulaşır;
- motor native workflow/command istiyorsa yalnız aktif duty’lerden güvenli üretilir;
- slug, frontmatter ve klasör sözlüğü motor üzerinde ölçülür;
- elle düzenlenen generated workflow hash ile korunur;
- duty add/edit/delete/sync sonrası stale dosya ve orphan workflow kalmaz.

#### Skills

Yeni motorun skill keşfi ölçülür. `.claude/skills` veya `.agents/skills` adını
varsayma. Ortak SKILL.md biçimini doğrudan okuyorsa tek kopya tercih edilir; farklı
manifest/yerleşim gerekiyorsa dönüştürücü, marker, drift ve kaldırma sözleşmesi
talimat hattıyla aynı güvenlikte kurulur. Capability Matrix ve agent pack export/
import, yeni motorun görünür skill hattını doğru anlatmalıdır.

#### MCP

MCP uyumluluğu “aynı server adı var” değildir. Şunlar fixture ile doğrulanır:

- motorun config dosyası ve scope’u;
- stdio command/args ve Windows yol quoting’i;
- `env` alt tablosu;
- HTTP URL, headers/http_headers ve secret referanslarının biçimi;
- JSON → TOML veya başka dönüşümde key quoting;
- disabled server ve project-local/global precedence;
- canlı global config’e otomatik yazmanın güvenli olup olmadığı.

Agent Farm kullanıcının motor-global canlı config’ine sahip değilse onu sessizce
değiştirmez; merge-ready `*.suggested.*` dosyası ve uygulanacak kesin yol üretir.
Secret değeri generated dosya, transcript veya Bridge sonucuna düşmez.

Bu hat için `test/test_constitution_sync.js`, `test/test_codex_sync.js`, agent
sync Bridge dispatch testleri, drift/foreign/conflict vakaları ve en az bir gerçek
“ajan kimliğini + ortak kuralı okudu” turu genişletilir.

### Kullanım, kota ve maliyet — `src/core/engineUsage.ts` ve pricing tüketicileri

Üç kavram ayrı tutulur:

1. **Faturalama düzeni:** plan mı, API key mi, bilinmiyor mu?
2. **Motorun kabiliyeti:** CLI tur için gerçek dolar rakamı yayınlıyor mu?
3. **Gösterilen rakamın kaynağı:** CLI, token + kullanıcı fiyat kuralı veya hiçbiri.

Yeni motor için:

- kullanım/kota kaynağı varsa bağımsız adapter yazılır;
- yoksa `not-published` veya `not-applicable` kullanılır;
- kayıp/bozuk yanıt `0% used` yapılmaz;
- plan bar’ının pencere/reset zamanı uydurulmaz;
- `input`, `cacheRead`, `cacheWrite`, `output`, `reasoning` çakışmaları test edilir;
- session harcaması, turn harcaması, son-çağrı context’i ve etkin pencere dört ayrı
  alan olarak tutulur; bir toplam hiçbir koşulda context fallback’i olmaz;
- context kaynağı/ölçüm zamanı taşınır; source bilinmiyorsa sayı yerine unknown kalır;
- transcript/index, Session Viewer, Console state, kart/alt şerit ve Bridge aynı ham
  context örneğini kullanır veya görünür freshness farkı söyler;
- motor price raporlamıyorsa Console/Tasks/Missions dolar tavanı davranışı
  yeniden değerlendirilir ve görünür token tavanı gerekir;
- resume edilen konuşmada yalnız yeni run’ın delta’sı göreve yazılır.

### Transcript ve SessionIndex — `src/core/cliTranscripts.ts`, `src/core/cliViewer.ts`, `src/core/sessions.ts`

Okunabilir transcript varsa motorun kendi parser’ı eklenir. Parser en az şu
alanları dürüstçe üretir:

- `source` motor id’si;
- gerçek `sessionId`;
- cwd, model, ilk gerçek user prompt’undan title;
- first/last timestamp;
- user turn, tool call ve hesaplanabiliyorsa usage;
- agent/project eşlemesine yetecek metadata;
- file yalnız gerçekten açılabilir transcript varsa.

Kimlik çözümü tek yerde kalır:

- id → kayıt: `SessionIndex.byId()`;
- file → kayıt: `SessionIndex.byFile()`.

`path.basename(file)` hiçbir motor için genel çözüm değildir. Launch origin,
title override, pin/tag, project stamp, terminal binding, resume baseline ve live
reconciliation bu çözümleyicileri kullanır.

Transcript okunamıyorsa `SessionSource` üzerinden metadata satırı üretilebilir.
Bu satır uydurma `file`, token veya turn almaz. Viewer ve open eylemleri
`readableTranscript` capability’sine göre davranır.

`src/core/cliViewer.ts` içindeki engine union/dispatch de genişletilir. Session
satırının parser’ı ile Viewer parser’ı iki ayrı eski liste hâline gelmez; aynı ham
fixture her ikisinde session id, turn, tool ve usage açısından karşılaştırılır.

Tarama:

- büyük dosyayı sınırsız okumaz;
- yaş/boyut/derinlik limitini görünür veya belgeli tutar;
- mtime/signature cache’i kullanır;
- parse hatasını sessizce “oturum yok”a dönüştürmez;
- unmatched project filtresini bütün motorlara aynı uygular;
- aynı hosted + dış transcript kaydını doğru kimlikle tekilleştirir.

#### Headless ve Origin Kararları — `sessionHeadless` ve `sessionOrigin`

Claude dışındaki motorların (Antigravity `agy`, OpenCode, Codex, Gemini) transcript dosyalarında Claude Code CLI'a özgü `entrypoint: "sdk-cli"` alanı bulunmaz (`entrypoint` alanı boştur).

- `sessionOrigin(s)`: Oturumun Agent Farm tarafından başlatılmış bir görev, zamanlama, tetikleyici veya misyon olup olmadığını `launchedBy` üzerinden tespit eder (`auto`).
- `sessionHeadless(s)`: Başsızlık (🌙) kararı yalnız Claude'un `entrypoint` yazısına bağlanamaz. Agent Farm'ın başlattığı görevler (`LaunchBinding` / `launchedBy`), `mode: 'headless' | 'interactive'` bilgisini taşır. Motor ne olursa olsun (`claude`, `agy`, `opencode`, `codex`, `gemini`), `launchedBy` kaydı taşıyan ve interaktif bir terminale bağlanmamış her otomasyon oturumu `headless: true` kabul edilmelidir. Dışarıdan açılan oturumlarda ise `entrypoint.startsWith('sdk')` Claude fallback'i olarak işler.

### Canlılık ve sahiplik — `src/core/live.ts`, `src/core/sessionSource.ts`, `src/core/consoleresume.ts`

Yeni motor kendi hook’unu vermiyorsa şu yaşam döngüleri yine görünmelidir:

- Agent Farm Console’da başlayan tur;
- Agent Farm’ın açtığı dış terminal;
- task/schedule/trigger/mission çalışması;
- transcript veya CLI indexinden sonradan bulunan konuşma.

Launcher, gerçek id henüz yokken geçici bir kimlik açabilir; gerçek id gelince:

- lane/satır yerinde yeniden anahtarlanır;
- start zamanı, sayaç, history, project stamp ve terminal binding korunur;
- duplicate satır doğmaz.

#### Timeline ve Swim Lane transcript yolu bağlantısı

Claude oturumlarında her Live hook olayı doğrudan `transcript_path` taşır; oysa
diğer motorlar sayfaya `mirrorConsoleToLive` üzerinden thread id ve cwd ile
gelir, yani ham olayların üzerinde dosya yolu yoktur. Timeline paneli
(`src/panels/timeline.ts` `buildData`) oturumun diskteki dosyasını
`s.transcriptPath || row?.file` ile `SessionIndex` kaydından tamamlar ve webview
(`media/timeline.js`) kulvarın dosyasını (`fileOf(f) => f || lane.file`) araç
çubuklarına ve işaretlere aktarır. Böylece swim lane üzerindeki bir işarete veya
segmente tıklandığında ilgili transcript dosyası ve satırı açılır. Henüz disk
taraması rollout/chat dosyasını görmediyse (ör. Codex/Gemini oturumu sürerken)
ölü bağlantı yerine link çizilmez; anında yazan motorlarda (`agy`) ise doğrudan
çalışır.

Resume/continue öncesi sahiplik kontrol edilir. Canlı bir process aynı konuşmayı
tutuyorsa ikinci yazar sessizce başlatılmaz. Agent Farm’ın kendi Console süreciyse
önce güvenle kapatıp gerçek exit beklenebilir; dış terminalse kullanıcıya odaklanma
ve açıkça ikinci process seçenekleri anlatılır.

---

## Bütün çalıştırma kapıları

Yeni motorun adapter’ı çalıştıktan sonra motor ekseni aşağıdaki **asgari** giriş
noktalarından geçirilir. Her satırda motorun yanında model, effort, izin, cwd,
project ve ilgili diğer boyutların kaybolmadığı test edilir.

| Giriş noktası | Beklenen davranış | Ana yerler |
|---|---|---|
| Console composer | Motor seçilir, hazır değilse neden/çözüm görünür, ilk prompt doğru bağlamla başlatır | `src/panels/consolePanel.ts`, `media/console.js`, `src/core/consolehost.ts` |
| Ajan satırı / Start Session | Motor önce seçilir; terminal/Console kararı motorun yeteneklerini doğru anlatır | `src/extension.ts`, `src/views/trees.ts`, context menu kataloğu |
| Full launcher / launch profiles | Motor, model, effort, permission ve project aynı preview ile çalışır | `src/core/launch.ts`, `src/core/launchProfiles.ts`, `src/extension.ts` |
| Agent / constitution sync | Motorun talimat, anayasa, duty, skill ve MCP hattı non-destructive biçimde kurulur | `src/core/antigravity.ts`, `src/core/codex.ts`, `src/extension.ts`, Bridge |
| Continue latest / Resume | En yeni kayıt bütün motorlardan seçilir ve kendi motoruyla aynı konuşmayı açar | `src/extension.ts`, `src/core/consoleresume.ts`, `SessionIndex.byId()` |
| Task | Built-in motor kendi adapter’ıyla headless/TUI koşar; özel CLI profile ayrıdır | `src/core/tasks.ts`, `src/panels/tasksPanel.ts`, `media/tasksPage.js` |
| Schedule | Göreve dönüşürken bütün `RunDimensions` korunur; pencerenin o anki projesi çıkarılmaz | `src/core/tasks.ts`, Tasks sayfası, Bridge |
| Trigger | Aynı boyutlar ve yazma-anı validasyonu; fire anında yeniden readiness kontrolü | `src/core/triggers.ts`, Tasks sayfası, Bridge |
| Template | Kaydedildiği motor/model/effort/izin/cwd/project ile tekrar task üretir | `src/core/tasks.ts`, Tasks sayfası, Bridge |
| Workflow step | Her adım kendi boyutlarını taşır; üst workflow sessizce Claude’a döndürmez | `src/core/tasks.ts`, Tasks sayfası, Bridge |
| Mission | Mission varsayılanı ve üye override’ı; motor başına doğru model/limit | `src/core/missions.ts`, `src/panels/missionsPanel.ts`, `media/missions.js` |
| Bridge | UI ile aynı servis, aynı alan adları, aynı ret ve aynı sonuç şekli | `src/core/bridge.ts`, `src/extension.ts` |
| Arka plan/chat kaynakları | TaskManager’a giren çağrı açık motoru veya belgeli varsayılanı taşır | ilgili adapter → `TaskManager` çağrı zinciri |

Bu listeye güvenip durma: `start`, `launch`, `spawn`, `addTask`, `runTask`,
`resume`, `continue`, `engine` ve command registration aramalarıyla yeni kapıları
bul. Bir motor seçicisi olmayan fakat varsayılanı kullanan kapı da test kapsamıdır.

### RunDimensions sözleşmesi

Tekrar kullanılabilir ve ertelenmiş her run en az şu ortak boyutları korur:

```text
engine · model · effort · permissionMode · cli · workDir · priority
ignoreBudget · projectId · retry
```

Task/mission’a özgü `maxTokens`, `maxCostUSD`, `outputContract`,
`resumeSessionId`, `resumedEngine` gibi alanlar da kendi akışlarında korunur.

Kontroller:

- Form → store → list/get → edit → rerun → archive round-trip.
- Schedule/trigger/template/workflow → üretilen task round-trip.
- Mission → delegation task round-trip.
- UI → host message ve Bridge → aynı model fonksiyonu.
- Boş değer “motorun default’u” olarak kalır; explicit boş ile eski varsayılan
  yanlışlıkla depoya yazılmaz.
- Engine ve özel `cli` profile birbirine karıştırılmaz. Profile başka binary’dir;
  built-in motor argümanları ona verilmez.
- Motor id’si otomasyon **yazılırken** doğrulanır; saatler sonra fire anında ilk
  kez hata bulunmaz. Readiness fire/spawn anında tekrar kontrol edilir.
- Desteklenmeyen effort/izin/resume yazma sınırında reddedilir; sessizce düşmez.

### Project brief sözleşmesi

Yeni oturumun proje bağı iki ayrı sonucu aynı project id’den üretir:

1. Oturumun hangi projeye dosyalandığı.
2. Motorun projeden hangi bağlamı aldığı.

Claude sistem prompt dosyasını alabilir; bazı motorlar alamaz. Console ilk mesaja
prefix ekleyebilir, terminal ise kullanıcı adına metin yazmayı doğru bulmayabilir.
Her motor/yüzey kombinasyonu için karar açık ve görünürdür. “Projeye bağlı” rozet
tek başına “brief aldı” iddiasına dönüşmez.

---

## Bütün okuma ve yönetim yüzeyleri

Bir motorun çalışması, kaydının bulunması ve doğru yönetilmesi farklı işlerdir.
Aşağıdaki yüzeyler tek tek denetlenir.

| Yüzey | Doğrulanacak şey |
|---|---|
| Engines | Kurulum/auth/readiness/next action, gerçek Test, modeller, kullanım/kota |
| Console session list/card | Motor rozeti, model, state, token/cost, thread, desteklenen canlı kontroller |
| Sessions | Kayıt görünür, motor filtresi işler, doğru title/cwd/project/origin/active durumu |
| Turns | Motorun turn satırları, detay, export ve open eylemi aynı geniş havuzu okur |
| Session Viewer | Okunabilir transcript doğru parser’la açılır; okunamazsa doğru gerekçe |
| Search | Text/Regex için bütün okunabilir motorlar; Meaning kapsamı dürüst; parse kesintisi görünür |
| Timeline / Live | Dış terminal ve hosted run görünür; geçici id gerçek id ile uzlaşır; swim lane ve işaret (tick/mark) tıklaması transcript dosyasını ve satırını açar (hook payload dosya taşımıyorsa SessionIndex kaydından çözümlenir) |
| Dashboard | Oturum listeleri geniş; motor-özel analitik dar ise scope notu |
| Agent detail | Ajanın oturum listesi geniş; health/cost ölçümleri kapsamını söyler |
| Agent sync / Insights | Yeni motorun talimat hattı, anayasa ve generated dosya drift’i görünür |
| Portfolio | Son etkinlik ve canlılık bütün motorlar; ölçülen toplamlar ayrı |
| Project pages/tree | Oturum sayısı, last activity ve latest bütün motorlar; cost yalnız hesaplanabilir havuz |
| Farm Status/status bar | Built-in motorlar özel CLI profile sayısından bağımsız; gerçek motor dağılımı |
| Shelf/pin/tag/rename | Her motorun id’si tek resolver ile bulunur; rescan override’ı silmez |
| Tasks/Runs archive | Engine, session id, token/cost kaynağı ve resume bilgisi görünür |
| Missions | Üye/motor, token tavanı ve sonuç kaynağı görünür |
| Reports/health/exports/OTLP | Motor ya gerçekten dahil, ya açık scope cümlesi; `gen_ai.system` doğru |
| Bridge read ops | UI’ın okuduğu geniş/dar kaynakla aynı; engine filtresi gerçek veri üstünde |

Bir tablonun başlığı “Sessions”, “latest”, “fleet”, “project activity” veya
“active” ise varsayılanı kayıt havuzudur. “Claude cost”, “cache efficiency” gibi
format-bağımlı bir metrik dar olabilir; başlığı/kapsamı bunu söyler.

### Oturum eylemleri

Her motor satırında eylem görünürlüğü capability’den türemelidir:

- Open transcript: yalnız `file` gerçekten okunabiliyorsa.
- Resume in Console: adapter ve gerçek id varsa.
- Resume in terminal: `resumeInTerminal` varsa.
- Continue latest: önce bütün motorlardan latest kaydı seçer, sonra o motorun
  yeteneğine göre davranır.
- Focus terminal: launcher binding’i gerçek id ile uzlaşmışsa.
- Interrupt/end: process sahipliği gerçekten biliniyorsa.
- Rename/pin/tag/project: motorun transcript taraması override’ı rescan’da geri
  almamalıdır.

Bir eylemin yapamayacağı şeyi görünmez yapmak bazen doğrudur; fakat kullanıcı
“neden açılmıyor?” diye kalacaksa disabled/açıklamalı kontrol veya `noTranscriptNote`
gerekir. Tıklanabilir no-op hiçbir zaman kabul edilmez.

---

## UI sözleşmesi

### Tek motor görsel sözlüğü

Webview tarafının tek kaynağı `media/afEngine.js`, renk kaynağı
`media/common.css` içindeki `.af-engc.<id>` tanımıdır. Host tarafı
`src/core/engines.ts` içindeki `ENGINE_LABELS` sözlüğüdür.

Yeni motor eklenince:

- `media/afEngine.js` `LABEL` haritasına id/etiket eklenir;
- `media/common.css` içine VS Code tema değişkenleriyle okunabilir sabit renk
  eklenir;
- host etiketi status spec’inden gelir;
- `test/test_engine_parity.js` host/webview id ve etiket eşliğini korur;
- `test/test_engine_mark.js` bilinen motor rengini ve unknown nötr fallback’i
  doğrular;
- her satır motor rozeti taşır; “badge yok = Claude” belirsizliği geri gelmez.

### Kontroller capability’den doğar

- Model kutusu seçili motorun kataloğunu kullanır.
- Effort kutusu motor/model desteklemiyorsa çizilmez veya açıkça etkisiz olduğu
  söylenir; hayalî değer sunulmaz.
- Permission açıklaması motorun gerçek sözlüğünü ve headless karşılığını söyler.
- Live steer/ask kontrolleri yalnız `liveControls` varsa sunulur.
- Cost yerine token gösterilecekse başlık ve tavan da token olur.
- Transcript/open/resume kontrolleri ilgili capability’yi okur.
- Hazır olmayan motor seçiciden gizlenmez: sürümde var olduğu ve bu makinede neden
  çalışmadığı aynı satırda görünür; seçildiğinde düzeltme yolu gösterilir.

### Görsel kabul

`docs/CONVENTIONS.md` bağlayıcıdır. Değişen her webview için gerçek fixture,
gerçek page script ve ortak CSS ile:

```powershell
node test/render_page.js --list
node test/render_page.js <fixture>
node test/shoot_page.js <fixture> --width 1400
node test/render_page.js <fixture> --light
node test/shoot_page.js <fixture> --light --width 1400
node test/shoot_page.js <fixture> --width 900
node test/shoot_page.js <fixture> --width 650
```

PNG’ler gerçekten açılıp incelenir. Bakılacaklar:

- motor seçicisi ve rozet dar alanda kesiliyor mu;
- koyu/açık temada renk ayırt ediliyor mu;
- uzun model/etiket taşması;
- hazır değil, unknown, transcript yok ve kullanım bilinmiyor durumları;
- çoğunluk verisi: fixture yalnız birer örnekle tasarımı pohpohlamıyor mu;
- klavye odağı, disabled durum, tooltip/AFTip içeriği;
- Console composer yeniden çiziminde seçili motor/model/effort korunuyor mu.

Render davranış testi değildir; page testi de görsel kanıt değildir. İkisi birlikte
gereklidir.

---

## Bridge sözleşmesi

Yeni motor genellikle yeni bir op yaratmaz; fakat mevcut op’ların argüman,
doğrulama, açıklama ve sonuçlarını genişletir. UI’ın yapabildiği her kullanıcı
eylemi aynı commit’te Bridge’den de yapılabilir olmalıdır.

Asgari motor-duyarlı op aileleri:

- `engines.status`, `engines.models`, `engines.test`;
- `console.start`, `console.sessions`, `console.send`, model/effort/permission
  kontrolleri;
- `sessions.start`, `sessions.recent`, `sessions.find`, `sessions.live`,
  `sessions.files`, rename/pin/tag/end/interrupt;
- `turns.list`;
- `tasks.add/get/list/rerun`, schedules, triggers, templates, workflows;
- `missions.start/status/list` ve çalışma kontrolleri;
- `agents.defaults`, `agents.list`;
- `projects.sessions`, `projects.timeline`, `projects.cost`, `projects.work`;
- `usage.engines`, `usage.plan` ve motor seçebilen diğer usage çağrıları.

Prosedür:

1. Önce çalışan eklentide `farm.ops` okunur; motorla ilgili describe metinleri ve
   args envantere alınır.
2. UI ve Bridge aynı manager/service fonksiyonunu çağırır; Bridge handler iş
   mantığını tekrar yazmaz.
3. `engine` için tek doğrulama kullanılır; literal “claude, codex, …” metinleri
   yeni id ile güncellenir veya ortak kaynaktan türetilir.
4. `bridgeRunDimensions()` engine/model/effort/permission/cli/workDir/priority/
   project/ignoreBudget/retry alanlarını aynı adla taşır.
5. Unsupported effort/resume gibi durumlar UI ile aynı açık reddi üretir.
6. `BridgeRegistry` duplicate op kaydında hata vermeye devam eder. Aynı `op` adı
   dosyanın ilerisinde eski handler tarafından gölgelenemez.
7. Dispatch testi registry’yi gerçekten çalıştırır; yalnız kaynakta `op:`
   kelimesini aramaz.
8. Sonunda `farm.ops` yeni açıklamayı gerçekten döndürür.

Bridge’den secret değeri okuma/yazma eklenmez. Motor status’u credential’ın
yalnız güvenli durumunu döndürür.

---

## Test stratejisi

Yeşil test sayısı tek başına entegrasyon kanıtı değildir. Geçmişte 8.308 yeşil
doğrulama varken yeni motor yanlışlıkla `codex` adapter’ına gidiyor, doğru Bridge
handler’ı dosyanın ilerisindeki eski kayıt tarafından eziliyor ve proje oturum
sayısı iki ayrı değer veriyordu. Test piramidi davranışı çalıştırmalıdır.

### Saf adapter testleri

Yeni `test/test_<motor>.js` en az şunları gerçek derlenmiş fonksiyonlarla sınar:

- headless, hosted, TUI ve resume argv;
- prompt channel ve shell seçimi;
- cwd/system-context/image davranışı;
- model/effort/permission eşlemesi;
- ham olay → kanonik protokol;
- tool ve hata akışı;
- kullanım semantiği;
- transcript parse ve gerçek id;
- status/auth/readiness matrisi;
- model kataloğu/normalizasyon/fallback;
- usage/kota unknown/not-published durumları.

### Negatif testler

Şunlar özellikle kırılmalıdır:

- Yeni id’yi başka motor adapter’ına gönderme.
- Bilinmeyen dolu engine id’sini Claude’a düşürme.
- Desteklenmeyen effort/permission/resume’ı sessizce atma.
- Auth dosyası var diye CLI yokken ready olma.
- Exit 0 içindeki error zarfını başarı sayma.
- Kümülatif usage’ı her tur yeniden yazma veya süreç toplamından delta çıkarma.
- Tur/süreç/konuşma toplamını `contextAfter()` ile “ctx now” sayma.
- Context bilinmiyorken session token toplamını fallback gösterme.
- Model kataloğundaki üst sınırla motorun raporladığı etkin pencereyi ezme.
- Compaction sonrası context düşüşünü negatif/kayıp sayıp eski yüksek değere kilitleme.
- Cached/reasoning token’ı iki kez sayma.
- Transcript filename’ını session id sayma.
- Okunamayan transcriptte sahte `file`, `0 token` veya “henüz” mesajı.
- Duplicate Bridge op’un son yazanı kazanması.
- Template/workflow/schedule/trigger’ın engine’i kaybetmesi.
- Resume edilen konuşmanın eski kullanımını yeni task’a faturalama.
- Dış motor kaydı varken Sessions/latest/project count’un Claude-only kalması.
- Dar analitiğin dış motorları sıfırla ortalamaya katması.

### Çapraz motor kabul testleri

Mevcut paketler genişletilir:

- `test/test_engine_parity.js` — host/webview sözlüğü, kayıt/ölçüm havuzları,
  Turns/export, proje/ajan/farm status/liveness/OTLP paritesi.
- `test/test_four_engine_acceptance.js` — adı artık tarihî olsa da çok-motor
  invariants: exhaustive routing, duplicate registry, yazma-anı validasyonu,
  RunDimensions round-trip, billing ayrımı, built-in/profile ayrımı.
- `test/test_run_surface.js` — bütün start yolları, default/inheritance,
  readiness/refusal, continue latest ve terminal capability.
- `test/test_session_identity.js` — `byId`/`byFile`, gerçek kimlik, geçici→gerçek
  uzlaşma ve kayıt/ölçüm ayrımı.
- `test/test_models.js`, `test/test_engine_usage.js`,
  `test/test_task_resume.js`, `test/test_engines.js` — yeni motor satırları.
- `test/test_constitution_sync.js`, `test/test_codex_sync.js` ve Bridge sync
  dispatch’i — yeni motorun instruction/MCP hattı ve non-destructive drift davranışı.
- İlgili webview davranış testleri ve gerçek Bridge dispatch testleri.

Yeni beşinci motor geldiğinde test adları topluca yeniden adlandırılmak zorunda
değildir; fakat fixture ve id listeleri beşinci motoru gerçekten içermelidir.
“Dört motor” yorumları artık invariant’ı yanlış anlatıyorsa güncellenir.

### Gerçek iki turlu smoke testi

`test/smoke_<motor>_console.mjs` otomatik `npm test` dışında tutulur; gerçek
hesap/tur harcar. Test gerçek `ConsoleHost` üzerinden şunları yapar:

1. Geçici çalışma klasörü ve zararsız bir dosya oluşturur.
2. İlk turda benzersiz nonce verir ve dosyayı okutur.
3. Konuşmanın gerçek id’sini alır.
4. İlk process gerçekten serbest kalınca ikinci turu aynı id ile başlatır.
5. İkinci turda nonce ve dosya içeriğini sorar; bağlamın taşındığını doğrular.
6. Çok satırlı, Türkçe ve shell metakarakterli prompt kullanır.
7. Token/usage’ın pozitif ve motor semantiğine uygun olduğunu doğrular.
8. Ham son-çağrı context örneği ile Console/Session/Bridge `contextTokens` değerini;
   runtime pencere alanı varsa `contextWindowTokens` değerini karşılaştırır. Session ve
   turn toplamlarının pencereyi aşabilmesi ctx testinin başarısı sayılmaz.
9. Araçlı turda birden fazla model çağrısı üretir; turn toplamının ctx’ye yazılmadığını,
   compaction varsa ctx düşüşünün korunduğunu doğrular.
10. Motor fiyat yayınlamıyorsa uydurma dolar olmadığını doğrular.
11. Oturumu kapatır ve çocuk süreç/lock bırakmadığını doğrular.

Terminal resume destekleniyorsa ayrıca gerçek TUI resume smoke’u yapılır. Task
resume destekleniyorsa `TaskManager` yolunda aynı id ve yeni-run delta’sı ölçülür.

### Çalıştırma sırası

```powershell
node test/test_encoding.js
npm run compile
node test/test_<motor>.js
node test/test_engine_parity.js
node test/test_four_engine_acceptance.js
node test/test_run_surface.js
node test/test_session_identity.js
node test/test_models.js
node test/test_engine_usage.js
node test/test_task_resume.js
node test/test_engines.js
npm test
```

Test runner bazı dosyaları derlenmiş çıktı üzerinden çalıştırır. Bu yüzden önce
compile, sonra hedef test, sonra tam paket sırası korunur. Kaynakta bir kelimenin
bulunmasına dayanan test ancak wiring nöbetçisi olabilir; davranış kabul testi
olamaz.

---

## Mevcut dosya sahiplik haritası

Bu tablo gelecekteki taramanın başlangıcıdır; çağrı zinciri yine okunur.

| Konu | Tek kaynak / ana tüketiciler |
|---|---|
| Motor id, status, auth, ready, host label | `src/core/engines.ts` |
| Transport/capability ve dispatch | `src/core/consoleEngine.ts` |
| Motor argv sözlüğü | `src/core/<motor>.ts` |
| Ham protokol çevirisi | `src/core/<motor>proto.ts` |
| Hosted süreç, decoder, lifecycle | `src/core/consolehost.ts` |
| Terminal argv/preview | `src/core/launch.ts`, `src/extension.ts` |
| Gerçek sağlık turu | `src/core/engineTest.ts` |
| Model/effort kataloğu | `src/core/models.ts` |
| Ajan+motor varsayılanları | `src/core/agentDefaults.ts`, settings paneli |
| Talimat/anayasa/duty uyumluluğu | `src/core/antigravity.ts`, `src/core/codex.ts`, sync komutları |
| MCP format dönüşümü | motor hattı, `.mcp.json` kaynağı ve ilgili sync testleri |
| Plan/kota durumu | `src/core/engineUsage.ts` |
| Dış transcript adapter’ları | `src/core/cliTranscripts.ts` |
| Session Viewer parser’ı | `src/core/cliViewer.ts` |
| Kayıt/ölçüm havuzları ve resolver | `src/core/sessions.ts` |
| Dış source dedupe/live source | `src/core/sessionSource.ts`, `src/core/live.ts` |
| Resume/rehydration | `src/core/consoleresume.ts`, `src/extension.ts` |
| Görev ve ortak run boyutları | `src/core/tasks.ts` |
| Trigger/mission yürütme | `src/core/triggers.ts`, `src/core/missions.ts` |
| Bridge model ve registry | `src/core/bridge.ts`, `src/extension.ts` |
| Filo durum/health/report | `src/core/farmstatus.ts`, `src/core/health.ts`, `src/core/report.ts` |
| Host başlatma/komut kayıtları | `src/extension.ts`, `src/views/*.ts` |
| Sessions/Turns/Search/Viewer/Timeline | `src/panels/*`, `media/*` ilgili sayfalar |
| Motor rozeti/etiketi | `media/afEngine.js` |
| Motor renk paleti | `media/common.css` |
| Settings enum/açıklamalar | `package.json`, `src/panels/settingsPanel.ts`, `media/settings.js` |
| Modelden konuşmacı adı | `src/core/speaker.ts` |
| Ürün anlatımı | `README.md`, `CHANGELOG.md`, `docs/BLUEPRINT.*`, `docs/MOTORLAR-TASARIM.tr.md` |

`src/extension.ts` büyük bir composition root’tur. Orada literal motor adı,
Bridge `describe`, quick pick, session lookup ve report/export yolları özellikle
aranır. Bir yardımcı doğru yazılmış olsa bile ilerideki duplicate registry veya
eski inline lookup runtime’da onu gölgeleyebilir.

---

## Tarihten kanıtlanmış hata desenleri

Bu maddeler teorik uyarı değil; Claude → Codex → Antigravity → Gemini uyarlaması
sırasında ürün üzerinde yaşanmış hata sınıflarıdır.

### “Auth dosyası var, demek motor çalışıyor”

Codex giriş grant’i diskteyken CLI PATH’te değildi. Daha sonra CLI ve login doğru
olduğu hâlde gerçek tur ağ/antivirüs seviyesinde engellendi. Sonuç: status dört
soruyu ayrı tutar — kurulu mu, nasıl ödeniyor, giriş var mı, gerçek test çalıştı mı?

### “JSONL ise alanları dokümandan alırız”

Canlı Codex akışı dokümanda varsayılan usage alanlarından farklı çıktı. Ayrıca
`turn.completed` süreç gerçekten ölmeden ve thread lock bırakılmadan geldi. Sonuç:
ham olay ve process lifetime ölçülmeden adapter yazılmaz; tur per-turn motorda
process exit’te serbest kalır.

### “Süreç hazır olunca ilk prompt’u yollarız”

Claude’ın hosted süreci ilk stdin satırını almadan hiçbir ready olayı yayınlamadı;
ilk mesajı ready işaretini bekleyen kuyruğa koymak sonsuz deadlock üretti. Başka
bir motorda bunun tersi mümkün olabilir. Sonuç: startup handshake gerçek süreçte
ölçülür; ilk prompt ve ready sırası varsayılmaz.

### “Tur başına çalışan motorlar aynı taşıma yolunu paylaşır”

Antigravity prompt’u argv’den, Codex stdin’den alıyordu. `agy models` stdin
kapanmadan asılı kalıyordu. Gemini’nin hiç adapter’ı yokken `agy değilse codex`
dalı onu Codex’e gönderiyordu. Sonuç: prompt kanalı ve shell transport alanıdır;
dispatch exhaustive’dır.

### “Token alanlarının adları benziyor, hesabı da aynıdır”

Codex usage konuşma boyunca kümülatif; Gemini süreç başına; Antigravity sonuç
usage’ı step toplamını tekrar ediyor. Cache input’a bazı motorlarda dahil, bazısında
değil; reasoning output’a bazı motorlarda dahil, bazısında ayrık. Sonuç: motor
başına fixture ve iki tur hesabı; ortak isim ortak semantik sayılmaz.

### “Turun harcadığı token, turun sonunda pencerede duran tokendir”

Bir ajan turu araç kullanırken aynı bağlamla birçok model çağrısı yapabilir. Codex’te
ölçülmüş bir tur `total_token_usage.total_tokens = 5.414.907` harcarken aynı anda
`last_token_usage.total_tokens = 220.471` ve `model_context_window = 258.400`
raporladı. Toplam usage’ı kanonik assistant usage’a çevirip ortak reducer’da
`contextAfter()` çalıştırmak Console’a **5,4M ctx** yazdı; Session parser’ı aynı
rollout’un doğru `last_token_usage` alanını okuduğu için iki yüzey çelişti. Gemini’nin
process stats’ı da çok çağrılı bir turun toplamıdır; tek çağrı kaynağı ayrıca
kanıtlanmadan ctx sayılamaz. Sonuç: harcama usage’ı ve context örneği kanonik
protokolde ayrı taşınır; gerçek son-çağrı alanı yoksa ctx `unknown` kalır.

### “Dosyanın adı session id’dir”

Claude’da çoğu zaman doğru görünen basename yöntemi Codex rollout ve Gemini chat
dosyalarında yanlış id üretti. Origin, terminal focus, resume baseline ve viewer
eşleşmeleri sessizce koptu. Sonuç: gerçek id içerikten okunur; bütün lookup’lar
`byId`/`byFile` üzerinden geçer.

### “Sessions listesi genişledi; ürün artık çok motorlu”

Sessions tablosu genişlerken Turns detay/export, ağaç sayacı, proje latest,
ajan sayfası, shelf, Farm Status, track ve Bridge okumaları Claude-only kaldı.
Sonuç: satır kaynağı ile onun arkasındaki open/detail/export/action lookup’ı aynı
havuzdan denetlenir; bütün okuma yüzeyleri ayrı kabul satırıdır.

### “Her yere geniş havuzu verirsek biter”

Yabancı transcriptlerde hesaplanamayan sıfırlar cost/health ortalamalarını bozdu.
Sonuç: kayıt ve ölçüm havuzu ayrılır; dar ölçüm sessiz değil, scope cümleli olur.

### “Motor fiyat yazmıyorsa abonelikte ve bedavadır”

Codex ve Gemini hem plan hem key ile çalışabilir; CLI’ın fiyat yayınlamaması ödeme
düzeni hakkında hiçbir şey söylemez. Sonuç: capability, cost source ve auth/billing
üç ayrı alan.

### “Doğru Bridge handler kaynakta var”

`triggers.add`, `templates.add` ve `templates.list` dosyanın ilerisindeki eski
ikinci kayıtlarla runtime’da ezildi. Kaynak arama testleri yeşildi. Sonuç: duplicate
op registry’de throw eder; gerçek dispatch testi ve `farm.ops` kontrolü yapılır.

### “Task motoru taşıyor; otomasyonlar da taşır”

Schedule/trigger/template/workflow/mission bazı boyutları düşürüp tekrar Claude’a
döndü. Sonuç: “henüz doğmamış task” olan her mekanizma ortak `RunDimensions` taşır;
form, store, Bridge ve üretilen task round-trip test edilir.

### “Dış motor hook vermiyorsa Live’da görünemez”

Agent Farm’ın kendi açtığı dış terminaller çalışırken hiçbir lane üretmiyordu.
Sonuç: launcher geçici kimlikle lifecycle açar; transcript gerçek id verince aynı
kaydı yerinde uzlaştırır.

### “Live Timeline swim lane ve işaret tıklamasını yalnız Claude için düşünmek (X-41 ihmali)”

Claude hook payload’unda her olay doğrudan `transcript_path` taşırken, diğer
motorlar Live/Timeline sayfasına Console aynasından (`mirrorConsoleToLive`)
thread id ve cwd ile gelir; olayların üzerinde dosya yolu bulunmaz. Host
(`src/panels/timeline.ts` `buildData`) birleşiminde
`transcriptPath: s.transcriptPath || row?.file` yapılmadığında ve webview
tarafında (`media/timeline.js`) araç çubukları ile işaretlere kulvarın dosyası
(`fileOf(f) => f || lane.file`) aktarılmadığında, Claude dışındaki bütün
motorlarda Timeline çizgisine ve işaretlerine tıklamak sessizce hiçbir şey
yapmaz (`data-file=""`). Çözüm: hook payload’unda dosya yolu yoksa
`SessionIndex` (`allWithExternal()`) kaydındaki dosya yolu kulvara ve
işaretlerine verilir; kayıt henüz taranmadıysa ölü link yerine link çizilmez.

### “entrypoint: 'sdk-cli' var mı diye bakmak headless tespiti için yeterlidir (Claude varsayımı tuzağı)”

Claude Code CLI, headless çalıştığında transcript dosyasına `entrypoint: "sdk-cli"` yazar; interactive çalıştığında `entrypoint: "cli"` yazar. Antigravity (`agy`), OpenCode, Codex ve Gemini gibi diğer motorların log/transcript formatlarında `entrypoint` alanı hiç yoktur.

Headless tespitini (`sessionHeadless`) yalnızca `entrypoint.startsWith('sdk')` kontrolüne bağlamak, yabancı motorlarda çalışan bütün headless görevlerin (task/schedule/trigger/mission) oturumlar tablosunda `🤖` (Otomatik) görünürken `🌙` (Başsız) rozetini kaybetmesine neden olur.

Sonuç: Agent Farm'ın başlattığı her görev `LaunchBinding` ve `launchedBy` üzerinde `mode: 'headless' | 'interactive'` kaydını taşır; `sessionHeadless` fonksiyonu launcher kaydını motor ayırt etmeksizin değerlendirir. Yalnızca kayıt bulunmayan dış oturumlarda `entrypoint` fallback'i çalışır.

### “Yeşil test paketi entegrasyonun kanıtıdır”

8.308 yeşil kontrolle birlikte 23 doğrulanmış çok-motor açığı vardı. Çoğu test
kelimenin kaynakta varlığını kanıtlıyor, doğru fonksiyonu çalıştırmıyordu. Sonuç:
adapter, registry, resolver, round-trip ve gerçek iki turlu smoke davranış testidir;
regex wiring testi yalnız ek nöbetçidir.

### “String(chunk) yeterlidir”

UTF-8 Türkçe karakter byte chunk sınırında ikiye bölündüğünde çıktı bozuldu.
Sonuç: stateful decoder ve her split-point testi.

### “Aynı klasörde çalıştı, demek aynı ajan”

Codex parent `AGENTS.md` dosyalarını birleştirirken Antigravity workspace üstüne
hiç çıkmıyordu; ilk uyumluluk yolu yanlış adrese dosya yazdığı için kurallar
motora ulaşmıyordu. Ortak anayasayı her agent dosyasına körlemesine kopyalamak da
Codex’te aynı metni iki kez yükleyip boyut tavanını tüketirdi. Sonuç: talimat
keşfi, parent walk, merge sırası ve tavan motor üzerinde ölçülür; anayasa tam bir
kez gelir ve gerçek kimlik turuyla kanıtlanır.

### “MCP dosyası ortak, motor da okur”

Claude JSON `.mcp.json`, Codex TOML tabloları, Antigravity başka global JSON yolu
kullanıyordu. Aynı server’ın env ve HTTP header biçimleri de farklıydı. Sonuç:
MCP config formatı/scope/quoting ayrı adapter’dır; global kullanıcı config’i
onaysız yazılmaz, gerekirse merge-ready suggestion üretilir.

### “Dosyayı düzenledim; arama her yeri bulur”

Literal NUL içeren kaynakları ripgrep binary sayıp satırları sessizce atladı.
Sonuç: `test/test_encoding.js` başta ve sonda çalışır; PowerShell ile repo dosyası
yeniden yazılmaz; C0/NUL kontrolü release kapısıdır.

### Derin inceleme gerektiğinde kanıt izi

Bu SOP özetlenmiş sonuçtur. Bir motor aynı sınıflardan birinde beklenmedik davranırsa
ham karar ve ölçüm izleri şu kaynaklarda bulunur:

- Agent Farm oturum aramasında başlığı **“Codex artik eklentinin her yerinde…”**
  ile başlayan seri: `1a4ee4b4-62f7-4435-93ee-a6110a246e48`,
  `8842eaba-ab52-413e-96ac-5608bd6f8369`,
  `d09d781d-62a4-4954-9e6c-0bfc9b1f3a04`.
- Antigravity entegrasyonunun ölçüm oturumu:
  `4d361981-740c-46f7-b469-9e3223682905`.
- Başlığı **“MULTI-MOTOR ADAPTASYONU…”** ile başlayan denetim/tamamlama serisi:
  `38de7845-c46d-4f3b-bef7-aac0119a249b`,
  `a9b5b11a-a4bb-4a04-b9bc-e33217ac5e33`,
  `019ff669-dde7-7150-b79d-6d75c8a98d1c`,
  `353fec5e-5793-43e8-a5f0-fc5963e33b60`,
  `019ff6d2-26cf-7040-9664-6916ec0c5732`,
  `019ff722-3fc4-7bb3-9b11-ca9121f15347`,
  `ad08e941-ce9b-45f0-ab69-f3b1e5386042`.
- Git ölçüm/uyarlama omurgası: `9a04e85` (Codex protokol ölçümü), `24c46ba`
  (Codex Console), `38c6192` (motor ekseni bütün çalışma kapıları), `b4a9a40`
  (Antigravity), `1644d5f` (model/stdin ve kalan yüzeyler), `b85b0bc`
  (UTF-8 chunk), `220f6be` (X-35 yüzey kapanışı), `4baa074` (23 bulgunun
  doğrulanıp tamamlanması ve Gemini transportu).
- `docs/X-35-DEVIR.md`, ilgili `CHANGELOG.md` gövdeleri ve proje Worklog’unun
  2026-08-09—2026-08-13 motor kayıtları.

Bu kaynaklar yeni motora kopyalanacak reçeteler değil, SOP’deki kapıların neden
var olduğunun ham kanıtıdır. Güncel CLI davranışı yine yeniden ölçülür.

---

## Arıza halinde davranış ve geri kazanım

| Arıza | Doğru davranış |
|---|---|
| CLI bulunamadı | Status’a install command/hint; motor listede kalır; spawn reddedilir |
| Auth yok | Gerçek login/key yolu; secret değeri gösterilmez; spawn reddedilir |
| Auth+CLI var, gerçek test yok | “Ready” statik durumu ile son test verdict’i ayrı; çalışma iddiası yapılmaz |
| Gerçek call engelli | Ham hata sterilize edilip kaydedilir; adapter varsayımla tamamlanmaz |
| Help ile runtime çelişiyor | Runtime + kurulu kaynak esas alınır; sürüm/tarih belgelenir |
| Model kataloğu asılıyor | stdin EOF, timeout ve shell ölçülür; son iyi cache/fallback kaynağı görünür |
| Transcript yok/okunamıyor | Metadata source veya hosted kopya; sahte file/token yok; açık gerekçe |
| Usage alanı bilinmiyor | `unknown/not-published`; dolar/token sıfırı uydurulmaz |
| Resume ölçülmedi | Resume eylemi reddedilir; sessiz yeni konuşma yok |
| Konuşma canlı sahipli | İkinci yazar açılmaz; focus veya güvenli handoff sunulur |
| Unsupported effort/permission | Formda sunulmaz, Bridge/store sınırında reddedilir |
| Yeni motor eski motoru bozdu | Küçük değişiklik geri alınır; mevcut motor baselines yeniden çalıştırılır |
| UI fixture yok | Önce gerçek veri dağılımlı fixture eklenir; görsel kabul ertelenir |
| Bridge paritesi belirsiz | `farm.ops` + command/panel message envanteri; kullanıcı eylemi op olmadan sevk edilmez |

Belirsizlik davranışı veya mimariyi değiştiriyorsa kullanıcıya sorulur. Özellikle
motoru başka motor adı altında birleştirmek, mevcut data shape’i değiştirmek,
resume yerine yeni konuşma açmak, analitik kapsamını genişletmek veya fiyat
varsaymak sessiz karar değildir.

---

## Son denetim taraması

Uygulama bitti sanıldığında ilk keşif taraması yeniden çalıştırılır. Ayrıca:

```powershell
$AfEngineId = 'yeni-motor-id'

# Yeni motorun bütün typed/exhaustive kaynaklara girdiğini gör.
rg -n $AfEngineId src media test package.json README.md docs
rg -n "Record<EngineId|EngineId\[\]|Partial<Record<EngineId|as EngineId" src test

# Eski iki-dallı varsayımları ve literal listeleri yeniden ara.
rg -n "else.*codex|else.*claude|=== 'claude'|!== 'claude'|=== 'codex'|!== 'codex'" src media test
rg -n "claude.*codex|codex.*gemini|gemini.*agy|\['claude'|\"claude\"" src media test package.json

# Kayıt/ölçüm havuzlarını ve filename-id varsayımlarını yeniden ara.
rg -n "index\.all\(|index\.forAgent\(|allWithExternal|forAgentWithExternal|byId\(|byFile\(" src test
rg -n "basename\(.*session|replace\(/\\\.jsonl|sessionId.*basename|basename.*sessionId" src test

# Bütün run kapıları ve Bridge açıklamaları.
rg -n "start|launch|spawn|resume|continue|RunDimensions|engine" src/core src/panels src/views media
rg -n "op: '|describe:" src/extension.ts src/core/bridge.ts

# Encoding ve çalışma ağacı.
node test/test_encoding.js
git diff --check
git status --short
git ls-files --others --exclude-standard
```

Her kalan `=== 'claude'` hata değildir: persistent protokole veya gerçekten
Claude-only ölçüme ait olabilir. Fakat her biri yanında neden motor-özel kaldığını
kanıtlamalıdır. Her `else codex/claude` ise yanlış adapter ihtimali olarak önce
şüphelidir.

---

## Sürüm, paket, kurulum ve kayıt

Davranış ekleyen gerçek motor entegrasyonu release’tir:

1. `package.json` sürümü artırılır; settings enum/description/help metinleri
   güncellenir.
2. `CHANGELOG.md` kullanıcı gözünden yeni motoru ve dürüst sınırlarını yazar.
3. `README.md`, `docs/BLUEPRINT.tr.md`/gerekirse İngilizce eş, ve
   `docs/MOTORLAR-TASARIM.tr.md` güncellenir. Ölçülen CLI sürümü, özel farklar ve
   gerçek smoke kanıtı kalıcıdır.
4. Gerekli release notu ve test sayısı hazırlanır.
5. Tam testten sonra yalnız şu komutla paketlenir:

```powershell
npm run package
code --install-extension dist/vsix/agent-farm-<sürüm>.vsix --force
```

6. Kurulu klasörün varlığına bakılmaz. `%USERPROFILE%\.vscode\extensions\extensions.json`
   içinde `muvusoft.agent-farm` için gerçekten servis edilen `version` okunur.
7. VSIX, kod, test ve belgeler aynı işin tek commit’ine girer.
8. Proje Worklog’una sürüm, motor/CLI sürümü, test sayısı, gerçek smoke sonucu,
   görsel inceleme, paket/kurulum kanıtı ve dürüst açık sınır yazılır.
9. Commit başlığı depo kuralına göre son global sayaç + 1 ile
   `v#.# - <küçük harf özet>` biçimindedir; gövde kullanıcıya verilecek sonuç
   özetidir.
10. Commit sonrası `git status --short` ve untracked audit temizdir.

Gerçek motor smoke’u hesap/ağ engeli yüzünden yapılamadıysa bu açık hem Worklog’da
hem kullanıcı yanıtında yazılır; motor “tam” ilan edilmez. Paket kurulu olsa bile
bu kapı kapanmış sayılmaz.

---

## Kopyalanabilir tamamlanma listesi

Aşağıdaki liste entegrasyon kalemine kopyalanır ve kanıt bağlantılarıyla kapanır.

### Kimlik ve ölçüm

- [ ] Birinci sınıf motor / CLI profili kararı verildi.
- [ ] Doğru motor adı, id, executable ve kesin CLI sürümü kaydedildi.
- [ ] Kurulum, auth, key/plan ve readiness durumları ayrı ölçüldü.
- [ ] Help + kurulu kaynak + gerçek turla komut sözlüğü doğrulandı.
- [ ] Persistent/per-turn süreç şekli ve gerçek bitiş anı ölçüldü.
- [ ] Prompt/stdin/argv/shell/cwd/system-context sözleşmesi ölçüldü.
- [ ] Model, effort, izin, attachment ve output-contract yetenekleri ölçüldü.
- [ ] Session id, resume, live ownership ve reload davranışı ölçüldü.
- [ ] Protokol olayları, UTF-8 ve hata zarfı ölçüldü.
- [ ] Token/cache/reasoning/cost/kota semantiği ve usage kapsamı (`perCall` /
  `turnAggregate` / `processAggregate` / `conversationCumulative`) ölçüldü.
- [ ] Session harcaması, turn harcaması, son-çağrı `contextTokens` ve etkin
  `contextWindowTokens` dört ayrı ham kanıtla ölçüldü; source/freshness kararı yazıldı.
- [ ] Transcript/index yolu, gerçek id ve okunabilirlik ölçüldü.
- [ ] Talimat keşfi, parent walk, merge sırası ve boyut tavanı ölçüldü.
- [ ] Ortak anayasa, agent identity, memory/duty/skill ve MCP yolları ölçüldü.

### Çekirdek uygulama

- [ ] `EngineId` ve status spec eklendi; dört statik durum testli.
- [ ] `EngineTransport` capability’leri ölçümü doğru ifade ediyor.
- [ ] Motor argv adapter’ı ayrı dosyada ve bütün dispatch’ler exhaustive.
- [ ] Protokol adapter’ı stateful, UTF-8 güvenli ve fixture testli.
- [ ] ConsoleHost doğru process/prompt/parser/exit yaşam döngüsüne bağlı.
- [ ] Terminal TUI/ilk prompt/resume yolu ayrı doğrulandı.
- [ ] Gerçek, kullanıcı-tetikli health testi eklendi.
- [ ] Model kataloğu, effort ve ajan+motor varsayılanları eklendi.
- [ ] Talimat/anayasa sync hattı non-destructive marker/fingerprint ile eklendi
  veya mevcut ortak yolun yeterli olduğu kanıtlandı.
- [ ] Memory/duty/skill/MCP uyumluluğu ve gerçek ajan kimliği turu eklendi.
- [ ] Usage/kota ve billing/cost source ayrımı eklendi.
- [ ] Harcama usage’ı ile `ContextSample` ayrıldı; toplu usage’dan ctx fallback’i yok.
- [ ] Son-çağrı ctx stream’de yoksa sınırlı/cache’li transcript probe’u eklendi veya
  UI/Bridge dürüstçe unknown gösteriyor.
- [ ] Transcript/source/viewer parser ve gerçek kimlik resolver’ları eklendi.
- [ ] Live geçici kimlik → gerçek kimlik uzlaşması, sahiplik güvenliği ve Timeline swim lane/işaret tıklaması için transcript dosya yolu çözümlemesi (hook payload yoksa SessionIndex kaydından tamamlama) eklendi.

### Çalıştırma kapıları

- [ ] Console composer.
- [ ] Start Session / ajan ve proje satırları.
- [ ] Full launcher ve launch profiles.
- [ ] Resume / Continue latest.
- [ ] Task headless ve interactive.
- [ ] Schedule ve edit/run-now.
- [ ] Trigger ve edit/fire.
- [ ] Template save/run.
- [ ] Workflow step add/edit/run.
- [ ] Mission default ve member override.
- [ ] Bridge ve arka plan TaskManager çağrıları.
- [ ] Bütün `RunDimensions` ile task-specific limit/resume alanları round-trip.

### Okuma ve yönetim yüzeyleri

- [ ] Engines.
- [ ] Console list/card/history; session total, turn total, ctx now ve pencere kapasitesi
  aynı sayıymış gibi gösterilmiyor; source/freshness erişilebilir.
- [ ] Sessions + filtre + open/action.
- [ ] Turns + detail + export.
- [ ] Session Viewer.
- [ ] Search.
- [ ] Timeline / Live (swim lane, tool bar ve mark tıklamaları doğru transcript dosyası ve satırını açıyor; taranmamışsa ölü link yok).
- [ ] Dashboard.
- [ ] Agent detail ve Portfolio.
- [ ] Project page/tree/work/timeline.
- [ ] Farm Status ve status bar.
- [ ] Shelf/pin/tag/rename.
- [ ] Tasks/Runs archive ve Missions.
- [ ] Reports/health/exports/OTLP.
- [ ] Bridge read ops.
- [ ] Her dar analitik görünür scope açıklaması taşıyor.

### UI ve Bridge

- [ ] `afEngine.js`, `common.css`, host labels ve parity testleri güncel.
- [ ] Unknown motor nötr ve görünür.
- [ ] Capability’siz kontrol gizli/devre dışı/açıklamalı; no-op yok.
- [ ] Koyu/açık 1400, 900 ve 650 px renderlar gözle incelendi.
- [ ] UI ve Bridge aynı servis/validasyon/sonuç sözleşmesini kullanıyor.
- [ ] Duplicate op koruması ve gerçek dispatch testleri geçti.
- [ ] `farm.ops` güncel describe/args döndürüyor.

### Kanıt ve teslim

- [ ] Hedef adapter/negatif/parity/round-trip testleri geçti.
- [ ] Gerçek iki turlu Console smoke aynı id ve bağlamı kanıtladı.
- [ ] Çok çağrılı araç turunda ham son-çağrı ctx = Console = Session Viewer = Bridge;
  session/turn toplamı ayrı kaldı ve compaction düşüşü doğru işlendi.
- [ ] Destekleniyorsa terminal ve task resume gerçek smoke’u geçti.
- [ ] `npm test` temiz; encoding ve `git diff --check` temiz.
- [ ] CHANGELOG, Motorlar tasarımı, Blueprint/README gerekli ölçüde güncel.
- [ ] Sürüm artırıldı; `npm run package` ile VSIX üretildi.
- [ ] VSIX `--force` kuruldu ve `extensions.json` sürümü doğrulandı.
- [ ] Worklog gerçek kanıt ve açık sınırlarla güncellendi.
- [ ] Tek commit atıldı; tracked/untracked çalışma ağacı temiz.

Bir kutu işaretlenemiyorsa yanına “neden” ve gereken karar/engel yazılır. Kutuyu
silmek veya kapsam dışı saymak tamamlanma yöntemi değildir.

### Motora özgü gerçek smoke — çalıştırılabilir dosya, liste değil

Yukarıdaki genel matris her motor için aynıdır. Motorun **kendi** kabul seti
ayrıca ve **koşulabilir bir dosya** olarak yazılır; belgeye yazılmış bir liste
kimsenin koşmadığı bir listedir.

| motor | dosya |
|---|---|
| Codex | `test/smoke_codex_console.mjs` |
| Antigravity | `test/smoke_agy_console.mjs` |
| OpenCode | `test/smoke_opencode_console.mjs` |

OpenCode'unki (X-40) yedi şeyi bu sırayla kanıtlıyor ve hepsi **canlı ikili**
üzerinde geçti: taze turda nonce · aynı `ses_` kimliğiyle ikinci turda hatırlama
· iki kart tek süreç altında ayrı konuşmalar · çalışan turda `session/cancel`
sonrası konuşmanın sağ kalması · CLI'ın kendi oluşturduğu oturumun ACP ile
yüklenip devam ettirilmesi · paylaşılan runtime öldürüldükten sonra kartların
aynı konuşmayla dönmesi · ve bunların hiçbirinin para harcamaması.

Üç kural, motor ne olursa olsun:

1. **Model çalışma anında seçilir.** Bağlı sağlayıcının `*-free` listesinden ilk
   uygun olan alınır; hiç yoksa set **koşmaz ve bunu söyler** (`exit 2`), ücretli
   bir modele düşmez. Sessizce fatura çıkaran bir smoke setini kimse iki kez
   koşmaz.
2. **Yalnız kendi yaptığını yok eder.** Oturumlar TEMP altındaki tek kullanımlık
   bir klasörde açılır ve yalnız o çalıştırmanın kendi `ses_` kimlikleri
   kapatılır. Kullanıcının oturumları, auth/config/provider dosyaları ve açık
   TUI'si asla okunmaz, yazılmaz, öldürülmez.
3. **Süreç adına göre öldürme yoktur.** “Runtime çöktü” durumu, host'un **kendi**
   sahip olduğu runtime yeniden başlatılarak üretilir. `opencode.exe` adını
   arayıp öldürmek, kullanıcının kendi TUI'sini öldürmek demek olabilir — bu
   setin asla yapmaması gereken tek şey.
