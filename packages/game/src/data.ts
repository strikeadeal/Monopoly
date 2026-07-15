import type { BoardSpace, GameCard, RailroadSpace, StreetSpace, UtilitySpace } from './types';

const street = (index: number, name: string, color: StreetSpace['color'], price: number, buildCost: number, rents: StreetSpace['rents']): StreetSpace => ({
  index, name, type: 'street', color, price, mortgage: price / 2, buildCost, rents
});
const railroad = (index: number, name: string): RailroadSpace => ({ index, name, type: 'railroad', price: 200, mortgage: 100 });
const utility = (index: number, name: string): UtilitySpace => ({ index, name, type: 'utility', price: 150, mortgage: 75 });

export const BOARD: BoardSpace[] = [
  { index: 0, name: 'GO', type: 'go' },
  street(1, 'Mediterranean Avenue', 'brown', 60, 50, [2, 10, 30, 90, 160, 250]),
  { index: 2, name: 'Community Chest', type: 'community-chest' },
  street(3, 'Baltic Avenue', 'brown', 60, 50, [4, 20, 60, 180, 320, 450]),
  { index: 4, name: 'Income Tax', type: 'tax', amount: 200 },
  railroad(5, 'Reading Railroad'),
  street(6, 'Oriental Avenue', 'light-blue', 100, 50, [6, 30, 90, 270, 400, 550]),
  { index: 7, name: 'Chance', type: 'chance' },
  street(8, 'Vermont Avenue', 'light-blue', 100, 50, [6, 30, 90, 270, 400, 550]),
  street(9, 'Connecticut Avenue', 'light-blue', 120, 50, [8, 40, 100, 300, 450, 600]),
  { index: 10, name: 'Jail / Just Visiting', type: 'jail' },
  street(11, 'St. Charles Place', 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  utility(12, 'Electric Company'),
  street(13, 'States Avenue', 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  street(14, 'Virginia Avenue', 'pink', 160, 100, [12, 60, 180, 500, 700, 900]),
  railroad(15, 'Pennsylvania Railroad'),
  street(16, 'St. James Place', 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  { index: 17, name: 'Community Chest', type: 'community-chest' },
  street(18, 'Tennessee Avenue', 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  street(19, 'New York Avenue', 'orange', 200, 100, [16, 80, 220, 600, 800, 1000]),
  { index: 20, name: 'Free Parking', type: 'free-parking' },
  street(21, 'Kentucky Avenue', 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  { index: 22, name: 'Chance', type: 'chance' },
  street(23, 'Indiana Avenue', 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  street(24, 'Illinois Avenue', 'red', 240, 150, [20, 100, 300, 750, 925, 1100]),
  railroad(25, 'B&O Railroad'),
  street(26, 'Atlantic Avenue', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  street(27, 'Ventnor Avenue', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  utility(28, 'Water Works'),
  street(29, 'Marvin Gardens', 'yellow', 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { index: 30, name: 'Go To Jail', type: 'go-to-jail' },
  street(31, 'Pacific Avenue', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  street(32, 'North Carolina Avenue', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { index: 33, name: 'Community Chest', type: 'community-chest' },
  street(34, 'Pennsylvania Avenue', 'green', 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  railroad(35, 'Short Line'),
  { index: 36, name: 'Chance', type: 'chance' },
  street(37, 'Park Place', 'dark-blue', 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { index: 38, name: 'Luxury Tax', type: 'tax', amount: 100 },
  street(39, 'Boardwalk', 'dark-blue', 400, 200, [50, 200, 600, 1400, 1700, 2000])
];

const card = (id: string, deck: GameCard['deck'], title: string, detail: string, effect: GameCard['effect']): GameCard => ({ id, deck, title, detail, effect });

export const CHANCE_CARDS: GameCard[] = [
  card('ch-boardwalk', 'chance', 'Boardwalk awaits', 'Advance to Boardwalk.', { type: 'move-to', index: 39, collectGo: false }),
  card('ch-go', 'chance', 'Start fresh', 'Advance to GO and collect $200.', { type: 'move-to', index: 0, collectGo: true }),
  card('ch-illinois', 'chance', 'Illinois Avenue', 'Advance to Illinois Avenue. Collect $200 if you pass GO.', { type: 'move-to', index: 24, collectGo: true }),
  card('ch-charles', 'chance', 'St. Charles Place', 'Advance to St. Charles Place. Collect $200 if you pass GO.', { type: 'move-to', index: 11, collectGo: true }),
  card('ch-rail-1', 'chance', 'Catch the train', 'Advance to the nearest railroad. Owned rent is doubled.', { type: 'move-nearest', kind: 'railroad', rentMultiplier: 2 }),
  card('ch-rail-2', 'chance', 'Express service', 'Advance to the nearest railroad. Owned rent is doubled.', { type: 'move-nearest', kind: 'railroad', rentMultiplier: 2 }),
  card('ch-utility', 'chance', 'Utility inspection', 'Advance to the nearest utility. Owned rent is ten times a fresh roll.', { type: 'move-nearest', kind: 'utility', rentMultiplier: 10 }),
  card('ch-dividend', 'chance', 'Dividend', 'Collect $50 from the Bank.', { type: 'money-bank', amount: 50 }),
  card('ch-jail-free', 'chance', 'Keep this card', 'Get Out of Jail Free.', { type: 'jail-free' }),
  card('ch-back-3', 'chance', 'A small detour', 'Move back three spaces.', { type: 'move-relative', spaces: -3 }),
  card('ch-jail', 'chance', 'Go directly to Jail', 'Do not pass GO or collect $200.', { type: 'jail' }),
  card('ch-repairs', 'chance', 'General repairs', 'Pay $25 per house and $100 per hotel.', { type: 'repairs', house: 25, hotel: 100 }),
  card('ch-speeding', 'chance', 'Speeding fine', 'Pay the Bank $15.', { type: 'money-bank', amount: -15 }),
  card('ch-reading', 'chance', 'Reading Railroad', 'Take a trip to Reading Railroad. Collect $200 if you pass GO.', { type: 'move-to', index: 5, collectGo: true }),
  card('ch-chair', 'chance', 'Table chair', 'Pay every other player $50.', { type: 'money-players', amount: -50 }),
  card('ch-loan', 'chance', 'Building loan', 'Collect $150 from the Bank.', { type: 'money-bank', amount: 150 })
];

export const COMMUNITY_CHEST_CARDS: GameCard[] = [
  card('cc-neighbor', 'community-chest', 'Good neighbor', 'Collect $100.', { type: 'money-bank', amount: 100 }),
  card('cc-cleanup', 'community-chest', 'Town cleanup', 'Collect $50.', { type: 'money-bank', amount: 50 }),
  card('cc-blood', 'community-chest', 'Donation day', 'Collect $10.', { type: 'money-bank', amount: 10 }),
  card('cc-cookies', 'community-chest', 'Bake sale', 'Pay $50.', { type: 'money-bank', amount: -50 }),
  card('cc-jail-free', 'community-chest', 'Rescue day', 'Get Out of Jail Free.', { type: 'jail-free' }),
  card('cc-party', 'community-chest', 'Street party', 'Collect $10 from every other player.', { type: 'money-players', amount: 10 }),
  card('cc-jail', 'community-chest', 'Quiet hours', 'Go directly to Jail.', { type: 'jail' }),
  card('cc-lunch', 'community-chest', 'A shared lunch', 'Collect $20.', { type: 'money-bank', amount: 20 }),
  card('cc-playground', 'community-chest', 'Playground project', 'Collect $100.', { type: 'money-bank', amount: 100 }),
  card('cc-hospital', 'community-chest', 'Hospital games day', 'Collect $100.', { type: 'money-bank', amount: 100 }),
  card('cc-carwash', 'community-chest', 'Car wash mishap', 'Pay $100.', { type: 'money-bank', amount: -100 }),
  card('cc-go', 'community-chest', 'Fundraising finish', 'Advance to GO and collect $200.', { type: 'move-to', index: 0, collectGo: true }),
  card('cc-storm', 'community-chest', 'Storm cleanup', 'Collect $200.', { type: 'money-bank', amount: 200 }),
  card('cc-shelter', 'community-chest', 'Animal shelter', 'Pay $50.', { type: 'money-bank', amount: -50 }),
  card('cc-repairs', 'community-chest', 'Home improvement', 'Pay $40 per house and $115 per hotel.', { type: 'repairs', house: 40, hotel: 115 }),
  card('cc-school', 'community-chest', 'School bake sale', 'Collect $25.', { type: 'money-bank', amount: 25 })
];

export const PROPERTY_SPACES = BOARD.filter((space): space is StreetSpace | RailroadSpace | UtilitySpace => ['street', 'railroad', 'utility'].includes(space.type));
export const CARD_BY_ID = new Map([...CHANCE_CARDS, ...COMMUNITY_CHEST_CARDS].map((item) => [item.id, item]));
