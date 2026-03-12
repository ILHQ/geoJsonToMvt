import fs from 'fs';
import path from 'path';

/**
 * 分析 GeoJSON 数据，提取几何类型、属性字段等信息
 * @param {Object} geojson - GeoJSON 对象
 * @returns {Object} 分析结果
 */
function analyzeGeoJSON(geojson) {
    const geometryTypes = new Set();
    const allProperties = new Map(); // propertyName -> {values: Set, types: Set}

    if (!geojson.features || geojson.features.length === 0) {
        return {
            geometryTypes: [],
            properties: {}
        };
    }

    // 分析前 1000 个要素以获取统计信息
    const sampleSize = Math.min(geojson.features.length, 1000);
    for (let i = 0; i < sampleSize; i++) {
        const feature = geojson.features[i];
        const { geometry, properties } = feature;

        // 记录几何类型
        if (geometry) {
            geometryTypes.add(geometry.type);
        }

        // 记录属性信息
        if (properties) {
            Object.entries(properties).forEach(([key, value]) => {
                if (!allProperties.has(key)) {
                    allProperties.set(key, { values: new Set(), types: new Set() });
                }
                const propInfo = allProperties.get(key);
                propInfo.values.add(value);
                propInfo.types.add(typeof value);
            });
        }
    }

    // 转换为简单对象
    const propertiesInfo = {};
    allProperties.forEach((info, key) => {
        propertiesInfo[key] = {
            sampleValues: Array.from(info.values).slice(0, 10), // 保存前 10 个样例值
            types: Array.from(info.types)
        };
    });

    return {
        geometryTypes: Array.from(geometryTypes),
        properties: propertiesInfo,
        featureCount: geojson.features.length
    };
}

/**
 * 根据几何类型获取对应的图层类型
 * @param {string} geometryType - GeoJSON 几何类型
 * @returns {string} MapLibre 图层类型
 */
function getLayerType(geometryType) {
    const typeMap = {
        'Point': 'circle',
        'MultiPoint': 'circle',
        'LineString': 'line',
        'MultiLineString': 'line',
        'Polygon': 'fill',
        'MultiPolygon': 'fill'
    };
    return typeMap[geometryType] || 'circle';
}

/**
 * 生成默认颜色
 * @param {number} index - 索引
 * @returns {string} 颜色值
 */
function getDefaultColor(index) {
    const colors = [
        '#66bd63', '#a6d96a', '#d9ef8b', '#ffffbf',
        '#fee08b', '#fdae61', '#f46d43', '#d73027'
    ];
    return colors[index % colors.length];
}

/**
 * 根据几何类型生成图层配置
 * @param {string} geometryType - 几何类型
 * @param {string} layerId - 图层 ID
 * @param {string} sourceLayer - 数据源图层名称
 * @param {Object} propertiesInfo - 属性信息
 * @returns {Object} 图层配置
 */
function generateLayerConfig(geometryType, layerId, sourceLayer, propertiesInfo) {
    const layerType = getLayerType(geometryType);
    const baseLayer = {
        id: layerId,
        type: layerType,
        source: 'vector-tiles',
        'source-layer': sourceLayer
    };

    // 如果有 color 属性，使用它
    if (propertiesInfo.color && propertiesInfo.color.types.includes('string')) {
        const hasColorValues = propertiesInfo.color.sampleValues.some(
            v => typeof v === 'string' && v.startsWith('#')
        );

        if (hasColorValues) {
            switch (layerType) {
                case 'circle':
                    baseLayer.paint = {
                        'circle-radius': 6,
                        'circle-color': ['get', 'color'],
                        'circle-opacity': 0.8
                    };
                    break;
                case 'line':
                    baseLayer.paint = {
                        'line-color': ['get', 'color'],
                        'line-width': 2,
                        'line-opacity': 0.8
                    };
                    break;
                case 'fill':
                    baseLayer.paint = {
                        'fill-color': ['get', 'color'],
                        'fill-opacity': 0.6
                    };
                    break;
            }
            return baseLayer;
        }
    }

    // 没有颜色属性，使用默认样式
    switch (layerType) {
        case 'circle':
            baseLayer.paint = {
                'circle-radius': 6,
                'circle-color': getDefaultColor(0),
                'circle-opacity': 0.8
            };
            break;
        case 'line':
            baseLayer.paint = {
                'line-color': '#3b82f6',
                'line-width': 2,
                'line-opacity': 0.8
            };
            break;
        case 'fill':
            baseLayer.paint = {
                'fill-color': '#3b82f6',
                'fill-opacity': 0.3
            };
            break;
    }

    return baseLayer;
}

