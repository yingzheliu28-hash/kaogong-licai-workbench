#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
路遥求索 · 工作台  GitHub Pages 同步（HTTPS Contents API）
- 通过 GitHub Contents API 直接更新 main 分支上的站点文件，无需 git clone。
- 绕开沙箱下 git 与 coreutils 文件系统视图不一致的问题（SSH git clone+cp 不可靠）。
- 令牌从 ~/.workbuddy/secrets/wb_github_pat 读取（或环境变量 GITHUB_TOKEN），不写进自动化 prompt。
- 幂等：与远端逐文件比对，内容相同则跳过，避免空提交。

用法：
  python wb_deploy_api.py            # 同步全部 4 个站点文件
  python wb_deploy_api.py data.js    # 仅同步指定文件
"""
import urllib.request, urllib.error, json, base64, os, sys, ssl, time

OWNER = "yingzheliu28-hash"
REPO = "kaogong-licai-workbench"
BRANCH = "main"
BASE = "https://api.github.com/repos/%s/%s/contents" % (OWNER, REPO)
# 站点前端 = 03_部署脚本/../01_站点前端（自动检测，跨机器无需改）
SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "01_站点前端")
ALL_FILES = ["index.html", "styles.css", "app.js", "data.js"]

# 令牌
TOKEN = os.environ.get("GITHUB_TOKEN", "")
if not TOKEN:
    for p in (r"C:\Users\EDY\.workbuddy\secrets\wb_github_pat",
              os.path.expanduser("~/.workbuddy/secrets/wb_github_pat")):
        if os.path.isfile(p):
            with open(p, "r") as f:
                TOKEN = f.read().strip()
            break
if not TOKEN:
    print("ERROR: 未找到 GitHub 令牌（~/.workbuddy/secrets/wb_github_pat 或 GITHUB_TOKEN）")
    sys.exit(2)

hdr = {
    "Authorization": "token " + TOKEN,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "wb-workbench-sync",
}

def api(method, url, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=hdr, method=method)
    # 沙箱网络偶发 SSL 复位/连接重置，做有限重试（不含 409，409 在 PUT 层单独处理）
    last = None
    for attempt in range(3):
        try:
            return urllib.request.urlopen(req, timeout=40)
        except (urllib.error.URLError, ssl.SSLEOFError) as e:
            last = e
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
                continue
    raise last

files = sys.argv[1:] or ALL_FILES
ok = True
pushed = 0
skipped = 0
for f in files:
    path = os.path.join(SRC, f)
    if not os.path.isfile(path):
        print("%s: 本地文件不存在，跳过" % f)
        continue
    with open(path, "rb") as fh:
        local_bytes = fh.read()
    local_b64 = base64.b64encode(local_bytes).decode("ascii")

    # 1. 取远端当前内容与 sha
    try:
        with api("GET", "%s/%s?ref=%s" % (BASE, f, BRANCH)) as resp:
            meta = json.load(resp)
        remote_b64 = meta.get("content", "").replace("\n", "")
        sha = meta.get("sha")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            remote_b64, sha = "", None  # 远端尚无该文件，将新建
        else:
            print("%s: GET 失败 HTTP %s %s" % (f, e.code, e.read().decode("utf-8", "ignore")[:200]))
            ok = False
            continue

    # 2. 内容相同则跳过
    if remote_b64 == local_b64:
        print("%s: 无变化，跳过" % f)
        skipped += 1
        continue

    # 3. PUT 更新
    body = {
        "message": "chore(workbench): 同步 %s" % f,
        "content": local_b64,
        "branch": BRANCH,
    }
    if sha:
        body["sha"] = sha
    try:
        with api("PUT", "%s/%s" % (BASE, f), body) as resp:
            res = json.load(resp)
        print("%s: 已推送 commit=%s" % (f, res["commit"]["sha"][:8]))
        pushed += 1
    except urllib.error.HTTPError as e:
        if e.code == 409:
            # 409 = 远端已被云端工作流（或另一进程）更新，sha 失效。
            # 重新拉取最新 sha 后重试一次；若内容已一致则跳过。
            try:
                with api("GET", "%s/%s?ref=%s" % (BASE, f, BRANCH)) as r2:
                    meta2 = json.load(r2)
                new_b64 = meta2.get("content", "").replace("\n", "")
                if new_b64 == local_b64:
                    print("%s: 409 后确认远端内容已一致，跳过" % f)
                    skipped += 1
                    continue
                body["sha"] = meta2.get("sha")
                with api("PUT", "%s/%s" % (BASE, f), body) as resp2:
                    res = json.load(resp2)
                print("%s: 409 重试成功 commit=%s" % (f, res["commit"]["sha"][:8]))
                pushed += 1
            except urllib.error.HTTPError as e2:
                print("%s: 409 重试仍失败 HTTP %s %s" % (f, e2.code, e2.read().decode("utf-8", "ignore")[:200]))
                ok = False
        else:
            print("%s: PUT 失败 HTTP %s %s" % (f, e.code, e.read().decode("utf-8", "ignore")[:300]))
            ok = False

print("---- 同步完成：推送 %d，跳过 %d ----" % (pushed, skipped))
sys.exit(0 if ok else 1)
