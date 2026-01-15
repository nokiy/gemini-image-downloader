// [IN]: State module, Detection module, Selectors config / 状态模块、检测模块、选择器配置
// [OUT]: UI rendering functions, initUI() / UI 渲染函数、初始化函数
// [POS]: src/content/ui.js - UI rendering layer / UI 渲染层
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

/**
 * Gemini Image Downloader UI Module
 * 负责渲染图标、抽屉、缩略图列表
 */

// 获取 UI 选择器配置
function getUISelectors() {
  return window.GeminiSelectors?.ui || {
    userAvatar: [],
    navbar: [],
    navbarUserAvatar: [],
    header: 'header',
    headerButtons: 'header button',
    headerChildren: ':scope > div'
  };
}

// 获取扩展元素 ID 配置
function getExtensionIds() {
  return window.GeminiSelectors?.extension || {
    iconId: 'gemini-downloader-icon',
    drawerId: 'gemini-downloader-drawer',
    overlayId: 'gemini-downloader-overlay'
  };
}

// 获取日志工具
function getLogger() {
  return window.GeminiImageLogger || {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  };
}

// 使用 getter 函数获取 ID，避免模块加载顺序问题
function getIconId() {
  return getExtensionIds().iconId;
}
function getDrawerId() {
  return getExtensionIds().drawerId;
}
function getOverlayId() {
  return getExtensionIds().overlayId;
}

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
  console.log('[GID] addBatchTask called, batchTask:', !!downloadQueue.batchTask, 'isBatchRunning:', downloadQueue.isBatchRunning);
  if (downloadQueue.batchTask || downloadQueue.isBatchRunning) {
    console.log('[GID] Task already running');
    showToast('已有批量下载任务在进行中', 'warning');
    return false;
  }
  downloadQueue.batchTask = taskFn;
  console.log('[GID] Task added, calling processBatchQueue');
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
  console.log('[GID] processBatchQueue called, isBatchRunning:', downloadQueue.isBatchRunning, 'batchTask:', !!downloadQueue.batchTask);
  if (downloadQueue.isBatchRunning || !downloadQueue.batchTask) {
    console.log('[GID] processBatchQueue returning early');
    return;
  }

  downloadQueue.isBatchRunning = true;
  const stateManager = getStateManager();

  try {
    const task = downloadQueue.batchTask;
    downloadQueue.batchTask = null;

    console.log('[GID] Executing batch task...');
    if (stateManager) stateManager.setDownloadStatus('downloading');
    await task();
    console.log('[GID] Batch task completed');

  } catch (error) {
    console.error('[GID] Batch task error:', error);
    getLogger().error('UI', error, { context: 'processBatchQueue' });
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
    getLogger().error('UI', error, { context: 'processSingleQueue' });
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
  const logger = getLogger();
  const selectors = getUISelectors();
  
  // 使用配置中的用户头像选择器列表
  const avatarSelectors = selectors.userAvatar;

  for (const selector of avatarSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        logger.debug('UI', 'Found user avatar via selector', { selector });
        return el;
      }
    } catch (e) {
      // :has 可能不被支持，继续尝试下一个
      logger.debug('UI', 'Selector not supported', { selector, error: e.message });
    }
  }

  // 备用：查找 header 中最右边的按钮（使用配置中的选择器）
  const headerButtons = document.querySelectorAll(selectors.headerButtons);
  if (headerButtons.length > 0) {
    logger.debug('UI', 'Found user avatar via fallback (last header button)');
    return headerButtons[headerButtons.length - 1];
  }

  logger.debug('UI', 'User avatar not found');
  return null;
}

/**
 * 查找 Gemini 导航栏
 */
