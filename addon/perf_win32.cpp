// Code from https://zhuanlan.zhihu.com/p/266839249
// #include <iostream>
#include <napi.h>
#include <process.h>
#include <string.h>
#include <windows.h>

//#include <tlhelp32.h>
#include <direct.h>
#include <psapi.h>
#include <time.h>

// get current process pid
inline int GetCurrentPid() {
  return getpid();
}

// get specific process cpu occupation ratio by pid
static uint64_t convert_time_format(const FILETIME* ftime) {
  LARGE_INTEGER li;

  li.LowPart = ftime->dwLowDateTime;
  li.HighPart = ftime->dwHighDateTime;
  return li.QuadPart;
}

bool tf = false, ttf = false;

Napi::Value GetCpuUsageRatio(const Napi::CallbackInfo& _info) {
  Napi::Env env = _info.Env();
  if (_info.Length() < 1) {
    Napi::TypeError::New(env, "WRONG_ARGUMENT_LENGHT")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  int pid = _info[0].As<Napi::Number>().Int32Value();
  static int64_t last_time = 0;
  static int64_t last_system_time = 0;

  FILETIME now;
  FILETIME creation_time;
  FILETIME exit_time;
  FILETIME kernel_time;
  FILETIME user_time;
  int64_t system_time;
  int64_t time;
  int64_t system_time_delta;
  int64_t time_delta;

  // get cpu num
  SYSTEM_INFO info;
  GetSystemInfo(&info);
  int cpu_num = info.dwNumberOfProcessors;

  float cpu_ratio = 0.0;

  // get process hanlde by pid
  HANDLE process = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid);
  // std::cout << "? " << GetLastError() << std::endl;
  if (process == NULL) {
    Napi::TypeError::New(env, "PID_NOT_FOUND").ThrowAsJavaScriptException();
    return env.Null();
  }
  DWORD returnCode;
  if (GetExitCodeProcess(process, &returnCode)) {
    if (returnCode != STILL_ACTIVE) {
      if (tf) {
        Napi::TypeError::New(env, "PID_NOT_FOUND").ThrowAsJavaScriptException();
        return env.Null();
      }
      else
        ttf = true;
    }
  }
  // use GetCurrentProcess() can get current process and no need to close handle

  // get now time
  GetSystemTimeAsFileTime(&now);

  if (!GetProcessTimes(process, &creation_time, &exit_time, &kernel_time, &user_time)) {
    // We don't assert here because in some cases (such as in the Task Manager)
    // we may call this function on a process that has just exited but we have
    // not yet received the notification.
    Napi::TypeError::New(env, "TIME_ERROR").ThrowAsJavaScriptException();
    return env.Null();
  }

  // should handle the multiple cpu num
  system_time = (convert_time_format(&kernel_time) + convert_time_format(&user_time)) / cpu_num;
  time = convert_time_format(&now);

  if ((last_system_time == 0) || (last_time == 0)) {
    // First call, just set the last values.
    last_system_time = system_time;
    last_time = time;
    return Napi::Number::New(env, 0);
  }

  system_time_delta = system_time - last_system_time;
  time_delta = time - last_time;

  CloseHandle(process);

  if (time_delta == 0) {
    Napi::TypeError::New(env, "TIME_ERROR").ThrowAsJavaScriptException();
    return env.Null();
  }

  // We add time_delta / 2 so the result is rounded.
  cpu_ratio = (system_time_delta * 1.0 / time_delta);  // the % unit
  last_system_time = system_time;
  last_time = time;

  return Napi::Number::New(env, cpu_ratio);
}

// get specific process physical memeory occupation size by pid (MB)
Napi::Value GetMemoryUsage(const Napi::CallbackInfo& _info) {
  Napi::Env env = _info.Env();
  if (_info.Length() < 1) {
    Napi::TypeError::New(env, "WRONG_ARGUMENT_LENGHT")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  int pid = _info[0].As<Napi::Number>().Int32Value();
  uint64_t mem = 0;
  PROCESS_MEMORY_COUNTERS pmc;

  // get process hanlde by pid
  HANDLE process = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid);
  if (process == NULL) {
    Napi::TypeError::New(env, "PID_NOT_FOUND").ThrowAsJavaScriptException();
    return env.Null();
  }
  DWORD returnCode;
  if (GetExitCodeProcess(process, &returnCode)) {
    if (returnCode != STILL_ACTIVE) {
      if (tf) {
        Napi::TypeError::New(env, "PID_NOT_FOUND").ThrowAsJavaScriptException();
        return env.Null();
      }
      else
        ttf = true;
    }
  }
  if (GetProcessMemoryInfo(process, &pmc, sizeof(pmc))) {
    mem = pmc.WorkingSetSize;
    // vmem = pmc.PagefileUsage;
  } else {
    Napi::TypeError::New(env, "MEMORY_ERROR").ThrowAsJavaScriptException();
    return env.Null();
  }
  CloseHandle(process);
  return Napi::Number::New(env, mem);
}

Napi::Value GetIOBytes(const Napi::CallbackInfo& _info) {
  Napi::Env env = _info.Env();
  if (_info.Length() < 1) {
    Napi::TypeError::New(env, "WRONG_ARGUMENT_LENGHT")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  int pid = _info[0].As<Napi::Number>().Int32Value();
  IO_COUNTERS io_counter;
  HANDLE process = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid);
  if (process == NULL) {
    Napi::TypeError::New(env, "PID_NOT_FOUND").ThrowAsJavaScriptException();
    return env.Null();
  }
  DWORD returnCode;
  if (GetExitCodeProcess(process, &returnCode)) {
    if (returnCode != STILL_ACTIVE) {
      if (tf) {
        Napi::TypeError::New(env, "PID_NOT_FOUND").ThrowAsJavaScriptException();
        return env.Null();
      }
      else
        ttf = true;
    }
  }
  if (GetProcessIoCounters(process, &io_counter)) {
    Napi::Array arr = Napi::Array::New(env, 2);
    arr.Set(Napi::Number::New(env, 0), Napi::Number::New(env, io_counter.ReadTransferCount));
    arr.Set(Napi::Number::New(env, 1), Napi::Number::New(env, io_counter.WriteTransferCount));
    // deal with storage
    tf |= ttf;
    return arr;
  }
  Napi::TypeError::New(env, "IO_ERROR").ThrowAsJavaScriptException();
  return env.Null();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("GetCpuUsageRatio", Napi::Function::New(env, GetCpuUsageRatio));
  exports.Set("GetMemoryUsage", Napi::Function::New(env, GetMemoryUsage));
  exports.Set("GetIOBytes", Napi::Function::New(env, GetIOBytes));
  return exports;
}

NODE_API_MODULE(addon, Init)