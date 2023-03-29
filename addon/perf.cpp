// Code from https://zhuanlan.zhihu.com/p/266839249
#include <iostream>
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

inline float GetCpuUsageRatio(int pid) {
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
    throw "PID_NOT_FOUND";
  }
  DWORD returnCode;
  if (GetExitCodeProcess(process, &returnCode)) {
    if (returnCode != STILL_ACTIVE) {
      if (tf)
        throw "PID_NOT_FOUND";
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
    throw "TIME_ERROR";
  }

  // should handle the multiple cpu num
  system_time = (convert_time_format(&kernel_time) + convert_time_format(&user_time)) / cpu_num;
  time = convert_time_format(&now);

  if ((last_system_time == 0) || (last_time == 0)) {
    // First call, just set the last values.
    last_system_time = system_time;
    last_time = time;
    return 0.0;
  }

  system_time_delta = system_time - last_system_time;
  time_delta = time - last_time;

  CloseHandle(process);

  if (time_delta == 0) {
    throw "TIME_ERROR";
  }

  // We add time_delta / 2 so the result is rounded.
  cpu_ratio = (system_time_delta * 1.0 / time_delta);  // the % unit
  last_system_time = system_time;
  last_time = time;

  return cpu_ratio;
}

// get specific process physical memeory occupation size by pid (MB)
inline uint64_t GetMemoryUsage(int pid) {
  uint64_t mem = 0;
  PROCESS_MEMORY_COUNTERS pmc;

  // get process hanlde by pid
  HANDLE process = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid);
  if (process == NULL) {
    throw "PID_NOT_FOUND";
  }
  DWORD returnCode;
  if (GetExitCodeProcess(process, &returnCode)) {
    if (returnCode != STILL_ACTIVE) {
      if (tf)
        throw "PID_NOT_FOUND";
      else
        ttf = true;
    }
  }
  if (GetProcessMemoryInfo(process, &pmc, sizeof(pmc))) {
    mem = pmc.WorkingSetSize;
    // vmem = pmc.PagefileUsage;
  } else {
    throw "MEMORY_ERROR";
  }
  CloseHandle(process);

  // use GetCurrentProcess() can get current process and no need to close handle

  // convert mem from B to MB
  return mem;
}

std::pair<uint64_t, uint64_t> GetIOBytes(int pid) {
  IO_COUNTERS io_counter;
  HANDLE process = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid);
  if (process == NULL) {
    throw "PID_NOT_FOUND";
  }
  DWORD returnCode;
  if (GetExitCodeProcess(process, &returnCode)) {
    if (returnCode != STILL_ACTIVE) {
      if (tf)
        throw "PID_NOT_FOUND";
      else
        ttf = true;
    }
  }
  if (GetProcessIoCounters(process, &io_counter))
    return std::make_pair(io_counter.ReadTransferCount, io_counter.WriteTransferCount);
  throw "IO_ERROR";
}

int main() {
  int pid, interval;
  std::ios::sync_with_stdio(false);
  std::cin.tie(0);
  std::cout.tie(0);
  std::cin >> pid >> interval;
  clock_t st = clock();
  while (true) {
    try {
      float cpu = GetCpuUsageRatio(pid);
      uint64_t mem = GetMemoryUsage(pid);
      std::pair<uint64_t, uint64_t> io = GetIOBytes(pid);
      std::cout << (clock() - st) << " " << cpu << " " << mem << " " << io.first << " " << io.second << std::endl;
      Sleep(interval);
      tf |= ttf;
    } catch (const char* err) {
      std::cerr << err << std::endl;
      break;
    }
  }
  return 0;
}