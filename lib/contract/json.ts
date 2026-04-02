function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return text.trim();
}

export function parseJsonFromModelOutput(text: string): unknown {
  const cleanText = stripCodeFence(text);

  try {
    return JSON.parse(cleanText);
  } catch {
    const first = cleanText.indexOf("{");
    const last = cleanText.lastIndexOf("}");

    if (first < 0 || last <= first) {
      throw new Error("模型未返回有效 JSON");
    }

    const maybeJson = cleanText.slice(first, last + 1);
    return JSON.parse(maybeJson);
  }
}