function findNavbar() {
  const logger = getLogger();
  const selectors = getUISelectors();

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
      logger.info('UI', 'Found navbar via avatar', { element: parent.tagName });
      return parent;
    }
  }

  // 使用配置中的导航栏选择器列表
  const navbarSelectors = selectors.navbar;

  for (const selector of navbarSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        logger.info('UI', 'Found navbar via selector', { selector });
        return el.parentElement || el;
      }
    } catch (e) {
      logger.debug('UI', 'Navbar selector error', { selector, error: e.message });
    }
  }

  // 备用：查找 header 下的最后一个子元素（使用配置中的选择器）
  const header = document.querySelector(selectors.header);
  if (header) {
    const children = header.querySelectorAll(selectors.headerChildren);
    if (children.length > 0) {
      logger.info('UI', 'Found navbar via header children');
      return children[children.length - 1];
    }

    // 新增：尝试查找 header 内任何包含按钮的容器
    const headerButtons = header.querySelectorAll('button');
    if (headerButtons.length > 0) {
      const lastButton = headerButtons[headerButtons.length - 1];
      const container = lastButton.parentElement;
      if (container && container !== header) {
        logger.info('UI', 'Found navbar via header button container');
        return container;
      }
    }

    // 最终回退：直接使用 header
    logger.info('UI', 'Using header as navbar fallback');
    return header;
  }

  logger.warn('UI', 'Navbar not found');
  return null;
}

/**
 * 创建导航栏图标
 */
function createIcon() {
  // 检查是否已存在
  if (document.getElementById(getIconId())) {
    return document.getElementById(getIconId());
  }

  const icon = document.createElement('div');
  icon.id = getIconId();
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

  const logger = getLogger();
  const selectors = getUISelectors();
  
  // 尝试注入到导航栏
  const navbar = findNavbar();
  if (navbar) {
    // 使用配置中的导航栏用户头像选择器列表
    let userAvatar = null;
    for (const selector of selectors.navbarUserAvatar) {
      try {
        userAvatar = navbar.querySelector(selector);
        if (userAvatar) break;
      } catch (e) {
        // 选择器可能不支持，继续
      }
    }
    
    if (userAvatar && userAvatar.parentElement) {
      userAvatar.parentElement.insertBefore(icon, userAvatar);
    } else {
      navbar.appendChild(icon);
    }
    icon.classList.add('gid-icon-navbar');
    logger.info('UI', 'Icon injected into navbar');
  } else {
    // 回退：使用 fixed 定位
    document.body.appendChild(icon);
    icon.classList.add('gid-icon-fixed');
    logger.info('UI', 'Icon using fixed position (navbar not found)');
  }

  return icon;
}

/**
 * 更新图标状态
 */
