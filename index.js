#!/usr/bin/env node
import child_process from 'child_process';
import process from 'process';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import express from 'express';
import bodyParser from 'body-parser';
import formidable from 'formidable';
import readline from 'readline';
import iconv from 'iconv-lite';
import request from 'request';

// 解析文件所在位置
import { fileURLToPath } from 'url';
const __filenameNew = fileURLToPath(import.meta.url)
const __dirnameNew = path.dirname(__filenameNew)

import {
  readFlatNormal,
  readFlatLine,
  readGraphNormal,
  readGraphLine,
  readCoverJSON
} from './gprof/gprof.js';

// 可调控选项
const CMD_ENCODE_RULE = "cp936";
const GCC_COMPILE_FLAGS_PROFILE = "-pg -g -no-pie -ftest-coverage -fprofile-arcs -A";
const GCC_COMPILE_FLAGS_NO_PROFILE = "";
const MAX_INPUT_SNAPSHOT_LENGTH = 1024;
const CPP_PERF_PORT = 23456;
// 默认设置
let GCC_COMPILE_FLAGS = "";
let GCC_OPTIMIZE_FLAGS = "-std=c++17 -O2";
let COMPILE_ENV = process.env;
let COMPILE_FILES = [""];
let COMPILE_TARGET = "main";
let RUN_TIMEOUT = undefined;
let RUN_TYPE = "pipe";
let RUN_INTERVAL = 10;
let RUN_STDIN = "";
let COLLECT_PROFILE = false;
let COLLECT_CPU = true;
let COLLECT_MEMORY = true;
let COLLECT_IO = true;
let COLLECT_STDOUT = true;
let COLLECT_STDERR = true;
let COLLECT_CODES = [];
let SAVE_FILE = "";
let SAVE_COMPRESS = true;
let SAVE_SERVE = true;
let RUN_ID = undefined;
let CWD = "";
// 暂存运行信息
let GMON_SIZE = 0;
let PROFILE_ARRAY = [];
let TIME_TICKS = [];
let CODE_LIBRARY = [];
// 网页信息对象
let WEBSITE_OBJ = {};

// 日期转换
Date.prototype.format = function(fmt) {
  var o = {
    "M+": this.getMonth() + 1, //月份
    "d+": this.getDate(), //日
    "H+": this.getHours(), //小时
    "m+": this.getMinutes(), //分
    "s+": this.getSeconds(), //秒
    "q+": Math.floor((this.getMonth() + 3) / 3), //季度
    "S": this.getMilliseconds() //毫秒
  };
  if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
  for (var k in o)
    if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
  return fmt;
}

// 通过文件名字构造默认设置
// 为了防止文件重名，文件会保存在对应文件夹下
const TEMPLATE_CPCONF = (fileDir = "main.cpp") => {
  return {
    "compile": {
      "env": {},
      "flags": GCC_OPTIMIZE_FLAGS,
      "files": [
        path.basename(fileDir)
      ],
      "target": path.basename(fileDir, '.cpp'),
    },
    "run": {
      "timeout": 0,
      "interval": RUN_INTERVAL,
      "type": RUN_TYPE,
      "stdin": RUN_STDIN,
    },
    "collect": {
      "profile": COLLECT_PROFILE,
      "cpu": COLLECT_CPU,
      "memory": COLLECT_MEMORY,
      "io": COLLECT_IO,
      "stdout": COLLECT_STDOUT,
      "stderr": COLLECT_STDERR,
      "codes": [
        path.basename(fileDir)
      ]
    },
    "save": {
      "file": path.basename(fileDir, '.cpp') + ".pfrs",
      "compress": SAVE_COMPRESS,
      "serve": true
    }
  };
}

// 警告
const alert = (msg) => {
  console.log(chalk.redBright(msg));
  process.exit(1);
}

// 去除行末空格
const trim = (str) => {
  while (str.length !== 0 && (str[str.length - 1] === '\n' || str[str.length - 1] === '\r'))
    str = str.substring(0, str.length - 1);
  return str;
}

// 提取空字符串
const abstract = (arr) => {
  let ret = [];
  for (let i = 0; i < arr.length; i++)
    if (arr[i] !== "")
      ret.push(arr[i]);
  return ret;
}

