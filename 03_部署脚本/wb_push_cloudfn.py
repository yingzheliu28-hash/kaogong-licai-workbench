#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
云函数代码一键双推：本地 06_云函数/ → 主仓库（备份）+ 独立仓库（Vercel 生效）。

为什么需要（2026-08-31）：
  Vercel 项目 `kaogong-exam-api` 导入的是**独立仓库** yingzheliu28-hash/kaogong-exam-api，
  不是主仓库 kaogong-licai-workbench 的 06_云函数/ 子目录。
  所以只推主仓库 → 站点不会更新，且**没有任何报错**，纯静默失效。
  本脚本一次推两个仓库，杜绝「改了代码但没生效」。

映射关系（同一份本地文件，两个目标路径）：
  本地 06_云函数/api/submit.js
    → 主仓库   06_云函数/api/submit.js   （备份，换电脑可拉回）
    → 独立仓库 api/submit.js             （Vercel 实际拉的，决定站点行为）

用法：
  python 03_部署脚本/wb_push_cloudfn.py              # 双推（默认）
  python 03_部署脚本/wb_push_cloudfn.py --main-only  # 只推主仓库
                                                     # （若已改成方案 B：Vercel 直连主仓库）
  python 03_部署脚本/wb_push_cloudfn.py --vercel-only
"""
import os
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

PKG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLOUDFN_DIR = os.path.join(PKG_ROOT, "06_云函数")
WB_PUSH = os.path.join(PKG_ROOT, "03_部署脚本", "wb_repo_push.py")

MAIN_REPO = "yingzheliu28-hash/kaogong-licai-workbench"
VERCEL_REPO = "yingzheliu28-hash/kaogong-exam-api"
MAIN_PREFIX = "06_云函数/"

SKIP_DIRS = {"__pycache__", ".git", "node_modules", ".vercel"}
SKIP_EXT = {".pyc", ".pyo"}


def collect_files():
    """返回 [(local_abs_path, rel_path), ...]，rel_path 用正斜杠"""
    if not os.path.isdir(CLOUDFN_DIR):
        print("[FAIL] 找不到目录：%s" % CLOUDFN_DIR)
        return []
    out = []
    for root, dirs, files in os.walk(CLOUDFN_DIR):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if os.path.splitext(f)[1] in SKIP_EXT:
                continue
            full = os.path.join(root, f)
            rel = os.path.relpath(full, CLOUDFN_DIR).replace("\\", "/")
            out.append((full, rel))
    return sorted(out)


def run_push(repo, pairs, label):
    if not pairs:
        return True
    print("─" * 58)
    print("  %s  →  %s" % (label, repo))
    print("─" * 58)
    args = [sys.executable, WB_PUSH, "--repo=" + repo]
    for local, repo_path in pairs:
        args += [local, repo_path]
    r = subprocess.run(
        args, capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if r.stdout:
        print(r.stdout.rstrip())
    if r.stderr:
        print(r.stderr.rstrip())
    if r.returncode != 0:
        print("[FAIL] 推送失败（退出码 %s）" % r.returncode)
        return False
    return True


def main():
    args = set(sys.argv[1:])
    do_main = "--vercel-only" not in args
    do_vercel = "--main-only" not in args

    files = collect_files()
    if not files:
        return 1

    print()
    print("云函数文件 %d 个：" % len(files))
    for _, rel in files:
        print("   %s" % rel)
    print()

    ok = True

    if do_main:
        ok &= run_push(
            MAIN_REPO,
            [(local, MAIN_PREFIX + rel) for local, rel in files],
            "主仓库（备份）",
        )

    if do_vercel:
        print()
        ok &= run_push(VERCEL_REPO, files, "独立仓库（Vercel 生效）")

    print()
    print("=" * 58)
    if ok:
        print("[ OK ] 推送完成")
        if do_vercel:
            print("       Vercel 会自动重新部署，约 10~30 秒后生效。")
            print("       验证：python 03_部署脚本/wb_check_credentials.py")
    else:
        print("[FAIL] 有仓库推送失败，请检查上面的输出")
    print("=" * 58)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
