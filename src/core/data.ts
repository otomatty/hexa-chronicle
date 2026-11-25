// ゲームデータ定義。文明・指導者・都市名はすべて本作オリジナルの架空設定。
import type { Yields } from './types';

export const Y = (food = 0, prod = 0, gold = 0, sci = 0, cul = 0): Yields => ({ food, prod, gold, sci, cul });

export const ERAS = ['太古', '古典', '中世', 'ルネサンス', '産業', '近代', '宇宙'];

// ---------------------------------------------------------------- 地形
export const TERRAIN: Record<string, { name: string; y: Yields; water?: boolean }> = {
  ocean: { name: '外洋', y: Y(1, 0, 0), water: true },
  coast: { name: '沿岸', y: Y(1, 0, 1), water: true },
  grass: { name: '草原', y: Y(2, 0, 0) },
  plains: { name: '平原', y: Y(1, 1, 0) },
  desert: { name: '砂漠', y: Y(0, 0, 0) },
  tundra: { name: 'ツンドラ', y: Y(1, 0, 0) },
  snow: { name: '雪原', y: Y(0, 0, 0) },
};

export const FEATURE: Record<string, { name: string; y: Yields }> = {
  forest: { name: '森林', y: Y(0, 1, 0) },
  jungle: { name: '密林', y: Y(1, 0, 0) },
  marsh: { name: '湿地', y: Y(1, 0, 0) },
};

// ---------------------------------------------------------------- 資源
export interface ResourceDef {
  name: string;
  kind: 'bonus' | 'strategic' | 'luxury';
  y: Yields;
  improvement: string;
  icon: string;
}
export const RESOURCES: Record<string, ResourceDef> = {
  wheat: { name: '小麦', kind: 'bonus', y: Y(1), improvement: 'farm', icon: '🌾' },
  cattle: { name: '牛', kind: 'bonus', y: Y(1), improvement: 'pasture', icon: '🐄' },
  stone: { name: '石材', kind: 'bonus', y: Y(0, 1), improvement: 'mine', icon: '🪨' },
  fish: { name: '魚', kind: 'bonus', y: Y(1), improvement: '', icon: '🐟' },
  horses: { name: '馬', kind: 'strategic', y: Y(0, 1), improvement: 'pasture', icon: '🐎' },
  iron: { name: '鉄', kind: 'strategic', y: Y(0, 1), improvement: 'mine', icon: '⛓️' },
  wine: { name: 'ワイン', kind: 'luxury', y: Y(0, 0, 2), improvement: 'plantation', icon: '🍇' },
  silk: { name: '絹', kind: 'luxury', y: Y(0, 0, 2), improvement: 'plantation', icon: '🧵' },
  spices: { name: '香辛料', kind: 'luxury', y: Y(0, 0, 2), improvement: 'plantation', icon: '🌶️' },
  gems: { name: '宝石', kind: 'luxury', y: Y(0, 0, 3), improvement: 'mine', icon: '💎' },
};

// ---------------------------------------------------------------- 自然遺産（すべて本作オリジナル）
export interface WonderDef {
  name: string;
  y: Yields;
  desc: string;
  /** 置かれやすい地形 */
  prefer: string[];
  /** 丘陵として扱うか */
  hill: boolean;
}
export const WONDERS: Record<string, WonderDef> = {
  spire: { name: '天の柱', y: Y(0, 0, 0, 1, 3), desc: '雲を突く岩の尖塔群', prefer: ['plains', 'grass', 'desert'], hill: true },
  crater: { name: '竜の火口', y: Y(0, 3, 0, 1, 0), desc: '今も煙を上げる火口', prefer: ['plains', 'tundra', 'grass'], hill: true },
  springs: { name: '虹の泉', y: Y(2, 0, 0, 2, 0), desc: '七色の段丘をなす温泉', prefer: ['tundra', 'plains', 'grass'], hill: false },
  elder: { name: '千年樹', y: Y(2, 0, 0, 0, 2), desc: '森を見下ろす巨木', prefer: ['grass'], hill: false },
  crystal: { name: '水晶の谷', y: Y(0, 0, 3, 1, 0), desc: '巨大な結晶が林立する谷', prefer: ['tundra', 'snow', 'plains'], hill: true },
  arch: { name: '月の門', y: Y(0, 0, 2, 0, 2), desc: '風が削り出した岩の門', prefer: ['desert', 'plains'], hill: false },
};

