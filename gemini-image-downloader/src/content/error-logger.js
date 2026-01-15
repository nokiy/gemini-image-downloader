// [IN]: chrome.storage, Error objects / Chrome 存储、错误对象
// [OUT]: Error logging functions, error stats / 错误日志函数、错误统计
// [POS]: src/content/error-logger.js - Error tracking and reporting / 错误追踪与上报
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

/**
 * Error Logger Module
 * 错误日志追踪与统计模块
 */

const ERROR_STORAGE_KEY = 'gid_error_logs';
const MAX_LOG_COUNT = 100; // 最多保存100条错误日志
const ERROR_CATEGORIES = {
  DETECTION: 'detection',      // 图片检测错误
  DOWNLOAD: 'download',        // 下载错误
  NETWORK: 'network',          // 网络错误
  UI: 'ui',                    // UI渲染错误
  STATE: 'state',              // 状态管理错误
  UNKNOWN: 'unknown'           // 未知错误
};

/**
 * 错误日志项结构
 * @typedef {Object} ErrorLogEntry
 * @property {string} id - 错误ID（时间戳+随机数）
 * @property {string} category - 错误分类
 * @property {string} message - 错误消息
 * @property {string} stack - 错误堆栈
 * @property {Object} context - 错误上下文（URL、用户操作等）
 * @property {number} timestamp - 时间戳
 * @property {string} userAgent - 用户代理
 */

/**
 * 记录错误
 * @param {Error|string} error - 错误对象或错误消息
 * @param {Object} options - 选项
 * @param {string} options.category - 错误分类
 * @param {Object} options.context - 错误上下文
 * @param {boolean} options.console - 是否输出到控制台（默认true）
 */
async function logError(error, options = {}) {
  const {
    category = ERROR_CATEGORIES.UNKNOWN,
    context = {},
    console: shouldLog = true
  } = options;

  // 构建错误消息
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : new Error().stack;

  // 创建日志项
  const logEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    category,
    message,
    stack,
    context,
    timestamp: Date.now(),
    userAgent: navigator.userAgent
  };

  // 输出到控制台
  if (shouldLog) {
    console.error(`[GID Error][${category.toUpperCase()}]`, message, {
      context,
      stack
    });
  }

  // 保存到存储
  try {
    const logs = await getErrorLogs();
    logs.unshift(logEntry); // 新错误放在最前面

    // 限制日志数量
    if (logs.length > MAX_LOG_COUNT) {
      logs.splice(MAX_LOG_COUNT);
    }

    await saveErrorLogs(logs);

    // 触发错误记录事件（供UI或其他模块监听）
    window.dispatchEvent(new CustomEvent('gid:error-logged', {
      detail: logEntry
    }));
  } catch (e) {
    // 如果存储失败，至少输出到控制台
    console.error('[GID] Failed to save error log:', e);
  }

  return logEntry;
}

/**
 * 获取所有错误日志
 * @returns {Promise<ErrorLogEntry[]>}
 */
async function getErrorLogs() {
  try {
    const result = await chrome.storage.local.get(ERROR_STORAGE_KEY);
    return result[ERROR_STORAGE_KEY] || [];
  } catch (e) {
    console.error('[GID] Failed to get error logs:', e);
    return [];
  }
}

/**
 * 保存错误日志
 * @param {ErrorLogEntry[]} logs 
 */
async function saveErrorLogs(logs) {
  try {
    await chrome.storage.local.set({ [ERROR_STORAGE_KEY]: logs });
  } catch (e) {
    console.error('[GID] Failed to save error logs:', e);
    throw e;
  }
}

/**
 * 清除所有错误日志
 */
async function clearErrorLogs() {
  try {
    await chrome.storage.local.remove(ERROR_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('gid:error-logs-cleared'));
    return true;
  } catch (e) {
    console.error('[GID] Failed to clear error logs:', e);
    return false;
  }
}

/**
 * 获取错误统计
 * @returns {Promise<Object>}
 */
async function getErrorStats() {
  const logs = await getErrorLogs();
  
  const stats = {
    total: logs.length,
    byCategory: {},
    recent: logs.slice(0, 10), // 最近10条
    oldest: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
    newest: logs.length > 0 ? logs[0].timestamp : null
  };

  // 按分类统计
  logs.forEach(log => {
    stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
  });

  return stats;
}

/**
 * 按分类获取错误日志
 * @param {string} category 
 * @returns {Promise<ErrorLogEntry[]>}
 */
async function getErrorLogsByCategory(category) {
  const logs = await getErrorLogs();
  return logs.filter(log => log.category === category);
}

/**
 * 便捷方法：记录检测错误
 */
function logDetectionError(error, context = {}) {
  return logError(error, {
    category: ERROR_CATEGORIES.DETECTION,
    context
  });
}

/**
 * 便捷方法：记录下载错误
 */
function logDownloadError(error, context = {}) {
  return logError(error, {
    category: ERROR_CATEGORIES.DOWNLOAD,
    context
  });
}

/**
 * 便捷方法：记录网络错误
 */
function logNetworkError(error, context = {}) {
  return logError(error, {
    category: ERROR_CATEGORIES.NETWORK,
    context
  });
}

/**
 * 便捷方法：记录UI错误
 */
function logUIError(error, context = {}) {
  return logError(error, {
    category: ERROR_CATEGORIES.UI,
    context
  });
}

/**
 * 全局错误捕获器
 * 捕获未处理的Promise拒绝和全局错误
 */
function setupGlobalErrorHandlers() {
  // 捕获未处理的Promise拒绝
  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason || 'Unhandled Promise Rejection', {
      category: ERROR_CATEGORIES.UNKNOWN,
      context: {
        type: 'unhandledrejection',
        promise: event.promise?.toString()
      }
    });
  });

  // 捕获全局错误
  window.addEventListener('error', (event) => {
    // 只捕获我们扩展相关的错误
    if (event.message && (
      event.message.includes('[GID]') ||
      event.filename?.includes('content.js') ||
      event.filename?.includes('ui.js') ||
      event.filename?.includes('detection.js') ||
      event.filename?.includes('state.js')
    )) {
      logError(event.error || new Error(event.message), {
        category: ERROR_CATEGORIES.UNKNOWN,
        context: {
          type: 'global-error',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      });
    }
  });

  console.log('[GID] Global error handlers initialized');
}

// 初始化全局错误捕获
if (typeof window !== 'undefined') {
  setupGlobalErrorHandlers();
}

// 导出到全局
window.GeminiImageErrorLogger = {
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

