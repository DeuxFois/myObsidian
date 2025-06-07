This folder contains UI helper modules extracted from the main chat panel.

Files:
- `chat-utils.js` - small helper utilities (message normalization, id generation).
- `confirm-modal.js` - small modal wrapper used for confirmations.
- `message-renderer.js` - renders individual messages into the chat container.

Running tests locally (plugin directory):

```bash
cd .obsidian/plugins/paper-indexer
npm install
npm test
```

Note: Tests use Jest and are for quick developer validation. They do not run inside Obsidian.
