import multer, { MulterError } from "multer";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { config } from "../config.js";
import { parseAllowedMimeTypes, validateUpload } from "../lib/uploadValidation.js";

const allowedMimeTypes = parseAllowedMimeTypes(config.ALLOWED_UPLOAD_MIME_TYPES);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024 },
});

/**
 * Wraps `multer().single(field)` and maps multer errors to clear HTTP statuses
 * instead of letting them fall through to the 500 handler. Oversized uploads
 * return 413 before anything is written to storage (#87).
 */
export function singleFileUpload(field = "file"): RequestHandler {
  const handler = upload.single(field);
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (err: unknown) => {
      if (err instanceof MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({
            error: `File exceeds the maximum size of ${config.MAX_FILE_SIZE_MB}MB`,
          });
          return;
        }
        res.status(400).json({ error: `Upload error: ${err.message}` });
        return;
      }
      if (err) {
        next(err);
        return;
      }
      next();
    });
  };
}

/**
 * Rejects uploads whose content type is not allow-listed, or whose declared
 * type does not match the detected magic bytes, with 415 — before the storage
 * write. No-ops for non-file (e.g. link) requests.
 */
export function validateUploadContentType(req: Request, res: Response, next: NextFunction): void {
  if (!req.file) {
    next();
    return;
  }

  const result = validateUpload(req.file.buffer, req.file.mimetype, allowedMimeTypes);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  next();
}
