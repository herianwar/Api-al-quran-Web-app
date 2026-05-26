export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}
