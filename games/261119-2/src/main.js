// 最初に読む部分: 土台と最初の場面（つつむ）だけ。たび・おばあちゃんの家は late.js にあり、遊んでいる間に裏で読む。
import * as THREE_LATE from 'gf:three-late'; // late.js が使う three の部品（ビルド時に late.js の中身から決まる）
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as coreMod from './core.js';
import * as parcel from './parcel.js';
import * as items from './items.js';
import * as truck from './truck.js';
import pack from './scene_pack.js';
const { core } = coreMod;
// late.js と共有する部品（同じ物を2回持たないように）
window.__gf2 = { three: THREE_LATE, bgu: BGU, rbg: { RoundedBoxGeometry }, core: coreMod, parcel, items, truck };
core.register(pack);
core.lazy.trip = core.lazy.home = __LATE_SRC__;
core.start();
core.bgScene('trip'); core.bgScene('home');
