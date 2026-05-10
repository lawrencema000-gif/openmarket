export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
};

export type AuthSession = {
  id: string;
};

export type ApiTokenContext = {
  id: string;
  developerId: string;
  scopes: string[];
};

export type DeveloperContext = {
  id: string;
  email: string;
  displayName: string | null;
};

export type Variables = {
  user: AuthUser;
  session: AuthSession;
  admin?: any; // Set by requireAdmin middleware
  /** Set by requireApiToken middleware (CLI / CI/CD calls). */
  apiToken?: ApiTokenContext;
  /** Set by requireApiToken middleware alongside apiToken. */
  developer?: DeveloperContext;
};
