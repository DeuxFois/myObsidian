const { ItemView, TFile } = require('obsidian');

// Define a unique identifier for our chat panel view
const CHAT_PANEL_VIEW_TYPE = "chat-panel-view";

class ChatPanelView extends ItemView {
    constructor(leaf, settings, plugin) {
        super(leaf);
        this.settings = settings;
        this.plugin = plugin;
        this.chatHistory = [];
        this.currentNoteContent = '';
        this.currentPdfContent = '';
        this.currentNoteFile = null;
        this.messageHistoryIndex = -1; // For navigating sent messages
        this.userMessageHistory = []; // Store user messages for navigation
        this.isUserScrolling = false; // Track if user is manually scrolling
        this.conversations = new Map(); // Store conversations per paper
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
        // Listen for active file changes
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.updateCurrentNote();
            })
        );

        // Listen for file content changes
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file === this.currentNoteFile) {
                    this.updateCurrentNote();
                }
            })
        );
    }

    async updateCurrentNote() {
        const activeFile = this.app.workspace.getActiveFile();
        
        if (!activeFile || activeFile.extension !== 'md') {
            // Save current conversation before switching
            if (this.currentNoteFile) {
                await this.saveConversation();
            }
            
            this.currentNoteFile = null;
            this.currentNoteContent = '';
            this.currentPdfContent = '';
            this.chatHistory = [];
            this.userMessageHistory = [];
            this.messageHistoryIndex = -1;
            this.updateNoteInfo();
            this.renderChatHistory();
            return;
        }

        // Save current conversation before switching to new file
        if (this.currentNoteFile && this.currentNoteFile.path !== activeFile.path) {
            await this.saveConversation();
        }

        this.currentNoteFile = activeFile;
        
        try {
            // Read note content
        this.currentNoteContent = await this.app.vault.read(activeFile);
            
            // Check for associated PDF
            this.currentPdfContent = '';
            this.pdfExtractionError = null;  // Clear previous PDF errors
            const paperData = this.plugin.paperService.paperIndex.get(activeFile.path);
            
            console.log('Chat Panel Debug - PDF Detection:', {
                activeFilePath: activeFile.path,
                paperDataExists: !!paperData,
                paperData: paperData,
                frontmatter: paperData?.frontmatter,
                pdfFile: paperData?.frontmatter?.pdf_file
            });
            
            if (paperData && paperData.frontmatter && paperData.frontmatter.pdf_file) {
                try {
                    // Handle pdf_file path resolution (similar to paper-service.js)
                    let logicalPath = String(paperData.frontmatter.pdf_file);
                    // If frontmatter contains only a filename, resolve relative to the note's folder
                    if (!logicalPath.includes('/') && activeFile.parent && activeFile.parent.path) {
                        logicalPath = `${activeFile.parent.path}/${logicalPath}`;
                    }
                    
                    // Try to resolve the logical path to effective path
                    let effectivePath = logicalPath;
                    if (this.plugin.fileService && this.plugin.fileService.resolveLogicalToEffectivePath) {
                        effectivePath = await this.plugin.fileService.resolveLogicalToEffectivePath(logicalPath);
                    }
                    
                    const pdfFile = this.app.vault.getAbstractFileByPath(effectivePath);
                    console.log('Chat Panel Debug - PDF File:', {
                        originalPdfFile: paperData.frontmatter.pdf_file,
                        logicalPath: logicalPath,
                        effectivePath: effectivePath,
                        pdfFileExists: !!pdfFile,
                        pdfFileType: pdfFile?.constructor?.name,
                        pdfExtension: pdfFile?.extension
                    });
                    
                    if (pdfFile instanceof TFile && pdfFile.extension === 'pdf') {
                        console.log('Chat Panel Debug - Extracting PDF text...');
                        try {
                            this.currentPdfContent = await this.plugin.pdfService.extractTextFromPdf(pdfFile);
                            console.log('Chat Panel Debug - PDF extraction complete:', {
                                textLength: this.currentPdfContent.length,
                                preview: this.currentPdfContent.slice(0, 200) + '...'
                            });
                        } catch (pdfExtractionError) {
                            console.warn('PDF extraction failed:', pdfExtractionError);
                            // Store the error details for user feedback
                            this.pdfExtractionError = pdfExtractionError.message;
                        }
                    }
                } catch (pdfError) {
                    console.warn('Could not extract PDF content for chat:', pdfError);
                }
            }
            
            this.updateNoteInfo();
            
            // Load conversation for this paper
            await this.loadConversation();
        } catch (error) {
            console.error('Error updating current note for chat:', error);
        }
    }

    updateNoteInfo() {
        const noteInfoEl = this.contentEl.querySelector('.chat-note-info');
        if (!noteInfoEl) return;

        if (this.currentNoteFile) {
            const hasPdf = this.currentPdfContent.length > 0;
            const paperData = this.plugin.paperService.paperIndex.get(this.currentNoteFile.path);
            const pdfFile = paperData?.frontmatter?.pdf_file;
            
            let pdfStatusText = '';
            if (hasPdf) {
                pdfStatusText = ` • 📋 PDF attached (${this.currentPdfContent.length} chars)`;
            } else if (pdfFile && this.pdfExtractionError) {
                if (this.pdfExtractionError.includes('PDF.js not available')) {
                    pdfStatusText = ` • ⚠️ PDF found but PDF.js not loaded - try opening a PDF file first`;
                } else {
                    pdfStatusText = ` • ⚠️ PDF extraction failed: ${this.pdfExtractionError}`;
                }
            } else if (pdfFile) {
                pdfStatusText = ` • ⚠️ PDF file found but not loaded: ${pdfFile}`;
            } else {
                pdfStatusText = ' • No PDF file in frontmatter';
            }
            
            noteInfoEl.innerHTML = `
                <div class="chat-current-note">
                    <div class="note-name">${this.currentNoteFile.basename}</div>
                    <div class="note-status">
                        📄 Note (${this.currentNoteContent.length} chars)${pdfStatusText}
                    </div>
                </div>
            `;
        } else {
            noteInfoEl.innerHTML = `
                <div class="chat-no-note">
                    <div class="no-note-message">No active note</div>
                    <div class="no-note-help">Open a markdown file to start chatting about it</div>
                </div>
            `;
        }
    }

    async renderView() {
        const container = this.contentEl || this.containerEl.children[1];
        container.empty();
        container.addClass('chat-panel-container');

        // Header with current note info
        const header = container.createEl('div', { cls: 'chat-panel-header' });
        header.createEl('h3', { text: 'Chat with Note', cls: 'chat-panel-title' });
        
        const noteInfo = header.createEl('div', { cls: 'chat-note-info' });

        // Chat messages area
        const chatArea = container.createEl('div', { cls: 'chat-messages-area' });
        this.chatMessagesEl = chatArea;

        // Add scroll event listener for scroll lock functionality
        chatArea.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = chatArea;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5; // 5px threshold
            this.isUserScrolling = !isAtBottom;
        });

        // Input area
        const inputArea = container.createEl('div', { cls: 'chat-input-area' });
        
        const inputContainer = inputArea.createEl('div', { cls: 'chat-input-container' });
        
        this.messageInput = inputContainer.createEl('textarea', {
            cls: 'chat-message-input',
            attr: {
                placeholder: 'Ask questions about the current note and PDF...',
                rows: '3'
            }
        });
        
        const sendButton = inputContainer.createEl('button', {
            cls: 'chat-send-button',
            text: 'Send'
        });

        // Event listeners
        sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    // Shift+Enter: Allow new line (default behavior)
                    return;
                } else if (e.ctrlKey || e.metaKey) {
                    // Ctrl+Enter: Send message (legacy support)
                    e.preventDefault();
                    this.sendMessage();
                } else {
                    // Enter: Send message (primary behavior)
                    e.preventDefault();
                    this.sendMessage();
                }
            } else if (e.key === 'Escape') {
                // Escape: Clear input
                e.preventDefault();
                this.messageInput.value = '';
                this.messageInput.style.height = 'auto'; // Reset height if auto-resizing
            } else if (e.key === 'ArrowUp' && e.ctrlKey) {
                // Ctrl+Up: Navigate to previous message for editing
                e.preventDefault();
                this.navigateMessageHistory(-1);
            } else if (e.key === 'ArrowDown' && e.ctrlKey) {
                // Ctrl+Down: Navigate to next message for editing
                e.preventDefault();
                this.navigateMessageHistory(1);
            }
        });

        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => {
            this.autoResizeTextarea();
        });

        // Clear chat button
        const clearButton = inputArea.createEl('button', {
            cls: 'chat-clear-button',
            text: 'Clear Chat'
        });
        clearButton.addEventListener('click', () => this.clearChat());

        // Search button
        const searchButton = inputArea.createEl('button', {
            cls: 'chat-search-button',
            text: 'Search'
        });
        searchButton.addEventListener('click', () => this.toggleSearch());

        // Export conversation button
        const exportButton = inputArea.createEl('button', {
            cls: 'chat-export-button',
            text: 'Export'
        });
        exportButton.addEventListener('click', () => this.exportConversation());

        // Test API button
        const testApiButton = inputArea.createEl('button', {
            cls: 'chat-test-api-button',
            text: 'Test API'
        });
        testApiButton.addEventListener('click', () => this.testApiConnection());

        await this.updateCurrentNote();
        this.renderChatHistory();

        // Add CSS styles
        this.addStyles();
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        if (!this.currentNoteFile) {
            this.addMessageToHistory('system', 'Please open a markdown file first.');
            return;
        }

        // Store user message for history navigation
        this.userMessageHistory.push(message);
        this.messageHistoryIndex = -1; // Reset navigation

        // Add user message to history
        this.addMessageToHistory('user', message);
        this.messageInput.value = '';
        this.autoResizeTextarea();

        // Show typing indicator
        const thinkingId = this.addMessageToHistory('assistant', '💭 Thinking...', true);

        try {
            // Prepare context for LLM
            let context = `Current Note: ${this.currentNoteFile.basename}\n\nNote Content:\n${this.currentNoteContent}`;
            
            console.log('Chat Panel Debug - Context Preparation:', {
                noteContentLength: this.currentNoteContent.length,
                pdfContentLength: this.currentPdfContent.length,
                hasPdfContent: !!this.currentPdfContent
            });
            
            if (this.currentPdfContent) {
                const pdfContentToAdd = this.currentPdfContent.slice(0, 50000);
                context += `\n\n--- Associated PDF Content ---\n${pdfContentToAdd}`;
                console.log('Chat Panel Debug - Added PDF to context:', {
                    originalPdfLength: this.currentPdfContent.length,
                    addedPdfLength: pdfContentToAdd.length,
                    finalContextLength: context.length
                });
            }

            // Create conversation history for context
            const conversationHistory = this.chatHistory
                .filter(msg => msg.role !== 'system')
                .slice(-10) // Keep last 10 messages for context
                .map(msg => `${msg.role}: ${msg.content}`)
                .join('\n');

            const systemPrompt = `You are a helpful research assistant. You are chatting with a user about their current note and any associated PDF content. 

Context:
${context}

Previous conversation:
${conversationHistory}

Please provide helpful, accurate responses based on the note and PDF content. If the user asks about something not in the provided content, let them know that information isn't available in the current materials.`;

            const response = await this.plugin.llmService.callLLMWithPrompt(systemPrompt, message);
            
            // Replace thinking message with actual response
            this.updateMessageInHistory(thinkingId, response);
            
        } catch (error) {
            console.error('Chat error:', error);
            let errorMessage = 'An error occurred while processing your request.';
            
            if (error.message.includes('status 401')) {
                errorMessage = '❌ Authentication failed. Please check your API key in settings.\n\nTo fix this:\n1. Go to Settings > Research Assistant\n2. Verify your API key is correct\n3. Make sure your OpenRouter account has credits\n4. Try the "Test LLM API" command';
            } else if (error.message.includes('status 403')) {
                errorMessage = '❌ Access forbidden. Your API key may not have permission for this model.';
            } else if (error.message.includes('status 429')) {
                errorMessage = '❌ Rate limit exceeded. Please wait a moment and try again.';
            } else if (error.message.includes('status 500')) {
                errorMessage = '❌ Server error. Please try again later.';
            } else {
                errorMessage = `❌ Error: ${error.message}`;
            }
            
            this.updateMessageInHistory(thinkingId, errorMessage);
        }
    }

    addMessageToHistory(role, content, isTyping = false) {
        const messageId = Date.now() + Math.random();
        this.chatHistory.push({
            id: messageId,
            role,
            content,
            timestamp: new Date(),
            isTyping: isTyping
        });
        this.renderChatHistory();
        return messageId;
    }

    updateMessageInHistory(messageId, newContent) {
        const message = this.chatHistory.find(msg => msg.id === messageId);
        if (message) {
            message.content = newContent;
            message.isTyping = false; // Remove typing indicator
            this.renderChatHistory();
            this.saveConversation(); // Save when message is updated
        }
    }

    deleteMessage(messageId) {
        this.chatHistory = this.chatHistory.filter(msg => msg.id !== messageId);
        this.renderChatHistory();
        this.saveConversation();
    }

    async saveConversation() {
        if (!this.currentNoteFile) return;
        
        // Save conversation to the conversations map
        this.conversations.set(this.currentNoteFile.path, {
            history: [...this.chatHistory],
            userMessageHistory: [...this.userMessageHistory],
            lastUpdated: new Date()
        });

        // Optionally persist to plugin settings (for session persistence)
        if (this.plugin.settings) {
            try {
                const conversationsData = {};
                for (const [path, conversation] of this.conversations.entries()) {
                    // Only keep last 50 messages per conversation to avoid storage bloat
                    conversationsData[path] = {
                        ...conversation,
                        history: conversation.history.slice(-50)
                    };
                }
                this.plugin.settings.chatConversations = conversationsData;
                await this.plugin.saveSettings();
            } catch (error) {
                console.warn('Failed to save chat conversations:', error);
            }
        }
    }

    async loadConversation() {
        if (!this.currentNoteFile) return;

        const filePath = this.currentNoteFile.path;
        
        // First check memory
        if (this.conversations.has(filePath)) {
            const conversation = this.conversations.get(filePath);
            this.chatHistory = [...conversation.history];
            this.userMessageHistory = [...conversation.userMessageHistory];
            this.renderChatHistory();
            return;
        }

        // Then check persisted settings
        if (this.plugin.settings?.chatConversations?.[filePath]) {
            const conversation = this.plugin.settings.chatConversations[filePath];
            this.chatHistory = conversation.history || [];
            this.userMessageHistory = conversation.userMessageHistory || [];
            this.conversations.set(filePath, conversation);
            this.renderChatHistory();
            return;
        }

        // No existing conversation, start fresh
        this.chatHistory = [];
        this.userMessageHistory = [];
        this.messageHistoryIndex = -1;
        this.renderChatHistory();
    }

    renderChatHistory() {
        if (!this.chatMessagesEl) return;

        this.chatMessagesEl.empty();

        this.chatHistory.forEach(message => {
            const messageEl = this.chatMessagesEl.createEl('div', {
                cls: `chat-message chat-message-${message.role}${message.isTyping ? ' typing' : ''}`
            });

            const headerEl = messageEl.createEl('div', { cls: 'chat-message-header' });
            headerEl.createEl('span', {
                cls: 'chat-message-role',
                text: message.role === 'user' ? 'You' : 'Assistant'
            });
            
            // Format timestamp
            const timeStr = message.timestamp.toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            headerEl.createEl('span', {
                cls: 'chat-message-time',
                text: timeStr
            });

            const contentEl = messageEl.createEl('div', {
                cls: 'chat-message-content'
            });

            // Handle markdown rendering for assistant messages
            if (message.role === 'assistant' && !message.isTyping) {
                // Basic markdown rendering
                let content = message.content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/`(.*?)`/g, '<code>$1</code>')
                    .replace(/\n/g, '<br>');
                contentEl.innerHTML = content;
            } else {
                contentEl.textContent = message.content;
            }

            // Add message actions
            const actionsEl = messageEl.createEl('div', { cls: 'chat-message-actions' });
            
            // Copy button
            const copyBtn = actionsEl.createEl('button', {
                cls: 'chat-action-button',
                title: 'Copy message'
            });
            copyBtn.innerHTML = '📋';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(message.content);
                // Show brief feedback
                copyBtn.innerHTML = '✓';
                setTimeout(() => copyBtn.innerHTML = '📋', 1000);
            });

            // Delete button for user messages
            if (message.role === 'user') {
                const deleteBtn = actionsEl.createEl('button', {
                    cls: 'chat-action-button chat-delete-button',
                    title: 'Delete message'
                });
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.addEventListener('click', () => {
                    this.deleteMessage(message.id);
                });
            }
        });

        // Auto-scroll to bottom only if user isn't manually scrolling
        if (!this.isUserScrolling) {
            setTimeout(() => {
                this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
            }, 10);
        }
    }

    clearChat() {
        this.chatHistory = [];
        this.userMessageHistory = [];
        this.messageHistoryIndex = -1;
        this.renderChatHistory();
        this.saveConversation(); // Save the cleared state
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
        const textarea = this.messageInput;
        textarea.style.height = 'auto';
        const newHeight = Math.min(textarea.scrollHeight, 200); // Max 200px height
        textarea.style.height = newHeight + 'px';
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
        const styleId = 'chat-panel-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .chat-panel-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                padding: 10px;
            }

            .chat-panel-header {
                margin-bottom: 10px;
                border-bottom: 1px solid var(--background-modifier-border);
                padding-bottom: 10px;
            }

            .chat-panel-title {
                margin: 0 0 10px 0;
                font-size: 16px;
                font-weight: 600;
            }

            .chat-note-info {
                font-size: 12px;
                color: var(--text-muted);
            }

            .chat-current-note .note-name {
                font-weight: 500;
                color: var(--text-normal);
            }

            .chat-current-note .note-status {
                margin-top: 2px;
            }

            .chat-no-note {
                text-align: center;
                padding: 10px;
                background: var(--background-secondary);
                border-radius: 4px;
            }

            .no-note-message {
                font-weight: 500;
                margin-bottom: 4px;
            }

            .no-note-help {
                font-size: 11px;
                opacity: 0.7;
            }

            .chat-messages-area {
                flex: 1;
                overflow-y: auto;
                margin-bottom: 10px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                padding: 10px;
                min-height: 200px;
            }

            .chat-message {
                margin-bottom: 15px;
                padding: 8px;
                border-radius: 6px;
                position: relative;
                transition: all 0.2s ease;
            }

            .chat-message:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }

            .chat-message.typing {
                animation: typing-pulse 1.5s infinite;
            }

            @keyframes typing-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }

            .chat-message-user {
                background: var(--background-secondary);
                margin-left: 20px;
                border-left: 3px solid var(--interactive-accent);
            }

            .chat-message-assistant {
                background: var(--background-primary-alt);
                margin-right: 20px;
                border-left: 3px solid var(--text-accent);
            }

            .chat-message-system {
                background: var(--background-modifier-error);
                text-align: center;
                font-style: italic;
                margin: 10px;
            }

            .chat-message-header {
                display: flex;
                justify-content: space-between;
                margin-bottom: 5px;
                font-size: 11px;
                opacity: 0.7;
            }

            .chat-message-role {
                font-weight: 500;
            }

            .chat-message-content {
                white-space: pre-wrap;
                line-height: 1.4;
                margin-bottom: 5px;
            }

            .chat-message-content code {
                background: var(--code-background);
                padding: 2px 4px;
                border-radius: 3px;
                font-family: var(--font-monospace);
                font-size: 0.9em;
            }

            .chat-message-content strong {
                font-weight: 600;
                color: var(--text-normal);
            }

            .chat-message-content em {
                font-style: italic;
                color: var(--text-muted);
            }

            .chat-message-actions {
                display: flex;
                gap: 4px;
                margin-top: 5px;
                opacity: 0;
                transition: opacity 0.2s ease;
            }

            .chat-message:hover .chat-message-actions {
                opacity: 1;
            }

            .chat-action-button {
                background: none;
                border: none;
                cursor: pointer;
                padding: 2px 4px;
                border-radius: 3px;
                font-size: 12px;
                opacity: 0.7;
                transition: all 0.2s ease;
            }

            .chat-action-button:hover {
                opacity: 1;
                background: var(--background-modifier-hover);
            }

            .chat-delete-button:hover {
                background: var(--background-modifier-error);
                color: var(--text-on-accent);
            }

            .chat-input-area {
                border-top: 1px solid var(--background-modifier-border);
                padding-top: 10px;
            }

            .chat-input-container {
                display: flex;
                gap: 8px;
                margin-bottom: 8px;
            }

            .chat-message-input {
                flex: 1;
                resize: none;
                min-height: 60px;
                max-height: 200px;
                padding: 8px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background: var(--background-primary);
                color: var(--text-normal);
                font-family: inherit;
                line-height: 1.4;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }

            .chat-message-input:focus {
                outline: none;
                border-color: var(--interactive-accent);
                box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
            }

            .chat-send-button {
                padding: 8px 16px;
                background: var(--interactive-accent);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
            }

            .chat-send-button:hover {
                background: var(--interactive-accent-hover);
            }

            .chat-clear-button,
            .chat-search-button,
            .chat-export-button,
            .chat-test-api-button {
                padding: 4px 8px;
                background: var(--interactive-normal);
                color: var(--text-normal);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                margin-right: 8px;
                transition: all 0.2s ease;
            }

            .chat-clear-button:hover,
            .chat-search-button:hover,
            .chat-export-button:hover,
            .chat-test-api-button:hover {
                background: var(--interactive-hover);
                transform: translateY(-1px);
            }

            .chat-clear-button {
                background: var(--background-secondary);
                color: var(--text-muted);
            }

            .chat-search-button {
                background: var(--interactive-accent);
                color: white;
            }

            .chat-export-button {
                background: var(--text-accent);
                color: white;
            }
        `;
        document.head.appendChild(style);
    }

    async onClose() {
        // Clean up event listeners
        this.chatHistory = [];
    }
}

module.exports = { ChatPanelView, CHAT_PANEL_VIEW_TYPE };