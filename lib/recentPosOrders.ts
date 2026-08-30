export type RecentPosOrdersOdooCallParams = {
  uid: number;
  password: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
};

export type RecentPosOrdersOdooCall = <T>(params: RecentPosOrdersOdooCallParams) => Promise<T>;

export type RecentPosOrder = {
  id: number;
  name: string;
  date: string;
  state: string;
  partner: string | null;
  total: number;
  lineCount: number;
  sessionName: string | null;
};

export type RecentPosOrdersResult = {
  sessionLabel: string | null;
  usingYesterdaySession: boolean;
  orders: RecentPosOrder[];
};

type OdooRecord = Record<string, unknown>;

function many2oneName(value: unknown): string | null {
  return Array.isArray(value) && typeof value[1] === 'string' ? value[1] : null;
}

const ACTIVE_SESSION_STATES = ['opened', 'opening_control', 'closing_control'];

/**
 * TEMP TEST — treat yesterday's POS session as the open till.
 * Set to `false` to restore live behaviour (only currently open sessions).
 */
export const TEMP_USE_YESTERDAY_POS_SESSION = false;

export type LoadRecentPosOrdersOptions = {
  useYesterdaySession?: boolean;
  now?: Date;
};

function ymdInBrussels(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function yesterdaySessionDomain(now = new Date()): unknown[][] {
  const today = ymdInBrussels(now);
  const yesterday = ymdInBrussels(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  return [
    ['start_at', '>=', `${yesterday} 00:00:00`],
    ['start_at', '<', `${today} 00:00:00`],
  ];
}

function sessionSearchDomain(useYesterday: boolean, now: Date): unknown[] {
  if (useYesterday) return yesterdaySessionDomain(now);
  return [['state', 'in', ACTIVE_SESSION_STATES]];
}

function formatSessionLabel(
  sessions: OdooRecord[],
  useYesterday: boolean
): string | null {
  if (sessions.length === 0) return null;
  const names = sessions
    .map((session) => {
      const config = many2oneName(session.config_id);
      const name = typeof session.name === 'string' ? session.name : '';
      return config && name ? `${config} · ${name}` : config || name || null;
    })
    .filter((label): label is string => !!label)
    .join(' + ');
  if (!names) return useYesterday ? 'TEST gisteren' : null;
  return useYesterday ? `TEST gisteren · ${names}` : names;
}

/**
 * Last 20 POS orders, preferring the currently open till session(s).
 */
export async function loadRecentPosOrders(
  odooCall: RecentPosOrdersOdooCall,
  uid: number,
  password: string,
  options?: LoadRecentPosOrdersOptions
): Promise<RecentPosOrdersResult> {
  const useYesterday = options?.useYesterdaySession ?? TEMP_USE_YESTERDAY_POS_SESSION;
  const now = options?.now ?? new Date();

  const sessions = await odooCall<OdooRecord[]>({
    uid,
    password,
    model: 'pos.session',
    method: 'search_read',
    args: [sessionSearchDomain(useYesterday, now)],
    kwargs: {
      fields: ['id', 'name', 'config_id'],
      order: 'id desc',
    },
  });

  const sessionIds = sessions.map((session) => session.id as number);
  const orderDomain =
    sessionIds.length > 0 ? [['session_id', 'in', sessionIds]] : [];

  const orders = await odooCall<OdooRecord[]>({
    uid,
    password,
    model: 'pos.order',
    method: 'search_read',
    args: [orderDomain],
    kwargs: {
      fields: [
        'id',
        'name',
        'date_order',
        'state',
        'partner_id',
        'amount_total',
        'session_id',
        'lines',
      ],
      order: 'date_order desc',
      limit: 20,
    },
  });

  return {
    sessionLabel: formatSessionLabel(sessions, useYesterday),
    usingYesterdaySession: useYesterday,
    orders: orders.map((order) => ({
      id: order.id as number,
      name: String(order.name),
      date: String(order.date_order),
      state: String(order.state),
      partner: many2oneName(order.partner_id),
      total: Number(order.amount_total) || 0,
      lineCount: Array.isArray(order.lines) ? order.lines.length : 0,
      sessionName: many2oneName(order.session_id),
    })),
  };
}
