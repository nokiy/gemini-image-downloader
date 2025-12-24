// [IN]: Chrome runtime messaging API, DOM APIs for image extraction / Chrome 运行时消息 API、用于图片提取的 DOM API
// [OUT]: Image URL extraction, conversation title detection, message responses / 图片 URL 提取、对话标题检测、消息响应
// [POS]: src/content/content.js - Page interaction layer for Gemini / Gemini 的页面交互层
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

if (globalThis.__geminiImageDownloaderInjected) {
  console.log('[Gemini Image Downloader] Content script already loaded');
} else {
  globalThis.__geminiImageDownloaderInjected = true;

  // 提取所有 AI 生成的图片 URL
  function collectImageElements(root) {
    const results = [];
    if (!root) return results;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;

    while (node) {
      if (node.tagName === 'IMG') {
        results.push(node);
      }
      if (node.shadowRoot) {
        results.push(...collectImageElements(node.shadowRoot));
      }
      node = walker.nextNode();
    }

    return results;
  }

  function pickBestFromSrcset(srcset) {
    if (!srcset) return null;
    const entries = srcset.split(',').map(entry => entry.trim()).filter(Boolean);
    if (entries.length === 0) return null;

    let bestUrl = null;
    let bestScore = -1;

    for (const entry of entries) {
      const parts = entry.split(/\s+/);
      const url = parts[0];
      const descriptor = parts[1] || '';
      let score = 0;

      if (descriptor.endsWith('w')) {
        score = parseInt(descriptor, 10) || 0;
      } else if (descriptor.endsWith('x')) {
        score = (parseFloat(descriptor) || 0) * 1000;
      } else {
        score = 0;
      }

      if (score >= bestScore) {
        bestScore = score;
        bestUrl = url;
      }
    }

    return bestUrl || entries[entries.length - 1].split(/\s+/)[0];
  }

  function getCandidateUrls(img) {
    const urls = new Set();
    const srcset = img.currentSrc || img.src;
    if (srcset) urls.add(srcset);

    const attrSrc = img.getAttribute('src');
    if (attrSrc) urls.add(attrSrc);

    const attrSrcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
    const bestSrcset = pickBestFromSrcset(attrSrcset || '');
    if (bestSrcset) urls.add(bestSrcset);

    const dataSrc = img.getAttribute('data-src');
    if (dataSrc) urls.add(dataSrc);

    return Array.from(urls).filter(url => url && url.startsWith('http'));
  }

  // 提取所有 AI 生成的图片 URL
  function extractImages() {
    const roots = [document.body || document.documentElement];
    const images = [];

    for (const root of roots) {
      images.push(...collectImageElements(root));
    }

    const urls = new Set();

    for (const img of images) {
      const candidates = getCandidateUrls(img);
      if (candidates.length === 0) continue;

      const width = img.naturalWidth || img.width || img.clientWidth || 0;
      const height = img.naturalHeight || img.height || img.clientHeight || 0;
      const maxDim = Math.max(width, height);

      for (const url of candidates) {
        const isGoogleImage = url.includes('googleusercontent.com');
        if (!isGoogleImage) continue;

        // 必须包含 /gg-dl/ 或满足大图尺寸
        const isGenerated = url.includes('/gg-dl/') || maxDim >= 200;

        // 排除头像：URL 包含 /a/ 或父元素是用户头像容器
        const isAvatar = url.includes('/a/') ||
          img.closest('[data-participant-id]') !== null ||
          img.closest('.avatar') !== null;

        // 排除小图标（通常小于 120px）
        const isIcon = maxDim > 0 && maxDim < 120;

        if (isGenerated && !isAvatar && !isIcon) {
          urls.add(url);
        }
      }
    }

    return Array.from(urls);
  }

  // 获取对话标题
  function normalizeTitle(raw) {
    if (!raw) return '';
    let title = raw.trim();
    if (!title) return '';
    title = title.split('\n')[0];
    title = title.replace(/[\r\n]/g, '');
    title = title.replace(/\s+/g, ' ').trim();
    if (!title) return '';
    return title.substring(0, 50);
  }

  function cleanDocumentTitle(raw) {
    if (!raw) return '';
    let title = raw;
    title = title.replace(/^\s*Gemini\s*[-–—:]\s*/i, '');
    title = title.replace(/\s*[-–—:]\s*Gemini\s*$/i, '');
    return title.trim();
  }

  function getChatTitle() {
    const selectors = [
      '.conversation.selected div',
      '.conversation-title',
      '[data-conversation-title]',
      '[data-testid="conversation-title"]',
      '[data-test-id="conversation-title"]',
      'header h1',
      'header h2',
      'h1'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.innerText?.trim()) {
        const normalized = normalizeTitle(el.innerText);
        if (normalized) return normalized;
      }
    }

    const docTitle = normalizeTitle(cleanDocumentTitle(document.title || ''));
    if (docTitle && !/^gemini$/i.test(docTitle)) {
      return docTitle;
    }

    return 'Gemini_Images';
  }

  function waitForImages({ timeoutMs = 2000, minCount = 1 } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      let observer = null;
      let timeoutId = null;
      const root = document.body || document.documentElement;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (observer) observer.disconnect();
        if (timeoutId) clearTimeout(timeoutId);
        resolve(result);
      };

      const initial = extractImages();
      if (!root || initial.length >= minCount) {
        finish({ images: initial, waited: false, timedOut: false });
        return;
      }

      observer = new MutationObserver(() => {
        const images = extractImages();
        if (images.length >= minCount) {
          finish({ images, waited: true, timedOut: false });
        }
      });

      observer.observe(root, { childList: true, subtree: true });
      timeoutId = setTimeout(() => {
        finish({ images: extractImages(), waited: true, timedOut: true });
      }, timeoutMs);
    });
  }

  async function collectImages({ waitMs = 0 } = {}) {
    if (!waitMs || waitMs <= 0) {
      const images = extractImages();
      return { images, waited: false, timedOut: false };
    }
    return waitForImages({ timeoutMs: waitMs, minCount: 1 });
  }

  async function respondWithImages(sendResponse, { waitMs = 0 } = {}) {
    try {
      const { images, waited, timedOut } = await collectImages({ waitMs });
      const title = getChatTitle();

      console.log('[Gemini Image Downloader] Found images:', images.length);
      console.log('[Gemini Image Downloader] Chat title:', title);

      sendResponse({
        success: true,
        images: images,
        title: title,
        count: images.length,
        waited: waited,
        timedOut: timedOut
      });
    } catch (error) {
      console.error('[Gemini Image Downloader] Failed to collect images:', error);
      sendResponse({
        success: false,
        error: error?.message || 'collect failed'
      });
    }
  }

  // 监听来自 Popup 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
      sendResponse({ success: true, ready: true, version: '1.0.0.0' });
      return false;
    }

    if (request.action === 'getImages') {
      respondWithImages(sendResponse, { waitMs: request.waitMs });
      return true;
    }

    return false;
  });

  console.log('[Gemini Image Downloader] Content script loaded v1.0.0.0');
}
