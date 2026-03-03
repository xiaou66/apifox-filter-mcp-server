import { promises as fsp } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CacheMeta, OpenApiSpec, RefreshConfig, JsonSchema, OpenApiOperation } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * 单个模块的缓存标识
 */
interface ModuleCacheKey {
  moduleId?: number;
  branchId?: number;
}

/**
 * 缓存管理器 - 支持多模块单独缓存
 * 每个 moduleId + branchId 组合缓存到独立文件
 */
export class CacheManager {
  private cacheDir: string;
  private sourceId: string;
  private refreshConfig: RefreshConfig;
  private moduleIds?: number[];
  private branchId?: number;
  private lastMissRefreshTime: number = 0;

  constructor(
    cacheDir: string,
    sourceId: string,
    refreshConfig: RefreshConfig,
    moduleIds?: number[],
    branchId?: number
  ) {
    this.cacheDir = cacheDir;
    this.sourceId = sourceId;
    this.refreshConfig = refreshConfig;
    this.moduleIds = moduleIds;
    this.branchId = branchId;
  }

  /**
   * 获取所有需要管理的缓存键
   */
  private getCacheKeys(): ModuleCacheKey[] {
    if (!this.moduleIds || this.moduleIds.length === 0) {
      // 没有指定 moduleIds，使用单个默认缓存
      return [{ branchId: this.branchId }];
    }
    // 每个 moduleId 单独一个缓存
    return this.moduleIds.map(moduleId => ({
      moduleId,
      branchId: this.branchId,
    }));
  }

  /**
   * 生成缓存文件前缀
   */
  private getCachePrefix(key: ModuleCacheKey): string {
    const parts = [this.sourceId];
    if (key.branchId) {
      parts.push(`b${key.branchId}`);
    }
    if (key.moduleId) {
      parts.push(`m${key.moduleId}`);
    }
    return parts.join('-');
  }

  private getDataPath(key: ModuleCacheKey): string {
    return join(this.cacheDir, `${this.getCachePrefix(key)}-data.json`);
  }

  private getMetaPath(key: ModuleCacheKey): string {
    return join(this.cacheDir, `${this.getCachePrefix(key)}-meta.json`);
  }

  /**
   * 初始化缓存目录
   */
  async init(): Promise<void> {
    try {
      // 验证缓存目录路径有效性
      const resolved = resolve(this.cacheDir);
      if (!resolved || resolved === '/') {
        throw new Error(`Invalid cache directory: "${this.cacheDir}" resolved to "${resolved}"`);
      }
      this.cacheDir = resolved;

      await fsp.mkdir(this.cacheDir, { recursive: true });
      logger.debug('Cache directory initialized', { cacheDir: this.cacheDir });
    } catch (error) {
      logger.error(`Failed to create cache directory: ${this.cacheDir}`, error);
      throw error;
    }
  }

  /**
   * 读取单个缓存文件
   */
  private async readCacheData(key: ModuleCacheKey): Promise<OpenApiSpec | null> {
    try {
      const content = await fsp.readFile(this.getDataPath(key), 'utf-8');
      return JSON.parse(content) as OpenApiSpec;
    } catch {
      return null;
    }
  }

  /**
   * 读取单个缓存的元数据
   */
  private async readCacheMeta(key: ModuleCacheKey): Promise<CacheMeta | null> {
    try {
      const content = await fsp.readFile(this.getMetaPath(key), 'utf-8');
      return JSON.parse(content) as CacheMeta;
    } catch {
      return null;
    }
  }

  /**
   * 获取所有缓存数据（合并多个模块）
   */
  async getData(): Promise<OpenApiSpec | null> {
    const keys = this.getCacheKeys();
    const specs: OpenApiSpec[] = [];

    for (const key of keys) {
      const data = await this.readCacheData(key);
      if (data) {
        specs.push(data);
      }
    }

    if (specs.length === 0) {
      return null;
    }

    // 如果只有一个，直接返回
    if (specs.length === 1) {
      return specs[0];
    }

    // 合并多个 OpenAPI 规范
    return this.mergeOpenApiSpecs(specs);
  }

  /**
   * 合并多个 OpenAPI 规范
   */
  private mergeOpenApiSpecs(specs: OpenApiSpec[]): OpenApiSpec {
    if (specs.length === 0) throw new Error('No specs to merge');
    if (specs.length === 1) return specs[0];

    const base: OpenApiSpec = {
      ...specs[0],
      paths: {},
      tags: [],
      components: specs.some(spec => spec.components)
        ? { schemas: {} }
        : undefined,
    };

    // 合并 paths（按 path + method 合并，避免覆盖）
    for (const spec of specs) {
      for (const [path, methods] of Object.entries(spec.paths || {})) {
        if (!base.paths[path]) {
          base.paths[path] = {};
        }
        base.paths[path] = {
          ...base.paths[path],
          ...methods,
        };
      }
    }

    // 合并 tags（去重）
    const tagSet = new Set<string>();
    const mergedTags: Array<{ name: string; description?: string }> = [];
    for (const spec of specs) {
      for (const tag of spec.tags || []) {
        if (!tagSet.has(tag.name)) {
          tagSet.add(tag.name);
          mergedTags.push(tag);
        }
      }
    }
    base.tags = mergedTags;

    // 合并 components.schemas
    if (base.components) {
      base.components.schemas = specs.reduce((acc, spec) => {
        return { ...acc, ...(spec.components?.schemas || {}) };
      }, {} as Record<string, JsonSchema>);
    }

    logger.debug(`Merged ${specs.length} cached specs, total ${Object.keys(base.paths).length} endpoints`);
    return base;
  }

