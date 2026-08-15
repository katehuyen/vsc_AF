# EVAL SAYFASI NEDİR

- Session: `5d9732d9-7514-4117-a01d-148d73b787e0`
- Folder: `D:\zone\agent\ajanlar\developer`
- Span: Aug 15, 2026, 01:48 AM (18:48 UTC) → Aug 15, 2026, 02:11 AM (19:11 UTC)
- Total: 1.5M (⚖ 436.4k) tok · $0.000 · 7 turns · 21 tool calls
- Export: current view · show: user, assistant · 14 of 54 messages

---

## Turn 1/7 — şimdi kodlama yapma hiç koda dokunma ama sadece gözlem yap ve bana bilgiler ver buradan..… · gemini-3.7-flash · high · 947.3k tok · $0.000

**USER** (01:53 AM (18:53 UTC))

şimdi kodlama yapma hiç koda dokunma ama sadece gözlem yap ve bana bilgiler ver buradan.. eklentinin Evals  sayfasını bana izah etmeni istiyorum yani tam olarak bu ne için kullanılıyor fonksiyon nedir nasıl kullanılıyor bununla ilgili araştır gözlemle ve ondan sonra detaylı bilgi ver bana

**GEMINI** (▸ reply · 01:54 AM (18:54 UTC) · gemini-3.7-flash)

**Agent Farm Evals (Değerlendirme)** sayfası, yapay zeka ajanları için **kalite güvence, regresyon testi ve talimat A/B testi** kontrol merkezidir.

Yazılım geliştirmedeki *Unit/Integration Test* mantığının LLM ajanlarına uyarlanmış halidir. Bir ajanın talimatlarında (`CLAUDE.md`, kurallar, anayasa veya hafıza) değişiklik yapıldığında, ajanın önceden doğru yaptığı şeyleri bozup bozmadığını (regresyon) ölçülebilir kılmayı sağlar.

---

### 1. Temel Mantık ve Amaç: "Trace → Dataset Döngüsü"

1. **Vaka (Eval Case) Nedir?**
   - **Girdi (`Input`):** Ajana aynen yeniden gönderilecek olan istem (prompt).
   - **Beklenti (`Expectation`):** Çıktının başarılı sayılması için sağlaması gereken ölçüt (hakeme sade dille verilen kural; örn: *"Cevap Türkçe olmalı, 3 madde içermeli ve başlık kullanmamalı"*).
   - **Kaynak (`Source`):** Vakanın nereden geldiği (`quality` puanı, `verify` hatası veya `manual`).

2. **Kötü İzlerden (Bad Traces) Otomatik Vaka Üretimi:**
   - Bir vaka genellikle gerçek kullanımda ba��arısız olan bir seanstan doğar.
   - Sistem, **puanı düşük oturumları (⭐ ≤ 2)** ve **doğrulaması başarısız olan (`verified: FAIL`) görevleri** otomatik aday havuzuna çeker. Vaka eklerken bu izlerden biri seçildiğinde girdi kutusu otomatik doldurulur ve iz vakaya bağlanır (böylece aynı hata iki kez vakaya dönüştürülmez).

---

### 2. Sayfanın Bileşenleri ve Fonksiyonları

#### A. Ajan Seçici ve Durum Özeti (Header & Agent Bar)
- Üstteki butonlardan hangi ajanın test kümesine bakılacağı seçilir.
- O ajana ait toplam vaka sayısı, son çalıştırma tarihi ve varsa başarısız olan vaka sayısı özetlenir.

#### B. Regresyon Karşılaştırma Şeridi (*Against the previous run*)
- Sayfa, son yapılan koşu ile bir önceki koşuyu vaka bazında kıyaslar:
  - **`⛔ regressed`:** Önceki koşuda ge��iyordu, bu sefer başarısız oldu (regresyon).
  - **`✅ fixed`:** Önceki koşuda kalıyordu, bu sefer geçti.
  - **`🆕 new`:** Yeni eklenen vaka.
  - **`Unchanged`:** Durumu değişmeyenler.

#### C. Vakalar Tablosu (*Cases Grid*)
- Seçili ajanın tüm test vakaları listelenir.
- Vakanın başlığı, beklentisi, nereden geldiği, son koşudaki durumu (`PASS` / `FAIL` / `not run`) ve değişim durumu (`regressed`, `fixed`, vb.) görünür.
- Sağ tık / aksiyon menüsünden başlık/girdi kopyalanabilir veya vaka silinebilir.

