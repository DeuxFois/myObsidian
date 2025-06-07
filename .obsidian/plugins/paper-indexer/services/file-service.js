const { requestUrl, TFile, Notice } = require('obsidian');
const { sanitizeNoteTitle, generatePdfFileName } = require('../utils/formatters');

class FileService {
    constructor(app, settings) {
        this.app = app;
        this.settings = settings;
    }

    getEffectiveFolderPath(folderPath) {
        if (this.settings.hideFolderFromFiles) {
            if (folderPath.startsWith('.')) return folderPath;
            return `.${folderPath}`;
        }
        return folderPath;
    }

    async ensureFolderExists(folderPath) {
        const effectivePath = this.getEffectiveFolderPath(folderPath);
        if (!await this.app.vault.adapter.exists(effectivePath)) {
            await this.app.vault.createFolder(effectivePath);
        }
    }

    async downloadPdf(metadata, sector, fileName) {
        if (!metadata.pdfLink) {
            throw new Error('No PDF link found.');
        }

        const pdfBase = `${this.settings.pdfDownloadFolder}/pdf`;
        const targetFolder = sector ? `${pdfBase}/${sector}` : pdfBase;
        await this.ensureFolderExists(targetFolder);
        
        const targetEffective = this.getEffectiveFolderPath(targetFolder);
        const filePath = `${targetEffective}/${fileName}`;
        
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
        
        return `${pdfBase}/${sector}/${fileName}`.replace(/\\/g, '/');
    }

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
                let pdfLogical = pdfFileName;
                if (!pdfLogical.includes('/')) {
                    pdfLogical = `${noteFile.parent.path}/${pdfLogical}`;
                }
                const pdfEffective = await this.resolveLogicalToEffectivePath(pdfLogical);
                const pdfFile = this.app.vault.getAbstractFileByPath(pdfEffective);
                if (pdfFile) {
                    await this.app.vault.delete(pdfFile);
                }
            }
            
            await this.app.vault.delete(noteFile);
            new Notice('Paper deleted.');
        } catch (error) {
            new Notice('Failed to delete paper: ' + error.message);
        }
    }

    async resolveLogicalToEffectivePath(logicalPath) {
        if (await this.app.vault.adapter.exists(logicalPath)) return logicalPath;

        const parts = logicalPath.split('/');
        if (parts.length > 0) {
            parts[0] = '.' + parts[0];
            const dotted = parts.join('/');
            if (await this.app.vault.adapter.exists(dotted)) return dotted;
        }

        return logicalPath;
    }

    async cleanEmptySectorFolders() {
        const baseFolder = this.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        
        try {
            if (!await this.app.vault.adapter.exists(baseFolder)) return;
            
            const listing = await this.app.vault.adapter.list(baseFolder);
            
            for (const folderPath of listing.folders) {
                if (folderPath === baseFolder) continue;
                
                const rel = folderPath.slice(baseFolder.length + 1);
                if (!rel || rel.startsWith('_')) continue;
                
                const subListing = await this.app.vault.adapter.list(folderPath);
                const isEmpty = subListing.files.length === 0 && subListing.folders.length === 0;
                
                if (isEmpty) {
                    try {
                        await this.app.vault.adapter.rmdir(folderPath, true);
                    } catch (err) {
                        // ignore
                    }
                }
            }
        } catch (e) {
            // ignore
        }
    }

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
            new Notice(`Failed to change folder visibility: ${error.message}`);
            this.settings.hideFolderFromFiles = oldHideValue;
            await saveSettings();
        }
    }
}

module.exports = FileService;