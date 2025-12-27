// [IN]: chrome.storage, chrome.downloads, chrome.runtime / Chrome 存储、下载、运行时
// [OUT]: Download service, ZIP generation / 下载服务、ZIP 生成
// [POS]: src/background/service_worker.js
// Protocol: When updating me, sync this header + parent folder's .folder.md

try {
  importScripts('../../libs/jszip.min.js');
} catch (e) {
  console.error('[SW] Failed to load JSZip:', e);
}

const PENDING_KEY = 'pendingDownloadRenames';
const storage = chrome.storage.session || chrome.storage.local;

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
  return false;
});

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
  if (!urls || urls.length === 0) return { success: false, error: 'No URLs' };

  const total = urls.length;
  
  // 发送进度更新给 content script
  function sendProgress(current, status, message) {
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

    // 顺序下载以便显示进度
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      sendProgress(i + 1, 'downloading', `Downloading image ${i + 1} of ${total}...`);
      
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const blob = await response.blob();
        const ext = getExtension(url, blob.type);
        const filename = `image_${String(i + 1).padStart(2, '0')}.${ext}`;
        zip.file(filename, blob);
        successCount++;
      } catch (e) {
        console.error(`[SW] Failed to fetch image ${i + 1}:`, e);
        failCount++;
      }
    }

    if (successCount === 0) {
      sendProgress(total, 'error', 'All downloads failed');
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

    return { success: true, successCount, failCount, downloadId };

  } catch (error) {
    console.error('[SW] Batch download failed:', error);
    sendProgress(total, 'error', `Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}
