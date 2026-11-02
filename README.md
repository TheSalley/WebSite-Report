# 网站合规性检测（Next.js 版）

基于 Next.js（App Router）重写的网站合规性检测应用。输入网址 → 选择分组 → 真实浏览器深度检测 → 查看结果 → 生成/导出报告。

> 项目思路源自 Electron 桌面版 `F:\Git\WEB-REPORT`，将检测引擎（Playwright + 内置规则库 + PageSpeed 评分/截图）整体迁移为 Web 服务，供本地或内网部署使用。

## 功能

- **站点管理**：CRUD、批量导入（每行一个 URL，自动取主机名为名称）
- **规则分组**：内置规则库；可新建/复制/删除分组，勾选规则、启停并配置说明与交付文案
- **检测与历史**：后台真实浏览器执行（无头 Chromium + JS 渲染），实时进度、取消、任务历史、结果明细（实际值/期望值/说明/截图证据）、人工复核备注
- **报告**：所见即所得 HTML 报告（封面/分组明细/截图/PageSpeed 截图），浏览器打印导出 PDF；报告设置（公司名、LOGO、标题、页脚）
- **PageSpeed**：通过 Google PSI 在线接口采集移动端 + 桌面端评分；并截取 pagespeed.web.dev 的得分报告截图，网络不可用时用本地评分数据渲染兜底

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3000
```

检测引擎依赖 Playwright Chromium，需先安装浏览器（首次可执行 `npx playwright install chromium`）。数据默认存储于项目根 `web-report-data/`（SQLite 数据库 `realsite.db`），可用环境变量 `WEBREPORT_DATA_DIR` 覆盖。

## 服务器部署（Linux）

项目内置两个部署脚本，适配宝塔/www 等非 root 运行场景（浏览器装在 root 目录时 www 用户读不到，必须放到公共目录并指定 `PLAYWRIGHT_BROWSERS_PATH`）：

### 1. 首次部署 / 更新依赖

```bash
npm ci
bash install.sh     # root 执行：修 apt → 装系统依赖 → 下载 Chromium（失败自动换国内镜像）→ 复制到 /opt/ms-playwright
npm run build
```

### 2. 启动服务

```bash
npx next start -p 3010     # 直接启动，浏览器路径由代码自动探测，无需手动设置环境变量
```

宝塔面板请在「项目设置 → 启动命令」填写：`npx next start -p 3010`（路径按实际项目目录，端口按需修改）。用 pm2 亦可：`pm2 start npm --name realsite -- run start -- -p 3010`。

> 如果服务器无 apt（CentOS/yum），手动执行 `npx playwright install-deps chromium`、`npx playwright install chromium`，并把 `/root/.cache/ms-playwright`（或对应 `$HOME/.cache`）复制到 `/opt/ms-playwright` 后 `chmod -R a+rX /opt/ms-playwright`。

> 若无法使用 `--with-deps`（无 root/受限环境），可手动安装常用依赖：
> `apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2`

### 检测失败排查

- 任务状态为「失败」时，打开任务详情会显示具体错误原因（如 Chromium 启动失败）。
- 常见原因与解决：
  - **缺少系统依赖**：运行 `npx playwright install-deps chromium` 或将上面的 apt 依赖安装完整。
  - **内存不足**：容器/小内存机器可设置 `--disable-dev-shm-usage`（引擎已默认带该参数）。
  - **目标网站网络不通**：确认服务器能访问被检测的站点（部分站点在国内服务器上需代理）。

### 环境变量

- `WEBREPORT_DATA_DIR`：数据目录（默认 `web-report-data/`），多实例部署时需指向共享目录。
- `PLAYWRIGHT_BROWSERS_PATH`：Playwright 浏览器目录（部署脚本已固定为 `/opt/ms-playwright`），非 root 用户运行时必须设置，否则报 `Executable doesn't exist`。

## 常用命令

```bash
npm run build      # 生产构建
npm run start      # 生产运行（先 build）
npm run lint       # ESLint
```

## 项目结构

```text
src/
├── app/
│   ├── api/                 # REST API（sites / rulesets / tasks / settings / screenshots / report）
│   ├── runs/                # 检测与历史
│   ├── sites/               # 站点管理
│   ├── rules/               # 规则库与分组
│   ├── reports/[id]         # 完整报告页（可打印 PDF）
│   ├── reports/settings     # 报告设置
│   └── docs/                # 使用说明
├── components/              # UI 组件（shadcn 风格）与页面外壳
└── lib/
    ├── engine/              # 检测引擎：browser / network-collector / snapshot / scoring / pagespeed
    │   └── rules/           # 25 条规则实现（SEO/性能/安全/内容/合规）
    ├── report/              # 报告生成（内联样式 HTML，可打印）
    ├── store.ts             # SQLite 数据层（node:sqlite，零额外依赖）
    ├── seed.ts              # 内置规则库与默认分组种子
    ├── task-service.ts      # 后台任务调度（内存进度 + 持久化）
    ├── settings.ts / init.ts
    └── types.ts             # 共享类型
```

## 已知限制

- 本地 SQLite 存储（Node 内置 node:sqlite，零额外依赖），适合单机/小团队；多用户并发可换 Postgres
- PageSpeed 评分依赖 Google PSI 在线接口（匿名配额有限）；截图依赖 pagespeed.web.dev，目标站拦截 Google 抓取时只能使用本地渲染兜底
- 批量检测暂为单任务逐个执行；周期巡检、账号体系为二期方向

## 许可

MIT
