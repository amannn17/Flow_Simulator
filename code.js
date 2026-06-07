// WA Flow Simulator — code.js
// Fixed: CTA detection by color+spatial, image claim tracking,
// RECTANGLE text extraction, dual-branch support, tighter image window.

figma.showUI(__html__, { width: 700, height: 700, title: "WA Flow Simulator" });

// ─── COLOR MAP ────────────────────────────────────────────────────────────────
var COLOUR_MAP = [
  { hex: '#C2E5FF', type: 'main_flow' },
  { hex: '#BDE3FF', type: 'main_flow' },
  { hex: '#AFF4C6', type: 'cta_button' },
  { hex: '#FCD19C', type: 'no_response' },
  { hex: '#FFE8A3', type: 'wrong_answer' },
  { hex: '#E4CCFF', type: 'submission' },
  { hex: '#FFC7C2', type: 'help' },
];

var EDGE_TYPES = ['no_response', 'wrong_answer', 'submission', 'help'];

// ─── COLOR HELPERS ────────────────────────────────────────────────────────────
function figmaColorToHex(color) {
  var r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  var g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  var b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  return ('#' + r + g + b).toUpperCase();
}

function matchColour(hex, targetHex, tolerance) {
  tolerance = tolerance || 20;
  function toRgb(h) {
    var c = h.replace('#', '');
    return {
      r: parseInt(c.substring(0, 2), 16),
      g: parseInt(c.substring(2, 4), 16),
      b: parseInt(c.substring(4, 6), 16),
    };
  }
  var a = toRgb(hex);
  var b = toRgb(targetHex);
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance
  );
}

function getNodeType(node) {
  if (!node.fills || !node.fills.length) return null;
  var fill = node.fills[0];
  if (fill.type !== 'SOLID') return null;
  var hex = figmaColorToHex(fill.color);
  for (var i = 0; i < COLOUR_MAP.length; i++) {
    if (matchColour(hex, COLOUR_MAP[i].hex)) return COLOUR_MAP[i].type;
  }
  return null;
}

// ─── TEXT EXTRACTION ─────────────────────────────────────────────────────────
// FIX #3: now handles RECTANGLE nodes with text children
function extractText(node) {
  if (!node) return '[EMPTY]';

  // SHAPE_WITH_TEXT — FigJam specific
  if (node.type === 'SHAPE_WITH_TEXT') {
    if (node.text && node.text.characters && node.text.characters.trim().length > 0) {
      return node.text.characters.trim();
    }
  }

  // Direct characters property (TEXT nodes, some shapes)
  if (node.characters && node.characters.trim().length > 0) {
    return node.characters.trim();
  }

  if (node.type === 'TEXT') {
    return node.characters ? node.characters.trim() : '[EMPTY]';
  }

  // RECTANGLE, FRAME, COMPONENT, INSTANCE — walk children for TEXT nodes
  if (node.children && node.children.length > 0) {
    var texts = [];
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      if (child.type === 'TEXT' && child.characters) {
        texts.push(child.characters.trim());
      }
      // One level deeper
      if (child.children) {
        for (var j = 0; j < child.children.length; j++) {
          var gc = child.children[j];
          if (gc.type === 'TEXT' && gc.characters) {
            texts.push(gc.characters.trim());
          }
        }
      }
    }
    var joined = texts.filter(function(t) { return t.length > 0; }).join(' ');
    if (joined.length > 0) return joined;
  }

  return '[EMPTY]';
}