// 准备环境
const prepareEnvironment = () => {
  const _spinner = new ora(`Checking g++...`).start()
  let cp = child_process.spawnSync(
    'g++', ['-v'], {
    env: COMPILE_ENV
  });
  if (cp.status !== 0) {
    _spinner.fail(chalk.redBright(`Error: g++ not found.`));
    process.exit(2);
  }
  else {
    _spinner.succeed(chalk.greenBright(`g++ found: ` + abstract(cp.stderr.toString().split('\n')).pop()))
  }

  if (COLLECT_PROFILE) {
    const _spinner_2 = new ora(`Checking gcov...`).start()
    cp = child_process.spawnSync(
      'gcov', ['-v'], {
      env: COMPILE_ENV
    });
    if (cp.status !== 0) {
      _spinner_2.fail(chalk.redBright(`Error: gcov not found.`));
      process.exit(2);
    }
    else {
      _spinner_2.succeed(chalk.greenBright(`gcov found: ` + abstract(cp.stdout.toString().split('\n'))[0]))
    }
    const _spinner_3 = new ora(`Checking gprof...`).start()
    cp = child_process.spawnSync(
      'gprof', ['-v'], {
      env: COMPILE_ENV
    });
    if (cp.status !== 0) {
      _spinner_3.fail(chalk.redBright(`Error: gprof not found.`));
      process.exit(2);
    }
    else {
      _spinner_3.succeed(chalk.greenBright(`gprof found: ` + abstract(cp.stdout.toString().split('\n'))[0]))
    }

  }

  const spinner = new ora(`Checking monitor...`).start()
  if (fs.existsSync(path.join(__dirnameNew, 'addon', 'perf.exe')))
    spinner.succeed(chalk.greenBright(`~/addon/perf.exe found.`));
  else {
    spinner.text = `~/addon/perf.exe not found. Compiling...`;
    const res = child_process.spawnSync(
      'g++', abstract([
        'perf.cpp',
        '-o',
        'perf',
        ...GCC_OPTIMIZE_FLAGS.split(' ')
      ]), {
      cwd: path.join(__dirnameNew, 'addon'),
      env: COMPILE_ENV
    });
    if (res.status) {
      spinner.fail(chalk.redBright(`Error: Monitor compilation error, exit code is ${res.status}.`));
      console.log(trim(res.stderr.toString()));
      process.exit(2);
    }
    spinner.succeed(chalk.greenBright(`Monitor built successfully.`));
  }
}

// 利用 ./addon/perf 监控 Windows 下 PID 的信息
const monitorPID = (pid, interval, cb, fin) => {
  const spinner = ora(`MONITOR: pid = ${pid}`).start();

  const res = [];

  const cp = child_process.spawn('./addon/perf.exe', {
    cwd: __dirnameNew
  });
  cp.stdin.write(`${pid} ${interval}\n`);

  cp.stdout.on('data', (data) => {
    let str = data.toString();
    str = trim(str);
    str = str.split(' ').map((x) => Number(x));

    res.push(str);
    cb(res.length, str, (str) => {
      spinner.text = str;
    });
  })

  cp.stderr.on('data', (data) => {
    spinner.text = (chalk.yellowBright("MONITOR: SIGNAL " + data.toString()));
  })

  cp.on('close', (code) => {
    if (code === 0)
      spinner.succeed(chalk.greenBright(`MONITOR: Finished, ${res.length} data(s) collected.`));
    else
      spinner.fail(chalk.yellowBright(`MONITOR: Failed with exit code ${code}.`));
    fin();
  })

  return cp;
}

