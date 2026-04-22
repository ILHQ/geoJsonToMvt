import fs from 'fs';

const SUPPORTED_GEOMETRY_TYPES = new Set([
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon'
]);

/**
 * 判断值是否为有限数字。
 */
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 深拷贝可 JSON 序列化的属性对象，避免后续处理误改输入对象。
 */
function cloneJsonValue(value, context) {
    try {
        const serialized = JSON.stringify(value);
        return serialized === undefined ? undefined : JSON.parse(serialized);
    } catch (error) {
        throw new Error(`${context} 不是合法的 JSON 可序列化数据：${error.message}`);
    }
}

/**
 * 归一化属性对象。
 */
function normalizeProperties(properties, featureIndex) {
    if (properties === null || properties === undefined) {
        return {};
    }

    if (typeof properties !== 'object' || Array.isArray(properties)) {
        throw new Error(`第 ${featureIndex + 1} 个要素的 properties 必须是对象或 null。`);
    }

    return cloneJsonValue(properties, `第 ${featureIndex + 1} 个要素的 properties`) || {};
}

/**
 * 复制单个坐标，保证后续几何裁剪不会改写原始输入。
 */
function clonePosition(position) {
    return position.slice(0, position.length);
}

/**
 * 判断两个坐标是否完全一致。
 */
function positionsEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }

    return left.every((value, index) => value === right[index]);
}

/**
 * 归一化单个坐标，并校验同一要素中的维度是否一致。
 */
function normalizePosition(position, context, state) {
    if (!Array.isArray(position)) {
        throw new Error(`${context} 必须是坐标数组。`);
    }

    if (position.length !== 2 && position.length !== 3) {
        throw new Error(`${context} 必须是 [lng, lat] 或 [lng, lat, alt]。`);
    }

    if (!isFiniteNumber(position[0]) || !isFiniteNumber(position[1])) {
        throw new Error(`${context} 的经纬度必须是数字。`);
    }

    if (position.length === 3 && !isFiniteNumber(position[2])) {
        throw new Error(`${context} 的第三维高度必须是数字。`);
    }

    if (state.dimension === null) {
        state.dimension = position.length;
    } else if (state.dimension !== position.length) {
        throw new Error(`${context} 的维度与同一要素中的其他坐标不一致。`);
    }

    return clonePosition(position);
}

/**
 * 归一化坐标列表。
 */
function normalizePositionList(positions, context, state) {
    if (!Array.isArray(positions) || positions.length === 0) {
        throw new Error(`${context} 不能为空。`);
    }

    return positions.map((position, index) => {
        return normalizePosition(position, `${context}[${index}]`, state);
    });
}

/**
 * 确保环首尾闭合。
 */
function ensureClosedRing(ring) {
    if (ring.length === 0) {
        return ring;
    }

    const closedRing = ring.map(clonePosition);
    const first = closedRing[0];
    const last = closedRing[closedRing.length - 1];

    if (!positionsEqual(first, last)) {
        closedRing.push(clonePosition(first));
    }

    return closedRing;
}

/**
 * 归一化 Polygon / MultiPolygon 中的环。
 */
function normalizeRing(ring, context, state) {
    const normalizedRing = ensureClosedRing(normalizePositionList(ring, context, state));

    if (normalizedRing.length < 4) {
        throw new Error(`${context} 至少需要 4 个坐标点（包含闭合点）。`);
    }

    return normalizedRing;
}

/**
 * 归一化几何对象。
 */
function normalizeGeometry(geometry, featureIndex) {
    if (!geometry || typeof geometry !== 'object') {
        throw new Error(`第 ${featureIndex + 1} 个要素缺少合法 geometry。`);
    }

    if (!SUPPORTED_GEOMETRY_TYPES.has(geometry.type)) {
        throw new Error(`第 ${featureIndex + 1} 个要素的 geometry.type 不受支持：${geometry.type}`);
    }

    const state = {
        dimension: null
    };

    switch (geometry.type) {
    case 'Point':
        return {
            type: geometry.type,
            coordinates: normalizePosition(
                geometry.coordinates,
                `第 ${featureIndex + 1} 个要素的 Point.coordinates`,
                state
            )
        };

    case 'MultiPoint':
    case 'LineString':
        return {
            type: geometry.type,
            coordinates: normalizePositionList(
                geometry.coordinates,
                `第 ${featureIndex + 1} 个要素的 ${geometry.type}.coordinates`,
                state
            )
        };

    case 'MultiLineString':
        if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
            throw new Error(`第 ${featureIndex + 1} 个要素的 MultiLineString.coordinates 不能为空。`);
        }

        return {
            type: geometry.type,
            coordinates: geometry.coordinates.map((line, index) => {
                return normalizePositionList(
                    line,
                    `第 ${featureIndex + 1} 个要素的 MultiLineString.coordinates[${index}]`,
                    state
                );
            })
        };

    case 'Polygon':
        if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
            throw new Error(`第 ${featureIndex + 1} 个要素的 Polygon.coordinates 不能为空。`);
        }

        return {
            type: geometry.type,
            coordinates: geometry.coordinates.map((ring, index) => {
                return normalizeRing(
                    ring,
                    `第 ${featureIndex + 1} 个要素的 Polygon.coordinates[${index}]`,
                    state
                );
            })
        };

    case 'MultiPolygon':
        if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
            throw new Error(`第 ${featureIndex + 1} 个要素的 MultiPolygon.coordinates 不能为空。`);
        }

        return {
            type: geometry.type,
            coordinates: geometry.coordinates.map((polygon, polygonIndex) => {
                if (!Array.isArray(polygon) || polygon.length === 0) {
                    throw new Error(`第 ${featureIndex + 1} 个要素的 MultiPolygon.coordinates[${polygonIndex}] 不能为空。`);
                }

                return polygon.map((ring, ringIndex) => {
                    return normalizeRing(
                        ring,
                        `第 ${featureIndex + 1} 个要素的 MultiPolygon.coordinates[${polygonIndex}][${ringIndex}]`,
                        state
                    );
                });
            })
        };

    default:
        throw new Error(`第 ${featureIndex + 1} 个要素的 geometry.type 不受支持。`);
    }
}

/**
 * 递归判断几何中是否存在第三维坐标。
 */
function coordinatesContainThirdDimension(coordinates) {
    if (!Array.isArray(coordinates)) {
        return false;
    }

    if (
        coordinates.length >= 3 &&
        typeof coordinates[0] === 'number' &&
        typeof coordinates[1] === 'number'
    ) {
        return coordinates.length === 3;
    }

    return coordinates.some(child => coordinatesContainThirdDimension(child));
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
 * 校验输入是否为当前项目支持的 FeatureCollection。
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

        normalizeGeometry(feature.geometry, index);
        normalizeProperties(feature.properties, index);
    });
}

/**
 * 归一化 FeatureCollection，确保输出几何和属性结构稳定。
 */
export function normalizeFeatureCollection(featureCollection) {
    return {
        type: 'FeatureCollection',
        features: featureCollection.features.map((feature, index) => {
            return {
                type: 'Feature',
                id: feature.id,
                properties: normalizeProperties(feature.properties, index),
                geometry: normalizeGeometry(feature.geometry, index)
            };
        })
    };
}

/**
 * 统计原始输入中包含第三维坐标的要素数量。
 */
export function countFeaturesWithThirdCoordinate(featureCollection) {
    return featureCollection.features.filter(feature => {
        return coordinatesContainThirdDimension(feature?.geometry?.coordinates);
    }).length;
}
