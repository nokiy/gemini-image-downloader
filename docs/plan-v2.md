# Gemini Image Downloader V1.1.0.0 技术方案 / Technical Plan

> 📅 版本：v1.1.0.0  
> 📅 创建时间：2025-12-23  
> 📌 状态：Plan 阶段  
> 🔗 前置文档：`ideas.md`, `requirements-clarification-v2.md`

---

## 一、架构演进 / Architecture Evolution

### 1.1 V1.0 → V2.0 架构对比

| 维度 | V1.0 | V2.0 |
|:---|:---|:---|
| **入口方式** | Popup 弹窗（点击扩展图标） | 页面内图标 + 抽屉页 |
| **图片展示** | 无预览 | 缩略图列表（最多 10 张） |
| **下载方式** | 全量 ZIP 打包 | 单个下载 + 批量选择下载 |
| **实时检测** | 仅在 Popup 打开时检测 | MutationObserver 实时监听 |
| **任务管理** | 无队列 | 下载队列管理 |
| **UI 层** | Popup only | Content Script UI |

### 1.2 V2.0 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Chrome Extension                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                      Content Script                          │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │
│   │  │  UI Layer   │  │  Detection  │  │   State Manager     │  │   │
│   │  │  (Icon +    │←→│   Module    │←→│   (Images, Select,  │  │   │
│   │  │   Drawer)   │  │             │  │    Download Queue)  │  │   │
│   │  └─────────────┘  └─────────────┘  └─────────────────────┘  │   │
│   │         │                                    │               │   │
│   └─────────│────────────────────────────────────│───────────────┘   │
│             │                                    │                    │
│             │   chrome.runtime.sendMessage       │                    │
│             ↓                                    ↓                    │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                   Background Service Worker                  │   │
│   │  ┌─────────────────┐  ┌─────────────────────────────────┐   │   │
│   │  │ Download Queue  │  │      File Naming Manager        │   │   │
│   │  │    Manager      │←→│    (Conflict Resolution)        │   │   │
│   │  └─────────────────┘  └─────────────────────────────────┘   │   │
│   │            │                                                 │   │
│   │            ↓ chrome.downloads API                            │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 二、模块设计 / Module Design

### 2.1 模块清单

| 模块 | 文件位置 | 职责 | 新增/修改 |
|:---|:---|:---|:---|
| **UI Layer** | `src/content/ui.js` | 图标 + 抽屉 UI 渲染 | 🆕 新增 |
| **UI Styles** | `src/content/ui.css` | 抽屉页样式 | 🆕 新增 |
| **Detection** | `src/content/detection.js` | 图片检测（双重机制） | 🆕 新增 |
| **State Manager** | `src/content/state.js` | 状态管理（图片、选择、队列） | 🆕 新增 |
| **Content Entry** | `src/content/content.js` | 模块组装和初始化 | 🔄 修改 |
| **Download Queue** | `src/background/download-queue.js` | 下载队列管理 | 🆕 新增 |
| **File Naming** | `src/background/file-naming.js` | 文件命名和冲突处理 | 🆕 新增 |
| **Service Worker** | `src/background/service_worker.js` | 模块组装和消息处理 | 🔄 修改 |

### 2.2 项目结构（V2.0）

```
gemini-image-downloader/
├── manifest.json              # 更新：新增 CSS 注入
├── src/
│   ├── content/
│   │   ├── content.js         # 🔄 修改：模块组装入口
│   │   ├── detection.js       # 🆕 新增：图片检测模块
│   │   ├── state.js           # 🆕 新增：状态管理模块
│   │   ├── ui.js              # 🆕 新增：UI 渲染模块
│   │   └── ui.css             # 🆕 新增：UI 样式
│   ├── background/
│   │   ├── service_worker.js  # 🔄 修改：消息处理入口
│   │   ├── download-queue.js  # 🆕 新增：下载队列模块
│   │   └── file-naming.js     # 🆕 新增：文件命名模块
│   └── popup/                 # ⚠️ 保留但不再作为主入口
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
├── libs/
│   └── jszip.min.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 三、详细设计 / Detailed Design

### 3.1 图片检测模块 (`detection.js`)

#### 3.1.1 双重检测机制

```javascript
// detection.js
// [IN]: DOM APIs, MutationObserver / DOM API、MutationObserver
// [OUT]: Image detection functions, observer setup / 图片检测函数、观察器设置
// [POS]: src/content/detection.js - Core detection layer / 核心检测层