const startCompile = async () => {
  return new Promise((resolve) => {
    const spinner = new ora("Cleaning environment...").start();
    // 删除 .gcda 和 .gcno 文件，防止累加
    try {
      if (fs.existsSync(path.join(CWD, COMPILE_TARGET + '.gcda')))
        fs.unlinkSync(path.join(CWD, COMPILE_TARGET + '.gcda'))
      if (fs.existsSync(path.join(CWD, COMPILE_TARGET + '.gcno')))
        fs.unlinkSync(path.join(CWD, COMPILE_TARGET + '.gcno'))
    }
    catch (error) {
      spinner.fail(chalk.redBright(`File system error.`));
      process.exit(2);
    }
    spinner.text = 'Compiling...';
    const res = child_process.spawn(
      'g++',
      abstract([...COMPILE_FILES
        , '-o'
        , COMPILE_TARGET
        , ...((GCC_COMPILE_FLAGS + ' ' + GCC_OPTIMIZE_FLAGS).split(' '))]), {
        env: COMPILE_ENV,
        cwd: CWD,
      }
    );
    let errS = "";
    res.stderr.on('data', (data) => errS += data.toString())
    res.on('close', (err) => {
      if (err.status) {
        spinner.fail(chalk.redBright(`Error: Compilation error, exit code is ${err.status}.`));
        console.log(trim(errS));
        process.exit(2);
      }
      spinner.succeed(chalk.greenBright(`Compilation success.`));
      resolve(true);
    })
  })
}

let INPUT_SNAPSHOT, INPUT_LENGTH = 0;
let RETURN_CODE = 0;

const startRun = () => {
  // 读取输入，创建进程
  let cp;
  if (RUN_TYPE === "pipe") {
    INPUT_SNAPSHOT = Buffer.from(RUN_STDIN);
    INPUT_LENGTH = INPUT_SNAPSHOT.length;
    INPUT_SNAPSHOT = INPUT_SNAPSHOT.slice(0, MAX_INPUT_SNAPSHOT_LENGTH);
    cp = child_process.spawn(
      COMPILE_TARGET,
      [], {
        cwd: CWD,
        timeout: RUN_TIMEOUT
      }
    );
    cp.stdin.write(RUN_STDIN);
    cp.stdin.end();
  } else {
    try {
      const stat = fs.statSync(path.join(CWD, RUN_STDIN));
      if (stat.isDirectory()) {
        alert(`Error: Input file ${RUN_STDIN} not found.`);
      }
      INPUT_LENGTH = stat.size;
      INPUT_SNAPSHOT = Buffer.alloc(MAX_INPUT_SNAPSHOT_LENGTH);
      fs.open(path.join(CWD, RUN_STDIN), 'r', function(status, fd) {
        if (status) {
          throw status.message;
          return;
        }
        fs.readSync(fd, INPUT_SNAPSHOT, 0, MAX_INPUT_SNAPSHOT_LENGTH, 0);
      });
    } catch (error) {
      console.log(error);
      alert(`Error: Input file ${RUN_STDIN} not found.`);
    }
    cp = child_process.spawn(
      COMPILE_TARGET,
      [], {
        cwd: CWD,
        timeout: RUN_TIMEOUT,
        stdio: [fs.openSync(path.join(CWD, RUN_STDIN), 'r'), 'pipe', 'pipe']
      }
    );
  }

  console.log(chalk.cyanBright(`! Input contains ${INPUT_LENGTH} byte(s).`))
  console.log(chalk.greenBright(`✔ Program is running. PID = ${cp.pid}`));

  // 追踪输出和进程

  let stdo = "",
    stde = "";
  cp.stdout.on('data', COLLECT_STDOUT ? (() => {;}) : ((data) => { stdo += data.toString('hex'); }))
  cp.stderr.on('data', COLLECT_STDERR ? (() => {;}) : ((data) => { stde += data.toString('hex'); }))
  process.on('SIGINT', () => cp.kill('SIGINT'));
  cp.on('close', (code) => RETURN_CODE = (code === null ? "TIMEOUT" : code));

  return new Promise((resolve) => {
    let tt = Date.now();
    monitorPID(
      cp.pid,
      RUN_INTERVAL,
      (id, info, cb) => {
        cb(`Tick ${id} | CPU ${(info[1] * 100).toFixed(1)}% | MEM ${info[2]} B | IO ${info[3]}B / ${info[4]}B`);
        let cur = {};
        cur.t = info[0];
        if (COLLECT_CPU)
          cur.c = info[1];
        if (COLLECT_MEMORY)
          cur.m = info[2];
        if (COLLECT_IO)
          cur.i = [info[3], info[4]];
        if (COLLECT_STDOUT)
          cur.o = stdo, stdo = "";
        if (COLLECT_STDERR)
          cur.e = stde, stde = "";
        TIME_TICKS.push(cur);
      },
      () => {
        resolve();
      }
    );
  })
}

