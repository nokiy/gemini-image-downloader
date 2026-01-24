# 需求澄清文档：V2.0 功能 / Requirements Clarification: V2.0 Features

> 📅 澄清日期：2025-12-23  
> 📌 状态：需求已澄清，准备进入 Plan 阶段  
> ✅ 基于用户反馈的完整需求确认

---

## 一、已确认的需求 / Confirmed Requirements

### 1.1 图片展示限制

**规则：** 最多只展示 10 张图片，超过 10 张以后就不再展示。

**实现逻辑：**
```javascript
// 检测到图片后
const images = extractImages(); // 假设检测到 15 张
const displayImages = images.slice(0, 10); // 只取前 10 张
// 抽屉页显示：10 张缩略图
// 提示信息："检测到 15 张图片，显示前 10 张"
```

---

### 1.2 图片识别逻辑

**规则：** 只要在当前会话（Gemini）中检测到有图片格式存在即可显示图标。

**澄清：**
- ✅ 不要求"只有图片没有文字"
- ✅ 只要检测到图片就显示图标
- ✅ 图片和文字可以混合存在

**实现逻辑：**
```javascript
// content.js
function shouldShowIcon() {
  const images = extractImages();
  return images.length > 0; // 只要有图片就返回 true
}
```

---

### 1.3 图标显示与隐藏时机

#### 展示位置
- **位置**：图标位于 Gemini 页面中，与页面内容同一水平线
- **参考**：类似 Poe 或 Im-Writer 的图标位置

#### 触发逻辑
- **显示**：检测到有图片时展示
- **隐藏**：没有图片时消失
- **实时更新**：使用 MutationObserver 监听 DOM 变化

#### 下载状态
- **规则**：关闭抽屉后，只要任务还在下载中，就默认显示下载状态
- **实现**：在图标上显示下载进度或状态指示器

**实现逻辑：**
```javascript
// content.js
function updateIconVisibility() {
  const images = extractImages();
  const icon = document.getElementById('gemini-downloader-icon');
  
  if (images.length > 0) {
    icon.style.display = 'flex';
  } else {
    icon.style.display = 'none';
  }
}

// 监听 DOM 变化
const observer = new MutationObserver(() => {
  updateIconVisibility();
});
observer.observe(document.body, { childList: true, subtree: true });
```

---

### 1.4 任务处理逻辑

#### 队列管理
- **规则**：单个任务和批量下载任务视为不同的任务记录
- **实现**：使用任务队列管理所有下载任务

#### 优先级
- **规则**：如果批量下载任务先提交，单个下载任务后提交，则优先完成批量下载任务
- **逻辑**：FIFO（先进先出）+ 批量任务优先

**实现逻辑：**
```javascript
// background.js
const downloadQueue = [];
let isProcessing = false;

function addToQueue(task) {
  // 批量任务插入到队列前面
  if (task.type === 'batch') {
    downloadQueue.unshift(task);
  } else {
    downloadQueue.push(task);
  }
  processQueue();
}

async function processQueue() {
  if (isProcessing || downloadQueue.length === 0) return;
  
  isProcessing = true;
  const task = downloadQueue.shift();
  
  try {
    await executeDownload(task);
  } finally {
    isProcessing = false;
    processQueue(); // 处理下一个任务
  }
}
```

---

### 1.5 文件命名规则

#### 单张图片
- **格式**：`Gemini_Image.{ext}`
- **示例**：`Gemini_Image.png`

#### 多张图片（ZIP）
- **格式**：`Gemini_Image_{数量}.zip`
- **示例**：`Gemini_Image_5.zip`

#### 命名冲突处理
- **规则**：重名时在文件名后加数字后缀
- **示例**：
  - 第一次：`Gemini_Image_5.zip`
  - 第二次：`Gemini_Image_5_1.zip`
  - 第三次：`Gemini_Image_5_2.zip`

**实现逻辑：**
```javascript
function generateFilename(count, isZip = false) {
  if (isZip) {
    let filename = `Gemini_Image_${count}.zip`;
    let counter = 1;
    
    // 检查文件是否已存在（需要查询下载历史）
    while (fileExists(filename)) {
      filename = `Gemini_Image_${count}_${counter}.zip`;
      counter++;
    }
    return filename;
  } else {
    return `Gemini_Image.png`; // 单张图片
  }
}
```

