// [IN]: State module, UI module, Detection module / 状态模块、UI模块、检测模块
// [OUT]: Preview panel functions (open, close, navigate, download) / 预览面板函数（打开、关闭、导航、下载）
// [POS]: src/content/preview.js - 全屏图片预览模块，支持键盘导航和去水印下载
// [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

/**
 * Gemini Image Preview Module
 * 全屏预览面板：大图 + 底部可滑动缩略图条
 * 支持：键盘导航、点击切换、去水印下载
 */

/* ==================== 预览状态 ==================== */

const previewState = {
  isOpen: false,
  currentIndex: 0,
  images: [],
  removeWatermark: true  // 去水印开关
};

const PREVIEW_PRELOAD_LIMIT = 8;
const previewPreloadCache = new Map();

function getThumbUrl(image) {
  if (!image) return '';
  return image.thumbnailUrl || image.url || '';
}

function touchPreloadCache(url, entry) {
  if (!url) return;
  if (previewPreloadCache.has(url)) {
    previewPreloadCache.delete(url);
  }
  previewPreloadCache.set(url, entry);
}

function trimPreloadCache(keepUrls = new Set()) {
  if (previewPreloadCache.size <= PREVIEW_PRELOAD_LIMIT) return;
  for (const [url] of previewPreloadCache) {
    if (previewPreloadCache.size <= PREVIEW_PRELOAD_LIMIT) break;
    if (!keepUrls.has(url)) {
      previewPreloadCache.delete(url);
    }
  }
}

function preloadImage(url) {
  if (!url) return Promise.reject(new Error('invalid url'));
  const cached = previewPreloadCache.get(url);
  if (cached?.status === 'loaded' && cached.image) {
    touchPreloadCache(url, cached);
    return Promise.resolve(cached.image);
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const img = new Image();
  img.decoding = 'async';
  const entry = { status: 'loading', image: img, promise: null };
  const promise = new Promise((resolve, reject) => {
    img.onload = () => {
      entry.status = 'loaded';
      entry.promise = null;
      touchPreloadCache(url, entry);
      resolve(img);
    };
    img.onerror = () => {
      previewPreloadCache.delete(url);
      reject(new Error('preload failed'));
    };
  });
  entry.promise = promise;
  touchPreloadCache(url, entry);
  img.src = url;
  return promise;
}

function preloadAround(index) {
  const total = previewState.images.length;
  if (total === 0) return;

  const offsets = [0, 1, -1, 2, -2];
  const keepUrls = new Set();

  offsets.forEach((offset) => {
    const target = index + offset;
    if (target < 0 || target >= total) return;
    const url = previewState.images[target]?.url;
    if (!url) return;
    keepUrls.add(url);
    preloadImage(url).catch(() => {});
  });

  trimPreloadCache(keepUrls);
}

/* ==================== DOM 创建 ==================== */

/**
 * 创建预览面板 DOM 结构
 */
function createPreviewPanel() {
  // 检查是否已存在
  if (document.getElementById('gid-preview-overlay')) {
    return document.getElementById('gid-preview-overlay');
  }

  const overlay = document.createElement('div');
  overlay.id = 'gid-preview-overlay';
  overlay.className = 'gid-preview-overlay';
  overlay.innerHTML = `
    <div class="gid-preview-toolbar">
      <div class="gid-preview-counter">
        <span class="gid-preview-current">1</span>
        <span class="gid-preview-separator">/</span>
        <span class="gid-preview-total">1</span>
      </div>
      <div class="gid-preview-actions">
        <label class="gid-preview-watermark-toggle" title="去除 Gemini 水印">
          <input type="checkbox" class="gid-watermark-checkbox">
          <span class="gid-watermark-label">去水印</span>
        </label>
        <button class="gid-preview-close" aria-label="关闭预览">×</button>
      </div>
    </div>
    <div class="gid-preview-main">
      <button class="gid-preview-nav gid-preview-prev" aria-label="上一张">‹</button>
      <div class="gid-preview-image-wrapper">
        <img class="gid-preview-image" src="" alt="预览图片">
        <button class="gid-preview-download" title="下载此图片">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 15V3M12 15L7 10M12 15L17 10M3 15V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <button class="gid-preview-nav gid-preview-next" aria-label="下一张">›</button>
    </div>
    <div class="gid-preview-thumbnails">
      <div class="gid-preview-thumb-track"></div>
    </div>
  `;

  // 绑定事件
  bindPreviewEvents(overlay);

  document.body.appendChild(overlay);
  return overlay;
}

/**
 * 绑定预览面板事件
 */
function bindPreviewEvents(overlay) {
  // 关闭按钮
  overlay.querySelector('.gid-preview-close').addEventListener('click', closePreview);

  // 点击遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('gid-preview-main')) {
      closePreview();
    }
  });

  // 导航按钮
  overlay.querySelector('.gid-preview-prev').addEventListener('click', (e) => {
    e.stopPropagation();
    navigate('prev');
  });

  overlay.querySelector('.gid-preview-next').addEventListener('click', (e) => {
    e.stopPropagation();
    navigate('next');
  });

  // 下载按钮
  overlay.querySelector('.gid-preview-download').addEventListener('click', (e) => {
    e.stopPropagation();
    downloadCurrent();
  });

  // 去水印开关
  overlay.querySelector('.gid-watermark-checkbox').addEventListener('change', (e) => {
    previewState.removeWatermark = e.target.checked;
  });

  // 阻止图片区域点击关闭
  overlay.querySelector('.gid-preview-image-wrapper').addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

