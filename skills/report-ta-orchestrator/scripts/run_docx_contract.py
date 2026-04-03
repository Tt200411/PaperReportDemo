#!/usr/bin/env python3
"""Run build_docx.py and evaluate contract into gate result."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Wrapper for build_docx.py contract output with PASS/FAIL gate evaluation."
    )
    parser.add_argument("--input", required=True, help="Input markdown path")
    parser.add_argument("--output", required=True, help="Output docx path")
    parser.add_argument("--template", help="Optional template docx path")
    parser.add_argument(
        "--strict-quality",
        action="store_true",
        help="Fail gate when any quality_checks item is FAIL",
    )
    parser.add_argument(
        "--python-bin",
        default=sys.executable,
        help="Python executable used to invoke build_docx.py",
    )
    return parser.parse_args()


def run_build_docx(
    *,
    python_bin: str,
    input_path: str,
    output_path: str,
    template_path: str | None,
) -> tuple[int, str, str]:
    script_path = Path(__file__).with_name("build_docx.py")
    cmd = [
        python_bin,
        str(script_path),
        "--input",
        input_path,
        "--output",
        output_path,
        "--json-only",
    ]
    if template_path:
        cmd.extend(["--template", template_path])
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def parse_contract(stdout: str) -> dict[str, Any]:
    line = stdout.strip().splitlines()[-1] if stdout.strip() else ""
    if not line:
        raise ValueError("empty stdout from build_docx.py")
    try:
        data = json.loads(line)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON contract: {exc}") from exc
    required = [
        "output_path",
        "export_status",
        "template_status",
        "quality_checks",
        "unmet_items",
        "error_message",
    ]
    missing = [k for k in required if k not in data]
    if missing:
        raise ValueError(f"missing contract fields: {missing}")
    return data


def eval_gate(contract: dict[str, Any], strict_quality: bool) -> tuple[str, list[str]]:
    unmet_items = list(contract.get("unmet_items") or [])
    if contract.get("export_status") != "SUCCESS":
        return "FAIL", unmet_items

    if strict_quality:
        checks = contract.get("quality_checks") or {}
        failed = [k for k, v in checks.items() if v != "PASS"]
        if failed:
            unmet_items.extend([f"quality check failed: {k}" for k in failed])
            return "FAIL", unmet_items
    return "PASS", unmet_items


def main() -> int:
    args = parse_args()
    code, stdout, stderr = run_build_docx(
        python_bin=args.python_bin,
        input_path=args.input,
        output_path=args.output,
        template_path=args.template,
    )

    try:
        contract = parse_contract(stdout)
    except Exception as exc:
        result = {
            "status": "FAILED",
            "gate_result": "FAIL",
            "contract_parse_error": str(exc),
            "raw_stdout": stdout,
            "raw_stderr": stderr,
            "subprocess_exit_code": code,
        }
        print(json.dumps(result, ensure_ascii=False))
        return 1

    gate_result, unmet_items = eval_gate(contract, args.strict_quality)
    status = "SUCCESS" if gate_result == "PASS" else "PARTIAL"
    result = {
        "status": status,
        "gate_result": gate_result,
        "subprocess_exit_code": code,
        "contract": contract,
        "unmet_items": unmet_items,
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0 if gate_result == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
