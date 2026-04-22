import fs from 'fs';
import { buildTiles } from './src/3d/customTileBuilder.js';
import { encodeTile } from './src/3d/customTileCodec.js';
import {
    DEFAULT_INPUT_PATH,
    DEFAULT_TILES_DIR,
    FULL_DATA_MAX_ZOOM,
    FULL_DATA_MIN_ZOOM
} from './src/3d/constants.js';
import {
    countFeaturesWithThirdCoordinate,
    normalizeFeatureCollection,
    readFeatureCollection
} from './src/3d/featureCollection.js';

/**
 * 统计各几何类型数量，便于日志快速确认输入结构。
 */
function summarizeGeometryTypes(featureCollection) {
    const geometryCountByType = new Map();

    featureCollection.features.forEach(feature => {
        const geometryType = feature.geometry?.type || 'Unknown';
        geometryCountByType.set(
            geometryType,
            (geometryCountByType.get(geometryType) || 0) + 1
        );
    });

    return Array.from(geometryCountByType.entries())
        .map(([geometryType, count]) => `${geometryType}=${count}`)
        .join(', ');
}

/**
 * 将分层瓦片统计格式化为单行日志。
 */
function formatTileStats(tileCountByZoom) {
    return Array.from(tileCountByZoom.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([zoom, count]) => `z${zoom}=${count}`)
        .join(', ');
}

/**
 * 将自定义三维 tile 写入输出目录。
 */
function writeTiles(tiles) {
    const tileCountByZoom = new Map();

    tiles.forEach(tile => {
        const tileDir = `${DEFAULT_TILES_DIR}/${tile.z}/${tile.x}`;
        const tilePath = `${tileDir}/${tile.y}.pbf`;

        fs.mkdirSync(tileDir, { recursive: true });
        fs.writeFileSync(tilePath, encodeTile(tile));

        tileCountByZoom.set(tile.z, (tileCountByZoom.get(tile.z) || 0) + 1);
    });

    return {
        total: tiles.length,
        byZoom: tileCountByZoom
    };
}

/**
 * 写出 tile manifest，供预览侧避免无效 404 请求。
 */
function writeTileManifest(tiles) {
    const tilesByZoom = {};

    tiles.forEach(tile => {
        const zoomKey = String(tile.z);
        if (!tilesByZoom[zoomKey]) {
            tilesByZoom[zoomKey] = [];
        }

        tilesByZoom[zoomKey].push(`${tile.x}/${tile.y}`);
    });

    const manifest = {
        version: 1,
        format: 'custom-3d-pbf',
        minZoom: FULL_DATA_MIN_ZOOM,
        maxZoom: FULL_DATA_MAX_ZOOM,
        totalTiles: tiles.length,
        tiles: tilesByZoom
    };

    fs.mkdirSync(DEFAULT_TILES_DIR, { recursive: true });
    fs.writeFileSync(
        `${DEFAULT_TILES_DIR}/manifest.json`,
        JSON.stringify(manifest, null, 2)
    );
}

/**
 * 执行固定输入到固定输出的三维 PBF 生成流程。
 */
function main() {
    console.log('📖 读取 FeatureCollection...');
    const rawFeatureCollection = readFeatureCollection(DEFAULT_INPUT_PATH);
    const featureCollection = normalizeFeatureCollection(rawFeatureCollection);
    const thirdCoordinateCount = countFeaturesWithThirdCoordinate(rawFeatureCollection);

    console.log(`📊 要素数量: ${featureCollection.features.length}`);
    console.log(`🧭 含第三维坐标要素数量: ${thirdCoordinateCount}`);
    console.log(`🧩 几何类型统计: ${summarizeGeometryTypes(featureCollection)}`);
    console.log('📦 输出格式: 自定义三维 protobuf tile（非标准 MVT）');
    console.log(`⚙️  生成 ${FULL_DATA_MIN_ZOOM}-${FULL_DATA_MAX_ZOOM} 层切片...`);

    const tiles = buildTiles(
        featureCollection,
        FULL_DATA_MIN_ZOOM,
        FULL_DATA_MAX_ZOOM
    );

    const tileStats = writeTiles(tiles);
    writeTileManifest(tiles);
    console.log(`✅ 已生成 ${tileStats.total} 个瓦片`);
    console.log(`   分层统计: ${formatTileStats(tileStats.byZoom)}`);
    console.log('\n✨ 完成');
    console.log(`   - 瓦片目录: ${DEFAULT_TILES_DIR}`);
    console.log(`   - manifest: ${DEFAULT_TILES_DIR}/manifest.json`);
}

main();
