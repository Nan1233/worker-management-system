import api from "../services/api";

const marker = "__ktcWorkerAccountPolicyInstalled";
const apiWithMarker = api as typeof api & { [marker]?: boolean };

if (!apiWithMarker[marker]) {
  apiWithMarker[marker] = true;
  api.interceptors.request.use((config) => {
    const url = String(config.url || "");
    if (config.method?.toLowerCase() !== "post" || !/\/users\/?$/.test(url)) return config;

    const body = config.data as Record<string, unknown> | undefined;
    if (!body || body.role !== "worker" || body.password) return config;

    const workerCode = String(body.worker_code || "").trim();
    const generatedPassword = workerCode
      ? `${workerCode}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
      : crypto.randomUUID();

    config.data = { ...body, password: generatedPassword };
    return config;
  });
}
