// Shared data shapes passed between arcq's modules.

export interface Config {
  services?: Record<string, string>;
  layers?: Record<string, string>;
  // Opt in to relaxed TLS for arcq's own requests (trusted self-signed
  // servers). Non-boolean values are ignored (treated as false).
  insecure?: boolean;
  // Opt in to sending the access token to hosts other than the one it was
  // issued for. Non-boolean values are ignored (treated as false).
  allowCrossHost?: boolean;
}

export interface Context {
  service?: string;
  layerId?: number;
  name?: string;
  url: string;
}

// A layer/table entry as returned by fetchServiceCatalog (and cached).
export interface CatalogLayer {
  id: number;
  name: string;
  type: string;
  url: string;
}

// Cache file shape: service name -> its catalog layers.
export type Cache = Record<string, CatalogLayer[]>;

export interface ArcGisError {
  message: string;
  code?: number;
}

// A raw layer/table entry inside an ArcGIS service catalog response.
export interface RawCatalogEntry {
  id: number;
  name: string;
  type?: string;
}

export interface ServiceCatalogResponse {
  layers?: RawCatalogEntry[];
  tables?: RawCatalogEntry[];
  error?: ArcGisError;
}

export interface ValidateResponse {
  error?: ArcGisError;
}

export interface LayerField {
  name: string;
  type: string;
  alias?: string;
  length?: number;
}

export interface LayerMetadataResponse {
  fields?: LayerField[];
  error?: ArcGisError;
}

export interface Feature {
  attributes: Record<string, unknown>;
}

export interface QueryResponse {
  features?: Feature[];
  exceededTransferLimit?: boolean;
  count?: number;
  error?: ArcGisError;
}

// The ArcGIS OAuth2 token endpoint reports failures in a `error` object; its
// shape varies (portal-style `code`/`message`, OAuth-style `error`/
// `error_description`), so every field is optional.
export interface OAuthTokenError {
  code?: number;
  error?: string;
  error_description?: string;
  message?: string;
}

export interface OAuthTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: OAuthTokenError;
}

export interface QueryParams {
  where?: string;
  outFields?: string;
  f?: string;
  token?: string | null;
  resultOffset?: number;
  resultRecordCount?: number;
  orderByFields?: string;
  returnCountOnly?: boolean;
  [key: string]: unknown;
}
