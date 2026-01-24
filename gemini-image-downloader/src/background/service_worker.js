// [IN]: chrome.storage, chrome.downloads, chrome.runtime / Chrome 存储、下载、运行时
// [OUT]: Download service, ZIP generation, fetchImageForWatermark / 下载服务、ZIP 生成、为去水印获取图片
// [POS]: src/background/service_worker.js - 后台服务，处理下载和跨域图片获取
// [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

// ========================================
// Service Worker 启动日志
// ========================================
console.log('[SW] Service Worker starting...');

// ========================================
// JSZip 加载 - 使用相对路径
// ========================================
let jszipAvailable = false;
try {
  // 使用相对路径加载 JSZip（相对于 manifest.json 中定义的 service_worker 位置）
  // service_worker.js 在 src/background/，所以需要 ../../libs/
  importScripts('../../libs/jszip.min.js');
  jszipAvailable = typeof JSZip !== 'undefined';
  console.log('[SW] JSZip loaded successfully');
} catch (error) {
  console.error('[SW] Failed to load JSZip:', error.message);
  // 继续运行，单张下载仍然可用
}
console.log('[SW] Service Worker initialized, JSZip available:', jszipAvailable);

const PENDING_KEY = 'pendingDownloadRenames';
// 安全地检查 chrome.storage.session
const storage = (chrome.storage && chrome.storage.session) ? chrome.storage.session : chrome.storage.local;
const DOWNLOAD_TIMEOUT_MS = 20000;
const DIRECT_DOWNLOAD_DELAY_MS = 0;

// 下载重试配置
const RETRY_CONFIG = {
  maxRetries: 3,           // 最大重试次数
  retryDelay: 1000,        // 重试延迟（毫秒）
  retryableErrors: [       // 可重试的错误状态码
    403, // Forbidden (有时是临时性的)
    408, // Request Timeout
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504  // Gateway Timeout
  ]
};

function getZipFetchConcurrency(total) {
  const hardware = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 0 : 0;
  const base = hardware > 0 ? Math.floor(hardware / 2) : 2;
  const concurrency = Math.max(2, Math.min(4, base));
  return Math.min(concurrency, total || 1);
}

/* Utility Functions */
function getExtension(url, contentType) {
  if (contentType) {
    const type = contentType.split(';')[0].trim().toLowerCase();
    const map = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
      'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg'
    };
    if (map[type]) return map[type];
  }
  if (url) {
    try {
      const match = new URL(url).pathname.match(/\.([a-z0-9]+)$/i);
      if (match) return match[1].toLowerCase();
    } catch (e) {}
  }
  return 'png';
}

function buildImageFilename(index, ext) {
  const safeExt = ext || 'png';
  if (typeof index === 'number') {
    return `Gemini_Image_${String(index + 1).padStart(2, '0')}.${safeExt}`;
  }
  return `Gemini_Image.${safeExt}`;
}

function downloadWithTimeout(options, timeoutMs = DOWNLOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Download timeout'));
    }, timeoutMs);

    chrome.downloads.download(options, (downloadId) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (chrome.runtime.lastError || !downloadId) {
        reject(chrome.runtime.lastError || new Error('download failed'));
        return;
      }
      resolve(downloadId);
    });
  });
}

/**
 * 带重试的 fetch 函数
 * @param {string} url - 要获取的 URL
 * @param {number} index - 图片索引（用于日志）
 * @param {number} attempt - 当前尝试次数
 * @returns {Promise<Response>} fetch 响应
 */
