#!/usr/bin/env python3
"""
测试 Gemini Image Downloader 扩展
捕获控制台错误日志
"""

from playwright.sync_api import sync_playwright
import os
import time

# 扩展路径
EXTENSION_PATH = os.path.expanduser(
    "~/AI/AI_Workspace/Projects/Gemini_image/gemini-image-downloader"
)

def main():
    print(f"[TEST] 扩展路径: {EXTENSION_PATH}")
    print(f"[TEST] 扩展存在: {os.path.exists(EXTENSION_PATH)}")

    with sync_playwright() as p:
        # 使用 persistent context 加载扩展
        # 注意：Chrome 扩展需要使用有头模式
        context = p.chromium.launch_persistent_context(
            user_data_dir="/tmp/playwright_chrome_test",
            headless=False,  # 扩展需要有头模式
            args=[
                f"--disable-extensions-except={EXTENSION_PATH}",
                f"--load-extension={EXTENSION_PATH}",
                "--no-first-run",
                "--disable-blink-features=AutomationControlled",
            ],
            ignore_default_args=["--enable-automation"],
        )

        # 收集控制台消息
        console_messages = []
        errors = []

        page = context.pages[0] if context.pages else context.new_page()

        # 监听控制台消息
        def handle_console(msg):
            text = f"[{msg.type}] {msg.text}"
            console_messages.append(text)
            print(f"[CONSOLE] {text}")
            if msg.type == "error":
                errors.append(text)

        # 监听页面错误
        def handle_page_error(error):
            text = f"[PAGE ERROR] {error}"
            errors.append(text)
            print(text)

        page.on("console", handle_console)
        page.on("pageerror", handle_page_error)

        print("\n[TEST] 导航到 gemini.google.com...")
        page.goto("https://gemini.google.com/app", wait_until="networkidle")

        print("[TEST] 等待页面加载完成...")
        time.sleep(5)  # 等待扩展初始化

        # 截图
        screenshot_path = "/tmp/gemini_extension_test.png"
        page.screenshot(path=screenshot_path, full_page=False)
        print(f"[TEST] 截图保存到: {screenshot_path}")

        # 检查扩展是否加载
        print("\n[TEST] 检查 GID 模块...")
        try:
            result = page.evaluate("""() => {
                return {
                    GeminiImageUI: typeof window.GeminiImageUI,
                    GeminiImageState: typeof window.GeminiImageState,
                    GeminiImageDetection: typeof window.GeminiImageDetection,
                    GeminiImageErrorLogger: typeof window.GeminiImageErrorLogger,
                    GeminiSelectors: typeof window.GeminiSelectors
                };
            }""")
            print(f"[TEST] 模块状态: {result}")
        except Exception as e:
            print(f"[TEST] 检查模块时出错: {e}")

        # 输出错误汇总
        print("\n" + "="*50)
        print(f"[TEST] 捕获到 {len(errors)} 个错误:")
        for err in errors:
            print(f"  - {err}")

        print("\n[TEST] 所有控制台消息:")
        for msg in console_messages:
            print(f"  {msg}")

        # 保持浏览器打开一会儿以便观察
        print("\n[TEST] 浏览器将在 10 秒后关闭...")
        time.sleep(10)

        context.close()

if __name__ == "__main__":
    main()