/**
 * 方法 1：DOM 选择器（优先）
 * 参考 GemSaver 的方法，查找 Gemini 原生的下载按钮元素
 */
function findImagesByDOM() {
  const images = [];
  
  // 查找 download-generated-image-button
  const downloadButtons = document.querySelectorAll(
    'download-generated-image-button button[data-test-id="download-generated-image-button"]'
  );
  
  downloadButtons.forEach((btn) => {
    const container = btn.closest('generated-image') || btn.closest('single-image');
    if (container) {
      const img = container.querySelector('img.image');
      if (img && img.src && img.src.includes('googleusercontent.com')) {
        images.push({
          url: img.src,
          element: img,
          container: container,
          method: 'dom'
        });
      }
    }
  });
  
  return images;
}

/**
 * 方法 2：URL 模式匹配（回退）
 * 当 DOM 选择器无法找到图片时使用
 */
function findImagesByURL() {
  const images = [];
  const allImages = document.querySelectorAll('img[src*="googleusercontent.com"]');
  
  allImages.forEach((img) => {
    const url = img.src;
    const maxDim = Math.max(
      img.naturalWidth || img.width || 0,
      img.naturalHeight || img.height || 0
    );
    
    // 过滤条件
    const isGenerated = url.includes('/gg-dl/') || maxDim >= 200;
    const isAvatar = url.includes('/a/') || 
                     img.closest('[data-participant-id]') !== null;
    const isIcon = maxDim > 0 && maxDim < 120;
    
    if (isGenerated && !isAvatar && !isIcon) {
      images.push({
        url: url,
        element: img,
        container: img.parentElement,
        method: 'url'
      });
    }
  });
  
  return images;
}

/**
 * 统一检测入口
 */
export function detectImages() {
  // 优先使用 DOM 选择器
  let images = findImagesByDOM();
  
  // 如果 DOM 选择器无结果，回退到 URL 模式
  if (images.length === 0) {
    images = findImagesByURL();
  }
  
  // 去重（基于 URL）
  const uniqueUrls = new Set();
  const uniqueImages = images.filter(img => {
    if (uniqueUrls.has(img.url)) return false;
    uniqueUrls.add(img.url);
    return true;
  });
  
  return uniqueImages;
}

/**
 * 设置实时监听
 */
export function setupObserver(callback) {
  let debounceTimer = null;
  
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      callback(detectImages());
    }, 500); // 防抖 500ms
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // 定时刷新（每 5 秒）
  setInterval(() => {
    callback(detectImages());
  }, 5000);
  
  return observer;
}
```

#### 3.1.2 检测结果数据结构

```typescript
interface DetectedImage {
  url: string;           // 图片 URL
  element: HTMLElement;  // DOM 元素引用
  container: HTMLElement; // 父容器引用
  method: 'dom' | 'url'; // 检测方法
}
```

---

### 3.2 状态管理模块 (`state.js`)

#### 3.2.1 状态结构

```javascript
// state.js
// [IN]: Detection module / 检测模块
// [OUT]: State management functions / 状态管理函数
// [POS]: src/content/state.js - State management layer / 状态管理层

const state = {
  // 检测到的图片列表
  images: [],           // DetectedImage[]
  
  // 显示的图片（最多 10 张）
  displayImages: [],    // DetectedImage[]
  
  // 选中的图片 URL 集合
  selectedUrls: new Set(),
  
  // 下载队列状态
  downloadQueue: {
    tasks: [],          // 待下载任务
    currentTask: null,  // 当前正在下载的任务
    isProcessing: false // 是否正在处理
  },
  
  // UI 状态
  ui: {
    isDrawerOpen: false,
    isIconVisible: false,
    downloadStatus: 'idle' // 'idle' | 'downloading' | 'completed' | 'error'
  }
};

