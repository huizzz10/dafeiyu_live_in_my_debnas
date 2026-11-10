#!/usr/bin/env python3
"""debnas-web：独立 NAS 控制台后端

职责：
  - PAM 认证（系统账号密码），签名会话 cookie，CSRF 头校验
  - 静态托管前端（portal/）
  - 以 root 常驻执行白名单内的系统命令（rpc 注册表，客户端不能任意拼 shell）

安全边界：
  - 只有注册表里的方法可执行，参数由服务端模板拼装并做类型校验
  - 会话 8 小时过期，cookie HttpOnly + SameSite=Strict
  - 所有写操作要求 X-Debnas-CSRF 与会话内 token 一致
"""

import base64
import ctypes
import ctypes.util
import email.utils
import fcntl
import glob
import grp
import hashlib
import hmac
import ipaddress
import json
import os
import pty
import pwd
import re
import secrets
import select
import shlex
import shutil
import signal
import socket
import string
import struct
import subprocess
import sys
import tempfile
import termios
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

APP_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.environ.get("DEBNAS_WEB_STATIC", os.path.join(APP_DIR, "static"))
STATE_DIR = os.environ.get("DEBNAS_WEB_STATE", "/var/lib/debnas-web")
PORT = int(os.environ.get("DEBNAS_WEB_PORT", "8080"))
BIND = os.environ.get("DEBNAS_WEB_BIND", "127.0.0.1")
SESSION_TTL = 8 * 3600
LIB_HELPER = "/usr/local/lib/debnas-portal"


# 虚拟机（libvirt）配置；URI / 镜像目录可以用环境变量覆盖，便于测试或非默认部署
VM_URI = os.environ.get("DEBNAS_VM_URI", "qemu:///system")
VM_IMAGES_DIR = os.environ.get("DEBNAS_VM_IMAGES", "/var/lib/libvirt/images")
VM_ISO_DIRS = [VM_IMAGES_DIR] + [
    p for p in os.environ.get("DEBNAS_VM_ISO_DIRS", "").split(":") if p
]
VM_ISO_ROOTS = sorted(set(
    [VM_IMAGES_DIR, "/srv", "/home", "/mnt", "/media", "/opt"] + VM_ISO_DIRS
))
VM_ENV = dict(os.environ, LC_ALL="C", LANG="C")

os.makedirs(STATE_DIR, exist_ok=True)


# ---------------------------------------------------------------- PAM
class PamError(Exception):
    pass


libpam = ctypes.CDLL(ctypes.util.find_library("pam") or "libpam.so.0")
libc = ctypes.CDLL("libc.so.6", use_errno=True)
libc.calloc.restype = ctypes.c_void_p
libc.calloc.argtypes = [ctypes.c_size_t, ctypes.c_size_t]
libc.strdup.restype = ctypes.c_void_p
libc.strdup.argtypes = [ctypes.c_char_p]


class pam_message(ctypes.Structure):
    _fields_ = [("msg_style", ctypes.c_int), ("msg", ctypes.c_char_p)]


class pam_response(ctypes.Structure):
    _fields_ = [("resp", ctypes.c_char_p), ("resp_retcode", ctypes.c_int)]


class pam_conv(ctypes.Structure):
    _fields_ = [
        ("conv", ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.POINTER(pam_message)),
                                  ctypes.POINTER(ctypes.POINTER(pam_response)), ctypes.c_void_p)),
        ("appdata_ptr", ctypes.c_void_p),
    ]


PAM_PROMPT_ECHO_OFF = 1
PAM_PROMPT_ECHO_ON = 2
PAM_ERROR_MSG = 3
PAM_TEXT_INFO = 4


def pam_authenticate(username: str, password: str, service: str = "debnas-web") -> None:
    """校验系统账号密码；失败抛 PamError。"""
    keep = []  # 保持 response 对象存活，PAM 在返回后仍会读取

    def conv(n_messages, messages, responses, appdata):
        """PAM 会 free() 这些响应，所以必须用 libc 分配的内存。"""
        try:
            msgs = ctypes.cast(messages, ctypes.POINTER(ctypes.POINTER(pam_message)))
            resps = ctypes.cast(responses, ctypes.POINTER(ctypes.POINTER(pam_response)))
            arr = libc.calloc(n_messages, ctypes.sizeof(pam_response))
            arr_p = ctypes.cast(arr, ctypes.POINTER(pam_response))
            for i in range(n_messages):
                msg = msgs[i].contents
                if msg.msg_style in (PAM_PROMPT_ECHO_OFF, PAM_PROMPT_ECHO_ON):
                    arr_p[i].resp = ctypes.cast(libc.strdup(password.encode("utf-8")), ctypes.c_char_p)
                else:
                    arr_p[i].resp = None
                arr_p[i].resp_retcode = 0
            resps[0] = arr_p
            return 0
        except Exception:
            return 19  # PAM_CONV_ERR

    conv_fn = ctypes.CFUNCTYPE(
        ctypes.c_int, ctypes.c_int,
        ctypes.POINTER(ctypes.POINTER(pam_message)),
        ctypes.POINTER(ctypes.POINTER(pam_response)),
        ctypes.c_void_p,
    )(conv)
    conv_struct = pam_conv(conv_fn, None)

    handle = ctypes.c_void_p()
    rc = libpam.pam_start(service.encode(), username.encode(),
                          ctypes.byref(conv_struct), ctypes.byref(handle))
    if rc != 0:
        raise PamError("无法初始化认证（%d）" % rc)
    try:
        rc = libpam.pam_authenticate(handle, 0)
        if rc != 0:
            raise PamError("用户名或密码错误")
        rc = libpam.pam_acct_mgmt(handle, 0)
        if rc != 0:
            raise PamError("账号不可用（可能被锁定或已过期）")
    finally:
        libpam.pam_end(handle, 0)


# ---------------------------------------------------------------- 会话
sessions = {}
sessions_lock = threading.Lock()
# 同一时间只允许一个 apt 升级任务，避免重复点击把 dpkg 锁撞成 500
apt_upgrade_lock = threading.Lock()


def secret() -> bytes:
    path = os.path.join(STATE_DIR, "secret")
    if not os.path.exists(path):
        with open(path, "wb") as f:
            f.write(secrets.token_bytes(32))
        os.chmod(path, 0o600)
    with open(path, "rb") as f:
        return f.read()


def sign(token: str) -> str:
    return hmac.new(secret(), token.encode(), hashlib.sha256).hexdigest()[:32]


def is_sudoer(user: str) -> bool:
    for g in ("sudo", "wheel", "admin"):
        out = run(["sh", "-c", "getent group %s 2>/dev/null" % g]).get("out", "")
        if out:
            members = out.strip().split(":")[-1].split(",")
            if user in [m.strip() for m in members]:
                return True
    return False


def new_session(user: str) -> dict:
    token = secrets.token_urlsafe(24)
    sess = {"user": user, "csrf": secrets.token_urlsafe(24), "exp": time.time() + SESSION_TTL,
            "sudoer": is_sudoer(user)}
    with sessions_lock:
        sessions[token] = sess
    return {"token": token, "csrf": sess["csrf"], "user": user}


def get_session(token: str):
    if not token:
        return None
    with sessions_lock:
        sess = sessions.get(token)
        if not sess:
            return None
        if sess["exp"] < time.time():
            sessions.pop(token, None)
            return None
        return sess


# ---------------------------------------------------------------- 命令
def run(argv, timeout=30, as_user=None, env=None):
    if as_user:
        argv = ["sudo", "-n", "-u", as_user, "--"] + argv
    try:
        p = subprocess.run(argv, capture_output=True, text=True, errors="replace", timeout=timeout, env=env)
        return {"ok": p.returncode == 0, "out": p.stdout, "err": p.stderr, "code": p.returncode}
    except subprocess.TimeoutExpired:
        return {"ok": False, "out": "", "err": "命令超时", "code": -1}
    except FileNotFoundError:
        return {"ok": False, "out": "", "err": "命令不存在", "code": -2}


def run_in(argv, data="", timeout=60):
    try:
        p = subprocess.run(argv, input=data, capture_output=True, text=True, errors="replace", timeout=timeout)
        return {"ok": p.returncode == 0, "out": p.stdout, "err": p.stderr, "code": p.returncode}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "out": "", "err": str(e), "code": -1}


def as_root(argv):
    """需要 root 的命令：服务本身是 root 时直接执行，否则用免密 sudo。"""
    argv = [str(a) for a in argv]
    if os.geteuid() == 0:
        return argv
    return ["sudo", "-n"] + argv


def safe_path(p: str) -> str:
    """只允许绝对路径，且不含空字节。"""
    if not p.startswith("/") or "\x00" in p:
        raise ValueError("非法路径")
    return p


def is_safe_name(p: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9._@-]{1,100}", p or ""))


def app_version() -> str:
    """读 APP_DIR/VERSION；部署后就是本仓库的版本号，读不到给 unknown。"""
    # 部署后 VERSION 就摆在 server.py 旁边；在仓库里直接跑时它在上一级
    for base in (APP_DIR, os.path.dirname(APP_DIR)):
        try:
            with open(os.path.join(base, "VERSION"), encoding="utf-8") as f:
                return f.read().strip() or "unknown"
        except OSError:
            continue
    return "unknown"


def rpc_info(_):
    # hostname / uname / uptime / df 都可以直接读内核和 statvfs，别再 fork 四个子进程
    uname = os.uname()
    try:
        with open("/proc/uptime") as f:
            uptime = float(f.read().split()[0])
    except Exception:
        uptime = 0.0
    smbd = "active" in run(["systemctl", "is-active", "smbd"]).get("out", "")
    mem = {}
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                k, v = line.split(":", 1)
                mem[k] = int(v.split()[0])
    except Exception:
        pass
    try:
        st = os.statvfs("/")
        unit = st.f_frsize / 1024
        total = int(st.f_blocks * unit)
        free = int(st.f_bavail * unit)
        used = int((st.f_blocks - st.f_bfree) * unit)
    except Exception:
        total = free = used = 0
    version = app_version()
    return {
        "host": uname.nodename, "kernel": uname.release, "uptime": uptime,
        "version": version,
        "memTotal": mem.get("MemTotal", 0), "memAvailable": mem.get("MemAvailable", 0),
        "swapTotal": mem.get("SwapTotal", 0), "swapFree": mem.get("SwapFree", 0),
        "diskTotal": total, "diskUsed": used, "diskFree": free,
        "samba": smbd,
    }


def rpc_journal(params):
    lines = int(params.get("lines", 150))
    lines = max(1, min(2000, lines))
    argv = ["journalctl", "-o", "json", "--no-pager", "-n", str(lines)]
    unit = params.get("unit") or ""
    if unit:
        if not re.fullmatch(r"[A-Za-z0-9@._-]+", unit):
            raise ValueError("非法单元名")
        argv += ["-u", unit]
    return run(argv)


def rpc_listdir(params):
    path = safe_path(params.get("path", "/"))
    if not os.path.exists(path):
        raise ValueError("路径不存在：%s" % path)
    if not os.path.isdir(path):
        raise ValueError("不是目录：%s" % path)
    return run(["ls", "-la", "--time-style=+%s", path])


def rpc_services(_):
    return run(["systemctl", "list-units", "--type=service", "--state=running",
                "--no-legend", "--plain"])


def rpc_power(_):
    try:
        with open("/run/debnas-portal/power.json") as f:
            return json.load(f)
    except Exception:
        return {}



def rpc_realtime(_):
    """网速和功耗一起取，前端 3s 轮询只发一个请求。"""
    return {"net": rpc_net(None), "power": rpc_power(None)}


def rpc_shares(_):
    """解析 smb.conf 的共享段（只读）。"""
    import glob
    text = ""
    try:
        with open("/etc/samba/smb.conf", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except Exception:
        return {"shares": [], "global": {}}
    global_conf, shares, cur = {}, [], None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", ";")):
            continue
        m = re.fullmatch(r"\[(.+)\]", line)
        if m:
            cur = {"name": m.group(1), "path": "", "comment": "", "readonly": False,
                   "guest": False, "browseable": True, "printable": False}
            if cur["name"].lower() != "global":
                shares.append(cur)
            else:
                cur = None
            continue
        if "=" not in line:
            continue
        k, v = [x.strip() for x in line.split("=", 1)]
        if cur is None:
            global_conf[k.lower()] = v
        else:
            kl = k.lower()
            if kl == "path":
                cur["path"] = v
            elif kl == "comment":
                cur["comment"] = v
            elif kl == "read only":
                cur["readonly"] = v.lower() in ("yes", "true", "1")
            elif kl == "guest ok":
                cur["guest"] = v.lower() in ("yes", "true", "1")
            elif kl == "browseable":
                cur["browseable"] = v.lower() in ("yes", "true", "1")
            elif kl == "printable":
                cur["printable"] = v.lower() in ("yes", "true", "1")
    # 隐藏 Samba 内置共享：homes / printers / print$ / 打印队列 / 不可浏览的
    builtin = {"homes", "printers", "print$", "ipc$"}
    visible = [x for x in shares
               if x["name"].lower() not in builtin
               and not x.get("printable")
               and x.get("browseable", True)]
    return {"shares": visible, "global": global_conf}


def rpc_users(_):
    out = run(["getent", "passwd"]).get("out", "")
    users = []
    no_login = ("nologin", "false", "sync", "shutdown", "halt")
    for line in out.splitlines():
        parts = line.split(":")
        if len(parts) < 7:
            continue
        name, uid_s, gid_s, home, shell = parts[0], parts[2], parts[3], parts[5], parts[6]
        uid = int(uid_s) if uid_s.isdigit() else 0
        gid = int(gid_s) if gid_s.isdigit() else 0
        deletable = True
        if name == "root":
            deletable = False
        else:
            # 只保留真正的用户账号：uid 在 1000-59999 且 shell 可登录
            if uid < 1000 or uid >= 60000 or shell.endswith(no_login):
                continue
        users.append({"name": name, "uid": uid, "gid": gid, "home": home,
                      "shell": shell, "deletable": deletable})
    groups = run(["getent", "group"]).get("out", "")
    gl = []
    for line in groups.splitlines():
        parts = line.split(":")
        if len(parts) < 4:
            continue
        if parts[0] in ("root", "sudo", "users", "nogroup"):
            continue
        gl.append({"name": parts[0], "gid": int(parts[2] or 0), "members": parts[3].split(",") if parts[3] else []})
    return {"users": users, "groups": gl}


def rpc_storage(_):
    import json as _json
    try:
        data = _json.loads(run(["lsblk", "-J", "-b", "-o",
                                "NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL,TRAN,ROTA"]).get("out", "{}"))
    except Exception:
        data = {"blockdevices": []}
    df = run(["df", "-kP"]).get("out", "")
    usage = {}
    for line in df.splitlines()[1:]:
        f = line.split()
        if len(f) >= 6:
            # 前端 fmtBytes 以 KB 为单位
            usage[f[5]] = {"total": int(f[1]), "used": int(f[2]), "free": int(f[3])}
    return {"blockdevices": data.get("blockdevices", []), "usage": usage}


APP_SKIP_PORTS = {3000, 3001, 3100}  # OneBot / 桥接内部端口，前端不展示也不探测
APP_PROBE_TIMEOUT = "0.6"


def _probe_app(port):
    """一次 curl 同时拿状态码和标题；连不上的端口最多等 0.6s，不拖累其它端口。"""
    r = run(["curl", "-sS", "-m", APP_PROBE_TIMEOUT, "-o", "-", "-w", "\n%{http_code}",
             "http://127.0.0.1:%d/" % port], timeout=2)
    out = r.get("out") or ""
    body, _, code = out.rpartition("\n")
    code = code.strip()
    if not re.fullmatch(r"\d{3}", code):
        code = "000"
    title = ""
    m = re.search(r"<title>([^<]*)", body[:200000], re.I)
    if m:
        title = m.group(1).strip()
    return {"code": code, "title": title}


def rpc_apps(_):
    run_as = os.environ.get("DEBNAS_WEB_RUN_AS") or None
    out = run(["sh", "-c", "XDG_RUNTIME_DIR=/run/user/$(id -u) podman ps --format '{{.Names}}|{{.Ports}}'"],
              as_user=run_as)
    entries = []
    for line in out.get("out", "").splitlines():
        if "|" not in line:
            continue
        name, ports = line.split("|", 1)
        seen = set()
        for m in re.finditer(r"(?:[0-9.]+|\[::\]):(\d+)->", ports):
            port = int(m.group(1))
            if port in seen or port in APP_SKIP_PORTS:
                continue
            seen.add(port)
            entries.append({"name": name, "port": port, "code": "000", "title": ""})
    # 迁移后的机器人宿主进程：AstrBot 控制台 / NapCat 面板
    for name, port in (("astrbot", 6185), ("napcat", 6099)):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.4):
                pass
        except OSError:
            continue
        if any(e["port"] == port for e in entries):
            continue
        entries.append({"name": name, "port": port, "code": "000", "title": ""})
    if not entries:
        return []

    ports = sorted({e["port"] for e in entries})
    with ThreadPoolExecutor(max_workers=min(8, len(ports))) as ex:
        probed = dict(zip(ports, ex.map(_probe_app, ports)))
    for e in entries:
        e.update(probed.get(e["port"]) or {"code": "000", "title": ""})
    return entries


def _portal_home():
    user = os.environ.get("DEBNAS_WEB_RUN_AS")
    try:
        return pwd.getpwnam(user).pw_dir if user else os.path.expanduser("~")
    except KeyError:
        return os.path.expanduser("~")


