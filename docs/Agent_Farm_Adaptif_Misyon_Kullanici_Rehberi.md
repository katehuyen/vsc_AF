# Agent Farm — Adaptif Misyonlar: Baştan Sona Kullanıcı Rehberi

> Bir hedefi yazmaktan, ajanların çalışmasını izlemeye ve sonucun gerçekten başarılı olup olmadığını anlamaya kadar öğretici kullanım kitabı

Bu rehber, Agent Farm’daki **Adaptive Objective / Adaptif Misyon** sistemini teknik altyapıyı bilmeyen bir kullanıcının anlayacağı dille anlatır. Burada yalnızca “hangi düğmeye basılır?” sorusunun cevabı yoktur. Ekranda gördüğünüz her önemli seçeneğin ne anlama geldiğini, seçimlerinizin çalışmayı nasıl değiştirdiğini, sistemin perde arkasında ne yaptığını ve bir sorun çıktığında neye bakmanız gerektiğini de öğreneceksiniz.

> [!IMPORTANT] Bu rehberin sözü
> Teknik bir kelime, önce gündelik karşılığı açıklanmadan kullanılmayacaktır. Bir teknik ad görmek zorundaysanız, bunun nedeni o adı ekranda veya çalışma kaydında görecek olmanızdır.

> [!NOTE] İki ayrı belge neden var?
> Bu dosya **son kullanıcı rehberidir**. Yanındaki `Agent_Farm_Adaptif_Misyon_Mimarisi_Rehberi.md` ise sistemi geliştirecek ajanlar için teknik doğruluk kaynağıdır. Bir misyonu oluşturmak, yürütmek ve anlamak için bu rehber yeterlidir; kod yazacak kişinin ise teknik belgeye de bakması gerekir.

---

## İçindekiler

