let perfDom = document.getElementById('perf');
let ioDom = document.getElementById('io');
let perfChart, ioChart;
window.addEventListener("resize", function() {
  perfChart && perfChart.resize();
  ioChart && ioChart.resize();
})

$(".button-group > div").click(function() {
  $(".button-group > div").removeClass('selected');
  $(this).addClass('selected');
  $(".pages > div").removeClass('use');
  $(`.pages > div.${$(this).attr('for')}`).addClass('use');
})

$(".code-title .top").click(() => {
  let u = $(".code-block").offset().top + $(".code-block table").height() + 24;
  $("body").scrollTop(u);
})

function hex2str(hex) {
  let ret = '';
  for (let i = 0; i < hex.length; i += 2)
    ret += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  return ret;
}

const usePerf = (t) => {
  if (perfChart)
    perfChart.dispose();
  if (!t) {
    $(".perf-title").addClass('unuse');
    $(".perf-box").addClass('unuse');
  } else {
    $(".perf-title").removeClass('unuse');
    $(".perf-box").removeClass('unuse');
  }
}
const useIO = (t) => {
  if (ioChart)
    ioChart.dispose();
  if (!t) {
    $(".io-title").addClass('unuse');
    $(".io-box").addClass('unuse');
  } else {
    $(".io-title").removeClass('unuse');
    $(".io-box").removeClass('unuse');
  }
}
const useProf = (t) => {
  $(".code-block").addClass('unuse');
  if (!t) {
    $(".prof-title").addClass('unuse');
    $(".prof-box").addClass('unuse');
  } else {
    $(".prof-title").removeClass('unuse');
    $(".prof-box").removeClass('unuse');
  }
}

const byteConvert = function(bytes) {
  if (isNaN(bytes)) {
    return '';
  }
  let symbols = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  let exp = Math.floor(Math.log(bytes) / Math.log(2));
  if (exp < 1) {
    exp = 0;
  }
  let i = Math.floor(exp / 10);
  bytes = bytes / Math.pow(2, 10 * i);

  if (bytes.toString().length > bytes.toFixed(2).toString().length) {
    bytes = bytes.toFixed(2);
  }
  return bytes + ' ' + symbols[i];
}

