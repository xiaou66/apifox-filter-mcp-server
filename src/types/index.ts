// 数据源类型
export type DataSourceType = 'apifox' | 'url';

// HTTP 方法类型
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

// JSON Schema 类型
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  $ref?: string;
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  [key: string]: unknown;
}

// 参数定义
export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
  example?: unknown;
}

// 接口摘要（用于列表展示）
export interface ApiEndpointSummary {
  id: string;
  path: string;
  method: HttpMethod;
  name: string;
  tags: string[];
  description?: string;
}

// 接口详情
export interface ApiEndpointDetail extends ApiEndpointSummary {
  parameters: {
    path?: Parameter[];
    query?: Parameter[];
    header?: Parameter[];
    cookie?: Parameter[];
  };
  requestBody?: {
    contentType: string;
    schema: JsonSchema;
    example?: unknown;
    contents?: Record<string, {
      schema?: JsonSchema;
      example?: unknown;
    }>;
  };
  responses: {
    [statusCode: string]: {
      description: string;
      schema?: JsonSchema;
      example?: unknown;
      contentType?: string;
      contents?: Record<string, {
        schema?: JsonSchema;
        example?: unknown;
      }>;
    };
  };
}

// 缓存元数据
export interface CacheMeta {
  lastRefresh: string;
  apiCount: number;
  sourceId: string;  // 数据源 ID（projectId 或 URL hash）
  expiresAt?: string;
  moduleIds?: number[];  // 模块 ID 列表
  branchId?: number;     // 分支 ID
}

// 刷新配置
export interface RefreshConfig {
  interval: number;           // 定时刷新间隔（分钟），0 禁用
  refreshOnMiss: boolean;     // 找不到时自动刷新
  missRefreshCooldown: number; // 自动刷新冷却时间（秒）
}

// 服务器配置
export interface ServerConfig {
  // 通用配置
  cacheDir: string;
  refresh: RefreshConfig;

  // 数据源类型
  dataSource: DataSourceType;

  // Apifox 模式配置（dataSource === 'apifox' 时必需）
  projectId?: string;
  accessToken?: string;
  moduleIds?: number[];
  branchId?: number;

  // URL 模式配置（dataSource === 'url' 时必需）
  openapiUrl?: string;
}

// OpenAPI 响应格式
export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  tags?: Array<{
    name: string;
    description?: string;
  }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, JsonSchema>;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
}

// OpenAPI 操作定义
export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: JsonSchema;
    example?: unknown;
  }>;
  requestBody?: {
    required?: boolean;
    content?: Record<string, {
      schema?: JsonSchema;
      example?: unknown;
    }>;
  };
  responses?: Record<string, {
    description?: string;
    content?: Record<string, {
      schema?: JsonSchema;
      example?: unknown;
    }>;
  }>;
}

// Apifox 导出请求参数
export interface ApifoxExportRequest {
  scope: {
    type: 'ALL' | 'SELECTED_ENDPOINTS' | 'SELECTED_TAGS' | 'SELECTED_FOLDERS';
    excludedByTags?: string[];
  };
  options?: {
    includeApifoxExtensionProperties?: boolean;
    addFoldersToTags?: boolean;
  };
  oasVersion?: '3.0' | '3.1' | '2.0';
  exportFormat?: 'JSON' | 'YAML';
  branchId?: number;
  moduleId?: number;
}
