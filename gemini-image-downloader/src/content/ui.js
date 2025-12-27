// [IN]: State module, Detection module / 状态模块、检测模块
// [OUT]: UI rendering functions, initUI() / UI 渲染函数、初始化函数
// [POS]: src/content/ui.js - UI rendering layer / UI 渲染层

/**
 * Gemini Image Downloader UI Module
 * 负责渲染图标、抽屉、缩略图列表
 */

const ICON_ID = 'gemini-downloader-icon';
const DRAWER_ID = 'gemini-downloader-drawer';
const OVERLAY_ID = 'gemini-downloader-overlay';

// 任务队列：最多 2 个任务（1 个批量 + 1 个单个）
const downloadQueue = {
  batchTask: null,      // 当前批量任务
  singleTask: null,     // 当前单个任务
  isBatchRunning: false,
  isSingleRunning: false
};

// 获取状态管理器
function getStateManager() {
  return window.GeminiImageState;
}

/**
 * 添加批量下载任务
 * @returns {boolean} 是否成功添加
 */
function addBatchTask(taskFn) {
  if (downloadQueue.batchTask || downloadQueue.isBatchRunning) {
    showToast('已有批量下载任务在进行中', 'warning');
    return false;
  }
  downloadQueue.batchTask = taskFn;
  processBatchQueue();
  return true;
}

/**
 * 添加单个下载任务
 * @returns {boolean} 是否成功添加
 */
function addSingleTask(taskFn) {
  if (downloadQueue.singleTask || downloadQueue.isSingleRunning) {
    showToast('已有单个下载任务在进行中', 'warning');
    return false;
  }
  downloadQueue.singleTask = taskFn;
  processSingleQueue();
  return true;
}

/**
 * 处理批量任务队列
 */
async function processBatchQueue() {
  if (downloadQueue.isBatchRunning || !downloadQueue.batchTask) return;

  downloadQueue.isBatchRunning = true;
  const stateManager = getStateManager();
  
  try {
    const task = downloadQueue.batchTask;
    downloadQueue.batchTask = null;
    
    if (stateManager) stateManager.setDownloadStatus('downloading');
    await task();
    
  } catch (error) {
    console.error('[GID] Batch task error:', error);
  } finally {
    downloadQueue.isBatchRunning = false;
    if (stateManager && !downloadQueue.isSingleRunning) {
      stateManager.setDownloadStatus('idle');
    }
  }
}

/**
 * 处理单个任务队列
 */
async function processSingleQueue() {
  if (downloadQueue.isSingleRunning || !downloadQueue.singleTask) return;

  downloadQueue.isSingleRunning = true;
  const stateManager = getStateManager();
  
  try {
    const task = downloadQueue.singleTask;
    downloadQueue.singleTask = null;
    
    if (stateManager) stateManager.setDownloadStatus('downloading');
    await task();
    
  } catch (error) {
    console.error('[GID] Single task error:', error);
  } finally {
    downloadQueue.isSingleRunning = false;
    if (stateManager && !downloadQueue.isBatchRunning) {
      stateManager.setDownloadStatus('idle');
    }
  }
}

/**
 * 查找 Gemini 导航栏中的用户头像元素
 */
function findUserAvatar() {
  // 按优先级查找用户头像相关元素
  const avatarSelectors = [
    // 用户头像按钮
    'button[aria-label*="Google"]',
    'button[aria-label*="Account"]',
    'button[aria-label*="帐号"]',
    'button[aria-label*="账号"]',
    // 带头像图片的按钮
    'button img[alt*="Profile"]',
    'button img[alt*="头像"]',
    // 通用用户菜单
    '[data-test-id="user-menu-button"]',
    // 包含用户信息的区域
    'header button:has(img[src*="googleusercontent"])',
  ];

  for (const selector of avatarSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) return el;
    } catch (e) {
      // :has 可能不被支持
    }
  }

  // 备用：查找 header 中最右边的按钮
  const headerButtons = document.querySelectorAll('header button');
  if (headerButtons.length > 0) {
    return headerButtons[headerButtons.length - 1];
  }

  return null;
}

/**
 * 查找 Gemini 导航栏
 */
