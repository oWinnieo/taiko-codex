# 运行部署

按 [OpenClaw 发布规则](../rules/openclaw-dev-prod-workflow.md) 完成仓库发布后，通过 `ssh rococo-root` 登录。运行服务接受来自生产边缘代理的流量，使用 Docker 网桥地址 `172.18.0.1:3114`，HTTPS 由边缘 Nginx 终止。

## 构建已发布的提交

```bash
cd /opt/docker/for-oc-dev2prod/taiko-codex
git fetch prod main
export TAIKO_COMMIT="$(git rev-parse prod/main)"
export TAIKO_BIND_IP=172.18.0.1
export TAIKO_PORT=3114
release="/opt/docker/taiko-codex/releases/$TAIKO_COMMIT"
install -d -m 0755 "$release"
git archive "$TAIKO_COMMIT" | tar -xf - -C "$release"
cd "$release"
docker compose build
docker compose up -d --no-build --wait
```

首次部署，将 `deploy/taiko-codex.rococo.dev.conf` 安装到边缘 Nginx 挂载目录 `/opt/docker/rococo/data/nginx/conf.d/`。通过 `docker exec nginx nginx -t` 后执行 `docker exec nginx nginx -s reload`。核对配置路径和域名后再执行，后续内容发布沿用同一路由。

```bash
curl -fsS http://172.18.0.1:3114/healthz
curl -fsS https://taiko-codex.rococo.dev/healthz
curl -fsSI https://taiko-codex.rococo.dev/songs/paper-lanterns.wav
```

打开站点并验证可选曲、开局和听到音频。

## 回退

找到前一个已发布版本的提交号，在 `/opt/docker/taiko-codex/releases/<commit>` 使用相同的绑定地址与端口，将 `TAIKO_COMMIT` 设置为该提交并执行 `docker compose up -d --no-build --wait`。按同一套探针检查。镜像如已删除，先从该提交重建。
