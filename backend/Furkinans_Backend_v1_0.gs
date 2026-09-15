/**
 * Furkinans Backend v1.0
 * Google Apps Script - standalone project
 *
 * Required Script Properties:
 * - TELEGRAM_BOT_TOKEN      -> BotFather token
 * - TELEGRAM_BOT_USERNAME   -> bot username without @ (recommended)
 *
 * Optional / persistent Script Properties:
 * - FURKINANS_DB_ID         -> existing Google Sheet id (if empty, created automatically)
 * - TELEGRAM_UPDATE_OFFSET  -> last processed Telegram update id
 */

const FURKINANS_VERSION = '1.0';
const TZ = 'Europe/Istanbul';
const USERS_SHEET = 'Users';
const RECORDS_SHEET = 'Records';
const PAIR_CODE_TTL_MINUTES = 30;
const WINDOW_TOLERANCE_MINUTES = 10;

const USER_HEADERS = [
  'installation_id',
  'device_secret_hash',
  'telegram_chat_id',
  'telegram_username',
  'telegram_name',
  'pair_code',
  'pair_expires_at',
  'enabled',
  'weekday',
  'hour',
  'minute',
  'lookahead_days',
  'lookback_days',
  'daily_hour',
  'daily_minute',
  'updated_at',
  'last_weekly_sent_key',
  'last_daily_sent_key',
  'app_version'
];

const RECORD_HEADERS = [
  'installation_id',
  'record_id',
  'account_name',
  'date_type',
  'date',
  'description',
  'paid',
  'paid_at',
  'updated_at'
];

function setupFurkinansV1() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TELEGRAM_BOT_TOKEN')) {
    throw new Error('Script Property TELEGRAM_BOT_TOKEN eksik.');
  }
  ensureDatabase_();
  ensureMinuteTrigger_();
  initializeTelegramOffset_();
  const db = getDatabase_();
  console.log('Furkinans v1.0 veritabanı: ' + db.getUrl());
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '');

  if (action === 'config') {
    return renderJsonMaybeJsonp_(params.prefix, {
      ok: true,
      service: 'Furkinans',
      version: FURKINANS_VERSION,
      bot_username: getBotUsername_()
    });
  }

  if (action === 'status') {
    return renderJsonMaybeJsonp_(params.prefix, getPublicStatus_(params.installation_id));
  }

  return renderJsonMaybeJsonp_(params.prefix, {
    ok: true,
    service: 'Furkinans',
    version: FURKINANS_VERSION,
    status: 'online',
    time: formatDateTime_(new Date())
  });
}

