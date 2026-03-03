/**
 * HTTP 方法类型
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * 数据源类型
 */
export type DataSourceType = 'apifox' | 'url';

/**
 * JSON Schema 定义
 */
export interface JsonSchema {
    type?: string;
    format?: string;
    description?: string;
    properties?: Record<string, JsonSchema>;
    items?: JsonSchema;
    required?: string[];
    enum?: unknown[];
    $ref?: string;
    allOf?: JsonSchema[];
    oneOf?: JsonSchema[];
    anyOf?: JsonSchema[];
    additionalProperties?: boolean | JsonSchema;
    example?: unknown;
    default?: unknown;
    title?: string;
    nullable?: boolean;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    [key: string]: unknown;
}

/**
 * OpenAPI Operation 定义
 */
export interface OpenApiOperation {
    summary?: string;
    operationId?: string;
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
        description?: string;
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
    'x-apifox-folder'?: string;
    [key: string]: unknown;
}

/**
 * OpenAPI 规范
 */
export interface OpenApiSpec {
    openapi?: string;
    info?: {
        title?: string;
        version?: string;
        description?: string;
    };
    paths: Record<string, Record<string, OpenApiOperation>>;
    tags?: Array<{ name: string; description?: string }>;
    components?: {
        schemas?: Record<string, JsonSchema>;
        [key: string]: unknown;
    };
    servers?: Array<{ url: string; description?: string }>;
    [key: string]: unknown;
}

/**
 * Apifox 导出请求体
 */
export interface ApifoxExportRequest {
    scope: {
        type: string;
        excludedByTags?: string[];
        selectedByTags?: string[];
    };
    options?: {
        addFoldersToTags?: boolean;
        includeApifoxExtensionProperties?: boolean;
    };
    oasVersion: string;
    exportFormat: string;
    branchId?: number;
    moduleId?: number;
}

/**
 * 刷新配置
 */
export interface RefreshConfig {
    /** 刷新间隔（分钟），0 表示不自动刷新 */
    interval: number;
    /** 搜索未命中时是否自动刷新 */
    refreshOnMiss: boolean;
    /** 未命中刷新冷却时间（秒） */
    missRefreshCooldown: number;
}

/**
 * 服务器配置
 */
export interface ServerConfig {
    dataSource: DataSourceType;
    cacheDir: string;
    refresh: RefreshConfig;
    // Apifox 模式
    projectId?: string;
    accessToken?: string;
    moduleIds?: number[];
    branchId?: number;
    // URL 模式
    openapiUrl?: string;
}

/**
 * 接口摘要信息
 */
export interface ApiEndpointSummary {
    id: string;
    path: string;
    method: HttpMethod;
    name: string;
    tags: string[];
    description?: string;
    folder?: string;
}

/**
 * 参数定义
 */
export interface Parameter {
    name: string;
    in: 'path' | 'query' | 'header' | 'cookie';
    required?: boolean;
    description?: string;
    schema?: JsonSchema;
    example?: unknown;
}

/**
 * 接口详情
 */
export interface ApiEndpointDetail {
    id: string;
    path: string;
    method: HttpMethod;
    name: string;
    tags: string[];
    description?: string;
    folder?: string;
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
    responses: Record<string, {
        description: string;
        schema?: JsonSchema;
        example?: unknown;
        contentType?: string;
        contents?: Record<string, {
            schema?: JsonSchema;
            example?: unknown;
        }>;
    }>;
}

/**
 * 缓存元数据
 */
export interface CacheMeta {
    lastRefresh: string;
    apiCount: number;
    sourceId: string;
    expiresAt?: string;
    moduleIds?: number[];
    branchId?: number;
}
