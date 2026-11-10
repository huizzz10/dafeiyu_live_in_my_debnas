# my-DebNAS · Debian NAS 控制台

![vibe coding](https://img.shields.io/badge/vibe_coding-AI_pair_programmed-ff69b4?style=flat-square)
![license](https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square)
![platform](https://img.shields.io/badge/Debian_13-x86__64-A80030?style=flat-square)
![backend](https://img.shields.io/badge/backend-Python_stdlib-3776AB?style=flat-square)
![ui](https://img.shields.io/badge/ui-Material_3_Expressive-6750A4?style=flat-square)

一台 Debian 13 小主机的自建 NAS 控制台：PAM 登录、Samba 共享、文件、用户与组、
存储 / 网络 / 服务 / 日志、真实终端、apt 更新、libvirt 虚拟机 + 浏览器 VNC，
外加 AstrBot / NapCat 的 QQ 动态与面板凭据、容器应用入口和 mihomo 管理块。

界面按 **Material 3 Expressive（MD3E）** 设计，纯手写 CSS + 原生 JS。
没有 Cockpit，没有 Node 构建，后端只用 Python 标准库。

> [!WARNING]
> **这是 vibe coding 产物。** 代码、样式、脚本和文档主要在和 AI 的
> “描述 → 生成 → 实测 → 修”循环里产出；需求、验收和发布由作者负责。
> 它在一台 Debian 13 NAS 上日常使用，但**没有自动化测试，也没有系统性的安全审计**。
> 不要直接暴露到公网；上重要数据前先备份、先试，并读一下[「安全」](#安全)。

[这是什么](#这是什么) · [功能](#功能一览) · [界面](#界面) · [快速开始](#快速开始) ·
[可选组件](#可选组件) · [配置](#配置参考) · [备份](#数据与备份) ·
[安全](#安全) · [限制](#已知限制) · [排错](#开发与排错) · [许可](#许可)

## 这是什么

简单说：**装好 Debian 之后，每天用的那一层 NAS 界面。**

适合：

- 自己的小主机、局域网、一个可信管理员
- Debian 13 x86_64，愿意用命令行做一次部署
- 想改界面 / 加功能，又不想背 Cockpit 和 Node 工具链

不适合：

- 公网直接暴露、多租户、关键业务
- 开箱即用的相册 / 影音 / RAID 套件（这些请看上游 DebNAS）
- 替代 Portainer 做完整容器编排：这里只做应用入口、拉镜像和 noVNC 口令

## 和上游的关系

起点是 [DebNAS](https://github.com/kekylin/debnas)：一个把 Debian 配成 HomeNAS 的脚本，
WebUI 用 Cockpit + Portainer。本项目借用了它的 NAS 场景，但控制台是另写的，
**不是 fork，也没有隶属关系**。

- 想一键把 Debian 配成 NAS（相册、影音、RAID、Cockpit）：看上游
- 想要一个能自己改、没有 Cockpit / Node 依赖的轻量控制台：用这个

上游文档：[DebNAS 文档](https://kekylin.github.io/debnas-docs/)

## 功能一览

- **首页**：主机、内存 / 磁盘、应用入口、QQ 动态、实时流量、硬件栏、mihomo
- **共享**：Samba 列表 / 新建 / 编辑 / 删除，导入导出 `smb.conf`
- **文件**：浏览、上传、下载、删除、新建目录、重命名 / 移动 / 复制
- **用户**：账号、组（新建 / 删除）、系统密码、Samba 密码、密码策略、SSH 公钥、登录记录
- **存储 / 网络**：磁盘、SMART、接口、流量；可改 IPv4 / DNS、连接 / 断开网卡
- **服务 / 日志**：systemd 启停、journalctl 搜索
- **终端**：真实 PTY，支持 vim / top / htop / tmux
- **更新**：`full-upgrade`、无人值守升级、apt 历史
- **凭据**：AstrBot 控制台账号 / 密码、NapCat WebUI token，在线状态、复制 / 显示、
  直接打开面板；只在登录后可见
- **虚拟机**：创建、启停、快照、扩容、换盘、删除、浏览器 VNC
- **其他**：应用自动发现（扫描容器端口和 AstrBot / NapCat 宿主进程）、QQ 动态、
  mihomo 节点 / 模式 / 测速、API 余额（自动探测多家 key，逐家显示模型与余额）

界面默认跟随系统深浅色，手机端有卡片布局和抽屉导航，细节见[「界面」](#界面)。

QQ 动态和凭据页需要本机自己跑 AstrBot（6185）与 NapCat（6099），仓库不负责安装
这两个服务，配置方法见[「可选组件」](#qq-动态与凭据astrbot--napcat)。

## 界面

控制台按 **Material 3 Expressive（MD3E）** 的观感实现。颜色、圆角、动效都是
`styles.css` 里的 CSS 变量，配 `theme.js` 生成，没有引 MDC 组件库，也没加 Node 构建。

- **种子色 → 角色色**：在「外观与主题色」里挑一颗种子色，`theme.js` 在 CIELAB 里按
  tone / chroma 推导 primary、tertiary 等角色色；选择按账号存
  `~/.config/debnas-portal/prefs.json`，换浏览器也生效
- **深浅色**：默认跟随系统（登录页也跟随），也可以手动固定浅色 / 深色
- **QQ 聊天流**：群聊 / 私聊两条独立流可切换；左侧留白栏按天分隔，间隔超过 10 分钟
  补时间点，180 秒内同一人的消息合并头像；标题吸顶，往上翻看旧消息时不会被新消息
  拉回底部；图片异步加载，只有正贴着底部时才重新贴底；表情包和普通图片一样等比缩放；
  新消息 3 秒一轮自动上屏
- **形状与动效**：圆角 10 / 16 / 24 / 28 / 全圆，弹性缓动
  `cubic-bezier(.34, 1.56, .64, 1)`；系统开了「减少动态效果」就直接关掉动画
- **离线资源**：Inter + Noto Sans SC 子集、图标、noVNC、xterm.js 都随仓库自带
- **版本**：右侧「系统」块显示 `内核 … · DebNAS 0.1.0`，系统信息里的「界面版本」读
  同一份 `VERSION`；读不到时统一回落成 `unknown`，右侧不显示版本号
- **响应式**：宽屏（≥1400px）左右留白栏常驻（左 QQ 动态、右硬件卡 / mihomo /
  API 余额块）；
  1400–1599px 隐藏消息头像，把宽度让给正文；≤900px 改抽屉导航、凭据页变单列；
  ≤720px 的用户 / 服务 / 更新 / 共享 / 存储 / 网络页改卡片布局

改颜色基本只用改 `web/frontend/theme.js` 的 `DEFAULTS` 和 `palette()`，
组件样式不用跟着动。

## 快速开始

### 环境要求

- **Debian 13（trixie）x86_64**，其他架构会直接拒绝；Debian 12 未测试
- root（或能 `sudo` 的账号）、systemd、一个能 SSH 登录的普通用户
- 建议给主机一个局域网内的固定 IP
- 80 / 443 交给 Caddy；不配 TLS 就用 snippet 里的 `:80` 段做局域网 HTTP 反代

### 安装

```bash
git clone https://github.com/huizzz10/dafeiyu_live_in_my_debnas.git ~/my-DebNAS
cd ~/my-DebNAS
sudo ./deploy-web.sh
```

`deploy-web.sh` 大致按这个顺序干活：装 apt 依赖 → 把后端和前端放到
`/usr/local/lib/debnas-web` → 起 `debnas-power` 采样服务 → 写
`debnas-web.service` 并启动 → 视参数配置 Caddy。

部署完先确认后端活着：

```bash
systemctl status debnas-web --no-pager
curl -s http://127.0.0.1:8080/api/health     # {"ok": true}
```

**同一套装到另一台机器**：第一次部署后会发布 `/deploy.sh`（自解压脚本），
新机器上直接：

```bash
curl -fsSLk https://<已部署的主机>/deploy.sh | sudo bash
```

> `-k` 是为自签证书关掉 TLS 校验，脚本又是直接 `sudo bash`。只在可信局域网里这么用；
> 不确定网络是否干净时，先 `curl -o deploy.sh` 下来看一眼再执行。

### 配 HTTPS（推荐）

想让 Caddy 用自签证书，先生成证书，再带 `--with-caddy` 部署：

```bash
sudo openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
  -keyout /etc/caddy/debnas.key -out /etc/caddy/debnas.crt \
  -subj "/CN=debnas" -addext "subjectAltName=IP:<主机IP>"
sudo chown root:caddy /etc/caddy/debnas.{crt,key}
sudo chmod 640 /etc/caddy/debnas.key
sudo ./deploy-web.sh --skip-deps --with-caddy   # 已经跑过上面的部署
```

也可以自己把 80 / 443 反代到 `127.0.0.1:8080`，参考 `web/Caddyfile.snippet`。

> [!IMPORTANT]
> `--with-caddy` 会**整份覆盖** `/etc/caddy/Caddyfile`。机器上还有别的站点时，
> 不要带这个参数，手动把 snippet 合并进去。

### 访问

```
https://<主机>/        # 有证书的 HTTPS
http://<主机>/         # 局域网 HTTP（snippet 里的 :80 段）
```

手机和 NAS 连同一个 Wi-Fi，直接打开 `http://<主机>/`，不用装证书。
HTTP 下密码和 session 会明文经过局域网，只建议在可信 Wi-Fi 使用。
如果手机之前缓存过 HSTS、一直跳 HTTPS，清一下站点数据，或跑
`sudo ./add-http-alias.sh` 换个局域网 IP。

### 常用参数

```bash
sudo ./deploy-web.sh --skip-deps      # 跳过 apt，只更新文件
sudo ./deploy-web.sh --with-caddy     # 同时写 Caddy 配置（会覆盖）
sudo ./deploy-web.sh --with-mihomo    # 顺便装 / 更新 mihomo
sudo ./deploy-web.sh --reinstall-deps # 强制重装依赖
```

### 升级

```bash
cd ~/my-DebNAS
git pull
sudo ./deploy-web.sh --skip-deps
```

控制台代码都在 `git` 里，回滚就是退到上一个提交再部署：

```bash
git log --oneline -5
git checkout <commit>
sudo ./deploy-web.sh --skip-deps
```

`--skip-deps` 升级不会动 `/var/lib/debnas-web`、PAM 配置和 Caddy 配置；
带 `--with-caddy` 时会重写 `Caddyfile`。

### 卸载

先备份[「数据与备份」](#数据与备份)里的东西，然后：

```bash
sudo systemctl disable --now debnas-web debnas-power
sudo rm -f /etc/systemd/system/debnas-web.service \
           /etc/systemd/system/debnas-power.service
sudo rm -rf /etc/systemd/system/debnas-web.service.d
sudo rm -rf /usr/local/lib/debnas-web /usr/local/lib/debnas-portal
sudo rm -f /etc/pam.d/debnas-web
# Caddyfile 里还有别的站点时，先备份 / 手动删掉本项目那两段
sudo rm -f /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl restart caddy
```

apt 依赖、Samba 配置、libvirt 里的虚拟机不在卸载范围内，按需自己清理。
`/var/lib/debnas-web` 也保留着，确认不要媒体缓存再删。

## 可选组件

### QQ 动态与凭据（AstrBot + NapCat）

仓库不分发、也不安装这两个服务。想让左侧动态和「凭据」页有内容，需要本机跑：

- **AstrBot**：控制台在 6185，QQ 动态读它的插件历史 `history.jsonl` 和群成员表
  `members.json`
- **NapCat**：WebUI 在 6099，凭据页从它的 `webui.json` 读 token

AstrBot 的面板账号密码放在**运行账号**（部署时的 sudo 用户）主目录下，
建议目录 0700、文件 0600：

```bash
install -d -m 700 ~/.config/debnas-web
printf '{"astrbot": {"username": "astrbot", "password": "面板密码"}}\n' \
  > ~/.config/debnas-web/credentials.json
chmod 600 ~/.config/debnas-web/credentials.json
```

NapCat 的 token 直接读
`~/Napcat/opt/QQ/resources/app/app_launcher/napcat/config/webui.json`，装好 NapCat
就有，不用另配。两条路径可分别用 `DEBNAS_CREDENTIALS_FILE`、`DEBNAS_NAPCAT_WEBUI`
覆盖。

QQ 号和人设名都不带默认值：`DEBNAS_QQ_BOT_UIN` / `DEBNAS_QQ_OWNER` 填机器人和
你自己的 QQ 号，不填就只显示「群聊 / 私聊」、头像退回占位图；
`DEBNAS_QQ_BOT_NAME` / `DEBNAS_QQ_OWNER_NAME` 填两边在消息流里的显示名
（默认「机器人」「我」）。改法见[「配置参考」](#配置参考)。

<details>
<summary>QQ 动态的数据是怎么拼出来的（实现细节）</summary>

数据只读不写，**插件日志是唯一来源**：

- 插件写的 `astrbot_plugin_feiyu/history.jsonl` 提供毫秒时间、发送者和图片
- 同目录的 `members.json` 补「昵称 → QQ 号」；老记录没有 `uid` 时，再用
  `@昵称(QQ号)` 反推一次，两头都对不上才退回首字方块
- 她发出去的图片 / 表情包从 `journalctl` 里的 `sticker_send`、
  `send_message_to_user` 反推
- `stickers.json` 的 `lastUsedAt` 一直当第二来源，日志漏掉的记录也能补回来
  （和日志按 180 秒去重）
- 合并后按「会话 + 方向 + 秒 + 文本」去重，同一份消息只留一条；AstrBot 会话库
  （`data_v4.db`）不再参与：那份数据没有真实发送时间，靠消息里的
  `Current datetime` 往后顺延会把 20:08 的图排到 18:59

图片按 md5 缓存在 `/var/lib/debnas-web/media/`（`DEBNAS_WEB_STATE` 可改），
表情包原图优先用插件 `media/` 或 AstrBot `data/temp` 下那一份，GIF 才不会被抽成
静态帧。

刷新是「前端 3 秒一次定时拉、服务端缓存 1 秒」（`DEBNAS_QQ_FEED_TTL` 可改），
所以新消息 2~4 秒就上屏。为了让 3 秒一轮不烧 CPU，日志第一次读 24 小时、
之后只读「上次位置 -2 秒」的增量；最多保留 400 条，群聊 / 私聊各显示最近
40 条，前端按稳定 id 去重，刷新时不会重复追加。

</details>

### mihomo

没装或架构不匹配时，先看看推荐资产，再安装：

```bash
./install-mihomo.sh --check    # 只检测，不下载，不需要 root
sudo ./install-mihomo.sh       # 装到 /usr/local/bin/mihomo
```

脚本会按 `/proc/cpuinfo` 的 flags 选 `amd64` / `amd64-v2` / `amd64-v3` /
`amd64-compatible`，避免在只支持 SSE4.2 的机器上跑 AVX2 版本。
它只装二进制，不生成配置；配置仍读 `/etc/mihomo/config.yaml`。

### API 余额（可选）

右侧栏 mihomo 下面有个「鲸鲸的零花钱」块，由后端代查 API 账户余额。它不绑死某一家：
读环境变量和 `~/.config/*/{env,.env,env.sh}` 里所有以 `_API_KEY` 结尾的变量，按
DeepSeek → OpenAI → Anthropic → Moonshot → SiliconFlow → DashScope → 智谱 → Gemini →
xAI → OpenRouter 的顺序排；同名的 `<NAME>_BASE_URL` / `<NAME>_API_BASE` 可以指到自建
代理，`<NAME>_MODEL` 在读不到 AstrBot 配置时兜底模型名。

目前能查余额的：DeepSeek（`/user/balance`）、Moonshot（`/v1/users/me/balance`）、
SiliconFlow（`/v1/user/info`）、OpenRouter（`/api/v1/credits`）。OpenAI / Anthropic /
Gemini / xAI / 智谱没有公开余额接口，块里照样显示名字、模型、端点和密钥尾号，下面写
「这家没有公开的余额接口」，不会硬编成某个厂商。

```bash
install -d -m 700 ~/.config/deepseek
printf 'DEEPSEEK_API_KEY=sk-你的密钥\n' > ~/.config/deepseek/env
chmod 600 ~/.config/deepseek/env
```

模型名从 AstrBot 的 `cmd_config.json` 里读：先按密钥尾号匹配 `provider_sources`，
再按 base host 匹配，最后退回 `<NAME>_MODEL`；读不到就留空。

也可以写进 systemd drop-in 的 `Environment=`，但 `systemctl show` 对普通用户也能
看到环境变量，**更推荐上面这个 0600 文件**。密钥只在服务端读，浏览器只拿到四样
东西：厂商名、模型、endpoint、密钥末 4 位（密钥不足 12 位时只显示 `…`）；endpoint
是本机 / 内网地址时只显示「本机端点」「内网端点」，不会把内网拓扑带出去。没配或
接口不通时块里直接显示原因，不影响其他功能；手动刷新最多 5 秒一次，其余按
`DEBNAS_DEEPSEEK_TTL`（默认 60 秒）缓存，失败后 15 秒重试。

## 配置参考

### 环境变量

全部用环境变量覆盖；路径类变量的默认值都以 `DEBNAS_WEB_RUN_AS`（运行账号）的
家目录为基准。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DEBNAS_WEB_BIND` | `127.0.0.1` | 后端监听地址 |
| `DEBNAS_WEB_PORT` | `8080` | 后端监听端口 |
| `DEBNAS_WEB_STATIC` | `/usr/local/lib/debnas-web/static` | 前端静态目录 |
| `DEBNAS_WEB_STATE` | `/var/lib/debnas-web` | 状态目录（会话密钥、媒体缓存） |
| `DEBNAS_WEB_RUN_AS` | 部署时的 sudo 用户 | 运行账号，家目录下找凭据和 AstrBot 数据 |
| `DEBNAS_WEB_DEV_USER` | 未设置 | 按 TCP 对端免登录，**生产环境绝对不要设** |
| `DEBNAS_CREDENTIALS_FILE` | `~/.config/debnas-web/credentials.json` | AstrBot 面板凭据 |
| `DEBNAS_NAPCAT_WEBUI` | `~/Napcat/…/napcat/config/webui.json` | NapCat token 来源 |
| `DEBNAS_QQ_HISTORY` | `~/astrbot-src/data/plugin_data/astrbot_plugin_feiyu/history.jsonl` | 插件聊天历史 |
| `DEBNAS_QQ_FEED_TTL` | `1` | 服务端动态缓存秒数 |
| `DEBNAS_QQ_BOT_UIN` | 空 | 机器人 QQ 号 |
| `DEBNAS_QQ_OWNER` | 空 | 本人 QQ 号 |
| `DEBNAS_QQ_BOT_NAME` | `机器人` | 消息流里机器人的显示名 |
| `DEBNAS_QQ_OWNER_NAME` | `我` | 消息流里本人的显示名 |
| `DEBNAS_MIHOMO_CONFIG` | `/etc/mihomo/config.yaml` | mihomo 配置路径 |
| `DEBNAS_MIHOMO_BIN` | `/usr/local/bin/mihomo` | mihomo 二进制路径 |
| `DEBNAS_MIHOMO_API` | 读配置；兜底 `127.0.0.1:9093` | 外部控制器地址 |
| `DEBNAS_MIHOMO_SECRET` | 读配置 | 控制器密钥 |
| `DEBNAS_DEEPSEEK_TTL` | `60` | 余额缓存秒数（失败 15 秒后重试，手动刷新最少隔 5 秒） |
| `DEEPSEEK_API_KEY` | 空 | DeepSeek 密钥；任何 `<NAME>_API_KEY` 都会被自动探测 |
| `<NAME>_BASE_URL` | 空 | 该厂商的自建 / 代理 endpoint（也可写 `<NAME>_API_BASE`） |
| `<NAME>_MODEL` | 空 | 余额块显示的模型名（读不到 AstrBot 配置时兜底） |
| `DEBNAS_VM_URI` | `qemu:///system` | libvirt 连接 URI |
| `DEBNAS_VM_IMAGES` | `/var/lib/libvirt/images` | 虚拟机镜像目录 |
| `DEBNAS_VM_ISO_DIRS` | 空 | 额外 ISO 目录，冒号分隔 |

### 怎么改

`deploy-web.sh` 每次部署都会用仓库里的 `web/debnas-web.service` **覆盖**
`/etc/systemd/system/debnas-web.service`。所以不要直接改那个文件，用 systemd
的 drop-in：

```bash
sudo systemctl edit debnas-web.service
```

写入（按需增删）：

```ini
[Service]
Environment=DEBNAS_QQ_BOT_UIN=123456789
Environment=DEBNAS_QQ_OWNER=987654321
Environment=DEBNAS_QQ_BOT_NAME=小飞
Environment=DEBNAS_QQ_OWNER_NAME=我
```

保存后：

```bash
sudo systemctl daemon-reload
sudo systemctl restart debnas-web
```

drop-in 存在 `/etc/systemd/system/debnas-web.service.d/override.conf`，
重新部署不会丢。

## 数据与备份

| 路径 | 内容 |
|---|---|
| `/var/lib/debnas-web` | 会话密钥、QQ 图片 / 表情缓存 |
| `/etc/systemd/system/debnas-web.service*` | 服务定义与 drop-in |
| `/etc/pam.d/debnas-web` | PAM 服务定义 |
| `/etc/caddy/Caddyfile` | 反代配置（用了 `--with-caddy` 时） |
| `~/.config/debnas-web/credentials.json` | AstrBot 面板凭据（0600） |
| `~/.config/debnas-portal/prefs.json` | 各账号的主题偏好 |
| `~/.config/<应用>/{env,.env,env.sh}` | API 密钥（0600；余额块会扫这里的 `*_API_KEY`） |

真正需要备份的通常只有 `credentials.json`、你的 Caddy 配置，以及自己加的
systemd drop-in；媒体缓存删了会重新生成。

## 项目结构

```
my-DebNAS/
├── deploy-web.sh          # 部署入口：依赖 → 文件 → systemd → Caddy
├── install-deps.sh        # apt 依赖（可重复执行）
├── install-mihomo.sh      # 按 CPU 指令集安装 mihomo
├── add-http-alias.sh      # 给手机 HTTP 访问加备用 IP
├── web/
│   ├── server.py          # 后端：PAM、会话、RPC、PTY、VNC、静态资源
│   ├── index.html         # 控制台
│   ├── login.html         # 登录页
│   ├── status.html        # 状态页
│   ├── frontend/          # app.js、styles.css、theme.js、字体 / 图标 / xterm / noVNC
│   ├── helpers/           # samba.py、power_sampler.py、autoupdate.sh、vncpass.sh
│   ├── debnas-web.service
│   ├── pam-service
│   └── Caddyfile.snippet
├── VERSION                # 版本号，部署时装到 /usr/local/lib/debnas-web/VERSION
├── CHANGELOG.md
├── NOTICE
└── LICENSE
```

后端 HTTP 接口很少，业务方法都走 `/api/rpc` 分发：`/api/login`、`/api/logout`、
`/api/me`、`/api/rpc`、`/api/exec`、`/api/term`（PTY WebSocket）、`/api/vnc`、
`/api/download`、`/api/qqmedia`、`/api/health`。

## 安全

**登录账号约等于这台 NAS 的管理员。** 控制台没有按用户分级：

- 服务、apt、共享、用户、虚拟机按 root 执行
- 文件页、下载、上传、`file_read` 都以服务进程（root）身份操作任意路径；只有运行
  账号主目录内的写操作会降权。也就是说，任何能通过 PAM 登录的账号都能读
  `/etc/shadow`、别人的家目录，也能往 `/etc` 写文件
- 只有整机重启、重新部署和 `root: true` 的 `/api/exec` 会检查 sudo 组

所以：不要把登录入口给不可信的人；不要直接把 80 / 443 映射到公网；
远程访问用 VPN / Tailscale / 反代加认证。

其他注意：

- 后端默认只监听 `127.0.0.1:8080`，HTTP 80 只对私有网段反代
- 会话 cookie HttpOnly + SameSite=Strict，8 小时过期；除登录 / 注销外写操作要 CSRF。
  HTTP 下没有 `Secure`，密码和 cookie 会明文经过局域网
- 登录失败只有 0.4 秒延迟，没有验证码 / 限速；不要在不可信网络暴露登录入口
- `DEBNAS_WEB_DEV_USER` 会按 TCP 对端免登录。Caddy 反代也来自 `127.0.0.1`，
  **生产环境绝对不能设**
- `/deploy.sh` 是公开安装器，不走登录；不想局域网可下载就删掉
  `/usr/local/lib/debnas-web/static/deploy.sh`
- 新建的虚拟机 VNC 只监听 `127.0.0.1`；QQ 图片 / 表情代理只认本机缓存里的文件名，
  单张上限 12 MB，不接受任意路径
- 「凭据」页只对已登录会话开放；AstrBot 密码从 0600 的
  `~/.config/debnas-web/credentials.json` 读，NapCat token 从 `webui.json` 读。
  页面会把明文交给任何登录账号，和上面「登录账号≈管理员」是同一个前提
- API 余额块同理：任何登录账号都能看到余额，以及「用的是哪家 key、模型、末 4 位、
  endpoint」。密钥明文只在服务端用，不下发浏览器；探测范围是本机环境变量和
  `~/.config/*/{env,.env,env.sh}`，里面的 `*_API_KEY` 会读进内存但不会回传；
  endpoint 是内网地址时只显示「内网端点」。优先放 0600 文件，别写进 unit 的
  `Environment=`（`systemctl show` 可见）
- `install-mihomo.sh` 从 GitHub Releases 直接下载二进制，只走 HTTPS，没有校验哈希；
  README 里的 `curl -fsSLk … | sudo bash` 为自签证书关掉了 TLS 校验。在意供应链就
  在可信网络里先下载、看一眼再执行
- 仓库里不带真实身份：QQ 号、群成员昵称、局域网地址都是环境变量或示例值，默认值
  只有中性占位

如果机器上还有普通 SSH 用户，**强烈建议**在 `/etc/pam.d/debnas-web` 限制只允许
sudo 组登录（这是目前唯一能把「登录≈root」收窄的一层）：

```
account  required  pam_succeed_if.so user ingroup sudo
```

按你的 PAM 配置调整。

### 2026-11 安全审查（本次）

- 新增的 QQ 动态字段不带作者 QQ 号 / 人设名默认值，统一走 `DEBNAS_QQ_*`，
  默认「机器人」「我」
- `portal_redeploy` 不再接受客户端传入的脚本目录：原来可以指向任意目录里的
  `deploy-web.sh` 并以 root 执行，属于本地提权；现在只跑部署时发布的 `/deploy.sh`，
  并要求 sudo 组
- 多厂商余额块沿用 endpoint 脱敏，不下发密钥来源路径，密钥尾号只在长度 ≥12 时
  显示；手动刷新保持 5 秒下限
- `VERSION` 注入 HTML 时按 JSON 转义；静态目录前缀校验补上分隔符
- 仍然保留的设计：登录账号可借文件页 / 下载 / 上传 / 用户管理以 root 操作任意路径，
  见本节第一条；没有用户级沙箱，也没有自动化测试

## 已知限制

**平台**

- 没有自动化测试；Debian 12 未测试；只支持 x86_64
- 网络修改依赖 NetworkManager（`nmcli`）

**文件与终端**

- 终端断线 / 刷新后是全新会话；服务重启会清空所有终端
- 文件页不是用户级沙箱；跨用户目录可能产生 root 属主文件
- 上传单文件上限 16 GiB；超大文件或断点续传建议走 SMB

**QQ 动态**

- 只读插件的 `history.jsonl` 和 `members.json`，默认最近 24 小时、最多 400 条；
  群聊 / 私聊各显示最近 40 条。时间只认插件记录的毫秒值，不再从会话库推时间，
  所以会话库里有、插件日志没记的消息不会出现
- 她发出去的图片 / 表情包靠读 AstrBot 的 systemd 日志反推，日志取法依次试
  `--file` / `--user-unit` / `--user`，都读不到时只剩 `stickers.json` 的
  `lastUsedAt` 兜底；表情包要对得上时间点才显示，仍可能缺几条
- 系统表情读的是本机 QQ 客户端的缓存，换 QQ 版本或清缓存会掉图
- 群成员头像由浏览器直接向 `q1.qlogo.cn` 请求（URL 里带 QQ 号），会向腾讯暴露
  访问者 IP；加载失败自动退回首字方块
- AstrBot / NapCat 要自己安装并监听 6185 / 6099；凭据页只做展示，AstrBot 面板改密后
  要手动同步 `credentials.json`

**虚拟机与其他**

- 虚拟机控制台只支持 VNC；向导没有 UEFI / TPM，Windows 11 要手动改 XML
- 磁盘扩容只扩虚拟盘，guest 内还要自己扩分区
- 容器操作依赖运行账号的 rootless podman
- 界面是 M3E 风格的 CSS 实现，不是 Google 官方组件库，组件细节不保证与规范逐条对齐
- API 余额块只显示余额，不做充值和用量明细；能查余额的只有 DeepSeek / Moonshot /
  SiliconFlow / OpenRouter，别家只显示厂商与模型
- 不包含 RAID 编排、相册、影音套件、Portainer 替代

## 开发与排错

改完做一遍语法检查：

```bash
python3 -m py_compile web/server.py
node --check web/frontend/app.js
node --check web/api-web.js
node --check web/cockpit-shim.js
bash -n deploy-web.sh install-deps.sh install-mihomo.sh add-http-alias.sh
```

没有测试，欢迎补测试和 PR。常见问题：

| 现象 | 先看 |
|---|---|
| 502 / 打不开 | `systemctl status debnas-web caddy` |
| 登录失败 | `/etc/pam.d/debnas-web` 是否存在 |
| 终端空白 | `/xterm/xterm.js` 是否 200，浏览器控制台报错 |
| 虚拟机未就绪 | `systemctl status libvirtd` |
| mihomo API 不可达 | `/etc/mihomo/config.yaml` 的 `external-controller` / `secret` |
| 凭据页显示「（未配置）」 | `~/.config/debnas-web/credentials.json` 是否存在、0600 |
| 左侧 QQ 动态空白 | AstrBot 是否在跑，`history.jsonl` 是否有新记录 |
| 动态里有消息但没图 | 插件 `media/` 或 `data/temp` 里的原图是否还在，`/var/lib/debnas-web/media/` 是否可写 |
| 群成员头像不显示 | `members.json` 里有没有这个昵称，`q1.qlogo.cn` 是否可达 |
| 她发的表情包 / 图片不出现 | `journalctl --user-unit astrbot.service` / `journalctl --user -u astrbot` 能不能读到 |
| 余额块显示「这家没有公开的余额接口」 | 该厂商不在 DeepSeek / Moonshot / SiliconFlow / OpenRouter 里，key 和 endpoint 是否识别对 |
| 版本显示 `unknown` | `VERSION` 是否随部署装到 `/usr/local/lib/debnas-web/VERSION` |
| 改了环境变量没生效 | 是否用了 drop-in，`systemctl show debnas-web -p Environment` |

日志：

```bash
sudo journalctl -u debnas-web -n 100 --no-pager
sudo journalctl -u caddy -n 50 --no-pager
```

## 来源与许可

- [DebNAS](https://github.com/kekylin/debnas)（GPL-3.0）：项目起点与场景参考，不是 fork
- AstrBot、NapCat：外部部署的 QQ 机器人 / 协议端，仓库只展示状态与凭据，不分发它们
- Cockpit / cockpit-file-sharing / cockpit-identities：早期界面参考，运行时不依赖
- Debian swirl（Debian Open Use Logo License）、xterm.js（MIT）、
  noVNC（MPL-2.0 / BSD / CC-BY-SA）、Inter 与 Noto CJK（OFL）
- Debian、libvirt、QEMU、Samba、Caddy、mihomo 等上游项目

完整信息见 [`NOTICE`](NOTICE)。
仓库不包含 AstrBot / NapCat 的代码，也不下载它们的资源；QQ 系统表情直接读本机
QQ 客户端的缓存图片，表情包按插件 `stickers.json` 里的地址取一次后缓存在本机。

## 许可

本项目按 **GPL-3.0** 分发，见 [`LICENSE`](LICENSE)。

---

**再次说明：这是 vibe coding 产物。** 可以参考、可以自用，但请自己判断，
不要默认它已经过审计。
