/* The reducer throws terse engine phrases ("not enough cash") and the network
 * layer throws browser strings ("Failed to fetch"). Everything a player sees
 * routes through friendlyError so the table always speaks in one voice. */
const ENGINE_COPY: Record<string, string> = {
  'not enough cash': 'You do not have enough cash for that.',
  'not enough cash to settle debt': 'You still need more cash to settle this payment.',
  'not your turn': 'It is not your turn yet.',
  'cannot roll now': 'You cannot roll right now.',
  'turn cannot end now': 'Finish the current action before ending your turn.',
  'auction is still active': 'The auction is still running.',
  'no auction is active': 'That auction already closed.',
  'invalid bid': 'That bid is too low or more than your cash.',
  'winning bidder cannot pay': 'The winning bid exceeds the available cash.',
  'game is paused': 'The game is paused. The host can resume it.',
  'cannot pause': 'The game cannot be paused right now.',
  'cannot resume': 'The game cannot be resumed right now.',
  'jail fine is unavailable': 'You cannot pay the Jail fine right now.',
  'jail card is unavailable': 'You do not have a Get Out of Jail Free card.',
  'bankruptcy is unavailable': 'You can only declare bankruptcy while a payment is due.',
  'no debt is awaiting payment': 'There is no payment due right now.',
  'no property is offered': 'There is no property to act on right now.',
  'invalid trade': 'That trade is not valid.',
  'trade is unavailable': 'That trade is no longer available.',
  'trade cash is unavailable': 'The offered cash is no longer available.',
  'offered property is unavailable': 'An offered deed is no longer available.',
  'requested property is unavailable': 'A requested deed is no longer available.',
  'sell buildings before trading this color group': 'Sell the buildings in this color group before trading it.',
  'only the host can start': 'Only the host can start the game.',
  'choose a character first': 'Choose a character first.',
  'character already used': 'Another player already has that character.',
  '2–6 ready players are required': 'The game needs 2–6 ready players to start.'
};

const NETWORK_PATTERN = /failed to fetch|networkerror|load failed|network request failed/iu;

export function friendlyError(message: string): string {
  const trimmed = message.trim();
  const known = ENGINE_COPY[trimmed];
  if (known) return known;
  if (NETWORK_PATTERN.test(trimmed)) return 'No connection right now. Retrying automatically.';
  if (!trimmed) return 'Something went wrong. Try again.';
  const sentence = trimmed[0]!.toUpperCase() + trimmed.slice(1);
  return /[.!?]$/u.test(sentence) ? sentence : `${sentence}.`;
}
