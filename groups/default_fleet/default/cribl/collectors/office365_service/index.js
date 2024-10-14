/* eslint-disable no-await-in-loop */
/* eslint-disable-next-line no-template-curly-in-string */
exports.name = 'Office 365 Service Communications';
exports.version = '0.1';
exports.disabled = false;
exports.hidden = true; // This collector exposed as source Office365ServicesIn
exports.destroyable = false;

const { httpSearch, isHttp200, RestVerb, HttpError, wrapExpr, DEFAULT_TIMEOUT_SECS } = C.internal.HttpUtils;

let contentType;
let tenantId;
let appId;
let clientSecret;
let contentUrl;
let exprArgs = {};
let earliest;
let timeout;
let authUrl;
let retryRules;
let resource;

const CONTENT_CURRENT  = 'CurrentStatus';
const CONTENT_MESSAGES = 'Messages';

exports.init = (opts) => {
  const conf = opts.conf;
  tenantId = conf.tenant_id;
  appId = conf.app_id;
  planType = conf.plan_type;
  clientSecret = conf.client_secret;
  contentType = conf.content_type;
  if (![CONTENT_CURRENT, CONTENT_MESSAGES].includes(contentType)) {
    throw new Error(`Invalid contentType: ${conf.content_type}`);
  }
  exprArgs = { tenantId, appId, clientSecret, contentType, planType };
  const remaining = ['tenantId','appId','clientSecret'].filter(k => !exprArgs[k]);
  if (remaining.length) {
    throw new Error(`Invalid configuration missing: ${remaining}`);
  }
  resource = getContentRoot()
  if (contentType === CONTENT_CURRENT) {
    contentUrl = `${resource}/v1.0/admin/serviceAnnouncement/healthOverviews`;
  } else if (contentType === CONTENT_MESSAGES) {
    contentUrl = `${resource}/v1.0/admin/serviceAnnouncement/messages`;
  }
  // https://learn.microsoft.com/en-us/entra/identity-platform/authentication-national-cloud#microsoft-entra-authentication-endpoints
  const tld = planType === 'gcc_high' || planType === 'dod' ? 'us' : 'com';
  authUrl = `https://login.microsoftonline.${tld}/${tenantId}/oauth2/token`;

  earliest = conf.earliest ? new Date(conf.earliest * 1000) : undefined;
  timeout = (conf.timeout != null && +conf.timeout >= 0) ? +conf.timeout : DEFAULT_TIMEOUT_SECS*1000;
  retryRules = conf.retryRules;
};

function getContentRoot() {
  switch(planType) {
    case 'enterprise_gcc':
    case 'gcc':
      // https://learn.microsoft.com/en-us/microsoft-365/enterprise/urls-and-ip-address-ranges?view=o365-worldwide#microsoft-365-common-and-office-online
      return 'https://graph.microsoft.com'
    case 'gcc_high':
      // https://learn.microsoft.com/en-us/microsoft-365/enterprise/microsoft-365-u-s-government-gcc-high-endpoints?view=o365-worldwide#microsoft-365-common-and-office-online
      return 'https://graph.microsoft.us'
    case 'dod':
      // https://learn.microsoft.com/en-us/microsoft-365/enterprise/microsoft-365-u-s-government-dod-endpoints?view=o365-worldwide#microsoft-365-common-and-office-online
      return 'https://dod-graph.microsoft.us'
  }
}

function getCollectParams() {
  const params = {};
  if (earliest && contentType === CONTENT_MESSAGES) {
    // Get messages updated since earliest.
    params['$filter'] = wrapExpr(`lastModifiedDateTime ge ${earliest.toISOString()}`);
  }
  return params;
}
exports.discover = async (job) => {
  await job.addResult({ source: contentUrl, format: 'raw' });
};

exports.collect = async (collectible, job) => {
  // Authenticate
  const authParams = { client_id: wrapExpr(exprArgs.appId), resource: resource, client_secret: wrapExpr(exprArgs.clientSecret), grant_type: "'client_credentials'" };
  const authOpts = { url: authUrl, method: RestVerb.POST, params: authParams, exprArgs, timeout, retryRules };
  const authToken = await (await httpSearch(authOpts, job.logger())).extractResult('access_token');
  // Collect
  const params = getCollectParams();
  const searchOpts = { url: collectible.source, params, method: RestVerb.GET, headers: { Authorization: wrapExpr(`Bearer ${authToken}`) }, timeout, retryRules };
  const result = await httpSearch(searchOpts, job.logger());
  result.res.on('end', () => {
    if (!isHttp200(result.res.statusCode)) {
      const error = new HttpError('Office365 collect error', result.res.statusCode, { host: result.host, port: result.port, path: result.path, method: result.method });
      job.reportError(error, 'JobFatal').catch(() => {});
    }
  }).on('error', (error) => {
    job.reportError(error, 'JobFatal').catch(() => {});
  });
  return result.stream();
};
