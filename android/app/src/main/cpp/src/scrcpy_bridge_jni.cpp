#include <android/log.h>
#include <jni.h>

#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>

#include "freehands/adaptive_quality.h"
#include "freehands/frame_queue.h"
#include "freehands/scrcpy_bridge.h"

namespace {

constexpr const char* kLogTag = "FreeHandsNative";

void logError(const std::string& message) {
  __android_log_print(ANDROID_LOG_ERROR, kLogTag, "%s", message.c_str());
}

// Owns every native bridge instance created from Kotlin. A handle is a plain
// integer so the Java side never holds a raw pointer.
class BridgeRegistry {
 public:
  static BridgeRegistry& instance() {
    static BridgeRegistry registry;
    return registry;
  }

  jlong create(jint width, jint height, jint fps, jint bitrate_kbps,
               jlong latency_budget_ms, jint queue_capacity) {
    std::lock_guard<std::mutex> lock(mutex_);
    freehands::ScrcpyBridge::Config config;
    config.width = width > 0 ? width : 1080;
    config.height = height > 0 ? height : 1920;
    config.fps = fps > 0 ? fps : 12;
    config.bitrate_kbps = bitrate_kbps > 0 ? bitrate_kbps : 4000;
    config.latency_budget_ms =
        latency_budget_ms > 0 ? latency_budget_ms : 150;
    config.queue_capacity =
        queue_capacity > 0 ? static_cast<size_t>(queue_capacity) : 8;
    const jlong handle = next_handle_++;
    bridges_[handle] = std::make_unique<freehands::ScrcpyBridge>(config);
    return handle;
  }

  freehands::ScrcpyBridge* find(jlong handle) {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto it = bridges_.find(handle);
    return it == bridges_.end() ? nullptr : it->second.get();
  }

  void destroy(jlong handle) {
    std::unique_ptr<freehands::ScrcpyBridge> bridge;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      const auto it = bridges_.find(handle);
      if (it == bridges_.end()) {
        return;
      }
      bridge = std::move(it->second);
      bridges_.erase(it);
    }
    // Destroyed outside the lock: stop() joins the capture thread.
    bridge->stop();
  }

 private:
  BridgeRegistry() = default;

  std::mutex mutex_;
  std::unordered_map<jlong, std::unique_ptr<freehands::ScrcpyBridge>> bridges_;
  jlong next_handle_ = 1;
};

// Per-handle JNI frame sink, installed on demand. Frames are delivered to the
// Kotlin consumer as a byte[]; the sink detaches from the JVM on the native
// capture thread.
class JniSink {
 public:
  JniSink(JavaVM* vm, jobject consumer)
      : vm_(vm), consumer_(nullptr), method_(nullptr) {
    JNIEnv* env = nullptr;
    if (vm_->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) !=
        JNI_OK) {
      return;
    }
    consumer_ = env->NewGlobalRef(consumer);
    if (consumer_ == nullptr) {
      return;
    }
    jclass clazz = env->GetObjectClass(consumer_);
    method_ = env->GetMethodID(clazz, "onFrame", "([BJIJII)Z");
    env->DeleteLocalRef(clazz);
    if (method_ == nullptr) {
      env->DeleteGlobalRef(consumer_);
      consumer_ = nullptr;
    }
  }

  ~JniSink() {
    if (consumer_ == nullptr) {
      return;
    }
    JNIEnv* env = nullptr;
    const bool attached = attach(env);
    if (env != nullptr) {
      env->DeleteGlobalRef(consumer_);
    }
    if (attached) {
      vm_->DetachCurrentThread();
    }
  }

  bool valid() const { return consumer_ != nullptr && method_ != nullptr; }

  bool deliver(const freehands::EncodedFrame& frame) {
    JNIEnv* env = nullptr;
    const bool attached = attach(env);
    if (env == nullptr) {
      logError("failed to attach capture thread to the JVM");
      return false;
    }
    jbyteArray array = env->NewByteArray(static_cast<jsize>(frame.data.size()));
    if (array == nullptr) {
      detachIfNeeded(attached);
      return false;
    }
    env->SetByteArrayRegion(
        array, 0, static_cast<jsize>(frame.data.size()),
        reinterpret_cast<const jbyte*>(frame.data.data()));
    const jboolean accepted = env->CallBooleanMethod(
        consumer_, method_, array, static_cast<jlong>(frame.sequence),
        static_cast<jint>(frame.capture_ts_us),
        static_cast<jboolean>(frame.keyframe), frame.width, frame.height,
        frame.bitrate_kbps);
    env->DeleteLocalRef(array);
    const bool ok = env->ExceptionCheck() == JNI_FALSE;
    if (!ok) {
      env->ExceptionDescribe();
      env->ExceptionClear();
    }
    detachIfNeeded(attached);
    return ok && accepted == JNI_TRUE;
  }

 private:
  bool attach(JNIEnv*& env) {
    env = nullptr;
    if (vm_->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) ==
        JNI_OK) {
      return false;  // already attached; do not detach on the way out
    }
    if (vm_->AttachCurrentThread(&env, nullptr) != JNI_OK) {
      env = nullptr;
      return false;
    }
    return true;
  }

  void detachIfNeeded(bool attached) {
    if (attached) {
      vm_->DetachCurrentThread();
    }
  }

  JavaVM* vm_;
  jobject consumer_;
  jmethodID method_;
};

