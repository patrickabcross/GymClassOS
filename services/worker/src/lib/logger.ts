import pino from "pino";
import { getEnv } from "./env.js";

let _logger: pino.Logger | undefined;
export function getLogger(): pino.Logger {
  if (_logger) return _logger;
  const env = getEnv();
  _logger = pino({
    level: env.LOG_LEVEL,
    // Full PII redaction config is OBS-01 / P1a; minimal defaults here.
    // P1a will add: redact: ["msg.payload.from", "msg.body", "*.access_token"]
  });
  return _logger;
}
