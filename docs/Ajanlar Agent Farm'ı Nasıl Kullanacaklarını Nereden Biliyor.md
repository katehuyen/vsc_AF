
**USER** (01:29 PM (06:29 UTC))

agent farm'ın bir dolu özeliği var hem kullanıcıyla iletişime geçme kanalları hem diğer fonksiyonları olarak.. peki ajanların bunların tümünün farkında olarak işi ele alması için ve en doğru zamanda en doğru aleti veya yolu kullanabilmesi için düzenli işleyen bir yol var mı, yoksa tesadüfen o ajanın kendi merakına ve araştırmasına mı terk edilmiş bu durum

**GEMINI** (▸ reply · 01:29 PM (06:29 UTC) · gemini-3.7-flash)

Kesinlikle **tesadüfe veya ajanın kişisel merakına terk edilmiş değil**. Sistemde bunu garanti altına almak için tasarlanmış **3 katmanlı bir mimari** var; ancak pratikte ajanların bazen (az önceki gibi) kör noktalara düşmesinin de çok somut bir sebebi var.

Sistem şu şekilde işleyecek şekilde kuruldu:

---

### 1. Kurulmuş Olan Düzenli Mekanizma (Nasıl Çalışıyor?)

Agent Farm'ın onlarca özelliğini (notices, queue, missions, sentry, bridge, schedules, workflows vb.) her tur ajanın sistem prompt'una gömmek imkansızdır (token patlaması yaşanır ve bağlam çöker). Bu yüzden sistem **3 kademeli bir keşif ve karar mekanizması** ile yürür:

1. **Anayasa ve Tetikleyiciler Katmanı (`_REF/` Rehberleri):**
   * Ajanın her tur zorunlu okuduğu Anayasa'nın §15 bölümünde bir **"Triggers (Tetikleyiciler)"** tablosu vardır:
     * *"Kullanıcıya haber/rapor/soru ileteceksen → `_REF/notices.md` oku."*
     * *"Agent Farm fonksiyonu çağıracaksan → `_REF/bridge.md` oku."*
     * *"İş kuyruğuyla çalışacaksan → `_REF/queue.md` oku."*
     * *"Başka ajana iş delege edeceksen → `_REF/missions.md` oku."*
   * Ajan kurallara göre hafızasından çalışamaz; o işi yapmadan önce ilgili rehberi okumak zorundadır.

2. **Dinamik Yetenek Keşfi (`farm.ops` Kataloğu):**
   * Ajanlara Agent Farm fonksiyonlarını ezberletmek yasaktır (`_REF/bridge.md` kuralı).
   * Ajan Agent Farm'ın ne yapabildiğini görmek için tek bir komut çalıştırır:
     `node $b farm.ops`
   * Bu komut, o an çalışan sürümün **tüm fonksiyonlarını, parametrelerini, açıklamalarını ve kullanım amaçlarını** canlı bir katalog olarak ajanın önüne döker. Ajan "ben bunu nasıl yaparım?" dediğinde köprüden kataloğu çekip doğru aleti seçmelidir.

3. **Periyodik Nöbetler (`DUTIES.md`):**
   * Her ajanın kendi klasöründe bir `DUTIES.md` vardır. Burada `[every-turn]`, `[hourly]` gibi nöbetler tanımlıdır. Ajan her tur notices listesini, okunmamış bildirimleri kontrol etmekle yükümlüdür.

---
