(() => {
  'use strict';

  const STORAGE_KEY = 'furkinans_pwa_v1';
  const $ = (id) => document.getElementById(id);
  let decorating = false;

  function readData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      parsed.records = Array.isArray(parsed.records) ? parsed.records : [];
      return parsed;
    } catch (_) {
      return { records: [] };
    }
  }

  function writeData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function todayIso() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function isOverdue(record) {
    return !record.paid && /^\d{4}-\d{2}-\d{2}$/.test(String(record.date || '')) && String(record.date) < todayIso();
  }

  function recordState(record) {
    if (record.paid) return { label: 'Ödendi', tone: 'paid', rank: 2 };
    if (isOverdue(record)) return { label: 'Gecikti', tone: 'overdue', rank: 0 };
    return { label: 'Bekliyor', tone: 'pending', rank: 1 };
  }

  function sourceSort(records) {
    return [...records].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.account_name || '').localeCompare(String(b.account_name || ''), 'tr'));
  }

  function displaySort(a, b) {
    const sa = recordState(a);
    const sb = recordState(b);
    return sa.rank - sb.rank || String(a.date).localeCompare(String(b.date)) || String(a.account_name || '').localeCompare(String(b.account_name || ''), 'tr');
  }

  function formatDate(iso) {
    const [y, m, d] = String(iso || '').split('-');
    return y && m && d ? `${d}.${m}.${y}` : (iso || '—');
  }

  function dateTypeLabel(record) {
    return record.date_type === 'statement' ? 'Hesap Kesim' : 'Son Ödeme';
  }

  function buildDashboard() {
    const view = $('recordsView');
    const old = view && view.querySelector('.summary-card');
    if (!view || view.querySelector('.pro-dashboard')) return;

    const dashboard = document.createElement('section');
    dashboard.className = 'pro-dashboard';
    dashboard.innerHTML = `
      <div class="pro-dashboard-head">
        <div><span class="eyebrow">FİNANS PANOSU</span><h2>Kayıtların</h2></div>
        <span class="pro-badge-slot"></span>
      </div>
      <div class="pro-stats-grid">
        <div class="pro-stat"><span>Toplam</span><strong id="proTotal">0</strong></div>
        <div class="pro-stat warning"><span>Bekleyen</span><strong id="proPending">0</strong></div>
        <div class="pro-stat success"><span>Ödendi</span><strong id="proPaid">0</strong></div>
        <div class="pro-stat danger"><span>Geciken</span><strong id="proOverdue">0</strong></div>
      </div>`;

    const syncBadge = $('syncBadge');
    if (old) old.replaceWith(dashboard);
    else view.insertBefore(dashboard, view.firstChild);
    const slot = dashboard.querySelector('.pro-badge-slot');
    if (syncBadge && slot) slot.replaceWith(syncBadge);
  }

  function syncDashboard() {
    const records = readData().records;
    const paid = records.filter((r) => r.paid).length;
    const overdue = records.filter(isOverdue).length;
    const pending = records.length - paid;
    if ($('proTotal')) $('proTotal').textContent = String(records.length);
    if ($('proPending')) $('proPending').textContent = String(pending);
    if ($('proPaid')) $('proPaid').textContent = String(paid);
    if ($('proOverdue')) $('proOverdue').textContent = String(overdue);
  }

  function applySettingsDesign() {
    const view = $('settingsView');
    if (!view) return;
    const cards = Array.from(view.querySelectorAll(':scope > .card.stack'));
    if (cards[0]) {
      cards[0].classList.add('notification-settings-card');
      const eyebrow = cards[0].querySelector('.eyebrow');
      const title = cards[0].querySelector('h2');
      if (eyebrow) eyebrow.textContent = 'BİLDİRİM PLANI';
      if (title) title.textContent = 'Hatırlatma Ayarları';
    }
    if (cards[1]) {
      cards[1].classList.add('telegram-settings-card');
      const title = cards[1].querySelector('h2');
      if (title) title.textContent = 'Telegram Bağlantısı';
    }
  }

  function togglePaid(recordId) {
    const data = readData();
    const index = data.records.findIndex((r) => r.id === recordId);
    if (index < 0) return;
    const next = !Boolean(data.records[index].paid);
    data.records[index] = {
      ...data.records[index],
      paid: next,
      paid_at: next ? new Date().toISOString() : ''
    };
    writeData(data);
    location.reload();
  }

  function deleteRecord(recordId) {
    const data = readData();
    const record = data.records.find((r) => r.id === recordId);
    const label = record && record.account_name ? `“${record.account_name}” kaydını silmek istiyor musun?` : 'Bu kaydı silmek istiyor musun?';
    if (!confirm(label)) return;
    data.records = data.records.filter((r) => r.id !== recordId);
    writeData(data);
    location.reload();
  }

  function buildCard(record, row) {
    const state = recordState(record);
    const wrapper = document.createElement('article');
    wrapper.className = `pro-record tone-${state.tone}`;
    wrapper.dataset.recordId = record.id;
    wrapper.dataset.sortRank = String(state.rank);
    wrapper.dataset.sortDate = String(record.date || '');

    row.dataset.proReady = '1';
    row.classList.add('pro-record-main');
    row.classList.remove('table-grid');
    row.innerHTML = `
      <div class="pro-record-head">
        <div class="pro-title-stack">
          <span class="pro-kicker">HESAP</span>
          <strong class="pro-account-title">${escapeHtml(record.account_name || '—')}</strong>
        </div>
        <span class="pro-state-chip ${state.tone}">${state.label}</span>
      </div>
      <div class="pro-info-grid">
        <div class="pro-info-block type-${record.date_type === 'statement' ? 'statement' : 'due'}">
          <span class="pro-info-label">Tarih Türü</span>
          <strong>${dateTypeLabel(record)}</strong>
        </div>
        <div class="pro-info-block">
          <span class="pro-info-label">Tarih</span>
          <strong class="pro-date-value">${formatDate(record.date)}</strong>
        </div>
        <div class="pro-info-block pro-info-wide">
          <span class="pro-info-label">Açıklama</span>
          <strong>${escapeHtml(record.description || 'Açıklama girilmedi')}</strong>
        </div>
        ${record.paid && record.paid_at ? `<div class="pro-paid-note">✓ Ödeme tarihi: ${formatDate(String(record.paid_at).slice(0, 10))}</div>` : ''}
      </div>`;

    const actions = document.createElement('div');
    actions.className = 'pro-record-actions';

    const paidButton = document.createElement('button');
    paidButton.type = 'button';
    paidButton.className = `pro-action pro-action-paid ${record.paid ? 'active' : ''}`;
    paidButton.innerHTML = `<span>${record.paid ? '✓' : '+'}</span><small>${record.paid ? 'Ödendi' : 'Öde'}</small>`;
    paidButton.setAttribute('aria-label', record.paid ? 'Bekliyor yap' : 'Ödendi yap');
    paidButton.addEventListener('click', (event) => {
      event.stopPropagation();
      togglePaid(record.id);
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'pro-action pro-action-delete';
    deleteButton.innerHTML = '<span>−</span><small>Sil</small>';
    deleteButton.setAttribute('aria-label', 'Kaydı sil');
    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteRecord(record.id);
    });

    actions.append(paidButton, deleteButton);
    wrapper.append(row, actions);
    return wrapper;
  }

  function decorateRows() {
    if (decorating) return;
    decorating = true;
    try {
      const list = $('recordsList');
      if (!list) return;

      const rawRows = Array.from(list.children).filter((el) => el.classList && el.classList.contains('record-row'));
      const records = sourceSort(readData().records);

      rawRows.forEach((row, index) => {
        if (row.dataset.proReady === '1') return;
        const record = records[index];
        if (!record) return;
        row.replaceWith(buildCard(record, row));
      });

      const wrappers = Array.from(list.children).filter((el) => el.classList && el.classList.contains('pro-record'));
      const byId = new Map(readData().records.map((record) => [String(record.id), record]));
      wrappers.sort((a, b) => {
        const ra = byId.get(String(a.dataset.recordId));
        const rb = byId.get(String(b.dataset.recordId));
        if (!ra || !rb) return 0;
        return displaySort(ra, rb);
      }).forEach((wrapper) => list.appendChild(wrapper));

      syncDashboard();
    } finally {
      decorating = false;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  }

  function init() {
    buildDashboard();
    applySettingsDesign();
    decorateRows();

    const list = $('recordsList');
    if (list) {
      const observer = new MutationObserver(() => {
        if (decorating) return;
        requestAnimationFrame(() => decorateRows());
      });
      observer.observe(list, { childList: true });
    }

    window.addEventListener('focus', () => {
      syncDashboard();
      decorateRows();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
