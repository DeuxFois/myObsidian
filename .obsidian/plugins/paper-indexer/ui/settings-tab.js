const { PluginSettingTab, Setting } = require('obsidian');

class RASettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Research Assistant Settings' });

        this.createFolderSettings(containerEl);
        this.createApiSettings(containerEl);
        await this.createSectorSettings(containerEl);
    }

    createFolderSettings(containerEl) {
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
                    await this.plugin.fileService.toggleFolderVisibility(
                        value, 
                        () => this.plugin.saveSettings(),
                        () => this.plugin.rebuildAndRefresh()
                    );
                }));
    }

    createApiSettings(containerEl) {
        containerEl.createEl('h3', { text: 'Summarization API Settings' });

        new Setting(containerEl)
            .setName('API Endpoint URL')
            .addText(text => text
                .setPlaceholder('https://api.openai.com/v1/chat/completions')
                .setValue(this.plugin.settings.summaryApiEndpoint)
                .onChange(async (value) => {
                    this.plugin.settings.summaryApiEndpoint = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Model Name')
            .addText(text => text
                .setPlaceholder('gpt-4-turbo')
                .setValue(this.plugin.settings.summaryApiModel)
                .onChange(async (value) => {
                    this.plugin.settings.summaryApiModel = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('API Key')
            .addText(text => text
                .setPlaceholder('sk-xxxxxxxxxxxx')
                .setValue(this.plugin.settings.summaryApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.summaryApiKey = value;
                    await this.plugin.saveSettings();
                }));
    }

    async createSectorSettings(containerEl) {
        containerEl.createEl('h3', { text: 'Research Sectors' });
        
        const availableSectors = await this.plugin.paperService.getAvailableSectors();

        if (!availableSectors.includes(this.plugin.settings.defaultSector)) {
            const fallback = availableSectors.includes('Other') ? 'Other' : (availableSectors[0] || 'Other');
            this.plugin.settings.defaultSector = fallback;
            await this.plugin.saveSettings();
        }

        new Setting(containerEl)
            .setName('Default Sector')
            .setDesc('Sector selected by default when adding new papers.')
            .addDropdown(drop => {
                drop.addOptions(Object.fromEntries(availableSectors.map(s => [s, s])));
                try { 
                    drop.setValue(this.plugin.settings.defaultSector); 
                } catch (e) { 
                    drop.setValue(availableSectors[0] || 'Other'); 
                }
                drop.onChange(async (value) => {
                    this.plugin.settings.defaultSector = value;
                    await this.plugin.saveSettings();
                });
            });

        this.createSectorManagement(containerEl, availableSectors);
    }

    createSectorManagement(containerEl, availableSectors) {
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

            if (isManaged && sector !== 'Other') {
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

        this.createNewSectorInput(containerEl);
    }

    createNewSectorInput(containerEl) {
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
                            await this.plugin.fileService.ensureFolderExists(`${this.plugin.settings.pdfDownloadFolder}/${value}`);
                            await this.plugin.saveSettings();
                            text.setValue('');
                            this.display();
                        }
                    }
                });
            });
    }
}

module.exports = RASettingTab;