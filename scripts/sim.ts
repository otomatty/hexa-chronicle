// AI同士の自動対戦でルールの健全性を検証する。  使い方: npm run sim -- [seed] [size] [turns]
import { runAI } from '../src/core/ai';
import { citiesOf, createGame, deserialize, rt, serialize, unitsOf } from '../src/core/game';
import { UNITS } from '../src/core/data';
import type { GameState } from '../src/core/types';

function check(s: GameState): void {
  const r = rt(s);
  const seen = new Set<string>();
  for (const id in s.units) {
    const u = s.units[id];
    const civ = !!UNITS[u.type].civilian;
    const key = u.pos + (civ ? 'c' : 'm');
    if (seen.has(key)) throw new Error(`同じ枠に複数ユニット: tile ${u.pos}`);
    seen.add(key);
    if ((civ ? r.civ : r.mil)[u.pos] !== u.id) throw new Error(`インデックス不整合: unit ${u.id}`);
    if (u.hp <= 0) throw new Error(`HP0のユニットが残存: ${u.id}`);
    const t = s.tiles[u.pos];
    if (t.elev === 2) throw new Error('山岳にユニット');
  }
  for (let i = 0; i < r.mil.length; i++) {
    if (r.mil[i] && !s.units[r.mil[i]]) throw new Error('存在しないユニットがインデックスに残存');
    if (r.civ[i] && !s.units[r.civ[i]]) throw new Error('存在しない非戦闘ユニットがインデックスに残存');
  }
  for (const id in s.cities) {
    const c = s.cities[id];
    if (s.tiles[c.pos].owner !== c.owner) throw new Error('都市タイルの所有者不整合');
    if (c.pop < 1) throw new Error('人口0の都市');
  }
}

const seed = Number(process.argv[2] ?? 1);
const size = (process.argv[3] ?? 'standard') as 'small' | 'standard' | 'large';
const maxTurns = Number(process.argv[4] ?? 300);
const t0 = Date.now();
let s = createGame({ seed, size, civ: 'aurelia', opponents: 7, difficulty: 1, allAI: true });
let steps = 0, kills = 0, captures = 0, wars = 0;
while (!s.winner && s.turn <= maxTurns) {
  runAI(s, s.current);
  for (const e of s.events) {
    if (e.type === 'unitDied') kills++;
    if (e.type === 'cityCaptured') captures++;
    if (e.type === 'war') wars++;
  }
  s.events = [];
  check(s);
  if (++steps % 400 === 0) s = deserialize(serialize(s)); // セーブ往復でも進行が壊れないこと
  if (s.current === 0 && s.turn % 50 === 0) {
    const row = s.players.filter((p) => !p.barb).map((p) =>
      `${p.alive ? '' : '×'}${p.name.slice(0, 4)} 都${citiesOf(s, p.id).length} 技${p.techs.length} 軍${unitsOf(s, p.id).length} 金${Math.round(p.gold)} 点${p.score}`);
    console.log(`T${s.turn}  ` + row.join(' | '));
  }
}
const ms = Date.now() - t0;
console.log(`終了: T${s.turn} 勝者=${s.winner ? s.players[s.winner.player].name + ' (' + s.winner.kind + ')' : 'なし'}  撃破${kills} 占領${captures} 宣戦${wars}  ${ms}ms (${(ms / steps).toFixed(2)}ms/手番) セーブ${(serialize(s).length / 1024).toFixed(0)}KB`);
