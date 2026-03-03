# Apifox Filter MCP Server

一个 MCP (Model Context Protocol) Server，用于从 Apifox 精准过滤和获取 API 文档，解决官方 MCP Server 加载全量接口导致的上下文膨胀问题。

**支持两种数据源模式：**
- **Apifox 模式**：通过 Apifox API Token 获取项目接口文档
- **URL 模式**：直接从任意 OpenAPI URL 获取接口文档（无需 Apifox 认证）

## 功能特点

- 🎯 **精准过滤** - 根据 URL 模式搜索接口，支持通配符和模糊匹配
- 🧠 **智能搜索** - 支持自然语言查询，自动提取关键词并按相关度排序
- 📁 **文件夹检索** - 支持按 Apifox 文件夹目录浏览和筛选接口
- 📦 **按需获取** - 只获取需要的接口详情，最小化上下文占用
- 🏷️ **标签筛选** - 支持按标签分类获取接口列表
- ⚡ **智能缓存** - 本地 JSON 缓存，支持定时刷新和 Miss 时自动刷新
- 🔄 **批量操作** - 支持批量获取多个接口详情

## 配置

### 配置模式

本工具支持两种互斥的配置模式：

| 模式 | 必需配置 | 可选配置 |
|------|----------|----------|
| **Apifox 模式** | `APIFOX_ACCESS_TOKEN` + `projectId` | `moduleIds`, `branchId` |
| **URL 模式** | `openapiUrl` | 无 |

> **注意**：如果同时提供了 `openapiUrl` 和 Apifox 配置，URL 模式优先。

---

### Apifox 模式配置

#### 最小配置
```json 
{
  "mcpServers": {
    "apifox-filter": {
      "command": "npx",
      "args": [
        "-y",
        "apifox-filter-mcp-server@latest",
        "--project-id=<your-project-id>"
      ],
      "env": {
        "APIFOX_ACCESS_TOKEN": "<your-access-token>"
      }
    }
  }
}
```

```json
{
  "mcpServers": {
    "apifox-filter": {
      "command": "npx",
      "args": [
        "-y",
        "apifox-filter-mcp-server@latest",
        "--project-id=<your-project-id>",
        "--branch-id=<branch-id>",
        "--module-ids=<module-id-1>,<module-id-2>"
      ],
      "env": {
        "APIFOX_ACCESS_TOKEN": "<your-access-token>"
      }
    }
  }
}
```

### URL 模式配置

适用于从 Apifox 本地服务或任意 OpenAPI URL 获取接口文档（解决 Apifox 只有只读权限用户和非 Apifox 用户使用）

**支持的协议：**
- `http://` / `https://` - 通过 HTTP 请求获取
- `file://` - 直接读取本地文件

#### HTTP 示例
```json
{
  "mcpServers": {
    "apifox-filter": {
      "command": "npx",
      "args": [
        "-y",
        "apifox-filter-mcp-server@latest",
        "--openapi-url=http://127.0.0.1:4523/export/openapi/11?version=3.0"
      ]
    }
  }
}
```

#### 本地文件示例
```json
{
  "mcpServers": {
    "apifox-filter": {
      "command": "npx",
      "args": [
        "-y",
        "apifox-filter-mcp-server@latest",
        "--openapi-url=file:///Users/xiaou/project/openapi.json"
      ]
    }
  }
}
```

#### Windows 本地文件
```json
{
  "mcpServers": {
    "apifox-filter": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "apifox-filter-mcp-server@latest",
        "--openapi-url=file:///D:/project/openapi.json"
      ]
    }
  }
}
```

或使用环境变量：

```json
{
  "mcpServers": {
    "apifox-filter": {
      "command": "npx",
      "args": ["-y", "apifox-filter-mcp-server@latest"],
      "env": {
        "OPENAPI_URL": "http://127.0.0.1:4523/export/openapi/11?version=3.0"
      }
    }
  }
}
```

---

### windows

#### 最小配置

