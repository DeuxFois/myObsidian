const { ItemView, TFile } = require('obsidian');

const PAPER_EXPLORER_VIEW_TYPE = "paper-explorer-view";

class PaperExplorerView extends ItemView {
    constructor(leaf, settings, plugin) {
        super(leaf);
        this.settings = settings;
        this.plugin = plugin;
    }

    getViewType() { 
        return PAPER_EXPLORER_VIEW_TYPE; 
    }
    
    getDisplayText() { 
        return "Research Papers"; 
    }
    
    getIcon() { 
        return "library"; 
    }

    async onOpen() {
        try {
            if (!this.plugin || !this.plugin.paperService.paperIndex || this.plugin.paperService.paperIndex.size === 0) {
                await this.plugin.rebuildAndRefresh();
            }
        } catch (e) {
            // ignore
        }
        this.renderView();
    }

    async renderView() {
        const container = this.contentEl || this.containerEl.children[1];
        container.empty();

        const header = container.createEl("div", { cls: "paper-explorer-header" });
        this.createHomeViewerButton(header);
        this.createAddPaperButton(header);

        const layout = container.createEl('div', { cls: 'paper-explorer-layout' });
        const sidebar = layout.createEl('div', { cls: 'paper-explorer-sidebar' });
        const contentArea = layout.createEl('div', { cls: 'paper-explorer-content' });
        
        await this.createSectorSelector(sidebar);
        await this.renderPaperTable(contentArea);
    }

    createHomeViewerButton(header) {
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
    }

    createAddPaperButton(header) {
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
            this.plugin.openAddPaperModal();
        });
    }

    async createSectorSelector(sidebar) {
        const sectors = await this.plugin.paperService.getAvailableSectors();
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
        try { 
            select.value = this.plugin._activeSector || 'All'; 
        } catch (e) { 
            select.value = 'All'; 
        }

        select.addEventListener('change', (ev) => {
            const val = ev.target.value;
            this.plugin._activeSector = val === 'All' ? 'All' : val;
            this.renderView();
        });
    }

    async renderPaperTable(contentArea) {
        const allPapers = Array.from(this.plugin.paperService.paperIndex.values());
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
            
            this.createDeleteButton(row, paper);
        }
    }

    createDeleteButton(row, paper) {
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

    async onClose() {}
}

module.exports = { PaperExplorerView, PAPER_EXPLORER_VIEW_TYPE };