function findNavbar() {
  // 优先通过用户头像定位
  const avatar = findUserAvatar();
  if (avatar) {
    // 返回头像的父容器
    let parent = avatar.parentElement;
    // 向上找到包含多个子元素的容器
    while (parent && parent.children.length < 2) {
      parent = parent.parentElement;
    }
    if (parent) {
      console.log('[GID] Found navbar via avatar:', parent);
      return parent;
    }
  }

  // Gemini 页面导航栏的可能选择器
  const selectors = [
    // PRO 按钮附近
    '[data-test-id="upgrade-button"]',
    // 邀请按钮附近
    'button[aria-label*="Invite"]',
    'button[aria-label*="邀请"]',
    // 通用导航栏选择器
    'header nav',
    'header > div > div:last-child',
    'header [role="navigation"]',
    // Gemini 特定的导航区域
    '.header-actions',
    '.toolbar-actions',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      console.log('[GID] Found navbar via selector:', selector);
      return el.parentElement || el;
    }
  }

  // 备用：查找 header 下的最后一个子元素
  const header = document.querySelector('header');
  if (header) {
    const children = header.querySelectorAll(':scope > div');
    if (children.length > 0) {
      console.log('[GID] Found navbar via header children');
      return children[children.length - 1];
    }
    return header;
  }

  return null;
}

/**
 * 创建导航栏图标
 */
