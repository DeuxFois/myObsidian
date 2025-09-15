const DEFAULT_SETTINGS = {
    summaryApiEndpoint: '',
    summaryApiModel: '',
    summaryApiKey: '',
    pdfDownloadFolder: '_research-papers',
    hideFolderFromFiles: false,
    sectors: ['Other'],
    defaultSector: 'Other',
    // Maximum number of PDF characters to include when generating a resume.
    // Helps control token usage. 0 disables PDF text inclusion.
    maxPdfCharactersForResume: 20000000,
};

module.exports = { DEFAULT_SETTINGS };