#!/usr/bin/env bash
# 部署自建后端 debnas-web（唯一入口）
#   sudo ./deploy-web.sh                  # 全量依赖 + 部署
#   sudo ./deploy-web.sh --with-caddy     # 同时用仓库里的 Caddyfile 配置 TLS 反代
#   sudo ./deploy-web.sh --skip-deps      # 跳过 apt，只更新文件
#   sudo ./deploy-web.sh --reinstall-deps # 连已安装的依赖也强制重装
#   sudo ./deploy-web.sh --with-mihomo    # 按本机架构/指令集安装或更新 mihomo
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
WEB=/usr/local/lib/debnas-web
STATIC=$WEB/static
LIB=/usr/local/lib/debnas-portal          # 后端助手脚本（服务端引用的固定路径）
STATE=/var/lib/debnas-web
UNIT=/etc/systemd/system/debnas-web.service
POWER_UNIT=/etc/systemd/system/debnas-power.service

WITH_CADDY=0
SKIP_DEPS=0
FORCE_DEPS=0
WITH_MIHOMO=0
for arg in "$@"; do
  case "$arg" in
    --with-caddy) WITH_CADDY=1 ;;
    --skip-deps) SKIP_DEPS=1 ;;
    --reinstall-deps) FORCE_DEPS=1 ;;
    --with-mihomo) WITH_MIHOMO=1 ;;
    *) echo "未知参数：$arg" >&2; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "请用 sudo 运行"; exit 1; }
[[ "$(uname -m)" == "x86_64" ]] || { echo "my-debnas 只支持 x86_64，当前架构：$(uname -m)" >&2; exit 1; }
[[ -d "$HERE/web/frontend" ]] || { echo "缺少 web/frontend/"; exit 1; }

if [[ $SKIP_DEPS -eq 0 ]]; then
  echo "==> 0/5 依赖"
  if [[ $FORCE_DEPS -eq 1 ]]; then
    bash "$HERE/install-deps.sh" --reinstall
  else
    bash "$HERE/install-deps.sh"
  fi
fi

if [[ $WITH_MIHOMO -eq 1 ]]; then
  echo "==> 0b/5 mihomo（架构 / 指令集检测）"
  if ! bash "$HERE/install-mihomo.sh"; then
    echo "    警告：mihomo 安装或检测失败，继续部署" >&2
  fi
fi

echo "==> 1/5 后端与静态资源"
install -d -m 0755 "$WEB" "$STATIC" "$STATIC/fonts" "$STATIC/icons" "$STATE" "$LIB"
install -m 0755 "$HERE/web/server.py" "$WEB/server.py"
install -m 0644 "$HERE/web/login.html" "$HERE/web/status.html" "$HERE/web/index.html" \
  "$HERE/web/api-web.js" "$HERE/web/cockpit-shim.js" \
  "$HERE/web/console.html" "$HERE/web/console.css" "$HERE/web/console.js" "$STATIC/"
install -m 0644 "$HERE/web/frontend/styles.css" "$HERE/web/frontend/app.js" \
  "$HERE/web/frontend/theme.js" "$HERE/web/frontend/fonts.css" "$STATIC/"
install -m 0644 "$HERE/web/frontend/fonts/"*.woff2 "$STATIC/fonts/"
install -m 0644 "$HERE/web/frontend/fonts/NOTICE.md" "$HERE/web/frontend/fonts/"*.txt "$STATIC/fonts/"
install -m 0644 "$HERE/web/frontend/icons/"*.png "$STATIC/icons/"
for svg in "$HERE/web/frontend/icons/"*.svg; do
  [[ -f "$svg" ]] && install -m 0644 "$svg" "$STATIC/icons/"
done
install -m 0644 "$HERE/LICENSE" "$HERE/NOTICE" "$STATIC/"

# 交互终端用的 xterm.js（仓库内置，打开终端时才加载）
if [[ -d "$HERE/web/frontend/xterm" ]]; then
  rm -rf "$STATIC/xterm"
  cp -a "$HERE/web/frontend/xterm" "$STATIC/xterm"
  chown -R root:root "$STATIC/xterm"
  find "$STATIC/xterm" -type d -exec chmod 0755 {} +
  find "$STATIC/xterm" -type f -exec chmod 0644 {} +
else
  echo "    警告：缺少 web/frontend/xterm，交互终端将不可用" >&2
fi

# 旧版本里带再分发限制的资源：从部署目录清掉
rm -f "$STATIC/fonts/harmonyos-sans-sc.woff2"
if [[ ! -f "$HERE/web/frontend/icons/snowluma.png" ]]; then
  # 公开仓库不含 SnowLuma logo；源里没有时清掉旧部署残留
  rm -f "$STATIC/icons/snowluma.png"
