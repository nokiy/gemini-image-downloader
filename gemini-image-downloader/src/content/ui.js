// [IN]: State module, Detection module, Selectors config, ErrorLogger, Preview module, WatermarkRemover / 状态模块、检测模块、选择器配置、错误日志、预览模块、去水印模块
// [OUT]: UI rendering functions, initUI(), error panel functions, preview button, watermark toggle / UI 渲染函数、初始化函数、错误面板函数、预览按钮、去水印开关
// [POS]: src/content/ui.js - UI rendering layer with error log visualization, preview and watermark removal / UI 渲染层（含错误日志可视化、预览和去水印功能）
// [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

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

function getViewportWidth() {
  return Math.max(document.documentElement?.clientWidth || 0, window.innerWidth || 0);
}

function isElementVisible(el) {
  if (!el || !el.getBoundingClientRect) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isElementInFixedLayer(el) {
  let current = el;
  let depth = 0;
  while (current && current !== document.documentElement && depth < 6) {
    const style = window.getComputedStyle(current);
    if (style.position === 'fixed' || style.position === 'sticky') {
      return true;
    }
    current = current.parentElement;
    depth += 1;
  }
  return false;
}

function getPrimaryHeader() {
  const selectors = getUISelectors();
  const selectorList = [
    selectors.header,
    'header',
    '[role="banner"]',
    '[data-test-id*="header"]',
    '[data-test-id*="topbar"]',
    '[data-test-id*="app-bar"]',
    '[data-test-id*="toolbar"]'
  ].filter(Boolean);
  const headerSelector = Array.from(new Set(selectorList)).join(',');
  const headers = Array.from(document.querySelectorAll(headerSelector));
  if (headers.length === 0) return null;

  const viewportWidth = getViewportWidth();
  let best = null;
  let bestScore = Infinity;

  for (const header of headers) {
    if (!header.isConnected) continue;
    const rect = header.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const topPenalty = Math.max(0, rect.top);
    const widthPenalty = viewportWidth > 0 ? Math.max(0, viewportWidth - rect.width) : 0;
    const score = topPenalty * 2 + widthPenalty;

    if (score < bestScore) {
      best = header;
      bestScore = score;
    }
  }

  return best;
}

function pickTopRightElement(elements) {
  const viewportWidth = getViewportWidth();
  let best = null;
  let bestScore = Infinity;

  for (const el of elements) {
    if (!isElementVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    const topPenalty = Math.max(0, rect.top);
    const rightPenalty = viewportWidth > 0 ? Math.max(0, viewportWidth - rect.right) : 0;
    const score = topPenalty * 2 + rightPenalty;

    if (score < bestScore) {
      best = el;
      bestScore = score;
    }
  }

  return best;
}

function pickRightmostElement(elements) {
  let best = null;
  let bestRight = -Infinity;
  let bestTop = Infinity;

  for (const el of elements) {
    if (!isElementVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.right > bestRight || (rect.right === bestRight && rect.top < bestTop)) {
      best = el;
      bestRight = rect.right;
      bestTop = rect.top;
    }
  }

  return best;
}

function pickActionAnchorFromCandidates(candidates) {
  if (!candidates || candidates.length === 0) return null;

  const rightmost = pickRightmostElement(candidates);
  if (!rightmost) return pickTopRightElement(candidates);

  const rightRect = rightmost.getBoundingClientRect();
  const viewportWidth = getViewportWidth();
  const minRight = viewportWidth > 0 ? viewportWidth * 0.72 : 0;

  const rowCandidates = candidates.filter((el) => {
    if (!isElementVisible(el)) return false;
    const rect = el.getBoundingClientRect();
    return Math.abs(rect.top - rightRect.top) <= 8;
  });

  const rightSideRow = rowCandidates.filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.right >= minRight;
  });

  const scoped = rightSideRow.length > 0 ? rightSideRow : rowCandidates;
  return pickLeftmostElement(scoped) || rightmost;
}

function pickLeftmostElement(elements) {
  let best = null;
  let bestLeft = Infinity;

  for (const el of elements) {
    if (!isElementVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.left < bestLeft) {
      best = el;
      bestLeft = rect.left;
    }
  }

  return best;
}

