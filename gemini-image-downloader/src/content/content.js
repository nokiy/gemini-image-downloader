// [IN]: Modules (State, Detection, UI) / 模块（状态、检测、UI）
// [OUT]: Bootstrapped extension / 已启动的扩展
// [POS]: src/content/content.js - Entry point / 入口点
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

(function() {
  if (window.__geminiImageDownloaderInjected) {
    return;
  }
  window.__geminiImageDownloaderInjected = true;

  console.log('[GID] Initializing v1.1.0.0...');

  // 1. 初始化 UI
  if (window.GeminiImageUI && window.GeminiImageUI.initUI) {
    window.GeminiImageUI.initUI();
    console.log('[GID] UI module initialized');
  } else {
    console.error('[GID] UI module not found');
  }

  // 2. 初始化检测
  if (window.GeminiImageDetection && window.GeminiImageState) {
    const { detectImages, setupObserver } = window.GeminiImageDetection;
    const { updateImages } = window.GeminiImageState;

    // 立即执行一次检测
    const initialImages = detectImages();
    console.log('[GID] Initial detection:', initialImages.length, 'images');
    updateImages(initialImages);

    // 设置 MutationObserver 持续监听
    setupObserver((images) => {
      console.log('[GID] Observer detected:', images.length, 'images');
      updateImages(images);
    });
  } else {
    console.error('[GID] Detection or State module not found');
  }

  console.log('[GID] Initialized successfully');
})();
