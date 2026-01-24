// [IN]: Chrome runtime messaging (fetchImageForWatermark via service worker) / Chrome 运行时消息（通过 service worker 获取图片）
// [OUT]: removeWatermark function for processing images / 提供 removeWatermark 函数处理图片
// [POS]: src/utils/watermark-remover.js - 去水印算法模块，使用逆向 Alpha 混合，依赖 service worker 解决 CORS
// [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

/**
 * Gemini Watermark Remover Module
 * 使用逆向 Alpha 混合算法去除 Gemini 图片右下角水印
 *
 * 算法原理：
 * 正向混合：C = α * W + (1 - α) * O
 * 逆向恢复：O = (C - α * W) / (1 - α)
 *
 * 其中：
 * - C = 带水印的像素值 (Composited)
 * - W = 水印颜色 (Watermark)，通常为白色 (255)
 * - α = 水印透明度 (Alpha)
 * - O = 原始像素值 (Original)
 */

/* ==================== 配置常量 ==================== */

// Gemini 水印参数（来源：journey-ad/gemini-watermark-remover）
const WATERMARK_CONFIG = {
  // 大图水印（宽高都 >1024）
  large: {
    size: 96,
    marginRight: 64,
    marginBottom: 64
  },
  // 小图水印
  small: {
    size: 48,
    marginRight: 32,
    marginBottom: 32
  }
};

/* ==================== 水印模板缓存 ==================== */

const templateCache = {
  large: null,
  small: null
};

// 水印模板 Base64 数据（来源：journey-ad/gemini-watermark-remover）
// 这些是在纯黑背景上捕获的 Gemini 水印，用于提取精确的 alpha 值
const WATERMARK_TEMPLATES = {
  // 96x96 水印模板
  large: 'data:image/png;base64,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',
  // 48x48 水印模板
  small: 'data:image/png;base64,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'
};

/**
 * 加载水印模板（从 Base64 数据）
 * @param {'large' | 'small'} sizeType
 * @returns {Promise<ImageData>}
 */
async function loadWatermarkTemplate(sizeType) {
  if (templateCache[sizeType]) {
    return templateCache[sizeType];
  }

  const config = WATERMARK_CONFIG[sizeType];
  const dataUrl = WATERMARK_TEMPLATES[sizeType];

  try {
    // 从 Base64 加载图片
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    // 创建 canvas 获取 ImageData
    const canvas = new OffscreenCanvas(config.size, config.size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0);

    const imageData = ctx.getImageData(0, 0, config.size, config.size);

    // 从 RGB 值计算 alpha 地图
    // 模板是在纯黑背景上的白色水印，alpha = max(r, g, b) / 255
    const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      // 计算 alpha 值：使用最大 RGB 通道
      const alpha = Math.max(r, g, b);
      // 存储 alpha 值（替换原有的 alpha 通道）
      pixels[i + 3] = alpha;
      // 设置 RGB 为白色（水印颜色）
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
    }

    templateCache[sizeType] = imageData;
    console.log('[GID] Loaded watermark template:', sizeType, config.size + 'x' + config.size);
    return imageData;

  } catch (error) {
    console.error('[GID] Failed to load template, using fallback:', error);
    // 回退到程序化生成
    return generateFallbackTemplate(config.size);
  }
}

/**
 * 生成备用水印模板（当加载失败时使用）
 */
