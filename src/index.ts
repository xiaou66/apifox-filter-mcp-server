import { ApifoxFilterServer } from './server.js';
import type { ServerConfig, DataSourceType } from './types';
import { logger } from './utils';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// 解析命令行参数
function parseArgs(): {
  projectId?: string;
  moduleIds?: number[];
  branchId?: number;
  openapiUrl?: string;
} {
  const args: {
    projectId?: string;
    moduleIds?: number[];
    branchId?: number;
    openapiUrl?: string;
  } = {};

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--project-id=')) {
      args.projectId = arg.split('=')[1];
    } else if (arg.startsWith('--module-ids=')) {
      args.moduleIds = arg.split('=')[1].split(',').map(Number).filter(n => !isNaN(n));
    } else if (arg.startsWith('--branch-id=')) {
      const value = parseInt(arg.split('=')[1], 10);
      args.branchId = isNaN(value) ? undefined : value;
    } else if (arg.startsWith('--openapi-url=')) {
      args.openapiUrl = arg.split('=')[1];
    }
  }
  return args;
}

// 主函数
async function main() {
  const args = parseArgs();

  // 从环境变量和命令行参数获取配置
  const accessToken = process.env.APIFOX_ACCESS_TOKEN;
  const projectId = args.projectId || process.env.APIFOX_PROJECT_ID;
  const openapiUrl = args.openapiUrl || process.env.OPENAPI_URL;
  const projectDir = process.env.PROJECT_DIR || process.cwd();

  // 判断数据源模式
  let dataSource: DataSourceType;

  if (openapiUrl) {
    // URL 模式优先
    dataSource = 'url';
    logger.info('Using URL mode', { url: openapiUrl });
  } else if (accessToken && projectId) {
    // Apifox 模式
    dataSource = 'apifox';
    logger.info('Using Apifox mode', { projectId });
  } else {
    logger.error('Configuration error: Either provide --openapi-url (or OPENAPI_URL) for URL mode, or APIFOX_ACCESS_TOKEN + project ID for Apifox mode');
    process.exit(1);
  }

  // 缓存目录：优先使用 CACHE_DIR 环境变量
  let cacheDir: string;
  if (process.env.CACHE_DIR) {
    cacheDir = resolve(process.env.CACHE_DIR);
  } else {
    // 校验 projectDir 有效性
    const resolvedProjectDir = resolve(projectDir);
    if (!resolvedProjectDir || resolvedProjectDir === '/' || !existsSync(resolvedProjectDir)) {
      logger.error(
        `Cannot determine a valid project directory (got: "${projectDir}", resolved: "${resolvedProjectDir}"). ` +
        `Please set the CACHE_DIR environment variable to specify the cache location.`
      );
      process.exit(1);
    }
    cacheDir = resolve(resolvedProjectDir, '.apifox-cache');
  }

  // 启动诊断日志（输出到 stderr，不影响 MCP 协议）
  logger.debug('Environment diagnostics', {
    cwd: process.cwd(),
    projectDir,
    cacheDir,
    nodeVersion: process.version,
    platform: process.platform,
    argv: process.argv.slice(2),
  });

  // 解析 moduleIds 和 branchId（仅 Apifox 模式适用）
  const moduleIds = args.moduleIds ||
    (process.env.APIFOX_MODULE_IDS?.split(',').map(Number).filter(n => !isNaN(n)));
  const branchIdFromEnv = process.env.APIFOX_BRANCH_ID ? parseInt(process.env.APIFOX_BRANCH_ID, 10) : undefined;
  const branchId = args.branchId ?? (branchIdFromEnv && !isNaN(branchIdFromEnv) ? branchIdFromEnv : undefined);

  const config: ServerConfig = {
    dataSource,
    cacheDir,
    refresh: {
      interval: parseInt(process.env.REFRESH_INTERVAL || '30', 10),
      refreshOnMiss: process.env.REFRESH_ON_MISS !== 'false',
      missRefreshCooldown: parseInt(process.env.MISS_REFRESH_COOLDOWN || '60', 10),
    },
    // Apifox 模式配置
    projectId,
    accessToken,
    moduleIds: moduleIds?.length ? moduleIds : undefined,
    branchId,
    // URL 模式配置
    openapiUrl,
  };

  const server = new ApifoxFilterServer(config);

  // 优雅退出
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    await server.stop();
    process.exit(0);
  });

  await server.start();
}

main().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});
