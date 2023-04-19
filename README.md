## cpp-perf

[Github Repo](https://github.com/tiger2005/cpp-perf) | [NPM Package](https://www.npmjs.com/package/cpp-perf)

![$$Z1`GKZ3( 0KS$9_1`@P(3](https://user-images.githubusercontent.com/41613797/232954641-1822504f-4658-4bd6-a4ae-0ad75f37c2bb.png)

**注意：** 这个项目仍然处于“开发中”状态，出于本人能力无法快速更新，Issue 会不定期进行筛选和处理。不推荐在这个程序里喂炒饭，后果自负。

由于数据可视化的网页本身就是中文的，也就没动力写英文文档了。等到什么时候需要了再写。

这个软件面向单文件的性能测试，当然也可以运行多文件的测试。出于 `gprof` 性质，在需要获取调试信息时，如果代码采用多线程将会导致计算错误。

这个软件的 `run` 指令 **只支持 Windows 和 amd64 & arm64 下的 Linux 操作系统**，其他指令不受影响……大概吧。

### TODO

- [x] 将 `addon/perf.cpp` 转为 C++ Addon 嵌入代码
- [ ] 写一个简单的文件系统，方便展示
- [ ] 通过某种方式提高 `gprof` 命令的精度或者直接替换掉
- [ ] 整理 `public/js/main.js` 的代码风格
- [ ] 支持其他系统（主要是改写 `addon/perf.cpp` 或者找高效的库）
- [ ] 给 `gprof/gprof.js` 的正则表达式喂几口炒饭
- [ ] 检查 `console.log` 的语法错误
- [ ] 将默认的设置写进一个 JSON 文件里面
- [ ] 优化 `STDOUT` 和 `STDERR` 数据查询表的交互体验

目前 `cpp-perf` 成功支持了主流架构下的 Linux 系统。感谢 @LittleYang0531 的贡献！

### 如何使用

1. 显然，你得先克隆这个仓库到你的电脑。
2. 确保电脑中安装了 Node.js 的较高版本，并且有 `mingw` 或 `g++` 中的 `g++`、`gcov` 和 `gprof`。最好将它们所在的同一个 `bin` 文件夹添加到环境变量中，可以使用 `g++ -v` 和类似的指令检测。
3. 进入仓库根目录，跑一次 `npm install --omit=dev` 下必需库。加上 `--omit=dev` 将会取消对 `node-addon-api` 依赖的获取，如果需要开发 C++ Addon 则不能加上这个开关。
4. 建议使用指令 `npm link` 创建软链接，这样就可以在任意位置运行 `cpp-perf ...` 跑代码了。

### 一些默认设置

你可以打开项目中的 `index.js`，在开头有一些可以自行修改的变量。
```js
// 命令行编码方式
const CMD_ENCODE_RULE = "cp936";
// 在开启调试信息获取时的编译参数
const GCC_COMPILE_FLAGS_PROFILE = "-pg -g -no-pie -ftest-coverage -fprofile-arcs -A";
// 在关闭调试信息获取时的编译参数
const GCC_COMPILE_FLAGS_NO_PROFILE = "";
// 输入信息快照的长度
const MAX_INPUT_SNAPSHOT_LENGTH = 1024;
// 本地服务器端口，用于呈现数据
const CPP_PERF_PORT = 23456;
```

后面还有一些可以控制模板设置文件的参数，可以和附带的 `TEMPLATE_CPCONF` 函数判断意思。

### 产生的文件

设置文件是类似于 `xxx.pfconf` 的文件，内部用 JSON 表示一个测试方案的设置文件，例如：

```js
{
  "compile": {
    // 环境变量，如果不为空将会直接替换默认的环境变量
    // 例如，用 { "path": "path/to/bin" } 强制切换 g++ 版本
    "env": {},
    // 这个测试下的编译开关
    "flags": "-std=c++17 -O2",
    // 需要被编译的文件
    "files": [
      "main.cpp"
    ],
    // 可执行文件的存放位置
    "target": "main"
  },
  "run": {
    // 限时，> 0 启用限时，单位为 ms
    "timeout": 0,
    // 采样间隔，单位为 ms
    "interval": 10,
    // 输入类型，应当为 "pipe" 或者 "file"
    "type": "file",
    // 输入信息
    // 如果 "type" 字段为 "pipe"，则代表输入信息
    // 否则，代表输入文件
    "stdin": "input.txt"
  },
  "collect": {
    // 是否收集调试信息
    "profile": true,
    // 是否收集 CPU 信息
    "cpu": true,
    // 是否收集内存信息
    "memory": true,
    // 是否收集 I/O 信息
    "io": true,
    // 是否收集 stdout 信息
    "stdout": true,
    // 是否收集 stderr 信息
    "stderr": true,
    // 收集的代码清单，收集后可以在可视化界面中查看 gcov 提供的行调用次数
    "codes": [
      "main.cpp"
    ]
  },
  "save": {
    // 保存的文件位置，有两个字段可以被自动替换
    // %t%，将会被替换为时间，例如 2022 年 12 月 25 日 3 点 14 分 56 秒时运行完毕的数据会将 %t% 替换成 2022-12-25-03-14-56
    // %i%，将会替换为测试的 ID。
    "file": "main.pfrs",
    // 输出的数据文件是否压缩为一行，若为 false 将会格式化输出
    "compress": true,
    // 在结束后是否开启本地服务器显示结果
    "serve": true
  }
}
```

上面 `collect` 中的功能，每开一个就会导致性能降低，最严重的是打开 `profile` 开关，它会在运行开头产生 ~300ms 的延时，输出的数据量也会增大 ~50KB。如果 `stdout` 或者 `stderr` 的数据量过大，也不建议进行监控，因为这会同时增加 Node.js 管道和网页显示的负担。

数据文件将会保存为 `xxx.pfrs`，依然以 JSON 的形式保存。与此同时，一次编译可能还会产生 `gmon.out`、`xxx.gcda` 和 `xxx.gcno` 三个文件，分别代表函数调用信息文件、行调用信息文件和行信息文件。你可以通过 `gprof` 和 `gcov` 的工作原理了解相关知识。

### 指令

#### 初始化

`cpp-perf init|i [options] <name>` 将会**在指定位置的文件夹下** 创建一个包含模板设置的 `xxx.pfconf` 文件。如果原先就存在这个文件将会报错，此时在最后追加 `-f` 开关可以强制覆盖。

同时，对于单文件的测试，可以使用专门的 `cpp-perf prepare|p [options] <file>` 创建单文件的设置文件。其中 `file` 代表需要编译的文件，后缀可以略去。此时将会在 `file` 所在文件夹下创建 `xxx.pfconf` 文件，同样可以通过 `-f` 强制覆盖。这个设置文件将会自动填充：

- 编译文件清单（`compile.files`）
- 可执行文件位置（`compile.target`）
- 收集文件清单（`collect.codes`）
- 保存的文件位置（`save.file`）

可以发现，上面的参数中可以包含一个输入文件。如果存在这个输入文件的参数，那么这个文件将会成为输入文件。否则，cpp-perf 将会提示你输入将要提供给程序的输入数据。你可以直接在命令行输入，然后使用 CTRL + C 结束输入。需要注意的是，对于 CTRL + C 的行为，当前行的数据也会计入输入数据中。

#### 运行

`cpp-perf run|r [options] <name>` 将会运行 `name` 代表的测试，其中参数的 `.pfconf` 后缀可以省略。此时 `cpp-perf` 将会依照下面的流程测试你的代码：

- 检测 `g++`、`gcov`、`gprof` 在 `compile.env ?? process.env` 下是否存在，并给出版本信息。
- 检测是否存在对应系统和架构的监视器。
- 收集 `collect.codes` 下的文件。
- 清理 `gmon.out`、`xxx.gcda` 和 `xxx.gcno` 三个文件后，开始编译源代码。
- 读入输入数据的大小并生成快照。
- 运行可执行文件，在获取 pid 后立马开始监视 ，通过采样获取性能和 I/O 相关数据。
- 执行完毕后，如果需要获取调试数据，那么调用四次 `gprof` 和一次 `gcov` 获取所需调试数据。
- 保存数据文件。
- 如果需要启动本地服务器，将这次运行的数据设为网页数据，并开启本地服务器。

在运行时，使用 CTRL + C 可以将运行中断，而不影响性能和 I/O 数据的获取及保存。此时根据 `gprof` 的设计（只要返回值不是 0 就不产生 `gmon.out` 文件），不会产生函数调用信息。

此时指令还可以接收一个参数 `-i id`，它代表了这次运行的编号。这个编号可以帮助你控制输入文件和数据文件。在上面的**设置文件**一节中，提到了可以使用 `%i%` 标识定义将被 `id` 替换的位置，输入文件也支持进行替换。例如，对于 `data_%i%.in` 的输入文件，运行 `cpp-perf run xxx.pfconf 123` 可以将输入文件定义为 `data_123.in`。这在拥有数据测试包的情况下很有用。

#### 启动服务

`cpp-perf serve|s [options] [file]` 将会开启本地服务器，此时你可以在浏览器上查看可视化的性能信息。若存在数据文件，则会将这个文件的内容作为网页的初始信息。

如果你希望挂载一个本地服务器，而在其他位置通过命令行直接打开数据文件，则可以使用 `-s` 开关。`-s` 开关将会使指令不启动本地服务器，而是通过 `POST` 请求向已经启动的 `cpp-perf` 本地服务器发送文件的数据。此时本地服务器将会接受并处理数据，并在两处反馈成功与否。**`run` 指令同样支持 `-s` 开关。**

### 可视化

可视化通过一个本地服务器实现，以 `puclic/` 文件夹作为静态资源。在启动服务器后，你可以通过命令行给出的网址查看可视化的信息。同时，将 `xxx.pfrs` 拖到浏览器中也可以快速加载文件内容。不过需要注意的是，在通过拖入文件或者 `cpp-perf serve xxx.pfrs -s` 的方式修改网站维护的信息后，原先信息就会丢失，不过重加载不会在其他标签页触发，故可以通过多标签页暂存。

#### 性能

![_@SN6U3{NYIQ1ZAYF$DPUA](https://user-images.githubusercontent.com/41613797/228571044-b6dacaa0-94a4-4912-b371-369046ef1dc4.png)

**性能** 一栏包含一个折线图，包括所有的采样点下的 CPU 使用量和内存使用量。由于时钟问题，此时测出的 CPU 占用信息会有整倍数的波动，但是内存使用量是准确的。

#### I/O

![Z1EFG9~XZR%L5${)S Y%IED](https://user-images.githubusercontent.com/41613797/228572886-371eb076-ea4f-455f-8929-679c7f29b203.png)

**I/O** 一栏包含一个折线图，包括获取的输入和输出数据量，以及 `STDIN`、`STDOUT` 和 `STDERR` 的相关信息。

值得注意的是，其中的“输入和输出数据量”基于整个程序的运行定义，包含了所有的文件读入或输出事件，以及向标准输出流等位置传递的数据。如果你开启了调试信息获取，那么此时输出数据量偏大。

在此之后是输入的快照，以及 `STDOUT` 和 `STDERR` 的数据查询表。你可以定义前后的采样点编号，从而获取这一段的标准输出流或者标准错误流的内容。这个功能主要是为了在输出型调试中得知一些采样位置上的变量信息。

#### 调试

![4SY2_ZQ Q 73) 23415}W@W](https://user-images.githubusercontent.com/41613797/228574500-3b2b94b3-6998-4213-9aac-ac0637db2858.png)

**调试** 一栏包含函数的调用信息，其中包含：

- 函数和行的运行时间（来自 `gprof`，不精确）
- 函数和行的调用关系（来自 `gprof`，不精确）
- 行的调用次数（来自 `gcov`，精确）

由于 `gprof` 的默认监测间隔为 10ms，有一些函数的调用可能无法被检测，甚至会出现调用关系紊乱等问题，但是一些影响显著的函数依然可以被捕获。

这一部分包含三个功能：查看函数的运行时间和次数，查看行的运行时间和次数，以及查看收集的代码中行的调用信息。前两个信息就是两个表格，其中可以通过 `定位` 链接或者文件位置链接分别跳转到对应函数和对应行。下面着重讲解代码查看的功能。

在代码查看页，你可以打开收集的代码。在打开代码时，我们通过 `gcov` 提供的信息获取代码的所有函数及其位置，以表格的方式进行显示。在表格中，你可以打开一整个代码，也可以只打开一个函数。

下方的代码展示区包含了代码的相关信息。其中，左起第一栏包含了 `gprof` 计算的时间，第二栏包含了 `gcov` 提供的行调用次数信息，随后是代码内容。在第二栏中，可能会出现以下标注：

- 对于没有实现逻辑的行，将会用 `-` 填充。
- 对于实现逻辑但是没有被调用的行，将会用灰色背景标注，并显示 `0`。
- 对于只有一个函数调用的行，将会用绿色背景标注，并显示这个函数的调用次数。
- 对于有多个函数调用的行，将会用红色背景标注，并显示这些函数调用次数的加和。

对于一个行，如果其被定义为不同类的实现逻辑，亦视为被多个函数调用，例如 `a_class<int>` 和 `a_class<long long>` 下的同一行代码，将会认为被多个函数调用。同时，多个函数排在一行，也会认为这行被多个函数调用。

如果这个行的调用次数被绿色或者红色标注，那么这个标注可以被点击。此时在上方将会展示这行的调用相关信息。信息分为若干个部分，每个部分包含一个函数对它的调用信息。对于一个部分：

- 第一行给出调用它的函数名称和位置，同时显示调用次数和在这些调用下花费的时间。
- 如果这行是这个函数的定义所在代码行，那么给出若干行，表示调用这个函数的父函数，以及这些父函数对这个函数的调用次数。在最右侧包含两个时间，代表 **这个父函数调用该函数时的 自身计算时间 self 和 子函数计算时间 children**，关于其定义可以参考 `gprof` 的介绍。这部分将会设置为红色背景。
- 如果这行调用了一些函数，那么给出若干行，表示被调用的子函数，以及这些子函数被调用的次数。在最右侧包含两个时间，代表 **这个代码行调用该子函数时的 自身计算时间 self 和 子函数计算时间 children**，关于其定义可以参考 `gprof` 的介绍。这部分将会设置为绿色背景。

### 关于 C++ Addon

目前，我们已经编译好了 Windows 和 Linux 系统下监视器的 C++ Addon。源代码可以在 `addon` 文件夹中找到，其中包含三个函数：
```cpp
GetCpuUsageRatio(pid) // 根据进程返回 CPU 使用量，不需要转化为百分数
GetMemoryUsage(pid) // 根据进程返回内存使用量，以字节为但闻
GetIOBytes(pid) // 根据进程返回一个 V8 环境下的数组，其中两个元素分别代表进程目前的输入和输出数据量
```

如果你有能力的话，也欢迎你帮助我们编译其他系统的 C++ Addon。在编译后，请将其命名为 `perf_[platform]_[arch].node` 并放在 `addon` 文件夹下。在 `run` 指令中，程序将会自动引入当前系统下的监视器文件并运行。测试完成后，请开启 PR 并提供源代码和编译好的 `node` 文件。

根据反馈，在含有 `binding.gyp` 的项目中运行 `npm install` 会导致项目自动开始编译，而这并不是我们期待的。因此这个文件被加入到 `.gitignore` 中，下面给出基础模板：

```json
{
  "targets": [
    {
      "target_name": "perf_win32",
      "sources": [
        "./addon/perf_win32.cpp"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ]
    }
  ]
}

```