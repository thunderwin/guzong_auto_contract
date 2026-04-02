import { NextResponse } from "next/server";
import { requestProxyCompletion } from "@/lib/contract/ai-client";
import { buildGenerateMessages } from "@/lib/contract/prompts";
import { generateRequestSchema } from "@/lib/contract/schemas";

export const maxDuration = 60;

function normalizeContractMarkdown(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown)?\s*([\s\S]*?)```$/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return trimmed;
}

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

  const parsedRequest = generateRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: getFirstIssueMessage(parsedRequest.error) },
      { status: 400 }
    );
  }

  try {
    const { system, user } = buildGenerateMessages(parsedRequest.data);
    const rawResult = await requestProxyCompletion({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      maxTokens: 3_500,
    });

    const contractMarkdown = normalizeContractMarkdown(rawResult);

    if (!contractMarkdown) {
      return NextResponse.json(
        { error: "模型未返回合同内容" },
        { status: 502 }
      );
    }

    return NextResponse.json({ contractMarkdown });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "合同生成失败，请稍后重试";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
