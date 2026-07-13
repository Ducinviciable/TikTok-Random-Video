// Centralized TikTok DOM selectors
// Shared globally across all content script files

var TK_SELECTORS = {
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
var LIKED_TAB_LABELS = ["Đã thích", "Liked", "liked"];

// Shared state variables (accessible by all modules)
var isCollecting = false;
var collectedMap = new Map();
var videoWatcherActive = false;
var currentVideoElement = null;
var timeUpdateTriggered = false;
var playNextRequested = false;
var loopObserver = null;