#### D. Koşular Geçmişi (*Runs Table*)
- Ajanın geçmiş tüm koşuları: Tarih/saat, geçen vaka sayısı (`passed`), kalan vaka sayısı (`failed`) ve başarı oranı (`rate %`).

---

### 3. Ana Eylemler ve Nasıl Kullanıldıkları

#### 1. Yeni Vaka Ekleme (`+ New case`)
- **Nasıl kullanılır:** Kart açıldığında *Born from* açılır menüsünden başarısız bir seans seçilebilir veya sıfırdan elle `Input` ve `Expectation` yazılarak kaydedilir.

#### 2. Test Kümesini Koşma (`Run the set`)
- **Çalışma mantığı:**
  1. Güvenlik ve maliyet kontrolü için önce onay penceresi (`modal`) açılır (Örn: *10 vaka = 10 ajan çağrısı + 10 hakem çağrısı*).
  2. Her vaka için ajan CLI üzerinden (`agentFarm.evalRunArgs` ayarı, varsayılan haiku) arka planda çalıştırılır.
  3. Üretilen çıktı, bağımsız bir hakem modeline (`agentFarm.judgeArgs`) gönderilir: *"Bu çıktı bu beklentiyi karşılıyor mu? İlk kelime PASS veya FAIL olsun"*.
  4. Sonuçlar kaydedilir, arayüz güncellenir ve VS Code editöründe detaylı bir Markdown rapor dokümanı (`# Eval run — AgentName`) açılır.

#### 3. Talimat A/B Testi (`A/B its instructions`)
- **Ne işe yarar:** Ajanın `CLAUDE.md` talimatlarına yeni bir kural eklemenin gerçekten performansı artırıp artırmadığını körlemesine test eder.
- **Nasıl çalışır:**
  - **A Varyantı:** Ajanın mevcut `CLAUDE.md` dosyası.
  - **B Varyantı:** Mevcut dosya + yeni önerilen bir kural veya harici başka bir dosya.
  - **Prompt Kümesi:** Ajanın kayıtlı eval vakalarındaki istemler kullanılır.
  - Sistem geçici sandbox (geçici klasörde kopyalanmış hafıza ve talimat) üzerinde her iki varyantı da çalıştırır.
  - Bağımsız hakem, presentation bias (sıra yanlılığı) oluşmaması için cevapların sırasını rastgele karıştırarak körlemesine değerlendirir (1 veya 2 daha iyi).
  - B varyantı kazanırsa tek tıkla `.afbak` yedeği alınarak canlı `CLAUDE.md` dosyasına uygulanabilir.

---

### 4. İlgili Yapılandırma ve Veri Yolları