function createIcon() {
  // 检查是否已存在
  if (document.getElementById(ICON_ID)) {
    return document.getElementById(ICON_ID);
  }

  const icon = document.createElement('div');
  icon.id = ICON_ID;
  icon.className = 'gid-icon';
  icon.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 10L12 15L17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span class="gid-badge">0</span>
  `;

  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDrawer();
  });

  // 尝试注入到导航栏
  const navbar = findNavbar();
  if (navbar) {
    // 插入到导航栏，在用户头像之前
    const userAvatar = navbar.querySelector('[data-test-id="user-menu-button"], .user-avatar, [aria-label*="Account"], img[alt*="Profile"]');
    if (userAvatar) {
      userAvatar.parentElement.insertBefore(icon, userAvatar);
    } else {
      navbar.appendChild(icon);
    }
    icon.classList.add('gid-icon-navbar');
    console.log('[GID] Icon injected into navbar');
  } else {
    // 回退：使用 fixed 定位
    document.body.appendChild(icon);
    icon.classList.add('gid-icon-fixed');
    console.log('[GID] Icon using fixed position (navbar not found)');
  }

  return icon;
}

/**
 * 更新图标状态
 */
function updateIcon(state) {
  const icon = document.getElementById(ICON_ID);
  if (!icon) {
    console.log('[GID] updateIcon: icon not found');
    return;
  }

  // 始终显示图标（只要有图片时才显示，或者始终显示）
  // 根据需求：检测到图片时显示
  const shouldShow = state.ui.isIconVisible;
  icon.style.display = shouldShow ? 'flex' : 'none';
  
  console.log('[GID] updateIcon:', { 
    shouldShow, 
    imageCount: state.images.length,
    isIconVisible: state.ui.isIconVisible 
  });

  // 更新数量 Badge
  const badge = icon.querySelector('.gid-badge');
  if (badge) {
    const count = state.images.length;
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
}

/**
 * 创建抽屉组件
 */
function createDrawer() {
  // 检查是否已存在
  if (document.getElementById(DRAWER_ID)) {
    return document.getElementById(DRAWER_ID);
  }

  // 遮罩层
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'gid-overlay';
  overlay.addEventListener('click', closeDrawer);

  // 抽屉
  const drawer = document.createElement('div');
  drawer.id = DRAWER_ID;
  drawer.className = 'gid-drawer';
  drawer.innerHTML = `
    <div class="gid-drawer-header">
      <div class="gid-drawer-title">
        <span class="gid-title-text">Gemini Images</span>
        <button class="gid-btn-close" aria-label="关闭">×</button>
      </div>
      <div class="gid-drawer-actions">
        <span class="gid-drawer-count">0 张图片</span>
        <button class="gid-btn gid-btn-select-all">全选</button>
        <button class="gid-btn gid-btn-primary gid-btn-batch" disabled>
          批量下载
        </button>
      </div>
      <div class="gid-status-bar"></div>
    </div>
    <div class="gid-drawer-body">
      <div class="gid-image-list"></div>
      <div class="gid-empty-state" style="display: none;">
        <div class="gid-empty-icon">📷</div>
        <div class="gid-empty-text">未检测到图片</div>
      </div>
    </div>
  `;

  // 事件绑定
  drawer.querySelector('.gid-btn-close').addEventListener('click', closeDrawer);
  drawer.querySelector('.gid-btn-select-all').addEventListener('click', handleSelectAll);
  drawer.querySelector('.gid-btn-batch').addEventListener('click', handleBatchDownload);

  // ESC 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const stateManager = getStateManager();
      if (stateManager && stateManager.getState().ui.isDrawerOpen) {
        closeDrawer();
      }
    }
  });

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  return drawer;
}

/**
 * Intersection Observer for lazy loading images
 */
let imageObserver = null;

/**
 * 初始化图片懒加载观察器
 */
function initImageObserver() {
  if (imageObserver) {
    return imageObserver;
  }

  if (!('IntersectionObserver' in window)) {
    console.warn('[GID] IntersectionObserver not supported, fallback to eager loading');
    return null;
  }

  imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const dataSrc = img.getAttribute('data-src');
        
        if (dataSrc && !img.src) {
          // 加载图片
          img.src = dataSrc;
          img.removeAttribute('data-src');
          img.classList.add('gid-image-loading');
          
          // 加载成功
          img.addEventListener('load', () => {
            img.classList.remove('gid-image-loading');
            img.classList.add('gid-image-loaded');
            const placeholder = img.parentElement.querySelector('.gid-image-placeholder');
            if (placeholder) {
              placeholder.style.display = 'none';
            }
          }, { once: true });
          
          // 加载失败
          img.addEventListener('error', () => {
            img.classList.remove('gid-image-loading');
            img.classList.add('gid-image-error');
            const placeholder = img.parentElement.querySelector('.gid-image-placeholder');
            if (placeholder) {
              placeholder.innerHTML = '⚠️ 加载失败';
              placeholder.style.display = 'flex';
            }
            
            // 记录错误日志
            if (window.GeminiImageErrorLogger) {
              window.GeminiImageErrorLogger.logNetworkError(
                new Error(`Failed to load image: ${dataSrc}`),
                { url: dataSrc, type: 'thumbnail-load' }
              );
            }
          }, { once: true });
        }
        
        // 停止观察已加载的图片
        imageObserver.unobserve(img);
      }
    });
  }, {
    root: null,
    rootMargin: '50px', // 提前50px开始加载
    threshold: 0.01
  });

  return imageObserver;
}

/**
 * 渲染图片列表（支持懒加载）
 */
function renderImageList(state) {
  const listContainer = document.querySelector('.gid-image-list');
  const emptyState = document.querySelector('.gid-empty-state');
  if (!listContainer) return;

  const { displayImages, selectedUrls, images } = state;

  // 空状态处理
  if (displayImages.length === 0) {
    listContainer.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  } else {
    listContainer.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
  }

  try {
    // 使用懒加载：初始不设置src，使用data-src
    listContainer.innerHTML = displayImages.map((img, index) => {
      // 转义URL以防止XSS
      const safeUrl = img.url.replace(/"/g, '&quot;');
      return `
        <div class="gid-image-item ${selectedUrls.has(img.url) ? 'selected' : ''}" data-url="${safeUrl}">
          <div class="gid-image-checkbox">
            <input type="checkbox" ${selectedUrls.has(img.url) ? 'checked' : ''}>
            <span class="gid-checkbox-mark"></span>
          </div>
          <div class="gid-image-thumb">
            <div class="gid-image-placeholder">
              <div class="gid-placeholder-spinner"></div>
            </div>
            <img data-src="${safeUrl}" alt="Image ${index + 1}" class="gid-lazy-image">
          </div>
          <div class="gid-image-info">
            <span class="gid-image-index">#${index + 1}</span>
          </div>
          <button class="gid-btn gid-btn-download" data-url="${safeUrl}" title="下载">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 15V3M12 15L7 10M12 15L17 10M3 15V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    // 初始化观察器
    const observer = initImageObserver();
    
    // 绑定事件并开始观察
    listContainer.querySelectorAll('.gid-image-item').forEach((item, index) => {
      const url = item.dataset.url;
      const img = item.querySelector('.gid-lazy-image');

      // 开始观察图片（懒加载）
      if (observer && img) {
        observer.observe(img);
      } else if (img) {
        // 如果不支持IntersectionObserver，直接加载
        const dataSrc = img.getAttribute('data-src');
        if (dataSrc) {
          img.src = dataSrc;
          img.removeAttribute('data-src');
        }
      }

      // 复选框点击
      const checkbox = item.querySelector('.gid-image-checkbox');
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        const stateManager = getStateManager();
        if (stateManager) {
          stateManager.toggleSelect(url);
        }
      });

      // 单个下载
      const downloadBtn = item.querySelector('.gid-btn-download');
      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleSingleDownload(url);
      });

      // 点击整个 item 切换选中
      item.addEventListener('click', (e) => {
        if (e.target.closest('.gid-btn-download')) return;
        const stateManager = getStateManager();
        if (stateManager) {
          stateManager.toggleSelect(url);
        }
      });
    });

    // 更新头部信息
    updateHeaderInfo(state);
  } catch (error) {
    console.error('[GID] Error rendering image list:', error);
    if (window.GeminiImageErrorLogger) {
      window.GeminiImageErrorLogger.logUIError(error, {
        context: 'renderImageList',
        imageCount: displayImages.length
      });
    }
  }
}

