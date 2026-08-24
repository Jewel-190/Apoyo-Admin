import { supabase } from "./supabaseClient";

const FUNCTION_NAME = "web";

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
      return "Web request failed.";
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

  return stringifyErrorField(error?.message) || "Web request failed.";
}

async function invokeWeb(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) {
    throw new Error(await readInvokeErrorDetail(error, data));
  }
  if (!data?.success) {
    throw new Error(stringifyErrorField(data?.error) || "Web request failed.");
  }
  return data;
}

/** Superadmin: load canonical pages for the Web CMS. */
export async function listWebPages() {
  const data = await invokeWeb({ action: "cms.list" });
  return {
    pages: data.pages ?? {},
    updatedAt: data.updatedAt ?? {},
  };
}

/** Superadmin: publish one canonicalized page. */
export async function saveWebPage(page, content) {
  const data = await invokeWeb({ action: "cms.save", page, content });
  return {
    page: data.page,
    content: data.content ?? content,
  };
}
