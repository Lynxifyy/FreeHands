#include "freehands/model.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>

namespace freehands {

namespace {

// Pulls a string field, tolerating a missing key.
std::string stringField(const std::string& json, const std::string& key,
                        const std::string& fallback) {
  const std::string needle = "\"" + key + "\"";
  const size_t at = json.find(needle);
  if (at == std::string::npos) {
    return fallback;
  }
  const size_t colon = json.find(':', at + needle.size());
  if (colon == std::string::npos) {
    return fallback;
  }
  const size_t first_quote = json.find('"', colon);
  if (first_quote == std::string::npos) {
    return fallback;
  }
  const size_t second_quote = json.find('"', first_quote + 1);
  if (second_quote == std::string::npos) {
    return fallback;
  }
  return json.substr(first_quote + 1, second_quote - first_quote - 1);
}

// Pulls an integer field, tolerating a missing key.
long long intField(const std::string& json, const std::string& key, long long fallback) {
  const std::string needle = "\"" + key + "\"";
  const size_t at = json.find(needle);
  if (at == std::string::npos) {
    return fallback;
  }
  const size_t colon = json.find(':', at + needle.size());
  if (colon == std::string::npos) {
    return fallback;
  }
  return std::strtoll(json.c_str() + colon + 1, nullptr, 10);
}

Quantization parsePrecision(const std::string& raw) {
  if (raw == "q4" || raw == "4" || raw == "int4") {
    return Quantization::Q4;
  }
  if (raw == "q8" || raw == "8" || raw == "int8") {
    return Quantization::Q8;
  }
  return Quantization::F32;
}

size_t storedBytes(Quantization precision, size_t count) {
  switch (precision) {
    case Quantization::Q4:
      return (count + 1) / 2;
    case Quantization::Q8:
      return count;
    case Quantization::F32:
      return count * sizeof(float);
  }
  return count * sizeof(float);
}

}  // namespace

size_t Model::weightBytes() const {
  size_t total = token_embedding.size() * sizeof(float);
  for (const ModelLayer& layer : layers) {
    total += layer.attention_q.bytes();
    total += layer.attention_k.bytes();
    total += layer.attention_v.bytes();
    total += layer.attention_output.bytes();
    total += layer.ffn_up.bytes();
    total += layer.ffn_down.bytes();
    total += layer.attention_norm.size() * sizeof(float);
    total += layer.ffn_norm.size() * sizeof(float);
  }
  total += output_head.bytes();
  return total;
}

bool ModelLoader::load(const std::string& path, Model* model, std::string* error) {
  if (model == nullptr) {
    if (error != nullptr) {
      *error = "no model destination";
    }
    return false;
  }
  FILE* file = std::fopen(path.c_str(), "rb");
  if (file == nullptr) {
    if (error != nullptr) {
      *error = "model file not found: " + path;
    }
    return false;
  }
  std::fseek(file, 0, SEEK_END);
  const long size = std::ftell(file);
  std::fseek(file, 0, SEEK_SET);
  if (size <= 0) {
    std::fclose(file);
    if (error != nullptr) {
      *error = "model file is empty";
    }
    return false;
  }
  std::vector<uint8_t> buffer(static_cast<size_t>(size));
  const size_t read = std::fread(buffer.data(), 1, buffer.size(), file);
  std::fclose(file);
  if (read != buffer.size()) {
    if (error != nullptr) {
      *error = "model file could not be read in full";
    }
    return false;
  }
  return loadFromBuffer(buffer.data(), buffer.size(), model, error);
}

bool ModelLoader::loadFromBuffer(const uint8_t* data, size_t length, Model* model,
                                 std::string* error) {
  const auto fail = [error](const std::string& message) {
    if (error != nullptr) {
      *error = message;
    }
    return false;
  };
  if (model == nullptr || data == nullptr) {
    return fail("no model destination");
  }
  if (length < kHeaderBytes) {
    return fail("model file is too short to hold a header");
  }
  if (std::memcmp(data, kMagic, 8) != 0) {
    return fail("model file has an unrecognised signature");
  }
  uint32_t version = 0;
  uint32_t header_length = 0;
  std::memcpy(&version, data + 8, sizeof(version));
  std::memcpy(&header_length, data + 12, sizeof(header_length));
  if (version != kVersion) {
    return fail("model file was written for a different engine version");
  }
  if (header_length == 0 || kHeaderBytes + header_length > length) {
    return fail("model header length is inconsistent with the file");
  }
  const std::string header(reinterpret_cast<const char*>(data + kHeaderBytes), header_length);

  auto loaded = std::make_unique<Model>();
  loaded->name = stringField(header, "name", "freehands");
  loaded->d_model = static_cast<int>(intField(header, "d_model", 0));
  loaded->d_ffn = static_cast<int>(intField(header, "d_ffn", 0));
  loaded->n_layers = static_cast<int>(intField(header, "n_layers", 0));
  loaded->n_heads = static_cast<int>(intField(header, "n_heads", 1));
  loaded->vocab_size = static_cast<int>(intField(header, "vocab_size", 0));
  loaded->max_context = static_cast<int>(intField(header, "max_context", 0));
  loaded->eos_token = static_cast<int32_t>(intField(header, "eos_token", -1));
  loaded->bos_token = static_cast<int32_t>(intField(header, "bos_token", -1));
  loaded->weight_precision = parsePrecision(stringField(header, "precision", "f32"));

  if (loaded->d_model <= 0 || loaded->vocab_size <= 0 || loaded->n_layers <= 0) {
    return fail("model header is missing its dimensions");
  }

  // The tensors follow the header in a fixed order; each is sized from the
  // dimensions, so a truncated file is detected by the cursor running out.
  size_t cursor = kHeaderBytes + header_length;
  const auto take = [&](size_t bytes, const uint8_t** out) -> bool {
    if (cursor + bytes > length) {
      return false;
    }
    *out = data + cursor;
    cursor += bytes;
    return true;
  };

  const auto takeFloatVector = [&](size_t count, std::vector<float>* out) -> bool {
    const uint8_t* raw = nullptr;
    if (!take(count * sizeof(float), &raw)) {
      return false;
    }
    out->resize(count);
    std::memcpy(out->data(), raw, count * sizeof(float));
    return true;
  };

  const auto takeTensor = [&](size_t count, QuantizedTensor* out) -> bool {
    const uint8_t* raw = nullptr;
    const size_t bytes = storedBytes(loaded->weight_precision, count);
    if (!take(bytes, &raw)) {
      return false;
    }
    // Scales and zero points are stored as floats after the data, one pair per
    // block, which keeps the loader from having to requantize.
    const size_t blocks = (count + QuantizedTensor::kBlockSize - 1) /
                          QuantizedTensor::kBlockSize;
    std::vector<float> scales(blocks, 1.0f);
    std::vector<float> zero_points(blocks, 0.0f);
    if (loaded->weight_precision != Quantization::F32) {
      if (!takeFloatVector(blocks, &scales) || !takeFloatVector(blocks, &zero_points)) {
        return false;
      }
    }
    *out = QuantizedTensor::fromQuantized(
        std::vector<uint8_t>(raw, raw + bytes), std::move(scales),
        std::move(zero_points), count, loaded->weight_precision);
    return true;
  };

  const size_t vocab = static_cast<size_t>(loaded->vocab_size);
  const size_t model_dim = static_cast<size_t>(loaded->d_model);
  const size_t ffn_dim = static_cast<size_t>(loaded->d_ffn > 0 ? loaded->d_ffn : loaded->d_model);

  // Vocabulary: one entry per id, each a uint16 length followed by the bytes.
  // Length-prefixing rather than newline-delimiting lets a piece contain any
  // byte, which a byte-fallback vocabulary needs.
  loaded->vocabulary.resize(vocab);
  for (size_t id = 0; id < vocab; ++id) {
    const uint8_t* raw = nullptr;
    if (!take(sizeof(uint16_t), &raw)) {
      return fail("model vocabulary is truncated");
    }
    uint16_t piece_length = 0;
    std::memcpy(&piece_length, raw, sizeof(piece_length));
    if (!take(piece_length, &raw)) {
      return fail("model vocabulary piece is truncated");
    }
    loaded->vocabulary[id] = std::string(reinterpret_cast<const char*>(raw), piece_length);
  }

  if (!takeFloatVector(vocab * model_dim, &loaded->token_embedding)) {
    return fail("model embedding table is truncated");
  }

  loaded->layers.resize(static_cast<size_t>(loaded->n_layers));
  for (ModelLayer& layer : loaded->layers) {
    const bool ok =
        takeTensor(model_dim * model_dim, &layer.attention_q) &&
        takeTensor(model_dim * model_dim, &layer.attention_k) &&
        takeTensor(model_dim * model_dim, &layer.attention_v) &&
        takeTensor(model_dim * model_dim, &layer.attention_output) &&
        takeTensor(model_dim * ffn_dim, &layer.ffn_up) &&
        takeTensor(ffn_dim * model_dim, &layer.ffn_down) &&
        takeFloatVector(model_dim, &layer.attention_norm) &&
        takeFloatVector(model_dim, &layer.ffn_norm);
    if (!ok) {
      return fail("model layer weights are truncated");
    }
    layer.epsilon = 1e-5f;
  }

  if (!takeTensor(vocab * model_dim, &loaded->output_head)) {
    return fail("model output head is truncated");
  }

  if (!loaded->valid()) {
    return fail("model weights do not match the declared dimensions");
  }

  *model = std::move(*loaded);
  if (error != nullptr) {
    error->clear();
  }
  return true;
}

}  // namespace freehands