// ---------------------------------------------------------------- 地形改良
export interface ImprovementDef {
  name: string;
  y: Yields;
  tech?: string;
  /** 追加産出を与える技術 */
  boostTech?: string;
  boost?: Yields;
}
export const IMPROVEMENTS: Record<string, ImprovementDef> = {
  farm: { name: '農場', y: Y(1), boostTech: 'education', boost: Y(1) },
  mine: { name: '鉱山', y: Y(0, 2), tech: 'mining', boostTech: 'industrialization', boost: Y(0, 1) },
  pasture: { name: '牧草地', y: Y(1, 1), tech: 'animal' },
  plantation: { name: '農園', y: Y(0, 0, 2, 0, 1), tech: 'pottery' },
  lumbermill: { name: '製材所', y: Y(0, 1), tech: 'construction', boostTech: 'industrialization', boost: Y(0, 1) },
};

// ---------------------------------------------------------------- 技術
export interface TechDef {
  name: string;
  era: number;
  cost: number;
  req: string[];
}
export const TECHS: Record<string, TechDef> = {
  pottery: { name: '陶器', era: 0, cost: 25, req: [] },
  animal: { name: '畜産', era: 0, cost: 25, req: [] },
  mining: { name: '採鉱', era: 0, cost: 25, req: [] },
  sailing: { name: '帆走', era: 0, cost: 40, req: [] },
  archery: { name: '弓術', era: 0, cost: 40, req: ['animal'] },
  writing: { name: '文字', era: 0, cost: 45, req: ['pottery'] },
  masonry: { name: '石工術', era: 0, cost: 60, req: ['mining'] },
  bronze: { name: '青銅器', era: 0, cost: 60, req: ['mining'] },
  wheel: { name: '車輪', era: 0, cost: 60, req: ['mining'] },

  currency: { name: '通貨', era: 1, cost: 100, req: ['writing'] },
  celestial: { name: '天文航法', era: 1, cost: 100, req: ['sailing', 'writing'] },
  horseback: { name: '騎乗', era: 1, cost: 100, req: ['animal'] },
  iron: { name: '鉄器', era: 1, cost: 110, req: ['bronze'] },
  mathematics: { name: '数学', era: 1, cost: 140, req: ['writing', 'wheel'] },
  construction: { name: '建築学', era: 1, cost: 140, req: ['masonry', 'wheel'] },

  apprenticeship: { name: '徒弟制度', era: 2, cost: 240, req: ['currency', 'iron'] },
  tactics: { name: '軍事戦術', era: 2, cost: 260, req: ['mathematics'] },
  machinery: { name: '機械', era: 2, cost: 280, req: ['iron', 'construction'] },
  education: { name: '教育', era: 2, cost: 300, req: ['mathematics'] },
  stirrups: { name: '鐙', era: 2, cost: 300, req: ['horseback', 'iron'] },

  cartography: { name: '地図製作', era: 3, cost: 420, req: ['celestial', 'education'] },
  printing: { name: '活版印刷', era: 3, cost: 430, req: ['education', 'machinery'] },
  banking: { name: '銀行制度', era: 3, cost: 450, req: ['education', 'apprenticeship'] },
  gunpowder: { name: '火薬', era: 3, cost: 480, req: ['machinery', 'apprenticeship'] },
  casting: { name: '鋳造', era: 3, cost: 500, req: ['gunpowder'] },

  industrialization: { name: '工業化', era: 4, cost: 700, req: ['banking', 'gunpowder'] },
  scitheory: { name: '科学理論', era: 4, cost: 750, req: ['banking', 'printing'] },
  milscience: { name: '軍事科学', era: 4, cost: 780, req: ['casting'] },
  ballistics: { name: '弾道学', era: 4, cost: 800, req: ['casting'] },
  rifling: { name: 'ライフリング', era: 4, cost: 850, req: ['milscience', 'industrialization'] },

  electricity: { name: '電気', era: 5, cost: 1000, req: ['scitheory', 'industrialization'] },
  steel: { name: '鉄鋼', era: 5, cost: 1050, req: ['rifling', 'ballistics'] },
  radio: { name: '無線通信', era: 5, cost: 1100, req: ['electricity'] },
  combustion: { name: '内燃機関', era: 5, cost: 1150, req: ['steel', 'electricity'] },
  rocketry: { name: 'ロケット工学', era: 5, cost: 1400, req: ['radio', 'steel'] },

  spaceflight: { name: '宇宙飛行', era: 6, cost: 1800, req: ['rocketry', 'combustion'] },
};

