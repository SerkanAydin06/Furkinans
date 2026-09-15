(() => {
  const APP_VERSION = '1.0';
  const STORAGE_KEY = 'furkinans_v1_0';
  const LEGACY_STORAGE_KEY = 'furkinans_pwa_v1';
  const SYNC_DEBOUNCE_MS = 1200;
  const SWIPE_OPEN_PX = 104;
  const DEFAULT_SETTINGS = {
    weekday: 6,
    hour: 12,
    minute: 0,
    lookahead_days: 7,
    lookback_days: 2,
    daily_hour: 22,
    daily_minute: 0,
    enabled: false,
    backend_url: '',
    bot_username: '',
    pair_code: ''
  };

  const state = loadState();
  let currentView = 'records';
  let editingId = null;
  let deleteCandidateId = null;
  let syncTimer = null;
  let syncInFlight = false;
  let lastSyncTime = 0;
  let toastTimer = null;

  const els = {
    tabRecords: byId('tab-records'),
    tabSettings: byId('tab-settings'),
    tabConnections: byId('tab-connections'),
    viewRecords: byId('view-records'),
    viewSettings: byId('view-settings'),
    viewConnections: byId('view-connections'),
    addRecord: byId('add-record'),
    recordsList: byId('records-list'),
    emptyState: byId('empty-state'),
    statTotal: byId('stat-total'),
    statPending: byId('stat-pending'),
    statPaid: byId('stat-paid'),
    statOverdue: byId('stat-overdue'),
    syncBadge: byId('sync-badge'),

    saveSettings: byId('save-settings'),
    settingsFeedback: byId('settings-feedback'),
    settingWeekday: byId('setting-weekday'),
    settingHour: byId('setting-hour'),
    settingMinute: byId('setting-minute'),
    settingLookahead: byId('setting-lookahead'),
    settingLookback: byId('setting-lookback'),
    settingDailyHour: byId('setting-daily-hour'),
    settingDailyMinute: byId('setting-daily-minute'),
    settingEnabled: byId('setting-enabled'),

    saveConnection: byId('save-connection'),
    backendUrl: byId('backend-url'),
    backendStatusTitle: byId('backend-status-title'),
    backendStatusDetail: byId('backend-status-detail'),
    backendStatusCard: byId('backend-status-card'),
    telegramStatusTitle: byId('telegram-status-title'),
    telegramStatusDetail: byId('telegram-status-detail'),
    telegramStatusCard: byId('telegram-status-card'),
    pairCode: byId('pair-code'),
    pairTelegram: byId('pair-telegram'),
    refreshCode: byId('refresh-code'),
    testTelegram: byId('test-telegram'),
    installationId: byId('installation-id'),
    connectionFeedback: byId('connection-feedback'),

    editorModal: byId('editor-modal'),
    editorTitle: byId('editor-title'),
    closeEditor: byId('close-editor'),
    recordName: byId('record-name'),
    recordDateType: byId('record-date-type'),
    recordDate: byId('record-date'),
    recordDescription: byId('record-description'),
    recordPaid: byId('record-paid'),
    saveRecord: byId('save-record'),
    deleteRecord: byId('delete-record'),
    editorError: byId('editor-error'),

    confirmModal: byId('confirm-modal'),
    confirmCancel: byId('confirm-cancel'),
    confirmDelete: byId('confirm-delete'),
    toast: byId('toast')
  };

  initialize();

  function initialize() {
    bindEvents();
    fillSettingsForm();
    els.installationId.textContent = state.installation_id;
    renderAll();
    updatePairCode();
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
    }
    if (state.settings.backend_url) {
      checkServerConfig();
      checkPublicStatus();
      queueSync(true);
    } else {
      setSyncBadge('Yerel');
    }
  }

  function bindEvents() {
    els.tabRecords.addEventListener('click', () => showView('records'));
    els.tabSettings.addEventListener('click', () => showView('settings'));
    els.tabConnections.addEventListener('click', () => showView('connections'));
    els.addRecord.addEventListener('click', () => openEditor());
    els.closeEditor.addEventListener('click', closeEditor);
    els.editorModal.addEventListener('click', (e) => { if (e.target === els.editorModal) closeEditor(); });
    els.saveRecord.addEventListener('click', saveRecord);
    els.deleteRecord.addEventListener('click', () => {
      if (editingId) {
        deleteCandidateId = editingId;
        openConfirm();
      }
    });
    els.confirmCancel.addEventListener('click', closeConfirm);
    els.confirmModal.addEventListener('click', (e) => { if (e.target === els.confirmModal) closeConfirm(); });
    els.confirmDelete.addEventListener('click', deleteRecordConfirmed);
    els.saveSettings.addEventListener('click', saveSettings);
    els.saveConnection.addEventListener('click', saveConnectionSettings);
    els.refreshCode.addEventListener('click', refreshPairCode);
    els.pairTelegram.addEventListener('click', pairTelegram);
    els.testTelegram.addEventListener('click', sendTestTelegram);
    window.addEventListener('online', () => {
      toast('Bağlantı geri geldi, senkronizasyon deneniyor.');
      queueSync(true);
      checkPublicStatus();
    });
    window.addEventListener('focus', () => {
      if (state.settings.backend_url) checkPublicStatus();
    });
  }

  function renderAll() {
    renderStats();
    renderRecords();
    renderConnectionUi();
  }

  function showView(name) {
    currentView = name;
    const map = {
      records: [els.tabRecords, els.viewRecords],
      settings: [els.tabSettings, els.viewSettings],
      connections: [els.tabConnections, els.viewConnections]
    };
    Object.entries(map).forEach(([key, [tab, view]]) => {
      const active = key === name;
      tab.classList.toggle('active', active);
      view.classList.toggle('active', active);
    });
  }

  function renderStats() {
    const stats = computeStats();
    els.statTotal.textContent = String(stats.total);
    els.statPending.textContent = String(stats.pending);
    els.statPaid.textContent = String(stats.paid);
    els.statOverdue.textContent = String(stats.overdue);
  }

  function renderRecords() {
    const records = sortedRecords();
    els.recordsList.innerHTML = '';
    els.emptyState.classList.toggle('hidden', records.length > 0);
    if (!records.length) return;

    records.forEach((record) => {
      const card = document.createElement('article');
      card.className = `record-card tone-${recordTone(record)}`;
      card.dataset.id = record.id;

      const deleteZone = document.createElement('div');
      deleteZone.className = 'record-delete-zone';
      const deleteButton = document.createElement('button');
      deleteButton.className = 'record-delete-button';
      deleteButton.type = 'button';
      deleteButton.textContent = 'Sil';
      deleteButton.addEventListener('click', () => {
        deleteCandidateId = record.id;
        openConfirm();
      });
      deleteZone.appendChild(deleteButton);

      const shell = document.createElement('div');
      shell.className = 'record-shell';
      shell.innerHTML = recordCardMarkup(record);
      attachSwipe(card, shell);

      shell.querySelector('.status-chip').addEventListener('click', (e) => {
        e.stopPropagation();
        togglePaid(record.id);
      });

      shell.addEventListener('click', (e) => {
        if (e.target.closest('.status-chip')) return;
        if (card.classList.contains('open')) {
          closeAllSwipeCards();
          return;
        }
        openEditor(record.id);
      });

      card.append(deleteZone, shell);
      els.recordsList.appendChild(card);
    });
  }

  function recordCardMarkup(record) {
    const paid = Boolean(record.paid);
    const overdue = !paid && isOverdue(record.date);
    const chipClass = paid ? 'paid' : overdue ? 'overdue' : 'pending';
    const chipLabel = paid ? 'Ödendi' : overdue ? 'Gecikti' : 'Bekliyor';
    const dateTypeLabel = record.date_type === 'statement' ? 'Hesap Kesim' : 'Son Ödeme';
    const paidNote = paid && record.paid_at ? `<span class="record-paid-note">✓ Ödeme tarihi: ${formatDisplayDate(record.paid_at)}</span>` : '';
    const description = escapeHtml(record.description || 'Açıklama girilmedi');
    return `
      <div class="record-head">
        <div>
          <div class="record-label">HESAP</div>
          <h3 class="record-title">${escapeHtml(record.account_name)}</h3>
        </div>
        <button class="status-chip ${chipClass}" type="button"><span>${chipLabel}</span><span class="arrow">›</span></button>
      </div>
      <div class="record-grid">
        <div class="record-info"><span>Tarih Türü</span><strong>${dateTypeLabel}</strong></div>
        <div class="record-info"><span>Tarih</span><strong>${formatDisplayDate(record.date)}</strong></div>
        <div class="record-info"><span>Açıklama</span><strong>${description}</strong></div>
      </div>
      <div class="record-footer">
        ${paidNote || '<span class="record-hint">Kaydı sola kaydırarak silme onayını açabilirsin.</span>'}
        ${paid ? '<span class="record-hint">Durumu değiştirerek tekrar bekleyen yapabilirsin.</span>' : ''}
      </div>
    `;
  }

  function attachSwipe(card, shell) {
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let pointerId = null;
    let currentX = 0;
    shell.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dragging = true;
      currentX = card.classList.contains('open') ? -SWIPE_OPEN_PX : 0;
      shell.style.transition = 'none';
      card.setPointerCapture?.(pointerId);
    });
    shell.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) return;
      const next = Math.max(-SWIPE_OPEN_PX, Math.min(0, currentX + dx));
      shell.style.transform = `translateX(${next}px)`;
    });
    function finish(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      shell.style.transition = '';
      const matrix = new DOMMatrixReadOnly(getComputedStyle(shell).transform);
      const translateX = matrix.m41;
      card.releasePointerCapture?.(pointerId);
      pointerId = null;
      if (translateX < -56) {
        closeAllSwipeCards(card);
        card.classList.add('open');
      } else {
        card.classList.remove('open');
      }
      shell.style.transform = '';
    }
    shell.addEventListener('pointerup', finish);
    shell.addEventListener('pointercancel', finish);
  }

  function closeAllSwipeCards(skipCard = null) {
    document.querySelectorAll('.record-card.open').forEach((card) => {
      if (card !== skipCard) card.classList.remove('open');
    });
  }

  function openEditor(id = null) {
    editingId = id;
    const isEdit = Boolean(id);
    const record = isEdit ? state.records.find((r) => r.id === id) : null;
    els.editorTitle.textContent = isEdit ? 'Kaydı Düzenle' : 'Yeni Kayıt';
    els.recordName.value = record?.account_name || '';
    els.recordDateType.value = record?.date_type || 'due';
    els.recordDate.value = record?.date || todayIso();
    els.recordDescription.value = record?.description || '';
    els.recordPaid.checked = Boolean(record?.paid);
    els.deleteRecord.classList.toggle('hidden', !isEdit);
    els.editorError.textContent = '';
    els.editorModal.classList.remove('hidden');
    els.editorModal.setAttribute('aria-hidden', 'false');
  }

  function closeEditor() {
    editingId = null;
    els.editorModal.classList.add('hidden');
    els.editorModal.setAttribute('aria-hidden', 'true');
  }

  function saveRecord() {
    const accountName = els.recordName.value.trim();
    const date = els.recordDate.value;
    if (!accountName) return setEditorError('Hesap adı gerekli.');
    if (!date) return setEditorError('Tarih gerekli.');

    const record = editingId ? state.records.find((r) => r.id === editingId) : null;
    const now = new Date().toISOString();
    const payload = {
      id: record?.id || createId('rec'),
      account_name: accountName,
      date_type: els.recordDateType.value,
      date,
      description: els.recordDescription.value.trim(),
      paid: Boolean(els.recordPaid.checked),
      paid_at: els.recordPaid.checked ? (record?.paid ? record.paid_at : todayIso()) : '',
      updated_at: now
    };

    if (record) {
      Object.assign(record, payload);
      toast('Kayıt güncellendi.');
    } else {
      state.records.push(payload);
      toast('Yeni kayıt eklendi.');
    }
    persist();
    renderAll();
    closeEditor();
    queueSync();
  }

  function setEditorError(message) {
    els.editorError.textContent = message;
  }

  function togglePaid(id) {
    const record = state.records.find((r) => r.id === id);
    if (!record) return;
    record.paid = !record.paid;
    record.paid_at = record.paid ? todayIso() : '';
    record.updated_at = new Date().toISOString();
    persist();
    renderAll();
    queueSync();
    toast(record.paid ? 'Kayıt ödendi olarak işaretlendi.' : 'Kayıt tekrar bekleyen yapıldı.');
  }

  function openConfirm() {
    els.confirmModal.classList.remove('hidden');
    els.confirmModal.setAttribute('aria-hidden', 'false');
  }

  function closeConfirm() {
    deleteCandidateId = null;
    els.confirmModal.classList.add('hidden');
    els.confirmModal.setAttribute('aria-hidden', 'true');
  }

  function deleteRecordConfirmed() {
    if (!deleteCandidateId) return closeConfirm();
    state.records = state.records.filter((r) => r.id !== deleteCandidateId);
    persist();
    renderAll();
    closeConfirm();
    closeEditor();
    queueSync();
    toast('Kayıt silindi.');
  }

  function fillSettingsForm() {
    const s = state.settings;
    els.settingWeekday.value = String(s.weekday);
    els.settingHour.value = padNum(s.hour);
    els.settingMinute.value = padNum(s.minute);
    els.settingLookahead.value = String(s.lookahead_days);
    els.settingLookback.value = String(s.lookback_days);
    els.settingDailyHour.value = padNum(s.daily_hour);
    els.settingDailyMinute.value = padNum(s.daily_minute);
    els.settingEnabled.checked = Boolean(s.enabled);
    els.backendUrl.value = s.backend_url || '';
  }

  function saveSettings() {
    state.settings.weekday = clampInt(els.settingWeekday.value, 0, 6, 6);
    state.settings.hour = clampInt(els.settingHour.value, 0, 23, 12);
    state.settings.minute = clampInt(els.settingMinute.value, 0, 59, 0);
    state.settings.lookahead_days = clampInt(els.settingLookahead.value, 1, 60, 7);
    state.settings.lookback_days = clampInt(els.settingLookback.value, 0, 60, 2);
    state.settings.daily_hour = clampInt(els.settingDailyHour.value, 0, 23, 22);
    state.settings.daily_minute = clampInt(els.settingDailyMinute.value, 0, 59, 0);
    state.settings.enabled = Boolean(els.settingEnabled.checked);
    persist();
    els.settingsFeedback.textContent = 'Bildirim ayarları kaydedildi. Uygun ise sunucuya da gönderilecek.';
    queueSync();
    checkPublicStatus();
    toast('Bildirim ayarları kaydedildi.');
  }

  function saveConnectionSettings() {
    state.settings.backend_url = sanitizeUrl(els.backendUrl.value.trim());
    persist();
    renderConnectionUi();
    if (!state.settings.backend_url) {
      els.connectionFeedback.textContent = 'Bağlantı URL’i boş bırakıldı. Uygulama yerel modda çalışır.';
      setBackendStatus('offline', 'Sunucu URL’i girilmedi', 'Bağlantı ayarları kaydedildi ama sunucu tanımlı değil.');
      setTelegramStatus('checking', 'Telegram bağlantısı kontrol edilemiyor', 'Önce geçerli sunucu URL’i gir.');
      return;
    }
    els.connectionFeedback.textContent = 'Bağlantı kaydedildi. Sunucu doğrulanıyor…';
    checkServerConfig(true);
    queueSync(true);
    toast('Bağlantı ayarları kaydedildi.');
  }

  function renderConnectionUi() {
    updatePairCode();
    if (!state.settings.backend_url) {
      setBackendStatus('checking', 'Sunucu kontrol ediliyor…', 'Önce bir URL gir ve kaydet.');
      setTelegramStatus('checking', 'Telegram bağlantısı kontrol ediliyor…', 'Sunucu üzerinden cihaz durumu alınacak.');
      return;
    }
  }

  function updatePairCode() {
    if (!state.settings.pair_code) {
      state.settings.pair_code = generatePairCode();
      persist();
    }
    els.pairCode.textContent = state.settings.pair_code;
  }

  function refreshPairCode() {
    state.settings.pair_code = generatePairCode();
    persist();
    updatePairCode();
    queueSync(true);
    toast('Yeni bağlantı kodu oluşturuldu.');
  }

  function pairTelegram() {
    if (!state.settings.backend_url) {
      toast('Önce Bağlantı Ayarları bölümünden Apps Script URL’ini kaydet.');
      showView('connections');
      return;
    }
    if (!state.settings.bot_username) {
      toast('Bot kullanıcı adı henüz sunucudan alınmadı. Önce Bağlantı Ayarlarını Kaydet.');
      checkServerConfig(true);
      return;
    }
    const pairCode = state.settings.pair_code || generatePairCode();
    state.settings.pair_code = pairCode;
    persist();
    queueSync(true);
    const url = `https://t.me/${state.settings.bot_username}?start=${encodeURIComponent(pairCode)}`;
    window.open(url, '_blank', 'noopener');
    toast('Telegram açıldı. Botta Başlat / Start düğmesine bas.');
  }

  function sendTestTelegram() {
    if (!state.settings.backend_url) {
      toast('Önce sunucu URL’ini kaydet.');
      return;
    }
    setSyncBadge('Test gönderiliyor…');
    postOpaque({ action: 'test', installation_id: state.installation_id, device_secret: state.device_secret })
      .then(() => {
        setSyncBadge('Güncel');
        toast('Test isteği sunucuya gönderildi. Telegram’ı kontrol et.');
        setTimeout(checkPublicStatus, 900);
      })
      .catch(() => {
        setSyncBadge('Hata');
        toast('Telegram testi gönderilemedi.');
      });
  }

  function queueSync(immediate = false) {
    if (!state.settings.backend_url || !navigator.onLine) {
      setSyncBadge(navigator.onLine ? 'Yerel' : 'Çevrimdışı');
      return;
    }
    clearTimeout(syncTimer);
    if (immediate) return syncAll();
    setSyncBadge('Senkron bekliyor');
    syncTimer = setTimeout(syncAll, SYNC_DEBOUNCE_MS);
  }

  async function syncAll() {
    if (syncInFlight || !state.settings.backend_url || !navigator.onLine) return;
    syncInFlight = true;
    setSyncBadge('Senkron…');
    try {
      await postOpaque({
        action: 'sync',
        installation_id: state.installation_id,
        device_secret: state.device_secret,
        refresh_pair_code: true,
        app_version: APP_VERSION,
        settings: {
          weekday: state.settings.weekday,
          hour: state.settings.hour,
          minute: state.settings.minute,
          lookahead_days: state.settings.lookahead_days,
          lookback_days: state.settings.lookback_days,
          daily_hour: state.settings.daily_hour,
          daily_minute: state.settings.daily_minute,
          enabled: state.settings.enabled,
          pair_code: state.settings.pair_code,
          bot_username: state.settings.bot_username || ''
        },
        records: state.records.map((r) => ({ ...r }))
      });
      lastSyncTime = Date.now();
      state.last_sync_at = new Date(lastSyncTime).toISOString();
      persist();
      setSyncBadge('Güncel');
      checkPublicStatus();
    } catch (err) {
      setSyncBadge('Hata');
      console.error(err);
    } finally {
      syncInFlight = false;
    }
  }

  function postOpaque(payload) {
    return fetch(state.settings.backend_url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    });
  }

  function checkServerConfig(showToastOnSuccess = false) {
    if (!state.settings.backend_url) return;
    setBackendStatus('checking', 'Sunucu kontrol ediliyor…', 'Bağlantı ve bot bilgileri alınıyor.');
    jsonpRequest(state.settings.backend_url, { action: 'config', installation_id: state.installation_id })
      .then((data) => {
        if (!data || data.ok === false) throw new Error(data?.error || 'config_error');
        state.settings.bot_username = String(data.bot_username || '').replace(/^@/, '');
        persist();
        const version = data.version ? `v${data.version}` : 'hazır';
        setBackendStatus('online', `Sunucu çevrimiçi (${version})`, state.settings.bot_username ? `Bot: @${state.settings.bot_username}` : 'Bot kullanıcı adı tanımlanmamış.');
        if (showToastOnSuccess) toast('Sunucu doğrulandı.');
      })
      .catch((err) => {
        console.error(err);
        setBackendStatus('offline', 'Sunucuya ulaşılamadı', 'URL’i ve dağıtım erişimini kontrol et.');
      });
  }

  function checkPublicStatus() {
    if (!state.settings.backend_url) return;
    jsonpRequest(state.settings.backend_url, { action: 'status', installation_id: state.installation_id })
      .then((data) => {
        if (!data || data.ok === false) throw new Error(data?.error || 'status_error');
        const linked = Boolean(data.telegram_linked);
        if (linked) {
          setTelegramStatus('online', 'Telegram bağlı', 'Bildirimler bu cihaz için hazır.');
        } else {
          setTelegramStatus('checking', 'Telegram bağlı değil', 'Bağlan düğmesiyle botu eşleştir.');
        }
        if (typeof data.record_count === 'number' && data.record_count !== state.records.length) {
          els.connectionFeedback.textContent = `Sunucu kayıt sayısı: ${data.record_count}. Yerelde ${state.records.length} kayıt var.`;
        }
        if (data.bot_username) {
          state.settings.bot_username = String(data.bot_username).replace(/^@/, '');
          persist();
        }
        setSyncBadge(navigator.onLine ? 'Güncel' : 'Çevrimdışı');
      })
      .catch((err) => {
        console.error(err);
        setTelegramStatus('offline', 'Durum alınamadı', 'Sunucu cevap vermedi veya JSONP isteği başarısız oldu.');
      });
  }

  function setBackendStatus(mode, title, detail) {
    els.backendStatusCard.className = `status-card-shell ${mode}`;
    els.backendStatusTitle.textContent = title;
    els.backendStatusDetail.textContent = detail;
  }

  function setTelegramStatus(mode, title, detail) {
    els.telegramStatusCard.className = `status-card-shell ${mode}`;
    els.telegramStatusTitle.textContent = title;
    els.telegramStatusDetail.textContent = detail;
  }

  function setSyncBadge(text) {
    els.syncBadge.textContent = text;
  }

  function computeStats() {
    let pending = 0;
    let paid = 0;
    let overdue = 0;
    for (const record of state.records) {
      if (record.paid) paid += 1;
      else if (isOverdue(record.date)) overdue += 1;
      else pending += 1;
    }
    return { total: state.records.length, pending, paid, overdue };
  }

  function sortedRecords() {
    return [...state.records].sort((a, b) => {
      const rank = (r) => r.paid ? 2 : isOverdue(r.date) ? 0 : 1;
      const diffRank = rank(a) - rank(b);
      if (diffRank !== 0) return diffRank;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.account_name.localeCompare(b.account_name, 'tr');
    });
  }

  function recordTone(record) {
    if (record.paid) return 'paid';
    if (isOverdue(record.date)) return 'overdue';
    return 'pending';
  }

  function isOverdue(dateValue) {
    return String(dateValue || '') < todayIso();
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return normalizeState(parsed);
      }
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw);
        const migrated = normalizeState({
          installation_id: legacy.installation_id,
          device_secret: legacy.device_secret,
          records: Array.isArray(legacy.records) ? legacy.records : [],
          settings: {
            ...DEFAULT_SETTINGS,
            ...(legacy.settings || {}),
            enabled: false,
            pair_code: legacy.pair_code || ''
          },
          last_sync_at: ''
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return normalizeState({});
    } catch (_) {
      return normalizeState({});
    }
  }

  function normalizeState(parsed) {
    const records = Array.isArray(parsed.records) ? parsed.records.map((record) => ({
      id: record.id || createId('rec'),
      account_name: String(record.account_name || '').trim(),
      date_type: record.date_type === 'statement' ? 'statement' : 'due',
      date: String(record.date || '').slice(0, 10),
      description: String(record.description || ''),
      paid: record.paid === true || String(record.paid).toLowerCase() === 'true',
      paid_at: record.paid_at ? String(record.paid_at).slice(0, 10) : '',
      updated_at: record.updated_at || new Date().toISOString()
    })).filter((record) => record.account_name && /^\d{4}-\d{2}-\d{2}$/.test(record.date)) : [];

    return {
      installation_id: parsed.installation_id || createId('dev'),
      device_secret: parsed.device_secret || createId('sec') + createId('x'),
      records,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      last_sync_at: parsed.last_sync_at || ''
    };
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function jsonpRequest(baseUrl, params = {}) {
    return new Promise((resolve, reject) => {
      const callbackName = `furkinansJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const url = new URL(baseUrl);
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
      url.searchParams.set('prefix', callbackName);
      const cleanup = () => {
        delete window[callbackName];
        script.remove();
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('timeout'));
      }, 10000);
      window[callbackName] = (data) => {
        clearTimeout(timeout);
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error('jsonp_error'));
      };
      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  function toast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
  }

  function formatDisplayDate(value) {
    if (!value) return '—';
    const iso = String(value).slice(0, 10);
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return escapeHtml(String(value));
    return `${d}.${m}.${y}`;
  }

  function todayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function createId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-6)}`;
  }

  function generatePairCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
  }

  function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function padNum(value) {
    return String(clampInt(value, 0, 59, 0)).padStart(2, '0');
  }

  function sanitizeUrl(url) {
    if (!url) return '';
    return url.replace(/\/+$/, '');
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function byId(id) {
    return document.getElementById(id);
  }
})();
