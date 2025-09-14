const { Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl, ItemView, TFile } = require('obsidian');

// Define a unique identifier for our new view
const PAPER_EXPLORER_VIEW_TYPE = "paper-explorer-view";

// Helper to normalize frontmatter tags into space separated #tag format for the index
function formatTagsForIndex(rawTags) {
    if (!rawTags) return '';
    let arr = [];
    if (Array.isArray(rawTags)) {
        arr = rawTags;
    } else if (typeof rawTags === 'string') {
        if (rawTags.includes(',')) arr = rawTags.split(',');
        else arr = rawTags.split(/\s+/);
    } else {
        try { arr = String(rawTags).split(/[,\s]+/); } catch (_) { arr = []; }
    }
    return arr
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => {
            const cleaned = t.replace(/^#+/, '').replace(/\s+/g, '-');
            return cleaned ? `#${cleaned}` : '';
        })
        .filter(Boolean)
        .join(' ');
}

// Small helpers to normalize frontmatter values
function normalizeAuthors(fmAuthors) {
    if (!fmAuthors) return '';
    if (Array.isArray(fmAuthors)) return fmAuthors.join(', ');
    try { return String(fmAuthors); } catch (_) { return ''; }
}

function normalizeTags(fmTags) {
    if (!fmTags) return [];
    if (Array.isArray(fmTags)) return fmTags.map(t => String(t));
    if (typeof fmTags === 'string') return fmTags.split(/[,\s]+/).map(t => t.trim()).filter(Boolean);
    try { return String(fmTags).split(/[,\s]+/).map(t => t.trim()).filter(Boolean); } catch (_) { return []; }
}

