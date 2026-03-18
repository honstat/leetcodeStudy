# AGENTS.md - 项目上下文指南

## 项目概述

**studyLeetcode** 是一个基于 Next.js 16 的 LeetCode 算法学习辅助工具，通过 AI 自动生成算法题解代码和分析。项目由扣子编程 CLI 创建。

### 核心功能
- 从 LeetCode 中国站获取算法题目列表
- 查看题目详细描述
- AI 自动生成多种语言的算法解决方案（JavaScript、Java、Go、Python、C#）
- 代码复杂度分析和优化建议
- 自定义 AI 模型配置

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16.1.1 (App Router) |
| 前端 | React 19.2.3 |
| UI 组件 | shadcn/ui (Radix UI) |
| 样式 | Tailwind CSS v4 |
| 语言 | TypeScript 5.x |
| 包管理 | pnpm 9+ (强制) |
| AI SDK | coze-coding-dev-sdk |
| 数据库 | PostgreSQL + Drizzle ORM |
| 存储 | AWS S3 SDK |

## 项目结构

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # 根布局（含主题、字体配置）
│   ├── page.tsx                 # 主页面（LeetCode 学习界面）
│   ├── globals.css              # 全局样式 + shadcn 主题变量
│   └── api/                     # API 路由
│       ├── leetcode/            # LeetCode 相关 API
│       │   ├── route.ts         # 题目列表查询（GraphQL 代理）
│       │   ├── question/        # 题目详情
│       │   ├── generate-code/   # AI 代码生成
│       │   └── analyze-code/    # AI 代码分析
│       └── config/              # AI 配置管理
├── components/
│   └── ui/                      # shadcn/ui 基础组件（50+ 组件）
├── hooks/                       # 自定义 React Hooks
│   └── use-mobile.ts           # 移动端检测
└── lib/
    └── utils.ts                # 工具函数（cn 等）
```

## 开发命令

```bash
# 开发服务器
pnpm dev          # 或 bash ./scripts/dev.sh

# 构建
pnpm build        # 或 bash ./scripts/build.sh

# 生产运行
pnpm start        # 或 bash ./scripts/start.sh

# TypeScript 检查
pnpm ts-check

# ESLint 检查
pnpm lint
```

## API 端点

### LeetCode API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/leetcode` | POST | 代理 LeetCode GraphQL 查询题目列表 |
| `/api/leetcode/question?titleSlug=xxx` | GET | 获取指定题目的详细描述 |
| `/api/leetcode/generate-code` | POST | AI 生成题解代码 |
| `/api/leetcode/analyze-code` | POST | AI 分析代码复杂度和优化建议 |

### 配置 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/config` | GET | 获取当前 AI 配置 |
| `/api/config` | POST | 保存 AI 配置 |
| `/api/config` | DELETE | 清除 AI 配置 |
| `/api/config/test` | POST | 测试 AI API 连接 |

## AI 配置

项目支持自定义 AI 模型配置，配置文件位于 `ai-config.json`：

```json
{
  "apiUrl": "https://open.bigmodel.cn/api/anthropic",
  "apiKey": "your-api-key",
  "model": "glm-5"
}
```

支持的 AI 接口：
- 智谱 GLM 系列（默认）
- OpenAI 兼容接口
- 豆包模型（通过 coze SDK）

## 开发规范

### 组件开发
1. **优先使用 shadcn/ui 组件**：位于 `src/components/ui/`
2. 使用 `@/` 路径别名导入
3. 客户端组件需声明 `'use client'`

### 样式开发
1. 使用 Tailwind CSS v4 类名
2. 主题变量定义在 `globals.css`（支持暗色模式）
3. 使用 `cn()` 工具函数合并类名

### API 开发
1. 遵循 Next.js App Router 的 Route Handler 规范
2. 使用 `NextRequest` 和 `NextResponse` 处理请求响应
3. AI 调用支持流式响应

### 依赖管理
- **强制使用 pnpm**（已配置 preinstall 钩子验证）
- 不要使用 npm 或 yarn

## 关键文件说明

| 文件 | 说明 |
|------|------|
| `src/app/page.tsx` | 主应用页面，包含题目选择、代码生成、分析等核心逻辑 |
| `src/app/api/leetcode/generate-code/route.ts` | AI 代码生成的核心实现 |
| `ai-config.json` | AI 模型配置（运行时动态读写） |
| `components.json` | shadcn/ui 组件配置 |

## 注意事项

1. **包管理器**：项目强制使用 pnpm，使用其他包管理器会报错
2. **AI 配置安全**：`ai-config.json` 包含 API 密钥，不应提交到版本控制
3. **LeetCode API**：通过 GraphQL 代理访问 leetcode.cn，需要处理跨域
4. **流式响应**：AI 生成接口使用 SSE 流式传输，前端需使用 `ReadableStream` 处理

## 扩展建议

1. **添加新语言支持**：修改 `src/app/page.tsx` 中的 `languageMap` 和 Select 选项
2. **自定义 AI Prompt**：修改 `generate-code/route.ts` 中的 `systemPrompt`
3. **添加数据库存储**：使用已配置的 Drizzle ORM（`lib/db.ts`）
