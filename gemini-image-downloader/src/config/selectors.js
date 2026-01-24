// [IN]: None / 无
// [OUT]: GeminiSelectors config object / 选择器配置对象
// [POS]: src/config/selectors.js - Centralized selector management / 选择器集中管理
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

/**
 * Gemini Image Downloader - Selector Configuration
 *
 * 所有 DOM 选择器集中管理于此文件
 * 当 Gemini 页面更新时，只需修改这里的配置
 *
 * @version 2026-01-v2 (Gemini 页面版本 - 更新下载按钮选择器)
 */

window.GeminiSelectors = {
  // 当前配置版本（便于调试和版本追踪）
  version: '2026-01-v3',

  // ===== 图片检测相关选择器 =====
  detection: {
    // 下载按钮（Gemini 原生）- 2026年1月更新
    // 新版 Gemini 使用 aria-label 而非 data-test-id
    downloadButton: [
      'button[aria-label*="Download full size"]',
      'button[aria-label*="下载全尺寸"]',
      'button[aria-label*="Download"]',
      'download-generated-image-button button[data-test-id="download-generated-image-button"]',
      'button[data-test-id="download-generated-image-button"]'
    ],

    // 当前对话内容容器（用于限制检测范围）
    conversationRoot: [
      'main',
      '[role="main"]',
      '[data-test-id*="conversation"]',
      '[data-test-id*="chat"]',
      '[data-test-id*="response"]'
    ],

    // 图片容器标签（按优先级顺序）
    imageContainers: [
      'generated-image',
      'single-image',
      '[class*="image-container"]',
      '[class*="generated"]'
    ],

    // 容器内的图片（多种选择器）
    containerImage: [
      'img.image',
      'img[alt*="Image of"]',
      'img[src*="googleusercontent.com"]',
      'img[srcset*="googleusercontent.com"]',
      'img[data-src*="googleusercontent.com"]',
      'img[data-srcset*="googleusercontent.com"]'
    ],

    // 通过 URL 模式检测的图片
    googleImage: 'img[src*="googleusercontent.com"], img[srcset*="googleusercontent.com"], img[data-src*="googleusercontent.com"], img[data-srcset*="googleusercontent.com"]',

    // 排除的元素：头像父容器
    avatarParent: '[data-participant-id]',

    // 排除的元素：上传的图片预览
    uploadedImagePreview: 'img[alt*="Uploaded image"]'
  },

  // ===== URL 模式匹配 =====
  urlPatterns: {
    // Google 内容服务器域名
    googleContent: 'googleusercontent.com',
    
    // AI 生成图片路径特征
    generatedImage: '/gg-dl/',
    
    // 头像路径特征
    avatar: '/a/'
  },

  // ===== UI 注入相关选择器 =====
  ui: {
    // 用户头像按钮（用于定位导航栏，按优先级顺序）
    userAvatar: [
      '[data-test-id="user-menu-button"]',
      'button[aria-label*="Google Account"]',
      'button[aria-label*="Google 账号"]',
      'button[aria-label*="Google 帐号"]',
      'button[aria-label*="Account"]',
      'button[aria-label*="帐号"]',
      'button[aria-label*="账号"]',
      'button img[alt*="Profile"]',
      'button img[alt*="头像"]',
      'header button:has(img[src*="googleusercontent"])',
      'header button:last-child',
      '[data-idom-class*="user"]'
    ],

    // 导航栏定位选择器（按优先级顺序，2026年更新）
    navbar: [
      'header [role="toolbar"]',
      'header [role="navigation"]',
      '[data-test-id="header-actions"]',
      '[data-test-id="upgrade-button"]',
      'button[aria-label*="Invite"]',
      'button[aria-label*="邀请"]',
      'header nav',
      'header > div:last-child',
      'header > div > div:last-child',
      '.header-actions',
      '.toolbar-actions',
      'header [class*="actions"]',
      'header [class*="toolbar"]',
      'header [class*="right"]'
    ],

    // 导航栏内的用户头像（用于图标插入位置）
    navbarUserAvatar: [
      '[data-test-id="user-menu-button"]',
      'button[aria-label*="Account"]',
      'button[aria-label*="账号"]',
      '.user-avatar',
      'img[alt*="Profile"]',
      'header button:last-child'
    ],
    
    // 页面头部
    header: 'header',
    
    // 头部按钮
    headerButtons: 'header button',
    
    // 头部直接子 div
    headerChildren: ':scope > div'
  },

  // ===== 扩展自身的 UI 元素 ID =====
  extension: {
    iconId: 'gemini-downloader-icon',
    drawerId: 'gemini-downloader-drawer',
    overlayId: 'gemini-downloader-overlay'
  },

  // ===== 图片尺寸阈值 =====
  thresholds: {
    // 最小生成图片尺寸（低于此值视为图标）
    minGeneratedSize: 200,
    
    // 最大图标尺寸（高于此值不是图标）
    maxIconSize: 120
  }
};

/**
 * 获取选择器配置
 * @param {string} category - 分类名（detection / urlPatterns / ui / extension）
 * @returns {Object} 选择器配置对象
 */
window.getGeminiSelectors = function(category) {
  if (category && window.GeminiSelectors[category]) {
    return window.GeminiSelectors[category];
  }
  return window.GeminiSelectors;
};

/**
 * 调试工具：测试选择器是否有效
 * @param {string} selector - CSS 选择器
 * @returns {Object} 测试结果
 */
window.testGeminiSelector = function(selector) {
  try {
    const elements = document.querySelectorAll(selector);
    return {
      selector,
      found: elements.length,
      elements: Array.from(elements)
    };
  } catch (e) {
    return {
      selector,
      error: e.message
    };
  }
};

console.log('[GID] Selectors config loaded, version:', window.GeminiSelectors.version);
