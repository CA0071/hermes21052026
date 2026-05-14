import http from "http";
import { readMemory, addMemoryEntry, updateMemoryEntry, removeMemoryEntry, writeUserProfile } from "./memory";
import { readSoul, writeSoul, resetSoul } from "./soul";
import { getToolsets, setToolsetEnabled } from "./tools";
import { listInstalledSkills, listBundledSkills, getSkillContent, installSkill, uninstallSkill } from "./skills";
import { listSessions, getSessionMessages, searchSessions } from "./sessions";
import { syncSessionCache, listCachedSessions, updateSessionTitle } from "./session-cache";
import { listProfiles, createProfile, deleteProfile, setActiveProfile } from "./profiles";
import { listCronJobs, createCronJob, removeCronJob, pauseCronJob, resumeCronJob, triggerCronJob } from "./cronjobs";
import {
  readEnv, setEnvValue, getConfigValue, setConfigValue, getHermesHome,
  getModelConfig, setModelConfig, getPlatformEnabled, setPlatformEnabled,
  getAutoConnect, setAutoConnect,
} from "./config";
import { listModels, addModel, removeModel, updateModel } from "./models";
import { listMcpServers } from "./installer";

export const MANAGE_PORT = 8643;

type P = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const METHODS: Record<string, (p: P) => any> = {
  // Memory
  readMemory:        ({ profile }) => readMemory(profile as string | undefined),
  addMemoryEntry:    ({ content, profile }) => addMemoryEntry(content as string, profile as string | undefined),
  updateMemoryEntry: ({ index, content, profile }) => updateMemoryEntry(index as number, content as string, profile as string | undefined),
  removeMemoryEntry: ({ index, profile }) => removeMemoryEntry(index as number, profile as string | undefined),
  writeUserProfile:  ({ content, profile }) => writeUserProfile(content as string, profile as string | undefined),

  // Soul
  readSoul:  ({ profile }) => readSoul(profile as string | undefined),
  writeSoul: ({ content, profile }) => writeSoul(content as string, profile as string | undefined),
  resetSoul: ({ profile }) => resetSoul(profile as string | undefined),

  // Tools
  getToolsets:       ({ profile }) => getToolsets(profile as string | undefined),
  setToolsetEnabled: ({ key, enabled, profile }) => setToolsetEnabled(key as string, enabled as boolean, profile as string | undefined),

  // Skills
  listInstalledSkills: ({ profile }) => listInstalledSkills(profile as string | undefined),
  listBundledSkills:   () => listBundledSkills(),
  getSkillContent:     ({ skillPath }) => getSkillContent(skillPath as string),
  installSkill:        ({ identifier, profile }) => installSkill(identifier as string, profile as string | undefined),
  uninstallSkill:      ({ name, profile }) => uninstallSkill(name as string, profile as string | undefined),

  // Sessions
  listSessions:       ({ limit, offset }) => listSessions(limit as number | undefined, offset as number | undefined),
  getSessionMessages: ({ sessionId }) => getSessionMessages(sessionId as string),
  searchSessions:     ({ query, limit }) => searchSessions(query as string, limit as number | undefined),
  listCachedSessions: ({ limit, offset }) => listCachedSessions(limit as number | undefined, offset as number | undefined),
  syncSessionCache:   () => syncSessionCache(),
  updateSessionTitle: ({ sessionId, title }) => updateSessionTitle(sessionId as string, title as string),

  // Profiles
  listProfiles:     () => listProfiles(),
  createProfile:    ({ name, clone }) => createProfile(name as string, clone as boolean),
  deleteProfile:    ({ name }) => deleteProfile(name as string),
  setActiveProfile: ({ name }) => setActiveProfile(name as string),

  // Cron
  listCronJobs:  ({ includeDisabled, profile }) => listCronJobs(includeDisabled as boolean | undefined, profile as string | undefined),
  createCronJob: ({ schedule, prompt, name, deliver, profile }) => createCronJob(schedule as string, prompt as string | undefined, name as string | undefined, deliver as string | undefined, profile as string | undefined),
  removeCronJob: ({ jobId, profile }) => removeCronJob(jobId as string, profile as string | undefined),
  pauseCronJob:  ({ jobId, profile }) => pauseCronJob(jobId as string, profile as string | undefined),
  resumeCronJob: ({ jobId, profile }) => resumeCronJob(jobId as string, profile as string | undefined),
  triggerCronJob:({ jobId, profile }) => triggerCronJob(jobId as string, profile as string | undefined),

  // Config / Env
  getEnv:             ({ profile }) => readEnv(profile as string | undefined),
  setEnv:             ({ key, value, profile }) => setEnvValue(key as string, value as string, profile as string | undefined),
  getConfig:          ({ key, profile }) => getConfigValue(key as string, profile as string | undefined),
  setConfig:          ({ key, value, profile }) => setConfigValue(key as string, value as string, profile as string | undefined),
  getHermesHome:      ({ profile }) => getHermesHome(profile as string | undefined),
  getModelConfig:     ({ profile }) => getModelConfig(profile as string | undefined),
  setModelConfig:     ({ provider, model, baseUrl, profile }) => setModelConfig(provider as string, model as string, baseUrl as string, profile as string | undefined),
  getPlatformEnabled: ({ profile }) => getPlatformEnabled(profile as string | undefined),
  setPlatformEnabled: ({ platform, enabled, profile }) => setPlatformEnabled(platform as string, enabled as boolean, profile as string | undefined),
  getAutoConnect:     () => getAutoConnect(),
  setAutoConnect:     ({ enabled }) => setAutoConnect(enabled as boolean),

  // Models
  listModels:  () => listModels(),
  addModel:    ({ name, provider, model, baseUrl }) => addModel(name as string, provider as string, model as string, baseUrl as string),
  removeModel: ({ id }) => removeModel(id as string),
  updateModel: ({ id, fields }) => updateModel(id as string, fields as Record<string, string>),

  // MCP
  listMcpServers: ({ profile }) => listMcpServers(profile as string | undefined),
};

let _server: http.Server | null = null;

export function startManagementServer(apiKey: string): void {
  if (_server) return;

  _server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== "POST" || req.url !== "/manage") {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Authenticate
    const auth = req.headers.authorization;
    if (apiKey && auth !== `Bearer ${apiKey}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // Read body
    let raw = "";
    for await (const chunk of req) raw += chunk.toString();

    let parsed: { method: string; params: P };
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    const handler = METHODS[parsed.method];
    if (!handler) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: `Unknown method: ${parsed.method}` }));
      return;
    }

    try {
      const result = await handler(parsed.params || {});
      res.writeHead(200);
      res.end(JSON.stringify({ result }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: (err as Error).message || "Internal error" }));
    }
  });

  _server.listen(MANAGE_PORT, "127.0.0.1");
}

export function stopManagementServer(): void {
  if (_server) {
    _server.close();
    _server = null;
  }
}
