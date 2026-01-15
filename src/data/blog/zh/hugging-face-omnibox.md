---
title: 把你的影视聚合中心搬上云端：在 Hugging Face 免费部署 Omnibox 的终极指南
pubDatetime: 2026-01-14
description: >-
  别再买 VPS 了！教你用 Hugging Face Spaces + Docker 免费部署 Omnibox 影视聚合中心，配合 Cloudflare
  实现自定义域名，从零搭建专属云端影音库。
draft: false
featured: true
tags:
  - HuggingFace
  - Docker
  - Omnibox
  - Cloudflare
  - 教程
  - 白嫖
  - 家庭影音
---
👋 今天我们要折腾一个非常有意思的项目——**Omnibox**。如果你是 NAS 玩家或者影视爱好者，可能听说过这个聚合神器。虽然 Docker 部署在本地很简单，但如果想在云端随时随地访问，通常需要一台 VPS。

**但是！** 既然有了 Hugging Face Spaces 这种神器，为什么不白嫖...咳咳，合理利用一下免费的计算资源呢？😎

在这篇文章里，我将手把手教你如何把 `lampon/omnibox` 镜像搬运到 Hugging Face Spaces，解决令人头秃的端口映射问题，最后再教你用 Cloudflare 加上自定义域名，实现完美的云端体验。

---

## 🚀 为什么选择 Hugging Face Spaces？

Hugging Face 不仅仅是 AI 界的 GitHub，它的 **Spaces** 功能允许我们托管 Docker 容器。

- **优点**：免费（提供 2vCPU + 16GB RAM 的基础配置）、自带 HTTPS、无需维护服务器。
- **挑战**：它对权限（非 root）、端口（强制 7860）和持久化存储有特殊要求，直接跑第三方镜像通常会报错。

别担心，接下来的步骤就是为了解决这些坑。👇

---

## 🛠️ 第一步：创建 Space

