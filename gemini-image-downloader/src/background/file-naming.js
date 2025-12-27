// [IN]: chrome.downloads API / chrome.downloads API
// [OUT]: generateFilename(), resolveConflict() / 文件名生成函数、冲突处理函数
// [POS]: src/background/file-naming.js - File naming layer / 文件命名层

/**
 * Gemini Image File Naming Module
 * 负责生成文件名和处理命名冲突
 */

const BASE_DIR = 'Gemini_Images';

/**
 * 生成文件名
 * @param {number} count - 图片数量
 * @param {boolean} isZip - 是否为 ZIP 文件
 * @param {string} ext - 文件扩展名（单个下载时使用）
 * @returns {string} 完整文件路径
 */
function generateFilename(count, isZip, ext = 'png') {
  if (isZip) {
    // ZIP 文件命名：Gemini_Image_{数量}.zip
    return `${BASE_DIR}/Gemini_Image_${count}.zip`;
  } else {
    // 单个文件命名：Gemini_Image.{ext}
    return `${BASE_DIR}/Gemini_Image.${ext}`;
  }
}

/**
 * 解决文件名冲突（通过下载历史检查）
 * 注意：Chrome 的 conflictAction: 'uniquify' 会自动处理冲突
 * 此函数用于自定义命名规则
 * 
 * @param {string} baseName - 基础文件名（不含扩展名）
 * @param {string} ext - 扩展名
 * @returns {Promise<string>} 解决冲突后的文件名
 */
async function resolveConflict(baseName, ext) {
  let filename = `${BASE_DIR}/${baseName}.${ext}`;
  let counter = 0;

  // 检查下载历史中是否存在同名文件
  const exists = await checkFileInHistory(baseName, ext);

  if (!exists) {
    return filename;
  }

  // 添加数字后缀
  while (counter < 1000) {
    counter++;
    const newBaseName = `${baseName}_${counter}`;
    filename = `${BASE_DIR}/${newBaseName}.${ext}`;

    const stillExists = await checkFileInHistory(newBaseName, ext);
    if (!stillExists) {
      return filename;
    }
  }

  // 防止无限循环，使用时间戳
  const timestamp = Date.now();
  return `${BASE_DIR}/${baseName}_${timestamp}.${ext}`;
}

/**
 * 检查文件是否存在于下载历史中
 * @param {string} baseName - 基础文件名
 * @param {string} ext - 扩展名
 * @returns {Promise<boolean>}
 */
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

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 清理文件名中的非法字符
 * @param {string} name - 原始文件名
 * @returns {string} 清理后的文件名
 */
function sanitizeFilename(name) {
  // 移除 Windows 和 Unix 文件系统的非法字符
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 100); // 限制长度
}

/**
 * 截断文件名到指定长度
 * @param {string} name - 原始文件名
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的文件名
 */
function truncateFilename(name, maxLength = 50) {
  if (name.length <= maxLength) {
    return name;
  }
  return name.substring(0, maxLength - 3) + '...';
}

// 导出到全局（Service Worker）
self.GeminiFileNaming = {
  generateFilename,
  resolveConflict,
  sanitizeFilename,
  truncateFilename,
  BASE_DIR
};

