import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);
const bucket = config.SUPABASE_STORAGE_BUCKET;

export async function uploadFile(
  resourceId: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const storagePath = `${resourceId}/${filename}`;

  const { error } = await supabase.storage.from(bucket).upload(storagePath, fileBuffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  return storagePath;
}

export async function downloadFile(
  storagePath: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);

  if (error) throw new Error(`Download failed: ${error.message}`);

  const buffer = Buffer.from(await data.arrayBuffer());
  const mimeType = data.type || "application/octet-stream";

  return { buffer, mimeType };
}

export async function deleteFile(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);

  if (error) throw new Error(`Delete failed: ${error.message}`);
}
