# 变更记录

## 2026-11-12（移除 AstrBot / NapCat 残留代码，版本 0.2.6）

### 清理

- `web/server.py` 删掉约 17.6 KB AstrBot 时代的死代码：
  - 路径类：`_astrbot_history_path` / `_astrbot_media_dir` / `_astrbot_temp_dir`
  - 数据类：`_astrbot_feed` / `_astrbot_live_feed` / `_sent_sticker_feed` /
    `_journal_sticker_sends` / `_sticker_last_used` / `_sticker_catalog`
  - 缓存类：`_cache_local_image` / `_cache_received_image` / `_RECEIVED_IMAGES`
  - 解析类：`_journal_commands` / `_parse_journal`、`_JOURNAL` 与相关正则常量
- `_qq_image` 不再读 AstrBot 的 media 目录，只查 debnas 自己的缓存
- 余额面板不再读 `astrbot-src/data/cmd_config.json`，没有模型清单来源时留空
- 删掉不再使用的 `import glob`；全仓只剩 CHANGELOG 历史记录还提到 AstrBot / NapCat

### 安全

- 恢复 0.1.0 安全审查里被回退的几处修复：
  - `portal_redeploy` 重新固定只跑部署时发布的 `/deploy.sh`，并恢复 sudo 组校验；
    客户端再传 `source` 也不会指向任意目录里的 `deploy-web.sh`（原先是本地提权）
  - 余额块恢复 endpoint 脱敏、不下发密钥来源路径，密钥尾号只在长度 ≥12 时显示，
    手动刷新恢复 5 秒下限
  - `VERSION` 注入 HTML 时恢复 JSON 转义（`<` → `\u003c`），静态目录前缀校验补回
    分隔符
  - 恢复 `deploy-web.sh` 等 6 个脚本的 `100755` 执行位（0.2.x 改动中掉成了 `100644`），
    新增的 `install-navidrome.sh` 也按 `0755` 入库
  - 复核 QQ 媒体代理新增的 `?u=` 远程链接：只放行 `qpic.cn` / `qq.com` / `qq.com.cn`

### 文档

- README 按 0.2.6 现状重写：QQ 消息改 OneBot + SnowLuma，补 Navidrome 音乐库、
  环境变量表、备份路径、安全说明与排错表
- README / NOTICE / systemd 描述里的项目自称统一为 `my-debnas`（上游仍称 DebNAS）

### 验证

- `py_compile` 通过
- QQ 消息 93 条正常；图片（217 KB）、表情包、系统表情代理都还能取
- 余额查询正常（providers=1）
- `node --check` / `bash -n` 通过；`git diff --summary` 无模式变更

## 2026-11-12（修复群聊空白，版本 0.2.5）

### 修复

- **群聊标签空白、私聊正常**：0.2.4 首页和左栏会同时请求同一个 RPC，两条线程各自去拉
  OneBot 历史；群那条请求（50 条约 1.5 秒）在高并发下容易超时，整个群被跳过。随后合并
  逻辑只补「最近 5 秒」的桥接缓存，群聊消息是几天前的，于是被整段过滤掉
- **串行化**：加 `_QQ_HISTORY_LOCK`，同一时刻只允许一个线程刷新，锁内再查一次缓存
- **按会话回退**：记录本次成功覆盖的会话 `covered`；没覆盖到的会话整段用
  `social-v2.json` 兜底，单次超时不会再让某个会话消失
- **超时**：群 / 私聊历史请求从 8 秒放宽到 10 秒
- **补群**：用 `get_group_list` 把桥接状态里还没记录的群也纳入拉取，进群后没说过话
  也不会漏
- 版本号 0.2.5

## 2026-11-12（改名「QQ 消息」并载入最新历史，版本 0.2.4）

### 变更

- **标题**：左栏、首页面板、`aria-label` 从「QQ 动态」改为「QQ 消息」
- **数据源加一层 OneBot 历史**：`get_group_msg_history` / `get_friend_msg_history`
  每会话拉最近 50 条，带真实昵称（群名片优先）、QQ 号、消息段（文本 / 图片 / 表情 /
  @ / 语音 / 视频占位）；私聊昵称走 `get_stranger_info`（缓存，失败不缓存空值）
- **合并去重**：历史为主，桥接 `social-v2.json` 只补最近 5 秒内、还没进 QQ 历史的
  本地发送；按 `message_id` 与「会话 + 方向 + 文本 + 分钟」双重去重，图片 / 表情
  占位文本不参与比较
- **兜底**：OneBot 不通时自动退回桥接缓存，消息栏不会空白
- 版本号 0.2.4

## 2026-11-12（QQ 消息栏显示图片 / 表情包，更新页去掉容器块，版本 0.2.3）

### 新增

- **QQ 动态渲染媒体**：`recentMessages` 里的图片、表情包、系统表情都显示出来
  - 图片：按文件名调 OneBot `get_image` 换一条未过期链接再下载，字节按文件名缓存
    （消息里的 rkey 几十分钟就失效，实测 `retcode -5503007`）
  - 表情包：`[表情包:描述]` 回查 `stickers.json` 的 `p.qpic.cn` 链接
  - 系统表情：读 SnowLuma 容器卷里的 `sys-face-catalog.json`
  - `/api/qqmedia` 新增 `kind=sticker` 与 `?u=` 远程链接；只放行
    `qpic.cn` / `qq.com` / `qq.com.cn`，按 URL 哈希或文件名落盘缓存
- **前端 `qqText`**：媒体有图时去掉 `[图片]` / `[表情包:…]` 占位；表情包用
  `qq-sticker` 96px 展示，多图最多 4 张，加载失败回退占位符

### 移除

- **更新页「组件」块里的 SnowLuma 容器行**：镜像、状态、查看口令一起删掉，
  连同 `API.containers` / `API.vncPassword` 的前端调用与 `data-vnc` 处理
- 上一条已经拿掉的「拉取镜像」不再重复

### 文档

- README 的更新页、QQ 动态、API 表三节按现状改写；版本号 0.2.3

## 2026-11-12（QQ 消息栏改接 SnowLuma，移除镜像拉取，版本 0.2.2）

### 变更

- **QQ 动态数据源**：不再读已被删除的 AstrBot `history.jsonl`，改读
  `~/fish/qq-bridge/state/social-v2.json` 的 `conversations[*].recentMessages` ——
  reserved2 模式按会话保留最近收发消息，带发送者、QQ 号、毫秒时间；图片 / 表情
  只留 `[图片]` / `[表情包:…]` 占位，不再代理会过期的 QQ CDN
- **`rpc_qq`** 改调 `_snowluma_live_feed()`，输出字段（chat / dir / who / uin / ts /
  text / media）保持不变，前端零改动
- **更新页去掉「拉取镜像」**：删掉组件行里的按钮、点击处理、`API.pullImage`、
  `rpc_pull` 与 `pull` 路由
- README 的 QQ 动态、环境变量、排障三节按新数据源改写；版本号 0.2.2

## 2026-11-12（重新接入 SnowLuma / noVNC，版本 0.2.1）

QQ 机器人从 AstrBot + NapCat 切回 SnowLuma + qq-bridge 后，控制台的应用卡片和
「凭据」页还指着已经删掉的 AstrBot / NapCat，这一版按现状改回来。

### 变更

- **应用卡片**：`APP_DEFS` 去掉 AstrBot（6185）/ NapCat（6099），加回 SnowLuma（5099），
  noVNC（6081）保留；两张卡都按容器名 / 发布端口 / 页面标题自动识别
- **凭据页**：换成三张卡 —— SnowLuma 控制台、noVNC 远程桌面、OneBot 接口，
  沿用原来的 `credCard` / `credRow` 布局（地址、口令、登录方式、复制 / 显示）
- **凭据来源**：不再读 `~/.config/debnas-web/credentials.json`（AstrBot 密码已失效），
  改为每次请求实时读 rootless podman 卷里的 `config/vnc-password`、
  `config/onebot.json` 的 `accessToken`、`config/webui.json`；
  `DEBNAS_SNOWLUMA_DATA` 可以指向别的数据目录
