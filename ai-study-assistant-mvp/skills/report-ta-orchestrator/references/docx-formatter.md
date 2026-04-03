# docx-formatter

角色：文档导出子模块。

## 输入契约（强制）

```json
{
  "input_markdown": "final.md",
  "output_docx": "report.docx",
  "template_path": "string|null",
  "doc_type": "论文|报告",
  "style_prefs": {
    "margins": "default|custom",
    "heading_map": "H1/H2/H3",
    "body_style": "normal"
  }
}
```

## 执行命令（主流程入口）

```bash
python scripts/run_docx_contract.py --input final.md --output report.docx --template "用户模板.docx"
```

说明：
- `run_docx_contract.py` 会调用 `build_docx.py --json-only`
- 自动解析契约并输出 `gate_result = PASS|FAIL`
- 可加 `--strict-quality`，要求 `quality_checks` 全部 PASS 才判定 PASS
- 建议：`doc_type=论文` 时默认使用 `--strict-quality`

## 运行规则（强制）

- `--template` 可选；模板不存在时允许降级为默认样式
- 降级时必须返回 `template_status = FALLBACK_USED`
- 必须返回导出结果与检查项，不得只返回“成功/失败”

## 输出契约（强制）

主流程返回体（`run_docx_contract.py`）：
```json
{
  "status": "SUCCESS|PARTIAL|FAILED",
  "gate_result": "PASS|FAIL",
  "subprocess_exit_code": 0,
  "contract": { "...": "build_docx.py 的完整输出" },
  "unmet_items": ["string"]
}
```

其中 `contract` 必须包含以下字段：
```json
{
  "output_path": "string",
  "export_status": "SUCCESS|FAILED",
  "template_status": "APPLIED|FALLBACK_USED|NOT_PROVIDED|FAILED",
  "quality_checks": {
    "margins": "PASS|FAIL",
    "heading_levels": "PASS|FAIL",
    "paragraph_spacing": "PASS|FAIL",
    "caption_style": "PASS|FAIL"
  },
  "unmet_items": ["string"],
  "error_message": "string|null"
}
```

## 失败与降级

- 模板缺失：继续导出并标记 `FALLBACK_USED`
- 导出失败：输出 `FAILED` + `error_message` + 可执行重试建议
