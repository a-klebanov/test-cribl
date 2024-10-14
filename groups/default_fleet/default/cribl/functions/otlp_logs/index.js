exports.name = 'OTLP Logs';
exports.version = '0.1';
exports.disabled = false;
exports.group = 'Formatters';
exports.sync = true;
exports.handleSignals = true;

const cLogger = C.util.getLogger('func:otlp_logs');
const { OTelLogsFormatter } = C.internal.otel;

const statsInterval = 60000; // 1 minute

let otelLogsFormatterConfig = {};
let otlpBatchConfig = {};
let logsFormatter;
let statsReportInterval;

function resetStats() {
  logsFormatter?.resetStats();
}

function reportStats() {
  const {
    numReceived,
    numNotLogs,
    numDropped,
    numBatches
  } = logsFormatter.getStats();

  // Report stats, then reset
  cLogger.debug("OTLP Logs events stats", {
    numReceived,
    numNotLogs,
    numDropped,
    numBatches
  });
  resetStats();
}

exports.init = (opts) => {
  const conf = (opts || {}).conf || {};

  otelLogsFormatterConfig = {
    shouldDropNonLogEvents: conf.dropNonLogEvents || false,
 };

  otlpBatchConfig = {
    enableOTLPMetricsBatching: conf.batchOTLPLogs,
    sendBatchSize: conf.sendBatchSize ?? 8192,
    timeout: conf.timeout ?? 200,
    sendBatchMaxSize: C.util.parseMemoryStringToBytes(`${conf.sendBatchMaxSize ?? 0}KB`),
    metadataKeys: conf.metadataKeys ?? [],
    metadataCardinalityLimit: conf.metadataCardinalityLimit ?? 1000
  };

  if (otlpBatchConfig.metadataKeys.length > 0 && otlpBatchConfig.metadataCardinalityLimit === 0) {
    // Can't have unlimited cardinality
    cLogger.warn("Can't have unlimited cardinality, setting cardinality to 1000");
    otlpBatchConfig.metadataCardinalityLimit = 1000;
  }

  logsFormatter = new OTelLogsFormatter(cLogger, otelLogsFormatterConfig, otlpBatchConfig);

  resetStats();

  clearInterval(statsReportInterval);
  statsReportInterval = setInterval(reportStats, statsInterval);
};

exports.process = (event) => {
  let flushedEvents = [];

  if (event.__signalEvent__) {
    if (otlpBatchConfig.enableOTLPMetricsBatching) {
      flushedEvents = logsFormatter.output(event.__signalEvent__ === 'final');
    }
    flushedEvents.push(event);
  } else {
    flushedEvents = logsFormatter.handleEvent(event);
  }

  return flushedEvents.length === 0 ? null : (flushedEvents.length === 1 ? flushedEvents[0] : flushedEvents);
};

exports.unload = () => {
  logsFormatter = undefined;

  clearInterval(statsReportInterval);
  statsReportInterval = undefined;
}

//// tests only ////
exports.UT_getFormatter = () => {
  return logsFormatter;
}

exports.UT_getStats = () => {
  const {
    numReceived,
    numNotLogs,
    numDropped,
    numBatches
  } = logsFormatter.getStats();
  return {
    numReceived,
    numNotLogs,
    numDropped,
    numBatches
  };
};
