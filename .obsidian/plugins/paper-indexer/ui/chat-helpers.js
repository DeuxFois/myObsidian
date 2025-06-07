// Utility helpers for chat panel view
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
        textarea.style.height = 'auto';
        const newHeight = Math.min(textarea.scrollHeight, maxHeight);
        textarea.style.height = newHeight + 'px';
    };
}

module.exports = {
    debounceFactory,
    createAutoResizer
};
