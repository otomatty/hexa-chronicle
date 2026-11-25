// ゲーム状態の型定義。状態はすべてJSON化可能なプレーンオブジェクトで保持する
// （セーブ／将来のサーバー同期でそのまま送れるようにするため）。

export type Terrain = 'ocean' | 'coast' | 'grass' | 'plains' | 'desert' | 'tundra' | 'snow';
export type Feature = '' | 'forest' | 'jungle' | 'marsh';

export interface Yields {
  food: number;
  prod: number;
  gold: number;
  sci: number;
  cul: number;
}

export interface Tile {
  terrain: Terrain;
  /** 0: 平地, 1: 丘陵, 2: 山岳 */
  elev: number;
  feature: Feature;
  resource: string;
  improvement: string;
  /** 所有プレイヤー (-1: なし) */
  owner: number;
  /** 所属都市ID (-1: なし) */
  cityId: number;
  /** 蛮族の野営地 */
  camp: boolean;
  /** 川が流れている辺のビットマスク（bit d = 隣接方向 d との境界） */
  river: number;
  /** 自然遺産の種類（なければ空文字） */
  wonder: string;
}

export interface Unit {
  id: number;
  type: string;
  owner: number;
  pos: number;
  hp: number;
  moves: number;
  /** このターンに攻撃済み */
  attacked: boolean;
  /** このターンに行動した（回復判定用） */
  acted: boolean;
  /** 防御態勢の継続ターン数 */
  fortified: number;
  sleeping: boolean;
  /** このターンは指示不要 */
  skipped: boolean;
  /** 労働者の残り回数 */
  charges: number;
  /** 移動先の予約 (-1: なし) */
  goto: number;
  /** 自動探索 */
  auto: boolean;
  /** 蛮族の野営地守備 */
  guard: boolean;
}

export interface City {
  id: number;
  name: string;
  owner: number;
  /** 建設した文明（制覇勝利の判定用） */
  founder: number;
  /** 建設者の最初の首都か */
  originalCapital: boolean;
  capital: boolean;
  pos: number;
  pop: number;
  food: number;
  prod: number;
  /** 国境拡大用の文化ストック */
  culture: number;
  tilesClaimed: number;
  queue: string[];
  buildings: string[];
  hp: number;
  worked: number[];
  founded: number;
}

export interface Player {
  id: number;
  civ: string;
  name: string;
  leader: string;
  color: string;
  color2: string;
  human: boolean;
  barb: boolean;
  alive: boolean;
  gold: number;
  techs: string[];
  research: string;
  progress: Record<string, number>;
  sciOverflow: number;
  spaceStage: number;
  score: number;
  cityNameIdx: number;
  /** 発見済みの自然遺産 */
  wonders: string[];
  /** 直近ターンの収支（表示用） */
  income: { gold: number; sci: number; cul: number };
}

export interface Camp {
  pos: number;
  cooldown: number;
}

export interface Winner {
  player: number;
  kind: 'domination' | 'science' | 'score';
}

export type GameEvent =
  | { type: 'move'; unit: number; owner: number; path: number[] }
  | {
      type: 'attack';
      attacker: number;
      owner: number;
      from: number;
      to: number;
      ranged: boolean;
      dmgDef: number;
      dmgAtk: number;
      defKilled: boolean;
      cityAttacker?: number;
    }
  | { type: 'unitDied'; unit: number; owner: number; pos: number }
  | { type: 'unitCreated'; unit: number; owner: number; pos: number }
  | { type: 'cityFounded'; city: number; owner: number; pos: number }
  | { type: 'cityCaptured'; city: number; from: number; to: number; pos: number }
  | { type: 'cityGrew'; city: number; owner: number }
  | { type: 'built'; city: number; owner: number; item: string }
  | { type: 'tech'; owner: number; tech: string }
  | { type: 'war'; a: number; b: number }
  | { type: 'peace'; a: number; b: number }
  | { type: 'peaceOffer'; from: number; to: number }
  | { type: 'met'; a: number; b: number }
  | { type: 'eliminated'; player: number; by: number }
  | { type: 'space'; owner: number; stage: number }
  | { type: 'campCleared'; owner: number; pos: number; gold: number }
  | { type: 'needProduction'; city: number; owner: number }
  | { type: 'notify'; owner: number; text: string; pos?: number }
  | { type: 'wonder'; owner: number; wonder: string; pos: number; gold: number }
  | { type: 'victory'; winner: Winner }
  | { type: 'turn'; player: number };

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  turn: number;
  maxTurns: number;
  /** 0: 開拓者, 1: 標準, 2: 上級, 3: 覇王 */
  difficulty: number;
  current: number;
  w: number;
  h: number;
  tiles: Tile[];
  units: Record<number, Unit>;
  cities: Record<number, City>;
  players: Player[];
  /** war[a][b]: 戦争状態 */
  war: boolean[][];
  met: boolean[][];
  /** 再宣戦が可能になるターン */
  truce: number[][];
  /** peaceOffer[a][b]: aがbに和平を提案したターン (-1: なし) */
  peaceOffer: number[][];
  warSince: number[][];
  /** 視界: 0 未探索, 1 探索済み, 2 視界内 */
  vis: number[][];
  camps: Camp[];
  nextId: number;
  winner: Winner | null;
  /** 描画側が消費する一時イベント（セーブしない） */
  events: GameEvent[];
}

export type Action =
  | { type: 'move'; unit: number; to: number }
  | { type: 'attack'; unit: number; target: number }
  | { type: 'found'; unit: number }
  | { type: 'improve'; unit: number; improvement: string }
  | { type: 'fortify'; unit: number }
  | { type: 'sleep'; unit: number }
  | { type: 'wake'; unit: number }
  | { type: 'skip'; unit: number }
  | { type: 'explore'; unit: number }
  | { type: 'disband'; unit: number }
  | { type: 'setQueue'; city: number; queue: string[] }
  | { type: 'buy'; city: number; item: string }
  | { type: 'research'; tech: string }
  | { type: 'declareWar'; target: number }
  | { type: 'makePeace'; target: number }
  | { type: 'endTurn' };

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface NewGameOptions {
  seed: number;
  size: 'small' | 'standard' | 'large';
  civ: string;
  opponents: number;
  difficulty: number;
  /** 全員AI（検証用） */
  allAI?: boolean;
}
