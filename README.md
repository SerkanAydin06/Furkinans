# Furkinans PWA

Furkinans, iPhone ve Android tarayıcısında çalışan basit ödeme takip uygulamasıdır.

## Özellikler
- Hesap / Tarih / Açıklama şeklinde 3 sütunlu ana ekran
- Manuel kayıt ekleme, düzenleme ve silme
- Son Ödeme / Hesap Kesim seçimi
- Bildirim günü, saat ve ileri bakma günü ayarı
- Verileri cihazda localStorage ile kalıcı saklama
- Furkinans Google Apps Script sunucusuna otomatik senkronizasyon
- Telegram test mesajı
- iPhone'da Safari > Paylaş > Ana Ekrana Ekle ile uygulama görünümü
- Service Worker ile arayüzün çevrimdışı açılabilmesi

## Backend
Uygulama Furkinans Google Apps Script backend'ini kullanır. `FURKINANS_API_KEY` kaynak koda gömülmez; kullanıcı Bildirim Ayarları ekranından bir kere girer ve değer yalnızca cihazın tarayıcı depolamasında tutulur.

## iPhone kurulumu
1. GitHub Pages üzerinden yayınlanan Furkinans adresini iPhone'da Safari ile aç.
2. Safari'de Paylaş düğmesine bas.
3. Ana Ekrana Ekle'yi seç.
4. Furkinans ikonuna dokunarak uygulama gibi aç.
5. Bildirim Ayarları > API anahtarı alanına Apps Script Proje Ayarları'ndaki `FURKINANS_API_KEY` değerini gir.
6. Telegram Testi ile bağlantıyı kontrol et.