1. [Bir dakikada adaptif misyon](#1-bir-dakikada-adaptif-misyon)
2. [Önce doğru çalışma biçimini seçin](#2-önce-doğru-çalışma-biçimini-seçin)
3. [Sistemde kim ne yapar?](#3-sistemde-kim-ne-yapar)
4. [Misyon oluşturma ekranını doldurmak](#4-misyon-oluşturma-ekranını-doldurmak)
5. [Lider, çalışanlar ve kapsam seçimi](#5-lider-çalışanlar-ve-kapsam-seçimi)
6. [Motor, model, düşünme düzeyi ve izinler](#6-motor-model-düşünme-düzeyi-ve-izinler)
7. [Başlat düğmesinden sonuca kadar ne olur?](#7-başlat-düğmesinden-sonuca-kadar-ne-olur)
8. [Tur, dalga ve paralel çalışma](#8-tur-dalga-ve-paralel-çalışma)
9. [Liderin kullanabildiği 14 hareket](#9-liderin-kullanabildiği-14-hareket)
10. [Ajanların birbirleriyle konuşması](#10-ajanların-birbirleriyle-konuşması)
11. [Council: düzenli bir kurul tartışması](#11-council-düzenli-bir-kurul-tartışması)
12. [İşin bitmesi ile hedefin başarılması aynı şey değildir](#12-işin-bitmesi-ile-hedefin-başarılması-aynı-şey-değildir)
13. [Yön değiştirmek: düzeltme mi, yeni strateji mi?](#13-yön-değiştirmek-düzeltme-mi-yeni-strateji-mi)
14. [Çalışan misyona nasıl müdahale edilir?](#14-çalışan-misyona-nasıl-müdahale-edilir)
15. [Süre, maliyet ve kaynak sınırları](#15-süre-maliyet-ve-kaynak-sınırları)
16. [Canlı misyon ekranı nasıl okunur?](#16-canlı-misyon-ekranı-nasıl-okunur)
17. [Oturumlar, çıktılar ve iz kayıtları](#17-oturumlar-çıktılar-ve-iz-kayıtları)
18. [Bir şey ters giderse ne olur?](#18-bir-şey-ters-giderse-ne-olur)
19. [Duraklatma, yeniden açma ve bilgisayar kapanması](#19-duraklatma-yeniden-açma-ve-bilgisayar-kapanması)
20. [Bugünkü ekranın bilinen karışıklıkları](#20-bugünkü-ekranın-bilinen-karışıklıkları)
21. [Hazırlanan yeni ekran düzeni](#21-hazırlanan-yeni-ekran-düzeni)
22. [Baştan sona örnek misyonlar](#22-baştan-sona-örnek-misyonlar)
23. [Hızlı seçim rehberi](#23-hızlı-seçim-rehberi)
24. [Sık sorulan sorular](#24-sık-sorulan-sorular)
25. [Ekran dili sözlüğü](#25-ekran-dili-sözlüğü)
26. [İleri düzey kullanıcılar için teknik ek](#26-ileri-düzey-kullanıcılar-için-teknik-ek)

---

## 1. Bir dakikada adaptif misyon

Diyelim ki Agent Farm’a şunu yaptırmak istiyorsunuz:

> “Bu özelliğin neden bozulduğunu bul, güvenli biçimde düzelt, test et ve yapılanı anlaşılır biçimde belgele.”

Bu işin içinde araştırma, karar verme, kodlama, denetleme ve gerekirse düzeltme vardır. Bütün adımları önceden sizin tek tek tasarlamanız zordur; çünkü ikinci adım, birinci adımda bulunan sonuca göre değişebilir.

**Adaptif misyon** tam olarak bu tür işler içindir. Siz:

- ulaşılacak sonucu,
- sonucun hangi koşullarda başarılı sayılacağını,
- aşılmaması gereken sınırları,
- kullanılabilecek ajanları

belirlersiniz. Seçtiğiniz lider ajan ise mevcut durumu okuyup bir sonraki doğru adımı seçer. Çalışan ajanlara görev verir, gelen sonuçları karşılaştırır, eksik işi düzelttirir, başarı koşullarını denetler ve yeterli kanıt oluştuğunda misyonu kapatır.

```text
SİZ
  │
  ├─ Ne istiyorum?
  ├─ Başarılı olduğunu nasıl anlayacağım?
  └─ Hangi sınırlar aşılmamalı?
  │
  ▼
LİDER AJAN
  │
  ├─ Sıradaki adımı seçer
  ├─ Çalışanlara iş verir
  ├─ Sonuçları okur
  └─ Gerekirse yön değiştirir
  │
  ▼
ÇALIŞAN AJANLAR
  │
  ├─ Araştırır
  ├─ Yazar veya uygular
  ├─ İnceler
  └─ Kanıt üretir
  │
  ▼
DOĞRULANMIŞ SONUÇ
```

> [!TIP] En kısa zihinsel model
> **Siz hedefi ve başarı ölçüsünü belirlersiniz; lider, oraya nasıl gidileceğini yönetir; çalışanlar işi yapar; değerlendirme kayıtları gerçekten varılıp varılmadığını gösterir.**

> [!WARNING] Adaptif, “ajanlar kendi kendine bir şeyler yapsın” demek değildir
> İyi bir hedef, açık başarı koşulları ve doğru sınırlar verilmezse liderin vereceği kararların kalitesi de düşer. Sistem belirsizliği yönetebilir; ama sizin neyi değerli saydığınızı tahmin etmek zorunda bırakılmamalıdır.

---

## 2. Önce doğru çalışma biçimini seçin

Agent Farm’da her iş adaptif misyon olmak zorunda değildir. Dört farklı çalışma biçimi vardır ve bunlar aynı ihtiyacın farklı büyüklükleri değildir; farklı türde ihtiyaçlara cevap verir.

### 2.1 Task / Görev

**Tek bir ajanın, sınırı belli bir işi yapmasını** istiyorsanız görev kullanın.

> [!EXAMPLE] Örnek
> “Bu dosyadaki yazım hatalarını düzelt.”

İşi kimin yapacağı bellidir. Ara kararlar için ayrı bir lider gerekmez. Bir ajanın işi tamamlaması yeterlidir.

### 2.2 Workflow / İş akışı

**Aynı adımların tekrar tekrar aynı sırada çalışmasını** istiyorsanız iş akışı kullanın.

> [!EXAMPLE] Örnek
> Her sürümde sırasıyla testleri çalıştır, paketi üret, paketi doğrula ve kur.

Burada yol önceden bellidir. Sistem, o yolu tekrar edilebilir biçimde uygular.

### 2.3 Classic Mission / Klasik misyon

**Birden fazla ajan çalışacak, fakat lideri, ekibi ve temel görev dağılımını siz kuracaksanız** klasik misyon kullanın.

Klasik misyonda lider ve çalışanlar vardır; fakat liderin kullanabildiği hareketler daha sınırlıdır. Sistem sizin oluşturduğunuz ekip düzenini yürütür.

### 2.4 Adaptive Objective / Adaptif misyon

**Yolun, çalışma sırasında çıkan bilgilere göre değişmesi gerekiyorsa** adaptif misyon kullanın.

Burada “şu üç adımı sırayla yap” yerine “şu sonuca ulaş; başarı koşulları bunlar; sınırlar bunlar” dersiniz. Lider hangi uzmana ne zaman ihtiyaç duyulduğuna, neyin yeniden yapılacağına ve ne zaman strateji değiştirileceğine karar verir.

| İhtiyacınız | En uygun seçim |
| :-- | :-- |
| Tek ajan, tek ve açık iş | **Task / Görev** |
| Önceden belli, tekrarlanan adımlar | **Workflow / İş akışı** |
| Ekibi ve iş dağılımını siz kuruyorsunuz | **Classic Mission / Klasik misyon** |
| Sonuca giden yol bulgulara göre değişecek | **Adaptive Objective / Adaptif misyon** |

> [!QUESTION] Kendinize sorun
> “Daha işe başlamadan doğru adımların tamamını biliyor muyum?”
>
> - **Evet:** Görev, iş akışı veya klasik misyon daha sade olabilir.
> - **Hayır:** Adaptif misyonun karar verme döngüsüne ihtiyacınız vardır.

> [!IMPORTANT] Classic ile Adaptive arasındaki gerçek fark
> Klasik misyon, önceden çizilmiş donuk bir şema değildir; o da lider ve çalışanlarla turlar hâlinde ilerler. Fark şudur: **Classic’te çalışma düzenini kullanıcı daha çok belirler; Adaptive’te kullanıcı sonucu tanımlar, lider ise yöntemi çalışma sırasında kurar.** Adaptive ayrıca değerlendirme, tartışma, strateji değiştirme ve alt misyon açma gibi daha geniş bir hareket kümesine sahiptir.

---

## 3. Sistemde kim ne yapar?

Bir adaptif misyonda dört şeyi birbirinden ayırmak gerekir: **siz**, **lider**, **çalışan ajanlar** ve bu ajanları çalıştıran **motorlar**.

### 3.1 Siz: işin sahibi

Sizin sorumluluğunuz:

- hedefi anlaşılır yazmak,
- başarı koşullarını belirtmek,
- dokunulmaması gereken sınırları koymak,
- kullanılabilecek ekibi seçmek,
- gerekiyorsa onay vermek veya yön göstermek.

Liderin yapacağı teknik planı sizin kurmanız gerekmez. Fakat “iyi sonuç” tanımını siz vermelisiniz.

### 3.2 Lider: işin yöneticisi

Lider, seçtiğiniz gerçek bir Agent Farm ajanıdır. Örneğin `developer`, `manager` veya başka bir ajan lider olabilir.

Lider:

- hedefi ve mevcut kayıtları okur,
- sıradaki hareketi seçer,
- çalışan ajanlara görev verir,
- sonuçları ve hataları görür,
- gerekirse düzeltme veya yeni plan ister,
- başarı koşullarını denetletir,
- misyonun bitip bitmediğine karar verir.

> [!IMPORTANT] “Delegasyon ajanı” diye üçüncü bir gizli ajan yoktur
> Ekranda seçtiğiniz **Lead / Lider**, gerçekten lider kimliğidir. Ayrı bir “delegasyon ajanı” liderin üstünde durup onu yönetmez.

### 3.3 Çalışan ajanlar: işi yapan uzmanlar

Çalışanlar, liderin verdiği somut işleri yapar. Biri araştırabilir, biri kod yazabilir, biri sonucu inceleyebilir. Her çalışan işi kendi görev oturumunda yürütür ve sonucu lidere geri verir.

> [!EXAMPLE] Küçük bir ekip
>
> - `developer`: hatayı bulur ve düzeltir.
> - `basit`: dosyalarda mekanik kontroller yapar.
> - `manager`: çözümü ürün hedefleri açısından inceler.

Bu roller sabit bir zorunluluk değildir. Hangi ajanın hangi işi alacağına lider, hedefe ve ajanların yeteneklerine göre karar verir.

### 3.4 Motor: ajanın çalıştığı hizmet

**Engine / Motor**, görevin hangi yapay zekâ çalışma ortamında yürütüleceğini söyler. Claude, Codex, Gemini veya sisteme eklenmiş başka bir motor olabilir.

Motor bir ajan değildir. `developer` ajanı bir kimlik ve çalışma rolüdür; Codex ise o ajanı belirli bir görevde çalıştırabilecek motorlardan biridir.

```text
AJAN KİMLİĞİ               ÇALIŞTIRAN MOTOR
developer        ───────►  Codex
manager          ───────►  Claude
researcher       ───────►  Gemini
```

> [!TIP] Karıştırmamak için
> “Bu işi **kim** yapacak?” sorusunun cevabı **ajan**dır.  
> “O ajan **hangi yapay zekâ hizmetinde** çalışacak?” sorusunun cevabı **motor**dur.

### 3.5 Liderin iki ayrı çalışma yüzü

Lider aynı kimlik olsa da iki farklı iş yapabilir:

1. **Yönetici yüzü:** Misyonu planlar ve sıradaki kararı verir.
2. **Çalışan yüzü:** Lider kendisine de somut bir görev verilirse o işi bir çalışan oturumunda yapar.

Bu iki çalışma aynı konuşma değildir. Böylece planlama konuşması ile dosya değiştiren veya araştırma yapan görev konuşması birbirine karışmaz.

> [!NOTE] Perde arkasındaki düzen
> Liderin yönetici yüzü şu anda ayrı, görünmeyen bir Claude planlama oturumunda çalışır. Çalışan görevleri ise seçilen ajan ve motorlarla ayrı Task oturumlarında açılır. Kullanıcının bunun için terminal pencereleri yönetmesi gerekmez.

---

## 4. Misyon oluşturma ekranını doldurmak

İyi bir adaptif misyon, formdaki çok sayıda ayarı değiştirmekle değil, ilk üç alanı doğru yazmakla başlar:

1. **Goal / Objective:** Nereye varılacak?
2. **Success Criteria:** Vardığımızı nasıl anlayacağız?
3. **Constraints:** Bunu yaparken neyi aşmayacağız?

### 4.1 Goal / Objective — ulaşılacak sonuç

Hedef alanına yalnızca bir faaliyet değil, ulaşılacak sonucu yazın.

| Zayıf hedef | Güçlü hedef |
| :-- | :-- |
| “Kodu incele.” | “Oturum filtresindeki imleç bozulmasının kök nedenini bul ve diğer filtreleri bozmadan düzelt.” |
| “Doküman hazırla.” | “Yeni kullanıcının adaptif misyonu tek başına kurup izlemesini sağlayacak öğretici bir rehber hazırla.” |
| “Testleri çalıştır.” | “Değişikliğin mevcut davranışı bozmadığını otomatik testlerle doğrula ve başarısız testlerin nedenini açıkla.” |

> [!TIP] Hedef yazma kalıbı
> **[Ortaya çıkacak sonuç] + [hangi bağlamda] + [önemli kalite beklentisi]**
>
> Örnek: “Missions oluşturucusundaki çelişkili motor seçimlerini kaldıran, seçimin sonucunu Başlatmadan önce gösteren ve mevcut kayıtlarla uyumlu çalışan bir arayüz oluştur.”

> [!WARNING] “Araştır”, “bak”, “incele” tek başına hedef değildir
> Bunlar yapılacak faaliyeti söyler; faaliyet sonunda ne teslim edileceğini söylemez. Araştırmanın bir karara, rapora, düzeltmeye veya doğrulanmış bulguya bağlanması gerekir.

### 4.2 Success Criteria — başarılı olduğunu gösteren kanıtlar

Başarı koşulları, liderin ve sizin “tamamlandı” sözünü kontrol edebilmenizi sağlar. Her koşul mümkün olduğunca gözlenebilir olmalıdır.

> [!EXAMPLE] Bir arayüz düzeltmesi için başarı koşulları
>
> - Kullanıcı liderin hangi model ve düşünme düzeyinde çalışacağını Başlatmadan önce görebiliyor.
> - Toplu çalışan ayarı, satırlardaki seçimleri gözle görülür biçimde değiştiriyor.
> - Seçili ajan kapsamı ile bütün filo kapsamı birbirinden açıkça ayrılıyor.
> - Başlatılan misyonda kullanılan gerçek ayarlar, talep edilen ayarlarla birlikte gösteriliyor.
> - Otomatik testler geçiyor ve ekran koyu/açık temada görsel olarak kontrol edilmiş.

Koşullar iki tür olabilir:

- **Zorunlu:** Geçmeden misyon başarılı sayılamaz.
- **İsteğe bağlı:** Değer katar; fakat geçmemesi tek başına başarıyı engellemez.

> [!IMPORTANT] “Görev tamamlandı” kanıt değildir
> Bir çalışan “düzeltmeyi yaptım” diyebilir. Başarı koşulu ise “ilgili test geçti”, “ekranda artık iki çelişkili değer görünmüyor” veya “paketin içinde gerekli dosya var” gibi denetlenebilir bir sonuç ister.

### 4.3 Constraints — aşılmaması gereken sınırlar

Sınırlar lidere neyin **yasak**, **riskli** veya **kapsam dışı** olduğunu söyler.

> [!EXAMPLE] Kullanışlı sınırlar
>
> - Var olan kullanıcı ayarlarının anlamını değiştirme.
> - İlgisiz dosyalara dokunma.
> - Silme veya veri taşıma gerekiyorsa önce kullanıcıya sor.
> - En fazla iki ajan aynı anda çalışsın.
> - Canlı üründe geniş çaplı yeniden düzenleme yapma.
> - Yalnızca belirtilen depo ve çalışma klasörü içinde çalış.

> [!WARNING] Sınır ile başarı koşulunu karıştırmayın
> “Testler geçsin” başarı koşuludur. “Üretim verisini değiştirme” sınırdır. Biri ulaşılacak kaliteyi, diğeri yolda aşılmayacak çizgiyi anlatır.

### 4.4 Project ve Workdir — bağlam ve çalışma yeri

**Project / Proje**, misyonun hangi ürün veya çalışma bağlamına ait olduğunu söyler. Proje özeti, planı ve kayıtları liderin bağlamına eklenebilir.

**Workdir / Çalışma klasörü**, çalışanların dosya işlemlerini hangi klasörde yapacağını belirler.

> [!IMPORTANT] Aynı şey değiller
> Proje, “bu çalışma hangi bütünün parçası?” sorusunu cevaplar. Çalışma klasörü ise “dosya okuma ve yazma nerede yapılacak?” sorusunu cevaplar.

> [!TIP] Kod işi yapacaksanız
> Çalışma klasörünü deponun doğru köküne ayarlayın. Bu, hem ajanların doğru dosyaları bulmasını hem de paralel çalışanların aynı yerde yazdığının sistem tarafından fark edilmesini sağlar.

### 4.5 Autonomy — lider ne kadar bağımsız ilerleyebilir?

Özerklik ayarı, liderin her turda sizden onay bekleyip beklemeyeceğini belirler.

- **Daha bağımsız çalışma:** Lider, sınırlar içinde turları kendi ilerletir.
- **Her tur onayı:** Bir sonraki turun planı uygulanmadan önce sizin onayınız istenir.

> [!TIP] Hangisini seçmeliyim?
> Geri alınabilir araştırma ve denetim işlerinde daha bağımsız çalışma rahattır. Canlı sistem, maliyetli işlem, hassas dosya veya yönü kolay değişebilecek bir işte tur onayı daha güvenlidir.

### 4.6 Başlatmadan önce beş soruluk kontrol

> [!CHECK] Başlatma kontrolü
>
> 1. Hedefim bir faaliyet değil, sonuç tarif ediyor mu?
> 2. En az bir zorunlu başarı koşulum var mı?
> 3. Dokunulmaması gereken yerleri yazdım mı?
> 4. Doğru çalışma klasörünü seçtim mi?
> 5. Lider ve çalışan kapsamı gerçekten istediğim kişiler mi?

---

## 5. Lider, çalışanlar ve kapsam seçimi

Bu bölüm, oluşturucu ekranındaki en çok karıştırılan ayrımı açıklar: **Lider kim? Kimler çalışabilir? Bütün filo mu, yalnız seçtiklerim mi?**

### 5.1 Lead / Lider seçimi

Lider, misyonun her turunda “şimdi ne yapılmalı?” kararını veren ajandır. İyi bir lider:

- hedefin alanını anlayabilecek,
- sonuçlar arasında seçim yapabilecek,
- hata ve belirsizliği yönetebilecek,
- çalışanların ürettiği bilgiyi birleştirebilecek

bir ajan olmalıdır.

> [!EXAMPLE] Örnek seçim
> Bir yazılım hatası ve sürüm teslimi için `developer` iyi bir lider olabilir. Çok alanlı bir karar veya sistem tasarımı için `manager` daha uygun olabilir.

Sistem, **Auto lead / Otomatik lider** seçeneği sunuyorsa hedefe ve mevcut ajan yeteneklerine göre bir lider önerebilir. Otomatik seçim, rastgele seçim anlamına gelmez.

> [!NOTE] Bugünkü eksik görünürlük
> Mevcut oluşturucuda otomatik liderin kim olacağı ve neden seçildiği Başlatmadan önce yeterince açık gösterilmeyebilir. Hazırlanan U-100 düzenlemesinde bu bilgi önizleme olarak görünür olacaktır.

### 5.2 Pool / Çalışan havuzu

Çalışan havuzu, liderin görev verebileceği ajanlar kümesidir. Havuzdaki her ajanın mutlaka iş alması gerekmez; lider yalnızca ihtiyaç duyduklarını çağırabilir.

> [!IMPORTANT] Havuz bir görev listesi değildir
> Bir ajanı havuza koymak “bu ajan kesin çalışacak” demek değildir. “Lider gerek görürse bu ajanı kullanabilir” demektir.

Lider, çalışan havuzunun dışında da olabilir. Yani bir ajan misyonu yönetebilir ama çalışan olarak görev almasına izin verilmeyebilir.

### 5.3 Bütün filo mu, seçili ajanlar mı?

Kullanıcının anlatmak istediği iki ayrı kapsam vardır:

- **Whole fleet / Bütün filo:** Uygun olan bütün ajanlar liderin kullanımına açıktır.
- **Selected agents / Seçili ajanlar:** Lider yalnızca işaretlediğiniz ajanlara görev verebilir.

> [!WARNING] Bugünkü ekranda bu ayrım yeterince açık değildir
> Mevcut davranışta boş veya dolu seçimlerin anlamı ekrandan kolayca okunamayabilir. Hazırlanan U-102 düzenlemesi bu tercihi iki açık seçenek hâline getirecektir. O zamana kadar Başlatmadan önce seçili çalışan satırlarını dikkatle kontrol edin.

### 5.4 Lider çalışan olarak da görev alabilir mi?

Evet. Lider havuzda bulunuyorsa kendisine de somut bir görev verebilir. Fakat:

- liderlik kararı ayrı planlama oturumunda,
- somut işi ayrı çalışan oturumunda

yürür.

> [!EXAMPLE] Aynı kimlik, iki ayrı iş
> `developer` lider olarak “önce kök neden araştırılsın” kararını verir. Sonra bir çalışan görevi olarak kendisine “bu üç dosyadaki akışı incele” işi açabilir. Planlama konuşması ile kod inceleme konuşması birbirine karışmaz.

---

## 6. Motor, model, düşünme düzeyi ve izinler

Bu dört ayar birbirine benzer görünür; ama farklı soruları cevaplar.

| Ayar | Gündelik karşılığı | Cevapladığı soru |
| :-- | :-- | :-- |
| **Engine / Motor** | Kullanılan yapay zekâ hizmeti | Ajan nerede çalışacak? |
| **Model** | O hizmet içindeki model | Hangi model kullanılacak? |
| **Effort** | Düşünme düzeyi | Model bu işe ne kadar yoğun düşünecek? |
| **Permission** | Yetki düzeyi | Ajan hangi işlemleri yapabilecek? |

### 6.1 Motor

Motor, Claude, Codex, Gemini gibi çalışma ortamını seçer. Bir ajanın farklı işlerde farklı motorla çalışması mümkündür.

### 6.2 Model

Model, seçilen motorun içindeki belirli modeldir. Örneğin aynı motor hızlı ve ekonomik bir model ile daha güçlü bir model sunabilir.

> [!TIP] Model seçiminde pratik yaklaşım
> Mekanik, iyi tanımlanmış işler için daha ekonomik model; mimari karar, karmaşık hata veya çok kaynaklı sentez için daha güçlü model seçin.

### 6.3 Effort / Düşünme düzeyi

Düşünme düzeyi, modelin karar üretirken ne kadar yoğun muhakeme kullanacağını belirler. Daha yüksek değer genellikle daha fazla zaman ve kaynak kullanır; her işte daha yüksek olmak zorunda değildir.

### 6.4 Permission / İzin

İzin ayarı, ajanın dosya değiştirme, komut çalıştırma veya daha hassas işlemler yapma sınırını belirler. Motor ve model “nasıl düşünecek?”, izin ise “ne yapmasına müsaade var?” sorusudur.

### 6.5 Bir alanı boş bırakırsam ne olur?

Boş alan “rastgele seç” anlamına gelmez. Agent Farm, daha özel ayardan daha genel ayara doğru bakar.

#### Çalışan motoru için

1. O çalışanın satırında motor seçildiyse onu kullanır.
2. Satır boşsa misyonun genel çalışan motoruna bakar.
3. O da boşsa filonun o ajan için ayarlanmış varsayılanına bakar.
4. Son çare olarak komut satırı varsayılanını kullanır.

#### Çalışan modeli ve düşünme düzeyi için

1. Çalışan satırındaki seçim,
2. Agent Farm’da o ajan ve motor için kayıtlı seçim,
3. filo varsayılanı,
4. motorun komut satırı varsayılanı

sırasıyla kullanılır.

> [!NOTE] Claude için özel durum
> Claude kendi ajan ayar dosyasını doğrudan okuyabildiği için, Claude görevlerinde Agent Farm’ın ajan başına ara ayar katmanı atlanabilir. Sonuç yine rastgele değildir; Claude’un kendi ayarı ve filo/komut satırı varsayımları devreye girer.

#### İzin için

1. Çalışan satırındaki izin,
2. filo varsayılanı,
3. komut satırı varsayılanı

kullanılır.

### 6.6 “Hangi ayar gerçekten uygulandı?” sorusu

Sistemde bir ayarın yalnızca değeri değil, **nereden geldiği** de kaydedilir:

- çalışan satırı,
- misyon geneli,
- ajan ayarı,
- filo ayarı,
- komut satırı varsayılanı.

Bu kaynak bilgisi, “Ben bunu seçtim ama niçin başka değer çalıştı?” sorusunu cevaplamak içindir.

> [!EXAMPLE] Somut örnek
> `developer` satırında motor **Codex** seçili. Misyonun genel çalışan motoru **Gemini**. Bu durumda `developer` **Codex** ile çalışır; çünkü satırdaki özel seçim genel seçimden önce gelir.

### 6.7 Bugünkü “Delegation engine” alanının gerçek anlamı

Mevcut oluşturucudaki **Delegation engine** alanı, adı yüzünden “bütün çalışanları bu motora geçir” gibi anlaşılabilir. Bugünkü davranışı bu değildir.

Bu alan:

- satırında motor seçilmiş çalışanı değiştirmez;
- yalnızca motor satırı boş kalan çalışanlara genel bir yedek değer sağlar;
- görünen çalışan satırlarını anında güncellemez.

> [!WARNING] En önemli mevcut arayüz tuzağı
> Genel alanda **Gemini**, çalışan satırında **Codex** görüyorsanız, o çalışan Codex ile çalışır. Genel alan satırdaki seçimi ezmez. Ekran bu sonucu yeterince açık göstermediği için kullanıcı iki çelişkili değer görür.

### 6.8 Hazırlanan doğru toplu ayar davranışı

U-101 düzenlemesiyle toplu profil, gizli bir ikinci varsayılan olmayacaktır. Kullanıcı:

1. motor, model, düşünme düzeyi ve izin profilini seçer;
2. **Seçili çalışanlara uygula** benzeri açık bir işlem yapar;
3. çalışan satırlarının gözle görülür biçimde değiştiğini görür;
4. isterse tek bir satırı sonradan farklılaştırır.

> [!SUCCESS] Doğru kullanıcı beklentisi
> Toplu bir seçim yaptığınızda etkisini satırlarda görmelisiniz. Satırda ne görünüyorsa Başlatıldığında da onun uygulanacağını öngörebilmelisiniz.

### 6.9 Liderin modeli ile çalışanların modeli aynı ayar değildir

Liderin planlama modeli, çalışan görevlerinde kullanılan modelleri değiştirmez. Bunlar iki ayrı seçimdir:

- **Planner model:** Liderin misyon kararlarını hangi modelle vereceği.
- **Worker model:** Somut görevi yapan çalışanın hangi modelle çalışacağı.

> [!NOTE] Bugünkü planner effort durumu
> Liderin planlama modeli ve planlama **düşünme düzeyi** için ayrı seçimler vardır; ikisi de Orchestrator bölümündedir ve otomatik lider önizlemesiyle birlikte gösterilir (U-100 / X-121).
>
> İkisi de boş bırakıldığında değer havada kalmaz, bir merdivenden çözülür: **misyonun kendi override'ı → `agentFarm.taskExtraArgs` içindeki bayrak (komut satırında olduğu için dosyayı yener) → lead ajanın klasöründeki `.claude/settings*.json` zinciri (yalnız model; Claude Code'un settings.json'ında effort anahtarı yoktur) → CLI'nin kendi varsayılanı.** Misyon bir boyutu override ettiğinde extra-args'teki aynı bayrak satırdan çıkarılır, düşen bayrak adıyla raporlanır ve önizleme değeri kimin söylediğini yazar.

---

## 7. Başlat düğmesinden sonuca kadar ne olur?

Başlat’a bastığınız anda sistem tek seferde uzun bir komut çalıştırmaz. Kontrol edilen, kayıt altına alınan bir karar döngüsü başlar.

```text
1. FORM DOĞRULANIR
   Hedef, kriterler, sınırlar, lider ve ekip okunur.
                 │
                 ▼
2. MİSYON KAYDI AÇILIR
   Kimlik, başlangıç ayarları ve ilk iz kaydı oluşturulur.
                 │
                 ▼
3. LİDER KARAR VERİR
   “Şimdi hangi hareket yapılmalı?” sorusunu cevaplar.
                 │
                 ▼
4. ÇALIŞANLAR İŞİ YAPAR
   Görevler ayrı oturumlarda yürür; sonuçlar geri gelir.
                 │
                 ▼
5. SONUÇLAR KAYDEDİLİR
   Çıktılar, hatalar, maliyet ve konuşmalar görünür olur.
                 │
                 ▼
6. BAŞARI DENETLENİR
   Kriterler için kanıt ve geçme durumu güncellenir.
                 │
                 ▼
7. LİDER YENİDEN KARAR VERİR
   Devam / düzelt / yön değiştir / kullanıcıya sor / bitir
                 │
          ┌──────┴──────┐
          │             │
       DEVAM          KAPANIŞ
```

### 7.1 Form doğrulama ve ön kontrol

Sistem önce hedefin, liderin, çalışan kapsamının ve sınırların kullanılabilir olup olmadığını kontrol eder. Eksik bir ajan veya geçersiz hedef varsa çalışma başlamadan hata verebilir.

### 7.2 Misyonun kaydı

Misyon için kalıcı bir kimlik açılır. Başlangıç ayarları saklanır ve bundan sonraki önemli olaylar sıralı bir iz kaydına eklenir.

### 7.3 Liderin ilk kararı

Lider hedefi, başarı koşullarını, sınırları ve kullanılabilir ajanları görür. İlk turda bir veya birkaç iş açabilir, önce soru sorabilir, bir tartışma başlatabilir ya da planın yetersiz olduğunu görürse yeni yaklaşım kurabilir.

> [!NOTE] Lider bütün işi kendi yapmaz
> Planlama sırasında dosya yazma, terminal komutu çalıştırma veya başka ajanı kendi içinden çağırma araçları kapalıdır. Liderin görevi **karar vermek ve Agent Farm’a ne yapacağını söylemektir**. Somut çalışma, kayıtlı çalışan hareketleri üzerinden yürür.

### 7.4 Çalışan oturumları

Her somut görev, ilgili ajanın ayrı Task oturumunda yürür. Ajan:

- görev açıklamasını,
- gerekli hedef bağlamını,
- çalışma klasörünü,
- kendisine verilen sınırları

alır ve sonucunu geri döndürür.

### 7.5 Sonucun lidere dönmesi

Lider yalnızca “başarılı/başarısız” etiketi görmez. Çalışanın gerçek çıktısını, hata sınıfını, kanıt bağlantılarını ve önceki kararların kısa kaydını görür.

### 7.6 Bir sonraki tur

Bir turun sonuçları tamamlandığında lider yeniden çağrılır. Şunlardan birini seçebilir:

- yeni iş vermek,
- aynı işi düzelttirmek,
- sonuçları karşılaştırmak,
- başarı koşulunu ölçtürmek,
- yaklaşımı değiştirmek,
- size soru sormak,
- misyonu bitirmek veya durdurmak.

> [!TIP] Adaptifliğin bulunduğu yer
> Sistem “sekiz tur çalış” diye körlemesine dönmez. Her tur, bir önceki turun gerçek sonuçlarına göre yeni karar üretir.

### 7.7 Kapanış

Lider bitirme kararı verdiğinde sistem zorunlu başarı koşullarının durumuna bakar. “İşler bitti” demek tek başına yeterli değildir. Kapanışta:

- sonuç özeti,
- başarı değerlendirmesi,
- durma nedeni,
- kalan eksikler veya belirsizlikler

kaydedilir.

---

## 8. Tur, dalga ve paralel çalışma

Misyon ekranında `Round`, `Wave` ve `Parallel` kelimelerini görebilirsiniz. Bunlar aynı şeyi anlatmaz.

### 8.1 Round / Tur

Bir tur, liderin bir karar vermesiyle başlar ve o karara bağlı işler tamamlanıp sonuçlar lidere döndüğünde biter.

> [!EXAMPLE] Bir tur
>
> 1. Lider iki ajanın farklı çözüm yollarını incelemesini ister.
> 2. İki ajan çalışır.
> 3. Sonuçlar kaydedilir.
> 4. Tur kapanır.
> 5. Lider bir sonraki turda sonuçları karşılaştırmaya karar verir.

### 8.2 Wave / Dalga

Bir tur içinde birkaç iş olabilir. Aynı anda güvenle başlayabilecek işler bir **dalga** içinde gruplanır. Birinci dalganın sonucuna ihtiyaç duyan işler sonraki dalgaya kalır.

```text
TUR 1
  Dalga 1: Araştırma A ─┐
           Araştırma B ─┤ aynı anda
                        ▼
  Dalga 2: Sonuçları karşılaştır
                        ▼
  Dalga 3: Seçilen çözümü uygula
```

### 8.3 Parallel / Paralel çalışma

Paralel çalışma, birbirinden bağımsız işlerin aynı anda yürütülmesidir. Süreyi kısaltabilir; fakat her iş paralel olmaya uygun değildir.

> [!TIP] Paralel çalışmaya uygun işler
>
> - İki farklı kaynağı araştırmak
> - Aynı çözümü iki ayrı açıdan incelemek
> - Birbirinden bağımsız testleri yürütmek

> [!WARNING] Aynı dosyaya iki yazıcı gönderilmez
> Çalışma klasörü tanımlıysa Agent Farm aynı dalgada en fazla bir yazma işi çalıştırır. Birden çok ajanın aynı dosyaları aynı anda değiştirmesi çakışma ve veri kaybı riski doğurur. `Parallel` seçmek bu güvenlik kuralını kaldırmaz.

### 8.4 “En fazla paralel iş” ayarı

`Max parallel`, aynı anda kaç çalışan işinin yürüyebileceğine üst sınır koyar. Varsayılan değer **2**’dir.

Bu değer 4 olsa bile sistem her zaman dört iş başlatmaz. Yalnızca birbirinden bağımsız ve güvenli dört iş varsa bunu yapabilir.

> [!IMPORTANT] Paralellik izin değil, kapasitedir
> “En fazla 4” demek “mutlaka 4 ajan çalıştır” demek değildir. Liderin aynı anda açabileceği güvenli iş sayısının tavanıdır.

---

## 9. Liderin kullanabildiği 14 hareket

Teknik kayıtlarda bu hareketlerin İngilizce adlarını görürsünüz. Bunlar programlama komutu öğrenmeniz gereken bir dil değildir; liderin bir sonraki turda **ne yapmayı seçtiğini** gösteren açık etiketlerdir.

Bu bölümde her hareket için dört soruyu cevaplayacağız:

1. Gündelik dilde nedir?
2. Ne zaman kullanılır?
3. Sistem ne yapar?
4. Neyle karıştırılmamalıdır?

### 9.1 Bir ajana tek iş vermek — `delegate`

**Gündelik anlamı:** “Bu somut işi şu ajan yapsın.”

> [!EXAMPLE] Örnek
> Lider `developer` ajanına “Filtre alanındaki imleç kaybının kök nedenini bul; henüz kod değiştirme” görevini verir.

**Ne zaman seçilir?**

- Tek bir açık iş varsa,
- işi yapacak uygun ajan belliyse,
- önce bu sonucun gelmesi gerekiyorsa.

**Sistem ne yapar?** Seçilen ajan için bir görev kaydı ve ayrı bir çalışan oturumu açar. İş tamamlandığında gerçek çıktı lidere döner.

> [!WARNING] Şununla karıştırmayın
> `delegate`, “bütün misyonu başka ajana devret” değildir. Misyonun lideri değişmez; yalnızca bir çalışma adımı verilir.

### 9.2 Bağımsız işleri aynı anda yaptırmak — `parallel`

**Gündelik anlamı:** “Birbirini beklemeyen bu işleri aynı anda başlat.”

> [!EXAMPLE] Örnek
>
> - Bir ajan mevcut kod akışını incelesin.
> - Başka bir ajan ilgili testleri ve geçmiş hataları incelesin.
> - İkisi de bitince lider bulguları birlikte değerlendirsin.

**Ne zaman seçilir?** İşler birbirinin sonucuna ihtiyaç duymuyorsa ve aynı dosyalara yazmayacaksa.

**Sistem ne yapar?** Güvenli olan işleri aynı dalgaya koyar; paralellik sınırına ve tek-yazıcı kuralına uyar.

> [!IMPORTANT] Aynı anda başlatılması, sonuçların karıştırılması demek değildir
> Her işin görevi, oturumu, çıktısı ve hata durumu ayrı kaydedilir.

### 9.3 Yapılan işi inceletmek — `review`

**Gündelik anlamı:** “Ortaya çıkan işi başka bir gözle kontrol et.”

> [!EXAMPLE] Örnek
> Bir ajan kod düzeltmesini yaptı. Lider başka bir ajandan “Davranış bozulması, eksik test ve kapsam dışı değişiklik var mı?” diye inceleme ister.

**Ne zaman seçilir?**

- Bir çıktı teslim edildiyse,
- kalite veya güvenlik kontrolü gerekiyorsa,
- yapan ajan dışında ikinci bir bakış değer katacaksa.

**Sistem ne yapar?** İncelenecek gerçek çıktıyı veya işi denetçiye bağlar. Denetçi neyi incelediğini bilir ve bulgularını o çalışmaya referansla döndürür.

> [!WARNING] Review başarı kriteri değildir
> İnceleme “işte sorun görüyor muyum?” sorusuna cevap verir. `evaluate` ise “tanımlı başarı koşulu kanıtla geçti mi?” sorusunu cevaplar.

### 9.4 Birden fazla sonucu karşılaştırmak — `compare`

**Gündelik anlamı:** “Bu seçenekleri aynı ölçülerle yan yana değerlendir.”

> [!EXAMPLE] Örnek
> İki ajan farklı arayüz çözümü önerdi. Lider; anlaşılabilirlik, mevcut ayarlarla uyum ve uygulama riski ölçülerine göre karşılaştırma ister.

**Ne zaman seçilir?**

- Birden fazla aday sonuç varsa,
- seçeneklerin artı ve eksileri birlikte görülmek isteniyorsa,
- karar yalnızca en son gelen çıktıya göre verilmemeliyse.

**Sistem ne yapar?** Karşılaştırıcı ajana adayların gerçek çıktılarını ve karşılaştırma ölçülerini verir.

> [!TIP] İyi karşılaştırmanın sırrı
> “Hangisi daha iyi?” yerine “hangi ölçülere göre hangisi daha uygun?” diye sorun.

### 9.5 Mevcut işi düzelttirmek — `revise`

**Gündelik anlamı:** “Aynı yaklaşımı koru; şu eksikleri gider.”

> [!EXAMPLE] Örnek
> Rehberin içeriği doğru, fakat dili fazla teknik. Lider “aynı kapsamı koruyarak kavramları gündelik dille yeniden anlat ve callout kutuları ekle” der.

**Ne zaman seçilir?**

- Temel yaklaşım doğruysa,
- ortaya çıkan işte belirli eksikler varsa,
- baştan yeni plan kurmaya gerek yoksa.

**Sistem ne yapar?** Önceki çalışma ve geri bildirim arasındaki bağı koruyarak bir düzeltme görevi açar.

> [!IMPORTANT] Revise ile replan ayrımı
> `revise` ürünü veya çıktıyı düzeltir. `replan` ise o ürüne ulaşma yolunun yanlış olduğunu kabul edip stratejiyi değiştirir.

### 9.6 Başarı koşulunu ölçmek — `evaluate`

**Gündelik anlamı:** “Bu zorunlu koşul gerçekten geçti mi? Kanıtla.”

> [!EXAMPLE] Örnek
> Başarı koşulu: “Toplu ayar uygulandığında bütün seçili çalışan satırları görünür biçimde güncelleniyor.” Değerlendiren ajan ekran davranışını veya testi inceler ve **geçti**, **geçmedi** ya da **belirsiz** kararı verir.

**Ne zaman seçilir?**

- Bir başarı koşulu hakkında yeterli çıktı oluştuysa,
- misyonu kapatmadan önce kanıt gerekiyorsa,
- önceki değerlendirme yeni değişiklik yüzünden eskidiyse.

**Sistem ne yapar?** Değerlendirmeyi belirli bir başarı koşuluna bağlar; kararı, kanıtı ve önerilen sonraki adımı kaydeder.

> [!WARNING] “Çalışan tamamladı” ile “kriter geçti” aynı kayıt değildir
> Çalışanın işi bitmiş olabilir; fakat başarı koşulu hâlâ geçmemiş veya belirsiz olabilir.

### 9.7 Hazır bir iş akışını çalıştırmak — `run_workflow`

**Gündelik anlamı:** “Bu tekrar kullanılabilir, önceden tanımlı adımlar dizisini burada çalıştır.”

> [!EXAMPLE] Örnek
> Lider, çözüm tamamlandıktan sonra mevcut “test et → paketle → paketi doğrula” iş akışını çalıştırır.

**Ne zaman seçilir?**

- İhtiyaç duyulan süreç daha önce Workflow olarak tanımlandıysa,
- adımların yeniden tasarlanmasına gerek yoksa,
- aynı güvenilir süreç tekrar kullanılacaksa.

**Sistem ne yapar?** İş akışını misyonun bir adımı olarak başlatır ve sonucunu lidere geri bağlar.

> [!TIP] Neden faydalı?
> Lider her defasında paketleme adımlarını yeniden tarif etmek yerine, kanıtlanmış iş akışını yapı taşı olarak kullanabilir.

### 9.8 Alt bir misyon açmak — `run_mission`

**Gündelik anlamı:** “Bu büyük alt hedefi, kendi lideri ve turları olan ayrı bir misyon olarak çöz.”

> [!EXAMPLE] Örnek
> Ana hedef bir ürün sürümüdür. “Erişilebilirlik sorunlarını eksiksiz incele ve düzelt” bölümü kendi başına araştırma, uygulama ve değerlendirme gerektirdiği için alt misyon açılır.

**Ne zaman seçilir?**

- Alt iş tek görevden daha büyükse,
- kendi başarı koşullarına ve karar döngüsüne ihtiyaç duyuyorsa,
- ana misyonun içinde yönetilmesi gereksiz karmaşıklık yaratacaksa.

**Sistem ne yapar?** Yeni bir child/alt misyon başlatır, onu ana misyona bağlar ve sonucu ana lidere döndürür.

> [!WARNING] Her işi alt misyona çevirmeyin
> Bir dosyayı incelemek için alt misyon gerekmez. Alt misyon, gerçekten kendi yönetim döngüsüne ihtiyaç duyan sonuçlar içindir.

### 9.9 Bir ajanın başka bir ajana doğrudan söylemesi — `message`

**Gündelik anlamı:** “Bu ajan, şu ajana gerçek bir mesaj göndersin ve cevabı konuşma kaydına işlensin.”

> [!EXAMPLE] Örnek
> Uygulayıcı ajan, denetçiye “Şu iki varsayımı özellikle sınar mısın?” diye soru gönderir. Denetçi kendi oturumunda yanıt verir.

**Ne zaman seçilir?**

- Bir ajanın bulgusu başka ajan tarafından açıklığa kavuşturulacaksa,
- soru, itiraz, kanıt veya yanıtın kime ait olduğu önemliyse,
- konuşmanın gerçek görev oturumunda sürmesi gerekiyorsa.

**Sistem ne yapar?** Alıcı ajan için yeni veya devam eden bir konuşma görevi açar; mesajı, cevabı ve aralarındaki bağı kaydeder.

> [!IMPORTANT] Bu dekoratif sohbet değildir
> Ekrandaki konuşma, sistemin sonradan ürettiği bir özet değil; ajana gerçekten gönderilen mesaj ve ajanın gerçek cevabıdır.

### 9.10 Bir konuyu kurul hâlinde tartıştırmak — `council`

**Gündelik anlamı:** “Birden fazla ajan, tek bir karar sorusunu düzenli biçimde tartışsın.”

> [!EXAMPLE] Örnek
> “Toplu çalışan ayarı kalıcı bir varsayılan mı olmalı, yoksa yalnızca satırlara uygulanan görünür bir işlem mi olmalı?”

Lider katılımcıları, tartışma sorusunu, oturumu yönetecek başkanı ve en fazla konuşma sayısını belirler.

**Sistem ne yapar?** Ajanların sırayla öneri, soru, itiraz, kanıt ve yanıt üretmesini sağlar; tartışmayı belirli bir çıkış nedeni oluşunca kapatır.

> [!WARNING] Council ikinci bir karar motoru değildir
> Kurul, kanıt ve görüş üretir. Misyonun hedefi başarıldı mı sorusunu tek başına cevaplamaz ve başarı koşullarının yerini tutmaz.

### 9.11 Çalışma yolunu değiştirmek — `replan`

**Gündelik anlamı:** “Mevcut yaklaşım yeterli değil; yeni bir yol kur.”

> [!EXAMPLE] Örnek
> Ekrandaki hatanın yalnızca görünüm sorunu olmadığı, ayar çözümleme mantığından kaynaklandığı bulundu. Lider yalnız CSS düzeltme planını bırakıp veri kaynağını tekleştiren yeni stratejiye geçer.

**Ne zaman seçilir?**

- Temel varsayım yanlış çıktıysa,
- aynı tür düzeltmeler hedefe yaklaştırmıyorsa,
- yeni bulgu çalışma sırasını kökten değiştiriyorsa.

**Sistem ne yapar?** Strateji sürümünü artırır, değişme gerekçesini kaydeder ve sonraki kararları yeni yaklaşım altında toplar.

### 9.12 Misyonu başarıyla kapatmak — `finish`

**Gündelik anlamı:** “Hedef için yeterli kanıt oluştu; sonucu kapat.”

Lider bir sonuç özeti ve bitirme gerekçesi verir. Sistem zorunlu başarı koşullarının durumunu kontrol eder.

> [!IMPORTANT] Finish sihirli bir başarı damgası değildir
> Lider `finish` dese bile zorunlu kriterler geçmemişse sistem bunu çelişkisiz biçimde başarılı sonuç olarak kabul etmemelidir. Başarı kapısı, kriter kayıtlarıyla birlikte çalışır.

### 9.13 Kullanıcıya soru sormak — `ask_user`

**Gündelik anlamı:** “Bu kararı doğru vermek için iş sahibinin tercihi gerekiyor.”

> [!EXAMPLE] Örnek
> “Eski kayıtlarla tam uyumluluk mu daha önemli, yoksa daha sade fakat dönüştürme gerektiren yeni yapı mı?”

**Ne zaman seçilir?**

- İki seçenek teknik olarak mümkün ama ürün tercihi gerekiyorsa,
- yetki veya kapsam kullanıcıdan gelmeliyse,
- varsayım yapmak önemli bir karar doğuracaksa.

**Sistem ne yapar?** Misyonu kullanıcı cevabı bekleyen duruma alır. Cevap geldiğinde aynı misyon kaldığı yerden sürer.

> [!TIP] Bekleme süreye sayılmaz
> Sistem kullanıcının cevap vermesini beklerken geçen süreyi misyonun çalışma süresi bütçesine eklemez.

### 9.14 Misyonu bilinçli biçimde durdurmak — `abort`

**Gündelik anlamı:** “Bu koşullarda güvenli veya anlamlı biçimde devam edemiyoruz.”

> [!EXAMPLE] Örnek
> Gerekli depo bulunamadı, istenen işlem sınırlarla çelişiyor veya devam etmek veri kaybı riski doğuruyor.

**Sistem ne yapar?** Çalışmayı durdurur; bunun bir hata, güvenlik kararı veya karşılanamayan ön koşul olduğunu gerekçesiyle kaydeder.

> [!WARNING] Abort başarısızlığı gizlemez
> “Neden durdu?” sorusunun cevabı kapanış kaydında bulunmalıdır. İptal edilen, bütçede duran ve liderin bilinçli durdurduğu çalışmalar birbirinden ayrılır.

### 9.15 On dört hareketi hatırlamanın kolay yolu

| Kullanıcının anlayacağı grup | Liderin yapabildikleri |
| :-- | :-- |
| **İş yaptır** | Tek iş ver (`delegate`), bağımsız işleri birlikte başlat (`parallel`) |
| **Çıktıyı geliştir** | İncele (`review`), karşılaştır (`compare`), düzelt (`revise`) |
| **Başarıyı ölç** | Kriteri kanıtla (`evaluate`) |
| **Hazır yapıları kullan** | İş akışı çalıştır (`run_workflow`), alt misyon aç (`run_mission`) |
| **Ajanları konuştur** | Mesaj gönder (`message`), kurul tartışması aç (`council`) |
| **Yönü ve yaşam döngüsünü yönet** | Yeni yol kur (`replan`), kullanıcıya sor (`ask_user`), bitir (`finish`), durdur (`abort`) |

### 9.16 Neden bazı hareketler önceki işi seçtirir?

`review`, `compare` ve `revise` serbest bir metni rastgele incelemez. Lider hangi gerçek önceki adımın veya çıktının hedef olduğunu kayıt kimliğiyle belirtir.

> [!EXAMPLE] Örnek
> “Önceki işi incele” yerine “Tur 3’teki arayüz uygulama çıktısını incele” denir. Karşılaştırmada da aday A ve aday B açıkça bağlanır.

Bu bağ:

- denetçinin neyi gördüğünü kanıtlar,
- düzeltmenin hangi çıktının devamı olduğunu gösterir,
- yanlış veya henüz tamamlanmamış bir işe inceleme bağlanmasını engeller,
- çalışma grafiğini tahmine değil gerçek ilişkiye dayandırır.

> [!WARNING] Hedef kayıt bulunamazsa sistem uydurmaz
> Önceki iş kayıp, tamamlanmamış veya yanlış türdeyse hareket `target-missing` gibi açık bir hata verir. Lider doğru kaynağı seçmeli ya da yeni bağımsız görev açmalıdır.

---

## 10. Ajanların birbirleriyle konuşması

Adaptif misyondaki konuşmalar, süs amaçlı sohbet balonları değildir. Bir ajanın başka bir ajana gerçekten gönderdiği mesajlar ve karşı tarafın gerçek cevaplarıdır.

### 10.1 Konuşmanın neden bir türü var?

Her mesajın amacı etiketlenir. Bu sayede ekrana bakan kişi “Bu cümle yeni bir öneri mi, bir itiraz mı, yoksa önceki sorunun cevabı mı?” anlayabilir.

| Ekrandaki ad | Gündelik anlamı | Ne söyler? |
| :-- | :-- | :-- |
| `proposal` | Öneri | “Şöyle yapmayı öneriyorum.” |
| `question` | Soru | “Şu noktayı açıklar mısın?” |
| `challenge` | İtiraz / sınama | “Bu varsayımın doğru olduğundan emin miyiz?” |
| `response` | Yanıt | “Sorunun veya itirazın cevabı şu.” |
| `evidence` | Kanıt | “Bu iddiayı şu bulgu destekliyor.” |
| `concede` | Kabul | “İtiraz haklı; önceki görüşümü düzeltiyorum.” |
| `synthesis` | Sentez | “Görüşleri birleştirince çıkan sonuç bu.” |
| `vote` | Oy / tercih | “Belirtilen seçenekler içinde tercihim bu.” |

> [!TIP] Etiketleri ezberlemeniz gerekmez
> Ekranda İngilizce adı gördüğünüzde yukarıdaki anlamı okuyabilmeniz yeterlidir. Mesajın asıl değeri, türünden çok metni ve dayandığı kanıttır.

### 10.2 Bir mesaj neye cevap veriyor?

Bir yanıt veya itiraz, havada duran bir cümle değildir. `Ref` bağlantısı, “Bu mesaj daha önceki hangi mesaja cevap veriyor?” sorusunu gösterir.

> [!EXAMPLE] Örnek zincir
>
> 1. Ajan A — **Öneri:** “Toplu profil satırlara uygulanmalı.”
> 2. Ajan B — **İtiraz, 1’e bağlı:** “Tek tek özel ayarlar kaybolabilir.”
> 3. Ajan A — **Yanıt, 2’ye bağlı:** “Yalnız seçili satırlar değişir; sonradan tek satır yeniden düzenlenebilir.”
> 4. Ajan C — **Kanıt, 3’e bağlı:** “Mevcut matris bileşeni bu değişikliği tek işlemde destekliyor.”

Bu bağlantılar sayesinde bir konuşma yalnızca tarih sırasına göre değil, düşünce ilişkisine göre de okunabilir.

### 10.3 Open thread / Açık konu nedir?

Bir **soru** veya **itiraz** henüz uygun bir yanıt almadıysa açık konu sayılır. Konuşma ekranı böylece tartışmada cevapsız bırakılan noktaları gösterebilir.

> [!WARNING] Son mesaj gelmiş olması, konunun kapanması demek değildir
> Bir ajan yeni bir öneri yazmış olabilir; fakat önceki itirazı cevaplamamışsa o itiraz açık kalır.

### 10.4 Konuşma oturumları nasıl sürer?

Bir ajana konuşmada ilk kez söz verildiğinde yeni bir oturum açılabilir. Aynı ajanla aynı konu sürüyorsa oturum devam ettirilebilir. Devam mümkün değilse sistem önceki konuşmayı özetleyerek yeni bir oturuma devir yapabilir.

Ekranda bunun karşılığını şu etiketlerle görebilirsiniz:

- **new:** yeni konuşma oturumu,
- **resumed:** önceki oturum sürdürüldü,
- **handoff:** önceki bağlam yeni oturuma aktarıldı.

> [!NOTE] Neden önemli?
> Bir ajan önceki iki itirazı görmeden üçüncü kez konuşuyorsa tartışma başa sarar. Oturum sürekliliği, ajanın aynı konuşmayı gerçekten takip etmesini sağlar.

---

## 11. Council: düzenli bir kurul tartışması

`Council`, birkaç ajanın tek bir karar sorusunu sırayla ele aldığı, bir başkanın yönettiği ve ne zaman biteceği tanımlı olan konuşmadır.

### 11.1 Council ne zaman kullanılır?

Şu durumlarda yararlıdır:

- birden fazla makul yaklaşım varsa,
- uzmanlık alanları çatışıyorsa,
- önemli bir varsayımın açıkça sınanması gerekiyorsa,
- kararın gerekçesi ve karşı görüşleri kayıtta kalmalıysa.

> [!EXAMPLE] İyi council sorusu
> “Adaptif misyon oluşturucusunda toplu çalışan profili, görünmeyen çalışma zamanı varsayılanı mı olmalı; yoksa kullanıcının satırlara açıkça uyguladığı bir düzenleme işlemi mi olmalı? Kararı öngörülebilirlik, geri alınabilirlik ve mevcut özel ayarların korunması açısından tartışın.”

> [!WARNING] Kötü council sorusu
> “Sistem hakkında konuşun.”  
> Konu ve karar ölçüsü olmadığı için tartışma dağılır.

### 11.2 Council içindeki roller

- **Question / Soru:** Tartışmanın cevaplayacağı tek ana soru.
- **Members / Üyeler:** Görüş üretecek ajanlar.
- **Chair / Başkan:** Söz sırasını, açık konuları ve kapanışı yöneten ajan.
- **Turn cap / Konuşma sınırı:** Tartışmanın sonsuza kadar uzamasını engelleyen üst sınır.
- **Exit / Çıkış nedeni:** Tartışmanın neden kapandığını açıklar.

Başkan lider olmak zorunda değildir. Belirli bir konuda daha tarafsız veya uygun bir ajan başkan seçilebilir.

> [!NOTE] Konuşma sınırı nasıl sayılır?
> Sınır “kurul kaç karar verdi?”yi değil, ajanların gerçek konuşma turlarını sayar. Lider bir sonraki kararda üç konuşmacı istediyse sistem bu kararın tamamının kalan sınıra sığıp sığmadığını baştan tartar. Sığmayan tur yarım yamalak başlatılmaz. Kapanış da yalnız bir konuşmacının tek son turuyla yapılır.

### 11.3 Örnek bir kurul konuşması

> [!EXAMPLE] Kısaltılmış örnek
>
> **Başkan:** “Önce iki yaklaşımın kullanıcı açısından anlamını netleştirelim.”  
> **Ajan A — Öneri:** “Toplu profil satırlara açıkça uygulanmalı; kullanıcı sonucu hemen görür.”  
> **Ajan B — İtiraz:** “Bu, kullanıcıya özel satır ayarlarını yanlışlıkla değiştirebilir.”  
> **Ajan A — Yanıt:** “İşlem yalnız seçili satırlara uygulanır ve öncesinde etkilenecek satır sayısı gösterilir.”  
> **Ajan C — Kanıt:** “Çalışma zamanında ikinci bir varsayılan tutmak bugün ekranda çelişkili değerler üretiyor.”  
> **Başkan — Sentez:** “Görünür uygulama işlemi seçiliyor; özel satırlar ancak kullanıcı onları kapsama alırsa değişecek.”

### 11.4 Council hangi nedenlerle biter?

Sistem yedi resmi kapanış nedenini ayırır:

1. **Uzlaşma oluştu:** Katılımcılar aynı sonuca geldi.
2. **Yeterli kanıt oluştu:** Karar için gereken bilgi toplandı.
3. **Yeni bilgi kalmadı:** Konuşma kendini tekrar etmeye başladı.
4. **Karar netleşti:** Görüş ayrılığı sürse bile seçim için tablo yeterince açık.
5. **Artık uygulama gerekiyor:** Daha fazla konuşmak yerine çözümü denemek gerek.
6. **Konuşma sınırına ulaşıldı:** Tanımlı en fazla tur tüketildi.
7. **Başkan durdurdu:** Güvenlik, konu dışına çıkma veya başka bir açık gerekçeyle.

> [!IMPORTANT] “Uzlaşma” ile “çoğunluk” aynı değildir
> Üyeler oy kullanabilir; fakat sistem onların söylemediği bir uzlaşmayı uydurmaz. Oylar belirsizse belirsiz, eşitse eşit olarak kalır. Her üyenin bir oyu vardır.

> [!WARNING] Başkanın kimi çağırdığı kaydın parçasıdır
> Bir ajanın yalnızca başkanın mesajına bağlantı vermesi, o sözün kendisine verildiği anlamına gelmez. Sistem başkanın gerçekten kimi çağırdığını kontrol eder. Ayrıca açık soru veya itiraz varken “uzlaşma” kapanışı; dayandığı mesajları göstermeyen bir turda da “karar net” kapanışı kabul edilmez.

### 11.5 Council neyi yapmaz?

Council:

- kendi başına kod yazmaz,
- başarı koşulunu otomatik geçirmez,
- lideri değiştirmez,
- bütün misyonu yönetmeye başlayan ikinci bir motor değildir.

Kurulun ürettiği sentez veya karar önerisi lidere döner. Lider bunu bir sonraki hareketinde kullanır.

---

## 12. İşin bitmesi ile hedefin başarılması aynı şey değildir

Adaptif sistemin en önemli güvenlik ayrımı budur:

```text
Çalışan görevi tamamlandı
          ≠
Başarı koşulu kanıtlandı
          ≠
Bütün misyon başarıyla bitti
```

### 12.1 Task sonucu ne söyler?

Bir çalışan görevinin durumu, o çalışanın kendisine verilen işi tamamlayıp tamamlamadığını söyler.

Örneğin:

- dosyayı inceledi,
- kodu değiştirdi,
- raporu yazdı,
- komut çalıştırılamadığı için hata verdi.

### 12.2 Evaluation / Değerlendirme ne söyler?

Değerlendirme, belirli bir başarı koşulunu kanıtlar. Üç temel karar vardır:

- **pass / geçti:** Yeterli kanıt var.
- **fail / geçmedi:** Koşul karşılanmıyor.
- **unknown / belirsiz:** Karar vermek için yeterli kanıt yok.

> [!EXAMPLE] Fark
> Çalışan “filtreyi düzelttim” diyerek görevini tamamladı. Değerlendirme ise “rakam yazarken imleç artık kaybolmuyor; üç ilgili test ve gerçek ekran denemesi geçti” kanıtını arar.

### 12.3 Required / zorunlu kriterler

Zorunlu bir kriter geçmediyse misyonun başarı kapısı açılmaz. Lider “iş bitti” dese bile sistem, bunu kanıtlanmış başarıyla karıştırmamalıdır.

İsteğe bağlı kriter geçmezse misyon yine başarılı olabilir; fakat eksiklik kapanışta görünmelidir.

### 12.4 Değerlendirme neden eskir?

Bir kriter bugün geçti, ardından o kriteri etkileyebilecek yeni bir değişiklik yapıldı. Eski değerlendirme artık güncel olmayabilir. Sistem bunu **stale / eskimiş** olarak işaretleyebilir.

> [!EXAMPLE] Örnek
> Koyu temada ekran testi geçti. Sonraki turda ortak CSS değiştirildi. Önceki görsel değerlendirme artık son hâli kanıtlamaz; yeniden yapılmalıdır.

> [!IMPORTANT] Eski bir “pass” sonsuza kadar geçerli değildir
> Kanıtın bağlı olduğu çalışma değiştiğinde değerlendirme de yenilenmelidir.

### 12.5 Evaluation advice / sonraki adım önerisi

Değerlendiren ajan yalnız karar vermekle kalmayabilir; başarısız veya belirsiz koşul için ne yapılması gerektiğini de önerebilir:

- eksik testi ekle,
- şu çıktıyı yeniden incele,
- gerçek cihazda doğrula,
- iki çelişkili bulguyu karşılaştır.

Bu öneri lidere bir sonraki tur için yol gösterir; otomatik olarak uygulanmak zorunda değildir.

### 12.6 Success gate / başarı kapısı

Başarı kapısı şu mantığı korur:

```text
Bütün zorunlu kriterler güncel ve “geçti” mi?
  │
  ├─ Hayır → Misyon kanıtlanmış başarıyla kapanamaz.
  │
  └─ Evet  → Lider sonuç özetini verip başarıyla kapatabilir.
```

> [!SUCCESS] Güvenilir kapanış
> En iyi kapanış yalnızca “tamamlandı” demez; hangi zorunlu koşulun hangi kanıtla geçtiğini ve varsa hangi isteğe bağlı noktanın açık kaldığını gösterir.

### 12.7 Sonuç kararı ile durma nedeni

Kapanışta iki ayrı bilgi vardır:

- **Verdict / sonuç kararı:** `success`, `partial` veya `failed`.
- **Stop reason / durma nedeni:** Çalışmanın neden şimdi kapandığı.

| Durma nedeni | Kullanıcı dilinde |
| :-- | :-- |
| `criteria-satisfied` | Zorunlu kriterler geçti; hedef başarıldı |
| `sufficient-evidence` | Mevcut kanıtla söylenebilecek sonuç yeterli |
| `no-new-information` | Yeni denemeler aynı bilgiyi tekrarlıyor |
| `execution-over-discussion` | Daha fazla konuşma değil, ayrı gerçek uygulama gerekiyor |
| `hard-limit` | Tur, görev, maliyet, token veya süre sınırı bitti |
| `user-stop` | Kullanıcı iptal etti |

> [!IMPORTANT] Birbirleriyle çelişemezler
> `criteria-satisfied` yalnız başarı sonucuyla kullanılabilir. `hard-limit` veya `abort` başarı diye sunulamaz. `user-stop` kararını lider kendi kendine veremez; bu yalnız kullanıcı iptalinden doğar. `partial` ise tek başına “neredeyse oldu” demek değildir; karşılanmayan zorunlu kriterler açıkça gösterilmelidir.

---

## 13. Yön değiştirmek: düzeltme mi, yeni strateji mi?

Bir iş yolunda gitmediğinde iki farklı karar vardır. Bunları ayırmak, misyon geçmişini anlaşılır kılar.

### 13.1 Revise / Düzeltme

Temel yaklaşım doğru, ortaya çıkan iş eksik veya hatalıysa düzeltme yapılır.

> [!EXAMPLE] Örnek
> Arayüzün üç bölüme ayrılması doğru; fakat çalışanlar bölümündeki açıklamalar anlaşılmıyor. Aynı tasarım korunur, metin ve etkileşim düzeltilir.

### 13.2 Replan / Yeni plan

Sorun yalnız çıktı kalitesinde değil, seçilen yaklaşımın kendisindeyse yeni plan kurulur.

> [!EXAMPLE] Örnek
> Genel motor alanını daha iyi açıklamak çözüm sanılıyordu. İnceleme sonunda aynı bilginin iki bağımsız kaynağa sahip olması nedeniyle çelişkinin açıklamayla çözülemeyeceği görüldü. Strateji, tek bir çalışan matrisi doğruluk kaynağına çevrildi.

| Soru | Evetse |
| :-- | :-- |
| Aynı yaklaşım küçük düzeltmelerle hedefe varabilir mi? | `revise` |
| Temel varsayım veya yöntem yanlış mı? | `replan` |

### 13.3 Strategy version / Strateji sürümü

Strateji sürümü her turda artmaz. Yalnızca yaklaşım gerçekten değiştiğinde yeni sürüm açılır.

```text
Tur 1 — Strateji 1: Mevcut davranışı incele
Tur 2 — Strateji 1: Bulguları karşılaştır
Tur 3 — Strateji 2: Tek doğruluk kaynağı tasarımına geç
Tur 4 — Strateji 2: Tasarımı uygula ve değerlendir
```

> [!TIP] Strateji geçmişini nasıl okuyun?
> “Kaç tur sürdü?” süreci gösterir. “Kaç strateji sürümü oldu?” yaklaşımın kaç kez esaslı biçimde değiştiğini gösterir.

### 13.4 Phase / Aşama etiketi

Lider `triage`, `researching`, `building` veya `verifying` gibi kısa bir aşama adı yazabilir. Bu, sizin misyonun hangi evrede olduğunu görmeniz içindir.

> [!NOTE] Aşama adı sistemi otomatik yönlendirmez
> Lider “verifying” yazdı diye belirli bir iş akışı kendiliğinden başlamaz. Bu yalnız gözlemsel etikettir; gerçek hareket ayrı karar kaydında bulunur.

---

## 14. Çalışan misyona nasıl müdahale edilir?

Adaptif misyon bağımsız ilerleyebilir; fakat direksiyon tamamen elinizden çıkmaz. Farklı ihtiyaçlar için farklı kontrol vardır.

### 14.1 Her tur için onay vermek

Misyonu oluştururken her tur onayı seçildiyse liderin planı önce size gösterilir. Siz onaylamadan o turun çalışan işleri başlamaz.

> [!TIP] Ne zaman kullanılır?
> Hassas dosya, maliyetli çalışma, canlı ürün veya yönü sık değişebilecek bir görevde.

### 14.2 Liderin size soru sorması

`ask_user` hareketinde sistem sizden belirli bir cevap bekler. Cevabınız misyon kaydına eklenir ve lider aynı misyon içinde devam eder.

> [!IMPORTANT] Cevap vermek yeni misyon başlatmaz
> Mevcut misyonun bekleyen kararını tamamlar.

### 14.3 Guide next decision / Sonraki karara yön ver

Bu kontrol, lidere “bir sonraki kararında şu bilgiyi veya tercihi dikkate al” demenizi sağlar.

> [!EXAMPLE] Örnek
> “Bundan sonraki kararda yeni özellik eklemek yerine mevcut ekranın tutarlılığını öncele.”

Bu yönlendirme:

- şu anda çalışan görevin metnini anında değiştirmez,
- çalışan ajanın ortasına yeni komut enjekte etmez,
- liderin **bir sonraki karar sınırında** okunur.

> [!WARNING] Anlık uzaktan kumanda değildir
> Çalışan bir ajan şu anda dosya düzenliyorsa, `Guide next decision` o işi yarıda kesmez. Mevcut etkinlik sonuçlanır; lider sonraki turu sizin yönlendirmenizi görerek kurar.

### 14.4 Pause / Duraklat

Duraklatma isteği, sistemin mevcut güvenli sınırda beklemesini sağlar. Çalışmakta olan etkinlik önce sonuçlanabilir; ardından yeni iş başlatılmaz.

> [!NOTE] Pause ne yapmaz?
> Çalışan işlemi zorla öldürüp yarım dosya bırakmayı hedeflemez.

### 14.5 Resume / Devam ettir

Duraklatılmış veya kullanıcı cevabı nedeniyle bekleyen aynı misyonu kaldığı yerden sürdürür. Önceki turlar, maliyet ve kayıtlar korunur.

### 14.6 Cancel / İptal et

Misyonun devam etmesini istemiyorsanız iptal edersiniz. Bu, duraklatmadan farklıdır: normal bir “devam et” ile tekrar başlaması beklenmez.

### 14.7 Rerun / Yeniden çalıştır

Yeniden çalıştırma, öncekinin devamı değil, yeni bir misyon koşusudur. Yeni süre ve maliyet doğurur; önceki koşunun kayıtları ayrı kalır.

| İstediğiniz şey | Kullanılacak kontrol |
| :-- | :-- |
| Mevcut iş bitsin, sonra beklesin | **Pause** |
| Aynı koşu kaldığı yerden sürsün | **Resume** |
| Artık hiç devam etmesin | **Cancel** |
| Baştan yeni bir koşu başlasın | **Rerun** |
| Lider bir sonraki turda tercihinizi dikkate alsın | **Guide next decision** |

---

## 15. Süre, maliyet ve kaynak sınırları

Adaptif misyonun kendi kendine sonsuza kadar dönmemesi için altı temel sınır vardır.

| Sınır | Varsayılan | Gündelik anlamı |
| :-- | --: | :-- |
| En fazla tur | **8** | Lider en çok kaç karar turu açabilir? |
| En fazla görev | **12** | Toplam kaç çalışan işi açılabilir? |
| En fazla maliyet | **5 ABD doları** | Bildirilen parasal harcamanın tavanı |
| En fazla token | **2.000.000** | Motorların bildirdiği toplam kullanım tavanı |
| En fazla süre | **120 dakika** | Aktif çalışma için duvar saati tavanı |
| En fazla paralel iş | **2** | Aynı anda kaç çalışan işi yürüyebilir? |

### 15.1 Sıfır ne anlama gelir?

Bu sınırların sayısal değerinde **tam 0**, o sınırın kaldırılması anlamına gelir.

> [!WARNING] Sınırsızlığı bilinçli seçin
> Bir alanı 0 yapmak “çok yüksek bir limit” değil, o frenin devre dışı kalmasıdır. Özellikle tur, görev ve maliyet sınırlarını birlikte kaldırmak kontrolsüz kullanıma yol açabilir.

### 15.2 Maliyet neden 0 görünebilir?

Bazı motorlar maliyeti doğrudan bildirmeyebilir. Böyle bir koşuda maliyet `$0` görünebilir; bu, işin gerçekten ücretsiz olduğu anlamına gelmez.

> [!TIP] Maliyet bildirilmiyorsa
> Token ve süre sınırlarını da mutlaka kullanın. Tek bir ölçüye güvenmeyin.

### 15.3 Bütçe ne zaman kontrol edilir?

Sistem yeni bir iş başlatmadan önce kalan sınırları kontrol eder. Çalışan bir iş tamamlandığında bildirilen kullanım toplam kayda eklenir. Limit aşılırsa liderin yeni iş açması engellenebilir ve misyon bütçe nedeniyle durur.

> [!NOTE] Ayrılan miktar ile gerçek harcama farklıdır
> Bir işe üst sınır ayırmak, o miktarın tamamının harcandığı anlamına gelmez. Ekranda tahsis edilen kapasite ile gerçekleşen kullanımı ayrı okumak gerekir.

Bir turda istenen görevlerin son bölümü görev tavanına sığmıyorsa bu “kuyruk” adımları hiç başlatılmadan düşürülebilir. Maliyet, token ve süre ise çalışan iş sonuçlandıkça kesinleştiği için bir dalga yürürken sınıra ulaşılabilir.

> [!NOTE] Planlayıcı çağrısının ayrıca güvenlik tavanı vardır
> Bozuk cevap ve düzeltme denemelerinin sonsuz lider çağrısı üretmemesi için normal tavan `maxRounds + 6`’dır. `maxRounds: 0` bilinçli biçimde sınırsız seçildiyse bu ek tavan da kaldırılır.

### 15.4 Kullanıcı bekleme süresi

Misyon size soru sorduğu veya tur onayı beklediği sürede saat işlemeye devam ediyor gibi görünse de bu bekleme aktif çalışma süresi bütçesinden düşülür.

### 15.5 Filo günlük bütçesi ile misyon bütçesi

Filo ayarındaki günlük bütçe, bütün ajanın veya motorun günlük kullanımını sınırlar. Misyon limiti ise yalnızca o koşunun sınırıdır.

```text
FİLO GÜNLÜK BÜTÇESİ
  └─ Gün içindeki bütün çalışmalar için genel fren

MİSYON BÜTÇESİ
  └─ Yalnızca bu misyon koşusu için özel fren
```

Birinin sınırsız olması diğerini otomatik olarak sınırsız yapmaz.

> [!NOTE] Mevcut geliştirme durumu
> Filo tarafındaki `budgetsUnlimited` çalışmasının VS Code ayar yazımıyla ilgili kalan bölümü M-28 kapsamında henüz tamamlanmış değildir. Bu nedenle filo sınırsızlık seçeneğini misyon limitlerinin yerine geçen kesin bir ana şalter gibi düşünmeyin.

### 15.6 İlk kullanım için güvenli başlangıç

> [!TIP] Önerilen başlangıç profili
>
> - 4–6 tur
> - 6–10 görev
> - 1–2 paralel iş
> - karşılayabileceğiniz açık bir maliyet tavanı
> - 60–120 dakika
> - maliyet raporu zayıf motorlarda ayrıca token sınırı

İşin doğasını gördükten sonra sınırları büyütmek, baştan bütün frenleri kaldırmaktan daha güvenlidir.

---

## 16. Canlı misyon ekranı nasıl okunur?

Misyon çalışırken ekranda çok sayıda bölüm görünür. Hepsini aynı anda takip etmeye çalışmak yerine şu sırayla okuyun:

1. **Şu an ne oluyor?**
2. **Lider neden bunu seçti?**
3. **Hangi çalışan ne yaptı?**
4. **Başarı koşulları hangi durumda?**
5. **Ne kadar kaynak kullanıldı?**

### 16.1 Üst başlık: koşunun kimliği ve durumu

Başlık alanında genellikle şunları görürsünüz:

- misyonun adı veya hedefinden kısa parça,
- koşu durumu,
- lider,
- geçen süre,
- tur sayısı,
- duraklatma, devam, iptal ve yeniden çalıştırma kontrolleri.

> [!TIP] İlk bakacağınız yer
> Durum etiketi “çalışıyor”, “onay bekliyor”, “kullanıcı cevabı bekliyor”, “duraklatılmış”, “tamamlandı” veya “durduruldu” gibi misyonun neden ilerleyip ilerlemediğini söylemelidir.

### 16.2 Objective / Hedef bölümü

Burada yalnız hedef cümlesini değil:

- başarı koşullarını,
- zorunlu/isteğe bağlı ayrımını,
- sınırları,
- çalışma klasörünü ve proje bağlamını

görebilirsiniz.

> [!IMPORTANT] Hedefi ara sıra yeniden okuyun
> Uzun bir misyonda çok sayıda görev açıldığında ayrıntılar ana amacı gölgeleyebilir. Çalışan işler çok üretken görünse bile hedef ve kriterlere yaklaşmıyorsa liderin yön değiştirmesi gerekir.

### 16.3 Planner transcript / Liderin karar kaydı

Bu bölüm, liderin her turda neyi neden seçtiğini gösterir. Ham iç düşünce zinciri değildir; kullanıcıya gösterilmek üzere kaydedilmiş karar özeti ve hareket gerekçesidir.

Şunları arayın:

- o turda cevaplanmak istenen soru,
- seçilen hareket,
- seçimin dayandığı önceki sonuçlar,
- beklenen çıktı,
- varsa risk veya belirsizlik.

> [!WARNING] “Lider konuştu” ile “çalışan iş yaptı”yı ayırın
> Planner kaydı kararın kendisidir. Dosya değişikliği, araştırma veya test sonucu çalışan görevinde yaşar.

### 16.4 Live activity / Canlı etkinlik

O anda hangi işlerin çalıştığını, hangilerinin sırada veya beklemede olduğunu gösterir.

Bir iş uzun sürüyor gibi görünüyorsa önce şunlara bakın:

- gerçekten çalışıyor mu,
- onay mı bekliyor,
- başka işin sonucuna mı bağlı,
- paralellik sınırı nedeniyle sırada mı,
- aynı çalışma klasöründe yazıcı kilidi mi bekliyor?

### 16.5 Round cards / Tur kartları

Her tur kartı, o turda verilen kararı ve açılan adımları birlikte gösterir. Şu sırayla okuyabilirsiniz:

1. Turun amacı
2. Liderin seçtiği hareket
3. Hangi ajanların çağrıldığı
4. Adımların sonuçları
5. Tur sonunda çıkarılan ders

> [!TIP] Uzun misyonu hızlı okumak
> Önce tur başlıkları ve strateji değişikliklerine bakın. Ayrıntılı çalışan çıktısına yalnızca önemli kararın veya hatanın kaynağını görmek istediğinizde inin.

### 16.6 Step rows / Çalışma adımları

Bir adım satırında şu bilgiler bulunabilir:

- hareket türü,
- hedef ajan,
- durum,
- kullanılan motor/model,
- süre ve kullanım,
- çıktı özeti,
- hata varsa sınıfı,
- ilişkili görev veya oturum bağlantısı.

> [!NOTE] Bugünkü bağlantı eksikliği
> Konuşma adımlarında oturum ve çıktı bağlantıları bulunur. Normal misyon adımı satırı ve ayrıntısında ise çıktı görünse de kaynak çalışan oturumuna doğrudan geçiş bugün tamamlanmış değildir. Bu eksiklik X-96 kapsamında giderilecektir.

### 16.7 Cast / Ekip

Ekip bölümü yalnızca isim listesi olmamalıdır. Şunları anlamanıza yardım eder:

- lider kim,
- çalışan havuzunda kimler var,
- kim gerçekten görev aldı,
- hangi motor/model/izin uygulandı,
- bu ayar hangi kaynaktan geldi.

> [!QUESTION] Bir ajan neden hiç çalışmadı?
> Havuzda bulunmak yalnızca uygun olmak demektir. Lider o ajanın uzmanlığına ihtiyaç görmediyse hiç görev açmayabilir.

### 16.8 Strategy ve Runtime graph / Strateji ve çalışma grafiği

Strateji görünümü, yaklaşımın zaman içinde nasıl değiştiğini anlatır. Çalışma grafiği ise hangi kararın hangi işe, hangi işin hangi sonuca yol açtığını gösterir.

~~~text
Karar: İki çözümü araştır
  ├─ Görev A ─► Çıktı A ─┐
  └─ Görev B ─► Çıktı B ─┤
                          ▼
                    Karar: Karşılaştır
                          ▼
                    Seçilen yaklaşım
~~~

> [!TIP] Grafik ne zaman değerlidir?
> “Bu sonuca neden gelindi?” veya “Bu başarısızlık hangi önceki işe dayanıyor?” sorusunu cevaplamak istediğinizde.

Liderin `basedOn` alanı, bir kararın hangi gerçek önceki sonuçlara dayandığını söyler. Grafik yakın zamanlı işleri tahmin ederek bağ kurmaz; gerçek kayıt kimliklerini kullanır. Geçersiz bağ liderden bir kez düzeltilmesi istenen protokol hatasıdır; sistem hayali çizgi eklemez.

### 16.9 Evaluations / Değerlendirmeler

Bu bölüm, başarı koşullarının kanıt durumudur. Her kriter için:

- zorunlu mu,
- geçti/geçmedi/belirsiz mi,
- değerlendirme güncel mi,
- hangi kanıta dayanıyor,
- önerilen sonraki adım ne

bilgilerini arayın.

> [!IMPORTANT] Tamamlandı ekranında önce buraya bakın
> Misyonun güvenilir başarısı, çok sayıda görevin yeşil görünmesinden değil, zorunlu kriterlerin güncel kanıtla geçmesinden anlaşılır.

### 16.10 Conversations / Konuşmalar

Konuşmalar bölümünde:

- mesajların gerçek metni,
- kimden kime gittiği,
- mesajın türü,
- hangi mesaja cevap verdiği,
- açık kalan soru ve itirazlar,
- konuşma oturumu ve kaynak çıktı bağlantıları

görülebilir.

### 16.11 Cost, tokens ve time / Kaynak kullanımı

Bu değerleri birlikte okuyun:

- maliyet,
- token,
- aktif süre,
- görev ve tur sayısı,
- ayrılmış fakat henüz harcanmamış kapasite.

> [!WARNING] Tek rakamla karar vermeyin
> Maliyet 0 görünürken token artıyor olabilir. Süre düşükken çok sayıda paralel görev kaynak tüketmiş olabilir. Birlikte bakıldığında doğru tablo oluşur.

---

## 17. Oturumlar, çıktılar ve iz kayıtları

Bir adaptif misyon tek bir sohbet oturumundan oluşmaz. Liderin planlama konuşması, çalışan görevleri ve ajanlar arası konuşmalar ayrı oturumlar açabilir.

### 17.1 Hangi oturumlar oluşur?

~~~text
MİSYON KOŞUSU
  │
  ├─ Liderin planlama oturumu
  │    ├─ İlk karar
  │    ├─ Sonraki tur kararı
  │    └─ Kapanış kararı
  │
  ├─ Çalışan görev oturumu 1
  ├─ Çalışan görev oturumu 2
  ├─ İnceleme oturumu
  └─ Konuşma / council oturumları
~~~

> [!IMPORTANT] Bir misyon = bir oturum değildir
> Misyon, bütün bu oturumları aynı hedef altında yöneten üst kayıttır.

### 17.2 Planner oturumu

Liderin planlama oturumu şu anda Claude’un başsız/headless çalışma biçiminde açılır. Görünür bir terminal penceresi açılmaz.

Planlayıcı:

- seçilen liderin çalışma klasöründe başlar,
- ilk çağrıda proje özetini alır,
- sonraki turlarda aynı oturumu devam ettirmeye çalışır,
- her çağrıda sınırlı sayıda karar turu ve süre kullanır,
- doğrudan dosya yazma veya terminal araçlarına sahip değildir.

Bugünkü sınırlar:

- çağrı başına en fazla 15 model turu,
- çağrı başına yaklaşık 10 dakika süre,
- Bash, PowerShell, Edit, MultiEdit, Write, NotebookEdit, Task ve Agent araçları planlayıcıda kapalı.

> [!NOTE] Neden araçlar kapalı?
> Liderin görünmeyen yollardan işi kendisinin yapmasını değil, Agent Farm’ın kaydettiği hareketler üzerinden çalışanlara iş vermesini sağlar. Böylece hangi işin kim tarafından yapıldığı izlenebilir kalır.

### 17.3 Çalışan oturumu

Her görev, seçilen motor ve model üzerinde gerçek bir Task oturumu açar. Bu oturum görev çıktısının kaynağıdır.

İş:

- yeni oturumda başlayabilir,
- önceki oturum devam ettirilebilir,
- devam mümkün değilse önceki bilgiyi özetleyen bir devirle yeni oturumda sürdürülebilir.

### 17.4 Çıktı ile oturum arasındaki bağ

Bir adımın kısa özeti size ne olduğunu anlatır; oturum bağlantısı ise bunu **hangi gerçek konuşmanın ürettiğini** gösterir.

> [!TIP] Ne zaman oturuma inmelisiniz?
>
> - Çıktı özeti çok kısa kaldıysa,
> - çalışanın hangi dosyaları veya kanıtları gördüğünü anlamak istiyorsanız,
> - hatanın gerçek mesajını okumak gerekiyorsa,
> - liderin özetinin kaynağını denetlemek istiyorsanız.

### 17.5 Sessions sayfasındaki mevcut kalabalık

Bir misyon çok sayıda otomatik çalışan ve konuşma oturumu açtığı için genel Sessions sayfası kalabalıklaşabilir. Bugün bu oturumlar sıradan kullanıcı oturumlarıyla yeterince ayrılmamaktadır.

> [!NOTE] Hazırlanan düzeltme
> X-95, misyondan doğan oturumlara kaynak damgası ekleyecek; genel listede filtre sunacak ve bir misyonun bütün oturumlarını kendi içinden topluca açmayı sağlayacaktır.

### 17.6 Snapshot / Anlık durum kaydı

Misyonun o anki okunabilir durumu `missions.json` içinde saklanır. Ekran yeniden açıldığında:

- son durum,
- turlar,
- adımlar,
- değerlendirmeler,
- toplam kullanım,
- bekleyen kullanıcı kararı

bu kayıttan yeniden oluşturulabilir.

### 17.7 Trace / Olay günlüğü

Adaptif misyondaki önemli olaylar ayrıca yalnız sona eklenen bir JSONL iz dosyasına yazılır. Bu, “son durum ne?” sorusundan farklı olarak “buraya nasıl gelindi?” sorusunu cevaplar.

> [!TIP] İki kayıt neden var?
> `missions.json` kitabın son açık sayfası gibidir. İz günlüğü ise sayfaların hangi sırayla yazıldığını gösteren değiştirilmeyen olay defteridir.

Klasik misyonlar adaptif trace üretmez. Trace ekranı bu durumda boş listeyi “kayıt kayboldu” gibi göstermek yerine, koşunun Classic olduğu için adaptif olay günlüğü bulunmadığını açıkça söylemelidir.

### 17.8 Ledger / Liderin kısa hafızası

Lider her turda bütün ham konuşmaları baştan okumak zorunda kalmaz. Önemli kararlar, sonuçlar, harcama ve açık konular sıkıştırılmış bir çalışma defterinde tutulur.

Bu defter:

- önceki kararları unutmamayı,
- aynı işi gereksiz yere tekrarlamamayı,
- kullanıcı yönlendirmesini sonraki karar sınırına taşımayı,
- planlama oturumu devam ettirilemezse yeni oturuma bağlam vermeyi

sağlar.

### 17.9 İz sağlığı

İz dosyası yüklenirken sistem şu durumları ayırır:

- **ok:** kayıt sağlam,
- **missing:** iz dosyası bulunamadı,
- **truncated:** son satır yarım kalmış,
- **damaged:** kayıt içinde bozukluk var,
- **future:** dosya, bu sürümün bilmediği daha yeni biçimde.

> [!WARNING] Kayıt sorunu sessizce yok sayılmaz
> Sistem, güvenli biçimde devam edip edemeyeceğini bu sağlık bilgisine göre değerlendirir.

Olay günlüğü yazılamadı diye hedef otomatik başarısız sayılmaz; sistem bazı durumlarda snapshot üzerinden devam edebilir. Ancak denetim kaydının zayıfladığı arayüz ve Bridge’de görünür olmalıdır.

### 17.10 Kayıtların saklanma süresi

- Snapshot en fazla 40 misyon koşusu saklar.
- Kullanıcı bitmiş bir koşuyu silerse onun trace günlüğü de silinir.
- Snapshot sınırından düşen koşuların sahipsiz trace dosyaları başlangıç temizliğinde kaldırılır.
- Çalışan Task çıktılarının kendi ayrı saklama sistemi vardır.
- Bitmiş misyon koşusu silinse bile arşivlenmiş Task çıktıları kalabilir.
- Bir tanımın son koşusu silinirse artık erişilemeyen misyon tanımı da kaldırılabilir.

> [!WARNING] Run delete geri alınmaz
> `missions.run.delete` yalnız ekrandaki satırı gizlemez; bitmiş koşu geçmişini ve ilgili misyon izini kaldırır.

---

## 18. Bir şey ters giderse ne olur?

“Görev başarısız” tek bir neden değildir. Sistem farklı sorunları ayırır ki lider aynı kör yeniden denemeyi yapmasın.

### 18.1 Ajan bulunamadı

Seçilen ajan artık filoda yoktur veya adı çözümlenememiştir.

**Ne yapılır?** Lider uygun başka ajan seçebilir ya da ekip kapsamı kullanıcı kararı gerektiriyorsa size sorabilir.

Teknik kayıtta: `agent-missing`.

### 18.2 Bağlı hedef veya çıktı bulunamadı

Bir inceleme, karşılaştırma veya düzeltme adımı önceki bir işe bağlanmak istiyor; fakat o kayıt bulunamıyor.

**Ne yapılır?** Doğru kaynak işi yeniden bağlamak, çıktıyı yeniden üretmek veya adımı yeni bağımsız görev olarak kurmak gerekir.

Teknik kayıtta: `target-missing`.

### 18.3 İstek reddedildi

Bir ajan, motor veya güvenlik kuralı istenen çalışmayı kabul etmemiştir.

**Ne yapılır?** Nedenin izin, güvenlik, kapsam veya desteklenmeyen işlem olup olmadığı okunur. İzin gerekiyorsa kullanıcıdan alınır; istek güvenli hâle getirilebiliyorsa yeniden planlanır.

Teknik kayıtta: `request-refused` veya `engine-refused`.

### 18.4 Görev kaydı kayboldu

Çalışma başlatılmış gibi görünür; fakat beklenen görev kaydı artık bulunamaz.

**Ne yapılır?** Sistem sonucu olmuş gibi varsaymaz. Önce kayıtlar uzlaştırılır; gerekirse iş yeniden oluşturulur.

Teknik kayıtta: `record-lost`.

### 18.5 Çalışma yarıda kesildi

VS Code, motor, bağlantı veya süreç kesintisi yaşanmış olabilir.

**Ne yapılır?** Oturum ve çıktı kontrol edilir. Güvenli ise devam ettirilir veya bağlam devredilerek yeniden açılır.

Teknik kayıtta: `interrupted`.

### 18.6 Kullanıcı iptal etti

İşin durması bir arıza değil, kullanıcı kararıdır. Lider bunu otomatik hata gibi yeniden denememelidir.

Teknik kayıtta: `cancelled`.

### 18.7 Bütçe durdurdu

Tur, görev, maliyet, token veya süre sınırı yeni işe izin vermemiştir.

**Ne yapılır?** Kalan iş ve mevcut kanıt özetlenir. Kullanıcı limiti artırabilir, hedefi daraltabilir veya mevcut sonuçla kapatmayı seçebilir.

Teknik kayıtta: `budget-stopped`.

### 18.8 Görev başlatılamadı

Lider doğru iş emrini vermiş olsa da çalışan görevinin oluşturulması veya başlatılması başarısız olmuştur.

**Ne yapılır?** Motor kullanılabilirliği, ajan ayarı, çalışma klasörü ve istek kaydı kontrol edilir.

Teknik kayıtta: `delegate-failed`.

### 18.9 Sonucu bilinmeyen yazma işi

En hassas durum budur. Sistem kapanırken bir ajan dosya yazıyor olabilir. Yeniden açıldığında işin:

- hiç başlamadığı,
- yarıda kaldığı,
- tamamlandığı ama sonucu kaydedemediği

bilinmeyebilir.

> [!WARNING] Sistem böyle bir işi otomatik tekrar etmez
> Aynı yazma işini körlemesine yeniden başlatmak, yapılmış değişikliği ikinci kez uygulayabilir veya dosyayı bozabilir. Önce dosya ve oturum durumu incelenir; sonra **devam et**, **bağlamla yeniden aç** veya **güvenle sürdürülemiyor** kararı verilir.

### 18.10 Bir adımın hata vermesi, bütün hedefin başarısız olduğu anlamına gelir mi?

Hayır. Lider:

- başka ajan deneyebilir,
- isteği daha açık kurabilir,
- yaklaşımı değiştirebilir,
- eksik kanıtı başka yoldan üretebilir.

Aynı şekilde bir adımın başarılı olması da bütün hedefin başarıldığı anlamına gelmez. Son sözü başarı koşullarının güncel değerlendirmesi söyler.

> [!TIP] Hata ekranını okuma sırası
>
> 1. Hangi adım hata verdi?
> 2. Hata sınıfı ne?
> 3. Gerçek oturum veya çıktı bağlantısı var mı?
> 4. Lider sonraki turda ne karar verdi?
> 5. Zorunlu kriterlerden hangisi etkilendi?

---

## 19. Duraklatma, yeniden açma ve bilgisayar kapanması

Misyonlar kalıcı kayda sahiptir. Ancak “ekranı kapatıp açmak” ile “aynı çalışmayı güvenli biçimde sürdürmek” aynı şey değildir.

### 19.1 Normal duraklatma ve devam

Duraklatma güvenli sınırda bekler. Devam ettirdiğinizde:

- aynı misyon kimliği,
- önceki tur ve adımlar,
- liderin kısa hafızası,
- harcanan bütçe,
- değerlendirme kayıtları

korunur.

### 19.2 VS Code yeniden açıldığında

Agent Farm önce anlık durum kaydını ve olay günlüğünü okur. Çalışıyor görünen ama sonucu kesin olmayan adımları uzlaştırır.

Üç genel sonuç olabilir:

- **Resume / devam:** Aynı oturum güvenle sürdürülebilir.
- **Rebrief / bağlam devri:** Eski oturum sürdürülemez; yeni oturuma hedef, kararlar, kayıt defteri ve kullanıcı yönlendirmesi aktarılır.
- **Refuse / devamı reddet:** Güvenli devam için yeterli kanıt yoktur; kullanıcı müdahalesi gerekir.

> [!IMPORTANT] Yeniden açılış sessiz yeniden deneme değildir
> Özellikle yazma işi söz konusuysa sistem “muhtemelen olmadı” diyerek aynı işi tekrar başlatmaz.

### 19.3 Liderin planlama oturumu sürdürülemezse

Sistem önce liderin aynı planlama oturumunu devam ettirmeyi dener. Bu mümkün olmazsa:

1. hedef ve başarı koşulları,
2. önceki kararlar,
3. yapılan işler ve sonuçları,
4. açık sorular,
5. harcanan kaynak,
6. son kullanıcı yönlendirmesi

yeni planlama oturumuna kısa bir devir olarak verilir.

> [!NOTE] Bu neden önemlidir?
> Yeni oturum, “hiçbir şey bilmiyorum” diye baştan başlamaz; fakat devam ettiğini de sahte biçimde iddia etmez. Oturumun değiştiği kayıtlı kalır.

---

## 20. Bugünkü ekranın bilinen karışıklıkları

Bu bölüm, kullanıcı hatası olmayan fakat bugünkü oluşturucu ve okuma yüzeyinin kendisinden kaynaklanan noktaları açıkça ayırır.

> [!IMPORTANT] “Bugün” ile “hazırlanan düzeltme”yi karıştırmayın
> Aşağıdaki sorunlar mevcut davranışı anlatır. Bir sonraki bölümdeki yapı ise U-99 ve alt kalemleri tamamlandığında gelmesi planlanan düzendir.

### 20.1 Lider ve çalışan ayarları aynı dilde görünmüyor

Liderin:

- kimliği,
- planlama modeli,
- otomatik seçilme nedeni,
- planlama düşünme düzeyi

tek, anlaşılır bir blokta görünmemektedir. Özellikle planner model ile çalışan motor/model ayarları aynı şey sanılabilir.

**Hazırlanan düzeltme:** U-100.

### 20.2 Delegation engine ikinci bir varsayılan gibi davranıyor

Genel alanda bir motor, çalışan satırında başka motor görünebilir. Kullanıcı genel alanın herkesi değiştirdiğini düşünebilir; oysa bugün yalnız boş satırlara yedektir.

**Hazırlanan düzeltme:** U-101. Toplu seçim gerçek bir “satırlara uygula” işlemine dönüşecek.

### 20.3 Bütün filo ile seçili ajanlar açık ayrılmıyor

Boş havuzun veya seçili satırların tam olarak ne anlama geldiği ekrandan güvenle okunamayabilir.

**Hazırlanan düzeltme:** U-102. `Whole fleet` ve `Selected agents` açık kapsam seçenekleri olacak.

### 20.4 Başlatmadan önce gerçek sonucu göremiyorsunuz

Alanları doldururken:

- otomatik liderin kim olacağı,
- boş ayarların hangi varsayılandan çözüleceği,
- hangi çalışanların gerçekten kapsamda olduğu,
- hangi motor/model/izin kombinasyonunun uygulanacağı

tam olarak önizlenmemektedir.

**Hazırlanan düzeltme:** U-103. Host tarafındaki `previewMission` ve Bridge’de `missions.preview` aynı doğruluk kaynağını kullanacak.

### 20.5 Başlatıldıktan sonra “istedim / çözüldü / uygulandı” ayrımı eksik

Bir ayarın:

- kullanıcı tarafından talep edilen değeri,
- Başlatmadan önce çözümlenen değeri,
- çalışan görevinde gerçekten uygulanan değeri

tek yerde karşılaştırılamamaktadır.

**Hazırlanan düzeltme:** U-104.

### 20.6 Seçim kutuları ve form tepkileri yeterince canlı değil

Motor değiştiğinde model seçeneklerinin yenilenmesi, otomatik seçimlerin görünmesi ve dar alandaki yerleşim sorunları bütünlüklü değildir.

**Hazırlanan düzeltme:** U-97.

### 20.7 Normal çalışma adımından oturuma geçiş yok

Konuşma mesajında oturum bağlantısı varken normal görev adımında aynı geçiş tamamlanmamıştır.

**Hazırlanan düzeltme:** X-96.

### 20.8 Misyon oturumları genel oturum listesini dolduruyor

Otomatik açılan çok sayıdaki çalışan ve konuşma oturumu, kullanıcının elle açtığı normal oturumlarla karışmaktadır.

**Hazırlanan düzeltme:** X-95.

> [!TIP] Bugün güvenli kullanım
> Başlatmadan önce yalnız genel alanlara bakmayın; her çalışan satırını kontrol edin. Başlatıldıktan sonra Cast, adım motor/model bilgisi ve değerlendirme kayıtlarıyla gerçek uygulamayı doğrulayın.

---

## 21. Hazırlanan yeni ekran düzeni

U-99 ailesinin hedefi yalnızca mevcut forma birkaç açıklama eklemek değildir. Oluşturucunun zihinsel modelini üç açık bölüme ayırmaktır:

~~~text
1. RESULT / SONUÇ
   Ne istiyorum? Başarı nasıl anlaşılacak? Sınırlar ne?

2. ORCHESTRATOR / YÖNETİCİ
   Kim yönetecek? Hangi planlama modeli ve düşünme düzeyi?

3. WORKERS / ÇALIŞANLAR
   Kimler çalışabilir? Hangi motor, model, düşünme ve izinle?
~~~

### 21.1 Result / Sonuç bölümü

Burada:

- hedef,
- zorunlu ve isteğe bağlı başarı koşulları,
- sınırlar,
- proje ve çalışma klasörü,
- onay davranışı,
- misyon limitleri

bulunur.

> [!TIP] Bu bölümün tek sorusu
> “Ne elde etmek istiyorum ve bunu hangi sınırlar içinde başarılı sayacağım?”

### 21.2 Orchestrator / Yönetici bölümü

Burada:

- lider seçimi,
- otomatik lider önizlemesi,
- liderin neden uygun olduğu,
- planner motoru/modeli,
- planner düşünme düzeyi

bir bütün olarak görünür.

> [!IMPORTANT] Lider kimliği ile planner ayarı yan yana olacak
> Böylece “kim yönetiyor?” ve “bu yönetici hangi modelle karar veriyor?” soruları ayrı fakat ilişkili biçimde okunacak.

### 21.3 Workers / Çalışanlar bölümü

Burada:

- bütün filo / seçili ajanlar kapsamı,
- çalışan matrisi,
- her ajan için motor, model, düşünme düzeyi ve izin,
- toplu profil uygulama,
- tek satırlık özel ayarlar

bulunur.

Çalışan matrisi tek doğruluk kaynağı olacaktır. Gizli ikinci bir genel motor seçimi, satırlarla rekabet etmeyecektir.

### 21.4 Başlatmadan önce önizleme

Önizleme yalnız görsel tahmin olmayacaktır. Misyonu gerçekten başlatırken kullanılacak aynı host çözümleyicisi:

- seçilen kapsamı,
- otomatik lideri,
- çalışanların çözülmüş ayarlarını,
- her değerin kaynağını,
- çakışma ve eksikleri

hesaplayacaktır.

> [!SUCCESS] Kullanıcı açısından hedef
> Başlat düğmesine basmadan önce “kim, nerede, hangi modelle ve hangi izinle çalışacak?” sorusunun cevabı ekranda hazır olacak.

### 21.5 Başlatıldıktan sonra kaynak bilgisi

Her önemli ayar için üç aşama ayrılacaktır:

| Aşama | Anlamı |
| :-- | :-- |
| **Requested / Talep edilen** | Kullanıcının formda istediği |
| **Resolved / Çözümlenen** | Başlatma öncesinde varsayımlarla bulunan |
| **Applied / Uygulanan** | Gerçek çalışan görevinde kullanılan |

> [!EXAMPLE] Örnek
>
> - Talep edilen: çalışan modeli boş
> - Çözümlenen: filo ayarından `gpt-5.6-terra`
> - Uygulanan: `gpt-5.6-terra`
> - Kaynak: fleet

Bu düzen, bir ayarın nerede değiştiğini veya neden beklenenden farklı olduğunu göstermeyi amaçlar.

> [!IMPORTANT] "Uygulanan" hangi kanıttan okunur (X-124)
> "Uygulanan", oturumun tamamının değil, **işin kapladığı turların** gerçeğidir. Bir konuşma resume edildiğinde birden çok delegasyona hizmet eder; oturum toplamını okumak, her adıma başka roundların modellerini yazmak demekti — ve "istediğim model bana hizmet edenler arasında mı" kontrolü isteği alakasız bir turda bulup **uyuşuyor** diyordu.
>
> Bu yüzden panel üç cevabı ayrı tutar:
>
> | Kapsam | Anlamı |
> | :-- | :-- |
> | **turn** | Bu işin kapladığı turlardan okundu. **≠ uyuşmazlık işareti yalnız buna çizilir.** |
> | **session** | Adımın görev satırı retention ile silinmiş, bağlanacak pencere yok. Bütün lane'in okuması gösterilir ama **lane'in okuması olduğu açıkça yazılır**. |
> | **unattributed** | Pencere biliniyor, o oturumun hiçbir turu içine düşmüyor — yani o tanıklığın hiçbiri bu iş hakkında değil. |
>
> Pencere içinde **değişen** permission mode tek değere indirgenmez; ikisi de gösterilir, çünkü birini seçmek satırı tam da bunu kontrol etmek için okuyan kişiye atılmış bir yazı tura olurdu.

### 21.6 Aynı önizleme Bridge’den de alınacak

`missions.preview` işlemi, ekrandaki önizlemeyi ajanlar ve otomasyonlar için de erişilebilir yapacaktır. Böylece:

- UI bir sonuç,
- Bridge başka sonuç

üretmeyecek; ikisi aynı çözümleyiciyi kullanacaktır.

### 21.7 Bu hedefin tamamlandığını nasıl anlayacağız?

> [!CHECK] Yeni oluşturucu başarı kontrolü
>
> - Lider ve çalışan ayarları birbirine karışmıyor.
> - Toplu ayar, etkilediği satırları gözle görülür biçimde değiştiriyor.
> - Bütün filo / seçili ajanlar açık.
> - Başlatmadan önce gerçek önizleme var.
> - Başlatıldıktan sonra talep/çözüm/uygulama görülebiliyor.
> - Her normal adımın gerçek oturum ve çıktısına gidilebiliyor.
> - Misyon oturumları genel Sessions görünümünden ayrıştırılabiliyor.
> - Motor değişince ilgili model ve düşünme seçenekleri doğru yenileniyor.

---

## 22. Baştan sona örnek misyonlar

Bu örneklerde yalnızca sonucun ne olduğu değil, formun nasıl doldurulacağı, liderin hangi yolu izleyebileceği ve sizin ekranda ne göreceğiniz de gösterilir.

### 22.1 Örnek 1 — Kullanıcı rehberi hazırlamak

#### İhtiyaç

Teknik olarak doğru fakat son kullanıcının anlayamadığı bir belgeyi, bilgi kaybetmeden öğretici bir rehbere dönüştürmek istiyorsunuz.

#### Form

**Hedef**

> “Adaptif misyon sistemini teknik bilgisi olmayan kullanıcının baştan sona öğrenebileceği; kavramları gündelik dille açıklayan, gerçek örnekler ve callout kutuları kullanan ayrıntılı bir kullanıcı rehberi oluştur.”

**Zorunlu başarı koşulları**

- Teknik belgede geçen bütün kullanıcıyı etkileyen davranışlar açıklanmış.
- Her önemli ekran terimi, gündelik karşılığıyla tanıtılmış.
- 14 lider hareketinin her biri örnek ve kullanım amacıyla açıklanmış.
- Bugünkü ekran davranışı ile planlanan düzeltmeler açıkça ayrılmış.
- Rehber bir kullanıcının misyon oluşturup izlemesi için yeterli.

**Sınırlar**

- Teknik doğruluğu basitleştirirken anlam kaybetme.
- Var olan teknik belgeyi silme veya değiştirme.
- Açıklanmamış İngilizce terim bırakma.

**Lider**

Yazım hedefini ve sistem bütününü anlayabilecek bir ajan.

**Çalışan havuzu**

- Teknik gerçekleri denetleyen ajan
- Son kullanıcı dili açısından inceleyen ajan
- Belgeyi yazan ajan

#### Olası akış

1. Lider teknik kaynak ile örnek belge stilini iki ayrı okuma görevi olarak verir.
2. Bulguları birleştirir.
3. Yazara ilk sürümü hazırlatır.
4. Başka bir ajana “anlaşılmayan terimleri ve eksik kullanıcı sorularını” inceletir.
5. Çıktıyı düzeltir.
6. Her zorunlu kriteri ayrı değerlendirir.
7. Kriterler güncel biçimde geçince kapatır.

> [!TIP] Ekranda neye bakarsınız?
> Çok sayıda kelime yazılmış olmasına değil, “bilgi kaybı yok”, “teknik terim açıklamasız değil” ve “örnek stil kullanıldı” kriterlerinin kanıtına bakarsınız.

### 22.2 Örnek 2 — Yazılım hatasını güvenle düzeltmek

#### İhtiyaç

Bir filtre kutusunda rakam yazarken imleç odağını kaybediyor. Aynı bileşen başka sayfalarda da kullanılıyor olabilir.

#### Form

**Hedef**

> “Filtre kutularında yazarken oluşan imleç kaybının ortak kök nedenini bul, ilgili bütün yüzeylerde davranışı düzelt ve mevcut filtreleme işlevini bozmadan doğrula.”

**Zorunlu başarı koşulları**

- Kök neden kod akışıyla açıklanmış.
- Sayı ve metin yazarken giriş odağı korunuyor.
- Aynı bileşeni kullanan bütün ilgili sayfalar kontrol edilmiş.
- Otomatik testler geçiyor.
- Koyu ve açık temada gerçek ekran kontrolü yapılmış.

**Sınırlar**

- İlgisiz arayüzleri değiştirme.
- Ortak bileşeni geniş çaplı yeniden yazma.
- Kullanıcının mevcut filtre değerlerini veya ayarlarını dönüştürme.
- Aynı çalışma klasöründe aynı anda tek yazıcı kullan.

#### Olası akış

~~~text
Tur 1
  ├─ Okuyucu A: Oturumlar filtresini incele
  └─ Okuyucu B: Aynı filtre bileşenini kullanan yerleri bul

Tur 2
  └─ Lider: Bulguları karşılaştır, kök nedeni seç

Tur 3
  └─ Yazıcı: Küçük ve yalıtılmış düzeltmeyi uygula

Tur 4
  ├─ Denetçi: Kod ve geriye dönük etki incelemesi
  └─ Test görevi: Otomatik kontroller

Tur 5
  ├─ Görsel doğrulama
  └─ Başarı kriterlerini değerlendir
~~~

> [!IMPORTANT] Neden iki yazıcı paralel değil?
> İki ajan aynı bileşeni aynı anda değiştirirse birbirlerinin işini ezebilir. Araştırmalar paralel, yazma ise tekil ilerler.

#### Kullanıcı müdahalesi örneği

İlk turda sorunun yalnız Sessions sayfasında olmadığı anlaşılırsa `Guide next decision` ile:

> “Ortak bileşeni düzelt; sayfa başına ayrı yama yapma.”

dersiniz. Bu, çalışan araştırmayı kesmez; lider sonraki kararda bunu kullanır.

### 22.3 Örnek 3 — İki tasarım yaklaşımını kurulda tartışmak

#### İhtiyaç

Toplu çalışan motoru seçiminin çalışma zamanı varsayılanı mı yoksa satırlara uygulanan görünür bir işlem mi olması gerektiğine karar vermek istiyorsunuz.

#### Form

**Hedef**

> “Misyon oluşturucuda motor/model seçiminin kullanıcı açısından tek anlamlı ve öngörülebilir kaynağa sahip olacağı tasarımı seç ve uygulamaya hazır karar üret.”

**Başarı koşulları**

- İki yaklaşımın kullanıcı beklentisine etkisi açıkça karşılaştırılmış.
- Mevcut özel satır ayarlarının korunması ele alınmış.
- Başlatma önizlemesiyle uyumlu karar verilmiş.
- Seçilen yaklaşımın kabul ölçüleri yazılmış.

#### Olası akış

1. Bir ajan mevcut çözümleme sırasını inceler.
2. Bir ajan kullanıcı deneyimi açısından iki yaklaşımı değerlendirir.
3. Lider `council` açar.
4. Başkan tek soruyu, itirazları ve açık konuları yönetir.
5. Kurul “görünür satırlara uygulama” yönünde yeterli kanıtla kapanır.
6. Lider bu sentezi başarı kriteri saymaz; uygulama için ayrı görev açar.
7. Uygulama sonrası kriterler `evaluate` ile denetlenir.

> [!WARNING] Kurul kararı işi tamamlamaz
> “Hangi tasarım doğru?” sorusu cevaplanmıştır; fakat tasarımın uygulanması ve doğrulanması hâlâ ayrı iştir.

### 22.4 Örnek 4 — Büyük alt hedefi ayrı misyona vermek

#### Ana hedef

> “Yeni sürümü kullanıma hazır hâle getir.”

Bu hedefte paketleme, belge, görsel kontrol ve erişilebilirlik denetimi vardır. Erişilebilirlik bölümü kendi içinde araştırma, düzeltme ve doğrulama gerektiriyorsa lider:

- tek bir “erişilebilirliğe bak” görevi vermek yerine,
- kendi hedefi ve kriterleri olan bir `run_mission` açabilir.

#### Alt misyon

**Hedef:** “Missions sayfasındaki klavye ve ekran okuyucu sorunlarını bul, düzelt ve doğrula.”

**Kriterler:**

- Bütün etkileşimli kontroller klavyeyle erişilebilir.
- Odak sırası mantıklı.
- Erişilebilir adlar mevcut.
- Görsel odak göstergesi koyu ve açık temada okunabilir.

Alt misyon bitince sonuç ana lidere döner. Ana lider, sürümün diğer kriterleriyle birlikte bu sonucu değerlendirir.

> [!TIP] Alt misyonun ölçüsü
> “Bu iş kendi başına lider, birkaç tur ve ayrı başarı kapısı istiyor mu?” Cevap evetse alt misyon anlamlıdır.

Alt misyon veya iş akışı başlatılırken Agent Farm önce ona kimlik ayırır, ana adımla bağını yazar, olayı günlüğe ekler ve snapshot’ı kaydeder; gerçek çalışmayı bundan sonra başlatır. Başlatma isteği aynı kimlikle güvenle tekrar edilebilir. Böylece kapanma anında para harcayan fakat hangi ana adıma ait olduğu bilinmeyen sahipsiz bir koşu oluşmaz.

### 22.5 Örnek 5 — Bilgisayar kapanırken yazma işi vardı

#### Olay

Bir çalışan dosya değiştirirken VS Code kapandı. Ekran yeniden açıldığında adım hâlâ çalışıyor görünüyor olabilir.

#### Doğru davranış

1. Sistem snapshot ve iz kaydını okur.
2. Görev/oturum kaydını arar.
3. Çalışmanın kesin sonucunu sınıflandırır.
4. Dosya değişikliklerinin gerçekten uygulanıp uygulanmadığı denetlenir.
5. Güvenli ise oturum sürdürülür.
6. Oturum sürdürülemiyorsa mevcut durum yeni ajana devredilir.
7. Sonuç bilinmiyorsa aynı yazma işi otomatik tekrar edilmez.

> [!WARNING] Yanlış davranış
> “Kapanmış, demek ki yapılmadı” deyip yazma görevini yeniden başlatmak.

### 22.6 Örnek 6 — Küçük işte adaptif misyon kullanmamak

İstek:

> “README’deki tek bir bozuk bağlantıyı düzelt.”

Bu iş için araştırma ekibi, kurul ve sekiz turluk misyon çoğu zaman gereksizdir. Tek bir görev:

1. bağlantıyı bulur,
2. düzeltir,
3. açıldığını doğrular,
4. sonucu döndürür.

> [!TIP] İyi sistem kullanımı, en büyük aracı seçmek değildir
> İşin belirsizliği ve karar ihtiyacı küçükse sade araç hem daha ucuz hem daha anlaşılırdır.

---

## 23. Hızlı seçim rehberi

### 23.1 Hangi çalışma biçimi?

| Durum | Seçim | Neden |
| :-- | :-- | :-- |
| Bir ajanın yapacağı açık iş | **Task** | Lider döngüsüne gerek yok |
| Her seferinde aynı adımlar | **Workflow** | Yol önceden belli |
| Ekibi ve dağılımı siz kurdunuz | **Classic Mission** | Kontrollü çok-ajan düzeni |
| Yol, bulgulara göre değişecek | **Adaptive Mission** | Lider karar döngüsü gerekli |

### 23.2 Lider hangi hareketi seçmeli?

| İhtiyaç | Hareket |
| :-- | :-- |
| Bir ajana somut iş ver | `delegate` |
| Bağımsız işleri aynı anda başlat | `parallel` |
| Yapılmış işi ikinci göze okut | `review` |
| Birkaç sonucu aynı ölçüyle karşılaştır | `compare` |
| Doğru yaklaşımın eksik çıktısını düzelt | `revise` |
| Başarı koşulunu kanıtla | `evaluate` |
| Hazır, tekrarlanabilir süreci çalıştır | `run_workflow` |
| Kendi karar döngüsü gereken alt hedef aç | `run_mission` |
| Bir ajanı başka ajana soru/itiraz/kanıt için konuştur | `message` |
| Bir karar sorusunu birkaç ajana düzenli tartıştır | `council` |
| Temel yaklaşımı değiştir | `replan` |
| Kullanıcı tercihi veya yetkisi iste | `ask_user` |
| Kanıtlanmış sonuçla kapat | `finish` |
| Güvenli veya anlamlı devam mümkün değilse durdur | `abort` |

### 23.3 Review, evaluate ve council farkı

| Soru | Doğru araç |
| :-- | :-- |
| “Bu çıktıda hata veya eksik var mı?” | **Review** |
| “Bu tanımlı başarı koşulu kanıtla geçti mi?” | **Evaluate** |
| “Bu önemli karar sorusunda uzman görüşleri ne?” | **Council** |

### 23.4 Revise, replan, resume ve rerun farkı

| İstediğiniz | Seçim |
| :-- | :-- |
| Aynı yaklaşımın çıktısını iyileştir | **Revise** |
| Yaklaşımı değiştir | **Replan** |
| Aynı koşuyu kaldığı yerden sürdür | **Resume** |
| Baştan yeni koşu aç | **Rerun** |

### 23.5 Hangi kullanıcı kontrolü?

| Durum | Kontrol |
| :-- | :-- |
| Her turun planını görmek istiyorum | Her tur onayı |
| Şu anda çalışan iş bitsin, yenisi başlamasın | Pause |
| Aynı çalışma devam etsin | Resume |
| Bir sonraki lider kararına yön vermek istiyorum | Guide next decision |
| Misyon artık devam etmesin | Cancel |
| Aynı tanımla yeni koşu başlasın | Rerun |

### 23.6 Hangi ekrana bakmalıyım?

| Sorunuz | Bakılacak yer |
| :-- | :-- |
| Şu an ne yapıyor? | Live activity + durum etiketi |
| Lider neden bu işi açtı? | Planner transcript + tur kartı |
| Ajan gerçekten ne yaptı? | Adım çıktısı + çalışan oturumu |
| Ajanlar ne konuştu? | Conversations |
| Kurul niçin kapandı? | Council exit + sentez + oylar |
| Hedef gerçekten başarılı mı? | Evaluations + zorunlu kriterler |
| Ne kadar harcandı? | Cost + tokens + time |
| Bu karara nasıl gelindi? | Runtime graph + trace |

---

## 24. Sık sorulan sorular

### “Lider zaten bir ajan. Planner neden ayrıca var?”

Lider, **kimliğin ve rolün** adıdır. Planner ise o liderin misyon kararlarını yürüttüğü ayrı yönetici oturumudur. Aynı kişi “proje yöneticisi” olabilir; toplantı yaptığı yer ise ayrı bir çalışma alanıdır.

### “Liderin üstünde başka bir delegasyon ajanı var mı?”

Hayır. Seçilen lider doğrudan planlama kimliğidir. Ayrı bir gizli delegasyon ajanı yoktur.

### “Planner hangi motorla çalışıyor?”

Bugünkü sistemde planner **yalnız Claude Code** ile çalışır; bu bir seçim değil, sabittir ve formda da "Planner engine: Claude Code · fixed" diye yazar. Kullanıcı planner modelini ve planner effort'unu seçebilir (U-100 / X-121); ikisi de boşsa değer yukarıdaki merdivenden çözülür.

Bir koşum başladıktan sonra "orkestratör neyle koştu" sorusunun cevabı **koşumun kendi kaydından** okunur, o an yeniden hesaplanmaz (M-29): koşum geçmişte başlamıştır, `agentFarm.taskExtraArgs` ve settings dosyaları ise bugünkü hâlleriyle okunur. Kaydı olmayan eski koşumlarda yüzey "not recorded" der ve tahmin yürütmez.

### “Planner terminal açıyor mu?”

Hayır. Görünmeyen/headless bir Claude süreci olarak çalışır. Terminal, dosya yazma ve doğrudan Task çağırma araçları planlayıcıda kapalıdır.

### “Lider de çalışan olabilir mi?”

Evet, çalışan havuzundaysa olabilir. Liderlik oturumu ile somut işi yaptığı çalışan oturumu ayrıdır.

### “Havuzdaki her ajan mutlaka çalışır mı?”

Hayır. Havuz “kullanılabilir adaylar” listesidir. Lider yalnız ihtiyaç duyduğu ajanlara görev verir.

### “Lider havuz dışında olabilir mi?”

Evet. O zaman misyonu yönetir ama çalışan görevi almaz.

### “Pool boşsa bütün filo mu kullanılacak?”

Bugünkü ekran bu anlamı yeterince açık göstermediği için güvenli varsayım yapmayın; seçili satırları kontrol edin. U-102 sonrasında kapsam açıkça **Whole fleet** veya **Selected agents** olarak seçilecektir.

### “Delegation engine’de Gemini, çalışan satırında Codex seçili. Hangisi çalışır?”

Çalışan satırındaki Codex çalışır. Bugünkü genel alan yalnız satırı boş çalışanlar için yedektir.

### “Genel motoru değiştirince neden satırlar değişmedi?”

Çünkü bugünkü alan toplu düzenleme düğmesi değildir. U-101 sonrasında ayrı bir “profili seçili çalışanlara uygula” işlemi satırları görünür biçimde değiştirecektir.

### “Boş worker model ne demek?”

Rastgele demek değildir. Agent Farm önce ajanın ve motorun özel ayarına, sonra filo ayarına, son olarak motorun komut satırı varsayılanına bakar.

### “Planner modeli worker modelini ezer mi?”

Hayır. Liderin karar modeli ile çalışan görevinin modeli ayrı ayarlardır.

### “Düşünme düzeyi ne kadar yüksek olmalı?”

İşin zorluğuna göre. Mekanik görevde düşük/orta, mimari veya belirsiz kararda daha yüksek değer anlamlı olabilir. Her ajanı en yüksek düzeyde çalıştırmak gereksiz maliyet ve süre yaratabilir.

### “Parallel seçince görevler kesin aynı anda mı çalışır?”

Hayır. Paralellik kapasitesi, bağımlılıklar ve tek-yazıcı kuralı izin verdiği ölçüde aynı anda çalışırlar.

### “Review geçtiyse misyon bitebilir mi?”

Review yalnız çıktıda sorun bulup bulmadığını söyler. Zorunlu başarı koşulları ayrıca güncel değerlendirmeyle geçmelidir.

### “Council çoğunlukla bir seçeneği seçti. Başarı kriteri geçti mi?”

Hayır. Council bir karar tartışmasıdır. Oy veya sentez, başarı koşulu değerlendirmesinin yerine geçmez.

### “Council bir konuda anlaşamazsa sistem anlaşmış gibi özetler mi?”

Hayır. Belirsizlik, eşit oy ve açık itirazlar oldukları gibi kalmalıdır. Başkan “karar için tablo yeterli” diyerek kapatabilir; bu, uzlaşma var demek değildir.

### “Bir ajanın konuşma mesajı gerçekten o ajandan mı geliyor?”

Evet. `message` ve `council` konuşma turları gerçek görev yanıtlarından üretilir. Görev başarısızsa sistem hayali bir mesaj eklemez.

### “Guide next decision çalışan görevi anında değiştirir mi?”

Hayır. Yönlendirme liderin sonraki karar sınırında okunur.

### “Pause çalışan görevi anında keser mi?”

Genellikle mevcut etkinliğin güvenli biçimde sonuçlanmasını bekler; ardından yeni iş başlatmaz.

### “Resume ile Rerun aynı mı?”

Hayır. Resume aynı koşuyu sürdürür. Rerun yeni kimlik, yeni maliyet ve yeni çalışma kaydıyla baştan koşar.

### “Cost $0 ise görev ücretsiz miydi?”

Kesin olarak söylenemez. Motor maliyet bildirmiyor olabilir; token ve süreye de bakın.

### “0 limit ne demek?”

Tam 0 o sınırı kaldırır. Boş, bozuk veya negatif değerlerin de sınırsız sayılması beklenmez; yalnız geçerli tam 0 bilinçli sınırsızlıktır.

### “Kullanıcı cevabı beklerken süre limitim tükenir mi?”

Bekleme süresi aktif misyon çalışma süresinden çıkarılır.

### “Misyon tamamlandı yazıyorsa güvenebilir miyim?”

Zorunlu kriterlerin güncel değerlendirmelerini okuyun. Güvenilir sonuç; bitiş etiketi, kriter kanıtları ve kapanış gerekçesi birlikte tutarlıysa oluşur.

### “Ham oturumlara tek tek girmem gerekiyor mu?”

Normalde hayır. Missions ayrıntısı kararları, tur sonuçlarını, değerlendirmeleri ve konuşmaları birleştirir. Yalnız kaynak kanıtı veya ayrıntılı hata gerektiğinde oturuma inersiniz. Normal adım oturum bağlantısı X-96 ile tamamlanacaktır.

### “VS Code kapanırsa misyon kaybolur mu?”

Snapshot ve olay günlüğü kalıcıdır. Yeniden açılışta sistem kayıtları uzlaştırır; fakat sonucu bilinmeyen yazma işini güvenlik nedeniyle otomatik tekrar etmez.

### “Bir görev hata verdiğinde bütün misyon hemen biter mi?”

Hayır. Lider başka ajan, başka yöntem, düzeltme veya yeniden planlama seçebilir. Bütçe ve güvenlik izin veriyorsa hedefe başka yoldan devam edilebilir.

### “Neden bu kadar çok ayrı kayıt var?”

Çünkü şu sorular farklıdır: “Şu an ne durumda?”, “Buraya nasıl geldi?”, “Ajan tam olarak ne dedi?”, “Başarı neye dayanıyor?” Snapshot, trace, oturum çıktısı ve değerlendirme bu farklı soruların cevaplarıdır.

---

## 25. Ekran dili sözlüğü

Bu sözlük, teknik kelimeyi öğrenmeniz için değil, ekranda gördüğünüz etiketi hızla anlamanız için hazırlanmıştır.

| Ekrandaki terim | Kullanıcı dilinde anlamı |
| :-- | :-- |
| **Objective / Goal** | Ulaşılacak sonuç |
| **Success criterion** | Başarının kanıtlanacağı ölçü |
| **Required** | Geçmeden başarıya izin vermeyen koşul |
| **Optional** | Değerli ama başarıyı tek başına engellemeyen koşul |
| **Constraint** | Çalışırken aşılmayacak sınır |
| **Lead** | Misyonun yönetici ajanı |
| **Planner** | Liderin sıradaki kararları verdiği ayrı yönetici oturumu |
| **Pool** | Liderin görev verebileceği aday çalışanlar |
| **Cast** | Bu koşuda gerçekten rol veya görev almış ekip |
| **Engine** | Ajanı çalıştıran yapay zekâ hizmeti |
| **Model** | Motor içindeki seçilen model |
| **Effort** | Modelin düşünme yoğunluğu |
| **Permission** | Ajanın yapmasına izin verilen işlemler |
| **Origin** | Bir ayarın hangi kaynaktan geldiği |
| **Requested** | Kullanıcının istediği ayar |
| **Resolved** | Sistem varsayımları uyguladıktan sonra seçilen ayar |
| **Applied** | Gerçek görevde kullanıldığı bildirilen ayar |
| **Round** | Lider kararı ve ona bağlı işlerin oluşturduğu tur |
| **Wave** | Aynı anda güvenle başlayabilen işler grubu |
| **Step** | Tur içindeki tek çalışma hareketi |
| **One-writer rule** | Aynı çalışma klasörüne aynı dalgada yalnız bir yazıcı |
| **Strategy** | Hedefe ulaşmak için benimsenen genel yol |
| **Strategy version** | Yaklaşım gerçekten değiştiğinde açılan yeni sürüm |
| **Phase** | Liderin o anki çalışma aşamasına verdiği açıklayıcı ad |
| **Based on** | Bir kararın dayandığı gerçek önceki sonuç bağlantıları |
| **Runtime graph** | Karar, iş ve sonuçların birbirine nasıl bağlandığını gösteren harita |
| **Evaluation** | Belirli başarı koşulunun kanıtlı değerlendirmesi |
| **Verdict** | Geçti, geçmedi veya belirsiz kararı |
| **Stale** | Sonraki değişiklik yüzünden artık güncel olmayan değerlendirme |
| **Success gate** | Zorunlu kriterler geçmeden başarı kapanışını engelleyen kapı |
| **Conversation** | Ajanların gerçek görev yanıtlarından oluşan konuşma |
| **Intent** | Mesajın öneri, soru, itiraz, kanıt gibi amacı |
| **Ref** | Mesajın cevap verdiği önceki mesaj bağı |
| **Open thread** | Henüz cevaplanmamış soru veya itiraz |
| **Council** | Başkanlı, sınırlı ve çıkış kurallı ajan tartışması |
| **Chair** | Council konuşmasını yöneten ajan |
| **Exit reason** | Council’in neden kapandığı |
| **Lane** | Aynı ajanın konuşma oturumu sürekliliği |
| **Handoff** | Eski oturum sürdürülemediğinde bağlamın yeni oturuma aktarılması |
| **Snapshot** | Misyonun son durumunu hızlı açan anlık kayıt |
| **Trace** | Önemli olayların sırayla tutulduğu değiştirilmeyen günlük |
| **Ledger** | Liderin önceki tur ve kararları taşıyan kısa çalışma hafızası |
| **Pause** | Mevcut güvenli sınırdan sonra bekle |
| **Resume** | Aynı koşuyu kaldığı yerden sürdür |
| **Cancel** | Koşuyu artık devam etmeyecek biçimde iptal et |
| **Rerun** | Aynı tanımla yeni bir koşu başlat |

---

## 26. İleri düzey kullanıcılar için teknik ek

Bu bölüm günlük kullanım için zorunlu değildir. Otomasyon kuran, Bridge üzerinden misyon yöneten veya bir davranışın kesin kaynağını denetlemek isteyen kullanıcılar içindir.

### 26.1 Classic ve Adaptive hareket farkı

Classic misyon liderinin dört temel hareketi vardır:

- `delegate` — çalışan görevi ver,
- `finish` — sonucu kapat,
- `ask_user` — kullanıcıya sor,
- `abort` — devam edemiyorsan dürüstçe durdur.

Adaptive misyon bunlara şu on hareketi ekler:

- `parallel`,
- `review`,
- `compare`,
- `revise`,
- `evaluate`,
- `run_workflow`,
- `run_mission`,
- `message`,
- `council`,
- `replan`.

> [!NOTE] Aynı omurga
> İki mod ayrı yürütme motorları değildir. Aynı tur, görev, bütçe, kayıt ve kapanış yaşam döngüsünü paylaşırlar; Adaptive liderin kullanabileceği karar araçlarını genişletir.

### 26.2 Ayar çözümleme sırası

| Ayar | Önce | Sonra | Sonra | Son çare |
| :-- | :-- | :-- | :-- | :-- |
| Çalışan motoru | member/satır | mission/genel | fleet launch default | CLI |
| Model | member/satır | agent + engine | fleet | CLI |
| Effort | member/satır | agent + engine | fleet | CLI |
| Permission | member/satır | fleet | CLI | — |
| Workdir | mission spec | — | — | — |

Origin alanları: `member`, `mission`, `agent`, `fleet`, `cli`.

> [!NOTE] Claude ayrımı
> Model ve effort çözümünde Claude, kendi `.claude/settings.local.json` ayarını doğrudan okuduğu için Agent Farm’ın agent+engine katmanı atlanabilir.

### 26.3 Misyon koşusu durumları

| Durum | Anlamı |
| :-- | :-- |
| `running` | Lider veya çalışan yaşam döngüsü aktif |
| `waiting-approval` | Tur planı kullanıcı onayı bekliyor |
| `waiting-user` | Liderin sorusu cevap bekliyor |
| `paused` | Kullanıcı isteği veya yeniden açılış uzlaştırmasıyla bekliyor |
| `done` | Normal sonuç kararıyla kapandı |
| `failed` | Planlayıcı/motor/protokol sorunu veya abort ile kapandı |
| `cancelled` | Kullanıcı tarafından iptal edildi |

### 26.4 Adım ve konuşma durumları

Bir çalışma adımı:

~~~text
queued → running → done
                 ├→ failed
                 └→ cancelled
~~~

olabilir. Sıradaki adım bütçe, motor hazırlığı, bağımlılık veya yazıcı güvenliği nedeniyle tutuluyorsa ayrıca bekleme nedeni taşıyabilir.

Bir konuşma mesajı:

~~~text
pending → delivered
        ├→ failed
        └→ cancelled
~~~

olabilir. Yalnız `delivered` olan mesaj gerçekten söylenmiş kabul edilir.

### 26.5 Bridge üzerinden yapılabilenler

Agent Farm arayüzündeki önemli misyon işlemlerinin ajanların kullanabileceği Bridge karşılıkları vardır.

| İşlem | Kullanıcı dilindeki işi |
| :-- | :-- |
| `missions.store` | Misyon kayıt deposu sağlıklı mı, kaç kayıt var? |
| `missions.list` | Misyon koşularını en yeniden eskiye listele |
| `missions.start` | Classic veya Adaptive misyon başlat |
| `missions.status` | Şu anki tur, adım, bütçe, bekleme ve değerlendirme özeti |
| `missions.conversation` | Ajan konuşmalarının tam mesaj kayıtları |
| `missions.council` | Kurulun üyeleri, açık konuları, oyları ve kapanışı |
| `missions.pause` | Mevcut güvenli etkinlikten sonra beklet |
| `missions.resume` | Aynı koşuyu sürdür |
| `missions.cancel` | Koşuyu ve devam eden alt işleri iptal et |
| `missions.answer` | Bekleyen kullanıcı sorusunu cevapla veya atla |
| `missions.approve` | Bekleyen tur planını onayla veya reddet |
| `missions.rerun` | Bitmiş tanımdan yeni koşu başlat |
| `missions.run.delete` | Bitmiş koşu geçmişini geri alınamaz biçimde sil |
| `missions.trace` | Olay günlüğünü veya ondan üretilen görünümü oku |
| `missions.guide` | Sonraki lider kararına tek kullanımlık yönlendirme bırak |

`missions.preview` bugünkü işlem kümesinde yoktur; U-103 ile eklenecektir.

> [!WARNING] Bridge’den misyon başlatmak maliyetlidir
> Bir ajan, kullanıcı açıkça istemeden `missions.start` çağrısı yapmamalıdır. Önizleme geldiğinde başlatmadan önce çözülmüş profil Bridge üzerinden de denetlenebilecektir.

### 26.6 Status, trace, conversation ve council farkı

| Soru | Doğru kayıt |
| :-- | :-- |
| Şu anda ne oluyor ve ne bekleniyor? | `missions.status` |
| Bu karara hangi olay sırasıyla gelindi? | `missions.trace` |
| Ajanlar tam olarak ne söyledi? | `missions.conversation` |
| Kurul niçin kapandı, kim ne yönde oy verdi? | `missions.council` |
| Ana kayıt dosyası okunabildi mi? | `missions.store` |

### 26.7 Kayıt dosyaları

- `missions.json`: hızlı okunabilen son durum/snapshot.
- Adaptif misyon trace JSONL dosyası: yalnız sona eklenen olay günlüğü.
- Ledger: liderin yeniden bağlamlandırılması için kısa tur hafızası.
- Görev ve oturum kayıtları: çalışanların gerçek çalışma kaynakları.

Yazım güvenliği için olay izi önce eklenir, ardından snapshot güncellenir. Böylece sistem olay gerçekleştiği hâlde son durum kaydı yazılamadıysa bunu uzlaştırabilir.

### 26.8 Planlayıcının çalışma sınırları

Bugünkü planlayıcı:

- Claude headless süreçtir,
- seçilen liderin çalışma klasörünü kullanır,
- çağrı başına en fazla 15 model turuna sahiptir,
- yaklaşık 10 dakika çağrı zaman aşımına sahiptir,
- doğrudan terminal, yazma ve ajan çağırma araçları kullanmaz,
- ilk çağrıda proje özetini alır,
- sonraki çağrılarda planlama oturumunu sürdürür,
- sürdürme başarısızsa ledger, brifing ve son yönlendirmeyle yeni oturuma devir yapar.

Planlayıcının cevabı beklenen kayıt biçimine uymuyorsa hata aynı planlayıcıya bir kez geri verilip düzeltilmesi istenir. İkinci cevap da okunamıyorsa sistem serbest metinden karar uydurmaz; koşuyu protokol hatasıyla kapatır.

### 26.9 Dokuz hata sınıfı

| Kod | Kullanıcı dilinde |
| :-- | :-- |
| `agent-missing` | Seçilen ajan bulunamadı |
| `target-missing` | İncelenecek/düzeltilecek önceki kayıt bulunamadı |
| `request-refused` | Ajan veya kural isteği reddetti |
| `record-lost` | Beklenen görev kaydı kayboldu |
| `interrupted` | Çalışma yarıda kesildi |
| `cancelled` | Kullanıcı iptal etti |
| `engine-refused` | Motor isteği kabul etmedi |
| `budget-stopped` | Kaynak sınırı yeni işe izin vermedi |
| `delegate-failed` | Çalışan görevi başlatılamadı |

### 26.10 Sistemin değişmemesi gereken doğruluk kuralları

> [!CHECK] İleri düzey denetim listesi
>
> 1. Lider gerçek ajan kimliğidir; planner modeli veya motoru değildir.
> 2. Planner ayrı bir headless Claude oturumudur; gizli üçüncü ajan değildir.
> 3. Çalışan işleri normal Task yolu üzerinden yürür.
> 4. Classic ve Adaptive aynı yaşam döngüsünü paylaşır.
> 5. Çalışan görevinin tamamlanması başarı kriterini otomatik geçirmez.
> 6. Zorunlu ve güncel kriterler geçmeden başarı kapısı açılmaz.
> 7. İnceleme, karşılaştırma ve düzeltme gerçek önceki işlere bağlıdır.
> 8. Parallel tek-yazıcı kuralını aşamaz.
> 9. Gerçek çalışan cevabı yoksa konuşmaya hayali mesaj eklenmez.
> 10. Council kendi karar sorusunu tartışır; bütün hedefin sonucunu belirlemez.
> 11. Oy, başarı kriteri kararı değildir.
> 12. Sonucu bilinmeyen yazma işi körlemesine tekrar edilmez.
> 13. Kullanıcı yönlendirmesi çalışan işe değil, sonraki lider kararına gider.
> 14. Kullanıcı bekleme süresi aktif süre bütçesinden çıkarılır.
> 15. Yalnız geçerli tam 0 bir sınırı kaldırır.
> 16. Maliyet bildirmeyen motorda `$0` “ücretsiz” diye yorumlanmaz.
> 17. Başlatma önizlemesi ile gerçek host çözümleyicisi aynı olmalıdır.
> 18. Toplu çalışan profili görünür satırları değiştirmeli; ikinci gizli öncelik yaratmamalıdır.
> 19. Talep edilen, çözümlenen ve gerçekten uygulanan ayarlar ayrılmalıdır.
> 20. Oturum bağlantısı ile çıktı bağlantısı iki ayrı kaynaktır.
> 21. Misyondan doğan oturumlar normal kullanıcı oturumu gibi görünmemelidir.
> 22. Arayüz, Bridge ve kalıcı kayıt aynı çalışma gerçeğini anlatmalıdır.

---

## Son söz

Adaptif misyon, “bir grup ajanı çalıştır” düğmesi değildir. İyi kurulduğunda:

- sizin tarif ettiğiniz sonuca odaklanan,
- kararları gerçek bulgulara göre değiştiren,
- uzman çalışanları ihtiyaç oldukça kullanan,
- tartışma ile kanıtı birbirine karıştırmayan,
- yapılan işi başarı koşullarıyla ayrıca denetleyen,
- kesinti, bütçe ve belirsizlikleri açıkça kaydeden

bir çalışma yönetim sistemidir.

> [!SUCCESS] Bu rehberi bitirdiğinizde bilmeniz gereken tek cümle
> **Hedefi ve başarı ölçüsünü siz kurarsınız; lider yolu yönetir; çalışanlar işi yapar; Agent Farm ise kararların, kanıtların ve gerçek çalışma kaynaklarının birbirinden kopmamasını sağlar.**

---

*Belge tarihi: 23 Ağustos 2026*  
*Kapsam: Mevcut adaptif misyon davranışı ile U-99, U-100, U-101, U-102, U-103, U-104, U-97, X-95 ve X-96 altında açıkça işaretlenen hedef arayüz düzeni.*