function syncPreviewWatermarkCheckbox(checked) {
  const overlay = document.getElementById('gid-preview-overlay');
  const checkbox = overlay?.querySelector('.gid-watermark-checkbox');
  if (checkbox) {
    checkbox.checked = checked;
  }
}

/**
 * 设置键盘事件监听
 */
function setupKeyboardNavigation() {
  document.addEventListener('keydown', handleKeydown);
}

/**
 * 移除键盘事件监听
 */
function removeKeyboardNavigation() {
  document.removeEventListener('keydown', handleKeydown);
}

/**
 * 键盘事件处理
 */
function handleKeydown(e) {
  if (!previewState.isOpen) return;

  switch (e.key) {
    case 'Escape':
      closePreview();
      break;
    case 'ArrowLeft':
      navigate('prev');
      break;
    case 'ArrowRight':
      navigate('next');
      break;
    case 'Home':
      goToIndex(0);
      break;
    case 'End':
      goToIndex(previewState.images.length - 1);
      break;
  }
}

/* ==================== 预览操作 ==================== */

/**
 * 打开预览面板
 * @param {Array} images - 图片列表
 * @param {number} startIndex - 起始索引
 */
function openPreview(images, startIndex = 0) {
  if (!images || images.length === 0) return;

  const overlay = createPreviewPanel();
  const stateManager = window.GeminiImageState;
  const defaultChecked = typeof stateManager?.getRemoveWatermark === 'function'
    ? stateManager.getRemoveWatermark()
    : previewState.removeWatermark;

  previewState.isOpen = true;
  previewState.images = images;
  previewState.currentIndex = Math.max(0, Math.min(startIndex, images.length - 1));
  previewState.removeWatermark = defaultChecked;
  syncPreviewWatermarkCheckbox(defaultChecked);

  // 渲染缩略图
  renderThumbnails();

  // 显示当前图片
  updatePreviewImage();

  // 更新计数器
  updateCounter();

  // 显示面板
  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';

  // 启用键盘导航
  setupKeyboardNavigation();
}

/**
 * 关闭预览面板
 */
function closePreview() {
  const overlay = document.getElementById('gid-preview-overlay');
  if (!overlay) return;

  previewState.isOpen = false;

  overlay.classList.remove('visible');
  document.body.style.overflow = '';

  // 移除键盘导航
  removeKeyboardNavigation();
}

/**
 * 导航到上一张/下一张
 * @param {'prev' | 'next'} direction
 */
function navigate(direction) {
  if (!previewState.isOpen || previewState.images.length === 0) return;

  let newIndex = previewState.currentIndex;

  if (direction === 'prev') {
    newIndex = (newIndex - 1 + previewState.images.length) % previewState.images.length;
  } else {
    newIndex = (newIndex + 1) % previewState.images.length;
  }

  goToIndex(newIndex);
}

/**
 * 跳转到指定索引
 * @param {number} index
 */
function goToIndex(index) {
  if (index < 0 || index >= previewState.images.length) return;

  previewState.currentIndex = index;
  updatePreviewImage();
  updateCounter();
  updateThumbnailSelection();
  scrollThumbnailIntoView();
}

/* ==================== UI 更新 ==================== */

/**
 * 更新预览大图
 */
function updatePreviewImage() {
  const img = document.querySelector('.gid-preview-image');
  if (!img) return;

  const currentImage = previewState.images[previewState.currentIndex];
  if (!currentImage) return;

  const fullUrl = currentImage.url;
  const thumbUrl = getThumbUrl(currentImage) || fullUrl;
  img.decoding = 'async';
  img.loading = 'eager';

  const cached = previewPreloadCache.get(fullUrl);
  if (cached?.status === 'loaded') {
    img.src = fullUrl;
  } else {
    img.src = thumbUrl;
    preloadImage(fullUrl)
      .then(() => {
        const active = previewState.images[previewState.currentIndex];
        if (active?.url === fullUrl) {
          img.src = fullUrl;
        }
      })
      .catch(() => {});
  }

  img.alt = `图片 ${previewState.currentIndex + 1}`;
  preloadAround(previewState.currentIndex);
}

