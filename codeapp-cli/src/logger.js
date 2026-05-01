// Minimal logger that satisfies the @microsoft/power-apps-actions logger contract:
//   logger.trackScenario(name, props?) -> { complete, failure }
//   logger.trackActivityEvent(name, props?)
//   logger.flush?()
// We map everything to console (debug only) so we don't ship any telemetry.
export class ConsoleLogger {
  verbose;

  constructor({ verbose = false } = {}) {
    this.verbose = !!verbose;
  }

  trackScenario(name, props) {
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.error(`[scenario:start] ${name}`, props || '');
    }
    return {
      complete: (data) => {
        if (this.verbose) {
          // eslint-disable-next-line no-console
          console.error(`[scenario:complete] ${name}`, data || '');
        }
      },
      failure: (data) => {
        if (this.verbose) {
          // eslint-disable-next-line no-console
          console.error(`[scenario:failure] ${name}`, data || '');
        }
      },
    };
  }

  trackActivityEvent(name, props) {
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.error(`[event] ${name}`, props || '');
    }
  }

  async flush() {
    /* no-op */
  }
}
