/*
 * Layout of design/index.html: where each board sits on the canvas (CSS px),
 * listed back to front, and the row titles. Add a board here when you add its
 * HTML file. A script rather than JSON so index.html also opens from file://.
 */
window.JIANDAO_CANVAS = {
  title: "Jiandao Design",
  boards: [
    { file: "Popup-Setup-Agent.html", title: "弹窗 · 未配置（引导去设置页）", x: 0, y: 0, w: 320, h: 300 },
    { file: "Main.html", title: "弹窗 · 就绪", x: 400, y: 0, w: 320, h: 300 },
    { file: "Popup-Translating.html", title: "弹窗 · 翻译中", x: 800, y: 0, w: 320, h: 300 },
    { file: "Popup-Dark.html", title: "弹窗 · 深色（跟随系统）", x: 1200, y: 0, w: 320, h: 300 },
    { file: "Page.html", title: "页面内 · 朱红译文细线 + 工具栏图标状态", x: 0, y: 780, w: 880, h: 600 },
    { file: "Icon.html", title: "图标 · 16 / 32 / 48 / 128 与工具栏两种状态", x: 960, y: 780, w: 1120, h: 640 },
    { file: "Palette.html", title: "配色 · 浅色 / 深色", x: 2160, y: 780, w: 1040, h: 640 },
    { file: "Settings.html", title: "设置 · 单页（翻译服务、阅读、译文质量；无高级、无外观）", x: 0, y: 1760, w: 1120, h: 980 },
    { file: "Adaptive.html", title: "去掉高级和外观：各项改由什么自动决定", x: 1200, y: 1760, w: 1040, h: 840 },
    { file: "Service-States.html", title: "翻译服务 · 状态关系", x: 0, y: 4020, w: 1520, h: 620 },
    { file: "Agent-Flow.html", title: "流程 · 用户 → agent → 粘贴 → 预览 → 应用", x: 1600, y: 4020, w: 880, h: 700 },
    { file: "Settings-Agent.html", title: "翻译服务 · 未配置：直接显示输入框", x: 0, y: 5060, w: 720, h: 400 },
    { file: "Settings-Idle.html", title: "翻译服务 · 平时：预览 + 上次检查结果", x: 800, y: 5060, w: 720, h: 240 },
    { file: "Settings-Idle-Failed.html", title: "翻译服务 · 平时：上次检查失败", x: 1600, y: 5060, w: 720, h: 260 },
    { file: "Settings-Editing.html", title: "翻译服务 · 修改中：当前一行 + 编辑框（已全选）", x: 2400, y: 5060, w: 720, h: 420 },
    { file: "Settings-Edited.html", title: "翻译服务 · 待应用：当前 / 应用后上下对照", x: 3200, y: 5060, w: 720, h: 440 },
    { file: "Settings-Failed.html", title: "翻译服务 · 应用失败：多一行连接结果，不保存", x: 4000, y: 5060, w: 720, h: 500 },
    { file: "Quality-Prompt-Editing.html", title: "译文质量 · 修改提示词：原地展开两段文本", x: 0, y: 5900, w: 720, h: 740 },
  ],
  notes: [
    { text: "页面内、图标和配色：藏青是原文和操作，朱红只标译文", x: 0, y: 520, maxW: 3200 },
    { text: "弹窗：一句话式的顺序，从哪种语言 → 译成什么 → 怎么显示 → 翻译", x: 0, y: -260, maxW: 1520 },
    { text: "设置：一页到底，按使用频率排序，没有需要用户调的参数", x: 0, y: 1500, maxW: 2240 },
    { text: "翻译服务：平时只显示预览，需要时原地出现编辑框；配置只含服务本身", x: 0, y: 3760, maxW: 2480 },
    { text: "翻译服务一节的各个状态", x: 0, y: 4800, maxW: 4720 },
    { text: "译文质量：提示词平时只显示名称，需要时原地展开", x: 0, y: 5640, maxW: 1520 },
  ],
}
