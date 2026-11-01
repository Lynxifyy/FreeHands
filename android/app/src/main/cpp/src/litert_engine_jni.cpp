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
#include <memory>
#include <string>
#include <vector>

#include "freehands/litert_engine.h"
#include "freehands/model.h"

namespace {

using freehands::GenerationStats;
using freehands::LiteRTEngine;

// The engine is stored behind an opaque handle. A shared_ptr in a static table
// keyed by the handle would let a stale handle from a closed session reach a
// freed engine, so the handle is the pointer itself and close() deletes it.
LiteRTEngine* toEngine(jlong handle) {
  return reinterpret_cast<LiteRTEngine*>(static_cast<intptr_t>(handle));
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
  auto engine = std::make_unique<LiteRTEngine>();
  std::string error;
  if (!engine->loadModel(path, &error)) {
    return 0;
  }
  // Ownership passes to Kotlin; nativeClose deletes it.
  return static_cast<jlong>(reinterpret_cast<intptr_t>(engine.release()));
}

extern "C" JNIEXPORT jstring JNICALL
Java_dev_openhands_agentcanvas_freehands_LiteLLMInference_nativeGenerate(JNIEnv* env,
                                                                        jobject /*thiz*/,
                                                                        jlong handle,
                                                                        jstring prompt,
                                                                        jint maxTokens) {
  LiteRTEngine* engine = toEngine(handle);
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
  delete toEngine(handle);
}

// Reports the last run's timings as
// [promptTokens, generatedTokens, prefillMs, decodeMs, tokensPerSecond, evictions].
extern "C" JNIEXPORT jlongArray JNICALL
Java_dev_openhands_agentcanvas_freehands_LiteLLMInference_nativeLastStats(JNIEnv* env,
                                                                         jobject /*thiz*/,
                                                                         jlong handle) {
  jlong values[6] = {0, 0, 0, 0, 0, 0};
  LiteRTEngine* engine = toEngine(handle);
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
  LiteRTEngine* engine = toEngine(handle);
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
  LiteRTEngine* engine = toEngine(handle);
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
  LiteRTEngine* engine = toEngine(handle);
  return env->NewStringUTF(engine == nullptr ? "none" : engine->backendName());
}
