#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
凭据体检：一次性查清本项目所有 GitHub PAT 副本 + 云函数链路是否健康。

为什么需要这个脚本（2026-08-31 事故）：
  同一个 GitHub PAT 在本项目里有**两份互不相干的副本**：
    副本 1（本地）  ~/.workbuddy/secrets/wb_github_pat   ← Python 推送脚本用
    副本 2（Vercel） 环境变量 GITHUB_PAT                  ← 云函数用（站点「提交成绩」）
  PAT 过期时**必须两处一起换**，只换一处会让另一处静默失效。
  副本 2 失效时症状极具迷惑性：站点浏览、每日推送全都正常，
  只有「在线做小测 → 点提交成绩」报 HTTP 401，极易误判为代码 bug。

检查项：
  1. 本地 PAT 文件是否存在 / 是否有效 / scopes / 对仓库是否有 push 权限
  2. 云函数是否部署可达（OPTIONS）
  3. AUTH_KEY 是否已配置
  4. 云端 PAT（副本 2）是否有效 —— 通过 /api/health 端点
  5. 前端 app.js 里的 URL / KEY 配置

用法：
  python 03_部署脚本/wb_check_credentials.py
退出码：0 = 全部正常；1 = 有需要处理的凭据问题
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# ── 项目根（本文件在 03_部署脚本/ 下，上两级即项目根）──
PKG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_JS = os.path.join(PKG_ROOT, "01_站点前端", "app.js")

OWNER = "yingzheliu28-hash"
REPO = "kaogong-licai-workbench"
GH_USER = "https://api.github.com/user"
GH_REPO = "https://api.github.com/repos/%s/%s" % (OWNER, REPO)

UA = {"User-Agent": "wb-check-credentials"}

# ── 输出样式 ──
OK = "[  OK  ]"
BAD = "[ FAIL ]"
WARN = "[ WARN ]"
INFO = "[ INFO ]"


def line(tag, msg):
    print("%s %s" % (tag, msg))


def gh_get(token, url):
    """返回 (http_status, dict_or_None, scopes_str)"""
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": "token " + token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            **UA,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            body = json.load(r) if r.status == 200 else None
            return r.status, body, (r.headers.get("X-OAuth-Scopes") or "")
    except urllib.error.HTTPError as e:
        return e.code, None, (e.headers.get("X-OAuth-Scopes") or "")
    except Exception as e:
        return -1, None, ""


# ══════════════ 1. 本地 PAT ══════════════
def check_local():
    print("=" * 62)
    print("  副本 1：本地 PAT（Python 推送脚本用）")
    print("=" * 62)

    cands = [
        os.path.expanduser("~/.workbuddy/secrets/wb_github_pat"),
        os.path.join(PKG_ROOT, "04_密钥与配置", "wb_github_pat"),
    ]
    path = next((p for p in cands if os.path.isfile(p)), None)
    if not path:
        line(BAD, "未找到本地 PAT 文件，已尝试：")
        for p in cands:
            print("         %s" % p)
        return None

    with open(path, "r", encoding="utf-8") as f:
        token = f.read().strip()
    if not token:
        line(BAD, "PAT 文件为空：%s" % path)
        return None

    line(OK, "文件存在：%s" % path)
    line(INFO, "token 前缀=%s 长度=%d" % (token[:4], len(token)))

    st, body, scopes = gh_get(token, GH_USER)
    if st != 200 or not body:
        line(BAD, "token 无效 —— GitHub /user 返回 HTTP %s" % st)
        if st == 401:
            line(INFO, "401 = token 已过期或被撤销，需要重新生成")
        return token
    line(OK, "token 有效 —— 账号 %s" % body.get("login"))
    line(INFO, "scopes: %s" % (scopes or "(无)"))
    if "workflow" not in (scopes or ""):
        line(WARN, "缺 workflow scope —— 不影响主流程")
        line(INFO, "sync.yml 是 on: push: paths:['source/**']，写文件本身即触发重建")

    st2, body2, _ = gh_get(token, GH_REPO)
    if st2 == 200 and body2:
        perm = body2.get("permissions", {})
        if perm.get("push"):
            line(OK, "对 %s/%s 有写权限（push=True）" % (OWNER, REPO))
        else:
            line(BAD, "对 %s/%s 无写权限" % (OWNER, REPO))
    else:
        line(BAD, "无法读取仓库信息 HTTP %s" % st2)
    return token


