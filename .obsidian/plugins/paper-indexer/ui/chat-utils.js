// Small utility helpers for ChatPanelView extracted for clarity and reuse
function generateDiscussionId() {
    return 'discussion_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function safeToString(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    try { return String(v); } catch (_) { return '' }
}

function normalizeMessage(m) {
    const safeRole = ['user', 'assistant', 'system'].includes(m?.role) ? m.role : 'assistant';
    const rawContent = m?.content;
    const content = typeof rawContent === 'string' ? rawContent : safeToString(rawContent);
    let ts = m?.timestamp;
    let dateObj;
    if (ts instanceof Date) {
        dateObj = ts;
    } else if (typeof ts === 'string' && ts) {
        const parsed = new Date(ts);
        dateObj = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else {
        dateObj = new Date();
    }
    return {
        id: m?.id ?? (Date.now() + Math.random()),
        role: safeRole,
        content,
        timestamp: dateObj,
        isTyping: false
    };
}

module.exports = { generateDiscussionId, normalizeMessage, safeToString };
