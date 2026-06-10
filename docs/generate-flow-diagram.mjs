#!/usr/bin/env node
/**
 * Generate sealos-deploy workflow diagram as Excalidraw JSON.
 * Run: node docs/generate-flow-diagram.mjs
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "sealos-deploy-flow.excalidraw");

let seq = 0;
function id() {
  return `sd${(++seq).toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const LINE_HEIGHT = 1.3;
const PAD_X = 16;
const PAD_Y = 14;

function lineCount(label) {
  return label.split("\n").length;
}

function textHeight(fontSize, lines) {
  return Math.ceil(fontSize * LINE_HEIGHT * lines) + 4;
}

function boxHeight(fontSize, lines, extra = 0) {
  return textHeight(fontSize, lines) + PAD_Y * 2 + extra;
}

function shapeText(shapeId, x, y, w, h, label, opts = {}) {
  const {
    stroke = "#1e1e1e",
    fontSize = 18,
    textAlign = "center",
    verticalAlign = "middle",
  } = opts;
  const lines = lineCount(label);
  const th = textHeight(fontSize, lines);
  const textId = id();
  const textY =
    verticalAlign === "middle" ? y + (h - th) / 2 : y + PAD_Y / 2;

  return {
    textId,
    text: {
      type: "text",
      id: textId,
      x: x + PAD_X / 2,
      y: textY,
      width: w - PAD_X,
      height: th,
      angle: 0,
      strokeColor: stroke,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: Math.floor(Math.random() * 1e9),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      text: label,
      fontSize,
      fontFamily: 5,
      textAlign,
      verticalAlign,
      containerId: shapeId,
      originalText: label,
      autoResize: true,
      lineHeight: LINE_HEIGHT,
    },
  };
}

function rect(x, y, w, label, opts = {}) {
  const rid = id();
  const {
    bg = "#a5d8ff",
    stroke = "#1e1e1e",
    fontSize = 18,
    h: fixedH,
    textAlign = "center",
    verticalAlign = "middle",
  } = opts;
  const lines = lineCount(label);
  const h = fixedH ?? boxHeight(fontSize, lines);
  const { textId, text } = shapeText(rid, x, y, w, h, label, {
    stroke,
    fontSize,
    textAlign,
    verticalAlign,
  });

  return [
    {
      type: "rectangle",
      id: rid,
      x,
      y,
      width: w,
      height: h,
      angle: 0,
      strokeColor: stroke,
      backgroundColor: bg,
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 3 },
      seed: Math.floor(Math.random() * 1e9),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      isDeleted: false,
      boundElements: [{ type: "text", id: textId }],
      updated: Date.now(),
      link: null,
      locked: false,
    },
    text,
  ];
}

function diamond(x, y, size, label, opts = {}) {
  const did = id();
  const { bg = "#ffd43b", fontSize = 16 } = opts;
  const w = size;
  const h = Math.max(size * 0.85, boxHeight(fontSize, lineCount(label), 4));
  const { textId, text } = shapeText(did, x, y, w, h, label, { fontSize });

  return [
    {
      type: "diamond",
      id: did,
      x,
      y,
      width: w,
      height: h,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: bg,
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 2 },
      seed: Math.floor(Math.random() * 1e9),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      isDeleted: false,
      boundElements: [{ type: "text", id: textId }],
      updated: Date.now(),
      link: null,
      locked: false,
    },
    text,
  ];
}

function ellipse(x, y, w, label, opts = {}) {
  const eid = id();
  const { bg = "#b2f2bb", fontSize = 18 } = opts;
  const h = boxHeight(fontSize, lineCount(label), 4);
  const { textId, text } = shapeText(eid, x, y, w, h, label, { fontSize });

  return [
    {
      type: "ellipse",
      id: eid,
      x,
      y,
      width: w,
      height: h,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: bg,
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: Math.floor(Math.random() * 1e9),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      isDeleted: false,
      boundElements: [{ type: "text", id: textId }],
      updated: Date.now(),
      link: null,
      locked: false,
    },
    text,
  ];
}

function arrow(x1, y1, x2, y2, label = "", opts = {}) {
  const { dashed = false, color = "#1e1e1e", labelOffset = { x: 0, y: 0 } } = opts;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const aid = id();
  const elements = [
    {
      type: "arrow",
      id: aid,
      x: x1,
      y: y1,
      width: dx,
      height: dy,
      angle: 0,
      strokeColor: color,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: dashed ? "dashed" : "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 2 },
      seed: Math.floor(Math.random() * 1e9),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      points: [
        [0, 0],
        [dx, dy],
      ],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: "arrow",
    },
  ];
  if (label) {
    const mx = x1 + dx / 2 - 28 + labelOffset.x;
    const my = y1 + dy / 2 - 10 + labelOffset.y;
    elements.push({
      type: "text",
      id: id(),
      x: mx,
      y: my,
      width: 72,
      height: 22,
      angle: 0,
      strokeColor: color,
      backgroundColor: "#ffffff",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: Math.floor(Math.random() * 1e9),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      text: label,
      fontSize: 14,
      fontFamily: 5,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: null,
      originalText: label,
      autoResize: true,
      lineHeight: 1.2,
    });
  }
  return elements;
}

function labelText(x, y, text, opts = {}) {
  const { fontSize = 20, color = "#1e1e1e", w = 400 } = opts;
  const lines = lineCount(text);
  return {
    type: "text",
    id: id(),
    x,
    y,
    width: w,
    height: textHeight(fontSize, lines) + 4,
    angle: 0,
    strokeColor: color,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(Math.random() * 1e9),
    version: 1,
    versionNonce: Math.floor(Math.random() * 1e9),
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
    text,
    fontSize,
    fontFamily: 5,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    originalText: text,
    autoResize: true,
    lineHeight: LINE_HEIGHT,
  };
}

function regionBox(x, y, w, h, title) {
  const rid = id();
  return [
    {
      type: "rectangle",
      id: rid,
      x,
      y,
      width: w,
      height: h,
      angle: 0,
      strokeColor: "#868e96",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "dashed",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 3 },
      seed: Math.floor(Math.random() * 1e9),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
    },
    labelText(x + 12, y + 8, title, { fontSize: 16, color: "#495057", w: w - 24 }),
  ];
}

const CX = 340;
const BW = 300;
const GAP = 48;
const ARROW = 36;

const elements = [];
const layoutMarkers = {};

function placeRect(y, label, opts = {}) {
  const w = opts.w ?? BW;
  const els = rect(CX - w / 2, y, w, label, opts);
  const h = els[0].height;
  elements.push(...els);
  return { y, h, bottom: y + h };
}

function placeDiamond(y, size, label, opts = {}) {
  const els = diamond(CX - size / 2, y, size, label, opts);
  const h = els[0].height;
  elements.push(...els);
  return { y, h, bottom: y + h };
}

function downArrow(fromBottom, toY, label = "", opts = {}) {
  elements.push(...arrow(CX, fromBottom + 8, CX, toY - 8, label, opts));
}

// Title
elements.push(
  labelText(160, 20, "sealos-deploy 工作流", { fontSize: 28, w: 520, color: "#1864ab" }),
  labelText(160, 58, "Sealos Cloud 项目容器化准备流水线", { fontSize: 16, w: 520, color: "#495057" })
);

let y = 100;

// Start
const startEls = ellipse(CX - 110, y, 220, "/sealos-deploy\n[github-url]");
elements.push(...startEls);
const startH = startEls[0].height;
downArrow(y + startH, (y += startH + ARROW + GAP));

// Phase 0
const p0 = placeRect(y, "Phase 0 · Preflight\n环境检测 · 项目解析", { bg: "#e7f5ff" });
layoutMarkers.phase0 = p0;
downArrow(p0.bottom, (y = p0.bottom + ARROW + GAP));

// Decision: preflight
const d0 = placeDiamond(y, 150, "通过?");
const stop0 = rect(CX + 190, d0.y + 8, 170, "STOP\n说明阻塞原因", {
  bg: "#ffc9c9",
  fontSize: 16,
});
elements.push(...stop0);
elements.push(...arrow(CX + 75, d0.y + d0.h / 2, CX + 190, d0.y + stop0[0].height / 2 + 8, "fail"));
downArrow(d0.bottom, (y = d0.bottom + ARROW + GAP), "pass", { labelOffset: { x: 18, y: -6 } });

// Phase 1
const p1Label = "Phase 1 · Assess\nreadiness 评分 0–12";
const p1 = placeRect(y, p1Label, { bg: "#a5d8ff" });
layoutMarkers.phase1 = p1;
elements.push(
  labelText(CX + BW / 2 + 20, p1.y + (p1.h - 20) / 2, "→ analysis.json", {
    fontSize: 13,
    color: "#495057",
    w: 170,
  })
);
downArrow(p1.bottom, (y = p1.bottom + ARROW + GAP));

// Decision: score
const d1 = placeDiamond(y, 170, "score ≥ 4?");
const stop1 = rect(CX + 190, d1.y + 8, 170, "STOP\n不适合容器化", {
  bg: "#ffc9c9",
  fontSize: 16,
});
elements.push(...stop1);
elements.push(...arrow(CX + 85, d1.y + d1.h / 2, CX + 190, d1.y + stop1[0].height / 2 + 8, "< 4"));
downArrow(d1.bottom, (y = d1.bottom + ARROW + GAP), "≥ 4", { labelOffset: { x: 18, y: -6 } });

// Phase 2
const p2 = placeRect(y, "Phase 2 · Detect Image\ndetect-image.mjs", { bg: "#a5d8ff" });
layoutMarkers.phase2 = p2;
elements.push(
  labelText(CX + BW / 2 + 20, p2.y + (p2.h - 20) / 2, "→ image_ref", {
    fontSize: 13,
    color: "#495057",
    w: 120,
  })
);
downArrow(p2.bottom, (y = p2.bottom + ARROW + GAP));

// Phase 3
const p3 = placeRect(y, "Phase 3 · Dockerfile\ndockerfile-skill", { bg: "#a5d8ff" });
layoutMarkers.phase3 = p3;
elements.push(
  labelText(CX + BW / 2 + 20, p3.y + (p3.h - 20) / 2, "→ Dockerfile", {
    fontSize: 13,
    color: "#495057",
    w: 130,
  })
);
downArrow(p3.bottom, (y = p3.bottom + ARROW + GAP));

// Phase 4
const p4 = placeRect(y, "Phase 4 · Build / Reuse\nbuild-request.json", { bg: "#d0bfff" });
layoutMarkers.phase4 = p4;
downArrow(p4.bottom, (y = p4.bottom + ARROW + GAP));

// Branch decision
const d2 = placeDiamond(y, 180, "可复用镜像?");
const branchGap = 56;
const branchY = d2.bottom + branchGap;

// Left: reuse-image
const leftX = CX - 310;
const reuseBox = rect(leftX - 130, branchY, 260, "reuse-image\nwrite-result (skipped)", {
  bg: "#b2f2bb",
  fontSize: 16,
});
elements.push(...reuseBox);
elements.push(
  ...arrow(CX - 90, d2.y + d2.h / 2, leftX, branchY + reuseBox[0].height / 2, "是", {
    color: "#2b8a3e",
  }),
  labelText(leftX - 130, branchY + reuseBox[0].height + 8, "→ build-result.json", {
    fontSize: 13,
    color: "#2b8a3e",
    w: 260,
  })
);

// Right: build-required
const rightX = CX + 190;
const buildBox = rect(rightX, branchY, 280, "build-required\nk8s-buildkit-job\nBuildKit Job + GHCR push", {
  bg: "#ffec99",
  fontSize: 15,
});
elements.push(...buildBox);
layoutMarkers.buildBox = { y: branchY, h: buildBox[0].height, bottom: branchY + buildBox[0].height };
elements.push(
  ...arrow(CX + 90, d2.y + d2.h / 2, rightX + 140, branchY + buildBox[0].height / 2, "否", {
    color: "#e67700",
  }),
  labelText(rightX, branchY + buildBox[0].height + 8, "→ build-result.json", {
    fontSize: 13,
    color: "#e67700",
    w: 280,
  })
);

elements.push(...arrow(CX, p4.bottom + 8, CX, d2.y - 8));

// Merge to Phase 5
const mergeY =
  branchY + Math.max(reuseBox[0].height, buildBox[0].height) + 48;
elements.push(
  ...arrow(leftX, branchY + reuseBox[0].height + 8, CX - 70, mergeY),
  ...arrow(rightX + 140, branchY + buildBox[0].height + 8, CX + 70, mergeY)
);

y = mergeY + GAP;

// Phase 5
const p5 = placeRect(y, "Phase 5 · Template\ndocker-to-sealos", { bg: "#a5d8ff" });
layoutMarkers.phase5 = p5;
elements.push(
  labelText(CX + BW / 2 + 20, p5.y + (p5.h - 20) / 2, "→ index.yaml", {
    fontSize: 13,
    color: "#495057",
    w: 150,
  })
);
downArrow(p5.bottom, (y = p5.bottom + ARROW + GAP));

// Phase 6
const p6 = placeRect(y, "Phase 6 · Finish\nvalidate-artifacts.mjs", { bg: "#a5d8ff" });
elements.push(
  labelText(CX + BW / 2 + 20, p6.y + (p6.h - 20) / 2, "→ delivery-manifest.json", {
    fontSize: 13,
    color: "#495057",
    w: 210,
  })
);
downArrow(p6.bottom, (y = p6.bottom + ARROW + GAP));

// End
const endEls = ellipse(CX - 95, y, 190, "Done · 产物就绪", { bg: "#b2f2bb" });
elements.push(...endEls);

// Skill dependency panel (right side)
const panelX = 740;
const panelTop = 100;
const panelSkillGap = 16;
let panelY = 150;
const panelInsertAt = elements.length;

const panelEntry = rect(panelX + 20, panelY, 280, "sealos-deploy\n(用户入口)", {
  bg: "#ffd43b",
  fontSize: 16,
});
elements.push(...panelEntry);
panelY += panelEntry[0].height + panelSkillGap;
elements.push(...arrow(panelX + 160, panelY - panelSkillGap, panelX + 160, panelY));

const panelSkills = [
  ["cloud-native-readiness\nPhase 1 评分标准", "#e7f5ff"],
  ["dockerfile-skill\nPhase 3 生成 Dockerfile", "#e7f5ff"],
  ["k8s-buildkit-job\nPhase 4 BuildKit 构建", "#e7f5ff"],
  ["docker-to-sealos\nPhase 5 Sealos 模板", "#e7f5ff"],
];

const panelSkillBoxes = [];
for (const [label, bg] of panelSkills) {
  const box = rect(panelX + 20, panelY, 280, label, { bg, fontSize: 15 });
  elements.push(...box);
  panelSkillBoxes.push(box[0]);
  panelY += box[0].height + panelSkillGap;
}

const artifactsY = panelY + 8;
const panelHeight = artifactsY - panelTop + 140;
elements.splice(
  panelInsertAt,
  0,
  ...regionBox(panelX, panelTop, 320, panelHeight, "内部 Skill 依赖")
);
elements.push(
  labelText(panelX + 24, artifactsY, ".sealos/ 产物目录", { fontSize: 15, color: "#1864ab", w: 280 }),
  labelText(panelX + 32, artifactsY + 28, "analysis.json", { fontSize: 13, w: 260 }),
  labelText(panelX + 32, artifactsY + 50, "build-request.json", { fontSize: 13, w: 260 }),
  labelText(panelX + 32, artifactsY + 72, "build-result.json", { fontSize: 13, w: 260 }),
  labelText(panelX + 32, artifactsY + 94, "template/index.yaml", { fontSize: 13, w: 260 }),
  labelText(panelX + 32, artifactsY + 116, "delivery-manifest.json", { fontSize: 13, w: 260 })
);

// Dashed lines from phases to skills
elements.push(
  ...arrow(CX + BW / 2, layoutMarkers.phase1.y + layoutMarkers.phase1.h / 2, panelX + 20, panelSkillBoxes[0].y + panelSkillBoxes[0].height / 2, "", {
    dashed: true,
    color: "#adb5bd",
  }),
  ...arrow(CX + BW / 2, layoutMarkers.phase3.y + layoutMarkers.phase3.h / 2, panelX + 20, panelSkillBoxes[1].y + panelSkillBoxes[1].height / 2, "", {
    dashed: true,
    color: "#adb5bd",
  }),
  ...arrow(
    rightX + 280,
    layoutMarkers.buildBox.y + layoutMarkers.buildBox.h / 2,
    panelX + 20,
    panelSkillBoxes[2].y + panelSkillBoxes[2].height / 2,
    "",
    { dashed: true, color: "#adb5bd" }
  ),
  ...arrow(CX + BW / 2, layoutMarkers.phase5.y + layoutMarkers.phase5.h / 2, panelX + 20, panelSkillBoxes[3].y + panelSkillBoxes[3].height / 2, "", {
    dashed: true,
    color: "#adb5bd",
  })
);

const doc = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: {
    viewBackgroundColor: "#ffffff",
    gridSize: 20,
  },
  files: {},
};

writeFileSync(OUT, JSON.stringify(doc, null, 2));
console.log(`Wrote ${OUT} (${elements.length} elements)`);