// 收集文件
const startCollectCodes = () => {
  const spinner = new ora("Collecting code...").start();
  let suc = 0,
    err = 0;
  let nums = [];
  let successFiles = [];
  for (let i = 0; i < COLLECT_CODES.length; i++) {
    let pos = COLLECT_CODES[i];
    pos = path.normalize(pos);
    let rel = path.resolve(CWD, pos);
    try {
      const content = fs.readFileSync(rel);
      ++ suc;
      CODE_LIBRARY.push([pos, content.toString()]);
      nums.push(chalk.greenBright.underline(pos));
      successFiles.push(rel);
    } catch (error) {
      ++ err;
      nums.push(chalk.redBright.underline(pos));
    }
    spinner.text = `Collecting code... ${i + 1} of ${COLLECT_CODES.length} ` +
      chalk.greenBright(`Success ${suc} `) + '/ ' +
      chalk.redBright(`Error ${err}`)
  }
  spinner.succeed(`Code collected. ` +
    chalk.greenBright(`Success ${suc} `) + '/ ' +
    chalk.redBright(`Error ${err}`))
  console.log('$ ' + nums.join(' '));
  return successFiles;
}

// 收集信息文件
// 1-4: gprof xxx.exe gmon.out -b -p/-q -L -l?
// 5: gcov xxx.exe -t -r -i -m
// convert: 根据收集的文件集合判断是否启用路径映射
const startCollectProfile = (sf) => {
  try {
    const stat = fs.statSync(path.join(CWD, "gmon.out"));
    GMON_SIZE = stat.size;
    console.log(chalk.cyanBright(`! gmon.out contains ${GMON_SIZE} byte(s).`))
  } catch (error) {
    alert(`Error: Cannot fine gmon.out.`);
  }
  const spinner = new ora('Parsing profiling file... (1 / 4)').start();
  try {
    const content = child_process.spawnSync(
      'gprof',
      [COMPILE_TARGET + '.exe', 'gmon.out', '-b', '-p', '-L'], {
        cwd: CWD,
        env: COMPILE_ENV
      }
    );
    if (content.status) {
      spinner.fail(chalk.redBright(`Error: gprof returns with code ${content.status}.`));
      process.exit(4);
    }
    PROFILE_ARRAY.push(readFlatNormal(iconv.decode(content.stdout, CMD_ENCODE_RULE)));
  } catch (error) {
    spinner.fail(chalk.redBright(`Error: Cannot parse the result from gmon.out.`));
    console.log(error);
    process.exit(4);
  }

  spinner.text = 'Parsing profiling file... (2 / 4)'
  try {
    const content = child_process.spawnSync(
      'gprof',
      [COMPILE_TARGET + '.exe', 'gmon.out', '-b', '-p', '-l', '-L'], {
        cwd: CWD,
        env: COMPILE_ENV
      }
    );
    if (content.status) {
      alert(`Error: gprof returns with code ${content.status}.`);
      console.log(content);
      process.exit(4);
    }
    PROFILE_ARRAY.push(readFlatLine(iconv.decode(content.stdout, CMD_ENCODE_RULE), (p) => {
      p = path.normalize(p);
      if (sf.indexOf(p) !== -1)
        return [true, path.relative(CWD, p)];
      return [false, '~/' + path.basename(p)];
    }));
  } catch (error) {
    spinner.fail(chalk.redBright(`Error: Cannot parse the result from gmon.out.`));
    console.log(error);
    process.exit(4);
  }

  spinner.text = 'Parsing profiling file... (3 / 4)'

  try {
    const content = child_process.spawnSync(
      'gprof',
      [COMPILE_TARGET + '.exe', 'gmon.out', '-b', '-q', '-L'], {
        cwd: CWD,
        env: COMPILE_ENV
      }
    );
    if (content.status) {
      spinner.fail(chalk.redBright(`Error: gprof returns with code ${content.status}.`));
      process.exit(4);
    }
    PROFILE_ARRAY.push(readGraphNormal(iconv.decode(content.stdout, CMD_ENCODE_RULE)));
  } catch (error) {
    spinner.fail(chalk.redBright(`Error: Cannot parse the result from gmon.out.`));
    console.log(error);
    process.exit(4);
  }

  spinner.text = 'Parsing profiling file... (4 / 4)'

  try {
    const content = child_process.spawnSync(
      'gprof',
      [COMPILE_TARGET + '.exe', 'gmon.out', '-b', '-q', '-l', '-L'], {
        cwd: CWD,
        env: COMPILE_ENV
      }
    );
    if (content.status)
      alert(`Error: gprof returns with code ${content.status}.`);
    PROFILE_ARRAY.push(readGraphLine(iconv.decode(content.stdout, CMD_ENCODE_RULE), (p) => {
      p = path.normalize(p);
      if (sf.indexOf(p) !== -1)
        return [true, path.relative(CWD, p)];
      return [false, '~/' + path.basename(p)];
    }));
  } catch (error) {
    spinner.fail(chalk.redBright(`Error: Cannot parse the result from gmon.out.`));
    console.log(error);
    process.exit(4);
  }

  spinner.succeed(chalk.greenBright(`Successfully parse the profiling file.`))

  const _spinner = new ora(`Parsing cover file...`);

  try {
    const content = child_process.spawnSync(
      'gcov',
      [COMPILE_TARGET, '-t', '-r', '-i', '-m'], {
        cwd: CWD,
        env: COMPILE_ENV
      }
    );
    if (content.status)
      alert(`Error: gcov returns with code ${content.status}.`);
    PROFILE_ARRAY.push(readCoverJSON(iconv.decode(content.stdout, CMD_ENCODE_RULE), (p) => {
      p = path.resolve(path.join(CWD, p));
      if (sf.indexOf(p) !== -1)
        return [true, path.relative(CWD, p)];
      return [false, '~/' + path.basename(p)];
    }));
  } catch (error) {
    spinner.fail(chalk.redBright(`Error: Cannot parse cover result.`));
    console.log(error);
    process.exit(4);
  }

  spinner.text = `Deleting cover files...`;

  try {
    if (fs.existsSync(path.join(CWD, COMPILE_TARGET + '.gcda')))
      fs.unlinkSync(path.join(CWD, COMPILE_TARGET + '.gcda'))
    if (fs.existsSync(path.join(CWD, COMPILE_TARGET + '.gcno')))
      fs.unlinkSync(path.join(CWD, COMPILE_TARGET + '.gcno'))
  }
  catch (error) {
    spinner.fail(chalk.redBright(`Error: Cannot delete cover files.`));
    console.log(error);
    process.exit(4);
  }

  spinner.succeed(chalk.greenBright(`Successfully parse the cover result.`))

};

