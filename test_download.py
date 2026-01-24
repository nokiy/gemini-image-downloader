#!/usr/bin/env python3
"""
测试 Gemini Image Downloader 下载功能
"""

from playwright.sync_api import sync_playwright
import os
import time

EXTENSION_PATH = os.path.expanduser(
    "~/AI/AI_Workspace/Projects/Gemini_image/gemini-image-downloader"
)

def main():
    print(f"[TEST] Extension path: {EXTENSION_PATH}")

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir="/tmp/playwright_chrome_test2",
            headless=False,
            args=[
                f"--disable-extensions-except={EXTENSION_PATH}",
                f"--load-extension={EXTENSION_PATH}",
                "--no-first-run",
            ],
            ignore_default_args=["--enable-automation"],
        )

        console_messages = []
        errors = []

        page = context.pages[0] if context.pages else context.new_page()

        def handle_console(msg):
            text = f"[{msg.type}] {msg.text}"
            console_messages.append(text)
            if "GID" in msg.text or "SW" in msg.text or "error" in msg.text.lower():
                print(f"[CONSOLE] {text}")
            if msg.type == "error":
                errors.append(text)

        def handle_page_error(error):
            text = f"[PAGE ERROR] {error}"
            errors.append(text)
            print(text)

        page.on("console", handle_console)
        page.on("pageerror", handle_page_error)

        print("\n[TEST] Navigating to gemini.google.com...")
        page.goto("https://gemini.google.com/app", timeout=60000)

        print("[TEST] Waiting for page load...")
        time.sleep(8)

        # 检查扩展模块
        print("\n[TEST] Checking GID modules...")
        try:
            result = page.evaluate("""() => {
                return {
                    UI: typeof window.GeminiImageUI,
                    State: typeof window.GeminiImageState,
                    Detection: typeof window.GeminiImageDetection,
                    ErrorLogger: typeof window.GeminiImageErrorLogger,
                    Selectors: typeof window.GeminiSelectors
                };
            }""")
            print(f"[TEST] Modules: {result}")
        except Exception as e:
            print(f"[TEST] Module check error: {e}")

        # 检查 Service Worker 状态
        print("\n[TEST] Testing Service Worker ping...")
        try:
            result = page.evaluate("""() => {
                return new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: 'downloadPing' }, (response) => {
                        if (chrome.runtime.lastError) {
                            resolve({ error: chrome.runtime.lastError.message });
                        } else {
                            resolve(response);
                        }
                    });
                });
            }""")
            print(f"[TEST] Service Worker ping result: {result}")
        except Exception as e:
            print(f"[TEST] SW ping error: {e}")

        print("\n" + "="*50)
        print(f"[TEST] Captured {len(errors)} errors")
        for err in errors[:10]:
            print(f"  - {err}")

        print("\n[TEST] GID/SW related messages:")
        for msg in console_messages:
            if "GID" in msg or "SW" in msg:
                print(f"  {msg}")

        print("\n[TEST] Browser will close in 5 seconds...")
        time.sleep(5)
        context.close()

if __name__ == "__main__":
    main()
