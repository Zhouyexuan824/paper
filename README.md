# paper
一个本地运行的论文研究网页。输入论文标题后，会从 OpenAlex 搜索论文元数据、参考文献和引用它的论文，再由 DeepSeek 筛选 baseline、重要后续工作并整理 GitHub 代码候选。

## 启动

1. 安装 Node.js 20 或更新版本。
2. 编辑 `.env.local`，保留已有的 `DEEPSEEK_API_KEY`，并添加 `OPENALEX_API_KEY=你的OpenAlex密钥`。可在 [OpenAlex API 设置页](https://openalex.org/settings/api) 获取免费 key；如果匿名检索额度尚未用完，OpenAlex key 可暂时不填。
3. 在项目目录运行 `npm start`。
4. 打开 `http://localhost:3000`。

`.env.local` 只由本机 Node 服务读取，并且已加入 Git 忽略规则。可通过 `DEEPSEEK_MODEL` 和 `PORT` 修改模型和端口。默认模型为 `deepseek-v4-pro`。

## 数据与局限

- OpenAlex 提供论文元数据、参考文献与引用关系；免费 API key 可提升匿名查询额度。
- DeepSeek 根据题名、摘要和引用候选归纳关系。仅凭引用数据不能证明一篇后续论文把目标论文当作 baseline，页面会提示回到论文全文核实。
- GitHub 搜索结果属于候选仓库。只有原文或作者页面能确认归属时，才应视为官方实现。
- 论文来源查询结果会在服务进程内缓存 6 小时，以减少重复请求。
- DeepSeek API 调用会产生相应的账户用量/费用。
