# v4.8.2 发布收尾记录

> 状态：正式发布收口记录。v4.8.1、v4.8.0 及更早版本的 Tag、Release 和正式资产保持不变。

本文档记录 v4.8.2 维护发布的版本边界、实际修复、验证证据、正式资产和仍需真实环境核验的限制。它只记录当前版本已经完成并有证据支持的内容，不把本地夹具扩大为真实设备或服务商验收。

## 版本边界

| 项目 | v4.8.2 事实 |
| --- | --- |
| 版本号 | `package.json`、`desktop/package.json` 和页面 `APP_VERSION` 均为 `4.8.2` |
| 分支 | `codex/ai-upgrade` |
| Tag | [`v4.8.2`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.2) |
| GitHub Release | [`v4.8.2`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.2)，仓库为私有，下载需要仓库权限 |
| 历史版本 | `v4.8.1`、`v4.8.0` 及更早 Tag/Release 不移动、不覆盖 |
| 数据协议 | `schema_version: 8`、`data_schema_version: 11`、`sync_protocol_version: 1`，无新增迁移 |
| 交付物 | Windows x64/ARM64 NSIS、macOS Universal DMG/ZIP、离线 HTML 和 SHA-256 清单 |
| 正式状态 | 以本文件下方实际回填的 Release 时间、Actions run、Tag commit 和资产清单为准 |

## 本次实际修复

1. **局域网客户端持久化串行化。** `createSyncClient` 现在按请求顺序保存队列、冲突、游标和连接元数据；异步保存失败返回 `SYNC_STATE_PERSIST_FAILED`，并恢复最后一个已成功保存的状态快照。新增 `waitPersistence()` 作为 UI 和集成调用方的真实持久化完成承诺。
2. **同步操作等待真实保存。** 连接、配对、拉取、推送、冲突刷新和冲突解决在返回成功前等待状态持久化；网络成功但本地状态没有保存时不会继续显示已完成。
3. **业务仓储失败回退。** 学生、普通业务和自定义集合的单条写入、批量写入、删除在 Electron/IndexedDB/兼容存储写入失败时恢复原内存集合；失败会沿原错误路径返回，表单和重试状态由上层保留。
4. **批量写入先验证后替换。** 内存 `putMany`/`replaceManyAtomic` 对整批数据进行完整校验，校验失败不修改已有集合，避免单条坏记录导致整批业务数据被清空。
5. **测试契约补齐。** 新增 `tests/v48-sync-persistence.js`，覆盖单次异步保存失败回滚、后续成功保存、前序失败不阻断后续快照和实际队列状态；同步服务、断网恢复、附件存储、桌面和管理 UI 测试随本版本重新执行。

## 数据与兼容性

- 不新增集合、不改变 v11 迁移、不删除旧字段、不改变学生 `student_id` 关联和历史学号兼容规则。
- v4.8.1/v4.8.0 工作区可以直接读取；同步状态保存失败时只回滚本地同步状态，不删除业务记录或附件。
- 远端 push 已接受但本地确认保存失败时，队列可能再次提交同一操作；服务端使用既有 `idempotency_key` 去重，避免重复事实写入。
- 拉取业务记录成功但游标保存失败时，下一次拉取可能再次应用同一修订；业务记录写入必须保持幂等，游标不会静默前进。

## 验证证据

本版本代码改动后的受影响验证：

```text
node --check src/core/cwb-v48.js
pnpm test:sync-persistence
pnpm test:sync-resilience
node tests/v48-services.js
node tests/v48-storage-hardening.js
pnpm test:desktop
pnpm test:interaction
pnpm test:v48
```

最终发布门禁：

```text
pnpm test
pnpm lint
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
git diff --check
```

最终门禁、构建、Tag 和 Release 的实际退出码及运行链接已回填。未重复执行同一代码状态下已经通过的验证；本轮没有做常规源码哈希，SHA-256 只对最终发布产物生成一次。

## 正式发布证据

以下信息只使用 v4.8.2 Tag 对应干净提交和正式工作流的实际结果回填：

| 项目 | 实际证据 |
| --- | --- |
| Tag commit | [`27d96ea94e87a42cf04bef06d4e756b409bec19c`](https://github.com/7752777/counselor-desk/commit/27d96ea94e87a42cf04bef06d4e756b409bec19c) |
| GitHub Actions | [Validate and prepare release #32569684224](https://github.com/7752777/counselor-desk/actions/runs/32569684224)，结论 `success` |
| Release 时间 | `2026-08-22 19:27:32 +08:00`；[私有 GitHub Release](https://github.com/7752777/counselor-desk/releases/tag/v4.8.2) |
| 仓库可见性 | Private |
| Pages | 不作为私有仓库当前入口或可用性证明 |

### 正式资产清单

| 资产 | 大小（字节） | SHA-256 |
| --- | ---: | --- |
| `counselor-desk-4.8.2-x64.exe` | 91,291,691 | `5f935967c5ef2b36157da14d82f84cb5d1230f9bfc2a5bae468d5124907a2ba3` |
| `counselor-desk-4.8.2-arm64.exe` | 85,654,626 | `0afa7da5007d940216dd5a82c816bb4046cb2747a0c574614c4ec1680f5683cd` |
| `counselor-desk-4.8.2-mac-universal.dmg` | 196,856,862 | `eb16fc2ec0ba0c932e10e9f28ec1d5177fb28d40dafad867a0db4b44365eb68d` |
| `counselor-desk-4.8.2-mac-universal.zip` | 196,292,772 | `967736a43af0475e43368eaf51cfce1c9b67035c62758ab79e252df6a253805f` |
| `CounselorDesk-v4.8.2-Offline.html` | 14,187,159 | `434e2e692f5c37f6d2968237524b81579c05fc1c23ef48206457857f742d3db0` |

正式清单资产应同时上传为 Windows、macOS 和 Web 三份校验文本。用户安装前应从私有 Release 下载对应清单并核对，不使用工作区 `output/` 中未上传的开发构建替代正式资产。

## 已知限制

- Windows/macOS 安装包未配置代码签名，macOS 未公证；安装前应核对私有 Release 提供的 SHA-256 清单。
- 真实手机 HTTPS 证书信任、自动发现、长时间多设备断网重连、真实 WebDAV 服务商互操作和 5,000 名学生含附件的跨端恢复仍需目标环境抽查。
- 浏览器关闭后无法后台写文件或同步；数据库级加密、云端实时学生业务同步和 AI 自动修改学生事实不在本版本承诺内。
- 同步客户端的本地队列恢复和幂等契约已通过自动化测试，但真实学校网络、证书安装、主机重启和多设备长期运行仍不能由 Node/JSDOM 测试代替。

## 审查与流程说明

本批属于公共持久化接口和数据可靠性高风险维护，按批次进行了一次实现代理综合审查和受影响定向测试；没有为每个小修复重复启动规格/质量双审，也没有在同一代码状态下重复全量测试或源码哈希。最终交付前执行一次整体门禁，发布资产哈希仅用于验证确定性生成和传输完整性。
