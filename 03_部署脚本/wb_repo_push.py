#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通用仓库文件推送器（GitHub Contents API，HTTPS，沙箱友好）。
把本地文件推到指定仓库路径，幂等（与远端比对 sha，无变化跳过）。

用法（参数成对 LOCAL_PATH REPO_PATH，可多对）：
  python wb_repo_push.py build_cloud.py build_cloud.py
  python wb_repo_push.py "source/kaogong/2026-07-29.md" "source/kaogong/2026-07-29.md"
  python wb_repo_push.py local.md repo.md local2.md repo2.md

令牌：~/.workbuddy/secrets/wb_github_pat 或环境变量 GITHUB_TOKEN（不写进 prompt）。
"""
import urllib.request, urllib.error, json, base64, os, sys, urllib.parse

OWNER = "yingzheliu28-hash"
REPO = "kaogong-licai-workbench"
BRANCH = "main"
BASE = "https://api.github.com/repos/%s/%s/contents" % (OWNER, REPO)

TOKEN = os.environ.get("GITHUB_TOKEN", "")
if not TOKEN:
    for p in (r"C:\Users\EDY\.workbuddy\secrets\wb_github_pat",
              os.path.expanduser("~/.workbuddy/secrets/wb_github_pat")):
        if os.path.isfile(p):
            with open(p, "r", encoding="utf-8") as f:
                TOKEN = f.read().strip()
            break
if not TOKEN:
    print("ERROR: 未找到 GitHub 令牌")
    sys.exit(2)

hdr = {
    "Authorization": "token " + TOKEN,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "wb-repo-push",
}


def api(method, url, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=hdr, method=method)
    return urllib.request.urlopen(req, timeout=40)


def push(local, repo_path):
    if not os.path.isfile(local):
        print("%s: 本地不存在，跳过" % local)
        return False
    with open(local, "rb") as fh:
        local_b64 = base64.b64encode(fh.read()).decode("ascii")
    # URL 路径里如果有中文，需要 quote
    url_repo = urllib.parse.quote(repo_path, safe="/")
    try:
        with api("GET", "%s/%s?ref=%s" % (BASE, url_repo, BRANCH)) as resp:
            meta = json.load(resp)
        remote_b64 = meta.get("content", "").replace("\n", "")
        sha = meta.get("sha")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            remote_b64, sha = "", None
        else:
            print("%s: GET 失败 HTTP %s %s" % (repo_path, e.code, e.read().decode("utf-8", "ignore")[:200]))
            return False
    if remote_b64 == local_b64:
        print("%s: 无变化，跳过" % repo_path)
        return False
    body = {
        "message": "chore: 更新 %s" % repo_path,
        "content": local_b64,
        "branch": BRANCH,
    }
    if sha:
        body["sha"] = sha
    try:
        with api("PUT", "%s/%s" % (BASE, url_repo), body) as resp:
            res = json.load(resp)
        print("%s: 已推送 %s" % (repo_path, res["commit"]["sha"][:8]))
        return True
    except urllib.error.HTTPError as e:
        print("%s: PUT 失败 HTTP %s %s" % (repo_path, e.code, e.read().decode("utf-8", "ignore")[:300]))
        return False


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) < 2:
        print("用法: python wb_repo_push.py LOCAL_PATH REPO_PATH [LOCAL2 REPO2 ...]")
        sys.exit(1)
    ok = True
    i = 0
    while i < len(args):
        local = args[i]
        repo_path = args[i + 1] if i + 1 < len(args) else local
        if not push(local, repo_path):
            ok = ok  # 跳过不算失败
        i += 2
    sys.exit(0 if ok else 0)
