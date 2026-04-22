import fs from 'fs';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
import {
    DEFAULT_SOURCE_LAYER,
    DEFAULT_TILES_DIR,
    FULL_DATA_MAX_ZOOM,
    FULL_DATA_MIN_ZOOM
} from './constants.js';
import {
    calculateFeatureCollectionBounds,
    latToTileY,
    lngToTileX
} from './tileMath.js';

/**
 * 判断切片是否包含可编码要素。
 */
function hasRenderableFeatures(tile) {
    return Array.isArray(tile?.features) && tile.features.length > 0;
}

/**
 * 按数据边界扫描目标缩放层级内的非空瓦片。
 */
function collectTilesInRange(tileIndex, featureCollection, minZoom, maxZoom) {
    const bounds = calculateFeatureCollectionBounds(featureCollection);
    if (!bounds) {
        return [];
    }

    const collectedTiles = [];

    for (let z = minZoom; z <= maxZoom; z += 1) {
        const minX = lngToTileX(bounds.minLng, z);
        const maxX = lngToTileX(bounds.maxLng, z);
        const minY = latToTileY(bounds.maxLat, z);
        const maxY = latToTileY(bounds.minLat, z);

        for (let x = minX; x <= maxX; x += 1) {
            for (let y = minY; y <= maxY; y += 1) {
                const tile = tileIndex.getTile(z, x, y);
                if (!hasRenderableFeatures(tile)) {
                    continue;
                }

                collectedTiles.push({ z, x, y, tile });
            }
        }
    }

    return collectedTiles;
}

/**
 * 将二维 tile 编码为标准 MVT，并写入输出目录。
 */
export function generateTiles(featureCollection) {
    const tileIndex = geojsonvt(featureCollection, {
        maxZoom: FULL_DATA_MAX_ZOOM,
        indexMaxZoom: Math.min(FULL_DATA_MAX_ZOOM, 6),
        indexMaxPoints: 100000,
        tolerance: 3,
        extent: 4096,
        buffer: 64,
        debug: 0
    });
    const tiles = collectTilesInRange(
        tileIndex,
        featureCollection,
        FULL_DATA_MIN_ZOOM,
        FULL_DATA_MAX_ZOOM
    );
    const tileCountByZoom = new Map();

    tiles.forEach(({ z, x, y, tile }) => {
        const buffer = vtpbf.fromGeojsonVt({
            [DEFAULT_SOURCE_LAYER]: tile
        });
        const tileDir = `${DEFAULT_TILES_DIR}/${z}/${x}`;

        fs.mkdirSync(tileDir, { recursive: true });
        fs.writeFileSync(`${tileDir}/${y}.pbf`, buffer);
        tileCountByZoom.set(z, (tileCountByZoom.get(z) || 0) + 1);
    });

    return {
        total: tiles.length,
        byZoom: tileCountByZoom
    };
}