/**
 * 更新计数器
 */
function updateCounter() {
  const current = document.querySelector('.gid-preview-current');
  const total = document.querySelector('.gid-preview-total');

  if (current) current.textContent = previewState.currentIndex + 1;
  if (total) total.textContent = previewState.images.length;
}

/**
 * 渲染缩略图列表
 */
function renderThumbnails() {
  const track = document.querySelector('.gid-preview-thumb-track');
  if (!track) return;

  track.innerHTML = previewState.images.map((img, index) => {
    const thumbUrl = (img.thumbnailUrl || img.url).replace(/"/g, '&quot;');
    const isActive = index === previewState.currentIndex ? 'active' : '';
    return `
      <div class="gid-preview-thumb-item ${isActive}" data-index="${index}">
        <img src="${thumbUrl}" alt="缩略图 ${index + 1}">
      </div>
    `;
  }).join('');

  // 绑定缩略图点击事件
  track.querySelectorAll('.gid-preview-thumb-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index, 10);
      goToIndex(index);
    });
  });
}

/**
 * 更新缩略图选中状态
 */
function updateThumbnailSelection() {
  const items = document.querySelectorAll('.gid-preview-thumb-item');
  items.forEach((item, index) => {
    if (index === previewState.currentIndex) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

/**
 * 滚动当前缩略图到可视区域
 */
function scrollThumbnailIntoView() {
  const activeThumb = document.querySelector('.gid-preview-thumb-item.active');
  if (activeThumb) {
    activeThumb.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    });
  }
}

/* ==================== 下载功能 ==================== */

/**
 * 下载当前图片
 */
async function downloadCurrent() {
  const currentImage = previewState.images[previewState.currentIndex];
  if (!currentImage) return;

  const url = currentImage.url;
  const element = currentImage.element || null;
  const downloadButton = document.querySelector('.gid-preview-download');
  if (downloadButton) {
    downloadButton.classList.add('is-loading');
  }

  try {
    if (previewState.removeWatermark && window.GeminiWatermarkRemover) {
      // 去水印下载
      await downloadWithWatermarkRemoval(url, element);
    } else {
      // 普通下载
      await downloadImage(url);
    }
  } catch (error) {
    console.error('[GID] Preview download failed:', error);
    if (window.GeminiImageUI) {
      window.GeminiImageUI.showToast('下载失败: ' + error.message, 'error');
    }
  } finally {
    if (downloadButton) {
      downloadButton.classList.remove('is-loading');
    }
  }
}

/**
 * 普通下载
 */
async function downloadImage(url) {
  if (window.GeminiImageUI) {
    window.GeminiImageUI.showToast('正在下载图片...', 'warning');
  }

  const response = await fetch(url, {
    credentials: 'include',
    cache: 'force-cache'
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const ext = getExtensionFromBlob(blob) || 'png';
  const filename = `Gemini_Image_${previewState.currentIndex + 1}.${ext}`;

  triggerDownload(blob, filename);

  if (window.GeminiImageUI) {
    window.GeminiImageUI.showToast('下载完成', 'success');
  }
}

/**
 * 去水印下载
 */
async function downloadWithWatermarkRemoval(url, element) {
  if (!window.GeminiWatermarkRemover) {
    throw new Error('去水印模块未加载');
  }

  if (window.GeminiImageUI) {
    window.GeminiImageUI.showToast('正在去水印下载...', 'warning');
  }

  const result = await window.GeminiWatermarkRemover.removeWatermark(url, {
    element: element || null
  });

  if (!result.success) {
    throw new Error(result.error || '去水印失败');
  }

  const filename = `Gemini_Image_${previewState.currentIndex + 1}_nowm.png`;
  triggerDownload(result.blob, filename);

  if (window.GeminiImageUI) {
    window.GeminiImageUI.showToast('去水印下载完成', 'success');
  }
}

/**
 * 触发浏览器下载
 */
function triggerDownload(blob, filename) {
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

/**
 * 从 Blob 获取文件扩展名
 */
function getExtensionFromBlob(blob) {
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  return mimeMap[blob.type] || null;
}

/* ==================== 初始化 ==================== */

/**
 * 初始化预览模块
 */
function initPreview() {
  // 预创建 DOM（可选，也可以在首次打开时创建）
  // createPreviewPanel();
}

/* ==================== 导出 ==================== */

window.GeminiImagePreview = {
  init: initPreview,
  open: openPreview,
  close: closePreview,
  navigate,
  goToIndex,
  getState: () => ({ ...previewState }),
  setRemoveWatermark: (value) => {
    previewState.removeWatermark = value;
    syncPreviewWatermarkCheckbox(value);
  }
};
