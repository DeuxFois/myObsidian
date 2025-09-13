import { ButtonComponent } from 'obsidian';
import { DailyExplorerView } from '../sidebar/DailyExplorerView';

export class DeleteButton {
    private button: ButtonComponent;
    private view: DailyExplorerView;

    constructor(view: DailyExplorerView) {
        this.view = view;
        this.createButton();
    }

    private createButton() {
        this.button = new ButtonComponent(this.view.containerEl);
        this.button.setButtonText('Delete Daily Note')
            .setCta()
            .onClick(() => this.handleDelete());
    }

    private handleDelete() {
        const noteToDelete = this.view.getSelectedNote(); // Assuming this method exists
        if (noteToDelete) {
            this.view.deleteNote(noteToDelete); // Assuming this method exists
            this.view.refresh(); // Refresh the view after deletion
        }
    }
}