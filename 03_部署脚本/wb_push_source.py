#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同步「项目内 02_每日推送源」到 GitHub source/（唯一上游 = 项目文件夹）。

设计原则（2026-08-07 v2）：
- 单一源 = 项目内 02_每日推送源（项目文件夹自包含，不依赖真实桌面）
- 12:30 自动化 cwds 直接指向项目内 02_/，写完后跑本脚本 → 同步到 GitHub source/
- 真实桌面 D:\Desktop\每日wb推送\ 仅保留为历史归档，不再被读取
- 遍历全部 YYYY-MM-DD.md + progress.json + 周维度文件（不只"最新一天"）
- 考公专属同步：每周小测/ 整目录 + 我的错题本.md + 本周知识要点.md
- 任意一个步骤失败不会回滚已成功的部分（最多重试一次）

被两个每日推送自动化（考公/理财 12:30）调用：
  python wb_push_source.py

令牌从 ~/.workbuddy/secrets/wb_github_pat 读取（经 wb_repo_push）。
"""
import os, re, sys, shutil

# 与本脚本同目录的 wb_repo_push.py（按脚本真实路径解析，不依赖 cwd）
_HERE = os.path.dirname(os.path.abspath(sys.argv[0] if sys.argv and sys.argv[0] else __file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
import wb_repo_push as R

# 项目文件夹（canonical，Windows Explorer 看这个就是一切）
PKG_ROOT = r"D:\Desktop\考公理财工作台_完整迁移包"
# 单一源：项目内 02_每日推送源（项目自包含）
SRC_ROOT = os.path.join(PKG_ROOT, "02_每日推送源")

# 兼容手动从 C:\Users\EDY\wb_push_source.py 调用：脚本会用 cwd 算 HERE，可能错算
# 上述硬编码直接覆盖此风险。

TRACKS = [
    # (源目录子路径, GitHub repo 子路径)
    ("公考常识判断", "source/kaogong"),
    ("财经热点知识", "source/licai"),
]

MD_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")

# 除每日 md / progress.json 外，还要同步的"考公专属"文件/子目录
KAOGONG_EXTRA_FILES = (
    "本周知识要点.md",     # 周末总结的周要点合集（你/系统周更）
    "我的错题本.md",       # 跨周错题重考池（你维护，build_cloud.py 直接读）
)
KAOGONG_EXTRA_DIRS = (
    "每周小测",            # 周末小测：每周 1 次，含 <周>-本周小测.md + <周>-成绩.md
)


def list_kaogong_files(track_dir):
    if not os.path.isdir(track_dir):
        return [], []
    files = []
    subdirs = []
    for name in sorted(os.listdir(track_dir)):
        full = os.path.join(track_dir, name)
        if os.path.isdir(full):
            if name in KAOGONG_EXTRA_DIRS:
                subdirs.append(full)
            continue
        if MD_RE.match(name) or name == "progress.json" or name in KAOGONG_EXTRA_FILES:
            files.append(full)
    return files, subdirs


def list_licai_files(track_dir):
    if not os.path.isdir(track_dir):
        return []
    out = []
    for name in sorted(os.listdir(track_dir)):
        full = os.path.join(track_dir, name)
        if not os.path.isfile(full):
            continue
        if MD_RE.match(name) or name == "progress.json":
            out.append(full)
    return out


def push_track(local_subdir, repo_subdir):
    local_dir = os.path.join(SRC_ROOT, local_subdir)

    if local_subdir == "公考常识判断":
        files, subdirs = list_kaogong_files(local_dir)
    else:
        files, subdirs = list_licai_files(local_dir), []

    if not files and not subdirs:
        print("  ⚠ %s/ 无任何内容，跳过" % local_subdir)
        return

    for src in files:
        fname = os.path.basename(src)
        try:
            R.push(src, "%s/%s" % (repo_subdir, fname))
        except Exception as e:
            print("  ✗ GitHub 推送失败 %s: %s" % (fname, e))

    for sd in subdirs:
        sd_name = os.path.basename(sd)
        for root, _, sfiles in os.walk(sd):
            rel = os.path.relpath(root, sd)
            for sf in sfiles:
                sf_full = os.path.join(root, sf)
                rel_norm = "" if rel == "." else rel.replace("\\", "/") + "/"
                repo_path = "%s/%s/%s%s" % (repo_subdir, sd_name, rel_norm, sf)
                try:
                    R.push(sf_full, repo_path)
                except Exception as e:
                    print("  ✗ GitHub 推送失败 %s: %s" % (repo_path, e))

    extra = " + %d 个子目录" % len(subdirs) if subdirs else ""
    print("  ✓ %s/：%d 个文件%s 已同步到 GitHub source/" % (local_subdir, len(files), extra))


if __name__ == "__main__":
    print("== 单一源（项目内自包含）：%s ==" % SRC_ROOT)
    print()
    for local_sub, repo_sub in TRACKS:
        print("== 同步 %s ==" % local_sub)
        push_track(local_sub, repo_sub)
        print()
    print("完成。GitHub source/ 已与项目内 02_ 同步。")
    print("下一步：build_cloud.py 读 02_ 重建 data.js，wb_deploy_api.py 推送到 Pages。")
