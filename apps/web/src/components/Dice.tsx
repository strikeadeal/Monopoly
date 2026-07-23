import { useEffect, useState } from 'react';
import { DICE_ROLL_DURATION_MS } from '../animationTiming';

const PIP_MAP: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const TRANSIENT_VALUES = [[2, 5, 1, 4, 6], [6, 3, 5, 2, 1]] as const;
const TRANSIENT_DELAYS_MS = [[0, 100, 220, 340, 460], [0, 120, 240, 360, 480]] as const;

function Die({ value, rolling, index }: { value: number; rolling: boolean; index: 0 | 1 }) {
  return <span className={`die die-${index + 1}${rolling ? ' is-rolling' : ''}`} data-die-value={value} aria-hidden="true">
    {Array.from({ length: 9 }, (_, cell) => <i key={cell} className={PIP_MAP[value]?.includes(cell) ? 'pip' : undefined} />)}
  </span>;
}

export function DiceRoll({ roll, rolling }: { roll: [number, number]; rolling: boolean }) {
  const [first, second] = roll;
  const [displayedValues, setDisplayedValues] = useState<[number, number]>([first, second]);
  const [settled, setSettled] = useState(!rolling);

  useEffect(() => {
    if (!rolling) {
      setDisplayedValues([first, second]);
      setSettled(true);
      return undefined;
    }

    setDisplayedValues([TRANSIENT_VALUES[0][0], TRANSIENT_VALUES[1][0]]);
    setSettled(false);
    const timers = TRANSIENT_DELAYS_MS.flatMap((delays, dieIndex) => delays.slice(1).map((delay, valueIndex) => window.setTimeout(() => {
      const value = TRANSIENT_VALUES[dieIndex]![valueIndex + 1]!;
      setDisplayedValues((current) => dieIndex === 0
        ? [value, current[1]]
        : [current[0], value]);
    }, delay)));
    timers.push(window.setTimeout(() => {
      setDisplayedValues([first, second]);
      setSettled(true);
    }, DICE_ROLL_DURATION_MS));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [rolling, first, second]);

  const isRolling = rolling && !settled;
  const visibleValues: [number, number] = isRolling ? displayedValues : [first, second];
  return <span className="dice-row" role="img" aria-label={`Rolled ${first} and ${second}`} data-state={isRolling ? 'rolling' : 'settled'}>
    <Die value={visibleValues[0]} rolling={isRolling} index={0} />
    <Die value={visibleValues[1]} rolling={isRolling} index={1} />
  </span>;
}