/**
 * 更新图片列表
 */
export function updateImages(newImages) {
  state.images = newImages;
  
  // 只取前 10 张显示
  state.displayImages = newImages.slice(0, 10);
  
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
 * 切换选中状态
 */
export function toggleSelect(url) {
  if (state.selectedUrls.has(url)) {
    state.selectedUrls.delete(url);
  } else {
    state.selectedUrls.add(url);
  }
  emitStateChange('selection');
}

/**
 * 全选/取消全选
 */
export function selectAll(select = true) {
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
 */
export function getSelectedImages() {
  return state.displayImages.filter(img => 
    state.selectedUrls.has(img.url)
  );
}

// 状态变化事件
const listeners = new Map();

export function onStateChange(key, callback) {
  if (!listeners.has(key)) {
    listeners.set(key, []);
  }
  listeners.get(key).push(callback);
}

function emitStateChange(key) {
  const callbacks = listeners.get(key) || [];
  callbacks.forEach(cb => cb(state));
}

export function getState() {
  return state;
}
```

---

### 3.3 UI 渲染模块 (`ui.js`)

#### 3.3.1 图标组件

```javascript
// ui.js
// [IN]: State module, Detection module / 状态模块、检测模块
// [OUT]: UI rendering functions / UI 渲染函数
// [POS]: src/content/ui.js - UI rendering layer / UI 渲染层

import { getState, onStateChange, toggleSelect, selectAll, getSelectedImages } from './state.js';

const ICON_ID = 'gemini-downloader-icon';
const DRAWER_ID = 'gemini-downloader-drawer';
const OVERLAY_ID = 'gemini-downloader-overlay';

/**
 * 创建图标
 */
function createIcon() {
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
    <div class="gid-status-indicator"></div>
  `;
  
  icon.addEventListener('click', toggleDrawer);
  document.body.appendChild(icon);
  
  return icon;
}

/**
 * 更新图标
 */
function updateIcon(state) {
  const icon = document.getElementById(ICON_ID);
  if (!icon) return;
  
  // 显示/隐藏
  icon.style.display = state.ui.isIconVisible ? 'flex' : 'none';
  
  // 更新数量
  const badge = icon.querySelector('.gid-badge');
  if (badge) {
    const count = state.images.length;
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
  
  // 更新下载状态指示器
  const indicator = icon.querySelector('.gid-status-indicator');
  if (indicator) {
    indicator.className = `gid-status-indicator gid-status-${state.ui.downloadStatus}`;
  }
}
```

#### 3.3.2 抽屉组件

```javascript
/**
 * 创建抽屉
 */
function createDrawer() {
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
        <span>Gemini Images</span>
        <span class="gid-drawer-count">0 张图片</span>
      </div>
      <div class="gid-drawer-actions">
        <button class="gid-btn gid-btn-select-all">全选</button>
        <button class="gid-btn gid-btn-primary gid-btn-batch" disabled>
          批量下载
        </button>
        <button class="gid-btn-close" aria-label="关闭">×</button>
      </div>
    </div>
    <div class="gid-drawer-body">
      <div class="gid-image-list"></div>
    </div>
    <div class="gid-drawer-footer">
      <div class="gid-status-bar"></div>
    </div>
  `;
  
  // 事件绑定
  drawer.querySelector('.gid-btn-close').addEventListener('click', closeDrawer);
  drawer.querySelector('.gid-btn-select-all').addEventListener('click', handleSelectAll);
  drawer.querySelector('.gid-btn-batch').addEventListener('click', handleBatchDownload);
  
  // ESC 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && getState().ui.isDrawerOpen) {
      closeDrawer();
    }
  });
  
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);
  
  return drawer;
}

