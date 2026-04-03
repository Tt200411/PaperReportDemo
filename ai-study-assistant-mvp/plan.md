# AI Study Assistant MVP Refactor Plan

## 1. 最终锁定约束

本文件是当前项目的执行约束基线。后续实现必须以此为准，不再回退到旧方案。

### 产品与运行时

- 项目形态锁定为 `Mac-first desktop app`
- 技术底座保留当前 `Electron + React + TypeScript`
- Claude 侧锁定为 `Claude Code CLI runtime`，不是自定义 prompt orchestration
- Claude Code npm 包版本锁定为 `@anthropic-ai/claude-code@2.1.90`
- Claude 运行时环境变量内置，不向用户暴露设置入口：

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

- 不需要登录系统
- 不需要数据库
- 不需要用户自配 API key / model / base URL
- 不需要图片理解增强；MVP 阶段信任 Claude Code 自身原生能力

### Skill 约束

最终 App 中只允许出现两个 Claude skill，且必须按原样安装，不能改内容，不能做适配，不能重写：

1. 申请文书 skill
   - 源路径：`/Users/tangbao/project/思考/申请文书Skills/essay-craft`
   - 入口文件：`SKILL.md`
   - Claude slash command：`/essay-craft`
2. 报告写作 skill
   - 源路径：`/Users/tangbao/project/思考/Report_Skills`
   - 入口文件：`SKILL.md`
   - Claude slash command：`/report-ta-orchestrator`
   - 依赖目录：`references/`、`scripts/`

规则：

- 两份 skill 作为最终产品能力源，不再使用项目内手写 `questions`、`stageReportFocus`、`consultant/agent prompt templates`
- App 必须把 skill 安装到 Claude Code 可识别的 `.claude/skills/` 目录
- 用户在 UI 中只选择业务类型，实际触发对应 slash command
- 绝不修改上游 skill 内容

### UI 约束

前端只保留两页，最小实现：

1. `启动/引导页`
2. `Before / After 对比页`

设计基线锁定为：

- 配色文件：`web-color-palette.md`
- 参考图：
  - `对话框UI.jpg`
  - `结果图对比UI.jpg`

明确规则：

- 不要设置页
- 不要暴露运行时配置
- 不要再出现旧版多面板控制台式布局
- 页面数量就两页，不多做

## 2. 目标架构

重构目标不是重新发明一个 AI 写作系统，而是：

`桌面 GUI 壳 + Claude Code 原生运行时 + Qwen 对照组`

### 目标模块

1. `Desktop Shell`
   - Electron 窗口、打包、preload、安全边界
2. `Runtime Config Service`
   - 内置 Claude env
   - 内置 Qwen baseline 配置
   - 仅主进程可见
3. `Workspace Session Service`
   - 创建 session 目录
   - 保存原始文件
   - 保存提取缓存
   - 保存 transcript / outputs / selection
4. `Claude Skill Installer`
   - 每次新会话创建时，把两个外部 skill 安装到 workspace 的 `.claude/skills/`
   - `essay-craft` 原样复制
   - `Report_Skills` 原样复制并携带 `references/` 与 `scripts/`
5. `Claude Session Adapter`
   - 启动 Claude Code CLI
   - 把 workspace 作为工作目录
   - 以 slash command 触发 skill
   - 管理会话输入输出
6. `Qwen Baseline Service`
   - 直接生成对照组结果
   - 使用用户 prompt + 中间状态文件
7. `Renderer`
   - 两页 UI
   - 第 1 页负责选择 skill、上传文档、启动 Claude
   - 第 2 页负责浏览 Claude 输出与 Qwen baseline 对照

## 3. Workspace 约定

每个本地 session 的 workspace 统一为：

```text
workspace/
  inputs/
    user-intent.md
    original-files/
    extracted-cache/
  state/
    transcript.md
    current-brief.md
    stage-report.md
    session-events.jsonl
  outputs/
    version-1.md
    version-2.md
    version-3.md
    version-notes.md
    selected.md
    baseline-qwen.md
  .claude/
    skills/
      essay-craft/
      report-ta-orchestrator/
```

文档策略：

- Claude 路径：优先读取 `inputs/original-files/`
- 提取出来的文本放到 `inputs/extracted-cache/`，仅作辅助缓存
- Qwen baseline 可以使用提取文本与中间状态

## 4. 范围边界

### 保留范围

- 桌面 App
- 本地 workspace
- 文档上传与文本提取
- Claude Code 原生会话
- 两个固定 skill
- Qwen baseline 对照
- 本地文件落盘与版本选择

### 明确不做

- 设置页
- 登录系统
- 数据库
- 账号体系
- 付费层级
- Learn 层
- 学习轨迹
- 快速通道
- 自定义 skill 编辑
- skill 内容适配或重写
- 超过两页的 UI
- 额外 skill

## 5. 留 / 改 / 删

### 保留

- `package.json`
  - 保留 Electron 构建链与桌面打包基础
- `src/main/index.ts`
  - 保留主进程入口
