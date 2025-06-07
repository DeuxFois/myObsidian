const { ItemView, TFile } = require('obsidian');
const { ConfirmModal } = require('./confirm-modal');
const { generateDiscussionId: _genDiscussionId, normalizeMessage } = require('./chat-utils');
const { renderMessage } = require('./message-renderer');
const { notify, notifyError } = require('./notifications');
// Services
const { ChatStateService } = require('./services/chat-state-service');
const { ChatPersistenceService } = require('./services/chat-persistence-service');
const { ChatUIHelpers } = require('./services/chat-ui-helpers');

const CHAT_PANEL_VIEW_TYPE = "chat-panel-view";

class ChatPanelView extends ItemView {
    constructor(leaf, settings, plugin) {
        super(leaf);
        this.settings = settings;
        this.plugin = plugin;
        // Current session state
        this.chatHistory = [];
        this.currentNoteContent = '';
        this.currentPdfContent = '';
        this.currentNoteFile = null;
        this.messageHistoryIndex = -1;
        this.userMessageHistory = [];
        this.isUserScrolling = false;
        
        // Discussion management - unified architecture
        this.currentDiscussionId = null;
        this.discussions = new Map(); // discussionId -> DiscussionData
        this.noteDiscussions = new Map(); // notePath -> Set<discussionId>
        this.discussionIndex = new Map(); // discussionId -> { notePath, lastUpdated }
        
        // Context controls
        this.includePdfInContext = true;
        this.includeNoteInContext = true;
        this.includedNotes = new Map(); // path -> { content, includeInContext, name }
        
        // UI state
        this.showingDiscussionHistory = false;
        this.showingGlobalHistory = false;
        
        // State management
        this._saveInProgress = false;
        this._pendingSave = false;
        this._updateInProgress = false;
        this._lastUpdateFile = null;
        this._updateDebounceTimer = null;
        this._pdfExtractionInProgress = false;
        this._lastSavedAt = null;
        this._lastDeletedMessage = null;
        this._lastDeletedTimer = null;

        // Legacy/state maps used throughout save/load paths
        // Ensure they are initialized to avoid undefined access
        this.conversations = new Map();
        this.globalDiscussionHistory = [];

        // Services
        this.stateSvc = new ChatStateService(this);
        this.persistSvc = new ChatPersistenceService(this);
        this.uiSvc = new ChatUIHelpers(this);
    }

    getViewType() { 
        return CHAT_PANEL_VIEW_TYPE; 
    }
    
    getDisplayText() { 
        return "Note Chat"; 
    }
    
    getIcon() { 
        return "message-circle"; 
    }