/**
 * 更新头部信息
 */
function updateHeaderInfo(state) {
  const { displayImages, selectedUrls, images } = state;

  // 更新图片计数
  const countEl = document.querySelector('.gid-drawer-count');
  if (countEl) {
    const total = images.length;
    const displayed = displayImages.length;
    countEl.textContent = total > 10
      ? `检测到 ${total} 张，显示前 ${displayed} 张`
      : `${total} 张图片`;
  }

  // 更新全选按钮状态
  const selectAllBtn = document.querySelector('.gid-btn-select-all');
  if (selectAllBtn) {
    const allSelected = displayImages.length > 0 &&
      displayImages.every(img => selectedUrls.has(img.url));
    selectAllBtn.textContent = allSelected ? '取消全选' : '全选';
    selectAllBtn.classList.toggle('active', allSelected);
  }

  // 更新批量下载按钮状态
  const batchBtn = document.querySelector('.gid-btn-batch');
  if (batchBtn) {
    const selectedCount = selectedUrls.size;
    batchBtn.disabled = selectedCount === 0;
    batchBtn.textContent = selectedCount > 0
      ? `批量下载 (${selectedCount})`
      : '批量下载';
  }
}

/**
 * 打开抽屉
 */
function openDrawer() {
  const drawer = document.getElementById(DRAWER_ID);
  const overlay = document.getElementById(OVERLAY_ID);

  if (drawer && overlay) {
    overlay.classList.add('visible');
    drawer.classList.add('open');

    const stateManager = getStateManager();
    if (stateManager) {
      stateManager.setDrawerOpen(true);
      renderImageList(stateManager.getState());
    }
  }
}

/**
 * 关闭抽屉
 */
function closeDrawer() {
  const drawer = document.getElementById(DRAWER_ID);
  const overlay = document.getElementById(OVERLAY_ID);

  if (drawer && overlay) {
    overlay.classList.remove('visible');
    drawer.classList.remove('open');

    const stateManager = getStateManager();
    if (stateManager) {
      stateManager.setDrawerOpen(false);
    }
  }
}

/**
 * 切换抽屉状态
 */
function toggleDrawer() {
  const stateManager = getStateManager();
  if (!stateManager) return;

  const state = stateManager.getState();
  if (state.ui.isDrawerOpen) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

/**
 * 处理全选/取消全选
 */
function handleSelectAll() {
  const stateManager = getStateManager();
  if (!stateManager) return;

  const state = stateManager.getState();
  const allSelected = state.displayImages.length > 0 &&
    state.displayImages.every(img => state.selectedUrls.has(img.url));

  stateManager.selectAll(!allSelected);
}

/**
 * 处理单个下载 (加入队列)
 */
function handleSingleDownload(url) {
  const added = addSingleTask(async () => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'downloadSingle',
        url: url
      }, (response) => {
        if (chrome.runtime.lastError) {
          const error = new Error(chrome.runtime.lastError.message);
          if (window.GeminiImageErrorLogger) {
            window.GeminiImageErrorLogger.logDownloadError(error, {
              url,
              type: 'single-download',
              error: chrome.runtime.lastError.message
            });
          }
          showToast('下载失败', 'error');
        } else if (response && response.success) {
          showToast('下载完成');
        } else {
          const error = new Error(response?.error || 'Unknown download error');
          if (window.GeminiImageErrorLogger) {
            window.GeminiImageErrorLogger.logDownloadError(error, {
              url,
              type: 'single-download',
              response
            });
          }
          showToast('下载失败', 'error');
        }
        resolve();
      });
    });
  });
  
  if (added) {
    showToast('下载中...');
  }
}

