# v4.7.1 发布收尾记录

更新时间：2026-08-21（正式发布证据已回填）

本记录只对应 `v4.7.1`，不借用历史 `v4.7.0` 的 Tag、Release、Pages 或 SHA-256 证据。`v4.7.0` 保留为上一版参考工作台正式发布；本版本是其后的 AI、保存链路、交互连续性和跨端一致性维护版本。

## 版本边界

- 版本：`4.7.1`
- 数据工作区协议：`schema_version: 8`
- 业务数据版本：`data_schema_version: 10`
- 稳定关联：业务记录继续优先使用 `student_id`，学号只作快照和兼容筛选
- 迁移：不新增业务集合，不删除旧集合，不覆盖历史 Tag/Release
- 仓库：`7752777/counselor-desk`，私有仓库
- 发布分支：`codex/ai-upgrade`
- 发布提交：`41a2218fdf16806400512ec80ff3cb0cd0dbbf34`
- Tag：`v4.7.1` 已推送并保留；未移动历史 `v4.7.0` Tag/Release
- Release：已公开为非 Draft、非 prerelease，但仓库私有，下载需要仓库权限

## 本版本收口内容

### AI 可用性与治理

- 生成按钮在点击前检查模型存在、启用状态、模型名称、用途授权、当前会话凭据、视觉能力和每日额度。
- `CWB.ai.run()` 保留请求前二次校验，不能通过脚本绕过页面入口限制。
- `v4_ai_audit.provider_id` 让每日成功生成额度按“模型连接 + 用途”隔离；旧审计按连接器和模型名兼容读取。
- 连接测试、失败、取消和本地通知预览不会扣除生成额度；未配置模型时本地通知预览仍可用。
- AI 生成结果仍只进入建议或草稿，未经人工确认不得修改学生事实、心理、纪律、资助、预警、党团、住宿或奖惩数据。

### 按钮、保存和来源链

- 表单和确认操作接入统一保存队列；保存失败时保留输入、附件选择和弹窗，可直接重试。
- 来源记录编辑或删除时，关联工作留痕草稿同步标记为“来源已变化/来源已删除”，不能用旧事实直接归档。
- 工具结果和科研阶段任务使用稳定来源键幂等保存，重复点击不会重复创建任务或留痕。
- 附件业务记录采用失败回滚、共享引用保护和孤儿附件清理，避免业务记录写入失败后留下不可追踪附件。
- 证书确认必须匹配真实学生档案；不存在的 `student_id` 不再被写入奖惩记录。

### 页面与跨端

- 首页摘要、学生台账卡片、AI 工作区和右侧上下文区完成桌面三栏复核。
- 移动端导航抽屉、遮罩、Escape、焦点返回、底部快捷栏和 `aria-hidden` 状态完成 `390×844` 复核。
- Electron 学生台账的表格、卡片、照片模式共用持久化视图设置，刷新/重启后保持照片、宿舍、导师、班主任和家长关系展示；电话仍默认脱敏。
- 工作汇报页面保留“生成区间草稿”能力，不再把模型连接等技术配置暴露给日常工作摘要。

## 已执行验证

在版本号修改前的候选代码状态已经通过：

```text
node tests/ai-provider-readiness.js
node tests/ai-workflow-ui.js
node tests/certificate-recognition.js
node tests/ux-operations.js
pnpm test:cwb-ai
pnpm test:optimization
pnpm test:v47
pnpm lint
pnpm test
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
git diff --check
```

版本号和发布文档修改后，远端发布门禁已在 GitHub runner 上重新执行；Windows/macOS runner、正式 Release 和 Pages 不能由本地命令代替，以下以实际流水线结果为准。

本地版本化验证结果：

```text
pnpm test                 PASS
pnpm build:release        PASS
pnpm test:release         PASS
pnpm lint                 PASS
pnpm check:public         PASS
pnpm check:secrets        PASS（282 个仓库文件）
git diff --check          PASS
```

完整回归覆盖 40 个视图、10,000 条导入性能样本、备份/恢复、附件、IndexedDB、Electron、v8/v9/v10 迁移和交换包；JSDOM 夹具中的 `c.local` 外部脚本加载提示是既有测试噪声，相关测试均以退出码 0 完成。

