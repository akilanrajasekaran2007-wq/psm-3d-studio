/**
 * glb-builder.ts
 * Generates standards-compliant Khronos glTF 2.0 Binary (.glb) files
 * with real vertex buffers, normal buffers, element indices, and PBR materials.
 */

export interface MaterialDef {
  name?: string;
  baseColor: [number, number, number, number]; // RGBA [0-1]
  metallic: number; // 0-1
  roughness: number; // 0-1
  emissive?: [number, number, number];
  doubleSided?: boolean;
}

export interface GeometryPart {
  type: 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'capsule' | 'wedge';
  position: [number, number, number];
  rotation?: [number, number, number]; // Euler angles in radians or degrees
  scale?: [number, number, number];
  params?: {
    radius?: number;
    radiusTop?: number;
    radiusBottom?: number;
    height?: number;
    radialSegments?: number;
    tubularSegments?: number;
    tube?: number;
    width?: number;
    depth?: number;
  };
  material: MaterialDef;
  name?: string;
}

interface RawMesh {
  positions: number[];
  normals: number[];
  indices: number[];
  material: MaterialDef;
  name: string;
}

export class GlbBuilder {
  private parts: GeometryPart[] = [];

  public addPart(part: GeometryPart): this {
    this.parts.push(part);
    return this;
  }

  public addParts(parts: GeometryPart[]): this {
    this.parts.push(...parts);
    return this;
  }

  /**
   * Builds the binary GLB buffer from accumulated parts.
   */
  public build(): Buffer {
    const rawMeshes: RawMesh[] = [];

    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      const raw = this.generatePrimitiveMesh(part, i);
      rawMeshes.push(raw);
    }

    if (rawMeshes.length === 0) {
      // Create at least a base geometric pedestal so file is never empty
      const defaultPart: GeometryPart = {
        type: 'box',
        position: [0, 0.5, 0],
        scale: [1, 1, 1],
        material: {
          baseColor: [0.3, 0.6, 1.0, 1.0],
          metallic: 0.2,
          roughness: 0.5,
        },
        name: 'DefaultPart',
      };
      rawMeshes.push(this.generatePrimitiveMesh(defaultPart, 0));
    }

