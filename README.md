# Gemini Image Downloader 🌌

> One-sentence project definition: A specialized Chrome extension to batch extract and download high-resolution AI-generated images from Google Gemini conversations. / 一款专门用于从 Google Gemini 对话中批量提取并下载高清 AI 生成图片的 Chrome 扩展程序。

**Current Version:** 1.1.0.16

---

## 🌿 Top-level Architecture / 顶层架构

本项目遵循 **分形文档协议 (Fractal Documentation Protocol)**，确保每个目录和文件都是自描述的。

```
Gemini_image/
├── README.md                    # This file - Project overview / 项目概览
├── CLAUDE.md                    # AI assistant guidance / AI 助手指南
├── docs/                        # Governance & Roadmap / 治理与路线图
│   ├── prd.md                   # Product Requirements / 产品需求
│   ├── spec.md                  # Functional Specification / 功能规格
│   ├── tech_plan.md             # Technical Plan / 技术计划
│   └── fractal-documentation-architecture.md  # Doc Protocol (MUST READ) / 文档协议
└── gemini-image-downloader/     # Extension Core / 扩展核心
    ├── manifest.json            # Extension entry point / 扩展入口
    ├── src/                     # Source code / 源代码
    │   ├── background/          # Service Worker / 后台服务
    │   ├── content/             # Content Scripts / 内容脚本
    │   ├── config/              # Selectors & Patterns / 选择器配置
    │   ├── utils/               # Shared Utilities / 共享工具
    │   └── popup/               # Extension Popup / 弹窗界面
    ├── icons/                   # Extension icons / 扩展图标
    └── libs/                    # Third-party libs (JSZip) / 第三方库
```

---

## 📦 Module Boundaries / 模块边界

扩展程序按功能职责进行模块化组织：

| 模块 (Module) | 职责 (Responsibility) | 位置 (Position) |
| :--- | :--- | :--- |
| **Background** | Lifecycle & Download management, ZIP packaging / 生命周期与下载管理、ZIP 打包 | Service Worker |
| **Content** | DOM Extraction, Image Detection & Page UI / DOM 提取、图片检测与页面 UI | Content Script |
| **Config** | Centralized selectors & URL patterns / 集中式选择器与 URL 模式 | Configuration |
| **Utils** | Unified logging & shared utilities / 统一日志与共享工具 | Utility Layer |
| **Popup** | User Orchestration & UI States / 用户编排与 UI 状态 | Browser Action |
| **Libs** | External dependencies (JSZip) / 外部依赖 (JSZip) | Vendor |

---

## 🔄 Fractal Sync Protocol / 分形同步协议

**任何修改必须遵循以下同步规则：**
1. **文件级 (File)**: 更新被修改源码文件的 `[IN]/[OUT]/[POS]` 头注释 + Protocol 行。
2. **文件夹级 (Folder)**: 更新所属目录的 `.folder.md` 以反映结构或职责变化。
3. **全局级 (Global)**: 若模块边界或核心流程发生变化，同步更新本 `README.md`。

> 所有文档必须保持 **双语 (EN/CN)** 且 **精简 (描述 ≤3 行)**。
> 详见 [docs/fractal-documentation-architecture.md](./docs/fractal-documentation-architecture.md)

---

## 🚀 Quick Start / 快速开始

### Installation / 安装

1. 克隆或下载本仓库
2. 在 Chrome 中打开 `chrome://extensions`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"，选择 `gemini-image-downloader` 文件夹

### Usage / 使用

1. 访问 [gemini.google.com](https://gemini.google.com)
2. 与 Gemini 对话生成图片
3. 点击扩展图标或页面内悬浮按钮
4. 选择图片并下载（单张或 ZIP 批量）

详细说明请参阅 [gemini-image-downloader/README.md](./gemini-image-downloader/README.md)

---

## 📚 Key Documentation / 关键文档

| 文档 | 用途 |
| :--- | :--- |
| [CLAUDE.md](./CLAUDE.md) | AI 助手开发指南，包含调试命令 |
| [docs/fractal-documentation-architecture.md](./docs/fractal-documentation-architecture.md) | 分形文档协议（修改代码前必读） |
| [docs/spec.md](./docs/spec.md) | 功能规格说明 |
| [docs/TEST_GUIDE.md](./docs/TEST_GUIDE.md) | 测试指南 |
| [docs/changelog.md](./docs/changelog.md) | 版本历史 |

---

> Trigger: When directory structure, module boundaries, or core flows change, README must be updated.
> 触发条件：当目录结构、模块边界或核心流程变化时，必须更新 README。
