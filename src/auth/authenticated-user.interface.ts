import { UserRole } from '../generated/prisma/enums.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
}