function htmlEncode(str) {
  var s = "";
  if (str.length == 0) return "";
  s = str.replace(/&/g, "&amp;");
  s = s.replace(/</g, "&lt;");
  s = s.replace(/>/g, "&gt;");
  s = s.replace(/ /g, "&nbsp;");
  s = s.replace(/\'/g, "&#39;");
  s = s.replace(/\"/g, "&quot;");
  s = s.replace(/\n/g, "<br/>");
  s = s.replace(/\\/g, "\\\\");
  return s;
}
const manageProfile = (prof, codes) => {

  const funcMark = {};
  const estimatedDir = [];
  const codeToCov = {};
  const funcCaller = {};
  const funcCallTo = {};
  const lineToTime = {};
  const funcLineToTime = {};
  const funcToLine = {};
  for (let i = 0; i < prof[0].length; i++)
    funcMark[prof[0][i].n] = i, estimatedDir.push(undefined);
  for (let i = 0; i < prof[1].length; i++) {
    let s = prof[1][i];
    if (funcMark[s.n] !== undefined && s.c > 0)
      estimatedDir[funcMark[s.n]] = [s.p[0], s.p[1], s.l]
    if (lineToTime[JSON.stringify([s.p[1], s.l])] === undefined)
      lineToTime[JSON.stringify([s.p[1], s.l])] = 0;
    lineToTime[JSON.stringify([s.p[1], s.l])] += s.s
    funcLineToTime[JSON.stringify([s.n, s.l])] = s.s
  }


  const funcToDemang = {};
  for (let i = 0; i < prof[4].length; i++) {
    codeToCov[prof[4][i].n] = prof[4][i];
    for (let j = 0; j < prof[4][i].f.length; j++) {
      funcToLine[prof[4][i].f[j].demangled_name] = prof[4][i].f[j].start_line
      funcToDemang[prof[4][i].f[j].name] = prof[4][i].f[j].demangled_name
      if (!funcMark[prof[4][i].f[j].demangled_name]) {
        funcMark[prof[4][i].f[j].demangled_name] = estimatedDir.length;
        estimatedDir.push(undefined);
      }
      if (estimatedDir[funcMark[prof[4][i].f[j].demangled_name]] === undefined)
        estimatedDir[funcMark[prof[4][i].f[j].demangled_name]] = [true, prof[4][i].n, prof[4][i].f[j].start_line]
    }
  }

  for (let i = 0; i < prof[3].length; i++) {
    prof[3][i].p.forEach((value, index) => {
      let val = JSON.stringify([value.n, value.l])
      if (funcCallTo[val] === undefined)
        funcCallTo[val] = [];
      funcCallTo[val].push([i, index]);
    })
  }

  for (let i = 0; i < prof[2].length; i++) {
    let s = prof[2][i].s;
    if (funcMark[s.n] && estimatedDir[funcMark[s.n]])
      funcCaller[s.n] = i;
  }

  $(".funcs-page tbody").html('');
  $(".lines-page tbody").html('');
  $(".codes-page > table tbody").html('');

  const getLoc = (x) => {
    if (x === undefined)
      return '?';
    if (x[0])
      return `<a href='javascript:window.jumpCode("${htmlEncode(x[1])}", ${x[2]})'>${x[1]}:${x[2]}</a>`;
    else
      return `${x[1]}:${x[2]}`
  }

  const getFuncLink = (x, f) => {
    if (x === undefined || !x[0])
      return '';
    return `<div class='sub-link'><a href='javascript:window.jumpFunction("${htmlEncode(x[1])}", "${htmlEncode(f)}")'>#</a></div>`
  }

  const getFuncLinkShort = (x, f) => {
    if (x === undefined || !x[0])
      return '';
    return `<a href='javascript:window.jumpFunction("${htmlEncode(x[1])}", "${htmlEncode(f)}")'>定位</a>`
  }

  for (let i = 0; i < prof[0].length; i++)
    $(".funcs-page tbody").append(`
      <tr>
        <td style='text-align: right; min-width: 50px'>${(prof[0][i].s * 1000).toFixed(0)} ms</td>
        <td style='text-align: left'>${prof[0][i].n}</td>
        <td style='text-align: center'>${prof[0][i].c <= 0 ? '' : prof[0][i].c}</td>
        <td style='text-align: left'>${getLoc(estimatedDir[i])}</td>
        <td style='text-align: center'>${getFuncLinkShort(estimatedDir[i], prof[0][i].n)}</td>
      </tr>
    `)
  for (let i = 0; i < prof[1].length; i++)
    $(".lines-page tbody").append(`
      <tr>
        <td style='text-align: right; min-width: 50px'>${(prof[1][i].s * 1000).toFixed(0)} ms</td>
        <td style='text-align: left'>${prof[1][i].n}</td>
        <td style='text-align: center'>${prof[1][i].c <= 0 ? '' : prof[1][i].c}</td>
        <td style='text-align: left'>${getLoc([...prof[1][i].p, prof[1][i].l])}</td>
      </tr>
    `)
  for (let i = 0; i < codes.length; i++) {
    let len = codes[i][1].replace(/[^0x00-0xff]/g, 'xx').length;
    $(".codes-page > table tbody").append(`
      <tr>
        <td>${codes[i][0]}</td>
        <td style='text-align: center'>${byteConvert(len)}（${len} 字节）</td>
        <td style='text-align: center'><a href="javascript:window.openCode(${i})">打开</a></td>
      </tr>
    `)
  }

  window.openCode = (id, index = -1) => {
    $(".code-tip").removeClass('use');
    $(".code-block").removeClass('unuse');
    const cov = codeToCov[codes[id][0]];
    $(".code-block tbody").html('');
    if (cov !== undefined)
      for (let i = 0; i < cov.f.length; i++) {
        $(".code-block tbody").append(`
          <tr>
            <td>${cov.f[i].demangled_name}</td>
            <td style='text-align: center'>${cov.f[i].blocks}</td>
            <td style='text-align: center'>${cov.f[i].blocks_executed}</td>
            <td style='text-align: center'>${cov.f[i].execution_count}</td>
            <td style='text-align: center'><a href="javascript:window.openCode(${id}, ${i})">显示</a></td>
          </tr>
        `)
      }
    $(".code-block tbody").append(`
      <tr>
        <td>全部</td>
        <td style='text-align: center'></td>
        <td style='text-align: center'></td>
        <td style='text-align: center'></td>
        <td style='text-align: center'><a href="javascript:window.openCode(${id}, -1)">显示</a></td>
      </tr>
    `);
    let bg = [],
      tm = [],
      ln = [],
      rt = []
    let codeView = codes[id][1].split('\n')

    const calcAlpha = (x) => {
      if (x === 0)
        return 0;
      return Math.max(x, 0.1);
    }

    if (index === -1) {
      $(".code-title .data").text(codes[id][0]);
      const lineToId = {};
      let max_call = 0;
      for (let i = 0; i < cov.l.length; i++) {
        const L = cov.l[i];
        let lid = L.line_number;
        if (lineToId[lid] === undefined)
          lineToId[lid] = [0, []];
        max_call = Math.max(max_call, lineToId[lid][0] += L.count);
        lineToId[lid][1].push(i);
      }
      for (let i = 1; i <= codeView.length; i++) {
        let rtd = lineToTime[JSON.stringify([codes[id][0], i])];
        if (lineToId[i] === undefined)
          tm.push(`<div class='empty'>-</div>`);
        else if (lineToId[i][0] === 0)
          tm.push(`<div class='idle'>${lineToId[i][0]}</div>`);
        else if (lineToId[i][1].length === 1)
          tm.push(`<div class='normal' data-line='${i}' data-func-id='${index}'>${lineToId[i][0]}</div>`);
        else
          tm.push(`<div class='conflict' data-line='${i}' data-func-id='${index}'>${lineToId[i][0]}</div>`);
        bg.push(`<div data-line='${i}' style='background: rgba(253, 230, 138, ${calcAlpha((lineToId[i] == undefined ? 0 : lineToId[i][0]) / max_call * 0.4)})'></div>`)
        ln.push(`<div data-line='${i}'>${i}</div>`)
        rt.push(`<div>${rtd === undefined ? '~' : (rtd * 1000).toFixed(0) + 'ms'}</div>`)
      }
      $(".code-container code").attr('class', 'language-cpp').text(codes[id][1])
      $(".code-container .back").html(bg.join(''));
      $(".code-container .times").html(tm.join(''));
      $(".code-container .lines").html(ln.join(''));
      $(".code-container .runtime").html(rt.join(''));
      $('.code-container .times .normal, .code-container .times .conflict').unbind('click').click(function() {
        let dl = Number($(this).attr('data-line'))
        $(".code-container .back .line-mark").removeClass('line-mark')
        $(`.code-container .back [data-line=${dl}]`).addClass('line-mark')

        $(".code-title .data").text(codes[id][0] + ':' + dl);
        $('.code-title').addClass('use')
        let ids = lineToId[dl][1];
        const ps = {};
        ids.forEach((value) => {
          let fn = cov.l[value];
          if (fn.function_name !== undefined)
            ps[funcToDemang[fn.function_name]] = fn;
        })
        let html = '';
        for (let fn in ps)
          if (ps.hasOwnProperty(fn)) {
            const ftime = funcLineToTime[JSON.stringify([fn, dl])]
            const dt = ps[fn];
            let fcid = funcToLine[fn] !== dl ? undefined : funcCaller[fn];
            const fc = fcid === undefined ? {
              p: []
            } : (prof[2][fcid]);
            let fmid = funcMark[fn];
            const dir = fmid === undefined ? undefined : estimatedDir[fmid];
            let ctid = JSON.stringify([fn, dl]);
            const fct = funcCallTo[ctid] === undefined ? [] : funcCallTo[ctid];
            html += `<div class='_func'><div class='func-name'>${fn}<div class='sub-link'>${getLoc(dir)}</div>${getFuncLink(dir, fn)}</div><div class='call-time'>${dt.count} 次 (${ftime === undefined ? '-' : (ftime * 1000).toFixed(0)}ms)</div></div>`;
            fc.p.forEach((value) => {
              html += `<div class='_func func-called'><div class='func-name'>${value.n}<div class='sub-link'>${getLoc(estimatedDir[funcMark[value.n]])}</div>${getFuncLink(estimatedDir[funcMark[value.n]], value.n)}</div><div class='call-time'>${value.c} 次 (${(value.t * 1000).toFixed(0)}ms / ${(value.d * 1000).toFixed(0)}ms)</div></div>`
            })
            fct.forEach((idx) => {
              let value = prof[3][idx[0]].s;
              html += `<div class='_func func-calls'><div class='func-name'>${value.n}<div class='sub-link'>${getLoc(estimatedDir[funcMark[value.n]])}</div>${getFuncLink(estimatedDir[funcMark[value.n]], value.n)}</div><div class='call-time'>${prof[3][idx[0]].p[idx[1]].c} 次 (${(prof[3][idx[0]].p[idx[1]].t * 1000).toFixed(0)}ms / ${(prof[3][idx[0]].p[idx[1]].d * 1000).toFixed(0)}ms)</div></div>`;
            })
          }
        if (html === '')
          html += '在 gprof 中没有调用信息。'
        html += `<div class='code-table-footer'><a href="javascript:window.clearLineTable()">关闭</a></div>`
        $(".code-title .code-tip").addClass('use').html(html);
        let u = $(".code-container code").offset().top + (dl - 1) * 18.2 - $(".code-title").height() + 11;
        $("body").scrollTop(Math.min($("body").scrollTop(), u))
      })

      window.clearLineTable = () => {
        $(".code-title .code-tip").removeClass('use');
        $(".code-title .data").text(codes[id][0]);
        $(".code-container .back .line-mark").removeClass('line-mark')
      }
    } else {
      $(".code-title .data").text(cov.f[index].demangled_name + ' @ ' + codes[id][0]);
      const lineToId = {};
      let max_call = 0;
      for (let i = 0; i < cov.l.length; i++) {
        const L = cov.l[i];
        if (L.function_name !== cov.f[index].name)
          continue;
        let lid = L.line_number;
        if (lineToId[lid] === undefined)
          lineToId[lid] = [0, []];
        max_call = Math.max(max_call, lineToId[lid][0] += L.count);
        lineToId[lid][1].push(i);
      }

      let ncode = [];

      for (let i = cov.f[index].start_line; i <= cov.f[index].end_line; i++) {
        let rtd = funcLineToTime[JSON.stringify([cov.f[index].demangled_name, i])];
        if (lineToId[i] === undefined)
          tm.push(`<div class='empty'>-</div>`);
        else if (lineToId[i][0] === 0)
          tm.push(`<div class='idle'>${lineToId[i][0]}</div>`);
        else if (lineToId[i][1].length === 1)
          tm.push(`<div class='normal' data-line='${i}' data-func-id='${index}'>${lineToId[i][0]}</div>`);
        else
          tm.push(`<div class='conflict' data-line='${i}' data-func-id='${index}'>${lineToId[i][0]}</div>`);
        bg.push(`<div data-line='${i}' style='background: rgba(253, 230, 138, ${calcAlpha((lineToId[i] == undefined ? 0 : lineToId[i][0]) / max_call * 0.4)})'></div>`)
        ln.push(`<div data-line='${i}'>${i}</div>`)
        rt.push(`<div>${rtd === undefined ? '~' : (rtd * 1000).toFixed(0) + 'ms'}</div>`)
        ncode.push(codeView[i - 1]);
      }
      $(".code-container code").attr('class', 'language-cpp').text(ncode.join('\n'));
      $(".code-container .back").html(bg.join(''));
      $(".code-container .times").html(tm.join(''));
      $(".code-container .lines").html(ln.join(''));
      $(".code-container .runtime").html(rt.join(''));

      $('.code-container .times .normal, .code-container .times .conflict').unbind('click').click(function() {
        let dl = Number($(this).attr('data-line'))
        $(".code-container .back .line-mark").removeClass('line-mark')
        $(`.code-container .back [data-line=${dl}]`).addClass('line-mark')

        $(".code-title .data").text(cov.f[index].demangled_name + ' @ ' + codes[id][0] + ':' + dl);
        $('.code-title').addClass('use')
        let ids = lineToId[dl][1];
        const ps = {};
        ids.forEach((value) => {
          let fn = cov.l[value];
          if (fn.function_name !== undefined)
            ps[funcToDemang[fn.function_name]] = fn;
        })
        let html = '';
        for (let fn in ps)
          if (ps.hasOwnProperty(fn)) {
            const ftime = funcLineToTime[JSON.stringify([fn, dl])]
            const dt = ps[fn];
            let fcid = funcToLine[fn] !== dl ? undefined : funcCaller[fn];
            const fc = fcid === undefined ? {
              p: []
            } : (prof[2][fcid]);
            let fmid = funcMark[fn];
            const dir = fmid === undefined ? undefined : estimatedDir[fmid];
            let ctid = JSON.stringify([fn, dl]);
            const fct = funcCallTo[ctid] === undefined ? [] : funcCallTo[ctid];
            html += `<div class='_func'><div class='func-name'>${fn}<div class='sub-link'>${getLoc(dir)}</div>${getFuncLink(dir, fn)}</div><div class='call-time'>${dt.count} 次 (${ftime === undefined ? '-' : (ftime * 1000).toFixed(0)}ms)</div></div>`;
            fc.p.forEach((value) => {
              html += `<div class='_func func-called'><div class='func-name'>${value.n}<div class='sub-link'>${getLoc(estimatedDir[funcMark[value.n]])}</div>${getFuncLink(estimatedDir[funcMark[value.n]], value.n)}</div><div class='call-time'>${value.c} 次 (${(value.t * 1000).toFixed(0)}ms / ${(value.d * 1000).toFixed(0)}ms)</div></div>`
            })
            fct.forEach((idx) => {
              let value = prof[3][idx[0]].s;
              html += `<div class='_func func-calls'><div class='func-name'>${value.n}<div class='sub-link'>${getLoc(estimatedDir[funcMark[value.n]])}</div>${getFuncLink(estimatedDir[funcMark[value.n]], value.n)}</div><div class='call-time'>${prof[3][idx[0]].p[idx[1]].c} 次 (${(prof[3][idx[0]].p[idx[1]].t * 1000).toFixed(0)}ms / ${(prof[3][idx[0]].p[idx[1]].d * 1000).toFixed(0)}ms)</div></div>`;
            })
          }
        if (html === '')
          html += '在 gprof 中没有调用信息。'
        html += `<div class='code-table-footer'><a href="javascript:window.clearLineTable()">关闭</a></div>`
        $(".code-title .code-tip").addClass('use').html(html);
        let u = $(".code-container code").offset().top + (dl - cov.f[index].start_line) * 18.2 - $(".code-title").height() + 11;
        $("body").scrollTop(Math.min($("body").scrollTop(), u))
      })

      window.clearLineTable = () => {
        $(".code-title .code-tip").removeClass('use');
        $(".code-title .data").text(cov.f[index].demangled_name + ' @ ' + codes[id][0]);
        $(".code-container .back .line-mark").removeClass('line-mark')
      }
    }
    hljs.highlightElement($(".code-container code")[0]);
  }

  window.jumpCode = (cp, ln) => {
    cp = cp.replace(/\u00c2\u00a0/g, ' ').replace(/\u00a0/g, ' ');
    console.log(cp, ln);
    for (let i = 0; i < codes.length; i++)
      if (cp === codes[i][0]) {
        $(".button-group .codes").click();
        window.openCode(i, -1);
        let u = $(".code-container code").offset().top + (ln - 1) * 18.2 - 32.5;
        $("body").scrollTop(u);
      }
  }

  window.jumpFunction = (cp, nm) => {
    cp = cp.replace(/\u00c2\u00a0/g, ' ').replace(/\u00a0/g, ' ');
    nm = nm.replace(/\u00c2\u00a0/g, ' ').replace(/\u00a0/g, ' ');
    for (let i = 0; i < codes.length; i++)
      if (cp === codes[i][0]) {
        for (let j = 0; j < prof[4].length; j++)
          if (cp === prof[4][j].n) {
            for (let k = 0; k < prof[4][j].f.length; k++) {
              if (nm === prof[4][j].f[k].demangled_name) {
                $(".button-group .codes").click();
                window.openCode(i, k);
                let u = $(".code-container code").offset().top - 32.5;
                $("body").scrollTop(u);
                return;
              }
            }
            return;
          }
        return;
      }
  }

}

const render = (s) => {
  if (Object.keys(s).length === 0) {
    $('.layer').addClass('use');
    $('.content').removeClass('use');
  } else {
    $('.layer').removeClass('use');
    $('.content').addClass('use');
    $('.test-date').html((new Date(s.date)).toString())
    if (s.timeticks.length === 1)
      $(".test-time").html(`~${s.timeticks[0].t} ms（1 个采样）`)
    else
      $(".test-time").html(`${s.timeticks[s.timeticks.length - 2].t}~${s.timeticks[s.timeticks.length - 1].t} ms（${s.timeticks.length} 个采样）`)
    if (s.timeticks[0].m === undefined)
      $(".test-memory").html('未采集')
    else {
      let m = 0;
      for (let i = 0; i < s.timeticks.length; i++)
        m = Math.max(m, s.timeticks[i].m);
      $(".test-memory").html(`${byteConvert(m)}${m >= 1024 ? `（${m} 字节）` : ''}`)
    }
    if (s.timeticks[0].i === undefined)
      $(".test-io").html('未采集')
    else {
      $(".test-io").html(`${byteConvert(s.timeticks[s.timeticks.length - 1].i[0])} / ${byteConvert(s.timeticks[s.timeticks.length - 1].i[1])}`)
    }
    $('.test-code').html(s.code)

    // collect cpu and memory entry
    let tm = [],
      cpu = [],
      mmy = [],
      _c = 0;
    let ic = [],
      oc = [];
    let sout = [],
      serr = [];
    let lsout = 0,
      lserr = 0;
    for (let i = 0; i < s.timeticks.length; i++) {
      tm.push(s.timeticks[i].t);
      if (s.timeticks[i].c !== undefined)
        cpu.push([s.timeticks[i].t, s.timeticks[i].c]), _c = Math.max(_c, s.timeticks[i].c)
      if (s.timeticks[i].m !== undefined)
        mmy.push([s.timeticks[i].t, s.timeticks[i].m]);
      if (s.timeticks[i].i !== undefined) {
        ic.push([s.timeticks[i].t, s.timeticks[i].i[0]]);
        oc.push([s.timeticks[i].t, s.timeticks[i].i[1]]);
      }
      if (s.timeticks[i].o !== undefined)
        sout.push([s.timeticks[i].t, lsout += s.timeticks[i].o.length / 2]);
      if (s.timeticks[i].e !== undefined)
        serr.push([s.timeticks[i].t, lserr += s.timeticks[i].e.length / 2]);
    }
    if (cpu.length === 0 && mmy.length === 0)
      usePerf(false);
    else {
      usePerf(true);
      perfChart = echarts.init(perfDom, 'dark');
      perfChart.setOption({
        backgroundColor: '',
        legend: {
          show: true
        },
        visualMap: [{
          show: false,
          type: 'continuous',
          seriesIndex: 0,
          min: 0,
          max: _c
        }],
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            let ret = `<b>#${params[0].dataIndex + 1} · ${params[0].data[0] + 'ms'}</b><br/>`;
            params.forEach((value, index) => {
              ret += `<div style='display: flex; flex-direction: row; gap: 4px; width: 100%'><span>${value.marker}${value.seriesName}</span><div style='flex: 1; min-width: 10px'></div><b>${value.seriesName === "CPU" ? (value.data[1] * 100).toFixed(2) + '%' : byteConvert(value.data[1])}</b></div>`
            })
            ret = `<div style='color: white; font-family: "Rubic", "HarmonyOS Sans SC"'>${ret}</div>`
            return ret;
          },
          backgroundColor: 'rgba(50,50,50,0.8)',
          color: 'white',
          borderWidth: 0
        },
        grid: {
          left: '5%',
          right: '5%',
          bottom: '0%',
          top: '20%',
          containLabel: true
        },
        xAxis: [{
          type: 'value',
          data: tm,
          axisLabel: {
            formatter: value => (value) + "ms",
            fontFamily: "'Rubic', 'HarmonyOS Sans SC'"
          },
          min: tm[0],
          max: tm[tm.length - 1]
        }, ],
        yAxis: [{
          type: 'value',
          show: cpu.length !== 0,
          name: 'CPU 使用量',
          position: 'left',
          axisLabel: {
            formatter: value => (value * 100).toFixed(2) + "%",
            fontFamily: "'Rubic', 'HarmonyOS Sans SC'"
          }
        }, {
          type: 'value',
          show: mmy.length !== 0,
          name: '内存使用量',
          position: 'right',
          axisLabel: {
            formatter: value => byteConvert(value),
            fontFamily: "'Rubic', 'HarmonyOS Sans SC'"
          }
        }],
        series: [{
          type: 'line',
          name: 'CPU',
          showSymbol: false,
          yAxisIndex: 0,
          data: cpu,
        }, {
          type: 'line',
          name: '内存',
          showSymbol: false,
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: mmy,
        }]
      })
    }
    if (ic.length === 0 && sout.length === 0 && serr.length === 0)
      useIO(false);
    else {
      useIO(true);
      ioChart = echarts.init(ioDom, 'dark');
      ioChart.setOption({
        backgroundColor: '',
        legend: {
          show: true
        },
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            let ret = `<b>#${params[0].dataIndex + 1} · ${params[0].data[0] + 'ms'}</b><br/>`;
            params.forEach((value, index) => {
              ret += `<div style='display: flex; flex-direction: row; gap: 4px; width: 100%'><span>${value.marker}${value.seriesName}</span><div style='flex: 1; min-width: 10px'></div><b>${ byteConvert(value.data[1])}</b></div>`
            })
            ret = `<div style='color: white; font-family: "Rubic", "HarmonyOS Sans SC"'>${ret}</div>`
            return ret;
          },
          backgroundColor: 'rgba(50,50,50,0.8)',
          color: 'white',
          borderWidth: 0
        },
        grid: {
          left: '5%',
          right: '5%',
          bottom: '0%',
          top: '20%',
          containLabel: true
        },
        xAxis: [{
          type: 'value',
          data: tm,
          axisLabel: {
            formatter: value => (value) + "ms",
            fontFamily: "'Rubic', 'HarmonyOS Sans SC'"
          },
          min: tm[0],
          max: tm[tm.length - 1]
        }, ],
        yAxis: [{
          type: 'value',
          show: ic.length !== 0,
          name: '输入处理量',
          position: 'left',
          axisLabel: {
            formatter: value => byteConvert(value),
            fontFamily: "'Rubic', 'HarmonyOS Sans SC'"
          }
        }, {
          type: 'value',
          show: oc.length !== 0,
          name: '输出处理量',
          position: 'right',
          axisLabel: {
            formatter: value => byteConvert(value),
            fontFamily: "'Rubic', 'HarmonyOS Sans SC'"
          }
        }],
        series: [{
          type: 'line',
          name: '输入',
          showSymbol: false,
          yAxisIndex: 0,
          data: ic,
        }, {
          type: 'line',
          name: '输出',
          showSymbol: false,
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: oc,
        }, {
          type: 'line',
          name: 'stdout',
          showSymbol: false,
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: sout,
        }, {
          type: 'line',
          name: 'stderr',
          showSymbol: false,
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: serr,
        }]
      })
    }

    $(".subtitle.input").html(`STDIN${s.id ? ` · #[${s.id}]` : ''} · ${byteConvert(s.input.length)}（${s.input.length} 字节）`)
    $("pre.input code").text(s.input.snapshot + (s.input.snapshot.replace(/[^0x00-0xff]/g, 'xx').length !== s.input.length ? '...' : ''))

    if (s.timeticks[0].o === undefined)
      $(".output").addClass("unuse");
    else {
      $(".output").removeClass("unuse");
      $(".subtitle.output").html(`STDOUT · ${byteConvert(lsout)}（${lsout} 字节）`)
      let OL = 1,
        OR = s.timeticks.length;

      const updateOutput = () => {
        $(".flex.output .selector.head input").val(OL);
        $(".flex.output .selector.tail input").val(OR);
        let l = 0;
        for (let i = 1; i < OL; i++)
          l += s.timeticks[i - 1].o.length / 2;
        $(".flex.output .selector.head .count").html(`↑ ${l} 字节`);
        l = 0;
        for (let i = OR + 1; i <= s.timeticks.length; i++)
          l += s.timeticks[i - 1].o.length / 2;
        $(".flex.output .selector.tail .count").html(`↓ ${l} 字节`);
        let P = "";
        for (let i = OL; i <= OR; i++)
          P += s.timeticks[i - 1].o;

        $(".flex.output pre code").text(hex2str(P));
      }
      updateOutput();

      $(".flex.output .selector.head input").unbind('blur').blur(function() {
        let p = $(this).val();
        p = Number(p);
        if (p === null || isNaN(p))
          p = 1;
        else {
          p = Math.max(1, Math.min(s.timeticks.length, p));
          p = Math.min(p, OR);
        }
        $(this).val(p);
        if (OL !== p)
          OL = p, updateOutput();
      })
      $(".flex.output .selector.tail input").unbind('blur').blur(function() {
        let p = $(this).val();
        p = Number(p);
        if (p === null || isNaN(p))
          p = s.timeticks.length;
        else {
          p = Math.max(1, Math.min(s.timeticks.length, p));
          p = Math.max(p, OL);
        }
        $(this).val(p);
        if (OR !== p)
          OR = p, updateOutput();
      })

    }

    if (s.timeticks[0].e === undefined)
      $(".error").addClass("unuse");
    else {
      $(".error").removeClass("unuse");
      $(".subtitle.error").html(`STDERR · ${byteConvert(lserr)}（${lserr} 字节）`)
      let OL = 1,
        OR = s.timeticks.length;

      const updateError = () => {
        $(".flex.error .selector.head input").val(OL);
        $(".flex.error .selector.tail input").val(OR);
        let l = 0;
        for (let i = 1; i < OL; i++)
          l += s.timeticks[i - 1].e.length / 2;
        $(".flex.error .selector.head .count").html(`↑ ${l} 字节`);
        l = 0;
        for (let i = OR + 1; i <= s.timeticks.length; i++)
          l += s.timeticks[i - 1].e.length / 2;
        $(".flex.error .selector.tail .count").html(`↓ ${l} 字节`);
        let P = "";
        for (let i = OL; i <= OR; i++)
          P += s.timeticks[i - 1].e;


        $(".flex.error pre code").text(hex2str(P));
      }
      updateError();

      $(".flex.error .selector.head input").unbind('blur').blur(function() {
        let p = $(this).val();
        p = Number(p);
        if (p === null || isNaN(p))
          p = 1;
        else {
          p = Math.max(1, Math.min(s.timeticks.length, p));
          p = Math.min(p, OR);
        }
        $(this).val(p);
        if (OL !== p)
          OL = p, updateError();
      })
      $(".flex.error .selector.tail input").unbind('blur').blur(function() {
        let p = $(this).val();
        p = Number(p);
        if (p === null || isNaN(p))
          p = s.timeticks.length;
        else {
          p = Math.max(1, Math.min(s.timeticks.length, p));
          p = Math.max(p, OL);
        }
        $(this).val(p);
        if (OR !== p)
          OR = p, updateError();
      })

    }
    if (s.profile === undefined)
      useProf(false);
    else {
      useProf(true);
      manageProfile(s.profile.content, s.codes)
    }
  }
}
$.get('/get', data => render(data))

document.addEventListener("dragenter", function(e) {
  e.preventDefault();
  e.stopPropagation();
}, false);

document.addEventListener("dragover", function(e) {
  e.preventDefault();
  e.stopPropagation();
}, false);

document.addEventListener("dragleave", function(e) {
  e.preventDefault();
  e.stopPropagation();
}, false);

document.addEventListener("drop", function(e) {
  e.preventDefault();
  e.stopPropagation();
  var data = new FormData();
  data.append('file', e.dataTransfer.files[0])
  $.ajax({
    url: '/set',
    type: 'POST',
    cache: false,
    contentType: false,
    processData: false,
    data: data,
    success: (ret) => {
      if (ret.type === "success")
        render(ret.data);
    }
  })
})