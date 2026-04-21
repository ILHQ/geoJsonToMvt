import fs from 'fs';

/**
 * 判断值是否为有限数字。
 */
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 将属性值归一化为可安全写入 MVT 的标量值。
 */
function normalizePropertyValue(value) {
    if (value === undefined) {
        return undefined;
    }

    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return value;
    }

    return JSON.stringify(value);
}

/**
 * 读取并解析输入文件，同时校验其是否满足项目约束。
 */
export function readFeatureCollection(inputPath) {
    const rawContent = fs.readFileSync(inputPath, 'utf8');
    const parsed = JSON.parse(rawContent);

    validateFeatureCollection(parsed);
    return parsed;
}

/**
 * 校验输入是否为当前项目支持的 Point FeatureCollection。
 */
export function validateFeatureCollection(featureCollection) {
    if (featureCollection?.type !== 'FeatureCollection') {
        throw new Error('输入文件必须是 FeatureCollection。');
    }

    if (!Array.isArray(featureCollection.features)) {
        throw new Error('FeatureCollection.features 必须是数组。');
    }

    featureCollection.features.forEach((feature, index) => {
        if (feature?.type !== 'Feature') {
            throw new Error(`第 ${index + 1} 个要素不是合法的 Feature。`);
        }

        if (feature?.geometry?.type !== 'Point') {
            throw new Error(`第 ${index + 1} 个要素不是 Point 几何。当前精简版仅支持 Point FeatureCollection。`);
        }

        const coordinates = feature.geometry.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
            throw new Error(`第 ${index + 1} 个要素的 coordinates 不合法。`);
        }

        if (!isFiniteNumber(coordinates[0]) || !isFiniteNumber(coordinates[1])) {
            throw new Error(`第 ${index + 1} 个要素的经纬度必须是数字。`);
        }
    });
}

/**
 * 归一化要素属性，并在需要时将第三维高度镜像到 altitude 字段。
 */
export function normalizeFeatureCollection(featureCollection) {
    return {
        ...featureCollection,
        features: featureCollection.features.map(feature => {
            const properties = {};

            Object.entries(feature.properties || {}).forEach(([key, value]) => {
                const normalizedValue = normalizePropertyValue(value);
                if (normalizedValue !== undefined) {
                    properties[key] = normalizedValue;
                }
            });

            const altitude = feature.geometry.coordinates[2];
            if (altitude !== undefined && properties.altitude === undefined) {
                // MVT 几何仅支持二维坐标，第三维需要镜像到属性里才能保留。
                properties.altitude = altitude;
            }

            return {
                ...feature,
                properties
            };
        })
    };
}

/**
 * 统计原始输入中包含第三维坐标的要素数量。
 */
export function countFeaturesWithThirdCoordinate(featureCollection) {
    return featureCollection.features.filter(feature => {
        const coordinates = feature?.geometry?.coordinates;
        return Array.isArray(coordinates) && coordinates.length > 2;
    }).length;
}
