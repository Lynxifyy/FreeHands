// JNI bridge for the on-device inference engine.
//
// Kotlin loads this as `liblitertlm` and calls the `native*` methods declared on
// LiteLLMInference. The engine itself lives in litert_engine.cpp and has no
// Android dependency; this file is the only place that knows about jni.h, so
// the engine stays testable on the host.
//
// Every entry point converts its arguments, calls the engine, and translates a
// failure into a value the Kotlin side already handles (0 for a handle, an
// empty string for text) rather than throwing: the agent loop treats a missing
// engine as "route to the cloud", and an exception across JNI would instead
// crash the service.

#include <jni.h>

#include <cstdint>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "freehands/litert_engine.h"
#include "freehands/model.h"

namespace {

using freehands::GenerationStats;
using freehands::LiteRTEngine;

// Live sessions, keyed by the handle Kotlin holds. The registry owns the
// engine, and every entry point takes a reference out of it before doing work,
// so a close on one thread cannot free an engine that another thread is inside.
//
// Keeping the registry rather than making the handle a raw pointer is what
// makes that safe: a raw pointer would have to be dereferenced before it could
// be checked, so a close racing a call would be a use-after-free on the handle
// itself, not just on the engine.
struct Session {
  std::shared_ptr<LiteRTEngine> engine;
};

std::mutex& registryMutex() {
  static std::mutex mutex;
  return mutex;
}

std::map<jlong, std::shared_ptr<Session>>& registry() {
  static std::map<jlong, std::shared_ptr<Session>> sessions;
  return sessions;
}

// Borrows the engine for the duration of a call, or null when the handle is
// unknown or the session has already been closed.
std::shared_ptr<LiteRTEngine> borrow(jlong handle) {
  std::lock_guard<std::mutex> guard(registryMutex());
  auto& sessions = registry();
  const auto it = sessions.find(handle);
  if (it == sessions.end()) {
    return nullptr;
  }
  return it->second->engine;
}

std::string toStdString(JNIEnv* env, jstring value) {
  if (value == nullptr) {
    return "";
  }
  const char* raw = env->GetStringUTFChars(value, nullptr);
  if (raw == nullptr) {
    return "";
  }
  std::string result(raw);
  env->ReleaseStringUTFChars(value, raw);
  return result;
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_dev_openhands_agentcanvas_freehands_LiteLLMInference_nativeOpen(JNIEnv* env,
                                                                     jclass /*clazz*/,
                                                                     jstring modelPath) {
  const std::string path = toStdString(env, modelPath);
  if (path.empty()) {
    return 0;
  }
  auto engine = std::make_shared<LiteRTEngine>();
  std::string error;
  if (!engine->loadModel(path, &error)) {
    return 0;
  }
  auto session = std::make_shared<Session>();
  session->engine = std::move(engine);
  std::lock_guard<std::mutex> guard(registryMutex());
  auto& sessions = registry();
  // A fresh address cannot collide with a live key, but be explicit rather
  // than relying on that.
  jlong handle = static_cast<jlong>(reinterpret_cast<intptr_t>(session.get()));
  while (sessions.count(handle) != 0) {
    handle += 1;
  }
  sessions.emplace(handle, std::move(session));
  // Ownership passes to Kotlin; nativeClose removes it.
  return handle;
}

extern "C" JNIEXPORT jstring JNICALL
Java_dev_openhands_agentcanvas_freehands_LiteLLMInference_nativeGenerate(JNIEnv* env,
                                                                        jobject /*thiz*/,
                                                                        jlong handle,
                                                                        jstring prompt,
                                                                        jint maxTokens) {
  const std::shared_ptr<LiteRTEngine> engine = borrow(handle);
  if (engine == nullptr) {
    return env->NewStringUTF("");
  }
  if (maxTokens > 0) {
    engine->setMaxTokens(maxTokens);
  }
  const std::string text = engine->generate(toStdString(env, prompt));
  return env->NewStringUTF(text.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_dev_openhands_agentcanvas_freehands_LiteLLMInference_nativeClose(JNIEnv* /*env*/,
                                                                     jclass /*clazz*/,
                                                                     jlong handle) {
  std::shared_ptr<Session> session;
  {
    std::lock_guard<std::mutex> guard(registryMutex());
    auto& sessions = registry();
    const auto it = sessions.find(handle);
    if (it == sessions.end()) {
      return;
    }
    session = std::move(it->second);
    sessions.erase(it);
  }
  // The session lives on until the last in-flight call releases its reference,
  // so an engine is never freed while a generate is inside it.
  session->engine.reset();
}

// Reports the last run's timings as
// [promptTokens, generatedTokens, prefillMs, decodeMs, tokensPerSecond, evictions].
extern "C" JNIEXPORT jlongArray JNICALL
Java_dev_openhands_agentcanvas_freehands_LiteLLMInference_nativeLastStats(JNIEnv* env,
                                                                         jobject /*thiz*/,
                                                                         jlong handle) {
  jlong values[6] = {0, 0, 0, 0, 0, 0};
  const std::shared_ptr<LiteRTEngine> engine = borrow(handle);
  if (engine != nullptr) {
    const GenerationStats stats = engine->lastStats();
    values[0] = static_cast<jlong>(stats.prompt_tokens);
    values[1] = static_cast<jlong>(stats.generated_tokens);
    values[2] = static_cast<jlong>(stats.prefill_ms);
    values[3] = static_cast<jlong>(stats.decode_ms);
    values[4] = static_cast<jlong>(stats.tokens_per_second);
    values[5] = static_cast<jlong>(stats.kv_evictions);
  }
  jlongArray result = env->NewLongArray(6);
  if (result != nullptr) {
    env->SetLongArrayRegion(result, 0, 6, values);
  }
  return result;
}

// Cancels an in-flight generation. Safe to call from another thread.
extern "C" JNIEXPORT void JNICALL
Java_dev_openhands_agentcanvas_freehands_LiteLLMInference_nativeCancel(JNIEnv* /*env*/,
                                                                      jobject /*thiz*/,
                                                                      jlong handle) {
  // No lock: cancel has to reach an engine whose caller is holding it.
  const std::shared_ptr<LiteRTEngine> engine = borrow(handle);
  if (engine != nullptr) {
    engine->cancel();
  }
}

// Reports the model's dimensions as [dModel, nLayers, vocabSize, maxContext].
// Used by the UI to describe the loaded model without parsing the file again.
extern "C" JNIEXPORT jlongArray JNICALL
Java_dev_openhands_agentcanvas_freehands_LiteLLMInference_nativeModelInfo(JNIEnv* env,
                                                                         jobject /*thiz*/,
                                                                         jlong handle) {
  jlong values[4] = {0, 0, 0, 0};
  const std::shared_ptr<LiteRTEngine> engine = borrow(handle);
  if (engine != nullptr && engine->model() != nullptr) {
    values[0] = engine->model()->d_model;
    values[1] = engine->model()->n_layers;
    values[2] = engine->model()->vocab_size;
    values[3] = engine->model()->max_context;
  }
  jlongArray result = env->NewLongArray(4);
  if (result != nullptr) {
    env->SetLongArrayRegion(result, 0, 4, values);
  }
  return result;
}

extern "C" JNIEXPORT jstring JNICALL
Java_dev_openhands_agentcanvas_freehands_LiteLLMInference_nativeBackendName(JNIEnv* env,
                                                                           jobject /*thiz*/,
                                                                           jlong handle) {
  const std::shared_ptr<LiteRTEngine> engine = borrow(handle);
  return env->NewStringUTF(engine == nullptr ? "none" : engine->backendName());
}
