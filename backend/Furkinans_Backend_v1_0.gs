/** Furkinans Backend v1.2 — Google Apps Script */
const FURKINANS_VERSION = '1.2';
const TZ = 'Europe/Istanbul';
const USERS_SHEET = 'Users';
const RECORDS_SHEET = 'Records';
const PAIR_TTL_MS = 30 * 60 * 1000;
const DELIVERY_GRACE_MINUTES = 12;

const USER_HEADERS = [
  'installation_id','device_secret_hash','telegram_chat_id','telegram_username','telegram_name',
  'pair_code','pair_expires_at','enabled','weekday','hour','minute','lookahead_days','lookback_days',
  'daily_hour','daily_minute','updated_at','last_weekly_sent_key','last_daily_sent_key','app_version'
];
const RECORD_HEADERS = [
  'installation_id','record_id','account_name','date_type','date','description','paid','paid_at','updated_at'
];

function setupFurkinansV1() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TELEGRAM_BOT_TOKEN')) throw new Error('TELEGRAM_BOT_TOKEN Script Property eksik.');
  if (!props.getProperty('TELEGRAM_BOT_USERNAME')) console.warn('TELEGRAM_BOT_USERNAME Script Property eksik.');
  ensureDatabase_();
  ensureMinuteTrigger_();
  initializeTelegramOffset_();
  console.log('Furkinans v1.2 hazır: ' + getDatabase_().getUrl());
}

