(() => {
  'use strict';

  const STORAGE_KEY = 'furkinans_pwa_v1';
  const $ = (id) => document.getElementById(id);
  let decorating = false;
  let pendingDeleteId = '';

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
    if (record.paid) return { label: 'Ödendi', tone: 'paid', rank: 2, icon: '✓' };
    if (isOverdue(record)) return { label: 'Gecikti', tone: 'overdue', rank: 0, icon: '!' };
    return { label: 'Bekliyor', tone: 'pending', rank: 1, icon: '○' };
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
    const notificationView = $('settingsView');
    const connectionView = $('connectionsView');

    if (notificationView) {
      const cards = Array.from(notificationView.querySelectorAll(':scope > .card.stack'));
      if (cards[0]) {
        cards[0].classList.add('notification-settings-card');
        const eyebrow = cards[0].querySelector('.eyebrow');
        const title = cards[0].querySelector('h2');
        if (eyebrow) eyebrow.textContent = 'BİLDİRİM PLANI';
        if (title) title.textContent = 'Bildirim Ayarları';
      }
    }

    if (connectionView) {
      const card = connectionView.querySelector('.card.stack');
      if (card) {
        card.classList.add('telegram-settings-card');
        const title = card.querySelector('h2');
        if (title) title.textContent = 'Bağlantı Ayarları';
      }
    }
  }

  function togglePaid(recordId) {
    const data = readData();
    const index = data.records.findIndex((r) => String(r.id) === String(recordId));
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

  function ensureDeleteConfirm() {
    if ($('proDeleteConfirm')) return;

    const overlay = document.createElement('div');
    overlay.id = 'proDeleteConfirm';
    overlay.className = 'pro-delete-confirm hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'proDeleteConfirmTitle');
    overlay.innerHTML = `
      <div class="pro-delete-sheet">
        <div class="pro-delete-icon">−</div>
        <div class="pro-delete-copy">
          <span class="eyebrow">KAYDI SİL</span>
          <h3 id="proDeleteConfirmTitle">Bu kaydı silmek istiyor musun?</h3>
          <p id="proDeleteConfirmDetail">Bu işlem geri alınamaz.</p>
        </div>
        <div class="pro-delete-buttons">
          <button id="proDeleteCancel" type="button" class="pro-delete-cancel">Vazgeç</button>
          <button id="proDeleteApprove" type="button" class="pro-delete-approve">Sil</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    $('proDeleteCancel').addEventListener('click', closeDeleteConfirm);
    $('proDeleteApprove').addEventListener('click', confirmDelete);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeDeleteConfirm();
    });
  }

  function openDeleteConfirm(recordId) {
    const data = readData();
    const record = data.records.find((r) => String(r.id) === String(recordId));
    if (!record) return;

    pendingDeleteId = String(recordId);
    const title = $('proDeleteConfirmTitle');
    const detail = $('proDeleteConfirmDetail');
    if (title) title.textContent = `“${record.account_name || 'Kayıt'}” silinsin mi?`;
    if (detail) detail.textContent = 'Kayıt ve bu kayda ait hatırlatmalar kalıcı olarak kaldırılır.';
    $('proDeleteConfirm').classList.remove('hidden');
  }

  function closeDeleteConfirm() {
    pendingDeleteId = '';
    const overlay = $('proDeleteConfirm');
    if (overlay) overlay.classList.add('hidden');
    closeOpenSwipes();
  }

  function confirmDelete() {
    if (!pendingDeleteId) return;
    const data = readData();
    data.records = data.records.filter((r) => String(r.id) !== pendingDeleteId);
    writeData(data);
    pendingDeleteId = '';
    location.reload();
  }

  function closeOpenSwipes(except = null) {
    document.querySelectorAll('.pro-record.is-swipe-open').forEach((card) => {
      if (card !== except) setSwipeOpen(card, false);
    });
  }

  function setSwipePosition(card, x, animate = false) {
    const shell = card.querySelector('.pro-swipe-shell');
    if (!shell) return;
    shell.style.transition = animate ? 'transform .22s cubic-bezier(.2,.8,.2,1)' : 'none';
    shell.style.transform = `translate3d(${x}px,0,0)`;
    card.dataset.swipeX = String(x);
  }

  function setSwipeOpen(card, open) {
    const width = Number(card.dataset.swipeWidth || 100);
    if (open) closeOpenSwipes(card);
    card.classList.toggle('is-swipe-open', open);
    setSwipePosition(card, open ? -width : 0, true);
  }

  function enableSwipe(card, recordId) {
    const shell = card.querySelector('.pro-swipe-shell');
    const deleteButton = card.querySelector('.pro-swipe-delete');
    if (!shell || !deleteButton) return;

    const swipeWidth = 104;
    card.dataset.swipeWidth = String(swipeWidth);

    let startX = 0;
    let startY = 0;
    let startOffset = 0;
    let dragging = false;
    let horizontal = false;
    let moved = false;

    const point = (event) => {
      const touch = event.touches && event.touches[0] ? event.touches[0] : (event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : event);
      return { x: touch.clientX, y: touch.clientY };
    };

    card.addEventListener('touchstart', (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      const p = point(event);
      startX = p.x;
      startY = p.y;
      startOffset = card.classList.contains('is-swipe-open') ? -swipeWidth : 0;
      dragging = true;
      horizontal = false;
      moved = false;
      card.classList.add('dragging');
      closeOpenSwipes(card);
    }, { passive: true });

    card.addEventListener('touchmove', (event) => {
      if (!dragging) return;
      const p = point(event);
      const dx = p.x - startX;
      const dy = p.y - startY;

      if (!horizontal && Math.abs(dx) > 8) {
        if (Math.abs(dx) > Math.abs(dy) * 1.15) horizontal = true;
        else return;
      }
      if (!horizontal) return;

      moved = moved || Math.abs(dx) > 10;
      let next = startOffset + dx;
      next = Math.max(-swipeWidth, Math.min(0, next));
      event.preventDefault();
      setSwipePosition(card, next, false);
    }, { passive: false });

    const finish = () => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove('dragging');
      const finalX = Number(card.dataset.swipeX || 0);
      setSwipeOpen(card, finalX <= -(swipeWidth * 0.42));
      if (moved) {
        card.dataset.swipeGuard = '1';
        setTimeout(() => { delete card.dataset.swipeGuard; }, 350);
      }
    };

    card.addEventListener('touchend', finish);
    card.addEventListener('touchcancel', finish);

    card.addEventListener('click', (event) => {
      if (card.dataset.swipeGuard === '1') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (card.classList.contains('is-swipe-open') && !event.target.closest('.pro-swipe-delete') && !event.target.closest('.pro-state-chip')) {
        event.preventDefault();
        event.stopPropagation();
        setSwipeOpen(card, false);
      }
    }, true);

    deleteButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDeleteConfirm(recordId);
    });
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
        <button type="button" class="pro-state-chip pro-state-button ${state.tone}" aria-label="${record.paid ? 'Bekliyor yap' : 'Ödendi yap'}">
          <span class="pro-state-icon">${state.icon}</span>
          <span>${state.label}</span>
        </button>
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
      </div>
      <div class="pro-record-footer">
        <span class="pro-swipe-hint"><span aria-hidden="true">←</span> Sola kaydırarak sil</span>
        <span class="pro-edit-hint">Kartı açmak için dokun</span>
      </div>`;

    const statusButton = row.querySelector('.pro-state-button');
    if (statusButton) {
      statusButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        togglePaid(record.id);
      });
    }

    const reveal = document.createElement('div');
    reveal.className = 'pro-swipe-reveal';
    reveal.innerHTML = `<button type="button" class="pro-swipe-delete" aria-label="${escapeHtml(record.account_name || 'Kaydı')} sil"><span class="pro-delete-symbol">−</span><strong>Sil</strong></button>`;

    const shell = document.createElement('div');
    shell.className = 'pro-swipe-shell';
    shell.appendChild(row);

    wrapper.append(reveal, shell);
    enableSwipe(wrapper, record.id);
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
    ensureDeleteConfirm();
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

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.pro-record')) closeOpenSwipes();
    });

    window.addEventListener('focus', () => {
      syncDashboard();
      decorateRows();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
