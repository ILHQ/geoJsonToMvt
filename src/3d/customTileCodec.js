const WIRE_TYPE_VARINT = 0;
const WIRE_TYPE_FIXED64 = 1;
const WIRE_TYPE_LENGTH_DELIMITED = 2;

const GEOMETRY_TYPE_IDS = {
    Point: 1,
    MultiPoint: 2,
    LineString: 3,
    MultiLineString: 4,
    Polygon: 5,
    MultiPolygon: 6
};

const GEOMETRY_TYPE_NAMES = Object.fromEntries(
    Object.entries(GEOMETRY_TYPE_IDS).map(([name, id]) => [id, name])
);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * 将输入转成 Uint8Array，兼容 Node Buffer / ArrayBuffer。
 */
function toUint8Array(value) {
    if (value instanceof Uint8Array) {
        return value;
    }

    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }

    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }

    throw new Error('输入不是可解码的二进制数据。');
}

/**
 * 极简 protobuf writer，仅覆盖当前项目需要的字段类型。
 */
class ProtoWriter {
    constructor() {
        this.chunks = [];
        this.length = 0;
    }

    pushBytes(bytes) {
        this.chunks.push(bytes);
        this.length += bytes.length;
    }

    writeTag(fieldNumber, wireType) {
        this.writeVarint((fieldNumber << 3) | wireType);
    }

    writeVarint(value) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`protobuf varint 必须是非负整数，收到：${value}`);
        }

        const bytes = [];
        let current = value;

        while (current > 127) {
            bytes.push((current & 0x7f) | 0x80);
            current = Math.floor(current / 128);
        }

        bytes.push(current);
        this.pushBytes(Uint8Array.from(bytes));
    }

    writeDoubleField(fieldNumber, value) {
        this.writeTag(fieldNumber, WIRE_TYPE_FIXED64);

        const buffer = new ArrayBuffer(8);
        new DataView(buffer).setFloat64(0, value, true);
        this.pushBytes(new Uint8Array(buffer));
    }

    writeStringField(fieldNumber, value) {
        const bytes = textEncoder.encode(value);
        this.writeBytesField(fieldNumber, bytes);
    }

    writeBytesField(fieldNumber, bytes) {
        this.writeTag(fieldNumber, WIRE_TYPE_LENGTH_DELIMITED);
        this.writeVarint(bytes.length);
        this.pushBytes(bytes);
    }

    writeMessageField(fieldNumber, encodeMessage) {
        const childWriter = new ProtoWriter();
        encodeMessage(childWriter);
        this.writeBytesField(fieldNumber, childWriter.finish());
    }

    finish() {
        const output = new Uint8Array(this.length);
        let offset = 0;

        this.chunks.forEach(chunk => {
            output.set(chunk, offset);
            offset += chunk.length;
        });

        return output;
    }
}

/**
 * 极简 protobuf reader，仅覆盖当前项目需要的字段类型。
 */
class ProtoReader {
    constructor(bytes) {
        this.bytes = toUint8Array(bytes);
        this.offset = 0;
    }

    isEnd() {
        return this.offset >= this.bytes.length;
    }

    readVarint() {
        let result = 0;
        let shift = 0;

        while (true) {
            if (this.offset >= this.bytes.length) {
                throw new Error('读取 protobuf varint 时遇到意外 EOF。');
            }

            const byte = this.bytes[this.offset];
            this.offset += 1;

            result += (byte & 0x7f) * (2 ** shift);
            if ((byte & 0x80) === 0) {
                return result;
            }

            shift += 7;
            if (shift > 49) {
                throw new Error('protobuf varint 超出当前实现支持范围。');
            }
        }
    }

    readDouble() {
        if (this.offset + 8 > this.bytes.length) {
            throw new Error('读取 protobuf double 时遇到意外 EOF。');
        }

        const value = new DataView(
            this.bytes.buffer,
            this.bytes.byteOffset + this.offset,
            8
        ).getFloat64(0, true);

        this.offset += 8;
        return value;
    }

    readBytes() {
        const length = this.readVarint();
        const end = this.offset + length;

        if (end > this.bytes.length) {
            throw new Error('读取 protobuf bytes 时遇到意外 EOF。');
        }

        const value = this.bytes.slice(this.offset, end);
        this.offset = end;
        return value;
    }

    readString() {
        return textDecoder.decode(this.readBytes());
    }

    readTag() {
        const tag = this.readVarint();
        return {
            fieldNumber: tag >> 3,
            wireType: tag & 0x07
        };
    }

    skip(wireType) {
        switch (wireType) {
        case WIRE_TYPE_VARINT:
            this.readVarint();
            return;
        case WIRE_TYPE_FIXED64:
            if (this.offset + 8 > this.bytes.length) {
                throw new Error('跳过 protobuf fixed64 时遇到意外 EOF。');
            }

            this.offset += 8;
            return;
        case WIRE_TYPE_LENGTH_DELIMITED: {
            const length = this.readVarint();
            if (this.offset + length > this.bytes.length) {
                throw new Error('跳过 protobuf bytes 时遇到意外 EOF。');
            }

            this.offset += length;
            return;
        }
        default:
            throw new Error(`不支持跳过的 protobuf wire type：${wireType}`);
        }
    }
}