// ─── CTA SPATIAL DETECTION ────────────────────────────────────────────────────
// FIX #1 + #3: find CTA nodes by color AND spatial proximity to a main node.
// Covers RECTANGLEs with text, catches nodes not connected by arrows.
function findSpatialCtaNodes(mainNode, allCtaColorNodes) {
  var bb = mainNode.absoluteBoundingBox;
  if (!bb) return [];

  var mainCenterX = bb.x + bb.width / 2;
  var mainBottom  = bb.y + bb.height;

  var results = [];
  for (var i = 0; i < allCtaColorNodes.length; i++) {
    var cta = allCtaColorNodes[i];
    var ctaBb = cta.absoluteBoundingBox;
    if (!ctaBb) continue;

    var ctaCenterX = ctaBb.x + ctaBb.width / 2;
    var ctaTop     = ctaBb.y;

    var dx = Math.abs(ctaCenterX - mainCenterX);
    var dy = ctaTop - mainBottom; // positive = CTA is below the main node

    // Must be:
    // - horizontally within 250px of main node center
    // - below the main node and within 300px (tighter than before)
    if (dx > 250) continue;
    if (dy < -20 || dy > 300) continue;

    results.push(cta);
  }

  // Sort top-to-bottom so button order is consistent
  results.sort(function(a, b) {
    var ay = a.absoluteBoundingBox ? a.absoluteBoundingBox.y : 0;
    var by = b.absoluteBoundingBox ? b.absoluteBoundingBox.y : 0;
    return ay - by;
  });

  return results;
}

// ─── IMAGE NODE DETECTION ─────────────────────────────────────────────────────
function isImageNode(node) {
  var validTypes = ['RECTANGLE', 'FRAME', 'COMPONENT', 'INSTANCE', 'VECTOR', 'ELLIPSE', 'POLYGON'];
  var validType = false;
  for (var i = 0; i < validTypes.length; i++) {
    if (node.type === validTypes[i]) { validType = true; break; }
  }
  if (!validType) return false;
  if (node.type === 'SHAPE_WITH_TEXT' || node.type === 'STICKY') return false;

  // Has an image fill
  if (node.fills && node.fills.length > 0) {
    for (var i = 0; i < node.fills.length; i++) {
      if (node.fills[i].type === 'IMAGE') return true;
    }
  }

  // Frame/Component/Instance — purely visual (no text children), sizeable
  if ((node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') && node.children) {
    var hasText = false;
    for (var i = 0; i < node.children.length; i++) {
      if (node.children[i].type === 'TEXT') { hasText = true; break; }
    }
    var imgBb = node.absoluteBoundingBox;
    if (!hasText && imgBb && imgBb.width > 40 && imgBb.height > 40) return true;
  }

  return false;
}

// FIX #2 + #5: track claimed images so each image is only assigned once.
// Tighter vertical window (200px instead of 600px).
function assignImagesToNodes(flowNodes, allImageNodes) {
  // Build a scored candidate list for every flow node
  var assignments = []; // { score, nodeIdx, imgIdx }

  for (var ni = 0; ni < flowNodes.length; ni++) {
    var fn = flowNodes[ni];
    var bb = fn._bb;
    if (!bb) continue;

    var nodeCenterX = bb.x + bb.width / 2;
    var nodeTop = bb.y;

    for (var ii = 0; ii < allImageNodes.length; ii++) {
      var img = allImageNodes[ii];
      var imgBb = img.absoluteBoundingBox;
      if (!imgBb) continue;

      var imgCenterX = imgBb.x + imgBb.width / 2;
      var imgBottom  = imgBb.y + imgBb.height;

      var dx = Math.abs(imgCenterX - nodeCenterX);
      var dy = nodeTop - imgBottom; // positive = image is above the node

      // FIX: tighter window — 250px horizontal, 200px vertical
      if (dx > 250) continue;
      if (dy < -30 || dy > 200) continue;

      var score = dy + dx * 0.5;
      assignments.push({ score: score, nodeIdx: ni, imgIdx: ii });
    }
  }

  // Sort by score ascending (closest first)
  assignments.sort(function(a, b) { return a.score - b.score; });

  // Greedy assignment — each image claimed by the best-scoring node only
  var claimedImages = {};
  var claimedNodes  = {};

  for (var i = 0; i < assignments.length; i++) {
    var a = assignments[i];
    if (claimedImages[a.imgIdx]) continue; // image already taken
    if (claimedNodes[a.nodeIdx])  continue; // node already has an image
    claimedImages[a.imgIdx] = true;
    claimedNodes[a.nodeIdx]  = true;
    flowNodes[a.nodeIdx]._imgNode = allImageNodes[a.imgIdx];
  }
}

// ─── BASE64 EXPORT ────────────────────────────────────────────────────────────
function uint8ToBase64(bytes) {
  var binary = '';
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function exportNodeAsBase64(node) {
  try {
    var bytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'WIDTH', value: 400 },
    });
    return 'data:image/png;base64,' + uint8ToBase64(bytes);
  } catch (e) {
    console.error('Export failed for node ' + node.id + ': ' + e);
    return null;
  }
}

