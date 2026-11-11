#!/usr/bin/env bash
# Navidrome 安装 / 更新：官方原生二进制 + systemd 用户服务（不依赖 Docker）
#
#   ./install-navidrome.sh                  # 安装 / 更新到最新版
#   ./install-navidrome.sh --check          # 只检测，不下载
#   ./install-navidrome.sh --version v0.64.2
#   ./install-navidrome.sh --force          # 已安装也重新下载
#   ./install-navidrome.sh --port 4533      # 指定端口（首次写配置时用）
#   ./install-navidrome.sh --music ~/music  # 指定音乐目录（首次写配置时用）
#   ./install-navidrome.sh --no-restart
#
# 说明：
#   - 以当前用户身份安装，服务是 systemd 用户单元；linger 开着才会开机自启
#   - 二进制：~/.local/opt/navidrome/navidrome
#   - 配置：  ~/navidrome/navidrome.toml（已存在时不覆盖）
#   - 数据：  ~/navidrome/data
#   - 国内直连 github.com 常超时，默认走 gh-proxy 镜像，可用 DEBNAS_GH_PROXY 覆盖
#     （设为空字符串则强制直连）
set -euo pipefail

REPO=navidrome/navidrome
TAG=""
FORCE=0
CHECK=0
RESTART=1
PORT="${DEBNAS_NAVIDROME_PORT:-4533}"
MUSIC="${DEBNAS_NAVIDROME_MUSIC:-$HOME/music}"
PROXY="${DEBNAS_GH_PROXY-https://gh-proxy.com}"

ND_HOME="${DEBNAS_NAVIDROME_HOME:-$HOME/navidrome}"
BIN_DIR="$HOME/.local/opt/navidrome"
BIN="$BIN_DIR/navidrome"
DATA="$ND_HOME/data"
CONF="$ND_HOME/navidrome.toml"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/navidrome.service"
SERVICE=navidrome.service

need() { command -v "$1" >/dev/null 2>&1 || { echo "缺少命令：$1" >&2; exit 1; }; }
need curl
need tar
need python3

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check|--dry-run) CHECK=1 ;;
    --force) FORCE=1 ;;
    --no-restart) RESTART=0 ;;
    --help|-h)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    --version=*) TAG="${1#*=}" ;;
    --version)
      [[ -n "${2:-}" ]] || { echo "--version 需要 vX.Y.Z" >&2; exit 1; }
      TAG="$2"; shift
      ;;
    --port=*) PORT="${1#*=}" ;;
    --port)
      [[ -n "${2:-}" ]] || { echo "--port 需要端口号" >&2; exit 1; }
      PORT="$2"; shift
      ;;
    --music=*) MUSIC="${1#*=}" ;;
    --music)
      [[ -n "${2:-}" ]] || { echo "--music 需要目录" >&2; exit 1; }
      MUSIC="$2"; shift
      ;;
    *)
      echo "未知参数：$1" >&2
      exit 1
      ;;
  esac
  shift
done

[[ "$(uname -m)" == "x86_64" ]] || { echo "只支持 x86_64，当前架构：$(uname -m)" >&2; exit 1; }
[[ $EUID -ne 0 ]] || { echo "请用 NAS 账号运行（不要 sudo）：服务是 systemd 用户单元" >&2; exit 1; }
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "端口必须是数字：$PORT" >&2; exit 1; }

fetch() {  # fetch <url> <输出文件>
  local url="$1" out="$2"
  if [[ -n "$PROXY" ]]; then
    if curl -fsSL --connect-timeout 15 -m 600 -o "$out" "$PROXY/$url"; then
      return 0
    fi
    echo "    镜像下载失败，尝试直连…" >&2
  fi
  curl -fsSL --connect-timeout 15 -m 600 -o "$out" "$url"
}

release_json() {
  if [[ -n "$TAG" ]]; then
    fetch "https://api.github.com/repos/$REPO/releases/tags/$TAG" /dev/stdout 2>/dev/null || true
  else
    fetch "https://api.github.com/repos/$REPO/releases/latest" /dev/stdout
  fi
}

installed_version() {
  [[ -x "$BIN" ]] || { echo ""; return; }
  "$BIN" --version 2>/dev/null | head -n1 | awk '{print $1}' || echo ""
}

service_state() {
  systemctl --user is-active "$SERVICE" 2>/dev/null || true
}

