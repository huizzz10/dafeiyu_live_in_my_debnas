#!/usr/bin/env python3
"""NAS 控制台的 Samba 共享后端。

用法：
  samba.py save '{"name":"share","path":"/srv/share",...,"create":true}'
  samba.py delete <name>

行为：备份 smb.conf → 修改 → testparm 校验 → 失败回滚 → reload smbd。
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time

CONF = "/etc/samba/smb.conf"
NAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
PROTECTED = {"global", "printers", "print$"}


def die(msg, code=1):
    print(json.dumps({"ok": False, "error": msg}, ensure_ascii=False))
    sys.exit(code)


def read_conf():
    with open(CONF, encoding="utf-8") as fh:
        return fh.read()


def parse(text):
    """拆成 (前言行, [{'name','lines'}])，保留原始排版。"""
    preamble, blocks = [], []
    cur = None
    for line in text.splitlines():
        m = re.match(r"^\[(.+?)\]\s*$", line.strip())
        if m:
            cur = {"name": m.group(1).strip(), "lines": []}
            blocks.append(cur)
        elif cur is None:
            preamble.append(line)
        else:
            cur["lines"].append(line)
    return preamble, blocks


def render(preamble, blocks):
    """原样重建；只有被修改的段内容会变，其余字节保持不变。"""
    out = list(preamble)
    for b in blocks:
        out.append("[%s]" % b["name"])
        out.extend(b["lines"])
    text = "\n".join(out)
    return text if text.endswith("\n") else text + "\n"


def section_lines(data):
    lines = ["   comment = %s" % (data.get("comment") or "Shared Folder"),
             "   path = %s" % data["path"],
             "   browseable = %s" % ("yes" if data.get("browseable") else "no"),
             "   read only = %s" % ("yes" if data.get("readOnly") else "no")]
    if data.get("guestOk"):
        lines.append("   guest ok = yes")
    if data.get("macos"):
        lines += ["   vfs objects = fruit streams_xattr",
                  "   fruit:metadata = stream",
                  "   fruit:model = MacSamba",
                  "   fruit:posix_rename = yes",
                  "   fruit:veto_appledouble = no",
                  "   fruit:nfs_aces = no",
                  "   fruit:wipe_intentionally_left_blank_rfork = yes",
                  "   fruit:delete_empty_adfiles = yes"]
    lines += ["   create mask = 0664",
              "   directory mask = 0775"]
    return lines


def backup():
    stamp = time.strftime("%Y%m%d-%H%M%S")
    path = "%s.bak.%s-%d" % (CONF, stamp, os.getpid())
    shutil.copy2(CONF, path)
    return path


def validate():
    proc = subprocess.run(["testparm", "-s", CONF], capture_output=True, text=True)
    if proc.returncode != 0 or "Error" in proc.stderr:
        raise RuntimeError((proc.stderr or proc.stdout).strip()[:500])


def reload_samba():
    for cmd in (["systemctl", "reload", "smbd"], ["systemctl", "restart", "smbd"]):
        if subprocess.run(cmd, capture_output=True).returncode == 0:
            return


def do_save(data):
    name = (data.get("name") or "").strip()
    path = (data.get("path") or "").strip()
    if not NAME_RE.match(name):
        die("共享名只能包含字母、数字、点、下划线和短横线")
    if name.lower() in PROTECTED:
        die("该名称是保留节，不能覆盖")
    if not path.startswith("/"):
        die("路径必须是绝对路径")
    if not os.path.isdir(path):
        die("目录不存在：%s" % path)

    preamble, blocks = parse(read_conf())
    existing = next((b for b in blocks if b["name"] == name), None)
    if data.get("create") and existing:
        die("共享已存在：%s" % name)
    if not data.get("create") and not existing:
        die("共享不存在：%s" % name)

    new_lines = section_lines(data)
    if existing:
        existing["lines"] = new_lines
    else:
        blocks.append({"name": name, "lines": [""] + new_lines + [""]})

    bak = backup()
    try:
        with open(CONF, "w", encoding="utf-8") as fh:
            fh.write(render(preamble, blocks))
        validate()
    except Exception as exc:  # noqa: BLE001
        shutil.copy2(bak, CONF)
        die("配置校验失败，已回滚：%s" % exc)

    reload_samba()
    print(json.dumps({"ok": True, "name": name, "backup": bak}, ensure_ascii=False))


def do_delete(name):
    if not NAME_RE.match(name or ""):
        die("非法共享名")
    preamble, blocks = parse(read_conf())
    kept = [b for b in blocks if b["name"] != name]
    if len(kept) == len(blocks):
        die("共享不存在：%s" % name)

    bak = backup()
    try:
        with open(CONF, "w", encoding="utf-8") as fh:
            fh.write(render(preamble, kept))
        validate()
    except Exception as exc:  # noqa: BLE001
        shutil.copy2(bak, CONF)
        die("配置校验失败，已回滚：%s" % exc)

    reload_samba()
    print(json.dumps({"ok": True, "name": name, "backup": bak}, ensure_ascii=False))


GLOBAL_KEYS = {"workgroup": "workgroup", "server string": "server string", "log level": "log level"}


def get_global():
    _, blocks = parse(read_conf())
    g = next((b for b in blocks if b["name"].lower() == "global"), None)
    out = {}
    if g:
        for line in g["lines"]:
            m = re.match(r"^\s*([^=]+?)\s*=\s*(.*)$", line)
            if not m:
                continue
            key = m.group(1).strip().lower()
            if key in GLOBAL_KEYS:
                out[key] = m.group(2).strip()
    print(json.dumps({"ok": True, "global": out}, ensure_ascii=False))


def set_global(data):
    preamble, blocks = parse(read_conf())
    g = next((b for b in blocks if b["name"].lower() == "global"), None)
    if g is None:
        die("找不到 [global] 段")
    for key, value in data.items():
        key = key.strip().lower()
        if key not in GLOBAL_KEYS:
            die("不支持的配置项：%s" % key)
        pattern = re.compile(r"^\s*" + re.escape(key) + r"\s*=", re.I)
        replaced = False
        for i, line in enumerate(g["lines"]):
            if pattern.match(line):
                g["lines"][i] = "   %s = %s" % (key, value)
                replaced = True
                break
        if not replaced:
            g["lines"].insert(0, "   %s = %s" % (key, value))

    bak = backup()
    try:
        with open(CONF, "w", encoding="utf-8") as fh:
            fh.write(render(preamble, blocks))
        validate()
    except Exception as exc:  # noqa: BLE001
        shutil.copy2(bak, CONF)
        die("配置校验失败，已回滚：%s" % exc)
    reload_samba()
    print(json.dumps({"ok": True}, ensure_ascii=False))


def do_import(path):
    try:
        with open(path, encoding="utf-8") as fh:
            new_conf = fh.read()
    except OSError as exc:
        die("读取上传文件失败：%s" % exc)
    if "[global]" not in new_conf.lower():
        die("文件里没有 [global] 段，疑似不是 smb.conf")
    bak = backup()
    try:
        with open(CONF, "w", encoding="utf-8") as fh:
            fh.write(new_conf)
        validate()
    except Exception as exc:  # noqa: BLE001
        shutil.copy2(bak, CONF)
        die("配置校验失败，已回滚：%s" % exc)
    reload_samba()
    print(json.dumps({"ok": True, "backup": bak}, ensure_ascii=False))


def main():
    if len(sys.argv) < 2:
        die("缺少子命令")
    cmd = sys.argv[1]
    if cmd == "save":
        if len(sys.argv) < 3:
            die("缺少参数")
        do_save(json.loads(sys.argv[2]))
    elif cmd == "global-get":
        get_global()
    elif cmd == "global-set":
        if len(sys.argv) < 3:
            die("缺少参数")
        set_global(json.loads(sys.argv[2]))
    elif cmd == "import":
        if len(sys.argv) < 3:
            die("缺少文件路径")
        do_import(sys.argv[2])
    elif cmd == "delete":
        if len(sys.argv) < 3:
            die("缺少共享名")
        do_delete(sys.argv[2])
    else:
        die("未知子命令：%s" % cmd)


if __name__ == "__main__":
    main()
