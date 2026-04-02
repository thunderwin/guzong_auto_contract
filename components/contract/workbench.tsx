"use client";

import { useEffect, useMemo, useState } from "react";

type ApiError = {
  error?: string;
};

type GenerateResponse = {
  contractMarkdown: string;
};

type PersistedState = {
  contractType: string;
  transcript: string;
  extraRequirements: string;
  contractTemplate: string;
  placeholderValues: Record<string, string>;
};

type PlaceholderField = {
  label: string;
  token: string;
  count: number;
};

const STORAGE_KEY = "contract-assistant-state-v3";
const DEFAULT_CONTRACT_TYPE = "合作协议";
const CORE_PLACEHOLDER_LABELS = [
  "甲方主体信息",
  "乙方主体信息",
  "合作内容",
  "合作期限",
  "金额或分成",
  "付款安排",
  "违约金标准",
  "争议解决地",
  "签订日期",
  "签订地点",
];

const CONTRACT_TYPES = [
  "合作协议",
  "服务合同",
  "采购合同",
  "销售合同",
  "劳动合同",
  "租赁合同",
  "其他",
];

const DEMO_TRANSCRIPT = `甲方：深圳星辰科技有限公司；乙方：广州云桥信息技术有限公司。
甲方委托乙方开发企业官网和客户管理系统，开发周期 45 天。
项目总价人民币 120000 元，分三期付款：签约后 30%、原型确认后 40%、验收后 30%。
乙方需在 2026 年 6 月 30 日前完成交付，甲方收到后 7 日内完成验收反馈。
如乙方延期，每延期 1 天按合同总额 0.3% 支付违约金，累计不超过合同总额 10%。
双方对项目资料和客户数据负有保密义务，保密期限为合同终止后 3 年。
争议提交深圳国际仲裁院仲裁。`;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试";
}

async function postJSON<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = (await response.json().catch(() => null)) as T & ApiError;

  if (response.ok === false) {
    throw new Error(json?.error || `请求失败（${response.status}）`);
  }

  return json;
}

function escapeHtml(content: string): string {
  return content
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function restoreTokensFromRendered(
  text: string,
  values: Record<string, string>
): string {
  let restored = text;
  const entries = Object.entries(values)
    .map(([label, value]) => [label, value.trim()] as const)
    .filter(([, value]) => value.length > 0)
    .sort((a, b) => b[1].length - a[1].length);

  for (const [label, value] of entries) {
    const token = `【待补充:${label}】`;
    restored = restored.replace(new RegExp(escapeRegExp(value), "g"), token);
  }

  return restored;
}

function canonicalizePlaceholderLabel(rawLabel: string): string {
  const label = rawLabel.replace(/\s+/g, "").trim();

  if (label.length === 0) {
    return label;
  }

  if (
    label.includes("甲方") &&
    /(姓名|名称|主体|身份|信用|地址|住所|电话|联系人|证件)/.test(label)
  ) {
    return "甲方主体信息";
  }

  if (
    label.includes("乙方") &&
    /(姓名|名称|主体|身份|信用|地址|住所|电话|联系人|证件)/.test(label)
  ) {
    return "乙方主体信息";
  }

  if (/(合作内容|项目|服务|标的|事项)/.test(label)) {
    return "合作内容";
  }

  if (/(合作期限|期限|合作期)/.test(label)) {
    return "合作期限";
  }

  if (/(价款|金额|总价|费用|投资|出资|分成|比例)/.test(label)) {
    return "金额或分成";
  }

  if (/(付款|支付|结算|账期|打款)/.test(label)) {
    return "付款安排";
  }

  if (/(违约|赔偿|违约金)/.test(label)) {
    return "违约金标准";
  }

  if (/(争议|仲裁|法院|管辖)/.test(label)) {
    return "争议解决地";
  }

  if (/(签订日期|签署日期|日期)/.test(label)) {
    return "签订日期";
  }

  if (/(签订地点|签署地点|地点)/.test(label)) {
    return "签订地点";
  }

  return rawLabel.trim();
}

function normalizePlaceholderTokens(text: string): string {
  let counter = 1;
  const takeDefaultLabel = () => {
    const label =
      CORE_PLACEHOLDER_LABELS[counter - 1] ??
      `字段${counter - CORE_PLACEHOLDER_LABELS.length}`;
    counter += 1;
    return label;
  };

  const normalizedNamed = text.replace(
    /【待补充[:：]\s*([^】]+)】/g,
    (_, rawLabel: string) => {
      const label = canonicalizePlaceholderLabel(rawLabel);
      if (label.length === 0) {
        return `【待补充:${takeDefaultLabel()}】`;
      }
      return `【待补充:${label}】`;
    }
  );

  return normalizedNamed.replace(/【待补充】/g, () => {
    return `【待补充:${takeDefaultLabel()}】`;
  });
}

function extractPlaceholderFields(template: string): PlaceholderField[] {
  const regex = /【待补充:([^】]+)】/g;
  const counts = new Map<string, number>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    const label = match[1]?.trim();
    if (!label) {
      continue;
    }

    counts.set(label, (counts.get(label) || 0) + 1);
  }

  const priority = new Map(
    CORE_PLACEHOLDER_LABELS.map((label, index) => [label, index])
  );

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      token: `【待补充:${label}】`,
      count,
    }))
    .sort((a, b) => {
      const aPriority = priority.get(a.label) ?? Number.MAX_SAFE_INTEGER;
      const bPriority = priority.get(b.label) ?? Number.MAX_SAFE_INTEGER;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      return a.label.localeCompare(b.label, "zh-Hans-CN");
    });
}

