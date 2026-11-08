#!/usr/bin/env bash
# mihomo 安装 / 修复：按本机架构和 x86-64 指令集选择对应的官方二进制
#
#   sudo ./install-mihomo.sh                 # 安装 / 更新到最新版
#   sudo ./install-mihomo.sh --check         # 只检测，不下载（不需要 root）
#   sudo ./install-mihomo.sh --version v1.19.33
#   sudo ./install-mihomo.sh --force         # 已安装也重新下载
#   sudo ./install-mihomo.sh --target amd64-v2   # 手动指定资产名
#
# 说明：
#   - 只安装 /usr/local/bin/mihomo，不生成配置文件；配置仍用 /etc/mihomo/config.yaml
#   - 默认重启 mihomo.service；--no-restart 可跳过
#   - x86_64 会按 /proc/cpuinfo 的 flags 选择 amd64 / amd64-v2 / amd64-v3 /
#     amd64-compatible，避免在只支持 SSE4.2 的机器上跑 AVX2 版本
set -euo pipefail

BIN=/usr/local/bin/mihomo
SERVICE=mihomo.service
REPO=MetaCubeX/mihomo
TAG=""
TARGET=""
CHECK=0
FORCE=0
RESTART=1

need() { command -v "$1" >/dev/null 2>&1 || { echo "缺少命令：$1" >&2; exit 1; }; }
need curl
need gzip
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
    --target=*) TARGET="${1#*=}" ;;
    --target)
      [[ -n "${2:-}" ]] || { echo "--target 需要资产名" >&2; exit 1; }
      TARGET="$2"; shift
      ;;
    *)
      echo "未知参数：$1" >&2
      exit 1
      ;;
  esac
  shift
done

flags=" "
if [[ -r /proc/cpuinfo ]]; then
  line=$(grep -m1 '^flags' /proc/cpuinfo || true)
  [[ -n "$line" ]] && flags=" ${line#*:} "
  flags=$(printf '%s' "$flags" | tr '\n' ' ')
fi

has_flag() { [[ "$flags" == *" $1 "* ]]; }

host_machine=$(uname -m)
host_level=""
target=""
target_reason=""

case "$host_machine" in
  x86_64|amd64)
    host_machine=x86_64
    if has_flag avx && has_flag avx2 && has_flag bmi1 && has_flag bmi2 && \
       has_flag fma && has_flag movbe && has_flag osxsave; then
      target=amd64-v3; host_level="x86-64-v3"
      target_reason="CPU 支持 AVX2 / BMI2 / FMA"
    elif has_flag sse4_2 && has_flag popcnt && has_flag cx16 && has_flag lahf_lm; then
      target=amd64-v2; host_level="x86-64-v2"
      target_reason="CPU 支持 SSE4.2 / POPCNT / CMPXCHG16B"
    elif has_flag sse4_2; then
      target=amd64; host_level="x86-64-v1"
      target_reason="CPU 支持 SSE4.2，但没有完整的 v2 指令集"
    else
      target=amd64-compatible; host_level="x86-64-compatible"
      target_reason="CPU 不支持 SSE4.2，使用兼容版"
    fi
    ;;
  *)
    echo "my-debnas 只支持 x86_64；当前架构：$host_machine" >&2
    exit 1
    ;;
esac

if [[ -n "$TARGET" ]]; then
  [[ "$TARGET" == amd64* ]] || {
    echo "只支持 x86_64 的 amd64 资产，不能指定 $TARGET" >&2; exit 1
  }
  target="$TARGET"
fi

elf_arch() {
  local f=$1 raw
  [[ -f "$f" ]] || { echo ""; return; }
  raw=$(od -An -tx1 -j0 -N4 "$f" 2>/dev/null | tr -d ' \n')
  [[ "$raw" == "7f454c46" ]] || { echo "not-elf"; return; }
  raw=$(od -An -tx1 -j18 -N2 "$f" 2>/dev/null | tr -d ' \n')
  case "$raw" in
    3e00) echo amd64 ;;
    b700) echo arm64 ;;
    2800) echo arm ;;
    0300) echo 386 ;;
    f300) echo riscv64 ;;
    0201) echo loong64 ;;
    1500) echo ppc64 ;;
    1600) echo s390x ;;
    0800|0008) echo mips ;;
    1500|0015) echo ppc64 ;;
    1600|0016) echo s390x ;;
    *) echo "elf-$raw" ;;
  esac
}

