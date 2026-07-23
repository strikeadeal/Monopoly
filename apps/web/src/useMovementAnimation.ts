import { useCallback, useEffect, useRef, useState } from 'react';
import { BOARD, type GameState, type MovementEvent } from '@monopoly/game';
import { DICE_ROLL_DURATION_MS } from './animationTiming';
import { useReducedMotion } from './useReducedMotion';

const STEP_DURATION_MS = 140;
const DIRECT_DEPART_MS = 140;
const DIRECT_ARRIVE_MS = 220;

export type TokenMotion = 'step' | 'direct-out' | 'direct-in' | null;

interface Presentation {
  playerId: string;
  position: number;
  motion: TokenMotion;
  waitingForCard: boolean;
}

const validIndex = (index: number) => Number.isInteger(index) && index >= 0 && index < BOARD.length;

function isValidMovement(movement: MovementEvent, destination: number) {
  if (!validIndex(movement.startPosition) || !movement.segments.length) return false;
  if (movement.pauseForCardAfterSegment !== null && (!Number.isInteger(movement.pauseForCardAfterSegment) || movement.pauseForCardAfterSegment < 0 || movement.pauseForCardAfterSegment >= movement.segments.length)) return false;
  let lastPosition = movement.startPosition;
  for (const segment of movement.segments) {
    if (segment.kind === 'steps') {
      if (!segment.positions.length || segment.positions.some((index) => !validIndex(index))) return false;
      for (const position of segment.positions) {
        const direction = (position - lastPosition + BOARD.length) % BOARD.length;
        if (segment.reason === 'roll' ? direction !== 1 : direction !== 1 && direction !== BOARD.length - 1) return false;
        lastPosition = position;
      }
    } else {
      if (!validIndex(segment.destination)) return false;
      lastPosition = segment.destination;
    }
  }
  return lastPosition === destination;
}

export function useMovementAnimation(state: GameState) {
  const movement = state.lastMovement ?? null;
  const seenIds = useRef(new Set(movement ? [movement.id] : []));
  const resumeCardRef = useRef<(() => void) | null>(null);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!movement) {
      resumeCardRef.current = null;
      setPresentation(null);
      return undefined;
    }
    if (seenIds.current.has(movement.id)) return undefined;
    seenIds.current.add(movement.id);

    const player = state.players.find((candidate) => candidate.id === movement.playerId);
    if (!player || !isValidMovement(movement, player.position)) {
      setPresentation(null);
      return undefined;
    }

    const announcedRoll = movement.dice ?? state.lastRoll;
    const announcedLanding = movement.landingIndex ?? player.position;
    const finalAnnouncement = `${player.name} rolled${announcedRoll ? ` ${announcedRoll[0]} and ${announcedRoll[1]}` : ''} and landed on ${BOARD[announcedLanding]!.name}.`;
    if (reducedMotion) {
      setPresentation(null);
      setAnnouncement(finalAnnouncement);
      return undefined;
    }

    let cancelled = false;
    let timer: number | undefined;
    const delay = (milliseconds: number) => new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, milliseconds);
    });
    const present = (position: number, motion: TokenMotion, waitingForCard = false) => {
      if (!cancelled) setPresentation({ playerId: player.id, position, motion, waitingForCard });
    };

    const run = async () => {
      let currentPosition = movement.startPosition;
      present(currentPosition, null);
      await delay(DICE_ROLL_DURATION_MS);
      if (cancelled) return;

      for (const [segmentIndex, segment] of movement.segments.entries()) {
        if (segment.kind === 'steps') {
          for (const position of segment.positions) {
            currentPosition = position;
            present(currentPosition, 'step');
            await delay(STEP_DURATION_MS);
            if (cancelled) return;
          }
        } else {
          present(currentPosition, 'direct-out');
          await delay(DIRECT_DEPART_MS);
          if (cancelled) return;
          currentPosition = segment.destination;
          present(currentPosition, 'direct-in');
          await delay(DIRECT_ARRIVE_MS);
          if (cancelled) return;
        }

        if (movement.pauseForCardAfterSegment === segmentIndex) {
          present(currentPosition, null, true);
          await new Promise<void>((resolve) => { resumeCardRef.current = resolve; });
          resumeCardRef.current = null;
          if (cancelled) return;
          present(currentPosition, null);
        }
      }

      setPresentation(null);
      setAnnouncement(finalAnnouncement);
    };
    void run();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      resumeCardRef.current = null;
      setPresentation(null);
    };
  }, [movement?.id, reducedMotion]);

  const resumeAfterCard = useCallback(() => resumeCardRef.current?.(), []);
  return {
    displayPositions: presentation ? { [presentation.playerId]: presentation.position } : {},
    movingPlayerId: presentation?.playerId ?? null,
    tokenMotion: presentation?.motion ?? null,
    isPresenting: presentation !== null,
    waitingForCard: presentation?.waitingForCard ?? false,
    announcement,
    resumeAfterCard
  };
}