function getTopRightActionCandidates() {
  const ids = getExtensionIds();
  const excludedSelector = `#${ids.drawerId}, #${ids.overlayId}, #${ids.iconId}`;
  const viewportWidth = getViewportWidth();
  const topLimit = 160;
  const minRight = viewportWidth > 0 ? viewportWidth * 0.72 : 0;

  return Array.from(document.querySelectorAll('button, [role="button"], a'))
    .filter((el) => {
      if (!isElementVisible(el)) return false;
      if (excludedSelector && el.closest(excludedSelector)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      if (rect.top < -10 || rect.top > topLimit) return false;
      if (viewportWidth > 0 && rect.right < minRight) return false;
      return true;
    });
}

function getHeaderActionCandidates() {
  const ids = getExtensionIds();
  const excludedSelector = `#${ids.drawerId}, #${ids.overlayId}, #${ids.iconId}`;
  const viewportWidth = getViewportWidth();
  const topLimit = 160;
  const minRight = viewportWidth > 0 ? viewportWidth * 0.72 : 0;

  const headers = new Set([
    ...Array.from(document.querySelectorAll('header, [role="banner"]')),
    getPrimaryHeader()
  ].filter(Boolean));

  const candidates = [];
  const headerMap = new Map();

  headers.forEach((header) => {
    if (!isElementVisible(header)) return;
    const headerCandidates = Array.from(header.querySelectorAll('button, [role="button"], a'))
      .filter((el) => {
        if (!isElementVisible(el)) return false;
        if (excludedSelector && el.closest(excludedSelector)) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        if (rect.top < -10 || rect.top > topLimit) return false;
        if (viewportWidth > 0 && rect.right < minRight) return false;
        return true;
      });

    if (headerCandidates.length > 0) {
      headerMap.set(header, headerCandidates);
      candidates.push(...headerCandidates);
    }
  });

  return { candidates, headerMap };
}

function findHeaderActionContainer() {
  const anchor = findHeaderActionAnchor();
  return anchor?.parentElement || null;
}

function findHeaderActionAnchor() {
  const avatar = findUserAvatar();
  const headerCandidates = getHeaderActionCandidates();
  if (headerCandidates.candidates.length > 0) {
    let scoped = headerCandidates.candidates;
    if (avatar) {
      const avatarHeader = avatar.closest?.('header, [role="banner"]');
      if (avatarHeader && headerCandidates.headerMap.has(avatarHeader)) {
        scoped = headerCandidates.headerMap.get(avatarHeader);
      }
    } else if (headerCandidates.headerMap.size > 0) {
      let bestHeader = null;
      let bestCount = -1;
      for (const [header, items] of headerCandidates.headerMap.entries()) {
        if (!isElementVisible(header)) continue;
        if (items.length > bestCount) {
          bestHeader = header;
          bestCount = items.length;
        }
      }
      if (bestHeader && headerCandidates.headerMap.has(bestHeader)) {
        scoped = headerCandidates.headerMap.get(bestHeader);
      }
    }

    const anchor = pickActionAnchorFromCandidates(scoped);
    if (anchor) return anchor;
  }

  const fixedCandidates = getTopRightActionCandidates().filter(isElementInFixedLayer);
  if (fixedCandidates.length > 0) {
    const anchor = pickActionAnchorFromCandidates(fixedCandidates);
    if (anchor) return anchor;
  }

  return null;
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

const DOWNLOAD_PING_TIMEOUT_MS = 1500;  // 增加到 1.5 秒，给 Service Worker 更多唤醒时间
const DOWNLOAD_MESSAGE_TIMEOUT_MS = 60000;  // 增加到 60 秒，支持大批量下载
const DOWNLOAD_SINGLE_MESSAGE_TIMEOUT_MS = 20000;
const FALLBACK_DOWNLOAD_PREFIX = 'Gemini_Image';
const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg'
};

function createRuntimeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getImageElementForUrl(url) {
  const stateManager = getStateManager();
  const images = stateManager?.getState?.().images;
  if (!Array.isArray(images)) return null;
  const match = images.find(img => img?.url === url);
  return match?.element || null;
}

function getImageElementMap() {
  const stateManager = getStateManager();
  const images = stateManager?.getState?.().images || [];
  const map = new Map();
  images.forEach((img) => {
    if (img?.url) {
      map.set(img.url, img.element || null);
    }
  });
  return map;
}

function sendRuntimeMessageWithTimeout(message, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(createRuntimeError('timeout', 'runtime message timeout'));
    }, timeoutMs);

    chrome.runtime.sendMessage(message, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);

      if (chrome.runtime.lastError) {
        const errMsg = chrome.runtime.lastError.message || 'runtime sendMessage failed';
        reject(createRuntimeError('send_failed', errMsg));
        return;
      }

      if (!response) {
        reject(createRuntimeError('no_response', 'runtime message no response'));
        return;
      }

      resolve(response);
    });
  });
}

