/**
 * URL 匹配工具
 * 支持：精确匹配、路径参数、单级通配符、多级通配符、模糊搜索
 */
export class UrlMatcher {
  /**
   * 精确匹配
   */
  exactMatch(pattern: string, path: string): boolean {
    return this.normalizePath(pattern) === this.normalizePath(path);
  }

  /**
   * 通配符匹配
   * 支持：* (单级通配符) 和 ** (多级通配符)
   */
  wildcardMatch(pattern: string, path: string): boolean {
    const normalizedPattern = this.normalizePath(pattern);
    const normalizedPath = this.normalizePath(path);

    // 将模式转换为正则表达式
    const regexPattern = normalizedPattern
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '[^/]+')
      .replace(/{{DOUBLE_STAR}}/g, '.*')
      .replace(/\{[^}]+\}/g, '[^/]+'); // 路径参数也视为单级匹配

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedPath);
  }

  /**
   * 路径参数归一化
   * 将 /api/users/{id} 和 /api/users/:id 统一为 /api/users/{id}
   */
  normalizePath(path: string): string {
    return path
      .replace(/\/+/g, '/') // 移除重复斜杠
      .replace(/\/$/, '') // 移除末尾斜杠
      .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}'); // :param -> {param}
  }

  /**
   * 模糊搜索
   * 返回所有包含关键词的路径
   */
  fuzzySearch(keyword: string, paths: string[]): string[] {
    const lowerKeyword = keyword.toLowerCase();
    return paths.filter(path => 
      path.toLowerCase().includes(lowerKeyword)
    );
  }

  /**
   * 综合匹配
   * 根据模式类型自动选择匹配方式
   */
  match(pattern: string, path: string): boolean {
    // 包含通配符
    if (pattern.includes('*')) {
      return this.wildcardMatch(pattern, path);
    }

    // 精确匹配（可能包含路径参数）
    return this.pathParamMatch(pattern, path);
  }

  /**
   * 路径参数匹配
   * /api/users/{id} 匹配 /api/users/{userId}
   */
  private pathParamMatch(pattern: string, path: string): boolean {
    const normalizedPattern = this.normalizePath(pattern);
    const normalizedPath = this.normalizePath(path);

    // 将路径参数替换为通用匹配
    const regexPattern = normalizedPattern
      .replace(/\{[^}]+\}/g, '{[^}]+}');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedPath);
  }

  /**
   * 搜索匹配
   * 综合搜索：支持精确匹配、通配符、模糊搜索
   */
  search(pattern: string, paths: string[]): string[] {
    // 如果是简单关键词（不包含 / 和 *），使用模糊搜索
    if (!pattern.includes('/') && !pattern.includes('*')) {
      return this.fuzzySearch(pattern, paths);
    }

    // 否则使用模式匹配
    return paths.filter(path => this.match(pattern, path));
  }
}

// 导出单例
export const urlMatcher = new UrlMatcher();