---

### 1.6 下载方式

**规则：**
- **单张图片**：直接下载，不打包
- **多张图片（≥2）**：打包成 ZIP 下载

**实现逻辑：**
```javascript
async function downloadSelected(selectedImages) {
  if (selectedImages.length === 1) {
    // 单张：直接下载
    await downloadSingleImage(selectedImages[0]);
  } else {
    // 多张：打包下载
    await downloadAsZip(selectedImages);
  }
}
```

---

## 二、图片列表更新处理逻辑 / Image List Update Logic

### 2.1 什么是"图片列表更新"？

**场景说明：**

1. **新增图片**：用户在 Gemini 中继续对话，AI 生成了新的图片
2. **删除图片**：用户删除了对话中的某张图片
3. **页面刷新**：用户刷新了页面
4. **切换对话**：用户切换到另一个对话

### 2.2 更新处理方案

#### 方案 A：实时更新（推荐）

**逻辑：**
```javascript
// content.js
let currentImageUrls = new Set(); // 当前检测到的图片 URL 集合
let selectedImageUrls = new Set(); // 用户选中的图片 URL 集合

function updateImageList() {
  const newImages = extractImages();
  const newImageUrls = new Set(newImages.map(img => img.url));
  
  // 检测新增的图片
  const added = [...newImageUrls].filter(url => !currentImageUrls.has(url));
  
  // 检测删除的图片
  const removed = [...currentImageUrls].filter(url => !newImageUrls.has(url));
  
  // 更新当前列表
  currentImageUrls = newImageUrls;
  
  // 处理选中状态
  // 如果选中的图片被删除了，自动取消选中
  removed.forEach(url => {
    selectedImageUrls.delete(url);
  });
  
  // 如果抽屉是打开的，更新 UI
  if (isDrawerOpen) {
    renderImageList(newImages);
    updateSelectionUI();
  }
  
  // 更新图标显示
  updateIconVisibility();
}

// 监听 DOM 变化
const observer = new MutationObserver(() => {
  debounce(updateImageList, 500); // 防抖，500ms 内只执行一次
});
observer.observe(document.body, { childList: true, subtree: true });

// 定时刷新（防止遗漏）
setInterval(updateImageList, 5000); // 每 5 秒刷新一次
```

**处理规则：**
- ✅ **新增图片**：自动添加到列表（如果抽屉打开，立即显示）
- ✅ **删除图片**：自动从列表移除，如果已选中则自动取消选中
- ✅ **页面刷新**：重新检测所有图片，清空选择状态
- ✅ **切换对话**：清空当前列表和选择状态，重新检测新对话的图片

#### 方案 B：手动刷新

**逻辑：**
- 用户需要点击"刷新"按钮才能更新列表
- 更简单，但用户体验较差

**建议：采用方案 A（实时更新）**

---

## 三、抽屉交互方案 / Drawer Interaction Design

### 3.1 "丝滑"交互设计

#### 3.1.1 位置与尺寸

**位置：从右侧滑出**
```
┌─────────────────────────────────────┐
│                                     │
│   Gemini 页面内容                    │
│                                     │
│                          ┌─────────┤
│                          │ 抽屉页   │
│                          │ (320px)  │
│                          │          │
│                          │ 图片列表 │
│                          │          │
│                          └─────────┤
└─────────────────────────────────────┘
```

**尺寸规格：**
- **宽度**：320px（桌面端）/ 100vw - 40px（移动端）
- **高度**：100vh（全屏高度）
- **位置**：右侧，距离顶部 0px，距离右侧 0px
- **层级**：z-index: 999999（确保在最上层）

#### 3.1.2 动画效果

**打开动画：**
```css
/* 初始状态 */
.drawer {
  transform: translateX(100%); /* 完全隐藏在右侧 */
  opacity: 0;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 打开状态 */
.drawer.open {
  transform: translateX(0); /* 滑入 */
  opacity: 1;
}
```

**关闭动画：**
- 反向执行打开动画
- 持续时间：0.3 秒
- 缓动函数：`cubic-bezier(0.4, 0, 0.2, 1)`（Material Design 标准）