function doPost(e) {
  try {
    const payloadText = e && e.postData ? e.postData.contents : '';
    if (!payloadText) return json_({ ok: false, error: 'empty_body' });
    const body = JSON.parse(payloadText);
    const action = String(body.action || '');

    if (action === 'sync') {
      syncPayload_(body);
      return json_({ ok: true, action: 'sync' });
    }

    if (action === 'test') {
      const user = verifyUser_(body.installation_id, body.device_secret);
      const chatId = String(user.values[2] || '').trim();
      if (!chatId) return json_({ ok: false, error: 'telegram_not_linked' });
      sendTelegram_(chatId,
        '✅ Furkinans test mesajı\n\n' +
        'Bu cihaz için Telegram bağlantısı çalışıyor.'
      );
      return json_({ ok: true, action: 'test' });
    }

    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function syncPayload_(body) {
  const installationId = sanitizeInstallationId_(body.installation_id);
  const deviceSecret = String(body.device_secret || '').trim();
  if (!installationId || !deviceSecret) throw new Error('missing_installation_or_secret');

  const ss = getDatabase_();
  const usersSheet = ss.getSheetByName(USERS_SHEET);
  const recordsSheet = ss.getSheetByName(RECORDS_SHEET);
  const userData = usersSheet.getDataRange().getValues();
  const userHash = hashText_(deviceSecret);
  const settings = body.settings || {};
  const now = new Date();
  const nowText = formatDateTime_(now);
  const pairCode = sanitizePairCode_(settings.pair_code || body.pair_code || generatePairCode_());
  const pairExpiresAt = formatDateTime_(new Date(now.getTime() + PAIR_CODE_TTL_MINUTES * 60 * 1000));
  const botUsername = getBotUsername_();

  let rowIndex = findRowIndex_(userData, 0, installationId);
  if (rowIndex === -1) {
    usersSheet.appendRow([
      installationId,
      userHash,
      '',
      '',
      '',
      pairCode,
      pairExpiresAt,
      toBoolInt_(settings.enabled, false),
      clampInt_(settings.weekday, 0, 6, 6),
      clampInt_(settings.hour, 0, 23, 12),
      clampInt_(settings.minute, 0, 59, 0),
      clampInt_(settings.lookahead_days, 1, 60, 7),
      clampInt_(settings.lookback_days, 0, 60, 2),
      clampInt_(settings.daily_hour, 0, 23, 22),
      clampInt_(settings.daily_minute, 0, 59, 0),
      nowText,
      '',
      '',
      String(body.app_version || '1.0')
    ]);
  } else {
    const rowNumber = rowIndex;
    const existing = userData[rowIndex - 1];
    if (String(existing[1] || '') && String(existing[1] || '') !== userHash) {
      throw new Error('device_secret_mismatch');
    }
    const rowValues = [[
      installationId,
      userHash,
      existing[2] || '',
      existing[3] || '',
      existing[4] || '',
      pairCode,
      pairExpiresAt,
      toBoolInt_(settings.enabled, false),
      clampInt_(settings.weekday, 0, 6, 6),
      clampInt_(settings.hour, 0, 23, 12),
      clampInt_(settings.minute, 0, 59, 0),
      clampInt_(settings.lookahead_days, 1, 60, 7),
      clampInt_(settings.lookback_days, 0, 60, 2),
      clampInt_(settings.daily_hour, 0, 23, 22),
      clampInt_(settings.daily_minute, 0, 59, 0),
      nowText,
      existing[16] || '',
      existing[17] || '',
      String(body.app_version || existing[18] || '1.0')
    ]];
    usersSheet.getRange(rowNumber, 1, 1, USER_HEADERS.length).setValues(rowValues);
  }

  replaceInstallationRecords_(recordsSheet, installationId, body.records || []);

  return {
    ok: true,
    bot_username: botUsername
  };
}

function replaceInstallationRecords_(sheet, installationId, rawRecords) {
  const rows = sheet.getDataRange().getValues();
  const keep = [RECORD_HEADERS];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '') !== installationId) keep.push(rows[i]);
  }
  const cleaned = [];
  for (let i = 0; i < rawRecords.length; i++) {
    const r = rawRecords[i] || {};
    const recordId = String(r.id || '').trim();
    const accountName = String(r.account_name || '').trim();
    const date = normalizeDateInput_(r.date);
    if (!recordId || !accountName || !date) continue;
    cleaned.push([
      installationId,
      recordId,
      accountName,
      String(r.date_type || 'due') === 'statement' ? 'statement' : 'due',
      date,
      String(r.description || '').trim(),
      toBoolInt_(r.paid, false),
      normalizeDateInput_(r.paid_at),
      String(r.updated_at || formatDateTime_(new Date()))
    ]);
  }
  const finalRows = keep.concat(cleaned);
  sheet.clearContents();
  sheet.getRange(1, 1, finalRows.length, RECORD_HEADERS.length).setValues(finalRows);
}

function getPublicStatus_(installationIdValue) {
  const installationId = sanitizeInstallationId_(installationIdValue);
  if (!installationId) return { ok: false, error: 'invalid_installation_id', version: FURKINANS_VERSION };

  const ss = getDatabase_();
  const usersSheet = ss.getSheetByName(USERS_SHEET);
  const recordsSheet = ss.getSheetByName(RECORDS_SHEET);
  const botUsername = getBotUsername_();

  const users = usersSheet.getDataRange().getValues();
  let user = null;
  for (let i = 1; i < users.length; i++) {
    if (String(users[i][0] || '') === installationId) {
      user = users[i];
      break;
    }
  }

  let recordCount = 0;
  let unpaidCount = 0;
  const records = recordsSheet.getDataRange().getValues();
  for (let i = 1; i < records.length; i++) {
    if (String(records[i][0] || '') !== installationId) continue;
    recordCount += 1;
    if (!isTruthy_(records[i][6])) unpaidCount += 1;
  }

  if (!user) {
    return {
      ok: true,
      version: FURKINANS_VERSION,
      found: false,
      telegram_linked: false,
      enabled: false,
      record_count: recordCount,
      unpaid_count: unpaidCount,
      bot_username: botUsername
    };
  }

  return {
    ok: true,
    version: FURKINANS_VERSION,
    found: true,
    telegram_linked: Boolean(String(user[2] || '').trim()),
    enabled: isTruthy_(user[7]),
    weekday: clampInt_(user[8], 0, 6, 6),
    hour: clampInt_(user[9], 0, 23, 12),
    minute: clampInt_(user[10], 0, 59, 0),
    lookahead_days: clampInt_(user[11], 1, 60, 7),
    lookback_days: clampInt_(user[12], 0, 60, 2),
    daily_hour: clampInt_(user[13], 0, 23, 22),
    daily_minute: clampInt_(user[14], 0, 59, 0),
    updated_at: String(user[15] || ''),
    record_count: recordCount,
    unpaid_count: unpaidCount,
    bot_username: botUsername
  };
}

