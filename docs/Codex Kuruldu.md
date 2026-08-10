# Eklentide Codex kullanmak — 3.102.0 kullanıcı kılavuzu

> Bu rapor tek soruyu cevaplar: **"Artık ne yapabiliyorum ve nereye basıyorum?"**
> Sürüm 3.102.0 ile Codex artık eklentinin **her yerinde** kullanılabiliyor.
> Aşağıdaki her cümle bu makinede, `codex-cli 0.147.0` ve bir ChatGPT planıyla
> ölçüldü.

---

## 0. Otuz saniyelik özet

| Soru | Cevap |
|---|---|
| Abonelik mi anahtar mı seçmem gerekiyor? | **Hayır.** Girişin CLI'ın kendi dosyasında; anahtar sadece giriş yoksa devreye girer. Ölçüldü: ortamda geçersiz bir `OPENAI_API_KEY` varken bile tur ChatGPT planından koştu. |
| Aynı anda bir ajan Claude, diğeri Codex koşabilir mi? | **Evet.** Aynı pencerede, aynı Console'da, yan yana. Hiçbir sıraya girmiyorlar. |
| Hangisinin koştuğunu nereden görürüm? | Console'daki **ajan kartında mor bir "Codex" rozeti**. Claude rozet takmaz (varsayılan o). |
| En kolay seçim nasıl? | `Farm Settings → launchDefaults → engine` — bir kez ayarla, her yerde varsayılan o olur. |
| Codex'te ücret neden yazmıyor? | Çünkü **yok.** Plana bağlı koşar, token sayar. `$0.00` yazmak yalan olurdu. |

---

## 1. Motor ayarları — Engines sayfası

**`Ctrl+Shift+P → Agent Farm: Open Engines`** (ya da Farm Settings'teki Engines
bölümündeki düğme).

Sayfa motor başına **dört soruyu** cevaplar ve hiçbir satır yalnızca durum
söylemez — her satır bir **eylemle** biter:

1. CLI bu makinede var mı?
2. Bu motor **nasıl** ödeniyor?
3. Şu an giriş yapılmış mı?
4. Yapılmamışsa **tek yapılacak şey** nedir?

### Abonelik mi, anahtar mı? — çakışma yok, seçim de gerekmiyor

Bu, en çok kafa karıştıran nokta olduğu için ayrı yazıyorum.

**Eklenti hiçbir kimlik bilgisini tutmaz, okumaz, taşımaz.** Kimlik CLI'ın kendi
dosyasında durur:

