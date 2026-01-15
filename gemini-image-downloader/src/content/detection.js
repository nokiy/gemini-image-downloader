// [IN]: DOM APIs, MutationObserver, Selectors config / DOM API、MutationObserver、选择器配置
// [OUT]: detectImages(), setupObserver() / 图片检测函数、观察器设置
// [POS]: src/content/detection.js - Core detection layer / 核心检测层
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

/**
 * Gemini Image Detection Module
 * 双重检测机制：DOM 选择器（优先） + URL 模式匹配（回退）
 */

// 获取日志工具
function getLogger() {
  return window.GeminiImageLogger || {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  };
}

// 获取选择器配置
function getSelectors() {
  return window.GeminiSelectors?.detection || {
    downloadButton: 'download-generated-image-button button[data-test-id="download-generated-image-button"]',
    imageContainers: ['generated-image', 'single-image'],
    containerImage: 'img.image',
    googleImage: 'img[src*="googleusercontent.com"]',
    avatarParent: '[data-participant-id]'
  };
}

// 获取 URL 模式配置
function getUrlPatterns() {
  return window.GeminiSelectors?.urlPatterns || {
    googleContent: 'googleusercontent.com',
    generatedImage: '/gg-dl/',
    avatar: '/a/'
  };
}

// 获取阈值配置
function getThresholds() {
  return window.GeminiSelectors?.thresholds || {
    minGeneratedSize: 200,
    maxIconSize: 120
  };
}

/**
 * 获取图片的原始高清URL（用于下载）
 * Google图片服务URL参数说明：
 * - =s0: 原始尺寸（最高质量）
 * - =sXXXX: 指定最大边长
 * - =wXXXX-hXXXX: 指定宽高
 * 我们需要移除或替换这些参数以获取原图
 */
function getOriginalImageUrl(url) {
  const logger = getLogger();
  
  const urlPatterns = getUrlPatterns();
  
  // 断点防护：空值检查
  if (!url || typeof url !== 'string') {
    logger.warn('Detection', 'Invalid URL provided to getOriginalImageUrl', { url });
    return url;
  }
  
  // 使用配置中的 URL 模式
  if (!url.includes(urlPatterns.googleContent)) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    
    // 断点防护：确保 pathname 存在
    if (!urlObj.pathname) {
      logger.warn('Detection', 'URL has no pathname', { url });
      return url;
    }
    
    // 移除所有尺寸限制参数，或替换为 =s0（原图）
    let path = urlObj.pathname;
    
    // 如果路径中有尺寸参数（如 =s512），替换为 =s0
    if (path.match(/=s\d+/)) {
      path = path.replace(/=s\d+/, '=s0');
    } else if (path.match(/=w\d+-h\d+/)) {
      path = path.replace(/=w\d+-h\d+/, '=s0');
    } else if (!path.includes('=s')) {
      path = path + '=s0';
    }
    
    urlObj.pathname = path;
    
    // 移除可能的质量降低参数（使用可选链）
    urlObj.searchParams?.delete('sz');
    urlObj.searchParams?.delete('w');
    urlObj.searchParams?.delete('h');
    
    const finalUrl = urlObj.toString();
    logger.debug('Detection', 'URL optimization', {
      original: url,
      optimized: finalUrl,
      changed: url !== finalUrl
    });
    
    return finalUrl;
  } catch (e) {
    logger.error('Detection', e, {
      context: 'getOriginalImageUrl',
      url
    });
    return url; // 降级：返回原始 URL
  }
}

/**
 * 获取缩略图URL（用于快速预览，低分辨率）
 * 使用 =s400 获取400px的缩略图，加载更快
 */
function getThumbnailUrl(url) {
  const logger = getLogger();
  const urlPatterns = getUrlPatterns();
  
  // 断点防护：空值检查
  if (!url || typeof url !== 'string') {
    logger.warn('Detection', 'Invalid URL provided to getThumbnailUrl', { url });
    return url;
  }
  
  // 使用配置中的 URL 模式
  if (!url.includes(urlPatterns.googleContent)) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    
    // 断点防护：确保 pathname 存在
    if (!urlObj.pathname) {
      return url;
    }
    
    let path = urlObj.pathname;
    
    // 替换为 =s400（400px 缩略图，足够预览）
    if (path.match(/=s\d+/)) {
      path = path.replace(/=s\d+/, '=s400');
    } else if (path.match(/=w\d+-h\d+/)) {
      path = path.replace(/=w\d+-h\d+/, '=s400');
    } else if (!path.includes('=s')) {
      path = path + '=s400';
    }
    
    urlObj.pathname = path;
    return urlObj.toString();
  } catch (e) {
    logger.warn('Detection', 'Failed to create thumbnail URL', { url, error: e.message });
    return url; // 降级：返回原始 URL
  }
}

