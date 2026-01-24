# Folder: src

> Trigger: When this folder's structure/responsibilities/file list changes, update this document.
> 触发条件：当本文件夹的结构/职责/文件列表变化时，更新此文档。

Core extension source code containing logic and UI / 包含逻辑和 UI 的扩展核心源代码
Organized into background service, content scripts, config, utils, and popup interface / 组织为后台服务、内容脚本、配置、工具和弹窗界面
All source files follow fractal documentation protocol with header comments / 所有源文件遵循带头注释的分形文档协议

## Files
- `background/`: Service worker for download lifecycle and ZIP packaging / 用于下载生命周期和 ZIP 打包的服务工作器
- `content/`: Content scripts for page interaction, image detection, and UI rendering / 用于页面交互、图片检测和 UI 渲染的内容脚本
- `config/`: Centralized DOM selectors and URL patterns configuration / 集中式 DOM 选择器和 URL 模式配置
- `utils/`: Shared utilities including unified logging layer / 共享工具，包括统一日志层
- `popup/`: User interface and download orchestration / 用户界面和下载编排