- **`rpc_apps`**：删掉 AstrBot / NapCat 的兜底探测（进程已不存在）

### 文档

- README 的应用卡片、凭据页两节按现状改写；版本号 0.2.1

## 2026-11-11（Navidrome 音乐库，版本 0.2.0）

首页多一块「音乐库」，把本机原生部署的 Navidrome 接进控制台。没有用容器，
服务以 NAS 账号的 systemd 用户单元常驻。

### 新增

- **音乐库横条**：状态（运行中 / 扫描中 / 已停止 / 启动失败 / 未安装）、
  曲目 / 专辑 / 艺人 / 占用、音乐目录、最近扫描时间、版本；按钮是打开、重启、停止 / 启动
- **`rpc_music`**：只读打开 `~/navidrome/data/navidrome.db` 的 `library` 表拿统计，
  不碰 Navidrome 的登录态；服务状态走 `systemctl --user is-active`，root 常驻时用
  `sudo -u <运行账号>` 切到目标用户的会话总线
- **`rpc_music_action`**：只接受 `start` / `stop` / `restart`，参数非法直接拒绝
- **应用列表认原生服务**：以前只枚举 podman 容器，原生服务永远进不了「应用」；
  现在 `rpc_apps` 额外探测本机常驻端口（Navidrome 4533），端口在听就出卡片
- **`install-navidrome.sh`**：按 x86_64 拉官方 `linux_amd64.tar.gz`（默认 gh-proxy
  镜像，`DEBNAS_GH_PROXY` 可覆盖），核对大小、解压、写配置和用户单元、开 linger，
  已有配置不覆盖；`--check` 只看不装
- `deploy-web.sh` 把 `install-navidrome.sh` 一起打进 `/deploy.sh` 安装器，并复制到
  `/usr/local/lib/debnas-portal/`

### 改动

- **首页重排**：
  - 应用改成通栏，卡片按 280px 自适应列：桌面 3 张一行，≤980px 两列，≤560px 单列
  - 音乐库从整块统计卡改成横向媒体条：图标 + 状态 + 一行曲库统计 + 右侧操作，
    空库提示收成一条小字
  - 最近共享 / 网络流量 / 功耗 并成一行三栏（≤980px 两栏、≤720px 单栏），
    图表跟着面板等高拉伸
  - 去掉 `.home-grid` / `.col-main` / `.col-side` 的双栏骨架
- `APP_DEFS` 增加 Navidrome（4533、音乐图标、`icons/navidrome.svg`）
- `api-web.js` 增加 `music()` / `musicAction(action)`
- 环境变量：`DEBNAS_NAVIDROME_PORT` / `_HOME` / `_BIN` / `_DB`
- 版本号 0.1.0 → 0.2.0

### 说明

- 曲库统计只认本机 SQLite；换成 PostgreSQL 时面板只显示运行状态
- 面板不提供曲库管理（用户、播放列表、转码），这些仍在 Navidrome 自己的界面里

## 2026-11-10（版本基线 0.1.0）

仓库原来没有版本号，`/usr/share/cockpit/debnas-portal/VERSION` 那是旧 Cockpit
插件留下的，跟这边没关系。现在建立自己的基线：

- 新增 `VERSION`，从 `0.1.0` 起；`deploy-web.sh` 会把它装到
  `/usr/local/lib/debnas-web/VERSION`
- `rpc_info()` 多返回一个 `version`，右侧「系统」块显示成
  `内核 7.2.12+deb13-amd64 · DebNAS 0.1.0`
- 读不到文件就返回 `unknown`，页面不会显示 `DebNAS unknown`
- 余额块的标题从服务商名 `DeepSeek` 改成 **「鲸鲸的零花钱」**（`DS_TITLE` 常量），
  服务商 / 端点 / 密钥仍显示在下面的探测行，不影响判断走的是哪家
- 余额块**多厂商适配**，并且**每家都标注模型**：
  - 后端 `_API_BALANCE` 表按前缀分派，目前能查余额的：DeepSeek（`/user/balance`）、
    Moonshot（`/v1/users/me/balance`）、SiliconFlow（`/v1/user/info`）、
    OpenRouter（`/api/v1/credits`）
  - 没有公开余额接口的（OpenAI / Anthropic / Gemini / xAI / 智谱）不再直接报错，
    而是照样显示名字、模型、端点、密钥尾号，下面写「这家没有公开的余额接口」
  - 模型名从 AstrBot 的 `cmd_config.json` 里读：先按密钥尾号匹配 `provider_sources`，
    再按 base host 匹配，最后看环境变量 `<厂商>_MODEL`；读不到就留空
  - `rpc_deepseek` 现在返回 `providers[]`，每项含 `name/model/endpoint/key/items/available/error`，
    顶层 `provider/items/available/ok` 保留，老前端不会炸
  - 前端每家一块：`名字 [模型] —— 余额`，下面一行「充值 / 赠送」，再下面是端点和密钥尾号
- 「系统信息」里的**界面版本**以前永远显示 `dev`：`window.__DEBNAS_BUILD` 全仓库
  没有任何地方给它赋过值，`esc(... || "dev")` 就一路退到兜底。现在 `serve_static()`
  在 `index.html` 的 `<head>` 里注入 `window.__DEBNAS_BUILD="0.1.0"`，前端再拿
  `info.version` 兜一层，彻底不会出现 `dev`

## 2026-11-10（群成员自动嗅探）

### 新增

- **群成员头像自动嗅探**：插件启动 8 秒后调一次 NapCat 的 `get_group_member_list`，
  把「群名片 / 昵称 → QQ 号」写进 `plugin_data/astrbot_plugin_feiyu/members.json`；
  之后有群消息、且距上次超过一小时，再静默嗅一次
- 实测一次就拿到 8 条映射，包括「光之锯人」这种从来没说过话的成员，
  不用等谁开口，也不用在代码里写死 QQ 号
- debnas 侧 `_astrbot_feed()` 读这张表补 `uin`，优先级：
  `history.jsonl` 里的 `uid`（最准）→ `members.json` → `@昵称(QQ号)` → `爸爸/大肥鱼` 固定值

## 2026-11-10（群聊成员头像）

### 新增

- 群聊里每个人的真实头像：插件写 `history.jsonl` 时多记一个 `uid`（发送者 QQ 号），
  debnas 用它拼 `q1.qlogo.cn` 的头像 URL；私聊本来就有号，这次一起统一了
- 老记录没有 `uid`，用消息文本里的 `@昵称(QQ号)` 反推一个「名字 → QQ 号」的映射
  兜底，所以今天之前的聊天记录也能显示头像（妃爱 / 迪迦奥特曼 / 爸爸 都对上了）
- 头像加载失败（内网访问不到 qlogo）会自己退回首字方块，不会留一个破图

## 2026-11-10（会话库不再自己造条目 + 静态资源指纹）

### 修复

- **图片的时间是编出来的**：页面上 18:59 那张 Minecraft 截图实际是 20:08 发的，
  接口里根本不存在这条（`_astrbot_live_feed()` 返回 203 条，群聊 96 条里带图片的
  0 条）。唯一能造出这种条目、还自带 base64 图片的数据源就是「会话库还原」
  ——`_astrbot_db_feed()` 没有真实发送时间，它拿消息里的 `Current datetime` 锚点
  往后顺延算，算歪了整段就错位。现在会话库**只能给已存在的日志条目补图片**，
  对不上的一律丢弃，时间只认插件日志的毫秒真值
- **改了代码但页面没变**：HTML 是 `no-store`，可里面的 `./app.js`、`./styles.css`
  没有版本号，浏览器拿 ETag 校验后可能一直用旧文件。现在服务端在返回 HTML 时
  给这两个 URL 打上文件 mtime 指纹（`?v=<mtime>`），部署一次 URL 就变一次，
  旧脚本不可能再被跑起来；HTML 本身也改成不参与 304

