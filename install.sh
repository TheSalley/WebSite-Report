#!/bin/bash
# 部署脚本：安装 Playwright 系统依赖与浏览器（以 root 执行）
# 用法：bash install.sh
set -e
cd "$(dirname "$0")"

echo "[1/3] 修复 apt 并安装系统依赖..."
apt --fix-broken install -y
apt update -y
node node_modules/playwright/cli.js install-deps chromium || true

echo "[2/3] 下载 Chromium 浏览器（项目版本，失败自动换镜像重试）..."
node node_modules/playwright/cli.js install chromium ||   PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/   node node_modules/playwright/cli.js install chromium

echo "[3/3] 复制浏览器到公共目录并开放权限..."
mkdir -p /opt/ms-playwright
cp -r /root/.cache/ms-playwright/* /opt/ms-playwright/ 2>/dev/null   || cp -r "$HOME/.cache/ms-playwright"/* /opt/ms-playwright/ 2>/dev/null   || { echo "未找到浏览器缓存目录，请检查上一步输出"; exit 1; }
chmod -R a+rX /opt/ms-playwright
echo "完成。现在用 start.sh 启动服务即可。"
