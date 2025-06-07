const { TFile, Notice } = require('obsidian');
const { formatTagsForIndex, normalizeAuthors, normalizeTags } = require('../utils/formatters');

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

    isPaperFile(file) {
        const paperFolder = this.fileService.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        return file.path.startsWith(paperFolder) && !file.name.startsWith('_') && file.extension === 'md';
    }

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

    async buildPaperIndex() {
        this.paperIndex.clear();
        const files = this.app.vault.getMarkdownFiles();
        
        for (const file of files) {
            const paperData = await this.parsePaperFile(file);
            if (paperData) {
                this.paperIndex.set(file.path, paperData);
            }
        }
    }

    async getAvailableSectors() {
        const settingsSectors = new Set(this.settings.sectors || ['Other']);
        const folderPath = this.fileService.getEffectiveFolderPath(this.settings.pdfDownloadFolder);

        try {
            if (await this.app.vault.adapter.exists(folderPath)) {
                const list = await this.app.vault.adapter.list(folderPath);
                const folderSectors = list.folders.map(folder => folder.split('/').pop());
                folderSectors.forEach(sector => settingsSectors.add(sector));
            }
        } catch (error) {
            // ignore
        }

        if (settingsSectors.size === 0) {
            settingsSectors.add('Other');
        }

        const sortedSectors = Array.from(settingsSectors).sort();
        if (sortedSectors.includes('Other')) {
            return sortedSectors.filter(s => s !== 'Other').concat('Other');
        }
        return sortedSectors;
    }

    async pruneUnusedSectors(saveSettings) {
        const baseFolder = this.fileService.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        const sectorCounts = new Map();

        for (const paper of this.paperIndex.values()) {
            sectorCounts.set(paper.sector, (sectorCounts.get(paper.sector) || 0) + 1);
        }

        let changed = false;
        const managed = [...this.settings.sectors];

        for (const sector of managed) {
            if (sector === 'Other') continue;

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
                    const safePdf = String(pdfFileName).replace(/\\/g, '/');
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
                    errorCount++;
                }
            }

            const message = `${commandName} complete! Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`;
            new Notice(message);
        } catch (error) {
            new Notice(`Error during ${commandName}: ${error.message}`);
        }
    }

    async generateResumeForPapers(llmService) {
        await this.processAllPapers({
            commandName: "Resume Generation",
            shouldSkipFn: async (content, frontmatter) => /^\s*#{1,6}\s+(Resume|Summary)/im.test(content),
            processFn: async (paperFile, content) => {
                const fm = this.app.metadataCache.getFileCache(paperFile)?.frontmatter || {};
                let llmInput = content;
                const pdfFileRef = fm.pdf_file;

                if (pdfFileRef && this.pdfService) {
                    try {
                        let logicalPath = String(pdfFileRef);
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
                                new Notice(`❌ PDF parsing yielded insufficient text for ${paperFile.basename}. Skipping resume generation.`);
                                return;
                            }
                        } else {
                            new Notice(`❌ PDF file not found for ${paperFile.basename}. Skipping resume generation.`);
                            return;
                        }
                    } catch (err) {
                        new Notice(`❌ Failed to parse PDF for ${paperFile.basename}. Skipping resume generation.`);
                        return;
                    }
                }

                const resume = await llmService.getSummary(llmInput);
                const paperPdfHeadingRegex = /^##\s+Paper PDF/im;
                const pdfEmbedRegex = /!\[\[.*?\.pdf\]\]/i;

                let newContent;
                const paperPdfMatch = content.match(paperPdfHeadingRegex);
                if (paperPdfMatch) {
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

    async cleanAllResumes() {
        const baseFiles = Array.from(this.paperIndex.values());
        let modified = 0;
        for (const paperData of baseFiles) {
            const paperFile = this.app.vault.getAbstractFileByPath(paperData.path);
            if (!(paperFile instanceof TFile)) continue;
            try {
                const content = await this.app.vault.read(paperFile);
                const resumeToPdfRegex = /# Resume([\s\S]*?)(?=!\[\[.*?\.pdf\]\])/g;
                if (resumeToPdfRegex.test(content)) {
                    const newContent = content.replace(resumeToPdfRegex, '');
                    await this.app.vault.modify(paperFile, newContent.trim() + '\n');
                    modified++;
                }
            } catch (err) {
                // ignore
            }
        }
        new Notice(`Cleaned resume sections in ${modified} files.`);
    }
}

module.exports = PaperService;