### 变更

- `_astrbot_feed()` 保留 400 条（原 80 条），群聊/私聊各取自己的 40 条
- **整个会话库数据源已删除**：`_astrbot_db_feed()`、`_DB_FEED` 缓存、
  `_astrbot_db_path()` 一共 134 行，连同不再用的 `import sqlite3`。
  留着「只补图不给时间」的口子照样会被人当成可用数据源，不如一次删干净；
  QQ 动态现在只有插件日志这一个来源

## 2026-11-10（群聊图片 + 窗口加大）

### 修复

- **群聊 / 私聊里都没有图片**：插件 `_append_history()` 只记文本，图片段直接丢了
  （`history.jsonl` 里群聊 275 条、带 `media` 的 0 条）。现在 `gate()` 把收到的
  图片段存到 `plugin_data/astrbot_plugin_feiyu/media/<内容md5>.<ext>`，
  `after_sent()` 也把她自己发出去的图片记下来；纯图片消息记成 `[图片]`
- **时间跳来跳去**：`_astrbot_feed()` 只取合并后的最后 80 条，群聊和私聊抢这
  80 个位置，每个会话实际只剩三四十条，中间被整段截掉，看起来就是时间断档。
  现在取 400 条，前端按会话各取 40 条再显示

### 待确认

- 用户反馈"时间是乱的"，我核对 `history.jsonl` 与 AstrBot 发送日志是逐秒一致的，
  但没能看到用户屏幕上的实际渲染结果，需要一张截图或一条具体对不上的消息

## 2026-11-10（群聊 / 私聊分开）

时间对不上的根子不是数据错，是**群聊和私聊混在一条时间线里交叉**：她 20:15
在群里说一句、同时在私聊里回一句，两条挨着出现，看上去就像时间跳了。

### 变更

- QQ 动态拆成两条独立的流，左栏顶部和首页面板各有两个标签：
  `群聊 N` / `私聊 N`（N 是去重后的条数）
- 选中的会话单独按 `ts` 升序渲染，群聊里不会再出现私聊的消息，反之亦然
- 选择记在 `localStorage`（`debnas.qq.scope`），刷新/切换页面都保持
- 左栏的标签塞在 sticky 标题里，往下翻也点得到；首页面板的标签放在标题下面
- 去掉上一版加的「群聊/私聊」分隔条 —— 分开之后用不上了

### 核对过的时间

拿 `history.jsonl` 和 AstrBot 日志里的 `Prepare to send` 对过，秒级一致：

```
20:14:39 发来 我也看看          ↔ 20:14:39.679 Prepare to send
20:15:35 反方向的钟 配周杰伦的封面 ↔ 20:15:35.321 Prepare to send
20:15:38 我没发 是他们俩在推      ↔ 20:15:37.905 Prepare to send
```

## 2026-11-10（QQ 动态重做）

前面几轮都在打补丁（前端补排序、服务端补字段），没找到真正原因。这次把整条
链路拆了重写：**取数 → 排序 → 去重 → 渲染，只剩一个入口**。

### 重做

- `_astrbot_live_feed()` 收尾统一做三件事，别再指望各个数据源自己排好：
  1. 按 `ts` 排序后，再按「同会话 + 同方向 + 同秒 + 同文本前 80 字」过一遍，
     重复的直接丢；
  2. 给每条生成**稳定 id**（`chat|dir|ts|文本前 40 字`），前端按 id 去重，
     刷新时不会因为数组下标变动而重复追加；
  3. 补齐 `hm`（HH:MM）和 `scope`（群聊 / 私聊）
- 前端新增 `feedCanonical()`：**唯一的取数口**。先按 `ts` 数值升序（不是
  `HH:MM:SS` 字符串，否则跨午夜会把 `00:xx` 排到最前），再按 id 去重，
  左栏和首页面板都从它拿数据，不再各自跑一套循环
- `feedRows()` 重写渲染：日期分组、**群聊 / 私聊切换处分隔**、间隔超 10 分钟
  插时间点、每条气泡右下角标 `HH:MM`，顺序对不对一眼能核对
- 首页面板 `<1400px` 才渲染（`feedInGutter()`），左栏能显示时首页不再画一遍；
  窗口跨 1400px 缩放会重新渲染当前页

### 为什么之前"还是乱"

- 会话库推出来的时间可能和插件日志差很大，旧逻辑 180 秒内才认作同一条，
  超了就当成两条 —— 同一条消息在时间线两头各出现一次
- 群聊和私聊的消息本来就在同一个流里交替出现，之前没有任何分隔或标注，
  看上去像是"顺序乱了"，其实是两个会话在交叉

## 2026-11-10（QQ 动态重复与顺序）

### 修复

- **同一条消息在栏里出现两次**（一条在顶上、一条在底下）：插件日志和会话库
  都会记到同一条消息，合并时按「同会话 + 同方向 + 文本前 80 字 + 180 秒内」
  去重。会话库的时间是从分钟级锚点推的，偏出 3 分钟就配不上，于是同一条消息
  留了两份，各自带着不同的时间戳插到时间线两头。现在配对窗口放到 **6 小时**
  并挑时间最接近的那条，同一条消息只留插件日志那份（毫秒级真时间）
- **首页面板和左侧栏同时画同一份列表**：`.qq-panel.inline-only` 本来靠
  `@media (min-width: 1400px)` 隐藏，但窗口在边界附近缩放、或首屏与 resize
  时序错开时会两边都在。改成 JS 也判断 `feedInGutter()`，左栏能显示时首页不再
  渲染面板；跨 1400px 缩放时重新渲染当前页
- **会话库补缺断了一个多小时**：19:42 那次改动把
  `provider_settings.datetime_system_prompt` 关了，而会话库的时间锚点完全依赖
  消息里的 `Current datetime`，关掉之后 `_astrbot_db_feed()` 直接返回 0 条。
  已在 `astrbot-src/data/cmd_config.json` 里重新打开并重启 AstrBot
  （只对新消息生效，历史对话要等下一轮才有锚点）
- **表情包条目缺 `date`**：前端按 `date` 切「今天 / 昨天」分组，缺了会在时间线
  中间插一个「最近」分组，看着像顺序断了；同时补上 `who` / `uin`，头像不再显示成 `?`

### 变更

- 前端渲染前统一按**数值 `ts`** 升序排一遍（`feedAscending()`），不再假设后端一定
  排好；注意不能用 `HH:MM:SS` 字符串排，跨午夜时 `00:xx` 会被当成最早

## 2026-11-10（新增 DeepSeek 余额块）

- 右侧栏 mihomo 块下面新增 DeepSeek 余额块：显示账户余额、充值 / 赠送明细和更新时间，
  每 60 秒自动刷新，也可以点「刷新」立即查；点右上角箭头收起，状态记在 `localStorage`
- 余额由 debnas 后端代查（`POST /api/rpc` 的 `deepseek`，服务端缓存 60 秒，失败 15 秒后
  重试），密钥只从环境变量 `DEEPSEEK_API_KEY` 或 `~/.config/deepseek/env` 读，
  不下发到浏览器
- 接口不通 / 没配密钥时块里直接显示原因，不会把控制台搞崩
- 自动探测用的是哪家 API：扫环境变量和 `~/.config/*/{env,.env,env.sh}` 里所有
  `*_API_KEY`，按 DeepSeek → OpenAI → Anthropic → … 的优先级挑一个，配合
  `<NAME>_BASE_URL` / `<NAME>_API_BASE` 认 endpoint；块标题直接用探测到的名字，
  下面一行显示 endpoint 和密钥末 4 位。不是 DeepSeek 端点时如实说明「没有
  /user/balance 余额接口」，不硬编成某个厂商

## 2026-11-10（消息栏：时间、图片与表情）

### 修复

