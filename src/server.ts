import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { ServerConfig, HttpMethod } from './types';
import { CacheManager, IndexManager, createFetcher } from './core';
import type { OpenApiFetcher } from './core';
import { logger } from './utils';

export class ApifoxFilterServer {
  private server: McpServer;
  private config: ServerConfig;
  private fetcher: OpenApiFetcher;
  private cacheManager: CacheManager;
  private indexManager: IndexManager;
  private refreshTimer?: NodeJS.Timeout;

  constructor(config: ServerConfig) {
    this.config = config;
    this.fetcher = createFetcher(config);
    this.cacheManager = new CacheManager(
      config.cacheDir,
      this.fetcher.getSourceId(),
      config.refresh,
      config.moduleIds,
      config.branchId
    );
    this.indexManager = new IndexManager();

    this.server = new McpServer({
      name: 'apifox-filter-mcp-server',
      version: '1.0.0',
    });

    this.registerTools();
  }

  private registerTools(): void {
    // 智能搜索工具
    this.server.registerTool(
      'smart_search_api',
      {
        title: '智能搜索接口',
        description: `根据自然语言描述智能搜索接口，AI 的首选搜索工具。

核心能力：
- 自动提取关键词并映射到接口路径
- 支持中英文混合查询
- 按相关度排序返回结果

使用场景：
- 用户描述功能需求："查找用户登录接口" → 搜索 login/auth
- 用户询问模块接口："达人管理有哪些接口" → 搜索 influencer/daren
- 用户描述业务场景："获取订单列表" → 搜索 order/list

优先使用此工具进行语义搜索，再用 get_api_detail 获取详情`,
        inputSchema: {
          query: z.string().describe('自然语言描述的功能需求或业务场景'),
        },
      },
      async ({ query }) => {
        await this.ensureIndexLoaded();
        return this.handleSmartSearch({ query });
      }
    );

    // URL 模式搜索工具
    this.server.registerTool(
      'search_api',
      {
        title: '搜索接口',
        description: `根据 URL 模式搜索接口，这是查找接口的首选工具。

使用场景：
- 当用户提到任何 API 路径或 URL 时，自动调用此工具查询
- 当用户询问某个功能的接口时，根据关键词搜索
- 当需要了解某个模块有哪些接口时

支持的匹配模式：
- 精确匹配：/api/users
- 通配符：/api/users/* 匹配所有子路径
- 模糊搜索：users、influencer 等关键词
- 路径片段：daren/influencer 匹配包含该片段的所有接口`,
        inputSchema: {
          pattern: z.string().describe('URL 匹配模式，可以是完整路径、通配符模式或关键词'),
        },
      },
      async ({ pattern }) => {
        await this.ensureIndexLoaded();
        return this.handleSearchApi({ pattern });
      }
    );

    // 获取接口详情工具
    this.server.registerTool(
      'get_api_detail',
      {
        title: '获取接口详情',
        description: `获取单个接口的完整文档。

使用指引：
- 已经知道接口路径时，直接传 path 获取详情
- 先用 search_api 查到候选，再用本工具精确查看参数/请求体/响应/示例
- method 可选，未提供时返回该 path 下所有方法（如同时存在 GET/POST）`,
        inputSchema: {
          path: z.string().describe('接口路径，如 /api/users/{id}'),
          method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).optional().describe('HTTP 方法，可选，不指定则返回所有方法'),
        },
      },
      async ({ path, method }) => {
        await this.ensureIndexLoaded();
        return this.handleGetApiDetail({ path, method: method as HttpMethod | undefined });
      }
    );

    // 按标签列出接口工具
    this.server.registerTool(
      'list_api_by_tag',
      {
        title: '按标签列出接口',
        description: '按标签筛选接口列表',
        inputSchema: {
          tag: z.string().describe('要筛选的标签名称'),
        },
      },
      async ({ tag }) => {
        await this.ensureIndexLoaded();
        return this.handleListApiByTag({ tag });
      }
    );

