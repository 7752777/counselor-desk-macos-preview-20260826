# v4.8.5 发布收尾记录

> 本文记录 v4.8.5 相对 v4.8.4 候选的兼容维护、验证范围、正式产物和已知边界。仓库 `7752777/counselor-desk` 为私有，下载和源码访问需要 GitHub 权限。v4.8.4 候选 Tag 保留，不移动、不覆盖。

## 发布判定

v4.8.5 是 v4.8.4 候选的兼容维护补丁。生产代码和数据协议保持不变，修复发布门禁在慢速 CI runner 上过早读取异步保存结果的测试竞态；v4.8.4 候选的离线资源、传输验收和 v4.8/AI 主门禁内容全部继承。

| 项目 | v4.8.5 记录 |
| --- | --- |
| 版本号 | 根 `package.json`、`desktop/package.json` 和页面 `APP_VERSION` 均为 `4.8.5` |
| 工作区协议 | `schema_version: 8`；业务 `data_schema_version: 11`；同步 `sync_protocol_version: 1`；物理 IndexedDB v6 |
| 分支 | `codex/ai-upgrade` |
| Tag | `v4.8.5` annotated tag object `5aac99867b099837f523a942ef65b1f953f31851`，指向 commit `c04732900ee257f8bae02ad25cc1559dd2643bb8` |
| GitHub Release | [辅导员工作台 v4.8.5](https://github.com/7752777/counselor-desk/releases/tag/v4.8.5)，2026-08-22 14:49:24 UTC 发布，非 Draft、非 Pre-release |
| 候选兼容 | `v4.8.4` Tag 保留为未通过门禁的候选，不作为下载入口 |

正式发布证据已经完成回填。发布工作流为 [Actions #32578966917](https://github.com/7752777/counselor-desk/actions/runs/32578966917)，Tests、Windows、macOS、Offline Web 和 Draft Release 全部成功；v4.8.4 候选失败 run 不影响本次正式 Tag。

## 本版本完成内容

### 发布门禁时序

- `tests/v48-management-ui.js` 不再使用固定 60ms 假设。
- 测试等待 `window.__CWB_LAST_SAVE_PROMISE__` 的真实完成状态，并等待远程备份配置进入工作区设置后再断言。
- 该修复只提高验收确定性，不放宽远程备份配置的 HTTPS、凭据不落库和只传加密包边界。

### 继承的 v4.8.4 维护

- 单文件离线 HTML 内联 `assets/app-icon.svg`，磁盘双击打开时不依赖旁路图标文件。
- Chromium `file://` 全路由验收覆盖 `1440x920`、`1024x768`、`390x844` 和 `360x800`，共 232 次主导航渲染，并检查抽屉、Escape、页面错误和横向溢出。
- 本地自签名 HTTPS/WebDAV 端到端测试覆盖连接、上传、下载、删除和 404 失败路径。
- `pnpm test` 纳入完整 AI 与 v4.8 定向套件，`pnpm test:release` 纳入离线文件路由 smoke；版本和文档检查按当前版本动态工作。

## 自动化验证

本地已通过的受影响验证：

```text
node tests/v48-management-ui.js
```

最终发布前必须在包含本补丁的 Tag 上执行并记录以下门禁：

```text
pnpm test
pnpm lint
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
git diff --check
```

GitHub Actions 的完整门禁、平台构建和 Release 资产必须分别核对；局部用例通过不能替代跨平台打包和正式资产证据。

### v4.8.5 实际发布门禁

| Job | Actions job | 结果 |
| --- | ---: | --- |
| Tests | `97045372028` | 通过，完整测试、版本/文档检查、发布配置检查和草稿 Release 创建 |
| Windows NSIS (x64 and ARM64) | `97046310943` | 通过，构建、架构检查、冒烟和上传 |
| macOS Universal (DMG and ZIP) | `97046883194` | 通过，Universal 构建、冒烟和上传 |
| Offline web package | `97047392080` | 通过，离线 HTML 构建、重命名、哈希和上传 |
| Draft Release | `97047423866` | 通过，资产完整性核对并公开 Release |

本地受影响验证 `node tests/v48-management-ui.js` 和 `pnpm test:release` 均通过；后者包含当前文档检查、发布契约、Electron 配置、HTTP 路由 smoke 和 `file://` 232 次路由 smoke。

## 正式资产

已发布 Release 包含以下资产及对应校验清单：

| 平台 | 正式资产 | 大小（字节） | SHA-256 |
| --- | --- | --- | --- |
| Windows x64 | `counselor-desk-4.8.5-x64.exe` | 91,291,890 | `4F48B6615D6C2D4419AFAB4C1307CF7A0587D92C7542123BEBFD30D9991184E8` |
| Windows ARM64 | `counselor-desk-4.8.5-arm64.exe` | 85,654,806 | `51BD1A920E51B6BB58569435FBF940FAF5382CE83244928546ADB9570DEB3879` |
| macOS Universal | `counselor-desk-4.8.5-mac-universal.dmg` | 196,856,729 | `52cf577ffaf8630fcaed2ba327188d293254cd17b44d8ab42abec5710b90684c` |
| macOS Universal | `counselor-desk-4.8.5-mac-universal.zip` | 196,293,274 | `7017c578813df4657843de2f509ccfe86a633480325bda75ccbe8d52182379bf` |
| Web | `CounselorDesk-v4.8.5-Offline.html` | 14,189,839 | `6350d82718c64c9370065362a0a3a42d5c6d5d5702962617d949acc7cad9cc3c` |

Release 同时附有 `Windows-SHA256.txt`（194 字节）、`macOS-SHA256.txt`（240 字节）和 `Web-SHA256.txt`（107 字节）。以上摘要取自 Release 实际清单；下载后应重新核对文件名和摘要。工作区 `output/` 构建目录仍不作为正式下载入口。

## 明确未完成的真实环境验收

- Windows/macOS 实机的自定义安装路径、数据目录迁移、损坏密钥、SQLite/WAL 损坏、恢复回滚和附件回读。
- 真实手机扫码、HTTPS 证书指纹核对、断网队列、设备撤销和长期多设备同步。
- 第三方 WebDAV/HTTPS 服务商互操作、超时差异和学校网络策略适配。
- 真实照片、证书、活动附件跨端恢复抽查。
- Windows 签名、macOS 签名与公证。
- 数据库级真正加密、真实模型中文质量、事实准确率和教师满意度基线。

重点学生 PIN 锁仍明确为“仅防误看，不是数据库加密”；浏览器关闭后不能后台写用户选择的文件目录或执行持续同步；局域网首期只允许同一局域网。上述限制不因自动化测试通过而消失。

## 发布后维护

本次发布证据已在本文回填。后续只允许通过新的维护提交补充真实设备、第三方服务商和签名/公证验证，不移动 `v4.8.5` Tag 或任何历史发布物。
