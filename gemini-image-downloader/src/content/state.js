// [IN]: Detection module / 检测模块
// [OUT]: State management functions, event emitter / 状态管理函数、事件发射器
// [POS]: src/content/state.js - State management layer / 状态管理层
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

/**
 * Gemini Image State Manager
 * 管理图片列表、选择状态、下载队列和 UI 状态
 */

const INITIAL_DISPLAY_COUNT = 10; // 初始显示数量

const state = {
  // 检测到的图片列表
  images: [],           // DetectedImage[]

  // 显示的图片（初始最多 10 张，展开后显示全部）
  displayImages: [],    // DetectedImage[]

  // 是否已展开显示更多
  isExpanded: false,

  // 选中的图片 URL 集合
  selectedUrls: new Set(),

  // 下载队列状态
  downloadQueue: {
    tasks: [],          // 待下载任务
    currentTask: null,  // 当前正在下载的任务
    isProcessing: false // 是否正在处理
  },

  // 去水印开关
  removeWatermark: true,

  // UI 状态
  ui: {
    isDrawerOpen: false,
    isIconVisible: false,
    downloadStatus: 'idle' // 'idle' | 'downloading' | 'completed' | 'error'
  }
};

// 状态变化监听器
const listeners = new Map();

/**
 * 更新图片列表
 * @param {Array} newImages - 新检测到的图片列表
 */
function updateImages(newImages) {
  state.images = newImages;
  
  // 根据展开状态决定显示数量
  if (state.isExpanded) {
    state.displayImages = newImages;
  } else {
    state.displayImages = newImages.slice(0, INITIAL_DISPLAY_COUNT);
  }
  
  // 清理无效的选中状态
  const validUrls = new Set(newImages.map(img => img.url));
  state.selectedUrls = new Set(
    [...state.selectedUrls].filter(url => validUrls.has(url))
  );
  
  // 更新图标显示状态
  state.ui.isIconVisible = newImages.length > 0;
  
  // 触发 UI 更新
  emitStateChange('images');
}

/**
 * 展开显示更多图片
 */
function expandImages() {
  if (state.isExpanded) return;
  
  state.isExpanded = true;
  state.displayImages = state.images;
  emitStateChange('expand');
}

/**
 * 收起图片列表
 */
function collapseImages() {
  if (!state.isExpanded) return;
  
  state.isExpanded = false;
  state.displayImages = state.images.slice(0, INITIAL_DISPLAY_COUNT);
  emitStateChange('collapse');
}

/**
 * 检查是否有更多图片
 * @returns {boolean}
 */
function hasMoreImages() {
  return state.images.length > INITIAL_DISPLAY_COUNT;
}

/**
 * 获取剩余图片数量
 * @returns {number}
 */
function getRemainingCount() {
  return Math.max(0, state.images.length - INITIAL_DISPLAY_COUNT);
}

/**
 * 切换单个图片的选中状态
 * @param {string} url - 图片 URL
 */
function toggleSelect(url) {
  if (state.selectedUrls.has(url)) {
    state.selectedUrls.delete(url);
  } else {
    state.selectedUrls.add(url);
  }
  emitStateChange('selection');
}

/**
 * 全选/取消全选
 * @param {boolean} select - true 为全选，false 为取消全选
 */
function selectAll(select = true) {
  if (select) {
    state.displayImages.forEach(img => {
      state.selectedUrls.add(img.url);
    });
  } else {
    state.selectedUrls.clear();
  }
  emitStateChange('selection');
}

/**
 * 获取选中的图片
 * @returns {Array} 选中的图片列表
 */
function getSelectedImages() {
  return state.displayImages.filter(img => 
    state.selectedUrls.has(img.url)
  );
}

/**
 * 更新下载状态
 * @param {string} status - 'idle' | 'downloading' | 'completed' | 'error'
 */
function setDownloadStatus(status) {
  state.ui.downloadStatus = status;
  emitStateChange('downloadStatus');
}

/**
 * 更新抽屉状态
 * @param {boolean} isOpen - 是否打开
 */
function setDrawerOpen(isOpen) {
  state.ui.isDrawerOpen = isOpen;
  emitStateChange('drawer');
}

/**
 * 设置去水印开关
 * @param {boolean} enabled - 是否启用
 */
function setRemoveWatermark(enabled) {
  state.removeWatermark = enabled;
  emitStateChange('removeWatermark');
}

/**
 * 获取去水印开关状态
 * @returns {boolean}
 */
function getRemoveWatermark() {
  return state.removeWatermark;
}

/**
 * 清空所有状态（切换对话时调用）
 */
function clearState() {
  state.images = [];
  state.displayImages = [];
  state.isExpanded = false;
  state.selectedUrls.clear();
  state.ui.isIconVisible = false;
  state.ui.isDrawerOpen = false;
  state.ui.downloadStatus = 'idle';
  emitStateChange('images');
  emitStateChange('clear');
}

/**
 * 监听状态变化
 * @param {string} key - 状态键
 * @param {Function} callback - 回调函数
 */
function onStateChange(key, callback) {
  if (!listeners.has(key)) {
    listeners.set(key, []);
  }
  listeners.get(key).push(callback);
}

/**
 * 移除状态监听
 * @param {string} key - 状态键
 * @param {Function} callback - 回调函数
 */
function offStateChange(key, callback) {
  if (listeners.has(key)) {
    const callbacks = listeners.get(key);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }
}

/**
 * 触发状态变化事件
 * @param {string} key - 状态键
 */
function emitStateChange(key) {
  const callbacks = listeners.get(key) || [];
  callbacks.forEach(cb => cb(state));
  
  // 同时触发通用监听器
  const allCallbacks = listeners.get('*') || [];
  allCallbacks.forEach(cb => cb(state, key));
}

/**
 * 获取当前状态
 * @returns {Object} 当前状态
 */
function getState() {
  return state;
}

// 导出到全局
window.GeminiImageState = {
  getState,
  updateImages,
  toggleSelect,
  selectAll,
  getSelectedImages,
  setDownloadStatus,
  setDrawerOpen,
  setRemoveWatermark,
  getRemoveWatermark,
  clearState,
  onStateChange,
  offStateChange,
  expandImages,
  collapseImages,
  hasMoreImages,
  getRemainingCount
};
