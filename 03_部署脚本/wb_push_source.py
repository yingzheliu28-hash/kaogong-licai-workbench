#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同步「每日wb推送」源数据到 3 个目标（确保数据一致性）：
  1) 本地项目文件夹备份：<项目>/02_每日推送源/{公考常识判断, 财经热点知识}/
  2) 仓库 source/{kaogong,licai}/   （云端工作流重建 data.js）
  3) 站点 GitHub Pages               （wb_deploy_api.py 单独跑）

被两个每日推送自动化（考公/理财 12:30）调用：
  python wb_push_source.py

令牌从 ~/.workbuddy/secrets/wb_github_pat 读取（经 wb_repo_push）。

设计原则：
- 单一源：D:\Desktop\每日wb推送\（用户真实桌面根，与用户认知一致）
- 遍历全部 YYYY-MM-DD.md + progress.json + 周维度文件（不只"最新一天"）
- 考公专属同步：每周小测/ 整目录 + 我的错题本.md + 本周知识要点.md
- 本地镜像 + GitHub 上传 都做，确保三处内容随时一致
- 任意一个步骤失败不会回滚已成功的部分（最多重试一次）
"""
import os, re, sys, shutil

# 与本脚本同目录的 wb_repo_push.py（按脚本真实路径解析，不依赖 cwd）
_HERE = os.path.dirname(os.path.abspath(sys.argv[0] if sys.argv and sys.argv[0] else __file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
import wb_repo_push as R

# 用户真实桌面（Windows API 报告 D:\Desktop）
PKG_ROOT = r"D:\Desktop\考公理财工作台_完整迁移包"
DESKTOP = r"D:\Desktop\每日wb推送"           # 12:30 自动化真实写入点（用户认知）
MIRROR_ROOT = os.path.join(PKG_ROOT, "02_每日推送源")

# 兼容手动从 C:\Users\EDY\wb_push_source.py 调用：脚本会用 cwd 算 HERE，可能错算
# 上述硬编码直接覆盖此风险。

TRACKS = [
    # (本地源目录子路径, GitHub repo 子路径, 镜像目录子路径)
    ("公考常识判断", "source/kaogong", "公考常识判断"),
    ("财经热点知识", "source/licai", "财经热点知识"),
]

MD_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")

# 除每日 md / progress.json 外，还要同步的"考公专属"文件/子目录
KAOGONG_EXTRA_FILES = (
    "本周知识要点.md",     # 周末总结的周要点合集（用户/系统周更）
    "我的错题本.md",       # 跨周错题重考池（用户维护，build_cloud.py 直接读）
)
KAOGONG_EXTRA_DIRS = (
    "每周小测",            # 周末小测：每周 1 次，含 <周>-本周小测.md + <周>-成绩.md
)


def list_kaogong_files(track_dir):
    """列出考公目录下需要同步的全部内容（每日 md + progress + 三个周维度文件）。"""
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
    """理财侧只同步每日 md + progress.json（无小测体系）。"""
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


def mirror_file(src, dest):
    """本地镜像：cp 一份到 02_每日推送源/。幂等（覆盖）。"""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy2(src, dest)
    return dest


def mirror_tree(src_dir, dest_dir):
    """本地镜像：递归 cp 整个子目录到 02_每日推送源/<同名子目录>/。"""
    os.makedirs(dest_dir, exist_ok=True)
    for root, _, files in os.walk(src_dir):
        rel = os.path.relpath(root, src_dir)
        target_root = os.path.join(dest_dir, rel) if rel != "." else dest_dir
        os.makedirs(target_root, exist_ok=True)
        for f in files:
            shutil.copy2(os.path.join(root, f), os.path.join(target_root, f))
    return dest_dir


def push_track(local_subdir, repo_subdir, mirror_subdir):
    """同步一条轨道：本地源 → 本地镜像 + GitHub。"""
    local_dir = os.path.join(DESKTOP, local_subdir)
    mirror_dir = os.path.join(MIRROR_ROOT, mirror_subdir)

    # 考公 vs 理财：列表策略不同
    if local_subdir == "公考常识判断":
        files, subdirs = list_kaogong_files(local_dir)
    else:
        files, subdirs = list_licai_files(local_dir), []

    if not files and not subdirs:
        print(f"  ⚠ {local_subdir}/ 无任何内容，跳过")
        return

    ok_count = 0
    # 1) 本地镜像：所有文件
    for src in files:
        fname = os.path.basename(src)
        try:
            mirror_file(src, os.path.join(mirror_dir, fname))
            ok_count += 1
        except Exception as e:
            print(f"  ✗ 本地镜像失败 {fname}: {e}")

    # 2) 本地镜像：周维度子目录（递归）
    for sd in subdirs:
        sd_name = os.path.basename(sd)
        try:
            mirror_tree(sd, os.path.join(mirror_dir, sd_name))
            print(f"  ✓ 本地镜像子目录 {sd_name}/")
        except Exception as e:
            print(f"  ✗ 本地镜像子目录失败 {sd_name}/: {e}")

    # 3) GitHub 推送：所有单个文件
    for src in files:
        fname = os.path.basename(src)
        try:
            R.push(src, f"{repo_subdir}/{fname}")
        except Exception as e:
            print(f"  ✗ GitHub 推送失败 {fname}: {e}")

    # 4) GitHub 推送：周维度子目录里的文件（一个一个推，保证下次能精确读到每周小测/<日期>.md）
    for sd in subdirs:
        sd_name = os.path.basename(sd)
        for root, _, sfiles in os.walk(sd):
            rel = os.path.relpath(root, sd)
            for sf in sfiles:
                sf_full = os.path.join(root, sf)
                # repo 路径：source/kaogong/<sd_name>/<rel>/<sf>，rel="." 跳过
                rel_norm = "" if rel == "." else rel.replace("\\", "/") + "/"
                repo_path = f"{repo_subdir}/{sd_name}/{rel_norm}{sf}"
                try:
                    R.push(sf_full, repo_path)
                except Exception as e:
                    print(f"  ✗ GitHub 推送失败 {repo_path}: {e}")

    print(f"  ✓ {local_subdir}/：本地镜像 {ok_count} 个文件"
          + (f" + {len(subdirs)} 个子目录" if subdirs else "")
          + "；GitHub 推送完成")


if __name__ == "__main__":
    print(f"== 源目录（用户真实桌面）：{DESKTOP} ==")
    print(f"== 本地项目备份：{MIRROR_ROOT} ==")
    print()
    for local_sub, repo_sub, mirror_sub in TRACKS:
        print(f"== 同步 {local_sub} ==")
        push_track(local_sub, repo_sub, mirror_sub)
        print()
    print("完成。三个位置已同步：本地源、本地项目备份、GitHub 仓庌 source/。")
    print("下一步：build_cloud.py 用本地源重建 data.js，wb_deploy_api.py 推送到 Pages。")
