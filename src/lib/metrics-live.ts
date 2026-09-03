type MetricsLivePayload = { slug: string };
type MetricsLiveListener = (payload: MetricsLivePayload) => void;

type MetricsLiveBus = Map<string, Set<MetricsLiveListener>>;

function getBus(): MetricsLiveBus {
  const globalState = globalThis as typeof globalThis & {
    __metricsLiveBus?: MetricsLiveBus;
  };
  if (!globalState.__metricsLiveBus) {
    globalState.__metricsLiveBus = new Map();
  }
  return globalState.__metricsLiveBus;
}

export function notifyMetricsProcessed(slug: string): void {
  const payload: MetricsLivePayload = { slug };
  getBus().get(slug)?.forEach((listener) => listener(payload));
}

export function subscribeMetricsProcessed(
  slug: string,
  listener: MetricsLiveListener
): () => void {
  const bus = getBus();
  let listeners = bus.get(slug);
  if (!listeners) {
    listeners = new Set();
    bus.set(slug, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) bus.delete(slug);
  };
}