// ======================================================
// LLM INTEGRATION UTILITIES
// ======================================================
// --- REFACTORED: Centralized LLM call wrapper ---
async function callLLM(settings, requestBody) {
    if (!settings.summaryApiEndpoint || !settings.summaryApiModel) {
        throw new Error("API endpoint or model is not configured in settings.");
    }
    if (!settings.summaryApiKey) {
        throw new Error("API key is not configured in settings.");
    }

    try {
        const res = await requestUrl({
            url: settings.summaryApiEndpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.summaryApiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (res && typeof res.status === 'number' && res.status >= 400) {
            const msg = res.text || JSON.stringify(res.json || res);
            const err = new Error(`status ${res.status}: ${String(msg).slice(0, 200)}`);
            err.status = res.status;
            throw err;
        }

        let json = null;
        if (res && res.json) json = res.json;
        else if (res && typeof res.text === 'string') {
            try { json = JSON.parse(res.text); } catch (_) { json = null; }
        }

        const textBody = (res && typeof res.text === 'string') ? res.text : (json ? JSON.stringify(json) : '');
        if (textBody && textBody.trim().startsWith('<!DOCTYPE')) {
            throw new Error(`API returned HTML error page. Check your API endpoint: ${settings.summaryApiEndpoint}`);
        }

        const content = json?.choices?.[0]?.message?.content;
        if (!content) throw new Error(`Invalid API response format. Response: ${String(textBody).slice(0, 500)}`);

        return content;
    } catch (error) {
        if (error && error.status) throw error;
        throw new Error(error.message || String(error));
    }
}

// --- REFACTORED: Generic LLM prompt function ---
async function _callLLMWithPrompt(systemPrompt, userContent, settings) {
    const requestBody = {
        model: settings.summaryApiModel,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
        ]
    };
    return await callLLM(settings, requestBody);
}

// --- REFACTORED: LLM helper functions are now thin wrappers ---
async function getLLMSummary(text, settings) {
    return _callLLMWithPrompt("You are a helpful assistant. Summarize the following academic paper abstract concisely for a researcher in the field.", text, settings);
}

async function getLLMTags(text, settings) {
    return _callLLMWithPrompt("You are a helpful assistant. Generate relevant academic tags for the following research paper content. Return only a comma-separated list of tags, no other text.", text, settings);
}

async function getLLMResume(text, settings) {
    return _callLLMWithPrompt("You are a helpful assistant. Create a comprehensive resume/summary of the following academic paper. Include key findings, methodology, contributions, and implications. Format it in markdown.", text, settings);
}


class PaperExplorerView extends ItemView {
    constructor(leaf, settings, plugin) {
        super(leaf);
        this.settings = settings;
        this.plugin = plugin;
    }

    getViewType() { return PAPER_EXPLORER_VIEW_TYPE; }
    getDisplayText() { return "Research Papers"; }
    getIcon() { return "library"; }

    async onOpen() {
        // Ensure index and artifacts are up-to-date when view opens
        try {
            // If plugin hasn't built the index yet, trigger a quick rebuild
            if (!this.plugin || !this.plugin.paperIndex || this.plugin.paperIndex.size === 0) {
                await this.plugin.rebuildAndRefresh();
            }
        } catch (e) {
            console.warn('Error rebuilding paper index on open:', e);
        }
        this.renderView();
    }

    async renderView() {
        const container = this.contentEl || this.containerEl.children[1];
        container.empty();

        const header = container.createEl("div", { cls: "paper-explorer-header" });
        const viewerBtn = document.createElement('button');
        viewerBtn.style.border = 'none';
        viewerBtn.style.background = 'none';
        viewerBtn.style.cursor = 'pointer';
        viewerBtn.style.padding = '0';
        viewerBtn.style.margin = '0';
        viewerBtn.style.color = 'var(--text-normal)';
        viewerBtn.style.boxShadow = 'none';
        
        viewerBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg><span style="margin-left:4px;">Open Home Viewer</span>';
        viewerBtn.style.fontSize = '0.75rem';
        viewerBtn.title = 'Open Home Viewer.md';
        viewerBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const viewerPath = "/_papers_index.md";
            let file = this.plugin.app.vault.getAbstractFileByPath(viewerPath);
            if (!file) {
                file = await this.plugin.app.vault.create(viewerPath, '# Viewer\n');
            }
            if (file instanceof TFile) {
                const leaf = this.plugin.app.workspace.getLeaf(false);
                await leaf.openFile(file);
            }
        });
        header.appendChild(viewerBtn);
        const buttonContainer = header.createEl('div', { cls: 'button-container' });
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
		const addButton = buttonContainer.createEl("button", { text: "+ Add Paper" });
		addButton.style.fontSize = '1em';
		addButton.style.padding = '10px 20px';
		addButton.style.borderRadius = '5px';
		addButton.style.border = 'none';
		addButton.style.cursor = 'pointer';
        addButton.style.marginBottom = '10px';

		addButton.addClass("mod-cta");
        addButton.addEventListener("click", () => {
             new PaperModal(this.app, this.plugin, async (url, sector) => {
                return await this.plugin.processNewPaper(url, sector);
            }).open();
        });

        const layout = container.createEl('div', { cls: 'paper-explorer-layout' });
        const sidebar = layout.createEl('div', { cls: 'paper-explorer-sidebar' });
        const contentArea = layout.createEl('div', { cls: 'paper-explorer-content' });
        
        // --- UPDATE: Use the new dynamic sector function ---
        const sectors = await this.plugin.getAvailableSectors();
        const sectorWrap = sidebar.createEl('div', { cls: 'sector-select-wrap' });
        sectorWrap.style.width = '100%';
	    sectorWrap.createEl('hr');

        const select = sectorWrap.createEl('select', { cls: 'sector-select' });
        select.style.marginTop = '24px';
        const space = sectorWrap.createEl('div', { cls: 'sector-select-space' });
        space.style.height = '24px';
        select.style.width = '100%';
        select.createEl('option', { value: 'All', text: 'All Sectors' });

        for (const s of sectors) {
            select.createEl('option', { value: s, text: s });
        }

        const active = this.plugin._activeSector || 'All';
        if (!sectors.includes(active) && active !== 'All') {
            this.plugin._activeSector = 'All';
        }
        try { select.value = this.plugin._activeSector || 'All'; } catch (e) { select.value = 'All'; }

        select.addEventListener('change', (ev) => {
            const val = ev.target.value;
            this.plugin._activeSector = val === 'All' ? 'All' : val;
            this.renderView();
        });
        
        const allPapers = Array.from(this.plugin.paperIndex.values());
        const paperNotes = allPapers.filter(paper => {
            if (this.plugin._activeSector && this.plugin._activeSector !== 'All') {
                return paper.sector === this.plugin._activeSector;
            }
            return true;
        });

        if (paperNotes.length === 0) {
            contentArea.createEl("p", { text: "No papers found. Click 'Add Paper' to start." });
            return;
        }

        const table = contentArea.createEl("table", { cls: "paper-index-table" });
        table.style.width = '100%';
        table.style.borderCollapse = 'separate';
        table.style.borderSpacing = '0 24px';
        
        const thead = table.createEl("thead");
        const headerRow = thead.createEl("tr");
        headerRow.createEl("th", { text: "Title" });

        const tbody = table.createEl("tbody");
        paperNotes.sort((a, b) => b.mtime - a.mtime);

        for (const paper of paperNotes) {
            const title = paper.frontmatter.title || paper.basename;
            const row = tbody.createEl("tr");
            row.style.cursor = 'pointer';
            row.style.marginTop = '4px';

            const titleCell = row.createEl("td");
            titleCell.setText(title);
            titleCell.addClass('paper-title-cell');
            titleCell.addEventListener('click', () => {
				this.app.workspace.openLinkText(paper.path, '', false);
            });
			
			const deleteCell = row.createEl('td');
			const deleteBtn = deleteCell.createEl('button', { text: '×' });
			deleteBtn.addClass('paper-delete-btn');
			deleteBtn.title = 'Delete paper note and associated PDF';
			deleteBtn.style.cursor = 'pointer';
			deleteBtn.style.background = 'transparent';
			deleteBtn.style.border = 'none';
			deleteBtn.style.color = '#c94b4b';
			deleteBtn.style.fontSize = '1.1em';
			deleteBtn.style.padding = '4px 8px';
            deleteBtn.style.boxShadow = 'none';
			deleteBtn.addEventListener('click', async (ev) => {
				ev.stopPropagation();
                const fileToDelete = this.app.vault.getAbstractFileByPath(paper.path);
                if (fileToDelete instanceof TFile) {
				    await this.plugin.deletePaper(fileToDelete);
                } else {
                    new Notice("Error: Could not find file to delete.");
                    this.plugin.rebuildAndRefresh();
                }
			});
        }
    }

    async onClose() {}
}

