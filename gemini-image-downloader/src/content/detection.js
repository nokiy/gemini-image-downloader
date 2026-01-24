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
    conversationRoot: ['main', '[role="main"]'],
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

function getExtensionIds() {
  return window.GeminiSelectors?.extension || {
    iconId: 'gemini-downloader-icon',
    drawerId: 'gemini-downloader-drawer',
    overlayId: 'gemini-downloader-overlay'
  };
}

function getImageSource(img) {
  if (!img) return '';
  const current = img.currentSrc || img.src;
  if (current && typeof current === 'string') return current;

  const srcset = img.getAttribute?.('srcset') || img.srcset || '';
  if (srcset) {
    const first = srcset.split(',')[0]?.trim();
    const url = first?.split(' ')[0];
    if (url) return url;
  }

  const dataSrc = img.getAttribute?.('data-src')
    || img.getAttribute?.('data-lazy-src')
    || img.getAttribute?.('data-original-src')
    || img.dataset?.src
    || img.dataset?.originalSrc;

  return typeof dataSrc === 'string' ? dataSrc : '';
}

function isInExtensionUI(el) {
  if (!el?.closest) return false;
  const ids = getExtensionIds();
  return !!el.closest(
    `#${ids.iconId}, #${ids.drawerId}, #${ids.overlayId}, #gid-preview-overlay`
  );
}

function findActiveComposer() {
  const candidates = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'));
  const visible = candidates.filter(el => !isElementHidden(el));
  if (visible.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;

  for (const el of visible) {
    if (!el.getBoundingClientRect) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const score = rect.bottom * 2 + rect.width;
    if (score > bestScore) {
      best = el;
      bestScore = score;
    }
  }

  return best;
}

function hasPotentialImageContainers(root) {
  const selectors = getSelectors();
  const urlPatterns = getUrlPatterns();
  const thresholds = getThresholds();
  const scope = root && root.querySelectorAll ? root : document;

  try {
    const imgs = scope.querySelectorAll(selectors.googleImage);
    for (const img of imgs) {
      if (isInExtensionUI(img)) continue;
      if (isElementHidden(img)) continue;
      if (img.closest && img.closest('header, [role="banner"], nav, [role="navigation"]')) {
        continue;
      }

      const url = img?.src;
      if (!url || typeof url !== 'string') continue;

      const maxDim = Math.max(
        img?.naturalWidth ?? img?.width ?? 0,
        img?.naturalHeight ?? img?.height ?? 0
      );

      const isAvatar = url.includes(urlPatterns.avatar) ||
        (img?.closest && img.closest(selectors.avatarParent) !== null);
      const isIcon = maxDim > 0 && maxDim < thresholds.maxIconSize;
      const looksGenerated = url.includes(urlPatterns.generatedImage) || maxDim >= thresholds.minGeneratedSize;

      if (looksGenerated && !isAvatar && !isIcon) return true;
    }
  } catch (e) {
    // Ignore and fall through
  }

  return false;
}

function isElementHidden(el) {
  if (!el) return true;
  if (el.closest && el.closest('[hidden], [aria-hidden="true"]')) return true;

  let current = el;
  let depth = 0;
  while (current && current !== document.documentElement && depth < 12) {
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return true;
    }
    current = current.parentElement;
    depth += 1;
  }

  if (el.getClientRects && el.getClientRects().length === 0) {
    return true;
  }

  return false;
}

