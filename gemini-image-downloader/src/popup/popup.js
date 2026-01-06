// [IN]: Chrome tabs/scripting/downloads APIs, JSZip library, DOM APIs / Chrome 标签页/脚本/下载 API、JSZip 库、DOM API
// [OUT]: UI flow, full content injection fallback (JS/CSS), ZIP file generation / UI 流程、完整内容注入兜底（JS/CSS）、ZIP 文件生成
// [POS]: src/popup/popup.js - UI orchestration layer for user interaction / 用于用户交互的 UI 编排层
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

// DOM 元素
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('statusText');
const downloadBtn = document.getElementById('downloadBtn');
const hintEl = document.getElementById('hint');
const retryBtn = document.getElementById('retryBtn');
const elementsReady = statusEl && statusTextEl && downloadBtn && hintEl && retryBtn;

// 状态数据
let imageData = null;
let isRequesting = false;
let autoPollToken = 0;
let autoPollActive = false;

const RETRY_LIMIT = 3;
const RETRY_BASE_DELAY_MS = 300;
const WAIT_IMAGES_MS = 2000;
const MESSAGE_TIMEOUT_MS = WAIT_IMAGES_MS + 700;
const PING_TIMEOUT_MS = 800;
const INJECT_DELAY_MS = 200;
const AUTO_POLL_INTERVAL_MS = 2000;
const AUTO_POLL_MAX_MS = 10000;
const AUTO_POLL_MAX_SECONDS = Math.floor(AUTO_POLL_MAX_MS / 1000);
const RENAME_RETRY_DELAY_MS = 600;
const MAX_RENAME_ATTEMPTS = 4;
const DOWNLOAD_FILENAME = 'Gemini_image.zip';
const CONTENT_SCRIPT_FILES = [
    'src/config/selectors.js',
    'src/content/error-logger.js',
    'src/utils/logger.js',
    'src/content/state.js',
    'src/content/detection.js',
    'src/content/ui.js',
    'src/content/content.js'
];
const CONTENT_STYLE_FILES = ['src/content/ui.css'];
const MIME_EXTENSION_MAP = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg'
};

// 初始化
if (!elementsReady) {
    console.warn('[Popup] Missing required DOM elements');
} else {
    document.addEventListener('DOMContentLoaded', () => init({ manual: false }));
    retryBtn.addEventListener('click', () => init({ manual: true }));
}

async function init({ manual = false } = {}) {
    if (isRequesting) return;

    const pollToken = startNewPollCycle();
    isRequesting = true;
    imageData = null;
    downloadBtn.disabled = true;
    downloadBtn.classList.remove('loading');
    retryBtn.disabled = true;
    setStatus('', '🔍', manual ? '正在重新检测...' : '正在检测图片...');
    hintEl.textContent = '';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.url?.includes('gemini.google.com')) {
            setStatus('warning', '⚠️', '请在 Gemini 页面使用');
            hintEl.textContent = '仅支持 gemini.google.com';
            return;
        }

        const readiness = await ensureContentScript(tab.id);

        if (!readiness.ready) {
            const error = readiness.error || createError('no_receiver', 'not ready');
            const statusType = getErrorStatusType(error);
            if (statusType === 'warning') {
                startAutoPoll(tab.id, pollToken);
                return;
            }
            setStatus(statusType, statusType === 'warning' ? '⏳' : '❌', getFriendlyErrorMessage(error), { showRetry: true });
            hintEl.textContent = '请稍后再试';
            return;
        }

        const response = await requestImagesWithRetry(tab.id);

        if (!response || !response.success) {
            throw createError('invalid_response', 'invalid response');
        }

        imageData = response;

        if (response.count > 0) {
            setStatus('success', '✅', `找到 ${response.count} 张图片`);
            downloadBtn.disabled = false;
            hintEl.textContent = `对话：${truncateTitle(response.title, 20)}`;
            autoPollActive = false;
        } else {
            startAutoPoll(tab.id, pollToken);
            return;
        }
    } catch (error) {
        const statusType = getErrorStatusType(error);
        if (statusType === 'warning') {
            console.warn('[Popup] Init warning:', error);
        } else {
            console.error('[Popup] Init error:', error);
        }
        setStatus(statusType, statusType === 'warning' ? '⏳' : '❌', getFriendlyErrorMessage(error), { showRetry: true });
        hintEl.textContent = statusType === 'warning' ? '请稍后再试' : '点击「重新检测」或稍后再试';
    } finally {
        retryBtn.disabled = false;
        isRequesting = false;
    }
}

