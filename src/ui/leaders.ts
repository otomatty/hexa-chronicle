// 指導者の肖像（SVG をコードで描く）と台詞。人物・紋章はすべて本作オリジナルの架空設定。
import { CIVS } from '../core/data';

export type Mood = 'neutral' | 'happy' | 'angry';

interface Look {
  skin: string;
  shade: string;
  hair: string;
  robe: string;
  trim: string;
  /** 頭の後ろに描くもの（髪・頭巾など） */
  back: string;
  /** 顔の上に描くもの（前髪・冠・装身具など） */
  front: string;
  /** 衣の上に描く飾り */
  dress: string;
}

const LOOKS: Record<string, Look> = {
  // 執政官ヴァレンティア：結い上げた髪に金の月桂冠、深紅の外衣
  aurelia: {
    skin: '#d9a57c', shade: '#c08a62', hair: '#3a2418', robe: '#a3242a', trim: '#f0c74a',
    back: '<ellipse cx="100" cy="92" rx="40" ry="42" fill="#3a2418"/><circle cx="100" cy="52" r="15" fill="#3a2418"/>',
    front: '<path d="M64 98 Q70 62 100 60 Q130 62 136 98 Q124 78 100 76 Q76 78 64 98Z" fill="#3a2418"/>' +
      '<g fill="#f0c74a">' + [-34, -24, -13, 13, 24, 34].map((x, i) => `<ellipse cx="${100 + x}" cy="${78 - Math.abs(x) * 0.12}" rx="7" ry="3.4" transform="rotate(${x < 0 ? -38 : 38} ${100 + x} 78)" opacity="${0.92 + (i % 2) * 0.08}"/>`).join('') + '<circle cx="100" cy="70" r="3.5"/></g>',
    dress: '<path d="M52 196 Q100 232 150 186 L158 200 Q104 250 46 214Z" fill="#f0c74a"/><circle cx="62" cy="192" r="7" fill="#f0c74a"/>',
  },
  // 常磐ノ宮：長い黒髪と高い冠、白と朱の重ねの衣
  mizuho: {
    skin: '#f1d6bd', shade: '#dcbb9f', hair: '#15131a', robe: '#f2efe6', trim: '#c2313a',
    back: '<path d="M58 96 Q56 60 100 58 Q144 60 142 96 L150 210 L50 210Z" fill="#15131a"/>',
    front: '<path d="M64 100 Q66 66 100 64 Q134 66 136 100 Q130 80 100 80 Q70 80 64 100Z" fill="#15131a"/>' +
      '<path d="M84 64 L88 30 Q100 22 112 30 L116 64Z" fill="#1b1a22"/><rect x="82" y="58" width="36" height="7" rx="2" fill="#c2313a"/><path d="M112 32 Q134 20 140 44" stroke="#1b1a22" stroke-width="5" fill="none" stroke-linecap="round"/>',
    dress: '<path d="M78 170 L100 204 L122 170 L112 166 L100 186 L88 166Z" fill="#c2313a"/><path d="M70 172 L100 216 L130 172 L122 170 L100 204 L78 170Z" fill="#e7b9b0"/>',
  },
  // 海王シグルーン：編み込んだ金髪と額当て、毛皮の襟の外套
  nordheim: {
    skin: '#f0cdb2', shade: '#d8ae90', hair: '#d9b25a', robe: '#2c5fa8', trim: '#dfe9f5',
    back: '<ellipse cx="100" cy="96" rx="42" ry="46" fill="#d9b25a"/><path d="M60 110 Q50 170 62 206 L78 206 Q68 160 76 116Z" fill="#c9a04a"/><path d="M140 110 Q150 170 138 206 L122 206 Q132 160 124 116Z" fill="#c9a04a"/>',
    front: '<path d="M64 100 Q64 62 100 60 Q136 62 136 100 Q128 82 112 80 L100 90 L88 80 Q72 82 64 100Z" fill="#d9b25a"/>' +
      '<path d="M62 86 Q100 70 138 86 L138 94 Q100 78 62 94Z" fill="#aab4c2"/><circle cx="100" cy="80" r="5" fill="#2c5fa8" stroke="#dfe9f5" stroke-width="1.5"/>' +
      [64, 136].map((x) => [124, 142, 160, 178].map((y) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="8" fill="#d9b25a" stroke="#b08a3a" stroke-width="1"/>`).join('')).join(''),
    dress: '<path d="M30 214 Q60 164 100 176 Q140 164 170 214 Q140 186 100 196 Q60 186 30 214Z" fill="#e8e4da"/><circle cx="100" cy="190" r="7" fill="#aab4c2" stroke="#dfe9f5" stroke-width="2"/>',
  },
  // 太陽王アメンカ：金と青緑の縞の頭巾、幅広の胸飾り
  karnak: {
    skin: '#b97a4c', shade: '#9c6238', hair: '#1a1410', robe: '#f3ead2', trim: '#1f7a7a',
    back: '<path d="M52 104 Q50 54 100 52 Q150 54 148 104 L160 196 L40 196Z" fill="#d9a441"/>' +
      [0, 1, 2, 3, 4, 5].map((i) => `<path d="M${44 + i * 2} ${116 + i * 14} L${62 + i} ${116 + i * 14} L${61 + i} ${123 + i * 14} L${43 + i * 2} ${123 + i * 14}Z M${156 - i * 2} ${116 + i * 14} L${138 - i} ${116 + i * 14} L${139 - i} ${123 + i * 14} L${157 - i * 2} ${123 + i * 14}Z" fill="#1f7a7a"/>`).join(''),
    front: '<path d="M60 96 Q62 56 100 54 Q138 56 140 96 Q120 74 100 74 Q80 74 60 96Z" fill="#d9a441"/>' +
      [70, 82, 94, 106, 118, 130].map((x) => `<path d="M${x} ${90 - Math.abs(100 - x) * 0.25} L${x - 2} 58" stroke="#1f7a7a" stroke-width="3.2"/>`).join('') +
      '<circle cx="100" cy="64" r="7" fill="#f0c74a" stroke="#b3262b" stroke-width="2"/><rect x="95" y="150" width="10" height="18" rx="4" fill="#2a2018"/>',
    dress: '<path d="M54 186 Q100 150 146 186 Q100 236 54 186Z" fill="#1f7a7a"/><path d="M62 186 Q100 160 138 186 Q100 224 62 186Z" fill="#d9a441"/><path d="M72 186 Q100 170 128 186 Q100 212 72 186Z" fill="#b3262b"/>',
  },
  // 明帝・蒼嵐：髷と翡翠の冠、細い髭、金襟の緑衣
  suika: {
    skin: '#ecd0b0', shade: '#d6b490', hair: '#16141a', robe: '#1f8a5b', trim: '#f3e3a2',
    back: '<ellipse cx="100" cy="92" rx="40" ry="40" fill="#16141a"/>',
    front: '<path d="M64 98 Q66 64 100 62 Q134 64 136 98 Q124 76 100 76 Q76 76 64 98Z" fill="#16141a"/>' +
      '<ellipse cx="100" cy="50" rx="13" ry="12" fill="#16141a"/><rect x="84" y="50" width="32" height="12" rx="2" fill="#f3e3a2"/><rect x="92" y="36" width="16" height="16" rx="2" fill="#2fae78"/><rect x="66" y="46" width="68" height="3.5" rx="1.5" fill="#f3e3a2"/>' +
      '<path d="M86 132 Q80 140 76 150 M114 132 Q120 140 124 150" stroke="#16141a" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M96 146 L100 166 L104 146Z" fill="#16141a"/>',
    dress: '<path d="M74 168 L100 214 L126 168 L116 164 L100 194 L84 164Z" fill="#f3e3a2"/><circle cx="100" cy="222" r="9" fill="none" stroke="#f3e3a2" stroke-width="3"/>',
  },
  // 大商主ラシーダ：金貨の帯をあしらった紫の頭巾と耳飾り
  zahara: {
    skin: '#a9714a', shade: '#8c5a38', hair: '#1c1412', robe: '#6d3fa0', trim: '#f2b84b',
    back: '<path d="M54 100 Q50 50 100 48 Q150 50 146 100 Q152 160 138 204 L62 204 Q48 160 54 100Z" fill="#6d3fa0"/>',
    front: '<path d="M60 100 Q60 56 100 54 Q140 56 140 100 Q128 76 100 76 Q72 76 60 100Z" fill="#7d4fb4"/>' +
      '<path d="M62 92 Q100 68 138 92" stroke="#f2b84b" stroke-width="5" fill="none"/>' + [70, 82, 94, 106, 118, 130].map((x) => `<circle cx="${x}" cy="${90 - (1 - Math.pow((x - 100) / 38, 2)) * 13 + 7}" r="3.6" fill="#f2b84b" stroke="#b9862a" stroke-width="0.8"/>`).join('') +
      '<circle cx="62" cy="128" r="5" fill="none" stroke="#f2b84b" stroke-width="2.4"/><circle cx="138" cy="128" r="5" fill="none" stroke="#f2b84b" stroke-width="2.4"/>',
    dress: '<path d="M70 172 Q100 198 130 172 L134 180 Q100 210 66 180Z" fill="#f2b84b"/><circle cx="100" cy="204" r="6" fill="#f2b84b"/><circle cx="100" cy="204" r="2.5" fill="#6d3fa0"/>',
  },
  // 鷲の戦士長イツコ：橙と青緑の羽根冠、頬の化粧
  tenoch: {
    skin: '#bd8256', shade: '#a06a42', hair: '#17120f', robe: '#d9622b', trim: '#2f9e8f',
    back: [-60, -44, -28, -12, 4, 20, 36, 52].map((a, i) => `<path d="M100 84 L${100 + Math.sin((a + 4) * Math.PI / 180) * 78} ${84 - Math.cos((a + 4) * Math.PI / 180) * 78} Q${100 + Math.sin((a + 12) * Math.PI / 180) * 60} ${84 - Math.cos((a + 12) * Math.PI / 180) * 60} 100 84Z" fill="${i % 2 ? '#2f9e8f' : '#d9622b'}" stroke="#7a3414" stroke-width="0.8"/>`).join('') +
      '<path d="M60 100 Q58 66 100 64 Q142 66 140 100 L144 150 L56 150Z" fill="#17120f"/>',
    front: '<path d="M62 92 Q100 72 138 92 L138 102 Q100 84 62 102Z" fill="#f0c74a"/>' + [72, 86, 100, 114, 128].map((x) => `<circle cx="${x}" cy="${95 - (1 - Math.pow((x - 100) / 38, 2)) * 9}" r="3.4" fill="#2f9e8f"/>`).join('') +
      '<path d="M70 124 L84 126 M70 130 L84 131 M130 124 L116 126 M130 130 L116 131" stroke="#b3262b" stroke-width="2.6" stroke-linecap="round"/>' +
      '<circle cx="62" cy="124" r="5.5" fill="#2f9e8f" stroke="#f0c74a" stroke-width="1.6"/><circle cx="138" cy="124" r="5.5" fill="#2f9e8f" stroke="#f0c74a" stroke-width="1.6"/>',
    dress: '<path d="M60 180 Q100 204 140 180 L144 192 Q100 222 56 192Z" fill="#2f9e8f"/>' + [70, 85, 100, 115, 130].map((x) => `<path d="M${x - 5} ${194 + (1 - Math.pow((x - 100) / 40, 2)) * 12} l5 12 l5 -12Z" fill="#f0c74a"/>`).join(''),
  },
  // 女王エレノーラ：結い上げた赤褐色の髪に金の冠、白い襞襟の濃紺の衣
  albion: {
    skin: '#f3d8c4', shade: '#dcb9a2', hair: '#8a3f24', robe: '#1c2f5e', trim: '#e8e2d0',
    back: '<ellipse cx="100" cy="90" rx="43" ry="44" fill="#8a3f24"/><circle cx="66" cy="72" r="14" fill="#8a3f24"/><circle cx="134" cy="72" r="14" fill="#8a3f24"/>',
    front: '<path d="M64 100 Q62 64 100 62 Q138 64 136 100 Q128 80 100 84 Q72 80 64 100Z" fill="#8a3f24"/>' +
      '<path d="M72 64 L76 38 L88 54 L100 32 L112 54 L124 38 L128 64Z" fill="#f0c74a" stroke="#b9862a" stroke-width="1.2"/><circle cx="100" cy="52" r="4" fill="#b3262b"/><circle cx="82" cy="56" r="2.6" fill="#2c5fa8"/><circle cx="118" cy="56" r="2.6" fill="#2c5fa8"/>' +
      '<circle cx="64" cy="130" r="3.2" fill="#f4f1e8"/><circle cx="136" cy="130" r="3.2" fill="#f4f1e8"/>',
    dress: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<ellipse cx="${56 + i * 11}" cy="${172 + Math.abs(4 - i) * 1.6}" rx="8" ry="11" fill="#f4f1e8" stroke="#cfc8b6" stroke-width="1"/>`).join('') + '<circle cx="100" cy="208" r="6" fill="#f0c74a"/><circle cx="100" cy="208" r="2.6" fill="#b3262b"/>',
  },
};

/** 文明の紋章（単純な幾何学模様） */
export function emblem(civ: string, size = 40): string {
  const c = CIVS[civ];
  if (!c) return '';
  const a = c.color2;
  const g: Record<string, string> = {
    aurelia: `<circle cx="20" cy="20" r="6" fill="${a}"/>` + [0, 45, 90, 135, 180, 225, 270, 315].map((r) => `<path d="M20 5 L22 12 L18 12Z" fill="${a}" transform="rotate(${r} 20 20)"/>`).join(''),
    mizuho: `<circle cx="20" cy="20" r="9" fill="${a}"/><path d="M8 30 Q20 22 32 30" stroke="${a}" stroke-width="2.4" fill="none"/>`,
    nordheim: `<path d="M6 24 Q20 34 34 24 L30 24 Q20 30 10 24Z" fill="${a}"/><path d="M20 8 L20 24 M20 9 L30 20 L20 20" stroke="${a}" stroke-width="2.2" fill="none"/>`,
    karnak: `<circle cx="20" cy="17" r="6.5" fill="${a}"/><path d="M4 24 Q12 18 14 22 M36 24 Q28 18 26 22" stroke="${a}" stroke-width="2.6" fill="none"/><path d="M12 32 L20 24 L28 32Z" fill="${a}"/>`,
    suika: `<circle cx="20" cy="20" r="10" fill="none" stroke="${a}" stroke-width="3.4"/><circle cx="20" cy="20" r="3.2" fill="${a}"/>`,
    zahara: `<circle cx="17" cy="20" r="11" fill="${a}"/><circle cx="21.5" cy="18" r="9.2" fill="${c.color}"/><path d="M27 15 l1.6 3.4 3.6 .4 -2.7 2.4 .8 3.6 -3.3 -1.9 -3.3 1.9 .8 -3.6 -2.7 -2.4 3.6 -.4Z" fill="${a}"/>`,
    tenoch: `<path d="M6 32 L6 27 L11 27 L11 22 L16 22 L16 17 L24 17 L24 22 L29 22 L29 27 L34 27 L34 32Z" fill="${a}"/><circle cx="20" cy="10" r="3.4" fill="${a}"/>`,
    albion: `<path d="M8 28 L10 14 L15 21 L20 11 L25 21 L30 14 L32 28Z" fill="${a}"/><rect x="8" y="29" width="24" height="3.4" fill="${a}"/>`,
  };
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="${c.color}" stroke="${a}" stroke-width="1.6"/>${g[civ] ?? ''}</svg>`;
}

/** 指導者の肖像。mood で眉と口が変わり、まばたきと呼吸のアニメーションが付く */
export function portrait(civ: string, mood: Mood = 'neutral', size = 240): string {
  const c = CIVS[civ], L = LOOKS[civ];
  if (!c || !L) return '';
  const id = 'pg' + civ;
  const brow = mood === 'angry' ? [10, -10] : mood === 'happy' ? [-6, 6] : [0, 0];
  const browY = mood === 'angry' ? 99 : mood === 'happy' ? 94 : 96;
  const mouth = mood === 'happy' ? 'M88 140 Q100 152 112 140' : mood === 'angry' ? 'M90 145 Q100 137 110 145' : 'M90 142 Q100 146 110 142';
  const eye = (x: number) => `
    <ellipse cx="${x}" cy="112" rx="7.5" ry="${mood === 'angry' ? 4 : 5}" fill="#fff"/>
    <circle cx="${x}" cy="112" r="3.6" fill="#2a1d16"/><circle cx="${x + 1.2}" cy="110.6" r="1.1" fill="#fff"/>
    <ellipse cx="${x}" cy="107" rx="8.5" ry="0" fill="${L.skin}"><animate attributeName="ry" values="0;0;6.5;0" keyTimes="0;0.93;0.965;1" dur="${4 + (civ.length % 3) * 0.7}s" repeatCount="indefinite"/><animate attributeName="cy" values="107;107;112;107" keyTimes="0;0.93;0.965;1" dur="${4 + (civ.length % 3) * 0.7}s" repeatCount="indefinite"/></ellipse>`;
  return `<svg class="portrait" viewBox="0 0 200 240" width="${size}" height="${size * 1.2}" role="img" aria-label="${c.leader}">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.color}"/><stop offset="1" stop-color="#0c111d"/></linearGradient>
      <clipPath id="${id}c"><rect width="200" height="240" rx="14"/></clipPath>
    </defs>
    <g clip-path="url(#${id}c)">
      <rect width="200" height="240" fill="url(#${id})"/>
      <circle cx="100" cy="96" r="78" fill="${c.color2}" opacity="0.16"/><circle cx="100" cy="96" r="58" fill="${c.color2}" opacity="0.12"/>
      <g class="bust">
        ${L.back}
        <path d="M14 244 C22 186 66 168 100 168 C134 168 178 186 186 244Z" fill="${L.robe}"/>
        <path d="M14 244 C22 186 66 168 100 168 C134 168 178 186 186 244" fill="none" stroke="${L.trim}" stroke-width="4" opacity="0.9"/>
        <rect x="86" y="146" width="28" height="34" rx="10" fill="${L.shade}"/>
        ${L.dress}
        <ellipse cx="64" cy="116" rx="6" ry="10" fill="${L.shade}"/><ellipse cx="136" cy="116" rx="6" ry="10" fill="${L.shade}"/>
        <path d="M64 104 Q64 66 100 66 Q136 66 136 104 Q136 138 118 152 Q100 162 82 152 Q64 138 64 104Z" fill="${L.skin}"/>
        ${eye(85)}${eye(115)}
        <path d="M76 ${browY} Q85 ${browY - 4} 94 ${browY}" stroke="${L.hair}" stroke-width="3" fill="none" stroke-linecap="round" transform="rotate(${brow[0]} 85 ${browY})"/>
        <path d="M106 ${browY} Q115 ${browY - 4} 124 ${browY}" stroke="${L.hair}" stroke-width="3" fill="none" stroke-linecap="round" transform="rotate(${brow[1]} 115 ${browY})"/>
        <path d="M100 114 Q96 128 99 131 Q101 132.5 104 131" stroke="${L.shade}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="${mouth}" stroke="#8a3b34" stroke-width="3" fill="none" stroke-linecap="round"/>
        ${mood === 'happy' ? `<circle cx="78" cy="130" r="6" fill="#e57b6a" opacity="0.28"/><circle cx="122" cy="130" r="6" fill="#e57b6a" opacity="0.28"/>` : ''}
        ${L.front}
      </g>
      <rect width="200" height="240" rx="14" fill="none" stroke="${c.color2}" stroke-width="3" opacity="0.85"/>
    </g>
  </svg>`;
}

export interface Lines { greet: string; talk: string; war: string; attacked: string; peace: string; refuse: string; offer: string }

/** 場面ごとの台詞 */
export const LINES: Record<string, Lines> = {
  aurelia: {
    greet: 'アウレリアの軍旗の下へようこそ。友として来たのなら、その証を行いで示してもらおう。',
    talk: '帝国の道はすべてアウレアに通じる。そなたの道はどこへ通じているのだ？',
    war: '言葉の時は終わった。軍団はすでに国境を越えている。',
    attacked: '愚かな。帝国に剣を向けた者の末路を、歴史が教えてくれるだろう。',
    peace: 'よかろう。剣を収める。ただし、帝国は忘れぬぞ。',
    refuse: '和平だと？ 戦場の決着もつかぬうちに何を言う。',
    offer: 'これ以上の流血は互いの益にならぬ。兵を引こうではないか。',
  },
  mizuho: {
    greet: '遠路ようこそおいでくださいました。瑞穂の国は、礼をもって礼に応えます。',
    talk: '稲穂は実るほど頭を垂れるもの。あなたの国は、いかがお過ごしですか。',
    war: '残念ですが、これ以上は見過ごせません。お覚悟を。',
    attacked: '静かな水面に石を投げましたね。波は、あなたの岸にも届きますよ。',
    peace: '争いは稲を枯らすだけ。喜んで矛を収めましょう。',
    refuse: 'まだ、その時ではございません。',
    offer: '田を荒らす戦はもう十分でしょう。和を結びませんか。',
  },
  nordheim: {
    greet: 'ほう、陸の者か。海を恐れぬなら、我らと杯を交わす資格がある。',
    talk: '風はいい。船も足りている。あとは行き先を決めるだけだ。',
    war: '帆を上げろ！ お前の港は、今日から我らの港だ。',
    attacked: '嵐を呼んだのはお前だ。沈むまで付き合ってやる。',
    peace: 'いい戦いだった。次は酒の席で会おう。',
    refuse: '戦はこれからが面白い。帰るなら泳いで帰れ。',
    offer: '波も凪いだ。ここらで手打ちにしないか。',
  },
  karnak: {
    greet: '太陽は万人を等しく照らす。そなたの上にも、今日は恵みがあろう。',
    talk: '石は千年残る。そなたは何を残すつもりかな。',
    war: '太陽に背を向けた者に、朝は来ぬ。',
    attacked: '砂は足跡を消す。そなたの軍の足跡もな。',
    peace: '日はまた昇る。互いの民のために、和を受けよう。',
    refuse: '太陽はまだ天頂にある。裁きは終わっておらぬ。',
    offer: '民は疲れている。そなたの民もであろう。和を結ぼう。',
  },
  suika: {
    greet: '遠方より来たる友か。翠華の門は、学ぶ者に開かれておる。',
    talk: '千巻の書も、一つの問いから始まる。そなたの問いは何かな。',
    war: '礼を尽くしたが、もはやこれまで。天の理に従ってもらう。',
    attacked: '浅慮よ。碁は、最初の一手で決まるものではないぞ。',
    peace: '賢明な判断だ。筆を執り、盟約をしたためよう。',
    refuse: '盤面はまだ動いておる。投了には早かろう。',
    offer: '争いは学を妨げる。互いに筆を執る時ではないか。',
  },
  zahara: {
    greet: 'ようこそ、旅のお方。まずは茶を一杯。商談はそれからにしましょう。',
    talk: '良い取引は、双方が得をするもの。今日は何をお求めで？',
    war: '帳簿が合いませんの。不足分は、あなたの街でお支払いいただきます。',
    attacked: 'まあ、高くつく選択をなさいましたね。利子は覚悟なさって。',
    peace: 'よろしい、手を打ちましょう。戦より商いのほうが儲かりますもの。',
    refuse: 'そのお値段では、とても。出直していらして。',
    offer: 'そろそろ損切りの時ではなくて？ 和平という名の取引を。',
  },
  tenoch: {
    greet: '鷲の目はお前を見ていた。勇気ある者なら、火のそばに座るがいい。',
    talk: '太鼓が鳴っている。祭りか、戦か。決めるのはお前だ。',
    war: '太鼓が鳴った。戦士たちは、もう止まらない。',
    attacked: '鷲の巣に手を入れたな。爪の鋭さを知るがいい。',
    peace: 'よく戦った。お前の名は、歌に残してやろう。',
    refuse: '戦士は、背を向ける者とは語らない。',
    offer: '十分な血が流れた。槍を置き、火を囲もう。',
  },
  albion: {
    greet: 'ごきげんよう。アルビオンは、礼節を知る方を歓迎いたしますわ。',
    talk: '今日は良いお天気ですこと。さて、ご用件を伺いましょう。',
    war: '誠に遺憾ですが、わたくしの忍耐にも限りがございますの。',
    attacked: '宣戦布告、確かに受け取りました。お返事は艦隊がお届けします。',
    peace: '結構ですわ。条約に署名いたしましょう。お茶が冷めないうちに。',
    refuse: 'お断りいたします。まだ決着がついておりませんもの。',
    offer: '双方、十分に名誉は示しました。和平をお考えになっては？',
  },
};
