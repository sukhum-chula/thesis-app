import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      title?: string | null;
      name: string;
      email: string;
      role: string;
      roles: string[];
      studentId?: string;
      programChairFor?: string[];
    };
  }

  interface User {
    id?: string;
    title?: string | null;
    role?: string;
    roles?: string[];
    studentId?: string;
    programChairFor?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    title?: string | null;
    role?: string;
    roles?: string[];
    studentId?: string;
    programChairFor?: string[];
  }
}
