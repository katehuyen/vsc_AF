# 02. Monetization (Gelir Modeli) ve Lisanslama Stratejisi

> Agent Farm'ın ticari bir ürüne dönüşmesinde en önemli prensip: **Geliştiriciyi üzmeyen, şeffaf, yerellik ve gizlilikten ödün vermeyen, ama sağladığı muazzam verimliliğin karşılığını adilce tahsil eden bir model kurmaktır.**

---

## 💎 1. Gelir Modeli Seçenekleri

| Model Türü | İşleyiş | Avantajı | Dezavantajı |
|---|---|---|---|
| **A. Freemium (Abonelik / Yıllık Pro)** *(Önerilen)* | Temel özellikler ücretsiz; Sentry nöbet, çoklu hesap rotasyonu, misyonlar Pro lisansla yıllık/aylık satılır. | Sürekli nakit akışı, geliştiricilerin %80'ine ücretsiz yayılma, en ağır kullanıcıları monetize etme. | Sürekli güncelleme ve müşteri desteği beklentisi. |
| **B. Tek Seferlik Ömür Boyu (Lifetime License)** | $49 - $99 tek ödeme ile 1 yıl güncelleme garantili lisans. | Hızlı ilk gelir, geliştiricilerin abonelik antipatisini kırma. | Uzun vadede sürdürülebilir gelir akışı yaratmak zorlaşır. |
| **C. Kullanım Başına / Token Payı** | Kullanılan API tokenlarından komisyon alma. | Doğrudan kullanıma bağlı. | Yerel CLI ve kullanıcı aboneliği prensibini bozar, güveni kırar (KESİNLİKLE TAVSİYE EDİLMEZ). |

**Stratejik Karar:**
**Model A + B Hibrit (Pay-Once-Use-Forever with 1 Year Updates veya Yıllık Pro Abonelik):**
Örn: 
- **Aylık Pro:** $12 / ay
- **Yıllık Pro:** $99 / yıl (2 ay bedava)
- **Lifetime (Sınırlı Erken Erişim):** $149 (Erken benimseyenleri fonlamak için)

---

## 🔒 2. Free (Community) vs. Pro Özellik Matrisi

Ürünün yayılmasını engellemeden, "gerçekten para kazandıran otonom güçleri" Pro kapısının arkasına alıyoruz:

| Özellik / Modül | Community (Free) | Pro Lisans |
|---|:---:|:---:|
| **Çoklu Motor Desteği** (Claude, Codex, Gemini, Antigravity) | ✅ Sınırsız | ✅ Sınırsız |
| **Console & Panel İçi Canlı Konuşma** | ✅ 2 Eşzamanlı Ajan | ✅ Sınırsız Ajan |
| **Dashboard & Temel Maliyet Takibi** | ✅ Tam | ✅ Tam + Gelişmiş Filtreler |
| **Ajan Yönetimi & Hafıza Görüntüleyici** | ✅ 3 Ajana Kadar | ✅ Sınırsız Ajan Filosu |
| **Sentry (Otonom Gece Nöbeti & Kampanyalar)** | ❌ Kapalı | ✅ **Sınırsız Nöbet & Lider Turu** |
| **Akıllı Çoklu Hesap Rotasyonu (`chain` / `emptiest`)** | ❌ Tekil Hesap | ✅ **Sınırsız Hesap & Kota Yönetimi** |
| **Missions (Çoklu Ajan Delegasyonları & Tur Planlama)** | ❌ Kapalı | ✅ **Tam Ağaç & Adaptif Tur** |
| **Arka Plan Görev Kuyruğu & Zincirler (Workflows)** | ⚠️ Yalnızca Manuel | ✅ **Otomatik Zamanlayıcı (Cron/Daily)** |
| **Hızlı Ripgrep Shard Arama Korpusu** | ⚠️ Temel Arama | ✅ **600+ MB Korpus Hızlandırıcı** |
| **LLM Wiki Kokpiti & Otomatik Sentez** | ❌ Kapalı | ✅ **Aday Havuzu & Derleyici** |
| **Telegram Köprüsü & Uzaktan Web Görünümü** | ❌ Kapalı | ✅ **Şifreli Uzaktan Erişim** |
| **Sır Kasası (Secret Vault)** | ⚠️ 2 Anahtar | ✅ **Sınırsız Şifreli Kasa** |

---

## 🔑 3. Lisanslama ve Doğrulama Mimarisi

Kullanıcının gizliliğini korumak için **asimetrik kriptografik imza (Ed25519 / RSA JWT)** kullanılır:

```
[Kullanıcı Satın Alır] → (Lemon Squeezy / Polar.sh)
      ↓
[İmzalı Lisans Anahtarı Üretilir] (Email + Bitiş Tarihi + Özellik İmzası)
      ↓
[VS Code: License.Activate] → Eklenti içindeki açık anahtar ile YEREL doğrulanır
      ↓
[Çevrimdışı Çalışma Garantisi] → 30 günde bir arka planda sessiz teyit; internet yoksa çalışmaya devam eder
```

**Güvenlik Prensibi:**
- Lisans anahtarı doğrulanırken sunucuya **ASLA** transkript, kod, dosya adı veya model promptu gönderilmez.
- Yalnızca `licenseKey`, `machineHash` ve `version` sorgulanır.

---

## 💳 4. Ödeme ve Satış Platformu (Merchant of Record)

Global yazılım satışında vergi (KDV/VAT), fatura ve ters ibrazlarla uğraşmamak için bir MoR (Merchant of Record) kullanılmalıdır:

1. **Polar.sh** *(En Güçlü Aday)*: Geliştirici ve açık kaynak dostu, düşük komisyon (%4 + 40¢), dahili lisans anahtarı üretme API'si var.
2. **Lemon Squeezy**: Global faturalandırma ve abonelik yönetiminde dünya standardı, Stripe altyapılı.
3. **Gumroad**: Basit ama komisyon oranları daha yüksek.

---

## 📋 Uygulama Görevleri (Checklist)

- [ ] `src/core/license.ts` modülünü yaz (Ed25519 public key doğrulama ve yerel saklama).
- [ ] UI üzerinde `PRO` rozetlerini ve kilitli özellikler için `Upgrade to Pro` modal kartlarını (`AFLicenseModal`) tasarla.
- [ ] Polar.sh / Lemon Squeezy üzerinde ürün ve fiyat planlarını tanımla.
- [ ] Webhook ile anında lisans üreten backend akışını doğrula.