function setStatus(type, icon, text, { showRetry = false } = {}) {
    statusEl.className = `status${type ? ` ${type}` : ''}`;
    statusEl.querySelector('.status-icon').textContent = icon;
    statusTextEl.textContent = text;
    retryBtn.hidden = !showRetry;
}

function truncateTitle(title, maxLength) {
    if (!title) return 'Gemini_Images';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
}

function getBasename(pathname) {
    if (!pathname) return '';
    return pathname.split(/[/\\]/).pop() || '';
}

function getExtensionFromContentType(contentType) {
    if (!contentType) return null;
    const type = contentType.split(';')[0].trim().toLowerCase();
    if (!type) return null;
    if (MIME_EXTENSION_MAP[type]) return MIME_EXTENSION_MAP[type];
    if (type.startsWith('image/')) return type.split('/')[1];
    return null;
}

function getExtensionFromUrl(url) {
    if (!url) return null;
    try {
        const pathname = new URL(url).pathname;
        const match = pathname.match(/\.([a-z0-9]+)$/i);
        return match ? match[1].toLowerCase() : null;
    } catch {
        return null;
    }
}

function trackDownload(downloadId, filename) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'trackDownload', downloadId, filename }, (response) => {
            if (chrome.runtime.lastError) {
                resolve(false);
                return;
            }
            resolve(Boolean(response?.ok));
        });
    });
}

function downloadWithDownloadsApi(url, filename) {
    return new Promise((resolve) => {
        chrome.downloads.download({
            url: url,
            filename: filename,
            conflictAction: 'uniquify',
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError || !downloadId) {
                resolve({ ok: false, error: chrome.runtime.lastError || new Error('download failed') });
                return;
            }
            ensureDownloadFilename(downloadId, filename);
            trackDownload(downloadId, filename);
            resolve({ ok: true, downloadId });
        });
    });
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('read failed'));
        reader.readAsDataURL(blob);
    });
}

async function triggerZipDownload(blob, filename) {
    let lastError = null;
    const objectUrl = URL.createObjectURL(blob);

    try {
        const result = await downloadWithDownloadsApi(objectUrl, filename);
        if (result.ok) return true;
        lastError = result.error;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }

    try {
        const dataUrl = await blobToDataUrl(blob);
        const result = await downloadWithDownloadsApi(dataUrl, filename);
        if (result.ok) return true;
        lastError = result.error;
    } catch (error) {
        lastError = error;
    }

    console.warn('[Popup] Download failed:', lastError);
    return false;
}

function ensureDownloadFilename(downloadId, expectedFilename) {
    if (!downloadId || !expectedFilename) return;

    let attempts = 0;
    const tryRename = () => {
        attempts += 1;
        chrome.downloads.search({ id: downloadId }, (items) => {
            const item = items && items[0];
            if (!item) return;

            const currentBase = getBasename(item.filename);
            if (currentBase === expectedFilename) return;

            if (item.state && item.state !== 'complete') {
                if (attempts < MAX_RENAME_ATTEMPTS) {
                    setTimeout(tryRename, RENAME_RETRY_DELAY_MS);
                }
                return;
            }

            chrome.downloads.rename(downloadId, { filename: expectedFilename }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('[Popup] Rename failed:', chrome.runtime.lastError);
                }
            });
        });
    };

    tryRename();
}

