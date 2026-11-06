import vtpbf from 'vt-pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { DEFAULT_SOURCE_LAYER } from './constants.js';

/**
 * 将 geojson-vt tile 编码为标准二维 MVT protobuf 二进制。
 *
 * @param {object} tile geojson-vt 返回的单个 tile。
 * @param {string} sourceLayer MVT source layer 名称。
 * @returns {Uint8Array}
 */
export function encode2dTile(tile, sourceLayer = DEFAULT_SOURCE_LAYER) {
    if (!tile || typeof tile !== 'object') {
        throw new Error('二维 tile 必须是 geojson-vt tile 对象。');
    }

    if (typeof sourceLayer !== 'string' || sourceLayer.length === 0) {
        throw new Error('二维 MVT source layer 必须是非空字符串。');
    }

    return vtpbf.fromGeojsonVt({
        [sourceLayer]: tile
    });
}

/**
 * 将标准二维 MVT protobuf 二进制解码为 VectorTile 对象。
 *
 * @param {Uint8Array|ArrayBuffer} bufferLike 未压缩的 MVT protobuf 数据。
 * @returns {VectorTile}
 */
export function decode2dTile(bufferLike) {
    return new VectorTile(new PbfReader(bufferLike));
}
