/** Deadline stops orchestration and prevents subsequent writes; in-flight DB transactions remain atomic. */
export function withSyncDeadline(operation, signal) {
  const error = () => Object.assign(new Error('sync_deadline_exceeded'), { code: 'sync_deadline_exceeded' });
  if (signal.aborted) return Promise.reject(error());
  return new Promise((resolve, reject) => {
    const abort = () => reject(error());
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw error();
      return operation();
    }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
