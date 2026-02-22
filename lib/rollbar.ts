import Rollbar from 'rollbar';

const codeVersion = process.env.VERCEL_GIT_COMMIT_SHA || 
                    process.env.REPL_ID || 
                    'development';

// Safe stringify that handles circular references with working depth limiting
function safeStringify(obj: unknown, maxDepth = 3): string {
  const seen = new WeakSet();
  const depthMap = new WeakMap<object, number>();

  return JSON.stringify(obj, function (_key, value) {
    // Skip problematic properties that cause serialization issues
    if (_key === 'data' && typeof value === 'object' && value !== null && 'user' in value) {
      return '[session data]';
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[circular]';
      }
      // Track depth: parent's depth + 1
      const parentDepth = (this && typeof this === 'object') ? (depthMap.get(this) ?? 0) : 0;
      const currentDepth = parentDepth + 1;
      if (currentDepth > maxDepth) {
        return '[max depth]';
      }
      seen.add(value);
      depthMap.set(value, currentDepth);
    }
    return value;
  });
}

const baseConfig: Rollbar.Configuration = {
  captureUncaught: true,
  captureUnhandledRejections: true,
  environment: process.env.NODE_ENV || 'development',
  codeVersion,
  payload: {
    client: {
      javascript: {
        source_map_enabled: true,
        code_version: codeVersion,
        guess_uncaught_frames: true,
      },
    },
    server: {
      root: 'webpack://fundroom-ai/',
    },
  },
};

const clientToken = process.env.NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN;

export const clientConfig: Rollbar.Configuration = {
  accessToken: clientToken || 'disabled',
  enabled: !!clientToken,
  ...baseConfig,
  captureIp: 'anonymize',
  verbose: false,
  reportLevel: 'warning',
  // Disable telemetry completely to prevent circular reference and stack overflow issues
  autoInstrument: false, // Completely disable auto-instrumentation
  // Limit payload depth to prevent stack overflow during serialization
  maxItems: 10, // Only report first 10 errors per page load
  itemsPerMinute: 5, // Rate limit to prevent flood
  // Limit payload size to prevent stack overflow
  scrubFields: ['password', 'secret', 'token', 'accessToken', 'refreshToken', 'data.user', 'data', 'session'],
  // NOTE: Don't use scrubPaths for body.telemetry - it converts to string which breaks Rollbar API
  // Instead, we set telemetry to empty array in transform function
  // Transform payload to handle circular references (mutates in place, no return)
  transform: (payload: Record<string, unknown>) => {
    // Safely handle any remaining circular references in custom data
    if (payload.custom) {
      try {
        payload.custom = JSON.parse(safeStringify(payload.custom, 2));
      } catch {
        payload.custom = { error: 'Unable to serialize custom data' };
      }
    }
    // Set telemetry to empty array to prevent serialization issues
    // (scrubPaths converts to string "********" which breaks Rollbar API)
    if ((payload as any).body) {
      (payload as any).body.telemetry = [];
    }
  },
  // Early check to prevent processing problematic errors entirely
  checkIgnore: (_isUncaught: boolean, args: Rollbar.LogArgument[]) => {
    const message = args[0];
    if (typeof message === 'string') {
      const ignorePatterns = [
        'client token verification',
        'token verification',
        'initialized',
        'maximum call stack',
        'call stack size exceeded',
        'script error',
        'chunkloaderror',
        'loading chunk',
        'failed to fetch dynamically imported module',
        'service worker',
        'sw.js',
      ];
      return ignorePatterns.some(pattern => 
        message.toLowerCase().includes(pattern)
      );
    }
    if (message instanceof Error) {
      if (message.name === 'RangeError' || 
          message.message?.toLowerCase().includes('call stack')) {
        return true;
      }
      if (message.name === 'ChunkLoadError' ||
          message.message?.toLowerCase().includes('loading chunk') ||
          message.message?.toLowerCase().includes('dynamically imported module')) {
        return true;
      }
    }
    return false;
  },
  // Wrap uncaught error handler to prevent Rollbar stack overflow
  onSendCallback: (_isUncaught: boolean, args: Rollbar.LogArgument[], _payload: unknown) => {
    // This runs before sending - we can abort if we detect circular ref issues
    try {
      const firstArg = args[0];
      if (firstArg instanceof Error && firstArg.name === 'RangeError') {
        return false; // Don't send
      }
    } catch {
      return false; // Don't send if checking causes error
    }
  },
};

const serverToken = process.env.ROLLBAR_POST_SERVER_ITEM_ACCESS_TOKEN || process.env.ROLLBAR_SERVER_TOKEN;
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

export const serverInstance = new Rollbar({
  accessToken: serverToken || 'disabled',
  enabled: !!serverToken && !isTestEnv,
  ...baseConfig,
  verbose: process.env.NODE_ENV === 'development' && !isTestEnv,
});

export function setRollbarUser(user: { id: string; email?: string; username?: string }) {
  serverInstance.configure({
    payload: {
      person: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    },
  });
}

export function clearRollbarUser() {
  serverInstance.configure({
    payload: {
      person: undefined,
    },
  });
}

// ---------------------------------------------------------------------------
// Critical Alert Helpers
//
// Use these for high-severity events that should trigger immediate Rollbar
// alerts (configured via Rollbar dashboard alert rules):
//   - "critical" level → immediate PagerDuty/email/Slack notification
//   - Custom fingerprints group related errors for noise reduction
// ---------------------------------------------------------------------------

/**
 * Report a critical error that should trigger an immediate alert.
 * Use for: database failures, wire transfer errors, auth floods.
 */
export function reportCritical(
  message: string,
  context: Record<string, unknown> = {},
): void {
  if (!serverInstance) return;
  serverInstance.critical(message, {
    ...context,
    timestamp: new Date().toISOString(),
    alertCategory: 'critical',
  });
}

/**
 * Report a potential security incident (auth brute force, unusual access patterns).
 * Groups by fingerprint to prevent alert fatigue from repeated events.
 */
export function reportSecurityIncident(
  message: string,
  context: Record<string, unknown> = {},
): void {
  if (!serverInstance) return;
  serverInstance.error(message, {
    ...context,
    timestamp: new Date().toISOString(),
    alertCategory: 'security',
    fingerprint: `security:${context.type || 'unknown'}`,
  });
}
