const { requestUrl, TFile, Notice } = require('obsidian');
const { sanitizeNoteTitle, generatePdfFileName } = require('../utils/formatters');

/**
 * Service for handling file operations (downloads, folder management, etc.)
 */
class FileService {
    constructor(app, settings) {
        this.app = app;
        this.settings = settings;
    }

    /**
     * Get effective folder path (with dot prefix if hidden)
     * @param {string} folderPath - Base folder path
     * @returns {string} Effective path
     */
    getEffectiveFolderPath(folderPath) {
        if (this.settings.hideFolderFromFiles) {
            if (folderPath.startsWith('.')) return folderPath;
            return `.${folderPath}`;
        }
        return folderPath;
    }

    /**
     * Ensure folder exists, create if necessary
     * @param {string} folderPath - Folder path to ensure
     */
    async ensureFolderExists(folderPath) {
        const effectivePath = this.getEffectiveFolderPath(folderPath);
        if (!await this.app.vault.adapter.exists(effectivePath)) {
            await this.app.vault.createFolder(effectivePath);
        }
    }

    /**
     * Download PDF file from URL
     * @param {Object} metadata - Paper metadata
     * @param {string} sector - Research sector
     * @param {string} fileName - File name for the PDF
     * @returns {Promise<string>} Logical vault path to the PDF
     */
    async downloadPdf(metadata, sector, fileName) {
        if (!metadata.pdfLink) {
            throw new Error('No PDF link found.');
        }

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

        const pdfResponse = await requestUrl({ 
            url: metadata.pdfLink, 
            method: 'GET', 
            throw: false 
        });
        
        if (!pdfResponse || (typeof pdfResponse.status === 'number' && pdfResponse.status !== 200)) {
            throw new Error('Failed to download PDF.');
        }

        await this.app.vault.createBinary(filePath, pdfResponse.arrayBuffer);
        
        // Return logical vault path (not necessarily the effective dot-prefixed path)
        return `${pdfBase}/${sector}/${fileName}`.replace(/\\/g, '/');
    }

    /**
     * Create paper note file
     * @param {Object} metadata - Paper metadata
     * @param {string} sector - Research sector
     * @param {string} pdfLogicalPath - Path to the PDF file
     */
    async createPaperNote(metadata, sector, pdfLogicalPath) {
        const sectorFolder = `${this.settings.pdfDownloadFolder}/${sector}`;
        await this.ensureFolderExists(sectorFolder);
        
        const sanitizedTitle = sanitizeNoteTitle(metadata.title);
        const notePath = `${this.getEffectiveFolderPath(sectorFolder)}/${sanitizedTitle}.md`;
        
        if (await this.app.vault.adapter.exists(notePath)) {
            new Notice(`Note "${sanitizedTitle}.md" already exists.`);
            return;
        }

        const year = new Date(metadata.published).getFullYear();
        
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

    /**
     * Delete paper and associated PDF
     * @param {TFile} noteFile - The note file to delete
     * @param {Object} paperData - Paper data from index
     */
    async deletePaper(noteFile, paperData) {
        const frontmatter = paperData?.frontmatter || {};
        let pdfFileName = frontmatter.pdf_file;
        
        if (!pdfFileName && frontmatter.title && frontmatter.authors && (frontmatter.published || frontmatter.year)) {
            const legacyMetadata = {
                title: frontmatter.title,
                authors: frontmatter.authors,
                published: frontmatter.published || String(frontmatter.year),
            };
            pdfFileName = generatePdfFileName(legacyMetadata);
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
                // resolve logical -> effective path (handles dot-prefixed folders)
                const pdfEffective = await this.resolveLogicalToEffectivePath(pdfLogical);
                const pdfFile = this.app.vault.getAbstractFileByPath(pdfEffective);
                if (pdfFile) {
                    await this.app.vault.delete(pdfFile);
                }
            }
            
            await this.app.vault.delete(noteFile);
            new Notice('Paper deleted.');
        } catch (error) {
            console.error('Error deleting paper:', error);
            new Notice('Failed to delete paper: ' + error.message);
        }
    }

    /**
     * Try to resolve a logical vault path to the actual effective path in the adapter
     * This accounts for dot-prefixed hidden folders when settings.hideFolderFromFiles is true
     * @param {string} logicalPath
     * @returns {Promise<string>} effectivePath
     */
    async resolveLogicalToEffectivePath(logicalPath) {
        // If the path already exists, return it
        if (await this.app.vault.adapter.exists(logicalPath)) return logicalPath;

        // Try dot-prefixed base folder
        const parts = logicalPath.split('/');
        if (parts.length > 0) {
            parts[0] = '.' + parts[0];
            const dotted = parts.join('/');
            if (await this.app.vault.adapter.exists(dotted)) return dotted;
        }

        // Fallback to original logical path
        return logicalPath;
    }

    /**
     * Remove empty sector folders
     */
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
                    } catch (err) {
                        console.warn('Failed to remove empty sector folder', folderPath, err);
                    }
                }
            }
        } catch (e) {
            console.warn('cleanEmptySectorFolders error', e);
        }
    }

    /**
     * Toggle folder visibility (hide/show with dot prefix)
     * @param {boolean} hideFolder - Whether to hide the folder
     * @param {Function} saveSettings - Function to save settings
     * @param {Function} rebuildAndRefresh - Function to rebuild and refresh
     */
    async toggleFolderVisibility(hideFolder, saveSettings, rebuildAndRefresh) {
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
            await saveSettings();
            await rebuildAndRefresh();
        } catch (error) {
            console.error('Error toggling folder visibility:', error);
            new Notice(`Failed to change folder visibility: ${error.message}`);
            this.settings.hideFolderFromFiles = oldHideValue;
            await saveSettings();
        }
    }
}

module.exports = FileService;