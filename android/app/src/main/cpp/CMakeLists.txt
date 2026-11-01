cmake_minimum_required(VERSION 3.22)
project(freehands_native CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

option(FREEHANDS_BUILD_TESTS "Build the host unit tests" OFF)

set(FREEHANDS_CORE_SOURCES
    src/h264_parser.cpp
    src/frame_queue.cpp
    src/latency_budget.cpp
    src/adaptive_quality.cpp
    src/scrcpy_bridge.cpp)

# The inference core is separate from the capture core so a build can ship one
# without the other, and so the capture tests do not link the model code.
set(FREEHANDS_INFERENCE_SOURCES
    src/memory_pool.cpp
    src/kernel_backend.cpp
    src/tokenizer.cpp
    src/quantization.cpp
    src/kv_cache.cpp
    src/model.cpp
    src/litert_engine.cpp)

# The core pipeline has no Android dependency so it builds and tests on the
# host as well as under the NDK.
add_library(freehands_core STATIC ${FREEHANDS_CORE_SOURCES})
target_include_directories(freehands_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
find_package(Threads REQUIRED)
target_link_libraries(freehands_core PUBLIC Threads::Threads)

add_library(freehands_inference STATIC ${FREEHANDS_INFERENCE_SOURCES})
target_include_directories(freehands_inference PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_link_libraries(freehands_inference PUBLIC Threads::Threads)

if(ANDROID)
  add_library(freehands_bridge SHARED src/scrcpy_bridge_jni.cpp)
  target_include_directories(freehands_bridge PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
  target_link_libraries(freehands_bridge PRIVATE freehands_core log android)

  # The on-device inference engine, loaded by Kotlin as liblitertlm.
  add_library(litertlm SHARED src/litert_engine_jni.cpp)
  target_include_directories(litertlm PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
  target_link_libraries(litertlm PRIVATE freehands_inference log android)
endif()

if(FREEHANDS_BUILD_TESTS AND NOT ANDROID)
  enable_testing()
  find_package(GTest REQUIRED)
  add_executable(freehands_tests
      tests/h264_parser_test.cpp
      tests/frame_queue_test.cpp
      tests/latency_budget_test.cpp
      tests/adaptive_quality_test.cpp
      tests/scrcpy_bridge_test.cpp)
  target_link_libraries(freehands_tests PRIVATE freehands_core GTest::gtest GTest::gtest_main)
  gtest_discover_tests(freehands_tests)

  add_executable(freehands_inference_tests
      tests/memory_pool_test.cpp
      tests/kernel_backend_test.cpp
      tests/tokenizer_test.cpp
      tests/quantization_test.cpp
      tests/kv_cache_test.cpp
      tests/model_loader_test.cpp
      tests/litert_engine_test.cpp)
  target_link_libraries(freehands_inference_tests
      PRIVATE freehands_inference GTest::gtest GTest::gtest_main)
  gtest_discover_tests(freehands_inference_tests)
endif()
