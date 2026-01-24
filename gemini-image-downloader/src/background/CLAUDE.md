# Folder: src/background

> Trigger: When this folder's structure/responsibilities/file list changes, update this document.
> 触发条件：当本文件夹的结构/职责/文件列表变化时，更新此文档。

Service worker for download management and file operations / 用于下载管理和文件操作的服务工作器
Handles single/batch downloads with queue management / 处理带队列管理的单个/批量下载
Uses Chrome downloads API and JSZip for ZIP packaging / 使用 Chrome 下载 API 和 JSZip 进行 ZIP 打包
Provides cross-origin image fetching for watermark removal / 提供跨域图片获取用于去水印功能

## Files
- `service_worker.js`: Entry point, message handlers, download execution, fetchImageForWatermark / 入口、消息处理器、下载执行、为去水印获取图片
- `download-queue.js`: Download queue management with priority / 带优先级的下载队列管理
- `file-naming.js`: Filename generation and conflict resolution / 文件名生成和冲突处理

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
