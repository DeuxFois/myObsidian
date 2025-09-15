const { Plugin, Notice, TFile } = require('obsidian');

// Import all our modular components
const { DEFAULT_SETTINGS } = require('./config/constants');
const LLMService = require('./services/llm-service');
const MetadataService = require('./services/metadata-service');
const FileService = require('./services/file-service');
const PaperService = require('./services/paper-service');
const PdfService = require('./services/pdf-service');
const { PaperExplorerView, PAPER_EXPLORER_VIEW_TYPE } = require('./ui/paper-explorer-view');
const { ChatPanelView, CHAT_PANEL_VIEW_TYPE } = require('./ui/chat-panel-view');
const PaperModal = require('./ui/paper-modal');
const RASettingTab = require('./ui/settings-tab');
const { generatePdfFileName } = require('./utils/formatters');

/**
 * Main plugin class for the Research Assistant
 */
class ResearchAssistantPlugin extends Plugin {
    constructor() {
        super(...arguments);
        this._activeSector = 'All';
    }

    async onload() {
        await this.loadSettings();
        this.initializeServices();
        this.setupEventHandlers();
        this.registerViews();
        this.registerCommands();
        this.addSettingTab(new RASettingTab(this.app, this));
        
        console.log('Research Assistant plugin loaded.');
    }

    /**
     * Initialize all service instances
     */
    initializeServices() {
        this.llmService = new LLMService(this.settings);
        this.metadataService = new MetadataService();
        this.fileService = new FileService(this.app, this.settings);
        this.pdfService = new PdfService(this.app, this.settings);
        this.paperService = new PaperService(this.app, this.settings, this.fileService, this.pdfService);
    }

    /**
     * Set up event handlers for file system changes
     */
    setupEventHandlers() {
        this.app.workspace.onLayoutReady(async () => {
            await this.paperService.buildPaperIndex();
            this.registerEvent(this.app.vault.on('create', this.handleFileCreate.bind(this)));
            this.registerEvent(this.app.vault.on('delete', this.handleFileDelete.bind(this)));
            this.registerEvent(this.app.vault.on('rename', this.handleFileRename.bind(this)));
            this.registerEvent(this.app.metadataCache.on('changed', this.handleMetadataChange.bind(this)));
        });
    }

    /**
     * Register views and ribbon icons
     */
    registerViews() {
        this.registerView(
            PAPER_EXPLORER_VIEW_TYPE,
            (leaf) => new PaperExplorerView(leaf, this.settings, this)
        );

        this.registerView(
            CHAT_PANEL_VIEW_TYPE,
            (leaf) => new ChatPanelView(leaf, this.settings, this)
        );

        this.addRibbonIcon('library', 'Open Paper Explorer', () => {
            this.openMasterIndexInMainView().then(() => this.activateView());
        });

        this.addRibbonIcon('message-circle', 'Open Note Chat', () => {
            this.activateChatView();
        });
    }

    /**
     * Register plugin commands
     */
    registerCommands() {
        this.addCommand({
            id: 'add-research-paper',
            name: 'Add Research Paper',
            callback: () => this.openAddPaperModal()
        });
        
        this.addCommand({
            id: 'open-paper-explorer',
            name: 'Open Paper Explorer',
            callback: () => {
                this.openMasterIndexInMainView().then(() => this.activateView());
            }
        });

        this.addCommand({
            id: 'generate-resume-all-papers',
            name: 'Generate Resume for All Papers',
            callback: () => this.paperService.generateResumeForPapers(this.llmService)
        });

        this.addCommand({
            id: 'generate-tags-all-papers',
            name: 'Generate Tags for All Papers',
            callback: () => this.paperService.generateTagsForPapers(this.llmService)
        });

        this.addCommand({
            id: 'clean-resume-sections',
            name: 'Clean Resume Sections from All Papers',
            callback: async () => {
                try {
                    await this.paperService.buildPaperIndex();
                    await this.paperService.cleanAllResumes();
                    await this.rebuildAndRefresh();
                } catch (err) {
                    console.error('Error cleaning resume sections:', err);
                    new Notice('Failed to clean resume sections: ' + (err && err.message ? err.message : String(err)));
                }
            }
        });

        this.addCommand({
            id: 'test-llm-api',
            name: 'Test LLM API Configuration',
            callback: () => this.testLLMApi()
        });
        
        this.addCommand({
            id: 'rebuild-paper-index',
            name: 'Rebuild Paper Index',
            callback: async () => {
                new Notice('Rebuilding paper index...');
                await this.rebuildAndRefresh();
                new Notice('Paper index rebuilt.');
            }
        });

        this.addCommand({
            id: 'generate-resume-current-note',
            name: 'Generate Resume for Current Note',
            callback: () => this.generateResumeForCurrentNote()
        });

        this.addCommand({
            id: 'open-note-chat',
            name: 'Open Note Chat Panel',
            callback: () => this.activateChatView()
        });
    }