# ══════════════ 2. 前端配置 ══════════════
def read_frontend_config():
    if not os.path.isfile(APP_JS):
        return None, None
    with open(APP_JS, "r", encoding="utf-8") as f:
        src = f.read()
    m_url = re.search(r'var\s+EXAM_SUBMIT_URL\s*=\s*"([^"]*)"', src)
    m_key = re.search(r'var\s+EXAM_AUTH_KEY\s*=\s*"([^"]*)"', src)
    return (m_url.group(1) if m_url else None), (m_key.group(1) if m_key else None)


# ══════════════ 3. 云函数 ══════════════
def check_cloud(sub_url, auth_key):
    """返回 True = 确认健康 / False = 确认有问题 / None = 无法验证"""
    print()
    print("=" * 62)
    print("  副本 2：Vercel 环境变量 GITHUB_PAT（站点「提交成绩」用）")
    print("=" * 62)

    if not sub_url:
        line(BAD, "前端未配置 EXAM_SUBMIT_URL，跳过云端检查")
        return False

    base = sub_url.rsplit("/api/", 1)[0]
    health_url = base + "/api/health"

    # 3.1 连通性
    try:
        req = urllib.request.Request(health_url, method="OPTIONS", headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            line(OK, "云函数可达（%s，OPTIONS %d）" % (base, r.status))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            line(WARN, "/api/health 端点尚未部署（404）")
            line(INFO, "本端点是 2026-08-31 新增的；把 06_云函数/ 重新部署后即可用")
            line(INFO, "未部署前，无法远程验证副本 2，只能用下面的「间接推断」")
            return check_cloud_indirect(sub_url, auth_key, base)
        line(BAD, "云函数 OPTIONS 返回 HTTP %s" % e.code)
        return False
    except Exception as e:
        line(BAD, "云函数不可达：%s" % e)
        return False


    # 3.2 调 health 端点
    q = urllib.parse.urlencode({"key": auth_key or ""})
    try:
        req = urllib.request.Request(health_url + "?" + q, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 403:
            line(BAD, "AUTH_KEY 不匹配（403）—— 前端 EXAM_AUTH_KEY 与 Vercel 端不一致")
            return False
        line(BAD, "health 端点返回 HTTP %s" % e.code)
        return False
    except Exception as e:
        line(BAD, "调用 health 端点失败：%s" % e)
        return False

    if not j.get("configured"):
        line(BAD, "Vercel 未配置 GITHUB_PAT 环境变量：%s" % j.get("error", ""))
        return False

    line(INFO, "云端 token 前缀=%s 长度=%s" % (j.get("token_prefix"), j.get("token_len")))
    if j.get("token_valid"):
        line(OK, "云端 token 有效 —— 账号 %s" % j.get("login"))
        line(INFO, "scopes: %s" % (j.get("scopes") or "(无)"))
        if j.get("repo_push"):
            line(OK, "对 %s/%s 有写权限" % (OWNER, REPO))
            return True
        line(BAD, "对 %s/%s 无写权限" % (OWNER, REPO))
        return False

    line(BAD, "云端 token 无效 —— %s" % j.get("error", "HTTP %s" % j.get("user_http")))
    return False


def check_cloud_indirect(sub_url, auth_key, base):
    """health 端点未部署时的降级推断：用错 key 探测服务端返回码。
    原理（见 submit.js 代码顺序）：
      500「未配置 GITHUB_PAT」→ 环境变量缺失
      403「key 校验失败」    → PAT 有值（因为 !token 检查排在 authKey 检查之前）
    """
    body = json.dumps(
        {"key": "__probe_invalid__", "date": "", "week": 0, "answers": [], "wrong": []}
    ).encode("utf-8")
    req = urllib.request.Request(
        sub_url, data=body, method="POST", headers={"Content-Type": "application/json", **UA}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            line(INFO, "探测返回 %d（意外，通常应为 403）" % r.status)
    except urllib.error.HTTPError as e:
        if e.code == 403:
            line(INFO, "GITHUB_PAT 已配置（返回 403 而非 500）")
            line(WARN, "但**无法远程验证它是否有效** —— health 端点未部署，返回「未知」")
            line(INFO, "若站点提交报 401，就是这个 token 过期了")
        elif e.code == 500:
            line(BAD, "Vercel 未配置 GITHUB_PAT（返回 500）")
            return False
        else:
            line(INFO, "探测返回 HTTP %s" % e.code)
    except Exception as e:
        line(BAD, "探测失败：%s" % e)
        return False
    return None  # 未知：能确认 PAT 有值，但无法验证有效性


# ══════════════ main ══════════════
def main():
    print()
    print("╔" + "═" * 60 + "╗")
    print("║" + "  考公理财工作台 · 凭据体检".center(52) + "║")
    print("╚" + "═" * 60 + "╝")
    print()

    local_token = check_local()

    print()
    print("=" * 62)
    print("  前端配置（01_站点前端/app.js）")
    print("=" * 62)
    sub_url, auth_key = read_frontend_config()
    if sub_url:
        line(OK, "EXAM_SUBMIT_URL = %s" % sub_url)
    else:
        line(WARN, "未找到 EXAM_SUBMIT_URL（站点「提交成绩」会降级为导出）")
    if auth_key:
        line(OK, "EXAM_AUTH_KEY 已配置（长度 %d）" % len(auth_key))
    else:
        line(WARN, "未找到 EXAM_AUTH_KEY")

    cloud_ok = check_cloud(sub_url, auth_key)

    # ── 总结 ──
    print()
    print("=" * 62)
    print("  结论")
    print("=" * 62)

    local_ok = local_token is not None

    # cloud_ok: True=健康 / False=有问题 / None=无法验证
    if local_ok and cloud_ok is True:
        line(OK, "两份 PAT 副本均有效，云函数链路健康")
        print()
        print("  站点「提交成绩（自动存档）」应能正常工作。")
        return 0

    print()
    if not local_ok:
        line(BAD, "副本 1（本地）有问题 → 推送脚本会报 401")
        print("     修复：重新生成 PAT → 覆盖写入 ~/.workbuddy/secrets/wb_github_pat")
    else:
        line(OK, "副本 1（本地）正常")

    if cloud_ok is False:
        line(BAD, "副本 2（Vercel）有问题 → 站点「提交成绩」会报 401")
        print("     修复（三步，缺一不可）：")
        print("       1. Vercel → kaogong-exam-api → Settings → Environment Variables")
        print("       2. 更新 GITHUB_PAT = 本地 PAT 文件的内容")
        print("       3. 点 Redeploy —— **不重新部署不生效**（Vercel 不热加载环境变量）")
    elif cloud_ok is None:
        line(WARN, "副本 2（Vercel）状态未知 —— health 端点未部署，无法远程验证")
        print("     想让它变成「可验证」，把 06_云函数/ 重新部署一次即可（会带上 api/health.js）。")
        print("     在那之前，判断副本 2 是否失效只能看站点提交是否报 401。")

    print()
    print("  📌 记住：PAT 过期时**两处必须一起换**，只换一处会让另一处静默失效。")
    print("     （详见 05_项目交接/README.md §2.1）")
    print()
    return 1


if __name__ == "__main__":
    sys.exit(main())
