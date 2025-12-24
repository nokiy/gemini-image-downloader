# Gemini Image Downloader

一键批量下载 Gemini AI 生成的所有高清图片，打包成 ZIP 文件保存到本地。

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)

---

## ✨ 功能特性

- 🖼️ **一键下载** - 点击即可下载当前对话所有图片
- 🔍 **自动检测** - 智能识别 AI 生成的图片
- 📦 **ZIP 打包** - 自动打包成一个 ZIP 文件
- 🎨 **高清原图** - 自动获取最高分辨率版本
- 📝 **智能命名** - 按对话标题 + 时间戳命名

---

## 📥 安装方法

### 开发者模式安装

1. 下载本项目到本地
2. 打开 Chrome 浏览器，进入 `chrome://extensions/`
3. 开启右上角「**开发者模式**」
4. 点击「**加载已解压的扩展程序**」
5. 选择 `gemini-image-downloader` 文件夹
6. 安装完成！🎉

---

## 🚀 使用方法

1. 打开 [Gemini](https://gemini.google.com/app)
2. 让 AI 生成一些图片
3. 点击浏览器工具栏中的插件图标
4. 点击「**下载所有图片**」按钮
5. ZIP 文件将自动下载到您的下载目录

---

## 📁 文件命名规则

### ZIP 文件
```
Gemini_image.zip
```

### 图片文件
```
01.{ext}, 02.{ext}, 03.{ext} ...
```
ext 根据实际图片类型确定（png/jpg/webp 等）

---

## ⚠️ 注意事项

- 仅在 `gemini.google.com` 网站上有效
- 需要先登录 Google 账号
- 仅下载 AI 生成的图片，不包括用户上传的图片

---

## 🛠️ 技术栈

- Chrome Extension Manifest V3
- Vanilla JavaScript
- JSZip (ZIP 打包)

---

## 📄 许可证

MIT License
