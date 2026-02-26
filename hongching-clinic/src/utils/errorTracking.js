// Lightweight Sentry integration via fetch API (no SDK needed)
// Uses Sentry's envelope API directly
// Env var: VITE_SENTRY_DSN

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

let dsn = null;
try {
  if (SENTRY_DSN) {
    const url = new URL(SENTRY_DSN);
    dsn = {
      publicKey: url.username,
      host: url.host,
      projectId: url.pathname.replace('/', ''),
    };
  }
} catch {}

function generateEventId() {
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

// Capture an error and send to Sentry
export function captureException(error, context = {}) {
  if (!dsn) return;

  const event = {
    event_id: generateEventId(),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    logger: 'hongching-clinic',
    environment: import.meta.env.MODE || 'production',
    exception: {
      values: [{
        type: error.name || 'Error',
        value: error.message || String(error),
        stacktrace: error.stack ? parseStack(error.stack) : undefined,
      }],
    },
    tags: {
      ...(context.tags || {}),
    },
    extra: {
      ...(context.extra || {}),
    },
    user: context.user ? {
      id: context.user.userId,
      username: context.user.username,
    } : undefined,
  };

  // Add tenant context
  if (context.tenantId) {
    event.tags.tenant_id = context.tenantId;
  }
  if (context.tenantSlug) {
    event.tags.tenant_slug = context.tenantSlug;
  }

  sendToSentry(event);
}

// Capture a message
export function captureMessage(message, level = 'info', context = {}) {
  if (!dsn) return;
  const event = {
    event_id: generateEventId(),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level,
    message: { formatted: message },
    tags: context.tags || {},
    extra: context.extra || {},
  };
  sendToSentry(event);
}

function parseStack(stack) {
  // Simple stack trace parser
  const frames = stack.split('\n').slice(1).map(line => {
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) ||
                  line.match(/at\s+(.+?):(\d+):(\d+)/);
    if (!match) return null;
    if (match.length === 5) {
      return { function: match[1], filename: match[2], lineno: +match[3], colno: +match[4] };
    }
    return { filename: match[1], lineno: +match[2], colno: +match[3] };
  }).filter(Boolean).reverse();
  return { frames };
}

function sendToSentry(event) {
  if (!dsn) return;
  const url = `https://${dsn.host}/api/${dsn.projectId}/store/?sentry_key=${dsn.publicKey}&sentry_version=7`;

  try {
    // Use sendBeacon for reliability (works even during page unload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, JSON.stringify(event));
    } else {
      fetch(url, {
        method: 'POST',
        body: JSON.stringify(event),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {}
}

// Global error handler setup
export function initErrorTracking(userContext = {}) {
  if (!dsn) return;

  // Capture unhandled errors
  window.addEventListener('error', (event) => {
    captureException(event.error || new Error(event.message), {
      ...userContext,
      tags: { handler: 'window.onerror' },
      extra: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    captureException(error, {
      ...userContext,
      tags: { handler: 'unhandledrejection' },
    });
  });

  console.log('[ErrorTracking] Initialized');
}
