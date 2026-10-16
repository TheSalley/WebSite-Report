#!/bin/bash
# 启动脚本：让 www 用户运行的 Next 服务能找到 Playwright 浏览器
# 用法：宝塔启动命令填  bash /www/wwwroot/WEBSITE_REPORT/start.sh
export PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
exec npm start "$@"
