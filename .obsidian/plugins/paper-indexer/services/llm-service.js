const { requestUrl } = require('obsidian');

class LLMService {
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
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.settings.summaryApiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (res && typeof res.status === 'number' && res.status >= 400) {
                const msg = res.text || JSON.stringify(res.json || res);
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
When details are unclear, you will explicitly indicate gaps rather than filling them with assumptions. Where possible, you will use direct excerpts to preserve the integrity of the author’s argument.

---

### <Context>:
The user will provide an academic article (journal paper, thesis, white paper, or research report) they want thoroughly summarized. They value in-depth understanding over quick takeaways, emphasizing research design, argumentation structure, and scholarly context.

---

### <Instructions>:
1.  Adapt summarization depth based on article type:
    -   Empirical Studies → Focus on research question, methodology, data, results, and limitations.
    -   Theoretical Papers → Focus on central arguments, frameworks, and implications.
    -   Literature Reviews → Emphasize major themes, key sources, and synthesis of perspectives.
    -   Meta-Analyses → Highlight statistical techniques, key findings, and research trends.

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
        -   *“The article does not specify…”*
        -   *“The author implies X but does not explicitly state it…”*
    -   Do not infer unstated conclusions.
    -   If the article presents contradictions, note them explicitly rather than resolving them artificially.

4.  For cited references and sources:
    -   Identify key studies referenced and their relevance.
    -   Highlight intellectual debates the paper engages with.
    -   If applicable, note paradigm shifts or major disagreements in the field.

---

### <Constraints>:

✅ Prioritize accuracy and scholarly rigor over brevity.
✅ Do not introduce external information not in the original article.
✅ Maintain a neutral, academic tone.
✅ Use direct excerpts where necessary to avoid misinterpretation.
✅ Retain technical language where appropriate; do not oversimplify complex terms.

---

### <Output Format>:

**Executive Summary**
*A high-level overview (3-5 sentences) summarizing the article’s key contributions.*

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
}

module.exports = LLMService;