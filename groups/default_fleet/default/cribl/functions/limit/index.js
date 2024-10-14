exports.name = 'Limit';
exports.version = '0.2';
exports.handleSignals = true;
exports.group = C.INTERNAL_FUNCTION_GROUP;
exports.sync = true;

let currentEventCount; // counting the (passed-through) events
let maxEventCount; // maximum of events to pass through

// gets the maximum number of events (limit) from the config
exports.init = (opts) => {
  const conf = opts.conf || {};
  currentEventCount = 0;
  maxEventCount = conf.limit ?? Number.MAX_VALUE;
};

// NOOP until the limit amount of events is reached
exports.process = (event) => {
  if (!event) return event;

  if (event.__signalEvent__) {
    if (event.__signalEvent__ === 'reset') {
      currentEventCount = 0;
    }
    return event;
  }

  if (maxEventCount === ++currentEventCount) {
    // send a signal along the pipeline, asking for cancel
    // (will be filtered out in EventProcessor)
    const signal = event.__clone(false, []);
    signal.__signalEvent__ = 'cancel';
    signal.__setCtrlField('reason', 'limit'); // for debugging only
    return [event, signal];
  } else if (maxEventCount < currentEventCount) {
    return null; // drop all subsequent events
  }

  return event;
};
