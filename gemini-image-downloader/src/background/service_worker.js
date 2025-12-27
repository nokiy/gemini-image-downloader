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
function getBasename(pathname) {
  if (!pathname) return '';
  return pathname.split(/[/\\]/).pop() || '';
}

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

/* Download Tracking & Renaming (from M1) */
async function trackDownload(downloadId, filename) {
  const data = await new Promise(r => storage.get(PENDING_KEY, res => r(res[PENDING_KEY] || {})));
  data[String(downloadId)] = filename;
  await new Promise(r => storage.set({ [PENDING_KEY]: data }, r));
}

async function handleDownloadChanged(delta) {
  if (!delta || !delta.state || delta.state.current !== 'complete') return;
  const data = await new Promise(r => storage.get(PENDING_KEY, res => r(res[PENDING_KEY] || {})));
  const expected = data[String(delta.id)];
  if (!expected) return;

  chrome.downloads.search({ id: delta.id }, (items) => {
    if (!items || !items[0]) return;
    const currentBase = getBasename(items[0].filename);
    if (currentBase !== expected) {
      chrome.downloads.rename(delta.id, { filename: expected }, () => {
        if (chrome.runtime.lastError) console.warn('[SW] Rename failed:', chrome.runtime.lastError);
      });
    }
  });
  
  delete data[String(delta.id)];
  storage.set({ [PENDING_KEY]: data });
}

chrome.downloads.onChanged.addListener(handleDownloadChanged);

/* Message Handling */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadSingle') {
    handleSingleDownload(request.url).then(sendResponse);
    return true;
  }
  if (request.action === 'downloadBatch') {
    handleBatchDownload(request.urls).then(sendResponse);
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

async function handleBatchDownload(urls) {
  if (!urls || urls.length === 0) return { success: false, error: 'No URLs' };

  try {
    const zip = new JSZip();
    let successCount = 0;
    let failCount = 0;

    const fetches = urls.map(async (url, index) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const blob = await response.blob();
        const ext = getExtension(url, blob.type);
        const filename = `image_${String(index + 1).padStart(2, '0')}.${ext}`;
        zip.file(filename, blob);
        successCount++;
      } catch (e) {
        console.error(`[SW] Failed to fetch ${url}:`, e);
        failCount++;
      }
    });

    await Promise.all(fetches);

    if (successCount === 0) {
      return { success: false, error: 'All downloads failed', failCount };
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    // 使用 Blob URL 而非 data URL，这样 filename 参数才会生效
    const blobUrl = URL.createObjectURL(zipBlob);
    const filename = 'Gemini_image.zip';
    
    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: blobUrl,
        filename: filename,
        conflictAction: 'uniquify',
        saveAs: false
      }, (id) => {
        // 延迟释放 Blob URL
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(id);
      });
    });

    return { success: true, successCount, failCount, downloadId };

  } catch (error) {
    console.error('[SW] Batch download failed:', error);
    return { success: false, error: error.message };
  }
}