// 後半の研究が間延びしないよう、ルネサンス以降のコストを圧縮する
for (const k in TECHS) if (TECHS[k].era >= 3) TECHS[k].cost = Math.round((TECHS[k].cost * 0.82) / 10) * 10;

// ---------------------------------------------------------------- ユニット
export type UnitClass =
  | 'settler'
  | 'builder'
  | 'recon'
  | 'melee'
  | 'anticav'
  | 'ranged'
  | 'cavalry'
  | 'siege'
  | 'naval';

export interface UnitDef {
  name: string;
  cls: UnitClass;
  /** 描画モデルの種類 */
  model: string;
  str: number;
  rng?: number;
  range?: number;
  moves: number;
  cost: number;
  tech?: string;
  res?: string;
  sea?: boolean;
  civilian?: boolean;
  charges?: number;
  /** 外洋に出られる */
  ocean?: boolean;
  icon: string;
}
export const UNITS: Record<string, UnitDef> = {
  settler: { name: '開拓者', cls: 'settler', model: 'settler', str: 0, moves: 2, cost: 80, civilian: true, icon: '🏕️' },
  builder: { name: '労働者', cls: 'builder', model: 'builder', str: 0, moves: 2, cost: 50, civilian: true, charges: 3, icon: '🔨' },
  scout: { name: '斥候', cls: 'recon', model: 'scout', str: 10, moves: 3, cost: 30, icon: '🧭' },

  warrior: { name: '戦士', cls: 'melee', model: 'warrior', str: 20, moves: 2, cost: 40, icon: '🪓' },
  swordsman: { name: '剣士', cls: 'melee', model: 'swordsman', str: 36, moves: 2, cost: 90, tech: 'iron', res: 'iron', icon: '⚔️' },
  musketman: { name: 'マスケット兵', cls: 'melee', model: 'musket', str: 55, moves: 2, cost: 240, tech: 'gunpowder', icon: '🔫' },
  infantry: { name: '歩兵', cls: 'melee', model: 'infantry', str: 70, moves: 2, cost: 430, tech: 'rifling', icon: '🪖' },

  spearman: { name: '槍兵', cls: 'anticav', model: 'spear', str: 25, moves: 2, cost: 65, tech: 'bronze', icon: '🔱' },
  pikeman: { name: '長槍兵', cls: 'anticav', model: 'pike', str: 41, moves: 2, cost: 180, tech: 'tactics', icon: '🔱' },

  archer: { name: '弓兵', cls: 'ranged', model: 'archer', str: 15, rng: 25, range: 2, moves: 2, cost: 60, tech: 'archery', icon: '🏹' },
  crossbow: { name: '弩兵', cls: 'ranged', model: 'crossbow', str: 30, rng: 40, range: 2, moves: 2, cost: 180, tech: 'machinery', icon: '🏹' },
  fieldcannon: { name: '野戦砲', cls: 'ranged', model: 'cannon', str: 50, rng: 60, range: 2, moves: 2, cost: 330, tech: 'ballistics', icon: '💥' },

  horseman: { name: '騎兵', cls: 'cavalry', model: 'horse', str: 36, moves: 4, cost: 80, tech: 'horseback', res: 'horses', icon: '🐎' },
  knight: { name: '騎士', cls: 'cavalry', model: 'knight', str: 48, moves: 4, cost: 180, tech: 'stirrups', res: 'iron', icon: '🛡️' },
  cavalry: { name: '竜騎兵', cls: 'cavalry', model: 'cavalry', str: 62, moves: 5, cost: 330, tech: 'milscience', res: 'horses', icon: '🐎' },
  tank: { name: '戦車', cls: 'cavalry', model: 'tank', str: 82, moves: 4, cost: 480, tech: 'combustion', icon: '🚜' },

  catapult: { name: '投石機', cls: 'siege', model: 'catapult', str: 23, rng: 35, range: 2, moves: 2, cost: 120, tech: 'mathematics', icon: '🎯' },
  bombard: { name: '射石砲', cls: 'siege', model: 'cannon', str: 43, rng: 55, range: 2, moves: 2, cost: 280, tech: 'casting', icon: '💣' },
  artillery: { name: '重砲', cls: 'siege', model: 'artillery', str: 60, rng: 80, range: 3, moves: 2, cost: 430, tech: 'steel', icon: '💣' },

  galley: { name: 'ガレー船', cls: 'naval', model: 'galley', str: 30, moves: 3, cost: 65, tech: 'sailing', sea: true, icon: '⛵' },
  caravel: { name: 'キャラベル船', cls: 'naval', model: 'caravel', str: 55, moves: 4, cost: 240, tech: 'cartography', sea: true, ocean: true, icon: '⛵' },
  ironclad: { name: '装甲艦', cls: 'naval', model: 'ironclad', str: 75, moves: 5, cost: 420, tech: 'steel', sea: true, ocean: true, icon: '🚢' },
};

