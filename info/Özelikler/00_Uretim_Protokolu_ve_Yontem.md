# 00 — Agent Farm Özellik Envanteri Üretim Protokolü ve Yöntemi

Bkz. [[AgentFarm_Technical_DNA]]

Bu doküman; \`01_Urun_Ozellik_Envanteri\` klasöründeki 3 aşamalı envanter dosyalarının (**01_Ham_Mekanik_Envanter.md**, **02_Kategorik_Analiz_ve_Derinlik.md**, **03_Master_Tanitim_Katalogu.md**) nasıl üretildiğini, hangi kaynaklardan beslendiğini ve gelecekte yeni sürümler çıktığında **herhangi bir insan veya yapay zeka ajanı tarafından sıfır bilgi kaybıyla nasıl tek seferde yeniden üretilebileceğini** adım adım açıklar.

---

## 🎯 Üretim İlkesi: "Tahmin Yok, Mekanik Kayıt Var"

LLM'lerin geniş kod tabanlarını özetlerken düştüğü en büyük hata, dosyalara rastgele bakıp "aklına gelenleri" listelemesidir. Bu protokolde **tahmine yer yoktur**; tüm veriler Agent Farm'ın kodundaki resmi kayıt defterlerinden (registries) mekanik olarak çekilir.

---

## 📂 Tek Doğruluk Kaynakları (Single Sources of Truth - SSOT)

Ajan veya geliştirici, verileri sadece şu 5 resmi kaynaktan çeker:

| Kaynak | Dosya Yolu | Ne Sağlar? |
|---|---|---|
| **VS Code Manifest** | \`vsc_AgentFarm/package.json\` | Tüm kayıtlı komutlar (\`commands\`), ayarlar (\`configuration\`), paneller (\`views\`), menüler ve kısayollar. |
| **Bridge Operasyonları** | \`vsc_AgentFarm/src/extension.ts\` | Bridge RPC üzerinden dış dünyaya açılan tüm \`farm.ops\` listesi. |
| **Arayüz Panelleri** | \`vsc_AgentFarm/src/panels/*.ts\` | Tüm backend panel yöneticileri. |
| **Webview Arayüzleri** | \`vsc_AgentFarm/media/*.js\` | Kullanıcının gördüğü tüm interaktif ekran bileşenleri ve hover sistemleri. |
| **Çekirdek Sistemler** | \`vsc_AgentFarm/src/core/*.ts\` | Baton, A2A, Reopen, Flex, Launchers gibi saf domain alt sistemleri. |
| **Eşitlik Manifestosu** | \`vsc_AgentFarm/parity.manifest.json\` | UI komutları ile Bridge op'ları arasındaki birebir eşleşme haritası. |

---

## 🛠️ 3 Aşamanın Üretim Adımları

```
[ Kod Tabanı Kayıtları ] ──► (Adım 1: extract.js) ──► 01_Ham_Mekanik_Envanter.md
                                      │
                                      ▼
                             (Adım 2: analyze.js) ──► 02_Kategorik_Analiz_ve_Derinlik.md
                                      │
                                      ▼
                             (Adım 3: catalog.js) ──► 03_Master_Tanitim_Katalogu.md
```

### 1. Aşama: Ham Mekanik Döküm (\`01_Ham_Mekanik_Envanter.md\`)
* **Amaç:** Kod tabanındaki istisnasız her komutu, ayarı, paneli ve bridge op'unu tek bir satır atlamadan tabloya dökmek.
* **Yöntem:** \`package.json\` JSON olarak okunur, \`src/panels\` ve \`src/core\` dizinleri taranır, \`src/extension.ts\` içindeki \`op: '...'\` kalıpları Regex ile toplanır.

### 2. Aşama: 7 Sütunlu Mimari Analiz (\`02_Kategorik_Analiz_ve_Derinlik.md\`)
* **Amaç:** Ham verileri 7 ana mimari sütuna bölüp teknik derinliğini açıklamak:
  1. *Oturum Yönetimi & 11 Kapı Paritesi*
  2. *Ajanlar Arası İşbirliği (A2A) & Missions*
  3. *Süreklilik, Dayanıklılık & Baton Relay*
  4. *Arayüz, Canlı Konsol & AFTip*
  5. *Mobil, Android Companion & Telegram*
  6. *Hafıza, Wiki & Bilgi Tabanı*
  7. *Güvenlik, Secrets Vault & Kalite Kapıları*

### 3. Aşama: Master Tanıtım Kataloğu (\`03_Master_Tanitim_Katalogu.md\`)
* **Amaç:** Özellikleri pazarlama ve içerik üretimi için "Show, Don't Tell" kartlarına, ikili/üçlü eşleşme senaryolarına ve 6 haftalık lansman takvimine dönüştürmek.

---

## 🚀 Tek Komutla Yeniden Üretim Scripti (Standalone Generator)

Gelecekte Agent Farm güncellendiğinde tüm bu dosyaları tek seferde yeniden üretmek için aşağıdaki Node.js betiğini çalıştırmak yeterlidir:

```javascript
// Bu betiği bir dosyaya kaydedip (örn: generate_all.js) "node generate_all.js" şeklinde çalıştırın.
const fs = require('fs');
const path = require('path');