#### 3.1.3 关闭方式

**方式 1：点击外部区域（遮罩层）**
```javascript
// 添加半透明遮罩层
<div class="drawer-overlay" onclick="closeDrawer()"></div>

.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.3);
  z-index: 999998;
  animation: fadeIn 0.3s;
}
```

**方式 2：点击关闭按钮**
```html
<button class="drawer-close-btn" onclick="closeDrawer()">
  <svg>×</svg>
</button>
```

**方式 3：按 ESC 键**
```javascript
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isDrawerOpen) {
    closeDrawer();
  }
});
```

**方式 4：点击图标（切换）**
```javascript
// 点击图标时，如果抽屉已打开则关闭，否则打开
icon.addEventListener('click', () => {
  if (isDrawerOpen) {
    closeDrawer();
  } else {
    openDrawer();
  }
});
```

#### 3.1.4 布局结构

```
┌─────────────────────────────────┐
│ 抽屉头部（固定）                  │
│ ┌─────────────────────────────┐ │
│ │ 标题: "Gemini Images"       │ │
│ │ 数量: "5 张图片"             │ │
│ │ [批量下载] 按钮              │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ 图片列表（可滚动）                │
│ ┌─────────────────────────────┐ │
│ │ [缩略图1] [下载]            │ │
│ │ [缩略图2] [下载]            │ │
│ │ [缩略图3] [下载]            │ │
│ │ ...                         │ │
│ │ [缩略图10] [下载]           │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ 底部状态栏（固定，可选）           │
│ "检测到 15 张，显示前 10 张"     │
└─────────────────────────────────┘
```

#### 3.1.5 交互细节

**滚动行为：**
- 只有中间区域可滚动
- 头部和底部固定
- 滚动条样式：细且半透明

**响应式设计：**
```css
/* 移动端 */
@media (max-width: 768px) {
  .drawer {
    width: calc(100vw - 40px);
    max-width: 400px;
  }
}
```

**性能优化：**
- 使用 CSS `will-change: transform` 优化动画性能
- 使用 `transform` 而非 `left/right` 属性（GPU 加速）

---

## 四、常见异常处理情况 / Common Error Handling

### 4.1 图片加载失败

**场景：** 缩略图加载失败（404、网络错误、CORS 错误）

**处理方案：**
```javascript
// 显示占位图
<img 
  src={imageUrl} 
  onError={(e) => {
    e.target.src = 'data:image/svg+xml;base64,...'; // 占位图
    e.target.classList.add('image-error');
  }}
/>

// UI 提示
<div class="image-placeholder">
  <svg>图片图标</svg>
  <span>加载失败</span>
  <button onclick="retryLoad(imageUrl)">重试</button>
</div>
```

**用户操作：**
- 显示占位图
- 提供"重试"按钮
- 点击下载时仍可尝试下载原图

---

### 4.2 下载失败

**场景：** 单个图片下载失败（网络错误、权限错误、磁盘空间不足）

**处理方案：**
```javascript
async function downloadImage(url) {
  try {
    await chrome.downloads.download({ url, filename });
  } catch (error) {
    if (error.message.includes('permission')) {
      showError('下载失败：请检查浏览器下载权限');
    } else if (error.message.includes('disk')) {
      showError('下载失败：磁盘空间不足');
    } else {
      showError('下载失败：网络错误，请重试');
    }
    // 提供重试按钮
    showRetryButton(url);
  }
}
```

**用户操作：**
- 显示错误提示（Toast 或抽屉内状态栏）
- 提供"重试"按钮
- 记录失败原因

---

### 4.3 批量下载部分失败

**场景：** 批量下载 10 张图片，其中 3 张失败

**处理方案：**
```javascript
async function downloadBatch(images) {
  let successCount = 0;
  let failCount = 0;
  const failedImages = [];
  
  for (const image of images) {
    try {
      await downloadImage(image);
      successCount++;
    } catch (error) {
      failCount++;
      failedImages.push({ image, error });
    }
  }
  
  // 显示结果
  if (failCount === 0) {
    showSuccess(`成功下载 ${successCount} 张图片`);
  } else {
    showWarning(`已下载 ${successCount} 张，失败 ${failCount} 张`);
    // 提供"重试失败项"按钮
    showRetryFailedButton(failedImages);
  }
}
```