function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  try {
    const action = String(p.action || '');
    if (action === 'config') return output_(p.prefix, {
      ok: true,
      service: 'Furkinans',
      version: FURKINANS_VERSION,
      bot_username: getBotUsername_(),
      reminder_trigger_ready: hasReminderTrigger_(),
      server_time: dateTime_(new Date())
    });
    if (action === 'status') return output_(p.prefix, getPublicStatus_(p.installation_id));
    return output_(p.prefix, {
      ok: true,
      service: 'Furkinans',
      version: FURKINANS_VERSION,
      status: 'online',
      reminder_trigger_ready: hasReminderTrigger_(),
      time: dateTime_(new Date())
    });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return output_(p.prefix, {
      ok: false,
      service: 'Furkinans',
      version: FURKINANS_VERSION,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function doPost(e) {
  try {
    const text = e && e.postData ? e.postData.contents : '';
    if (!text) return json_({ ok: false, error: 'empty_body' });
    const body = JSON.parse(text);
    const action = String(body.action || '');

    if (action === 'sync') {
      withLock_(15000, function() { syncPayload_(body); });
      return json_({ ok: true, action: 'sync', version: FURKINANS_VERSION, reminder_trigger_ready: hasReminderTrigger_() });
    }

    if (action === 'test') {
      const user = verifyUser_(body.installation_id, body.device_secret);
      const chatId = String(user.values[2] || '').trim();
      if (!chatId) return json_({ ok: false, error: 'telegram_not_linked' });
      const sent = sendTelegram_(chatId, '✅ Furkinans test mesajı\n\nBu cihaz için Telegram bağlantısı çalışıyor.');
      return json_({ ok: sent, action: 'test', error: sent ? '' : 'telegram_send_failed' });
    }

    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function syncPayload_(body) {
  const installationId = installationId_(body.installation_id);
  const secret = String(body.device_secret || '').trim();
  if (!installationId || !secret) throw new Error('missing_installation_or_secret');

  const ss = ensureDatabase_();
  const users = ss.getSheetByName(USERS_SHEET);
  const records = ss.getSheetByName(RECORDS_SHEET);
  const values = users.getDataRange().getValues();
  const row = findRow_(values, 0, installationId);
  const settings = body.settings || {};
  const now = new Date();
  const secretHash = hash_(secret);
  const pairCode = pairCode_(settings.pair_code || body.pair_code || randomPairCode_());
  const pairExpires = now.getTime() + PAIR_TTL_MS;

  if (row < 0) {
    users.appendRow([
      installationId, secretHash, '', '', '', pairCode, pairExpires,
      boolInt_(settings.enabled, false), int_(settings.weekday,0,6,6), int_(settings.hour,0,23,12), int_(settings.minute,0,59,0),
      int_(settings.lookahead_days,1,60,7), int_(settings.lookback_days,0,60,2),
      int_(settings.daily_hour,0,23,22), int_(settings.daily_minute,0,59,0), dateTime_(now), '', '', String(body.app_version || FURKINANS_VERSION)
    ]);
  } else {
    const old = values[row];
    if (String(old[1] || '') && String(old[1] || '') !== secretHash) throw new Error('device_secret_mismatch');
    users.getRange(row + 1, 1, 1, USER_HEADERS.length).setValues([[
      installationId, secretHash, old[2] || '', old[3] || '', old[4] || '', pairCode, pairExpires,
      boolInt_(settings.enabled, false), int_(settings.weekday,0,6,6), int_(settings.hour,0,23,12), int_(settings.minute,0,59,0),
      int_(settings.lookahead_days,1,60,7), int_(settings.lookback_days,0,60,2),
      int_(settings.daily_hour,0,23,22), int_(settings.daily_minute,0,59,0), dateTime_(now),
      old[16] || '', old[17] || '', String(body.app_version || old[18] || FURKINANS_VERSION)
    ]]);
  }

  replaceRecords_(records, installationId, Array.isArray(body.records) ? body.records : []);

  try {
    ensureMinuteTrigger_();
  } catch (err) {
    console.error('Reminder trigger could not be ensured: ' + String(err && err.message ? err.message : err));
  }
}

function replaceRecords_(sheet, installationId, incoming) {
  const current = sheet.getDataRange().getValues();
  const rows = [RECORD_HEADERS];

  for (let i = 1; i < current.length; i++) {
    if (String(current[i][0] || '') !== installationId) rows.push(current[i]);
  }

  incoming.slice(0, 500).forEach(function(r) {
    const id = String(r && r.id || '').trim();
    const name = String(r && r.account_name || '').trim();
    const date = isoDate_(r && r.date);
    if (!id || !name || !date) return;
    rows.push([
      installationId,
      id,
      name,
      String(r.date_type || '') === 'statement' ? 'statement' : 'due',
      date,
      String(r.description || '').trim(),
      boolInt_(r.paid, false),
      isoDate_(r.paid_at),
      String(r.updated_at || dateTime_(new Date()))
    ]);
  });

  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, RECORD_HEADERS.length).setValues(rows);
  sheet.setFrozenRows(1);
}

function getPublicStatus_(installationIdValue) {
  const installationId = installationId_(installationIdValue);
  if (!installationId) return { ok: false, error: 'invalid_installation_id', version: FURKINANS_VERSION };

  const ss = ensureDatabase_();
  const users = ss.getSheetByName(USERS_SHEET).getDataRange().getValues();
  const records = ss.getSheetByName(RECORDS_SHEET).getDataRange().getValues();
  const row = findRow_(users, 0, installationId);
  let recordCount = 0;
  let unpaidCount = 0;
  const recordById = {};

  for (let i = 1; i < records.length; i++) {
    if (String(records[i][0] || '') !== installationId) continue;
    recordCount++;
    const recordId = String(records[i][1] || '').trim();
    const paid = truthy_(records[i][6]);
    if (!paid) unpaidCount++;
    if (recordId) recordById[recordId] = { paid: paid };
  }

  const triggerReady = hasReminderTrigger_();
  if (row < 0) return {
    ok: true,
    version: FURKINANS_VERSION,
    found: false,
    telegram_linked: false,
    enabled: false,
    record_count: recordCount,
    unpaid_count: unpaidCount,
    followup_count: 0,
    reminder_trigger_ready: triggerReady,
    server_time: dateTime_(new Date()),
    bot_username: getBotUsername_()
  };

  const u = users[row];
  const followState = parseWeeklyState_(u[16]);
  const activeFollowupCount = followState.ids.filter(function(id) {
    return recordById[id] && !recordById[id].paid;
  }).length;

  return {
    ok: true,
    version: FURKINANS_VERSION,
    found: true,
    telegram_linked: Boolean(String(u[2] || '').trim()),
    enabled: truthy_(u[7]),
    weekday: int_(u[8],0,6,6),
    hour: int_(u[9],0,23,12),
    minute: int_(u[10],0,59,0),
    lookahead_days: int_(u[11],1,60,7),
    lookback_days: int_(u[12],0,60,2),
    daily_hour: int_(u[13],0,23,22),
    daily_minute: int_(u[14],0,59,0),
    updated_at: String(u[15] || ''),
    record_count: recordCount,
    unpaid_count: unpaidCount,
    last_general_notification: followState.date,
    followup_count: activeFollowupCount,
    reminder_trigger_ready: triggerReady,
    server_time: dateTime_(new Date()),
    bot_username: getBotUsername_()
  };
}

function checkReminders() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    processTelegramPairingUpdates_();
    sendScheduledReminders_();
  } finally {
    lock.releaseLock();
  }
}

function sendScheduledReminders_() {
  const ss = ensureDatabase_();
  const usersSheet = ss.getSheetByName(USERS_SHEET);
  const recordsSheet = ss.getSheetByName(RECORDS_SHEET);
  const users = usersSheet.getDataRange().getValues();
  const records = recordsSheet.getDataRange().getValues();
  const byUser = {};

  for (let i = 1; i < records.length; i++) {
    const installationId = String(records[i][0] || '').trim();
    const recordId = String(records[i][1] || '').trim();
    if (!installationId || !recordId) continue;
    if (!byUser[installationId]) byUser[installationId] = [];
    byUser[installationId].push({
      record_id: recordId,
      account_name: String(records[i][2] || ''),
      date_type: String(records[i][3] || 'due'),
      date: isoDate_(records[i][4]),
      description: String(records[i][5] || ''),
      paid: truthy_(records[i][6])
    });
  }

  const now = new Date();
  const today = dateOnly_(now);
  const currentMinute = Number(Utilities.formatDate(now, TZ, 'H')) * 60 + Number(Utilities.formatDate(now, TZ, 'm'));
  const weekday = mondayIndex_(now);

  for (let i = 1; i < users.length; i++) {
    try {
      const u = users[i];
      const installationId = String(u[0] || '').trim();
      const chatId = String(u[2] || '').trim();
      if (!installationId || !chatId || !truthy_(u[7])) continue;

      const weeklyDay = int_(u[8],0,6,6);
      const weeklyMinute = int_(u[9],0,23,12) * 60 + int_(u[10],0,59,0);
      const lookahead = int_(u[11],1,60,7);
      const lookback = int_(u[12],0,60,2);
      const dailyMinute = int_(u[13],0,23,22) * 60 + int_(u[14],0,59,0);
      const all = byUser[installationId] || [];
      const recordById = {};
      all.forEach(function(r) { recordById[r.record_id] = r; });

      let followState = parseWeeklyState_(u[16]);

      if (weekday === weeklyDay && dueMinute_(currentMinute, weeklyMinute) && followState.date !== today) {
        const windowRecords = all.filter(function(r) {
          if (r.paid || !r.date) return false;
          const d = diffDays_(today, r.date);
          return isFinite(d) && d >= -lookback && d <= lookahead;
        });

        const previousActiveIds = followState.ids.filter(function(id) {
          const r = recordById[id];
          return r && !r.paid;
        });
        const currentWindowIds = windowRecords.map(function(r) { return r.record_id; });
        const followupIds = uniqueIds_(previousActiveIds.concat(currentWindowIds));
        const currentWindowMap = {};
        currentWindowIds.forEach(function(id) { currentWindowMap[id] = true; });
        const carriedCount = previousActiveIds.filter(function(id) { return !currentWindowMap[id]; }).length;

        if (sendTelegram_(chatId, weeklyMessage_(windowRecords, lookahead, lookback, today, carriedCount))) {
          followState = { date: today, ids: followupIds };
          usersSheet.getRange(i + 1, 17).setValue(encodeWeeklyState_(today, followupIds));
        }
      }

      const daysAfterGeneral = followState.date ? diffDays_(followState.date, today) : 0;
      if (daysAfterGeneral > 0 && dueMinute_(currentMinute, dailyMinute) && String(u[17] || '') !== today) {
        const activeIds = followState.ids.filter(function(id) {
          const r = recordById[id];
          return r && !r.paid;
        });
        const dailyRecords = activeIds.map(function(id) { return recordById[id]; }).filter(Boolean);

        if (activeIds.length !== followState.ids.length) {
          followState = { date: followState.date, ids: activeIds };
          usersSheet.getRange(i + 1, 17).setValue(encodeWeeklyState_(followState.date, activeIds));
        }

        if (!dailyRecords.length || sendTelegram_(chatId, dailyMessage_(dailyRecords, today))) {
          usersSheet.getRange(i + 1, 18).setValue(today);
        }
      }
    } catch (err) {
      console.error('Reminder error row ' + (i + 1) + ': ' + String(err && err.stack ? err.stack : err));
    }
  }
}

function weeklyMessage_(records, lookahead, lookback, today, carriedCount) {
  const lines = [
    '📌 Furkinans genel ödeme bildirimi',
    '',
    'Geçmiş ' + lookback + ' gün / gelecek ' + lookahead + ' gün:',
    ''
  ];

  if (!records.length) {
    lines.push('Bu aralıkta bekleyen ödeme görünmüyor.');
  } else {
    records.sort(function(a,b){ return a.date.localeCompare(b.date); });
    lines.push('Bekleyen ödeme: ' + records.length);
    lines.push('');
    records.forEach(function(r) {
      const d = diffDays_(today, r.date);
      lines.push('• ' + r.account_name + ' — ' + prettyType_(r.date_type) + ': ' + prettyDate_(r.date) + ' (' + relativeLabel_(d) + ')');
      if (r.description) lines.push('  ' + r.description);
    });
  }

  if (carriedCount > 0) {
    lines.push('');
    lines.push('↻ Önceki genel bildirimlerden ödenmemiş ' + carriedCount + ' kayıt günlük takipte kalıyor.');
  }

  lines.push('');
  lines.push('Bu bildirimdeki ödenmemiş kayıtlar, yarından itibaren günlük bildirim saatinde ödeme yapılana kadar hatırlatılır.');
  return lines.join('\n');
}

function dailyMessage_(records, today) {
  const lines = [
    '🔔 Furkinans günlük ödeme hatırlatması',
    '',
    'Genel bildirimden kalan ödenmemiş ödeme: ' + records.length,
    ''
  ];

  records.sort(function(a,b){ return a.date.localeCompare(b.date); });
  records.forEach(function(r) {
    lines.push('• ' + r.account_name + ' — ' + prettyType_(r.date_type) + ': ' + prettyDate_(r.date) + ' (' + relativeLabel_(diffDays_(today, r.date)) + ')');
  });
  lines.push('', 'Ödeme yapınca uygulamada durumu Ödendi olarak değiştir.');
  return lines.join('\n');
}

function processTelegramPairingUpdates_() {
  const props = PropertiesService.getScriptProperties();
  const offset = Number(props.getProperty('TELEGRAM_UPDATE_OFFSET') || '0');
  const data = telegramApi_('getUpdates?timeout=0&offset=' + offset);
  if (!data.ok || !Array.isArray(data.result)) return;

  const sheet = ensureDatabase_().getSheetByName(USERS_SHEET);
  const users = sheet.getDataRange().getValues();
  let nextOffset = offset;

  data.result.forEach(function(update) {
    nextOffset = Math.max(nextOffset, Number(update.update_id || 0) + 1);
    const msg = update.message;
    if (!msg || !msg.text) return;
    const match = String(msg.text).trim().match(/^\/start(?:\s+(.+))?$/i);
    if (!match) return;
    const code = pairCode_(match[1] || '');
    if (!code) return;

    for (let i = 1; i < users.length; i++) {
      if (code !== pairCode_(users[i][5]) || expired_(users[i][6])) continue;
      sheet.getRange(i + 1, 3, 1, 5).setValues([[
        String(msg.chat.id),
        String(msg.from && msg.from.username || ''),
        String(msg.from && msg.from.first_name || ''),
        '',
        ''
      ]]);
      sendTelegram_(String(msg.chat.id), '✅ Furkinans bağlantısı tamamlandı.\n\nBu Telegram hesabı artık bu cihazın bildirimlerini alacak.');
      break;
    }
  });

  props.setProperty('TELEGRAM_UPDATE_OFFSET', String(nextOffset));
}

function verifyUser_(installationIdValue, secret) {
  const installationId = installationId_(installationIdValue);
  const values = ensureDatabase_().getSheetByName(USERS_SHEET).getDataRange().getValues();
  const row = findRow_(values, 0, installationId);
  if (row < 0) throw new Error('installation_not_found');
  if (String(values[row][1] || '') !== hash_(String(secret || '').trim())) throw new Error('device_secret_mismatch');
  return { values: values[row], row: row + 1 };
}

function ensureDatabase_() {
  const ss = getDatabase_();
  ensureSheet_(ss, USERS_SHEET, USER_HEADERS);
  ensureSheet_(ss, RECORDS_SHEET, RECORD_HEADERS);
  return ss;
}

function getDatabase_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FURKINANS_DB_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      console.warn('Eski DB açılamadı, yeni DB oluşturuluyor.');
    }
  }
  const ss = SpreadsheetApp.create('Furkinans Database v1.2');
  props.setProperty('FURKINANS_DB_ID', ss.getId());
  return ss;
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (!sheet.getLastRow()) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const current = sheet.getRange(1,1,1,headers.length).getValues()[0];
  const compatible = headers.every(function(h,i){ return String(current[i] || '') === h; });
  if (compatible) return sheet;

  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmmss');
  sheet.setName(name + '_Legacy_' + stamp);
  sheet = ss.insertSheet(name);
  sheet.getRange(1,1,1,headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function hasReminderTrigger_() {
  try {
    return ScriptApp.getProjectTriggers().some(function(t) {
      return t.getHandlerFunction() === 'checkReminders';
    });
  } catch (err) {
    console.error('Trigger status check failed: ' + String(err && err.message ? err.message : err));
    return false;
  }
}

function ensureMinuteTrigger_() {
  const triggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'checkReminders';
  });

  if (!triggers.length) {
    ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(1).create();
    return true;
  }

  for (let i = 1; i < triggers.length; i++) {
    try { ScriptApp.deleteTrigger(triggers[i]); } catch (_) {}
  }
  return true;
}