1. 登录 [Hugging Face](https://huggingface.co/)。
1. 点击右上角 **New Space**。
1. **Name**: 起个名字，比如 `my-omnibox-cloud`。
1. **SDK**: 这里必须选 **Docker** (Blank)。
1. **License**: 随便选一个，比如 MIT。
1. 点击 **Create Space**。

---

## 📝 第二步：编写 Dockerfile（核心魔法）

这是最关键的一步。直接用官方的 `FROM lampon/omnibox` 是跑不起来的，因为：

1. **端口不匹配**：Omnibox 默认用 `7023`，HF 强制监听 `7860`。
1. **启动命令错误**：官方镜像的默认入口可能不适配 HF 的环境。
1. **权限地狱**：HF 默认不喜欢 root 运行应用，但 `socat` 转发又需要权限。

我们需要一个“魔改版” Dockerfile。在 Space 的 **Files** 页面新建 `Dockerfile`，粘贴以下内容：

```dockerfile
# 1. 使用官方镜像作为底包，省去自己编译的麻烦
FROM lampon/omnibox:latest

# 2. 切换到 Root 进行环境配置
USER root

# 安装 socat，这是我们的"端口转发神器"
RUN apk add --no-cache socat

# 3. 配置数据持久化
# Hugging Face 的持久化存储挂载在 /data
# 我们用软链接把 App 的数据目录指过去
RUN mkdir -p /data/omnibox && \
    rm -rf /app/data && \
    ln -s /data/omnibox /app/data && \
    chmod -R 777 /data && \
    chmod -R 777 /app

# 4. 编写启动脚本 (Start Script)
# 这里解决了两个大坑：
# A. 用 socat 把 HF 的 7860 流量转发给 Omnibox 的 7023
# B. 修正启动命令为 ./main (而不是默认的 /app/omnibox)
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'echo "Starting port forwarding 7860 -> 7023..."' >> /start.sh && \
    echo 'socat tcp-listen:7860,fork,reuseaddr tcp-connect:localhost:7023 &' >> /start.sh && \
    echo 'echo "Starting Omnibox..."' >> /start.sh && \
    echo 'cd /app && exec ./main' >> /start.sh && \
    chmod +x /start.sh

# 5. 基础环境设置
ENV TZ=Asia/Shanghai
ENV HOME=/data

# 6. 暴露标准端口
EXPOSE 7860

# 7. 切换到安全用户 (绕过 HF 的权限限制)
RUN adduser -D -u 1000 user && \
    chown -R user:user /data && \
    chown -R user:user /app

USER user

# 8. 锁定工作目录并启动
WORKDIR /app
CMD ["/start.sh"]
```

再创建一个 `README.md` 文件（如果不创建，HF 可能会识别错误）：

```yaml
---
title: Omnibox Cloud
emoji: 📺
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
app_port: 7860
---

# Omnibox on Hugging Face
Deployed via Docker with socat port forwarding.
```

提交更改后，Space 会自动开始 Build。如果你看到 Logs 显示 `Starting Omnibox...` 且没有报错，恭喜你，后端通了！🎉

---

## 💾 第三步：搞定数据持久化（防丢档）

如果你不配置这个，每次 Space 重启（HF 会不定期休眠免费 Space），你的配置和数据库就全没了。

1. 进入 Space 的 **Settings** 标签页。
1. 滚动到 **Persistent Storage**。
1. 选择 **Small** (SSD) 套餐。
   - *注：虽然这显示需要付费，但对于小流量个人项目，有时会有免费额度或低成本选项。如果不想花钱，做好数据会重置的心理准备。*

我们在 Dockerfile 里已经写好了 `ln -s /data/omnibox /app/data`，一旦你挂载了存储，数据就会自动落盘。

---

## 🌐 第四步：自定义域名（白嫖 Cloudflare）

默认的域名 `huggingface.co/spaces/xxx` 太长太丑，而且容易被某些网络环境拦截。我们要用 **Cloudflare Workers** 来做一个免费的反向代理 。

### 1. 获取 Direct URL

在你的 Space 页面右上角，点击三个点 -> **Embed this space**。找到 **Direct URL**，长这样：
`https://你的用户名-space名字.hf.space`

### 2. 创建 Cloudflare Worker

1. 登录 Cloudflare Dashboard。
1. 进入 **Workers & Pages** -> **Create Worker**。
1. 点击 **Edit Code**，粘贴以下代码：

```javascript
export default {
  async fetch(request) {
    // 替换成你刚才获取的 Direct URL
    const TARGET = "https://yourname-omnibox-cloud.hf.space"; 

    const url = new URL(request.url);
    const targetUrl = new URL(TARGET);

    // 域名替换逻辑
    url.hostname = targetUrl.hostname;
    url.protocol = targetUrl.protocol;
    
    // 构造请求
    const newRequest = new Request(url.toString(), {
        headers: request.headers,
        method: request.method,
        body: request.body,
        redirect: "follow"
    });

    return fetch(newRequest);
  },
};
```

### 3. 绑定域名

1. 在 Worker 的设置页面，找到 **Triggers** -> **Custom Domains**。
1. 点击 **Add Custom Domain**。
1. 输入你的子域名（例如 `movie.yourdomain.com`）。
1. Cloudflare 会自动处理 DNS 和 SSL 证书 。

等待几分钟，访问你的自定义域名，你应该就能看到熟悉的 Omnibox 登录界面了！

---

## ⚠️ 避坑指南（Pro Tips）

1. **Runtime Error 127**：如果你遇到 `exec: /app/omnibox: not found` 错误，说明你还在用旧的启动命令。请务必检查 Dockerfile 里是否改成了 `cd /app && exec ./main` 。
1. **休眠问题**：免费的 HF Space 会在 48 小时无操作后休眠。可以通过 Webhook 或者定期访问你的自定义域名来唤醒它。
1. **Socat 重要性**：不要尝试直接改 Omnibox 的配置文件端口，Docker 内部转发是最稳的方案，不侵入原应用逻辑。

---

## 结语

通过这套组合拳（Hugging Face + Docker + Cloudflare），我们成功搭建了一个免费、HTTPS 加密、带自定义域名的私有 Omnibox 服务。虽然折腾了一点，但看着它跑起来的那一刻，是不是成就感爆棚？

如果你在部署过程中遇到问题，欢迎在评论区留言！👇

Happy Hacking! 💻