- 消息栏时间错乱：会话库里的时间只有 `<system_reminder>` 的分钟级精度，早期代码在
  找不到提醒时退回 `conversations.updated_at`（整段会话最后写入的时间）并逐条 +1 秒，
  整段聊天被顶到「最后一条消息的时间」，列表里出现一串未来时间且和插件日志重复。
  现在时间只认提醒锚点，没锚点的消息直接跳过；合并时以插件日志的毫秒时间为准，
  会话库只用来补日志里缺的消息
- 她发出去的图 / 表情包不显示：她发图走的是 AstrBot 的 `sticker_send`（参数 `sticker_id`）
  和 `send_message_to_user`（参数里 image 的 `path` / `url`），都是直接发送，不进消息链
  也不进会话库。改为只读 AstrBot 用户日志反推发送记录，会话优先取工具结果里的
  `Message sent to session ...`；图片缓存在 debnas 自己的 `media/`，日志读不到时退回
  `stickers.json` 的 `lastUsedAt`
- GIF 被抽成静态帧：会话库里的 `image_url` 是发给模型的那份 JPEG（GIF 只剩一帧），
  改为优先读 `data/temp/media_image_*` 原文件，GIF 保留动画；原文件被清掉才退回 base64
- 收到的图片不再依赖插件存图：改为从会话库的 `image_url`（base64 data URL）和
  `data/temp` 原文件取；引用消息里的图和工具产出的图（B 站抽帧）会被排除
- 她发的东西要手动刷新才出现：前端判断「消息流有没有变」原来只比条数和最后一条的
  时间，而她发的图带的是工具调用时间、会插在中间，条数又封顶 80，于是永远判定没变。
  改成比对最近 40 条的时间 + 方向 + 图片名 + 文本摘要
- 认她的发送记录太慢：日志取法加了 `--file` / `--user-unit` / `--user` 三种，
  root 读不到用户 journal 时不再整段丢失
- `stickers.json` 的 `lastUsedAt` 从「日志读不到才用」改成一直当第二来源，
  和日志里已认出的记录按 180 秒去重
- 配合 AstrBot 侧「按 QQ 号给主人消息加 `【管理员】` 标记」的改动：消息栏渲染前
  去掉这段前缀，面板里不留标记噪音

### 性能

- 消息流刷新：前端轮询 12 秒 → 3 秒，服务端缓存 8 秒 → 1 秒；实测新消息 2.4 秒上屏
  （之前要十几秒，还得手动刷新）
- 日志改增量读：第一次读 24 小时，之后只读「上次位置 -2 秒」，单次解析从 560ms
  降到 13ms，所以日志缓存能从 15 秒压到 2 秒
- AstrBot 会话库按「库文件 + WAL 的 mtime/大小」缓存 5 秒，没写库就不重复解析
  那 2MB（里面是 base64 图片）

### 恢复

- `astrbot_plugin_feiyu/main.py` 恢复成改动前的版本，AstrBot 侧不做任何修改

## 2026-11-10（移除 SnowLuma 集成）

### 移除

- QQ 动态不再解析 SnowLuma 容器日志：删掉 `web/helpers/qqfeed.sh` 与 `_qqfeed_legacy()`，
  只读 `astrbot_plugin_feiyu` 的 `history.jsonl` 和 AstrBot 会话库
- 容器「更新」入口 `rpc_container_pull`（按名字找 snowluma 容器）及其路由
- `vncpass.sh` 的 `snowluma` 默认容器名，现在必须显式传容器名
- `web/frontend/icons/snowluma.png`、`.gitignore` 的 logo 规则、NOTICE 的 SnowLuma 段

### 变更

- 图片 / 表情代理 `/api/qqmedia` 改为读本机缓存：图片来自插件新存的 `media/` 目录，
  表情来自 QQ 客户端的 `EmojiSystermResource/<id>/png`，不再依赖 SnowLuma 的
  `get_image` / `fetch_face_entity`
- 插件收到图片时按 md5 存一份（每条最多 4 张）写进 `history.jsonl` 的 `media` 字段，
  控制台据此显示缩略图；工具产出的图片（B 站抽帧）不进消息链，也不会显示
- `rpc_vnc` 使用前端传来的容器名，不再写死 `snowluma`
- README 的 QQ 动态、应用入口、环境变量、故障排查各节按现状改写
- `deploy-web.sh` 不再处理 SnowLuma logo，也不再安装 `qqfeed.sh`

## 2026-11-08（仓库清理）

### 移除

- `legacy-i18n/`：旧 Cockpit 页面汉化层，早已不再部署
- `web/frontend/index.html`：旧版重复入口，部署实际使用 `web/index.html`
- `web/helpers/build-harness.py`：面向旧 Cockpit 页面的测试台生成器，已失效
- 生成物 `__pycache__/`、`.gitignore` 里 `portal/test/` 的陈旧规则

### 变更

- README 目录树与 NOTICE 的第三方说明去掉已删除的 i18n 内容
- 同步更新上传版仓库（不含 SnowLuma logo）

## 2026-11-08（后端补齐：共享 / 用户 / 网络 / 文件 / 容器）

### 修复

- 共享保存、删除、全局配置一直失败：后端把 JSON 塞进 stdin，而 `samba.py` 读的是
  `sys.argv[2]`，helper 每次都返回「缺少参数」。现在按 helper 的约定传 argv，
  并把 helper 的 `{"ok": false}` 翻译成 RPC 错误
- 命令型 RPC 返回 `{ok: false}` 时前端仍当成功（新建共享会弹「已保存」但 smb.conf 没变）。
  `api-web.js` 的 `rpc()` 现在统一抛错，服务启停、文件删除等失败不再假装成功
- 文件页下载调用了不存在的 `API.fileBase64`；新增 `file_read` RPC（单文件上限 64 MB）
- 网页上传大文件只报 `[object ProgressEvent]`：FileReader 一次读整个文件，超大文件读取会被中止；
  改为 1.25MB 分片上传（`upload_start` / `upload_chunk` / `upload_finish` / `upload_abort`），
  单文件上限 16 GB
- 上传进度条改为页面顶部整行（导航栏上方），不再用右下角浮层遮挡内容：
  文件名、百分比、已传/总量、实时速度、剩余时间，可随时取消；同一时间只允许一个上传任务
- 手机端适配：顶栏是 fixed 60px，进度条改为挂在顶栏下方并吸顶，
  标题/文件名自动分行，取消按钮加大点按区域，同时把 Toast 下移避免互相遮挡
- 文件页粘贴入口补齐：剪贴板有内容时工具栏出现「粘贴」按钮；
  右键菜单从只认文件列表扩大到整个文件工具区，空白处也能弹「粘贴」；
  手机长按 550ms 弹出同一套菜单，长按后不会误触发打开/下载
- 下载改为 `/api/download` 流式输出，浏览器自带进度，不再受 64MB base64 上限和内存占用限制
- 存储页 SMART 一直显示「未知」：`smartHealth` 返回的是整张表的对象，页面却按字符串比较；
  现在按设备映射 PASSED / FAILED / UNAVAILABLE，并在悬停提示温度、通电时间和错误信息
- SMART 读取改用 `smartctl -a -j`；USB 桥接盘读不到时自动重试 `-d sat`；
  权限不足或设备不支持不再误报成 FAILED
- 用户页「管理组」调用了不存在的 `API.listGroups`；补齐并只列出可管理的普通组
- 上传 / 新建目录落在运行账号主目录时，不再产生 root 属主文件（自动切回该账号执行）
- 主目录里存在 root 属主子目录（如 `~/rom`）时，新建文件夹会报 Permission denied：
  现在先以账号本人执行，遇到权限错误自动回退 root，并把新建目录 chown 回账号本人
- 文件页把文件行也做成了目录按钮：点文件名会把文件路径再拼一次，出现
  `...zip//...zip` 的 `ls` 错误；现在只有目录可进入，点文件名直接下载，`listdir` 也会拒绝非目录

### 新增

