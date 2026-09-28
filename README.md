# 简道翻译

Jiandao · [English](./README.en.md)

简道翻译是一个浏览器扩展，只做一件事：把你正在读的网页翻译成你的语言。

点一下“翻译此页”，译文会出现在每段原文下方，左侧一条细线把它和原文区分开。页面上不会多出悬浮按钮、划词气泡或侧边栏，再点一下就恢复原样。

翻译由你自己选择的大模型完成，比如 OpenAI、Anthropic、Gemini、DeepSeek，或者跑在你电脑上的本地模型。网页文本从你的浏览器直接发给这家服务，中间不经过任何简道翻译的服务器。

## 开始之前

你需要准备两样东西：

- **一个大模型服务。** 可以是 OpenAI、Anthropic、Gemini、DeepSeek 或任何兼容 OpenAI 接口的服务的 API Key，也可以是在你电脑上运行的 Ollama、LM Studio 等本地模型。在线服务按用量向你收费。
- **一个能执行命令的 coding agent**，比如 Claude Code 或 Codex。简道翻译没有填写服务地址和密钥的表单，第一次配置由 agent 帮你完成，后面会细说。

## 安装

**Chrome 和 Edge**：从 [Chrome 应用商店](https://chromewebstore.google.com/detail/bjfjdmmojplcohcbmkoogopanjbojmok)安装。Edge 可以直接安装 Chrome 应用商店里的扩展。

**Firefox**：还没有上架 Firefox 附加组件商店，需要从源码构建。构建需要 [Node.js](https://nodejs.org/) 和 [pnpm](https://pnpm.io/)：

```bash
git clone https://github.com/Xuanwo/jiandao.git
cd jiandao
pnpm install
pnpm build:firefox
```

然后打开 `about:debugging#/runtime/this-firefox`，点“临时载入附加组件”，选择 `.output/firefox-mv3/manifest.json`。Firefox 会在重启后移除临时载入的扩展。

想试用尚未发布的最新代码，也可以用同样的方式在 Chrome 里加载：运行 `pnpm build`，打开 `chrome://extensions`，打开“开发者模式”，点“加载已解压的扩展程序”，选择 `.output/chrome-mv3` 目录。

## 第一次配置

1. 点击浏览器工具栏里的简道翻译图标，弹窗会提示“还没有翻译服务”。
2. 点“复制给 agent 的说明”，把复制的内容贴给你的 coding agent。
3. agent 会问你想用哪家服务、API Key 放在哪里、你读什么语言。它会用你的 Key 实际发一次翻译请求，确认能用以后，把一段配置放进你的剪贴板。
4. 回到弹窗，把配置粘贴进去，点“应用并翻译此页”。

以后想换服务、换模型或修改提示词，也是同样的流程：在设置页点“复制给 agent 的说明”，告诉 agent 你想改什么，再把新配置贴回来。

我们选择让 agent 来配置，是因为各家服务的地址、模型名和参数经常变化，手填很容易出错。agent 会按说明逐项核对，并用你的 Key 实际跑通一次请求，交到你手上的配置已经验证过。给 agent 看的完整说明在 [docs/agent-setup.md](./docs/agent-setup.md)；如果你的 agent 支持 skill，也可以直接安装 [skills/jiandao-setup](./skills/jiandao-setup/SKILL.md)。

## 日常使用

打开想读的网页，点击工具栏图标，确认源语言和目标语言，然后点“翻译此页”。源语言默认自动检测。

- **快捷键**：默认是 `Alt+E`（Mac 上是 `Option+E`），按一次翻译，再按一次恢复原文。光标在输入框里时快捷键不会生效。你可以在设置里更换。
- **显示方式**：“双语对照”把译文放在原文下方，“仅译文”用译文替换原文。
- **边读边翻**：简道翻译优先翻译你看得到的段落，往下滚动时再翻译后面的内容，长文章不必等整页翻完。
- **不能翻译的页面**：浏览器自带的页面（比如 `chrome://` 开头的页面）和扩展商店页面不允许扩展修改，弹窗会提示“这个页面不能翻译”。

## 设置

点弹窗里的“设置”可以打开设置页。常用的选项有：

- **译文样式**：左侧细线、淡化、着色、虚线下划、底色、引用条、边框、悬停显示，也可以写自己的 CSS。
- **翻译范围**：只翻正文，或者翻译整页。
- **结合全文上下文**：先让模型读一遍页面摘要，再逐段翻译。术语和指代会更准确，但每个页面会多一次请求。
- **高级**：请求速率、并发上限、每次请求的段落数和字符数，以及清除译文缓存。

## 隐私

简道翻译没有服务器，没有账号，也不收集任何使用数据。设置和译文缓存只保存在你的浏览器里，不会跨设备同步，卸载扩展时会一并删除。只有在你翻译页面时，页面文本才会发给你配置的那家服务。详见[隐私政策](./PRIVACY.md)。

## 常见问题

**翻译要花多少钱？**
费用由你选的服务按用量收取，简道翻译本身免费。翻译过的段落会缓存在本地，重复打开同一页面不会再次请求。用本地模型则完全不产生费用。

**没有 coding agent 能用吗？**
可以，但需要手写配置。配置是一段 JSON，格式见 [docs/agent-setup.md](./docs/agent-setup.md) 和 [JSON Schema](./schema/jiandao-setup.schema.json)。写好后粘贴到弹窗里即可。

**为什么不支持划词翻译、视频字幕、朗读？**
简道翻译 fork 自 [Read Frog（陪读蛙）](https://github.com/mengxi-ream/read-frog)，并有意去掉了阅读网页以外的功能：视频字幕、输入框翻译、悬浮工具栏、朗读、自定义 AI 动作、托管账号、配置同步和统计。需要这些功能的话，陪读蛙和同类工具做得很好。

**遇到问题去哪里反馈？**
请在本仓库的 [Issues](https://github.com/Xuanwo/jiandao/issues) 里反馈，不要提交给 Read Frog 项目。

## 参与开发

```bash
pnpm install
pnpm dev         # 启动开发模式，自动打开加载了扩展的 Chrome
pnpm test        # 单元测试
pnpm type-check
pnpm build
```

`pnpm test:e2e` 会先构建扩展，再通过开发依赖 [Playwright](https://playwright.dev/) 在无头 Chromium 中打开它。首次运行前执行 `pnpm exec playwright-core install --no-shell chromium` 下载 Chromium；Linux 上加 `--with-deps` 同时安装系统库。测试失败时，报告会列出浏览器日志、打开的页面和已保存的配置；把 `E2E_ARTIFACTS` 设为一个目录，还会把每个页面的截图保存到那里。CI 也会运行这些测试。

## 许可

简道翻译是 Read Frog 的修改版本，感谢 Read Frog 的作者和贡献者提供原始作品。简道翻译与上游一样按 GNU General Public License version 3 分发，见 [LICENSE](./LICENSE)。