    // 按文件夹列出接口工具
    this.server.registerTool(
      'list_api_by_folder',
      {
        title: '按文件夹列出接口',
        description: '按 Apifox 文件夹路径筛选接口列表，支持精确和模糊匹配',
        inputSchema: {
          folder: z.string().describe('文件夹路径或关键词，如 "用户管理" 或 "用户管理/登录注册"'),
        },
      },
      async ({ folder }) => {
        await this.ensureIndexLoaded();
        return this.handleListApiByFolder({ folder });
      }
    );

    // 列出所有文件夹工具
    this.server.registerTool(
      'list_api_folders',
      {
        title: '列出所有文件夹',
        description: '列出所有 Apifox 接口文件夹目录结构',
        inputSchema: {},
      },
      async () => {
        await this.ensureIndexLoaded();
        return this.handleListApiFolders();
      }
    );

    // 批量获取接口工具
    this.server.registerTool(
      'batch_get_apis',
      {
        title: '批量获取接口',
        description: '批量获取多个接口的详细信息',
        inputSchema: {
          paths: z.array(z.string()).describe('接口路径数组'),
        },
      },
      async ({ paths }) => {
        await this.ensureIndexLoaded();
        return this.handleBatchGetApis({ paths });
      }
    );

    // 列出所有接口工具
    this.server.registerTool(
      'list_all_endpoints',
      {
        title: '列出所有接口',
        description: '列出所有接口的路径和方法（仅返回摘要信息）',
        inputSchema: {},
      },
      async () => {
        await this.ensureIndexLoaded();
        return this.handleListAllEndpoints();
      }
    );