function generateFallbackTemplate(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const centerX = size / 2;
  const centerY = size / 2;
  const outerRadius = size * 0.45;
  const innerRadius = size * 0.15;

  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const outerAngle = (i * Math.PI / 2) - Math.PI / 2;
    const innerAngle1 = outerAngle - Math.PI / 4;
    const innerAngle2 = outerAngle + Math.PI / 4;

    const ox = centerX + outerRadius * Math.cos(outerAngle);
    const oy = centerY + outerRadius * Math.sin(outerAngle);
    const ix1 = centerX + innerRadius * Math.cos(innerAngle1);
    const iy1 = centerY + innerRadius * Math.sin(innerAngle1);
    const ix2 = centerX + innerRadius * Math.cos(innerAngle2);
    const iy2 = centerY + innerRadius * Math.sin(innerAngle2);

    if (i === 0) ctx.moveTo(ix1, iy1);
    ctx.lineTo(ox, oy);
    ctx.lineTo(ix2, iy2);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

/* ==================== 核心算法 ==================== */

/**
 * 将 Data URL 转换为 Blob（不使用 fetch，更可靠）
 * @param {string} dataUrl
 * @returns {Blob}
 */
function dataUrlToBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * 通过 Service Worker 获取图片（解决 CORS 问题）
 * @param {string} url - 图片 URL
 * @returns {Promise<Blob>}
 */
async function fetchImageViaServiceWorker(url) {
  return new Promise((resolve, reject) => {
    console.log('[GID] Fetching image via service worker:', url);

    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      reject(new Error('扩展上下文已失效，请刷新页面'));
      return;
    }

    chrome.runtime.sendMessage(
      { action: 'fetchImageForWatermark', url },
      (response) => {
        if (chrome.runtime.lastError) {
          const message = chrome.runtime.lastError.message || 'runtime sendMessage failed';
          console.error('[GID] Runtime error:', message);
          if (/Extension context invalidated/i.test(message)) {
            reject(new Error('扩展已重新加载，请刷新页面'));
          } else {
            reject(new Error(message));
          }
          return;
        }
        if (!response || !response.success) {
          console.error('[GID] Fetch failed:', response?.error);
          reject(new Error(response?.error || 'Failed to fetch image'));
          return;
        }

        console.log('[GID] Got dataUrl, converting to blob...');
        try {
          // 直接转换 Data URL 为 Blob（不使用 fetch）
          const blob = dataUrlToBlob(response.dataUrl);
          console.log('[GID] Blob created:', blob.size, 'bytes');
          resolve(blob);
        } catch (error) {
          console.error('[GID] dataUrl to blob failed:', error);
          reject(error);
        }
      }
    );
  });
}

/**
 * 直接获取图片（优先尝试，失败再回退到 Service Worker）
 * @param {string} url - 图片 URL
 * @returns {Promise<Blob>}
 */
async function fetchImageDirect(url) {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'force-cache'
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.blob();
}

async function fetchImageWithFallback(url) {
  try {
    return await fetchImageDirect(url);
  } catch (error) {
    const logger = window.GeminiImageLogger;
    if (logger?.debug) {
      logger.debug('Watermark', 'Direct fetch failed, fallback to service worker', {
        url,
        error: error?.message
      });
    }

    try {
      return await fetchImageViaServiceWorker(url);
    } catch (fallbackError) {
      const directMessage = error?.message || 'direct fetch failed';
      const fallbackMessage = fallbackError?.message || 'service worker fetch failed';
      throw new Error(`${directMessage}; ${fallbackMessage}`);
    }
  }
}

function getImageElementSource(element) {
  if (!element) return '';
  return element.currentSrc || element.src || '';
}

async function tryDecodeBitmapFromElement(imageUrl, element) {
  if (!element) return null;
  if (!element.complete) return null;
  if (!element.naturalWidth || !element.naturalHeight) return null;

  const elementUrl = getImageElementSource(element);
  if (!elementUrl || elementUrl !== imageUrl) return null;

  try {
    const bitmap = await createImageBitmap(element);
    return { bitmap, source: 'element' };
  } catch (error) {
    console.warn('[GID] createImageBitmap from element failed:', error?.message);
    return null;
  }
}

