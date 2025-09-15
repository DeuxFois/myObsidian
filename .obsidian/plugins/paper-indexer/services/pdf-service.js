const { Notice } = require('obsidian');

/**
 * PDF Service - extract text from PDF files using Obsidian's bundled PDF.js
 */
class PdfService {
    constructor(app, settings) {
        this.app = app;
        this.settings = settings;
        // safety cap for extracted text (very large PDFs can blow up prompts)
        this.pdfjsLib = null; // Cache PDF.js library once loaded
    }

    /**
     * Initialize PDF.js library - call this method to preload PDF.js
     * @returns {Promise<boolean>} true if PDF.js is now available
     */
    async initializePdfJs() {
        if (this.pdfjsLib) {
            return true; // Already loaded
        }

        try {
            // Try the same loading methods as extractTextFromPdf but cache the result
            if (this.app && typeof this.app.loadPdfJs === 'function') {
                try {
                    this.pdfjsLib = await this.app.loadPdfJs();
                    console.log('PDF.js initialized via app.loadPdfJs()');
                    return true;
                } catch (e) {
                    console.warn('Failed to initialize PDF.js via app.loadPdfJs():', e);
                }
            }
            
            if (typeof window !== 'undefined' && window.pdfjsLib) {
                this.pdfjsLib = window.pdfjsLib;
                console.log('PDF.js initialized via window.pdfjsLib');
                return true;
            }

            // Try to trigger PDF.js loading by opening a PDF temporarily
            const pdfFiles = this.app.vault.getFiles().filter(f => f.extension === 'pdf');
            if (pdfFiles.length > 0) {
                console.log('Attempting to initialize PDF.js by opening a PDF...');
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(pdfFiles[0]);
                
                // Wait for PDF.js to load
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                if (leaf.view && leaf.view.renderer && leaf.view.renderer.pdfjs) {
                    this.pdfjsLib = leaf.view.renderer.pdfjs;
                    console.log('PDF.js initialized via temporary PDF view');
                    leaf.detach();
                    return true;
                }
                
                leaf.detach();
            }

            return false;
        } catch (error) {
            console.error('Failed to initialize PDF.js:', error);
            return false;
        }
    }

    /**
     * Extract full text from a PDF TFile using PDF.js loaded from Obsidian.
     * Returns the extracted text (string). Throws on errors.
     * @param {TFile} pdfFile
     * @returns {Promise<string>} extracted text
     */
    async extractTextFromPdf(pdfFile) {
        if (!pdfFile) throw new Error('No PDF file provided');

        try {
            // read binary data from vault
            const arrayBuffer = await this.app.vault.readBinary(pdfFile);

            // Try multiple methods to load PDF.js
            let pdfjsLib = this.pdfjsLib; // Use cached version if available
            
            if (!pdfjsLib) {
                // Method 1: Try Obsidian's newer loadPdfJs method
                if (this.app && typeof this.app.loadPdfJs === 'function') {
                    try {
                        pdfjsLib = await this.app.loadPdfJs();
                        this.pdfjsLib = pdfjsLib; // Cache it
                        console.log('PDF.js loaded via app.loadPdfJs()');
                    } catch (e) {
                        console.warn('Failed to load PDF.js via app.loadPdfJs():', e);
                    }
                }
                
                // Method 2: Try global window object
                if (!pdfjsLib && typeof window !== 'undefined' && window.pdfjsLib) {
                    pdfjsLib = window.pdfjsLib;
                    this.pdfjsLib = pdfjsLib; // Cache it
                    console.log('PDF.js loaded via window.pdfjsLib');
                }
                
                // Method 3: Try Obsidian's internal PDF.js (newer approach)
                if (!pdfjsLib && this.app.workspace) {
                    try {
                        // Check if Obsidian has PDF.js loaded internally
                        const pdfViews = this.app.workspace.getLeavesOfType('pdf');
                        if (pdfViews.length > 0) {
                            // Try to access PDF.js from an existing PDF view
                            const pdfView = pdfViews[0].view;
                            if (pdfView && pdfView.renderer && pdfView.renderer.pdfjs) {
                                pdfjsLib = pdfView.renderer.pdfjs;
                                this.pdfjsLib = pdfjsLib; // Cache it
                                console.log('PDF.js loaded via existing PDF view');
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to load PDF.js via PDF view:', e);
                    }
                }
                
                // Method 4: Try to trigger PDF.js loading by creating a temporary PDF view
                if (!pdfjsLib) {
                    try {
                        console.log('Attempting to load PDF.js by opening PDF temporarily...');
                        const leaf = this.app.workspace.getLeaf(false);
                        await leaf.openFile(pdfFile);
                        
                        // Wait a bit for PDF.js to load
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        if (leaf.view && leaf.view.renderer && leaf.view.renderer.pdfjs) {
                            pdfjsLib = leaf.view.renderer.pdfjs;
                            this.pdfjsLib = pdfjsLib; // Cache it
                            console.log('PDF.js loaded via temporary PDF view');
                        }
                        
                        // Close the temporary view
                        leaf.detach();
                    } catch (e) {
                        console.warn('Failed to load PDF.js via temporary view:', e);
                    }
                }
            }

            if (!pdfjsLib) {
                // If all methods fail, provide a helpful error message
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
            console.error('PdfService.extractTextFromPdf error', error);
            throw error;
        }
    }
}

module.exports = PdfService;
