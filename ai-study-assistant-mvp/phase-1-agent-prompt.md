# Phase 1 Execution Prompt

你现在负责执行 `ai-study-assistant-mvp` 的 Phase 1。不要讨论方案，不要扩展需求，不要询问用户。直接实现，直到本阶段验收标准全部满足为止。

## 项目根目录

`/Users/tangbao/project/思考/ai-study-assistant-mvp`

## 必读文件

1. `plan.md`
2. `web-color-palette.md`
3. 当前代码中的：
   - `package.json`
   - `src/main/services/session-service.ts`
   - `src/main/services/settings-service.ts`
   - `src/main/services/claude-runner.ts`
   - `src/main/ipc.ts`
   - `src/main/preload.ts`
   - `src/shared/types.ts`
   - `src/shared/skills.ts`
   - `src/renderer/src/App.tsx`
   - `src/renderer/src/styles.css`

## 本阶段唯一目标

完成基础重构，为后续 Claude 原生会话接入打底。

## 硬性约束

### Claude 与 Skill

- 必须把 `@anthropic-ai/claude-code` 升级并固定到 `2.1.90`
- 以下两个外部 skill 必须作为最终产品 skill 来源：
  - `/Users/tangbao/project/思考/申请文书Skills/essay-craft`
  - `/Users/tangbao/project/思考/Report_Skills`
- 不能修改这两个 skill 的任何内容
- 不能对 skill 做兼容性适配
- 你的工作是把它们原样安装进每个 workspace 的 `.claude/skills/`

### 运行时配置

- Claude 运行时 env 内置在主进程，不暴露到用户界面
- 固定使用：

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
- 不允许再让用户输入或修改 API key、model、base URL

### UI

- 前端只保留两页骨架：
  - 启动/引导页
  - Before / After 对比页
- 本阶段不要求把所有功能接通，但页面结构必须已经调整到两页模型
- 风格必须使用 `web-color-palette.md`
- 不要保留旧版复杂控制台布局

## 允许保留的旧代码

- `document-service.ts`
- `session-service.ts` 的主体思路
- `qwen-runner.ts`
- Electron 构建与打包配置

## 本阶段必须完成的改动

1. 升级 `@anthropic-ai/claude-code` 到 `2.1.90`
2. 重写 `settings-service.ts`
   - 从“用户设置存储”改为“隐藏式 runtime config”
3. 重写 `src/shared/types.ts`
   - 删除旧问卷模型和 settings 模型
4. 重写 `src/shared/skills.ts`
   - 只保留两个 UI skill 元信息及 slash command 映射
5. 调整 `session-service.ts`
   - 新目录结构包含：
     - `inputs/original-files/`
     - `inputs/extracted-cache/`
     - `state/`
     - `outputs/`
     - `.claude/skills/`
6. 新增或重写 skill 安装逻辑
   - `essay-craft` 原样复制
   - `Report_Skills` 原样复制，包含 `references/` 与 `scripts/`
7. 重写 `ipc.ts` 和 `preload.ts`
   - 去掉 settings 相关 API
   - 提供两页 UI 需要的最小接口
8. 重写 `App.tsx`
   - 两页骨架
   - 第一页有两个 skill 卡片、意图输入、文档上传入口、开始按钮
   - 第二页有左右对比布局骨架
9. 重写 `styles.css`
   - 严格切到新配色和新布局语言
10. 废弃 Claude 旧模板体系
   - 不再让旧 `prompt-builders.ts` 驱动 Claude 主链路
   - 可以先保留文件不删，但不得再作为主要入口

## 本阶段验收标准

全部满足才算完成：

1. `npm install` 后锁定 `@anthropic-ai/claude-code@2.1.90`
2. `npm run build` 通过
3. Renderer 中不存在设置页或任何 API key / model / base URL 表单
4. UI 结构已经是两页，不再是旧版多面板工作台
5. 新建 session workspace 时，会创建 `.claude/skills/`
6. 新建 session workspace 时，会原样安装：
   - `essay-craft`
   - `report-ta-orchestrator`
7. `Report_Skills` 的 `references/` 和 `scripts/` 会被一并安装
8. `inputs/original-files/` 与 `inputs/extracted-cache/` 目录都存在
9. `src/shared/skills.ts` 中只剩两个 skill 展示项
10. 本阶段代码中不再存在“用户可保存运行时配置”的主路径

## 执行要求

- 不要在中途询问用户
- 自己做必要的代码搜索、改造、构建和验证
- 每次修改前先理解当前文件
- 不要做 plan 以外的功能扩展
- 如果发现旧代码和新约束冲突，优先服从 `plan.md`
- 完成后给出：
  - 修改内容摘要
  - 验证结果
  - 未完成项，若有