if (elementsReady) {
    downloadBtn.addEventListener('click', downloadAllImages);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function startNewPollCycle() {
    autoPollToken += 1;
    autoPollActive = false;
    return autoPollToken;
}

function stopAutoPoll() {
    autoPollActive = false;
    autoPollToken += 1;
}

function isCurrentPoll(token) {
    return token === autoPollToken;
}

function isExpectedError(error) {
    return ['no_receiver', 'timeout', 'send_failed', 'no_response', 'invalid_response'].includes(error?.code);
}

function getErrorStatusType(error) {
    return isExpectedError(error) ? 'warning' : 'error';
}

function sendMessageWithTimeout(tabId, message, timeoutMs) {
    return new Promise((resolve, reject) => {
        let settled = false;

        const timeoutId = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(createError('timeout', 'timeout'));
        }, timeoutMs);

        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);

            if (chrome.runtime.lastError) {
                const errMsg = chrome.runtime.lastError.message || 'sendMessage failed';
                if (errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
                    reject(createError('no_receiver', errMsg));
                } else {
                    reject(createError('send_failed', errMsg));
                }
                return;
            }

            if (!response) {
                reject(createError('no_response', 'no response'));
                return;
            }

            resolve(response);
        });
    });
}

async function startAutoPoll(tabId, token) {
    if (!isCurrentPoll(token)) return;

    autoPollActive = true;
    const startAt = Date.now();

    while (isCurrentPoll(token) && Date.now() - startAt < AUTO_POLL_MAX_MS) {
        const elapsedMs = Date.now() - startAt;
        const elapsedSeconds = Math.min(Math.ceil(elapsedMs / 1000), AUTO_POLL_MAX_SECONDS);
        setStatus('warning', '⏳', `页面加载中，自动检测中（${elapsedSeconds}/${AUTO_POLL_MAX_SECONDS}s）`, { showRetry: true });
        hintEl.textContent = '页面可能仍在加载图片';

        const cycleStart = Date.now();

        try {
            const readiness = await ensureContentScript(tabId);
            if (!isCurrentPoll(token)) return;

            if (readiness.ready) {
                const response = await requestImagesWithRetry(tabId);
                if (!isCurrentPoll(token)) return;

                if (response?.success && response.count > 0) {
                    imageData = response;
                    setStatus('success', '✅', `找到 ${response.count} 张图片`);
                    downloadBtn.disabled = false;
                    hintEl.textContent = `对话：${truncateTitle(response.title, 20)}`;
                    autoPollActive = false;
                    return;
                }
            } else if (!isExpectedError(readiness.error)) {
                throw readiness.error;
            }
        } catch (error) {
            if (!isCurrentPoll(token)) return;
            if (!isExpectedError(error)) {
                autoPollActive = false;
                setStatus('error', '❌', getFriendlyErrorMessage(error), { showRetry: true });
                hintEl.textContent = '点击「重新检测」或稍后再试';
                return;
            }
        }

        const cycleElapsed = Date.now() - cycleStart;
        const gap = AUTO_POLL_INTERVAL_MS - cycleElapsed;
        if (gap > 0) {
            await delay(gap);
        }
    }

    if (!isCurrentPoll(token)) return;
    autoPollActive = false;
    setStatus('warning', '📭', `未找到图片（已等待 ${AUTO_POLL_MAX_SECONDS} 秒）`, { showRetry: true });
    hintEl.textContent = '请确认对话中包含 AI 生成的图片';
}

async function ensureContentScript(tabId) {
    try {
        const ping = await sendMessageWithTimeout(tabId, { action: 'ping' }, PING_TIMEOUT_MS);
        if (ping?.ready) return { ready: true };
    } catch (error) {
        const shouldInject = ['no_receiver', 'timeout', 'no_response'].includes(error?.code);
        if (shouldInject) {
            const didInject = await injectContentScript(tabId);
            if (didInject) {
                await delay(INJECT_DELAY_MS);
                try {
                    const ping = await sendMessageWithTimeout(tabId, { action: 'ping' }, PING_TIMEOUT_MS);
                    if (ping?.ready) return { ready: true };
                } catch (pingError) {
                    return { ready: false, error: pingError };
                }
            }
        }
        return { ready: false, error };
    }

    return { ready: false, error: createError('no_receiver', 'not ready') };
}