    return this.serializeToGlb(rawMeshes);
  }

  private generatePrimitiveMesh(part: GeometryPart, index: number): RawMesh {
    const name = part.name || `part_${index}_${part.type}`;
    let p = { positions: [] as number[], normals: [] as number[], indices: [] as number[] };

    const params = part.params || {};

    switch (part.type) {
      case 'sphere':
        p = this.createSphere(params.radius || 0.5, params.radialSegments || 16);
        break;
      case 'cylinder':
        p = this.createCylinder(
          params.radiusTop ?? params.radius ?? 0.4,
          params.radiusBottom ?? params.radius ?? 0.4,
          params.height ?? 1.0,
          params.radialSegments || 16
        );
        break;
      case 'cone':
        p = this.createCylinder(0.001, params.radius ?? 0.5, params.height ?? 1.0, params.radialSegments || 16);
        break;
      case 'capsule':
        p = this.createCapsule(params.radius || 0.35, params.height || 0.8, params.radialSegments || 14);
        break;
      case 'torus':
        p = this.createTorus(params.radius || 0.5, params.tube || 0.15, params.radialSegments || 12, params.tubularSegments || 24);
        break;
      case 'wedge':
        p = this.createWedge(part.scale?.[0] || 1, part.scale?.[1] || 1, part.scale?.[2] || 1);
        break;
      case 'box':
      default:
        p = this.createBox(params.width || 1, params.height || 1, params.depth || 1);
        break;
    }

    // Apply scale, rotation, translation
    const pos = part.position || [0, 0, 0];
    const rot = part.rotation || [0, 0, 0];
    const scale = part.scale || [1, 1, 1];

    // Convert degrees to radians if values exceed 2*PI significantly
    const rx = Math.abs(rot[0]) > 6.3 ? (rot[0] * Math.PI) / 180 : rot[0];
    const ry = Math.abs(rot[1]) > 6.3 ? (rot[1] * Math.PI) / 180 : rot[1];
    const rz = Math.abs(rot[2]) > 6.3 ? (rot[2] * Math.PI) / 180 : rot[2];

    const cosX = Math.cos(rx), sinX = Math.sin(rx);
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    const cosZ = Math.cos(rz), sinZ = Math.sin(rz);

    const transformedPositions: number[] = [];
    const transformedNormals: number[] = [];

    for (let i = 0; i < p.positions.length; i += 3) {
      let x = p.positions[i] * scale[0];
      let y = p.positions[i + 1] * scale[1];
      let z = p.positions[i + 2] * scale[2];

      // Euler XYZ rotation
      // X
      let y1 = y * cosX - z * sinX;
      let z1 = y * sinX + z * cosX;
      let x1 = x;
      // Y
      let x2 = x1 * cosY + z1 * sinY;
      let z2 = -x1 * sinY + z1 * cosY;
      let y2 = y1;
      // Z
      let x3 = x2 * cosZ - y2 * sinZ;
      let y3 = x2 * sinZ + y2 * cosZ;
      let z3 = z2;

      transformedPositions.push(x3 + pos[0], y3 + pos[1], z3 + pos[2]);

      // Normal rotation (no translation or non-uniform scaling artifacts)
      let nx = p.normals[i];
      let ny = p.normals[i + 1];
      let nz = p.normals[i + 2];

      let ny1 = ny * cosX - nz * sinX;
      let nz1 = ny * sinX + nz * cosX;
      let nx1 = nx;
      let nx2 = nx1 * cosY + nz1 * sinY;
      let nz2 = -nx1 * sinY + nz1 * cosY;
      let ny2 = ny1;
      let nx3 = nx2 * cosZ - ny2 * sinZ;
      let ny3 = nx2 * sinZ + ny2 * cosZ;
      let nz3 = nz2;

      transformedNormals.push(nx3, ny3, nz3);
    }

    return {
      positions: transformedPositions,
      normals: transformedNormals,
      indices: p.indices,
      material: part.material,
      name,
    };
  }

  private createBox(width = 1, height = 1, depth = 1) {
    const w = width / 2, h = height / 2, d = depth / 2;
    // 6 faces, 4 vertices each, 2 triangles each (24 vertices total for crisp normals)
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    const faces = [
      // Front (+Z)
      { normal: [0, 0, 1], corners: [[-w, -h, d], [w, -h, d], [w, h, d], [-w, h, d]] },
      // Back (-Z)
      { normal: [0, 0, -1], corners: [[w, -h, -d], [-w, -h, -d], [-w, h, -d], [w, h, -d]] },
      // Top (+Y)
      { normal: [0, 1, 0], corners: [[-w, h, d], [w, h, d], [w, h, -d], [-w, h, -d]] },
      // Bottom (-Y)
      { normal: [0, -1, 0], corners: [[-w, -h, -d], [w, -h, -d], [w, -h, d], [-w, -h, d]] },
      // Right (+X)
      { normal: [1, 0, 0], corners: [[w, -h, d], [w, -h, -d], [w, h, -d], [w, h, d]] },
      // Left (-X)
      { normal: [-1, 0, 0], corners: [[-w, -h, -d], [-w, -h, d], [-w, h, d], [-w, h, -d]] },
    ];

    let vertOffset = 0;
    for (const f of faces) {
      for (const c of f.corners) {
        positions.push(c[0], c[1], c[2]);
        normals.push(f.normal[0], f.normal[1], f.normal[2]);
      }
      indices.push(vertOffset, vertOffset + 1, vertOffset + 2);
      indices.push(vertOffset, vertOffset + 2, vertOffset + 3);
      vertOffset += 4;
    }

    return { positions, normals, indices };
  }

  private createSphere(radius = 0.5, segments = 16) {
    const rings = segments;
    const sectors = segments * 2;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    const R = 1 / rings;
    const S = 1 / sectors;

    for (let r = 0; r <= rings; ++r) {
      const v = r * R;
      const phi = v * Math.PI;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      for (let s = 0; s <= sectors; ++s) {
        const u = s * S;
        const theta = u * (Math.PI * 2);
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const x = cosTheta * sinPhi;
        const y = cosPhi;
        const z = sinTheta * sinPhi;

        positions.push(x * radius, y * radius, z * radius);
        normals.push(x, y, z);
      }
    }

    for (let r = 0; r < rings; ++r) {
      for (let s = 0; s < sectors; ++s) {
        const first = r * (sectors + 1) + s;
        const second = first + sectors + 1;

        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }

    return { positions, normals, indices };
  }

  private createCylinder(radiusTop = 0.5, radiusBottom = 0.5, height = 1.0, radialSegments = 16) {
    const halfHeight = height / 2;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    const slope = (radiusBottom - radiusTop) / height;

    // Body vertices
    for (let yStep = 0; yStep <= 1; yStep++) {
      const v = yStep;
      const y = v === 0 ? halfHeight : -halfHeight;
      const radius = v === 0 ? radiusTop : radiusBottom;

      for (let i = 0; i <= radialSegments; i++) {
        const u = i / radialSegments;
        const theta = u * Math.PI * 2;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        positions.push(radius * sinTheta, y, radius * cosTheta);

        const nx = sinTheta;
        const ny = slope;
        const nz = cosTheta;
        const len = Math.hypot(nx, ny, nz) || 1;
        normals.push(nx / len, ny / len, nz / len);
      }
    }

    // Body indices
    for (let i = 0; i < radialSegments; i++) {
      const a = i;
      const b = i + radialSegments + 1;
      const c = i + 1;
      const d = i + radialSegments + 2;

      indices.push(a, b, c);
      indices.push(c, b, d);
    }

    // Top cap
    if (radiusTop > 0.001) {
      const centerIndex = positions.length / 3;
      positions.push(0, halfHeight, 0);
      normals.push(0, 1, 0);

      const startIndex = centerIndex + 1;
      for (let i = 0; i <= radialSegments; i++) {
        const theta = (i / radialSegments) * Math.PI * 2;
        positions.push(radiusTop * Math.sin(theta), halfHeight, radiusTop * Math.cos(theta));
        normals.push(0, 1, 0);
      }
      for (let i = 0; i < radialSegments; i++) {
        indices.push(centerIndex, startIndex + i, startIndex + i + 1);
      }
    }

    // Bottom cap
    if (radiusBottom > 0.001) {
      const centerIndex = positions.length / 3;
      positions.push(0, -halfHeight, 0);
      normals.push(0, -1, 0);

      const startIndex = centerIndex + 1;
      for (let i = 0; i <= radialSegments; i++) {
        const theta = (i / radialSegments) * Math.PI * 2;
        positions.push(radiusBottom * Math.sin(theta), -halfHeight, radiusBottom * Math.cos(theta));
        normals.push(0, -1, 0);
      }
      for (let i = 0; i < radialSegments; i++) {
        indices.push(centerIndex, startIndex + i + 1, startIndex + i);
      }
    }

    return { positions, normals, indices };
  }

  private createCapsule(radius = 0.35, length = 0.8, segments = 12) {
    // Hemispheres on top and bottom connected by cylinder
    const halfLen = length / 2;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    const rings = segments;
    const sectors = segments * 2;

    for (let r = 0; r <= rings; ++r) {
      const v = r / rings;
      const phi = v * Math.PI;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      const yOffset = cosPhi >= 0 ? halfLen : -halfLen;

      for (let s = 0; s <= sectors; ++s) {
        const u = s / sectors;
        const theta = u * (Math.PI * 2);
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const nx = cosTheta * sinPhi;
        const ny = cosPhi;
        const nz = sinTheta * sinPhi;

        positions.push(nx * radius, ny * radius + yOffset, nz * radius);
        normals.push(nx, ny, nz);
      }
    }

    for (let r = 0; r < rings; ++r) {
      for (let s = 0; s < sectors; ++s) {
        const first = r * (sectors + 1) + s;
        const second = first + sectors + 1;

        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }

    return { positions, normals, indices };
  }

  private createTorus(radius = 0.5, tube = 0.15, radialSegments = 12, tubularSegments = 24) {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    for (let j = 0; j <= radialSegments; j++) {
      for (let i = 0; i <= tubularSegments; i++) {
        const u = (i / tubularSegments) * Math.PI * 2;
        const v = (j / radialSegments) * Math.PI * 2;

        const x = (radius + tube * Math.cos(v)) * Math.cos(u);
        const y = (radius + tube * Math.cos(v)) * Math.sin(u);
        const z = tube * Math.sin(v);

        positions.push(x, z, y); // oriented horizontally

        const nx = Math.cos(v) * Math.cos(u);
        const ny = Math.cos(v) * Math.sin(u);
        const nz = Math.sin(v);
        normals.push(nx, nz, ny);
      }
    }

    for (let j = 1; j <= radialSegments; j++) {
      for (let i = 1; i <= tubularSegments; i++) {
        const a = (tubularSegments + 1) * j + i - 1;
        const b = (tubularSegments + 1) * (j - 1) + i - 1;
        const c = (tubularSegments + 1) * (j - 1) + i;
        const d = (tubularSegments + 1) * j + i;

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    return { positions, normals, indices };
  }

  private createWedge(w = 1, h = 1, d = 1) {
    // 5-sided triangular prism
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const positions = [
      // Bottom face
      -hw, -hh, -hd,   hw, -hh, -hd,   hw, -hh, hd,
      -hw, -hh, -hd,   hw, -hh, hd,   -hw, -hh, hd,
      // Slanted face
      -hw, -hh, hd,    hw, -hh, hd,    hw, hh, -hd,
      -hw, -hh, hd,    hw, hh, -hd,   -hw, hh, -hd,
      // Back face
      hw, -hh, -hd,   -hw, -hh, -hd,  -hw, hh, -hd,
      hw, -hh, -hd,   -hw, hh, -hd,   hw, hh, -hd,
      // Left triangle
      -hw, -hh, -hd,  -hw, -hh, hd,   -hw, hh, -hd,
      // Right triangle
      hw, -hh, hd,    hw, -hh, -hd,   hw, hh, -hd,
    ];

    const normals: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < positions.length; i += 9) {
      // Compute face normal
      const ax = positions[i], ay = positions[i+1], az = positions[i+2];
      const bx = positions[i+3], by = positions[i+4], bz = positions[i+5];
      const cx = positions[i+6], cy = positions[i+7], cz = positions[i+8];

      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;

      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;

      for (let j = 0; j < 3; j++) {
        normals.push(nx / len, ny / len, nz / len);
      }
    }

    for (let i = 0; i < positions.length / 3; i++) {
      indices.push(i);
    }

    return { positions, normals, indices };
  }

  /**
   * Serializes the meshes into a GLB binary buffer according to GLTF 2.0 specification.
   */
  private serializeToGlb(meshes: RawMesh[]): Buffer {
    // 1. Gather all binary data: positions (Float32), normals (Float32), indices (Uint32)
    const bufferChunks: Buffer[] = [];
    const bufferViews: any[] = [];
    const accessors: any[] = [];
    const gltfMaterials: any[] = [];
    const gltfMeshes: any[] = [];
    const gltfNodes: any[] = [];
    const sceneNodes: number[] = [];

    let currentOffset = 0;

    for (let m = 0; m < meshes.length; m++) {
      const mesh = meshes[m];

      // Material
      const mat = mesh.material;
      const matIndex = gltfMaterials.length;
      gltfMaterials.push({
        name: mat.name || `Material_${m}`,
        pbrMetallicRoughness: {
          baseColorFactor: mat.baseColor || [0.8, 0.8, 0.8, 1.0],
          metallicFactor: mat.metallic ?? 0.1,
          roughnessFactor: mat.roughness ?? 0.6,
        },
        emissiveFactor: mat.emissive || [0, 0, 0],
        doubleSided: mat.doubleSided ?? false,
      });

      // Positions Buffer
      const posFloat = new Float32Array(mesh.positions);
      const posBuf = Buffer.from(posFloat.buffer);
      // Compute min and max bounds
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = mesh.positions[i], y = mesh.positions[i + 1], z = mesh.positions[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }

      // Pad to 4 bytes
      const posPadding = (4 - (posBuf.length % 4)) % 4;
      const posPadded = Buffer.concat([posBuf, Buffer.alloc(posPadding)]);

      const posBufferViewIndex = bufferViews.length;
      bufferViews.push({
        buffer: 0,
        byteOffset: currentOffset,
        byteLength: posBuf.length,
        target: 34962, // ARRAY_BUFFER
      });
      currentOffset += posPadded.length;
      bufferChunks.push(posPadded);

      const posAccessorIndex = accessors.length;
      accessors.push({
        bufferView: posBufferViewIndex,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: mesh.positions.length / 3,
        type: 'VEC3',
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      });

      // Normals Buffer
      const normFloat = new Float32Array(mesh.normals);
      const normBuf = Buffer.from(normFloat.buffer);
      const normPadding = (4 - (normBuf.length % 4)) % 4;
      const normPadded = Buffer.concat([normBuf, Buffer.alloc(normPadding)]);

      const normBufferViewIndex = bufferViews.length;
      bufferViews.push({
        buffer: 0,
        byteOffset: currentOffset,
        byteLength: normBuf.length,
        target: 34962, // ARRAY_BUFFER
      });
      currentOffset += normPadded.length;
      bufferChunks.push(normPadded);

      const normAccessorIndex = accessors.length;
      accessors.push({
        bufferView: normBufferViewIndex,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: mesh.normals.length / 3,
        type: 'VEC3',
      });

      // Indices Buffer (Uint32Array)
      const indUint = new Uint32Array(mesh.indices);
      const indBuf = Buffer.from(indUint.buffer);
      const indPadding = (4 - (indBuf.length % 4)) % 4;
      const indPadded = Buffer.concat([indBuf, Buffer.alloc(indPadding)]);

      const indBufferViewIndex = bufferViews.length;
      bufferViews.push({
        buffer: 0,
        byteOffset: currentOffset,
        byteLength: indBuf.length,
        target: 34963, // ELEMENT_ARRAY_BUFFER
      });
      currentOffset += indPadded.length;
      bufferChunks.push(indPadded);

      const indAccessorIndex = accessors.length;
      accessors.push({
        bufferView: indBufferViewIndex,
        byteOffset: 0,
        componentType: 5125, // UNSIGNED_INT
        count: mesh.indices.length,
        type: 'SCALAR',
      });

      // Mesh
      const meshIndex = gltfMeshes.length;
      gltfMeshes.push({
        name: mesh.name,
        primitives: [
          {
            attributes: {
              POSITION: posAccessorIndex,
              NORMAL: normAccessorIndex,
            },
            indices: indAccessorIndex,
            material: matIndex,
            mode: 4, // TRIANGLES
          },
        ],
      });

      // Node
      const nodeIndex = gltfNodes.length;
      gltfNodes.push({
        name: mesh.name,
        mesh: meshIndex,
      });
      sceneNodes.push(nodeIndex);
    }

    const totalBinBuffer = Buffer.concat(bufferChunks);

    const gltfJson = {
      asset: {
        version: '2.0',
        generator: 'Meshy3D-Studio-GlbBuilder',
      },
      scenes: [
        {
          nodes: sceneNodes,
        },
      ],
      scene: 0,
      nodes: gltfNodes,
      meshes: gltfMeshes,
      materials: gltfMaterials,
      accessors: accessors,
      bufferViews: bufferViews,
      buffers: [
        {
          byteLength: totalBinBuffer.length,
        },
      ],
    };

    const jsonString = JSON.stringify(gltfJson);
    let jsonBuffer = Buffer.from(jsonString, 'utf-8');
    // Align JSON chunk to 4-byte boundary with trailing spaces (0x20)
    const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
    if (jsonPadding > 0) {
      jsonBuffer = Buffer.concat([jsonBuffer, Buffer.from(' '.repeat(jsonPadding), 'utf-8')]);
    }

    // Align BIN chunk to 4-byte boundary with 0x00
    let binBuffer = totalBinBuffer;
    const binPadding = (4 - (binBuffer.length % 4)) % 4;
    if (binPadding > 0) {
      binBuffer = Buffer.concat([binBuffer, Buffer.alloc(binPadding)]);
    }

    const jsonChunkHeader = Buffer.alloc(8);
    jsonChunkHeader.writeUInt32LE(jsonBuffer.length, 0);
    jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

    const binChunkHeader = Buffer.alloc(8);
    binChunkHeader.writeUInt32LE(binBuffer.length, 0);
    binChunkHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"

    const totalLength = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;

    const glbHeader = Buffer.alloc(12);
    glbHeader.writeUInt32LE(0x46546c67, 0); // "glTF"
    glbHeader.writeUInt32LE(2, 4); // version 2
    glbHeader.writeUInt32LE(totalLength, 8); // total byte length

    return Buffer.concat([glbHeader, jsonChunkHeader, jsonBuffer, binChunkHeader, binBuffer]);
  }
}
