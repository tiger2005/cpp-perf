export const readFlatNormal = (data) => {
  data = data.replace(/\r\n/g, '\r').replace(/\r/g, '\n').split('\n');

  if (/no time accumulated/.exec(data[3]))
    return [];
  data = data.slice(5);
  let ret = [];

  let regex_line = (
    '\\s*(?<percentage_time>\\d+\\.\\d+)' +
    '\\s+(?<cumulative>\\d+\\.\\d+)' +
    '\\s+(?<self>\\d+\\.\\d+)' +
    '(\\s+(?<calls>\\d+)\\s+(?<selfocall>\\d+\\.\\d+)\\s+(?<totalocall>\\d+\\.\\d+))?' +
    '\\s+(?<name>\\S.*?)'
  )
  
  let rg = new RegExp('^' + regex_line + '$', 'i');

  for (let t = 0; t < data.length; t ++) {
    let str = data[t];
    if (str === "")
      continue;
    let res = rg.exec(str);
    if (res !== null) {
      const obj = {
        's': Number(res.groups.self),
        'c': res.groups.calls === undefined ? -1 : Number(res.groups.calls),
        'n': res.groups.name
      }
      ret.push(obj);
    }
    else
      throw 'FLAT_NORMAL: ' + str;
  }

  return ret;
};

export const readFlatLine = (data, convert) => {
  data = data.replace(/\r\n/g, '\r').replace(/\r/g, '\n').split('\n');

  if (/no time accumulated/.exec(data[3]))
    return [];
  data = data.slice(5);
  let ret = [];

  let regex_line = (
    '\\s*(?<percentage_time>\\d+\\.\\d+)' +
    '\\s+(?<cumulative>\\d+\\.\\d+)' +
    '\\s+(?<self>\\d+\\.\\d+)' +
    '(\\s+(?<calls>\\d+)\\s+(?<selfocall>\\d+\\.\\d+)\\s+(?<totalocall>\\d+\\.\\d+))?' +
    '\\s+(?<name>[^\\(]+(?:operator\(\))?(?:\\([^\\)]*\\))?(?:[^\\(]*\\S)?)' + 
    '\\s*(?:(?:\\((?<path>\\S.*)\\:(?<line>\\d+)\\s+(?:\\@\\s+[0-9a-f]+)?\\)))?'
  )
  
  let rg = new RegExp('^' + regex_line + '$', 'i');

  let dti = {};

  for (let t = 0; t < data.length; t ++) {
    let str = data[t];
    if (str === "")
      continue;
    let res = rg.exec(str);
    if (res !== null) {
      if (res.groups.path === undefined)
        continue;
      let idtf = JSON.stringify([res.groups.name, res.groups.line]);
      if (dti[idtf] !== undefined) {
        ret[dti[idtf]].s += Number(res.groups.self);
        ret[dti[idtf]].c += res.groups.calls === undefined ? 0 : Number(res.groups.calls);
      }
      else {
        let cv = convert(res.groups.path);
        const obj = {
          's': Number(res.groups.self),
          'c': res.groups.calls === undefined ? 0 : Number(res.groups.calls),
          'n': res.groups.name,
          'l': Number(res.groups.line),
          'p': cv
        }
        dti[idtf] = ret.length;
        ret.push(obj);
      }
    }
    else
      throw 'FLAT_LINE: ' + str;
  }

  ret.sort((x, y) => (y.s - x.s) === 0 ? (y.c - x.c) : y.s - x.s)

  return ret;
};

