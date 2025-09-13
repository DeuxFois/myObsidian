import { Plugin } from 'obsidian';
import { DeleteButton } from '../ui/DeleteButton';

export function registerCommands(plugin: Plugin) {
    // Command to delete a daily note
    plugin.addCommand({
        id: 'delete-daily-note',
        name: 'Delete Daily Note',
        callback: () => {
            const deleteButton = new DeleteButton();
            deleteButton.onClick();
        }
    });
}