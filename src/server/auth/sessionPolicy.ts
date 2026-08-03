export type AuthSessionPolicy = {
  sessionPersistent: boolean;
  sessionIdleHours: number;
  sessionMaxLifetimeHours: number;
  cookieMaxAgeDays: number;
};

const secondsPerHour = 60 * 60;
const secondsPerDay = 24 * secondsPerHour;

export function sessionCookieMaxAgeSeconds(
  policy: AuthSessionPolicy,
  expiresAt?: Date | string,
  nowMs = Date.now()
) {
  if (policy.sessionPersistent) {
    return policy.cookieMaxAgeDays * secondsPerDay;
  }

  if (!expiresAt) {
    return Math.min(policy.sessionIdleHours, policy.sessionMaxLifetimeHours) * secondsPerHour;
  }

  return Math.max(0, (new Date(expiresAt).getTime() - nowMs) / 1000);
}
