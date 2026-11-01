#ifndef FREEHANDS_LITERT_ENGINE_H
#define FREEHANDS_LITERT_ENGINE_H

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "freehands/kernel_backend.h"
#include "freehands/kv_cache.h"
#include "freehands/memory_pool.h"
#include "freehands/model.h"
#include "freehands/tokenizer.h"

namespace freehands {

// Per-token generation statistics.
struct GenerationStats {
  uint64_t prompt_tokens = 0;
  uint64_t generated_tokens = 0;
  // Time to consume the prompt, the prefill.
  double prefill_ms = 0.0;
  // Time per generated token after prefill, the decode rate.
  double decode_ms = 0.0;
  double tokens_per_second = 0.0;
  // Tokens dropped from the KV cache because it was full.
  uint64_t kv_evictions = 0;
};

// Called for every generated token. Returning false stops generation, which is
// what the streaming path uses to cancel.
using TokenCallback = std::function<bool(int32_t token, const std::string& text)>;

// On-device text generation engine.
//
// This is the inference core the Kotlin side reaches through the litertlm
// bridge. It owns the model, the tokenizer, the KV cache and the scratch
// memory pool, and it is deliberately free of Android headers so it builds and
// runs under the host test harness.
//
// Acceleration: every matmul goes through a KernelBackend. The default is the
// portable CPU path; a LiteRT-LM delegate is installed with setBackend() and
// then serves the same calls, so adding a GPU path changes no other file.
//
// Threading: generate() may be called from any thread, and concurrent calls are
// serialised by one mutex rather than rejected, because the agent loop and the
// streaming UI both want to drive generation and a rejected request would just
// be retried. cancel() is lock-free so it works while a call is in flight.
class LiteRTEngine {
 public:
  // Knobs the caller can set before loading a model.
  struct Config {
    // Capacity of the scratch pool used for activations, in bytes. Roughly
    // (d_model + d_ffn) * 4 * a small constant; the pool reports when it is
    // too small through highWaterMark().
    size_t pool_bytes = 32u * 1024u * 1024u;
    // Pages of KV cache per layer, each holding KVCache::kPageSize tokens.
    size_t kv_pages_per_layer = 512;
    // Stop after this many generated tokens, regardless of the stop token.
    int max_tokens = 256;
    // Stop when the token rate drops below this for [stall_ms], which happens
    // when the device thermally throttles.
    double min_tokens_per_second = 0.5;
    int stall_ms = 5000;
    // Sampling temperature. Zero means greedy, which is what the agent's
    // structured-output path wants: a decision must be reproducible.
    float temperature = 0.0f;
    uint32_t seed = 0x9E3779B9u;
  };

  LiteRTEngine();
  explicit LiteRTEngine(Config config);
  ~LiteRTEngine();

  LiteRTEngine(const LiteRTEngine&) = delete;
  LiteRTEngine& operator=(const LiteRTEngine&) = delete;

  // Loads a model file. Returns false and writes a reason to [error] when the
  // file is missing, malformed, or built for a different runtime version.
  bool loadModel(const std::string& path, std::string* error);

  // Loads a model from memory. Useful for tests and for a model delivered in
  // the app bundle rather than the filesystem.
  bool loadModelFromBuffer(const uint8_t* data, size_t length, std::string* error);

  // True once a model is loaded and the engine can generate.
  bool isReady() const {
    return model_ != nullptr && model_->valid() && !tokenizer_.empty();
  }

  const Model* model() const { return model_.get(); }

  // Installs a math backend. Passing nullptr restores the CPU reference. Must
  // not be called while generate() is running.
  void setBackend(const KernelBackend* backend);

  const char* backendName() const;

  // Generates text for [prompt]. When [on_token] is set it is called for every
  // token as it is produced, which is what drives the streaming UI. Returns the
  // full generated text, or an empty string when the engine is not ready or the
  // generation was cancelled.
  std::string generate(const std::string& prompt, const TokenCallback& on_token = nullptr);

  // Same, but also reports what the run cost.
  std::string generate(const std::string& prompt, GenerationStats* stats,
                       const TokenCallback& on_token = nullptr);

  // Asks the next generate() call to stop. Safe to call from another thread and
  // while a generation is in flight.
  void cancel();

  // Clears the KV cache and the pool between runs.
  void reset();

  GenerationStats lastStats() const;

  // Overrides the per-call generation cap. The bridge sets this from the
  // caller's request so one engine can serve calls with different budgets.
  void setMaxTokens(int max_tokens);

  // Overrides the sampling temperature. Zero keeps generation greedy.
  void setTemperature(float temperature);

  // Text decoded so far for the current run, for a UI that polls rather than
  // subscribing.
  std::string currentText() const;

  // One sampled token from the logits. Exposed for tests: a tokenizer and a
  // sampler can be checked without a real model file.
  static int32_t sampleToken(const float* logits, size_t count, float temperature, uint32_t* state);

  // Softmax denominator and the value it divides, so the sampler's maths can be
  // checked on its own.
  static void softmax(float* values, size_t count);

 private:
  Config config_;
  std::unique_ptr<Model> model_;
  Tokenizer tokenizer_;
  KVCache cache_;
  MemoryPool pool_;
  const KernelBackend* backend_ = nullptr;

  mutable std::mutex mutex_;
  std::atomic<bool> cancelled_{false};

  mutable std::mutex text_mutex_;
  std::string current_text_;

  GenerationStats stats_;

  // One forward pass over [tokens], writing the logits for the last position
  // into [logits]. Returns false when the pool cannot serve the activation
  // buffers, which is the only recoverable failure.
  bool forward(const std::vector<int32_t>& tokens, std::vector<float>* logits);

  // Embedding lookup for [token] into [out].
  void embed(int32_t token, float* out) const;

  // Applies the output head to [hidden] and writes [vocab_size] logits.
  void project(const float* hidden, float* logits);

  // Fills [stats_] from the run timings.
  void finishStats(double prefill_ms, double decode_ms, uint64_t generated);

  // Takes ownership of a loaded model and rebuilds the tokenizer and cache for
  // it. Shared by both load paths so they cannot diverge.
  bool adoptModel(std::unique_ptr<Model> model);
};

}  // namespace freehands

#endif  // FREEHANDS_LITERT_ENGINE_H
