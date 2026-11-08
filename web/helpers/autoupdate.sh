#!/usr/bin/env bash
# 管理 apt 自动更新的开关与周期（供控制台调用）
#   autoupdate.sh get                 输出 {"enabled":true,"schedule":"daily"}
#   autoupdate.sh set <0|1> <daily|weekly|monthly>
set -euo pipefail

CONF=/etc/apt/apt.conf.d/20auto-upgrades
DROPIN_DIR=/etc/systemd/system/apt-daily-upgrade.timer.d
DROPIN=$DROPIN_DIR/50-debnas.conf

sched_now() {
  if [[ -f $DROPIN ]] && grep -q -- '-01 ' "$DROPIN"; then echo monthly
  elif [[ -f $DROPIN ]] && grep -q 'Sun ' "$DROPIN"; then echo weekly
  else echo daily
  fi
}

case "${1:-get}" in
  get)
    en=false
    grep -q 'Unattended-Upgrade "1"' "$CONF" 2>/dev/null && en=true
    printf '{"enabled":%s,"schedule":"%s"}\n' "$en" "$(sched_now)"
    ;;

  set)
    en="${2:-0}"
    sched="${3:-daily}"
    case "$sched" in
      daily)   expr='*-*-* 03:00:00' ;;
      weekly)  expr='Sun *-*-* 03:00:00' ;;
      monthly) expr='*-*-01 03:00:00' ;;
      *) echo "未知周期：$sched" >&2; exit 2 ;;
    esac

    mkdir -p "$DROPIN_DIR" /etc/systemd/system/apt-daily.timer.d
    for unit in apt-daily apt-daily-upgrade; do
      printf '[Timer]\nOnCalendar=\nOnCalendar=%s\nRandomizedDelaySec=15m\n' "$expr" \
        > "/etc/systemd/system/$unit.timer.d/50-debnas.conf"
    done

    printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "%s";\n' \
      "$([[ "$en" == "1" ]] && echo 1 || echo 0)" > "$CONF"

    systemctl daemon-reload
    systemctl restart apt-daily.timer apt-daily-upgrade.timer
    echo "ok"
    ;;

  *)
    echo "用法：$0 get | set <0|1> <daily|weekly|monthly>" >&2
    exit 2
    ;;
esac