    async onOpen() {
        this.renderView();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Debounced note update to prevent multiple rapid calls
        // Use debounce factory from helpers to keep implementation shared/testable
        if (!this._debounceFactory) {
            try { this._debounceFactory = require('./chat-helpers').debounceFactory(); } catch (e) { this._debounceFactory = (f) => f; }
        }
        this._debouncedUpdateNote = this._debounceFactory(() => {
            if (!this._updateInProgress) {
                this._updateCurrentNote();
            }
        }, 100);

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this._debouncedUpdateNote();
            })
        );

        // Only update on file modification if it's the current note
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (this.currentNoteFile && file?.path === this.currentNoteFile.path) {
                    // Only update content, don't reload entire discussion
                    this._updateNoteContent(file);
                }
            })
        );
        
        // Keep included notes up-to-date if files change
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (!file) return;
                const path = file.path;
                if (this.includedNotes.has(path)) {
                    this._loadIncludedNoteEntry(path, file).catch(err => {
                        notify(`Failed to refresh included note: ${path}`);
                    });
                }
            })
        );
    }

    // Debounce implementation moved to `chat-helpers.js` (use this._debounceFactory())

    async _updateNoteContent(file) {
        if (!file || file.path !== this.currentNoteFile?.path) return;
        
        try {
            if (file.extension === 'md') {
                this.currentNoteContent = await this.app.vault.read(file);
                this.updateNoteInfo();
            }
        } catch (error) {
            console.warn('Failed to update note content:', error);
        }
    }

    async _updateCurrentNote() {
        // Prevent concurrent updates
        if (this._updateInProgress) return;
        this._updateInProgress = true;
        
        try {
            const activeFile = this.app.workspace.getActiveFile();

            // Check if we're already processing this file
            if (this._lastUpdateFile && activeFile?.path === this._lastUpdateFile) {
                return;
            }
            this._lastUpdateFile = activeFile?.path || null;

            // When there's no active file, clear state
            if (!activeFile) {
                if (this.currentNoteFile) {
                    await this.saveConversation();
                }
                this._clearNoteState();
                return;
            }

            // Save current state if switching files
            if (this.currentNoteFile && this.currentNoteFile.path !== activeFile.path) {
                await this.saveConversation();
                this._clearNoteState();
            }

            this.currentNoteFile = activeFile;
            
            // Load content based on file type
            await this._loadNoteContent(activeFile);
            
            // Load discussions for this note using new architecture
            await this._loadDiscussionsForNote(activeFile.path);
            
            // Update UI
                this.updateNoteInfo();
                this.renderChatHistory();
            
        } finally {
            this._updateInProgress = false;
        }
    }

    _clearNoteState() {
        this.currentNoteFile = null;
        this.currentNoteContent = '';
        this.currentPdfContent = '';
        this.pdfExtractionError = null;
        this.chatHistory = [];
        this.userMessageHistory = [];
        this.messageHistoryIndex = -1;
        this.currentDiscussionId = null;
        this.hideHistoryPanels();
        this.updateNoteInfo();
        this.renderChatHistory();
    }

    async _loadNoteContent(activeFile) {

        // Handle Markdown note
        if (activeFile.extension === 'md') {
            try {
                this.currentNoteContent = await this.app.vault.read(activeFile);
                this.currentPdfContent = '';
                this.pdfExtractionError = null;
                const paperData = this.plugin.paperService?.paperIndex?.get(activeFile.path);

                // Try detecting PDF reference from multiple sources/keys
                let fmPdf = null;
                if (paperData && paperData.frontmatter) {
                    fmPdf = paperData.frontmatter.pdf_file || paperData.frontmatter.pdf || paperData.frontmatter.pdf_path || paperData.frontmatter.pdfPath || null;
                }
                if (!fmPdf) {
                    try {
                        const fm = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
                        if (fm) {
                            fmPdf = fm.pdf_file || fm.pdf || fm.pdf_path || fm.pdfPath || null;
                        }
                    } catch (_) {}
                }

                if (fmPdf) {
                    try {
                        let logicalPath = String(fmPdf);
                        if (!logicalPath.includes('/') && activeFile.parent && activeFile.parent.path) {
                            logicalPath = `${activeFile.parent.path}/${logicalPath}`;
                        }

                        let effectivePath = logicalPath;
                        if (this.plugin.fileService?.resolveLogicalToEffectivePath) {
                            effectivePath = await this.plugin.fileService.resolveLogicalToEffectivePath(logicalPath);
                        }

                        // Try multiple resolution strategies
                        let pdfFile = this.app.vault.getAbstractFileByPath(effectivePath);
                        if (!pdfFile && !/\.pdf$/i.test(effectivePath)) {
                            pdfFile = this.app.vault.getAbstractFileByPath(effectivePath + '.pdf');
                        }
                        if (!pdfFile) {
                            const base = effectivePath.replace(/\\/g, '/').split('/').pop().replace(/\.pdf$/i, '');
                            const files = this.app.vault.getFiles();
                            const match = files.find(f => f instanceof TFile && f.extension === 'pdf' && f.basename.toLowerCase() === base.toLowerCase());
                            if (match) pdfFile = match;
                        }

                        if (pdfFile instanceof TFile && pdfFile.extension === 'pdf') {
                            this._pdfExtractionInProgress = true;
                            this.updateNoteInfo();
                            try {
                                this.currentPdfContent = await this.plugin.pdfService.extractTextFromPdf(pdfFile);
                                notify(`PDF text extracted and included for ${pdfFile.basename}`);
                                this.pdfExtractionError = null;
                            } catch (pdfExtractionError) {
                                this.pdfExtractionError = pdfExtractionError.message;
                                notifyError(`PDF extraction failed for ${pdfFile.basename}: ${this.pdfExtractionError}`, pdfExtractionError);
                                this.currentPdfContent = '';
                            } finally {
                                this._pdfExtractionInProgress = false;
                                this.updateNoteInfo();
                            }
                        }
                    } catch (_) {
                        // ignore
                    }
                }

                this.updateNoteInfo();
                await this.loadConversation();
            } catch (_) {
                // ignore
            }
            return;
        }

        // Handle PDF file directly
        if (activeFile.extension === 'pdf') {
            try {
                this.currentNoteContent = '';
                this.currentPdfContent = '';
                this.pdfExtractionError = null;

                try {
                    this._pdfExtractionInProgress = true;
                    this.updateNoteInfo();
                    this.currentPdfContent = await this.plugin.pdfService.extractTextFromPdf(activeFile);
                    notify(`PDF text extracted and included for ${activeFile.basename}`);
                    this.pdfExtractionError = null;
                } catch (pdfErr) {
                    this.pdfExtractionError = pdfErr?.message || String(pdfErr);
                    this.currentPdfContent = '';
                    notifyError(`PDF extraction failed for ${activeFile.basename}: ${this.pdfExtractionError}`, pdfErr);
                } finally {
                    this._pdfExtractionInProgress = false;
                    this.updateNoteInfo();
                }

                this.updateNoteInfo();
                await this.loadConversation();
            } catch (_) {
                // ignore
            }
            return;
        }

        // For other file types, clear state but keep panel open
        this.currentNoteContent = '';
        this.currentPdfContent = '';
        this.pdfExtractionError = null;
        this.updateNoteInfo();
        this.renderChatHistory();
    }

    updateNoteInfo() {
        // delegate
        this.uiSvc.updateNoteInfo();
    }

    async renderView() {
        const container = this.contentEl || this.containerEl.children[1];
        container.empty();
        container.addClass('chat-panel-container');

        const header = container.createEl('div', { cls: 'chat-panel-header' });
        const titleRow = header.createEl('div', { cls: 'chat-title-row' });
        titleRow.createEl('h3', { text: 'Chat with Note', cls: 'chat-panel-title' });
        
        // Discussion management buttons
        const discussionControls = titleRow.createEl('div', { cls: 'discussion-controls' });
        
        const newDiscussionBtn = discussionControls.createEl('button', {
            cls: 'discussion-button new-discussion-button',
            title: 'Start new discussion',
            attr: { 'aria-label': 'Start new discussion' }
        });
        newDiscussionBtn.innerHTML = '💬 New';
        newDiscussionBtn.addEventListener('click', () => this.startNewDiscussion());
        
        const discussionHistoryBtn = discussionControls.createEl('button', {
            cls: 'discussion-button history-button',
            title: 'View discussion history for this note',
            attr: { 'aria-label': 'View discussion history for this note' }
        });
        discussionHistoryBtn.innerHTML = '📋 History';
        discussionHistoryBtn.addEventListener('click', () => this.toggleDiscussionHistory());
        const globalHistoryBtn = discussionControls.createEl('button', {
            cls: 'discussion-button global-history-button',
            title: 'View global discussion history',
            attr: { 'aria-label': 'View global discussion history' }
        });
        globalHistoryBtn.innerHTML = '🌐 Global';
        globalHistoryBtn.addEventListener('click', () => this.toggleGlobalHistory());
      
        // Only show New and History buttons in the header (Global/Privacy/Undo removed)
        
        const noteInfo = header.createEl('div', { cls: 'chat-note-info' });

        // Discussion History Panel (for current note)
        const discussionHistoryPanel = container.createEl('div', { 
            cls: 'discussion-history-panel',
            attr: { style: 'display: none;' }
        });
        this.discussionHistoryPanel = discussionHistoryPanel;
        
        // Global History Panel
        const globalHistoryPanel = container.createEl('div', { 
            cls: 'global-history-panel',
            attr: { style: 'display: none;' }
        });
        this.globalHistoryPanel = globalHistoryPanel;

        const chatArea = container.createEl('div', { cls: 'chat-messages-area' });
        this.chatMessagesEl = chatArea;

        chatArea.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = chatArea;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;
            this.isUserScrolling = !isAtBottom;
        });

        // Drag & drop support to include other notes in LLM context
        chatArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        chatArea.addEventListener('drop', async (e) => {
            e.preventDefault();
            try {
                let targetFile = null;
                
                // Try files list (desktop)
                const files = e.dataTransfer.files;
                if (files && files.length > 0) {
                    const f = files[0];
                    const filePath = f.path || f.name;
                    if (filePath && filePath.endsWith('.md')) {
                        targetFile = this.app.vault.getAbstractFileByPath(filePath);
                    }
                }

                // Try plain text payload (internal Obsidian drag)
                if (!targetFile) {
                    const txt = e.dataTransfer.getData('text/plain');
                    if (txt) {
                        const candidate = txt.trim();
                        
                        if (candidate.startsWith('obsidian://')) {
                            // Extract file path from obsidian URI
                            try {
                                const url = new URL(candidate);
                                const fileParam = url.searchParams.get('file');
                                if (fileParam) {
                                    const decoded = decodeURIComponent(fileParam).replace(/^\//, '');
                                    // try direct path
                                    targetFile = this.app.vault.getAbstractFileByPath(decoded);
                                    // try with .md suffix
                                    if (!targetFile) targetFile = this.app.vault.getAbstractFileByPath(decoded.endsWith('.md') ? decoded : decoded + '.md');
                                    // try basename search
                                    if (!targetFile) {
                                        const base = decoded.replace(/\\/g, '/').split('/').pop().replace(/\.md$/i, '');
                                        const files = this.app.vault.getFiles();
                                        targetFile = files.find(f => f.basename.toLowerCase() === base.toLowerCase());
                                    }
                                }
                            } catch (_) {
                                // Fall back to name search
                                const files = this.app.vault.getFiles();
                                targetFile = files.find(f => 
                                    f.basename.toLowerCase() === candidate.toLowerCase() ||
                                    f.path.toLowerCase() === candidate.toLowerCase()
                                );
                            }
                        } else if (candidate.endsWith('.md')) {
                            targetFile = this.app.vault.getAbstractFileByPath(candidate);
                        } else {
                            // Try find by name
                            const files = this.app.vault.getFiles();
                            targetFile = files.find(f => 
                                f.basename.toLowerCase() === candidate.toLowerCase()
                            );
                        }
                    }
                }

                // If we found a target file, prefer adding markdown notes to the LLM context
                if (targetFile && targetFile instanceof TFile) {
                    // Handle markdown notes
                    if (targetFile.extension === 'md') {
                        await this._loadIncludedNoteEntry(targetFile.path, targetFile);
                        await this.saveConversation();
                        this.updateNoteInfo();
                        notify(`Included note "${targetFile.basename}" added to LLM context.`);
                    }
                    // Handle PDFs by extracting text and including that content
                    else if (targetFile.extension === 'pdf') {
                        try {
                            this._pdfExtractionInProgress = true;
                            this.updateNoteInfo();
                            const text = await this.plugin.pdfService.extractTextFromPdf(targetFile);
                            // Store as included note entry (so it will be part of the LLM context)
                            this.includedNotes.set(targetFile.path, {
                                name: targetFile.basename + ' (PDF)',
                                content: text || '',
                                includeInContext: true,
                                isPdf: true
                            });
                            await this.saveConversation();
                            this.updateNoteInfo();
                            notify(`Included PDF "${targetFile.basename}" added to LLM context.`);
                        } catch (err) {
                            console.warn('Failed to extract PDF on drop', err);
                            notifyError(`Failed to extract PDF: ${targetFile.basename}`, err);
                            // Fall back to opening the file so user can inspect it
                            try { await this.app.workspace.getLeaf().openFile(targetFile); } catch (_) {}
                        } finally {
                            this._pdfExtractionInProgress = false;
                            this.updateNoteInfo();
                        }
                    }
                    // Handle plain text-like files by reading their content and including
                    else if (['txt','csv','json','html','md','markdown'].includes((targetFile.extension || '').toLowerCase())) {
                        try {
                            const content = await this.app.vault.read(targetFile);
                            this.includedNotes.set(targetFile.path, {
                                name: targetFile.basename,
                                content: content || '',
                                includeInContext: true
                            });
                            await this.saveConversation();
                            this.updateNoteInfo();
                            notify(`Included file "${targetFile.basename}" added to LLM context.`);
                        } catch (err) {
                            console.warn('Failed to read dropped file', err);
                            notifyError(`Failed to include file: ${targetFile.basename}`, err);
                        }
                    }
                    // Otherwise (binary/unhandled), open the file to preserve previous behavior
                    else {
                        await this.app.workspace.getLeaf().openFile(targetFile);
                    }
                } else {
                    // Fallback: add to included notes if file not found but valid path
                    const txt = e.dataTransfer.getData('text/plain');
                    if (txt && txt.trim()) {
                        await this.addIncludedNoteByName(txt.trim());
                    }
                }
            } catch (err) {
                console.warn('Drop handling failed', err);
                notifyError('Failed to process dropped item', err);
            }
        });

        const inputArea = container.createEl('div', { cls: 'chat-input-area' });
        
        const inputContainer = inputArea.createEl('div', { cls: 'chat-input-container' });
        
        this.messageInput = inputContainer.createEl('textarea', {
            cls: 'chat-message-input',
            attr: {
                placeholder: 'Ask questions about the current note and PDF...',
                rows: '3'
            }
        });
        
        // Send button and clear stacked vertically on the right
        const sendControls = inputContainer.createEl('div', { cls: 'chat-send-controls' });
        sendControls.style.display = 'flex';
        sendControls.style.flexDirection = 'column';
        sendControls.style.gap = '8px';
        sendControls.style.alignItems = 'flex-end';

        const sendButton = sendControls.createEl('button', {
            cls: 'chat-send-button',
            text: 'Send',
            attr: { type: 'button', 'aria-label': 'Send message' }
        });
        sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    return;
                } else if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.sendMessage();
                } else {
                    e.preventDefault();
                    this.sendMessage();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.messageInput.value = '';
                this.messageInput.style.height = 'auto';
            } else if (e.key === 'ArrowUp' && e.ctrlKey) {
                e.preventDefault();
                this.navigateMessageHistory(-1);
            } else if (e.key === 'ArrowDown' && e.ctrlKey) {
                e.preventDefault();
                this.navigateMessageHistory(1);
            }
        });

        this.messageInput.addEventListener('input', () => {
            this.autoResizeTextarea();
        });

        const clearButton = sendControls.createEl('button', {
            cls: 'chat-clear-button',
            text: 'Clear Chat',
            attr: { type: 'button', 'aria-label': 'Clear chat history' }
        });
        clearButton.addEventListener('click', () => this.clearChat());

        await this._updateCurrentNote();
        this.renderChatHistory();

        this.addStyles();
    }

    async sendMessage() {
        let message = this.messageInput.value.trim();
        if (!message) return;

        if (!this.currentNoteFile) {
            this.addMessageToHistory('system', 'Please open a note or a PDF first.');
            return;
        }

        // Create new discussion if none exists
        if (!this.currentDiscussionId) {
            this.currentDiscussionId = this.generateDiscussionId();
        }

        this.userMessageHistory.push(message);
        this.messageHistoryIndex = -1;

    this.addMessageToHistory('user', message);
        this.messageInput.value = '';
        this.autoResizeTextarea();

        const thinkingId = this.addMessageToHistory('assistant', '💭 Thinking...', true);

            try {
            // Parse tokens like #{note-name} to include other notes by name
            const includeTokens = [];
            const tokenRegex = /#\{([^}]+)\}/g;
            let m;
            while ((m = tokenRegex.exec(message)) !== null) {
                const name = m[1].trim();
                if (name) includeTokens.push(name);
            }
            // Remove tokens from the message (so user intent is preserved)
            if (includeTokens.length > 0) {
                message = message.replace(tokenRegex, '').trim();
                // Try to add each included note by name (async)
                for (const name of includeTokens) {
                    await this.addIncludedNoteByName(name);
                }
            }
            let context = '';
            const isPdf = this.currentNoteFile.extension === 'pdf';
            if (isPdf) {
                context = `Current PDF: ${this.currentNoteFile.basename}\n\nPDF Content:\n${this.currentPdfContent || '(no extracted content)'}`;
            } else {
                context = `Current Note: ${this.currentNoteFile.basename}\n\n`;
                if (this.includeNoteInContext) {
                    context += `Note Content:\n${this.currentNoteContent}`;
                } else {
                    context += `Note content excluded from LLM context (toggle is OFF).`;
                }

                if (this.includePdfInContext && this.currentPdfContent) {
                    const pdfContentToAdd = this.currentPdfContent.slice(0, 50000);
                    context += `\n\n--- Associated PDF Content (included by toggle) ---\n${pdfContentToAdd}`;
                }
                // Include any additional notes the user added
                if (this.includedNotes && this.includedNotes.size > 0) {
                    for (const [path, entry] of this.includedNotes.entries()) {
                        if (entry && entry.includeInContext) {
                            const noteText = entry.content || '';
                            const snippet = noteText.length > 50000 ? noteText.slice(0, 50000) : noteText;
                            context += `\n\n--- Included Note: ${entry.name || path} ---\n${snippet}`;
                        }
                    }
                }
            }

            // Privacy / consent check: block sending note/pdf content to remote LLM if the user hasn't opted in
            const willSendContents = (this.includeNoteInContext && this.currentNoteContent && this.currentNoteContent.length > 0)
                || (this.includePdfInContext && this.currentPdfContent && this.currentPdfContent.length > 0)
                || (this.includedNotes && Array.from(this.includedNotes.values()).some(e => e.includeInContext));
            if (willSendContents && this.plugin?.settings && this.plugin.settings.allowSendNotePdfToLLM === false) {
                const msg = 'Sending note or PDF content to external LLM is disabled in plugin settings.';
                this.updateMessageInHistory(thinkingId, msg);
                notify(msg);
                return;
            }

            // Capture call context so responses arriving after a note switch can be routed
            const callContext = {
                notePath: this.currentNoteFile?.path,
                discussionId: this.currentDiscussionId,
                messageId: thinkingId
            };

            // Abort previous in-flight call (if any)
            if (this._lastLLMController && typeof this._lastLLMController.abort === 'function') {
                try { this._lastLLMController.abort(); } catch (e) { /* ignore */ }
            }
            this._lastLLMController = (typeof AbortController !== 'undefined') ? new AbortController() : null;

            const conversationHistory = this.chatHistory
                .filter(msg => msg.role !== 'system')
                .slice(-10)
                .map(msg => `${msg.role}: ${msg.content}`)
                .join('\n');

            const systemPrompt = `You are a helpful research assistant. You are chatting with a user about their current note and any associated PDF content. \n\nContext:\n${context}\n\nPrevious conversation:\n${conversationHistory}\n\nPlease provide helpful, accurate responses based on the note and PDF content. If the user asks about something not in the provided content, let them know that information isn't available in the current materials.`;

            // Issue the LLM call (pass abort signal if supported)
            let response;
            try {
                if (this._lastLLMController) {
                    response = await this.plugin.llmService.callLLMWithPrompt(systemPrompt, message, { signal: this._lastLLMController.signal });
                } else {
                    response = await this.plugin.llmService.callLLMWithPrompt(systemPrompt, message);
                }
            } catch (err) {
                if (err && err.name === 'AbortError') {
                    this.updateMessageInHistory(thinkingId, 'LLM request canceled.');
                    notify('LLM request canceled.');
                    return;
                }
                throw err;
            }

            // If note changed during request, save the assistant response to the original note's conversation
            if (callContext.notePath && callContext.notePath !== this.currentNoteFile?.path) {
                try {
                    this._saveAssistantResponseToPath(callContext.notePath, callContext.discussionId, {
                        id: Date.now() + Math.random(),
                        role: 'assistant',
                        content: response,
                        timestamp: new Date(),
                        isTyping: false
                    });
                    notify('Response completed after you switched notes — saved to original discussion.');
                } catch (e) {
                    console.error('Failed to save orphaned response', e);
                    notifyError('Response received but failed to save to original note. Check console.', e);
                }
            } else {
                this.updateMessageInHistory(thinkingId, response);
            }
            
        } catch (error) {
            let errorMessage = 'An error occurred while processing your request.';
            const emsg = (error && error.message) ? error.message : String(error || 'Unknown error');
            if (emsg.includes('status 401') || emsg.toLowerCase().includes('unauthorized')) {
                errorMessage = '❌ Authentication failed. Please check your API key in settings.';
            } else if (emsg.includes('status 403')) {
                errorMessage = '❌ Access forbidden. Your API key may not have permission for this model.';
            } else if (emsg.includes('status 429') || emsg.toLowerCase().includes('rate limit')) {
                errorMessage = '❌ Rate limit exceeded. Please wait a moment and try again.';
            } else if (emsg.toLowerCase().includes('timeout')) {
                errorMessage = '❌ LLM request timed out. Try again or reduce context size.';
            } else {
                errorMessage = `❌ Error: ${emsg}`;
            }
            notifyError(errorMessage, error);
            this.updateMessageInHistory(thinkingId, errorMessage);
        }
    }

    addMessageToHistory(role, content, isTyping = false) {
        // Guard against empty or invalid messages
        if (!content || typeof content !== 'string' || content.trim() === '') return null;
        if (!role || !['user', 'assistant', 'system'].includes(role)) role = 'assistant';

        // Avoid repeating identical system/assistant messages back-to-back (common when loading discussions)
        if ((role === 'system' || role === 'assistant') && this.chatHistory.length > 0) {
            const last = this.chatHistory[this.chatHistory.length - 1];
            if (last && last.role === role && last.content === content) {
                // If last message is identical and not a typing placeholder, skip adding duplicate
                if (!last.isTyping) return last.id;
            }
        }

        const messageId = Date.now() + Math.random();
        // delegate to state service
        return this.stateSvc.addMessageToHistory(role, content, isTyping);
    }

    updateMessageInHistory(messageId, newContent) {
        // delegate to state service
        this.stateSvc.updateMessageInHistory(messageId, newContent);
    }

    deleteMessage(messageId) {
    // delegate to state service
    this.stateSvc.deleteMessage(messageId);
    notify('Message deleted — click Undo in the header to restore (15s)');
        // show Undo button by re-rendering header (renderView controls will be rebuilt on next open; instead just ensure button exists)
        if (this._lastDeletedTimer) clearTimeout(this._lastDeletedTimer);
        this._lastDeletedTimer = setTimeout(() => { this._lastDeletedMessage = null; this._lastDeletedTimer = null; this.updateNoteInfo(); this.renderChatHistory(); }, 15000);
    }

    // Discussion Management Methods
    generateDiscussionId() {
        return _genDiscussionId();
    }

    // Data structure helpers for unified architecture
    _createDiscussion(id, notePath, title = null) {
        const discussion = {
            id,
            title: title || this.generateDiscussionTitle(),
            notePath,
            noteName: notePath ? notePath.split('/').pop().replace('.md', '') : 'Unknown',
            state: 'DRAFT', // DRAFT -> ACTIVE -> SAVED
            startTime: new Date(),
            lastUpdated: new Date(),
            messageCount: this.chatHistory.length,
            history: [...this.chatHistory],
            userMessageHistory: [...this.userMessageHistory],
            includePdfInContext: this.includePdfInContext,
            includeNoteInContext: this.includeNoteInContext,
            includedNotes: this._serializeIncludedNotes()
        };
        return discussion;
    }

    _serializeIncludedNotes() {
        return Array.from(this.includedNotes.entries()).map(([path, data]) => ({
            path,
            name: data.name || path,
            includeInContext: !!data.includeInContext,
            content: typeof data.content === 'string' ? data.content : ''
        }));
    }

    _deserializeIncludedNotes(serializedNotes) {
        this.includedNotes.clear();
        if (Array.isArray(serializedNotes)) {
            for (const note of serializedNotes) {
                this.includedNotes.set(note.path, {
                    name: note.name || note.path,
                    content: note.content || '',
                    includeInContext: note.includeInContext !== false
                });
            }
        }
    }

    _addDiscussionToNote(discussionId, notePath) {
        if (!this.noteDiscussions.has(notePath)) {
            this.noteDiscussions.set(notePath, new Set());
        }
        this.noteDiscussions.get(notePath).add(discussionId);
        
        this.discussionIndex.set(discussionId, {
            notePath,
            lastUpdated: new Date()
        });
    }

    _removeDiscussionFromNote(discussionId, notePath) {
        if (this.noteDiscussions.has(notePath)) {
            this.noteDiscussions.get(notePath).delete(discussionId);
            if (this.noteDiscussions.get(notePath).size === 0) {
                this.noteDiscussions.delete(notePath);
            }
        }
        this.discussionIndex.delete(discussionId);
    }

    _validateDiscussion(discussion) {
        return discussion && 
               typeof discussion.id === 'string' && 
               typeof discussion.notePath === 'string' &&
               Array.isArray(discussion.history);
    }

    // (private _generateDiscussionTitle removed - use public generateDiscussionTitle instead)

    // Discussion loading helper
    async _loadDiscussionsForNote(notePath) {
        if (!notePath || !this.plugin?.settings) return;
        
        try {
            // Load discussions from settings if not already loaded
            const settingsDiscussions = this.plugin.settings.discussions;
            
            if (settingsDiscussions && settingsDiscussions[notePath]) {
                const persistedNoteDiscussions = settingsDiscussions[notePath];

                // Ensure we have a Map for this notePath
                if (!this.discussions.has(notePath)) {
                    this.discussions.set(notePath, new Map());
                }
                const discussionMap = this.discussions.get(notePath);

                // Load each persisted discussion into the per-note Map
                for (const [discussionId, discussionData] of Object.entries(persistedNoteDiscussions)) {
                    if (!discussionMap.has(discussionId)) {
                        // Ensure discussion has proper structure
                        const normalizedDiscussion = {
                            id: discussionId,
                            title: discussionData.title || 'Untitled Discussion',
                            notePath: discussionData.notePath || notePath,
                            noteName: discussionData.noteName || notePath.split('/').pop(),
                            state: discussionData.state || 'SAVED',
                            startTime: discussionData.startTime ? new Date(discussionData.startTime) : new Date(),
                            lastUpdated: discussionData.lastUpdated ? new Date(discussionData.lastUpdated) : new Date(),
                            messageCount: discussionData.messageCount || (discussionData.history || []).length,
                            history: discussionData.history || [],
                            userMessageHistory: discussionData.userMessageHistory || [],
                            includePdfInContext: discussionData.includePdfInContext !== false,
                            includeNoteInContext: discussionData.includeNoteInContext !== false,
                            includedNotes: discussionData.includedNotes || []
                        };

                        discussionMap.set(discussionId, normalizedDiscussion);
                        this._addDiscussionToNote(discussionId, notePath);
                    }
                }
            }
            
            // Load the most recent discussion for this note
            const noteDiscussionIds = this.noteDiscussions.get(notePath);
            if (noteDiscussionIds && noteDiscussionIds.size > 0) {
                const recentDiscussions = Array.from(noteDiscussionIds)
                    .map(id => this.discussions.get(id))
                    .filter(d => d)
                    .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
                
                if (recentDiscussions.length > 0) {
                    // Use the new loadDiscussionNew method for now
                    if (this.loadDiscussionNew) {
                        await this.loadDiscussionNew(recentDiscussions[0].id);
                    }
                }
            }
            
        } catch (error) {
            console.warn('Failed to load discussions for note:', notePath, error);
        }
    }

    async startNewDiscussion() {
        if (!this.currentNoteFile) {
            this.addMessageToHistory('system', 'Please open a note or PDF first to start a discussion.');
            return;
        }

        // Save current discussion if it exists and has content
        if (this.currentDiscussionId && this.chatHistory.length > 0) {
            await this._saveCurrentDiscussion();
        }

        // Create new discussion
        const newDiscussionId = this.generateDiscussionId();
        this.currentDiscussionId = newDiscussionId;
        
        // Reset chat state
        this.chatHistory = [];
        this.userMessageHistory = [];
        this.messageHistoryIndex = -1;
        
        // Update UI
        this.renderChatHistory();
        this.updateNoteInfo();
        
        // Add system message
        
        // Mark as active
        const discussion = this._createDiscussion(newDiscussionId, this.currentNoteFile.path);
        discussion.state = 'ACTIVE';
        // Ensure per-note map exists and store discussion under the note's map
        if (!this.discussions.has(this.currentNoteFile.path) || !(this.discussions.get(this.currentNoteFile.path) instanceof Map)) {
            this.discussions.set(this.currentNoteFile.path, new Map());
        }
        const noteMap = this.discussions.get(this.currentNoteFile.path);
        noteMap.set(newDiscussionId, discussion);
        this._addDiscussionToNote(newDiscussionId, this.currentNoteFile.path);
    }

    async _saveCurrentDiscussion() {
        if (!this.currentNoteFile || !this.currentDiscussionId || this.chatHistory.length === 0) {
            return;
        }

        // Prevent concurrent saves
        if (this._saveInProgress) {
            this._pendingSave = true;
            return;
        }

        this._saveInProgress = true;
        
        try {
            const discussionData = this._createDiscussion(
                this.currentDiscussionId, 
                this.currentNoteFile.path
            );
            discussionData.state = 'SAVED';
            discussionData.lastUpdated = new Date();
            
            // Normalize message timestamps
            discussionData.history = this.chatHistory.map(m => ({
                ...m,
                isTyping: false,
                timestamp: m.timestamp instanceof Date 
                    ? m.timestamp.toISOString()
                    : new Date(m.timestamp || Date.now()).toISOString()
            })).filter(m => {
                const trimmed = m.content.trim();
                return trimmed.length > 0 && !/^(💭\s*)?Thinking\.\.\.$/i.test(trimmed);
            });

            // Save to per-note discussions map (new format)
            if (!this.discussions.has(this.currentNoteFile.path) || !(this.discussions.get(this.currentNoteFile.path) instanceof Map)) {
                this.discussions.set(this.currentNoteFile.path, new Map());
            }
            const noteMap = this.discussions.get(this.currentNoteFile.path);
            // Ensure messageCount matches normalized history
            discussionData.messageCount = (discussionData.history || []).length;
            noteMap.set(this.currentDiscussionId, discussionData);
            this._addDiscussionToNote(this.currentDiscussionId, this.currentNoteFile.path);

            // Update index
            this.discussionIndex.set(this.currentDiscussionId, {
                notePath: this.currentNoteFile.path,
                lastUpdated: discussionData.lastUpdated
            });

            // Update global discussion history (summary view)
            try {
                const summary = {
                    id: discussionData.id,
                    title: discussionData.title || 'Untitled Discussion',
                    noteFile: discussionData.notePath || this.currentNoteFile.path,
                    noteName: discussionData.noteName || (this.currentNoteFile ? this.currentNoteFile.basename : 'Unknown'),
                    startTime: discussionData.startTime || new Date(),
                    lastUpdated: discussionData.lastUpdated || new Date(),
                    messageCount: discussionData.messageCount || (discussionData.history || []).length,
                    // keep a light-weight history snippet for global view (optional)
                    history: (discussionData.history || []).slice(-3)
                };

                // Replace existing entry if present
                const existingIndex = this.globalDiscussionHistory.findIndex(d => d.id === summary.id);
                if (existingIndex !== -1) {
                    this.globalDiscussionHistory[existingIndex] = summary;
                } else {
                    // add to front (most recent first)
                    this.globalDiscussionHistory.unshift(summary);
                }

                // Trim to max 100 entries
                if (this.globalDiscussionHistory.length > 100) this.globalDiscussionHistory = this.globalDiscussionHistory.slice(0, 100);
            } catch (e) {
                console.warn('Failed to update globalDiscussionHistory', e);
            }
            
        } finally {
            this._saveInProgress = false;
            
            // Handle pending save
            if (this._pendingSave) {
                this._pendingSave = false;
                await this._saveCurrentDiscussion();
            }
        }
    }

    generateDiscussionTitle() {
        if (this.chatHistory.length === 0) return 'Empty Discussion';
        
        // Find first user message for title
        const firstUserMessage = this.chatHistory.find(m => m.role === 'user');
        if (firstUserMessage) {
            const content = firstUserMessage.content.trim();
            // Take first 50 characters and add ellipsis if longer
            return content.length > 50 ? content.substring(0, 50) + '...' : content;
        }
        
        return `Discussion ${new Date().toLocaleDateString()}`;
    }

    getDiscussionDisplayName() {
        if (!this.currentDiscussionId) return 'No Discussion';
        return this.currentDiscussionId.split('_')[1] || this.currentDiscussionId;
    }

    loadDiscussion(discussionId, noteFilePath = null) {
        if (!discussionId) return;

        // Save current discussion first (best-effort)
        if (this.currentDiscussionId && this.chatHistory.length > 0) {
            try { this._saveCurrentDiscussion(); } catch (e) { /* ignore */ }
        }

        // Attempt to locate the discussion data. The codebase historically used
        // different shapes: either `this.discussions` is a Map of notePath -> Map(discussionId->data)
        // or a flat map of discussionId -> data. Also there is a discussionIndex that maps
        // discussionId -> { notePath,... } which we can use as a hint.
        let discussionData = null;

        // 1) If caller provided a noteFilePath, try that first
        if (noteFilePath) {
            const noteMap = this.discussions.get(noteFilePath);
            if (noteMap && typeof noteMap.get === 'function') {
                discussionData = noteMap.get(discussionId);
            } else if (noteMap && noteMap[discussionId]) {
                discussionData = noteMap[discussionId];
            }
        }

        // 2) Try discussionIndex to find the notePath
        if (!discussionData && this.discussionIndex && typeof this.discussionIndex.get === 'function') {
            const idx = this.discussionIndex.get(discussionId);
            if (idx && idx.notePath) {
                const noteMap = this.discussions.get(idx.notePath);
                if (noteMap && typeof noteMap.get === 'function') discussionData = noteMap.get(discussionId);
            }
        }

        // 3) Scan per-note maps for the id
        if (!discussionData) {
            for (const [key, val] of this.discussions.entries()) {
                if (!val) continue;
                if (typeof val.get === 'function' && val.has(discussionId)) {
                    discussionData = val.get(discussionId);
                    break;
                } else if (val[discussionId]) {
                    discussionData = val[discussionId];
                    break;
                } else if (key === discussionId) {
                    // legacy: discussions may directly map id -> data
                    discussionData = val;
                    break;
                }
            }
        }

        // 4) Fallback: direct get
        if (!discussionData && typeof this.discussions.get === 'function') {
            discussionData = this.discussions.get(discussionId);
        }


        // Load discussion state
        this.currentDiscussionId = discussionId;

        // Restore chat history with normalization
        this.chatHistory = (discussionData.history || [])
            .map(m => normalizeMessage(m))
            .filter(m => {
                const trimmed = m.content.trim();
                return trimmed.length > 0 && !/^(💭\s*)?Thinking\.\.\.$/i.test(trimmed);
            });

        // Restore other state
        this.userMessageHistory = [...(discussionData.userMessageHistory || [])];
        this.includePdfInContext = discussionData.includePdfInContext !== undefined ? !!discussionData.includePdfInContext : true;
        this.includeNoteInContext = discussionData.includeNoteInContext !== undefined ? !!discussionData.includeNoteInContext : true;

        // Restore included notes
        this._deserializeIncludedNotes(discussionData.includedNotes);

        // Update UI
        this.hideHistoryPanels();
        this.renderChatHistory();
        this.updateNoteInfo();

        // Update discussion state
        discussionData.state = 'ACTIVE';
        discussionData.lastUpdated = new Date();

        // Notify user
        notify(`Loaded discussion: ${discussionData.title}`);
        // Re-render the history panels so current selection highlights correctly
        try { this.renderDiscussionHistory(); this.renderGlobalHistory(); } catch (e) {}
    }

    toggleDiscussionHistory() {
        this.showingDiscussionHistory = !this.showingDiscussionHistory;
        this.showingGlobalHistory = false; // Hide global when showing note history
        this.renderDiscussionHistory();
    }

    toggleGlobalHistory() {
        this.showingGlobalHistory = !this.showingGlobalHistory;
        this.showingDiscussionHistory = false; // Hide note history when showing global
        this.renderGlobalHistory();
    }

    hideHistoryPanels() {
        this.showingDiscussionHistory = false;
        this.showingGlobalHistory = false;
        if (this.discussionHistoryPanel) {
            this.discussionHistoryPanel.style.display = 'none';
        }
        if (this.globalHistoryPanel) {
            this.globalHistoryPanel.style.display = 'none';
        }
    }

    async saveConversation() {
        return this.persistSvc.saveConversation();
    }

    // Save an assistant response for a specific note path/discussion (used when responses return after the user switched notes)
    _saveAssistantResponseToPath(notePath, discussionId, messageObj) {
        return this.persistSvc.saveAssistantResponseToPath(notePath, discussionId, messageObj);
    }

    async loadConversation() {
        return this.persistSvc.loadConversation();
    }

    // Try to add an included note by a vault path. Accepts absolute or vault-relative paths.
    async addIncludedNoteByPath(path) {
        if (!path) return;
        // Normalize: remove file:// prefix if present
        let candidate = path.replace(/^file:\/\//, '').trim();
        candidate = decodeURIComponent(candidate);
        // If it's just a basename, try to search for it
        let file = this.app.vault.getAbstractFileByPath(candidate);
        if (!file && !candidate.endsWith('.md')) {
            file = this.app.vault.getAbstractFileByPath(candidate + '.md');
        }
        if (!file && candidate.startsWith('/')) {
            // remove leading slash
            file = this.app.vault.getAbstractFileByPath(candidate.slice(1));
            if (!file && !candidate.endsWith('.md')) {
                file = this.app.vault.getAbstractFileByPath(candidate.slice(1) + '.md');
            }
        }
        if (!file) {
            // Try to find by name
            return this.addIncludedNoteByName(candidate.replace(/\\/g, '/').split('/').pop().replace(/\.md$/i, ''));
        }
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        await this._loadIncludedNoteEntry(file.path, file);
        await this.saveConversation();
        this.updateNoteInfo();
    }

    // Try to find a note by display name/title and include it
    async addIncludedNoteByName(name) {
        if (!name) return;
        // If the user pasted/dropped an obsidian://open URI, try to extract the file param
        try {
            if (typeof name === 'string' && name.startsWith('obsidian://')) {
                const url = new URL(name);
                const fileParam = url.searchParams.get('file');
                if (fileParam) {
                    // fileParam is URL-encoded; convert to vault-relative path
                    const decoded = decodeURIComponent(fileParam);
                    // Some URIs use / separators, ensure we normalize
                    const candidatePath = decoded.replace(/^\//, '');
                    return await this.addIncludedNoteByPath(candidatePath);
                }
            }
        } catch (e) {
            // ignore parse errors and fall back to name matching
        }
        // First try exact filename match
        const vaultFiles = this.app.vault.getFiles();
        const lower = name.toLowerCase();
        let match = vaultFiles.find(f => f.basename.toLowerCase() === lower || f.path.toLowerCase() === lower || f.name.toLowerCase() === lower);
        if (!match) {
            // Try contains
            match = vaultFiles.find(f => f.basename.toLowerCase().includes(lower) || f.path.toLowerCase().includes(lower));
        }
        if (!match) {
            // For obsidian:// URIs, prefer showing the decoded file param for clarity
            let label = name;
            try {
                if (name.startsWith('obsidian://')) {
                    const url = new URL(name);
                    const fileParam = url.searchParams.get('file');
                    if (fileParam) label = decodeURIComponent(fileParam);
                }
            } catch (_) {}
            this.addMessageToHistory('system', `No note found matching "${label}"`);
            return;
        }
        await this._loadIncludedNoteEntry(match.path, match);
        await this.saveConversation();
        this.updateNoteInfo();
    }

    // Load a file's content and add to includedNotes map
    async _loadIncludedNoteEntry(path, file) {
        return this.stateSvc.loadIncludedNoteEntry(path, file);
    }

    renderChatHistory() {
        if (!this.chatMessagesEl) return;

        // delegate to UI helper
        this.uiSvc.renderChatHistory();
    }

    renderDiscussionHistory() {
        if (!this.discussionHistoryPanel) return;
        this.uiSvc.renderDiscussionHistory();
    }

    renderGlobalHistory() {
        if (!this.globalHistoryPanel) return;
        this.uiSvc.renderGlobalHistory();
    }

    deleteDiscussion(discussionId, noteFilePath = null) {
        const targetPath = noteFilePath || this.currentNoteFile?.path;
        if (!targetPath) return;
        // Always confirm destructive action using ConfirmModal
        try {
            const noteDiscussions = this.discussions.get(targetPath);
            const title = noteDiscussions && noteDiscussions.has(discussionId) ? (noteDiscussions.get(discussionId).title || 'Untitled') : 'Discussion';
            const modal = new ConfirmModal(this.app, `Are you sure you want to delete discussion "${title}"? This cannot be undone.`, () => {
                try {
                    // Remove from note discussions
                    const noteDiscussions = this.discussions.get(targetPath);
                    if (noteDiscussions) {
                        noteDiscussions.delete(discussionId);
                        if (noteDiscussions.size === 0) {
                            this.discussions.delete(targetPath);
                        }
                    }

                    // Remove from global history
                    this.globalDiscussionHistory = this.globalDiscussionHistory.filter(d => d.id !== discussionId);

                    // If this was the current discussion, clear it
                    if (this.currentDiscussionId === discussionId) {
                        this.currentDiscussionId = null;
                        this.chatHistory = [];
                        this.userMessageHistory = [];
                        this.messageHistoryIndex = -1;
                        this.renderChatHistory();
                    }

                    // Re-render history panels
                    this.renderDiscussionHistory();
                    this.renderGlobalHistory();
                    this.saveConversation();

                    this.addMessageToHistory('system', 'Discussion deleted.');
                    } catch (e) {
                        console.error('Error deleting discussion:', e);
                        notifyError('Failed to delete discussion. See console for details.', e);
                    }
                });
                modal.open();
            } catch (e) {
                // if modal can't open for some reason, fall back to non-confirmed deletion
                console.error('Confirm modal failed', e);
            }
    }

    // normalizeMessage is provided by chat-utils.js

    async clearChat() {
        // Save current discussion before clearing if it has content
        if (this.currentDiscussionId && this.chatHistory.length > 0) {
            await this._saveCurrentDiscussion();
        }

        this.chatHistory = [];
        this.userMessageHistory = [];
        this.messageHistoryIndex = -1;
        this.currentDiscussionId = null; // Clear current discussion
        this.renderChatHistory();
        await this.saveConversation(); // Save the cleared state
    }

    navigateMessageHistory(direction) {
        if (this.userMessageHistory.length === 0) return;

        this.messageHistoryIndex += direction;
        
        // Clamp the index
        if (this.messageHistoryIndex < -1) {
            this.messageHistoryIndex = -1;
        } else if (this.messageHistoryIndex >= this.userMessageHistory.length) {
            this.messageHistoryIndex = this.userMessageHistory.length - 1;
        }

        // Set the message input
        if (this.messageHistoryIndex === -1) {
            this.messageInput.value = '';
        } else {
            this.messageInput.value = this.userMessageHistory[this.userMessageHistory.length - 1 - this.messageHistoryIndex];
        }
        
        this.autoResizeTextarea();
    }

    autoResizeTextarea() {
        // Use createAutoResizer from helpers to perform resizing
        if (!this._autoResizer && this.messageInput) {
            try {
                const creator = require('./chat-helpers').createAutoResizer;
                this._autoResizer = creator(this.messageInput, 200);
            } catch (e) {
                // Fallback to simple inline behavior
                const textarea = this.messageInput;
                if (!textarea) return;
                textarea.style.height = 'auto';
                const newHeight = Math.min(textarea.scrollHeight, 200);
                textarea.style.height = newHeight + 'px';
                return;
            }
        }
        if (this._autoResizer) this._autoResizer();
    }

    async testApiConnection() {
        const testId = this.addMessageToHistory('system', 'Testing API connection...');
        
        try {
            await this.plugin.llmService.testApi();
            this.updateMessageInHistory(testId, '✅ API connection successful! Your API key and endpoint are working correctly.');
        } catch (error) {
            console.error('API test error:', error);
            let errorMessage = '❌ API test failed: ';
            
            if (error.message.includes('status 401')) {
                errorMessage += 'Authentication failed. Your API key is invalid or expired.\n\nSteps to fix:\n1. Check your OpenRouter dashboard\n2. Verify your API key is active\n3. Ensure your account has credits';
            } else if (error.message.includes('status 403')) {
                errorMessage += 'Access forbidden. Your API key may not have permission for the selected model.';
            } else {
                errorMessage += error.message;
            }
            
            this.updateMessageInHistory(testId, errorMessage);
        }
    }

    toggleSearch() {
        // Simple search implementation
        const searchTerm = prompt('Search conversation:');
        if (!searchTerm) return;

        const matches = this.chatHistory.filter(msg => 
            msg.content.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (matches.length === 0) {
            this.addMessageToHistory('system', `No messages found containing "${searchTerm}"`);
            return;
        }

        let resultText = `Found ${matches.length} message(s) containing "${searchTerm}":\n\n`;
        matches.forEach((msg, index) => {
            const time = msg.timestamp.toLocaleTimeString();
            const preview = msg.content.length > 100 ? 
                msg.content.substring(0, 100) + '...' : 
                msg.content;
            resultText += `${index + 1}. [${time}] ${msg.role}: ${preview}\n\n`;
        });

        this.addMessageToHistory('system', resultText);
    }

    async exportConversation() {
        if (this.chatHistory.length === 0) {
            this.addMessageToHistory('system', 'No conversation to export.');
            return;
        }

        const exportData = {
            paper: this.currentNoteFile?.basename || 'Unknown',
            exportDate: new Date().toISOString(),
            messageCount: this.chatHistory.length,
            conversation: this.chatHistory.map(msg => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp.toISOString()
            }))
        };

        const exportText = `# Chat Export: ${exportData.paper}
Exported: ${new Date().toLocaleString()}
Messages: ${exportData.messageCount}

---

${exportData.conversation.map(msg => 
`**${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}** (${new Date(msg.timestamp).toLocaleString()}):
${msg.content}

---`).join('\n')}`;

        try {
            await navigator.clipboard.writeText(exportText);
            this.addMessageToHistory('system', '✅ Conversation exported to clipboard!');
        } catch (error) {
            console.error('Export failed:', error);
            this.addMessageToHistory('system', '❌ Failed to export conversation. Check console for details.');
        }
    }

    addStyles() {
        // delegate to UI helper
        this.uiSvc.addStyles();
    }

    async onClose() {
        // Clean up event listeners
        this.chatHistory = [];
    }
}

module.exports = { ChatPanelView, CHAT_PANEL_VIEW_TYPE };