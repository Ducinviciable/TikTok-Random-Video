// Centralized TikTok DOM selectors
// When TikTok updates their UI, only this file needs to change.

const TK_SELECTORS = {
    // Liked videos tab & container
    LIKED_CONTAINER: '[data-e2e="user-liked-item-list"]',
    LIKED_ITEM: '[data-e2e="user-liked-item"]',
    LIKED_TAB: '[data-e2e="liked-tab"]',
    USER_LIKED_TAB: '[data-e2e="user-liked"]',

    // Video links
    VIDEO_LINK: 'a[href*="/video/"]',

    // Tab detection fallbacks
    TAB_ROLE: '[role="tab"]',
    TAB_ATTR: '[data-e2e*="tab"]',
    TAB_SPAN_CLASS: '.css-1wp3o1-SpanTabText',

    // Scroll containers
    MAIN: 'main',
    MAIN_CONTENT_ALT: '[id="main-content-others_homepage"]',
};

// Text labels for the Liked tab (multi-language)
const LIKED_TAB_LABELS = ["Đã thích", "Liked", "liked"];
