# geoJsonToMvt

将 `input/airspaceData.json` 中的 Point `FeatureCollection` 转成 13-15 级 MVT 瓦片。

## 当前范围

- 只保留 MVT 生成能力
- 固定输入路径：`./input/airspaceData.json`
- 固定输出路径：`./output/tiles/{z}/{x}/{y}.pbf`
- 固定 `source-layer`：`data`
- 当前仅支持 `Point` 几何

## 安装

```bash
pnpm install
```

## 使用

```bash
npm run generate-tiles
```

或直接运行：

```bash
node index.js
```

## 输入格式约束

输入文件必须是 `FeatureCollection`，结构参考 `input/airspaceData.json`：

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [114.22215277777778, 22.6875, 38.5]
      },
      "properties": {
        "color": "#66bd63"
      }
    }
  ]
}
```

### 处理规则

- `geometry.type` 必须是 `Point`
- `coordinates` 至少包含经纬度两位
- `coordinates[2]` 如果存在，表示高度
- `properties` 视为业务字段并保留
- `properties` 中的 `string`、`number`、`boolean` 会原样保留
- `properties` 中的对象或数组会转成 JSON 字符串后写入 MVT

## 关于高度字段

MVT 几何本身只支持二维坐标。`geojson-vt` 在切片阶段会把三维坐标转换成二维瓦片坐标，因此 `coordinates[2]` 不能直接保留在最终瓦片几何里。

为了保留高度信息，生成器会在不修改原始输入文件的前提下，将 `coordinates[2]` 同步到 `properties.altitude`，并且：

- 不会覆盖业务中已有的 `properties.altitude`
- 原始输入中的 `coordinates[2]` 不会被改写

## 输出结构

```text
output/
└── tiles/
    ├── 13/
    ├── 14/
    └── 15/
```

## 预览

项目根目录提供了 `preview.html`，默认加载高德底图，并从 `http://localhost:7778/mvt/{z}/{x}/{y}.pbf` 读取 Point MVT：

1. 确保本地 MVT 服务提供 `http://localhost:7778/mvt/{z}/{x}/{y}.pbf`
2. 在项目根目录启动静态服务，例如 `python3 -m http.server 8080`
3. 访问 `http://localhost:8080/preview.html`

预览页会先读取 `SOURCE_ID` 中的 Point 要素，再在前端临时生成方格用于 `fill-extrusion`：

- PBF `properties` 只保留 `altitude` 和源业务字段
- 前端基于 Point `coordinates` 生成固定 `7*7` 米的方格
- `baseHeight = altitude - 3.5`
- `topHeight = altitude + 3.5`
- 挤出颜色直接读取 `color`

## 失败条件

以下情况会直接报错并终止：

- 输入不是 `FeatureCollection`
- `features` 不是数组
- 存在非法 `Feature`
- 存在非 `Point` 几何
- `coordinates` 缺少经纬度或经纬度不是数字

## 常见问题

### Q: 如何支持多种几何类型？

A: 当前版本不支持。本项目已精简为仅处理 Point `FeatureCollection` 的最小 MVT 生成器。

### Q: 如何自定义颜色？

A: 在 GeoJSON 的要素属性中添加 `color` 字段：

```json
{
  "type": "Feature",
  "properties": {
    "color": "#ff0000"
  },
  "geometry": {...}
}
```

### Q: 如何优化大文件性能？

A:
- 当前输出层级固定为 `13-15`
- 可以在输入侧先做数据裁剪或简化
- 可以按区域拆分输入文件后分别生成

## 技术栈

- **geojson-vt**: GeoJSON 切片库
- **vt-pbf**: MVT 编码库

## 许可证

ISC

## 相关资源

- [geojson-vt 文档](https://github.com/mapbox/geojson-vt)
- [Mapbox Vector Tile 规范](https://github.com/mapbox/vector-tile-spec)
