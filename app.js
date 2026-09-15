(() => {
  'use strict';

  const SERVER_URL = 'https://script.google.com/macros/s/AKfycbx2mm0fCPOjyUz3zGad2ltU3sQSe_6-hLWr7vJPT6OIJQu1vGZydgYadawNpen9_2vY/exec';
  const TELEGRAM_BOT_USERNAME = 'Furkinans_bot';
  const STORAGE_KEY = 'furkinans_pwa_v1'; // Keep v1 key so existing phone data survives the upgrade.
  const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const $ = (id) => document.getElementById(id);
  let data = loadData();
  let editingId = null;
  let backendReady = false;

  const els = {
    tabRecords: $('tabRecords'), tabSettings: $('tabSettings'), recordsView: $('recordsView'), settingsView: $('settingsView'),
    recordCount: $('recordCount'), recordsList: $('recordsList'), emptyState: $('emptyState'), syncBadge: $('syncBadge'),
    addRecordButton: $('addRecordButton'), editorOverlay: $('editorOverlay'), editorTitle: $('editorTitle'), closeEditorButton: $('closeEditorButton'),
    accountInput: $('accountInput'), dateTypeInput: $('dateTypeInput'), dateInput: $('dateInput'), descriptionInput: $('descriptionInput'), paidInput: $('paidInput'),
    editorError: $('editorError'), deleteRecordButton: $('deleteRecordButton'), saveRecordButton: $('saveRecordButton'),
    weekdayInput: $('weekdayInput'), hourInput: $('hourInput'), minuteInput: $('minuteInput'), lookaheadInput: $('lookaheadInput'), lookbackInput: $('lookbackInput'),
    dailyHourInput: $('dailyHourInput'), dailyMinuteInput: $('dailyMinuteInput'),
    saveSettingsButton: $('saveSettingsButton'), testTelegramButton: $('testTelegramButton'),
    installationIdLabel: $('installationIdLabel'), pairCodeLabel: $('pairCodeLabel'), pairTelegramButton: $('pairTelegramButton'),
    refreshPairCodeButton: $('refreshPairCodeButton'), telegramResult: $('telegramResult')
  };

  function defaultData() {
    return {
      version: 2,
      installation_id: makeInstallationId(),
      device_secret: makeDeviceSecret(),
      pair_code: makePairCode(),
      records: [],
      settings: { weekday: 6, hour: 12, minute: 0, lookahead_days: 7, lookback_days: 2, daily_hour: 22, daily_minute: 0 }
    };
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const fresh = defaultData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        return fresh;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultData();

      parsed.version = 2;
      parsed.installation_id ||= makeInstallationId();
      parsed.device_secret ||= makeDeviceSecret();
      parsed.pair_code = validPairCode(parsed.pair_code) ? String(parsed.pair_code).toUpperCase() : makePairCode();
      parsed.records = Array.isArray(parsed.records) ? parsed.records.map((record) => Object.assign({}, record, { paid: record && (record.paid === true || String(record.paid).toLowerCase() === 'true'), paid_at: record && record.paid_at ? String(record.paid_at) : '' })) : [];
      parsed.settings = Object.assign({ weekday: 6, hour: 12, minute: 0, lookahead_days: 7, lookback_days: 2, daily_hour: 22, daily_minute: 0 }, parsed.settings || {});
      delete parsed.settings.api_key;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    } catch (_) {
      return defaultData();
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function makeInstallationId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return `furk_web_${window.crypto.randomUUID()}`;
    return `furk_web_${Date.now()}_${Math.floor(Math.random() * 900000 + 100000)}`;
  }

  function makeDeviceSecret() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${window.crypto.randomUUID()}${window.crypto.randomUUID()}`.replace(/-/g, '');
    }
    return `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  }

  function makePairCode() {
    const bytes = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => PAIR_ALPHABET[b % PAIR_ALPHABET.length]).join('');
    }
    let out = '';
    for (let i = 0; i < 8; i++) out += PAIR_ALPHABET[Math.floor(Math.random() * PAIR_ALPHABET.length)];
    return out;
  }

  function validPairCode(value) {
    return /^[A-Z2-9]{8}$/.test(String(value || '').toUpperCase());
  }

  function makeRecordId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `${Date.now()}_${Math.floor(Math.random() * 900000 + 100000)}`;
  }

  function formatDateTr(iso) {
    const [y, m, d] = String(iso).split('-');
    if (!y || !m || !d) return iso || '';
    return `${d}.${m}.${y}`;
  }

  function sortRecords(records) {
    return [...records].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.account_name).localeCompare(String(b.account_name), 'tr'));
  }

  function renderRecords() {
    els.recordsList.replaceChildren();
    const records = sortRecords(data.records);
    els.recordCount.textContent = String(records.length);
    els.emptyState.classList.toggle('hidden', records.length !== 0);

    records.forEach((record) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'record-row table-grid';
      row.addEventListener('click', () => openEditor(record.id));

      const account = document.createElement('div');
      account.className = 'record-cell record-account';
      account.textContent = record.account_name || '—';

      const date = document.createElement('div');
      date.className = 'record-cell record-date';
      const type = document.createElement('small');
      type.textContent = record.date_type === 'statement' ? 'Hesap kesim' : 'Son ödeme';
      date.append(type, document.createTextNode(formatDateTr(record.date)));

      const description = document.createElement('div');
      description.className = 'record-cell record-description';
      description.textContent = record.description || '—';

      const status = document.createElement('div');
      status.className = 'record-cell record-payment';
      const pill = document.createElement('span');
      pill.className = `payment-pill ${record.paid ? 'paid' : 'pending'}`;
      pill.textContent = record.paid ? 'Ödendi' : 'Bekliyor';
      status.appendChild(pill);

      row.classList.toggle('is-paid', Boolean(record.paid));
      row.append(account, date, description, status);
      els.recordsList.appendChild(row);
    });
  }

  function loadSettingsUi() {
    const s = data.settings;
    els.weekdayInput.value = String(clampInt(s.weekday, 0, 6, 6));
    els.hourInput.value = String(clampInt(s.hour, 0, 23, 12));
    els.minuteInput.value = String(clampInt(s.minute, 0, 59, 0));
    els.lookaheadInput.value = String(clampInt(s.lookahead_days, 1, 60, 7));
    els.lookbackInput.value = String(clampInt(s.lookback_days, 0, 60, 2));
    els.dailyHourInput.value = String(clampInt(s.daily_hour, 0, 23, 22));
    els.dailyMinuteInput.value = String(clampInt(s.daily_minute, 0, 59, 0));
    els.installationIdLabel.textContent = data.installation_id;
    els.pairCodeLabel.textContent = data.pair_code;
    updateSyncBadge();
  }

  function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  function showView(name) {
    const records = name === 'records';
    els.recordsView.classList.toggle('active', records);
    els.settingsView.classList.toggle('active', !records);
    els.tabRecords.classList.toggle('active', records);
    els.tabSettings.classList.toggle('active', !records);
    els.addRecordButton.classList.toggle('hidden', !records);
  }

  function openEditor(recordId = null) {
    editingId = recordId;
    els.editorError.textContent = '';
    if (recordId) {
      const record = data.records.find((x) => x.id === recordId);
      if (!record) return;
      els.editorTitle.textContent = 'Kaydı Düzenle';
      els.accountInput.value = record.account_name || '';
      els.dateTypeInput.value = record.date_type || 'due';
      els.dateInput.value = record.date || '';
      els.descriptionInput.value = record.description || '';
      els.paidInput.checked = Boolean(record.paid);
      els.deleteRecordButton.classList.remove('hidden');
    } else {
      els.editorTitle.textContent = 'Yeni Kayıt';
      els.accountInput.value = '';
      els.dateTypeInput.value = 'due';
      els.dateInput.value = todayIso();
      els.descriptionInput.value = '';
      els.paidInput.checked = false;
      els.deleteRecordButton.classList.add('hidden');
    }
    els.editorOverlay.classList.remove('hidden');
    setTimeout(() => els.accountInput.focus(), 80);
  }

  function closeEditor() {
    editingId = null;
    els.editorOverlay.classList.add('hidden');
  }

  function todayIso() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function saveRecord() {
    const account = els.accountInput.value.trim();
    const date = els.dateInput.value;
    if (!account) {
      els.editorError.textContent = 'Hesap / ödeme adı gerekli.';
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      els.editorError.textContent = 'Geçerli bir tarih seç.';
      return;
    }

    const previous = editingId ? data.records.find((x) => x.id === editingId) : null;
    const paid = Boolean(els.paidInput.checked);
    const record = {
      id: editingId || makeRecordId(),
      account_name: account,
      date_type: els.dateTypeInput.value === 'statement' ? 'statement' : 'due',
      date,
      description: els.descriptionInput.value.trim(),
      paid,
      paid_at: paid ? (previous && previous.paid && previous.paid_at ? previous.paid_at : new Date().toISOString()) : ''
    };

    if (editingId) {
      const index = data.records.findIndex((x) => x.id === editingId);
      if (index >= 0) data.records[index] = record;
    } else {
      data.records.push(record);
    }

    saveData();
    renderRecords();
    closeEditor();
    syncAll({ quiet: true });
  }

  function deleteRecord() {
    if (!editingId) return;
    if (!confirm('Bu kaydı silmek istiyor musun?')) return;
    data.records = data.records.filter((x) => x.id !== editingId);
    saveData();
    renderRecords();
    closeEditor();
    syncAll({ quiet: true });
  }

  function saveSettings() {
    data.settings.weekday = clampInt(els.weekdayInput.value, 0, 6, 6);
    data.settings.hour = clampInt(els.hourInput.value, 0, 23, 12);
    data.settings.minute = clampInt(els.minuteInput.value, 0, 59, 0);
    data.settings.lookahead_days = clampInt(els.lookaheadInput.value, 1, 60, 7);
    data.settings.lookback_days = clampInt(els.lookbackInput.value, 0, 60, 2);
    data.settings.daily_hour = clampInt(els.dailyHourInput.value, 0, 23, 22);
    data.settings.daily_minute = clampInt(els.dailyMinuteInput.value, 0, 59, 0);
    saveData();
    loadSettingsUi();
    showResult('Bildirim ayarları kaydediliyor ve etkinleştiriliyor…', true);
    syncAll({ quiet: true, activatePlan: true });
  }

  function payload(action, { activatePlan = false } = {}) {
    const base = {
      action,
      installation_id: data.installation_id,
      device_secret: data.device_secret,
      pair_code: data.pair_code
    };
    if (action === 'sync') {
      if (activatePlan) base.activate_plan = true;
      base.settings = {
        weekday: clampInt(data.settings.weekday, 0, 6, 6),
        hour: clampInt(data.settings.hour, 0, 23, 12),
        minute: clampInt(data.settings.minute, 0, 59, 0),
        lookahead_days: clampInt(data.settings.lookahead_days, 1, 60, 7),
        lookback_days: clampInt(data.settings.lookback_days, 0, 60, 2),
        daily_hour: clampInt(data.settings.daily_hour, 0, 23, 22),
        daily_minute: clampInt(data.settings.daily_minute, 0, 59, 0)
      };
      base.records = data.records;
    }
    return base;
  }

  async function postOpaque(action, { keepalive = false, activatePlan = false } = {}) {
    if (!backendReady) throw new Error('Furkinans sunucusu v2.3 henüz hazır değil.');
    await fetch(SERVER_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload(action, { activatePlan })),
      cache: 'no-store',
      keepalive
    });
  }

  function pairTelegram() {
    try {
      if (!backendReady) {
        showResult('Sunucu v2.3 hazırlanıyor. Telegram bağlantısı sunucu hazır olunca açılacak.', false);
        return;
      }
      if (!validPairCode(data.pair_code)) data.pair_code = makePairCode();
      saveData();
      loadSettingsUi();

      // Start the request while we still have the user gesture. keepalive helps
      // it finish after iOS switches into Telegram.
      postOpaque('sync', { keepalive: true }).catch(() => {});
      showResult('Telegram açılıyor. Açılan sohbette Başlat / Start düğmesine bas.', true);

      const url = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(data.pair_code)}`;
      window.location.href = url;
    } catch (err) {
      showResult(err.message || 'Telegram bağlantısı başlatılamadı.', false);
    }
  }

  function refreshPairCode() {
    data.pair_code = makePairCode();
    saveData();
    loadSettingsUi();
    showResult('Yeni bağlantı kodu oluşturuldu. Telegram’da Bağla düğmesine bas.', true);
    syncAll({ quiet: true });
  }

  async function testTelegram() {
    try {
      showResult('Test isteği gönderiliyor…');
      await postOpaque('test');
      showResult('Test gönderildi. Telefon Telegram’a bağlıysa yaklaşık birkaç saniye içinde mesaj gelir.', true);
      updateSyncBadge('Test gönderildi');
    } catch (err) {
      showResult(err.message || 'Test isteği gönderilemedi.', false);
      updateSyncBadge('Hata');
    }
  }

  let syncInFlight = null;

  async function syncAll({ quiet = false, activatePlan = false } = {}) {
    if (!backendReady) {
      updateSyncBadge('Sunucu bekleniyor');
      window.dispatchEvent(new CustomEvent('furkinans:sync', { detail: { state: 'waiting' } }));
      return;
    }
    if (!navigator.onLine) {
      updateSyncBadge('Çevrimdışı');
      window.dispatchEvent(new CustomEvent('furkinans:sync', { detail: { state: 'offline' } }));
      return;
    }

    if (syncInFlight && !activatePlan) return syncInFlight;

    const run = (async () => {
      try {
        if (!quiet) showResult('Değişiklikler otomatik olarak sunucuya gönderiliyor…');
        updateSyncBadge('Senkron…');
        window.dispatchEvent(new CustomEvent('furkinans:sync', { detail: { state: 'syncing' } }));
        await postOpaque('sync', { activatePlan });
        const now = Date.now();
        localStorage.setItem(`${STORAGE_KEY}_last_sync`, String(now));
        if (!quiet) showResult('Değişiklikler sunucuya gönderildi.', true);
        updateSyncBadge('Güncel');
        window.dispatchEvent(new CustomEvent('furkinans:sync', { detail: { state: 'synced', at: now } }));
      } catch (err) {
        if (!quiet) showResult(err.message || 'Otomatik senkronizasyon başarısız.', false);
        updateSyncBadge(navigator.onLine ? 'Tekrar denenecek' : 'Çevrimdışı');
        window.dispatchEvent(new CustomEvent('furkinans:sync', { detail: { state: 'error', message: String(err && err.message || err) } }));
      }
    })();

    if (!activatePlan) syncInFlight = run;
    try {
      return await run;
    } finally {
      if (syncInFlight === run) syncInFlight = null;
    }
  }

  function showResult(message, success = null) {
    els.telegramResult.textContent = message;
    els.telegramResult.classList.remove('success', 'error');
    if (success === true) els.telegramResult.classList.add('success');
    if (success === false) els.telegramResult.classList.add('error');
  }

  function updateSyncBadge(force = '') {
    if (force) {
      els.syncBadge.textContent = force;
      return;
    }
    els.syncBadge.textContent = navigator.onLine ? 'Sunucu hazır' : 'Çevrimdışı';
  }

  els.tabRecords.addEventListener('click', () => showView('records'));
  els.tabSettings.addEventListener('click', () => showView('settings'));
  els.addRecordButton.addEventListener('click', () => openEditor());
  els.closeEditorButton.addEventListener('click', closeEditor);
  els.editorOverlay.addEventListener('click', (e) => { if (e.target === els.editorOverlay) closeEditor(); });
  els.saveRecordButton.addEventListener('click', saveRecord);
  els.deleteRecordButton.addEventListener('click', deleteRecord);
  els.saveSettingsButton.addEventListener('click', saveSettings);
  els.pairTelegramButton.addEventListener('click', pairTelegram);
  els.refreshPairCodeButton.addEventListener('click', refreshPairCode);
  els.testTelegramButton.addEventListener('click', testTelegram);
  window.addEventListener('furkinans:backend-ready', () => {
    if (backendReady) return;
    backendReady = true;
    updateSyncBadge();
    syncAll({ quiet: true });
  });
  window.addEventListener('online', () => { updateSyncBadge(); syncAll({ quiet: true }); });
  window.addEventListener('offline', () => {
    updateSyncBadge();
    window.dispatchEvent(new CustomEvent('furkinans:sync', { detail: { state: 'offline' } }));
  });
  window.addEventListener('focus', () => { if (navigator.onLine) syncAll({ quiet: true }); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) syncAll({ quiet: true });
  });

  renderRecords();
  loadSettingsUi();
  saveData();

  // status.js verifies backend v2.3 first, then emits furkinans:backend-ready.

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }
})();
