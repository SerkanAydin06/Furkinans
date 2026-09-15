# Furkinans v1.0

Bu paket, **sıfırdan yazılmış** yeni Furkinans sürümüdür.

## İçerik
- `index.html` → ana PWA arayüzü
- `styles.css` → pro koyu tema arayüz stili
- `app.js` → kayıtlar, bildirim ayarları, bağlantı ayarları, yerel kayıt + senkron mantığı
- `service-worker.js` → offline cache
- `manifest.webmanifest` → PWA manifest
- `icons/` → uygulama ikonları
- `backend/Furkinans_Backend_v1_0.gs` → Google Apps Script backend

## Bu sürümde olanlar
- Tamamen yeni **v1.0** yapı
- Üst sekmeler: **Kayıtlar / Bildirim Ayarları / Bağlantı Ayarları**
- Pro koyu tema ve kart bazlı kayıt görünümü
- Durum tıklamayla değişir: **Bekliyor / Gecikti / Ödendi**
- Sola kaydırınca **Sil** alanı açılır
- Haftalık bildirim planı
- Gelecek günler + geçmiş günler için hatırlatma aralığı
- Ödenmeyen kayıtlar için günlük tekrar hatırlatma
- Telegram bot ile eşleme kodu mantığı
- Apps Script tabanlı çok cihazlı senkron altyapısı
- Başlık yanında sürüm etiketi: **v1.0**

## Google Apps Script kurulumu
1. `backend/Furkinans_Backend_v1_0.gs` dosyasının içeriğini yeni bir standalone Apps Script projesine yapıştır.
2. **Script Properties** içine şunları gir:
   - `TELEGRAM_BOT_TOKEN` = BotFather token
   - `TELEGRAM_BOT_USERNAME` = bot kullanıcı adı (`@` olmadan önerilir)
3. `setupFurkinansV1()` fonksiyonunu bir kez çalıştır.
4. `Dağıt > Yeni dağıtım > Web uygulaması` seç.
5. Erişim: **Herkes**
6. Oluşan `/exec` URL’ini PWA’daki **Bağlantı Ayarları** bölümüne yapıştır.

## Eski veriler
Yeni v1.0 ilk açılışta aynı tarayıcıdaki `furkinans_pwa_v1` kayıtlarını **bir kez otomatik içe aktarır**. Bildirim planı güvenlik için otomatik etkinleştirilmez; kullanıcı Bildirim Ayarları bölümünden bilinçli olarak etkinleştirir.

## Teknik not
Tarayıcıdan Apps Script’e senkron POST istekleri `no-cors` ile `text/plain` olarak gönderilir. Sunucu ve Telegram durumu JSONP ile ayrıca doğrulanır.
