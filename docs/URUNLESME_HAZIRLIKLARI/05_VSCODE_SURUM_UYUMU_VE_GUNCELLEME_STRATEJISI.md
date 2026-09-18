# 05. VS Code Sürüm Uyumu, Güncelleme Stratejisi ve Yeni API Fırsatları

> VS Code her ay yeni bir kararlı sürüm yayınlar. Ticari bir eklentinin hem eski sürümlere sahip kullanıcıları dışlamaması (geniş taban) hem de en güncel VS Code sürümlerinde çökmeden, yeni platform yeteneklerinden faydalanarak çalışması gerekir.

---

## 📊 1. Mevcut Durum ve Sürüm Tabanı

* **`engines.vscode`:** `^1.90.0`
* **`@types/vscode`:** `^1.90.0`
* **Geliştirme Ortamı:** VS Code 1.103.x+ üzerinde canlı doğrulanıyor.

**Temel Kural:** Minimum motor sürümünü çok yüksek tutmak (örneğin yalnızca 1.104+ demek) güncellemeleri gecikmiş kurumsal kullanıcıları kaybeder. Ancak çok eski tutmak da yeni VS Code API'lerini kullanmayı engeller.

---

## ⚠️ 2. Olası Riskler ve Kırılma Noktaları Analizi

1. **Extension Host Yeniden Başlatma Davranışı:**
   - VS Code 1.103+ ile ölçüldüğü üzere, `restartExtensionHost` komutu eklenti klasörünü yeniden taramaz; güncellenen VSIX'in yüklenmesi için `window.reload` gereklidir. Bu mantık `selfRestart.ts` içinde korunmalıdır.
2. **Webview Content Security Policy (CSP) Sıkılaştırması:**
   - Yeni VS Code sürümlerinde inline script ve stil kısıtlamaları sıkılaşmaktadır. `htmlShell.ts` içindeki CSP nonce yapısı güncel standartlara uygun tutulmalıdır.
3. **Terminal Shell Entegrasyonu Değişiklikleri:**
   - VS Code'un terminal akışlarında `shellIntegration` API'sinin gelişimine paralel olarak Esc/interrupt mekanizmasının kararlılığı her sürümde doğrulanmalıdır.

---

## 🚀 3. Yeni VS Code API'leri ile Değer Katlama Fırsatları

VS Code'un 1.90+ ve sonraki sürümlerinde eklenen yeni API'ler, Agent Farm'a devasa rekabet avantajı sağlayabilir:

| Yeni VS Code Yeteneği | Agent Farm Entegrasyonu | Kullanıcıya Değeri |
|---|---|---|
| **Chat Participant API (`@chat`)** | `@agentfarm` katılımcısı eklemek | Kullanıcı VS Code'un yerel Copilot/Chat panelinden `@agentfarm /sentry start` veya `@agentfarm /cost` yazabilir. |
| **Language Model Tools API** | Agent Farm köprü op'larını VS Code tool'u olarak kaydetmek | VS Code içindeki diğer yapay zeka araçları da Agent Farm ajanlarına iş delege edebilir. |
| **Terminal Shell Execution API** | `window.onDidStartTerminalShellExecution` | Ajanların terminal komutlarını mikro saniye seviyesinde ve hatasız izlemek. |
| **Native Walkthroughs** | `contributes.walkthroughs` | Eklenti kurulduğunda VS Code'un yerel "Get Started" sekmesinde interaktif karşılama. |

---

## 🧪 4. Sürüm Doğrulama ve Test Matrisi

Geliştirme döngüsünde eklenti paketlenmeden önce 3 eksende test edilmelidir:

```
                  ┌─────────────────────────────────┐
                  │    Agent Farm Test Pipeline     │
                  └────────────────┬────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
  [Minimum Taban]           [Güncel Stable]           [VS Code Insiders]
   VS Code 1.90.0            VS Code 1.103.x           Son Günlük Sürüm
 (Taban API Uyumu)         (Canlı Kullanıcı)         (Gelecek Kırılmaları)
```

---

## 📋 Uygulama Görevleri (Checklist)

- [ ] `@types/vscode` sürümünü kontrollü olarak güncelle (`1.95.0` veya `1.98.0` stabil seviyesine çek).
- [ ] `@agentfarm` Chat Participant prototipini değerlendir ve backlog'a ekle.
- [ ] CI üzerinde hem minimum hem en son VS Code sürümünde smoke testlerini çalıştır.
- [ ] Deprecated olmuş herhangi bir VS Code API çağrısı olup olmadığını linter/typecheck ile tara.
