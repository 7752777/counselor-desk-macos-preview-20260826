/* Commercial license verification and entitlement state.
 *
 * The renderer only receives signed public data. License signing, device
 * registration, revocation, and payment remain server-side concerns. This
 * module deliberately keeps its state outside the business workspace so
 * student records and license credentials cannot be mixed accidentally.
 */
(function installCwbLicense(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CWBLicense = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCwbLicense(root) {
  'use strict';

  const TOKEN_PREFIX = 'CWB-LIC-1';
  const REDEMPTION_PREFIX = 'CWB-REDEEM-1.';
  const PRODUCT_ID = 'counselor-desk';
  const MAX_DEVICE_LIMIT = 3;
  const OFFLINE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
  const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
  const PLANS = Object.freeze({
    standard: Object.freeze({ label:'普通版', ai:false, perpetualUpdates:false }),
    standard_perpetual: Object.freeze({ label:'普通永久更新版', ai:false, perpetualUpdates:true }),
    ai: Object.freeze({ label:'AI 增强版', ai:true, perpetualUpdates:false }),
    ai_perpetual: Object.freeze({ label:'永久 AI 增强版', ai:true, perpetualUpdates:true }),
  });
  const ERROR_MESSAGES = Object.freeze({
    LICENSE_REQUIRED:'此功能需要 AI 增强版授权，请先激活许可证',
    LICENSE_INPUT_INVALID:'许可证格式无效，请粘贴完整激活码或导入许可证文件',
    LICENSE_SIGNATURE_INVALID:'许可证签名校验失败，请向授权方申请重新发放',
    LICENSE_PUBLIC_KEY_MISSING:'当前版本缺少许可证公钥，无法在商业模式下验证授权',
    LICENSE_PRODUCT_MISMATCH:'许可证不属于辅导员工作台',
    LICENSE_PLAN_INVALID:'许可证档位无效',
    LICENSE_VERSION_MISMATCH:'许可证不支持当前主版本',
    LICENSE_EXPIRED:'许可证已过期或已被撤销',
    LICENSE_OFFLINE_GRACE_EXPIRED:'离线授权已超过 30 天，请联网刷新许可证',
    LICENSE_CLOCK_ROLLBACK:'检测到系统时间明显回拨，请联网校验许可证',
    LICENSE_SERVICE_UNAVAILABLE:'授权服务暂时不可用，请联网后重试',
    LICENSE_DEVICE_LIMIT:'已达到许可证设备上限，请先解绑旧设备',
    LICENSE_DEVICE_NOT_FOUND:'设备不存在、已解绑或已被撤销',
    LICENSE_DEVICE_REQUIRED:'缺少设备标识，请重试',
    LICENSE_PLAN_REQUIRED:'请选择要升级到的产品档位',
    LICENSE_UPGRADE_NOT_AVAILABLE:'当前许可证不能升级到所选档位',
    LICENSE_UPGRADE_CURRENCY_MISMATCH:'升级档位的结算币种不一致，请联系维护者',
    LICENSE_QR_UNSUPPORTED:'当前环境不支持二维码图片识别，请使用许可证文件或粘贴激活码',
    LICENSE_QR_EMPTY:'二维码中没有读取到有效许可证内容',
    LICENSE_NOT_ACTIVE:'当前工作区尚未激活许可证',
    LICENSE_STATE_INVALID:'本地许可证状态损坏，请重新激活或恢复工作区',
    REDEMPTION_CODE_INVALID:'前瞻兑换码无效、已暂停或格式不正确，请联系维护者核验',
    REDEMPTION_CODE_REQUIRED:'请输入前瞻兑换码',
    REDEMPTION_STORAGE_UNAVAILABLE:'兑换服务暂时未配置，请联系维护者',
    REDEMPTION_CODE_USE_MANAGED_FLOW:'友情 AI 码需要在已激活 AI 许可证后单独配置',
    MANAGED_RELAY_CODE_REQUIRED:'请输入友情 AI 激活码',
    MANAGED_RELAY_CODE_INVALID:'友情 AI 激活码无效、已暂停或不属于友情服务',
    MANAGED_RELAY_STORAGE_UNAVAILABLE:'友情 AI 服务暂时未配置，请联系维护者',
    AI_MANAGED_RELAY_GRANT_REQUIRED:'当前工作区尚未激活友情 AI 服务',
    MANAGED_RELAY_REVOKED:'友情 AI 服务资格已撤销',
    REAL_DATA_LICENSE_REQUIRED:'真实数据功能已锁定，请先激活基础版许可证',
    FILE_UPLOAD_LICENSE_REQUIRED:'文件上传功能已锁定，请先激活基础版许可证',
  });

  const text = value => String(value == null ? '' : value).trim();
  const nowIso = value => new Date(value == null ? Date.now() : value).toISOString();
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const hasOwn = (value, key) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));

  function error(code, message, cause) {
    const value = new Error(`${code}: ${message || ERROR_MESSAGES[code] || code}`);
    value.code = code;
    if (cause) value.cause = cause;
    return value;
  }

  function bytesToBase64Url(bytes) {
    let base64;
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') base64 = Buffer.from(bytes).toString('base64');
    else {
      let binary = '';
      const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      value.forEach(byte => { binary += String.fromCharCode(byte); });
      base64 = btoa(binary);
    }
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(value, field) {
    const raw = text(value);
    if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) throw error('LICENSE_INPUT_INVALID', `${field || '许可证'}编码无效`);
    const base64 = raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - raw.length % 4) % 4);
    try {
      if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
        const bytes = Buffer.from(base64, 'base64');
        if (bytes.length === 0 || bytesToBase64Url(bytes) !== raw) throw new Error('base64 mismatch');
        return new Uint8Array(bytes);
      }
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      if (bytes.length === 0 || bytesToBase64Url(bytes) !== raw) throw new Error('base64 mismatch');
      return bytes;
    } catch (cause) {
      throw error('LICENSE_INPUT_INVALID', `${field || '许可证'}编码无效`, cause);
    }
  }

  function standardBase64ToBytes(value, field) {
    const raw = text(value);
    if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw error('LICENSE_INPUT_INVALID', `${field || '许可证'}编码无效`);
    const padded = raw + '='.repeat((4 - raw.length % 4) % 4);
    try {
      if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
        const bytes = Buffer.from(padded, 'base64');
        if (bytes.length === 0 || bytes.toString('base64') !== padded) throw new Error('base64 mismatch');
        return new Uint8Array(bytes);
      }
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      if (bytes.length === 0) throw new Error('empty base64');
      return bytes;
    } catch (cause) {
      throw error('LICENSE_INPUT_INVALID', `${field || '许可证'}编码无效`, cause);
    }
  }

  function utf8(value) {
    const input = String(value == null ? '' : value);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(input);
    if (root && typeof root.TextEncoder === 'function') return new root.TextEncoder().encode(input);
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(input, 'utf8'));
    return Uint8Array.from(unescape(encodeURIComponent(input)), char => char.charCodeAt(0));
  }

  function decodeJsonPart(value, field) {
    const bytes = base64UrlToBytes(value, field);
    let raw;
    try {
      if (typeof Buffer !== 'undefined') raw = Buffer.from(bytes).toString('utf8');
      else raw = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(raw);
      if (!isObject(parsed)) throw new Error('object required');
      return parsed;
    } catch (cause) {
      throw error('LICENSE_INPUT_INVALID', `${field || '许可证载荷'}不是有效 JSON`, cause);
    }
  }

  function parse(input) {
    if (isObject(input) && input.token) return parse(input.token);
    if (isObject(input) && input.payload && input.signature) {
      const payloadSegment = bytesToBase64Url(utf8(JSON.stringify(input.payload)));
      return normalizeParsed({
        token:`${TOKEN_PREFIX}.${payloadSegment}.${text(input.signature)}`,
        payload:input.payload,
        payload_segment:payloadSegment,
        signature_segment:text(input.signature),
      });
    }
    const token = text(input);
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) throw error('LICENSE_INPUT_INVALID');
    const payload = decodeJsonPart(parts[1], '许可证载荷');
    base64UrlToBytes(parts[2], '许可证签名');
    return normalizeParsed({ token, payload, payload_segment:parts[1], signature_segment:parts[2] });
  }

  function normalizeParsed(input) {
    const value = input || {};
    const payload = value.payload || {};
    const plan = text(payload.plan || payload.tier);
    if (!hasOwn(PLANS, plan)) throw error('LICENSE_PLAN_INVALID');
    const licenseId = text(payload.license_id || payload.id);
    const productId = text(payload.product_id || payload.product || PRODUCT_ID);
    if (!licenseId || !productId) throw error('LICENSE_INPUT_INVALID', '许可证缺少产品或许可证编号');
    const major = Number(payload.major_version || payload.supported_major || (text(payload.version).match(/^\d+/) || [0])[0]);
    if (!Number.isInteger(major) || major < 1 || major > 99) throw error('LICENSE_INPUT_INVALID', '许可证主版本无效');
    const deviceLimit = Number(payload.device_limit || MAX_DEVICE_LIMIT);
    if (!Number.isInteger(deviceLimit) || deviceLimit < 1 || deviceLimit > MAX_DEVICE_LIMIT) throw error('LICENSE_INPUT_INVALID', '许可证设备上限必须为 1 至 3 台');
    return Object.freeze({
      token:String(value.token || ''), payload:clone(payload), payload_segment:text(value.payload_segment),
      signature_segment:text(value.signature_segment), license_id:licenseId, product_id:productId,
      plan, plan_label:PLANS[plan].label,
      /* The signed plan is the entitlement source of truth. Redundant payload
         booleans must never broaden a lower tier if a server-side adapter is
         misconfigured. */
      ai:PLANS[plan].ai,
      perpetual_updates:PLANS[plan].perpetualUpdates,
      major_version:major, device_limit:deviceLimit, status:text(payload.status || 'active'),
      issued_at:text(payload.issued_at || ''), expires_at:text(payload.expires_at || ''),
      revoked_after:Number.isFinite(Number(payload.revoked_after)) ? Number(payload.revoked_after) : 0,
      kid:text(payload.kid || ''), workspace_id:text(payload.workspace_id || ''), managed_relay:payload.managed_relay === true,
    });
  }

  function nodeCrypto() {
    try {
      if (typeof require === 'function') return require('node:crypto');
    } catch (_) {}
    return null;
  }

  function publicKeyValue(publicKeys, kid) {
    const keys = publicKeys || {};
    const value = keys[kid] || keys.default || (typeof keys === 'string' ? keys : '');
    return value;
  }

  function keyObject(publicKey) {
    const crypto = nodeCrypto();
    if (!crypto || !publicKey) return null;
    if (typeof publicKey === 'object' && publicKey.type) return publicKey;
    if (typeof publicKey === 'string' && publicKey.includes('BEGIN')) return crypto.createPublicKey(publicKey);
    const der = Buffer.from(String(publicKey), 'base64');
    return crypto.createPublicKey({ key:der, format:'der', type:'spki' });
  }

  function publicKeyBytes(publicKey) {
    const value = String(publicKey || '').trim();
    if (/BEGIN PUBLIC KEY/.test(value)) {
      const body = value.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----/g, '').replace(/\s/g, '');
      const bytes = typeof Buffer !== 'undefined' ? Buffer.from(body, 'base64') : Uint8Array.from(atob(body), char => char.charCodeAt(0));
      return new Uint8Array(bytes);
    }
    return /^[A-Za-z0-9_-]+$/.test(value)
      ? base64UrlToBytes(value, '许可证公钥')
      : standardBase64ToBytes(value, '许可证公钥');
  }

  async function verifySignature(parsed, publicKeys) {
    const publicKey = publicKeyValue(publicKeys, parsed.kid);
    if (!publicKey) throw error('LICENSE_PUBLIC_KEY_MISSING');
    const signature = base64UrlToBytes(parsed.signature_segment, '许可证签名');
    return verifyBytes(utf8(parsed.payload_segment), signature, publicKey);
  }

  async function verifyBytes(data, signatureInput, publicKey) {
    if (!publicKey) throw error('LICENSE_PUBLIC_KEY_MISSING');
    const signature = signatureInput instanceof Uint8Array ? signatureInput : base64UrlToBytes(signatureInput, '签名');
    const crypto = nodeCrypto();
    if (crypto) {
      try {
        if (!crypto.verify(null, Buffer.from(data), keyObject(publicKey), Buffer.from(signature))) throw error('LICENSE_SIGNATURE_INVALID');
        return true;
      } catch (cause) {
        if (cause && cause.code === 'LICENSE_SIGNATURE_INVALID') throw cause;
        throw error('LICENSE_SIGNATURE_INVALID', undefined, cause);
      }
    }
    const subtle = root && root.crypto && root.crypto.subtle;
    if (!subtle) throw error('LICENSE_SIGNATURE_UNSUPPORTED', '当前运行环境不支持 Ed25519 签名校验');
    try {
      const key = typeof publicKey === 'object' && publicKey.kty
        ? await subtle.importKey('jwk', publicKey, { name:'Ed25519' }, false, ['verify'])
        : await subtle.importKey('spki', publicKeyBytes(String(publicKey).replace(/^data:.*?,/, '')), { name:'Ed25519' }, false, ['verify']);
      const ok = await subtle.verify({ name:'Ed25519' }, key, signature, data);
      if (!ok) throw error('LICENSE_SIGNATURE_INVALID');
      return true;
    } catch (cause) {
      if (cause && cause.code === 'LICENSE_SIGNATURE_INVALID') throw cause;
      throw error('LICENSE_SIGNATURE_INVALID', undefined, cause);
    }
  }

  function majorOf(version) {
    const match = String(version || '').match(/^(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function dateMs(value) {
    const time = Date.parse(String(value || ''));
    return Number.isFinite(time) ? time : 0;
  }

  function evaluate(parsed, options) {
    const opts = options || {};
    const currentVersion = text(opts.currentVersion || '4.9.1');
    const now = Number(opts.now == null ? Date.now() : opts.now);
    const state = opts.state || {};
    if (!parsed || parsed.product_id !== text(opts.productId || PRODUCT_ID)) throw error('LICENSE_PRODUCT_MISMATCH');
    if (parsed.status && !['active', 'grace', 'renewed'].includes(parsed.status)) throw error('LICENSE_EXPIRED');
    if (parsed.revoked_after && dateMs(parsed.issued_at) && dateMs(parsed.issued_at) <= parsed.revoked_after) throw error('LICENSE_EXPIRED');
    const currentMajor = majorOf(currentVersion);
    if (parsed.major_version !== currentMajor && !opts.allowVersionMismatch && !parsed.perpetual_updates) throw error('LICENSE_VERSION_MISMATCH');
    const expiresAt = dateMs(parsed.expires_at);
    if (expiresAt && now > expiresAt + MAX_CLOCK_SKEW_MS) throw error('LICENSE_EXPIRED');
    const lastSeen = dateMs(state.last_seen_at);
    if (lastSeen && now + MAX_CLOCK_SKEW_MS < lastSeen) throw error('LICENSE_CLOCK_ROLLBACK');
    const lastOnline = dateMs(state.last_online_at || parsed.issued_at);
    if (opts.offline === true && lastOnline && now - lastOnline > Number(opts.offlineGraceMs || OFFLINE_GRACE_MS)) throw error('LICENSE_OFFLINE_GRACE_EXPIRED');
    return Object.freeze({
      ok:true, license_id:parsed.license_id, product_id:parsed.product_id, plan:parsed.plan,
      plan_label:parsed.plan_label, ai:parsed.ai, updates:parsed.perpetual_updates || parsed.major_version === currentMajor,
      perpetual_updates:parsed.perpetual_updates, major_version:parsed.major_version,
      device_limit:parsed.device_limit, status:parsed.status, offline:opts.offline === true,
      validated_at:nowIso(now), expires_at:parsed.expires_at,
    });
  }

  function memoryStorage() {
    let value = null;
    return { get:() => value, set:next => { value = clone(next); }, remove:() => { value = null; } };
  }

  function defaultStorage() {
    const bridge = root && root.cwbDesktop;
    if (bridge && typeof bridge.getLicenseState === 'function') {
      return {
        get:() => bridge.getLicenseState(),
        set:value => bridge.setLicenseState(value),
        remove:() => typeof bridge.deleteLicenseState === 'function' ? bridge.deleteLicenseState() : bridge.setLicenseState(null),
      };
    }
    const storage = root && root.localStorage;
    const key = 'cwb_license_state_v1';
    if (storage) return {
      get:() => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; } },
      set:value => { storage.setItem(key, JSON.stringify(value)); },
      remove:() => { storage.removeItem(key); },
    };
    return memoryStorage();
  }

  function deviceId(storage, random) {
    const key = 'cwb_license_device_id_v1';
    let current = storage && storage.getDevice ? storage.getDevice() : null;
    if (!current) {
      const bytes = new Uint8Array(16);
      if (root && root.crypto && typeof root.crypto.getRandomValues === 'function') root.crypto.getRandomValues(bytes);
      else if (random) random(bytes);
      else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
      current = `device_${bytesToBase64Url(bytes)}`;
      if (storage && storage.setDevice) storage.setDevice(current);
      else if (root && root.localStorage) { try { root.localStorage.setItem(key, current); } catch (_) {} }
    }
    return current;
  }

  function createEntitlements(manager, options) {
    const opts = options || {};
    const mode = text(opts.mode || 'development').toLowerCase();
    const labels = Object.freeze({ real_data:'真实数据与业务记录', file_upload:'文件与附件上传', ai:'AI 增强功能', managed_relay:'开发者托管 AI', core_update:'当前核心版本更新', perpetual_updates:'永久更新权益' });
    const isAi = feature => String(feature || '').trim().toLowerCase() === 'ai' || /^ai(?:[._:-]|$)/i.test(String(feature || ''));
    const has = feature => {
      if (mode !== 'commercial') return true;
      if (manager && typeof manager.hasFeature === 'function') return manager.hasFeature(feature);
      const state = manager && typeof manager.getState === 'function' ? manager.getState() : {};
      const current = state.license;
      if (!current) return false;
      if (String(feature || '') === 'managed_relay') return Boolean(state.managed_relay && state.managed_relay.status === 'active');
      if (String(feature || '') === 'real_data' || String(feature || '') === 'file_upload') return true;
      if (isAi(feature)) return current.ai === true;
      if (String(feature || '') === 'perpetual_updates') return current.perpetual_updates === true;
      if (String(feature || '') === 'core_update' || String(feature || '') === 'updates') return current.updates === true;
      return false;
    };
    const requireFeature = feature => {
      if (has(feature)) return true;
      const key = String(feature || '');
      const failure = error(key === 'real_data' ? 'REAL_DATA_LICENSE_REQUIRED' : key === 'file_upload' ? 'FILE_UPLOAD_LICENSE_REQUIRED' : 'LICENSE_REQUIRED');
      failure.feature = key;
      if (typeof opts.onRequired === 'function') { try { opts.onRequired(failure); } catch (_) {} }
      throw failure;
    };
    return Object.freeze({ mode, labels, has, require:requireFeature, state:() => manager && typeof manager.getState === 'function' ? manager.getState() : {} });
  }

  function createManager(options) {
    const opts = options || {};
    const mode = text(opts.mode || (root && root.CWB_LICENSE_MODE) || 'development').toLowerCase();
    const storage = opts.storage || defaultStorage();
    const publicKeys = opts.publicKeys || (root && root.CWB_LICENSE_PUBLIC_KEYS) || {};
    const currentVersion = text(opts.currentVersion || (root && root.CWB_APP_VERSION) || '4.9.1');
    const productId = text(opts.productId || PRODUCT_ID);
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    const state = { status: mode === 'commercial' ? 'unlicensed' : 'development', reason:mode === 'commercial' ? 'LICENSE_NOT_ACTIVE' : 'development_mode', license:null, token:'', activation_mode:'none', last_online_at:'', last_seen_at:'', device_id:'', managed_relay:null };
    let persisted = null;
    let readyResolve;
    const ready = new Promise(resolve => { readyResolve = resolve; });
    const publicLicense = parsed => parsed ? {
      license_id:parsed.license_id, product_id:parsed.product_id, plan:parsed.plan, plan_label:parsed.plan_label,
      ai:parsed.ai, updates:parsed.perpetual_updates || parsed.major_version === majorOf(currentVersion),
      perpetual_updates:parsed.perpetual_updates, major_version:parsed.major_version,
      device_limit:parsed.device_limit, status:parsed.status, issued_at:parsed.issued_at, expires_at:parsed.expires_at, kid:parsed.kid,
    } : null;
    const emit = () => { if (root && typeof root.dispatchEvent === 'function') { try { root.dispatchEvent(new CustomEvent('cwb:license-state', { detail:api.getState() })); } catch (_) {} } };
    const writeState = async () => {
      const safe = { status:state.status, reason:state.reason, license:state.license, token:state.token, activation_mode:state.activation_mode, last_online_at:state.last_online_at, last_seen_at:state.last_seen_at, device_id:state.device_id, managed_relay:state.managed_relay };
      await Promise.resolve(storage.set(safe));
    };
    const refreshMemory = parsed => {
      state.license = parsed ? clone(parsed) : null;
      state.status = parsed ? 'active' : (mode === 'commercial' ? 'unlicensed' : mode);
      state.reason = parsed ? '' : (mode === 'commercial' ? 'LICENSE_NOT_ACTIVE' : `${mode}_mode`);
    };
    const hydrate = async () => {
      try { persisted = await Promise.resolve(storage.get()); } catch (_) { persisted = null; }
      if (persisted && typeof persisted === 'object') {
        state.token = text(persisted.token);
        state.activation_mode = text(persisted.activation_mode || (persisted.last_online_at ? 'online' : state.token ? 'offline' : 'none')) || 'none';
        state.last_online_at = text(persisted.last_online_at);
        state.last_seen_at = text(persisted.last_seen_at);
        state.device_id = text(persisted.device_id);
        state.managed_relay = persisted.managed_relay && typeof persisted.managed_relay === 'object' ? clone(persisted.managed_relay) : null;
        if (state.token) {
          try {
            const parsed = parse(state.token);
            await verifySignature(parsed, publicKeys);
            evaluate(parsed, { currentVersion, productId, now:now(), state, offline:true });
            refreshMemory(parsed);
            if (!state.managed_relay || state.managed_relay.license_id !== parsed.license_id || state.managed_relay.status !== 'active') state.managed_relay = null;
          } catch (cause) {
            state.status = mode === 'commercial' ? 'expired' : mode;
            state.reason = cause.code || 'LICENSE_STATE_INVALID';
          }
        }
      }
      if (!state.device_id) state.device_id = deviceId(storage);
      readyResolve(api.getState()); emit();
      return api.getState();
    };
    const onlineTransport = () => opts.transport || (root && root.CWB_LICENSE_TRANSPORT) || null;
    const isAi = feature => String(feature || '').trim().toLowerCase() === 'ai' || /^ai(?:[._:-]|$)/i.test(String(feature || ''));
    const currentDecision = () => {
      if (mode !== 'commercial') return { ok:true, ai:true, updates:true, perpetual_updates:true };
      if (!state.license) return null;
      try {
        return evaluate(state.license, { currentVersion, productId, now:now(), state, offline:true });
      } catch (cause) {
        state.license = null;
        state.status = 'expired';
        state.reason = cause.code || 'LICENSE_STATE_INVALID';
        return null;
      }
    };
    const hasFeature = feature => {
      const decision = currentDecision();
      if (!decision) return false;
      if (String(feature || '') === 'managed_relay') return Boolean(state.managed_relay && state.managed_relay.status === 'active' && state.managed_relay.license_id === (state.license && state.license.license_id));
      if (String(feature || '') === 'real_data' || String(feature || '') === 'file_upload') return true;
      if (isAi(feature)) return decision.ai === true;
      if (String(feature || '') === 'perpetual_updates') return decision.perpetual_updates === true;
      if (String(feature || '') === 'core_update' || String(feature || '') === 'updates') return decision.updates === true;
      return false;
    };
    const serviceErrorCode = cause => {
      const code = String(cause && cause.code || '');
      return ['LICENSE_DEVICE_LIMIT', 'LICENSE_DEVICE_NOT_FOUND', 'LICENSE_WORKSPACE_MISMATCH', 'LICENSE_REVOKED', 'LICENSE_NOT_FOUND', 'LICENSE_PRODUCT_MISMATCH', 'LICENSE_VERSION_MISMATCH', 'LICENSE_EXPIRED', 'REDEMPTION_CODE_INVALID', 'REDEMPTION_CODE_REQUIRED', 'REDEMPTION_STORAGE_UNAVAILABLE', 'REDEMPTION_CODE_USE_MANAGED_FLOW', 'MANAGED_RELAY_CODE_REQUIRED', 'MANAGED_RELAY_CODE_INVALID', 'MANAGED_RELAY_STORAGE_UNAVAILABLE', 'AI_MANAGED_RELAY_GRANT_REQUIRED', 'MANAGED_RELAY_REVOKED'].includes(code)
        ? code
        : 'LICENSE_SERVICE_UNAVAILABLE';
    };
    const validateToken = async token => { const parsed = parse(token); await verifySignature(parsed, publicKeys); evaluate(parsed, { currentVersion, productId, now:now(), state, offline:false }); return parsed; };
    const persistActive = async (token, parsed, options) => {
      const offline = Boolean(options && options.offline);
      const previousLicenseId = state.license && state.license.license_id;
      const seenAt = nowIso(now());
      state.token = token;
      state.activation_mode = offline ? 'offline' : 'online';
      if (!offline) state.last_online_at = seenAt;
      state.last_seen_at = seenAt;
      refreshMemory(parsed);
      if (previousLicenseId && previousLicenseId !== parsed.license_id) state.managed_relay = null;
      state.reason = offline ? 'LICENSE_SERVICE_UNAVAILABLE' : '';
      await writeState(); emit(); return api.getState();
    };
    const persistOffline = async (token, parsed, cause) => {
      evaluate(parsed, { currentVersion, productId, now:now(), state, offline:true });
      return persistActive(token, parsed, { offline:true, cause });
    };
    const api = {
      mode,
      ready,
      parse,
      isRedemptionCode:input => /^CWB-REDEEM-1\.[A-Za-z0-9_-]{32,512}$/.test(text(input)),
      verify:async token => { const parsed = parse(token); await verifySignature(parsed, publicKeys); return parsed; },
      evaluate:(parsed, extra) => evaluate(parsed, Object.assign({ currentVersion, productId, state, now:now() }, extra || {})),
      hasFeature,
      getState:() => clone({ status:state.status, reason:state.reason, license:publicLicense(state.license), managed_relay:state.managed_relay, activation_mode:state.activation_mode, last_online_at:state.last_online_at, last_seen_at:state.last_seen_at, device_id:state.device_id, commercial:mode === 'commercial', offline_grace_days:30 }),
      async activate(input) {
        await ready;
        const token = text(isObject(input) ? input.token || input.license || input.code : input);
        const parsed = await validateToken(token);
        const transport = onlineTransport();
        if (!transport || typeof transport.activate !== 'function') return persistOffline(token, parsed);
        let response;
        try {
          response = await transport.activate({ token, license_id:parsed.license_id, product_id:productId, workspace_id:text(opts.workspaceId && opts.workspaceId()), device_id:state.device_id });
        } catch (cause) {
          const code = serviceErrorCode(cause);
          if (code === 'LICENSE_SERVICE_UNAVAILABLE') return persistOffline(token, parsed, cause);
          throw error(code, undefined, cause);
        }
        const nextToken = text(response && (response.token || response.license_token)) || token;
        const nextParsed = nextToken === token ? parsed : await validateToken(nextToken);
        return persistActive(nextToken, nextParsed);
      },
      async redeem(input) {
        await ready;
        const code = text(isObject(input) ? input.code || input.token : input);
        if (!api.isRedemptionCode(code)) throw error('REDEMPTION_CODE_INVALID');
        const transport = onlineTransport();
        if (!transport || typeof transport.redeem !== 'function') throw error('LICENSE_SERVICE_UNAVAILABLE');
        let response;
        try { response = await transport.redeem({ code, workspace_id:text(opts.workspaceId && opts.workspaceId()), device_id:state.device_id, product_id:productId }); }
        catch (cause) { throw error(serviceErrorCode(cause), undefined, cause); }
        const nextToken = text(response && (response.token || response.license_token));
        if (!nextToken) throw error('REDEMPTION_STORAGE_UNAVAILABLE');
        return persistActive(nextToken, await validateToken(nextToken));
      },
      hasManagedRelay:() => Boolean(state.managed_relay && state.managed_relay.status === 'active' && state.managed_relay.license_id === (state.license && state.license.license_id)),
      async redeemManagedRelay(input) {
        await ready;
        if (!state.token || !state.license || !state.license.ai) throw error('LICENSE_REQUIRED', '请先激活 AI 增强版许可证');
        const code = text(isObject(input) ? input.code || input.token : input);
        if (!code || !api.isRedemptionCode(code)) throw error('MANAGED_RELAY_CODE_INVALID');
        const transport = onlineTransport();
        if (!transport || typeof transport.redeemManagedRelay !== 'function') throw error('LICENSE_SERVICE_UNAVAILABLE');
        let response;
        try { response = await transport.redeemManagedRelay({ code, token:state.token, license_id:state.license.license_id, workspace_id:text(opts.workspaceId && opts.workspaceId()), device_id:state.device_id }); }
        catch (cause) { throw error(serviceErrorCode(cause), undefined, cause); }
        const grant = response && response.grant;
        if (!grant || grant.status !== 'active' || grant.license_id !== state.license.license_id) throw error('MANAGED_RELAY_STORAGE_UNAVAILABLE');
        state.managed_relay = clone(grant); await writeState(); emit(); return api.getState();
      },
      async refresh() {
        await ready;
        if (!state.token) throw error('LICENSE_NOT_ACTIVE');
        const parsed = await validateToken(state.token);
        const transport = onlineTransport();
        if (!transport || typeof transport.refresh !== 'function') return persistOffline(state.token, parsed);
        let response;
        try { response = await transport.refresh({ token:state.token, license_id:parsed.license_id, device_id:state.device_id, workspace_id:text(opts.workspaceId && opts.workspaceId()) }); }
        catch (cause) {
          const code = serviceErrorCode(cause);
          if (code === 'LICENSE_REVOKED' || code === 'LICENSE_EXPIRED' || code === 'LICENSE_NOT_FOUND') {
            state.license = null; state.status = 'expired'; state.reason = code;
            state.activation_mode = 'none'; await writeState(); emit();
          }
          if (code === 'LICENSE_SERVICE_UNAVAILABLE') return persistOffline(state.token, parsed, cause);
          throw error(code, undefined, cause);
        }
        const nextToken = text(response && (response.token || response.license_token)) || state.token;
        const nextParsed = nextToken === state.token ? parsed : await validateToken(nextToken);
        state.token = nextToken; state.last_online_at = nowIso(now()); state.last_seen_at = state.last_online_at; refreshMemory(nextParsed); if (response && response.managed_relay && response.managed_relay.status === 'active') state.managed_relay = clone(response.managed_relay); else if (!response || !response.managed_relay) state.managed_relay = null; state.reason = '';
        await writeState(); emit(); return api.getState();
      },
      async deactivate() {
        await ready;
        const previous = api.getState();
        const transport = onlineTransport();
        if (state.token && transport && typeof transport.deactivate === 'function') {
          try { await transport.deactivate({ token:state.token, license_id:state.license && state.license.license_id, device_id:state.device_id, workspace_id:text(opts.workspaceId && opts.workspaceId()) }); } catch (cause) { throw error(serviceErrorCode(cause), undefined, cause); }
        }
        state.token = ''; state.license = null; state.managed_relay = null; state.activation_mode = 'none'; state.last_online_at = ''; state.last_seen_at = ''; state.status = mode === 'commercial' ? 'unlicensed' : mode; state.reason = mode === 'commercial' ? 'LICENSE_NOT_ACTIVE' : `${mode}_mode`;
        await Promise.resolve(storage.remove ? storage.remove() : storage.set(null)); emit();
        return { ok:true, previous_license_id:previous.license && previous.license.license_id || '' };
      },
      async listDevices() {
        await ready;
        if (!state.token || !state.license) throw error('LICENSE_NOT_ACTIVE');
        const transport = onlineTransport();
        if (!transport || typeof transport.listDevices !== 'function') return [];
        return transport.listDevices({ token:state.token, license_id:state.license.license_id, device_id:state.device_id, workspace_id:text(opts.workspaceId && opts.workspaceId()) });
      },
      async deactivateDevice(targetDeviceId) {
        await ready;
        if (!state.token || !state.license) throw error('LICENSE_NOT_ACTIVE');
        const target = text(targetDeviceId);
        if (!target) throw error('LICENSE_DEVICE_REQUIRED');
        if (target === state.device_id) return api.deactivate();
        const transport = onlineTransport();
        if (!transport || typeof transport.deactivateDevice !== 'function') throw error('LICENSE_SERVICE_UNAVAILABLE');
        try {
          return await transport.deactivateDevice({
            token:state.token,
            license_id:state.license.license_id,
            device_id:state.device_id,
            target_device_id:target,
            workspace_id:text(opts.workspaceId && opts.workspaceId()),
          });
        } catch (cause) {
          throw error(serviceErrorCode(cause), undefined, cause);
        }
      },
      async createUpgradeOrder(input) {
        await ready;
        if (!state.token || !state.license) throw error('LICENSE_NOT_ACTIVE');
        const targetPlan = text(input && (input.target_plan || input.plan));
        if (!targetPlan) throw error('LICENSE_PLAN_REQUIRED');
        const transport = onlineTransport();
        if (!transport || typeof transport.createUpgradeOrder !== 'function') throw error('LICENSE_SERVICE_UNAVAILABLE');
        try {
          return await transport.createUpgradeOrder({
            token:state.token,
            license_id:state.license.license_id,
            device_id:state.device_id,
            workspace_id:text(opts.workspaceId && opts.workspaceId()),
            target_plan:targetPlan,
            customer_email:text(input && input.customer_email),
            idempotency_key:text(input && input.idempotency_key),
          });
        } catch (cause) {
          throw error(serviceErrorCode(cause), undefined, cause);
        }
      },
      async issueRelayAssertion(options) {
        await ready;
        if (!state.token || !state.license) throw error('LICENSE_NOT_ACTIVE');
        if (!state.license.ai) throw error('LICENSE_REQUIRED');
        const transport = onlineTransport();
        if (!transport || typeof transport.issueRelayAssertion !== 'function') throw error('LICENSE_SERVICE_UNAVAILABLE');
        try {
          const useManaged = options && options.managed_relay === true || api.hasManagedRelay();
          return await transport.issueRelayAssertion({ token:state.token, license_id:state.license.license_id, device_id:state.device_id, workspace_id:text(opts.workspaceId && opts.workspaceId()), managed_relay:useManaged });
        } catch (cause) {
          throw error(serviceErrorCode(cause), undefined, cause);
        }
      },
      exportReceipt() {
        if (!state.license) throw error('LICENSE_NOT_ACTIVE');
        return Object.freeze({ format:'cwb-license-receipt', version:1, product_id:productId, license_id:state.license.license_id, plan:state.license.plan, plan_label:state.license.plan_label, ai:state.license.ai, perpetual_updates:state.license.perpetual_updates, activated_at:state.last_online_at, device_id:state.device_id, generated_at:nowIso(now()) });
      },
    };
    hydrate();
    return api;
  }

  return Object.freeze({ TOKEN_PREFIX, REDEMPTION_PREFIX, PRODUCT_ID, MAX_DEVICE_LIMIT, OFFLINE_GRACE_MS, PLANS, ERROR_MESSAGES, parse, verifySignature, verifyBytes, evaluate, createManager, createEntitlements });
});