```json
{
  "mcpServers": {
    "apifox-filter": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "apifox-filter-mcp-server@latest",
        "--project-id=<your-project-id>",
      ],
      "env": {
        "APIFOX_ACCESS_TOKEN": "<your-access-token>"
      }
    }
  }
}
```

```json
{
  "mcpServers": {
    "apifox-filter": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "apifox-filter-mcp-server@latest",
        "--project-id=<your-project-id>",
        "--branch-id=<branch-id>",
        "--module-ids=<module-id-1>,<module-id-2>"
      ],
      "env": {
        "APIFOX_ACCESS_TOKEN": "<your-access-token>"
      }
    }
  }
}
```

> **缓存位置说明：**
> 设置 `PROJECT_DIR` 后，缓存文件会自动存放在 `${PROJECT_DIR}/.apifox-cache/` 目录下。
> 建议将 `.apifox-cache` 添加到项目的 `.gitignore` 中。


### Antigravity 配置

> CACHE_DIR 必须配置，否则会报错在 Antigravity 环境中获取不到项目目录

```json
{
  "mcpServers": {
    "apifox-filter": {
      "command": "npx",
      "args": [
        "-y",
        "apifox-filter-mcp-server@latest",
        "--project-id=<your-project-id>",
      ],
      "env": {
        "APIFOX_ACCESS_TOKEN": "<your-access-token>",
        "CACHE_DIR": "项目目录"
      }
    }
  }
}
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAPI_URL` | OpenAPI 文档 URL（URL 模式） | - |
| `APIFOX_ACCESS_TOKEN` | Apifox 访问令牌（Apifox 模式必填） | - |
| `APIFOX_PROJECT_ID` | 项目 ID（也可通过命令行参数指定） | - |
| `APIFOX_MODULE_IDS` | 模块 ID 列表（逗号分隔）| - |
| `APIFOX_BRANCH_ID` | 分支 ID | - |
| `APIFOX_API_BASE` | Apifox API 基础地址（私有部署时使用） | `https://api.apifox.com` |
| `PROJECT_DIR` | 用户项目目录（缓存将放在此目录下） | 当前工作目录 |
| `CACHE_DIR` | 缓存目录（覆盖默认位置） | `${PROJECT_DIR}/.apifox-cache` |
| `REFRESH_INTERVAL` | 定时刷新间隔（分钟），0 禁用 | 30 |
| `REFRESH_ON_MISS` | 找不到时自动刷新 | true |
| `MISS_REFRESH_COOLDOWN` | 自动刷新冷却（秒） | 60 |

### 命令行参数

| 参数 | 说明 |
|------|------|
| `--openapi-url=<url>` | OpenAPI 文档 URL（URL 模式） |
| `--project-id=<id>` | Apifox 项目 ID |
| `--module-ids=<id1,id2>` | 模块 ID 列表（逗号分隔） |
| `--branch-id=<id>` | 分支 ID |

### 多模块和分支支持

如果你的 Apifox 项目使用了多模块或分支功能，可以通过以下参数指定：

- `--branch-id=<id>` 或 `APIFOX_BRANCH_ID`: 指定分支 ID，默认导出主分支
- `--module-ids=<id1,id2,...>` 或 `APIFOX_MODULE_IDS`: 指定模块 ID 列表（逗号分隔），默认导出默认模块

> 不同的 moduleIds 和 branchId 组合会缓存到不同的文件，互不影响。

### 获取 Apifox Access Token