fi

# 网页控制台用的 noVNC（仓库内置，不依赖 apt）
if [[ -f "$HERE/web/frontend/novnc/core/rfb.js" ]]; then
  rm -rf "$STATIC/novnc"
  cp -a "$HERE/web/frontend/novnc" "$STATIC/novnc"
  chown -R root:root "$STATIC/novnc"
  find "$STATIC/novnc" -type d -exec chmod 0755 {} +
  find "$STATIC/novnc" -type f -exec chmod 0644 {} +
else
  echo "    警告：缺少 web/frontend/novnc，网页控制台将不可用" >&2
fi

# 生成自解压的一键部署脚本，发布到 /deploy.sh
echo "==> 1b/5 生成一键部署脚本"
DEPLOY_SH=$(mktemp /tmp/debnas-installer.XXXXXX)
{
  cat <<'DEBNAS_HEADER'
#!/bin/bash
# debnas 一键部署：
#   curl -fsSLk https://<主机>/deploy.sh | sudo bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "请用 sudo 运行" >&2; exit 1; }
TMP=$(mktemp -d /tmp/debnas-src.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
base64 -d <<'DEBNAS_TARBALL'
DEBNAS_HEADER
  tar -C "$HERE" --exclude='web/frontend/icons/snowluma.png' \
    -czf - deploy-web.sh install-deps.sh install-mihomo.sh LICENSE NOTICE web | base64 -w 76
  cat <<'DEBNAS_FOOTER'
DEBNAS_TARBALL
cd "$TMP"
bash deploy-web.sh "$@"
DEBNAS_FOOTER
} > "$DEPLOY_SH"
install -m 0644 "$DEPLOY_SH" "$STATIC/deploy.sh"
rm -f "$DEPLOY_SH"
echo "    已发布 ${STATIC}/deploy.sh"

echo "==> 2/5 后端助手脚本"
install -m 0755 "$HERE/web/helpers/samba.py" "$HERE/web/helpers/power_sampler.py" \
  "$HERE/web/helpers/autoupdate.sh" "$HERE/web/helpers/vncpass.sh" \
  "$HERE/web/helpers/qqfeed.sh" "$HERE/install-mihomo.sh" "$LIB/"

echo "==> 3/5 采样服务"
install -m 0644 "$HERE/web/helpers/debnas-power.service" "$POWER_UNIT"
systemctl daemon-reload
systemctl enable --now debnas-power.service >/dev/null 2>&1 || true
systemctl restart debnas-power.service

echo "==> 4/5 Web 服务"
RUN_AS="${SUDO_USER:-}"
if [[ -z "$RUN_AS" || "$RUN_AS" == "root" ]]; then
  RUN_AS=$(stat -c %U "$HERE" 2>/dev/null || echo "")
fi
if [[ -n "$RUN_AS" ]] && id -u "$RUN_AS" >/dev/null 2>&1; then
  install -m 0644 "$HERE/web/debnas-web.service" "$UNIT"
  sed -i "s/__DEBNAS_USER__/$RUN_AS/g" "$UNIT"
  echo "    DEBNAS_WEB_RUN_AS=$RUN_AS"
else
  install -m 0644 "$HERE/web/debnas-web.service" "$UNIT"
  echo "    警告：无法确定 DEBNAS_WEB_RUN_AS，unit 里仍是占位符" >&2
fi
if [[ ! -f /etc/pam.d/debnas-web ]]; then
  install -m 0644 "$HERE/web/pam-service" /etc/pam.d/debnas-web
  echo "    已写入 PAM 服务定义"
fi
systemctl daemon-reload
systemctl enable debnas-web.service >/dev/null 2>&1
systemctl restart debnas-web.service
sleep 1
systemctl is-active debnas-web.service

echo "==> 5/5 TLS 反向代理"
if [[ $WITH_CADDY -eq 1 ]]; then
  if ! command -v caddy >/dev/null 2>&1; then
    echo "    未安装 Caddy，先执行：apt install caddy"
    exit 1
  fi
  install -m 0644 "$HERE/web/Caddyfile.snippet" /etc/caddy/Caddyfile
  systemctl restart caddy
  echo "    Caddy 已重载（注意核对站点地址与证书路径）"
else
  echo "    跳过（--with-caddy 可自动配置）"
fi

cat <<EOF

部署完成。

  访问     https://<主机>/        （经 Caddy 终止 TLS）
  后端     http://127.0.0.1:8080  （仅本机）
  前端     $STATIC
  助手     $LIB

首次浏览器会提示自签证书不受信任，可把 /etc/caddy/debnas.crt 导入信任列表。
EOF
