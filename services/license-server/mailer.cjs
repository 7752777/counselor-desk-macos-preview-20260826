/* Replaceable delivery adapter. The service stores messages in PostgreSQL
 * first; this adapter never receives student data or model credentials. */
function codedError(code, message, cause) { const error = new Error(`${code}: ${message || code}`); error.code = code; if (cause) error.cause = cause; return error; }
function createMailer(options) {
  const opts = options || {};
  if (typeof opts.send !== 'function') throw codedError('EMAIL_ADAPTER_REQUIRED', '邮件适配器必须注入 send 函数');
  return Object.freeze({ async send(message) { if (!message || !message.recipient || !message.payload) throw codedError('EMAIL_MESSAGE_INVALID'); return opts.send({ to:message.recipient, kind:message.kind, payload:message.payload, message_id:message.message_id }); } });
}
function renderLicenseDelivery(payload) {
  const value = payload || {};
  return {
    subject:`辅导员工作台许可证交付 - ${String(value.label || value.plan || '').trim()}`,
    text:[
      '感谢购买辅导员工作台。',
      `订单号：${value.order_id || ''}`,
      `许可证编号：${value.license_id || ''}`,
      `产品档位：${value.label || value.plan || ''}`,
      '',
      '请妥善保管激活码。激活码只用于当前产品工作区授权，不要发布到公共渠道。',
      `激活码：${value.token || ''}`,
    ].join('\n'),
  };
}
module.exports = { createMailer, renderLicenseDelivery, codedError };
