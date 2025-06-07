const { Plugin, Notice, Setting, PluginSettingTab, Modal, ItemView, TFile, requestUrl, setIcon } = require('obsidian');

const FEED_EXPLORER_VIEW_TYPE = 'feed-explorer-view';

const DEFAULT_SETTINGS = {
  preferredModelId: '',
  availableModels: [],
  selectorPromptChars: 3000,
  linksPromptChars: 16000,
  linksRetryChars: 4000,
  maxImportItems: 100,
  createIndividualNotes: true,
  generateLlmIndex: true,
  llmProvider: 'webllm', // 'webllm' or 'transformers'
};

let FEED_DEBUG = false;
function dlog(...args) { if (FEED_DEBUG) console.log(...args); }

// #region Utility Functions

/** Quotes a string for YAML frontmatter, handling special characters. */
function yamlQuote(v) {
  if (v === null || v === undefined) return "''";
  const s = String(v);
  // If the string is simple, return as is.
  if (/^[a-zA-Z0-9_:\/\.-]+$/.test(s) && s.length < 120) return s;
  // Otherwise, wrap in double quotes and escape internal quotes.
  return '"' + s.replace(/"/g, '\\"') + '"';
}

/** Generates a unique file path by appending a counter if the file already exists. */
async function getUniqueFilePath(vault, folder, baseName, extension) {
  let filePath = `${folder}/${baseName}.${extension}`;
  let i = 1;
  while (await vault.adapter.exists(filePath)) {
    filePath = `${folder}/${baseName}-${i++}.${extension}`;
  }
  return filePath;
}

// #endregion

module.exports = class FeedIndexerPlugin extends Plugin {
  async onload() {
    const raw = await this.loadData();
    if (!raw) {
      this.feeds = [];
      this.settings = { ...DEFAULT_SETTINGS };
    } else if (Array.isArray(raw)) { // Legacy format
      this.feeds = raw;
      this.settings = { ...DEFAULT_SETTINGS };
    } else {
      this.feeds = raw.feeds || [];
      this.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
    }

    this.availableModels = Array.isArray(this.settings.availableModels) ? this.settings.availableModels : [];
    FEED_DEBUG = !!this.settings?.debug;

    await this.ensureDefaultBookmarksFile();

    this.addRibbonIcon('rss', 'Open Feed Explorer', () => this.openFeedExplorer('left'));

    this.addCommand({ id: 'feed-indexer-open-explorer-left', name: 'Open Feed Explorer (Left)', callback: () => this.openFeedExplorer('left') });
    this.addCommand({ id: 'feed-indexer-open-explorer-right', name: 'Open Feed Explorer (Right)', callback: () => this.openFeedExplorer('right') });
    this.addCommand({ id: 'feed-indexer-import-file', name: 'Import JSON/CSV File', callback: () => this.openImportFileModal() });

    this.addSettingTab(new FeedIndexerSettingTab(this.app, this));
    this.registerView(FEED_EXPLORER_VIEW_TYPE, (leaf) => new FeedExplorerView(leaf, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(FEED_EXPLORER_VIEW_TYPE);
  }

  async saveFeeds() {
    await this.saveData({ feeds: this.feeds, settings: this.settings });
  }

  async openFeedExplorer(side = 'left') {
    const existing = this.app.workspace.getLeavesOfType(FEED_EXPLORER_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = side === 'right' ? this.app.workspace.getRightLeaf(true) : this.app.workspace.getLeftLeaf(true);
    await leaf.setViewState({ type: FEED_EXPLORER_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async deleteFeed(id) {
    this.feeds = this.feeds.filter(f => f.id !== id);
    await this.saveFeeds();
  }

  async saveFeedAsNote(entry) {
    try {
      if (entry && Array.isArray(entry.items)) {
        await this.saveFeedLinksAsNote(entry.url, entry.items, entry.created || new Date().toISOString());
        return;
      }
      const url = new URL(entry.url);
      const feedFolder = `_feeds/${url.hostname.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      if (!await this.app.vault.adapter.exists('_feeds')) await this.app.vault.createFolder('_feeds');
      if (!await this.app.vault.adapter.exists(feedFolder)) await this.app.vault.createFolder(feedFolder);
      
      const baseName = `${new Date(entry.created || Date.now()).toISOString().slice(0,10)}`.replace(/[^a-zA-Z0-9_-]/g, '-');
      const filePath = await getUniqueFilePath(this.app.vault, feedFolder, baseName, 'md');
      
      const md = `---\n` +
        `title: ${yamlQuote(url.hostname)}\n` +
        `source: ${yamlQuote(entry.url)}\n` +
        `selector: ${yamlQuote(entry.selector)}\n` +
        `created: ${yamlQuote(entry.created)}\n` +
        `---\n\n# ${url.hostname}\n\n${entry.extracted || ''}\n`;
        
      const tfile = await this.app.vault.create(filePath, md);
      if (tfile instanceof TFile) {
        this.app.workspace.getLeaf(false).openFile(tfile);
      }
      new Notice('Saved feed content to note');
    } catch (e) {
      new Notice('Failed to save note: ' + (e.message || String(e)));
    }
  }

  async saveFeedLinksAsNote(rootUrl, items, createdAt) {
    try {
      const folder = '_feed_captures';
      if (!await this.app.vault.adapter.exists(folder)) await this.app.vault.createFolder(folder);
      
      const url = new URL(rootUrl);
      const baseName = `${url.hostname}-${new Date(createdAt || Date.now()).toISOString().slice(0,10)}`.replace(/[^a-zA-Z0-9_-]/g, '-');
      const filePath = await getUniqueFilePath(this.app.vault, folder, baseName, 'md');

      const safeItems = Array.isArray(items) ? items : [];
      const sortedHeaders = safeItems[0]?._selected_keys?.filter(k => !k.startsWith('_')) || ['title'];
      
      const toDisplayString = (v) => {
        if (v === null || v === undefined) return '';
        if (Array.isArray(v)) return v.map(String).join(', ');
        if (typeof v === 'object') return JSON.stringify(v);
        const s = String(v);
        return s.length > 300 ? s.slice(0, 297) + '…' : s;
      };

      const headerRow = `| ${sortedHeaders.map(h => h.charAt(0).toUpperCase() + h.slice(1).replace(/_/g, ' ')).join(' | ')} |`;
      const separatorRow = `| ${sortedHeaders.map(() => '---').join(' | ')} |`;
      const rows = safeItems.map(item => {
        const cells = sortedHeaders.map(h => {
          const v = toDisplayString(item[h]);
          return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
        });
        return `| ${cells.join(' | ')} |`;
      }).join('\n');
      
      const mdTable = (safeItems.length && sortedHeaders.length) ? `${headerRow}\n${separatorRow}\n${rows}\n\n` : '_No items found_\n\n';
      
      const md = `---\n` +
        `title: ${yamlQuote(url.hostname + ' feed capture')}\n` +
        `source: ${yamlQuote(rootUrl)}\n` +
        `items_count: ${safeItems.length}\n` +
        `created: ${yamlQuote(createdAt || new Date().toISOString())}\n` +
        `---\n\n# Feed items from ${url.hostname}\n\n` + mdTable +
        `## Raw JSON\n\n` + '```json\n' + JSON.stringify(safeItems, null, 2) + '\n```\n';
        
      const tfile = await this.app.vault.create(filePath, md);
      if (tfile instanceof TFile) {
        this.app.workspace.getLeaf(false).openFile(tfile);
      }
      new Notice('Saved feed links to note');
      return filePath;
    } catch (e) {
      new Notice('Failed to save feed links note: ' + (e.message || String(e)));
      return null;
    }
  }

  async updateFeedIndexNote() {
    try {
      const path = `_feed_index.md`;
      const lines = ['# Feed Index', '', '| Source | Created |', '| --- | --- |'];
      const rows = (this.feeds || []).slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      
      for (const f of rows) {
        const created = f.created ? new Date(f.created).toISOString().replace('T', ' ').slice(0, 16) : '';
        const safeUrl = (f.url || '').replace(/\|/g, '%7C');
        lines.push(`| [link](${safeUrl}) | ${created} |`);
      }
      
      const content = lines.join('\n') + '\n';
      const file = this.app.vault.getAbstractFileByPath(path);
      
      if (file instanceof TFile) await this.app.vault.modify(file, content);
      else await this.app.vault.create(path, content);
      
      new Notice('Feed index updated');
    } catch (e) {
      new Notice('Failed to update feed index: ' + (e.message || String(e)));
    }
  }

  async ensureDefaultBookmarksFile() {
    try {
      const folder = '_feed_captures';
      const filePath = `${folder}/bookmarks_with_metadata.json`;
      if (!await this.app.vault.adapter.exists(folder)) await this.app.vault.createFolder(folder);
      if (!await this.app.vault.adapter.exists(filePath)) await this.app.vault.create(filePath, '[]');
    } catch (_) {}
  }

  async openImportFileModal() {
    new ImportFileModal(this.app, this).open();
  }

  // #region LLM Enhancement
  
  async generateLlmEnhancedIndex(items, importName) {
    try {
      const engine = await createLlmEngine(this);
      if (!engine) {
          throw new Error('LLM engine unavailable for index enhancement.');
      }
      
      console.log(`[feed-indexer] Enhancing index with LLM for ${items.length} items.`);
      
      const selectedKeys = await this.selectOptimalKeys(engine, items.slice(0, 5), importName);
      console.log('[feed-indexer] LLM selected keys for index table:', selectedKeys);
      
      const enhancedItems = [];
      const progressNotice = items.length > 5 ? new Notice(`Enhancing 0/${items.length} items with AI...`, 0) : null;
      
      for (let i = 0; i < items.length; i++) {
        progressNotice?.setMessage(`Enhancing ${i + 1}/${items.length} items with AI...`);
        const enhanced = await this.enhanceIndividualItem(engine, items[i], importName, i + 1, items.length);
        enhancedItems.push(enhanced);
        if (i < items.length - 1) await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      }
      
      progressNotice?.hide();
      enhancedItems.forEach(item => item._selected_keys = selectedKeys);
      return enhancedItems;
    } catch (e) {
      console.error('[feed-indexer] LLM index enhancement failed:', e);
      throw e;
    }
  }

  async selectOptimalKeys(engine, sampleItems, importName) {
    try {
        // Step 1: Gather candidate keys
        const candidates = Array.from(
        new Set([].concat(...(sampleItems || [])
            .filter(Boolean)
            .map(it => Object.keys(it || {}))))
        );

        // Narrow to max 10 for simplicity
        const limitedCandidates = candidates.slice(0, 10);

        // Step 2: Build a very simple prompt
        const userPrompt = `Return most relevant keys (1-3), for example: ["key1", "key2"].
data: ${JSON.stringify(limitedCandidates)}`.trim();

        const messages = [
        { role: "user", content: userPrompt }
        ];

        // Step 3: Call tiny LLM with low max tokens
        const content = await callLlm(engine, messages, 30, this.settings.llmProvider);

        // Step 4: Robustly extract array (fallback)
        let arrText = robustlyExtractJsonArray(content);
        if (!arrText) {
        const match = content.match(/\[(.*?)\]/s);
        if (match) arrText = match[0];
        }

        if (!arrText) throw new Error("Tiny LLM did not return a JSON array");

        const keys = JSON.parse(arrText);
        if (!Array.isArray(keys) || keys.length === 0)
        throw new Error("Tiny LLM returned invalid keys");

        return keys;
    } catch (e) {
        console.error("[feed-indexer] Tiny LLM key selection failed:", e);
        throw e;
    }
    }

  async enhanceIndividualItem(engine, item, importName, itemIndex, totalItems) {
    try {
        const systemPrompt = `You are an expert content analyzer. From the provided JSON item, generate an improved title and a concise summary.
Return ONLY a JSON object with two keys:
{
  "enhanced_title": "A new, readable title (max 80 chars)",
  "summary": "A concise summary of the content (max 150 chars)"
}`;
        
        const userPrompt = `Item to analyze:\n${JSON.stringify(item, null, 2)}`;
        const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }];

        const content = await callLlm(engine, messages, 800, this.settings.llmProvider);
        const jsonText = robustlyExtractJsonObject(content);
        if (!jsonText) throw new Error('Could not parse JSON object from LLM response.');

        const enhanced = JSON.parse(jsonText);
        const obj = Array.isArray(enhanced) ? enhanced.find(x => x && typeof x === 'object') : (enhanced || {});

        return {
            ...item,
            ...obj,
            enhanced_title: obj.enhanced_title || item.title || item.text || `Item ${itemIndex}`,
            summary: obj.summary || 'No summary generated.',
            _llm_enhanced: true
        };
    } catch (e) {
        console.error(`[feed-indexer] Individual item enhancement failed for item ${itemIndex}:`, e);
        // Instead of failing the entire import, return the original item
        return { ...item, _llm_enhanced: false, _llm_error: e.message };
    }
  }
  
  async createIndividualNotes(items, importName) {
    try {
      const baseFolder = importName.replace(/[^a-zA-Z0-9_-]/g, '-');
      if (!await this.app.vault.adapter.exists(baseFolder)) {
        await this.app.vault.createFolder(baseFolder);
      }
      
      console.log(`[feed-indexer] Creating ${items.length} individual notes in folder: ${baseFolder}`);
      const notePaths = [];
      
      for (const [index, item] of items.entries()) {
        try {
          const title = item.enhanced_title || item.title || item.text || `Item ${index + 1}`;
          const safeTitle = title.replace(/[^a-zA-Z0-9_\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
          const baseName = safeTitle || `item-${index + 1}`;
          const filePath = await getUniqueFilePath(this.app.vault, baseFolder, baseName, 'md');
          
          const noteContent = this.generateNoteContent(item, title);
          await this.app.vault.create(filePath, noteContent);
          notePaths.push(filePath);
        } catch (e) {
          console.warn(`[feed-indexer] Failed to create note for item ${index}:`, e);
        }
      }
      return notePaths;
    } catch (e) {
      console.error('[feed-indexer] Failed to create individual notes:', e);
      return [];
    }
  }

  generateNoteContent(item, title) {
    let frontmatter = '---\n';
    frontmatter += `title: ${yamlQuote(title)}\n`;
    if (item.url || item.href || item.link) frontmatter += `source: ${yamlQuote(item.url || item.href || item.link)}\n`;
    if (item.author || item.author_name) frontmatter += `author: ${yamlQuote(item.author || item.author_name)}\n`;
    if (item.date || item.created_on) frontmatter += `date: ${yamlQuote(item.date || item.created_on)}\n`;
    if (item.category) frontmatter += `category: ${yamlQuote(item.category)}\n`;
    if (item.tags) {
      const tags = Array.isArray(item.tags) ? item.tags : [item.tags];
      frontmatter += `tags: [${tags.map(t => yamlQuote(t)).join(', ')}]\n`;
    }
    frontmatter += `created: ${yamlQuote(new Date().toISOString())}\n---\n\n`;
    
    let content = frontmatter + `# ${title}\n\n`;
    if (item.summary) content += `## Summary\n\n${item.summary}\n\n`;
    
    const mainText = item.text || item.content || item.description || '';
    if (mainText) content += `## Content\n\n${mainText}\n\n`;
    
    content += `## Metadata\n\n`;
    const skipKeys = new Set(['title', 'enhanced_title', 'summary', 'text', 'content', 'description', '_selected_keys']);
    for (const [key, value] of Object.entries(item)) {
      if (skipKeys.has(key) || !value) continue;
      
      const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const displayValue = typeof value === 'object' ? `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`` : String(value);
      content += `**${displayKey}:** ${displayValue}\n\n`;
    }
    return content;
  }

  // #endregion

  async importFileAsItems(filePath, options = {}) {
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) throw new Error('File not found or not a valid file');
      
      const content = await this.app.vault.read(file);
      const maxItems = options.maxItems ?? this.settings.maxImportItems;
      let items = [];
      
      if (filePath.toLowerCase().endsWith('.json')) items = parseJsonToItems(content, maxItems);
      else if (filePath.toLowerCase().endsWith('.csv')) items = parseCsvToItems(content, maxItems);
      else throw new Error('Unsupported file format. Please use JSON or CSV.');
      
      if (!Array.isArray(items) || items.length === 0) throw new Error('No valid items found in the file');
      
      const importUrl = `file://import/${file.name}`;
      const importName = file.name.replace(/\.[^/.]+$/, '');
      
      let enhancedItems = items;
      if (options.generateLlmIndex ?? this.settings.generateLlmIndex) {
        enhancedItems = await this.generateLlmEnhancedIndex(items, importName);
      }
      
      const notePath = await this.saveFeedLinksAsNote(importUrl, enhancedItems, new Date().toISOString());
      
      let individualNotePaths = [];
      if (options.createIndividualNotes ?? this.settings.createIndividualNotes) {
        individualNotePaths = await this.createIndividualNotes(enhancedItems, importName);
      }
      
      const entry = {
        id: Date.now(),
        url: importUrl,
        items: enhancedItems,
        notePath,
        individualNotePaths,
        created: new Date().toISOString(),
        source: 'file-import',
        originalFile: filePath,
        importName
      };
      
      this.feeds.push(entry);
      await this.saveFeeds();
      
      const noteMsg = individualNotePaths.length > 0 ? ` and ${individualNotePaths.length} individual notes` : '';
      new Notice(`Successfully imported ${enhancedItems.length} items from ${file.name}${noteMsg}.`);
      return entry;
    } catch (e) {
      console.error('[feed-indexer] Import failed:', e);
      new Notice('Import failed: ' + (e.message || String(e)));
      throw e;
    }
  }
};

// #region Helper Functions

function getCandidateKeyStats(sampleItems) {
  const keyCounts = new Map();
  const systemLike = new Set(['_selected_keys', 'url', 'href', 'link']);

  for (const it of sampleItems) {
    if (!it || typeof it !== 'object') continue;
    for (const [k, v] of Object.entries(it)) {
      if (!k || systemLike.has(k) || v == null) continue;
      
      let score = 1;
      if (typeof v === 'string') {
        const len = v.trim().length;
        if (len === 0) continue;
        if (len > 500) score *= 0.3; // Penalize very long strings
      } else if (Array.isArray(v)) {
        if (v.length === 0) continue;
        if (v.length > 10) score *= 0.5;
      } else if (typeof v === 'object') {
        score *= 0.4; // Penalize complex objects
      }
      keyCounts.set(k, (keyCounts.get(k) || 0) + score);
    }
  }

  const prio = (k) => ({ 'enhanced_title': 1000, 'title': 900 }[k] || 0);
  let candidates = Array.from(keyCounts.entries()).map(([key, score]) => ({ key, count: Math.round(score) }));
  candidates.sort((a, b) => (prio(b.key) + b.count) - (prio(a.key) + a.count));

  return { candidates, candidateSet: new Set(candidates.map(c => c.key)) };
}

async function fetchPage(url) {
  dlog('[feed-indexer] fetchPage start', url);
  const res = await requestUrl({ url, method: 'GET', throw: false });
  if (res?.status >= 200 && res.status < 300) {
    const text = res.text || (res.arrayBuffer ? new TextDecoder().decode(res.arrayBuffer) : '');
    if (text) return text;
  }
  throw new Error('fetchPage failed for ' + url);
}

function preprocessHtmlForLlm(html) {
    dlog('[feed-indexer] preprocessHtmlForLlm: original length=', html?.length || 0);
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const body = doc.body;
        if (!body) return '';

        const unwantedTags = 'script, style, noscript, svg, header, footer, nav, aside, form, iframe, [role="navigation"], [role="banner"], [aria-hidden="true"]';
        body.querySelectorAll(unwantedTags).forEach(el => el.remove());

        const allowedAttrs = ['href', 'src', 'alt', 'title'];
        body.querySelectorAll('*').forEach(el => {
            const toRemove = [...el.attributes].map(attr => attr.name).filter(name => !allowedAttrs.includes(name.toLowerCase()) && !name.startsWith('data-'));
            toRemove.forEach(attr => el.removeAttribute(attr));
        });

        let mainContent = body.querySelector('main') || body.querySelector('article') || body.querySelector('[role="main"]') || body;
        let out = (mainContent || body).innerText.replace(/\n\s*\n/g, '\n').trim();
        dlog('[feed-indexer] preprocessHtmlForLlm: cleaned length=', out.length);
        return out;
    } catch (e) {
        console.warn('[feed-indexer] preprocessHtmlForLlm failed:', e);
        throw e;
    }
}

async function askFeedLinks(plugin, url, preprocessedHtml) {
    const engine = await createLlmEngine(plugin);
    const system = `You are an expert data extractor. From the provided text, extract the main content items (like articles or posts).
  Return ONLY a valid JSON array of objects. Each object must have a "url" and a "title".
  Example: [{"url": "https://...", "title": "Example Title"}, {"url": "https://...", "title": "Another Title"}]`;
    const linksChars = plugin.settings.linksPromptChars || 16000;
    const truncated = truncateForPrompt(preprocessedHtml, linksChars);
    const user = `Base URL for resolving relative paths: ${url}\n\nPage Content:\n${truncated}\n\nReturn ONLY the JSON array.`;

    const content = await callLlm(engine, [{ role: 'system', content: system }, { role: 'user', content: user }], 1200, plugin.settings.llmProvider);
    const arrText = robustlyExtractJsonArray(content);
    if (!arrText) throw new Error('Could not extract JSON array from LLM response.');

    const arr = JSON.parse(arrText);
    if (!Array.isArray(arr)) throw new Error('LLM response was not a valid array.');
    return sanitizeItems(arr, url);
}

// #endregion

// #region LLM Abstraction
let _webllmInstance = null;
let _transformersInstance = null;
let _llmEngineInstance = null;

async function loadWebLLM(plugin) {
  if (_webllmInstance) return _webllmInstance;
  const url = 'https://esm.run/@mlc-ai/web-llm';
  try {
    console.log('[feed-indexer] web-llm: loading module...');
    const webllm = await import(/* @vite-ignore */ url);
    console.log('[feed-indexer] web-llm: module loaded.');

    const modelList = webllm.prebuiltAppConfig?.model_list || [];
    if (plugin?.settings) {
      plugin.settings.availableModels = modelList;
      await plugin.saveFeeds();
    }
    _webllmInstance = webllm;
    return webllm;
  } catch (err) {
    console.error('[feed-indexer] failed to import web-llm:', err);
    throw new Error('Failed to load WebLLM from CDN: ' + err.message);
  }
}

async function loadTransformersJS() {
    if (_transformersInstance) return _transformersInstance;
    const url = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';
    try {
        console.log('[feed-indexer] transformers.js: loading module...');
        const transformers = await import(/* @vite-ignore */ url);
        console.log('[feed-indexer] transformers.js: module loaded.');
        // Disable local models to ensure models are fetched from the hub
        transformers.env.allowLocalModels = false;
        _transformersInstance = transformers;
        return transformers;
    } catch (err) {
        console.error('[feed-indexer] failed to import transformers.js:', err);
        throw new Error('Failed to load Transformers.js from CDN: ' + err.message);
    }
}

async function fetchTransformerModels(plugin) {
    console.log('[feed-indexer] Fetching transformer models from Hugging Face Hub...');
    try {
        const res = await requestUrl({
            url: 'https://huggingface.co/api/models?pipeline_tag=text-generation&author=Xenova&sort=downloads&direction=-1&limit=50',
            method: 'GET',
            throw: true
        });
        const models = res.json.map(m => m.id);
        if (!Array.isArray(models) || models.length === 0) {
            throw new Error('No models found in API response.');
        }
        console.log(`[feed-indexer] Found ${models.length} transformer models.`);
        plugin.settings.availableModels = models;
        await plugin.saveFeeds();
        return models;
    } catch (e) {
        console.error('[feed-indexer] Failed to fetch transformer models:', e);
        throw new Error('Could not fetch models from Hugging Face Hub.');
    }
}


async function createLlmEngine(plugin) {
    if (_llmEngineInstance) return _llmEngineInstance;

    const provider = plugin.settings.llmProvider || 'webllm';
    const modelId = plugin.settings.preferredModelId;
    console.log(`[feed-indexer] Creating LLM engine with provider: ${provider}`);

    try {
        if (provider === 'webllm') {
            const webllm = await loadWebLLM(plugin);
            const selectedModel = modelId || webllm.prebuiltAppConfig?.model_list.find(m => /SmolLM.*q0f32/i.test(m.model_id))?.model_id || 'SmolLM-1.7B-Instruct-q0f32-MLC';
            console.log('[feed-indexer] web-llm: creating engine for model', { modelId: selectedModel });
            const t0 = Date.now();
            _llmEngineInstance = await webllm.CreateMLCEngine(selectedModel, {});
            console.log('[feed-indexer] web-llm: engine ready', { modelId: selectedModel, tookMs: Date.now() - t0 });

        } else if (provider === 'transformers') {
            // ########### CODE FIX START ###########
            const { pipeline, env } = await loadTransformersJS();
            
            // For stability in varied environments like Obsidian, we explicitly
            // configure the WASM backend to be single-threaded. This prevents
            // both the 'create' and 'wasm' property access errors.
            // ########### CODE FIX END ###########
            
            const selectedModel = modelId || 'Xenova/distilgpt2'; // Using a known small model is good for testing
            console.log('[feed-indexer] transformers.js: creating text-generation pipeline for model', { modelId: selectedModel });
            const t0 = Date.now();
            _llmEngineInstance = await pipeline('text-generation', selectedModel, {
                progress_callback: (progress) => {
                    console.log(`[feed-indexer] transformers.js: loading model...`, progress);
                }
            });
            console.log('[feed-indexer] transformers.js: pipeline ready', { modelId: selectedModel, tookMs: Date.now() - t0 });
        } else {
            throw new Error(`Unknown LLM provider: ${provider}`);
        }
        return _llmEngineInstance;
    } catch (e) {
        console.error(`[feed-indexer] Failed to create LLM engine:`, e);
        new Notice(`Failed to create AI engine: ${e.message}`);
        return null;
    }
}

/** A centralized function to call the LLM, including logging and error handling. */
async function callLlm(engine, messages, maxTokens, provider) {
    try {
        console.log('[feed-indexer] callLlm: sending messages to engine', { provider, msgCount: messages.length, maxTokens });
        console.log('[feed-indexer] callLlm: messages', messages.map(m => ({ role: m.role, content: (m.content) })));
        
        let content = '';
        if (provider === 'webllm') {
            const resp = await engine.chat.completions.create({ messages, max_tokens: maxTokens, stream: false });
            console.log('[feed-indexer] callLlm: engine response received', resp.choices?.[0]);
            content = resp?.choices?.[0]?.message?.content || '';
        } else if (provider === 'transformers') {
            // Transformers.js pipeline expects a single string prompt.
            const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
            const resp = await engine(prompt, { max_new_tokens: maxTokens, num_return_sequences: 1 });
            console.log('[feed-indexer] callLlm: engine response received', resp);
            content = resp?.[0]?.generated_text || '';
            // The response often includes the prompt, so we should remove it.
            if (content.startsWith(prompt)) {
                content = content.slice(prompt.length).trim();
            }
        } else {
             throw new Error(`Unsupported LLM provider in callLlm: ${provider}`);
        }

        if (!content) throw new Error('LLM returned an empty response.');
        return content;
    } catch (err) {
        console.error('[feed-indexer] callLlm failed:', err);
        throw err;
    }
}
// #endregion

// #region Parsing and Data Extraction
function robustlyExtractJsonArray(text) {
    // if start with ", remove it
    if (text?.startsWith('"')) text = text.slice(1);
    if (text?.endsWith('"')) text = text.slice(0, -1);
  if (!text) return null;
  const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (markdownMatch?.[1]) return extractJsonArray(markdownMatch[1].trim());
  
  const arrayMatch = text.match(/(?:\s*|:)\s*(\[[\s\S]*\])/);
  if (arrayMatch?.[1]) {
      try {
          JSON.parse(arrayMatch[1]);
          return arrayMatch[1];
      } catch (_) {}
  }
  // "Output:\n\"['title']\"" pattern
    const outputMatch = text.match(/Output:\s*["'](\[.*\])["']/);
    if (outputMatch?.[1]) {
        try {
            JSON.parse(outputMatch[1]);
            return outputMatch[1];
        } catch (_) {}
    }
  
  const objText = extractJsonArray(text);
  if (objText) return objText;

  return null;
}

function robustlyExtractJsonObject(text) {
  if (!text) return null;
  const fenceMatch = text.match(/```(json)?\s*([\s\S]*?)\s*```/i);
  const searchText = fenceMatch?.[2] || text;
  
  const objText = extractJson(searchText);
  if (objText) return objText;
  
  // Fallback: if an array is found, return the first object in it
  const arrText = extractJsonArray(searchText);
  if (arrText) {
      try {
          const arr = JSON.parse(arrText);
          const firstObj = arr.find(x => x && typeof x === 'object' && !Array.isArray(x));
          if (firstObj) return JSON.stringify(firstObj);
      } catch (_) {}
  }
  return null;
}

function extractJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function extractJsonArray(text) {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function sanitizeItems(items, baseUrl) {
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const rawUrl = it?.url || it?.href || it?.link;
    let url;
    try { url = new URL(rawUrl, baseUrl).toString(); } catch (_) { continue; }
    if (!url || seen.has(url)) continue;

    const rawTitle = it?.title || it?.text || '';
    let title = String(rawTitle).trim().replace(/\s+/g, ' ');
    if (!title) {
        try {
            const u = new URL(url);
            title = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.hostname);
        } catch (_) { title = url; }
    }
    
    const clean = { url, title: title.slice(0, 240) };
    const skipKeys = new Set(['url', 'href', 'link', 'title', 'text']);
    if (it && typeof it === 'object') {
      for (const [k, v] of Object.entries(it)) {
        if (!skipKeys.has(k)) clean[k] = v;
      }
    }
    out.push(clean);
    seen.add(url);
  }
  return out;
}

function parseJsonToItems(content, maxItems = null) {
  try {
    const parsed = JSON.parse(content);
    let items = [];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      const arrayKey = ['items', 'data', 'results', 'bookmarks', 'entries'].find(k => Array.isArray(parsed[k]));
      items = arrayKey ? parsed[arrayKey] : [parsed];
    }
    
    if (maxItems > 0 && items.length > maxItems) {
      console.log(`[feed-indexer] Limiting JSON extraction to ${maxItems} items (found ${items.length})`);
      return items.slice(0, maxItems);
    }
    return items;
  } catch (e) {
    throw new Error('Invalid JSON format: ' + e.message);
  }
}

function parseCsvToItems(content, maxItems = null) {
  try {
    const lines = content.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV must have a header and at least one data row.');
    
    const headers = parseCSVLine(lines[0]);
    const dataLines = maxItems > 0 ? lines.slice(1, maxItems + 1) : lines.slice(1);
    
    return dataLines.map(line => {
      if (!line.trim()) return null;
      const values = parseCSVLine(line);
      const item = {};
      headers.forEach((header, j) => {
        const key = header.toLowerCase().trim();
        const value = values[j]?.trim() || '';
        if (value) item[key] = value;
      });
      return Object.keys(item).length > 0 ? item : null;
    }).filter(Boolean);
  } catch (e) {
    throw new Error('Invalid CSV format: ' + e.message);
  }
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function truncateForPrompt(s, maxChars) {
  if (!s || s.length <= maxChars) return s;
  const keep = Math.floor((maxChars - 50) / 2); // 50 chars for the truncated message
  const start = s.slice(0, keep);
  const end = s.slice(s.length - keep);
  return `${start}\n\n...CONTENT_TRUNCATED...\n\n${end}`;
}
// #endregion

// #region UI Classes (Modal, View, Settings)
class FeedIndexerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Feed Indexer Settings' });

    new Setting(containerEl)
      .setName('LLM Engine')
      .setDesc('Choose the AI engine to use for processing.')
      .addDropdown(dd => {
          dd.addOption('webllm', 'WebLLM');
          dd.addOption('transformers', 'Transformers.js');
          dd.setValue(this.plugin.settings.llmProvider);
          dd.onChange(async (val) => {
              this.plugin.settings.llmProvider = val;
              // Reset model and engine on provider change
              this.plugin.settings.preferredModelId = '';
              this.plugin.settings.availableModels = [];
              _llmEngineInstance = null; 
              await this.plugin.saveFeeds();
              this.display(); // Re-render settings
          });
      });

    const modelSetting = new Setting(containerEl)
      .setName('Preferred Model')
      .setDesc('Choose a model for the selected engine. Leave blank for default.')
      .addDropdown(dd => {
        this.modelDropdown = dd;
        this.updateModelDropdown();
        dd.onChange(async (val) => {
          this.plugin.settings.preferredModelId = val || '';
           _llmEngineInstance = null; // Force engine recreation
          await this.plugin.saveFeeds();
        });
      })
      .addExtraButton((btn) => {
        btn.setTooltip('Refresh model list').setIcon('refresh-ccw').onClick(async () => {
          btn.extraSettingsEl.addClass('is-loading');
          try {
            const provider = this.plugin.settings.llmProvider;
            if (provider === 'webllm') {
              await loadWebLLM(this.plugin);
            } else if (provider === 'transformers') {
              await fetchTransformerModels(this.plugin);
            }
            this.updateModelDropdown();
            new Notice('Model list updated');
          } catch (e) {
            new Notice(`Failed to refresh models: ${e.message}`);
            console.error('[feed-indexer] refresh models failed', e);
          } finally {
            btn.extraSettingsEl.removeClass('is-loading');
          }
        });
      });


    new Setting(containerEl)
      .setName('Enable debug logs')
      .setDesc('Turn on verbose debug logs for troubleshooting (requires reload to take full effect).')
      .addToggle(toggle => toggle
        .setValue(!!this.plugin.settings.debug)
        .onChange(async (v) => {
          this.plugin.settings.debug = !!v;
          FEED_DEBUG = v;
          await this.plugin.saveFeeds();
        }));

    containerEl.createEl('h3', { text: 'Prompt truncation (chars)' });
    new Setting(containerEl)
      .setName('Selector prompt max chars')
      .addText(text => text
        .setPlaceholder(String(DEFAULT_SETTINGS.selectorPromptChars))
        .setValue(String(this.plugin.settings.selectorPromptChars))
        .onChange(async (v) => {
          this.plugin.settings.selectorPromptChars = parseInt(v) || DEFAULT_SETTINGS.selectorPromptChars;
          await this.plugin.saveFeeds();
        }));

    new Setting(containerEl)
      .setName('Links prompt max chars')
      .addText(text => text
        .setPlaceholder(String(DEFAULT_SETTINGS.linksPromptChars))
        .setValue(String(this.plugin.settings.linksPromptChars))
        .onChange(async (v) => {
          this.plugin.settings.linksPromptChars = parseInt(v) || DEFAULT_SETTINGS.linksPromptChars;
          await this.plugin.saveFeeds();
        }));

    containerEl.createEl('h3', { text: 'Import Settings' });
    new Setting(containerEl)
      .setName('Max import items')
      .addText(text => text
        .setPlaceholder(String(DEFAULT_SETTINGS.maxImportItems))
        .setValue(String(this.plugin.settings.maxImportItems))
        .onChange(async (v) => {
          this.plugin.settings.maxImportItems = parseInt(v) || DEFAULT_SETTINGS.maxImportItems;
          await this.plugin.saveFeeds();
        }));

    new Setting(containerEl)
      .setName('Generate LLM index')
      .setDesc('Use LLM to generate improved titles and summaries for imported items.')
      .addToggle(toggle => toggle
        .setValue(!!this.plugin.settings.generateLlmIndex)
        .onChange(async (v) => {
          this.plugin.settings.generateLlmIndex = v;
          await this.plugin.saveFeeds();
        }));

    new Setting(containerEl)
      .setName('Create individual notes')
      .setDesc('Create separate notes for each imported item.')
      .addToggle(toggle => toggle
        .setValue(!!this.plugin.settings.createIndividualNotes)
        .onChange(async (v) => {
          this.plugin.settings.createIndividualNotes = v;
          await this.plugin.saveFeeds();
        }));
  }

  updateModelDropdown() {
    if (!this.modelDropdown) return;
    const dd = this.modelDropdown;
    dd.selectEl.innerHTML = '';
    dd.addOption('', '-- default --');

    const models = this.plugin.settings.availableModels || [];
    if (models.length === 0) {
        dd.addOption('', 'Click refresh to load models');
        dd.setDisabled(true);
    } else {
        dd.setDisabled(false);
    }
    
    for (const m of models) {
        const value = typeof m === 'string' ? m : (m.model_id || m.id);
        if (value) dd.addOption(value, value);
    }
    
    dd.setValue(this.plugin.settings.preferredModelId || '');
  }
}

async function addFeedInline(plugin, url, statusCallback) {
  try {
    statusCallback?.('Fetching page...');
    const html = await fetchPage(url);
    const preprocessedHtml = preprocessHtmlForLlm(html);

    statusCallback?.('Loading AI Engine & processing...');
    const llmItemsRaw = await askFeedLinks(plugin, url, preprocessedHtml);
    dlog(`[feed-indexer] LLM found ${llmItemsRaw?.length || 0} items`);
    const finalItems = sanitizeItems(Array.isArray(llmItemsRaw) ? llmItemsRaw : [], url);

    if (finalItems.length === 0) {
      statusCallback?.('No feed items found');
      return null;
    }

    statusCallback?.(`Found ${finalItems.length} item(s) — saving...`);
    const created = new Date().toISOString();
    const notePath = await plugin.saveFeedLinksAsNote(url, finalItems, created);
    const entry = { id: Date.now(), url, items: finalItems, notePath, created };
    plugin.feeds.push(entry);
    await plugin.saveFeeds();
    return entry;
  } catch (err) {
    console.error('[feed-indexer] error in addFeedInline', err);
    statusCallback?.('Error: ' + (err.message || String(err)));
    throw err;
  }
}

class FeedExplorerView extends ItemView {
    constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
    getViewType() { return FEED_EXPLORER_VIEW_TYPE; }
    getDisplayText() { return 'Feeds'; }
    getIcon() { return 'rss'; }
    async onOpen() { await this.render(); }
    onClose() {}
    setStatus(text) {
        if (!this._statusEl) return;
        this._statusEl.textContent = text || '';
        this._statusEl.style.display = text ? '' : 'none';
    }

    async render() {
        const container = this.contentEl;
        container.empty();

        new Setting(container).setName('Feed index').setDesc('Update the markdown index of captured feeds.')
            .addExtraButton(btn => btn.setTooltip('Import JSON/CSV file').setIcon('file-plus-2').onClick(() => this.plugin.openImportFileModal()))
            .addExtraButton(btn => btn.setTooltip('Update feed index').setIcon('clipboard-list').onClick(() => this.plugin.updateFeedIndexNote()));

        let urlVal = '';
        new Setting(container).setName('Add feed').setDesc('Enter a URL to extract article links and save as a note.')
            .addText(t => {
                t.setPlaceholder('https://example.com').onChange(v => urlVal = v.trim()).inputEl.addClass('full-width');
                this._urlInput = t;
            })
            .addButton(b => b.setButtonText('Add').setCta().onClick(async () => {
                if (!urlVal) { new Notice('Please provide a URL'); return; }
                b.setDisabled(true).setButtonText('Adding…');
                this.setStatus('Starting...');
                try {
                    await addFeedInline(this.plugin, urlVal, (msg) => this.setStatus(msg));
                    this._urlInput?.setValue('');
                    await this.render();
                    new Notice('Feed added successfully');
                } catch (e) {
                    new Notice('Failed to add feed: ' + (e.message || String(e)));
                } finally {
                    this.setStatus('');
                    b.setDisabled(false).setButtonText('Add');
                }
            }));
        
        this._statusEl = container.createDiv({ cls: 'setting-item-description', attr: { style: 'margin: 0 12px 12px 12px;' }});
        this.setStatus('');

        const feeds = (this.plugin.feeds || []).slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
        new Setting(container).setName('Feeds').setDesc(`${feeds.length} feed${feeds.length !== 1 ? 's' : ''} captured`);
        
        if (feeds.length === 0) {
            container.createEl('p', { text: 'No feeds yet. Add a URL above to start.', cls: 'setting-item-description' });
            return;
        }

        for (const f of feeds) {
            const s = new Setting(container);
            let titleText;
            try { titleText = new URL(f.url).hostname; } catch (_) { titleText = f.url; }
            s.setName(titleText);
            const date = f.created ? new Date(f.created).toLocaleString() : '';
            s.setDesc(`${f.items?.length || 0} items • ${date}`);

            s.addExtraButton(btn => btn.setTooltip('Delete').setIcon('trash').onClick(() => {
                new ConfirmModal(this.app, 'Delete feed?', `Are you sure you want to delete the feed for ${titleText}?`, async () => {
                    await this.plugin.deleteFeed(f.id);
                    await this.render();
                }).open();
            }));
        }
    }
}

class ConfirmModal extends Modal {
  constructor(app, title, message, onConfirm) {
    super(app);
    this.title = title;
    this.message = message;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    this.contentEl.createEl('p', { text: this.message });
    new Setting(this.contentEl)
        .addButton(btn => btn.setButtonText('Confirm').setCta().onClick(async () => {
            this.close();
            await this.onConfirm?.();
        }))
        .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
  }
  onClose() { this.contentEl.empty(); }
}

class ImportFileModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
        this.selectedFile = '';
        this.maxItems = plugin.settings.maxImportItems;
        this.generateLlmIndex = plugin.settings.generateLlmIndex;
        this.createIndividualNotes = plugin.settings.createIndividualNotes;
    }

    onOpen() {
        this.titleEl.setText('Import JSON/CSV File');
        this.contentEl.createEl('p', { text: 'Select a JSON or CSV file from your vault to import as feed items.' });

        new Setting(this.contentEl).setName('Select file').addDropdown(dd => {
            const files = this.app.vault.getFiles().filter(f => ['json', 'csv'].includes(f.extension.toLowerCase()));
            dd.addOption('', '-- Select a file --');
            files.forEach(f => dd.addOption(f.path, f.path));
            if (files.length === 0) dd.addOption('', 'No JSON/CSV files found').setDisabled(true);
            dd.onChange(v => this.selectedFile = v);
        });

        new Setting(this.contentEl).setName('Max items to import').addText(text => text
            .setValue(String(this.maxItems)).onChange(v => this.maxItems = parseInt(v) || 0));

        new Setting(this.contentEl).setName('Generate LLM index').addToggle(toggle => toggle
            .setValue(this.generateLlmIndex).onChange(v => this.generateLlmIndex = v));
        
        new Setting(this.contentEl).setName('Create individual notes').addToggle(toggle => toggle
            .setValue(this.createIndividualNotes).onChange(v => this.createIndividualNotes = v));

        new Setting(this.contentEl).addButton(btn => btn.setButtonText('Import').setCta().onClick(async () => {
            if (!this.selectedFile) { new Notice('Please select a file.'); return; }
            btn.setDisabled(true).setButtonText('Importing...');
            try {
                await this.plugin.importFileAsItems(this.selectedFile, {
                    maxItems: this.maxItems,
                    generateLlmIndex: this.generateLlmIndex,
                    createIndividualNotes: this.createIndividualNotes
                });
                this.close();
            } finally {
                btn.setDisabled(false).setButtonText('Import');
            }
        })).addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
    }
    onClose() { this.contentEl.empty(); }
}
// #endregion

console.log('[feed-indexer] main.js loaded');