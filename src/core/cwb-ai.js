/*
 * Local-first AI governance helpers.
 * This file deliberately has no DOM or storage dependency so it can be used by
 * the browser, the Electron renderer, tests, and future provider adapters.
 */
(function installCwbAi(root) {
  'use strict';

  const PROVIDERS = [
    { key:'openai', name:'OpenAI', protocol:'openai-compatible', baseUrl:'https://api.openai.com/v1' },
    { key:'deepseek', name:'DeepSeek', protocol:'openai-compatible', baseUrl:'https://api.deepseek.com/v1' },
    { key:'gemini', name:'Gemini', protocol:'gemini', baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai' },
    { key:'claude', name:'Claude', protocol:'anthropic', baseUrl:'https://api.anthropic.com/v1' },
    { key:'qwen', name:'通义千问', protocol:'openai-compatible', baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    { key:'zhipu', name:'智谱', protocol:'openai-compatible', baseUrl:'https://open.bigmodel.cn/api/paas/v4' },
    { key:'doubao', name:'豆包', protocol:'openai-compatible', baseUrl:'https://ark.cn-beijing.volces.com/api/v3' },
    { key:'kimi', name:'Kimi', protocol:'openai-compatible', baseUrl:'https://api.moonshot.cn/v1' },
  ];
  const PROVIDER_BY_KEY = new Map(PROVIDERS.map(item => [item.key, item]));
  const AI_PURPOSES = new Set([
    'certificate_recognition', 'work_summary', 'notice_rewrite', 'notice_capture', 'warning_assist',
    'student_summary', 'student_followup', 'talk_brief', 'talk_note', 'task_plan',
    'workday_actions', 'academic_support', 'care_followup', 'record_completeness',
    'employment_coach', 'knowledge_search', 'organization_checklist', 'competition_coach',
    'dorm_conflict', 'committee_evaluation_draft', 'research_checklist', 'class_summary', 'worklog_draft',
    'voice_transcription', 'psych_note_draft', 'cohort_summary',
  ]);
  const PURPOSE_ALIASES = Object.freeze({
    weekly_summary:'work_summary',
    monthly_summary:'work_summary',
    semester_summary:'work_summary',
    risk_review:'warning_assist',
    assistant:'work_summary',
  });
  const SENSITIVE_CATEGORIES = Object.freeze(['identity', 'contact', 'psychology', 'discipline', 'aid', 'warning', 'focus', 'attachments']);
  const SENSITIVE_GROUPS = Object.freeze({
    identity:/^(?:name|full_name|student_name|student_number|student_no|student_id_number|id_card|身份证|姓名|学号|birthday|birth_date|gender|政治面貌)$/i,
    contact:/(?:phone|mobile|电话|手机号|email|qq|address|地址|parent|家长|emergency|紧急联系人|家庭)/i,
    psychology:/(?:psych|心理|mental|scale|量表|concern|困扰|diagnos|诊断|危机)/i,
    discipline:/(?:discipline|处分|违纪|惩处|punish)/i,
    aid:/(?:grant|aid|资助|助学|困难认定|金额|amount)/i,
    warning:/(?:warning|预警|failed|挂科|risk|风险|level|等级)/i,
    focus:/(?:focus|重点学生|重点关注|关注等级)/i,
    attachments:/(?:attachment|附件|photo|照片|document|文件)/i,
  });
  const SENSITIVE_KEY = /(^name$|student.?number|student.?no|学号|full.?name|student.?name|姓名|phone|mobile|电话|手机号|id.?card|身份证|address|地址|parent|家长|psych|心理|crisis|危机|discipline|处分|grant|资助|photo|照片|focus|重点学生|warning|预警|reason|原因)/i;
  const SECRET_KEY = /(?:api.?key|secret|token|password|密钥|口令)/i;
  const DEFAULT_REQUEST_TIMEOUT_MS = 45 * 1000;
  const DEFAULT_MAX_REQUEST_BYTES = 12 * 1024 * 1024;
  const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
  const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
  const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
  const DEFAULT_MAX_SOURCE_BYTES = 512 * 1024;
  const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
  const DEFAULT_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const AUDIO_MIME_TYPES = Object.freeze(new Set([
    'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
  ]));
  const SENSITIVE_SOURCE_QUERY = /(?:api[-_]?key|access[-_]?token|auth|code|credential|email|key|mobile|name|password|passwd|phone|refresh[-_]?token|secret|session|sig(?:nature)?|student|ticket|token|uid)/i;

  function canonicalPurpose(value) {
    const key = String(value || '').trim();
    return PURPOSE_ALIASES[key] || key;
  }

  function clone(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    const output = {};
    Object.keys(value).forEach(key => { output[key] = clone(value[key]); });
    return output;
  }

  function sensitiveCategoryForKey(key) {
    const name = String(key || '');
    for (const category of SENSITIVE_CATEGORIES) if (SENSITIVE_GROUPS[category].test(name)) return category;
    return SENSITIVE_KEY.test(name) ? 'identity' : '';
  }

  function redact(value, options, inheritedAuthorization, inheritedCategory) {
    const opts = options || {};
    const authorizedCategories = new Set(Array.isArray(opts.categories) ? opts.categories : []);
    const authorizedFields = new Set(Array.isArray(opts.fields) ? opts.fields : []);
    if (Array.isArray(value)) return value.map(item => redact(item, opts, inheritedAuthorization, inheritedCategory));
    if (typeof value === 'string') {
      return inheritedAuthorization
        ? value
        : value.replace(/\b1[3-9]\d{9}\b/g, '[已脱敏]').replace(/\b\d{17}[\dXx]\b/g, '[已脱敏]');
    }
    if (!value || typeof value !== 'object') return value;
    const output = {};
    Object.keys(value).forEach(key => {
      const category = sensitiveCategoryForKey(key);
      const authorized = authorizedFields.has(key) || (category ? authorizedCategories.has(category) : inheritedCategory && authorizedCategories.has(inheritedCategory));
      if (SECRET_KEY.test(key) || ((SENSITIVE_KEY.test(key) || category) && !authorized)) output[key] = '[已脱敏]';
      else if (value[key] && typeof value[key] === 'object') output[key] = redact(value[key], opts, false, category && authorizedCategories.has(category) ? category : inheritedCategory);
      else output[key] = redact(value[key], opts, inheritedAuthorization || authorized === true, inheritedCategory);
    });
    return output;
  }

  function providerCatalog() {
    return PROVIDERS.map(clone);
  }

  function isLocalHostname(value) {
    const hostname = String(value || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  }

  function isPrivateAddress(value) {
    const address = String(value || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) {
      const parts = address.split('.').map(Number);
      if (parts.some(part => part > 255)) return true;
      const [a, b, c] = parts;
      return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2)
        || (a === 192 && b === 168) || (a === 192 && b === 88 && c === 99)
        || (a === 198 && (b === 18 || b === 19))
        || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)
        || a >= 224;
    }
    if (!address.includes(':')) return false;
    const expandIpv6 = input => {
      let normalized = String(input || '').toLowerCase();
      if (normalized.includes('.')) {
        const separator = normalized.lastIndexOf(':');
        const mapped = separator >= 0 ? normalized.slice(separator + 1) : normalized;
        if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(mapped)) return null;
        const parts = mapped.split('.').map(Number);
        if (parts.some(part => part > 255)) return null;
        const high = ((parts[0] << 8) | parts[1]).toString(16);
        const low = ((parts[2] << 8) | parts[3]).toString(16);
        normalized = `${normalized.slice(0, separator)}:${high}:${low}`;
      }
      const halves = normalized.split('::');
      if (halves.length > 2) return null;
      const parseHalf = half => half ? half.split(':').map(part => /^[0-9a-f]{1,4}$/.test(part) ? parseInt(part, 16) : NaN) : [];
      const left = parseHalf(halves[0]);
      const right = halves.length === 2 ? parseHalf(halves[1]) : [];
      if ([...left, ...right].some(part => Number.isNaN(part))) return null;
      const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
      if (missing < 0 || (halves.length === 1 && left.length !== 8)) return null;
      return [...left, ...Array.from({ length:missing }, () => 0), ...right];
    };
    const groups = expandIpv6(address);
    if (groups && groups.length === 8) {
      const [a, b, c, d, e, f, g, h] = groups;
      if (groups.every(part => part === 0) || (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && g === 0 && h === 1)) return true;
      if ((a & 0xfe00) === 0xfc00 || (a & 0xffc0) === 0xfe80 || (a & 0xff00) === 0xff00 || (a === 0x2001 && b === 0x0db8)) return true;
      if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0 || f === 0xffff)) {
        const mapped = `${g >>> 8}.${g & 255}.${h >>> 8}.${h & 255}`;
        return isPrivateAddress(mapped);
      }
      if (a === 0x2002) {
        const mapped = `${b >>> 8}.${b & 255}.${c >>> 8}.${c & 255}`;
        if (isPrivateAddress(mapped)) return true;
      }
    }
    return false;
  }

  function isPrivateHostname(hostname) {
    const value = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    return value === 'localhost' || value.endsWith('.localhost') || value.endsWith('.local')
      || value.endsWith('.internal') || isPrivateAddress(value);
  }

  function isUnsafeRemoteHostname(hostname) {
    return !isLocalHostname(hostname) && isPrivateHostname(hostname);
  }

  function normalizeBaseUrl(value) {
    const text = String(value || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(text)) throw new Error('AI_PROVIDER_BASE_URL_INVALID');
    try {
      const url = new URL(text);
      if (url.username || url.password || url.search || url.hash || !url.hostname) throw new Error('AI_PROVIDER_BASE_URL_INVALID');
      if (url.protocol === 'http:' && !isLocalHostname(url.hostname)) throw new Error('AI_PROVIDER_BASE_URL_INVALID');
      if (isUnsafeRemoteHostname(url.hostname)) throw new Error('AI_PROVIDER_BASE_URL_INVALID');
      return url.toString().replace(/\/$/, '');
    }
    catch (_) { throw new Error('AI_PROVIDER_BASE_URL_INVALID'); }
  }

  function normalizeRelayUrl(value) {
    const text = String(value || '').trim().replace(/\/+$/, '');
    if (!text) return '';
    if (text.startsWith('/') && !text.startsWith('//')) {
      if (!/\/api\/ai\/chat$/.test(text)) throw new Error('AI_PROVIDER_RELAY_URL_INVALID');
      return text;
    }
    if (!/^https?:\/\//i.test(text)) throw new Error('AI_PROVIDER_RELAY_URL_INVALID');
    try {
      const url = new URL(text);
      if (!/\/api\/ai\/chat$/.test(url.pathname) || url.username || url.password || url.search || url.hash || (url.protocol === 'http:' && !isLocalHostname(url.hostname)) || isUnsafeRemoteHostname(url.hostname)) throw new Error('AI_PROVIDER_RELAY_URL_INVALID');
      return url.toString().replace(/\/$/, '');
    }
    catch (_) { throw new Error('AI_PROVIDER_RELAY_URL_INVALID'); }
  }

  function normalizeTranscriptionUrl(value) {
    const text = String(value || '').trim().replace(/\/+$/, '');
    if (!text) return '';
    const normalized = normalizeBaseUrl(text);
    try {
      const url = new URL(normalized);
      if (!/\/audio\/transcriptions$/i.test(url.pathname)) throw new Error('AI_AUDIO_ENDPOINT_INVALID');
      return url.toString().replace(/\/$/, '');
    } catch (error) {
      if (error && error.message === 'AI_AUDIO_ENDPOINT_INVALID') throw error;
      throw new Error('AI_AUDIO_ENDPOINT_INVALID');
    }
  }

  function normalizeSourceRelayUrl(value) {
    const text = String(value || '').trim().replace(/\/+$/, '');
    if (!text) return '';
    if (text.startsWith('/') && !text.startsWith('//')) {
      if (!/\/api\/ai\/source$/.test(text)) throw new Error('AI_PROVIDER_RELAY_URL_INVALID');
      return text;
    }
    if (!/^https?:\/\//i.test(text)) throw new Error('AI_PROVIDER_RELAY_URL_INVALID');
    try {
      const url = new URL(text);
      if (!/\/api\/ai\/source$/.test(url.pathname) || url.username || url.password || url.search || url.hash || (url.protocol === 'http:' && !isLocalHostname(url.hostname)) || isUnsafeRemoteHostname(url.hostname)) throw new Error('AI_PROVIDER_RELAY_URL_INVALID');
      return url.toString().replace(/\/$/, '');
    } catch (_) { throw new Error('AI_PROVIDER_RELAY_URL_INVALID'); }
  }

  function utf8ByteLength(value) {
    const text = String(value == null ? '' : value);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).byteLength;
    try { return unescape(encodeURIComponent(text)).length; } catch (_) { return text.length; }
  }

  /* Source URLs are useful citations, but query strings often carry tokens,
     signed links, session identifiers, or student-specific parameters. Keep
     ordinary public parameters while removing values that should never reach
     a model. The stored local source keeps its original URL for user review. */
  function sanitizeOutboundUrl(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      [...url.searchParams.keys()].forEach(key => {
        if (SENSITIVE_SOURCE_QUERY.test(key)) url.searchParams.set(key, '[已脱敏]');
      });
      url.hash = '';
      return url.toString();
    } catch (_) {
      return '[已脱敏]';
    }
  }

  function normalizeProviderConfig(input) {
    const value = Object.assign({}, input || {});
    const catalog = PROVIDER_BY_KEY.get(String(value.key || ''));
    const key = String(value.key || 'custom');
    const baseUrl = normalizeBaseUrl(value.baseUrl || (catalog && catalog.baseUrl));
    const wireApi = normalizeWireApi(value.wireApi != null ? value.wireApi : value.wire_api);
    const credentialMode = String(value.credentialMode || value.credential_mode || 'user_key').trim().toLowerCase();
    if (!['user_key', 'managed_relay'].includes(credentialMode)) throw new Error('AI_CREDENTIAL_MODE_UNSUPPORTED');
    return {
      id:String(value.id || `${key}_${Date.now()}`),
      key,
      name:String(value.name || (catalog && catalog.name) || '自定义模型').trim(),
      credentialMode,
      protocol:String(value.protocol || (catalog && catalog.protocol) || 'openai-compatible'),
      // OpenAI-compatible providers are not guaranteed to expose the legacy
      // Chat Completions endpoint. Keep the protocol and wire format separate
      // so a Responses-only relay does not produce a false successful request.
      wireApi,
      baseUrl,
      relayUrl:normalizeRelayUrl(value.relayUrl),
      // Some vendors expose chat and speech on different compatible hosts.
      // Keep the default path for ordinary OpenAI-compatible services, while
      // allowing the user to enter a documented full transcription endpoint.
      transcriptionUrl:normalizeTranscriptionUrl(value.transcriptionUrl || value.transcription_url),
      model:String(value.model || '').trim(),
      // Chat and speech are separate provider capabilities. A chat model
      // must never be assumed to accept /audio/transcriptions.
      transcriptionModel:String(value.transcriptionModel || value.transcription_model || '').trim(),
      // Optional provider documentation. When present, recording is blocked
      // before capture if the browser cannot produce one of these containers.
      audioMimeTypes:normalizeAudioMimeTypes(value.audioMimeTypes != null ? value.audioMimeTypes : value.audio_mime_types),
      enabled:value.enabled !== false,
      allowedPurposes:Array.isArray(value.allowedPurposes)
        ? [...new Set(value.allowedPurposes.map(canonicalPurpose).filter(purpose => AI_PURPOSES.has(purpose)))]
        : [],
      supportsVision:value.supportsVision === true,
      supportsAudioTranscription:value.supportsAudioTranscription === true || value.supports_audio_transcription === true,
      dailyQuota:Math.max(0, Number(value.dailyQuota) || 0),
      created_at:String(value.created_at || new Date().toISOString()),
      updated_at:new Date().toISOString(),
    };
  }

  function normalizeWireApi(value) {
    const input = String(value == null ? '' : value).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!input || ['chat', 'chat_completion', 'chat_completions', 'completions'].includes(input)) return 'chat_completions';
    if (['response', 'responses', 'openai_responses'].includes(input)) return 'responses';
    throw new Error('AI_PROVIDER_WIRE_API_UNSUPPORTED');
  }

  function normalizeAudioMimeTypes(value) {
    const raw = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[，,;；\s]+/);
    return [...new Set(raw
      .map(item => String(item || '').trim().toLowerCase().split(';')[0])
      .filter(item => AUDIO_MIME_TYPES.has(item)))];
  }

  function validateProviderConfig(input) {
    const config = normalizeProviderConfig(input);
    if (!config.model) throw new Error('AI_PROVIDER_MODEL_REQUIRED');
    if (!['openai-compatible', 'anthropic', 'gemini'].includes(config.protocol)) throw new Error('AI_PROVIDER_PROTOCOL_UNSUPPORTED');
    return config;
  }

  function localDay(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  /* UI callers use this before opening a consent dialog or starting a
     request. The request path still validates the same conditions again. */
  function providerReadiness(config, purpose, options) {
    const value = config && typeof config === 'object' ? config : null;
    const task = canonicalPurpose(purpose);
    const opts = options || {};
    const result = { ok:false, code:'', purpose:task, used:0, remaining:null, provider:value };
    if (!value) { result.code = 'AI_PROVIDER_NOT_CONFIGURED'; return result; }
    if (value.enabled === false) { result.code = 'AI_PROVIDER_DISABLED'; return result; }
    if (!String(value.model || '').trim()) { result.code = 'AI_PROVIDER_MODEL_REQUIRED'; return result; }
    if (!AI_PURPOSES.has(task)) { result.code = 'AI_PURPOSE_NOT_ALLOWED'; return result; }
    const allowedPurposes = new Set((Array.isArray(value.allowedPurposes) ? value.allowedPurposes : []).map(canonicalPurpose));
    if (!allowedPurposes.has(task)) { result.code = 'AI_PURPOSE_NOT_ALLOWED'; return result; }
    if (opts.requireVision === true && value.supportsVision !== true) { result.code = 'AI_PROVIDER_VISION_UNSUPPORTED'; return result; }
    const managedRelay = value.credentialMode === 'managed_relay';
    if (managedRelay && !String(value.relayUrl || '').trim()) { result.code = 'AI_MANAGED_RELAY_REQUIRED'; return result; }
    if (!managedRelay && Object.prototype.hasOwnProperty.call(opts, 'credentialsAvailable') && opts.credentialsAvailable !== true) {
      result.code = 'AI_API_KEY_REQUIRED';
      return result;
    }
    const audits = Array.isArray(opts.audits) ? opts.audits : [];
    const today = localDay(opts.now || new Date());
    result.used = audits.filter(item => item && item.action === 'generate'
      && canonicalPurpose(item.purpose) === task && item.status === 'completed'
      && auditBelongsToProvider(item, value)
      && localDay(item.created_at) === today).length;
    const quota = Math.max(0, Number(value.dailyQuota) || 0);
    result.remaining = quota > 0 ? Math.max(0, quota - result.used) : null;
    if (quota > 0 && result.used >= quota) { result.code = 'AI_DAILY_QUOTA_EXCEEDED'; return result; }
    result.ok = true;
    return result;
  }

  function transcriptionReadiness(config, options) {
    const value = config && typeof config === 'object' ? config : null;
    const opts = options || {};
    const declaredMimeTypes = normalizeAudioMimeTypes(value && value.audioMimeTypes);
    const result = { ok:false, code:'', purpose:'voice_transcription', provider:value, mimeTypes:declaredMimeTypes.length ? declaredMimeTypes : [...AUDIO_MIME_TYPES], declaredMimeTypes };
    if (!value) { result.code = 'AI_PROVIDER_NOT_CONFIGURED'; return result; }
    if (value.enabled === false) { result.code = 'AI_PROVIDER_DISABLED'; return result; }
    if (value.protocol !== 'openai-compatible') { result.code = 'AI_AUDIO_PROTOCOL_UNSUPPORTED'; return result; }
    if (value.supportsAudioTranscription !== true) { result.code = 'AI_PROVIDER_AUDIO_UNSUPPORTED'; return result; }
    if (!String(value.transcriptionModel || '').trim()) { result.code = 'AI_AUDIO_MODEL_REQUIRED'; return result; }
    const allowedPurposes = new Set((Array.isArray(value.allowedPurposes) ? value.allowedPurposes : []).map(canonicalPurpose));
    if (!allowedPurposes.has('voice_transcription')) { result.code = 'AI_PURPOSE_NOT_ALLOWED'; return result; }
    if (value.credentialMode === 'managed_relay' && !String(value.relayUrl || '').trim()) { result.code = 'AI_MANAGED_RELAY_REQUIRED'; return result; }
    if (value.credentialMode !== 'managed_relay' && Object.prototype.hasOwnProperty.call(opts, 'credentialsAvailable') && opts.credentialsAvailable !== true) {
      result.code = 'AI_API_KEY_REQUIRED'; return result;
    }
    const captureMimeTypes = normalizeAudioMimeTypes(opts.captureMimeTypes || opts.capture_mime_types);
    if (declaredMimeTypes.length && captureMimeTypes.length && !captureMimeTypes.some(item => declaredMimeTypes.includes(item))) {
      result.code = 'AI_AUDIO_CAPTURE_FORMAT_UNSUPPORTED'; return result;
    }
    result.ok = true;
    result.model = value.transcriptionModel;
    return result;
  }

  function auditBelongsToProvider(item, config) {
    const audit = item && typeof item === 'object' ? item : {};
    const provider = config && typeof config === 'object' ? config : {};
    const providerId = String(provider.id || '');
    const auditProviderId = String(audit.provider_id || audit.providerId || '');
    if (providerId && auditProviderId) return providerId === auditProviderId;
    const providerKey = String(provider.key || '');
    const auditProvider = String(audit.provider || '');
    if (providerKey && auditProvider && providerKey !== auditProvider) return false;
    const model = String(provider.model || '').trim();
    const auditModel = String(audit.model || '').trim();
    return !model || model === auditModel;
  }

  function buildContext(input) {
    const value = Object.assign({ purpose:'general', includeSensitive:false, records:[] }, input || {});
    const records = Array.isArray(value.records) ? value.records : [];
    const requestedCategories = Array.isArray(value.sensitiveCategories)
      ? value.sensitiveCategories.filter(category => SENSITIVE_CATEGORIES.includes(String(category)))
      : value.includeSensitive === true ? SENSITIVE_CATEGORIES.slice() : [];
    const requestedFields = Array.isArray(value.sensitiveFields) ? value.sensitiveFields.map(String).filter(Boolean).slice(0, 120) : [];
    return {
      purpose:String(value.purpose || 'general'),
      student_id:String(value.student_id || ''),
      page_view:String(value.page_view || ''),
      target_view:String(value.target_view || ''),
      target_collection:String(value.target_collection || ''),
      target_record_id:String(value.target_record_id || ''),
      scope:clone(value.scope || null),
      dateRange:value.dateRange ? clone(value.dateRange) : null,
      sensitive:requestedCategories.length > 0 || requestedFields.length > 0,
      authorizedCategories:requestedCategories,
      authorizedFields:requestedFields,
      records:redact(records, { categories:requestedCategories, fields:requestedFields }),
      generated_at:new Date().toISOString(),
    };
  }

  function normalizePublicSourceUrl(value) {
    const raw = String(value || '').trim();
    if (!/^https:\/\//i.test(raw)) throw new Error('AI_SOURCE_URL_HTTPS_REQUIRED');
    let url;
    try { url = new URL(raw); } catch (_) { throw new Error('AI_SOURCE_URL_INVALID'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || isPrivateHostname(url.hostname)) throw new Error('AI_SOURCE_URL_NOT_PUBLIC');
    /* A public URL can still contain a signed-link token in its query string.
       Strip those values before storing or fetching the source so they do not
       enter local backups, citations, or browser history through the source UI. */
    [...url.searchParams.keys()].forEach(key => {
      if (SENSITIVE_SOURCE_QUERY.test(key)) url.searchParams.delete(key);
    });
    url.hash = '';
    return url.toString();
  }

  function defaultSourceRelayUrl() {
    const location = root.location;
    if (!location || !/^https?:$/i.test(String(location.protocol || ''))) return '';
    const hostname = String(location.hostname || '').toLowerCase();
    if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) return '';
    return String(location.origin || '').replace(/\/$/, '') + '/api/ai/source';
  }

  function resolveSourceRelayUrl(options) {
    const configured = options && options.relayUrl != null ? options.relayUrl : root.CWB_AI_RELAY_SOURCE_URL || '';
    if (configured) return normalizeSourceRelayUrl(configured);
    return defaultSourceRelayUrl();
  }

  async function fetchPublicSource(input, options) {
    const value = typeof input === 'string' ? { url:input } : Object.assign({}, input || {});
    const url = normalizePublicSourceUrl(value.url);
    const opts = Object.assign({ maxBytes:DEFAULT_MAX_SOURCE_BYTES, timeoutMs:8000 }, options || {});
    const maxSourceBytes = normalizeMaxSourceBytes(opts.maxBytes);
    const requestScope = createAbortScope(opts.signal, opts.timeoutMs);
    const sourceRelayUrl = resolveSourceRelayUrl(options);
    try {
      if (sourceRelayUrl) {
        const relayHeaders = { 'content-type':'application/json' };
        const relayToken = String((options && options.relayToken) || '').trim();
        if (relayToken) relayHeaders['x-ai-relay-token'] = relayToken;
        const relayResponse = await callFetch(sourceRelayUrl, {
          method:'POST', headers:relayHeaders, body:JSON.stringify({ url, title:value.title || '', license_assertion:relayAssertion(options) }),
          signal:requestScope.signal, redirect:'error',
        });
        const relayParsed = await readJsonPayload(relayResponse, Math.min(MAX_RESPONSE_BYTES, maxSourceBytes + 64 * 1024));
        const relayPayload = relayParsed.valid ? relayParsed.payload : null;
        if (!relayResponse.ok) {
          const safeCode = safeResponseErrorCode(relayPayload);
          throw new Error(safeCode || 'AI_SOURCE_FETCH_FAILED');
        }
        if (relayPayload && relayPayload.source) {
          const source = relayPayload.source;
          if (normalizePublicSourceUrl(source.url || url) !== url) throw new Error('AI_SOURCE_FETCH_INVALID_RESPONSE');
          return Object.assign({}, source, {
            url,
            status:source.status || 'available',
            verification_status:'verified',
            last_verified_at:source.last_verified_at || source.retrieved_at || new Date().toISOString(),
            verification_error:'',
          });
        }
        throw new Error('AI_SOURCE_FETCH_INVALID_RESPONSE');
      }
      if (typeof fetch !== 'function') throw new Error('AI_SOURCE_FETCH_UNAVAILABLE');
      const response = await fetch(url, { method:'GET', redirect:'error', signal:requestScope.signal, headers:{ accept:'text/html,text/plain,application/json' } });
      if (!response.ok) throw new Error('AI_SOURCE_FETCH_FAILED:' + response.status);
      const type = String(response.headers && response.headers.get && response.headers.get('content-type') || '').toLowerCase();
      if (type && !/(?:text\/html|text\/plain|application\/json|application\/xml)/i.test(type)) throw new Error('AI_SOURCE_CONTENT_TYPE_UNSUPPORTED');
      const length = Number(response.headers && response.headers.get && response.headers.get('content-length') || 0);
      if (length > maxSourceBytes) throw new Error('AI_SOURCE_RESPONSE_TOO_LARGE');
      const text = await response.text();
      if (utf8ByteLength(text) > maxSourceBytes) throw new Error('AI_SOURCE_RESPONSE_TOO_LARGE');
      const title = String(value.title || (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || url).replace(/\s+/g, ' ').trim().slice(0, 240);
      const excerpt = text.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
      const retrievedAt = new Date().toISOString();
      return { url, title, excerpt, retrieved_at:retrievedAt, status:'available', verification_status:'verified', last_verified_at:retrievedAt, verification_error:'' };
    } catch (error) {
      if (requestScope.timedOut()) throw new Error('AI_SOURCE_FETCH_TIMEOUT');
      if (error && (error.name === 'AbortError' || error.message === 'AI_PROVIDER_REQUEST_ABORTED')) throw new Error('AI_SOURCE_FETCH_ABORTED');
      throw error;
    } finally {
      requestScope.dispose();
    }
  }

  function buildVisionMessage(prompt, dataUrl) {
    const source = String(dataUrl || '').trim();
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(source)) throw new Error('AI_VISION_IMAGE_INVALID');
    if (source.length > 12 * 1024 * 1024) throw new Error('AI_VISION_IMAGE_TOO_LARGE');
    return {
      role:'user',
      content:[
        { type:'text', text:String(prompt || '请识别图片中的结构化信息') },
        { type:'image_url', image_url:{ url:source } },
      ],
    };
  }

  function visionDataUrlParts(value) {
    const source = String(value || '').trim();
    const match = source.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i);
    if (!match || source.length > 12 * 1024 * 1024) throw new Error('AI_VISION_IMAGE_INVALID');
    return { mediaType:match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(), data:match[2] };
  }

  function hasImageContent(messages) {
    return (Array.isArray(messages) ? messages : []).some(message => Array.isArray(message && message.content)
      && message.content.some(part => part && part.type === 'image_url'));
  }

  function anthropicContent(content) {
    if (!Array.isArray(content)) return String(content == null ? '' : content);
    return content.map(part => {
      if (!part || typeof part !== 'object') return null;
      if (part.type === 'text') return { type:'text', text:String(part.text == null ? '' : part.text) };
      if (part.type === 'image_url') {
        const image = part.image_url && typeof part.image_url === 'object' ? part.image_url.url : '';
        const parsed = visionDataUrlParts(image);
        return { type:'image', source:{ type:'base64', media_type:parsed.mediaType, data:parsed.data } };
      }
      return null;
    }).filter(Boolean);
  }

  function normalizeMessageContent(content) {
    if (Array.isArray(content)) return content.map(part => clone(part));
    return String(content == null ? '' : content);
  }

  function responsesContent(content) {
    if (!Array.isArray(content)) return [{ type:'input_text', text:String(content == null ? '' : content) }];
    return content.map(part => {
      if (!part || typeof part !== 'object') return { type:'input_text', text:String(part == null ? '' : part) };
      if (part.type === 'text' || part.type === 'input_text') return { type:'input_text', text:String(part.text == null ? '' : part.text) };
      if (part.type === 'image_url') {
        const url = part.image_url && typeof part.image_url === 'object' ? part.image_url.url : part.image_url;
        return { type:'input_image', image_url:String(url || '') };
      }
      return { type:'input_text', text:String(part.text == null ? '' : part.text) };
    }).filter(part => part.type !== 'input_image' || part.image_url);
  }

  function messageText(content) {
    if (Array.isArray(content)) return content.map(part => part && part.text || '').join('');
    return String(content == null ? '' : content);
  }

  function buildChatRequest(configInput, messages, options) {
    const config = validateProviderConfig(configInput);
    const opts = Object.assign({ temperature:0.2, max_tokens:2000 }, options || {});
    if (hasImageContent(messages) && config.supportsVision !== true) throw new Error('AI_PROVIDER_VISION_UNSUPPORTED');
    const normalizedMessages = (Array.isArray(messages) ? messages : []).map(message => ({
      role:message && ['system', 'assistant', 'user'].includes(message.role) ? message.role : 'user',
      content:normalizeMessageContent(message && message.content),
    }));
    if (config.protocol === 'anthropic') {
      const system = normalizedMessages.filter(message => message.role === 'system').map(message => messageText(message.content)).filter(Boolean).join('\n');
      return {
        url:`${config.baseUrl}/messages`,
        headers:{ 'content-type':'application/json', 'anthropic-version':'2023-06-01' },
        body:Object.assign({ model:config.model, max_tokens:opts.max_tokens, temperature:opts.temperature, messages:normalizedMessages.filter(message => message.role !== 'system').map(message => ({ role:message.role, content:anthropicContent(message.content) })) }, system ? { system } : {}),
      };
    }
    if (config.protocol === 'gemini') {
      return {
        url:`${config.baseUrl}/chat/completions`,
        headers:{ 'content-type':'application/json' },
        body:{ model:config.model, messages:normalizedMessages, temperature:opts.temperature, max_tokens:opts.max_tokens },
      };
    }
    if (config.wireApi === 'responses') {
      const system = normalizedMessages.filter(message => message.role === 'system').map(message => messageText(message.content)).filter(Boolean).join('\n');
      const input = normalizedMessages.filter(message => message.role !== 'system').map(message => ({
        role:message.role,
        content:responsesContent(message.content),
      }));
      return {
        url:`${config.baseUrl}/responses`,
        headers:{ 'content-type':'application/json' },
        body:Object.assign({ model:config.model, input, max_output_tokens:opts.max_tokens }, system ? { instructions:system } : {}),
      };
    }
    return {
      url:`${config.baseUrl}/chat/completions`,
      headers:{ 'content-type':'application/json' },
      body:{ model:config.model, messages:normalizedMessages, temperature:opts.temperature, max_tokens:opts.max_tokens },
    };
  }

  function extractResponseText(payload) {
    if (!payload) return '';
    const choice = payload.choices && payload.choices[0];
    if (choice && choice.message && choice.message.content != null) return messageText(choice.message.content);
    const candidate = payload.candidates && payload.candidates[0];
    if (candidate && candidate.content && Array.isArray(candidate.content.parts)) return candidate.content.parts.map(part => part.text || '').join('');
    if (payload.content && Array.isArray(payload.content)) return payload.content.map(part => part.text || '').join('');
    if (Array.isArray(payload.output)) {
      return payload.output.flatMap(item => Array.isArray(item && item.content) ? item.content : [])
        .filter(part => part && (part.type === 'output_text' || part.type === 'text' || part.text != null))
        .map(part => typeof part.text === 'string' ? part.text : (part.text && typeof part.text.value === 'string' ? part.text.value : ''))
        .join('');
    }
    return typeof payload.output_text === 'string' ? payload.output_text : '';
  }

  function defaultRelayUrl() {
    const location = root.location;
    if (!location || !/^https?:$/i.test(String(location.protocol || ''))) return '';
    const hostname = String(location.hostname || '').toLowerCase();
    if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) return '';
    return `${String(location.origin || '').replace(/\/$/, '')}/api/ai/chat`;
  }

  function resolveRelayUrl(config, options) {
    if (options && options.useRelay === false) return '';
    const configured = options && options.relayUrl != null ? options.relayUrl : (config && config.relayUrl) || root.CWB_AI_RELAY_URL || '';
    if (configured) return normalizeRelayUrl(configured);
    return config && /^https:$/i.test(new URL(config.baseUrl).protocol) ? defaultRelayUrl() : '';
  }

  function relayAssertion(options) {
    return String((options && (options.licenseAssertion || options.license_assertion)) || root.CWB_AI_LICENSE_ASSERTION || '').trim().slice(0, 16 * 1024);
  }

  async function callFetch(url, options) {
    try { return await fetch(url, options); }
    catch (error) {
      if (error && error.name === 'AbortError') throw new Error('AI_PROVIDER_REQUEST_ABORTED');
      throw new Error('AI_PROVIDER_NETWORK_UNAVAILABLE');
    }
  }

  function createAbortScope(externalSignal, timeoutMs) {
    if (typeof AbortController !== 'function') return { signal:externalSignal, timedOut:() => false, dispose:() => {} };
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else if (typeof externalSignal.addEventListener === 'function') externalSignal.addEventListener('abort', onAbort, { once:true });
    }
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(1000, Number(timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS));
    return {
      signal:controller.signal,
      timedOut:() => timedOut,
      dispose:() => {
        clearTimeout(timer);
        if (externalSignal && typeof externalSignal.removeEventListener === 'function') externalSignal.removeEventListener('abort', onAbort);
      },
    };
  }

  function safeResponseErrorCode(payload) {
    const code = payload && payload.error && payload.error.code;
    return typeof code === 'string' && /^(?:AI_RELAY|AI_PROVIDER)_[A-Z0-9_]+$/.test(code) ? code : '';
  }

  function safeErrorCode(error) {
    const raw = String(error && error.message || error || '').trim();
    if (/^AI_PROVIDER_REQUEST_FAILED:\d+(?::AI_(?:RELAY|PROVIDER)_[A-Z0-9_]+)?$/.test(raw)) return raw.slice(0, 160);
    if (/^AI_[A-Z0-9_]+$/.test(raw)) return raw.slice(0, 120);
    if (/^(?:CERTIFICATE|WORK_SUMMARY)_[A-Z0-9_]+$/.test(raw)) return raw.slice(0, 120);
    return raw ? 'AI_REQUEST_FAILED' : '';
  }

  function normalizeMaxResponseBytes(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_RESPONSE_BYTES;
    return Math.min(MAX_RESPONSE_BYTES, Math.max(64 * 1024, Math.floor(parsed)));
  }

  function normalizeMaxRequestBytes(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_REQUEST_BYTES;
    return Math.min(MAX_REQUEST_BYTES, Math.max(64 * 1024, Math.floor(parsed)));
  }

  function normalizeMaxSourceBytes(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_SOURCE_BYTES;
    return Math.min(MAX_SOURCE_BYTES, Math.max(32 * 1024, Math.floor(parsed)));
  }

  async function readJsonPayload(response, maxBytes) {
    const declaredLength = Number(response && response.headers && response.headers.get && response.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) throw new Error('AI_PROVIDER_RESPONSE_TOO_LARGE');
    if (response && response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (!next || next.done) break;
          const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value || []);
          total += chunk.byteLength;
          if (total > maxBytes) {
            try { await reader.cancel(); } catch (_) {}
            throw new Error('AI_PROVIDER_RESPONSE_TOO_LARGE');
          }
          chunks.push(chunk);
        }
      } finally {
        if (typeof reader.releaseLock === 'function') reader.releaseLock();
      }
      let bytes = new Uint8Array(total); let offset = 0;
      chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
      let raw = '';
      if (typeof TextDecoder === 'function') raw = new TextDecoder('utf-8', { fatal:false }).decode(bytes);
      else {
        const parts = [];
        for (let index = 0; index < bytes.length; index += 0x8000) parts.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
        raw = parts.join('');
      }
      try { return { payload:JSON.parse(raw), valid:true }; } catch (_) { return { payload:null, valid:false }; }
    }
    if (response && typeof response.text === 'function') {
      const raw = await response.text();
      if (utf8ByteLength(raw) > maxBytes) throw new Error('AI_PROVIDER_RESPONSE_TOO_LARGE');
      try { return { payload:JSON.parse(raw), valid:true }; } catch (_) { return { payload:null, valid:false }; }
    }
    if (response && typeof response.json === 'function') {
      try {
        const payload = await response.json();
        if (utf8ByteLength(JSON.stringify(payload == null ? null : payload)) > maxBytes) throw new Error('AI_PROVIDER_RESPONSE_TOO_LARGE');
        return { payload, valid:true };
      } catch (error) {
        if (error && error.message === 'AI_PROVIDER_RESPONSE_TOO_LARGE') throw error;
        return { payload:null, valid:false };
      }
    }
    return { payload:null, valid:false };
  }

  function auditStringList(value, limit) {
    return [...new Set((Array.isArray(value) ? value : [])
      .map(item => String(item == null ? '' : item).trim())
      .filter(Boolean))].slice(0, limit || 120);
  }

  function normalizeAuditScope(value) {
    const input = value && typeof value === 'object' ? value : {};
    const scope = {
      student_id:String(input.student_id || '').slice(0, 160),
      class_name:String(input.class_name || '').slice(0, 240),
      page_view:String(input.page_view || '').slice(0, 120),
      target_view:String(input.target_view || '').slice(0, 120),
      target_collection:String(input.target_collection || '').slice(0, 160),
      target_record_id:String(input.target_record_id || '').slice(0, 160),
    };
    if (input.dateRange && typeof input.dateRange === 'object') {
      scope.dateRange = {
        from:String(input.dateRange.from || '').slice(0, 32),
        to:String(input.dateRange.to || '').slice(0, 32),
      };
    }
    return scope;
  }

  async function sendChat(configInput, messages, options) {
    if (typeof fetch !== 'function') throw new Error('AI_FETCH_UNAVAILABLE');
    const config = validateProviderConfig(configInput);
    const request = buildChatRequest(config, messages, options);
    const managedCredential = config.credentialMode === 'managed_relay' || options && options.managedCredential === true;
    const apiKey = String((options && options.apiKey) || '').trim();
    if (!apiKey && !managedCredential) throw new Error('AI_API_KEY_REQUIRED');
    if (managedCredential && !resolveRelayUrl(config, options)) throw new Error('AI_MANAGED_RELAY_REQUIRED');
    const relayUrl = resolveRelayUrl(config, options);
    const maxRequestBytes = normalizeMaxRequestBytes(options && options.maxRequestBytes);
    if (utf8ByteLength(JSON.stringify(request.body)) > maxRequestBytes) throw new Error('AI_PROVIDER_REQUEST_TOO_LARGE');
    const requestScope = createAbortScope(options && options.signal, options && options.timeoutMs);
    const maxResponseBytes = normalizeMaxResponseBytes(options && options.maxResponseBytes);
    try {
      let response;
      if (relayUrl) {
        const relayHeaders = { 'content-type':'application/json' };
        const relayToken = String((options && options.relayToken) || '').trim();
        if (relayToken) relayHeaders['x-ai-relay-token'] = relayToken;
        response = await callFetch(relayUrl, {
          method:'POST',
          headers:relayHeaders,
          body:JSON.stringify({ url:request.url, protocol:config.protocol, wire_api:config.wireApi, apiKey:managedCredential ? '' : apiKey, credential_mode:managedCredential ? 'managed_relay' : 'user_key', body:request.body, license_assertion:relayAssertion(options) }),
          signal:requestScope.signal,
          redirect:'error',
        });
      } else {
        const headers = Object.assign({}, request.headers);
        if (config.protocol === 'anthropic') headers['x-api-key'] = apiKey;
        else headers.authorization = `Bearer ${apiKey}`;
        response = await callFetch(request.url, { method:'POST', headers, body:JSON.stringify(request.body), signal:requestScope.signal, redirect:'error' });
      }
      const parsed = await readJsonPayload(response, maxResponseBytes);
      const payload = parsed.payload;
      if (requestScope.signal && requestScope.signal.aborted) throw new Error('AI_PROVIDER_REQUEST_ABORTED');
      if (!response.ok) {
        const safeCode = safeResponseErrorCode(payload);
        throw new Error(`AI_PROVIDER_REQUEST_FAILED:${response.status}${safeCode ? `:${safeCode}` : ''}`);
      }
      if (!parsed.valid) throw new Error('AI_PROVIDER_INVALID_JSON');
      const text = extractResponseText(payload);
      if (!text) throw new Error('AI_PROVIDER_EMPTY_RESPONSE');
      return { text, provider:keyOf(config), model:config.model, received_at:new Date().toISOString() };
    } catch (error) {
      if (requestScope.timedOut()) throw new Error('AI_PROVIDER_REQUEST_TIMEOUT');
      if (error && error.name === 'AbortError') throw new Error('AI_PROVIDER_REQUEST_ABORTED');
      throw error;
    } finally {
      requestScope.dispose();
    }
  }

  function normalizeAudioInput(value) {
    const input = value || {};
    const mimeType = String(input.type || input.mimeType || 'audio/webm').toLowerCase().split(';')[0];
    if (!AUDIO_MIME_TYPES.has(mimeType)) throw new Error('AI_AUDIO_MIME_UNSUPPORTED');
    const size = Number(input.size || 0);
    if (Number.isFinite(size) && size > MAX_AUDIO_BYTES) throw new Error('AI_AUDIO_TOO_LARGE');
    const extensions = { 'audio/webm':'webm', 'audio/ogg':'ogg', 'audio/wav':'wav', 'audio/x-wav':'wav', 'audio/mpeg':'mp3', 'audio/mp4':'m4a', 'audio/x-m4a':'m4a', 'audio/aac':'aac' };
    const fallbackName = `counselor-voice.${extensions[mimeType] || 'webm'}`;
    let name = String(input.name || fallbackName).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || fallbackName;
    const expectedExtension = `.${extensions[mimeType] || 'webm'}`;
    if (!/\.[A-Za-z0-9]+$/.test(name) || !name.toLowerCase().endsWith(expectedExtension)) name = `counselor-voice${expectedExtension}`;
    return { mimeType, name };
  }

  /* This is intentionally a deterministic, non-speech probe. It lets the
     settings screen validate a declared transcription endpoint without ever
     sending a teacher or student's recording. An empty transcript is valid
     for this probe and is handled by sendAudioTranscription's opt-in flag. */
  function createSilentWav(durationMs) {
    const sampleRate = 16000;
    const duration = Math.max(100, Math.min(1000, Number(durationMs) || 320));
    const sampleCount = Math.max(1, Math.round(sampleRate * duration / 1000));
    const dataBytes = sampleCount * 2;
    const bytes = new Uint8Array(44 + dataBytes);
    const view = new DataView(bytes.buffer);
    const writeText = (offset, value) => {
      String(value).split('').forEach((character, index) => { bytes[offset + index] = character.charCodeAt(0); });
    };
    writeText(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); writeText(8, 'WAVE');
    writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); writeText(36, 'data'); view.setUint32(40, dataBytes, true);
    return bytes;
  }

  async function sendAudioTranscription(configInput, audioInput, options) {
    if (typeof fetch !== 'function') throw new Error('AI_FETCH_UNAVAILABLE');
    const config = validateProviderConfig(configInput);
    if (config.protocol !== 'openai-compatible') throw new Error('AI_AUDIO_PROTOCOL_UNSUPPORTED');
    if (!audioInput || typeof audioInput.arrayBuffer !== 'function') throw new Error('AI_AUDIO_REQUIRED');
    const meta = normalizeAudioInput(audioInput);
    const declaredMimeTypes = normalizeAudioMimeTypes(config.audioMimeTypes);
    if (declaredMimeTypes.length && !declaredMimeTypes.includes(meta.mimeType)) throw new Error('AI_AUDIO_CAPTURE_FORMAT_UNSUPPORTED');
    const bytes = new Uint8Array(await audioInput.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_AUDIO_BYTES) throw new Error(bytes.byteLength ? 'AI_AUDIO_TOO_LARGE' : 'AI_AUDIO_EMPTY');
    const managedCredential = config.credentialMode === 'managed_relay' || options && options.managedCredential === true;
    const apiKey = String((options && options.apiKey) || '').trim();
    if (!apiKey && !managedCredential) throw new Error('AI_API_KEY_REQUIRED');
    if (managedCredential && !resolveRelayUrl(config, options)) throw new Error('AI_MANAGED_RELAY_REQUIRED');
    // Keep the transport layer honest even when a caller bypasses the UI.
    // Text chat availability is not evidence that this provider exposes STT.
    const readiness = transcriptionReadiness(config, { credentialsAvailable:true, captureMimeTypes:[meta.mimeType] });
    if (!readiness.ok) throw new Error(readiness.code);
    const requestScope = createAbortScope(options && options.signal, options && options.timeoutMs);
    const maxResponseBytes = normalizeMaxResponseBytes(options && options.maxResponseBytes);
    const model = String((options && options.model) || (options && options.transcriptionModel) || config.transcriptionModel || config.model || '').trim();
    if (!model) throw new Error('AI_PROVIDER_MODEL_REQUIRED');
    const relayUrl = resolveRelayUrl(config, options);
    try {
      let response;
      if (relayUrl) {
        const relayToken = String((options && options.relayToken) || '').trim();
        let binary = '';
        for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        const relayHeaders = { 'content-type':'application/json' };
        if (relayToken) relayHeaders['x-ai-relay-token'] = relayToken;
        const relayPath = relayUrl.replace(/\/api\/ai\/chat(?:\?.*)?$/i, '/api/ai/transcribe');
        const transcriptionUrl = config.transcriptionUrl || `${config.baseUrl}/audio/transcriptions`;
        const relayBody = { url:transcriptionUrl, protocol:config.protocol, apiKey:managedCredential ? '' : apiKey, credential_mode:managedCredential ? 'managed_relay' : 'user_key', model, fileName:meta.name, mimeType:meta.mimeType, audioBase64:root.btoa ? root.btoa(binary) : Buffer.from(bytes).toString('base64'), license_assertion:relayAssertion(options) };
        if (utf8ByteLength(JSON.stringify(relayBody)) > MAX_REQUEST_BYTES * 3) throw new Error('AI_PROVIDER_REQUEST_TOO_LARGE');
        response = await callFetch(relayPath, { method:'POST', headers:relayHeaders, body:JSON.stringify(relayBody), signal:requestScope.signal, redirect:'error' });
      } else {
        if (typeof FormData !== 'function' || typeof Blob !== 'function') throw new Error('AI_AUDIO_FORMDATA_UNAVAILABLE');
        const form = new FormData();
        form.append('model', model);
        form.append('language', String((options && options.language) || 'zh'));
        form.append('response_format', 'json');
        form.append('file', new Blob([bytes], { type:meta.mimeType }), meta.name);
        const transcriptionUrl = config.transcriptionUrl || `${config.baseUrl}/audio/transcriptions`;
        response = await callFetch(transcriptionUrl, { method:'POST', headers:{ authorization:`Bearer ${apiKey}` }, body:form, signal:requestScope.signal, redirect:'error' });
      }
      const parsed = await readJsonPayload(response, maxResponseBytes);
      if (requestScope.signal && requestScope.signal.aborted) throw new Error('AI_PROVIDER_REQUEST_ABORTED');
      if (!response.ok) {
        const safeCode = safeResponseErrorCode(parsed.payload);
        if (response.status === 404) throw new Error('AI_AUDIO_ENDPOINT_UNAVAILABLE');
        if (response.status === 415) throw new Error('AI_AUDIO_MIME_REJECTED');
        if (response.status === 400) throw new Error('AI_AUDIO_PROVIDER_REJECTED');
        throw new Error(`AI_PROVIDER_REQUEST_FAILED:${response.status}${safeCode ? `:${safeCode}` : ''}`);
      }
      if (!parsed.valid) throw new Error('AI_PROVIDER_INVALID_JSON');
      const text = String(parsed.payload && (parsed.payload.text || extractResponseText(parsed.payload)) || '').trim();
      if (!text && !(options && options.allowEmptyText === true)) throw new Error('AI_PROVIDER_EMPTY_RESPONSE');
      return { text, provider:keyOf(config), model, received_at:new Date().toISOString(), audio_saved:false, empty_transcript:!text };
    } catch (error) {
      if (requestScope.timedOut()) throw new Error('AI_PROVIDER_REQUEST_TIMEOUT');
      if (error && error.name === 'AbortError') throw new Error('AI_PROVIDER_REQUEST_ABORTED');
      throw error;
    } finally {
      requestScope.dispose();
    }
  }

  function keyOf(config) { return String(config && config.key || 'custom'); }

  function createAuditEntry(input) {
    const value = input || {};
    const sourceIds = auditStringList(value.source_ids || value.sourceIds, 120);
    const sensitiveCategories = auditStringList(value.sensitive_categories || value.sensitiveCategories, 20);
    const sensitiveFields = auditStringList(value.sensitive_fields || value.sensitiveFields, 80);
    const contextScope = normalizeAuditScope(value.context_scope || value.contextScope);
    const createdAt = new Date().toISOString();
    const requestId = String(value.request_id || value.requestId || `ai_request_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`).slice(0, 160);
    return {
      id:`ai_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      request_id:requestId,
      action:String(value.action || 'request'),
      purpose:canonicalPurpose(value.purpose) || 'general',
      provider_id:String(value.provider_id || value.providerId || ''),
      provider:String(value.provider || 'custom'),
      model:String(value.model || ''),
      sensitiveRequested:value.sensitiveRequested === true || value.sensitiveAuthorized === true,
      sensitiveAuthorized:value.sensitiveAuthorized === true,
      recordCount:Math.max(0, Number(value.recordCount) || 0),
      sourceCount:Math.max(0, Number(value.sourceCount) || 0),
      requested_count:Math.max(0, Number(value.requested_count || value.requestedCount) || 0),
      eligible_count:Math.max(0, Number(value.eligible_count || value.eligibleCount) || 0),
      matched_count:Math.max(0, Number(value.matched_count || value.matchedCount || value.recordCount) || 0),
      context_limit:Math.max(0, Number(value.context_limit || value.contextLimit) || 0),
      excluded_source_count:Math.max(0, Number(value.excluded_source_count || value.excludedSourceCount) || 0),
      student_id:String(value.student_id || ''),
      consent_id:String(value.consent_id || ''),
      target_view:String(value.target_view || ''),
      target_collection:String(value.target_collection || ''),
      target_record_id:String(value.target_record_id || ''),
      suggestion_id:String(value.suggestion_id || value.ai_suggestion_id || ''),
      draft_id:String(value.draft_id || value.ai_draft_id || ''),
      source_ids:[...new Set(sourceIds)],
      sensitive_categories:sensitiveCategories,
      sensitive_fields:sensitiveFields,
      source_attachment_id:String(value.source_attachment_id || ''),
      source_text_hash:String(value.source_text_hash || ''),
      context_scope:contextScope,
      parent_audit_id:String(value.parent_audit_id || value.generation_audit_id || ''),
      human_confirmed:value.human_confirmed === true,
      human_confirmed_at:String(value.human_confirmed_at || ''),
      confirmation_method:String(value.confirmation_method || ''),
      truncated:value.truncated === true,
      output_redacted:value.output_redacted === true,
      result_kind:String(value.result_kind || ''),
      feedback:String(value.feedback || '').slice(0, 40),
      fallback_reason:String(value.fallback_reason || '').slice(0, 120),
      duration_ms:Math.max(0, Number(value.duration_ms) || 0),
      retry_of_audit_id:String(value.retry_of_audit_id || ''),
      status:String(value.status || 'completed'),
      error:safeErrorCode(value.error),
      created_at:createdAt,
      updated_at:createdAt,
      schema_version:8,
    };
  }

  root.CWBAI = {
    schemaVersion:8,
    purposes:Object.freeze([...AI_PURPOSES]),
    purposeAliases:PURPOSE_ALIASES,
    canonicalPurpose,
    sensitiveCategories:SENSITIVE_CATEGORIES,
    providerCatalog,
    redact,
    sensitiveCategoryForKey,
    buildContext,
    normalizePublicSourceUrl,
    normalizeSourceRelayUrl,
    utf8ByteLength,
    sanitizeOutboundUrl,
    fetchPublicSource,
    revalidatePublicSource:async (input, options) => {
      const value = typeof input === 'string' ? { url:input } : Object.assign({}, input || {});
      const source = await fetchPublicSource({ url:value.url, title:value.title || '' }, options);
      return Object.assign({}, source, { id:String(value.id || ''), kind:'web', verification_status:'verified', last_verified_at:source.retrieved_at, verification_error:'' });
    },
    buildVisionMessage,
    normalizeRelayUrl,
    normalizeTranscriptionUrl,
    normalizeProviderConfig,
    validateProviderConfig,
    normalizeAudioMimeTypes,
    providerReadiness,
    transcriptionReadiness,
    normalizeMaxResponseBytes,
    normalizeMaxRequestBytes,
    normalizeMaxSourceBytes,
    buildChatRequest,
    resolveRelayUrl,
    extractResponseText,
    safeErrorCode,
    normalizeAuditScope,
    isPrivateHostname,
    isPrivateAddress,
    sendChat,
    sendAudioTranscription,
    normalizeAudioInput,
    createSilentWav,
    maxAudioBytes:MAX_AUDIO_BYTES,
    createAuditEntry,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