// ─── CANVAS QUERIES ───────────────────────────────────────────────────────────
function getAllContentNodes() {
  // FIX #3: include RECTANGLE so CTA button rectangles are found
  return figma.currentPage.findAll(function(n) {
    return n.type === 'SHAPE_WITH_TEXT' ||
           n.type === 'STICKY' ||
           n.type === 'RECTANGLE' ||
           n.type === 'FRAME' ||
           n.type === 'COMPONENT' ||
           n.type === 'INSTANCE';
  });
}

function getAllConnectors() {
  return figma.currentPage.findAll(function(n) {
    return n.type === 'CONNECTOR';
  });
}

function getAllImageCandidates() {
  return figma.currentPage.findAll(function(n) {
    return isImageNode(n);
  });
}

function connectorFromId(c) {
  return c.connectorStart ? c.connectorStart.endpointNodeId : null;
}
function connectorToId(c) {
  return c.connectorEnd ? c.connectorEnd.endpointNodeId : null;
}

// ─── EDGE CASE PARSER ────────────────────────────────────────────────────────
function parseEdgeCase(target, idPrefix, idx) {
  var ecType = getNodeType(target);
  if (!ecType) return null;
  var isEdge = false;
  for (var i = 0; i < EDGE_TYPES.length; i++) {
    if (EDGE_TYPES[i] === ecType) { isEdge = true; break; }
  }
  if (!isEdge) return null;

  var ecText = extractText(target);
  var trigger = { type: ecType };

  var hoursMatch = ecText.match(/(\d+)\s*h(r|ours?)?/i);
  if (ecType === 'no_response' && hoursMatch) trigger.after_hours = parseInt(hoursMatch[1]);

  var retriesMatch = ecText.match(/(\d+)\s*(retri|reminder|attempt)/i);
  if (ecType === 'wrong_answer' && retriesMatch) trigger.max_retries = parseInt(retriesMatch[1]);

  return {
    id: idPrefix + '_ec' + idx,
    nodeId: target.id,
    type: ecType,
    trigger: trigger,
    text: ecText,
  };
}

// ─── QUIZ PATTERN DETECTION ───────────────────────────────────────────────────
function detectQuizPattern(ctaTargets, connectors, nodeMap, mainIdToIndex) {
  var quizResponses = [];
  var quizNextIndex = null;
  var isQuiz = false;

  for (var i = 0; i < ctaTargets.length; i++) {
    var ctaNode = ctaTargets[i];
    var ctaOut = connectors.filter(function(c) {
      return connectorFromId(c) === ctaNode.id;
    });

    for (var j = 0; j < ctaOut.length; j++) {
      var t = nodeMap[connectorToId(ctaOut[j])];
      if (!t || getNodeType(t) !== 'main_flow') continue;

      var tOut = connectors.filter(function(c) {
        return connectorFromId(c) === t.id;
      });

      var tLeadsToMain = false;
      for (var k = 0; k < tOut.length; k++) {
        var tt = nodeMap[connectorToId(tOut[k])];
        if (tt && getNodeType(tt) === 'main_flow') {
          tLeadsToMain = true;
          if (quizNextIndex === null) quizNextIndex = mainIdToIndex[tt.id];
          break;
        }
      }

      if (!tLeadsToMain) {
        isQuiz = true;
        var respText = extractText(t);
        if (respText !== '[EMPTY]') {
          var dupe = false;
          for (var k = 0; k < quizResponses.length; k++) {
            if (quizResponses[k] === respText) { dupe = true; break; }
          }
          if (!dupe) quizResponses.push(respText);
        }
        for (var k = 0; k < tOut.length; k++) {
          var tt = nodeMap[connectorToId(tOut[k])];
          if (tt && getNodeType(tt) === 'main_flow' && quizNextIndex === null) {
            quizNextIndex = mainIdToIndex[tt.id];
          }
        }
      }
    }
  }

  return {
    isQuiz: isQuiz && quizResponses.length > 0,
    quizResponses: quizResponses,
    quizNextIndex: quizNextIndex,
  };
}