- 用户与组：新建 / 删除用户、系统密码、Samba 密码、`chage` 密码策略、建组 / 删组
- SSH：读取、追加、删除 `authorized_keys`；校验公钥格式并保持 0700 / 0600 权限
- 网络：读取 NetworkManager 连接与 IPv4 详情，修改地址 / 前缀 / 网关 / DNS，连接 / 断开网卡
- Samba：导出 `smb.conf`；导入时自动备份，`testparm` 校验失败回滚
- 容器：拉取 SnowLuma 镜像并重启容器
- 重新部署：`portal_redeploy` 通过 `systemd-run` 延迟执行部署脚本，接口先返回
- 特权命令统一走 `as_root()`：服务以 root 运行时直接执行，以普通用户运行时用 `sudo -n`

### 变更

- 共享页「全局配置」改为真实读取 `[global]`，不再显示空壳默认值
- 网络对话框的子网前缀会带出当前值，不再固定 24
- 文件页右键菜单：打开 / 下载、剪切（移动）、复制、粘贴、粘贴到此处、重命名、删除；
  空白处可粘贴、新建文件夹、上传、刷新；剪切中的行半透明提示
- 后端 `fs_action` 新增 `copy` / `move`，移动用 `mv -T`，目标已存在时明确报错

## 2026-11-08（左侧 QQ 消息栏修复）

### 修复

- 左侧栏消息气泡横向溢出被裁切：给气泡加 `min-width: 0` / `max-width: 100%`，
  长回复和网址在窄栏内正常换行，栏位不再出现横向滚动
- 自己发出的消息恢复右对齐（`.gutter-row.out`）
- 左侧栏重渲染时不再跳回顶部：贴着底部会自动跟随最新消息；往上翻后保留当前位置；
  图片/头像加载撑高内容时也会继续贴底
- 紧凑模式去掉 `[回复 ...]` 引用前缀，只显示正文，避免窄栏里出现大段引用
- `qqfeed.sh` 合并「INFO 发送行」和「[自身] 群事件」时改为比较去掉引用后的正文，
  并保留机器人昵称，修复同一条消息显示两次、发送者变成群号的问题
- 隐藏左侧栏常驻滚动条：原来 12px 的灰色槽位在留白里很突兀，现在滚轮/触控板照常滚动，
  内容宽度也多出约 10px

## 2026-11-08（顶栏重启按钮）

### 新增

- 顶栏头像左侧新增电源按钮（桌面 / 手机都显示），点击后弹出确认框
- 确认后 2 秒再重启，浏览器先收到响应并显示「系统正在重启」过渡层，避免立即断线看不到反馈
- 后端新增 `reboot` RPC：仅 sudo 组可用；优先用 `systemd-run --on-active=2` 调度，
  失败时以 root 权限回退到后台 `shutdown -r now`
- 重启过渡层显示连接即将断开、约 1 分钟恢复的提示

## 2026-11-08（手机端共享 / 存储页重做）

### 变更

- **共享页**：720px 以下改为移动端布局
  - 顶部共享数量 + 全宽「新建共享」按钮
  - 共享列表改为卡片：名称、路径（可复制）、读写/只读、备注、访客/不可浏览标签、
    编辑与删除操作
  - 全局配置收进底部可展开面板，导出 / 导入 / 保存收在同一行
- **存储页**：720px 以下改为移动端布局
  - 顶部容量总览：已用百分比、已用 / 容量、进度条、可用空间
  - 挂载点改为卡片：大号使用率、已用 / 容量、文件系统与设备；交换分区单独展示
  - 磁盘改为可展开卡片：型号、容量、SMART 健康、分区列表；默认展开第一块磁盘
  - 去掉手机上需要横向滚动的挂载点表格
- 桌面端布局保持不变；720px 断点切换时共享 / 存储页也会自动重绘
- 说明：全局配置的保存接口仍是后端未迁移的 `smbGlobalSet`，手机端只做了折叠收纳

## 2026-11-08（更新页：完整升级口径）

### 修复

- 更新页原来用 `apt-get -s upgrade` 统计，内核 meta 包（`linux-image-amd64` /
  `linux-base-amd64`）会被标成 kept back，页面误显示「0 个更新」；现在改用
  `apt-get -s full-upgrade`，能显示 2 个可升级包，并额外提示「另安装 4 个新依赖」
- 「立即升级」同步改为 `apt-get -y full-upgrade`，能真正拉取新内核包；确认框会说明
  新依赖数量、移除数量和可能需要重启
- apt 升级失败时后端会抛错，前端不再在命令失败时仍提示「升级完成」
- 升级确认框不再沿用通用的「删除」按钮，改为「开始升级」并使用主按钮样式
- 点「开始升级」后按钮锁定为「升级中…」，避免重复点击；后端也加了单任务互斥，
  已有 apt 进程占锁时返回「另一个 apt / dpkg 进程正在运行」而不是原始 dpkg 报错
- 补上 `.btn:disabled` 样式：没有更新时「立即升级」会真正变灰，不再看起来可点

## 2026-11-08（手机端网络页重做）

### 变更

- 720px 以下改用独立的手机端网络布局，桌面端保持不变：
  - **当前连接卡**：无线 / 有线图标、接口状态、IPv4 / IPv6、MAC / MTU、无线信号格，
    以及一键复制地址
  - **网络信息 2×2**：默认网关、网关延迟、DNS、公网地址，带图标分块
  - **实时流量**：下行 / 上行大数字、开机累计、紧凑曲线图；刚打开时补零铺满时间轴
  - **流量构成**：用上下行堆叠条替代两个环图，流量去向改为按对端排行的进度条
- 多网卡时顶部才显示接口切换胶囊，单个接口不再占一行
- 手机端不再显示「配置 / 停用」按钮（后端网络接口仍为只读），改用复制地址 + 只读标记
- 极窄屏（≤340px）信息块自动竖排，公网 IP 不再被拆成两行

## 2026-11-08（Debian 标志）

### 变更

- 手机顶栏和抽屉里的 `D` 换成 Debian 官方 swirl（SVG，高 DPI 不糊）
- 去掉白色方块底：顶栏用白色 swirl，浅色抽屉用 Debian 红，暗色抽屉自动切白色，
  直接融入背景


## 2026-11-08（动画与绘制优化）

### 优化

- 右侧硬件卡从“每 3 秒 `innerHTML` 全量重建”改为按 `data-hw` 只更新文本和进度条宽度，
  进度条不再反复从 0 重播动画
- 硬件 / QQ / mihomo 侧栏和移动顶栏去掉 `backdrop-filter`，改用高不透明度背景；
  滚动时不再持续重算毛玻璃
- 抽屉改用 `translate3d`，动画 280ms → 220ms；遮罩过渡 240ms → 180ms；进度条
  过渡 600ms → 400ms，桌面和手机同时生效
- 保留对话框背景的轻微模糊，避免模态层失去层次


## 2026-11-08（品牌文案）

### 变更

- 界面品牌统一为 `Debian NAS`：顶栏、抽屉、登录页、状态页、关于、系统主机名展示
- 抽屉品牌副标题改为“NAS 控制台”；底部改为“Debian NAS · 局域网控制台”
- 只改展示文案，`debnas-web`、`debnas-portal`、`debnas_session`、`DEBNAS_*`、
  配置文件路径和 systemd 单元名保持不变，避免破坏已有部署


## 2026-11-08（手机端用户 / 服务 / 更新排版）

### 修复

- 用户页：系统用户和登录记录在 720px 以下改为卡片布局；账号头像、UID / 组 /
  主目录 / Shell、操作按钮不再横向溢出
- 登录记录补全 `last` 解析：登录时间、结束时间、时长、来源 IP 都能正确显示，
  `LC_ALL=C` 避免本地化输出解析失败
- 服务页：手机端每个服务一张卡，服务名 / 状态 / 描述 / 重启停止按钮纵向排布，
  不再需要横向滚动表格
- 更新页：自动升级开关、周期和说明改为换行布局；更新日志去掉左侧日期列，
  日期作为分组标题，时间 / 操作 / 软件包按行展示
