var myWorker = new Worker("cache_size_worker.js");

var table = $("<table/>").appendTo("#target");

var current_row = null;
var last_for_stride = {};

function formatSize(s) {
  var sizes = ["", "k", "M"];
  var i = 0;
  while (s >= 1024) {
    s = Math.floor(s / 1024);
    i++;
  }
  return s + sizes[i];
}

// Handle various message from the web worker by drawing new DOM
// I should feel bad about this terrible DOM manipulation with jQuery
// But I really don't.
myWorker.onmessage = function(m) {
  if (m.data.type == "head") {
    var row = $("<tr/>").appendTo(table);
    row.append($("<th/>").text("size \\ stride"));
    m.data.headers.forEach(function(e) {
      $("<th/>").text(formatSize(e)).appendTo(row);
    });
  } else if (m.data.type == "start_row") {
    current_row = $("<tr/>").appendTo(table);
    current_row.append($("<td/>").text(formatSize(m.data.size)));
  } else if (m.data.type == "measurement") {
    var last = last_for_stride.hasOwnProperty(m.data.stride) ? last_for_stride[m.data.stride] : m.data.time;
    var diff = m.data.time - last;
    var pct_change = diff / last * 100;
    var diff_s = ((diff > 0) ? ("+") : "") + pct_change.toFixed(2);
    var new_el = $("<td/>")
        .addClass("stride_" + m.data.stride)
        .data("time", m.data.time)
        .data("diff", diff)
        .data("pct_change", pct_change);
    if (m.data.time == m.data.time) { // not NaN
        new_el.text(m.data.time.toFixed(4));
    }
    if (pct_change == pct_change && pct_change != 0) { // not nan
        new_el.append($("<small/>").text(" (" + diff_s + "%)"));
    }
    last_for_stride[m.data.stride] = m.data.time;
    current_row.append(new_el);
  } else if (m.data.type == "done") {
    var strides = Object.keys(last_for_stride), i;
    for (i = 0; i < strides.length; i++) {
      var els = $(".stride_" + strides[i]).get();
      els = els.map($).filter(function(a) {
        return a.text();
      }).sort(function(a, b) {
        return a.data("pct_change") - b.data("pct_change");
      });
      els.forEach(function(x, i, a) {
        // Parameters were pulled out of my ass
        // seemed to work well on my test machines ¯\_(ツ)_/¯
        if (i < a.length - 4) { return; }
        var color = Math.floor(255 * (1 - Math.pow(i/a.length, 3)));
        x.css("border-top", "4px solid rgb(255, " + color + "," + color + ")");
        x.css("font-weight", "bold");
      });
    }
    $("<p>").text("Large relative changes (indicated in red) incidate likely cache size boundaries").insertAfter(table);
  } else {
    console.log(m.data);
  }
};
