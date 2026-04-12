export type AuthUser = {
  id: string;
  email: string;
  name?: string;
};

export type AuthSession = {
  id: string;
};

export type Variables = {
  user: AuthUser;
  session: AuthSession;
};
