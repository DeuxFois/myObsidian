"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// config/constants.js
var require_constants = __commonJS({
  "config/constants.js"(exports2, module2) {
    "use strict";
    var DEFAULT_SETTINGS2 = {
      summaryApiEndpoint: "",
      summaryApiModel: "",
      summaryApiKey: "",
      pdfDownloadFolder: "_research-papers",
      hideFolderFromFiles: false,
      sectors: ["Other"],
      defaultSector: "Other",
      // Maximum number of PDF characters to include when generating a resume.
      // Helps control token usage. 0 disables PDF text inclusion.
      maxPdfCharactersForResume: 2e7
    };
    module2.exports = { DEFAULT_SETTINGS: DEFAULT_SETTINGS2 };
  }
});

// services/llm-service.js
var require_llm_service = __commonJS({
  "services/llm-service.js"(exports2, module2) {
    "use strict";
    var { requestUrl } = require("obsidian");
    var LLMService2 = class {
      constructor(settings) {
        this.settings = settings;
      }
      async callLLM(requestBody) {
        if (!this.settings.summaryApiEndpoint || !this.settings.summaryApiModel) {
          throw new Error("API endpoint or model is not configured in settings.");
        }
        if (!this.settings.summaryApiKey) {
          throw new Error("API key is not configured in settings.");
        }
        try {
          const res = await requestUrl({
            url: this.settings.summaryApiEndpoint,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${this.settings.summaryApiKey}`
            },
            body: JSON.stringify(requestBody)
          });
          if (res && typeof res.status === "number" && res.status >= 400) {
            const msg = res.text || JSON.stringify(res.json || res);
            const err = new Error(`status ${res.status}: ${String(msg).slice(0, 200)}`);
            err.status = res.status;
            throw err;
          }
          let json = null;
          if (res && res.json) json = res.json;
          else if (res && typeof res.text === "string") {
            try {
              json = JSON.parse(res.text);
            } catch (_) {
              json = null;
            }
          }
          const textBody = res && typeof res.text === "string" ? res.text : json ? JSON.stringify(json) : "";
          if (textBody && textBody.trim().startsWith("<!DOCTYPE")) {
            throw new Error(`API returned HTML error page. Check your API endpoint: ${this.settings.summaryApiEndpoint}`);
          }
          const content = json?.choices?.[0]?.message?.content;
          if (!content) throw new Error(`Invalid API response format. Response: ${String(textBody).slice(0, 500)}`);
          return content;
        } catch (error) {
          if (error && error.status) throw error;
          throw new Error(error.message || String(error));
        }
      }
      async callLLMWithPrompt(systemPrompt, userContent) {
        const requestBody = {
          model: this.settings.summaryApiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
          ]
        };
        return await this.callLLM(requestBody);
      }
      async getSummary(text) {
        return this.callLLMWithPrompt(
          `# Comprehensive Academic Article Summarizer

### <System>:
You are an **Expert Academic Summarizer** with a deep understanding of *research methodologies, theoretical frameworks, and scholarly discourse*. Your summaries maintain rigorous accuracy, capturing key arguments, methodologies, limitations, and implications without oversimplification. You avoid reducing complex ideas into mere bullet points while ensuring clarity and organization.
When details are unclear, you will explicitly indicate gaps rather than filling them with assumptions. Where possible, you will use direct excerpts to preserve the integrity of the author\u2019s argument.

---

### <Context>:
The user will provide an academic article (journal paper, thesis, white paper, or research report) they want thoroughly summarized. They value in-depth understanding over quick takeaways, emphasizing research design, argumentation structure, and scholarly context.

---

### <Instructions>:
1.  Adapt summarization depth based on article type:
    -   Empirical Studies \u2192 Focus on research question, methodology, data, results, and limitations.
    -   Theoretical Papers \u2192 Focus on central arguments, frameworks, and implications.
    -   Literature Reviews \u2192 Emphasize major themes, key sources, and synthesis of perspectives.
    -   Meta-Analyses \u2192 Highlight statistical techniques, key findings, and research trends.

2.  Include a multi-layered summary with these components:
    -   (Optional) Executive Summary: A 3-5 sentence quick overview of the article.
    -   Research Question & Objectives: Clearly define what the study aims to investigate.
    -   Core Argument or Hypothesis: Summarize the main thesis or hypothesis tested.
    -   Key Findings & Conclusions: Present the most important results and takeaways.
    -   Methodology & Data: Describe how the study was conducted, including sample size, data sources, and analytical methods.
    -   Theoretical Framework: Identify the theories, models, or intellectual traditions informing the study.
    -   Results & Interpretation: Summarize key data points, statistical analyses, and their implications.
    -   Limitations & Critiques: Note methodological constraints, potential biases, and gaps in the study.
    -   Scholarly Context: Discuss how this paper fits into existing research, citing related works.
    -   Practical & Theoretical Implications: Explain how the findings contribute to academia, policy, or real-world applications.

3.  Handle uncertainty and gaps responsibly:
    -   Clearly indicate when information is missing:
        -   *\u201CThe article does not specify\u2026\u201D*
        -   *\u201CThe author implies X but does not explicitly state it\u2026\u201D*
    -   Do not infer unstated conclusions.
    -   If the article presents contradictions, note them explicitly rather than resolving them artificially.

4.  For cited references and sources:
    -   Identify key studies referenced and their relevance.
    -   Highlight intellectual debates the paper engages with.
    -   If applicable, note paradigm shifts or major disagreements in the field.

---

### <Constraints>:

\u2705 Prioritize accuracy and scholarly rigor over brevity.
\u2705 Do not introduce external information not in the original article.
\u2705 Maintain a neutral, academic tone.
\u2705 Use direct excerpts where necessary to avoid misinterpretation.
\u2705 Retain technical language where appropriate; do not oversimplify complex terms.

---

### <Output Format>:

**Executive Summary**
*A high-level overview (3-5 sentences) summarizing the article\u2019s key contributions.*

**Research Question & Objectives**
[Clearly state what the paper investigates.]

**Core Argument or Hypothesis**
[Summarize the main thesis or hypothesis.]

**Key Findings & Conclusions**
-   [Finding 1]
-   [Finding 2]
-   *(Continue as needed)*

**Methodology & Data**
[Describe research design, sample size, data sources, and analysis methods.]

**Theoretical Framework**
[Identify key theories, models, or intellectual traditions used.]

**Results & Interpretation**
[Summarize key data points, statistical analyses, and their implications.]

**Limitations & Critiques**
[Discuss methodological constraints, biases, and gaps.]

**Scholarly Context**
[How this study builds on, contradicts, or extends previous research.]

**Practical & Theoretical Implications**
[Discuss how findings contribute to academia, policy, or real-world applications.]`,
          text
        );
      }
      async getTags(text) {
        return this.callLLMWithPrompt(
          "You are a helpful assistant. Generate relevant academic tags for the following research paper content. Return only a comma-separated list of tags, no other text.",
          text
        );
      }
      async testApi() {
        const testText = "This is a test message for API configuration. If you see a summary of this, it works.";
        return await this.getSummary(testText);
      }
    };
    module2.exports = LLMService2;
  }
});

// services/metadata-service.js
var require_metadata_service = __commonJS({
  "services/metadata-service.js"(exports2, module2) {
    "use strict";
    var { requestUrl } = require("obsidian");
    var MetadataService2 = class {
      extractArxivId(url) {
        const regex = /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?|[a-zA-Z\-\.]+\/\d{7})/;
        const match = url.match(regex);
        return match ? match[1] : null;
      }
      isDirectPdfUrl(url) {
        try {
          const u = new URL(url);
          return /\.pdf$/i.test(u.pathname);
        } catch (_) {
          return false;
        }
      }
      async buildMetadataFromDirectPdf(url) {
        let fileNamePart = url.split("?")[0].split("#")[0].split("/").pop() || "Untitled Paper";
        fileNamePart = decodeURIComponent(fileNamePart).replace(/\.pdf$/i, "");
        const cleanedTitle = fileNamePart.replace(/[\-_]+/g, " ").replace(/\s+/g, " ").trim();
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        return {
          id: cleanedTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
          title: cleanedTitle || "Untitled Paper",
          authors: "Unknown",
          summary: "No abstract available (added from direct PDF).",
          published: today,
          pdfLink: url
        };
      }
      async fetchArxivMetadata(arxivId) {
        const apiUrl = `http://export.arxiv.org/api/query?id_list=${arxivId}`;
        const response = await requestUrl({ url: apiUrl });
        if (response.status !== 200) {
          throw new Error("Failed to fetch from arXiv API.");
        }
        const xmlText = await response.text;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const entry = xmlDoc.querySelector("entry");
        if (!entry) {
          throw new Error("Paper not found on arXiv.");
        }
        const getText = (tagName) => entry.querySelector(tagName)?.textContent.trim() || "N/A";
        const getAuthors = () => Array.from(entry.querySelectorAll("author name")).map((el) => el.textContent.trim()).join(", ");
        return {
          id: getText("id").split("/").pop(),
          title: getText("title").replace(/\s+/g, " "),
          authors: getAuthors(),
          summary: getText("summary").replace(/\s+/g, " "),
          published: getText("published").split("T")[0],
          pdfLink: entry.querySelector('link[title="pdf"]')?.getAttribute("href") || ""
        };
      }
      async getMetadataFromUrl(url) {
        const isPdf = this.isDirectPdfUrl(url);
        if (isPdf) {
          return await this.buildMetadataFromDirectPdf(url);
        } else {
          const arxivId = this.extractArxivId(url);
          if (!arxivId) {
            throw new Error("Could not extract a valid arXiv ID or PDF link.");
          }
          return await this.fetchArxivMetadata(arxivId);
        }
      }
    };
    module2.exports = MetadataService2;
  }
});

// utils/formatters.js
var require_formatters = __commonJS({
  "utils/formatters.js"(exports2, module2) {
    "use strict";
    function formatTagsForIndex(rawTags) {
      if (!rawTags) return "";
      let arr = [];
      if (Array.isArray(rawTags)) {
        arr = rawTags;
      } else if (typeof rawTags === "string") {
        if (rawTags.includes(",")) arr = rawTags.split(",");
        else arr = rawTags.split(/\s+/);
      } else {
        try {
          arr = String(rawTags).split(/[,\s]+/);
        } catch (_) {
          arr = [];
        }
      }
      return arr.map((t) => t.trim()).filter(Boolean).map((t) => {
        const cleaned = t.replace(/^#+/, "").replace(/\s+/g, "-");
        return cleaned ? `#${cleaned}` : "";
      }).filter(Boolean).join(" ");
    }
    function normalizeAuthors(fmAuthors) {
      if (!fmAuthors) return "";
      if (Array.isArray(fmAuthors)) return fmAuthors.join(", ");
      try {
        return String(fmAuthors);
      } catch (_) {
        return "";
      }
    }
    function normalizeTags(fmTags) {
      if (!fmTags) return [];
      if (Array.isArray(fmTags)) return fmTags.map((t) => String(t));
      if (typeof fmTags === "string") return fmTags.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
      try {
        return String(fmTags).split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
      } catch (_) {
        return [];
      }
    }
    function generatePdfFileName2(metadata) {
      const sanitizedTitle = metadata.title.replace(/[\\/:"*?<>|]/g, "-").substring(0, 100);
      const firstAuthor = metadata.authors.split(",")[0].trim();
      const year = new Date(metadata.published).getFullYear();
      return `${firstAuthor} et al. - ${year} - ${sanitizedTitle}.pdf`;
    }
    function sanitizeNoteTitle(title) {
      return title.replace(/[\\/:"*?<>|]/g, "-").substring(0, 150);
    }
    module2.exports = {
      formatTagsForIndex,
      normalizeAuthors,
      normalizeTags,
      generatePdfFileName: generatePdfFileName2,
      sanitizeNoteTitle
    };
  }
});

// services/file-service.js
var require_file_service = __commonJS({
  "services/file-service.js"(exports2, module2) {
    "use strict";
    var { requestUrl, TFile: TFile2, Notice: Notice3 } = require("obsidian");
    var { sanitizeNoteTitle, generatePdfFileName: generatePdfFileName2 } = require_formatters();
    var FileService2 = class {
      constructor(app, settings) {
        this.app = app;
        this.settings = settings;
      }
      getEffectiveFolderPath(folderPath) {
        if (this.settings.hideFolderFromFiles) {
          if (folderPath.startsWith(".")) return folderPath;
          return `.${folderPath}`;
        }
        return folderPath;
      }
      async ensureFolderExists(folderPath) {
        const effectivePath = this.getEffectiveFolderPath(folderPath);
        if (!await this.app.vault.adapter.exists(effectivePath)) {
          await this.app.vault.createFolder(effectivePath);
        }
      }
      async downloadPdf(metadata, sector, fileName) {
        if (!metadata.pdfLink) {
          throw new Error("No PDF link found.");
        }
        const pdfBase = `${this.settings.pdfDownloadFolder}/pdf`;
        const targetFolder = sector ? `${pdfBase}/${sector}` : pdfBase;
        await this.ensureFolderExists(targetFolder);
        const targetEffective = this.getEffectiveFolderPath(targetFolder);
        const filePath = `${targetEffective}/${fileName}`;
        if (await this.app.vault.adapter.exists(filePath)) {
          new Notice3(`PDF "${fileName}" already exists.`, 5e3);
          return `${pdfBase}/${sector}/${fileName}`.replace(/\\/g, "/");
        }
        const pdfResponse = await requestUrl({
          url: metadata.pdfLink,
          method: "GET",
          throw: false
        });
        if (!pdfResponse || typeof pdfResponse.status === "number" && pdfResponse.status !== 200) {
          throw new Error("Failed to download PDF.");
        }
        await this.app.vault.createBinary(filePath, pdfResponse.arrayBuffer);
        return `${pdfBase}/${sector}/${fileName}`.replace(/\\/g, "/");
      }
      async createPaperNote(metadata, sector, pdfLogicalPath) {
        const sectorFolder = `${this.settings.pdfDownloadFolder}/${sector}`;
        await this.ensureFolderExists(sectorFolder);
        const sanitizedTitle = sanitizeNoteTitle(metadata.title);
        const notePath = `${this.getEffectiveFolderPath(sectorFolder)}/${sanitizedTitle}.md`;
        if (await this.app.vault.adapter.exists(notePath)) {
          new Notice3(`Note "${sanitizedTitle}.md" already exists.`);
          return;
        }
        const year = new Date(metadata.published).getFullYear();
        const markdownContent = `---
title: "${metadata.title.replace(/"/g, '\\"')}"
authors: "${metadata.authors.replace(/"/g, '\\"')}"
year: ${year}
published: "${metadata.published}"
pdf_file: "${pdfLogicalPath}"
tags: [paper, to-read]
---
# ${metadata.title}

| Field | Value |
|---|---|
| **Title** | ${metadata.title} |
| **Authors** | ${metadata.authors} |
| **Date** | ${metadata.published} |
| **Abstract**| ${metadata.summary} |

**PDF link**: [pdf link](${pdfLogicalPath})

---

## Paper PDF
![[${pdfLogicalPath}]]
`;
        await this.app.vault.create(notePath, markdownContent);
      }
      async deletePaper(noteFile, paperData) {
        const frontmatter = paperData?.frontmatter || {};
        let pdfFileName = frontmatter.pdf_file;
        if (!pdfFileName && frontmatter.title && frontmatter.authors && (frontmatter.published || frontmatter.year)) {
          const legacyMetadata = {
            title: frontmatter.title,
            authors: frontmatter.authors,
            published: frontmatter.published || String(frontmatter.year)
          };
          pdfFileName = generatePdfFileName2(legacyMetadata);
        }
        let confirmMessage = `Permanently delete note "${noteFile.basename}.md"?`;
        if (pdfFileName) {
          confirmMessage += `

This will also attempt to delete the associated PDF: "${pdfFileName}".`;
        }
        confirmMessage += "\n\nThis cannot be undone.";
        if (!confirm(confirmMessage)) return;
        try {
          if (pdfFileName) {
            let pdfLogical = pdfFileName;
            if (!pdfLogical.includes("/")) {
              pdfLogical = `${noteFile.parent.path}/${pdfLogical}`;
            }
            const pdfEffective = await this.resolveLogicalToEffectivePath(pdfLogical);
            const pdfFile = this.app.vault.getAbstractFileByPath(pdfEffective);
            if (pdfFile) {
              await this.app.vault.delete(pdfFile);
            }
          }
          await this.app.vault.delete(noteFile);
          new Notice3("Paper deleted.");
        } catch (error) {
          new Notice3("Failed to delete paper: " + error.message);
        }
      }
      async resolveLogicalToEffectivePath(logicalPath) {
        if (await this.app.vault.adapter.exists(logicalPath)) return logicalPath;
        const parts = logicalPath.split("/");
        if (parts.length > 0) {
          parts[0] = "." + parts[0];
          const dotted = parts.join("/");
          if (await this.app.vault.adapter.exists(dotted)) return dotted;
        }
        return logicalPath;
      }
      async cleanEmptySectorFolders() {
        const baseFolder = this.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        try {
          if (!await this.app.vault.adapter.exists(baseFolder)) return;
          const listing = await this.app.vault.adapter.list(baseFolder);
          for (const folderPath of listing.folders) {
            if (folderPath === baseFolder) continue;
            const rel = folderPath.slice(baseFolder.length + 1);
            if (!rel || rel.startsWith("_")) continue;
            const subListing = await this.app.vault.adapter.list(folderPath);
            const isEmpty = subListing.files.length === 0 && subListing.folders.length === 0;
            if (isEmpty) {
              try {
                await this.app.vault.adapter.rmdir(folderPath, true);
              } catch (err) {
              }
            }
          }
        } catch (e) {
        }
      }
      async toggleFolderVisibility(hideFolder, saveSettings, rebuildAndRefresh) {
        const oldHideValue = this.settings.hideFolderFromFiles;
        const baseFolderName = this.settings.pdfDownloadFolder.replace(/^\./, "");
        const oldPath = oldHideValue ? `.${baseFolderName}` : baseFolderName;
        const newPath = hideFolder ? `.${baseFolderName}` : baseFolderName;
        if (oldPath === newPath) return;
        try {
          const oldFolder = this.app.vault.getAbstractFileByPath(oldPath);
          if (oldFolder) {
            await this.app.fileManager.renameFile(oldFolder, newPath);
            new Notice3(`Folder moved from "${oldPath}" to "${newPath}"`);
          }
          this.settings.hideFolderFromFiles = hideFolder;
          await saveSettings();
          await rebuildAndRefresh();
        } catch (error) {
          new Notice3(`Failed to change folder visibility: ${error.message}`);
          this.settings.hideFolderFromFiles = oldHideValue;
          await saveSettings();
        }
      }
    };
    module2.exports = FileService2;
  }
});

// services/paper-service.js
var require_paper_service = __commonJS({
  "services/paper-service.js"(exports2, module2) {
    "use strict";
    var { TFile: TFile2, Notice: Notice3 } = require("obsidian");
    var { formatTagsForIndex, normalizeAuthors, normalizeTags } = require_formatters();
    var PaperService2 = class {
      constructor(app, settings, fileService, pdfService) {
        this.app = app;
        this.settings = settings;
        this.fileService = fileService;
        this.pdfService = pdfService;
        this.paperIndex = /* @__PURE__ */ new Map();
        this._rebuildTimer = null;
        this._rebuildPending = false;
      }
      isPaperFile(file) {
        const paperFolder = this.fileService.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        return file.path.startsWith(paperFolder) && !file.name.startsWith("_") && file.extension === "md";
      }
      async parsePaperFile(file) {
        if (!this.isPaperFile(file)) return null;
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter || {};
        const paperFolder = this.fileService.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        const relativePath = file.path.substring(paperFolder.length + 1);
        const sector = relativePath.split("/")[0] || "Other";
        return {
          path: file.path,
          basename: file.basename,
          mtime: file.stat.mtime,
          frontmatter,
          sector
        };
      }
      async buildPaperIndex() {
        this.paperIndex.clear();
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
          const paperData = await this.parsePaperFile(file);
          if (paperData) {
            this.paperIndex.set(file.path, paperData);
          }
        }
      }
      async getAvailableSectors() {
        const settingsSectors = new Set(this.settings.sectors || ["Other"]);
        const folderPath = this.fileService.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        try {
          if (await this.app.vault.adapter.exists(folderPath)) {
            const list = await this.app.vault.adapter.list(folderPath);
            const folderSectors = list.folders.map((folder) => folder.split("/").pop());
            folderSectors.forEach((sector) => settingsSectors.add(sector));
          }
        } catch (error) {
        }
        if (settingsSectors.size === 0) {
          settingsSectors.add("Other");
        }
        const sortedSectors = Array.from(settingsSectors).sort();
        if (sortedSectors.includes("Other")) {
          return sortedSectors.filter((s) => s !== "Other").concat("Other");
        }
        return sortedSectors;
      }
      async pruneUnusedSectors(saveSettings) {
        const baseFolder = this.fileService.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        const sectorCounts = /* @__PURE__ */ new Map();
        for (const paper of this.paperIndex.values()) {
          sectorCounts.set(paper.sector, (sectorCounts.get(paper.sector) || 0) + 1);
        }
        let changed = false;
        const managed = [...this.settings.sectors];
        for (const sector of managed) {
          if (sector === "Other") continue;
          const hasPapers = sectorCounts.has(sector);
          const folderPath = `${baseFolder}/${sector}`;
          let folderExists = false;
          try {
            folderExists = await this.app.vault.adapter.exists(folderPath);
          } catch (_) {
          }
          if (!hasPapers && !folderExists) {
            this.settings.sectors = this.settings.sectors.filter((s) => s !== sector);
            if (this.settings.defaultSector === sector) {
              this.settings.defaultSector = "Other";
            }
            changed = true;
          }
        }
        if (changed) await saveSettings();
      }
      scheduleRebuild(delay = 300, rebuildAndRefresh) {
        this._rebuildPending = true;
        if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
        this._rebuildTimer = setTimeout(async () => {
          try {
            await rebuildAndRefresh();
          } finally {
            this._rebuildPending = false;
          }
        }, delay);
      }
      async updateMasterIndex() {
        const indexPath = `_papers_index.md`;
        const sectors = await this.getAvailableSectors();
        let indexContent = "# Master Paper Index\n\nThis file lists all research papers in the vault, grouped by sector.\n\n";
        const allPapers = Array.from(this.paperIndex.values());
        for (const sector of sectors) {
          indexContent += `## ${sector}

`;
          indexContent += `| Title | Authors | Year | Tags | 
`;
          indexContent += `| --- | --- | --- | --- | 
`;
          const sectorFiles = allPapers.filter((p) => p.sector === sector);
          sectorFiles.sort((a, b) => b.mtime - a.mtime);
          for (const paper of sectorFiles) {
            const fm = paper.frontmatter;
            const title = fm.title || paper.basename;
            const authors = normalizeAuthors(fm.authors) || "N/A";
            const year = fm.year || "N/A";
            const displayTags = formatTagsForIndex(fm.tags) || "";
            const pdfFileName = fm.pdf_file;
            let pdfCell = "N/A";
            if (pdfFileName) {
              const safePdf = String(pdfFileName).replace(/\\/g, "/");
              pdfCell = `[pdf link](${safePdf})`;
            }
            indexContent += `| [[${paper.basename}]] | ${authors} | ${year} | ${displayTags} | ${pdfCell} |
`;
          }
          indexContent += `
`;
        }
        const indexFile = this.app.vault.getAbstractFileByPath(indexPath);
        if (indexFile instanceof TFile2) {
          await this.app.vault.modify(indexFile, indexContent);
        } else {
          await this.app.vault.create(indexPath, indexContent);
        }
      }
      async processAllPapers(options) {
        const { commandName, processFn, shouldSkipFn } = options;
        try {
          if (!this.settings.summaryApiEndpoint || !this.settings.summaryApiModel || !this.settings.summaryApiKey) {
            new Notice3("\u274C Please configure LLM API settings first.");
            return;
          }
          new Notice3(`${commandName}...`);
          const paperFiles = Array.from(this.paperIndex.values());
          if (paperFiles.length === 0) {
            new Notice3("No paper files found to process.");
            return;
          }
          let processedCount = 0, skippedCount = 0, errorCount = 0;
          for (const paperData of paperFiles) {
            const paperFile = this.app.vault.getAbstractFileByPath(paperData.path);
            if (!(paperFile instanceof TFile2)) continue;
            try {
              const content = await this.app.vault.read(paperFile);
              if (await shouldSkipFn(content, paperData.frontmatter)) {
                skippedCount++;
                continue;
              }
              await processFn(paperFile, content);
              processedCount++;
            } catch (error) {
              errorCount++;
            }
          }
          const message = `${commandName} complete! Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`;
          new Notice3(message);
        } catch (error) {
          new Notice3(`Error during ${commandName}: ${error.message}`);
        }
      }
      async generateResumeForPapers(llmService) {
        await this.processAllPapers({
          commandName: "Resume Generation",
          shouldSkipFn: async (content, frontmatter) => /^\s*#{1,6}\s+(Resume|Summary)/im.test(content),
          processFn: async (paperFile, content) => {
            const fm = this.app.metadataCache.getFileCache(paperFile)?.frontmatter || {};
            let llmInput = content;
            const pdfFileRef = fm.pdf_file;
            if (pdfFileRef && this.pdfService) {
              try {
                let logicalPath = String(pdfFileRef);
                if (!logicalPath.includes("/") && paperFile.parent && paperFile.parent.path) {
                  logicalPath = `${paperFile.parent.path}/${logicalPath}`;
                }
                const effectivePath = await this.fileService.resolveLogicalToEffectivePath(logicalPath);
                const pdfTFile = this.app.vault.getAbstractFileByPath(effectivePath);
                if (pdfTFile) {
                  const extracted = await this.pdfService.extractTextFromPdf(pdfTFile);
                  if (extracted && extracted.length > 20) {
                    llmInput = extracted;
                  } else {
                    new Notice3(`\u274C PDF parsing yielded insufficient text for ${paperFile.basename}. Skipping resume generation.`);
                    return;
                  }
                } else {
                  new Notice3(`\u274C PDF file not found for ${paperFile.basename}. Skipping resume generation.`);
                  return;
                }
              } catch (err) {
                new Notice3(`\u274C Failed to parse PDF for ${paperFile.basename}. Skipping resume generation.`);
                return;
              }
            }
            const resume = await llmService.getSummary(llmInput);
            const paperPdfHeadingRegex = /^##\s+Paper PDF/im;
            const pdfEmbedRegex = /!\[\[.*?\.pdf\]\]/i;
            let newContent;
            const paperPdfMatch = content.match(paperPdfHeadingRegex);
            if (paperPdfMatch) {
              const insertPosition = content.search(paperPdfHeadingRegex);
              newContent = content.slice(0, insertPosition) + `# Resume

${resume}

` + content.slice(insertPosition);
            } else {
              const pdfMatch = content.match(pdfEmbedRegex);
              if (pdfMatch) {
                const insertPosition = content.indexOf(pdfMatch[0]);
                newContent = content.slice(0, insertPosition) + `# Resume

${resume}

` + content.slice(insertPosition);
              } else {
                newContent = content + `

# Resume

${resume}
`;
              }
            }
            await this.app.vault.modify(paperFile, newContent);
          }
        });
      }
      async generateTagsForPapers(llmService) {
        await this.processAllPapers({
          commandName: "Tag Generation",
          shouldSkipFn: async (content, frontmatter) => {
            const existingTags = normalizeTags(frontmatter.tags);
            const defaultTags = ["paper", "to-read"];
            return existingTags.some((tag) => !defaultTags.includes(tag));
          },
          processFn: async (paperFile, content) => {
            const generatedTags = await llmService.getTags(content);
            const tagsArray = generatedTags.split(",").map((tag) => tag.trim()).filter(Boolean);
            const defaultTags = ["paper", "to-read"];
            const combinedTags = [.../* @__PURE__ */ new Set([...defaultTags, ...tagsArray])];
            await this.app.fileManager.processFrontMatter(paperFile, (fm) => {
              fm.tags = combinedTags;
            });
          }
        });
      }
      async cleanAllResumes() {
        const baseFiles = Array.from(this.paperIndex.values());
        let modified = 0;
        for (const paperData of baseFiles) {
          const paperFile = this.app.vault.getAbstractFileByPath(paperData.path);
          if (!(paperFile instanceof TFile2)) continue;
          try {
            const content = await this.app.vault.read(paperFile);
            const resumeToPdfRegex = /# Resume([\s\S]*?)(?=!\[\[.*?\.pdf\]\])/g;
            if (resumeToPdfRegex.test(content)) {
              const newContent = content.replace(resumeToPdfRegex, "");
              await this.app.vault.modify(paperFile, newContent.trim() + "\n");
              modified++;
            }
          } catch (err) {
          }
        }
        new Notice3(`Cleaned resume sections in ${modified} files.`);
      }
    };
    module2.exports = PaperService2;
  }
});

// services/pdf-service.js
var require_pdf_service = __commonJS({
  "services/pdf-service.js"(exports2, module2) {
    "use strict";
    var { Notice: Notice3 } = require("obsidian");
    var PdfService2 = class {
      constructor(app, settings) {
        this.app = app;
        this.settings = settings;
        this.pdfjsLib = null;
      }
      async initializePdfJs() {
        if (this.pdfjsLib) {
          return true;
        }
        try {
          if (this.app && typeof this.app.loadPdfJs === "function") {
            try {
              this.pdfjsLib = await this.app.loadPdfJs();
              return true;
            } catch (e) {
            }
          }
          if (typeof window !== "undefined" && window.pdfjsLib) {
            this.pdfjsLib = window.pdfjsLib;
            return true;
          }
          const pdfFiles = this.app.vault.getFiles().filter((f) => f.extension === "pdf");
          if (pdfFiles.length > 0) {
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(pdfFiles[0]);
            await new Promise((resolve) => setTimeout(resolve, 2e3));
            if (leaf.view && leaf.view.renderer && leaf.view.renderer.pdfjs) {
              this.pdfjsLib = leaf.view.renderer.pdfjs;
              leaf.detach();
              return true;
            }
            leaf.detach();
          }
          return false;
        } catch (error) {
          return false;
        }
      }
      async extractTextFromPdf(pdfFile) {
        if (!pdfFile) throw new Error("No PDF file provided");
        try {
          const arrayBuffer = await this.app.vault.readBinary(pdfFile);
          let pdfjsLib = this.pdfjsLib;
          if (!pdfjsLib) {
            if (this.app && typeof this.app.loadPdfJs === "function") {
              try {
                pdfjsLib = await this.app.loadPdfJs();
                this.pdfjsLib = pdfjsLib;
              } catch (e) {
              }
            }
            if (!pdfjsLib && typeof window !== "undefined" && window.pdfjsLib) {
              pdfjsLib = window.pdfjsLib;
              this.pdfjsLib = pdfjsLib;
            }
            if (!pdfjsLib && this.app.workspace) {
              try {
                const pdfViews = this.app.workspace.getLeavesOfType("pdf");
                if (pdfViews.length > 0) {
                  const pdfView = pdfViews[0].view;
                  if (pdfView && pdfView.renderer && pdfView.renderer.pdfjs) {
                    pdfjsLib = pdfView.renderer.pdfjs;
                    this.pdfjsLib = pdfjsLib;
                  }
                }
              } catch (e) {
              }
            }
            if (!pdfjsLib) {
              try {
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(pdfFile);
                await new Promise((resolve) => setTimeout(resolve, 1e3));
                if (leaf.view && leaf.view.renderer && leaf.view.renderer.pdfjs) {
                  pdfjsLib = leaf.view.renderer.pdfjs;
                  this.pdfjsLib = pdfjsLib;
                }
                leaf.detach();
              } catch (e) {
              }
            }
          }
          if (!pdfjsLib) {
            const errorMsg = "PDF.js not available. Please open a PDF file in Obsidian first to initialize PDF.js, then try again.";
            throw new Error(errorMsg);
          }
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          let fullText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map((item) => item && item.str ? item.str : "").join(" ");
            fullText += `

---- Page ${i} ----

` + pageText;
          }
          try {
            if (pdf && typeof pdf.destroy === "function") pdf.destroy();
          } catch (_) {
          }
          return fullText.trim();
        } catch (error) {
          throw error;
        }
      }
    };
    module2.exports = PdfService2;
  }
});

// ui/paper-explorer-view.js
var require_paper_explorer_view = __commonJS({
  "ui/paper-explorer-view.js"(exports2, module2) {
    "use strict";
    var { ItemView, TFile: TFile2 } = require("obsidian");
    var PAPER_EXPLORER_VIEW_TYPE2 = "paper-explorer-view";
    var PaperExplorerView2 = class extends ItemView {
      constructor(leaf, settings, plugin) {
        super(leaf);
        this.settings = settings;
        this.plugin = plugin;
      }
      getViewType() {
        return PAPER_EXPLORER_VIEW_TYPE2;
      }
      getDisplayText() {
        return "Research Papers";
      }
      getIcon() {
        return "library";
      }
      async onOpen() {
        try {
          if (!this.plugin || !this.plugin.paperService.paperIndex || this.plugin.paperService.paperIndex.size === 0) {
            await this.plugin.rebuildAndRefresh();
          }
        } catch (e) {
        }
        this.renderView();
      }
      async renderView() {
        const container = this.contentEl || this.containerEl.children[1];
        container.empty();
        const header = container.createEl("div", { cls: "paper-explorer-header" });
        this.createHomeViewerButton(header);
        this.createAddPaperButton(header);
        const layout = container.createEl("div", { cls: "paper-explorer-layout" });
        const sidebar = layout.createEl("div", { cls: "paper-explorer-sidebar" });
        const contentArea = layout.createEl("div", { cls: "paper-explorer-content" });
        await this.createSectorSelector(sidebar);
        await this.renderPaperTable(contentArea);
      }
      createHomeViewerButton(header) {
        const viewerBtn = document.createElement("button");
        viewerBtn.style.border = "none";
        viewerBtn.style.background = "none";
        viewerBtn.style.cursor = "pointer";
        viewerBtn.style.padding = "0";
        viewerBtn.style.margin = "0";
        viewerBtn.style.color = "var(--text-normal)";
        viewerBtn.style.boxShadow = "none";
        viewerBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg><span style="margin-left:4px;">Open Home Viewer</span>';
        viewerBtn.style.fontSize = "0.75rem";
        viewerBtn.title = "Open Home Viewer.md";
        viewerBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          const viewerPath = "/_papers_index.md";
          let file = this.plugin.app.vault.getAbstractFileByPath(viewerPath);
          if (!file) {
            file = await this.plugin.app.vault.create(viewerPath, "# Viewer\n");
          }
          if (file instanceof TFile2) {
            const leaf = this.plugin.app.workspace.getLeaf(false);
            await leaf.openFile(file);
          }
        });
        header.appendChild(viewerBtn);
      }
      createAddPaperButton(header) {
        const buttonContainer = header.createEl("div", { cls: "button-container" });
        buttonContainer.style.display = "flex";
        buttonContainer.style.justifyContent = "center";
        const addButton = buttonContainer.createEl("button", { text: "+ Add Paper" });
        addButton.style.fontSize = "1em";
        addButton.style.padding = "10px 20px";
        addButton.style.borderRadius = "5px";
        addButton.style.border = "none";
        addButton.style.cursor = "pointer";
        addButton.style.marginBottom = "10px";
        addButton.addClass("mod-cta");
        addButton.addEventListener("click", () => {
          this.plugin.openAddPaperModal();
        });
      }
      async createSectorSelector(sidebar) {
        const sectors = await this.plugin.paperService.getAvailableSectors();
        const sectorWrap = sidebar.createEl("div", { cls: "sector-select-wrap" });
        sectorWrap.style.width = "100%";
        sectorWrap.createEl("hr");
        const select = sectorWrap.createEl("select", { cls: "sector-select" });
        select.style.marginTop = "24px";
        const space = sectorWrap.createEl("div", { cls: "sector-select-space" });
        space.style.height = "24px";
        select.style.width = "100%";
        select.createEl("option", { value: "All", text: "All Sectors" });
        for (const s of sectors) {
          select.createEl("option", { value: s, text: s });
        }
        const active = this.plugin._activeSector || "All";
        if (!sectors.includes(active) && active !== "All") {
          this.plugin._activeSector = "All";
        }
        try {
          select.value = this.plugin._activeSector || "All";
        } catch (e) {
          select.value = "All";
        }
        select.addEventListener("change", (ev) => {
          const val = ev.target.value;
          this.plugin._activeSector = val === "All" ? "All" : val;
          this.renderView();
        });
      }
      async renderPaperTable(contentArea) {
        const allPapers = Array.from(this.plugin.paperService.paperIndex.values());
        const paperNotes = allPapers.filter((paper) => {
          if (this.plugin._activeSector && this.plugin._activeSector !== "All") {
            return paper.sector === this.plugin._activeSector;
          }
          return true;
        });
        if (paperNotes.length === 0) {
          contentArea.createEl("p", { text: "No papers found. Click 'Add Paper' to start." });
          return;
        }
        const table = contentArea.createEl("table", { cls: "paper-index-table" });
        table.style.width = "100%";
        table.style.borderCollapse = "separate";
        table.style.borderSpacing = "0 24px";
        const thead = table.createEl("thead");
        const headerRow = thead.createEl("tr");
        headerRow.createEl("th", { text: "Title" });
        const tbody = table.createEl("tbody");
        paperNotes.sort((a, b) => b.mtime - a.mtime);
        for (const paper of paperNotes) {
          const title = paper.frontmatter.title || paper.basename;
          const row = tbody.createEl("tr");
          row.style.cursor = "pointer";
          row.style.marginTop = "4px";
          const titleCell = row.createEl("td");
          titleCell.setText(title);
          titleCell.addClass("paper-title-cell");
          titleCell.addEventListener("click", () => {
            this.app.workspace.openLinkText(paper.path, "", false);
          });
          this.createDeleteButton(row, paper);
        }
      }
      createDeleteButton(row, paper) {
        const deleteCell = row.createEl("td");
        const deleteBtn = deleteCell.createEl("button", { text: "\xD7" });
        deleteBtn.addClass("paper-delete-btn");
        deleteBtn.title = "Delete paper note and associated PDF";
        deleteBtn.style.cursor = "pointer";
        deleteBtn.style.background = "transparent";
        deleteBtn.style.border = "none";
        deleteBtn.style.color = "#c94b4b";
        deleteBtn.style.fontSize = "1.1em";
        deleteBtn.style.padding = "4px 8px";
        deleteBtn.style.boxShadow = "none";
        deleteBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const fileToDelete = this.app.vault.getAbstractFileByPath(paper.path);
          if (fileToDelete instanceof TFile2) {
            await this.plugin.deletePaper(fileToDelete);
          } else {
            new Notice("Error: Could not find file to delete.");
            this.plugin.rebuildAndRefresh();
          }
        });
      }
      async onClose() {
      }
    };
    module2.exports = { PaperExplorerView: PaperExplorerView2, PAPER_EXPLORER_VIEW_TYPE: PAPER_EXPLORER_VIEW_TYPE2 };
  }
});

// ui/confirm-modal.js
var require_confirm_modal = __commonJS({
  "ui/confirm-modal.js"(exports2, module2) {
    "use strict";
    var { Modal } = require("obsidian");
    var ConfirmModal = class extends Modal {
      constructor(app, message, onConfirm) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.createEl("p", { text: this.message });
        const controls = contentEl.createEl("div", { cls: "modal-buttons" });
        const confirmBtn = controls.createEl("button", { text: "Confirm" });
        const cancelBtn = controls.createEl("button", { text: "Cancel" });
        confirmBtn.addEventListener("click", () => {
          try {
            if (typeof this.onConfirm === "function") this.onConfirm();
          } finally {
            this.close();
          }
        });
        cancelBtn.addEventListener("click", () => this.close());
      }
      onClose() {
      }
    };
    module2.exports = { ConfirmModal };
  }
});

// ui/chat-utils.js
var require_chat_utils = __commonJS({
  "ui/chat-utils.js"(exports2, module2) {
    "use strict";
    function generateDiscussionId() {
      return "discussion_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    }
    function safeToString(v) {
      if (v == null) return "";
      if (typeof v === "string") return v;
      try {
        return String(v);
      } catch (_) {
        return "";
      }
    }
    function normalizeMessage(m) {
      const safeRole = ["user", "assistant", "system"].includes(m?.role) ? m.role : "assistant";
      const rawContent = m?.content;
      const content = typeof rawContent === "string" ? rawContent : safeToString(rawContent);
      let ts = m?.timestamp;
      let dateObj;
      if (ts instanceof Date) {
        dateObj = ts;
      } else if (typeof ts === "string" && ts) {
        const parsed = new Date(ts);
        dateObj = isNaN(parsed.getTime()) ? /* @__PURE__ */ new Date() : parsed;
      } else {
        dateObj = /* @__PURE__ */ new Date();
      }
      return {
        id: m?.id ?? Date.now() + Math.random(),
        role: safeRole,
        content,
        timestamp: dateObj,
        isTyping: false
      };
    }
    module2.exports = { generateDiscussionId, normalizeMessage, safeToString };
  }
});

// ui/notifications.js
var require_notifications = __commonJS({
  "ui/notifications.js"(exports2, module2) {
    "use strict";
    var { Notice: Notice3 } = require("obsidian");
    function notify(message) {
      try {
        new Notice3(message);
      } catch (e) {
        console.warn("Notice failed:", e);
      }
    }
    function notifyError(message, err) {
      try {
        new Notice3(message);
      } catch (e) {
        console.warn("Notice failed:", e);
      }
      if (err) console.error(message, err);
    }
    function notifyInfo(message) {
      notify(message);
    }
    module2.exports = { notify, notifyError, notifyInfo };
  }
});

// ui/message-renderer.js
var require_message_renderer = __commonJS({
  "ui/message-renderer.js"(exports2, module2) {
    "use strict";
    var { notifyError } = require_notifications();
    function renderMessage(container, message, options = {}) {
      const wrapper = container.createEl("div", { cls: `chat-message-wrapper ${message.role}-message` });
      const header = wrapper.createEl("div", { cls: "chat-message-header" });
      header.createEl("div", { cls: "chat-message-role", text: message.role === "user" ? "You" : message.role === "assistant" ? "Assistant" : "Assistant" });
      const tsText = message.timestamp instanceof Date ? message.timestamp.toLocaleTimeString() : new Date(message.timestamp).toLocaleTimeString();
      header.createEl("div", { cls: "chat-message-timestamp", text: tsText });
      const contentEl = wrapper.createEl("div", { cls: "chat-message-content" });
      if ((message.role === "system" || message.role === "assistant") && typeof message.content === "string" && message.content.length > 240) {
        const shortText = message.content.slice(0, 220) + "...";
        const collapsed = contentEl.createEl("div", { cls: "collapsed-message" });
        collapsed.createEl("div", { cls: "collapsed-text", text: shortText });
        const toggle = collapsed.createEl("button", { cls: "collapse-toggle", text: "Show more" });
        const full = collapsed.createEl("div", { cls: "full-text", text: message.content });
        full.style.display = "none";
        toggle.addEventListener("click", () => {
          const isHidden = full.style.display === "none";
          full.style.display = isHidden ? "block" : "none";
          collapsed.querySelector(".collapsed-text").style.display = isHidden ? "none" : "block";
          toggle.textContent = isHidden ? "Show less" : "Show more";
        });
      } else {
        contentEl.createEl("div", { cls: "message-text", text: message.content });
      }
      if (message.isTyping) wrapper.addClass("typing");
      wrapper.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        try {
          if (options.ConfirmModal && typeof options.ConfirmModal === "function") {
            const modal = new options.ConfirmModal(options.app, "Delete this message?", () => {
              if (typeof options.onDelete === "function") options.onDelete(message.id);
            });
            modal.open();
          } else if (typeof options.onDelete === "function") {
            options.onDelete(message.id);
          }
        } catch (err) {
          notifyError("Failed to show delete confirm, deleting directly", err);
          if (typeof options.onDelete === "function") options.onDelete(message.id);
        }
      });
      return wrapper;
    }
    module2.exports = { renderMessage };
  }
});

