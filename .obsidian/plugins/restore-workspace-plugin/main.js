const { Plugin, Notice, Setting, PluginSettingTab } = require('obsidian');

// Default settings
const DEFAULT_SETTINGS = {
	autoRestoreOnStartup: true,
	showSuccessNotifications: true,
	createBackupBeforeRestore: false
};

module.exports = class RestoreWorkspacePlugin extends Plugin {
	
	async onload() {
		console.log('Loading Restore Workspace Plugin');
		
		// Load settings
		await this.loadSettings();
		
		// Add settings tab
		this.addSettingTab(new RestoreWorkspaceSettingTab(this.app, this));
		
		// Add command to restore workspace
		this.addCommand({
			id: 'restore-workspace',
			name: 'Restore Workspace',
			callback: () => {
				this.restoreWorkspace();
			}
		});
		
		// Add command to toggle auto-restore
		this.addCommand({
			id: 'toggle-auto-restore',
			name: 'Toggle Auto-Restore on Startup',
			callback: () => {
				this.settings.autoRestoreOnStartup = !this.settings.autoRestoreOnStartup;
				this.saveSettings();
				new Notice(`Auto-restore on startup: ${this.settings.autoRestoreOnStartup ? 'Enabled' : 'Disabled'}`, 3000);
			}
		});
		
		// Auto-restore on startup if enabled
		if (this.settings.autoRestoreOnStartup) {
			// Wait a bit for Obsidian to fully load
			setTimeout(() => {
				this.restoreWorkspace(true); // true indicates this is an auto-restore
			}, 2000);
		}
	}

	onunload() {
		console.log('Unloading Restore Workspace Plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async restoreWorkspace(isAutoRestore = false) {
		try {
			const fs = require('fs');
			const path = require('path');
			
			// Get the vault path
			const vaultPath = this.app.vault.adapter.basePath;
			const obsidianPath = path.join(vaultPath, '.obsidian');
			const workspacePath = path.join(obsidianPath, 'workspace.json');
			const backupPath = path.join(obsidianPath, 'workspace.json.bak');
			
			// Check if backup file exists
			if (!fs.existsSync(backupPath)) {
				const message = '❌ Backup file workspace.json.bak not found!';
				if (!isAutoRestore) new Notice(message, 5000);
				console.log(message);
				return;
			}
			
			// Read backup file
			let backupContent;
			try {
				backupContent = fs.readFileSync(backupPath, 'utf8');
				// Validate JSON
				JSON.parse(backupContent);
			} catch (error) {
				const message = '❌ Backup file is corrupted or invalid JSON!';
				if (!isAutoRestore) new Notice(message, 5000);
				console.error('Backup file error:', error);
				return;
			}
			
			// Read current workspace file
			let currentContent = '';
			if (fs.existsSync(workspacePath)) {
				try {
					currentContent = fs.readFileSync(workspacePath, 'utf8');
				} catch (error) {
					console.error('Error reading current workspace:', error);
				}
			}
			
			// Compare the files
			if (currentContent === backupContent) {
				const message = '✅ Workspace is already up to date!';
				if (!isAutoRestore && this.settings.showSuccessNotifications) {
					new Notice(message, 3000);
				}
				console.log('Workspace check:', message);
				return;
			}
			
			// Create backup of current workspace before restoring (if enabled)
			if (this.settings.createBackupBeforeRestore && currentContent && currentContent.trim() !== '') {
				const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
				const currentBackupPath = path.join(obsidianPath, `workspace.json.backup-${timestamp}`);
				
				try {
					fs.writeFileSync(currentBackupPath, currentContent);
					console.log('Current workspace backed up to:', currentBackupPath);
				} catch (error) {
					console.error('Failed to backup current workspace:', error);
				}
			}
			
			// Restore from backup
			try {
				fs.writeFileSync(workspacePath, backupContent);
				const message = isAutoRestore ? 
					'🔄 Workspace auto-restored on startup!' : 
					'✅ Workspace restored successfully! Reloading...';
				
				if (this.settings.showSuccessNotifications) {
					new Notice(message, 3000);
				}
				console.log('Workspace restored:', message);
				
				// Reload the workspace
				setTimeout(() => {
					this.app.workspace.onLayoutReady(() => {
						// Force reload the workspace layout
						this.app.workspace.changeLayout(JSON.parse(backupContent));
					});
				}, 1000);
				
			} catch (error) {
				const message = '❌ Failed to restore workspace!';
				if (!isAutoRestore) new Notice(message, 5000);
				console.error('Restore error:', error);
			}
			
		} catch (error) {
			const message = '❌ An error occurred while restoring workspace!';
			if (!isAutoRestore) new Notice(message, 5000);
			console.error('Plugin error:', error);
		}
	}
};

// Settings tab
class RestoreWorkspaceSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		
		containerEl.createEl('h2', { text: 'Restore Workspace Settings' });
		
		new Setting(containerEl)
			.setName('Auto-restore on startup')
			.setDesc('Automatically restore workspace from backup when Obsidian starts')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoRestoreOnStartup)
				.onChange(async (value) => {
					this.plugin.settings.autoRestoreOnStartup = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('Show success notifications')
			.setDesc('Display notifications when workspace is successfully restored or already up to date')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showSuccessNotifications)
				.onChange(async (value) => {
					this.plugin.settings.showSuccessNotifications = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('Create backup before restore')
			.setDesc('Create a timestamped backup of the current workspace before restoring from backup')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.createBackupBeforeRestore)
				.onChange(async (value) => {
					this.plugin.settings.createBackupBeforeRestore = value;
					await this.plugin.saveSettings();
				}));
		
		// Add manual buttons
		containerEl.createEl('h3', { text: 'Manual Actions' });
		
		new Setting(containerEl)
			.setName('Restore workspace now')
			.setDesc('Manually trigger workspace restoration')
			.addButton(button => button
				.setButtonText('Restore Now')
				.setCta()
				.onClick(() => {
					this.plugin.restoreWorkspace();
				}));
		
		new Setting(containerEl)
			.setName('Update backup file')
			.setDesc('Save current workspace as the backup file')
			.addButton(button => button
				.setButtonText('Update Backup')
				.onClick(async () => {
					try {
						const fs = require('fs');
						const path = require('path');
						
						const vaultPath = this.app.vault.adapter.basePath;
						const obsidianPath = path.join(vaultPath, '.obsidian');
						const workspacePath = path.join(obsidianPath, 'workspace.json');
						const backupPath = path.join(obsidianPath, 'workspace.json.bak');
						
						if (fs.existsSync(workspacePath)) {
							const workspaceContent = fs.readFileSync(workspacePath, 'utf8');
							fs.writeFileSync(backupPath, workspaceContent);
							new Notice('✅ Backup file updated with current workspace!', 3000);
						} else {
							new Notice('❌ No workspace.json file found!', 3000);
						}
					} catch (error) {
						new Notice('❌ Failed to update backup file!', 3000);
						console.error('Update backup error:', error);
					}
				}));
	}
}