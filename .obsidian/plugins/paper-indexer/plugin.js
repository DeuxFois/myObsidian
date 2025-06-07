const { Plugin, Notice, TFile } = require('obsidian');
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
    }

    initializeServices() {
        this.llmService = new LLMService(this.settings);
        this.metadataService = new MetadataService();
        this.fileService = new FileService(this.app, this.settings);
        this.pdfService = new PdfService(this.app, this.settings);
        this.paperService = new PaperService(this.app, this.settings, this.fileService, this.pdfService);
    }

    setupEventHandlers() {
        this.app.workspace.onLayoutReady(async () => {
            await this.paperService.buildPaperIndex();
            this.registerEvent(this.app.vault.on('create', this.handleFileCreate.bind(this)));
            this.registerEvent(this.app.vault.on('delete', this.handleFileDelete.bind(this)));
            this.registerEvent(this.app.vault.on('rename', this.handleFileRename.bind(this)));
            this.registerEvent(this.app.metadataCache.on('changed', this.handleMetadataChange.bind(this)));
        });
    }

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
            new Notice(`Error: ${error.message}`, 10000);
        }
    }

    async deletePaper(noteFile) {
        const paperData = this.paperService.paperIndex.get(noteFile.path);
        await this.fileService.deletePaper(noteFile, paperData);
        this.paperService.scheduleRebuild(150, () => this.rebuildAndRefresh());
    }

    async testLLMApi() {
        try {
            new Notice('Testing LLM API configuration...');
            await this.llmService.testApi();
            new Notice('✅ LLM API test successful!');
        } catch (error) {
            new Notice(`❌ LLM API test failed: ${error.message}`);
        }
    }

    async generateResumeForCurrentNote() {
        try {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                new Notice('No active file found.');
                return;
            }

            // If the active file is a PDF, extract text and write resume to a sidecar note in the same folder
            if (activeFile.extension === 'pdf') {
                new Notice('Generating resume for current PDF...');
                let pdfText = '';
                try {
                    pdfText = await this.pdfService.extractTextFromPdf(activeFile);
                } catch (e) {
                    new Notice('❌ Failed to extract PDF text: ' + (e?.message || String(e)));
                    return;
                }

                const resume = await this.llmService.getSummary(pdfText);

                // Find or create a sidecar note with same basename
                const folderPath = activeFile.parent?.path || '';
                const mdPath = `${folderPath}/${activeFile.basename}.md`;
                let noteFile = this.app.vault.getAbstractFileByPath(mdPath);
                if (!(noteFile instanceof TFile)) {
                    await this.app.vault.create(mdPath, `---\nTitle: "${activeFile.basename}"\n---\n\n## Paper PDF\n![[${activeFile.path}]]\n`);
                    noteFile = this.app.vault.getAbstractFileByPath(mdPath);
                }
                if (!(noteFile instanceof TFile)) {
                    new Notice('❌ Could not create or open sidecar note for PDF.');
                    return;
                }
                await this.insertResumeIntoNote(noteFile, resume);
                new Notice(`✅ Resume generated for PDF '${activeFile.basename}' and saved to '${noteFile.basename}.md'!`);
                return;
            }

            // Active Markdown file flow
            if (activeFile.extension !== 'md') {
                new Notice('Active file is not a markdown note or PDF.');
                return;
            }

            new Notice('Generating resume for current note...');

            const noteContent = await this.app.vault.read(activeFile);
            let contentToSummarize = noteContent;

            const paperData = this.paperService.paperIndex.get(activeFile.path);
            // Use pdf_file field with path resolution, not pdf_link
            if (paperData && paperData.frontmatter && paperData.frontmatter.pdf_file) {
                try {
                    let logicalPath = String(paperData.frontmatter.pdf_file);
                    if (!logicalPath.includes('/') && activeFile.parent && activeFile.parent.path) {
                        logicalPath = `${activeFile.parent.path}/${logicalPath}`;
                    }
                    const effectivePath = await this.fileService.resolveLogicalToEffectivePath(logicalPath);
                    const pdfFile = this.app.vault.getAbstractFileByPath(effectivePath);
                    if (pdfFile instanceof TFile && pdfFile.extension === 'pdf') {
                        new Notice('Found associated PDF, extracting text...');
                        const pdfText = await this.pdfService.extractTextFromPdf(pdfFile);
                        contentToSummarize = `Note Content:\n${noteContent}\n\n--- Associated PDF Content ---\n${pdfText}`;
                    }
                } catch (pdfError) {
                    new Notice('Using note content only (PDF extraction failed)');
                }
            }

            const resume = await this.llmService.getSummary(contentToSummarize);

            await this.insertResumeIntoNote(activeFile, resume);

            new Notice(`✅ Resume generated for '${activeFile.basename}'!`);
        } catch (error) {
            new Notice(`❌ Failed to generate resume: ${error.message}`, 8000);
        }
    }

    async insertResumeIntoNote(noteFile, resume) {
        const content = await this.app.vault.read(noteFile);

        // Be flexible: match headings like "# Resume", "## Resume:", "### Résumé", or "## Summary"
        const resumeStartRegex = /^#{1,6}\s+(?:Resume|Résumé|Summary)\s*:?\s*$/im;
        // Next section starts at any markdown heading line
        const nextHeadingRegex = /^#{1,6}\s+/m;

        const startMatch = content.match(resumeStartRegex);
        if (startMatch) {
            const startOfHeading = startMatch.index;
            const endOfHeadingLine = startMatch.index + startMatch[0].length;

            const remainingContent = content.slice(endOfHeadingLine);
            const endMatch = remainingContent.match(nextHeadingRegex);

            const endIndex = endMatch ? (endOfHeadingLine + endMatch.index) : content.length;

            // Preserve embedded PDFs within the original Resume section
            const sectionBody = content.slice(endOfHeadingLine, endIndex);
            const embedRegex = /!\[\[[^\]]*\.pdf[^\]]*\]\]/ig;
            const embeds = sectionBody.match(embedRegex) || [];
            const embedsBlock = embeds.length ? embeds.join("\n") + "\n\n" : "";

            const replacement = `## Resume\n\n${resume}\n\n${embedsBlock}`;

            const newContent = content.slice(0, startOfHeading) + replacement + content.slice(endIndex);

            await this.app.vault.modify(noteFile, newContent);
        } else {
            // Ensure a blank line before appending when needed
            const needsLeadingNewline = content.length > 0 && !content.endsWith("\n\n");
            const prefix = needsLeadingNewline ? (content.endsWith("\n") ? "\n" : "\n\n") : "";
            const newContent = content + `${prefix}## Resume\n\n${resume}\n`;
            await this.app.vault.modify(noteFile, newContent);
        }
    }

    

    openAddPaperModal() {
        new PaperModal(this.app, this, async (url, sector) => {
            return await this.processNewPaper(url, sector);
        }).open();
    }

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

    refreshPaperExplorerView() {
        const leaves = this.app.workspace.getLeavesOfType(PAPER_EXPLORER_VIEW_TYPE);
        leaves.forEach(leaf => {
            if (leaf.view instanceof PaperExplorerView) {
                leaf.view.renderView();
            }
        });
    }

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

    // INDEX MANAGEMENT

    async rebuildAndRefresh() {
        await this.paperService.buildPaperIndex();
        await this.fileService.cleanEmptySectorFolders();
        await this.paperService.pruneUnusedSectors(() => this.saveSettings());
        await this.refreshAllArtifacts();
    }

    async refreshAllArtifacts() {
        this.refreshPaperExplorerView();
        await this.paperService.updateMasterIndex();
    }

    // SETTINGS

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
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
    }
}

module.exports = ResearchAssistantPlugin;