// ui/services/chat-state-service.js
var require_chat_state_service = __commonJS({
  "ui/services/chat-state-service.js"(exports2, module2) {
    "use strict";
    var { TFile: TFile2 } = require("obsidian");
    var { normalizeMessage } = require_chat_utils();
    var ChatStateService = class {
      constructor(host) {
        this.host = host;
      }
      // Message operations
      addMessageToHistory(role, content, isTyping = false) {
        if (!content || typeof content !== "string" || content.trim() === "") return null;
        if (!role || !["user", "assistant", "system"].includes(role)) role = "assistant";
        const hist = this.host.chatHistory;
        if ((role === "system" || role === "assistant") && hist.length > 0) {
          const last = hist[hist.length - 1];
          if (last && last.role === role && last.content === content && !last.isTyping) {
            return last.id;
          }
        }
        const messageId = Date.now() + Math.random();
        hist.push({ id: messageId, role, content, timestamp: /* @__PURE__ */ new Date(), isTyping });
        this.host.renderChatHistory();
        return messageId;
      }
      updateMessageInHistory(messageId, newContent) {
        const msg = this.host.chatHistory.find((m) => m.id === messageId);
        if (msg) {
          msg.content = newContent;
          msg.isTyping = false;
          this.host.renderChatHistory();
          this.host.saveConversation();
        }
      }
      deleteMessage(messageId) {
        const idx = this.host.chatHistory.findIndex((m) => m.id === messageId);
        if (idx === -1) return;
        this.host._lastDeletedMessage = { message: this.host.chatHistory[idx], index: idx };
        this.host.chatHistory = this.host.chatHistory.filter((m) => m.id !== messageId);
        this.host.renderChatHistory();
        this.host.saveConversation();
      }
      // Discussion helpers
      createDiscussion(id, notePath, title = null) {
        const h = this.host;
        return {
          id,
          title: title || h.generateDiscussionTitle(),
          notePath,
          noteName: notePath ? notePath.split("/").pop().replace(".md", "") : "Unknown",
          state: "DRAFT",
          startTime: /* @__PURE__ */ new Date(),
          lastUpdated: /* @__PURE__ */ new Date(),
          messageCount: h.chatHistory.length,
          history: [...h.chatHistory],
          userMessageHistory: [...h.userMessageHistory],
          includePdfInContext: h.includePdfInContext,
          includeNoteInContext: h.includeNoteInContext,
          includedNotes: this.serializeIncludedNotes()
        };
      }
      serializeIncludedNotes() {
        const out = [];
        for (const [path, data] of this.host.includedNotes.entries()) {
          out.push({
            path,
            name: data.name || path,
            includeInContext: !!data.includeInContext,
            content: typeof data.content === "string" ? data.content : ""
          });
        }
        return out;
      }
      deserializeIncludedNotes(serializedNotes) {
        this.host.includedNotes.clear();
        if (Array.isArray(serializedNotes)) {
          for (const note of serializedNotes) {
            this.host.includedNotes.set(note.path, {
              name: note.name || note.path,
              content: note.content || "",
              includeInContext: note.includeInContext !== false
            });
          }
        }
      }
      validateDiscussion(d) {
        return d && typeof d.id === "string" && typeof d.notePath === "string" && Array.isArray(d.history);
      }
      normalizeHistory(history) {
        return (history || []).map((m) => normalizeMessage(m)).filter((m) => {
          const trimmed = (m.content || "").trim();
          return trimmed.length > 0 && !/^(💭\s*)?Thinking\.\.\.$/i.test(trimmed);
        });
      }
      async loadIncludedNoteEntry(path, file) {
        const h = this.host;
        try {
          const f = file instanceof TFile2 ? file : h.app.vault.getAbstractFileByPath(path);
          if (!(f instanceof TFile2)) return;
          const content = await h.app.vault.read(f);
          h.includedNotes.set(path, { name: f.basename, content, includeInContext: true });
        } catch (err) {
          console.warn("Failed to load included note", path, err);
          this.addMessageToHistory("system", `Failed to include note: ${path}`);
        }
      }
    };
    module2.exports = { ChatStateService };
  }
});

