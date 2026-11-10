
import { config } from "dotenv";

config({ path: ["backend/.env", ".env"] });

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
      throw new Error(
        'DATABASE_URL is not configured. Copy backend/.env.example to backend/.env and set DATABASE_URL to your PostgreSQL connection string.',
      );
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
