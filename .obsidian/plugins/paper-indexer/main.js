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
      /**
       * Centralized LLM call wrapper
       * @param {Object} requestBody - The request body for the API
       * @returns {Promise<string>} The response content
       */
      async callLLM(requestBody) {
        if (!this.settings.summaryApiEndpoint || !this.settings.summaryApiModel) {
          throw new Error("API endpoint or model is not configured in settings.");
        }
        if (!this.settings.summaryApiKey) {
          throw new Error("API key is not configured in settings.");
        }
        console.log("LLM API Call Debug:", {
          endpoint: this.settings.summaryApiEndpoint,
          model: this.settings.summaryApiModel,
          keyPresent: !!this.settings.summaryApiKey,
          keyPrefix: this.settings.summaryApiKey?.substring(0, 10) + "..."
        });
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
          console.log("LLM API Response Debug:", {
            status: res.status,
            headers: res.headers,
            textLength: res.text?.length || 0
          });
          if (res && typeof res.status === "number" && res.status >= 400) {
            const msg = res.text || JSON.stringify(res.json || res);
            console.error("LLM API Error Details:", { status: res.status, response: msg });
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
      /**
       * Generic LLM prompt function
       * @param {string} systemPrompt - System message
       * @param {string} userContent - User message content
       * @returns {Promise<string>} LLM response
       */
      async callLLMWithPrompt(systemPrompt, userContent) {
        console.log("LLM Prompt:", { systemPrompt, userContent });
        console.log("LLM Prompt Length:", { systemPrompt: systemPrompt.length, userContent: userContent.length });
        const requestBody = {
          model: this.settings.summaryApiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
          ]
        };
        return await this.callLLM(requestBody);
      }
      /**
       * Get LLM summary of paper content
       * @param {string} text - Paper content to summarize
       * @returns {Promise<string>} Summary
       */
      async getSummary(text) {
        return this.callLLMWithPrompt(
          `=== Comprehensive Academic Article Summarizer ===
<System>:

You are an Expert Academic Summarizer with a deep understanding of research methodologies, theoretical frameworks, and scholarly discourse. Your summaries maintain rigorous accuracy, capturing key arguments, methodologies, limitations, and implications without oversimplification. You avoid reducing complex ideas into mere bullet points while ensuring clarity and organization.

When details are unclear, explicitly indicate gaps rather than filling them with assumptions. Where possible, use direct excerpts to preserve the integrity of the author\u2019s argument.
<Context>:

The user will provide an academic article (journal paper, thesis, white paper, or research report) they want thoroughly summarized. They value in-depth understanding over quick takeaways, emphasizing research design, argumentation structure, and scholarly context.
<Instructions>:

    Identify the article\u2019s metadata (if available):

        Title:

        Author(s):

        Publication Date:

        Journal/Publisher:

        Field/Discipline:

        DOI/Link (if applicable):

    Adapt summarization depth based on article type:

        Empirical Studies \u2192 Focus on research question, methodology, data, results, and limitations.

        Theoretical Papers \u2192 Focus on central arguments, frameworks, and implications.

        Literature Reviews \u2192 Emphasize major themes, key sources, and synthesis of perspectives.

        Meta-Analyses \u2192 Highlight statistical techniques, key findings, and research trends.

    Include a multi-layered summary with these components:

        (Optional) Executive Summary: A 3-5 sentence quick overview of the article.

        Research Question & Objectives: Clearly define what the study aims to investigate.

        Core Argument or Hypothesis: Summarize the main thesis or hypothesis tested.

        Key Findings & Conclusions: Present the most important results and takeaways.

        Methodology & Data: Describe how the study was conducted, including sample size, data sources, and analytical methods.

        Theoretical Framework: Identify the theories, models, or intellectual traditions informing the study.

        Results & Interpretation: Summarize key data points, statistical analyses, and their implications.

        Limitations & Critiques: Note methodological constraints, potential biases, and gaps in the study.

        Scholarly Context: Discuss how this paper fits into existing research, citing related works.

        Practical & Theoretical Implications: Explain how the findings contribute to academia, policy, or real-world applications.

    Handle uncertainty and gaps responsibly:

        Clearly indicate when information is missing:

            \u201CThe article does not specify\u2026\u201D

            \u201CThe author implies X but does not explicitly state it\u2026\u201D

        Do not infer unstated conclusions.

        If the article presents contradictions, note them explicitly rather than resolving them artificially.

    For cited references and sources:

        Identify key studies referenced and their relevance.

        Highlight intellectual debates the paper engages with.

        If applicable, note paradigm shifts or major disagreements in the field.

<Constraints>:

\u2705 Prioritize accuracy and scholarly rigor over brevity.
\u2705 Do not introduce external information not in the original article.
\u2705 Maintain a neutral, academic tone.
\u2705 Use direct excerpts where necessary to avoid misinterpretation.
\u2705 Retain technical language where appropriate; do not oversimplify complex terms.
<Output Format>:
Comprehensive Summary of [Article Title]

Author(s): [Name(s)]
Publication Date: [Year]
Journal/Publisher: [Name]
Field/Discipline: [Field]
DOI/Link: [If available]
(Optional) Executive Summary

A high-level overview (3-5 sentences) summarizing the article\u2019s key contributions.
Research Question & Objectives

[Clearly state what the paper investigates.]
Core Argument or Hypothesis

[Summarize the main thesis or hypothesis.]
Key Findings & Conclusions

\u2022 [Finding 1]
\u2022 [Finding 2]
\u2022 (Continue as needed)
Methodology & Data

[Describe research design, sample size, data sources, and analysis methods.]
Theoretical Framework

[Identify key theories, models, or intellectual traditions used.]
Results & Interpretation

[Summarize key data points, statistical analyses, and their implications.]
Limitations & Critiques

[Discuss methodological constraints, biases, and gaps.]
Scholarly Context

[How this study builds on, contradicts, or extends previous research.]
Practical & Theoretical Implications

[Discuss how findings contribute to academia, policy, or real-world applications.]`,
          text
        );
      }
      /**
       * Generate tags for paper content
       * @param {string} text - Paper content
       * @returns {Promise<string>} Comma-separated tags
       */
      async getTags(text) {
        return this.callLLMWithPrompt(
          "You are a helpful assistant. Generate relevant academic tags for the following research paper content. Return only a comma-separated list of tags, no other text.",
          text
        );
      }
      /**
       * Generate comprehensive resume/summary
       * @param {string} text - Paper content
       * @returns {Promise<string>} Detailed resume in markdown
       */
      async getResume(text) {
        try {
          const existing = String(text || "");
          const resumeRegex = /(^|\n)#{1,6}\s*(Resume|Summary)\b[^\n]*\n([\s\S]*?)(?=\n#{1,6}\s|\n!\[\[.*?\.pdf\]\]|$)/im;
          const m = existing.match(resumeRegex);
          if (m) {
            const found = (m[0] || "").trim();
            console.log("LLMService.getResume: existing resume/summary found; skipping LLM call.");
            return found;
          }
        } catch (err) {
          console.warn("LLMService.getResume: error while checking for existing resume:", err);
        }
        return this.callLLMWithPrompt(
          `=== Comprehensive Academic Article Summarizer ===
<System>:

You are an Expert Academic Summarizer with a deep understanding of research methodologies, theoretical frameworks, and scholarly discourse. Your summaries maintain rigorous accuracy, capturing key arguments, methodologies, limitations, and implications without oversimplification. You avoid reducing complex ideas into mere bullet points while ensuring clarity and organization.

When details are unclear, explicitly indicate gaps rather than filling them with assumptions. Where possible, use direct excerpts to preserve the integrity of the author\u2019s argument.
<Context>:

The user will provide an academic article (journal paper, thesis, white paper, or research report) they want thoroughly summarized. They value in-depth understanding over quick takeaways, emphasizing research design, argumentation structure, and scholarly context.
<Instructions>:

    Identify the article\u2019s metadata (if available):

        Title:

        Author(s):

        Publication Date:

        Journal/Publisher:

        Field/Discipline:

        DOI/Link (if applicable):

    Adapt summarization depth based on article type:

        Empirical Studies \u2192 Focus on research question, methodology, data, results, and limitations.

        Theoretical Papers \u2192 Focus on central arguments, frameworks, and implications.

        Literature Reviews \u2192 Emphasize major themes, key sources, and synthesis of perspectives.

        Meta-Analyses \u2192 Highlight statistical techniques, key findings, and research trends.

    Include a multi-layered summary with these components:

        (Optional) Executive Summary: A 3-5 sentence quick overview of the article.

        Research Question & Objectives: Clearly define what the study aims to investigate.

        Core Argument or Hypothesis: Summarize the main thesis or hypothesis tested.

        Key Findings & Conclusions: Present the most important results and takeaways.

        Methodology & Data: Describe how the study was conducted, including sample size, data sources, and analytical methods.

        Theoretical Framework: Identify the theories, models, or intellectual traditions informing the study.

        Results & Interpretation: Summarize key data points, statistical analyses, and their implications.

        Limitations & Critiques: Note methodological constraints, potential biases, and gaps in the study.

        Scholarly Context: Discuss how this paper fits into existing research, citing related works.

        Practical & Theoretical Implications: Explain how the findings contribute to academia, policy, or real-world applications.

    Handle uncertainty and gaps responsibly:

        Clearly indicate when information is missing:

            \u201CThe article does not specify\u2026\u201D

            \u201CThe author implies X but does not explicitly state it\u2026\u201D

        Do not infer unstated conclusions.

        If the article presents contradictions, note them explicitly rather than resolving them artificially.

    For cited references and sources:

        Identify key studies referenced and their relevance.

        Highlight intellectual debates the paper engages with.

        If applicable, note paradigm shifts or major disagreements in the field.

<Constraints>:

\u2705 Prioritize accuracy and scholarly rigor over brevity.
\u2705 Do not introduce external information not in the original article.
\u2705 Maintain a neutral, academic tone.
\u2705 Use direct excerpts where necessary to avoid misinterpretation.
\u2705 Retain technical language where appropriate; do not oversimplify complex terms.
<Output Format>:
Comprehensive Summary of [Article Title]

Author(s): [Name(s)]
Publication Date: [Year]
Journal/Publisher: [Name]
Field/Discipline: [Field]
DOI/Link: [If available]
(Optional) Executive Summary

A high-level overview (3-5 sentences) summarizing the article\u2019s key contributions.
Research Question & Objectives

[Clearly state what the paper investigates.]
Core Argument or Hypothesis

[Summarize the main thesis or hypothesis.]
Key Findings & Conclusions

\u2022 [Finding 1]
\u2022 [Finding 2]
\u2022 (Continue as needed)
Methodology & Data

[Describe research design, sample size, data sources, and analysis methods.]
Theoretical Framework

[Identify key theories, models, or intellectual traditions used.]
Results & Interpretation

[Summarize key data points, statistical analyses, and their implications.]
Limitations & Critiques

[Discuss methodological constraints, biases, and gaps.]
Scholarly Context

[How this study builds on, contradicts, or extends previous research.]
Practical & Theoretical Implications

[Discuss how findings contribute to academia, policy, or real-world applications.]`,
          text
        );
      }
      /**
       * Test API configuration
       * @returns {Promise<string>} Test response
       */
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
      /**
       * Extract arXiv ID from URL
       * @param {string} url - arXiv URL
       * @returns {string|null} Extracted arXiv ID
       */
      extractArxivId(url) {
        const regex = /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?|[a-zA-Z\-\.]+\/\d{7})/;
        const match = url.match(regex);
        return match ? match[1] : null;
      }
      /**
       * Check if URL is a direct PDF link
       * @param {string} url - URL to check
       * @returns {boolean} True if direct PDF URL
       */
      isDirectPdfUrl(url) {
        try {
          const u = new URL(url);
          return /\.pdf$/i.test(u.pathname);
        } catch (_) {
          return false;
        }
      }
      /**
       * Build metadata from direct PDF URL
       * @param {string} url - Direct PDF URL
       * @returns {Object} Metadata object
       */
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
      /**
       * Fetch paper metadata from arXiv API
       * @param {string} arxivId - arXiv paper ID
       * @returns {Object} Paper metadata
       */
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
      /**
       * Get metadata from URL (either arXiv or direct PDF)
       * @param {string} url - Paper URL
       * @returns {Object} Paper metadata
       */
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
      /**
       * Get effective folder path (with dot prefix if hidden)
       * @param {string} folderPath - Base folder path
       * @returns {string} Effective path
       */
      getEffectiveFolderPath(folderPath) {
        if (this.settings.hideFolderFromFiles) {
          if (folderPath.startsWith(".")) return folderPath;
          return `.${folderPath}`;
        }
        return folderPath;
      }
      /**
       * Ensure folder exists, create if necessary
       * @param {string} folderPath - Folder path to ensure
       */
      async ensureFolderExists(folderPath) {
        const effectivePath = this.getEffectiveFolderPath(folderPath);
        if (!await this.app.vault.adapter.exists(effectivePath)) {
          await this.app.vault.createFolder(effectivePath);
        }
      }
      /**
       * Download PDF file from URL
       * @param {Object} metadata - Paper metadata
       * @param {string} sector - Research sector
       * @param {string} fileName - File name for the PDF
       * @returns {Promise<string>} Logical vault path to the PDF
       */
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
      /**
       * Create paper note file
       * @param {Object} metadata - Paper metadata
       * @param {string} sector - Research sector
       * @param {string} pdfLogicalPath - Path to the PDF file
       */
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
      /**
       * Delete paper and associated PDF
       * @param {TFile} noteFile - The note file to delete
       * @param {Object} paperData - Paper data from index
       */
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
          console.error("Error deleting paper:", error);
          new Notice3("Failed to delete paper: " + error.message);
        }
      }
      /**
       * Try to resolve a logical vault path to the actual effective path in the adapter
       * This accounts for dot-prefixed hidden folders when settings.hideFolderFromFiles is true
       * @param {string} logicalPath
       * @returns {Promise<string>} effectivePath
       */
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
      /**
       * Remove empty sector folders
       */
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
                console.warn("Failed to remove empty sector folder", folderPath, err);
              }
            }
          }
        } catch (e) {
          console.warn("cleanEmptySectorFolders error", e);
        }
      }
      /**
       * Toggle folder visibility (hide/show with dot prefix)
       * @param {boolean} hideFolder - Whether to hide the folder
       * @param {Function} saveSettings - Function to save settings
       * @param {Function} rebuildAndRefresh - Function to rebuild and refresh
       */
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
          console.error("Error toggling folder visibility:", error);
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
      /**
       * Check if file is a paper file
       * @param {TFile} file - File to check
       * @returns {boolean} True if paper file
       */
      isPaperFile(file) {
        const paperFolder = this.fileService.getEffectiveFolderPath(this.settings.pdfDownloadFolder);
        return file.path.startsWith(paperFolder) && !file.name.startsWith("_") && file.extension === "md";
      }
      /**
       * Parse paper file to extract data
       * @param {TFile} file - Paper file
       * @returns {Object|null} Paper data or null
       */
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
      /**
       * Build paper index from all markdown files
       */
      async buildPaperIndex() {
        this.paperIndex.clear();
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
          const paperData = await this.parsePaperFile(file);
          if (paperData) {
            this.paperIndex.set(file.path, paperData);
          }
        }
        console.log(`Paper index built with ${this.paperIndex.size} items.`);
      }
      /**
       * Get all available sectors from folders and settings
       * @returns {Promise<string[]>} Array of sector names
       */
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
          console.error("Research Assistant: Could not scan for sector folders.", error);
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
      /**
       * Prune unused sectors from settings
       * @param {Function} saveSettings - Function to save settings
       */
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
      /**
       * Schedule rebuild with debouncing
       * @param {number} delay - Delay in milliseconds
       * @param {Function} rebuildAndRefresh - Function to rebuild and refresh
       */
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
      /**
       * Update master index file
       */
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
              const safePdf = String(pdfFileName).replace(/\\\\/g, "/");
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
      /**
       * Process all papers with a given operation
       * @param {Object} options - Processing options
       */
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
              console.error(`Error during '${commandName}' for ${paperFile.name}:`, error);
              errorCount++;
            }
          }
          const message = `${commandName} complete! Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`;
          new Notice3(message);
        } catch (error) {
          new Notice3(`Error during ${commandName}: ${error.message}`);
          console.error(`Error during ${commandName}:`, error);
        }
      }
      /**
       * Generate resumes for all papers
       * @param {LLMService} llmService - LLM service instance
       */
      async generateResumeForPapers(llmService) {
        await this.processAllPapers({
          commandName: "Resume Generation",
          // skip if there's already a Resume or Summary heading at any level (#, ##, etc.)
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
                    console.warn(`PDF parsing yielded insufficient text for ${paperFile.path}`);
                    return;
                  }
                } else {
                  new Notice3(`\u274C PDF file not found for ${paperFile.basename}. Skipping resume generation.`);
                  console.warn(`PDF file not found at resolved path: ${effectivePath} for ${paperFile.path}`);
                  return;
                }
              } catch (err) {
                console.error("PDF extraction failed for", paperFile.path, err);
                new Notice3(`\u274C Failed to parse PDF for ${paperFile.basename}. Skipping resume generation.`);
                return;
              }
            }
            const resume = await llmService.getResume(llmInput);
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
      /**
       * Generate tags for all papers
       * @param {LLMService} llmService - LLM service instance
       */
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
      /**
       * Remove all '## Resume' or '## Summary' sections from paper files
       * This will strip the heading and all content until the next top-level heading (## or #) or end of file.
       */
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
            console.error("Failed to clean resume for", paperData.path, err);
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
      /**
       * Initialize PDF.js library - call this method to preload PDF.js
       * @returns {Promise<boolean>} true if PDF.js is now available
       */
      async initializePdfJs() {
        if (this.pdfjsLib) {
          return true;
        }
        try {
          if (this.app && typeof this.app.loadPdfJs === "function") {
            try {
              this.pdfjsLib = await this.app.loadPdfJs();
              console.log("PDF.js initialized via app.loadPdfJs()");
              return true;
            } catch (e) {
              console.warn("Failed to initialize PDF.js via app.loadPdfJs():", e);
            }
          }
          if (typeof window !== "undefined" && window.pdfjsLib) {
            this.pdfjsLib = window.pdfjsLib;
            console.log("PDF.js initialized via window.pdfjsLib");
            return true;
          }
          const pdfFiles = this.app.vault.getFiles().filter((f) => f.extension === "pdf");
          if (pdfFiles.length > 0) {
            console.log("Attempting to initialize PDF.js by opening a PDF...");
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(pdfFiles[0]);
            await new Promise((resolve) => setTimeout(resolve, 2e3));
            if (leaf.view && leaf.view.renderer && leaf.view.renderer.pdfjs) {
              this.pdfjsLib = leaf.view.renderer.pdfjs;
              console.log("PDF.js initialized via temporary PDF view");
              leaf.detach();
              return true;
            }
            leaf.detach();
          }
          return false;
        } catch (error) {
          console.error("Failed to initialize PDF.js:", error);
          return false;
        }
      }
      /**
       * Extract full text from a PDF TFile using PDF.js loaded from Obsidian.
       * Returns the extracted text (string). Throws on errors.
       * @param {TFile} pdfFile
       * @returns {Promise<string>} extracted text
       */
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
                console.log("PDF.js loaded via app.loadPdfJs()");
              } catch (e) {
                console.warn("Failed to load PDF.js via app.loadPdfJs():", e);
              }
            }
            if (!pdfjsLib && typeof window !== "undefined" && window.pdfjsLib) {
              pdfjsLib = window.pdfjsLib;
              this.pdfjsLib = pdfjsLib;
              console.log("PDF.js loaded via window.pdfjsLib");
            }
            if (!pdfjsLib && this.app.workspace) {
              try {
                const pdfViews = this.app.workspace.getLeavesOfType("pdf");
                if (pdfViews.length > 0) {
                  const pdfView = pdfViews[0].view;
                  if (pdfView && pdfView.renderer && pdfView.renderer.pdfjs) {
                    pdfjsLib = pdfView.renderer.pdfjs;
                    this.pdfjsLib = pdfjsLib;
                    console.log("PDF.js loaded via existing PDF view");
                  }
                }
              } catch (e) {
                console.warn("Failed to load PDF.js via PDF view:", e);
              }
            }
            if (!pdfjsLib) {
              try {
                console.log("Attempting to load PDF.js by opening PDF temporarily...");
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(pdfFile);
                await new Promise((resolve) => setTimeout(resolve, 1e3));
                if (leaf.view && leaf.view.renderer && leaf.view.renderer.pdfjs) {
                  pdfjsLib = leaf.view.renderer.pdfjs;
                  this.pdfjsLib = pdfjsLib;
                  console.log("PDF.js loaded via temporary PDF view");
                }
                leaf.detach();
              } catch (e) {
                console.warn("Failed to load PDF.js via temporary view:", e);
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
          console.error("PdfService.extractTextFromPdf error", error);
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
          console.warn("Error rebuilding paper index on open:", e);
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

// ui/chat-panel-view.js
var require_chat_panel_view = __commonJS({
  "ui/chat-panel-view.js"(exports2, module2) {
    "use strict";
    var { ItemView, TFile: TFile2 } = require("obsidian");
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
        this.conversations = /* @__PURE__ */ new Map();
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
        this.registerEvent(
          this.app.workspace.on("active-leaf-change", () => {
            this.updateCurrentNote();
          })
        );
        this.registerEvent(
          this.app.vault.on("modify", (file) => {
            if (file === this.currentNoteFile) {
              this.updateCurrentNote();
            }
          })
        );
      }
      async updateCurrentNote() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") {
          if (this.currentNoteFile) {
            await this.saveConversation();
          }
          this.currentNoteFile = null;
          this.currentNoteContent = "";
          this.currentPdfContent = "";
          this.chatHistory = [];
          this.userMessageHistory = [];
          this.messageHistoryIndex = -1;
          this.updateNoteInfo();
          this.renderChatHistory();
          return;
        }
        if (this.currentNoteFile && this.currentNoteFile.path !== activeFile.path) {
          await this.saveConversation();
        }
        this.currentNoteFile = activeFile;
        try {
          this.currentNoteContent = await this.app.vault.read(activeFile);
          this.currentPdfContent = "";
          this.pdfExtractionError = null;
          const paperData = this.plugin.paperService.paperIndex.get(activeFile.path);
          console.log("Chat Panel Debug - PDF Detection:", {
            activeFilePath: activeFile.path,
            paperDataExists: !!paperData,
            paperData,
            frontmatter: paperData?.frontmatter,
            pdfFile: paperData?.frontmatter?.pdf_file
          });
          if (paperData && paperData.frontmatter && paperData.frontmatter.pdf_file) {
            try {
              let logicalPath = String(paperData.frontmatter.pdf_file);
              if (!logicalPath.includes("/") && activeFile.parent && activeFile.parent.path) {
                logicalPath = `${activeFile.parent.path}/${logicalPath}`;
              }
              let effectivePath = logicalPath;
              if (this.plugin.fileService && this.plugin.fileService.resolveLogicalToEffectivePath) {
                effectivePath = await this.plugin.fileService.resolveLogicalToEffectivePath(logicalPath);
              }
              const pdfFile = this.app.vault.getAbstractFileByPath(effectivePath);
              console.log("Chat Panel Debug - PDF File:", {
                originalPdfFile: paperData.frontmatter.pdf_file,
                logicalPath,
                effectivePath,
                pdfFileExists: !!pdfFile,
                pdfFileType: pdfFile?.constructor?.name,
                pdfExtension: pdfFile?.extension
              });
              if (pdfFile instanceof TFile2 && pdfFile.extension === "pdf") {
                console.log("Chat Panel Debug - Extracting PDF text...");
                try {
                  this.currentPdfContent = await this.plugin.pdfService.extractTextFromPdf(pdfFile);
                  console.log("Chat Panel Debug - PDF extraction complete:", {
                    textLength: this.currentPdfContent.length,
                    preview: this.currentPdfContent.slice(0, 200) + "..."
                  });
                } catch (pdfExtractionError) {
                  console.warn("PDF extraction failed:", pdfExtractionError);
                  this.pdfExtractionError = pdfExtractionError.message;
                }
              }
            } catch (pdfError) {
              console.warn("Could not extract PDF content for chat:", pdfError);
            }
          }
          this.updateNoteInfo();
          await this.loadConversation();
        } catch (error) {
          console.error("Error updating current note for chat:", error);
        }
      }
      updateNoteInfo() {
        const noteInfoEl = this.contentEl.querySelector(".chat-note-info");
        if (!noteInfoEl) return;
        if (this.currentNoteFile) {
          const hasPdf = this.currentPdfContent.length > 0;
          const paperData = this.plugin.paperService.paperIndex.get(this.currentNoteFile.path);
          const pdfFile = paperData?.frontmatter?.pdf_file;
          let pdfStatusText = "";
          if (hasPdf) {
            pdfStatusText = ` \u2022 \u{1F4CB} PDF attached (${this.currentPdfContent.length} chars)`;
          } else if (pdfFile && this.pdfExtractionError) {
            if (this.pdfExtractionError.includes("PDF.js not available")) {
              pdfStatusText = ` \u2022 \u26A0\uFE0F PDF found but PDF.js not loaded - try opening a PDF file first`;
            } else {
              pdfStatusText = ` \u2022 \u26A0\uFE0F PDF extraction failed: ${this.pdfExtractionError}`;
            }
          } else if (pdfFile) {
            pdfStatusText = ` \u2022 \u26A0\uFE0F PDF file found but not loaded: ${pdfFile}`;
          } else {
            pdfStatusText = " \u2022 No PDF file in frontmatter";
          }
          noteInfoEl.innerHTML = `
                <div class="chat-current-note">
                    <div class="note-name">${this.currentNoteFile.basename}</div>
                    <div class="note-status">
                        \u{1F4C4} Note (${this.currentNoteContent.length} chars)${pdfStatusText}
                    </div>
                </div>
            `;
        } else {
          noteInfoEl.innerHTML = `
                <div class="chat-no-note">
                    <div class="no-note-message">No active note</div>
                    <div class="no-note-help">Open a markdown file to start chatting about it</div>
                </div>
            `;
        }
      }
      async renderView() {
        const container = this.contentEl || this.containerEl.children[1];
        container.empty();
        container.addClass("chat-panel-container");
        const header = container.createEl("div", { cls: "chat-panel-header" });
        header.createEl("h3", { text: "Chat with Note", cls: "chat-panel-title" });
        const noteInfo = header.createEl("div", { cls: "chat-note-info" });
        const chatArea = container.createEl("div", { cls: "chat-messages-area" });
        this.chatMessagesEl = chatArea;
        chatArea.addEventListener("scroll", () => {
          const { scrollTop, scrollHeight, clientHeight } = chatArea;
          const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;
          this.isUserScrolling = !isAtBottom;
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
        const sendButton = inputContainer.createEl("button", {
          cls: "chat-send-button",
          text: "Send"
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
        const clearButton = inputArea.createEl("button", {
          cls: "chat-clear-button",
          text: "Clear Chat"
        });
        clearButton.addEventListener("click", () => this.clearChat());
        const searchButton = inputArea.createEl("button", {
          cls: "chat-search-button",
          text: "Search"
        });
        searchButton.addEventListener("click", () => this.toggleSearch());
        const exportButton = inputArea.createEl("button", {
          cls: "chat-export-button",
          text: "Export"
        });
        exportButton.addEventListener("click", () => this.exportConversation());
        const testApiButton = inputArea.createEl("button", {
          cls: "chat-test-api-button",
          text: "Test API"
        });
        testApiButton.addEventListener("click", () => this.testApiConnection());
        await this.updateCurrentNote();
        this.renderChatHistory();
        this.addStyles();
      }
      async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;
        if (!this.currentNoteFile) {
          this.addMessageToHistory("system", "Please open a markdown file first.");
          return;
        }
        this.userMessageHistory.push(message);
        this.messageHistoryIndex = -1;
        this.addMessageToHistory("user", message);
        this.messageInput.value = "";
        this.autoResizeTextarea();
        const thinkingId = this.addMessageToHistory("assistant", "\u{1F4AD} Thinking...", true);
        try {
          let context = `Current Note: ${this.currentNoteFile.basename}

Note Content:
${this.currentNoteContent}`;
          console.log("Chat Panel Debug - Context Preparation:", {
            noteContentLength: this.currentNoteContent.length,
            pdfContentLength: this.currentPdfContent.length,
            hasPdfContent: !!this.currentPdfContent
          });
          if (this.currentPdfContent) {
            const pdfContentToAdd = this.currentPdfContent.slice(0, 5e4);
            context += `

--- Associated PDF Content ---
${pdfContentToAdd}`;
            console.log("Chat Panel Debug - Added PDF to context:", {
              originalPdfLength: this.currentPdfContent.length,
              addedPdfLength: pdfContentToAdd.length,
              finalContextLength: context.length
            });
          }
          const conversationHistory = this.chatHistory.filter((msg) => msg.role !== "system").slice(-10).map((msg) => `${msg.role}: ${msg.content}`).join("\n");
          const systemPrompt = `You are a helpful research assistant. You are chatting with a user about their current note and any associated PDF content. 

Context:
${context}

Previous conversation:
${conversationHistory}

Please provide helpful, accurate responses based on the note and PDF content. If the user asks about something not in the provided content, let them know that information isn't available in the current materials.`;
          const response = await this.plugin.llmService.callLLMWithPrompt(systemPrompt, message);
          this.updateMessageInHistory(thinkingId, response);
        } catch (error) {
          console.error("Chat error:", error);
          let errorMessage = "An error occurred while processing your request.";
          if (error.message.includes("status 401")) {
            errorMessage = '\u274C Authentication failed. Please check your API key in settings.\n\nTo fix this:\n1. Go to Settings > Research Assistant\n2. Verify your API key is correct\n3. Make sure your OpenRouter account has credits\n4. Try the "Test LLM API" command';
          } else if (error.message.includes("status 403")) {
            errorMessage = "\u274C Access forbidden. Your API key may not have permission for this model.";
          } else if (error.message.includes("status 429")) {
            errorMessage = "\u274C Rate limit exceeded. Please wait a moment and try again.";
          } else if (error.message.includes("status 500")) {
            errorMessage = "\u274C Server error. Please try again later.";
          } else {
            errorMessage = `\u274C Error: ${error.message}`;
          }
          this.updateMessageInHistory(thinkingId, errorMessage);
        }
      }
      addMessageToHistory(role, content, isTyping = false) {
        const messageId = Date.now() + Math.random();
        this.chatHistory.push({
          id: messageId,
          role,
          content,
          timestamp: /* @__PURE__ */ new Date(),
          isTyping
        });
        this.renderChatHistory();
        return messageId;
      }
      updateMessageInHistory(messageId, newContent) {
        const message = this.chatHistory.find((msg) => msg.id === messageId);
        if (message) {
          message.content = newContent;
          message.isTyping = false;
          this.renderChatHistory();
          this.saveConversation();
        }
      }
      deleteMessage(messageId) {
        this.chatHistory = this.chatHistory.filter((msg) => msg.id !== messageId);
        this.renderChatHistory();
        this.saveConversation();
      }
      async saveConversation() {
        if (!this.currentNoteFile) return;
        this.conversations.set(this.currentNoteFile.path, {
          history: [...this.chatHistory],
          userMessageHistory: [...this.userMessageHistory],
          lastUpdated: /* @__PURE__ */ new Date()
        });
        if (this.plugin.settings) {
          try {
            const conversationsData = {};
            for (const [path, conversation] of this.conversations.entries()) {
              conversationsData[path] = {
                ...conversation,
                history: conversation.history.slice(-50)
              };
            }
            this.plugin.settings.chatConversations = conversationsData;
            await this.plugin.saveSettings();
          } catch (error) {
            console.warn("Failed to save chat conversations:", error);
          }
        }
      }
      async loadConversation() {
        if (!this.currentNoteFile) return;
        const filePath = this.currentNoteFile.path;
        if (this.conversations.has(filePath)) {
          const conversation = this.conversations.get(filePath);
          this.chatHistory = [...conversation.history];
          this.userMessageHistory = [...conversation.userMessageHistory];
          this.renderChatHistory();
          return;
        }
        if (this.plugin.settings?.chatConversations?.[filePath]) {
          const conversation = this.plugin.settings.chatConversations[filePath];
          this.chatHistory = conversation.history || [];
          this.userMessageHistory = conversation.userMessageHistory || [];
          this.conversations.set(filePath, conversation);
          this.renderChatHistory();
          return;
        }
        this.chatHistory = [];
        this.userMessageHistory = [];
        this.messageHistoryIndex = -1;
        this.renderChatHistory();
      }
      renderChatHistory() {
        if (!this.chatMessagesEl) return;
        this.chatMessagesEl.empty();
        this.chatHistory.forEach((message) => {
          const messageEl = this.chatMessagesEl.createEl("div", {
            cls: `chat-message chat-message-${message.role}${message.isTyping ? " typing" : ""}`
          });
          const headerEl = messageEl.createEl("div", { cls: "chat-message-header" });
          headerEl.createEl("span", {
            cls: "chat-message-role",
            text: message.role === "user" ? "You" : "Assistant"
          });
          const timeStr = message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          });
          headerEl.createEl("span", {
            cls: "chat-message-time",
            text: timeStr
          });
          const contentEl = messageEl.createEl("div", {
            cls: "chat-message-content"
          });
          if (message.role === "assistant" && !message.isTyping) {
            let content = message.content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\*(.*?)\*/g, "<em>$1</em>").replace(/`(.*?)`/g, "<code>$1</code>").replace(/\n/g, "<br>");
            contentEl.innerHTML = content;
          } else {
            contentEl.textContent = message.content;
          }
          const actionsEl = messageEl.createEl("div", { cls: "chat-message-actions" });
          const copyBtn = actionsEl.createEl("button", {
            cls: "chat-action-button",
            title: "Copy message"
          });
          copyBtn.innerHTML = "\u{1F4CB}";
          copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(message.content);
            copyBtn.innerHTML = "\u2713";
            setTimeout(() => copyBtn.innerHTML = "\u{1F4CB}", 1e3);
          });
          if (message.role === "user") {
            const deleteBtn = actionsEl.createEl("button", {
              cls: "chat-action-button chat-delete-button",
              title: "Delete message"
            });
            deleteBtn.innerHTML = "\u{1F5D1}\uFE0F";
            deleteBtn.addEventListener("click", () => {
              this.deleteMessage(message.id);
            });
          }
        });
        if (!this.isUserScrolling) {
          setTimeout(() => {
            this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
          }, 10);
        }
      }
      clearChat() {
        this.chatHistory = [];
        this.userMessageHistory = [];
        this.messageHistoryIndex = -1;
        this.renderChatHistory();
        this.saveConversation();
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
        const textarea = this.messageInput;
        textarea.style.height = "auto";
        const newHeight = Math.min(textarea.scrollHeight, 200);
        textarea.style.height = newHeight + "px";
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
        const styleId = "chat-panel-styles";
        if (document.getElementById(styleId)) return;
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
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

            .chat-panel-title {
                margin: 0 0 10px 0;
                font-size: 16px;
                font-weight: 600;
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
            }

            .chat-send-button:hover {
                background: var(--interactive-accent-hover);
            }

            .chat-clear-button,
            .chat-search-button,
            .chat-export-button,
            .chat-test-api-button {
                padding: 4px 8px;
                background: var(--interactive-normal);
                color: var(--text-normal);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                margin-right: 8px;
                transition: all 0.2s ease;
            }

            .chat-clear-button:hover,
            .chat-search-button:hover,
            .chat-export-button:hover,
            .chat-test-api-button:hover {
                background: var(--interactive-hover);
                transform: translateY(-1px);
            }

            .chat-clear-button {
                background: var(--background-secondary);
                color: var(--text-muted);
            }

            .chat-search-button {
                background: var(--interactive-accent);
                color: white;
            }

            .chat-export-button {
                background: var(--text-accent);
                color: white;
            }
        `;
        document.head.appendChild(style);
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
    console.log("Research Assistant plugin loaded.");
  }
  /**
   * Initialize all service instances
   */
  initializeServices() {
    this.llmService = new LLMService(this.settings);
    this.metadataService = new MetadataService();
    this.fileService = new FileService(this.app, this.settings);
    this.pdfService = new PdfService(this.app, this.settings);
    this.paperService = new PaperService(this.app, this.settings, this.fileService, this.pdfService);
  }
  /**
   * Set up event handlers for file system changes
   */
  setupEventHandlers() {
    this.app.workspace.onLayoutReady(async () => {
      await this.paperService.buildPaperIndex();
      this.registerEvent(this.app.vault.on("create", this.handleFileCreate.bind(this)));
      this.registerEvent(this.app.vault.on("delete", this.handleFileDelete.bind(this)));
      this.registerEvent(this.app.vault.on("rename", this.handleFileRename.bind(this)));
      this.registerEvent(this.app.metadataCache.on("changed", this.handleMetadataChange.bind(this)));
    });
  }
  /**
   * Register views and ribbon icons
   */
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
  /**
   * Register plugin commands
   */
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
          console.error("Error cleaning resume sections:", err);
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
  // ======================================================
  // FILE EVENT HANDLERS
  // ======================================================
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
  // ======================================================
  // MAIN OPERATIONS
  // ======================================================
  /**
   * Process new paper from URL
   * @param {string} url - Paper URL
   * @param {string} sector - Research sector
   */
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
      console.error(error);
      new Notice2(`Error: ${error.message}`, 1e4);
    }
  }
  /**
   * Delete paper and refresh index
   * @param {TFile} noteFile - Note file to delete
   */
  async deletePaper(noteFile) {
    const paperData = this.paperService.paperIndex.get(noteFile.path);
    await this.fileService.deletePaper(noteFile, paperData);
    this.paperService.scheduleRebuild(150, () => this.rebuildAndRefresh());
  }
  /**
   * Test LLM API configuration
   */
  async testLLMApi() {
    try {
      new Notice2("Testing LLM API configuration...");
      await this.llmService.testApi();
      new Notice2("\u2705 LLM API test successful!");
    } catch (error) {
      new Notice2(`\u274C LLM API test failed: ${error.message}`);
      console.error("LLM API test error:", error);
    }
  }
  /**
   * Generate resume for currently active note
   */
  async generateResumeForCurrentNote() {
    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile || activeFile.extension !== "md") {
        new Notice2("No active markdown file found.");
        return;
      }
      new Notice2("Generating resume for current note...");
      const noteContent = await this.app.vault.read(activeFile);
      let contentToSummarize = noteContent;
      const paperData = this.paperService.paperIndex.get(activeFile.path);
      if (paperData && paperData.frontmatter && paperData.frontmatter.pdf_link) {
        try {
          const pdfFile = this.app.vault.getAbstractFileByPath(paperData.frontmatter.pdf_link);
          if (pdfFile instanceof TFile && pdfFile.extension === "pdf") {
            new Notice2("Found associated PDF, extracting text...");
            const pdfText = await this.pdfService.extractTextFromPdf(pdfFile);
            contentToSummarize = `Note Content:
${noteContent}

--- Associated PDF Content ---
${pdfText}`;
          }
        } catch (pdfError) {
          console.warn("Could not extract PDF content:", pdfError);
          new Notice2("Using note content only (PDF extraction failed)");
        }
      }
      const resume = await this.llmService.getSummary(contentToSummarize);
      await this.insertResumeIntoNote(activeFile, resume);
      new Notice2(`\u2705 Resume generated for '${activeFile.basename}'!`);
    } catch (error) {
      console.error("Error generating resume for current note:", error);
      new Notice2(`\u274C Failed to generate resume: ${error.message}`, 8e3);
    }
  }
  /**
   * Insert resume into note, replacing existing resume if present
   * @param {TFile} noteFile - The note file
   * @param {string} resume - The generated resume
   */
  async insertResumeIntoNote(noteFile, resume) {
    const content = await this.app.vault.read(noteFile);
    const resumeStartRegex = /^## Resume$/m;
    const resumeEndRegex = /^## /m;
    const startMatch = content.match(resumeStartRegex);
    if (startMatch) {
      const startIndex = startMatch.index + startMatch[0].length;
      const remainingContent = content.slice(startIndex);
      const endMatch = remainingContent.match(resumeEndRegex);
      let newContent;
      if (endMatch) {
        const endIndex = startIndex + endMatch.index;
        newContent = content.slice(0, startMatch.index) + `## Resume

${resume}

` + content.slice(endIndex);
      } else {
        newContent = content.slice(0, startMatch.index) + `## Resume

${resume}
`;
      }
      await this.app.vault.modify(noteFile, newContent);
    } else {
      const newContent = content + `

## Resume

${resume}
`;
      await this.app.vault.modify(noteFile, newContent);
    }
  }
  // ======================================================
  // UI OPERATIONS
  // ======================================================
  /**
   * Open the add paper modal
   */
  openAddPaperModal() {
    new PaperModal(this.app, this, async (url, sector) => {
      return await this.processNewPaper(url, sector);
    }).open();
  }
  /**
   * Activate the paper explorer view
   */
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
  /**
   * Activate the chat panel view
   */
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
  /**
   * Refresh paper explorer view
   */
  refreshPaperExplorerView() {
    const leaves = this.app.workspace.getLeavesOfType(PAPER_EXPLORER_VIEW_TYPE);
    leaves.forEach((leaf) => {
      if (leaf.view instanceof PaperExplorerView) {
        leaf.view.renderView();
      }
    });
  }
  /**
   * Open master index in main view
   */
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
  // ======================================================
  // INDEX MANAGEMENT
  // ======================================================
  /**
   * Complete rebuild and refresh pipeline
   */
  async rebuildAndRefresh() {
    await this.paperService.buildPaperIndex();
    await this.fileService.cleanEmptySectorFolders();
    await this.paperService.pruneUnusedSectors(() => this.saveSettings());
    await this.refreshAllArtifacts();
  }
  /**
   * Refresh all UI artifacts
   */
  async refreshAllArtifacts() {
    this.refreshPaperExplorerView();
    await this.paperService.updateMasterIndex();
  }
  // ======================================================
  // SETTINGS
  // ======================================================
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
    console.log("Research Assistant plugin unloaded.");
  }
};
module.exports = ResearchAssistantPlugin;
//# sourceMappingURL=main.js.map
