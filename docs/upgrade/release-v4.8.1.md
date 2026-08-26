# v4.8.1 发布收尾记录

> 状态：正式发布收口记录。v4.8.0 的 Tag、Release 和正式资产保持不变。

本文档记录 v4.8.1 维护发布的版本边界、用户可见修复、验证证据、正式资产和仍需真实环境核验的限制。v4.8.1 是兼容维护版本，不新增数据迁移。

## 版本边界

| 项目 | v4.8.1 事实 |
| --- | --- |
| 版本号 | `package.json`、`desktop/package.json` 和页面 `APP_VERSION` 均为 `4.8.1` |
| 分支 | `codex/ai-upgrade`；发布提交以 `v4.8.1` Tag 指向的 commit 为准 |
| Tag | [`v4.8.1`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.1) |
| GitHub Release | [`v4.8.1`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.1)，仓库为私有，下载需要仓库权限 |
| 历史版本 | `v4.8.0` 及更早 Tag/Release 不移动、不覆盖 |
| 数据协议 | `schema_version: 8`、`data_schema_version: 11`、`sync_protocol_version: 1`，无新增迁移 |
| 交付物 | Windows x64/ARM64 NSIS、macOS Universal DMG/ZIP、离线 HTML 和 SHA-256 清单 |
| 正式状态 | GitHub Release 已于 `2026-08-22T09:56:40Z` 发布；仓库可见性为 Private |
| 发布流水线 | [Actions run 32565590122](https://github.com/7752777/counselor-desk/actions/runs/32565590122)，验证、构建、资产校验和发布均成功 |
| Tag commit | `d1f6d94b4d4f119d737fef37e6660a0e6d12b6d7` |

## 本次实际修复

1. 证书识别授权弹窗从“确认发送证书图片”明确为“确认发送证书图片给模型”，并在正文中说明图片可能包含姓名、学号或其他个人信息。仍然只发送用户明确选择的单个附件，授权只对本次请求生效；结果先保存为草稿，人工核对学生、证书名称、等级、日期和颁发单位后才写入奖惩事实。
2. 桌面恢复向导与底层 Argon2id 口令要求统一为至少 12 位。导出要求二次输入确认并在生成期间禁用按钮；导入在验证期间禁用按钮，短口令直接拦截，错误口令不会替换当前数据，失败后表单保留并可重试。
3. 管理 UI 回归测试增加证书授权文案、恢复口令长度、导出二次确认和导入长度校验断言。

## 验证证据

本次修改后已通过的定向验证：

```text
pnpm test:v48
pnpm test:desktop
pnpm test:cwb-ai
node tests/certificate-recognition.js
node tests/work-summary.js
node tests/employment-resources.js
node tests/cwb-collections.js
node tests/cwb-ai-workflow.js
node tests/cwb-ai-context.js
node tests/ai-record-actions.js
node tests/mobile-navigation.js
node tests/external-url-safety.js
node tests/cwb-employment.js
node tests/backup-state-persistence.js
node tests/backup-freshness.js
node tests/talk-follow-up.js
node tests/platform-export-privacy.js
node --check src/core/cwb-v48-ui.js
node --check tests/v48-management-ui.js
node tests/v48-core.js
node tests/v48-management-ui.js
```

真实浏览器验收使用本地服务 `http://127.0.0.1:4173/`，视口为 `1440x920`、`1280x800`、`1024x768`、`390x844` 和 `360x800`。验证了桌面三栏、右侧上下文区、学生表格/卡片模式、移动导航抽屉、导航搜索、底部快捷栏、窄屏无横向溢出和数据修复入口。恢复包按钮在浏览器端明确提示“恢复包需要桌面端”，没有把网页端不支持的能力伪装成可用。

同一代码状态下没有重复执行已经通过的完整门禁；本轮源码没有做常规哈希检查，哈希只在最终发布产物生成时执行。

## 正式发布门禁与资产

本版本已在本地和 GitHub Tag 的干净环境完成发布门禁。GitHub Actions 在 `v4.8.1` Tag 上再次执行完整测试，并完成 Windows、macOS、离线 Web 构建与资产校验。

本地最终门禁结果：

```text
pnpm test
pnpm lint
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
git diff --check
```

以上命令均通过；`git diff --check` 仅输出 Windows 工作区的 LF/CRLF 转换提示，没有空白错误。全量测试进程最终退出码为 `0`。同一 Tag 的云端发布流水线也以成功状态结束。

### 正式资产清单

以下大小为 GitHub Release 资产的字节数，SHA-256 来自同一流水线生成并上传的清单，不使用 v4.8.0 旧哈希：

| 资产 | 大小（字节） | SHA-256 |
| --- | ---: | --- |
| `counselor-desk-4.8.1-x64.exe` | 91,290,767 | `d31c5ef6e5d10a4dacc56c4e55bc3255d1566da0bd5750d040aa3c11aa2a7e7f` |
| `counselor-desk-4.8.1-arm64.exe` | 85,653,672 | `91cd8903647fb22577fd5cdf7cc520197b8ceeb846b0db38a5fc0aaca2679f44` |
| `counselor-desk-4.8.1-mac-universal.dmg` | 196,861,906 | `667926f5a22798f506871d10f60b406b23f9e25159c48ae8ccbd9ff106ea3890` |
| `counselor-desk-4.8.1-mac-universal.zip` | 196,290,708 | `c3fbd8432c786809d5606a3639b6a08d769b53ed276b5fbb517b392d4cb9b011` |
| `CounselorDesk-v4.8.1-Offline.html` | 14,180,368 | `92d05f3be4e4b0b9805e80357fe141d2e44fdcf9db5272111b40ab7f272e3f30` |

清单资产本身也已上传为 `Windows-SHA256.txt`、`macOS-SHA256.txt` 和 `Web-SHA256.txt`，安装前应从私有 Release 下载并核对对应文件。

## 已知限制

- Windows/macOS 安装包未配置代码签名，macOS 未公证；安装前应核对 Release 提供的 SHA-256 清单。
- 真实手机 HTTPS 证书信任、自动发现、长时间多设备断网重连、真实 WebDAV 服务商互操作和 5,000 名学生含附件的跨端恢复仍需目标环境抽查。
- 浏览器关闭后无法后台写文件或同步；数据库级加密、云端实时学生业务同步和 AI 自动修改学生事实不在本版本承诺内。
- 证书识别、心理语音和其他敏感 AI 操作继续遵守逐次授权、出站脱敏、审计、草稿和人工确认边界。
