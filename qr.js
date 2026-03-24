var QR = (function() {
  'use strict';

  // GF(256) log/exp tables, generator polynomial 0x11D
  var EXP = new Uint8Array(256), LOG = new Uint8Array(256);
  (function() {
    var v = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = v;
      LOG[v] = i;
      v <<= 1;
      if (v >= 256) v ^= 0x11D;
    }
    EXP[255] = EXP[0];
    LOG[0] = 255; // undefined, but useful sentinel
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[(LOG[a] + LOG[b]) % 255];
  }

  // Generate RS generator polynomial of given degree
  function rsGenPoly(degree) {
    var poly = new Uint8Array(degree + 1);
    poly[0] = 1;
    for (var i = 0; i < degree; i++) {
      var root = EXP[i];
      for (var j = i + 1; j >= 1; j--) {
        poly[j] = poly[j - 1] ^ gfMul(poly[j], root);
      }
      poly[0] = gfMul(poly[0], root);
    }
    return poly;
  }

  // Reed-Solomon: compute EC codewords for data
  function rsEncode(data, ecCount) {
    var gen = rsGenPoly(ecCount);
    var rem = new Uint8Array(ecCount);
    for (var i = 0; i < data.length; i++) {
      var coef = data[i] ^ rem[ecCount - 1];
      for (var j = ecCount - 1; j >= 1; j--) {
        rem[j] = rem[j - 1] ^ gfMul(gen[j], coef);
      }
      rem[0] = gfMul(gen[0], coef);
    }
    // Reverse so highest degree first
    var result = new Uint8Array(ecCount);
    for (var k = 0; k < ecCount; k++) result[k] = rem[ecCount - 1 - k];
    return result;
  }

  // Version tables for EC level L, byte mode
  var CAPACITIES = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];

  var EC_BLOCKS = [
    null,
    { blocks: [{count:1, dc:19}], ec:7 },
    { blocks: [{count:1, dc:34}], ec:10 },
    { blocks: [{count:1, dc:55}], ec:15 },
    { blocks: [{count:1, dc:80}], ec:20 },
    { blocks: [{count:1, dc:108}], ec:26 },
    { blocks: [{count:2, dc:68}], ec:18 },
    { blocks: [{count:2, dc:78}], ec:20 },
    { blocks: [{count:2, dc:97}], ec:24 },
    { blocks: [{count:2, dc:116}], ec:30 },
    { blocks: [{count:2, dc:68}, {count:2, dc:69}], ec:18 }
  ];

  var ALIGNMENT = [
    null, null,
    [6,18], [6,22], [6,26], [6,30], [6,34],
    [6,22,38], [6,24,42], [6,26,46], [6,28,50]
  ];

  function selectVersion(dataLen) {
    for (var v = 1; v <= 10; v++) {
      if (dataLen <= CAPACITIES[v]) return v;
    }
    return -1;
  }

  // Encode data in byte mode, return array of data codewords (padded)
  function encodeData(text, version) {
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x80) {
        bytes.push(c);
      } else if (c < 0x800) {
        bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      } else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) {
        var lo = text.charCodeAt(++i);
        var cp = ((c - 0xD800) << 10) + (lo - 0xDC00) + 0x10000;
        bytes.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F),
                   0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
      } else {
        bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }

    var ecInfo = EC_BLOCKS[version];
    var totalDC = 0;
    for (var b = 0; b < ecInfo.blocks.length; b++) {
      totalDC += ecInfo.blocks[b].count * ecInfo.blocks[b].dc;
    }

    // Build bit stream
    var bits = [];
    function pushBits(val, len) {
      for (var j = len - 1; j >= 0; j--) bits.push((val >> j) & 1);
    }
    // Mode indicator: byte = 0100
    pushBits(4, 4);
    // Character count: 8 bits for v1-9, 16 bits for v10+
    var ccBits = version <= 9 ? 8 : 16;
    pushBits(bytes.length, ccBits);
    // Data
    for (var d = 0; d < bytes.length; d++) pushBits(bytes[d], 8);
    // Terminator (up to 4 zeros)
    var totalBits = totalDC * 8;
    var termLen = Math.min(4, totalBits - bits.length);
    for (var t = 0; t < termLen; t++) bits.push(0);
    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);
    // Pad codewords
    var padBytes = [0xEC, 0x11];
    var pi = 0;
    while (bits.length < totalBits) {
      pushBits(padBytes[pi], 8);
      pi ^= 1;
    }

    var codewords = new Uint8Array(totalDC);
    for (var k = 0; k < totalDC; k++) {
      var val = 0;
      for (var bi = 0; bi < 8; bi++) val = (val << 1) | bits[k * 8 + bi];
      codewords[k] = val;
    }
    return codewords;
  }

  // Interleave data and EC codewords across blocks
  function interleave(data, version) {
    var ecInfo = EC_BLOCKS[version];
    var ecPerBlock = ecInfo.ec;
    var blocksDef = ecInfo.blocks;

    // Split data into blocks and compute EC for each
    var dataBlocks = [], ecBlocks = [];
    var offset = 0;
    for (var g = 0; g < blocksDef.length; g++) {
      for (var b = 0; b < blocksDef[g].count; b++) {
        var dc = blocksDef[g].dc;
        var blockData = data.slice(offset, offset + dc);
        offset += dc;
        dataBlocks.push(blockData);
        ecBlocks.push(rsEncode(blockData, ecPerBlock));
      }
    }

    // Interleave data codewords
    var result = [];
    var maxDC = 0;
    for (var i = 0; i < dataBlocks.length; i++) {
      if (dataBlocks[i].length > maxDC) maxDC = dataBlocks[i].length;
    }
    for (var col = 0; col < maxDC; col++) {
      for (var row = 0; row < dataBlocks.length; row++) {
        if (col < dataBlocks[row].length) result.push(dataBlocks[row][col]);
      }
    }
    // Interleave EC codewords
    for (var col2 = 0; col2 < ecPerBlock; col2++) {
      for (var row2 = 0; row2 < ecBlocks.length; row2++) {
        result.push(ecBlocks[row2][col2]);
      }
    }
    return result;
  }

  // Matrix construction
  function createMatrix(version) {
    var size = version * 4 + 17;
    var matrix = [];
    var reserved = [];
    for (var r = 0; r < size; r++) {
      matrix[r] = new Int8Array(size); // 0=white, 1=black, unset=0
      reserved[r] = new Uint8Array(size); // 1=function pattern
    }
    return { matrix: matrix, reserved: reserved, size: size };
  }

  function setModule(m, row, col, val) {
    m.matrix[row][col] = val ? 1 : 0;
    m.reserved[row][col] = 1;
  }

  function placeFinderPattern(m, row, col) {
    for (var dr = -1; dr <= 7; dr++) {
      for (var dc = -1; dc <= 7; dc++) {
        var r = row + dr, c = col + dc;
        if (r < 0 || r >= m.size || c < 0 || c >= m.size) continue;
        var inOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        var inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        var inSep = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        setModule(m, r, c, (inOuter || inInner) && !inSep);
      }
    }
  }

  function placeAlignmentPattern(m, row, col) {
    for (var dr = -2; dr <= 2; dr++) {
      for (var dc = -2; dc <= 2; dc++) {
        var isEdge = Math.abs(dr) === 2 || Math.abs(dc) === 2;
        var isCenter = dr === 0 && dc === 0;
        setModule(m, row + dr, col + dc, isEdge || isCenter);
      }
    }
  }

  function placeTimingPatterns(m) {
    for (var i = 8; i < m.size - 8; i++) {
      var val = i % 2 === 0;
      if (!m.reserved[6][i]) setModule(m, 6, i, val);
      if (!m.reserved[i][6]) setModule(m, i, 6, val);
    }
  }

  function reserveFormatAreas(m) {
    // Around top-left finder
    for (var i = 0; i <= 8; i++) {
      if (!m.reserved[8][i]) m.reserved[8][i] = 1;
      if (!m.reserved[i][8]) m.reserved[i][8] = 1;
    }
    // Around top-right finder
    for (var j = m.size - 8; j < m.size; j++) {
      if (!m.reserved[8][j]) m.reserved[8][j] = 1;
    }
    // Around bottom-left finder
    for (var k = m.size - 7; k < m.size; k++) {
      if (!m.reserved[k][8]) m.reserved[k][8] = 1;
    }
    // Dark module
    setModule(m, m.size - 8, 8, 1);
  }

  function placeFunctionPatterns(m, version) {
    placeFinderPattern(m, 0, 0);
    placeFinderPattern(m, 0, m.size - 7);
    placeFinderPattern(m, m.size - 7, 0);
    placeTimingPatterns(m);

    if (version >= 2 && ALIGNMENT[version]) {
      var centers = ALIGNMENT[version];
      for (var i = 0; i < centers.length; i++) {
        for (var j = 0; j < centers.length; j++) {
          var r = centers[i], c = centers[j];
          // Skip if overlapping finder patterns
          if (r <= 8 && c <= 8) continue;
          if (r <= 8 && c >= m.size - 9) continue;
          if (r >= m.size - 9 && c <= 8) continue;
          placeAlignmentPattern(m, r, c);
        }
      }
    }

    reserveFormatAreas(m);
  }

  // Place data bits in serpentine pattern
  function placeDataBits(m, data) {
    var bitIdx = 0;
    var totalBits = data.length * 8;
    // Right-to-left column pairs, skipping column 6
    var col = m.size - 1;
    while (col >= 0) {
      if (col === 6) col--;
      var upward = ((m.size - 1 - col) >> 1) % 2 === 0;
      // Actually: determine direction based on column pair index
      // Column pairs from right: (size-1,size-2), (size-3,size-4), ...
      // Even pairs go upward, odd pairs go downward
      // But the standard pattern is: first pair goes up, next goes down, etc.
      for (var cnt = 0; cnt < m.size; cnt++) {
        var row = upward ? (m.size - 1 - cnt) : cnt;
        for (var dx = 0; dx <= 1; dx++) {
          var c = col - dx;
          if (c < 0) continue;
          if (m.reserved[row][c]) continue;
          if (bitIdx < totalBits) {
            var byteIdx = bitIdx >> 3;
            var bitPos = 7 - (bitIdx & 7);
            m.matrix[row][c] = (data[byteIdx] >> bitPos) & 1;
          }
          bitIdx++;
        }
      }
      col -= 2;
    }
  }

  // Mask patterns
  var MASKS = [
    function(r, c) { return (r + c) % 2 === 0; },
    function(r, c) { return r % 2 === 0; },
    function(r, c) { return c % 3 === 0; },
    function(r, c) { return (r + c) % 3 === 0; },
    function(r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function(r, c) { return ((r * c) % 2 + (r * c) % 3) === 0; },
    function(r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; },
    function(r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }
  ];

  function applyMask(m, maskIdx) {
    var fn = MASKS[maskIdx];
    for (var r = 0; r < m.size; r++) {
      for (var c = 0; c < m.size; c++) {
        if (!m.reserved[r][c]) {
          if (fn(r, c)) m.matrix[r][c] ^= 1;
        }
      }
    }
  }

  // Format info: EC level L = 01, mask pattern 3 bits
  // 15-bit format string with BCH(15,5) error correction
  function computeFormatBits(maskIdx) {
    var data = (0x01 << 3) | maskIdx; // EC level L = 01
    var bits = data << 10;
    // BCH division by generator 0x537
    var gen = 0x537;
    for (var i = 4; i >= 0; i--) {
      if (bits & (1 << (i + 10))) bits ^= gen << i;
    }
    bits = ((data << 10) | bits) ^ 0x5412; // XOR mask
    return bits;
  }

  function placeFormatInfo(m, maskIdx) {
    var bits = computeFormatBits(maskIdx);
    // Horizontal: left side of row 8
    var hPositions = [0,1,2,3,4,5,7,8,  // first 8 bits at cols 0-5,7,8
                      m.size-7,m.size-6,m.size-5,m.size-4,m.size-3,m.size-2,m.size-1]; // bits 7-14
    // Vertical: top side of col 8
    var vPositions = [m.size-1,m.size-2,m.size-3,m.size-4,m.size-5,m.size-6,m.size-7, // bits 0-6
                      8,7,5,4,3,2,1,0]; // bits 7-14

    for (var i = 0; i < 15; i++) {
      var bit = (bits >> i) & 1;
      // Horizontal strip (row 8)
      m.matrix[8][hPositions[i]] = bit;
      // Vertical strip (col 8)
      m.matrix[vPositions[i]][8] = bit;
    }
  }

  // Penalty scoring
  function computePenalty(m) {
    var penalty = 0;
    var size = m.size;

    // Rule 1: runs of same color (5+) in rows and columns
    for (var r = 0; r < size; r++) {
      var runLen = 1;
      for (var c = 1; c < size; c++) {
        if (m.matrix[r][c] === m.matrix[r][c - 1]) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += runLen - 2;
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += runLen - 2;
    }
    for (var c2 = 0; c2 < size; c2++) {
      var runLen2 = 1;
      for (var r2 = 1; r2 < size; r2++) {
        if (m.matrix[r2][c2] === m.matrix[r2 - 1][c2]) {
          runLen2++;
        } else {
          if (runLen2 >= 5) penalty += runLen2 - 2;
          runLen2 = 1;
        }
      }
      if (runLen2 >= 5) penalty += runLen2 - 2;
    }

    // Rule 2: 2x2 blocks of same color
    for (var r3 = 0; r3 < size - 1; r3++) {
      for (var c3 = 0; c3 < size - 1; c3++) {
        var v = m.matrix[r3][c3];
        if (v === m.matrix[r3][c3 + 1] && v === m.matrix[r3 + 1][c3] && v === m.matrix[r3 + 1][c3 + 1]) {
          penalty += 3;
        }
      }
    }

    // Rule 3: finder-like patterns (1:1:3:1:1 with 4 white)
    for (var r4 = 0; r4 < size; r4++) {
      for (var c4 = 0; c4 < size - 10; c4++) {
        var row = m.matrix[r4];
        if (row[c4] === 1 && row[c4+1] === 0 && row[c4+2] === 1 && row[c4+3] === 1 &&
            row[c4+4] === 1 && row[c4+5] === 0 && row[c4+6] === 1 &&
            row[c4+7] === 0 && row[c4+8] === 0 && row[c4+9] === 0 && row[c4+10] === 0) {
          penalty += 40;
        }
        if (row[c4] === 0 && row[c4+1] === 0 && row[c4+2] === 0 && row[c4+3] === 0 &&
            row[c4+4] === 1 && row[c4+5] === 0 && row[c4+6] === 1 && row[c4+7] === 1 &&
            row[c4+8] === 1 && row[c4+9] === 0 && row[c4+10] === 1) {
          penalty += 40;
        }
      }
    }
    for (var c5 = 0; c5 < size; c5++) {
      for (var r5 = 0; r5 < size - 10; r5++) {
        if (m.matrix[r5][c5] === 1 && m.matrix[r5+1][c5] === 0 && m.matrix[r5+2][c5] === 1 &&
            m.matrix[r5+3][c5] === 1 && m.matrix[r5+4][c5] === 1 && m.matrix[r5+5][c5] === 0 &&
            m.matrix[r5+6][c5] === 1 && m.matrix[r5+7][c5] === 0 && m.matrix[r5+8][c5] === 0 &&
            m.matrix[r5+9][c5] === 0 && m.matrix[r5+10][c5] === 0) {
          penalty += 40;
        }
        if (m.matrix[r5][c5] === 0 && m.matrix[r5+1][c5] === 0 && m.matrix[r5+2][c5] === 0 &&
            m.matrix[r5+3][c5] === 0 && m.matrix[r5+4][c5] === 1 && m.matrix[r5+5][c5] === 0 &&
            m.matrix[r5+6][c5] === 1 && m.matrix[r5+7][c5] === 1 && m.matrix[r5+8][c5] === 1 &&
            m.matrix[r5+9][c5] === 0 && m.matrix[r5+10][c5] === 1) {
          penalty += 40;
        }
      }
    }

    // Rule 4: proportion of dark modules
    var dark = 0;
    for (var r6 = 0; r6 < size; r6++) {
      for (var c6 = 0; c6 < size; c6++) {
        if (m.matrix[r6][c6]) dark++;
      }
    }
    var total = size * size;
    var pct = (dark * 100 / total);
    var prev5 = Math.floor(pct / 5) * 5;
    var next5 = prev5 + 5;
    penalty += Math.min(Math.abs(prev5 - 50) / 5, Math.abs(next5 - 50) / 5) * 10;

    return penalty;
  }

  // Deep copy matrix for mask testing
  function cloneMatrix(m) {
    var copy = { matrix: [], reserved: m.reserved, size: m.size };
    for (var r = 0; r < m.size; r++) {
      copy.matrix[r] = new Int8Array(m.matrix[r]);
    }
    return copy;
  }

  function toSVG(text, size) {
    size = size || 200;
    // UTF-8 encode for byte count
    var byteLen = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x80) byteLen++;
      else if (c < 0x800) byteLen += 2;
      else if (c >= 0xD800 && c <= 0xDBFF) { byteLen += 4; i++; }
      else byteLen += 3;
    }

    var version = selectVersion(byteLen);
    if (version < 0) throw new Error('Data too long for QR versions 1-10');

    var data = encodeData(text, version);
    var interleaved = interleave(data, version);
    var m = createMatrix(version);
    placeFunctionPatterns(m, version);
    placeDataBits(m, interleaved);

    // Try all 8 masks, pick lowest penalty
    var bestMask = 0, bestPenalty = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var test = cloneMatrix(m);
      applyMask(test, mask);
      placeFormatInfo(test, mask);
      var p = computePenalty(test);
      if (p < bestPenalty) {
        bestPenalty = p;
        bestMask = mask;
      }
    }

    applyMask(m, bestMask);
    placeFormatInfo(m, bestMask);

    // Render SVG
    var modSize = m.size;
    var quiet = 4;
    var total = modSize + quiet * 2;
    var parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total +
                 '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges">'];
    var d = '';
    for (var r = 0; r < modSize; r++) {
      for (var cc = 0; cc < modSize; cc++) {
        if (m.matrix[r][cc]) {
          d += 'M' + (cc + quiet) + ',' + (r + quiet) + 'h1v1h-1z';
        }
      }
    }
    if (d) parts.push('<path d="' + d + '" fill="#000"/>');
    parts.push('</svg>');
    return parts.join('');
  }

  return { toSVG: toSVG };
})();
