#!/usr/bin/env bash
# 从 SnowLuma 容器日志里提取聊天记录，输出 JSON 数组
#   qqfeed.sh [容器名]
# 说明：
#   - 不传容器名时自动找 SnowLuma（名字或镜像里带 snowluma），找不到才退回 snowluma
#   - 日志里混有 x11vnc 的二进制帧，这里在脚本侧过滤干净，只把纯文本交给前端
#   - 每条记录带 uin（发送者/机器人 QQ），前端用它取 qlogo 头像；群聊事件也一并解析
#   - 带 mid，并从 qq-bridge 的 social-v2.json 合并图片/表情媒体元数据
#   - rootless podman 读不到日志时（权限 / 运行时目录不对）自动退回 journald
set -euo pipefail

CONTAINER="${1:-}"
[[ "$CONTAINER" == "auto" ]] && CONTAINER=""
UID_N=$(id -u)
: "${XDG_RUNTIME_DIR:=/run/user/$UID_N}"
export XDG_RUNTIME_DIR

if [[ -z "$CONTAINER" ]]; then
  CONTAINER=$(podman ps -a --format '{{.Names}}	{{.Image}}' 2>/dev/null \
    | awk -F'\t' 'tolower($1 " " $2) ~ /snowluma/ {print $1; exit}' || true)
fi
[[ -n "$CONTAINER" ]] || CONTAINER=snowluma

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

podman logs --since 24h "$CONTAINER" >"$TMP" 2>/dev/null || true
if ! grep -aqE '(OK|INFO).*(私聊|群聊|\[Event\])' "$TMP"; then
  journalctl --user -u "$CONTAINER" --since -24h -o cat >"$TMP" 2>/dev/null || true
fi
if ! grep -aqE '(OK|INFO).*(私聊|群聊|\[Event\])' "$TMP"; then
  journalctl -u "$CONTAINER" --since -24h -o cat >"$TMP" 2>/dev/null || true
fi

# 二代状态里有图片/表情的 media 元数据；和日志按 messageId 合并
SOCIAL="${QQ_SOCIAL_STATE:-${HOME:-/home/$(id -un)}/fish/qq-bridge/state/social-v2.json}"
[[ -f "$SOCIAL" ]] || SOCIAL="/home/$(id -un)/fish/qq-bridge/state/social-v2.json"
export QQ_SOCIAL_STATE="$SOCIAL"

QCFG="${QQ_CONFIG:-${HOME:-/home/$(id -un)}/fish/qq-bridge/config.json}"
[[ -f "$QCFG" ]] || QCFG="/home/$(id -un)/fish/qq-bridge/config.json"
export QQ_CONFIG="$QCFG"

grep -aE '(OK|INFO).*(私聊|群聊|\[Event\])' "$TMP" \
  | tail -80 \
  | python3 -c '
import datetime, json, os, re, sys, urllib.request

recv_priv = re.compile(r"(\d{2}:\d{2}:\d{2})\s+OK\s+\[(\d+)\]\s+\[Event\]\s+私聊\s+\[([^\]]+)\]\s*:\s*ID:(-?\d+)\s*(.*)")
recv_group = re.compile(r"(\d{2}:\d{2}:\d{2})\s+OK\s+\[(\d+)\]\s+\[Event\]\s+(\[自身\]\s+)?群\s+\[([^\]]+)\]\s*\|\s*\[([^\]]+)\]\s*:\s*ID:(-?\d+)\s*(.*)")
send = re.compile(r"(\d{2}:\d{2}:\d{2})\s+INFO\s+\[OneBot\]\s+(私聊|群聊)\s+(\d+)\s*\|\s*发送：(.*)")
uin_priv = re.compile(r"for\((\d+)\)")
uin_tail = re.compile(r"\((\d+)\)\s*$")

def clean(t):
    t = "".join(ch if ch >= " " or ch == "\t" else " " for ch in t)
    return re.sub(r"\s+", " ", t).strip()[:200]

def norm(t):
    return re.sub(r"\s+", "", t or "")

