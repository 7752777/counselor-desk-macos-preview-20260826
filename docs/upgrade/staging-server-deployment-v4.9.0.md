# v4.9.0 授权服务前瞻候选服务器记录

更新时间：2026-08-25

## 服务器边界

新服务器 `82.156.201.93` 仅用于学工智伴的授权服务前瞻候选。旧服务器上的协同办公平台不在本部署范围内，不能复用其数据库、容器、目录或反向代理配置。

当前部署目录：

```text
/opt/counselor-license/app       服务源码
/opt/counselor-license/data      运行数据和临时文件
/opt/counselor-license/secrets   数据库密码、管理员密钥、前瞻签名密钥
```

运行用户为 `counselor-license`，PostgreSQL 数据库为 `counselor_license`，数据库账号为 `license_app`。数据库只接受本机连接。前瞻候选服务监听 `127.0.0.1:8787`，没有开放公网业务端口；系统防火墙当前只放行 SSH。

已配置：Node.js 20、PostgreSQL 14、Nginx（当前停用，等待域名）、UFW、Fail2ban 和 1GB Swap。服务器约 2GB 内存、40GB 磁盘，适合前瞻体验和小规模试运营，不代表已经满足大规模商业生产要求。

## 域名状态

域名 `windsky.store` 已于 2026-08-23 注册并完成实名审核，DNS 已由 DNSPod 接管（`ambulance.dnspod.net`、`lupus.dnspod.net`）。`license.windsky.store` 已解析到 `82.156.201.93`，证书已签发并部署到服务器，云安全组和 UFW 已放行 443，公网 HTTPS 验收通过。这不等于正式商业服务已经上线。

建议先只使用一个授权服务子域名，降低首期运维复杂度：

| 类型 | 主机记录 | 值 | 用途 |
| --- | --- | --- | --- |
| A | `license` | `82.156.201.93` | 授权 API、购买页、许可证下载和健康检查 |

在 DNSPod 添加记录后，按以下顺序继续：

1. 等待解析生效，用 `Resolve-DnsName license.windsky.store -Type A` 确认返回 `82.156.201.93`。
2. 启动 Nginx 反向代理，仅将 `license.windsky.store` 转发到 `127.0.0.1:8787`。
3. 只开放服务器 `80/443`，用 ACME/Let's Encrypt 为 `license.windsky.store` 签发证书。
4. 在云安全组和 UFW 都放行 `443/tcp` 后，用 `https://license.windsky.store/api/v1/health` 和 `https://license.windsky.store/customer` 验证健康检查、购买页和安全响应头。
5. 将商业构建地址设置为：`CWB_LICENSE_SERVICE_URL=https://license.windsky.store`、`CWB_PURCHASE_URL=https://license.windsky.store/customer`；更新清单和下载 CDN 暂不与授权 API 混用，待有正式包后再配置独立地址。
6. 在真实 Windows/macOS 设备完成激活、刷新、换机和离线宽限演练后，才允许客户使用。

当前不要添加 `AAAA` 记录，除非服务器已经配置并验证 IPv6；不要把数据库端口、`8787` 或管理端口写入 DNS，也不要把根域名直接指向授权服务。

### 2026-08-25 受控下载中心

在现有 `license.windsky.store` HTTPS 虚拟主机中新增只读 `/downloads/` 路径，静态目录为 `/var/www/counselor-downloads/`，与授权 API、PostgreSQL 和 AI Relay 分离。v4.9.0 下载页及网页包、Windows x64/arm64 安装包、完整前瞻版交付包和两份 PDF 已上传到 `/downloads/v4.9.0/`，本地与服务器 SHA-256 已逐项比对，公网探针均返回 200。当前下载中心是受控服务器交付，不是百度网盘；后续如改用百度网盘，只需替换对外链接，不影响客户端授权协议。

### 2026-08-25 增量迁移和友情 Relay 验证

旧部署已经把 `v4.9.0-redemption-campaigns` 记为已完成。为避免整份迁移被跳过，当前代码新增独立文件 `schema-managed-relay.sql` 和迁移名 `v4.9.0-managed-relay`。本次服务器执行结果为：商业迁移未重跑，兑换活动迁移未重跑，托管 Relay 迁移新增执行一次。

只读核对结果：

```text
cwb_license_redemption_campaigns
cwb_license_redemptions
cwb_license_relay_grants

contributor-ai-perpetual | active
friendship-managed-relay | active
pilot-standard-perpetual | active
```

公网探针通过：`GET /api/v1/health` 和 `GET /api/v1/products` 返回 200；受控临时许可证完成 AI 设备激活、友情码兑换和托管 Relay assertion 申请后已撤销。没有发送真实模型内容。

