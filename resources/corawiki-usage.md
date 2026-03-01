# CoraWiki 使用说明

## 模块目的

CoraWiki 利用 AI 对整个工作区目录进行**图谱化理解**，生成结构化的架构分析报告。

* **面向新人**：帮助快速建立对项目的结构化认知，减少上手成本。

* **面向 AI**：为 Cursor 等 AI 编程提供更清晰的代码结构上下文，便于生成更贴合的答案与建议。

***

## 如何使用

1. **开始分析**：在 CoraWiki 视图右上角点击「开始分析当前工作区架构」，等待分析完成。
2. **查看报告**：报告列表会出现在同一视图中，点击报告标题即可打开；最新报告会标注「最新」。
3. **跳转引用**：报告中出现的文件路径可点击，直接跳转到对应代码位置，便于人与 AI 对照阅读。
4. **自定义研究**：也可使用「启动 CoraWiki 研究」输入自定义问题（如「订单创建到落库的完整链路」），生成针对性报告。

***

## 如何配置

在 VS Code/Cursor 中打开 **设置**，搜索 `Cora` 或 `coraWiki`，在 **Cora > Cora Wiki** 下可配置：

| 配置项                   | 说明                                                      |
| --------------------- | ------------------------------------------------------- |
| **Api Key Env Name**  | 存放 API Key 的环境变量名（如 `OPENAI_API_KEY`、`MINIMAX_API_KEY`） |
| **Base Url**          | 模型接口的 Base URL（按所选提供商填写）                                |
| **Provider**          | 模型提供商：openai、kimi、openrouter、minimax 等                  |
| **Model**             | 使用的模型名称                                                 |
| **Max Steps**         | 单次研究的最大步骤数                                              |
| **Max Total Tokens**  | 单次研究最大 token 上限，超限后提前收敛                                 |
| **Include / Exclude** | 扫描白名单、黑名单路径（留空则按默认排除 node\_modules、.git 等）              |
| **Python 工具**         | 是否启用 Python 依赖/复杂度分析（可选，无 Python 时可跳过）                  |

**支持的模型与 API Key**：CoraWiki 支持 **OpenAI**、**Minimax**、**Kimi**、**OpenRouter** 等提供商。在设置中选定 Provider 和 Model 后，将 **Api Key Env Name** 填为对应的环境变量名，并在本机配置该环境变量即可：

* **Minimax**：在 [MiniMax 开放平台](https://platform.minimaxi.com/) 获取 API Key，环境变量名可设为 `MINIMAX_API_KEY`，Base Url 一般为 `https://api.minimaxi.com/anthropic`。

* **Kimi**：在 [月之暗面 / Kimi](https://platform.moonshot.cn/) 获取 API Key（Coding/开发相关 Key 即可），环境变量名可设为 `KIMI_API_KEY` 或 `MOONSHOT_API_KEY`，按平台文档配置 Base Url。

确保本机已设置对应环境变量，扩展会读取后调用接口。

***

## 问题反馈与共建

Cora 是**开源项目**，欢迎一起共建。若使用中遇到问题或有建议：

* 请到 GitHub 提交 Issue：<https://github.com/jqlong17/cora>

* 欢迎提 PR、参与讨论与改进。