/**
 * 方法 1：DOM 选择器检测（优先）
 * 查找 Gemini 原生的下载按钮元素来定位图片
 */
function findImagesByDOM() {
  const logger = getLogger();
  const selectors = getSelectors();
  const urlPatterns = getUrlPatterns();
  const images = [];

  try {
    // 断点防护：检查 document 是否可用
    if (!document || !document.querySelectorAll) {
      logger.warn('Detection', 'Document not available in findImagesByDOM');
      return images;
    }

    // 使用配置中的下载按钮选择器
    const downloadButtons = document.querySelectorAll(selectors.downloadButton);

    if (!downloadButtons || downloadButtons.length === 0) {
      logger.debug('Detection', 'No download buttons found via DOM selector', {
        selector: selectors.downloadButton
      });
      return images;
    }

    downloadButtons.forEach((btn) => {
      try {
        // 使用配置中的容器选择器列表
        let container = null;
        for (const containerSelector of selectors.imageContainers) {
          container = btn?.closest(containerSelector);
          if (container) break;
        }
        
        if (!container) {
          return; // 跳过当前循环
        }
        
        // 使用配置中的图片选择器
        const img = container?.querySelector(selectors.containerImage);
        
        // 使用配置中的 URL 模式检查
        if (img && img.src && typeof img.src === 'string' && img.src.includes(urlPatterns.googleContent)) {
          images.push({
            url: getOriginalImageUrl(img.src),  // 原图URL（下载用，=s0 最高质量）
            thumbnailUrl: img.src,              // 直接使用已加载的图片URL（浏览器缓存，即时显示）
            element: img,
            container: container,
            method: 'dom'
          });
        }
      } catch (err) {
        // 单个按钮处理失败不影响整体
        logger.warn('Detection', 'Error processing download button', { error: err.message });
      }
    });

    logger.debug('Detection', `Found ${images.length} images via DOM selector`);
    return images;
    
  } catch (error) {
    logger.error('Detection', error, { context: 'findImagesByDOM' });
    return images;
  }
}

/**
 * 方法 2：URL 模式匹配检测（回退）
 * 当 DOM 选择器无法找到图片时使用
 */
function findImagesByURL() {
  const logger = getLogger();
  const selectors = getSelectors();
  const urlPatterns = getUrlPatterns();
  const thresholds = getThresholds();
  const images = [];

  try {
    // 断点防护：检查 document 是否可用
    if (!document || !document.querySelectorAll) {
      logger.warn('Detection', 'Document not available in findImagesByURL');
      return images;
    }

    // 使用配置中的 Google 图片选择器
    const allImages = document.querySelectorAll(selectors.googleImage);

    if (!allImages || allImages.length === 0) {
      logger.debug('Detection', 'No Google images found via URL pattern', {
        selector: selectors.googleImage
      });
      return images;
    }

    allImages.forEach((img) => {
      try {
        // 断点防护：确保 img.src 存在且为字符串
        const url = img?.src;
        if (!url || typeof url !== 'string') {
          return; // 跳过无效图片
        }

        // 断点防护：安全获取图片尺寸（使用空值合并）
        const maxDim = Math.max(
          img?.naturalWidth ?? img?.width ?? 0,
          img?.naturalHeight ?? img?.height ?? 0
        );

        // 使用配置中的 URL 模式和阈值进行过滤
        const isGenerated = url.includes(urlPatterns.generatedImage) || maxDim >= thresholds.minGeneratedSize;
        
        // 使用配置中的选择器检查头像
        const isAvatar = url.includes(urlPatterns.avatar) || 
          (img?.closest && img.closest(selectors.avatarParent) !== null);
        
        // 使用配置中的阈值判断是否为图标
        const isIcon = maxDim > 0 && maxDim < thresholds.maxIconSize;

        if (isGenerated && !isAvatar && !isIcon) {
          images.push({
            url: getOriginalImageUrl(url),  // 原图URL（下载用，=s0 最高质量）
            thumbnailUrl: url,              // 直接使用已加载的图片URL（浏览器缓存，即时显示）
            element: img,
            container: img?.parentElement ?? null, // 断点防护：可能没有父元素
            method: 'url'
          });
        }
      } catch (err) {
        // 单个图片处理失败不影响整体
        logger.warn('Detection', 'Error processing image', { error: err.message });
      }
    });

    logger.debug('Detection', `Found ${images.length} images via URL pattern`);
    return images;
    
  } catch (error) {
    logger.error('Detection', error, { context: 'findImagesByURL' });
    return images;
  }
}

