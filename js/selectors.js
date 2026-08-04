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

    // TikTok Shop & Product anchors
    SHOP_ANCHOR: '[data-e2e*="shop"], [data-e2e="anchor-shop"], [data-e2e*="shopping"], a[href*="shop.tiktok.com"], [class*="ShopAnchor"], [class*="product-anchor"], [class*="e-commerce-anchor"], [data-e2e="video-shopping-anchor"], [class*="ProductAnchor"]',

    // Audio / Sound muted indicators
    MUTED_NOTICE: '[class*="sound-mute"], [class*="mute-icon"], [data-e2e*="mute"], [class*="SoundMute"]',
};

// Text keywords for sound muted / removed
var MUTED_SOUND_KEYWORDS = [
    "sound removed",
    "sound unavailable",
    "audio removed",
    "âm thanh bị xóa",
    "âm thanh không khả dụng",
    "original sound - muted",
    "muted due to copyright"
];

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
