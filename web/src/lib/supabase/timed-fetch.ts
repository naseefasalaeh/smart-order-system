// Opt-in timings omit query strings, headers and bodies (which may contain credentials).
export const timedFetch: typeof fetch = async (input, init) => {
  const started = performance.now();
  const startedEpochMs = Date.now();
  const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
  let status = 0;
  try {
    const response = await fetch(input, init);
    status = response.status;
    return response;
  } finally {
    if (process.env.PERF_LOG === "1") {
      console.info("[perf] supabase", JSON.stringify({ method: init?.method ?? "GET", path: path.replace(/\/users\/[^/]+$/, "/users/:id"), status, startedEpochMs, ms: Math.round(performance.now() - started) }));
    }
  }
};