function applyPlaceholderValues(
  template: string,
  values: Record<string, string>
): string {
  let output = template;

  for (const [label, value] of Object.entries(values)) {
    const resolved = value.trim();
    if (resolved.length === 0) {
      continue;
    }

    const token = `【待补充:${label}】`;
    output = output.split(token).join(resolved);
  }

  return output;
}

export function ContractWorkbench() {
  const [contractType, setContractType] = useState<string>(
    DEFAULT_CONTRACT_TYPE
  );
  const [transcript, setTranscript] = useState<string>("");
  const [extraRequirements, setExtraRequirements] = useState<string>("");
  const [contractTemplate, setContractTemplate] = useState<string>("");
  const [placeholderValues, setPlaceholderValues] = useState<
    Record<string, string>
  >({});
  const [showAllFields, setShowAllFields] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>("");

  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) {
      return;
    }

    try {
      const parsed = JSON.parse(cached) as PersistedState;
      setContractType(parsed.contractType || DEFAULT_CONTRACT_TYPE);
      setTranscript(parsed.transcript || "");
      setExtraRequirements(parsed.extraRequirements || "");
      setContractTemplate(normalizePlaceholderTokens(parsed.contractTemplate || ""));
      setPlaceholderValues(parsed.placeholderValues || {});
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const data: PersistedState = {
      contractType,
      transcript,
      extraRequirements,
      contractTemplate,
      placeholderValues,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [
    contractType,
    transcript,
    extraRequirements,
    contractTemplate,
    placeholderValues,
  ]);

  const placeholderFields = useMemo(
    () => extractPlaceholderFields(contractTemplate),
    [contractTemplate]
  );
  const visiblePlaceholderFields = useMemo(
    () =>
      showAllFields ? placeholderFields : placeholderFields.slice(0, 10),
    [placeholderFields, showAllFields]
  );

  const renderedContract = useMemo(
    () => applyPlaceholderValues(contractTemplate, placeholderValues),
    [contractTemplate, placeholderValues]
  );

  const canGenerate = transcript.trim().length >= 20 && isGenerating === false;
  const canExport = renderedContract.trim().length > 0;

  async function handleGenerate() {
    setErrorText("");
    setIsGenerating(true);

    try {
      const response = await postJSON<GenerateResponse>(
        "/api/contract/generate",
        {
          transcript,
          contractType,
          extraRequirements,
        }
      );

      setContractTemplate(normalizePlaceholderTokens(response.contractMarkdown));
      setPlaceholderValues({});
      setShowAllFields(false);
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  }

  function handleNormalizePlaceholders() {
    setContractTemplate((prev) => normalizePlaceholderTokens(prev));
  }

  function handleFillDemo() {
    setTranscript(DEMO_TRANSCRIPT);
    setErrorText("");
  }

  function handleClearAll() {
    setContractType(DEFAULT_CONTRACT_TYPE);
    setTranscript("");
    setExtraRequirements("");
    setContractTemplate("");
    setPlaceholderValues({});
    setShowAllFields(false);
    setErrorText("");
    localStorage.removeItem(STORAGE_KEY);
  }

  function handlePlaceholderValueChange(label: string, value: string) {
    setPlaceholderValues((prev) => ({
      ...prev,
      [label]: value,
    }));
  }

  function handleExportMarkdown() {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")}`;

    downloadTextFile(
      `合同草案-${stamp}.md`,
      renderedContract,
      "text/markdown;charset=utf-8"
    );
  }

  function handleExportTxt() {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")}`;

    downloadTextFile(
      `合同草案-${stamp}.txt`,
      renderedContract,
      "text/plain;charset=utf-8"
    );
  }

  function handlePrint() {
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>合同草案打印</title>
<style>
body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; padding: 32px; line-height: 1.8; color: #111827; }
pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; }
</style>
</head>
<body>
<pre>${escapeHtml(renderedContract)}</pre>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow === null) {
      setErrorText("浏览器拦截了打印窗口，请允许弹窗后重试");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <main className="min-h-dvh bg-[#f5f0df] px-4 py-8 text-zinc-900 md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border border-zinc-300 bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-center gap-3">
            <img
              src="/logo-guzong.svg"
              alt="顾总合同专家"
              className="h-12 w-12 rounded-xl border border-zinc-200"
            />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                顾总合同专家
              </h1>
            </div>
          </div>

        
          <p className="mt-2 text-xs font-medium text-red-700">
            法律提示：AI 输出为合同草案，不构成法律意见。正式签署前请由执业律师复核。
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <label className="text-sm font-semibold text-zinc-800">合同类型</label>
              <select
                value={contractType}
                onChange={(event) => setContractType(event.target.value)}
                className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900"
              >
                {CONTRACT_TYPES.map((type) => (
                  <option value={type} key={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <label className="mb-2 block text-sm font-semibold text-zinc-800">
              谈话记录（至少 20 字）
            </label>
            <textarea
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="粘贴双方聊天记录、会议纪要或语音转写内容..."
              className="h-64 w-full resize-y rounded-xl border border-zinc-400 bg-white px-4 py-3 text-sm leading-6 text-zinc-900 placeholder:text-zinc-400"
            />

            <label className="mb-2 mt-4 block text-sm font-semibold text-zinc-800">
              额外要求（可选）
            </label>
            <textarea
              value={extraRequirements}
              onChange={(event) => setExtraRequirements(event.target.value)}
              placeholder="例如：必须约定发票类型、验收标准、知识产权归属..."
              className="h-28 w-full resize-y rounded-xl border border-zinc-400 bg-white px-4 py-3 text-sm leading-6 text-zinc-900 placeholder:text-zinc-400"
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={canGenerate === false}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {isGenerating ? "正在生成合同..." : "生成合同"}
              </button>
              <button
                type="button"
                onClick={handleFillDemo}
                className="rounded-xl border border-zinc-400 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                填充示例谈话
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="rounded-xl border border-zinc-400 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                清空并重置
              </button>
            </div>

            {errorText ? (
              <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {errorText}
              </p>
            ) : null}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-900">待补充字段表单</h2>
                <button
                  type="button"
                  onClick={handleNormalizePlaceholders}
                  className="rounded-lg border border-zinc-400 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  重新整理字段
                </button>
              </div>

              {placeholderFields.length === 0 ? (
                <p className="text-sm text-zinc-600">
                  暂未检测到“待补充”字段。若合同里还有“【待补充】”，可点击“重新整理字段”。
                </p>
              ) : (
                <div className="space-y-3">
                  {visiblePlaceholderFields.map((field) => (
                    <div key={field.label} className="space-y-1">
                      <label className="block text-xs font-semibold text-zinc-700">
                        {field.label}
                        <span className="ml-2 text-zinc-500">出现 {field.count} 次</span>
                      </label>
                      <input
                        value={placeholderValues[field.label] || ""}
                        onChange={(event) =>
                          handlePlaceholderValueChange(field.label, event.target.value)
                        }
                        placeholder={`填写 ${field.label}`}
                        className="w-full rounded-lg border border-zinc-400 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                      />
                    </div>
                  ))}
                  {placeholderFields.length > 10 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllFields((prev) => !prev)}
                      className="rounded-lg border border-zinc-400 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                    >
                      {showAllFields
                        ? "只显示核心字段"
                        : `显示全部字段（共 ${placeholderFields.length} 项）`}
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold text-zinc-900">
                合同编辑器（实时替换）
              </h2>
              <textarea
                value={renderedContract}
                onChange={(event) =>
                  setContractTemplate(
                    restoreTokensFromRendered(
                      event.target.value,
                      placeholderValues
                    )
                  )
                }
                placeholder="点击“生成合同”后自动填充..."
                className="h-72 w-full resize-y rounded-xl border border-zinc-400 bg-white px-4 py-3 font-mono text-sm leading-7 text-zinc-900 placeholder:text-zinc-400"
              />

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportMarkdown}
                  disabled={canExport === false}
                  className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  导出 Markdown
                </button>
                <button
                  type="button"
                  onClick={handleExportTxt}
                  disabled={canExport === false}
                  className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  导出 TXT
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={canExport === false}
                  className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  打印 / 另存 PDF
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
