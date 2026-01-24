#!/usr/bin/env python3
"""
测试 Service Worker 消息通信
"""

from playwright.sync_api import sync_playwright
import os
import time

EXTENSION_PATH = os.path.expanduser(
    "~/AI/AI_Workspace/Projects/Gemini_image/gemini-image-downloader"
)

def main():
    print(f"[TEST] Extension: {EXTENSION_PATH}")

    with sync_playwright() as p:
        # 使用新的用户数据目录
        context = p.chromium.launch_persistent_context(
            user_data_dir="/tmp/playwright_test_msg",
            headless=False,
            args=[
                f"--disable-extensions-except={EXTENSION_PATH}",
                f"--load-extension={EXTENSION_PATH}",
                "--no-first-run",
            ],
        )

        # 首先获取扩展 ID
        print("\n[TEST] Getting extension ID...")

        # 打开扩展管理页面
        ext_page = context.new_page()
        ext_page.goto("chrome://extensions/")
        time.sleep(2)

        # 启用开发者模式（如果未启用）
        try:
            dev_toggle = ext_page.locator('#devMode')
            if dev_toggle:
                # 检查是否已启用
                is_checked = ext_page.evaluate('''() => {
                    const toggle = document.querySelector('extensions-manager')
                        ?.shadowRoot?.querySelector('#devMode');
                    return toggle ? toggle.checked : false;
                }''')
                print(f"[TEST] Developer mode: {is_checked}")
        except Exception as e:
            print(f"[TEST] Could not check dev mode: {e}")

        # 打开 Gemini
        page = context.new_page()

        errors = []
        def handle_console(msg):
            text = msg.text
            if "SW" in text or "GID" in text:
                print(f"[CONSOLE] {text[:200]}")
            if msg.type == "error":
                errors.append(text[:100])

        page.on("console", handle_console)

        print("\n[TEST] Navigating to Gemini...")
        page.goto("https://gemini.google.com/app", timeout=60000)
        time.sleep(5)

        # 直接测试 chrome.runtime.sendMessage
        print("\n[TEST] Testing downloadPing message...")
        try:
            result = page.evaluate('''async () => {
                return new Promise((resolve) => {
                    // 检查 chrome.runtime 是否存在
                    if (typeof chrome === 'undefined' || !chrome.runtime) {
                        resolve({ error: 'chrome.runtime not available in page context' });
                        return;
                    }

                    // 检查内容脚本是否已注入
                    if (typeof window.GeminiImageUI === 'undefined') {
                        resolve({ error: 'Content script not injected (GeminiImageUI missing)' });
                        return;
                    }

                    // 尝试调用下载功能
                    if (window.GeminiImageUI.startDownload) {
                        try {
                            // 不真正下载，只是检查
                            resolve({ success: true, message: 'Content script available' });
                        } catch (e) {
                            resolve({ error: e.message });
                        }
                    } else {
                        resolve({ error: 'startDownload not found' });
                    }
                });
            }''')
            print(f"[TEST] Ping result: {result}")
        except Exception as e:
            print(f"[TEST] Ping error: {e}")

        # 检查页面上的扩展 UI
        print("\n[TEST] Checking extension UI elements...")
        try:
            ui_check = page.evaluate('''() => {
                return {
                    hasIcon: !!document.querySelector('.gid-icon'),
                    hasDrawer: !!document.querySelector('.gid-drawer'),
                    hasButton: !!document.querySelector('[data-gid-download]')
                };
            }''')
            print(f"[TEST] UI elements: {ui_check}")
        except Exception as e:
            print(f"[TEST] UI check error: {e}")

        print("\n" + "="*60)
        print("[TEST] Summary:")
        print(f"  - Console errors: {len(errors)}")
        if errors:
            print("\n[TEST] First 3 errors:")
            for err in errors[:3]:
                print(f"  - {err}")

        print("\n[TEST] Keeping browser open for 30 seconds...")
        print("[TEST] Please manually test:")
        print("  1. Click extension popup icon")
        print("  2. Check if 'Download All' button works")
        print("  3. Check chrome://extensions Service Worker status")
        time.sleep(30)

        context.close()

if __name__ == "__main__":
    main()
