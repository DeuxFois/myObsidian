const { Modal, Notice } = require('obsidian');

class PaperModal extends Modal {
    constructor(app, plugin, onSubmit) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
    }

    async onOpen() {
        const { contentEl } = this;
        
        this.createInstructions(contentEl);
        const input = this.createUrlInput(contentEl);
        const { sectorSelect, newSectorInput } = await this.createSectorSelection(contentEl);
        const { button, spinner } = this.createSubmitButton(contentEl);
        
        this.setupSubmitHandler(button, spinner, input, sectorSelect, newSectorInput);
    }

    createInstructions(contentEl) {
        contentEl.createEl('div', { 
            text: 'Enter the arXiv URL or a direct PDF link of the research paper:' 
        });
    }

    createUrlInput(contentEl) {
        const input = contentEl.createEl('input', { 
            type: 'text', 
            placeholder: 'https://arxiv.org/abs/...  OR  https://domain.com/paper.pdf' 
        });
        input.style.width = '100%';
        input.style.marginTop = '10px';
        return input;
    }

    async createSectorSelection(contentEl) {
        contentEl.createEl('div', { text: 'Select research sector:' });
        
        const sectorSelect = contentEl.createEl('select');
        sectorSelect.style.width = '100%';
        sectorSelect.style.marginTop = '6px';

        const sectors = await this.plugin.paperService.getAvailableSectors();
        for (const s of sectors) {
            sectorSelect.createEl('option', { text: s, value: s });
        }
        sectorSelect.value = this.plugin.settings.defaultSector || 'Other';

        const newSectorInput = contentEl.createEl('input', { 
            type: 'text', 
            placeholder: 'Or type a new sector name' 
        });
        newSectorInput.style.width = '100%';
        newSectorInput.style.marginTop = '6px';

        return { sectorSelect, newSectorInput };
    }

    createSubmitButton(contentEl) {
        const buttonContainer = contentEl.createEl('div', { cls: 'button-container' });
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        
        const button = buttonContainer.createEl('button', { text: 'Add Paper' });
        button.style.marginTop = '20px';

        this.addSpinnerStyles();
        
        const spinner = buttonContainer.createEl('div', { cls: 'ra-spinner' });
        spinner.style.display = 'none';
        spinner.style.border = '4px solid rgba(0,0,0,0.1)';
        spinner.style.borderTop = '4px solid var(--interactive-accent)';
        spinner.style.borderRadius = '50%';
        spinner.style.width = '18px';
        spinner.style.height = '18px';
        spinner.style.marginLeft = '8px';
        spinner.style.animation = 'ra-spin 1s linear infinite';

        return { button, spinner };
    }

    addSpinnerStyles() {
        if (!document.getElementById('ra-spinner-style')) {
            const style = document.createElement('style');
            style.id = 'ra-spinner-style';
            style.textContent = `@keyframes ra-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
            document.head.appendChild(style);
        }
    }

    setupSubmitHandler(button, spinner, input, sectorSelect, newSectorInput) {
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
            
            await this.handleSubmission(button, spinner, input, sectorSelect, newSectorInput, url, sector);
        });
    }

    async handleSubmission(button, spinner, input, sectorSelect, newSectorInput, url, sector) {
        const originalBtnText = button.textContent;
        
        try {
            this.setLoadingState(true, button, spinner, input, sectorSelect, newSectorInput);
            await this.onSubmit(url, sector);
            this.close();
        } catch (err) {
            new Notice('Error adding paper: ' + (err && err.message ? err.message : String(err)));
        } finally {
            this.setLoadingState(false, button, spinner, input, sectorSelect, newSectorInput, originalBtnText);
        }
    }

    setLoadingState(loading, button, spinner, input, sectorSelect, newSectorInput, originalText = 'Add Paper') {
        button.disabled = loading;
        input.disabled = loading;
        sectorSelect.disabled = loading;
        newSectorInput.disabled = loading;
        spinner.style.display = loading ? 'inline-block' : 'none';
        button.textContent = loading ? 'Adding...' : originalText;
    }

    onClose() {
        this.contentEl.empty();
    }
}

module.exports = PaperModal;