// ui/services/chat-persistence-service.js
var require_chat_persistence_service = __commonJS({
  "ui/services/chat-persistence-service.js"(exports2, module2) {
    "use strict";
    var { normalizeMessage } = require_chat_utils();
    var ChatPersistenceService = class {
      constructor(host) {
        this.host = host;
      }
      async saveConversation() {
        const h = this.host;
        if (!h.currentNoteFile) return;
        if (h.currentDiscussionId && h.chatHistory.length > 0) {
          await this._saveCurrentDiscussion();
        }
        h.conversations.set(h.currentNoteFile.path, {
          history: h.chatHistory.map((m) => ({
            ...m,
            isTyping: false,
            timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp ? new Date(m.timestamp).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
          })),
          userMessageHistory: [...h.userMessageHistory],
          includePdfInContext: h.includePdfInContext,
          includeNoteInContext: h.includeNoteInContext,
          includedNotes: Array.from(h.includedNotes.entries()).map(([p, e]) => ({
            path: p,
            name: e.name,
            includeInContext: !!e.includeInContext,
            content: typeof e.content === "string" ? e.content : ""
          })),
          lastUpdated: /* @__PURE__ */ new Date(),
          currentDiscussionId: h.currentDiscussionId
        });
        if (h.plugin.settings) {
          try {
            const conversationsData = {};
            for (const [path, conversation] of h.conversations.entries()) {
              const trimmedHistory = (conversation.history || []).slice(-50).map((m) => ({
                ...m,
                isTyping: false,
                timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp ? new Date(m.timestamp).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
              }));
              conversationsData[path] = { ...conversation, history: trimmedHistory };
            }
            for (const [path, conv] of Object.entries(conversationsData)) {
              if (!conv.includedNotes && h.currentNoteFile && path === h.currentNoteFile.path) {
                conv.includedNotes = Array.from(h.includedNotes.entries()).map(([p, e]) => ({ path: p, name: e.name, includeInContext: !!e.includeInContext, content: e.content }));
              } else {
                conv.includedNotes = conv.includedNotes || [];
              }
            }
            const discussionsData = {};
            for (const [path, noteDiscussions] of h.discussions.entries()) {
              discussionsData[path] = {};
              if (noteDiscussions instanceof Map) {
                for (const [discussionId, discussionData] of noteDiscussions.entries()) {
                  const trimmedDiscussion = { ...discussionData, history: (discussionData.history || []).slice(-50) };
                  discussionsData[path][discussionId] = trimmedDiscussion;
                }
              } else if (noteDiscussions && typeof noteDiscussions === "object") {
                for (const [discussionId, discussionData] of Object.entries(noteDiscussions)) {
                  const trimmedDiscussion = { ...discussionData, history: (discussionData.history || []).slice(-50) };
                  discussionsData[path][discussionId] = trimmedDiscussion;
                }
              }
            }
            const trimmedGlobalHistory = h.globalDiscussionHistory.slice(0, 100).map((d) => ({ ...d, history: (d.history || []).slice(-20) }));
            h.plugin.settings.chatConversations = conversationsData;
            h.plugin.settings.discussions = discussionsData;
            h.plugin.settings.globalDiscussionHistory = trimmedGlobalHistory;
            await h.plugin.saveSettings();
            h._lastSavedAt = /* @__PURE__ */ new Date();
          } catch (error) {
            console.warn("Failed to save chat conversations and discussions:", error);
            const { notifyError } = require_notifications();
            notifyError("Failed to save chat conversations. Check console for details.", error);
          }
        }
      }
      async _saveCurrentDiscussion() {
        const h = this.host;
        if (!h.currentNoteFile || !h.currentDiscussionId || h.chatHistory.length === 0) return;
        if (h._saveInProgress) {
          h._pendingSave = true;
          return;
        }
        h._saveInProgress = true;
        try {
          const discussionData = h.stateSvc.createDiscussion(h.currentDiscussionId, h.currentNoteFile.path);
          discussionData.state = "SAVED";
          discussionData.lastUpdated = /* @__PURE__ */ new Date();
          discussionData.history = h.chatHistory.map((m) => ({
            ...m,
            isTyping: false,
            timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp || Date.now()).toISOString()
          })).filter((m) => {
            const trimmed = (m.content || "").trim();
            return trimmed.length > 0 && !/^(💭\s*)?Thinking\.\.\.$/i.test(trimmed);
          });
          if (!h.discussions.has(h.currentNoteFile.path) || !(h.discussions.get(h.currentNoteFile.path) instanceof Map)) {
            h.discussions.set(h.currentNoteFile.path, /* @__PURE__ */ new Map());
          }
          const noteMap = h.discussions.get(h.currentNoteFile.path);
          discussionData.messageCount = (discussionData.history || []).length;
          noteMap.set(h.currentDiscussionId, discussionData);
          h._addDiscussionToNote(h.currentDiscussionId, h.currentNoteFile.path);
          h.discussionIndex.set(h.currentDiscussionId, { notePath: h.currentNoteFile.path, lastUpdated: discussionData.lastUpdated });
          try {
            const summary = {
              id: discussionData.id,
              title: discussionData.title || "Untitled Discussion",
              noteFile: discussionData.notePath || h.currentNoteFile.path,
              noteName: discussionData.noteName || (h.currentNoteFile ? h.currentNoteFile.basename : "Unknown"),
              startTime: discussionData.startTime || /* @__PURE__ */ new Date(),
              lastUpdated: discussionData.lastUpdated || /* @__PURE__ */ new Date(),
              messageCount: discussionData.messageCount || (discussionData.history || []).length,
              history: (discussionData.history || []).slice(-3)
            };
            const existingIndex = h.globalDiscussionHistory.findIndex((d) => d.id === summary.id);
            if (existingIndex !== -1) h.globalDiscussionHistory[existingIndex] = summary;
            else h.globalDiscussionHistory.unshift(summary);
            if (h.globalDiscussionHistory.length > 100) h.globalDiscussionHistory = h.globalDiscussionHistory.slice(0, 100);
          } catch (e) {
            console.warn("Failed to update globalDiscussionHistory", e);
          }
        } finally {
          h._saveInProgress = false;
          if (h._pendingSave) {
            h._pendingSave = false;
            await this._saveCurrentDiscussion();
          }
        }
      }
      async loadConversation() {
        const h = this.host;
        if (!h.currentNoteFile) return;
        const filePath = h.currentNoteFile.path;
        if (h.plugin.settings?.discussions) {
          try {
            for (const [path, noteDiscussions2] of Object.entries(h.plugin.settings.discussions)) {
              if (!h.discussions.has(path)) h.discussions.set(path, /* @__PURE__ */ new Map());
              const discussionMap = h.discussions.get(path);
              for (const [discussionId, discussionData] of Object.entries(noteDiscussions2)) {
                discussionMap.set(discussionId, discussionData);
              }
            }
          } catch (error) {
            console.warn("Failed to load discussions from settings:", error);
          }
        }
        if (h.plugin.settings?.globalDiscussionHistory) {
          try {
            h.globalDiscussionHistory = [...h.plugin.settings.globalDiscussionHistory || []];
          } catch (error) {
            console.warn("Failed to load global discussion history:", error);
          }
        }
        const noteDiscussions = h.discussions.get(filePath);
        if (noteDiscussions && noteDiscussions.size > 0) {
          const discussionsArray = Array.from(noteDiscussions.values());
          const mostRecent = discussionsArray.sort((a, b) => new Date(b.lastUpdated || b.startTime) - new Date(a.lastUpdated || a.startTime))[0];
          if (mostRecent) {
            h.loadDiscussion(mostRecent.id, filePath);
            return;
          }
        }
        if (h.conversations.has(filePath)) {
          const conversation = h.conversations.get(filePath);
          h.chatHistory = this._normalize(conversation.history);
          h.userMessageHistory = [...conversation.userMessageHistory || []];
          h.includePdfInContext = conversation.includePdfInContext !== void 0 ? !!conversation.includePdfInContext : true;
          h.includeNoteInContext = conversation.includeNoteInContext !== void 0 ? !!conversation.includeNoteInContext : true;
          h.currentDiscussionId = conversation.currentDiscussionId;
          try {
            if (conversation.includedNotes instanceof Map) h.includedNotes = new Map(conversation.includedNotes);
            else if (Array.isArray(conversation.includedNotes)) h.includedNotes = new Map((conversation.includedNotes || []).map((it) => [it.path, { name: it.name || it.path, content: it.content || "", includeInContext: it.includeInContext !== false }]));
            else h.includedNotes = /* @__PURE__ */ new Map();
          } catch (_) {
            h.includedNotes = /* @__PURE__ */ new Map();
          }
          h.renderChatHistory();
          h.updateNoteInfo();
          return;
        }
        if (h.plugin.settings?.chatConversations?.[filePath]) {
          const conversation = h.plugin.settings.chatConversations[filePath];
          const normalizedHistory = this._normalize(conversation.history);
          h.chatHistory = normalizedHistory;
          h.userMessageHistory = conversation.userMessageHistory || [];
          h.currentDiscussionId = conversation.currentDiscussionId;
          h.conversations.set(filePath, {
            ...conversation,
            history: normalizedHistory,
            includedNotes: (conversation.includedNotes || []).reduce((map, it) => {
              try {
                if (it && it.path) map.set(it.path, { name: it.name || it.path, content: it.content || "", includeInContext: it.includeInContext !== false });
              } catch (e) {
              }
              return map;
            }, /* @__PURE__ */ new Map())
          });
          h.includePdfInContext = conversation.includePdfInContext !== void 0 ? !!conversation.includePdfInContext : true;
          h.includeNoteInContext = conversation.includeNoteInContext !== void 0 ? !!conversation.includeNoteInContext : true;
          h.renderChatHistory();
          h.updateNoteInfo();
          return;
        }
        h.chatHistory = [];
        h.userMessageHistory = [];
        h.messageHistoryIndex = -1;
        h.currentDiscussionId = null;
        h.includePdfInContext = true;
        h.includeNoteInContext = true;
        h.includedNotes = /* @__PURE__ */ new Map();
        h.renderChatHistory();
      }
      _normalize(history) {
        return (history || []).map((m) => normalizeMessage(m)).filter((m) => {
          const t = (m.content || "").trim();
          return t.length > 0 && !/^(💭\s*)?Thinking\.\.\.$/i.test(t);
        });
      }
      saveAssistantResponseToPath(notePath, discussionId, messageObj) {
        const h = this.host;
        try {
          if (!h.conversations.has(notePath)) {
            h.conversations.set(notePath, { history: [], userMessageHistory: [], includePdfInContext: true, includeNoteInContext: true, includedNotes: [] });
          }
          const conv = h.conversations.get(notePath);
          conv.history = conv.history || [];
          conv.history.push(messageObj);
          if (discussionId) {
            if (!h.discussions.has(notePath)) h.discussions.set(notePath, /* @__PURE__ */ new Map());
            const noteDiscussions = h.discussions.get(notePath);
            if (!noteDiscussions.has(discussionId)) {
              noteDiscussions.set(discussionId, {
                id: discussionId,
                title: "Orphaned discussion",
                noteFile: notePath,
                noteName: notePath.split("/").pop(),
                startTime: /* @__PURE__ */ new Date(),
                lastUpdated: /* @__PURE__ */ new Date(),
                messageCount: 1,
                history: [messageObj],
                userMessageHistory: []
              });
            } else {
              const d = noteDiscussions.get(discussionId);
              d.history = d.history || [];
              d.history.push(messageObj);
              d.lastUpdated = /* @__PURE__ */ new Date();
              d.messageCount = (d.history || []).length;
              noteDiscussions.set(discussionId, d);
            }
          }
          if (h.plugin?.settings) {
            try {
              const conversationsObj = {};
              for (const [p, c] of h.conversations.entries()) {
                conversationsObj[p] = { ...c, history: (c.history || []).slice(-50) };
              }
              h.plugin.settings.chatConversations = conversationsObj;
              h.plugin.saveSettings();
            } catch (e) {
              console.warn("Failed to persist orphaned response to settings", e);
            }
          }
        } catch (e) {
          console.error("Error saving assistant response to path", notePath, e);
          throw e;
        }
      }
    };
    module2.exports = { ChatPersistenceService };
  }
});

