# v4.4 发布归档账本

当前 v4.7.0 历史发布范围、附件和验收证据见[发布收尾记录](./upgrade/release-v4.7.0.md)；v4.6.0、v4.5.0、v4.4.6 及更早版本发布结果见对应历史记录。本页记录历史档案与清理原则，不作为下载入口；仓库当前为私有，附件需要仓库权限，当前候选不属于历史附件。

本页记录 v4.4.0 发布后仍有价值的取证边界。它不包含学生业务数据、不替代 Git 历史，也不把可重建的缓存和安装残留伪装成产品资产。

## 已固定的发布证据

| 项目 | 记录 |
| --- | --- |
| 当前正式版本 | `v4.7.0`，发布提交和公开证据见 [v4.7.0 发布收尾记录](./upgrade/release-v4.7.0.md) |
| 当前正式附件 | [v4.7.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.7.0) 中的离线 HTML、Windows x64 / ARM64、macOS Universal DMG / ZIP 和三份 SHA-256 清单 |
| v4.7.0 发布门禁 | [Actions #32211212549](https://github.com/7752777/counselor-desk/actions/runs/32211212549)，Tests、Windows、macOS、Web 和 Draft Release 全部成功 |
| v4.7.0 Pages 部署 | [Actions #32212075408](https://github.com/7752777/counselor-desk/actions/runs/32212075408) 为历史成功记录；仓库私有后原在线入口当前 HTTP 404 |
| 上一正式版本 | `v4.6.0`，发布提交和公开证据见 [v4.6.0 发布收尾记录](./upgrade/release-v4.6.0.md) |
| 上一版正式版本 | `v4.4.6`，提交和附件见 [v4.4.6 发布收尾记录](./upgrade/release-v4.4.6.md) |
| 上一版正式附件 | [v4.4.6 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.4.6) 中的离线 HTML、Windows x64 / ARM64、macOS Universal DMG / ZIP 与三份 SHA-256 清单 |
| 上一版发布门禁 | [Actions #32133893252](https://github.com/7752777/counselor-desk/actions/runs/32133893252) |
| 上一版 Pages 部署 | [Actions #32135312775](https://github.com/7752777/counselor-desk/actions/runs/32135312775) |
| 平台限制 | 未配置代码签名；macOS 未公证 |

## 历史 v4.4.0 证据

| 项目 | 记录 |
| --- | --- |
| 发布版本 | `v4.4.0`，2026-08-14 |
| 发布提交 | [`ed362d73a1c95bded26bdfba811a10eb73b5b2a2`](https://github.com/7752777/counselor-desk/commit/ed362d73a1c95bded26bdfba811a10eb73b5b2a2) |
| 正式附件 | [v4.4.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.4.0) 中的网页、离线 HTML、Windows、macOS 与 SHA-256 文件 |
| 发布门禁 | [Actions #31768117637](https://github.com/7752777/counselor-desk/actions/runs/31768117637) |
| Pages 部署 | [Actions #31768796087](https://github.com/7752777/counselor-desk/actions/runs/31768796087) |
| 数据格式 | schema v8 |

## 保留与清理原则

| 类别 | 处理原则 |
| --- | --- |
| Git 对象、正式 Release 附件、SHA-256、发布日志 | 保留，可用于追溯与复现。 |
| 业务备份和用户数据 | 只在受控介质保留，不上传仓库、不擅自解包或修改。 |
| 当前工作树与可复现构建缓存 | 仅保留必要副本；构建缓存可随时重建。 |
| 旧 Preview 附件、临时安装目录、重复 `node_modules`、Electron 下载缓存 | 在正式发布验证后清理或移入有限期回收区。 |

## 已完成的发布后整理

- v4.0 Preview Tags / Releases 与已完成的远程开发分支已在 v4.4.0 正式发布后清理。
- 八张 `2560 × 1440` 产品截图、发布附件 SHA-256、公开文档和离线包资源均随正式版本留存。
- 历史开发目录只作为取证和数据保留源，不可整包回拷覆盖 v4.4 工作树；任何旧实现需要函数级差异说明和专项测试后才可进入新的维护版本。

## 下一次维护的最低要求

1. 从已发布提交创建独立分支，不直接改写正式 Tag。
2. 在同一提交完成完整测试、桌面目标平台验证、网页构建和公开面检查。
3. 建立新的 Tag、Release、校验文件和 Pages 部署记录，再更新本账本与验收报告。
