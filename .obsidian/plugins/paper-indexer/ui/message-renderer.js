// Renders a single chat message into the provided container.
// Options: { app, ConfirmModal, onDelete }
const { notifyError } = require('./notifications');
function renderMessage(container, message, options = {}) {
    const wrapper = container.createEl('div', { cls: `chat-message-wrapper ${message.role}-message` });
    // Header row with role and timestamp
    const header = wrapper.createEl('div', { cls: 'chat-message-header' });
    header.createEl('div', { cls: 'chat-message-role', text: message.role === 'user' ? 'You' : (message.role === 'assistant' ? 'Assistant' : 'Assistant') });
    const tsText = message.timestamp instanceof Date ? message.timestamp.toLocaleTimeString() : new Date(message.timestamp).toLocaleTimeString();
    header.createEl('div', { cls: 'chat-message-timestamp', text: tsText });

    // Message content area
    const contentEl = wrapper.createEl('div', { cls: 'chat-message-content' });

    // For system/assistant messages, collapse long messages
    if ((message.role === 'system' || message.role === 'assistant') && typeof message.content === 'string' && message.content.length > 240) {
        const shortText = message.content.slice(0, 220) + '...';
        const collapsed = contentEl.createEl('div', { cls: 'collapsed-message' });
        collapsed.createEl('div', { cls: 'collapsed-text', text: shortText });
        const toggle = collapsed.createEl('button', { cls: 'collapse-toggle', text: 'Show more' });
        const full = collapsed.createEl('div', { cls: 'full-text', text: message.content });
        full.style.display = 'none';

        toggle.addEventListener('click', () => {
            const isHidden = full.style.display === 'none';
            full.style.display = isHidden ? 'block' : 'none';
            collapsed.querySelector('.collapsed-text').style.display = isHidden ? 'none' : 'block';
            toggle.textContent = isHidden ? 'Show less' : 'Show more';
        });
    } else {
        contentEl.createEl('div', { cls: 'message-text', text: message.content });
    }

    if (message.isTyping) wrapper.addClass('typing');

    // Right-click context to delete message
    wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        try {
            if (options.ConfirmModal && typeof options.ConfirmModal === 'function') {
                const modal = new options.ConfirmModal(options.app, 'Delete this message?', () => {
                    if (typeof options.onDelete === 'function') options.onDelete(message.id);
                });
                modal.open();
            } else if (typeof options.onDelete === 'function') {
                options.onDelete(message.id);
            }
        } catch (err) {
            notifyError('Failed to show delete confirm, deleting directly', err);
            if (typeof options.onDelete === 'function') options.onDelete(message.id);
        }
    });

    return wrapper;
}

module.exports = { renderMessage };
