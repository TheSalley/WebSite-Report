# 网站合规性检测

基于 Next.js 的网站合规性检测工具：录入站点 → 选择规则分组 → Playwright 真实浏览器检测 → 查看结果 → 生成可打印报告。

## 功能

- 站点管理：新增、编辑、删除、批量导入
- 规则分组：内置规则库，支持分组、启停和自定义交付说明
- 检测任务：后台执行、实时进度、取消、历史记录与逐项结果
- 报告导出：HTML 报告，可通过浏览器打印为 PDF
- PageSpeed：采集移动端/桌面端得分截图，留存为功能产物

## 规则类型

规则按“是否需要自动执行”分为三类，打开规则设置即可切换。统计口径完全分开，不会把合同承诺当成检测失败。

| 类型 | 适用内容 | 执行方式 | 统计口径 |
| --- | --- | --- | --- |
| 自动检测 | SEO、HTTPS、H1、功能入口等可验证项 | 浏览器实际检查 | 计入通过 / 失败 / 跳过 |
| 合同文案 | 合同条款、服务承诺、交付说明 | 不打开页面，直接生成待验收项 | 仅统计待验收，不计入通过率 |
| 功能产物 | PageSpeed 得分截图等证据 | 单独执行并保存文件 | 不计入通过率与报告合计 |

判断标准很简单：**能在页面上客观验证的才设为自动检测；合同里的承诺设为合同文案；截图、导出文件设为功能产物。**

规则类型保存在数据库的 `kind` 字段中，是唯一分类依据。旧数据的 `verify.*`、`artifact.*` 前缀仅用于首次迁移兼容，之后修改类型不会再被前缀覆盖。

任务详情按“自动检测 / 合同文案 / 功能产物”分区展示；报告中的“检测合计”和通过率也只统计自动检测项。

## 快速开始

```bash
npm install
npx playwright install chromium
npm run dev
```

打开 http://localhost:3000。

数据默认保存在 `web-report-data/`，SQLite 数据库为 `reports.db`。

## 服务器部署

```bash
npm ci
sudo bash install.sh   # 安装系统依赖与 Chromium，并复制到 /opt/ms-playwright
npm run build
npx next start -p 3010
```

`install.sh` 用于 Linux 首次部署，需要 root 权限。应用会自动探测可用的 Playwright 浏览器目录，通常无需手动配置环境变量。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WEBREPORT_DATA_DIR` | `web-report-data/` | 数据目录，包含数据库与截图 |
| `PLAYWRIGHT_BROWSERS_PATH` | 自动探测 | Playwright 浏览器目录；自动探测失败时可手动指定 |

## 常用命令

```bash
npm run dev      # 开发模式
npm run build    # 生产构建
npm run start    # 启动生产服务（先 build）
npm run lint     # 代码检查
```

## 注意事项

- 使用本地 SQLite 存储，适合单机或小团队部署。
- PageSpeed 截图依赖 pagespeed.web.dev，目标站需允许 Google 抓取；抓取失败时不保存错误页。
- 目标网站需能从部署服务器正常访问，否则检测可能失败。

## 许可

MIT
