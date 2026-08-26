/* Run only in a controlled terminal. Do not redirect this output to Git. */
const redemption = require('../redemption-code.cjs');

const campaigns = Object.freeze([
  { campaign_id:'pilot-standard-perpetual', plan:'standard_perpetual', label:'前瞻版普通永久更新版' },
  { campaign_id:'contributor-ai-perpetual', plan:'ai_perpetual', label:'贡献者/老客户永久 AI 增强版' },
  { campaign_id:'friendship-managed-relay', plan:'ai_perpetual', label:'贡献者友情 AI 托管服务', metadata:{ managed_relay:true, kind:'managed_relay' } },
]);
function generateCampaigns() { return campaigns.map(item => ({ ...item, ...redemption.generate(), status:'active' })); }
function main() {
  const generated = generateCampaigns();
  console.log('仅保存到受控密码管理器；关闭终端后不会再次显示明文。');
  for (const item of generated) console.log(`\n${item.label}\n活动编号: ${item.campaign_id}\n档位: ${item.plan}\n固定兑换码: ${item.code}\n兑换码哈希: ${item.code_hash}`);
  console.log('\n部署配置模板（只复制哈希，不复制明文）：');
  console.log(JSON.stringify({ campaigns:generated.map(({ campaign_id, plan, code_hash, status, metadata }) => ({ campaign_id, plan, code_hash, status, metadata:metadata || {} })) }, null, 2));
  return generated;
}
if (require.main === module) main();
module.exports = { campaigns, generateCampaigns, main };
