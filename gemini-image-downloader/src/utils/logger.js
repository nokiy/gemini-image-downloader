// [IN]: error-logger module / 错误日志模块
// [OUT]: Unified logging API / 统一日志 API
// [POS]: src/utils/logger.js - Unified logging layer / 统一日志层
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

/**
 * Unified Logger Module
 * 统一日志规范：替代原生 console.log/error，自动对接 error-logger
 */

const LOG_PREFIX = '[GID]';
const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

// 日志开关（生产环境可设为 false 禁用 debug/info）
const LOG_CONFIG = {
  debug: true,  // 开发调试信息
  info: true,   // 一般信息
  warn: true,   // 警告信息
  error: true   // 错误信息（始终开启）
};

/**
 * 获取错误日志器
 */
function getErrorLogger() {
  return window.GeminiImageErrorLogger || null;
}

/**
 * 格式化日志消息
 */
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

/**
 * DEBUG 级别日志（开发调试用）
 * @param {string} module - 模块名（如 'Detection', 'UI', 'State'）
 * @param {string} message - 日志消息
 * @param {Object} data - 附加数据
 */
function debug(module, message, data = null) {
  if (!LOG_CONFIG.debug) return;
  
  const log = formatMessage(LOG_LEVELS.DEBUG, module, message, data);
  if (data) {
    console.log(log.formatted, message, data);
  } else {
    console.log(log.formatted, message);
  }
}

/**
 * INFO 级别日志（关键流程信息）
 * @param {string} module - 模块名
 * @param {string} message - 日志消息
 * @param {Object} data - 附加数据
 */
function info(module, message, data = null) {
  if (!LOG_CONFIG.info) return;
  
  const log = formatMessage(LOG_LEVELS.INFO, module, message, data);
  if (data) {
    console.info(log.formatted, message, data);
  } else {
    console.info(log.formatted, message);
  }
}

/**
 * WARN 级别日志（警告，不影响功能但需注意）
 * @param {string} module - 模块名
 * @param {string} message - 日志消息
 * @param {Object} data - 附加数据
 */
function warn(module, message, data = null) {
  if (!LOG_CONFIG.warn) return;
  
  const log = formatMessage(LOG_LEVELS.WARN, module, message, data);
  if (data) {
    console.warn(log.formatted, message, data);
  } else {
    console.warn(log.formatted, message);
  }
}

/**
 * ERROR 级别日志（错误，自动记录到 error-logger）
 * @param {string} module - 模块名
 * @param {string|Error} error - 错误消息或错误对象
 * @param {Object} context - 错误上下文
 */
function error(module, error, context = {}) {
  if (!LOG_CONFIG.error) return;
  
  const log = formatMessage(LOG_LEVELS.ERROR, module, error instanceof Error ? error.message : error, context);
  console.error(log.formatted, error, context);
  
  // 自动记录到 error-logger
  const errorLogger = getErrorLogger();
  if (errorLogger) {
    // 根据模块名自动分类
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
      context: {
        module,
        ...context
      },
      console: false // 已在上面输出过，避免重复
    });
  }
}

/**
 * 性能计时工具
 * @param {string} label - 计时标签
 * @returns {Function} 结束计时函数
 */
function time(label) {
  const start = performance.now();
  const fullLabel = `${LOG_PREFIX}[Timer] ${label}`;
  
  return () => {
    const duration = (performance.now() - start).toFixed(2);
    info('Performance', `${label} completed in ${duration}ms`);
  };
}

/**
 * 条件日志（只在满足条件时输出）
 * @param {boolean} condition - 条件
 * @param {Function} logFn - 日志函数（debug/info/warn/error）
 * @param {...any} args - 日志参数
 */
function logIf(condition, logFn, ...args) {
  if (condition) {
    logFn(...args);
  }
}

/**
 * 设置日志级别开关
 * @param {Object} config - { debug: true/false, info: true/false, ... }
 */
function setLogConfig(config) {
  Object.assign(LOG_CONFIG, config);
}

/**
 * 获取当前日志配置
 */
function getLogConfig() {
  return { ...LOG_CONFIG };
}

// 导出到全局
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

