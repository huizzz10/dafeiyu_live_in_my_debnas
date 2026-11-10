# 字体许可说明

`web/frontend/fonts/` 下随仓库分发两套字体：

- **Inter**：SIL Open Font License 1.1
  - 上游：<https://github.com/rsms/inter>
  - 许可证全文：`OFL-Inter.txt`

- **Debnas Sans SC**：Noto Sans CJK SC 的子集（约 4142 字，GB2312 一级 + UI 文案），
  已重命名以符合 OFL 对修改版命名的要求。
  - 上游：<https://github.com/notofonts/noto-cjk>
  - 许可证：SIL Open Font License 1.1
  - 许可证全文：`OFL-NotoSansCJK.txt`
  - 版权：Copyright 2010-2012 Google Corporation and other Noto CJK contributors

界面里 Inter 负责西文，Debnas Sans SC 负责中文；子集之外的生僻字会回退到
客户端系统字体（Noto Sans SC / PingFang SC / Microsoft YaHei 等）。

之前使用过的 **HarmonyOS Sans SC** 已移除：华为的字体许可对修改版和单独再分发
有限制，不适合直接放进公开仓库。确需使用请自行获取并遵守其许可。
