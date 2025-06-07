// UI helpers: rendering chat messages, history panels, styles, and textarea resize
const { ConfirmModal } = require('../confirm-modal');
const { renderMessage } = require('../message-renderer');
const { notify } = require('../notifications');

class ChatUIHelpers {
    constructor(host) { this.host = host; }

    renderChatHistory() {
        const h = this.host;
        if (!h.chatMessagesEl) return;
        h.chatMessagesEl.empty();
        h.chatHistory.forEach(message => {
            renderMessage(h.chatMessagesEl, message, {
                app: h.app,
                ConfirmModal,
                onDelete: (id) => { h.deleteMessage(id); notify('Message deleted'); }
            });
        });
        if (!h.isUserScrolling) h.chatMessagesEl.scrollTop = h.chatMessagesEl.scrollHeight;
    }

    updateNoteInfo() {
        const h = this.host;
        const noteInfoEl = h.contentEl.querySelector('.chat-note-info');
        if (!noteInfoEl) return;
        noteInfoEl.empty();

        if (h.currentNoteFile) {
            const hasPdf = h.currentPdfContent.length > 0;
            const isPdf = h.currentNoteFile.extension === 'pdf';
            const paperData = !isPdf ? h.plugin.paperService?.paperIndex?.get(h.currentNoteFile.path) : null;
            let pdfFile = null;
            if (isPdf) {
                pdfFile = h.currentNoteFile.path;
            } else if (paperData && paperData.frontmatter) {
                pdfFile = paperData.frontmatter.pdf_file || paperData.frontmatter.pdf || paperData.frontmatter.pdf_path || paperData.frontmatter.pdfPath || null;
            } else {
                try {
                    const fm = h.app.metadataCache.getFileCache(h.currentNoteFile)?.frontmatter;
                    if (fm) pdfFile = fm.pdf_file || fm.pdf || fm.pdf_path || fm.pdfPath || null;
                } catch (_) {}
            }

            const wrapper = noteInfoEl.createEl('div', { cls: 'chat-current-note' });
            wrapper.createEl('div', { cls: 'note-name', text: h.currentNoteFile.basename + (isPdf ? ' (PDF)' : '') });
            const status = wrapper.createEl('div', { cls: 'note-status' });

            if (!isPdf) {
                status.createSpan({ text: '📝 ' });
                const noteBtn = status.createEl('button', {
                    cls: `note-toggle-button ${h.includeNoteInContext ? 'on' : 'off'}`,
                    attr: { title: h.includeNoteInContext ? 'Click to exclude Note from LLM context' : 'Click to include Note in LLM context' }
                });
                noteBtn.textContent = `Note (${h.currentNoteContent.length} chars)`;
                noteBtn.addEventListener('click', async () => {
                    h.includeNoteInContext = !h.includeNoteInContext;
                    await h.saveConversation();
                    h.updateNoteInfo();
                });
            } else {
                status.createSpan({ text: `📄 PDF (${h.currentPdfContent.length} chars)` });
            }

            if (hasPdf && !isPdf) {
                status.createSpan({ text: ' • ' });
                const pdfBtn = status.createEl('button', {
                    cls: `pdf-toggle-button ${h.includePdfInContext ? 'on' : 'off'}`,
                    attr: { title: h.includePdfInContext ? 'Click to exclude PDF from LLM context' : 'Click to include PDF in LLM context' }
                });
                pdfBtn.textContent = `📋 PDF file (${h.currentPdfContent.length} chars)`;
                pdfBtn.addEventListener('click', async () => {
                    h.includePdfInContext = !h.includePdfInContext;
                    await h.saveConversation();
                    h.updateNoteInfo();
                });
            } else if (pdfFile && h.pdfExtractionError) {
                status.createSpan({ text: ' • ' });
                if (h.pdfExtractionError.includes('PDF.js not available')) {
                    status.createSpan({ text: '⚠️ PDF found but PDF.js not loaded - try opening a PDF file first' });
                } else {
                    status.createSpan({ text: `⚠️ PDF extraction failed: ${h.pdfExtractionError}` });
                }
            } else if (pdfFile) {
                status.createSpan({ text: ' • ' });
                status.createSpan({ text: isPdf ? '📄 PDF loaded' : `⚠️ PDF file found but not loaded: ${pdfFile}` });
            } else {
                status.createSpan({ text: ' • No PDF file in frontmatter' });
            }

            const statusRow = wrapper.createEl('div', { cls: 'chat-status-row' });
            if (h._pdfExtractionInProgress) {
                statusRow.createEl('span', { text: '🔄 Extracting PDF...' });
            } else if (h.pdfExtractionError) {
                statusRow.createEl('span', { text: `⚠️ PDF error: ${h.pdfExtractionError}` });
            }
            if (h._lastSavedAt) {
                try { statusRow.createEl('span', { text: ` • Last saved: ${h._lastSavedAt.toLocaleString()}` }); } catch (e) {}
            }
        } else {
            const noNote = noteInfoEl.createEl('div', { cls: 'chat-no-note' });
            noNote.createEl('div', { cls: 'no-note-message', text: 'No active note' });
            noNote.createEl('div', { cls: 'no-note-help', text: 'Open a markdown file to start chatting about it' });
        }

        if (this.host.includedNotes.size > 0) {
            const includedWrapper = noteInfoEl.createEl('div', { cls: 'chat-included-notes' });
            for (const [path, entry] of this.host.includedNotes.entries()) {
                const row = includedWrapper.createEl('div', { cls: 'included-note-row' });
                row.createEl('div', { cls: 'included-note-name', text: entry.name || path });
                const controls = row.createEl('div', { cls: 'included-note-controls' });
                const toggleBtn = controls.createEl('button', {
                    cls: `pdf-toggle-button ${entry.includeInContext ? 'on' : 'off'}`,
                    attr: { title: entry.includeInContext ? 'Exclude this note from context' : 'Include this note in context' }
                });
                toggleBtn.textContent = entry.name || path;
                toggleBtn.addEventListener('click', async () => {
                    entry.includeInContext = !entry.includeInContext;
                    this.host.includedNotes.set(path, entry);
                    await this.host.saveConversation();
                    this.host.updateNoteInfo();
                });

                if (!entry.includeInContext) {
                    this.host.includedNotes.delete(path);
                    this.host.updateNoteInfo();
                }
            }
        }
    }

