# 外部素材

## KayKit : Medieval Hexagon Pack 1.0

- 作者: Kay Lousberg（https://www.kaylousberg.com）
- ライセンス: Creative Commons Zero (CC0) — 商用を含め自由に利用可、クレジット表記は任意
- 入手元: https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0

使っているモデル: 家 2 種・城・教会・市場・酒場・鍛冶場・塔・井戸・風車・鉱山・製材所、樹木 2 種、岩 3 種、テント・樽・木箱・袋・木材・石材・武器棚。

パック本体はこのリポジトリに含めていません。`scripts/build-assets.ts` で必要なモデルだけを取り出し、
パレット用テクスチャの色を頂点カラーに焼き込んだ軽量バイナリ `src/assets/pack.bin`（約 600KB）に変換して同梱しています。
屋根や旗などの陣営色の部分は、変換時に印を付けておき、実行時に各文明の色で塗り直しています。

再生成する手順:

```bash
git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 /tmp/kaykit
npx tsx scripts/build-assets.ts /tmp/kaykit/addons/kaykit_medieval_hexagon_pack/Assets/gltf
```

## それ以外

地形・水面・山・自然遺産・世界遺産・ユニット・産業時代以降の建物・指導者の肖像・エフェクト・UI は、すべてこのリポジトリのコードで生成しています。
産業時代以降の建物と世界遺産（`src/render/builds.ts`）は、パックの建物と並べても浮かないよう、配色と作法（厚い土台、枠付きの窓、切妻屋根）を合わせています。
画質「低」では上記パックを読み込まず、手続き生成のモデルだけで描画します。
