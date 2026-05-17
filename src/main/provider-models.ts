export interface AvailableModel {
  id: string;
  name: string;
}

interface OpenAiModelsResponse {
  data?: Array<{
    id?: string;
  }>;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export async function fetchAvailableModels(
  baseUrl: string,
  apiKey?: string,
): Promise<AvailableModel[]> {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error("Base URL is required");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const response = await fetch(`${normalized}/models`, { headers });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Model list request failed (${response.status}${details ? `: ${details.slice(0, 160)}` : ""})`,
    );
  }

  const payload = (await response.json()) as OpenAiModelsResponse;
  const seen = new Set<string>();
  const models = (payload.data || [])
    .map((entry) => entry.id?.trim() || "")
    .filter((id) => Boolean(id) && !seen.has(id) && seen.add(id))
    .map((id) => ({
      id,
      name: id.split("/").pop() || id,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return models;
}
