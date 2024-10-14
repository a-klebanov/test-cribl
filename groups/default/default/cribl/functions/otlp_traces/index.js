exports.name = 'OTLP Traces';
exports.version = '0.1';
exports.disabled = false;
exports.group = 'Formatters';
exports.sync = true;
exports.handleSignals = true;

const cLogger = C.util.getLogger('func:otlp_traces');
const { OTelTracesFormatter } = C.internal.otel;

const statsInterval = 60000; // 1 minute

let formatterConfig = {};
let otlpBatchConfig = {};
let tracesFormatter;
let statsReportInterval;

function resetStats() {
  tracesFormatter?.resetStats();
}

function reportStats() {
  const {
    numReceived,
    numNotTraces,
    numDropped,
    numBatches
  } = tracesFormatter.getStats();

  // Report stats, then reset
  cLogger.debug("OTLP Traces events stats", {
    numReceived,
    numNotTraces,
    numDropped,
    numBatches
  });
  resetStats();
}

exports.init = (opts) => {
  const conf = (opts || {}).conf || {};

  formatterConfig = {
    shouldDropNonTraceEvents: conf.dropNonTraceEvents || false,
    otlpVersion: conf.otlpVersion,
 };

  otlpBatchConfig = {
    enableOTLPMetricsBatching: conf.batchOTLPTraces,
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

  tracesFormatter = new OTelTracesFormatter(cLogger, formatterConfig, otlpBatchConfig);

  resetStats();

  clearInterval(statsReportInterval);
  statsReportInterval = setInterval(reportStats, statsInterval);
};

exports.process = (event) => {
  let flushedEvents = [];

  if (event.__signalEvent__) {
    if (otlpBatchConfig.enableOTLPMetricsBatching) {
      flushedEvents = tracesFormatter.output(event.__signalEvent__ === 'final');
    }
    flushedEvents.push(event);
  } else {
    flushedEvents = tracesFormatter.handleEvent(event);
  }

  return flushedEvents.length === 0 ? null : (flushedEvents.length === 1 ? flushedEvents[0] : flushedEvents);
};

exports.unload = () => {
  tracesFormatter = undefined;

  clearInterval(statsReportInterval);
  statsReportInterval = undefined;
}

//// tests only ////
exports.UT_getFormatter = () => {
  return tracesFormatter;
}

exports.UT_getStats = () => {
  const {
    numReceived,
    numNotTraces,
    numDropped,
    numBatches
  } = tracesFormatter.getStats();
  return {
    numReceived,
    numNotTraces,
    numDropped,
    numBatches
  };
};