/**
 * 渲染图片列表
 */
function renderImageList(state) {
  const listContainer = document.querySelector('.gid-image-list');
  if (!listContainer) return;
  
  const { displayImages, selectedUrls, images } = state;
  
  listContainer.innerHTML = displayImages.map((img, index) => `
    <div class="gid-image-item ${selectedUrls.has(img.url) ? 'selected' : ''}" data-url="${img.url}">
      <div class="gid-image-checkbox">
        <input type="checkbox" ${selectedUrls.has(img.url) ? 'checked' : ''}>
      </div>
      <div class="gid-image-thumb">
        <img src="${img.url}" alt="Image ${index + 1}" loading="lazy">
      </div>
      <div class="gid-image-info">
        <span class="gid-image-index">#${index + 1}</span>
      </div>
      <button class="gid-btn gid-btn-download" data-url="${img.url}" title="下载">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 15V3M12 15L7 10M12 15L17 10M3 15V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `).join('');
  
  // 绑定事件
  listContainer.querySelectorAll('.gid-image-item').forEach(item => {
    const url = item.dataset.url;
    
    // 复选框点击
    item.querySelector('.gid-image-checkbox').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSelect(url);
    });
    
    // 单个下载
    item.querySelector('.gid-btn-download').addEventListener('click', (e) => {
      e.stopPropagation();
      handleSingleDownload(url);
    });
  });
  
  // 更新头部信息
  const countEl = document.querySelector('.gid-drawer-count');
  if (countEl) {
    const total = images.length;
    const displayed = displayImages.length;
    countEl.textContent = total > 10 
      ? `检测到 ${total} 张，显示前 ${displayed} 张`
      : `${total} 张图片`;
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
 * 打开/关闭抽屉
 */
function toggleDrawer() {
  const state = getState();
  if (state.ui.isDrawerOpen) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

function openDrawer() {
  const drawer = document.getElementById(DRAWER_ID);
  const overlay = document.getElementById(OVERLAY_ID);
  
  if (drawer && overlay) {
    overlay.classList.add('visible');
    drawer.classList.add('open');
    getState().ui.isDrawerOpen = true;
    renderImageList(getState());
  }
}

function closeDrawer() {
  const drawer = document.getElementById(DRAWER_ID);
  const overlay = document.getElementById(OVERLAY_ID);
  
  if (drawer && overlay) {
    overlay.classList.remove('visible');
    drawer.classList.remove('open');
    getState().ui.isDrawerOpen = false;
  }
}

/**
 * 初始化 UI
 */
export function initUI() {
  createIcon();
  createDrawer();
  
  // 监听状态变化
  onStateChange('images', updateIcon);
  onStateChange('images', renderImageList);
  onStateChange('selection', renderImageList);
}

export { updateIcon, renderImageList, openDrawer, closeDrawer };
```

---

### 3.4 下载队列模块 (`download-queue.js`)

```javascript
// download-queue.js
// [IN]: chrome.downloads API, file-naming module / chrome.downloads API、文件命名模块
// [OUT]: Download queue management / 下载队列管理
// [POS]: src/background/download-queue.js - Download management layer / 下载管理层

import { generateFilename, checkConflict } from './file-naming.js';

const queue = {
  tasks: [],
  isProcessing: false,
  currentTask: null
};

/**
 * 添加下载任务
 * @param {Object} task - { type: 'single' | 'batch', urls: string[], priority: number }
 */
export function addTask(task) {
  // 批量任务优先级更高
  if (task.type === 'batch') {
    task.priority = 1;
    queue.tasks.unshift(task);
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
    if (queue.currentTask.type === 'single') {
      await downloadSingle(queue.currentTask.urls[0]);
    } else {
      await downloadBatch(queue.currentTask.urls);
    }
    
    // 通知完成
    notifyTaskComplete(queue.currentTask, { success: true });
  } catch (error) {
    // 通知失败
    notifyTaskComplete(queue.currentTask, { success: false, error });
  } finally {
    queue.currentTask = null;
    queue.isProcessing = false;
    
    // 继续处理下一个任务
    if (queue.tasks.length > 0) {
      processQueue();
    }
  }
}

/**
 * 单个下载
 */
async function downloadSingle(url) {
  const filename = await generateFilename(1, false);
  
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
        resolve(downloadId);
      }
    });
  });
}

