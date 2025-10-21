/**
 * Audit logging for authentication events
 * In production, these should be sent to a centralized logging service
 */

interface LoginEvent {
  timestamp: string;
  type: 'success' | 'failure';
  uid?: number;
  username: string;
  ip: string;
  userAgent: string;
  reason?: string;
}

// In-memory log (in production, use a database or logging service)
const auditLogs: LoginEvent[] = [];

export function logLoginSuccess(
  uid: number,
  username: string,
  ip: string,
  userAgent: string
): void {
  const event: LoginEvent = {
    timestamp: new Date().toISOString(),
    type: 'success',
    uid,
    username,
    ip,
    userAgent,
  };

  auditLogs.push(event);
  console.log(`✅ Login successful: ${username} (UID: ${uid}) from ${ip}`);

  // In production, send to logging service
  // await sendToLoggingService(event);
}

export function logLoginFailure(
  username: string,
  ip: string,
  reason: string,
  userAgent: string
): void {
  const event: LoginEvent = {
    timestamp: new Date().toISOString(),
    type: 'failure',
    username,
    ip,
    userAgent,
    reason,
  };

  auditLogs.push(event);
  console.warn(`⚠️ Login failed: ${username} from ${ip} - Reason: ${reason}`);

  // In production, send to logging service
  // await sendToLoggingService(event);
}

export function logLogout(
  uid: number,
  username: string,
  ip: string
): void {
  console.log(`🚪 User logged out: ${username} (UID: ${uid}) from ${ip}`);
  // In production, send to logging service
  // await sendToLoggingService({ type: 'logout', uid, username, ip, timestamp: new Date().toISOString() });
}

export function getAuditLogs(): LoginEvent[] {
  return auditLogs;
}

export function clearAuditLogs(): void {
  auditLogs.length = 0;
}
