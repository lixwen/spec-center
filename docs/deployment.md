# Spec Center 部署指南

## 服务架构

```
┌──────────────────────────────────────────────────────┐
│                  docker-compose.yml                   │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  MongoDB  │  │  Qdrant  │  │    Next.js Web     │  │
│  │  :27017   │  │  :6333   │  │      :3000         │  │
│  └─────┬─────┘  └─────┬────┘  └────────┬───────────┘  │
│        │               │               │              │
│        └───────────────┴───────────────┘              │
│                        │                              │
│               ┌────────┴────────┐                     │
│               │ Embedding Worker│                     │
│               └─────────────────┘                     │
└──────────────────────────────────────────────────────┘
```

| 服务 | 镜像 / 构建 | 端口 | 说明 |
|------|------------|------|------|
| mongo | `mongo:8` | 27017 | 文档数据库，启用认证 |
| qdrant | `qdrant/qdrant:latest` | 6333, 6334 | 向量数据库 |
| web | Dockerfile `web` target | 3000 | Next.js 前端（standalone 模式） |
| worker | Dockerfile `worker` target | - | RAG embedding 后台任务 |

## 快速启动

```bash
# 1. 复制环境配置
cp .env.example .env

# 2. 编辑 .env，至少修改以下值：
#    - MONGO_ROOT_PASSWORD（MongoDB root 密码）
#    - MONGO_APP_PASSWORD（应用连接密码）
#    - AI_API_KEY（RAG 功能所需，支持任何 OpenAI 兼容 API）

# 3. 启动全部服务
docker compose up -d --build

# 4. 查看运行状态
docker compose ps

# 5. 查看日志
docker compose logs -f
```

启动后访问 http://localhost:3000 即可使用。

## 环境变量

### 必填

| 变量 | 说明 | 示例 |
|------|------|------|
| `MONGO_ROOT_PASSWORD` | MongoDB root 用户密码 | `strong-root-pw` |
| `MONGO_APP_PASSWORD` | 应用数据库用户密码 | `strong-app-pw` |
| `AI_API_KEY` | AI API Key（RAG 功能，任何 OpenAI 兼容 API） | `sk-xxx` |

### 可选

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MONGO_ROOT_USERNAME` | `sc` | MongoDB root 用户名 |
| `MONGO_APP_USERNAME` | `sc_app` | 应用数据库用户名 |
| `SC_MONGODB_DB` | `spec-center` | 数据库名 |
| `AI_BASE_URL` | `https://openrouter.ai/api/v1` | OpenAI 兼容 API 基地址 |
| `AI_EMBEDDING_MODEL` | `intfloat/multilingual-e5-large` | Embedding 模型 |
| `AI_CHAT_MODEL` | `anthropic/claude-sonnet-4` | Chat 模型 |
| `AI_RERANK_MODEL` | `cohere/rerank-4-fast` | Rerank 模型（可选：`cohere/rerank-4-pro`、`cohere/rerank-v3.5`） |
| `AI_RERANK_ENABLED` | `true` | 是否启用 RAG Rerank，设为 `false` 关闭 |
| `SC_JWT_SECRET` | 自动生成 | JWT 签名密钥 |
| `SC_BOOTSTRAP_ADMIN_PASSWORD` | - | 首次启动自动创建管理员的密码 |

## Dockerfile 构建流程

采用多阶段构建，一个 Dockerfile 产出两个 target：

```
Stage 1: builder
  ├── npm install（全部依赖）
  ├── 构建 core → web
  ├── tsup 编译 worker-main.ts（external 外部依赖）
  └── npm prune --omit=dev（清理 devDeps）

Stage 2: web（FROM node:22-alpine）
  └── 仅包含 Next.js standalone 输出 + static 资源

Stage 3: worker（FROM node:22-alpine）
  └── 编译后的 worker-main.js + 生产 node_modules
```

## MongoDB 认证

MongoDB 启用了认证，采用两级用户：

- **root 用户**（`MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD`）：管理级权限
- **应用用户**（`MONGO_APP_USERNAME` / `MONGO_APP_PASSWORD`）：仅 `readWrite` 权限，限定在 `spec-center` 数据库

应用用户通过 `docker/mongo-init.js` 在容器首次初始化时自动创建。该脚本仅在 MongoDB 数据目录为空时执行（`docker-entrypoint-initdb.d` 标准行为）。

## 数据持久化

| 命名卷 | 挂载点 | 说明 |
|--------|--------|------|
| `mongo_data` | `/data/db` | MongoDB 数据文件 |
| `qdrant_data` | `/qdrant/storage` | Qdrant 向量存储 |

数据在 `docker compose down` 后保留，仅 `docker compose down -v` 会删除卷。

## 已有数据迁移

如果本机 MongoDB 中已有 `spec-center` 数据库的数据，按以下步骤迁移：

```bash
# 1. 导出数据（容器化之前）
mongodump --db spec-center --out ./backup

# 2. 先启动 mongo 容器
docker compose up -d mongo

# 3. 将数据导入容器中的 MongoDB（使用 root 用户）
mongorestore --host 127.0.0.1 --port 27017 \
  -u sc -p <MONGO_ROOT_PASSWORD> \
  --authenticationDatabase admin \
  --db spec-center ./backup/spec-center

# 4. 启动其余服务
docker compose up -d
```

## 常用运维命令

```bash
# 重新构建并启动
docker compose up -d --build

# 仅重启某个服务
docker compose restart web

# 查看单个服务日志
docker compose logs -f worker

# 进入 MongoDB shell
docker compose exec mongo mongosh -u sc -p <MONGO_ROOT_PASSWORD>

# 停止所有服务（保留数据）
docker compose down

# 停止并删除所有数据（危险！）
docker compose down -v
```

## 本地开发（非 Docker）

如果仅用 Docker 运行基础设施（MongoDB + Qdrant），应用在本地跑：

```bash
# 只启动数据库
docker compose up -d mongo qdrant

# 在 .env 中设置本地连接地址
SC_MONGODB_URL=mongodb://sc_app:<MONGO_APP_PASSWORD>@127.0.0.1:27017/spec-center?authSource=spec-center
QDRANT_URL=http://localhost:6333

# 启动 web
npm run dev

# 启动 worker（另一个终端）
npm run worker --workspace @spec-center/core
```