/**
 * 统一检测入口
 * @returns {Array<DetectedImage>} 检测到的图片列表（已去重）
 */
function detectImages() {
  const logger = getLogger();
  
  try {
    // 优先使用 DOM 选择器
    let images = findImagesByDOM();

    // 如果 DOM 选择器无结果，回退到 URL 模式
    if (!images || images.length === 0) {
      logger.debug('Detection', 'DOM selector returned no results, falling back to URL pattern');
      images = findImagesByURL();
    }

    // 断点防护：确保 images 是数组
    if (!Array.isArray(images)) {
      logger.warn('Detection', 'Invalid images array, returning empty array');
      return [];
    }

    // 去重（基于 URL）
    const uniqueUrls = new Set();
    const uniqueImages = images.filter(img => {
      // 断点防护：确保 img 和 img.url 存在
      if (!img || !img.url || typeof img.url !== 'string') {
        logger.warn('Detection', 'Invalid image object in filter', { img });
        return false;
      }
      
      if (uniqueUrls.has(img.url)) {
        return false;
      }
      
      uniqueUrls.add(img.url);
      return true;
    });

    logger.info('Detection', `Detected ${uniqueImages.length} unique images`, {
      total: images.length,
      unique: uniqueImages.length,
      duplicates: images.length - uniqueImages.length
    });

    return uniqueImages;
  } catch (error) {
    logger.error('Detection', error, { context: 'detectImages' });
    return []; // 降级：返回空数组
  }
}

/**
 * 设置实时监听
 * @param {Function} callback - 检测到变化时的回调函数
 * @returns {MutationObserver|null} 观察器实例
 */
function setupObserver(callback) {
  const logger = getLogger();
  
  // 断点防护：检查 callback 是否为函数
  if (!callback || typeof callback !== 'function') {
    logger.error('Detection', new Error('Invalid callback provided to setupObserver'), {
      callback: typeof callback
    });
    return null;
  }

  // 断点防护：检查 MutationObserver 是否可用
  if (!window.MutationObserver) {
    logger.warn('Detection', 'MutationObserver not supported in this environment');
    return null;
  }

  // 断点防护：检查 document.body 是否可用
  if (!document || !document.body) {
    logger.warn('Detection', 'document.body not available, retrying in 1s...');
    // 延迟重试
    setTimeout(() => {
      if (document && document.body) {
        setupObserver(callback);
      }
    }, 1000);
    return null;
  }

  try {
    let debounceTimer = null;

    const observer = new MutationObserver(() => {
      try {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const images = detectImages();
          callback(images);
        }, 500); // 防抖 500ms
      } catch (err) {
        logger.error('Detection', err, { context: 'MutationObserver callback' });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    logger.info('Detection', 'MutationObserver initialized successfully');

    // 定时刷新（每 5 秒）
    setInterval(() => {
      try {
        const images = detectImages();
        callback(images);
      } catch (err) {
        logger.error('Detection', err, { context: 'Interval callback' });
      }
    }, 5000);

    return observer;
  } catch (error) {
    logger.error('Detection', error, { context: 'setupObserver' });
    return null;
  }
}

// 导出函数
window.GeminiImageDetection = {
  detectImages,
  setupObserver,
  findImagesByDOM,
  findImagesByURL,
  getOriginalImageUrl // 导出URL优化函数供调试使用
};

