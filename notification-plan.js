(() => {
  const STORAGE_KEY = 'furkinans_v1_0';
  const SAVED_AT_KEY = 'furkinans_notification_plan_saved_at';
  const WEEKDAYS = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];

  const saveButton = document.getElementById('save-settings');
  const feedback = document.getElementById('settings-feedback');
  if (!saveButton || !feedback) return;

  injectStyles();
  const card = document.createElement('section');
  card.id = 'notification-plan-card';
  card.className = 'notification-plan-card';
  card.innerHTML = `
    <div class="notification-plan-head">
      <div>
        <span class="notification-plan-eyebrow">KAYITLI BİLDİRİM PLANI</span>
        <h3>Aktif plan</h3>
      </div>
      <span id="notification-plan-badge" class="notification-plan-badge neutral">Kontrol ediliyor</span>
    </div>
    <div class="notification-plan-grid">
      <div class="notification-plan-item">
        <span>Genel bildirim</span>
        <strong id="notification-plan-general">—</strong>
      </div>
      <div class="notification-plan-item">
        <span>Tarih aralığı</span>
        <strong id="notification-plan-window">—</strong>
      </div>
      <div class="notification-plan-item">
        <span>Günlük takip</span>
        <strong id="notification-plan-daily">—</strong>
      </div>
      <div class="notification-plan-item">
        <span>Son kayıt</span>
        <strong id="notification-plan-saved">—</strong>
      </div>
    </div>
    <div id="notification-plan-server" class="notification-plan-server neutral">
      Sunucu kaydı kontrol ediliyor…
    </div>
  `;
  feedback.insertAdjacentElement('afterend', card);

  const badge = document.getElementById('notification-plan-badge');
  const general = document.getElementById('notification-plan-general');
  const windowEl = document.getElementById('notification-plan-window');
  const daily = document.getElementById('notification-plan-daily');
  const saved = document.getElementById('notification-plan-saved');
  const server = document.getElementById('notification-plan-server');

  saveButton.addEventListener('click', () => {
    localStorage.setItem(SAVED_AT_KEY, new Date().toISOString());
    setTimeout(() => {
      renderLocal('syncing');
      verifyServer();
    }, 80);
    setTimeout(verifyServer, 1800);
    setTimeout(verifyServer, 3600);
  });

  const tabSettings = document.getElementById('tab-settings');
  if (tabSettings) {
    tabSettings.addEventListener('click', () => {
      setTimeout(() => {
        renderLocal();
        verifyServer();
      }, 80);
    });
  }

  renderLocal();
  setTimeout(verifyServer, 900);

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function renderLocal(mode = 'local') {
    const state = readState();
    const s = state.settings || {};
    const weekday = clamp(Number(s.weekday), 0, 6, 6);
    const hour = clamp(Number(s.hour), 0, 23, 12);
    const minute = clamp(Number(s.minute), 0, 59, 0);
    const lookahead = clamp(Number(s.lookahead_days), 1, 60, 7);
    const lookback = clamp(Number(s.lookback_days), 0, 60, 2);
    const dailyHour = clamp(Number(s.daily_hour), 0, 23, 22);
    const dailyMinute = clamp(Number(s.daily_minute), 0, 59, 0);
    const enabled = Boolean(s.enabled);

    general.textContent = `${WEEKDAYS[weekday]} • ${pad(hour)}:${pad(minute)}`;
    windowEl.textContent = `${lookback} gün önce / ${lookahead} gün sonra`;
    daily.textContent = `Her gün • ${pad(dailyHour)}:${pad(dailyMinute)}`;

    const savedAt = localStorage.getItem(SAVED_AT_KEY);
    saved.textContent = savedAt ? formatDateTime(savedAt) : 'Yerel ayarlar mevcut';

    badge.className = `notification-plan-badge ${enabled ? 'active' : 'inactive'}`;
    badge.textContent = enabled ? 'Aktif' : 'Pasif';

    if (mode === 'syncing') {
      server.className = 'notification-plan-server syncing';
      server.textContent = 'Kaydedildi. Sunucuya aktarım ve otomatik tetikleyici kontrol ediliyor…';
    } else if (!navigator.onLine) {
      server.className = 'notification-plan-server warning';
      server.textContent = 'Çevrimdışı: plan cihazda kayıtlı, sunucu doğrulaması bekliyor.';
    }
  }

  function verifyServer() {
    const state = readState();
    const s = state.settings || {};
    const baseUrl = String(s.backend_url || '').trim();
    const installationId = String(state.installation_id || '').trim();

    if (!baseUrl || !installationId || !navigator.onLine) {
      if (!baseUrl) {
        server.className = 'notification-plan-server warning';
        server.textContent = 'Sunucu URL’i bulunamadı. Plan yalnızca cihazda kayıtlı.';
      }
      return;
    }

    server.className = 'notification-plan-server syncing';
    server.textContent = 'Sunucudaki kayıt doğrulanıyor…';

    jsonp(baseUrl, { action: 'status', installation_id: installationId })
      .then((data) => {
        if (!data || data.ok === false) throw new Error(data && data.error ? data.error : 'status_error');

        const match = settingsMatch(data, s);
        const triggerKnown = typeof data.reminder_trigger_ready === 'boolean';
        const triggerReady = data.reminder_trigger_ready === true;
        const linked = Boolean(data.telegram_linked);
        const enabled = Boolean(s.enabled);
        const followupCount = Number(data.followup_count || 0);

        if (!triggerKnown) {
          server.className = 'notification-plan-server warning';
          server.textContent = `Ayarlar ${match ? 'sunucuda kayıtlı' : 'henüz eşleşmiyor'}, fakat otomatik tetikleyici durumu alınamıyor. Apps Script v1.2 dağıtımı gerekli.`;
          return;
        }

        if (!match) {
          server.className = 'notification-plan-server warning';
          server.textContent = 'Cihazdaki plan ile sunucudaki plan henüz eşleşmiyor. Tekrar Kaydet’e bas ve birkaç saniye bekle.';
          return;
        }

        if (!linked) {
          server.className = 'notification-plan-server warning';
          server.textContent = 'Plan sunucuya kaydedildi, ancak Telegram bağlı değil.';
          return;
        }

        if (!triggerReady) {
          server.className = 'notification-plan-server danger';
          server.textContent = 'Plan sunucuda kayıtlı ama otomatik bildirim tetikleyicisi hazır değil. Apps Script’te setupFurkinansV1() işlevini bir kez çalıştır.';
          return;
        }

        if (!enabled) {
          server.className = 'notification-plan-server neutral';
          server.textContent = 'Plan sunucuda kayıtlı ve tetikleyici hazır; bildirim planı şu anda pasif.';
          return;
        }

        badge.className = 'notification-plan-badge verified';
        badge.textContent = 'Sunucuda aktif';
        server.className = 'notification-plan-server success';
        server.textContent = `Sunucu kaydı doğrulandı • Telegram bağlı • Otomatik tetikleyici hazır${followupCount > 0 ? ` • Günlük takipte ${followupCount} ödeme` : ''}`;
      })
      .catch((err) => {
        console.error('notification-plan status:', err);
        server.className = 'notification-plan-server danger';
        server.textContent = 'Sunucu kaydı doğrulanamadı. Bağlantı veya Apps Script dağıtımını kontrol et.';
      });
  }

  function settingsMatch(data, s) {
    return Number(data.weekday) === Number(s.weekday) &&
      Number(data.hour) === Number(s.hour) &&
      Number(data.minute) === Number(s.minute) &&
      Number(data.lookahead_days) === Number(s.lookahead_days) &&
      Number(data.lookback_days) === Number(s.lookback_days) &&
      Number(data.daily_hour) === Number(s.daily_hour) &&
      Number(data.daily_minute) === Number(s.daily_minute) &&
      Boolean(data.enabled) === Boolean(s.enabled);
  }

  function jsonp(baseUrl, params) {
    return new Promise((resolve, reject) => {
      const callbackName = `furkinansPlan_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const url = new URL(baseUrl);
      Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
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

  function injectStyles() {
    if (document.getElementById('notification-plan-styles')) return;
    const style = document.createElement('style');
    style.id = 'notification-plan-styles';
    style.textContent = `
      .notification-plan-card{margin-top:4px;padding:18px;border:1px solid rgba(56,189,248,.22);border-radius:20px;background:linear-gradient(145deg,rgba(8,20,36,.96),rgba(11,27,47,.92));box-shadow:0 18px 42px rgba(0,0,0,.24)}
      .notification-plan-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}
      .notification-plan-head h3{margin:3px 0 0;font-size:18px;line-height:1.2}
      .notification-plan-eyebrow{font-size:10px;font-weight:800;letter-spacing:.12em;color:#7dd3fc}
      .notification-plan-badge{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 11px;border-radius:999px;font-size:11px;font-weight:800;white-space:nowrap;border:1px solid transparent}
      .notification-plan-badge.active{color:#bbf7d0;background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.28)}
      .notification-plan-badge.verified{color:#d1fae5;background:rgba(16,185,129,.16);border-color:rgba(52,211,153,.4);box-shadow:0 0 0 3px rgba(16,185,129,.06)}
      .notification-plan-badge.inactive{color:#cbd5e1;background:rgba(100,116,139,.12);border-color:rgba(148,163,184,.18)}
      .notification-plan-badge.neutral{color:#bae6fd;background:rgba(14,165,233,.1);border-color:rgba(56,189,248,.2)}
      .notification-plan-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .notification-plan-item{min-width:0;padding:12px 13px;border-radius:14px;border:1px solid rgba(148,163,184,.11);background:rgba(2,10,23,.42)}
      .notification-plan-item span{display:block;margin-bottom:5px;font-size:10px;font-weight:700;letter-spacing:.04em;color:#71839b}
      .notification-plan-item strong{display:block;font-size:13px;line-height:1.35;color:#eef7ff;overflow-wrap:anywhere}
      .notification-plan-server{margin-top:11px;padding:11px 13px;border-radius:14px;font-size:12px;line-height:1.45;border:1px solid rgba(148,163,184,.12);background:rgba(2,10,23,.35);color:#9fb0c5}
      .notification-plan-server.success{color:#bbf7d0;border-color:rgba(34,197,94,.22);background:rgba(34,197,94,.07)}
      .notification-plan-server.syncing{color:#bae6fd;border-color:rgba(56,189,248,.2);background:rgba(14,165,233,.07)}
      .notification-plan-server.warning{color:#fde68a;border-color:rgba(245,158,11,.22);background:rgba(245,158,11,.07)}
      .notification-plan-server.danger{color:#fecaca;border-color:rgba(239,68,68,.24);background:rgba(239,68,68,.07)}
      @media(max-width:560px){.notification-plan-card{padding:15px;border-radius:18px}.notification-plan-grid{grid-template-columns:1fr 1fr;gap:7px}.notification-plan-item{padding:10px 11px}.notification-plan-head{gap:8px}.notification-plan-badge{padding:0 9px;font-size:10px}}
    `;
    document.head.appendChild(style);
  }

  function clamp(n, min, max, fallback) {
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatDateTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(d);
  }
})();