def rpc_credentials(_):
    """登录后才可见的面板入口与凭据（密码只从 0600 的本地文件读）。"""
    home = _portal_home()
    def port_up(port):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.4):
                return True
        except OSError:
            return False

    out = {
        "astrbot": {"username": "astrbot", "password": "", "port": 6185,
                    "online": port_up(6185)},
        "napcat": {"token": "", "port": 6099, "online": port_up(6099)},
    }
    path = os.environ.get("DEBNAS_CREDENTIALS_FILE") or os.path.join(
        home, ".config", "debnas-web", "credentials.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        ab = data.get("astrbot") or {}
        for key in ("username", "password"):
            if ab.get(key):
                out["astrbot"][key] = str(ab[key])
    except Exception:
        pass
    napcat = os.environ.get("DEBNAS_NAPCAT_WEBUI") or os.path.join(
        home, "Napcat", "opt", "QQ", "resources", "app", "app_launcher",
        "napcat", "config", "webui.json")
    try:
        with open(napcat, encoding="utf-8") as f:
            out["napcat"]["token"] = str(json.load(f).get("token") or "")
    except Exception:
        pass
    return out


QQ_FEED_CACHE = {"at": 0, "data": []}
QQ_FEED_TTL = float(os.environ.get("DEBNAS_QQ_FEED_TTL", "1"))


def _astrbot_history_path():
    path = os.environ.get("DEBNAS_QQ_HISTORY", "")
    if path:
        return path
    user = os.environ.get("DEBNAS_WEB_RUN_AS")
    try:
        home = pwd.getpwnam(user).pw_dir if user else os.path.expanduser("~")
    except KeyError:
        home = os.path.expanduser("~")
    return os.path.join(home, "astrbot-src", "data", "plugin_data",
                        "astrbot_plugin_feiyu", "history.jsonl")


def _astrbot_media_dir():
    return os.path.join(os.path.dirname(_astrbot_history_path()), "media")


def _qq_home():
    user = os.environ.get("DEBNAS_WEB_RUN_AS")
    try:
        return pwd.getpwnam(user).pw_dir if user else os.path.expanduser("~")
    except KeyError:
        return os.path.expanduser("~")


def _image_ext(raw):
    if raw[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return ".webp"
    return ".jpg"


_IMAGE_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _qq_face(face_id):
    """读 QQ 客户端本地缓存的系统表情（240px PNG，按表情 ID 分目录放着）。"""
    if not re.fullmatch(r"[0-9]{1,4}", face_id or ""):
        raise ValueError("非法表情 ID")
    root = os.path.join(_qq_home(), ".config", "QQ")
    try:
        entries = sorted(os.listdir(root), reverse=True)
    except OSError:
        raise FileNotFoundError("没有 QQ 缓存目录") from None
    for entry in entries:
        if not entry.startswith("nt_qq_"):
            continue
        folder = os.path.join(root, entry, "nt_data", "Emoji", "BaseEmojiSyastems",
                              "EmojiSystermResource", face_id, "png")
        for name in (face_id + ".png", face_id + "_0.png"):
            path = os.path.join(folder, name)
            if os.path.isfile(path):
                with open(path, "rb") as f:
                    return f.read(), "image/png"
    raise FileNotFoundError("没有这个表情")


def _qq_image(name):
    """读聊天图片：先在插件 media 目录找，再找 debnas 自己缓存的表情包。"""
    if not re.fullmatch(r"[A-Za-z0-9]{1,64}\.(jpg|jpeg|png|gif|webp)", name or ""):
        raise ValueError("非法文件名")
    for folder in (_astrbot_media_dir(), _debnas_media_dir()):
        if not folder:
            continue
        path = os.path.join(folder, name)
        if not os.path.isfile(path):
            continue
        with open(path, "rb") as f:
            data = f.read(12 * 1024 * 1024 + 1)
        if not data or len(data) > 12 * 1024 * 1024:
            raise ValueError("图片过大")
        return data, _IMAGE_TYPES.get(os.path.splitext(name)[1].lower(), "application/octet-stream")
    raise FileNotFoundError(name)



def _debnas_media_dir():
    """debnas 自己的图片缓存：收到的图和她发出去的表情包都放这儿（不写 AstrBot 目录）。"""
    for base in (os.path.join(STATE_DIR, "media"),
                 os.path.join(_qq_home(), ".cache", "debnas-web", "media")):
        try:
            os.makedirs(base, exist_ok=True)
            return base
        except OSError:
            continue
    return None


def _astrbot_temp_dir():
    return os.path.join(_qq_home(), "astrbot-src", "data", "temp")


def _cache_local_image(path):
    """AstrBot 收到的图片会原样落在 data/temp 下，GIF 也保留动画，优先用这个。

    会话库里存的是 base64 JPEG（GIF 只剩一帧），所以有原文件就别用 base64。
    """
    home = os.path.realpath(_qq_home())
    if not path or not os.path.isabs(path):
        return None
    real = os.path.realpath(path)
    if not real.startswith(home + os.sep):
        return None
    folder = _debnas_media_dir()
    if not folder:
        return None
    try:
        with open(real, "rb") as fh:
            raw = fh.read(8 * 1024 * 1024 + 1)
    except OSError:
        return None
    if not raw or len(raw) > 8 * 1024 * 1024:
        return None
    name = hashlib.md5(raw).hexdigest() + _image_ext(raw)
    try:
        dest = os.path.join(folder, name)
        if not os.path.isfile(dest):
            with open(dest, "wb") as fh:
                fh.write(raw)
    except OSError:
        return None
    return name


_RECEIVED_IMAGES = {}


def _cache_received_image(url):
    """会话库里的图片是 base64 data URL，解码后按 md5 存进 debnas 缓存目录。"""
    if url in _RECEIVED_IMAGES:
        return _RECEIVED_IMAGES[url]
    folder = _debnas_media_dir()
    name = None
    raw = b""
    if folder:
        try:
            if url.startswith("data:"):
                _, _, payload = url.partition(",")
                raw = base64.b64decode(payload, validate=False)
            elif url.startswith(("http://", "https://")):
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=8) as resp:
                    raw = resp.read(8 * 1024 * 1024 + 1)
        except Exception:  # noqa: BLE001
            raw = b""
        if raw and len(raw) <= 8 * 1024 * 1024:
            name = hashlib.md5(raw).hexdigest() + _image_ext(raw)
            try:
                dest = os.path.join(folder, name)
                if not os.path.isfile(dest):
                    with open(dest, "wb") as fh:
                        fh.write(raw)
            except OSError:
                name = None
    if len(_RECEIVED_IMAGES) > 800:
        _RECEIVED_IMAGES.clear()
    _RECEIVED_IMAGES[url] = name
    return name


def _sticker_catalog():
    """只读表情清单：id -> {md5, url}。文件是 AstrBot 插件的，这里只读不写。"""
    path = os.path.join(os.path.dirname(_astrbot_media_dir()), "stickers.json")
    try:
        with open(path, encoding="utf-8") as fh:
            rows = json.load(fh)
    except (OSError, ValueError):
        return {}
    out = {}
    for rec in rows if isinstance(rows, list) else []:
        if not isinstance(rec, dict):
            continue
        sid = str(rec.get("id") or "")
        md5 = str(rec.get("md5") or "").lower()
        url = str(rec.get("url") or "")
        if sid and re.fullmatch(r"[0-9a-f]{32}", md5) and url.startswith(("http://", "https://")):
            out[sid] = {"md5": md5, "url": url}
    return out


def _journal_commands(since):
    """journalctl 的几种取法，挨个试到能读出内容为止。

    root 跑服务时 `--user-unit` 看到的是 root 自己的用户日志，所以要直接
    `--file` 读目标用户的 journal 文件；普通用户反过来用 `--user-unit`。
    """
    tail = ["--since", since, "-o", "json", "--no-pager"]
    cmds = []
    uid = 1000
    user = os.environ.get("DEBNAS_WEB_RUN_AS")
    if user:
        try:
            uid = pwd.getpwnam(user).pw_uid
        except KeyError:
            pass
    if os.geteuid() == 0:
        files = []
        for base in ("/var/log/journal", "/run/log/journal"):
            files.extend(
                path for path in glob.glob(os.path.join(base, "*", f"user-{uid}.journal"))
            )
        if files:
            cmd = ["journalctl"]
            for path in sorted(files)[:4]:
                cmd += ["--file", path]
            cmds.append(cmd + tail)
    cmds.append(["journalctl", "--user-unit", "astrbot.service"] + tail)
    cmds.append(["journalctl", "--user", "-u", "astrbot"] + tail)
    return cmds


_JOURNAL = {"since": 0.0, "at": 0.0, "items": [], "chat": ""}
_JOURNAL_TTL = 2.0
_EVENT_LINE = re.compile(r"\[default\] \[[^\]]*\] (\d+)/(\d+):")
_SESSION_LINE = re.compile(r"Message sent to session (\w+):(\w+):(\d+)")
_TOOL_LINE = re.compile(r"使用工具：(sticker_send|send_message_to_user)，参数：(.*)$")
_STICKER_ARG = re.compile(r"'sticker_id': '([^']+)'")
_IMAGE_ARG = re.compile(r"'type': 'image'[^}]*?'(?:path|file)': '([^']+)'")
_IMAGE_URL_ARG = re.compile(r"'type': 'image'[^}]*?'url': '([^']+)'")


def _parse_journal(raw, chat):
    """解析一段 journal JSON，返回 (新条目, 最后一条会话)。"""
    items = []
    pending = []
    for line in raw.splitlines():
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        msg = rec.get("MESSAGE")
        if not isinstance(msg, str):
            continue
        if rec.get("_SYSTEMD_USER_UNIT") not in (None, "", "astrbot.service"):
            continue
        sess = _SESSION_LINE.search(msg)
        if sess:
            target = ("group:" if "Group" in sess.group(2) else "private:") + sess.group(3)
            for it in pending:
                it["chat"] = it["chat"] or target
            pending = []
            continue
        ev = _EVENT_LINE.search(msg)
        if ev:
            left, right = ev.group(1), ev.group(2)
            chat = f"private:{right}" if left == right else f"group:{left}"
            continue
        hit = _TOOL_LINE.search(msg)
        if not hit:
            continue
        try:
            ts = int(rec.get("__REALTIME_TIMESTAMP") or 0) / 1_000_000
        except (TypeError, ValueError):
            continue
        if not ts or not chat:
            continue
        tool, args = hit.group(1), hit.group(2)
        found = []
        if tool == "sticker_send":
            m = _STICKER_ARG.search(args)
            if m:
                found.append({"kind": "sticker", "ref": m.group(1)})
        else:
            for m in _IMAGE_ARG.finditer(args):
                found.append({"kind": "path", "ref": m.group(1)})
            if not found:
                for m in _IMAGE_URL_ARG.finditer(args):
                    found.append({"kind": "url", "ref": m.group(1)})
        for item in found:
            it = {"ts": ts, "chat": chat, "kind": item["kind"], "ref": item["ref"]}
            items.append(it)
            pending.append(it)
    return items, chat


def _journal_sticker_sends(hours=24):
    """从 AstrBot 的用户日志里捡出她发出去的表情包 / 图片。

    只读 journalctl，不碰 AstrBot 代码。两条发送路径都要认：
      - sticker_send：参数里带 sticker_id
      - send_message_to_user：参数里带 image 的 path / url
    会话优先用工具结果里的 “Message sent to session ...”，没有就往前推事件行。

    性能：首次读 `hours` 小时，之后只读「上次读到的位置 -2 秒」，增量拼到缓存里，
    日志刷新从 560ms 降到几十毫秒，所以能 3 秒刷一次。
    """
    now = time.time()
    if now - _JOURNAL["at"] < _JOURNAL_TTL:
        return _JOURNAL["items"]
    since = _JOURNAL["since"]
    if since and now - since < hours * 3600:
        since_arg = "@%d" % int(since - 2)
    else:
        since_arg = "-%dh" % int(hours)
    raw = ""
    for cmd in _journal_commands(since_arg):
        try:
            raw = subprocess.run(cmd, capture_output=True, text=True, timeout=20).stdout
        except (OSError, subprocess.SubprocessError):
            raw = ""
        if raw.strip():
            break
    fresh, chat = _parse_journal(raw, _JOURNAL["chat"])
    if fresh:
        known = {(int(it["ts"]), it["kind"], it["ref"]) for it in _JOURNAL["items"]}
        merged = _JOURNAL["items"] + [it for it in fresh
                                      if (int(it["ts"]), it["kind"], it["ref"]) not in known]
        _JOURNAL["items"] = [it for it in merged if it["ts"] >= now - 86400]
    _JOURNAL["chat"] = chat
    if fresh or raw.strip() or not _JOURNAL["since"]:
        _JOURNAL["since"] = now
    _JOURNAL["at"] = now
    return _JOURNAL["items"]


def _sticker_image(sticker_id):
    """把某张表情的图片弄成本地文件，返回文件名（失败返回 None）。"""
    cat = _sticker_catalog().get(sticker_id)
    folder = _debnas_media_dir() if cat else None
    if not cat or not folder:
        return None
    for ext in _IMAGE_TYPES:
        if os.path.isfile(os.path.join(folder, cat["md5"] + ext)):
            return cat["md5"] + ext
    try:
        req = urllib.request.Request(cat["url"], headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read(8 * 1024 * 1024 + 1)
    except Exception:  # noqa: BLE001
        return None
    if not raw or len(raw) > 8 * 1024 * 1024:
        return None
    if raw[:3] == b"\xff\xd8\xff":
        ext = ".jpg"
    elif raw[:8] == b"\x89PNG\r\n\x1a\n":
        ext = ".png"
    elif raw[:6] in (b"GIF87a", b"GIF89a"):
        ext = ".gif"
    elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        ext = ".webp"
    else:
        ext = ".jpg"
    name = cat["md5"] + ext
    try:
        with open(os.path.join(folder, name), "wb") as fh:
            fh.write(raw)
    except OSError:
        return None
    return name


def _sticker_last_used():
    """journal 读不到时的兜底：插件会往 stickers.json 写 lastUsedAt（毫秒）。"""
    path = os.path.join(os.path.dirname(_astrbot_media_dir()), "stickers.json")
    try:
        with open(path, encoding="utf-8") as fh:
            rows = json.load(fh)
    except (OSError, ValueError):
        return []
    out = []
    for rec in rows if isinstance(rows, list) else []:
        if not isinstance(rec, dict):
            continue
        try:
            ts = int(rec.get("lastUsedAt") or 0) / 1000
        except (TypeError, ValueError):
            continue
        if ts:
            out.append({"ts": ts, "chat": "", "kind": "sticker",
                        "ref": str(rec.get("id") or "")})
    return out


def _sent_sticker_feed():
    """把「她发了表情包」补成消息流条目（文本用 [图片]，图走本地缓存）。"""
    now = time.time()
    sends = list(_journal_sticker_sends())
    # stickers.json 的 lastUsedAt 一直当第二来源：日志读不到（root 读用户 journal
    # 有时会失败）时她发的表情包也不会整条消失。会话按最近那条她发的话归属。
    from_journal = [it for it in sends if it.get("kind") == "sticker"]
    recent = None
    for send in _sticker_last_used():
        if send["ts"] < now - 86400:
            continue
        if any(abs(send["ts"] - it["ts"]) <= 180 for it in from_journal):
            continue
        if recent is None:
            recent = [it for it in _astrbot_feed() if it.get("dir") == "out"]
        near = [it for it in recent if abs(it["ts"] - send["ts"]) <= 300]
        if not near:
            continue
        send["chat"] = min(near, key=lambda it: abs(it["ts"] - send["ts"]))["chat"]
        sends.append(send)
    out = []
    for send in sends:
        if not send.get("chat") or send["ts"] < now - 86400:
            continue
        kind = send.get("kind") or "sticker"
        if kind == "sticker":
            name = _sticker_image(send.get("ref") or send.get("sticker") or "")
        elif kind == "path":
            name = _cache_local_image(send.get("ref") or "")
        else:
            name = _cache_received_image(send.get("ref") or "")
        if not name:
            continue
        out.append({
            "ts": send["ts"],
            "time": time.strftime("%H:%M:%S", time.localtime(send["ts"])),
            # date / who 必须带上：前端按 date 切「今天 / 昨天」分组，
            # 缺了会在这条表情包前面插一个「最近」分组，看着像顺序乱了。
            "date": time.strftime("%Y-%m-%d", time.localtime(send["ts"])),
            "chat": send["chat"],
            "dir": "out",
            "name": _qq_name("bot"),
            "who": _qq_name("bot"),
            "uin": os.environ.get("DEBNAS_QQ_BOT_UIN", ""),
            "text": "[图片]",
            "media": [{"kind": "image", "file": name}],
        })
    return out


_QQ_NAMES = {"bot": "机器人", "owner": "我"}


def _qq_name(kind):
    """机器人和对方在消息流里显示的名字。

    走环境变量，仓库里不留真实 QQ 号和人设名；没配就用中性默认值。
    """
    env = "DEBNAS_QQ_BOT_NAME" if kind == "bot" else "DEBNAS_QQ_OWNER_NAME"
    return os.environ.get(env) or _QQ_NAMES[kind]


def _clean_feed_text(text):
    """去掉提醒/引用/附件路径这些内部标记，只留下能看的聊天文本。"""
    text = str(text or "")
    text = re.sub(r"<Quoted Message>.*?</Quoted Message>", "", text, flags=re.S)
    text = re.sub(r"<system_reminder>.*?</system_reminder>", "", text, flags=re.S)
    # AstrBot 把工具返回的图片包成内部 user 消息，占位文本不是聊天内容。
    # 上行文本可能已被截断（结尾没有 ]），所以按行吃到行尾。
    text = re.sub(r"\[Image from tool [^\]\n]*\]?", "", text)
    # 纯图片消息在模型侧会带一条附件说明，控制台只需要 [图片] 这个占位
    text = re.sub(r"\[Image Attachment[^\]\n]*\]?", "", text)
    # 插件按 QQ 号给主人消息加的标记，控制台里不用重复显示
    text = re.sub(r"^\s*【管理员】\s*", "", text)
    m = re.search(r"\[File Attachment: name ([^,\]]+)", text)
    if m:
        text = "[文件] " + m.group(1).strip()
    text = text.strip()
    if text.startswith("【%s的" % _qq_name("bot")) or text.startswith("【系统"):
        return ""
    return text


_MENTION_RE = re.compile(r"@([^@()]{1,24}?)\((\d{5,12})\)")


def _astrbot_feed():
    """读 QQ 插件新写入的实时记录（只认 src=astrbot 的行）。"""
    try:
        with open(_astrbot_history_path(), encoding="utf-8", errors="replace") as f:
            lines = f.readlines()[-1200:]
    except OSError:
        return []
    now = time.time()
    bot_uin = os.environ.get("DEBNAS_QQ_BOT_UIN", "")
    owner = os.environ.get("DEBNAS_QQ_OWNER", "")
    items, name_uin = [], {}
    for line in lines:
        try:
            rec = json.loads(line)
            t = float(rec.get("t") or 0) / 1000.0
        except Exception:
            continue
        if not t or now - t > 24 * 3600:
            continue
        if rec.get("src") != "astrbot":
            continue
        text = str(rec.get("text") or "").strip()
        if not text:
            continue
        for mm in _MENTION_RE.finditer(text):
            name_uin.setdefault(mm.group(1).strip(), mm.group(2))
        chat = str(rec.get("chat") or "")
        kind, _, peer = chat.partition(":")
        out = rec.get("role") == "me"
        who = _qq_name("bot") if out else (
            _qq_name("owner") if kind == "private" and owner and peer == owner else
            (str(rec.get("name") or peer or "QQ")))
        items.append({
            "time": time.strftime("%H:%M:%S", time.localtime(t)),
            "ts": int(t),
            "date": time.strftime("%Y-%m-%d", time.localtime(t)),
            "dir": "out" if out else "in",
            "scope": "群聊" if kind == "group" else "私聊",
            "who": who,
            "uin": bot_uin if out else str(rec.get("uid") or (peer if kind == "private" else "")),
            "mid": "",
            "chat": chat,
            "text": text[:240],
            "media": [m for m in (rec.get("media") or [])
                      if isinstance(m, dict) and m.get("file")],
        })
    # 插件会定时嗅探群成员名单（members.json），这是最全的一张「名字 → QQ 号」表
    try:
        with open(os.path.join(os.path.dirname(_astrbot_history_path()), "members.json"),
                  encoding="utf-8") as f:
            for group in json.load(f).values():
                if isinstance(group, dict):
                    for name, uid in group.items():
                        if name and uid:
                            name_uin.setdefault(str(name), str(uid))
    except (OSError, ValueError):
        pass
    # 老记录没有 uid（插件是 20:5x 才开始记的），再用 @昵称(QQ号) 兜一层；
    # 没配 DEBNAS_QQ_OWNER / DEBNAS_QQ_BOT_UIN 时不建立「名字 → 空号」的映射
    if owner:
        name_uin.setdefault(_qq_name("owner"), owner)
    if bot_uin:
        name_uin.setdefault(_qq_name("bot"), bot_uin)
    for it in items:
        if not it.get("uin"):
            it["uin"] = name_uin.get(it.get("who"), "")
    # 多取一些：群聊/私聊分开后，80 条混排会被另一条流挤掉大半，
    # 前端再按会话各取 40 条，这里留足余量
    return items[-400:]


def _astrbot_live_feed():
    """插件日志是唯一数据源：毫秒级真实时间，图片由插件落盘记录。

    这里曾经还合并过 AstrBot 的会话库，但那份数据没有真实发送时间——时间是
    拿消息里的 `Current datetime` 锚点往后一秒一秒顺延推出来的，推歪了会把
    20:08 发的图排到 18:59。整个数据源已删除：宁可少几条历史，也不要假时间。

    Returns:
        按时间升序的消息列表，最多 400 条。
    """
    out = []
    for it in _astrbot_feed():
        text = _clean_feed_text(it.get("text", ""))
        if not text:
            continue
        it["text"] = text[:240]
        out.append(it)
    # 她发出去的表情包：插件只记文本，debnas 从 AstrBot 日志里自己找。
    for it in _sent_sticker_feed():
        twin = next((c for c in out if c.get("chat") == it["chat"] and c.get("dir") == "out"
                     and c.get("text") == "[图片]" and abs(c["ts"] - it["ts"]) <= 180), None)
        if twin is None:
            out.append(it)
    out.sort(key=lambda x: x["ts"])
    # 同一份消息只留一条：同会话 + 同方向 + 同秒 + 同文本，重复的直接丢掉
    uniq, seen = [], set()
    for it in out:
        key = (it.get("chat"), it.get("dir"), int(it["ts"]), (it.get("text") or "")[:80])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(it)
    out = uniq
    for it in out:
        it["hm"] = time.strftime("%H:%M", time.localtime(it["ts"]))
        # 稳定 id：内容一样就是同一条，前端刷新时不会重复追加
        it["id"] = "|".join([str(it.get("chat", "")), str(it.get("dir", "")),
                             str(int(it["ts"])), (it.get("text") or "")[:40]])
        if not it.get("scope"):
            it["scope"] = "群聊" if str(it.get("chat", "")).startswith("group:") else "私聊"
    return out[-400:]


def rpc_qq(_):
    now = time.time()
    if QQ_FEED_CACHE["at"] and now - QQ_FEED_CACHE["at"] < QQ_FEED_TTL:
        return QQ_FEED_CACHE["data"]
    data = _astrbot_live_feed()
    QQ_FEED_CACHE.update(at=now, data=data)
    return data


MIHOMO_CONFIG = os.environ.get("DEBNAS_MIHOMO_CONFIG", "/etc/mihomo/config.yaml")
MIHOMO_BIN = os.environ.get("DEBNAS_MIHOMO_BIN", "/usr/local/bin/mihomo")
MIHOMO_CACHE = {"at": 0, "api": None}
_ELF_ARCH = {0x3E: "amd64", 0xB7: "arm64", 0x28: "arm", 0x03: "386",
             0xF3: "riscv64", 0x102: "loong64", 0x15: "ppc64",
             0x16: "s390x", 0x08: "mips"}


def _cpu_flags():
    try:
        with open("/proc/cpuinfo", encoding="utf-8", errors="replace") as f:
            for line in f:
                if line.startswith("flags"):
                    return set(line.split(":", 1)[1].split())
    except OSError:
        pass
    return set()


def _host_isa():
    """返回本机架构、x86-64 指令集等级和 mihomo 推荐资产名（只支持 x86_64）。"""
    machine = os.uname().machine
    if machine not in ("x86_64", "amd64"):
        return {"machine": machine, "level": machine, "target": "", "supported": False}
    flags = _cpu_flags()
    if {"avx", "avx2", "bmi1", "bmi2", "fma", "movbe", "osxsave"} <= flags:
        return {"machine": "x86_64", "level": "x86-64-v3",
                "target": "amd64-v3", "supported": True}
    if {"sse4_2", "popcnt", "cx16", "lahf_lm"} <= flags:
        return {"machine": "x86_64", "level": "x86-64-v2",
                "target": "amd64-v2", "supported": True}
    if "sse4_2" in flags:
        return {"machine": "x86_64", "level": "x86-64-v1",
                "target": "amd64", "supported": True}
    return {"machine": "x86_64", "level": "x86-64-compatible",
            "target": "amd64-compatible", "supported": True}


def _elf_arch(path):
    try:
        with open(path, "rb") as f:
            h = f.read(20)
    except OSError:
        return ""
    if len(h) < 20 or h[:4] != b"\x7fELF":
        return ""
    order = ">" if h[5] == 2 else "<"
    return _ELF_ARCH.get(struct.unpack_from(order + "H", h, 18)[0], "")


def _binary_matches(host_machine, bin_arch):
    return host_machine == "x86_64" and bin_arch == "amd64"


def rpc_mihomo_import(params):
    """导入 mihomo YAML：先 mihomo -t 校验，通过后备份旧配置、替换并重启。"""
    data = params.get("data")
    if not isinstance(data, str) or not data:
        raise ValueError("缺少配置文件内容")
    if len(data) > 4 * 1024 * 1024:
        raise ValueError("文件太大（base64 上限 4MB）")
    try:
        raw = base64.b64decode("".join(data.split()), validate=True)
    except Exception:
        raise ValueError("文件内容不是合法 base64")
    if not raw or len(raw) > 2 * 1024 * 1024:
        raise ValueError("配置文件必须在 1 字节到 2MB 之间")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise ValueError("配置文件必须是 UTF-8 文本")
    if "\x00" in text:
        raise ValueError("配置文件不能包含二进制内容")
    if ":" not in text:
        raise ValueError("看起来不是 YAML 配置")

    cfg_dir = os.path.dirname(MIHOMO_CONFIG)
    if not os.path.isdir(cfg_dir):
        raise ValueError("配置目录不存在：%s" % cfg_dir)
    tmp = os.path.join(cfg_dir, ".import-%s.yaml" % secrets.token_hex(6))
    with open(tmp, "wb") as f:
        f.write(raw)
    os.chmod(tmp, 0o600)
    try:
        test = run([MIHOMO_BIN, "-t", "-d", cfg_dir, "-f", tmp], timeout=30)
        if not test.get("ok"):
            tail = (test.get("err") or test.get("out") or "").strip().splitlines()[-3:]
            raise ValueError("配置校验失败：%s" % (" | ".join(tail)[-400:] or "未知错误"))
        backup = ""
        if os.path.exists(MIHOMO_CONFIG):
            backup = MIHOMO_CONFIG + ".bak." + time.strftime("%Y%m%d%H%M%S")
            shutil.copy2(MIHOMO_CONFIG, backup)
        os.chmod(tmp, 0o644)
        os.replace(tmp, MIHOMO_CONFIG)
        MIHOMO_CACHE["api"] = None
        MIHOMO_CACHE["at"] = 0
        r = run(["systemctl", "restart", "mihomo"], timeout=30)
        return {"ok": True, "backup": backup, "restarted": bool(r.get("ok")),
                "message": "" if r.get("ok") else "配置已写入，但重启 mihomo 失败"}
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass


def _mihomo_api():
    now = time.time()
    if MIHOMO_CACHE["api"] and now - MIHOMO_CACHE["at"] < 300:
        return MIHOMO_CACHE["api"]
    controller = os.environ.get("DEBNAS_MIHOMO_API", "")
    secret = os.environ.get("DEBNAS_MIHOMO_SECRET", "")
    if not controller:
        try:
            with open(MIHOMO_CONFIG, encoding="utf-8", errors="replace") as f:
                for line in f:
                    s = line.strip()
                    if s.startswith("external-controller:"):
                        controller = s.split(":", 1)[1].strip().strip("\"'").split(" #", 1)[0].strip()
                    elif s.startswith("secret:") and not secret:
                        secret = s.split(":", 1)[1].strip().strip("\"'")
        except OSError:
            pass
    if not controller:
        controller = "127.0.0.1:9093"
    if not controller.startswith(("http://", "https://")):
        controller = "http://" + controller
    api = {"base": controller.rstrip("/"), "secret": secret}
    MIHOMO_CACHE.update(at=now, api=api)
    return api


def _mihomo_req(method, path, payload=None, timeout=2):
    api = _mihomo_api()
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    if api["secret"]:
        headers["Authorization"] = "Bearer " + api["secret"]
    req = urllib.request.Request(api["base"] + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read(2 * 1024 * 1024)
    return json.loads(body.decode("utf-8", "replace")) if body else {}


def _mihomo_node(proxies, name):
    p = proxies.get(name) or {}
    delay = 0
    for h in reversed(p.get("history") or []):
        if h.get("delay"):
            delay = int(h["delay"])
            break
    return {"name": name, "type": p.get("type", ""), "alive": p.get("alive"),
            "delay": delay}


def _mihomo_resolve(proxies, name, depth=0):
    p = proxies.get(name) or {}
    nxt = p.get("now")
    if nxt and nxt != name and depth < 5:
        return _mihomo_resolve(proxies, nxt, depth + 1)
    return name


DS_BALANCE = {"at": 0.0, "data": None}
DS_BALANCE_TTL = float(os.environ.get("DEBNAS_DEEPSEEK_TTL", "60"))
# 即使点「刷新」也至少隔 5 秒，避免把第三方额度和接口 QPS 浪费在连点上
DS_FORCE_MIN = 5.0

# 没配 base url 时按前缀猜端点；没列进来的厂商只能靠 *_BASE_URL
_API_DEFAULTS = {
    "DEEPSEEK": "https://api.deepseek.com",
    "MOONSHOT": "https://api.moonshot.cn",
    "SILICONFLOW": "https://api.siliconflow.cn",
    "OPENROUTER": "https://openrouter.ai",
}


def _bal_deepseek(payload):
    items = []
    for it in payload.get("balance_infos") or []:
        if isinstance(it, dict):
            items.append({
                "currency": str(it.get("currency") or ""),
                "total": str(it.get("total_balance") or ""),
                "granted": str(it.get("granted_balance") or ""),
                "topped": str(it.get("topped_up_balance") or ""),
            })
    return items, bool(payload.get("is_available"))


def _bal_moonshot(payload):
    d = payload.get("data") or {}
    if not isinstance(d, dict) or "available_balance" not in d:
        return [], False
    return [{
        "currency": "CNY",
        "total": str(d.get("available_balance") or ""),
        "granted": str(d.get("voucher_balance") or ""),
        "topped": str(d.get("cash_balance") or ""),
    }], True


def _bal_siliconflow(payload):
    d = payload.get("data") or {}
    if not isinstance(d, dict) or "totalBalance" not in d:
        return [], False
    return [{
        "currency": "CNY",
        "total": str(d.get("totalBalance") or ""),
        "granted": str(d.get("balance") or ""),
        "topped": str(d.get("chargeBalance") or ""),
    }], True


def _bal_openrouter(payload):
    d = payload.get("data") or {}
    try:
        credits = float(d.get("total_credits") or 0)
        usage = float(d.get("total_usage") or 0)
    except (TypeError, ValueError):
        return [], False
    return [{
        "currency": "USD",
        "total": "%.4f" % (credits - usage),
        "granted": "0",
        "topped": "%.4f" % credits,
    }], True


# 前缀 → (余额路径, 解析函数)。没在这张表里的厂商就是「没有公开余额接口」
_API_BALANCE = {
    "DEEPSEEK": ("/user/balance", _bal_deepseek),
    "MOONSHOT": ("/v1/users/me/balance", _bal_moonshot),
    "SILICONFLOW": ("/v1/user/info", _bal_siliconflow),
    "OPENROUTER": ("/api/v1/credits", _bal_openrouter),
}


_API_PROVIDERS = {
    "DEEPSEEK": "DeepSeek",
    "OPENAI": "OpenAI",
    "ANTHROPIC": "Anthropic",
    "MOONSHOT": "Moonshot",
    "SILICONFLOW": "SiliconFlow",
    "DASHSCOPE": "DashScope",
    "ZHIPU": "智谱",
    "GEMINI": "Gemini",
    "XAI": "xAI",
    "OPENROUTER": "OpenRouter",
}
# 同时找到多个时，按这个顺序挑一个来显示
_API_PRIORITY = ["DEEPSEEK", "OPENAI", "ANTHROPIC", "MOONSHOT", "SILICONFLOW",
                 "DASHSCOPE", "ZHIPU", "GEMINI", "XAI", "OPENROUTER"]


def _read_env_file(path):
    out = {}
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip("'\"")
    except OSError:
        pass
    return out


def _api_env_files():
    """扫 ~/.config/*/{env,.env,env.sh}，里面通常就是各家 API 密钥。"""
    base = os.path.join(_qq_home(), ".config")
    files = []
    try:
        for name in sorted(os.listdir(base)):
            for fname in ("env", ".env", "env.sh"):
                path = os.path.join(base, name, fname)
                if os.path.isfile(path):
                    files.append(path)
    except OSError:
        pass
    return files


def _api_candidates():
    """自动探测本机配了哪家 API：密钥 + base url + 出处。

    只看「名字以 _API_KEY 结尾」的变量，密钥本身不回传前端，只给末 4 位。
    """
    found = {}
    order = []

    def add(prefix, key, source, base):
        prefix = str(prefix).upper()
        if not key or prefix in found:
            return
        found[prefix] = {
            "prefix": prefix,
            "name": _API_PROVIDERS.get(prefix, prefix.title()),
            "key": key,
            "base": str(base or "").strip(),
            "source": source,
        }
        order.append(prefix)

    for k, v in os.environ.items():
        if k.endswith("_API_KEY"):
            add(k[:-8], v, "环境变量 " + k,
                os.environ.get(k[:-8] + "_BASE_URL") or os.environ.get(k[:-8] + "_API_BASE"))
    for path in _api_env_files():
        vals = _read_env_file(path)
        for k, v in vals.items():
            if k.endswith("_API_KEY"):
                add(k[:-8], v, path.replace(_qq_home(), "~"),
                    vals.get(k[:-8] + "_BASE_URL") or vals.get(k[:-8] + "_API_BASE"))
    if not order:
        return []
    order.sort(key=lambda p: _API_PRIORITY.index(p) if p in _API_PRIORITY else 99)
    return [found[p] for p in order]


def _api_endpoint(cand):
    if cand["base"]:
        base = cand["base"].rstrip("/")
        if not base.startswith(("http://", "https://")):
            base = "https://" + base
    else:
        base = _API_DEFAULTS.get(cand["prefix"], "")
    return base


def _public_endpoint(host):
    """给前端看的 endpoint：本机 / 内网地址只给中性标签，别把网络拓扑带出去。"""
    host = str(host or "").strip()
    if not host:
        return ""
    bare = (host.split("]")[0].strip("[") if host.startswith("[")
            else host.rsplit(":", 1)[0]).lower()
    if not bare or bare in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        return "本机端点"
    try:
        ip = ipaddress.ip_address(bare)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified:
            return "内网端点"
        return host
    except ValueError:
        pass
    if bare.endswith((".local", ".lan", ".internal", ".localdomain", ".home.arpa")):
        return "内网端点"
    return host


def _api_summary(cand):
    """给前端看的探测结果：哪家、哪个 endpoint、密钥末 4 位。

    密钥明文和它所在的文件路径都不下发；endpoint 走 _public_endpoint 脱敏。
    """
    if not cand:
        return None
    base = _api_endpoint(cand)
    host = ""
    if base:
        try:
            host = urllib.parse.urlparse(base).netloc
        except ValueError:
            host = base
    key = cand["key"]
    return {
        "name": cand["name"],
        "endpoint": _public_endpoint(host) or (
            "api.deepseek.com" if cand["prefix"] == "DEEPSEEK" else "官方默认"),
        "key": ("…" + key[-4:]) if len(key) >= 12 else "…",
    }


def _astrbot_models():
    """从 AstrBot 的 cmd_config.json 里读「哪把钥匙配了哪个模型」。

    返回列表，每项形如 `{"keys": [...], "base": "...", "models": [...]}`。
    读不到就返回空列表，模型那一栏留空，不影响查余额。
    """
    path = os.path.join(_qq_home(), "astrbot-src", "data", "cmd_config.json")
    try:
        with open(path, encoding="utf-8-sig") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        return []
    sources = {}
    for src in cfg.get("provider_sources") or []:
        if not isinstance(src, dict):
            continue
        key = src.get("key")
        if isinstance(key, list):
            key = key[0] if key else ""
        sources[src.get("id")] = {"base": str(src.get("api_base") or ""),
                                  "keys": [str(key)] if key else []}
    out = []
    for prov in cfg.get("provider") or []:
        if not isinstance(prov, dict) or not prov.get("enable", True):
            continue
        model = str(prov.get("model") or "")
        if not model:
            continue
        src = sources.get(prov.get("provider_source_id")) or {}
        out.append({"base": src.get("base", ""), "keys": src.get("keys", []), "models": [model]})
    return out


def _model_for(cand, models):
    """挑出这把密钥对应的模型名：先按密钥尾号对，再按 base host 对，最后看环境变量。"""
    tail = cand["key"][-4:]
    for entry in models:
        if any(k and k.endswith(tail) for k in entry["keys"]):
            return ", ".join(dict.fromkeys(entry["models"]))
    host = urllib.parse.urlparse(_api_endpoint(cand)).netloc
    if host:
        for entry in models:
            if host and host in entry["base"]:
                return ", ".join(dict.fromkeys(entry["models"]))
    return os.environ.get(cand["prefix"] + "_MODEL", "")


def _provider_balance(cand, models):
    """查一家厂商的余额；查不了就把原因写进 error，前端照样能看到是谁、什么模型。"""
    summary = _api_summary(cand) or {}
    item = {
        "prefix": cand["prefix"],
        "name": summary.get("name") or cand["name"],
        "endpoint": summary.get("endpoint") or "",
        "key": summary.get("key") or "",
        "model": _model_for(cand, models),
        "ok": False, "available": False, "items": [], "error": "",
    }
    base = _api_endpoint(cand)
    if not base:
        item["error"] = "没配 base url，认不出是哪家的端点"
        return item
    spec = _API_BALANCE.get(cand["prefix"])
    if not spec:
        item["error"] = "这家没有公开的余额接口"
        return item
    path, parse = spec
    try:
        req = urllib.request.Request(base.rstrip("/") + path, headers={
            "Authorization": "Bearer " + cand["key"],
            "Accept": "application/json",
            "User-Agent": "debnas-web",
        })
        with urllib.request.urlopen(req, timeout=8) as resp:
            payload = json.loads(resp.read().decode("utf-8", "replace"))
        items, available = parse(payload)
        item.update(ok=True, available=available, items=items)
        if not items:
            item["error"] = "接口没有返回余额"
    except urllib.error.HTTPError as exc:
        item["error"] = "接口返回 %d" % exc.code
    except Exception:  # noqa: BLE001
        item["error"] = "请求 " + (summary.get("endpoint") or "接口") + " 失败"
    return item


def rpc_deepseek(params):
    """查余额：把探测到的每家都过一遍，能查的查，查不了的标「没有公开余额接口」。"""
    now = time.time()
    cached = DS_BALANCE["data"]
    ttl = DS_BALANCE_TTL if cached and cached.get("ok") else min(DS_BALANCE_TTL, 15.0)
    force = bool(params.get("force")) if isinstance(params, dict) else False
    floor = DS_FORCE_MIN if force else ttl
    if cached is not None and now - DS_BALANCE["at"] < floor:
        return cached

    cands = _api_candidates() or []
    models = _astrbot_models()
    providers = [_provider_balance(c, models) for c in cands]
    first = providers[0] if providers else None
    data = {
        "ok": any(p["ok"] for p in providers),
        "providers": providers,
        "at": int(now),
        "provider": (_api_summary(cands[0]) if cands else None),
        "items": (first or {}).get("items") or [],
        "available": bool((first or {}).get("available")),
    }
    if not providers:
        data["error"] = "没找到 API 密钥（环境变量或 ~/.config/*/env 里的 *_API_KEY）"
    elif not data["ok"]:
        data["error"] = first.get("error") or "余额查询失败"
    DS_BALANCE.update(at=now, data=data)
    return data


def rpc_mihomo(_):
    host = _host_isa()
    bin_arch = _elf_arch(MIHOMO_BIN)
    bin_version = ""
    bin_runs = False
    if bin_arch:
        try:
            r = subprocess.run([MIHOMO_BIN, "-v"], capture_output=True, text=True,
                               errors="replace", timeout=2)
            bin_runs = r.returncode == 0
            bin_version = (r.stdout or "").strip().split("\n")[0][:160]
        except Exception:
            pass
    active = run(["systemctl", "is-active", "mihomo"]).get("out", "").strip() == "active"
    out = {"active": active, "apiOk": False, "version": "", "mode": "", "port": 0,
           "primary": None, "groupCount": 0, "traffic": None,
           "hostArch": host["machine"], "hostLevel": host["level"],
           "recommended": host["target"], "binaryArch": bin_arch,
           "binaryVersion": bin_version,
           "supported": host["supported"],
           "binarySameArch": _binary_matches(host["machine"], bin_arch),
           "binaryRuns": bin_runs,
           "binaryOk": _binary_matches(host["machine"], bin_arch) and bin_runs}
    if not active:
        return out
    try:
        with ThreadPoolExecutor(max_workers=3) as ex:
            fv = ex.submit(_mihomo_req, "GET", "/version", None, 1.5)
            fc = ex.submit(_mihomo_req, "GET", "/configs", None, 1.5)
            fp = ex.submit(_mihomo_req, "GET", "/proxies", None, 1.5)
            ver, cfg, prox = fv.result(), fc.result(), fp.result()
    except Exception:
        return out

    proxies = prox.get("proxies") or {}
    groups = []
    for name, p in proxies.items():
        if p.get("type") in ("Selector", "URLTest", "Fallback", "LoadBalance"):
            groups.append({"name": name, "type": p.get("type"),
                           "now": p.get("now") or "", "all": p.get("all") or []})
    groups.sort(key=lambda g: (
        0 if "节点选择" in g["name"] else
        1 if g["name"] in ("PROXY", "GLOBAL") else
        2 if g["type"] == "Selector" and len(g["all"]) > 1 else 3,
        g["name"]))
    primary = groups[0] if groups else None
    if primary:
        now = primary["now"]
        exit_name = _mihomo_resolve(proxies, now)
        info = _mihomo_node(proxies, exit_name)
        primary = {
            "name": primary["name"], "type": primary["type"], "now": now,
            "exit": exit_name, "delay": info["delay"],
            "nodes": [_mihomo_node(proxies, n) for n in primary["all"][:200]],
        }
    traffic = None
    try:
        conns = _mihomo_req("GET", "/connections", timeout=1.5)
        traffic = {"up": int(conns.get("uploadTotal") or 0),
                   "down": int(conns.get("downloadTotal") or 0),
                   "active": len(conns.get("connections") or [])}
    except Exception:
        pass

    out.update({
        "apiOk": True,
        "version": str(ver.get("version") or ""),
        "mode": str(cfg.get("mode") or ""),
        "port": int(cfg.get("mixed-port") or cfg.get("port") or 0),
        "primary": primary,
        "groupCount": len(groups),
        "traffic": traffic,
    })
    return out


def rpc_mihomo_action(params):
    action = params.get("action")
    if action == "mode":
        mode = params.get("mode")
        if mode not in ("rule", "global", "direct"):
            raise ValueError("非法模式")
        _mihomo_req("PATCH", "/configs", {"mode": mode})
        return {"ok": True, "mode": mode}
    if action == "select":
        group = str(params.get("group") or "")
        name = str(params.get("name") or "")
        if not group or not name or len(group) > 200 or len(name) > 200:
            raise ValueError("参数错误")
        _mihomo_req("PUT", "/proxies/" + quote(group, safe=""), {"name": name})
        return {"ok": True}
    if action == "delay":
        name = str(params.get("name") or "")
        if not name or len(name) > 200:
            raise ValueError("参数错误")
        url = quote("http://www.gstatic.com/generate_204", safe="")
        try:
            res = _mihomo_req("GET", "/proxies/" + quote(name, safe="") +
                              "/delay?timeout=2000&url=" + url, timeout=4)
        except urllib.error.HTTPError as e:
            if e.code == 408:
                return {"delay": 0}
            raise
        return {"delay": int(res.get("delay") or 0)}
    raise ValueError("未知操作")


def rpc_net(_):
    # 只读 /proc/net/dev 的累计字节；接口地址由 netifaces 提供，别在这里跑 ip 子进程
    rx = tx = 0
    try:
        with open("/proc/net/dev") as f:
            for line in f.readlines()[2:]:
                name, rest = line.split(":", 1)
                if name.strip() == "lo":
                    continue
                fields = rest.split()
                rx += int(fields[0])
                tx += int(fields[8])
    except Exception:
        pass
    return {"rx": rx, "tx": tx}


def rpc_hw(_):
    temps = []
    base = "/sys/class/hwmon"
    try:
        for chip in sorted(os.listdir(base)):
            cdir = os.path.join(base, chip)
            name = open(os.path.join(cdir, "name")).read().strip()
            for f in sorted(os.listdir(cdir)):
                if re.fullmatch(r"temp\d+_input", f):
                    try:
                        v = int(open(os.path.join(cdir, f)).read().strip()) / 1000
                        temps.append({"chip": name, "label": f, "c": v})
                    except Exception:
                        pass
    except Exception:
        pass
    cpu = ""
    try:
        for line in open("/proc/cpuinfo"):
            if line.startswith("model name"):
                cpu = line.split(":", 1)[1].strip()
                break
    except Exception:
        pass
    mem = {}
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                k, v = line.split(":", 1)
                mem[k] = int(v.split()[0])
    except Exception:
        pass
    return {"cpu": cpu, "cores": os.cpu_count() or 0, "temps": temps,
            "memTotal": mem.get("MemTotal", 0), "memAvailable": mem.get("MemAvailable", 0)}


def rpc_cputimes(_):
    try:
        with open("/proc/stat") as f:
            fields = [int(x) for x in f.readline().split()[1:]]
        idle = fields[3] + fields[4]
        return {"idle": idle, "total": sum(fields)}
    except Exception:
        return None



def rpc_netifaces(_):
    apps = run(["ip", "-j", "addr"]).get("out", "[]")
    try:
        items = json.loads(apps or "[]")
    except Exception:
        items = []
    counters = {}
    try:
        with open("/proc/net/dev") as f:
            for line in f.readlines()[2:]:
                name, rest = line.split(":", 1)
                fields = rest.split()
                counters[name.strip()] = (int(fields[0]), int(fields[8]))
    except Exception:
        pass
    out = []
    for it in items:
        name = it.get("ifname", "")
        if name == "lo":
            continue
        addr = ""
        v4, v6 = [], []
        for a in it.get("addr_info", []):
            txt = "%s/%s" % (a.get("local", ""), a.get("prefixlen", ""))
            if a.get("family") == "inet":
                v4.append(txt)
                if not addr:
                    addr = txt
            elif a.get("family") == "inet6" and a.get("scope") != "link":
                v6.append(txt)
        rx, tx = counters.get(name, (0, 0))
        out.append({
            "name": name,
            "state": (it.get("operstate") or "UNKNOWN").upper(),
            "addr": addr, "v4": v4, "v6": v6,
            "mac": it.get("address", ""),
            "mtu": it.get("mtu", 0),
            "rx": rx, "tx": tx,
        })
    return out


def rpc_services_list(_):
    out = run(["systemctl", "list-units", "--type=service", "--state=running",
               "--no-legend", "--plain"]).get("out", "")
    items = []
    for line in out.splitlines():
        f = line.split(None, 4)
        if len(f) < 1 or not f[0].endswith(".service"):
            continue
        items.append({"name": f[0], "load": f[1] if len(f) > 1 else "",
                      "active": f[2] if len(f) > 2 else "", "sub": f[3] if len(f) > 3 else "",
                      "desc": f[4] if len(f) > 4 else ""})
    return items


def rpc_service_action(params):
    name = params.get("name", "")
    act = params.get("action", "")
    if not re.fullmatch(r"[A-Za-z0-9@._:-]+\.service", name):
        raise ValueError("非法服务名")
    if act not in ("start", "stop", "restart", "reload"):
        raise ValueError("非法操作")
    return run(as_root(["systemctl", act, name]), timeout=60)


def rpc_reboot(_):
    # 延迟 2 秒再重启，先把 HTTP 响应送回浏览器；systemd-run 失败时退化为后台 shutdown
    unit = "debnas-reboot-%d" % int(time.time())
    res = run(as_root(["systemd-run", "--quiet", "--on-active=2", "--unit=" + unit,
                       "systemctl", "reboot"]), timeout=10)
    if res.get("ok"):
        return {"ok": True, "delay": 2}
    # 兼容没有 systemd-run / 调度失败的情况；只有 root 才能这样做
    if os.geteuid() == 0:
        shutdown = shutil.which("shutdown") or "/usr/sbin/shutdown"
        subprocess.Popen(["sh", "-c", "sleep 2; exec %s -r now" % shlex.quote(shutdown)],
                         start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return {"ok": True, "delay": 2}
    raise RuntimeError((res.get("err") or res.get("out") or "无法安排重启").strip())


def _apt_env():
    env = dict(os.environ)
    env["LC_ALL"] = "C"
    env["DEBIAN_FRONTEND"] = "noninteractive"
    return env


def rpc_apt_sim(_):
    # 用 full-upgrade 模拟：内核 meta 包会拉一套新包名的镜像，普通 upgrade 只会
    # 把它们标成 kept back，页面上就会误显示「0 个更新」。
    out = run(["apt-get", "-s", "-o", "Debug::NoLocking=1", "full-upgrade"],
              timeout=90, env=_apt_env()).get("out", "")
    pkgs, new_pkgs = [], []
    for line in out.splitlines():
        line = line.strip()
        m = re.match(r"^Inst\s+(\S+)\s+\[([^\]]+)\]\s+\((\S+)", line)
        if m:
            pkgs.append({"name": m.group(1), "from": m.group(2), "to": m.group(3)})
            continue
        m = re.match(r"^Inst\s+(\S+)\s+\((\S+)", line)
        if m:
            new_pkgs.append({"name": m.group(1), "to": m.group(2)})
    m3 = re.search(r"(\d+) upgraded,\s*(\d+) newly installed,\s*(\d+) to remove", out)
    return {
        "count": int(m3.group(1)) if m3 else len(pkgs),
        "packages": pkgs,
        "newCount": int(m3.group(2)) if m3 else len(new_pkgs),
        "removeCount": int(m3.group(3)) if m3 else 0,
        "newPackages": new_pkgs,
    }


def rpc_apt_upgrade(_):
    if not apt_upgrade_lock.acquire(blocking=False):
        raise ValueError("已有升级任务正在运行，请等它完成后再试")
    try:
        res = run(as_root(["apt-get", "-y", "-o", "Dpkg::Options::=--force-confdef",
                           "-o", "Dpkg::Options::=--force-confold", "full-upgrade"]),
                  timeout=1800, env=_apt_env())
    finally:
        apt_upgrade_lock.release()
    if not res.get("ok"):
        msg = (res.get("err") or res.get("out") or "apt 升级失败").strip()
        if "Could not get lock" in msg or "Unable to acquire the dpkg frontend lock" in msg:
            raise ValueError("另一个 apt / dpkg 进程正在运行，请等它完成后再试")
        raise RuntimeError(msg[-2000:])
    return res


def rpc_auto_get(_):
    conf = ""
    dropin = ""
    try:
        conf = open("/etc/apt/apt.conf.d/20auto-upgrades", encoding="utf-8").read()
    except Exception:
        pass
    try:
        dropin = open("/etc/systemd/system/apt-daily-upgrade.timer.d/50-debnas.conf",
                      encoding="utf-8").read()
    except Exception:
        pass
    enabled = bool(re.search(r'Unattended-Upgrade\s+"1"', conf))
    schedule = "monthly" if re.search(r"-01\s", dropin) else ("weekly" if re.search(r"Sun\s", dropin) else "daily")
    return {"enabled": enabled, "schedule": schedule}


def rpc_auto_set(params):
    enabled = "1" if params.get("enabled") else "0"
    sched = params.get("schedule") or "daily"
    return run(as_root(["/bin/bash", "/usr/local/lib/debnas-portal/autoupdate.sh", "set", enabled, sched]),
               timeout=60)


def rpc_apt_history(_):
    try:
        with open("/var/log/apt/history.log", encoding="utf-8", errors="replace") as f:
            text = f.read()[-300000:]
    except Exception:
        return []
    entries, cur = [], None
    for raw in text.splitlines():
        line = raw.strip()
        m = re.match(r"^Start-Date:\s*(.+)$", line)
        if m:
            cur = {"date": m.group(1).strip(), "cmd": "", "install": [], "upgrade": [], "remove": []}
            entries.append(cur)
            continue
        if not cur:
            continue
        m = re.match(r"^Commandline:\s*(.+)$", line)
        if m:
            cur["cmd"] = m.group(1).strip()
            continue
        m = re.match(r"^(Install|Upgrade|Remove):\s*(.+)$", line)
        if m:
            kind = m.group(1).lower()
            for mm in re.finditer(r"([^,()\s]+?)(?::[^\s()]+)?\s*\(([^)]*)\)", m.group(2)):
                cur[kind].append({"name": mm.group(1), "ver": mm.group(2)})
    return [e for e in reversed(entries) if e["install"] or e["upgrade"] or e["remove"]]


def rpc_portal_info(_):
    info = {"deployed": "", "source": "", "mtime": ""}
    try:
        with open("/usr/share/cockpit/debnas-portal/VERSION", encoding="utf-8") as f:
            for line in f:
                k, _, v = line.strip().partition("=")
                info[k] = v
    except Exception:
        pass
    try:
        info["mtime"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(
            os.path.getmtime("/usr/share/cockpit/debnas-portal/app.js")))
    except Exception:
        pass
    return info


def rpc_containers(_):
    run_as = os.environ.get("DEBNAS_WEB_RUN_AS") or None
    out = run(["sh", "-c", "XDG_RUNTIME_DIR=/run/user/$(id -u) podman ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}'"],
              as_user=run_as)
    items = []
    for line in out.get("out", "").splitlines():
        f = line.split("|")
        if len(f) >= 3:
            items.append({"name": f[0], "image": f[1], "status": f[2]})
    return items


def rpc_pull(params):
    image = params.get("image", "")
    if not re.fullmatch(r"[A-Za-z0-9._:/@-]+", image):
        raise ValueError("非法镜像名")
    run_as = os.environ.get("DEBNAS_WEB_RUN_AS") or None
    return run(["sh", "-c", "XDG_RUNTIME_DIR=/run/user/$(id -u) podman pull %s" % shlex.quote(image)],
               timeout=1800, as_user=run_as)


def rpc_vnc(params):
    user = params.get("user", "")
    if not re.fullmatch(r"[A-Za-z0-9._-]+", user):
        raise ValueError("非法用户名")
    container = params.get("container", "")
    if not re.fullmatch(r"[A-Za-z0-9._-]+", container):
        raise ValueError("非法容器名")
    return run(["/bin/bash", "/usr/local/lib/debnas-portal/vncpass.sh", user, container], timeout=30)


# ---------------------------------------------------------------- 虚拟机（libvirt）
def _truthy(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in ("1", "true", "yes", "on")
    return bool(v)


def virsh(*args, timeout=15):
    """执行 virsh，强制 C locale，避免 libvirt-l10n 把输出翻译掉。"""
    return run(as_root(["virsh", "-c", VM_URI] + [str(a) for a in args]), timeout=timeout, env=VM_ENV)


def vm_name_ok(name, create=False):
    name = str(name or "")
    limit = 64 if create else 100
    if not name or len(name) > limit:
        return False
    if name in (".", "..") or name.startswith(".") or name.startswith("-"):
        return False
    if re.search(r"[\x00-\x1f/]", name):
        return False
    if create and not re.fullmatch(r"[\w\u4e00-\u9fff][\w\u4e00-\u9fff .@_-]{0,63}", name):
        return False
    return True


def vm_require_name(name, create=False):
    if not vm_name_ok(name, create):
        if create:
            raise ValueError("名称只能包含字母、数字、中文、空格和 . _ - @，且不能以 . 或 - 开头")
        raise ValueError("非法虚拟机名")
    return str(name)


def _parse_kv(text):
    out = {}
    for line in (text or "").splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def _first_int(text):
    m = re.search(r"\d+", text or "")
    return int(m.group(0)) if m else 0


def _first_float(text):
    m = re.search(r"[\d.]+", text or "")
    try:
        return float(m.group(0)) if m else 0.0
    except ValueError:
        return 0.0


def _tail(r, limit=300):
    msg = (r.get("err") or r.get("out") or "命令失败").strip()
    return msg[-limit:]


def vm_available():
    if not shutil.which("virsh"):
        return False, "未安装 virsh（apt install libvirt-clients）"
    r = virsh("version", timeout=10)
    if r.get("ok"):
        return True, ""
    return False, _tail(r)


def vm_info(name):
    r = virsh("dominfo", name, timeout=10)
    if not r.get("ok"):
        return None
    d = _parse_kv(r.get("out"))
    state = d.get("State", "")
    return {
        "id": _first_int(d.get("Id", "")) if d.get("Id", "").isdigit() else None,
        "uuid": d.get("UUID", ""),
        "state": state,
        "osType": d.get("OS Type", ""),
        "vcpu": _first_int(d.get("CPU(s)", "0")),
        "memMax": _first_int(d.get("Max memory", "0")) * 1024,
        # 关机状态下 libvirt 的 Used memory 等于 Max memory，没有参考价值
        "memUsed": (_first_int(d.get("Used memory", "0")) * 1024) if state == "running" else 0,
        "persistent": d.get("Persistent", "") == "yes",
        "autostart": d.get("Autostart", "").lower() == "enable",
        "cpuTime": _first_float(d.get("CPU time", "0")),
    }


def vm_dump(name):
    # --security-info 才能拿到 VNC 密码；列表只返回“是否设置了密码”，不回传明文
    r = virsh("dumpxml", "--security-info", name, timeout=10)
    if not r.get("ok"):
        return None
    try:
        return ET.fromstring(r.get("out") or "")
    except Exception:
        return None


def vm_xml_disks(root):
    out = {}
    if root is None:
        return out
    for disk in root.findall("./devices/disk"):
        tgt = disk.find("target")
        if tgt is None or not tgt.get("dev"):
            continue
        drv = disk.find("driver")
        out[tgt.get("dev")] = {
            "device": disk.get("device", "disk"),
            "bus": tgt.get("bus", ""),
            "format": (drv.get("type", "") if drv is not None else ""),
            "readonly": disk.find("readonly") is not None,
        }
    return out


def vm_xml_vnc(root):
    if root is None:
        return None
    g = root.find("./devices/graphics[@type='vnc']")
    if g is None:
        return None
    return {
        "port": _first_int(g.get("port") or "-1"),
        "listen": g.get("listen") or "",
        "password": g.get("passwd") or "",
        "socket": g.get("socket") or "",
    }


def vm_snapshot_names(name):
    r = virsh("snapshot-list", name, "--name", timeout=10)
    if not r.get("ok"):
        return []
    return [x.strip() for x in (r.get("out") or "").splitlines() if x.strip()]


def vm_disks(name):
    r = virsh("domblklist", name, "--details", timeout=10)
    if not r.get("ok"):
        return []
    out = []
    for line in (r.get("out") or "").splitlines():
        if not line.strip() or line.strip().startswith("-"):
            continue
        parts = line.split(None, 3)
        if len(parts) < 4 or parts[0] == "Type" or parts[2] == "Target":
            continue
        typ, dev, target, source = parts
        if typ == "-" or target == "-":
            continue
        item = {"target": target, "device": dev,
                "path": "" if source.strip() == "-" else source.strip(),
                "capacity": 0, "allocation": 0}
        if dev == "disk" and item["path"]:
            bi = virsh("domblkinfo", name, target, timeout=10)
            if bi.get("ok"):
                kv = _parse_kv(bi.get("out"))
                item["capacity"] = _first_int(kv.get("Capacity", "0"))
                item["allocation"] = _first_int(kv.get("Allocation", "0"))
        out.append(item)
    return out


def vm_nets(name):
    r = virsh("domiflist", name, timeout=10)
    nets = []
    if r.get("ok"):
        for line in (r.get("out") or "").splitlines():
            parts = line.split()
            if len(parts) < 5 or parts[0] == "Interface" or parts[0].startswith("-"):
                continue
            nets.append({"iface": parts[0], "type": parts[1], "source": parts[2],
                         "model": parts[3], "mac": parts[4], "ips": []})
    if not nets:
        return nets
    by_iface, by_mac = {}, {}
    for source in ("lease", "agent"):
        a = virsh("domifaddr", name, "--source", source, timeout=10)
        if not a.get("ok"):
            continue
        for line in (a.get("out") or "").splitlines():
            parts = line.split()
            if len(parts) < 4 or parts[2] not in ("ipv4", "ipv6"):
                continue
            ip = parts[3].split("/")[0]
            by_iface.setdefault(parts[0], []).append(ip)
            by_mac.setdefault(parts[1].lower(), []).append(ip)
        if by_iface:
            break
    for n in nets:
        ips = by_iface.get(n["iface"]) or by_mac.get(n["mac"].lower()) or []
        n["ips"] = [ip for ip in ips if not ip.lower().startswith("fe80:")][:4]
    return nets


def vm_collect(name):
    info = vm_info(name) or {}
    root = vm_dump(name)
    xdisks = vm_xml_disks(root)
    gfx = vm_xml_vnc(root)
    disks = vm_disks(name)
    for d in disks:
        xd = xdisks.get(d["target"]) or {}
        d["device"] = xd.get("device", d["device"])
        d["bus"] = xd.get("bus", "")
        d["format"] = xd.get("format", "")
        d["readonly"] = bool(xd.get("readonly"))
    nets = vm_nets(name)
    os_type = root.find("./os/type") if root is not None else None
    port = gfx["port"] if gfx and gfx["port"] > 0 else None
    return {
        "name": name, "id": info.get("id"), "uuid": info.get("uuid", ""),
        "state": info.get("state", ""), "persistent": info.get("persistent", False),
        "autostart": info.get("autostart", False),
        "vcpu": info.get("vcpu", 0), "memMax": info.get("memMax", 0),
        "memUsed": info.get("memUsed", 0), "cpuTime": info.get("cpuTime", 0),
        "osType": info.get("osType", ""),
        "arch": os_type.get("arch", "") if os_type is not None else "",
        "machine": os_type.get("machine", "") if os_type is not None else "",
        "disks": disks, "nets": nets, "snapshots": len(vm_snapshot_names(name)),
        "graphics": ({"type": "vnc", "port": port, "listen": gfx["listen"],
                      "hasPassword": bool(gfx["password"])} if gfx else None),
        "primaryIp": next((ip for n in nets for ip in n.get("ips", [])), ""),
        "description": (root.findtext("description") if root is not None else "") or "",
    }


def _safe_collect(name):
    try:
        return vm_collect(name)
    except Exception as e:  # noqa: BLE001
        return {"name": name, "state": "unknown", "error": str(e), "disks": [], "nets": [],
                "graphics": None, "snapshots": 0, "primaryIp": "", "vcpu": 0,
                "memMax": 0, "memUsed": 0, "autostart": False, "persistent": False,
                "uuid": "", "osType": "", "arch": "", "machine": "", "description": "",
                "cpuTime": 0, "id": None}


def rpc_vms(_):
    r = virsh("list", "--all", "--name", timeout=20)
    if not r.get("ok"):
        raise ValueError("无法连接 libvirt：%s" % _tail(r))
    names = [x.strip() for x in (r.get("out") or "").splitlines() if x.strip()]
    if not names:
        return []
    with ThreadPoolExecutor(max_workers=min(4, len(names))) as ex:
        return list(ex.map(_safe_collect, names))


def _free_bytes(path):
    p = path
    while p and not os.path.exists(p):
        parent = os.path.dirname(p)
        if parent == p:
            break
        p = parent
    try:
        st = os.statvfs(p)
        return st.f_bavail * st.f_frsize
    except OSError:
        return 0


def _host_bridges():
    out = []
    try:
        for name in sorted(os.listdir("/sys/class/net")):
            # virbrX 是 libvirt 的 NAT 网络桥，应该走 network= 而不是 bridge=
            if name.startswith(("virbr", "vnet", "veth")):
                continue
            if os.path.isdir("/sys/class/net/%s/bridge" % name):
                out.append(name)
    except OSError:
        pass
    return out


def _novnc_ready():
    return os.path.isfile(os.path.join(STATIC_DIR, "novnc", "core", "rfb.js"))


def rpc_vm_env(_):
    commands = {name: bool(shutil.which(name)) for name in ("virsh", "qemu-img", "virt-install")}
    available, err = vm_available()
    env = {
        "available": available, "error": err, "uri": VM_URI,
        "commands": commands, "imagesDir": VM_IMAGES_DIR,
        "imagesFree": _free_bytes(VM_IMAGES_DIR), "isos": vm_scan_isos(),
        "networks": [], "bridges": _host_bridges(), "novnc": _novnc_ready(), "version": "",
    }
    if available:
        v = virsh("version", timeout=10).get("out", "")
        lib = hyper = ""
        for line in v.splitlines():
            if line.startswith("Using library:"):
                lib = line.split(":", 1)[1].strip()
            elif line.startswith("Running hypervisor:"):
                hyper = line.split(":", 1)[1].strip()
        env["version"] = " · ".join([x for x in (lib, hyper) if x])
        nets = virsh("net-list", "--all", "--name", timeout=10).get("out", "")
        for n in [x.strip() for x in nets.splitlines() if x.strip()]:
            info = _parse_kv(virsh("net-info", n, timeout=10).get("out", ""))
            env["networks"].append({
                "name": n,
                "active": info.get("Active", "").lower() == "yes",
                "autostart": info.get("Autostart", "").lower() == "yes",
                "bridge": info.get("Bridge", ""),
            })
    return env


def rpc_vm_autostart(params):
    name = vm_require_name(params.get("name"))
    on = _truthy(params.get("on"))
    r = virsh("autostart" if on else "no-autostart", name, timeout=30)
    if not r.get("ok"):
        raise ValueError("设置自启失败：%s" % _tail(r))
    return {"ok": True, "autostart": on}


VM_ACTIONS = ("start", "shutdown", "reboot", "destroy", "suspend", "resume", "reset")


def rpc_vm_action(params):
    name = vm_require_name(params.get("name"))
    act = str(params.get("action") or "")
    if act not in VM_ACTIONS:
        raise ValueError("非法操作")
    r = virsh(act, name, timeout=120)
    if not r.get("ok"):
        raise ValueError(_tail(r))
    return {"ok": True, "action": act}


def _fs_owner(path):
    """控制台以 root 常驻；写进普通用户主目录时切回该用户，避免产出 root 属主的文件。"""
    name = os.environ.get("DEBNAS_WEB_RUN_AS")
    if not name or os.geteuid() != 0:
        return None
    try:
        ent = pwd.getpwnam(name)
    except KeyError:
        return None
    home = ent.pw_dir.rstrip("/")
    if path == home or path.startswith(home + "/"):
        return ent
    return None


def _fs_exec(argv, as_user, timeout=60):
    """优先以账号本人执行；目录属于别人（如 root 建的 rom/）时回退到 root。"""
    if not as_user:
        return run(argv, timeout=timeout)
    r = run(argv, as_user=as_user, timeout=timeout)
    if r.get("ok"):
        return r
    msg = ((r.get("err") or "") + (r.get("out") or "")).lower()
    if "permission denied" in msg or "operation not permitted" in msg:
        return run(argv, timeout=timeout)
    return r


def rpc_fs_action(params):
    verb = params.get("verb", "")
    path = safe_path(params.get("path", ""))
    target = params.get("target") or ""
    owner = _fs_owner(path)
    as_user = owner.pw_name if owner else None
    if verb == "mkdir":
        r = _fs_exec(["mkdir", "-p", path], as_user)
        if r.get("ok") and owner and os.geteuid() == 0:
            # 回退到 root 建出来的目录交还给账号本人，SMB / SSH 里也能继续写
            try:
                os.chown(path, owner.pw_uid, owner.pw_gid)
            except OSError:
                pass
        return r
    if verb == "rm":
        return _fs_exec(["rm", "-rf", path], as_user)
    if verb in ("rename", "move", "copy"):
        target = safe_path(target)
        if target == path:
            raise ValueError("源和目标相同")
        if os.path.exists(target):
            raise ValueError("目标已存在：%s" % target)
        if verb == "copy":
            return _fs_exec(["cp", "-a", "--", path, target], as_user)
        return _fs_exec(["mv", "-T", "--", path, target], as_user)
    if verb == "write":
        data = params.get("data", "")
        try:
            raw = base64.b64decode(data)
        except Exception:
            raise ValueError("数据格式错误")
        with open(path, "wb") as f:
            f.write(raw)
        if owner and os.geteuid() == 0:
            os.chown(path, owner.pw_uid, owner.pw_gid)
        return {"ok": True}
    raise ValueError("未知操作")


SMB_CONF = "/etc/samba/smb.conf"
SMB_HELPER = "/usr/local/lib/debnas-portal/samba.py"
SHARE_NAME_RE = re.compile(r"[A-Za-z0-9._-]{1,64}")
USER_NAME_RE = re.compile(r"[a-z_][a-z0-9_-]{0,31}")
GROUP_NAME_RE = re.compile(r"[a-z_][a-z0-9_-]{0,31}")
LOGIN_SHELLS = {"/bin/bash", "/bin/zsh", "/bin/sh", "/usr/sbin/nologin"}
RESERVED_GROUPS = {"root", "sudo", "users", "nogroup"}
SSH_KEY_RE = re.compile(
    r"(ssh-(rsa|ed25519|dss)|ecdsa-sha2-[a-z0-9-]+|sk-(ssh-ed25519|ecdsa-sha2-[a-z0-9-]+)@openssh\.com)"
    r"\s+[A-Za-z0-9+/=]+(\s+[^\r\n]*)?")


def _smb_run(args, timeout=120, need_root=True):
    """调用 samba.py；参数走 argv（helper 读 sys.argv[2]），并把失败翻译成异常。"""
    argv = ["python3", SMB_HELPER] + [str(a) for a in args]
    r = run(as_root(argv) if need_root else argv, timeout=timeout)
    info = {}
    try:
        info = json.loads((r.get("out") or "").strip() or "{}")
    except Exception:
        info = {}
    if not r.get("ok") or info.get("ok") is not True:
        msg = info.get("error") or (r.get("err") or r.get("out") or "Samba 操作失败").strip()
        raise RuntimeError(str(msg)[:500])
    return info


def rpc_samba(params):
    verb = str(params.get("verb") or "")
    payload = params.get("payload")
    if not isinstance(payload, dict):
        payload = {}
    if verb == "save":
        name = str(payload.get("name") or "").strip()
        path = str(payload.get("path") or "").strip()
        if not SHARE_NAME_RE.fullmatch(name):
            raise ValueError("共享名只能包含字母、数字、点、下划线和短横线")
        if not path.startswith("/") or not os.path.isdir(path):
            raise ValueError("目录不存在：%s" % path)
        return _smb_run(["save", json.dumps(payload, ensure_ascii=False)])
    if verb == "delete":
        name = str(payload.get("name") or "").strip()
        if not SHARE_NAME_RE.fullmatch(name):
            raise ValueError("非法共享名")
        return _smb_run(["delete", name])
    if verb == "global-set":
        return _smb_run(["global-set", json.dumps(payload, ensure_ascii=False)])
    if verb == "global-get":
        info = _smb_run(["global-get"], need_root=False)
        return {"global": info.get("global") or {}}
    raise ValueError("未知操作")


def rpc_smb_export(_):
    try:
        with open(SMB_CONF, encoding="utf-8", errors="replace") as fh:
            return {"text": fh.read()}
    except OSError as e:
        raise RuntimeError("读取 smb.conf 失败：%s" % e)


def rpc_smb_import(params):
    text = str(params.get("text") or "")
    if not text.strip() or "[global]" not in text.lower():
        raise ValueError("文件里没有 [global] 段，疑似不是 smb.conf")
    if len(text.encode("utf-8", "replace")) > 1024 * 1024:
        raise ValueError("配置文件过大（上限 1 MB）")
    fd, tmp = tempfile.mkstemp(prefix="debnas-smb-", suffix=".conf")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.chmod(tmp, 0o600)
        return _smb_run(["import", tmp], timeout=180)
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def _password_ok(raw):
    pw = str(raw or "")
    if not (6 <= len(pw) <= 128):
        raise ValueError("密码长度需要在 6-128 个字符之间")
    if any(ch in pw for ch in ":\r\n\x00"):
        raise ValueError("密码不能包含冒号、换行或空字符")
    return pw


def _run_checked(argv, what, timeout=90, data=None):
    r = run_in(as_root(argv), data=data, timeout=timeout) if data is not None \
        else run(as_root(argv), timeout=timeout)
    if not r.get("ok"):
        msg = (r.get("err") or r.get("out") or "").strip()
        raise RuntimeError("%s：%s" % (what, msg[-400:] or "命令失败"))
    return r


def _user_exists(name):
    try:
        pwd.getpwnam(name)
        return True
    except KeyError:
        return False


def _user_entry(name):
    try:
        return pwd.getpwnam(name)
    except KeyError:
        raise ValueError("用户不存在：%s" % name)


def _check_user_name(raw):
    name = str(raw or "").strip()
    if not USER_NAME_RE.fullmatch(name):
        raise ValueError("用户名只能包含小写字母、数字、下划线和短横线，且以字母或下划线开头")
    return name


def rpc_user_create(params):
    name = _check_user_name(params.get("name"))
    if _user_exists(name):
        raise ValueError("用户已存在：%s" % name)
    password = _password_ok(params.get("password"))
    shell = str(params.get("shell") or "/bin/bash").strip()
    if shell not in LOGIN_SHELLS and not (shell.startswith("/") and os.path.exists(shell)):
        raise ValueError("不支持的登录 Shell：%s" % shell)
    if params.get("samba") and not shutil.which("smbpasswd"):
        raise RuntimeError("系统未安装 smbpasswd，无法创建 Samba 账号")
    gecos = re.sub(r"[\r\n:]", " ", str(params.get("gecos") or "")).strip()[:64]
    _run_checked(["useradd", "-m", "-s", shell, "-c", gecos, "--", name], "创建用户失败")
    try:
        _run_checked(["chpasswd"], "设置登录密码失败",
                     data="%s:%s\n" % (name, password))
    except Exception:
        run(as_root(["userdel", name]))
        raise
    if params.get("samba"):
        try:
            _run_checked(["smbpasswd", "-a", "-s", name], "创建 Samba 账号失败",
                         data="%s\n%s\n" % (password, password))
        except Exception as e:
            raise RuntimeError("用户已创建，但 Samba 账号失败：%s" % e)
    return {"ok": True, "name": name}


def rpc_user_delete(params):
    name = _check_user_name(params.get("name"))
    if name == "root":
        raise ValueError("不能删除 root")
    if name == (os.environ.get("DEBNAS_WEB_RUN_AS") or ""):
        raise ValueError("不能删除运行控制台的账号：%s" % name)
    _user_entry(name)
    if shutil.which("smbpasswd"):
        run(as_root(["smbpasswd", "-x", name]))  # 没有 Samba 账号时忽略
    _run_checked(["userdel", name], "删除用户失败")
    return {"ok": True, "name": name}


def rpc_user_password(params):
    name = _check_user_name(params.get("name"))
    _user_entry(name)
    password = _password_ok(params.get("password"))
    _run_checked(["chpasswd"], "修改密码失败", data="%s:%s\n" % (name, password))
    return {"ok": True}


def rpc_samba_password(params):
    name = _check_user_name(params.get("name"))
    _user_entry(name)
    password = _password_ok(params.get("password"))
    if not shutil.which("smbpasswd"):
        raise RuntimeError("系统未安装 smbpasswd")
    _run_checked(["smbpasswd", "-a", "-s", name], "设置 Samba 密码失败",
                 data="%s\n%s\n" % (password, password))
    return {"ok": True}


def rpc_chage_set(params):
    name = _check_user_name(params.get("name"))
    _user_entry(name)
    try:
        days = int(params.get("days"))
    except (TypeError, ValueError):
        raise ValueError("密码有效期必须是整数")
    if days < -1 or days > 99999:
        raise ValueError("密码有效期超出范围")
    _run_checked(["chage", "-M", str(days), name], "设置密码有效期失败")
    if params.get("force"):
        _run_checked(["chage", "-d", "0", name], "设置强制改密失败")
    return {"ok": True}


def rpc_group_create(params):
    name = str(params.get("name") or "").strip()
    if not GROUP_NAME_RE.fullmatch(name):
        raise ValueError("组名只能包含小写字母、数字、下划线和短横线，且以字母或下划线开头")
    try:
        grp.getgrnam(name)
        raise ValueError("组已存在：%s" % name)
    except KeyError:
        pass
    _run_checked(["groupadd", name], "创建组失败")
    return {"ok": True, "name": name}


def rpc_group_delete(params):
    name = str(params.get("name") or "").strip()
    if not GROUP_NAME_RE.fullmatch(name):
        raise ValueError("非法组名")
    try:
        entry = grp.getgrnam(name)
    except KeyError:
        raise ValueError("组不存在：%s" % name)
    if name in RESERVED_GROUPS or entry.gr_gid < 1000:
        raise ValueError("系统组不能删除：%s" % name)
    _run_checked(["groupdel", name], "删除组失败")
    return {"ok": True, "name": name}


def _ssh_target(name):
    ent = _user_entry(_check_user_name(name))
    return ent, os.path.join(ent.pw_dir, ".ssh"), os.path.join(ent.pw_dir, ".ssh", "authorized_keys")


def _ssh_rewrite(path, ent, lines):
    tmp = path + ".debnas-tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.writelines(lines)
    os.chmod(tmp, 0o600)
    os.chown(tmp, ent.pw_uid, ent.pw_gid)
    os.replace(tmp, path)


def rpc_ssh_keys(params):
    _, _, path = _ssh_target(params.get("user"))
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
    except FileNotFoundError:
        return {"keys": []}
    except OSError as e:
        raise RuntimeError("读取 authorized_keys 失败：%s" % e)
    return {"keys": [ln.strip() for ln in lines
                     if ln.strip() and not ln.lstrip().startswith("#")]}


def rpc_ssh_add(params):
    key = str(params.get("key") or "").strip()
    if len(key) > 4096 or not SSH_KEY_RE.fullmatch(key):
        raise ValueError("公钥格式不正确")
    ent, ssh_dir, path = _ssh_target(params.get("user"))
    os.makedirs(ssh_dir, mode=0o700, exist_ok=True)
    os.chmod(ssh_dir, 0o700)
    os.chown(ssh_dir, ent.pw_uid, ent.pw_gid)
    lines = []
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
    except FileNotFoundError:
        pass
    if any(ln.strip() == key for ln in lines):
        raise ValueError("这个公钥已经存在")
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"
    lines.append(key + "\n")
    _ssh_rewrite(path, ent, lines)
    return {"ok": True}


def rpc_ssh_remove(params):
    ent, _, path = _ssh_target(params.get("user"))
    try:
        index = int(params.get("index"))
    except (TypeError, ValueError):
        raise ValueError("密钥序号不正确")
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
    except FileNotFoundError:
        raise ValueError("还没有授权密钥")
    key_lines = [i for i, ln in enumerate(lines)
                 if ln.strip() and not ln.lstrip().startswith("#")]
    if index < 0 or index >= len(key_lines):
        raise ValueError("密钥序号超出范围")
    del lines[key_lines[index]]
    _ssh_rewrite(path, ent, lines)
    return {"ok": True}


def _nm_split(line):
    parts, cur, esc = [], "", False
    for ch in line:
        if esc:
            cur += ch
            esc = False
        elif ch == "\\":
            esc = True
        elif ch == ":":
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return parts


def _nmcli(args, timeout=30, need_root=True):
    argv = ["nmcli"] + [str(a) for a in args]
    return run(as_root(argv) if need_root else argv, timeout=timeout)


def rpc_net_conns(_):
    r = _nmcli(["-t", "-f", "NAME,UUID,TYPE,DEVICE", "connection", "show"], need_root=False)
    if not r.get("ok"):
        raise RuntimeError((r.get("err") or r.get("out") or "读取 NetworkManager 连接失败").strip())
    out = []
    for line in r.get("out", "").splitlines():
        f = _nm_split(line)
        if len(f) >= 4 and f[0]:
            out.append({"name": f[0], "uuid": f[1], "type": f[2], "device": f[3]})
    return out


def _ipv4(text, what):
    try:
        addr = ipaddress.ip_address(str(text).strip())
    except ValueError:
        raise ValueError("%s不是合法的 IP 地址" % what)
    if addr.version != 4:
        raise ValueError("%s只支持 IPv4" % what)
    return str(addr)


def rpc_net_detail(params):
    iface = str(params.get("iface") or "").strip()
    if iface and not re.fullmatch(r"[A-Za-z0-9_.@:-]{1,32}", iface):
        raise ValueError("非法网络接口")
    addr, prefix, gw, dns = "", 24, "", []
    r = _nmcli(["-t", "-f", "IP4.ADDRESS,IP4.GATEWAY,IP4.DNS", "device", "show", iface],
               need_root=False)
    if r.get("ok"):
        for line in r.get("out", "").splitlines():
            key, _, value = line.partition(":")
            base, value = key.split("[")[0], value.strip()
            if not value:
                continue
            if base == "IP4.ADDRESS" and not addr:
                ip, _, pfx = value.partition("/")
                addr = ip
                if pfx.isdigit() and 1 <= int(pfx) <= 32:
                    prefix = int(pfx)
            elif base == "IP4.GATEWAY" and not gw:
                gw = value
            elif base == "IP4.DNS":
                dns.append(value)
    if not addr:
        r2 = run(["ip", "-o", "-4", "addr", "show", "dev", iface])
        m = re.search(r"inet (\d+\.\d+\.\d+\.\d+)/(\d+)", r2.get("out", ""))
        if m:
            addr, prefix = m.group(1), int(m.group(2))
    if not gw:
        r3 = run(["ip", "route", "show", "default", "dev", iface])
        m = re.search(r"default via (\S+)", r3.get("out", ""))
        gw = m.group(1) if m else ""
    if not dns:
        try:
            with open("/etc/resolv.conf", encoding="utf-8", errors="replace") as fh:
                dns = [ln.split()[1] for ln in fh if ln.startswith("nameserver") and len(ln.split()) > 1]
        except OSError:
            dns = []
    return {"iface": iface, "addr": addr, "prefix": prefix, "gw": gw, "dns": ", ".join(dns[:3])}


def rpc_net_set4(params):
    conn = str(params.get("conn") or "").strip()
    if not conn:
        raise ValueError("缺少连接名")
    names = {c["name"] for c in rpc_net_conns(None)}
    if conn not in names:
        raise ValueError("NetworkManager 里没有这个连接：%s" % conn)
    addr = _ipv4(params.get("addr"), "IPv4 地址")
    try:
        prefix = int(params.get("prefix"))
    except (TypeError, ValueError):
        raise ValueError("子网前缀必须是整数")
    if prefix < 1 or prefix > 32:
        raise ValueError("子网前缀需要在 1-32 之间")
    gw = str(params.get("gw") or "").strip()
    if gw:
        gw = _ipv4(gw, "网关")
    dns_raw = re.split(r"[,，\s]+", str(params.get("dns") or "").strip())
    dns = [_ipv4(x, "DNS 地址") for x in dns_raw if x]
    args = ["connection", "modify", conn, "ipv4.method", "manual",
            "ipv4.addresses", "%s/%d" % (addr, prefix)]
    if gw:
        args += ["ipv4.gateway", gw]
    if dns:
        args += ["ipv4.dns", " ".join(dns), "ipv4.ignore-auto-dns", "yes"]
    r = _nmcli(args, timeout=30)
    if not r.get("ok"):
        raise RuntimeError("修改连接失败：%s" % (r.get("err") or r.get("out")).strip()[-400:])
    r = _nmcli(["connection", "up", conn], timeout=60)
    if not r.get("ok"):
        raise RuntimeError("应用连接失败：%s" % (r.get("err") or r.get("out")).strip()[-400:])
    return {"ok": True}


def rpc_net_link(params):
    dev = str(params.get("dev") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_.@:-]{1,32}", dev):
        raise ValueError("非法网络接口")
    action = str(params.get("action") or "")
    if action not in ("connect", "disconnect"):
        raise ValueError("未知操作")
    r = _nmcli(["device", action, dev], timeout=60)
    if not r.get("ok"):
        raise RuntimeError("网卡操作失败：%s" % (r.get("err") or r.get("out")).strip()[-400:])
    return {"ok": True}


def rpc_file_read(params):
    path = safe_path(str(params.get("path") or ""))
    if not os.path.isfile(path):
        raise ValueError("不是普通文件")
    try:
        size = os.path.getsize(path)
    except OSError as e:
        raise RuntimeError("读取文件失败：%s" % e)
    if size > 64 * 1024 * 1024:
        raise ValueError("文件过大（上限 64 MB）")
    try:
        with open(path, "rb") as fh:
            data = fh.read()
    except OSError as e:
        raise RuntimeError("读取文件失败：%s" % e)
    return {"b64": base64.b64encode(data).decode("ascii"), "size": len(data)}


UPLOADS = {}
UPLOADS_LOCK = threading.Lock()
UPLOAD_TTL = 6 * 3600
UPLOAD_MAX = 16 * 1024 * 1024 * 1024
UPLOAD_PREFIX = ".debnas-upload-"


def _upload_prune(parent):
    """清掉同目录里超时未完成的分片临时文件。"""
    now = time.time()
    try:
        for name in os.listdir(parent):
            if name.startswith(UPLOAD_PREFIX) and name.endswith(".part"):
                tmp = os.path.join(parent, name)
                try:
                    if now - os.path.getmtime(tmp) > UPLOAD_TTL:
                        os.unlink(tmp)
                except OSError:
                    pass
    except OSError:
        pass


def rpc_upload_start(params):
    path = safe_path(str(params.get("path") or ""))
    parent = os.path.dirname(path.rstrip("/")) or "/"
    if not os.path.isdir(parent):
        raise ValueError("目标目录不存在：%s" % parent)
    if os.path.isdir(path):
        raise ValueError("目标是一个目录：%s" % path)
    _upload_prune(parent)
    token = secrets.token_hex(16)
    tmp = os.path.join(parent, UPLOAD_PREFIX + token + ".part")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)
    with UPLOADS_LOCK:
        UPLOADS[token] = {"path": path, "tmp": tmp, "size": 0, "seq": 0, "at": time.time()}
    return {"id": token}


def _upload_token(params):
    token = str(params.get("id") or "")
    if not re.fullmatch(r"[0-9a-f]{32}", token):
        raise ValueError("上传会话不合法")
    return token


def rpc_upload_chunk(params):
    token = _upload_token(params)
    try:
        seq = int(params.get("seq"))
    except (TypeError, ValueError):
        raise ValueError("分片序号不正确")
    try:
        raw = base64.b64decode(str(params.get("data") or ""), validate=True)
    except Exception:
        raise ValueError("分片数据格式错误")
    if not raw:
        raise ValueError("分片不能为空")
    with UPLOADS_LOCK:
        u = UPLOADS.get(token)
        if not u:
            raise ValueError("上传会话已失效，请重新上传")
        if u["seq"] != seq:
            raise ValueError("分片顺序错误")
        if u["size"] + len(raw) > UPLOAD_MAX:
            raise ValueError("文件过大（上限 16 GB）")
        try:
            with open(u["tmp"], "ab") as fh:
                fh.write(raw)
        except OSError as e:
            raise RuntimeError("写入临时文件失败：%s" % e)
        u["size"] += len(raw)
        u["seq"] += 1
        u["at"] = time.time()
        size = u["size"]
    return {"ok": True, "size": size}


def rpc_upload_finish(params):
    token = _upload_token(params)
    with UPLOADS_LOCK:
        u = UPLOADS.pop(token, None)
        if not u:
            raise ValueError("上传会话已失效，请重新上传")
        try:
            if os.path.isdir(u["path"]):
                raise ValueError("目标是一个目录：%s" % u["path"])
            os.replace(u["tmp"], u["path"])
            os.chmod(u["path"], 0o644)
            if os.geteuid() == 0:
                ent = _fs_owner(u["path"])
                if ent:
                    os.chown(u["path"], ent.pw_uid, ent.pw_gid)
        except Exception:
            try:
                os.unlink(u["tmp"])
            except OSError:
                pass
            raise
        return {"ok": True, "size": u["size"]}


def rpc_upload_abort(params):
    token = _upload_token(params)
    with UPLOADS_LOCK:
        u = UPLOADS.pop(token, None)
    if u:
        try:
            os.unlink(u["tmp"])
        except OSError:
            pass
    return {"ok": True}


def rpc_portal_redeploy(_):
    """只跑部署时发布的那份 /deploy.sh。

    以前允许客户端传 `source`，指向任意目录里的 `deploy-web.sh` 再以 root 执行，
    等于给了登录用户一个本地提权口子；现在固定脚本路径，且由 api_rpc 校验 sudo 组。
    """
    script = os.path.join(STATIC_DIR, "deploy.sh")
    if not os.path.isfile(script):
        raise ValueError("找不到部署脚本（先跑一次 deploy-web.sh 发布 /deploy.sh）")
    unit = "debnas-redeploy-%d" % int(time.time())
    r = run(as_root(["systemd-run", "--quiet", "--collect", "--unit", unit,
                     "--on-active=3", "/bin/bash", script, "--skip-deps"]), timeout=15)
    if not r.get("ok"):
        raise RuntimeError("无法安排重新部署：%s" % (r.get("err") or r.get("out")).strip()[-400:])
    return {"ok": True, "delay": 3}


def rpc_cockpit_apps(_):
    base = "/usr/share/cockpit"
    skip = {"base1", "branding", "static", "debnas-portal", "shell"}
    out = []
    try:
        for name in sorted(os.listdir(base)):
            if name in skip or not os.path.isdir(os.path.join(base, name)):
                continue
            label = name
            try:
                with open(os.path.join(base, name, "manifest.json"), encoding="utf-8") as f:
                    m = json.load(f)
                tools = m.get("tools") or {}
                menu = m.get("menu") or {}
                for part in (menu, tools):
                    for v in part.values():
                        if isinstance(v, dict) and v.get("label"):
                            label = v["label"]
                            break
                    if label != name:
                        break
            except Exception:
                pass
            out.append({"pkg": name, "label": label})
    except Exception:
        pass
    return out


def rpc_login_history(_):
    out = run(["sh", "-c", "LC_ALL=C last -n 25 -F -w 2>/dev/null | head -30"]).get("out", "")
    # last -F -w 的日期是 "Sun Nov  8 00:35:57 2026"，中间有两个空格
    pat = re.compile(
        r"^(\S+)\s+(\S+)\s+(\S+)\s+"
        r"([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+-\s+(.*)$")
    rows = []
    for line in out.splitlines():
        line = line.strip()
        if not line or line.startswith(("wtmp", "reboot", "shutdown")):
            continue
        m = pat.match(line)
        if not m:
            continue
        rest = m.group(5).strip()
        if rest.startswith("still logged in"):
            end, dur = "仍在登录", "—"
        else:
            dm = re.match(r"(.+?)\s+\(([^)]+)\)\s*$", rest)
            if dm:
                end, dur = dm.group(1).strip(), dm.group(2).strip()
            else:
                end, dur = rest, "—"
        ip = m.group(3) if m.group(3) != "-" else "本地"

        def fmt_dt(raw):
            try:
                t = time.strptime(re.sub(r"\s+", " ", raw), "%a %b %d %H:%M:%S %Y")
                return time.strftime("%Y-%m-%d %H:%M:%S", t)
            except Exception:
                return raw

        rows.append({"user": m.group(1), "tty": m.group(2), "from": ip, "ip": ip,
                     "start": fmt_dt(m.group(4)),
                     "end": end if end == "仍在登录" else fmt_dt(end),
                     "dur": dur, "raw": line})
    return rows


def _smart_read(dev, dtype=None):
    argv = ["smartctl", "-a", "-j"]
    if dtype:
        argv += ["-d", dtype]
    argv.append(dev)
    r = run(argv, timeout=15)
    info = {"health": None, "message": "", "temp": None, "hours": None}
    try:
        j = json.loads(r.get("out") or "{}")
    except Exception:
        return info
    info["message"] = " ".join(str(m.get("string") or "")
                               for m in ((j.get("smartctl") or {}).get("messages") or []))
    status = j.get("smart_status")
    if isinstance(status, dict) and "passed" in status:
        info["health"] = "PASSED" if status.get("passed") else "FAILED"
    info["temp"] = (j.get("temperature") or {}).get("current")
    info["hours"] = (j.get("power_on_time") or {}).get("hours")
    return info


def rpc_smart(_):
    try:
        data = json.loads(run(["lsblk", "-J", "-d", "-o", "NAME,MODEL"]).get("out") or "{}")
    except Exception:
        data = {"blockdevices": []}
    out = []
    for d in data.get("blockdevices", []):
        name = d.get("name")
        if not name:
            continue
        dev = "/dev/" + name
        info = _smart_read(dev)
        # USB 桥接盘常见：不带 -d sat 读不到 SMART
        if info["health"] is None and ("unknown usb bridge" in info["message"].lower()
                                       or "unsupported" in info["message"].lower()):
            info = _smart_read(dev, "sat")
        if info["health"] is None:
            low = info["message"].lower()
            if any(k in low for k in ("permission denied", "operation not permitted",
                                      "unable to detect device type", "unknown usb bridge")):
                info["health"] = "UNAVAILABLE"
            else:
                info["health"] = "UNKNOWN"
        out.append({"name": name, "model": (d.get("model") or "").strip(),
                    "health": info["health"], "temp": info["temp"],
                    "hours": info["hours"], "message": info["message"][:200]})
    return out


def rpc_conn_traffic(_):
    out = run(["sh", "-c", "ss -tin 2>/dev/null"]).get("out", "")
    peers = {}
    cur = None
    for line in out.splitlines():
        if line and not line.startswith((" ", "\t")):
            m = re.search(r"\s(\S+):(\d+)\s+\S+", line)
            if m:
                cur = m.group(1)
                peers.setdefault(cur, {"sent": 0, "recv": 0})
        elif cur:
            m = re.search(r"bytes_sent:(\d+)", line)
            if m:
                peers[cur]["sent"] += int(m.group(1))
            m = re.search(r"bytes_received:(\d+)", line)
            if m:
                peers[cur]["recv"] += int(m.group(1))
    items = [{"peer": k, "sent": v["sent"], "recv": v["recv"],
              "bytes": v["sent"] + v["recv"]} for k, v in peers.items() if v["sent"] + v["recv"] > 0]
    items.sort(key=lambda x: -x["bytes"])
    total = sum(x["bytes"] for x in items) or 1
    for x in items:
        x["pct"] = round(x["bytes"] * 100.0 / total, 1)
    return items[:6]


_NETINFO_CACHE = {}
_NETINFO_TTL = 30


def _public_ip(url):
    try:
        r = subprocess.run(["curl", "-s", "-m", "2", url],
                           capture_output=True, text=True, errors="replace", timeout=3)
        val = (r.stdout or "").strip()
        m = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})", val)
        return m.group(1) if m else ""
    except Exception:
        return ""


def rpc_netinfo(params):
    iface = params.get("iface") or ""
    if iface and not re.fullmatch(r"[A-Za-z0-9_.@:-]{1,32}", iface):
        raise ValueError("非法接口名")

    # 网关 / DNS / 延迟 / 公网 IP 不会每秒变化：缓存 30 秒，网络页反复刷新不再等 ping 和公网请求
    hit = _NETINFO_CACHE.get(iface)
    if hit and time.time() - hit[0] < _NETINFO_TTL:
        return hit[1]

    route = run(["ip", "route", "show", "default"]).get("out", "")
    m = re.search(r"default via (\S+)", route)
    gateway = m.group(1) if m else ""
    dns = []
    try:
        with open("/etc/resolv.conf", encoding="utf-8") as f:
            for line in f:
                if line.startswith("nameserver"):
                    parts = line.split()
                    if len(parts) > 1:
                        dns.append(parts[1])
    except Exception:
        pass
    latency = None
    if gateway:
        ping = run(["ping", "-c", "1", "-W", "1", gateway]).get("out", "")
        m2 = re.search(r"time=([\d.]+)", ping)
        if m2:
            latency = float(m2.group(1))

    # 三个公网地址服务并发问，按顺序取第一个成功的结果；全失败最多等一个 2 秒超时
    public_ip = ""
    with ThreadPoolExecutor(max_workers=3) as ex:
        for val in ex.map(_public_ip, (
                "https://api.ipify.org", "https://myip.ipip.net", "https://ipinfo.io/ip")):
            if val:
                public_ip = val
                break

    signal = None

    def wl_signal(name):
        out = run(["iw", "dev", name, "link"]).get("out", "")
        mm = re.search(r"signal:\s*(-?\d+)", out)
        return int(mm.group(1)) if mm else None

    if iface:
        signal = wl_signal(iface)
    if signal is None:
        for name in run(["sh", "-c", "ls /sys/class/net"]).get("out", "").split():
            if name.startswith("wl"):
                signal = wl_signal(name)
                if signal is not None:
                    break

    result = {"gateway": gateway, "dns": dns, "latency": latency,
              "publicIp": public_ip, "signal": signal}
    _NETINFO_CACHE[iface] = (time.time(), result)
    return result


def _walk_dirs(root, max_depth=2, limit=300):
    stack = [(root, 0)]
    seen = 0
    while stack and seen < limit:
        path, depth = stack.pop()
        yield path
        seen += 1
        if depth >= max_depth:
            continue
        try:
            for ent in os.scandir(path):
                if ent.name.startswith("."):
                    continue
                try:
                    if ent.is_dir(follow_symlinks=False):
                        stack.append((ent.path, depth + 1))
                except OSError:
                    continue
        except OSError:
            continue


def vm_scan_isos():
    """扫描常见目录里的 ISO；手动路径由 vm_safe_iso 单独校验。"""
    dirs, seen_dirs = [], set()
    bases = []
    for base in [VM_IMAGES_DIR] + VM_ISO_DIRS:
        if base:
            bases.append((base, 2))
    for base, depth in (("/srv", 3), ("/home", 2), ("/mnt", 2), ("/media", 2)):
        if os.path.isdir(base):
            bases.append((base, depth))
    for base, depth in bases:
        for d in _walk_dirs(base, max_depth=depth, limit=300):
            real = os.path.realpath(d)
            if real not in seen_dirs:
                seen_dirs.add(real)
                dirs.append(d)
    out, seen = [], set()
    for d in dirs:
        try:
            for ent in os.scandir(d):
                try:
                    if not ent.name.lower().endswith(".iso") or not ent.is_file():
                        continue
                    real = os.path.realpath(ent.path)
                    if real in seen:
                        continue
                    st = ent.stat()
                    seen.add(real)
                    out.append({"name": ent.name, "path": real, "size": st.st_size,
                                "mtime": int(st.st_mtime)})
                except OSError:
                    continue
        except OSError:
            continue
        if len(out) >= 200:
            break
    out.sort(key=lambda x: (-x["mtime"], x["name"].lower()))
    return out


def vm_safe_iso(path):
    path = str(path or "").strip()
    if not path.startswith("/") or "\x00" in path:
        raise ValueError("ISO 必须是绝对路径")
    real = os.path.realpath(path)
    if not real.lower().endswith(".iso"):
        raise ValueError("安装镜像必须是 .iso 文件")
    if not os.path.isfile(real):
        raise ValueError("安装镜像不存在：%s" % real)
    roots = [os.path.realpath(p) for p in VM_ISO_ROOTS]
    if not any(real == r or real.startswith(r.rstrip("/") + os.sep) for r in roots):
        raise ValueError("ISO 必须位于以下目录之一：%s" % ", ".join(VM_ISO_ROOTS))
    if not os.access(real, os.R_OK):
        raise ValueError("安装镜像不可读：%s" % real)
    return real


def _inside(root, path):
    try:
        root = os.path.realpath(root)
        real = os.path.realpath(path)
        return os.path.commonpath([root, real]) == root
    except (ValueError, OSError):
        return False


def _remove_file(path):
    try:
        os.remove(path)
        return True
    except OSError:
        return False


def _virsh_raise(args, timeout=60, what="操作"):
    r = virsh(*args, timeout=timeout)
    if not r.get("ok"):
        raise ValueError("%s失败：%s" % (what, _tail(r)))
    return r


def rpc_vm_isos(_):
    return vm_scan_isos()


def rpc_vm_create(params):
    available, err = vm_available()
    if not available:
        raise ValueError("libvirt 不可用：%s" % err)

    name = vm_require_name(str(params.get("name", "")).strip(), create=True)
    try:
        vcpu = int(params.get("vcpu") or 2)
        mem = int(params.get("memory") or 2048)
        disk_gb = int(params.get("disk") or 20)
    except (TypeError, ValueError):
        raise ValueError("资源参数必须是整数")
    if not (1 <= vcpu <= 32):
        raise ValueError("vCPU 需在 1–32 之间")
    if not (256 <= mem <= 65536):
        raise ValueError("内存需在 256–65536 MB 之间")
    if not (1 <= disk_gb <= 4096):
        raise ValueError("磁盘需在 1–4096 GB 之间")

    iso = str(params.get("iso") or "").strip()
    if iso:
        iso = vm_safe_iso(iso)

    net_mode = str(params.get("netMode") or "").strip()
    net_name = str(params.get("netName") or "").strip()
    if not net_mode:
        # 兼容旧版前端：只给 bridge 时按桥接处理
        net_mode = "bridge" if params.get("bridge") else "network"
    if net_mode == "network":
        net_name = net_name or "default"
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", net_name):
            raise ValueError("非法网络名")
        info = virsh("net-info", net_name, timeout=10)
        if not info.get("ok"):
            raise ValueError("libvirt 网络不存在：%s" % net_name)
        if "Active: no" in (info.get("out") or ""):
            r = virsh("net-start", net_name, timeout=30)
            if not r.get("ok"):
                raise ValueError("网络 %s 未启动，且自动启动失败：%s" % (net_name, _tail(r)))
        if _truthy(params.get("autostart")) and "Autostart: no" in (info.get("out") or ""):
            virsh("net-autostart", net_name, timeout=20)
    elif net_mode == "bridge":
        if not re.fullmatch(r"[A-Za-z0-9_.@-]{1,32}", net_name):
            raise ValueError("非法桥接名")
        if not os.path.isdir("/sys/class/net/%s/bridge" % net_name):
            bridges = _host_bridges()
            raise ValueError("桥接 %s 不存在%s" % (
                net_name, ("；当前可用：" + "、".join(bridges)) if bridges else "（系统中没有 Linux bridge）"))
    elif net_mode == "none":
        pass
    else:
        raise ValueError("未知网络类型")

    if vm_info(name) is not None:
        raise ValueError("同名虚拟机已存在")
    try:
        os.makedirs(VM_IMAGES_DIR, mode=0o755, exist_ok=True)
    except OSError as e:
        raise ValueError("无法创建镜像目录 %s：%s" % (VM_IMAGES_DIR, e))
    disk_path = os.path.join(VM_IMAGES_DIR, name + ".qcow2")
    if os.path.exists(disk_path):
        raise ValueError("磁盘文件已存在：%s" % disk_path)
    if _free_bytes(VM_IMAGES_DIR) < 512 * 1024 * 1024:
        raise ValueError("镜像目录剩余空间不足 512 MB")

    r = run(["qemu-img", "create", "-f", "qcow2", disk_path, "%dG" % disk_gb],
            timeout=60, env=VM_ENV)
    if not r.get("ok"):
        raise ValueError("创建磁盘失败：%s" % _tail(r))

    # Windows 安装盘默认没有 virtio 驱动；兼容模式用 SATA 磁盘 + e1000e 网卡
    compat = _truthy(params.get("compat"))
    disk_bus = "sata" if compat else "virtio"
    net_model = "e1000e" if compat else "virtio"
    vnc_pass = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))
    argv = ["virt-install", "--connect", VM_URI, "--name", name,
            "--memory", str(mem), "--vcpus", str(vcpu),
            "--disk", "path=%s,format=qcow2,bus=%s" % (disk_path, disk_bus),
            "--graphics", "vnc,listen=127.0.0.1,password=%s" % vnc_pass,
            "--os-variant", "generic", "--print-xml"]
    if net_mode == "network":
        argv += ["--network", "network=%s,model=%s" % (net_name, net_model)]
    elif net_mode == "bridge":
        argv += ["--network", "bridge=%s,model=%s" % (net_name, net_model)]
    else:
        argv += ["--network", "none"]
    if iso:
        argv += ["--cdrom", iso]
    else:
        argv += ["--import"]

    r = run(argv, timeout=180, env=VM_ENV)
    if not r.get("ok"):
        _remove_file(disk_path)
        raise ValueError("生成虚拟机配置失败：%s" % _tail(r, 400))
    xml = (r.get("out") or "").strip()
    if not xml.startswith("<domain"):
        _remove_file(disk_path)
        raise ValueError("virt-install 没有返回有效 XML")
    # 带 --cdrom 时 virt-install 会输出“安装阶段”和“最终”两份 XML；
    # 我们要安装阶段那份（含光驱），并把安装完重启改成正常重启而不是销毁。
    end = xml.find("</domain>")
    if end >= 0:
        xml = xml[:end + len("</domain>")]
    xml = re.sub(r"<on_reboot>\s*destroy\s*</on_reboot>",
                 "<on_reboot>restart</on_reboot>", xml)
    if not iso:
        # 没有安装介质时也放一个空光驱，之后可以在详情页里插入 ISO
        cdrom = ('<disk type="file" device="cdrom"><driver name="qemu" type="raw"/>'
                 '<target dev="hda" bus="ide"/><readonly/></disk>')
        if "<disk" in xml and "</devices>" in xml:
            xml = xml.replace("</devices>", cdrom + "</devices>", 1)
        xml = re.sub(r'<boot dev=["\']hd["\']\s*/>',
                     '<boot dev="cdrom"/><boot dev="hd"/>', xml, count=1)

    fd, xml_path = tempfile.mkstemp(prefix="debnas-vm-", suffix=".xml")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(xml)
        d = virsh("define", xml_path, timeout=60)
    finally:
        try:
            os.remove(xml_path)
        except OSError:
            pass
    if not d.get("ok"):
        _remove_file(disk_path)
        raise ValueError("定义虚拟机失败：%s" % _tail(d, 400))

    warnings = []
    if _truthy(params.get("autostart")):
        a = virsh("autostart", name, timeout=20)
        if not a.get("ok"):
            warnings.append("设置开机自启失败：%s" % _tail(a))
    started = False
    if _truthy(params.get("start", True)):
        s = virsh("start", name, timeout=90)
        if s.get("ok"):
            started = True
        else:
            warnings.append("虚拟机已创建，但开机失败：%s" % _tail(s))
    return {"name": name, "disk": disk_path, "started": started, "warnings": warnings}


