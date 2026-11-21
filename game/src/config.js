// Palm City — one place for every number the game tunes by.
// Distances are world pixels, times are seconds, speeds are px/s.
export const WORLD = 2880; // the city is WORLD by WORLD
export const PITCH = 360; // distance between neighbouring road centrelines
export const ROAD_W = 72; // how wide each road is
export const BLOCK = PITCH - ROAD_W; // 288 — the block between two roads
export const SAVE_KEY = 'palmcity.save.v1';
export const STEP = 1 / 60; // fixed simulation step

// The player on foot.
export const PLAYER = {
  radius: 11,
  walkSpeed: 170,
  sprintSpeed: 265,
  health: 100,
  punchRange: 34,
  punchDamage: 34,
  punchCooldown: 0.38,
};

// Every car class: body size, top speed, acceleration and how much it grips
// the road sideways. Grip near 1 means almost no slide.
export const CAR = {
  sedan: { len: 52, wid: 26, top: 430, accel: 300, grip: 0.86, hp: 100, name: 'Sedan' },
  taxi: { len: 52, wid: 26, top: 420, accel: 290, grip: 0.86, hp: 100, name: 'Taxi' },
  sports: { len: 54, wid: 26, top: 560, accel: 420, grip: 0.94, hp: 80, name: 'Comet GT' },
  truck: { len: 66, wid: 30, top: 360, accel: 220, grip: 0.8, hp: 160, name: 'Truck' },
  police: { len: 54, wid: 26, top: 500, accel: 380, grip: 0.92, hp: 120, name: 'Police' },
  van: { len: 60, wid: 28, top: 380, accel: 240, grip: 0.82, hp: 140, name: 'Van' },
};

// How the heat scales with the star count: how many police units hunt, how
// often a new one spawns, and how long out of sight before a star drops.
export const WANTED = {
  units: [0, 2, 3, 4, 6, 8],
  spawnEvery: [0, 4.5, 3.5, 2.8, 2.2, 1.8],
  decayAfter: [0, 9, 11, 13, 16, 20],
};

// Prices and fines, in dollars.
export const ECONOMY = {
  sprayCost: 100,
  pistolCost: 300,
  ammoCost: 50,
  ammoPack: 12,
  bustFine: 200,
  wasteFine: 250,
};

// The story, in order. Rewards: 150 + 300 + 400 + 600 + 1500, on top of the
// $100 the player starts with — $100 → $250 → $550 → $950 → $1,550 → $3,550.
export const MISSIONS = [
  { id: 'wheels', name: 'Wheels', reward: 150, text: 'Steal a car and bring it to the garage.' },
  { id: 'drop', name: 'The Drop', reward: 300, text: 'Deliver the package across town in 90s. No damage, no questions.' },
  { id: 'heat', name: 'Heat', reward: 400, text: 'Get to 3 stars, then lose the cops. Show them what clean means.' },
  { id: 'collector', name: 'The Collector', reward: 600, text: 'Steal the Comet GT at the marina and deliver it to the chop shop.' },
  { id: 'bigone', name: 'The Big One', reward: 1500, text: 'Hit the bank, grab the cash, lose 4 stars and reach the safehouse.' },
];

// The look: warm asphalt, pale sidewalks, pastel roofs, turquoise water.
export const PALETTE = {
  grass: '#8fbf6a',
  sand: '#e8d39a',
  water: '#3fb3c9',
  waterDeep: '#2a8fa8',
  asphalt: '#4a4a52',
  asphaltDark: '#3e3e46',
  roadLine: '#f2c94c',
  sidewalk: '#c9c2b4',
  sidewalkLine: '#b3ab99',
  buildingRoof: ['#d96b4f', '#e8a34c', '#7fb3a3', '#c96f8e', '#8fa3c9', '#d9c06a', '#a98bc9', '#e07856'],
  buildingWall: ['#c05a42', '#cf8a3e', '#6f9c8e', '#b25a78', '#7d90b5', '#c2a854', '#9678b5', '#c96448'],
  park: '#6da85c',
  tree: '#3f7d44',
  palm: '#2f8f5b',
};
