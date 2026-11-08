# my-debnas · Debian NAS 控制台

![vibe coding](https://img.shields.io/badge/vibe_coding-AI_pair_programmed-ff69b4?style=flat-square)
![license](https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square)
![platform](https://img.shields.io/badge/Debian_13-x86__64-A80030?style=flat-square)
![backend](https://img.shields.io/badge/backend-Python_stdlib-3776AB?style=flat-square)
![ui](https://img.shields.io/badge/ui-Material_3_Expressive-6750A4?style=flat-square)

一台 Debian 13 小主机的自建 NAS 控制台：PAM 登录、Samba 共享、文件、用户与组、
存储 / 网络 / 服务 / 日志、真实终端、apt 更新、libvirt 虚拟机 + 浏览器 VNC，
外加容器应用、QQ 动态和 mihomo 管理块。

界面按 **Material 3 Expressive（MD3E）** 设计，纯手写 CSS + 原生 JS。
没有 Cockpit，没有 Node 构建，后端只用 Python 标准库。

> [!WARNING]
> **这是 vibe coding 产物。** 代码、样式、脚本和文档主要在和 AI 的
> “描述 → 生成 → 实测 → 修”循环里产出；需求、验收和发布由作者负责。
> 它在一台 Debian 13 NAS 上日常使用，但**没有自动化测试，也没有安全审计**。
> 不要直接暴露到公网；上重要数据前先备份、先试，并读一下[「安全」](#安全)。

[功能](#功能) · [界面](#界面) · [快速开始](#快速开始) · [安全](#安全) · [已知限制](#已知限制) · [许可](#许可)

## 是什么

简单说：**装好 Debian 之后，每天用的那一层 NAS 界面。**

- 适合：自己的小主机、局域网、一个可信管理员、Debian 13 x86_64
- 不适合：公网、多租户、关键业务、需要开箱即用的相册 / 影音 / RAID 套件
- 容器管理只做应用入口、拉镜像和 noVNC 口令，不是 Portainer 替代品

## 和上游的关系

起点是 [debnas](https://github.com/kekylin/debnas)：一个把 Debian 配成 HomeNAS 的脚本，
WebUI 用 Cockpit + Portainer。本项目借用了它的 NAS 场景，但控制台是另写的，
**不是 fork，也没有隶属关系**。

- 想一键把 Debian 配成 NAS（相册、影音、RAID、Cockpit）：看上游
- 想要一个能自己改、没有 Cockpit / Node 依赖的轻量控制台：用这个

上游文档：[DebNAS 文档](https://kekylin.github.io/debnas-docs/)

## 功能

- **首页**：主机、内存 / 磁盘、应用入口、QQ 动态、实时流量、硬件栏、mihomo
- **共享**：Samba 列表 / 新建 / 编辑 / 删除，导入导出 `smb.conf`
- **文件**：浏览、上传、下载、删除、新建目录、重命名 / 移动 / 复制
- **用户**：账号、组（新建 / 删除）、系统密码、Samba 密码、密码策略、SSH 公钥、登录记录
- **存储 / 网络**：磁盘、SMART、接口、流量；可改 IPv4 / DNS、连接 / 断开网卡
- **服务 / 日志**：systemd 启停、journalctl 搜索
- **终端**：真实 PTY，支持 vim / top / htop / tmux
- **更新**：`full-upgrade`、无人值守升级、apt 历史
- **虚拟机**：创建、启停、快照、扩容、换盘、删除、浏览器 VNC
- **其他**：容器应用自动发现、QQ 动态、mihomo 节点 / 模式 / 测速

界面默认跟随系统深浅色，手机端有卡片布局和抽屉导航，细节见[「界面」](#界面)。
mihomo 没装或架构不匹配时，跑 `sudo ./install-mihomo.sh --check` 看推荐资产，
再跑 `sudo ./install-mihomo.sh` 安装。

## 界面

控制台按 **Material 3 Expressive（MD3E）** 的观感实现。颜色、圆角、动效都是
`styles.css` 里的 CSS 变量，配 `theme.js` 生成，没有引 MDC 组件库，也没加 Node 构建。

- **种子色 → 角色色**：在「外观与主题色」里挑一颗种子色，`theme.js` 在 CIELAB 里按
  tone / chroma 推导 primary、tertiary 等角色色；选择按账号存
  `~/.config/debnas-portal/prefs.json`，换浏览器也生效
- **深浅色**：默认跟随系统（登录页也跟随），也可以手动固定浅色 / 深色
- **形状与动效**：圆角 10 / 16 / 24 / 28 / 全圆，弹性缓动
  `cubic-bezier(.34, 1.56, .64, 1)`；系统开了「减少动态效果」就直接关掉动画
- **离线资源**：Inter + Noto Sans SC 子集、图标、noVNC、xterm.js 都随仓库自带
- **响应式**：宽屏（≥1400px）左右留白栏常驻（左 QQ 动态、右硬件卡和 mihomo 块）；
  ≤900px 改抽屉导航；≤720px 的用户 / 服务 / 更新 / 共享 / 存储 / 网络页改卡片布局

改颜色基本只用改 `web/frontend/theme.js` 的 `DEFAULTS` 和 `palette()`，
组件样式不用跟着动。

## 快速开始

要求：**Debian 13（trixie）x86_64、root、systemd**，一个能 SSH 登录的 sudo 账号。
只支持 x86_64，其他架构会直接拒绝；Debian 12 未测试。

```bash
git clone https://github.com/huizzz10/dafeiyu_live_in_my_debnas.git ~/my-debnas
cd ~/my-debnas
sudo ./deploy-web.sh
```

`deploy-web.sh` 会装依赖、部署后端和前端、启动 `debnas-web`、发布 `/deploy.sh`。

**第一次装还没有 Caddy 配置时**，先生成自签证书，再用 `--with-caddy`：

```bash
sudo openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
  -keyout /etc/caddy/debnas.key -out /etc/caddy/debnas.crt \
  -subj "/CN=debnas" -addext "subjectAltName=IP:<主机IP>"
sudo chown root:caddy /etc/caddy/debnas.{crt,key}
sudo chmod 640 /etc/caddy/debnas.key
sudo ./deploy-web.sh --skip-deps --with-caddy   # 已经跑过上面的部署
```

也可以自己把 80 / 443 反代到 `127.0.0.1:8080`。配好后访问：

```
https://<主机>/
```

手机和 NAS 连同一个 Wi-Fi，直接打开 `http://<主机>/`，不用装证书。
HTTP 下密码和 session 会明文经过局域网，只建议在可信 Wi-Fi 使用。
如果手机之前缓存过 HSTS、一直跳 HTTPS，清一下站点数据，或跑
`sudo ./add-http-alias.sh` 换个局域网 IP。

常用参数：

```bash
sudo ./deploy-web.sh --skip-deps      # 跳过 apt，只更新文件
sudo ./deploy-web.sh --with-mihomo    # 顺便装 / 更新 mihomo
sudo ./deploy-web.sh --reinstall-deps # 强制重装依赖
```

`--with-caddy` 会覆盖 `/etc/caddy/Caddyfile`；已有站点请手动合并 `web/Caddyfile.snippet`。

## 安全

**登录账号约等于这台 NAS 的管理员。** 控制台没有按用户分级：

- 服务、apt、共享、用户、虚拟机按 root 执行
- 文件页只有运行账号主目录内的写操作会降权，其他路径也按 root
- 只有整机重启和 `root: true` 的 `/api/exec` 会检查 sudo 组

所以：不要把登录入口给不可信的人；不要直接把 80 / 443 映射到公网；
远程访问用 VPN / Tailscale / 反代加认证。

其他注意：

- 后端默认只监听 `127.0.0.1:8080`，HTTP 80 只对私有网段反代
- 会话 cookie HttpOnly + SameSite=Strict，8 小时过期；除登录 / 注销外写操作要 CSRF
- `DEBNAS_WEB_DEV_USER` 会按 TCP 对端免登录。Caddy 反代也来自 `127.0.0.1`，
  **生产环境绝对不能设**
- `/deploy.sh` 是公开安装器，不走登录；不想局域网可下载就删掉 `static/deploy.sh`
- 新建的虚拟机 VNC 只监听 `127.0.0.1`；QQ 图片 / 表情代理限制域名和 8 MB

如果机器上还有普通 SSH 用户，建议在 `/etc/pam.d/debnas-web` 限制只允许 sudo 组登录：

```
account  required  pam_succeed_if.so user ingroup sudo
```

按你的 PAM 配置调整。

## 已知限制

- 没有自动化测试；Debian 12 未测试；只支持 x86_64
- 终端断线 / 刷新后是全新会话；服务重启会清空所有终端
- 文件页不是用户级沙箱；跨用户目录可能产生 root 属主文件
- 上传单文件上限 16 GB；超大文件或断点续传建议走 SMB
- 容器操作依赖运行账号的 rootless podman
- 虚拟机控制台只支持 VNC；向导没有 UEFI / TPM，Windows 11 要手动改 XML
- 磁盘扩容只扩虚拟盘，guest 内还要自己扩分区
- 网络修改依赖 NetworkManager（`nmcli`）
- 界面是 M3E 风格的 CSS 实现，不是 Google 官方组件库，组件细节不保证与规范逐条对齐
- 不包含 RAID 编排、相册、影音套件、Portainer 替代

## 开发与排错

改完做一遍语法检查：

```bash
python3 -m py_compile web/server.py
node --check web/frontend/app.js
node --check web/api-web.js
node --check web/cockpit-shim.js
bash -n deploy-web.sh install-deps.sh install-mihomo.sh
```

没有测试，欢迎补测试和 PR。常见问题：

| 现象 | 先看 |
|---|---|
| 502 / 打不开 | `systemctl status debnas-web caddy` |
| 登录失败 | `/etc/pam.d/debnas-web` 是否存在 |
| 终端空白 | `/xterm/xterm.js` 是否 200，浏览器控制台报错 |
| 虚拟机未就绪 | `systemctl status libvirtd` |
| mihomo API 不可达 | `/etc/mihomo/config.yaml` 的 `external-controller` / `secret` |

日志：

```bash
sudo journalctl -u debnas-web -n 100 --no-pager
sudo journalctl -u caddy -n 50 --no-pager
```

## 来源与许可

- [debnas](https://github.com/kekylin/debnas)（GPL-3.0）：项目起点与场景参考，不是 fork
- Cockpit / cockpit-file-sharing / cockpit-identities：早期界面参考，运行时不依赖
- Debian swirl（Debian Open Use Logo License）、xterm.js（MIT）、
  noVNC（MPL-2.0 / BSD / CC-BY-SA）、Inter 与 Noto CJK（OFL）
- Debian、libvirt、QEMU、Samba、Caddy、mihomo 等上游项目

完整信息见 [`NOTICE`](NOTICE)。
仓库不包含 SnowLuma 的代码和 logo。

## 许可

本项目按 **GPL-3.0** 分发，见 [`LICENSE`](LICENSE)。

---

**再次说明：这是 vibe coding 产物。** 可以参考、可以自用，但请自己判断，
不要默认它已经过审计。
