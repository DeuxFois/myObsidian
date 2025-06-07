// Persistence and loading of conversations/discussions
const { normalizeMessage } = require('../chat-utils');

class ChatPersistenceService {
    constructor(host) {
        this.host = host; // ChatPanelView instance
    }

    async saveConversation() {
        const h = this.host;
        if (!h.currentNoteFile) return;

        if (h.currentDiscussionId && h.chatHistory.length > 0) {
            await this._saveCurrentDiscussion();
        }

        h.conversations.set(h.currentNoteFile.path, {
            history: h.chatHistory.map(m => ({
                ...m,
                isTyping: false,
                timestamp: (m.timestamp instanceof Date)
                    ? m.timestamp.toISOString()
                    : (m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString())
            })),
            userMessageHistory: [...h.userMessageHistory],
            includePdfInContext: h.includePdfInContext,
            includeNoteInContext: h.includeNoteInContext,
            includedNotes: Array.from(h.includedNotes.entries()).map(([p, e]) => ({
                path: p,
                name: e.name,
                includeInContext: !!e.includeInContext,
                content: typeof e.content === 'string' ? e.content : ''
            })),
            lastUpdated: new Date(),
            currentDiscussionId: h.currentDiscussionId
        });

        if (h.plugin.settings) {
            try {
                const conversationsData = {};
                for (const [path, conversation] of h.conversations.entries()) {
                    const trimmedHistory = (conversation.history || []).slice(-50).map(m => ({
                        ...m,
                        isTyping: false,
                        timestamp: (m.timestamp instanceof Date)
                            ? m.timestamp.toISOString()
                            : (m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString())
                    }));
                    conversationsData[path] = { ...conversation, history: trimmedHistory };
                }
                for (const [path, conv] of Object.entries(conversationsData)) {
                    if (!conv.includedNotes && h.currentNoteFile && path === h.currentNoteFile.path) {
                        conv.includedNotes = Array.from(h.includedNotes.entries()).map(([p, e]) => ({ path: p, name: e.name, includeInContext: !!e.includeInContext, content: e.content }));
                    } else {
                        conv.includedNotes = conv.includedNotes || [];
                    }
                }

                const discussionsData = {};
                for (const [path, noteDiscussions] of h.discussions.entries()) {
                    discussionsData[path] = {};
                    if (noteDiscussions instanceof Map) {
                        for (const [discussionId, discussionData] of noteDiscussions.entries()) {
                            const trimmedDiscussion = { ...discussionData, history: (discussionData.history || []).slice(-50) };
                            discussionsData[path][discussionId] = trimmedDiscussion;
                        }
                    } else if (noteDiscussions && typeof noteDiscussions === 'object') {
                        for (const [discussionId, discussionData] of Object.entries(noteDiscussions)) {
                            const trimmedDiscussion = { ...discussionData, history: (discussionData.history || []).slice(-50) };
                            discussionsData[path][discussionId] = trimmedDiscussion;
                        }
                    }
                }

                const trimmedGlobalHistory = h.globalDiscussionHistory.slice(0, 100).map(d => ({ ...d, history: (d.history || []).slice(-20) }));

                h.plugin.settings.chatConversations = conversationsData;
                h.plugin.settings.discussions = discussionsData;
                h.plugin.settings.globalDiscussionHistory = trimmedGlobalHistory;
                await h.plugin.saveSettings();
                h._lastSavedAt = new Date();
            } catch (error) {
                console.warn('Failed to save chat conversations and discussions:', error);
                const { notifyError } = require('../notifications');
                notifyError('Failed to save chat conversations. Check console for details.', error);
            }
        }
    }

