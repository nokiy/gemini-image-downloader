# Chrome 扩展可复用工具库参考文档

> 本文档整理自 Gemini Image Downloader 项目，包含经过验证的、可直接复用的工具模块。

---

## 目录

1. [选择器配置化 (selectors.js)](#1-选择器配置化-selectorsjs) ⭐ 新增
2. [统一日志规范 (logger.js)](#2-统一日志规范-loggerjs)
3. [错误日志系统 (error-logger.js)](#3-错误日志系统-error-loggerjs)
4. [文件命名工具 (file-naming.js)](#4-文件命名工具-file-namingjs)
5. [异步下载队列 (download-queue.js)](#5-异步下载队列-download-queuejs)
6. [Google 高清原图还原 (google-image-utils.js)](#6-google-高清原图还原-google-image-utilsjs)
7. [代码加固规范 (断点防护)](#7-代码加固规范-断点防护)

---

## 1. 选择器配置化 (selectors.js)

### 复用等级
⭐⭐⭐⭐⭐ 必须遵守的架构规范

### 核心理念
**将所有 DOM 选择器从业务代码中提取出来，集中到一个配置文件中管理。**

这样做的好处：
1. **单点修改**：目标网站页面更新时，只需修改配置文件
2. **易于调试**：可以在控制台直接查看和测试选择器
3. **版本管理**：支持多版本选择器配置
4. **降低维护成本**：不用在几百行代码中搜索选择器

### 使用场景
- Chrome 扩展注入到第三方网站（如 Gemini、ChatGPT 等）
- 需要定位特定 DOM 元素的脚本
- 页面结构可能频繁变化的项目

### 核心 API

```javascript
// 获取完整配置
const selectors = window.GeminiSelectors;

// 按分类获取
const detectionSelectors = window.getGeminiSelectors('detection');
const uiSelectors = window.getGeminiSelectors('ui');

// 测试选择器（调试用）
window.testGeminiSelector('button[data-test-id="download"]');
// 返回: { selector, found: 3, elements: [...] }
```

### 完整代码

```javascript
// selectors.js - 选择器配置文件

window.GeminiSelectors = {
  // 配置版本（便于追踪）
  version: '2024-12',
  
  // ===== 图片检测相关 =====
  detection: {
    // 下载按钮
    downloadButton: 'download-generated-image-button button[data-test-id="download-generated-image-button"]',
    
    // 图片容器（按优先级顺序）
    imageContainers: ['generated-image', 'single-image'],
    
    // 容器内的图片
    containerImage: 'img.image',
    
    // Google 图片选择器
    googleImage: 'img[src*="googleusercontent.com"]',
    
    // 排除的元素
    avatarParent: '[data-participant-id]'
  },

  // ===== URL 模式 =====
  urlPatterns: {
    googleContent: 'googleusercontent.com',
    generatedImage: '/gg-dl/',
    avatar: '/a/'
  },

  // ===== UI 注入相关 =====
  ui: {
    // 用户头像按钮（按优先级）
    userAvatar: [
      'button[aria-label*="Google"]',
      'button[aria-label*="Account"]',
      '[data-test-id="user-menu-button"]'
    ],
    
    // 导航栏
    navbar: [
      '[data-test-id="upgrade-button"]',
      'header nav',
      'header [role="navigation"]'
    ],
    
    header: 'header',
    headerButtons: 'header button'
  },

  // ===== 扩展自身元素 ID =====
  extension: {
    iconId: 'gemini-downloader-icon',
    drawerId: 'gemini-downloader-drawer',
    overlayId: 'gemini-downloader-overlay'
  },

  // ===== 阈值配置 =====
  thresholds: {
    minGeneratedSize: 200,
    maxIconSize: 120
  }
};

// 辅助函数
window.getGeminiSelectors = function(category) {
  if (category && window.GeminiSelectors[category]) {
    return window.GeminiSelectors[category];
  }
  return window.GeminiSelectors;
};

// 调试工具
window.testGeminiSelector = function(selector) {
  try {
    const elements = document.querySelectorAll(selector);
    return { selector, found: elements.length, elements: Array.from(elements) };
  } catch (e) {
    return { selector, error: e.message };
  }
};
```

### 业务代码中的使用

```javascript
// detection.js

// 获取配置
function getSelectors() {
  return window.GeminiSelectors?.detection || {
    // 降级默认值
    downloadButton: 'button[data-test-id="download"]',
    imageContainers: ['div.image-container'],
    containerImage: 'img'
  };
}

function findImages() {
  const selectors = getSelectors();
  
  // ✅ 使用配置中的选择器
  const buttons = document.querySelectorAll(selectors.downloadButton);
  
  buttons.forEach(btn => {
    // 遍历容器选择器列表
    let container = null;
    for (const containerSelector of selectors.imageContainers) {
      container = btn?.closest(containerSelector);
      if (container) break;
    }
    
    if (container) {
      const img = container.querySelector(selectors.containerImage);
      // ...
    }
  });
}
```

### 页面更新时的维护

当目标网站更新后，只需修改 `selectors.js`：

```javascript
// 假设 Gemini 在 2025 年 1 月更新了页面

// 修改前（2024-12 版本）
downloadButton: 'download-generated-image-button button[data-test-id="download-generated-image-button"]'

// 修改后（2025-01 版本）
downloadButton: 'button[data-action="download-image"]'
```

**改动范围**：只修改一个文件，业务代码完全不变。

### 进阶：多版本支持

```javascript
const SELECTOR_VERSIONS = {
  'v2024-12': {
    downloadButton: 'download-generated-image-button button[data-test-id="download"]',
    imageContainers: ['generated-image', 'single-image']
  },
  'v2025-01': {
    downloadButton: 'button[data-action="download-image"]',
    imageContainers: ['ai-image-container', 'single-image-view']
  }
};

// 自动检测页面版本
function detectPageVersion() {
  if (document.querySelector('ai-image-container')) return 'v2025-01';
  return 'v2024-12';
}

window.GeminiSelectors = {
  version: detectPageVersion(),
  ...SELECTOR_VERSIONS[detectPageVersion()]
};
```

---

## 2. 统一日志规范 (logger.js)

### 复用等级
⭐⭐⭐⭐⭐ 直接复制，强制使用

### 使用场景
- **替代所有原生 `console.log/error/warn/info`**
- 自动对接 `error-logger.js` 记录错误
- 提供统一的日志格式和分级管理
- 生产环境可一键关闭 debug 日志

### 核心理念
**禁止直接使用 `console.log`**，所有日志必须通过统一的 Logger 输出，好处：
1. 日志格式统一，便于追踪
2. 错误自动记录到存储，便于分析
3. 可根据环境开关不同级别的日志
4. 便于后续接入远程日志上报

### 核心 API

```javascript
const logger = window.GeminiImageLogger;

// DEBUG 级别（开发调试用）
logger.debug('ModuleName', 'Debug message', { key: 'value' });

// INFO 级别（关键流程信息）
logger.info('ModuleName', 'Operation completed', { count: 10 });

// WARN 级别（警告，不影响功能但需注意）
logger.warn('ModuleName', 'Deprecated API used', { api: 'oldMethod' });

// ERROR 级别（错误，自动记录到 error-logger）
logger.error('ModuleName', new Error('Something failed'), { context: 'data' });

// 性能计时
const endTimer = logger.time('Heavy Operation');
// ... 执行耗时操作 ...
endTimer(); // 输出: [GID][Performance][Info] Heavy Operation completed in 123.45ms

// 条件日志
logger.logIf(isDevelopment, logger.debug, 'Dev', 'Debug info');
```

### 日志级别配置

```javascript
// 生产环境关闭 debug 日志
logger.setLogConfig({
  debug: false,  // 关闭 debug
  info: true,    // 保留 info
  warn: true,    // 保留 warn
  error: true    // 始终开启
});

// 查看当前配置
const config = logger.getLogConfig();
```

### 完整代码

```javascript
// logger.js
// 统一日志规范：替代原生 console.log/error，自动对接 error-logger

const LOG_PREFIX = '[GID]';
const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

// 日志开关（生产环境可设为 false 禁用 debug/info）
const LOG_CONFIG = {
  debug: true,
  info: true,
  warn: true,
  error: true
};

function getErrorLogger() {
  return window.GeminiImageErrorLogger || null;
}

function formatMessage(level, module, message, data) {
  const timestamp = new Date().toISOString().slice(11, 23);
  const moduleTag = module ? `[${module}]` : '';
  return {
    formatted: `${LOG_PREFIX}${moduleTag}[${level.toUpperCase()}]`,
    timestamp,
    message,
    data
  };
}

function debug(module, message, data = null) {
  if (!LOG_CONFIG.debug) return;
  const log = formatMessage(LOG_LEVELS.DEBUG, module, message, data);
  if (data) {
    console.log(log.formatted, message, data);
  } else {
    console.log(log.formatted, message);
  }
}

function info(module, message, data = null) {
  if (!LOG_CONFIG.info) return;
  const log = formatMessage(LOG_LEVELS.INFO, module, message, data);
  if (data) {
    console.info(log.formatted, message, data);
  } else {
    console.info(log.formatted, message);
  }
}

function warn(module, message, data = null) {
  if (!LOG_CONFIG.warn) return;
  const log = formatMessage(LOG_LEVELS.WARN, module, message, data);
  if (data) {
    console.warn(log.formatted, message, data);
  } else {
    console.warn(log.formatted, message);
  }
}

function error(module, error, context = {}) {
  if (!LOG_CONFIG.error) return;
  
  const log = formatMessage(LOG_LEVELS.ERROR, module, error instanceof Error ? error.message : error, context);
  console.error(log.formatted, error, context);
  
  // 自动记录到 error-logger
  const errorLogger = getErrorLogger();
  if (errorLogger) {
    let category = errorLogger.ERROR_CATEGORIES.UNKNOWN;
    const moduleLower = module.toLowerCase();
    
    if (moduleLower.includes('detection')) {
      category = errorLogger.ERROR_CATEGORIES.DETECTION;
    } else if (moduleLower.includes('download') || moduleLower.includes('queue')) {
      category = errorLogger.ERROR_CATEGORIES.DOWNLOAD;
    } else if (moduleLower.includes('network') || moduleLower.includes('fetch')) {
      category = errorLogger.ERROR_CATEGORIES.NETWORK;
    } else if (moduleLower.includes('ui') || moduleLower.includes('render')) {
      category = errorLogger.ERROR_CATEGORIES.UI;
    } else if (moduleLower.includes('state')) {
      category = errorLogger.ERROR_CATEGORIES.STATE;
    }
    
    errorLogger.logError(error, {
      category,
      context: { module, ...context },
      console: false
    });
  }
}

function time(label) {
  const start = performance.now();
  return () => {
    const duration = (performance.now() - start).toFixed(2);
    info('Performance', `${label} completed in ${duration}ms`);
  };
}

function logIf(condition, logFn, ...args) {
  if (condition) {
    logFn(...args);
  }
}

function setLogConfig(config) {
  Object.assign(LOG_CONFIG, config);
}

function getLogConfig() {
  return { ...LOG_CONFIG };
}

// 导出
window.GeminiImageLogger = {
  debug,
  info,
  warn,
  error,
  time,
  logIf,
  setLogConfig,
  getLogConfig,
  LOG_LEVELS
};
```

### 使用示例

```javascript
// ❌ 错误写法（禁止）
console.log('[GID] Images detected:', images);
console.error('[GID] Failed:', error);

// ✅ 正确写法
const logger = window.GeminiImageLogger;
logger.info('Detection', 'Images detected', { count: images.length });
logger.error('Detection', error, { context: 'detectImages' });
```

### 与 error-logger 的配合

`logger.js` 是前端日志输出，`error-logger.js` 是持久化存储：

```javascript
// logger.error() 会自动触发：
// 1. console.error 输出到浏览器控制台
// 2. errorLogger.logError() 保存到 chrome.storage.local
// 3. 根据模块名自动分类（detection/download/ui...）
```

---

## 3. 错误日志系统 (error-logger.js)

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

## 4. 文件命名工具 (file-naming.js)

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

## 5. 异步下载队列 (download-queue.js)

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

## 6. Google 高清原图还原 (google-image-utils.js)

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

## 7. 代码加固规范 (断点防护)

### 核心理念
Chrome 扩展运行在复杂的宿主页面环境中，必须对 DOM 操作和对象访问进行**断点防护**，避免因页面结构变化或对象缺失导致扩展崩溃。

### 防护等级
⭐⭐⭐⭐⭐ 必须遵守

### 常见脆弱点与防护方案

#### 1. DOM 查询防护

```javascript
// ❌ 危险写法
const btn = document.querySelector('.button');
btn.addEventListener('click', handler); // btn 可能为 null

// ✅ 安全写法
const btn = document?.querySelector('.button');
if (btn) {
  btn.addEventListener('click', handler);
}
```

#### 2. 链式调用防护

```javascript
// ❌ 危险写法
const container = btn.closest('div').querySelector('img');
// 如果 closest 返回 null，querySelector 会报错

// ✅ 安全写法（使用可选链）
const container = btn?.closest('div')?.querySelector('img');
if (container) {
  // 使用 container
}
```

#### 3. 属性访问防护

```javascript
// ❌ 危险写法
const width = img.naturalWidth || img.width || 0;
// 如果 img 为 null，直接报错

// ✅ 安全写法（使用空值合并）
const width = img?.naturalWidth ?? img?.width ?? 0;
```

#### 4. 数组/对象防护

```javascript
// ❌ 危险写法
images.forEach(img => {
  // 假设 images 一定是数组
});

// ✅ 安全写法
if (Array.isArray(images)) {
  images.forEach(img => {
    if (img && img.url) {
      // 使用 img
    }
  });
}
```

#### 5. 异步操作防护

```javascript
// ❌ 危险写法
async function fetchData() {
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

// ✅ 安全写法
async function fetchData() {
  const logger = getLogger();
  try {
    if (!url || typeof url !== 'string') {
      logger.warn('Network', 'Invalid URL', { url });
      return null;
    }

    const response = await fetch(url);
    if (!response.ok) {
      logger.warn('Network', 'Fetch failed', {
        url,
        status: response.status
      });
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logger.error('Network', error, { context: 'fetchData', url });
    return null; // 降级：返回 null 而不是抛出异常
  }
}
```

### 实战示例：detection.js 加固前后对比

#### 加固前（脆弱）

```javascript
function findImagesByDOM() {
  const images = [];
  const downloadButtons = document.querySelectorAll('button');
  
  downloadButtons.forEach((btn) => {
    const container = btn.closest('div');
    const img = container.querySelector('img');
    if (img.src.includes('google')) {
      images.push({
        url: img.src,
        element: img
      });
    }
  });
  
  return images;
}
```

**问题点**：
1. `container` 可能为 `null`
2. `img` 可能为 `null`
3. `img.src` 可能不存在
4. 任何一步失败都会导致整个函数崩溃

#### 加固后（健壮）

```javascript
function findImagesByDOM() {
  const logger = getLogger();
  const images = [];

  try {
    // 1. 检查 document 可用性
    if (!document || !document.querySelectorAll) {
      logger.warn('Detection', 'Document not available');
      return images;
    }

    const downloadButtons = document.querySelectorAll('button');

    // 2. 检查查询结果
    if (!downloadButtons || downloadButtons.length === 0) {
      logger.debug('Detection', 'No buttons found');
      return images;
    }

    downloadButtons.forEach((btn) => {
      try {
        // 3. 使用可选链保护
        const container = btn?.closest('div');
        if (!container) return;

        const img = container?.querySelector('img');
        if (!img) return;

        // 4. 类型和内容检查
        const src = img?.src;
        if (!src || typeof src !== 'string') return;

        if (src.includes('google')) {
          images.push({
            url: src,
            element: img
          });
        }
      } catch (err) {
        // 5. 单个元素失败不影响整体
        logger.warn('Detection', 'Error processing button', {
          error: err.message
        });
      }
    });

    logger.debug('Detection', `Found ${images.length} images`);
    return images;

  } catch (error) {
    // 6. 顶层错误捕获
    logger.error('Detection', error, { context: 'findImagesByDOM' });
    return images; // 降级：返回空数组
  }
}
```

### 断点防护检查清单

在编写涉及 DOM 操作的代码时，请逐项检查：

- [ ] 所有 DOM 查询后都检查了返回值是否为 `null`
- [ ] 所有链式调用都使用了可选链 (`?.`)
- [ ] 所有属性访问都使用了空值合并 (`??`)
- [ ] 所有数组操作前都检查了 `Array.isArray()`
- [ ] 所有异步操作都包裹在 `try-catch` 中
- [ ] 循环中的错误不会中断整个循环（内部 try-catch）
- [ ] 所有错误都通过 `logger.error()` 记录
- [ ] 所有关键分支都有降级方案（返回默认值而非抛出异常）

### 性能考虑

断点防护会增加少量代码，但**不会**明显影响性能：
- 可选链 (`?.`) 和空值合并 (`??`) 是原生操作符，性能损耗极低
- `try-catch` 只在真正抛出异常时才有性能损失
- 类型检查（如 `typeof`、`Array.isArray`）是 JavaScript 引擎高度优化的操作

**建议**：在关键路径（如每秒触发多次的监听器）中，可以适当减少检查粒度，但在初始化和错误边界必须严格防护。

---

## 📦 建议的项目结构

```
your-extension/
├── manifest.json
├── libs/
│   └── jszip.min.js           ← 下载: https://stuk.github.io/jszip/
├── src/
│   ├── config/
│   │   └── selectors.js       ← 选择器配置（新增）⭐
│   ├── utils/
│   │   ├── logger.js          ← 统一日志
│   │   ├── error-logger.js    ← 错误存储
│   │   ├── file-naming.js     ← 文件命名
│   │   ├── download-queue.js  ← 下载队列
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

### manifest.json 加载顺序

```json
{
  "content_scripts": [{
    "js": [
      "src/config/selectors.js",       // 1. 选择器配置（最先加载）⭐
      "src/content/error-logger.js",   // 2. 错误日志基础
      "src/utils/logger.js",           // 3. 统一日志接口
      "src/content/state.js",          // 4. 状态管理
      "src/content/detection.js",      // 5. 业务逻辑
      "src/content/ui.js",             // 6. UI 渲染
      "src/content/content.js"         // 7. 主入口
    ]
  }]
}
```

**关键**：`selectors.js` 必须最先加载，`logger.js` 在其他业务模块之前加载。

---

## 📝 更新日志

| 日期 | 版本 | 说明 |
|------|------|------|
| 2024-12-28 | v1.2 | 新增选择器配置化 (selectors.js)，解耦 DOM 依赖 |
| 2024-12-28 | v1.1 | 新增统一日志规范 (logger.js)、断点防护规范 |
| 2024-12-28 | v1.0 | 初始版本，从 Gemini Image Downloader 提取 |

---

## 🚀 快速开始指南

### 步骤 1：复制核心工具

```bash
# 复制到你的项目
mkdir -p your-project/src/config
mkdir -p your-project/src/utils

cp src/config/selectors.js your-project/src/config/
cp src/utils/logger.js your-project/src/utils/
cp src/content/error-logger.js your-project/src/utils/
cp src/background/file-naming.js your-project/src/utils/
```

### 步骤 2：修改 manifest.json

```json
{
  "content_scripts": [{
    "js": [
      "src/config/selectors.js",       // 最先加载
      "src/utils/error-logger.js",
      "src/utils/logger.js",
      "src/content/your-code.js"
    ]
  }]
}
```

### 步骤 3：在代码中使用

```javascript
// 1. 获取选择器配置
function getSelectors() {
  return window.GeminiSelectors?.detection || {
    // 降级默认值
    targetButton: 'button.download',
    imageContainer: 'div.image'
  };
}

// 2. 获取 logger
const logger = window.GeminiImageLogger;

// 3. 使用配置中的选择器
function findElements() {
  const selectors = getSelectors();
  const buttons = document.querySelectorAll(selectors.targetButton);
  
  // 替换所有 console.log
  logger.info('ModuleName', 'Found elements', { count: buttons.length });
  
  // 错误处理
  try {
    // 你的代码
  } catch (error) {
    logger.error('ModuleName', error, { context: 'findElements' });
  }
}

// 4. 添加断点防护
const element = document?.querySelector(getSelectors().imageContainer);
if (element) {
  // 安全使用
}
```

---

> 💡 **提示**：
> - 使用前请根据实际项目需求调整命名空间（如 `window.GeminiImageLogger` → `window.YourProject.Logger`）
> - 生产环境建议关闭 debug 日志：`logger.setLogConfig({ debug: false })`
> - 定期查看 `error-logger` 存储，分析常见错误并加固代码