const projectRoot = 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm';
const outDir = 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\PRS.MuratVural_DEV_VSC.AgentFarm\\30_Deliverables\\01_Urun_Ozellik_Envanteri';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Veri Kaynaklarını Oku
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const commands = pkg.contributes?.commands || [];
const viewsContainers = pkg.contributes?.viewsContainers || {};
const views = pkg.contributes?.views || {};
const configProps = pkg.contributes?.configuration?.properties || {};

const panelsDir = path.join(projectRoot, 'src', 'panels');
const panelFiles = fs.existsSync(panelsDir) ? fs.readdirSync(panelsDir) : [];

const mediaDir = path.join(projectRoot, 'media');
const mediaFiles = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : [];

const coreDir = path.join(projectRoot, 'src', 'core');
const coreFiles = fs.existsSync(coreDir) ? fs.readdirSync(coreDir) : [];

const bridgeOps = [];
const extPath = path.join(projectRoot, 'src', 'extension.ts');
if (fs.existsSync(extPath)) {
  const extContent = fs.readFileSync(extPath, 'utf8');
  const opRegex = /op:\s*['"]([a-zA-Z0-9_.]+)['"]/g;
  let match;
  while ((match = opRegex.exec(extContent)) !== null) {
    if (!bridgeOps.includes(match[1])) bridgeOps.push(match[1]);
  }
}

// 2. 01_Ham_Mekanik_Envanter.md Dosyasını Yaz
let phase1 = \`# 01 — Agent Farm Ham Mekanik Özellik Envanteri

**Oluşturulma Tarihi:** \${new Date().toISOString().replace('T', ' ').substring(0, 19)}

## 1. VS Code Komutları (\${commands.length} Adet)
| # | Komut ID | Başlık | Kategori |
|---|---|---|---|
\${commands.map((c, i) => \`| \${i+1} | \\\`\${c.command}\\\` | \${c.title || '-'} | \${c.category || '-'} |\`).join('\\n')}

## 2. Arayüz Panelleri (\${panelFiles.length} Adet) ve Webview Betikleri (\${mediaFiles.length} Adet)
### Paneller:
\${panelFiles.map(f => \`- \\\`\${f}\\\`\`).join('\\n')}
### Webview İstemcileri:
\${mediaFiles.map(f => \`- \\\`\${f}\\\`\`).join('\\n')}

## 3. Sistem Ayarları (\${Object.keys(configProps).length} Adet)
| # | Ayar Anahtarı | Tip | Varsayılan | Açıklama |
|---|---|---|---|---|
\${Object.entries(configProps).map(([k, v], i) => \`| \${i+1} | \\\`\${k}\\\` | \\\`\${v.type || '-'}\\\` | \\\`\${JSON.stringify(v.default ?? '-')}\\\` | \${(v.description || '').replace(/\\|/g, '\\\\|').replace(/\\n/g, ' ')} |\`).join('\\n')}

## 4. Bridge RPC Operasyonları (\${bridgeOps.length} Adet)
\${bridgeOps.sort().map((op, i) => \`\${i+1}. \\\`\${op}\\\`\`).join('\\n')}

## 5. Çekirdek Modüller (\${coreFiles.length} Adet)
\${coreFiles.map(f => \`- \\\`\${f}\\\`\`).join('\\n')}
\`;

fs.writeFileSync(path.join(outDir, '01_Ham_Mekanik_Envanter.md'), phase1, 'utf8');
console.log('01_Ham_Mekanik_Envanter.md güncellendi.');
```

---

## 🔄 Yeni Bir Sürümde Envanteri Güncelleme Protokolü

Yeni bir özellik, panel veya bridge operasyonu eklendiğinde sırasıyla şu adımlar izlenir:

1. **Betiği Çalıştır:** Yukarıdaki betik çalıştırılarak \`01_Ham_Mekanik_Envanter.md\` güncellenir.
2. **Kategorik Kontrol:** Eklenen yeni yetenek \`02_Kategorik_Analiz_ve_Derinlik.md\` içindeki 7 sütundan ilgili olanına eklenir.
3. **Pazarlama Eşleştirmesi:** Yeni yetenek dikkat çekici bir "Show, Don't Tell" senaryosu barındırıyorsa \`03_Master_Tanitim_Katalogu.md\` içine bir tanıtım kartı olarak işlenir.
4. **Günlük Kaydı:** Yapılan güncelleme Obsidian \`Worklog.md\` dosyasına bir satır olarak kaydedilir.