async function injectContentScript(tabId) {
    if (!chrome.scripting?.executeScript) {
        return false;
    }

    if (chrome.scripting.insertCSS) {
        await new Promise((resolve) => {
            chrome.scripting.insertCSS({
                target: { tabId },
                files: CONTENT_STYLE_FILES
            }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('[Popup] CSS inject error:', chrome.runtime.lastError);
                }
                resolve();
            });
        });
    }

    return new Promise((resolve) => {
        chrome.scripting.executeScript({
            target: { tabId },
            files: CONTENT_SCRIPT_FILES
        }, () => {
            if (chrome.runtime.lastError) {
                console.warn('[Popup] Inject error:', chrome.runtime.lastError);
                resolve(false);
                return;
            }
            resolve(true);
        });
    });
}

async function requestImagesWithRetry(tabId) {
    let lastError = null;

    for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
        try {
            const response = await sendMessageWithTimeout(tabId, { action: 'getImages', waitMs: WAIT_IMAGES_MS }, MESSAGE_TIMEOUT_MS);
            if (response?.success) return response;
            lastError = createError('invalid_response', response?.error || 'invalid response');
        } catch (error) {
            lastError = error;
        }

        if (attempt < RETRY_LIMIT - 1) {
            await delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        }
    }

    throw lastError || createError('unknown', 'unknown error');
}

function getFriendlyErrorMessage(error) {
    const code = error?.code;
    if (code === 'no_receiver') return '页面未就绪，点击重新检测';
    if (code === 'timeout') return '页面加载中，点击重新检测';
    if (code === 'no_response') return '页面未响应，点击重新检测';
    if (code === 'send_failed') return '页面通信失败，点击重新检测';
    return '无法获取图片信息';
}

async function downloadAllImages() {
    if (!imageData || imageData.count === 0) return;

    try {
        stopAutoPoll();
        downloadBtn.disabled = true;
        downloadBtn.classList.add('loading');
        retryBtn.hidden = true;
        retryBtn.disabled = true;
        setStatus('', '⏳', '正在下载...');

        const zip = new JSZip();
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < imageData.images.length; i++) {
            const url = imageData.images[i];
            setStatus('', '⏳', `正在下载 ${i + 1}/${imageData.count}...`);

            try {
                const response = await fetch(url, {
                    mode: 'cors',
                    credentials: 'include'
                });

                if (response.ok) {
                    const contentType = (response.headers.get('content-type') || '').toLowerCase();
                    const blob = await response.blob();
                    if (contentType && !contentType.startsWith('image/')) {
                        console.warn(`[Popup] Non-image response for ${i + 1}: ${contentType}`);
                        failCount++;
                        continue;
                    }
                    // 检查是否真的是图片
                    if (blob.size > 1000) {  // 至少 1KB
                        const extension = getExtensionFromContentType(blob.type || contentType) || getExtensionFromUrl(url) || 'png';
                        const filename = `${String(i + 1).padStart(2, '0')}.${extension}`;
                        zip.file(filename, blob);
                        successCount++;
                    } else {
                        console.warn(`[Popup] Image ${i + 1} too small, skipping`);
                        failCount++;
                    }
                } else {
                    console.error(`[Popup] Failed to fetch image ${i + 1}: ${response.status}`);
                    failCount++;
                }
            } catch (err) {
                console.error(`[Popup] Error downloading image ${i + 1}:`, err);
                failCount++;
            }
        }

        if (successCount === 0) {
            setStatus('error', '❌', '下载失败，请刷新页面重试');
            return;
        }

        setStatus('', '📦', '正在打包...');
        const content = await zip.generateAsync({ type: 'blob' });

        const filename = DOWNLOAD_FILENAME;

        console.log('[Popup] Downloading as:', filename);

        const downloadOk = await triggerZipDownload(content, filename);
        if (!downloadOk) {
            setStatus('error', '❌', '下载失败，请检查浏览器下载设置');
            return;
        }

        if (failCount === 0) {
            setStatus('success', '✅', `下载完成！共 ${successCount} 张图片`);
        } else {
            setStatus('warning', '⚠️', `已下载 ${successCount}/${imageData.count} 张`);
        }

    } catch (error) {
        console.error('[Popup] Download error:', error);
        setStatus('error', '❌', '下载失败，请重试');
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.classList.remove('loading');
        retryBtn.disabled = false;
    }
}