1. 登录 [Apifox](https://apifox.com)
2. 进入 账户设置 → API 访问令牌
3. 创建新的访问令牌

## 可用工具

### smart_search_api（推荐）

根据自然语言描述智能搜索接口，AI 的首选搜索工具。

**核心能力：**
- 自动提取中英文关键词并映射到接口路径
- 支持中英文混合查询
- 按相关度评分排序返回结果

**中英文关键词映射示例：**
| 中文 | 映射英文 |
|------|----------|
| 达人 | daren, influencer, kol |
| 列表 | list, page |
| 登录 | login, auth, sign-in |
| 用户 | user, member, account |
| 订单 | order |
| 商品 | product, goods, item |

**评分权重：**
| 匹配类型 | 权重 |
|---------|------|
| 路径直接匹配 | +15 |
| 路径关键词匹配 | +10 |
| 名称匹配 | +8 |
| 文件夹匹配 | +7 |
| 标签匹配 | +5 |
| 描述匹配 | +3 |

### search_api

根据 URL 模式搜索接口。

```
支持的匹配模式：
- 精确匹配: /api/users
- 通配符: /api/users/*
- 多级通配符: /api/**
- 模糊搜索: users
```

### get_api_detail

获取单个接口的完整文档，包括参数、请求体、响应等详细信息。

### list_api_by_tag

按标签筛选接口列表。

### list_api_by_folder

按 Apifox 文件夹路径筛选接口列表，支持精确和模糊匹配（仅 Apifox 模式）。

### list_api_folders

列出所有 Apifox 接口文件夹目录结构（仅 Apifox 模式）。

### batch_get_apis

批量获取多个接口的详细信息。

### list_all_endpoints

列出所有接口的路径、方法、标签和文件夹信息（仅返回摘要）。

### refresh_cache

手动刷新接口缓存，从 Apifox 重新获取最新数据。

## 使用示例

### 智能搜索（自然语言）

```
# 搜索达人相关接口
smart_search_api query="达人管理"

# 搜索平台列表接口
smart_search_api query="获取平台列表"

# 中英文混合查询
smart_search_api query="influencer 详情"
```

**返回示例：**
```json
{
  "query": "达人平台列表",
  "count": 3,
  "endpoints": [
    {
      "path": "/daren/influencer-info/platform-list",
      "method": "GET",
      "name": "获取平台枚举列表",
      "score": 38,
      "matchReason": "路径匹配: daren; 路径匹配: platform; 路径匹配: list"
    }
  ]
}
```

### 搜索用户相关接口

```
search_api pattern="/api/users/*"
```

### 获取特定接口详情

```
get_api_detail path="/api/users/{id}" method="GET"
```

### 按标签获取接口

```
list_api_by_tag tag="用户管理"
```

### 按文件夹获取接口

```
# 查看所有文件夹目录
list_api_folders

# 按文件夹筛选（支持模糊匹配）
list_api_by_folder folder="用户管理"
list_api_by_folder folder="用户管理/登录注册"
```

## 本地测试

### 1. 构建项目

```bash
npm install
npm run build
```

### 2. 配置 MCP

在你的 MCP 配置文件中添加以下配置（根据你使用的工具选择配置文件位置）：

**Claude Code (claude_desktop_config.json):**
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

**本地测试配置：**

```json
{
  "mcpServers": {
    "apifox-filter": {
      "command": "node",
      "args": [
        "D:/code/apifox-filter-mcp-server/dist/index.js",
        "--project-id=<your-project-id>"
      ],
      "env": {
        "APIFOX_ACCESS_TOKEN": "<your-access-token>"
      }
    }
  }
}
```

> 注意：将 `D:/code/apifox-filter-mcp-server` 替换为你的实际项目路径，`<your-project-id>` 和 `<your-access-token>` 替换为真实值。

### 3. 获取 Apifox 配置信息

**获取 Project ID:**
1. 登录 Apifox，打开你的项目
2. 在项目设置或 URL 中可以找到项目 ID（通常是一个数字）

**获取 Access Token:**
1. 登录 [Apifox](https://apifox.com)
2. 点击右上角头像 → 账号设置
3. 选择 API 访问令牌
4. 创建新的访问令牌

### 4. 重启 Claude Code

配置完成后，重启 Claude Code 使配置生效。

## 开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建
npm run build

# 类型检查
npm run typecheck
```

## 技术栈

- TypeScript
- @modelcontextprotocol/sdk - MCP 官方 SDK
- undici - HTTP 客户端
- tsup - 构建工具

## 许可证

MIT