/**
 * 批量下载（ZIP 打包）
 */
async function downloadBatch(urls) {
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
        const ext = getExtensionFromContentType(response.headers.get('content-type'));
        zip.file(`${String(i + 1).padStart(2, '0')}.${ext}`, blob);
        successCount++;
      } else {
        failCount++;
      }
    } catch (error) {
      failCount++;
    }
    
    // 通知进度
    notifyProgress(i + 1, urls.length);
  }
  
  if (successCount === 0) {
    throw new Error('所有图片下载失败');
  }
  
  // 生成 ZIP
  const content = await zip.generateAsync({ type: 'blob' });
  const filename = await generateFilename(successCount, true);
  
  // 下载 ZIP
  const blobUrl = URL.createObjectURL(content);
  
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: blobUrl,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      URL.revokeObjectURL(blobUrl);
      
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve({ downloadId, successCount, failCount });
      }
    });
  });
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

// 进度通知
function notifyProgress(current, total) {
  chrome.runtime.sendMessage({
    action: 'downloadProgress',
    current,
    total
  });
}

// 完成通知
function notifyTaskComplete(task, result) {
  chrome.runtime.sendMessage({
    action: 'downloadComplete',
    task,
    result
  });
}

export { queue };
```

---

### 3.5 文件命名模块 (`file-naming.js`)

```javascript
// file-naming.js
// [IN]: chrome.downloads API / chrome.downloads API
// [OUT]: Filename generation and conflict resolution / 文件名生成和冲突处理
// [POS]: src/background/file-naming.js - File naming layer / 文件命名层

/**
 * 生成文件名
 * @param {number} count - 图片数量
 * @param {boolean} isZip - 是否为 ZIP 文件
 */
export async function generateFilename(count, isZip) {
  const baseDir = 'Gemini_Images';
  
  if (isZip) {
    const baseName = `Gemini_Image_${count}`;
    const ext = 'zip';
    const filename = await resolveConflict(baseDir, baseName, ext);
    return filename;
  } else {
    const baseName = 'Gemini_Image';
    const ext = 'png'; // 默认扩展名，实际会被覆盖
    const filename = await resolveConflict(baseDir, baseName, ext);
    return filename;
  }
}

/**
 * 解决文件名冲突
 * 规则：重名时加数字后缀（Gemini_Image_5_1.zip）
 */
async function resolveConflict(dir, baseName, ext) {
  let filename = `${dir}/${baseName}.${ext}`;
  let counter = 0;
  
  // 检查是否存在同名文件（查询下载历史）
  const exists = await checkFileExists(filename);
  
  if (!exists) {
    return filename;
  }
  
  // 添加数字后缀
  while (true) {
    counter++;
    filename = `${dir}/${baseName}_${counter}.${ext}`;
    
    const stillExists = await checkFileExists(filename);
    if (!stillExists) {
      return filename;
    }
    
    // 防止无限循环
    if (counter > 1000) {
      // 使用时间戳作为后缀
      const timestamp = Date.now();
      return `${dir}/${baseName}_${timestamp}.${ext}`;
    }
  }
}

/**
 * 检查文件是否存在（通过下载历史）
 */
function checkFileExists(filename) {
  return new Promise((resolve) => {
    chrome.downloads.search({ filename }, (results) => {
      // 如果有同名文件且状态为完成，则认为存在
      const exists = results.some(r => 
        r.state === 'complete' && 
        r.filename.endsWith(filename.split('/').pop())
      );
      resolve(exists);
    });
  });
}