if [[ $CHECK -eq 1 ]]; then
  ver=$(installed_version)
  echo "架构     $(uname -m)"
  echo "二进制   $BIN"
  echo "已安装   ${ver:-未安装}"
  echo "配置     $CONF"
  echo "数据     $DATA"
  echo "音乐库   $MUSIC"
  echo "端口     $PORT"
  echo "服务     $(service_state)"
  echo "linger   $(loginctl show-user "${USER:-$(id -un)}" -p Linger --value 2>/dev/null || echo unknown)"
  if [[ -z "$ver" ]]; then
    echo "提示     未安装，运行 ./install-navidrome.sh 安装"
  fi
  exit 0
fi

echo "==> 解析版本"
json=$(release_json)
read -r latest asset_url asset_size < <(printf '%s' "$json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("", "", ""); raise SystemExit
tag = d.get("tag_name") or ""
url = ""
size = ""
for a in d.get("assets") or []:
    if a.get("name", "").endswith("_linux_amd64.tar.gz"):
        url = a.get("browser_download_url") or ""
        size = a.get("size") or ""
        break
print(tag, url, size)
')
[[ -n "$asset_url" ]] || { echo "没有拿到下载地址（API 不通或版本不存在）。可加 --version vX.Y.Z 或设置 DEBNAS_GH_PROXY" >&2; exit 1; }
echo "    版本 $latest"

latest_num="${latest#v}"
current=$(installed_version)
if [[ -n "$current" && "$current" == "$latest_num" && $FORCE -eq 0 ]]; then
  echo "    已是 $current，跳过下载（--force 可强制重装）"
else
  echo "==> 下载 $latest"
  tmp=$(mktemp /tmp/navidrome.XXXXXX.tar.gz)
  trap 'rm -f "$tmp"' EXIT
  fetch "$asset_url" "$tmp"
  if [[ -n "$asset_size" && "$(stat -c %s "$tmp")" != "$asset_size" ]]; then
    echo "    下载大小与官方不一致，放弃安装" >&2
    exit 1
  fi

  echo "==> 安装二进制"
  install -d -m 0755 "$BIN_DIR" "$DATA"
  if [[ -f "$BIN" ]]; then
    cp -a "$BIN" "$BIN.previous"
  fi
  tar -xzf "$tmp" -C "$BIN_DIR" navidrome
  chmod 0755 "$BIN"
  echo "    $("$BIN" --version | head -n1)"
fi

echo "==> 配置"
install -d -m 0755 "$DATA" "$(dirname "$MUSIC")"
if [[ ! -f "$CONF" ]]; then
  mkdir -p "$(dirname "$CONF")"
  cat > "$CONF" <<EOF
# Navidrome 配置（install-navidrome.sh 生成）
MusicFolder = "$MUSIC"
DataFolder = "$DATA"
Address = "0.0.0.0"
Port = $PORT
LogLevel = "info"
Scanner.Schedule = "@every 1m"
Scanner.ScanOnStartup = true
FFmpegPath = "/usr/bin/ffmpeg"
EOF
  echo "    已写入 $CONF"
else
  echo "    已存在 $CONF，保持不变"
fi

echo "==> systemd 用户单元"
mkdir -p "$UNIT_DIR"
if [[ ! -f "$UNIT" ]]; then
  cat > "$UNIT" <<EOF
[Unit]
Description=Navidrome Music Server
Documentation=https://www.navidrome.org/docs/
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ND_HOME
ExecStart=$BIN --configfile $CONF
Restart=on-failure
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=default.target
EOF
  echo "    已写入 $UNIT"
else
  echo "    已存在 $UNIT，保持不变"
fi

systemctl --user daemon-reload
systemctl --user enable "$SERVICE" >/dev/null 2>&1 || true
if ! loginctl show-user "${USER:-$(id -un)}" -p Linger --value 2>/dev/null | grep -q yes; then
  loginctl enable-linger "${USER:-$(id -un)}" >/dev/null 2>&1 || \
    echo "    提示：开 linger 失败，运行 sudo loginctl enable-linger ${USER:-$(id -un)} 才能开机自启" >&2
fi

if [[ $RESTART -eq 1 ]]; then
  systemctl --user restart "$SERVICE"
  sleep 1
  echo "==> 服务 $(service_state)"
else
  echo "==> 已跳过重启（--no-restart）"
fi

ip=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "Navidrome $latest 就绪：http://${ip:-127.0.0.1}:$PORT"
echo "首次打开会要求创建管理员账号；音乐放进 $MUSIC 后自动扫描。"
