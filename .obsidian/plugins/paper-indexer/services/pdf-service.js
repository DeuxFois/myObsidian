const { Notice } = require('obsidian');

class PdfService {
    constructor(app, settings) {
        this.app = app;
        this.settings = settings;
        this.pdfjsLib = null;
    }

    async initializePdfJs() {
        if (this.pdfjsLib) {
            return true;
        }

        try {
            if (this.app && typeof this.app.loadPdfJs === 'function') {
                try {
                    this.pdfjsLib = await this.app.loadPdfJs();
                    return true;
                } catch (e) {
                    // ignore
                }
            }
            
            if (typeof window !== 'undefined' && window.pdfjsLib) {
                this.pdfjsLib = window.pdfjsLib;
                return true;
            }

            const pdfFiles = this.app.vault.getFiles().filter(f => f.extension === 'pdf');
            if (pdfFiles.length > 0) {
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(pdfFiles[0]);
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                if (leaf.view && leaf.view.renderer && leaf.view.renderer.pdfjs) {
                    this.pdfjsLib = leaf.view.renderer.pdfjs;
                    leaf.detach();
                    return true;
                }
                
                leaf.detach();
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    async extractTextFromPdf(pdfFile) {
        if (!pdfFile) throw new Error('No PDF file provided');

        try {
            const arrayBuffer = await this.app.vault.readBinary(pdfFile);

            let pdfjsLib = this.pdfjsLib;
            
            if (!pdfjsLib) {
                if (this.app && typeof this.app.loadPdfJs === 'function') {
                    try {
                        pdfjsLib = await this.app.loadPdfJs();
                        this.pdfjsLib = pdfjsLib;
                    } catch (e) {
                        // ignore
                    }
                }
                
                if (!pdfjsLib && typeof window !== 'undefined' && window.pdfjsLib) {
                    pdfjsLib = window.pdfjsLib;
                    this.pdfjsLib = pdfjsLib;
                }
                
                if (!pdfjsLib && this.app.workspace) {
                    try {
                        const pdfViews = this.app.workspace.getLeavesOfType('pdf');
                        if (pdfViews.length > 0) {
                            const pdfView = pdfViews[0].view;
                            if (pdfView && pdfView.renderer && pdfView.renderer.pdfjs) {
                                pdfjsLib = pdfView.renderer.pdfjs;
                                this.pdfjsLib = pdfjsLib;
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                }
                
                if (!pdfjsLib) {
                    try {
                        const leaf = this.app.workspace.getLeaf(false);
                        await leaf.openFile(pdfFile);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        if (leaf.view && leaf.view.renderer && leaf.view.renderer.pdfjs) {
                            pdfjsLib = leaf.view.renderer.pdfjs;
                            this.pdfjsLib = pdfjsLib;
                        }
                        
                        leaf.detach();
                    } catch (e) {
                        // ignore
                    }
                }
            }

            if (!pdfjsLib) {
                const errorMsg = 'PDF.js not available. Please open a PDF file in Obsidian first to initialize PDF.js, then try again.';
                throw new Error(errorMsg);
            }

            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;

            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map(item => (item && item.str) ? item.str : '').join(' ');
                fullText += `\n\n---- Page ${i} ----\n\n` + pageText;
            }

            try { if (pdf && typeof pdf.destroy === 'function') pdf.destroy(); } catch (_) {}

            return fullText.trim();
        } catch (error) {
            throw error;
        }
    }
}

module.exports = PdfService;
