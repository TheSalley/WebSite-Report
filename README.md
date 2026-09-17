# 网站合规性检测（Next.js 版）

基于 Next.js（App Router）重写的网站合规性检测应用。输入网址 → 选择规则集 → 真实浏览器深度检测 → 查看结果 → 生成/导出报告。

> 项目思路源自 Electron 桌面版 `F:\Git\WEB-REPORT`，将检测引擎（Playwright + 25 条规则 + PageSpeed 双通道）整体迁移为 Web 服务，供本地或内网部署使用。

## 功能

- **站点管理**：CRUD、批量导入（每行一个 URL，自动取主机名为名称）
- **规则集管理**：内置「默认合规检查（全面）」「快速安全检查」两套；支持新建/复制/删除、增删规则、启停、严重级别调整
- **检测与历史**：后台真实浏览器执行（无头 Chromium + JS 渲染），实时进度、取消、任务历史、结果明细（实际值/期望值/说明/截图证据）、人工复核备注
- **报告**：所见即所得 HTML 报告（封面/得分/分组明细/截图/PageSpeed/结论），浏览器打印导出 PDF；报告设置（公司名、LOGO、标题、页脚、PSI API Key）
- **PageSpeed 评分**：配置 Google PSI API Key 优先调用，否则回退本地 Lighthouse（离线可用），采集移动端 + 桌面端四类评分与 6 项核心指标
- **得分算法**：100 分制（必须 3 / 警告 2 / 建议 1；pass 全权重、warn 半权重）；任一必须项失败 → 判定「不通过」

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3000
```

检测引擎依赖 Playwright Chromium，需先安装浏览器（首次可执行 `npx playwright install chromium`）。数据默认存储于项目根 `web-report-data/`（JSON 文件），可用环境变量 `WEBREPORT_DATA_DIR` 覆盖。

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
│   ├── rules/               # 规则集管理
│   ├── reports/[id]         # 完整报告页（可打印 PDF）
│   ├── reports/settings     # 报告设置
│   └── docs/                # 使用说明
├── components/              # UI 组件（shadcn 风格）与页面外壳
└── lib/
    ├── engine/              # 检测引擎：browser / network-collector / snapshot / scoring / pagespeed
    │   └── rules/           # 25 条规则实现（SEO/性能/安全/内容/合规）
    ├── report/              # 报告生成（内联样式 HTML，可打印）
    ├── store.ts             # JSON 文件数据层（串行原子写）
    ├── seed.ts              # 内置规则集种子
    ├── task-service.ts      # 后台任务调度（内存进度 + 持久化）
    ├── settings.ts / init.ts
    └── types.ts             # 共享类型
```

## 已知限制

- 本地 JSON 存储，适合单机/小团队；多用户并发需换数据库（如 SQLite/Postgres）
- PageSpeed 本地 Lighthouse 只支持 Node 运行环境，Serverless 部署需改用纯 PSI API
- 批量检测暂为单任务逐个执行；周期巡检、账号体系为二期方向

## 许可

MIT
