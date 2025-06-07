const { requestUrl } = require('obsidian');

class MetadataService {
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
        let fileNamePart = url.split('?')[0].split('#')[0].split('/').pop() || 'Untitled Paper';
        fileNamePart = decodeURIComponent(fileNamePart).replace(/\.pdf$/i, '');
        const cleanedTitle = fileNamePart.replace(/[\-_]+/g, ' ').replace(/\s+/g, ' ').trim();
        const today = new Date().toISOString().split('T')[0];

        return {
            id: cleanedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
            title: cleanedTitle || 'Untitled Paper',
            authors: 'Unknown',
            summary: 'No abstract available (added from direct PDF).',
            published: today,
            pdfLink: url
        };
    }

    async fetchArxivMetadata(arxivId) {
        const apiUrl = `http://export.arxiv.org/api/query?id_list=${arxivId}`;
        const response = await requestUrl({ url: apiUrl });

        if (response.status !== 200) {
            throw new Error('Failed to fetch from arXiv API.');
        }

        const xmlText = await response.text;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const entry = xmlDoc.querySelector("entry");

        if (!entry) {
            throw new Error('Paper not found on arXiv.');
        }

        const getText = (tagName) => entry.querySelector(tagName)?.textContent.trim() || 'N/A';
        const getAuthors = () => Array.from(entry.querySelectorAll("author name"))
            .map(el => el.textContent.trim())
            .join(', ');

        return {
            id: getText("id").split('/').pop(),
            title: getText("title").replace(/\s+/g, ' '),
            authors: getAuthors(),
            summary: getText("summary").replace(/\s+/g, ' '),
            published: getText("published").split('T')[0],
            pdfLink: entry.querySelector('link[title="pdf"]')?.getAttribute('href') || ''
        };
    }

    async getMetadataFromUrl(url) {
        const isPdf = this.isDirectPdfUrl(url);

        if (isPdf) {
            return await this.buildMetadataFromDirectPdf(url);
        } else {
            const arxivId = this.extractArxivId(url);
            if (!arxivId) {
                throw new Error('Could not extract a valid arXiv ID or PDF link.');
            }
            return await this.fetchArxivMetadata(arxivId);
        }
    }
}

module.exports = MetadataService;