    async _saveCurrentDiscussion() {
        const h = this.host;
        if (!h.currentNoteFile || !h.currentDiscussionId || h.chatHistory.length === 0) return;
        if (h._saveInProgress) { h._pendingSave = true; return; }
        h._saveInProgress = true;
        try {
            const discussionData = h.stateSvc.createDiscussion(h.currentDiscussionId, h.currentNoteFile.path);
            discussionData.state = 'SAVED';
            discussionData.lastUpdated = new Date();
            discussionData.history = h.chatHistory.map(m => ({
                ...m,
                isTyping: false,
                timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp || Date.now()).toISOString()
            })).filter(m => {
                const trimmed = (m.content || '').trim();
                return trimmed.length > 0 && !/^(💭\s*)?Thinking\.\.\.$/i.test(trimmed);
            });
            if (!h.discussions.has(h.currentNoteFile.path) || !(h.discussions.get(h.currentNoteFile.path) instanceof Map)) {
                h.discussions.set(h.currentNoteFile.path, new Map());
            }
            const noteMap = h.discussions.get(h.currentNoteFile.path);
            discussionData.messageCount = (discussionData.history || []).length;
            noteMap.set(h.currentDiscussionId, discussionData);
            h._addDiscussionToNote(h.currentDiscussionId, h.currentNoteFile.path);
            h.discussionIndex.set(h.currentDiscussionId, { notePath: h.currentNoteFile.path, lastUpdated: discussionData.lastUpdated });

            try {
                const summary = {
                    id: discussionData.id,
                    title: discussionData.title || 'Untitled Discussion',
                    noteFile: discussionData.notePath || h.currentNoteFile.path,
                    noteName: discussionData.noteName || (h.currentNoteFile ? h.currentNoteFile.basename : 'Unknown'),
                    startTime: discussionData.startTime || new Date(),
                    lastUpdated: discussionData.lastUpdated || new Date(),
                    messageCount: discussionData.messageCount || (discussionData.history || []).length,
                    history: (discussionData.history || []).slice(-3)
                };
                const existingIndex = h.globalDiscussionHistory.findIndex(d => d.id === summary.id);
                if (existingIndex !== -1) h.globalDiscussionHistory[existingIndex] = summary; else h.globalDiscussionHistory.unshift(summary);
                if (h.globalDiscussionHistory.length > 100) h.globalDiscussionHistory = h.globalDiscussionHistory.slice(0, 100);
            } catch (e) { console.warn('Failed to update globalDiscussionHistory', e); }
        } finally {
            h._saveInProgress = false;
            if (h._pendingSave) { h._pendingSave = false; await this._saveCurrentDiscussion(); }
        }
    }

    async loadConversation() {
        const h = this.host;
        if (!h.currentNoteFile) return;
        const filePath = h.currentNoteFile.path;

        if (h.plugin.settings?.discussions) {
            try {
                for (const [path, noteDiscussions] of Object.entries(h.plugin.settings.discussions)) {
                    if (!h.discussions.has(path)) h.discussions.set(path, new Map());
                    const discussionMap = h.discussions.get(path);
                    for (const [discussionId, discussionData] of Object.entries(noteDiscussions)) {
                        discussionMap.set(discussionId, discussionData);
                    }
                }
            } catch (error) {
                console.warn('Failed to load discussions from settings:', error);
            }
        }

        if (h.plugin.settings?.globalDiscussionHistory) {
            try { h.globalDiscussionHistory = [...(h.plugin.settings.globalDiscussionHistory || [])]; } catch (error) { console.warn('Failed to load global discussion history:', error); }
        }

        const noteDiscussions = h.discussions.get(filePath);
        if (noteDiscussions && noteDiscussions.size > 0) {
            const discussionsArray = Array.from(noteDiscussions.values());
            const mostRecent = discussionsArray.sort((a, b) => new Date(b.lastUpdated || b.startTime) - new Date(a.lastUpdated || a.startTime))[0];
            if (mostRecent) { h.loadDiscussion(mostRecent.id, filePath); return; }
        }

        if (h.conversations.has(filePath)) {
            const conversation = h.conversations.get(filePath);
            h.chatHistory = this._normalize(conversation.history);
            h.userMessageHistory = [...(conversation.userMessageHistory || [])];
            h.includePdfInContext = conversation.includePdfInContext !== undefined ? !!conversation.includePdfInContext : true;
            h.includeNoteInContext = conversation.includeNoteInContext !== undefined ? !!conversation.includeNoteInContext : true;
            h.currentDiscussionId = conversation.currentDiscussionId;
            try {
                if (conversation.includedNotes instanceof Map) h.includedNotes = new Map(conversation.includedNotes);
                else if (Array.isArray(conversation.includedNotes)) h.includedNotes = new Map((conversation.includedNotes || []).map(it => [it.path, { name: it.name || it.path, content: it.content || '', includeInContext: it.includeInContext !== false }]));
                else h.includedNotes = new Map();
            } catch (_) { h.includedNotes = new Map(); }
            h.renderChatHistory(); h.updateNoteInfo();
            return;
        }

        if (h.plugin.settings?.chatConversations?.[filePath]) {
            const conversation = h.plugin.settings.chatConversations[filePath];
            const normalizedHistory = this._normalize(conversation.history);
            h.chatHistory = normalizedHistory;
            h.userMessageHistory = conversation.userMessageHistory || [];
            h.currentDiscussionId = conversation.currentDiscussionId;
            h.conversations.set(filePath, {
                ...conversation,
                history: normalizedHistory,
                includedNotes: (conversation.includedNotes || []).reduce((map, it) => { try { if (it && it.path) map.set(it.path, { name: it.name || it.path, content: it.content || '', includeInContext: it.includeInContext !== false }); } catch (e) {} return map; }, new Map())
            });
            h.includePdfInContext = conversation.includePdfInContext !== undefined ? !!conversation.includePdfInContext : true;
            h.includeNoteInContext = conversation.includeNoteInContext !== undefined ? !!conversation.includeNoteInContext : true;
            h.renderChatHistory(); h.updateNoteInfo();
            return;
        }

        h.chatHistory = [];
        h.userMessageHistory = [];
        h.messageHistoryIndex = -1;
        h.currentDiscussionId = null;
        h.includePdfInContext = true;
        h.includeNoteInContext = true;
        h.includedNotes = new Map();
        h.renderChatHistory();
    }

    _normalize(history) {
        return (history || [])
            .map(m => normalizeMessage(m))
            .filter(m => {
                const t = (m.content || '').trim();
                return t.length > 0 && !/^(💭\s*)?Thinking\.\.\.$/i.test(t);
            });
    }

    saveAssistantResponseToPath(notePath, discussionId, messageObj) {
        const h = this.host;
        try {
            if (!h.conversations.has(notePath)) {
                h.conversations.set(notePath, { history: [], userMessageHistory: [], includePdfInContext: true, includeNoteInContext: true, includedNotes: [] });
            }
            const conv = h.conversations.get(notePath);
            conv.history = conv.history || [];
            conv.history.push(messageObj);

            if (discussionId) {
                if (!h.discussions.has(notePath)) h.discussions.set(notePath, new Map());
                const noteDiscussions = h.discussions.get(notePath);
                if (!noteDiscussions.has(discussionId)) {
                    noteDiscussions.set(discussionId, {
                        id: discussionId,
                        title: 'Orphaned discussion',
                        noteFile: notePath,
                        noteName: notePath.split('/').pop(),
                        startTime: new Date(),
                        lastUpdated: new Date(),
                        messageCount: 1,
                        history: [messageObj],
                        userMessageHistory: []
                    });
                } else {
                    const d = noteDiscussions.get(discussionId);
                    d.history = d.history || [];
                    d.history.push(messageObj);
                    d.lastUpdated = new Date();
                    d.messageCount = (d.history || []).length;
                    noteDiscussions.set(discussionId, d);
                }
            }

            if (h.plugin?.settings) {
                try {
                    const conversationsObj = {};
                    for (const [p, c] of h.conversations.entries()) {
                        conversationsObj[p] = { ...c, history: (c.history || []).slice(-50) };
                    }
                    h.plugin.settings.chatConversations = conversationsObj;
                    h.plugin.saveSettings();
                } catch (e) { console.warn('Failed to persist orphaned response to settings', e); }
            }
        } catch (e) {
            console.error('Error saving assistant response to path', notePath, e);
            throw e;
        }
    }
}

module.exports = { ChatPersistenceService };
