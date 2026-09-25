# Monitor ile Asenkron Soru Bekleme Deseni (Pattern & Anti-Pattern Analizi)

> **Tarih:** 2026-09-25  
> **Referans Oturum:** `288966d3-2dc8-420f-9ae4-e97602b48b65` (Baton Relay zinciri: `chn_mugu63gw003vp7`, ayak 5/12)  
> **Konu:** Ajanların Claude Code `Monitor` aracı ile Agent Farm köprüsünü birleştirerek sıfır token'la kullanıcı yanıtı beklemesi ve bunun otonom akışlardaki riskleri.

---

## 1. Olay ve Keşif

Göç Kokpiti (X-154) projesi kapsamında otonom çalışan 12 ayaklık bir bayrak yarışında (Baton Relay), 4. ve 5. ayakların ilerlemeyip saatlerce aynı oturumda beklediği tespit edildi. 

Oturum incelendiğinde ajanın soru sormak için etkileşimli sohbet modalı (`AskUserQuestion`) açmadığı; bunun yerine Agent Farm bildirim panosuna (`Notices`) soru bırakıp oturumun içinde uykuya yatarak cevabı beklediği görüldü.

---

## 2. Mekanizma Nasıl Çalışıyor? (Teknik Mimari)

Bu desen, sistemde önceden tanımlanmış tek bir özellik değil; ajanların iki bağımsız mekanizmayı birleştirdiği bir **hibrit orkestrasyon** örneğidir:

```
[Agent Farm Notices] <--- (1. Soru Bırakıldı: type=question)
         ^
         |  (3 dakikada bir yoklama)
[Local Node.js: ck_wait.js]
         |
         v  (Exit 0 / Stdout Event)
[Claude Code CLI: Monitor Tool] ---> [Claude Modeli Uyanır] (Turn 2)
```

### A. Yerel Polling Scripti (`%TEMP%\ck_wait.js`)
Ajan, yerel geçici dizine her 3 dakikada bir köprüyü yoklayan minimal bir script bırakır:

```javascript
const { execFileSync } = require('child_process');
const af = process.env.APPDATA + '/Code/User/globalStorage/muvusoft.agent-farm/bridge/af.js';
const ids = ['mugxzwgtgfcbr', 'mugx8clc2zdfc'];

function tick() {
  // 1. Kota kontrolü (%90'a ulaştıysa devretmek üzere uyan)
  const pct = quota();
  if (pct !== null && pct >= 90) { console.log('QUOTA'); process.exit(0); }

  // 2. Notices ve Queue kontrolü (Soru yanıtlandı mı veya iş kuyruğuna girdi mi?)
  const open = call(['notices.list', 'agent=developer', 'type=question', 'handled=false']);
  const q = call(['queue.list', 'sourceNoticeAgent=developer', 'active=true']);
  
  // 3. Yanıt geldiyse Monitor'ü tetiklemek için başarıyla çık
  if (soruYanitlandi) {
    console.log('ANSWER: ...');
    process.exit(0);
  }
}
setInterval(tick, 180000);
```

### B. Claude Code `Monitor` Aracı ile Uyku Modu
Ajan bu scripti doğrudan terminalde bloklayıcı olarak çalıştırmaz. Claude Code'un `Monitor` aracına devreder:

```json
{
  "command": "node \"$TEMP/ck_wait.js\"",
  "description": "Göç kokpiti X-387/X-393 soru cevapları bekleniyor",
  "timeout_ms": 1800000
}
```

* **Sıfır Token Harcaması:** `Monitor` aracı tetiklendiğinde Claude Code oturumu `waiting-task` durumuna geçer. Arka planda yerel Node.js process'i çalışırken LLM (Claude) inference'ı tamamen durur; token tüketimi sıfırdır.
* **30 Dakikalık Uyanma Döngüsü:** Monitor zaman aşımı 30 dakikadır. 30 dakika boyunca cevap gelmezse sistem `<task-notification>` ile ajanı uyandırır. Ajan tek bir kısa turn çalıştırarak (birkaç sent maliyetle) *"Cevap gelmedi, 30 dakika daha uzattım"* der ve Monitor'ü yeniden kurar.

