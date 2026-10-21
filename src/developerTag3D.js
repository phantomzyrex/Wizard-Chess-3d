import * as THREE_NS from 'three';

/** @type {any} */
const THREE = THREE_NS;

// ============================================================================
// 3D Vector Font Builder for True Extruded Beveled 3D Lettering
// Constructs clean 2D THREE.Shape contours (with counter-holes) for
// "DEVELOPED BY" and "PHANTOM ZYREX" so every letter is extruded into real
// 3D beveled metallic gold geometry.
// ============================================================================
function createLetterShapes(char, w = 0.72, h = 1.0, t = 0.18) {
  const shapes = [];
  const c = char.toUpperCase();

  const rectShape = (x, y, rw, rh) => {
    const s = new THREE.Shape();
    s.moveTo(x, y);
    s.lineTo(x + rw, y);
    s.lineTo(x + rw, y + rh);
    s.lineTo(x, y + rh);
    s.closePath();
    return s;
  };

  const polyShape = (pts) => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      s.lineTo(pts[i][0], pts[i][1]);
    }
    s.closePath();
    return s;
  };

  const holePath = (pts) => {
    const p = new THREE.Path();
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      p.lineTo(pts[i][0], pts[i][1]);
    }
    p.closePath();
    return p;
  };

  switch (c) {
    case 'D': {
      const outer = polyShape([
        [0, 0],
        [w * 0.74, 0],
        [w, h * 0.22],
        [w, h * 0.78],
        [w * 0.74, h],
        [0, h]
      ]);
      outer.holes.push(
        holePath([
          [t, t],
          [w * 0.66, t],
          [w - t, h * 0.26],
          [w - t, h * 0.74],
          [w * 0.66, h - t],
          [t, h - t]
        ])
      );
      shapes.push(outer);
      break;
    }
    case 'E': {
      shapes.push(rectShape(0, 0, t, h));
      shapes.push(rectShape(0, h - t, w, t));
      shapes.push(rectShape(0, (h - t) * 0.5, w * 0.82, t));
      shapes.push(rectShape(0, 0, w, t));
      break;
    }
    case 'V': {
      shapes.push(
        polyShape([
          [0, h],
          [t * 1.05, h],
          [w * 0.5, t * 1.1],
          [w - t * 1.05, h],
          [w, h],
          [w * 0.5 + t * 0.45, 0],
          [w * 0.5 - t * 0.45, 0]
        ])
      );
      break;
    }
    case 'L': {
      shapes.push(rectShape(0, 0, t, h));
      shapes.push(rectShape(0, 0, w, t));
      break;
    }
    case 'O': {
      const outer = polyShape([
        [w * 0.2, 0],
        [w * 0.8, 0],
        [w, h * 0.2],
        [w, h * 0.8],
        [w * 0.8, h],
        [w * 0.2, h],
        [0, h * 0.8],
        [0, h * 0.2]
      ]);
      outer.holes.push(
        holePath([
          [w * 0.24, t],
          [w * 0.76, t],
          [w - t, h * 0.24],
          [w - t, h * 0.76],
          [w * 0.76, h - t],
          [w * 0.24, h - t],
          [t, h * 0.76],
          [t, h * 0.24]
        ])
      );
      shapes.push(outer);
      break;
    }
    case 'P': {
      const outer = polyShape([
        [0, 0],
        [t, 0],
        [t, h * 0.44],
        [w * 0.76, h * 0.44],
        [w, h * 0.58],
        [w, h * 0.86],
        [w * 0.76, h],
        [0, h]
      ]);
      outer.holes.push(
        holePath([
          [t, h * 0.44 + t * 0.85],
          [w * 0.68, h * 0.44 + t * 0.85],
          [w - t, h * 0.60],
          [w - t, h * 0.84],
          [w * 0.68, h - t * 0.85],
          [t, h - t * 0.85]
        ])
      );
      shapes.push(outer);
      break;
    }
    case 'B': {
      const outer = polyShape([
        [0, 0],
        [w * 0.78, 0],
        [w, h * 0.14],
        [w, h * 0.42],
        [w * 0.82, h * 0.5],
        [w * 0.96, h * 0.58],
        [w * 0.96, h * 0.86],
        [w * 0.76, h],
        [0, h]
      ]);
      outer.holes.push(
        holePath([
          [t, t * 0.85],
          [w * 0.70, t * 0.85],
          [w - t, h * 0.18],
          [w - t, h * 0.38],
          [w * 0.70, h * 0.46],
          [t, h * 0.46]
        ])
      );
      outer.holes.push(
        holePath([
          [t, h * 0.54],
          [w * 0.68, h * 0.54],
          [w * 0.96 - t, h * 0.62],
          [w * 0.96 - t, h * 0.82],
          [w * 0.68, h - t * 0.85],
          [t, h - t * 0.85]
        ])
      );
      shapes.push(outer);
      break;
    }
    case 'Y': {
      shapes.push(rectShape((w - t) * 0.5, 0, t, h * 0.48));
      shapes.push(
        polyShape([
          [0, h],
          [t * 1.05, h],
          [w * 0.5, h * 0.48],
          [w - t * 1.05, h],
          [w, h],
          [w * 0.5 + t * 0.5, h * 0.38],
          [w * 0.5 - t * 0.5, h * 0.38]
        ])
      );
      break;
    }
    case 'H': {
      shapes.push(rectShape(0, 0, t, h));
      shapes.push(rectShape(w - t, 0, t, h));
      shapes.push(rectShape(0, (h - t) * 0.5, w, t));
      break;
    }
    case 'A': {
      const outer = polyShape([
        [0, 0],
        [t * 1.05, 0],
        [w * 0.24, h * 0.28],
        [w * 0.76, h * 0.28],
        [w - t * 1.05, 0],
        [w, 0],
        [w * 0.5 + t * 0.52, h],
        [w * 0.5 - t * 0.52, h]
      ]);
      outer.holes.push(
        holePath([
          [w * 0.31, h * 0.44],
          [w * 0.69, h * 0.44],
          [w * 0.5, h * 0.82]
        ])
      );
      shapes.push(outer);
      break;
    }
    case 'N': {
      shapes.push(rectShape(0, 0, t, h));
      shapes.push(rectShape(w - t, 0, t, h));
      shapes.push(
        polyShape([
          [0, h],
          [t * 1.1, h],
          [w, 0],
          [w - t * 1.1, 0]
        ])
      );
      break;
    }
    case 'T': {
      shapes.push(rectShape((w - t) * 0.5, 0, t, h));
      shapes.push(rectShape(0, h - t, w, t));
      break;
    }
    case 'M': {
      const mw = w * 1.18;
      shapes.push(rectShape(0, 0, t, h));
      shapes.push(rectShape(mw - t, 0, t, h));
      shapes.push(
        polyShape([
          [0, h],
          [t * 1.05, h],
          [mw * 0.5, h * 0.28],
          [mw - t * 1.05, h],
          [mw, h],
          [mw * 0.5 + t * 0.42, h * 0.12],
          [mw * 0.5 - t * 0.42, h * 0.12]
        ])
      );
      break;
    }
    case 'Z': {
      shapes.push(rectShape(0, h - t, w, t));
      shapes.push(rectShape(0, 0, w, t));
      shapes.push(
        polyShape([
          [0, t * 0.6],
          [w - t * 1.1, h - t * 0.6],
          [w, h - t * 0.6],
          [t * 1.1, t * 0.6]
        ])
      );
      break;
    }
    case 'R': {
      const outer = polyShape([
        [0, 0],
        [t, 0],
        [t, h * 0.44],
        [w * 0.52, h * 0.44],
        [w - t * 1.05, 0],
        [w, 0],
        [w * 0.72, h * 0.46],
        [w, h * 0.58],
        [w, h * 0.86],
        [w * 0.76, h],
        [0, h]
      ]);
      outer.holes.push(
        holePath([
          [t, h * 0.44 + t * 0.82],
          [w * 0.68, h * 0.44 + t * 0.82],
          [w - t, h * 0.60],
          [w - t, h * 0.84],
          [w * 0.68, h - t * 0.82],
          [t, h - t * 0.82]
        ])
      );
      shapes.push(outer);
      break;
    }
    case 'X': {
      shapes.push(
        polyShape([
          [0, h],
          [t * 1.1, h],
          [w, 0],
          [w - t * 1.1, 0]
        ])
      );
      shapes.push(
        polyShape([
          [0, 0],
          [t * 1.1, 0],
          [w, h],
          [w - t * 1.1, h]
        ])
      );
      break;
    }
    default:
      break;
  }
  return shapes;
}