def rpc_vm_delete(params):
    name = vm_require_name(params.get("name"))
    info = vm_info(name)
    if info is None:
        raise ValueError("虚拟机不存在：%s" % name)
    if info.get("state") not in ("shut off", "crashed"):
        raise ValueError("请先关机再删除（当前状态：%s）" % (info.get("state") or "未知"))

    disks = [d for d in vm_disks(name) if d.get("device") == "disk" and d.get("path")]
    last = None
    for flags in (["--snapshots-metadata", "--nvram"], ["--snapshots-metadata"],
                  ["--nvram"], []):
        last = virsh("undefine", name, *flags, timeout=60)
        if last.get("ok"):
            break
    if not last or not last.get("ok"):
        raise ValueError("删除虚拟机失败：%s" % _tail(last or {}))

    removed, kept = [], []
    if _truthy(params.get("removeDisks", True)):
        for d in disks:
            path = d["path"]
            if _inside(VM_IMAGES_DIR, path) and _remove_file(path):
                removed.append(path)
            elif not _inside(VM_IMAGES_DIR, path):
                kept.append(path)
    else:
        kept = [d["path"] for d in disks]
    return {"ok": True, "removed": removed, "kept": kept}


def _snapshot_ok(s):
    s = str(s or "")
    return bool(s) and len(s) <= 100 and s not in (".", "..") \
        and not s.startswith("-") and not re.search(r"[\x00-\x1f/]", s)


