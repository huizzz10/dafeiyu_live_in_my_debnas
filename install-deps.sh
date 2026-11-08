#!/usr/bin/env bash
# debnas-web 全量依赖安装（可重复执行）
#
#   sudo ./install-deps.sh              # 缺什么补什么，已安装的也逐个检查/升级
#   sudo ./install-deps.sh --reinstall  # 连已安装的包也强制重装
#
# 目标系统：Debian 13 trixie / x86_64
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "请用 sudo 运行" >&2; exit 1; }
[[ "$(uname -m)" == "x86_64" ]] || { echo "my-DebNAS 只支持 x86_64，当前架构：$(uname -m)" >&2; exit 1; }
REINSTALL=0
[[ "${1:-}" == "--reinstall" ]] && REINSTALL=1

export DEBIAN_FRONTEND=noninteractive
APT=(apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)
[[ $REINSTALL -eq 1 ]] && APT+=(--reinstall)

# 必需：缺一个页面就不完整
REQUIRED=(
  python3
  caddy curl
  iproute2 iw iputils-ping hostname wtmpdb
  util-linux procps
  libpam0g sudo
  openssl openssl-provider-legacy
  smartmontools
  samba samba-common-bin
  libvirt-daemon-system libvirt-clients libvirt-daemon-config-network
  qemu-system-x86 qemu-utils virt-install dnsmasq-base
  nftables iptables
)

# 可选：装不上只警告，不阻塞部署
OPTIONAL=(
  intel-gpu-tools
  ovmf swtpm swtpm-tools
  podman
  unattended-upgrades
  nfs-kernel-server
  lm-sensors
)

echo "==> apt-get update"
apt-get update

echo "==> 必需依赖（${#REQUIRED[@]} 个包）"
"${APT[@]}" --no-install-recommends "${REQUIRED[@]}"

echo "==> 可选依赖"
for p in "${OPTIONAL[@]}"; do
  if "${APT[@]}" --no-install-recommends "$p"; then
    echo "    OK  $p"
  else
    echo "    跳过（装不上，不影响主功能）：$p" >&2
  fi
done

echo "==> 基础服务"
# libvirt 用 socket activation 也行，这里尽量拉起常驻服务
systemctl enable --now libvirtd.service >/dev/null 2>&1 || systemctl start libvirtd.service >/dev/null 2>&1 || true
systemctl enable --now smbd.service >/dev/null 2>&1 || true

echo
echo "依赖安装完成。"
echo "  sudo ./deploy-web.sh              # 部署"
echo "  sudo ./deploy-web.sh --with-caddy # 同时写 Caddy 配置"
