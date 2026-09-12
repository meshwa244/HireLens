import { TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";

const USER_NAME_KEY = "hirelens_user_name";
const USER_ROLE_KEY = "hirelens_user_role";

export type SessionUser = { full_name: string; role: string };

export async function saveSession(token: string, user: SessionUser): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
  await storage.setItem(USER_NAME_KEY, user.full_name);
  await storage.setItem(USER_ROLE_KEY, user.role);
}

export async function hasSession(): Promise<boolean> {
  return Boolean(await storage.secureGet(TOKEN_KEY, null));
}

export async function getStoredUser(): Promise<SessionUser> {
  const full_name = await storage.getItem(USER_NAME_KEY, "Demo Recruiter");
  const role = await storage.getItem(USER_ROLE_KEY, "Demo User");
  return { full_name: full_name ?? "Demo Recruiter", role: role ?? "Demo User" };
}

export async function clearSession(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
  await storage.removeItem(USER_NAME_KEY);
  await storage.removeItem(USER_ROLE_KEY);
}
