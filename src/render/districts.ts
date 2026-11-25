// 区域の配置計画。建造物の種類ごとに、都市の隣のタイルへ専門地区を広げる。
// 見た目だけの仕組みで、タイルの産出や地形改良のルールには影響しない。
import { dist, isWater, neighbors } from '../core/game';
import { tilesInRange } from '../core/hex';
import type { City, GameState } from '../core/types';
import { hash } from './geo';
import type { DistrictKind } from './models';

export interface DistrictPlan { kind: DistrictKind; level: number; tile: number; key?: string }

const GROUPS: [DistrictKind, string[]][] = [
  ['campus', ['library', 'university', 'laboratory', 'institute']],
  ['commerce', ['market', 'bank']],
  ['industry', ['workshop', 'factory', 'powerplant']],
  ['culture', ['amphitheater', 'museum', 'broadcast']],
];

export function planDistricts(s: GameState, c: City): DistrictPlan[] {
  const ring = neighbors(s, c.pos);
  // 何もないタイルを優先し、資源や森のあるタイルはなるべく避ける
  const cost = (i: number) => {
    const t = s.tiles[i];
    return (t.resource ? 4 : 0) + (t.feature ? 2 : 0) + (t.improvement ? 1 : 0) + (t.elev === 1 ? 0.5 : 0) + (t.river ? 0.3 : 0) + hash(c.id, i) * 0.9;
  };
  // 隣接タイルを先に使い、足りなければ 2 つ先のタイルまで広げる
  const free = tilesInRange(s.w, s.h, c.pos, 2)
    .filter((i) => { const t = s.tiles[i]; return i !== c.pos && t.cityId === c.id && !isWater(t) && t.elev < 2 && !t.camp && !t.wonder; })
    .sort((a, b) => dist(s, a, c.pos) * 10 + cost(a) - (dist(s, b, c.pos) * 10 + cost(b)));
  const plan: DistrictPlan[] = [];
  for (const [kind, list] of GROUPS) {
    const level = list.filter((b) => c.buildings.includes(b)).length;
    if (level > 0 && free.length) plan.push({ kind, level, tile: free.shift()! });
  }
  // 世界遺産は区域の後ろに、建てた順で並べる（既存の区域の場所を動かさないため）
  for (const key of c.marvels) if (free.length) plan.push({ kind: 'marvel', level: 1, tile: free.shift()!, key });
  if (c.buildings.includes('harbor')) {
    const sea = ring.filter((i) => s.tiles[i].terrain === 'coast').sort((a, b) => hash(c.id, a) - hash(c.id, b))[0];
    if (sea !== undefined) plan.push({ kind: 'harbor', level: 1, tile: sea });
  }
  return plan;
}

/** 区域が建っている陸タイル（木や改良のモデルを置かないための一覧） */
export function districtTiles(s: GameState): Set<number> {
  const out = new Set<number>();
  for (const id in s.cities) for (const d of planDistricts(s, s.cities[id])) if (d.kind !== 'harbor') out.add(d.tile);
  return out;
}