    // 刷新缓存工具
    this.server.registerTool(
      'refresh_cache',
      {
        title: '刷新缓存',
        description: '刷新接口缓存，从 Apifox 重新获取最新数据',
        inputSchema: {
          force: z.boolean().optional().default(false).describe('强制刷新，忽略冷却时间'),
        },
      },
      async ({ force }) => {
        return this.handleRefreshCache({ force });
      }
    );
  }

  private async ensureIndexLoaded(): Promise<void> {
    // 检查是否有缓存
    const cachedData = await this.cacheManager.getData();
    if (cachedData) {
      // 检查是否过期
      const isExpired = await this.cacheManager.isExpired();
      if (!isExpired) {
        if (this.indexManager.getAll().length === 0) {
          this.indexManager.buildIndex(cachedData);
        }
        return;
      }
    }

    // 需要刷新
    await this.refreshData();
  }

  private async refreshData(): Promise<void> {
    const moduleIds = this.config.moduleIds;
    const branchId = this.config.branchId;
    const isUrlMode = this.config.dataSource === 'url';

    logger.info('Refreshing data...', {
      dataSource: this.config.dataSource,
      moduleIds: isUrlMode ? undefined : moduleIds,
      branchId: isUrlMode ? undefined : branchId,
    });

    // URL 模式：直接获取数据，忽略 moduleIds
    if (isUrlMode) {
      const data = await this.fetcher.fetch();
      await this.cacheManager.saveModuleData(data, undefined);
    } else {
      // Apifox 模式：支持多模块
      if (moduleIds && moduleIds.length > 0) {
        for (const moduleId of moduleIds) {
          const data = await this.fetcher.fetch({
            branchId,
            moduleId,
          });
          await this.cacheManager.saveModuleData(data, moduleId);
        }
      } else {
        const data = await this.fetcher.fetch({ branchId });
        await this.cacheManager.saveModuleData(data, undefined);
      }
    }

    // 从所有缓存加载合并数据并构建索引
    const mergedData = await this.cacheManager.getData();
    if (mergedData) {
      this.indexManager.buildIndex(mergedData);
    }
  }

  private async handleSmartSearch(args: { query: string }) {
    let results = this.indexManager.smartSearch(args.query);

    // 如果未找到结果且可以进行 miss 刷新，自动刷新后重试
    if (results.length === 0 && this.cacheManager.canMissRefresh()) {
      logger.info('Smart search miss, triggering auto refresh...');
      this.cacheManager.markMissRefresh();
      await this.refreshData();
      results = this.indexManager.smartSearch(args.query);
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              message: '未找到匹配的接口',
              query: args.query,
              suggestion: '请尝试使用其他关键词或使用 search_api 进行路径搜索',
            }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            query: args.query,
            count: results.length,
            endpoints: results.map(e => ({
              path: e.path,
              method: e.method,
              name: e.name,
              score: e.score,
              matchReason: e.matchReason,
            })),
          }),
        },
      ],
    };
  }

  private async handleSearchApi(args: { pattern: string }) {
    let results = this.indexManager.search(args.pattern);

    // 如果未找到结果且可以进行 miss 刷新，自动刷新后重试
    if (results.length === 0 && this.cacheManager.canMissRefresh()) {
      logger.info('Search API miss, triggering auto refresh...');
      this.cacheManager.markMissRefresh();
      await this.refreshData();
      results = this.indexManager.search(args.pattern);
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: results.length,
            endpoints: results,
          }),
        },
      ],
    };
  }

  private async handleGetApiDetail(args: { path: string; method?: HttpMethod }) {
    let results = this.indexManager.getDetail(args.path, args.method);

    // 如果未找到结果且可以进行 miss 刷新，自动刷新后重试
    if (results.length === 0 && this.cacheManager.canMissRefresh()) {
      logger.info('Get API detail miss, triggering auto refresh...');
      this.cacheManager.markMissRefresh();
      await this.refreshData();
      results = this.indexManager.getDetail(args.path, args.method);
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No endpoint found for path: ${args.path}`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(results),
        },
      ],
    };
  }

  private handleListApiByTag(args: { tag: string }) {
    const results = this.indexManager.getByTag(args.tag);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            tag: args.tag,
            count: results.length,
            endpoints: results,
          }),
        },
      ],
    };
  }

  private handleBatchGetApis(args: { paths: string[] }) {
    const results = this.indexManager.getBatchDetails(args.paths);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: results.length,
            endpoints: results,
          }),
        },
      ],
    };
  }

  private handleListAllEndpoints() {
    const all = this.indexManager.getAll();
    const tags = this.indexManager.getAllTags();
    const folders = this.indexManager.getAllFolders();
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            totalCount: all.length,
            tags,
            folders,
            endpoints: all.map(e => ({
              path: e.path,
              method: e.method,
              name: e.name,
              tags: e.tags,
              folder: e.folder,
            })),
          }),
        },
      ],
    };
  }

  private handleListApiByFolder(args: { folder: string }) {
    const results = this.indexManager.getByFolder(args.folder);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            folder: args.folder,
            count: results.length,
            endpoints: results,
          }),
        },
      ],
    };
  }

  private handleListApiFolders() {
    const folders = this.indexManager.getAllFolders();
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: folders.length,
            folders,
          }),
        },
      ],
    };
  }

  private async handleRefreshCache(args: { force?: boolean }) {
    const meta = await this.cacheManager.getMeta();
    if (!args.force && !this.cacheManager.canMissRefresh()) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              status: 'skipped',
              reason: 'Refresh cooldown active',
              lastRefresh: meta?.lastRefresh,
            }),
          },
        ],
      };
    }

    this.cacheManager.markMissRefresh();
    await this.refreshData();
    const newMeta = await this.cacheManager.getMeta();

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            status: 'success',
            apiCount: newMeta?.apiCount,
            lastRefresh: newMeta?.lastRefresh,
          }),
        },
      ],
    };
  }

  async start(): Promise<void> {
    // 设置定时刷新
    if (this.config.refresh.interval > 0) {
      const intervalMs = this.config.refresh.interval * 60 * 1000;
      this.refreshTimer = setInterval(() => {
        this.refreshData().catch(err => {
          logger.error('Scheduled refresh failed', err);
        });
      }, intervalMs);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Apifox Filter MCP Server started');
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    await this.server.close();
  }
}