  /**
   * 获取缓存元数据（返回第一个可用的）
   */
  async getMeta(): Promise<CacheMeta | null> {
    const keys = this.getCacheKeys();
    for (const key of keys) {
      const meta = await this.readCacheMeta(key);
      if (meta) {
        return meta;
      }
    }
    return null;
  }

  /**
   * 保存单个模块的缓存数据
   */
  async saveModuleData(data: OpenApiSpec, moduleId?: number): Promise<void> {
    await this.init();

    const key: ModuleCacheKey = {
      moduleId,
      branchId: this.branchId,
    };

    // 保存数据
    await fsp.writeFile(this.getDataPath(key), JSON.stringify(data, null, 2), 'utf-8');

    // 保存元数据
    const meta: CacheMeta = {
      lastRefresh: new Date().toISOString(),
      apiCount: Object.keys(data.paths || {}).length,
      sourceId: this.sourceId,
      expiresAt: this.refreshConfig.interval > 0
        ? new Date(Date.now() + this.refreshConfig.interval * 60 * 1000).toISOString()
        : undefined,
      moduleIds: moduleId ? [moduleId] : undefined,
      branchId: this.branchId,
    };
    await fsp.writeFile(this.getMetaPath(key), JSON.stringify(meta, null, 2), 'utf-8');

    logger.info('Module cache saved', {
      apiCount: meta.apiCount,
      moduleId,
      branchId: this.branchId,
      cachePrefix: this.getCachePrefix(key),
    });
  }

  /**
   * 保存所有模块的缓存数据（兼容旧接口）
   * @deprecated 使用 saveModuleData 代替
   */
  async saveData(data: OpenApiSpec): Promise<void> {
    // 如果没有 moduleIds，直接保存
    if (!this.moduleIds || this.moduleIds.length === 0) {
      await this.saveModuleData(data, undefined);
      return;
    }

    // 如果只有一个 moduleId，也直接保存
    if (this.moduleIds.length === 1) {
      await this.saveModuleData(data, this.moduleIds[0]);
      return;
    }

    // 多个 moduleIds 时，这个方法不应该被调用
    // 应该使用 saveModuleData 分别保存每个模块
    logger.warn('saveData called with multiple moduleIds, saving as merged data');
    await this.saveModuleData(data, undefined);
  }

  /**
   * 检查是否有任何缓存过期
   */
  async isExpired(): Promise<boolean> {
    const keys = this.getCacheKeys();

    for (const key of keys) {
      const meta = await this.readCacheMeta(key);
      if (!meta) {
        // 缺少缓存视为过期
        return true;
      }
      if (meta.expiresAt && new Date(meta.expiresAt) < new Date()) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取过期的模块 ID 列表
   */
  async getExpiredModuleIds(): Promise<(number | undefined)[]> {
    const keys = this.getCacheKeys();
    const expired: (number | undefined)[] = [];

    for (const key of keys) {
      const meta = await this.readCacheMeta(key);
      if (!meta || (meta.expiresAt && new Date(meta.expiresAt) < new Date())) {
        expired.push(key.moduleId);
      }
    }

    return expired;
  }

  /**
   * 检查是否可以进行 miss 刷新
   */
  canMissRefresh(): boolean {
    if (!this.refreshConfig.refreshOnMiss) return false;
    const now = Date.now();
    const cooldownMs = this.refreshConfig.missRefreshCooldown * 1000;
    return now - this.lastMissRefreshTime > cooldownMs;
  }

  /**
   * 标记 miss 刷新时间
   */
  markMissRefresh(): void {
    this.lastMissRefreshTime = Date.now();
  }

  /**
   * 清除所有缓存
   */
  async clear(): Promise<void> {
    const keys = this.getCacheKeys();

    for (const key of keys) {
      try {
        await fsp.unlink(this.getDataPath(key));
        await fsp.unlink(this.getMetaPath(key));
      } catch {
        // 忽略文件不存在的错误
      }
    }

    logger.info('All caches cleared');
  }

  /**
   * 获取配置的模块 ID 列表
   */
  getModuleIds(): number[] | undefined {
    return this.moduleIds;
  }

  /**
   * 获取配置的分支 ID
   */
  getBranchId(): number | undefined {
    return this.branchId;
  }
}
