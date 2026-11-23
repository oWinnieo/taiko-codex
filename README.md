# taiko-codex

双区鼓点 Web 节奏游戏。内置《纸灯巡游》和《电流穿行》，各有入门、进阶两种难度。

- `F/J` 敲鼓面，`D/K` 敲鼓边，触屏可直接按鼓垫。`Enter` 开始，`Esc` 暂停或继续。
- 音符经过左侧击打线时敲对应鼓垫。大音符可用双手获取额外分数。连打可用任何鼓垫，气球用鼓面敲够指定次数。
- 可导入或拖放本地 `.tja` 与 `WAVE` 指定的音频。支持选择整个曲包目录。支持 UTF-8 和 Shift-JIS，音频格式以浏览器支持为准。本地曲包保存在当前浏览器 IndexedDB。
- 在「设置」中调节音乐、击打音效和延迟，也可以用节拍校准向导测量输入偏移。

## 开发

使用 Node.js 20+。执行 `npm run dev` 后打开 [本地试玩](http://localhost:4173)。修改源码后重启预览以重建静态产物。

```bash
npm test
npm run build
```

`dist/` 可由静态服务器或桌面 WebView 承载。新增内置曲目时，把谱面与音频放入 `web/songs/`，再更新 `web/songs/index.json`。两首示范曲可通过 `python3 scripts/generate_demo_songs.py` 重新生成。

常规单人 TJA 兼容范围包括 BPM、拍号、延迟、卷轴速度、加成段、谱线和变体音符。分支谱、双人谱、塔与段位、高级卷轴模式暂不支持，导入时会显示相应说明。

## 项目文档

- [实施方案](docs/taiko_plan.md)
- [OpenClaw 开发与生产发布规则](rules/openclaw-dev-prod-workflow.md)
- [生产运行与回退](docs/deployment.md)
- [每日进度](docs/progress/README.md)