/**
 * 生成完整的 MapLibre 样式配置
 * @param {Object} geojson - GeoJSON 对象
 * @param {Object} options - 配置选项
 * @returns {Object} MapLibre 样式对象
 */
function generateStyle(geojson, options = {}) {
    const {
        name = 'GeoJSON Tiles',
        tilesPath = './tiles/{z}/{x}/{y}.pbf',
        sourceLayer = 'data',
        minZoom = 0,
        maxZoom = 14,
        center = [0, 0],
        zoom = 2,
        customLayers = []
    } = options;

    // 分析 GeoJSON
    const analysis = analyzeGeoJSON(geojson);

    // 生成基础样式结构
    const style = {
        version: 8,
        name: name,
        metadata: {
            'maplibre:composer': 'geoJsonToMvt',
            'geojson:featureCount': analysis.featureCount,
            'geojson:geometryTypes': analysis.geometryTypes
        },
        center: center,
        zoom: zoom,
        sources: {
            'vector-tiles': {
                type: 'vector',
                tiles: [tilesPath],
                minzoom: minZoom,
                maxzoom: maxZoom
            }
        },
        layers: []
    };

    // 添加背景层
    style.layers.push({
        id: 'background',
        type: 'background',
        paint: {
            'background-color': '#f8fafc'
        }
    });

    // 为每种几何类型生成图层
    analysis.geometryTypes.forEach((geometryType, index) => {
        const layerId = `${geometryType.toLowerCase()}-layer`;
        const layer = generateLayerConfig(
            geometryType,
            layerId,
            sourceLayer,
            analysis.properties
        );
        style.layers.push(layer);
    });

    // 添加自定义图层
    if (customLayers.length > 0) {
        style.layers.push(...customLayers);
    }

    return style;
}

/**
 * 主函数：读取 GeoJSON 并生成样式文件
 * @param {string} inputPath - GeoJSON 文件路径
 * @param {string} outputPath - 样式文件输出路径
 * @param {Object} options - 配置选项
 */
function generateStyleFile(inputPath, outputPath, options = {}) {
    try {
        // 读取 GeoJSON
        console.log(`📖 读取 GeoJSON: ${inputPath}`);
        const geojson = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

        // 生成样式
        console.log('🎨 生成样式配置...');
        const style = generateStyle(geojson, options);

        // 确保输出目录存在
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 写入样式文件
        fs.writeFileSync(outputPath, JSON.stringify(style, null, 2));
        console.log(`✅ 样式文件已生成: ${outputPath}`);

        // 输出统计信息
        console.log('\n📊 样式统计:');
        console.log(`   - 几何类型: ${style.metadata['geojson:geometryTypes'].join(', ')}`);
        console.log(`   - 要素数量: ${style.metadata['geojson:featureCount']}`);
        console.log(`   - 图层数量: ${style.layers.length}`);
        console.log(`   - 缩放级别: ${options.minZoom || 0} - ${options.maxZoom || 14}`);

        return style;
    } catch (error) {
        console.error('❌ 生成样式文件失败:', error.message);
        throw error;
    }
}

export { generateStyle, generateStyleFile, analyzeGeoJSON };
