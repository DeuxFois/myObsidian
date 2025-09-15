const { TFile, Notice } = require('obsidian');
const { formatTagsForIndex, normalizeAuthors, normalizeTags } = require('../utils/formatters');

/**
 * Service for managing paper index and operations
 */
class PaperService {
    constructor(app, settings, fileService, pdfService) {
        this.app = app;
        this.settings = settings;
        this.fileService = fileService;
        this.pdfService = pdfService;
        this.paperIndex = new Map();
        this._rebuildTimer = null;
        this._rebuildPending = false;
    }

    /**
     * Check if file is a paper file
     * @param {TFile} file - File to check
     * @returns {boolean} True if paper file
     */
    isPaperFile(file) {
        const paperFolder = this.fileService.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        return file.path.startsWith(paperFolder) && !file.name.startsWith('_') && file.extension === 'md';
    }

    /**
     * Parse paper file to extract data
     * @param {TFile} file - Paper file
     * @returns {Object|null} Paper data or null
     */
    async parsePaperFile(file) {
        if (!this.isPaperFile(file)) return null;

        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter || {};
        const paperFolder = this.fileService.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
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

    /**
     * Build paper index from all markdown files
     */
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

    /**
     * Get all available sectors from folders and settings
     * @returns {Promise<string[]>} Array of sector names
     */
    async getAvailableSectors() {
        const settingsSectors = new Set(this.settings.sectors || ['Other']);
        const folderPath = this.fileService.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
    
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

    /**
     * Prune unused sectors from settings
     * @param {Function} saveSettings - Function to save settings
     */
    async pruneUnusedSectors(saveSettings) {
        const baseFolder = this.fileService.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
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
            
            try { 
                folderExists = await this.app.vault.adapter.exists(folderPath); 
            } catch (_) {}
            
            if (!hasPapers && !folderExists) {
                this.settings.sectors = this.settings.sectors.filter(s => s !== sector);
                if (this.settings.defaultSector === sector) {
                    this.settings.defaultSector = 'Other';
                }
                changed = true;
            }
        }
        
        if (changed) await saveSettings();
    }

    /**
     * Schedule rebuild with debouncing
     * @param {number} delay - Delay in milliseconds
     * @param {Function} rebuildAndRefresh - Function to rebuild and refresh
     */
    scheduleRebuild(delay = 300, rebuildAndRefresh) {
        this._rebuildPending = true;
        if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
        
        this._rebuildTimer = setTimeout(async () => {
            try {
                await rebuildAndRefresh();
            } finally {
                this._rebuildPending = false;
            }
        }, delay);
    }

    /**
     * Update master index file
     */
    async updateMasterIndex() {
        const indexPath = `_papers_index.md`;
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

    /**
     * Process all papers with a given operation
     * @param {Object} options - Processing options
     */
    async processAllPapers(options) {
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

    /**
     * Generate resumes for all papers
     * @param {LLMService} llmService - LLM service instance
     */
    async generateResumeForPapers(llmService) {
        await this.processAllPapers({
            commandName: "Resume Generation",
            // skip if there's already a Resume or Summary heading at any level (#, ##, etc.)
            shouldSkipFn: async (content, frontmatter) => /^\s*#{1,6}\s+(Resume|Summary)/im.test(content),
            processFn: async (paperFile, content) => {
                // Prefer extracting text from attached PDF when available
                const fm = this.app.metadataCache.getFileCache(paperFile)?.frontmatter || {};
                let llmInput = content;
                const pdfFileRef = fm.pdf_file;

                if (pdfFileRef && this.pdfService) {
                    try {
                        // try to resolve the logical path to an actual TFile
                        let logicalPath = String(pdfFileRef);
                        // If frontmatter contains only a filename, resolve relative to the note's folder
                        if (!logicalPath.includes('/') && paperFile.parent && paperFile.parent.path) {
                            logicalPath = `${paperFile.parent.path}/${logicalPath}`;
                        }
                        const effectivePath = await this.fileService.resolveLogicalToEffectivePath(logicalPath);
                        const pdfTFile = this.app.vault.getAbstractFileByPath(effectivePath);
                        if (pdfTFile) {
                            const extracted = await this.pdfService.extractTextFromPdf(pdfTFile);
                            if (extracted && extracted.length > 20) {
                                llmInput = extracted;
                            } else {
                                // If extraction yields little text, treat as failure per user request: don't generate resume
                                new Notice(`❌ PDF parsing yielded insufficient text for ${paperFile.basename}. Skipping resume generation.`);
                                console.warn(`PDF parsing yielded insufficient text for ${paperFile.path}`);
                                return; // skip LLM/resume for this paper
                            }
                        } else {
                            // PDF file referenced but not found: do NOT generate resume
                            new Notice(`❌ PDF file not found for ${paperFile.basename}. Skipping resume generation.`);
                            console.warn(`PDF file not found at resolved path: ${effectivePath} for ${paperFile.path}`);
                            return; // skip LLM/resume for this paper
                        }
                    } catch (err) {
                        console.error('PDF extraction failed for', paperFile.path, err);
                        new Notice(`❌ Failed to parse PDF for ${paperFile.basename}. Skipping resume generation.`);
                        return; // skip calling LLM for this paper since parsing failed
                    }
                }

                const resume = await llmService.getResume(llmInput);
                // Prefer inserting the Resume section immediately before the "## Paper PDF" heading
                // If that heading is not found, fall back to the PDF embed, then append at the end.
                const paperPdfHeadingRegex = /^##\s+Paper PDF/im;
                const pdfEmbedRegex = /!\[\[.*?\.pdf\]\]/i;

                let newContent;
                const paperPdfMatch = content.match(paperPdfHeadingRegex);
                if (paperPdfMatch) {
                    // insert before the heading's position
                    const insertPosition = content.search(paperPdfHeadingRegex);
                    newContent = content.slice(0, insertPosition) + `# Resume\n\n${resume}\n\n` + content.slice(insertPosition);
                } else {
                    const pdfMatch = content.match(pdfEmbedRegex);
                    if (pdfMatch) {
                        const insertPosition = content.indexOf(pdfMatch[0]);
                        newContent = content.slice(0, insertPosition) + `# Resume\n\n${resume}\n\n` + content.slice(insertPosition);
                    } else {
                        newContent = content + `\n\n# Resume\n\n${resume}\n`;
                    }
                }
                
                await this.app.vault.modify(paperFile, newContent);
            }
        });
    }

    /**
     * Generate tags for all papers
     * @param {LLMService} llmService - LLM service instance
     */
    async generateTagsForPapers(llmService) {
        await this.processAllPapers({
            commandName: "Tag Generation",
            shouldSkipFn: async (content, frontmatter) => {
                const existingTags = normalizeTags(frontmatter.tags);
                const defaultTags = ['paper', 'to-read'];
                return existingTags.some(tag => !defaultTags.includes(tag));
            },
            processFn: async (paperFile, content) => {
                const generatedTags = await llmService.getTags(content);
                const tagsArray = generatedTags.split(',').map(tag => tag.trim()).filter(Boolean);
                const defaultTags = ['paper', 'to-read'];
                const combinedTags = [...new Set([...defaultTags, ...tagsArray])];
                
                await this.app.fileManager.processFrontMatter(paperFile, (fm) => {
                    fm.tags = combinedTags;
                });
            }
        });
    }

    /**
     * Remove all '## Resume' or '## Summary' sections from paper files
     * This will strip the heading and all content until the next top-level heading (## or #) or end of file.
     */
    async cleanAllResumes() {
        const baseFiles = Array.from(this.paperIndex.values());
        let modified = 0;
        for (const paperData of baseFiles) {
            const paperFile = this.app.vault.getAbstractFileByPath(paperData.path);
            if (!(paperFile instanceof TFile)) continue;
            try {
                const content = await this.app.vault.read(paperFile);
                // Remove section starting from a '# Resume' (or any heading level) up to the next PDF embed '![[...pdf]]'
                // Keep the PDF embed intact.
                // This regex matches a heading like '# Resume' / '## Resume' (case-insensitive) and any following text
                // up until (but not including) the next PDF embed or end of file.
                const resumeToPdfRegex = /# Resume([\s\S]*?)(?=!\[\[.*?\.pdf\]\])/g;
                if (resumeToPdfRegex.test(content)) {
                    const newContent = content.replace(resumeToPdfRegex, '');
                    await this.app.vault.modify(paperFile, newContent.trim() + '\n');
                    modified++;
                }
            } catch (err) {
                console.error('Failed to clean resume for', paperData.path, err);
            }
        }
        new Notice(`Cleaned resume sections in ${modified} files.`);
    }
}

module.exports = PaperService;