std::mutex g_sink_mutex;
std::unordered_map<jlong, std::unique_ptr<JniSink>> g_sinks;

JavaVM* g_vm = nullptr;

}  // namespace

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* /*reserved*/) {
  g_vm = vm;
  return JNI_VERSION_1_6;
}

extern "C" JNIEXPORT jlong JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativeCreate(
    JNIEnv* /*env*/, jclass /*clazz*/, jint width, jint height, jint fps,
    jint bitrate_kbps, jlong latency_budget_ms, jint queue_capacity) {
  return BridgeRegistry::instance().create(width, height, fps, bitrate_kbps,
                                           latency_budget_ms, queue_capacity);
}

extern "C" JNIEXPORT void JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativeDestroy(
    JNIEnv* /*env*/, jclass /*clazz*/, jlong handle) {
  {
    std::lock_guard<std::mutex> lock(g_sink_mutex);
    g_sinks.erase(handle);
  }
  BridgeRegistry::instance().destroy(handle);
}

extern "C" JNIEXPORT jboolean JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativeStart(
    JNIEnv* /*env*/, jclass /*clazz*/, jlong handle) {
  freehands::ScrcpyBridge* bridge = BridgeRegistry::instance().find(handle);
  if (bridge == nullptr) {
    logError("nativeStart on unknown handle");
    return JNI_FALSE;
  }
  return bridge->start() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativeStop(
    JNIEnv* /*env*/, jclass /*clazz*/, jlong handle) {
  freehands::ScrcpyBridge* bridge = BridgeRegistry::instance().find(handle);
  if (bridge != nullptr) {
    bridge->stop();
  }
}

extern "C" JNIEXPORT jboolean JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativeIsRunning(
    JNIEnv* /*env*/, jclass /*clazz*/, jlong handle) {
  freehands::ScrcpyBridge* bridge = BridgeRegistry::instance().find(handle);
  return (bridge != nullptr && bridge->running()) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativePushFrame(
    JNIEnv* env, jclass /*clazz*/, jlong handle, jbyteArray data,
    jlong capture_ts_us, jboolean keyframe, jint width, jint height) {
  freehands::ScrcpyBridge* bridge = BridgeRegistry::instance().find(handle);
  if (bridge == nullptr || data == nullptr) {
    return JNI_FALSE;
  }
  const jsize length = env->GetArrayLength(data);
  if (length <= 0) {
    return JNI_FALSE;
  }
  std::vector<uint8_t> buffer(static_cast<size_t>(length));
  env->GetByteArrayRegion(data, 0, length,
                          reinterpret_cast<jbyte*>(buffer.data()));
  freehands::RawFrame frame;
  frame.data = buffer.data();
  frame.length = buffer.size();
  frame.capture_ts_us = capture_ts_us;
  frame.keyframe = keyframe == JNI_TRUE;
  frame.width = width;
  frame.height = height;
  return bridge->pushFrame(frame) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jint JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativePushEncodedChunk(
    JNIEnv* env, jclass /*clazz*/, jlong handle, jbyteArray data,
    jlong capture_ts_us) {
  freehands::ScrcpyBridge* bridge = BridgeRegistry::instance().find(handle);
  if (bridge == nullptr || data == nullptr) {
    return 0;
  }
  const jsize length = env->GetArrayLength(data);
  if (length <= 0) {
    return 0;
  }
  std::vector<uint8_t> buffer(static_cast<size_t>(length));
  env->GetByteArrayRegion(data, 0, length,
                          reinterpret_cast<jbyte*>(buffer.data()));
  return static_cast<jint>(
      bridge->pushEncodedChunk(buffer.data(), buffer.size(), capture_ts_us));
}

extern "C" JNIEXPORT jboolean JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativeSetSink(
    JNIEnv* env, jclass /*clazz*/, jlong handle, jobject consumer) {
  freehands::ScrcpyBridge* bridge = BridgeRegistry::instance().find(handle);
  if (bridge == nullptr || g_vm == nullptr) {
    return JNI_FALSE;
  }
  if (consumer == nullptr) {
    std::lock_guard<std::mutex> lock(g_sink_mutex);
    g_sinks.erase(handle);
    bridge->setSink(nullptr);
    return JNI_TRUE;
  }
  auto sink = std::make_unique<JniSink>(g_vm, consumer);
  if (!sink->valid()) {
    logError("consumer does not implement onFrame([BJIJII)Z");
    return JNI_FALSE;
  }
  JniSink* raw = sink.get();
  {
    std::lock_guard<std::mutex> lock(g_sink_mutex);
    g_sinks[handle] = std::move(sink);
  }
  bridge->setSink([raw](const freehands::EncodedFrame& frame) {
    return raw->deliver(frame);
  });
  return JNI_TRUE;
}

extern "C" JNIEXPORT void JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativeRecordStage(
    JNIEnv* /*env*/, jclass /*clazz*/, jlong handle, jint stage,
    jlong duration_ms) {
  freehands::ScrcpyBridge* bridge = BridgeRegistry::instance().find(handle);
  if (bridge != nullptr) {
    bridge->recordStage(stage, duration_ms);
  }
}

extern "C" JNIEXPORT jlongArray JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativeLatencyStats(
    JNIEnv* env, jclass /*clazz*/, jlong handle) {
  freehands::ScrcpyBridge* bridge = BridgeRegistry::instance().find(handle);
  freehands::LatencyBudget::Stats stats;
  if (bridge != nullptr) {
    stats = bridge->latencyStats();
  }
  constexpr jsize kCount = 9;
  jlong values[kCount] = {
      static_cast<jlong>(stats.budget_ms),   static_cast<jlong>(stats.total_ms),
      static_cast<jlong>(stats.remaining_ms), static_cast<jlong>(stats.stage_ms[0]),
      static_cast<jlong>(stats.stage_ms[1]), static_cast<jlong>(stats.stage_ms[2]),
      static_cast<jlong>(stats.stage_ms[3]), static_cast<jlong>(stats.stage_ms[4]),
      static_cast<jlong>(stats.samples)};
  jlongArray array = env->NewLongArray(kCount);
  if (array == nullptr) {
    return nullptr;
  }
  env->SetLongArrayRegion(array, 0, kCount, values);
  return array;
}

extern "C" JNIEXPORT jintArray JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativeQualitySettings(
    JNIEnv* env, jclass /*clazz*/, jlong handle) {
  freehands::ScrcpyBridge* bridge = BridgeRegistry::instance().find(handle);
  freehands::AdaptiveQuality::Settings settings{1080, 1920, 4000, 12};
  if (bridge != nullptr) {
    settings = bridge->settings();
  }
  constexpr jsize kCount = 4;
  jint values[kCount] = {settings.width, settings.height, settings.bitrate_kbps,
                         settings.fps};
  jintArray array = env->NewIntArray(kCount);
  if (array == nullptr) {
    return nullptr;
  }
  env->SetIntArrayRegion(array, 0, kCount, values);
  return array;
}

extern "C" JNIEXPORT jlong JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativeDroppedFrames(
    JNIEnv* /*env*/, jclass /*clazz*/, jlong handle) {
  freehands::ScrcpyBridge* bridge = BridgeRegistry::instance().find(handle);
  return bridge == nullptr ? 0 : static_cast<jlong>(bridge->droppedFrames());
}

extern "C" JNIEXPORT jlong JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativeFramesCaptured(
    JNIEnv* /*env*/, jclass /*clazz*/, jlong handle) {
  freehands::ScrcpyBridge* bridge = BridgeRegistry::instance().find(handle);
  return bridge == nullptr ? 0 : static_cast<jlong>(bridge->framesCaptured());
}

extern "C" JNIEXPORT jstring JNICALL
Java_dev_openhands_agentcanvas_freehands_ScrcpyBridge_nativeLastError(
    JNIEnv* env, jclass /*clazz*/, jlong handle) {
  freehands::ScrcpyBridge* bridge = BridgeRegistry::instance().find(handle);
  const std::string message = bridge == nullptr ? std::string() : bridge->lastError();
  return env->NewStringUTF(message.c_str());
}
