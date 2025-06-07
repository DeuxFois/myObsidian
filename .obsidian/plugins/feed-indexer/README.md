# Feed Indexer

This is a simple Obsidian plugin that lets you add a feed (article URL), fetch the page, ask a local WebLLM (if available) for a CSS/XPath selector to extract the article content, and save the extracted content to plugin storage.

Features:
- Ribbon button (RSS) and command `Add Feed`
- Fetch with CORS proxy fallback
- Heuristic and LLM-based selector detection
- Manual selector input fallback
- Console logging under `[feed-indexer]` prefix for debugging

Notes:
- The plugin code is intentionally kept in a single `main.js` file per request.
- WebLLM usage is best-effort: loading models locally requires model artifacts and significant resources. The plugin falls back to heuristics and manual input when WebLLM is not available.

To enable the plugin in Obsidian: place the `feed-indexer` folder under `.obsidian/plugins/` and enable it in Settings → Community Plugins.