export const readGraphNormal = (data) => {
  data = data.replace(/\r\n/g, '\r').replace(/\r/g, '\n').split('\n');

  data = data.slice(6);
  let ret = [];

  let regex_spont = '^\s+<spontaneous>\s*$';
  let regex_sep = '^--+$';
  let regex_cycle_caller = (
    '^\\[(?<index>\\d+)\\]?' +
    '\\s+(?<percentage_time>\\d+\\.\\d+)' +
    '\\s+(?<self>\\d+\\.\\d+)' +
    '\\s+(?<descendants>\\d+\\.\\d+)' +
    '\\s+(?:(?<called>\\d+)(?:\\+(?<called_self>\\d+))?)?' +
    '\\s+<cycle\\s(?<cycle>\\d+)\\sas\\sa\\swhole>' +
    '\\s\\[(\\d+)\\]$'
  )
  let regex_cycle_member = (
    '^\\s+(?<self>\\d+\\.\\d+)?' +
    '\\s+(?<descendants>\\d+\\.\\d+)?' +
    '\\s+(?<called>\\d+)(?:\\+(?<called_self>\\d+))?' +
    '\\s+(?<name>\\S.*?)' +
    '(?:\\s+<cycle\\s(?<cycle>\\d+)>)?' +
    '\\s\\[(?<index>\\d+)\\]$'
  )
  let regex_primary = (
    '^\\[(?<index>\\d+)\\]?' +
    '\\s+(?<percentage_time>\\d+\\.\\d+)' +
    '\\s+(?<self>\\d+\\.\\d+)' +
    '\\s+(?<descendants>\\d+\\.\\d+)' +
    '\\s+(?:(?<called>\\d+)(?:\\+(?<called_self>\\d+))?)?' +
    '\\s+(?<name>\\S.*?)' +
    '(?:\\s+<cycle\\s(?<cycle>\\d+)>)?' +
    '\\s\\[(\\d+)\\]$'
  )
  let regex_secondary = (
    '^\\s+(?<self>\\d+\\.\\d+)?' +
    '\\s+(?<descendants>\\d+\\.\\d+)?' +
    '\\s+(?<called>\\d+)(?:/(?<called_total>\\d+))?' +
    '\\s+(?<name>\\S.*?)' + 
    '(?:\\s+<cycle\\s(?<cycle>\\d+)>)?' +
    '\\s\\[(?<index>\\d+)\\]$'
  )

  let rg_spont = new RegExp(regex_spont, 'i');
  let rg_sep = new RegExp(regex_sep, 'i');
  let rg_cycle_caller = new RegExp(regex_cycle_caller, 'i');
  let rg_cycle_member = new RegExp(regex_cycle_member, 'i');
  let rg_primary = new RegExp(regex_primary, 'i');
  let rg_secondary = new RegExp(regex_secondary, 'i');

  let isCycle = false;
  let primary = undefined, parents = [], children = [];
  let tmp;
  for (let t = 0; t < data.length; t ++) {
    let str = data[t];
    if (/^\s*$/g.exec(str) !== null)
      break;
    if (rg_sep.exec(str) !== null) {
      if (!isCycle) {
        ret.push({
          's': primary,
          'p': parents,
          'c': children
        })
      }
      isCycle = false;
      primary = undefined; parents = []; children = [];
    }
    else if (isCycle)
      continue
    else if (rg_cycle_caller.exec(str) !== null)
      isCycle = true;
    else if ((tmp = rg_primary.exec(str)) !== null) {
      primary = {
        'n': tmp.groups.name,
        'c': tmp.groups.called === undefined ? 0 : Number(tmp.groups.called),
        's': tmp.groups.called_self === undefined ? 0 : Number(tmp.groups.called_self),
        't': Number(tmp.groups.self),
        'd': Number(tmp.groups.descendants)
      }
    }
    else if ((tmp = rg_secondary.exec(str)) !== null) {
      const obj = {
        'n': tmp.groups.name,
        'c': Number(tmp.groups.called),
        's': tmp.groups.called_total === undefined ? 0 : Number(tmp.groups.called_total),
        't': tmp.groups.self === undefined ? 0 : Number(tmp.groups.self),
        'd': tmp.groups.descendants === undefined ? 0 : Number(tmp.groups.descendants)
      }
      if (primary)
        children.push(obj);
      else
        parents.push(obj);
    }
    else if (rg_spont.exec(str) !== null)
      throw 'GRAPH_NORMAL: ' + str;
  }

  return ret;
};

