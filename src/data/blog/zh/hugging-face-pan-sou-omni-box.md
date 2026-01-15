---
title: 零成本打造家庭影音搜索中心：在 Hugging Face 部署 PanSou 并联动 OmniBox
pubDatetime: 2026-01-15
description: >-
  想搭建自己的网盘搜索中心但不想买服务器？教你利用 Hugging Face 免费部署 PanSou +
  OmniBox，零成本打造强大的家庭影音搜索后端，全过程 Docker 化，稳定又好用！🚀
draft: false
featured: true
tags:
  - HuggingFace
  - Docker
  - 盘搜
  - 家庭影音
  - 白嫖
  - PanSou
  - OmniBox
---
在 NAS 玩家和家庭影音爱好者的圈子里，**OmniBox**（全能盒子）和 **PanSou**（盘搜）是两款非常强大的工具。OmniBox 负责聚合资源展示，而 PanSou 则是目前最好用的网盘资源搜索后端之一。

通常我们需要一台 VPS 或 NAS 来部署它们，但今天我将分享一种**完全免费、无需服务器**的方案：利用 **Hugging Face Spaces** 的 Docker 环境来托管这两项服务，并实现它们之间的完美互通。

## 为什么要这么做？

- **零成本**：Hugging Face 提供的 CPU Basic 实例是永久免费的。
- **公网可访问**：自带 HTTPS 域名，无需折腾内网穿透。
- **长期稳定**：适合作为家庭媒体中心的后端 API 服务。

---

## 准备工作

1. 注册一个 [Hugging Face](https://huggingface.co/) 账号。
1. 确保你了解基本的 Docker 概念（其实照着抄作业就行）。

---

## 第一步：部署 PanSou (作为搜索后端)

PanSou 官方镜像默认监听 80 端口，且前后端耦合，这与 Hugging Face 强制要求监听 **7860** 端口的规则冲突。经过多次调试（包括 Nginx 反代失败、健康检查超时等坑），我们找到了一个**极简的纯 API 方案**。

### 1. 创建 Space

- 点击 Hugging Face 右上角 **New Space**。
- **Name**: `pansou-api` (名字随意)。
- **License**: `MIT`。
- **SDK**: 选择 **Docker** (不要选 Static 或 Gradio)。
- **Privacy**: 建议 **Public** (公开)，方便 OmniBox 调用；如果介意隐私可选 Private（但 OmniBox 配置时可能需要带 Token，较麻烦）。

### 2. 编写 Dockerfile

进入 Space 的 **Files** 页面，新建或编辑 `Dockerfile`，填入以下内容：

```dockerfile
# 使用 PanSou 官方镜像
FROM ghcr.io/fish2018/pansou-web:latest

# 切换 Root 权限
USER root
WORKDIR /app

# 1. 清理前端文件 (作为纯 API 服务，不需要前端页面)
# 这一步能减小体积，且避免 404 误导
RUN rm -rf /app/frontend /app/dist /app/static /app/public 2>/dev/null || true

# 2. 赋予执行权限
RUN chmod +x /app/pansou

# 3. 关键配置
# PORT=7860: Hugging Face 强制要求监听此端口
# GIN_MODE=release: 开启生产模式，提升性能
ENV PORT=7860
ENV GIN_MODE=release

# 4. 暴露端口
EXPOSE 7860

# 5. 启动命令
# 直接启动二进制文件，无需 Nginx 中转
CMD ["/app/pansou"]
```

### 3. 等待部署

提交文件后，Space 会自动构建。当状态变为 **Running** 时，你的 PanSou 后端就活了！

> **注意**：此时直接访问 Space 的 URL 会显示 `404 page not found`，这是**正常的**！因为我们删除了前端页面。只要日志里没有报错，API 就是通的。

获取你的后端地址：

- 点击 Space 页面右上角的菜单（三个点） -> **Embed this space**。
- 复制 **Direct URL**（例如：`https://username-pansou-api.hf.space`）。

---

## 第二步：部署 OmniBox (作为前端聚合)

OmniBox 同样可以部署在 Hugging Face 上。这里我们需要用 Nginx 做一个简单的端口转发，因为 OmniBox 默认端口通常不是 7860。

### 1. 创建 Space

- **Name**: `omnibox-ui`。
- **SDK**: **Docker**。

### 2. 编写 Dockerfile

复制以下内容到 `Dockerfile`：

```dockerfile
# 使用 OmniBox 社区镜像
FROM lampon/omnibox:latest

USER root

# 安装 Nginx 用于端口转发
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

# 配置 Nginx：将 HF 的 7860 流量转发给 OmniBox 的 7023
RUN echo 'server { \
    listen 7860; \
    location / { \
        proxy_pass http://127.0.0.1:7023; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
    } \
}' > /etc/nginx/sites-available/default

# 启动脚本：同时启动 OmniBox 和 Nginx
RUN echo '#!/bin/bash \n\
/app/omnibox & \n\
nginx -g "daemon off;"' > /start.sh && chmod +x /start.sh

EXPOSE 7860
CMD ["/start.sh"]
```

等待构建完成，当状态变为 **Running** 后，打开 App 页面，你就能看到 OmniBox 的界面了。

---

## 第三步：实现互通

最后一步，把它们连起来。

1. 打开你的 **OmniBox Space 页面**。
1. 进入 **设置/管理** -> **网盘资源/搜索源**。
1. 点击 **添加 PanSou**（或配置现有项）。
1. 在 **接口地址/URL** 栏中，填入第一步获取的 **PanSou Direct URL**。
   - 例如：`https://你的用户名-pansou-api.hf.space`
   - **注意**：不需要加 `/api` 后缀，通常直接填域名即可（视 OmniBox 版本而定）。
1. 保存并尝试搜索。

如果搜索结果中出现了网盘资源，恭喜你！你已经拥有了一个完全运行在云端的影音搜索中心。

---

## 避坑指南 & 常见问题

**Q: 为什么 PanSou 部署后访问是 404？**
A: 这是我们特意设计的。为了适应 Hugging Face 的环境，我们剥离了 PanSou 的 Web 前端，只保留了 API 功能供 OmniBox 调用。只要 OmniBox 能搜到东西，就说明部署成功。

**Q: 搜索速度慢或第一次搜索报错？**
A: Hugging Face 的免费 Space 在 48 小时无访问后会进入休眠（Sleeping）。当你发起第一次请求时，它需要冷启动（Cold Boot），这大约需要 1-2 分钟。建议配置 OmniBox 的重试机制，或者手动刷新一下。

**Q: 重启后 OmniBox 配置丢了？**
A: Hugging Face Space 是无状态的。如果 OmniBox 镜像不支持环境变量配置 PanSou 地址，建议在配置好后，使用 OmniBox 的 **“导出配置”** 功能备份 JSON 文件。下次 Space 重启后一键导入即可。

---

希望这篇教程能帮你省下买 NAS 或 VPS 的钱！
