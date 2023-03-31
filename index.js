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
import { createRequire } from "module";
import { program } from 'commander';

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

program
  .name('cpp-perf')
  .version('0.1.0', '-v, --version')

// 可调控选项
// 命令行编码方式
const CMD_ENCODE_RULE = "cp936";
// 在开启调试信息获取时的编译参数
const GCC_COMPILE_FLAGS_PROFILE = "-pg -g -no-pie -ftest-coverage -fprofile-arcs -A";
// 在关闭调试信息获取时的编译参数
const GCC_COMPILE_FLAGS_NO_PROFILE = "";
// 输入信息快照的长度
const MAX_INPUT_SNAPSHOT_LENGTH = 1024;
// 本地服务器端口，用于呈现性能数据
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

// 程序休眠
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const executableFileFormat = (str) => {
  if (process.platform === "win32")
    return str + ".exe";
  if (process.platform === "linux")
    return "./" + str;
}

// 监测程序的引用
const require = createRequire(import.meta.url);
let MONITOR_REQUIRE = {};

// 准备环境
const prepareEnvironment = () => {
  const spinner = new ora(`Checking monitor...`).start()
  let p = `./addon/perf_${process.platform}_${process.arch}.node`;
  try {
    MONITOR_REQUIRE = require(p);
  }
  catch (error) {
    spinner.fail(chalk.redBright(`Error: Monitor file not found. platform = ${process.platform}; arch = ${process.arch}`))
    process.exit(2);
  }
  spinner.succeed(chalk.greenBright(`Monitor found. platform = ${process.platform}; arch = ${process.arch}`))

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
}