| Motor | Normal ödeme yolu | Kimliğin durduğu yer |
|---|---|---|
| Claude Code | Pro / Max planı | `~/.claude/.credentials.json` → `claudeAiOauth` |
| **Codex** | **ChatGPT Plus / Pro / Team planı** | `~/.codex/auth.json` → `auth_mode: "chatgpt"` |
| Gemini | API anahtarı (Google girişi Haziran 2026'da kapandı) | — |

**Sıralama şudur ve tektir:**

1. CLI'ın kendi girişi varsa → **o kullanılır.** Nokta.
2. Giriş yoksa → kasadaki (`Secrets`) anahtar adı devreye girer.

**‼️ Ölçüldü (2026-08-10):** ortama kasıtlı olarak **geçersiz** bir
`OPENAI_API_KEY` konup bir tur koşturuldu. Tur **sorunsuz tamamlandı** — yani
ChatGPT planı girişi anahtarı **ezdi**. Yani ikisi birlikte dursa bile çakışmıyor,
plan kazanıyor. **Birini silmenize gerek yok.**

Tek istisna, bilerek anahtarla koşmak istemeniz: o zaman `codex logout` ile
girişi kaldırırsınız ve kasadaki anahtar tek yol olur. Engines sayfasındaki satır
o anda `on a key` rozetine döner ve "bu token başına faturalanıyor" der.

### ⚡ Test düğmesi — diskin söyleyemediği tek şey

Yukarıdaki her şey **diskten** okunur, ve disk "giriş yapılmış" derken hiçbir şey
çalışmıyor olabilir. Bu makinede tam olarak bu oldu: `~/.codex/auth.json` canlı
bir ChatGPT grant'i taşırken her tur soket seviyesinde ölüyordu
(`os error 10013` — güvenlik yazılımı).

**⚡ Test** düğmesi **gerçek bir tur** koşar: motorun en küçük modeli, dört
kelimelik prompt, mümkünse read-only kum havuzu.

- **Bir tur harcadığı için kendiliğinden ASLA koşmaz** — zamanlamayla değil, sayfa
  açılınca değil, yenilemede değil. Yalnız düğmeye basınca.
- Sonuç **yaşıyla** gösterilir: dört saat önceki bir onay, dört saniye öncekiyle
  aynı iddia değildir.
- Hata olursa **motorun kendi sözleri** yazılır, uydurulmuş bir sebep değil.

---

## 2. Motoru nerede seçiyorum?

**Altı yerde, hepsi aynı listeden besleniyor.**

### a) Console bestecisi — en çok kullanacağınız yer

Yeni oturum modunda, ajan kutusunun **hemen sağında** bir motor kutusu var:

```
[Choose an agent…] [Codex ▾] [Model ▾] [Effort ▾] [Permissions ▾] [◧ Proje ▾]   [Start session]
```

Kutunun altında, motor Claude değilse, **ne değiştiğini anlatan bir satır**
çıkar. Bunu okumak zorunda değilsiniz ama bir kez okumaya değer (bkz. §4).

**Seçiminiz oturum başlattıktan sonra da kalır.** Proje kutusu her seferinde
sıfırlanır (çünkü her oturum başka bir iş), motor kutusu **sıfırlanmaz** (çünkü
motor "bugün hangi makinede çalışıyorum" sorusudur). Her seferinde yeniden
seçmek zorunda kalmazsınız.

### b) Sol paneldeki ▶ (üçgen)

Ajan satırındaki ▶ artık şunu soruyor:

```
Runs on
  $(server-process) Engine        Claude Code
Filed under
  $(project) Project              ◧ No project
Where it runs
  $(terminal) In a terminal
  $(comment-discussion) In the Console
```

**Engine** satırına basınca motor listesi açılır. Motor satırı **ilk sırada**,
çünkü altındaki her şeyin **ne anlama geldiğine** o karar veriyor.

### c) Tam başlatıcı — `Start Session…`

`$(server-process) Engine` satırı, Model'in **üstünde**. Alt tarafta gösterilen
komut satırı da seçtiğiniz motora göre değişir — yani basmadan önce ne
koşacağını görürsünüz.

### d) Görev / zamanlama / tetikleyici formu

New-task formunda **Engine** kutusu var (Model'in hemen üstünde). Zamanlamalar ve
tetikleyiciler bunu otomatik miras alır — onlar zaten "henüz olmamış görevler".

> Bu, motorun **en çok** önemli olduğu yer: bir görevin başında kimse oturmaz.
> Kurulu olmayan bir motor görünür şekilde patlamaz, saatler sonra açacağınız bir
> arşiv dosyasına "command not found" yazar. Bu yüzden hem form reddediyor hem de
> koşucu **spawn'dan önce bir kez daha** reddediyor.

### e) Misyonlar

- Misyonun kendi `engine`'i → bütün delegasyonlar onunla koşar.
- Ekip üyesi kendi `engine`'ini yazarsa → **onunki kazanır.**
  (Örneğin: yazan ajan Claude'da, gözden geçiren Codex'te.)

**‼️ Planlayıcı (lead) her zaman Claude Code'da kalır.** Bu bir eksik değil, bir
karardır: misyonun bütün denetim akışı `claude -p --output-format json` zarfını
ayrıştırır (karar JSON'u, ücret, turdan tura bağlamı taşıyan oturum kimliği) ve
`--disallowedTools` + `--max-turns` harcar. Bunların hiçbirinin Codex'te
karşılığı **ölçülmedi**, ve bu depo ölçmediği şeyi sevk etmiyor.

### f) Köprü (ajanların kendisi)

`console.start` · `sessions.start` · `tasks.add` · `missions.start` — hepsi
`engine` argümanı alıyor ve koşamayacak motoru **cevabın içinde** reddediyor.

### ‼️ En kolay yol: bir kez ayarlayın

`Farm Settings` → `agentFarm.launchDefaults` → **`engine`**

Buraya `codex` yazarsanız her yerde varsayılan o olur — besteci, ▶, başlatıcı,
görev formu. Boş bırakırsanız `claude` demektir (yani bugüne kadarki davranış
birebir korunur).

---

## 3. Hazır olmayan motor ne oluyor?

**Listeden GİZLENMİYOR.** Gizlemek şu ikisini aynı görünüşe indirirdi:

- "bu sürümde Codex diye bir şey yok"
- "senin Codex'in giriş yapmamış"

Bunun yerine satır **durur, seçilemez** (`disabled`), ve üzerine gelince
**yapılacak tek şey** yazar:

```
Gemini — cannot run here
   Put GEMINI_API_KEY in the vault. This engine has no plan sign-in.
```

Quick pick'te seçmeye kalkarsanız sebebi söyler ve **"Open Engines"** düğmesi
sunar; ret cümlesi **tek bir yerde** yazılı, dolayısıyla panel, quick pick, görev
ve köprü hepsi aynı şeyi söyler.

---

## 4. ‼️ Claude ile Codex aynı şeyin iki yazılışı DEĞİL

Bu, kullanmadan önce bilinmesi gereken tek gerçek fark ve arayüz bunu her yerde
söylüyor. **Bir mesaj kaybederek öğrenmeyin.**

| | **Claude Code** | **Codex** |
|---|---|---|
| Süreç | Oturum boyunca **tek** süreç | **Tur başına bir** süreç |
| Tur ortasında yazdığım mesaj | Turu **yönlendirir** (steering) | Tur bitene kadar **bekletilir** |
| Model / efor kutusu | Canlı kontrol | **Bir sonraki turun bayrağı** |
| İzin modu | Sorar, siz cevaplarsınız | **Önden seçilen kum havuzu** — soracak kimsesi yok |
| "Default" izni ne demek? | "bana sor" | **read-only** (soramayan bir motorun yapabileceği tek dürüst şey) |
| Tur ücreti | Bildirir | **Bildirmez** — planla koşar, token sayar |
| Terminalden devam (`resume`) | Var | **Reddedilir** — `codex resume` ölçülmedi; Console'da devam edilir |

**İzin modu eşlemesi (Codex'te ne olur):**

| Seçtiğiniz | Codex'te olan |
|---|---|
| Default / plan | `read-only` — bakabilir, yazamaz |
| acceptEdits | `workspace-write` — klasör içinde sormadan yazar |
| bypassPermissions | `danger-full-access` — hiçbir kum havuzu yok |
| (tanımadığı bir şey) | `read-only` — yanlış olursa hiçbir şeye mal olmayan okuma |

---

## 5. Arayüzde nereden bakıp anlarım?

### Console ajan kartı — bir bakışta ✅

**Evet, kartta görünüyor.** Kart başlığında, ajan adının hemen yanında **mor
çerçeveli "Codex" rozeti** var:

```
● developer (#019f…)  ⟨Codex⟩            46.2k ⚖46.2k tok
  ikinci motor turu
  a message is held · 1 held · 2 turns · ctx 28.9k · 🚜 Agent Farm
```

- **Claude rozet takmaz.** Varsayılan odur; her satıra rozet koymak, kimsenin
  okumadığı bir rozet demektir. Rozet gördüğünüz an "bu diğeri" demektir.
- Rozet **asla kısalmaz.** (İlk çizimde en yoğun kartta `C…` okunuyordu — yani
  motoru bilmenin en çok önemli olduğu satır, onu söyleyemeyen tek satırdı.
  Düzeltildi: yer artık oturum kimliği bırakıyor.)
- Rozetin üzerine gelince tam cümle çıkar: tur başına süreç olduğu, mesajın
  bekletileceği, ve ücret bildirmediği.

### Bestecinin kendisi

Çalışan bir oturumda rozet ajan adının yanında; **altındaki satır** ne
değiştiğini yazıyor:

> **Codex** One process per turn: a message typed mid-turn is HELD until the turn
> ends, the pickers are the NEXT turn's flags, and the permission mode becomes a
> sandbox chosen up front — this engine cannot stop and ask. It runs on a plan,
> so it counts tokens and states no price.

Model / efor / izin kutularının **tooltip'leri de değişiyor**: Codex'te "canlı
uygulanır" demiyorlar, "bir sonraki tur" diyorlar. İzin kutusu da başlangıç
listesini gösteriyor (canlı listeyi değil), çünkü burada canlı değiştirilecek bir
şey yok.

### Görev arşivi

Headless bir Codex görevinin çıktı dosyasının başında:

```
- Engine: Codex
- Model: gpt-5.6-terra
- Sandbox: read-only — Codex cannot stop and ask, so this turn runs read-only…
```

Ayrıca `outputContract: json` istemişseniz **uygulanmadığını** da orada yazar
(o zarf Claude'un formatı; `codex exec --json` bambaşka bir şey).

---

## 6. Para: neden Codex'te dolar yok?

**`$0.00` daha küçük bir sayı değil, YANLIŞ bir sayıdır.** "Bu tur bedavaydı"
diye okunur. Codex bir planla koşar ve tur için fiyat **söylemez**.

Bu yüzden `reportsCost: false` olan her oturumda dolar yerine **token** yazılıyor
ve **neden** dolar olmadığı söyleniyor:

- Çalışan tur şeridi: `14.3k tokens this turn` — **"~" yok**, çünkü token kesin.
- Oturum satırı: `46.2k tokens · on a plan, no price · this session · 2 turns`
- Kartın hover'ı: `… · Codex runs on a plan — no per-turn price`
- Turu kapatan satır ve transkriptteki sonuç satırı: aynı biçim.
- **Canlı tahmin de yapılmıyor.** Bizim fiyat kartımız Anthropic'in; onu bir
  ChatGPT planının tokenlerine uygulamak iki kez yanlış olurdu.

### Misyon maliyet tavanı — ve neden token tavanı eklendi

Bir misyonda **dişi olan tek sınır** `maxCostUSD`'ydi (tur ve görev sayıları
kaba, dakikalar yalnız yavaş işi keser). Abonelikli bir delege hiç dolar
bildirmediği için o sayaç onun için **hiç kıpırdamıyor**.

Sonuç: Codex delegelerinden kurulu bir misyon, **asla ulaşılamayacak** 5
dolarlık bir tavana karşı bütün plan pencerenizi yakabilirdi. Bu bir tavan değil,
**tavan görüntüsüdür.**

Çözüm: **`maxTokens`** (varsayılan **2.000.000**, `0` = tavan yok).

- İkisi birden denetlenir; **hangisi önce biterse** misyon orada durur.
- Eski misyonlar birebir eskisi gibi davranır (alan yoksa tavan yok).
- **Planlayıcıya da söylenir**: brief'teki bütçe satırı token kalanını yazar.
  Yoksa lead bütün tur boyunca "$5.00 left" görüp hiç harcama yapılmamış gibi
  plan yapardı.

---

## 7. ✅ Aynı anda iki motor koşuyor mu?

**Evet.** Console her oturumu ayrı bir kayıt olarak tutar ve her kaydın **kendi
motoru ve kendi taşıması** vardır. Hiçbir şey onları sıraya sokmaz:

- `developer` ajanı **Claude**'da bir oturumda,
- aynı anda `manager` ajanı **Codex**'te başka bir oturumda,
- hatta **aynı ajanın** iki oturumu iki farklı motorda.

Sol taraftaki kart listesi üçünü de yan yana gösterir; hangisinin hangi motorda
olduğu rozetten okunur, para sütunu birinde dolar birinde token yazar — **aynı
anda, doğru şekilde.**

> Bu, sayfa gerçekten çizilerek doğrulandı (koyu ve açık tema): iki canlı motorun
> aynı ekranda olduğu bir Console fikstürü render edilip fotoğraflandı.

---

## 8. Bilerek yapılmayan / sınırı olan şeyler

Bunları bilmeniz, sonra "neden çalışmıyor" diye aramamanız için:

1. **Misyon planlayıcısı Codex'te koşmaz** (§2e). Delegasyonlar koşar.
2. **Terminalde Codex `resume` edilemez.** `codex resume` kendi alt komutu, kendi
   bayrak dağarcığıyla, ve ölçülmedi. Console'da devam edilir (`codex exec resume`
   — o ölçüldü ve çalışıyor).
3. **Terminal Codex oturumuna proje brief'i gönderilmez.** Çünkü Codex'in
   sistem-prompt kanalı **yok** (ölçüldü: prompt, `AGENTS.md`, config, başka bir
   şey yok). Eklenti bunu sessizce yutmuyor — bir bilgi kutusu "bu oturuma proje
   anlatılmadı, brief gerekiyorsa Console'da başlat" diyor.
   **Console'da ise brief ilk promptun içine çitlenerek biniyor** ve bir kez
   tüketiliyor.
   > Bu bir hata düzeltmesiydi: eskiden proje altında açılan bir Codex oturumu o
   > projeye **fişleniyor**, kartında rozetini gösteriyor ve brief'i **hiç
   > duymamış** oluyordu.
4. **Codex görevlerinde `agentFarm.taskArgs`, model-politikası kuralları ve
   `outputContract: "json"` uygulanmaz.** Üçü de Claude'un dağarcığı. Arşivin
   başlığında yazılı.
5. **`engine` ile `cli` birlikte verilemez** (köprüde reddedilir). CLI profili
   Agent Farm'ın hiç tanımadığı bir ikili için komut şablonudur; motor ise
   eklentinin anladığı bir makinedir (hazırlık denetimi, bayrak dağarcığı, kum
   havuzu çevirisi, faturalama biçimi dahil). İkisini sessizce sıralamak, iki
   argümandan birini sessizce etkisiz kılmak olurdu.

---

## 9. Hızlı başlangıç — üç adım

1. **`Ctrl+Shift+P → Agent Farm: Open Engines`** → Codex satırında **⚡ Test**'e
   basın. Yeşil geliyorsa hazırsınız.
2. **Farm Settings → `agentFarm.launchDefaults.engine`** → çoğunlukla Codex
   kullanacaksanız `codex` yazın. (Yoksa boş bırakın, her seferinde seçersiniz.)
3. **Console'u açın**, ajan seçin, motor kutusundan seçiminizi yapın, yazın.
   Kartta rozeti görün.

---

## Kaynaklar

- Ölçüm ortamı: `codex-cli 0.147.0`, Windows 10, ChatGPT planı, `~/.codex/auth.json` → `auth_mode: chatgpt`
- Codex CLI kimlik doğrulama: https://developers.openai.com/codex/auth
- Claude Code kimlik doğrulama: https://code.claude.com/docs/en/authentication
- Depo içi teknik belge: `docs/MOTORLAR-TASARIM.tr.md` (§5.1.2 ve §5.3)
- Blueprint: `docs/BLUEPRINT.tr.md` → *Motorlar → Birini seçmek — motor ekseni*

---
_developer · 8/10/2026, 1:50:06 PM_



# Model kutusu artık motorun kendisine soruyor — 3.103.0

> Bu rapor iki şeyi anlatır: **S-20'nin ne kadarı kapandı** ve sorduğunuz
> **`agy` (Antigravity)** sorusunun net cevabı. Her cümle bu makinede ölçüldü.

---

## 0. Otuz saniyelik özet

| Soru | Cevap |
|---|---|
| Codex seçince model kutusunda ne yazıyor? | Artık **Codex'in kendi altı modeli**, terminaldeki `/model` ile aynı sırada. Tek bir Claude takma adı bile geçmiyor. |
| Yeni bir model çıkarsa? | **Kendiliğinden gelir.** Liste artık eklentide yazmıyor, motorun kendi kataloğundan okunuyor. |
| Efor kutusu? | O da modelin kendisine sorulmuş oluyor — terra'da altı seviye (`ultra` dahil), 5.5'te dört. |
| Gemini kutusu? | **Değişmedi**, bilerek: o motorun ölçülmüş bir kataloğu yok. |
| `agy` motor olarak eklenebilir mi? | **Evet, en uygun aday o** — ama üç ölçüm yapılmadan değil. Kalem açıldı: **S-21**. |
| Geçen turun raporu? | **Aslında hiç ulaşmamıştı.** Sebebi bulundu, düzeltildi, rapor kurtarıldı. |

---

## 1. Bildirdiğiniz hata (S-20) — ne oluyordu

Sizin ifadenizle: *"Codex seçildiği halde modeller hâlâ Claude modelleri seçme
kutusunda… halbuki terminalde `/model` yazınca gpt-5.6-sol … çıkıyor."*

3.102.0'da **motor ekseni** her yüzeye indi ama **yanındaki kutu inmedi.** Hangi
motoru seçerseniz seçin model listesi `agentFarm.modelAliases` idi — elle yazılmış
dört Claude takma adı. Codex seçtiğinizde kutuda `sonnet` yazıyordu; o CLI bunu
**yalnızca reddedebilir**.

Ve ikinci teşhisiniz daha da önemliydi: *"bu eklentinin kör sağır olması ve kısa
bir süre sonra işe yaramaması sonucunu getiriyor."* Doğru — **sabit bir liste bir
son kullanma tarihidir.** Yarın çıkan model akşam CLI'ın içindedir, aylar sonra
hâlâ bu listede yoktur, çünkü bir sabit ancak biri varlığını hatırlarsa değişir.

---

## 2. Ne yapıldı — liste artık yazılmıyor, **okunuyor**

Yeni bir modül (`core/models.ts`) her motorun **kendi diskteki kataloğunu** okuyor.

### Codex — `~/.codex/models_cache.json`

CLI'ın servise karşı tazelediği kendi kataloğu (197 KB). `visibility: "list"`
süzülüp `priority` sırasına dizildiğinde çıkan liste, sizin terminalde saydığınız
altı satırla **birebir** aynı:

| # | slug | ne diyor |
|---|---|---|
| 1 | `gpt-5.6-sol` | Latest frontier agentic coding model. |
| 2 | `gpt-5.6-terra` | Balanced agentic coding model for everyday work. |
| 3 | `gpt-5.6-luna` | Fast and affordable agentic coding model. |
| 4 | `gpt-5.5` | Frontier model for complex coding, research, and real-world work. |
| 5 | `gpt-5.4` | Strong model for everyday coding. |
| 6 | `gpt-5.4-mini` | Small, fast, and cost-efficient model for simpler coding tasks. |

Katalogda **sekiz** kayıt var; ikisi (`gpt-5.6-sol-wm` yönlendirme takma adı,
`codex-auto-review`) `visibility: "hide"` taşıyor ve size sunulmuyor — onları
listelemek "daha eksiksiz" olmak değil, makinenin kendi tesisatını açmak olurdu.
Terminalin de göstermediği tam olarak bu ikisi.

**Açıklamalar da kataloğun kendi cümleleri** — kutuda bir modelin üzerine
geldiğinizde servisin yazdığı açıklamayı okuyorsunuz, bizim uydurduğumuzu değil.

### Efor kutusu da modelin kendisinin

Katalog her modelin **kendi** akıl yürütme dağarcığını taşıyor:

- `gpt-5.6-terra` → `low · medium · high · xhigh · max · **ultra**`
- `gpt-5.5` → `low · medium · high · xhigh`

Yani tek ortak efor listesi ikisi için de yanlıştı. Artık model seçtiğinizde efor
kutusu **o modelin** desteklediklerine daralıyor, her satır kendi açıklamasıyla.

### Claude — takma adlar **artı** hesabınıza verilenler

Claude Code diskte tam katalog tutmuyor (takma adlar CLI paketinin içinde). Ama
`~/.claude/.claude.json` içindeki `additionalModelOptionsCache`, **bu hesaba
ayrıca verilen** modelleri tutuyor — bu makinede ölçüldü, içinde `Fable` var.

Sonuç: Claude listesi = sizin takma ad listeniz **+** CLI'ın hesap için
kaydettikleri. Yani size yeni bir model tanımlandığında **hiçbir ayar
düzenlemeden** kutuda beliriyor. Sorduğunuz "yeni model c çıkarsa" hâli budur.

### Gemini — bilerek dokunulmadı

O motorun ölçülmüş bir kataloğu yok. Ölçülmemiş şey iddia edilmiyor: ayar listesi
duruyor ve kutu bunu **söylüyor**.

---

## 3. Kutu artık kendi hakkında konuşuyor

Model kutusunun üzerine geldiğinizde listenin **nereden geldiğini ve ne kadar
eski olduğunu** okuyorsunuz:

> *6 models, read from Codex's own catalog (~/.codex/models_cache.json) — the same
> rows its /model offers. Refreshed today.*

Tarihlenemeyen bir listeden şüphelenilemez. Ve **düşüş sessiz değil**: Codex kurulu
ama hiç koşmamışsa katalog dosyası yoktur, o zaman takma ad listesine düşülür —
ama not açıkça "bu Codex'in kendi cevabı değil, `agentFarm.modelAliases`; Codex'i
bir kez koşturun" der. Codex altında **sessizce** sunulan bir Claude takma adı,
bu modülün var olma sebebiydi.

**Motor değişince model düşüyor.** `sonnet` seçiliyken Codex'e geçerseniz, o
değer kutuda kalmaz — seçilen eforla birlikte bırakılır. Kalsaydı, kutuda CLI'ın
reddedeceği bir değer dururdu.

### Nerede geçerli

Console bestecisi · çalışan oturumun canlı model/efor kutuları · `Start Session…`
başlatıcısı · **New-task formu** (motor ve model kutuları artık formu yeniden
çiziyor) · ve köprüde yeni `engines.models` op'u — ajanlar da körlemesine model adı
geçirmesin diye.

> Görev formu ayrıca en çok önem taşıyan yer: bir görevin başında kimse oturmaz,
> yanlış `--model` görünür şekilde patlamaz — saatler sonra açılan bir arşiv
> dosyasına düşer.

---

## 4. ‼️ Geçen turun raporu size hiç ulaşmamıştı

Bunu ayrıca söylemem gerekiyor. Dün gece kapanan turda size bir Codex kullanım
kılavuzu yazılıp `notices.post` ile gönderilmişti. Bildirim oluştu, **rapor dosyası
oluşmadı**, ve köprü `ok: true` cevabı verdi. Yani sistem teslim ettiğini sandı.

**Kök neden (ölçüldü).** PowerShell'de `Get-Content -Raw` düz bir metin değil, not
özellikleriyle (`PSPath`, `ReadCount`…) **süslenmiş** bir nesne döndürüyor.
`ConvertTo-Json` bunu metin yerine `{ "value": "…", "Length": …, "PSPath": … }`
nesnesi olarak yazıyor — 14 651 karakterlik markdown, 94 MB'lık bir JSON'a
dönüşüyor. Köprü metin olmayanı boş sayıyor, dolayısıyla **yalnızca uzun argüman**
düşüyor ve hiç ses çıkmıyor.

**İki taraf da kapatıldı:**

1. Köprü bu bozulmayı **geri açıyor** — BOM'u sıyırdığıyla aynı gerekçe: köprü,
   çağıranların fiilen ürettiği şeyi kabul etmek zorundadır.
2. İkinci bacak başına geleni **söylüyor**: `notices.post` ve `queue.stamp` artık
   kullanılamayan bir gövdeyi ya da başarısız bir yazmayı yutmak yerine
   `reportError` / `answerError` ile cevaplıyor.

**Kayıp rapor kurtarıldı** ve doğru şekilde teslim edildi:
`10_REPORT\2026-08-10_developer_codex-eklentide-kullanim-kilavuzu.md` — Codex'i
eklentide kullanmanın tam kılavuzu (abonelik/anahtar çakışması, altı seçim yeri,
Claude ile gerçek farklar, izin eşlemesi, bilerek yapılmayanlar). Notices'ta.

---

## 5. `agy` sorunuz — net cevap

**Önce bir düzeltme: `agy` "gemini" değil.** Bu, **Google Antigravity CLI**
(`agy.exe` **1.1.11**, `%LOCALAPPDATA%\agy\bin`). Eklentideki mevcut **Gemini**
motor satırı ise `gemini-cli`'ye (`@google/gemini-cli`) bakıyor — o komut bu
makinede **kurulu bile değil**. İkisi ayrı ürün. (Depodaki `core/antigravity.ts`
de motor değil; `AGENTS.md` kural senkronu.)

### Ölçülenler

**Zarfı şaşırtıcı derecede Claude Code şeklinde:**

| Yetenek | `agy` bayrağı |
|---|---|
| Headless koşu | `-p` / `--print` / `--prompt` |
| Makine okunur çıktı | `--output-format text \| json \| stream-json` |
| Model | `--model` |
| Efor | `--effort low\|medium\|high` |
| Devam / resume | `--continue` (`-c`), **`--conversation <ID>`** |
| İzin modu | `--mode accept-edits\|plan`, `--dangerously-skip-permissions`, `--sandbox` |
| Ek klasör | `--add-dir` |
| Yapılandırılmış çıktı | `--json-schema` |

**Ve `agy models` servisten canlı liste veriyor** — yani `core/models.ts` için
hazır bir katalog kaynağı, üstelik hiç dosya okumadan:

```
gemini-3.6-flash-high/medium/low      Gemini 3.6 Flash
gemini-3.5-flash-high/medium/low      Gemini 3.5 Flash
gemini-3.1-pro-high/low               Gemini 3.1 Pro
claude-sonnet-4-6                     Claude Sonnet 4.6 (Thinking)
claude-opus-4-6-thinking              Claude Opus 4.6 (Thinking)
gpt-oss-120b-medium                   GPT-OSS 120B (Medium)
```

Komut servise ulaşıp cevap aldığına göre **girişiniz çalışıyor** (bunu öğrenmek
için bir tur harcamadım).

### Cevap: evet, ama üç ölçüm önce

Codex'i taşımak üç sürüm sürdü, çünkü asıl iş bayraklar değil **akış çevirisi**.
`agy` için yapılması gereken üç ölçüm:

1. **`--output-format json` / `stream-json` gövdesi Claude zarfına ne kadar
   benziyor?** Console adaptörü bunun üzerine kurulu. Benziyorsa iş küçük,
   benzemiyorsa `codexproto.ts` gibi bir çevirici gerekir.
2. **Kimlik nerede duruyor?** `~/.agy` ve `~/.antigravity` **yok** — Antigravity
   IDE'nin kendi girişini okuyor görünüyor. Engines sayfasındaki satırın "giriş
   var mı" sorusunu cevaplayabilmesi için bu dosyanın bulunması gerek.
3. **Ücret bildiriyor mu, yoksa Codex gibi plan/token mu?** `reportsCost`
   buna göre ayarlanır — 3.102.0'da öğrendiğimiz üzere `$0.00` yazmak yanlış bir
   sayıdır.

Bunları körlemesine bağlamak yerine kalem açtım: **S-21**, yukarıdaki üç ölçüm
maddesiyle birlikte. "Yapalım" derseniz sıradaki tur bunu ölçüp bağlayabilir.

---

## 6. Doğrulama

- **7399 test geçiyor** (yeni `test_models.js` 33 test dahil).
- Console fikstürü **iki motor ekranda**, koyu ve açık temada çizilip
  fotoğraflandı: Codex oturumunun model kutusunda altı Codex modeli var ve
  sayfanın hiçbir yerinde `sonnet` geçmiyor.
- VSIX paketlendi, kuruldu ve sürüm `extensions.json`'dan doğrulandı: **3.103.0**.
- **VS Code'u yeniden başlatmanız gerekiyor** — kurulum yeni pencerede geçerli olur.

---

## Kaynaklar

- Ölçüm ortamı: Windows 10, `codex-cli 0.147.0`, `agy 1.1.11`, VS Code / Agent Farm 3.103.0
- Codex model kataloğu: `~/.codex/models_cache.json` (`fetched_at: 2026-08-10T06:57:08Z`)
- Claude hesap modelleri: `~/.claude/.claude.json` → `additionalModelOptionsCache`
- Antigravity CLI: `agy --help`, `agy models`
- Depo içi teknik belge: `docs/MOTORLAR-TASARIM.tr.md` §5.4
- Blueprint: `docs/BLUEPRINT.tr.md` → *Motorlar → Model kutusu motorun kendisine sorar*
- Kararlar: `20_Decisions/2026-08-10-model-ve-efor-listeleri-yazilmaz-motorun-kendi-katalogundan.md`, `…-ikinci-bacak-rapor-cevap-dosyasi-asla-sessizce-dusmez.md`

---
_developer · 8/10/2026, 2:23:53 PM_