// ─── MAIN ASYNC PARSER ────────────────────────────────────────────────────────
async function parseCanvas() {
  var allNodes = getAllContentNodes();
  var connectors = getAllConnectors();
  var allImageCandidates = getAllImageCandidates();

  figma.ui.postMessage({
    type: 'parse-progress',
    text: 'Found ' + allNodes.length + ' nodes, ' + allImageCandidates.length + ' image candidates...',
  });

  // Build lookup: node id → node
  var nodeMap = {};
  for (var i = 0; i < allNodes.length; i++) {
    nodeMap[allNodes[i].id] = allNodes[i];
  }

  // Separate by color
  var mainNodes = allNodes.filter(function(n) { return getNodeType(n) === 'main_flow'; });
  // FIX #3: all green nodes regardless of type (RECTANGLE, SHAPE_WITH_TEXT, etc.)
  var allCtaColorNodes = allNodes.filter(function(n) { return getNodeType(n) === 'cta_button'; });

  // Sort main nodes top→bottom, left→right
  mainNodes.sort(function(a, b) {
    var ab = a.absoluteBoundingBox;
    var bb = b.absoluteBoundingBox;
    if (!ab || !bb) return 0;
    if (Math.abs(ab.y - bb.y) > 30) return ab.y - bb.y;
    return ab.x - bb.x;
  });

  var mainIdToIndex = {};
  for (var i = 0; i < mainNodes.length; i++) {
    mainIdToIndex[mainNodes[i].id] = i;
  }

  // ── Build flow nodes (sync pass) ──────────────────────────────────────────
  var flowNodes = mainNodes.map(function(node, idx) {
    var id = 'n' + (idx + 1);
    var text = extractText(node);
    var bb = node.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 };

    // Outgoing connectors from this main node
    var outgoing = connectors.filter(function(c) {
      return connectorFromId(c) === node.id;
    });

    // ── CTA detection: arrows first, then spatial fallback ────────────────
    // FIX #1: combine arrow-connected AND spatially nearby green nodes
    var ctaTargetsById = {};
    var ctaTargets = [];

    // Pass 1: arrow-connected green nodes
    for (var i = 0; i < outgoing.length; i++) {
      var t = nodeMap[connectorToId(outgoing[i])];
      if (t && getNodeType(t) === 'cta_button') {
        if (!ctaTargetsById[t.id]) {
          ctaTargetsById[t.id] = true;
          ctaTargets.push(t);
        }
      }
    }

    // Pass 2: spatial green nodes not already found by arrows
    var spatialCtas = findSpatialCtaNodes(node, allCtaColorNodes);
    for (var i = 0; i < spatialCtas.length; i++) {
      var sc = spatialCtas[i];
      if (!ctaTargetsById[sc.id]) {
        ctaTargetsById[sc.id] = true;
        ctaTargets.push(sc);
      }
    }

    var hasCta = ctaTargets.length > 0;
    var ctaButtons = [];
    for (var i = 0; i < ctaTargets.length; i++) {
      var label = extractText(ctaTargets[i]);
      if (label !== '[EMPTY]') ctaButtons.push(label);
    }

    // ── Quiz detection ────────────────────────────────────────────────────
    var quizResult = detectQuizPattern(ctaTargets, connectors, nodeMap, mainIdToIndex);

    // ── Direct next (main→main via arrow) ─────────────────────────────────
    var directNext = [];
    for (var i = 0; i < outgoing.length; i++) {
      var t = nodeMap[connectorToId(outgoing[i])];
      if (!t || getNodeType(t) !== 'main_flow') continue;
      var connLabel = extractText(outgoing[i]);
      directNext.push({
        toIndex: mainIdToIndex[t.id],
        label: connLabel !== '[EMPTY]' ? connLabel : '',
      });
    }

    // ── CTA → next main nodes ─────────────────────────────────────────────
    // FIX #4: keep ALL branches, don't deduplicate by label
    var ctaNext = [];
    if (!quizResult.isQuiz) {
      for (var i = 0; i < ctaTargets.length; i++) {
        var ctaNode = ctaTargets[i];
        var ctaOut = connectors.filter(function(c) {
          return connectorFromId(c) === ctaNode.id;
        });
        for (var j = 0; j < ctaOut.length; j++) {
          var t = nodeMap[connectorToId(ctaOut[j])];
          if (!t || getNodeType(t) !== 'main_flow') continue;
          ctaNext.push({
            toIndex: mainIdToIndex[t.id],
            label: extractText(ctaNode) !== '[EMPTY]' ? extractText(ctaNode) : '',
            ctaIndex: i, // which button triggered this
          });
        }
      }
    }

    // ── Edge cases ────────────────────────────────────────────────────────
    var edgeCases = [];

    // From main node directly
    for (var i = 0; i < outgoing.length; i++) {
      var t = nodeMap[connectorToId(outgoing[i])];
      if (!t) continue;
      var ec = parseEdgeCase(t, id, edgeCases.length + 1);
      if (ec) edgeCases.push(ec);
    }

    // From CTA buttons
    for (var i = 0; i < ctaTargets.length; i++) {
      var ctaNode = ctaTargets[i];
      var ctaOut = connectors.filter(function(c) {
        return connectorFromId(c) === ctaNode.id;
      });
      for (var j = 0; j < ctaOut.length; j++) {
        var t = nodeMap[connectorToId(ctaOut[j])];
        if (!t) continue;
        var ec = parseEdgeCase(t, id, edgeCases.length + 1);
        if (!ec) continue;
        var dupe = false;
        for (var k = 0; k < edgeCases.length; k++) {
          if (edgeCases[k].text === ec.text) { dupe = true; break; }
        }
        if (!dupe) edgeCases.push(ec);
      }
    }

    // ── noResponseNext ────────────────────────────────────────────────────
    var noResponseNext = null;
    for (var i = 0; i < edgeCases.length; i++) {
      if (edgeCases[i].type !== 'no_response') continue;
      var noRespNode = nodeMap[edgeCases[i].nodeId];
      if (!noRespNode) continue;
      var noRespOut = connectors.filter(function(c) {
        return connectorFromId(c) === noRespNode.id;
      });
      for (var j = 0; j < noRespOut.length; j++) {
        var t = nodeMap[connectorToId(noRespOut[j])];
        if (t && getNodeType(t) === 'main_flow') {
          noResponseNext = mainIdToIndex[t.id];
          break;
        }
      }
      break;
    }

    // ── Combine next — FIX #4: keep all unique toIndex entries ────────────
    var seenToIndex = {};
    var next = [];
    var combined = directNext.concat(ctaNext);

    if (quizResult.isQuiz && quizResult.quizNextIndex !== null) {
      combined = [{ toIndex: quizResult.quizNextIndex, label: '' }];
    }

    for (var i = 0; i < combined.length; i++) {
      // Key on toIndex only — keep first occurrence per destination
      // but DON'T drop entries just because label is the same
      var toIdx = combined[i].toIndex;
      if (toIdx === undefined || toIdx === null) continue;
      if (!seenToIndex[toIdx]) {
        seenToIndex[toIdx] = true;
        next.push(combined[i]);
      }
    }

    return {
      id: id,
      figmaId: node.id,
      index: idx,
      x: bb.x,
      y: bb.y,
      text: text,
      kind: hasCta ? 'cta' : 'message',
      isQuiz: quizResult.isQuiz,
      quizResponses: quizResult.quizResponses,
      buttons: ctaButtons,
      edgeCases: edgeCases,
      noResponseNext: noResponseNext,
      next: next,
      imageData: null,
      _imgNode: null,  // filled by assignImagesToNodes
      _bb: bb,         // temp for image assignment
    };
  });

  // ── Spatial fallback for nodes with no next ───────────────────────────────
  for (var i = 0; i < flowNodes.length; i++) {
    var node = flowNodes[i];
    if (node.next.length === 0 && node.noResponseNext === null) {
      var best = null;
      var bestDy = Infinity;
      for (var j = 0; j < flowNodes.length; j++) {
        var other = flowNodes[j];
        if (other.index === node.index) continue;
        var dy = other.y - node.y;
        var dx = Math.abs(other.x - node.x);
        if (dy > 10 && dy < bestDy && dx < 500) {
          bestDy = dy;
          best = other;
        }
      }
      if (best) node.next.push({ toIndex: best.index, label: '' });
    }
  }

  // ── FIX #2 + #5: assign images with claim tracking ───────────────────────
  assignImagesToNodes(flowNodes, allImageCandidates);

  // ── Async image export pass ───────────────────────────────────────────────
  var imageCount = 0;
  for (var i = 0; i < flowNodes.length; i++) {
    var fn = flowNodes[i];
    if (fn._imgNode) {
      figma.ui.postMessage({
        type: 'parse-progress',
        text: 'Exporting image ' + (imageCount + 1) + '...',
      });
      var b64 = await exportNodeAsBase64(fn._imgNode);
      if (b64) {
        fn.imageData = b64;
        imageCount++;
      }
    }
    delete fn._imgNode;
    delete fn._bb;
  }

  // ── Strip empty phantom nodes ─────────────────────────────────────────────
  // Remove nodes that have no text, no buttons, no image — they are ghost
  // shapes on the canvas (e.g. sticky notes, annotation boxes, frames).
  var validNodes = flowNodes.filter(function(n) {
    var hasText    = n.text && n.text !== '[EMPTY]' && n.text.trim().length > 0;
    var hasButtons = n.buttons && n.buttons.length > 0;
    var hasImage   = !!n.imageData;
    return hasText || hasButtons || hasImage;
  });

  // Re-index: build old index → new index map, update all next[] references
  var oldToNew = {};
  for (var i = 0; i < validNodes.length; i++) {
    oldToNew[validNodes[i].index] = i;
    validNodes[i].index = i;
  }

  // Remap next[], noResponseNext, edgeCase autoIdx
  for (var i = 0; i < validNodes.length; i++) {
    var vn = validNodes[i];
    var remappedNext = [];
    for (var j = 0; j < (vn.next || []).length; j++) {
      var oldIdx = vn.next[j].toIndex;
      if (oldToNew[oldIdx] !== undefined) {
        remappedNext.push({ toIndex: oldToNew[oldIdx], label: vn.next[j].label || '' });
      }
    }
    vn.next = remappedNext;

    if (vn.noResponseNext !== null && vn.noResponseNext !== undefined) {
      vn.noResponseNext = oldToNew[vn.noResponseNext] !== undefined ? oldToNew[vn.noResponseNext] : null;
    }

    for (var j = 0; j < (vn.edgeCases || []).length; j++) {
      var ec = vn.edgeCases[j];
      if (ec.autoIdx !== undefined && oldToNew[ec.autoIdx] !== undefined) {
        ec.autoIdx = oldToNew[ec.autoIdx];
      }
    }
  }

  // Find start: first node that is topmost (already sorted top→bottom)
  var startIndex = 0;

  figma.ui.postMessage({
    type: 'parse-progress',
    text: 'Done! ' + validNodes.length + ' nodes (' + (flowNodes.length - validNodes.length) + ' empty stripped), ' + imageCount + ' images.',
  });

  return {
    nodes: validNodes,
    startIndex: startIndex,
    meta: {
      totalMain: mainNodes.length,
      totalCta: allCtaColorNodes.length,
      totalConnectors: connectors.length,
      totalImages: imageCount,
    },
  };
}

// ─── MESSAGE HANDLERS ─────────────────────────────────────────────────────────
figma.ui.onmessage = function(msg) {
  if (msg.type === 'parse-canvas') {
    figma.ui.postMessage({ type: 'parse-progress', text: 'Parsing canvas...' });
    parseCanvas().then(function(flow) {
      figma.ui.postMessage({ type: 'flow-data', flow: flow });
    }).catch(function(e) {
      figma.ui.postMessage({ type: 'parse-error', error: String(e) });
    });
  }
  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

// Auto-parse on open
figma.ui.postMessage({ type: 'parse-progress', text: 'Parsing canvas...' });
parseCanvas().then(function(flow) {
  figma.ui.postMessage({ type: 'flow-data', flow: flow });
}).catch(function(e) {
  figma.ui.postMessage({ type: 'parse-error', error: String(e) });
});