远端正式发布门禁 [Actions #32419507351](https://github.com/7752777/counselor-desk/actions/runs/32419507351) 已成功完成 Tests、Windows、macOS、Web、Draft 创建、直接上传、附件核对和正式公开。平台 job 证据分别为 Windows [#96589790245](https://github.com/7752777/counselor-desk/actions/runs/32419507351/job/96589790245)、macOS [#96591167440](https://github.com/7752777/counselor-desk/actions/runs/32419507351/job/96591167440)、Web [#96592231759](https://github.com/7752777/counselor-desk/actions/runs/32419507351/job/96592231759) 和最终 Release [#96592304232](https://github.com/7752777/counselor-desk/actions/runs/32419507351/job/96592304232)。

## 发布证据

以下是本次实际发布证据：

| 项目 | 证据 |
| --- | --- |
| 发布提交 | [`41a2218fdf16806400512ec80ff3cb0cd0dbbf34`](https://github.com/7752777/counselor-desk/commit/41a2218fdf16806400512ec80ff3cb0cd0dbbf34) |
| Tag | [`v4.7.1`](https://github.com/7752777/counselor-desk/tree/v4.7.1)，已推送 |
| Windows Actions | [#96589790245](https://github.com/7752777/counselor-desk/actions/runs/32419507351/job/96589790245)，构建、x64/ARM64 架构、安装器烟测、哈希和直传均通过 |
| macOS Actions | [#96591167440](https://github.com/7752777/counselor-desk/actions/runs/32419507351/job/96591167440)，Universal DMG/ZIP、双架构、挂载/启动烟测、哈希和直传均通过 |
| Web Actions | [#96592231759](https://github.com/7752777/counselor-desk/actions/runs/32419507351/job/96592231759)，离线 HTML 构建、命名、哈希和直传均通过 |
| Draft/正式 Release | [`v4.7.1 Release`](https://github.com/7752777/counselor-desk/releases/tag/v4.7.1)，2026-08-21 05:43（北京时间）公开，非 Draft、非 prerelease；仓库私有，需权限访问 |
| Release 资产 | `counselor-desk-4.7.1-x64.exe` 90,490,625 B；`counselor-desk-4.7.1-arm64.exe` 84,853,441 B；`counselor-desk-4.7.1-mac-universal.dmg` 195,493,574 B；`counselor-desk-4.7.1-mac-universal.zip` 194,908,184 B；`CounselorDesk-v4.7.1-Offline.html` 13,807,127 B |
| Web SHA-256 | `08cf6fa5a55dd0b26354d5c4cba72e98b5c348a888858cdd576bddb883ca4557` |
| Windows SHA-256 | x64: `4BD5DBD821480BA268446EDA7215E1335AFD9F77459D193C332434E4CC4832BC`；ARM64: `B27ED9705053F806C7463749EDEF849C2B95CA6D78375F943B97AA22F3BF3852` |
| macOS SHA-256 | DMG: `1efa1fd981e890ec87b8294b1fde8bb2a69722d962a013aa280477620d815f06`；ZIP: `007a1cdad5884e436e2b1a8e0eb189094649e51eaf052c4320c9d7930a06a19c` |
| Pages 部署 | [#32421035179](https://github.com/7752777/counselor-desk/actions/runs/32421035179) 因分支环境保护拒绝；从 `master` 重试的 [#32421073455](https://github.com/7752777/counselor-desk/actions/runs/32421073455) 因当前 GitHub 计划不支持私有仓库 Pages 失败。没有可用 Pages 入口，不为此公开仓库。 |
| 签名/公证 | Windows/macOS 未配置代码签名；macOS 未公证，安装前必须核对对应清单 |
| 发布流程维护 | 旧 Actions artifact 配额曾阻断上传；清理 98 个临时 artifact 后将发布改为各平台校验后直接上传 Draft，避免大文件依赖 Actions artifact 存储 |

## 已知限制

- 当前“隐私锁”仍是防误看界面限制，不等同于数据库级加密；真正加密和密钥生命周期是独立高风险批次。
- 真实模型质量、网络延迟、图片识别质量和外部 relay 可用性需要在配置真实 provider 后另行验收。
- 历史曾在对话中暴露过的 API key 必须由账户持有人在服务商侧撤销并轮换；源码、文档、备份、日志和 Release 不保存密钥。
- Windows/macOS 构建未配置代码签名，macOS 未公证；安装前应核对对应 SHA-256 清单并遵循学校设备策略。
- GitHub 当前计划不支持私有仓库 Pages；仓库保持私有是源码保护的明确要求，因此 v4.7.1 以有权限的 GitHub Release、离线 HTML 和桌面安装包作为正式交付入口。需要公开网页时，必须另选学校批准且受控的静态托管，不得把仓库改回公开来绕过限制。
- 内置浏览器的人工截图控制能力受会话环境影响；本轮已用可用浏览器视口完成页面检查，自动化测试仍是跨端回归的主要证据。

## 发布后维护候选（未计入 v4.7.1 Release）

发布证据回填后，维护工作区继续补齐高频操作的下一步连贯性：

- 首页摘要入口直接带任务、谈话、学生、草稿和查课筛选；任务增加截止状态筛选，谈话增加回访状态筛选。
- 全局搜索覆盖通讯录、家校联系、科研课题、课表、工作草稿、工具入口和 AI 建议，并将命中词传入目标页筛选状态。
- 待确认工作记录增加搜索、清除筛选、来源存在性提示和原记录回链；来源删除时仍阻止旧草稿归档。
- 右侧当前上下文新增“新建任务、记一次谈话、记工作留痕、识别通知”四个入口；有当前学生时，任务和工作留痕预填姓名/学号并保留稳定 `student_id`，谈话保存继续按稳定 ID/学号兼容恢复。按钮在桌面端采用两列布局，未选学生时不注入隐式关联。
- 当前学生区新增“清除当前学生”操作，清除会同步重置 AI/页面学生选择和目标事项，避免后续记录误关联上一名学生；学生档案内的直接谈话入口也已改为传递稳定 `student_id`。这批维护代码尚未进入 `v4.7.1` 正式产物。

这批维护代码及新增回归已通过 `pnpm test:optimization`、`pnpm test:ux`、`pnpm test:interaction`、`pnpm test:v46`、`node tests/ai-cross-module-audit.js` 和 `pnpm lint`，但尚未生成新的正式产物，也没有移动 `v4.7.1` Tag、Release 或 SHA-256 证据。下一次发布前必须在代码和文档稳定后重新执行完整测试、构建、公开面、密钥扫描、发布契约和产物哈希；不能用本节的定向验证替代正式发布门禁。

### 维护候选追加：工作记录草稿回滚

在上述维护候选基础上，当前工作区又补充了待确认工作记录的失败回滚：页面确认和驳回动作均等待真实保存结果；失败时恢复原状态并保留可重试入口；重复确认只更新同一条正式留痕，不重复创建。为兼容既有同步集成，`CWB.worklogDrafts.confirm()` / `dismiss()` 保持同步返回语义，页面使用 `confirmAsync()` / `dismissAsync()` 等待落盘。业务档案、就业联系页面也已同步说明稳定 `student_id` 与学号快照的关系。

新增回归已通过 `pnpm test:interaction`、`pnpm test:cwb-ai`、`pnpm test:optimization`、`pnpm test:v47`、`pnpm lint` 和完整 `pnpm test`。完整测试中的 `c.local` 外部脚本加载输出属于 JSDOM 夹具噪声，不是本地页面运行错误。这些改动仍未进入 `v4.7.1` 正式产物；本文件的发布提交、Tag、Release、资产和 SHA-256 证据不因工作区候选变化而改变。

### 维护候选追加：AI 证书与工作总结保存事务

发布后继续检查 AI 页面按钮的真实保存结果，当前工作区新增但未计入 `v4.7.1` Release 的维护内容如下：

- 证书识别草稿创建失败时恢复 `v4_ai_drafts` 和生成审计回链；证书人工确认只提交 `rewards + custom`，不再触发全量保存。
- AI 工作总结把正式留痕、建议状态、确认审计和工作记录草稿纳入统一快照，最后等待 `worklogs + custom` 保存。任一分支失败都恢复到确认前状态，成功重试不会重复创建留痕。
- AI 保存结果的单集合和多集合错误均保留底层错误信息，避免界面只显示无法诊断的通用失败文案；提示仍经过安全错误码和敏感信息过滤。

本候选已通过 `pnpm test:interaction`、`pnpm test:cwb-ai`、`pnpm test:optimization`、`pnpm test:v47` 和 `pnpm lint`。这些验证不改变本文件中 `v4.7.1` 的提交 SHA、Tag、Release 资产和 SHA-256 证据；本候选尚未生成新的正式构建、Tag、Release 或 Pages 部署。文档收口后仍需执行 `git diff --check`，形成下一个正式版本前必须重新执行完整发布门禁。

## 发布后回填规则

本版本的实际提交 SHA、Tag、Actions、Release、Pages 限制、产物文件名、文件大小、SHA-256、签名状态和访问结果已回填到本文件、`current-baseline.md`、`docs/release-guide.md` 和 `CHANGELOG.md`。不得用历史 `v4.7.0` 的证据替代 `v4.7.1`。