- 暗色模式下移动顶栏改为深色渐变，避免浅紫底 + 白字对比度不足
- 抽屉右上角改成直角，抽屉头吸顶，下滑时关闭按钮/顶部图标不会再被内容顶掉
- mihomo 卡片的 M 图标改用主题色渐变和 `--on-p` 前景色，不再固定紫青渐变


## 2026-11-08（登录页深色）

### 新增

- 登录页接入 `prefers-color-scheme`：系统深色时卡片、输入框、按钮和 HTTP 提示都切成
  深色配色，系统切换时由 CSS 实时跟随
- 登录页补 `theme-color` 媒体元标签，手机浏览器地址栏颜色与页面一致


## 2026-11-08（外观跟随系统）

### 新增

- 主题引擎增加 `auto / light / dark` 三种外观模式，监听 `prefers-color-scheme`：
  系统深色变化时 `auto` 模式实时跟随
- **默认外观为“跟随系统”**；旧配置里的 `dark` 不再覆盖默认策略，需要手动浅/深色时再选
- 头像菜单显示当前外观（如“跟随系统 · 深色”）；外观与主题色面板增加三档选择，
  并显示“设备深色模式：已开启 / 未开启”
- 用户偏好记录 `mode`，手动选择后才会持久化为固定浅色 / 深色


## 2026-11-08（移动端 Argon 顶栏）

### 变更

- 900px 以下改为 Argon 风格固定顶栏：主题色渐变、毛玻璃、汉堡按钮、`debnas` 品牌、
  当前页面名、头像；桌面端布局不变
- 顶部标签收进左侧抽屉：桌面式分组（导航 / 系统）、active 高亮、遮罩、关闭按钮，
  支持点遮罩 / Esc / 点导航项关闭，打开时锁定页面滚动
- 抽屉打开时隐藏右下角 mihomo 浮块；移动端 toast 下移到顶栏下方


## 2026-11-08（备用 HTTP 地址）

### 新增

- `add-http-alias.sh`：给当前局域网接口加一个备用 IPv4（默认 `.250`），用于绕开
  某台手机缓存的 HSTS / HTTPS-only；立即生效并写入 NetworkManager，重启保留
- README 补充“一台手机能开、一台不能”的排查和备用地址用法


## 2026-11-08（手机 HTTP 入口）

### 变更

- Caddy `:80` 对私有网段直接反代到后端，手机打开 `http://<主机>/` 即可登录，
  不再需要安装证书；非私有来源仍 308 跳 HTTPS
- 去掉 HSTS 响应头，避免访问过 HTTPS 的手机被强制升级、无法走 HTTP
- 登录页在 HTTP 下显示明文传输提示；README 改为 HTTP 手机访问说明


## 2026-11-08（性能优化）

### 优化

- 首页网络 / 功耗轮询合并为 `/api/rpc {method:"realtime"}`，3 秒请求数从 2 个降到 1 个；
  硬件 tick 不再重复取一次功耗（首页由 realtime 更新 GPU）
- 页面隐藏时清掉 realtime / QQ / 应用 / mihomo / 硬件 / 网卡定时器，回到前台恢复；
  硬件栏在手机 / 窄屏隐藏时跳过采样
- `rpc_info` 直接读 `os.uname()`、`/proc/uptime`、`/proc/meminfo`、`statvfs`，
  去掉 hostname / uname / uptime / df 四个子进程
- QQ 动态服务端加 8 秒缓存（`DEBNAS_QQ_FEED_TTL` 可调），前端轮询 10s → 12s，
  避免多标签页重复跑 `qqfeed.sh`
- 清理重复的 `visibilitychange` 监听，只保留一处统一暂停 / 恢复


## 2026-11-08（手机访问）

### 修复

- Caddy 增加 `:80` → `:443` 的 308 跳转：手机浏览器只输入 NAS IP 时默认走 HTTP，
  之前 80 端口没监听会直接“无法访问”；现在会自动跳到 HTTPS
- README 补充手机访问说明：必须 HTTPS、自签证书提示、账号为 Debian 系统账号


## 2026-11-08（QQ 图片 / 表情与左栏可读性）

### 修复 / 新增

- 左侧 QQ 动态显示真实图片和系统表情：
  - `qqfeed.sh` 给消息带上 `mid`，从 `qq-bridge/state/social-v2.json` 合并 `media`
  - 新增 `/api/qqmedia` 代理：图片先调 SnowLuma `get_image` 换新 rkey，再下载返回；
    带 8MB 上限、图片格式校验和媒体域名白名单
  - 系统表情改用 SnowLuma `fetch_face_entity` 的 `q_des` + 资源 zip（128px PNG），
    修复 182“笑哭”被旧 qzonestyle CDN 显示成“比耶”
  - 自己发的图片：解析 `[自身]` 群事件；私聊 `INFO 发送` 行用 SnowLuma 历史按
    机器人 QQ + 时间 + 文本匹配补媒体
  - 图片/表情加载失败回退文字占位，不留破图
- 修复跨午夜排序：原来按 `HH:MM:SS` 排，00:xx 会被当成“最早”，最新消息被挤出左栏；
  现在直接使用 qqfeed 的日志顺序
- 左栏加宽（1400px+ 最多 260px），气泡字号 13px、行高提高，头像/时间/昵称对比度加强；
  图片最大 220px，表情包单独限宽


## 2026-11-08（UI 细节打磨）

### 变更

- 侧栏断点从 1180px 调整到 1400px：1180–1399px 改用主栏内嵌 QQ 卡片 + 右下角折叠的
  mihomo 浮块，避免两侧栏被挤成 100px 左右；1400–1599px 主栏收窄到 1000px，
  给两栏更多空间
- 空状态更紧凑；首页统计、Samba、应用、QQ 在数据到达前显示“读取中 / 检测中”，
  不再先闪 0 或“未运行”
- 应用卡片 hover 增加轻微上浮、边框高亮和图标缓动；数字统一等宽
- 增加全局 `:focus-visible` 焦点环、细滚动条、`::selection` 配色，
  以及 `prefers-reduced-motion` 降级
- 暗色模式提高未选中标签对比度；窄屏隐藏 mihomo 出口名和品牌文字
- 手机端 mihomo 折叠后不再占满整行，并给底部浮块留出滚动余量
- 服务表格：状态标签不再换行，描述单行省略（悬停看全文），操作按钮收回栏内，一行一个服务
- mihomo 卡去掉多余阴影，圆角 / 背景 / 边框与上方硬件卡统一；只有窄屏浮动时才恢复阴影


## 2026-11-08（mihomo 导入 / 关闭）

### 新增

- mihomo 管理块新增“导入”和“关闭”：
  - 导入支持 `.yaml` / `.yml`（≤2MB），后端先跑 `mihomo -t` 校验；通过后备份
    `/etc/mihomo/config.yaml`、替换并重启，校验失败不会改原配置
  - 关闭会确认后 `systemctl stop mihomo.service`，代理立即中断；之后可点“启动”恢复
- 新增 `mihomo_import` RPC；导入按钮在服务未运行、API 不可达时也可用，方便用新配置修复
- 操作区改成 2×2 布局（测速 / 导入 / 关闭 / 重启），关闭按钮用危险色


## 2026-11-08（mihomo 架构检测）

### 新增

- 新增 `install-mihomo.sh`：只针对 x86_64，自动检测指令集
  （`amd64-v3` / `amd64-v2` / `amd64` / `amd64-compatible`），下载对应官方资产，
  旧二进制自动备份；非 x86_64 直接拒绝
- `install-mihomo.sh --check` 只检测不下载：打印本机架构、指令集、推荐资产、
  已装二进制架构 / 版本、是否匹配
- `deploy-web.sh --with-mihomo` 可选在部署时安装 / 修复 mihomo；安装器同时复制到
  `/usr/local/lib/debnas-portal/`