/**
 * 编码单个坐标。
 */
function encodePosition(writer, position) {
    writer.writeDoubleField(1, position[0]);
    writer.writeDoubleField(2, position[1]);

    if (position.length === 3) {
        writer.writeDoubleField(3, position[2]);
    }
}

/**
 * 解码单个坐标。
 */
function decodePosition(bytes) {
    const reader = new ProtoReader(bytes);
    const position = [];
    let altitude;

    while (!reader.isEnd()) {
        const { fieldNumber, wireType } = reader.readTag();

        if (fieldNumber === 1 && wireType === WIRE_TYPE_FIXED64) {
            position[0] = reader.readDouble();
            continue;
        }

        if (fieldNumber === 2 && wireType === WIRE_TYPE_FIXED64) {
            position[1] = reader.readDouble();
            continue;
        }

        if (fieldNumber === 3 && wireType === WIRE_TYPE_FIXED64) {
            altitude = reader.readDouble();
            continue;
        }

        reader.skip(wireType);
    }

    if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) {
        throw new Error('解码 Position 失败：缺少合法经纬度。');
    }

    if (altitude === undefined) {
        return position;
    }

    return [position[0], position[1], altitude];
}

/**
 * 编码线串。
 */
function encodeLineString(writer, coordinates) {
    coordinates.forEach(position => {
        writer.writeMessageField(1, childWriter => {
            encodePosition(childWriter, position);
        });
    });
}

/**
 * 解码线串。
 */
function decodeLineString(bytes) {
    const reader = new ProtoReader(bytes);
    const coordinates = [];

    while (!reader.isEnd()) {
        const { fieldNumber, wireType } = reader.readTag();

        if (fieldNumber === 1 && wireType === WIRE_TYPE_LENGTH_DELIMITED) {
            coordinates.push(decodePosition(reader.readBytes()));
            continue;
        }

        reader.skip(wireType);
    }

    return coordinates;
}

/**
 * 编码单个环。
 */
function encodeRing(writer, coordinates) {
    coordinates.forEach(position => {
        writer.writeMessageField(1, childWriter => {
            encodePosition(childWriter, position);
        });
    });
}

/**
 * 解码单个环。
 */
function decodeRing(bytes) {
    const reader = new ProtoReader(bytes);
    const coordinates = [];

    while (!reader.isEnd()) {
        const { fieldNumber, wireType } = reader.readTag();

        if (fieldNumber === 1 && wireType === WIRE_TYPE_LENGTH_DELIMITED) {
            coordinates.push(decodePosition(reader.readBytes()));
            continue;
        }

        reader.skip(wireType);
    }

    return coordinates;
}

/**
 * 编码单个 Polygon。
 */
function encodePolygon(writer, coordinates) {
    coordinates.forEach(ring => {
        writer.writeMessageField(1, childWriter => {
            encodeRing(childWriter, ring);
        });
    });
}

/**
 * 解码单个 Polygon。
 */
function decodePolygon(bytes) {
    const reader = new ProtoReader(bytes);
    const coordinates = [];

    while (!reader.isEnd()) {
        const { fieldNumber, wireType } = reader.readTag();

        if (fieldNumber === 1 && wireType === WIRE_TYPE_LENGTH_DELIMITED) {
            coordinates.push(decodeRing(reader.readBytes()));
            continue;
        }

        reader.skip(wireType);
    }

    return coordinates;
}

/**
 * 编码 feature。
 */
function encodeFeature(writer, feature) {
    const geometryTypeId = GEOMETRY_TYPE_IDS[feature.geometry.type];

    if (!geometryTypeId) {
        throw new Error(`不支持编码的几何类型：${feature.geometry.type}`);
    }

    writer.writeTag(1, WIRE_TYPE_VARINT);
    writer.writeVarint(feature.id);
    writer.writeTag(2, WIRE_TYPE_VARINT);
    writer.writeVarint(geometryTypeId);
    writer.writeStringField(3, JSON.stringify(feature.properties || {}));

    switch (feature.geometry.type) {
    case 'Point':
        writer.writeMessageField(4, childWriter => {
            encodePosition(childWriter, feature.geometry.coordinates);
        });
        break;

    case 'MultiPoint':
        feature.geometry.coordinates.forEach(position => {
            writer.writeMessageField(4, childWriter => {
                encodePosition(childWriter, position);
            });
        });
        break;

    case 'LineString':
        writer.writeMessageField(5, childWriter => {
            encodeLineString(childWriter, feature.geometry.coordinates);
        });
        break;

    case 'MultiLineString':
        feature.geometry.coordinates.forEach(line => {
            writer.writeMessageField(5, childWriter => {
                encodeLineString(childWriter, line);
            });
        });
        break;

    case 'Polygon':
        writer.writeMessageField(6, childWriter => {
            encodePolygon(childWriter, feature.geometry.coordinates);
        });
        break;

    case 'MultiPolygon':
        feature.geometry.coordinates.forEach(polygon => {
            writer.writeMessageField(6, childWriter => {
                encodePolygon(childWriter, polygon);
            });
        });
        break;

    default:
        throw new Error(`不支持编码的几何类型：${feature.geometry.type}`);
    }
}

