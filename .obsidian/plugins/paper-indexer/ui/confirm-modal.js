const { Modal } = require('obsidian');

class ConfirmModal extends Modal {
    constructor(app, message, onConfirm) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('p', { text: this.message });
        const controls = contentEl.createEl('div', { cls: 'modal-buttons' });
        const confirmBtn = controls.createEl('button', { text: 'Confirm' });
        const cancelBtn = controls.createEl('button', { text: 'Cancel' });
        confirmBtn.addEventListener('click', () => {
            try {
                if (typeof this.onConfirm === 'function') this.onConfirm();
            } finally {
                this.close();
            }
        });
        cancelBtn.addEventListener('click', () => this.close());
    }
    onClose() {}
}

module.exports = { ConfirmModal };