// ui/chat-panel-styles.js
var require_chat_panel_styles = __commonJS({
  "ui/chat-panel-styles.js"(exports2, module2) {
    "use strict";
    var chatPanelStyles = `
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
    module2.exports = chatPanelStyles;
  }
});

// ui/services/chat-ui-helpers.js
var require_chat_ui_helpers = __commonJS({
  "ui/services/chat-ui-helpers.js"(exports2, module2) {
    "use strict";
    var { ConfirmModal } = require_confirm_modal();
    var { renderMessage } = require_message_renderer();
    var { notify } = require_notifications();
    var ChatUIHelpers = class {
      constructor(host) {
        this.host = host;
      }
      renderChatHistory() {
        const h = this.host;
        if (!h.chatMessagesEl) return;
        h.chatMessagesEl.empty();
        h.chatHistory.forEach((message) => {
          renderMessage(h.chatMessagesEl, message, {
            app: h.app,
            ConfirmModal,
            onDelete: (id) => {
              h.deleteMessage(id);
              notify("Message deleted");
            }
          });
        });
        if (!h.isUserScrolling) h.chatMessagesEl.scrollTop = h.chatMessagesEl.scrollHeight;
      }
      updateNoteInfo() {
        const h = this.host;
        const noteInfoEl = h.contentEl.querySelector(".chat-note-info");
        if (!noteInfoEl) return;
        noteInfoEl.empty();
        if (h.currentNoteFile) {
          const hasPdf = h.currentPdfContent.length > 0;
          const isPdf = h.currentNoteFile.extension === "pdf";
          const paperData = !isPdf ? h.plugin.paperService?.paperIndex?.get(h.currentNoteFile.path) : null;
          let pdfFile = null;
          if (isPdf) {
            pdfFile = h.currentNoteFile.path;
          } else if (paperData && paperData.frontmatter) {
            pdfFile = paperData.frontmatter.pdf_file || paperData.frontmatter.pdf || paperData.frontmatter.pdf_path || paperData.frontmatter.pdfPath || null;
          } else {
            try {
              const fm = h.app.metadataCache.getFileCache(h.currentNoteFile)?.frontmatter;
              if (fm) pdfFile = fm.pdf_file || fm.pdf || fm.pdf_path || fm.pdfPath || null;
            } catch (_) {
            }
          }
          const wrapper = noteInfoEl.createEl("div", { cls: "chat-current-note" });
          wrapper.createEl("div", { cls: "note-name", text: h.currentNoteFile.basename + (isPdf ? " (PDF)" : "") });
          const status = wrapper.createEl("div", { cls: "note-status" });
          if (!isPdf) {
            status.createSpan({ text: "\u{1F4DD} " });
            const noteBtn = status.createEl("button", {
              cls: `note-toggle-button ${h.includeNoteInContext ? "on" : "off"}`,
              attr: { title: h.includeNoteInContext ? "Click to exclude Note from LLM context" : "Click to include Note in LLM context" }
            });
            noteBtn.textContent = `Note (${h.currentNoteContent.length} chars)`;
            noteBtn.addEventListener("click", async () => {
              h.includeNoteInContext = !h.includeNoteInContext;
              await h.saveConversation();
              h.updateNoteInfo();
            });
          } else {
            status.createSpan({ text: `\u{1F4C4} PDF (${h.currentPdfContent.length} chars)` });
          }
          if (hasPdf && !isPdf) {
            status.createSpan({ text: " \u2022 " });
            const pdfBtn = status.createEl("button", {
              cls: `pdf-toggle-button ${h.includePdfInContext ? "on" : "off"}`,
              attr: { title: h.includePdfInContext ? "Click to exclude PDF from LLM context" : "Click to include PDF in LLM context" }
            });
            pdfBtn.textContent = `\u{1F4CB} PDF file (${h.currentPdfContent.length} chars)`;
            pdfBtn.addEventListener("click", async () => {
              h.includePdfInContext = !h.includePdfInContext;
              await h.saveConversation();
              h.updateNoteInfo();
            });
          } else if (pdfFile && h.pdfExtractionError) {
            status.createSpan({ text: " \u2022 " });
            if (h.pdfExtractionError.includes("PDF.js not available")) {
              status.createSpan({ text: "\u26A0\uFE0F PDF found but PDF.js not loaded - try opening a PDF file first" });
            } else {
              status.createSpan({ text: `\u26A0\uFE0F PDF extraction failed: ${h.pdfExtractionError}` });
            }
          } else if (pdfFile) {
            status.createSpan({ text: " \u2022 " });
            status.createSpan({ text: isPdf ? "\u{1F4C4} PDF loaded" : `\u26A0\uFE0F PDF file found but not loaded: ${pdfFile}` });
          } else {
            status.createSpan({ text: " \u2022 No PDF file in frontmatter" });
          }
          const statusRow = wrapper.createEl("div", { cls: "chat-status-row" });
          if (h._pdfExtractionInProgress) {
            statusRow.createEl("span", { text: "\u{1F504} Extracting PDF..." });
          } else if (h.pdfExtractionError) {
            statusRow.createEl("span", { text: `\u26A0\uFE0F PDF error: ${h.pdfExtractionError}` });
          }
          if (h._lastSavedAt) {
            try {
              statusRow.createEl("span", { text: ` \u2022 Last saved: ${h._lastSavedAt.toLocaleString()}` });
            } catch (e) {
            }
          }
        } else {
          const noNote = noteInfoEl.createEl("div", { cls: "chat-no-note" });
          noNote.createEl("div", { cls: "no-note-message", text: "No active note" });
          noNote.createEl("div", { cls: "no-note-help", text: "Open a markdown file to start chatting about it" });
        }
        if (this.host.includedNotes.size > 0) {
          const includedWrapper = noteInfoEl.createEl("div", { cls: "chat-included-notes" });
          for (const [path, entry] of this.host.includedNotes.entries()) {
            const row = includedWrapper.createEl("div", { cls: "included-note-row" });
            row.createEl("div", { cls: "included-note-name", text: entry.name || path });
            const controls = row.createEl("div", { cls: "included-note-controls" });
            const toggleBtn = controls.createEl("button", {
              cls: `pdf-toggle-button ${entry.includeInContext ? "on" : "off"}`,
              attr: { title: entry.includeInContext ? "Exclude this note from context" : "Include this note in context" }
            });
            toggleBtn.textContent = entry.name || path;
            toggleBtn.addEventListener("click", async () => {
              entry.includeInContext = !entry.includeInContext;
              this.host.includedNotes.set(path, entry);
              await this.host.saveConversation();
              this.host.updateNoteInfo();
            });
            if (!entry.includeInContext) {
              this.host.includedNotes.delete(path);
              this.host.updateNoteInfo();
            }
          }
        }
      }
      addStyles() {
        const styleId = "chat-panel-styles";
        if (document.getElementById(styleId)) return;
        const style = document.createElement("style");
        style.id = styleId;
        try {
          style.textContent = require_chat_panel_styles();
        } catch (e) {
          style.textContent = ".chat-panel-container { padding: 8px; }";
          console.warn("Fallback styles", e);
        }
        document.head.appendChild(style);
      }
      renderDiscussionHistory() {
        const h = this.host;
        if (!h.discussionHistoryPanel) return;
        if (h.showingDiscussionHistory) {
          h.discussionHistoryPanel.style.display = "block";
          h.discussionHistoryPanel.empty();
          const header = h.discussionHistoryPanel.createEl("div", { cls: "history-panel-header" });
          header.createEl("h4", { text: "Discussion History for this Note" });
          const closeBtn = header.createEl("button", { cls: "history-close-button", text: "\u2715" });
          closeBtn.addEventListener("click", () => {
            h.showingDiscussionHistory = false;
            h.discussionHistoryPanel.style.display = "none";
          });
          const content = h.discussionHistoryPanel.createEl("div", { cls: "history-panel-content" });
          if (!h.currentNoteFile) {
            content.createEl("div", { text: "No note selected", cls: "history-empty" });
            return;
          }
          const noteDiscussions = h.discussions.get(h.currentNoteFile.path);
          if (!noteDiscussions || noteDiscussions.size === 0) {
            content.createEl("div", { text: "No discussions yet for this note", cls: "history-empty" });
            return;
          }
          const discussionsArray = Array.from(noteDiscussions.values()).sort((a, b) => new Date(b.lastUpdated || b.startTime) - new Date(a.lastUpdated || a.startTime));
          discussionsArray.forEach((discussion) => {
            const item = content.createEl("div", { cls: "discussion-item" });
            const itemHeader = item.createEl("div", { cls: "discussion-item-header" });
            itemHeader.createEl("div", { cls: "discussion-title", text: discussion.title });
            const meta = itemHeader.createEl("div", { cls: "discussion-meta" });
            const date = new Date(discussion.lastUpdated || discussion.startTime);
            meta.createEl("span", { text: date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
            meta.createEl("span", { text: ` \u2022 ${discussion.messageCount} messages` });
            const actions = item.createEl("div", { cls: "discussion-actions" });
            const loadBtn = actions.createEl("button", { cls: "discussion-action-button", text: "Load", attr: { type: "button", "aria-label": `Load discussion ${discussion.title}` } });
            loadBtn.addEventListener("click", () => {
              h.loadDiscussion(discussion.id);
            });
            const deleteBtn = actions.createEl("button", { cls: "discussion-action-button delete-button", text: "Delete", attr: { type: "button", "aria-label": `Delete discussion ${discussion.title}` } });
            deleteBtn.addEventListener("click", () => {
              const modal = new ConfirmModal(h.app, `Delete discussion "${discussion.title}"?`, () => {
                h.deleteDiscussion(discussion.id);
              });
              modal.open();
            });
            if (discussion.id === h.currentDiscussionId) item.addClass("current-discussion");
          });
        } else {
          h.discussionHistoryPanel.style.display = "none";
        }
      }
      renderGlobalHistory() {
        const h = this.host;
        if (!h.globalHistoryPanel) return;
        if (h.showingGlobalHistory) {
          h.globalHistoryPanel.style.display = "block";
          h.globalHistoryPanel.empty();
          const header = h.globalHistoryPanel.createEl("div", { cls: "history-panel-header" });
          header.createEl("h4", { text: "Global Discussion History" });
          const closeBtn = header.createEl("button", { cls: "history-close-button", text: "\u2715" });
          closeBtn.addEventListener("click", () => {
            h.showingGlobalHistory = false;
            h.globalHistoryPanel.style.display = "none";
          });
          const content = h.globalHistoryPanel.createEl("div", { cls: "history-panel-content" });
          let globalList = h.globalDiscussionHistory || [];
          if ((!globalList || globalList.length === 0) && h.discussions && h.discussions.size > 0) {
            const synthesized = [];
            for (const [notePath, noteMap] of h.discussions.entries()) {
              if (!noteMap) continue;
              if (noteMap instanceof Map) {
                for (const [id, d] of noteMap.entries()) {
                  try {
                    synthesized.push({
                      id: d.id || id,
                      title: d.title || (d.history && d.history.length ? d.history.find((m) => m.role === "user")?.content || "Discussion" : "Discussion"),
                      noteFile: d.notePath || notePath,
                      noteName: d.noteName || (notePath.split("/").pop() || notePath),
                      lastUpdated: d.lastUpdated || d.startTime || /* @__PURE__ */ new Date(),
                      startTime: d.startTime || /* @__PURE__ */ new Date(),
                      messageCount: d.messageCount || (d.history || []).length,
                      history: (d.history || []).slice(-3)
                    });
                  } catch (e) {
                  }
                }
              } else if (typeof noteMap === "object") {
                for (const [id, d] of Object.entries(noteMap)) {
                  synthesized.push({
                    id: d.id || id,
                    title: d.title || "Discussion",
                    noteFile: d.notePath || notePath,
                    noteName: d.noteName || (notePath.split("/").pop() || notePath),
                    lastUpdated: d.lastUpdated || d.startTime || /* @__PURE__ */ new Date(),
                    startTime: d.startTime || /* @__PURE__ */ new Date(),
                    messageCount: d.messageCount || (d.history || []).length,
                    history: (d.history || []).slice(-3)
                  });
                }
              }
            }
            synthesized.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
            globalList = synthesized;
          }
          if (!globalList || globalList.length === 0) {
            content.createEl("div", { text: "No discussions yet", cls: "history-empty" });
            return;
          }
          globalList.forEach((discussion) => {
            const item = content.createEl("div", { cls: "discussion-item global-discussion-item" });
            const itemHeader = item.createEl("div", { cls: "discussion-item-header" });
            itemHeader.createEl("div", { cls: "discussion-title", text: discussion.title });
            itemHeader.createEl("div", { cls: "discussion-note-info", text: `\u{1F4C4} ${discussion.noteName}` });
            const meta = itemHeader.createEl("div", { cls: "discussion-meta" });
            const date = new Date(discussion.lastUpdated || discussion.startTime);
            meta.createEl("span", { text: date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
            meta.createEl("span", { text: ` \u2022 ${discussion.messageCount} messages` });
            const actions = item.createEl("div", { cls: "discussion-actions" });
            const openNoteBtn = actions.createEl("button", { cls: "discussion-action-button", text: "Open Note", attr: { type: "button", "aria-label": `Open note for discussion ${discussion.title}` } });
            openNoteBtn.addEventListener("click", async () => {
              const file = h.app.vault.getAbstractFileByPath(discussion.noteFile);
              if (file) {
                await h.app.workspace.getLeaf().openFile(file);
                setTimeout(() => {
                  h.loadDiscussion(discussion.id, discussion.noteFile);
                }, 100);
              } else {
                h.addMessageToHistory("system", `Note not found: ${discussion.noteFile}`);
              }
            });
            const deleteBtn = actions.createEl("button", { cls: "discussion-action-button delete-button", text: "Delete" });
            deleteBtn.addEventListener("click", () => {
              const modal = new ConfirmModal(h.app, `Delete discussion "${discussion.title}"?`, () => {
                h.deleteDiscussion(discussion.id, discussion.noteFile);
              });
              modal.open();
            });
            if (discussion.id === h.currentDiscussionId) item.addClass("current-discussion");
          });
        } else {
          h.globalHistoryPanel.style.display = "none";
        }
      }
    };
    module2.exports = { ChatUIHelpers };
  }
});

// ui/chat-helpers.js
var require_chat_helpers = __commonJS({
  "ui/chat-helpers.js"(exports2, module2) {
    "use strict";
    function debounceFactory() {
      let timer = null;
      return (func, wait) => {
        return (...args) => {
          clearTimeout(timer);
          timer = setTimeout(() => func.apply(this, args), wait);
        };
      };
    }
    function createAutoResizer(textareaRef, maxHeight = 200) {
      return function autoResize() {
        const textarea = textareaRef;
        if (!textarea) return;
        textarea.style.height = "auto";
        const newHeight = Math.min(textarea.scrollHeight, maxHeight);
        textarea.style.height = newHeight + "px";
      };
    }
    module2.exports = {
      debounceFactory,
      createAutoResizer
    };
  }
});

// ui/chat-panel-view.js
var require_chat_panel_view = __commonJS({
  "ui/chat-panel-view.js"(exports2, module2) {
    "use strict";
    var { ItemView, TFile: TFile2 } = require("obsidian");
    var { ConfirmModal } = require_confirm_modal();
    var { generateDiscussionId: _genDiscussionId, normalizeMessage } = require_chat_utils();
    var { renderMessage } = require_message_renderer();
    var { notify, notifyError } = require_notifications();
    var { ChatStateService } = require_chat_state_service();
    var { ChatPersistenceService } = require_chat_persistence_service();
    var { ChatUIHelpers } = require_chat_ui_helpers();
    var CHAT_PANEL_VIEW_TYPE2 = "chat-panel-view";
    var ChatPanelView2 = class extends ItemView {
      constructor(leaf, settings, plugin) {
        super(leaf);
        this.settings = settings;
        this.plugin = plugin;
        this.chatHistory = [];
        this.currentNoteContent = "";
        this.currentPdfContent = "";
        this.currentNoteFile = null;
        this.messageHistoryIndex = -1;
        this.userMessageHistory = [];
        this.isUserScrolling = false;
        this.currentDiscussionId = null;
        this.discussions = /* @__PURE__ */ new Map();
        this.noteDiscussions = /* @__PURE__ */ new Map();
        this.discussionIndex = /* @__PURE__ */ new Map();
        this.includePdfInContext = true;
        this.includeNoteInContext = true;
        this.includedNotes = /* @__PURE__ */ new Map();
        this.showingDiscussionHistory = false;
        this.showingGlobalHistory = false;
        this._saveInProgress = false;
        this._pendingSave = false;
        this._updateInProgress = false;
        this._lastUpdateFile = null;
        this._updateDebounceTimer = null;
        this._pdfExtractionInProgress = false;
        this._lastSavedAt = null;
        this._lastDeletedMessage = null;
        this._lastDeletedTimer = null;
        this.conversations = /* @__PURE__ */ new Map();
        this.globalDiscussionHistory = [];
        this.stateSvc = new ChatStateService(this);
        this.persistSvc = new ChatPersistenceService(this);
        this.uiSvc = new ChatUIHelpers(this);
      }
      getViewType() {
        return CHAT_PANEL_VIEW_TYPE2;
      }
      getDisplayText() {
        return "Note Chat";
      }
      getIcon() {
        return "message-circle";
      }
      async onOpen() {
        this.renderView();
        this.setupEventListeners();
      }
      setupEventListeners() {
        if (!this._debounceFactory) {
          try {
            this._debounceFactory = require_chat_helpers().debounceFactory();
          } catch (e) {
            this._debounceFactory = (f) => f;
          }
        }
        this._debouncedUpdateNote = this._debounceFactory(() => {
          if (!this._updateInProgress) {
            this._updateCurrentNote();
          }
        }, 100);
        this.registerEvent(
          this.app.workspace.on("active-leaf-change", () => {
            this._debouncedUpdateNote();
          })
        );
        this.registerEvent(
          this.app.vault.on("modify", (file) => {
            if (this.currentNoteFile && file?.path === this.currentNoteFile.path) {
              this._updateNoteContent(file);
            }
          })
        );
        this.registerEvent(
          this.app.vault.on("modify", (file) => {
            if (!file) return;
            const path = file.path;
            if (this.includedNotes.has(path)) {
              this._loadIncludedNoteEntry(path, file).catch((err) => {
                notify(`Failed to refresh included note: ${path}`);
              });
            }
          })
        );
      }
      // Debounce implementation moved to `chat-helpers.js` (use this._debounceFactory())
      async _updateNoteContent(file) {
        if (!file || file.path !== this.currentNoteFile?.path) return;
        try {
          if (file.extension === "md") {
            this.currentNoteContent = await this.app.vault.read(file);
            this.updateNoteInfo();
          }
        } catch (error) {
          console.warn("Failed to update note content:", error);
        }
      }
      async _updateCurrentNote() {
        if (this._updateInProgress) return;
        this._updateInProgress = true;
        try {
          const activeFile = this.app.workspace.getActiveFile();
          if (this._lastUpdateFile && activeFile?.path === this._lastUpdateFile) {
            return;
          }
          this._lastUpdateFile = activeFile?.path || null;
          if (!activeFile) {
            if (this.currentNoteFile) {
              await this.saveConversation();
            }
            this._clearNoteState();
            return;
          }
          if (this.currentNoteFile && this.currentNoteFile.path !== activeFile.path) {
            await this.saveConversation();
            this._clearNoteState();
          }
          this.currentNoteFile = activeFile;
          await this._loadNoteContent(activeFile);
          await this._loadDiscussionsForNote(activeFile.path);
          this.updateNoteInfo();
          this.renderChatHistory();
        } finally {
          this._updateInProgress = false;
        }
      }
      _clearNoteState() {
        this.currentNoteFile = null;
        this.currentNoteContent = "";
        this.currentPdfContent = "";
        this.pdfExtractionError = null;
        this.chatHistory = [];
        this.userMessageHistory = [];
        this.messageHistoryIndex = -1;
        this.currentDiscussionId = null;
        this.hideHistoryPanels();
        this.updateNoteInfo();
        this.renderChatHistory();
      }
      async _loadNoteContent(activeFile) {
        if (activeFile.extension === "md") {
          try {
            this.currentNoteContent = await this.app.vault.read(activeFile);
            this.currentPdfContent = "";
            this.pdfExtractionError = null;
            const paperData = this.plugin.paperService?.paperIndex?.get(activeFile.path);
            let fmPdf = null;
            if (paperData && paperData.frontmatter) {
              fmPdf = paperData.frontmatter.pdf_file || paperData.frontmatter.pdf || paperData.frontmatter.pdf_path || paperData.frontmatter.pdfPath || null;
            }
            if (!fmPdf) {
              try {
                const fm = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
                if (fm) {
                  fmPdf = fm.pdf_file || fm.pdf || fm.pdf_path || fm.pdfPath || null;
                }
              } catch (_) {
              }
            }
            if (fmPdf) {
              try {
                let logicalPath = String(fmPdf);
                if (!logicalPath.includes("/") && activeFile.parent && activeFile.parent.path) {
                  logicalPath = `${activeFile.parent.path}/${logicalPath}`;
                }
                let effectivePath = logicalPath;
                if (this.plugin.fileService?.resolveLogicalToEffectivePath) {
                  effectivePath = await this.plugin.fileService.resolveLogicalToEffectivePath(logicalPath);
                }
                let pdfFile = this.app.vault.getAbstractFileByPath(effectivePath);
                if (!pdfFile && !/\.pdf$/i.test(effectivePath)) {
                  pdfFile = this.app.vault.getAbstractFileByPath(effectivePath + ".pdf");
                }
                if (!pdfFile) {
                  const base = effectivePath.replace(/\\/g, "/").split("/").pop().replace(/\.pdf$/i, "");
                  const files = this.app.vault.getFiles();
                  const match = files.find((f) => f instanceof TFile2 && f.extension === "pdf" && f.basename.toLowerCase() === base.toLowerCase());
                  if (match) pdfFile = match;
                }
                if (pdfFile instanceof TFile2 && pdfFile.extension === "pdf") {
                  this._pdfExtractionInProgress = true;
                  this.updateNoteInfo();
                  try {
                    this.currentPdfContent = await this.plugin.pdfService.extractTextFromPdf(pdfFile);
                    notify(`PDF text extracted and included for ${pdfFile.basename}`);
                    this.pdfExtractionError = null;
                  } catch (pdfExtractionError) {
                    this.pdfExtractionError = pdfExtractionError.message;
                    notifyError(`PDF extraction failed for ${pdfFile.basename}: ${this.pdfExtractionError}`, pdfExtractionError);
                    this.currentPdfContent = "";
                  } finally {
                    this._pdfExtractionInProgress = false;
                    this.updateNoteInfo();
                  }
                }
              } catch (_) {
              }
            }
            this.updateNoteInfo();
            await this.loadConversation();
          } catch (_) {
          }
          return;
        }
        if (activeFile.extension === "pdf") {
          try {
            this.currentNoteContent = "";
            this.currentPdfContent = "";
            this.pdfExtractionError = null;
            try {
              this._pdfExtractionInProgress = true;
              this.updateNoteInfo();
              this.currentPdfContent = await this.plugin.pdfService.extractTextFromPdf(activeFile);
              notify(`PDF text extracted and included for ${activeFile.basename}`);
              this.pdfExtractionError = null;
            } catch (pdfErr) {
              this.pdfExtractionError = pdfErr?.message || String(pdfErr);
              this.currentPdfContent = "";
              notifyError(`PDF extraction failed for ${activeFile.basename}: ${this.pdfExtractionError}`, pdfErr);
            } finally {
              this._pdfExtractionInProgress = false;
              this.updateNoteInfo();
            }
            this.updateNoteInfo();
            await this.loadConversation();
          } catch (_) {
          }
          return;
        }
        this.currentNoteContent = "";
        this.currentPdfContent = "";
        this.pdfExtractionError = null;
        this.updateNoteInfo();
        this.renderChatHistory();
      }
      updateNoteInfo() {
        this.uiSvc.updateNoteInfo();
      }
      async renderView() {
        const container = this.contentEl || this.containerEl.children[1];
        container.empty();
        container.addClass("chat-panel-container");
        const header = container.createEl("div", { cls: "chat-panel-header" });
        const titleRow = header.createEl("div", { cls: "chat-title-row" });
        titleRow.createEl("h3", { text: "Chat with Note", cls: "chat-panel-title" });
        const discussionControls = titleRow.createEl("div", { cls: "discussion-controls" });
        const newDiscussionBtn = discussionControls.createEl("button", {
          cls: "discussion-button new-discussion-button",
          title: "Start new discussion",
          attr: { "aria-label": "Start new discussion" }
        });
        newDiscussionBtn.innerHTML = "\u{1F4AC} New";
        newDiscussionBtn.addEventListener("click", () => this.startNewDiscussion());
        const discussionHistoryBtn = discussionControls.createEl("button", {
          cls: "discussion-button history-button",
          title: "View discussion history for this note",
          attr: { "aria-label": "View discussion history for this note" }
        });
        discussionHistoryBtn.innerHTML = "\u{1F4CB} History";
        discussionHistoryBtn.addEventListener("click", () => this.toggleDiscussionHistory());
        const globalHistoryBtn = discussionControls.createEl("button", {
          cls: "discussion-button global-history-button",
          title: "View global discussion history",
          attr: { "aria-label": "View global discussion history" }
        });
        globalHistoryBtn.innerHTML = "\u{1F310} Global";
        globalHistoryBtn.addEventListener("click", () => this.toggleGlobalHistory());
        const noteInfo = header.createEl("div", { cls: "chat-note-info" });
        const discussionHistoryPanel = container.createEl("div", {
          cls: "discussion-history-panel",
          attr: { style: "display: none;" }
        });
        this.discussionHistoryPanel = discussionHistoryPanel;
        const globalHistoryPanel = container.createEl("div", {
          cls: "global-history-panel",
          attr: { style: "display: none;" }
        });
        this.globalHistoryPanel = globalHistoryPanel;
        const chatArea = container.createEl("div", { cls: "chat-messages-area" });
        this.chatMessagesEl = chatArea;
        chatArea.addEventListener("scroll", () => {
          const { scrollTop, scrollHeight, clientHeight } = chatArea;
          const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;
          this.isUserScrolling = !isAtBottom;
        });
        chatArea.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        });
        chatArea.addEventListener("drop", async (e) => {
          e.preventDefault();
          try {
            let targetFile = null;
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
              const f = files[0];
              const filePath = f.path || f.name;
              if (filePath && filePath.endsWith(".md")) {
                targetFile = this.app.vault.getAbstractFileByPath(filePath);
              }
            }
            if (!targetFile) {
              const txt = e.dataTransfer.getData("text/plain");
              if (txt) {
                const candidate = txt.trim();
                if (candidate.startsWith("obsidian://")) {
                  try {
                    const url = new URL(candidate);
                    const fileParam = url.searchParams.get("file");
                    if (fileParam) {
                      const decoded = decodeURIComponent(fileParam).replace(/^\//, "");
                      targetFile = this.app.vault.getAbstractFileByPath(decoded);
                      if (!targetFile) targetFile = this.app.vault.getAbstractFileByPath(decoded.endsWith(".md") ? decoded : decoded + ".md");
                      if (!targetFile) {
                        const base = decoded.replace(/\\/g, "/").split("/").pop().replace(/\.md$/i, "");
                        const files2 = this.app.vault.getFiles();
                        targetFile = files2.find((f) => f.basename.toLowerCase() === base.toLowerCase());
                      }
                    }
                  } catch (_) {
                    const files2 = this.app.vault.getFiles();
                    targetFile = files2.find(
                      (f) => f.basename.toLowerCase() === candidate.toLowerCase() || f.path.toLowerCase() === candidate.toLowerCase()
                    );
                  }
                } else if (candidate.endsWith(".md")) {
                  targetFile = this.app.vault.getAbstractFileByPath(candidate);
                } else {
                  const files2 = this.app.vault.getFiles();
                  targetFile = files2.find(
                    (f) => f.basename.toLowerCase() === candidate.toLowerCase()
                  );
                }
              }
            }
            if (targetFile && targetFile instanceof TFile2) {
              if (targetFile.extension === "md") {
                await this._loadIncludedNoteEntry(targetFile.path, targetFile);
                await this.saveConversation();
                this.updateNoteInfo();
                notify(`Included note "${targetFile.basename}" added to LLM context.`);
              } else if (targetFile.extension === "pdf") {
                try {
                  this._pdfExtractionInProgress = true;
                  this.updateNoteInfo();
                  const text = await this.plugin.pdfService.extractTextFromPdf(targetFile);
                  this.includedNotes.set(targetFile.path, {
                    name: targetFile.basename + " (PDF)",
                    content: text || "",
                    includeInContext: true,
                    isPdf: true
                  });
                  await this.saveConversation();
                  this.updateNoteInfo();
                  notify(`Included PDF "${targetFile.basename}" added to LLM context.`);
                } catch (err) {
                  console.warn("Failed to extract PDF on drop", err);
                  notifyError(`Failed to extract PDF: ${targetFile.basename}`, err);
                  try {
                    await this.app.workspace.getLeaf().openFile(targetFile);
                  } catch (_) {
                  }
                } finally {
                  this._pdfExtractionInProgress = false;
                  this.updateNoteInfo();
                }
              } else if (["txt", "csv", "json", "html", "md", "markdown"].includes((targetFile.extension || "").toLowerCase())) {
                try {
                  const content = await this.app.vault.read(targetFile);
                  this.includedNotes.set(targetFile.path, {
                    name: targetFile.basename,
                    content: content || "",
                    includeInContext: true
                  });
                  await this.saveConversation();
                  this.updateNoteInfo();
                  notify(`Included file "${targetFile.basename}" added to LLM context.`);
                } catch (err) {
                  console.warn("Failed to read dropped file", err);
                  notifyError(`Failed to include file: ${targetFile.basename}`, err);
                }
              } else {
                await this.app.workspace.getLeaf().openFile(targetFile);
              }
            } else {
              const txt = e.dataTransfer.getData("text/plain");
              if (txt && txt.trim()) {
                await this.addIncludedNoteByName(txt.trim());
              }
            }
          } catch (err) {
            console.warn("Drop handling failed", err);
            notifyError("Failed to process dropped item", err);
          }
        });
        const inputArea = container.createEl("div", { cls: "chat-input-area" });
        const inputContainer = inputArea.createEl("div", { cls: "chat-input-container" });
        this.messageInput = inputContainer.createEl("textarea", {
          cls: "chat-message-input",
          attr: {
            placeholder: "Ask questions about the current note and PDF...",
            rows: "3"
          }
        });
        const sendControls = inputContainer.createEl("div", { cls: "chat-send-controls" });
        sendControls.style.display = "flex";
        sendControls.style.flexDirection = "column";
        sendControls.style.gap = "8px";
        sendControls.style.alignItems = "flex-end";
        const sendButton = sendControls.createEl("button", {
          cls: "chat-send-button",
          text: "Send",
          attr: { type: "button", "aria-label": "Send message" }
        });
        sendButton.addEventListener("click", () => this.sendMessage());
        this.messageInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            if (e.shiftKey) {
              return;
            } else if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              this.sendMessage();
            } else {
              e.preventDefault();
              this.sendMessage();
            }
          } else if (e.key === "Escape") {
            e.preventDefault();
            this.messageInput.value = "";
            this.messageInput.style.height = "auto";
          } else if (e.key === "ArrowUp" && e.ctrlKey) {
            e.preventDefault();
            this.navigateMessageHistory(-1);
          } else if (e.key === "ArrowDown" && e.ctrlKey) {
            e.preventDefault();
            this.navigateMessageHistory(1);
          }
        });
        this.messageInput.addEventListener("input", () => {
          this.autoResizeTextarea();
        });
        const clearButton = sendControls.createEl("button", {
          cls: "chat-clear-button",
          text: "Clear Chat",
          attr: { type: "button", "aria-label": "Clear chat history" }
        });
        clearButton.addEventListener("click", () => this.clearChat());
        await this._updateCurrentNote();
        this.renderChatHistory();
        this.addStyles();
      }
      async sendMessage() {
        let message = this.messageInput.value.trim();
        if (!message) return;
        if (!this.currentNoteFile) {
          this.addMessageToHistory("system", "Please open a note or a PDF first.");
          return;
        }
        if (!this.currentDiscussionId) {
          this.currentDiscussionId = this.generateDiscussionId();
        }
        this.userMessageHistory.push(message);
        this.messageHistoryIndex = -1;
        this.addMessageToHistory("user", message);
        this.messageInput.value = "";
        this.autoResizeTextarea();
        const thinkingId = this.addMessageToHistory("assistant", "\u{1F4AD} Thinking...", true);
        try {
          const includeTokens = [];
          const tokenRegex = /#\{([^}]+)\}/g;
          let m;
          while ((m = tokenRegex.exec(message)) !== null) {
            const name = m[1].trim();
            if (name) includeTokens.push(name);
          }
          if (includeTokens.length > 0) {
            message = message.replace(tokenRegex, "").trim();
            for (const name of includeTokens) {
              await this.addIncludedNoteByName(name);
            }
          }
          let context = "";
          const isPdf = this.currentNoteFile.extension === "pdf";
          if (isPdf) {
            context = `Current PDF: ${this.currentNoteFile.basename}

PDF Content:
${this.currentPdfContent || "(no extracted content)"}`;
          } else {
            context = `Current Note: ${this.currentNoteFile.basename}

`;
            if (this.includeNoteInContext) {
              context += `Note Content:
${this.currentNoteContent}`;
            } else {
              context += `Note content excluded from LLM context (toggle is OFF).`;
            }
            if (this.includePdfInContext && this.currentPdfContent) {
              const pdfContentToAdd = this.currentPdfContent.slice(0, 5e4);
              context += `

--- Associated PDF Content (included by toggle) ---
${pdfContentToAdd}`;
            }
            if (this.includedNotes && this.includedNotes.size > 0) {
              for (const [path, entry] of this.includedNotes.entries()) {
                if (entry && entry.includeInContext) {
                  const noteText = entry.content || "";
                  const snippet = noteText.length > 5e4 ? noteText.slice(0, 5e4) : noteText;
                  context += `

--- Included Note: ${entry.name || path} ---
${snippet}`;
                }
              }
            }
          }
          const willSendContents = this.includeNoteInContext && this.currentNoteContent && this.currentNoteContent.length > 0 || this.includePdfInContext && this.currentPdfContent && this.currentPdfContent.length > 0 || this.includedNotes && Array.from(this.includedNotes.values()).some((e) => e.includeInContext);
          if (willSendContents && this.plugin?.settings && this.plugin.settings.allowSendNotePdfToLLM === false) {
            const msg = "Sending note or PDF content to external LLM is disabled in plugin settings.";
            this.updateMessageInHistory(thinkingId, msg);
            notify(msg);
            return;
          }
          const callContext = {
            notePath: this.currentNoteFile?.path,
            discussionId: this.currentDiscussionId,
            messageId: thinkingId
          };
          if (this._lastLLMController && typeof this._lastLLMController.abort === "function") {
            try {
              this._lastLLMController.abort();
            } catch (e) {
            }
          }
          this._lastLLMController = typeof AbortController !== "undefined" ? new AbortController() : null;
          const conversationHistory = this.chatHistory.filter((msg) => msg.role !== "system").slice(-10).map((msg) => `${msg.role}: ${msg.content}`).join("\n");
          const systemPrompt = `You are a helpful research assistant. You are chatting with a user about their current note and any associated PDF content. 

Context:
${context}

Previous conversation:
${conversationHistory}

Please provide helpful, accurate responses based on the note and PDF content. If the user asks about something not in the provided content, let them know that information isn't available in the current materials.`;
          let response;
          try {
            if (this._lastLLMController) {
              response = await this.plugin.llmService.callLLMWithPrompt(systemPrompt, message, { signal: this._lastLLMController.signal });
            } else {
              response = await this.plugin.llmService.callLLMWithPrompt(systemPrompt, message);
            }
          } catch (err) {
            if (err && err.name === "AbortError") {
              this.updateMessageInHistory(thinkingId, "LLM request canceled.");
              notify("LLM request canceled.");
              return;
            }
            throw err;
          }
          if (callContext.notePath && callContext.notePath !== this.currentNoteFile?.path) {
            try {
              this._saveAssistantResponseToPath(callContext.notePath, callContext.discussionId, {
                id: Date.now() + Math.random(),
                role: "assistant",
                content: response,
                timestamp: /* @__PURE__ */ new Date(),
                isTyping: false
              });
              notify("Response completed after you switched notes \u2014 saved to original discussion.");
            } catch (e) {
              console.error("Failed to save orphaned response", e);
              notifyError("Response received but failed to save to original note. Check console.", e);
            }
          } else {
            this.updateMessageInHistory(thinkingId, response);
          }
        } catch (error) {
          let errorMessage = "An error occurred while processing your request.";
          const emsg = error && error.message ? error.message : String(error || "Unknown error");
          if (emsg.includes("status 401") || emsg.toLowerCase().includes("unauthorized")) {
            errorMessage = "\u274C Authentication failed. Please check your API key in settings.";
          } else if (emsg.includes("status 403")) {
            errorMessage = "\u274C Access forbidden. Your API key may not have permission for this model.";
          } else if (emsg.includes("status 429") || emsg.toLowerCase().includes("rate limit")) {
            errorMessage = "\u274C Rate limit exceeded. Please wait a moment and try again.";
          } else if (emsg.toLowerCase().includes("timeout")) {
            errorMessage = "\u274C LLM request timed out. Try again or reduce context size.";
          } else {
            errorMessage = `\u274C Error: ${emsg}`;
          }
          notifyError(errorMessage, error);
          this.updateMessageInHistory(thinkingId, errorMessage);
        }
      }
      addMessageToHistory(role, content, isTyping = false) {
        if (!content || typeof content !== "string" || content.trim() === "") return null;
        if (!role || !["user", "assistant", "system"].includes(role)) role = "assistant";
        if ((role === "system" || role === "assistant") && this.chatHistory.length > 0) {
          const last = this.chatHistory[this.chatHistory.length - 1];
          if (last && last.role === role && last.content === content) {
            if (!last.isTyping) return last.id;
          }
        }
        const messageId = Date.now() + Math.random();
        return this.stateSvc.addMessageToHistory(role, content, isTyping);
      }
      updateMessageInHistory(messageId, newContent) {
        this.stateSvc.updateMessageInHistory(messageId, newContent);
      }
      deleteMessage(messageId) {
        this.stateSvc.deleteMessage(messageId);
        notify("Message deleted \u2014 click Undo in the header to restore (15s)");
        if (this._lastDeletedTimer) clearTimeout(this._lastDeletedTimer);
        this._lastDeletedTimer = setTimeout(() => {
          this._lastDeletedMessage = null;
          this._lastDeletedTimer = null;
          this.updateNoteInfo();
          this.renderChatHistory();
        }, 15e3);
      }
      // Discussion Management Methods
      generateDiscussionId() {
        return _genDiscussionId();
      }
      // Data structure helpers for unified architecture
      _createDiscussion(id, notePath, title = null) {
        const discussion = {
          id,
          title: title || this.generateDiscussionTitle(),
          notePath,
          noteName: notePath ? notePath.split("/").pop().replace(".md", "") : "Unknown",
          state: "DRAFT",
          // DRAFT -> ACTIVE -> SAVED
          startTime: /* @__PURE__ */ new Date(),
          lastUpdated: /* @__PURE__ */ new Date(),
          messageCount: this.chatHistory.length,
          history: [...this.chatHistory],
          userMessageHistory: [...this.userMessageHistory],
          includePdfInContext: this.includePdfInContext,
          includeNoteInContext: this.includeNoteInContext,
          includedNotes: this._serializeIncludedNotes()
        };
        return discussion;
      }
      _serializeIncludedNotes() {
        return Array.from(this.includedNotes.entries()).map(([path, data]) => ({
          path,
          name: data.name || path,
          includeInContext: !!data.includeInContext,
          content: typeof data.content === "string" ? data.content : ""
        }));
      }
      _deserializeIncludedNotes(serializedNotes) {
        this.includedNotes.clear();
        if (Array.isArray(serializedNotes)) {
          for (const note of serializedNotes) {
            this.includedNotes.set(note.path, {
              name: note.name || note.path,
              content: note.content || "",
              includeInContext: note.includeInContext !== false
            });
          }
        }
      }
      _addDiscussionToNote(discussionId, notePath) {
        if (!this.noteDiscussions.has(notePath)) {
          this.noteDiscussions.set(notePath, /* @__PURE__ */ new Set());
        }
        this.noteDiscussions.get(notePath).add(discussionId);
        this.discussionIndex.set(discussionId, {
          notePath,
          lastUpdated: /* @__PURE__ */ new Date()
        });
      }
      _removeDiscussionFromNote(discussionId, notePath) {
        if (this.noteDiscussions.has(notePath)) {
          this.noteDiscussions.get(notePath).delete(discussionId);
          if (this.noteDiscussions.get(notePath).size === 0) {
            this.noteDiscussions.delete(notePath);
          }
        }
        this.discussionIndex.delete(discussionId);
      }
      _validateDiscussion(discussion) {
        return discussion && typeof discussion.id === "string" && typeof discussion.notePath === "string" && Array.isArray(discussion.history);
      }
      // (private _generateDiscussionTitle removed - use public generateDiscussionTitle instead)
      // Discussion loading helper
      async _loadDiscussionsForNote(notePath) {
        if (!notePath || !this.plugin?.settings) return;
        try {
          const settingsDiscussions = this.plugin.settings.discussions;
          if (settingsDiscussions && settingsDiscussions[notePath]) {
            const persistedNoteDiscussions = settingsDiscussions[notePath];
            if (!this.discussions.has(notePath)) {
              this.discussions.set(notePath, /* @__PURE__ */ new Map());
            }
            const discussionMap = this.discussions.get(notePath);
            for (const [discussionId, discussionData] of Object.entries(persistedNoteDiscussions)) {
              if (!discussionMap.has(discussionId)) {
                const normalizedDiscussion = {
                  id: discussionId,
                  title: discussionData.title || "Untitled Discussion",
                  notePath: discussionData.notePath || notePath,
                  noteName: discussionData.noteName || notePath.split("/").pop(),
                  state: discussionData.state || "SAVED",
                  startTime: discussionData.startTime ? new Date(discussionData.startTime) : /* @__PURE__ */ new Date(),
                  lastUpdated: discussionData.lastUpdated ? new Date(discussionData.lastUpdated) : /* @__PURE__ */ new Date(),
                  messageCount: discussionData.messageCount || (discussionData.history || []).length,
                  history: discussionData.history || [],
                  userMessageHistory: discussionData.userMessageHistory || [],
                  includePdfInContext: discussionData.includePdfInContext !== false,
                  includeNoteInContext: discussionData.includeNoteInContext !== false,
                  includedNotes: discussionData.includedNotes || []
                };
                discussionMap.set(discussionId, normalizedDiscussion);
                this._addDiscussionToNote(discussionId, notePath);
              }
            }
          }
          const noteDiscussionIds = this.noteDiscussions.get(notePath);
          if (noteDiscussionIds && noteDiscussionIds.size > 0) {
            const recentDiscussions = Array.from(noteDiscussionIds).map((id) => this.discussions.get(id)).filter((d) => d).sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
            if (recentDiscussions.length > 0) {
              if (this.loadDiscussionNew) {
                await this.loadDiscussionNew(recentDiscussions[0].id);
              }
            }
          }
        } catch (error) {
          console.warn("Failed to load discussions for note:", notePath, error);
        }
      }
      async startNewDiscussion() {
        if (!this.currentNoteFile) {
          this.addMessageToHistory("system", "Please open a note or PDF first to start a discussion.");
          return;
        }
        if (this.currentDiscussionId && this.chatHistory.length > 0) {
          await this._saveCurrentDiscussion();
        }
        const newDiscussionId = this.generateDiscussionId();
        this.currentDiscussionId = newDiscussionId;
        this.chatHistory = [];
        this.userMessageHistory = [];
        this.messageHistoryIndex = -1;
        this.renderChatHistory();
        this.updateNoteInfo();
        const discussion = this._createDiscussion(newDiscussionId, this.currentNoteFile.path);
        discussion.state = "ACTIVE";
        if (!this.discussions.has(this.currentNoteFile.path) || !(this.discussions.get(this.currentNoteFile.path) instanceof Map)) {
          this.discussions.set(this.currentNoteFile.path, /* @__PURE__ */ new Map());
        }
        const noteMap = this.discussions.get(this.currentNoteFile.path);
        noteMap.set(newDiscussionId, discussion);
        this._addDiscussionToNote(newDiscussionId, this.currentNoteFile.path);
      }
      async _saveCurrentDiscussion() {
        if (!this.currentNoteFile || !this.currentDiscussionId || this.chatHistory.length === 0) {
          return;
        }
        if (this._saveInProgress) {
          this._pendingSave = true;
          return;
        }
        this._saveInProgress = true;
        try {
          const discussionData = this._createDiscussion(
            this.currentDiscussionId,
            this.currentNoteFile.path
          );
          discussionData.state = "SAVED";
          discussionData.lastUpdated = /* @__PURE__ */ new Date();
          discussionData.history = this.chatHistory.map((m) => ({
            ...m,
            isTyping: false,
            timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp || Date.now()).toISOString()
          })).filter((m) => {
            const trimmed = m.content.trim();
            return trimmed.length > 0 && !/^(💭\s*)?Thinking\.\.\.$/i.test(trimmed);
          });
          if (!this.discussions.has(this.currentNoteFile.path) || !(this.discussions.get(this.currentNoteFile.path) instanceof Map)) {
            this.discussions.set(this.currentNoteFile.path, /* @__PURE__ */ new Map());
          }
          const noteMap = this.discussions.get(this.currentNoteFile.path);
          discussionData.messageCount = (discussionData.history || []).length;
          noteMap.set(this.currentDiscussionId, discussionData);
          this._addDiscussionToNote(this.currentDiscussionId, this.currentNoteFile.path);
          this.discussionIndex.set(this.currentDiscussionId, {
            notePath: this.currentNoteFile.path,
            lastUpdated: discussionData.lastUpdated
          });
          try {
            const summary = {
              id: discussionData.id,
              title: discussionData.title || "Untitled Discussion",
              noteFile: discussionData.notePath || this.currentNoteFile.path,
              noteName: discussionData.noteName || (this.currentNoteFile ? this.currentNoteFile.basename : "Unknown"),
              startTime: discussionData.startTime || /* @__PURE__ */ new Date(),
              lastUpdated: discussionData.lastUpdated || /* @__PURE__ */ new Date(),
              messageCount: discussionData.messageCount || (discussionData.history || []).length,
              // keep a light-weight history snippet for global view (optional)
              history: (discussionData.history || []).slice(-3)
            };
            const existingIndex = this.globalDiscussionHistory.findIndex((d) => d.id === summary.id);
            if (existingIndex !== -1) {
              this.globalDiscussionHistory[existingIndex] = summary;
            } else {
              this.globalDiscussionHistory.unshift(summary);
            }
            if (this.globalDiscussionHistory.length > 100) this.globalDiscussionHistory = this.globalDiscussionHistory.slice(0, 100);
          } catch (e) {
            console.warn("Failed to update globalDiscussionHistory", e);
          }
        } finally {
          this._saveInProgress = false;
          if (this._pendingSave) {
            this._pendingSave = false;
            await this._saveCurrentDiscussion();
          }
        }
      }
      generateDiscussionTitle() {
        if (this.chatHistory.length === 0) return "Empty Discussion";
        const firstUserMessage = this.chatHistory.find((m) => m.role === "user");
        if (firstUserMessage) {
          const content = firstUserMessage.content.trim();
          return content.length > 50 ? content.substring(0, 50) + "..." : content;
        }
        return `Discussion ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`;
      }
      getDiscussionDisplayName() {
        if (!this.currentDiscussionId) return "No Discussion";
        return this.currentDiscussionId.split("_")[1] || this.currentDiscussionId;
      }
      loadDiscussion(discussionId, noteFilePath = null) {
        if (!discussionId) return;
        if (this.currentDiscussionId && this.chatHistory.length > 0) {
          try {
            this._saveCurrentDiscussion();
          } catch (e) {
          }
        }
        let discussionData = null;
        if (noteFilePath) {
          const noteMap = this.discussions.get(noteFilePath);
          if (noteMap && typeof noteMap.get === "function") {
            discussionData = noteMap.get(discussionId);
          } else if (noteMap && noteMap[discussionId]) {
            discussionData = noteMap[discussionId];
          }
        }
        if (!discussionData && this.discussionIndex && typeof this.discussionIndex.get === "function") {
          const idx = this.discussionIndex.get(discussionId);
          if (idx && idx.notePath) {
            const noteMap = this.discussions.get(idx.notePath);
            if (noteMap && typeof noteMap.get === "function") discussionData = noteMap.get(discussionId);
          }
        }
        if (!discussionData) {
          for (const [key, val] of this.discussions.entries()) {
            if (!val) continue;
            if (typeof val.get === "function" && val.has(discussionId)) {
              discussionData = val.get(discussionId);
              break;
            } else if (val[discussionId]) {
              discussionData = val[discussionId];
              break;
            } else if (key === discussionId) {
              discussionData = val;
              break;
            }
          }
        }
        if (!discussionData && typeof this.discussions.get === "function") {
          discussionData = this.discussions.get(discussionId);
        }
        this.currentDiscussionId = discussionId;
        this.chatHistory = (discussionData.history || []).map((m) => normalizeMessage(m)).filter((m) => {
          const trimmed = m.content.trim();
          return trimmed.length > 0 && !/^(💭\s*)?Thinking\.\.\.$/i.test(trimmed);
        });
        this.userMessageHistory = [...discussionData.userMessageHistory || []];
        this.includePdfInContext = discussionData.includePdfInContext !== void 0 ? !!discussionData.includePdfInContext : true;
        this.includeNoteInContext = discussionData.includeNoteInContext !== void 0 ? !!discussionData.includeNoteInContext : true;
        this._deserializeIncludedNotes(discussionData.includedNotes);
        this.hideHistoryPanels();
        this.renderChatHistory();
        this.updateNoteInfo();
        discussionData.state = "ACTIVE";
        discussionData.lastUpdated = /* @__PURE__ */ new Date();
        notify(`Loaded discussion: ${discussionData.title}`);
        try {
          this.renderDiscussionHistory();
          this.renderGlobalHistory();
        } catch (e) {
        }
      }
      toggleDiscussionHistory() {
        this.showingDiscussionHistory = !this.showingDiscussionHistory;
        this.showingGlobalHistory = false;
        this.renderDiscussionHistory();
      }
      toggleGlobalHistory() {
        this.showingGlobalHistory = !this.showingGlobalHistory;
        this.showingDiscussionHistory = false;
        this.renderGlobalHistory();
      }
      hideHistoryPanels() {
        this.showingDiscussionHistory = false;
        this.showingGlobalHistory = false;
        if (this.discussionHistoryPanel) {
          this.discussionHistoryPanel.style.display = "none";
        }
        if (this.globalHistoryPanel) {
          this.globalHistoryPanel.style.display = "none";
        }
      }
      async saveConversation() {
        return this.persistSvc.saveConversation();
      }
      // Save an assistant response for a specific note path/discussion (used when responses return after the user switched notes)
      _saveAssistantResponseToPath(notePath, discussionId, messageObj) {
        return this.persistSvc.saveAssistantResponseToPath(notePath, discussionId, messageObj);
      }
      async loadConversation() {
        return this.persistSvc.loadConversation();
      }
      // Try to add an included note by a vault path. Accepts absolute or vault-relative paths.
      async addIncludedNoteByPath(path) {
        if (!path) return;
        let candidate = path.replace(/^file:\/\//, "").trim();
        candidate = decodeURIComponent(candidate);
        let file = this.app.vault.getAbstractFileByPath(candidate);
        if (!file && !candidate.endsWith(".md")) {
          file = this.app.vault.getAbstractFileByPath(candidate + ".md");
        }
        if (!file && candidate.startsWith("/")) {
          file = this.app.vault.getAbstractFileByPath(candidate.slice(1));
          if (!file && !candidate.endsWith(".md")) {
            file = this.app.vault.getAbstractFileByPath(candidate.slice(1) + ".md");
          }
        }
        if (!file) {
          return this.addIncludedNoteByName(candidate.replace(/\\/g, "/").split("/").pop().replace(/\.md$/i, ""));
        }
        if (!(file instanceof TFile2) || file.extension !== "md") return;
        await this._loadIncludedNoteEntry(file.path, file);
        await this.saveConversation();
        this.updateNoteInfo();
      }
      // Try to find a note by display name/title and include it
      async addIncludedNoteByName(name) {
        if (!name) return;
        try {
          if (typeof name === "string" && name.startsWith("obsidian://")) {
            const url = new URL(name);
            const fileParam = url.searchParams.get("file");
            if (fileParam) {
              const decoded = decodeURIComponent(fileParam);
              const candidatePath = decoded.replace(/^\//, "");
              return await this.addIncludedNoteByPath(candidatePath);
            }
          }
        } catch (e) {
        }
        const vaultFiles = this.app.vault.getFiles();
        const lower = name.toLowerCase();
        let match = vaultFiles.find((f) => f.basename.toLowerCase() === lower || f.path.toLowerCase() === lower || f.name.toLowerCase() === lower);
        if (!match) {
          match = vaultFiles.find((f) => f.basename.toLowerCase().includes(lower) || f.path.toLowerCase().includes(lower));
        }
        if (!match) {
          let label = name;
          try {
            if (name.startsWith("obsidian://")) {
              const url = new URL(name);
              const fileParam = url.searchParams.get("file");
              if (fileParam) label = decodeURIComponent(fileParam);
            }
          } catch (_) {
          }
          this.addMessageToHistory("system", `No note found matching "${label}"`);
          return;
        }
        await this._loadIncludedNoteEntry(match.path, match);
        await this.saveConversation();
        this.updateNoteInfo();
      }
      // Load a file's content and add to includedNotes map
      async _loadIncludedNoteEntry(path, file) {
        return this.stateSvc.loadIncludedNoteEntry(path, file);
      }
      renderChatHistory() {
        if (!this.chatMessagesEl) return;
        this.uiSvc.renderChatHistory();
      }
      renderDiscussionHistory() {
        if (!this.discussionHistoryPanel) return;
        this.uiSvc.renderDiscussionHistory();
      }
      renderGlobalHistory() {
        if (!this.globalHistoryPanel) return;
        this.uiSvc.renderGlobalHistory();
      }
      deleteDiscussion(discussionId, noteFilePath = null) {
        const targetPath = noteFilePath || this.currentNoteFile?.path;
        if (!targetPath) return;
        try {
          const noteDiscussions = this.discussions.get(targetPath);
          const title = noteDiscussions && noteDiscussions.has(discussionId) ? noteDiscussions.get(discussionId).title || "Untitled" : "Discussion";
          const modal = new ConfirmModal(this.app, `Are you sure you want to delete discussion "${title}"? This cannot be undone.`, () => {
            try {
              const noteDiscussions2 = this.discussions.get(targetPath);
              if (noteDiscussions2) {
                noteDiscussions2.delete(discussionId);
                if (noteDiscussions2.size === 0) {
                  this.discussions.delete(targetPath);
                }
              }
              this.globalDiscussionHistory = this.globalDiscussionHistory.filter((d) => d.id !== discussionId);
              if (this.currentDiscussionId === discussionId) {
                this.currentDiscussionId = null;
                this.chatHistory = [];
                this.userMessageHistory = [];
                this.messageHistoryIndex = -1;
                this.renderChatHistory();
              }
              this.renderDiscussionHistory();
              this.renderGlobalHistory();
              this.saveConversation();
              this.addMessageToHistory("system", "Discussion deleted.");
            } catch (e) {
              console.error("Error deleting discussion:", e);
              notifyError("Failed to delete discussion. See console for details.", e);
            }
          });
          modal.open();
        } catch (e) {
          console.error("Confirm modal failed", e);
        }
      }
      // normalizeMessage is provided by chat-utils.js
      async clearChat() {
        if (this.currentDiscussionId && this.chatHistory.length > 0) {
          await this._saveCurrentDiscussion();
        }
        this.chatHistory = [];
        this.userMessageHistory = [];
        this.messageHistoryIndex = -1;
        this.currentDiscussionId = null;
        this.renderChatHistory();
        await this.saveConversation();
      }
      navigateMessageHistory(direction) {
        if (this.userMessageHistory.length === 0) return;
        this.messageHistoryIndex += direction;
        if (this.messageHistoryIndex < -1) {
          this.messageHistoryIndex = -1;
        } else if (this.messageHistoryIndex >= this.userMessageHistory.length) {
          this.messageHistoryIndex = this.userMessageHistory.length - 1;
        }
        if (this.messageHistoryIndex === -1) {
          this.messageInput.value = "";
        } else {
          this.messageInput.value = this.userMessageHistory[this.userMessageHistory.length - 1 - this.messageHistoryIndex];
        }
        this.autoResizeTextarea();
      }
      autoResizeTextarea() {
        if (!this._autoResizer && this.messageInput) {
          try {
            const creator = require_chat_helpers().createAutoResizer;
            this._autoResizer = creator(this.messageInput, 200);
          } catch (e) {
            const textarea = this.messageInput;
            if (!textarea) return;
            textarea.style.height = "auto";
            const newHeight = Math.min(textarea.scrollHeight, 200);
            textarea.style.height = newHeight + "px";
            return;
          }
        }
        if (this._autoResizer) this._autoResizer();
      }
      async testApiConnection() {
        const testId = this.addMessageToHistory("system", "Testing API connection...");
        try {
          await this.plugin.llmService.testApi();
          this.updateMessageInHistory(testId, "\u2705 API connection successful! Your API key and endpoint are working correctly.");
        } catch (error) {
          console.error("API test error:", error);
          let errorMessage = "\u274C API test failed: ";
          if (error.message.includes("status 401")) {
            errorMessage += "Authentication failed. Your API key is invalid or expired.\n\nSteps to fix:\n1. Check your OpenRouter dashboard\n2. Verify your API key is active\n3. Ensure your account has credits";
          } else if (error.message.includes("status 403")) {
            errorMessage += "Access forbidden. Your API key may not have permission for the selected model.";
          } else {
            errorMessage += error.message;
          }
          this.updateMessageInHistory(testId, errorMessage);
        }
      }
      toggleSearch() {
        const searchTerm = prompt("Search conversation:");
        if (!searchTerm) return;
        const matches = this.chatHistory.filter(
          (msg) => msg.content.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (matches.length === 0) {
          this.addMessageToHistory("system", `No messages found containing "${searchTerm}"`);
          return;
        }
        let resultText = `Found ${matches.length} message(s) containing "${searchTerm}":

`;
        matches.forEach((msg, index) => {
          const time = msg.timestamp.toLocaleTimeString();
          const preview = msg.content.length > 100 ? msg.content.substring(0, 100) + "..." : msg.content;
          resultText += `${index + 1}. [${time}] ${msg.role}: ${preview}

`;
        });
        this.addMessageToHistory("system", resultText);
      }
      async exportConversation() {
        if (this.chatHistory.length === 0) {
          this.addMessageToHistory("system", "No conversation to export.");
          return;
        }
        const exportData = {
          paper: this.currentNoteFile?.basename || "Unknown",
          exportDate: (/* @__PURE__ */ new Date()).toISOString(),
          messageCount: this.chatHistory.length,
          conversation: this.chatHistory.map((msg) => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp.toISOString()
          }))
        };
        const exportText = `# Chat Export: ${exportData.paper}
Exported: ${(/* @__PURE__ */ new Date()).toLocaleString()}
Messages: ${exportData.messageCount}

---

${exportData.conversation.map((msg) => `**${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}** (${new Date(msg.timestamp).toLocaleString()}):
${msg.content}

---`).join("\n")}`;
        try {
          await navigator.clipboard.writeText(exportText);
          this.addMessageToHistory("system", "\u2705 Conversation exported to clipboard!");
        } catch (error) {
          console.error("Export failed:", error);
          this.addMessageToHistory("system", "\u274C Failed to export conversation. Check console for details.");
        }
      }
      addStyles() {
        this.uiSvc.addStyles();
      }
      async onClose() {
        this.chatHistory = [];
      }
    };
    module2.exports = { ChatPanelView: ChatPanelView2, CHAT_PANEL_VIEW_TYPE: CHAT_PANEL_VIEW_TYPE2 };
  }
});

