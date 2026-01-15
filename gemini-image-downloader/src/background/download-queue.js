// [IN]: chrome.downloads API, file-naming module / chrome.downloads API、文件命名模块
// [OUT]: addTask(), processQueue(), queue object / 添加任务函数、处理队列函数、队列对象
// [POS]: src/background/download-queue.js - Download management layer / 下载管理层
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

/**
 * Gemini Image Download Queue Manager
 * 管理下载任务队列，支持单个下载和批量下载（ZIP 打包）
 */

const queue = {
  tasks: [],
  isProcessing: false,
  currentTask: null
};

// 获取文件命名模块
function getFileNaming() {
  return self.GeminiFileNaming;
}

/**
 * 添加下载任务
 * @param {Object} task - { type: 'single' | 'batch', urls: string[], tabId: number }
 */
function addTask(task) {
  // 批量任务优先级更高，插入队首
  if (task.type === 'batch') {
    task.priority = 1;
    queue.tasks.unshift(task);
  } else {
    task.priority = 0;
    queue.tasks.push(task);
  }

  processQueue();
  return task;
}

/**
 * 处理队列
 */
async function processQueue() {
  if (queue.isProcessing || queue.tasks.length === 0) return;

  queue.isProcessing = true;
  queue.currentTask = queue.tasks.shift();

  try {
    let result;
    if (queue.currentTask.type === 'single') {
      result = await downloadSingle(queue.currentTask.urls[0]);
    } else {
      result = await downloadBatch(queue.currentTask.urls, queue.currentTask.tabId);
    }

    // 通知完成
    notifyTaskComplete(queue.currentTask, { success: true, ...result });
  } catch (error) {
    console.error('[GID Queue] Task failed:', error);
    // 通知失败
    notifyTaskComplete(queue.currentTask, { success: false, error: error.message });
  } finally {
    queue.currentTask = null;
    queue.isProcessing = false;

    // 继续处理下一个任务
    if (queue.tasks.length > 0) {
      processQueue();
    }
  }
}

/**
 * 单个下载
 * @param {string} url - 图片 URL
 */
async function downloadSingle(url) {
  const fileNaming = getFileNaming();
  const ext = getExtensionFromUrl(url);
  const filename = fileNaming ? fileNaming.generateFilename(1, false, ext) : `Gemini_Image.${ext}`;

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve({ downloadId, filename });
      }
    });
  });
}

/**
 * 批量下载（ZIP 打包）
 * @param {string[]} urls - 图片 URL 列表
 * @param {number} tabId - 标签页 ID（用于加载 JSZip）
 */
async function downloadBatch(urls, tabId) {
  // 动态加载 JSZip
  const JSZip = await loadJSZip();
  const zip = new JSZip();

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < urls.length; i++) {
    try {
      const response = await fetch(urls[i], {
        mode: 'cors',
        credentials: 'include'
      });

      if (response.ok) {
        const blob = await response.blob();
        const contentType = response.headers.get('content-type');
        const ext = getExtensionFromContentType(contentType);
        zip.file(`${String(i + 1).padStart(2, '0')}.${ext}`, blob);
        successCount++;
      } else {
        console.warn(`[GID Queue] Failed to fetch image ${i + 1}: ${response.status}`);
        failCount++;
      }
    } catch (error) {
      console.warn(`[GID Queue] Error fetching image ${i + 1}:`, error);
      failCount++;
    }

    // 通知进度
    notifyProgress(i + 1, urls.length, tabId);
  }

  if (successCount === 0) {
    throw new Error('所有图片下载失败');
  }

  // 生成 ZIP
  const content = await zip.generateAsync({ type: 'blob' });
  const fileNaming = getFileNaming();
  const filename = fileNaming 
    ? fileNaming.generateFilename(successCount, true) 
    : `Gemini_Image_${successCount}.zip`;

  // 下载 ZIP
  const blobUrl = URL.createObjectURL(content);

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: blobUrl,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      // 释放 Blob URL
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve({ downloadId, successCount, failCount, filename });
      }
    });
  });
}

/**
 * 动态加载 JSZip 库
 */
async function loadJSZip() {
  if (typeof JSZip !== 'undefined') {
    return JSZip;
  }

  // 在 Service Worker 中导入 JSZip
  try {
    importScripts(chrome.runtime.getURL('libs/jszip.min.js'));
    return JSZip;
  } catch (error) {
    console.error('[GID Queue] Failed to load JSZip:', error);
    throw new Error('无法加载 ZIP 库');
  }
}

/**
 * 从 URL 推断文件扩展名
 */
function getExtensionFromUrl(url) {
  // 尝试从 URL 中提取扩展名
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (match && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(match[1].toLowerCase())) {
    return match[1].toLowerCase();
  }
  return 'png'; // 默认
}

/**
 * 从 Content-Type 推断文件扩展名
 */
function getExtensionFromContentType(contentType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  return map[contentType?.split(';')[0]] || 'png';
}

/**
 * 进度通知（发送给 content script）
 */
function notifyProgress(current, total, tabId) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      action: 'downloadProgress',
      current,
      total
    }).catch(() => {
      // 忽略错误（标签页可能已关闭）
    });
  }
}

/**
 * 完成通知
 */
function notifyTaskComplete(task, result) {
  if (task.tabId) {
    chrome.tabs.sendMessage(task.tabId, {
      action: 'downloadComplete',
      task,
      result
    }).catch(() => {
      // 忽略错误
    });
  }
}

// 导出到全局（Service Worker）
self.GeminiDownloadQueue = {
  addTask,
  processQueue,
  queue
};

