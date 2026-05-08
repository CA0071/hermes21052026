import { describe, expect, it } from "vitest";

describe("model configuration routing", () => {
  function setModelConfigContent(
    initial: string,
    provider: string,
    model: string,
    baseUrl: string,
  ): string {
    let content = initial;

    const providerRegex = /^(\s*provider:\s*)["']?[^"'\n#]*["']?/m;
    if (providerRegex.test(content)) {
      content = content.replace(providerRegex, `$1"${provider}"`);
    } else {
      content = content.replace(/^(\s*model:\s*\n)/m, `$1  provider: "${provider}"\n`);
    }

    const modelRegex = /^(\s*default:\s*)["']?[^"'\n#]*["']?/m;
    if (modelRegex.test(content)) {
      content = content.replace(modelRegex, `$1"${model}"`);
    } else {
      content = content.replace(/^(\s*model:\s*\n)/m, `$1  default: "${model}"\n`);
    }

    const baseUrlRegex = /^(\s*base_url:\s*)["']?[^"'\n#]*["']?/m;
    if (baseUrlRegex.test(content)) {
      content = content.replace(baseUrlRegex, `$1"${baseUrl}"`);
    } else {
      content = content.replace(/^(\s*model:\s*\n)/m, `$1  base_url: "${baseUrl}"\n`);
    }

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