function buildExtrudedWordGeometry(text, options = {}) {
  const scale = options.scale || 0.1;
  const depth = options.depth || 0.025;
  const bevel = options.bevel || 0.005;
  const letterSpacing = options.letterSpacing || 0.22;

  const charWidths = { M: 0.86, I: 0.36, ' ': 0.46 };
  const defaultW = 0.72;

  let totalW = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    totalW += (charWidths[ch] || defaultW) + (i < text.length - 1 ? letterSpacing : 0);
  }

  const allShapes = [];
  let cursorX = -totalW * 0.5;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    const cw = charWidths[ch] || defaultW;
    if (ch !== ' ') {
      const rawShapes = createLetterShapes(ch, defaultW, 1.0, 0.185);
      for (const s of rawShapes) {
        const pts = s.getPoints(8).map((p) => new THREE.Vector2((p.x + cursorX) * scale, (p.y - 0.5) * scale));
        const shifted = new THREE.Shape(pts);
        for (const h of s.holes || []) {
          const hPts = h.getPoints(8).map((p) => new THREE.Vector2((p.x + cursorX) * scale, (p.y - 0.5) * scale));
          shifted.holes.push(new THREE.Path(hPts));
        }
        allShapes.push(shifted);
      }
    }
    cursorX += cw + letterSpacing;
  }

  const geo = new THREE.ExtrudeGeometry(allShapes, {
    steps: 1,
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelSegments: 3
  });
  geo.computeVertexNormals();
  return geo;
}

function createGothicBackingTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(512, 192, 30, 512, 192, 520);
    grad.addColorStop(0, '#161b28');
    grad.addColorStop(0.65, '#0c0f18');
    grad.addColorStop(1, '#06080d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 384);

    // Subtle Gothic gold pinstripe & corner filigree
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.42)';
    ctx.lineWidth = 3;
    ctx.strokeRect(26, 26, 972, 332);
    ctx.strokeStyle = 'rgba(245, 215, 110, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(36, 36, 952, 312);

    // Subtle divider line between "DEVELOPED BY" and "PHANTOM ZYREX"
    const lineGrad = ctx.createLinearGradient(180, 0, 844, 0);
    lineGrad.addColorStop(0, 'rgba(212, 175, 55, 0)');
    lineGrad.addColorStop(0.25, 'rgba(212, 175, 55, 0.55)');
    lineGrad.addColorStop(0.5, 'rgba(245, 215, 110, 0.9)');
    lineGrad.addColorStop(0.75, 'rgba(212, 175, 55, 0.55)');
    lineGrad.addColorStop(1, 'rgba(212, 175, 55, 0)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(180, 162);
    ctx.lineTo(844, 162);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (renderer?.capabilities?.getMaxAnisotropy) {
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  tex.needsUpdate = true;
  return tex;
}

export function createDeveloper3DMonument(scene, renderer) {
  const obsidianMat = new THREE.MeshStandardMaterial({
    color: 0x10141e,
    roughness: 0.24,
    metalness: 0.34
  });

  const backingTex = createGothicBackingTexture(renderer);
  const backingFaceMat = new THREE.MeshStandardMaterial({
    map: backingTex,
    roughness: 0.28,
    metalness: 0.25,
    emissive: new THREE.Color(0x1a150b),
    emissiveIntensity: 0.45
  });

  const brushedGoldMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.22,
    metalness: 0.88,
    emissive: new THREE.Color(0x3a2a08),
    emissiveIntensity: 0.28
  });

  const brightGoldTextMat = new THREE.MeshStandardMaterial({
    color: 0xf7dc78,
    roughness: 0.16,
    metalness: 0.92,
    emissive: new THREE.Color(0x6e5010),
    emissiveIntensity: 0.42
  });

  const subTextSilverGoldMat = new THREE.MeshStandardMaterial({
    color: 0xe8d59e,
    roughness: 0.20,
    metalness: 0.86,
    emissive: new THREE.Color(0x453410),
    emissiveIntensity: 0.34
  });

  const arcaneGemMat = new THREE.MeshStandardMaterial({
    color: 0x72d6ff,
    roughness: 0.10,
    metalness: 0.25,
    emissive: new THREE.Color(0x38a8ff),
    emissiveIntensity: 1.65
  });

  // Shared 3D Geometries for the Gothic Cartouche & Extruded 3D Words
  const wCartouche = 1.64;
  const hCartouche = 0.44;
  const archPeak = 0.09;

  function makeCartoucheShape(w, h, peak) {
    const hw = w * 0.5;
    const hh = h * 0.5;
    const chamfer = 0.065;
    const s = new THREE.Shape();
    s.moveTo(-hw + chamfer, -hh);
    s.lineTo(hw - chamfer, -hh);
    s.lineTo(hw, -hh + chamfer);
    s.lineTo(hw, hh - chamfer);
    s.lineTo(hw - chamfer, hh);
    s.lineTo(0.26, hh);
    s.lineTo(0, hh + peak);
    s.lineTo(-0.26, hh);
    s.lineTo(-hw + chamfer, hh);
    s.lineTo(-hw, hh - chamfer);
    s.lineTo(-hw, -hh + chamfer);
    s.closePath();
    return s;
  }

  const baseSlabShape = makeCartoucheShape(wCartouche, hCartouche, archPeak);
  const baseSlabGeo = new THREE.ExtrudeGeometry(baseSlabShape, {
    steps: 1,
    depth: 0.048,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.016,
    bevelSegments: 4
  });
  baseSlabGeo.computeVertexNormals();

  // Outer raised gold Gothic frame with cutout window
  const frameOuterShape = makeCartoucheShape(wCartouche + 0.03, hCartouche + 0.03, archPeak + 0.012);
  const innerHole = makeCartoucheShape(wCartouche - 0.065, hCartouche - 0.065, archPeak - 0.018);
  frameOuterShape.holes.push(new THREE.Path(innerHole.getPoints(16)));
  const goldFrameGeo = new THREE.ExtrudeGeometry(frameOuterShape, {
    steps: 1,
    depth: 0.062,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.010,
    bevelSegments: 3
  });
  goldFrameGeo.computeVertexNormals();

  // Recessed Backing Plate with Gothic Filigree CanvasTexture
  const facePlaneGeo = new THREE.PlaneGeometry(wCartouche - 0.08, hCartouche - 0.08);

  // True 3D Extruded Beveled Lettering for "DEVELOPED BY" and "PHANTOM ZYREX"
  const devByGeo = buildExtrudedWordGeometry('DEVELOPED BY', {
    scale: 0.056,
    depth: 0.022,
    bevel: 0.0045,
    letterSpacing: 0.25
  });

  const phantomZyrexGeo = buildExtrudedWordGeometry('PHANTOM ZYREX', {
    scale: 0.104,
    depth: 0.034,
    bevel: 0.0075,
    letterSpacing: 0.21
  });

  // Flanking 3D Gothic Spire Pillars & Top Royal Crown Gem
  const pillarColGeo = new THREE.CylinderGeometry(0.032, 0.042, hCartouche + 0.12, 8);
  const spireConeGeo = new THREE.ConeGeometry(0.048, 0.14, 8);
  const collarRingGeo = new THREE.TorusGeometry(0.042, 0.010, 8, 16);
  collarRingGeo.rotateX(Math.PI / 2);
  const gemGeo = new THREE.OctahedronGeometry(0.042, 0);

  const rotatingGems = [];

  function assembleSingle3DCrest() {
    const group = new THREE.Group();

    // 1. Beveled Obsidian Slab
    const slabMesh = new THREE.Mesh(baseSlabGeo, obsidianMat);
    slabMesh.position.z = -0.024;
    slabMesh.castShadow = true;
    slabMesh.receiveShadow = true;
    group.add(slabMesh);

    // 2. Sculpted Brushed Gold Gothic Frame
    const frameMesh = new THREE.Mesh(goldFrameGeo, brushedGoldMat);
    frameMesh.position.z = -0.026;
    group.add(frameMesh);

    // 3. Engraved Obsidian Backing Plate
    const faceMesh = new THREE.Mesh(facePlaneGeo, backingFaceMat);
    faceMesh.position.set(0, -0.004, 0.044);
    group.add(faceMesh);

    // 4. 3D Extruded "DEVELOPED BY" Upper Line
    const devByMesh = new THREE.Mesh(devByGeo, subTextSilverGoldMat);
    devByMesh.position.set(0, 0.096, 0.044);
    group.add(devByMesh);

    // 5. 3D Extruded "PHANTOM ZYREX" Hero Line
    const phantomMesh = new THREE.Mesh(phantomZyrexGeo, brightGoldTextMat);
    phantomMesh.position.set(0, -0.056, 0.044);
    group.add(phantomMesh);

    // 6. Twin Flanking Gothic Spire Finials
    for (const side of [-1, 1]) {
      const px = side * (wCartouche * 0.5 + 0.04);
      const pillar = new THREE.Mesh(pillarColGeo, brushedGoldMat);
      pillar.position.set(px, 0.01, 0.015);
      group.add(pillar);

      const topSpire = new THREE.Mesh(spireConeGeo, brightGoldTextMat);
      topSpire.position.set(px, hCartouche * 0.5 + 0.13, 0.015);
      group.add(topSpire);

      const botSpire = new THREE.Mesh(spireConeGeo, brushedGoldMat);
      botSpire.rotation.x = Math.PI;
      botSpire.position.set(px, -hCartouche * 0.5 - 0.11, 0.015);
      group.add(botSpire);

      for (const ry of [-0.14, 0.16]) {
        const ring = new THREE.Mesh(collarRingGeo, brightGoldTextMat);
        ring.position.set(px, ry, 0.015);
        group.add(ring);
      }
    }

    // 7. Apex Sanctum Crown Pedestal & Floating Arcane Gem
    const crownPedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.032, 0.055, 8),
      brushedGoldMat
    );
    crownPedestal.position.set(0, hCartouche * 0.5 + archPeak + 0.025, 0.018);
    group.add(crownPedestal);

    const gemMesh = new THREE.Mesh(gemGeo, arcaneGemMat);
    gemMesh.position.set(0, hCartouche * 0.5 + archPeak + 0.095, 0.018);
    group.add(gemMesh);
    rotatingGems.push(gemMesh);

    return group;
  }

  function assembleFloorPlinth(plinthHeight = 0.68, plinthWidth = 1.18) {
    const pGroup = new THREE.Group();

    // Stepped obsidian floor base on the cathedral flagstones
    const step1 = new THREE.Mesh(
      new THREE.BoxGeometry(plinthWidth + 0.28, 0.08, 0.46),
      obsidianMat
    );
    step1.position.y = 0.04;
    step1.castShadow = true;
    step1.receiveShadow = true;
    pGroup.add(step1);

    const step1Trim = new THREE.Mesh(
      new THREE.BoxGeometry(plinthWidth + 0.31, 0.024, 0.49),
      brushedGoldMat
    );
    step1Trim.position.y = 0.082;
    pGroup.add(step1Trim);

    const step2 = new THREE.Mesh(
      new THREE.BoxGeometry(plinthWidth + 0.08, 0.09, 0.36),
      obsidianMat
    );
    step2.position.y = 0.125;
    step2.castShadow = true;
    step2.receiveShadow = true;
    pGroup.add(step2);

    // Twin Gothic support columns rising from the base to cradle the hovering 3D crest
    const colH = Math.max(0.18, plinthHeight - 0.22);
    const colGeo = new THREE.CylinderGeometry(0.055, 0.068, colH, 8);
    const capGeo = new THREE.BoxGeometry(0.18, 0.045, 0.22);
    for (const side of [-1, 1]) {
      const cx = side * (plinthWidth * 0.38);
      const col = new THREE.Mesh(colGeo, obsidianMat);
      col.position.set(cx, 0.17 + colH * 0.5, 0);
      col.castShadow = true;
      col.receiveShadow = true;
      pGroup.add(col);

      const midRing = new THREE.Mesh(collarRingGeo, brushedGoldMat);
      midRing.scale.setScalar(1.45);
      midRing.position.set(cx, 0.17 + colH * 0.5, 0);
      pGroup.add(midRing);

      const cap = new THREE.Mesh(capGeo, brushedGoldMat);
      cap.position.set(cx, 0.17 + colH + 0.02, 0);
      pGroup.add(cap);
    }

    // Upper altar cross-beam & glowing arcane sanctum seal beneath the levitating crest
    const topBeam = new THREE.Mesh(
      new THREE.BoxGeometry(plinthWidth + 0.04, 0.05, 0.26),
      obsidianMat
    );
    topBeam.position.y = plinthHeight;
    topBeam.castShadow = true;
    topBeam.receiveShadow = true;
    pGroup.add(topBeam);

    const topGoldRim = new THREE.Mesh(
      new THREE.BoxGeometry(plinthWidth + 0.08, 0.022, 0.29),
      brushedGoldMat
    );
    topGoldRim.position.y = plinthHeight + 0.028;
    pGroup.add(topGoldRim);

    return pGroup;
  }

  // ==========================================================================
  // Placement 1: North & South Cathedral Nave Monuments (Shifted Far from Board)
  // Positioned at z = ±3.85 (over 2.4 meters beyond the chessboard edge and
  // clear of the stepped altar dais at z = ±2.38), standing in the open nave
  // while remaining cleanly framed in the upper viewport above the pieces.
  // ==========================================================================
  const northMonumentGroup = new THREE.Group();
  northMonumentGroup.position.set(0, 0, -3.85);
  const northPlinth = assembleFloorPlinth(0.64, 1.32);
  northMonumentGroup.add(northPlinth);

  const northCrest = assembleSingle3DCrest();
  const northBaseY = 1.04;
  northCrest.position.set(0, northBaseY, 0);
  northCrest.scale.setScalar(0.95);
  northCrest.rotation.x = 0.16; // Tilted slightly toward the elevated camera for optimal 3D bevel catchlight
  northMonumentGroup.add(northCrest);
  scene.add(northMonumentGroup);

  const southMonumentGroup = new THREE.Group();
  southMonumentGroup.position.set(0, 0, 3.85);
  southMonumentGroup.rotation.y = Math.PI;
  const southPlinth = assembleFloorPlinth(0.64, 1.32);
  southMonumentGroup.add(southPlinth);

  const southCrest = assembleSingle3DCrest();
  const southBaseY = 1.04;
  southCrest.position.set(0, southBaseY, 0);
  southCrest.scale.setScalar(0.95);
  southCrest.rotation.x = 0.16;
  southMonumentGroup.add(southCrest);
  scene.add(southMonumentGroup);

  // ==========================================================================
  // Placement 2: East & West Atrium Monuments (Shifted Far from Board to x = ±2.95)
  // Placed 1.53m away from the East/West board edges out in the open atrium
  // between the outer altar steps and the twin fire braziers (x = ±3.65).
  // ==========================================================================
  const eastMonumentGroup = new THREE.Group();
  eastMonumentGroup.position.set(2.95, 0, 0);
  eastMonumentGroup.rotation.y = -Math.PI * 0.5;
  const eastPlinth = assembleFloorPlinth(0.46, 0.92);
  eastMonumentGroup.add(eastPlinth);

  const eastPlaque = assembleSingle3DCrest();
  const sideBaseY = 0.74;
  eastPlaque.position.set(0, sideBaseY, 0);
  eastPlaque.scale.setScalar(0.64);
  eastPlaque.rotation.x = 0.18;
  eastMonumentGroup.add(eastPlaque);
  scene.add(eastMonumentGroup);

  const westMonumentGroup = new THREE.Group();
  westMonumentGroup.position.set(-2.95, 0, 0);
  westMonumentGroup.rotation.y = Math.PI * 0.5;
  const westPlinth = assembleFloorPlinth(0.46, 0.92);
  westMonumentGroup.add(westPlinth);

  const westPlaque = assembleSingle3DCrest();
  westPlaque.position.set(0, sideBaseY, 0);
  westPlaque.scale.setScalar(0.64);
  westPlaque.rotation.x = 0.18;
  westMonumentGroup.add(westPlaque);
  scene.add(westMonumentGroup);

  function update(elapsedTime, camera) {
    const hoverBob = Math.sin(elapsedTime * 1.85) * 0.022;
    northCrest.position.y = northBaseY + hoverBob;
    southCrest.position.y = southBaseY + hoverBob;
    eastPlaque.position.y = sideBaseY + hoverBob * 0.75;
    westPlaque.position.y = sideBaseY + hoverBob * 0.75;

    for (let i = 0; i < rotatingGems.length; i++) {
      rotatingGems[i].rotation.y = elapsedTime * 1.6 + i;
    }

    if (camera) {
      // Keep the far-side monuments visible across the board and hide any monument
      // directly behind the active camera position so it never blocks the view
      northMonumentGroup.visible = camera.position.z >= -1.25;
      southMonumentGroup.visible = camera.position.z <= 1.25;
      eastMonumentGroup.visible = camera.position.x <= 1.65;
      westMonumentGroup.visible = camera.position.x >= -1.65;
    }
  }

  return {
    northCrest: northMonumentGroup,
    southCrest: southMonumentGroup,
    eastPlaque: eastMonumentGroup,
    westPlaque: westMonumentGroup,
    update
  };
}

