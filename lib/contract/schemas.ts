import { z } from "zod";

export const contractTermSchema = z.object({
  item: z.string().min(1, "条款名称不能为空"),
  detail: z.string().min(1, "条款内容不能为空"),
});

export const extractedContractSchema = z.object({
  contractType: z.string().min(1, "合同类型不能为空"),
  contractTitle: z.string().min(1, "合同标题不能为空"),
  parties: z.array(z.string().min(1)).min(2, "至少需要双方主体"),
  agreedTerms: z.array(contractTermSchema).min(3, "至少需要 3 条已达成条款"),
  cautions: z.array(z.string()).default([]),
  missingItems: z.array(z.string()).default([]),
});

export type ExtractedContract = z.infer<typeof extractedContractSchema>;

export const extractRequestSchema = z.object({
  transcript: z
    .string()
    .trim()
    .min(20, "谈话内容至少 20 字")
    .max(30_000, "谈话内容过长，请拆分后再提交"),
  contractType: z.string().trim().max(64).optional(),
  extraRequirements: z.string().trim().max(2_000).optional(),
});

export const generateRequestSchema = z.object({
  transcript: z
    .string()
    .trim()
    .min(20, "谈话内容至少 20 字")
    .max(30_000, "谈话内容过长，请拆分后再提交"),
  contractType: z.string().trim().max(64).optional(),
  extraRequirements: z.string().trim().max(2_000).optional(),
  extracted: extractedContractSchema.optional(),
});

export const contractCheckSchema = z.object({
  overallRiskLevel: z.enum(["低", "中", "高"]),
  missingClauses: z.array(z.string()).default([]),
  ambiguousClauses: z.array(z.string()).default([]),
  complianceNotes: z.array(z.string()).default([]),
  suggestedRevisions: z.array(z.string()).default([]),
});

export type ContractCheckResult = z.infer<typeof contractCheckSchema>;

export const checkRequestSchema = z.object({
  contractMarkdown: z
    .string()
    .trim()
    .min(60, "合同文本过短，请先生成完整草案")
    .max(60_000, "合同文本过长，请拆分后再检查"),
  extracted: extractedContractSchema.optional(),
});