async function ensureDownloadServiceReady() {
  // 尝试多次 ping，给 Service Worker 更多唤醒机会
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await sendRuntimeMessageWithTimeout({ action: 'downloadPing' }, DOWNLOAD_PING_TIMEOUT_MS);
      if (response?.ok) {
        return true;
      }
    } catch (error) {
      getLogger().warn('UI', `Download service ping attempt ${attempt}/${maxAttempts} failed`, { error: error?.message });
      if (attempt < maxAttempts) {
        // 等待一小段时间后重试
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  return false;
}

function getExtensionFromContentType(contentType) {
  if (!contentType) return null;
  const type = contentType.split(';')[0].trim().toLowerCase();
  return MIME_EXTENSION_MAP[type] || null;
}

function getExtensionFromUrl(url) {
  if (!url) return null;
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : null;
  } catch (error) {
    return null;
  }
}

async function downloadImageViaFetch(url, baseName, index) {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-cache'
  });
  if (!response.ok) {
    throw new Error(`Status ${response.status}`);
  }
  const blob = await response.blob();
  const ext = getExtensionFromContentType(blob.type) || getExtensionFromUrl(url) || 'png';
  const suffix = typeof index === 'number' ? `_${String(index + 1).padStart(2, '0')}` : '';
  const filename = `${baseName}${suffix}.${ext}`;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function downloadBatchFallback(urls) {
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < urls.length; i++) {
    updateStatusBar(`正在下载 ${i + 1}/${urls.length}...`, 'downloading');
    try {
      await downloadImageViaFetch(urls[i], FALLBACK_DOWNLOAD_PREFIX, i);
      successCount++;
    } catch (error) {
      failCount++;
      getLogger().warn('UI', 'Fallback download failed', { error: error?.message, url: urls[i] });
    }
  }

  return { successCount, failCount };
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
  const viewportWidth = getViewportWidth();
  const topLimit = 120;
  
  // 使用配置中的用户头像选择器列表
  const avatarSelectors = selectors.userAvatar;
  const candidates = [];

  for (const selector of avatarSelectors) {
    try {
      const matches = Array.from(document.querySelectorAll(selector));
      matches.forEach((el) => {
        if (!isElementVisible(el)) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        if (rect.top < -10 || rect.top > topLimit) return;
        if (viewportWidth > 0 && rect.right < viewportWidth * 0.7) return;
        candidates.push(el);
      });
    } catch (e) {
      // :has 可能不被支持，继续尝试下一个
      logger.debug('UI', 'Selector not supported', { selector, error: e.message });
    }
  }

  const picked = pickTopRightElement(candidates);
  if (picked) {
    logger.debug('UI', 'Found user avatar via selector', { selector: 'top-right candidates' });
    return picked;
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
  const header = getPrimaryHeader();

  // 优先通过用户头像定位
  const avatar = findUserAvatar();
  if (avatar) {
    const avatarButton = avatar.closest?.('button') || avatar;
    let container = avatarButton.closest('[role="toolbar"], [role="navigation"], nav, header')
      || avatarButton.parentElement
      || avatar.parentElement;
    if (container && container.tagName === 'BUTTON' && container.parentElement) {
      container = container.parentElement;
    }
    if (container) {
      logger.info('UI', 'Found navbar via avatar', { element: container.tagName });
      return container;
    }
  }

  // 使用配置中的导航栏选择器列表
  const navbarSelectors = selectors.navbar;
  const candidates = [];

  for (const selector of navbarSelectors) {
    try {
      const matches = Array.from(document.querySelectorAll(selector));
      for (const match of matches) {
        let candidate = match;
        if (match.closest) {
          const closest = match.closest('[role="toolbar"], [role="navigation"], nav, header');
          if (closest) {
            candidate = closest;
          }
        }
        if (header && !header.contains(candidate)) {
          continue;
        }
        candidates.push(candidate);
      }
    } catch (e) {
      logger.debug('UI', 'Navbar selector error', { selector, error: e.message });
    }
  }

  const picked = pickTopRightElement(candidates);
  if (picked) {
    logger.info('UI', 'Found navbar via selector', { element: picked.tagName });
    return picked;
  }

  // 备用：查找 header 下的最后一个子元素（使用配置中的选择器）
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

  // 使用 debug 级别，避免在 Chrome 扩展错误面板中显示
  logger.debug('UI', 'Navbar not found, will use fixed position fallback');
  return null;
}

