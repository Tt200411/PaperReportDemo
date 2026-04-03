# Phase 2/3 Execution Prompt

你现在负责执行 `ai-study-assistant-mvp` 的 Phase 2 和 Phase 3。不要讨论方案，不要扩展需求，不要询问用户。直接实现，直到本次交付的全部验收标准满足为止。

## 项目根目录

`/Users/tangbao/project/思考/ai-study-assistant-mvp`

## 当前基线

Phase 1 已完成，当前代码状态已经满足这些前提：

- `@anthropic-ai/claude-code` 已锁定到 `2.1.90`
- Claude hidden runtime config 已内置在主进程
- settings 页面与用户可保存运行时配置路径已移除
- workspace 创建逻辑已经存在，并会创建：
  - `inputs/original-files/`
  - `inputs/extracted-cache/`
  - `state/`
  - `outputs/`
  - `.claude/skills/`
- 外部 skill 会原样安装到每个 workspace：
  - `essay-craft`
  - `report-ta-orchestrator`
- 前端已经切成两页骨架：
  - 启动 / 引导页
  - Before / After 对比页

你的任务不是重做 Phase 1，而是在这个基线上把 Phase 2 和 Phase 3 接通。

## 指定测试文档

用户已经提供了两份本地文档，下一次实现与 smoke 必须直接使用它们：

- CV draft：
  `/Users/tangbao/project/思考/ai-study-assistant-mvp/CV1.pdf`
- report requirement draft：
  `/Users/tangbao/project/思考/ai-study-assistant-mvp/report1.pdf`

要求：

- 不要忽略这两份文件
- 不要再向用户索要新的测试文档
- 至少有一条 smoke 覆盖 `essay-craft + CV1.pdf`
- 至少有一条 smoke 覆盖 `report-ta-orchestrator + report1.pdf`

## 必读文件

1. `plan.md`
2. `web-color-palette.md`
3. 当前代码中的：
   - `package.json`
   - `src/main/services/session-service.ts`
   - `src/main/services/settings-service.ts`
   - `src/main/services/claude-runner.ts`
   - `src/main/services/qwen-runner.ts`
   - `src/main/services/prompt-builders.ts`
   - `src/main/services/document-service.ts`
   - `src/main/ipc.ts`
   - `src/main/preload.ts`
   - `src/shared/types.ts`
   - `src/shared/skills.ts`
   - `src/renderer/src/App.tsx`
   - `src/renderer/src/styles.css`

## 本次唯一目标

完成 Phase 2 和 Phase 3：

1. 接入 Claude 原生会话
2. 接回 Claude 输出与 Qwen baseline
3. 完成两页 UI 的真实可用工作流

本次交付完成后，用户应该可以：

- 在第一页选择 skill、输入意图、上传文档并启动真实 Claude 会话
- 第一页看到用户输入与 Claude 输出的对话界面
- Claude 实际通过 slash command 调用正确 skill
- 第二页看到 Claude 输出与 Qwen baseline 的并排对比
- 选择 Claude 某个版本后，把它写入 `outputs/selected.md`

## 硬性约束

### Claude 与 Skill

- 必须继续使用 `@anthropic-ai/claude-code@2.1.90`
- 必须继续使用 Phase 1 中已经固定的 hidden runtime config
- 不允许重新引入任何用户可编辑的 Claude 配置入口
- 外部 skill 源仍然只能是：
  - `/Users/tangbao/project/思考/申请文书Skills/essay-craft`
  - `/Users/tangbao/project/思考/Report_Skills`
- 不能修改这两个 skill 的任何内容
- 不能对 skill 做兼容性适配
- 必须通过 Claude Code CLI 的 slash command 触发 skill
- `申请文书` 必须实际触发 `/essay-craft`
- `报告写作` 必须实际触发 `/report-ta-orchestrator`

### 运行时配置

