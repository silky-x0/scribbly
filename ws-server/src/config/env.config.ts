import 'dotenv/config';

const DEFAULT_PORT = 3001;
const DEFAULT_CLIENT_URL = 'http://localhost:3000';
const MAX_PORT = 65535;

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_PORT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_PORT) {
    console.warn(
      `[config] Invalid PORT="${raw}", falling back to ${DEFAULT_PORT}.`,
    );
    return DEFAULT_PORT;
  }
  return parsed;
}

function parseClientUrls(raw: string | undefined): string[] {
  const urls = (raw ?? DEFAULT_CLIENT_URL)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return urls.length > 0 ? urls : [DEFAULT_CLIENT_URL];
}

export interface EnvConfig {
  port: number;
  clientUrls: string[];
}

function loadEnvConfig(): EnvConfig {
  return {
    port: parsePort(process.env.PORT),
    clientUrls: parseClientUrls(process.env.CLIENT_URL),
  };
}


export const env: EnvConfig = loadEnvConfig();
