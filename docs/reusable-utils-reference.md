# Chrome 扩展可复用工具库参考文档

> 本文档整理自 Gemini Image Downloader 项目，包含经过验证的、可直接复用的工具模块。

---

## 目录

1. [错误日志系统 (error-logger.js)](#1-错误日志系统-error-loggerjs)
2. [文件命名工具 (file-naming.js)](#2-文件命名工具-file-namingjs)
3. [异步下载队列 (download-queue.js)](#3-异步下载队列-download-queuejs)
4. [Google 高清原图还原 (google-image-utils.js)](#4-google-高清原图还原-google-image-utilsjs)

---

## 1. 错误日志系统 (error-logger.js)

### 复用等级
⭐⭐⭐⭐⭐ 直接复制，无需修改

### 使用场景
- 任何浏览器扩展的生产环境错误追踪
- 用户反馈问题定位
- 崩溃统计分析
- 开发阶段调试

### 核心 API

```javascript
// 记录错误
logError(error, { category, context })

// 便捷方法
logDetectionError(error, context)  // 检测相关错误
logDownloadError(error, context)   // 下载相关错误
logNetworkError(error, context)    // 网络相关错误
logUIError(error, context)         // UI 渲染错误

// 查询与管理
getErrorLogs()                     // 获取所有日志
getErrorLogsByCategory(category)   // 按分类获取
getErrorStats()                    // 获取统计信息
clearErrorLogs()                   // 清除所有日志
```

### 错误分类常量

```javascript
const ERROR_CATEGORIES = {
  DETECTION: 'detection',   // 图片/内容检测错误
  DOWNLOAD: 'download',     // 下载错误
  NETWORK: 'network',       // 网络错误
  UI: 'ui',                 // UI渲染错误
  STATE: 'state',           // 状态管理错误
  UNKNOWN: 'unknown'        // 未知错误
};
```

### 完整代码

```javascript
// error-logger.js
// 错误日志追踪与统计模块

const ERROR_STORAGE_KEY = 'extension_error_logs';
const MAX_LOG_COUNT = 100;

const ERROR_CATEGORIES = {
  DETECTION: 'detection',
  DOWNLOAD: 'download',
  NETWORK: 'network',
  UI: 'ui',
  STATE: 'state',
  UNKNOWN: 'unknown'
};

/**
 * 记录错误
 * @param {Error|string} error - 错误对象或错误消息
 * @param {Object} options - 选项
 */
async function logError(error, options = {}) {
  const {
    category = ERROR_CATEGORIES.UNKNOWN,
    context = {},
    console: shouldLog = true
  } = options;

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : new Error().stack;

  const logEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    category,
    message,
    stack,
    context,
    timestamp: Date.now(),
    userAgent: navigator.userAgent
  };

  if (shouldLog) {
    console.error(`[Error][${category.toUpperCase()}]`, message, { context, stack });
  }

  try {
    const logs = await getErrorLogs();
    logs.unshift(logEntry);
    if (logs.length > MAX_LOG_COUNT) {
      logs.splice(MAX_LOG_COUNT);
    }
    await saveErrorLogs(logs);
    window.dispatchEvent(new CustomEvent('error-logged', { detail: logEntry }));
  } catch (e) {
    console.error('Failed to save error log:', e);
  }

  return logEntry;
}

async function getErrorLogs() {
  try {
    const result = await chrome.storage.local.get(ERROR_STORAGE_KEY);
    return result[ERROR_STORAGE_KEY] || [];
  } catch (e) {
    return [];
  }
}

async function saveErrorLogs(logs) {
  await chrome.storage.local.set({ [ERROR_STORAGE_KEY]: logs });
}

async function clearErrorLogs() {
  await chrome.storage.local.remove(ERROR_STORAGE_KEY);
  return true;
}

async function getErrorStats() {
  const logs = await getErrorLogs();
  const stats = {
    total: logs.length,
    byCategory: {},
    recent: logs.slice(0, 10),
    oldest: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
    newest: logs.length > 0 ? logs[0].timestamp : null
  };
  logs.forEach(log => {
    stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
  });
  return stats;
}

async function getErrorLogsByCategory(category) {
  const logs = await getErrorLogs();
  return logs.filter(log => log.category === category);
}

// 便捷方法
function logDetectionError(error, context = {}) {
  return logError(error, { category: ERROR_CATEGORIES.DETECTION, context });
}

function logDownloadError(error, context = {}) {
  return logError(error, { category: ERROR_CATEGORIES.DOWNLOAD, context });
}

function logNetworkError(error, context = {}) {
  return logError(error, { category: ERROR_CATEGORIES.NETWORK, context });
}

function logUIError(error, context = {}) {
  return logError(error, { category: ERROR_CATEGORIES.UI, context });
}

// 全局错误捕获
function setupGlobalErrorHandlers() {
  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason || 'Unhandled Promise Rejection', {
      category: ERROR_CATEGORIES.UNKNOWN,
      context: { type: 'unhandledrejection' }
    });
  });

  window.addEventListener('error', (event) => {
    logError(event.error || new Error(event.message), {
      category: ERROR_CATEGORIES.UNKNOWN,
      context: {
        type: 'global-error',
        filename: event.filename,
        lineno: event.lineno
      }
    });
  });
}

// 初始化
if (typeof window !== 'undefined') {
  setupGlobalErrorHandlers();
}

// 导出
window.ErrorLogger = {
  logError,
  logDetectionError,
  logDownloadError,
  logNetworkError,
  logUIError,
  getErrorLogs,
  getErrorLogsByCategory,
  getErrorStats,
  clearErrorLogs,
  ERROR_CATEGORIES
};
```

---

## 2. 文件命名工具 (file-naming.js)

### 复用等级
⭐⭐⭐⭐⭐ 直接复制，无需修改

### 使用场景
- 图片/视频下载器
- 网页内容保存工具
- 任何涉及文件导出的扩展

### 核心 API

```javascript
// 生成文件名
generateFilename(count, isZip, ext)

// 清理非法字符
sanitizeFilename(name)

// 截断长文件名
truncateFilename(name, maxLength)

// 解决命名冲突
resolveConflict(baseName, ext)
```

### 完整代码

```javascript
// file-naming.js
// 文件命名工具模块

const BASE_DIR = 'Downloads'; // 可自定义

/**
 * 生成文件名
 * @param {number} count - 文件数量
 * @param {boolean} isZip - 是否为 ZIP 文件
 * @param {string} ext - 文件扩展名
 */
function generateFilename(count, isZip, ext = 'png') {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  
  if (isZip) {
    return `${BASE_DIR}/Export_${timestamp}_${count}.zip`;
  } else {
    return `${BASE_DIR}/File_${timestamp}.${ext}`;
  }
}

/**
 * 清理文件名中的非法字符
 * 兼容 Windows / macOS / Linux
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')  // Windows 非法字符
    .replace(/[\x00-\x1f]/g, '')     // 控制字符
    .replace(/\s+/g, '_')            // 空白字符
    .replace(/_+/g, '_')             // 合并连续下划线
    .replace(/^_|_$/g, '')           // 去除首尾下划线
    .substring(0, 200);              // 限制长度
}

/**
 * 截断文件名到指定长度
 */
function truncateFilename(name, maxLength = 50) {
  if (name.length <= maxLength) {
    return name;
  }
  return name.substring(0, maxLength - 3) + '...';
}

/**
 * 解决文件名冲突
 * 通过检查下载历史自动添加序号
 */
async function resolveConflict(baseName, ext) {
  let filename = `${BASE_DIR}/${baseName}.${ext}`;
  let counter = 0;

  const exists = await checkFileInHistory(baseName, ext);
  if (!exists) return filename;

  while (counter < 1000) {
    counter++;
    const newBaseName = `${baseName}_${counter}`;
    filename = `${BASE_DIR}/${newBaseName}.${ext}`;
    const stillExists = await checkFileInHistory(newBaseName, ext);
    if (!stillExists) return filename;
  }

  // 防止无限循环，使用时间戳
  return `${BASE_DIR}/${baseName}_${Date.now()}.${ext}`;
}

function checkFileInHistory(baseName, ext) {
  return new Promise((resolve) => {
    const fullName = `${baseName}.${ext}`;
    chrome.downloads.search({
      filenameRegex: `.*${escapeRegex(fullName)}$`,
      state: 'complete',
      limit: 1
    }, (results) => {
      resolve(results && results.length > 0);
    });
  });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从 URL 推断文件扩展名
 */
function getExtensionFromUrl(url) {
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (match && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'pdf'].includes(match[1].toLowerCase())) {
    return match[1].toLowerCase();
  }
  return 'png';
}

/**
 * 从 Content-Type 推断文件扩展名
 */
function getExtensionFromContentType(contentType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf'
  };
  return map[contentType?.split(';')[0]] || 'bin';
}

// 导出
self.FileNaming = {
  generateFilename,
  sanitizeFilename,
  truncateFilename,
  resolveConflict,
  getExtensionFromUrl,
  getExtensionFromContentType,
  BASE_DIR
};
```

---

## 3. 异步下载队列 (download-queue.js)

### 复用等级
⭐⭐⭐⭐ 提取核心后复用

### 使用场景
- 批量下载资源（图片、视频、文档）
- 需要打包成 ZIP 导出
- 后台任务队列管理
- 大文件分批处理

### 核心特性
- 优先级队列（批量任务优先）
- JSZip 在 Service Worker 中的动态加载
- 实时进度消息推送
- 错误容错处理

### 核心 API

```javascript
// 添加任务
addTask({ type: 'single' | 'batch', urls: string[], tabId: number })

// 处理队列（自动调用）
processQueue()

// 队列状态
queue.isProcessing  // 是否正在处理
queue.tasks         // 待处理任务列表
queue.currentTask   // 当前任务
```

### 完整代码

```javascript
// download-queue.js
// 异步下载队列管理模块（用于 Service Worker）

const queue = {
  tasks: [],
  isProcessing: false,
  currentTask: null
};

/**
 * 添加下载任务
 * @param {Object} task - { type: 'single' | 'batch', urls: string[], tabId: number }
 */
function addTask(task) {
  if (task.type === 'batch') {
    task.priority = 1;
    queue.tasks.unshift(task); // 批量任务插入队首
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
    notifyTaskComplete(queue.currentTask, { success: true, ...result });
  } catch (error) {
    console.error('[Queue] Task failed:', error);
    notifyTaskComplete(queue.currentTask, { success: false, error: error.message });
  } finally {
    queue.currentTask = null;
    queue.isProcessing = false;
    if (queue.tasks.length > 0) {
      processQueue();
    }
  }
}

/**
 * 单个下载
 */
async function downloadSingle(url) {
  const ext = getExtensionFromUrl(url);
  const filename = `Downloads/File_${Date.now()}.${ext}`;

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
 */
async function downloadBatch(urls, tabId) {
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
        zip.file(`${String(i + 1).padStart(3, '0')}.${ext}`, blob);
        successCount++;
      } else {
        failCount++;
      }
    } catch (error) {
      console.warn(`[Queue] Error fetching ${i + 1}:`, error);
      failCount++;
    }

    // 通知进度
    notifyProgress(i + 1, urls.length, tabId);
  }

  if (successCount === 0) {
    throw new Error('所有文件下载失败');
  }

  // 生成 ZIP
  const content = await zip.generateAsync({ type: 'blob' });
  const filename = `Downloads/Export_${successCount}.zip`;
  const blobUrl = URL.createObjectURL(content);

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: blobUrl,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
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
 * 动态加载 JSZip（Service Worker 专用）
 */
async function loadJSZip() {
  if (typeof JSZip !== 'undefined') {
    return JSZip;
  }
  try {
    importScripts(chrome.runtime.getURL('libs/jszip.min.js'));
    return JSZip;
  } catch (error) {
    throw new Error('无法加载 ZIP 库');
  }
}

// 辅助函数
function getExtensionFromUrl(url) {
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (match && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(match[1].toLowerCase())) {
    return match[1].toLowerCase();
  }
  return 'png';
}

function getExtensionFromContentType(contentType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  return map[contentType?.split(';')[0]] || 'png';
}

function notifyProgress(current, total, tabId) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      action: 'downloadProgress',
      current,
      total,
      message: `下载中 ${current}/${total}`
    }).catch(() => {});
  }
}

function notifyTaskComplete(task, result) {
  if (task.tabId) {
    chrome.tabs.sendMessage(task.tabId, {
      action: 'downloadComplete',
      task,
      result
    }).catch(() => {});
  }
}

// 导出
self.DownloadQueue = {
  addTask,
  processQueue,
  queue
};
```

### 使用示例

```javascript
// 在 service_worker.js 中
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadSingle') {
    DownloadQueue.addTask({
      type: 'single',
      urls: [request.url],
      tabId: sender.tab.id
    });
    sendResponse({ success: true });
  }
  
  if (request.action === 'downloadBatch') {
    DownloadQueue.addTask({
      type: 'batch',
      urls: request.urls,
      tabId: sender.tab.id
    });
    sendResponse({ success: true });
  }
});
```

---

## 4. Google 高清原图还原 (google-image-utils.js)

### 复用等级
⭐⭐⭐ 特定场景复用（Google 系产品专用）

### 适用产品列表

| 产品 | 典型场景 |
|------|---------|
| **Gemini** | AI 生成图片的高清下载 |
| **Google Photos** | 相册图片原图导出 |
| **Google Image Search** | 搜索结果原图获取 |
| **Blogger / Blogspot** | 博客文章内嵌图片的原图提取 |
| **Google Drive** | 预览图片的原图链接还原 |
| **Google Docs / Slides** | 文档中插入的图片原图提取 |
| **YouTube** | 视频缩略图的高清版本获取 |
| **Google Maps** | 街景/地点照片的高清版本 |

### URL 参数速查表

| 原始参数 | 含义 | 替换为 |
|---------|------|-------|
| `=s512` | 最大边长 512px | `=s0`（原图） |
| `=w800-h600` | 宽 800 高 600 | `=s0` |
| `=s0-d` | 原图+下载模式 | 保留 |
| 无参数 | 默认缩略图 | 添加 `=s0` |

### 完整代码

```javascript
// google-image-utils.js
// Google 图片服务 URL 处理工具

/**
 * 获取图片的原始高清URL
 * 
 * Google 图片服务 URL 参数说明：
 * - =s0: 原始尺寸（最高质量）
 * - =sXXXX: 指定最大边长
 * - =wXXXX-hXXXX: 指定宽高
 * - =d: 下载模式
 * 
 * @param {string} url - 原始图片 URL
 * @returns {string} 优化后的高清 URL
 */
function getOriginalImageUrl(url) {
  // 检查是否为 Google 内容服务器
  if (!url || !url.includes('googleusercontent.com')) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname;

    // 处理尺寸参数
    if (path.match(/=s\d+/)) {
      // 替换 =sXXX 为 =s0
      path = path.replace(/=s\d+/, '=s0');
    } else if (path.match(/=w\d+-h\d+/)) {
      // 替换 =wXXX-hXXX 为 =s0
      path = path.replace(/=w\d+-h\d+/, '=s0');
    } else if (!path.includes('=s')) {
      // 如果没有任何尺寸参数，添加 =s0
      path = path + '=s0';
    }

    urlObj.pathname = path;

    // 移除可能的质量降低参数
    urlObj.searchParams.delete('sz');
    urlObj.searchParams.delete('w');
    urlObj.searchParams.delete('h');

    return urlObj.toString();
  } catch (e) {
    console.error('Failed to parse Google image URL:', e);
    return url;
  }
}

/**
 * 检查 URL 是否为 Google 图片服务
 */
function isGoogleImageUrl(url) {
  return url && (
    url.includes('googleusercontent.com') ||
    url.includes('ggpht.com') ||
    url.includes('lh3.google.com') ||
    url.includes('lh4.google.com') ||
    url.includes('lh5.google.com') ||
    url.includes('lh6.google.com')
  );
}

/**
 * 批量处理 Google 图片 URL
 * @param {string[]} urls - URL 列表
 * @returns {string[]} 优化后的 URL 列表
 */
function optimizeGoogleImageUrls(urls) {
  return urls.map(url => {
    if (isGoogleImageUrl(url)) {
      return getOriginalImageUrl(url);
    }
    return url;
  });
}

/**
 * 获取指定尺寸的图片 URL
 * @param {string} url - 原始 URL
 * @param {number} size - 最大边长
 */
function getResizedImageUrl(url, size) {
  if (!isGoogleImageUrl(url)) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname;

    // 替换或添加尺寸参数
    if (path.match(/=s\d+/)) {
      path = path.replace(/=s\d+/, `=s${size}`);
    } else if (path.match(/=w\d+-h\d+/)) {
      path = path.replace(/=w\d+-h\d+/, `=s${size}`);
    } else {
      path = path + `=s${size}`;
    }

    urlObj.pathname = path;
    return urlObj.toString();
  } catch (e) {
    return url;
  }
}

// 导出
window.GoogleImageUtils = {
  getOriginalImageUrl,
  isGoogleImageUrl,
  optimizeGoogleImageUrls,
  getResizedImageUrl
};
```

### 使用示例

```javascript
// 单个 URL 优化
const thumbUrl = 'https://lh3.googleusercontent.com/abc123=s512';
const hdUrl = GoogleImageUtils.getOriginalImageUrl(thumbUrl);
// 结果: https://lh3.googleusercontent.com/abc123=s0

// 批量优化
const urls = [
  'https://lh3.googleusercontent.com/img1=s256',
  'https://lh3.googleusercontent.com/img2=w400-h300',
  'https://example.com/other.jpg'
];
const optimized = GoogleImageUtils.optimizeGoogleImageUrls(urls);
// 结果: [
//   'https://lh3.googleusercontent.com/img1=s0',
//   'https://lh3.googleusercontent.com/img2=s0',
//   'https://example.com/other.jpg'  // 非 Google URL 保持不变
// ]

// 获取指定尺寸（用于生成缩略图）
const thumb = GoogleImageUtils.getResizedImageUrl(hdUrl, 200);
// 结果: https://lh3.googleusercontent.com/abc123=s200
```

---

## 📦 建议的项目结构

```
your-extension/
├── manifest.json
├── libs/
│   └── jszip.min.js           ← 下载: https://stuk.github.io/jszip/
├── src/
│   ├── utils/
│   │   ├── error-logger.js    ← 直接复制
│   │   ├── file-naming.js     ← 直接复制
│   │   ├── download-queue.js  ← 直接复制
│   │   └── google-image-utils.js ← Google 专用
│   ├── background/
│   │   └── service_worker.js
│   ├── content/
│   │   ├── content.js
│   │   └── content.css
│   └── popup/
│       ├── popup.html
│       ├── popup.js
│       └── popup.css
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 📝 更新日志

| 日期 | 版本 | 说明 |
|------|------|------|
| 2024-12-28 | v1.0 | 初始版本，从 Gemini Image Downloader 提取 |

---

> 💡 **提示**：使用前请根据实际项目需求调整命名空间（如 `window.ErrorLogger` → `window.YourProject.ErrorLogger`）

