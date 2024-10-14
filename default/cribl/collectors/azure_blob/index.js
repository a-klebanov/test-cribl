/* eslint-disable no-await-in-loop */

exports.name = 'Azure Blob';
exports.version = '0.2';
exports.disabled = false;
exports.destroyable = false;

let authType;
let conf;
let dir;
let filter;
let extractors;
let provider;
let batchSize;
let connectionString;
let containerName;
let mockClient;

exports.init = (opts) => {
  conf = opts.conf;
  dir = conf.path || '';
  filter = conf.filter || 'true';
  batchSize = conf.maxBatchSize || 10;
  mockClient = conf.mockClient;
  authType = conf.authType ?? 'manual';
  connectionString = conf.connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING;
  containerName = C.expr.runExprSafe(conf.containerName);
  if (authType === 'manual' || authType === 'secret') {
    if (!connectionString) {
      throw new Error('Invalid Config - connectionString not defined and not found in AZURE_STORAGE_CONNECTION_STRING environment variable');
    }
  } else if (authType === 'clientSecret') {
    ['tenantId', 'clientId', 'clientSecretValue', 'storageAccountName'].forEach(field => {
      if (!(field in conf)) {
        throw new Error(`Invalid Config - missing field ${field} which is required for client secret auth`);
      }
    });
  } else if (authType === 'clientCert') {
    ['tenantId', 'clientId', 'certificate', 'storageAccountName'].forEach(field => {
      if (!(field in conf)) {
        throw new Error(`Invalid Config - missing field ${field} which is required for client certificate auth`);
      }
    });
  }
  if (!containerName) {
    throw new Error('Invalid Config - missing container name');
  }
  const credential = createCredentials();
  provider = C.internal.Path.AzureBlobProvider({
    recurse: conf.recurse || false,
    containerName,
    credential,
    mockClient,
    includeMetadata: conf.includeMetadata != null ? conf.includeMetadata : true,
    includeTags: conf.includeTags != null ? conf.includeTags : true,
    parquetChunkSizeMB: conf.parquetChunkSizeMB,
    parquetChunkDownloadTimeout: conf.parquetChunkDownloadTimeout,
  });
  if (conf.extractors) {
    extractors = {};
    const { Expression } = C.expr;
    conf.extractors.forEach(pair => {
      extractors[pair.key] = new Expression(pair.expression);
    });
  }
  exports.provider = provider;
  return provider.init();
};

function createCredentials() {
  if (authType === 'manual' || authType === 'secret') {
    return {
      authenticationMethod: 'connection_string',
      connectionString,
    };
  } else if (authType === 'clientSecret') {
    return { 
      authenticationMethod: 'client_secret',
      storageAccountName: conf.storageAccountName,
      tenantId: conf.tenantId,
      clientId: conf.clientId,
      clientSecret: conf.clientSecretValue
    }
  } else if (authType === 'clientCert') {
    return { 
      authenticationMethod: 'certificate',
      storageAccountName: conf.storageAccountName,
      tenantId: conf.tenantId,
      clientId: conf.clientId,
      certificateName: conf.certificate.certificateName,
      certPath: conf.certificate.certPath,
      privKeyPath: conf.certificate.privKeyPath,
      passphrase: conf.certificate.passphrase
    }
  } else {
    throw new Error('Unexpected authType ' + authType);
  }
}

function reportErrorIfAny(job, err) {
  if (err == null) return;
  job.reportError(err).catch(() => {});
}

exports.discover = async (job) => {
  const pathFilter = C.internal.Path.pathFilter(dir, filter, provider, job.logger(), extractors);
  let curPath = await pathFilter.getNextPath();
  reportErrorIfAny(job, pathFilter.getLastError());
  const results = [];
  while (!curPath.done) {
    const result = {
      source: curPath.val,
      ...curPath.meta
    };

    if(result.properties?.accessTier == 'Archive') {
      job.logger().warn('Discovered blob in Archive Tier, which does not support direct download, skipping.', { result });
    } else {
      if (curPath.meta.fields) result.fields = curPath.meta.fields;
      if (curPath.val.endsWith('.gz')) result.compression = 'gzip';
      C.internal.Parquet.isParquetFile(curPath.val) ? (result.format = 'events') : (result.format = 'raw');
      results.push(result);
    }

    if (results.length >= batchSize) {
      await job.addResults(results);
      results.length = 0;
    }
    curPath = await pathFilter.getNextPath();
    reportErrorIfAny(job, pathFilter.getLastError());
  }
  await job.addResults(results);
};

exports.collect = async (collectible, job) => {
  job.logger().debug('Downloading blob', { name: collectible.name });
  return new Promise((resolve, reject) => {
    const errorHandler = (e) => {
      //wrap some error(s) returned from Azure Blob REST API. The error here could be type RestError
      if ( e?.code === "ConditionNotMet" || e?.details?.errorCode === "ConditionNotMet" ) {
        e = new Error('The ETag of the blob is updated due to metadata or content in the blob changed by another operation(s) during downloading. Please retry it.');
      }
      reject(e);
    };
    try {
      const rs = provider.createReadStream(collectible, job);
      rs.once('error', errorHandler);
      rs.once('readable', () => {
        rs.off('error', errorHandler);
        resolve(rs);
      });
    } catch(e) {
      errorHandler(e);
    }
  });
};

exports.close = async () => {
  await provider.close().catch((err)=>{/* NOP */})
};