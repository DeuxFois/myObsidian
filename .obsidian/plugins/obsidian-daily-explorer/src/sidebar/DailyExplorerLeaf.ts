import { ItemView, WorkspaceLeaf } from 'obsidian';
import DeleteButton from '../ui/DeleteButton';
import { DailyNote } from '../types';

export const DAILY_EXPLORER_VIEW_TYPE = 'daily-explorer-view';

export class DailyExplorerLeaf extends ItemView {
    private dailyNote: DailyNote;

    constructor(leaf: WorkspaceLeaf, dailyNote: DailyNote) {
        super(leaf);
        this.dailyNote = dailyNote;
    }

    getDisplayText(): string {
        return this.dailyNote.title;
    }

    getIcon(): string {
        return 'calendar'; // Icon for daily notes
    }

    onOpen(): void {
        this.render();
    }

    onClose(): void {
        this.containerEl.empty();
    }

    private render(): void {
        const container = this.containerEl.createDiv('daily-explorer-leaf');
        container.createEl('h2', { text: this.dailyNote.title });

        const content = container.createDiv('daily-note-content');
        content.setText(this.dailyNote.content);

        const deleteButton = new DeleteButton(this.dailyNote.id);
        container.appendChild(deleteButton.render());
    }
}