function getMainContentRoot() {
  const candidates = Array.from(document.querySelectorAll('main, [role="main"]'));
  const visible = candidates.filter((el) => {
    if (!el?.getBoundingClientRect) return false;
    if (isElementHidden(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  if (visible.length === 0) return null;

  let best = null;
  let bestArea = -1;
  let bestTop = Infinity;

  for (const el of visible) {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea || (area === bestArea && rect.top < bestTop)) {
      best = el;
      bestArea = area;
      bestTop = rect.top;
    }
  }

  return best;
}

function getConversationRoot() {
  const selectors = getSelectors();
  const composer = findActiveComposer();
  const rootSelectors = Array.isArray(selectors.conversationRoot)
    ? selectors.conversationRoot
    : (selectors.conversationRoot ? [selectors.conversationRoot] : []);
  const fallbackSelectors = ['main', '[role="main"]'];
  const selectorPool = Array.from(new Set([...rootSelectors, ...fallbackSelectors]));

  const candidates = [];
  const seen = new Set();

  for (const selector of selectorPool) {
    try {
      const matches = document.querySelectorAll(selector);
      matches.forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          candidates.push(el);
        }
      });
    } catch (e) {
      // Ignore invalid selector
    }
  }

  if (candidates.length === 0) return document;

  const visibleCandidates = candidates.filter((el) => {
    if (!el?.isConnected || !el.getBoundingClientRect) return false;
    if (isElementHidden(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  if (visibleCandidates.length === 0) return document;

  const pickLargest = (els) => {
    let best = null;
    let bestArea = -1;
    let bestTop = Infinity;

    for (const el of els) {
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea || (area === bestArea && rect.top < bestTop)) {
        best = el;
        bestArea = area;
        bestTop = rect.top;
      }
    }

    return best;
  };

  if (composer) {
    const withComposer = visibleCandidates.filter(el => el.contains(composer));
    const best = pickLargest(withComposer);
    if (best) return best;
  }

  return pickLargest(visibleCandidates) || document;
}

function getDetectionScope() {
  const root = getConversationRoot();
  const mainRoot = getMainContentRoot();

  if (root && root !== document && root.querySelectorAll) {
    if (mainRoot && mainRoot !== root && mainRoot.querySelectorAll) {
      const rootRect = root.getBoundingClientRect?.();
      const mainRect = mainRoot.getBoundingClientRect?.();
      if (rootRect && mainRect && mainRect.width > 0 && rootRect.width > mainRect.width * 1.2) {
        return mainRoot;
      }
    }
    return root;
  }

  if (mainRoot && mainRoot.querySelectorAll) return mainRoot;

  return document;
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
  const scope = getDetectionScope();

  try {
    // 断点防护：检查 document 是否可用
    if (!document || !document.querySelectorAll) {
      logger.warn('Detection', 'Document not available in findImagesByDOM');
      return images;
    }

    // 支持选择器数组或单个字符串
    const buttonSelectors = Array.isArray(selectors.downloadButton)
      ? selectors.downloadButton
      : [selectors.downloadButton];

    // 尝试所有下载按钮选择器
    let downloadButtons = [];
    for (const selector of buttonSelectors) {
      try {
        const found = scope.querySelectorAll(selector);
        if (found && found.length > 0) {
          downloadButtons = Array.from(found);
          logger.debug('Detection', `Found ${found.length} buttons via: ${selector}`);
          break;
        }
      } catch (e) {
        logger.debug('Detection', `Selector failed: ${selector}`, { error: e.message });
      }
    }

    if (downloadButtons.length === 0) {
      logger.debug('Detection', 'No download buttons found via any DOM selector');
      return images;
    }

    // 支持容器图片选择器数组
    const containerImageSelectors = Array.isArray(selectors.containerImage)
      ? selectors.containerImage
      : [selectors.containerImage];

    downloadButtons.forEach((btn) => {
      try {
        if (isInExtensionUI(btn)) {
          return;
        }
        // 使用配置中的容器选择器列表
        let container = null;
        for (const containerSelector of selectors.imageContainers) {
          container = btn?.closest(containerSelector);
          if (container) break;
        }

        // 如果没找到容器，尝试向上查找包含图片的父元素
        if (!container) {
          let parent = btn.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const hasImage = parent.querySelector(selectors.googleImage || 'img');
            if (hasImage) {
              container = parent;
              break;
            }
            parent = parent.parentElement;
          }
        }

        if (!container) {
          logger.debug('Detection', 'No container found for button');
          return;
        }
        if (isInExtensionUI(container)) {
          return;
        }
        if (container.closest && container.closest('aside, [role="complementary"]')) {
          return;
        }
        if (scope !== document && !scope.contains(container)) {
          logger.debug('Detection', 'Container outside detection scope');
          return;
        }
        if (isElementHidden(container)) {
          logger.debug('Detection', 'Container hidden, skipping');
          return;
        }

        // 尝试多种图片选择器
        let img = null;
        for (const imgSelector of containerImageSelectors) {
          try {
            img = container.querySelector(imgSelector);
            if (img && getImageSource(img)) break;
          } catch (e) {
            // 选择器可能无效，继续尝试
          }
        }

        // 使用配置中的 URL 模式检查
        const imgUrl = getImageSource(img);
        if (imgUrl && imgUrl.includes(urlPatterns.googleContent)) {
          if (isElementHidden(img)) {
            logger.debug('Detection', 'Image hidden, skipping');
            return;
          }
          if (isInExtensionUI(img)) {
            return;
          }
          // 排除上传的图片预览
          const isUploadedPreview = img.alt && img.alt.includes('Uploaded image');
          if (!isUploadedPreview) {
            images.push({
              url: getOriginalImageUrl(imgUrl),
              thumbnailUrl: img.currentSrc || img.src || imgUrl,
              element: img,
              container: container,
              method: 'dom'
            });
          }
        }
      } catch (err) {
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
  const scope = getDetectionScope();
  const containerSelectors = Array.isArray(selectors.imageContainers)
    ? selectors.imageContainers
    : [selectors.imageContainers];

  try {
    // 断点防护：检查 document 是否可用
    if (!document || !document.querySelectorAll) {
      logger.warn('Detection', 'Document not available in findImagesByURL');
      return images;
    }

    // 使用配置中的 Google 图片选择器
    let allImages = scope.querySelectorAll(selectors.googleImage);
    if (!allImages || allImages.length === 0) {
      allImages = scope.querySelectorAll('img');
    }

    if (!allImages || allImages.length === 0) {
      logger.debug('Detection', 'No Google images found via URL pattern', {
        selector: selectors.googleImage
      });
      return images;
    }

    allImages.forEach((img) => {
      try {
        if (isInExtensionUI(img)) {
          return;
        }
        if (scope !== document && !scope.contains(img)) {
          return;
        }
        if (isElementHidden(img)) {
          return;
        }
        if (img.closest && img.closest('header, [role="banner"], nav, [role="navigation"], aside, [role="complementary"]')) {
          return;
        }
        // 断点防护：确保 img.src 存在且为字符串
        const url = getImageSource(img);
        if (!url || typeof url !== 'string') {
          return; // 跳过无效图片
        }
        if (!url.includes(urlPatterns.googleContent)) {
          return;
        }

        // 排除上传图片（用户上传的预览/历史）
        const isUploadedPreview = (() => {
          const alt = img?.alt || '';
          if (alt && /uploaded image/i.test(alt)) return true;
          if (alt && alt.includes('上传')) return true;
          if (selectors.uploadedImagePreview) {
            try {
              return img.matches(selectors.uploadedImagePreview);
            } catch (e) {
              return false;
            }
          }
          return false;
        })();
        if (isUploadedPreview) return;

        // 断点防护：安全获取图片尺寸（使用空值合并）
        const maxDim = Math.max(
          img?.naturalWidth ?? img?.width ?? 0,
          img?.naturalHeight ?? img?.height ?? 0
        );

        // 使用配置中的 URL 模式和阈值进行过滤
        const inGeneratedContainer = img.closest
          ? containerSelectors.some(selector => {
              try {
                return !!img.closest(selector);
              } catch (e) {
                return false;
              }
            })
          : false;
        const isGenerated = url.includes(urlPatterns.generatedImage)
          || maxDim >= thresholds.minGeneratedSize
          || inGeneratedContainer;
        
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
