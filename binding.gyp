{
  "targets": [
    {
      "target_name": "perf_linux",
      "sources": [
        "./addon/perf_linux.cpp"
      ],
      'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ]
    }
  ]
}
