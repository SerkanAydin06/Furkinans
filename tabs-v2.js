(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function setActive(name) {
    const records = name === 'records';
    const notifications = name === 'notifications';
    const connections = name === 'connections';

    const recordsView = $('recordsView');
    const settingsView = $('settingsView');
    const connectionsView = $('connectionsView');
    const tabRecords = $('tabRecords');
    const tabSettings = $('tabSettings');
    const tabConnections = $('tabConnections');
    const fab = $('addRecordButton');

    if (recordsView) recordsView.classList.toggle('active', records);
    if (settingsView) settingsView.classList.toggle('active', notifications);
    if (connectionsView) connectionsView.classList.toggle('active', connections);

    if (tabRecords) tabRecords.classList.toggle('active', records);
    if (tabSettings) tabSettings.classList.toggle('active', notifications);
    if (tabConnections) tabConnections.classList.toggle('active', connections);
    if (fab) fab.classList.toggle('hidden', !records);
  }

  function splitSettings() {
    const settingsView = $('settingsView');
    if (!settingsView) return;

    let connectionsView = $('connectionsView');
    if (!connectionsView) {
      connectionsView = document.createElement('section');
      connectionsView.id = 'connectionsView';
      connectionsView.className = 'view';
      settingsView.insertAdjacentElement('afterend', connectionsView);
    }

    const cards = Array.from(settingsView.children).filter((el) => el.classList && el.classList.contains('card'));
    const telegramCard = cards.find((card) => card.querySelector('#telegramStatusCard'));
    const installCard = cards.find((card) => card.classList.contains('install-card'));

    if (telegramCard && telegramCard.parentElement !== connectionsView) connectionsView.appendChild(telegramCard);
    if (installCard && installCard.parentElement !== connectionsView) connectionsView.appendChild(installCard);

    const notificationTitle = settingsView.querySelector('h2');
    if (notificationTitle) notificationTitle.textContent = 'Bildirim Ayarları';

    const connectionTitle = connectionsView.querySelector('h2');
    if (connectionTitle) connectionTitle.textContent = 'Bağlantı Ayarları';
  }

  function bindTabs() {
    const tabRecords = $('tabRecords');
    const tabSettings = $('tabSettings');
    const tabConnections = $('tabConnections');

    if (tabSettings) tabSettings.textContent = 'Bildirim Ayarları';

    if (tabRecords) tabRecords.addEventListener('click', () => setActive('records'));
    if (tabSettings) tabSettings.addEventListener('click', () => setActive('notifications'));
    if (tabConnections) tabConnections.addEventListener('click', () => setActive('connections'));
  }

  function init() {
    splitSettings();
    bindTabs();
    setActive('records');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();