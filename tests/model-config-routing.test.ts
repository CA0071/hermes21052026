import { describe, expect, it } from "vitest";

describe("model configuration routing", () => {
  function setModelConfigContent(
    initial: string,
    provider: string,
    model: string,
    baseUrl: string,
  ): string {
    let content = initial;

    const replaceInModelBlock = (key: string, value: string): void => {
      const modelMatch = content.match(/^model:\s*\n((?:[ \t]+.*(?:\n|$))*)/m);
      if (!modelMatch) {
        content = `model:\n  ${key}: "${value}"\n` + content;
        return;
      }
      const block = modelMatch[1];
      const keyRegex = new RegExp(`^(\\s*${key}:\\s*)["\\\']?[^"\\\'\\n#]*["\\\']?`, "m");
      let nextBlock: string;
      if (keyRegex.test(block)) {
        nextBlock = block.replace(keyRegex, `$1"${value}"`);
      } else {
        nextBlock = `  ${key}: "${value}"\n` + block;
      }
      content = content.slice(0, modelMatch.index! + "model:\n".length) + nextBlock + content.slice(modelMatch.index! + modelMatch[0].length);
    };

    replaceInModelBlock("provider", provider);
    replaceInModelBlock("default", model);
    replaceInModelBlock("base_url", baseUrl);

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (
        /^\s*enabled:\s*(true|false)/.test(lines[i]) &&
        i > 0 &&
        /smart_model_routing/.test(lines[i - 1])
      ) {
        lines[i] = lines[i].replace(/(enabled:\s*)(true|false)/, "$1false");
      }
    }
    content = lines.join("\n");

    const streamingRegex = /^(\s*streaming:\s*)(\S+)/m;
    if (streamingRegex.test(content)) {
      content = content.replace(streamingRegex, "$1true");
    }

    return content;
  }



  function readProfileConfigContent(content: string): { model: string; provider: string } {
    const modelBlock = content.match(/^model:\s*\n((?:[ \t]+.+\n?)*)/m)?.[1] || "";
    const modelMatch = modelBlock.match(/^\s*default:\s*["']?([^"'\n#]+)["']?/m);
    const providerMatch = modelBlock.match(/^\s*provider:\s*["']?([^"'\n#]+)["']?/m);
    return {
      model: modelMatch ? modelMatch[1].trim() : "",
      provider: providerMatch ? providerMatch[1].trim() : "auto",
    };
  }

  function isActiveModel(
    active: { provider: string; model: string; baseUrl: string },
    candidate: { provider: string; model: string; baseUrl?: string },
  ): boolean {
    return (
      active.provider === candidate.provider &&
      active.model === candidate.model &&
      (active.baseUrl || "") === (candidate.baseUrl || "")
    );
  }

  it("writes provider, model, baseUrl and disables smart routing", () => {
    const initial = `model:
  provider: "auto"
  default: "old-model"
  base_url: "https://old.example/v1"
smart_model_routing:
  enabled: true
streaming: false
`;

    const updated = setModelConfigContent(
      initial,
      "custom",
      "qwen-plus",
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    );

    expect(updated).toContain('provider: "custom"');
    expect(updated).toContain('default: "qwen-plus"');
    expect(updated).toContain(
      'base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1"',
    );
    expect(updated).toContain("enabled: false");
    expect(updated).toContain("streaming: true");
  });


  it("inserts model config when config has provider/default keys nested under model", () => {
    const initial = `model:
  provider: auto
  default: ""
  fallback: true
`;

    const updated = setModelConfigContent(
      initial,
      "custom",
      "deepseek-chat",
      "https://api.deepseek.com/v1",
    );

    expect(updated).toContain('provider: "custom"');
    expect(updated).toContain('default: "deepseek-chat"');
    expect(updated).toContain('base_url: "https://api.deepseek.com/v1"');
  });

  it("does not treat unrelated top-level defaults as the active model", () => {
    const initial = `defaults:
  timeout: 60
model:
  provider: auto
  default: ""
`;

    const updated = setModelConfigContent(
      initial,
      "custom",
      "qwen-plus",
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    );

    expect(updated).toContain('provider: "custom"');
    expect(updated).toContain('default: "qwen-plus"');
    expect(updated).toContain(
      'base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1"',
    );
  });


  it("reads model/provider from the model block, not from unrelated providers", () => {
    const config = `memory:
  provider: sqlite
model:
  provider: custom
  default: "deepseek-chat"
  base_url: "https://api.deepseek.com/v1"
`;

    expect(readProfileConfigContent(config)).toEqual({
      provider: "custom",
      model: "deepseek-chat",
    });
  });

  it("reports no model when the model block is still auto/empty", () => {
    const config = `provider: sqlite
model:
  provider: auto
  default: ""
`;

    expect(readProfileConfigContent(config)).toEqual({
      provider: "auto",
      model: "",
    });
  });

  it("only marks exact provider/model/baseUrl candidates as active", () => {
    const active = {
      provider: "custom",
      model: "gpt-4o-mini",
      baseUrl: "https://relay.example/v1",
    };

    expect(isActiveModel(active, { ...active })).toBe(true);
    expect(
      isActiveModel(active, {
        provider: "custom",
        model: "gpt-4o-mini",
        baseUrl: "https://api.openai.com/v1",
      }),
    ).toBe(false);
  });
});