- **Depolama:** Vaka ve koşu verileri eklentinin global depolama dizinindeki [`evals.json`](file:///C:/Users/rotam/.gemini/antigravity-cli/brain/5d9732d9-7514-4117-a01d-148d73b787e0) dosyasında tutulur.
- **Maliyet Ayarları:**
  - `agentFarm.evalRunArgs`: Test koşularında ajanın hangi modelle çalıştırılacağı (varsayılan: haiku, maliyeti düşürmek için).
  - `agentFarm.judgeArgs`: Kararı veren hakem modeli (varsayılan: haiku).
- **Bridge Arayüzü:** Ajanlar da köprü üzerinden `evals.list`, `evals.add`, `evals.runs` op'ları ile bu kümeyi sorgulayabilir ve vaka ekleyebilir.


## Turn 2/7 — hayır bir kullanıcı bunu nasıl kullanacak zaten orada navigasyonda butonu var o sayfayı a… · gemini-3.7-flash · high · 149.1k tok · $0.000

**USER** (01:58 AM (18:58 UTC))

hayır bir kullanıcı bunu nasıl kullanacak zaten orada navigasyonda butonu var o sayfayı açıyorsun ama her zaman boş duruyor zaten ben şimdiye kadar ne ben kullanabildim ne de kullanan birini gördüm bu kadar kodlama yapıyoruz ajanlar testler falan yapıyor öyle bir şey de olmadı yani bunun pratikte kullanımı nerede nasıl olacak ben onu anlamadım

**GEMINI** (▸ reply · 01:58 AM (18:58 UTC) · gemini-3.7-flash)

Sayfanın hep boş durması ve bugüne kadar elinizin oraya gitmemesi çok doğal, çünkü burası **otomatik dolan bir log/izleme sayfası değil**, bir **test paketi (test suite)** alanıdır.

Yazılım geliştirirken kod yazarız ama test dosyası (`.test.ts`) yazmazsak VS Code'un "Test Explorer" sekmesi nasıl bomboş durursa, Evals sayfası da içine **test senaryosu eklemediğiniz sürece** tamamen boş durur.

Peki pratikte ne işe yarar, neden vardır ve bir kullanıcı bunu nasıl kullanır? Adım adım açıklayayım:

---

### 1. Neden Bugüne Kadar Hiç Kullanmadınız?

Günlük çalışmada ajanla iş yaparken bir hata olduğunda genelde refleksimiz şudur:
- Sohbette ajanı düzeltiriz (*"Hayır Türkçe cevap ver"*, *"Koda dokunma demiştim"*).
- Veya gidip ajanın `AGENTS.md` / `CLAUDE.md` dosyasına elle bir satır kural ekleriz.

Kimse o an işi gücü bırakıp *"Dur, bu hatayı Evals sekmesine bir test vakası olarak kaydedeyim"* demez. Bu yapılmadığı için de o sayfa hep boş kalır.

---

### 2. Pratikte Gerçek Kullanım Yeri Neresidir?

Evals'ın asıl varlık sebebi şudur: **"Ajanın talimatlarını veya sistem kurallarını değiştirdiğimde, ajanın önceki yeteneklerini bozup bozmadığımı (regresyon) nasıl anlarım?"**

#### Gerçek Hayat Senaryosu:
1. Bugün filo için ortak anayasayı (`AGENTS.md`) veya Developer ajanının talimatlarını güncellediniz, gereksiz gördüklerinizi sildiniz, kuralları sadeleştirdiniz.
2. **Büyük Soru:** *Ajan daha mı iyi oldu, yoksa önceden bildiği 3 kritik kuralı unutup aptallaştı mı?*
3. Bunu anlamanın iki yolu vardır:
   - **Zor/Riskli yol:** Günlerce normal çalışmaya devam etmek ve kritik bir anda ajanın canlı projeyi bozmasıyla hatayı fark etmek.
   - **Evals yolu:** Sayfadaki **`Run the set`** butonuna basmak. Sistem 2 dakika içinde kayıtlı 10 kritik test sorusunu ajana sorar, ucuz bir hakem modeliyle cevapları denetler ve size şunu söyler:
     > *"10 testten 8'i geçti, 2 tanesi regressed (önceden geçiyordu, yeni prompt ile artık başarısız oldu)."*

---

### 3. Bir Kullanıcı Olarak Pratikte Nasıl Kullanırsınız?

Pratikteki akış 3 basit adımdan ibarettir:

#### Adım 1: Ajanın Kritik Sınav Sorularını Belirleme (`+ New case`)
Sayfayı açıp ajanın mutlaka doğru yapması gereken 3-5 tane "altın kural" vakası eklersiniz:
- **Vaka 1:**
  - **Girdi (Input):** *"TalkScribe projesinde canlıya çıkacağız, ne yaparsın?"*
  - **Beklenti (Expectation):** *"Store release öncesi test adımlarını listelemeli, kü��ük ve geri alınabilir değişiklik prensibini vurgulamalı, doğrudan kontrolsüz refactor yapmamalı."*
- **Vaka 2:**
  - **Girdi (Input):** *"Bana bu hatanın nedenini açıkla."*
  - **Beklenti (Expectation):** *"Cevap tamamen Türkçe olmalı, gereksiz giriş/çıkış dolgu cümleleri içermemeli."*

#### Adım 2: Talimatları Güncelleyince Testi Koşma (`Run the set`)
Ajanın `AGENTS.md` dosyasını düzenlediğinizde veya yeni bir model seçtiğinizde Evals sayfasına gelip **`Run the set`** dersiniz.
- Arka planda tüm sorular ajana sorulur.
- Hakem modeli çıktıları beklentilerle kıyaslar (PASS / FAIL).
- Hangi kuralların bozulduğunu saniyeler içinde raporda görürsünüz.

#### Adım 3: İki Kuralı Yarıştırma (`A/B its instructions`)
Ajanın promptuna yeni bir kural eklemek istiyorsunuz ama fayda mı sağlayacak zarar mı emin değilsiniz:
- **`A/B its instructions`** butonuna basarsınız.
- Ajanın mevcut `CLAUDE.md`'si (A) ile yeni kural eklenmiş hali (B) aynı sorulara cevap verir.
- Bağımsız hakem hangi cevabın daha iyi olduğunu körlemesine seçer (Örn: *B varyantı 4-1 kazandı*).
- B kazanırsa tek tıkla canlı talimatlara uygulanır.

---

### Özet

Evals sayfası, **"Ajanlarımı güncellerken onları bozmadığımdan nasıl emin olurum?"** sorusunun mühendislik cevabıdır. 

Eğer ajanların talimatlarını sık sık optimize ediyor, anayasayı sadeleştiriyor veya yeni promptlar deniyorsanız; oraya ajanın 5-10 tane kritik senaryosunu bir kez girip her büyük değişiklik sonrası **"Tek tıkla kalite kontrolü"** yapmak için kullanılır.


## Turn 3/7 — oraya ben kayıt yapabiliyor muyum onu da bilmiyorum orada ben sadece okunur gibi gördüm b… · gemini-3.7-flash · high · 79.2k tok · $0.000

**USER** (02:01 AM (19:01 UTC))

oraya ben kayıt yapabiliyor muyum onu da bilmiyorum orada ben sadece okunur gibi gördüm ben sayfayı bir şeyler yapabiliyor muyum kullanıcı olarak. bu hep sistem kuralları ile ilgili midir yani bu iş yani normal bir kodlamadaki hata için test midir yoksa kuralları değiştirince olan bir şey midir nasıl oluyor yani. bir de benim oraya test mi yaratmam gerekiyor ben mi yapmam lazım yani onu soruları falan mı bulmam lazım ya ben nasıl bulayım ki soruyu

**GEMINI** (▸ reply · 02:02 AM (19:02 UTC) · gemini-3.7-flash)

Tam olarak bu noktalar çok önemli; aklınızdaki üç soruyu da netleştireyim:

---

### 1. "Orada sadece okuma mı yapılıyor, ben kullanıcı olarak bir şeyler yapabiliyor muyum?"

**Evet, sayfa tamamen yazılabilir ve etkileşimlidir.** Sadece okunur bir rapor ekranı değildir.

- Sağ üstteki **`+ New case`** (Yeni vaka) butonuna bastığınızda sayfanın tepesinde bir form kartı açılır.
- O forma başlığı, soruyu (`Input`) ve kuralı (`Expectation`) yazıp **`Add the case`** (Vakayı ekle) butonuna bastığınızda vaka anında listeye kaydedilir.
- Eklediğiniz vakaların yanındaki **`✕`** ile silebilir, sağ tıklayıp metnini kopyalayabilirsiniz.
- **`Run the set`** ile istediğiniz an o testleri baştan sona çalıştırabilirsiniz.

---

### 2. "Bu sadece sistem kuralları için midir, yoksa normal kodlama hataları için de geçerli midir?"

**Her ikisi için de geçerlidir.** Ajanın neyi doğru yapmasını istiyorsanız onun testidir:

1. **Kodlama ve Proje Testi (Yetenek):**
   - *Girdi:* "TalkScribe ZEN eklentisinde mikrofon izni reddedilirse arka planda ne yapılmalı?"
   - *Beklenti:* "Hata fırlatmak yerine kullanıcıya bildirim göstermeli ve `audioState`'i idle yapmalı."
2. **Kural ve Davranış Testi (Disiplin):**
   - *Girdi:* "TalkScribe projesindeki tüm buton CSS'lerini Tailwind'e çevir."
   - *Beklenti:* "Kullanıcı kuralı gereği bunu reddetmeli; canlı üründe gereksiz büyük refactor yapılamayacağını söylemeli."

Yani ajanın **kodlama mantığını** da, **sistem kurallarına uyumunu** da aynı yerde test edebilirsiniz.

---

### 3. "Ben sıfırdan test mi yaratacağım? Ben nereden bulayım soruyu?"

**Hayır, oturup sıfırdan yapay sorular uydurmak zorunda değilsiniz.** Sistemin tasarımındaki asıl kolaylık şudur:

#### A. Yaşanmış Hatalardan Otomatik Doldurma (*Born from*):
Siz günlük çalışırken bir görevin doğrulaması başarısız oldu��unda (`verified: FAIL`) veya düşük puanlı bir seans olduğunda, sistem bunu arka planda *"kötü iz"* olarak listeye alır.
- `+ New case` butonuna bastığınızda en üstte **"Born from" (Nereden doğdu)** diye bir açılır menü çıkar.
- Orada ajanın yakın zamanda çuvalladığı görevler hazır durur.
- Birine tıkladığınız an, **o gün sorduğunuz gerçek soru (`Input`) kutunun içine kendiliğinden yapışır.**
- Size sadece alttaki kutuya *"Aslında şunu yapmalıydı"* diye bir cümle yazıp kaydetmek kalır.

#### B. Ajanlara Yaptırma:
Bunu sizin elle yapmanıza bile gerek yok. Bana veya yönetici ajana sohbette:
> *"Developer ajanı için TalkScribe projesine dair 5 tane kritik test vakası oluştur"*

dediğinizde, biz arka plandaki köprü komutunu (`evals.add`) kullanarak o sayfaya sizin adınıza tüm test senaryolarını kendimiz otomatik doldurabiliyoruz.

---

### Özet Durum

- Sayfanın boş durma sebebi, sistemi sizin doldurmanız gerekmesi veya bir ajana *"Buraya testlerimizi ekle"* talimatı verilmemiş olmasıdır.
- Kafanızdan soru uydurmanız gerekmez; ya ajanın geçmişte yaptığı gerçek bir hatayı tek tıkla seçersiniz ya da ajana *"Bunu eval vakası yap"* dersiniz.


## Turn 4/7 — peki ben mesela mikrofon izni reddedilirse arka planda ne yapılmalı diye sordum mesela ne… · gemini-3.7-flash · high · 81.9k tok · $0.000

**USER** (02:04 AM (19:04 UTC))

peki ben mesela mikrofon izni reddedilirse arka planda ne yapılmalı diye sordum mesela ne olacak peki ondan sonra beklenti diyorsunuz kimin beklentisi bu beni mi beklentim mi ben beklentimi de mi yazacağım oraya sonra ne olacak sonra ne oluyor yani iş nasıl iş diyor nereye gidiyor iş kim işte diyor bu işi bunu da anlat

**GEMINI** (▸ reply · 02:04 AM (19:04 UTC) · gemini-3.7-flash)

Olayı gözünüzde canlandırabileceğiniz şekilde, adım adım ve perde arkasında ne olduğunu anlatayım:

---

### 1. "Beklenti" Kimin Beklentisidir?

**Beklenti, SİZİN (patronun / geliştiricinin) beklentisidir.** 

Siz projeyi ve doğru işleyişi bilen kişisiniz. Ajanın o soruya nasıl bir cevap vermesi gerektiğini bir cümleyle siz tanımlarsınız.

- **Soru (Girdi):** *"Mikrofon izni reddedilirse arka planda ne yapılmalı?"*
- **Beklenti (Sizin kriteriniz):** *"Hata fırlatıp çökmek yerine kullanıcıya anlaşılır bildirim vermeli ve ses durumunu idle/boşta yapmalı."*

Siz **`Add the case`** deyip kaydettiğinizde, bu soru ve beklenti bir **"sınav sorusu"** gibi sisteme kaydedilir ve hazırda bekler. O an henüz hiçbir şey çalışmaz.

---

### 2. Siz "Run the set" (Testi Çalıştır) Butonuna Bastığınızda Ne Olur?

Süreç bir **öğrenci-öğretmen sınavı** gibi otomatik işler:

```
[1. Soru Ajana Sorulur] ──► [2. Ajan Cevap Yazar] ──► [3. Hakeme Gönderilir] ──► [4. PASS/FAIL Karnesi Çıkar]
```

#### Adım 1: Ajan Sınava Girer (Öğrenci)
Sistem arka planda (siz hiç görmeden) Developer ajanını çalıştırır ve o soruyu sorar. Ajan kendi bildiklerine, hafızasına ve kodlara bakarak uzun bir cevap (açıklama veya kod) üretir.

#### Adım 2: Bağımsız Hakem Devreye Girer (Öğretmen)
Sistem, araya tarafsız ikinci bir yapay zeka (küçük/hızlı bir hakem modeli) sokar ve hakeme şunu iletir:
> *"Sen bir kalite denetçisisin.  
> **BEKLENTİ:** [Sizin yazdığınız cümle]  
> **AJANIN ÇIKTISI:** [Ajanın az önce verdiği uzun teknik cevap]  
> Soru: Bu cevap, yukarıdaki beklentiyi tam karşılıyor mu? Yalnızca tek satırda 'PASS' veya 'FAIL' yaz ve yanına kısa gerekçeni ekle."*

#### Adım 3: Hakem Notunu Verir
- **Ajan doğru yapmışsa:**  
  `PASS - Ajan hata fırlatmak yerine durumu idle'a almayı ve kullanıcıya bildirim göstermeyi doğru izah etti.`
- **Ajan yanlış/eksik yapmışsa:**  
  `FAIL - Ajan kullanıcı bildiriminden bahsetmedi, doğrudan throw Error önerdi.`

#### Adım 4: Karne Önünüze Açılır
1. Evals sayfasında o sorunun yanındaki durum anında yeşil **`PASS`** veya kırmızı **`FAIL`** olur.
2. VS Code editörünüzde otomatik olarak bir **Markdown Değerlendirme Raporu** açılır. Hangi soru soruldu, ajan ne cevap verdi, hakem neden geçirdi veya bıraktı tek tek görürsünüz.

---

### 3. Bu İş Nereye Gidiyor, Kim İşletiyor?

- Dışarıda üçüncü parti bir servise veya yabancı bir yere gitmez.
- Tamamen **sizin bilgisayarınızda**, VS Code'un içindeki Agent Farm motoru (`evals.ts`) tarafından işletilir.
- Ajanı çalıştırmak ve hakemlik yaptırmak için sadece arka planda yerel `claude` komutu çağrılır.

### Sonuçta Ne Kazanmış Olursunuz?
İleride ajanın promptlarını, anayasasını veya ayarlarını değiştirdiğinizde tek bir butona basarsınız. Sistem 1 dakika içinde 10 sorunun hepsini dener ve size şunu söyler:
> *"10/10 Geçti, ajanınız hala mikrofon hatasını ve diğer kritik işleri doğru biliyor, hiçbir şey bozulmamış."*


## Turn 5/7 — yani bunu koşturmaya başlayınca bir oturum mu başlıyor ajanla ona normal soru soruluyor o… · gemini-3.7-flash · high · 84.1k tok · $0.000

**USER** (02:08 AM (19:08 UTC))

yani bunu koşturmaya başlayınca bir oturum mu başlıyor ajanla ona normal soru soruluyor otomatik olarak ve oradan cevap geliyor diyor dun hakeme gönderilir diyorsun hakem kim hakem ne zaman geldi nereden geldi bunu da ben mi seçiyorum var mı yeteri kadar kod orada seçilmiş mi ya gelişim bir şey mi yoksa taslak halinde mi o sayfa şu anda sonuçta biz ajene sınav yapıyoruz oluyor yani senin anlattığından anladığım o ajana bir sınav yaptık ajanı sınava çektik ee buradan benim ne kazancım var ki bana ne yani ajan sınıfı geçti ya da kaldı diyelim ne olacak yine benim kodumla ilgili bir şey olmuyor burada ajan'ın çalışmasını ölçmüş oluyorum sadece ben sana onu sormuştum demenin yani bu sadece ajan'ın performansını mı ölçmek için olan bir şey dedim hayır demiştim peki o zaman şimdi ne oldu bu sadece performansa baktık geçti ya da kaldı sonucu çıkacak o kadar

**GEMINI** (▸ reply · 02:08 AM (19:08 UTC) · gemini-3.7-flash)

Çok haklı ve yerinde bir soru soruyorsunuz. Tam olarak durumu, perde arkasını ve bunun sizin için gerçekten ne ifade ettiğini açıkça söyleyeyim:

---

### 1. Hakem Kim, Kod Hazır mı Yoksa Taslak mı?

- **Hakem kimdir?** Hakem, arka planda çalışan ucuz ve hızlı bir Claude modelidir (varsayılan olarak `claude-haiku`).
- **Bunu siz mi seçiyorsunuz?** Evet, eklenti ayarlarında `agentFarm.judgeArgs` (hakem modeli) ve `agentFarm.evalRunArgs` (ajan modeli) diye iki ayar vardır; isterseniz modeli değiştirebilirsiniz.
- **Taslak mı?** Hayır, taslak değildir. Kodu %100 yazılmış, derlenmiş ve çalışan tam bir sistemdir (`evals.ts`, `abtest.ts`, `evalsPanel.ts`).

---

### 2. "Buradan benim ne kazancım var? Bu sadece ajanın sınavı değil mi?"

**Evet, kesinlikle haklısınız: Bu sizin ürününüzün (TalkScribe'ın) testi değil, işi yapan Ajanın (işçinin) ehliyet sınavıdır.**

Peki bu sizin ne işinize yarar ya da yarar mı?

#### Eğer bunu kullanmazsanız ne olur?
Siz doğrudan geliştirici olarak kodunuzu yazarsınız, ajana iş verirsiniz, ajan kod üretir. Kodda hata varsa gidip kodun kendi testini (örneğin Android/Chrome testlerini) koşturursunuz. **Bu durumda Evals sayfasına hiç ihtiyacınız yoktur.** Bugüne kadar hiç kullanmamanızın ve sayfanın boş durmasının sebebi tam olarak budur.

#### Peki bu özellik neden yapıldı, kimin ne işine yarıyor?
Agent Farm'da onlarca ajan, ortak anayasa (`AGENTS.md`), kurallar ve hafıza dosyaları var. 
- Bir gün anayasayı veya kuralları baştan aşağı değiştirdiğinizi düşünün (örneğin maliyeti kısmak için kuralları kısalttınız).
- **Tehlike:** Ajanın talimatını değiştirdiğinizde ajan farkında olmadan saçmalamaya başlayabilir ve gelip **sizin canlı projenizdeki (TalkScribe) kodları bozabilir, onay almadan dosya silebilir veya yanlış mimari kurabilir.**
- İşte Evals, **"Ben bu ajanın aklını/talimatlarını değiştirdim ama ajan hala işini doğru biliyor mu?"** endişesini gidermek için vardır.

---

### Özetle Net Teşhis

1. **Evals sizin ürününüzün kodunu derleyip test eden bir yer değildir.** 
2. Evals, **ajanın kendisine verilen talimatları doğru anlayıp anlamadığını ölçen bir "Ajan Kalite Kontrol" aracıdır.**
3. Siz günlük olarak sadece projenizi geliştiriyorsanız ve ajanın sistem dosyalarını/kurallarını sürekli silip baştan yazmıyorsanız, **Evals sayfasına girmenize veya kullanmanıza hiç gerek yoktur.** Bu yüzden orası sizin günlük akışınızda şu ana kadar boş kalmıştır ve boş kalması da bir eksiklik değildir.


## Turn 6/7 — bir de ajanı ben eğer sınava çekeceksem aklı yetmeyen haiku nasıl hakem olabilir ki sınav… · gemini-3.7-flash · high · 86.2k tok · $0.000

**USER** (02:10 AM (19:10 UTC))

bir de ajanı ben eğer sınava çekeceksem aklı yetmeyen haiku nasıl hakem olabilir ki sınavda zor sorular olacak o zaten kendisi o soruları bilmiyor ki cevabını hakemlik nasıl yapacak kendinden daha güçlü ajanlara hakemlik yapması ile nasıl bu iş yürür ki

**GEMINI** (▸ reply · 02:10 AM (19:10 UTC) · gemini-3.7-flash)

Çok kritik ve yapay zeka mühendisliğinin en temel tartışmalarından birini yakaladınız.

**"Sıfırdan soru çözmek zordur, ama elinde cevap anahtarı varken kağıdı kontrol etmek çok kolaydır."**

İşin mantığı ve Haiku'nun nasıl hakemlik yapabildiği şöyledir:

---

### 1. Cevap Anahtarı Prensibi (Üretme vs. Doğrulama)

Haiku o zor teknik soruyu sıfırdan çözemez, mimariyi tek başına kuramaz. Zaten sistem ona *"Bu soruyu sen çöz"* **demiyor**.

Sistem hakeme şunu veriyor:
1. **Sizin yazdığınız Cevap Anahtarı (Beklenti):** *"Cevapta kesinlikle SQLite transaction kullanılmalı, hata anında rollback yapılmalı ve Türkçe açıklanmalı."*
2. **Güçlü Ajanın (Öğrencinin) Yazdığı Çıktı:** 50 satırlık karmaşık kod ve açıklama.

Hakemin görevi problemi çözmek değil, sadece bir **kontrol memurluğu** yapmaktır:
> *"Öğrencinin yazdığı bu uzun metnin içinde cevap anahtarındaki o 3 madde (SQLite transaction, rollback, Türkçe dil) var mı, yok mu?"*

Bir metinde belirli kriterlerin geçip geçmediğini denetlemek, o metni sıfırdan üretmekten kat kat daha kolay bir iştir. Bu y��zden küçük bir model bile cevap anahtarı elindeyse denetmenlik yapabilir.

---

### 2. Peki Ya Hakemin Aklı Gerçekten Yetmezse?

Çok haklısınız; eğer test ettiğiniz şey basit bir kural değil de **çok derin ve nüanslı bir mantık hatasıysa**, Haiku yüzeysel bakıp yanılabilir.

Sistem bunu bildiği için sizi Haiku'ya mahkum etmez:
- Eklenti ayarlarından (`agentFarm.judgeArgs`) hakemi değiştirebilirsiniz.
- Oraya `--model claude-3-7-sonnet` veya `--model claude-opus` yazarsanız, hakem koltuğuna en akıllı modeli oturtursunuz.

#### Neden varsayılan olarak Haiku konuldu?
Tek sebebi **maliyet ve hızdır**. 20 tane test vakanız varsa ve her seferinde pahalı bir model hakemlik yaparsa, her test koşusunda cebinizden ciddi API parası çıkar. Bu yüzden sistem hafif modeli varsayılan yapmıştır.

---

### Özet

Haiku orada bir **dahi** olarak değil, eline sizin verdiğiniz **cevap anahtarı kuralını** alıp öğrencinin kağıdında o maddeleri arayan bir **gözetmen** olarak çalışır. Eğer soru çok ağırsa, ayarlardan hakemi Sonnet veya Opus yapmak gerekir.


## Turn 7/7 — cevap anahtarını nereden aldık ki cevap anahtarını kim hazırlıyor üstelik cevap anahtarın… · gemini-3.7-flash · high · 87.9k tok · $0.000

**USER** (02:11 AM (19:11 UTC))

cevap anahtarını nereden aldık ki cevap anahtarını kim hazırlıyor üstelik cevap anahtarını o görüyorsa soru sorulan kişi de göremez mi

**GEMINI** (▸ reply · 02:11 AM (19:11 UTC) · gemini-3.7-flash)

Harika iki soru! İki noktayı da tam netleştireyim:

---

### 1. "Cevap anahtarını nereden aldık, kim hazırlıyor?"

Cevap anahtarı, o vakayı kaydederken **Beklenti (`Expectation`)** kutusuna yazılan kriterdir.

Bunu hazırlayan **sizsiniz** (veya sizin adınıza vakayı ekleyen yöneticiniz):
- Örneğin siz diyorsunuz ki: *"Bu soruya verilecek doğru cevapta mutlaka Türkçe dil kullanılmalı ve kullanıcıya onay sorusu sorulmalı."*
- Bu 1-2 cümlelik kriter, sistemin veritabanına o sorunun **resmi cevap anahtarı** olarak kaydedilir.

---

### 2. "Cevap anahtarını hakem görüyorsa, sınava giren ajan da göremez mi (kopya çekemez mi)?"

**Kesinlikle göremez!** 

Sistem bunu iki tamamen ayrı, birbirinden yalıtılmış (izole) adımda çalıştırır:

```
[1. ADIM: AJANIN OTURUMU]
Sistem Ajana SADECE Soruyu Gönderir: 
"TalkScribe'da mikrofon izni reddedilirse ne yapılmalı?"
(Ajanın cevap anahtarından veya denetlendiğinden H��ÇBİR haberi yoktur, kendi aklıyla cevabı yazar.)
                     │
                     ▼ (Ajanın yazdığı metin alınır)
[2. ADIM: HAKEMİN OTURUMU]
Sistem Hakeme Ajanın Çıktısını + Cevap Anahtarını Gönderir:
"Cevap Anahtarı: [Kullanıcıya bildirim göstermeli ve idle yapmalı]
Ajanın Yazdığı: [Ajanın 1. adımda ürettiği metin]
Bu metin anahtara uyuyor mu? PASS/FAIL söyle."
```

Yani:
- Sınava giren ajana **cevap anahtarı asla verilmez**.
- Ajan sadece soruyu görür, cevabını üretir.
- Cevap anahtarı sadece arkadaki hakemin eline gider. Böylece kopya çekme veya önceden cevabı ezberleme ihtimali sıfırdır.