- Claude runtime env 继续固定使用：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.uniapi.io/claude",
    "ANTHROPIC_AUTH_TOKEN": "sk-uXJRNgicDuxFSVv__zov9CCe331jEunxIIUs2CRBeiieSxWnDPWvFb54vXA",
    "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS": "1",
    "CLAUDE_CODE_ATTRIBUTION_HEADER": "0"
  }
}
```

- 不允许再出现设置页
- 不允许让用户输入或修改 API key、model、base URL

### UI

- 必须继续保持只有两页核心 UI
- 视觉风格必须继续服从 `web-color-palette.md`
- 不要回退到旧版复杂多面板控制台布局
- 第一页应贴近 `对话框UI.jpg` 的使用方式
- 第二页应贴近 `结果图对比UI.jpg` 的对比方式

### 前端调试与验证

- 不允许只靠静态代码阅读来判断前端是否完成
- 必须主动调用本地可用的技能 / 调试工具来完成前端联调与验证
- 优先使用本地可用的 Skills、MCP、Electron 调试、Playwright、浏览 / QA 能力来做真实交互验证
- 至少做一次真实 UI 操作级验证，而不是只看构建结果

## 允许保留的代码

- `document-service.ts`
- `session-service.ts` 当前 Phase 1 已有的 workspace 逻辑
- `settings-service.ts` 当前 hidden runtime config 结构
- `qwen-runner.ts` 的 baseline 主体方向
- Electron 构建与打包配置

## 必须完成的改动

### 1. 重写 `src/main/services/claude-runner.ts`

把它从当前的“只做 session bootstrap”改成真实 Claude Session Adapter，至少完成：

- 解析并定位 Claude Code CLI 可执行入口
- 以 workspace 作为工作目录启动 Claude Code
- 正确注入 hidden runtime env
- 用所选 skill 的 slash command 触发 Claude 会话
- 允许用户在第一页继续发送后续消息
- 正确处理 stdout / stderr / timeout / exit code / JSON 结果解析
- 把关键输出落盘到 `state/`

### 2. 调整 `src/shared/types.ts`

补足 Phase 2/3 所需的共享类型，至少包括：

- 启动会话请求与返回
- 对话消息模型
- Claude 会话快照 / transcript 读取模型
- Claude 输出版本模型
- baseline 对比结果模型
- 版本选择写入结果模型
- 两页 UI 所需 API 类型

但不要重新引入旧 settings 模型或旧问卷模型。

### 3. 调整 `src/shared/skills.ts`

- 继续只保留两个 UI skill 展示项
- 明确 slash command 映射
- 不要重新加入 questions / stageReportFocus 之类旧抽象

### 4. 扩展 `src/main/services/session-service.ts`

在保留 Phase 1 目录结构的基础上，补齐真实会话所需落盘能力，至少包括：

- append transcript
- 读取会话状态
- 写入 Claude 会话输出
- 枚举 `outputs/` 下的版本文件
- 选择某个版本并写入 `outputs/selected.md`
- 写入和读取必要的 state 文件

输出文件约定继续服从 `plan.md`：

- `outputs/version-1.md`
- `outputs/version-2.md`
- `outputs/version-3.md`
- `outputs/version-notes.md`
- `outputs/selected.md`
- `outputs/baseline-qwen.md`

### 5. 调整 `src/main/ipc.ts` 和 `src/main/preload.ts`

提供 Phase 2/3 两页 UI 所需的最小但完整接口，至少包括：

- 启动 Claude 会话
- 继续发送用户消息
- 读取当前会话状态
- 读取 Claude 输出版本
- 选择某个 Claude 版本
- 运行 Qwen baseline
- 打开本地路径

不要重新加入 settings 相关 API。

### 6. 重构 `src/renderer/src/App.tsx`

把两页骨架接成真实流程：

第一页至少要有：

- 两个 skill 卡片
- 意图输入
- 文档上传入口
- 开始按钮
- Claude 对话区
- 用户继续发送消息的输入区
- 清晰的状态反馈

第二页至少要有：

- Claude 输出区域
- Qwen baseline 输出区域
- Claude 多版本切换
- 版本说明区域
- 选择某个版本写入 `selected.md` 的操作
- 打开 workspace 的入口

要求：

- 页面仍然只有两页
- 不要重新出现旧版多面板工作台
- 未接通的占位 UI 必须被真实数据流替换

### 7. 重写 `src/renderer/src/styles.css`

- 保持 Phase 1 的新视觉方向
- 把第一页真正做成对话页，而不是静态 landing
- 把第二页真正做成可阅读的左右对比页
- 确保桌面宽屏和较窄窗口下都能正常工作

### 8. 废弃 Claude 旧模板体系

- 不允许让旧模板体系重新成为 Claude 主链路
- 如果 `prompt-builders.ts` 仍保留，只能用于 baseline 或极小辅助用途
- Claude 主链路必须是 Claude Code 原生会话 + slash command，而不是项目内模拟 skill

### 9. 接回 Qwen baseline

- `qwen-runner.ts` 必须可用
- Qwen baseline 必须把输出写入 `outputs/baseline-qwen.md`
- 第二页必须实际展示 baseline 结果

### 10. 完成端到端 smoke

至少完成一次本地真实工作流验证，覆盖：

- 创建 session
- 安装 skill
- 启动 Claude 会话
- 触发正确 slash command
- 生成 Claude 输出文件
- 生成 Qwen baseline
- 在第二页看到对比结果
- 选择一个版本写入 `selected.md`

并且必须补充以下指定 smoke：

- 使用 `CV1.pdf` 跑通 `essay-craft` 路径
- 使用 `report1.pdf` 跑通 `report-ta-orchestrator` 路径
- 前端 smoke 必须通过本地可用 Skills / MCP / Playwright / Electron 调试能力完成真实点击和页面校验

## 本次验收标准

全部满足才算完成：

1. `npm run build` 通过
2. Renderer 中仍然不存在设置页或任何 API key / model / base URL 表单
3. UI 仍然只有两页，不回退成旧版多面板工作台
4. 启动第一页时，选中 `申请文书` 会实际触发 `/essay-craft`
5. 启动第一页时，选中 `报告写作` 会实际触发 `/report-ta-orchestrator`
6. Claude 对话消息能在第一页显示，且用户可以继续发送消息
7. Claude transcript 与 session state 能正确落盘到 `state/`
8. Claude 输出文件能正确写到 `outputs/`
9. 第二页能实际读取并展示 Claude 输出
10. 第二页能实际读取并展示 `outputs/baseline-qwen.md`
11. 第二页能在 Claude 多版本之间切换
12. 用户选择某个 Claude 版本后，会写入 `outputs/selected.md`
13. `.claude/skills/essay-craft` 和 `.claude/skills/report-ta-orchestrator` 继续存在且未被改写
14. `report-ta-orchestrator` 的 `references/` 和 `scripts/` 继续存在
15. 关键异常路径有用户可见错误反馈，不会静默失败
16. 至少完成一次本地端到端 smoke，并在交付时说明验证结果
17. smoke 中必须实际使用 `CV1.pdf`
18. smoke 中必须实际使用 `report1.pdf`
19. 前端验证必须基于真实 UI 调试工具或本地 Skills / MCP，而不是只靠静态阅读代码

## 禁止回退项

以下方案视为回退，禁止重新引入：

- 再次暴露设置页
- 再次让用户自己配 Claude / Qwen key
- 再次把 skill 逻辑改回项目内手写 prompt builders
- 再次把 skill 抽象为固定问题表单
- 再次新增第三个 skill 或多页额外流程
- 为了“先跑通”而跳过真正的 slash command 调用
- 为了“先展示 UI”而只做假数据占位

## 执行要求

- 不要在中途询问用户
- 不要给用户发半成品状态汇报来请求确认
- 自己做必要的代码搜索、实现、构建、运行和验证
- 每次修改前先理解当前文件
- 如果遇到问题，先自行排查并修复，不要把排查工作转交给用户
- 必须主动使用本地可用的 Skills / MCP / Electron 调试 / Playwright 等能力完成前端联调
- 不要做 plan 之外的功能扩展
- 如果发现旧代码和新约束冲突，优先服从 `plan.md`
- 如果某项尚未满足验收标准，不要停在“部分完成”
- 在最终交付前，必须自己再次核对：功能、构建、落盘、UI、smoke 是否全部满足

## 最终交付格式

完成后只给出：

1. 修改内容摘要
2. 验证结果
3. smoke 结果
4. 未完成项，若有

如果还有任何未满足验收标准的地方，不要声称完成。
