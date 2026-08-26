# v4.4.6 项目收尾与正式上线记录

更新时间：2026-08-18

本页是 `4.4.6` 的统一发布记录。它把用户视角审查、代码改动、验证命令、公开面和最终交付证据放在同一处。v4.4.6 已由提交 `f32d32a67325cc0177ccdc977e43709bb4391a35` 完成全部发布门禁并公开；Release、Pages、跨平台附件和 SHA-256 均以本页列出的真实证据为准。

## 本版本完成范围

- 明确重点学生档案 4 位口令是“防误看锁，不是加密”，清除口令不恢复数据或口令；工作台访问锁启用时再次验证。
- 首页显示最近一次加密备份的天数、备份后变更数量和容量风险；桌面端保留按时间/变更量的自动备份，网页端明确手动备份边界。
- 附件写入前执行增量容量检查；附件统一按 IndexedDB/桌面仓储统计，容量页提供 70%/85%/95% 风险提示。
- 平台交换默认使用最小化脱敏策略：手机号、姓名、学号遮蔽，危机级别转为代码，高敏感集合、附件正文、AI 凭据和工作区历史默认排除。
- 增加访问审计入口，记录敏感查看、敏感导出、备份和重点档案锁操作，支持按对象、动作和范围查询。
- 更新用户手册、隐私/迁移/开发/发布文档，新增[用户视角综合审查](./user-centered-audit-2026-08-18.md)和[依赖与单文件发布清单](./dependency-inventory.md)。

完整的功能盘点、未完成边界和下一轮计划见[用户视角综合审查](./user-centered-audit-2026-08-18.md)；历史 v4.4.5 发布证据见[release-v4.4.5.md](./release-v4.4.5.md)。

## 本地与 CI 验证记录

本轮已执行并通过的定向验证：

```text
node scripts/check-inline-js.js
node tests/security-boundary.js
node scripts/build-release.js output/v4-preview.html
node tests/backup-state-persistence.js
node tests/backup-freshness.js
node tests/storage-capacity.js
node tests/photo-storage.js
node tests/mobile-navigation.js
```

另修复了移动导航搜索包含空格时无法匹配的问题，并用 `AI 智能工作台` 完整名称补充回归断言。已完成的人工浏览器验收：`http://127.0.0.1:4173/` 可访问；`390×844` 首次打开不被欢迎弹窗遮挡；菜单、抽屉、焦点回收、折叠分组搜索、Escape 关闭和无横向溢出正常；`360×800` 下底部导航和 AI 页面可操作；首页会显示“未生成加密备份 / 请先生成加密备份”。

发布工作流 [#32133893252](https://github.com/7752777/counselor-desk/actions/runs/32133893252) 已在同一 Tag 上完成 Tests、Windows NSIS、macOS Universal、离线网页和 Draft Release；Tests job 的完整 `pnpm test`、lint、公开面检查、密钥扫描、Release 契约和跨平台包级烟测均通过。Pages 工作流 [#32135312775](https://github.com/7752777/counselor-desk/actions/runs/32135312775) 已成功部署，在线入口返回 HTTP 200，运行时包含 `4.4.6`。

## 正式发布证据

以下表格记录 v4.4.6 的真实发布结果，不能使用 v4.4.5 的提交、Actions、附件或哈希代替：

| 项目 | v4.4.6 事实 |
| --- | --- |
| 发布提交 | [`f32d32a67325cc0177ccdc977e43709bb4391a35`](https://github.com/7752777/counselor-desk/commit/f32d32a67325cc0177ccdc977e43709bb4391a35) |
| Git Tag | [`v4.4.6`](https://github.com/7752777/counselor-desk/releases/tag/v4.4.6) |
| Release workflow | [Actions #32133893252](https://github.com/7752777/counselor-desk/actions/runs/32133893252)，所有 job 成功 |
| 正式 Release | [v4.4.6 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.4.6)，2026-08-18 20:08（Asia/Shanghai）公开、非 Draft、非 Pre-release |
| Pages 部署 | [Actions #32135312775](https://github.com/7752777/counselor-desk/actions/runs/32135312775) 成功；[在线入口](https://7752777.github.io/counselor-desk/) HTTP 200，运行时版本 `4.4.6` |
| Windows x64 | `counselor-desk-4.4.6-x64.exe` · 91,159,992 bytes · SHA-256 `9e5791c28fe51e060a052fa268c691a70c4521ca1e50f7e16846120b5ed011bc` |
| Windows ARM64 | `counselor-desk-4.4.6-arm64.exe` · 85,593,360 bytes · SHA-256 `cf4f4b907527fd2bfb0dcc19f7915867194e295ff2bfb7f1cc4c8d27f34c717a` |
| macOS Universal DMG | `counselor-desk-4.4.6-mac-universal.dmg` · 195,295,258 bytes · SHA-256 `7769057cfcd0cd55514c8dc3b9ed0e80c87b0c702c059af8900f28fdb7af90da` |
| macOS Universal ZIP | `counselor-desk-4.4.6-mac-universal.zip` · 194,748,818 bytes · SHA-256 `a8514e9fdc4932a9d7357f3ccc30e725a80586959d520644feaee847274b11cd` |
| 离线 HTML | `CounselorDesk-v4.4.6-Offline.html` · 13,151,347 bytes · SHA-256 `387d7bd7e7efcd58cb79edc6bc99d4dacab32f93b2833114222e0202ce3255e9` |
| SHA-256 清单 | [Windows-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.4.6/Windows-SHA256.txt) · [macOS-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.4.6/macOS-SHA256.txt) · [Web-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.4.6/Web-SHA256.txt) |
| 签名限制 | 当前未配置 Windows/macOS 代码签名，macOS 未公证 |

## 永久已知边界

- 浏览器主记录仍有 localStorage 兼容路径；浏览器配额因设备、浏览器和 WebView 而异。
- 网页端不承诺后台自动写入备份；桌面自动备份需要受控目录和本机安全存储的备份口令。
- 防误看锁、工作台访问锁和加密备份不是同一件事；真正的数据库级透明加密尚未实现。
- AI relay 在静态 Pages 上不能自行运行；生产使用需要由使用者控制的 HTTPS 中转服务、来源白名单、允许模型域名和令牌策略。
- 对话中已经暴露过的 API key 必须由账户持有人在服务后台撤销并轮换；新密钥不得写入源码、文档、备份、日志或 Git。
