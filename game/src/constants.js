// Palm City — Sunset Heist: every tunable number in one place.
//
// The city is a 2880x2880 top-down grid. Roads run on a regular lattice;
// the blocks between them hold buildings, parks, parking lots and shops.
// Nothing here is a Rockstar asset: the city, the names and the story are
// invented for this game.

export const WORLD = {
  size: 2880,
  cell: 360, // distance between neighbouring road centrelines
  roadHalf: 38, // half the width of a road
  lane: 15, // how far right of a road centreline cars drive
  beachX: 2700, // east of this the ground is sand, then water
  waterX: 2792, // east of this the ground is water
};

export const ECONOMY = {
  startCash: 100,
  sprayCost: 100,
  gunCost: 300,
  ammoCost: 50,
  ammoPack: 12,
  taxiFareMin: 40,
  taxiFareMax: 85,
  packageValue: 50,
  rampageBonus: 100,
  rampageKills: 3,
  rampageWindow: 10, // seconds
  bustFineRate: 0.2,
  bustFineMin: 50,
  bustFineMax: 500,
};

export const PLAYER_TUNE = {
  walkSpeed: 195, // px/s on foot
  hp: 100,
  hpRegen: 2.5, // hp/s while unwatched and not wanted
  punchRange: 46,
  punchDamage: 34,
  punchCooldown: 0.45,
  gunRange: 420,
  gunDamage: 55,
  gunCooldown: 0.32,
  stealRange: 60,
  interactRange: 64,
};

export const CAR_TUNE = {
  accel: 340, // px/s^2
  reverseAccel: 220,
  topSpeed: 430,
  reverseTop: 140,
  brake: 620,
  drag: 0.55, // 1/s, exponential speed loss
  steerRate: 2.5, // rad/s at full lock, scaled by speed
  steerSpeedFalloff: 0.45, // steering authority lost at top speed
  grip: 6.0, // 1/s, how fast velocity aligns with heading
  driftGrip: 1.4, // grip while the handbrake is held
  crashDamage: 22, // hp lost by a car on a hard building hit
  crashSpeed: 240, // impact speed that starts hurting
  carHp: 100,
  ramDamagePerSec: 11.5, // police ram damage, per second of contact
  cometTopSpeed: 520, // the pink Comet GT is the fastest car
};

export const TRAFFIC_TUNE = {
  count: 9,
  cruiseMin: 120,
  cruiseMax: 190,
  brakeGap: 66, // stop when something is this close ahead
  pedCount: 26,
  pedSpeedMin: 42,
  pedSpeedMax: 78,
  fleeSpeed: 150,
  witnessRange: 280,
  witnessDelay: 0.6,
};

export const WANTED_TUNE = {
  maxStars: 5,
  decayDelay: 6, // seconds unseen before a star drops
  policeCarPerStar: 1, // cars on the street, capped
  policeCarCap: 3,
  footCopPerStar: 1,
  footCopCap: 3,
  chaseReplan: 1.5, // seconds between police route replans
  copSpeed: 205,
  copTouchTime: 0.8, // seconds of contact to bust the player
  sightRange: 430,
};

