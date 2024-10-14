exports.jobType = 'task-per-node';
exports.name = 'clear_pq';

const fs = require('fs');

let outputId;

const {
  util: { resolveEnvVars },
  internal: { PersistentQueue: { outputPath, orphanAssignments } },
} = C;

exports.initJob = async (opts) => {
  const { conf } = opts.conf.executor;
  outputId = conf.outputId;
};

exports.jobSeedTask = async () => {
  return {
    task: { 
      outputId
    }
  };
};

exports.initTask = async (opts) => {};

exports.jobOnError = async (job, taskId, error) => {}; 

exports.taskExecute = async (job, opts) => {
  const logger = job.logger();
  logger.info('task opts', { opts });
  const pqPath = outputPath(opts.outputId);
  if(!pqPath) throw { message: 'Misconfigured persistent queue path' };
  const resolvedPqPath = resolveEnvVars(pqPath);
  const workers = await fs.promises.readdir(resolvedPqPath);
  if (workers.length > 0) {
    await Promise.all(
      workers.map(async (worker) => {
        const path = `${resolvedPqPath}/${worker}/${opts.outputId}`;
        logger.debug('deleting path', { path });
        return fs.promises.rm(path, { recursive: true, force: true });
      })
    );
  }
  const assignedPaths = await orphanAssignments();
  logger.debug('orphans', { assignedPaths });
  if (assignedPaths.length > 0) {
    await Promise.all(assignedPaths.map(assignment => {
      const path = `${assignment}/${opts.outputId}`;
      logger.debug('deleting orphan', { path });
      return fs.promises.rm(path, { recursive: true, force: true });
    }));
  }
};
