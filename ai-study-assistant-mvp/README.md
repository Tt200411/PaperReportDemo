# AI Study Assistant MVP

桌面版写作助手，用真实 Claude 会话和本地 skills 处理申请文书与课程报告，并用 Qwen baseline 做对照。

## Current Capabilities

- Electron + React + TypeScript 桌面端
- 支持 PDF / DOCX 上传与文本提取
- 两套真实 skills：
  - `/essay-craft`
  - `/report-ta-orchestrator`
- Claude 多轮输出写入 `outputs/version-*.md`
- Qwen baseline 写入 `outputs/baseline-qwen.md`
- 对比页支持版本切换与 `selected.md` 写入
- 打包版内置 Claude CLI 运行所需资源
- skills 在打包版中从应用资源目录安装，不依赖作者机器的绝对路径

## Scripts

```bash
npm run dev
npm run build
npm run pack:mac
npm run dist:mac
npm run smoke:phase23
npm run smoke:packaged
```

## Local Development

```bash
npm install
npm run dev
```

## Packaging

本地打包：

```bash
npm run dist:mac
```

产物位于：

```bash
dist/
```

其中包含：

- `AI Study Assistant MVP-<version>-arm64-mac.zip`
- `AI Study Assistant MVP-<version>-arm64.dmg`
- `dist/mac-arm64/AI Study Assistant MVP.app`

## Smoke Validation

打包 smoke：

```bash
npm run smoke:packaged
```

会真实使用：

- `CV1.pdf`
- `report1.pdf`

并校验：

- 打包版 skills 已被正确安装到工作区
- `/essay-craft` 和 `/report-ta-orchestrator` 能成功触发
- `outputs/version-*.md`、`selected.md`、`baseline-qwen.md` 正常写入

## Release Naming

仓库 release 统一采用：

- `AI-Study-Assistant-MVP-v<version>-mac-m-chip-<YYYY-MM-DD>.zip`
- `AI-Study-Assistant-MVP-v<version>-win-x64-<YYYY-MM-DD>.zip`

## Notes

- 当前没有正式应用图标
- 当前 mac 包未 notarize
- Windows 资产当前复用已验证的现成 x64 打包结果
