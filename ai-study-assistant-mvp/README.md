# AI Study Assistant MVP

macOS 优先的桌面版 MVP，用于验证：

- 对照组：`Qwen` 直接生成
- 实验组：`Claude Code CLI + Skill + 本地文件工作区`

## 当前实现

- Electron + React + TypeScript
- 本地选择 PDF / DOCX，并做文本提取
- 两个 Skill：
  - 文书写作
  - 报告写作
- Think 问答表单
- 阶段报告生成与手动编辑
- Qwen baseline 通道
- Claude Code experiment 通道
- macOS 打包脚本

## 本地开发

```bash
npm install
npm run dev
```

## mac 打包

```bash
npm run pack:mac
```

产物目录：

```bash
dist/mac-arm64/AI Study Assistant MVP.app
```

## 配置

首次启动后，在左侧设置面板填写：

- `Qwen Base URL`
- `Qwen API Key`
- `Qwen Model`
- `Claude Base URL`
- `Claude Auth Token / API Key`
- `Claude Model`（可留空，走默认模型）
- `Claude CLI 路径（可选）`

默认情况下：

- Qwen 走 OpenAI-compatible chat completions
- Claude Code 优先尝试使用应用内打包的 `@anthropic-ai/claude-code/cli.js`
- 若找不到，再回退到手动配置的 `claude` 命令

## 注意

- 当前仅先验证 macOS arm64。
- 当前没有正式应用图标。
- 当前未做真正的“内置第三方转发站配置向导”，只保留手动填写字段。
