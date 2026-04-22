# geoJsonToMvt

将 `input/airspaceData.json` 中的 GeoJSON `FeatureCollection` 分别生成：

- 标准二维 MVT
- 自定义三维 PBF tile

## 当前结构

- 二维入口：`./index.2d.js`
- 三维入口：`./index.3d.js`
- 二维源码：`./src/2d`
- 三维源码：`./src/3d`
- 二维输出：`./output/2d/tiles/{z}/{x}/{y}.pbf`
- 三维输出：`./output/3d/tiles/{z}/{x}/{y}.pbf`

## 安装

```bash
pnpm install
```

## 使用

生成二维标准 MVT：

```bash
npm run generate-tiles:2d
```

或：

```bash
node index.2d.js
```

生成三维自定义 PBF：

```bash
npm run generate-tiles:3d
```

或：

```bash
node index.3d.js
```

兼容旧脚本：

```bash
npm run generate-tiles
```

默认仍指向三维入口。

## npm 包导出

当前包除了 CLI，还对外公开三维自定义 PBF codec API。

### 包根入口

```js
import {
  decodeTile,
  encodeTile,
  GEOMETRY_TYPE_IDS,
  GEOMETRY_TYPE_NAMES
} from 'geojsontomvt';
```

### 子路径入口

```js
import { decodeTile } from 'geojsontomvt/3d-codec';
```

### 使用示例

```js
import fs from 'node:fs';
import { decodeTile } from 'geojsontomvt';

const buffer = fs.readFileSync('./output/3d/tiles/15/26780/14259.pbf');
const tile = decodeTile(buffer);

console.log(tile.z, tile.x, tile.y, tile.features.length);
```

### 当前公开 API

- `decodeTile(bufferLike)`
- `encodeTile(tile)`
- `GEOMETRY_TYPE_IDS`
- `GEOMETRY_TYPE_NAMES`

以下内容仍视为内部实现，不承诺作为稳定公共 API：

- `ProtoReader`
- `ProtoWriter`
- 三维 tile builder / clipper
- 预览页逻辑
- 二维 MVT 生成逻辑

## 输入格式约束

输入文件固定为：

```text
./input/airspaceData.json
```

输入必须是 `FeatureCollection`，支持：

- `Point`
- `MultiPoint`
- `LineString`
- `MultiLineString`
- `Polygon`
- `MultiPolygon`

单个坐标允许：

- `[lng, lat]`
- `[lng, lat, alt]`

同一 `Feature` 内所有坐标维度必须一致。

## 二维链路

二维链路使用以下库：

- `geojson-vt@^4.0.2`
- `vt-pbf@^3.1.3`

### 二维处理规则

- 输出格式是标准二维 MVT
- `source-layer` 固定为 `data`
- 几何只保留前两维 `[lng, lat]`
- 如果输入里包含第三维，会在二维链路中被忽略
- 不会新增 `properties.altitude`
- `properties` 只保留源业务字段
- `properties` 中的对象、数组、`null` 会转成 JSON 字符串，以适配 MVT 标量属性约束

### 二维输出目录

```text
output/
└── 2d/
    └── tiles/
        ├── 15/
        ├── 16/
        └── 17/
```

## 三维链路

三维链路保留当前自定义 PBF 方案。

### 三维处理规则

- 输出格式是自定义 protobuf tile，不是标准 MVT
- 保留第三维坐标 `[lng, lat, alt]`
- 保留原始 `properties`
- 支持线面裁剪与三维坐标插值
- 生成 `manifest.json`

### 三维输出目录

```text
output/
└── 3d/
    └── tiles/
        ├── 15/
        ├── 16/
        ├── 17/
        └── manifest.json
```

## 预览

项目根目录提供了 `preview.html`，当前只服务二维场景。

预览页直接使用 MapLibre 的标准 `vector source` 加载：

```text
http://localhost:7778/mvt/2d/{z}/{x}/{y}.pbf
```

### 使用方式

1. 先运行二维生成脚本
2. 确保本地 tile 服务提供 `http://localhost:7778/mvt/2d/{z}/{x}/{y}.pbf`
3. 在项目根目录启动静态服务，例如：

```bash
python3 -m http.server 8080
```

4. 打开：

```text
http://localhost:8080/preview.html
```

### 预览说明

- 预览页只展示二维点渲染
- 不再处理第三维
- 不再生成 `7 × 7 × 7` 米立方体
- 不再使用三维自定义协议或 worker 解码链路

如果 `preview.html` 由 `http://localhost:8080` 提供，而 tile 服务在 `http://localhost:7778`，则 7778 服务需要返回允许 `http://localhost:8080` 的 CORS 响应头。

## 失败条件

以下情况会直接报错并终止：

- 输入不是 `FeatureCollection`
- `features` 不是数组
- 存在非法 `Feature`
- 存在不支持的几何类型
- 坐标不是 `[lng, lat]` 或 `[lng, lat, alt]`
- 同一要素内坐标维度不一致
- 经度、纬度或高度不是数字
- `properties` 不是对象或 `null`

## 技术栈

- 二维：`geojson-vt`、`vt-pbf`
- 三维：自定义 protobuf 编解码、自定义裁剪
- 预览：MapLibre

## 许可证

ISC
