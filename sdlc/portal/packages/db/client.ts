import { PrismaClient } from './generated/client.ts';
import type { Prisma } from './generated/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
export function database(url: string) {
  return new PrismaClient({adapter:new PrismaPg({connectionString:url,connectionTimeoutMillis:5000,max:5})});
}
export type Database = ReturnType<typeof database>;
export type Transaction = Prisma.TransactionClient;