function checkReminders() {
  try {
    processTelegramPairingUpdates_();
  } catch (err) {
    console.error('pairing error: ' + err);
  }

  const ss = getDatabase_();
  const usersSheet = ss.getSheetByName(USERS_SHEET);
  const recordsSheet = ss.getSheetByName(RECORDS_SHEET);
  const userRows = usersSheet.getDataRange().getValues();
  const recordRows = recordsSheet.getDataRange().getValues();
  const byInstallation = {};

  for (let i = 1; i < recordRows.length; i++) {
    const r = recordRows[i];
    const installationId = String(r[0] || '');
    if (!installationId) continue;
    if (!byInstallation[installationId]) byInstallation[installationId] = [];
    byInstallation[installationId].push({
      id: String(r[1] || ''),
      account_name: String(r[2] || ''),
      date_type: String(r[3] || 'due'),
      date: String(r[4] || ''),
      description: String(r[5] || ''),
      paid: isTruthy_(r[6]),
      paid_at: String(r[7] || '')
    });
  }

  const now = new Date();
  const today = formatDate_(now);
  const hour = Number(Utilities.formatDate(now, TZ, 'H'));
  const minute = Number(Utilities.formatDate(now, TZ, 'm'));
  const weekday = toMondayIndex_(now);
  const nowMins = hour * 60 + minute;

  for (let i = 1; i < userRows.length; i++) {
    const row = userRows[i];
    const installationId = String(row[0] || '');
    const chatId = String(row[2] || '').trim();
    if (!installationId || !chatId || !isTruthy_(row[7])) continue;

    const lookahead = clampInt_(row[11], 1, 60, 7);
    const lookback = clampInt_(row[12], 0, 60, 2);
    const weeklyDay = clampInt_(row[8], 0, 6, 6);
    const weeklyMins = clampInt_(row[9], 0, 23, 12) * 60 + clampInt_(row[10], 0, 59, 0);
    const dailyMins = clampInt_(row[13], 0, 23, 22) * 60 + clampInt_(row[14], 0, 59, 0);
    const lastWeeklyKey = String(row[16] || '');
    const lastDailyKey = String(row[17] || '');
    const records = byInstallation[installationId] || [];

    const windowRecords = records.filter(function(rec) {
      if (rec.paid) return false;
      const diff = dateDiffDays_(today, rec.date);
      return diff <= lookahead && diff >= -lookback;
    });

    const dailyRecords = records.filter(function(rec) {
      if (rec.paid) return false;
      return dateDiffDays_(today, rec.date) <= lookahead;
    });

    if (weekday === weeklyDay && withinWindow_(nowMins, weeklyMins) && lastWeeklyKey !== today) {
      const message = buildWeeklyMessage_(windowRecords, lookahead, lookback);
      sendTelegram_(chatId, message);
      usersSheet.getRange(i + 1, 17).setValue(today);
    }

    if (weekday !== weeklyDay && withinWindow_(nowMins, dailyMins) && lastDailyKey !== today && dailyRecords.length) {
      const message = buildDailyMessage_(dailyRecords);
      sendTelegram_(chatId, message);
      usersSheet.getRange(i + 1, 18).setValue(today);
    }
  }
}

