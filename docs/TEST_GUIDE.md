# 测试指南 - v1.1.0.9

## 🧪 测试懒加载缩略图功能

### 步骤1：重新加载扩展
1. 打开 `chrome://extensions`
2. 找到 "Gemini Image Downloader"
3. 点击刷新按钮（🔄）

### 步骤2：测试懒加载
1. 打开 Gemini 页面：https://gemini.google.com
2. 生成多张图片（建议5-10张）
3. 点击扩展图标，打开抽屉
4. **观察行为：**
   - 初始应该看到占位符（灰色背景 + 加载动画）
   - 滚动列表时，图片应该按需加载
   - 加载成功的图片会平滑淡入显示
   - 控制台应该看到图片加载日志

### 步骤3：验证懒加载效果
在控制台执行：
```javascript
// 查看有多少图片正在懒加载
document.querySelectorAll('.gid-lazy-image[data-src]').length

// 查看有多少图片已加载
document.querySelectorAll('.gid-lazy-image.gid-image-loaded').length
```

---

## 🔍 测试错误日志系统

### 步骤1：查看错误日志模块
在控制台执行：
```javascript
// 检查模块是否加载
window.GeminiImageErrorLogger

// 查看错误统计
window.GeminiImageErrorLogger.getErrorStats().then(console.log)

// 查看所有错误日志
window.GeminiImageErrorLogger.getErrorLogs().then(console.log)
```

### 步骤2：模拟错误场景

#### 测试1：网络错误
- 在控制台执行：
```javascript
// 模拟图片加载失败
window.GeminiImageErrorLogger.logNetworkError(
  new Error('Network timeout'),
  { url: 'https://example.com/test.jpg', type: 'test' }
);
```

#### 测试2：下载错误
- 尝试下载一张不存在的图片
- 或断开网络后尝试下载

#### 测试3：UI错误
```javascript
// 模拟UI渲染错误
window.GeminiImageErrorLogger.logUIError(
  new Error('Render failed'),
  { context: 'test', component: 'image-list' }
);
```

### 步骤3：查看错误记录
```javascript
// 获取错误统计
const stats = await window.GeminiImageErrorLogger.getErrorStats();
console.table(stats.byCategory); // 按分类查看错误数量

// 查看最近10条错误
stats.recent.forEach(err => {
  console.log(`[${err.category}] ${err.message}`, err.timestamp);
});

// 按分类查看
const downloadErrors = await window.GeminiImageErrorLogger.getErrorLogsByCategory('download');
console.log('下载错误:', downloadErrors);
```

### 步骤4：清除错误日志（可选）
```javascript
await window.GeminiImageErrorLogger.clearErrorLogs();
console.log('错误日志已清除');
```

---

## ✅ 预期结果

### 懒加载功能：
- ✅ 初始只显示占位符，不加载图片
- ✅ 滚动时图片按需加载
- ✅ 加载有平滑的淡入动画
- ✅ 加载失败时显示错误提示

### 错误日志功能：
- ✅ 所有错误都会被自动记录
- ✅ 错误按分类存储
- ✅ 可以通过API查询和统计
- ✅ 最多保存100条错误日志
- ✅ 全局错误会被自动捕获

---

## 🐛 常见问题排查

### 问题1：图片没有懒加载
**检查：**
- 控制台是否有错误信息
- 浏览器是否支持 IntersectionObserver
- 执行：`'IntersectionObserver' in window`

### 问题2：错误日志未记录
**检查：**
- error-logger.js 是否正确加载（应该在 manifest 第一行）
- 控制台执行：`typeof window.GeminiImageErrorLogger`
- 应该返回 "object"

### 问题3：占位符一直显示
**检查：**
- 网络连接是否正常
- 图片URL是否有效
- 查看控制台是否有图片加载错误

---

## 📊 性能检查

### 检查内存使用：
1. 打开 Chrome DevTools → Performance
2. 记录页面加载过程
3. 查看内存使用情况
4. **预期：** 懒加载应该显著减少初始内存占用

### 检查网络请求：
1. 打开 Chrome DevTools → Network
2. 过滤：Img
3. 打开抽屉
4. **预期：** 初始只有可见的图片请求，滚动时才加载更多

---

## 🎯 快速测试脚本

在控制台一次性执行完整测试：

```javascript
(async function testGID() {
  console.log('🧪 开始测试 Gemini Image Downloader v1.1.0.9\n');
  
  // 1. 检查模块
  console.log('1️⃣ 检查模块加载：');
  console.log('  ErrorLogger:', typeof window.GeminiImageErrorLogger);
  console.log('  State:', typeof window.GeminiImageState);
  console.log('  Detection:', typeof window.GeminiImageDetection);
  console.log('  UI:', typeof window.GeminiImageUI);
  
  // 2. 检查懒加载
  console.log('\n2️⃣ 检查懒加载：');
  const lazyImages = document.querySelectorAll('.gid-lazy-image[data-src]');
  const loadedImages = document.querySelectorAll('.gid-lazy-image.gid-image-loaded');
  console.log(`  未加载: ${lazyImages.length}`);
  console.log(`  已加载: ${loadedImages.length}`);
  
  // 3. 检查错误日志
  console.log('\n3️⃣ 检查错误日志：');
  if (window.GeminiImageErrorLogger) {
    const stats = await window.GeminiImageErrorLogger.getErrorStats();
    console.log(`  总错误数: ${stats.total}`);
    console.log('  分类统计:', stats.byCategory);
  }
  
  console.log('\n✅ 测试完成！');
})();
```

