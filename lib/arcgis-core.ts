import axios from 'axios';
import { ArcqError, tokenError } from './errors.js';
import { getHttpsAgent, tlsErrorMessage } from './tls-core.js';
import type {
  ArcGisError,
  CatalogLayer,
  LayerField,
  LayerMetadataResponse,
  QueryParams,
  QueryResponse,
  ServiceCatalogResponse,
  ValidateResponse,
} from './types.js';

// ArcGIS reports failures inside a 200 response body; surface them loudly.
function throwArcGisError(error: ArcGisError): never {
  if (error.code === 498 || error.code === 499) {
    throw tokenError();
  }
  throw new ArcqError(
    error.code != null
      ? `ArcGIS error ${error.code}: ${error.message}`
      : error.message
  );
}

// Params go in a form-encoded POST body rather than the URL query string, so
// the token never lands in server/proxy access logs. Null/undefined values
// are omitted rather than serialized as "null"/"undefined".
function formBody(params: Record<string, unknown>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    body.append(key, String(value));
  }
  return body;
}

async function postForm<T>(
  url: string,
  params: Record<string, unknown>
): Promise<T> {
  const agent = getHttpsAgent();
  try {
    const res = await axios.post<T>(url, formBody(params), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      ...(agent ? { httpsAgent: agent } : {}),
    });
    return res.data;
  } catch (error) {
    const tlsMessage = tlsErrorMessage(error, url);
    throw tlsMessage ? new ArcqError(tlsMessage) : error;
  }
}

export async function validateToken(
  layerUrl: string,
  token: string | null
): Promise<void> {
  const data = await postForm<ValidateResponse>(layerUrl, {
    f: 'json',
    token,
  });

  if (data.error) {
    throwArcGisError(data.error);
  }
}

export async function fetchServiceCatalog(
  serviceUrl: string,
  token: string | null
): Promise<CatalogLayer[]> {
  const data = await postForm<ServiceCatalogResponse>(serviceUrl, {
    f: 'json',
    token,
  });

  if (data.error) {
    throwArcGisError(data.error);
  }

  const layers = data.layers || [];
  const tables = data.tables || [];

  return [...layers, ...tables].map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type || 'layer',
    url: `${serviceUrl}/${l.id}`,
  }));
}

export async function fetchLayerMetadata(
  layerUrl: string,
  token: string | null
): Promise<LayerField[]> {
  const data = await postForm<LayerMetadataResponse>(layerUrl, {
    f: 'json',
    token,
  });

  if (data.error) {
    throwArcGisError(data.error);
  }

  return (data.fields ?? []).map((f) => {
    const field: LayerField = { name: f.name, type: f.type };
    if (f.alias != null) field.alias = f.alias;
    if (f.length != null) field.length = f.length;
    return field;
  });
}

export async function queryLayer(
  layerUrl: string,
  params: QueryParams
): Promise<QueryResponse> {
  const data = await postForm<QueryResponse>(`${layerUrl}/query`, params);

  if (data.error) {
    throwArcGisError(data.error);
  }

  return data;
}