// 开启网页
const startWebsite = (loc) => {
  const spinner = new ora('Launching server...');
  var app = express()

  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(bodyParser.json())
  app.use(express.static(path.join(__dirnameNew, 'public')))

  app.get('/get', (req, res) => {
    res.json(WEBSITE_OBJ);
  })

  app.post('/set', (req, res) => {
    try {
      const form = formidable({ multiples: false });
      form.parse(req, (err, fields, files) => {
        if (err) {
          next(err);
          return;
        }
        let p = files.file;
        let loc = p.filepath;
        let content = fs.readFileSync(loc);
        content = JSON.parse(content);
        if (! content.isCppPerfResult) {
          throw 'FILE_FORMAT_ERROR';
          return;
        }
        fs.unlinkSync(loc);
        WEBSITE_OBJ = content;
        console.log(chalk.cyanBright(`! Server: Content changed.`));
        res.json({
          type: "success",
          data: content
        });
      });
    } catch (error) {
      console.log(chalk.redBright(`Server: Cannot load data from POST.`));
      res.json({
        type: "failed"
      });
    }
  })

  app.use(bodyParser.urlencoded({
    extended: false
  }))
  app.use(bodyParser.json())
  if (argv.length < 3 || argv[2] !== '-s') {
    app.listen(CPP_PERF_PORT, function() {
      spinner.succeed(chalk.greenBright(`You can view result from http://127.0.0.1:${CPP_PERF_PORT}`));
    })
  }
  else {
    const formData = {
      field: 'file',
      file: fs.createReadStream(loc)
    }
    request.post({
      url: `http://127.0.0.1:${CPP_PERF_PORT}/set`,
      formData: formData
    }, (err, res) => {
      if (err || res.type === "failed") {
        console.log(chalk.redBright('❌ POST error.'))
        throw err;
      }
      else {
        console.log(chalk.greenBright('✔ POST success.'))
      }
    })
  }
}

