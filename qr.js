/* QR code SVG helper — thin wrapper around qrcodegen (Project Nayuki, MIT) */
var QR = {
    toSVG: function(text, size) {
        size = size || 200;
        var QRC = qrcodegen.QrCode;
        var qr = QRC.encodeText(text, QRC.Ecc.LOW);
        var s = qr.size;
        var quiet = 4;
        var total = s + quiet * 2;
        var parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
            total + ' ' + total + '" width="' + size + '" height="' + size +
            '" shape-rendering="crispEdges">'];
        var d = '';
        for (var r = 0; r < s; r++) {
            for (var c = 0; c < s; c++) {
                if (qr.getModule(c, r)) {
                    d += 'M' + (c + quiet) + ',' + (r + quiet) + 'h1v1h-1z';
                }
            }
        }
        if (d) parts.push('<path d="' + d + '" fill="#000"/>');
        parts.push('</svg>');
        return parts.join('');
    }
};
