const { Plugin, ItemView } = require('obsidian');

const VIEW_TYPE = 'daily-explorer';

class DailyExplorerView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return 'Daily Notes';
  }

  getIcon() {
    return 'calendar-range';
  }

  async onOpen() {
    this.render();
  }

  async onClose() {
    // noop
  }

  async render() {
    const container = this.contentEl;
    container.empty();

    const header = container.createEl("div", { cls: "paper-explorer-header" });
    // Added quick navigation buttons: open Master Index and open daily_index
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
    viewerBtn.title = 'Open Home daily_index';
    viewerBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const viewerPath = "/daily_notes/_index.md";
        let file = this.plugin.app.vault.getAbstractFileByPath(viewerPath);
        if (!file) {
            file = await this.plugin.app.vault.create(viewerPath, '# Viewer\n');
        }
        const leaf = this.plugin.app.workspace.getLeaf(false);
        await leaf.openFile(file);
    });
    header.appendChild(viewerBtn);
    const buttonContainer = header.createEl('div', { cls: 'button-container' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'center';
    const addButton = buttonContainer.createEl("button", { text: "+ Add Daily" });
    addButton.style.fontSize = '1em';
    addButton.style.padding = '10px 20px';
    addButton.style.borderRadius = '5px';
    addButton.style.border = 'none';
    addButton.style.cursor = 'pointer';
    addButton.style.marginBottom = '10px';
    addButton.addClass("mod-cta");
    addButton.addEventListener("click", async () => {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const basename = `${year}-${month}-${day}`;
      const folderPath = '_daily_notes';
      const filePath = `${folderPath}/${basename}.md`;

      // Ensure the folder exists before creating the file
      let folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        // create the folder then the file
        await this.plugin.app.vault.createFolder(folderPath);
      }

      let file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (!file) {
        file = await this.plugin.app.vault.create(filePath, '');
      }
      
      const leaf = this.plugin.app.workspace.getLeaf(true);
      await leaf.openFile(file);
      this.render();
    });
    header.createEl('hr')
    const layout = container.createEl('div', { cls: 'paper-explorer-layout' });
    const contentArea = layout.createEl('div', { cls: 'paper-explorer-content' });

    const files = this.plugin.app.vault.getMarkdownFiles();
    const dailyFiles = files
      .filter(f => /\d{4}-\d{2}-\d{2}/.test(f.basename))
      .sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (dailyFiles.length === 0) {
      contentArea.createEl("p", { text: "No daily notes found. Click '+ Add Daily Note' to start." });
      return;
    }

    const table = contentArea.createEl("table", { cls: "paper-index-table" });
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    headerRow.createEl("th", { text: "" });
    headerRow.createEl("th", { text: "" }); // For delete button
    // width 100% for first column, auto for second
    headerRow.children[0].style.width = '100%';
    headerRow.children[1].style.width = 'auto';

    const tbody = table.createEl("tbody");
    // if no daily files, show message
    if (dailyFiles.length === 0) {
        tbody.createEl("tr").createEl("td", { text: "No daily notes found." });
    }
    for (const file of dailyFiles) {
        const row = tbody.createEl("tr");

        const titleCell = row.createEl("td");
        titleCell.setText(file.basename);
        titleCell.addClass('paper-title-cell');
        titleCell.addEventListener('click', () => {
            this.app.workspace.openLinkText(file.path, '', false);
        });

        const deleteCell = row.createEl('td');
        const deleteBtn = deleteCell.createEl('button', { text: '×' });
        deleteBtn.addClass('paper-delete-btn');
        deleteBtn.title = 'Delete daily note';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.background = 'transparent';
        deleteBtn.style.border = 'none';
        deleteBtn.style.color = '#c94b4b';
        deleteBtn.style.fontSize = '1.1em';
        deleteBtn.style.padding = '4px 8px';
        deleteBtn.style.boxShadow = 'none';
        deleteBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            if (confirm(`Are you sure you want to delete ${file.basename}?`)) {
                await this.plugin.app.vault.delete(file);
                this.render();
            }
        });
    }
  }
}

module.exports = class DailyExplorerPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new DailyExplorerView(leaf, this));

    this.addCommand({
      id: 'open-daily-explorer',
      name: 'Open Daily Notes Explorer',
      callback: () => this.activateView()
    });

    this.addRibbonIcon('calendar-range', 'Daily Notes Explorer', async () => {
      // Reveal the left Daily Explorer view so the user can view/remove daily notes
      await this.activateView();

      // Then open daily_index from the vault when the ribbon icon is clicked.
      const viewerPath = '_daily_index';
      let file = this.app.vault.getAbstractFileByPath(viewerPath);
      if (!file) {
        // create an empty daily_index if it doesn't exist
        file = await this.app.vault.create(viewerPath, '![[2025-09-13]]\n');
      }

      // Open it in a new leaf (right/active) so the left view remains visible
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async activateView() {
    // If a leaf of our view type already exists, reveal it instead of creating a duplicate
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (leaves && leaves.length > 0) {
      // reveal first existing
      this.app.workspace.revealLeaf(leaves[0]);
      return;
    }

    const left = this.app.workspace.getLeftLeaf(false);
    await left.setViewState({ type: VIEW_TYPE });
    this.app.workspace.revealLeaf(left);
  }
};
