#!/usr/bin/env bash
# 读取运行中容器的 noVNC 口令（VNC 用固定 DES 密钥加密，可离线还原）
#   vncpass.sh <用户名> [容器名]
set -euo pipefail

USER_NAME="${1:-}"
CONTAINER="${2:-}"

if [[ -z "$USER_NAME" ]]; then
  echo '{"error":"missing user"}' >&2
  exit 2
fi
if [[ -z "$CONTAINER" ]]; then
  echo '{"error":"missing container"}' >&2
  exit 2
fi

UID_N=$(id -u "$USER_NAME")
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

B64=$(sudo -u "$USER_NAME" env XDG_RUNTIME_DIR="/run/user/$UID_N" \
  podman exec "$CONTAINER" base64 /root/.vnc/passwd 2>/dev/null | tr -d '\n' || true)

if [[ -z "$B64" ]]; then
  echo '{"error":"no passwd file"}'
  exit 0
fi

printf '%s' "$B64" | base64 -d > "$TMP"

# vncpasswd 用固定密钥 + 字节位序翻转；先解 DES，再判断是否需要翻位
PLAIN=$(openssl enc -d -des-ecb -nopad -K e84ad660c4721ae0 \
  -provider legacy -provider default -in "$TMP" 2>/dev/null | tr -d '\000' || true)

if [[ -z "$PLAIN" ]]; then
  echo '{"error":"decrypt failed"}'
  exit 0
fi

printf '{"password":"%s"}\n' "$PLAIN"
