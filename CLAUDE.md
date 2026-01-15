# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **重要：修改代码前必读** `docs/fractal-documentation-architecture.md`

## Project Overview

Gemini Image Downloader is a Chrome Manifest V3 extension that batch downloads AI-generated images from Google Gemini conversations. The extension uses a modular architecture with content scripts for DOM detection, a service worker for download orchestration, and an in-page UI for user interaction.

**Current Version:** 1.1.0.16

---

## Quick Reference / 快速参考

### Project Structure / 项目结构

```
Gemini_image/
├── CLAUDE.md                    # This file (AI guidance)
├── README.md                    # Project overview
├── docs/                        # Documentation
│   ├── fractal-documentation-architecture.md  # 📌 MUST READ
│   ├── prd.md / spec.md / tech_plan.md       # Requirements & specs
│   └── TEST_GUIDE.md                         # Testing guide
└── gemini-image-downloader/     # Extension source
    ├── manifest.json            # Extension entry
    └── src/
        ├── config/              # Selectors (update when Gemini changes)
        ├── content/             # DOM detection, UI
        ├── background/          # Downloads, ZIP
        ├── utils/               # Shared logging
        └── popup/               # Extension popup
```

### Key Commands / 常用命令

```bash
# Load extension in Chrome
# 1. chrome://extensions → Enable Developer mode
# 2. Load unpacked → select gemini-image-downloader/

# Reload after changes
# Content script: Refresh Gemini page (Cmd+R)
# Service worker: chrome://extensions → click refresh icon
```

---

## Development Commands

### Loading the Extension
```bash
# Navigate to the extension directory
cd gemini-image-downloader

# In Chrome: Load as unpacked extension
# 1. Navigate to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select the gemini-image-downloader directory
```

### Reloading After Changes
```bash
# Method 1: Via Extensions page
# 1. Go to chrome://extensions
# 2. Click the refresh button (🔄) on the extension card

# Method 2: For content script changes only
# Simply reload the Gemini page (F5 or Cmd+R)

# Method 3: For service worker changes
# Click "Service worker" link on chrome://extensions, then refresh
```

### Console Testing
```javascript
// Check if modules are loaded (run on gemini.google.com)
window.GeminiImageErrorLogger
window.GeminiImageState
window.GeminiImageDetection
window.GeminiImageUI

// View detected images
window.GeminiImageDetection.detectImages()

// View error logs and stats
window.GeminiImageErrorLogger.getErrorLogs().then(console.log)
window.GeminiImageErrorLogger.getErrorStats().then(console.log)

// Manual detection methods (for debugging)
window.GeminiImageDetection.findImagesByDOM()  // DOM-based detection
window.GeminiImageDetection.findImagesByURL()  // URL pattern detection

// Test URL optimization
window.GeminiImageDetection.getOriginalImageUrl('https://example.com/image=s512')
```

### Debugging Service Worker
```bash
# Service worker console access:
# 1. Go to chrome://extensions
# 2. Find "Gemini Image Downloader"
# 3. Click "Service worker" link (blue text)
# 4. This opens DevTools for the background script
```

## Architecture

### Module Boundaries

| Module | Location | Responsibility |
|--------|----------|----------------|
| **Content Script** | `src/content/` | DOM interaction, image detection, in-page UI |
| **Service Worker** | `src/background/` | Download orchestration, ZIP packaging, progress tracking |
| **Popup** | `src/popup/` | Extension popup interface |
| **Config** | `src/config/` | Selectors and URL patterns for Gemini DOM |
| **Utils** | `src/utils/` | Shared logging utilities |

### Communication Flow

```
Popup → chrome.runtime.sendMessage → Content Script
Content Script → DOM query → Image URLs
Content Script → chrome.runtime.sendMessage → Service Worker
Service Worker → fetch (with retry) → JSZip → chrome.downloads
Service Worker → chrome.tabs.sendMessage → Content Script (progress updates)
```

### Critical Script Loading Order

The `manifest.json` defines a specific loading order for content scripts that MUST be maintained:

1. `src/config/selectors.js` - Configuration must load first
2. `src/content/error-logger.js` - Error logging before any other modules
3. `src/utils/logger.js` - General logging utilities
4. `src/content/state.js` - State management
5. `src/content/detection.js` - Detection logic depends on config and logger
6. `src/content/ui.js` - UI depends on state and detection
7. `src/content/content.js` - Entry point that orchestrates everything

