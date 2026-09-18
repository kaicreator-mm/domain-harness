type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface CompiledBindingDescriptor {
  kind: string;
  bindingId: string;
  config?: JsonValue;
}

export interface RemoteTransportRequest {
  binding: CompiledBindingDescriptor;
  input: JsonValue;
  resourceKey: string;
  signal?: AbortSignal;
}

export interface RemoteTransportPort {
  execute(request: RemoteTransportRequest): Promise<JsonValue>;
}

export interface HttpJsonRuntimeResource {
  endpoint: string;
  token?: string;
  session?: string;
  headers?: Readonly<Record<string, string>>;
}

export interface ExpoHttpJsonRemoteTransportOptions {
  resources: Readonly<Record<string, unknown>>;
  fetchImpl?: typeof fetch;
}

export class HttpJsonTransportError extends Error {
  readonly code: 'RESOURCE_INVALID' | 'TRANSPORT_FAILED' | 'HTTP_STATUS' | 'RESPONSE_NOT_JSON';
  readonly status?: number;

  constructor(
    code: 'RESOURCE_INVALID' | 'TRANSPORT_FAILED' | 'HTTP_STATUS' | 'RESPONSE_NOT_JSON',
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'HttpJsonTransportError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function readPath(binding: CompiledBindingDescriptor): string {
  if (!isRecord(binding.config) || typeof binding.config.path !== 'string' || binding.config.path.length === 0) {
    throw new HttpJsonTransportError('RESOURCE_INVALID', 'Remote HTTP/JSON binding requires a logical path');
  }
  return binding.config.path.startsWith('/') ? binding.config.path : `/${binding.config.path}`;
}

function readResource(resources: Readonly<Record<string, unknown>>, key: string): HttpJsonRuntimeResource {
  const value = resources[key];
  if (!isRecord(value) || typeof value.endpoint !== 'string' || value.endpoint.length === 0) {
    throw new HttpJsonTransportError('RESOURCE_INVALID', `Runtime Resource ${key} must provide endpoint`);
  }

  if (value.token !== undefined && typeof value.token !== 'string') {
    throw new HttpJsonTransportError('RESOURCE_INVALID', `Runtime Resource ${key}.token must be a string`);
  }
  if (value.session !== undefined && typeof value.session !== 'string') {
    throw new HttpJsonTransportError('RESOURCE_INVALID', `Runtime Resource ${key}.session must be a string`);
  }
  if (value.headers !== undefined && (!isRecord(value.headers) || Object.values(value.headers).some((entry) => typeof entry !== 'string'))) {
    throw new HttpJsonTransportError('RESOURCE_INVALID', `Runtime Resource ${key}.headers must contain string values`);
  }

  return {
    endpoint: value.endpoint,
    ...(value.token === undefined ? {} : { token: value.token }),
    ...(value.session === undefined ? {} : { session: value.session }),
    ...(value.headers === undefined ? {} : { headers: value.headers as Readonly<Record<string, string>> }),
  };
}

function joinEndpoint(endpoint: string, path: string): string {
  return `${endpoint.replace(/\/+$/, '')}${path}`;
}

export function createExpoHttpJsonRemoteTransport(options: ExpoHttpJsonRemoteTransportOptions): RemoteTransportPort {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new HttpJsonTransportError('RESOURCE_INVALID', 'Expo host does not provide fetch');
  }

  return {
    async execute(request: RemoteTransportRequest): Promise<JsonValue> {
      const resource = readResource(options.resources, request.resourceKey);
      const path = readPath(request.binding);
      const headers: Record<string, string> = {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(resource.headers ?? {}),
      };
      if (resource.token !== undefined) headers.authorization = `Bearer ${resource.token}`;
      if (resource.session !== undefined) headers['x-domain-harness-session'] = resource.session;

      let response: Response;
      try {
        response = await fetchImpl(joinEndpoint(resource.endpoint, path), {
          method: 'POST',
          headers,
          body: JSON.stringify(request.input),
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        });
      } catch {
        throw new HttpJsonTransportError('TRANSPORT_FAILED', 'Remote HTTP transport failed');
      }

      if (!response.ok) {
        throw new HttpJsonTransportError('HTTP_STATUS', `Remote HTTP transport returned ${response.status}`, response.status);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(await response.text());
      } catch {
        throw new HttpJsonTransportError('RESPONSE_NOT_JSON', 'Remote HTTP response was not valid JSON');
      }
      if (!isJsonValue(parsed)) {
        throw new HttpJsonTransportError('RESPONSE_NOT_JSON', 'Remote HTTP response was not a structured JSON value');
      }
      return parsed;
    },
  };
}
