import type { ExtractedContract } from "./schemas";

export function buildExtractMessages(params: {
  transcript: string;
  contractType?: string;
  extraRequirements?: string;
}) {
  const system = [
    "你是中文合同条款抽取助手。",
    "任务是从谈话内容中提取双方已经明确达成的一致条件，并识别缺失条款。",
    "只能输出 JSON，不要输出 Markdown，不要输出解释。",
    "如果信息不明确，宁可写入 missingItems，也不要臆造事实。",
  ].join("\n");

  const user = [
    `合同类型偏好：${params.contractType || "未指定"}`,
    `额外要求：${params.extraRequirements || "无"}`,
    "请按以下 JSON 结构输出（字段名必须一致）：",
    "{",
    '  "contractType": "string",',
    '  "contractTitle": "string",',
    '  "parties": ["string", "string"],',
    '  "agreedTerms": [{ "item": "string", "detail": "string" }],',
    '  "cautions": ["string"],',
    '  "missingItems": ["string"]',
    "}",
    "谈话内容如下：",
    params.transcript,
  ].join("\n\n");

  return {
    system,
    user,
  };
}

export function buildGenerateMessages(params: {
  transcript: string;
  contractType?: string;
  extraRequirements?: string;
  extracted?: ExtractedContract;
}) {
  const system = [
    "你是中文合同起草助手。",
    "你需要输出可签署的中文简版合同草案，条款清晰、简洁、可执行。",
    "优先用通俗表达，避免堆砌法律术语和冗长句式。",
    "如缺失关键信息，请使用“【待补充:字段名称】”格式，不要只写“【待补充】”。",
    "字段名称要具体可填写，例如：‘终止通知天数’、‘违约金比例’、‘付款账户’。",
    "除非用户明确要求，不要主动生成身份证号、统一社会信用代码、注册地址、联系电话等细项。",
    "待补充字段尽量少而关键，优先复用：甲方主体信息、乙方主体信息、合作内容、合作期限、金额或分成、付款安排、签订日期、签订地点、违约金标准、争议解决地。",
    "输出内容必须是合同正文，不要输出解释。",
  ].join("\n");

  const extractionText = params.extracted
    ? JSON.stringify(params.extracted, null, 2)
    : "无结构化提取结果，请直接根据谈话内容起草。";

  const user = [
    `合同类型偏好：${params.contractType || "未指定"}`,
    `额外要求：${params.extraRequirements || "无"}`,
    "结构化提取结果：",
    extractionText,
    "谈话内容：",
    params.transcript,
    "请输出“简版合同”，控制在 6~8 个一级条款，建议结构：",
    "1. 合同主体",
    "2. 合作内容",
    "3. 金额/分成与付款安排",
    "4. 合作期限与双方义务",
    "5. 违约责任与终止",
    "6. 争议解决与生效",
    "7. 签署信息（签订日期、签订地点、签章位）",
    "每个条款尽量 1~3 句，能短则短。",
    "若有缺失信息，严格使用格式：【待补充:字段名称】",
  ].join("\n\n");

  return {
    system,
    user,
  };
}

export function buildCheckMessages(params: {
  contractMarkdown: string;
  extracted?: ExtractedContract;
}) {
  const system = [
    "你是中文合同审阅助手。",
    "请从完整性、明确性、可执行性、争议处理四个维度给出审阅结果。",
    "输出必须是 JSON，不要输出 Markdown 或解释。",
    "如果不确定，请给出保守风险结论。",
  ].join("\n");

  const extractionText = params.extracted
    ? JSON.stringify(params.extracted, null, 2)
    : "无";

  const user = [
    "请按以下 JSON 结构输出（字段名必须一致）：",
    "{",
    '  "overallRiskLevel": "低|中|高",',
    '  "missingClauses": ["string"],',
    '  "ambiguousClauses": ["string"],',
    '  "complianceNotes": ["string"],',
    '  "suggestedRevisions": ["string"]',
    "}",
    "结构化提取结果：",
    extractionText,
    "合同草案：",
    params.contractMarkdown,
  ].join("\n\n");

  return {
    system,
    user,
  };
}
