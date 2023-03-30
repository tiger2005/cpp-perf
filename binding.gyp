{
  "targets": [
    {
      "target_name": "perf_win32",
      "sources": [
        "./addon/perf_win32.cpp"
      ],
      'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ]
    }
  ]
}