**Important:** Changing this order will break module dependencies.

### Key Files

- `manifest.json` - Extension entry point, defines permissions and script loading order
- `src/content/content.js` - Entry point that initializes all content modules, handles message passing
- `src/content/detection.js` - Dual detection strategy (DOM selector + URL pattern matching)
- `src/content/ui.js` - In-page drawer UI with lazy-loading thumbnails
- `src/content/state.js` - Centralized state management for detected images
- `src/content/error-logger.js` - Error logging with categorization and persistence
- `src/background/service_worker.js` - Download handling with retry logic and JSZip packaging
- `src/background/download-queue.js` - Download queue management (if exists)
- `src/background/file-naming.js` - File naming conventions
- `src/config/selectors.js` - DOM selectors and URL patterns (update when Gemini DOM changes)

## Important: Fractal Documentation Protocol

This project follows a **fractal documentation architecture**. When making changes:

1. **After code changes**, update the 3-line header comment in modified files:
   ```javascript
   // [IN]: <dependencies> / <依赖>
   // [OUT]: <exports> / <导出>
   // [POS]: <role> / <职责>
   // Protocol: When updating me, sync this header + parent folder's .folder.md
   ```

2. **Update the parent folder's `.folder.md`** to reflect file changes

3. **If module boundaries change**, update root `README.md`

4. **All documentation must be bilingual** (English/Chinese)

See `docs/fractal-documentation-architecture.md` for full protocol details.

## Image Detection Logic

### Dual Detection Strategy

The extension uses a two-tier detection approach:

1. **DOM Selector Method (Primary)** - `findImagesByDOM()`
   - Locates Gemini's native download buttons: `download-generated-image-button button[data-test-id="download-generated-image-button"]`
   - Traverses up to find image containers: `generated-image`, `single-image`
   - Extracts image from container: `img.image`
   - More reliable but depends on Gemini's DOM structure

2. **URL Pattern Method (Fallback)** - `findImagesByURL()`
   - Finds all images: `img[src*="googleusercontent.com"]`
   - Filters by URL patterns and size thresholds
   - Used when DOM selector fails

### Filter Criteria

Images must match ALL criteria:
- URL contains `googleusercontent.com`
- URL contains `/gg-dl/` OR size >= 200px (minGeneratedSize threshold)
- URL does NOT contain `/a/` (avatar marker)
- NOT inside `[data-participant-id]` element (excludes user avatars)
- Size < 120px are considered icons (maxIconSize threshold)

### URL Optimization

Google image URLs are normalized for high-resolution downloads:
- `=s512` → `=s0` (original size)
- `=w800-h600` → `=s0`
- Removes size parameters: `sz`, `w`, `h`

**Two URL variants:**
- `url` - Original quality URL with `=s0` (used for downloads)
- `thumbnailUrl` - Browser-cached URL (used for UI preview, faster loading)

### Configuration

All selectors and thresholds are centralized in `src/config/selectors.js`:
```javascript
window.GeminiSelectors = {
  detection: {
    downloadButton: '...',
    imageContainers: ['generated-image', 'single-image'],
    // ... more selectors
  },
  urlPatterns: {
    googleContent: 'googleusercontent.com',
    generatedImage: '/gg-dl/',
    avatar: '/a/'
  },
  thresholds: {
    minGeneratedSize: 200,
    maxIconSize: 120
  }
}
```

**When Gemini updates their DOM:** Update `src/config/selectors.js` instead of hardcoded values.

## Download System

### Retry Mechanism

The service worker implements automatic retry for failed downloads:
- Max retries: 3 attempts
- Retry delay: 1000ms with exponential backoff
- Retryable HTTP errors: 408, 429, 500, 502, 503, 504
- Network errors are also retried
- Timeout: 30 seconds per fetch

### Progress Tracking

Download progress is persisted to `chrome.storage.local`:
- Key: `gid_batch_download_progress`
- Supports recovery if service worker restarts
- Progress updates sent to content script via `chrome.tabs.sendMessage`
- States: `downloading`, `packaging`, `success`, `error`

### File Naming

