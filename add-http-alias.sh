#!/usr/bin/env bash
# 给当前局域网接口加一个备用 IPv4 地址，专供手机 HTTP 访问。
# 用途：某台手机把 192.168.100.142 的 HTTP 缓存成 HSTS/HTTPS-only，
# 换一个新 IP 就是新的 origin，不会再被升级。
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "请用 sudo 运行" >&2; exit 1; }

CON=$(nmcli -t -f NAME,DEVICE,TYPE con show --active 2>/dev/null \
  | awk -F: '$2 != "lo" && $3 ~ /wireless|ethernet/ {print $1; exit}')
[[ -n "$CON" ]] || { echo "找不到活动的 NetworkManager 连接" >&2; exit 1; }
DEV=$(nmcli -t -f DEVICE con show "$CON" | head -1)
CIDR=$(ip -4 -o addr show dev "$DEV" scope global | awk '{print $4; exit}')
[[ -n "$CIDR" ]] || { echo "接口 $DEV 没有 IPv4 地址" >&2; exit 1; }

PREFIX=${CIDR#*/}
BASE=${CIDR%.*.*}
ALIAS=${1:-$BASE.250}

if ip -4 addr show dev "$DEV" | grep -q "inet $ALIAS/"; then
  echo "别名已存在：http://$ALIAS/"
  exit 0
fi

if ping -c 1 -W 1 "$ALIAS" >/dev/null 2>&1; then
  echo "$ALIAS 已经被占用，换一个地址：sudo $0 192.168.100.251" >&2
  exit 1
fi

ip addr add "$ALIAS/$PREFIX" dev "$DEV"
echo "已临时添加 $ALIAS/$PREFIX 到 $DEV"

# 写进 NetworkManager，重启后仍然保留；不主动重连 Wi-Fi，避免 SSH 断线
ADDRS=$(nmcli -g ipv4.addresses con show "$CON" 2>/dev/null || true)
if [[ ",$ADDRS," != *",$ALIAS/$PREFIX,"* ]]; then
  if nmcli con mod "$CON" +ipv4.addresses "$ALIAS/$PREFIX" >/dev/null 2>&1; then
    echo "已写入连接配置 $CON（重启后保留）"
  else
    echo "警告：写入 NetworkManager 失败，当前地址重启后会消失" >&2
  fi
fi

echo
echo "手机打开：http://$ALIAS/"
echo "这个地址只用于局域网 HTTP，不要映射到公网。"
