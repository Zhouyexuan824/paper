declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    OPENALEX_API_KEY?: string;
    SEMANTIC_SCHOLAR_API_KEY?: string;
    MINIMAX_API_KEY?: string;
    MINIMAX_BASE_URL?: string;
    MINIMAX_MODEL?: string;
    DASHSCOPE_API_KEY?: string;
    QWEN_API_KEY?: string;
    QWEN_BASE_URL?: string;
    QWEN_MODEL?: string;
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_BASE_URL?: string;
    DEEPSEEK_MODEL?: string;
  }
}
