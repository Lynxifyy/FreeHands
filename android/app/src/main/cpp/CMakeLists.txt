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

# The core pipeline has no Android dependency so it builds and tests on the
# host as well as under the NDK.
add_library(freehands_core STATIC ${FREEHANDS_CORE_SOURCES})
target_include_directories(freehands_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
find_package(Threads REQUIRED)
target_link_libraries(freehands_core PUBLIC Threads::Threads)

if(ANDROID)
  add_library(freehands_bridge SHARED src/scrcpy_bridge_jni.cpp)
  target_include_directories(freehands_bridge PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
  target_link_libraries(freehands_bridge PRIVATE freehands_core log android)
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
  include(GoogleTest)
  gtest_discover_tests(freehands_tests)
endif()
