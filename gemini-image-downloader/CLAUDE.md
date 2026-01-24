# Folder: gemini-image-downloader

> Trigger: When this folder's structure/responsibilities/file list changes, update this document.
> 触发条件：当本文件夹的结构/职责/文件列表变化时，更新此文档。

Chrome extension root directory / Chrome 扩展根目录
Contains manifest, assets, libraries and core source code / 包含清单、资源、库和核心源代码
Adheres to the project's fractal documentation architecture / 遵循项目的分形文档架构

**Version**: 1.2.0.25
**Features**: Batch download, fullscreen preview, watermark removal / 批量下载、全屏预览、去水印

## Development Notes
- Code changes must preserve existing behavior; avoid regressions. / 修改代码必须以不破坏原有功能为前提，避免回归。
- Commits must use Chinese messages. / 提交信息必须使用中文。
- Choose branch prefix by change type (e.g., fix/ for bugfixes). / 按类型选择分支前缀（例如修复用 fix/）。
- Components: content scripts (selectors, logger, state, detection, UI, preview), utils (watermark remover), background (service worker), popup. / 组件：内容脚本（选择器、日志、状态、检测、UI、预览）、工具（去水印）、后台（Service Worker）、弹窗。

## Files
- `manifest.json`: Extension entry point and configuration (v1.2.0.25) / 扩展入口点和配置
- `README.md`: Extension-specific documentation / 扩展专用文档
- `src/`: Core logic and UI source code (background, content, popup, utils) / 核心逻辑和 UI 源代码（后台、内容、弹窗、工具）
- `icons/`: Image assets for the extension / 扩展的图像资源
- `libs/`: Third-party library dependencies (JSZip) / 第三方库依赖 (JSZip)

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
