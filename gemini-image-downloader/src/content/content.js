// [IN]: Modules (State, Detection, UI), Chrome runtime messaging / 模块（状态、检测、UI）、运行时消息
// [OUT]: Bootstrapped extension, popup bridge (ping/getImages) / 已启动的扩展、弹窗桥接（ping/getImages）
// [POS]: src/content/content.js - Entry point / 入口点
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

(function() {
  if (window.__geminiImageDownloaderInjected) {
    return;
  }
  window.__geminiImageDownloaderInjected = true;

  console.log('[GID] Initializing v1.2.0.25...');

  function getFallbackConfig() {
    const selectors = window.GeminiSelectors || {};
    const detection = selectors.detection || {};
    const urlPatterns = selectors.urlPatterns || {};
    const thresholds = selectors.thresholds || {};

    return {
      googleImage: detection.googleImage || 'img[src*="googleusercontent.com"]',
      avatarParent: detection.avatarParent || '[data-participant-id]',
      urlPatterns: {
        googleContent: urlPatterns.googleContent || 'googleusercontent.com',
        generatedImage: urlPatterns.generatedImage || '/gg-dl/',
        avatar: urlPatterns.avatar || '/a/'
      },
      thresholds: {
        minGeneratedSize: thresholds.minGeneratedSize || 200,
        maxIconSize: thresholds.maxIconSize || 120
      }
    };
  }

  function normalizeImageUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const config = getFallbackConfig();
    if (!url.includes(config.urlPatterns.googleContent)) return url;

    try {
      const urlObj = new URL(url);
      let path = urlObj.pathname || '';

      if (path.match(/=s\d+/)) {
        path = path.replace(/=s\d+/, '=s0');
      } else if (path.match(/=w\d+-h\d+/)) {
        path = path.replace(/=w\d+-h\d+/, '=s0');
      } else if (path && !path.includes('=s')) {
        path = path + '=s0';
      }

      urlObj.pathname = path;
      urlObj.searchParams.delete('sz');
      urlObj.searchParams.delete('w');
      urlObj.searchParams.delete('h');

      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }

  function collectImageUrls() {
    if (window.GeminiImageDetection?.detectImages) {
      const images = window.GeminiImageDetection.detectImages() || [];
      if (window.GeminiImageState?.updateImages) {
        window.GeminiImageState.updateImages(images);
      }
      return images
        .map(img => img?.url)
        .filter(url => typeof url === 'string' && url.length > 0);
    }

    const config = getFallbackConfig();
    const nodes = document?.querySelectorAll
      ? document.querySelectorAll(config.googleImage)
      : [];
    const urls = [];

    nodes.forEach((img) => {
      const src = img?.src;
      if (!src || typeof src !== 'string') return;

      const maxDim = Math.max(
        img?.naturalWidth ?? img?.width ?? 0,
        img?.naturalHeight ?? img?.height ?? 0
      );

      const isGenerated = src.includes(config.urlPatterns.generatedImage)
        || maxDim >= config.thresholds.minGeneratedSize;
      const isAvatar = src.includes(config.urlPatterns.avatar)
        || (img?.closest && img.closest(config.avatarParent));
      const isIcon = maxDim > 0 && maxDim < config.thresholds.maxIconSize;

      if (isGenerated && !isAvatar && !isIcon) {
        urls.push(normalizeImageUrl(src));
      }
    });

    return Array.from(new Set(urls));
  }

  function getConversationTitle() {
    const candidates = [
      '[data-test-id="conversation-title"]',
      '[data-test-id="conversation-name"]',
      'h1'
    ];

    for (const selector of candidates) {
      const el = document?.querySelector?.(selector);
      const text = el?.textContent?.trim();
      if (text) return text;
    }

    return document?.title?.trim() || 'Gemini_Images';
  }

  function buildImageResponse() {
    const urls = collectImageUrls();
    return {
      success: true,
      count: urls.length,
      images: urls,
      title: getConversationTitle()
    };
  }

  function refreshImagesAfterNavigation() {
    const detection = window.GeminiImageDetection;
    const stateManager = window.GeminiImageState;
    if (!detection?.detectImages || !stateManager?.updateImages) return;

    const run = () => {
      const images = detection.detectImages();
      stateManager.updateImages(images);
    };

    setTimeout(run, 600);
    setTimeout(run, 1800);
  }

  function handleRouteChange() {
    const stateManager = window.GeminiImageState;
    if (stateManager?.clearState) {
      stateManager.clearState();
    }
    refreshImagesAfterNavigation();
  }

  function setupRouteWatcher() {
    if (window.__gidRouteWatcher) return;

    let lastUrl = location.href;
    const check = () => {
      const current = location.href;
      if (current !== lastUrl) {
        lastUrl = current;
        handleRouteChange();
      }
    };

    window.__gidRouteWatcher = setInterval(check, 800);
    window.addEventListener('popstate', check);
    window.addEventListener('hashchange', check);
  }

  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request?.action === 'ping') {
        sendResponse({ ready: true });
        return true;
      }

      if (request?.action === 'getImages') {
        try {
          const waitMs = Number(request?.waitMs) || 0;
          const initial = buildImageResponse();

          if (initial.count > 0 || waitMs <= 0) {
            sendResponse(initial);
            return true;
          }

          setTimeout(() => {
            try {
              sendResponse(buildImageResponse());
            } catch (error) {
              sendResponse({ success: false, error: error?.message || 'getImages failed' });
            }
          }, waitMs);

          return true;
        } catch (error) {
          sendResponse({ success: false, error: error?.message || 'getImages failed' });
          return true;
        }
      }

      return false;
    });
  }

  // 1. 初始化 UI
  if (window.GeminiImageUI && window.GeminiImageUI.initUI) {
    window.GeminiImageUI.initUI();
    console.log('[GID] UI module initialized');
  } else {
    console.error('[GID] UI module not found');
  }

  // 2. 初始化检测
  if (window.GeminiImageDetection && window.GeminiImageState) {
    const { detectImages, setupObserver } = window.GeminiImageDetection;
    const { updateImages } = window.GeminiImageState;

    // 立即执行一次检测
    const initialImages = detectImages();
    console.log('[GID] Initial detection:', initialImages.length, 'images');
    updateImages(initialImages);

    // 设置 MutationObserver 持续监听
    setupObserver((images) => {
      console.log('[GID] Observer detected:', images.length, 'images');
      updateImages(images);
    });

    setupRouteWatcher();
  } else {
    console.error('[GID] Detection or State module not found');
  }

  console.log('[GID] Initialized successfully');

  // 诊断：测试与 Service Worker 的通信
  setTimeout(() => {
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'downloadPing' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[GID] Service Worker ping failed:', chrome.runtime.lastError.message);
        } else if (response?.ok) {
          console.log('[GID] Service Worker is ready');
        } else {
          console.warn('[GID] Service Worker responded but not ok:', response);
        }
      });
    } else {
      console.error('[GID] chrome.runtime.sendMessage not available');
    }
  }, 2000);
})();
