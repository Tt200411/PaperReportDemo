# 使用指南

## 下载与安装

1. 前往 [Releases](https://github.com/Tt200411/PaperReportDemo/releases) 页面，下载最新版本的 `.zip` 文件。
2. 把整个 `.zip` 解压到任意文件夹，不要只拿出其中的 `.exe` 单独运行。
3. 双击 `AI Study Assistant MVP.exe` 打开应用。首次启动可能需要几秒钟。

## 基本使用流程

1. **选择任务类型** — 在首页选择写作模式：`申请文书` 或 `报告写作`。
2. **填写需求** — 在"意图输入"里写清楚目标，例如申请学校、项目、作业要求、字数限制、语言要求等。
3. **上传材料** — 支持 `PDF` 和 `DOCX`，点击"上传文档"或使用"系统选择器"。
4. **开始会话** — 点击"开始真实 Claude 会话"，程序会建立工作区并调用模型生成内容。
5. **继续补充信息** — 如果模型需要澄清或你想补充要求，继续在对话框里发送信息。
6. **查看对比页** — 切到"对比页"可以看到 Qwen Baseline、Claude Versions、Version Notes 和当前选中版本。
7. **选择最终版本** — 点击"写入 selected.md"将满意的版本设为选定稿。

## 文件保存位置

程序生成的 `.md` 文件保存在用户目录下，不在解压目录里：

```
C:\Users\<用户名>\AppData\Roaming\ai-study-assistant-mvp\sessions\<会话ID>\workspace\
```

主要文件：
- `outputs/version-1.md` ~ `version-3.md` — Claude 各轮输出
- `outputs/selected.md` — 选定的最终版本
- `outputs/baseline-qwen.md` — Qwen 基线输出
- `state/current-brief.md` — 当前需求摘要
- `state/transcript.md` — 对话记录

## 注意事项

- 这是"解压即用"程序，不需要额外安装 Node.js 或 Python。
- 运行时需要联网访问模型接口（非离线可用）。
- 请不要删除解压目录里的 `resources`、`locales`、`.dll` 等文件，否则程序可能无法启动。