function updateIcon(state) {
  const logger = getLogger();
  const icon = document.getElementById(getIconId());
  if (!icon) {
    logger.debug('UI', 'updateIcon: icon not found');
    return;
  }

  // 始终显示图标（只要有图片时才显示，或者始终显示）
  // 根据需求：检测到图片时显示
  const shouldShow = state.ui.isIconVisible;
  icon.style.display = shouldShow ? 'flex' : 'none';
  
  logger.debug('UI', 'updateIcon', { 
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
  if (document.getElementById(getDrawerId())) {
    return document.getElementById(getDrawerId());
  }

  // 遮罩层
  const overlay = document.createElement('div');
  overlay.id = getOverlayId();
  overlay.className = 'gid-overlay';
  overlay.addEventListener('click', closeDrawer);

  // 抽屉
  const drawer = document.createElement('div');
  drawer.id = getDrawerId();
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
 * 渲染图片列表（直接加载，无懒加载）
 */
function renderImageList(state) {
  const listContainer = document.querySelector('.gid-image-list');
  const emptyState = document.querySelector('.gid-empty-state');
  if (!listContainer) return;

  const { displayImages, selectedUrls, images, isExpanded } = state;
  const stateManager = getStateManager();

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
    // 检查是否有更多图片
    const hasMore = stateManager && stateManager.hasMoreImages();
    const remainingCount = stateManager ? stateManager.getRemainingCount() : 0;

    // 生成图片列表 HTML
    // - 缩略图使用 thumbnailUrl（低分辨率，加载快）
    // - 下载使用 url（原图，高质量）
    const imagesHtml = displayImages.map((img, index) => {
      const downloadUrl = img.url.replace(/"/g, '&quot;');
      const thumbUrl = (img.thumbnailUrl || img.url).replace(/"/g, '&quot;');
      return `
        <div class="gid-image-item ${selectedUrls.has(img.url) ? 'selected' : ''}" data-url="${downloadUrl}">
          <div class="gid-image-checkbox">
            <input type="checkbox" ${selectedUrls.has(img.url) ? 'checked' : ''}>
            <span class="gid-checkbox-mark"></span>
          </div>
          <div class="gid-image-thumb">
            <img src="${thumbUrl}" alt="Image ${index + 1}" class="gid-thumb-image">
          </div>
          <div class="gid-image-info">
            <span class="gid-image-index">#${index + 1}</span>
          </div>
          <button class="gid-btn gid-btn-download" data-url="${downloadUrl}" title="下载高清原图">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 15V3M12 15L7 10M12 15L17 10M3 15V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    // "more" 按钮 HTML
    const moreButtonHtml = hasMore && !isExpanded ? `
      <div class="gid-more-button-container">
        <button class="gid-btn gid-btn-more" id="gid-load-more">
          <span>显示更多</span>
          <span class="gid-more-count">+${remainingCount} 张</span>
        </button>
      </div>
    ` : '';

    // 收起按钮 HTML
    const collapseButtonHtml = isExpanded && hasMore ? `
      <div class="gid-more-button-container">
        <button class="gid-btn gid-btn-collapse" id="gid-collapse">
          <span>收起</span>
        </button>
      </div>
    ` : '';

    listContainer.innerHTML = imagesHtml + moreButtonHtml + collapseButtonHtml;

    // 绑定事件
    listContainer.querySelectorAll('.gid-image-item').forEach((item) => {
      const url = item.dataset.url;

      // 复选框点击
      const checkbox = item.querySelector('.gid-image-checkbox');
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
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
        if (stateManager) {
          stateManager.toggleSelect(url);
        }
      });
    });

    // 绑定"显示更多"按钮事件
    const moreBtn = listContainer.querySelector('#gid-load-more');
    if (moreBtn && stateManager) {
      moreBtn.addEventListener('click', () => {
        stateManager.expandImages();
      });
    }

    // 绑定"收起"按钮事件
    const collapseBtn = listContainer.querySelector('#gid-collapse');
    if (collapseBtn && stateManager) {
      collapseBtn.addEventListener('click', () => {
        stateManager.collapseImages();
      });
    }

    // 更新头部信息
    updateHeaderInfo(state);
  } catch (error) {
    getLogger().error('UI', error, {
      context: 'renderImageList',
      imageCount: displayImages.length
    });
  }
}

/**
 * 更新头部信息
 */
function updateHeaderInfo(state) {
  const drawer = document.getElementById(getDrawerId());
  if (!drawer) return;

  const { displayImages, selectedUrls, images } = state;

  // 更新图片计数
  const countEl = drawer.querySelector('.gid-drawer-count');
  if (countEl) {
    const total = images.length;
    const displayed = displayImages.length;
    countEl.textContent = total > 10
      ? `检测到 ${total} 张，显示前 ${displayed} 张`
      : `${total} 张图片`;
  }

  // 更新全选按钮状态
  const selectAllBtn = drawer.querySelector('.gid-btn-select-all');
  if (selectAllBtn) {
    const allSelected = displayImages.length > 0 &&
      displayImages.every(img => selectedUrls.has(img.url));
    selectAllBtn.textContent = allSelected ? '取消全选' : '全选';
    selectAllBtn.classList.toggle('active', allSelected);
  }

  // 更新批量下载按钮状态
  const batchBtn = drawer.querySelector('.gid-btn-batch');
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
  const drawer = document.getElementById(getDrawerId());
  const overlay = document.getElementById(getOverlayId());

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
  const drawer = document.getElementById(getDrawerId());
  const overlay = document.getElementById(getOverlayId());

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
    // 更新状态栏：下载中
    updateStatusBar('正在下载图片...', 'downloading');
    
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
          updateStatusBar('下载失败', 'error');
        } else if (response && response.success) {
          updateStatusBar('下载完成', 'success');
        } else {
          const error = new Error(response?.error || 'Unknown download error');
          if (window.GeminiImageErrorLogger) {
            window.GeminiImageErrorLogger.logDownloadError(error, {
              url,
              type: 'single-download',
              response
            });
          }
          updateStatusBar('下载失败', 'error');
        }
        resolve();
      });
    });
  });
  
  if (added) {
    updateStatusBar('准备下载...', 'downloading');
  }
}

/**
 * 处理批量下载 (加入队列)
 */
function handleBatchDownload() {
  console.log('[GID] handleBatchDownload called');
  const stateManager = getStateManager();
  console.log('[GID] stateManager:', !!stateManager);
  if (!stateManager) {
    console.error('[GID] stateManager is null!');
    return;
  }

  const selectedImages = stateManager.getSelectedImages();
  console.log('[GID] selectedImages:', selectedImages.length, selectedImages);
  if (selectedImages.length === 0) {
    showToast('请先选择要下载的图片', 'warning');
    return;
  }

  const urls = selectedImages.map(img => img.url);
  console.log('[GID] URLs to download:', urls);
  getLogger().info('UI', 'Starting batch download', { count: urls.length, urls });
  
  const added = addBatchTask(async () => {
    return new Promise((resolve) => {
      console.log('[GID] Sending downloadBatch message to service worker');
      chrome.runtime.sendMessage({
        action: 'downloadBatch',
        urls: urls
      }, (response) => {
        console.log('[GID] Received response:', response);
        console.log('[GID] chrome.runtime.lastError:', chrome.runtime.lastError);
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
          updateStatusBar(`批量下载失败: ${chrome.runtime.lastError.message}`, 'error');
          resolve();
          return;
        }

        // 检查响应结果
        if (response && response.success !== false) {
          getLogger().info('UI', 'Batch download completed', { response });
          const successCount = response.successCount || urls.length;
          const failCount = response.failCount || 0;
          if (failCount > 0) {
            updateStatusBar(`下载完成: ${successCount} 成功, ${failCount} 失败`, 'warning');
          } else {
            updateStatusBar(`成功下载 ${successCount} 张图片`, 'success');
          }
        } else {
          const errorMsg = response?.error || '未知错误';
          if (window.GeminiImageErrorLogger) {
            window.GeminiImageErrorLogger.logDownloadError(new Error(errorMsg), {
              urls,
              count: urls.length,
              type: 'batch-download',
              response
            });
          }
          updateStatusBar(`批量下载失败: ${errorMsg}`, 'error');
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
      getLogger().debug('UI', 'Progress update', { current, total, message });
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
  
  const logger = getLogger();
  
  function tryCreateIcon() {
    const existingIcon = document.getElementById(getIconId());
    if (existingIcon) {
      logger.debug('UI', 'Icon already exists');
      return;
    }
    
    const navbar = findNavbar();
    if (navbar || retryCount >= maxRetries) {
      createIcon();
      setupStateListeners();
    } else {
      retryCount++;
      logger.debug('UI', `Navbar not found, retry ${retryCount}/${maxRetries}...`);
      setTimeout(tryCreateIcon, 500);
    }
  }
  
  tryCreateIcon();
  logger.info('UI', 'UI initialization started');
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
        updateSelectionUI(state);
      }
    });

    // 展开/收起事件 - 需要完整重新渲染
    stateManager.onStateChange('expand', (state) => {
      if (state.ui.isDrawerOpen) {
        renderImageList(state);
      }
    });

    stateManager.onStateChange('collapse', (state) => {
      if (state.ui.isDrawerOpen) {
        renderImageList(state);
      }
    });

    stateManager.onStateChange('downloadStatus', updateIcon);

    // 初始更新
    updateIcon(stateManager.getState());
  }
  getLogger().info('UI', 'State listeners ready');
}

/**
 * 只更新选中状态的 UI（避免重新渲染整个列表）
 */
function updateSelectionUI(state) {
  const { selectedUrls } = state;
  const items = document.querySelectorAll('.gid-image-item');
  
  items.forEach(item => {
    const url = item.dataset.url;
    const checkbox = item.querySelector('input[type="checkbox"]');
    const isSelected = selectedUrls.has(url);
    
    if (isSelected) {
      item.classList.add('selected');
      if (checkbox) checkbox.checked = true;
    } else {
      item.classList.remove('selected');
      if (checkbox) checkbox.checked = false;
    }
  });
  
  // 更新头部信息
  updateHeaderInfo(state);
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