// 利用 ./addon/perf 监控 Windows 下 PID 的信息
const monitorPID = (pid, interval, cb, fin) => {
  const spinner = ora(`MONITOR: pid = ${pid}`).start();

  const st = Date.now();
  let cnt = 0;
  const fetcher = () => {
    try {
      let res = [Date.now() - st];
      res.push(MONITOR_REQUIRE.GetCpuUsageRatio(pid));
      res.push(MONITOR_REQUIRE.GetMemoryUsage(pid));
      res.push(...MONITOR_REQUIRE.GetIOBytes(pid));
      cb(++ cnt, res, (str) => {
        spinner.text = str;
      })
      setTimeout(fetcher, interval)
    }
    catch (error) {
      if (error.message === "PID_NOT_FOUND")
        spinner.succeed(chalk.greenBright(`MONITOR: Finished, ${cnt} data(s) collected.`));
      else
        spinner.fail(chalk.redBright(`MONITOR: Aborted, ${cnt} data(s) collected. error = ${error.message}`));
      fin();
    }
  }

  fetcher();
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
      if (fs.existsSync(path.join(CWD, 'gmon.out')))
        fs.unlinkSync(path.join(CWD, 'gmon.out'))
    }
    catch (error) {
      spinner.fail(chalk.redBright(`Error: File system error.`));
      process.exit(3);
    }
    spinner.text = 'Compiling...';
    const res = child_process.spawn(
      'g++',
      abstract([...COMPILE_FILES
        , '-o'
        , executableFileFormat(COMPILE_TARGET)
        , ...((GCC_COMPILE_FLAGS + ' ' + GCC_OPTIMIZE_FLAGS).split(' '))]), {
        env: COMPILE_ENV,
        cwd: CWD,
      }
    );
    let errS = "";
    res.stderr.on('data', (data) => errS += data.toString())
    res.on('close', (err) => {
      if (err) {
        spinner.fail(chalk.redBright(`Error: Compilation error, exit code is ${err}.`));
        console.log(trim(errS));
        process.exit(3);
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
      executableFileFormat(COMPILE_TARGET),
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
      executableFileFormat(COMPILE_TARGET),
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
  cp.stdout.on('data', (COLLECT_STDOUT ? ((data) => { stdo += data.toString('hex'); }) : (() => {;})))
  cp.stderr.on('data', (COLLECT_STDERR ? ((data) => { stde += data.toString('hex'); }) : (() => {;})))
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
// 1-4: gprof xxx gmon.out -b -p/-q -L -l?
// 5: gcov xxx -t -r -i -m
// convert: 根据收集的文件集合判断是否启用路径映射
const startCollectProfile = (sf) => {
  const runSubprocess = (name, argv, handler, spinner, cb, convert = () => {}, errMsg = "Error: Cannot parse the result from gmon.out.") => {
    try {
      const content = child_process.spawn(
        name, argv, {
          cwd: CWD,
          env: COMPILE_ENV
        }
      );
      let stdo = "";
      content.stdout.on('data', data => { stdo += data.toString('hex') })
      content.on('close', (err) => {
        if (err) {
          spinner.fail(chalk.redBright(`Error: gprof returns with exit code ${err}.`));
          process.exit(4);
        }
        PROFILE_ARRAY.push(handler(iconv.decode(Buffer.from(stdo, 'hex'), CMD_ENCODE_RULE), convert));
        cb();
      })
    } catch (error) {
      spinner.fail(chalk.redBright(errMsg));
      console.log(error);
      process.exit(4);
    }
  }
  return new Promise((resolve) => {
    const spinner = new ora('Parsing profiling file... (1 / 4)').start();
    // process 1
    runSubprocess(
      'gprof',
      [executableFileFormat(COMPILE_TARGET), 'gmon.out', '-b', '-p', '-L'], 
      readFlatNormal,
      spinner,
      () => {
        spinner.text = 'Parsing profiling file... (2 / 4)'
        // process 2
        runSubprocess(
          'gprof',
          [executableFileFormat(COMPILE_TARGET), 'gmon.out', '-b', '-p', '-l', '-L'], 
          readFlatLine,
          spinner,
          () => {
            spinner.text = 'Parsing profiling file... (3 / 4)'
            // process 3
            runSubprocess(
              'gprof',
              [executableFileFormat(COMPILE_TARGET), 'gmon.out', '-b', '-q', '-L'], 
              readGraphNormal,
              spinner,
              () => {
                // process 4
                spinner.text = 'Parsing profiling file... (4 / 4)'
                runSubprocess(
                  'gprof',
                  [executableFileFormat(COMPILE_TARGET), 'gmon.out', '-b', '-q', '-l', '-L'], 
                  readGraphLine,
                  spinner,
                  () => {
                    spinner.succeed(chalk.greenBright(`Profiling file parsed.`))
                    const _spinner = new ora(`Parsing cover file...`);
                    // process 5
                    runSubprocess(
                      'gcov',
                      [executableFileFormat(COMPILE_TARGET), '-t', '-r', '-i', '-m'], 
                      readCoverJSON,
                      _spinner,
                      () => {
                        _spinner.succeed(chalk.greenBright(`Cover file parsed.`))
                        resolve()
                      },
                      (p) => {
                        p = path.resolve(path.join(CWD, p));
                        if (sf.indexOf(p) !== -1)
                          return [true, path.relative(CWD, p)];
                        return [false, '~/' + path.basename(p)];
                      },
                      'Error: Cannot parse cover file'
                    )
                  },
                  (p) => {
                    p = path.normalize(p);
                    if (sf.indexOf(p) !== -1)
                      return [true, path.relative(CWD, p)];
                    return [false, '~/' + path.basename(p)];
                  }
                )
              }
            )
          },
          (p) => {
            p = path.normalize(p);
            if (sf.indexOf(p) !== -1)
              return [true, path.relative(CWD, p)];
            return [false, '~/' + path.basename(p)];
          }
        )
      }
    )
  })
};

// 开启网页
const startWebsite = (sendIf, fileLoc) => {
  return new Promise ((resolve) => {

    if (!sendIf) {
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
      const serv = app.listen(CPP_PERF_PORT)
      serv.on('listening', async () => {
        spinner.succeed(chalk.greenBright(`You can view result from http://127.0.0.1:${CPP_PERF_PORT}`));
        await sleep(1);
        process.on('SIGINT', () => serv.close());
      })
      serv.on('close', () => { resolve(); })
      serv.on('error', (err) => {
        alert(`❌ An error is thrown by Express: ${err.message}`)
      })
    }
    else {
      const formData = {
        field: 'file',
        file: fs.createReadStream(fileLoc)
      }
      try {
        request.post({
          url: `http://127.0.0.1:${CPP_PERF_PORT}/set`,
          formData: formData
        }, (err, res) => {
          if (err)
            console.log(chalk.redBright(`❌ POST error: ${err.message}.`))
          else if (res.type === "failed")
            console.log(chalk.redBright(`❌ POST error.`))
          else {
            console.log(chalk.greenBright('✔ POST success.'))
          }
          resolve();
        })
      }
      catch (error) {
        console.log(chalk.redBright(`❌ POST error: ${err.message}.`));
        resolve();
      }
    }
  })
}

program
  .command('init <name>')
  .alias('i')
  .description('write initial configs to a file')
  .option('-f, --force', 'Force to cover previous config file')
  .action((f, cmd) => {
    if (path.extname(f) !== ".pfconf")
      f += ".pfconf";
    if (fs.existsSync(f) && !cmd.force) {
      alert(`Error: Config file already exists. Use -f to force initialize.`);
    }
    try {
      fs.writeFile(f, JSON.stringify(TEMPLATE_CPCONF(), null, "\t"), (err) => {
        if (err !== null)
          throw err;
      });
      console.log(chalk.greenBright(`✔ Config saved in ${chalk.yellowBright(f)}.`))
    } catch (error) {
      alert(`Error: Cannot save the config file.`);
    }
  });
program
  .command('prepare <file>')
  .alias('p')
  .description('prepare a config file for a single file')
  .option('-f, --force', 'Force to cover previous config file')
  .option('-i, --input-file <file>', 'Set input data as a file')
  .action((o, cmd) => {
    if (path.extname(o) !== ".cpp")
      o += ".cpp";
    let f = path.basename(o, '.cpp');
    f = path.join(path.dirname(o), f + '.pfconf');

    if (fs.existsSync(f) && !cmd.force) {
      alert(`Error: Config File already exists. Use -f to force-initialize.`);
    }

    const saveFile = () => {
      try {
        fs.writeFile(f, JSON.stringify(TEMPLATE_CPCONF(o), null, "\t"), (err) => {
          if (err !== null)
            throw err;
        });
        console.log(chalk.greenBright(`✔ Config saved in ${chalk.yellowBright(f)}.`))
      } catch (error) {
        alert(`Error: Cannot save the config file.`);
      }
    }
    if (cmd["inputFile"]) {
      RUN_TYPE = "file";
      RUN_STDIN = path.relative(path.dirname(f), cmd["inputFile"]);
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
  });
program
  .command('run <name>')
  .alias('r')
  .description('run a test defined by a config file')
  .option('-s, --send-to-server', 'Send the result to another local server right after the run')
  .option('-i, --id <id>', 'ID for this run a.k.a. definition of "%i%"')
  .action( async (f, cmd) => {
    let content = "";
    if (path.extname(f) !== ".pfconf")
      f += ".pfconf";

    try {
      content = fs.readFileSync(f);
    } catch (error) {
      alert(`Error: Cannot find the config file.`);
    }

    try {
      content = JSON.parse(content);
    } catch (error) {
      alert(`Error: Cannot parse the config file.`);
    }
    if (Object.keys(content.compile.env).length !== 0)
      COMPILE_ENV = content.compile.env;
    GCC_OPTIMIZE_FLAGS = content.compile.flags;
    COMPILE_FILES = abstract(content.compile.files);
    if (COMPILE_FILES.length === 0) {
      alert(`Error: Compile file list should not be empty.`);
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
    COLLECT_CODES = abstract(content.collect.codes);
    GCC_COMPILE_FLAGS = (
      COLLECT_PROFILE ?
      GCC_COMPILE_FLAGS_PROFILE :
      GCC_COMPILE_FLAGS_NO_PROFILE
    );
    SAVE_FILE = content.save.file.replace(/\%t\%/g, (new Date()).format('yyyy-MM-dd-HH-mm-ss'));
    SAVE_COMPRESS = content.save.compress;
    SAVE_SERVE = content.save.serve;
    if (cmd.id) {
      RUN_ID = cmd.id;
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
    await startCompile();
    await startRun()
    // process.on('SIGINT', () => process.exit(1));
    if (RETURN_CODE === 0)
      console.log(chalk.greenBright(`✔ Program exits in ${TIME_TICKS.length === 0 ? 0 : TIME_TICKS[TIME_TICKS.length - 1].t} ms, with exit code ${RETURN_CODE}.`))
    else
      console.log(chalk.redBright(`❌ Program exits in ${TIME_TICKS.length === 0 ? 0 : TIME_TICKS[TIME_TICKS.length - 1].t} ms, with exit code ${RETURN_CODE}.`))

    if (RETURN_CODE === 0 && COLLECT_PROFILE)
      await startCollectProfile(sf);

    const res = {
      isCppPerfResult: true
    };
    if (COLLECT_PROFILE && RETURN_CODE === 0)
      res.profile = {
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
      spinner.succeed(`${chalk.greenBright(`Result saved in `)}${chalk.yellowBright(SAVE_FILE)}.`);
    }
    catch (error) {
      spinner.fail(chalk.redBright(`Failed saving result to ${SAVE_FILE}.`));
      process.exit(5);
    }

    WEBSITE_OBJ = res;
    if (SAVE_SERVE)
      await startWebsite(cmd["sendToServer"], SAVE_FILE);
  })
program
  .command('serve [file]')
  .alias('s')
  .description('start a local server to display the result')
  .option('-s, --send-to-server', 'Send the file to another local server')
  .action( async (loc, cmd) => {
    if (loc) {
      try {
        if (path.extname(loc) !== ".pfrs")
          loc += ".pfrs";
        WEBSITE_OBJ = JSON.parse(fs.readFileSync(loc));
      } catch (error) {
        alert(`Error: Cannot load ${loc}.`);
      }
    }
    if (cmd["sendToServer"] && !loc) {
      alert(`Error: A file is needed to be sent.`)
    }
    await startWebsite(cmd["sendToServer"], loc);
  })
program.parse(process.argv);