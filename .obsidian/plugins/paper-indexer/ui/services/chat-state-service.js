// State management and discussion helpers for ChatPanelView
const { TFile } = require('obsidian');
const { normalizeMessage } = require('../chat-utils');

class ChatStateService {
    constructor(host) {
        // host is the ChatPanelView instance to access app/plugin, but we keep logic here
        this.host = host;
    }

    // Message operations
    addMessageToHistory(role, content, isTyping = false) {
        if (!content || typeof content !== 'string' || content.trim() === '') return null;
        if (!role || !['user', 'assistant', 'system'].includes(role)) role = 'assistant';
        const hist = this.host.chatHistory;
        if ((role === 'system' || role === 'assistant') && hist.length > 0) {
            const last = hist[hist.length - 1];
            if (last && last.role === role && last.content === content && !last.isTyping) {
                return last.id;
            }
        }
        const messageId = Date.now() + Math.random();
        hist.push({ id: messageId, role, content, timestamp: new Date(), isTyping });
        this.host.renderChatHistory();
        return messageId;
    }

    updateMessageInHistory(messageId, newContent) {
        const msg = this.host.chatHistory.find(m => m.id === messageId);
        if (msg) {
            msg.content = newContent;
            msg.isTyping = false;
            this.host.renderChatHistory();
            this.host.saveConversation();
        }
    }

    deleteMessage(messageId) {
        const idx = this.host.chatHistory.findIndex(m => m.id === messageId);
        if (idx === -1) return;
        this.host._lastDeletedMessage = { message: this.host.chatHistory[idx], index: idx };
        this.host.chatHistory = this.host.chatHistory.filter(m => m.id !== messageId);
        this.host.renderChatHistory();
        this.host.saveConversation();
    }

    // Discussion helpers
    createDiscussion(id, notePath, title = null) {
        const h = this.host;
        return {
            id,
            title: title || h.generateDiscussionTitle(),
            notePath,
            noteName: notePath ? notePath.split('/').pop().replace('.md', '') : 'Unknown',
            state: 'DRAFT',
            startTime: new Date(),
            lastUpdated: new Date(),
            messageCount: h.chatHistory.length,
            history: [...h.chatHistory],
            userMessageHistory: [...h.userMessageHistory],
            includePdfInContext: h.includePdfInContext,
            includeNoteInContext: h.includeNoteInContext,
            includedNotes: this.serializeIncludedNotes()
        };
    }

    serializeIncludedNotes() {
        const out = [];
        for (const [path, data] of this.host.includedNotes.entries()) {
            out.push({
                path,
                name: data.name || path,
                includeInContext: !!data.includeInContext,
                content: typeof data.content === 'string' ? data.content : ''
            });
        }
        return out;
    }

    deserializeIncludedNotes(serializedNotes) {
        this.host.includedNotes.clear();
        if (Array.isArray(serializedNotes)) {
            for (const note of serializedNotes) {
                this.host.includedNotes.set(note.path, {
                    name: note.name || note.path,
                    content: note.content || '',
                    includeInContext: note.includeInContext !== false
                });
            }
        }
    }

    validateDiscussion(d) {
        return d && typeof d.id === 'string' && typeof d.notePath === 'string' && Array.isArray(d.history);
    }

    normalizeHistory(history) {
        return (history || [])
            .map(m => normalizeMessage(m))
            .filter(m => {
                const trimmed = (m.content || '').trim();
                return trimmed.length > 0 && !/^(💭\s*)?Thinking\.\.\.$/i.test(trimmed);
            });
    }

    async loadIncludedNoteEntry(path, file) {
        const h = this.host;
        try {
            const f = file instanceof TFile ? file : h.app.vault.getAbstractFileByPath(path);
            if (!(f instanceof TFile)) return;
            const content = await h.app.vault.read(f);
            h.includedNotes.set(path, { name: f.basename, content, includeInContext: true });
        } catch (err) {
            console.warn('Failed to load included note', path, err);
            this.addMessageToHistory('system', `Failed to include note: ${path}`);
        }
    }
}

module.exports = { ChatStateService };
