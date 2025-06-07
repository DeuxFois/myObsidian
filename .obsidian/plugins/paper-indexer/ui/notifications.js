const { Notice } = require('obsidian');

function notify(message) {
    try { new Notice(message); } catch (e) { console.warn('Notice failed:', e); }
}

function notifyError(message, err) {
    try { new Notice(message); } catch (e) { console.warn('Notice failed:', e); }
    if (err) console.error(message, err);
}

function notifyInfo(message) {
    notify(message);
}

module.exports = { notify, notifyError, notifyInfo };