- mihomo 管理块显示本机指令集；二进制缺失、架构不匹配或指令集不匹配时状态变为
  “未安装 / 架构不匹配 / 指令集不匹配”，并给出推荐资产和安装命令
- `deploy-web.sh`、`install-deps.sh` 增加 x86_64 检查


## 2026-11-08（README 重写）

### 文档

- README 全量重写：按“功能 / 架构 / 快速开始 / 依赖 / 配置 / 终端 / 虚拟机 / 容器与消息 /
  mihomo / API / 安全 / 开发 / 限制 / 排错 / 来源”重新组织
- 补上真实 PTY 终端、xterm.js、QQ 头像与群消息、mihomo 管理块、静态缓存、
  `/api/term`、`DEBNAS_MIHOMO_*` 等新内容；删掉“sudo 前缀”“命令式终端”等过时说明

## 2026-11-08（mihomo 管理块）

### 新增

- 右侧硬件卡片下方新增 **mihomo 管理块**（窄屏退化为右下角浮块）：运行状态、版本、端口、当前模式、节点选择与延迟、
  累计上下行流量、活动连接数；可切 `rule` / `global` / `direct`、测速、重启 / 启动
- 卡片可折叠，折叠状态存 `localStorage`；与硬件卡片一起在右栏纵向排列
- 后端 `mihomo` / `mihomo_action`：读 `/etc/mihomo/config.yaml` 的
  `external-controller` / `secret`，走本机 REST API（版本、配置、代理、连接）；
  写操作仍走 `/api/rpc` 的会话 + CSRF 校验
- 服务未运行、API 不可达、读取失败分别有对应状态和操作按钮


## 2026-11-08（真实 PTY 终端）

### 新增

- 终端改为**真实 PTY**：`/api/term` 是 WebSocket 端点，服务端用 `pty.fork()` 起
  当前用户的 `/bin/bash -l`，支持 vim / top / htop / 进度条等交互程序
- 前端内置 **xterm.js 6.0.0 + addon-fit 0.11.0**（MIT，`web/frontend/xterm/`），
  只在打开终端时按需加载，不拖慢首页；支持颜色、光标、滚动缓冲和窗口自适应
- 终端尺寸随窗口变化通过 `TIOCSWINSZ` 同步给 PTY；断线显示状态并可点“重连”，
  清屏按钮直接清 xterm 缓冲
- WebSocket 复用会话 cookie 校验 + Origin 校验；每个连接一个 PTY，连接关闭即
  `SIGHUP` 结束 shell 并回收子进程

### 变更

- 原先的命令式终端（逐条 `/api/exec`、cd 状态、退出码展示）被真实 shell 取代
- `/api/me` 返回真实 home 和主机名，提示符与 shell 初始目录一致


## 2026-11-08（终端界面）

### 变更

- 终端重做为深色 bash 风格：标题栏（窗口点 / `user@host` / 清空）、命令回显、
  stdout 与 stderr 分色、退出码和耗时、执行中转圈
- 支持命令历史（↑/↓，存 `localStorage`）、Ctrl+L 清空、Ctrl+C 清输入；
  空状态给常用命令快捷按钮
- 执行改为直接调 `/api/exec`，拿得到退出码和 stderr；`cd` 继续保留目录，
  初始目录按账号真实 home（不再假设 `/home/<user>`）
- 输出会剥掉 ANSI 转义序列，避免颜色码变成乱码；单条输出上限 200 KB
- `/api/me` 顺带返回主机名，提示符显示 `user@host` 而不是访问地址


## 2026-11-08（提示条）

### 变更

- 设置保存等提示条从右下角移到**顶部居中**，从上方弹出、淡出消失（约 3 秒），
  多条提示纵向排列，不再挡住页面右下角
  提示容器补了 `role="status"` / `aria-live="polite"`


## 2026-11-08（QQ 头像）

### 新增

- 左侧栏 / 首页 QQ 动态显示**对话者头像**：`qqfeed.sh` 从日志里解析发送者 QQ
  （私聊 `for(QQ)`、群聊 `[群名片(QQ)]`），前端用 `https://q1.qlogo.cn/g?b=qq&nk=<QQ>&s=100`
  加载；发出的消息显示机器人头像
- 头像加载失败或离线时自动回退为昵称首字，不留下破图
- 顺手修掉群聊消息不显示的问题：SnowLuma 的群事件格式是
  `[Event] 群 [群名(群号)] | [群名片(QQ)]`，以前的解析只认 `私聊|群聊`，群消息一直被漏掉

## 2026-11-08（应用与 QQ 动态自动检测）

### 变更

- **应用卡片改为按容器自动检测**：`APP_DEFS` 用容器名、发布端口、页面标题识别
  SnowLuma / noVNC，探测到才显示，端口变了也能跟上；容器没跑时不再显示一张
  “未响应”的幽灵卡片，全部没有时给空状态提示；首页每 30 秒重新探测，容器起来/停掉会自动出现/消失
- **QQ 动态自动找 SnowLuma**：`qqfeed.sh` 不再写死容器名，按名字或镜像匹配
  `snowluma`；rootless podman 读不到日志（权限 / 运行时目录不对）时自动退回
  `journalctl --user -u <容器>`，左侧栏和首页检测到消息后自动出现
- 首页的应用状态与容器列表合并为同一次探测，少一次 `podman ps` + 逐端口 curl
- 没有新增任何养鱼配置文件：继续用本机已有的 SnowLuma / 容器，控制台只做发现与展示

### 性能

- **应用探测不再拖首屏**：跳过 OneBot / 桥接内部端口（3000 / 3001 / 3100），
  每个端口只发一次 curl（同时取状态码和标题），多个端口并行探测，单端口最多等 0.6s；
  以前是串行 + 每个端口两次 1s 超时，一个不响应的端口就能卡住整页
- **首页先渲染、慢数据后到**：应用列表和 QQ 动态改成后台更新，系统信息/共享/用户先显示，
  容器和对话晚到就替换对应面板，不再被 `podman logs` / `curl` 阻塞
- **网速首帧**：启动后 350ms 补采一次，不必等第一次 3 秒轮询才出速率
- `rpc_net` 去掉每次采样都跑的 `ip -br addr` 子进程（接口地址由网络页单独取）
- **静态资源缓存**：字体 / 图片 `Cache-Control: public, max-age=604800`，CSS / JS / HTML
  用 ETag 条件请求（命中返回 304）；以前是 `no-cache` 且没有校验器，每次刷新都要把
  2.7 MB 的中文字体整套重下
- **网络页信息缓存**：网关 / DNS / 延迟 / 公网 IP 缓存 30 秒，公网地址三个服务并发探测；
  反复进网络页不再等 ping 和公网请求（实测第二次从 1.06s 降到 0.001s）
- `/api/me` 只请求一次（外壳和页面共用同一个 Promise），少一个登录态往返

## 2026-11-07（许可证与来源）

### 变更

- 项目采用 **GPL-3.0**（新增 `LICENSE`），新增 `NOTICE`，明确来源：
  `debnas`（GPL-3.0）、Cockpit / cockpit-file-sharing / cockpit-identities（GPL-3.0）、
  noVNC（MPL-2.0）、Inter（OFL-1.1）及 Debian 软件包
- 移除 **HarmonyOS Sans** 字体子集（华为字体许可限制修改版/单独再分发），中文改用 OFL 的 Noto 子集
- **SnowLuma** logo 改为本地可选：公开仓库不包含该文件（`.gitignore` 忽略），
  本地自用可放 `web/frontend/icons/snowluma.png`；缺失时应用入口回退内置 chat 图标
- 新增 **Noto Sans CJK SC** 子集（约 4142 字，GB2312 一级 + UI 文案），重命名为
  `Debnas Sans SC`，按 OFL-1.1 分发；生僻字回退客户端系统字体