// ---------------------------------------------------------------- 建造物
export interface BuildingDef {
  name: string;
  cost: number;
  y: Yields;
  tech?: string;
  req?: string;
  coastal?: boolean;
  desc: string;
}
export const BUILDINGS: Record<string, BuildingDef> = {
  monument: { name: 'モニュメント', cost: 60, y: Y(0, 0, 0, 0, 2), desc: '文化+2' },
  granary: { name: '穀物庫', cost: 65, y: Y(2), tech: 'pottery', desc: '食料+2' },
  walls: { name: '城壁', cost: 80, y: Y(), tech: 'masonry', desc: '都市防御力+8、遠隔攻撃が可能に' },
  library: { name: '図書館', cost: 90, y: Y(0, 0, 0, 2), tech: 'writing', desc: '科学+2' },
  watermill: { name: '水車小屋', cost: 80, y: Y(1, 1), tech: 'wheel', desc: '食料+1 生産+1' },
  market: { name: '市場', cost: 120, y: Y(0, 0, 3), tech: 'currency', desc: 'ゴールド+3' },
  harbor: { name: '港', cost: 120, y: Y(1, 0, 2), tech: 'celestial', coastal: true, desc: '食料+1 ゴールド+2、沿岸タイルの食料+1' },
  aqueduct: { name: '水道橋', cost: 120, y: Y(3), tech: 'mathematics', desc: '食料+3' },
  amphitheater: { name: '円形劇場', cost: 150, y: Y(0, 0, 0, 0, 3), tech: 'construction', desc: '文化+3' },
  workshop: { name: '工房', cost: 195, y: Y(0, 3), tech: 'apprenticeship', desc: '生産+3' },
  university: { name: '大学', cost: 250, y: Y(0, 0, 0, 4), tech: 'education', req: 'library', desc: '科学+4' },
  bank: { name: '銀行', cost: 290, y: Y(0, 0, 5), tech: 'banking', req: 'market', desc: 'ゴールド+5' },
  museum: { name: '博物館', cost: 290, y: Y(0, 0, 0, 0, 4), tech: 'printing', desc: '文化+4' },
  factory: { name: '工場', cost: 390, y: Y(0, 5), tech: 'industrialization', req: 'workshop', desc: '生産+5' },
  laboratory: { name: '研究所', cost: 390, y: Y(0, 0, 0, 6), tech: 'scitheory', req: 'university', desc: '科学+6' },
  powerplant: { name: '発電所', cost: 480, y: Y(0, 6), tech: 'electricity', req: 'factory', desc: '生産+6' },
  broadcast: { name: '放送局', cost: 480, y: Y(0, 0, 2, 0, 6), tech: 'radio', desc: '文化+6 ゴールド+2' },
  institute: { name: '先端研究機構', cost: 560, y: Y(0, 0, 0, 9), tech: 'rocketry', req: 'laboratory', desc: '科学+9' },
};

