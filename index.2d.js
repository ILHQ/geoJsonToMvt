import {
    DEFAULT_INPUT_PATH,
    DEFAULT_TILES_DIR
} from './src/2d/constants.js';
import {
    countFeaturesWithThirdCoordinate,
    normalizeFeatureCollection,
    readFeatureCollection
} from './src/2d/featureCollection.js';
import { gzipTileDirectory } from './src/shared/gzipTiles.js';
import { generateTiles } from './src/2d/tileGenerator.js';

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
 * 执行固定输入到固定输出的二维 MVT 生成流程。
 */
function main() {
    console.log('📖 读取二维 FeatureCollection...');
    const rawFeatureCollection = readFeatureCollection(DEFAULT_INPUT_PATH);
    const featureCollection = normalizeFeatureCollection(rawFeatureCollection);
    const thirdCoordinateCount = countFeaturesWithThirdCoordinate(rawFeatureCollection);

    console.log(`📊 要素数量: ${featureCollection.features.length}`);
    console.log(`🧭 含第三维坐标要素数量: ${thirdCoordinateCount}`);
    console.log(`🧩 几何类型统计: ${summarizeGeometryTypes(featureCollection)}`);
    console.log('📦 输出格式: 标准二维 MVT（geojson-vt + vt-pbf）');
    if (thirdCoordinateCount > 0) {
        console.log('ℹ️  二维链路会忽略几何第三维，不会额外写入 altitude。');
    }

    const tileStats = generateTiles(featureCollection);
    const gzipStats = gzipTileDirectory(DEFAULT_TILES_DIR);
    console.log(`✅ 已生成 ${tileStats.total} 个二维瓦片`);
    console.log(`   分层统计: ${formatTileStats(tileStats.byZoom)}`);
    console.log(`   gzip 文件数: ${gzipStats.fileCount}`);
    console.log(`   清理历史 .pbf.gz: ${gzipStats.removedLegacyGzipCount}`);
    console.log(`   gzip 压缩前: ${gzipStats.rawDisplay}`);
    console.log(`   gzip 压缩后: ${gzipStats.gzipDisplay}`);
    console.log(`   gzip 压缩率: ${gzipStats.ratio}%`);
    console.log('\n✨ 完成');
    console.log(`   - 瓦片目录: ${DEFAULT_TILES_DIR}`);
    console.log('   - 注意: 磁盘上的 .pbf 文件内容已是 gzip，需要由 nginx 返回 Content-Encoding: gzip');
}

main();