def reply_body(t):
    """去掉行首的 [回复 ...] / [引用 ...]，按括号深度找配对的右括号。"""
    t = (t or "").strip()
    if not (t.startswith("[回复") or t.startswith("[引用")):
        return t
    depth = 0
    for i, ch in enumerate(t):
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return t[i + 1:].strip()
    return t

def sec(t):
    p = str(t or "0:0:0").split(":")
    try:
        return int(p[0]) * 3600 + int(p[1]) * 60 + int(p[2])
    except Exception:
        return 0

def tdiff(a, b):
    d = abs(sec(a) - sec(b))
    return min(d, 86400 - d)

def media_from_segments(message):
    media = []
    parts = []
    for seg in message or []:
        typ = seg.get("type")
        data = seg.get("data") or {}
        if typ == "text":
            parts.append(str(data.get("text") or ""))
        elif typ == "face":
            parts.append("[表情]")
            fid = str(data.get("id") or "")
            if fid:
                media.append({"kind": "face", "faceId": fid})
        elif typ in ("image", "mface"):
            parts.append("[图片]" if typ == "image" else "[动画表情]")
            item = {"kind": "image"}
            for key in ("file", "url", "summary"):
                if data.get(key):
                    item[key] = str(data[key])[:1024]
            if typ == "mface" or str(data.get("sub_type") or "") == "1":
                item["subType"] = "1"
            if item.get("file") or item.get("url"):
                media.append(item)
    return clean("".join(parts)), media[:4]

# messageId -> 媒体元数据（来自 qq-bridge 的 social-v2.json）
media_map = {}
state_path = os.environ.get("QQ_SOCIAL_STATE") or ""
if state_path:
    try:
        data = json.load(open(state_path, encoding="utf-8"))
        for conv in (data.get("conversations") or {}).values():
            for msg in (conv.get("recentMessages") or []) + (conv.get("unread") or []):
                mid = str(msg.get("messageId") or "")
                items = []
                for x in msg.get("media") or []:
                    if not isinstance(x, dict):
                        continue
                    kind = "face" if (x.get("kind") == "face" or x.get("faceId")) else "image"
                    item = {"kind": kind}
                    for key in ("file", "url", "faceId", "summary", "subType"):
                        if x.get(key) is not None:
                            item[key] = str(x[key])[:1024]
                    items.append(item)
                if mid and items:
                    media_map[mid] = items[:4]
    except Exception:
        media_map = {}

out = []
convs = set()
bot_uin = ""

for line in sys.stdin:
    line = line.rstrip("\n")

    m = recv_priv.search(line)
    if m:
        bot_uin = m.group(2)
        raw = m.group(3)
        um = uin_priv.search(raw)
        who = re.sub(r"\s*for\(\d+\)\s*$", "", raw).strip()
        peer = um.group(1) if um else ""
        if peer:
            convs.add(("private", peer))
        item = {"time": m.group(1), "dir": "in", "scope": "私聊", "who": who,
                "uin": peer, "mid": m.group(4), "text": clean(m.group(5))}
        if m.group(4) in media_map:
            item["media"] = media_map[m.group(4)]
        out.append(item)
        continue

    m = recv_group.search(line)
    if m:
        bot_uin = m.group(2)
        raw = m.group(5)
        um = uin_tail.search(raw)
        who = re.sub(r"\(\d+\)\s*$", "", raw).strip()
        gm = re.search(r"\((\d+)\)\s*$", raw)
        gid = gm.group(1) if gm else ""
        if gid:
            convs.add(("group", gid))
        is_self = bool(m.group(3))
        item = {"time": m.group(1), "dir": "out" if is_self else "in",
                "scope": "群聊", "who": who,
                "uin": bot_uin if is_self else (um.group(1) if um else ""),
                "mid": m.group(6), "text": clean(m.group(7))}
        if m.group(6) in media_map:
            item["media"] = media_map[m.group(6)]
        out.append(item)
        continue

    m = send.search(line)
    if m:
        scope = m.group(2)
        peer = m.group(3)
        convs.add(("private" if scope == "私聊" else "group", peer))
        out.append({"time": m.group(1), "dir": "out", "scope": scope, "who": peer,
                    "uin": bot_uin, "mid": "", "text": clean(m.group(4))})