export const readGraphLine = (data, convert) => {
  data = data.replace(/\r\n/g, '\r').replace(/\r/g, '\n').split('\n');

  data = data.slice(6);
  let ret = [];

  let regex_spont = '^\s+<spontaneous>\s*$';
  let regex_sep = '^--+$';
  let regex_primary = (
    '^\\[(?<index>\\d+)\\]?' +
    '\\s+(?<percentage_time>\\d+\\.\\d+)' +
    '\\s+(?<self>\\d+\\.\\d+)' +
    '\\s+(?<descendants>\\d+\\.\\d+)' +
    '\\s+(?:(?<called>\\d+)(?:\\+(?<called_self>\\d+))?)?' +
    '\\s+(?<name>[^\\(]+(?:operator\(\))?(?:\\([^\\)]*\\))?(?:[^\\(]*\\S)?)' + 
    '\\s+(?:\\((?<path>\\S.*)\\:(?<line>\\d+)\\s+(?:\\@\\s+[0-9a-f]+)?\\))?' + 
    '\\s\\[(\\d+)\\]$'
  )
  let regex_secondary = (
    '^\\s+(?<self>\\d+\\.\\d+)?' +
    '\\s+(?<descendants>\\d+\\.\\d+)?' +
    '\\s+(?<called>\\d+)(?:/(?<called_total>\\d+))?' +
    '\\s+(?<name>[^\\(]+(?:operator\(\))?(?:\\([^\\)]*\\))?(?:[^\\(]*\\S)?)' + 
    '\\s+(?:\\((?<path>\\S.*)\\:(?<line>\\d+)\\s+(?:\\@\\s+[0-9a-f]+)?\\))' + 
    '\\s\\[(?<index>\\d+)\\]$'
  )

  let rg_spont = new RegExp(regex_spont, 'i');
  let rg_sep = new RegExp(regex_sep, 'i');
  let rg_primary = new RegExp(regex_primary, 'i');
  let rg_secondary = new RegExp(regex_secondary, 'i');

  let primary = undefined, parents = [], children = [];
  let tmp;
  for (let t = 0; t < data.length; t ++) {
    let str = data[t];
    if (/^\s*$/g.exec(str) !== null)
      break;
    if (rg_sep.exec(str) !== null) {
      if (primary)
        ret.push({
          's': primary,
          'p': parents,
          'c': children
        })
      primary = undefined; parents = []; children = [];
    }
    else if ((tmp = rg_primary.exec(str)) !== null) {
      if (tmp.groups.path === undefined)
        continue;
      let cv = convert(tmp.groups.path);
      primary = {
        'n': tmp.groups.name,
        'c': tmp.groups.called === undefined ? 0 : Number(tmp.groups.called),
        's': tmp.groups.called_self === undefined ? 0 : Number(tmp.groups.called_self),
        't': Number(tmp.groups.self),
        'd': Number(tmp.groups.descendants),
        'l': Number(tmp.groups.line),
        'p': cv
      }
    }
    else if ((tmp = rg_secondary.exec(str)) !== null) {
      let cv = convert(tmp.groups.path);
      const obj = {
        'n': tmp.groups.name,
        'c': Number(tmp.groups.called),
        's': tmp.groups.called_total === undefined ? 0 : Number(tmp.groups.called_total),
        't': tmp.groups.self === undefined ? 0 : Number(tmp.groups.self),
        'd': tmp.groups.descendants === undefined ? 0 : Number(tmp.groups.descendants),
        'l': Number(tmp.groups.line),
        'p': cv
      }
      if (primary)
        children.push(obj);
      else
        parents.push(obj);
    }
    else if (rg_spont.exec(str) !== null)
      throw 'GRAPH_LINE: ' + str;
  }

  return ret;
};

export const readCoverJSON = (data, convert) => {
  data = JSON.parse(data);
  let ret = [];
  for (let i = 0; i < data.files.length; i ++) {
    const D = data.files[i];
    let tmp;
    if (!(tmp = convert(D.file))[0])
      continue;
    const obj = {
      'n': tmp[1],
      'l': D.lines,
      'f': D.functions
    };
    ret.push(obj)
  }
  return ret
}