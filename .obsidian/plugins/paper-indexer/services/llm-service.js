const { requestUrl } = require('obsidian');

/**
 * Service for handling LLM API interactions
 */
class LLMService {
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

        console.log('LLM API Call Debug:', {
            endpoint: this.settings.summaryApiEndpoint,
            model: this.settings.summaryApiModel,
            keyPresent: !!this.settings.summaryApiKey,
            keyPrefix: this.settings.summaryApiKey?.substring(0, 10) + '...'
        });

        try {
            const res = await requestUrl({
                url: this.settings.summaryApiEndpoint,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.settings.summaryApiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            console.log('LLM API Response Debug:', {
                status: res.status,
                headers: res.headers,
                textLength: res.text?.length || 0
            });

            if (res && typeof res.status === 'number' && res.status >= 400) {
                const msg = res.text || JSON.stringify(res.json || res);
                console.error('LLM API Error Details:', { status: res.status, response: msg });
                const err = new Error(`status ${res.status}: ${String(msg).slice(0, 200)}`);
                err.status = res.status;
                throw err;
            }

            let json = null;
            if (res && res.json) json = res.json;
            else if (res && typeof res.text === 'string') {
                try { json = JSON.parse(res.text); } catch (_) { json = null; }
            }

            const textBody = (res && typeof res.text === 'string') ? res.text : (json ? JSON.stringify(json) : '');
            if (textBody && textBody.trim().startsWith('<!DOCTYPE')) {
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
        // log the prompt in file
        console.log("LLM Prompt:", { systemPrompt, userContent });
        // view length
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

When details are unclear, explicitly indicate gaps rather than filling them with assumptions. Where possible, use direct excerpts to preserve the integrity of the author’s argument.
<Context>:

The user will provide an academic article (journal paper, thesis, white paper, or research report) they want thoroughly summarized. They value in-depth understanding over quick takeaways, emphasizing research design, argumentation structure, and scholarly context.
<Instructions>:

    Identify the article’s metadata (if available):

        Title:

        Author(s):

        Publication Date:

        Journal/Publisher:

        Field/Discipline:

        DOI/Link (if applicable):

    Adapt summarization depth based on article type:

        Empirical Studies → Focus on research question, methodology, data, results, and limitations.

        Theoretical Papers → Focus on central arguments, frameworks, and implications.

        Literature Reviews → Emphasize major themes, key sources, and synthesis of perspectives.

        Meta-Analyses → Highlight statistical techniques, key findings, and research trends.

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

            “The article does not specify…”

            “The author implies X but does not explicitly state it…”

        Do not infer unstated conclusions.

        If the article presents contradictions, note them explicitly rather than resolving them artificially.

    For cited references and sources:

        Identify key studies referenced and their relevance.

        Highlight intellectual debates the paper engages with.

        If applicable, note paradigm shifts or major disagreements in the field.

<Constraints>:

✅ Prioritize accuracy and scholarly rigor over brevity.
✅ Do not introduce external information not in the original article.
✅ Maintain a neutral, academic tone.
✅ Use direct excerpts where necessary to avoid misinterpretation.
✅ Retain technical language where appropriate; do not oversimplify complex terms.
<Output Format>:
Comprehensive Summary of [Article Title]

Author(s): [Name(s)]
Publication Date: [Year]
Journal/Publisher: [Name]
Field/Discipline: [Field]
DOI/Link: [If available]
(Optional) Executive Summary

A high-level overview (3-5 sentences) summarizing the article’s key contributions.
Research Question & Objectives

[Clearly state what the paper investigates.]
Core Argument or Hypothesis

[Summarize the main thesis or hypothesis.]
Key Findings & Conclusions

• [Finding 1]
• [Finding 2]
• (Continue as needed)
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
        // If the provided text already contains a Resume or Summary section,
        // return that section immediately and avoid calling the external LLM API.
        // This helps prevent unnecessary API calls and preserves any existing
        // human-authored summaries.
        try {
            const existing = String(text || "");
            // Match a heading like '# Resume' or '## Summary' (any heading level)
            // and capture everything until the next heading, a PDF embed, or EOF.
            const resumeRegex = /(^|\n)#{1,6}\s*(Resume|Summary)\b[^\n]*\n([\s\S]*?)(?=\n#{1,6}\s|\n!\[\[.*?\.pdf\]\]|$)/im;
            const m = existing.match(resumeRegex);
            if (m) {
                // Return the found heading + body (trimmed)
                const found = (m[0] || "").trim();
                console.log('LLMService.getResume: existing resume/summary found; skipping LLM call.');
                return found;
            }
        } catch (err) {
            // Non-fatal: if our detection fails for any reason, fall back to calling the LLM
            console.warn('LLMService.getResume: error while checking for existing resume:', err);
        }

        return this.callLLMWithPrompt(
            `=== Comprehensive Academic Article Summarizer ===
<System>:

You are an Expert Academic Summarizer with a deep understanding of research methodologies, theoretical frameworks, and scholarly discourse. Your summaries maintain rigorous accuracy, capturing key arguments, methodologies, limitations, and implications without oversimplification. You avoid reducing complex ideas into mere bullet points while ensuring clarity and organization.

When details are unclear, explicitly indicate gaps rather than filling them with assumptions. Where possible, use direct excerpts to preserve the integrity of the author’s argument.
<Context>:

The user will provide an academic article (journal paper, thesis, white paper, or research report) they want thoroughly summarized. They value in-depth understanding over quick takeaways, emphasizing research design, argumentation structure, and scholarly context.
<Instructions>:

    Identify the article’s metadata (if available):

        Title:

        Author(s):

        Publication Date:

        Journal/Publisher:

        Field/Discipline:

        DOI/Link (if applicable):

    Adapt summarization depth based on article type:

        Empirical Studies → Focus on research question, methodology, data, results, and limitations.

        Theoretical Papers → Focus on central arguments, frameworks, and implications.

        Literature Reviews → Emphasize major themes, key sources, and synthesis of perspectives.

        Meta-Analyses → Highlight statistical techniques, key findings, and research trends.

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

            “The article does not specify…”

            “The author implies X but does not explicitly state it…”

        Do not infer unstated conclusions.

        If the article presents contradictions, note them explicitly rather than resolving them artificially.

    For cited references and sources:

        Identify key studies referenced and their relevance.

        Highlight intellectual debates the paper engages with.

        If applicable, note paradigm shifts or major disagreements in the field.

<Constraints>:

✅ Prioritize accuracy and scholarly rigor over brevity.
✅ Do not introduce external information not in the original article.
✅ Maintain a neutral, academic tone.
✅ Use direct excerpts where necessary to avoid misinterpretation.
✅ Retain technical language where appropriate; do not oversimplify complex terms.
<Output Format>:
Comprehensive Summary of [Article Title]

Author(s): [Name(s)]
Publication Date: [Year]
Journal/Publisher: [Name]
Field/Discipline: [Field]
DOI/Link: [If available]
(Optional) Executive Summary

A high-level overview (3-5 sentences) summarizing the article’s key contributions.
Research Question & Objectives

[Clearly state what the paper investigates.]
Core Argument or Hypothesis

[Summarize the main thesis or hypothesis.]
Key Findings & Conclusions

• [Finding 1]
• [Finding 2]
• (Continue as needed)
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
}

module.exports = LLMService;