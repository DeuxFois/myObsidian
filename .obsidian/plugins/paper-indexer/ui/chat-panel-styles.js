// Export the CSS used by the chat panel view so styles can be managed separately.
const chatPanelStyles = `
            .chat-panel-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                padding: 10px;
            }

            .chat-panel-header {
                margin-bottom: 10px;
                border-bottom: 1px solid var(--background-modifier-border);
                padding-bottom: 10px;
            }

            .chat-title-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }

            .chat-panel-title {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
            }

            .discussion-controls {
                display: flex;
                gap: 6px;
                align-items: center;
            }

            .discussion-button {
                padding: 4px 8px;
                font-size: 11px;
                border-radius: 4px;
                border: 1px solid var(--background-modifier-border);
                cursor: pointer;
                background: var(--background-secondary);
                color: var(--text-normal);
                transition: all 0.2s ease;
                -webkit-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }

            .discussion-button:hover {
                background: var(--interactive-hover);
                transform: translateY(-1px);
            }

            .new-discussion-button {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border-color: var(--interactive-accent);
            }

            .history-button:hover,
            .global-history-button:hover {
                background: var(--text-accent);
                color: var(--text-on-accent);
            }

            .chat-note-info {
                font-size: 12px;
                color: var(--text-muted);
            }

            .chat-current-note .note-name {
                font-weight: 500;
                color: var(--text-normal);
            }

            .chat-current-note .note-status {
                margin-top: 2px;
            }

            .chat-no-note {
                text-align: center;
                padding: 10px;
                background: var(--background-secondary);
                border-radius: 4px;
            }

            .no-note-message {
                font-weight: 500;
                margin-bottom: 4px;
            }

            .no-note-help {
                font-size: 11px;
                opacity: 0.7;
            }

            .chat-messages-area {
                flex: 1;
                overflow-y: auto;
                margin-bottom: 10px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                padding: 10px;
                min-height: 200px;
            }

            /* Ensure text selection is enabled inside the chat messages */
            .chat-messages-area,
            .chat-message,
            .chat-message-header,
            .chat-message-content,
            .chat-message-content * {
                -webkit-user-select: text;
                -ms-user-select: text;
                user-select: text;
            }

            .chat-message {
                margin-bottom: 15px;
                padding: 8px;
                border-radius: 6px;
                position: relative;
                transition: all 0.2s ease;
            }

            .chat-message:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }

            .chat-message.typing {
                animation: typing-pulse 1.5s infinite;
            }

            @keyframes typing-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }

            .chat-message-user {
                background: var(--background-secondary);
                margin-left: 20px;
                border-left: 3px solid var(--interactive-accent);
            }

            .chat-message-assistant {
                background: var(--background-primary-alt);
                margin-right: 20px;
                border-left: 3px solid var(--text-accent);
            }

            .chat-message-system {
                background: var(--background-modifier-error);
                text-align: center;
                font-style: italic;
                margin: 10px;
            }

            .chat-message-header {
                display: flex;
                justify-content: space-between;
                margin-bottom: 5px;
                font-size: 11px;
                opacity: 0.7;
            }

            .chat-message-role {
                font-weight: 500;
            }

            .chat-message-content {
                white-space: pre-wrap;
                line-height: 1.4;
                margin-bottom: 5px;
            }

            .chat-message-content code {
                background: var(--code-background);
                padding: 2px 4px;
                border-radius: 3px;
                font-family: var(--font-monospace);
                font-size: 0.9em;
            }

            .chat-message-content strong {
                font-weight: 600;
                color: var(--text-normal);
            }

            .chat-message-content em {
                font-style: italic;
                color: var(--text-muted);
            }

            .chat-message-actions {
                display: flex;
                gap: 4px;
                margin-top: 5px;
                opacity: 0;
                transition: opacity 0.2s ease;
            }

            .chat-message:hover .chat-message-actions {
                opacity: 1;
            }

            .chat-action-button {
                background: none;
                border: none;
                cursor: pointer;
                padding: 2px 4px;
                border-radius: 3px;
                font-size: 12px;
                opacity: 0.7;
                transition: all 0.2s ease;
                /* Prevent selecting the button label when dragging text across */
                -webkit-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }

            .chat-action-button:hover {
                opacity: 1;
                background: var(--background-modifier-hover);
            }

            .chat-delete-button:hover {
                background: var(--background-modifier-error);
                color: var(--text-on-accent);
            }

            .chat-input-area {
                border-top: 1px solid var(--background-modifier-border);
                padding-top: 10px;
            }

            .chat-input-container {
                display: flex;
                gap: 8px;
                margin-bottom: 8px;
                align-items: flex-end;
            }

            .chat-message-input {
                flex: 1;
                resize: none;
                min-height: 60px;
                max-height: 200px;
                padding: 8px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background: var(--background-primary);
                color: var(--text-normal);
                font-family: inherit;
                line-height: 1.4;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }

            .chat-message-input:focus {
                outline: none;
                border-color: var(--interactive-accent);
                box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
            }

            .chat-send-button {
                padding: 8px 16px;
                background: var(--interactive-accent);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
                -webkit-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }

            .chat-send-button:hover {
                background: var(--interactive-accent-hover);
            }

            .chat-clear-button {
                padding: 4px 8px;
                background: var(--background-secondary);
                color: var(--text-muted);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                transition: all 0.2s ease;
                -webkit-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }

            .chat-send-controls { display:flex; flex-direction:column; gap:8px; align-items:flex-end; margin-left:8px; }
            .chat-send-controls .chat-send-button { padding: 8px 16px; }
            .chat-send-controls .chat-clear-button { padding: 4px 8px; }

            .chat-clear-button:hover { background: var(--interactive-hover); transform: translateY(-1px); }

            /* PDF toggle button styles */
            .pdf-toggle-button {
                padding: 2px 6px;
                font-size: 11px;
                border-radius: 4px;
                border: 1px solid var(--background-modifier-border);
                cursor: pointer;
                background: var(--background-secondary);
                color: var(--text-normal);
                -webkit-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }
            .pdf-toggle-button.on {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border-color: var(--interactive-accent);
            }
            .pdf-toggle-button.off {
                background: var(--background-secondary);
                color: var(--text-muted);
            }
            /* Note toggle button styles (matches PDF toggle) */
            .note-toggle-button {
                padding: 2px 6px;
                font-size: 11px;
                border-radius: 4px;
                border: 1px solid var(--background-modifier-border);
                cursor: pointer;
                background: var(--background-secondary);
                color: var(--text-normal);
                -webkit-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }
            .note-toggle-button.on {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border-color: var(--interactive-accent);
            }
            .note-toggle-button.off {
                background: var(--background-secondary);
                color: var(--text-muted);
            }

            /* Discussion History Panel Styles */
            .discussion-history-panel,
            .global-history-panel {
                background: var(--background-primary-alt);
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                margin-bottom: 10px;
                max-height: 300px;
                overflow-y: auto;
            }

            .history-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                border-bottom: 1px solid var(--background-modifier-border);
                background: var(--background-secondary);
                border-radius: 6px 6px 0 0;
            }

            .history-panel-header h4 {
                margin: 0;
                font-size: 14px;
                font-weight: 600;
                color: var(--text-normal);
            }

            .history-close-button {
                background: none;
                border: none;
                cursor: pointer;
                padding: 2px 6px;
                border-radius: 3px;
                color: var(--text-muted);
                font-size: 16px;
                line-height: 1;
                -webkit-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }

            .history-close-button:hover {
                background: var(--background-modifier-hover);
                color: var(--text-normal);
            }

            .history-panel-content {
                padding: 8px;
                max-height: 250px;
                overflow-y: auto;
            }

            .history-empty {
                text-align: center;
                color: var(--text-muted);
                font-style: italic;
                padding: 20px;
            }

            .discussion-item {
                padding: 8px;
                margin-bottom: 6px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background: var(--background-primary);
                transition: all 0.2s ease;
            }

            .discussion-item:hover {
                background: var(--background-modifier-hover);
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }

            .discussion-item.current-discussion {
                border-color: var(--interactive-accent);
                background: var(--background-modifier-success);
            }

            .discussion-item-header {
                margin-bottom: 4px;
            }

            .discussion-title {
                font-weight: 500;
                color: var(--text-normal);
                font-size: 13px;
                margin-bottom: 2px;
                line-height: 1.2;
            }

            .discussion-note-info {
                font-size: 11px;
                color: var(--text-muted);
                margin-bottom: 2px;
            }

            .discussion-meta {
                font-size: 11px;
                color: var(--text-muted);
            }

            .discussion-actions {
                display: flex;
                gap: 4px;
                margin-top: 6px;
            }

            .discussion-action-button {
                padding: 2px 6px;
                font-size: 10px;
                border-radius: 3px;
                border: 1px solid var(--background-modifier-border);
                cursor: pointer;
                background: var(--background-secondary);
                color: var(--text-normal);
                transition: all 0.2s ease;
                -webkit-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }

            .discussion-action-button:hover {
                background: var(--interactive-hover);
                transform: translateY(-1px);
            }

            .discussion-action-button.delete-button {
                background: var(--background-modifier-error);
                color: var(--text-on-accent);
                border-color: var(--background-modifier-error);
            }

            .discussion-action-button.delete-button:hover {
                background: var(--background-modifier-error-hover);
            }

            .global-discussion-item {
                border-left: 3px solid var(--text-accent);
            }

            .chat-message-wrapper { font-family: var(--font-family); }
            .chat-message-wrapper { margin: 8px 12px; padding: 8px; border-radius: 6px; }
            .user-message { background: rgba(50,120,255,0.06); border-left: 3px solid rgba(50,120,255,0.9); }
            .assistant-message { background: rgba(255,255,255,0.02); border-left: 3px solid rgba(100,100,100,0.15); }
            .system-message { background: rgba(180,20,20,0.06); border-left: 3px solid rgba(180,20,20,0.9); }
            .chat-message-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:12px; color:var(--text-muted); }
            .chat-message-role { font-weight:600; }
            .chat-message-content .message-text { white-space:pre-wrap; }

            /* Collapsible long message styles */
            .collapsed-message { background: rgba(0,0,0,0.03); padding:8px; border-radius:4px; }
            .collapsed-message .collapsed-text { color: var(--text-muted); }
            .collapsed-message .full-text { white-space:pre-wrap; margin-top:6px; }
            .collapse-toggle { margin-top:6px; background:transparent; border:0; color:var(--text-link); cursor:pointer; padding:2px  4px; }

            /* Typing placeholder */
            .typing { opacity: 0.8; font-style: italic; }
        `;

module.exports = chatPanelStyles;