function initializeTelegramOffset_() {
  const props = PropertiesService.getScriptProperties();
  const data = telegramApi_('getUpdates?timeout=0');
  if (!data.ok || !Array.isArray(data.result)) return;
  let next = 0;
  data.result.forEach(function(u){ next = Math.max(next, Number(u.update_id || 0) + 1); });
  props.setProperty('TELEGRAM_UPDATE_OFFSET', String(next));
}

function sendTelegram_(chatId, text) {
  const url = 'https://api.telegram.org/bot' + getBotToken_() + '/sendMessage';
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chatId, text: text })
  });
  const data = JSON.parse(response.getContentText() || '{}');
  if (!data.ok) {
    console.error('Telegram send failed: ' + response.getContentText());
    return false;
  }
  return true;
}

function telegramApi_(path) {
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + getBotToken_() + '/' + path, { muteHttpExceptions: true });
  return JSON.parse(response.getContentText() || '{}');
}

function getBotToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('missing_bot_token');
  return token;
}

function getBotUsername_() {
  return String(PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_USERNAME') || '').replace(/^@/, '');
}

function withLock_(timeout, fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(timeout);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function output_(prefix, obj) {
  const p = String(prefix || '').trim();
  if (/^[A-Za-z_$][A-Za-z0-9_$]{0,80}$/.test(p)) {
    return ContentService.createTextOutput(p + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(obj);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function installationId_(v) {
  const s = String(v || '').trim();
  return /^[A-Za-z0-9_-]{8,120}$/.test(s) ? s : '';
}

function pairCode_(v) {
  return String(v || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0,20);
}

function randomPairCode_() {
  return Utilities.getUuid().replace(/-/g,'').slice(0,8).toUpperCase();
}

function isoDate_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, TZ, 'yyyy-MM-dd');
  return '';
}

function dateOnly_(d) {
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}

function dateTime_(d) {
  return Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function prettyDate_(v) {
  const s = isoDate_(v);
  return s ? s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4) : String(v || '');
}

function prettyType_(v) {
  return String(v || '') === 'statement' ? 'Hesap Kesim' : 'Son Ödeme';
}

function diffDays_(fromIso, toIso) {
  const from = isoDate_(fromIso);
  const to = isoDate_(toIso);
  if (!from || !to) return NaN;
  return Math.round((new Date(to+'T00:00:00Z') - new Date(from+'T00:00:00Z')) / 86400000);
}

function dueMinute_(currentMinute, targetMinute) {
  return currentMinute >= targetMinute && currentMinute <= targetMinute + DELIVERY_GRACE_MINUTES;
}

function mondayIndex_(d) {
  return Number(Utilities.formatDate(d, TZ, 'u')) - 1;
}

function relativeLabel_(d) {
  return d < 0 ? Math.abs(d)+' gün geçti' : d === 0 ? 'bugün' : d+' gün kaldı';
}

function findRow_(rows, col, value) {
  for (let i=1;i<rows.length;i++) {
    if (String(rows[i][col] || '') === value) return i;
  }
  return -1;
}

function int_(v,min,max,fallback) {
  const n=Number(v);
  return isFinite(n) ? Math.min(max,Math.max(min,Math.round(n))) : fallback;
}

function truthy_(v) {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

function boolInt_(v,fallback) {
  return truthy_(v === undefined || v === null || v === '' ? fallback : v) ? 1 : 0;
}

function expired_(v) {
  const n=Number(v);
  if (isFinite(n) && n>0) return n < Date.now();
  const d=new Date(String(v || ''));
  return isNaN(d.getTime()) || d.getTime() < Date.now();
}

function uniqueIds_(ids) {
  const seen = {};
  const out = [];
  (ids || []).forEach(function(id) {
    const value = String(id || '').trim();
    if (!value || seen[value]) return;
    seen[value] = true;
    out.push(value);
  });
  return out;
}

function parseWeeklyState_(value) {
  const raw = String(value || '').trim();
  if (!raw) return { date: '', ids: [] };
  const splitAt = raw.indexOf('|');
  if (splitAt < 0) return { date: isoDate_(raw), ids: [] };
  const date = isoDate_(raw.slice(0, splitAt));
  const idsPart = raw.slice(splitAt + 1);
  const ids = idsPart ? idsPart.split(',').map(function(part) {
    try {
      return decodeURIComponent(part);
    } catch (_) {
      return part;
    }
  }) : [];
  return { date: date, ids: uniqueIds_(ids) };
}

function encodeWeeklyState_(date, ids) {
  const cleanDate = isoDate_(date);
  const cleanIds = uniqueIds_(ids);
  return cleanDate + '|' + cleanIds.map(function(id) { return encodeURIComponent(id); }).join(',');
}

function hash_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    const n=(b+256)%256;
    return ('0'+n.toString(16)).slice(-2);
  }).join('');
}