def rpc_vm_snapshots(params):
    name = vm_require_name(params.get("name"))
    if vm_info(name) is None:
        raise ValueError("虚拟机不存在：%s" % name)
    out = []
    for snap in vm_snapshot_names(name)[:100]:
        item = {"name": snap, "description": "", "created": 0, "state": ""}
        r = virsh("snapshot-dumpxml", name, snap, timeout=10)
        if r.get("ok"):
            try:
                root = ET.fromstring(r.get("out") or "")
                item["description"] = root.findtext("description") or ""
                item["created"] = _first_int(root.findtext("creationTime") or 0)
                item["state"] = root.findtext("state") or ""
            except Exception:
                pass
        out.append(item)
    out.sort(key=lambda x: (-x["created"], x["name"]))
    return out


def rpc_vm_snapshot_create(params):
    name = vm_require_name(params.get("name"))
    snap = str(params.get("snapshot") or "").strip()
    if snap and not _snapshot_ok(snap):
        raise ValueError("快照名不合法")
    if not snap:
        snap = "snap-" + time.strftime("%Y%m%d-%H%M%S")
    if vm_info(name) is None:
        raise ValueError("虚拟机不存在：%s" % name)
    desc = str(params.get("description") or "debnas 控制台")[:200]
    _virsh_raise(("snapshot-create-as", name, snap, "--description", desc),
                 timeout=180, what="创建快照")
    return {"name": snap}


