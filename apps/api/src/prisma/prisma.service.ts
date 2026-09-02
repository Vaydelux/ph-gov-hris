import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }

  /** Transactional helper with typed client — used by payroll/leave/loan mutations. */
  tx<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction((tx) => fn(tx as unknown as PrismaClient), { timeout: 30_000 });
  }
}