async function processWatermarkRemoval(imageBitmap) {
  const width = imageBitmap.width;
  const height = imageBitmap.height;

  console.log('[GID] Image dimensions:', width, 'x', height);

  const isLarge = width > 1024 && height > 1024;
  const templateType = isLarge ? 'large' : 'small';
  const config = WATERMARK_CONFIG[templateType];
  const wmSize = config.size;
  const marginRight = config.marginRight;
  const marginBottom = config.marginBottom;

  console.log('[GID] Using template:', templateType, wmSize + 'x' + wmSize, 'margin:', marginRight);

  const template = await loadWatermarkTemplate(templateType);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0);

  const wmX = width - wmSize - marginRight;
  const wmY = height - wmSize - marginBottom;

  if (wmX < 0 || wmY < 0) {
    console.log('[GID] Image too small for watermark removal');
    const resultBlob = await canvas.convertToBlob({ type: 'image/png' });
    return { success: true, blob: resultBlob };
  }

  let imageData;
  try {
    imageData = ctx.getImageData(wmX, wmY, wmSize, wmSize);
  } catch (error) {
    return { success: false, error: error.message, code: 'tainted_canvas' };
  }

  applyInverseAlphaBlend(imageData, template);
  ctx.putImageData(imageData, wmX, wmY);

  const resultBlob = await canvas.convertToBlob({ type: 'image/png' });
  return { success: true, blob: resultBlob };
}

/**
 * 去除图片水印
 * @param {string} imageUrl - 图片 URL
 * @param {{ element?: HTMLImageElement }} [options]
 * @returns {Promise<{success: boolean, blob?: Blob, error?: string}>}
 */
async function removeWatermark(imageUrl, options = {}) {
  try {
    console.log('[GID] Removing watermark from:', imageUrl);

    const element = options?.element || null;
    const elementBitmap = await tryDecodeBitmapFromElement(imageUrl, element);
    if (elementBitmap?.bitmap) {
      const elementResult = await processWatermarkRemoval(elementBitmap.bitmap);
      if (elementResult.success) {
        console.log('[GID] Watermark removal complete (element source)');
        return elementResult;
      }
      if (elementResult.code !== 'tainted_canvas') {
        throw new Error(elementResult.error || '去水印失败');
      }
    }

    const blob = await fetchImageWithFallback(imageUrl);
    const imageBitmap = await createImageBitmap(blob);
    const result = await processWatermarkRemoval(imageBitmap);

    if (!result.success) {
      throw new Error(result.error || '去水印失败');
    }

    console.log('[GID] Watermark removal complete');
    return result;

  } catch (error) {
    console.error('[GID] Watermark removal failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 应用逆向 Alpha 混合算法
 * 公式：O = (C - α * W) / (1 - α)
 *
 * @param {ImageData} imageData - 带水印的图片数据（会被修改）
 * @param {ImageData} template - 水印模板
 */
function applyInverseAlphaBlend(imageData, template) {
  const pixels = imageData.data;
  const wmPixels = template.data;

  for (let i = 0; i < pixels.length; i += 4) {
    // 获取水印模板的 alpha 值（0-255 -> 0-1）
    const wmAlpha = wmPixels[i + 3] / 255;

    // 如果水印透明，跳过
    if (wmAlpha < 0.01) continue;

    // 获取水印颜色（白色）
    const wmR = wmPixels[i];
    const wmG = wmPixels[i + 1];
    const wmB = wmPixels[i + 2];

    // 获取当前像素（带水印）
    const cR = pixels[i];
    const cG = pixels[i + 1];
    const cB = pixels[i + 2];

    // 逆向 Alpha 混合：O = (C - α * W) / (1 - α)
    const denominator = 1 - wmAlpha;

    // 防止除以零
    if (denominator < 0.01) {
      continue;
    }

    // 计算原始像素值
    let oR = (cR - wmAlpha * wmR) / denominator;
    let oG = (cG - wmAlpha * wmG) / denominator;
    let oB = (cB - wmAlpha * wmB) / denominator;

    // 限制在有效范围内
    pixels[i] = Math.max(0, Math.min(255, Math.round(oR)));
    pixels[i + 1] = Math.max(0, Math.min(255, Math.round(oG)));
    pixels[i + 2] = Math.max(0, Math.min(255, Math.round(oB)));
    // Alpha 通道保持不变
  }
}

/**
 * 检查图片是否可能有 Gemini 水印
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
function mayHaveWatermark(width, height) {
  return width >= 256 && height >= 256;
}

/* ==================== 导出 ==================== */

window.GeminiWatermarkRemover = {
  removeWatermark,
  mayHaveWatermark,
  getConfig: () => ({ ...WATERMARK_CONFIG })
};
