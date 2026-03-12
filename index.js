import fs from 'fs';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';

/**
 * 从 GeoJSON 要素的坐标中提取高度信息并添加到属性中
 * @param {Object} feature - GeoJSON 要素
 * @returns {Object} 处理后的要素
 */
function extractAltitudeToProperties(feature) {
    if (!feature.geometry || !feature.geometry.coordinates) {
        return feature;
    }

    const coords = feature.geometry.coordinates;
    let altitude = null;

    // 处理不同几何类型的高度提取
    switch (feature.geometry.type) {
        case 'Point':
            if (coords.length >= 3) {
                altitude = coords[2];
            }
            break;
        case 'MultiPoint':
            // 取第一个点的高度
            if (coords.length > 0 && coords[0].length >= 3) {
                altitude = coords[0][2];
            }
            break;
        case 'LineString':
            // 取线段起点的高度
            if (coords.length > 0 && coords[0].length >= 3) {
                altitude = coords[0][2];
            }
            break;
        case 'MultiLineString':
            if (coords.length > 0 && coords[0].length > 0 && coords[0][0].length >= 3) {
                altitude = coords[0][0][2];
            }
            break;
        case 'Polygon':
            // 取多边形第一个环的第一个点的高度
            if (coords.length > 0 && coords[0].length > 0 && coords[0][0].length >= 3) {
                altitude = coords[0][0][2];
            }
            break;
        case 'MultiPolygon':
            if (coords.length > 0 && coords[0].length > 0 && coords[0][0].length > 0 && coords[0][0][0].length >= 3) {
                altitude = coords[0][0][0][2];
            }
            break;
    }

    // 如果找到了高度信息，添加到属性中
    if (altitude !== null) {
        feature.properties = feature.properties || {};
        // 避免覆盖已有的 altitude 属性
        if (!feature.properties.altitude) {
            feature.properties.altitude = altitude;
        }
        // 添加原始坐标标记
        feature.properties.has_altitude = true;
    }

    return feature;
}

// 读取 GeoJSON
console.log('📖 读取 GeoJSON 文件...');
const geojson = JSON.parse(
    fs.readFileSync('./input/airspaceData.json', 'utf8')
);

console.log(`📊 原始要素数量: ${geojson.features.length}`);

// 处理所有要素，提取高度信息
console.log('🔄 处理要素，提取高度信息...');
let withAltitudeCount = 0;

geojson.features = geojson.features.map(feature => {
    const processed = extractAltitudeToProperties(feature);
    if (processed.properties?.has_altitude) {
        withAltitudeCount++;
    }
    return processed;
});

console.log(`✅ 已提取 ${withAltitudeCount} 个要素的高度信息`);

// 创建瓦片索引
console.log('⚙️  创建瓦片索引...');
const tileIndex = geojsonvt(geojson, {
    maxZoom: 14,          // 最大切片层级
    indexMaxZoom: 6,      // 索引层级
    indexMaxPoints: 100000,
    tolerance: 3,         // 简化容差
    extent: 4096,
    buffer: 64,
    debug: 0
});

// 生成瓦片
console.log('🔨 生成 PBF 瓦片...');
let tileCount = 0;

for (let z = 0; z <= 14; z++) {
    const max = 1 << z;

    for (let x = 0; x < max; x++) {
        for (let y = 0; y < max; y++) {
            const tile = tileIndex.getTile(z, x, y);
            if (!tile) continue;

            const buffer = vtpbf.fromGeojsonVt({
                data: tile
            });

            const dir = `./output/tiles/${z}/${x}`;
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(`${dir}/${y}.pbf`, buffer);

            tileCount++;
        }
    }
}

console.log(`✅ 瓦片生成完成: ${tileCount} 个瓦片`);
console.log('\n🎉 全部完成！\n');
console.log('💡 提示:');
console.log('   - 高度信息已保存在要素的 "altitude" 属性中');
console.log('   - 可以在 MapLibre 中通过 feature.properties.altitude 访问');
console.log('   - 可用于 3D 可视化、颜色映射等场景');
