// [IN]: chrome.storage.session/local, chrome.downloads API, chrome.runtime messaging / Chrome 存储会话/本地、Chrome 下载 API、Chrome 运行时消息
// [OUT]: Download tracking service, rename operations, message handlers / 下载跟踪服务、重命名操作、消息处理器
// [POS]: src/background/service_worker.js - Background layer for lifecycle management / 用于生命周期管理的后台层
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

const PENDING_KEY = 'pendingDownloadRenames';
const storage = chrome.storage.session || chrome.storage.local;

function readPending() {
  return new Promise((resolve) => {
    storage.get(PENDING_KEY, (result) => {
      resolve(result[PENDING_KEY] || {});
    });
  });
}

function writePending(map) {
  return new Promise((resolve) => {
    storage.set({ [PENDING_KEY]: map }, () => resolve());
  });
}

function getBasename(pathname) {
  if (!pathname) return '';
  return pathname.split(/[/\\]/).pop() || '';
}

async function trackDownload(downloadId, filename) {
  const pending = await readPending();
  pending[String(downloadId)] = filename;
  await writePending(pending);
}

async function untrackDownload(downloadId) {
  const pending = await readPending();
  delete pending[String(downloadId)];
  await writePending(pending);
}

function renameIfNeeded(downloadId, expectedFilename) {
  return new Promise((resolve) => {
    chrome.downloads.search({ id: downloadId }, (items) => {
      const item = items && items[0];
      if (!item) {
        resolve(false);
        return;
      }

      const currentBase = getBasename(item.filename);
      if (currentBase === expectedFilename) {
        resolve(true);
        return;
      }

      chrome.downloads.rename(downloadId, { filename: expectedFilename }, () => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'trackDownload') {
    trackDownload(message.downloadId, message.filename)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  return false;
});

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta || !delta.state || delta.state.current !== 'complete') return;
  const pending = await readPending();
  const expected = pending[String(delta.id)];
  if (!expected) return;

  await renameIfNeeded(delta.id, expected);
  await untrackDownload(delta.id);
});
