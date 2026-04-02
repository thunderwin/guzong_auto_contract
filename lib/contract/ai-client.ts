type ProxyMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CompletionParams = {
  messages: ProxyMessage[];
  temperature?: number;
  maxTokens?: number;
};

function resolveCompletionUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  const pathname = parsed.pathname.replace(/\/+$/, "");

  if (pathname.endsWith("/chat/completions")) {
    return parsed.toString();
  }

  // If users accidentally point to image generation endpoints, normalize back to chat completions.
  if (pathname.includes("/images/generations")) {
    parsed.pathname = "/v1/chat/completions";
    return parsed.toString();
  }

  if (pathname === "" || pathname === "/") {
    parsed.pathname = "/v1/chat/completions";
    return parsed.toString();
  }

  if (pathname.endsWith("/v1")) {
    parsed.pathname = `${pathname}/chat/completions`;
    return parsed.toString();
  }

  if (pathname.includes("/v1/")) {
    parsed.pathname = "/v1/chat/completions";
    return parsed.toString();
  }

  parsed.pathname = `${pathname}/v1/chat/completions`;
  return parsed.toString();
}

function parseTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const merged = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .join("\n")
      .trim();

    return merged;
  }

  return "";
}

export async function requestProxyCompletion({
  messages,
  temperature = 0.2,
  maxTokens = 3_000,
}: CompletionParams): Promise<string> {
  const baseUrl = process.env.AI_PROXY_BASE_URL;
  const apiKey = process.env.AI_PROXY_API_KEY;
  const model = process.env.AI_PROXY_MODEL;

  if (!baseUrl || !apiKey || !model) {
    throw new Error(
      "缺少 AI_PROXY_BASE_URL / AI_PROXY_API_KEY / AI_PROXY_MODEL 环境变量"
    );
  }

  const timeoutMs = Number.parseInt(process.env.AI_TIMEOUT_MS ?? "30000", 10);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let completionUrl: string;

  try {
    completionUrl = resolveCompletionUrl(baseUrl);
  } catch {
    throw new Error(
      "AI_PROXY_BASE_URL 配置格式不正确，示例：https://your-proxy.example.com/v1"
    );
  }

  try {
    const response = await fetch(completionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        payload.error &&
        typeof payload.error === "object" &&
        "message" in payload.error &&
        typeof payload.error.message === "string"
          ? payload.error.message
          : `请求失败，状态码 ${response.status}`;

      throw new Error(errorMessage);
    }

    const content =
      payload &&
      typeof payload === "object" &&
      "choices" in payload &&
      Array.isArray(payload.choices) &&
      payload.choices[0] &&
      typeof payload.choices[0] === "object" &&
      "message" in payload.choices[0] &&
      payload.choices[0].message &&
      typeof payload.choices[0].message === "object" &&
      "content" in payload.choices[0].message
        ? payload.choices[0].message.content
        : "";

    const text = parseTextContent(content);

    if (!text) {
      throw new Error("模型返回为空，请稍后重试");
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`请求超时（>${timeoutMs}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
