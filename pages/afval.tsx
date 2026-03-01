import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

interface CollectionItem {
  name: string;
  color: string;
  logoUrl: string | null;
}

interface CollectionDay {
  date: string;
  dayName: string;
  items: CollectionItem[];
}

const WEEKDAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export default function AfvalPage() {
  const { isLoading: authLoading } = useAuth();
  const [collections, setCollections] = useState<CollectionDay[]>([]);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);

  const now = new Date();
  const viewYear = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getFullYear();
  const viewMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getMonth();
  const monthLabel = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

  useEffect(() => {
    setLoading(true);
    setError(null);

    const startOfMonth = new Date(viewYear, viewMonth, 1);
    const endOfMonth = new Date(viewYear, viewMonth + 1, 0);

    let startDay = startOfMonth.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    const fetchFrom = new Date(startOfMonth);
    fetchFrom.setDate(fetchFrom.getDate() - startDay);

    const totalCells = startDay + endOfMonth.getDate();
    const totalWeeks = Math.ceil(totalCells / 7);
    const fetchUntil = new Date(fetchFrom);
    fetchUntil.setDate(fetchUntil.getDate() + totalWeeks * 7);

    const fromStr = toDateStr(fetchFrom);
    const days = Math.ceil((fetchUntil.getTime() - fetchFrom.getTime()) / (1000 * 60 * 60 * 24));

    const fetchCollections = async () => {
      try {
        const res = await fetch(`/api/waste-collections?days=${days}&from=${fromStr}`);
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || 'Kon afvalkalender niet ophalen');
        }
        const data = await res.json();
        setCollections(data.collections);
        setAddress(data.address);
      } catch (err) {
        console.error('Error fetching waste collections:', err);
        setError(err instanceof Error ? err.message : 'Onbekende fout');
      } finally {
        setLoading(false);
      }
    };

    fetchCollections();
  }, [viewYear, viewMonth]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-100">
        <div className="p-8 text-center">
          <p className="text-xl text-gray-600">Laden...</p>
        </div>
      </div>
    );
  }

  const collectionsByDate = new Map<string, CollectionItem[]>();
  for (const day of collections) {
    if (day.items.length > 0) {
      collectionsByDate.set(day.date, day.items);
    }
  }

  const legend = new Map<string, { color: string }>();
  for (const day of collections) {
    for (const item of day.items) {
      if (!legend.has(item.name)) {
        legend.set(item.name, { color: item.color });
      }
    }
  }

  const calendarWeeks = buildCalendarWeeks(viewYear, viewMonth);
  const todayStr = toDateStr(now);
  const isCurrentMonth = now.getFullYear() === viewYear && now.getMonth() === viewMonth;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-100 font-sans">
      <div className="p-4 sm:p-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              ♻️ Afval Ophaalkalender
            </h1>
            <p className="text-gray-600 mt-2">{address}</p>
          </div>

          {/* Upcoming week summary */}
          {!loading && !error && (() => {
            const todayDate = new Date();
            const upcoming: { dayName: string; date: string; items: CollectionItem[] }[] = [];
            for (let i = 0; i < 7; i++) {
              const d = new Date(todayDate);
              d.setDate(d.getDate() + i);
              const ds = toDateStr(d);
              const items = collectionsByDate.get(ds);
              if (items && items.length > 0) {
                const DAY_NAMES_FULL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
                upcoming.push({ dayName: DAY_NAMES_FULL[d.getDay()], date: ds, items });
              }
            }
            if (upcoming.length === 0) return null;
            return (
              <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-3">Komende week</h2>
                <div className="space-y-2">
                  {upcoming.map((day) => (
                    <div key={day.date} className="flex items-center gap-3">
                      <span className="font-semibold text-gray-800 capitalize w-24">{day.dayName}</span>
                      <div className="flex flex-wrap gap-2">
                        {day.items.map((item) => (
                          <span
                            key={item.name}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full"
                            style={{
                              backgroundColor: item.color + '20',
                              color: darkenColor(item.color),
                            }}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            {item.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Calendar card */}
          <div className="bg-white shadow-xl rounded-2xl p-6">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-bold text-gray-900">{monthLabel}</h2>
              <div className="flex items-center gap-2">
                {!isCurrentMonth && (
                  <button
                    onClick={() => setMonthOffset(0)}
                    className="px-3 py-1.5 text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                  >
                    Vandaag
                  </button>
                )}
                <button
                  onClick={() => setMonthOffset((o) => o - 1)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => setMonthOffset((o) => o + 1)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-20 text-center">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full mb-3" />
                <p className="text-gray-500">Laden...</p>
              </div>
            ) : error ? (
              <div className="py-12 text-center">
                <p className="text-red-600 font-medium mb-2">Fout bij laden</p>
                <p className="text-gray-500 text-sm">{error}</p>
              </div>
            ) : (
              <>
                {/* Day headers */}
                <div className="grid grid-cols-7 border-b border-gray-200 mb-1">
                  {WEEKDAYS.map((d) => (
                    <div
                      key={d}
                      className="text-center py-2 text-xs font-bold text-gray-400 uppercase tracking-wide"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Calendar rows */}
                <div className="grid grid-cols-7">
                  {calendarWeeks.flat().map((cell, i) => {
                    if (!cell) {
                      return (
                        <div
                          key={`empty-${i}`}
                          className="min-h-[90px] p-2 border-b border-r border-gray-100 last:border-r-0 bg-gray-50/30"
                        />
                      );
                    }

                    const items = collectionsByDate.get(cell.date) || [];
                    const today = cell.date === todayStr;
                    const isInMonth = cell.inMonth;

                    return (
                      <div
                        key={cell.date}
                        className={`min-h-[90px] p-2 border-b border-r border-gray-100 last:border-r-0 ${
                          !isInMonth ? 'bg-gray-50/50' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <span
                            className={`text-sm font-semibold leading-none ${
                              today
                                ? 'bg-teal-500 text-white w-6 h-6 rounded-full flex items-center justify-center'
                                : isInMonth
                                ? 'text-gray-800'
                                : 'text-gray-300'
                            }`}
                          >
                            {cell.dayNum}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {items.map((item) => (
                            <div
                              key={item.name}
                              className="flex items-center gap-1.5 text-xs font-medium rounded px-1.5 py-0.5"
                              style={{
                                backgroundColor: item.color + '20',
                                color: darkenColor(item.color),
                              }}
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="truncate">{item.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 mt-5 pt-4 border-t border-gray-200">
                  {[...legend.entries()].map(([name, { color }]) => (
                    <div key={name} className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm text-gray-600">{name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CalendarCell {
  date: string;
  dayNum: number;
  inMonth: boolean;
}

function buildCalendarWeeks(year: number, month: number): (CalendarCell | null)[] {
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);

  let startDay = startOfMonth.getDay();
  startDay = startDay === 0 ? 6 : startDay - 1;

  const cells: (CalendarCell | null)[] = [];

  const prevCursor = new Date(startOfMonth);
  prevCursor.setDate(prevCursor.getDate() - startDay);
  for (let i = 0; i < startDay; i++) {
    cells.push({
      date: toDateStr(prevCursor),
      dayNum: prevCursor.getDate(),
      inMonth: false,
    });
    prevCursor.setDate(prevCursor.getDate() + 1);
  }

  for (let d = 1; d <= endOfMonth.getDate(); d++) {
    const dt = new Date(year, month, d);
    cells.push({
      date: toDateStr(dt),
      dayNum: d,
      inMonth: true,
    });
  }

  const nextCursor = new Date(endOfMonth);
  nextCursor.setDate(nextCursor.getDate() + 1);
  while (cells.length % 7 !== 0) {
    cells.push({
      date: toDateStr(nextCursor),
      dayNum: nextCursor.getDate(),
      inMonth: false,
    });
    nextCursor.setDate(nextCursor.getDate() + 1);
  }

  return cells;
}

function darkenColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = Math.max(0, parseInt(c.substring(0, 2), 16) - 60);
  const g = Math.max(0, parseInt(c.substring(2, 4), 16) - 60);
  const b = Math.max(0, parseInt(c.substring(4, 6), 16) - 60);
  return `rgb(${r}, ${g}, ${b})`;
}