    addStyles() {
        const styleId = 'chat-panel-styles';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        try { style.textContent = require('../chat-panel-styles'); }
        catch (e) { style.textContent = '.chat-panel-container { padding: 8px; }'; console.warn('Fallback styles', e); }
        document.head.appendChild(style);
    }

    renderDiscussionHistory() {
        const h = this.host;
        if (!h.discussionHistoryPanel) return;
        if (h.showingDiscussionHistory) {
            h.discussionHistoryPanel.style.display = 'block';
            h.discussionHistoryPanel.empty();

            const header = h.discussionHistoryPanel.createEl('div', { cls: 'history-panel-header' });
            header.createEl('h4', { text: 'Discussion History for this Note' });
            const closeBtn = header.createEl('button', { cls: 'history-close-button', text: '✕' });
            closeBtn.addEventListener('click', () => {
                h.showingDiscussionHistory = false;
                h.discussionHistoryPanel.style.display = 'none';
            });

            const content = h.discussionHistoryPanel.createEl('div', { cls: 'history-panel-content' });
            if (!h.currentNoteFile) {
                content.createEl('div', { text: 'No note selected', cls: 'history-empty' });
                return;
            }
            const noteDiscussions = h.discussions.get(h.currentNoteFile.path);
            if (!noteDiscussions || noteDiscussions.size === 0) {
                content.createEl('div', { text: 'No discussions yet for this note', cls: 'history-empty' });
                return;
            }
            const discussionsArray = Array.from(noteDiscussions.values())
                .sort((a, b) => new Date(b.lastUpdated || b.startTime) - new Date(a.lastUpdated || a.startTime));
            discussionsArray.forEach((discussion) => {
                const item = content.createEl('div', { cls: 'discussion-item' });
                const itemHeader = item.createEl('div', { cls: 'discussion-item-header' });
                itemHeader.createEl('div', { cls: 'discussion-title', text: discussion.title });
                const meta = itemHeader.createEl('div', { cls: 'discussion-meta' });
                const date = new Date(discussion.lastUpdated || discussion.startTime);
                meta.createEl('span', { text: date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
                meta.createEl('span', { text: ` • ${discussion.messageCount} messages` });
                const actions = item.createEl('div', { cls: 'discussion-actions' });
                const loadBtn = actions.createEl('button', { cls: 'discussion-action-button', text: 'Load', attr: { type: 'button', 'aria-label': `Load discussion ${discussion.title}` } });
                loadBtn.addEventListener('click', () => { h.loadDiscussion(discussion.id); });
                const deleteBtn = actions.createEl('button', { cls: 'discussion-action-button delete-button', text: 'Delete', attr: { type: 'button', 'aria-label': `Delete discussion ${discussion.title}` } });
                deleteBtn.addEventListener('click', () => {
                    const modal = new ConfirmModal(h.app, `Delete discussion "${discussion.title}"?`, () => { h.deleteDiscussion(discussion.id); });
                    modal.open();
                });
                if (discussion.id === h.currentDiscussionId) item.addClass('current-discussion');
            });
        } else {
            h.discussionHistoryPanel.style.display = 'none';
        }
    }

    renderGlobalHistory() {
        const h = this.host;
        if (!h.globalHistoryPanel) return;
        if (h.showingGlobalHistory) {
            h.globalHistoryPanel.style.display = 'block';
            h.globalHistoryPanel.empty();

            const header = h.globalHistoryPanel.createEl('div', { cls: 'history-panel-header' });
            header.createEl('h4', { text: 'Global Discussion History' });
            const closeBtn = header.createEl('button', { cls: 'history-close-button', text: '✕' });
            closeBtn.addEventListener('click', () => {
                h.showingGlobalHistory = false;
                h.globalHistoryPanel.style.display = 'none';
            });

            const content = h.globalHistoryPanel.createEl('div', { cls: 'history-panel-content' });
            let globalList = h.globalDiscussionHistory || [];
            if ((!globalList || globalList.length === 0) && h.discussions && h.discussions.size > 0) {
                const synthesized = [];
                for (const [notePath, noteMap] of h.discussions.entries()) {
                    if (!noteMap) continue;
                    if (noteMap instanceof Map) {
                        for (const [id, d] of noteMap.entries()) {
                            try {
                                synthesized.push({
                                    id: d.id || id,
                                    title: d.title || (d.history && d.history.length ? (d.history.find(m=>m.role==='user')?.content||'Discussion') : 'Discussion'),
                                    noteFile: d.notePath || notePath,
                                    noteName: d.noteName || (notePath.split('/').pop() || notePath),
                                    lastUpdated: d.lastUpdated || d.startTime || new Date(),
                                    startTime: d.startTime || new Date(),
                                    messageCount: d.messageCount || (d.history || []).length,
                                    history: (d.history || []).slice(-3)
                                });
                            } catch (e) {}
                        }
                    } else if (typeof noteMap === 'object') {
                        for (const [id, d] of Object.entries(noteMap)) {
                            synthesized.push({
                                id: d.id || id,
                                title: d.title || 'Discussion',
                                noteFile: d.notePath || notePath,
                                noteName: d.noteName || (notePath.split('/').pop() || notePath),
                                lastUpdated: d.lastUpdated || d.startTime || new Date(),
                                startTime: d.startTime || new Date(),
                                messageCount: d.messageCount || (d.history || []).length,
                                history: (d.history || []).slice(-3)
                            });
                        }
                    }
                }
                synthesized.sort((a,b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
                globalList = synthesized;
            }

            if (!globalList || globalList.length === 0) {
                content.createEl('div', { text: 'No discussions yet', cls: 'history-empty' });
                return;
            }

            globalList.forEach((discussion) => {
                const item = content.createEl('div', { cls: 'discussion-item global-discussion-item' });
                const itemHeader = item.createEl('div', { cls: 'discussion-item-header' });
                itemHeader.createEl('div', { cls: 'discussion-title', text: discussion.title });
                itemHeader.createEl('div', { cls: 'discussion-note-info', text: `📄 ${discussion.noteName}` });
                const meta = itemHeader.createEl('div', { cls: 'discussion-meta' });
                const date = new Date(discussion.lastUpdated || discussion.startTime);
                meta.createEl('span', { text: date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
                meta.createEl('span', { text: ` • ${discussion.messageCount} messages` });
                const actions = item.createEl('div', { cls: 'discussion-actions' });
                const openNoteBtn = actions.createEl('button', { cls: 'discussion-action-button', text: 'Open Note', attr: { type: 'button', 'aria-label': `Open note for discussion ${discussion.title}` } });
                openNoteBtn.addEventListener('click', async () => {
                    const file = h.app.vault.getAbstractFileByPath(discussion.noteFile);
                    if (file) {
                        await h.app.workspace.getLeaf().openFile(file);
                        setTimeout(() => { h.loadDiscussion(discussion.id, discussion.noteFile); }, 100);
                    } else {
                        h.addMessageToHistory('system', `Note not found: ${discussion.noteFile}`);
                    }
                });
                const deleteBtn = actions.createEl('button', { cls: 'discussion-action-button delete-button', text: 'Delete' });
                deleteBtn.addEventListener('click', () => {
                    const modal = new ConfirmModal(h.app, `Delete discussion "${discussion.title}"?`, () => { h.deleteDiscussion(discussion.id, discussion.noteFile); });
                    modal.open();
                });
                if (discussion.id === h.currentDiscussionId) item.addClass('current-discussion');
            });
        } else {
            h.globalHistoryPanel.style.display = 'none';
        }
    }
}

module.exports = { ChatUIHelpers };
