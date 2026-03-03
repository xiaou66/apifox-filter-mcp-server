import { request } from 'undici';
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import type { ApifoxExportRequest, OpenApiSpec, ServerConfig } from '../types';
import { logger } from '../utils';

const APIFOX_API_BASE = process.env.APIFOX_API_BASE || 'https://api.apifox.com';
const API_VERSION = '2024-03-28';

/**
 * 获取选项
 */
export interface FetchOptions {
    moduleId?: number;
    branchId?: number;
}

/**
 * OpenAPI 数据获取接口
 */
export interface OpenApiFetcher {
    /**
     * 获取 OpenAPI 数据
     */
    fetch(options?: FetchOptions): Promise<OpenApiSpec>;

    /**
     * 获取数据源 ID（用于缓存文件命名）
     */
    getSourceId(): string;
}

/**
 * Apifox 数据获取实现
 */
export class ApifoxFetcher implements OpenApiFetcher {
    private accessToken: string;
    private projectId: string;

    constructor(accessToken: string, projectId: string) {
        this.accessToken = accessToken;
        this.projectId = projectId;
    }

    async fetch(options?: FetchOptions): Promise<OpenApiSpec> {
        const url = `${APIFOX_API_BASE}/v1/projects/${this.projectId}/export-openapi?locale=zh-CN`;

        const body: ApifoxExportRequest = {
            scope: {
                type: 'ALL',
            },
            // 将文件夹名称注入到 tags 中，并包含 x-apifox-folder 扩展字段
            options: {
                addFoldersToTags: true,
                includeApifoxExtensionProperties: true,
            },
            oasVersion: '3.0',
            exportFormat: 'JSON',
            branchId: options?.branchId,
            moduleId: options?.moduleId,
        };

        logger.debug('Exporting OpenAPI data from Apifox', { url, body });

        try {
            const response = await request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`,
                    'X-Apifox-Api-Version': API_VERSION,
                },
                body: JSON.stringify(body),
            });

            if (response.statusCode !== 200) {
                const errorBody = await response.body.text();
                throw new Error(`Apifox API error: ${response.statusCode} - ${errorBody}`);
            }

            const data = await response.body.json() as OpenApiSpec;
            logger.info(`Successfully exported ${Object.keys(data.paths || {}).length} endpoints`, {
                moduleId: options?.moduleId,
                branchId: options?.branchId,
            });
            return data;
        } catch (error) {
            logger.error('Failed to export OpenAPI data', error);
            throw error;
        }
    }

    getSourceId(): string {
        return this.projectId;
    }
}

/**
 * URL 数据获取实现（支持 http/https/file 协议）
 */
export class UrlFetcher implements OpenApiFetcher {
    private openapiUrl: string;
    private sourceId: string;

    constructor(openapiUrl: string) {
        this.openapiUrl = openapiUrl;
        // 使用 URL 的 hash 作为 sourceId
        this.sourceId = `url-${createHash('md5').update(openapiUrl).digest('hex').slice(0, 8)}`;
    }

    async fetch(_options?: FetchOptions): Promise<OpenApiSpec> {
        const urlObj = new URL(this.openapiUrl);

        if (urlObj.protocol === 'file:') {
            return this.fetchFromFile(urlObj);
        } else {
            return this.fetchFromHttp(this.openapiUrl);
        }
    }

    /**
     * 从本地文件读取 OpenAPI 数据
     */
    private async fetchFromFile(urlObj: URL): Promise<OpenApiSpec> {
        // file:///path/to/file.json -> /path/to/file.json
        const filePath = decodeURIComponent(urlObj.pathname);
        logger.debug('Reading OpenAPI data from file', { filePath });

        try {
            const content = await fsp.readFile(filePath, 'utf-8');
            const data = JSON.parse(content) as OpenApiSpec;
            logger.info(`Successfully loaded ${Object.keys(data.paths || {}).length} endpoints from file`, {
                filePath,
            });
            return data;
        } catch (error) {
            logger.error('Failed to read OpenAPI file', error);
            throw new Error(`Failed to read OpenAPI file: ${filePath}`);
        }
    }

    /**
     * 从 HTTP/HTTPS URL 获取 OpenAPI 数据
     */
    private async fetchFromHttp(url: string): Promise<OpenApiSpec> {
        logger.debug('Fetching OpenAPI data from URL', { url });

        try {
            const response = await request(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (response.statusCode !== 200) {
                const errorBody = await response.body.text();
                throw new Error(`URL fetch error: ${response.statusCode} - ${errorBody}`);
            }

            const data = await response.body.json() as OpenApiSpec;
            logger.info(`Successfully fetched ${Object.keys(data.paths || {}).length} endpoints from URL`, {
                url,
            });
            return data;
        } catch (error) {
            logger.error('Failed to fetch OpenAPI data from URL', error);
            throw error;
        }
    }

    getSourceId(): string {
        return this.sourceId;
    }
}

/**
 * 创建 OpenAPI 数据获取器
 */
export function createFetcher(config: ServerConfig): OpenApiFetcher {
    if (config.dataSource === 'url') {
        if (!config.openapiUrl) {
            throw new Error('openapiUrl is required when dataSource is "url"');
        }
        return new UrlFetcher(config.openapiUrl);
    }

    // Apifox 模式
    if (!config.accessToken || !config.projectId) {
        throw new Error('accessToken and projectId are required when dataSource is "apifox"');
    }
    return new ApifoxFetcher(config.accessToken, config.projectId);
}
