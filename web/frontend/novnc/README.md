# noVNC（内置副本）

只保留了浏览器端 RFB 客户端库（`core/` 与 `vendor/`），供 `console.html` 直接以
ES module 方式导入，不包含 noVNC 自带的 `vnc.html` 界面。

- 上游：<https://github.com/novnc/noVNC>
- 版本：1.6.0
- 来源：Debian trixie `novnc` 1:1.6.0-2 包中的 `/usr/share/novnc`
- 许可证：核心库 MPL-2.0；HTML/CSS 为 BSD-2-Clause；图片 CC-BY-SA-3.0；
  vendored pako 为 MIT
- 完整文本：`LICENSE.txt`、`LICENSE.MPL-2.0`、`LICENSE.BSD-2-Clause`、
  `LICENSE.BSD-3-Clause`、`LICENSE.pako.txt`、`COPYRIGHT`

升级方式：用新版本 Debian 包的 `core/` 和 `vendor/` 覆盖本目录即可。
