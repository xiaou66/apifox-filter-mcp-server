import { request } from 'undici';
import type { ApifoxExportRequest, OpenApiSpec } from '../types';
import { logger } from '../utils/logger.js';

const APIFOX_API_BASE = process.env.APIFOX_API_BASE || 'https://api.apifox.com';
const API_VERSION = '2024-03-28';

export class ApifoxClient {
  private accessToken: string;
  private projectId: string;

  constructor(accessToken: string, projectId: string) {
    this.accessToken = accessToken;
    this.projectId = projectId;
  }

  /**
   * 导出 OpenAPI 数据
   */
  async exportOpenApi(options?: Partial<ApifoxExportRequest>): Promise<OpenApiSpec> {
    const url = `${APIFOX_API_BASE}/v1/projects/${this.projectId}/export-openapi?locale=zh-CN`;

    const body: ApifoxExportRequest = {
      scope: {
        type: 'ALL',
      },
      oasVersion: '3.0',
      exportFormat: 'JSON',
      ...options,
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
}