async function fetchWithRetry(url, index = 0, attempt = 1) {
  try {
    // 创建超时信号（兼容旧版 Chrome）
    let timeoutSignal;
    if (typeof AbortSignal.timeout === 'function') {
      timeoutSignal = AbortSignal.timeout(30000); // Chrome 103+
    } else {
      const controller = new AbortController();
      timeoutSignal = controller.signal;
      setTimeout(() => controller.abort(), 30000);
    }

    const response = await fetch(url, {
      signal: timeoutSignal, // 30秒超时
      credentials: 'include', // 携带 cookies，解决 Google 图片服务认证问题
      cache: 'no-cache',
      headers: {
        'Accept': 'image/*,*/*;q=0.8'
      }
    });

    // 检查是否可重试
    if (!response.ok && RETRY_CONFIG.retryableErrors.includes(response.status)) {
      if (attempt < RETRY_CONFIG.maxRetries) {
        console.log(`[SW] Image ${index + 1}: got ${response.status}, retrying (${attempt}/${RETRY_CONFIG.maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.retryDelay * attempt)); // 指数退避
        return fetchWithRetry(url, index, attempt + 1);
      }
    }

    return response;
  } catch (error) {
    // 网络错误也可以重试
    if (attempt < RETRY_CONFIG.maxRetries) {
      console.log(`[SW] Image ${index + 1}: network error, retrying (${attempt}/${RETRY_CONFIG.maxRetries})...`, error.message);
      await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.retryDelay * attempt));
      return fetchWithRetry(url, index, attempt + 1);
    }
    throw error;
  }
}

/**
 * 获取图片并转换为 Data URL（用于去水印功能）
 * @param {string} url - 图片 URL
 * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
 */
async function fetchImageAsDataUrl(url) {
  try {
    console.log('[SW] Fetching image for watermark removal:', url);

    const response = await fetchWithRetry(url, 0, 1);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    console.log('[SW] Got blob:', blob.size, 'bytes, type:', blob.type);

    // 使用 arrayBuffer 转换为 base64（比 FileReader 更可靠）
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 分块处理避免调用栈溢出
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }

    const base64 = btoa(binary);
    const mimeType = blob.type || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    console.log('[SW] Created dataUrl, length:', dataUrl.length);
    return { success: true, dataUrl };
  } catch (error) {
    console.error('[SW] fetchImageAsDataUrl failed:', error);
    return { success: false, error: error.message };
  }
}

/* Download Filename Interception */
// 使用 onDeterminingFilename 在下载时拦截并设置正确的文件名
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  // 检查是否是我们的 ZIP 下载（通过 data: URL 判断）
  if (downloadItem.url && downloadItem.url.startsWith('data:application/zip')) {
    suggest({ filename: 'Gemini_image.zip', conflictAction: 'uniquify' });
    return true;
  }
  // 不干预其他下载
  return false;
});

/**
 * 打包去水印后的图片为 ZIP
 * @param {Array<{dataUrl: string, filename: string}>} images - 图片数据数组
 * @returns {Promise<{success: boolean, successCount?: number, error?: string}>}
 */
async function packageWatermarkRemovedImages(images) {
  console.log('[SW] Packaging', images?.length, 'watermark-removed images');

  if (!images || images.length === 0) {
    return { success: false, error: 'No images to package' };
  }

  if (!jszipAvailable) {
    return { success: false, error: 'JSZip not available' };
  }

  try {
    const zip = new JSZip();

    for (let i = 0; i < images.length; i++) {
      const { dataUrl, filename } = images[i];

      // 从 dataUrl 提取 base64 数据
      const base64Data = dataUrl.split(',')[1];
      if (base64Data) {
        zip.file(filename, base64Data, { base64: true });
      }
    }

    // 生成 ZIP
    const zipBase64 = await zip.generateAsync({ type: 'base64' });
    const zipDataUrl = `data:application/zip;base64,${zipBase64}`;

    // 触发下载
    const downloadId = await downloadWithTimeout({
      url: zipDataUrl,
      filename: 'Gemini_image_nowm.zip',
      conflictAction: 'uniquify',
      saveAs: false
    });

    console.log('[SW] Watermark-removed ZIP download started, id:', downloadId);
    return { success: true, successCount: images.length };
  } catch (error) {
    console.error('[SW] packageWatermarkRemovedImages failed:', error);
    return { success: false, error: error.message };
  }
}

/* Message Handling */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (request.action === 'downloadPing') {
    sendResponse({ ok: true });
    return false;
  }

  // 为去水印功能获取图片（解决 CORS 问题）
  if (request.action === 'fetchImageForWatermark') {
    fetchImageAsDataUrl(request.url)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'downloadSingle') {
    handleSingleDownload(request.url)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (request.action === 'downloadBatch') {
    handleBatchDownload(request.urls, tabId)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 打包去水印后的图片为 ZIP（接收 base64 数组）
  if (request.action === 'packageWatermarkRemovedImages') {
    packageWatermarkRemovedImages(request.images)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getDownloadProgress') {
    // 获取当前下载进度
    getDownloadProgress()
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (request.action === 'clearDownloadProgress') {
    // 清除下载进度
    clearDownloadProgress()
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  return false;
});

/* Progress Persistence */
const PROGRESS_KEY = 'gid_batch_download_progress';

/**
 * 保存下载进度
 */
async function saveDownloadProgress(progress) {
  try {
    await chrome.storage.local.set({ [PROGRESS_KEY]: progress });
    console.log('[SW] Download progress saved:', progress);
  } catch (e) {
    console.error('[SW] Failed to save progress:', e);
  }
}

/**
 * 获取下载进度
 */
async function getDownloadProgress() {
  try {
    const result = await chrome.storage.local.get(PROGRESS_KEY);
    return result[PROGRESS_KEY] || null;
  } catch (e) {
    console.error('[SW] Failed to get progress:', e);
    return null;
  }
}

/**
 * 清除下载进度
 */
async function clearDownloadProgress() {
  try {
    await chrome.storage.local.remove(PROGRESS_KEY);
    console.log('[SW] Download progress cleared');
    return { success: true };
  } catch (e) {
    console.error('[SW] Failed to clear progress:', e);
    return { success: false, error: e.message };
  }
}

/* Core Logic */
async function handleSingleDownload(url) {
  try {
    if (!url) {
      return { success: false, error: 'No URL' };
    }
    const filename = buildImageFilename(null, getExtension(url));
    
    // 我们先尝试 fetch 获取真实类型，或者直接下载
    // 为了简单和稳健，这里直接交给 chrome.downloads
    // 但为了确保文件名后缀正确，最好是先 HEAD 一下，或者让浏览器自己决定，然后我们 rename
    // 这里简化处理：直接下载，让浏览器处理冲突
    
    const downloadId = await downloadWithTimeout({
      url: url,
      filename: filename,
      conflictAction: 'uniquify',
      saveAs: false
    });

    return { success: true, downloadId };
  } catch (error) {
    console.error('[SW] Single download failed:', error);
    return { success: false, error: error.message };
  }
}

async function handleBatchDownloadDirect(urls, sendProgress) {
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    sendProgress(i + 1, 'downloading', `Downloading image ${i + 1} of ${urls.length}...`);

    try {
      const filename = buildImageFilename(i, getExtension(url));
      await downloadWithTimeout({
        url: url,
        filename: filename,
        conflictAction: 'uniquify',
        saveAs: false
      });
      successCount++;
    } catch (error) {
      console.error('[SW] Direct download failed:', error);
      failCount++;
    }

    if (DIRECT_DOWNLOAD_DELAY_MS > 0) {
      await new Promise(resolve => setTimeout(resolve, DIRECT_DOWNLOAD_DELAY_MS));
    }
  }

  return { successCount, failCount };
}

async function handleBatchDownload(urls, senderTabId) {
  console.log('[SW] handleBatchDownload called with', urls?.length, 'URLs, tabId:', senderTabId);

  if (!urls || urls.length === 0) return { success: false, error: 'No URLs' };

  const total = urls.length;

  // 保存初始进度，支持断点续传
  await saveDownloadProgress({
    urls: urls,
    total: total,
    current: 0,
    timestamp: Date.now()
  });

  // 发送进度更新给 content script
  function sendProgress(current, status, message) {
    // 保存进度
    saveDownloadProgress({
      urls: urls,
      total: total,
      current: current,
      status: status,
      timestamp: Date.now()
    });

    if (senderTabId) {
      try {
        const sendResult = chrome.tabs.sendMessage(senderTabId, {
          action: 'batchProgress',
          current,
          total,
          status, // 'downloading' | 'packaging' | 'success' | 'error'
          message
        });
        if (sendResult && typeof sendResult.catch === 'function') {
          sendResult.catch(() => {});
        }
      } catch (error) {
        console.warn('[SW] Failed to send progress update:', error);
      }
    }
  }

  try {
    if (typeof JSZip === 'undefined') {
      sendProgress(0, 'downloading', 'ZIP unavailable, downloading directly...');
      const directResult = await handleBatchDownloadDirect(urls, sendProgress);
      const directStatus = directResult.successCount === 0
        ? 'error'
        : (directResult.failCount > 0 ? 'warning' : 'success');
      sendProgress(total, directStatus, 'Direct download completed');
      await clearDownloadProgress();
      return { success: true, ...directResult, mode: 'direct' };
    }
    const zip = new JSZip();
    let successCount = 0;
    let failCount = 0;
    let completed = 0;
    let cursor = 0;
    const concurrency = getZipFetchConcurrency(total);

    const nextIndex = () => {
      if (cursor >= urls.length) return null;
      const current = cursor;
      cursor += 1;
      return current;
    };

    sendProgress(0, 'downloading', `Processing 0 of ${total}...`);

    const worker = async () => {
      while (true) {
        const index = nextIndex();
        if (index === null) break;
        const url = urls[index];

        try {
          const response = await fetchWithRetry(url, index);
          if (!response.ok) throw new Error(`Status ${response.status}`);
          const blob = await response.blob();
          const ext = getExtension(url, blob.type);
          const filename = `image_${String(index + 1).padStart(2, '0')}.${ext}`;
          zip.file(filename, blob);
          successCount++;
        } catch (e) {
          console.error(`[SW] Failed to fetch image ${index + 1} after retries:`, e);
          failCount++;
        } finally {
          completed++;
          sendProgress(completed, 'downloading', `Processing ${completed} of ${total}...`);
        }
      }
    };

    const workers = Array.from({ length: concurrency }, worker);
    await Promise.all(workers);

    if (successCount === 0) {
      sendProgress(0, 'downloading', 'All fetches failed, downloading directly...');
      const directResult = await handleBatchDownloadDirect(urls, sendProgress);
      const directStatus = directResult.successCount === 0
        ? 'error'
        : (directResult.failCount > 0 ? 'warning' : 'success');
      sendProgress(total, directStatus, 'Direct download completed');
      await clearDownloadProgress();
      return { success: true, ...directResult, mode: 'direct' };
    }

    // 打包中
    sendProgress(total, 'packaging', 'Packaging ZIP file...');

    // 生成 base64 格式（Service Worker 不支持 URL.createObjectURL）
    const zipBase64 = await zip.generateAsync({ type: 'base64' });
    const dataUrl = `data:application/zip;base64,${zipBase64}`;

    const downloadId = await downloadWithTimeout({
      url: dataUrl,
      filename: 'Gemini_image.zip',
      conflictAction: 'uniquify',
      saveAs: false
    });
    console.log('[SW] Download started, id:', downloadId);

    // 发送成功消息
    const resultMsg = failCount > 0
      ? `Done: ${successCount} succeeded, ${failCount} failed`
      : `Successfully downloaded ${successCount} images`;
    sendProgress(total, 'success', resultMsg);

    // 清除保存的进度
    await clearDownloadProgress();

    return { success: true, successCount, failCount, downloadId, mode: 'zip' };

  } catch (error) {
    console.error('[SW] Batch download failed:', error);
    sendProgress(0, 'downloading', 'ZIP failed, downloading directly...');
    try {
      const directResult = await handleBatchDownloadDirect(urls, sendProgress);
      const directStatus = directResult.successCount === 0
        ? 'error'
        : (directResult.failCount > 0 ? 'warning' : 'success');
      sendProgress(total, directStatus, 'Direct download completed');
      await clearDownloadProgress();
      return { success: true, ...directResult, mode: 'direct' };
    } catch (directError) {
      console.error('[SW] Direct download failed:', directError);
      sendProgress(total, 'error', `Error: ${directError.message}`);
      await clearDownloadProgress();
      return { success: false, error: directError.message };
    }
  }
}
