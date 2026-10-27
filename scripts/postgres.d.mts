import type EmbeddedPostgres from 'embedded-postgres';

export const DEV_PORT: number;
export function pgUrl(port: number, database: string): string;
export function freePort(): Promise<number>;
export function startPostgres(options: { port: number; dir?: string; databases?: string[]; log?: boolean }): Promise<EmbeddedPostgres>;