binary_arch=$(elf_arch "$BIN")
binary_version=""
binary_runs="no"
if [[ -x "$BIN" ]]; then
  if out=$("$BIN" -v 2>/dev/null | head -1); then
    binary_version="$out"
    binary_runs="yes"
  fi
fi

if [[ -z "$TAG" ]]; then
  TAG=$(curl -fsSL --max-time 20 "https://api.github.com/repos/$REPO/releases/latest" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])' 2>/dev/null || true)
fi
if [[ -z "$TAG" ]]; then
  if [[ $CHECK -eq 1 ]]; then
    echo "无法获取 mihomo 最新版本（网络不通？）；资产名请用 --version=vX.Y.Z 获取" >&2
    TAG="vX.Y.Z"
  else
    echo "无法获取 mihomo 最新版本；请用 --version=vX.Y.Z 指定" >&2
    exit 1
  fi
fi
[[ "$TAG" == v* ]] || TAG="v$TAG"

asset="mihomo-linux-${target}-${TAG}.gz"
url="https://github.com/$REPO/releases/download/$TAG/$asset"

host_family=amd64
bin_family=$binary_arch
case "$bin_family" in
  amd64*) bin_family=amd64 ;;
esac
binary_ok="no"
if [[ -n "$binary_arch" && "$binary_arch" != "not-elf" && "$bin_family" == "$host_family" \
      && "$binary_runs" == "yes" ]]; then
  binary_ok="yes"
fi

cat <<EOF
主机架构   : $host_machine
指令集     : $host_level（$target_reason）
推荐资产   : $asset
下载地址   : $url
已装二进制 : ${binary_arch:-未安装}${binary_version:+（$binary_version）}
二进制匹配 : $binary_ok
配置文件   : $( [[ -f /etc/mihomo/config.yaml ]] && echo /etc/mihomo/config.yaml || echo "未找到 /etc/mihomo/config.yaml" )
EOF

if [[ $CHECK -eq 1 ]]; then
  exit 0
fi

[[ $EUID -eq 0 ]] || { echo "安装需要 root：sudo $0" >&2; exit 1; }

if [[ "$binary_ok" == "yes" && $FORCE -eq 0 ]]; then
  echo
  echo "已安装的 mihomo 与当前架构匹配；要强制重装请加 --force"
  exit 0
fi

tmp=$(mktemp -d /tmp/mihomo-install.XXXXXX)
trap 'rm -rf "$tmp"' EXIT
echo
echo "==> 下载 $asset"
curl -fL --retry 2 --connect-timeout 15 -o "$tmp/mihomo.gz" "$url"

echo "==> 解压并安装"
gzip -dc "$tmp/mihomo.gz" > "$tmp/mihomo"
chmod 0755 "$tmp/mihomo"
"$tmp/mihomo" -v >/dev/null 2>&1 || { echo "下载的二进制无法在本机运行（架构/指令集不匹配）" >&2; exit 1; }

if [[ -f "$BIN" ]]; then
  backup="$BIN.bak.$(date +%Y%m%d%H%M%S)"
  cp -a "$BIN" "$backup"
  echo "    旧二进制备份：$backup"
fi
install -m 0755 "$tmp/mihomo" "$BIN"
"$BIN" -v | head -1

if [[ ! -f /etc/mihomo/config.yaml ]]; then
  echo "    警告：没有 /etc/mihomo/config.yaml，mihomo 启动后会报配置错误" >&2
fi

if [[ $RESTART -eq 1 ]] && systemctl cat "$SERVICE" >/dev/null 2>&1; then
  echo "==> 重启 $SERVICE"
  systemctl restart "$SERVICE" || true
  sleep 1
  systemctl is-active "$SERVICE" || true
fi

echo
echo "完成。检测命令：$0 --check"
