import { Plugin } from 'obsidian';
import DailyExplorerView from './sidebar/DailyExplorerView';
import { registerCommands } from './commands/registerCommands';

export default class DailyExplorerPlugin extends Plugin {
    private dailyExplorerView: DailyExplorerView;

    async onload() {
        this.dailyExplorerView = new DailyExplorerView(this.app);
        this.addRibbonIcon('dice', 'Open Daily Notes Explorer', () => {
            this.dailyExplorerView.open();
        });
        registerCommands(this);
    }

    onunload() {
        this.dailyExplorerView.close();
    }
}