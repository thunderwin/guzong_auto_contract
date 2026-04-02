import { NextResponse } from "next/server";
import { requestProxyCompletion } from "@/lib/contract/ai-client";
import { parseJsonFromModelOutput } from "@/lib/contract/json";
import { buildExtractMessages } from "@/lib/contract/prompts";
import { extractRequestSchema, extractedContractSchema } from "@/lib/contract/schemas";

export const maxDuration = 60;

function getFirstIssueMessage(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    if (issues?.[0]?.message) {
      return issues[0].message;
    }
  }
  return "请求参数不正确";
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON" }, { status: 400 });
  }

  const parsedRequest = extractRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: getFirstIssueMessage(parsedRequest.error) },
      { status: 400 }
    );
  }

  try {
    const { system, user } = buildExtractMessages(parsedRequest.data);
    const rawResult = await requestProxyCompletion({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      maxTokens: 1_800,
    });

    const json = parseJsonFromModelOutput(rawResult);
    const parsedResult = extractedContractSchema.safeParse(json);

    if (!parsedResult.success) {
      return NextResponse.json(
        {
          error: "模型输出格式不符合约定，请重试",
          rawResult,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ data: parsedResult.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "提取失败，请稍后重试";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
