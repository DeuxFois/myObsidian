import { ItemView, WorkspaceLeaf } from 'obsidian';
import { DeleteButton } from '../ui/DeleteButton';
import { DailyNote } from '../types';
import { getDailyNotes } from '../utils/dateUtils';

export class DailyExplorerView extends ItemView {
    static readonly VIEW_TYPE = 'daily-explorer';
    private dailyNotes: DailyNote[] = [];

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.dailyNotes = getDailyNotes();
    }

    getDisplayText(): string {
        return 'Daily Notes Explorer';
    }

    getIcon(): string {
        return 'calendar';
    }

    onOpen(): void {
        this.render();
    }

    onClose(): void {
        this.containerEl.empty();
    }

    private render(): void {
        this.containerEl.empty();
        const notesList = this.containerEl.createEl('ul');

        this.dailyNotes.forEach(note => {
            const noteItem = notesList.createEl('li');
            noteItem.setText(note.title);

            const deleteButton = new DeleteButton(note.id);
            deleteButton.onClick(() => this.deleteNote(note.id));
            noteItem.appendChild(deleteButton.render());
        });
    }

    private deleteNote(noteId: string): void {
        // Logic to delete the note
        this.dailyNotes = this.dailyNotes.filter(note => note.id !== noteId);
        this.render();
    }
}