function placeIconInNavbar(icon) {
  // Deprecated: Gemini header DOM is frequently re-rendered (SPA navigation),
  // so DOM-inserting the icon into the navbar is unstable. Keep the icon as a
  // fixed overlay anchored to the top-right action group instead.
  void icon;
  return false;
}

function placeIconFixed(icon) {
  if (icon?.parentElement !== document.body) {
    document.body.appendChild(icon);
  }
  icon.classList.add('gid-icon-fixed');
  icon.classList.remove('gid-icon-navbar');
}

function updateFixedIconPosition(icon) {
  if (!icon) return false;

  const anchor = findHeaderActionAnchor();
  if (!anchor) {
    // Reset to CSS defaults (top-right) when the header action anchor is missing.
    icon.style.left = '';
    icon.style.top = '';
    icon.style.right = '';
    icon.style.bottom = '';
    return false;
  }

  const rect = anchor.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const ICON_SIZE = 40;
  const GAP = 12;
  const top = Math.round(rect.top + (rect.height - ICON_SIZE) / 2);
  const left = Math.round(rect.left - ICON_SIZE - GAP);

  icon.style.left = `${Math.max(8, left)}px`;
  icon.style.top = `${Math.max(8, top)}px`;
  icon.style.right = 'auto';
  icon.style.bottom = 'auto';
  return true;
}

