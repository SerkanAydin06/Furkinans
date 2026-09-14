(() => {
  'use strict';

  const SERVER_URL = 'https://script.google.com/macros/s/AKfycbxFU_W3cG09demXHXANalKYOyxp7Xte_0XONRyhJZ-30QB26LCvqXw6ygYWnCBEuxiK/exec';
  const STORAGE_KEY = 'furkinans_pwa_v1';

  const $ = (id) => document.getElementById(id);
  let data = loadData();
  let editingId = null;

  const els = {
    tabRecords: $('tabRecords'), tabSettings: $('tabSettings'), recordsView: $('recordsView'), settingsView: $('settingsView'),
    recordCount: $('recordCount'), recordsList: $('recordsList'), emptyState: $('emptyState'), syncBadge: $('syncBadge'),
    addRecordButton: $('addRecordButton'), editorOverlay: $('editorOverlay'), editorTitle: $('editorTitle'), closeEditorButton: $('closeEditorButton'),
    accountInput: $('accountInput'), dateTypeInput: $('dateTypeInput'), dateInput: $('dateInput'), descriptionInput: $('descriptionInput'),
    editorError: $('editorError'), deleteRecordButton: $('deleteRecordButton'), saveRecordButton: $('saveRecordButton'),
    weekdayInput: $('weekdayInput'), hourInput: $('hourInput'), minuteInput: $('minuteInput'), lookaheadInput: $('lookaheadInput'),
    saveSettingsButton: $('saveSettingsButton'), apiKeyInput: $('apiKeyInput'), testTelegramButton: $('testTelegramButton'), syncButton: $('syncButton'),
    installationIdLabel: $('installationIdLabel'), telegramResult: $('telegramResult')
  };

  function defaultData() {
    return {
      version: 1,
      installation_id: makeInstallationId(),
      records: [],
      settings: { weekday: 6, hour: 12, minute: 0, lookahead_days: 7, api_key: '' }
    };
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultData();
      parsed.installation_id ||= makeInstallationId();
      parsed.records = Array.isArray(parsed.records) ? parsed.records : [];
      parsed.settings = Object.assign({ weekday: 6, hour: 12, minute: 0, lookahead_days: 7, api_key: '' }, parsed.settings || {});
      return parsed;
    } catch (_) {
      return defaultData();
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function makeInstallationId() {
    if (crypto && typeof crypto.randomUUID === 'function') return `furk_web_${crypto.randomUUID()}`;
    return `furk_web_${Date.now()}_${Math.floor(Math.random() * 900000 + 100000)}`;
  }

  function makeRecordId() {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
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

      row.append(account, date, description);
      els.recordsList.appendChild(row);
    });
  }

  function loadSettingsUi() {
    const s = data.settings;
    els.weekdayInput.value = String(clampInt(s.weekday, 0, 6, 6));
    els.hourInput.value = String(clampInt(s.hour, 0, 23, 12));
    els.minuteInput.value = String(clampInt(s.minute, 0, 59, 0));
    els.lookaheadInput.value = String(clampInt(s.lookahead_days, 1, 60, 7));
    els.apiKeyInput.value = String(s.api_key || '');
    els.installationIdLabel.textContent = data.installation_id;
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
      els.deleteRecordButton.classList.remove('hidden');
    } else {
      els.editorTitle.textContent = 'Yeni Kayıt';
      els.accountInput.value = '';
      els.dateTypeInput.value = 'due';
      els.dateInput.value = todayIso();
      els.descriptionInput.value = '';
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

    const record = {
      id: editingId || makeRecordId(),
      account_name: account,
      date_type: els.dateTypeInput.value === 'statement' ? 'statement' : 'due',
      date,
      description: els.descriptionInput.value.trim()
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
    data.settings.api_key = els.apiKeyInput.value.trim();
    saveData();
    loadSettingsUi();
    showResult('Ayarlar bu cihazda kaydedildi.', true);
    syncAll({ quiet: true });
  }

  function payload(action) {
    const base = {
      action,
      api_key: String(data.settings.api_key || '').trim(),
      installation_id: data.installation_id
    };
    if (action === 'sync') {
      base.settings = {
        weekday: clampInt(data.settings.weekday, 0, 6, 6),
        hour: clampInt(data.settings.hour, 0, 23, 12),
        minute: clampInt(data.settings.minute, 0, 59, 0),
        lookahead_days: clampInt(data.settings.lookahead_days, 1, 60, 7)
      };
      base.records = data.records;
    }
    return base;
  }

  async function postOpaque(action) {
    if (!String(data.settings.api_key || '').trim()) throw new Error('Önce API anahtarını girip ayarları kaydet.');
    await fetch(SERVER_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload(action)),
      cache: 'no-store'
    });
  }

  async function testTelegram() {
    try {
      data.settings.api_key = els.apiKeyInput.value.trim();
      saveData();
      showResult('Test isteği gönderiliyor…');
      await postOpaque('test');
      showResult('Test isteği gönderildi. Telegram’da Furkinans mesajını kontrol et.', true);
      updateSyncBadge('Gönderildi');
    } catch (err) {
      showResult(err.message || 'Test isteği gönderilemedi.', false);
      updateSyncBadge('Hata');
    }
  }

  async function syncAll({ quiet = false } = {}) {
    try {
      data.settings.api_key = els.apiKeyInput.value.trim();
      saveData();
      if (!quiet) showResult('Kayıtlar sunucuya gönderiliyor…');
      updateSyncBadge('Senkron…');
      await postOpaque('sync');
      if (!quiet) showResult('Senkronizasyon isteği gönderildi.', true);
      updateSyncBadge('Senkron');
      localStorage.setItem(`${STORAGE_KEY}_last_sync`, String(Date.now()));
    } catch (err) {
      if (!quiet) showResult(err.message || 'Senkronizasyon başarısız.', false);
      updateSyncBadge(navigator.onLine ? 'Yerel' : 'Çevrimdışı');
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
    if (!navigator.onLine) {
      els.syncBadge.textContent = 'Çevrimdışı';
    } else if (String(data.settings.api_key || '').trim()) {
      els.syncBadge.textContent = 'Telegram hazır';
    } else {
      els.syncBadge.textContent = 'Yerel';
    }
  }

  els.tabRecords.addEventListener('click', () => showView('records'));
  els.tabSettings.addEventListener('click', () => showView('settings'));
  els.addRecordButton.addEventListener('click', () => openEditor());
  els.closeEditorButton.addEventListener('click', closeEditor);
  els.editorOverlay.addEventListener('click', (e) => { if (e.target === els.editorOverlay) closeEditor(); });
  els.saveRecordButton.addEventListener('click', saveRecord);
  els.deleteRecordButton.addEventListener('click', deleteRecord);
  els.saveSettingsButton.addEventListener('click', saveSettings);
  els.testTelegramButton.addEventListener('click', testTelegram);
  els.syncButton.addEventListener('click', () => syncAll());
  window.addEventListener('online', () => { updateSyncBadge(); syncAll({ quiet: true }); });
  window.addEventListener('offline', () => updateSyncBadge());

  renderRecords();
  loadSettingsUi();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }
})();