---

## 3. Desen Neden Çekici? (Pozitif Yönleri)

1. **Token Tasarrufu:** Oturum kapanmadan, döngüde gereksiz prompt/completion yakmadan saatlerce bekleme sağlar.
2. **Kullanıcıyı Bölmeme:** Ekranda ansızın modal soru kartları açıp kullanıcının o anki işini bölmez.
3. **Reaktif Uyanış:** Kullanıcı dashboard'dan bildirimi cevapladığı veya kuyruğa attığı anda en geç 3 dakika içinde ajan uyanıp kodlamaya devam eder.

---

## 4. Neden Büyük Bir Anti-Pattern? (Otonom Akışlarda Sistemik Riskler)

Bu desen tekil ve canlı bir çalışma seansında zararsız gibi görünse de, **Baton Relay (Bayrak Yarışı), Otonom Nöbet (Sentry) veya Gece Misyonları** gibi akışlarda sistemi kilitleyen kritik bir kusura dönüşür:

### 1. Zinciri Felç Eder (Pipeline Deadlock)
* Bayrak yarışı zinciri (`chn_...`) otonom ilerleme üzerine kuruludur.
* 5. ayak uykuya yattığında zincir durur; 6, 7 ve sonraki ayaklar başlatılamaz. Gece boyunca bitmesi planlanan işler tek bir insan cevabına kilitlenerek sabaha kadar askıda kalır.

### 2. Canlı Oturum ve Kaynak Sızıntısı
* Oturum kapatılmadığı için işletim sisteminde canlı bir PID (`alive: true`), açık bir terminal process'i ve Agent Farm'da meşgul bir Console kartı rezerve edilir. Bu durum oturum havuzunun büyümesine ve sistem kaynaklarının tıkanmasına yol açar.

### 3. Otonom Varsayılan Kuralını (Timeout-Fallback) Bypass Eder
* Otonom sistemlerdeki sorular (örneğin Supervisor kararları veya akıllı kapılar), insan belirli bir sürede cevap vermezse **"güvenli/önerilen varsayılanı seçerek akışa devam et"** prensibine göre tasarlanmıştır.
* `Monitor` ile sonsuz uykuya yatmak, bu otomatik ilerleme emniyetini bypass eder ve otonom zinciri kör bir insan bağımlılığına mahkum eder.

---

## 5. Kesin Kural ve Kullanım Sınırı (ÖNEMLİ UYARI)

> ⚠️ **UYARI — KULLANICI ÖZELLİKLE TALEP ETMEDİKÇE KESİNLİKLE BAŞVURULMAMALIDIR:**  
> Kullanıcı özellikle bu tekniği açıkça istemediği durumlarda; bir insan gelip cevap verene kadar oturumları kalıcı olarak tıkayacağı, süreçleri askıda bırakacağı ve tüm sistemi kilitleyeceği için **son derece riskli ve zararlı bir uygulamadır.**
> 
> Normal ve standart soru sorma mekanizmaları (ekranda interaktif soru sorma veya standart bildirim/devir akışı) zaten mevcuttur. Ajanların kendi inisiyatifiyle "akıllılık edip" oturumu böyle bir uyku döngüsüne sokması **kesinlikle yasaktır ve başvurulmaması gereken bir anti-pattern'dir.**

1. **Özellikle Talep Edilmedikçe Kullanılamaz:** Yalnızca ve yalnızca kullanıcı doğrudan "bunu bekleme betiği ve Monitor ile uyutarak dinle" derse uygulanabilir; bunun haricinde hiçbir ajan kendi kendine bu yola sapamaz.
2. **Otonom Akışlarda (Baton Relay, Nöbet, Headless Misyonlar):** Oturumlar asla insan için süresiz kilitlenemez. Normal soru akışı izlenir, gerekirse önerilen varsayılanla devam edilir veya oturum temizce devredilip/kapatılıp sonlandırılır; oturum uykuda açık bırakılamaz.
