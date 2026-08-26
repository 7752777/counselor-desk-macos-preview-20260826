/* Deployment-only validation. Keep production defaults fail-closed and keep
 * development compatibility explicit so a local contract server is still easy
 * to run without weakening the commercial service. */

function text(value) { return String(value == null ? '' : value).trim(); }

function listEnv(environment, name) {
  const source = environment === undefined ? process.env : environment;
  return String(source[name] || '').split(',').map(value => value.trim()).filter(Boolean);
}

function validateCorsOrigins(input) {
  const origins = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',').map(value => value.trim()).filter(Boolean)
      : listEnv(input, 'CWB_LICENSE_CORS_ORIGINS');
  const normalized = origins.map(value => {
    if (value === '*') throw Object.assign(new Error('LICENSE_CORS_CONFIG_INVALID: production CORS cannot use *'), { code:'LICENSE_CORS_CONFIG_INVALID' });
    let parsed;
    try { parsed = new URL(value); } catch (cause) {
      const error = Object.assign(new Error('LICENSE_CORS_CONFIG_INVALID: CORS origin must be a complete URL'), { code:'LICENSE_CORS_CONFIG_INVALID' });
      error.cause = cause;
      throw error;
    }
    const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localHttp) throw Object.assign(new Error('LICENSE_CORS_CONFIG_INVALID: production CORS origin must use HTTPS'), { code:'LICENSE_CORS_CONFIG_INVALID' });
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) throw Object.assign(new Error('LICENSE_CORS_CONFIG_INVALID: CORS origin cannot contain a path, query, fragment, or credentials'), { code:'LICENSE_CORS_CONFIG_INVALID' });
    return parsed.origin;
  });
  return [...new Set(normalized)];
}

function assertProductionEnvironment(environment, options) {
  const env = environment || process.env;
  const production = text(env.CWB_LICENSE_ENV).toLowerCase() === 'production';
  const configuredOrigins = options && options.corsOrigins != null
    ? options.corsOrigins
    : environment === undefined
      ? undefined
      : env.CWB_LICENSE_CORS_ORIGINS || '';
  const origins = validateCorsOrigins(configuredOrigins);
  if (!production) return Object.freeze({ production:false, corsOrigins:origins });
  if (origins.some(value => value.startsWith('http://'))) {
    throw Object.assign(new Error('LICENSE_CORS_CONFIG_INVALID: production CORS origins must use HTTPS'), { code:'LICENSE_CORS_CONFIG_INVALID' });
  }
  if (String(env.CWB_LICENSE_DATABASE_SSL || '').toLowerCase() !== 'true') {
    throw Object.assign(new Error('LICENSE_DATABASE_SSL_REQUIRED: production PostgreSQL must use TLS'), { code:'LICENSE_DATABASE_SSL_REQUIRED' });
  }
  if (text(env.CWB_LICENSE_ADMIN_TOKEN)) {
    throw Object.assign(new Error('LICENSE_ADMIN_TOKEN_FORBIDDEN: production must use hashed database admin keys'), { code:'LICENSE_ADMIN_TOKEN_FORBIDDEN' });
  }
  if (!origins.length) {
    throw Object.assign(new Error('LICENSE_CORS_ORIGINS_REQUIRED: production must configure exact HTTPS CORS origins'), { code:'LICENSE_CORS_ORIGINS_REQUIRED' });
  }
  if (text(env.CWB_LICENSE_REQUIRE_HTTPS).toLowerCase() === 'false') {
    throw Object.assign(new Error('LICENSE_HTTPS_REQUIRED: production cannot disable HTTPS enforcement'), { code:'LICENSE_HTTPS_REQUIRED' });
  }
  return Object.freeze({ production:true, corsOrigins:origins });
}

module.exports = { text, listEnv, validateCorsOrigins, assertProductionEnvironment };