    // ======================================================
    // FILE EVENT HANDLERS
    // ======================================================

    async handleFileCreate(file) {
        if (file instanceof TFile && this.paperService.isPaperFile(file)) {
            const paperData = await this.paperService.parsePaperFile(file);
            if (paperData) {
                this.paperService.paperIndex.set(file.path, paperData);
                this.paperService.scheduleRebuild(300, () => this.rebuildAndRefresh());
            }
        }
    }

    async handleFileDelete(file) {
        if (this.paperService.paperIndex.has(file.path)) {
            this.paperService.paperIndex.delete(file.path);
            this.paperService.scheduleRebuild(300, () => this.rebuildAndRefresh());
        }
    }

    async handleFileRename(file, oldPath) {
        if (this.paperService.paperIndex.has(oldPath)) {
            this.paperService.paperIndex.delete(oldPath);
        }
        if (file instanceof TFile && this.paperService.isPaperFile(file)) {
            const paperData = await this.paperService.parsePaperFile(file);
            if (paperData) {
                this.paperService.paperIndex.set(file.path, paperData);
            }
        }
        this.paperService.scheduleRebuild(300, () => this.rebuildAndRefresh());
    }

    async handleMetadataChange(file) {
        if (this.paperService.paperIndex.has(file.path)) {
            const paperData = await this.paperService.parsePaperFile(file);
            if (paperData) {
                this.paperService.paperIndex.set(file.path, paperData);
                this.paperService.scheduleRebuild(300, () => this.rebuildAndRefresh());
            }
        }
    }

    // ======================================================
    // MAIN OPERATIONS
    // ======================================================

    /**
     * Process new paper from URL
     * @param {string} url - Paper URL
     * @param {string} sector - Research sector
     */
    async processNewPaper(url, sector) {
        try {
            new Notice('Fetching paper data...');
            
            const metadata = await this.metadataService.getMetadataFromUrl(url);
            const useSector = sector || this.settings.defaultSector || 'Other';
            const pdfFileName = generatePdfFileName(metadata);
            
            const pdfLogicalPath = await this.fileService.downloadPdf(metadata, useSector, pdfFileName);
            await this.fileService.createPaperNote(metadata, useSector, pdfLogicalPath);
            
            new Notice(`Successfully added '${metadata.title}'!`);
            this.activateView();
            this.paperService.scheduleRebuild(150, () => this.rebuildAndRefresh());
        } catch (error) {
            console.error(error);
            new Notice(`Error: ${error.message}`, 10000);
        }
    }

    /**
     * Delete paper and refresh index
     * @param {TFile} noteFile - Note file to delete
     */
    async deletePaper(noteFile) {
        const paperData = this.paperService.paperIndex.get(noteFile.path);
        await this.fileService.deletePaper(noteFile, paperData);
        this.paperService.scheduleRebuild(150, () => this.rebuildAndRefresh());
    }

    /**
     * Test LLM API configuration
     */
    async testLLMApi() {
        try {
            new Notice('Testing LLM API configuration...');
            await this.llmService.testApi();
            new Notice('✅ LLM API test successful!');
        } catch (error) {
            new Notice(`❌ LLM API test failed: ${error.message}`);
            console.error('LLM API test error:', error);
        }
    }