/**
 * 解码 feature。
 */
function decodeFeature(bytes) {
    const reader = new ProtoReader(bytes);
    const feature = {
        type: 'Feature',
        id: 0,
        properties: {},
        geometry: {
            type: 'Point',
            coordinates: []
        }
    };

    const positions = [];
    const lines = [];
    const polygons = [];
    let geometryTypeId = 0;
    let propertiesJson = '{}';

    while (!reader.isEnd()) {
        const { fieldNumber, wireType } = reader.readTag();

        if (fieldNumber === 1 && wireType === WIRE_TYPE_VARINT) {
            feature.id = reader.readVarint();
            continue;
        }

        if (fieldNumber === 2 && wireType === WIRE_TYPE_VARINT) {
            geometryTypeId = reader.readVarint();
            continue;
        }

        if (fieldNumber === 3 && wireType === WIRE_TYPE_LENGTH_DELIMITED) {
            propertiesJson = reader.readString();
            continue;
        }

        if (fieldNumber === 4 && wireType === WIRE_TYPE_LENGTH_DELIMITED) {
            positions.push(decodePosition(reader.readBytes()));
            continue;
        }

        if (fieldNumber === 5 && wireType === WIRE_TYPE_LENGTH_DELIMITED) {
            lines.push(decodeLineString(reader.readBytes()));
            continue;
        }

        if (fieldNumber === 6 && wireType === WIRE_TYPE_LENGTH_DELIMITED) {
            polygons.push(decodePolygon(reader.readBytes()));
            continue;
        }

        reader.skip(wireType);
    }

    try {
        feature.properties = JSON.parse(propertiesJson || '{}');
    } catch (error) {
        throw new Error(`解码 feature 失败：properties 不是合法 JSON：${error.message}`);
    }

    const geometryType = GEOMETRY_TYPE_NAMES[geometryTypeId];
    if (!geometryType) {
        throw new Error(`解码 feature 失败：未知 geometryType=${geometryTypeId}`);
    }

    switch (geometryType) {
    case 'Point':
        feature.geometry = {
            type: 'Point',
            coordinates: positions[0]
        };
        break;

    case 'MultiPoint':
        feature.geometry = {
            type: 'MultiPoint',
            coordinates: positions
        };
        break;

    case 'LineString':
        feature.geometry = {
            type: 'LineString',
            coordinates: lines[0] || []
        };
        break;

    case 'MultiLineString':
        feature.geometry = {
            type: 'MultiLineString',
            coordinates: lines
        };
        break;

    case 'Polygon':
        feature.geometry = {
            type: 'Polygon',
            coordinates: polygons[0] || []
        };
        break;

    case 'MultiPolygon':
        feature.geometry = {
            type: 'MultiPolygon',
            coordinates: polygons
        };
        break;

    default:
        throw new Error(`解码 feature 失败：未知几何类型 ${geometryType}`);
    }

    return feature;
}

/**
 * 将三维 tile 编码为自定义 protobuf 二进制。
 */
export function encodeTile(tile) {
    const writer = new ProtoWriter();

    writer.writeTag(1, WIRE_TYPE_VARINT);
    writer.writeVarint(tile.version);
    writer.writeTag(2, WIRE_TYPE_VARINT);
    writer.writeVarint(tile.z);
    writer.writeTag(3, WIRE_TYPE_VARINT);
    writer.writeVarint(tile.x);
    writer.writeTag(4, WIRE_TYPE_VARINT);
    writer.writeVarint(tile.y);

    tile.features.forEach(feature => {
        writer.writeMessageField(5, childWriter => {
            encodeFeature(childWriter, feature);
        });
    });

    return writer.finish();
}

/**
 * 将自定义 protobuf 二进制解码为 tile 对象。
 */
export function decodeTile(bufferLike) {
    const reader = new ProtoReader(bufferLike);
    const tile = {
        version: 1,
        z: 0,
        x: 0,
        y: 0,
        features: []
    };

    while (!reader.isEnd()) {
        const { fieldNumber, wireType } = reader.readTag();

        if (fieldNumber === 1 && wireType === WIRE_TYPE_VARINT) {
            tile.version = reader.readVarint();
            continue;
        }

        if (fieldNumber === 2 && wireType === WIRE_TYPE_VARINT) {
            tile.z = reader.readVarint();
            continue;
        }

        if (fieldNumber === 3 && wireType === WIRE_TYPE_VARINT) {
            tile.x = reader.readVarint();
            continue;
        }

        if (fieldNumber === 4 && wireType === WIRE_TYPE_VARINT) {
            tile.y = reader.readVarint();
            continue;
        }

        if (fieldNumber === 5 && wireType === WIRE_TYPE_LENGTH_DELIMITED) {
            tile.features.push(decodeFeature(reader.readBytes()));
            continue;
        }

        reader.skip(wireType);
    }

    return tile;
}

export {
    GEOMETRY_TYPE_IDS,
    GEOMETRY_TYPE_NAMES
};
