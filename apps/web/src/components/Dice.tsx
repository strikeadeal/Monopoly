const PIP_MAP: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ value, rolling, delay }: { value: number; rolling: boolean; delay?: string }) {
  return <span className={`die ${rolling ? 'is-rolling' : ''}`} style={delay ? { animationDelay: delay } : undefined} aria-hidden="true">
    {Array.from({ length: 9 }, (_, cell) => <i key={cell} className={PIP_MAP[value]?.includes(cell) ? 'pip' : undefined} />)}
  </span>;
}

export function DiceRoll({ roll, rolling }: { roll: [number, number]; rolling: boolean }) {
  return <span className="dice-row" role="img" aria-label={`Rolled ${roll[0]} and ${roll[1]}`}>
    <Die value={roll[0]} rolling={rolling} />
    <Die value={roll[1]} rolling={rolling} delay=".08s" />
  </span>;
}
