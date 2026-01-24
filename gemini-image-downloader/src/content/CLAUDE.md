# Folder: src/content

> Trigger: When this folder's structure/responsibilities/file list changes, update this document.
> 触发条件：当本文件夹的结构/职责/文件列表变化时，更新此文档。

Content scripts injected into Gemini pages for image detection, UI rendering and preview / 注入到 Gemini 页面的内容脚本用于图片检测、UI 渲染和预览
Provides floating icon, drawer UI, error log panel, preview panel, and thumbnail list for image management / 提供悬浮图标、抽屉 UI、错误日志面板、预览面板和缩略图列表用于图片管理
Communicates with popup and background service worker via Chrome runtime messaging / 通过 Chrome 运行时消息与弹窗和后台服务工作器通信

## Files
- `error-logger.js`: Error tracking and reporting system with chrome.storage persistence / 错误追踪与上报系统（chrome.storage 持久化）
- `content.js`: Entry point, module initialization, popup bridge (ping/getImages) / 入口、模块初始化、弹窗通信（ping/getImages）
- `detection.js`: Dual detection mechanism (DOM + URL pattern), selector array support / 双重检测机制（DOM + URL 模式），支持选择器数组
- `state.js`: State management (images, selection, download status, watermark toggle) / 状态管理（图片、选择、下载状态、去水印开关）
- `preview.js`: Fullscreen preview panel with keyboard navigation and watermark removal toggle / 全屏预览面板，支持键盘导航和去水印开关
- `ui.js`: UI rendering (icon, drawer, thumbnail list, error log panel, preview button, watermark toggle, batch watermark download) / UI 渲染（图标、抽屉、缩略图列表、错误日志面板、预览按钮、去水印开关、批量去水印下载）
- `ui.css`: UI styling with CSS variables, animations, error panel, preview panel and watermark toggle styles / 带 CSS 变量、动画、错误面板、预览面板和去水印开关样式的 UI 样式

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