const argv = process.argv.slice(2);
if (argv.length === 0) {
  alert(`Error: At least one parameter is needed.\ncpp-perf [init/single/run/serve] ...`);
}

if (argv[0] === "init") {
  if (argv.length === 1) {
    alert(`Error: Cpp-pref file name needed.`);
  }
  let f = argv[1];
  if (path.extname(f) !== ".pfconf")
    f += ".pfconf";
  if (fs.existsSync(f) && (argv.length === 2 || argv[2] !== "-f")) {
    alert(`Error: File already exists. Use -f to force initialize.`);
  }
  try {
    fs.writeFile(f, JSON.stringify(TEMPLATE_CPCONF(), null, "\t"), (err) => {
      if (err !== null)
        throw err;
    });
    console.log(chalk.greenBright(`✔ Config saved in ${path.resolve(f)}.`))
  } catch (error) {
    alert(`Error: File system error.`);
  }
}
else if (argv[0] === "single") {
  if (argv.length === 1) {
    alert(`Error: CPP file name needed.`);
  }
  let o = argv[1];
  if (path.extname(o) !== ".cpp")
    o += ".cpp";
  let f = path.basename(o, '.cpp');
  f = path.join(path.dirname(o), f + '.pfconf');

  if (fs.existsSync(f) && (argv.length === 2 || argv[argv.length - 1] !== "-f")) {
    alert(`Error: Cpp-conf File already exists. Use -f to force-initialize.`);
  }

  const saveFile = () => {
    try {
      fs.writeFile(f, JSON.stringify(TEMPLATE_CPCONF(o), null, "\t"), (err) => {
        if (err !== null)
          throw err;
      });
      console.log(chalk.greenBright(`✔ Config saved in ${path.resolve(f)}.`))
    } catch (error) {
      alert(`Error: File system error.`);
    }
  }

  if (argv.length > 2 && (argv.length > 3 || argv[2] !== "-f")) {
    RUN_TYPE = "file";
    RUN_STDIN = path.relative(path.dirname(f), argv[2]);
    saveFile();
  }
  else {
    RUN_TYPE = "pipe";
    console.log(chalk.cyanBright(`! Please enter the input. Use CTRL+C to stop.`))
    const rl = readline.createInterface({ "input": process.stdin, "output": process.stdout });
    rl.setPrompt('');
    rl.prompt();
    rl.on('line', (input) => {
      RUN_STDIN += input + '\n';
    });
    rl.on('SIGINT', () => {
      RUN_STDIN += rl.line;
      rl.pause();
      console.log('');
      console.log(chalk.greenBright(`✔ Input collected.`));
      saveFile();
    });
  }

}
else if (argv[0] === "run") {
  let content = "";
  if (argv.length === 1) {
    alert(`Error: Cpp-pref file needed.`);
  }

  let f = argv[1];
  if (path.extname(f) !== ".pfconf")
    f += ".pfconf";

  try {
    content = fs.readFileSync(f);
  } catch (error) {
    alert(`Error: File system error.`);
  }

  try {
    content = JSON.parse(content);
  } catch (error) {
    alert(`Error: Cannot parse file.`);
  }
  if (Object.keys(content.compile.env).length !== 0)
    COMPILE_ENV = content.compile.env;
  GCC_OPTIMIZE_FLAGS = content.compile.flags;
  COMPILE_FILES = content.compile.files;
  if (COMPILE_FILES.length === 0) {
    alert(`Error: Compile files should not be empty.`);
  }
  if (content.compile.target !== "")
    COMPILE_TARGET = content.compile.target;
  if (content.run.timeout > 0)
    RUN_TIMEOUT = content.run.timeout;
  if (content.run.interval > 0)
    RUN_INTERVAL = content.run.interval;
  RUN_TYPE = content.run.type;
  RUN_STDIN = content.run.stdin;
  COLLECT_PROFILE = content.collect.profile;
  COLLECT_CPU = content.collect.cpu;
  COLLECT_MEMORY = content.collect.memory;
  COLLECT_IO = content.collect.io;
  COLLECT_STDOUT = content.collect.stdout;
  COLLECT_STDERR = content.collect.stderr;
  COLLECT_CODES = content.collect.codes;
  GCC_COMPILE_FLAGS = (
    COLLECT_PROFILE ?
    GCC_COMPILE_FLAGS_PROFILE :
    GCC_COMPILE_FLAGS_NO_PROFILE
  );
  SAVE_FILE = content.save.file.replace(/\%t\%/g, (new Date()).format('yyyy-MM-dd-HH-mm-ss'));
  SAVE_COMPRESS = content.save.compress;
  SAVE_SERVE = content.save.serve;
  if (argv.length >= 3) {
    RUN_ID = argv[2];
    console.log(chalk.cyanBright(`! ID is set to "${RUN_ID}".`));
    if (RUN_TYPE === "file")
      RUN_STDIN = RUN_STDIN.replace(/\%i\%/g, RUN_ID);
    SAVE_FILE = SAVE_FILE.replace(/\%i\%/g, RUN_ID);
  }
  else {
    if (RUN_TYPE === "file" && RUN_STDIN.indexOf("%i%") !== -1)
      alert(`❌ Input file needs an ID.`);
    if (SAVE_FILE.indexOf("%i%") !== -1)
      alert(`❌ Save file needs an ID.`);
  }

  CWD = path.dirname(f);
  SAVE_FILE = path.join(CWD, SAVE_FILE);

  prepareEnvironment();
  let sf = startCollectCodes();
  startCompile().then(() => {
    startRun().then(() => {
      process.on('SIGINT', () => process.exit(1));
      if (RETURN_CODE === 0)
        console.log(chalk.greenBright(`✔ Program exits in ${TIME_TICKS[TIME_TICKS.length - 1].t} ms, with code ${RETURN_CODE}.`))
      else
        console.log(chalk.greenBright(`❌ Program exits in ${TIME_TICKS[TIME_TICKS.length - 1].t} ms, with code ${RETURN_CODE}.`))

      if (RETURN_CODE === 0 && COLLECT_PROFILE)
        startCollectProfile(sf);

      const res = {
        isCppPerfResult: true
      };
      if (COLLECT_PROFILE && RETURN_CODE === 0)
        res.profile = {
          "fs": GMON_SIZE,
          "content": PROFILE_ARRAY
        };
      res.timeticks = TIME_TICKS;
      res.codes = CODE_LIBRARY;
      res.code = RETURN_CODE;
      res.date = Date.now();
      res.input = {
        length: INPUT_LENGTH,
        snapshot: INPUT_SNAPSHOT.toString()
      }
      if (RUN_ID)
        res.id = RUN_ID;
      const spinner = new ora('Saving result...')
      try {
        fs.writeFileSync(SAVE_FILE, JSON.stringify(res, null, SAVE_COMPRESS ? undefined : "\t"));
        spinner.succeed(`${chalk.greenBright(`Successfully save result to `)}${chalk.yellowBright(path.resolve(SAVE_FILE))}.`);
      }
      catch (error) {
        spinner.fail(chalk.redBright(`Failed saving result to ${SAVE_FILE}.`));
        process.exit(5);
      }

      WEBSITE_OBJ = res;
      if (SAVE_SERVE)
        startWebsite();
    })
  })

} else if (argv[0] === "serve") {
  let loc = "";
  if (argv.length >= 2) {
    loc = argv[1];
    try {
      if (path.extname(loc) !== ".pfrs")
        loc += ".pfrs";
      WEBSITE_OBJ = JSON.parse(fs.readFileSync(loc));
    } catch (error) {
      alert(`Error: Cannot load ${loc}.`);
    }
  }
  startWebsite(loc);
} else {
  alert(`Error: Unknown command: ${argv[0]}.\ncpp-perf [init/single/run/serve] ...`);
}