反向代理部署时，服务继续只监听 `127.0.0.1:8787`；在其环境文件设置 `CWB_LICENSE_TRUST_PROXY=true`，使显式受信任的本机 Nginx 转发真实客户端 IP 给限流与审计逻辑。不得把服务改为监听 `0.0.0.0`，也不得在防火墙中放行 `8787`。

域名名称、DNS 账号、证书私钥和注册商登录凭据不写入仓库或业务备份。

## 前瞻候选启动方式

服务由 `counselor-license-staging.service` 管理。它要求 `CWB_LICENSE_ENV=staging`，不会因为误执行而替代正式 `bootstrap.cjs`。正式服务必须使用外部 KMS/HSM 签名器、TLS PostgreSQL、HTTPS、正式域名和支付 webhook 验签适配器。

本机健康检查：

```bash
curl http://127.0.0.1:8787/api/v1/health
curl http://127.0.0.1:8787/api/v1/products
sudo systemctl status counselor-license-staging --no-pager
```

服务没有直接暴露到公网。需要从本地浏览器测试时，使用 SSH 本地转发：

```bash
ssh -N -L 18787:127.0.0.1:8787 ubuntu@82.156.201.93
```

然后只在本机访问 `http://127.0.0.1:18787/customer`。这只是前瞻候选通道，不可作为正式客户地址。

## 链动小铺发卡流程

当前导出工具会向授权服务申请独立签名许可证，并生成“每行一张卡密”的文本文件：

```bash
cd /opt/counselor-license/app/services/license-server
CWB_LICENSE_ADMIN_KEY="$(sudo cat /opt/counselor-license/secrets/admin-api-key)" \
  node scripts/export-license-stock.cjs \
  --url http://127.0.0.1:8787 \
  --plan standard \
  --count 20 \
  --batch-email inventory@example.com \
  --output /opt/counselor-license/data/stock-standard-20.txt
```

四档计划名：

```text
standard             10 元
standard_perpetual   20 元
ai                   40 元
ai_perpetual         60 元
```

`--batch-email` 是你自己的库存管理邮箱，不是最终客户邮箱，用于让每个库存批次具备可追溯的操作责任人。将输出文件导入链动小铺对应的数字商品库存后，平台可以按订单逐张发出。当前导出的内容是完整签名许可证，不是万能 Key；每张许可证有独立编号、档位、版本权益和最多 3 台设备限制。

重要操作规则：

- 导出文件只放在权限受控的服务器目录，不上传 Git、公开网盘或普通备份。
- 不把 Ed25519 私钥、数据库密码、管理员 Key 上传链动小铺。
- 导出前先确认链动小铺的卡密长度、换行格式、库存导入和退款处理规则。
- 退款或售后时，管理员在授权服务中撤销对应许可证；平台库存本身不能代替服务端撤销。
- 当前代码尚未接入链动小铺官方 webhook/API，因此平台付款成功只负责发库存卡密，授权服务不会把客户端声称的“已付款”当成支付事实。

## 当前完成与生产缺口

已完成：

- 新服务器隔离目录、专用运行用户、PostgreSQL 数据库和 systemd 服务；
- 四档价格和产品目录迁移；
- Ed25519 前瞻签名器，私钥不在仓库；
- 健康检查、产品查询、批量许可证签发、激活和撤销；
- 链动小铺兼容的逐行库存导出脚本；
- 临时许可证生成、激活、撤销和清理验证。
- 三类活动码真实服务器兑换验证、托管 Relay 表增量迁移和短期 assertion 验证。

仍不能宣称正式商业上线：

- 域名、A 记录、证书、服务器反向代理和云安全组 443 公网验收已完成；
- 没有正式 KMS/HSM，当前签名器仅适合前瞻候选；
- 没有链动小铺官方 webhook、退款回调和订单绑定适配器；
- 没有邮件交付、更新 CDN、Windows/macOS 安装包签名和公证；
- 尚未完成真实支付、换机、断网宽限、备份恢复和跨平台实机验收。
- 链动小铺四个商品尚未在其后台实际创建，百度网盘分享链接尚未取得；公众号简介、欢迎语和关键词回复已经实际保存，两篇用户向文章已保存为草稿但未发表。当前“工作台”回复使用受控下载中心，“激活/购买”回复使用候选购买页，待链动小铺登录后替换为最终商品总入口；这些外部事实不能用仓库占位符替代。

## 安全提醒

服务器登录密码曾在对话中暴露。正式部署前必须轮换密码，改用 SSH 公钥登录，禁用密码登录，并为授权数据库、管理员 Key 和签名密钥建立独立备份与恢复流程。
