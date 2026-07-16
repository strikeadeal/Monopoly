import type { ActivityEntry } from '@monopoly/game';

const timeLabel = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function ActivityTimeline({ entries }: { entries: ActivityEntry[] }) {
  const groups = entries.reduce<Array<{ time: string; entries: ActivityEntry[] }>>((result, entry) => {
    const time = timeLabel(entry.at);
    const previous = result.at(-1);
    if (previous?.time === time) previous.entries.push(entry);
    else result.push({ time, entries: [entry] });
    return result;
  }, []);

  if (!groups.length) return <p className="empty-copy">The table history will appear here.</p>;

  return <ol className="activity-list">
    {groups.map((group, groupIndex) => <li className="activity-group" key={`${group.time}-${groupIndex}`}>
      <time>{group.time}</time>
      <ol>
        {group.entries.map((entry) => <li key={entry.id} className={entry.tone}>
          <span>{entry.text}</span>
        </li>)}
      </ol>
    </li>)}
  </ol>;
}
