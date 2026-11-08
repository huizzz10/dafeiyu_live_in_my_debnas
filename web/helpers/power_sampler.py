#!/usr/bin/env python3
"""功耗采样：读 Intel RAPL 能量计数器，算成功率写到 /run，供 WebUI 免权限读取。

energy_uj 是累加计数器，会回绕，需按 max_energy_range_uj 处理。
"""
import json
import os
import subprocess
import time

OUT_DIR = "/run/debnas-portal"
OUT = os.path.join(OUT_DIR, "power.json")
INTERVAL = 2.0

# 名字 -> sysfs 目录
DOMAINS = {
    "platform": "/sys/class/powercap/intel-rapl:1",   # psys：整平台
    "package": "/sys/class/powercap/intel-rapl:0",    # CPU package
    "uncore": "/sys/class/powercap/intel-rapl:0:1",
    "core": "/sys/class/powercap/intel-rapl:0:0",
}


def read_int(path):
    try:
        with open(path, encoding="ascii") as fh:
            return int(fh.read().strip())
    except (OSError, ValueError):
        return None


def read_text(path):
    try:
        with open(path, encoding="ascii") as fh:
            return fh.read().strip()
    except OSError:
        return None


def gpu_busy():
    """用 intel_gpu_top 采一次 RC6 空闲率，反推 GPU 负载。

    该工具在非 TTY 下不会自己退出，所以读够数据后主动 kill。
    """
    proc = None
    try:
        proc = subprocess.Popen(
            ["intel_gpu_top", "-J", "-s", "250", "-c", "1"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        )
        try:
            out, _ = proc.communicate(timeout=1.2)
        except subprocess.TimeoutExpired:
            proc.kill()
            out, _ = proc.communicate()
        rows = [l for l in (out or "").splitlines() if l and not l.startswith("Freq")]
        if not rows:
            return None
        f = rows[-1].split(",")
        rc6 = float(f[3])
        return round(max(0.0, min(100.0, 100.0 - rc6)), 1)
    except Exception:  # noqa: BLE001
        if proc is not None and proc.poll() is None:
            proc.kill()
        return None


def battery():
    base = "/sys/class/power_supply/BAT0"
    if not os.path.isdir(base):
        return None
    power = read_int(os.path.join(base, "power_now"))
    return {
        "watts": round(power / 1e6, 2) if power else None,
        "status": read_text(os.path.join(base, "status")),
        "percent": read_int(os.path.join(base, "capacity")),
    }


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    prev = {}
    for name, path in DOMAINS.items():
        if not os.path.isdir(path):
            continue
        prev[name] = (
            read_int(os.path.join(path, "energy_uj")),
            read_int(os.path.join(path, "max_energy_range_uj")),
        )
    prev_t = time.time()

    while True:
        time.sleep(INTERVAL)
        now = time.time()
        dt = now - prev_t
        watts = {}
        cur_prev = {}
        for name, path in DOMAINS.items():
            if name not in prev:
                continue
            energy = read_int(os.path.join(path, "energy_uj"))
            if energy is None:
                continue
            old, max_range = prev[name]
            if old is not None and dt > 0:
                delta = energy - old
                if delta < 0 and max_range:
                    delta += max_range
                watts[name] = round(delta / 1e6 / dt, 2)
            cur_prev[name] = (energy, max_range)
        if cur_prev:
            prev = cur_prev
        prev_t = now

        payload = {
            "ts": round(now, 1),
            "watts": watts,
            "battery": battery(),
            "gpu": gpu_busy(),
        }
        tmp = OUT + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            os.replace(tmp, OUT)
            os.chmod(OUT, 0o644)
        except OSError:
            pass


if __name__ == "__main__":
    main()