def rpc_vm_snapshot_delete(params):
    name = vm_require_name(params.get("name"))
    snap = str(params.get("snapshot") or "")
    if not _snapshot_ok(snap):
        raise ValueError("快照名不合法")
    _virsh_raise(("snapshot-delete", name, snap), timeout=180, what="删除快照")
    return {"ok": True}


def rpc_vm_snapshot_revert(params):
    name = vm_require_name(params.get("name"))
    snap = str(params.get("snapshot") or "")
    if not _snapshot_ok(snap):
        raise ValueError("快照名不合法")
    _virsh_raise(("snapshot-revert", name, snap), timeout=180, what="恢复快照")
    return {"ok": True}


def rpc_vm_config(params):
    name = vm_require_name(params.get("name"))
    info = vm_info(name)
    if info is None:
        raise ValueError("虚拟机不存在：%s" % name)
    if info.get("state") != "shut off":
        raise ValueError("请先关机再调整资源")
    try:
        vcpu = int(params.get("vcpu") or 0)
        mem = int(params.get("memory") or 0)
    except (TypeError, ValueError):
        raise ValueError("资源参数必须是整数")
    if vcpu and not (1 <= vcpu <= 32):
        raise ValueError("vCPU 需在 1–32 之间")
    if mem and not (256 <= mem <= 65536):
        raise ValueError("内存需在 256–65536 MB 之间")

    if vcpu:
        cur_max = _first_int(virsh("vcpucount", name, "--maximum", "--config", timeout=10).get("out", "0"))
        if vcpu > cur_max:
            _virsh_raise(("setvcpus", name, str(vcpu), "--config", "--maximum"), what="调整 vCPU 上限")
            _virsh_raise(("setvcpus", name, str(vcpu), "--config"), what="调整 vCPU")
        else:
            _virsh_raise(("setvcpus", name, str(vcpu), "--config"), what="调整 vCPU")
            _virsh_raise(("setvcpus", name, str(vcpu), "--config", "--maximum"), what="调整 vCPU 上限")

    if mem:
        new_kib = mem * 1024
        old_max_kib = (info.get("memMax") or 0) // 1024
        if new_kib > old_max_kib:
            _virsh_raise(("setmaxmem", name, str(new_kib), "--config"), what="调整内存上限")
            _virsh_raise(("setmem", name, str(new_kib), "--config"), what="调整内存")
        else:
            _virsh_raise(("setmem", name, str(new_kib), "--config"), what="调整内存")
            _virsh_raise(("setmaxmem", name, str(new_kib), "--config"), what="调整内存上限")

    return {"vcpu": vcpu or info.get("vcpu"), "memory": mem or (info.get("memMax", 0) // (1024 * 1024))}


def rpc_vm_cdrom(params):
    name = vm_require_name(params.get("name"))
    info = vm_info(name)
    if info is None:
        raise ValueError("虚拟机不存在：%s" % name)
    cd = next((d for d in vm_disks(name) if d.get("device") == "cdrom"), None)
    if cd is None:
        raise ValueError("该虚拟机没有光驱")
    target = cd["target"]
    iso = str(params.get("iso") or "").strip()
    args = ["change-media", name, target]
    if iso:
        iso = vm_safe_iso(iso)
        args += ["--insert", iso, "--force"]
    else:
        args += ["--eject", "--force"]
    if info.get("state") in ("running", "paused"):
        args += ["--config", "--live"]
    else:
        args += ["--config"]
    _virsh_raise(tuple(args), timeout=60, what="更换光盘")
    return {"target": target, "iso": iso}


def rpc_vm_disk_resize(params):
    name = vm_require_name(params.get("name"))
    target = str(params.get("target") or "")
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,16}", target):
        raise ValueError("非法磁盘目标")
    try:
        size_gb = int(params.get("size") or 0)
    except (TypeError, ValueError):
        raise ValueError("容量必须是整数")
    if not (1 <= size_gb <= 8192):
        raise ValueError("容量需在 1–8192 GB 之间")

    info = vm_info(name)
    if info is None:
        raise ValueError("虚拟机不存在：%s" % name)
    disk = next((d for d in vm_disks(name) if d["target"] == target), None)
    if disk is None or disk.get("device") != "disk":
        raise ValueError("磁盘 %s 不存在" % target)
    path = disk.get("path") or ""
    if not _inside(VM_IMAGES_DIR, path):
        raise ValueError("只能扩容镜像目录内的磁盘")
    new_bytes = size_gb * 1024 ** 3
    if new_bytes <= (disk.get("capacity") or 0):
        raise ValueError("新容量必须大于当前容量")

    if info.get("state") in ("running", "paused"):
        # 注意：--size 不带单位时 libvirt 按 KiB 解释，必须带 G 后缀
        _virsh_raise(("blockresize", name, target, "--size", "%dG" % size_gb),
                     timeout=120, what="扩容磁盘")
    else:
        r = run(["qemu-img", "resize", path, str(new_bytes)], timeout=120, env=VM_ENV)
        if not r.get("ok"):
            raise ValueError("扩容磁盘失败：%s" % _tail(r))
    return {"target": target, "capacity": new_bytes}


def vm_vnc_target(name):
    """供 WebSocket 代理使用：只允许连接指定虚拟机的 VNC 端口。"""
    name = vm_require_name(name)
    info = vm_info(name)
    if info is None:
        raise ValueError("虚拟机不存在：%s" % name)
    if info.get("state") not in ("running", "paused"):
        raise ValueError("虚拟机未运行")
    g = vm_xml_vnc(vm_dump(name))
    if g is None:
        raise ValueError("该虚拟机没有 VNC 图形设备")
    if g.get("socket"):
        raise ValueError("该虚拟机的 VNC 使用 unix socket，无法通过网页访问")
    port = g.get("port") or 0
    if port <= 0:
        raise ValueError("VNC 端口尚未分配，请稍后重试")
    listen = g.get("listen") or "127.0.0.1"
    if listen in ("", "0.0.0.0"):
        listen = "127.0.0.1"
    elif listen == "::":
        listen = "::1"
    return listen, port


def rpc_vm_console(params):
    name = vm_require_name(params.get("name"))
    listen, port = vm_vnc_target(name)
    g = vm_xml_vnc(vm_dump(name)) or {}
    return {
        "name": name, "listen": listen, "port": port,
        "password": g.get("password") or "",
        "direct": "vnc://%s:%d" % (listen, port),
        "wsPath": "/api/vnc?name=" + quote(name),
        "novnc": _novnc_ready(),
        "tunnel": "ssh -L 5900:127.0.0.1:%d <用户名>@<主机>" % port,
    }


# ---------------------------------------------------------------- WebSocket（VNC 代理）
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
WS_MAX_FRAME = 16 * 1024 * 1024


def _ws_send(sock, lock, opcode, payload=b""):
    n = len(payload)
    head = bytearray([0x80 | (opcode & 0x0F)])
    if n < 126:
        head.append(n)
    elif n < 65536:
        head.append(126)
        head += struct.pack("!H", n)
    else:
        head.append(127)
        head += struct.pack("!Q", n)
    with lock:
        sock.sendall(bytes(head) + payload)


def _ws_read_frame(fp):
    hdr = fp.read(2)
    if not hdr or len(hdr) < 2:
        return None
    b1, b2 = hdr[0], hdr[1]
    fin = bool(b1 & 0x80)
    opcode = b1 & 0x0F
    masked = bool(b2 & 0x80)
    length = b2 & 0x7F
    if length == 126:
        ext = fp.read(2)
        if not ext or len(ext) < 2:
            return None
        length = struct.unpack("!H", ext)[0]
    elif length == 127:
        ext = fp.read(8)
        if not ext or len(ext) < 8:
            return None
        length = struct.unpack("!Q", ext)[0]
    if length > WS_MAX_FRAME:
        return None
    mask = fp.read(4) if masked else None
    if masked and (not mask or len(mask) < 4):
        return None
    payload = fp.read(length) if length else b""
    if length and (payload is None or len(payload) < length):
        return None
    if mask:
        payload = bytes(c ^ mask[i % 4] for i, c in enumerate(payload))
    return fin, opcode, payload


def ws_vnc_bridge(sock, fp, host, port):
    """在一条 WebSocket 连接和一条 TCP VNC 连接之间双向转发。"""
    try:
        vnc = socket.create_connection((host, port), timeout=10)
    except OSError as e:
        try:
            _ws_send(sock, threading.Lock(), 8, b"")
        except Exception:
            pass
        sys.stderr.write("vm console: connect %s:%s failed: %s\n" % (host, port, e))
        return
    vnc.settimeout(7200)
    lock = threading.Lock()
    stop = threading.Event()

    def pump_vnc():
        try:
            while not stop.is_set():
                data = vnc.recv(65536)
                if not data:
                    break
                _ws_send(sock, lock, 2, data)
        except OSError:
            pass
        finally:
            stop.set()
            try:
                _ws_send(sock, lock, 8, b"")
            except Exception:
                pass
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                vnc.close()
            except OSError:
                pass

    t = threading.Thread(target=pump_vnc, daemon=True)
    t.start()
    frag, frag_op = b"", None
    try:
        while not stop.is_set():
            frame = _ws_read_frame(fp)
            if frame is None:
                break
            fin, op, payload = frame
            if op == 8:
                break
            if op == 9:
                _ws_send(sock, lock, 10, payload)
                continue
            if op == 10:
                continue
            if op in (1, 2):
                frag, frag_op = payload, op
            elif op == 0:
                frag += payload
            else:
                continue
            if not fin:
                continue
            if frag_op in (1, 2) and frag:
                vnc.sendall(frag)
            frag, frag_op = b"", None
    except (OSError, ValueError):
        pass
    finally:
        stop.set()
        try:
            vnc.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            vnc.close()
        except OSError:
            pass
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        t.join(timeout=2)


def ws_term_bridge(sock, fp, user, home, cols, rows):
    """一条 WebSocket 对应一个 PTY 里的登录 shell。"""
    try:
        pid, master = pty.fork()
    except OSError as e:
        lock = threading.Lock()
        try:
            _ws_send(sock, lock, 1, json.dumps(
                {"type": "error", "message": "PTY 创建失败：%s" % e},
                ensure_ascii=False).encode())
            _ws_send(sock, lock, 8, b"")
        except Exception:
            pass
        sys.stderr.write("term: pty fork failed: %s\n" % e)
        return

    if pid == 0:  # 子进程：pty.fork 已把 slave 接到 0/1/2
        try:
            ent = pwd.getpwnam(user)
            if os.geteuid() == 0:
                # 直接切换 uid/gid，不依赖 sudoers；initgroups 清掉 root 的附加组
                os.initgroups(user, ent.pw_gid)
                os.setgid(ent.pw_gid)
                os.setuid(ent.pw_uid)
            target = ent.pw_dir if os.path.isdir(ent.pw_dir) else (home or "/")
            os.chdir(target)
            env = dict(os.environ)
            env.update({
                "TERM": "xterm-256color",
                "COLORTERM": "truecolor",
                "LANG": env.get("LANG") or "C.UTF-8",
                "SHELL": "/bin/bash",
                "HOME": ent.pw_dir,
                "USER": user,
                "LOGNAME": user,
                "XDG_RUNTIME_DIR": "/run/user/%d" % ent.pw_uid,
            })
            os.execvpe("/bin/bash", ["bash", "-l"], env)
        except BaseException:
            os._exit(127)

    try:
        os.set_blocking(master, False)
    except OSError:
        pass
    try:
        fcntl.ioctl(master, termios.TIOCSWINSZ,
                    struct.pack("HHHH", max(5, rows), max(20, cols), 0, 0))
    except OSError:
        pass

    lock = threading.Lock()
    stop = threading.Event()

    def pump():
        while not stop.is_set():
            try:
                ready, _, _ = select.select([master], [], [], 0.2)
            except (OSError, ValueError):
                break
            if not ready:
                continue
            try:
                data = os.read(master, 65536)
            except BlockingIOError:
                continue
            except OSError:
                break
            if not data:
                break
            try:
                _ws_send(sock, lock, 2, data)
            except Exception:
                break
        stop.set()
        try:
            _ws_send(sock, lock, 1, b'{"type":"exit"}')
        except Exception:
            pass
        try:
            _ws_send(sock, lock, 8, b"")
        except Exception:
            pass
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

    pump_t = threading.Thread(target=pump, daemon=True)
    pump_t.start()

    frag, frag_op = b"", None
    try:
        while not stop.is_set():
            frame = _ws_read_frame(fp)
            if frame is None:
                break
            fin, op, payload = frame
            if op == 8:
                break
            if op == 9:
                _ws_send(sock, lock, 10, payload)
                continue
            if op == 10:
                continue
            if op in (1, 2):
                frag, frag_op = payload, op
            elif op == 0:
                frag += payload
            else:
                continue
            if not fin:
                continue
            if frag_op == 1:
                # 控制帧：客户端只发 JSON（resize / ping）
                try:
                    msg = json.loads(frag.decode("utf-8", "replace"))
                except Exception:
                    msg = None
                if isinstance(msg, dict) and msg.get("type") == "resize":
                    try:
                        c = max(20, min(400, int(msg.get("cols") or cols)))
                        r = max(5, min(200, int(msg.get("rows") or rows)))
                        fcntl.ioctl(master, termios.TIOCSWINSZ,
                                    struct.pack("HHHH", r, c, 0, 0))
                    except (OSError, ValueError, TypeError):
                        pass
            elif frag_op == 2 and frag:
                mv = memoryview(frag)
                while mv and not stop.is_set():
                    try:
                        n = os.write(master, mv)
                    except BlockingIOError:
                        try:
                            select.select([], [master], [], 0.5)
                        except (OSError, ValueError):
                            break
                        continue
                    except OSError:
                        break
                    if n <= 0:
                        break
                    mv = mv[n:]
            frag, frag_op = b"", None
    except (OSError, ValueError):
        pass
    finally:
        stop.set()
        try:
            os.close(master)
        except OSError:
            pass
        for sig in (signal.SIGHUP, signal.SIGTERM):
            try:
                os.killpg(pid, sig)
            except OSError:
                pass
        def reap():
            try:
                os.waitpid(pid, 0)
            except OSError:
                pass
        threading.Thread(target=reap, daemon=True).start()
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass


RPC = {
    "info": rpc_info,
    "journal": rpc_journal,
    "listdir": rpc_listdir,
    "services": rpc_services,
    "power": rpc_power,
    "realtime": rpc_realtime,
    "shares": rpc_shares,
    "users": rpc_users,
    "storage": rpc_storage,
    "apps": rpc_apps,
    "credentials": rpc_credentials,
    "qq": rpc_qq,
    "mihomo": rpc_mihomo,
    "deepseek": rpc_deepseek,
    "mihomo_action": rpc_mihomo_action,
    "mihomo_import": rpc_mihomo_import,
    "net": rpc_net,
    "hw": rpc_hw,
    "netifaces": rpc_netifaces,
    "services_list": rpc_services_list,
    "service_action": rpc_service_action,
    "reboot": rpc_reboot,
    "apt_sim": rpc_apt_sim,
    "apt_upgrade": rpc_apt_upgrade,
    "auto_get": rpc_auto_get,
    "auto_set": rpc_auto_set,
    "apt_history": rpc_apt_history,
    "portal_info": rpc_portal_info,
    "containers": rpc_containers,
    "pull": rpc_pull,
    "vnc": rpc_vnc,
    "vms": rpc_vms,
    "vm_env": rpc_vm_env,
    "vm_action": rpc_vm_action,
    "vm_autostart": rpc_vm_autostart,
    "vm_isos": rpc_vm_isos,
    "vm_create": rpc_vm_create,
    "vm_delete": rpc_vm_delete,
    "vm_snapshots": rpc_vm_snapshots,
    "vm_snapshot_create": rpc_vm_snapshot_create,
    "vm_snapshot_delete": rpc_vm_snapshot_delete,
    "vm_snapshot_revert": rpc_vm_snapshot_revert,
    "vm_config": rpc_vm_config,
    "vm_disk_resize": rpc_vm_disk_resize,
    "vm_cdrom": rpc_vm_cdrom,
    "vm_console": rpc_vm_console,
    "fs_action": rpc_fs_action,
    "file_read": rpc_file_read,
    "upload_start": rpc_upload_start,
    "upload_chunk": rpc_upload_chunk,
    "upload_finish": rpc_upload_finish,
    "upload_abort": rpc_upload_abort,
    "samba": rpc_samba,
    "smb_export": rpc_smb_export,
    "smb_import": rpc_smb_import,
    "user_create": rpc_user_create,
    "user_delete": rpc_user_delete,
    "user_password": rpc_user_password,
    "samba_password": rpc_samba_password,
    "chage_set": rpc_chage_set,
    "group_create": rpc_group_create,
    "group_delete": rpc_group_delete,
    "ssh_keys": rpc_ssh_keys,
    "ssh_add": rpc_ssh_add,
    "ssh_remove": rpc_ssh_remove,
    "net_conns": rpc_net_conns,
    "net_detail": rpc_net_detail,
    "net_set4": rpc_net_set4,
    "net_link": rpc_net_link,
    "portal_redeploy": rpc_portal_redeploy,
    "cockpit_apps": rpc_cockpit_apps,
    "login_history": rpc_login_history,
    "smart": rpc_smart,
    "conn_traffic": rpc_conn_traffic,
    "cputimes": rpc_cputimes,
    "netinfo": rpc_netinfo,
}


# ---------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    server_version = "debnas-web/0.2"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---- 辅助
    def cookie_token(self):
        raw = self.headers.get("Cookie", "")
        for part in raw.split(";"):
            k, _, v = part.strip().partition("=")
            if k == "debnas_session":
                return v
        return ""

    def send_json(self, obj, status=200, extra_headers=None):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 2 * 1024 * 1024:
                raise ValueError("请求过大")
            return json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return {}

    # ---- 路由
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.send_json({"ok": True})
        if path == "/api/vnc":
            return self.api_vnc()
        if path == "/api/term":
            return self.api_term()
        if path in ("/", "/index.html"):
            page = "index.html" if (get_session(self.cookie_token()) or self.dev_session()) else "login.html"
            return self.serve_static("/" + page)
        if path == "/api/qqmedia":
            return self.api_qqmedia()
        if path == "/api/download":
            return self.api_download()
        if path == "/api/me":
            sess = get_session(self.cookie_token()) or self.dev_session()
            if not sess:
                return self.send_json({"error": "未登录"}, 401)
            try:
                home = pwd.getpwnam(sess["user"]).pw_dir
            except KeyError:
                home = "/home/" + sess["user"]
            return self.send_json({"user": sess["user"], "csrf": sess["csrf"],
                                   "host": socket.gethostname(), "home": home})
        return self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/login":
            return self.api_login()
        if path == "/api/logout":
            token = self.cookie_token()
            with sessions_lock:
                sessions.pop(token, None)
            return self.send_json({"ok": True},
                                  extra_headers={"Set-Cookie": "debnas_session=; Path=/; Max-Age=0; HttpOnly"})
        if path == "/api/exec":
            return self.api_exec()
        if path == "/api/rpc":
            return self.api_rpc()
        return self.send_json({"error": "not found"}, 404)

    def api_login(self):
        data = self.read_json()
        user = str(data.get("user", ""))[:64]
        password = str(data.get("password", ""))[:256]
        if not user or not password:
            return self.send_json({"error": "请输入用户名和密码"}, 400)
        try:
            pam_authenticate(user, password)
        except PamError as e:
            time.sleep(0.4)  # 抑制暴力尝试
            return self.send_json({"error": str(e)}, 401)
        except Exception:
            return self.send_json({"error": "认证服务不可用"}, 500)

        s = new_session(user)
        cookie = "debnas_session=%s; Path=/; HttpOnly; SameSite=Strict; Max-Age=%d" % (s["token"], SESSION_TTL)
        return self.send_json({"ok": True, "user": s["user"], "csrf": s["csrf"]},
                              extra_headers={"Set-Cookie": cookie})

    def dev_session(self):
        user = os.environ.get("DEBNAS_WEB_DEV_USER")
        if user and self.client_address[0] in ("127.0.0.1", "::1"):
            return {"user": user, "csrf": "dev"}
        return None

    def api_exec(self):
        sess = get_session(self.cookie_token()) or self.dev_session()
        if not sess:
            return self.send_json({"error": "未登录"}, 401)
        if not hmac.compare_digest(self.headers.get("X-Debnas-CSRF", ""), sess["csrf"]):
            return self.send_json({"error": "CSRF 校验失败"}, 403)
        data = self.read_json()
        argv = data.get("argv")
        if not isinstance(argv, list) or not argv or not all(isinstance(a, str) for a in argv):
            return self.send_json({"error": "参数错误"}, 400)
        user = sess["user"]
        if data.get("root"):
            if not sess.get("sudoer"):
                return self.send_json({"error": "当前账号没有 sudo 权限"}, 403)
            cmd = argv
        else:
            cmd = ["sudo", "-n", "-u", user, "--"] + argv
        try:
            home = pwd.getpwnam(user).pw_dir
        except KeyError:
            home = "/home/" + user
        home = home if os.path.isdir(home) else "/"
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, errors="replace",
                               timeout=120, cwd=home)
            return self.send_json({"ok": p.returncode == 0, "out": p.stdout,
                                   "err": p.stderr, "code": p.returncode})
        except subprocess.TimeoutExpired:
            return self.send_json({"error": "命令超时"}, 504)
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": str(e)}, 500)

    def api_rpc(self):
        sess = get_session(self.cookie_token()) or self.dev_session()
        if not sess:
            return self.send_json({"error": "未登录"}, 401)
        if not hmac.compare_digest(self.headers.get("X-Debnas-CSRF", ""), sess["csrf"]):
            return self.send_json({"error": "CSRF 校验失败"}, 403)

        data = self.read_json()
        method = str(data.get("method", ""))
        if method in ("reboot", "portal_redeploy") and not sess.get("sudoer"):
            return self.send_json({"error": "当前账号没有 sudo 权限"}, 403)
        fn = RPC.get(method)
        if not fn:
            return self.send_json({"error": "未知方法：%s" % method}, 400)
        try:
            return self.send_json({"ok": True, "data": fn(data.get("params") or {})})
        except ValueError as e:
            return self.send_json({"error": str(e)}, 400)
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": "执行失败：%s" % e}, 500)

    def api_vnc(self):
        """把浏览器的 WebSocket 接到指定虚拟机的 VNC TCP 端口。"""
        if "upgrade" not in (self.headers.get("Connection") or "").lower():
            return self.send_json({"error": "需要 WebSocket 升级"}, 400)
        sess = get_session(self.cookie_token()) or self.dev_session()
        if not sess:
            return self.send_json({"error": "未登录"}, 401)
        origin = self.headers.get("Origin") or ""
        if origin:
            try:
                onet = urlparse(origin).netloc
            except Exception:
                onet = ""
            if onet != (self.headers.get("Host") or ""):
                return self.send_json({"error": "来源不合法"}, 403)
        key = self.headers.get("Sec-WebSocket-Key") or ""
        if not key:
            return self.send_json({"error": "缺少 WebSocket 握手字段"}, 400)
        qs = parse_qs(urlparse(self.path).query)
        name = (qs.get("name") or [""])[0]
        try:
            host, port = vm_vnc_target(name)
        except ValueError as e:
            return self.send_json({"error": str(e)}, 400)
        accept = base64.b64encode(
            hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
        protos = [p.strip().lower() for p in
                  (self.headers.get("Sec-WebSocket-Protocol") or "").split(",") if p.strip()]
        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        if "binary" in protos:
            self.send_header("Sec-WebSocket-Protocol", "binary")
        self.end_headers()
        try:
            self.wfile.flush()
        except OSError:
            return
        self.close_connection = True
        ws_vnc_bridge(self.connection, self.rfile, host, port)

    def api_download(self):
        """原样流式下载：不经过 base64/内存，浏览器自己显示进度。"""
        sess = get_session(self.cookie_token()) or self.dev_session()
        if not sess:
            return self.send_json({"error": "未登录"}, 401)
        qs = parse_qs(urlparse(self.path).query)
        try:
            path = safe_path((qs.get("path") or [""])[0])
        except ValueError:
            return self.send_json({"error": "非法路径"}, 400)
        if not os.path.isfile(path):
            return self.send_json({"error": "不是普通文件"}, 404)
        try:
            size = os.path.getsize(path)
            fh = open(path, "rb")
        except OSError as e:
            return self.send_json({"error": "读取失败：%s" % e}, 500)
        name = os.path.basename(path) or "download"
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(size))
            self.send_header("Content-Disposition",
                             "attachment; filename*=UTF-8''" + quote(name, safe=""))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with fh:
                shutil.copyfileobj(fh, self.wfile, 64 * 1024)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def api_term(self):
        """交互式终端：WebSocket 接到一个 PTY 里的登录 shell。"""
        if "upgrade" not in (self.headers.get("Connection") or "").lower():
            return self.send_json({"error": "需要 WebSocket 升级"}, 400)
        sess = get_session(self.cookie_token()) or self.dev_session()
        if not sess:
            return self.send_json({"error": "未登录"}, 401)
        origin = self.headers.get("Origin") or ""
        if origin:
            try:
                onet = urlparse(origin).netloc
            except Exception:
                onet = ""
            if onet != (self.headers.get("Host") or ""):
                return self.send_json({"error": "来源不合法"}, 403)
        key = self.headers.get("Sec-WebSocket-Key") or ""
        if not key:
            return self.send_json({"error": "缺少 WebSocket 握手字段"}, 400)

        qs = parse_qs(urlparse(self.path).query)
        try:
            cols = int((qs.get("cols") or ["100"])[0])
        except (TypeError, ValueError):
            cols = 100
        try:
            rows = int((qs.get("rows") or ["26"])[0])
        except (TypeError, ValueError):
            rows = 26
        cols = max(20, min(400, cols))
        rows = max(5, min(200, rows))

        user = sess["user"]
        try:
            home = pwd.getpwnam(user).pw_dir
        except KeyError:
            home = "/home/" + user

        accept = base64.b64encode(
            hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        self.end_headers()
        try:
            self.wfile.flush()
        except OSError:
            return
        self.close_connection = True
        ws_term_bridge(self.connection, self.rfile, user, home, cols, rows)

    def api_qqmedia(self):
        """代理聊天里的图片和系统表情：都是本机缓存，不碰 QQ 的 CDN。"""
        sess = get_session(self.cookie_token()) or self.dev_session()
        if not sess:
            return self.send_json({"error": "未登录"}, 401)
        qs = parse_qs(urlparse(self.path).query)
        kind = (qs.get("kind") or ["image"])[0]
        try:
            if kind == "face":
                data, ctype = _qq_face((qs.get("id") or [""])[0])
            else:
                data, ctype = _qq_image((qs.get("file") or [""])[0])
        except Exception:
            return self.send_json({"error": "媒体不可用"}, 404)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "private, max-age=604800")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(data)
        except OSError:
            pass

    def serve_static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        rel = os.path.normpath(path).lstrip("/")
        root = os.path.abspath(STATIC_DIR)
        full = os.path.abspath(os.path.join(root, rel))
        # 必须是 root 本身或其子路径；只比字符串前缀会把 /…/static-evil 也放进来
        if full != root and not full.startswith(root + os.sep):
            return self.send_json({"error": "forbidden"}, 403)
        if not os.path.isfile(full):
            return self.send_json({"error": "not found"}, 404)

        ext = os.path.splitext(full)[1].lower()
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".mjs": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
            ".ttf": "font/ttf",
            ".png": "image/png",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
        }.get(ext, "application/octet-stream")

        # 字体/图片体积大且基本不随部署变化：让浏览器缓存 7 天；CSS/JS 每次用 ETag 校验，
        # 命中就 304，不再整套重下（以前是 no-cache 且没有校验器，只能全量重传）。
        cache = "no-store" if ext == ".html" else (
            "public, max-age=604800" if ext in (
                ".woff", ".woff2", ".ttf", ".png", ".svg", ".ico") else "no-cache")
        st = os.stat(full)
        # HTML 的正文里嵌了 CSS/JS 的文件指纹，指纹变了正文就该变；所以 HTML 不参与
        # 304，否则 app.js 换了、index.html 没换，浏览器会拿着旧 HTML 里的旧 URL。
        etag = "" if ext == ".html" else '"%x-%x"' % (int(st.st_mtime), st.st_size)
        inm = self.headers.get("If-None-Match") or ""
        if etag and etag in [t.strip() for t in inm.split(",")]:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", cache)
            self.end_headers()
            return

        with open(full, "rb") as f:
            body = f.read()
        if ext == ".html":
            # HTML 是 no-store，每次都会重新取；在它里面给 CSS/JS 打上文件指纹，
            # 部署一改 URL 就变，浏览器不可能再拿旧脚本跑出旧界面。
            # VERSION 是本地文件，但按 JSON 字符串转义后再进 HTML：内容里要是出现
            # 引号 / 换行 / `</script>` 也不会把这段脚本提前截断
            build = json.dumps(str(app_version())).replace("<", "\\u003c")
            body = body.replace(
                b"<head>",
                ("<head><script>window.__DEBNAS_BUILD=%s;</script>" % build).encode(),
                1)
            for asset in ("app.js", "styles.css", "theme.js", "fonts.css"):
                try:
                    ver = int(os.path.getmtime(os.path.join(STATIC_DIR, asset)))
                except OSError:
                    continue
                body = body.replace(("./" + asset).encode(), ("./%s?v=%d" % (asset, ver)).encode())
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", email.utils.formatdate(st.st_mtime, usegmt=True))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer((BIND, PORT), Handler)
    print("debnas-web listening on %s:%d (static=%s)" % (BIND, PORT, STATIC_DIR), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