**用户操作：**
- 显示成功/失败数量
- 提供"重试失败项"功能
- 列出失败图片列表

---

### 4.4 ZIP 打包失败

**场景：** JSZip 打包失败（内存不足、文件过大）

**处理方案：**
```javascript
async function createZip(images) {
  try {
    const zip = new JSZip();
    // ... 添加文件
    const blob = await zip.generateAsync({ type: 'blob' });
    return blob;
  } catch (error) {
    if (error.message.includes('memory')) {
      showError('打包失败：图片过大，请减少选择数量');
    } else {
      showError('打包失败：请重试');
    }
    // 降级方案：逐个下载
    showFallbackOption('改为逐个下载？');
  }
}
```

**用户操作：**
- 显示错误提示
- 提供降级方案（改为逐个下载）
- 建议减少选择数量

---

### 4.5 图片检测失败

**场景：** 无法检测到图片（页面结构变化、网络问题）

**处理方案：**
```javascript
function extractImages() {
  try {
    // 尝试方法 1：DOM 选择器
    const images = findImagesByDOM();
    if (images.length > 0) return images;
    
    // 尝试方法 2：URL 模式匹配
    const images2 = findImagesByURL();
    if (images2.length > 0) return images2;
    
    // 都失败
    return [];
  } catch (error) {
    console.error('图片检测失败:', error);
    return [];
  }
}

// UI 提示
if (images.length === 0) {
  showHint('未检测到图片，请确认：\n1. 当前页面是 Gemini 对话\n2. 对话中包含 AI 生成的图片\n3. 图片已完全加载');
}
```

**用户操作：**
- 显示提示信息
- 提供"重新检测"按钮
- 说明可能的原因

---

### 4.6 权限错误

**场景：** 浏览器下载权限被拒绝

**处理方案：**
```javascript
chrome.downloads.download({ url, filename }, (downloadId) => {
  if (chrome.runtime.lastError) {
    if (chrome.runtime.lastError.message.includes('permission')) {
      showError('下载失败：请允许浏览器下载文件');
      // 引导用户到设置页面
      showGuide('chrome://settings/downloads');
    }
  }
});
```

**用户操作：**
- 显示错误提示
- 引导用户到浏览器设置页面
- 说明如何开启下载权限

---

### 4.7 网络超时

**场景：** 图片下载超时（网络慢、服务器响应慢）

**处理方案：**
```javascript
async function downloadWithTimeout(url, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'include'
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      showError('下载超时：请检查网络连接');
      showRetryButton(url);
    }
    throw error;
  }
}
```

**用户操作：**
- 显示超时提示
- 提供"重试"按钮
- 建议检查网络连接

---

## 五、异常处理总结 / Error Handling Summary

| 异常类型 | 处理方式 | 用户操作 |
|:---|:---|:---|
| **图片加载失败** | 显示占位图 | 重试 / 直接下载 |
| **下载失败** | 错误提示 | 重试 / 检查权限 |
| **批量部分失败** | 显示成功/失败数量 | 重试失败项 |
| **ZIP 打包失败** | 错误提示 | 降级方案 / 减少数量 |
| **检测失败** | 提示信息 | 重新检测 |
| **权限错误** | 错误提示 | 引导到设置 |
| **网络超时** | 超时提示 | 重试 / 检查网络 |

---

## 六、需要您确认的异常处理 / Error Handling Confirmation

请确认以下异常处理方案是否符合您的预期：

1. **图片加载失败**：显示占位图 + 重试按钮 ✅
2. **下载失败**：错误提示 + 重试按钮 ✅
3. **批量部分失败**：显示数量 + 重试失败项 ✅
4. **ZIP 打包失败**：错误提示 + 降级方案（逐个下载）✅
5. **检测失败**：提示信息 + 重新检测按钮 ✅
6. **权限错误**：错误提示 + 引导到设置 ✅
7. **网络超时**：超时提示 + 重试按钮 ✅

**如有需要调整的地方，请告知。**

---

> **状态**：需求已完全澄清，等待确认异常处理方案后，即可进入 Plan 阶段。

