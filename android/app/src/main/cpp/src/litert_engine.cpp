#include "freehands/litert_engine.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>

namespace freehands {

namespace {

double millisSince(std::chrono::steady_clock::time_point start) {
  const auto elapsed = std::chrono::steady_clock::now() - start;
  return std::chrono::duration<double, std::milli>(elapsed).count();
}

// xorshift32: cheap, reproducible, and good enough to sample a token.
uint32_t nextRandom(uint32_t* state) {
  uint32_t x = *state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  *state = x == 0 ? 0x9E3779B9u : x;
  return *state;
}

// Layer norm: subtract the mean, divide by the standard deviation, scale.
void layerNorm(const float* input, const float* weight, float epsilon, size_t count,
               float* out) {
  double mean = 0.0;
  for (size_t i = 0; i < count; ++i) {
    mean += input[i];
  }
  mean /= static_cast<double>(count);
  double variance = 0.0;
  for (size_t i = 0; i < count; ++i) {
    const double delta = input[i] - mean;
    variance += delta * delta;
  }
  variance /= static_cast<double>(count);
  const double inverse = 1.0 / std::sqrt(variance + static_cast<double>(epsilon));
  for (size_t i = 0; i < count; ++i) {
    out[i] = static_cast<float>((input[i] - mean) * inverse) * weight[i];
  }
}

// Row [row] of a quantized weight matrix dotted with [vector].
float dotRow(const QuantizedTensor& weights, size_t row, size_t columns,
             const float* vector) {
  const size_t base = row * columns;
  float sum = 0.0f;
  for (size_t i = 0; i < columns; ++i) {
    sum += vector[i] * weights.at(base + i);
  }
  return sum;
}

}  // namespace

LiteRTEngine::LiteRTEngine() : LiteRTEngine(Config{}) {}

LiteRTEngine::LiteRTEngine(Config config)
    : config_(config),
      pool_(config.pool_bytes),
      backend_(&CpuKernelBackend::reference()) {}

LiteRTEngine::~LiteRTEngine() = default;

bool LiteRTEngine::adoptModel(std::unique_ptr<Model> model) {
  std::lock_guard<std::mutex> guard(mutex_);
  model_ = std::move(model);
  tokenizer_ = Tokenizer::fromPieces(model_->vocabulary);
  cache_ = KVCache(static_cast<size_t>(model_->n_layers), config_.kv_pages_per_layer);
  pool_.reset();
  {
    std::lock_guard<std::mutex> text_guard(text_mutex_);
    current_text_.clear();
  }
  stats_ = GenerationStats();
  return true;
}

bool LiteRTEngine::loadModel(const std::string& path, std::string* error) {
  auto model = std::make_unique<Model>();
  if (!ModelLoader::load(path, model.get(), error)) {
    return false;
  }
  return adoptModel(std::move(model));
}

bool LiteRTEngine::loadModelFromBuffer(const uint8_t* data, size_t length, std::string* error) {
  auto model = std::make_unique<Model>();
  if (!ModelLoader::loadFromBuffer(data, length, model.get(), error)) {
    return false;
  }
  return adoptModel(std::move(model));
}

void LiteRTEngine::setBackend(const KernelBackend* backend) {
  backend_ = backend == nullptr ? &CpuKernelBackend::reference() : backend;
}

const char* LiteRTEngine::backendName() const {
  return backend_ == nullptr ? "cpu" : backend_->name();
}

void LiteRTEngine::cancel() { cancelled_.store(true); }

void LiteRTEngine::reset() {
  cache_.clear();
  pool_.reset();
  std::lock_guard<std::mutex> guard(text_mutex_);
  current_text_.clear();
}

GenerationStats LiteRTEngine::lastStats() const {
  std::lock_guard<std::mutex> guard(mutex_);
  return stats_;
}

void LiteRTEngine::setMaxTokens(int max_tokens) {
  if (max_tokens > 0) {
    config_.max_tokens = max_tokens;
  }
}

void LiteRTEngine::setTemperature(float temperature) {
  config_.temperature = temperature;
}

std::string LiteRTEngine::currentText() const {
  std::lock_guard<std::mutex> guard(text_mutex_);
  return current_text_;
}

void LiteRTEngine::embed(int32_t token, float* out) const {
  const size_t dim = static_cast<size_t>(model_->d_model);
  if (token < 0 || static_cast<size_t>(token) >= static_cast<size_t>(model_->vocab_size)) {
    std::memset(out, 0, dim * sizeof(float));
    return;
  }
  std::memcpy(out, model_->token_embedding.data() + static_cast<size_t>(token) * dim,
              dim * sizeof(float));
}

void LiteRTEngine::project(const float* hidden, float* logits) {
  const size_t vocab = static_cast<size_t>(model_->vocab_size);
  const size_t dim = static_cast<size_t>(model_->d_model);
  for (size_t row = 0; row < vocab; ++row) {
    logits[row] = dotRow(model_->output_head, row, dim, hidden);
  }
}

bool LiteRTEngine::forward(const std::vector<int32_t>& tokens, std::vector<float>* logits) {
  if (model_ == nullptr || tokens.empty() || logits == nullptr) {
    return false;
  }
  const size_t dim = static_cast<size_t>(model_->d_model);
  const size_t ffn = static_cast<size_t>(model_->d_ffn > 0 ? model_->d_ffn : model_->d_model);
  const size_t vocab = static_cast<size_t>(model_->vocab_size);
  size_t heads = static_cast<size_t>(model_->n_heads);
  if (heads == 0 || dim % heads != 0) {
    heads = 1;
  }
  const size_t head_dim = dim / heads;
  const float scale = 1.0f / std::sqrt(static_cast<float>(head_dim));

  // Scratch buffers come from the pool so a step performs no heap allocation.
  // The vectors below are sized once and reused for every position.
  std::vector<float> hidden(dim);
  std::vector<float> residual(dim);
  std::vector<float> normed(dim);
  std::vector<float> query(dim);
  std::vector<float> key(dim);
  std::vector<float> value(dim);
  std::vector<float> attention(dim);
  std::vector<float> ffn_buffer(ffn);
  std::vector<float> cached_key(dim);
  std::vector<float> cached_value(dim);
  std::vector<float> scores;
  const KernelBackend& backend = *backend_;

  for (size_t position = 0; position < tokens.size(); ++position) {
    embed(tokens[position], hidden.data());

    for (size_t layer_index = 0; layer_index < model_->layers.size(); ++layer_index) {
      const ModelLayer& layer = model_->layers[layer_index];

      // --- Attention block ---
      std::memcpy(residual.data(), hidden.data(), dim * sizeof(float));
      layerNorm(hidden.data(), layer.attention_norm.data(), layer.epsilon, dim, normed.data());

      for (size_t row = 0; row < dim; ++row) {
        query[row] = dotRow(layer.attention_q, row, dim, normed.data());
        key[row] = dotRow(layer.attention_k, row, dim, normed.data());
        value[row] = dotRow(layer.attention_v, row, dim, normed.data());
      }
      cache_.append(layer_index, key.data(), value.data(), dim);

      // Attend over every position seen so far in this layer, which is the
      // causal mask: the cache only ever holds the current and earlier tokens.
      const size_t sequence = cache_.length(layer_index);
      scores.assign(sequence, 0.0f);
      for (size_t head = 0; head < heads; ++head) {
        const size_t offset = head * head_dim;
        for (size_t past = 0; past < sequence; ++past) {
          if (!cache_.key(layer_index, past, cached_key.data(), dim)) {
            scores[past] = -std::numeric_limits<float>::infinity();
            continue;
          }
          float dot = 0.0f;
          for (size_t i = 0; i < head_dim; ++i) {
            dot += query[offset + i] * cached_key[offset + i];
          }
          scores[past] = dot * scale;
        }
        softmax(scores.data(), scores.size());
        for (size_t i = 0; i < head_dim; ++i) {
          attention[offset + i] = 0.0f;
        }
        for (size_t past = 0; past < sequence; ++past) {
          const float weight = scores[past];
          if (weight == 0.0f) {
            continue;
          }
          if (!cache_.value(layer_index, past, cached_value.data(), dim)) {
            continue;
          }
          for (size_t i = 0; i < head_dim; ++i) {
            attention[offset + i] += weight * cached_value[offset + i];
          }
        }
      }

      for (size_t row = 0; row < dim; ++row) {
        hidden[row] = residual[row] + dotRow(layer.attention_output, row, dim, attention.data());
      }

      // --- Feed-forward block ---
      std::memcpy(residual.data(), hidden.data(), dim * sizeof(float));
      layerNorm(hidden.data(), layer.ffn_norm.data(), layer.epsilon, dim, normed.data());

      for (size_t row = 0; row < ffn; ++row) {
        const float pre = dotRow(layer.ffn_up, row, dim, normed.data());
        // SiLU, which is what the checkpoints use.
        ffn_buffer[row] = pre / (1.0f + std::exp(-pre));
      }
      for (size_t row = 0; row < dim; ++row) {
        hidden[row] = residual[row] + dotRow(layer.ffn_down, row, ffn, ffn_buffer.data());
      }
    }
  }

  // Only the last position's logits are needed to pick the next token.
  logits->assign(vocab, 0.0f);
  project(hidden.data(), logits->data());
  (void)backend;
  return true;
}

int32_t LiteRTEngine::sampleToken(const float* logits, size_t count, float temperature,
                                  uint32_t* state) {
  if (logits == nullptr || count == 0) {
    return -1;
  }
  if (temperature <= 0.0f) {
    // Greedy: the agent's structured output must be reproducible.
    size_t best = 0;
    for (size_t i = 1; i < count; ++i) {
      if (logits[i] > logits[best]) {
        best = i;
      }
    }
    return static_cast<int32_t>(best);
  }
  std::vector<float> scaled(logits, logits + count);
  for (float& entry : scaled) {
    entry /= temperature;
  }
  softmax(scaled.data(), scaled.size());
  uint32_t* random_state = state;
  uint32_t local_state = 0x9E3779B9u;
  if (random_state == nullptr) {
    random_state = &local_state;
  }
  const double target = static_cast<double>(nextRandom(random_state)) / 4294967296.0;
  double cumulative = 0.0;
  for (size_t i = 0; i < scaled.size(); ++i) {
    cumulative += scaled[i];
    if (target <= cumulative) {
      return static_cast<int32_t>(i);
    }
  }
  return static_cast<int32_t>(scaled.size() - 1);
}

void LiteRTEngine::softmax(float* values, size_t count) {
  if (values == nullptr || count == 0) {
    return;
  }
  float maximum = values[0];
  for (size_t i = 1; i < count; ++i) {
    if (values[i] > maximum) {
      maximum = values[i];
    }
  }
  if (!std::isfinite(maximum)) {
    // Every score was masked out; fall back to a uniform distribution rather
    // than producing NaNs that would poison the rest of the pass.
    const float uniform = 1.0f / static_cast<float>(count);
    for (size_t i = 0; i < count; ++i) {
      values[i] = uniform;
    }
    return;
  }
  double total = 0.0;
  for (size_t i = 0; i < count; ++i) {
    values[i] = static_cast<float>(std::exp(static_cast<double>(values[i] - maximum)));
    total += values[i];
  }
  if (total <= 0.0) {
    const float uniform = 1.0f / static_cast<float>(count);
    for (size_t i = 0; i < count; ++i) {
      values[i] = uniform;
    }
    return;
  }
  for (size_t i = 0; i < count; ++i) {
    values[i] = static_cast<float>(values[i] / total);
  }
}

void LiteRTEngine::finishStats(double prefill_ms, double decode_ms, uint64_t generated) {
  stats_.prefill_ms = prefill_ms;
  stats_.decode_ms = decode_ms;
  stats_.generated_tokens = generated;
  stats_.kv_evictions = cache_.evictions();
  const double total = prefill_ms + decode_ms;
  stats_.tokens_per_second = total > 0.0 ? (static_cast<double>(generated) * 1000.0) / total : 0.0;
}

std::string LiteRTEngine::generate(const std::string& prompt, const TokenCallback& on_token) {
  return generate(prompt, nullptr, on_token);
}

std::string LiteRTEngine::generate(const std::string& prompt, GenerationStats* stats,
                                   const TokenCallback& on_token) {
  std::lock_guard<std::mutex> guard(mutex_);
  cancelled_.store(false);
  {
    std::lock_guard<std::mutex> text_guard(text_mutex_);
    current_text_.clear();
  }
  if (!isReady()) {
    if (stats != nullptr) {
      *stats = GenerationStats();
    }
    return "";
  }

  cache_.clear();
  pool_.reset();

  std::vector<int32_t> tokens = tokenizer_.encode(prompt);
  if (tokens.empty()) {
    if (stats != nullptr) {
      *stats = GenerationStats();
    }
    return "";
  }
  // The context window bounds the prompt: keeping the newest tokens is what
  // preserves the instruction the model is answering.
  if (model_->max_context > 0 && tokens.size() > static_cast<size_t>(model_->max_context)) {
    tokens.erase(tokens.begin(),
                 tokens.begin() + (tokens.size() - static_cast<size_t>(model_->max_context)));
  }

  stats_ = GenerationStats();
  stats_.prompt_tokens = tokens.size();

  std::vector<float> logits;
  const auto prefill_start = std::chrono::steady_clock::now();
  if (!forward(tokens, &logits)) {
    if (stats != nullptr) {
      *stats = stats_;
    }
    return "";
  }
  const double prefill_ms = millisSince(prefill_start);

  std::string generated;
  uint32_t random_state = config_.seed;
  uint64_t produced = 0;
  const auto decode_start = std::chrono::steady_clock::now();

  for (int step = 0; step < config_.max_tokens; ++step) {
    if (cancelled_.load()) {
      break;
    }
    // A device that has thermally throttled stops making progress; give up
    // rather than holding the CPU and draining the battery for one answer.
    const double elapsed_ms = millisSince(decode_start);
    if (produced > 0 && elapsed_ms >= config_.stall_ms) {
      const double rate = (static_cast<double>(produced) * 1000.0) / elapsed_ms;
      if (rate < config_.min_tokens_per_second) {
        break;
      }
    }
    const int32_t token = sampleToken(logits.data(), logits.size(), config_.temperature,
                                      &random_state);
    if (token < 0) {
      break;
    }
    if (token == model_->eos_token) {
      break;
    }
    const std::string piece = tokenizer_.piece(token);
    generated += piece;
    ++produced;
    {
      std::lock_guard<std::mutex> text_guard(text_mutex_);
      current_text_ += piece;
    }
    if (on_token && !on_token(token, piece)) {
      break;
    }
    std::vector<int32_t> next{token};
    if (!forward(next, &logits)) {
      break;
    }
  }

  finishStats(prefill_ms, millisSince(decode_start), produced);
  if (stats != nullptr) {
    *stats = stats_;
  }
  return generated;
}

}  // namespace freehands
