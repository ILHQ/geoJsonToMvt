import fs from 'fs';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
import {
    DEFAULT_INPUT_PATH,
    DEFAULT_SOURCE_LAYER,
    DEFAULT_TILES_DIR,
    FULL_DATA_MAX_ZOOM,
    FULL_DATA_MIN_ZOOM
} from './src/pointSampler.js';
import {
    countFeaturesWithThirdCoordinate,
    normalizeFeatureCollection,
    readFeatureCollection
} from './src/featureCollection.js';

/**
 * 判断切片是否包含可编码的要素。
 */
function hasRenderableFeatures(tile) {
    return Array.isArray(tile?.features) && tile.features.length > 0;
}

/**
 * 递归更新边界框，兼容任意层级的 GeoJSON coordinates 结构。
 */
function updateBoundsFromCoordinates(coordinates, bounds) {
    if (!Array.isArray(coordinates)) {
        return;
    }

    if (
        coordinates.length >= 2 &&
        typeof coordinates[0] === 'number' &&
        typeof coordinates[1] === 'number'
    ) {
        bounds.minLng = Math.min(bounds.minLng, coordinates[0]);
        bounds.maxLng = Math.max(bounds.maxLng, coordinates[0]);
        bounds.minLat = Math.min(bounds.minLat, coordinates[1]);
        bounds.maxLat = Math.max(bounds.maxLat, coordinates[1]);
        return;
    }

    coordinates.forEach(child => {
        updateBoundsFromCoordinates(child, bounds);
    });
}

/**
 * 计算 FeatureCollection 的经纬度边界。
 */
function calculateFeatureCollectionBounds(featureCollection) {
    const bounds = {
        minLng: Infinity,
        maxLng: -Infinity,
        minLat: Infinity,
        maxLat: -Infinity
    };

    featureCollection.features.forEach(feature => {
        updateBoundsFromCoordinates(feature.geometry?.coordinates, bounds);
    });

    if (!Number.isFinite(bounds.minLng) || !Number.isFinite(bounds.minLat)) {
        return null;
    }

    return bounds;
}

/**
 * 将经度转换为指定缩放级别的瓦片列号。
 */
function lngToTileX(lng, zoom) {
    const tileCount = 1 << zoom;
    const raw = ((lng + 180) / 360) * tileCount;
    return Math.min(tileCount - 1, Math.max(0, Math.floor(raw)));
}

/**
 * 将纬度转换为指定缩放级别的瓦片行号。
 */
function latToTileY(lat, zoom) {
    const tileCount = 1 << zoom;
    const rad = (lat * Math.PI) / 180;
    const raw = (
        (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2
    ) * tileCount;
    return Math.min(tileCount - 1, Math.max(0, Math.floor(raw)));
}

/**
 * 按数据边界直接扫描目标缩放层级内的非空瓦片。
 */
function collectTilesInRange(tileIndex, featureCollection, minZoom, maxZoom) {
    const bounds = calculateFeatureCollectionBounds(featureCollection);
    if (!bounds) {
        return [];
    }

    const collectedTiles = [];

    for (let z = minZoom; z <= maxZoom; z++) {
        const minX = lngToTileX(bounds.minLng, z);
        const maxX = lngToTileX(bounds.maxLng, z);
        const minY = latToTileY(bounds.maxLat, z);
        const maxY = latToTileY(bounds.minLat, z);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
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
 * 将收集到的瓦片编码为 PBF 并写入输出目录。
 */
function writeTiles(tileIndex, featureCollection) {
    const tiles = collectTilesInRange(
        tileIndex,
        featureCollection,
        FULL_DATA_MIN_ZOOM,
        FULL_DATA_MAX_ZOOM
    );
    const tileCountByZoom = new Map();

    for (const { z, x, y, tile } of tiles) {
        const buffer = vtpbf.fromGeojsonVt({
            [DEFAULT_SOURCE_LAYER]: tile
        });

        const tileDir = `${DEFAULT_TILES_DIR}/${z}/${x}`;
        fs.mkdirSync(tileDir, { recursive: true });
        fs.writeFileSync(`${tileDir}/${y}.pbf`, buffer);

        tileCountByZoom.set(z, (tileCountByZoom.get(z) || 0) + 1);
    }

    return {
        total: tiles.length,
        byZoom: tileCountByZoom
    };
}

/**
 * 将分层瓦片统计格式化为单行日志。
 */
function formatTileStats(tileCountByZoom) {
    return Array.from(tileCountByZoom.entries())
        .map(([zoom, count]) => `z${zoom}=${count}`)
        .join(', ');
}

/**
 * 执行固定输入到固定输出的 MVT 生成流程。
 */
function main() {
    console.log('📖 读取 FeatureCollection...');
    const rawFeatureCollection = readFeatureCollection(DEFAULT_INPUT_PATH);
    const featureCollection = normalizeFeatureCollection(rawFeatureCollection);
    const thirdCoordinateCount = countFeaturesWithThirdCoordinate(rawFeatureCollection);

    console.log(`📊 要素数量: ${featureCollection.features.length}`);
    console.log(`🧭 含第三维坐标要素数量: ${thirdCoordinateCount}`);
    if (thirdCoordinateCount > 0) {
        console.log('ℹ️  MVT 几何仅支持二维坐标，已同步第三维到 properties.altitude。');
    }
    console.log('📍 输出几何: Point，properties 仅保留业务字段和 altitude。');
    console.log(`⚙️  生成 ${FULL_DATA_MIN_ZOOM}-${FULL_DATA_MAX_ZOOM} 层 MVT 瓦片...`);

    const tileIndex = geojsonvt(featureCollection, {
        maxZoom: FULL_DATA_MAX_ZOOM,
        indexMaxZoom: Math.min(FULL_DATA_MAX_ZOOM, 6),
        indexMaxPoints: 100000,
        tolerance: 3,
        extent: 4096,
        buffer: 64,
        debug: 0
    });

    const tileStats = writeTiles(tileIndex, featureCollection);
    console.log(`✅ 已生成 ${tileStats.total} 个瓦片`);
    console.log(`   分层统计: ${formatTileStats(tileStats.byZoom)}`);
    console.log('\n✨ 完成');
    console.log(`   - 瓦片目录: ${DEFAULT_TILES_DIR}`);
}

main();
