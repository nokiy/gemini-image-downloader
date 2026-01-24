#!/usr/bin/env python3
"""
深度测试 Service Worker 问题
"""

from playwright.sync_api import sync_playwright
import os
import time
import json

EXTENSION_PATH = os.path.expanduser(
    "~/AI/AI_Workspace/Projects/Gemini_image/gemini-image-downloader"
)

def main():
    print(f"[TEST] Extension: {EXTENSION_PATH}")

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir="/tmp/playwright_test_sw",
            headless=False,
            args=[
                f"--disable-extensions-except={EXTENSION_PATH}",
                f"--load-extension={EXTENSION_PATH}",
                "--no-first-run",
            ],
        )

        # 获取扩展 ID
        print("\n[TEST] Getting extension ID...")

        # 打开扩展管理页面
        ext_page = context.new_page()
        ext_page.goto("chrome://extensions/")
        time.sleep(2)

        # 截图扩展页面
        ext_page.screenshot(path="/tmp/extensions_page.png")
        print("[TEST] Extensions page screenshot: /tmp/extensions_page.png")

        # 打开 Gemini
        page = context.new_page()

        errors = []
        sw_messages = []

        def handle_console(msg):
            text = msg.text
            if "SW" in text or "GID" in text:
                sw_messages.append(f"[{msg.type}] {text}")
                print(f"[CONSOLE] {text[:200]}")
            if msg.type == "error":
                errors.append(text)

        page.on("console", handle_console)

        print("\n[TEST] Navigating to Gemini...")
        page.goto("https://gemini.google.com/app", timeout=60000)
        time.sleep(5)

        # 测试 chrome.runtime.sendMessage
        print("\n[TEST] Testing runtime.sendMessage...")
        try:
            # 先检查 chrome.runtime 是否存在
            runtime_check = page.evaluate("""() => {
                return {
                    hasChrome: typeof chrome !== 'undefined',
                    hasRuntime: typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined',
                    hasSendMessage: typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function'
                };
            }""")
            print(f"[TEST] Runtime check: {runtime_check}")
        except Exception as e:
            print(f"[TEST] Runtime check error: {e}")

        # 检查扩展模块
        print("\n[TEST] Checking extension modules...")
        try:
            modules = page.evaluate("""() => {
                return {
                    UI: typeof window.GeminiImageUI !== 'undefined',
                    State: typeof window.GeminiImageState !== 'undefined',
                    Detection: typeof window.GeminiImageDetection !== 'undefined',
                    ErrorLogger: typeof window.GeminiImageErrorLogger !== 'undefined',
                };
            }""")
            print(f"[TEST] Modules loaded: {modules}")
        except Exception as e:
            print(f"[TEST] Module check error: {e}")

        # 检测图片
        print("\n[TEST] Detecting images...")
        try:
            images = page.evaluate("""() => {
                if (window.GeminiImageDetection) {
                    return window.GeminiImageDetection.detectImages();
                }
                return [];
            }""")
            print(f"[TEST] Images found: {len(images) if images else 0}")
        except Exception as e:
            print(f"[TEST] Detection error: {e}")

        # 获取错误日志
        print("\n[TEST] Getting error logs...")
        try:
            error_logs = page.evaluate("""async () => {
                if (window.GeminiImageErrorLogger) {
                    return await window.GeminiImageErrorLogger.getErrorLogs();
                }
                return [];
            }""")
            print(f"[TEST] Error logs count: {len(error_logs) if error_logs else 0}")
            if error_logs:
                for log in error_logs[:5]:
                    print(f"  - [{log.get('category')}] {log.get('message')[:100]}")
        except Exception as e:
            print(f"[TEST] Error logs error: {e}")

        print("\n" + "="*60)
        print("[TEST] Summary:")
        print(f"  - Errors: {len(errors)}")
        print(f"  - SW messages: {len(sw_messages)}")

        if errors:
            print("\n[TEST] First 5 errors:")
            for err in errors[:5]:
                print(f"  - {err[:150]}")

        print("\n[TEST] Keeping browser open for 30 seconds...")
        print("[TEST] Please check chrome://extensions for Service Worker status")
        time.sleep(30)

        context.close()

if __name__ == "__main__":
    main()
