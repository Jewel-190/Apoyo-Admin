import { supabase } from "./supabaseClient.js";

const FUNCTION_NAME = "super-admin-services-management";

async function invokeServicesManagement(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) {
    throw new Error(error.message || "Services management request failed.");
  }
  if (!data?.success) {
    throw new Error(data?.error || "Services management request failed.");
  }
  return data;
}

export async function cmsCatalogList() {
  const data = await invokeServicesManagement({ action: "catalog.list" });
  return data.catalog ?? [];
}

export async function cmsServiceDetail(serviceId) {
  const data = await invokeServicesManagement({
    action: "catalog.service.get",
    serviceId,
  });
  return data.service;
}

export async function cmsCategoryCreate(payload) {
  return invokeServicesManagement({
    action: "category.create",
    ...payload,
  });
}

export async function cmsCategoryUpdate(payload) {
  return invokeServicesManagement({
    action: "category.update",
    ...payload,
  });
}

export async function cmsCategoryArchive(categoryId) {
  return invokeServicesManagement({
    action: "category.archive",
    categoryId,
  });
}

export async function cmsServiceSave({
  serviceId = null,
  servicePayload,
  requirements,
  additionalAttachment,
}) {
  return invokeServicesManagement({
    action: "service.save",
    serviceId,
    servicePayload,
    requirements,
    additionalAttachment,
  });
}

export async function cmsServiceArchive(serviceId) {
  return invokeServicesManagement({
    action: "service.archive",
    serviceId,
  });
}
