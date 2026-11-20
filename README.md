# 网站合规性检测

基于 Next.js 的网站合规性检测工具：录入站点 → 选择规则分组 → Playwright 真实浏览器检测 → 查看结果 → 生成可打印报告。

## 功能

- 站点管理：新增、编辑、删除、批量导入
- 规则分组：内置规则库，支持分组、启停和自定义交付说明
- 检测任务：后台执行、实时进度、取消、历史记录与逐项结果
- 报告导出：HTML 报告，可通过浏览器打印为 PDF
- PageSpeed：采集移动端/桌面端得分截图，留存为功能产物

## 规则类型

规则按“是否由机器执行”分为三类，打开规则设置即可切换。统计口径完全分开，不会把合同承诺当成检测失败。

| 类型 | 适用内容 | 执行方式 | 统计口径 |
| --- | --- | --- | --- |
| 机器检测 | SEO、HTTPS、H1、功能入口等可验证项 | 浏览器实际检查 | 计入通过 / 失败 / 跳过 |
| 合同文案 | 合同条款、服务承诺、交付说明 | 不打开页面，直接生成待验收项 | 仅统计待验收，不计入通过率 |
| 功能产物 | PageSpeed 得分截图等证据 | 单独执行并保存文件 | 不计入通过率与报告合计 |

判断标准很简单：**能在页面上客观验证的才设为机器检测；合同里的承诺设为合同文案；截图、导出文件设为功能产物。**

规则类型保存在数据库的 `kind` 字段中，是唯一分类依据。旧数据的 `verify.*`、`artifact.*` 前缀仅用于首次迁移兼容，之后修改类型不会再被前缀覆盖。

任务详情按“机器检测 / 合同文案 / 功能产物”分区展示；报告只保留“基本信息”和“检测明细”，存在 PageSpeed 截图时追加“PageSpeed 评分截图”。

## 快速开始

```bash
npm install
npx playwright install chromium
npm run dev
```

打开 http://localhost:3000。

数据默认保存在 `web-report-data/`，SQLite 数据库为 `reports.db`。

### 从 realsite.db 迁移旧数据

如果数据目录里还留着旧版 `realsite.db`，执行一次合并脚本即可：站点按 URL 去重，规则按 `规则集 + ruleKey` 去重，任务与检测结果保留原 ID，现有 `reports.db` 数据不会被覆盖。迁移前会自动备份到 `web-report-data/backups/`。

```bash
node scripts/migrate-realsite-to-reports.mjs --dry-run   # 先空跑确认统计
node scripts/migrate-realsite-to-reports.mjs             # 正式写入
```

迁移成功后旧文件不会自动删除，确认 `reports.db` 数据正常后可自行移除 `realsite.db` 及其 `-wal`/`-shm` 文件。

### 导出 / 导入规则集

把线上数据库的规则集导出成 JSON，再到另一台机器导入，不用手改数据库。

```bash
# 导出本地库（默认生成 rulesets-<时间>.json）
npm run rulesets:export

# 导出线上库
npm run rulesets:export -- --from root@<服务器IP>

# 只导出一个规则集
npm run rulesets:export -- --set 网站交付检查

# 导入到本地库（可先加 --dry-run 看差异）
npm run rulesets:import -- rulesets-20261120-173001.json

# 导入到线上（自动备份、上传并重启服务）
npm run rulesets:import -- rules.json --to root@<服务器IP>:/srv/app/web-report-data/reports.db
```

导入按「规则集名称 + ruleKey」匹配：

- 缺失的规则集和规则会新建，已有的会更新名称、说明、交付成果、执行范围、类型、排序与启停状态；
- 保留规则原有 `id`，历史检测结果不受影响；
- 导出文件里没有、但库里存在的额外规则默认保留，加 `--replace` 才删除；
- 写库前自动备份（线上为同目录 `.bak-<时间>`）。

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
