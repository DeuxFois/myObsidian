// Utility functions for formatting and data processing

/**
 * Normalize frontmatter tags into space separated #tag format for the index
 * @param {any} rawTags - Raw tags from frontmatter
 * @returns {string} Formatted tags string
 */
function formatTagsForIndex(rawTags) {
    if (!rawTags) return '';
    let arr = [];
    if (Array.isArray(rawTags)) {
        arr = rawTags;
    } else if (typeof rawTags === 'string') {
        if (rawTags.includes(',')) arr = rawTags.split(',');
        else arr = rawTags.split(/\s+/);
    } else {
        try { arr = String(rawTags).split(/[,\s]+/); } catch (_) { arr = []; }
    }
    return arr
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => {
            const cleaned = t.replace(/^#+/, '').replace(/\s+/g, '-');
            return cleaned ? `#${cleaned}` : '';
        })
        .filter(Boolean)
        .join(' ');
}

/**
 * Normalize frontmatter authors field
 * @param {any} fmAuthors - Authors from frontmatter
 * @returns {string} Normalized authors string
 */
function normalizeAuthors(fmAuthors) {
    if (!fmAuthors) return '';
    if (Array.isArray(fmAuthors)) return fmAuthors.join(', ');
    try { return String(fmAuthors); } catch (_) { return ''; }
}

/**
 * Normalize frontmatter tags field
 * @param {any} fmTags - Tags from frontmatter
 * @returns {string[]} Normalized tags array
 */
function normalizeTags(fmTags) {
    if (!fmTags) return [];
    if (Array.isArray(fmTags)) return fmTags.map(t => String(t));
    if (typeof fmTags === 'string') return fmTags.split(/[,\s]+/).map(t => t.trim()).filter(Boolean);
    try { return String(fmTags).split(/[,\s]+/).map(t => t.trim()).filter(Boolean); } catch (_) { return []; }
}

/**
 * Generate a safe filename from paper metadata
 * @param {Object} metadata - Paper metadata
 * @returns {string} Safe filename for PDF
 */
function generatePdfFileName(metadata) {
    const sanitizedTitle = metadata.title.replace(/[\\/:"*?<>|]/g, '-').substring(0, 100);
    const firstAuthor = metadata.authors.split(',')[0].trim();
    const year = new Date(metadata.published).getFullYear();
    return `${firstAuthor} et al. - ${year} - ${sanitizedTitle}.pdf`;
}

/**
 * Create a sanitized note filename from title
 * @param {string} title - Paper title
 * @returns {string} Sanitized filename
 */
function sanitizeNoteTitle(title) {
    return title.replace(/[\\/:"*?<>|]/g, '-').substring(0, 150);
}

module.exports = {
    formatTagsForIndex,
    normalizeAuthors,
    normalizeTags,
    generatePdfFileName,
    sanitizeNoteTitle
};