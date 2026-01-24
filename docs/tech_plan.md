# Gemini Image Downloader - 技术规划与架构

> 📅 版本：v1.0  
> 📅 创建时间：2025-12-23

---

## 一、技术调研结论

通过浏览器分析 Gemini 页面，获得以下关键信息：

| 项目 | 结论 |
|------|------|
| **图片 URL 格式** | `https://lh3.googleusercontent.com/...=s1024-rj` |
| **高清版本获取** | 优先使用页面提供的原始图片 URL（部分图片转换 `=s0` 会导致 fetch 失败） |
| **图片选择器** | `img[src*="googleusercontent.com/gg-dl/"]` |
| **对话标题获取** | `.conversation.selected div` 元素 |

> 📌 技术可行性：**非常高**。无需模拟点击，直接读取页面图片 URL 即可获取高清图。

---

## 二、技术架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐   消息通信   ┌──────────────────────┐  │
│  │   Popup     │ ←─────────→ │   Content Script     │  │
│  │  (popup.js) │             │   (content.js)       │  │
│  └─────────────┘             └──────────────────────┘  │
│         │                              │               │
│         ↓                              ↓               │
│  ┌─────────────┐             ┌──────────────────────┐  │
│  │   JSZip     │             │    DOM 操作          │  │
│  │   打包下载   │             │    提取图片 URL      │  │
│  └─────────────┘             └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 通信流程

```
Popup                           Content Script
  │                                    │
  │ ── chrome.tabs.sendMessage ──────→ │
  │    { action: 'getImages' }         │
  │                                    │
  │ (无接收端时尝试脚本注入并重试)      │
  │                                    │
  │                              提取图片 URL
  │                              等待页面渲染（短时）
  │                              获取对话标题
  │                                    │
  │ ←── response ─────────────────────┤
  │    { images: [...], title: '...' } │
  │                                    │
  ↓
Fetch 图片 → JSZip 打包 → 触发下载
```

---

## 三、项目结构

```
gemini-image-downloader/
├── manifest.json          # Chrome 插件配置（Manifest V3）
├── popup/
│   ├── popup.html         # 弹出界面
│   ├── popup.css          # 弹出界面样式
│   └── popup.js           # 弹出界面逻辑
├── content/
│   └── content.js         # 内容脚本（提取页面图片）
├── libs/
│   └── jszip.min.js       # ZIP 打包库
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 四、核心模块实现

### 4.1 manifest.json

```json
{
  "manifest_version": 3,
  "name": "Gemini Image Downloader",
  "version": "1.0.0.0",
  "description": "一键批量下载 Gemini AI 生成的所有高清图片",
  "permissions": ["activeTab", "downloads", "scripting", "storage"],
  "host_permissions": [
    "https://gemini.google.com/*",
    "https://*.googleusercontent.com/*",
    "https://*.google.com/*"
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "background/service_worker.js"
  },
  "content_scripts": [{
    "matches": ["https://gemini.google.com/*"],
    "js": ["content/content.js"]
  }],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 4.2 content.js 核心逻辑

```javascript
// 提取所有 AI 生成的图片 URL
function extractImages() {
  const images = document.querySelectorAll('img[src*="googleusercontent.com"]');
  return Array.from(images)
    .filter(img => img.src.includes('/gg-dl/'))
    .map(img => img.src);
}

// 获取对话标题
function getChatTitle() {
  const el = document.querySelector('.conversation.selected div');
  return el?.innerText?.trim() || 'Gemini_Images';
}

// 监听来自 Popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getImages') {
    sendResponse({
      images: extractImages(),
      title: getChatTitle()
    });
  }
  return true;
});
```

### 4.3 popup.js 核心逻辑

```javascript
// 下载并打包图片
async function downloadAllImages() {
  // 1. 获取图片列表
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.tabs.sendMessage(tab.id, { action: 'getImages' });
  
  // 2. Fetch 并打包
  const zip = new JSZip();
  for (let i = 0; i < response.images.length; i++) {
    const res = await fetch(response.images[i]);
    const blob = await res.blob();
    const ext = res.headers.get('content-type')?.includes('jpeg') ? 'jpg' : 'png';
    zip.file(`${String(i + 1).padStart(2, '0')}.${ext}`, blob);
  }
  
  // 3. 生成 ZIP 并下载
  const content = await zip.generateAsync({ type: 'blob' });
  const filename = `Gemini_image.zip`;
  
  const url = URL.createObjectURL(content);
  chrome.downloads.download({ url, filename });
}
```

---

## 五、依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| JSZip | 3.10.1 | ZIP 打包 |

---

## 六、开发环境

| 环境 | 要求 |
|------|------|
| Chrome | 最新稳定版 |
| Manifest | V3 |
| 开发工具 | VS Code |