// ---------------------------------------------------------------- 世界遺産（世界に 1 つだけ建てられる。すべて本作オリジナル）
export interface MarvelDef {
  name: string;
  cost: number;
  y: Yields;
  tech: string;
  coastal?: boolean;
  desc: string;
  /** 完成時に表示する一文 */
  quote: string;
}
export const MARVELS: Record<string, MarvelDef> = {
  sunstair: { name: '太陽の大階段', cost: 180, y: Y(0, 2, 0, 0, 3), tech: 'masonry', desc: '生産+2 文化+3', quote: '石を一段積むごとに、民は空へ近づいた。' },
  archive: { name: '賢者の大書庫', cost: 200, y: Y(0, 0, 0, 4, 1), tech: 'writing', desc: '科学+4 文化+1', quote: '言葉は積まれ、やがて知の山となる。' },
  beacon: { name: '暁の大灯台', cost: 220, y: Y(1, 0, 4, 0, 1), tech: 'celestial', coastal: true, desc: '食料+1 ゴールド+4 文化+1（沿岸の都市のみ）', quote: '夜の海に灯る一点が、千の船を家へ導く。' },
  gardens: { name: '雲上の庭園', cost: 240, y: Y(4, 0, 0, 0, 2), tech: 'mathematics', desc: '食料+4 文化+2', quote: '水は坂をのぼり、石の上に森が生まれた。' },
  colossus: { name: '守護の巨像', cost: 260, y: Y(0, 1, 3, 0, 2), tech: 'iron', desc: '生産+1 ゴールド+3 文化+2、都市防御力+6', quote: '巨像は語らない。ただ、そこに立ち続ける。' },
  spire: { name: '天文の尖塔', cost: 420, y: Y(0, 0, 0, 6, 1), tech: 'education', desc: '科学+6 文化+1', quote: '星を数えた者だけが、暦を手にした。' },
  cathedral: { name: '千窓の大聖堂', cost: 520, y: Y(0, 0, 2, 0, 7), tech: 'printing', desc: 'ゴールド+2 文化+7', quote: '千の窓から差す光は、千の色で祈りを染めた。' },
  clock: { name: '大時計塔', cost: 760, y: Y(0, 5, 4, 0, 1), tech: 'industrialization', desc: '生産+5 ゴールド+4 文化+1', quote: '鐘が時を刻むたび、街はひとつの機械になる。' },
  skytower: { name: '天空の塔', cost: 1000, y: Y(0, 0, 5, 2, 7), tech: 'radio', desc: 'ゴールド+5 科学+2 文化+7', quote: '声は塔を離れ、国境より遠くへ届いた。' },
  orbital: { name: '軌道の環', cost: 1300, y: Y(0, 3, 0, 10, 0), tech: 'rocketry', desc: '生産+3 科学+10', quote: '空に架けた環は、次の時代への門となった。' },
};

// ---------------------------------------------------------------- プロジェクト
export interface ProjectDef {
  name: string;
  cost: number;
  stage: number;
  desc: string;
}
export const PROJECTS: Record<string, ProjectDef> = {
  wealth: { name: '富の創出', cost: 0, stage: -1, desc: '生産力の半分をゴールドに変換する（継続）' },
  satellite: { name: '人工衛星の打ち上げ', cost: 600, stage: 0, desc: '宇宙開発 第1段階' },
  moon: { name: '月面着陸', cost: 850, stage: 1, desc: '宇宙開発 第2段階' },
  starship: { name: '恒星間探査船', cost: 1250, stage: 2, desc: '完成すると科学勝利' },
};

