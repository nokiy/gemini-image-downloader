// [IN]: DOM APIs, MutationObserver / DOM API、MutationObserver
// [OUT]: detectImages(), setupObserver() / 图片检测函数、观察器设置
// [POS]: src/content/detection.js - Core detection layer / 核心检测层

/**
 * Gemini Image Detection Module
 * 双重检测机制：DOM 选择器（优先） + URL 模式匹配（回退）
 */

/**
 * 获取图片的原始高清URL
 * Google图片服务URL参数说明：
 * - =s0: 原始尺寸（最高质量）
 * - =sXXXX: 指定最大边长
 * - =wXXXX-hXXXX: 指定宽高
 * 我们需要移除或替换这些参数以获取原图
 */
function getOriginalImageUrl(url) {
  if (!url || !url.includes('googleusercontent.com')) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    
    // 移除所有尺寸限制参数，或替换为 =s0（原图）
    // 常见的参数模式：=s1024, =w800-h600, =s0-d 等
    let path = urlObj.pathname;
    
    // 如果路径中有尺寸参数（如 =s512），替换为 =s0
    if (path.match(/=s\d+/)) {
      path = path.replace(/=s\d+/, '=s0');
    } else if (path.match(/=w\d+-h\d+/)) {
      // 如果有宽高参数，移除它们
      path = path.replace(/=w\d+-h\d+/, '=s0');
    } else if (!path.includes('=s')) {
      // 如果没有任何尺寸参数，添加 =s0
      path = path + '=s0';
    }
    
    urlObj.pathname = path;
    
    // 移除可能的质量降低参数
    urlObj.searchParams.delete('sz'); // size
    urlObj.searchParams.delete('w');  // width
    urlObj.searchParams.delete('h');  // height
    
    const finalUrl = urlObj.toString();
    console.log('[GID] URL optimization:', {
      original: url,
      optimized: finalUrl,
      changed: url !== finalUrl
    });
    
    return finalUrl;
  } catch (e) {
    console.error('[GID] Failed to parse URL:', e);
    if (window.GeminiImageErrorLogger) {
      window.GeminiImageErrorLogger.logDetectionError(e, {
        context: 'getOriginalImageUrl',
        url
      });
    }
    return url;
  }
}

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
          url: getOriginalImageUrl(img.src), // 使用优化后的高清URL
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
        url: getOriginalImageUrl(url), // 使用优化后的高清URL
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
  try {
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
  } catch (error) {
    console.error('[GID] Error in detectImages:', error);
    if (window.GeminiImageErrorLogger) {
      window.GeminiImageErrorLogger.logDetectionError(error, {
        context: 'detectImages'
      });
    }
    return [];
  }
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
  findImagesByURL,
  getOriginalImageUrl // 导出URL优化函数供调试使用
};

