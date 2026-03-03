import type {
  OpenApiSpec,
  ApiEndpointSummary,
  ApiEndpointDetail,
  HttpMethod,
  Parameter,
  JsonSchema,
} from '../types';
import { urlMatcher, logger } from '../utils';

// 解析后的 Schema 类型，包含原始引用信息
interface ResolvedSchema extends JsonSchema {
  _resolvedFrom?: string;  // 记录原始引用路径
}

interface EndpointIndex {
  byPath: Map<string, ApiEndpointSummary[]>;
  byTag: Map<string, ApiEndpointSummary[]>;
  byMethod: Map<HttpMethod, ApiEndpointSummary[]>;
  byFolder: Map<string, ApiEndpointSummary[]>;
  all: ApiEndpointSummary[];
}

export class IndexManager {
  private index: EndpointIndex = {
    byPath: new Map(),
    byTag: new Map(),
    byMethod: new Map(),
    byFolder: new Map(),
    all: [],
  };
  private openApiSpec: OpenApiSpec | null = null;

  /**
   * 从 OpenAPI 规范构建索引
   */
  buildIndex(spec: OpenApiSpec): void {
    this.openApiSpec = spec;
    this.index = {
      byPath: new Map(),
      byTag: new Map(),
      byMethod: new Map(),
      byFolder: new Map(),
      all: [],
    };

    const paths = spec.paths || {};
    let idCounter = 0;

    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method.toLowerCase())) {
          const httpMethod = method.toUpperCase() as HttpMethod;
          const folder = operation['x-apifox-folder'] as string | undefined;
          const endpoint: ApiEndpointSummary = {
            id: `endpoint_${++idCounter}`,
            path,
            method: httpMethod,
            name: operation.summary || operation.operationId || `${httpMethod} ${path}`,
            tags: operation.tags || [],
            description: operation.description,
            folder,
          };

          // 添加到全量列表
          this.index.all.push(endpoint);

          // 按路径索引
          const normalizedPath = urlMatcher.normalizePath(path);
          if (!this.index.byPath.has(normalizedPath)) {
            this.index.byPath.set(normalizedPath, []);
          }
          this.index.byPath.get(normalizedPath)!.push(endpoint);

          // 按标签索引
          for (const tag of endpoint.tags) {
            if (!this.index.byTag.has(tag)) {
              this.index.byTag.set(tag, []);
            }
            this.index.byTag.get(tag)!.push(endpoint);
          }

          // 按方法索引
          if (!this.index.byMethod.has(httpMethod)) {
            this.index.byMethod.set(httpMethod, []);
          }
          this.index.byMethod.get(httpMethod)!.push(endpoint);

          // 按文件夹索引
          if (folder) {
            if (!this.index.byFolder.has(folder)) {
              this.index.byFolder.set(folder, []);
            }
            this.index.byFolder.get(folder)!.push(endpoint);
          }
        }
      }
    }

    logger.info(`Index built: ${this.index.all.length} endpoints`);
  }

  /**
   * 搜索接口
   */
  search(pattern: string): ApiEndpointSummary[] {
    const allPaths = this.index.all.map(e => e.path);
    const matchedPaths = urlMatcher.search(pattern, allPaths);
    const matchedPathSet = new Set(matchedPaths);
    return this.index.all.filter(e => matchedPathSet.has(e.path));
  }

  /**
   * 按标签获取接口列表
   */
  getByTag(tag: string): ApiEndpointSummary[] {
    return this.index.byTag.get(tag) || [];
  }

  /**
   * 获取所有标签
   */
  getAllTags(): string[] {
    return Array.from(this.index.byTag.keys());
  }

  /**
   * 按文件夹获取接口列表
   */
  getByFolder(folder: string): ApiEndpointSummary[] {
    // 精确匹配
    const exact = this.index.byFolder.get(folder);
    if (exact && exact.length > 0) return exact;

    // 模糊匹配：查找包含关键词的文件夹
    const folderLower = folder.toLowerCase();
    const results: ApiEndpointSummary[] = [];
    for (const [key, endpoints] of this.index.byFolder) {
      if (key.toLowerCase().includes(folderLower)) {
        results.push(...endpoints);
      }
    }
    return results;
  }

  /**
   * 获取所有文件夹
   */
  getAllFolders(): string[] {
    return Array.from(this.index.byFolder.keys());
  }

  /**
   * 获取所有路径
   */
  getAllPaths(): string[] {
    return Array.from(new Set(this.index.all.map(e => e.path)));
  }

  /**
   * 获取所有接口摘要
   */
  getAll(): ApiEndpointSummary[] {
    return this.index.all;
  }

  /**
   * 获取接口详情
   */
  getDetail(path: string, method?: HttpMethod): ApiEndpointDetail[] {
    if (!this.openApiSpec) return [];

    const normalizedPath = urlMatcher.normalizePath(path);
    const pathData = this.openApiSpec.paths[path] ||
      this.openApiSpec.paths[normalizedPath];

    if (!pathData) {
      // 尝试模糊匹配
      const allPaths = Object.keys(this.openApiSpec.paths);
      const matchedPath = allPaths.find(p =>
        urlMatcher.match(normalizedPath, p) || urlMatcher.match(p, normalizedPath)
      );
      if (!matchedPath) return [];
      return this.getDetail(matchedPath, method);
    }

    const results: ApiEndpointDetail[] = [];
    const methods = method
      ? { [method.toLowerCase()]: pathData[method.toLowerCase()] }
      : pathData;

    for (const [m, operation] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(m)) continue;
      if (!operation) continue;

      const httpMethod = m.toUpperCase() as HttpMethod;

      // 解析参数
      const parameters: ApiEndpointDetail['parameters'] = {
        path: [],
        query: [],
        header: [],
        cookie: [],
      };

      for (const param of operation.parameters || []) {
        const rawSchema = param.schema as JsonSchema;
        const p: Parameter = {
          name: param.name,
          in: param.in as 'path' | 'query' | 'header' | 'cookie',
          required: param.required,
          description: param.description,
          schema: rawSchema ? this.resolveSchema(rawSchema) : undefined,
          example: param.example,
        };
        if (param.in === 'path') parameters.path!.push(p);
        else if (param.in === 'query') parameters.query!.push(p);
        else if (param.in === 'header') parameters.header!.push(p);
        else if (param.in === 'cookie') parameters.cookie!.push(p);
      }

      // 解析请求体
      let requestBody: ApiEndpointDetail['requestBody'];
      if (operation.requestBody?.content) {
        const contentEntries = Object.entries(operation.requestBody.content);
        const [contentType, content] = contentEntries[0];
        const rawSchema = (content?.schema as JsonSchema) || {};
        const contents: NonNullable<ApiEndpointDetail['requestBody']>['contents'] = {};

        for (const [type, payload] of contentEntries) {
          const schema = payload?.schema as JsonSchema | undefined;
          contents[type] = {
            schema: schema ? this.resolveSchema(schema) : undefined,
            example: payload?.example,
          };
        }
        requestBody = {
          contentType,
          schema: this.resolveSchema(rawSchema) || rawSchema,
          example: content?.example,
          contents,
        };
      }

      // 解析响应
      const responses: ApiEndpointDetail['responses'] = {};
      for (const [code, response] of Object.entries(operation.responses || {})) {
        const contentEntries = response.content ? Object.entries(response.content) : [];
        const [contentType, content] = contentEntries[0] || [];
        const rawSchema = content?.schema as JsonSchema | undefined;
        const contents: ApiEndpointDetail['responses'][string]['contents'] = {};

        for (const [type, payload] of contentEntries) {
          const schema = payload?.schema as JsonSchema | undefined;
          contents[type] = {
            schema: schema ? this.resolveSchema(schema) : undefined,
            example: payload?.example,
          };
        }
        responses[code] = {
          description: response.description || '',
          schema: rawSchema ? this.resolveSchema(rawSchema) : undefined,
          example: content?.example,
          contentType: contentType as string | undefined,
          contents: contentEntries.length > 0 ? contents : undefined,
        };
      }

      results.push({
        id: `detail_${path}_${m}`,
        path,
        method: httpMethod,
        name: operation.summary || operation.operationId || `${httpMethod} ${path}`,
        tags: operation.tags || [],
        description: operation.description,
        folder: operation['x-apifox-folder'] as string | undefined,
        parameters,
        requestBody,
        responses,
      });
    }

    return results;
  }

  /**
   * 批量获取接口详情
   */
  getBatchDetails(paths: string[]): ApiEndpointDetail[] {
    return paths.flatMap(path => this.getDetail(path));
  }

  /**
   * 智能搜索 - 根据自然语言描述搜索接口
   */
  smartSearch(query: string): Array<ApiEndpointSummary & { score: number; matchReason: string }> {
    const keywords = this.extractKeywords(query);
    logger.info(`Smart search query: "${query}", extracted keywords: ${keywords.join(', ')}`);

    const scored = this.index.all.map(endpoint => {
      const { score, reasons } = this.calculateRelevanceScore(endpoint, keywords, query);
      return {
        ...endpoint,
        score,
        matchReason: reasons.join('; '),
      };
    });

    // 过滤掉完全不匹配的，按分数排序
    return scored
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20); // 最多返回 20 条
  }

  /**
   * 从查询中提取关键词
   */
  private extractKeywords(query: string): string[] {
    // 中英文关键词映射表
    const keywordMap: Record<string, string[]> = {
      // 用户相关
      '用户': ['user', 'member', 'account'],
      '登录': ['login', 'auth', 'sign-in', 'signin'],
      '注册': ['register', 'signup', 'sign-up'],
      '密码': ['password', 'pwd'],
      '权限': ['permission', 'auth', 'role'],

      // 达人相关
      '达人': ['daren', 'influencer', 'kol'],
      '团长': ['leader', 'group-leader'],
      '网红': ['influencer', 'kol'],

      // 订单相关
      '订单': ['order'],
      '支付': ['pay', 'payment'],
      '退款': ['refund'],

      // 商品相关
      '商品': ['product', 'goods', 'item'],
      '库存': ['stock', 'inventory'],
      '价格': ['price'],

      // 通用操作
      '列表': ['list', 'page'],
      '详情': ['detail', 'info', 'get'],
      '添加': ['add', 'create', 'new'],
      '修改': ['update', 'edit', 'modify'],
      '删除': ['delete', 'remove'],
      '查询': ['query', 'search', 'find', 'get'],
      '导出': ['export'],
      '导入': ['import'],
      '上传': ['upload'],
      '下载': ['download'],
      '平台': ['platform'],
      '枚举': ['enum', 'list'],
      '配置': ['config', 'setting'],
      '统计': ['stat', 'statistics', 'count'],
    };

    const keywords: Set<string> = new Set();
    const lowerQuery = query.toLowerCase();

    // 1. 映射中文关键词
    for (const [cn, enList] of Object.entries(keywordMap)) {
      if (query.includes(cn)) {
        enList.forEach(en => keywords.add(en));
        keywords.add(cn);
      }
    }

    // 2. 提取英文单词
    const englishWords = lowerQuery.match(/[a-z][a-z0-9-_]*/g) || [];
    englishWords.forEach(word => {
      if (word.length > 1) keywords.add(word);
    });

    // 3. 提取中文词组（简单分词）
    const chineseChars = query.match(/[\u4e00-\u9fa5]+/g) || [];
    chineseChars.forEach(chars => {
      if (chars.length >= 2) keywords.add(chars);
    });

    return Array.from(keywords);
  }

  /**
   * 计算接口与关键词的相关度分数
   */
  private calculateRelevanceScore(
    endpoint: ApiEndpointSummary,
    keywords: string[],
    originalQuery: string
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    const pathLower = endpoint.path.toLowerCase();
    const nameLower = (endpoint.name || '').toLowerCase();
    const descLower = (endpoint.description || '').toLowerCase();
    const tagsLower = endpoint.tags.map(t => t.toLowerCase());
    const folderLower = (endpoint.folder || '').toLowerCase();

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();

      // 路径匹配（权重最高）
      if (pathLower.includes(keywordLower)) {
        score += 10;
        reasons.push(`路径匹配: ${keyword}`);
      }

      // 接口名称匹配
      if (nameLower.includes(keywordLower)) {
        score += 8;
        reasons.push(`名称匹配: ${keyword}`);
      }

      // 文件夹匹配
      if (folderLower && folderLower.includes(keywordLower)) {
        score += 7;
        reasons.push(`文件夹匹配: ${keyword}`);
      }

      // 标签匹配
      if (tagsLower.some(tag => tag.includes(keywordLower))) {
        score += 5;
        reasons.push(`标签匹配: ${keyword}`);
      }

      // 描述匹配
      if (descLower.includes(keywordLower)) {
        score += 3;
        reasons.push(`描述匹配: ${keyword}`);
      }
    }

    // 额外：原始查询直接匹配
    if (pathLower.includes(originalQuery.toLowerCase().replace(/\s+/g, ''))) {
      score += 15;
      reasons.push('路径直接匹配');
    }

    return { score, reasons };
  }

  /**
   * 解析 $ref 引用，展开为完整的 schema 定义
   * @param schema 可能包含 $ref 的 schema
   * @param visited 已访问的引用路径（防止循环引用）
   * @param maxDepth 最大递归深度
   */
  resolveSchema(schema: JsonSchema | undefined, visited: Set<string> = new Set(), maxDepth = 10): ResolvedSchema | undefined {
    if (!schema || maxDepth <= 0) return schema;
    if (!this.openApiSpec?.components?.schemas) return schema;

    // 处理 $ref 引用
    if (schema.$ref) {
      const refPath = schema.$ref;

      // 防止循环引用
      if (visited.has(refPath)) {
        return { _resolvedFrom: refPath, description: `[循环引用: ${refPath}]` };
      }
      visited.add(refPath);

      // 解析引用路径，如 #/components/schemas/ResourceTagBatchSaveReqVO
      const match = refPath.match(/^#\/components\/schemas\/(.+)$/);
      if (match) {
        const schemaName = match[1];
        const referencedSchema = this.openApiSpec.components.schemas[schemaName];
        if (referencedSchema) {
          // 递归解析引用的 schema
          const resolved = this.resolveSchema(referencedSchema, visited, maxDepth - 1);
          return {
            ...resolved,
            _resolvedFrom: refPath,
          };
        }
      }
      // 引用无法解析，返回原始引用信息
      return { $ref: refPath, _resolvedFrom: refPath };
    }

    // 递归处理 properties
    const resolved: ResolvedSchema = { ...schema };
    if (schema.properties) {
      resolved.properties = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        resolved.properties[key] = this.resolveSchema(propSchema, new Set(visited), maxDepth - 1) || propSchema;
      }
    }

    // 递归处理 items (数组类型)
    if (schema.items) {
      resolved.items = this.resolveSchema(schema.items, new Set(visited), maxDepth - 1);
    }

    // 递归处理 allOf/oneOf/anyOf
    if (schema.allOf) {
      resolved.allOf = schema.allOf.map(s => this.resolveSchema(s, new Set(visited), maxDepth - 1) || s);
    }
    if (schema.oneOf) {
      resolved.oneOf = schema.oneOf.map(s => this.resolveSchema(s, new Set(visited), maxDepth - 1) || s);
    }
    if (schema.anyOf) {
      resolved.anyOf = schema.anyOf.map(s => this.resolveSchema(s, new Set(visited), maxDepth - 1) || s);
    }

    // 处理 additionalProperties
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      resolved.additionalProperties = this.resolveSchema(schema.additionalProperties as JsonSchema, new Set(visited), maxDepth - 1);
    }

    return resolved;
  }
}
