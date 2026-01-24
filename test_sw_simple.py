#!/usr/bin/env python3
"""
简单测试 Service Worker 状态
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
        # 使用新的用户数据目录，避免缓存问题
        context = p.chromium.launch_persistent_context(
            user_data_dir="/tmp/playwright_test_sw_v25",
            headless=False,
            args=[
                f"--disable-extensions-except={EXTENSION_PATH}",
                f"--load-extension={EXTENSION_PATH}",
                "--no-first-run",
            ],
        )

        # 打开扩展管理页面
        ext_page = context.new_page()
        ext_page.goto("chrome://extensions/")
        time.sleep(3)

        # 截图扩展页面
        ext_page.screenshot(path="/tmp/ext_page_v25.png")
        print("[TEST] Extensions page screenshot: /tmp/ext_page_v25.png")

        # 打开 Gemini
        page = context.new_page()

        def handle_console(msg):
            text = msg.text
            # 只显示扩展相关日志
            if "SW" in text or "GID" in text:
                print(f"[CONSOLE] {text[:300]}")

        page.on("console", handle_console)

        print("\n[TEST] Navigating to Gemini...")
        page.goto("https://gemini.google.com/app", timeout=60000)
        time.sleep(8)

        # 截图页面
        page.screenshot(path="/tmp/gemini_page_v25.png")
        print("[TEST] Gemini page screenshot: /tmp/gemini_page_v25.png")

        print("\n[TEST] Keeping browser open for 60 seconds...")
        print("[TEST] Please check:")
        print("  1. chrome://extensions - Service Worker should show 'active'")
        print("  2. Click Service Worker link to see console logs")
        print("  3. Try clicking extension icon to test download")
        time.sleep(60)

        context.close()

if __name__ == "__main__":
    main()
