"use strict";

const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const DEFAULTS = {
  configPath: path.join(os.homedir(), ".codex", "config.toml"),
  openaiProfileName: "openai",
  openaiModel: "gpt-5.4"
};

function normalizeText(text) {
  return (text || "").replace(/\r\n/g, "\n");
}

function toLines(text) {
  return normalizeText(text).split("\n");
}

function quoteTomlString(value) {
  const input = String(value ?? "");
  return `"${input.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function isSectionHeader(line) {
  return /^\s*\[[^\]]+\]\s*$/.test(line);
}

function findFirstSectionIndex(lines) {
  return lines.findIndex((line) => isSectionHeader(line));
}

function findSectionRange(lines, sectionName) {
  const header = `[${sectionName}]`;
  let start = -1;
  let end = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!isSectionHeader(line)) {
      continue;
    }

    if (start === -1) {
      if (line.trim() === header) {
        start = index;
      }
      continue;
    }

    end = index;
    break;
  }

  return { start, end };
}

function parseAssignmentLine(line) {
  const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$/);
  if (!match) {
    return null;
  }

  const key = match[1];
  const rawValue = match[2].replace(/\s+#.*$/, "");
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return {
      key,
      value: rawValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
    };
  }

  return { key, value: rawValue };
}

function parseSectionValues(lines, sectionName) {
  const range = findSectionRange(lines, sectionName);
  if (range.start === -1) {
    return {};
  }

  const values = {};
  for (let index = range.start + 1; index < range.end; index += 1) {
    const parsed = parseAssignmentLine(lines[index]);
    if (parsed) {
      values[parsed.key] = parsed.value;
    }
  }

  return values;
}

function parseTopLevelString(lines, key) {
  const firstSectionIndex = findFirstSectionIndex(lines);
  const end = firstSectionIndex === -1 ? lines.length : firstSectionIndex;

  for (let index = 0; index < end; index += 1) {
    const parsed = parseAssignmentLine(lines[index]);
    if (parsed && parsed.key === key) {
      return String(parsed.value);
    }
  }

  return "";
}

function upsertTopLevelString(lines, key, value) {
  const nextLines = [...lines];
  const firstSectionIndex = findFirstSectionIndex(nextLines);
  const end = firstSectionIndex === -1 ? nextLines.length : firstSectionIndex;
  const assignment = `${key} = ${quoteTomlString(value)}`;

  for (let index = 0; index < end; index += 1) {
    const parsed = parseAssignmentLine(nextLines[index]);
    if (parsed && parsed.key === key) {
      nextLines[index] = assignment;
      return nextLines;
    }
  }

  const insertAt = end === -1 ? nextLines.length : end;
  nextLines.splice(insertAt, 0, assignment);
  return nextLines;
}

function removeTopLevelString(lines, key) {
  const nextLines = [];
  const firstSectionIndex = findFirstSectionIndex(lines);
  const end = firstSectionIndex === -1 ? lines.length : firstSectionIndex;

  for (let index = 0; index < lines.length; index += 1) {
    if (index < end) {
      const parsed = parseAssignmentLine(lines[index]);
      if (parsed && parsed.key === key) {
        continue;
      }
    }
    nextLines.push(lines[index]);
  }

  return nextLines;
}

function formatManagedEntries(existingValues, requiredOrder, overrides) {
  const merged = { ...existingValues, ...overrides };
  const orderedKeys = [];

  for (const key of requiredOrder) {
    if (merged[key] !== undefined && merged[key] !== "") {
      orderedKeys.push(key);
    }
  }

  for (const key of Object.keys(merged)) {
    if (!orderedKeys.includes(key) && merged[key] !== undefined && merged[key] !== "") {
      orderedKeys.push(key);
    }
  }

  return orderedKeys.map((key) => `${key} = ${quoteTomlString(merged[key])}`);
}

function replaceSection(lines, sectionName, sectionBodyLines) {
  const range = findSectionRange(lines, sectionName);
  const sectionLines = [`[${sectionName}]`, ...sectionBodyLines];

  if (range.start === -1) {
    const nextLines = [...lines];
    while (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") {
      nextLines.pop();
    }

    if (nextLines.length > 0) {
      nextLines.push("");
    }

    nextLines.push(...sectionLines);
    return nextLines;
  }

  const before = lines.slice(0, range.start);
  const after = lines.slice(range.end);

  while (before.length > 0 && before[before.length - 1] === "") {
    before.pop();
  }

  const nextLines = [...before];
  if (nextLines.length > 0) {
    nextLines.push("");
  }

  nextLines.push(...sectionLines);

  if (after.length > 0 && after[0] !== "") {
    nextLines.push("");
  }

  nextLines.push(...after);
  return nextLines;
}

function buildUpdatedConfigText(existingText, options) {
  const settings = { ...DEFAULTS, ...options };
  const lines = toLines(existingText);
  let nextLines = removeTopLevelString(lines, "profile");
  nextLines = upsertTopLevelString(nextLines, "model_provider", "openai");
  nextLines = upsertTopLevelString(nextLines, "model", settings.openaiModel);

  return nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function detectProviderInfo(configText) {
  const lines = toLines(configText);
  const profile = parseTopLevelString(lines, "profile");
  const topLevelModelProvider = parseTopLevelString(lines, "model_provider");

  if (!profile) {
    if (!topLevelModelProvider || topLevelModelProvider === "openai") {
      return {
        providerId: "openai",
        profile: DEFAULTS.openaiProfileName,
        label: "OpenAI"
      };
    }

    return {
      providerId: "custom",
      profile: "top-level",
      label: `Provider:${topLevelModelProvider}`
    };
  }

  if (profile === DEFAULTS.openaiProfileName) {
    return {
      providerId: "openai",
      profile,
      label: "OpenAI"
    };
  }

  const activeProfile = parseSectionValues(lines, `profiles.${profile}`);
  if (activeProfile.model_provider === "openai") {
    return {
      providerId: "openai",
      profile,
      label: "OpenAI"
    };
  }

  return {
    providerId: "custom",
    profile,
    label: `Profile:${profile}`
  };
}

async function readConfigText(configPath = DEFAULTS.configPath) {
  try {
    return await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function writeConfigText(configPath, text) {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, text, "utf8");
}

module.exports = {
  DEFAULTS,
  buildUpdatedConfigText,
  detectProviderInfo,
  readConfigText,
  writeConfigText
};
