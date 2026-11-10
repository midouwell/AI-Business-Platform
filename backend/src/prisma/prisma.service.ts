
import "dotenv/config";

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";

import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured");
    }

    const adapter = new PrismaPg({ connectionString });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    console.log("PostgreSQL connected through Prisma");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