export { resolveConflict, checkFileExists };
```

---

## 四、manifest.json 更新

```json
{
  "manifest_version": 3,
  "name": "Gemini Image Downloader",
  "version": "1.1.0.0",
  "description": "一键批量下载 Gemini AI 生成的所有高清图片",
  "permissions": [
    "activeTab",
    "downloads",
    "scripting",
    "storage"
  ],
  "host_permissions": [
    "https://gemini.google.com/*",
    "https://*.googleusercontent.com/*",
    "https://*.google.com/*"
  ],
  "background": {
    "service_worker": "src/background/service_worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://gemini.google.com/*"],
      "js": ["src/content/content.js"],
      "css": ["src/content/ui.css"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "web_accessible_resources": [
    {
      "resources": ["libs/jszip.min.js"],
      "matches": ["https://gemini.google.com/*"]
    }
  ]
}
```

---

## 五、开发计划 / Development Plan

### 5.1 里程碑

| 里程碑 | 内容 | 预计时间 |
|:---|:---|:---|
| **M1: 检测模块** | 双重检测机制、实时监听 | 1 天 |
| **M2: 状态管理** | 状态模块、选择逻辑 | 0.5 天 |
| **M3: UI 渲染** | 图标、抽屉、图片列表 | 1.5 天 |
| **M4: 下载功能** | 单个下载、批量下载、ZIP 打包 | 1 天 |
| **M5: 队列管理** | 下载队列、文件命名 | 0.5 天 |
| **M6: 异常处理** | 错误提示、重试机制 | 0.5 天 |
| **M7: 测试优化** | 功能测试、性能优化 | 1 天 |

**总计：约 6 天**

### 5.2 开发顺序

```
M1 检测模块
    ↓
M2 状态管理
    ↓
M3 UI 渲染
    ↓
M4 下载功能
    ↓
M5 队列管理
    ↓
M6 异常处理
    ↓
M7 测试优化
```

---

## 六、测试计划 / Test Plan

### 6.1 单元测试

| 模块 | 测试点 |
|:---|:---|
| **detection.js** | DOM 选择器检测、URL 模式匹配、去重逻辑 |
| **state.js** | 状态更新、选择切换、全选/取消 |
| **file-naming.js** | 文件名生成、冲突处理 |
| **download-queue.js** | 队列添加、优先级处理、任务执行 |

### 6.2 集成测试

| 场景 | 测试点 |
|:---|:---|
| **图片检测** | 检测准确性、实时更新 |
| **抽屉交互** | 打开/关闭、动画流畅度 |
| **单个下载** | 下载成功、文件命名 |
| **批量下载** | ZIP 打包、部分失败处理 |
| **错误处理** | 各种异常情况的提示 |

### 6.3 手动测试清单

- [ ] Gemini 页面加载后，图标正确显示
- [ ] 图片数量变化时，Badge 实时更新
- [ ] 抽屉打开/关闭动画流畅
- [ ] 缩略图加载正确
- [ ] 单个下载正常工作
- [ ] 批量下载正常工作（ZIP 打包）
- [ ] 文件命名冲突正确处理
- [ ] 下载进度状态显示正确
- [ ] 错误提示友好且可操作

---

## 七、风险评估 / Risk Assessment

| 风险 | 影响 | 缓解措施 |
|:---|:---|:---|
| **Gemini DOM 结构变化** | 检测失败 | 双重检测机制，定期更新选择器 |
| **CORS 限制** | 图片下载失败 | 使用 `credentials: include` |
| **大量图片性能** | 页面卡顿 | 限制显示数量（最多 10 张） |
| **浏览器兼容性** | 功能异常 | 仅支持 Chrome 最新稳定版 |

---

## 八、下一步 / Next Steps

1. ✅ **Plan 阶段完成**：技术方案已制定
2. ⏳ **进入开发阶段**：按照里程碑顺序实施
3. ⏳ **进入测试阶段**：功能测试和优化

---

> **文档状态**：Plan 完成，等待确认后进入开发阶段。

