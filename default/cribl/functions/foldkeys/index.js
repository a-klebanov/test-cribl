exports.name = 'FoldKeys';
exports.version = '0.1';
exports.handleSignals = false;
exports.group = C.INTERNAL_FUNCTION_GROUP;
exports.sync = true;

let deleteOriginal;
let separator;
let selectionRegExp;

/**
 * Initializes the FoldKeys pipeline function for configuration object.
 * @param {*} opts 
 */
exports.init = (opts) => {
  const conf = opts?.conf || {};

  deleteOriginal = conf.deleteOriginal ?? true;
  separator = conf.separator ?? '.';

  // was a RegExp (for key selection) specified?
  if (conf.selectionRegExp) {
    // we support RegExp string only or in /../flags form
    const regExForm = conf.selectionRegExp.match(/\/([^\/]+)\/([gimsuy]*)/);
    if (regExForm?.length > 1) {
      // specified in /../flags form, separate flags off
      selectionRegExp = new RegExp(regExForm[1], regExForm[2] ?? '');
    } else {
      // simple form: no flags
      selectionRegExp = new RegExp(conf.selectionRegExp);
    }
  }
};

/**
 * Processes a single event (folding keys based on config).
 * @param {*} event The event for which to fold the keys
 * @returns Manipulated event
 */
exports.process = (event) => {
  if (!event) return event;
  return fold(event);
};

/**
 * Recursive helper to fold the keys of an event.
 * Figures out if a key, separated by separator string, describes a path
 * and then folds the key path into a nested object. 
 * @param {*} obj The object/event for which to fold the keys
 * @returns The input object for convenience
 */
function fold(obj) {
  for (let [key, value] of Object.entries(obj)) {
    // does the key name match the selection RegExp?
    if (selectionRegExp == null || selectionRegExp.test(key)) {
      const fieldNameSplits = key.split(separator);

      // do we have a path specified, i.e. "a.b" => a: { b: val }?
      if (fieldNameSplits.length > 1) {
        let curr = obj;

        // ensure proper nesting
        for (let navLevelIdx = 0; navLevelIdx < fieldNameSplits.length - 1; ++navLevelIdx) {
          const fieldNameSplit = fieldNameSplits[navLevelIdx];
          let navLevel = curr[fieldNameSplit];
          if (navLevel == null) {
            navLevel = Object.create(null);
            curr[fieldNameSplit] = navLevel;
          } else if (typeof navLevel !== 'object') {
            navLevel = { [`original_${fieldNameSplit}`]: navLevel };
          }
  
          curr = navLevel;
        }
  
        curr[fieldNameSplits[fieldNameSplits.length - 1]] = value;

        // delete the original key
        if (deleteOriginal) obj[key] = undefined;
      }
    }

    // recurse down if the value was an object itself
    if (value != null && typeof value === 'object') {
      fold(value);
    }  
  }

  return obj;
}