export const MISSIONS = [
  {
    id: 'wheels',
    name: 'Wheels',
    reward: 150,
    intro: 'Delia wants wheels. Get a car and bring it to the chop shop.',
    steps: [
      { kind: 'goto', label: 'Go to the garage', x: 720, y: 806, r: 52 },
      { kind: 'enterCar', label: 'Get in a car', x: 720, y: 806, r: 160 },
      { kind: 'goto', label: 'Drive to the chop shop', x: 2160, y: 1166, r: 60 },
    ],
  },
  {
    id: 'drop',
    name: 'The Drop',
    reward: 300,
    timer: 90,
    intro: 'A package is waiting at the gun shop. Ninety seconds. No mistakes.',
    steps: [
      { kind: 'goto', label: 'Pick up the package', x: 1080, y: 2606, r: 56 },
      { kind: 'goto', label: 'Deliver it downtown', x: 1440, y: 1440, r: 60 },
    ],
  },
  {
    id: 'heat',
    name: 'Heat',
    reward: 400,
    intro: 'Delia wants the city to know your name. Make three stars, then vanish.',
    steps: [
      { kind: 'heat', label: 'Make heat — reach 3 stars', x: 1440, y: 1886, r: 70 },
      { kind: 'loseHeat', label: 'Lose the heat', x: 1440, y: 1886, r: 70 },
    ],
  },
  {
    id: 'collector',
    name: 'The Collector',
    reward: 600,
    intro: 'A pink Comet GT is parked at the marina. It is not theirs anymore.',
    steps: [
      { kind: 'goto', label: 'Go to the marina', x: 2660, y: 1260, r: 60 },
      { kind: 'steal', label: 'Steal the pink Comet GT', x: 2660, y: 1260, r: 70 },
      { kind: 'goto', label: 'Bring it to the garage', x: 720, y: 806, r: 60 },
    ],
  },
  {
    id: 'bigone',
    name: 'The Big One',
    reward: 0, // the $500 comes at the robbery itself; the $1,500 at the escape
    bonus: 1500,
    intro: 'The bank. Four stars on the way out. The safehouse after that.',
    steps: [
      { kind: 'goto', label: 'Go to the bank', x: 2520, y: 2246, r: 56 },
      { kind: 'rob', label: 'Rob the bank — hold still', x: 2520, y: 2246, r: 60 },
      { kind: 'escape', label: 'Escape to the safehouse', x: 720, y: 2606, r: 60 },
    ],
  },
];

// Where the named places sit. Each entry: the shop's building centre, the
// marker the player walks or drives to (the entrance, just outside the
// building — never inside it), and the colour the map draws it in.
export const PLACES = {
  garage: { x: 720, y: 720, mx: 720, my: 806, colour: '#f2b705', label: 'Garage' },
  chopShop: { x: 2160, y: 1080, mx: 2160, my: 1166, colour: '#e4572e', label: 'Chop Shop' },
  spray: { x: 1440, y: 1800, mx: 1440, my: 1886, colour: '#17a398', label: 'Pay-n-Spray' },
  gunShop: { x: 1080, y: 2520, mx: 1080, my: 2606, colour: '#6c5ce7', label: 'Gun Shop' },
  bank: { x: 2520, y: 2160, mx: 2520, my: 2246, colour: '#d63031', label: 'Bank' },
  marina: { x: 2660, y: 1260, mx: 2660, my: 1260, colour: '#0984e3', label: 'Marina' },
  safehouse: { x: 720, y: 2520, mx: 720, my: 2606, colour: '#00b894', label: 'Safehouse' },
  police: { x: 1800, y: 720, mx: 1800, my: 878, colour: '#2d3436', label: 'Police HQ' },
};

export const PALETTE = {
  grass: '#5d8a4a',
  parkGrass: '#6fa055',
  sidewalk: '#9aa0a6',
  asphalt: '#33373d',
  roadLine: '#e8e3c8',
  sand: '#e0c98f',
  water: '#2e86ab',
  waterDeep: '#1f5f7a',
  buildingRoof: ['#b5654a', '#7a6a53', '#5d6d7e', '#8e6ba8', '#4a7a6a', '#a85d5d'],
  carColours: ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400', '#7f8c8d'],
  cometPink: '#ff5fa2',
  policeBody: '#22252a',
  playerJacket: '#ffd32a',
};

export const SHOT_SCENES = [
  { name: '1-cover.jpg', query: '?shot=cover&seed=7' },
  { name: '2-foot.jpg', query: '?shot=foot&seed=7' },
  { name: '3-chase.jpg', query: '?shot=chase&seed=3' },
  { name: '4-mission.jpg', query: '?shot=mission&seed=7' },
];
