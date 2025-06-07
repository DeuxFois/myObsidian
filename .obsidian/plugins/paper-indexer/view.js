const { ItemView, WorkspaceLeaf } = require("obsidian");

// Define a unique identifier for our new view
const PAPER_EXPLORER_VIEW_TYPE = "paper-explorer-view";

class PaperExplorerView extends ItemView {
    constructor(leaf, settings) {
        super(leaf);
        this.settings = settings;
    }

    // Returns the unique view type identifier
    getViewType() {
        return PAPER_EXPLORER_VIEW_TYPE;
    }

    // Returns the display name of the view
    getDisplayText() {
        return "Research Papers";
    }

    // Returns the icon for the view (using a built-in Obsidian icon)
    getIcon() {
        return "library"; // You can find other icon names at https://lucide.dev/
    }

    // This method is called when the view is opened or revealed
    async onOpen() {
        const container = this.containerEl.children[1]; // The main content container
        container.empty();
        container.createEl("h2", { text: "My Papers" });

        // Get the list of PDF files from the vault
        const pdfFolder = this.settings.pdfDownloadFolder;
        // Support hidden folder (dot-prefixed) if present
        const hiddenPdfFolder = pdfFolder.startsWith('.') ? pdfFolder : `.${pdfFolder}`;
        const files = this.app.vault.getFiles();
        const paperPdfs = files.filter(file => 
            (file.path.startsWith(pdfFolder) || file.path.startsWith(hiddenPdfFolder)) && file.extension.toLowerCase() === 'pdf'
        );

        if (paperPdfs.length === 0) {
            container.createEl("p", { text: "No papers found in your download folder." });
            return;
        }

        // Create a list to display the papers
        const list = container.createEl("ul");
        list.addClass("paper-list");

        for (const paper of paperPdfs) {
            const listItem = list.createEl("li");
            listItem.addClass("paper-list-item");
            listItem.setText(paper.basename); // Display the filename without extension

            // Make the list item clickable to open the PDF
            listItem.addEventListener("click", () => {
                this.app.workspace.openLinkText(paper.path, '', false);
            });
        }
    }

    // This method is called when the view is closed
    async onClose() {
        // Cleanup tasks if needed
    }
}

module.exports = { PaperExplorerView, PAPER_EXPLORER_VIEW_TYPE };