- ZIP filename: `Gemini_image.zip` (auto-uniquify with Chrome's conflict resolution)
- Image filenames: `image_01.png`, `image_02.jpg`, etc.
- Extension detected from Content-Type header or URL
- Supported formats: jpg, png, webp, gif, svg

## Common Issues

### Extension not loading
- Check `manifest.json` for syntax errors
- Verify all files referenced in manifest exist
- Check Chrome Extensions page for error messages
- Ensure script loading order is maintained

### Images not detected
- Open console on gemini.google.com and check for `[GID]` log messages
- Run `window.GeminiImageDetection.detectImages()` to see detection results
- Try both methods separately: `findImagesByDOM()` and `findImagesByURL()`
- Verify selectors in `src/config/selectors.js` match current Gemini DOM
- Check if Gemini has updated their page structure (common after Google updates)

### Download fails
- Check Service Worker console (chrome://extensions → Service Worker link)
- Look for retry attempts in console: `[SW] Image X: got 503, retrying...`
- Verify network requests succeed in DevTools Network tab
- Check if image URLs are accessible directly in browser
- Verify JSZip is loaded: Service worker console should show "JSZip available: true"
- Check storage quota if dealing with many/large images

### Module not found errors
- Verify script loading order in `manifest.json`
- Check browser console for specific module name
- Common cause: `error-logger.js` must load before other modules use it
- Ensure all global window objects are defined: `window.GeminiImageDetection`, etc.

### UI not showing
- Check if `window.GeminiImageUI.initUI()` was called in content.js
- Verify CSS is loaded: `src/content/ui.css` in web_accessible_resources
- Check for z-index conflicts with Gemini's UI
- Inspect for drawer element: `document.querySelector('.gid-drawer')`

## Project Structure

```
gemini-image-downloader/
├── manifest.json           # Extension configuration
├── icons/                  # Extension icons
├── libs/                   # JSZip library
└── src/
    ├── background/         # Service worker (downloads, ZIP)
    ├── content/            # Content scripts (DOM, UI, detection)
    ├── config/             # Selectors and patterns
    ├── popup/              # Extension popup
    └── utils/              # Shared utilities
```

## Testing

See `docs/TEST_GUIDE.md` for comprehensive testing procedures.

### Quick Test Commands

```javascript
// Run full diagnostic test
(async function testGID() {
  console.log('🧪 Testing Gemini Image Downloader\n');

  // Check modules
  console.log('Modules loaded:');
  console.log('  ErrorLogger:', typeof window.GeminiImageErrorLogger);
  console.log('  State:', typeof window.GeminiImageState);
  console.log('  Detection:', typeof window.GeminiImageDetection);
  console.log('  UI:', typeof window.GeminiImageUI);

  // Check lazy loading
  const lazyImages = document.querySelectorAll('.gid-lazy-image[data-src]');
  const loadedImages = document.querySelectorAll('.gid-lazy-image.gid-image-loaded');
  console.log(`\nLazy loading: ${lazyImages.length} pending, ${loadedImages.length} loaded`);

  // Check error logs
  if (window.GeminiImageErrorLogger) {
    const stats = await window.GeminiImageErrorLogger.getErrorStats();
    console.log(`\nErrors: ${stats.total} total`);
    console.table(stats.byCategory);
  }

  console.log('\n✅ Test complete!');
})();
```

### Test Lazy Loading

```javascript
// Check if IntersectionObserver is working
'IntersectionObserver' in window

// View lazy load status
document.querySelectorAll('.gid-lazy-image[data-src]').length  // Unloaded
document.querySelectorAll('.gid-lazy-image.gid-image-loaded').length  // Loaded
```

### Test Error Logging

```javascript
// View error statistics
await window.GeminiImageErrorLogger.getErrorStats()

// View errors by category
await window.GeminiImageErrorLogger.getErrorLogsByCategory('download')

// Simulate errors (for testing)
window.GeminiImageErrorLogger.logNetworkError(
  new Error('Test error'),
  { url: 'test.jpg', type: 'test' }
)
```

## Dependencies

- **JSZip 3.10.1** - ZIP file creation (bundled in `libs/jszip.min.js`)
- No build system required - vanilla JavaScript
- No package manager needed - all dependencies bundled

## Key Documentation Files

- `docs/spec.md` - Functional specification (feature requirements, UI spec)
- `docs/TEST_GUIDE.md` - Testing procedures for lazy loading and error logging
- `docs/fractal-documentation-architecture.md` - Documentation protocol (must read before changes)
- `docs/prd.md` - Product requirements document
- `docs/tech_plan.md` - Technical implementation plan