function buildWeeklyMessage_(records, lookahead, lookback) {
  const lines = [];
  lines.push('📌 Furkinans haftalık özet');
  lines.push('');
  lines.push('İleri ' + lookahead + ' gün ve geçmiş ' + lookback + ' gün için kontrol:');
  lines.push('');
  if (!records.length) {
    lines.push('Bu aralıkta bekleyen ödeme görünmüyor.');
    return lines.join('\n');
  }
  records.sort(function(a, b) { return String(a.date).localeCompare(String(b.date)); });
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const diff = dateDiffDays_(formatDate_(new Date()), r.date);
    const label = diff < 0 ? Math.abs(diff) + ' gün geçti' : diff === 0 ? 'bugün' : diff + ' gün kaldı';
    lines.push('• ' + r.account_name + ' — ' + prettyType_(r.date_type) + ': ' + prettyDate_(r.date) + ' (' + label + ')');
    if (r.description) lines.push('  ' + r.description);
  }
  return lines.join('\n');
}

function buildDailyMessage_(records) {
  const lines = [];
  lines.push('🔔 Furkinans günlük hatırlatma');
  lines.push('');
  lines.push('Aşağıdaki kayıtlar hâlâ ödendi olarak işaretlenmedi:');
  lines.push('');
  records.sort(function(a, b) { return String(a.date).localeCompare(String(b.date)); });
  const today = formatDate_(new Date());
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const diff = dateDiffDays_(today, r.date);
    const label = diff < 0 ? Math.abs(diff) + ' gün geçti' : diff === 0 ? 'bugün' : diff + ' gün kaldı';
    lines.push('• ' + r.account_name + ' — ' + prettyDate_(r.date) + ' (' + label + ')');
  }
  lines.push('');
  lines.push('Ödeme yapınca uygulamada durumu Ödendi olarak değiştir.');
  return lines.join('\n');
}

function processTelegramPairingUpdates_() {
  const token = getBotToken_();
  const props = PropertiesService.getScriptProperties();
  const offset = Number(props.getProperty('TELEGRAM_UPDATE_OFFSET') || '0');
  const url = 'https://api.telegram.org/bot' + token + '/getUpdates?timeout=0&offset=' + offset;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const json = JSON.parse(response.getContentText());
  if (!json.ok || !json.result) return;

  const ss = getDatabase_();
  const usersSheet = ss.getSheetByName(USERS_SHEET);
  const values = usersSheet.getDataRange().getValues();
  let maxUpdateId = offset;

  for (let i = 0; i < json.result.length; i++) {
    const update = json.result[i];
    maxUpdateId = Math.max(maxUpdateId, Number(update.update_id || 0) + 1);
    const msg = update.message;
    if (!msg || !msg.text) continue;
    const text = String(msg.text).trim();
    const match = text.match(/^\/start(?:\s+(.+))?$/i);
    if (!match) continue;
    const pairCode = sanitizePairCode_(match[1] || '');
    if (!pairCode) continue;

    for (let row = 1; row < values.length; row++) {
      const user = values[row];
      const userPairCode = sanitizePairCode_(user[5]);
      const expires = String(user[6] || '');
      if (pairCode !== userPairCode || isExpired_(expires)) continue;
      usersSheet.getRange(row + 1, 3, 1, 5).setValues([[
        String(msg.chat.id),
        msg.from && msg.from.username ? String(msg.from.username) : '',
        msg.from && msg.from.first_name ? String(msg.from.first_name) : '',
        '',
        ''
      ]]);
      sendTelegram_(String(msg.chat.id),
        '✅ Furkinans bağlantısı tamamlandı.\n\n' +
        'Bu Telegram hesabı artık bu cihazın bildirimlerini alacak.'
      );
      break;
    }
  }

  props.setProperty('TELEGRAM_UPDATE_OFFSET', String(maxUpdateId));
}

function verifyUser_(installationIdValue, deviceSecret) {
  const installationId = sanitizeInstallationId_(installationIdValue);
  const hash = hashText_(String(deviceSecret || '').trim());
  const ss = getDatabase_();
  const sheet = ss.getSheetByName(USERS_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '') !== installationId) continue;
    if (String(values[i][1] || '') !== hash) throw new Error('device_secret_mismatch');
    return { sheet: sheet, row: i + 1, values: values[i] };
  }
  throw new Error('installation_not_found');
}

function getDatabase_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('FURKINANS_DB_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      console.error('Saved DB could not be opened, creating a new one.');
    }
  }
  const ss = SpreadsheetApp.create('Furkinans Database');
  props.setProperty('FURKINANS_DB_ID', ss.getId());
  return ss;
}

