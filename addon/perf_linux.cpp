// Code from https://zhuanlan.zhihu.com/p/266839249
#include <napi.h>
#include <iostream>
#include <thread>
#include <chrono>
#include <string.h>

#include <sys/stat.h>
#include <sys/sysinfo.h>
#include <sys/time.h>
#include <unistd.h>

// get current process pid
inline int GetCurrentPid()
{
    return getpid();
}

// FIXME: can also get cpu and mem status from popen cmd
// the info line num in /proc/{pid}/status file
#define VMRSS_LINE 22
#define PROCESS_ITEM 14

static const char* get_items(const char* buffer, unsigned int item)
{
    // read from buffer by offset
    const char* p = buffer;

    int len = strlen(buffer);
    int count = 0;

    for (int i = 0; i < len; i++)
    {
        if (' ' == *p)
        {
            count++;
            if (count == item - 1)
            {
                p++;
                break;
            }
        }
        p++;
    }

    return p;
}

static inline unsigned long get_cpu_total_occupy()
{
    // get total cpu use time

    // different mode cpu occupy time
    unsigned long user_time;
    unsigned long nice_time;
    unsigned long system_time;
    unsigned long idle_time;

    FILE* fd;
    char buff[1024] = { 0 };

    fd = fopen("/proc/stat", "r");
    if (nullptr == fd)
        return 0;

    fgets(buff, sizeof(buff), fd);
    char name[64] = { 0 };
    sscanf(buff, "%s %ld %ld %ld %ld", name, &user_time, &nice_time, &system_time, &idle_time);
    fclose(fd);

    return (user_time + nice_time + system_time + idle_time);
}

static inline unsigned long get_cpu_proc_occupy(int pid)
{
    // get specific pid cpu use time
    unsigned int tmp_pid;
    unsigned long utime;  // user time
    unsigned long stime;  // kernel time
    unsigned long cutime; // all user time
    unsigned long cstime; // all dead time

    char file_name[64] = { 0 };
    FILE* fd;
    char line_buff[1024] = { 0 };
    sprintf(file_name, "/proc/%d/stat", pid);

    fd = fopen(file_name, "r");
    if (nullptr == fd)
        return 0;

    fgets(line_buff, sizeof(line_buff), fd);

    sscanf(line_buff, "%u", &tmp_pid);
    const char* q = get_items(line_buff, PROCESS_ITEM);
    sscanf(q, "%ld %ld %ld %ld", &utime, &stime, &cutime, &cstime);
    fclose(fd);

    return (utime + stime + cutime + cstime);
}

Napi::Value GetCpuUsageRatio(const Napi::CallbackInfo& _info)
{
    Napi::Env env = _info.Env();
    if (_info.Length() < 1) {
        Napi::TypeError::New(env, "WRONG_ARGUMENT_LENGHT")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    int pid = _info[0].As<Napi::Number>().Int32Value();
    unsigned long totalcputime1, totalcputime2;
    unsigned long procputime1, procputime2;

    totalcputime1 = get_cpu_total_occupy();
    procputime1 = get_cpu_proc_occupy(pid);

    // FIXME: the 200ms is a magic number, works well
    usleep(200000); // sleep 200ms to fetch two time point cpu usage snapshots sample for later calculation

    totalcputime2 = get_cpu_total_occupy();
    procputime2 = get_cpu_proc_occupy(pid);

    float pcpu = 0.0;
    if (0 != totalcputime2 - totalcputime1)
        pcpu = (procputime2 - procputime1) / float(totalcputime2 - totalcputime1); // float number

    int cpu_num = get_nprocs();
    pcpu *= cpu_num; // should multiply cpu num in multiple cpu machine

    return Napi::Number::New(env, pcpu);
}

// get specific process physical memeory occupation size by pid (MB)
Napi::Value GetMemoryUsage(const Napi::CallbackInfo& _info)
{
    Napi::Env env = _info.Env();
    if (_info.Length() < 1) {
        Napi::TypeError::New(env, "WRONG_ARGUMENT_LENGHT")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    int pid = _info[0].As<Napi::Number>().Int32Value();
    char file_name[64] = { 0 };
    FILE* fd;
    char line_buff[512] = { 0 };
    sprintf(file_name, "/proc/%d/status", pid);

    fd = fopen(file_name, "r");
    if (nullptr == fd) {
        Napi::TypeError::New(env, "NO_SUCH_PROCESS")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    char name[64];
    int vmrss = 0;
    for (int i = 0; i < VMRSS_LINE - 1; i++)
        fgets(line_buff, sizeof(line_buff), fd);

    fgets(line_buff, sizeof(line_buff), fd);
    sscanf(line_buff, "%s %d", name, &vmrss);
    fclose(fd);

    // cnvert VmRSS from KB to B
    return Napi::Number::New(env, vmrss * 1024.0);
}

Napi::Value GetIOBytes(const Napi::CallbackInfo& _info) {
    Napi::Env env = _info.Env();
    if (_info.Length() < 1) {
        Napi::TypeError::New(env, "WRONG_ARGUMENT_LENGHT")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    int pid = _info[0].As<Napi::Number>().Int32Value();

    char file_name[64] = { 0 };
    FILE* fd;
    char line_buff[512] = { 0 };
    sprintf(file_name, "/proc/%d/io", pid);

    fd = fopen(file_name, "r");
    if (nullptr == fd) {
        Napi::TypeError::New(env, "NO_SUCH_PROCESS")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    char name[64];
    int vmrss = 0;

    fgets(line_buff, sizeof(line_buff), fd);
    sscanf(line_buff, "%s %d", name, &vmrss);
    float readByte = vmrss;
    for (int i = 0; i < 4; i++) fgets(line_buff, sizeof(line_buff), fd);
    fgets(line_buff, sizeof(line_buff), fd);
    sscanf(line_buff, "%s %d", name, &vmrss);
    float writeByte = vmrss;
    
    Napi::Array arr = Napi::Array::New(env, 2);
    arr.Set(Napi::Number::New(env, 0), Napi::Number::New(env, readByte));
    arr.Set(Napi::Number::New(env, 1), Napi::Number::New(env, writeByte));
    return arr;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("GetCpuUsageRatio", Napi::Function::New(env, GetCpuUsageRatio));
    exports.Set("GetMemoryUsage", Napi::Function::New(env, GetMemoryUsage));
    exports.Set("GetIOBytes", Napi::Function::New(env, GetIOBytes));
    return exports;
}

NODE_API_MODULE(addon, Init)