if bot_uin:
    for item in out:
        if item["dir"] == "out" and not item["uin"]:
            item["uin"] = bot_uin

# 发送日志没有 messageId，也没有图片 file；用 SnowLuma 历史补上自己发的图片。
need_history = any(
    (not item.get("media")) and re.search(r"\[(图片|动画表情|表情)\]", item.get("text") or "")
    for item in out
)
hist = []
mid_media = {}
if need_history and bot_uin and convs:
    try:
        cfg = json.load(open(os.environ.get("QQ_CONFIG") or "", encoding="utf-8"))
        sl = cfg.get("snowluma") or {}
        base = str(sl.get("httpUrl") or "").replace("0.0.0.0", "127.0.0.1").replace("[::]", "127.0.0.1").rstrip("/")
        token = str(sl.get("accessToken") or "")
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
    except Exception:
        base = ""
    if base:
        for kind, cid in list(convs)[:4]:
            q = "user_id" if kind == "private" else "group_id"
            endpoint = "get_friend_msg_history" if kind == "private" else "get_group_msg_history"
            try:
                req = urllib.request.Request(base + "/" + endpoint + "?" + q + "=" + str(cid) + "&count=30",
                                             headers=headers)
                with urllib.request.urlopen(req, timeout=3) as resp:
                    data = json.loads(resp.read(2 * 1024 * 1024).decode("utf-8", "replace"))
                for msg in (data.get("data") or {}).get("messages") or []:
                    mid = str(msg.get("message_id") or "")
                    text, media = media_from_segments(msg.get("message") or [])
                    if not media:
                        continue
                    try:
                        hms = datetime.datetime.fromtimestamp(int(msg.get("time") or 0)).strftime("%H:%M:%S")
                    except Exception:
                        hms = ""
                    h = {"mid": mid, "uid": str(msg.get("user_id") or ""), "time": hms,
                         "text": text, "media": media, "used": False}
                    hist.append(h)
                    if mid:
                        mid_media[mid] = media
            except Exception:
                continue

# 收到的消息按 messageId 补媒体
for item in out:
    mid = item.get("mid") or ""
    if not item.get("media") and mid in mid_media:
        item["media"] = mid_media[mid]

# 自己发出的消息：发送日志只有时间和文本，按“机器人 uid + 时间接近 + 文本相同”匹配历史
for item in out:
    if item["dir"] != "out" or item.get("media"):
        continue
    cands = [h for h in hist if h["uid"] == bot_uin and h["media"] and not h["used"]
             and h["time"] and tdiff(h["time"], item["time"]) <= 120]
    same = [h for h in cands if norm(h["text"]) == norm(item["text"])]
    if not same:
        same = [h for h in cands
                if re.search(r"\[(图片|动画表情)\]", h["text"])
                and re.search(r"\[(图片|动画表情)\]", item["text"] or "")]
    if same:
        h = min(same, key=lambda x: tdiff(x["time"], item["time"]))
        item["media"] = h["media"]
        item["mid"] = h["mid"] or item.get("mid", "")
        h["used"] = True

# [自身] 群事件和 INFO 发送行可能是同一条：发送行带 [回复:xxx]，
# 自身事件带完整引用，两者正文可能相同但前缀不同，所以比较去掉引用后的正文。
merged = []
for item in out:
    if merged:
        prev = merged[-1]
        if (prev["dir"] == item["dir"] == "out" and prev["scope"] == item["scope"]
                and norm(reply_body(prev["text"])) == norm(reply_body(item["text"]))
                and tdiff(prev["time"], item["time"]) <= 2):
            if item.get("media") and not prev.get("media"):
                prev["media"] = item["media"]
            if item.get("mid") and not prev.get("mid"):
                prev["mid"] = item["mid"]
                # 自身事件的 who 是机器人昵称，发送行的 who 是群号，合并时用前者
                if item.get("who"):
                    prev["who"] = item["who"]
                if item.get("uin"):
                    prev["uin"] = item["uin"]
            continue
    merged.append(item)
out = merged

print(json.dumps(out[-60:], ensure_ascii=False))
' || true
