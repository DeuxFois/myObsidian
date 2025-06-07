paper-indexer — Technical documentation

Overview
--------
paper-indexer is an Obsidian plugin that helps manage research papers and notes. It downloads PDFs, extracts metadata and text, generates summaries/tags using a configurable LLM API, and exposes a UI for browsing, adding, chatting about, and managing papers.

Structure
---------
- plugin.js — plugin entry point; initializes services, registers commands/views/settings and orchestrates rebuilds.
- main.js — built artifact (do not edit).
- package.json — plugin manifest and metadata.
- _research-papers/ — default folder for downloaded PDFs and notes (user content).
- services/ — core logic for file, metadata, pdf extraction, LLM, and paper indexing.
- ui/ — UI components: views, modals, settings.
- utils/ — utility helpers (formatters, sanitizers).
- docs/ — documentation (this file).

Services
--------
file-service.js
- Purpose: path resolution, ensuring folders, downloading PDFs, creating/deleting notes, mapping logical->effective paths, moving/hiding folders.
- Important methods: getEffectiveFolderPath, ensureFolderExists, downloadPdf, createPaperNote, deletePaper, toggleFolderVisibility.

metadata-service.js
- Purpose: extract metadata from arXiv or direct PDFs and normalize into a metadata object.
- Important methods: extractArxivId, isDirectPdfUrl, fetchArxivMetadata, getMetadataFromUrl.

pdf-service.js
- Purpose: load Obsidian PDF.js and extract text from PDF files used as LLM context.
- Important methods: initializePdfJs, extractTextFromPdf.

llm-service.js
- Purpose: abstract LLM calls (configurable endpoint, model, key) to produce summaries and tags.
- Important methods: callLLM, callLLMWithPrompt, getSummary, getTags.

paper-service.js
- Purpose: scanning and building the paper index, master index note generation and bulk operations (generate summaries/tags).
- Important methods: buildPaperIndex, getAvailableSectors, updateMasterIndex, processAllPapers, generateResumeForPapers.

UI
--
paper-explorer-view.js
- ItemView that shows sectors, add/delete actions and a paper list. Data comes from paper-service.

paper-modal.js
- Modal to add a paper by URL; validates, fetches metadata, downloads PDF, creates note and refreshes index.

chat-panel-view.js
- Chat UI for interacting with the current note/PDF; calls llm-service and pdf-service; stores conversation history and supports export.

settings-tab.js
- Settings UI (PluginSettingTab) for PDF folder, hide toggle, LLM API config, sectors management, and default sector.

Utils
-----
formatters.js
- Filename sanitization, display formatting, small helpers used across services and UI.

Data shapes & contracts
----------------------
Settings (plugin.settings)
- pdfDownloadFolder: string
- hideFolderFromFiles: boolean
- summaryApiEndpoint: string
- summaryApiModel: string
- summaryApiKey: string
- sectors: string[]
- defaultSector: string

Metadata object (metadata-service)
- { title, authors: string[], year?, source?, doi?, arxivId?, url }

Paper record (internal index)
- { id, title, authors, sector, notePath, pdfPath?, tags?, summary?, createdAt? }

LLM responses
- Strings for summaries; sometimes structured JSON for tags (llm-service normalizes outputs where possible).

How to run & validate
---------------------
- Install into an Obsidian vault under `.obsidian/plugins/paper-indexer`.
- Enable in Community Plugins.
- Configure settings in Obsidian plugin settings.
- Add a paper via Paper Explorer modal and confirm files/notes are created under `pdfDownloadFolder`.
- Use Chat Panel to request a summary (requires API settings).

Testing
-------
- No unit tests included. Recommended tests:
  - metadata parsing (arXiv id extraction)
  - filename sanitization
  - file-service path resolution

Maintenance notes
-----------------
- Do not edit `main.js` (built).
- LLM calls rely on external network and API keys; errors must be surfaced to users via Notice.
- PDF extraction depends on Obsidian's PDF.js; pdf-service throws clear errors when unavailable.

Suggested improvements
----------------------
- Add unit tests for metadata parsing and formatters.
- Add a README with install and config examples.
- Add a smoke-test script for indexing a fixtures folder.

