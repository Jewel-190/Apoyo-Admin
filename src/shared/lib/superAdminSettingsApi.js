import { supabase } from "./supabaseClient";

const FUNCTION_NAME = "super-admin-settings-management";

function stringifyErrorField(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (typeof value.message === "string" && value.message.trim()) return value.message;
    if (value.error != null) return stringifyErrorField(value.error);
    try {
      return JSON.stringify(value);
    } catch {
      return "Settings request failed.";
    }
  }
  return String(value);
}

async function readInvokeErrorDetail(error, data) {
  const fromData = stringifyErrorField(data?.error) || stringifyErrorField(data?.message);
  if (fromData) return fromData;

  const context = error?.context;
  if (context && typeof context.json === "function") {
    try {
      const payload = await context.json();
      const fromPayload =
        stringifyErrorField(payload?.error) || stringifyErrorField(payload?.message);
      if (fromPayload) return fromPayload;
    } catch {
      // ignore
    }
  }

  return stringifyErrorField(error?.message) || "Settings request failed.";
}

async function invokeSettingsManagement(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) {
    throw new Error(await readInvokeErrorDetail(error, data));
  }
  if (!data?.success) {
    throw new Error(stringifyErrorField(data?.error) || "Settings request failed.");
  }
  return data;
}

export async function listPlatformSettings({
  scope = null,
  key = null,
  isActive = null,
} = {}) {
  return invokeSettingsManagement({
    action: "listSettings",
    scope: scope || undefined,
    key: key || undefined,
    isActive: typeof isActive === "boolean" ? isActive : undefined,
  });
}

export async function getPlatformSetting(scope, key) {
  return invokeSettingsManagement({
    action: "getSetting",
    scope,
    key,
  });
}

export async function upsertPlatformSetting({
  scope,
  key,
  value,
  description,
  visibility,
  isSecret,
  isActive,
  metadata,
  expectedVersion,
} = {}) {
  return invokeSettingsManagement({
    action: "upsertSetting",
    scope,
    key,
    value,
    description,
    visibility,
    isSecret,
    isActive,
    metadata,
    expectedVersion,
  });
}

export async function deletePlatformSetting(scope, key, { hardDelete = false } = {}) {
  return invokeSettingsManagement({
    action: "deleteSetting",
    scope,
    key,
    hardDelete: Boolean(hardDelete),
  });
}

export async function resetPlatformSetting(scope, key, { visibility } = {}) {
  return invokeSettingsManagement({
    action: "resetSetting",
    scope,
    key,
    visibility,
  });
}

export async function listPlatformSettingScopes() {
  return invokeSettingsManagement({
    action: "listScopes",
  });
}