    /**
     * Generate resume for currently active note
     */
    async generateResumeForCurrentNote() {
        try {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile || activeFile.extension !== 'md') {
                new Notice('No active markdown file found.');
                return;
            }

            new Notice('Generating resume for current note...');

            // Read the current note content
            const noteContent = await this.app.vault.read(activeFile);
            let contentToSummarize = noteContent;

            // Check if there's an associated PDF file
            const paperData = this.paperService.paperIndex.get(activeFile.path);
            if (paperData && paperData.frontmatter && paperData.frontmatter.pdf_link) {
                try {
                    // Try to find and read the PDF file
                    const pdfFile = this.app.vault.getAbstractFileByPath(paperData.frontmatter.pdf_link);
                    if (pdfFile instanceof TFile && pdfFile.extension === 'pdf') {
                        new Notice('Found associated PDF, extracting text...');
                        const pdfText = await this.pdfService.extractTextFromPdf(pdfFile);
                        contentToSummarize = `Note Content:\n${noteContent}\n\n--- Associated PDF Content ---\n${pdfText}`;
                    }
                } catch (pdfError) {
                    console.warn('Could not extract PDF content:', pdfError);
                    new Notice('Using note content only (PDF extraction failed)');
                }
            }

            // Generate the resume using LLM service
            const resume = await this.llmService.getSummary(contentToSummarize);

            // Insert the resume into the note
            await this.insertResumeIntoNote(activeFile, resume);

            new Notice(`✅ Resume generated for '${activeFile.basename}'!`);
        } catch (error) {
            console.error('Error generating resume for current note:', error);
            new Notice(`❌ Failed to generate resume: ${error.message}`, 8000);
        }
    }

    /**
     * Insert resume into note, replacing existing resume if present
     * @param {TFile} noteFile - The note file
     * @param {string} resume - The generated resume
     */
    async insertResumeIntoNote(noteFile, resume) {
        const content = await this.app.vault.read(noteFile);
        
        // Check if there's already a resume section
        const resumeStartRegex = /^## Resume$/m;
        const resumeEndRegex = /^## /m;
        
        const startMatch = content.match(resumeStartRegex);
        if (startMatch) {
            // Find the end of the resume section
            const startIndex = startMatch.index + startMatch[0].length;
            const remainingContent = content.slice(startIndex);
            const endMatch = remainingContent.match(resumeEndRegex);
            
            let newContent;
            if (endMatch) {
                // Replace existing resume section
                const endIndex = startIndex + endMatch.index;
                newContent = content.slice(0, startMatch.index) + 
                           `## Resume\n\n${resume}\n\n` + 
                           content.slice(endIndex);
            } else {
                // Resume section goes to end of file
                newContent = content.slice(0, startMatch.index) + 
                           `## Resume\n\n${resume}\n`;
            }
            
            await this.app.vault.modify(noteFile, newContent);
        } else {
            // No existing resume section, add at the end
            const newContent = content + `\n\n## Resume\n\n${resume}\n`;
            await this.app.vault.modify(noteFile, newContent);
        }
    }

    // ======================================================
    // UI OPERATIONS
    // ======================================================

    /**
     * Open the add paper modal
     */
    openAddPaperModal() {
        new PaperModal(this.app, this, async (url, sector) => {
            return await this.processNewPaper(url, sector);
        }).open();
    }

    /**
     * Activate the paper explorer view
     */
    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(PAPER_EXPLORER_VIEW_TYPE)[0];

        if (!leaf) {
            leaf = workspace.getLeftLeaf(false);
            await leaf.setViewState({
                type: PAPER_EXPLORER_VIEW_TYPE,
                active: true,
            });
        }
        workspace.revealLeaf(leaf);
    }

    /**
     * Activate the chat panel view
     */
    async activateChatView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(CHAT_PANEL_VIEW_TYPE)[0];

        if (!leaf) {
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({
                type: CHAT_PANEL_VIEW_TYPE,
                active: true,
            });
        }
        workspace.revealLeaf(leaf);
    }

    /**
     * Refresh paper explorer view
     */
    refreshPaperExplorerView() {
        const leaves = this.app.workspace.getLeavesOfType(PAPER_EXPLORER_VIEW_TYPE);
        leaves.forEach(leaf => {
            if (leaf.view instanceof PaperExplorerView) {
                leaf.view.renderView();
            }
        });
    }

    /**
     * Open master index in main view
     */
    async openMasterIndexInMainView() {
        const indexPath = `_papers_index.md`;
        await this.fileService.ensureFolderExists(this.settings.pdfDownloadFolder);
        
        if (!await this.app.vault.adapter.exists(indexPath)) {
            await this.paperService.updateMasterIndex();
        }
        
        const file = this.app.vault.getAbstractFileByPath(indexPath);
        if (file instanceof TFile) {
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
        }
    }

    // ======================================================
    // INDEX MANAGEMENT
    // ======================================================

    /**
     * Complete rebuild and refresh pipeline
     */
    async rebuildAndRefresh() {
        await this.paperService.buildPaperIndex();
        await this.fileService.cleanEmptySectorFolders();
        await this.paperService.pruneUnusedSectors(() => this.saveSettings());
        await this.refreshAllArtifacts();
    }

    /**
     * Refresh all UI artifacts
     */
    async refreshAllArtifacts() {
        this.refreshPaperExplorerView();
        await this.paperService.updateMasterIndex();
    }

    // ======================================================
    // SETTINGS
    // ======================================================

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update services when settings change
        if (this.llmService) {
            this.llmService.settings = this.settings;
        }
        if (this.fileService) {
            this.fileService.settings = this.settings;
        }
        if (this.paperService) {
            this.paperService.settings = this.settings;
        }
    }

    onunload() {
        if (this.paperService) {
            this.paperService.paperIndex.clear();
        }
        console.log('Research Assistant plugin unloaded.');
    }
}

module.exports = ResearchAssistantPlugin;