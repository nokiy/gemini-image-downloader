// [IN]: DOM APIs, MutationObserver / DOM API、MutationObserver
// [OUT]: detectImages(), setupObserver() / 图片检测函数、观察器设置
// [POS]: src/content/detection.js - Core detection layer / 核心检测层

/**
 * Gemini Image Detection Module
 * 双重检测机制：DOM 选择器（优先） + URL 模式匹配（回退）
 */

/**
 * 方法 1：DOM 选择器检测（优先）
 * 查找 Gemini 原生的下载按钮元素来定位图片
 */
function findImagesByDOM() {
  const images = [];

  // 查找 download-generated-image-button
  const downloadButtons = document.querySelectorAll(
    'download-generated-image-button button[data-test-id="download-generated-image-button"]'
  );

  downloadButtons.forEach((btn) => {
    const container = btn.closest('generated-image') || btn.closest('single-image');
    if (container) {
      const img = container.querySelector('img.image');
      if (img && img.src && img.src.includes('googleusercontent.com')) {
        images.push({
          url: img.src,
          element: img,
          container: container,
          method: 'dom'
        });
      }
    }
  });

  return images;
}

/**
 * 方法 2：URL 模式匹配检测（回退）
 * 当 DOM 选择器无法找到图片时使用
 */
function findImagesByURL() {
  const images = [];
  const allImages = document.querySelectorAll('img[src*="googleusercontent.com"]');

  allImages.forEach((img) => {
    const url = img.src;
    const maxDim = Math.max(
      img.naturalWidth || img.width || 0,
      img.naturalHeight || img.height || 0
    );

    // 过滤条件
    const isGenerated = url.includes('/gg-dl/') || maxDim >= 200;
    const isAvatar = url.includes('/a/') ||
      img.closest('[data-participant-id]') !== null;
    const isIcon = maxDim > 0 && maxDim < 120;

    if (isGenerated && !isAvatar && !isIcon) {
      images.push({
        url: url,
        element: img,
        container: img.parentElement,
        method: 'url'
      });
    }
  });

  return images;
}

/**
 * 统一检测入口
 * @returns {Array<DetectedImage>} 检测到的图片列表（已去重）
 */
function detectImages() {
  // 优先使用 DOM 选择器
  let images = findImagesByDOM();

  // 如果 DOM 选择器无结果，回退到 URL 模式
  if (images.length === 0) {
    images = findImagesByURL();
  }

  // 去重（基于 URL）
  const uniqueUrls = new Set();
  const uniqueImages = images.filter(img => {
    if (uniqueUrls.has(img.url)) return false;
    uniqueUrls.add(img.url);
    return true;
  });

  return uniqueImages;
}

/**
 * 设置实时监听
 * @param {Function} callback - 检测到变化时的回调函数
 * @returns {MutationObserver} 观察器实例
 */
function setupObserver(callback) {
  let debounceTimer = null;

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      callback(detectImages());
    }, 500); // 防抖 500ms
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 定时刷新（每 5 秒）
  setInterval(() => {
    callback(detectImages());
  }, 5000);

  return observer;
}

// 导出函数
window.GeminiImageDetection = {
  detectImages,
  setupObserver,
  findImagesByDOM,
  findImagesByURL
};

