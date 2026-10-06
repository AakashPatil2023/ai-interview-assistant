// Bound every attempt so an unavailable provider cannot prevent fallback.
export async function requestJson(provider, url, options) {
  const configuredTimeout = Number(process.env.LLM_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout > 0 && configuredTimeout <= 2147483647
    ? configuredTimeout
    : 45000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });

    if (!response.ok) {
      await response.body?.cancel();
      const error = new Error(`${provider} request failed (HTTP ${response.status})`);
      error.status = response.status;
      throw error;
    }

    try {
      return await response.json();
    } catch {
      throw new Error(`${provider} returned an invalid JSON response`);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${provider} timed out after ${timeoutMs}ms`);
    }
    if (error.status || error.message === `${provider} returned an invalid JSON response`) {
      throw error;
    }
    // Do not expose credential-bearing URLs or raw upstream error messages.
    throw new Error(`${provider} could not be reached`);
  } finally {
    clearTimeout(timer);
  }
}
