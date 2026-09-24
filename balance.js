// 忍彩かくれんぼ — 39体の性能（能力値6軸・固有技・推奨系統）と成長の正本。
// 設計図：docs/character-balance-blueprint.txt（39体）・docs/hp-level-blueprint.txt（HP・レベルアップ）
// 能力値は1〜5（合計21・3が共通値）。sim.js の balanceFor() が係数に変換する。tools/build_balance.py で生成（手直しはここで可）
const BALANCE = {
 "chars": [
  {
   "id": "jin",
   "num": "001",
   "role": "アタッカー",
   "title": "火走りの先陣",
   "stats": {
    "spd": 4,
    "camo": 2,
    "atk": 5,
    "def": 3,
    "scout": 4,
    "esc": 3
   },
   "tree": "技",
   "skill": {
    "name": "火遁・残火",
    "cd": 18,
    "kind": "trail_reveal",
    "effect": "前方へ火の帯を6m引き、3秒間、通過した敵を1.5秒可視化する。",
    "counter": "壁越しには届かず、水遁で即座に消える。",
    "params": {
     "len": 6,
     "life": 3,
     "revealSec": 1.5
    }
   },
   "winPlan": "短い直線を走って敵の視線を引き、味方の旗ルートを開ける。",
   "escapePlan": "被発見時は残火を曲がり角に置き、別ルートへ切り返す。"
  },
  {
   "id": "sakuya",
   "num": "002",
   "role": "スカウト",
   "title": "口寄せの道案内",
   "stats": {
    "spd": 4,
    "camo": 3,
    "atk": 3,
    "def": 3,
    "scout": 5,
    "esc": 3
   },
   "tree": "技",
   "skill": {
    "name": "口寄せ・白狐",
    "cd": 22,
    "kind": "track_nearest",
    "effect": "白狐を8秒放ち、半径9m内で最も近い敵の足跡方向を味方に示す。",
    "counter": "足跡は2秒前の情報。擬態中の静止者は検出しない。",
    "params": {
     "dur": 8,
     "radius": 9,
     "delay": 2
    }
   },
   "winPlan": "中央前に白狐を送り、味方に安全な入口を伝える。",
   "escapePlan": "白狐と逆方向へ逃げ、追手の判断を迷わせる。"
  },
  {
   "id": "kohaku",
   "num": "003",
   "role": "インフィルトレーター",
   "title": "変わり身の潜入者",
   "stats": {
    "spd": 4,
    "camo": 5,
    "atk": 3,
    "def": 2,
    "scout": 2,
    "esc": 5
   },
   "tree": "影",
   "skill": {
    "name": "変わり身・狐札",
    "cd": 24,
    "kind": "substitution",
    "effect": "被弾時に丸太を残し、入力方向へ3m瞬間移動して印を1回だけ無効化する。",
    "counter": "発動地点に煙と移動方向が0.5秒見える。壁は越えられない。",
    "params": {
     "blink": 3,
     "smokeSec": 0.5,
     "armSec": 8
    }
   },
   "winPlan": "擬態をつないで旗の側面まで入り、混戦の最後に抜ける。",
   "escapePlan": "追撃の2発目を変わり身でかわし、擬態帯へ飛び込む。"
  },
  {
   "id": "shiba",
   "num": "004",
   "role": "コントローラー",
   "title": "水路の守り手",
   "stats": {
    "spd": 3,
    "camo": 3,
    "atk": 3,
    "def": 4,
    "scout": 4,
    "esc": 4
   },
   "tree": "護",
   "skill": {
    "name": "水遁・水鏡",
    "cd": 20,
    "kind": "zone_water",
    "effect": "直径5mの水鏡を5秒展開。中の味方は足音が消え、敵の飛び道具は20%遅くなる。",
    "counter": "水鏡そのものは遠くから見える。火遁で2秒短縮される。",
    "params": {
     "r": 2.5,
     "dur": 5,
     "projSlow": 0.2
    }
   },
   "winPlan": "橋や門で水鏡を置き、味方の横断と撤退を助ける。",
   "escapePlan": "水鏡の端で方向転換し、遅くなった追撃を障害物へ誘う。"
  },
  {
   "id": "kanaoni",
   "num": "005",
   "role": "ガーディアン",
   "title": "金剛の門番",
   "stats": {
    "spd": 2,
    "camo": 2,
    "atk": 5,
    "def": 5,
    "scout": 4,
    "esc": 3
   },
   "tree": "護",
   "skill": {
    "name": "金遁・金剛壁",
    "cd": 24,
    "kind": "wall",
    "effect": "幅3mの金属壁を4秒生成し、印投げと見破り扇を遮る。",
    "counter": "壁は両チームを遮り、設置前に0.7秒の予告線が出る。",
    "params": {
     "len": 3,
     "dur": 4,
     "warnSec": 0.7
    }
   },
   "winPlan": "旗前の射線を切り、味方が掴む2秒を作る。",
   "escapePlan": "壁を背後に置いて追撃を止め、別の出口へ歩く。"
  },
  {
   "id": "oto",
   "num": "006",
   "role": "サポート",
   "title": "巻物の救護役",
   "stats": {
    "spd": 3,
    "camo": 4,
    "atk": 2,
    "def": 4,
    "scout": 5,
    "esc": 3
   },
   "tree": "護",
   "skill": {
    "name": "口寄せ・守り兎",
    "cd": 20,
    "kind": "ally_shield",
    "effect": "味方1人へ守り兎を付け、8秒以内の最初の減速を無効化し、印の残り時間を3秒減らす。",
    "counter": "帰還直前の2印目は防げない。対象に兎アイコンが見える。",
    "params": {
     "dur": 8,
     "range": 8,
     "markReduceSec": 3
    }
   },
   "winPlan": "先行役へ守り兎を渡し、自分は後方から索敵する。",
   "escapePlan": "自分に使う場合は早めに発動し、印が消えるまで遮蔽物を回る。"
  },
  {
   "id": "rotten",
   "num": "007",
   "role": "トラッパー",
   "title": "毒霧の待ち伏せ",
   "stats": {
    "spd": 3,
    "camo": 4,
    "atk": 4,
    "def": 2,
    "scout": 4,
    "esc": 4
   },
   "tree": "影",
   "skill": {
    "name": "毒霧・紫煙",
    "cd": 22,
    "kind": "zone_fog",
    "effect": "直径4mの霧を6秒設置。敵は視界が狭まり、外へ出た後も足跡が2秒残る。",
    "counter": "霧は双方の視線を遮り、風遁で半分の時間に短縮される。",
    "params": {
     "r": 2.0,
     "dur": 6,
     "trailSec": 2
    }
   },
   "winPlan": "敵の見破りを霧の中で空振りさせ、側面から印を当てる。",
   "escapePlan": "自分も霧で視界を失うため、出口を決めてから投げる。"
  },
  {
   "id": "nagisa",
   "num": "008",
   "role": "デコイ",
   "title": "影分身の囮",
   "stats": {
    "spd": 4,
    "camo": 4,
    "atk": 2,
    "def": 3,
    "scout": 3,
    "esc": 5
   },
   "tree": "影",
   "skill": {
    "name": "影分身・走り影",
    "cd": 18,
    "kind": "decoy_run",
    "effect": "現在の向きへ6秒走る分身を出す。分身は索敵と印を1回吸収して消える。",
    "counter": "分身は旗を掴めず、足音の間隔が一定で見破れる。",
    "params": {
     "dur": 6
    }
   },
   "winPlan": "分身を正面へ走らせ、本体は擬態して反対側へ回る。",
   "escapePlan": "追われた瞬間に分身と進路を交差させ、標的を迷わせる。"
  },
  {
   "id": "anne",
   "num": "009",
   "role": "コントローラー",
   "title": "影縫いの管制役",
   "stats": {
    "spd": 3,
    "camo": 4,
    "atk": 3,
    "def": 3,
    "scout": 5,
    "esc": 3
   },
   "tree": "護",
   "skill": {
    "name": "影縫い・黒団子",
    "cd": 21,
    "kind": "freeze_bomb",
    "effect": "着弾地点から半径2.5mの敵を1.2秒停止させる団子を投げる。",
    "counter": "着弾まで0.8秒、床に黒い予告円が出る。擬態は解除しない。",
    "params": {
     "r": 2.5,
     "stun": 1.2,
     "delay": 0.8,
     "range": 6
    }
   },
   "winPlan": "味方の見破りに合わせ、逃げ道へ先置きする。",
   "escapePlan": "敵との間に投げ、停止中に角を二つ曲がる。"
  },
  {
   "id": "dan",
   "num": "010",
   "role": "デュエリスト",
   "title": "閃光の切り込み",
   "stats": {
    "spd": 5,
    "camo": 2,
    "atk": 5,
    "def": 2,
    "scout": 4,
    "esc": 3
   },
   "tree": "技",
   "skill": {
    "name": "閃光・白刃",
    "cd": 17,
    "kind": "dash",
    "effect": "5mを高速移動し、通過線の敵を1秒白く発光させる。",
    "counter": "移動前に0.35秒光り、壁と金剛壁で止まる。",
    "params": {
     "dist": 5,
     "revealSec": 1,
     "warnSec": 0.35
    }
   },
   "winPlan": "見えた敵へ一気に間合いを詰め、印投げへつなぐ。",
   "escapePlan": "追手を横切るように使い、照準を大きく振らせる。"
  },
  {
   "id": "hinanojoh",
   "num": "011",
   "role": "ボマー",
   "title": "焙烙の爆破役",
   "stats": {
    "spd": 3,
    "camo": 2,
    "atk": 5,
    "def": 3,
    "scout": 4,
    "esc": 4
   },
   "tree": "技",
   "skill": {
    "name": "火遁・焙烙玉",
    "cd": 22,
    "kind": "bomb",
    "effect": "2秒後に破裂する玉を投げ、半径3mの敵を吹き飛ばして擬態を解除する。",
    "counter": "点火音と赤い導火線が見える。遮蔽物の裏へ逃げれば回避可能。",
    "params": {
     "fuse": 2,
     "r": 3,
     "push": 3,
     "range": 5
    }
   },
   "winPlan": "旗の入口を一時的に空け、味方の進入を作る。",
   "escapePlan": "足元へ落として走り、追手だけを吹き戻す。"
  },
  {
   "id": "torika",
   "num": "012",
   "role": "アサシン",
   "title": "毒刃の追跡者",
   "stats": {
    "spd": 4,
    "camo": 4,
    "atk": 4,
    "def": 2,
    "scout": 3,
    "esc": 4
   },
   "tree": "影",
   "skill": {
    "name": "毒手裏剣・追香",
    "cd": 19,
    "kind": "poison_mark",
    "effect": "次の印命中に追香を付与し、6秒間だけ対象の移動方向を矢印で表示する。",
    "counter": "位置そのものは表示せず、守り兎で追香を除去できる。",
    "params": {
     "dur": 6,
     "armSec": 10
    }
   },
   "winPlan": "逃げる索敵役に付け、味方と挟み込む。",
   "escapePlan": "命中させるまで効果がなく、無理に追わず擬態へ戻る。"
  },
  {
   "id": "atoza",
   "num": "013",
   "role": "ブルーザー",
   "title": "逢魔の重戦士",
   "stats": {
    "spd": 3,
    "camo": 3,
    "atk": 5,
    "def": 4,
    "scout": 3,
    "esc": 3
   },
   "tree": "護",
   "skill": {
    "name": "逢魔刻・鬼灯",
    "cd": 26,
    "kind": "berserk",
    "effect": "8秒間、攻撃5・防御5相当になるが、自身が常に薄赤く可視化される。",
    "counter": "擬態不可で位置が明確。効果終了後2秒は速度が10%低下。",
    "params": {
     "dur": 8,
     "afterSlowSec": 2
    }
   },
   "winPlan": "敵が旗に集まる延長戦で正面から押し返す。",
   "escapePlan": "逃走には向かないため、発動前に帰還路を確保する。"
  },
  {
   "id": "hayate",
   "num": "014",
   "role": "リコン",
   "title": "鷹の目の偵察役",
   "stats": {
    "spd": 5,
    "camo": 2,
    "atk": 3,
    "def": 2,
    "scout": 5,
    "esc": 4
   },
   "tree": "技",
   "skill": {
    "name": "鷹の目・俯瞰",
    "cd": 24,
    "kind": "hawk_eye",
    "effect": "3秒間静止して鷹視点へ移り、半径14mの動いている敵を味方地図に2秒表示する。",
    "counter": "静止した擬態者は映らず、本体は無防備で音も聞こえにくい。",
    "params": {
     "channel": 3,
     "radius": 14,
     "showSec": 2
    }
   },
   "winPlan": "安全な後方から敵の進軍ルートを読み、合図を出す。",
   "escapePlan": "見つかったら視点を即解除し、高速で長い直線を離脱する。"
  },
  {
   "id": "uka",
   "num": "015",
   "role": "ゾーナー",
   "title": "九尾火の封鎖役",
   "stats": {
    "spd": 3,
    "camo": 3,
    "atk": 4,
    "def": 4,
    "scout": 4,
    "esc": 3
   },
   "tree": "護",
   "skill": {
    "name": "九尾の焔・狐火陣",
    "cd": 23,
    "kind": "fox_fires",
    "effect": "三つの狐火を5秒置き、触れた敵を2秒可視化する。",
    "counter": "狐火は明るく見え、間隔の広い側から抜けられる。水遁で一つ消える。",
    "params": {
     "count": 3,
     "dur": 5,
     "revealSec": 2
    }
   },
   "winPlan": "旗周囲の三方向を監視し、残る一方向を味方が見る。",
   "escapePlan": "追跡路に三角形を作り、内側を横切って追手を可視化する。"
  },
  {
   "id": "ganzi",
   "num": "016",
   "role": "ガーディアン",
   "title": "漆黒の幻術師",
   "stats": {
    "spd": 2,
    "camo": 4,
    "atk": 2,
    "def": 5,
    "scout": 5,
    "esc": 3
   },
   "tree": "護",
   "skill": {
    "name": "幻術・漆黒",
    "cd": 25,
    "kind": "zone_dark",
    "effect": "直径6mを4秒暗くする。味方には敵の輪郭、敵には味方の輪郭が表示されない。",
    "counter": "範囲の外からは黒い球として位置が分かり、見破りで1秒短縮。",
    "params": {
     "r": 3.0,
     "dur": 4
    }
   },
   "winPlan": "旗取得の最後の数秒を暗幕で守る。",
   "escapePlan": "球の端を二度出入りし、追手の距離感を崩す。"
  },
  {
   "id": "yui",
   "num": "017",
   "role": "サポート",
   "title": "桜吹雪の目くらまし",
   "stats": {
    "spd": 4,
    "camo": 5,
    "atk": 2,
    "def": 3,
    "scout": 3,
    "esc": 4
   },
   "tree": "護",
   "skill": {
    "name": "桜吹雪・花隠れ",
    "cd": 20,
    "kind": "zone_petals",
    "effect": "前方へ花びらを5秒流し、範囲内の味方は擬態開始が0.4秒速くなる。",
    "counter": "花びらが進路を知らせる。攻撃すると恩恵は即終了。",
    "params": {
     "dur": 5,
     "camoStartFaster": 0.4,
     "r": 2.5
    }
   },
   "winPlan": "潜入役二人を同時に擬態させ、敵の索敵回数を削る。",
   "escapePlan": "花の流れに沿わず斜めに離れ、予測射撃を外す。"
  },
  {
   "id": "fuuta",
   "num": "018",
   "role": "ランナー",
   "title": "風走りの旗手",
   "stats": {
    "spd": 5,
    "camo": 3,
    "atk": 4,
    "def": 2,
    "scout": 3,
    "esc": 4
   },
   "tree": "影",
   "skill": {
    "name": "風遁・追風",
    "cd": 18,
    "kind": "tailwind",
    "effect": "4秒間、前方移動が15%速くなり、毒霧と桜吹雪を押し流す。",
    "counter": "曲がると加速が落ち、使用中は足元の風筋が見える。",
    "params": {
     "dur": 4,
     "speedBonus": 0.15
    }
   },
   "winPlan": "門を抜けた直線で使い、旗までの最後の距離を詰める。",
   "escapePlan": "直線離脱に強いが、出口に影縫いを置かれると止まる。"
  },
  {
   "id": "rei",
   "num": "019",
   "role": "アサシン",
   "title": "代償の奇襲者",
   "stats": {
    "spd": 5,
    "camo": 3,
    "atk": 5,
    "def": 1,
    "scout": 3,
    "esc": 4
   },
   "tree": "影",
   "skill": {
    "name": "人身御供・身代札",
    "cd": 28,
    "kind": "sacrifice",
    "effect": "自分の印を一つ消し、4秒間攻撃速度を上げる代わりに効果後6秒は防御1になる。",
    "counter": "印がないと使用不可。発動時に大きな札が見える。",
    "params": {
     "dur": 4,
     "afterSec": 6,
     "heal": 15
    }
   },
   "winPlan": "1印を受けてから反撃し、短時間で敵前衛を退かせる。",
   "escapePlan": "逃走用には危険。効果中に角へ入り、終了後は味方と合流する。"
  },
  {
   "id": "sattva",
   "num": "020",
   "role": "サポート",
   "title": "涅槃の浄化役",
   "stats": {
    "spd": 3,
    "camo": 4,
    "atk": 2,
    "def": 5,
    "scout": 4,
    "esc": 3
   },
   "tree": "護",
   "skill": {
    "name": "涅槃・円光",
    "cd": 24,
    "kind": "cleanse",
    "effect": "半径4mの味方全員から追香・毒・方向表示を除き、印の残り時間を2秒減らす。",
    "counter": "印そのものは消さず、使用中の円光で集合位置が敵にも分かる。",
    "params": {
     "r": 4,
     "revealCut": 2
    }
   },
   "winPlan": "被弾した味方を安全地帯へ集め、帰還を防ぐ。",
   "escapePlan": "自分だけのために温存せず、撤退地点で仲間と使う。"
  },
  {
   "id": "nekomata",
   "num": "021",
   "role": "デコイ",
   "title": "猫影の撹乱者",
   "stats": {
    "spd": 4,
    "camo": 4,
    "atk": 4,
    "def": 2,
    "scout": 2,
    "esc": 5
   },
   "tree": "影",
   "skill": {
    "name": "影分身・猫化け",
    "cd": 21,
    "kind": "decoy_static",
    "effect": "その場に擬態姿の分身を12秒置く。敵の見破りを1回吸収して消える。",
    "counter": "分身は微動せず、印投げでも消える。味方には半透明表示。",
    "params": {
     "dur": 12
    }
   },
   "winPlan": "本物らしい擬態地点へ置き、敵の見破りを浪費させる。",
   "escapePlan": "分身を残して角を曲がり、足音を忍び足へ切り替える。"
  },
  {
   "id": "janome",
   "num": "022",
   "role": "スカウト",
   "title": "蛇使いの追跡者",
   "stats": {
    "spd": 3,
    "camo": 4,
    "atk": 4,
    "def": 2,
    "scout": 5,
    "esc": 3
   },
   "tree": "技",
   "skill": {
    "name": "口寄せ・白蛇",
    "cd": 20,
    "kind": "snake",
    "effect": "白蛇が壁沿いを7秒進み、3m以内の擬態開始痕を一度だけ知らせる。",
    "counter": "現在位置ではなく開始地点だけ。蛇は明るく、印で消せる。",
    "params": {
     "dur": 7,
     "radius": 3,
     "speed": 3
    }
   },
   "winPlan": "擬態帯へ先に蛇を入れ、敵が移動した方向を読む。",
   "escapePlan": "追われたら蛇を別の壁へ送り、本体の選択肢を隠す。"
  },
  {
   "id": "benten",
   "num": "023",
   "role": "サポート",
   "title": "祝詞の鼓舞役",
   "stats": {
    "spd": 3,
    "camo": 3,
    "atk": 2,
    "def": 4,
    "scout": 5,
    "esc": 4
   },
   "tree": "護",
   "skill": {
    "name": "祝詞・疾拍子",
    "cd": 26,
    "kind": "tempo",
    "effect": "5秒演奏し、半径6mの味方のクールダウンを各2秒だけ進める。",
    "counter": "演奏音は10m届き、途中で被弾すると中断する。重複不可。",
    "params": {
     "channel": 5,
     "r": 6,
     "cdReduce": 2
    }
   },
   "winPlan": "安全な遮蔽物で味方の固有技を整え、二段攻勢を作る。",
   "escapePlan": "演奏せず囮の音だけを1秒鳴らし、逆方向へ走る選択もできる。"
  },
  {
   "id": "karma",
   "num": "024",
   "role": "コントローラー",
   "title": "罪業の領域主",
   "stats": {
    "spd": 2,
    "camo": 3,
    "atk": 5,
    "def": 5,
    "scout": 4,
    "esc": 2
   },
   "tree": "護",
   "skill": {
    "name": "領域・罪業",
    "cd": 27,
    "kind": "zone_null",
    "effect": "直径6mを5秒封鎖。中の敵は固有技を使えず、通常行動だけになる。",
    "counter": "設置に1秒かかり、範囲外へ出れば即解除。本人も移動が遅くなる。",
    "params": {
     "r": 3.0,
     "dur": 5,
     "setupSec": 1
    }
   },
   "winPlan": "旗前で敵の逃走技を止め、味方の印投げを通す。",
   "escapePlan": "逃げる技ではないため、味方の壁や暗幕と組み合わせる。"
  },
  {
   "id": "ichiya",
   "num": "025",
   "role": "ルートメーカー",
   "title": "忍び文字の案内役",
   "stats": {
    "spd": 4,
    "camo": 4,
    "atk": 2,
    "def": 3,
    "scout": 4,
    "esc": 4
   },
   "tree": "影",
   "skill": {
    "name": "忍びいろは・抜け道",
    "cd": 19,
    "kind": "arrows",
    "effect": "地面へ10秒残る矢印を3枚描く。味方は上を通ると2秒だけ足音が消える。",
    "counter": "敵にも墨跡は見える。矢印どおり進むとは限らない。",
    "params": {
     "dur": 10,
     "count": 3,
     "silentSec": 2
    }
   },
   "winPlan": "本命と偽ルートを混ぜ、チームの進行方向を隠す。",
   "escapePlan": "自分は三枚目だけ逆向きに使い、追手の読みを外す。"
  },
  {
   "id": "nemu",
   "num": "026",
   "role": "インフィルトレーター",
   "title": "地形を描く擬態師",
   "stats": {
    "spd": 3,
    "camo": 5,
    "atk": 2,
    "def": 4,
    "scout": 4,
    "esc": 3
   },
   "tree": "影",
   "skill": {
    "name": "動植綵絵・描景",
    "cd": 25,
    "kind": "paint_zone",
    "effect": "4m四方に8秒だけ擬態可能な偽の竹・石・木エリアを描く。",
    "counter": "色がわずかに鮮やかで、見破りを受けると2秒で消える。",
    "params": {
     "size": 4,
     "dur": 8
    }
   },
   "winPlan": "通常は隠れられない中継点を作り、潜入ルートを一つ増やす。",
   "escapePlan": "追手の前に描景を置き、入るふりをして外周へ逃げる。"
  },
  {
   "id": "karura",
   "num": "027",
   "role": "ランナー",
   "title": "雷羽の急襲者",
   "stats": {
    "spd": 5,
    "camo": 2,
    "atk": 4,
    "def": 2,
    "scout": 4,
    "esc": 4
   },
   "tree": "影",
   "skill": {
    "name": "雷遁・迅雷羽",
    "cd": 17,
    "kind": "leap",
    "effect": "指定方向へ4m跳び、着地点から2mの敵の照準を0.6秒乱す。",
    "counter": "着地点に雷の予告が0.3秒出る。壁と領域を越えない。",
    "params": {
     "dist": 4,
     "jitterR": 2,
     "jitterSec": 0.6,
     "warnSec": 0.3
    }
   },
   "winPlan": "見破り成功直後に距離を詰め、敵の退路へ着地する。",
   "escapePlan": "追手の横へ跳んで照準を乱し、そのまま遮蔽物へ走る。"
  },
  {
   "id": "xiaolan",
   "num": "028",
   "role": "ピール",
   "title": "太極の護衛役",
   "stats": {
    "spd": 4,
    "camo": 3,
    "atk": 4,
    "def": 4,
    "scout": 3,
    "esc": 3
   },
   "tree": "護",
   "skill": {
    "name": "口寄せ・双龍円",
    "cd": 16,
    "kind": "parry",
    "effect": "2秒間構え、前方から来た最初の印を反射せず地面へ落とす。",
    "counter": "側面と背後には無効。構え中は速度50%で擬態不可。",
    "params": {
     "dur": 2,
     "speedMul": 0.5
    }
   },
   "winPlan": "旗を掴む味方の正面に立ち、最後の一投を防ぐ。",
   "escapePlan": "後退しながら構え、角に着いたら解除して走る。"
  },
  {
   "id": "aum",
   "num": "029",
   "role": "ブルーザー",
   "title": "巨人の破城役",
   "stats": {
    "spd": 2,
    "camo": 2,
    "atk": 5,
    "def": 5,
    "scout": 3,
    "esc": 4
   },
   "tree": "護",
   "skill": {
    "name": "巨人の一撃",
    "cd": 23,
    "kind": "smash",
    "effect": "前方2.5mを叩き、敵と設置物を3m押し出す。金剛壁も破壊する。",
    "counter": "振りかぶり0.9秒。横移動で避けられ、外すと1秒停止。",
    "params": {
     "reach": 2.5,
     "push": 3,
     "windup": 0.9,
     "missStun": 1
    }
   },
   "winPlan": "旗周囲の敵と壁をまとめて押し、取得範囲を空ける。",
   "escapePlan": "背後へ置いた設置物を壊し、塞がれた退路を開く。"
  },
  {
   "id": "konga",
   "num": "030",
   "role": "デコイ",
   "title": "拳影の連携役",
   "stats": {
    "spd": 4,
    "camo": 3,
    "atk": 4,
    "def": 4,
    "scout": 2,
    "esc": 4
   },
   "tree": "影",
   "skill": {
    "name": "影分身・連拳",
    "cd": 20,
    "kind": "echo_clone",
    "effect": "分身が3秒間、自分の0.6秒前の動きを再現し、印を一回吸収する。",
    "counter": "常に少し遅れるので注視すれば本体が分かる。範囲攻撃で同時に消える。",
    "params": {
     "dur": 3,
     "delay": 0.6
    }
   },
   "winPlan": "本体と分身で入口を二重に見せ、相手の照準を散らす。",
   "escapePlan": "急な切り返しを二度入れ、遅れる分身と交差する。"
  },
  {
   "id": "shion",
   "num": "031",
   "role": "トラッパー",
   "title": "野アザミの罠師",
   "stats": {
    "spd": 4,
    "camo": 4,
    "atk": 4,
    "def": 2,
    "scout": 4,
    "esc": 3
   },
   "tree": "影",
   "skill": {
    "name": "野アザミ・棘道",
    "cd": 21,
    "kind": "thorns",
    "effect": "長さ5mの細い棘道を8秒設置。踏んだ敵の足跡を3秒表示する。",
    "counter": "棘は床に見え、忍び足なら発動範囲が半分になる。",
    "params": {
     "len": 5,
     "dur": 8,
     "revealSec": 3
    }
   },
   "winPlan": "細い通路に斜め置きし、回避する敵を味方の射線へ誘う。",
   "escapePlan": "追手との間に置くが、自分の帰路を塞がない角度にする。"
  },
  {
   "id": "seori",
   "num": "032",
   "role": "コントローラー",
   "title": "呪刻の遅延役",
   "stats": {
    "spd": 2,
    "camo": 4,
    "atk": 4,
    "def": 4,
    "scout": 5,
    "esc": 2
   },
   "tree": "護",
   "skill": {
    "name": "丑の刻参り・呪標",
    "cd": 24,
    "kind": "hex",
    "effect": "視認中の敵一人へ呪標。4秒後まで範囲8m内なら固有技の回復を4秒遅らせる。",
    "counter": "対象に大きな藁人形印が出る。8m外へ離れれば不発。",
    "params": {
     "dur": 4,
     "range": 8,
     "cdDelay": 4
    }
   },
   "winPlan": "逃走技を使った直後の敵へ付け、次の進入を遅らせる。",
   "escapePlan": "自分の逃走は弱いので、付与後すぐ味方の後ろへ下がる。"
  },
  {
   "id": "quon",
   "num": "033",
   "role": "オールラウンダー",
   "title": "二択を迫る猫目",
   "stats": {
    "spd": 4,
    "camo": 4,
    "atk": 3,
    "def": 3,
    "scout": 4,
    "esc": 3
   },
   "tree": "選択",
   "skill": {
    "name": "猫の目の選択",
    "cd": 18,
    "kind": "cat_choice",
    "effect": "発動時に「白目＝5秒索敵+1」「黒目＝5秒擬態+1」を選ぶ。",
    "counter": "選択色が頭上に見え、途中変更不可。攻撃補正は得ない。",
    "params": {
     "dur": 5
    }
   },
   "winPlan": "敵の構成と残り時間を見て、侵入と迎撃を切り替える。",
   "escapePlan": "黒目で隠れるか、白目で追手を先に見つけて避ける。"
  },
  {
   "id": "magoichi",
   "num": "034",
   "role": "マークスマン",
   "title": "一発必中の狙撃手",
   "stats": {
    "spd": 2,
    "camo": 2,
    "atk": 5,
    "def": 3,
    "scout": 5,
    "esc": 4
   },
   "tree": "技",
   "skill": {
    "name": "一発必中・狙撃印",
    "cd": 20,
    "kind": "snipe",
    "effect": "1.2秒静止して構え、射程14mの高速印を一発撃つ。",
    "counter": "赤い照準線が0.6秒見え、被弾や移動で中断する。",
    "params": {
     "channel": 1.2,
     "range": 14,
     "speed": 28
    }
   },
   "winPlan": "味方の索敵で見えた敵を遠距離から牽制する。",
   "escapePlan": "逃走時は通常印を使い、狙撃のために止まらない。"
  },
  {
   "id": "ibuki",
   "num": "035",
   "role": "サポート",
   "title": "帰魂の立て直し役",
   "stats": {
    "spd": 3,
    "camo": 4,
    "atk": 3,
    "def": 4,
    "scout": 4,
    "esc": 3
   },
   "tree": "護",
   "skill": {
    "name": "泰山府君祭・帰魂",
    "cd": 25,
    "kind": "soul_return",
    "effect": "帰還中の味方一人の待機を1.5秒短縮し、復帰後の保護を1秒延長する。",
    "counter": "生存中の味方には使えず、同じ帰還へ一度だけ。",
    "params": {
     "returnCut": 1.5,
     "protectAdd": 1
    }
   },
   "winPlan": "人数不利の時間を短くし、再集合を早める。",
   "escapePlan": "自分の直接逃走技ではないため、擬態を早めに使う。"
  },
  {
   "id": "oen",
   "num": "036",
   "role": "サポート",
   "title": "糸脈の護送役",
   "stats": {
    "spd": 3,
    "camo": 4,
    "atk": 2,
    "def": 5,
    "scout": 4,
    "esc": 3
   },
   "tree": "護",
   "skill": {
    "name": "糸脈・結び糸",
    "cd": 21,
    "kind": "thread",
    "effect": "味方一人と8秒接続。互いが6m以内なら被発見時間を20%短縮する。",
    "counter": "糸は近距離で敵にも見え、6mを超えると切れる。",
    "params": {
     "dur": 8,
     "linkRange": 6,
     "range": 8
    }
   },
   "winPlan": "旗手と並走し、可視化を早く解いて再潜入を助ける。",
   "escapePlan": "追われたら糸を切る方向へ分かれ、敵の標的を割る。"
  },
  {
   "id": "izuna",
   "num": "037",
   "role": "インフィルトレーター",
   "title": "飯綱の最速隠密",
   "stats": {
    "spd": 5,
    "camo": 5,
    "atk": 2,
    "def": 2,
    "scout": 3,
    "esc": 4
   },
   "tree": "影",
   "skill": {
    "name": "飯綱の法・狐駆け",
    "cd": 23,
    "kind": "fox_dash",
    "effect": "6秒間、擬態中の移動速度が通常の70%まで上がる。",
    "counter": "布の揺れが大きくなり、1.5m以内では自動発見される。",
    "params": {
     "dur": 6,
     "camoSpeedRatio": 0.7
    }
   },
   "winPlan": "擬態帯を素早く渡り、敵が数える前に位置を変える。",
   "escapePlan": "同じ柄の中を横へ逃げ、遠距離の見破りを空振りさせる。"
  },
  {
   "id": "sekishusai",
   "num": "038",
   "role": "デュエリスト",
   "title": "無刀取りの反撃役",
   "stats": {
    "spd": 3,
    "camo": 2,
    "atk": 5,
    "def": 5,
    "scout": 3,
    "esc": 3
   },
   "tree": "技",
   "skill": {
    "name": "無刀取り",
    "cd": 18,
    "kind": "counter_stance",
    "effect": "1.1秒だけ構え、正面2m以内の敵が印を投げるとその攻撃を無効化し、敵を0.8秒止める。",
    "counter": "構えの青い円が見える。遠距離・側面・固有設置物には無効。",
    "params": {
     "dur": 1.1,
     "reach": 2,
     "stun": 0.8,
     "speedMul": 0.7
    }
   },
   "winPlan": "狭い門で相手の攻撃を誘い、味方の反撃を確定させる。",
   "escapePlan": "相手に見せて撃たせず、その1.1秒で角まで下がる。"
  },
  {
   "id": "sasagane",
   "num": "039",
   "role": "オールラウンダー",
   "title": "根の国の変転者",
   "stats": {
    "spd": 4,
    "camo": 4,
    "atk": 3,
    "def": 3,
    "scout": 3,
    "esc": 4
   },
   "tree": "選択",
   "skill": {
    "name": "根渡り・影穴",
    "cd": 26,
    "kind": "shadow_gate",
    "effect": "影の上に入口を置き、6秒以内に5m以内の別の影へ出口を置くと一度だけ移動できる。",
    "counter": "入口と出口は紫に光り、敵も一度だけ追って入れる。",
    "params": {
     "window": 6,
     "range": 5,
     "followSec": 3
    }
   },
   "winPlan": "壁を越えずに高低差のない二点をつなぎ、奇襲ルートを作る。",
   "escapePlan": "追手が入れる危険を見越し、出口に味方を待たせる。"
  }
 ],
 "hp": {
  "byLevel": [
   100,
   105,
   110,
   115,
   120
  ],
  "xpThresholds": [
   0,
   80,
   200,
   360,
   560
  ],
  "exposeSec": 12,
  "exposeMove": 0.7,
  "healSec": 3,
  "healHp": 35,
  "healSecFast": 2.3,
  "healHpFast": 45,
  "healRange": 1.5,
  "invulnSec": 0.6,
  "revealSec": 3,
  "minCamoHp": 30,
  "pickSec": 5,
  "baseDamage": 34,
  "xp": {
   "reveal": 12,
   "hit": 3,
   "hp0": 12,
   "heal": 10,
   "cross": 8,
   "hold": 8,
   "holdEvery": 3
  }
 },
 "trees": {
  "影": {
   "2": {
    "name": "音無し足",
    "effect": "忍び足の移動速度を10%上げる。"
   },
   "3": {
    "name": "残り香断ち",
    "effect": "見破り・被弾による可視化を0.5秒短くする。"
   },
   "4": {
    "name": "擬態熟練",
    "effect": "擬態持続を3秒延ばし、開始を0.1秒速くする。"
   },
   "5": {
    "name": "奥義・影渡り",
    "effect": "一試合一度、5秒間だけ擬態移動速度が通常の70%になる。旗の3m以内で解除。"
   }
  },
  "技": {
   "2": {
    "name": "早印",
    "effect": "通常の印投げクールダウンを0.15秒短縮する。"
   },
   "3": {
    "name": "広眼",
    "effect": "見破り半径を0.5m広げる。角度と壁判定は共通。"
   },
   "4": {
    "name": "忍術研鑽",
    "effect": "キャラクター固有技のクールダウンを15%短縮する。"
   },
   "5": {
    "name": "奥義・再演",
    "effect": "一試合一度、使用直後の固有技クールダウンを即時に完了する。"
   }
  },
  "護": {
   "2": {
    "name": "厚布",
    "effect": "受けるダメージをさらに4%減らす。"
   },
   "3": {
    "name": "最初の一印",
    "effect": "HP満タン後の最初の一撃だけ、ダメージを5減らす。再発動まで15秒。"
   },
   "4": {
    "name": "手当上手",
    "effect": "味方の手当を3.0秒から2.3秒にし、復帰HPを35から45へ上げる。"
   },
   "5": {
    "name": "奥義・不退陣",
    "effect": "一試合一度、8秒間、自分から4m以内の味方が受けるダメージを12%減らす。"
   }
  }
 },
 "treeNames": {
  "影": "影（潜入・擬態）",
  "技": "技（見破り・印・固有技）",
  "護": "護（耐久・手当・守り）"
 },
 "xpActions": [
  {
   "action": "敵を新しく見破る",
   "xp": 12,
   "rule": "同じ敵からは10秒に一度。擬態解除まで成功した時だけ。"
  },
  {
   "action": "敵へ有効な一撃",
   "xp": 3,
   "rule": "無敵中・露見中・自陣保護中への攻撃は0。"
  },
  {
   "action": "敵をHP0にする",
   "xp": 12,
   "rule": "同じ敵の再露見からは20秒間0。とどめ役に個人加点しない。"
  },
  {
   "action": "味方を手当で復帰",
   "xp": 10,
   "rule": "手当が最後まで成立した時だけ。"
  },
  {
   "action": "擬態で中央線を越える",
   "xp": 8,
   "rule": "一回の復帰につき一度。移動せず稼ぐことはできない。"
  },
  {
   "action": "旗の周囲4mを確保",
   "xp": 8,
   "intervalSec": 3,
   "xpText": "+8 / 3秒",
   "rule": "生存中の人数が相手より多い時だけ。チームで一回分。"
  }
 ],
 "passCriteria": [
  "一人あたりHP0は1試合1〜3回",
  "露見は平均6〜9秒で復帰",
  "チームレベル差は80%以上の時間で1以内",
  "レベル5到達は接戦の30〜50%",
  "ダメージ由来XPは35%以下",
  "擬態で旗へ近づく時間が追跡時間を上回る"
 ],
 "notes": {
  "marks": "設計図の「印」はHP制に読み替える。『印の残り時間』＝被弾後の可視化の残り時間（守り兎・円光）／『自分の印を一つ消す』＝HP回復（身代札・印がない＝HP満タンだと使えない）",
  "foxdash": "狐駆けの『1.5m以内で自動発見』は既定の近距離発見2.1mで満たす（上書きで狭めない）。布の揺れ＝擬態中の足音がしゃがみと同じ3mまで聞こえる",
  "gate": "影穴：入口を置き、6秒以内に入口のそばでもう一度押すと、向いた方向・入口から5m以内（柄の上を優先）へ出口を置いて移動。出口ができてから3秒、敵が一人だけ追って入れる"
 }
};
if (typeof module !== "undefined") module.exports = BALANCE;