/**
 * 处理批量下载 (加入队列)
 */
function handleBatchDownload() {
  const stateManager = getStateManager();
  if (!stateManager) return;

  const selectedImages = stateManager.getSelectedImages();
  if (selectedImages.length === 0) {
    showToast('请先选择要下载的图片', 'warning');
    return;
  }

  const urls = selectedImages.map(img => img.url);
  console.log('[GID] Starting batch download with', urls.length, 'URLs:', urls);
  
  const added = addBatchTask(async () => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'downloadBatch',
        urls: urls
      }, (response) => {
        if (chrome.runtime.lastError) {
          const error = new Error(chrome.runtime.lastError.message);
          if (window.GeminiImageErrorLogger) {
            window.GeminiImageErrorLogger.logDownloadError(error, {
              urls,
              count: urls.length,
              type: 'batch-download',
              error: chrome.runtime.lastError.message
            });
          }
          updateStatusBar('批量下载失败', 'error');
        } else {
          console.log('[GID] Batch download response:', response);
        }
        resolve();
      });
    });
  });

  if (added) {
    updateStatusBar(`Preparing ${selectedImages.length} images...`, 'downloading');
  }
}

/**
 * 更新状态栏
 * @param {string} message - 状态消息
 * @param {string} status - 'idle' | 'downloading' | 'packaging' | 'success' | 'error'
 */
function updateStatusBar(message, status = 'downloading') {
  const statusBar = document.querySelector('.gid-status-bar');
  if (statusBar) {
    statusBar.textContent = message;
    statusBar.className = `gid-status-bar gid-status-${status}`;
    statusBar.style.display = message ? 'block' : 'none';
    
    // 成功或失败状态 3 秒后自动隐藏
    if (status === 'success' || status === 'error') {
      setTimeout(() => {
        statusBar.style.display = 'none';
      }, 3000);
    }
  }
}

/**
 * 显示 Toast 提示
 */
function showToast(message, type = 'success') {
  // 移除已有的 toast
  const existingToast = document.querySelector('.gid-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `gid-toast gid-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // 显示动画
  setTimeout(() => toast.classList.add('visible'), 10);

  // 自动消失
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * 设置消息监听器（接收来自 background 的进度更新）
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'batchProgress') {
      const { current, total, status, message } = request;
      console.log('[GID] Progress:', message);
      updateStatusBar(message, status);
      sendResponse({ received: true });
    }
    return false;
  });
}

/**
 * 初始化 UI（带重试）
 */
function initUI() {
  createDrawer();
  setupMessageListener();
  
  // 尝试创建图标，如果失败则重试
  let retryCount = 0;
  const maxRetries = 10;
  
  function tryCreateIcon() {
    const existingIcon = document.getElementById(ICON_ID);
    if (existingIcon) {
      console.log('[GID] Icon already exists');
      return;
    }
    
    const navbar = findNavbar();
    if (navbar || retryCount >= maxRetries) {
      createIcon();
      setupStateListeners();
    } else {
      retryCount++;
      console.log(`[GID] Navbar not found, retry ${retryCount}/${maxRetries}...`);
      setTimeout(tryCreateIcon, 500);
    }
  }
  
  tryCreateIcon();
  console.log('[GID] UI initialization started');
}

/**
 * 设置状态监听器
 */
function setupStateListeners() {
  const stateManager = getStateManager();
  if (stateManager) {
    // 监听状态变化
    stateManager.onStateChange('images', (state) => {
      updateIcon(state);
      if (state.ui.isDrawerOpen) {
        renderImageList(state);
      }
    });

    stateManager.onStateChange('selection', (state) => {
      if (state.ui.isDrawerOpen) {
        renderImageList(state);
      }
    });

    stateManager.onStateChange('downloadStatus', updateIcon);

    // 初始更新
    updateIcon(stateManager.getState());
  }
  console.log('[GID] State listeners ready');
}

// 导出到全局
window.GeminiImageUI = {
  initUI,
  updateIcon,
  renderImageList,
  openDrawer,
  closeDrawer,
  toggleDrawer,
  showToast,
  updateStatusBar
};
