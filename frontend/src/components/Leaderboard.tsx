import { useMemo } from 'react';
import clsx from 'clsx';
import { useApiSWR } from '../hooks/useApiSWR';
import { LeaderboardEntry } from '../types';

type LeaderboardProps = {
  sessionId?: string | null;
  className?: string;
  title?: string;
  description?: string;
};

const numberFormatter = new Intl.NumberFormat('en-US');

const buildEndpoint = (sessionId?: string) => {
  if (!sessionId) {
    return '/stats/leaderboard';
  }

  return `/sessions/${sessionId}/leaderboard`;
};

export default function Leaderboard({
  sessionId,
  className,
  title = 'Session Leaderboard',
  description = 'Track real-time performance across your team. Data refreshes automatically once the endpoint is available.',
}: LeaderboardProps) {
  const endpoint = sessionId ? buildEndpoint(sessionId) : buildEndpoint();
  const key = sessionId === null ? null : endpoint;

  const { data, error, isLoading } = useApiSWR<LeaderboardEntry[] | undefined>(
    key,
    {
      keepPreviousData: true,
    }
  );

  const entries = useMemo<LeaderboardEntry[]>(() => {
    if (!data || data.length === 0) {
      return [];
    }

    return [...data].sort((a, b) => b.totalPoints - a.totalPoints);
  }, [data]);
  const isEmpty = !isLoading && !error && entries.length === 0;

  return (
    <section className={clsx('bg-th-surface p-6 rounded-lg border border-muted text-left', className)}>
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-primary">{title}</h2>
        <p className="text-secondary text-sm">{description}</p>
      </header>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-th-divider">
          <thead className="bg-th-elevated/60">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-secondary uppercase tracking-wide">
                User full name
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-secondary uppercase tracking-wide">
                Dials
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-secondary uppercase tracking-wide">
                App Outs
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-secondary uppercase tracking-wide">
                Under Writing
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-secondary uppercase tracking-wide">
                Total Points
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-th-divider/40">
            {isLoading && entries.length === 0 && (
              [...Array(3)].map((_, index) => (
                <tr key={index} className="bg-th-elevated/20">
                  <td className="px-4 py-4">
                    <div className="h-4 w-40 rounded bg-th-skeleton animate-pulse" />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="h-4 ml-auto w-12 rounded bg-th-skeleton animate-pulse" />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="h-4 ml-auto w-12 rounded bg-th-skeleton animate-pulse" />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="h-4 ml-auto w-14 rounded bg-th-skeleton animate-pulse" />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="h-4 ml-auto w-16 rounded bg-th-skeleton animate-pulse" />
                  </td>
                </tr>
              ))
            )}

            {isEmpty && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-secondary text-sm">
                  Leaderboard data will appear here once the endpoint is connected.
                </td>
              </tr>
            )}

            {error && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-th-error text-sm">
                  Unable to load leaderboard data. Please try again later.
                </td>
              </tr>
            )}

            {entries.map((entry) => (
              <tr key={entry.id} className="bg-th-elevated/20 hover:bg-th-elevated/40 transition">
                <td className="px-4 py-4 text-primary text-sm font-medium">
                  {entry.fullName}
                </td>
                <td className="px-4 py-4 text-right text-primary text-xs">
                  {numberFormatter.format(entry.dials)}
                </td>
                <td className="px-4 py-4 text-right text-primary text-xs">
                  {numberFormatter.format(entry.appOuts)}
                </td>
                <td className="px-4 py-4 text-right text-primary text-xs">
                  {numberFormatter.format(entry.underwriting)}
                </td>
                <td className="px-4 py-4 text-right text-th-brand text-xs font-semibold">
                  {numberFormatter.format(entry.totalPoints)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
