# 素读

Plainly · [English](./README.md)

素读只做一件事：翻译你正在读的网页。

译文放在每段原文下方，也可以只显示译文。设置保存在你的浏览器里，文本直接发给你配置的模型服务商。素读没有服务器，没有账号，也不收集使用数据。详见[隐私政策](./PRIVACY.md)。

## 能做什么

- 翻译整个网页和页面标题，支持双语对照和仅译文两种模式。
- 支持 OpenAI、DeepSeek 以及任何 OpenAI 兼容端点，包括本地和自托管模型。
- 可以把页面摘要交给模型，让译文贴合上下文。
- 可以调整 Prompt、译文样式、请求速率和批量大小。

## 没有什么

素读从 [Read Frog（陪读蛙）](https://github.com/mengxi-ream/read-frog) fork 而来，去掉了阅读网页以外的一切：视频字幕、输入框翻译、悬浮工具栏、朗读、自定义 AI 动作、托管存储与账号、配置同步、统计和实验功能开关。

需要这些功能的话，陪读蛙和同类工具做得很好。素读保持小巧，让页面保持安静。

## 开发

```bash
pnpm install
pnpm test
pnpm type-check
pnpm build
```

`pnpm test:e2e` 会先构建扩展，再通过开发依赖 [Playwright](https://playwright.dev/) 在无头 Chromium 中打开它。首次运行前执行 `pnpm exec playwright-core install --no-shell chromium` 下载 Chromium；Linux 上加 `--with-deps` 同时安装系统库。测试失败时，报告会列出浏览器日志、打开的页面和已保存的配置；把 `E2E_ARTIFACTS` 设为一个目录，还会把每个页面的截图保存到那里。CI 也会运行这些测试。

## 许可

素读是 Read Frog 的修改版本，感谢 Read Frog 的作者和贡献者提供原始作品。

素读与上游一样按 GNU General Public License version 3 分发，见 [LICENSE](./LICENSE)。遇到问题请在本仓库反馈，不要提交给 Read Frog 项目。
