(() => {
  'use strict';

  const SERVER_URL = 'https://script.google.com/macros/s/AKfycbx2mm0fCPOjyUz3zGad2ltU3sQSe_6-hLWr7vJPT6OIJQu1vGZydgYadawNpen9_2vY/exec';
  const STORAGE_KEY = 'furkinans_pwa_v1';
  const UI_KEY = 'furkinans_status_ui_v1';
  const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

  const $ = (id) => document.getElementById(id);
  const els = {
    settingsSaveFeedback: $('settingsSaveFeedback'),
    settingsSaveTitle: $('settingsSaveTitle'),
    settingsSaveDetail: $('settingsSaveDetail'),
    planStatusBadge: $('planStatusBadge'),
    planScheduleLabel: $('planScheduleLabel'),
    planLookaheadLabel: $('planLookaheadLabel'),
    planDailyLabel: $('planDailyLabel'),
    planRecordCountLabel: $('planRecordCountLabel'),
    planServerLabel: $('planServerLabel'),
    telegramStatusCard: $('telegramStatusCard'),
    telegramStatusTitle: $('telegramStatusTitle'),
    telegramStatusDetail: $('telegramStatusDetail'),
    pairingControls: $('pairingControls'),
    saveSettingsButton: $('saveSettingsButton'),
    autoSyncCard: $('autoSyncCard'), autoSyncTitle: $('autoSyncTitle'), autoSyncDetail: $('autoSyncDetail'),
    tabSettings: $('tabSettings')
  };

  let serverStatus = null;
  let statusPromise = null;

  function readData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      parsed.records = Array.isArray(parsed.records) ? parsed.records : [];
      parsed.settings = Object.assign({ weekday: 6, hour: 12, minute: 0, lookahead_days: 7, lookback_days: 2, daily_hour: 22, daily_minute: 0 }, parsed.settings || {});
      return parsed;
    } catch (_) {
      return { records: [], settings: { weekday: 6, hour: 12, minute: 0, lookahead_days: 7, lookback_days: 2, daily_hour: 22, daily_minute: 0 } };
    }
  }

  function readUi() {
    try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch (_) { return {}; }
  }

  function writeUi(value) {
    localStorage.setItem(UI_KEY, JSON.stringify(value));
  }

  function int(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  function formatStamp(ms) {
    if (!ms) return '';
    try {
      return new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      }).format(new Date(ms));
    } catch (_) { return ''; }
  }

  function scheduleMatches(status, data) {
    if (!status || !status.found || Number(status.backend_version || 0) < 2.3) return false;
    const s = data.settings;
    return Number(status.weekday) === int(s.weekday, 0, 6, 6)
      && Number(status.hour) === int(s.hour, 0, 23, 12)
      && Number(status.minute) === int(s.minute, 0, 59, 0)
      && Number(status.lookahead_days) === int(s.lookahead_days, 1, 60, 7)
      && Number(status.lookback_days) === int(s.lookback_days, 0, 60, 2)
      && Number(status.daily_hour) === int(s.daily_hour, 0, 23, 22)
      && Number(status.daily_minute) === int(s.daily_minute, 0, 59, 0)
      && status.enabled !== false;
  }

  function setSaveState(state, title, detail) {
    if (!els.settingsSaveFeedback) return;
    els.settingsSaveFeedback.classList.remove('saving', 'saved', 'error');
    if (state) els.settingsSaveFeedback.classList.add(state);
    els.settingsSaveTitle.textContent = title;
    els.settingsSaveDetail.textContent = detail;
    const icon = els.settingsSaveFeedback.querySelector('.save-feedback-icon');
    if (icon) icon.textContent = state === 'error' ? '!' : state === 'saving' ? '↻' : '✓';
  }

  function renderAutoSync(state = '') {
    if (!els.autoSyncCard) return;
    const last = Number(localStorage.getItem(`${STORAGE_KEY}_last_sync`) || 0);
    els.autoSyncCard.classList.remove('syncing', 'offline', 'error');

    if (!navigator.onLine || state === 'offline') {
      els.autoSyncCard.classList.add('offline');
      els.autoSyncTitle.textContent = 'Çevrimdışı — değişiklikler cihazda saklanıyor';
      els.autoSyncDetail.textContent = 'İnternet geldiğinde otomatik olarak sunucuya gönderilecek.';
      return;
    }
    if (state === 'syncing') {
      els.autoSyncCard.classList.add('syncing');
      els.autoSyncTitle.textContent = 'Otomatik senkronizasyon yapılıyor…';
      els.autoSyncDetail.textContent = 'Değişiklikler sunucuya gönderiliyor.';
      return;
    }
    if (state === 'error') {
      els.autoSyncCard.classList.add('error');
      els.autoSyncTitle.textContent = 'Senkronizasyon tekrar denenecek';
      els.autoSyncDetail.textContent = 'Uygulama açıkken veya internet yenilendiğinde otomatik tekrar dener.';
      return;
    }
    if (state === 'waiting') {
      els.autoSyncCard.classList.add('syncing');
      els.autoSyncTitle.textContent = 'Sunucu doğrulanıyor…';
      els.autoSyncDetail.textContent = 'v2.3 hazır olduğunda senkronizasyon otomatik başlayacak.';
      return;
    }

    els.autoSyncTitle.textContent = 'Otomatik senkronizasyon açık';
    els.autoSyncDetail.textContent = last ? `Son gönderim: ${formatStamp(last)}.` : 'Kayıt ve ayar değişiklikleri otomatik gönderilir.';
  }

  function renderPlan() {
    if (!els.planStatusBadge) return;
    const data = readData();
    const s = data.settings;
    const weekday = WEEKDAYS[int(s.weekday, 0, 6, 6)] || 'Pazar';
    const hour = String(int(s.hour, 0, 23, 12)).padStart(2, '0');
    const minute = String(int(s.minute, 0, 59, 0)).padStart(2, '0');
    const lookahead = int(s.lookahead_days, 1, 60, 7);
    const lookback = int(s.lookback_days, 0, 60, 2);
    const dailyHour = String(int(s.daily_hour, 0, 23, 22)).padStart(2, '0');
    const dailyMinute = String(int(s.daily_minute, 0, 59, 0)).padStart(2, '0');

    els.planScheduleLabel.textContent = `${weekday} • ${hour}:${minute}`;
    els.planLookaheadLabel.textContent = `${lookback} geri • ${lookahead} ileri`;
    if (els.planDailyLabel) els.planDailyLabel.textContent = `${dailyHour}:${dailyMinute}`;
    const pendingLocal = data.records.filter((record) => !record.paid).length;
    els.planRecordCountLabel.textContent = `${pendingLocal} bekliyor`;
    els.planStatusBadge.classList.remove('checking', 'active', 'warning');

    if (!navigator.onLine) {
      els.planStatusBadge.classList.add('warning');
      els.planStatusBadge.textContent = 'Çevrimdışı';
      els.planServerLabel.textContent = 'Yerel kayıt';
      return;
    }

    if (!serverStatus) {
      els.planStatusBadge.classList.add('checking');
      els.planStatusBadge.textContent = 'Kontrol ediliyor';
      els.planServerLabel.textContent = 'Kontrol ediliyor';
      return;
    }

    if (Number(serverStatus.backend_version || 0) < 2.3) {
      els.planStatusBadge.classList.add('warning');
      els.planStatusBadge.textContent = 'Sunucu bekleniyor';
      els.planServerLabel.textContent = 'v2.3 gerekli';
      return;
    }

    if (serverStatus.found && serverStatus.enabled === false) {
      els.planStatusBadge.classList.add('warning');
      els.planStatusBadge.textContent = 'Ayarlanmadı';
      els.planServerLabel.textContent = 'Pasif';
      els.planRecordCountLabel.textContent = `${Number(serverStatus.unpaid_count) || 0} bekliyor`;
    } else if (serverStatus.found && scheduleMatches(serverStatus, data)) {
      els.planStatusBadge.classList.add('active');
      els.planStatusBadge.textContent = 'Aktif';
      els.planServerLabel.textContent = 'Kaydedildi';
      els.planRecordCountLabel.textContent = `${Number(serverStatus.unpaid_count) || 0} bekliyor`;
    } else if (serverStatus.found) {
      els.planStatusBadge.classList.add('warning');
      els.planStatusBadge.textContent = 'Güncelleniyor';
      els.planServerLabel.textContent = 'Ayarlar farklı';
      els.planRecordCountLabel.textContent = `${Number(serverStatus.unpaid_count) || 0} bekliyor`;
    } else {
      els.planStatusBadge.classList.add('warning');
      els.planStatusBadge.textContent = 'Ayarlanmadı';
      els.planServerLabel.textContent = 'Henüz kayıt yok';
    }
  }

  function renderTelegram() {
    if (!els.telegramStatusCard) return;
    els.telegramStatusCard.classList.remove('checking', 'linked', 'unlinked', 'error');

    if (!navigator.onLine) {
      els.telegramStatusCard.classList.add('error');
      els.telegramStatusTitle.textContent = 'Telegram durumu alınamadı';
      els.telegramStatusDetail.textContent = 'İnternet bağlantısı yok.';
      els.pairingControls.classList.remove('hidden');
      return;
    }

    if (!serverStatus) {
      els.telegramStatusCard.classList.add('checking');
      els.telegramStatusTitle.textContent = 'Bağlantı kontrol ediliyor…';
      els.telegramStatusDetail.textContent = 'Sunucudan güncel durum alınıyor.';
      els.pairingControls.classList.remove('hidden');
      return;
    }

    if (serverStatus.found && serverStatus.telegram_linked) {
      els.telegramStatusCard.classList.add('linked');
      els.telegramStatusTitle.textContent = 'Telegram bağlı';
      els.telegramStatusDetail.textContent = 'Bu cihaz bildirim almaya hazır.';
      els.pairingControls.classList.add('hidden');
    } else {
      els.telegramStatusCard.classList.add('unlinked');
      els.telegramStatusTitle.textContent = 'Telegram bağlı değil';
      els.telegramStatusDetail.textContent = 'Bildirim almak için bu telefonu Telegram botuna bağla.';
      els.pairingControls.classList.remove('hidden');
    }
  }

  function renderSaved() {
    const ui = readUi();
    const data = readData();
    const stamp = Number(ui.last_settings_saved_at || 0);
    if (serverStatus && serverStatus.found && scheduleMatches(serverStatus, data)) {
      const suffix = stamp ? ` • Son kayıt: ${formatStamp(stamp)}` : '';
      setSaveState('saved', '✓ Ayarlar sunucuda aktif', `Bildirim planı doğrulandı${suffix}.`);
    } else if (serverStatus && serverStatus.found && serverStatus.enabled === false) {
      setSaveState('', 'Bildirim planı ayarlanmadı', 'Gün, saat ve tarama aralığını seçip Kaydet’e bas.');
    } else if (stamp) {
      setSaveState('', 'Ayarlar cihazda kayıtlı', `Son kayıt: ${formatStamp(stamp)}.`);
    }
  }

  function renderAll() {
    renderPlan();
    renderTelegram();
    renderSaved();
    renderAutoSync();
  }

  function fetchStatus() {
    if (statusPromise) return statusPromise;
    const data = readData();
    if (!data.installation_id) return Promise.reject(new Error('Cihaz kimliği bulunamadı.'));

    statusPromise = new Promise((resolve, reject) => {
      const callback = `__furkinans_status_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement('script');
      let done = false;
      const cleanup = () => {
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
      };
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('Durum isteği zaman aşımına uğradı.'));
      }, 8000);

      window[callback] = (payload) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        resolve(payload);
      };
      script.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        reject(new Error('Sunucu durumu alınamadı.'));
      };
      const params = new URLSearchParams({
        action: 'status',
        installation_id: data.installation_id,
        prefix: callback,
        _: String(Date.now())
      });
      script.src = `${SERVER_URL}?${params.toString()}`;
      script.async = true;
      document.head.appendChild(script);
    }).finally(() => { statusPromise = null; });

    return statusPromise;
  }

  async function refreshStatus({ quiet = false } = {}) {
    if (!navigator.onLine) {
      serverStatus = null;
      renderAll();
      return null;
    }
    if (!quiet) {
      serverStatus = null;
      renderAll();
    }
    try {
      const result = await fetchStatus();
      serverStatus = result && result.ok ? result : { ok: false, found: false };
      const backendVersion = Number(serverStatus && serverStatus.backend_version || 0);
      renderAll();
      if (backendVersion >= 2.3) {
        window.dispatchEvent(new CustomEvent('furkinans:backend-ready'));
      } else {
        renderAutoSync('waiting');
      }
      return serverStatus;
    } catch (err) {
      serverStatus = null;
      renderPlan();
      els.telegramStatusCard.classList.remove('checking', 'linked', 'unlinked');
      els.telegramStatusCard.classList.add('error');
      els.telegramStatusTitle.textContent = 'Durum kontrolü başarısız';
      els.telegramStatusDetail.textContent = 'Sunucu v2.3 güncellemesi gerekli olabilir.';
      els.pairingControls.classList.remove('hidden');
      return null;
    }
  }

  if (els.saveSettingsButton) {
    els.saveSettingsButton.addEventListener('click', () => {
      const ui = readUi();
      ui.last_settings_saved_at = Date.now();
      writeUi(ui);
      setSaveState('saving', 'Kaydediliyor…', 'Cihaza kaydedildi. Sunucu doğrulanıyor.');
      setTimeout(async () => {
        const status = await refreshStatus({ quiet: true });
        const data = readData();
        if (status && status.found && scheduleMatches(status, data)) {
          setSaveState('saved', '✓ Bildirim ayarları kaydedildi', 'Plan sunucuda aktif ve doğrulandı.');
        } else {
          setSaveState('saving', 'Ayarlar kaydedildi', 'Sunucuya gönderildi; durum henüz doğrulanamadı.');
        }
      }, 1000);
    });
  }

  if (els.tabSettings) {
    els.tabSettings.addEventListener('click', () => refreshStatus());
  }

  window.addEventListener('furkinans:sync', (event) => {
    const detail = event && event.detail ? event.detail : {};
    renderAutoSync(detail.state || '');
    if (detail.state === 'synced') setTimeout(() => refreshStatus({ quiet: true }), 700);
  });
  window.addEventListener('focus', () => { if (navigator.onLine) refreshStatus({ quiet: true }); });
  window.addEventListener('online', () => setTimeout(() => refreshStatus(), 700));
  window.addEventListener('offline', () => { serverStatus = null; renderAll(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) refreshStatus({ quiet: true });
  });

  renderAll();
  setTimeout(() => refreshStatus(), 900);
})();