// ---------------------------------------------------------------- 文明
export interface CivDef {
  name: string;
  leader: string;
  color: string;
  color2: string;
  bonus: string;
  bonusDesc: string;
  /** AIの好戦度 0..1 */
  aggr: number;
  cities: string[];
}
export const CIVS: Record<string, CivDef> = {
  aurelia: {
    name: 'アウレリア帝国', leader: '執政官ヴァレンティア', color: '#b3262b', color2: '#f0c74a',
    bonus: 'military', bonusDesc: '軍事ユニットの生産コスト-15%', aggr: 0.8,
    cities: ['アウレア', 'ヴェルナ', 'カストラ', 'ルミナ', 'オスティオ', 'タレント', 'メディオ', 'ポルタ', 'アクィラ', 'セレナ'],
  },
  mizuho: {
    name: '瑞穂国', leader: '常磐ノ宮', color: '#f2efe6', color2: '#c2313a',
    bonus: 'coast', bonusDesc: '沿岸タイルの食料+1', aggr: 0.4,
    cities: ['常磐', '朝凪', '千早', '若葉', '霧島', '葦原', '白露', '八雲', '美浜', '弥栄'],
  },
  nordheim: {
    name: 'ノルドヘイム', leader: '海王シグルーン', color: '#2c5fa8', color2: '#dfe9f5',
    bonus: 'naval', bonusDesc: '海軍ユニットの戦闘力+5、乗船中の移動+1', aggr: 0.7,
    cities: ['フィヨルガ', 'ヴァルスタ', 'イースハウン', 'ストルム', 'ヘイムダル', 'グリムナ', 'スカルド', 'ノルヴィク', 'フレイヤ', 'ウルヴ'],
  },
  karnak: {
    name: 'カルナック王朝', leader: '太陽王アメンカ', color: '#d9a441', color2: '#1f7a7a',
    bonus: 'builder', bonusDesc: '建造物の生産コスト-15%', aggr: 0.3,
    cities: ['カルナ', 'メンネフ', 'アブシル', 'セネト', 'ヘリオ', 'タニサ', 'エドゥフ', 'サイサ', 'ブバス', 'ナカダ'],
  },
  suika: {
    name: '翠華', leader: '明帝・蒼嵐', color: '#1f8a5b', color2: '#f3e3a2',
    bonus: 'science', bonusDesc: '首都の科学+3', aggr: 0.35,
    cities: ['翠京', '洛南', '青陽', '臨江', '雲州', '安平', '広陵', '建寧', '龍泉', '華亭'],
  },
  zahara: {
    name: 'ザハラ首長国', leader: '大商主ラシーダ', color: '#6d3fa0', color2: '#f2b84b',
    bonus: 'gold', bonusDesc: '全都市のゴールド+2', aggr: 0.45,
    cities: ['ザハラ', 'カスル', 'ワーディ', 'ティムナ', 'サフラ', 'ナジュム', 'バハル', 'ルブア', 'ハディラ', 'マルジャ'],
  },
  tenoch: {
    name: 'テノチカ連邦', leader: '鷲の戦士長イツコ', color: '#d9622b', color2: '#2f9e8f',
    bonus: 'melee', bonusDesc: '近接ユニットの戦闘力+3', aggr: 0.75,
    cities: ['テノチ', 'トラロカ', 'ショチ', 'アトラン', 'コアトル', 'ミクトラ', 'テスカ', 'チャルコ', 'クアウ', 'オメテ'],
  },
  albion: {
    name: 'アルビオン連合', leader: '女王エレノーラ', color: '#1c2f5e', color2: '#e8e2d0',
    bonus: 'culture', bonusDesc: '全都市の文化+1、国境の拡大が速い', aggr: 0.5,
    cities: ['ロンディア', 'ヨルヴィク', 'カンタベル', 'ブリスト', 'エディナ', 'ノーリッジ', 'ウィンザ', 'ダラム', 'チェスタ', 'プリマス'],
  },
};

export const BARB_COLOR = '#3a3a3a';
export const DIFFICULTY = ['開拓者', '標準', '上級', '覇王'];
export const MAP_SIZES: Record<string, { name: string; w: number; h: number; players: number }> = {
  small: { name: '小', w: 40, h: 26, players: 4 },
  standard: { name: '標準', w: 52, h: 32, players: 6 },
  large: { name: '大', w: 64, h: 40, players: 8 },
};

export function itemName(item: string): string {
  const k = item.slice(2);
  if (item[0] === 'u') return UNITS[k]?.name ?? k;
  if (item[0] === 'b') return BUILDINGS[k]?.name ?? k;
  if (item[0] === 'w') return MARVELS[k]?.name ?? k;
  return PROJECTS[k]?.name ?? k;
}
