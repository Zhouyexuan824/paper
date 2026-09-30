# Paper Atlas · 论文关系网

本仓库已经将 Paperline 的论文检索整理能力与原 Paper Atlas 工作台合并。

主要能力：

- arXiv、OpenAlex、Crossref 与 Semantic Scholar 多源论文检索
- 参考文献、被引用论文与相关候选的独立状态和回退
- 点击任意节点继续展开，以所选节点为中心分析研究脉络
- 千问、DeepSeek、MiniMax 三种 OpenAI 兼容 AI 提供商
- 摘要原句证据校验，区分索引事实、AI 候选和人工确认
- D1 持久化个人图谱、节点位置、关系修改、删除屏蔽与研究笔记
- 右侧信息栏记录摘要、实验结构、代码、数据集和私人笔记
- 聚焦、筛选、回退、重置视图与 JSON 导出

项目代码位于 [`paper/`](paper/README.md)。

```bash
cd paper
npm install
cp .env.example .env
npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
npm run dev
```

密钥只保存在本地 `.env` 或部署平台 Secret 中，不会提交到仓库或发送给浏览器。
