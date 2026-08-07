#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同步「每日wb推送」源数据到 3 个目标（确保数据一致性）：
  1) 本地项目文件夹备份：<项目>/02_每日推送源/{公考常识判断, 财经热点知识}/
  2) 仓库 source/{kaogong,licai}/   （云端工作流重建 data.js）
  3) 站点 GitHub Pages             （wb_deploy_api.py 单独跑）

被两个每日推送自动化（考公/理财 12:30）调用：
  python wb_push_source.py

令牌从 ~/.workbuddy/secrets/wb_github_pat 读取（经 wb_repo_push）。

设计原则：
- 遍历全部 YYYY-MM-DD.md + progress.json，而不是只传"最新一天"
- 本地镜像 + GitHub 上传 都做，确保三处内容随时一致
- 任意一个步骤失败不会回滚已成功的部分（最多重试一次）
"""
import os, re, sys, shutil

# 与本脚本同目录的 wb_repo_push.py（按脚本真实路径解析，不依赖 cwd）
_HERE = os.path.dirname(os.path.abspath(sys.argv[0] if sys.argv and sys.argv[0] else __file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
import wb_repo_push as R

# 用户真实桌面（Windows API 报告 D:\Desktop）；项目文件夹是 D:\Desktop\考公理财工作台_完整迁移包\
PKG_ROOT = r"D:\Desktop\考公理财工作台_完整迁移包"
DESKTOP = os.path.join(PKG_ROOT, "00_每日推送源")
MIRROR_ROOT = os.path.join(PKG_ROOT, "02_每日推送源")

# 兼容手动从 C:\Users\EDY\wb_push_source.py 调用：脚本会把 cwd 当作 HERE → 误算"上一层"
# 上述硬编码直接覆盖此风险。

TRACKS = [
    # (本地源目录子路径, GitHub repo 子路径, 镜像目录子路径)
    ("公考常识判断", "source/kaogong", "公考常识判断"),
    ("财经热点知识", "source/licai", "财经热点知识"),
]

MD_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")
# 除每日 md / progress.json 外，还要同步的"周维度"文件（按文件名白名单）
WEEKLY_FILES = ("本周知识要点.md", "公考周末小测.md", "本周小测答题记录.json")


def all_files(track_dir):
    """列出目录下所有需要同步的文件：YYYY-MM-DD.md + progress.json + 周维度文件。"""
    if not os.path.isdir(track_dir):
        return []
    out = []
    for f in sorted(os.listdir(track_dir)):
        full = os.path.join(track_dir, f)
        if not os.path.isfile(full):
            continue
        if MD_RE.match(f) or f == "progress.json" or f in WEEKLY_FILES:
            out.append(full)
    return out


def mirror_file(src, dest):
    """本地镜像：cp 一份到 02_每日推送源/。幂等（覆盖）。"""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy2(src, dest)
    return dest


def push_track(local_subdir, repo_subdir, mirror_subdir):
    """同步一条轨道：本地源 → 本地镜像 + GitHub。"""
    local_dir = os.path.join(DESKTOP, local_subdir)
    mirror_dir = os.path.join(MIRROR_ROOT, mirror_subdir)
    files = all_files(local_dir)
    if not files:
        print(f"  ⚠ {local_subdir}/ 无任何 md，跳过")
        return
    for src in files:
        fname = os.path.basename(src)
        # 1) 本地镜像
        try:
            mirror_file(src, os.path.join(mirror_dir, fname))
        except Exception as e:
            print(f"  ✗ 本地镜像失败 {fname}: {e}")
            continue
        # 2) GitHub 推送
        try:
            R.push(src, f"{repo_subdir}/{fname}")
        except Exception as e:
            print(f"  ✗ GitHub 推送失败 {fname}: {e}")
    print(f"  ✓ {local_subdir}/ 已同步 {len(files)} 个文件（本地镜像 + GitHub）")


if __name__ == "__main__":
    print(f"== 源目录：{DESKTOP} ==")
    print(f"== 本地镜像：{MIRROR_ROOT} ==")
    for local_sub, repo_sub, mirror_sub in TRACKS:
        print(f"== 同步 {local_sub} ==")
        push_track(local_sub, repo_sub, mirror_sub)
    print()
    print("完成。三个位置已同步：本地源、本地项目备份、GitHub 仓庌 source/。")
    print("下一步：build_cloud.py 用本地源重建 data.js，wb_deploy_api.py 推送到 Pages。")
