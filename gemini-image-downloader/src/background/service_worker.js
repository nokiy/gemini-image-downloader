// [IN]: chrome.storage, chrome.downloads, chrome.runtime / Chrome 存储、下载、运行时
// [OUT]: Download service, ZIP generation / 下载服务、ZIP 生成
// [POS]: src/background/service_worker.js
// Protocol: When updating me, sync this header + parent folder's .folder.md

// 加载 JSZip 库（路径相对于扩展根目录）
importScripts('libs/jszip.min.js');
console.log('[SW] Service Worker initialized, JSZip available:', typeof JSZip !== 'undefined');

const PENDING_KEY = 'pendingDownloadRenames';
const storage = chrome.storage.session || chrome.storage.local;

// 下载重试配置
const RETRY_CONFIG = {
  maxRetries: 3,           // 最大重试次数
  retryDelay: 1000,        // 重试延迟（毫秒）
  retryableErrors: [       // 可重试的错误状态码
    408, // Request Timeout
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504  // Gateway Timeout
  ]
};

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
      signal: timeoutSignal // 30秒超时
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

/* Message Handling */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (request.action === 'downloadSingle') {
    handleSingleDownload(request.url).then(sendResponse);
    return true;
  }
  if (request.action === 'downloadBatch') {
    handleBatchDownload(request.urls, tabId).then(sendResponse);
    return true;
  }
  if (request.action === 'getDownloadProgress') {
    // 获取当前下载进度
    getDownloadProgress().then(sendResponse);
    return true;
  }
  if (request.action === 'clearDownloadProgress') {
    // 清除下载进度
    clearDownloadProgress().then(sendResponse);
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
    const filename = 'Gemini_Image.png'; // 浏览器会自动处理后缀和重名 (1)
    
    // 我们先尝试 fetch 获取真实类型，或者直接下载
    // 为了简单和稳健，这里直接交给 chrome.downloads
    // 但为了确保文件名后缀正确，最好是先 HEAD 一下，或者让浏览器自己决定，然后我们 rename
    // 这里简化处理：直接下载，让浏览器处理冲突
    
    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: url,
        filename: filename, // 建议文件名
        conflictAction: 'uniquify',
        saveAs: false
      }, (id) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(id);
      });
    });

    return { success: true, downloadId };
  } catch (error) {
    console.error('[SW] Single download failed:', error);
    return { success: false, error: error.message };
  }
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
      chrome.tabs.sendMessage(senderTabId, {
        action: 'batchProgress',
        current,
        total,
        status, // 'downloading' | 'packaging' | 'success' | 'error'
        message
      }).catch(() => {});
    }
  }

  try {
    const zip = new JSZip();
    let successCount = 0;
    let failCount = 0;

    // 顺序下载以便显示进度（带重试机制）
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      sendProgress(i + 1, 'downloading', `Downloading image ${i + 1} of ${total}...`);

      try {
        const response = await fetchWithRetry(url, i);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const blob = await response.blob();
        const ext = getExtension(url, blob.type);
        const filename = `image_${String(i + 1).padStart(2, '0')}.${ext}`;
        zip.file(filename, blob);
        successCount++;
      } catch (e) {
        console.error(`[SW] Failed to fetch image ${i + 1} after retries:`, e);
        failCount++;
      }
    }

    if (successCount === 0) {
      sendProgress(total, 'error', 'All downloads failed');
      await clearDownloadProgress();
      return { success: false, error: 'All downloads failed', failCount };
    }

    // 打包中
    sendProgress(total, 'packaging', 'Packaging ZIP file...');

    // 生成 base64 格式（Service Worker 不支持 URL.createObjectURL）
    const zipBase64 = await zip.generateAsync({ type: 'base64' });
    const dataUrl = `data:application/zip;base64,${zipBase64}`;

    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: dataUrl,
        filename: 'Gemini_image.zip',
        conflictAction: 'uniquify',
        saveAs: false
      }, (id) => {
        if (chrome.runtime.lastError) {
          console.error('[SW] Download failed:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('[SW] Download started, id:', id);
          resolve(id);
        }
      });
    });

    // 发送成功消息
    const resultMsg = failCount > 0
      ? `Done: ${successCount} succeeded, ${failCount} failed`
      : `Successfully downloaded ${successCount} images`;
    sendProgress(total, 'success', resultMsg);

    // 清除保存的进度
    await clearDownloadProgress();

    return { success: true, successCount, failCount, downloadId };

  } catch (error) {
    console.error('[SW] Batch download failed:', error);
    sendProgress(total, 'error', `Error: ${error.message}`);
    await clearDownloadProgress();
    return { success: false, error: error.message };
  }
}