- `src/main/services/document-service.ts`
  - 保留 PDF / DOCX 提取能力
- `src/main/services/session-service.ts`
  - 保留本地 workspace 落盘主逻辑，但目录结构要调整
- `src/main/services/qwen-runner.ts`
  - 保留 baseline 方向
- `electron.vite.config.ts`
- `scripts/smoke-documents.mjs`
- `scripts/smoke-packaged.mjs`

### 重写

- `src/main/services/claude-runner.ts`
  - 从手写 prompt 调用重写为 Claude Code session adapter
- `src/main/ipc.ts`
  - 改为适配两页 UI 与 Claude session 生命周期
- `src/main/preload.ts`
  - 去掉 settings API，暴露最小运行时 API
- `src/main/services/settings-service.ts`
  - 重写为隐藏式 runtime config service
- `src/shared/types.ts`
  - 去掉旧问卷模型与设置模型，收缩为会话、页面、输出类型
- `src/shared/skills.ts`
  - 重写为两个 UI 展示项与 slash command 映射，不再是问题列表
- `src/renderer/src/App.tsx`
  - 彻底重写
- `src/renderer/src/styles.css`
  - 按 `web-color-palette.md` 和两张 UI 图重写

### 删除或废弃

- `src/main/services/prompt-builders.ts`
  - Claude 主链路废弃
  - 若 Qwen baseline 仍需要 prompt 组装，可把 baseline 部分迁出后删除本文件
- `resources/templates/base-claude.md`
- `resources/templates/statement-writing-consultant.md`
- `resources/templates/statement-writing-agent.md`
- `resources/templates/report-writing-consultant.md`
- `resources/templates/report-writing-agent.md`
- Renderer 中旧设置页、旧 workspace control panel、旧问卷式流程 UI

## 6. 实施分期

### Phase 1: 基础重构

目标：

- 升级并固定 `@anthropic-ai/claude-code@2.1.90`
- 建立隐藏式 runtime config
- 接入外部 skill 安装器
- 去掉设置页与用户可配运行时
- 重构共享类型与两页 UI 骨架

产出：

- 可编译
- 两页基础页面可见
- 不再出现设置入口
- 新建 session 时能把两个外部 skill 安装进 workspace

### Phase 2: Claude 原生会话接入

目标：

- 用 Claude Code CLI 启动真实会话
- 通过 slash command 启动所选 skill
- 把用户输入与 Claude 输出接到第 1 页对话界面

产出：

- `申请文书` 会触发 `/essay-craft`
- `报告写作` 会触发 `/report-ta-orchestrator`
- transcript 与 session state 正常落盘

### Phase 3: 输出与对照页

目标：

- 接回 Claude 输出文件浏览
- 接回 Qwen baseline
- 完成 Before / After 对比页

产出：

- 能看到 Claude 结果
- 能看到 baseline 结果
- 能把用户选中的版本写入 `selected.md`

### Phase 4: 验收与打包

目标：

- 完成 smoke
- 验证打包产物
- 验证关键路径稳定性

产出：

- 开发态通过
- 打包态通过
- 关键工作流通过

## 7. 总验收标准

只有全部满足，项目才算达标。

### 运行时与依赖

- `@anthropic-ai/claude-code` 已升级并固定到 `2.1.90`
- Claude 运行时使用内置 env，不需要用户输入任何配置
- App 中不存在用户可见设置页或 API key 输入入口

### Skill 与 Claude

- 每次新会话都会把以下 skill 安装到 workspace 的 `.claude/skills/`
  - `essay-craft`
  - `report-ta-orchestrator`
- 安装结果与源目录一致，skill 内容未被修改
- UI 只出现两个 skill 选项
- 选中 `申请文书` 后实际触发 `/essay-craft`
- 选中 `报告写作` 后实际触发 `/report-ta-orchestrator`

### UI

- App 只有两页核心 UI
- 视觉风格符合 `web-color-palette.md`
- 第 1 页整体贴近 `对话框UI.jpg`
- 第 2 页整体贴近 `结果图对比UI.jpg`
- 不再保留旧版复杂多面板布局

### 数据与文件

- 原始上传文件保存在 `inputs/original-files/`
- 提取文本保存在 `inputs/extracted-cache/`
- Claude 会话状态落盘到 `state/`
- 结果落盘到 `outputs/`
- 用户最终选择会写入 `outputs/selected.md`

### 对照组

- Qwen baseline 能生成结果
- 第 2 页能并排展示 baseline 与 Claude 结果

### 工程质量

- `npm run build` 通过
- 至少完成一次本地端到端 smoke
- 关键异常有用户可见错误反馈，不会静默失败

## 8. 禁止回退项

以下方案视为回退，禁止重新引入：

- 再次暴露设置页
- 再次让用户自己配 Claude / Qwen key
- 再次把 skill 逻辑改回项目内手写 prompt builders
- 再次把 skill 抽象为固定问题表单
- 再次新增第三个 skill 或多页额外流程