function ensureDatabase_() {
  const ss = getDatabase_();
  let usersSheet = ss.getSheetByName(USERS_SHEET);
  if (!usersSheet) usersSheet = ss.insertSheet(USERS_SHEET);
  let recordsSheet = ss.getSheetByName(RECORDS_SHEET);
  if (!recordsSheet) recordsSheet = ss.insertSheet(RECORDS_SHEET);
  ensureSheetHeaders_(usersSheet, USER_HEADERS);
  ensureSheetHeaders_(recordsSheet, RECORD_HEADERS);
}

function ensureSheetHeaders_(sheet, headers) {
  const existing = sheet.getLastRow() ? sheet.getRange(1, 1, 1, headers.length).getValues()[0] : [];
  let needsWrite = false;
  for (let i = 0; i < headers.length; i++) {
    if (String(existing[i] || '') !== headers[i]) {
      needsWrite = true;
      break;
    }
  }
  if (needsWrite || !sheet.getLastRow()) {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function ensureMinuteTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(function(t) {
    return t.getHandlerFunction() === 'checkReminders';
  });
  if (!exists) {
    ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(1).create();
  }
}

function initializeTelegramOffset_() {
  const props = PropertiesService.getScriptProperties();
  const token = getBotToken_();
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates?timeout=0', { muteHttpExceptions: true });
  const json = JSON.parse(response.getContentText());
  if (!json.ok || !json.result) return;
  let nextOffset = 0;
  for (let i = 0; i < json.result.length; i++) {
    nextOffset = Math.max(nextOffset, Number(json.result[i].update_id || 0) + 1);
  }
  props.setProperty('TELEGRAM_UPDATE_OFFSET', String(nextOffset));
}

function sendTelegram_(chatId, text) {
  const token = getBotToken_();
  const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chatId, text: text })
  });
}

function getBotToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('missing_bot_token');
  return token;
}

function getBotUsername_() {
  return String(PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_USERNAME') || '').replace(/^@/, '');
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function formatDate_(date) {
  return Utilities.formatDate(date, TZ, 'yyyy-MM-dd');
}

function prettyDate_(value) {
  const v = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return v.substring(8, 10) + '.' + v.substring(5, 7) + '.' + v.substring(0, 4);
}

function prettyType_(value) {
  return String(value || '') === 'statement' ? 'Hesap Kesim' : 'Son Ödeme';
}

function renderJsonMaybeJsonp_(prefix, obj) {
  const safePrefix = sanitizeJsonpPrefix_(prefix);
  if (safePrefix) {
    return ContentService.createTextOutput(safePrefix + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(obj);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizeJsonpPrefix_(value) {
  const s = String(value || '').trim();
  return /^[A-Za-z_$][A-Za-z0-9_$]{0,80}$/.test(s) ? s : '';
}

function sanitizeInstallationId_(value) {
  const s = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,120}$/.test(s) ? s : '';
}

function sanitizePairCode_(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 20);
}

function generatePairCode_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
}

function normalizeDateInput_(value) {
  const s = String(value || '').substring(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function dateDiffDays_(fromDateIso, toDateIso) {
  const from = new Date(fromDateIso + 'T00:00:00Z');
  const to = new Date(toDateIso + 'T00:00:00Z');
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function withinWindow_(currentMins, targetMins) {
  return Math.abs(currentMins - targetMins) <= WINDOW_TOLERANCE_MINUTES;
}

function toMondayIndex_(date) {
  const js = Number(Utilities.formatDate(date, TZ, 'u'));
  return js - 1;
}

function hashText_(text) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  let out = '';
  for (let i = 0; i < digest.length; i++) {
    const byte = (digest[i] + 256) % 256;
    out += ('0' + byte.toString(16)).slice(-2);
  }
  return out;
}

function toBoolInt_(value, fallback) {
  const v = value === undefined || value === null || value === '' ? fallback : value;
  return isTruthy_(v) ? 1 : 0;
}

function isTruthy_(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function clampInt_(value, min, max, fallback) {
  const n = Number(value);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function findRowIndex_(rows, columnIndex, needle) {
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][columnIndex] || '') === needle) return i + 1;
  }
  return -1;
}

function isExpired_(isoText) {
  if (!isoText) return true;
  const d = new Date(String(isoText));
  return !(d instanceof Date) || isNaN(d.getTime()) || d.getTime() < new Date().getTime();
}