// ui/paper-modal.js
var require_paper_modal = __commonJS({
  "ui/paper-modal.js"(exports2, module2) {
    "use strict";
    var { Modal, Notice: Notice3 } = require("obsidian");
    var PaperModal2 = class extends Modal {
      constructor(app, plugin, onSubmit) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
      }
      async onOpen() {
        const { contentEl } = this;
        this.createInstructions(contentEl);
        const input = this.createUrlInput(contentEl);
        const { sectorSelect, newSectorInput } = await this.createSectorSelection(contentEl);
        const { button, spinner } = this.createSubmitButton(contentEl);
        this.setupSubmitHandler(button, spinner, input, sectorSelect, newSectorInput);
      }
      createInstructions(contentEl) {
        contentEl.createEl("div", {
          text: "Enter the arXiv URL or a direct PDF link of the research paper:"
        });
      }
      createUrlInput(contentEl) {
        const input = contentEl.createEl("input", {
          type: "text",
          placeholder: "https://arxiv.org/abs/...  OR  https://domain.com/paper.pdf"
        });
        input.style.width = "100%";
        input.style.marginTop = "10px";
        return input;
      }
      async createSectorSelection(contentEl) {
        contentEl.createEl("div", { text: "Select research sector:" });
        const sectorSelect = contentEl.createEl("select");
        sectorSelect.style.width = "100%";
        sectorSelect.style.marginTop = "6px";
        const sectors = await this.plugin.paperService.getAvailableSectors();
        for (const s of sectors) {
          sectorSelect.createEl("option", { text: s, value: s });
        }
        sectorSelect.value = this.plugin.settings.defaultSector || "Other";
        const newSectorInput = contentEl.createEl("input", {
          type: "text",
          placeholder: "Or type a new sector name"
        });
        newSectorInput.style.width = "100%";
        newSectorInput.style.marginTop = "6px";
        return { sectorSelect, newSectorInput };
      }
      createSubmitButton(contentEl) {
        const buttonContainer = contentEl.createEl("div", { cls: "button-container" });
        buttonContainer.style.display = "flex";
        buttonContainer.style.justifyContent = "center";
        const button = buttonContainer.createEl("button", { text: "Add Paper" });
        button.style.marginTop = "20px";
        this.addSpinnerStyles();
        const spinner = buttonContainer.createEl("div", { cls: "ra-spinner" });
        spinner.style.display = "none";
        spinner.style.border = "4px solid rgba(0,0,0,0.1)";
        spinner.style.borderTop = "4px solid var(--interactive-accent)";
        spinner.style.borderRadius = "50%";
        spinner.style.width = "18px";
        spinner.style.height = "18px";
        spinner.style.marginLeft = "8px";
        spinner.style.animation = "ra-spin 1s linear infinite";
        return { button, spinner };
      }
      addSpinnerStyles() {
        if (!document.getElementById("ra-spinner-style")) {
          const style = document.createElement("style");
          style.id = "ra-spinner-style";
          style.textContent = `@keyframes ra-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
          document.head.appendChild(style);
        }
      }
      setupSubmitHandler(button, spinner, input, sectorSelect, newSectorInput) {
        button.addEventListener("click", async () => {
          const url = input.value.trim();
          if (!url) return;
          let sector = sectorSelect.value;
          const newSector = newSectorInput.value.trim();
          if (newSector) {
            sector = newSector;
            if (!this.plugin.settings.sectors.includes(newSector)) {
              this.plugin.settings.sectors.push(newSector);
              await this.plugin.saveSettings();
            }
          }
          await this.handleSubmission(button, spinner, input, sectorSelect, newSectorInput, url, sector);
        });
      }
      async handleSubmission(button, spinner, input, sectorSelect, newSectorInput, url, sector) {
        const originalBtnText = button.textContent;
        try {
          this.setLoadingState(true, button, spinner, input, sectorSelect, newSectorInput);
          await this.onSubmit(url, sector);
          this.close();
        } catch (err) {
          new Notice3("Error adding paper: " + (err && err.message ? err.message : String(err)));
        } finally {
          this.setLoadingState(false, button, spinner, input, sectorSelect, newSectorInput, originalBtnText);
        }
      }
      setLoadingState(loading, button, spinner, input, sectorSelect, newSectorInput, originalText = "Add Paper") {
        button.disabled = loading;
        input.disabled = loading;
        sectorSelect.disabled = loading;
        newSectorInput.disabled = loading;
        spinner.style.display = loading ? "inline-block" : "none";
        button.textContent = loading ? "Adding..." : originalText;
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    module2.exports = PaperModal2;
  }
});

// ui/settings-tab.js
var require_settings_tab = __commonJS({
  "ui/settings-tab.js"(exports2, module2) {
    "use strict";
    var { PluginSettingTab, Setting } = require("obsidian");
    var RASettingTab2 = class extends PluginSettingTab {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
      }
      async display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Research Assistant Settings" });
        this.createFolderSettings(containerEl);
        this.createApiSettings(containerEl);
        await this.createSectorSettings(containerEl);
      }
      createFolderSettings(containerEl) {
        new Setting(containerEl).setName("PDF Download Folder").setDesc("The folder to save papers and notes.").addText((text) => text.setPlaceholder("e.g., _research-papers").setValue(this.plugin.settings.pdfDownloadFolder).onChange(async (value) => {
          this.plugin.settings.pdfDownloadFolder = value || "_research-papers";
          await this.plugin.saveSettings();
          await this.plugin.rebuildAndRefresh();
        }));
        new Setting(containerEl).setName("Hide folder from Files").setDesc('Prefix the folder name with a dot (e.g., ".research-papers") to hide it. This will move the existing folder and its contents.').addToggle((toggle) => toggle.setValue(this.plugin.settings.hideFolderFromFiles).onChange(async (value) => {
          await this.plugin.fileService.toggleFolderVisibility(
            value,
            () => this.plugin.saveSettings(),
            () => this.plugin.rebuildAndRefresh()
          );
        }));
      }
      createApiSettings(containerEl) {
        containerEl.createEl("h3", { text: "Summarization API Settings" });
        new Setting(containerEl).setName("API Endpoint URL").addText((text) => text.setPlaceholder("https://api.openai.com/v1/chat/completions").setValue(this.plugin.settings.summaryApiEndpoint).onChange(async (value) => {
          this.plugin.settings.summaryApiEndpoint = value;
          await this.plugin.saveSettings();
        }));
        new Setting(containerEl).setName("Model Name").addText((text) => text.setPlaceholder("gpt-4-turbo").setValue(this.plugin.settings.summaryApiModel).onChange(async (value) => {
          this.plugin.settings.summaryApiModel = value;
          await this.plugin.saveSettings();
        }));
        new Setting(containerEl).setName("API Key").addText((text) => text.setPlaceholder("sk-xxxxxxxxxxxx").setValue(this.plugin.settings.summaryApiKey).onChange(async (value) => {
          this.plugin.settings.summaryApiKey = value;
          await this.plugin.saveSettings();
        }));
      }
      async createSectorSettings(containerEl) {
        containerEl.createEl("h3", { text: "Research Sectors" });
        const availableSectors = await this.plugin.paperService.getAvailableSectors();
        if (!availableSectors.includes(this.plugin.settings.defaultSector)) {
          const fallback = availableSectors.includes("Other") ? "Other" : availableSectors[0] || "Other";
          this.plugin.settings.defaultSector = fallback;
          await this.plugin.saveSettings();
        }
        new Setting(containerEl).setName("Default Sector").setDesc("Sector selected by default when adding new papers.").addDropdown((drop) => {
          drop.addOptions(Object.fromEntries(availableSectors.map((s) => [s, s])));
          try {
            drop.setValue(this.plugin.settings.defaultSector);
          } catch (e) {
            drop.setValue(availableSectors[0] || "Other");
          }
          drop.onChange(async (value) => {
            this.plugin.settings.defaultSector = value;
            await this.plugin.saveSettings();
          });
        });
        this.createSectorManagement(containerEl, availableSectors);
      }
      createSectorManagement(containerEl, availableSectors) {
        new Setting(containerEl).setName("Manage Sectors").setDesc("Add or remove sectors. Folders found on disk are automatically included.");
        const sectorsWrap = containerEl.createEl("div", { cls: "sectors-wrap" });
        availableSectors.forEach((sector) => {
          const isManaged = this.plugin.settings.sectors.includes(sector);
          const isDiscovered = !isManaged;
          const setting = new Setting(sectorsWrap).setName(sector);
          if (isDiscovered) {
            setting.setDesc("Discovered from folder");
          }
          if (isManaged && sector !== "Other") {
            setting.addButton((button) => {
              button.setButtonText("Remove").onClick(async () => {
                this.plugin.settings.sectors = this.plugin.settings.sectors.filter((s) => s !== sector);
                if (this.plugin.settings.defaultSector === sector) {
                  this.plugin.settings.defaultSector = "Other";
                }
                await this.plugin.saveSettings();
                this.display();
              });
            });
          }
        });
        this.createNewSectorInput(containerEl);
      }
      createNewSectorInput(containerEl) {
        new Setting(containerEl).setName("Add new sector").addText((text) => {
          text.setPlaceholder("New sector name");
          text.inputEl.addEventListener("keydown", async (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const value = text.getValue().trim();
              if (value && !this.plugin.settings.sectors.includes(value)) {
                this.plugin.settings.sectors.push(value);
                await this.plugin.fileService.ensureFolderExists(`${this.plugin.settings.pdfDownloadFolder}/${value}`);
                await this.plugin.saveSettings();
                text.setValue("");
                this.display();
              }
            }
          });
        });
      }
    };
    module2.exports = RASettingTab2;
  }
});

// plugin.js
var { Plugin, Notice: Notice2, TFile } = require("obsidian");
var { DEFAULT_SETTINGS } = require_constants();
var LLMService = require_llm_service();
var MetadataService = require_metadata_service();
var FileService = require_file_service();
var PaperService = require_paper_service();
var PdfService = require_pdf_service();
var { PaperExplorerView, PAPER_EXPLORER_VIEW_TYPE } = require_paper_explorer_view();
var { ChatPanelView, CHAT_PANEL_VIEW_TYPE } = require_chat_panel_view();
var PaperModal = require_paper_modal();
var RASettingTab = require_settings_tab();
var { generatePdfFileName } = require_formatters();
var ResearchAssistantPlugin = class extends Plugin {
  constructor() {
    super(...arguments);
    this._activeSector = "All";
  }
  async onload() {
    await this.loadSettings();
    this.initializeServices();
    this.setupEventHandlers();
    this.registerViews();
    this.registerCommands();
    this.addSettingTab(new RASettingTab(this.app, this));
  }
  initializeServices() {
    this.llmService = new LLMService(this.settings);
    this.metadataService = new MetadataService();
    this.fileService = new FileService(this.app, this.settings);
    this.pdfService = new PdfService(this.app, this.settings);
    this.paperService = new PaperService(this.app, this.settings, this.fileService, this.pdfService);
  }
  setupEventHandlers() {
    this.app.workspace.onLayoutReady(async () => {
      await this.paperService.buildPaperIndex();
      this.registerEvent(this.app.vault.on("create", this.handleFileCreate.bind(this)));
      this.registerEvent(this.app.vault.on("delete", this.handleFileDelete.bind(this)));
      this.registerEvent(this.app.vault.on("rename", this.handleFileRename.bind(this)));
      this.registerEvent(this.app.metadataCache.on("changed", this.handleMetadataChange.bind(this)));
    });
  }
  registerViews() {
    this.registerView(
      PAPER_EXPLORER_VIEW_TYPE,
      (leaf) => new PaperExplorerView(leaf, this.settings, this)
    );
    this.registerView(
      CHAT_PANEL_VIEW_TYPE,
      (leaf) => new ChatPanelView(leaf, this.settings, this)
    );
    this.addRibbonIcon("library", "Open Paper Explorer", () => {
      this.openMasterIndexInMainView().then(() => this.activateView());
    });
    this.addRibbonIcon("message-circle", "Open Note Chat", () => {
      this.activateChatView();
    });
  }
  registerCommands() {
    this.addCommand({
      id: "add-research-paper",
      name: "Add Research Paper",
      callback: () => this.openAddPaperModal()
    });
    this.addCommand({
      id: "open-paper-explorer",
      name: "Open Paper Explorer",
      callback: () => {
        this.openMasterIndexInMainView().then(() => this.activateView());
      }
    });
    this.addCommand({
      id: "generate-resume-all-papers",
      name: "Generate Resume for All Papers",
      callback: () => this.paperService.generateResumeForPapers(this.llmService)
    });
    this.addCommand({
      id: "generate-tags-all-papers",
      name: "Generate Tags for All Papers",
      callback: () => this.paperService.generateTagsForPapers(this.llmService)
    });
    this.addCommand({
      id: "clean-resume-sections",
      name: "Clean Resume Sections from All Papers",
      callback: async () => {
        try {
          await this.paperService.buildPaperIndex();
          await this.paperService.cleanAllResumes();
          await this.rebuildAndRefresh();
        } catch (err) {
          new Notice2("Failed to clean resume sections: " + (err && err.message ? err.message : String(err)));
        }
      }
    });
    this.addCommand({
      id: "test-llm-api",
      name: "Test LLM API Configuration",
      callback: () => this.testLLMApi()
    });
    this.addCommand({
      id: "rebuild-paper-index",
      name: "Rebuild Paper Index",
      callback: async () => {
        new Notice2("Rebuilding paper index...");
        await this.rebuildAndRefresh();
        new Notice2("Paper index rebuilt.");
      }
    });
    this.addCommand({
      id: "generate-resume-current-note",
      name: "Generate Resume for Current Note",
      callback: () => this.generateResumeForCurrentNote()
    });
    this.addCommand({
      id: "open-note-chat",
      name: "Open Note Chat Panel",
      callback: () => this.activateChatView()
    });
  }
  async handleFileCreate(file) {
    if (file instanceof TFile && this.paperService.isPaperFile(file)) {
      const paperData = await this.paperService.parsePaperFile(file);
      if (paperData) {
        this.paperService.paperIndex.set(file.path, paperData);
        this.paperService.scheduleRebuild(300, () => this.rebuildAndRefresh());
      }
    }
  }
  async handleFileDelete(file) {
    if (this.paperService.paperIndex.has(file.path)) {
      this.paperService.paperIndex.delete(file.path);
      this.paperService.scheduleRebuild(300, () => this.rebuildAndRefresh());
    }
  }
  async handleFileRename(file, oldPath) {
    if (this.paperService.paperIndex.has(oldPath)) {
      this.paperService.paperIndex.delete(oldPath);
    }
    if (file instanceof TFile && this.paperService.isPaperFile(file)) {
      const paperData = await this.paperService.parsePaperFile(file);
      if (paperData) {
        this.paperService.paperIndex.set(file.path, paperData);
      }
    }
    this.paperService.scheduleRebuild(300, () => this.rebuildAndRefresh());
  }
  async handleMetadataChange(file) {
    if (this.paperService.paperIndex.has(file.path)) {
      const paperData = await this.paperService.parsePaperFile(file);
      if (paperData) {
        this.paperService.paperIndex.set(file.path, paperData);
        this.paperService.scheduleRebuild(300, () => this.rebuildAndRefresh());
      }
    }
  }
  async processNewPaper(url, sector) {
    try {
      new Notice2("Fetching paper data...");
      const metadata = await this.metadataService.getMetadataFromUrl(url);
      const useSector = sector || this.settings.defaultSector || "Other";
      const pdfFileName = generatePdfFileName(metadata);
      const pdfLogicalPath = await this.fileService.downloadPdf(metadata, useSector, pdfFileName);
      await this.fileService.createPaperNote(metadata, useSector, pdfLogicalPath);
      new Notice2(`Successfully added '${metadata.title}'!`);
      this.activateView();
      this.paperService.scheduleRebuild(150, () => this.rebuildAndRefresh());
    } catch (error) {
      new Notice2(`Error: ${error.message}`, 1e4);
    }
  }
  async deletePaper(noteFile) {
    const paperData = this.paperService.paperIndex.get(noteFile.path);
    await this.fileService.deletePaper(noteFile, paperData);
    this.paperService.scheduleRebuild(150, () => this.rebuildAndRefresh());
  }
  async testLLMApi() {
    try {
      new Notice2("Testing LLM API configuration...");
      await this.llmService.testApi();
      new Notice2("\u2705 LLM API test successful!");
    } catch (error) {
      new Notice2(`\u274C LLM API test failed: ${error.message}`);
    }
  }
  async generateResumeForCurrentNote() {
    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice2("No active file found.");
        return;
      }
      if (activeFile.extension === "pdf") {
        new Notice2("Generating resume for current PDF...");
        let pdfText = "";
        try {
          pdfText = await this.pdfService.extractTextFromPdf(activeFile);
        } catch (e) {
          new Notice2("\u274C Failed to extract PDF text: " + (e?.message || String(e)));
          return;
        }
        const resume2 = await this.llmService.getSummary(pdfText);
        const folderPath = activeFile.parent?.path || "";
        const mdPath = `${folderPath}/${activeFile.basename}.md`;
        let noteFile = this.app.vault.getAbstractFileByPath(mdPath);
        if (!(noteFile instanceof TFile)) {
          await this.app.vault.create(mdPath, `---
Title: "${activeFile.basename}"
---

## Paper PDF
![[${activeFile.path}]]
`);
          noteFile = this.app.vault.getAbstractFileByPath(mdPath);
        }
        if (!(noteFile instanceof TFile)) {
          new Notice2("\u274C Could not create or open sidecar note for PDF.");
          return;
        }
        await this.insertResumeIntoNote(noteFile, resume2);
        new Notice2(`\u2705 Resume generated for PDF '${activeFile.basename}' and saved to '${noteFile.basename}.md'!`);
        return;
      }
      if (activeFile.extension !== "md") {
        new Notice2("Active file is not a markdown note or PDF.");
        return;
      }
      new Notice2("Generating resume for current note...");
      const noteContent = await this.app.vault.read(activeFile);
      let contentToSummarize = noteContent;
      const paperData = this.paperService.paperIndex.get(activeFile.path);
      if (paperData && paperData.frontmatter && paperData.frontmatter.pdf_file) {
        try {
          let logicalPath = String(paperData.frontmatter.pdf_file);
          if (!logicalPath.includes("/") && activeFile.parent && activeFile.parent.path) {
            logicalPath = `${activeFile.parent.path}/${logicalPath}`;
          }
          const effectivePath = await this.fileService.resolveLogicalToEffectivePath(logicalPath);
          const pdfFile = this.app.vault.getAbstractFileByPath(effectivePath);
          if (pdfFile instanceof TFile && pdfFile.extension === "pdf") {
            new Notice2("Found associated PDF, extracting text...");
            const pdfText = await this.pdfService.extractTextFromPdf(pdfFile);
            contentToSummarize = `Note Content:
${noteContent}

--- Associated PDF Content ---
${pdfText}`;
          }
        } catch (pdfError) {
          new Notice2("Using note content only (PDF extraction failed)");
        }
      }
      const resume = await this.llmService.getSummary(contentToSummarize);
      await this.insertResumeIntoNote(activeFile, resume);
      new Notice2(`\u2705 Resume generated for '${activeFile.basename}'!`);
    } catch (error) {
      new Notice2(`\u274C Failed to generate resume: ${error.message}`, 8e3);
    }
  }
  async insertResumeIntoNote(noteFile, resume) {
    const content = await this.app.vault.read(noteFile);
    const resumeStartRegex = /^#{1,6}\s+(?:Resume|Résumé|Summary)\s*:?\s*$/im;
    const nextHeadingRegex = /^#{1,6}\s+/m;
    const startMatch = content.match(resumeStartRegex);
    if (startMatch) {
      const startOfHeading = startMatch.index;
      const endOfHeadingLine = startMatch.index + startMatch[0].length;
      const remainingContent = content.slice(endOfHeadingLine);
      const endMatch = remainingContent.match(nextHeadingRegex);
      const endIndex = endMatch ? endOfHeadingLine + endMatch.index : content.length;
      const sectionBody = content.slice(endOfHeadingLine, endIndex);
      const embedRegex = /!\[\[[^\]]*\.pdf[^\]]*\]\]/ig;
      const embeds = sectionBody.match(embedRegex) || [];
      const embedsBlock = embeds.length ? embeds.join("\n") + "\n\n" : "";
      const replacement = `## Resume

${resume}

${embedsBlock}`;
      const newContent = content.slice(0, startOfHeading) + replacement + content.slice(endIndex);
      await this.app.vault.modify(noteFile, newContent);
    } else {
      const needsLeadingNewline = content.length > 0 && !content.endsWith("\n\n");
      const prefix = needsLeadingNewline ? content.endsWith("\n") ? "\n" : "\n\n" : "";
      const newContent = content + `${prefix}## Resume

${resume}
`;
      await this.app.vault.modify(noteFile, newContent);
    }
  }
  openAddPaperModal() {
    new PaperModal(this.app, this, async (url, sector) => {
      return await this.processNewPaper(url, sector);
    }).open();
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(PAPER_EXPLORER_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeftLeaf(false);
      await leaf.setViewState({
        type: PAPER_EXPLORER_VIEW_TYPE,
        active: true
      });
    }
    workspace.revealLeaf(leaf);
  }
  async activateChatView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(CHAT_PANEL_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({
        type: CHAT_PANEL_VIEW_TYPE,
        active: true
      });
    }
    workspace.revealLeaf(leaf);
  }
  refreshPaperExplorerView() {
    const leaves = this.app.workspace.getLeavesOfType(PAPER_EXPLORER_VIEW_TYPE);
    leaves.forEach((leaf) => {
      if (leaf.view instanceof PaperExplorerView) {
        leaf.view.renderView();
      }
    });
  }
  async openMasterIndexInMainView() {
    const indexPath = `_papers_index.md`;
    await this.fileService.ensureFolderExists(this.settings.pdfDownloadFolder);
    if (!await this.app.vault.adapter.exists(indexPath)) {
      await this.paperService.updateMasterIndex();
    }
    const file = this.app.vault.getAbstractFileByPath(indexPath);
    if (file instanceof TFile) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    }
  }
  // INDEX MANAGEMENT
  async rebuildAndRefresh() {
    await this.paperService.buildPaperIndex();
    await this.fileService.cleanEmptySectorFolders();
    await this.paperService.pruneUnusedSectors(() => this.saveSettings());
    await this.refreshAllArtifacts();
  }
  async refreshAllArtifacts() {
    this.refreshPaperExplorerView();
    await this.paperService.updateMasterIndex();
  }
  // SETTINGS
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
    if (this.llmService) {
      this.llmService.settings = this.settings;
    }
    if (this.fileService) {
      this.fileService.settings = this.settings;
    }
    if (this.paperService) {
      this.paperService.settings = this.settings;
    }
  }
  onunload() {
    if (this.paperService) {
      this.paperService.paperIndex.clear();
    }
  }
};
module.exports = ResearchAssistantPlugin;
//# sourceMappingURL=main.js.map
