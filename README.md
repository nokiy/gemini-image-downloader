# Gemini Image Downloader 🌌

> One-sentence project definition: A specialized Chrome extension to batch extract and download high-resolution AI-generated images from Google Gemini conversations. / 一款专门用于从 Google Gemini 对话中批量提取并下载高清 AI 生成图片的 Chrome 扩展程序。

---

## 🌿 Top-level Architecture / 顶层架构

本项目遵循 **分形文档协议 (Fractal Documentation Protocol)**，确保每个目录和文件都是自描述的。

- **`/docs`**: Governance & Roadmap / 治理与路线图
  - Contains PRD, technical specs, and architectural protocols. / 包含 PRD、技术规格和架构协议。
- **`/gemini-image-downloader`**: Extension Core (Source) / 扩展核心（源码）
  - The complete Manifest V3 extension logic and assets. / 完整的 Manifest V3 扩展逻辑与资源。

---

## 📦 Module Boundaries / 模块边界

扩展程序按功能职责进行模块化组织：

| 模块 (Module) | 职责 (Responsibility) | 位置 (Position) |
| :--- | :--- | :--- |
| **Background** | Lifecycle & Download management / 生命周期与下载管理 | Service Worker |
| **Content** | DOM Extraction & Page Interaction / DOM 提取与页面交互 | Content Script |
| **Popup** | User Orchestration & UI States / 用户编排与 UI 状态 | Browser Action |
| **Libs** | External dependencies (JSZip) / 外部依赖 (JSZip) | Utility Layer |

---

## 🔄 Fractal Sync Protocol / 分形同步协议

**任何修改必须遵循以下同步规则：**
1. **文件级 (File)**: 更新被修改源码文件的 3 行 `[IN]/[OUT]/[POS]` 头注释。
2. **文件夹级 (Folder)**: 更新所属目录的 `./.folder.md` 以反映结构或职责变化。
3. **全局级 (Global)**: 若模块边界或核心流程发生变化，同步更新本 `README.md`。

> 所有文档必须保持 **双语 (EN/CN)** 且 **精简 (描述 ≤3 行)**。

---

## 🚀 Quick Start / 快速开始

1. 在 Chrome 中将 `gemini-image-downloader` 文件夹加载为“已解压的扩展程序”。
2. 详细使用说明请参阅 [gemini-image-downloader/README.md](./gemini-image-downloader/README.md)。

---

> Trigger: When directory structure, module boundaries, or core flows change, README must be updated.
> 触发条件：当目录结构、模块边界或核心流程变化时，必须更新 README。
