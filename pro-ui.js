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
    if (record.paid) return { label: 'Ödendi', tone: 'paid' };
    if (isOverdue(record)) return { label: 'Gecikti', tone: 'overdue' };
    return { label: 'Bekliyor', tone: 'pending' };
  }

  function sortRecords(records) {
    return [...records].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.account_name || '').localeCompare(String(b.account_name || ''), 'tr'));
  }

  function formatDate(iso) {
    const [y, m, d] = String(iso || '').split('-');
    return y && m && d ? `${d}.${m}.${y}` : (iso || '—');
  }

  function buildDashboard() {
    const view = $('recordsView');
    const old = view && view.querySelector('.summary-card');
    if (!view || !old || view.querySelector('.pro-dashboard')) return;

    const dashboard = document.createElement('section');
    dashboard.className = 'pro-dashboard';
    dashboard.innerHTML = `
      <div class="pro-dashboard-head">
        <div><span class="eyebrow">FİNANS PANOSU</span><h2>Kayıtların</h2></div>
        <span id="proSyncBadge" class="status-badge">Hazır</span>
      </div>
      <div class="pro-stats-grid">
        <div class="pro-stat"><span>Toplam</span><strong id="proTotal">0</strong></div>
        <div class="pro-stat warning"><span>Bekleyen</span><strong id="proPending">0</strong></div>
        <div class="pro-stat success"><span>Ödendi</span><strong id="proPaid">0</strong></div>
        <div class="pro-stat danger"><span>Geciken</span><strong id="proOverdue">0</strong></div>
      </div>`;
    old.replaceWith(dashboard);
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

    const source = $('syncBadge');
    const target = $('proSyncBadge');
    if (source && target) target.textContent = source.textContent || 'Hazır';
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

  function decorateRows() {
    if (decorating) return;
    decorating = true;
    try {
      const list = $('recordsList');
      if (!list) return;
      const rows = Array.from(list.children).filter((el) => el.classList && el.classList.contains('record-row'));
      if (!rows.length) {
        syncDashboard();
        return;
      }

      const records = sortRecords(readData().records);
      rows.forEach((row, index) => {
        if (row.dataset.proReady === '1') return;
        const record = records[index];
        if (!record) return;
        const state = recordState(record);

        const wrapper = document.createElement('article');
        wrapper.className = `pro-record tone-${state.tone}`;
        wrapper.dataset.recordId = record.id;

        row.dataset.proReady = '1';
        row.classList.add('pro-record-main');
        row.classList.remove('table-grid');
        row.innerHTML = `
          <div class="pro-record-head">
            <div class="pro-title-wrap">
              <strong>${escapeHtml(record.account_name || '—')}</strong>
              <span class="pro-type-chip">${record.date_type === 'statement' ? 'Hesap kesim' : 'Son ödeme'}</span>
            </div>
            <span class="pro-state-chip ${state.tone}">${state.label}</span>
          </div>
          <div class="pro-record-meta"><span>${formatDate(record.date)}</span>${record.paid && record.paid_at ? `<span class="paid-meta">Ödendi • ${formatDate(String(record.paid_at).slice(0,10))}</span>` : ''}</div>
          <p>${escapeHtml(record.description || 'Açıklama girilmedi')}</p>`;

        const actions = document.createElement('div');
        actions.className = 'pro-record-actions';

        const paidButton = document.createElement('button');
        paidButton.type = 'button';
        paidButton.className = `pro-action pro-action-paid ${record.paid ? 'active' : ''}`;
        paidButton.innerHTML = `<span>${record.paid ? '✓' : '+'}</span><small>${record.paid ? 'Ödendi' : 'Öde'}</small>`;
        paidButton.setAttribute('aria-label', record.paid ? 'Bekliyor yap' : 'Ödendi yap');
        paidButton.addEventListener('click', () => togglePaid(record.id));

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'pro-action pro-action-delete';
        deleteButton.innerHTML = '<span>−</span><small>Sil</small>';
        deleteButton.setAttribute('aria-label', 'Kaydı sil');
        deleteButton.addEventListener('click', () => deleteRecord(record.id));

        actions.append(paidButton, deleteButton);
        row.replaceWith(wrapper);
        wrapper.append(row, actions);
      });
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

    const sync = $('syncBadge');
    if (sync) new MutationObserver(syncDashboard).observe(sync, { childList: true, characterData: true, subtree: true });
    window.addEventListener('focus', syncDashboard);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