const DEFAULT_SETTINGS = {
    summaryApiEndpoint: '',
    summaryApiModel: '',
    summaryApiKey: '',
    pdfDownloadFolder: '_research-papers',
    hideFolderFromFiles: false,
    sectors: ['Other'],
    defaultSector: 'Other',
}

// ======================================================
// MAIN PLUGIN CLASS
// ======================================================
class ResearchAssistantPlugin extends Plugin {
    paperIndex = new Map();
    _rebuildTimer = null; // debounce timer id
    _rebuildPending = false; // flag to coalesce rebuilds

    async onload() {
        await this.loadSettings();

        this.app.workspace.onLayoutReady(async () => {
            await this.buildPaperIndex();
            this.registerEvent(this.app.vault.on('create', this.handleFileCreate.bind(this)));
            this.registerEvent(this.app.vault.on('delete', this.handleFileDelete.bind(this)));
            this.registerEvent(this.app.vault.on('rename', this.handleFileRename.bind(this)));
            this.registerEvent(this.app.metadataCache.on('changed', this.handleMetadataChange.bind(this)));
        });

        this.registerView(
            PAPER_EXPLORER_VIEW_TYPE,
            (leaf) => new PaperExplorerView(leaf, this.settings, this)
        );

        this.addRibbonIcon('library', 'Open Paper Explorer', () => {
            this.openMasterIndexInMainView().then(() => this.activateView());
        });

        this.addCommand({
            id: 'add-research-paper',
            name: 'Add Research Paper',
            callback: () => {
                new PaperModal(this.app, this, async (url, sector) => {
                    return await this.processNewPaper(url, sector);
                }).open();
            }
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
            callback: () => this.generateResumeForPapers()
        });

        this.addCommand({
            id: 'generate-tags-all-papers',
            name: 'Generate Tags for All Papers',
            callback: () => this.generateTagsForPapers()
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

        this.addSettingTab(new RASettingTab(this.app, this));
        
        console.log('Research Assistant plugin loaded.');
    }

    // --- NEW: Scans folders to dynamically find all available sectors ---
    async getAvailableSectors() {
        const settingsSectors = new Set(this.settings.sectors || ['Other']);
        const folderPath = this.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
    
        try {
            if (await this.app.vault.adapter.exists(folderPath)) {
                const list = await this.app.vault.adapter.list(folderPath);
                // Extract the last part of the path (the folder name) for each folder
                const folderSectors = list.folders.map(folder => folder.split('/').pop());
                folderSectors.forEach(sector => settingsSectors.add(sector));
            }
        } catch (error) {
            console.error("Research Assistant: Could not scan for sector folders.", error);
        }
    
        if (settingsSectors.size === 0) {
            settingsSectors.add('Other');
        }
    
        const sortedSectors = Array.from(settingsSectors).sort();
        
        // Ensure 'Other' is always the last option in the list
        if (sortedSectors.includes('Other')) {
            return sortedSectors.filter(s => s !== 'Other').concat('Other');
        }
        
        return sortedSectors;
    }

    isPaperFile(file) {
        const paperFolder = this.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        return file.path.startsWith(paperFolder) && !file.name.startsWith('_') && file.extension === 'md';
    }

    async parsePaperFile(file) {
        if (!this.isPaperFile(file)) return null;

        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter || {};
        const paperFolder = this.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        const relativePath = file.path.substring(paperFolder.length + 1);
        const sector = relativePath.split('/')[0] || 'Other';

        return {
            path: file.path,
            basename: file.basename,
            mtime: file.stat.mtime,
            frontmatter: frontmatter,
            sector: sector,
        };
    }

    async buildPaperIndex() {
        this.paperIndex.clear();
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
            const paperData = await this.parsePaperFile(file);
            if (paperData) {
                this.paperIndex.set(file.path, paperData);
            }
        }
        console.log(`Paper index built with ${this.paperIndex.size} items.`);
    }
    
    // High-level rebuild pipeline (index -> cleanup -> prune -> refresh artifacts)
    async rebuildAndRefresh() {
        await this.buildPaperIndex();
    await this.cleanEmptySectorFolders();
    await this.pruneUnusedSectors();
        await this.refreshAllArtifacts();
    }

    // Central place to refresh UI artifacts after index updated
    async refreshAllArtifacts() {
        this.refreshPaperExplorerView();
        await this.updateMasterIndex();
    }

    // Remove sector folders that are completely empty (no files or subfolders)
    // Delete sector folders that have become empty (one level deep)
    async cleanEmptySectorFolders() {
        const baseFolder = this.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        try {
            if (!await this.app.vault.adapter.exists(baseFolder)) return;
            const listing = await this.app.vault.adapter.list(baseFolder);
            // Only iterate folders one level deep (sectors)
            for (const folderPath of listing.folders) {
                // Skip if baseFolder itself returned
                if (folderPath === baseFolder) continue;
                const rel = folderPath.slice(baseFolder.length + 1);
                if (!rel || rel.startsWith('_')) continue; // skip index / internal
                const subListing = await this.app.vault.adapter.list(folderPath);
                const isEmpty = subListing.files.length === 0 && subListing.folders.length === 0;
                if (isEmpty) {
                    try {
                        await this.app.vault.adapter.rmdir(folderPath, true);
                        // Also remove from managed sectors if present
                        if (this.settings.sectors.includes(rel)) {
                            this.settings.sectors = this.settings.sectors.filter(s => s !== rel);
                            if (this.settings.defaultSector === rel) this.settings.defaultSector = 'Other';
                            await this.saveSettings();
                        }
                        if (this._activeSector === rel) this._activeSector = 'All';
                    } catch (err) {
                        console.warn('Failed to remove empty sector folder', folderPath, err);
                    }
                }
            }
        } catch (e) {
            console.warn('cleanEmptySectorFolders error', e);
        }
    }

    // Remove sectors from settings if no papers AND no folder present
    // Purge sectors from settings when no papers and no folder remain
    async pruneUnusedSectors() {
        const baseFolder = this.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        const sectorCounts = new Map();
        for (const paper of this.paperIndex.values()) {
            sectorCounts.set(paper.sector, (sectorCounts.get(paper.sector) || 0) + 1);
        }
        let changed = false;
        const managed = [...this.settings.sectors];
        for (const sector of managed) {
            if (sector === 'Other') continue; // never prune Other
            const hasPapers = sectorCounts.has(sector);
            const folderPath = `${baseFolder}/${sector}`;
            let folderExists = false;
            try { folderExists = await this.app.vault.adapter.exists(folderPath); } catch (_) {}
            if (!hasPapers && !folderExists) {
                this.settings.sectors = this.settings.sectors.filter(s => s !== sector);
                if (this.settings.defaultSector === sector) this.settings.defaultSector = 'Other';
                if (this._activeSector === sector) this._activeSector = 'All';
                changed = true;
            }
        }
        if (changed) await this.saveSettings();
    }

    // Debounced scheduling to avoid repetitive rebuilds on burst events
    scheduleRebuild(delay = 300) {
        this._rebuildPending = true;
        if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
        this._rebuildTimer = setTimeout(async () => {
            try {
                await this.rebuildAndRefresh();
            } finally {
                this._rebuildPending = false;
            }
        }, delay);
    }

    async handleFileCreate(file) {
        if (file instanceof TFile && this.isPaperFile(file)) {
            const paperData = await this.parsePaperFile(file);
            if (paperData) {
                this.paperIndex.set(file.path, paperData);
                this.scheduleRebuild();
            }
        }
    }

    async handleFileDelete(file) {
        if (this.paperIndex.has(file.path)) {
            this.paperIndex.delete(file.path);
            this.scheduleRebuild();
        }
    }

    async handleFileRename(file, oldPath) {
        if (this.paperIndex.has(oldPath)) {
            this.paperIndex.delete(oldPath);
        }
        if (file instanceof TFile && this.isPaperFile(file)) {
            const paperData = await this.parsePaperFile(file);
            if (paperData) {
                this.paperIndex.set(file.path, paperData);
            }
        }
    this.scheduleRebuild();
    }

    async handleMetadataChange(file) {
        if (this.paperIndex.has(file.path)) {
            const paperData = await this.parsePaperFile(file);
            if (paperData) {
                this.paperIndex.set(file.path, paperData);
                this.scheduleRebuild();
            }
        }
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

    onunload() {
        this.paperIndex.clear();
        console.log('Research Assistant plugin unloaded.');
    }

    async testLLMApi() {
        try {
            new Notice('Testing LLM API configuration...');
            const testText = "This is a test message for API configuration. If you see a summary of this, it works.";
            const result = await getLLMSummary(testText, this.settings);
            
            new Notice('✅ LLM API test successful!');
        } catch (error) {
            new Notice(`❌ LLM API test failed: ${error.message}`);
            console.error('LLM API test error:', error);
        }
    }

    async _processAllPapers(options) {
        const { commandName, processFn, shouldSkipFn } = options;
        try {
            if (!this.settings.summaryApiEndpoint || !this.settings.summaryApiModel || !this.settings.summaryApiKey) {
                new Notice('❌ Please configure LLM API settings first.');
                return;
            }
            new Notice(`${commandName}...`);
            const paperFiles = Array.from(this.paperIndex.values());
            if (paperFiles.length === 0) {
                new Notice('No paper files found to process.');
                return;
            }
            let processedCount = 0, skippedCount = 0, errorCount = 0;
            for (const paperData of paperFiles) {
                const paperFile = this.app.vault.getAbstractFileByPath(paperData.path);
                if (!(paperFile instanceof TFile)) continue;
                try {
                    const content = await this.app.vault.read(paperFile);
                    if (await shouldSkipFn(content, paperData.frontmatter)) {
                        skippedCount++;
                        continue;
                    }
                    await processFn(paperFile, content);
                    processedCount++;
                } catch (error) {
                    console.error(`Error during '${commandName}' for ${paperFile.name}:`, error);
                    errorCount++;
                }
            }
            const message = `${commandName} complete! Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`;
            new Notice(message);
        } catch (error) {
            new Notice(`Error during ${commandName}: ${error.message}`);
            console.error(`Error during ${commandName}:`, error);
        }
    }

    async generateResumeForPapers() {
        await this._processAllPapers({
            commandName: "Resume Generation",
            shouldSkipFn: async (content, frontmatter) => /^##\s+(Resume|Summary)/im.test(content),
            processFn: async (paperFile, content) => {
                const resume = await getLLMResume(content, this.settings);
                const pdfEmbedRegex = /!\[\[.*?\.pdf\]\]/i;
                const pdfMatch = content.match(pdfEmbedRegex);
                let newContent;
                if (pdfMatch) {
                    const insertPosition = content.indexOf(pdfMatch[0]);
                    newContent = content.slice(0, insertPosition) + `## Resume\n\n${resume}\n\n` + content.slice(insertPosition);
                } else {
                    newContent = content + `\n\n## Resume\n\n${resume}\n`;
                }
                await this.app.vault.modify(paperFile, newContent);
            }
        });
    }

    async generateTagsForPapers() {
        await this._processAllPapers({
            commandName: "Tag Generation",
            shouldSkipFn: async (content, frontmatter) => {
                const existingTags = normalizeTags(frontmatter.tags);
                const defaultTags = ['paper', 'to-read'];
                return existingTags.some(tag => !defaultTags.includes(tag));
            },
            processFn: async (paperFile, content) => {
                const generatedTags = await getLLMTags(content, this.settings);
                const tagsArray = generatedTags.split(',').map(tag => tag.trim()).filter(Boolean);
                const defaultTags = ['paper', 'to-read'];
                const combinedTags = [...new Set([...defaultTags, ...tagsArray])];
                await this.app.fileManager.processFrontMatter(paperFile, (fm) => {
                    fm.tags = combinedTags;
                });
            }
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async processNewPaper(url, sector) {
        try {
            new Notice('Fetching paper data...');
            const isPdf = this.isDirectPdfUrl(url);
            let metadata;
            if (isPdf) {
                metadata = await this.buildMetadataFromDirectPdf(url);
            } else {
                const arxivId = this.extractArxivId(url);
                if (!arxivId) throw new Error('Could not extract a valid arXiv ID or PDF link.');
                metadata = await this.fetchArxivMetadata(arxivId);
            }
            const useSector = sector || this.settings.defaultSector || 'Other';
            const pdfFileName = this.generatePdfFileName(metadata);
            // downloadPdf will write into <pdfDownloadFolder>/pdf/<sector>/ and return the logical vault path
            const pdfLogicalPath = await this.downloadPdf(metadata, useSector, pdfFileName);
            await this.createPaperNote(metadata, useSector, pdfLogicalPath);
            new Notice(`Successfully added '${metadata.title}'!`);
            this.activateView();
            this.scheduleRebuild(150); // quick refresh after adding
        } catch (error) {
            console.error(error);
            new Notice(`Error: ${error.message}`, 10000);
        }
    }

    refreshPaperExplorerView() {
        const leaves = this.app.workspace.getLeavesOfType(PAPER_EXPLORER_VIEW_TYPE);
        leaves.forEach(leaf => {
            if (leaf.view instanceof PaperExplorerView) {
                leaf.view.renderView();
            }
        });
    }

    extractArxivId(url) {
        const regex = /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?|[a-zA-Z\-\.]+\/\d{7})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    isDirectPdfUrl(url) {
        try {
            const u = new URL(url);
            return /\.pdf$/i.test(u.pathname);
        } catch (_) {
            return false;
        }
    }

    async buildMetadataFromDirectPdf(url) {
        let fileNamePart = url.split('?')[0].split('#')[0].split('/').pop() || 'Untitled Paper';
        fileNamePart = decodeURIComponent(fileNamePart).replace(/\.pdf$/i, '');
        const cleanedTitle = fileNamePart.replace(/[\-_]+/g, ' ').replace(/\s+/g, ' ').trim();
        const today = new Date().toISOString().split('T')[0];
        return {
            id: cleanedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
            title: cleanedTitle || 'Untitled Paper',
            authors: 'Unknown',
            summary: 'No abstract available (added from direct PDF).',
            published: today,
            pdfLink: url
        };
    }

    async fetchArxivMetadata(arxivId) {
        const apiUrl = `http://export.arxiv.org/api/query?id_list=${arxivId}`;
        const response = await requestUrl({ url: apiUrl });
        if (response.status !== 200) throw new Error('Failed to fetch from arXiv API.');
        const xmlText = await response.text;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const entry = xmlDoc.querySelector("entry");
        if (!entry) throw new Error('Paper not found on arXiv.');
        const getText = (tagName) => entry.querySelector(tagName)?.textContent.trim() || 'N/A';
        const getAuthors = () => Array.from(entry.querySelectorAll("author name")).map(el => el.textContent.trim()).join(', ');
        return {
            id: getText("id").split('/').pop(),
            title: getText("title").replace(/\s+/g, ' '),
            authors: getAuthors(),
            summary: getText("summary").replace(/\s+/g, ' '),
            published: getText("published").split('T')[0],
            pdfLink: entry.querySelector('link[title="pdf"]')?.getAttribute('href') || ''
        };
    }

    async createPaperNote(metadata, sector, pdfFileName) {
        const sectorFolder = `${this.settings.pdfDownloadFolder}/${sector}`;
        await this.ensureFolderExists(sectorFolder);
        const sanitizedTitle = metadata.title.replace(/[\\/:"*?<>|]/g, '-').substring(0, 150);
        const notePath = `${this.getEffectiveFolderPath(sectorFolder)}/${sanitizedTitle}.md`;
        if (await this.app.vault.adapter.exists(notePath)) {
            new Notice(`Note "${sanitizedTitle}.md" already exists.`);
            return;
        }
        const year = new Date(metadata.published).getFullYear();
        // pdfFileName may be either a filename or a logical path like '<base>/pdf/<sector>/file.pdf'
        let pdfLogicalPath = pdfFileName;
        if (!pdfLogicalPath.includes('/')) {
            pdfLogicalPath = `${this.settings.pdfDownloadFolder}/pdf/${sector}/${pdfFileName}`;
        }
        const markdownContent = `---
title: "${metadata.title.replace(/"/g, '\\"')}"
authors: "${metadata.authors.replace(/"/g, '\\"')}"
year: ${year}
published: "${metadata.published}"
pdf_file: "${pdfLogicalPath}"
tags: [paper, to-read]
---
# ${metadata.title}

| Field | Value |
|---|---|
| **Title** | ${metadata.title} |
| **Authors** | ${metadata.authors} |
| **Date** | ${metadata.published} |
| **Abstract**| ${metadata.summary} |

**PDF link**: [pdf link](${pdfLogicalPath})

---

## Paper PDF
![[${pdfLogicalPath}]]
`;
        await this.app.vault.create(notePath, markdownContent);
    } 

    generatePdfFileName(metadata) {
        const sanitizedTitle = metadata.title.replace(/[\\/:"*?<>|]/g, '-').substring(0, 100);
        const firstAuthor = metadata.authors.split(',')[0].trim();
        const year = new Date(metadata.published).getFullYear();
        return `${firstAuthor} et al. - ${year} - ${sanitizedTitle}.pdf`;
    }

    async downloadPdf(metadata, sector, fileName) {
         if (!metadata.pdfLink) throw new Error('No PDF link found.');
        // Store PDFs under a dedicated pdf/ subfolder inside the base research folder
        const pdfBase = `${this.settings.pdfDownloadFolder}/pdf`;
        const targetFolder = sector ? `${pdfBase}/${sector}` : pdfBase;
        await this.ensureFolderExists(targetFolder);
        const targetEffective = this.getEffectiveFolderPath(targetFolder);
        const filePath = `${targetEffective}/${fileName}`;
        // If already exists, return the logical path
        if (await this.app.vault.adapter.exists(filePath)) {
            new Notice(`PDF "${fileName}" already exists.`, 5000);
            return `${pdfBase}/${sector}/${fileName}`.replace(/\\/g, '/');
        }
        const pdfResponse = await requestUrl({ url: metadata.pdfLink, method: 'GET', throw: false });
        if (!pdfResponse || (typeof pdfResponse.status === 'number' && pdfResponse.status !== 200)) throw new Error('Failed to download PDF.');
    await this.app.vault.createBinary(filePath, pdfResponse.arrayBuffer);
    // Return logical vault path (not necessarily the effective dot-prefixed path)
    return `${pdfBase}/${sector}/${fileName}`.replace(/\\/g, '/');
    }

    async ensureFolderExists(folderPath) {
        const effectivePath = this.getEffectiveFolderPath(folderPath);
        if (!await this.app.vault.adapter.exists(effectivePath)) {
            await this.app.vault.createFolder(effectivePath);
        }
    }

    getEffectiveFolderPath(folderPath) {
        if (this.settings.hideFolderFromFiles) {
            if (folderPath.startsWith('.')) return folderPath;
            return `.${folderPath}`;
        }
        return folderPath;
    }

    async openMasterIndexInMainView() {
        const folderPath = this.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        const indexPath = `_papers_index.md`;
        await this.ensureFolderExists(this.settings.pdfDownloadFolder);
        if (!await this.app.vault.adapter.exists(indexPath)) {
            await this.updateMasterIndex();
        }
        const file = this.app.vault.getAbstractFileByPath(indexPath);
        if (file instanceof TFile) {
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
        }
    }
    
    async deletePaper(noteFile) {
        const paperData = this.paperIndex.get(noteFile.path);
        const frontmatter = paperData?.frontmatter || {};
        let pdfFileName = frontmatter.pdf_file;
        if (!pdfFileName && frontmatter.title && frontmatter.authors && (frontmatter.published || frontmatter.year)) {
            const legacyMetadata = {
                title: frontmatter.title,
                authors: frontmatter.authors,
                published: frontmatter.published || String(frontmatter.year),
            };
            pdfFileName = this.generatePdfFileName(legacyMetadata);
        }
        let confirmMessage = `Permanently delete note "${noteFile.basename}.md"?`;
        if (pdfFileName) {
            confirmMessage += `\n\nThis will also attempt to delete the associated PDF: "${pdfFileName}".`;
        }
        confirmMessage += "\n\nThis cannot be undone.";
        if (!confirm(confirmMessage)) return;
        try {
            if (pdfFileName) {
                // pdf_file may be a logical path (e.g. '_research-papers/pdf/LLM/file.pdf')
                let pdfLogical = pdfFileName;
                if (!pdfLogical.includes('/')) {
                    pdfLogical = `${noteFile.parent.path}/${pdfLogical}`;
                }
                const pdfEffective = this.getEffectiveFolderPath(pdfLogical);
                const pdfFile = this.app.vault.getAbstractFileByPath(pdfEffective);
                if (pdfFile) {
                    await this.app.vault.delete(pdfFile);
                }
            }
            await this.app.vault.delete(noteFile);
            new Notice('Paper deleted.');
            // If sector now empty, rebuild will prune it
            this.scheduleRebuild(150);
        } catch (error) {
            console.error('Error deleting paper:', error);
            new Notice('Failed to delete paper: ' + error.message);
        }
    }

    async updateMasterIndex() {
        const folderPath = this.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        const indexPath = `_papers_index.md`;
        // --- UPDATE: Use the new dynamic sector function ---
        const sectors = await this.getAvailableSectors();
        let indexContent = "# Master Paper Index\n\nThis file lists all research papers in the vault, grouped by sector.\n\n";
        const allPapers = Array.from(this.paperIndex.values());
        for (const sector of sectors) {
            indexContent += `## ${sector}\n\n`;
            indexContent += `| Title | Authors | Year | Tags | \n`;
            indexContent += `| --- | --- | --- | --- | \n`;
            const sectorFiles = allPapers.filter(p => p.sector === sector);
            sectorFiles.sort((a, b) => b.mtime - a.mtime);
            for (const paper of sectorFiles) {
                const fm = paper.frontmatter;
                const title = fm.title || paper.basename;
                const authors = normalizeAuthors(fm.authors) || 'N/A';
                const year = fm.year || 'N/A';
                const displayTags = formatTagsForIndex(fm.tags) || '';
                const pdfFileName = fm.pdf_file;
                let pdfCell = 'N/A';
                if (pdfFileName) {
                    // pdf_file is stored as a logical path like '_research-papers/pdf/LLM/file.pdf' or similar
                    const safePdf = String(pdfFileName).replace(/\\\\/g, '/');
                    // Use markdown link for master index table
                    pdfCell = `[pdf link](${safePdf})`;
                }
                indexContent += `| [[${paper.basename}]] | ${authors} | ${year} | ${displayTags} | ${pdfCell} |\n`;
            }

            indexContent += `\n`;
        }
        const indexFile = this.app.vault.getAbstractFileByPath(indexPath);
        if (indexFile instanceof TFile) {
             await this.app.vault.modify(indexFile, indexContent);
        } else {
            await this.app.vault.create(indexPath, indexContent);
        }
    }
    
    async toggleFolderVisibility(hideFolder) {
        const oldHideValue = this.settings.hideFolderFromFiles;
        const baseFolderName = this.settings.pdfDownloadFolder.replace(/^\./, '');
        const oldPath = oldHideValue ? `.${baseFolderName}` : baseFolderName;
        const newPath = hideFolder ? `.${baseFolderName}` : baseFolderName;
        if (oldPath === newPath) return;
        try {
            const oldFolder = this.app.vault.getAbstractFileByPath(oldPath);
            if (oldFolder) {
                await this.app.fileManager.renameFile(oldFolder, newPath);
                new Notice(`Folder moved from "${oldPath}" to "${newPath}"`);
            }
            this.settings.hideFolderFromFiles = hideFolder;
            await this.saveSettings();
            await this.rebuildAndRefresh();
        } catch (error) {
            console.error('Error toggling folder visibility:', error);
            new Notice(`Failed to change folder visibility: ${error.message}`);
            this.settings.hideFolderFromFiles = oldHideValue;
            await this.saveSettings();
        }
    }
}


class PaperModal extends Modal {
    constructor(app, plugin, onSubmit) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
    }

    async onOpen() { // Now async
        const { contentEl } = this;
        contentEl.createEl('div', { text: 'Enter the arXiv URL or a direct PDF link of the research paper:' });
        const input = contentEl.createEl('input', { type: 'text', placeholder: 'https://arxiv.org/abs/...  OR  https://domain.com/paper.pdf' });
        input.style.width = '100%';
        input.style.marginTop = '10px';

        contentEl.createEl('div', { text: 'Select research sector:' });
        const sectorSelect = contentEl.createEl('select');
        sectorSelect.style.width = '100%';
        sectorSelect.style.marginTop = '6px';

        // --- UPDATE: Use the new dynamic sector function ---
        const sectors = await this.plugin.getAvailableSectors();
        for (const s of sectors) {
            sectorSelect.createEl('option', { text: s, value: s });
        }
        sectorSelect.value = this.plugin.settings.defaultSector || 'Other';

        const newSectorInput = contentEl.createEl('input', { type: 'text', placeholder: 'Or type a new sector name' });
        newSectorInput.style.width = '100%';
        newSectorInput.style.marginTop = '6px';
		const buttonContainer = contentEl.createEl('div', { cls: 'button-container' });
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'center';
        const button = buttonContainer.createEl('button', { text: 'Add Paper' });
        button.style.marginTop = '20px';

        if (!document.getElementById('ra-spinner-style')) {
            const style = document.createElement('style');
            style.id = 'ra-spinner-style';
            style.textContent = `@keyframes ra-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
            document.head.appendChild(style);
        }
        const spinner = buttonContainer.createEl('div', { cls: 'ra-spinner' });
        spinner.style.display = 'none';
        spinner.style.border = '4px solid rgba(0,0,0,0.1)';
        spinner.style.borderTop = '4px solid var(--interactive-accent)';
        spinner.style.borderRadius = '50%';
        spinner.style.width = '18px';
        spinner.style.height = '18px';
        spinner.style.marginLeft = '8px';
        spinner.style.animation = 'ra-spin 1s linear infinite';

        button.addEventListener('click', async () => {
            const url = input.value.trim();
            if (!url) return;
            let sector = sectorSelect.value;
            const newSector = newSectorInput.value.trim();
            if (newSector) {
                sector = newSector;
                if (!this.plugin.settings.sectors.includes(newSector)) {
                    this.plugin.settings.sectors.push(newSector);
                    await this.plugin.saveSettings();
                }
            }
            const originalBtnText = button.textContent;
            try {
                button.disabled = true;
                input.disabled = true;
                sectorSelect.disabled = true;
                newSectorInput.disabled = true;
                spinner.style.display = 'inline-block';
                button.textContent = 'Adding...';
                await this.onSubmit(url, sector);
                this.close();
            } catch (err) {
                new Notice('Error adding paper: ' + (err && err.message ? err.message : String(err)));
            } finally {
                spinner.style.display = 'none';
                button.disabled = false;
                input.disabled = false;
                sectorSelect.disabled = false;
                newSectorInput.disabled = false;
                button.textContent = originalBtnText;
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

class RASettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display() { // Now async
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Research Assistant Settings' });

        new Setting(containerEl)
            .setName('PDF Download Folder')
            .setDesc('The folder to save papers and notes.')
            .addText(text => text
                .setPlaceholder('e.g., _research-papers')
                .setValue(this.plugin.settings.pdfDownloadFolder)
                .onChange(async (value) => {
                    this.plugin.settings.pdfDownloadFolder = value || '_research-papers';
                    await this.plugin.saveSettings();
                    await this.plugin.rebuildAndRefresh();
                }));
        
        new Setting(containerEl)
            .setName('Hide folder from Files')
            .setDesc('Prefix the folder name with a dot (e.g., ".research-papers") to hide it. This will move the existing folder and its contents.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hideFolderFromFiles)
                .onChange(async (value) => {
                    await this.plugin.toggleFolderVisibility(value);
                }));

        containerEl.createEl('h3', { text: 'Summarization API Settings' });

        new Setting(containerEl)
            .setName('API Endpoint URL').addText(text => text.setPlaceholder('https://api.openai.com/v1/chat/completions').setValue(this.plugin.settings.summaryApiEndpoint).onChange(async (value) => { this.plugin.settings.summaryApiEndpoint = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl)
            .setName('Model Name').addText(text => text.setPlaceholder('gpt-4-turbo').setValue(this.plugin.settings.summaryApiModel).onChange(async (value) => { this.plugin.settings.summaryApiModel = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl)
            .setName('API Key').addText(text => text.setPlaceholder('sk-xxxxxxxxxxxx').setValue(this.plugin.settings.summaryApiKey).onChange(async (value) => { this.plugin.settings.summaryApiKey = value; await this.plugin.saveSettings(); }));

        containerEl.createEl('h3', { text: 'Research Sectors' });
        
        // --- UPDATE: Use the new dynamic sector function for all sector UI ---
        const availableSectors = await this.plugin.getAvailableSectors();

        // Ensure the configured defaultSector is valid. If not, set a sensible fallback and persist.
        if (!availableSectors.includes(this.plugin.settings.defaultSector)) {
            // Prefer 'Other' if present, otherwise first available sector, otherwise set to 'Other'.
            const fallback = availableSectors.includes('Other') ? 'Other' : (availableSectors[0] || 'Other');
            this.plugin.settings.defaultSector = fallback;
            await this.plugin.saveSettings();
        }

        new Setting(containerEl)
            .setName('Default Sector')
            .setDesc('Sector selected by default when adding new papers.')
            .addDropdown(drop => {
                drop.addOptions(Object.fromEntries(availableSectors.map(s => [s, s])));
                try { drop.setValue(this.plugin.settings.defaultSector); } catch (e) { drop.setValue(availableSectors[0] || 'Other'); }
                drop.onChange(async (value) => {
                    this.plugin.settings.defaultSector = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Manage Sectors')
            .setDesc('Add or remove sectors. Folders found on disk are automatically included.');

        const sectorsWrap = containerEl.createEl('div', { cls: 'sectors-wrap' });
        
        availableSectors.forEach(sector => {
            const isManaged = this.plugin.settings.sectors.includes(sector);
            const isDiscovered = !isManaged;

            const setting = new Setting(sectorsWrap).setName(sector);
            
            if (isDiscovered) {
                 setting.setDesc("Discovered from folder");
            }

            if (isManaged && sector !== 'Other') { // Prevent removing 'Other'
                setting.addButton(button => {
                    button.setButtonText('Remove').onClick(async () => {
                        this.plugin.settings.sectors = this.plugin.settings.sectors.filter(s => s !== sector);
                        if (this.plugin.settings.defaultSector === sector) {
                            this.plugin.settings.defaultSector = 'Other';
                        }
                        await this.plugin.saveSettings();
                        this.display();
                    });
                });
            }
        });

        new Setting(containerEl)
            .setName('Add new sector')
            .addText(text => {
                text.setPlaceholder('New sector name');
                text.inputEl.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const value = text.getValue().trim();
                        if (value && !this.plugin.settings.sectors.includes(value)) {
                            this.plugin.settings.sectors.push(value);
                            // Automatically create the folder for the new sector
                            await this.plugin.ensureFolderExists(`${this.plugin.settings.pdfDownloadFolder}/${value}`);
                            await this.plugin.saveSettings();
                            text.setValue('');
                            this.display();
                        }
                    }
                });
            });
    }
}

module.exports = ResearchAssistantPlugin;