- 补齐 noVNC 的 MPL-2.0 / BSD / pako 许可证文本，Inter 与 Noto CJK 补 OFL 全文
- `deploy-web.sh` 会把 `LICENSE`、`NOTICE` 复制到静态目录，并清理旧版本里的
  `snowluma.png` 和 `harmonyos-sans-sc.woff2`
- README 增加「来源与致谢」和 License 段，并说明未随仓库分发的组件

## 2026-11-07（虚拟机 / 部署）

### 新增

- **虚拟机页重做**：卡片列表（状态/资源/磁盘/IP/自启）、创建向导、详情弹窗、空状态与
  libvirt 未就绪时的安装引导
- **创建向导**：名称、vCPU/内存/磁盘、网络（NAT `default`、已有 bridge、无网络）、
  ISO 自动扫描/手动路径、创建后开机、开机自启、Windows 兼容模式（SATA + e1000e）；
  自动生成 VNC 随机密码，只监听 127.0.0.1
- **网页控制台**：`console.html` + 内置 noVNC 1.6.0，服务端 `/api/vnc` 做 WebSocket↔TCP
  代理；支持 Ctrl+Alt+Del、全屏、断开
- **虚拟机维护**：内部快照创建/恢复/删除、磁盘扩容（运行中走 `blockresize`，关机走
  `qemu-img`）、光驱插入/弹出、资源调整（关机时改 vCPU/内存）
- 删除虚拟机时可选择是否删除磁盘；只删镜像目录内的 disk 设备，不会误删 ISO
- `deploy-web.sh` 生成自解压的 `/deploy.sh`，支持
  `curl -fsSLk https://<主机>/deploy.sh | sudo bash` 一键部署
- `install-deps.sh`：全量 apt 依赖安装（含 libvirt / QEMU / Samba / Caddy 等；noVNC 已内置）；
  `deploy-web.sh` 默认执行，支持 `--skip-deps` 与 `--reinstall-deps`
- README 全量重写：依赖表、一键部署、虚拟机、API、安全、开发、排错、第三方许可证

### 修复

- 创建向导原来把 `default` 当 bridge 传给 virt-install，实际应使用 libvirt 网络
- 带 `--cdrom` 时 virt-install 会输出两份 XML，改为取安装阶段那份并保留光驱
- `virsh dominfo` 输出受 libvirt-l10n 影响：所有 virsh 命令强制 `LC_ALL=C`
- 虚拟机名含空格/中文时启停被“非法虚拟机名”拒绝；列表解析也不再按空白切分
- 磁盘扩容 `blockresize --size` 不带单位会被当成 KiB，改用 `NG` 后缀
- 服务页的「重启/停止」按钮被后定义的 `pending()` 覆盖，恢复真实 RPC

### 安全

- `debnas-web` 默认/部署单元改回只监听 `127.0.0.1`（Caddy 反代）
- 网页控制台 WebSocket 校验会话与 Origin，且只能连到指定虚拟机的 VNC 端口
- 移除 `index.html` 里遗留的调试脚本（会把 `document.title` 改成接口返回）

## 2026-11-07（收尾）

### 架构

- Cockpit 全部卸载，`debnas-web` 成为唯一后端；Caddy 终止 TLS，后端只监听 `127.0.0.1:8080`
- 工程收敛为 `web/`（server / api-web / shim / frontend / helpers），删除 `portal/` 与 Cockpit 部署脚本

### 新增

- `/api/exec`：以登录用户身份执行命令，终端可用；`sudo` 前缀命令对 sudo 组用户以 root 执行
- 登录记录（`last`）、SMART（`smartctl -j`）、流量去向（`ss -tin` 对端聚合）
- 文件页：隐藏文件开关（默认关闭）+ 语义化类型列
- 共享列表隐藏 `homes`/`printers`/`print$`/不可浏览项
- 用户列表只显示可登录账号（隐藏 nobody、libvirt-qemu 等系统账号）

### 修复

- 网卡数据缺 `v4`/`v6` 导致整页空白
- 文件表格列数（6→7）与开关未绑定事件
- 硬件栏缺 `memTotal`/`cpuTimes` 导致空显示；断点 1480→1180
- 主题偏好与终端仍调用 `cockpit.spawn` 报「未提供通用命令执行」

## 2026-11-07

### 新增

- **工具页**：日志（journalctl，单元筛选 + 搜索）、终端（命令执行，保留 cwd）、
  文件（浏览/上传/下载/删除/新建目录）、虚拟机（virsh 列表与启停）、应用（Cockpit 包入口）
- 停用原生 Logs / Virtual machines 菜单入口，统一收进控制台

- **更新页**：apt 可更新包概览与一键升级、无人值守自动升级开关与周期（每天/每周/每月）、
  组件操作（控制台重新部署、容器拉取镜像）、更新日志时间线
- **noVNC 口令还原**：`vncpass.sh` + 「查看口令」按钮，容器重建后不必再猜密码
- **QQ 聊天记录**：`qqfeed.sh` 在脚本侧解析容器日志并输出 JSON，首页与左侧栏共用
- **应用自动发现**：只认容器发布出来的端口；支持 `HIDDEN_SERVICE_PORTS` 手动屏蔽
- 硬件侧栏（CPU/内存/GPU/温度）、网络流量曲线与环图、登录记录、SMART 健康

### 新增（独立 WebUI 底座）

- `web/server.py`：PAM 认证（ctypes libpam）、签名会话 cookie、CSRF 校验、
  静态托管、白名单 RPC（info/journal/listdir/services/power）
- `deploy-web.sh` + `debnas-web.service` + `Caddyfile.snippet` + PAM 服务定义
- 登录页与迁移状态页；`--disable-cockpit` 留到迁移完成后再用

### 变更

- **切换主入口**：`debnas-web` 成为唯一入口（0.0.0.0:8080），Cockpit 已 disable，可用
  `systemctl start cockpit.socket` 临时恢复
- 独立后端补齐全部 RPC：服务、更新（检查/升级/周期/日志）、容器、noVNC 口令、
  工具（日志/终端/文件/虚拟机）、文件上传下载、samba 写入
- 前端 `api-web.js` 全部替换为 RPC 调用，移除 `pending()` 占位
- 修复：网卡数据缺 `v4/v6` 导致整页空白；`refresh` 异常改为写入页面便于定位

- **全站视觉统一**：`branding.css` 增加原生页面组件层（页面留白、表格、标签、提示条、
  下拉与弹窗、空状态、深色卡片），登录页按钮改用主题变量
- **主题色全站跟随**：`theme.js` 将调色板镜像到 `localStorage`，`skin.js` 注入各页面
  读取并应用（含 `storage` 事件实时同步）

- 主题色改为 M3 标准色调推导（CIELAB tone 40/80、容器 90/30），不再用 HSL
- 主题色同步到 Cockpit 外壳（`--debnas-p` 系列变量）
- 菜单击精简扩展到 `packagekit` 的 `tools` 入口
- 部署脚本增加：镜像加速配置、构建号注入、三项新后端脚本安装

### 修复

- 首页/更新页白屏：CSP 禁止内联 style，全部改为静态类 + 渲染后 CSSOM 赋值
- 系统卡死：轮询命令堆积导致 `cockpit-bridge` 涨到 4GB；加防重入、后台停表、放宽间隔
- 聊天记录空白：日志含 x11vnc 二进制帧 + 发送消息正则缺捕获组
- 更新日志时间被截断（`16:2`）、升级条目因版本号内逗号被丢弃
- 左侧/右侧留白栏在窄屏也显示（未闭合的 media query）
- 「更新」标签误渲染成服务页（视图分发漏分支）

### 运维调整

- 停用 PCP 相关服务（`pmcd`/`pmproxy`/`pmlogger`），释放 32MB 与 4 个端口
- 停用 `packagekit.service`（cockpit-pcp 未安装，页面无用）
- 容器镜像加速指向 `dockerproxy.net`；`run-snowluma.sh` 支持 `SNOWLUMA_PROXY=none`
- `run-snowluma.sh` 改为先 `podman stop -t 30` 再删除，避免 QQ 掉登录