function ensureIconPlacement() {
  const icon = document.getElementById(getIconId());
  if (!icon) return false;
  placeIconFixed(icon);
  return updateFixedIconPosition(icon);
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
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4C9.11 4 6.6 5.64 5.35 8.04C2.34 8.36 0 10.91 0 14C0 17.31 2.69 20 6 20H19C21.76 20 24 17.76 24 15C24 12.36 21.95 10.22 19.35 10.04ZM17 13L12 18L7 13H10V10H14V13H17Z"/>
    </svg>
    <span class="gid-badge">0</span>
  `;

  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDrawer();
  });
  placeIconFixed(icon);
  updateFixedIconPosition(icon);

  return icon;
}

/**
 * 更新图标状态
 */
function updateIcon(state) {
  const logger = getLogger();
  const icon = document.getElementById(getIconId()) || createIcon();
  if (!icon) return;

  // 始终显示图标（只要有图片时才显示，或者始终显示）
  // 根据需求：检测到图片时显示
  const shouldShow = state.ui.isIconVisible;
  icon.style.display = shouldShow ? 'flex' : 'none';
  if (shouldShow) {
    updateFixedIconPosition(icon);
  }
  
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
        <div class="gid-title-actions">
          <button class="gid-btn gid-btn-preview" title="预览图片">
            <span>预览</span>
          </button>
          <button class="gid-btn gid-btn-errors no-errors" title="查看错误日志">
            <span>日志</span>
            <span class="gid-error-badge" style="display:none">0</span>
          </button>
          <button class="gid-btn-close" aria-label="关闭">×</button>
        </div>
      </div>
      <div class="gid-drawer-actions">
        <span class="gid-drawer-count">0 张图片</span>
        <label class="gid-watermark-toggle" title="下载时去除 Gemini 水印">
          <input type="checkbox" class="gid-remove-watermark-checkbox">
          <span>去水印</span>
        </label>
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
    <div class="gid-error-panel">
      <div class="gid-error-header">
        <div class="gid-error-title">
          <span>⚠️ 错误日志</span>
          <span class="gid-error-count">0</span>
        </div>
        <div class="gid-error-actions">
          <button class="gid-btn-clear-errors">清空</button>
          <button class="gid-btn-back">返回</button>
        </div>
      </div>
      <div class="gid-error-list"></div>
    </div>
  `;

  // 事件绑定
  drawer.querySelector('.gid-btn-close').addEventListener('click', closeDrawer);
  drawer.querySelector('.gid-btn-select-all').addEventListener('click', handleSelectAll);
  drawer.querySelector('.gid-btn-batch').addEventListener('click', handleBatchDownload);
  drawer.querySelector('.gid-btn-preview').addEventListener('click', handleOpenPreview);
  drawer.querySelector('.gid-btn-errors').addEventListener('click', showErrorPanel);
  drawer.querySelector('.gid-btn-back').addEventListener('click', hideErrorPanel);
  drawer.querySelector('.gid-btn-clear-errors').addEventListener('click', clearErrorLogs);

  // 去水印复选框事件
  const watermarkCheckbox = drawer.querySelector('.gid-remove-watermark-checkbox');
  if (watermarkCheckbox) {
    const stateManager = getStateManager();
    const defaultChecked = typeof stateManager?.getRemoveWatermark === 'function'
      ? stateManager.getRemoveWatermark()
      : true;
    watermarkCheckbox.checked = defaultChecked;
    if (window.GeminiImagePreview?.setRemoveWatermark) {
      window.GeminiImagePreview.setRemoveWatermark(defaultChecked);
    }
  }
  if (watermarkCheckbox) {
    watermarkCheckbox.addEventListener('change', (e) => {
      const stateManager = getStateManager();
      if (stateManager) {
        stateManager.setRemoveWatermark(e.target.checked);
        // 同步到预览面板
        if (window.GeminiImagePreview) {
          window.GeminiImagePreview.setRemoveWatermark(e.target.checked);
        }
      }
    });
  }

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

  // 初始化错误日志按钮状态
  updateErrorButton();

  // 监听错误日志事件
  window.addEventListener('gid:error-logged', updateErrorButton);

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
          <button class="gid-btn gid-btn-preview-item" data-index="${index}" title="预览大图">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M2 12C3.5 8 7 6 12 6C17 6 20.5 8 22 12C20.5 16 17 18 12 18C7 18 3.5 16 2 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
            </svg>
          </button>
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

      // 预览大图
      const previewBtn = item.querySelector('.gid-btn-preview-item');
      if (previewBtn) {
        previewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const index = Number(previewBtn.dataset.index) || 0;
          handleOpenPreviewAtIndex(displayImages, index, previewBtn);
        });
      }

      // 点击整个 item 切换选中
      item.addEventListener('click', (e) => {
        if (e.target.closest('.gid-btn-download')) return;
        if (e.target.closest('.gid-btn-preview-item')) return;
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
 * 打开预览面板
 */
function handleOpenPreview() {
  const stateManager = getStateManager();
  if (!stateManager) return;

  const state = stateManager.getState();
  if (state.displayImages.length === 0) {
    showToast('没有可预览的图片', 'warning');
    return;
  }

  // 关闭抽屉
  closeDrawer();

  // 打开预览面板
  if (window.GeminiImagePreview) {
    showToast('正在打开预览...', 'warning');
    window.GeminiImagePreview.open(state.displayImages, 0);
    closeDrawer();
  } else {
    showToast('预览模块未加载', 'error');
  }
}

function handleOpenPreviewAtIndex(images, index, sourceButton) {
  if (!images || images.length === 0) {
    showToast('没有可预览的图片', 'warning');
    return;
  }

  if (window.GeminiImagePreview) {
    showToast('正在打开预览...', 'warning');
    if (sourceButton) {
      sourceButton.classList.add('is-opening');
    }
    window.GeminiImagePreview.open(images, index);
    closeDrawer();
    if (sourceButton) {
      setTimeout(() => {
        sourceButton.classList.remove('is-opening');
      }, 800);
    }
  } else {
    showToast('预览模块未加载', 'error');
    if (sourceButton) {
      sourceButton.classList.remove('is-opening');
    }
  }
}

/**
 * 处理单个下载 (加入队列) - 支持去水印
 */
function handleSingleDownload(url) {
  const stateManager = getStateManager();
  const shouldRemoveWatermark = stateManager?.getRemoveWatermark() || false;

  const added = addSingleTask(async () => {
    // 检查是否需要去水印
    if (shouldRemoveWatermark && window.GeminiWatermarkRemover) {
      updateStatusBar('正在去水印下载...', 'downloading');
      showToast('正在去水印下载...', 'warning');
      try {
        const sourceElement = getImageElementForUrl(url);
        const result = await window.GeminiWatermarkRemover.removeWatermark(url, {
          element: sourceElement
        });
        if (result.success) {
          // 触发下载
          const objectUrl = URL.createObjectURL(result.blob);
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = `${FALLBACK_DOWNLOAD_PREFIX}_nowm.png`;
          link.rel = 'noopener';
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
          updateStatusBar('去水印下载完成', 'success');
          showToast('去水印下载完成');
        } else {
          throw new Error(result.error || '去水印失败');
        }
      } catch (error) {
        if (window.GeminiImageErrorLogger) {
          window.GeminiImageErrorLogger.logDownloadError(error, {
            url,
            type: 'single-download-watermark-removal',
            error: error.message
          });
          updateErrorButton();
        }
        updateStatusBar('去水印下载失败: ' + error.message, 'error');
        showToast('去水印下载失败: ' + error.message, 'error');
      }
      return;
    }

    // 普通下载（无去水印）
    updateStatusBar('正在下载图片...', 'downloading');
    showToast('正在下载图片...', 'warning');

    try {
      const response = await sendRuntimeMessageWithTimeout({
        action: 'downloadSingle',
        url: url
      }, DOWNLOAD_SINGLE_MESSAGE_TIMEOUT_MS);

      if (response && response.success) {
        updateStatusBar('下载完成', 'success');
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
        throw error;
      }
    } catch (error) {
      try {
        updateStatusBar('后台下载失败，改为直接下载...', 'downloading');
        await downloadImageViaFetch(url, FALLBACK_DOWNLOAD_PREFIX);
        updateStatusBar('下载完成', 'success');
        showToast('下载完成');
      } catch (fallbackError) {
        if (window.GeminiImageErrorLogger) {
          window.GeminiImageErrorLogger.logDownloadError(fallbackError, {
            url,
            type: 'single-download-fallback',
            error: fallbackError.message
          });
        }
        updateStatusBar('下载失败', 'error');
        showToast('下载失败: ' + fallbackError.message, 'error');
      }
    }
  });
  
  if (added) {
    updateStatusBar('准备下载...', 'downloading');
  }
}

/**
 * 将 Blob 转换为 Data URL
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 批量下载并去水印（打包成 ZIP）
 * @param {string[]} urls - 图片 URL 列表
 */
async function downloadBatchWithWatermarkRemoval(urls) {
  const processedImages = new Array(urls.length).fill(null);
  let failCount = 0;

  const total = urls.length;
  const elementMap = getImageElementMap();
  const hardware = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 0 : 0;
  const desiredConcurrency = hardware > 0 ? Math.floor(hardware / 4) : 2;
  const concurrency = Math.max(1, Math.min(3, desiredConcurrency || 2, total));
  let cursor = 0;
  let completed = 0;

  const nextIndex = () => {
    if (cursor >= total) return null;
    const current = cursor;
    cursor += 1;
    return current;
  };

  updateStatusBar(`正在去水印处理 0/${total}...`, 'downloading');

  const worker = async () => {
    while (true) {
      const index = nextIndex();
      if (index === null) break;
      const url = urls[index];

      try {
        const sourceElement = elementMap.get(url) || null;
        const result = await window.GeminiWatermarkRemover.removeWatermark(url, {
          element: sourceElement
        });

        if (result.success) {
          const dataUrl = await blobToDataUrl(result.blob);
          const filename = `image_nowm_${String(index + 1).padStart(2, '0')}.png`;
          processedImages[index] = { dataUrl, filename };
        } else {
          throw new Error(result.error || '去水印失败');
        }
      } catch (error) {
        failCount++;
        getLogger().warn('UI', 'Batch watermark removal failed', { error: error?.message, url });

        if (window.GeminiImageErrorLogger) {
          window.GeminiImageErrorLogger.logDownloadError(error, {
            url,
            index,
            type: 'batch-download-watermark-removal',
            error: error.message
          });
          updateErrorButton();
        }
      } finally {
        completed += 1;
        updateStatusBar(`正在去水印处理 ${completed}/${total}...`, 'downloading');
      }
    }
  };

  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);

  const readyImages = processedImages.filter(Boolean);

  // 第二阶段：打包成 ZIP
  if (readyImages.length === 0) {
    updateStatusBar('批量去水印下载失败', 'error');
    return;
  }

  updateStatusBar('正在打包 ZIP...', 'packaging');

  try {
    const response = await sendRuntimeMessageWithTimeout({
      action: 'packageWatermarkRemovedImages',
      images: readyImages
    }, DOWNLOAD_MESSAGE_TIMEOUT_MS);

    if (response && response.success) {
      if (failCount > 0) {
        updateStatusBar(`去水印下载完成: ${readyImages.length} 成功, ${failCount} 失败`, 'warning');
      } else {
        updateStatusBar(`成功去水印下载 ${readyImages.length} 张图片`, 'success');
      }
    } else {
      throw new Error(response?.error || 'ZIP 打包失败');
    }
  } catch (error) {
    getLogger().error('UI', error, { context: 'packageWatermarkRemovedImages' });
    if (window.GeminiImageErrorLogger) {
      window.GeminiImageErrorLogger.logDownloadError(error, {
        type: 'batch-download-watermark-zip',
        count: processedImages.length,
        error: error.message
      });
      updateErrorButton();
    }
    updateStatusBar('ZIP 打包失败: ' + error.message, 'error');
  }
}

/**
 * 处理批量下载 (加入队列) - 支持去水印
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
  const shouldRemoveWatermark = stateManager.getRemoveWatermark() || false;
  console.log('[GID] URLs to download:', urls.length, 'removeWatermark:', shouldRemoveWatermark);
  getLogger().info('UI', 'Starting batch download', { count: urls.length, removeWatermark: shouldRemoveWatermark });

  const added = addBatchTask(async () => {
    // 如果需要去水印，逐张处理
    if (shouldRemoveWatermark && window.GeminiWatermarkRemover) {
      await downloadBatchWithWatermarkRemoval(urls);
      return;
    }

    // 普通批量下载
    console.log('[GID] Sending downloadBatch message to service worker');
    const serviceReady = await ensureDownloadServiceReady();
    if (!serviceReady) {
      updateStatusBar('后台未响应，改为逐张下载...', 'downloading');
      const { successCount, failCount } = await downloadBatchFallback(urls);
      if (successCount === 0) {
        // 记录错误日志
        console.error('[GID] Fallback download all failed');
        if (window.GeminiImageErrorLogger) {
          window.GeminiImageErrorLogger.logDownloadError(new Error('后台服务未响应，逐张下载也失败'), {
            urls,
            count: urls.length,
            type: 'batch-download-fallback',
            reason: 'service_not_ready'
          });
          updateErrorButton();
        }
        updateStatusBar('批量下载失败', 'error');
      } else if (failCount > 0) {
        // 部分失败也记录
        console.warn('[GID] Fallback download partial failure:', failCount);
        if (window.GeminiImageErrorLogger) {
          window.GeminiImageErrorLogger.logDownloadError(new Error(`部分下载失败: ${failCount}/${urls.length}`), {
            urls,
            successCount,
            failCount,
            type: 'batch-download-fallback',
            reason: 'partial_failure'
          });
          updateErrorButton();
        }
        updateStatusBar(`下载完成: ${successCount} 成功, ${failCount} 失败`, 'warning');
      } else {
        updateStatusBar(`成功下载 ${successCount} 张图片`, 'success');
      }
      return;
    }

    try {
      const timeoutMs = Math.max(DOWNLOAD_MESSAGE_TIMEOUT_MS, urls.length * 4000);
      const response = await sendRuntimeMessageWithTimeout({
        action: 'downloadBatch',
        urls: urls
      }, timeoutMs);

      console.log('[GID] Received response:', response);
      if (response && response.success !== false) {
        getLogger().info('UI', 'Batch download completed', { response });
          const successCount = response.successCount ?? urls.length;
          const failCount = response.failCount ?? 0;
        if (failCount > 0) {
          // 部分失败时记录日志
          if (window.GeminiImageErrorLogger) {
            window.GeminiImageErrorLogger.logDownloadError(new Error(`部分下载失败: ${failCount}/${urls.length}`), {
              urls,
              successCount,
              failCount,
              type: 'batch-download-partial',
              response
            });
            updateErrorButton();
          }
          updateStatusBar(`下载完成: ${successCount} 成功, ${failCount} 失败`, 'warning');
        } else {
          updateStatusBar(`成功下载 ${successCount} 张图片`, 'success');
        }
      } else {
        const errorMsg = response?.error || '未知错误';
        console.error('[GID] Batch download failed:', errorMsg, response);
        if (window.GeminiImageErrorLogger) {
          window.GeminiImageErrorLogger.logDownloadError(new Error(errorMsg), {
            urls,
            count: urls.length,
            type: 'batch-download',
            response
          });
          updateErrorButton();
        }
        updateStatusBar(`批量下载失败: ${errorMsg}`, 'error');
      }
    } catch (error) {
      console.error('[GID] Batch download exception:', error);
      if (window.GeminiImageErrorLogger) {
        window.GeminiImageErrorLogger.logDownloadError(error, {
          urls,
          count: urls.length,
          type: 'batch-download',
          error: error.message
        });
        updateErrorButton();
      }
      updateStatusBar(`批量下载失败: ${error.message}`, 'error');
    }
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

  // Create once; Gemini is an SPA and may re-render the header at any time.
  // Keep a lightweight watcher to re-position/re-create the icon when needed.
  createIcon();
  setupStateListeners();

  if (!window.__gidIconPlacementTimer) {
    const tick = () => {
      const icon = document.getElementById(getIconId()) || createIcon();
      if (!icon) return;
      ensureIconPlacement();
    };

    window.__gidIconPlacementTimer = setInterval(tick, 1000);
    window.addEventListener('resize', tick, { passive: true });
    tick();
  }

  getLogger().info('UI', 'UI initialization started');
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

/* ==================== 错误日志面板功能 ==================== */

/**
 * 显示错误日志面板
 */
async function showErrorPanel() {
  const drawer = document.getElementById(getDrawerId());
  if (!drawer) return;

  const drawerBody = drawer.querySelector('.gid-drawer-body');
  const errorPanel = drawer.querySelector('.gid-error-panel');

  if (drawerBody) drawerBody.style.display = 'none';
  if (errorPanel) errorPanel.classList.add('visible');

  await renderErrorLogs();
}

/**
 * 隐藏错误日志面板
 */
function hideErrorPanel() {
  const drawer = document.getElementById(getDrawerId());
  if (!drawer) return;

  const drawerBody = drawer.querySelector('.gid-drawer-body');
  const errorPanel = drawer.querySelector('.gid-error-panel');

  if (errorPanel) errorPanel.classList.remove('visible');
  if (drawerBody) drawerBody.style.display = 'block';
}

/**
 * 清空错误日志
 */
async function clearErrorLogs() {
  if (window.GeminiImageErrorLogger) {
    await window.GeminiImageErrorLogger.clearErrorLogs();
    await renderErrorLogs();
    updateErrorButton();
    showToast('错误日志已清空', 'success');
  }
}

/**
 * 更新错误日志按钮状态
 */
async function updateErrorButton() {
  const drawer = document.getElementById(getDrawerId());
  if (!drawer) return;

  const errorsBtn = drawer.querySelector('.gid-btn-errors');
  const badge = errorsBtn?.querySelector('.gid-error-badge');
  if (!errorsBtn || !badge) return;

  try {
    const stats = window.GeminiImageErrorLogger
      ? await window.GeminiImageErrorLogger.getErrorStats()
      : { total: 0 };

    const count = stats.total;
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';

    if (count > 0) {
      errorsBtn.classList.remove('no-errors');
    } else {
      errorsBtn.classList.add('no-errors');
    }
  } catch (e) {
    getLogger().warn('UI', 'Failed to update error button', { error: e.message });
  }
}

/**
 * 渲染错误日志列表
 */
async function renderErrorLogs() {
  const drawer = document.getElementById(getDrawerId());
  if (!drawer) return;

  const errorList = drawer.querySelector('.gid-error-list');
  const errorCount = drawer.querySelector('.gid-error-count');
  if (!errorList) return;

  try {
    const logs = window.GeminiImageErrorLogger
      ? await window.GeminiImageErrorLogger.getErrorLogs()
      : [];

    if (errorCount) errorCount.textContent = logs.length;

    if (logs.length === 0) {
      errorList.innerHTML = `
        <div class="gid-error-empty">
          <div class="gid-error-empty-icon">✅</div>
          <div>暂无错误记录</div>
        </div>
      `;
      return;
    }

    errorList.innerHTML = logs.map(log => {
      const time = new Date(log.timestamp).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const contextStr = log.context && Object.keys(log.context).length > 0
        ? JSON.stringify(log.context, null, 2)
        : '';

      return `
        <div class="gid-error-item">
          <div class="gid-error-item-header">
            <span class="gid-error-category ${log.category}">${log.category}</span>
            <span class="gid-error-time">${time}</span>
          </div>
          <div class="gid-error-message">${escapeHtml(log.message)}</div>
          ${contextStr ? `<div class="gid-error-context">${escapeHtml(contextStr)}</div>` : ''}
        </div>
      `;
    }).join('');

  } catch (e) {
    getLogger().error('UI', e, { context: 'renderErrorLogs' });
    errorList.innerHTML = `
      <div class="gid-error-empty">
        <div class="gid-error-empty-icon">⚠️</div>
        <div>加载错误日志失败</div>
      </div>
    `;
  }
}

/**
 * HTML 转义（防止 XSS）
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
