(() => {
  'use strict';

  const STORAGE_KEY = 'furkinans_pwa_v1';
  const VERSION = 'v2.8';
  const $ = (id) => document.getElementById(id);
  let rendering = false;
  let deleteId = '';

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function readData() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      data.records = Array.isArray(data.records) ? data.records : [];
      return data;
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

  function stateOf(record) {
    if (record.paid) return { tone: 'paid', label: 'Ödendi', icon: '✓', rank: 2 };
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(record.date || '')) && String(record.date) < todayIso()) return { tone: 'overdue', label: 'Gecikti', icon: '!', rank: 0 };
    return { tone: 'pending', label: 'Bekliyor', icon: '◔', rank: 1 };
  }

  function sortRecords(records) {
    return [...records].sort((a, b) => {
      const sa = stateOf(a), sb = stateOf(b);
      return sa.rank - sb.rank || String(a.date || '').localeCompare(String(b.date || '')) || String(a.account_name || '').localeCompare(String(b.account_name || ''), 'tr');
    });
  }

  function formatDate(iso) {
    const [y, m, d] = String(iso || '').split('-');
    return y && m && d ? `${d}.${m}.${y}` : '—';
  }

  function ensureVersionBadge() {
    const h1 = document.querySelector('.topbar h1');
    if (!h1 || h1.parentElement.querySelector('.version-badge-v28')) return;
    const badge = document.createElement('span');
    badge.className = 'version-badge-v28';
    badge.textContent = VERSION;
    h1.insertAdjacentElement('afterend', badge);
  }

  function updateCounts(records) {
    const paid = records.filter((r) => Boolean(r.paid)).length;
    const overdue = records.filter((r) => !r.paid && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || '')) && String(r.date) < todayIso()).length;
    const pending = records.length - paid;
    const pairs = [
      ['proTotal', records.length], ['proPending', pending], ['proPaid', paid], ['proOverdue', overdue],
      ['recordCount', records.length], ['pendingCount', pending], ['paidCount', paid], ['overdueCount', overdue]
    ];
    pairs.forEach(([id, value]) => { const el = $(id); if (el) el.textContent = String(value); });
  }

  function ensureList() {
    const legacy = $('recordsList');
    if (!legacy) return null;
    let list = $('recordsV3List');
    if (!list) {
      list = document.createElement('div');
      list.id = 'recordsV3List';
      legacy.insertAdjacentElement('afterend', list);
    }
    return list;
  }

  function legacyOpenEditor(recordId) {
    const escaped = window.CSS && CSS.escape ? CSS.escape(String(recordId)) : String(recordId).replace(/"/g, '\\"');
    const pro = document.querySelector(`#recordsList .pro-record[data-record-id="${escaped}"] .pro-record-main`);
    if (pro) { pro.click(); return; }

    const data = readData();
    const source = [...data.records].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.account_name || '').localeCompare(String(b.account_name || ''), 'tr'));
    const index = source.findIndex((r) => String(r.id) === String(recordId));
    const rows = Array.from(document.querySelectorAll('#recordsList .record-row'));
    if (index >= 0 && rows[index]) rows[index].click();
  }

  function togglePaid(recordId) {
    const data = readData();
    const index = data.records.findIndex((r) => String(r.id) === String(recordId));
    if (index < 0) return;
    const next = !Boolean(data.records[index].paid);
    data.records[index] = { ...data.records[index], paid: next, paid_at: next ? new Date().toISOString() : '' };
    writeData(data);
    location.reload();
  }

  function ensureConfirm() {
    if ($('v28Confirm')) return;
    const overlay = document.createElement('div');
    overlay.id = 'v28Confirm';
    overlay.className = 'v28-confirm hidden';
    overlay.innerHTML = `
      <div class="v28-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="v28ConfirmTitle">
        <h3 id="v28ConfirmTitle">Kayıt silinsin mi?</h3>
        <p id="v28ConfirmText">Bu işlem geri alınamaz.</p>
        <div class="v28-confirm-actions">
          <button type="button" class="v28-cancel" id="v28Cancel">Vazgeç</button>
          <button type="button" class="v28-approve" id="v28Approve">Sil</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    $('v28Cancel').addEventListener('click', closeConfirm);
    $('v28Approve').addEventListener('click', approveDelete);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeConfirm(); });
  }

  function openConfirm(recordId) {
    const record = readData().records.find((r) => String(r.id) === String(recordId));
    if (!record) return;
    deleteId = String(recordId);
    $('v28ConfirmTitle').textContent = `“${record.account_name || 'Kayıt'}” silinsin mi?`;
    $('v28ConfirmText').textContent = 'Kayıt ve bu kayda ait hatırlatma verileri kalıcı olarak kaldırılacak.';
    $('v28Confirm').classList.remove('hidden');
  }

  function closeConfirm() {
    deleteId = '';
    const modal = $('v28Confirm');
    if (modal) modal.classList.add('hidden');
    closeOpenCards();
  }

  function approveDelete() {
    if (!deleteId) return;
    const data = readData();
    data.records = data.records.filter((r) => String(r.id) !== deleteId);
    writeData(data);
    deleteId = '';
    location.reload();
  }

  function closeOpenCards(except = null) {
    document.querySelectorAll('.v28-card.open').forEach((card) => {
      if (card !== except) setOpen(card, false);
    });
  }

  function setX(card, x, animate = true) {
    const shell = card.querySelector('.v28-shell');
    if (!shell) return;
    shell.style.transition = animate ? 'transform .22s cubic-bezier(.2,.8,.2,1)' : 'none';
    shell.style.transform = `translate3d(${x}px,0,0)`;
    card.dataset.x = String(x);
  }

  function setOpen(card, open) {
    if (open) closeOpenCards(card);
    card.classList.toggle('open', open);
    setX(card, open ? -104 : 0, true);
  }

  function enableSwipe(card) {
    let sx = 0, sy = 0, base = 0, dragging = false, horizontal = false, moved = false;

    const start = (x, y) => {
      sx = x; sy = y; base = card.classList.contains('open') ? -104 : 0;
      dragging = true; horizontal = false; moved = false;
      card.classList.add('dragging');
      if (!card.classList.contains('open')) closeOpenCards(card);
    };

    const move = (x, y, prevent) => {
      if (!dragging) return;
      const dx = x - sx, dy = y - sy;
      if (!horizontal) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.15) horizontal = true;
        else if (Math.abs(dy) > 12) { dragging = false; card.classList.remove('dragging'); return; }
      }
      if (!horizontal) return;
      moved = moved || Math.abs(dx) > 10;
      let next = Math.max(-104, Math.min(0, base + dx));
      setX(card, next, false);
      if (prevent) prevent();
    };

    const end = () => {
      if (!dragging) return;
      dragging = false; card.classList.remove('dragging');
      const x = Number(card.dataset.x || 0);
      setOpen(card, x <= -46);
      if (moved) {
        card.dataset.guard = '1';
        setTimeout(() => delete card.dataset.guard, 320);
      }
    };

    if (window.PointerEvent) {
      card.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest('.v28-status,.v28-delete-button')) return;
        start(e.clientX, e.clientY);
        try { card.setPointerCapture(e.pointerId); } catch (_) {}
      });
      card.addEventListener('pointermove', (e) => move(e.clientX, e.clientY, () => e.preventDefault()));
      card.addEventListener('pointerup', end);
      card.addEventListener('pointercancel', end);
    } else {
      card.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        if (e.target.closest('.v28-status,.v28-delete-button')) return;
        start(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      card.addEventListener('touchmove', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        move(e.touches[0].clientX, e.touches[0].clientY, () => e.preventDefault());
      }, { passive: false });
      card.addEventListener('touchend', end);
      card.addEventListener('touchcancel', end);
    }
  }

  function makeCard(record) {
    const state = stateOf(record);
    const card = document.createElement('article');
    card.className = `v28-card ${state.tone}`;
    card.dataset.recordId = record.id;
    card.innerHTML = `
      <div class="v28-delete-reveal"><button type="button" class="v28-delete-button"><span class="icon">−</span><strong>Sil</strong></button></div>
      <div class="v28-shell">
        <div class="v28-main">
          <div class="v28-head">
            <div class="v28-title"><span class="v28-kicker">HESAP</span><strong>${esc(record.account_name || '—')}</strong></div>
            <button type="button" class="v28-status ${state.tone}" aria-label="${record.paid ? 'Bekliyor yap' : 'Ödendi yap'}"><span class="dot">${state.icon}</span><span>${state.label}</span><span class="arr">›</span></button>
          </div>
          <div class="v28-info">
            <div class="v28-box ${record.date_type === 'statement' ? 'statement' : 'due'}"><span>Tarih Türü</span><strong>${record.date_type === 'statement' ? 'Hesap Kesim' : 'Son Ödeme'}</strong></div>
            <div class="v28-box"><span>Tarih</span><strong>${formatDate(record.date)}</strong></div>
            <div class="v28-box desc"><span>Açıklama</span><strong>${esc(record.description || 'Açıklama girilmedi')}</strong></div>
          </div>
          ${record.paid && record.paid_at ? `<div class="v28-paid-date">✓ Ödeme tarihi: ${formatDate(String(record.paid_at).slice(0, 10))}</div>` : ''}
          <div class="v28-footer"><span class="swipe"><b>←</b> Sola kaydırarak sil</span><span>Kartı açmak için dokun</span></div>
        </div>
      </div>`;

    card.querySelector('.v28-status').addEventListener('click', (e) => { e.stopPropagation(); togglePaid(record.id); });
    card.querySelector('.v28-delete-button').addEventListener('click', (e) => { e.stopPropagation(); openConfirm(record.id); });
    card.querySelector('.v28-main').addEventListener('click', (e) => {
      if (card.dataset.guard === '1') return;
      if (e.target.closest('.v28-status')) return;
      if (card.classList.contains('open')) { setOpen(card, false); return; }
      legacyOpenEditor(record.id);
    });
    enableSwipe(card);
    return card;
  }

  function render() {
    if (rendering) return;
    rendering = true;
    try {
      ensureVersionBadge();
      ensureConfirm();
      const list = ensureList();
      if (!list) return;
      const data = readData();
      const records = sortRecords(data.records);
      updateCounts(records);
      list.replaceChildren(...records.map(makeCard));
      const empty = $('emptyState');
      if (empty) empty.classList.toggle('hidden', records.length !== 0);
    } finally {
      rendering = false;
    }
  }

  function init() {
    render();
    const legacy = $('recordsList');
    if (legacy) {
      const observer = new MutationObserver(() => requestAnimationFrame(render));
      observer.observe(legacy, { childList: true, subtree: false });
    }
    document.addEventListener('click', (e) => { if (!e.target.closest('.v28-card')) closeOpenCards(); });
    window.addEventListener('focus', render);
    window.addEventListener('furkinans:sync', render);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();